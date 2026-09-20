// tests/v3177_syntax_gate_perf.test.mjs
// v3.177 语法门性能层：把「门禁自身的回归成本」从超时降到可跑。
//   背景：v3.92 建的语法门（tests/audit/scan_syntax.mjs）为每个待校验文件
//   spawn 一次 `node --check`。全仓 220 文件 = 220 个子进程，单次扫描实测 ~14s。
//   v392 语法门测试为覆盖多种损坏形态 + 负控制，单次运行调用本门 10 次，
//   累计 >120s，直接撞上 run.mjs 的单文件超时（TEST_TIMEOUT 默认 120000ms）——
//   **门禁把测试跑挂**，属真实基建债：想验证语法门，反而先被语法门拖超时。
//   本版把判定改为「本进程内 vm 批量解析」（单次 <1s），失败文件才回退
//   per-file `--check` 取精确报错。
//
// 本测试锁定四件事：
//   A. **性能不退化**：单次全仓扫描必须远低于旧实现（防有人把 vm 快筛删回逐文件 spawn）；
//   B. **判定等价**：新门的 accept/reject 对多种损坏/健康形态与 per-file `--check` 逐文件一致；
//   C. **能力不塌陷**：报文件名 / 报行号 / --root 负控制 / rc=2 参数错误 / --verbose 全覆盖；
//   D. **负控制 + 工具两向自证**：破坏 vm 快筛后门必须漏判（证明该路径是承重的），
//      且破坏可观测、原版上同款判据为真。
//   E. 发布卫生：版本三源一致。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gate = path.join(root, 'tests', 'audit', 'scan_syntax.mjs');
const gateSrc = fs.readFileSync(gate, 'utf8');

const results = [];
const failures = [];
const ok = (name, fn) => {
  try { fn(); results.push(`✓ ${name}`); }
  catch (e) {
    const msg = (e.message || String(e)).split('\n')[0];
    results.push(`✗ ${name} :: ${msg}`);
    failures.push(name);
  }
};

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

// per-file --check 的权威判定（本测试的对比基线）
const perFileOk = (file) => {
  const isCjs = file.endsWith('.cjs');
  try {
    if (isCjs) execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
    else execFileSync(process.execPath, ['--input-type=module', '--check'], {
      input: fs.readFileSync(file), stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch { return false; }
};

const ESM_BROKEN = 'import fs from "node:fs";\nexport class Broken {\n  m() {\n    fs;\n  }                } else if (z) {\n}\n';
const CJS_BROKEN = 'function f(){ return 1; }\n} }\nconst x = (1;\n';
const HEALTHY_ESM = 'import fs from "node:fs";\nexport const okv = fs ? 1 : 0;\nclass K { m(){ return { a: 1 }; } }\n';
const HEALTHY_CJS = 'var G = (function () {\n  function helper(){ return {a:1}; }\n  return { helper: helper };\n})();\nif (typeof module !== "undefined") module.exports = G;\n';
const FAKE_DIRECTIVE = '// export const foo = (1;\nconst s = "import x from (2";\nfunction realOk(){ return 1; }\n';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-perf-'));
const mk = (name) => { const d = path.join(tmp, name); fs.mkdirSync(d, { recursive: true }); return d; };
const w = (dir, name, content) => { const f = path.join(dir, name); fs.writeFileSync(f, content); return f; };

try {
  // ========== A. 性能不退化 ==========
  ok('A1 单次全仓扫描 < 6s（旧 per-file spawn 实现实测 ~12–15s，此阈值两头留 2x 余量）', () => {
    const t0 = Date.now();
    const r = run(process.execPath, [gate]);
    const ms = Date.now() - t0;
    assert.equal(r.code, 0, (r.err || r.out).slice(0, 300));
    assert.ok(ms < 6000, `单次扫描耗时 ${ms}ms，疑似退回逐文件 spawn（应 <6000ms）`);
  });

  ok('A2 门内保留 vm 批量解析路径（防性能层被无声删回逐文件 spawn）', () => {
    assert.match(gateSrc, /vm\.SourceTextModule/, '语法门不再使用 vm 批量解析');
    assert.match(gateSrc, /vm\.Script/, '语法门不再使用 vm.Script 校验 .cjs');
  });

  ok('A3 vm 需实验标志：门自带 re-exec 兜底（不加 flag 直跑也必须正确）', () => {
    assert.match(gateSrc, /--experimental-vm-modules/, '缺少 vm 实验标志处理');
    assert.match(gateSrc, /spawnSync/, '缺少 re-exec 兜底');
    // 真实证据：不带任何 flag 直接跑，仍应通过（内部自 re-exec）
    const r = run(process.execPath, [gate]);
    assert.equal(r.code, 0, r.err.slice(0, 200));
  });

  // ========== B. 判定等价（新门 vs per-file --check） ==========
  ok('B1 六种形态逐文件判定与 per-file --check 完全一致', () => {
    const dir = mk('equiv');
    const cases = [
      ['esm-broken.js', ESM_BROKEN], ['cjs-broken.js', CJS_BROKEN],
      ['mjs-broken.mjs', ESM_BROKEN], ['good-esm.js', HEALTHY_ESM],
      ['good-cjs.js', HEALTHY_CJS], ['fake-directive.js', FAKE_DIRECTIVE],
    ];
    const expect = cases.map(([n, c]) => perFileOk(w(dir, n, c)));
    const rc = run(process.execPath, [gate, '--root', dir]);
    // 目录里只要有一个损坏就整体 rc=1；用「门报出的失败文件集」对齐 per-file 判定
    const reported = new Set([...rc.err.matchAll(/^\s{2}([\w./-]+)\s/gm)].map(m => m[1]));
    cases.forEach(([n], i) => {
      const gateOk = !reported.has(n);
      assert.equal(gateOk, expect[i], `${n}: 门=${gateOk ? 'ok' : 'fail'} per-file=${expect[i] ? 'ok' : 'fail'}`);
    });
  });

  // ========== C. 能力不塌陷 ==========
  ok('C1 拦住 ESM 结构损坏并报出文件名 + 行号', () => {
    const dir = mk('c1'); w(dir, 'broken.js', ESM_BROKEN);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /broken\.js/);
    assert.match(r.err, /第 \d+ 行/, '未报出行号（vm 不回退取 stderr 会导致此断言失败）');
  });

  ok('C2 拦住 CJS 结构损坏', () => {
    const dir = mk('c2'); w(dir, 'broken.js', CJS_BROKEN);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /broken\.js/);
  });

  ok('C3 拦住损坏的 .mjs', () => {
    const dir = mk('c3'); w(dir, 'broken.mjs', ESM_BROKEN);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /broken\.mjs/);
  });

  ok('C4 放行健康 ESM 与 IIFE/CJS 风格 .js（无假阳性）', () => {
    const dir = mk('c4'); w(dir, 'a.js', HEALTHY_ESM); w(dir, 'b.js', HEALTHY_CJS);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.equal(r.code, 0, `健康文件被误拦：${r.err.slice(0, 200)}`);
  });

  ok('C5 不被注释/字符串里的假 import/export 误导', () => {
    const dir = mk('c5'); w(dir, 'c.js', FAKE_DIRECTIVE);
    const r = run(process.execPath, [gate, '--root', dir]);
    assert.equal(r.code, 0, `假指令健康文件被误拦：${r.err.slice(0, 200)}`);
  });

  ok('C6 --root 指向不存在的路径 → rc=2（参数错误，区别于语法失败）', () => {
    const r = run(process.execPath, [gate, '--root', path.join(tmp, 'nope-xyz')]);
    assert.equal(r.code, 2);
  });

  ok('C7 --verbose 逐文件输出，且入口 index.js 出现在清单中（覆盖面不塌陷）', () => {
    const r = run(process.execPath, [gate, '--verbose']);
    assert.equal(r.code, 0, r.err.slice(0, 300));
    assert.match(r.out, /(^|\s)index\.js\s+\[esm\]/m, 'index.js 未进入校验清单');
    const covered = Number((r.out.match(/✓ 语法门通过：(\d+) 个文件/) || [])[1] || 0);
    assert.ok(covered >= 110, `覆盖面=${covered}，遍历逻辑疑似被改坏`);
  });

  // ========== D. 负控制 + 工具两向自证 ==========
  // 破坏点必须在真源码里「恰好命中 1 次」，破坏后加载破坏副本、跑同款真判据。
  ok('D1 破坏 vm 快筛 → 门必须漏判（证明该路径承重，不是摆设）', () => {
    // 真源码破坏：锚点必须恰好命中 1 次
    const ANCHOR = 'const fast = parseOne(file, src);';
    const cnt = gateSrc.split(ANCHOR).length - 1;
    assert.equal(cnt, 1, `破坏锚点在真源码中须恰好出现 1 次，实际 ${cnt}`);
    // 破坏副本：把快筛结果写死为「通过」，vm 路径仍在但永不拒绝
    const broken = gateSrc.replace(ANCHOR, 'const fast = { ok: true }; // 破坏：强制放行');
    assert.notEqual(broken, gateSrc, '破坏必须真的改变源码');
    const gatePath = path.join(mk('d1-gate'), 'gate_broken.mjs');
    fs.writeFileSync(gatePath, broken);
    // 同一目标目录（含损坏文件）上跑：破坏副本应放行
    const target = mk('d1-target');
    w(target, 'broken.js', ESM_BROKEN);
    const rBroken = run(process.execPath, [gatePath, '--root', target]);
    assert.equal(rBroken.code, 0, '破坏后的门仍拒绝损坏文件，说明该锚点并非承重点');
    // 两向自证：原版门在同一目标目录上必须拒绝
    const rOrig = run(process.execPath, [gate, '--root', target]);
    assert.notEqual(rOrig.code, 0, '原版门上同款判据必须为真');
  });

  ok('D2 破坏可观测：破坏只影响失败文件路径，健康仓库在破坏副本下仍通过', () => {
    const ANCHOR = 'const fast = parseOne(file, src);';
    const broken = gateSrc.replace(ANCHOR, 'const fast = { ok: true }; // 破坏：强制放行');
    const gatePath = path.join(mk('d2-gate'), 'gate_broken.mjs');
    fs.writeFileSync(gatePath, broken);
    const good = mk('d2-good');
    w(good, 'a.js', HEALTHY_ESM);
    const r = run(process.execPath, [gatePath, '--root', good]);
    assert.equal(r.code, 0, '健康文件在破坏副本下也应通过（破坏只放行、不误杀）');
  });

  // ========== E. 发布卫生 ==========
  ok('E1 版本三源一致且不低于 v3.179.0', () => {
    const vnum = (s) => {
      const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
      return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
    };
    const idx = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const v = (idx.match(/const VERSION = '([^']+)'/) || [])[1];
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(v, manifest.version);
    assert.equal(v, pkg.version);
    assert.ok(vnum(v) >= vnum('3.179.0'), `版本 ${v} 不得低于 3.179.0`);
  });
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* 清理失败不影响结论 */ }
}

results.forEach(r => console.log(r));
if (failures.length) {
  console.error(`\n[v3177_syntax_gate_perf] ${failures.length}/${results.length} 项失败：${failures.join(' | ')}`);
  process.exit(1);
}