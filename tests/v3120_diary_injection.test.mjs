import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
test('v3.120 变化日记接入生成链', () => {
  assert.match(src, /diaryChangeDrivenInjection: true/);
  assert.match(src, /this\.diary\?\.getChangesSince\?\./);
  assert.match(src, /source: 'diary:change'/);
  assert.match(src, /this._diaryInjectFloor = _diaryChangeFloor/);
});
test('v3.120 变化日记游标持久化', () => {
  assert.match(src, /diaryInjectFloor: Number.isFinite/);
  assert.match(src, /data.diaryInjectFloor/);
  assert.match(src, /this._diaryInjectFloor = null/);
});

test('v3.126 日记游标与时间线游标同语义回退', () => {
  // 删楼/回滚时游标同步回退
  assert.match(src, /rollbackFloor\.日记游标回滚/);
  // 聊天切换重置
  const chAt = src.indexOf('events.CHAT_CHANGED变化游标重置');
  assert.ok(chAt > 0);
  const block = src.slice(chAt - 400, chAt + 400);
  assert.match(block, /_diaryInjectFloor = null/);
  assert.match(block, /_timelineCursorChatId = null/);
  // 生成路径的游标边界处理同时覆盖日记游标
  const bAt = src.indexOf('onBeforeGeneration.时间线游标边界');
  assert.ok(bAt > 0);
  const gblock = src.slice(bAt - 900, bAt);
  assert.match(gblock, /this\._diaryInjectFloor = null/);
  assert.match(gblock, /Math\.max\(-1, _cursorFloor - 1\);   \/\/ \[v3\.126\]/);
});
