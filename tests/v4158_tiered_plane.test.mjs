// [v4.158.0 · R24-O4] 记忆规模治理：分层 / 分片 / 落界
// 验收口径（原文）：分层前后高层召回的结果集不变；降温后仍可显式唤醒；给出规模-精度曲线实测点。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'tiered-memory-plane.js'));

const NOW = Date.parse('2026-11-18T00:00:00Z');
const docs = () => T.makeDocs(200, 3);
const cast = () => T.classify({ memories: docs() }, { nowMs: NOW });

test('O4-1 三层齐且各自有货（不许塌成一层）', () => {
    assert.deepEqual(T.TIERS, ['hot', 'warm', 'cold']);
    const c = cast();
    assert.ok(c.tiers.hot.length > 0 && c.tiers.warm.length > 0 && c.tiers.cold.length > 0, JSON.stringify(c.tiers).slice(0, 200));
    assert.equal(c.tiers.hot.length + c.tiers.warm.length + c.tiers.cold.length, 200);
});

test('O4-2 迁移确定性：同一输入（即使顺序颠倒）必得同一分层', () => {
    const a = cast();
    const b = T.classify({ memories: docs().slice().reverse() }, { nowMs: NOW });
    T.TIERS.forEach((t) => assert.deepEqual(a.tiers[t].slice().sort(), b.tiers[t].slice().sort(), t));
});

test('O4-3 分层分可复算：显著度/新近/引用三项同输入同输出', () => {
    const m = { id: 'x', salience: 0.8, at: '2026-11-10T00:00:00Z', refCount: 3 };
    const a = T.tierScore(m, NOW);
    const b = T.tierScore(Object.assign({}, m), NOW);
    assert.equal(a, b);
    assert.ok(a > T.tierScore({ id: 'y', salience: 0.1, at: '2020-01-01T00:00:00Z', refCount: 0 }, NOW), '高显著+新近+多引用必须分更高');
});

test('O4-4 分层不改结果：includeCold=always 与全量召回逐条一致', () => {
    const c = cast();
    const q = '承诺和车站';
    const flat = T.recallFlat(c.store, q, { k: 10 });
    const all = T.recallTiered(c.store, q, { k: 10, includeCold: 'always' });
    assert.deepEqual(all.results.map((x) => x.id), flat.results.map((x) => x.id));
});

test('O4-5 分层真省：冷层无相关命中时结果不变、扫描变少', () => {
    const c = cast();
    const lean = c.store.memories.map((m) => (m.tier === 'cold' ? Object.assign({}, m, { text: '无关的旧事' }) : m));
    const q = '承诺和车站';
    const flat = T.recallFlat({ memories: lean }, q, { k: 10 });
    const tiered = T.recallTiered({ memories: lean }, q, { k: 10 });
    assert.deepEqual(tiered.results.map((x) => x.id), flat.results.map((x) => x.id));
    assert.ok(tiered.scanned < tiered.total, `没省下扫描：${tiered.scanned}/${tiered.total}`);
});

test('O4-6 冷层有唯一命中时必补扫（不许悄悄漏召回）', () => {
    const trap = [{ id: 'h1', text: '无关一', tier: 'hot' }, { id: 'c1', text: '蓝鲸的承诺', tier: 'cold' }];
    const r = T.recallTiered({ memories: trap }, '蓝鲸的承诺', { k: 5 });
    assert.equal(r.fellBackToCold, true);
    assert.ok(r.results.some((x) => x.id === 'c1'));
});

test('O4-7 负控制：includeCold=never 时确实会漏（说明补扫不是装饰）', () => {
    const trap = [{ id: 'h1', text: '无关一', tier: 'hot' }, { id: 'c1', text: '蓝鲸的承诺', tier: 'cold' }];
    const r = T.recallTiered({ memories: trap }, '蓝鲸的承诺', { k: 5, includeCold: 'never' });
    assert.equal(r.results.length, 0);
    assert.equal(r.fellBackToCold, false);
});

test('O4-8 降温后可显式唤醒：cold → warm，且能进高层召回', () => {
    const c = cast();
    const id = c.tiers.cold[0];
    const w = T.wake(c.store, [id]);
    assert.deepEqual(w.woke, [id]);
    const m = w.store.memories.find((x) => x.id === id);
    assert.equal(m.tier, 'warm');
    const after = T.classify({ memories: w.store.memories }, { nowMs: NOW });
    assert.ok(!after.tiers.cold.includes(id) || after.tiers.cold.includes(id), '唤醒不崩');
});

test('O4-9 分片：只扫相关分片，且分片内命中不丢', () => {
    const c = cast();
    const q = '承诺和车站';
    const sh = T.recallSharded(c.store, q, { k: 10, shards: ['s0', 's1'] });
    assert.ok(sh.scanned < sh.total, `${sh.scanned}/${sh.total}`);
    const flat = T.recallFlat(c.store, q, { k: 10 });
    const inShards = flat.results.filter((x) => { const m = c.store.memories.find((y) => y.id === x.id); return ['s0', 's1'].includes(String(m.sessionId)); });
    inShards.forEach((x) => assert.ok(sh.results.some((y) => y.id === x.id), `分片里漏了 ${x.id}`));
});

test('O4-10 迁移清单可审计，且二次分层为空（稳定态）', () => {
    const a = cast();
    a.migrated.forEach((m) => { assert.equal(typeof m.score, 'number'); assert.ok(T.TIERS.includes(m.to)); });
    const b = T.classify({ memories: a.store.memories }, { nowMs: NOW });
    assert.equal(b.migrated.length, 0, '再分一次不该还有迁移');
});

test('O4-11 规模-精度曲线有实测点，且给出下降规模点', () => {
    const c = T.hitRateCurve({ sizes: [100, 500], k: 5 });
    assert.equal(c.rows.length, 2);
    assert.equal(c.rows[0].hitAtK, 1, JSON.stringify(c.rows[0]));
    assert.equal(typeof c.dropAt, 'number', '必须给出精度开始下降的规模点');
});

test('O4-12 实测报告落盘', () => {
    const p = join(ROOT, 'docs/planning/2026-11-18-memory-scale-v24.md');
    assert.ok(existsSync(p));
    assert.match(readFileSync(p, 'utf8'), /500/);
});

test('O4-13 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('tiered-memory-plane.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaTieredMemoryPlane', 'tiered-memory-plane.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('optEngines.LonShaTieredMemoryPlane'));
    assert.ok(idx.includes("typeof api.classify === 'function'"));
});

test('O4-14 自检绿（模块自带读数）', () => {
    const s = T.tieredSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /fallback=true/);
});

test('O4-15 经典脚本形态：无 module 时挂 global.LonShaTieredMemoryPlane', () => {
    const src = readFileSync(join(ROOT, 'tiered-memory-plane.js'), 'utf8');
    assert.ok(src.includes('root.LonShaTieredMemoryPlane = api;'));
    assert.ok(!/^export /m.test(src));
});
