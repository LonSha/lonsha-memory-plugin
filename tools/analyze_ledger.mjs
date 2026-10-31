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

// 抽取每个模块公开的专属全局符号 (window.LonShaXXX, globalThis.XXX 等)
function extractModuleGlobals(modFile) {
  const code = fileCodeMap.get(modFile) || '';
  const globals = new Set();
  
  // window.LonShaXXX = ...
  const m1 = code.matchAll(/window\.(LonSha[A-Za-z0-9_]+)\s*=/g);
  for (const m of m1) globals.add(`window.${m[1]}`);
  
  // globalThis.XXXLib = ...
  const m2 = code.matchAll(/globalThis\.([A-Za-z0-9_]+Lib)\s*=/g);
  for (const m of m2) globals.add(`globalThis.${m[1]}`);

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

    // 1. 文件级显式绑定/引入: require('./xxx') | import ... from './xxx' | _moduleLib(..., 'xxx.js')
    const fileRefRegex = new RegExp(`['"\`][./]*${modFile}['"\`]|['"\`][./]*${baseName}['"\`]|_moduleLib\\([^,]+,[\\s]*['"\`]${modFile}['"\`]\\)`, 'g');
    const fMatches = code.match(fileRefRegex);
    if (fMatches) {
      prodCallSites += fMatches.length;
      callers.push({ file: pf, count: fMatches.length, type: 'file_binding' });
    }

    // 2. 独占全局符号引用（排除定义处）
    for (const g of modGlobals) {
      const gRegex = new RegExp(`\\b${g.replace('.', '\\.')}\\b`, 'g');
      const gMatches = code.match(gRegex);
      if (gMatches) {
        prodCallSites += gMatches.length;
        callers.push({ file: pf, count: gMatches.length, type: 'exclusive_global', symbol: g });
      }
    }
  }

  ledger[modFile] = {
    module: modFile,
    surface: modGlobals.length > 0 ? modGlobals : [baseName],
    prod_call_sites: prodCallSites,
    allowed: prodCallSites > 0 ? 1 : 0,
    why: prodCallSites > 0 ? 'active' : '',
    callers: callers.slice(0, 5),
  };
}

console.log('Total modules analyzed:', Object.keys(ledger).length);
const zero = Object.values(ledger).filter(e => e.prod_call_sites === 0);
console.log('Zero call sites count:', zero.length);
console.log('memory-supersede callers:', ledger['memory-supersede.js']);
for (const z of zero) {
  console.log(`- ${z.module}`);
}