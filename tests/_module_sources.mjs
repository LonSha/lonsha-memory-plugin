/* _module_sources.mjs —— 拆片模块的「源码聚合读取」唯一真源
 *
 * ★ 为什么需要它（L23-O5）：
 *   `engine-diagnostic-lines.js` 由一份 5915 行的单体拆成「装配面 + 三片」之后，
 *   十几个判据仍在做**源码级**断言（从源码里抠方法体、数出现次数、验调用点顺序）。
 *   若这些判据继续只读装配面那 236 行，它们会集体报「找不到方法定义」——
 *   那不是产品缺陷，而是**判据读错了地方**，同时更危险：以后谁把函数再搬走一处，
 *   判据就会静默退化成空转（扫了个不存在的函数体还全绿）。
 *   故源码断言一律走本模块的 `readModuleSource()`：把该模块**声明的全部分片**拼起来读。
 *
 * 纪律：
 *   ① 分片清单不写死在判据里，写死在 `tests/audit/module_split_ledger.json`（可被审计）；
 *   ② 清单里的分片必须真实存在，缺一片就让 `assertModuleComplete()` 报出来 ——
 *      「拆了但判据读不到」与「没拆」必须不同形；
 *   ③ 拼装顺序：**分片在前、装配面在后**（原因见 readModuleSource 内的注释：有判据把整段源码塞进 vm
 *      执行，分片必须先自登记、装配面才能捡到）。纯文本断言不受顺序影响。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.dirname(HERE);
const LEDGER = path.join(HERE, 'audit', 'module_split_ledger.json');

let _ledger = null;
export function splitLedger() {
  if (_ledger) return _ledger;
  try { _ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')); }
  catch { _ledger = {}; }
  return _ledger;
}

/** 某文件的声明分片清单（不含自己）；未拆的模块返回空数组。 */
export function partsOf(rel) {
  const l = splitLedger();
  const e = l[rel];
  if (!e) return [];
  return Array.isArray(e.parts) ? e.parts.slice() : [];
}

/** 读模块全量源码（装配面 + 分片）。root 可选，默认本仓根。 */
export function readModuleSource(rel, root = REPO_ROOT) {
  /* 顺序：**分片在前、装配面在后**。
   *   这不只是排版：有判据把整段源码塞进 `new Function` / `vm` 执行（隔离 realm 里没有 require，
   *   分片只能靠自登记进 `global.LonShaDiagParts` 被装配面捡到）。分片先跑并登记，装配面后跑才能装上；
   *   反过来就只有装配面、api 少一半键。纯文本断言不受顺序影响。 */
  const files = [...partsOf(rel), rel];
  const out = [];
  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(root, f);
    try { out.push(fs.readFileSync(p, 'utf8')); }
    catch { out.push('/* [module_sources] 读不到 ' + f + ' */'); }
  }
  return out.join('\n');
}

/* ★ 为什么需要 anchorOwners（L23-O5 连带记账）：
 *   拆片前，负控制（真源码破坏）一律「复制单个文件 → 在副本里找锚点 → 恰中 1 次 → require 副本」。
 *   拆片后方法体搬到了分片，单文件锚点命中 0 次 —— 于是 `assert.equal(hits,1)` 抛错，判据红了；
 *   但真正危险的不是红，是有人图省事把那条断言改成「放宽」：那样破坏静默不发生，
 *   负控制退化成永远绿的空转。故这里给一个**跨全量源码定位锚点**的工具，
 *   要求调用方断言「恰有 1 个文件命中、且该文件内恰中 1 次」，破坏就打在锚点真正所在的那一片上。
 *   返回 [{file, hits}]。 */
export function anchorOwners(rel, anchor, root = REPO_ROOT) {
  const files = [...partsOf(rel), rel];
  const out = [];
  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(root, f);
    let s = null;
    try { s = fs.readFileSync(p, 'utf8'); } catch { continue; }
    const n = s.split(anchor).length - 1;
    if (n > 0) out.push({ file: f, hits: n });
  }
  return out;
}

/* 隔离 realm 里执行一段模块源码（可为 readModuleSource 的聚合面），返回该 realm 的 context。
 *   用途同 anchorOwners：拆片后「只 require 单个文件」不再等价于「装载整个模块」，
 *   而破坏副本又必须真装载才算验到（对源码文本断言 = 假绿第一形）。
 *   每个 realm 自带 `LonShaDiagParts`，互不污染全局登记表。 */
const VM_BASE = {
  console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
  isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError, RangeError,
  setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, parseInt, parseFloat,
};
export function runSourceInVm(src, extra = {}) {
  const ctx = Object.assign({}, VM_BASE, extra);
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

/** 清单自证：每个分片必须在盘上，否则抛（判据里用，禁止静默降级）。 */
export function assertModuleComplete(rel, root = REPO_ROOT) {
  const missing = [rel, ...partsOf(rel)].filter(f => !fs.existsSync(path.join(root, f)));
  if (missing.length) throw new Error('[module_sources] 缺文件：' + missing.join(', '));
  return true;
}
