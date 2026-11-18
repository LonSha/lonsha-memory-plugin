// [v4.163.0 · R26-O4] 纠错审计包：把一条的修订链交出去，别人能校验、能重放
// 验收口径：导出的包重放一遍能复现同一修订链，幂等键相同的行不重复。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-correction-loop.js'));

const seed = () => ({
    memories: [{ id: 'm1', text: '他在车站答应要回来', owner: '陈舟', at: '2026-11-01T00:00:00Z' }],
    receipts: [{ kind: 'recall', ids: ['m1'], round: 7 }],
    revisions: {}
});

function threeEdits() {
    const a = C.applyCorrection(seed(), 'm1', { text: '他在海边答应要回来' }, { at: '2026-11-18' });
    const b = C.applyCorrection(a.store, 'm1', { owner: '林夏' }, { at: '2026-11-18' });
    return C.applyCorrection(b.store, 'm1', { at: '2026-11-05' }, { at: '2026-11-18' });
}

test('O4-1 包结构齐：身份/版本/链/条数/校验和', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    assert.equal(p.ok, true);
    assert.equal(p.id, 'm1');
    assert.equal(p.version, C.AUDIT_VERSION);
    assert.equal(p.count, 3);
    assert.equal(p.chain.length, 3);
    assert.match(p.checksum, /^[0-9a-f]{8}$/);
});

test('O4-2 修订链带幂等键：每行 key 与 applyCorrection 算出来的一致', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    assert.deepEqual(p.keys, [
        // 幂等键只按「显式给出的字段」算，推断出的动作名不入键（R25-O4 既有口径）
        C.correctionKey('m1', { text: '他在海边答应要回来' }),
        C.correctionKey('m1', { owner: '林夏' }),
        C.correctionKey('m1', { at: '2026-11-05' })
    ]);
    assert.equal(new Set(p.keys).size, 3);
});

test('O4-3 回滚过的版本标清：rolledBack 与 chain 内的痕迹对得上', () => {
    const a = threeEdits();
    const rb = C.rollback(a.store, 'm1', 1);
    const p = C.auditPack(rb.store, 'm1');
    assert.deepEqual(p.rolledBackVersions, [1]);
    const v1 = p.chain.find((r) => r.version === 1);
    assert.equal(v1.rolledBack, true);
    const tail = p.chain[p.chain.length - 1];
    assert.equal(tail.action, 'rollback');
    assert.equal(tail.rollbackOf, 1);
});

test('O4-4 包可校验：原包通过，改链里一个字就 checksum-mismatch', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    assert.deepEqual(C.verifyAuditPack(p), { ok: true, id: 'm1', count: 3 });
    assert.equal(C.auditChecksum(p), p.checksum);
    const bad = JSON.parse(JSON.stringify(p));
    bad.chain[0].after.text = '他在码头答应要回来';
    assert.deepEqual(C.verifyAuditPack(bad).bad, ['checksum-mismatch']);
});

test('O4-5 版本不符 / 不是审计包一律拒收', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    assert.deepEqual(C.verifyAuditPack(Object.assign({}, p, { version: 2 })).bad, ['version-mismatch']);
    [null, 'x', {}, { chain: 'no' }].forEach((x) => {
        assert.deepEqual(C.verifyAuditPack(x).bad, ['not-an-audit-pack']);
    });
});

test('O4-6 重放一遍能复现同一修订链（版本/动作/幂等键三列逐条一致）', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    const r = C.replayAudit(p);
    assert.equal(r.ok, true);
    assert.deepEqual(r.bad, []);
    assert.equal(r.applied, 3);
    assert.equal(r.chain.length, 3);
    p.chain.forEach((row, i) => {
        assert.equal(r.chain[i].version, row.version);
        assert.equal(r.chain[i].action, row.action);
        assert.equal(r.chain[i].key, row.key);
    });
});

test('O4-7 带回滚的链也能重放：终点逐字段回到被回滚前', () => {
    const a = threeEdits();
    const rb = C.rollback(a.store, 'm1', 1);
    const p = C.auditPack(rb.store, 'm1');
    const r = C.replayAudit(p);
    assert.equal(r.ok, true);
    assert.equal(r.applied, 4);
    assert.equal(r.final.text, '他在车站答应要回来');
    assert.equal(r.final.owner, '陈舟');
    assert.equal(!!r.final.voided, false);
});

test('O4-8 幂等键相同的行不重复落：伪造重复行 → 只落一次且具名 duplicateKeys', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    const forged = JSON.parse(JSON.stringify(p));
    forged.chain.push(JSON.parse(JSON.stringify(forged.chain[0])));
    forged.count = forged.chain.length;
    forged.checksum = C.auditChecksum(forged);
    assert.equal(C.verifyAuditPack(forged).ok, true);
    const r = C.replayAudit(forged);
    assert.equal(r.applied, 3);
    assert.equal(r.skipped, 1);
    assert.equal(r.duplicateKeys.length, 1);
    assert.equal(r.duplicateKeys[0], p.keys[0]);
    assert.equal(r.final.text, '他在海边答应要回来');
});

test('O4-9 重放两次结果逐字相同（可复现，不是碰巧）', () => {
    const p = C.auditPack(threeEdits().store, 'm1');
    const r1 = C.replayAudit(p);
    const r2 = C.replayAudit(p);
    assert.equal(JSON.stringify(r1), JSON.stringify(r2));
});

test('O4-10 查不到条目 ⇒ not-found 且链为空（不造一条空链冒充没改过）', () => {
    const p = C.auditPack(seed(), 'no-such-id');
    assert.equal(p.ok, false);
    assert.deepEqual(p.bad, ['not-found']);
    assert.deepEqual(p.chain, []);
    assert.equal(p.checksum, '');
    assert.equal(C.replayAudit(p).ok, false);
});

test('O4-11 没改过的条目 ⇒ empty 为真、链为空，包仍可校验可重放', () => {
    const p = C.auditPack(seed(), 'm1');
    assert.equal(p.ok, true);
    assert.equal(p.empty, true);
    assert.deepEqual(p.chain, []);
    assert.equal(C.verifyAuditPack(p).ok, true);
    const r = C.replayAudit(p);
    assert.equal(r.ok, true);
    assert.equal(r.empty, true);
    assert.equal(r.applied, 0);
});

test('O4-12 导出是只读的：审计一次不改库', () => {
    const s = threeEdits().store;
    const before = JSON.stringify(s);
    C.auditPack(s, 'm1');
    C.replayAudit(C.auditPack(s, 'm1'));
    assert.equal(JSON.stringify(s), before);
    assert.equal(C.correctionSelfCheck().ok, true);
});
