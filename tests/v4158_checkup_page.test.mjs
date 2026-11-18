// [v4.158.0 · R24-O7] 诊断可读化：把三片读数变成用户能懂的一页
// 验收口径：六项读数与引擎内部读数同源；「为什么没召回」三种原因各给不同答案；导出不含内部对象路径。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'memory-checkup-page.js'));

const NOW = Date.parse('2026-11-18T00:00:00Z');
const snap = () => ({
    nowMs: NOW,
    memories: [
        { id: 'a', at: '2026-11-17T00:00:00Z', salience: 0.9 },
        { id: 'b', at: '2026-11-10T00:00:00Z', salience: 0.8 },
        { id: 'c', at: '2026-08-01T00:00:00Z', salience: 0.7 }
    ],
    receipts: [{ kind: 'recall', hits: 2 }, { kind: 'recall', hits: 0 }, { kind: 'inject', ids: ['a'] }],
    conflicts: [{ id: 'c1' }],
    forgotten: [{ id: 'x', level: 'purge' }]
});

test('O7-1 六项读数齐（库存 / 近七天 / 命中率 / 注入 / 冲突 / 已删）', () => {
    const p = P.buildPage(snap());
    assert.deepEqual(p.rows.map((r) => r.key), ['total', 'newIn7d', 'recallHitRate', 'injectCount', 'conflicts', 'forgotten']);
    assert.equal(p.index.total, 3);
    assert.equal(p.index.injectCount, 1);
    assert.equal(p.index.conflicts, 1);
    assert.equal(p.index.forgotten, 1);
});

test('O7-2 同源：页面读数完全由快照算出（改快照即改页面）', () => {
    const s = snap();
    const p1 = P.buildPage(s);
    s.memories.push({ id: 'd', at: '2026-11-16T00:00:00Z', salience: 0.5 });
    const p2 = P.buildPage(s);
    assert.equal(p2.index.total, p1.index.total + 1);
});

test('O7-3 命中率是算出来的（2 次召回里 1 次命中 ⇒ 0.5）', () => {
    const p = P.buildPage(snap());
    assert.equal(p.index.recallHitRate, 0.5);
});

test('O7-4 近七天边界：8 天前不算新增', () => {
    const p = P.buildPage(snap());
    assert.equal(p.index.newIn7d, 1);
});

test('O7-5 每个读数都有一句人话（不许只给数字）', () => {
    P.buildPage(snap()).rows.forEach((r) => {
        assert.ok(r.means && r.means.length >= 6, r.key);
        assert.ok(!r.means.includes('undefined') && !r.means.includes('NaN') && !r.means.includes('[object'), `${r.key}: ${r.means}`);
    });
});

test('O7-6 「为什么没召回」三种原因各给不同答案', () => {
    const cold = P.whyNotRecalled({ id: 'a', tier: 'cold' }, { nowMs: NOW });
    const faint = P.whyNotRecalled({ id: 'b', salience: 0.1 }, { nowMs: NOW });
    const old = P.whyNotRecalled({ id: 'c', salience: 0.9, at: '2026-01-01T00:00:00Z' }, { nowMs: NOW });
    const excluded = P.whyNotRecalled({ id: 'd', salience: 0.9, at: '2026-11-17T00:00:00Z' }, { nowMs: NOW, excludedIds: ['d'] });
    assert.equal(cold.code, 'tier-cold');
    assert.equal(faint.code, 'low-salience');
    assert.equal(old.code, 'expired');
    assert.equal(excluded.code, 'excluded');
    const explains = [cold, faint, old, excluded].map((x) => x.explain);
    assert.equal(new Set(explains).size, 4, '四句话不许重样');
});

test('O7-7 显式排除优先于其他原因（用户意图优先）', () => {
    const r = P.whyNotRecalled({ id: 'z', tier: 'cold', salience: 0.1 }, { nowMs: NOW, excludedIds: ['z'] });
    assert.equal(r.code, 'excluded');
});

test('O7-8 导出是纯文本，不含内部对象路径 / [object Object]', () => {
    const page = P.buildPage(snap());
    const txt = P.exportText(page, { why: P.whyNotRecalled({ id: 'a', tier: 'cold' }, { nowMs: NOW }) });
    assert.ok(txt.includes('记忆体检'));
    assert.ok(!txt.includes('engine.'), '不许漏内部路径');
    assert.ok(!txt.includes('[object'), '不许漏对象 toString');
    assert.ok(txt.split('\n').length >= 8);
});

test('O7-9 空库不崩：六项都给 0 且有人话', () => {
    const p = P.buildPage({ nowMs: NOW });
    assert.equal(p.index.total, 0);
    assert.equal(p.index.recallHitRate, 0);
    p.rows.forEach((r) => assert.ok(r.means.length > 3, r.key));
});

test('O7-10 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('memory-checkup-page.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaMemoryCheckupPage', 'memory-checkup-page.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.checkupPage'));
    assert.ok(idx.includes("typeof api.buildPage === 'function'"));
});

test('O7-11 自检绿（模块自带读数）', () => {
    const s = P.checkupSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /no-leak=true/);
});

test('O7-12 经典脚本形态：无 module 时挂 global.LonShaMemoryCheckupPage', () => {
    const src = readFileSync(join(ROOT, 'memory-checkup-page.js'), 'utf8');
    assert.ok(src.includes('root.LonShaMemoryCheckupPage = api;'));
    assert.ok(!/^export /m.test(src));
});
