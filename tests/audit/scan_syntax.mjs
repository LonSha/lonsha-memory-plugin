#!/usr/bin/env node
/* ============================================================
 * 审计基建 C：语法门（强制 ES Module 解析）
 * ------------------------------------------------------------
 * 为什么存在：
 *   v3.91 建的 scan_wiring（接线）/ scan_resilience（容灾）都只读源码文本
 *   做正则统计，没有任何一条路径真正解析入口文件。因此本仓库存在与
 *   ruby-phone v2.8.10 完全同构的盲区：index.js 若被改出结构性语法错误，
 *   289 项回归仍会全绿，而插件在浏览器里根本不会被加载。
 *
 *   ruby-phone 的实测教训：`node --check <file>.js` 在按 CommonJS 解析时，
 *   对「含顶层 import/export 且结构损坏」的文件返回退出码 0（假绿）。
 *
 * 判定策略（三条实测结论，勿凭直觉改动）：
 *   1. 一律用 ESM 语义解析 .js/.mjs。
 *      ESM 语法是 CJS 的严格超集：实测本仓库 19 个 IIFE/CJS 风格 .js
 *      （其中 15 个含 require/module.exports）在强制 ESM 解析下 0 失败，
 *      故本门无假阳性。
 *   2. 不要用「CJS 检查失败 → ESM 复检」的自适应方案。实测否证：对
 *      `import fs from "node:fs"; ... }  } else if (z) {` 这类文件，
 *      CJS 检查直接返回 0，永不进入复检分支，恰好漏掉本门要拦的缺陷。
 *   3. 不要用自写 tokenizer 猜模块形态。实测否证：正则字面量会让引号/
 *      注释状态机错位，把 9 个纯 CJS 文件误判成 ESM。
 *
 *   ⚠️ 本仓库不可照搬 ruby-phone 的 package.json "type":"module"：
 *      15 个 .js 含 require/module.exports 运行时特征，加了会在运行时炸。
 *      因此拦截能力只能由本脚本自身提供。
 *
 * 性能层（v3.177.0，慎改）：
 *   旧实现对每个文件 spawn 一次 `node --check`（220 文件 = 220 个子进程，
 *   单次扫描实测 ~14s）。v392 语法门测试为覆盖多种损坏形态 + 负控制，
 *   单次运行会调用本门 10 次，累计 >120s 直接触发测试超时——门禁本身的
 *   回归成本高到无法通过，属真实基建债。
 *   现改为「本进程内 vm 批量解析」（单次 <1s）：
 *     - 命中失败的文件，才逐个回退到 per-file `--check` 取回精确 stderr
 *       （vm 抛出的 SyntaxError 不含行号/文件名，必须回退补齐）。
 *     - 判定等价性已实测：对照 220 个真实文件的 per-file `--check`，
 *       逐文件比对 0 处不一致（含损坏 ESM / 损坏 CJS / 健康 ESM / 健康 CJS）。
 *   vm.SourceTextModule 需 --experimental-vm-modules，故无该标志时
 *   自 re-exec 一次（stdio: inherit，不占用管道缓冲）。
 *
 * 用法：
 *   node tests/audit/scan_syntax.mjs              # 校验仓库
 *   node tests/audit/scan_syntax.mjs --verbose    # 逐文件输出
 *   node tests/audit/scan_syntax.mjs --root <dir> # 校验指定目录（负控制自测）
 * 退出码：0=全部可解析  1=存在损坏  2=参数错误
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VM_FLAG = '--experimental-vm-modules';
if (!process.execArgv.includes(VM_FLAG) && !process.env.LONSHA_SYNTAX_GATE_REEXEC) {
  const r = spawnSync(
    process.execPath,
    [VM_FLAG, '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { env: { ...process.env, LONSHA_SYNTAX_GATE_REEXEC: '1' }, stdio: 'inherit' },
  );
  process.exit(typeof r.status === 'number' ? r.status : 1);
}

const args = process.argv.slice(2);
const rootIdx = args.indexOf('--root');
const root = rootIdx >= 0
  ? path.resolve(args[rootIdx + 1] || '.')
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const verbose = args.includes('--verbose');

if (rootIdx >= 0 && !fs.existsSync(root)) {
  console.error(`✗ --root 指向不存在的路径: ${root}`);
  process.exit(2);
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.wrangler']);
// .js/.mjs 走 ESM 强校验；.cjs 显式 CommonJS，用脚本模式校验（仍会暴露结构损坏）
const TARGET_EXT = /\.(js|mjs|cjs)$/;

function* walk(dir) {
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of ents) {
    if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* walk(p);
    else if (TARGET_EXT.test(ent.name)) yield p;
  }
}

// 批量快筛：单进程内解析，不 spawn。语义与 --check 等价（已实测对照）。
function parseOne(file, src) {
  try {
    if (file.endsWith('.cjs')) new vm.Script(src, { filename: file });
    else new vm.SourceTextModule(src, { identifier: file });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.message || e) };
  }
}

// 仅失败文件回退：拿精确 stderr（含 [stdin]:N 行号）+ 权威判定
function checkEsm(file) {
  try {
    execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: fs.readFileSync(file),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.stderr || e.message) };
  }
}

function checkScript(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (e) {
    return { ok: false, err: String(e.stderr || e.message) };
  }
}

function firstErr(err) {
  const lines = String(err).split('\n').map(l => l.trim()).filter(Boolean);
  return (lines.find(l => /Error/i.test(l)) || lines[0] || 'parse error').slice(0, 200);
}

function errLine(err) {
  const m = String(err).match(/\[stdin\]:(\d+)/) || String(err).match(/:[\w./-]+?:(\d+)\n/);
  return m ? m[1] : undefined;
}

let total = 0, esmChecked = 0, cjsChecked = 0;
const failures = [];

for (const file of walk(root)) {
  total++;
  const rel = path.relative(root, file);
  const isCjs = file.endsWith('.cjs');
  if (isCjs) cjsChecked++; else esmChecked++;

  const src = fs.readFileSync(file, 'utf8');
  const fast = parseOne(file, src);

  if (fast.ok) {
    if (verbose) console.log(`ok   ${rel}  [${isCjs ? 'cjs' : 'esm'}]`);
    continue;
  }

  // 快筛报失败 → 用 per-file --check 复检取权威结论与报错文本
  const r = isCjs ? checkScript(file) : checkEsm(file);
  if (r.ok) {
    // 理论上不可达（等价性已实测）；万一发生，以权威结果为准，不误报
    if (verbose) console.log(`ok   ${rel}  [${isCjs ? 'cjs' : 'esm'}]`);
    continue;
  }
  failures.push({ rel, msg: firstErr(r.err), line: errLine(r.err) });
}

if (total === 0) {
  console.error('✗ 未找到任何可校验文件（--root 是否指向正确目录？）');
  process.exit(2);
}

if (failures.length) {
  console.error(`\n✗ 语法门失败：${failures.length}/${total} 个文件无法被 Node 解析\n`);
  for (const f of failures) {
    console.error(`  ${f.rel}${f.line ? `  (约第 ${f.line} 行)` : ''}`);
    console.error(`      ${f.msg}`);
  }
  console.error('\n提示：若损坏位于 index.js，浏览器加载扩展时直接失败——');
  console.error('      表现为「插件装了但完全没反应」，且回归测试不会变红。');
  process.exit(1);
}

console.log(`✓ 语法门通过：${total} 个文件均可解析（ESM 强校验 ${esmChecked} / CJS ${cjsChecked}）`);
