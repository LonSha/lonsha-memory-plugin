import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf8');
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
