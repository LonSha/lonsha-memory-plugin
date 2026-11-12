import fs from 'node:fs';
/* ★ [L21-O1 修·口径唯一真源] 消费识别**必须**与台账生成器 / R1 门禁同源。
 *   修前本工具内联第三份识别规则（只认 `window.LonSha*` / `globalThis.*Lib`），
 *   于是 `global.LonSha*` / `window.GraphDiffusion` / `_winModule('X')` 全部读不到
 *   ⇒ 6 个**早已接好**的模块被判 orphan ⇒ seam 门禁红。
 *   实测假阳性清单（每条都有真实消费点，见 _consumption_lib.mjs 头部）：
 *     config-effect-registry / modules_combined / graph_algorithms /
 *     world-clock-reader / world-ledger-reader / api-channels
 *   修法：与台账、门禁共用 `tests/_consumption_lib.mjs`。 */
import {
  extractModuleGlobals as _libExtractGlobals, countConsumptionIn, parseRegistryAliases,
} from '../tests/_consumption_lib.mjs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../tests/_audit_lib.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const extraJs = manifest.extra_js || [];

// 获取宿主源码合并面 (对齐 host_beast_probe.cjs)
const HOST_MODULES = [
  'engine-diagnostic-lines.js',
  'engine-evidence-center.js',
  'engine-execution-pipeline.js',
  'engine-injection-pipeline.js',
  'engine-persistence-ops.js',
  'engine-qa-tools.js',
  'engine-recall.js',
  'engine-repair-ops.js',
  'engine-report.js',
  'engine-self-check.js',
  'engine-story-annual.js',
  'memory-core.js',
];

const hostFiles = new Set(['index.js', 'settings-ui.js', ...HOST_MODULES]);

// 提取宿主面源码合并面（剥除注释）
const hostCodeMap = new Map();
for (const f of hostFiles) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) {
    hostCodeMap.set(f, stripComments(fs.readFileSync(p, 'utf8')));
  }
}

// 收集所有非测试非宿主的领域模块
function getAllProdFiles(dir) {
  let res = [];
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n === 'tests' || n === 'tools' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      res = res.concat(getAllProdFiles(p));
    } else if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) {
      res.push(path.relative(ROOT, p));
    }
  }
  return res;
}

const allProd = getAllProdFiles(ROOT);
const nonHostProd = allProd.filter(f => !hostFiles.has(f));

// 预处理非宿主代码（剥除注释）
const nonHostCodeMap = new Map();
for (const f of nonHostProd) {
  nonHostCodeMap.set(f, stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')));
}

/* 全局名提取走共享库（收源码）。保留同名包装以免改多处调用点。 */
function extractModuleGlobals(modFile) {
  const p = path.join(ROOT, modFile);
  if (!fs.existsSync(p)) return [];
  return _libExtractGlobals(stripComments(fs.readFileSync(p, 'utf8')));
}

export function generateSeamLedger() {
  /* 注册表登记名映射：不自挂全局名的模块，消费标识符只在注册表 entries 里。
   *   与台账生成器 / R1 门禁同源（parseRegistryAliases），三处不可能再分叉。 */
  const registryAliases = parseRegistryAliases(
    hostCodeMap.get('optional-engine-registry.js')
      || nonHostCodeMap.get('optional-engine-registry.js')
      || ''
  );
  const rows = [];
  rows.push(['module', 'loaded', 'seam_referenced', 'referenced_by', 'verdict'].join('\t'));

  const orphans = [];
  const hostSeam = [];
  const moduleInternal = [];

  for (const mod of extraJs) {
    const loaded = 'yes';
    const ownGlobals = extractModuleGlobals(mod);
    const alias = registryAliases.get(mod);
    const modGlobals = alias && !ownGlobals.includes(alias) ? [...ownGlobals, alias] : ownGlobals;

    // 1. 检查宿主面是否引用该模块
    let isHostSeam = false;
    for (const [hf, hcode] of hostCodeMap.entries()) {
      if (hf === mod) continue;
      /* 文件绑定 + 全局符号（含 `_winModule('X')` 字符串取全局）一律走共享库，
       *   修前这里只做裸名正则，`api-channels` 这种「字符串取全局」的接线看不见。 */
      if (countConsumptionIn(hcode, mod, modGlobals).count > 0) {
        isHostSeam = true;
        break;
      }
    }

    // 2. 检查非宿主模块是否引用该模块
    const refBy = [];
    for (const [pf, code] of nonHostCodeMap.entries()) {
      if (pf === mod) continue;
      if (countConsumptionIn(code, mod, modGlobals).count > 0) refBy.push(pf);
    }

    let verdict = '';
    const seamReferenced = isHostSeam ? 'yes' : 'no';

    if (isHostSeam) {
      verdict = 'host-seam';
      hostSeam.push(mod);
    } else if (refBy.length > 0) {
      verdict = 'module-internal';
      moduleInternal.push(mod);
    } else {
      verdict = 'orphan';
      orphans.push(mod);
    }

    const refByStr = refBy.length > 0 ? refBy.slice(0, 3).join(';') : 'none';
    rows.push([mod, loaded, seamReferenced, refByStr, verdict].join('\t'));
  }

  const tsv = rows.join('\n') + '\n';
  return {
    tsv,
    stats: {
      total: extraJs.length,
      hostSeam: hostSeam.length,
      moduleInternal: moduleInternal.length,
      orphans: orphans.length,
      orphanList: orphans,
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { tsv, stats } = generateSeamLedger();
  const outPath = path.join(ROOT, 'tests/audit/extra_js_seam_ledger.tsv');
  fs.writeFileSync(outPath, tsv, 'utf8');
  console.log(`[gen_extra_js_seam_ledger] 生成 ${outPath} 完成：`);
  console.log(`  总模块: ${stats.total}`);
  console.log(`  host-seam: ${stats.hostSeam}`);
  console.log(`  module-internal: ${stats.moduleInternal}`);
  console.log(`  orphan: ${stats.orphans}`);
  console.log('  orphan 模块列表:');
  for (const o of stats.orphanList) {
    console.log(`    - ${o}`);
  }
}