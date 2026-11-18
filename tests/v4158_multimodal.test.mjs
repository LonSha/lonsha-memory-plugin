// [v4.158.0 · R24-X3] 多模态记忆：图片与语音进记忆
// 验收口径：图片记忆下一轮可召回；未描述图进 undescribed 且不参与检索；
//           删源后转 dangling 且界面可见；注入标注与条目属性一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'multimodal-memory.js'));

function base() {
    let s = M.createStore();
    const img = M.register(s, { modality: 'image', srcId: 'img1', floor: 12, capturedAt: '第三天黄昏', people: ['林夏', '陈舟'], description: '一张海边合照，两人都笑着' });
    s = img.store;
    const raw = M.register(s, { modality: 'image', srcId: 'img2', floor: 13 });
    s = raw.store;
    const aud = M.register(s, { modality: 'audio', srcId: 'aud1', floor: 14, capturedAt: '第四天夜', transcript: '我今天有点累，明天再说' });
    s = aud.store;
    return { s, img: img.entry, raw: raw.entry, aud: aud.entry };
}

test('X3-1 三模态、三状态齐备', () => {
    assert.deepEqual(M.MODALITIES, ['text', 'image', 'audio']);
    assert.deepEqual(M.STATES, ['ok', 'undescribed', 'dangling']);
});

test('X3-2 图片登记含来源楼层 / 剧情拍摄时间 / 涉及人物', () => {
    const b = base();
    assert.equal(b.img.modality, 'image');
    assert.equal(b.img.floor, 12);
    assert.equal(b.img.sourceRef.floor, 12);
    assert.equal(b.img.capturedAt, '第三天黄昏', '用剧情时间，不用真实时间');
    assert.deepEqual(b.img.people, ['林夏', '陈舟']);
});

test('X3-3 缺描述的图进 undescribed，且不参与文本检索', () => {
    const b = base();
    assert.equal(b.raw.state, 'undescribed');
    const hit = M.recall(b.s, '海边合照');
    assert.equal(hit.hits.length, 1, '只应命中那张有描述的图');
    assert.equal(hit.hits[0].id, b.img.id);
    assert.equal(hit.skipped, 1);
});

test('X3-4 事后补描述：undescribed 转 ok 并可召回', () => {
    const b = base();
    const d = M.describe(b.s, b.raw.id, '一只蹲在窗台的猫');
    assert.equal(d.ok, true);
    assert.equal(d.entry.state, 'ok');
    const hit = M.recall(d.store, '窗台的猫');
    assert.equal(hit.hits[0].id, b.raw.id);
});

test('X3-5 语音保留「是语音」属性，转写参与检索', () => {
    const b = base();
    assert.equal(b.aud.modality, 'audio');
    const hit = M.recall(b.s, '有点累');
    assert.equal(hit.hits[0].modality, 'audio');
    assert.equal(hit.hits[0].label, '语音');
});

test('X3-6 召回命中可回溯：楼层 / 来源 / 模态标签', () => {
    const b = base();
    const h = M.recall(b.s, '海边合照')[0] || M.recall(b.s, '海边合照').hits[0];
    assert.equal(h.floor, 12);
    assert.equal(h.srcId, 'img1');
    assert.equal(h.label, '图片');
    assert.match(h.text, /海边合照/);
});

test('X3-7 注入标注与条目属性同源', () => {
    const b = base();
    const t1 = M.injectText(b.img);
    assert.match(t1, /^（图片）/);
    assert.match(t1, /第三天黄昏/);
    const t2 = M.injectText(b.aud);
    assert.match(t2, /^（语音）/);
    assert.match(t2, /有点累/);
});

test('X3-8 删除源图：转 dangling，列表仍可见并带原因', () => {
    const b = base();
    const r = M.removeSource(b.s, 'img1');
    assert.equal(r.ok, true);
    assert.deepEqual(r.changed, [b.img.id]);
    const view = M.list(r.store);
    const row = view.rows.find((x) => x.id === b.img.id);
    assert.equal(row.state, 'dangling');
    assert.match(row.reason, /源已删除/);
    assert.equal(view.total, 3, '不得静默消失');
});

test('X3-9 dangling 不进注入面，也不再被召回', () => {
    const b = base();
    const r = M.removeSource(b.s, 'img1');
    assert.equal(M.injectText(r.store.entries.find((e) => e.id === b.img.id)), '');
    assert.equal(M.recall(r.store, '海边合照').hits.length, 0);
});

test('X3-10 未描述条目不编造内容', () => {
    const b = base();
    assert.equal(M.injectText(b.raw), '');
    assert.equal(M.list(b.s).byModality.image, 2);
});

test('X3-11 接线 + 自检 + 经典脚本形态', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('multimodal-memory.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaMultimodalMemory', 'multimodal-memory.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.multimodal'));
    const s = M.mmSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /dangling=/);
    const raw = readFileSync(join(ROOT, 'multimodal-memory.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaMultimodalMemory = api;'));
    assert.ok(!/^export /m.test(raw));
});
