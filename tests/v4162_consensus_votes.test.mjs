// [v4.162.0 · R26-X9] 共识面板接多票：多人各投，票数说了算
// 验收口径：2:1 时多数方权重更高；1:1 时权重相等且标平票。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const S = require(join(ROOT, 'shared-event-memory.js'));

const SUM = S.summarize(S.fixture());
const board = () => S.createReviewBoard();
const vote = (by, action) => ({ by: by, action: action, at: '2026-11-18', why: by + ' 的意见' });

test('X9v-1 三票 2:1 ⇒ 多数方权重更高（票数说了算）', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'adopt-a'), vote('乙', 'adopt-a'), vote('丙', 'adopt-b')]);
    assert.equal(r.ok, true);
    assert.equal(r.tally['adopt-a'], 2);
    assert.equal(r.tally['adopt-b'], 1);
    assert.equal(r.winner, 'adopt-a');
    assert.equal(r.tie, false);
    assert.deepEqual(r.weights, { 林夏: 1, 陈舟: 0.5 });
});

test('X9v-2 平票 1:1 ⇒ 权重相等且如实标平票（不仲裁）', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'adopt-a'), vote('乙', 'adopt-b')]);
    assert.equal(r.tie, true);
    assert.equal(r.winner, '');
    assert.deepEqual(r.winners.sort(), ['adopt-a', 'adopt-b']);
    assert.deepEqual(r.weights, { 林夏: 1, 陈舟: 1 });
});

test('X9v-3 平票时不留「赢家」痕迹（不假装有结论）', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'adopt-a'), vote('乙', 'adopt-b')]);
    assert.equal(r.trace.length, 0);
});

test('X9v-4 采纳后两条都还在（只降权，不删）', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'adopt-b'), vote('乙', 'adopt-b'), vote('丙', 'adopt-a')]);
    assert.equal(r.kept, 2);
    const row = SUM.rows.find((x) => x.eventId === 'rain');
    assert.equal(row.perspectives.length, 2);
    assert.deepEqual(r.weights, { 林夏: 0.5, 陈舟: 1 });
});

test('X9v-5 存档多数 ⇒ 两边都 1（不分高低）', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'archive'), vote('乙', 'archive'), vote('丙', 'adopt-a')]);
    assert.equal(r.winner, 'archive');
    assert.deepEqual(r.weights, { 林夏: 1, 陈舟: 1 });
});

test('X9v-6 票数与 tally 自洽：合计等于票数', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'adopt-a'), vote('乙', 'adopt-b'), vote('丙', 'archive')]);
    const sum = Object.keys(r.tally).reduce((s, k) => s + r.tally[k], 0);
    assert.equal(sum, r.votes);
    assert.equal(r.votes, 3);
});

test('X9v-7 非法动作 / 撤回票 ⇒ 拒收且不改板', () => {
    const b = board();
    assert.deepEqual(S.applyVotes(b, SUM, 'rain', [vote('甲', 'nope')]).bad, ['unknown-action']);
    assert.deepEqual(S.applyVotes(b, SUM, 'rain', [vote('甲', 'revoke')]).bad, ['unknown-action']);
    assert.deepEqual(b.reviews, {});
});

test('X9v-8 事件不存在 ⇒ 具名 no-such-event', () => {
    assert.deepEqual(S.applyVotes(board(), SUM, 'zzz', [vote('甲', 'archive')]).bad, ['no-such-event']);
});

test('X9v-9 投票结果进留痛：板上可查票数与赢家', () => {
    const r = S.applyVotes(board(), SUM, 'rain', [vote('甲', 'adopt-a'), vote('乙', 'adopt-a')]);
    const trace = r.trace[r.trace.length - 1];
    assert.equal(trace.action, 'adopt-a');
    assert.equal(trace.votes, 2);
    assert.equal(trace.tie, false);
});

test('X9v-10 自检绿（一人一票的旧面仍可用）', () => {
    const sc = S.sharedSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
    const one = S.applyReview(board(), SUM, 'rain', { action: 'adopt-b', by: 'x', at: 't', why: 'w' });
    assert.equal(one.ok, true);
});
