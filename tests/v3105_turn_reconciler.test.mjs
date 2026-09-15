// tests/v3105_turn_reconciler.test.mjs
// v3.105 缝合 bionic-memory（BME）domain/history-reconciliation.js：
// 历史轮次对账引擎（位置无关身份 + 多级匹配认领）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'turn-reconciler.js'), 'utf8');
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

const sbox = { module: { exports: {} }, window: undefined };
const load = new Function('globalThis', 'module', 'window',
    src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaTurnReconciler;');
const TR = load(sbox, sbox.module, undefined);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const T = (u, a, extra) => Object.assign({ user: u, assistant: a }, extra || {});

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.105.0'), `index.js 版本 ${v} < 3.105.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.105.0'), `manifest 版本 ${manifest.version} < 3.105.0`);
    assert.ok(manifest.extra_js.includes('turn-reconciler.js'), 'turn-reconciler.js 已注册 extra_js');
    ok('版本 / manifest 注册');
});

// ---------- 1. 轮次归一 ----------
test('【1】normalizeTurn 字段兼容与空回复过滤', () => {
    const a = TR.normalizeTurn({ user: 'u1', assistant: 'a1' }, 0);
    assert.strictEqual(a.normalizedUserText, 'u1');
    assert.strictEqual(a.normalizedAssistantText, 'a1');
    const b = TR.normalizeTurn({ userText: 'u2', assistantText: 'a2', userFloor: '3', assistantFloor: 4.7 }, 1);
    assert.strictEqual(b.userFloor, 3);
    assert.strictEqual(b.assistantFloor, 4);
    assert.strictEqual(b.ordinal, 1);
    assert.strictEqual(TR.normalizeTurn({ user: 'u', assistant: '   ' }, 0), null, '空 AI 回复丢弃');
    assert.strictEqual(TR.normalizeTurn(null, 0), null);
    const c = TR.normalizeTurn({ user: 'u\r\n1', assistant: 'a' }, 0);
    assert.strictEqual(c.normalizedUserText, 'u\n1', 'CRLF 归一');
    ok('字段兼容 / 空回复过滤 / 数字归一 / 换行归一');
});

// ---------- 2. 内容指纹位置无关 ----------
test('【2】turnContentHash 只取决于文本', () => {
    const h1 = TR.turnContentHash(T('你好', '回应'));
    const h2 = TR.turnContentHash(T('你好', '回应', { assistantFloor: 88, hostTurnKey: 'x' }));
    assert.strictEqual(h1, h2, '楼层/键位不影响内容指纹');
    assert.notStrictEqual(h1, TR.turnContentHash(T('你好', '另一种回应')));
    assert.match(h1, /^[0-9a-f]{8}$/);
    ok('内容指纹位置无关 / 内容变化变指纹');
});

// ---------- 3. 新增轮次获得确定性派生 id ----------
test('【3】无既有记录时按内容派生稳定 id', () => {
    const turns = [T('甲', '乙'), T('丙', '丁')];
    const r1 = TR.assignTurnIds(turns, [], { chatId: 'c1' });
    const r2 = TR.assignTurnIds(turns, [], { chatId: 'c1' });
    assert.strictEqual(r1.unmatched, 2);
    assert.deepStrictEqual(r1.assigned.map(t => t.turnId), r2.assigned.map(t => t.turnId), '同输入同 id');
    assert.match(r1.assigned[0].turnId, /^turn_[0-9a-f]{8}$/);
    assert.notStrictEqual(r1.assigned[0].turnId, r1.assigned[1].turnId);
    ok('派生 id 确定性 / 互不相同');
});

// ---------- 4. turnId 直配 ----------
test('【4】turnId 优先匹配（matchBy=turnId）', () => {
    const r = TR.assignTurnIds([T('甲', '乙', { turnId: 'turn_x' })], [{ id: 'rec1', turnId: 'turn_x' }]);
    assert.strictEqual(r.assigned[0].matchedId, 'rec1');
    assert.strictEqual(r.assigned[0].matchBy, 'turnId');
    assert.strictEqual(r.claimedIds.length, 1);
    ok('turnId 直配 / 认领成功');
});

// ---------- 5. contentHash 降级匹配（位置挪了仍认出） ----------
test('【5】位置变化后靠 contentHash 认出同一轮', () => {
    const existing = [{ id: 'rec_old', contentHash: TR.turnContentHash(T('甲', '乙')) }];
    const turns = [T('新', '轮'), T('甲', '乙', { assistantFloor: 7 })];
    const r = TR.assignTurnIds(turns, existing);
    assert.strictEqual(r.assigned[1].matchedId, 'rec_old', '第二轮回溯认领既有记录');
    assert.strictEqual(r.assigned[1].matchBy, 'contentHash');
    assert.strictEqual(r.assigned[0].matchedId, '', '新轮次未被误认领');
    ok('内容级匹配 / 位置无关身份');
});

// ---------- 6. hostTurnKey / logicalSlotKey 匹配 ----------
test('【6】hostTurnKey 与 logicalSlotKey 匹配', () => {
    const existing = [
        { id: 'r1', metadata: { hostTurnKey: 'h1' } },
        { id: 'r2', metadata: { logicalSlotKey: 's2' } },
    ];
    const turns = [T('a', 'b', { hostTurnKey: 'h1' }), T('c', 'd', { logicalSlotKey: 's2' })];
    const r = TR.assignTurnIds(turns, existing);
    assert.strictEqual(r.assigned[0].matchedId, 'r1');
    assert.strictEqual(r.assigned[0].matchBy, 'hostTurnKey');
    assert.strictEqual(r.assigned[1].matchedId, 'r2');
    assert.strictEqual(r.assigned[1].matchBy, 'logicalSlotKey');
    ok('hostTurnKey / logicalSlotKey 双键匹配');
});

// ---------- 7. 认领不可复用 ----------
test('【7】一条既有记录只能被认领一次', () => {
    const hash = TR.turnContentHash(T('同一句', '同回应'));
    const existing = [{ id: 'only', contentHash: hash }];
    const turns = [T('同一句', '同回应'), T('同一句', '同回应', { assistantFloor: 9 })];
    const r = TR.assignTurnIds(turns, existing);
    assert.strictEqual(r.assigned[0].matchedId, 'only');
    assert.strictEqual(r.assigned[1].matchedId, '', '第二次不再复用同一记录');
    assert.notStrictEqual(r.assigned[0].turnId, r.assigned[1].turnId, 'occurrence 参与派生 → id 不同');
    assert.strictEqual(r.assigned[1].occurrence, 2);
    assert.strictEqual(r.duplicateUsers, 1);
    ok('认领去重 / 重复文本 occurrence 递增 / id 分离');
});

// ---------- 8. 集合差异纯函数 ----------
test('【8】diffTurnSets 三分', () => {
    const d = TR.diffTurnSets(['a', 'b', 'c'], ['b', 'c', 'd']);
    assert.deepStrictEqual(d.admitted, ['a']);
    assert.deepStrictEqual(d.invalidated, ['d']);
    assert.deepStrictEqual(d.unchanged.sort(), ['b', 'c']);
    assert.strictEqual(d.changed, true);
    const same = TR.diffTurnSets(['a'], ['a']);
    assert.strictEqual(same.changed, false);
    ok('新增 / 失效 / 不变 / changed 标记');
});

// ---------- 9. planReconciliation 不变场景 ----------
test('【9】完全一致 → changed=false，无记录', () => {
    const t = T('甲', '乙');
    const hash = TR.turnContentHash(t);
    const existing = [{ id: 'rec1', contentHash: hash }];
    const plan = TR.planReconciliation({ turns: [t], existing, activeIds: ['rec1'], chatId: 'c1' });
    assert.strictEqual(plan.changed, false);
    assert.deepStrictEqual(plan.records, []);
    assert.match(plan.summary, /不变 1/);
    ok('一致场景零变更 / 摘要可读');
});

// ---------- 10. 新增轮次 → admit ----------
test('【10】新轮次产出 admit 记录', () => {
    const plan = TR.planReconciliation({
        turns: [T('甲', '乙')], existing: [], activeIds: [], chatId: 'c1',
    });
    assert.strictEqual(plan.changed, true);
    assert.strictEqual(plan.records.length, 1);
    assert.strictEqual(plan.records[0].op, 'admit');
    assert.match(plan.records[0].turnId, /^turn_/);
    assert.strictEqual(plan.diff.admitted.length, 1);
    ok('新轮次 admit / diff.admitted 计数');
});

// ---------- 11. 失活记录复活 → activate ----------
test('【11】既有记录失活后重新出现 → activate（不新建）', () => {
    const t = T('甲', '乙');
    const existing = [{ id: 'rec1', contentHash: TR.turnContentHash(t) }];
    const plan = TR.planReconciliation({ turns: [t], existing, activeIds: [], chatId: 'c1' });
    assert.deepStrictEqual(plan.records.map(r => r.op), ['activate']);
    assert.strictEqual(plan.records[0].id, 'rec1');
    assert.strictEqual(plan.diff.admitted.length, 0, '不重复新增');
    assert.deepStrictEqual(plan.diff.activated, ['rec1']);
    ok('失活复活 / 不重复 admission');
});

// ---------- 12. 历史删楼 → invalidate / drop ----------
test('【12】既有记录不再出现 → invalidate（默认软失效）', () => {
    const existing = [{ id: 'rec_gone', contentHash: 'deadbeef' }];
    const plan = TR.planReconciliation({ turns: [T('other', 'reply')], existing, activeIds: ['rec_gone'], chatId: 'c1' });
    const inv = plan.records.filter(r => r.op === 'invalidate');
    assert.strictEqual(inv.length, 1);
    assert.strictEqual(inv[0].id, 'rec_gone');
    assert.match(inv[0].reason, /history-reconciled/);
    assert.ok(inv[0].sourceFingerprint, '带来源指纹便于溯源');
    assert.deepStrictEqual(plan.diff.invalidated, ['rec_gone']);
    ok('软失效 + 原因 + 来源指纹');
});

// ---------- 13. 硬删除模式 ----------
test('【13】softInvalidate=false → drop', () => {
    const existing = [{ id: 'rec_gone', contentHash: 'deadbeef' }];
    const plan = TR.planReconciliation({
        turns: [], existing, activeIds: ['rec_gone'], chatId: 'c1', softInvalidate: false,
    });
    assert.ok(plan.records.some(r => r.op === 'drop' && r.id === 'rec_gone'));
    assert.ok(!plan.records.some(r => r.op === 'invalidate'));
    ok('硬删除模式（drop）');
});

// ---------- 14. 幂等键与指纹 ----------
test('【14】fingerprint / mutationId 确定性', () => {
    const t = T('甲', '乙');
    const existing = [{ id: 'rec1', contentHash: TR.turnContentHash(t) }];
    const a = TR.planReconciliation({ turns: [t], existing, activeIds: ['rec1'], chatId: 'c1' });
    const b = TR.planReconciliation({ turns: [t], existing, activeIds: ['rec1'], chatId: 'c1' });
    assert.strictEqual(a.fingerprint, b.fingerprint);
    assert.strictEqual(a.mutationId, b.mutationId);
    const c = TR.planReconciliation({ turns: [t], existing, activeIds: ['rec1'], chatId: 'c2' });
    assert.notStrictEqual(a.mutationId, c.mutationId, 'chatId 参与 mutationId 派生');
    assert.match(a.mutationId, /^hist_[0-9a-f]{8}$/);
    ok('指纹/变更号确定性 / 会话隔离');
});

// ---------- 15. matchKeys 可配置 ----------
test('【15】matchKeys 顺序可配置', () => {
    const t = T('甲', '乙', { turnId: 't1', hostTurnKey: 'h1' });
    const existing = [
        { id: 'r_slot', metadata: { hostTurnKey: 'h1' } },
        { id: 'r_turn', turnId: 't1' },
    ];
    const byTurn = TR.assignTurnIds([t], existing, { matchKeys: ['turnId', 'hostTurnKey'] });
    assert.strictEqual(byTurn.assigned[0].matchedId, 'r_turn');
    const byHost = TR.assignTurnIds([t], existing, { matchKeys: ['hostTurnKey', 'turnId'] });
    assert.strictEqual(byHost.assigned[0].matchedId, 'r_slot');
    assert.strictEqual(byHost.assigned[0].matchBy, 'hostTurnKey');
    ok('匹配优先级可控 / matchBy 回报');
});

// ---------- 16. 健壮性 ----------
test('【16】非法输入不崩', () => {
    assert.deepStrictEqual(TR.assignTurnIds(null, null).assigned, []);
    assert.deepStrictEqual(TR.assignTurnIds([null, undefined, {}], []).assigned, []);
    const plan = TR.planReconciliation({});
    assert.strictEqual(plan.changed, false);
    const d = TR.diffTurnSets(null, undefined);
    assert.strictEqual(d.changed, false);
    ok('空/非法输入安全兜底');
});

console.log(`[v3105] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;