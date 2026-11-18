// [v4.160.0 · R25-O4] 纠错走幂等键：同一纠错重复上报只落一次修订
// 验收口径：重复上报 N 次修订历史恒为 1；不同纠错不互相吞；回滚也幂等。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-correction-loop.js'));

function store() {
    return { memories: [
        { id: 'm1', text: '那把剑在阁楼', persons: ['林夏'], at: '2026-11-01' },
        { id: 'm2', text: '茶馆在街角', persons: ['陈舟'], at: '2026-11-02' }
    ], revisions: {}, receipts: [] };
}

const edit = (s, patch) => C.applyCorrection(s, 'm1', patch, { at: '2026-11-18' });

test('O4-1 幂等键只认内容，不认字段顺序', () => {
    const a = C.correctionKey('m1', { text: 'x', owner: '林夏' });
    const b = C.correctionKey('m1', { owner: '林夏', text: 'x' });
    assert.equal(a, b);
    assert.notEqual(a, C.correctionKey('m1', { text: 'y' }));
    assert.notEqual(a, C.correctionKey('m2', { text: 'x', owner: '林夏' }));
});

test('O4-2 同一纠错重复上报 5 次：修订历史恒为 1 条', () => {
    let s = store();
    const first = edit(s, { text: '那把剑在书房' });
    assert.equal(first.ok, true);
    s = first.store;
    for (let i = 0; i < 5; i++) {
        const r = edit(s, { text: '那把剑在书房' });
        assert.equal(r.ok, true);
        assert.equal(r.status, 'same', '第二次起应报 same');
        assert.equal(r.revision, 1, '应回指已有修订号');
        s = r.store;
    }
    assert.equal(s.revisions.m1.length, 1);
    assert.equal(s.memories.find((m) => m.id === 'm1').text, '那把剑在书房');
});

test('O4-3 不同纠错不互相吞', () => {
    let s = edit(store(), { text: '那把剑在书房' }).store;
    s = edit(s, { owner: '陈舟' }).store;
    assert.equal(s.revisions.m1.length, 2);
    assert.equal(s.revisions.m1[1].action, 'owner');
});

test('O4-4 重复上报不重复写回执', () => {
    let s = edit(store(), { text: 'A' }).store;
    const before = s.receipts.length;
    for (let i = 0; i < 3; i++) s = edit(s, { text: 'A' }).store;
    assert.equal(s.receipts.length, before, '重复上报不得再落回执');
});

test('O4-5 重复作废不报 already-voided（幂等优先）', () => {
    let s = edit(store(), { void: true }).store;
    assert.equal(s.memories.find((m) => m.id === 'm1').voided, true);
    const again = edit(s, { void: true });
    assert.equal(again.ok, true);
    assert.equal(again.status, 'same');
    assert.equal(again.store.revisions.m1.length, 1);
});

test('O4-6 回滚幂等：同一版本回滚两次只生效一次', () => {
    let s = edit(store(), { text: '改后' }).store;
    const r1 = C.rollback(s, 'm1', 1);
    assert.equal(r1.ok, true);
    s = r1.store;
    const n = s.revisions.m1.length;
    const r2 = C.rollback(s, 'm1', 1);
    assert.equal(r2.ok, true);
    assert.equal(r2.status, 'same');
    assert.equal(r2.store.revisions.m1.length, n, '二次回滚不得再落修订');
});

test('O4-7 回滚后内容回到改前，且能再被编辑（新键）', () => {
    let s = edit(store(), { text: '改后' }).store;
    s = C.rollback(s, 'm1', 1).store;
    assert.equal(s.memories.find((m) => m.id === 'm1').text, '那把剑在阁楼');
    // 回滚后再上报「与历史完全相同」的纠错：本来就已经发生过了，报 same 是对的
    const same = edit(s, { text: '改后' });
    assert.equal(same.status, 'same');
    assert.equal(same.revision, 1);
    // 换成另一种改法才是新修订
    const fresh = edit(s, { text: '再改一次' });
    assert.equal(fresh.ok, true);
    assert.notEqual(fresh.status, 'same');
    assert.equal(fresh.store.revisions.m1.length, 3, '1 次修改 + 1 次回滚 + 1 次新修改');
});

test('O4-8 同改法作用在不同条目各自成修订', () => {
    let s = edit(store(), { text: '同一句' }).store;
    s = C.applyCorrection(s, 'm2', { text: '同一句' }, { at: '2026-11-18' }).store;
    assert.equal(s.revisions.m1.length, 1);
    assert.equal(s.revisions.m2.length, 1);
});

test('O4-9 撞键不撞人：两条不同改法同目标仍是两条', () => {
    let s = edit(store(), { text: 'A' }).store;
    s = edit(s, { text: 'B' }).store;
    assert.equal(s.revisions.m1.length, 2);
    assert.notEqual(s.revisions.m1[0].key, s.revisions.m1[1].key);
});

test('O4-10 impact 读数不被重复上报放大', () => {
    let s = edit(store(), { text: 'A' }).store;
    const once = C.impact(s);
    for (let i = 0; i < 4; i++) s = edit(s, { text: 'A' }).store;
    const many = C.impact(s);
    assert.deepEqual(many, once);
});

test('O4-11 形态 + 自检绿', () => {
    const raw = require('node:fs').readFileSync(join(ROOT, 'memory-correction-loop.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaCorrectionLoop = api;'));
    assert.ok(!/^export /m.test(raw));
    assert.equal(typeof C.correctionKey, 'function');
    assert.equal(C.correctionSelfCheck().ok, true);
});
