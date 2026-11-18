// [v4.163.0 · R26-X2] 图片人物溯源：这张图是谁发的、在第几层、图里有谁
// 验收口径：反查一个人物不存在的图，返回空而不是编一个名字。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'multimodal-memory.js'));

function scene() {
    let st = M.createStore();
    st = M.register(st, { modality: 'image', id: 'img1', floor: 12, srcId: 'msg-7', sender: '陈舟', people: ['林夏', '陈舟'], description: '海边两个人并肩站着' }).store;
    st = M.register(st, { modality: 'image', id: 'img2', floor: 13, srcId: 'msg-8', description: '一张没人的风景' }).store;
    st = M.register(st, { modality: 'audio', id: 'a1', floor: 14, srcId: 'msg-9', sender: '林夏', transcript: '他说要走' }).store;
    return st;
}

test('X2-1 按图反查：楼层 / 发送者 / 源消息都在回执里', () => {
    const pv = M.provenance(scene(), 'img1');
    assert.equal(pv.ok, true);
    assert.equal(pv.modality, 'image');
    assert.equal(pv.label, '图片');
    assert.equal(pv.floor, 12);
    assert.equal(pv.srcId, 'msg-7');
    assert.equal(pv.sender, '陈舟');
    assert.equal(pv.senderKnown, true);
});

test('X2-2 多人物图：全部列出并标主次（登记顺序即主次，不重排）', () => {
    const pv = M.provenance(scene(), 'img1');
    assert.deepEqual(pv.people.map((p) => p.name), ['林夏', '陈舟']);
    assert.deepEqual(pv.people.map((p) => p.order), [1, 2]);
    assert.deepEqual(pv.people.map((p) => p.primary), [true, false]);
    assert.equal(pv.primary, '林夏');
    assert.equal(pv.peopleCount, 2);
});

test('X2-3 一个人物都没有的图 ⇒ 返回空，不编一个名字', () => {
    const pv = M.provenance(scene(), 'img2');
    assert.deepEqual(pv.people, []);
    assert.equal(pv.primary, null);
    assert.equal(pv.peopleCount, 0);
});

test('X2-4 没有发送者 ⇒ sender 为 null 且 senderKnown:false（宁可空着也不猜）', () => {
    const pv = M.provenance(scene(), 'img2');
    assert.equal(pv.sender, null);
    assert.equal(pv.senderKnown, false);
});

test('X2-5 楼层从库里的条目取（命中面不带这字段）', () => {
    const st = scene();
    assert.equal(M.provenance(st, 'img1').floor, 12);
    assert.equal(M.provenance(st, 'a1').floor, 14);
    M.recall(st, '海边');   // 检索一趟，不影响溯源读数
    assert.equal(M.provenance(st, 'img1').floor, 12);
});

test('X2-6 查不到条目 ⇒ 具名 no-such-entry，不返回空对象当成功', () => {
    const pv = M.provenance(scene(), 'no-such-image');
    assert.equal(pv.ok, false);
    assert.deepEqual(pv.bad, ['no-such-entry']);
    assert.deepEqual(pv.people, []);
});

test('X2-7 图片总账：只列图片，没人物 / 没发送者各自计数', () => {
    const ix = M.imageIndex(scene());
    assert.equal(ix.count, 2);
    assert.deepEqual(ix.rows.map((r) => r.id), ['img1', 'img2']);
    assert.equal(ix.unnamed, 1);
    assert.equal(ix.noSender, 1);
    assert.equal(ix.rows[0].primary, '林夏');
});

test('X2-8 不只图片：语音条也能按同一条路溯源', () => {
    const pv = M.provenance(scene(), 'a1');
    assert.equal(pv.modality, 'audio');
    assert.equal(pv.label, '语音');
    assert.equal(pv.sender, '林夏');
    assert.equal(pv.floor, 14);
});

test('X2-9 溯源是只读的：跑一趟不改库', () => {
    const st = scene();
    const before = JSON.stringify(st);
    M.provenance(st, 'img1');
    M.imageIndex(st);
    assert.equal(JSON.stringify(st), before);
});

test('X2-10 自检绿', () => {
    assert.equal(M.mmSelfCheck().ok, true, JSON.stringify(M.mmSelfCheck().bad));
});
