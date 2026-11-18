// [v4.163.0 · R26-X5] 图谱对比可导出：差异变成能发出去的文本，且能逐条回查
// 验收口径：导出文本里每条边都能在对比结果里找到，条数一致。
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

function pair() {
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: '2026-11-10' });
    const m2 = T.mark(m1.machine, S2, { round: 2, at: '2026-11-12' });
    const opts = (r) => ({ timeMachine: T, machineState: m2.machine, atRound: r });
    const p1 = V.project(S1, opts(1));
    const p2 = V.project(S2, opts(2));
    const g1 = V.graphView(p1), g2 = V.graphView(p2);
    const d = V.graphDiff(g1, g2, p2);
    return { p2, d, ex: V.exportGraphDiff(d, { title: '第 1 轮到第 2 轮', fromAt: '2026-11-10', toAt: '2026-11-12' }) };
}

test('X5-1 导出是文本：有表头、有逐条边行，行数 = 表头 + 差异条数', () => {
    const { d, ex } = pair();
    assert.equal(ex.ok, true);
    assert.equal(typeof ex.text, 'string');
    assert.equal(ex.count, d.rows.length);
    assert.equal(ex.lineCount, ex.text.split(String.fromCharCode(10)).length);
    assert.equal(ex.headLines + d.rows.length, ex.lineCount);
    assert.ok(ex.text.indexOf('# 图谱对比') === 0);
});

test('X5-2 每条边都能在对比结果里找到，条数一致', () => {
    const { d, ex } = pair();
    assert.deepEqual(ex.edges.slice().sort(), d.rows.map((r) => String(r.edge)).sort());
    const back = V.parseGraphDiff(ex.text);
    assert.equal(back.count, d.rows.length);
    assert.deepEqual(back.edges.slice().sort(), d.rows.map((r) => String(r.edge)).sort());
});

test('X5-3 方向不丢：added 是 +、removed 是 -，读回来逐条一致', () => {
    const { d, ex } = pair();
    const back = V.parseGraphDiff(ex.text);
    d.rows.forEach((row, i) => {
        assert.equal(back.rows[i].kind, row.kind, row.edge);
        assert.equal(back.rows[i].a, String(row.a));
        assert.equal(back.rows[i].b, String(row.b));
        assert.equal(back.rows[i].weight, Number(row.weight || 0));
    });
});

test('X5-4 带楼层：新增边的楼层与投影时间轴一致，读回来也一致', () => {
    const { p2, d, ex } = pair();
    const real = new Set(p2.timeline.map((t) => Number(t.sourceRef.floor)));
    const added = d.rows.filter((r) => r.kind === 'added');
    assert.ok(added.length > 0);
    added.forEach((r) => {
        assert.ok(r.floors.length > 0, r.edge + ' 新增边应带楼层');
        r.floors.forEach((f) => assert.ok(real.has(f), '楼层 ' + f + ' 不在时间轴里'));
    });
    const back = V.parseGraphDiff(ex.text);
    back.rows.filter((r) => r.kind === 'added').forEach((r) => assert.ok(r.floors.length > 0));
});

test('X5-5 带时间：表头写两个时点，新增边行里带条目时间', () => {
    const { d, ex } = pair();
    assert.ok(ex.text.indexOf('2026-11-10') !== -1);
    assert.ok(ex.text.indexOf('2026-11-12') !== -1);
    const added = d.rows.filter((r) => r.kind === 'added');
    added.forEach((r) => assert.ok(String(r.at).length > 0, r.edge + ' 应有时间'));
});

test('X5-6 查不到楼层就写 ?（不编一个数字）', () => {
    const d = { rows: [{ kind: 'added', edge: 'x||y', a: 'x', b: 'y', weight: 1, floors: [], at: '' }], counts: { added: 1, removed: 0, same: 0, drawn: 1 } };
    const ex = V.exportGraphDiff(d, {});
    assert.ok(ex.text.indexOf('floor=?') !== -1);
    assert.ok(ex.text.indexOf('at=?') !== -1);
    const back = V.parseGraphDiff(ex.text);
    assert.deepEqual(back.rows[0].floors, []);
    assert.equal(back.rows[0].at, '');
});

test('X5-7 没有差异 ⇒ 只有表头，不硬凑一行', () => {
    const d = { rows: [], counts: { added: 0, removed: 0, same: 2, drawn: 2 } };
    const ex = V.exportGraphDiff(d, {});
    assert.equal(ex.count, 0);
    assert.equal(ex.lineCount, ex.headLines);
    assert.equal(V.parseGraphDiff(ex.text).count, 0);
});

test('X5-8 解析不认野行：随便一句话混进去不会被当成边', () => {
    const text = ['随便写的', '[edge] + a || b | w=1 | floor=3 | at=2026-11-01', '也不是边'].join(String.fromCharCode(10));
    const back = V.parseGraphDiff(text);
    assert.equal(back.count, 1);
    assert.equal(back.rows[0].edge, 'a||b');
});

test('X5-9 导出不画假边：条数等于对称差条数，未变的一条都不进正文', () => {
    const { d, ex } = pair();
    assert.equal(ex.count, d.symmetricDifference.length);
    const back = V.parseGraphDiff(ex.text);
    assert.equal(back.edges.filter((e) => d.same.some((s) => String(s.key) === e)).length, 0);
    assert.equal(d.phantom, 0);
    assert.equal(d.dashed, 0);
});

test('X5-10 导出跑两次逐字相同，且自检绿', () => {
    const { ex } = pair();
    const again = pair();
    assert.equal(ex.text, again.ex.text);
    assert.equal(V.viewsSelfCheck().ok, true);
});
