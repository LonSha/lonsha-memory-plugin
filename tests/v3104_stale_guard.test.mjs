// tests/v3104_stale_guard.test.mjs
// v3.104 缝合 bionic-memory（BME）domain/memory-changeset.js + memory-ledger.js：
// 陈旧写入防护（读集校验 + 状态指纹 + 幂等重放）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'stale-guard.js'), 'utf8');
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
    src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaStaleGuard;');
const SG = load(sbox, sbox.module, undefined);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.104.0'), `index.js 版本 ${v} < 3.104.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.104.0'), `manifest 版本 ${manifest.version} < 3.104.0`);
    assert.ok(manifest.extra_js.includes('stale-guard.js'), 'stale-guard.js 已注册 extra_js');
    ok('版本 / manifest 注册');
});

// ---------- 1. 稳定序列化 / 指纹 ----------
test('【1】stableStringify 键序无关 + 指纹确定性', () => {
    assert.strictEqual(SG.stableStringify({ b: 1, a: 2 }), SG.stableStringify({ a: 2, b: 1 }));
    assert.strictEqual(SG.stableStringify({ a: undefined, b: 1 }), '{"b":1}');
    assert.strictEqual(SG.stableStringify([1, { b: 2, a: 1 }]), '[1,{"a":1,"b":2}]');
    assert.strictEqual(SG.payloadFingerprint({ x: 1, y: 2 }), SG.payloadFingerprint({ y: 2, x: 1 }));
    assert.notStrictEqual(SG.payloadFingerprint({ x: 1 }), SG.payloadFingerprint({ x: 2 }));
    assert.match(SG.fnv1a('abc'), /^[0-9a-f]{8}$/);
    ok('键序无关指纹 / 同语义同哈希');
});

// ---------- 2. 状态指纹 pick ----------
test('【2】computeStateFingerprint 支持字段筛选', () => {
    const a = { nodes: [1, 2], edges: [3], updatedAt: 111 };
    const b = { nodes: [1, 2], edges: [3], updatedAt: 999 };
    assert.notStrictEqual(SG.computeStateFingerprint(a), SG.computeStateFingerprint(b), '全量指纹对 updatedAt 敏感');
    assert.strictEqual(
        SG.computeStateFingerprint(a, ['nodes', 'edges']),
        SG.computeStateFingerprint(b, ['nodes', 'edges']),
        'pick 后不受 updatedAt 影响');
    ok('全量敏感 / pick 过滤噪声字段');
});

// ---------- 3. 变更集构造与校验 ----------
test('【3】createChangeSet 校验与默认 id/幂等键', () => {
    assert.throws(() => SG.createChangeSet({ baseRevision: 1, operations: [{}] }), /chatId/);
    assert.throws(() => SG.createChangeSet({ chatId: 'c', baseRevision: -1, operations: [{}] }), /non-negative/);
    assert.throws(() => SG.createChangeSet({ chatId: 'c', baseRevision: 0, operations: [] }), /operations/);
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 3,
        operations: [{ type: 'add', target: 'm1' }],
        readIds: ['m0', 'm0', ''],
    });
    assert.match(cs.id, /^cs_[0-9a-f]{8}$/);
    assert.strictEqual(cs.idempotencyKey, 'change-set:' + cs.id);
    assert.deepStrictEqual(cs.readIds, ['m0'], '读集去重去空');
    ok('构造校验 / id 与幂等键派生 / 读集归一');
});

// ---------- 4. 正常提交 ----------
test('【4】依据齐全且修订一致 → commit', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 5,
        operations: [{ type: 'add', target: 'm1' }],
        readIds: ['m0'],
    });
    const plan = SG.planCommit(cs, {
        chatId: 'c1', revision: 5,
        availableIds: new Set(['m0', 'm1']),
        stateFingerprint: 'aaaa1111',
    });
    assert.strictEqual(plan.action, 'commit');
    assert.strictEqual(plan.kind, 'ok');
    assert.strictEqual(plan.rebased, false);
    ok('action=commit，无变基');
});

// ---------- 5. 读集陈旧 ----------
test('【5】读集记录已消失 → stale', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 5,
        operations: [{ type: 'add', target: 'm1' }],
        readIds: ['m0', 'gone'],
    });
    const plan = SG.planCommit(cs, {
        chatId: 'c1', revision: 5,
        availableIds: new Set(['m0', 'm1']),
    });
    assert.strictEqual(plan.action, 'reject');
    assert.strictEqual(plan.kind, 'stale');
    assert.ok(plan.validation.issues.some(i => i === 'missing-read:gone'));
    assert.match(plan.summary, /陈旧/);
    ok('missing-read 判定为 stale（应重读重试）');
});

// ---------- 6. 状态指纹陈旧 ----------
test('【6】base 落后 + 指纹不符 → stale：state-changed', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 3,
        operations: [{ type: 'add', target: 'm1' }],
        readStateFingerprint: 'old12345',
    });
    const plan = SG.planCommit(cs, {
        chatId: 'c1', revision: 7,
        availableIds: new Set(['m1']),
        stateFingerprint: 'new67890',
    });
    assert.strictEqual(plan.kind, 'stale');
    assert.ok(plan.validation.issues.includes('state-changed'));
    ok('指纹不符 → state-changed（stale）');
});

// ---------- 7. base 落后但指纹一致 → rebase ----------
test('【7】base 落后、指纹一致 → rebase 允许提交', () => {
    const fp = SG.computeStateFingerprint({ nodes: [1], edges: [] }, ['nodes', 'edges']);
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 3,
        operations: [{ type: 'add', target: 'm1' }],
        readStateFingerprint: fp,
    });
    const plan = SG.planCommit(cs, {
        chatId: 'c1', revision: 7,
        availableIds: new Set(['m1']),
        stateFingerprint: fp,
    });
    assert.strictEqual(plan.action, 'rebase');
    assert.strictEqual(plan.rebased, true);
    assert.strictEqual(plan.rebasedFrom, 3);
    assert.match(plan.summary, /变基/);
    ok('指纹一致 → 允许 rebase（不误杀并发窗口内的合法写）');
});

// ---------- 8. base 落后但未记指纹 ----------
test('【8】base 落后且未记指纹 → no-fingerprint（stale）', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 3,
        operations: [{ type: 'add', target: 'm1' }],
    });
    const plan = SG.planCommit(cs, { chatId: 'c1', revision: 7, availableIds: new Set(['m1']) });
    assert.strictEqual(plan.kind, 'stale');
    assert.ok(plan.validation.issues.includes('no-fingerprint'));
    ok('未记指纹即落后 → stale（不允许盲写）');
});

// ---------- 9. base 超前 → stale ----------
test('【9】baseRevision 超前于当前 → base-ahead（stale）', () => {
    const cs = SG.createChangeSet({ chatId: 'c1', baseRevision: 9, operations: [{ target: 'm1' }] });
    const plan = SG.planCommit(cs, { chatId: 'c1', revision: 2, availableIds: new Set(['m1']) });
    assert.strictEqual(plan.kind, 'stale');
    assert.ok(plan.validation.issues.includes('base-ahead'));
    ok('base-ahead 归入 stale');
});

// ---------- 10. 依据缺失 → invalid（非 stale） ----------
test('【10】外部依据缺失归入 invalid 而非 stale', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 2,
        operations: [{ type: 'add', target: 'm1' }],
        sourceRefs: ['evidence-gone'],
    });
    const plan = SG.planCommit(cs, { chatId: 'c1', revision: 2, availableIds: new Set(['m1']) });
    assert.strictEqual(plan.kind, 'invalid');
    assert.strictEqual(plan.action, 'reject');
    assert.ok(plan.validation.issues.includes('missing-ref:evidence-gone'));
    assert.match(plan.summary, /非法/);
    ok('missing-ref → invalid（直接拒绝，不重试）');
});

// ---------- 11. 跨 chat 与空操作 ----------
test('【11】跨 chat / 空操作判定', () => {
    const cs = SG.createChangeSet({ chatId: 'c1', baseRevision: 0, operations: [{ target: 'm1' }] });
    const cross = SG.planCommit(cs, { chatId: 'c2', revision: 0, availableIds: new Set(['m1']) });
    assert.strictEqual(cross.kind, 'invalid');
    assert.ok(cross.validation.issues.includes('another-chat'));
    const empty = SG.validateChangeSet({ chatId: 'c1', baseRevision: 0, operations: [] }, { chatId: 'c1', revision: 0 });
    assert.ok(empty.issues.includes('empty-operations'));
    ok('跨 chat / 空操作均 invalid');
});

// ---------- 12. 重复目标操作 ----------
test('【12】同一目标重复修改 → duplicate-operation', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 0,
        operations: [{ target: 'm1', v: 1 }, { target: 'm1', v: 2 }],
    });
    const plan = SG.planCommit(cs, { chatId: 'c1', revision: 0, availableIds: new Set(['m1']) });
    assert.strictEqual(plan.kind, 'invalid');
    assert.ok(plan.validation.issues.includes('duplicate-operation:m1'));
    // 不同目标不报
    const okCs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 0,
        operations: [{ target: 'm1', v: 1 }, { target: 'm2', v: 2 }],
    });
    const okPlan = SG.planCommit(okCs, { chatId: 'c1', revision: 0, availableIds: new Set(['m1', 'm2']) });
    assert.strictEqual(okPlan.kind, 'ok');
    ok('重复目标拦截 / 不同目标放行');
});

// ---------- 13. 幂等重放 ----------
test('【13】同幂等键同载荷 → replay（不重复落库）', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 1,
        idempotencyKey: 'fixed-key',
        operations: [{ target: 'm1' }],
    });
    const plan = SG.planCommit(cs, { chatId: 'c1', revision: 1, availableIds: new Set(['m1']) }, {
        existingCommit: { id: 'commit_1', idempotencyKey: 'fixed-key', payloadFingerprint: cs.payloadFingerprint, revision: 1 },
    });
    assert.strictEqual(plan.action, 'replay');
    assert.match(plan.summary, /重放/);
    ok('重放判定 / 摘要说明');
});

// ---------- 14. 幂等键复用冲突 ----------
test('【14】同幂等键不同载荷 → conflict 拒绝', () => {
    const cs = SG.createChangeSet({
        chatId: 'c1', baseRevision: 1,
        idempotencyKey: 'fixed-key',
        operations: [{ target: 'm1' }],
    });
    const plan = SG.planCommit(cs, { chatId: 'c1', revision: 1, availableIds: new Set(['m1']) }, {
        existingCommit: { id: 'commit_1', idempotencyKey: 'fixed-key', payloadFingerprint: 'deadbeef', revision: 1 },
    });
    assert.strictEqual(plan.action, 'reject');
    assert.strictEqual(plan.kind, 'conflict');
    assert.match(plan.summary, /幂等键复用但载荷不同/);
    ok('键复用冲突拒绝（防静默覆盖）');
});

// ---------- 15. classifyIssues / fingerprintDiff / summarize ----------
test('【15】分级、指纹并列与摘要', () => {
    const cls = SG.classifyIssues(['missing-read:x', 'missing-ref:y', 'state-changed']);
    assert.deepStrictEqual(cls.stale.sort(), ['missing-read:x', 'state-changed']);
    assert.deepStrictEqual(cls.invalid, ['missing-ref:y']);
    assert.strictEqual(cls.kind, 'stale');
    assert.strictEqual(SG.classifyIssues([]).kind, 'ok');
    assert.match(SG.fingerprintDiff('aa', 'aa'), /\(=\)$/);
    assert.match(SG.fingerprintDiff('aa', 'bb'), /≠/);
    const cs = SG.createChangeSet({ chatId: 'c1', baseRevision: 2, operations: [{ target: 'm1' }], readIds: ['m0'] });
    const s = SG.summarize(cs, { revision: 4 });
    assert.match(s, /变更集/);
    assert.match(s, /baseRevision: 2（当前 4）/);
    ok('stale/invalid 分级 / 指纹并列 / 摘要');
});

console.log(`[v3104] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;