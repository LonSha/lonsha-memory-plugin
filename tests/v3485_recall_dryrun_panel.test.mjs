/**
 * tests/v3485_recall_dryrun_panel.test.mjs — v3.485.0 干跑透视镜的面板控件
 *
 * 上一版（v3.484.0）把召回干跑做成了纯函数 + 诊断行，但**没有可视化**：
 *   用户能看到一行摘要，看不到「哪一条被谁挡下」。本版补面板，判据钉三件事：
 *   1. **控件的三态不同形**：缺席（带 reason）/ 空（本轮 0 条）/ 有读数 —— 前两者读数都是 0，
 *      压成一句「暂无」就分不清「机制没接上」与「这轮本来没捞到东西」（本仓 v3.428.0 同族）；
 *   2. **na ≠ green**：红线网格里「未设预算」是灰格，不是通过；
 *   3. **重新演练与首次同源**：把首次的 rows 投影成瘦候选再 inspect 一遍，
 *      排名 / 进预算数 / 被挡数 / token 用量必须逐字相同 —— 否则「重算」就是第二个真源。
 *
 * 只读源码断言的部分（面板 HTML 在模板串里，无 DOM 依赖可跑）与可执行部分分开写。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const LENS = require(path.join(root, 'recall-dryrun-lens.js'));
const UI = read('settings-ui.js');
const IDX = read('index.js');
const REC = read('engine-recall.js');

test('1. 面板存在且接进总览：入口 / 路由 / 卡片三处都在', () => {
  assert.ok(UI.includes('plugin.showRecallDryRunLens = function()'), '缺面板本体');
  assert.ok(/if \(viewType === 'drylens'\) \{ return plugin\.showRecallDryRunLens\(\); \}/.test(UI), '缺路由分支');
  assert.ok(UI.includes('data-view="drylens"'), '总览缺入口卡片（进不去 = 没做）');
  assert.ok(UI.includes('召回干跑'), '卡片没有可读标签');
});

test('2. 三态不同形：缺席带 reason、空与缺席不共用文案', () => {
  const body = UI.slice(UI.indexOf('plugin.showRecallDryRunLens'), UI.indexOf('plugin.showBrowser = function'));
  assert.ok(body.includes("face('absent'"), '缺席态没有独立标记');
  assert.ok(body.includes("face('empty'"), '空态没有独立标记');
  assert.ok(body.indexOf("face('empty'") < body.indexOf("face('absent'"),
    '缺席与空必须先分辨再定文案：缺席绝不能走空态分支');
  assert.ok(/st\.active === false[\s\S]{0,120}reason/.test(body), '缺席必须带可读原因，不能只说不可用');
  assert.ok(/st\.state === 'empty'/.test(body), '空态判据丢了：会把「本轮 0 条」说成「还没跑过」');
});

test('3. na ≠ green：灰格与绿格在渲染上分开', () => {
  const body = UI.slice(UI.indexOf('plugin.showRecallDryRunLens'), UI.indexOf('plugin.showBrowser = function'));
  assert.ok(/x\.state === 'red' \? 'var\(--ls-error/.test(body), '红格必须有自己的色与形');
  assert.ok(/x\.state === 'green'/.test(body), '绿格判据丢了');
  assert.ok(body.includes('不等于'), '面板必须明说「灰格≠通过」，否则用户把它读成通过');
  assert.ok(/未设预算（只排名不裁）/.test(body), '未设预算要如实说，不能显示成 0/0');
});

test('4. 转义纪律：详情进属性、文本进节点', () => {
  const body = UI.slice(UI.indexOf('plugin.showRecallDryRunLens'), UI.indexOf('plugin.showBrowser = function'));
  assert.ok(/title="\$\{esc\(x\.detail\)\}"/.test(body), '格子详情进 title 必须转义');
  assert.ok(/esc\(x\.cutBy/.test(body), '拦截归因是自由文本，必须转义');
});

test('5. 重新演练：瘦候选不带正文，且方法真存在', () => {
  assert.ok(IDX.includes('rerunRecallDryRunLens()'), '插件类缺重算方法');
  assert.ok(REC.includes('_lastRecallDryRunInput'), '召回没留瘦候选，面板重算无从下手');
  const block = REC.slice(REC.indexOf('_lastRecallDryRunInput'), REC.indexOf('_lastRecallDryRunBudget'));
  assert.ok(!/\btext:\s*r\./.test(block) && !block.includes('text:'), '瘦候选带了正文（每轮多存一份上下文）');
  assert.ok(block.includes('tokens: r.tokens'), '瘦候选必须带 token 数，否则重算要重新估');
});

test('6. 重新演练与首次同源：瘦候选再 inspect 一遍，读数逐字相同', () => {
  const first = LENS.inspect({
    budgetTokens: 100,
    tokenOf: (c) => c.tokens,
    candidates: [
      { id: 'a', floor: 3, rrfScore: 0.2, tokens: 60, sources: { dense: 0.1, bm25: 0.1 } },
      { id: 'b', floor: 4, rrfScore: 0.9, tokens: 60, sources: { dense: 0.5, bm25: 0.4 } },
      { id: 'c', floor: 5, rrfScore: 0.5, tokens: 60, sources: { dense: 0.3, bm25: 0.2 } }
    ]
  });
  const slim = first.rows.map((r) => ({
    id: r.id, floor: r.floor, rrfScore: r.rrfScore,
    sources: { dense: r.dense, bm25: r.bm25 }, tokens: r.tokens
  }));
  const again = LENS.inspect({ candidates: slim, budgetTokens: 100 });
  assert.deepEqual(again.rows.map((r) => r.id), first.rows.map((r) => r.id), '排名必须逐字相同');
  assert.equal(again.readings.admitted, first.readings.admitted);
  assert.equal(again.readings.cut, first.readings.cut);
  assert.equal(again.readings.tokensUsed, first.readings.tokensUsed);
  assert.deepEqual(again.redLines.map((r) => r.state), first.redLines.map((r) => r.state));
});

test('7. 重算入口的三态：没有候选与模块缺席不混同', () => {
  const m = IDX.slice(IDX.indexOf('rerunRecallDryRunLens()'), IDX.indexOf('rerunRecallDryRunLens()') + 1200);
  assert.ok(m.includes("reason: 'no-candidates'"), '没有候选要有独立 reason');
  assert.ok(m.includes("reason: 'module-missing'"), '模块缺席要有独立 reason');
  assert.ok(m.includes('rerun: true'), '重算出来的读数要能被面板标成「重算」而不是「上一轮」');
});

test('8. 当版自锚（版本守卫 V4）', () => {
  const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  const cur = (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1];
  assert.equal(cur, '3.485.0', 'index.js VERSION 应为 3.485.0，实得 ' + cur);
  assert.equal(vnum('3.485.0'), 3485000);
  assert.equal(JSON.parse(read('manifest.json')).version, '3.485.0');
  assert.equal(JSON.parse(read('package.json')).version, '3.485.0');
});
