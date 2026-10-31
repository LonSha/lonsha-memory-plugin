#!/usr/bin/env node
/**
 * tests/audit/scan_test_budget.mjs — 测试预算契约审计（L11-O9）
 * ------------------------------------------------------------
 * 契约规范：
 *   1. test_budget.json 必须在场，且结构合法（含 schema / policy / top_20_slowest / suites）；
 *   2. policy.enforcement 必须明确为 fail-open-warn-only，超预算只告警不阻断发布；
 *   3. 登记的档必须**全部是本仓真实测试文件**（登记了不存在的档 = 覆盖虚报）；
 *   4. limit_ms 必须大于 ms（保留合理余量，不得负余量）；
 *   5. 预算里的 `version` 必须是**可核对的读数**：与 index.js 的 VERSION 同口径（不得落后超过
 *      SLACK_VERSIONS 个次版本）——否则这张表就是「上次测量」不可见的又一份手抄；
 *   6. 扫描面塌陷（登记档数低于下限 / tests/ 不可读）fail-closed（exit 2），
 *      不允许以「0 档全部通过」发合格证。
 *
 * ── 为什么本门在交付后被重写（本版实测抓到的真缺陷，留档防复发）──
 *   初版只判「JSON 自洽」：读 test_budget.json，看字段类型、看 limit_ms > ms。
 *   用三档退化形态实测（H 健康树 / G 删根目录全部 .js / T 把 tests/ 下 .mjs 掏空）：
 *       H=0  G=0  T=0
 *   **三档全 0 ⇒ 它是恒绿探测器**：无论输入面怎么坏，它都能从磁盘上那份 JSON 里
 *   找到「自洽」的结构并发合格证。这在 L11-O9 的验收语（「预算缺项只报耗时并说明原因」）
 *   上是成立的，但在本仓最贵的那种错（绿着，但绿的成因不是判据在守）上是失效的。
 *   修法不是抬高判据，而是**给它接上输入面**：
 *     ① G 档：根 .js 全删 ⇒ 读不到 index.js 的 VERSION ⇒ 预算的 version 无从核对 ⇒ exit 2；
 *     ② T 档：tests/ 下 .mjs 掏空 ⇒ 登记档在磁盘上不存在 ⇒ 覆盖虚报 ⇒ exit 1；
 *     ③ 结构健康下限：登记档数 < MIN_SUITES ⇒ exit 2（面塌了不得当「没问题」）。
 *
 * 退出码：0 通过 / 1 真缺陷（结构破损 / 覆盖虚报 / 版本落后） / 2 无法定位（fail-closed）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(__dir, '../..');
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';

/** 登记档数下限：实测 15 档（2026-10-30）。取 8 —— 留自然增减余量，塌到 8 以下必是面坏了。 */
const MIN_SUITES = 8;
/** 预算版本落后容忍：2 个次版本。按 v3.4xx 口径比「次版本号」，不比补丁位。 */
const SLACK_VERSIONS = 2;

function readVersionOf(rootDir) {
  const p = path.join(rootDir, 'index.js');
  if (!fs.existsSync(p)) return { ok: false, why: '缺少 index.js ⇒ 读不到 VERSION 真源' };
  const code = fs.readFileSync(p, 'utf8');
  const m = /const VERSION = '([0-9]+)\.([0-9]+)\.([0-9]+)'/.exec(code);
  if (!m) return { ok: false, why: 'index.js 里找不到 VERSION 常量声明 ⇒ VERSION 真源不可读' };
  return { ok: true, version: m[1] + '.' + m[2] + '.' + m[3], minor: [Number(m[1]), Number(m[2]), Number(m[3])] };
}

/** 只比「次版本」：v3.426.0 与 v3.424.0 差 2 个次版本。主版本不同直接算不落后（重新起算）。 */
function versionsBehind(budgetVer, live) {
  const b = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(budgetVer || ''));
  if (!b) return { ok: false, why: '预算 version 字段不是 x.y.z：' + budgetVer };
  if (Number(b[1]) !== live.minor[0]) return { ok: true, behind: 0 };
  return { ok: true, behind: live.minor[1] - Number(b[2]) };
}

export function auditTestBudget(customRoot = ROOT, opts = {}) {
  const rootDir = customRoot;
  const isFixture = FIXTURE_MODE || Boolean(opts.fixture);

  const file = path.join(rootDir, 'tests/audit/test_budget.json');
  if (!fs.existsSync(file)) {
    return { status: 'fail_closed', exitCode: 2, error: 'test_budget.json 缺失' };
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { status: 'fail_closed', exitCode: 2, error: 'test_budget.json 解析失败: ' + e.message };
  }

  /* ── 结构面（初版既有判据，逐条保留：它们是必要不充分的） ── */
  const defects = [];
  if (data.schema !== 'test-budget@1') {
    defects.push(`schema 字段不符: ${data.schema}`);
  }
  if (!data.policy || data.policy.enforcement !== 'fail-open-warn-only') {
    defects.push('policy.enforcement 必须声明为 fail-open-warn-only');
  }
  if (!Array.isArray(data.top_20_slowest)) {
    defects.push('top_20_slowest 必须是数组');
  }

  /* ── 输入面 ①：预算版本必须可核对（G 档在这里响） ── */
  const live = readVersionOf(rootDir);
  if (!live.ok) {
    /* 读不到 VERSION 真源 ⇒ 这不是「预算有问题」，是「本门失去了核对能力」⇒ fail-closed。
     *   与 scan_plan_currency 在 G 档 exit 2 同一口径：无从核对不得发合格证。 */
    return { status: 'fail_closed', exitCode: 2, error: live.why };
  }
  const behind = versionsBehind(data.version, live);
  if (!behind.ok) {
    defects.push(behind.why);
  } else if (behind.behind > SLACK_VERSIONS) {
    defects.push(`预算 version ${data.version} 落后当版 ${live.version} 共 ${behind.behind} 个次版本`
      + `（容忍 ${SLACK_VERSIONS}）—— 预算必须定期复测，否则「超预算告警」量的是旧数`);
  }

  /* ── 输入面 ②：登记档必须是磁盘上真有的测试文件（T 档在这里响） ── */
  const suites = data.suites || {};
  const suiteNames = Object.keys(suites);
  const missingOnDisk = [];
  const hollowOnDisk = [];
  for (const suitePath of suiteNames) {
    const abs = path.join(rootDir, suitePath);
    if (!fs.existsSync(abs)) { missingOnDisk.push(suitePath); continue; }
    /* 「文件在」不等于「档在」：T 档的退化形态是把 tests/ 下 .mjs 逐份置成 `// gutted`，
     *   文件仍在场、existsSync 仍为真。只判在场性的话，一个全被掏空的测试面也会发合格证
     *   （本版三档实测：初版 T=0，正因为只判了 existsSync）。
     *   故补判「它像不像一个测试档」：非空 + 含 test( 调用。空壳文件不得充当基准档。 */
    let body = '';
    try { body = fs.readFileSync(abs, 'utf8'); } catch (_e) { body = ''; }
    if (body.trim().length === 0 || !/\btest\s*\(/.test(body)) {
      hollowOnDisk.push(suitePath);
    }
  }
  if (missingOnDisk.length > 0) {
    /* 分类要分开：tests/ 整棵树不在场 ⇒ 面塌了（exit 2）；只是某几个档不在 ⇒ 覆盖虚报（exit 1）。
     *   把这两种压成一句「缺文件」会让「面塌了」被读成「登记写错了」。 */
    const testsDir = path.join(rootDir, 'tests');
    if (!fs.existsSync(testsDir)) {
      return { status: 'fail_closed', exitCode: 2, error: 'tests/ 目录不在场 ⇒ 登记档无从核对，结构失效' };
    }
    for (const s of missingOnDisk) {
      defects.push(`登记了磁盘上不存在的测试档（覆盖虚报）：${s}`);
    }
  }

  /* T 档：文件在但被掏空 ⇒ 基准档量的是一个空壳文件，余量数字失去参照对象。
   *   归 exit 1（真缺陷：覆盖虚报），不归 exit 2 —— 面没塌，是账本指着空壳。 */
  if (hollowOnDisk.length > 0) {
    for (const s of hollowOnDisk) {
      defects.push(`登记档在磁盘上是空壳（无 test( 调用，被掏空或占位）：${s}`);
    }
  }

  /* ── 逐档余量 ── */
  for (const [suitePath, b] of Object.entries(suites)) {
    if (typeof b.ms !== 'number' || typeof b.limit_ms !== 'number') {
      defects.push(`${suitePath}: ms 与 limit_ms 必须为数值`);
    } else if (b.limit_ms <= b.ms) {
      defects.push(`${suitePath}: limit_ms (${b.limit_ms}) 必须大于实测 ms (${b.ms})`);
    }
  }

  /* ── 结构健康下限：面塌陷不得当「没问题」 ── */
  const minSuites = isFixture ? 1 : MIN_SUITES;
  if (suiteNames.length < minSuites) {
    return {
      status: 'fail_closed',
      exitCode: 2,
      error: `登记档数过低 (${suiteNames.length} < ${minSuites}) ⇒ 预算面塌陷，不得以「全部通过」发合格证`,
    };
  }

  return {
    status: defects.length === 0 ? 'ok' : 'defect',
    exitCode: defects.length === 0 ? 0 : 1,
    defects,
    suiteCount: suiteNames.length,
    top20Count: data.top_20_slowest ? data.top_20_slowest.length : 0,
    liveVersion: live.version,
    budgetVersion: data.version,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = auditTestBudget(ROOT);
  if (res.status === 'fail_closed') {
    console.error(`[test-budget] FAIL-CLOSED (exit 2): ${res.error}`);
    process.exit(2);
  }
  if (res.defects.length > 0) {
    console.error(`[test-budget] 发现 ${res.defects.length} 处预算契约违规：`);
    for (const d of res.defects) console.error('  - ' + d);
    process.exit(1);
  }
  console.log(`[test-budget] 检查通过：test_budget.json 契约自洽，已登记 ${res.suiteCount} 个基准档与 Top${res.top20Count} 热点`
    + `（预算 v${res.budgetVersion} / 当版 v${res.liveVersion}）。`);
  process.exit(0);
}