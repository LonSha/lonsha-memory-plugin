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
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
/* [v3.205.0] T7 真根因：**孙进程泄漏**。
 *   node --test 默认 --test-isolation=process，会把每个用例放进自己的子进程；
 *   audit 扫描器也会派 `node --check` 子进程。原先超时只 `child.kill('SIGKILL')`——
 *   杀掉的是直接子进程，**孙进程被孤儿化**（PPID 变 1）继续吃 CPU。
 *   实测污染链：某轮偶发超时 → 残留 8~12 个孤儿 node → 后续每一轮都被抢 CPU →
 *   更多文件超时（实测 v3159 由 50s 劣化到 339s、v3181 由 1.3s 到 66s）→ 更多孤儿。
 *   即「并行偶发假红」是**自劣化正反馈**，不是随机的。
 *   修法：子进程放独立进程组（detached），超时与正常收尾都按 **进程组** 杀
 *   （kill(-pid)），从根上不产生孤儿。阈值一律不动 —— 阈值不是病根。 */
function killGroup(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 组可能已不存在 */ }
  try { child.kill('SIGKILL'); } catch { /* 直接子进程兜底 */ }
}
function runOne(file, useTestRunner = true, attempt = 0) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const argv = useTestRunner ? ['--test', file] : [file];
    let child;
    try {
      child = spawn(process.execPath, argv, {
        cwd: REPO,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true, // 独立进程组：孙进程随组一起收，避免孤儿残留
      });
    } catch (e) {
      return resolve(retryOrFail(e, file, useTestRunner, attempt, t0));
    }
    let out = '', err = '', killed = false;
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => { killed = true; killGroup(child); }, TIMEOUT);
    child.on('close', (code) => {
      clearTimeout(timer);
      // 正常退出也可能留下未收尾的孙进程（父进程先于子进程结束）：一并收割
      killGroup(child);
      const ms = Date.now() - t0;
      resolve({ file, code: killed ? -1 : (code ?? 1), killed, ms, out, err });
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      killGroup(child);
      /* [v3.205.0] T7 残余成因：**spawn 本身失败**（非判据失败）。
       *   实测（7 路真实并发、v3177 单跑 9 次）里的红是这样来的：
       *   断言 A3 报 `node:fs:441` —— 那是 execFileSync/spawn 连子进程都没起得来
       *   （EAGAIN「资源暂时不可用」，本沙箱还有 `fork: Function not implemented`
       *   同族），与「被测的门坏了」毫无关系。旧实现把它当 exit=1，于是整个文件
       *   被记成假红；而它恰恰**不是**计时阈值能解释的（A1 在同一轮是 ✓）。
       *   修法：只对**资源类**错误码重试（真缺陷会跨重试持续存在，判据不因此放宽；
       *   非资源类错误维持原行为）。退避 300ms 让进程槽位释放。 */
      const code = e && (e.code || e.errno);
      const RESOURCE = new Set(['EAGAIN', 'ENOMEM', 'EMFILE', 'ENFILE', 'EWOULDBLOCK']);
      if (RESOURCE.has(code) && attempt < 3) {
        setTimeout(() => resolve(runOne(file, useTestRunner, attempt + 1)), 300);
        return;
      }
      resolve({ file, code: 1, killed: false, ms: Date.now() - t0, out, err: String(e) });
    });
  });
}
/** spawn 抛异常（同步路径）时的同一策略：资源类错误重试，否则立即失败 */
function retryOrFail(e, file, useTestRunner, attempt, t0) {
  const code = e && (e.code || e.errno);
  const RESOURCE = new Set(['EAGAIN', 'ENOMEM', 'EMFILE', 'ENFILE', 'EWOULDBLOCK']);
  if (RESOURCE.has(code) && attempt < 3) {
    return new Promise((resolve) => setTimeout(
      () => resolve(runOne(file, useTestRunner, attempt + 1)), 300));
  }
  return { file, code: 1, killed: false, ms: Date.now() - t0, out: '', err: String(e) };
}

/* [v3.205.0] T7 验收基建：失败现场落盘。
 *   TODO T7 的验收协议写着「先把偶发定住（把该文件在负载下的实际报错落盘）」，
 *   但旧 runner 只在结尾打印一行文件名 —— 失败现场（哪个断言、耗时读多少）随
 *   进程消失，于是「偶发」记了三个月也定不住。
 *   TEST_FAIL_DUMP=<dir> 时把每个失败文件的完整 stdout/stderr 写成
 *   <dir>/<文件名>.log，供事后逐条对现场。默认关闭（不改变既有输出与退出码）。 */
function dumpFailure(r, name) {
  const dir = process.env.TEST_FAIL_DUMP;
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    const out = join(dir, name.replace(/[\\/]/g, '_') + '.log');
    writeFileSync(out, 'file: ' + r.file + '\n'
      + 'code: ' + r.code + ' | killed: ' + r.killed + ' | ms: ' + r.ms + '\n'
      + '===== stdout =====\n' + r.out + '\n===== stderr =====\n' + r.err + '\n');
    console.log('    ↳ 失败现场已落盘: ' + out);
  } catch (e) {
    console.log('    ↳ 失败现场落盘失败: ' + (e && e.message));
  }
}

/* [v3.205.0] T7 残余成因：**环境资源耗尽冒充判据失败**。
 *   实测（7 路真实并发下把 v3177 单跑 9 次）抓到失败现场：
 *     断言 A1 = ✓，而 A3 报 `node:fs:441` —— 那是被测文件**自己**用 execFileSync
 *     起子进程时没起得来（EAGAIN「资源暂时不可用」；本沙箱另有同族的
 *     `fork: Function not implemented`）。它和「被测的门坏了」毫无关系，
 *     也和 6000ms 计时阈值毫无关系（A1 在同一轮是 ✓）。
 *   旧 runner 只见 exit=1，于是整个文件被记成假红 —— 这正是 T7 记了三个月没定住的原因。
 *   修法：对**带环境资源耗尽指纹**的失败做有限重试（最多 3 次、递增退避），
 *     且**每次重试都打印出来**（绿不许来自被静默吞掉的重跑）。真缺陷会跨重试持续，
 *     判据不因此放宽；重试过的文件在汇总里单独点名。 */
const RESOURCE_SIG = /EAGAIN|EMFILE|ENFILE|ENOMEM|Resource temporarily unavailable|fork: Function not implemented|node:fs:\d+/;
const RETRY_MAX = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runWithRetry(file, useTestRunner) {
  const label = file.replace(REPO + '/', '');
  let r = await runOne(file, useTestRunner);
  if (r.code === 0 || r.killed) return r;
  if (!RESOURCE_SIG.test(r.out + '\n' + r.err)) return r;
  for (let i = 1; i <= RETRY_MAX; i++) {
    const sig = (r.out + '\n' + r.err).split('\n')
      .find((l) => RESOURCE_SIG.test(l)) || '(资源耗尽指纹)';
    console.log(`  ⟳ ${label} 疑似环境资源耗尽（非判据失败），第 ${i} 次重试：${sig.trim().slice(0, 110)}`);
    await sleep(500 * i);
    r = await runOne(file, useTestRunner);
    if (r.code === 0) { r.retried = i; r.envRetry = true; return r; }
    if (r.killed) return r;
  }
  return r;
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
  const results = await pool(tests, OPT.jobs, runWithRetry);

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
      if (process.env.TEST_FAIL_DUMP) dumpFailure(r, name);
    }
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('');
  console.log(`[run] 通过断言 ${totalPass} | 失败断言 ${totalFail} | 文件 ${tests.length - failed.length}/${tests.length} 通过 | 耗时 ${wall}s`);

  // 环境重试过的文件单独点名：绿不许来自「悄悄重跑」，但也别淹没真红
  const retried = results.filter((r) => r && r.envRetry);
  if (retried.length) {
    console.log(`[run] 其中 ${retried.length} 个文件经环境资源耗尽重试后转绿（重试次数已打印在上方，逐条可查）:`);
    for (const r of retried) console.log(`  ⟳ ${r.file.replace(REPO + '/', '')} ×${r.retried}`);
  }

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
