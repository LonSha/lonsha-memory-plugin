/* ============================================================
 * 装载期可达性**实测**探针（手工工具；`_` 前缀 ⇒ 不被 tests/run.mjs --audit 自动枚举）
 *
 * 为什么需要探头，而不是静态闭包分析（两次教训，都写在 index_split_ledger.json 的 batch3 里）：
 *   · numOr —— 闭包为空，但它装载期可达：IIFE 顶层 new LonShaMemoryPlugin() → _assembleComponents 会调它。
 *   · hintForError —— 闭包也为空，但它被**装载期可达的 errLog** 调用（调用方方向）。
 *   两个方向静态闭包分析都看不见；b3 先搬后回滚过一次，就是栽在这上面。
 *
 * 做法：给每个 `    function NAME(` 的函数体开头插一句「登记自己」，用 tests/_index_loader.cjs 的
 *   makeHost() 造最小宿主装载 index.js，等 waitMs（默认 500ms，覆盖 init() 的异步延续段），
 *   收出被调到的名字，最后**无论如何**回滚 index.js（finally）。
 *
 * 安全：跑之前要求 index.js 在 git 里是干净的。否则拒绝跑 —— 绝不用 git checkout 去吃掉别人的工作。
 *
 * 用法：
 *   node tests/audit/_probe_init_reach.mjs [--wait 500] [--out /tmp/init_reach.json]
 * 输出 JSON：{ measured_at, instrumented, declarations, hits, unmoved_declarations, unmoved_reachable, missing }
 *   unmoved_reachable = hits ∩ (顶层唯一声明且不在基线 extracted 里的那些) —— 这批就是「搬走会装载即抛」的。
 *   注意字段是 unmoved_* 而不是 candidate_*：这里只排除了「已搬走的」，**没有**排除函数体含 this 的那些，
 *   所以 unmoved_declarations(218) 会比台账里的候选原料(215) 大。权威候选口径在扫描器与台账，不在本探针。
 * ============================================================ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const INDEX = path.join(ROOT, 'index.js');
const BASELINE = path.join(ROOT, 'tests/audit/index_helpers_baseline.json');
const LOADER = path.join(ROOT, 'tests/_index_loader.cjs');
const TAG = '__INIT_REACH__';

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const waitMs = parseInt(argOf('--wait', '500'), 10);
const outPath = argOf('--out', path.join(os.tmpdir(), 'lonsha_init_reach.json'));

const git = (a) => execSync('git ' + a, { cwd: ROOT, encoding: 'utf8' }).trim();

/* ---- 安全闸：index.js 必须干净，否则这次跑会把别人的改动 checkout 掉 ---- */
const dirty = git('status --porcelain -- index.js');
if (dirty) {
  console.error('[init-reach] 拒绝运行：index.js 在 git 里有未提交改动（\n' + dirty + '\n）');
  console.error('[init-reach] 本探针会改写 index.js 再回滚，脏工作区下回滚等于毁掉你的改动。先提交或 stash。');
  process.exit(2);
}
if (!fs.existsSync(LOADER)) {
  console.error('[init-reach] fail-closed：读不到 tests/_index_loader.cjs');
  process.exit(2);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const moved = new Set((baseline.extracted || []).map((e) => e.name));

const original = fs.readFileSync(INDEX, 'utf8');
const lines = original.split('\n');

/* ---- 定位所有顶层（4 空格缩进）函数声明；同名多次的一律不测（声明唯一是先决条件） ---- */
const decls = [];
const seen = new Map();
for (let i = 0; i < lines.length; i++) {
  const m = /^ {4}function ([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
  if (!m) continue;
  const name = m[1];
  let off = 0;
  for (let k = 0; k < i; k++) off += lines[k].length + 1;
  decls.push({ name, offset: off + 4 });
  seen.set(name, (seen.get(name) || 0) + 1);
}
const dupes = [...seen.entries()].filter(([, c]) => c > 1).map(([n]) => n);

const targets = [];
const missing = [];
for (const d of decls) {
  if (seen.get(d.name) > 1) { continue; }
  const brace = original.indexOf('{', d.offset);
  if (brace < 0) { missing.push(d.name + '(无花括号)'); continue; }
  targets.push({ name: d.name, at: brace + 1 });
}

/* ---- 插桩：从后往前，使偏移不漂 ---- */
let text = original;
for (const t of targets.sort((a, b) => b.at - a.at)) {
  const mark = "\n        try { (globalThis." + TAG + " = globalThis." + TAG + " || []).push('" + t.name + "'); } catch (_e) { /* init-reach 插桩 */ }";
  text = text.slice(0, t.at) + mark + text.slice(t.at);
}

const probeFile = path.join(os.tmpdir(), 'lonsha_init_reach_probe_' + process.pid + '.cjs');
let result = null;
try {
  fs.writeFileSync(INDEX, text, 'utf8');
  execSync('node --check ' + JSON.stringify(INDEX), { cwd: ROOT, stdio: 'pipe' });

  fs.writeFileSync(probeFile, [
    "const { makeHost } = require(" + JSON.stringify(LOADER) + ");",
    "makeHost();",
    "let loadErr = '';",
    "try { require(" + JSON.stringify(INDEX) + "); } catch (e) { loadErr = String((e && e.message) || e); }",
    "setTimeout(() => {",
    "  const hits = Array.from(new Set(globalThis." + TAG + " || [])).sort();",
    '  console.log("INITREACH=" + JSON.stringify({ hits, loadErr }));',
    "  process.exit(0);",
    "}, " + waitMs + ");",
    "",
  ].join('\n'), 'utf8');

  const r = spawnSync(process.execPath, [probeFile], { cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 1e8 });
  const out = String(r.stdout || '') + String(r.stderr || '');
  const m = /INITREACH=(\{[^\n]*\})/.exec(out);
  if (!m) {
    console.error('[init-reach] 探针没吐出读数：\n' + out.slice(-800));
    process.exitCode = 1;
  } else {
    const parsed = JSON.parse(m[1]);
    const hits = parsed.hits || [];
    const hitSet = new Set(hits);
    const unmoved = targets.map((t) => t.name).filter((n) => !moved.has(n));
    result = {
      measured_at: new Date().toISOString(),
      wait_ms: waitMs,
      instrumented: targets.length,
      declarations: decls.length,
      duplicate_names: dupes,
      missing,
      load_error: parsed.loadErr || '',
      hits,
      hits_count: hits.length,
      unmoved_declarations: unmoved.length,
      unmoved_reachable: unmoved.filter((n) => hitSet.has(n)),
      unmoved_reachable_count: unmoved.filter((n) => hitSet.has(n)).length,
    };
  }
} finally {
  /* 无论如何回滚 —— 探针改的是真仓 index.js */
  try { execSync('git checkout -- index.js', { cwd: ROOT, stdio: 'pipe' }); } catch (e) {
    console.error('[init-reach] 回滚失败！请手工 git checkout -- index.js：' + String(e.message || e));
  }
  try { fs.unlinkSync(probeFile); } catch (_e) { /* 清场失败不影响结论 */ }
}

if (result) {
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  const after = fs.readFileSync(INDEX, 'utf8');
  console.log('[init-reach] 插桩 ' + result.instrumented + '/' + result.declarations + ' 个顶层函数声明');
  console.log('[init-reach] 装载期被调到 ' + result.hits_count + ' 个' + (result.load_error ? '（装载报错：' + result.load_error + '）' : ''));
  console.log('[init-reach] 未搬走的唯一声明 ' + result.unmoved_declarations + ' 个，其中装载期可达（搬走会装载即抛）' + result.unmoved_reachable_count + ' 个');
  console.log('[init-reach] 回滚后 index.js ' + after.split('\n').length + ' 行；git 干净=' + (git('status --porcelain -- index.js') === ''));
  console.log('[init-reach] 读数写入 ' + outPath);
  if (after !== original) {
    console.error('[init-reach] 严重：回滚后内容与原文不一致！');
    process.exitCode = 1;
  }
}
