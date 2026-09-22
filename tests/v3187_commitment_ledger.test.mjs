import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const api = require(join(dirname(fileURLToPath(import.meta.url)), '../commitment-ledger.js'));

test('约定可建立、改期并完成，且历史保留原因', () => {
  const opened = api.open(null, { actor: '林夏', counterpart: '玩家', content: '周五归还借款', due: '周五', floor: 10, source: 'story', eventKey: 'e1' });
  const amended = api.amend(opened.state, { id: opened.item.id, due: '下周一', reason: '临时出差', floor: 12, eventKey: 'e2' });
  const done = api.fulfill(amended.state, { id: opened.item.id, floor: 15, source: 'story', eventKey: 'e3' });
  assert.equal(done.item.status, 'fulfilled');
  assert.equal(done.item.due, '下周一');
  assert.deepEqual(done.item.history.map((event) => event.action), ['open', 'amend', 'fulfill']);
  assert.equal(done.item.history[1].reason, '临时出差');
  assert.equal(api.list(done.state, { status: 'open' }).length, 0);
});

test('相同约定幂等，终态后不能被后续事件改写', () => {
  const opened = api.open({}, { actor: '林夏', content: '周五归还借款', eventKey: 'same' });
  const replay = api.open(opened.state, { actor: '林夏', content: '周五归还借款', eventKey: 'same' });
  assert.equal(replay.changed, false);
  assert.equal(replay.state.items.length, 1);
  const cancelled = api.cancel(opened.state, { id: opened.item.id, reason: '双方取消', eventKey: 'cancel' });
  const late = api.fulfill(cancelled.state, { id: opened.item.id, eventKey: 'late' });
  assert.equal(late.changed, false);
  assert.equal(late.item.status, 'cancelled');
});

test('缺少事实时拒绝，渲染只显示未完成约定', () => {
  const rejected = api.open({}, { actor: '林夏' });
  assert.equal(rejected.ok, false);
  const opened = api.open({}, { actor: '林夏', counterpart: '玩家', content: '到站后发消息', due: '今晚' });
  const broken = api.break(opened.state, { actor: '林夏', content: '到站后发消息', reason: '失约', eventKey: 'broken' });
  assert.equal(api.render(opened.state), '【未完成约定】\n- cmt_1 林夏 对 玩家：到站后发消息（今晚前）');
  assert.equal(api.render(broken.state), '');
  assert.deepEqual(api.summarize(broken.state), { open: 0, fulfilled: 0, broken: 1, cancelled: 0 });
});

test('损坏状态被归一化，账本上限保留最新 200 条', () => {
  const dirty = api.normalize({ seq: 3, items: [{ id: 'cmt_1' }, { id: 'cmt_1', actor: '甲', content: '第一次' }, { actor: '乙', content: '无编号' }] });
  assert.equal(dirty.items.length, 1);
  const items = Array.from({ length: 205 }, (_, index) => ({ id: 'cmt_' + index, actor: '甲', content: '事项' + index, status: 'open' }));
  assert.equal(api.normalize({ seq: 205, items }).items.length, 200);
});