#!/usr/bin/env node
/**
 * tests/audit/scan_module_consumption.mjs — 模块级生产消费面审计（计划 L11-O2 / L11-O3）
 * ------------------------------------------------------------
 * 为什么存在（L11-O2 真实现场）：
 *   manifest.extra_js 登记了 244 个模块，全都真被加载且单测全绿，但其中存在一批
 *   在宿主与生产代码中零引用的模块（功能级失效）。
 *   死代码预算量的是行数，抓不到「加载了但没人用」的模块。
 *   既有 scan_module_wiring 判加载冲突与全局符号供给，scan_live_wiring_dataflow 判幽灵守卫；
 *   本门判「模块被加载但在产品源码中零消费」。
 *
 * 判定规则：
 *   R1: manifest.extra_js 里每个模块，必须在生产代码中存在 ≥1 个解析到该模块的绑定调用点，
 *       若为 0 且未在 module_consumption_ledger.json 登记 allowed:0 则报红（exit 1）；
 *   R2: 台账登记 allowed:0 的条目必须带有非空 why 理由，空理由报红（exit 1）；
 *   R3: 台账 allowed:0 条目若已变成有消费（prod_call_sites > 0），提示账本腐坏，不判红；
 *   R4: 结构健康下限 —— 扫描模块数低于阈值（真仓 200，fixture 为 1）则 fail-closed（exit 2）。
 *
 * 退出码：0 通过 / 1 存在未登记零消费模块或空理由 / 2 结构失效（fail-closed）。
 *
 * ── 本版实测暴露的口径缺口（如实报出，未在本版改判据）──
 *   R1 的「生产代码」按 getProdFiles() 的定义 = 排除 tests / tools / 点目录后的全部
 *   .js/.mjs/.cjs，因此 **docs/planning/*.mjs 里的计划探针也在消费面内**。
 *   实测读数（本版逐一核过，不是估的）：
 *     · **唯一消费点全在 docs/ 内的模块 = 1 件**：unified-recall.js（1/1 处，在
 *       docs/planning/2026-10-20-product-probe.mjs）。门禁对它打 docsOnlySupport 读数。
 *     · **消费点里含 docs 扣减、扣完归零的另有 3 件**（现仍在台账登记 allowed:1）：
 *       memory-supersede.js / story-clock-parse.js / ai-select.js
 *       —— 它们各有 ≥1 处真生产引用，但把 docs 那几处减掉后就剩 0；
 *       这三件不在 docsOnlySupport 里（判据是「全部来自 docs」，它们不满足），
 *       需要按下面这条口径决策才能定它们该不该转 allowed:0。
 *   所以这不是门禁没看见，而是「谁的引用算产品消费」这条口径尚未决策：
 *     · 若 docs 探针算消费 ⇒ 现状成立，但台账里 active 的含义含「文档在用」；
 *     · 若 docs 探针不算消费 ⇒ 上面 4 件都应转 allowed:0 并补理由（属 L11-O1 清算面）。
 *   两种处置都在产品面决策，故本版**不动判据**，只把能如实报出的那一条打出来
 *   （docsOnlySupport），并把这 4 件的名字留在本注释里防丢。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../_audit_lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(__dir, '../..');
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';

const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const LEDGER_PATH = path.join(ROOT, 'tests/audit/module_consumption_ledger.json');

const MIN_MODULES = FIXTURE_MODE ? 1 : 200;

/* [v3.431.0] `base` 必须跟随**传入的 root**，不能钉死模块级 ROOT：
 *   getProdFiles 的返回值会被 auditModuleConsumption 用 `path.join(rootDir, pf)`
 *   再拼回去读文件，两处必须用同一个基准。
 *   修前用全局 ROOT ⇒ 只在「customRoot 恰好能相对 ROOT 还原」时偶然成立：
 *   夹具在 /tmp 下时 relative 结果带 ../../../tmp/… 恰好还原；
 *   一旦夹具落在别的盘位（如仓库同级目录 /home/user X/.lonsha-test-tmp/…
 *   那种与 ROOT 同前缀的路径），relative 会给出 ../.lonsha-test-tmp/…
 *   而 join(rootDir, ../.lonsha-test-tmp/…) 会拼出不存在的路径 ⇒ 生产代码全部读空
 *   ⇒ 每个模块的 prodCallSites 都退化成 0 ⇒ 判据对**有消费**的模块报「零消费」。
 *   这正是把测试临时根从 /tmp 挪到磁盘后当场炸出来的（v34270 两连红）。 */
function getProdFiles(dir, base = dir) {
  let res = [];
  let entries;
  try { entries = fs.readdirSync(dir); } catch (_e) { return []; }
  for (const n of entries) {
    if (n === 'node_modules' || n === '.git' || n === 'tests' || n === 'tools' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    let st;
    try { st = fs.statSync(p); } catch (_e) { continue; }
    if (st.isDirectory()) {
      res = res.concat(getProdFiles(p, base));
    } else if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) {
      res.push(path.relative(base, p));
    }
  }
  return res;
}

export function auditModuleConsumption(customRoot = ROOT, opts = {}) {
  const rootDir = customRoot;
  const isFixture = FIXTURE_MODE || Boolean(opts.fixture);

  const manifestFile = path.join(rootDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    return {
      status: 'fail_closed',
      exitCode: 2,
      error: `找不到 manifest.json：${manifestFile}`,
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (e) {
    return {
      status: 'fail_closed',
      exitCode: 2,
      error: `manifest.json 解析失败：${e.message}`,
    };
  }

  const extraJs = Array.isArray(manifest.extra_js) ? manifest.extra_js : [];
  if (extraJs.length < (isFixture ? 1 : MIN_MODULES)) {
    return {
      status: 'fail_closed',
      exitCode: 2,
      error: `extra_js 模块数过低 (${extraJs.length} < ${MIN_MODULES})，探测器失效 fail-closed`,
    };
  }

  const ledgerFile = path.join(rootDir, 'tests/audit/module_consumption_ledger.json');
  let ledgerData = null;
  if (fs.existsSync(ledgerFile)) {
    try {
      ledgerData = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    } catch (_e) {
      ledgerData = null;
    }
  }

  const registeredModules = (ledgerData && ledgerData.modules) ? ledgerData.modules : {};

  // 收集并剥除生产代码注释
  const prodFiles = getProdFiles(rootDir);
  const fileCodeMap = new Map();
  for (const pf of prodFiles) {
    try {
      const raw = fs.readFileSync(path.join(rootDir, pf), 'utf8');
      fileCodeMap.set(pf, stripComments(raw));
    } catch (_e) {
      // 忽略无法读取的文件
    }
  }

  function extractModuleGlobals(modFile) {
    const code = fileCodeMap.get(modFile) || '';
    const globals = new Set();
    for (const m of code.matchAll(/window\.(LonSha[A-Za-z0-9_]+)\s*=/g)) globals.add('window.' + m[1]);
    for (const m of code.matchAll(/globalThis\.([A-Za-z0-9_]+Lib)\s*=/g)) globals.add('globalThis.' + m[1]);
    return Array.from(globals);
  }

  const unconsumedUnregistered = [];
  const emptyReasonViolations = [];
  const staleAllowedWarnings = [];
  /* 口径缺口读数（见文件头留痕）：消费点里有多少来自 docs/ 下的计划探针。
   *   只读数、不判红 —— 「文档里的探针算不算产品消费」是产品面决策，不由门禁替它决定。 */
  const docsOnlySupport = [];
  let totalChecked = 0;
  let activeCount = 0;

  for (const modFile of extraJs) {
    totalChecked++;
    const baseName = modFile.replace(/\.js$/, '');
    const modGlobals = extractModuleGlobals(modFile);
    let prodCallSites = 0;
    let prodCallSitesFromDocs = 0;

    for (const [pf, code] of fileCodeMap.entries()) {
      if (pf === modFile) continue;

      // 绑定级消费：
      // 1. 文件级路径绑定：require('./xxx') / import ... from './xxx' / _moduleLib(..., 'xxx.js')
      const fileRefRegex = new RegExp(`['"\`][./]*${modFile}['"\`]|['"\`][./]*${baseName}['"\`]|_moduleLib\\([^,]+,[\\s]*['"\`]${modFile}['"\`]\\)`, 'g');
      const fMatches = code.match(fileRefRegex);
      if (fMatches) {
        prodCallSites += fMatches.length;
        if (pf.startsWith('docs/')) prodCallSitesFromDocs += fMatches.length;
      }

      // 2. 独占命名空间全局符号消费
      for (const g of modGlobals) {
        const gRegex = new RegExp(`\\b${g.replace('.', '\\.')}\\b`, 'g');
        const gMatches = code.match(gRegex);
        if (gMatches) {
          prodCallSites += gMatches.length;
        }
      }
    }

    const ledgerEntry = registeredModules[modFile];

    if (prodCallSites === 0) {
      // 0 消费
      if (!ledgerEntry || ledgerEntry.allowed !== 0) {
        unconsumedUnregistered.push({
          module: modFile,
          callSites: 0,
          why: '未在 module_consumption_ledger.json 中登记 allowed:0',
        });
      } else if (!ledgerEntry.why || ledgerEntry.why.trim().length === 0) {
        emptyReasonViolations.push({
          module: modFile,
          why: '台账登记了 allowed:0 但 why 理由为空（R2 违规）',
        });
      }
    } else {
      activeCount++;
      if (prodCallSitesFromDocs === prodCallSites) {
        docsOnlySupport.push({ module: modFile, callSites: prodCallSites });
      }
      // 产生消费但台账登记 allowed:0
      if (ledgerEntry && ledgerEntry.allowed === 0) {
        staleAllowedWarnings.push({
          module: modFile,
          callSites: prodCallSites,
        });
      }
    }
  }

  const hasDefect = unconsumedUnregistered.length > 0 || emptyReasonViolations.length > 0;

  return {
    status: hasDefect ? 'defect' : 'ok',
    exitCode: hasDefect ? 1 : 0,
    totalChecked,
    activeCount,
    unconsumedUnregistered,
    emptyReasonViolations,
    staleAllowedWarnings,
    docsOnlySupport,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = auditModuleConsumption(ROOT);
  if (res.status === 'fail_closed') {
    console.error(`[module-consumption] FAIL-CLOSED (exit 2): ${res.error}`);
    process.exit(2);
  }

  if (res.staleAllowedWarnings && res.staleAllowedWarnings.length > 0) {
    for (const w of res.staleAllowedWarnings) {
      console.warn(`[module-consumption] 提示: 模块 ${w.module} 在台账登记 allowed:0 但已有 ${w.callSites} 处消费点（账本待刷新）`);
    }
  }

  if (res.emptyReasonViolations && res.emptyReasonViolations.length > 0) {
    console.error(`[module-consumption] R2 违规: 发现 ${res.emptyReasonViolations.length} 个条目 allowed:0 但理由为空：`);
    for (const v of res.emptyReasonViolations) {
      console.error(`  - ${v.module}: ${v.why}`);
    }
  }

  if (res.unconsumedUnregistered && res.unconsumedUnregistered.length > 0) {
    console.error(`[module-consumption] R1 违规: 发现 ${res.unconsumedUnregistered.length} 个未登记的零消费模块：`);
    for (const v of res.unconsumedUnregistered) {
      console.error(`  - ${v.module}: ${v.why}`);
    }
  }

  /* 归因必须静态可核对（scan_exit_codes B4）：`process.exit(变量)` 被判「无法静态定值」，
   * 于是本门禁的 exit 1 在退出码归因面上**不可见** —— 自述写着能到 1、代码里却搜不到，
   * 被如实判成「写在注释里的能力」。改三元字面量（本仓允许的写法），归因面即可见。 */
  if (res.docsOnlySupport && res.docsOnlySupport.length > 0) {
    /* 口径缺口读数（不判红）：这些模块的消费点全部来自 docs/ 下的计划探针。
     *   「文档探针算不算产品消费」尚未决策，本门禁不下结论，只把数字摆出来。 */
    console.warn(`[module-consumption] 提示: ${res.docsOnlySupport.length} 个模块的消费点**全部来自 docs/ 计划探针**`
      + `（若口径改为「docs 不算消费」，它们应转 allowed:0 并补理由）：`);
    for (const d of res.docsOnlySupport) {
      console.warn(`  - ${d.module}（${d.callSites} 处，全部在 docs/ 内）`);
    }
  }

  if (res.exitCode !== 0) {
    process.exit(res.exitCode === 1 ? 1 : 2);
  }

  console.log(`[module-consumption] 检查通过：共审计 ${res.totalChecked} 个 extra_js 模块（${res.activeCount} 个活跃消费，${res.totalChecked - res.activeCount} 个已登记合规留存），零未登记孤儿。`);
  process.exit(0);
}