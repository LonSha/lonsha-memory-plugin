/**
 * v3.113 — 配置覆盖度治理（settings-ui 高级调参区 + 功能开关补齐 + 保存整数取整）
 *
 * 背景：129 个 config 默认值键中此前仅 75 个在 settings-ui 可配，56 个键用户完全无法调整，
 *      其中包含 42 个默认开/正数的功能开关与调参（用户被锁死在默认值上）。
 *      本版不新增功能机制，只补齐可配置性 + 修保存逻辑的整数语义。
 *
 * 覆盖：
 *   0  版本号
 *   1  高级调参区存在且键齐全
 *   2  功能开关组覆盖默认开的功能
 *   3  data-cfg-num 键全部能在 settings-ui 找到对应控件（保存逻辑可达）
 *   4  保存逻辑：整数步进取整（语义修复）
 *   5  默认值不被 UI 改变（向后兼容）
 *   6  残余不可配键白名单（只允许提示词/算法常量/默认关实验开关）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const suiSrc = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// config 默认值块
const blockMatch = /config\s*=\s*\{([\s\S]*?)\n {12}\};/.exec(idxSrc);
const block = blockMatch ? blockMatch[1] : '';
const cfgKeys = [...block.matchAll(/^ {16}([a-zA-Z0-9_]+):/gm)].map((x) => x[1]);
// settings-ui 引用键
const suiKeys = new Set([
  ...[...suiSrc.matchAll(/ck\('([a-zA-Z0-9_]+)'/g)].map((x) => x[1]),
  ...[...suiSrc.matchAll(/data-cfg(?:-num|-text)?="([a-zA-Z0-9_]+)"/g)].map((x) => x[1]),
  // 提示词走专用 textarea（id="ls-prompt"），不计入缺口
  'extractionPrompt',
]);

// ---------- 0 ----------
test('【0】版本号', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.113.0'), `index.js 版本 ${v} < 3.113.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.113.0'), `manifest 版本 ${manifest.version} < 3.113.0`);
  ok('版本号');
});

// ---------- 1 ----------
test('【1】高级调参区存在且键齐全', () => {
  assert.ok(suiSrc.includes('id="ls-advanced"'), '可折叠高级调参区存在');
  const advAt = suiSrc.indexOf('id="ls-advanced"');
  const advBlock = suiSrc.slice(advAt, suiSrc.indexOf('</details>', advAt) + 10);
  const advKeys = [...advBlock.matchAll(/data-cfg-num="([a-zA-Z0-9_]+)"/g)].map((x) => x[1]);
  assert.ok(advKeys.length >= 25, `高级调参区滑条数 ${advKeys.length} >= 25`);
  // 每个滑条都有配对的标签显示
  for (const k of ['memoryTokenBudget', 'vectorMaxCount', 'summaryMaxCount', 'bm25TopK',
    'vectorChunkThreshold', 'vectorChunkSize', 'echoMaxCount', 'entropyThreshold',
    'historicalFoldThreshold', 'optimizeEveryFloors', 'archivePreserveRecent']) {
    assert.ok(advBlock.includes('data-cfg-num="' + k + '"'), '高级调参区含 ' + k);
  }
  ok('高级调参区（' + advKeys.length + ' 个滑条）');
});

// ---------- 2 ----------
test('【2】功能开关组覆盖默认开的功能', () => {
  const onByDefault = ['protagonistTracking', 'dualTimeAnchorEnabled', 'charMemEnabled',
    'neuralChainEnabled', 'npcTierInjection', 'npcTiesInjection', 'recallCacheEnabled',
    'heatOnRecallEnabled', 'recallTierEnabled', 'synopsisFastPath', 'aiRecallOps',
    'pyramidAutoExtend', 'supersedeEnabled', 'lockedFactsEnabled',
    'outlineDirectorEnabled', 'outlineAutoPlan', 'trailMonitor'];
  for (const k of onByDefault) {
    assert.ok(suiKeys.has(k), '默认开但此前不可关的功能已补开关: ' + k);
  }
  // 默认关的独立功能开关也补
  for (const k of ['worldProgressEnabled', 'vectorChunkEnabled', 'autoArchiveCovered']) {
    assert.ok(suiKeys.has(k), '默认关的独立功能开关已补: ' + k);
  }
  ok('功能开关组（' + onByDefault.length + ' 个默认开 + 3 个默认关）');
});

// ---------- 3 ----------
test('【3】data-cfg-num 键保存逻辑可达', () => {
  const numKeys = [...suiSrc.matchAll(/data-cfg-num="([a-zA-Z0-9_]+)"/g)].map((x) => x[1]);
  assert.ok(numKeys.length >= 40, `data-cfg-num 控件数 ${numKeys.length} >= 40`);
  // 保存逻辑能处理所有 data-cfg-num（querySelectorAll 是全局选择，<details> 折叠不影响保存）
  const saveAt = suiSrc.indexOf("overlay.querySelectorAll('[data-cfg-num]')");
  assert.ok(saveAt > 0, '保存逻辑存在 data-cfg-num 分支');
  ok('保存逻辑可达（' + numKeys.length + ' 个数值控件）');
});

// ---------- 4 ----------
test('【4】保存逻辑整数取整（语义修复）', () => {
  const saveAt = suiSrc.indexOf("overlay.querySelectorAll('[data-cfg-num]')");
  const block = suiSrc.slice(saveAt, suiSrc.indexOf('});', saveAt));
  assert.ok(/Math\.round/.test(block), '整数步进的滑条保存时取整');
  assert.ok(/Number\.isInteger\(step\)/.test(block), '按 step 判定是否取整');
  // 旧的全量 parseInt 特例仍保留（向后兼容）
  assert.ok(block.includes('vectorTopK'), '既有 parseInt 特例未删');
  ok('保存逻辑整数语义');
});

// ---------- 4b ----------
test('【4b】滑条联动通用化（不再靠硬编码 id 映射表）', () => {
  // 旧的硬编码映射表已删除
  assert.ok(!/vectorTopK: 'ls-v-topk'/.test(suiSrc), '硬编码 id 映射表已移除');
  // 新逻辑按 DOM 就近查找，能覆盖全部滑条（含本版新增的）
  const linkAt = suiSrc.indexOf("滑块实时显示");
  assert.ok(linkAt > 0, '联动逻辑存在');
  const linkBlock = suiSrc.slice(linkAt, linkAt + 900);
  assert.ok(linkBlock.includes("querySelectorAll('input[type=range]')"), '全局选择所有 range 控件');
  assert.ok(linkBlock.includes('previousElementSibling'), '就近回溯查找标签');
  assert.ok(!linkBlock.includes('getElementById(map['), '不再依赖 id 映射');
  // 每个 data-cfg-num 滑条上方都应有配对的 .ls-slider-val 标签（结构自检）
  const sliderRe = /<input type="range"[^>]*data-cfg-num="([a-zA-Z0-9_]+)"/g;
  const labelRe = /class="ls-slider-val"[^>]*>([^<]*)</g;
  const sliders = [...suiSrc.matchAll(sliderRe)].length;
  const labels = [...suiSrc.matchAll(labelRe)].length;
  assert.ok(labels >= sliders, `标签数 ${labels} >= 滑条数 ${sliders}（每个滑条有联动目标）`);
  ok('滑条联动通用化（' + sliders + ' 滑条 / ' + labels + ' 标签）');
});

// ---------- 5 ----------
test('【5】默认值不被 UI 改变（向后兼容）', () => {
  // 本版只加 UI 控件，不动任何 config 默认值
  for (const k of ['memoryTokenBudget', 'vectorMaxCount', 'summaryMaxCount',
    'bm25TopK', 'entropyThreshold', 'echoMaxCount', 'archivePreserveRecent']) {
    const re = new RegExp('^ {16}' + k + ':\\s*([^,]+),', 'm');
    const m = re.exec(idxSrc);
    assert.ok(m, '默认值仍在: ' + k);
  }
  assert.ok(/memoryTokenBudget:\s*900/.test(idxSrc), 'memoryTokenBudget 默认 900 未动');
  assert.ok(/vectorMaxCount:\s*500/.test(idxSrc), 'vectorMaxCount 默认 500 未动');
  ok('默认值零变更');
});

// ---------- 6 ----------
test('【6】残余不可配键白名单', () => {
  const missing = cfgKeys.filter((k) => !suiKeys.has(k));
  // 只允许这些：提示词（内部常量/专用编辑器）、算法内部常量、默认关的实验开关
  const allowed = new Set([
    'extractRolesPrompt',      // 世界书角色提取提示词（内部，低频）
    'pageRankDamping',         // 图算法内部常量
    'dppLambda',               // 多样性算法内部常量
    'budgetStrategy',          // 预算策略枚举（balanced 固定）
    'secondaryApis',           // JSON 对象，面板内已有文字提示去配置文件配
    'aiRecallOpsDebug',        // 调试开关
    'onDemandTriggerPhrase',   // 触发词已由 smartTriggerPatterns 覆盖
    'pyramidTiers',            // 层级结构数组（内部）
    'memoryTreeEnabled',       // 默认关实验功能
  ]);
  const unexpected = missing.filter((k) => !allowed.has(k));
  assert.deepStrictEqual(unexpected, [], '意外不可配的键: ' + unexpected.join(', '));
  console.log('  残余 ' + missing.length + ' 个均为白名单内（提示词/算法常量/实验开关）');
  ok('残余不可配键白名单');
});

console.log(`\n[v3.113] 配置覆盖度治理：${pass} 组断言通过`);