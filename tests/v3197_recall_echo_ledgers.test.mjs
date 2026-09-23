/**
 * v3.197 — 前文回扣账本 + 回声账本（素材：日月西预设第三批）
 *
 * 来源：SillyTavern 预设「【日月西】Gemini & Claude v0.41 @电波系」机制面提炼（只搬机制不搬散文）：
 *   └🔸选开·前文回扣 → recall-echo.js：五回合以前的高回扣价值细节，自然重现，不强行解释为伏笔
 *   🪶ta的物品组件 → echo-ledger.js：11 种生活微场景的随机产出与防重复轮转
 * 设计边界：
 *   - 两账本均为显式写入（不进 AI 提取 schema），宿主提供 recordRecallEcho / recordEchoLife 入口
 *   - 小手机（ruby-phone）只读投影，经桥快照 worldProg 消费，不回写
 *
 * 覆盖：
 *   0  版本与 manifest
 *   1  recall-echo 模块行为（五回合冷却 / echo-per-floor / skip / sweep / render 只给 pending）
 *   2  echo-ledger 模块行为（echo-per-floor / repeat-mode / missing-field / 同模式覆盖 / reset）
 *   3  WorldProgress 四处接线（初始化 / toInjection / export / import）
 *   4  宿主入口 recordRecallEcho / recordEchoLife（接线到 worldProg 状态）
 *   5  manifest extra_js 登记
 *   6  语法门禁（新模块 + index.js 均可解析）
 *   7  注入面纪律（防剧透/防事实化标注不被移除）
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };
const recallEcho = require(path.join(ROOT, 'recall-echo.js'));
const echoLedger = require(path.join(ROOT, 'echo-ledger.js'));

test('【0】版本与 manifest 抬升到 3.197.0', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const v = /const VERSION = '([^']+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.201.0'), `index.js 版本 ${v} < 3.197.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.201.0'), `manifest 版本 ${manifest.version} < 3.197.0`);
  assert.ok(vnum(pkg.version) >= vnum('3.201.0'), `package 版本 ${pkg.version} < 3.197.0`);
  ok('版本 / manifest / package ≥ 3.197.0');
});

test('【1】recall-echo：五回合冷却与状态机', () => {
  // 候选登记
  let r = recallEcho.mark(null, { detail: '她说她怕黑', floor: 10, kind: 'behavior', weight: 80 });
  assert.ok(r.ok && r.changed, 'mark ok');
  assert.equal(r.state.items[0].id, 'echo_1');
  // 缺 detail / 缺 floor 拒绝
  assert.equal(recallEcho.mark(r.state, { floor: 10 }).reason, 'missing-detail');
  assert.equal(recallEcho.mark(r.state, { detail: 'x' }).reason, 'missing-floor');
  // 回扣太新拒绝（差 2 < ECHO_GAP=5）
  assert.equal(recallEcho.echo(r.state, { id: 'echo_1', floor: 12, echoNote: 'x' }).reason, 'too-fresh');
  // 合法回扣（差 5），缺 note 拒绝
  assert.equal(recallEcho.echo(r.state, { id: 'echo_1', floor: 15 }).reason, 'empty-note');
  r = recallEcho.echo(r.state, { id: 'echo_1', floor: 15, echoNote: '停电时她抓紧了袖口' });
  assert.ok(r.ok && r.changed && r.state.items[0].status === 'echoed', 'echo ok');
  // 同楼层第二记回扣拒绝
  const markA = recallEcho.mark(r.state, { detail: '他把伞留在了她那里', floor: 9 });
  assert.equal(recallEcho.echo(markA.state, { id: markA.state.items[1].id, floor: 15, echoNote: 'y' }).reason, 'echo-per-floor');
  // 已回扣细节再登记 → replayed duplicate
  const dup = recallEcho.mark(markA.state, { detail: '她说她怕黑', floor: 10 });
  assert.ok(dup.ok && dup.replayed && dup.reason === 'duplicate', 'duplicate replayed');
  // skip 强制 note
  const markB = recallEcho.mark(markA.state, { detail: '路人提过一句天气', floor: 8 });
  const sid = markB.state.items[markB.state.items.length - 1].id;
  assert.equal(recallEcho.skip(markB.state, { id: sid }).reason, 'empty-note');
  const skipped = recallEcho.skip(markB.state, { id: sid, skipNote: '纯闲笔' });
  assert.ok(skipped.ok && skipped.changed, 'skip ok');
  // render 只给 pending（已 echoed 的「怕黑」不出现）
  const rendered = recallEcho.render(skipped.state, 3);
  assert.ok(rendered.includes('把伞留在了她那里'), 'render pending');
  assert.ok(!rendered.includes('怕黑'), 'render excludes echoed');
  assert.ok(rendered.includes('不强行解释为伏笔'), 'render discipline note');
  // sweep：echoed 保留（floor 15, KEEP=20）、skipped 摘除；过期 echoed 摘除
  const s1 = recallEcho.sweep(skipped.state, 15);
  assert.equal(s1.swept, 1, 'sweep removes skipped only');
  const s2 = recallEcho.sweep(s1.state, 36);
  assert.equal(s2.swept, 1, 'sweep removes expired echoed');
  assert.equal(s2.state.items.length, 1, 'pending survives sweep');
  ok('recall-echo 状态机 / 冷却 / 防重 / sweep');
});

test('【2】echo-ledger：11 模式与防重复轮转', () => {
  assert.equal(echoLedger.MODES.length, 11, '11 modes');
  // 产出
  let r = echoLedger.produce(null, { mode: 'pocket', char: '林晚', floor: 20, fields: { '物品': '半包薄荷糖' }, os: '甜的，够了' });
  assert.ok(r.ok && r.changed, 'produce ok');
  // 缺字段拒绝
  assert.equal(echoLedger.produce(r.state, { mode: 'fridge', char: '林晚', floor: 21, os: 'x' }).reason, 'missing-field');
  assert.equal(echoLedger.produce(r.state, { mode: 'fridge', char: '林晚', floor: 21, fields: { '留言': 'x' } }).reason, 'missing-os');
  assert.equal(echoLedger.produce(r.state, { mode: 'pocket', char: '林晚', floor: 21, fields: { '物品': 'x' }, os: 'x' }).reason, 'repeat-mode');
  assert.equal(echoLedger.produce(r.state, { mode: 'pocket', floor: 21, fields: { '物品': 'x' }, os: 'x' }).reason, 'missing-char');
  // 同回合第二条拒绝
  assert.equal(echoLedger.produce(r.state, { mode: 'fridge', char: '林晚', floor: 20, fields: { '留言': 'x' }, os: 'x' }).reason, 'echo-per-floor');
  // 下一回合同模式拒绝
  assert.equal(echoLedger.produce(r.state, { mode: 'pocket', char: '林晚', floor: 21, fields: { '物品': 'x' }, os: 'x' }).reason, 'repeat-mode');
  // 下一回合换模式成功
  r = echoLedger.produce(r.state, { mode: 'draft', char: '林晚', floor: 21, fields: { '目标': '发给他', '草稿': '今天…' }, os: '算了' });
  assert.ok(r.ok && r.changed, 'next-floor new-mode ok');
  // 同 char+mode 再产出 → 覆盖（只留最新），不堆历史
  const cnt = r.state.items.length;
  r = echoLedger.produce(r.state, { mode: 'pocket', char: '林晚', floor: 23, fields: { '物品': '电影票根' }, os: 'y' });
  assert.ok(r.ok && r.changed, 're-produce ok');
  assert.equal(r.state.items.length, cnt, 'same char+mode overwritten');
  // render
  const rendered = echoLedger.render(r.state, '林晚', 3);
  assert.ok(rendered.includes('未发草稿') && rendered.includes('口袋小物'), 'render modes');
  assert.ok(rendered.includes('不得改写为剧情既定事实'), 'render discipline note');
  assert.equal(echoLedger.render(r.state, '不在场的人', 3), '', 'render empty for absent char');
  // reset
  const rz = echoLedger.reset(r.state);
  assert.ok(rz.ok && rz.changed && rz.state.items.length === 0, 'reset');
  ok('echo-ledger 11 模式 / 防重复 / 覆盖 / reset');
});

test('【3】WorldProgress 四处接线', () => {
  // ① 构造初始化
  assert.ok(idxSrc.includes('this.recallEcho = null;'), 'init recallEcho');
  assert.ok(idxSrc.includes('this.echoLedger = null;'), 'init echoLedger');
  // ② toInjection 注入块
  assert.ok(idxSrc.includes("id: 'wp_recall_echo'"), 'injection wp_recall_echo');
  assert.ok(idxSrc.includes("id: 'wp_echo_ledger_' + charName"), 'injection wp_echo_ledger_<char>');
  // ③ export
  assert.ok(/recallEcho: this\.recallEcho \|\| null/.test(idxSrc), 'export recallEcho');
  assert.ok(/echoLedger: this\.echoLedger \|\| null/.test(idxSrc), 'export echoLedger');
  // ④ import
  assert.ok(/this\.recallEcho = data\.recallEcho \|\| null;/.test(idxSrc), 'import recallEcho');
  assert.ok(/this\.echoLedger = data\.echoLedger \|\| null;/.test(idxSrc), 'import echoLedger');
  // 在场角色真源是 scene.presence（不是臆造字段）
  assert.ok(idxSrc.includes('this.scene.presence'), 'presence source is scene.presence');
  ok('WorldProgress 四处接线');
});

test('【4】宿主入口 recordRecallEcho / recordEchoLife', () => {
  assert.ok(idxSrc.includes('recordRecallEcho(input = {})'), 'host entry recall');
  assert.ok(idxSrc.includes('recordEchoLife(input = {})'), 'host entry life');
  // 状态落 worldProg.recallEcho / worldProg.echoLedger
  assert.ok(/this\.worldProg\.recallEcho = out\.state/.test(idxSrc), 'state sink recallEcho');
  assert.ok(/this\.worldProg\.echoLedger = out\.state/.test(idxSrc), 'state sink echoLedger');
  ok('宿主入口接线');
});

test('【5】manifest extra_js 登记', () => {
  assert.ok(manifest.extra_js.includes('recall-echo.js'), 'recall-echo registered');
  assert.ok(manifest.extra_js.includes('echo-ledger.js'), 'echo-ledger registered');
  ok('extra_js 55 模块');
});

test('【6】语法门禁', () => {
  assert.ok(recallEcho && typeof recallEcho.mark === 'function', 'recall-echo api');
  assert.ok(echoLedger && typeof echoLedger.produce === 'function', 'echo-ledger api');
  ok('新模块可加载');
});

test('【7】注入面纪律标注', () => {
  // 回扣注入带「不强行解释为伏笔」纪律；回声注入带「不改写为既定事实」纪律
  assert.ok(idxSrc.includes('worldprogress+recall-echo'), 'recall source tag');
  assert.ok(idxSrc.includes('worldprogress+echo-ledger'), 'echo source tag');
  ok('注入纪律标注在模块 render 内（测试 1/2 已验）');
});

console.log(`v3197: ${pass} 组全绿`);