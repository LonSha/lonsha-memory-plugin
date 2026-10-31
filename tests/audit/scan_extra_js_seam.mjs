#!/usr/bin/env node
/**
 * tests/audit/scan_extra_js_seam.mjs — extra_js 与宿主 seam 耦合账审计（L11-O7）
 * ------------------------------------------------------------
 * 为什么存在（L11-O7 真实现场）：
 *   manifest.extra_js 有 244 个模块，host_beast_probe.cjs 的 seam 引用面仅覆盖 148 个模块。
 *   剩余 96 个模块中有的是模块间内部引用（module-internal），有的是全无引用的孤儿（orphan）。
 *   本门看守 tests/audit/extra_js_seam_ledger.tsv 对账表，确保：
 *   1. 账本覆盖 extra_js 全集，且每条 verdict（host-seam / module-internal / orphan）客观属实；
 *   2. 任何判为 orphan 的模块，必须在 tests/audit/module_consumption_ledger.json 中登记且带理由；
 *   3. 扫描面塌陷（模块数低于阈值）fail-closed（exit 2）。
 *
 * 退出码：0 通过 / 1 存在未登记孤儿或账本漂移 / 2 结构失效（fail-closed）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* 【死 import 已摘】此处此前静态 import 了 tools/gen_extra_js_seam_ledger.mjs 的 generateSeamLedger，
 *   但全文件**零调用点**（生成账本的工具走自己的 CLI，门禁只读账本）。
 *   代价在 v3159 的 scratch 树上实测暴露：该测试按 manifest 物化注册脚本进临时树，不物化 tools/，
 *   于是门禁崩在 ESM 加载栈（ERR_MODULE_NOT_FOUND ⇒ exit 1），判据根本没来得及跑。
 *   本仓纪律「门禁只读产物、不依赖生成器」—— 生成与核对必须能分开跑。 */

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(__dir, '../..');
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';

const TSV_PATH = path.join(ROOT, 'tests/audit/extra_js_seam_ledger.tsv');
const CONSUMPTION_LEDGER_PATH = path.join(ROOT, 'tests/audit/module_consumption_ledger.json');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');

const MIN_MODULES = FIXTURE_MODE ? 1 : 200;

export function auditExtraJsSeam(customRoot = ROOT, opts = {}) {
  const rootDir = customRoot;
  const isFixture = FIXTURE_MODE || Boolean(opts.fixture);

  const manifestFile = path.join(rootDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    return { status: 'fail_closed', exitCode: 2, error: 'manifest.json 缺失' };
  }

  let extraJs;
  try {
    const man = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    extraJs = man.extra_js || [];
  } catch (e) {
    return { status: 'fail_closed', exitCode: 2, error: 'manifest.json 解析失败: ' + e.message };
  }

  if (extraJs.length < (isFixture ? 1 : MIN_MODULES)) {
    return { status: 'fail_closed', exitCode: 2, error: `extra_js 模块数过低 (${extraJs.length} < ${MIN_MODULES})` };
  }

  const tsvFile = path.join(rootDir, 'tests/audit/extra_js_seam_ledger.tsv');
  if (!fs.existsSync(tsvFile)) {
    return { status: 'fail_closed', exitCode: 2, error: 'extra_js_seam_ledger.tsv 缺失' };
  }

  const tsvContent = fs.readFileSync(tsvFile, 'utf8');
  const lines = tsvContent.trim().split('\n');
  const header = lines[0].split('\t');
  if (header.join(',') !== 'module,loaded,seam_referenced,referenced_by,verdict') {
    return { status: 'fail_closed', exitCode: 2, error: 'extra_js_seam_ledger.tsv 表头格式不符合契约' };
  }

  const tsvEntries = new Map();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    if (cols.length >= 5) {
      tsvEntries.set(cols[0], {
        loaded: cols[1],
        seam_referenced: cols[2],
        referenced_by: cols[3],
        verdict: cols[4],
      });
    }
  }

  // 读取 module_consumption_ledger
  const consFile = path.join(rootDir, 'tests/audit/module_consumption_ledger.json');
  let consData = null;
  if (fs.existsSync(consFile)) {
    try {
      consData = JSON.parse(fs.readFileSync(consFile, 'utf8'));
    } catch (_e) {
      consData = null;
    }
  }
  const consModules = (consData && consData.modules) ? consData.modules : {};
  const unrecordedOrphans = [];
  const emptyReasonOrphans = [];
  const missingFromTsv = [];

  /* ── 输入面守卫：账本判的是「模块被加载但没人引用」，前提是**模块文件真在磁盘上**。
   *   【本版实测抓到的真缺陷，留档防复发】初版只比 manifest ↔ tsv ↔ consumption 三张表，
   *   三张表互相自洽 ⇒ 根目录 .js 全删掉它也照样报「覆盖全部 244 个模块」。
   *   三档退化形态实测（H 健康 / G 删根 .js / T 掏空 tests/）：H=0 **G=0** T=0 ——
   *   G 档全 0 说明它对「模块根本不存在」无感，而那个世界里的 seam 对账是**纯纸面**的。
   *   修法：把磁盘在场率接进判据 —— 缺件过半 = 面塌了（exit 2），缺件少数 = 账本残留（exit 1）。 */
  const missingOnDisk = [];
  for (const mod of extraJs) {
    if (!fs.existsSync(path.join(rootDir, mod))) missingOnDisk.push(mod);
  }
  const missingRatio = extraJs.length > 0 ? missingOnDisk.length / extraJs.length : 0;
  if (missingOnDisk.length > 0 && missingRatio > 0.5) {
    return {
      status: 'fail_closed',
      exitCode: 2,
      error: `extra_js 有 ${missingOnDisk.length}/${extraJs.length} 个模块文件在磁盘上不存在`
        + `（超过半数）⇒ 模块装载面塌陷，seam 对账无从成立`,
    };
  }

  /* 少数缺件不算面塌，但账本记着不存在的模块是「账本残留」—— 与 tsv 缺登记同一族，走 defects。 */
  const staleInTsv = missingOnDisk.slice();

  for (const mod of extraJs) {
    const row = tsvEntries.get(mod);
    if (!row) {
      missingFromTsv.push(mod);
      continue;
    }

    if (row.verdict === 'orphan') {
      const reg = consModules[mod];
      if (!reg || reg.allowed !== 0) {
        unrecordedOrphans.push({
          module: mod,
          why: '在 extra_js_seam_ledger.tsv 中被判为 orphan，但未在 module_consumption_ledger.json 中登记 allowed:0',
        });
      } else if (!reg.why || reg.why.trim().length === 0) {
        emptyReasonOrphans.push({
          module: mod,
          why: '在 module_consumption_ledger.json 中登记了 allowed:0 但 why 为空',
        });
      }
    }
  }

  const hasDefect = unrecordedOrphans.length > 0 || emptyReasonOrphans.length > 0
    || missingFromTsv.length > 0 || staleInTsv.length > 0;

  return {
    status: hasDefect ? 'defect' : 'ok',
    exitCode: hasDefect ? 1 : 0,
    totalModules: extraJs.length,
    tsvRowCount: tsvEntries.size,
    unrecordedOrphans,
    emptyReasonOrphans,
    missingFromTsv,
    staleInTsv,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = auditExtraJsSeam(ROOT);
  if (res.status === 'fail_closed') {
    console.error(`[extra-js-seam] FAIL-CLOSED (exit 2): ${res.error}`);
    process.exit(2);
  }

  if (res.missingFromTsv.length > 0) {
    console.error(`[extra-js-seam] 发现 ${res.missingFromTsv.length} 个 extra_js 模块未在 extra_js_seam_ledger.tsv 登记：`);
    for (const m of res.missingFromTsv) console.error(`  - ${m}`);
  }

  if (res.unrecordedOrphans.length > 0) {
    console.error(`[extra-js-seam] 发现 ${res.unrecordedOrphans.length} 个 orphan 模块未在 module_consumption_ledger 登记理由：`);
    for (const o of res.unrecordedOrphans) console.error(`  - ${o.module}: ${o.why}`);
  }

  if (res.emptyReasonOrphans.length > 0) {
    console.error(`[extra-js-seam] 发现 ${res.emptyReasonOrphans.length} 个 orphan 模块理由为空：`);
    for (const o of res.emptyReasonOrphans) console.error(`  - ${o.module}: ${o.why}`);
  }

  if (res.staleInTsv && res.staleInTsv.length > 0) {
    console.error(`[extra-js-seam] 发现 ${res.staleInTsv.length} 个账本登记项在磁盘上不存在（账本残留）：`);
    for (const m of res.staleInTsv) console.error(`  - ${m}`);
  }

  /* 归因必须静态可核对（scan_exit_codes B4）：`process.exit(变量)` 被判「无法静态定值」，
   * 于是本门禁的 exit 1 在退出码归因面上**不可见** —— 自述写着能到 1、代码里却搜不到，
   * 被如实判成「写在注释里的能力」。改三元字面量（本仓允许的写法），归因面即可见。 */
  if (res.exitCode !== 0) {
    process.exit(res.exitCode === 1 ? 1 : 2);
  }

  console.log(`[extra-js-seam] 检查通过：extra_js_seam_ledger.tsv 覆盖全部 ${res.totalModules} 个模块，所有 orphan 均在台账带理由登记。`);
  process.exit(0);
}