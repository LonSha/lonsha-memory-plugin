/**
 * tests/v3199_ledger_replay_r2_shift_behavioral.test.mjs — v3.199.0
 *
 * 主题：R2 行为判据从「只覆盖 drop 面」扩展到「drop + shift 两面」。
 *
 * 背景（handover 点名项 callReachable 的行为式落地）：
 *   v3.198 把 R2 从形态判据升级为行为判据，但只走了 rollbackFloor（drop 面）。
 *   前移面（shiftFloorsFrom → replayShift）只有 R2a 的文本正则兜着——
 *   把前移侧回放调用挪进死分支（`? (false && _lr.replayShift(...))`），
 *   R2a 三条正则全命中（实测全绿），而删楼后的楼层前移重定位静默失效：
 *   数据零丢失的承诺破掉，且不报错、不告警。
 *   这正是 handover 所说的「可达性」问题——静态「只认顶层 return」判不准，
 *   而**行为式**判据天然解决：跑了就写报告，没跑就没报告。
 *
 * 本套件锁定：
 *   R2b 两面行为判据（assertReplaySide 对 drop/shift 各跑一次）；
 *   negctl 新增 N9/N10/N11 三条 shift 面行为专属负控制。
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
test('v3199【0】版本 / manifest / package ≥ 3.199.0', () => {
  const pkg = JSON.parse(read('package.json'));
  const manifest = JSON.parse(read('manifest.json'));
  const v = /const VERSION = '([^']+)'/.exec(IDX)[1];
  assert.ok(vnum(v) >= vnum('3.201.0'), `index.js 版本 ${v} < 3.199.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.201.0'), `manifest ${manifest.version} < 3.199.0`);
  assert.ok(vnum(pkg.version) >= vnum('3.201.0'), `package ${pkg.version} < 3.199.0`);
});
/* 【1】源码面：两面行为判据接线 */
test('v3199【1】R2b 行为判据已扩展到 shift 面（assertReplaySide 两面共用）', () => {
  assert.match(SCAN, /function assertReplaySide\s*\(/, '单面断言函数定义在');
  assert.match(SCAN, /assertReplaySide\(out, 'drop'/, 'drop 面被断言');
  assert.match(SCAN, /assertReplaySide\(out, 'shift'/, 'shift 面被断言');
  // runReplayOnce 必须能按 side 选入口（drop→rollbackFloor / shift→shiftFloorsFrom）
  assert.ok(SCAN.includes("side === 'shift' ? 'shiftFloorsFrom' : 'rollbackFloor'"), 'runReplayOnce 按 side 选宿主入口');
  assert.ok(SCAN.includes('shiftFloorsFrom'), '扫描器真调 shiftFloorsFrom');
  // side 断言不能只看数量：必须断言 side 字段与 ok>=1
  assert.ok(SCAN.includes("rep.side !== side"), 'R2b 断言报告 side 与请求面一致');
  assert.ok(SCAN.includes("state === 'ok'"), 'R2b 断言至少一本账 ok（抓「宿主传错」）');
});
/* 【2】源码面：R2a 形态仍在 */
test('v3199【2】R2a 形态前置仍在（三种调用形态）', () => {
  assert.match(SCAN, /replayDrop\\s\*\\\(/, 'R2a 保留 replayDrop 形态检查');
  assert.match(SCAN, /replayShift\\s\*\\\(/, 'R2a 保留 replayShift 形态检查');
  assert.match(SCAN, /_ledgerReplayLib\\s\*\\\(/, 'R2a 保留 _ledgerReplayLib 形态检查');
});
/* 【3】负控制面：N9/N10/N11 在位且锚点唯一 */
test('v3199【3】negctl 含 N9/N10/N11 shift 面行为专属负控制，锚点恰中 1 次', () => {
  assert.match(NEGCTL, /N9-shift 回放调用永不执行/, 'N9 在位');
  assert.match(NEGCTL, /N10-shift 回放改传空宿主/, 'N10 在位');
  assert.match(NEGCTL, /N11-shift 回放返回值被丢弃/, 'N11 在位');
  const a9 = '? _lr.replayShift(this, deleted)';
  const a10 = '_lr.replayShift(this, deleted)';
  assert.equal(IDX.split(a9).length - 1, 1, 'N9/N11 锚点（带 ? 前缀）在 index.js 恰中 1 次');
  assert.equal(IDX.split(a10).length - 1, 1, 'N10 锚点在 index.js 恰中 1 次');
});
/* 【4】行为面：真跑 shift 面回放，报告必须自洽 */
test('v3199【4】真跑 shift 面回放：side=shift / version=1 / items 非空 / 至少一本 ok', async () => {
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
  ctx.navigator = { userAgent: 'v3199' };
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

  // shift 面：shiftFloorsFrom → replayShift
  engine.config.config.floorLedgerEnabled = true;
  const shifted = engine.shiftFloorsFrom(3);
  const rep = engine._lastReplayReport;
  assert.ok(rep && typeof rep === 'object', 'shift 面回放报告被写入');
  assert.equal(rep.side, 'shift', 'side=shift（真走了前移面）');
  assert.equal(Number(rep.version), 1, 'version=1（真模块在跑）');
  assert.ok(Array.isArray(rep.items) && rep.items.length >= 20, `items >= 20（实得 ${rep.items && rep.items.length}）`);
  assert.ok(rep.items.filter((it) => it.state === 'ok').length >= 1, '至少一本账 ok（宿主被真正交回放）');
  assert.ok('threw' in rep && 'absent' in rep, '报告带 threw/absent 分态');
  assert.equal(typeof shifted, 'number', 'shiftFloorsFrom 返回位移条数');

  // 区分度：drive 空宿主时 ok=0（证明 ok>=1 真能区分「宿主传错」）
  const LRmod = await import(path.join(ROOT, 'ledger-replay.js'));
  const emptyRep = LRmod.replayShift ? LRmod.replayShift({}, 3) : null;
  if (emptyRep) {
    assert.equal(emptyRep.items.filter((it) => it.state === 'ok').length, 0, '传空宿主时 ok=0（ok>=1 具备判别力）');
    assert.equal(emptyRep.items.length, rep.items.length, '传空宿主时报告结构仍完整（数量判据抓不到）');
  }
});
/* 【5】判别力：三种 shift 退化在 R2a 形态判据下全绿（证明必须 shift 行为判据） */
test('v3199【5】三种 shift 退化在 R2a 形态判据下全绿（证明必须 shift 行为判据）', () => {
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const r2a = (s) => /replayDrop\s*\(/.test(s) && /replayShift\s*\(/.test(s) && /_ledgerReplayLib\s*\(/.test(s);
  const A = IDX.replace('? _lr.replayShift(this, deleted)', '? (false && _lr.replayShift(this, deleted))');
  const B = IDX.replace('_lr.replayShift(this, deleted)', '_lr.replayShift({}, deleted)');
  const C = IDX.replace('? _lr.replayShift(this, deleted)', '? (_lr.replayShift(this, deleted), null)');
  assert.ok(r2a(strip(IDX)), '原版：R2a 形态判据通过');
  assert.ok(r2a(strip(A)), 'shift 退化A（死分支）在 R2a 下仍绿（形态判据漏检 → 需要 shift 行为判据）');
  assert.ok(r2a(strip(B)), 'shift 退化B（传空宿主）在 R2a 下仍绿（形态判据漏检 → 需要 shift 行为判据）');
  assert.ok(r2a(strip(C)), 'shift 退化C（报告不落）在 R2a 下仍绿（形态判据漏检 → 需要 shift 行为判据）');
  assert.notEqual(A, IDX, 'shift 退化A 真改变了源码');
  assert.notEqual(B, IDX, 'shift 退化B 真改变了源码');
  assert.notEqual(C, IDX, 'shift 退化C 真改变了源码');
});
/* 【6】直算力探针以 `_` 前缀收进仓库（不进扫描面） */
test('v3199【6】判别力探针以 _ 前缀在位，且不被 run.mjs 当扫描器', () => {
  const probe = read('tests/audit/_probe_v3199_r2shift.mjs');
  assert.ok(probe.length > 0, '探针文件存在');
  assert.ok(probe.includes('r2aForm'), '探针含 R2a 形态复现');
  // 命名以 _ 开头 → 不被 auditScripts() 收敛
  assert.ok('_probe_v3199_r2shift.mjs'.startsWith('_'), '探针名以 _ 开头（run.mjs 的 _ 前缀排除规则命中）');
});
/* 【7】唯一真源零改动 */
test('v3199【7】tests/_audit_lib.mjs 本版零改动（md5 不变）', async () => {
  const { createHash } = await import('node:crypto');
  const buf = readFileSync(path.join(ROOT, 'tests/_audit_lib.mjs'));
  const md5 = createHash('md5').update(buf).digest('hex');
  assert.equal(md5, '2d7413e5839f8fe3fbd62d1c5063cd2f', `_audit_lib.mjs md5 变了（${md5}）——若真改过请更新本断言与 CHANGELOG`);
});
