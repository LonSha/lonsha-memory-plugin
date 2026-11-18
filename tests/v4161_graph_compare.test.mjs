// [v4.161.0 · R25-X5] 图谱快照对比：这周才多出来的关系
// 验收口径：对比视图的边集合 = 两个时点边集合的对称差；不存在的边不得画虚线充数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const V = require(join(ROOT, 'memory-views.js'));
const T = require(join(ROOT, 'memory-time-machine.js'));

const S1 = { memories: [{ id: 'a', text: '林夏在茶馆说要走', persons: ['林夏'], places: ['茶馆'], type: 'event', at: '2026-11-10', floor: 10 }] };
const S2 = { memories: S1.memories.concat([{ id: 'c', text: '林夏和顾青在海边', persons: ['林夏', '顾青'], places: ['海边'], type: 'event', at: '2026-11-12', floor: 12 }]) };
function machine() {
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: '2026-11-10' });
    return T.mark(m1.machine, S2, { round: 2, at: '2026-11-12' }).machine;
}
const keyOf = (e) => (String(e.a) < String(e.b) ? String(e.a) + '||' + String(e.b) : String(e.b) + '||' + String(e.a));
function pair() {
    const m = machine();
    const opts = (r) => ({ timeMachine: T, machineState: m, atRound: r });
    const p1 = V.project(S1, opts(1));
    const p2 = V.project(S2, opts(2));
    const g1 = V.graphView(p1), g2 = V.graphView(p2);
    return { m: m, p1: p1, p2: p2, g1: g1, g2: g2, d: V.graphDiff(g1, g2, p2) };
}

test('X5-1 对比结果的边集合 = 两时点边集合的对称差（可逐条复算）', () => {
    const { g1, g2, d } = pair();
    const A = new Set(g1.edges.map(keyOf));
    const B = new Set(g2.edges.map(keyOf));
    const sym = [...new Set([...A, ...B])].filter((k) => (A.has(k) && !B.has(k)) || (B.has(k) && !A.has(k))).sort();
    assert.deepEqual(d.symmetricDifference.slice().sort(), sym);
    assert.ok(sym.length > 0);
});

test('X5-2 新增/消失/未变各自计数与输入一致', () => {
    const { g1, g2, d } = pair();
    const A = new Set(g1.edges.map(keyOf));
    const B = new Set(g2.edges.map(keyOf));
    assert.equal(d.counts.added, [...B].filter((k) => !A.has(k)).length);
    assert.equal(d.counts.removed, [...A].filter((k) => !B.has(k)).length);
    assert.equal(d.counts.same, [...B].filter((k) => A.has(k)).length);
});

test('X5-3 新增边带来源楼层，且楼层真的来自投影时间轴', () => {
    const { p2, d } = pair();
    const added = d.rows.filter((r) => r.kind === 'added');
    assert.ok(added.length > 0);
    const real = new Set(p2.timeline.map((t) => Number(t.sourceRef.floor)));
    added.forEach((r) => {
        assert.ok(Array.isArray(r.floors));
        r.floors.forEach((f) => assert.ok(real.has(f), r.edge + ' floor ' + f));
    });
    assert.ok(added.some((r) => r.floors.length > 0));
});

test('X5-4 不存在的边不得画出来：drawn = 新增 + 未变，且每条边必在两个输入之一', () => {
    const { g1, g2, d } = pair();
    const A = new Set(g1.edges.map(keyOf));
    const B = new Set(g2.edges.map(keyOf));
    assert.equal(d.counts.drawn, d.counts.added + d.counts.same);
    d.rows.forEach((r) => assert.ok(A.has(r.edge) || B.has(r.edge), r.edge));
    assert.equal(d.phantom, 0);
    assert.equal(d.dashed, 0);
});

test('X5-5 同一对视图自比：0 新增 0 消失，全部未变', () => {
    const { g1, d } = pair();
    const self = V.graphDiff(g1, g1, null);
    assert.equal(self.counts.added, 0);
    assert.equal(self.counts.removed, 0);
    assert.equal(self.counts.same, g1.edges.length);
    assert.deepEqual(self.symmetricDifference, []);
    assert.ok(d.counts.added > 0);
});

test('X5-6 反向比较：新增与消失互换（方向不混）', () => {
    const { g1, g2, p1 } = pair();
    const fwd = V.graphDiff(g1, g2, null);
    const back = V.graphDiff(g2, g1, p1);
    assert.equal(back.counts.added, fwd.counts.removed);
    assert.equal(back.counts.removed, fwd.counts.added);
    assert.equal(back.counts.same, fwd.counts.same);
});

test('X5-7 两时点完全一致 ⇒ rows 空（不凭空报差异）', () => {
    const { g1 } = pair();
    const same = V.graphDiff(g1, g1, null);
    assert.deepEqual(same.rows, []);
});

test('X5-8 空视图 / 缺边字段：不抛，如实给 0', () => {
    assert.deepEqual(V.graphDiff({}, {}).counts, { added: 0, removed: 0, same: 0, drawn: 0 });
    assert.deepEqual(V.graphDiff(null, null).rows, []);
});

test('X5-9 换时点对比 ⇒ 结果随之变（与 project(atRound) 同源，不是缓存）', () => {
    const { m, g1, p2 } = pair();
    const g3 = V.graphView(V.project(S2, { timeMachine: T, machineState: m, atRound: 2 }));
    const d13 = V.graphDiff(g1, g3, p2);
    const d11 = V.graphDiff(g1, g1, null);
    assert.ok(d13.counts.added > d11.counts.added);
});

test('X5-10 自检绿', () => {
    const sc = V.viewsSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
