#!/usr/bin/env node
/* ============================================================
 * tests/audit/snapshot_index_structure.mjs —— index.js 结构快照（L22-O1 拆解基线）
 * ------------------------------------------------------------
 * 【为什么先有这个】
 *   `index.js` 一万三千多行，且**没有任何测试档提到 L22-O1**。拆它之前如果没有结构基线，
 *   「拆完是否等价」就只能靠感觉。本工具把文件结构量出来落成 JSON：
 *   每个顶层条目的起止行与行数、条目总量、覆盖行数。
 *
 * 【一次真事故（写在这里，免得后来者重犯）】
 *   本工具最初用「数 `{` / `}`」求每块结束行，连错两种写法：
 *     ① 不看字符串/注释 —— `sanitizeJson` 里含 `}` 的模板字符串把配对提前打平，量成 58 行（实为 141 行）；
 *     ② 补齐“跳过字符串”之后，**正则字面量**里的引号/花括号又把配对打飞 ——
 *        `extractThinkingChain` 被量成 6016 行，覆盖率一度算到 119%（>100% 本身就是读数坏了）。
 *   结论：在 13k 行、正则密集的单文件上，「配对花括号」不是可靠的结构来源。
 *   现在改成**顶层条目切段**（sliceTopLevel）：先认顶层起点，条目结束 = 下一顶层起点前一行。
 *   代价写清楚：这是“分段”不是“精确块界”，条目之间夹的注释/空行会并入上一块；
 *   它足够回答“拆成了多少块、每块多大”，但**不能**当作语法边界用。
 *
 * 【它不是什么】
 *   它不是行为判据。行为等价靠另外三条：①入口能装载 + 导出面逐字不变（tests/_index_loader.cjs）
 *   ②被搬走的函数体 sha256 与行为快照（tests/audit/index_helpers_baseline.json）
 *   ③仓内判据真跑绿（本环境跑不动全量，只能逐档跑）。
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

/** 认顶层条目起点（行首 4 空格 + function/class/const|let|var/对象赋值）。 */
function collectStarts() {
    const starts = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        let m = l.match(/^ {4}(?:async\s+)?class\s+([A-Za-z_$][\w$]*)/);
        if (m) { starts.push({ line: i, kind: 'class', name: m[1] }); continue; }
        m = l.match(/^ {4}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
        if (m) { starts.push({ line: i, kind: 'function', name: m[1] }); continue; }
        m = l.match(/^ {4}(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/);
        if (m) { starts.push({ line: i, kind: 'var', name: m[1] }); continue; }
        m = l.match(/^ {4}(?:window\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)\s*=\s*\{\s*$/);
        if (m) { starts.push({ line: i, kind: 'object', name: l.trim().replace(/\s*=\s*\{\s*$/, '') }); }
    }
    return starts;
}

/** 顶层条目切段：结束行 = 下一顶层起点前一行（去掉尾部空行）。 */
function sliceTopLevel(starts) {
    const out = [];
    for (let k = 0; k < starts.length; k++) {
        const st = starts[k].line;
        let en = (k + 1 < starts.length ? starts[k + 1].line : lines.length) - 1;
        while (en > st && !String(lines[en] || '').trim()) en--;
        out.push({ kind: starts[k].kind, name: starts[k].name, start: st + 1, end: en + 1, size: en - st + 1 });
    }
    return out;
}

const blocks = sliceTopLevel(collectStarts());
const covered = blocks.reduce((a, b) => a + b.size, 0);

const snap = {
    schema: 'index-structure@2',
    target: TARGET,
    method: 'top-level-slice',
    method_note: '按顶层条目切段（非括号配对）：条目结束 = 下一顶层起点前一行。足够判“拆了多少块/多大”，不作语法边界用。',
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

console.log(`[index-structure] ${TARGET} ${snap.totalLines} 行 · 顶层条目 ${snap.blockCount}（覆盖 ${covered} 行 = ${(covered / snap.totalLines * 100).toFixed(1)}%）`);
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