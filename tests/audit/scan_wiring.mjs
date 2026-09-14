// 审计基建 A（v2）：接线完整性扫描 —— 修正为本项目实际结构
// 结构事实：IIFE 内 4sp class，8sp 方法；配置块为 ConfigManager 内 `this.config = {`
import fs from 'fs';
const idx = fs.readFileSync('index.js', 'utf8');
const ui = fs.readFileSync('settings-ui.js', 'utf8');
const lines = idx.split('\n');

function braceBlock(text, fromIdx) {
    let i = text.indexOf('{', fromIdx), depth = 0;
    const start = i;
    for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
    }
    return text.slice(start, i + 1);
}

// ---------- 1. 配置默认值键 ----------
const cfgStart = idx.indexOf('this.config = {');
const cfgBlock = braceBlock(idx, cfgStart);
const cfgKeys = new Set();
for (const km of cfgBlock.matchAll(/^\s{12,20}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)) cfgKeys.add(km[1]);

// ---------- 2. UI 键 ----------
const uiKeys = new Set();
for (const km of ui.matchAll(/['"]([a-zA-Z_][a-zA-Z0-9_]{2,40})['"]/g)) uiKeys.add(km[1]);
for (const km of ui.matchAll(/config(?:\?)?\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) uiKeys.add(km[1]);

// ---------- 3. 配置键在别处的出现次数 ----------
const cfgL0 = idx.slice(0, cfgStart).split('\n').length;
const cfgL1 = cfgL0 + cfgBlock.split('\n').length;
const readCount = {};
for (const k of cfgKeys) {
    const re = new RegExp(`\\b${k}\\b`);
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
        if (i + 1 >= cfgL0 && i + 1 <= cfgL1) continue;
        if (re.test(lines[i])) n++;
    }
    readCount[k] = n;
}

// ---------- 4. 方法定义（8sp） vs 调用 ----------
const defined = new Map();
for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(/^ {8}(?:async\s+)?(?:static\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (!dm) continue;
    const n = dm[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'constructor', 'else', 'do', 'try'].includes(n)) continue;
    if (!defined.has(n)) defined.set(n, []);
    defined.get(n).push(i + 1);
}
const orphan = [], dup = [];
for (const [n, at] of defined) {
    if (at.length > 1) dup.push(`${n} @${at.join(',')}`);
    const callRe = new RegExp(`\\w\\??\\.${n}\\s*\\(|\\['${n}'\\]|["']${n}["']`, 'g');
    const cIdx = (idx.match(callRe) || []).length;
    const cUi = (ui.match(new RegExp(`\\.${n}\\s*\\(|["']${n}["']`, 'g')) || []).length;
    if (cIdx + cUi === 0) orphan.push(`${n} @${at[0]}`);
}

// ---------- 5. 输出 ----------
const neverRead = Object.entries(readCount).filter(([, v]) => v === 0).map(([k]) => k);
const noUi = [...cfgKeys].filter(k => !uiKeys.has(k));

console.log('=== A1 配置键总数:', cfgKeys.size, `(块位于 L${cfgL0}-L${cfgL1})`);
console.log('=== A2 定义但从未在别处出现的配置键 (' + neverRead.length + '):');
console.log(neverRead.length ? '  ' + neverRead.join(', ') : '  （无）');
console.log('=== A3 有默认值但 UI 完全未提及 (' + noUi.length + '):');
console.log(noUi.length ? '  ' + noUi.join(', ') : '  （无）');
console.log('=== A5 方法定义总数:', defined.size);
console.log('=== A6 同名方法多处定义 (' + dup.length + '):');
console.log(dup.length ? '  ' + dup.join('\n  ') : '  （无）');
console.log('=== A7 定义但检索不到调用点 (' + orphan.length + '):');
console.log(orphan.length ? '  ' + orphan.join('\n  ') : '  （无）');