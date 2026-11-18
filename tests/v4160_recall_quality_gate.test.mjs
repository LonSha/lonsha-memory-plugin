// [v4.160.0 · R25-O1] 召回质量回归闸
// 验收口径：同一配置两次跑完全一致；关掉一路 → 必红且逐组点名；指标变好不算红；
//           基准是数据（改数据即改基准），判据与基准读同一份 bench 结果。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const G = require(join(ROOT, 'recall-quality-gate.js'));
const B = require(join(ROOT, 'recall-quality-bench.js'));

const SET = JSON.parse(readFileSync(join(ROOT, 'data', 'golden-recall-set.json'), 'utf8'));
const BASE = JSON.parse(readFileSync(join(ROOT, 'data', 'golden-recall-baseline.json'), 'utf8'));
const K = 5;
const ROUTES = ['lex', 'ngram'];
const snapOf = (routes) => G.snapshot(B.runSet(SET, { k: K, routes }), { set: 'golden-recall-set.json' });

test('O1-1 闸门读数面：三项指标 + 版本', () => {
    assert.deepEqual(G.METRIC_KEYS, ['recallAtK', 'mrr', 'falseRecall']);
    assert.equal(G.VERSION, 1);
});

test('O1-2 同配置两次跑完全一致（闸门自己得稳）', () => {
    const a = snapOf(ROUTES), b = snapOf(ROUTES);
    assert.ok(G.sameSnapshot(a, b));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('O1-3 入仓基准没过期：与现跑读数逐字段一致', () => {
    const fresh = snapOf(ROUTES);
    const v = G.judge(fresh, BASE);
    assert.deepEqual(v.bad, [], '基准与现跑不一致:' + v.bad.join(' | '));
    assert.equal(v.ok, true);
});

test('O1-4 基准是数据不是代码：30 组且可从数据文件重算', () => {
    assert.equal(Object.keys(BASE.groups).length, 30);
    assert.equal(BASE.count, SET.items.length);
    assert.equal(BASE.k, K);
    assert.deepEqual(BASE.routes.slice().sort(), ROUTES.slice().sort());
    assert.ok(readFileSync(join(ROOT, 'data', 'golden-recall-baseline.json'), 'utf8').includes('"groups"'));
});

test('O1-5 关掉 lex 一路 ⇒ 判据必红且点名哪几组掉了', () => {
    const off = snapOf(['lex']);
    const v = G.judge(off, BASE);
    assert.equal(v.ok, false, '关掉一路竟然没红 —— 基准没有牙');
    assert.ok(v.bad.some((x) => x.indexOf('routes-changed') === 0), 'routes 变化必须点名:' + v.bad.join(' | '));
    assert.ok(v.bad.some((x) => x.indexOf('metric-down') === 0), '指标下降必须点名');
    assert.ok(v.regressed.length >= 2, '至少该有两组掉出 top-k，实为 ' + v.regressed.length);
    assert.ok(v.regressed.every((r) => typeof r.id === 'string' && r.id.length > 0));
});

test('O1-6 只开 lex 的读数确实低于两路（掉是实测的，不是判据自己造的）', () => {
    const both = snapOf(ROUTES), one = snapOf(['lex']);
    assert.ok(one.metrics.recallAtK < both.metrics.recallAtK,
        '单路 ' + one.metrics.recallAtK + ' 应低于两路 ' + both.metrics.recallAtK);
});

test('O1-7 k 变了要报 k-changed（不许默默比不同口径）', () => {
    const k3 = G.snapshot(B.runSet(SET, { k: 3, routes: ROUTES }));
    const v = G.judge(k3, BASE);
    assert.equal(v.ok, false);
    assert.ok(v.bad.some((x) => x.indexOf('k-changed') === 0));
});

test('O1-8 金标集变了要报 count-changed（改集必须重切基准）', () => {
    const fewer = { items: SET.items.slice(0, 20) };
    const s = G.snapshot(B.runSet(fewer, { k: K, routes: ROUTES }));
    const v = G.judge(s, BASE);
    assert.equal(v.ok, false);
    assert.ok(v.bad.some((x) => x.indexOf('count-changed') === 0));
});

test('O1-9 变好不算红：把某组人为做差当基准，现跑更好', () => {
    const better = JSON.parse(JSON.stringify(BASE));
    const victim = Object.keys(better.groups)[0];
    better.groups[victim] = { hit: false, rank: null };
    better.metrics.recallAtK = Number((better.metrics.recallAtK - 0.034).toFixed(4));
    const v = G.judge(snapOf(ROUTES), better);
    assert.equal(v.ok, true, '变好被判红:' + v.bad.join(' | '));
    assert.ok(v.improved.includes(victim));
});

test('O1-10 回退条目字段齐全（id / why / wasRank / nowRank）', () => {
    const worse = JSON.parse(JSON.stringify(BASE));
    const live = snapOf(ROUTES);
    const victim = Object.keys(live.groups).find((g) => live.groups[g].hit === false);
    assert.ok(victim, '金标集里应有未命中组可用作尸体');
    worse.groups[victim] = { hit: true, rank: 1 };
    const v = G.judge(snapOf(ROUTES), worse);
    const row = v.regressed.find((r) => r.id === victim);
    assert.ok(row, '该组应被点名');
    assert.equal(row.why, 'fell-out-of-topk');
    assert.equal(row.nowRank, null);
    assert.ok(row.wasRank >= 1);
});

test('O1-11 工具与判据同源：重切工具写的快照 === 本档算出的快照', () => {
    const toolSrc = readFileSync(join(ROOT, 'tools', 'gen-recall-gate-baseline.mjs'), 'utf8');
    assert.ok(toolSrc.includes("gate.snapshot(result"));
    assert.ok(toolSrc.includes("bench.runSet(set"));
    assert.equal(JSON.stringify(snapOf(ROUTES)), JSON.stringify(BASE));
});

test('O1-12 接线 + 自检 + 经典脚本形态', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('recall-quality-gate.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaRecallQualityGate', 'recall-quality-gate.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.recallQualityGate'));
    const s = G.gateSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /regress=/);
    const raw = readFileSync(join(ROOT, 'recall-quality-gate.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaRecallQualityGate = api;'));
    assert.ok(!/^export /m.test(raw));
});
