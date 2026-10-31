// tests/audit/scan_test_budget_negctl.mjs
// scan_test_budget.mjs 的配对负控制
// ------------------------------------------------------------
// 为什么需要这份负控制（本仓纪律：门禁的判据恒绿与否必须有人观测）：
//   初版 scan_test_budget 三档实测 H/G/T = 0/0/0 —— **恒绿探测器**。
//   它只判 JSON 自洽，而那些结构从磁盘上那份 JSON 里永远读得到。
//   修法是把三条输入面接进判据（见门禁文件头的留痕）。本文件的任务是：
//   证明「那三条输入面真的是判据在守」，而不是被写成常量。
//
// 判定规则（V0 是卫生态对照组，先证绿再证红）：
//   V0 原版对照：未破坏时门禁必须 exit 0，且输出包含「检查通过」；
//   N1 覆盖虚报：预算里登记一个磁盘上不存在的测试档 => 必 exit 1 并点名该档；
//   N2 空壳档：把某个已登记档掏成 `// gutted`（文件仍在场）=> 必 exit 1（只判 existsSync 会漏）；
//   N3 面塌陷：登记档数裁到 1（< MIN_SUITES）=> 必 exit 2（fail-closed）；
//   N4 判据自证（K4 定点破坏）：锚点须恰中 1 次；破坏判据本体后，
//      同一棵红树上原版必红、破坏版必不红。两向有一向不对即失败。
//
// 退出码：0 = 全部负控制成立  1 = 存在未通过的负控制  2 = 门禁脚本不存在（结构漂移）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const GATE = path.join(REPO, 'tests/audit/scan_test_budget.mjs');
const BUDGET = 'tests/audit/test_budget.json';

if (!fs.existsSync(GATE)) {
  console.error('[test-budget-negctl] 缺门禁 scan_test_budget.mjs');
  process.exit(2);
}

const failures = [];

// V0 原版对照（卫生态）：未破坏时门禁必须 exit 0 —— 先证绿，否则后面的红不可归因
const v0 = spawnSync(process.execPath, [GATE], { cwd: REPO, encoding: 'utf8' });
if (v0.status !== 0) {
  failures.push(`V0 原版对照失败：期望 exit 0，实得 exit ${v0.status}\n${v0.stderr || v0.stdout}`);
} else if (!v0.stdout.includes('检查通过')) {
  failures.push('V0 原版对照失败：输出未包含「检查通过」');
}

/** 建最小镜像：manifest + index.js（VERSION 真源）+ 预算档 + 预算里登记的每个测试档 */
function createTempRepo(mut) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_budget_negctl_'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'manifest.json'), path.join(tmp, 'manifest.json'));
  fs.copyFileSync(path.join(REPO, 'index.js'), path.join(tmp, 'index.js'));
  fs.copyFileSync(path.join(REPO, BUDGET), path.join(tmp, BUDGET));

  /* 预算里登记的档必须在镜像里真在、且真像测试档：
   *   缺了会先撞 N1 那条判据，掏空了会先撞 N2 那条 —— 于是本组要打的判据反而测不到。
   *   故先按真档内容逐个物化，各负控制再只改自己那一处。 */
  const budget = JSON.parse(fs.readFileSync(path.join(tmp, BUDGET), 'utf8'));
  for (const f of Object.keys(budget.suites || {})) {
    const src = path.join(REPO, f);
    const dst = path.join(tmp, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    else fs.writeFileSync(dst, "import test from 'node:test';\ntest('placeholder', () => {});\n", 'utf8');
  }
  if (mut) mut(tmp, budget);
  return tmp;
}

function runGate(dir) {
  return spawnSync(process.execPath, [path.join(dir, 'tests/audit/scan_test_budget.mjs')], {
    cwd: dir,
    env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
    encoding: 'utf8',
  });
}

/* 镜像里要有一份门禁本体（负控制跑的是镜像内的门禁，不是仓内那份） */
function plantGate(dir) {
  fs.copyFileSync(GATE, path.join(dir, 'tests/audit/scan_test_budget.mjs'));
}

// ── N1 覆盖虚报：登记一个磁盘上不存在的测试档 ──
{
  const tmp = createTempRepo((d, budget) => {
    budget.suites['tests/n1_ghost_suite.test.mjs'] = { ms: 1000, limit_ms: 2000 };
    fs.writeFileSync(path.join(d, BUDGET), JSON.stringify(budget, null, 2), 'utf8');
  });
  try {
    plantGate(tmp);
    const r = runGate(tmp);
    if (r.status !== 1) {
      failures.push(`N1 负控制失败：覆盖虚报期望 exit 1，实得 ${r.status}\n${r.stderr || r.stdout}`);
    } else if (!(r.stderr + r.stdout).includes('n1_ghost_suite.test.mjs')) {
      failures.push('N1 负控制失败：输出未点名 n1_ghost_suite.test.mjs');
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── N2 空壳档：文件仍在场但被掏空（只判 existsSync 会漏这一形态）──
{
  let victim = null;
  const tmp = createTempRepo((d, budget) => {
    victim = Object.keys(budget.suites || {})[0] || null;
    if (victim) fs.writeFileSync(path.join(d, victim), '// gutted\n', 'utf8');
  });
  try {
    if (!victim) {
      failures.push('N2 负控制失败：预算里没有任何已登记档，无法制造空壳');
    } else {
      plantGate(tmp);
      const r = runGate(tmp);
      if (r.status !== 1) {
        failures.push(`N2 负控制失败：空壳档期望 exit 1，实得 ${r.status}\n${r.stderr || r.stdout}`);
      } else if (!(r.stderr + r.stdout).includes(victim)) {
        failures.push('N2 负控制失败：输出未点名被掏空的档 ' + victim);
      }
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── N3 面塌陷：登记档数裁到 1（< MIN_SUITES）=> exit 2 ──
{
  const tmp = createTempRepo((d, budget) => {
    const keys = Object.keys(budget.suites || {});
    const keep = keys[0];
    budget.suites = keep ? { [keep]: budget.suites[keep] } : {};
    fs.writeFileSync(path.join(d, BUDGET), JSON.stringify(budget, null, 2), 'utf8');
  });
  try {
    plantGate(tmp);
    const r = runGate(tmp);
    if (r.status !== 2) {
      failures.push(`N3 负控制失败：面塌陷期望 exit 2，实得 ${r.status}\n${r.stderr || r.stdout}`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ── N4 判据自证（K4 定点破坏）：锚点须恰中 1 次，破坏本体后同一红树上原版必红 / 破坏版必不红 ──
/* 红树的选择有讲究：本门禁有三条判据（磁盘在场 / 空壳 / 版本落后），前两条互为备份
 *   （文件不在 ⇒ 也读不到内容 ⇒ 空壳判据同样响）。若拿「缺档」当红树，破坏在场判据后
 *   空壳判据仍会翻红，N4 的负向就会被一次「无害的破坏」判成失败 —— 那是锚点选错，
 *   不是判据有问题。
 *   故红树取**只有一条判据会响**的形态：预算版本落后当版超过 SLACK_VERSIONS。 */
{
  const N4_ANCHOR = 'if (behind.behind > SLACK_VERSIONS) {';
  const N4_BREAK = 'if (false) {';
  const tmp = createTempRepo((d, budget) => {
    budget.version = '3.0.0';   // 与 index.js 的 VERSION 同主版本、次版本落后 400+ 个
    fs.writeFileSync(path.join(d, BUDGET), JSON.stringify(budget, null, 2), 'utf8');
  });
  try {
    const gateSrc = fs.readFileSync(GATE, 'utf8');
    const hits = gateSrc.split(N4_ANCHOR).length - 1;
    if (hits !== 1) {
      throw new Error(`K4 锚点须恰中 1 次（实 ${hits}）—— 锚点漂移即破坏位置不可复现`);
    }
    fs.writeFileSync(path.join(tmp, 'tests/audit/scan_orig_probe.mjs'), gateSrc, 'utf8');
    fs.writeFileSync(path.join(tmp, 'tests/audit/scan_broken_probe.mjs'), gateSrc.replace(N4_ANCHOR, N4_BREAK), 'utf8');
    const env = { ...process.env, LONSHA_AUDIT_ROOT: tmp };
    const orig = spawnSync(process.execPath, [path.join(tmp, 'tests/audit/scan_orig_probe.mjs')], { cwd: tmp, env, encoding: 'utf8' });
    const broken = spawnSync(process.execPath, [path.join(tmp, 'tests/audit/scan_broken_probe.mjs')], { cwd: tmp, env, encoding: 'utf8' });
    if (orig.status !== 1) {
      failures.push(`N4 两向自证失败(正向)：同一棵红树上原版判据必须 exit 1，实得 ${orig.status}`
        + ` —— 红树本身没红，后续「破坏版不红」无法归因\n${orig.stderr || orig.stdout}`);
    }
    if (broken.status !== 0) {
      failures.push(`N4 两向自证失败(负向)：判据本体被破坏后应 exit 0，实得 ${broken.status}`
        + ' ⇒ 破坏没打到真判据（或有另一条判据在兜底），本门禁的绿不可信\n'
        + String(broken.stderr || broken.stdout));
    }
  } catch (e) {
    failures.push('N4 两向自证失败：' + e.message);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (failures.length > 0) {
  console.error(`[test-budget-negctl] 负控制不通过 (${failures.length} 项)：`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log('[test-budget-negctl] 5 组负控制全绿（V0 原版对照 + N1/N2/N3/N4）。');
process.exit(0);
