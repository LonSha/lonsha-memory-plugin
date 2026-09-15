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

test('v3.121 时间变化支持日期窗口与角色关联', () => {
  assert.match(src, /windowDays = 3, characters = \[\]/);
  assert.match(src, /Date\.UTC\(anchor\.year/);
  assert.match(src, /ecs\.some\(x => allowed\.has\(x\)\)/);
  assert.match(src, /timelineWindowDays/);
});
test('v3.121 时间倒退保留诊断证据', () => {
  assert.match(src, /this\._timeWentBack = \{/);
  assert.match(src, /timeWentBack: this\._timeWentBack/);
});

test('v3.123 时间变化覆盖状态、关系、物品并隔离聊天与 swipe', () => {
  assert.match(src, /status:change/); assert.match(src, /pair:change/); assert.match(src, /items:change/);
  assert.match(src, /_timelineCursorChatId/); assert.match(src, /_timelineCursorFingerprint/);
});

test('v3.123 时间变化候选继续走统一候选池', () => {
  assert.match(src, /const _castForChanges = this\.captureCast\(\)/);
  assert.match(src, /_timelineChangeFloor = _currentTimeFloor/);
});

test('v3.124 echo 合并必须保留变化驱动候选池而非只保留普通召回', () => {
  const start = src.indexOf('if (this.config.config.echoEnabled)');
  const end = src.indexOf('// [v3.16] 世界推进', start);
  assert.ok(start >= 0 && end > start);
  const block = src.slice(start, end);
  assert.match(block, /for \(const r of candidateItems\) merged\.set/);
  assert.doesNotMatch(block, /for \(const r of recalled\) merged\.set/);
});

test('v3.125 变化候选精选后进入追踪与注入构建', () => {
  const selectAt = src.indexOf('const selRes = await this.aiSelect.route');
  const trackAt = src.indexOf('this._lastSelectedIds = Array.from', selectAt);
  const buildAt = src.indexOf('this.buildInjection(candidateItems)', trackAt);
  assert.ok(selectAt >= 0 && trackAt > selectAt && buildAt > trackAt);
});

test('v3.127 状态/关系/物品变化候选进入候选池前统一去重', () => {
  assert.match(src, /const _seenAny = new Set\(candidateItems\.flatMap/);
  assert.match(src, /const _pushChange = \(arr\) => \{/);
  // 三路都必须经过去重器，不得再直推候选池
  assert.match(src, /const _addedStatus = _pushChange\(_statusChanges\)/);
  assert.match(src, /const _addedPair = _pushChange\(_pairChanges\)/);
  assert.match(src, /const _addedItem = _pushChange\(_itemChanges\)/);
  assert.doesNotMatch(src, /for \(const _c of \(this\.status\?\.getChangesSince\?\.\(_timeCursor, _castForChanges, 8\) \|\| \[\]\)\) candidateItems\.push\(_c\)/);
  assert.doesNotMatch(src, /for \(const _c of \(this\.pairMem\?\.getChangesSince\?\.\(_timeCursor, _castForChanges, 6\) \|\| \[\]\)\) candidateItems\.push\(_c\)/);
});

test('v3.127 变化注入产量与游标对诊断可见', () => {
  assert.match(src, /this\._lastChangeTrace = \{/);
  assert.match(src, /_lastChangeTrace = null/);
  // 日记产量并入同一轨迹
  assert.match(src, /diary: \{ found: _changes\.length, added: _addedDiary, cursor: _cursor \}/);
  // 设置面板暴露变化注入诊断（含游标与时间倒跳）
  const ui = readFileSync('/home/user/lonsha-memory-plugin/settings-ui.js', 'utf8');
  assert.match(ui, /_lastChangeTrace/);
  assert.match(ui, /变化注入（Horae\/HCDiary 诊断）/);
  assert.match(ui, /_timelineInjectFloor/);
  assert.match(ui, /_timeWentBack/);
});
