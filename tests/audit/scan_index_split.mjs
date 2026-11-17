/* ============================================================
 * tests/audit/scan_index_split.mjs — L22-O1 index.js 拆分闸
 * ------------------------------------------------------------
 * 「把 index.js 拆小」在这份仓里最容易变成三件假事，本闸逐条钉死：
 *   ① 拆出去了，但两边各留一份实现（第二份派生规则复活）；
 *   ② 拆出去了，但顺手改了逻辑（“搬”变“改”，没人验）；
 *   ③ 拆出去了，但入口装不起来 / 对外面变了（index.js 全靠 window 挂符号，没有 module.exports）。
 *
 * 八道关（全绿才 rc=0）：
 *   R1 入口能装 + 对外面逐字不变：跑 tests/_index_loader.cjs 取导出面，与
 *      tests/audit/index_exports.json 的 64 个符号（名字+类型）完全一致。
 *   R2 行数只降不涨：index.js 行数 ≤ 台账天花板，且必须低于拆前。
 *   R3 单份实现：台账里的每个函数在 index-helpers.js 里各定义恰 1 次、在 index.js 里 0 次定义；
 *      且 index.js 里必须有一行 `const NAME = (...args) => _indexHelperCall(...)` 绑定。
 *   R4 逐字节搬迁：index-helpers.js 里每个函数体（从 `    function NAME(` 到配对结束）
 *      的 sha256 必须等于基线台账里记的 body_sha256。改一个字符就红。
 *   R5 取库必须惰性：index.js 不许出现装载期就取 index-helpers 的写法
 *      （`const X = _moduleLib(() => window.LonShaIndexHelpers, ...)`），
 *      必须经 _indexHelpers()/ _indexHelperCall() 惰性探针（extra_js 顺序决定装载期它还不存在）。
 *   R6 模块不许**自取**库：index-helpers.js 里不许出现 _moduleLib / require('./ 之类（注入面不算「自取」——
 *      注入是 index.js 推过来的，helpers 自己不去摸 window/require），
 *      否则“纯函数模块”会长出依赖面（它就该只用内建）。
 *      ★ 只看**代码**不看注释：**先剥注释再查**。首版直接 includes() 全文本，
 *        被自家头注释里那句“175 个是 _moduleLib(...) 取库”判红 ——
 *        那是拿散文当代码判，既过不了也没意义。剥注释后仍能抓住真调用（负控制验过）。
 *   R7 行为快照复放：把 index-helpers.js require 进来，按基线台账的 fixtures 逐调用
 *      重放并比对输出（body_sha256 只管“字没变”，这关管“算出来一样”）；
 *      台账 not_called 里登记的函数不重放，且必须在 not_called 里有理由，不许悄悄漏。
 *   R8 注入面自洽（b3 起）：index-helpers.js 里的「注入槽」（let NAME = null;）与 __bindHost 里
 *      逐项 host.NAME 赋值必须**一一对应**，且 index.js 必须真的调用过 __bindHost。
 *      为什么要有这条：b3 起搬迁的函数体可以引用**注入来的名字**（原名不变、逐字节照搬），
 *      于是「槽声明了没注入」「注入了没声明」都会变成运行期的 undefined —— 而且只在真宿主现形。
 *   R0 fail-closed：任一文件读不到 ⇒ exit 2。
 *
 * 退出码：0 = 卫生（七关全绿）  1 = 真缺陷（任一关红）  2 = 结构漂移（读不到必需文件，fail-closed）
 *
 * 用法：node tests/audit/scan_index_split.mjs [--json]
 * ============================================================ */
import fs, { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripComments } from '../_audit_lib.mjs';
import { fileURLToPath } from 'node:url';

const nodeRequire = createRequire(import.meta.url);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

export const PLAN = 'L22-O1';
export const INDEX = 'index.js';
export const HELPERS = 'index-helpers.js';
export const BASELINE = 'tests/audit/index_helpers_baseline.json';
export const EXPORTS = 'tests/audit/index_exports.json';
export const LEDGER = 'tests/audit/index_split_ledger.json';
export const LOADER = 'tests/_index_loader.cjs';

export const linesOf = (t) => t.split('\n').length - (t.endsWith('\n') ? 1 : 0);

/** 从 `    function NAME(` 起，跳过字符串/注释找到配对 `}`，返回函数体文本。 */
export function functionBody(text, name) {
  const re = new RegExp('^ {4}function ' + name.replace(/\$/g, '\\$&') + '\\s*\\(', 'm');
  const m = re.exec(text);
  if (!m) return null;
  const start = m.index;
  let i = text.indexOf('{', start), depth = 0, seen = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    /* 正则字面量必须先于字符串处理：b4 的 extractThinkingChain 里有一个字符类是
     *   /(?=[\u4e00-\u9fa5A-Za-z0-9"'#*[{`])/
     *   其中含 ' " ` —— 不认正则的话，这三个引号会被当成字符串起点，把后面的代码整段吃掉，
     *   配对花括号正好错位，functionBody 直接返回 null（b1/b2 的 25 个函数没有这种正则，所以一直没暴露）。
     *   「/ 是除号还是正则开头」用前一个非空白字符判定，与仓内既有 scrub 同一套启发式。 */
    if (c === '/') {
      let k = i - 1;
      while (k >= 0 && /\s/.test(text[k])) k--;
      const prev = k >= 0 ? text[k] : '';
      if (prev === '' || '(,=:[!&|?{};+-*%~^<>'.includes(prev)) {
        i++; let inClass = false;
        while (i < text.length) {
          const ch = text[i];
          if (ch === '\\') { i += 2; continue; }
          if (ch === '[') inClass = true;
          else if (ch === ']') inClass = false;
          else if (ch === '/' && !inClass) { i++; break; }
          else if (ch === '\n') break;
          i++;
        }
        while (i < text.length && /[a-z]/.test(text[i])) i++;
        continue;
      }
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === q) { i++; break; }
        if (q === '`' && text[i] === '$' && text[i + 1] === '{') {
          let d = 1; i += 2;
          while (i < text.length && d > 0) { if (text[i] === '{') d++; else if (text[i] === '}') d--; i++; }
          continue;
        }
        i++;
      }
      continue;
    }
    if (c === '{') { depth++; seen = true; } else if (c === '}') { depth--; if (seen && depth === 0) return text.slice(start, i + 1); }
    i++;
  }
  return null;
}

/** 数某个名字在某个文件里「顶层定义」了几次。 */
export function defCount(text, name) {
  const re = new RegExp('^ {4}(?:async\\s+)?function ' + name.replace(/\$/g, '\\$&') + '\\s*\\(', 'gm');
  return (text.match(re) || []).length;
}

export function bindingCount(indexText, name) {
  const re = new RegExp('^ {4}const ' + name.replace(/\$/g, '\\$&') + " = \\(\\.\\.\\.args\\) => _indexHelperCall\\('" + name + "', args\\);$", 'm');
  return re.test(indexText) ? 1 : 0;
}

export function checkSingleImplementation(indexText, helpersText, names) {
  const problems = [];
  for (const n of names) {
    const inHelpers = defCount(helpersText, n);
    const inIndex = defCount(indexText, n);
    if (inHelpers !== 1) problems.push(n + '：index-helpers.js 里定义了 ' + inHelpers + ' 次（必须恰 1 次）');
    if (inIndex !== 0) problems.push(n + '：index.js 里还留着 ' + inIndex + ' 次定义（第二份实现）');
    if (!bindingCount(indexText, n)) problems.push(n + '：index.js 缺委托绑定 `const ' + n + ' = (...args) => _indexHelperCall(...)`');
  }
  return { ok: problems.length === 0, problems };
}

export function checkByteIdentical(helpersText, baseline) {
  const problems = [];
  for (const e of baseline.extracted) {
    const body = functionBody(helpersText, e.name);
    if (!body) { problems.push(e.name + '：index-helpers.js 里找不到函数体'); continue; }
    const h = createHash('sha256').update(body).digest('hex');
    if (h !== e.body_sha256) problems.push(e.name + '：函数体 sha256 变了 ' + e.body_sha256.slice(0, 8) + ' → ' + h.slice(0, 8) + '（搬的时候改了代码？）');
  }
  return { ok: problems.length === 0, problems };
}

export function checkLazyProbe(indexText) {
  const problems = [];
  const eager = /^ {4}const \w+ = _moduleLib\(\(\) => window\.LonShaIndexHelpers/m;
  if (eager.test(indexText)) problems.push('index.js 里出现了装载期就取 index-helpers 的写法（extra_js 顺序会让它取空，全部委托函数变缺席桩）');
  if (!/function _indexHelpers\(\)/.test(indexText)) problems.push('index.js 缺惰性探针 _indexHelpers()');
  if (!/function _indexHelperCall\(name, args\)/.test(indexText)) problems.push('index.js 缺 _indexHelperCall(name, args)');
  if (!/_moduleLib\(\(\) => window\.LonShaIndexHelpers, 'index-helpers\.js'\)/.test(indexText)) {
    problems.push("index.js 缺正式取库口 _moduleLib(() => window.LonShaIndexHelpers, 'index-helpers.js')");
  }
  return { ok: problems.length === 0, problems };
}

export function checkPureModule(helpersText) {
  const problems = [];
  const code = stripComments(helpersText);
  for (const bad of ['_moduleLib', "require('./", 'require("./', 'window.LonShaMemory', 'window.LonShaCSE']) {
    if (code.includes(bad)) problems.push('index-helpers.js 里出现 ' + bad + '（纯函数模块不长依赖面）');
  }
  return { ok: problems.length === 0, problems };
}

const ser = (v) => { const s = JSON.stringify(v); return s === undefined ? '__undefined' : s; };

/** 取 `const NAME = <初始化式>` 的初始化式源码（只认 4 空格缩进、数组/对象字面量）。
 *  口径：从等号后到**同一缩进层**的 \n    ]; / \n    }; / 分号为止。不解析通用表达式。 */
export function constInitializer(src, name) {
  const at = src.indexOf('    const ' + name + ' = ');
  if (at < 0) return null;
  const start = at + ('    const ' + name + ' = ').length;
  const first = src[start];
  if (first !== '[' && first !== '{') return null;
  const closeMark = first === '[' ? '\n    ];' : '\n    };';
  const e = src.indexOf(closeMark, start);
  if (e < 0) return null;
  /* 注意：closeMark 是 '\n    ];'（7 字符，含分号）。要切到 ']' 为止、不含 ';'，
     所以是 e + closeMark.length - 1。这里曾是 -2（少切一位、把 ']' 丢掉），
     于是 new Function('return (' + init + ');') 会报 Unexpected token ')'。
     该口径坑只在 host_deps 非空时才暴露，b3 的 P27 第一次把它点出来。 */
  return src.slice(start, e + closeMark.length - 1);
}

/** R8：注入槽 ⇄ __bindHost 赋值逐项对齐 + index.js 真的调用过。 */
export function checkHostSurface(helpersText, indexText) {
  const problems = [];
  const code = stripComments(helpersText);
  const slots = [...code.matchAll(/^ {4}let ([A-Za-z_$][\w$]*) = null;$/gm)].map((m) => m[1]);
  const gateAt = code.indexOf('api.__bindHost');
  if (gateAt < 0) {
    if (slots.length) problems.push('声明了注入槽（' + slots.join(',') + '）却没有 __bindHost');
    return { ok: problems.length === 0, problems, slots, injected: [] };
  }
  const gateBody = code.slice(gateAt, code.indexOf('\n    };', gateAt) + 1);
  const injected = [...gateBody.matchAll(/host\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const uniqSlots = [...new Set(slots)];
  const uniqInj = [...new Set(injected)];
  for (const s of uniqSlots) if (!uniqInj.includes(s)) problems.push('槽 ' + s + ' 声明了但 __bindHost 里没赋值（运行期会是 null）');
  for (const i of uniqInj) if (!uniqSlots.includes(i)) problems.push('__bindHost 里给 ' + i + ' 赋值，但没有对应的注入槽声明');
  if (uniqSlots.length && !/\.__bindHost\(\{/.test(indexText)) problems.push('index.js 里没有调用 __bindHost（槽永远拿不到真值）');
  return { ok: problems.length === 0, problems, slots: uniqSlots, injected: uniqInj };
}

/** 按台账 fixtures 逐调用重放（真 require 模块），比对输出；not_called 里的必须写理由。 */
export function checkFixtures(baseline, helpersPath, indexText) {
  const problems = [];
  let api = null;
  try { api = nodeRequire(helpersPath); } catch (e) {
    return { ok: false, problems: ['require(index-helpers.js) 失败：' + String((e && e.message) || e)] };
  }

  /* b3 起：搬迁的函数体可以引用**注入来的名字**。重放前必须先把真值注入进去，
   *   否则会得到 TypeError（例如 _ERROR_HINTS is not iterable）——那是「没注入」，不是「算错了」。
   *   注入值取自 index.js 里的 const 字面量本身（用 new Function 求值，不复制一份数据）。 */
  const hostNames = [...new Set(baseline.extracted.flatMap((e) => e.host_deps || []))];
  if (hostNames.length) {
    const shim = {};
    for (const n of hostNames) {
      /* b4 起：注入项有两种，取值方式必须分开。
       *   ① const 字面量（_ERROR_HINTS / LEDGER_* 这类）：从 index.js **现取**初始化式求值，
       *      不复制一份数据 —— 否则仓里就有两份真值。
       *   ② 函数声明（errLog 这类宿主能力）：**给静默桩**。理由：重放只该断言「返回值」，
       *      不该依赖日志副作用；而且复制 index.js 里 errLog 的实现等于第二份实现。
       *      （如果哪天某个搬迁函数在非 catch 路径依赖了宿主函数的**返回值**，静默桩会立刻
       *       在 R7 上现形 —— 这正是我们要的失败形态，不允许悄悄放过。） */
      const isFnDecl = !!indexText && new RegExp('^ {4}function ' + n.replace(/\$/g, '\\$&') + '\\s*\\(', 'm').test(indexText);
      if (isFnDecl) { shim[n] = function () { }; continue; }
      const init = indexText ? constInitializer(indexText, n) : null;
      if (!init) { problems.push('注入项 ' + n + '：在 index.js 里既不是函数声明，也找不到它的 const 初始化式'); continue; }
      try { shim[n] = new Function('return (' + init + ');')(); } catch (e) {
        problems.push('注入项 ' + n + '：初始化式求值失败 ' + String((e && e.message) || e));
      }
    }
    if (typeof api.__bindHost !== 'function') problems.push('index-helpers.js 缺 __bindHost（搬迁来的函数引用注入名，没有它就全抛）');
    else if (!api.__bindHost(shim)) problems.push('__bindHost 返回 false');
  }
  const notCalled = baseline.not_called || {};
  const fixtures = baseline.fixtures || {};
  for (const e of baseline.extracted) {
    const name = e.name;
    if (Object.prototype.hasOwnProperty.call(notCalled, name)) {
      if (!String(notCalled[name] || '').trim()) problems.push(name + '：登记在 not_called 但没写理由');
      if (typeof api[name] === 'function') { /* 不调用，只看存在性 */ } else problems.push(name + '：模块没导出这个函数');
      continue;
    }
    if (typeof api[name] !== 'function') { problems.push(name + '：模块没导出这个函数'); continue; }
    const cases = fixtures[name];
    if (!Array.isArray(cases) || !cases.length) { problems.push(name + '：台账里没有 fixtures（不取样就必须登记在 not_called 并写明理由）'); continue; }
    for (const c of cases) {
      const args = JSON.parse(JSON.stringify(c.args === undefined ? [] : c.args));
      let actual;
      try { actual = api[name].apply(null, args); } catch (err) { problems.push(name + '(' + ser(args) + ') 抛错：' + String((err && err.message) || err)); continue; }
      const want = c.out === '__undefined' ? '__undefined' : ser(c.out);
      const got = ser(actual);
      if (got !== want) problems.push(name + '(' + ser(args) + ') 输出变了：' + want + ' → ' + got);
    }
  }
  return { ok: problems.length === 0, problems };
}

export function checkRatchet(ledger, indexLines) {
  const problems = [];
  if (!Number.isFinite(indexLines)) { problems.push('读不到 index.js 行数'); return { ok: false, problems }; }
  if (indexLines >= ledger.lines_before_split) problems.push('index.js ' + indexLines + ' 行，没有低于拆分前 ' + ledger.lines_before_split);
  if (indexLines > ledger.index_lines_max) problems.push('index.js ' + indexLines + ' 行，超过台账天花板 ' + ledger.index_lines_max);
  return { ok: problems.length === 0, problems };
}

export function compareSurface(baselineSurface, nowSurface) {
  const problems = [];
  const keys = new Set([...Object.keys(baselineSurface), ...Object.keys(nowSurface)]);
  for (const k of keys) {
    if (baselineSurface[k] !== nowSurface[k]) {
      problems.push(k + '：' + (baselineSurface[k] || '(无)') + ' → ' + (nowSurface[k] || '(无)'));
    }
  }
  if (!keys.size) problems.push('导出面基线是空的（空表不是通过）');
  return { ok: problems.length === 0, problems, count: Object.keys(baselineSurface).length };
}

export function runChecks({ indexText, helpersText, baseline, exportsBase, ledger, nowSurface, helpersPath }) {
  const results = [];
  const push = (id, name, r) => results.push({ id, name, ok: r.ok, problems: r.problems || [] });
  push('R1', '入口导出面与基线逐字一致（' + exportsBase.count + ' 个符号）', compareSurface(exportsBase.surface, nowSurface));
  push('R2', 'index.js 行数只降不涨', checkRatchet(ledger, linesOf(indexText)));
  push('R3', baseline.extracted.length + ' 个函数各一份实现 + index.js 有委托绑定', checkSingleImplementation(indexText, helpersText, baseline.extracted.map((e) => e.name)));
  push('R4', '逐字节搬迁（每个函数体 sha256 与基线一致）', checkByteIdentical(helpersText, baseline));
  push('R5', '取库惰性（装载期不探 index-helpers）', checkLazyProbe(indexText));
  push('R6', '纯函数模块不持依赖面', checkPureModule(helpersText));
  push('R7', '行为快照复放（fixtures 逐调用比对）', checkFixtures(baseline, helpersPath || path.join(ROOT, HELPERS), indexText));
  push('R8', '注入面自洽（槽 ⇄ __bindHost 逐项对齐）', checkHostSurface(helpersText, indexText));
  return { ok: results.every((r) => r.ok), results };
}

function loadSurface(loaderPath) {
  /* 读数落**系统临时目录**，不落仓根：落仓根会被「目录里出现非测试文件」这类更严的口径误伤，
 *   而且下一次 git status 里会多一个没人认领的文件（本轮实测就这么脏过一次）。 */
  const tmpOut = path.join(os.tmpdir(), 'lonsha_index_surface_' + process.pid + '.json');
  const r = spawnSync(process.execPath, [loaderPath, tmpOut], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || '').slice(-800), surface: {} };
  let j = null;
  try { j = JSON.parse(readFileSync(tmpOut, 'utf8')); } catch (_e) { j = null; } finally { try { fs.unlinkSync(tmpOut); } catch (_e) { /* 清场失败不影响结论 */ } }
  if (!j) return { ok: false, error: '装载器没产出读数文件', surface: {} };
  return j;
}

async function main() {
  const need = [INDEX, HELPERS, BASELINE, EXPORTS, LEDGER, LOADER];
  const missing = need.filter((rel) => !existsSync(path.join(ROOT, rel)));
  if (missing.length) {
    console.error('[index-split] fail-closed：读不到 ' + missing.join('、'));
    process.exit(2);
  }
  const indexText = readFileSync(path.join(ROOT, INDEX), 'utf8');
  const helpersText = readFileSync(path.join(ROOT, HELPERS), 'utf8');
  const baseline = JSON.parse(readFileSync(path.join(ROOT, BASELINE), 'utf8'));
  const exportsBase = JSON.parse(readFileSync(path.join(ROOT, EXPORTS), 'utf8'));
  const ledger = JSON.parse(readFileSync(path.join(ROOT, LEDGER), 'utf8'));

  const now = loadSurface(path.join(ROOT, LOADER));
  const nowSurface = now.ok ? now.surface : null;

  const results = [];
  const push = (id, name, r) => results.push({ id, name, ok: r.ok, problems: r.problems || [] });
  if (!nowSurface) {
    push('R1', '入口能装 + 导出面一致', { ok: false, problems: ['装载失败：' + (now.error || 'unknown')] });
  } else {
    push('R1', '入口能装 + 导出面一致', compareSurface(exportsBase.surface, nowSurface));
  }
  push('R2', 'index.js 行数只降不涨', checkRatchet(ledger, linesOf(indexText)));
  push('R3', baseline.extracted.length + ' 个函数各一份实现 + 委托绑定', checkSingleImplementation(indexText, helpersText, baseline.extracted.map((e) => e.name)));
  push('R4', '逐字节搬迁（函数体 sha256）', checkByteIdentical(helpersText, baseline));
  push('R5', '取库惰性', checkLazyProbe(indexText));
  push('R6', '纯函数模块不依赖其它模块', checkPureModule(helpersText));
  push('R7', '行为快照复放（fixtures 逐调用比对）', checkFixtures(baseline, path.join(ROOT, HELPERS), indexText));
  push('R8', '注入面自洽（槽 ⇄ __bindHost 逐项对齐）', checkHostSurface(helpersText, indexText));

  const allOk = results.every((r) => r.ok);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: allOk, indexLines: linesOf(indexText), helpersLines: linesOf(helpersText), results }, null, 2));
  } else {
    for (const r of results) {
      console.log((r.ok ? 'OK  ' : 'FAIL') + ' [' + r.id + '] ' + r.name);
      for (const p of r.problems) console.log('       - ' + p);
    }
    console.log('\n[index-split] ' + (allOk ? '通过' : '未通过') + '：index.js ' + linesOf(indexText) + ' 行 / index-helpers.js ' + linesOf(helpersText) + ' 行 / 导出面 ' + Object.keys(exportsBase.surface).length + ' 个符号');
  }
  if (!allOk) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}