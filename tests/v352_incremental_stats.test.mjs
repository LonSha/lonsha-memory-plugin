// tests/v352_incremental_stats.test.mjs
// LonSha 记忆引擎 v3.52.0 增量索引与命中率统计测试套件
// 涵盖：P11 bridge BM25 增量更新、P12 召回源累计命中率统计

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const bridgeSrc = readFileSync(new URL('../../ruby-phone-work/apps/memory/lonsha-bridge.js', import.meta.url), 'utf-8');

test('=== 1. P11 bridge BM25 增量更新验证 ===', () => {
    assert.ok(bridgeSrc.includes('_indexedIds'), 'P11: 已索引 id 集合');
    assert.ok(bridgeSrc.includes('const collect = (id, text, floor, storyTime, source)'), 'P11: 增量收集器');
    assert.ok(bridgeSrc.includes('this._indexedIds.has(id)'), 'P11: 幂等判定');
    assert.ok(bridgeSrc.includes('this._bm25.N === 0 || this._bm25.N > 800'), 'P11: 阈值全量 rebuild 保精度');
    assert.ok(bridgeSrc.includes('for (const d of docs) this._bm25.add(d);'), 'P11: 增量 append');
    assert.ok(bridgeSrc.includes("key + '_' + (m?.id || String(m?.content || '').substring(0, 40))"), 'P11: pool 内容 hash 幂等');
    assert.ok(bridgeSrc.includes('this._bm25Dirty = false;'), 'dirty 标志复位');
    console.log('✓ P11 bridge BM25 增量更新验证通过');
});

test('=== 2. P12 召回源命中率统计验证 ===', () => {
    assert.ok(src.includes('this._recallSourceStats = { total: 0, bySource: {} }'), 'P12: 统计容器');
    assert.ok(src.includes('this._recallSourceStats.total++'), 'P12: 轮次累计');
    assert.ok(src.includes('cur.hits += sv'), 'P12: 各源命中累计');
    assert.ok(src.includes('this._recallSourceStats.total > 200'), 'P12: 环形窗口防膨胀（200轮半衰）');
    assert.ok(src.includes('recallSourceStats: this._recallSourceStats || null,'), 'P12: collectExport 携带');
    console.log('✓ P12 召回源命中率统计验证通过');
});

test('=== 3. 命中率统计行为模拟 ===', () => {
    // 模拟统计逻辑
    const stats = { total: 0, bySource: {} };
    const srcMap1 = { vector: 3, bm25: 2 };
    const srcMap2 = { vector: 2, rubyphone: 1 };
    for (const srcMap of [srcMap1, srcMap2]) {
        stats.total++;
        for (const [sk, sv] of Object.entries(srcMap)) {
            const cur = stats.bySource[sk] || { hits: 0, rounds: 0 };
            cur.hits += sv;
            stats.bySource[sk] = cur;
        }
        for (const sk of Object.keys(stats.bySource)) {
            stats.bySource[sk].rounds = stats.total;
        }
    }
    assert.equal(stats.total, 2);
    assert.equal(stats.bySource.vector.hits, 5, 'vector 累计 5');
    assert.equal(stats.bySource.vector.rounds, 2);
    assert.equal(stats.bySource.rubyphone.hits, 1);
    // 半衰
    stats.total = Math.floor(stats.total / 2);
    for (const sk of Object.keys(stats.bySource)) {
        stats.bySource[sk].hits = Math.ceil(stats.bySource[sk].hits / 2);
    }
    assert.equal(stats.bySource.vector.hits, 3, '半衰后 vector 3');
    console.log('✓ 命中率统计行为模拟验证通过');
});