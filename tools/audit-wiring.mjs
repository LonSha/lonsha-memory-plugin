#!/usr/bin/env node
/**
 * [AUDIT] 全域接线审计器 —— 揪出「测试绿了但宿主没接上」的那一类孤岛模块。
 *
 * 判据（每条都是本轮踩过的真实病灶）：
 *   A1 死全局：模块挂了 globalThis.X，但仓内除自身外零引用 ⇒ 无人消费
 *   A2 死槽位：写了 this.engine._X = new Cls()，但全仓无人读 _X
 *   A3 槽位错位：写入名 _A，别处读取 _A' 且 _A' 未被挂载（同一引擎双实例）
 *   A4 清单缺失：仓内根目录 *.js 但不在 manifest.extra_js
 *   A5 清单冗余：manifest.extra_js 里的文件不存在 / 重复
 *   A6 状态谎报：无条件 `_moduleStatus.K = true`（无 if 守卫）
 *   A7 空订阅：EventBus.on('evt') 但全仓无 emit('evt')
 *
 * 用法：node tools/audit-wiring.mjs [仓库根目录] [--strict]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || '.';
const STRICT = process.argv.includes('--strict');
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'docs') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); }
    else if (/\.[cm]?js$/.test(e.name) && !p.includes('/tests/') && !p.includes('audit-wiring')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const text = new Map(files.map((f) => [path.relative(ROOT, f), read(f)]));
const manifest = (() => { try { return JSON.parse(read(path.join(ROOT, 'manifest.json'))); } catch { return null; } })();
const ENTRY = manifest?.js || 'index.js';
const probs = { A1: [], A2: [], A3: [], A4: [], A5: [], A6: [], A7: [] };

/* ── 1. 全局导出名 ────────────────────────────────────────── */
const globalOf = new Map();
for (const [f, t] of text) {
  const names = new Set();
  for (const m of t.matchAll(/(?:globalThis|window|root)\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g)) names.add(m[1]);
  for (const m of t.matchAll(/export\s+default\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  if (names.size) globalOf.set(f, names);
}

function refCount(name, selfFile) {
  const re = new RegExp(`\\b${name}\\b`, 'g');
  let n = 0;
  for (const [f, t] of text) {
    if (f === selfFile) continue;
    n += (t.match(re) || []).length;
  }
  return n;
}

/* ── 注册表登记面（按文件名登记的模块，其全局名由 registry 间接解析，
      即使仓内零字面引用也不算死全局）────────────────────────── */
const registryFile = 'optional-engine-registry.js';
const registryText = text.get(registryFile) || '';
const registryFiles = new Set(
  [...registryText.matchAll(/\[\s*'[^']+'\s*,\s*'([^']+)'\s*\]/g)].map((m) => m[1])
);
const registrySymbols = new Set(
  [...registryText.matchAll(/\[\s*'([^']+)'\s*,\s*'[^']+'/g)].map((m) => m[1])
);

/* ── A1 死全局（按文件判定：extra_js 里登记的模块，其全部全局名都零消费）── */
const NOISE = /^(api|exports|module|root|self|default|__esModule|factory|globalThis|window|define|AMD)$/;
const extraList = Array.isArray(manifest?.extra_js) ? manifest.extra_js : [];
for (const base of extraList) {
  const names = globalOf.get(base);
  if (!names) continue;                    // 无全局导出（纯 IIFE 工具）不算
  const live = [...names].filter((n) => !NOISE.test(n));
  if (!live.length) continue;
  const used = live.filter((n) => refCount(n, base) > 0 || registrySymbols.has(n));
  if (used.length === 0) probs.A1.push({ file: base, symbols: live.join(',') });
}

/* ── A2 / A3 槽位 ─────────────────────────────────────────── */
const indexT = text.get(ENTRY) || '';
/* 写入面扫描前必须先抹掉注释：index.js 里有一段解释成因的注释
 *   `if (!engine._X) engine._X = new Lib()`（说明「双实例」病灶），
 * 它会被 WRITE 正则当成真实写入，于是 `_X` 长期出现在 A2 死槽位里。
 * 注释里的示例代码不是代码 —— 否则审计器会持续自造假阳性，
 * 让真正待查的死槽位被淹没在噪声里。 */
const indexTCode = indexT
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((ln) => (ln.trim().startsWith('//') ? '' : ln))
  .join('\n');
/* 只认「引擎槽位」形态：this.engine._X = new Cls() / engine._X = new Cls()
   —— 条件语句里的 `if (Cls) this.engine._X = new Cls();` 也要算写入。 */
const slotsWritten = [...new Set(
  [...indexTCode.matchAll(/(?:this\.)?engine\.(_[A-Za-z0-9]+)\s*=\s*new\b/g)].map((m) => m[1])
)];
const slotsRead = new Set();
const GUARD_RE = /if\s*\(\s*!?\s*(?:this\.)?engine\.(_[A-Za-z0-9]+)\s*\)\s*\{?\s*$/;
const WRITE_RE = /(?:this\.)?engine\.(_[A-Za-z0-9]+)\s*=\s*new\b/;
for (const [f, t] of text) {
  for (const lnRaw of t.split('\n')) {
    const ln = lnRaw;
    const trimmed = ln.trim();
    /* 注释行必须排除：注释里的示例代码（如 index.js 中解释成因的
     * `if (!engine._X) engine._X = new Lib()`）不是真实读取，
     * 否则 A2 会长期挂一条 `{"slot":"_X"}` 的假阳性，
     * 让人误以为还有一个死槽位待查。 */
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    if (WRITE_RE.test(trimmed)) continue;          // 赋值行不算读取
    if (GUARD_RE.test(trimmed)) continue;          // 存在性守卫 = 将会写，不是已消费
    for (const m of ln.matchAll(/\b(_[A-Za-z0-9]+)\b/g)) slotsRead.add(m[1]);
  }
}
for (const s of slotsWritten) if (!slotsRead.has(s)) probs.A2.push({ slot: s });

const norm = (s) => s.replace(/(Engine|Lib|State|Hub|Matrix)+$/g, '').toLowerCase();
const writeSet = new Set(slotsWritten);
for (const r of slotsRead) {
  if (!r.startsWith('_') || r.length < 4 || writeSet.has(r)) continue;
  const nr = norm(r);
  if (!nr) continue;
  const twin = slotsWritten.find((w) => w !== r && norm(w) === nr);
  if (twin) probs.A3.push({ read: r, written: twin });
}

/* ── A4 / A5 清单一致性 ───────────────────────────────────── */
if (manifest && Array.isArray(manifest.extra_js)) {
  const listed = manifest.extra_js;
  const dup = [...new Set(listed.filter((v, i) => listed.indexOf(v) !== i))];
  const missing = listed.filter((v) => !fs.existsSync(path.join(ROOT, v)));
  if (dup.length) probs.A5.push({ kind: 'duplicate', items: dup });
  if (missing.length) probs.A5.push({ kind: 'missing-file', items: missing });
  const inList = new Set(listed);
  for (const f of files) {
    const d = path.dirname(f);
    if (d !== '.' && path.resolve(d, ROOT) !== path.resolve(ROOT)) continue;
    const base = path.basename(f);
    if (base === ENTRY) continue;
    if (inList.has(base)) continue;
    probs.A4.push({ file: base });
  }
}

/* ── A6 状态谎报 ──────────────────────────────────────────── */
for (const [f, t] of text) {
  const lines = t.split('\n');
  lines.forEach((ln, i) => {
    if (!/_moduleStatus\.[A-Za-z0-9_]+\s*=\s*true/.test(ln)) return;
    const win = lines.slice(Math.max(0, i - 60), i).join('\n');
    if (!/if\s*\(/.test(win)) probs.A6.push({ file: f, line: i + 1, text: ln.trim() });
  });
}

/* ── A7 空订阅（排除宿主/流事件等外部产源）────────────────── */
const EXTERNAL_EVENTS = /^(data|exit|close|error|end|finish|readable|drain|pause|resume|message|connect|disconnect|timeout|change|load|DOMContentLoaded|ready|resize|scroll|click|input|keydown|keyup|focus|blur|visibilitychange|beforeunload|hashchange|popstate|online|offline|storage|unhandledrejection|beforeinput|paste|copy|cut|drop|dragover|dragleave|dragenter|dragend|wheel|touchstart|touchend|touchmove|contextmenu|mousedown|mouseup|mousemove|mouseenter|mouseleave|pointerdown|pointerup|pointermove|animationend|transitionend|submit|reset|wheel)$/;
const subscribed = new Set();
const emitted = new Set();
for (const [, t] of text) {
  for (const m of t.matchAll(/\.on\(\s*["']([A-Za-z0-9_:.-]+)["']/g)) subscribed.add(m[1]);
  for (const m of t.matchAll(/\.emit\(\s*["']([A-Za-z0-9_:.-]+)["']/g)) emitted.add(m[1]);
}
for (const s of subscribed) {
  if (EXTERNAL_EVENTS.test(s)) continue;
  if (!emitted.has(s)) probs.A7.push({ event: s });
}

/* ── 输出 ─────────────────────────────────────────────────── */
const label = {
  A1: '死全局（挂了但全仓零消费）',
  A2: '死槽位（写入但无人读取）',
  A3: '槽位错位（同一引擎双实例）',
  A4: '未登记进 manifest.extra_js',
  A5: '清单冗余/损坏【P0】',
  A6: '状态谎报（无守卫真值）',
  A7: '空订阅（有 on 无 emit）'
};
let total = 0;
for (const k of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']) {
  const list = probs[k];
  total += list.length;
  console.log(`\n=== ${k} ${label[k]} : ${list.length} ===`);
  for (const it of list.slice(0, 50)) console.log('  ' + JSON.stringify(it));
  if (list.length > 50) console.log(`  ... 还有 ${list.length - 50} 项`);
}
console.log(`\n[AUDIT] 扫描文件 ${files.length} 个 | 问题合计 ${total} 项`);
if (STRICT && probs.A5.length) {
  console.error('[AUDIT] --strict 命中 P0（清单冗余/损坏），退出码 1');
  process.exit(1);
}
process.exit(0);