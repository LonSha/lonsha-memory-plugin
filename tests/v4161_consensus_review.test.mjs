// [v4.161.0 · R25-X9] 多人审阅与共识面板：分歧可以表态
// 验收口径：采纳后两条仍在，召回优先级改变且可回滚。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require(join(ROOT, 'shared-event-memory.js'));

const SUM = S.summarize(S.fixture());
function fresh() { return S.createReviewBoard(); }

test('X9-1 四种表态固定枚举（采纳 A / 采纳 B / 存档 / 撤回）', () => {
    assert.deepEqual(S.ACTIONS, ['adopt-a', 'adopt-b', 'archive', 'revoke']);
});

test('X9-2 采纳 A：两条都在（只降权，不删另一条）', () => {
    const r = S.applyReview(fresh(), SUM, 'rain', { action: 'adopt-a', by: '林夏', at: '2026-11-18', why: '我先看见的' });
    assert.equal(r.ok, true);
    assert.equal(r.kept, 2);
    const row = SUM.rows.find((x) => x.eventId === 'rain');
    assert.equal(row.perspectives.length, 2);
    assert.deepEqual(r.weights, { 林夏: 1, 陈舟: 0.5 });
});

test('X9-3 采纳后优先级改变：被采纳的排第一', () => {
    const r = S.applyReview(fresh(), SUM, 'rain', { action: 'adopt-a', by: '林夏', at: 't', why: 'w' });
    assert.equal(r.ranking[0].holder, '林夏');
    assert.equal(r.ranking[1].weight, 0.5);
});

test('X9-4 改采 B：优先级随之反转（可换主意）', () => {
    const a = S.applyReview(fresh(), SUM, 'rain', { action: 'adopt-a', by: '林夏', at: 't1', why: 'w1' });
    const b = S.applyReview(a.board, SUM, 'rain', { action: 'adopt-b', by: '陈舟', at: 't2', why: 'w2' });
    assert.deepEqual(b.weights, { 林夏: 0.5, 陈舟: 1 });
    assert.equal(b.ranking[0].holder, '陈舟');
    assert.equal(b.trace.length, 2);
});

test('X9-5 留痕：谁 / 何时 / 为什么，逐条可查', () => {
    const r = S.applyReview(fresh(), SUM, 'rain', { action: 'adopt-a', by: '林夏', at: '2026-11-18', why: '我先看见的' });
    assert.deepEqual(r.trace[0], { action: 'adopt-a', by: '林夏', at: '2026-11-18', why: '我先看见的', holders: ['林夏', '陈舟'] });
});

test('X9-6 撤回上一次表态：回到上一版权重（可回滚）', () => {
    const a = S.applyReview(fresh(), SUM, 'rain', { action: 'adopt-a', by: '林夏', at: 't1', why: 'w1' });
    const rev = S.applyReview(a.board, SUM, 'rain', { action: 'revoke' });
    assert.deepEqual(rev.weights, {});
    assert.equal(rev.trace.length, 0);
    const again = S.applyReview(rev.board, SUM, 'rain', { action: 'archive', by: 'x', at: 't', why: '存档' });
    assert.deepEqual(again.weights, { 林夏: 1, 陈舟: 1 });
});

test('X9-7 存档保留：两边都 1（不分高低）', () => {
    const r = S.applyReview(fresh(), SUM, 'rain', { action: 'archive', by: '旁白', at: 't', why: '都算数' });
    assert.deepEqual(r.weights, { 林夏: 1, 陈舟: 1 });
    assert.equal(r.ranking[0].weight, r.ranking[1].weight);
});

test('X9-8 单人事件没有分歧可采纳 ⇒ 具名 no-dispute', () => {
    const r = S.applyReview(fresh(), SUM, 'book', { action: 'adopt-a', by: 'x', at: 't', why: 'w' });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['no-dispute']);
});

test('X9-9 不存在的表态 / 不存在的事件 ⇒ 各自具名，且不改板', () => {
    const board = fresh();
    assert.deepEqual(S.applyReview(board, SUM, 'rain', { action: 'nope' }).bad, ['unknown-action']);
    assert.deepEqual(S.applyReview(board, SUM, 'zzz', { action: 'archive' }).bad, ['no-such-event']);
    assert.deepEqual(board.reviews, {});
});

test('X9-10 自检绿（分歧面与共识面都没破）', () => {
    const sc = S.sharedSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
