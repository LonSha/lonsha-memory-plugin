#!/usr/bin/env node
/**
 * 统一测试聚合 runner
 *
 * 设计：为每个 *.test.mjs 派生独立子进程（node --test <file>），
 *   隔离各测试间的全局状态污染（global/window/ST mock），
 *   按可用并发度并行执行，失败可精确定位到单个文件。
 *
 * 用法：
 *   node tests/run.mjs [--audit] [--serial] [--jobs N] [pattern ...]
 *     --audit   跑完测试后追加执行 tests/audit/ 下的扫描脚本
 *     --serial  强制串行（等价 --jobs 1）
 *     --jobs N  指定并发子进程数（默认 CPU 核数-1，上限 8）
 *     pattern   只跑文件名包含该 pattern 的测试（可多个，OR 语义）
 *
 * 退出码：全部通过 0；任一失败 1。
 * 环境变量：
 *   TEST_JOBS     同 --jobs（命令行优先）
 *   TEST_TIMEOUT  单文件超时毫秒（默认 120000）
 */
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)); // tests/
const REPO = dirname(HERE);                            // repo 根
const AUDIT_DIR = join(HERE, 'audit');

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const OPT = { audit: false, jobs: 0, patterns: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--audit') OPT.audit = true;
  else if (a === '--serial') OPT.jobs = 1;
  else if (a === '--jobs') OPT.jobs = parseInt(args[++i], 10) || 0;
  else OPT.patterns.push(a);
}
if (!OPT.jobs) {
  const env = parseInt(process.env.TEST_JOBS || '', 10);
  OPT.jobs = Number.isFinite(env) && env > 0 ? env : Math.min(8, Math.max(2, os.cpus().length - 1));
}
const TIMEOUT = parseInt(process.env.TEST_TIMEOUT || '', 10) || 120000;

// ---------- 收集测试 ----------
function collectTests() {
  if (!existsSync(HERE)) return [];
  return readdirSync(HERE)
    .filter(f => f.endsWith('.test.mjs'))
    .filter(f => OPT.patterns.length === 0 || OPT.patterns.some(p => f.includes(p)))
    .sort()
    .map(f => join(HERE, f));
}

// ---------- 单文件子进程执行 ----------
// useTestRunner=true  走 node --test（测试套件）；false 直接 node 执行（audit 扫描器）
function runOne(file, useTestRunner = true) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const argv = useTestRunner ? ['--test', file] : [file];
    const child = spawn(process.execPath, argv, {
      cwd: REPO,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '', err = '', killed = false;
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      const ms = Date.now() - t0;
      resolve({ file, code: killed ? -1 : (code ?? 1), killed, ms, out, err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ file, code: 1, killed: false, ms: Date.now() - t0, out, err: String(e) });
    });
  });
}

// ---------- 并发池 ----------
async function pool(items, jobs, worker) {
  const results = new Array(items.length);
  let idx = 0;
  const lanes = Array.from({ length: Math.min(jobs, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(lanes);
  return results;
}

// ---------- TAP 摘要提取（尽力而为） ----------
function summarize(r) {
  const text = r.out + '\n' + r.err;
  // node --test TAP 摘要行为 "ℹ pass N" / "ℹ fail N"（兼容旧版 "# pass N"）
  const pass = /[ℹ#]\s*pass (\d+)/.exec(text);
  const fail = /[ℹ#]\s*fail (\d+)/.exec(text);
  return {
    pass: pass ? +pass[1] : null,
    fail: fail ? +fail[1] : null,
  };
}

function auditScripts() {
  if (!existsSync(AUDIT_DIR)) return [];
  return readdirSync(AUDIT_DIR).filter(f => f.endsWith('.mjs') && !f.startsWith('_')).sort().map(f => join(AUDIT_DIR, f));
}

async function main() {
  const tests = collectTests();
  if (tests.length === 0) {
    console.error('[run] 未匹配到任何测试文件');
    process.exit(1);
  }
  console.log(`[run] ${tests.length} 个测试文件 | 并发 ${OPT.jobs} | 单文件超时 ${TIMEOUT}ms\n`);
  const t0 = Date.now();
  const results = await pool(tests, OPT.jobs, runOne);

  let totalPass = 0, totalFail = 0, anyFail = false;
  const failed = [];
  for (const r of results) {
    const { pass, fail } = summarize(r);
    if (pass != null) totalPass += pass;
    if (fail != null) totalFail += fail;
    const name = r.file.replace(REPO + '/', '');
    const ok = r.code === 0 && !r.killed;
    if (!ok) {
      anyFail = true;
      failed.push(r);
      const tag = r.killed ? 'TIMEOUT' : `exit=${r.code}`;
      console.log(`  ✗ ${name}  (${r.ms}ms, ${tag})`);
    }
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`[run] 通过断言 ${totalPass} | 失败断言 ${totalFail} | 文件 ${tests.length - failed.length}/${tests.length} 通过 | 耗时 ${wall}s`);

  if (failed.length) {
    console.log('\n[run] 失败文件明细（重跑定位）:');
    for (const r of failed) {
      console.log(`  node --test ${r.file.replace(REPO + '/', '')}`);
    }
  }

  // ---------- 审计档 ----------
  if (OPT.audit && !anyFail) {
    const scripts = auditScripts();
    if (scripts.length) {
      console.log(`\n[audit] 执行 ${scripts.length} 个审计脚本`);
      for (const s of scripts) {
        const r = await runOne(s, false); // audit 脚本是独立扫描器，直接 node 执行，不走 --test
        // audit 脚本是独立扫描器，直接以退出码判定
        const ok = r.code === 0;
        console.log(`  ${ok ? '✓' : '✗'} ${s.replace(REPO + '/', '')} (${r.ms}ms)`);
        if (!ok) { anyFail = true; if (r.err) console.log(r.err.slice(0, 500)); }
      }
    }
  }

  process.exit(anyFail ? 1 : 0);
}

main().catch(e => { console.error('[run] 运行器异常:', e); process.exit(1); });
