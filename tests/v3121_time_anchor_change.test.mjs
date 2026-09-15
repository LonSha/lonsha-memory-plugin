import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf8');
test('v3.121 时间线提供游标变化读取', () => {
  assert.match(src, /getChangesSince\(floor = -1, anchorDate = ''/);
  assert.match(src, /timeChangeDrivenInjection: true/);
});
test('v3.121 生成前接入时间锚点变化', () => {
  assert.match(src, /this\.timeline\?\.getChangesSince\?\./);
  assert.match(src, /source: 'timeline:change'/);
  assert.match(src, /this\._timelineInjectFloor = _timelineChangeFloor/);
});
test('v3.121 时间线游标持久化与回滚', () => {
  assert.match(src, /timelineInjectFloor: Number\.isFinite/);
  assert.match(src, /data\.timelineInjectFloor/);
  assert.match(src, /时间线游标回滚/);
});
