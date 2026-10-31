import fs from 'node:fs';
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

function extractModuleGlobals(modFile) {
  const p = path.join(ROOT, modFile);
  if (!fs.existsSync(p)) return [];
  const code = stripComments(fs.readFileSync(p, 'utf8'));
  const globals = new Set();
  for (const m of code.matchAll(/window\.(LonSha[A-Za-z0-9_]+)\s*=/g)) globals.add('window.' + m[1]);
  for (const m of code.matchAll(/globalThis\.([A-Za-z0-9_]+Lib)\s*=/g)) globals.add('globalThis.' + m[1]);
  return Array.from(globals);
}

export function generateSeamLedger() {
  const rows = [];
  rows.push(['module', 'loaded', 'seam_referenced', 'referenced_by', 'verdict'].join('\t'));

  const orphans = [];
  const hostSeam = [];
  const moduleInternal = [];

  for (const mod of extraJs) {
    const loaded = 'yes';
    const base = mod.replace(/\.js$/, '');
    const modGlobals = extractModuleGlobals(mod);

    // 1. 检查宿主面是否引用该模块
    let isHostSeam = false;
    for (const [hf, hcode] of hostCodeMap.entries()) {
      if (hf === mod) continue;
      const fileRefRegex = new RegExp(`['"\`][./]*${mod}['"\`]|['"\`][./]*${base}['"\`]|_moduleLib\\([^,]+,[\\s]*['"\`]${mod}['"\`]\\)`, 'g');
      if (fileRefRegex.test(hcode)) {
        isHostSeam = true;
        break;
      }
      for (const g of modGlobals) {
        const gRegex = new RegExp(`\\b${g.replace('.', '\\.')}\\b`, 'g');
        if (gRegex.test(hcode)) {
          isHostSeam = true;
          break;
        }
      }
      if (isHostSeam) break;
    }

    // 2. 检查非宿主模块是否引用该模块
    const refBy = [];
    for (const [pf, code] of nonHostCodeMap.entries()) {
      if (pf === mod) continue;
      const re = new RegExp(`['"\`][./]*${mod}['"\`]|['"\`][./]*${base}['"\`]|\\brequire\\(['"\`][./]*${base}['"\`]\\)`, 'g');
      if (re.test(code)) {
        refBy.push(pf);
      }
      for (const g of modGlobals) {
        const gRegex = new RegExp(`\\b${g.replace('.', '\\.')}\\b`, 'g');
        if (gRegex.test(code)) {
          refBy.push(pf);
          break;
        }
      }
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