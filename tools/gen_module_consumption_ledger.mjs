import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../tests/_audit_lib.mjs';

const ROOT = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const extraJs = manifest.extra_js || [];

function getProdFiles(dir) {
  let res = [];
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n === 'tests' || n === 'tools' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      res = res.concat(getProdFiles(p));
    } else if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) {
      res.push(path.relative(ROOT, p));
    }
  }
  return res;
}

const prodFiles = getProdFiles(ROOT);
const fileCodeMap = new Map();
for (const pf of prodFiles) {
  fileCodeMap.set(pf, stripComments(fs.readFileSync(path.join(ROOT, pf), 'utf8')));
}

function extractModuleGlobals(modFile) {
  const code = fileCodeMap.get(modFile) || '';
  const globals = new Set();
  for (const m of code.matchAll(/window\.(LonSha[A-Za-z0-9_]+)\s*=/g)) globals.add('window.' + m[1]);
  for (const m of code.matchAll(/globalThis\.([A-Za-z0-9_]+Lib)\s*=/g)) globals.add('globalThis.' + m[1]);
  return Array.from(globals);
}

const ledger = {};

for (const modFile of extraJs) {
  const baseName = modFile.replace(/\.js$/, '');
  const modGlobals = extractModuleGlobals(modFile);
  let prodCallSites = 0;
  const callers = [];

  for (const [pf, code] of fileCodeMap.entries()) {
    if (pf === modFile) continue;
    const fileRefRegex = new RegExp(`['"\`][./]*${modFile}['"\`]|['"\`][./]*${baseName}['"\`]|_moduleLib\\([^,]+,[\\s]*['"\`]${modFile}['"\`]\\)`, 'g');
    const fMatches = code.match(fileRefRegex);
    if (fMatches) {
      prodCallSites += fMatches.length;
      callers.push({ file: pf, count: fMatches.length, type: 'file_binding' });
    }
    for (const g of modGlobals) {
      const gRegex = new RegExp(`\\b${g.replace('.', '\\.')}\\b`, 'g');
      const gMatches = code.match(gRegex);
      if (gMatches) {
        prodCallSites += gMatches.length;
        callers.push({ file: pf, count: gMatches.length, type: 'exclusive_global', symbol: g });
      }
    }
  }

  const isZero = prodCallSites === 0;
  let why = 'active';
  if (isZero) {
    if ([
      'institutional-memory.js',
      'symbolic-evolution.js',
      'knowledge-network.js',
      'relation-dynamics.js',
      'character-agency-contract.js',
      'era-inheritance.js'
    ].includes(modFile)) {
      why = 'L11-O1 待接线清算清单内核（真加载但宿主零引用）';
    } else {
      why = '存量独立算法库或工作台套件（待后续阶段接线或降级）';
    }
  }

  ledger[modFile] = {
    module: modFile,
    surface: modGlobals.length > 0 ? modGlobals : [baseName],
    prod_call_sites: prodCallSites,
    allowed: isZero ? 0 : 1,
    why: why,
  };
}

const output = {
  schema: 'module-consumption-ledger@1',
  generated_at: new Date().toISOString(),
  total_modules: Object.keys(ledger).length,
  zero_consumption_count: Object.values(ledger).filter(e => e.prod_call_sites === 0).length,
  modules: ledger,
};

fs.writeFileSync(
  path.join(ROOT, 'tests/audit/module_consumption_ledger.json'),
  JSON.stringify(output, null, 2) + '\n',
  'utf8'
);

console.log('生成 tests/audit/module_consumption_ledger.json 完成：');
console.log('  total_modules:', output.total_modules);
console.log('  zero_consumption_count:', output.zero_consumption_count);