/* ============================================================
 * tests/l22_o1_index_split.test.mjs — L22-O1 index.js 拆第一簇的判据门
 * ------------------------------------------------------------
 * 背景（为什么需要它）：
 *   拆分这件事在本仓最容易变成两件假事：①「搬出去了，但两边各留一份实现」；
 *   ②「搬出去了，但顺手改了逻辑」。前者靠 scan_index_split.mjs 的 R3，后者靠 R4/R7。
 *   而**门禁本身**也有假绿风险（判据写错、锚点打偏、条件恒真）—— 故本档的另一半
 *   是**在镜像树上做真源码破坏**，证明每一关都真的会红：
 *     · 破坏被检物（index.js / index-helpers.js / 三份台账）⇒ 对应关卡必须点名翻红；
 *     · 破坏门禁自身（把那一条判据改成恒假）⇒ 同一个坏输入必须转绿。
 *   两向都成立，才说明「绿」的成因是判据在守，而不是判据在睡觉。
 *
 * 诚实边界：
 *   · 镜像树只搬门禁真正会读的 8 个文件（不是整仓镜像）：它证明的是「判据会红」，
 *     不是「整仓跑得起来」。
 *   · 本环境跑不动全量 node tests/run.mjs（实测会崩），故本档只覆盖 L22-O1 这一项。
 *   · R7 的行为快照只覆盖台账 fixtures 列出的调用，不等于全输入空间。
 * ============================================================ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';
import {
  ROOT, linesOf, defCount, bindingCount, checkSingleImplementation, checkByteIdentical,
  checkLazyProbe, checkPureModule, checkFixtures, checkRatchet, compareSurface, functionBody,
  constInitializer, checkHostSurface,
} from './audit/scan_index_split.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(ROOT, 'tests', 'audit', 'scan_index_split.mjs');
const INDEX = path.join(ROOT, 'index.js');
const HELPERS = path.join(ROOT, 'index-helpers.js');
const BASELINE = path.join(ROOT, 'tests', 'audit', 'index_helpers_baseline.json');
const EXPORTS = path.join(ROOT, 'tests', 'audit', 'index_exports.json');
const LEDGER = path.join(ROOT, 'tests', 'audit', 'index_split_ledger.json');
const LOADER = path.join(ROOT, 'tests', '_index_loader.cjs');
const AUDIT_LIB = path.join(ROOT, 'tests', '_audit_lib.mjs');

/* 25 个 = 第 1 批 10 个 + 第 2 批 · b2 15 个。顺序是**基线台账的排序**（localeCompare），
 *   P9 用逐字比对来钉「判据里的名单 = 台账里的名单」，所以顺序也必须一致。
 *   ★ 名单里**故意没有 numOr**：它闭包为空、声明唯一，但装载期就被调用（见 P24 / 台账 batch2.criterion_4_init_time）。 */
const NAMES = [
  '_formatBindDepsRow', '_getCredKey', '_initEbbingMeta', 'buildNpcTierInjection',
  'classifyRelationshipType', 'compareVersion', 'cyclePositionFor', 'decayScore',
  'estimateTextTokens', 'extractMemoryOpsFromText', 'extractTimeTagFast', 'filterTimelineByConstraint',
  'hash32', 'isSystemHiddenMsg', 'ledgerClip', 'ledgerItemKey',
  'loadExtraJsScript', 'msgTextOf', 'opLogStatsCompat', 'parseStoryTimeConstraint',
  'repairReceipt', 'safeJsonParse', 'sanitizeJson', 'stripMemoryOpsTags',
  'thinkingAnchorHeader',
];

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('✓ ' + n); }
  else { fail++; console.log('✗ ' + n + (extra ? ' — ' + extra : '')); }
};

const indexText = fs.readFileSync(INDEX, 'utf8');
const helpersText = fs.readFileSync(HELPERS, 'utf8');
const gateText = fs.readFileSync(GATE, 'utf8');
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const exportsBase = JSON.parse(fs.readFileSync(EXPORTS, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

/* ---------- P：真仓上的正向判据（读数） ---------- */
const runReal = spawnSync(process.execPath, [GATE], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
ok('P1 门禁在真仓上 rc=0 且报「通过」', runReal.status === 0 && /通过/.test(runReal.stdout || ''), 'rc=' + runReal.status + ' ' + String(runReal.stderr || '').slice(0, 300));
const okLines = String(runReal.stdout || '').split('\n').filter((l) => l.startsWith('OK   [')).length;

const runJson = spawnSync(process.execPath, [GATE, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
let gateJson = null;
try { gateJson = JSON.parse(runJson.stdout); } catch (_e) { gateJson = null; }

/* 关数不写死在判据里：门禁加一关就自动跟随。原先这里写死 7（后改 8），扩关当天会假红，
   逼人再去改数字 —— 那正是本仓治过的「同一事实两处硬编码」。真源是门禁自己的 results。 */
const gateIds = gateJson ? gateJson.results.map((r) => r.id) : [];
const gateIdsExpect = gateIds.map((_id, k) => 'R' + (k + 1));
ok('P2 门禁报的关数 == --json 报的关数，且编号 R1..Rn 连续不跳号',
  !!gateJson && gateIds.length > 0 && okLines === gateIds.length && gateIds.join(',') === gateIdsExpect.join(','),
  'stdout ' + okLines + ' 关 / json ' + gateIds.length + ' 关：' + gateIds.join(','));

ok('P3 门禁 --json 可机读且每一关都 ok',
  !!gateJson && gateJson.ok === true && gateJson.results.length > 0 && gateJson.results.every((r) => r.ok),
  gateJson ? JSON.stringify(gateJson.results.map((r) => r.id + ':' + r.ok)) : 'JSON 解析失败');

/* 导出面：独立跑一次装载器，不借门禁的读数 */
const surfaceOut = path.join(os.tmpdir(), 'l22o1_surface_' + process.pid + '.json');
const runLoader = spawnSync(process.execPath, [LOADER, surfaceOut], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
let nowSurface = null;
try { nowSurface = JSON.parse(fs.readFileSync(surfaceOut, 'utf8')); } catch (_e) { nowSurface = null; }
try { fs.unlinkSync(surfaceOut); } catch (_e) { /* 清理失败不影响结论 */ }
ok('P4 入口真装得起来（装载器 rc=0）', runLoader.status === 0, String(runLoader.stderr || '').slice(-300));
const surfaceCmp = nowSurface ? compareSurface(exportsBase.surface, nowSurface.surface || {}) : { ok: false, problems: ['装载器没产出导出面'] };
ok('P5 对外面 64 个符号逐字不变（独立复算）', surfaceCmp.ok && Object.keys(nowSurface.surface || {}).length === 64, JSON.stringify(surfaceCmp.problems.slice(0, 4)));

const idxLines = linesOf(indexText);
const helperLines = linesOf(helpersText);
ok('P6 index.js 行数降了且没超过天花板', idxLines < ledger.lines_before_split && idxLines <= ledger.index_lines_max, idxLines + ' 行');
ok('P7 台账读数是机器读数（天花板/模块行数/拆前行数三者与真值一致）',
  ledger.index_lines_max === idxLines && ledger.module_lines === helperLines && ledger.lines_before_split === 13546,
  '台账 ' + ledger.index_lines_max + '/' + ledger.module_lines + ' vs 真值 ' + idxLines + '/' + helperLines);
ok('P8 台账没有把「没做的事」写成做了（not_done 三项都在）',
  !!(ledger.not_done && ledger.not_done.remaining_engine && ledger.not_done.next_batch && ledger.not_done.duplicates));

ok('P9 基线恰 25 个函数（第 1 批 10 + 第 2 批 15），名单与台账一致',
  baseline.extracted.length === 25 && baseline.extracted.map((e) => e.name).join(',') === NAMES.join(','),
  baseline.extracted.map((e) => e.name).join(','));
ok('P10 每个函数都记了 64 位函数体 sha256（不是占位串）',
  baseline.extracted.every((e) => /^[0-9a-f]{64}$/.test(e.body_sha256)));
ok('P11 同名双声明的 parseStoryDateLoose 没被顺手搬走（它是语义决定，不是搬运）',
  !stripComments(helpersText).includes('parseStoryDateLoose') && !stripComments(helpersText).includes('storyDayDiff'));

const single = checkSingleImplementation(indexText, helpersText, NAMES);
ok('P12 25 个函数各恰一份实现 + index.js 各有委托绑定', single.ok, JSON.stringify(single.problems.slice(0, 3)));
ok('P13 每个名字在 index.js 里定义 0 次（第二份实现不许留）', NAMES.every((n) => defCount(indexText, n) === 0));
ok('P14 每个名字恰有 1 条委托绑定（const NAME = (...args) => _indexHelperCall(...)）', NAMES.every((n) => bindingCount(indexText, n) === 1));
ok('P15 逐字节：函数体 sha256 与基线逐一相同', checkByteIdentical(helpersText, baseline).ok);
ok('P16 取库是惰性的（extra_js 在入口之后加载，装载期取库会绑成缺席桩）', checkLazyProbe(indexText).ok, JSON.stringify(checkLazyProbe(indexText).problems));
ok('P17 缺席时抛点名错误，不留同形兜底', /缺导出：/.test(indexText) && /_noteModuleFailure/.test(indexText));
ok('P18 纯函数模块不持依赖面（且判据剥注释后再查，不拿散文当代码）',
  checkPureModule(helpersText).ok && !/function stripComments/.test(gateText) && /import \{ stripComments \} from '\.\.\/_audit_lib\.mjs';/.test(gateText));
ok('P19 行为快照复放（fixtures 逐调用真跑模块）', checkFixtures(baseline, HELPERS).ok, JSON.stringify(checkFixtures(baseline, HELPERS).problems.slice(0, 3)));
ok('P20 台账 not_called 里的函数都写了理由（不许悄悄漏掉）',
  Object.keys(baseline.not_called || {}).every((k) => String(baseline.not_called[k] || '').trim().length > 0));

ok('P21 manifest 把 index-helpers.js 登记进 extra_js（否则真宿主里全部委托函数缺席）',
  manifest.js === 'index.js' && Array.isArray(manifest.extra_js) && manifest.extra_js.includes('index-helpers.js'), 'extra_js=' + (manifest.extra_js || []).length);
ok('P22 它同时进了装载面台账（module_consumption_ledger 里是 active，不是零消费孤儿）', (() => {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'module_consumption_ledger.json'), 'utf8'));
  const e = (j.modules || {})['index-helpers.js'];
  return !!e && e.allowed === 1 && e.prod_call_sites >= 1;
})(), '台账缺条目或缺消费');
ok('P23 它也进了 extra_js seam 台账（host-seam，不是 orphan）', (() => {
  const t = fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'extra_js_seam_ledger.tsv'), 'utf8').split('\n');
  const row = t.find((l) => l.startsWith('index-helpers.js\t'));
  return !!row && row.split('\t')[4] === 'host-seam';
})(), 'seam 台账缺行');

/* ---------- P24–P26：第 2 批 · b2 专有的两件事 ---------- */
/* numOr 的「是否留在原地」判定抽成纯函数，好让下面能做两向自证 */
const numOrStayed = (it, ht) => defCount(it, 'numOr') === 1 && defCount(ht, 'numOr') === 0 && bindingCount(it, 'numOr') === 0;

ok('P24 numOr 未被外移（它装载期可达 ⇒ 必须留在 index.js 且无委托绑定）',
  numOrStayed(indexText, helpersText),
  'index.js 定义 ' + defCount(indexText, 'numOr') + ' 次 / helpers 定义 ' + defCount(helpersText, 'numOr') + ' 次 / 绑定 ' + bindingCount(indexText, 'numOr') + ' 条');

ok('P25 台账把「为什么不是 16 个」写清楚了（第 4 条判据 + numOr 实证不写在代码里就等于没写）',
  !!(ledger.batch2 && ledger.batch2.criterion_4_init_time
    && /装载期/.test(ledger.batch2.criterion_4_init_time.statement || '')
    && ledger.batch2.excluded_because_init_time_call && ledger.batch2.excluded_because_init_time_call.numOr
    && Array.isArray(ledger.batch2.functions) && ledger.batch2.functions.length === 15),
  ledger.batch2 ? 'batch2.functions=' + (ledger.batch2.functions || []).length : '缺 batch2 段');

/* P26：直接实测「装载期有没有 require 过 index-helpers.js」。
 *   这是第 4 条判据唯一的行为读数 —— 比「装载有没有抛」强：node 里 _moduleLib 有 require 回落，
 *   装载期取库既不抛也不报，只有「多挂了一个 window.LonShaIndexHelpers」这一丝痕迹。 */
{
  const probe = path.join(os.tmpdir(), 'l22o1_probe_' + process.pid + '.cjs');
  fs.writeFileSync(probe, [
    "const R = " + JSON.stringify(ROOT) + ";",
    "const Module = require('module');",
    'const orig = Module.prototype.require;',
    'let hit = 0;',
    'Module.prototype.require = function (p) { if (String(p).includes("index-helpers")) hit++; return orig.apply(this, arguments); };',
    "const { makeHost } = require(R + '/tests/_index_loader.cjs');",
    'makeHost();',
    "try { require(R + '/index.js'); } catch (e) { console.error('[LOAD-ERR] ' + (e && e.message)); }",
    'setTimeout(() => { console.log("REQUIRE_HITS=" + hit); process.exit(0); }, 500);',
  ].join('\n'), 'utf8');
  const r = spawnSync(process.execPath, [probe], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
  try { fs.unlinkSync(probe); } catch (_e) { /* 清理失败不影响结论 */ }
  const out = String(r.stdout || '') + String(r.stderr || '');
  const hits = (out.match(/REQUIRE_HITS=(\d+)/) || [])[1];
  ok('P26 装载期一次都没 require 过 index-helpers.js（⇒ 25 个函数全部装载期不可达）',
    hits === '0', 'REQUIRE_HITS=' + hits + ' ' + out.slice(-200));
}

/* ---------- P27-P28 / N14：b3 注入面机制（机制先落地；搬迁用户待装载契约放行） ---------- */
ok('P27 注入项取值机制可用（constInitializer 从 index.js 取到 _ERROR_HINTS 真值并求值）', (() => {
  const init = constInitializer(indexText, '_ERROR_HINTS');
  if (!init) return false;
  const v = new Function('return (' + init + ');')();
  return Array.isArray(v) && v.length === 17
    && v.every((x) => x && x.re instanceof RegExp && typeof x.title === 'string');
})(), 'constInitializer 取不到，或求值结果不是 17 条带 re/title 的错误规则');

ok('P28 真仓上 R8 自洽（当前没有注入槽 ⇒ 也不许有悬空注入）',
  checkHostSurface(helpersText, indexText).ok,
  JSON.stringify(checkHostSurface(helpersText, indexText).problems));

/* N14 两向自证：R8 的三条判据各自都能红。输入是**完全合成的迷你 helpers 文本**，
 *     既不读也不改真仓 —— 真仓此刻没有 __bindHost（已随 hintForError 整批回滚），
 *     拿它当基底会让坏用例静默不命中、假红成「都红」。判据走的仍是门禁里的
 *     checkHostSurface 本体，不是另写一份逻辑。 */
{
  const mkHelpers = (slots, injs, bind) => {
    const L = [];
    for (const s of slots) L.push('    let ' + s + ' = null;');
    if (slots.length) L.push('');
    L.push('    const api = { x: 1 };');
    L.push('');
    if (bind) {
      L.push('    api.__bindHost = function (host) {');
      for (const i of injs) L.push('        if (host.' + i + ') ' + i + ' = host.' + i + ';');
      L.push('        return true;');
      L.push('    };');
    }
    return L.join('\n') + '\n';
  };
  const callIdx = '    const api = {};\n    _indexHelpersLib.__bindHost({ __tA: 1 });\n';
  const nocallIdx = '    const api = {};\n    _indexHelpersLib = makeHelpers();\n';

  const r1 = checkHostSurface(mkHelpers(['__tA'], ['__tA'], true), callIdx);
  const r2 = checkHostSurface(mkHelpers(['__tA'], [], true), callIdx);
  const r3 = checkHostSurface(mkHelpers([], ['__tA'], true), callIdx);
  const r4 = checkHostSurface(mkHelpers(['__tA'], ['__tA'], true), nocallIdx);

  ok('N14 R8 两向自证：对齐 ⇒ 绿；缺注入 / 悬空注入 / index.js 没调用 ⇒ 各自红',
    r1.ok === true && r2.ok === false && r3.ok === false && r4.ok === false,
    JSON.stringify({ good: r1.ok, noInject: r2.problems, noSlot: r3.problems, noCall: r4.problems }));
}

/* ---------- N：镜像树上的真源码破坏（证明每一关都会红） ---------- */
/** 造一个「门禁能跑」的镜像树。
 *  必须是**近全量**的根级 .js 副本，不是只搬 8 个文件：实测过，只搬 8 个时 index.js
 *  装载期 require('./xxx.js') 取不到兄弟模块，导出面会塌成比基线少一大截，
 *  R1 恒红 ⇒ N0 卫生态对照立不起来，后面的「翻红」全部不可归因。 */
const SKIP_TOP = new Set(['.git', 'node_modules', 'docs', 'tools', 'tests', 'css', '.agents', '.lonsha-test-tmp']);
function buildMirror(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l22o1-mirror-'));
  fs.cpSync(ROOT, dir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(ROOT, src);
      if (rel === '') return true;
      return !SKIP_TOP.has(rel.split(path.sep)[0]);
    },
  });
  const files = {
    'tests/_index_loader.cjs': ['loader', LOADER],
    'tests/_audit_lib.mjs': ['lib', AUDIT_LIB],
    'tests/audit/scan_index_split.mjs': ['gate', GATE],
    'tests/audit/index_helpers_baseline.json': ['baseline', BASELINE],
    'tests/audit/index_exports.json': ['exports', EXPORTS],
    'tests/audit/index_split_ledger.json': ['ledger', LEDGER],
  };
  for (const [rel, [key, abs]] of Object.entries(files)) {
    if (overrides['__drop__' + key]) continue;
    const dst = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, overrides[key] !== undefined ? overrides[key] : fs.readFileSync(abs, 'utf8'), 'utf8');
  }
  for (const key of ['idx', 'helpers']) {
    const dst = path.join(dir, key === 'idx' ? 'index.js' : 'index-helpers.js');
    if (overrides['__drop__' + key]) { fs.rmSync(dst, { force: true }); continue; }
    if (overrides[key] !== undefined) fs.writeFileSync(dst, overrides[key], 'utf8');
  }
  return dir;
}
function runGateIn(dir) {
  const r = spawnSync(process.execPath, [path.join('tests', 'audit', 'scan_index_split.mjs')], { cwd: dir, encoding: 'utf8', timeout: 180000 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const withMirror = (overrides, fn) => {
  const dir = buildMirror(overrides);
  try { return fn(dir); } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* 清场失败不影响结论 */ } }
};

/* N0 卫生态对照：镜像树原样必须绿（否则后面所有「翻红」都不可归因） */
const n0 = withMirror({}, (d) => runGateIn(d));
ok('N0 卫生态对照：未破坏的镜像树上 rc=0', n0.status === 0, 'rc=' + n0.status + ' ' + n0.out.slice(-300));

/* N1 塞回第二份实现（index.js 里再定义一个 hash32） → R3 必须点名 */
const secondImpl = indexText.replace("    const hash32 = (...args) => _indexHelperCall('hash32', args);", '    const hash32 = (s) => { return 0; };');
const n1 = withMirror({ idx: secondImpl }, (d) => runGateIn(d));
ok('N1 塞回同形兜底（委托绑定被换成自己的实现）⇒ rc=1 且点名 R3', n1.status === 1 && /\[R3\]/.test(n1.out) && /(第二份实现|缺委托绑定)/.test(n1.out), n1.out.slice(-400));

/* N2 函数体改一个字符 → R4 必须红（搬的时候改了代码） */
const oneCharBroken = helpersText.replace('    function hash32(', '    function hash32( ');
const n2 = withMirror({ helpers: oneCharBroken }, (d) => runGateIn(d));
ok('N2 函数体改一个字符 ⇒ rc=1 且点名 R4/sha256', n2.status === 1 && /\[R4\]/.test(n2.out) && /sha256 变了/.test(n2.out), n2.out.slice(-260));

/* N3 改成装载期取库（惰性探针被绕过） → R5 必须红 */
const eager = indexText.replace('    function _indexHelpers() {', "    const _indexHelpersLibEager = _moduleLib(() => window.LonShaIndexHelpers, 'index-helpers.js');\n    function _indexHelpers() {");
const n3 = withMirror({ idx: eager }, (d) => runGateIn(d));
ok('N3 装载期就取库 ⇒ rc=1 且点名 R5', n3.status === 1 && /\[R5\]/.test(n3.out), n3.out.slice(-260));

/* N4 导出面基线少一个符号 → R1 必须红 */
const exportsShort = JSON.parse(JSON.stringify(exportsBase));
delete exportsShort.surface.LonShaMemory;
const n4 = withMirror({ exports: JSON.stringify(exportsShort) }, (d) => runGateIn(d));
ok('N4 对外面少一个符号 ⇒ rc=1 且点名 R1', n4.status === 1 && /\[R1\]/.test(n4.out), n4.out.slice(-260));

/* N5 天花板被调到低于当前行数 → R2 必须红（ratchet 不许注水）
 *   ★ 这里的数字必须跟着 index.js 一起降：写死一个「曾经的红值」会让负控制自己失效。 */
const ledgerTight = JSON.parse(JSON.stringify(ledger));
ledgerTight.index_lines_max = idxLines - 50;
const n5 = withMirror({ ledger: JSON.stringify(ledgerTight) }, (d) => runGateIn(d));
ok('N5 天花板被调紧 ⇒ rc=1 且点名 R2', n5.status === 1 && /\[R2\]/.test(n5.out), n5.out.slice(-260));

/* N6 fixtures 里一个输出被改坏 → R7 必须红（字没变但算出来不一样） */
const baselineBad = JSON.parse(JSON.stringify(baseline));
baselineBad.fixtures.hash32[0].out = 'deadbeef';
const n6 = withMirror({ baseline: JSON.stringify(baselineBad) }, (d) => runGateIn(d));
ok('N6 行为快照被改坏 ⇒ rc=1 且点名 R7/输出变了', n6.status === 1 && /\[R7\]/.test(n6.out) && /输出变了/.test(n6.out), n6.out.slice(-260));

/* N7 fail-closed：缺台账必须 exit 2（不是 0 也不是 1） */
const n7 = withMirror({ __drop__ledger: true }, (d) => runGateIn(d));
ok('N7 缺 index_split_ledger.json ⇒ exit 2（fail-closed，拒绝给结论）', n7.status === 2 && /fail-closed/.test(n7.out), 'rc=' + n7.status + ' ' + n7.out.slice(-200));

/* N8 两向自证：把 R3 那一条判据改成恒不报 ⇒ 同一个坏输入必须转绿
 *    （证明 N1 的红确实来自那条判据，而不是别处的连带效应） */
let gateBlindR3 = breakSource(gateText, 'if (inIndex !== 0) problems.push(', 'if (false) problems.push(', 'R3 第二份实现检测');
gateBlindR3 = breakSource(gateBlindR3, 'if (!bindingCount(indexText, n)) problems.push(', 'if (false) problems.push(', 'R3 委托绑定检测');
const n8 = withMirror({ idx: secondImpl, gate: gateBlindR3 }, (d) => runGateIn(d));
ok('N8 门禁 R3 被打瞎后，同一个坏输入转绿（两向自证）', n8.status === 0 && /通过/.test(n8.out), 'rc=' + n8.status + ' ' + n8.out.slice(-260));

/* N9 两向自证：把 R4 的 sha256 比对改成恒不报 ⇒ 改了一个字符的副本必须转绿 */
const gateBlindR4 = breakSource(gateText, 'if (h !== e.body_sha256) problems.push(', 'if (false) problems.push(', 'R4 sha256 检测');
const n9 = withMirror({ helpers: oneCharBroken, gate: gateBlindR4 }, (d) => runGateIn(d));
ok('N9 门禁 R4 被打瞎后，改了一个字符的副本转绿（两向自证）', n9.status === 0 && /通过/.test(n9.out), 'rc=' + n9.status + ' ' + n9.out.slice(-260));

/* N10 单位级负控制：纯函数在坏输入上必须返回 not-ok（不依赖 spawn，跑得快且能定位） */
ok('N10 checkRatchet 对「行数涨回拆前」返回 not-ok', checkRatchet(ledger, 13546).ok === false);
ok('N11 compareSurface 对空基线返回 not-ok（空表不是通过）', compareSurface({}, { A: 'function' }).ok === false);
ok('N12 functionBody 对不存在的函数返回 null（不缺就当成功）', functionBody(helpersText, 'noSuchFunction') === null);

/* N13 P24 的两向自证：把 numOr 真的「搬走」（helpers 里加一份、index.js 里删掉定义），
 *     同一个判定必须转假 —— 否则 P24 可能只是「因为没人搬」而绿。 */
{
  const numOrBody = functionBody(indexText, 'numOr');
  const idxMoved = numOrBody ? indexText.replace(numOrBody, '') : indexText;
  const helpersMoved = helpersText.replace('    const api = {', '    function numOr(v, fallback) { return v == null ? fallback : v; }\n\n    const api = {');
  ok('N13 把 numOr 搬走后，P24 的判定转假（两向自证）',
    numOrStayed(indexText, helpersText) === true && numOrStayed(idxMoved, helpersMoved) === false,
    'numOrBody=' + (numOrBody ? numOrBody.split('\n').length + ' 行' : '取不到'));
}

console.log('\n' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
