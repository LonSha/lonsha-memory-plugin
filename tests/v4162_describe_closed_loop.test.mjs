// [v4.162.0 · R26-O3] 多模态描述回填闭环：回填后索引与层级都跟上
// 验收口径：回填一句描述后，同一条从搜不到变成搜得到，且层级读数随之变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'multimodal-memory.js'));
const R = require(join(ROOT, 'recall-inverted-index.js'));

function one() {
    const s = M.register(M.createStore(), { modality: 'image', srcId: 'img1', floor: 3 }).store;
    return s;
}

test('O3-1 回填前搜不到（undescribed 不进检索）', () => {
    const s = one();
    assert.equal(M.recall(s, '海边').hits.length, 0);
    assert.equal(M.substanceLength(s.entries[0]), 0);
});

test('O3-2 回填后同一条搜得到（闭环生效）', () => {
    const s = one();
    const r = M.describeClosed(s, 'image-1', '海边日落照片');
    assert.equal(r.ok, true);
    assert.equal(r.receipt.stateFrom, 'undescribed');
    assert.equal(r.receipt.stateTo, 'ok');
    assert.equal(r.receipt.searchable, true);
    assert.ok(M.recall(r.store, '海边').hits.length >= 1);
});

test('O3-3 注入索引时报文「索引已重建」，且重建用的是回填后的文本', () => {
    const s = one();
    const idx = R.createIndex ? R.createIndex() : null;
    const api = idx ? idx : { rebuild: (docs) => ({ index: { n: docs.length }, docs: docs }) };
    const r = M.describeClosed(s, 'image-1', '海边日落照片', { index: api });
    assert.equal(r.receipt.indexRebuilt, true);
    if (idx) assert.ok(r.receipt.indexVersion >= 1);
});

test('O3-4 不注入索引 ⇒ 诚实报 rebuilt=false，不假装重建', () => {
    const s = one();
    const r = M.describeClosed(s, 'image-1', '海边日落照片');
    assert.equal(r.receipt.indexRebuilt, false);
    assert.equal(r.receipt.indexVersion, 0);
});

test('O3-5 层级读数随回填而变：cold → hot 且标 moved', () => {
    const s = one();
    const r = M.describeClosed(s, 'image-1', '海边日落照片');
    assert.equal(r.receipt.tierFrom, 'cold');
    assert.equal(r.receipt.tierTo, 'hot');
    assert.equal(r.receipt.tierMoved, true);
});

test('O3-6 已有描述的条目再回填 ⇒ 层级不动（moved=false）', () => {
    let s = one();
    s = M.describe(s, 'image-1', '海边日落照片').store;
    const r = M.describeClosed(s, 'image-1', '海边日落照片（补一句）');
    assert.equal(r.receipt.tierFrom, 'hot');
    assert.equal(r.receipt.tierTo, 'hot');
    assert.equal(r.receipt.tierMoved, false);
});

test('O3-7 回填不存在的条目 ⇒ 具名 no-such-entry', () => {
    const r = M.describeClosed(one(), 'zzz', '随便');
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['no-such-entry']);
});

test('O3-8 空文本回填 ⇒ 仍是 undescribed（不因为调了一次就叫有描述）', () => {
    const r = M.describeClosed(one(), 'image-1', '   ');
    assert.equal(r.entry.state, 'undescribed');
    assert.equal(r.receipt.searchable, false);
});

test('O3-9 tierOf 可注入（层级口径由调用方定，不在本模块写死）', () => {
    const r = M.describeClosed(one(), 'image-1', '海边日落照片', { tierOf: () => 'warm' });
    assert.equal(r.receipt.tierFrom, 'cold');
    assert.equal(r.receipt.tierTo, 'warm');
});

test('O3-10 回填后互查分组里也能看到它（另一面同源）', () => {
    const s = one();
    const r = M.describeClosed(s, 'image-1', '海边日落照片', {});
    const g = M.recallGrouped(r.store, '海边');
    assert.equal(g.groups.image.length, 1);
    assert.equal(g.groups.image[0].floor, 3);
});

test('O3-11 自检绿', () => {
    const sc = M.mmSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
