// 审计基建（v3.202）：存档面 vs 携带面 差集扫描
// ------------------------------------------------------------
// 为什么存在：
//   v3.168 建了携带契约（CARRYOVER_CONTRACT_KEYS）并让两侧可机检，但那条对账只回答
//   「契约要求的键，写侧产出了吗 / 读侧消费了吗」——它**不问**「存档面还有哪些键根本
//   没进契约」。于是 v3.180~v3.197 逐版新增的子系统只要忘了登记契约，对账照样全绿：
//     · v3.194 声称修复账（repairLog）进契约，实测只进了存档面（ARCHIVE_TOP_LEVEL_KEYS）；
//     · worldProg 整键（含十个子面：约定/伏笔/平行事实/秘密/回扣/回声/认知隔离/剧情弧）
//       在携带面两侧完全缺席——跨对话续写时它们静默留在旧对话。
//   本扫描把「存档面有、携带面无、且非显式豁免」的键从静默缺陷变成机检红灯。
//
// 判定（剥注释后静态抽取两个常量数组）：
//   P1 两个常量数组都能定位且规模合理（防探测器失效：下限由 fixtures 放宽）
//   P2 差集必须为空：ARCHIVE_TOP_LEVEL_KEYS ⊆ CARRYOVER_CONTRACT_KEYS ∪ CARRYOVER_EXEMPT_KEYS
//   P3 豁免表非空且每项带行内理由（注释），杜绝「一律豁免」式的自我豁免
//   P4 豁免表与契约表不得重叠（同一键不能既带走又豁免）
//   P5 独立面甄别（T5 复核）：`ledger` / `echo` 曾被怀疑与 `worldProg.echoLedger` /
//      `worldProg.recallEcho` 语义重叠。复核结论：**四方不同源** ——
//        · `ledger` = 宿主 `this.ledger`（FloorLedger，楼层账本「该楼提取了什么」）；
//        · `echo`   = 宿主 `this.echo`（回响池，life 计数是会话内衰减器）；
//        · `echoLedger` / `recallEcho` = worldProg 子面（回声账本 / 前文回扣模块），
//          宿主字段是 `this.echoLedger` / `this.recallEcho`（宿主**字段**，非子模块）。
//      「同源异名」只适用于 diaries↔diary、status↔statusFlat 那对。本条把复核固化成
//      可证伪形式：独立面的真源必须能在宿主里验证到，且豁免理由不得把它们说成同源。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1（放宽下限）/ LONSHA_AUDIT_ROOT（合成仓库）
import fs from 'fs';
import path from 'path';
import { stripComments } from '../_audit_lib.mjs';

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const idxPath = path.join(ROOT, 'index.js');
if (!fs.existsSync(idxPath)) {
    console.error('[carryover-archive-diff] 找不到 index.js（' + ROOT + '）');
    process.exit(2);
}
const idx = fs.readFileSync(idxPath, 'utf8');
const MIN_BYTES = FIXTURE_MODE ? 1 : 100000;
if (idx.length < MIN_BYTES) {
    console.error('[carryover-archive-diff] index.js 退化（' + idx.length + ' 字节），审计需同步结构变化');
    process.exit(2);
}
const clean = stripComments(idx);

/** 抽出 `const NAME = Object.freeze([ ... ]);` 里的字符串元素（剥注释后按引号取词）。 */
function keysOf(name) {
    const at = clean.indexOf('const ' + name + ' = Object.freeze([');
    if (at < 0) return null;
    const open = clean.indexOf('[', at);
    let depth = 0, end = -1;
    for (let i = open; i < clean.length; i++) {
        const ch = clean[i];
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return [...clean.slice(open, end).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map(m => m[1]);
}

const archive = keysOf('ARCHIVE_TOP_LEVEL_KEYS');
const contract = keysOf('CARRYOVER_CONTRACT_KEYS');
const exempt = keysOf('CARRYOVER_EXEMPT_KEYS');
const MIN_KEYS = FIXTURE_MODE ? 1 : 30;

const defects = [];
// ── P1 结构可定位 ──
if (!archive || archive.length < MIN_KEYS) {
    console.error('[carryover-archive-diff] ARCHIVE_TOP_LEVEL_KEYS 抽不出或退化（' +
        (archive ? archive.length : 'null') + '）——探测器失效');
    process.exit(2);
}
if (!contract || contract.length < MIN_KEYS) {
    console.error('[carryover-archive-diff] CARRYOVER_CONTRACT_KEYS 抽不出或退化（' +
        (contract ? contract.length : 'null') + '）——探测器失效');
    process.exit(2);
}
if (!exempt) {
    console.error('[carryover-archive-diff] CARRYOVER_EXEMPT_KEYS 不存在——豁免必须显式登记，不得静默');
    process.exit(2);
}

// ── P2 差集必须为空 ──
const covered = new Set([...contract, ...exempt]);
const missing = archive.filter(k => !covered.has(k));
if (missing.length) {
    defects.push('P2 存档面有、携带面无且未豁免的键 ' + missing.length + ' 个：' + missing.join('/') +
        '——跨对话续写时这些子系统静默留在旧对话');
}

// ── P3 豁免表非空且每项有理由 ──
if (!FIXTURE_MODE && exempt.length === 0) {
    defects.push('P3 豁免表为空——所有存档面键都应被携带或被显式豁免，空表说明豁免机制被架空');
}
// 理由判据只在**豁免表自身的行区间**里找（同名键在 ARCHIVE_TOP_LEVEL_KEYS 里也有，
//   全局找首行会命中无注释的那一处 → 把有理由的豁免误判成没理由）。
const allLines = idx.split('\n');
const exAt = allLines.findIndex(l => l.includes('CARRYOVER_EXEMPT_KEYS'));
const exEnd = allLines.findIndex((l, i) => i > exAt && l.trim() === ']);');
const exBlock = (exAt >= 0 && exEnd > exAt) ? allLines.slice(exAt, exEnd + 1) : [];
for (const k of exempt) {
    const rawLine = exBlock.find(l => new RegExp("^\\s*'" + k + "'\\s*[,]").test(l));
    if (!rawLine) {
        defects.push('P3 豁免项 ' + k + ' 不在豁免表行区内（抽取与行区不一致，结构漂移）');
        continue;
    }
    const m = /\/\/\s*(.+)$/.exec(rawLine);
    if (!m || m[1].trim().length < 4) {
        defects.push('P3 豁免项 ' + k + ' 没有行内理由（豁免必须写清为什么不该带）');
    }
}

// ── P4 豁免与契约不得重叠 ──
const overlap = exempt.filter(k => contract.includes(k));
if (overlap.length) {
    defects.push('P4 同一键既进契约又被豁免（自相矛盾）：' + overlap.join('/'));
}

// ── P5 独立面甄别（T5）：被怀疑重叠的两个豁免键，其真源必须可验证且不得被说成同源 ──
//   `ledger` / `echo` 的宿主是 this.ledger（FloorLedger）/ this.echo（回响池）；
//   `echoLedger` / `recallEcho` 是 worldProg 子面、宿主字段 this.echoLedger / this.recallEcho。
//   注：抽取面用**剥注释后**的 clean，避免命中的是解释性注释。
const INDEPENDENT = [
    { key: 'ledger', hostRe: /this\.ledger\s*=\s*new\s+FloorLedger/, why: '宿主 this.ledger = new FloorLedger' },
    { key: 'echo', hostRe: /echo:\s*this\.echo\?\.export/, why: '存档面的 echo 来自 this.echo.export()' },
];
const archAndContract = new Set([...archive, ...contract]);
for (const it of INDEPENDENT) {
    if (!exempt.includes(it.key)) continue; // 不再豁免就不适用
    if (archAndContract.has(it.key)) continue; // 已进携带面则不再适用（P2/P4 会管）
    if (!it.hostRe.test(clean)) {
        defects.push('P5 豁免键 ' + it.key + ' 的独立真源在宿主里验证不到（' + it.why
            + '）—— 「与 worldProg 子面不同源」的复核结论已失效，须重新甄别');
    }
}
//   理由不得把独立面说成同源：豁免表里 ledger/echo 的行不得出现「同源」字样。
for (const k of ['ledger', 'echo']) {
    if (!exempt.includes(k)) continue;
    const rawLine = exBlock.find(l => new RegExp("^\\s*'" + k + "'\\s*[,]").test(l)) || '';
    if (/同源/.test(rawLine)) {
        defects.push('P5 豁免项 ' + k + ' 的理由把它说成「同源异名」，但复核结论是独立面（真源见上）——'
            + '同源异名只适用于 diaries↔diary、status↔statusFlat');
    }
}

// ── 判据纯度自检：本文件不得重新声明被审的两个常量（判据只读真源，不自带副本）──
//   纯度检查读的是**本扫描器自身**，不是 index.js。
//   注意：禁止串必须由片段拼出——若把整串字面量写进本文件，判据会命中自己（自证陷阱）。
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const NAME_PARTS = ['ARCHIVE_TOP_LEVEL_KEYS', 'CARRYOVER_CONTRACT_KEYS', 'CARRYOVER_EXEMPT_KEYS'];
const SELF_CLEAN = stripComments(SELF);
for (const name of NAME_PARTS) {
    if (SELF_CLEAN.includes('const ' + name + ' =')) {
        console.error('[carryover-archive-diff] 判据纯度破坏：本文件不得重新声明 ' + name);
        process.exit(2);
    }
}

if (defects.length) {
    console.error('[carryover-archive-diff] 发现 ' + defects.length + ' 处缺陷：');
    for (const d of defects) console.error('  ✗ ' + d);
    process.exit(1);
}
console.log('[carryover-archive-diff] 卫生：存档面 ' + archive.length + ' 键 = 携带面 ' +
    contract.length + ' 键 + 豁免 ' + exempt.length + ' 键（差集为空）');
process.exit(0);