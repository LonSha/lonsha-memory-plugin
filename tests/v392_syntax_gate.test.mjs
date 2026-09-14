/* ============================================================
 * v3.92 语法门回归测试（含负控制）
 * ------------------------------------------------------------
 * 动机来自 ruby-phone v2.8.10 的真实事故：index.js 存在结构性语法损坏、
 * 插件完全无法加载，却连续发布了约 9 个版本——因为项目宪法规定的发布门
 * `node --check` 在按 CommonJS 解析时对 ESM 结构损坏返回退出码 0（假绿），
 * 且全部测试文件都不 import 入口，入口语法完全无门。
 *
 * 本仓库此前同样如此：95 个测试文件里 import('./index.js') 的数量为 0，
 * tests/audit/ 的 scan_wiring / scan_resilience 都只做源码文本正则统计，
 * 没有任何路径真正解析入口文件。
 *
 * 本测试锁定三件事：
 *   1. 复现并记录「假绿」机制（负控制），防止有人退回裸 node --check；
 *   2. 语法门必须拦住损坏、必须报出文件名；
 *   3. 语法门不得对真实仓库误报，且覆盖面不得塌陷（防门退化成空跑）。
 * ============================================================ */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gate = path.join(root, 'tests', 'audit', 'scan_syntax.mjs');

const results = [];
const failures = [];
// 收集失败而非立即抛出：一次运行报告全部断言结果，便于定位是哪条门退化
const ok = (name, fn) => {
  try { fn(); results.push(`✓ ${name}`); }
  catch (e) {
    const msg = (e.message || String(e)).split('\n')[0];
    results.push(`✗ ${name} :: ${msg}`);
    failures.push(name);
  }
};

// 不抛异常地运行命令，拿到真实退出码
const run = (cmd, cmdArgs, opts = {}) => {
  try {
    const out = execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
    return { code: 0, out: String(out || ''), err: '' };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      out: String(e.stdout || ''),
      err: String(e.stderr || e.message || ''),
    };
  }
};

// 复刻 ruby-phone 当年真实发布过的损坏形态：未闭合 .catch + 多余右括号挤在同一行
const ESM_BROKEN = [
  'import fs from "node:fs";',
  'export class Broken {',
  '  m() {',
  '    fs;',
  '  }                } else if (z) {',
  '}',
  '',
].join('\n');

// 纯 CJS/IIFE 风格的结构损坏
const CJS_BROKEN = 'function f(){ return 1; }\n} }\nconst x = (1;\n';

const HEALTHY_ESM = 'import fs from "node:fs";\nexport const okv = fs ? 1 : 0;\nclass K { m(){ return { a: 1 }; } }\n';
const HEALTHY_CJS = 'var G = (function () {\n  function helper(){ return {a:1}; }\n  return { helper: helper };\n})();\nif (typeof module !== "undefined") module.exports = G;\n';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-gate-'));
const mk = (name) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); return d; };

try {
  // ========== 1. 负控制：证明裸 node --check 会假绿 ==========
  // 语境：无 package.json（本仓库真实状态），node --check 按脚本解析该 .js
  ok('负控制成立：裸 node --check 对「含顶层 import 的 ESM 结构损坏」返回 0（假绿）', () => {
    const dir = mk('no-pkg');
    const f = path.join(dir, 'broken.js');
    fs.writeFileSync(f, ESM_BROKEN);
    const r = run(process.execPath, ['--check', f]);
    assert.equal(r.code, 0,
      `预期假绿(退出码0)，实际=${r.code}。若 Node 行为已改变，请同步更新本测试与宪法说明`);
  });

  // 对照组：同一无修复文件，强制 ESM 解析能正确报错
  ok('强制 ESM 解析能正确拒绝同一损坏文件（门的必要性）', () => {
    const dir = mk('esm-refuse');
    const f = path.join(dir, 'broken.js');
    fs.writeFileSync(f, ESM_BROKEN);
    const r = run(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(f, 'utf8') });
    assert.notEqual(r.code, 0, 'ESM 解析必须报错，否则语法门无意义');
  });

  // ========== 2. 语法门必须拦住损坏 ==========
  ok('语法门拦住 ESM 结构损坏的 .js 并报出文件名', () => {
    const dir = mk('gate-esm-broken');
    fs.writeFileSync(path.join(dir, 'broken.js'), ESM_BROKEN);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.notEqual(r.code, 0, '损坏文件必须使语法门失败');
    assert.match(r.err, /broken\.js/, '必须在 stderr 报出具体文件名');
  });

  ok('语法门拦住 CJS 结构损坏的 .js', () => {
    const dir = mk('gate-cjs-broken');
    fs.writeFileSync(path.join(dir, 'broken.js'), CJS_BROKEN);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.notEqual(r.code, 0, '损坏文件必须使语法门失败');
    assert.match(r.err, /broken\.js/);
  });

  ok('语法门拦住损坏的 .mjs', () => {
    const dir = mk('gate-mjs-broken');
    fs.writeFileSync(path.join(dir, 'broken.mjs'), ESM_BROKEN);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /broken\.mjs/);
  });

  // ========== 3. 语法门不得误伤 ==========
  ok('语法门放行合法 ESM .js（无假阳性）', () => {
    const dir = mk('gate-esm-good');
    fs.writeFileSync(path.join(dir, 'a.js'), HEALTHY_ESM);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.equal(r.code, 0, `健康文件被误拦：${r.err.slice(0, 160)}`);
  });

  ok('语法门放行 IIFE/CJS 风格 .js（ESM 为 CJS 超集这一前提成立）', () => {
    const dir = mk('gate-cjs-good');
    fs.writeFileSync(path.join(dir, 'b.js'), HEALTHY_CJS);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.equal(r.code, 0, `IIFE/CJS 文件被误拦：${r.err.slice(0, 160)}`);
  });

  ok('语法门不被注释/字符串里的假 import/export 误导', () => {
    const dir = mk('gate-fake-directive');
    fs.writeFileSync(path.join(dir, 'c.js'),
      '// export const foo = (1;\nconst s = "import x from (2";\nfunction realOk(){ return 1; }\n');
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.equal(r.code, 0, `含假指令的健康文件被误拦：${r.err.slice(0, 160)}`);
  });

  // ========== 4. 真实仓库通过，且覆盖面不塌陷 ==========
  let covered = 0;
  ok('真实仓库全量通过语法门', () => {
    const r = run(process.execPath, [gate]);
    assert.equal(r.code, 0, (r.err || r.out).slice(0, 400));
    covered = Number((r.out.match(/(\d+)\s*个文件/) || [])[1] || 0);
  });

  ok('语法门覆盖面合理（≥ 110 个文件），防止遍历逻辑被改坏致门空跑', () => {
    assert.ok(covered >= 110, `实际覆盖=${covered}`);
  });

  ok('入口 index.js 被语法门实际覆盖（本测试的核心目的）', () => {
    const r = run(process.execPath, [gate, '--verbose']);
    assert.equal(r.code, 0, r.err.slice(0, 300));
    assert.match(r.out, /(^|\s)index\.js\s+\[esm\]/m, 'index.js 未进入校验清单');
  });

  // ========== 5. 不得给本仓库添加 type:module ==========
  // 本仓库 15 个 .js 含 require/module.exports 运行时特征；
  // 若照搬 ruby-phone 的 package.json "type":"module"，会在运行时炸。
  // 拦截能力由 tests/audit/scan_syntax.mjs 自身提供，不依赖该配置。
  ok('仓库根目录不存在会改变模块解析语义的 package.json type 字段', () => {
    const p = path.join(root, 'package.json');
    if (!fs.existsSync(p)) return;
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.notEqual(pkg.type, 'module',
      '本仓库 .js 含 require/module.exports，加 type:module 会导致运行时失败');
  });
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ }
}

results.forEach(r => console.log(r));
if (failures.length) {
  console.error(`\n[v392_syntax_gate] ${failures.length}/${results.length} 项失败：${failures.join(' | ')}`);
  process.exit(1);
}
console.log(`[v392_syntax_gate] ${results.length} 项断言全部通过`);