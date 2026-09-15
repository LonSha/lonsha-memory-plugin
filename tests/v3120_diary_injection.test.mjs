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
