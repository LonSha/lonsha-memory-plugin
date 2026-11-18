// [v4.160.0 · R25-O2] 时间机器接三视图：回到某一轮看当时的图谱/时间线
// 验收口径：两个时点投影出不同内容；差异与 timeMachine.diff() 逐条对得上；
//           取不到的轮次具名降级（不许拿现库冒充历史）；投影只读。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const V = require(join(ROOT, 'memory-views.js'));
const T = require(join(ROOT, 'memory-time-machine.js'));

const S1 = { memories: [{ id: 'm1', text: '第一天在海边', at: '2026-11-01', persons: ['林夏'] }] };
const S2 = { memories: [
    { id: 'm1', text: '第一天在海边', at: '2026-11-01', persons: ['林夏'] },
    { id: 'm2', text: '第二天在茶馆', at: '2026-11-02', persons: ['林夏', '陈舟'], places: ['茶馆'] }
] };
const S3 = { memories: [
    { id: 'm1', text: '第一天在海边', at: '2026-11-01', persons: ['林夏'] },
    { id: 'm2', text: '第二天在茶馆（已作废）', at: '2026-11-02', persons: ['林夏'], voided: true }
] };

function machine() {
    let m = T.createMachine();
    m = T.mark(m, S1, { round: 1, at: '剧情第 1 天' }).machine;
    m = T.mark(m, S2, { round: 2, at: '剧情第 2 天' }).machine;
    m = T.mark(m, S3, { round: 3, at: '剧情第 3 天' }).machine;
    return m;
}
const live = () => JSON.parse(JSON.stringify(S2));
const at = (round) => V.project(live(), { timeMachine: T, machineState: machine(), atRound: round });

test('O2-1 不给时点 ⇒ 读现库，meta.source=live', () => {
    const p = V.project(live());
    assert.equal(p.meta.source, 'live');
    assert.equal(p.meta.atRound, null);
    assert.equal(p.count, 2);
});

test('O2-2 给轮次 ⇒ 投影来自该轮快照，而不是现库', () => {
    const p = at(1);
    assert.equal(p.meta.source, 'mark');
    assert.equal(p.meta.atRound, 1);
    assert.equal(p.meta.at, '剧情第 1 天');
    assert.equal(p.count, 1, '第 1 轮只有 1 条');
});

test('O2-3 取不到的轮次具名降级，不静默拿现库冒充', () => {
    const p = at(99);
    assert.equal(p.meta.source, 'missing');
    assert.match(p.meta.degraded, /no-such-round/);
});

test('O2-4 两个时点的图谱确实不同', () => {
    const g1 = V.graphView(at(1));
    const g2 = V.graphView(at(2));
    assert.ok(g2.nodes.length > g1.nodes.length, '第 2 轮多了茶馆节点');
    assert.ok(g2.edges.length > g1.edges.length);
    assert.ok(g1.nodes.some((n) => n.label === '林夏'));
    assert.equal(g1.nodes.some((n) => n.label === '茶馆'), false, '第 1 轮没有茶馆');
    assert.ok(g2.nodes.some((n) => n.label === '茶馆'), '第 2 轮才有茶馆');
});

test('O2-5 时间线视图跟着时点走，且 meta 透传', () => {
    const v1 = V.timelineView(at(1));
    const v2 = V.timelineView(at(2));
    assert.equal(v1.items.length, 1);
    assert.equal(v2.items.length, 2);
    assert.equal(v1.meta.atRound, 1);
    assert.equal(v2.meta.atRound, 2);
});

test('O2-6 差异与 timeMachine.diff() 逐条同源', () => {
    const mc = machine();
    const dv = V.diffView(1, 2, T, mc);
    const raw = T.diff(mc, 1, 2);
    assert.equal(dv.ok, true);
    assert.deepEqual(dv.counts, raw.counts);
    assert.equal(dv.rows.length, raw.changes.length);
    assert.deepEqual(dv.rows.map((r) => r.id + ':' + r.kind).sort(), raw.changes.map((c) => c.id + ':' + c.kind).sort());
});

test('O2-7 状态变化在视图里也单独成类（voided 不混进修改）', () => {
    const dv = V.diffView(2, 3, T, machine());
    const row = dv.rows.find((r) => r.id === 'm2');
    assert.equal(row.kind, 'status');
    assert.match(row.after, /true/);
});

test('O2-8 负控制：旧时点投影里不得出现后来才有的条目', () => {
    const p1 = at(1);
    assert.equal(p1.timeline.some((x) => x.id === 'm2'), false);
    const s = V.searchView(p1, '茶馆');
    assert.equal(s.results.length, 0, '第 1 轮根本没有茶馆');
});

test('O2-9 空库的时点投影各自给话，不报错', () => {
    const p = V.project({ memories: [] }, { timeMachine: T, machineState: T.createMachine(), atRound: 1 });
    assert.equal(p.empty, true);
    assert.equal(p.meta.source, 'missing');
    assert.match(V.timelineView(p).message, /还没有记忆/);
});

test('O2-10 投影只读：两次投影后现库逐字节未变', () => {
    const store = live();
    const before = JSON.stringify(store);
    V.project(store, { timeMachine: T, machineState: machine(), atRound: 1 });
    V.graphView(V.project(store, { timeMachine: T, machineState: machine(), atRound: 2 }));
    assert.equal(JSON.stringify(store), before);
});

test('O2-11 规模：1 万条的时点投影不卡（< 1500ms）', () => {
    const big = { memories: [] };
    for (let i = 0; i < 10000; i++) big.memories.push({ id: 'b' + i, text: '记忆 ' + i, at: '2026-11-01', persons: ['P' + (i % 50)] });
    let m = T.createMachine();
    m = T.mark(m, big, { round: 1, at: 'x' }).machine;
    const t0 = Date.now();
    const p = V.project({ memories: [] }, { timeMachine: T, machineState: m, atRound: 1 });
    const ms = Date.now() - t0;
    assert.equal(p.count, 10000);
    assert.ok(ms < 1500, '耗时 ' + ms + 'ms');
});

test('O2-12 三视图与差异表共用同一份投影（不另开真源）', () => {
    const p = at(2);
    const tv = V.timelineView(p), gv = V.graphView(p), sv = V.searchView(p, '茶馆');
    assert.equal(tv.items.length, p.count);
    assert.equal(gv.meta.atRound, p.meta.atRound);
    assert.equal(sv.meta.atRound, p.meta.atRound);
    assert.deepEqual(sv.results.map((r) => r.id), ['m2']);
});
