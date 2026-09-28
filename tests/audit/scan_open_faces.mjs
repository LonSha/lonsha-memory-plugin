#!/usr/bin/env node
/**
 * scan_open_faces.mjs — 跨仓外供功能登记表守卫（计划一「共同配套」第 2 条）
 *
 * 主题：上游→下游方向的外供面必须有**一处可查的登记**，且登记不得与磁盘漂移。
 *
 * 修前实测（不是推测）：跨仓面只有散点形态 —— 事件来源四态在一份 system 套件里、
 *   证据面三态在另一份里、下游基线 JSON 带冻结证据，而
 *   「全仓一共有几面外供 / 每面的失效条件 / 单独装一个仓会怎样」**没有一处能回答**。
 *   计划一「共同配套」第 2 条点名的就是这个；tests/audit/open_items_reconcile.md
 *   的未做表里逐字写着「无统一登记表」。
 *
 * 为什么这张表能守（而不是「又一份必然烂掉的文档」）：
 *   表格是**数据**，两侧都能被判：
 *     · 登记的模块/符号在磁盘上消失 ⇒ 红（退位项）；
 *     · 模块不在分发面（manifest.js / extra_js）⇒ 红（宿主压根不会加载它）；
 *     · 有外供面而没登记 ⇒ 由 tests/v3253 的双向量判（symbolHasFace）；
 *     · consumer 列两种语法混用 ⇒ 红（口径只能一处）；
 *     · 失效条件列未把「缺席/旧版/不产出/空数据」四态分别呈现 ⇒ 红（计划原话）；
 *     · 「缺席与空如何不同形」未列出至少两种态 ⇒ 红（本仓最贵的老账：不得同形）。
 *
 * 边界（**显式声明，不装**）：
 *   · consumer 列是**声明**，本脚本不跨仓核实（下游是另一个仓库、另有自己的门禁）；
 *     真核实挂在下游 scripts/bridge-contract-audit.mjs 的 J8/J10/J11/J12
 *     （按面分别设产品侧消费点下限、按文件去重、fail-closed）。
 *     本脚本只把**下限数字**登记下来，供人工对照。
 *   · 本脚本自身**版本无关**：脚本体里不出现任何 3.x.y 字面量。
 *
 * 退出码：0 无问题；1 有缺陷（附逐条明细）；2 fail-closed（前置读不到）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../_audit_lib.mjs';

/** 列定义（表头里逐字写明的九列，顺序即契约）。 */
export const COLS = ['face', 'owner', 'producer_version', 'upstream_symbol', 'contract_shape',
    'consumer', 'invalid_conditions', 'standalone_behavior', 'absent_vs_empty'];

/** 计划原话点名的四种错法：必须**分别**呈现，压成一态就是错读数。 */
export const INVALID_STATES = ['缺席', '旧版', '不产出', '空数据'];

/* 单个反斜杠。拼正则一律走它 —— 反斜杠在普通字符串字面量里会被吃掉
 *   （一个小写 s 会被当成 s），而那种错“看起来已经修好了”，
 *   正是本仓所说的“补丁声称已修不等于已修”。 */
const B = String.fromCharCode(92);

/** 解析：注释 # 行与空行跳过（表头块也是 # 注释，故意如此 —— 表可自解释）。 */
export function parseRows(raw) {
    const rows = [];
    const problems = [];
    for (const line of String(raw).split(String.fromCharCode(10))) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const cols = t.split(String.fromCharCode(9)).map((c) => c.trim());
        if (cols.length !== COLS.length) {
            problems.push('T1 列数不符（应 ' + COLS.length + '，实 ' + cols.length + '）：' + t.slice(0, 70));
            continue;
        }
        const rec = {};
        COLS.forEach((c, i) => { rec[c] = cols[i]; });
        rows.push(rec);
    }
    return { rows, problems };
}

/** T1：面标识唯一 + 每格非空 + 版本形态 + 归属仓。 */
export function judgeTable(rows) {
    const problems = [];
    const seen = new Set();
    for (const r of rows) {
        if (seen.has(r.face)) problems.push('T1 face 重复：' + r.face);
        seen.add(r.face);
        for (const c of COLS) {
            if (!r[c]) problems.push('T1 ' + r.face + ' 的 ' + c + ' 为空（登记不许留白）');
        }
        const verRe = new RegExp('^v' + '[0-9]+' + B + '.[0-9]+' + B + '.[0-9]+$');
        if (!verRe.test(r.producer_version || '')) {
            problems.push('T1 ' + r.face + ' 的 producer_version 形态非法：' + r.producer_version);
        }
        if (r.owner !== 'lonsha-memory-plugin') {
            problems.push('T1 ' + r.face + ' 的 owner 不是本仓：' + r.owner);
        }
    }
    return problems;
}

/** 行里声明的模块名（用于「缺行」双向量；格式非法时返回空串）。 */
export function faceModule(sym) {
    const parts = String(sym || '').split('::');
    return parts.length === 2 ? parts[0] : '';
}

/** 该模块是否被任一行登记（v3253 用它判「有面了但没补行」）。 */
export function symbolHasFace(rows, moduleFile) {
    return rows.some((r) => faceModule(r.upstream_symbol) === moduleFile);
}

/** 分发面：manifest 的 js / extra_js（宿主**按文件名**加载的清单，无路径）。 */
export function distributionFace(manifest) {
    const set = new Set();
    if (manifest && typeof manifest.js === 'string') set.add(manifest.js);
    if (manifest && Array.isArray(manifest.extra_js)) {
        for (const f of manifest.extra_js) set.add(String(f));
    }
    return set;
}

/**
 * T2：符号**真在场**（退位项检查）——登记的每个符号必须在磁盘上出现。
 *   为什么必须做：登记表最容易的死法是「模块改名/退役后表里留着旧名」——
 *   那时表还绿、门也绿，而实际那面已经没了（比没有表更坏：它给出错误的安心）。
 *   符号判定做在**剥注释后的代码**上（注释里提一句同名符号不算在场）。
 */
export function judgeSymbols(rows, root) {
    const problems = [];
    for (const r of rows) {
        const mod = faceModule(r.upstream_symbol);
        if (!mod) { problems.push('T2 ' + r.face + ' 的 upstream_symbol 缺 :: 分隔：' + r.upstream_symbol); continue; }
        const p = path.join(root, mod);
        if (!fs.existsSync(p)) { problems.push('T2 ' + r.face + ' 登记的模块不在磁盘：' + mod); continue; }
        let code;
        try { code = stripComments(fs.readFileSync(p, 'utf-8')); }
        catch (_e) { problems.push('T2 ' + r.face + ' 读不到模块：' + mod); continue; }
        const syms = String(r.upstream_symbol).split('::')[1].split(',').map((s) => s.trim()).filter(Boolean);
        if (syms.length === 0) { problems.push('T2 ' + r.face + ' 未登记任何符号'); continue; }
        for (const sym of syms) {
            /* 四种定义形态都要认，否则会对**真在场**的符号误报：
             *   `function foo(` ｜ `const foo =` ｜ `export function|const foo` ｜ `foo(`,
             *   最后一种是**类方法简写** —— index.js 里所有外供面都是这个形态
             *   （只有 `name(..) {`，没有 function 关键字）。 */
            const asFn = new RegExp('function' + B + 's+' + sym + B + 's*' + B + '(');
            const asConst = new RegExp('const' + B + 's+' + sym + B + 's*=');
            const asExport = new RegExp('export' + B + 's+(?:function' + B + 's+|const' + B + 's+)' + sym + B + 'b');
            const asMethod = new RegExp('^' + B + 's*(?:static' + B + 's+|async' + B + 's+)*(?:' + sym + ')' + B + 's*' + B + '(', 'm');
            if (!asFn.test(code) && !asConst.test(code) && !asExport.test(code) && !asMethod.test(code)) {
                problems.push('T2 ' + r.face + ' 登记的符号在 ' + mod + ' 里找不到定义：' + sym);
            }
        }
    }
    return problems;
}

/**
 * T3：面必须在**分发面**上。
 *   为什么：宿主只加载 manifest 列出的文件（按文件名），一个面即使代码写完了、
 *   不在分发面，用户那边**永远看不到** —— 「建好了但没上线」与「没建」在用户侧同形，
 *   而登记表若不管这点就会替它背书。
 */
export function judgeDistribution(rows, manifest) {
    const face = distributionFace(manifest);
    const problems = [];
    for (const r of rows) {
        const mod = faceModule(r.upstream_symbol);
        if (mod && !face.has(mod)) {
            problems.push('T3 ' + r.face + ' 的模块不在分发面（manifest.js / extra_js）：' + mod);
        }
    }
    return problems;
}

/**
 * T4：consumer 列的语法只能两种 —— `<读出口名>@<产品侧消费点下限>` 或 `none@0`。
 *   为什么收得这么紧：这一列是本表唯一「跨仓」的味道，一旦允许自由文本，
 *   它就会从「可用数字对照的声明」退化成「一句人话」——而人话不会被任何门禁接住。
 *   数字口径与下游 bridge-contract-audit 各 J 的 MIN_CONSUMERS 对齐（下游按面分别设限）。
 */
export function judgeConsumers(rows) {
    const problems = [];
    const re = new RegExp('^([A-Za-z_][A-Za-z0-9_]*|none)@([0-9]+)$');
    for (const r of rows) {
        const m = re.exec(r.consumer || '');
        if (!m) { problems.push('T4 ' + r.face + ' 的 consumer 语法非法（应 name@N 或 none@0）：' + r.consumer); continue; }
        if (m[1] === 'none' && Number(m[2]) !== 0) {
            problems.push('T4 ' + r.face + ' 声明 none 但下限不为 0：' + r.consumer);
        }
        if (m[1] !== 'none' && Number(m[2]) < 1) {
            problems.push('T4 ' + r.face + ' 声明了消费出口但下限为 0（等于没有消费点）：' + r.consumer);
        }
    }
    return problems;
}

/**
 * T5：计划原话要求「缺席 · 旧版 · 不产出 · 空数据**分别呈现**」。
 *   四态压成一态就是错读数（本仓最贵的老账），故这一列必须逐字含四个词。
 */
export function judgeInvalidStates(rows) {
    const problems = [];
    for (const r of rows) {
        const s = String(r.invalid_conditions || '');
        const miss = INVALID_STATES.filter((w) => !s.includes(w));
        if (miss.length) {
            problems.push('T5 ' + r.face + ' 的失效条件未分别呈现四态，缺：' + miss.join('、'));
        }
    }
    return problems;
}

/**
 * T6：「缺席与空如何不同形」必须真的说出**两种以上**态词。
 *   为什么单列一条：这一列是本表里最容易被写成「已分态」三个字的地方 ——
 *   而「已分态」既不是判据也不是读数。按分隔符切开数，少于 2 段即视为没分。
 */
export function judgeAbsentVsEmpty(rows) {
    const problems = [];
    const sep = new RegExp('[|｜/]');
    for (const r of rows) {
        const s = String(r.absent_vs_empty || '');
        const parts = s.split(sep).map((x) => x.trim()).filter(Boolean);
        if (parts.length < 2) {
            problems.push('T6 ' + r.face + ' 的 absent_vs_empty 未列出两种以上态（分不开就不算分）：' + s.slice(0, 60));
        }
    }
    return problems;
}
/** 全量判据（供门禁主入口与常驻套件共用 —— 同一份判据，不各写一份）。 */
export function runAll(root) {
    const tablePath = path.join(root, 'tests', 'audit', 'open_face_registry.tsv');
    let raw = null;
    try { raw = fs.readFileSync(tablePath, 'utf-8'); } catch (_e) { raw = null; }
    if (raw == null) return { fatal: '登记表缺失：' + tablePath, rows: [], problems: [] };
    const manifestPath = path.join(root, 'manifest.json');
    let manifest = null;
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); }
    catch (_e) { return { fatal: 'manifest.json 读不到或不是合法 JSON', rows: [], problems: [] }; }
    const parsed = parseRows(raw);
    if (parsed.rows.length === 0) return { fatal: '登记表为空（扫描面不可信）', rows: [], problems: [] };
    const problems = []
        .concat(parsed.problems, judgeTable(parsed.rows), judgeSymbols(parsed.rows, root),
            judgeDistribution(parsed.rows, manifest), judgeConsumers(parsed.rows),
            judgeInvalidStates(parsed.rows), judgeAbsentVsEmpty(parsed.rows));
    return { fatal: null, rows: parsed.rows, problems };
}

/* ── 主入口：只在**直接执行**时跑，被 import 时不跑（v3226 等套件要 import 判据纯函数）。
 *   判据与入口分开写，是为了同一份判据既当门禁又当测试判据（各写一份必然漂移）。 */
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
    const { fatal, rows, problems } = runAll(ROOT);
    if (fatal) { console.error('[open-faces] ' + fatal); process.exit(2); }
    console.log('=== 跨仓外供登记表：' + rows.length + ' 面 / 问题 ' + problems.length + ' ===');
    for (const r of rows) {
        console.log('  · ' + r.face + ' （' + r.owner + ' ' + r.producer_version + '） → ' + r.consumer);
    }
    if (problems.length) {
        for (const p of problems) console.error('  ✗ ' + p);
        console.error('[open-faces] 发现 ' + problems.length + ' 处。');
        process.exit(1);
    }
    process.exit(0);
}