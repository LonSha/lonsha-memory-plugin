// [v4.161.0 · R25-X2] 跨模态互查：从文字找到那张图
// 验收口径：搜「海边」能出图片分组且带楼层；undescribed 条目永不出现在结果里。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'multimodal-memory.js'));

function store() {
    let s = M.createStore();
    s = M.register(s, { modality: 'image', srcId: 'img1', floor: 3, description: '海边日落照片', people: ['林夏'] }).store;
    s = M.register(s, { modality: 'text', floor: 4, description: '林夏说海边风大', people: ['林夏'] }).store;
    s = M.register(s, { modality: 'image', srcId: 'img2', floor: 5 }).store;
    s = M.register(s, { modality: 'audio', srcId: 'v1', floor: 6, transcript: '海边的风真大' }).store;
    return s;
}

test('X2-1 结果按三模态分组，键齐且顺序固定', () => {
    const g = M.recallGrouped(store(), '海边');
    assert.deepEqual(Object.keys(g.groups).sort(), ['audio', 'image', 'text']);
    assert.deepEqual(g.order, ['text', 'image', 'audio']);
});

test('X2-2 搜「海边」出图片分组，且带来源楼层与人物', () => {
    const g = M.recallGrouped(store(), '海边');
    assert.equal(g.groups.image.length, 1);
    assert.equal(g.groups.image[0].id, 'image-1');
    assert.equal(g.groups.image[0].floor, 3);
    assert.deepEqual(g.groups.image[0].people, ['林夏']);
    assert.equal(g.groups.image[0].label, '图片');
    assert.ok(g.groups.image[0].score > 0);
});

test('X2-3 文本与语音命中也在各自分组里（互查不是只有图片）', () => {
    const g = M.recallGrouped(store(), '海边');
    assert.equal(g.groups.text.length, 1);
    assert.equal(g.groups.text[0].floor, 4);
    assert.equal(g.groups.audio.length, 1);
    assert.equal(g.groups.audio[0].floor, 6);
    assert.equal(g.groups.audio[0].srcId, 'v1');
});

test('X2-4 无描述条目（undescribed）永不出现，只在 skipped 里计数', () => {
    const s = store();
    const g = M.recallGrouped(s, '海边');
    const all = [].concat(g.groups.text, g.groups.image, g.groups.audio);
    assert.equal(all.some((h) => h.id === 'image-2'), false);
    assert.equal(g.skipped.undescribed, 1);
    assert.equal(g.considered, 3);
    assert.equal(g.hits, 3);
});

test('X2-5 空查询 ⇒ 三组皆空，不拿全部条目充数', () => {
    const g = M.recallGrouped(store(), '');
    assert.equal(g.hits, 0);
    assert.deepEqual(g.groups, { text: [], image: [], audio: [] });
});

test('X2-6 不匹配的词 ⇒ 三组皆空（不模糊编命中）', () => {
    const g = M.recallGrouped(store(), '太空飞船');
    assert.equal(g.hits, 0);
});

test('X2-7 k 生效：命中数不超过 k', () => {
    let s = store();
    for (let i = 0; i < 6; i += 1) s = M.register(s, { modality: 'image', floor: 10 + i, description: '海边第' + i }).store;
    const g = M.recallGrouped(s, '海边', { k: 2 });
    assert.ok(g.hits <= 2, String(g.hits));
});

test('X2-8 悬空条目不进互查结果（源删了就不装成还在）', () => {
    let s = store();
    const r = M.removeSource(s, 'img1');
    const g = M.recallGrouped(r.store, '海边');
    const all = [].concat(g.groups.text, g.groups.image, g.groups.audio);
    assert.equal(all.some((h) => h.id === 'image-1'), false);
    assert.equal(g.skipped.dangling, 1);
});

test('X2-9 同输入两次同结果（分组顺序与条目顺序稳定）', () => {
    const s = store();
    const a = M.recallGrouped(s, '海边');
    const b = M.recallGrouped(s, '海边');
    assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('X2-10 自检绿', () => {
    const sc = M.mmSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
