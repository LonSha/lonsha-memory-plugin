// [v4.158.0 · R24-X1] 记忆交互台：时间线 / 图谱 / 检索三视图
// 验收口径：三视图同源（条数/关系数一致）；点节点能回原文楼层；1w 条下首屏可交互（实测）；空库给话。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const V = require(join(ROOT, 'memory-views.js'));

const store = () => ({ memories: V.makeStore(120, 5) });

test('X1-1 一份投影：三视图共享（条数与关系数同源）', () => {
    const p = V.project(store());
    const tl = V.timelineView(p, {});
    const gv = V.graphView(p, {});
    const sv = V.searchView(p, '林夏车站', { k: 5 });
    assert.equal(tl.total, p.count);
    assert.equal(gv.nodes.filter((n) => n.kind === 'event').length, p.count, '每个事件节点对应一条记忆');
    assert.ok(sv.results.every((r) => p.timeline.some((t) => t.id === r.id)), '检索结果必须来自同一投影');
});

test('X1-2 时间线：按剧情时间排序，可筛人物/地点/类型', () => {
    const p = V.project(store());
    const tl = V.timelineView(p, {});
    const ats = tl.items.map((x) => x.at);
    assert.deepEqual(ats, ats.slice().sort((a, b) => a - b), '必须按时间升序');
    const f = V.timelineView(p, { person: tl.facets.persons[0] });
    assert.ok(f.items.length > 0 && f.items.length <= tl.items.length);
    f.items.forEach((x) => assert.ok(x.persons.includes(tl.facets.persons[0])));
    const g = V.timelineView(p, { type: tl.facets.types[0] });
    g.items.forEach((x) => assert.equal(x.type, tl.facets.types[0]));
});

test('X1-3 回溯：点任一节点能回到原文楼层', () => {
    const p = V.project(store());
    const tl = V.timelineView(p, {});
    const id = tl.items[3].id;
    const d = tl.detail(id);
    assert.equal(d.ok, true);
    assert.equal(typeof d.sourceRef.floor, 'number');
    assert.ok(d.sourceRef.text.length > 0);
    const g = V.graphView(p, {});
    assert.equal(g.trailBack(id).floor, d.sourceRef.floor);
});

test('X1-4 图谱：人物/地点/事件三色节点，边权=共现强度', () => {
    const g = V.graphView(V.project(store()), {});
    const kinds = new Set(g.nodes.map((n) => n.kind));
    ['person', 'place', 'event'].forEach((k) => assert.ok(kinds.has(k), k));
    assert.ok(g.edges.length > 0);
    g.edges.forEach((e) => assert.ok(e.weight >= 1));
});

test('X1-5 聚焦某人物：只留焦点一跳邻居', () => {
    const p = V.project(store());
    const g = V.graphView(p, {});
    const rarest = p.nodes.filter((n) => n.kind === 'person').sort((a, b) => a.mems.length - b.mems.length)[0];
    const f = V.graphView(p, { focus: rarest.label });
    const adj = {};
    adj[rarest.key] = true;
    p.edges.forEach((e) => { if (e.a === rarest.key) adj[e.b] = true; if (e.b === rarest.key) adj[e.a] = true; });
    f.nodes.forEach((n) => assert.ok(adj[n.key], n.key));
    assert.ok(f.nodes.length <= g.nodes.length);
});

test('X1-6 检索视图：给三路贡献与命中片段', () => {
    const p = V.project(store());
    const sv = V.searchView(p, '林夏车站', { k: 5 });
    assert.ok(sv.results.length > 0);
    sv.results.forEach((r) => {
        assert.ok(r.routes && typeof r.routes.bm25 === 'number' && typeof r.routes.ngram === 'number');
        assert.ok(r.snippet && r.snippet.length > 0, '要能看命中片段');
        assert.ok(r.sourceRef && r.sourceRef.id === r.id);
    });
});

test('X1-7 检索确定：同查询两次同结果（含同分排序）', () => {
    const p = V.project(store());
    const a = V.searchView(p, '林夏车站', { k: 5 });
    const b = V.searchView(p, '林夏车站', { k: 5 });
    assert.deepEqual(a.results.map((x) => x.id), b.results.map((x) => x.id));
});

test('X1-8 空库：三视图各自给话，不许空白页', () => {
    const p = V.project({ memories: [] });
    assert.equal(p.empty, true);
    [V.timelineView(p, {}), V.graphView(p, {}), V.searchView(p, 'x')].forEach((v) => {
        assert.equal(v.empty, true);
        assert.ok(v.message && v.message.length > 5);
    });
});

test('X1-9 1w 条记忆：投影首屏耗时在可交互范围（实测）', () => {
    const t0 = Date.now();
    const p = V.project({ memories: V.makeStore(10000, 9) });
    const ms = Date.now() - t0;
    assert.equal(p.count, 10000);
    assert.ok(ms < 2000, `1w 投影耗时 ${ms}ms`);
});

test('X1-10 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('memory-views.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaMemoryViews', 'memory-views.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.memoryViews'));
    assert.ok(idx.includes("typeof api.project === 'function'"));
});

test('X1-11 自检绿（模块自带读数）', () => {
    const s = V.viewsSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /nodes=/);
});

test('X1-12 经典脚本形态：无 module 时挂 global.LonShaMemoryViews', () => {
    const src = readFileSync(join(ROOT, 'memory-views.js'), 'utf8');
    assert.ok(src.includes('root.LonShaMemoryViews = api;'));
    assert.ok(!/^export /m.test(src));
});
