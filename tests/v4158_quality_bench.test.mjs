// [v4.158.0 · R24-X2] 记忆质量基准台
// 验收口径：同配置两次完全一致；关掉某路指标可解释下降；新增金标只改数据；指标吃同一份召回结果。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const B = require(join(ROOT, 'recall-quality-bench.js'));
const set = JSON.parse(readFileSync(join(ROOT, 'data/golden-recall-set.json'), 'utf8'));

test('X2-1 金标集 ≥30 组，且覆盖五类场景', () => {
    assert.ok(set.items.length >= 30, `只有 ${set.items.length} 组`);
    const cats = new Set(set.items.map((x) => x.category));
    ['直述', '同义改述', '时间指代', '人物指代', '否定', '跨会话'].forEach((c) => assert.ok(cats.has(c), c));
});

test('X2-2 每组三条齐：查询 / 期望 id / 为什么该被召回', () => {
    set.items.forEach((it) => {
        assert.ok(it.query, it.id);
        assert.ok(Array.isArray(it.expectedIds) && it.expectedIds.length > 0, it.id);
        assert.ok(it.why && it.why.length > 6, `${it.id} 缺可复核理由`);
        assert.ok(it.memories.some((m) => it.expectedIds.includes(m.id)), it.id);
    });
});

test('X2-3 三项指标齐且取值范围合法', () => {
    const r = B.runSet(set, { k: 5 });
    assert.equal(typeof r.metrics.recallAtK, 'number');
    assert.equal(typeof r.metrics.mrr, 'number');
    assert.equal(typeof r.metrics.falseRecall, 'number');
    assert.ok(r.metrics.recallAtK >= 0 && r.metrics.recallAtK <= 1);
    assert.ok(r.metrics.falseRecall >= 0 && r.metrics.falseRecall <= 1);
});

test('X2-4 同一配置两次运行完全一致（确定性）', () => {
    const a = B.runSet(set, { k: 5 });
    const b = B.runSet(set, { k: 5 });
    assert.deepEqual(a.metrics, b.metrics);
    assert.deepEqual(a.perItem.map((x) => x.top), b.perItem.map((x) => x.top));
});

test('X2-5 有牙：关掉 ngram 后 Recall@5 明显下降', () => {
    const both = B.runSet(set, { k: 5 });
    const lexOnly = B.runSet(set, { k: 5, routes: ['lex'] });
    assert.ok(both.metrics.recallAtK >= 0.7, JSON.stringify(both.metrics));
    assert.ok(lexOnly.metrics.recallAtK < both.metrics.recallAtK, `lexOnly=${lexOnly.metrics.recallAtK}`);
    const diff = B.compare(both, lexOnly);
    assert.ok(diff.worse.length > 0, '必须能指出哪几组变坏');
});

test('X2-6 逐组报：每组都能看到名次与候选', () => {
    const r = B.runSet(set, { k: 5 });
    assert.equal(r.perItem.length, set.items.length);
    r.perItem.forEach((x) => {
        assert.ok(Array.isArray(x.top) && x.top.length <= 5, x.id);
        if (x.hit) assert.ok(x.rank >= 1 && x.rank <= 5);
        else assert.equal(x.rank, null);
    });
});

test('X2-7 基准集是数据不是代码：临时新增一组立即生效', () => {
    const extra = {
        k: 5,
        items: [{
            id: 'tmp1', category: '直述', query: '蓝鲸的承诺',
            memories: [{ id: 'x1', text: '蓝鲸的承诺在海边' }, { id: 'x2', text: '无关' }],
            expectedIds: ['x1'], why: '原文直接包含查询串'
        }]
    };
    const r = B.runSet(extra, { k: 5 });
    assert.equal(r.count, 1);
    assert.equal(r.metrics.recallAtK, 1);
});

test('X2-8 误召回率口径：top-k 里非期望项的比例', () => {
    const one = {
        k: 2,
        items: [{
            id: 'f1', query: '蓝鲸',
            memories: [{ id: 'a', text: '蓝鲸' }, { id: 'b', text: '蓝鲸的事' }],
            expectedIds: ['a'], why: '期望只有 a'
        }]
    };
    const r = B.runSet(one, { k: 2 });
    assert.equal(r.perItem[0].top.length, 2);
    assert.equal(r.perItem[0].falseRate, 0.5, JSON.stringify(r.perItem[0]));
});

test('X2-9 读数报告落盘（含未命中逐条）', () => {
    const t = readFileSync(join(ROOT, 'docs/planning/2026-11-18-recall-quality-v24.md'), 'utf8');
    assert.match(t, /0.8333/);
    assert.match(t, /g06/);
});

test('X2-10 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('recall-quality-bench.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaRecallQualityBench', 'recall-quality-bench.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.qualityBench'));
    assert.ok(idx.includes("typeof api.runSet === 'function'"));
});

test('X2-11 经典脚本形态：无 module 时挂 global.LonShaRecallQualityBench', () => {
    const src = readFileSync(join(ROOT, 'recall-quality-bench.js'), 'utf8');
    assert.ok(src.includes('root.LonShaRecallQualityBench = api;'));
    assert.ok(!/^export /m.test(src));
});
