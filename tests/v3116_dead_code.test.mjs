/**
 * v3.116 — 死代码物理清除（Dead Code Elimination）
 *
 * 背景：v3.35 的「运行时瘦身」只是把 12 个幽灵模块移出 extra_js 加载队列，
 *   源文件仍留在仓库里。经盘点，这些文件合计约 5.9k 行，从未被任何已注册
 *   模块 require/import，也没有被 index.js 动态加载——是纯死代码。
 *   v3.116 将其全部物理删除，并额外清除 graph-worker.js（仅被已删的
 *   worker-manager.js 通过 new Worker('graph-worker.js') 引用）。
 *
 * 覆盖：
 *   0  版本与 manifest
 *   1  死文件已全部删除（14 个：12 幽灵 + gpu-renderer + graph-worker）
 *   2  manifest extra_js 不含任何已删模块（防止注册残留）
 *   3  现存所有根 .js 文件均「已注册或被引用」——无新增死代码
 *   4  活跃代码总量下降（死代码清除生效，非形式化）
 *   5  活模块语法仍可解析（删除未破坏任何加载链）
 *   6  逆向审计：被删模块的类名/全局未在活跃代码中留下悬空引用
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
// [v3.205.0] T3：死代码行数上界的唯一真源（见下方【4】的落法注释）
import { readBudget } from './audit/dead_code_budget.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const idxSrc = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function vnum(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

// v3.35 判定的幽灵模块 + v3.116 补充清除的依赖文件
const DEAD = [
  'worker-manager.js', 'virtual-renderer.js', 'wasm-bridge.js', 'storage.js',
  'gpu-renderer.js', 'realtime-sync.js', 'cloud-sync.js', 'gnn-recommender.js',
  'llm-entity-extractor.js', 'smart-summary-anomaly.js', 'production-hardening.js',
  'auto-tuning.js',
  // v3.116 追加：仅被已删模块引用的 worker 脚本
  'graph-worker.js',
];

// ---------- 0 ----------
test('【0】版本与 manifest', () => {
  const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
  assert.ok(vnum(v) >= vnum('3.116.0'), `index.js 版本 ${v} < 3.116.0`);
  assert.ok(vnum(manifest.version) >= vnum('3.116.0'), `manifest 版本 ${manifest.version} < 3.116.0`);
  ok('版本 / manifest');
});

// ---------- 1 ----------
test('【1】死文件已全部删除', () => {
  for (const f of DEAD) {
    assert.ok(!existsSync(path.join(ROOT, f)), `死文件已删除: ${f}`);
  }
  ok(`13 个死文件全部删除（~5.9k 行）`);
});

// ---------- 2 ----------
test('【2】manifest extra_js 不含任何已删模块', () => {
  const ej = manifest.extra_js || [];
  for (const f of DEAD) {
    assert.ok(!ej.includes(f), `extra_js 残留已删模块: ${f}`);
  }
  // 反向：extra_js 中的每个文件都应实际存在（无指向已删文件的悬空注册）
  for (const f of ej) {
    assert.ok(existsSync(path.join(ROOT, f)), `extra_js 指向不存在的文件: ${f}`);
  }
  ok('extra_js 无悬空注册');
});

// ---------- 3 ----------
test('【3】现存所有根 .js 文件均「已注册或被引用」', () => {
  const registered = new Set([
    ...(typeof manifest.js === 'string' ? [manifest.js] : (manifest.js || [])),
    ...(manifest.extra_js || []),
  ]);
  const allJs = readdirSync(ROOT).filter(f => f.endsWith('.js'));
  const orphans = [];
  for (const f of allJs) {
    if (registered.has(f)) continue;
    // 被引用检测：其他文件中出现该文件名（作为模块标识）
    const base = f.replace(/\.js$/, '');
    let ref = false;
    for (const g of allJs) {
      if (g === f) continue;
      const gs = readFileSync(path.join(ROOT, g), 'utf8');
      const re = new RegExp(`(^|[^\\w./-])${base.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(\\.js)?['"]`);
      if (re.test(gs)) { ref = true; break; }
    }
    if (!ref) orphans.push(f);
  }
  assert.deepStrictEqual(orphans, [], `仍存在未被注册也未被引用的孤立文件: ${JSON.stringify(orphans)}`);
  ok(`现存 ${allJs.length} 个根 .js 文件全部活跃（注册或被引用）`);
});

// ---------- 4 ----------
/* [v3.205.0] T3 落法：上界不再手写在本文件里。
 *   此前是字面量，每次活跃模块增长都要人工改（v3.202.0 手抬 32450 → 32700），
 *   漏改的风险是「余量用尽即翻红，而翻红只说明数字不够大」。
 *   现在上界的**唯一真源**是 tests/audit/dead_code_budget.json，由
 *   tests/audit/dead_code_budget.mjs 读取与抬升（抬升必须给 --reason，写进 JSON）。
 *   本判据仍守住「不给死代码留余量」：上界必须 >= 实测，且余量不得超过 maxSlack ——
 *   上界与实测脱节（余量过大）本身就是判据失效，故一并报。 */
test('【4】活跃代码总量下降', () => {
  const allJs = readdirSync(ROOT).filter(f => f.endsWith('.js'));
  let total = 0;
  for (const f of allJs) total += readFileSync(path.join(ROOT, f), 'utf8').split('\n').length;
  // [v3.175] 判据不绑可变形状：根 .js 数 = 入口(index.js) + manifest 声明的 extra_js。
  //   写死数字每加一个模块就翻红，而它真正要守的是「根目录没有游离的 .js」这条不变式。
  const declaredMods = 1 + ((manifest.extra_js || []).length);
  assert.ok(allJs.length === declaredMods, `根 .js 文件数应等于入口+声明模块 ${declaredMods}，实 ${allJs.length}（游离 ${allJs.length - declaredMods} 个）`);
  // [v3.205.0] 上界与余量都从唯一真源读（见上方注释：T3）。
  const { ceiling, maxSlack } = readBudget();
  assert.ok(total < ceiling, `总行数 ${total} < 上界 ${ceiling}（上界见 tests/audit/dead_code_budget.json；`
    + `若是活跃功能增长：node tests/audit/dead_code_budget.mjs --bump --reason='...'；若是死代码回流：删掉它）`);
  assert.ok(ceiling - total <= maxSlack, `上界余量 ${ceiling - total} 不得超过 maxSlack ${maxSlack}`
    + `（余量过大 = 上界与实测脱节，等于没守；抬升请带理由走 --bump）`);
  assert.ok(total > 15000, `总行数 ${total} > 15000（未误删活跃代码）`);
  ok(`活跃代码 ${allJs.length} 文件 / ${total} 行（上界 ${ceiling}）`);
});

// ---------- 5 ----------
test('【5】活模块语法仍可解析', () => {
  // 只校验注册的 extra_js（index.js 由其他测试覆盖）
  for (const f of manifest.extra_js || []) {
    execSync(`node --check ${f}`, { cwd: ROOT, stdio: 'pipe' });
  }
  ok('全部已注册模块语法可解析');
});

// ---------- 6 ----------
test('【6】逆向审计：无悬空类名/全局引用', () => {
  // 被删模块导出的类名不应再出现在活跃代码中（含动态加载路径）
  const deadGlobals = [
    'GPUGraphRenderer', 'MemoryVisualizer', 'GNNRecommender', 'WorkerManager',
    'WasmBridge', 'CloudSync', 'RealtimeSync', 'ProductionHardening',
    'AutoTuning', 'LLMEntityExtractor', 'SmartSummaryAnomaly', 'VirtualRenderer',
  ];
  const allJs = readdirSync(ROOT).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of allJs) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    for (const g of deadGlobals) {
      if (src.includes(g)) hits.push(`${f} -> ${g}`);
    }
  }
  // 例外：MemoryVisualizer 的活跃实现在 modules_combined.js（v3.35 时合并入内），
  //       index.js 用 typeof 守卫消费它（9516 行），是合法引用而非悬空引用
  const allow = (h) => h.startsWith('modules_combined.js -> MemoryVisualizer')
    || h.startsWith('index.js -> MemoryVisualizer');
  const real = hits.filter(h => !allow(h));
  assert.deepStrictEqual(real, [], `活跃代码残留对已删模块的悬空引用: ${JSON.stringify(real)}`);
  ok('无悬空类名引用（MemoryVisualizer 例外：活跃实现位于 modules_combined.js）');
});

test('汇总', () => {
  console.log(`\nv3116_dead_code: ${pass} 项断言通过`);
});