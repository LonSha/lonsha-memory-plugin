// 审计基建 E（v3.245.0）：夹具同步面 —— 「判据吃的药，负控制也得吃同一份」
// ------------------------------------------------------------
// 为什么存在（计划 #2「负控制夹具自动同步」）：
//   本仓有一整套负控制（13 份 *_negctl 挂在审计面 + 12 个门禁的负控制落在测试套件里）。
//   它们的做法统一是「真源码破坏 → 独立 fixture 树 → 在副本上重跑同一套真判据」。
//   这套做法的**唯一前提**是 fixture 树喂满了门禁真正会读的文件。
//
//   这条教训本仓吃过两次，且两次都是人工补救的单点修复：
//     · v3.240.0 门禁把账本下限 6→9，负控制自己先因「只找到 6 本账」exit 2，
//       V0–V5 全线报「破坏不可归因」——红的不是判据，是夹具；
//     · v3.242.0 门禁新增 R7（登记表不得重复行），fixture 必须一并搬那张 TSV。
//   两次都只改了 scan_ledger_contract_negctl 一处，其余 12 份仍然手抄文件名。
//
//   本门禁把那两次的修法升格为**常驻结构判据**：清单不再由谁记得去同步，
//   而是每次都从门禁源码与负控制源码里**各自提取**、当场对差。
//
// 判据：
//   E1 结构：审计面存在成对文件；对数不低于下限；本脚本自身 fail-closed
//   E2 夹具同步：逐对「门禁消费集 − 负控制可复制集」必须为空（fail-closed 面除外）
//   E3 卫生态对照：每份负控制必须有一组「原版对照」——
//      只验「破坏会翻红」而不验「原版是绿的」，会把「破坏写死成模拟常量」判成绿
//   E4 门禁覆盖：每个门禁要么有配对负控制，要么在测试套件里被真源码破坏引用——
//      否则它的判据恒绿与否**没有任何观测点**
//   E5 活性面：审计脚本数必须由目录真值点出，且与调用方（run.mjs）的发现口径一致
//   E6 自证：判据段数、归因串声明与调用点两向同名
// 退出码：0=卫生  1=存在真缺陷（夹具缺口/无卫生态对照/门禁无观测点/活性面失真）  2=结构漂移（唯一真源不可加载/导出面缺项/成对数不足/目录读数失真）
// [v3.247.0 留痕] 上一版自述只写「0 / 1」，而代码里 `process.exit(2)` 是 fail-closed 路径 —— 自述漏了一整态。
//        2=结构漂移（探测对象不在，负控制无从建立）
// 夹具通道：LONSHA_FIXTURE_SYNC_ROOT 指向合成仓库（本门禁自身的单测用）。
// 唯一真源按**动态加载 + 导出面逐项核对**取用：被掏空/缺失/改写成非函数时如实 exit 2，
//   而不是崩在 ESM 加载栈上（v3226 的 T 档形态实测过这一条）。
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/* 唯一真源**动态加载**（不是静态 import）—— 本版实测的理由：
 *   真源本身也在 `tests/*.mjs` 面里。v3226 的 T 档形态（把 tests/ 下的 .mjs 全部置为 `// gutted`）
 *   实测：静态 import 一个被掏空的模块 ⇒ **进程崩在 ESM 加载栈上（exit 1）**，
 *   任何判据都来不及跑，归因不可读。而本仓纪律是「结构漂移必须如实 exit 2 并说清为什么」。
 *   故：动态加载 + 导出面逐项核对，缺一即 exit 2。 */
let LIB = null;
try { LIB = await import('../_fixture_sync.mjs'); }
catch (e) {
    console.error('[fixture-sync] 唯一真源不可加载（tests/_fixture_sync.mjs）：'
        + (e && e.message) + ' ——结构漂移');
    process.exit(2);
}
const LIB_API = ['gateFiles', 'fixtureFiles', 'effectiveCopies', 'isExtracting', 'failClosedOf', 'fileLits', 'listDir', 'pairDiff'];
for (const k of LIB_API) {
    if (typeof LIB[k] !== 'function') {
        console.error('[fixture-sync] 唯一真源缺导出 ' + k + '（被掏空或改写成非函数）——结构漂移');
        process.exit(2);
    }
}
const { gateFiles, fixtureFiles, effectiveCopies, isExtracting, failClosedOf, fileLits, listDir, readManifest, pairDiff } = LIB;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_FIXTURE_SYNC_ROOT || path.resolve(HERE, '..', '..');
/** 夹具树最小对数：低于此值说明扫描面不可信（探测器失效不得当「没问题」） */
const MIN_PAIRS = 10;
/** 审计脚本最小数：低于此值说明目录读数失真 */
const MIN_AUDIT_SCRIPTS = 30;
/* [v3.247.0] 整树复制夹具的门禁登记面（唯一可写点在真源 tests/_fixture_sync.mjs）。
 *   为什么 E2 要分两形态：「按清单搬文件」的负控制可以用「清单 ⊇ 消费集」判；
 *   但**整树复制**的负控制源码里只有目录名，字面量提取必然报缺（判据在量一个不是缺陷的东西）。
 *   分形态之后不能只「多报即忽略」——那样整树复制若造出一棵让门禁 fail-closed 的树也没人看得见。
 *   故登记形态改判**行为**：真跑一次探针，门禁必须 exit 0。 */
const MIRROR_GATES = (() => {
    try { return LIB.MIRROR_GATES && typeof LIB.MIRROR_GATES === 'object' ? LIB.MIRROR_GATES : {}; } catch (_e) { return {}; }
})();

const SELF = fileURLToPath(import.meta.url);

/**
 * 整树复制夹具的**行为探针**（v3.247.0）：真跑一次，门禁在镜像根上必须 exit 0。
 *
 * 为什么必须有它：登记之后若只把缺口清空，等于把判据关掉 —— 整树复制同样可能造出一棵
 *   让门禁走 fail-closed 的树（少了 _break_kit.mjs / run.mjs / 审计面），而那个 exit 2
 *   会被观测器读成「结构漂移判据工作正常」。探针把「结构缺口」换成「行为读数」。
 * 成本：实测整仓复制 1.18s；本门禁每次执行只做一次探针（登记的整树门禁只有 1 个）。
 */
function mirrorProbe(gate) {
    let dir = null;
    try {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fxmirror-'));
        fs.cpSync(ROOT, dir, {
            recursive: true,
            filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p),
        });
        /* env 必须**清掉夹具通道**：本门禁自己可能正被另一个夹具驱动
         *   （例如 v3245 用 LONSHA_FIXTURE_SYNC_ROOT 指向合成树），
         *   若不摘掉，探针里的门禁会读那棵树而不是镜像 —— 探针就成了空对空。 */
        const env = Object.assign({}, process.env);
        delete env.LONSHA_FIXTURE_SYNC_ROOT;
        delete env.LONSHA_BREAK_KIT_HOME;
        delete env.LONSHA_EXITCODES_ROOT;
        const r = spawnSync(process.execPath, [path.join('tests', 'audit', gate)], {
            cwd: dir, encoding: 'utf-8', timeout: 600000, env,
        });
        return { ok: r.status === 0, status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    } catch (e) {
        return { ok: false, status: '异常', out: String((e && e.message) || e) };
    } finally {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
}
function bail(msg) {
    console.error('[fixture-sync] ' + msg);
    process.exit(2);
}
function readOrNull(p) {
    try { return fs.readFileSync(p, 'utf-8'); } catch (_e) { return null; }
}

/* ---------- 0. 结构预检（fail-closed） ---------- */
const AUDIT_DIR = path.join(ROOT, 'tests', 'audit');
if (!fs.existsSync(AUDIT_DIR)) bail('找不到 tests/audit（工作目录可能不对：' + ROOT + '）');
const TESTS_DIR = path.join(ROOT, 'tests');
if (!fs.existsSync(TESTS_DIR)) bail('找不到 tests/');

const auditScripts = listDir(AUDIT_DIR, (f) => f.endsWith('.mjs') && !f.startsWith('_'));
if (auditScripts.length < MIN_AUDIT_SCRIPTS) {
    bail('审计脚本只找到 ' + auditScripts.length + ' 个（下限 ' + MIN_AUDIT_SCRIPTS + '）：扫描面不可信');
}
/* 活性面：run.mjs 必须仍按目录发现脚本 —— 读数与调用方口径同源。
 *   为什么单列：脚本数若写死在调用方，本门禁报 42 而实际跑 40 也没人看得见。 */
const runnerSrc = readOrNull(path.join(TESTS_DIR, 'run.mjs'));
if (runnerSrc == null) bail('找不到 tests/run.mjs —— 活性面读数失去调用方');
if (!/readdirSync\(AUDIT_DIR\)\.filter\(f => f\.endsWith\('\.mjs'\) && !f\.startsWith\('_'\)\)/.test(runnerSrc)) {
    bail('run.mjs 的审计脚本发现口径已变（不再按目录 + 下划线前缀过滤）：本门禁的读数与调用方不同源');
}

const negctlNames = auditScripts.filter((f) => f.includes('negctl'));
/* 门禁 = scan_* 且**不是**负控制自己。
 *   【留痕】首跑写成 `filter(f => f.startsWith('scan_'))` —— 于是每份负控制也被当成
 *   「需要观测点的门禁」，一口气报出 10 条荒谬缺陷（谁去观测负控制的负控制？）。
 *   判据的集合划分要先想清楚「谁是谁的观测对象」，再写过滤条件。 */
const gateNames = auditScripts.filter((f) => f.startsWith('scan_') && !f.includes('negctl'));

/* ---------- E1 结构：成对文件 ---------- */
const defects = [];
const notes = [];
const pairs = [];
/* 全量成对，不做「够数即停」—— 少看当通过正是本仓要堵的形态。 */
for (const n of negctlNames) {
    const gate = n.replace('_negctl.mjs', '.mjs');
    if (gateNames.includes(gate)) pairs.push([gate, n]);
}
if (pairs.length < MIN_PAIRS) {
    bail('成对（门禁 ↔ 负控制）只找到 ' + pairs.length + ' 对（下限 ' + MIN_PAIRS
        + '）：夹具同步面不可信，负控制被改名或删除');
}

/* ---------- E2 夹具同步：逐对对差 ---------- */
/* 对差用的「覆盖集」必须含**运行时派生**的清单（见 _fixture_sync.effectiveCopies）。
 *   【留痕】首跑只用字面量，于是对两份**结构上不可能有缺口**的负控制各报一处缺口：
 *   它们的清单分别从门禁源码正则提取、从 manifest 的 extra_js 派生 ——
 *   源码里根本没有那些文件名，字面量提取当然看不见。
 *   判据要量的是「fixture 树里会不会有它」，不是「源码里写没写它的名字」。 */
const rows = [];
for (const [gate, neg] of pairs) {
    const gp = path.join(AUDIT_DIR, gate);
    const np = path.join(AUDIT_DIR, neg);
    let reads = null;
    try { reads = gateFiles(ROOT, gp); } catch (e) { reads = null; }
    if (reads == null) bail('读不到门禁 ' + gate + '（真源不在，判据无从谈起）');
    let have = null;
    try { have = effectiveCopies(ROOT, np, gp); } catch (e) { have = null; }
    if (have == null) bail('读不到负控制 ' + neg);
    const lits = fixtureFiles(ROOT, np) || [];
    const derived = isExtracting(np) ? '（清单从门禁源码提取）'
        : (/'manifest\.json'/.test(readOrNull(np) || '') && /extra_js/.test(readOrNull(np) || '') ? '（清单从 manifest 派生）' : '（手写清单）');
    /* 缺口读数取自**唯一真源**的 pairDiff（不在门禁侧重复一份口径）：
     *   真源已内建「整树复制 + 已登记 ⇒ 无缺口」的语义，三处调用方因此同源。 */
    const pd = pairDiff(ROOT, gp, np);
    const d = { gate, neg, reads, missing: pd ? pd.missing : [], have, lits, derived, probe: null };
    const isMirror = !!(pd && pd.isMirror);
    if (MIRROR_GATES[gate]) {
        /* 登记形态：判据**不停**，改判行为（探针）—— 清单口径对本形态恒误报，
         *   但「整树复制是否喂满了门禁」仍是真问题（少了关键文件时门禁会 fail-closed，
         *   而那个 exit 2 会被观测器读成「判据工作正常」，空对空）。 */
        d.probe = mirrorProbe(gate);
        d.missing = [];
        notes.push('E2 ' + neg + ' 走**整树复制**（已登记）：改判探针 —— '
            + (d.probe.ok ? '门禁在镜像上 exit 0（夹具喂满了它要读的东西）' : '门禁在镜像上 exit ' + d.probe.status + '（夹具机制对该门禁是坏的）'));
        if (!d.probe.ok) {
            defects.push('E2 ' + neg + ' 的整树复制夹具探针失败：门禁在镜像上 exit ' + d.probe.status
                + '（期望 0）—— 这套夹具对该门禁是坏的，观测器读到的会是「fail-closed 判据工作正常」（空对空）'
                + '\n    ' + (d.probe.out || '').slice(-300));
        }
    } else if (isMirror) {
        defects.push('E2 ' + neg + ' 用了整树复制（cpSync recursive）却未在真源 MIRROR_GATES 登记：'
            + '登记面是唯一可写点，理由是「为什么整树复制对这个门禁是必要的」；未登记即无从判断这套夹具是否喂满了门禁');
    }
    if (d.missing.length) {
        defects.push('E2 ' + neg + ' 的夹具缺 ' + d.missing.length + ' 个门禁会读的文件：'
            + d.missing.join('、')
            + ' —— 门禁在 fixture 里会走 fail-closed（exit 2），'
            + '而那个 exit 2 会被负控制读成「结构漂移判据工作正常」（空对空）');
    }
    rows.push(d);
}

/* ---------- E3 卫生态对照：每份负控制必须验「原版是绿的」 ---------- */
/* 形态：负控制里必须出现「原版对照」的判据点 —— 期望退出码 0 的那一组，
 *   或独立写出的卫生态探针（`原版必须绿` / `原版对照` / `base.code !== 0` 一类）。
 *   只验破坏翻红是不够的：破坏若被写成模拟常量，真判据根本没被调用，照样「翻红」。 */
const HYGIENE_RE = /原版对照|原版绿|原版必须绿|base\.code\s*!==\s*0|卫生态/;
for (const [gate, neg] of pairs) {
    const src = readOrNull(path.join(AUDIT_DIR, neg)) || '';
    if (!HYGIENE_RE.test(src)) {
        defects.push('E3 ' + neg + ' 没有「原版对照」组（只验破坏翻红、不验卫生态绿）'
            + ' —— 破坏被写成模拟常量时，真判据根本没被调用，负控制照样绿');
    }
}

/* ---------- E4 门禁覆盖：每个门禁都得有观测点 ---------- */
/* 门禁的判据恒绿与否，必须有人在观测：
 *   · 有配对负控制（上面对差已覆盖）；或
 *   · 在测试套件里被「真源码破坏」引用（破坏 + 真跑）。
 * 两者都没有 ⇒ 这个门禁无论返回什么，全仓没有一处会因为它的判据失效而变红。 */
const testFiles = listDir(TESTS_DIR, (f) => f.endsWith('.test.mjs'));
const testSources = testFiles.map((f) => [f, readOrNull(path.join(TESTS_DIR, f)) || '']);
const pairedGates = new Set(pairs.map(([g]) => g));
const BREAK_RE = /breakSource|loadBroken|\.replace\(|writeFileSync|mutate\(|breakText\(/;
for (const gate of gateNames) {
    if (pairedGates.has(gate)) continue;
    const stem = gate.replace('.mjs', '');
    const hit = testSources.filter(([, s]) => s.includes(gate) || s.includes(stem));
    const breaking = hit.filter(([, s]) => BREAK_RE.test(s));
    if (!breaking.length) {
        defects.push('E4 ' + gate + ' 没有观测点：既无配对负控制，也没有任何测试套件在它身上做真源码破坏'
            + (hit.length ? '（引用了它的套件 ' + hit.length + ' 个，但都不含破坏）' : '（零引用）')
            + ' —— 它的判据无论恒绿与否都没人看得见');
    } else {
        notes.push('E4 ' + gate + ' 的观测点在测试套件：' + breaking.slice(0, 2).map(([f]) => f).join('、')
            + (breaking.length > 2 ? ' 等 ' + breaking.length + ' 个' : ''));
    }
}

/* ---------- E5 活性面读数（目录真值） ---------- */
const runnerCount = auditScripts.length;
const dashCount = auditScripts.filter((f) => f.startsWith('_')).length;
notes.push('E5 审计脚本 ' + runnerCount + ' 个（含负控制 ' + negctlNames.length
    + ' 份 / 门禁 ' + gateNames.length + ' 份）｜下划线前缀 ' + dashCount + ' 个（不参与执行）');

/* ---------- E6 自证：段数与归因串两向同名 ---------- */
const selfSrc = readOrNull(SELF) || '';
/* 段数自证：判据段被整段删掉/改名，说明本门禁被削弱过。
 *   【留痕】首跑写成 `/^\/\* ---------- (\d)\./`（只认**数字**段号），
 *   而本文件的 E1–E6 段号是字母 ⇒ 数出 1 段、自证当场翻红。
 *   判据对「自己」也要按同一口径数：段是「以 `/* ---------- ` 开头的块」，与段号用什么字符无关。 */
const EXPECT_SECTIONS = 8;
const sectionCount = [...selfSrc.matchAll(/^\/\* ---------- /gm)].length;
if (sectionCount !== EXPECT_SECTIONS) {
    bail('判据自证失败：段数 ' + sectionCount + ' ≠ ' + EXPECT_SECTIONS + '（判据被删/改名即失去自证）');
}
const ATTR = ['E2 ', 'E3 ', 'E4 '];
for (const a of ATTR) {
    const n = selfSrc.split("'" + a).length - 1;
    if (n < 2) bail('判据自证失败：归因串「' + a + '」出现 ' + n + ' 次（需 ≥2：声明 + 调用点）');
}

/* ---------- 报告 ---------- */
console.log('=== 夹具同步面 ===');
console.log('扫描面：审计脚本 ' + runnerCount + ' 个 ｜ 成对（门禁 ↔ 负控制）' + pairs.length + ' 对');
for (const d of rows) {
    console.log('  ' + d.neg.padEnd(46) + 'gate 消费 ' + String(d.reads.length).padStart(2)
        + ' 项 ｜ 有效覆盖 ' + d.have.size + ' 项 ' + d.derived + ' ｜ 缺口 ' + d.missing.length);
}
for (const n of notes) console.log('  · ' + n);
if (defects.length) {
    console.error('');
    for (const d of defects) console.error('[fixture-sync] ' + d);
    console.error('');
    console.error('[fixture-sync] 失败：夹具同步面存在 ' + defects.length + ' 项缺陷。');
    process.exit(1);
}
console.log('[fixture-sync] 通过：' + pairs.length + ' 对负控制的夹具与门禁同源（无缺口），'
    + '每份都有卫生态对照，每个门禁都有观测点，活性面由目录真值点出。');
process.exit(0);