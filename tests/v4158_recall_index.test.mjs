// [v4.158.0 · R24-O2] 召回性能：延迟预算与增量索引
// 验收口径（原文）：10w 条下 P95 有明显下降（给实测值）；索引与线性扫描结果逐条一致；
// 索引失效时降级可见且可自愈（重建后回到正常路径）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const R = require(join(ROOT, 'recall-inverted-index.js'));

test('O2-1 分词：中文单字+相邻二元，拉丁取小写词，不跨标点', () => {
    const t = R.tokenize('承诺，T77');
    assert.ok(t.includes('承'), '单字要在');
    assert.ok(t.includes('承诺'), '二元要在');
    assert.ok(t.includes('t77'), '拉丁词要小写化');
    assert.ok(!t.includes('诺,'), '不许跨标点拼二元');
});

test('O2-2 索引与线性扫描逐条一致（含同分排序）', () => {
    const docs = R.makeDocs(300, 11);
    const idx = R.buildIndex(docs);
    const q = '承诺和车站';
    const a = R.query(idx, docs, q);
    const b = R.linearQuery(docs, q);
    assert.deepEqual(a.results.map((x) => x.id), b.results.map((x) => x.id));
    assert.deepEqual(a.results.map((x) => Number(x.score.toFixed(9))), b.results.map((x) => Number(x.score.toFixed(9))));
});

test('O2-3 缩候选：只扫相关条目，但结果集不许变', () => {
    const docs = [
        { id: 'd1', text: '蓝鲸在深海' },
        { id: 'd2', text: '天气和计划' },
        { id: 'd3', text: '朋友约定旅行' },
        { id: 'd4', text: '书和灯在桌上' },
    ];
    const idx = R.buildIndex(docs);
    const a = R.query(idx, docs, '蓝鲸');
    const b = R.linearQuery(docs, '蓝鲸');
    assert.ok(a.scanned < docs.length, `倒排没缩候选：${a.scanned}/${docs.length}`);
    assert.deepEqual(a.results.map((x) => x.id), b.results.map((x) => x.id));
});

test('O2-4 增量：不重建，且新条立刻可召回', () => {
    const docs = [{ id: 'a', text: '蓝鲸在深海' }];
    const idx = R.buildIndex(docs);
    const ap = R.appendDoc(idx, { id: 'b', text: '蓝鲸又来了' });
    assert.equal(ap.rebuilt, false, '增量不许重建全库');
    assert.equal(ap.after, ap.before + 1);
    const q = R.query(ap.index, docs.concat([{ id: 'b', text: '蓝鲸又来了' }]), '蓝鲸');
    assert.ok(q.results.some((x) => x.id === 'b'));
});

test('O2-5 增量索引与全量重建结果逐条一致（索引只改速度不改结果）', () => {
    const base = R.makeDocs(120, 3);
    const grow = [{ id: 'new1', text: '承诺 t77' }, { id: 'new2', text: '车站 t5' }];
    const all = base.concat(grow);
    const inc = R.buildIndex(base);
    grow.forEach((d) => R.addDoc(inc, d));
    const full = R.buildIndex(all);
    const q = '承诺和车站';
    assert.deepEqual(R.query(inc, all, q).results.map((x) => x.id), R.query(full, all, q).results.map((x) => x.id));
});

test('O2-6 降级可见：索引不可用 ⇒ degraded + reason，且结果不退化', () => {
    const docs = R.makeDocs(50, 5);
    const d = R.query(null, docs, '承诺');
    assert.equal(d.degraded, true);
    assert.ok(d.reason && d.reason.length > 0, '降级必须给原因，不许静默变慢');
    const idx = R.buildIndex(docs);
    const n = R.query(idx, docs, '承诺');
    assert.equal(n.degraded, false);
    assert.deepEqual(d.results.map((x) => x.id), n.results.map((x) => x.id), '降级只许变慢，不许变错');
});

test('O2-7 自愈：重建后回到正常路径', () => {
    const docs = R.makeDocs(50, 5);
    const r = R.rebuild(docs);
    assert.equal(r.rebuilt, true);
    assert.equal(r.index.size, docs.length);
    assert.equal(R.query(r.index, docs, '承诺').degraded, false);
});

test('O2-8 排序确定性：同分按 id 字典序，不打乱输入就换序', () => {
    const docs = R.makeDocs(80, 9);
    const idx = R.buildIndex(docs);
    const a = R.query(idx, docs, '承诺').results.map((x) => x.id);
    const shuffled = docs.slice().reverse();
    const b = R.query(idx, shuffled, '承诺').results.map((x) => x.id);
    assert.deepEqual(a, b);
});

test('O2-9 三档实测函数真能跑，且索引档 P95 低于线性档', () => {
    const r = R.benchRecall({ sizes: [500, 3000], reps: 5 });
    assert.equal(r.ok, true);
    assert.equal(r.rows.length, 2);
    r.rows.forEach((row) => {
        assert.ok(row.indexP50 >= 0 && row.indexP95 > 0, JSON.stringify(row));
        assert.equal(row.parity, true, JSON.stringify(row));
        if (row.linearP95 !== null) assert.ok(row.indexP95 < row.linearP95, `索引没更快：${JSON.stringify(row)}`);
    });
});

test('O2-10 实测报告落盘（10w 档读数可复跑复看）', () => {
    const p = join(ROOT, 'docs/planning/2026-11-18-recall-perf-v24.md');
    assert.ok(existsSync(p), '缺实测报告：性能项不许只写「更快了」');
    const t = readFileSync(p, 'utf8');
    assert.ok(t.includes('100000') || t.includes('10w'), '报告里必须有 10w 档');
    assert.match(t, /P95/);
});

test('O2-11 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('recall-inverted-index.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaRecallInvertedIndex', 'recall-inverted-index.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('optEngines.LonShaRecallInvertedIndex'));
    assert.ok(idx.includes("typeof api.query === 'function'"), '必须形态校验，不许拿到毛坯就挂');
});

test('O2-12 自检绿（模块自带读数）', () => {
    const s = R.recallIndexSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /parity=ok/);
});

test('O2-13 经典脚本形态：无 module 时挂 global.LonShaRecallInvertedIndex', () => {
    const src = readFileSync(join(ROOT, 'recall-inverted-index.js'), 'utf8');
    assert.ok(src.includes('root.LonShaRecallInvertedIndex = api;'));
    assert.ok(!/^export /m.test(src));
});
