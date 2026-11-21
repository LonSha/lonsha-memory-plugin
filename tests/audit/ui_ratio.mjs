#!/usr/bin/env node
/**
 * tests/audit/ui_ratio.mjs — 呈现层占比读数（面板/UI 占全部源码的比例）
 *
 * 【为什么要这个读数】
 *   柏宝书（ST-BaiBai-Book）的 UI 占源码 **41.8%**（17 个 Vue 组件 11,269 行 / 26,959 行），
 *   本仓长期只有个位数。这个差距不是「好看不好看」，是**玩家面成熟度**：
 *   机制再对，玩家看不见就等于不存在（本仓已有 7 个「挂载但全库零消费」模块的前科）。
 *   所以把占比变成一条**可复现的读数**，而不是口头估计 —— 目标 ≥20%。
 *
 * 【口径（唯一真源，改这里就等于改口径）】
 *   · 分母 = 仓库根目录全部 .js（不含 tests/ 与 css/）+ css/ 下全部 .css 的行数。
 *     ★ tests 不计：判据代码不是产品。
 *   · 分子（呈现层）= ① css/*.css 全部；② 根目录里**文件名**命中 UI 词表的 .js。
 *     词表刻意宽（panel/ui/console/dashboard/orb/shell/nav/theme/skin/card/tree/sheet），
 *     宁可多算一点也不漏算 —— 漏算会让读数虚低，反而看不出差距。
 *
 * 用法：
 *   node tests/audit/ui_ratio.mjs            # 打印读数
 *   node tests/audit/ui_ratio.mjs --json     # 机读
 *   node tests/audit/ui_ratio.mjs --gate     # 不达 20% 退出码 1（CI 用）
 *   node tests/audit/ui_ratio.mjs --root=/path/to/tree   # 探针用（证明会在坏树上变红）
 *
 * 退出码：0 卫生 / 1 真缺陷 / 2 结构漂移
 *   0 = 读数跑完（未加 --gate 时即使不足 20% 也是 0 —— 「读数」不是「缺陷」）
 *   1 = 仅 --gate 下低于目标值：呈现层占比不达标
 *   2 = 探测器失效：根目录没有 .js，或 css/ 缺失 ⇒ 分母不完整，拒绝给结论
 *   【为什么 1 与 2 必须分开】把「量不了」混成「差一点」，会引导人去调阈值而不是去看树。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const rootArg = (process.argv.find((a) => a.startsWith('--root=')) || '').slice('--root='.length);
const ROOT = rootArg ? path.resolve(rootArg) : path.resolve(HERE, '../..');
const TARGET = 0.20;

/** 文件名命中即算呈现层（宽口径，见文件头注释）。 */
const UI_WORDS = [
  'panel', 'ui', 'console', 'dashboard', 'orb', 'shell', 'nav',
  'theme', 'skin', 'card', 'tree', 'sheet', 'view', 'board',
];

function linesOf(file) {
  try {
    const s = readFileSync(file, 'utf8');
    if (!s.length) return 0;
    return s.split('\n').length - (s.endsWith('\n') ? 1 : 0);
  } catch { return 0; }
}

function isUiJs(name) {
  const n = name.toLowerCase();
  if (!n.endsWith('.js')) return false;
  // 机制模块不算呈现层：即便名字里带 ui 也不该心虚（本仓 v4-panel-ui 是呈现层，算）。
  return UI_WORDS.some((w) => n.includes(w));
}

const rootJs = readdirSync(ROOT)
  .filter((f) => f.endsWith('.js') && statSync(path.join(ROOT, f)).isFile());

const cssDir = path.join(ROOT, 'css');
let cssFiles = [];
try { cssFiles = readdirSync(cssDir).filter((f) => f.endsWith('.css')); } catch { cssFiles = []; }

let totalJs = 0;
let uiJs = 0;
const uiList = [];
for (const f of rootJs) {
  const n = linesOf(path.join(ROOT, f));
  totalJs += n;
  if (isUiJs(f)) { uiJs += n; uiList.push([f, n]); }
}

let totalCss = 0;
const cssList = [];
for (const f of cssFiles) {
  const n = linesOf(path.join(cssDir, f));
  totalCss += n;
  cssList.push([f, n]);
}

/* —— 结构漂移：无法测量的情形必须与「没达标」分开 ——
 * 【为什么】v3159 的约定：扫描器在「树本身不对」时退出码 2，
 *   「读数达标与否」才是 1。两者混用会让 CI 把「量不了」当成「差一点」，
 *   于是有人去改阈值而不是去看树 —— 这是最坏的一种自我宽容。 */
if (!rootJs.length) {
  console.error('[ui-ratio] 结构漂移：根目录没有任何 .js，无法测量（ROOT=' + ROOT + '）');
  process.exit(2);
}
if (!cssFiles.length) {
  console.error('[ui-ratio] 结构漂移：css/ 目录不存在或没有 .css，分母不完整（ROOT=' + ROOT + '）');
  process.exit(2);
}

const total = totalJs + totalCss;
const ui = uiJs + totalCss;
const ratio = total ? ui / total : 0;
/** 要到 TARGET 还差多少行（新增全投呈现层时的解：(ui+x)/(total+x) = TARGET）。 */
const need = ratio >= TARGET ? 0 : Math.ceil((TARGET * total - ui) / (1 - TARGET));

const result = {
  total, totalJs, totalCss,
  ui, uiJs, uiCss: totalCss,
  ratio: Math.round(ratio * 10000) / 10000,
  target: TARGET,
  needLines: need,
  uiFiles: uiList.sort((a, b) => b[1] - a[1]),
  cssFiles: cssList.sort((a, b) => b[1] - a[1]),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`呈现层 ${ui} 行 / 全部 ${total} 行 = ${(ratio * 100).toFixed(1)}%（目标 ${(TARGET * 100).toFixed(0)}%）`);
  console.log(`  其中 UI-JS ${uiJs} 行（${uiList.length} 文件） + CSS ${totalCss} 行（${cssFiles.length} 文件）`);
  console.log(`  分母 = 根目录 JS ${totalJs} 行 + CSS ${totalCss} 行（tests/ 不计）`);
  if (need > 0) console.log(`  还差 ${need} 行呈现层可达 ${(TARGET * 100).toFixed(0)}%（新增须全部投入 UI/CSS）`);
  console.log('  最大 UI 文件：');
  for (const [f, n] of uiList.slice(0, 8)) console.log(`    ${n}\t${f}`);
}

if (process.argv.includes('--gate') && ratio < TARGET) process.exit(1);
