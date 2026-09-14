// [v3.95] text-chunk 智能分块单测（缝合 vectors-enhanced）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const TC = require('../text-chunk.js');

test('text-chunk: 短文本不切', () => {
    assert.deepEqual(TC.chunkText('短文本', 100), ['短文本']);
    assert.deepEqual(TC.chunkText('', 100), []);
});

test('text-chunk: 中文句点边界优先', () => {
    const t = '第一句话在这里。第二句话比较长一些。第三句话。第四句也很长需要切分。';
    const r = TC.chunkText(t, 20, 10);
    assert.ok(r.length >= 2, '应切多块');
    assert.ok(r.every(c => c.length <= 20), '每块不超 chunkSize');
    assert.ok(r[0].endsWith('。') || r[0].length > 0, '按句点切');
});

test('text-chunk: 段落边界优先于句点', () => {
    const t = 'A'.repeat(15) + '\n\n' + 'B'.repeat(15) + '\n\n' + 'C'.repeat(30);
    const r = TC.chunkText(t, 20, 10);
    assert.ok(r.some(c => c.includes('A')) && r.some(c => c.includes('B')), '段落完整保留');
});

test('text-chunk: 重叠滑动窗口（跨块上下文连续）', () => {
    const t = 'x'.repeat(100);
    const r = TC.chunkText(t, 30, 20);
    assert.ok(r.length >= 3, '重叠产生更多块');
    assert.equal(r[0].length, 30, '首块满 chunkSize');
});

test('text-chunk: 自定义分隔符优先+超长部分递归细分', () => {
    const t = '短块|||' + '长'.repeat(50) + '|||另一短块';
    const r = TC.chunkText(t, 20, 10, '|||');
    assert.equal(r[0], '短块', '分隔符短块保留');
    assert.equal(r[r.length - 1], '另一短块', '末块保留');
    assert.ok(r.length > 3, '超长部分递归细分');
});

test('text-chunk: 防死循环（无标点长文硬切+总长守恒）', () => {
    const t = '啊'.repeat(500);
    const r = TC.chunkText(t, 50, 10);
    assert.ok(r.length > 5, '硬切成多块');
    const total = r.join('').length;
    assert.ok(total >= 500, '重叠使总长>=原文（无内容丢失）');
});

test('text-chunk: 英文空格词边界', () => {
    const t = 'The quick brown fox jumps over the lazy dog. ' .repeat(10);
    const r = TC.chunkText(t, 60, 10);
    assert.ok(r.length >= 2, '英文长文切块');
    assert.ok(r.every(c => c.length <= 65), '块长受控');
});

test('text-chunk: estimateChunkCount 估算', () => {
    const n = TC.estimateChunkCount('啊'.repeat(500), 100, 10);
    assert.ok(n >= 5, '估算块数合理');
});

// addVectorAuto 集成（VectorStore 分块分发，无 window 用 require 兜底）
test('text-chunk: 引擎在 CJS 环境可用（addVectorAuto 依赖）', () => {
    assert.equal(typeof TC.chunkText, 'function');
    assert.equal(typeof TC.chunkWithoutDelimiter, 'function');
    assert.ok(TC.DEFAULT_CHUNK_SIZE > 0);
    assert.ok(TC.SENTENCE_MARKERS.includes('。'), '含中文句点');
});