/**
 * tests/v3198_ledger_replay_r2_behavioral.test.mjs — v3.198.0
 *
 * 主题：`tests/audit/scan_v3182_ledger_replay.mjs` 的 R2 从「形态判据」升级为「行为判据」。
 *
 * 背景（handover 点名项）：
 *   原 R2 只做静态正则（`replayDrop(` / `replayShift(` / `_ledgerReplayLib(` 出现在
 *   剥注释文本里即可），回答的是「文本里有没有这串字符」，不是「回放会不会真的跑」。
 *   实测三种真退化全部漏检（本轮 probe 已证）：调用挪进死分支 / 宿主传空对象 /
 *   返回值被丢弃。三者在形态判据下全绿，却是真功能回归（删楼后记忆没被撤）。
 *
 * 本套件锁定升级后的两段式 R2：
 *   R2a 形态仍在（前置）；R2b 行为（主判据）真跑回放并验报告。
 *   以及 negctl 里新增的三条行为专属负控制（N6/N7/N8）。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const SCAN = read('tests/audit/scan_v3182_ledger_replay.mjs');
const NEGCTL = read('tests/audit/scan_v3182_ledger_replay_negctl.mjs');
const IDX = read('index.js');
const LR = read('ledger-replay.js');

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

/* 【0】版本锚点 */
test('v3198【0】版本 / manifest / package ≥ 3.198.0', () => {
  const pkg = JSON.parse(read('package.json'));
  const manifest = JSON.parse(read('manifest.json'));
  const v = /const VERSION = '([^']+)'/.exec(IDX)[1];
  assert.ok(vnum(v) >= vnum('3.200.0'), `index.js 版本 ${v} < 3.198.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.200.0'), `manifest ${manifest.version} < 3.198.0`);
  assert.ok(vnum(pkg.version) >= vnum('3.200.0'), `package ${pkg.version} < 3.198.0`);
});

/* 【1】源码面：R2b 存在且接线 */
test('v3198【1】R2b 行为探针已接入扫描器（真加载 vm 沙箱）', () => {
  assert.match(SCAN, /function replayBehaviorProbe\s*\(/, 'R2b 探针函数定义在');
  assert.match(SCAN, /replayBehaviorProbe\(\)/, 'R2b 探针被调用');
  assert.match(SCAN, /import vm from 'node:vm'/, '扫描器引入 vm 模块');
  // 行为判据的关键断言必须在（缺任一条都说明判据被稀释）
  assert.ok(SCAN.includes("rep.version"), 'R2b 读回放报告 version');
  assert.ok(SCAN.includes("state === 'ok'"), 'R2b 断言至少一本账 ok（抓「宿主传错」）');
  assert.ok(SCAN.includes("floor-ledger-disabled"), 'R2b 断言关账本时显式 skipped');
  assert.ok(SCAN.includes('rollbackFloor'), 'R2b 真调 rollbackFloor');
  // 头部说明须写明「形态判据/行为判据」两段式，防后人再退回纯正则
  assert.match(SCAN, /R2b 行为/, '头部有 R2b 行为判据说明');
});

/* 【2】源码面：R2a 形态仍在（不能为了行为判据把前置删掉） */
test('v3198【2】R2a 形态前置仍在（三种调用形态）', () => {
  assert.match(SCAN, /replayDrop\\s\*\\\(/, 'R2a 保留 replayDrop 形态检查');
  assert.match(SCAN, /replayShift\\s\*\\\(/, 'R2a 保留 replayShift 形态检查');
  assert.match(SCAN, /_ledgerReplayLib\\s\*\\\(/, 'R2a 保留 _ledgerReplayLib 形态检查');
});

/* 【3】负控制面：三条行为专属负控制在位且锚点唯一 */
test('v3198【3】negctl 含 N6/N7/N8 行为专属负控制，锚点恰中 1 次', () => {
  assert.match(NEGCTL, /N6-回放调用永不执行/, 'N6 在位');
  assert.match(NEGCTL, /N7-回放改传空宿主/, 'N7 在位');
  assert.match(NEGCTL, /N8-回放返回值被丢弃/, 'N8 在位');
  // 三条的破坏锚点必须在真源码里恰中 1 次（防锚点漂移让负控制静默作废）
  const a6 = "const _rep = (_lr && typeof _lr.replayDrop === 'function')";
  const a7 = '_lr.replayDrop(this, floor)';
  const a8 = '? _lr.replayDrop(this, floor)';
  assert.equal(IDX.split(a6).length - 1, 1, 'N6 锚点在 index.js 恰中 1 次');
  assert.equal(IDX.split(a7).length - 1, 1, 'N7 锚点在 index.js 恰中 1 次');
  assert.equal(IDX.split(a8).length - 1, 1, 'N8 锚点在 index.js 恰中 1 次');
});

/* 【4】行为面：真跑一次回放，报告必须自洽（不依赖扫描器，独立复验一遍） */
test('v3198【4】真跑回放：报告 version=1 / items 非空 / 至少一本 ok / 带分态', async () => {
  const vm = await import('node:vm');
  const src0 = read('ledger-replay.js');
  const src1 = read('index.js');
  function fakeElement() {
    return {
      style: {}, dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
      setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
      addEventListener() {}, removeEventListener() {}, remove() {}, focus() {},
      querySelector() { return null; }, querySelectorAll() { return []; },
      insertAdjacentHTML() {}, click() {}, textContent: '', innerHTML: '', value: '',
      children: [], childNodes: [], parentNode: null,
    };
  }
  const ctx = {};
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  ctx.console = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
  ctx.performance = { now: () => 0 };
  ctx.navigator = { userAgent: 'v3198' };
  ctx.location = { href: 'http://localhost/' };
  ctx.URL = URL;
  ctx.setTimeout = () => 0; ctx.clearTimeout = () => {};
  ctx.setInterval = () => 0; ctx.clearInterval = () => {};
  ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = () => {};
  ctx.document = {
    readyState: 'complete', createElement: fakeElement, createTextNode: () => ({}),
    createDocumentFragment: fakeElement, getElementById: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, head: fakeElement(), body: fakeElement(),
    documentElement: fakeElement(),
  };
  ctx.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {}, length: 0, key: () => null };
  ctx.SillyTavern = {
    getContext: () => ({
      eventSource: { on() {}, off() {}, emit() {}, once() {} },
      event_types: {
        MESSAGE_RECEIVED: 'message_received', MESSAGE_EDITED: 'message_edited',
        MESSAGE_DELETED: 'message_deleted', MESSAGE_SWIPED: 'message_swiped',
        GENERATION_STARTED: 'generation_started', GENERATION_ENDED: 'generation_ended',
        CHAT_CHANGED: 'chat_changed',
      },
      chatMetadata: {}, extensionSettings: {}, chat: [],
    }),
    chat: [], characters: {},
  };
  const sandbox = vm.createContext(ctx);
  vm.runInContext(src0, sandbox, { filename: 'ledger-replay.js' });
  vm.runInContext(src1, sandbox, { filename: 'index.js' });
  const engine = sandbox.window.LonShaMemory.engine;
  assert.ok(engine, '插件实例化');

  // 开账本
  engine.config.config.floorLedgerEnabled = true;
  engine.rollbackFloor(3);
  const rep = engine._lastReplayReport;
  assert.ok(rep && typeof rep === 'object', '回放报告被写入');
  assert.equal(rep.side, 'drop', 'side=drop');
  assert.equal(Number(rep.version), 1, 'version=1（真模块在跑）');
  assert.ok(Array.isArray(rep.items) && rep.items.length >= 20, `items >= 20（实得 ${rep.items && rep.items.length}）`);
  assert.ok(rep.items.filter((it) => it.state === 'ok').length >= 1, '至少一本账 ok（宿主被真正交回放）');
  assert.ok('threw' in rep && 'absent' in rep, '报告带 threw/absent 分态');

  // 关账本：必须显式 skipped
  engine.config.config.floorLedgerEnabled = false;
  engine.rollbackFloor(4);
  assert.equal(engine._lastReplayReport.skipped, 'floor-ledger-disabled', '关账本时显式 skipped');
});

/* 【5】负控制自证：三条行为负控制确实是「形态判据看不见」的（真源码破坏实验） */
test('v3198【5】三种退化在 R2a 形态判据下全绿（证明必须行为判据）', () => {
  // 复现原形态判据的三条正则
  const stripped = IDX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const r2a = (s) => /replayDrop\s*\(/.test(s) && /replayShift\s*\(/.test(s) && /_ledgerReplayLib\s*\(/.test(s);

  // A：守卫改 false &&（调用永不执行，但文本形态仍在）
  const A = IDX.replace(
    "const _rep = (_lr && typeof _lr.replayDrop === 'function')",
    "const _rep = (false && _lr && typeof _lr.replayDrop === 'function')",
  );
  // B：宿主传空对象
  const B = IDX.replace('_lr.replayDrop(this, floor)', '_lr.replayDrop({}, floor)');
  // C：返回值丢弃
  const C = IDX.replace('? _lr.replayDrop(this, floor)', '? (_lr.replayDrop(this, floor), null)');

  const stripA = A.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const stripB = B.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const stripC = C.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  assert.ok(r2a(stripped), '原版：R2a 形态判据通过');
  assert.ok(r2a(stripA), '退化A 在 R2a 下仍绿（形态判据漏检 → 需要 R2b）');
  assert.ok(r2a(stripB), '退化B 在 R2a 下仍绿（形态判据漏检 → 需要 R2b）');
  assert.ok(r2a(stripC), '退化C 在 R2a 下仍绿（形态判据漏检 → 需要 R2b）');
  // 且三种破坏都确实改变了文本（防「锚点没命中导致破坏没发生」的假证）
  assert.notEqual(A, IDX, '退化A 真改变了源码');
  assert.notEqual(B, IDX, '退化B 真改变了源码');
  assert.notEqual(C, IDX, '退化C 真改变了源码');
});

/* 【6】唯一真源零改动（本版不该动 _audit_lib） */
test('v3198【6】tests/_audit_lib.mjs 本版零改动（md5 不变）', async () => {
  const { createHash } = await import('node:crypto');
  const buf = readFileSync(path.join(ROOT, 'tests/_audit_lib.mjs'));
  const md5 = createHash('md5').update(buf).digest('hex');
  // v3.196/v3.197 记录的指纹；本版声明零改动，故必须一致
  assert.equal(md5, '2d7413e5839f8fe3fbd62d1c5063cd2f', `_audit_lib.mjs md5 变了（${md5}）——若真改过请更新本断言与 CHANGELOG`);
});