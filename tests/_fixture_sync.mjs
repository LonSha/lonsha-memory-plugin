/* ============================================================
 * tests/_fixture_sync.mjs —— 负控制夹具清单提取唯一真源 [v3.245.0]
 * ------------------------------------------------------------
 * 为什么存在（本轮实测，不是「整洁性偏好」）：
 *
 * ① 本仓的负控制纪律是「真源码破坏 → 独立 fixture 树 → 在副本上重跑同一套真判据」。
 *    这套做法的**唯一前提**是：fixture 树必须喂满被测门禁真正会读的那些文件。
 *    少喂一个 —— 门禁在 fixture 里提前走 fail-closed（exit 2），
 *    而那个 exit 2 会被负控制静默读成「结构漂移判据工作正常」。**空对空。**
 *
 * ② 这条教训本仓已经吃过两次，且两次都是**人工补救**：
 *      · v3.240.0：门禁把账本下限从 6 抬到 9，负控制自己先因「只找到 6 本账」
 *        exit 2，于是 V0–V5 全线报「破坏不可归因」——红的不是判据，是夹具；
 *      · v3.242.0：门禁新增 R7（登记表不得重复行）后，fixture 必须一并搬那张 TSV，
 *        否则 R7 在 fixture 里必然报「缺登记表」，同样被读成「判据工作正常」。
 *    两次的修法都是「把清单从门禁源码里提出来」（`scan_ledger_contract_negctl.mjs`），
 *    但**只改了那一处** —— 其余 12 个负控制仍然各自手抄文件名。
 *
 * ③ 手抄的后果是可测的，不是理论上的。本版开工前的实测（每份负控制「搬的文件」
 *    与「配对门禁真会读的文件」逐项对差）：
 *      · scan_ledger_contract_negctl 合上 TSV 后仍缺 6 本账
 *        （门禁把九本账全部登记进 R2/R3b 扫描面，fixture 只喂前三本 + 契约自己）；
 *      · scan_v3193_host_matrix_negctl 的 FILES 表是从 manifest 派生的（这一半对了），
 *        但门禁另有两处读 settings-ui.js / cost-ledger.js，fixture 一个都没搬；
 *      · scan_v3193_lexicon_drift_negctl 是裸 `snapshot()`（无清单可查），
 *        它搬对了是**恰好**搬对，不是结构上保证。
 *    三者当前**都跑绿** —— 因为缺的那些文件恰好不在各自判据会翻红的那条路径上。
 *    这正是本仓最怕的形态：「绿着，但绿的成因不是判据在守」。
 *
 * 落点说明：与 `tests/_audit_lib.mjs` 同一规范放在 `tests/` 下 —— 若放 `tests/audit/`，
 *   `tests/run.mjs` 的 `readdirSync(AUDIT_DIR).filter(f => f.endsWith('.mjs'))`
 *   会把它当审计脚本直接 node 执行，纯定义文件零调用即以 exit 0 判绿。
 *
 * 设计纪律（对齐本仓宪法）：
 *   · 只看代码：注释里写着文件名的解释性文字不是「消费」（一律先 stripComments）；
 *   · 只读：纯函数，无副作用，不写盘、不改入参、不抛；
 *   · 不猜：拿不准就**多报**（把候选交给调用方按 fail-closed 口径处置），
 *     本仓的老毛病是反过来 —— 用固定窗口 / 固定下标猜，猜错了还恒绿。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './_audit_lib.mjs';

/** 文件名候选：引号里的仓内相对路径（含扩展名）。刻意不认反引号 —— 路径拼接出来的名字不是清单。 */
export const FILE_RE = /'([A-Za-z0-9_][A-Za-z0-9_\-./]*\.(?:js|json|tsv|mjs))'/g;

/** 从源码里抽出全部文件名字面量（先剥注释：解释性文字里的名字不算消费） */
export function fileLits(src) {
    const out = new Set();
    const code = stripComments(String(src ?? ''));
    for (const m of code.matchAll(FILE_RE)) out.add(m[1]);
    return out;
}

/** 该名字是否真是仓（或 fixture 树）里的一个文件 */
export function repoExists(root, f) {
    try { return fs.existsSync(path.join(root, f)); } catch (_e) { return false; }
}

/**
 * 门禁里走「缺文件即 exit 2」的那些文件。
 *
 * 为什么必须单列：这些文件**不需要**进 fixture —— 负控制反而故意不搬它们，
 * 用来测门禁的 fail-closed 能力（结构漂移必须 exit 2 而不是静默放行）。
 * 把它们算成「夹具缺口」是把判据收窄到失真。
 *
 * 形态：`existsSync(<任意表达式，内含文件名>)`。用括号配对取实参，不靠正则猜结尾。
 */
export function failClosedOf(src) {
    const out = new Set();
    const code = stripComments(String(src ?? ''));
    const CALL = 'existsSync(';
    let at = code.indexOf(CALL);
    while (at >= 0) {
        const open = at + CALL.length - 1;   // 指向 '('
        let depth = 0;
        let end = -1;
        for (let i = open; i < code.length; i++) {
            const c = code[i];
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end < 0) break;
        for (const m of code.slice(open, end).matchAll(FILE_RE)) out.add(m[1]);
        at = code.indexOf(CALL, end);
    }
    return out;
}

/**
 * 门禁的「消费文件集」：源码里出现、且仓内真实存在的文件名字面量，减去 fail-closed 面。
 *
 * 为什么是「所有字面量」而不是「精读每个 readFileSync」：
 *   fixture 树要喂的是「门禁可能会去读的东西」。多喂一个文件不会让判据失真
 *   （门禁本来就不读它 ⇒ 无影响），少喂一个会让判据空对空。**不对称风险，
 *   故宁多勿少** —— 这与本仓「宁可少剥，不可少看」同一条纪律。
 */
export function gateFiles(root, gatePath) {
    let src = null;
    try { src = fs.readFileSync(gatePath, 'utf8'); } catch (_e) { return null; }
    const fc = failClosedOf(src);
    return [...fileLits(src)].filter((f) => repoExists(root, f) && !fc.has(f));
}

/**
 * 负控制「自己会复制/破坏的文件集」。
 *
 * 形态覆盖（都是本仓在用的写法）：
 *   · 数组常量：`const GAUGED = ['a.js', 'b.json']`、`const FILES = {k: 'a.js'}`（值也是字面量）
 *   · 单件常量：`const FLOOR = 'floor-ledger.js'`
 *   · 就地 join：`path.join(SRC, 'index.js')`、`fs.copyFileSync(SCAN, ...)`
 *   · 破坏目标：`mut('narrative-pulse.js', ...)`、`mutate(...)`
 * 上述全部落在「引号里的文件名字面量」这一种形态上 —— 故一条提取即够，
 *   不做「按变量名逐一识别」（那正是手抄换了个地方住）。
 */
export function fixtureFiles(root, negPath) {
    let src = null;
    try { src = fs.readFileSync(negPath, 'utf8'); } catch (_e) { return null; }
    return [...fileLits(src)].filter((f) => repoExists(root, f));
}

/** 负控制是否自称「从门禁源码提取清单」（v3.240.0 立的做法） */
export function isExtracting(negPath) {
    let src = null;
    try { src = fs.readFileSync(negPath, 'utf8'); } catch (_e) { return false; }
    const code = stripComments(src);
    return /从门禁源码|scanSrc|scanSource/.test(code);
}

/**
 * 负控制**实际会搬进 fixture 的文件集**（含运行时派生的部分）。
 *
 * 【为什么不能只数字面量】本版首跑就踩了这个坑：E2 对两份负控制各报一处缺口，
 *   而它们**结构上不可能有缺口** —— 因为它们的清单是**运行时派生**的：
 *     · scan_ledger_contract_negctl：从门禁源码里正则提取 BOOKS（v3.240.0 的修法）；
 *     · scan_v3193_host_matrix_negctl：从 manifest.json 派生 `[mf.js, ...mf.extra_js]`。
 *   两者源码里**没有**那些文件名（名字在别的文件里，运行时才被读出来），
 *   字面量提取当然看不见 —— 这正是「判据在量一个不是缺陷的东西」。
 *   判据要量的是「fixture 树里会不会有它」，故必须把派生来源一并算进来。
 *
 * 三类来源（全部是**结构性**判据，不做「看起来像」的猜测）：
 *   ① 源码字面量（手写清单）；
 *   ② 从门禁源码提取（清单与门禁同源 ⇒ 覆盖集就是门禁的消费集）；
 *   ③ 从 manifest.json 派生（门禁自己也读 manifest，故其消费的脚本都是 extra_js 成员）。
 *
 * @returns {Set<string>}
 */
export function effectiveCopies(root, negPath, gatePath) {
    const out = new Set(fixtureFiles(root, negPath) || []);
    let src = '';
    try { src = stripComments(fs.readFileSync(negPath, 'utf8')); } catch (_e) { return out; }

    // ② 从门禁源码提取：负控制搬的 = 门禁消费的
    if (isExtracting(negPath)) {
        for (const f of gateFiles(root, gatePath) || []) out.add(f);
    }
    // ③ 从 manifest 派生：`[mf.js].concat(mf.extra_js || [])` 一类写法
    if (/'manifest\.json'/.test(src) && /extra_js/.test(src) && /\.concat\(/.test(src)) {
        const mf = readManifest(root);
        if (mf) for (const f of [mf.js].concat(mf.extra_js || [])) if (f && repoExists(root, f)) out.add(f);
    }
    return out;
}

/** 读 manifest.json（读不到返回 null，由调用方按 fail-closed 分态） */
export function readManifest(root) {
    try { return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')); } catch (_e) { return null; }
}

/**
 * 一对（门禁 → 负控制）的夹具缺口。
 * @returns {{gate:string, neg:string, reads:string[], copies:string[], missing:string[]}|null}
 */
export function pairDiff(root, gatePath, negPath) {
    const reads = gateFiles(root, gatePath);
    if (reads == null) return null;
    const copies = fixtureFiles(root, negPath);
    if (copies == null) return null;
    const have = effectiveCopies(root, negPath, gatePath);
    return {
        gate: path.basename(gatePath),
        neg: path.basename(negPath),
        reads,
        copies,
        missing: reads.filter((f) => !have.has(f)),
    };
}

/** 目录下满足谓词的文件名（排序） */
export function listDir(dir, pred) {
    try { return fs.readdirSync(dir).filter(pred).sort(); } catch (_e) { return []; }
}

export default { FILE_RE, fileLits, repoExists, failClosedOf, gateFiles, fixtureFiles, isExtracting, pairDiff, listDir };