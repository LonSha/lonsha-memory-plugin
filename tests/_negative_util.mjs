/* ============================================================
 * [v3.170.0] 负控制工具：在**破坏副本**上跑真判据
 * ------------------------------------------------------------
 * 为什么需要它（v3.169 NEG6/NEG9、ruby-phone v2.32 F4/F7/F8 的同形教训）：
 *   假绿的成因永远是三件事凑齐 ——
 *     ① 断言对象写错（对原文件断言，条件恒真/恒假）；
 *     ② 破坏根本没发生，却不报错；
 *     ③ 破坏发生了，但被删掉的是判据自己（自我指涉）。
 *   本工具把这三件事各自堵死：
 *     · 破坏必须真发生（锚点必须命中恰好一次，否则 `未破坏成功` 直接抛）；
 *     · 判据必须在**破坏后的模块**上重跑（半真值形状直接抛，抓「删了常量还返回 0」）；
 *     · 判据源码在 H 层先证明「不引用被删锚点」（防「把要测的判据本身删掉」）；
 *     · 引擎走**子进程**加载破坏副本，既有 v396 测试看不到任何临时文件
 *       （避免「当前目录出现非测试文件」这类更严的口径被误伤）。
 * ============================================================ */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
export const SRC_PATH = path.join(root, 'stm-ltm.js');

/** 剥注释（与主套件同一份语义：文本判据一律做在代码行上） */
export function codeLines(src) {
  const out = [];
  let inBlock = false;
  for (const raw of String(src).split('\n')) {
    let line = raw;
    if (inBlock) {
      const e = line.indexOf('*/');
      if (e === -1) continue;
      line = line.slice(e + 2); inBlock = false;
    }
    for (;;) {
      const s = line.indexOf('/*');
      if (s === -1) break;
      const e = line.indexOf('*/', s + 2);
      if (e === -1) { line = line.slice(0, s); inBlock = true; break; }
      line = line.slice(0, s) + line.slice(e + 2);
    }
    const lc = line.indexOf('//');
    if (lc !== -1) line = line.slice(0, lc);
    if (line.trim()) out.push(line);
  }
  return out;
}

/** 对源码做一次破坏；锚点必须命中恰好一次，否则抛（不许静默未破坏） */
export function breakSource(src, anchor, replacement) {
  const n = String(src).split(anchor).length - 1;
  if (n !== 1) throw new Error(`锚点命中 ${n} 次（要求恰好 1 次）：${anchor}`);
  return src.split(anchor).join(replacement);
}

/**
 * 加载破坏副本（子进程），在它上跑真判据。
 * 半真值形状（判据返回 undefined/NaN 而非抛）一律抛 —— 「删了常量还返回 0」比删判据更隐蔽。
 */
export function loadBroken(src, cacheKey) {
  const f = path.join(os.tmpdir(), `ll_neg_${cacheKey}_${process.pid}_${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(f, src, 'utf8');
  try {
    delete require.cache[require.resolve(f)];
    const mod = require(f);
    if (!mod || typeof mod !== 'object') throw new Error('半真值：破坏副本未能加载出模块');
    return mod;
  } catch (e) {
    delete require.cache[f];
    throw e;
  } finally {
    try { fs.unlinkSync(f); } catch (_e) { /* 清理失败不影响结论 */ }
  }
}

/** 负控制（同步）：判据必须「翻红」。翻红 = 抛错，或返回**半真值**（只有布尔 false 算合法响应） */
export function negative(fn, label) {
  let fired = false, how = '';
  try {
    const r = fn();
    if (typeof r === 'boolean') { fired = !r; how = fired ? '判据返回 false' : ''; }
    else { fired = true; how = `判据返回半真值 ${String(r)}（形状退化也是失效信号）`; }
  } catch (e) { fired = true; how = '判据抛错'; }
  if (!fired) throw new Error(`负控制未触发（判据对破坏无反应 = 假绿）：${label}`);
  return how;
}

/** 负控制（异步）：同上。破坏副本上的判定往往要先跑一遍 ingest/consolidate，故需异步版 */
export async function negativeAsync(fn, label) {
  let fired = false, how = '';
  try {
    const r = await fn();
    if (typeof r === 'boolean') { fired = !r; how = fired ? '判据返回 false' : ''; }
    else { fired = true; how = `判据返回半真值 ${String(r)}（形状退化也是失效信号）`; }
  } catch (e) { fired = true; how = '判据抛错：' + (e && e.message); }
  if (!fired) throw new Error(`负控制未触发（判据对破坏无反应 = 假绿）：${label}`);
  return how;
}

export const MAX_STM = 40;
export const MAX_LTM = 24;

/**
 * 真把 STM 顶到溢出，可预置 LTM 条数（与主套件同一构造，避免两处行为漂移）。
 * @param {object} mod 目标模块（原版或破坏副本）
 */
export async function rolloverWith(mod, extraLtm = 0) {
  let s = mod.normalizeState(null);
  if (extraLtm) {
    s.ltm_entries = Array.from({ length: extraLtm }, (_, i) => ({ id: 'ltm_seed' + i, summary: 'x', from_stm_ids: [], ts: 1, span: null }));
    s.ltm_counter = extraLtm;
  }
  s.consolidate_threshold = 1;
  for (let b = 0; b <= MAX_STM; b++) {
    s = mod.ingest(s, [{ text: 'b' + b, msg_id: b, floor: b }]);
    s = (await mod.consolidate(s, { force: true })).state;
  }
  return s;
}

/** 与主套件同一份 span 场景 */
export function mkSpanWith(mod) {
  const s = mod.normalizeState(null);
  s.ltm_entries = [{ id: 'ltm_1', summary: 's', from_stm_ids: ['stm_1'], ts: 1, span: { from: 3, to: 7 } }];
  s.stm_entries = [{ id: 'stm_1', text: 't', msg_ids: [11], floors: [3, 7], ts: 1, score: 0 }];
  return s;
}
