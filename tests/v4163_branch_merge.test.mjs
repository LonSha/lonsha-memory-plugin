// [v4.163.0 · R26-X6] 分支对照接合并：差异能选、能并回、能撤
// 验收口径：合并后目标分支条数 = 原条数 + 并入条数；撤销后回落原值。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'memory-time-machine.js'));

const A = { memories: [
    { id: 'a1', text: '林夏在茶馆', at: '2026-11-10', floor: 10 },
    { id: 'a2', text: '他说要走', at: '2026-11-11', floor: 11 }
] };
const B = { memories: [
    { id: 'a1', text: '林夏在茶馆', at: '2026-11-10', floor: 10 },
    { id: 'a2', text: '他说要回海边', at: '2026-11-11', floor: 11 },
    { id: 'b1', text: '顾青来了', at: '2026-11-12', floor: 12 },
    { id: 'b2', text: '雨停了', at: '2026-11-13', floor: 13 }
] };

function machine() {
    const m1 = T.mark(T.createMachine(), A, { round: 1, at: '2026-11-10' });
    return T.mark(m1.machine, B, { round: 2, at: '2026-11-13' }).machine;
}

function picked() {
    const m = machine();
    const d = T.branchDiff(m, 1, 2);
    return { m: m, d: d, only: T.pickOnly(d.rows, ['added']) };
}

test('X6-1 合并回执齐：applied / conflicts / missing / trace 都在', () => {
    const { only } = picked();
    const r = T.mergeStore(A, B, only.ids, { at: '2026-11-18' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.appliedIds, ['b1', 'b2']);
    assert.deepEqual(r.missing, []);
    assert.deepEqual(r.conflicts, []);
    assert.equal(r.trace.length, 2);
    assert.equal(r.receipt.kind, 'merge');
});

test('X6-2 合并后条数 = 原条数 + 并入条数', () => {
    const { only } = picked();
    const before = A.memories.length;
    const r = T.mergeStore(A, B, only.ids);
    assert.equal(r.count, before + only.count);
    assert.equal(r.store.memories.length, before + only.count);
    assert.equal(r.store.memories.some((m) => m.id === 'b1'), true);
});

test('X6-3 撤销后条数回落原值，且内容逐字段还原', () => {
    const { only } = picked();
    const r = T.mergeStore(A, B, only.ids);
    const back = T.undoMerge(r.store, r.receipt);
    assert.equal(back.ok, true);
    assert.equal(back.count, A.memories.length);
    assert.deepEqual(back.undone.sort(), ['b1', 'b2']);
    assert.equal(JSON.stringify(back.store.memories), JSON.stringify(A.memories));
});

test('X6-4 冲突走幂等键：同 id 不同内容被记成 overwrite，留痕带 before/after', () => {
    const r = T.mergeStore(A, B, ['a2']);
    assert.equal(r.applied, 1);
    assert.equal(r.conflicts.length, 1);
    const c = r.conflicts[0];
    assert.equal(c.id, 'a2');
    assert.equal(c.outcome, 'merged');
    assert.equal(c.before.text, '他说要走');
    assert.equal(c.after.text, '他说要回海边');
    assert.equal(c.key, T.conflictKey('a2', { text: '他说要回海边', at: '2026-11-11' }));
    assert.match(c.key, /^a2|merge|text=/);
});

test('X6-5 撤销冲突也还原：目标回到原内容', () => {
    const r = T.mergeStore(A, B, ['a2']);
    assert.equal(r.store.memories.find((m) => m.id === 'a2').text, '他说要回海边');
    const back = T.undoMerge(r.store, r.receipt);
    assert.equal(back.ok, true);
    assert.equal(back.count, A.memories.length);
    assert.equal(back.store.memories.find((m) => m.id === 'a2').text, '他说要走');
});

test('X6-6 幂等：同一批 id 并两次，第二次一条不多', () => {
    const { only } = picked();
    const once = T.mergeStore(A, B, only.ids);
    const twice = T.mergeStore(once.store, B, only.ids);
    assert.equal(twice.applied, 0);
    assert.deepEqual(twice.sameIds.sort(), ['b1', 'b2']);
    assert.equal(twice.count, once.count);
});

test('X6-7 同一 id 出现两次：第二次如实记 same，不重复落一条', () => {
    const r = T.mergeStore(A, B, ['b1', 'b1']);
    assert.deepEqual(r.trace.map((x) => x.action), ['add', 'same']);
    assert.equal(r.count, A.memories.length + 1);
    assert.equal(r.store.memories.filter((m) => m.id === 'b1').length, 1);
});

test('X6-8 来源没有的 id ⇒ missing 具名，不编一条空壳', () => {
    const r = T.mergeStore(A, B, ['ghost']);
    assert.deepEqual(r.missing, ['ghost']);
    assert.equal(r.applied, 0);
    assert.equal(r.count, A.memories.length);
    assert.deepEqual(r.trace, [{ id: 'ghost', action: 'missing' }]);
});

test('X6-9 合并是纯函数：目标 / 来源两个库都不被改', () => {
    const a0 = JSON.stringify(A), b0 = JSON.stringify(B);
    const r = T.mergeStore(A, B, ['b1', 'b2', 'a2']);
    assert.equal(JSON.stringify(A), a0);
    assert.equal(JSON.stringify(B), b0);
    assert.notEqual(JSON.stringify(r.store), a0);
});

test('X6-10 选差异 → 合并 → 撤销 整条链跑通，且自检绿', () => {
    const { only } = picked();
    assert.equal(only.count, 2);
    assert.deepEqual(only.ids, ['b1', 'b2']);
    const r = T.mergeStore(A, B, only.ids);
    assert.equal(r.count, 4);
    const back = T.undoMerge(r.store, r.receipt);
    assert.equal(back.count, 2);
    assert.deepEqual(T.KINDS, ['added', 'modified', 'removed', 'status', 'unchanged']);
    assert.equal(T.machineSelfCheck().ok, true);
});
