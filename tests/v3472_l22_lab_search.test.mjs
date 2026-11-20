/* tests/v3472_l22_lab_search.test.mjs — v3.472.0：实验室页签的任务分组、搜索与配置键唯一性
 *
 * 这组判据锁两个容易回归的事实：
 *   ① 实验室搜索必须是可执行接线，不是只有一个装饰 input；
 *   ② 实验室里的每个配置键只出现一次，避免重组时重复控件造成「后一个覆盖前一个」。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'settings-ui.js'), 'utf8');
const start = src.indexOf('id="ls-pane-advanced"');
const end = src.indexOf('<div class="ls-settings-footer"', start);
assert.ok(start > 0 && end > start, '实验室页签边界必须存在');
const lab = src.slice(start, end);

test('实验室搜索有可访问出口、清空按钮和真实过滤接线', () => {
  assert.match(lab, /id="ls-lab-search"/, '缺少实验室搜索框');
  assert.match(lab, /type="search"/, '搜索框必须使用 search 类型');
  assert.match(lab, /role="search"/, '搜索容器必须声明 search 语义');
  assert.match(lab, /id="ls-lab-clear"/, '缺少清空按钮');
  assert.match(lab, /id="ls-lab-result"[^>]*role="status"/, '缺少可读结果状态');
  assert.match(src, /const _applyLabSearch = \(\) =>/, '缺少搜索应用函数');
  assert.match(src, /group\.hidden = !hit/, '搜索必须实际隐藏/显示分组');
  assert.match(src, /_labSearch\.addEventListener\('input'/, '搜索必须响应输入');
  assert.match(src, /_labClear\.addEventListener\('click'/, '清空必须有接线');
  assert.match(src, /没有匹配的实验室设置/, '无结果必须给用户可理解反馈');
});

test('实验室按任务分成四组，旧实现层级标题已被替换', () => {
  const titles = [...lab.matchAll(/<div class="ls-group-title">([\s\S]*?)<\/div>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').trim());
  assert.deepEqual(titles, [
    '召回、预算与摘要',
    '因果、时间与叙事机制',
    '世界线、分支与跨层隔离',
    '角色、系统与底层开关',
  ]);
});

test('实验室每个配置键恰好出现一次', () => {
  const checks = [...lab.matchAll(/\$\{ck\(['"]([^'"]+)['"]/g)].map(m => m[1]);
  const nums = [...lab.matchAll(/data-cfg-num="([^"]+)"/g)].map(m => m[1]);
  const texts = [...lab.matchAll(/data-cfg-text="([^"]+)"/g)].map(m => m[1]);
  const keys = [...checks, ...nums, ...texts];
  assert.equal(keys.length, 101, '实验室控件总数变化：' + keys.length + '（预期 60 开关 + 31 数值 + 10 文本）');
  assert.equal(new Set(keys).size, keys.length, '实验室存在重复配置键：' + keys.filter((k, i) => keys.indexOf(k) !== i).join(','));
});

test('实验室重组不改变通用保存契约', () => {
  assert.match(src, /overlay\.querySelectorAll\('\[data-cfg\]'\)/, '开关保存入口缺失');
  assert.match(src, /overlay\.querySelectorAll\('\[data-cfg-num\]'\)/, '数值保存入口缺失');
  assert.match(src, /overlay\.querySelectorAll\('\[data-cfg-text\]'\)/, '文本保存入口缺失');
  assert.match(src, /role="tabpanel"[^>]*id="ls-pane-advanced"/, '实验室必须仍是 tabpanel');
});

/* [v3.472.0 · 版本锚] 当版锚点必须住在**当版套件**里（写进历史文件会被 scan_version_guard V2 抓）。
 *   本档是本版新建、且头部自述 v3.472.0，故是当版档案；抬版时锚点随本档交棒给下一版的 frontier。
 *   为何用 `vnum` 数值形而非串相等：V4 的计数口径只认 vnum（见 scan_version_guard 段头）。 */
test('版本锚：本套件只在 v3.472.0 及以后成立', () => {
  const vnum = (v) => Number(String(v).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
  const idx = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
  const ver = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
  assert.ok(ver, 'index.js 里必须有 const VERSION');
  assert.equal(vnum('3.472.0'), 3472000, '当版锚点');
  assert.ok(vnum(ver) >= vnum('3.472.0'), '版本必须不低于本版下限 3.472.0，实为 ' + ver);
});
