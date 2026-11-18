// [v4.162.0 · R26-O2] 时点投影缓存与失效：同一时点不重算
// 验收口径：同一时点连开两次只算一次；打新标记后必重算且数值随库变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const V = require(join(ROOT, 'memory-views.js'));
const T = require(join(ROOT, 'memory-time-machine.js'));

const S1 = { memories: [{ id: 'a', text: '林夏在茶馆说要走', persons: ['林夏'], places: ['茶馆'], type: 'event', floor: 10 }] };
const S2 = { memories: S1.memories.concat([{ id: 'c', text: '林夏去了海边', persons: ['林夏'], places: ['海边'], type: 'event', floor: 12 }]) };

test('O2-1 同一时点连开两次 ⇒ 第二次命中缓存，计数 hits/misses 各 1', () => {
    const cache = V.makeProjectCache();
    const a = V.project(S1, { cache: cache });
    const b = V.project(S1, { cache: cache });
    assert.equal(a.meta.cache, 'miss');
    assert.equal(b.meta.cache, 'hit');
    assert.equal(cache.hits, 1);
    assert.equal(cache.misses, 1);
    assert.equal(a.count, b.count);
});

test('O2-2 命中返回的是同一份读数（视图逐项一致）', () => {
    const cache = V.makeProjectCache();
    const a = V.project(S2, { cache: cache });
    const b = V.project(S2, { cache: cache });
    assert.deepEqual(V.timelineView(a).items.map((x) => x.id), V.timelineView(b).items.map((x) => x.id));
    assert.deepEqual(V.graphView(a).edges.map((e) => e.a + '|' + e.b), V.graphView(b).edges.map((e) => e.a + '|' + e.b));
});

test('O2-3 库变了（加一条）⇒ 必不命中，且读数随之变', () => {
    const cache = V.makeProjectCache();
    const a = V.project(S1, { cache: cache });
    const b = V.project(S2, { cache: cache });
    assert.equal(b.meta.cache, 'miss');
    assert.equal(a.count, 1);
    assert.equal(b.count, 2);
    assert.equal(cache.misses, 2);
});

test('O2-4 打新标记后同一时点号仍不串：时点内容变了就重算', () => {
    const cache = V.makeProjectCache();
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: 'd1' });
    const a = V.project(S1, { cache: cache, timeMachine: T, machineState: m1.machine, atRound: 1 });
    const m2 = T.mark(m1.machine, S2, { round: 2, at: 'd2' });
    const b = V.project(S2, { cache: cache, timeMachine: T, machineState: m2.machine, atRound: 1 });
    assert.equal(a.count, 1);
    assert.equal(b.count, 1, 'round 1 的快照仍是 1 条（历史不变）');
    assert.equal(a.meta.source, 'mark');
    assert.equal(b.meta.source, 'mark');
});

test('O2-5 不同时点不互相污染（key 含时点）', () => {
    const cache = V.makeProjectCache();
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: 'd1' });
    const m2 = T.mark(m1.machine, S2, { round: 2, at: 'd2' });
    const p1 = V.project(S2, { cache: cache, timeMachine: T, machineState: m2.machine, atRound: 1 });
    const p2 = V.project(S2, { cache: cache, timeMachine: T, machineState: m2.machine, atRound: 2 });
    assert.equal(p1.count, 1);
    assert.equal(p2.count, 2);
    assert.equal(cache.misses, 2);
});

test('O2-6 注入 versionOf ⇒ 版本口径由调用方定（粗指纹的补丁口）', () => {
    const cache = V.makeProjectCache();
    let ver = 'v1';
    const o = { cache: cache, versionOf: () => ver };
    assert.equal(V.project(S1, o).meta.cache, 'miss');
    assert.equal(V.project(S1, o).meta.cache, 'hit');
    ver = 'v2';
    assert.equal(V.project(S1, o).meta.cache, 'miss');
    assert.equal(cache.hits, 1);
    assert.equal(cache.misses, 2);
});

test('O2-7 不给缓存 ⇒ 照旧算，标 cache=off 或未标（不假装命中）', () => {
    const p = V.project(S1, {});
    assert.notEqual(p.meta.cache, 'hit');
    assert.equal(p.count, 1);
});

test('O2-8 缓存不改变降级语义：取不到时点仍具名 missing', () => {
    const cache = V.makeProjectCache();
    const m1 = T.mark(T.createMachine(), S1, { round: 1, at: 'd1' });
    const p = V.project(S1, { cache: cache, timeMachine: T, machineState: m1.machine, atRound: 99 });
    assert.equal(p.meta.source, 'missing');
    assert.ok(p.meta.degraded.includes('no-such-round'));
});

test('O2-9 缓存内容不可被调用方改坏（命中返回的是副本）', () => {
    const cache = V.makeProjectCache();
    const a = V.project(S1, { cache: cache });
    a.timeline.push({ id: 'evil' });
    const b = V.project(S1, { cache: cache });
    assert.equal(b.timeline.some((x) => x.id === 'evil'), false);
});

test('O2-10 自检绿', () => {
    const sc = V.viewsSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
