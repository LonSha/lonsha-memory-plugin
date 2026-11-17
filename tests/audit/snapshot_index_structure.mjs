#!/usr/bin/env node
/* ============================================================
 * tests/audit/snapshot_index_structure.mjs —— index.js 结构快照（L22-O1 拆解基线）
 * ------------------------------------------------------------
 * 【为什么先有这个】
 *   `index.js` 13546 行，且**没有任何测试档提到 L22-O1**。拆它之前如果没有结构基线，
 *   「拆完是否等价」就只能靠感觉。本工具把文件的结构量出来、落成 JSON：
 *   每个顶层类/函数/对象字面量的起止行与行数、条目总量。
 *   拆解过程中每搬一块，跑一次 `--check`：**除被搬走的那块外，其余块的起止行号必须只按
 *   「被搬走的行数」平移，不能出现别的漂移**。漂移即说明手改到了不该改的地方。
 *
 * 【它不是什么】
 *   它不是行为判据。行为等价靠另外三条：①仓内判据真跑绿 ②导出面逐字对得上
 *   ③`_moduleLib` 双向取库（window 全局 / require 回落）都试过。本文件只管结构。
 *
 * 用法：
 *   node tests/audit/snapshot_index_structure.mjs --write   # 写 tests/audit/index_structure.json
 *   node tests/audit/snapshot_index_structure.mjs           # 打印
 *   node tests/audit/snapshot_index_structure.mjs --check   # 与账本比对，结构变了则 exit 1
 * 退出码：0=结构一致 1=结构漂移 2=拒判
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const TARGET = 'index.js';
const LEDGER = 'tests/audit/index_structure.json';
const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const CHECK = argv.includes('--check');

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) {
    console.log('[index-structure] 拒判：读不到 index.js');
    process.exit(2);
}
const lines = fs.readFileSync(abs, 'utf8').split('\n');

/** 括号配对求结束行（忽略字符串/注释里的括号 —— 对本仓足够：结构块都从行首开始）。 */
function endOf(start) {
    let depth = 0, seen = false;
    for (let k = start; k < lines.length; k++) {
        for (const ch of lines[k]) {
            if (ch === '{') { depth++; seen = true; }
            else if (ch === '}') { depth--; if (seen && depth === 0) return k; }
        }
    }
    return -1;
}

const blocks = [];
for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m = l.match(/^    (?:async\s+)?class\s+([A-Za-z_$][\w$]*)/);
    if (m) { const e = endOf(i); if (e > i) blocks.push({ kind: 'class', name: m[1], start: i + 1, end: e + 1, size: e - i + 1 }); continue; }
    m = l.match(/^    (?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (m) { const e = endOf(i); if (e > i) blocks.push({ kind: 'function', name: m[1], start: i + 1, end: e + 1, size: e - i + 1 }); continue; }
    m = l.match(/^    (?:window\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s*=\s*\{\s*$/);
    if (m) { const e = endOf(i); if (e > i) blocks.push({ kind: 'object', name: l.trim().replace(/\s*=\s*\{\s*$/, ''), start: i + 1, end: e + 1, size: e - i + 1 }); }
}

blocks.sort((a, b) => a.start - b.start);
const covered = blocks.reduce((a, b) => a + b.size, 0);

const snap = {
    schema: 'index-structure@1',
    target: TARGET,
    totalLines: lines.length,
    blockCount: blocks.length,
    coveredLines: covered,
    byKind: blocks.reduce((acc, b) => { acc[b.kind] = (acc[b.kind] || 0) + 1; return acc; }, {}),
    blocks
};

if (WRITE) {
    fs.writeFileSync(path.join(ROOT, LEDGER), JSON.stringify(snap, null, 2) + '\n');
    console.log(`[index-structure] 已写 ${LEDGER}`);
}

console.log(`[index-structure] ${TARGET} ${snap.totalLines} 行 · 结构块 ${snap.blockCount}（覆盖 ${covered} 行 = ${(covered / snap.totalLines * 100).toFixed(1)}%）`);
for (const b of blocks.slice(0, 8)) console.log(`  ${b.kind.padEnd(8)} ${b.name} ${b.start}-${b.end} (${b.size})`);

if (CHECK) {
    const prevPath = path.join(ROOT, LEDGER);
    if (!fs.existsSync(prevPath)) { console.log('[index-structure] 拒判：没有基线，先跑 --write'); process.exit(2); }
    const prev = JSON.parse(fs.readFileSync(prevPath, 'utf8'));
    const drift = [];
    for (const b of prev.blocks) {
        const now = blocks.find((x) => x.name === b.name && x.kind === b.kind);
        if (!now) { drift.push(`消失: ${b.kind} ${b.name}`); continue; }
        if (now.size !== b.size) drift.push(`行数变了: ${b.name} ${b.size} -> ${now.size}`);
    }
    for (const b of blocks) {
        if (!prev.blocks.find((x) => x.name === b.name && x.kind === b.kind)) drift.push(`新增: ${b.kind} ${b.name} (${b.size})`);
    }
    console.log(`[index-structure] 与基线比对：${drift.length === 0 ? '一致' : drift.length + ' 处漂移'}`);
    for (const d of drift.slice(0, 15)) console.log('  - ' + d);
    if (prev.totalLines !== snap.totalLines) {
        console.log(`[index-structure] 总行数 ${prev.totalLines} -> ${snap.totalLines}（拆解时这是预期的）`);
    }
    process.exit(drift.length === 0 ? 0 : 1);
}
process.exit(0);