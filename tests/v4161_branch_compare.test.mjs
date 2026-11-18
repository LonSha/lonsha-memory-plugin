// [v4.161.0 · R25-X6] 分支记忆对照：两条分支差在哪，一条条看
// 验收口径：两分支差异条数与逐条 diff 计数一致；筛选后落盘条目集合可复现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'memory-time-machine.js'));

const S1 = { memories: [{ id: 'a', text: '一', at: '2026-11-10', floor: 10 }, { id: 'b', text: '二', at: '2026-11-10', floor: 10 }] };
const S2 = { memories: [{ id: 'a', text: '一改', at: '2026-11-10', floor: 10 }, { id: 'c', text: '三', at: '2026-11-12', floor: 12 }, { id: 'd', text: '四', at: '2026-11-12', floor: 12 }] };
function machine() {
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: '2026-11-10' });
    const m2 = T.mark(m1.machine, S2, { round: 2, at: '2026-11-12' });
    const co = T.checkout(m2.machine, 1, { branchId: 'back' });
    return co.machine;
}

test('X6-1 对照用的分类词表与时间机器同源（五类，不另造）', () => {
    const d = T.branchDiff(machine(), 1, 2);
    assert.deepEqual(d.kinds, T.KINDS);
    assert.deepEqual(d.kinds, ['added', 'modified', 'removed', 'status', 'unchanged']);
});

test('X6-2 两分支差异条数 = 逐条 diff 计数一致', () => {
    const m = machine();
    const d = T.branchDiff(m, 1, 2);
    const raw = T.diff(m, 1, 2);
    assert.equal(d.rows.length, raw.changes.length);
    assert.deepEqual(d.counts, raw.counts);
    assert.equal(d.changed, d.counts.added + d.counts.modified + d.counts.removed + d.counts.status);
});

test('X6-3 changed 不含未变（未变不算差异）', () => {
    const d = T.branchDiff(machine(), 1, 2);
    assert.equal(d.changed, d.rows.filter((r) => r.kind !== 'unchanged').length);
    assert.ok(d.counts.unchanged >= 0);
});

test('X6-4 只保留某分支独有的三条：筛选给排序后的 id 集合', () => {
    const d = T.branchDiff(machine(), 1, 2);
    const po = T.pickOnly(d.rows, ['added']);
    assert.equal(po.ok, true);
    assert.deepEqual(po.ids, ['c', 'd']);
    assert.equal(po.count, 2);
    assert.deepEqual(po.kinds, ['added']);
});

test('X6-5 同输入两次同结果（集合可复现，不靠对象键序）', () => {
    const m = machine();
    const a = T.pickOnly(T.branchDiff(m, 1, 2).rows, ['added', 'modified']);
    const b = T.pickOnly(T.branchDiff(m, 1, 2).rows, ['added', 'modified']);
    assert.deepEqual(a, b);
    assert.deepEqual(a.ids, ['a', 'c', 'd']);
});

test('X6-6 未知分类 ⇒ 空集合，不抛也不回落成全部', () => {
    const d = T.branchDiff(machine(), 1, 2);
    const po = T.pickOnly(d.rows, ['weird']);
    assert.equal(po.count, 0);
    assert.deepEqual(po.ids, []);
});

test('X6-7 回滚开分支：两条分支都在，历史一条不少', () => {
    const m = machine();
    assert.equal(m.marks.length, 2);
    assert.equal(m.branches.length, 2);
    assert.deepEqual(m.branches.map((b) => b.id), ['main', 'back']);
    assert.equal(m.branches[1].atRound, 1);
});

test('X6-8 分支对照可复现：main@2 vs back@1 的差异与第一次相同', () => {
    const m = machine();
    const first = T.branchDiff(m, 1, 2);
    const again = T.branchDiff(m, 1, 2);
    assert.equal(JSON.stringify(first.rows), JSON.stringify(again.rows));
    assert.ok(first.changed > 0);
});

test('X6-9 不存在的轮次 ⇒ 具名 no-such-round，不拿最近时点顶替', () => {
    const d = T.branchDiff(machine(), 1, 99);
    assert.equal(d.ok, false);
    assert.deepEqual(d.bad, ['no-such-round']);
});

test('X6-10 自检绿（含 browse / locate / pickOnly 的机器读数）', () => {
    const sc = T.machineSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
