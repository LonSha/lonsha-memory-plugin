// tests/v3284_o7_audit_copy_ledger.test.mjs — v3.284.0 O7 第四项（续四）：审计面副本
// 主题：**`tests/audit/` 内部的逐字副本** —— v3280/v3281/v3282/v3283 四档全不吃这个面。
//
//   【为什么本档存在（真缺口，本轮实测）】
//     O7 到此的四层副本判据，**枚举面全部是「仓库根级 .js」**：
//       · v3280 宿主 index.js ↔ 根级模块；
//       · v3281 根级模块两两；
//       · v3282 别名簇（`fs.readdirSync(ROOT)` + `.js` 过滤）；
//       · v3283 常量表（同上）。
//     `tests/` 目录**整个不在任何一档的枚举面内**，`tests/audit/*.mjs` 尤其危险：
//     那 58 个文件是**探测器的实现**，不是被测对象 —— 它们自己腐化时，没有任何判据会响。
//
//     **实测证伪（本轮跑过）**：把 `scan_v3193_lexicon_drift_negctl.mjs` 的
//     `runAt` 里 `e.status == null ? -1 : e.status` 改成 `(e.status ?? -1)`
//     （值级漂移、语义等价）⇒ `node tests/run.mjs --audit` **55/55 仍全绿**。
//     而这段 `runAt` 在 **5 个 negctl 档**里逐字复制了 5 份 ——
//     改一处、漏四处，四面门禁照样全绿。
//     这比 v3.283.0 更尖锐：**探测器的实现若在副本间漂移，探测器给出的结论本身就该被怀疑**。
//
//   【本档登记（9 簇，实测逐字相同；体长 ≥ 40）】
//     名字                       成员数  体长  md5
//     mutate                     2       640   3460e9a2
//     extractMethod              2       399   cf7b47d4
//     methodBody                 2       328   69503fb4
//     runAt / runScanAt          5       314   72230cdf
//     extractBlock               3       238   14de97bf
//     distributionFace / …       2       218   7fd61df8
//     downstreamModule / …       2       91    3d714a19
//     readOrNull                 2       75    3501fac1
//     read / readOrNull          2       74    b7ad68f6
//
//   【判据（fail-closed）】
//     A  枚举面：audit 面 .mjs 文件数下限 + function 体枚举下限 + 跨文件簇下限
//        （枚举失效时「0 簇」会伪装成卫生）
//     B1 新增未登记簇即红；B2 登记项漂移/消失即红（点名 + 带 md5）；
//        B2b 成员集合变化即红（点名掉出去/新进来的文件 + 带 md5）；B2c 名字集合变化即红
//     C1/C2 **改文件里的声明名** ⇒ 名字集合变（B2c）—— 名字也是被登记的事实；
//     C3 **凭空把一份唯一实现复制到新档** ⇒ 该体现在跨档 ⇒ 新键 ⇒ B1；
//     C4/C5/C6 **只改一档的体内一行**（值级漂移）⇒ 该体不再与其余档同体 ⇒ 成员集合缩水（B2b）
//     D  工具两向自证（breakSource 的 0 次、同值替换必抛；原版判据真、破坏副本真红）
//     E  判据纯度 H5：每个锚点字面量在本档只有一个持有常量 + 本档锚点声明序 + 单命中
//        + **体内锚点的面内命中数须恰等于各簇成员数**（B3/C4/C5/C6 的先决条件，当场钉住）
//     F  自防护 + 三源同源 + 当版锚点
//
//   【关键区分（实测得来，不是想当然）】
//     簇的**成员**按**体**算，所以「改名」只动名字集合（B2c），**不动**成员集合；
//     只有「改体 / 加一处同体」才动成员集合（B2b / B1）。首版把这两条混为一谈，
//     断言含糊（`problems.some(p => p.includes('mutate'))` 对 B2c 与 B2 都成立）——
//     本档按分支逐条钉死。
//     另一条实测教训：**归一化会吃掉尾部空白**。首版 C6 用「替换文本加一个尾空格」造破坏，
//     归一化后与原文逐字相同 ⇒ 破坏根本没发生（假红）。改体必须动到**折叠后仍在的字符**。
//
//   【边界（诚实）】
//     ① 只保证「登记在案的审计面副本仍在、值仍逐字相同，且新出现的簇必须登记」，
//        **不**判定这些 helper 是否该收敛到 `tests/_audit_lib.mjs` ——
//        它们大多不在该库的接口面内（`HELPERS = ['stripComments','codeLines','bodyOf','braceMatch']`），
//        收拢是设计决定。本档只把「悄悄各自腐化」这条路堵上。
//     ② 面只覆盖 `function` 声明形态（与 v3280/v3281 同口径）；audit 面里的类方法与
//        顶层常量表不在此面内（v3282/v3283 的枚举器也不吃 tests/）。
//     ③ 与 `scan_audit_lib_consolidation` 不重叠：那档管**唯一真源库的四个助手**是否被本地重写，
//        本档管**审计面内部的实现副本**是否与登记值一致。两者一正一反，互补。
//     ④ 体长下限 40：更短的（如一行式 `const read = ...`）不构成「一份实现」，不收。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const read = (rel) => fs.readFileSync(path.join(AUDIT, rel), 'utf8');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
const NL = String.fromCharCode(10);

/** 体长下限（实 74 最短）：低于此不构成「一份实现」，不收。 */
const MIN_BODY = 40;
/** audit 面 .mjs 文件数下限（实 58）。 */
const MIN_FILES = 45;
/** function 体枚举下限（实 165）：塌陷时「0 簇」会伪装成卫生。 */
const MIN_ITEMS = 100;
/** 跨文件簇下限（实 9）。 */
const MIN_CLUSTERS = 6;

/**
 * 登记表（唯一真源）。
 * 每条：[名字（单个字符串 / 多名字数组）, [成员文件], 体长, 体 md5(8)]。
 * 多名字的簇是**别名簇** —— 同一个体在不同文件里挂着不同名字（`runAt` / `runScanAt`），
 * 这比「同名同体」更难发现，故名字集合也纳入对比（B2c）。
 */
const AUDIT_LEDGER = [
    ['mutate', ['scan_v3185_xref_consumer_negctl.mjs', 'scan_v3186_emotion_recall_negctl.mjs'], 640, '3460e9a2'],
    ['extractMethod', ['scan_world_clock_reader.mjs', 'scan_world_ledger_reader.mjs'], 399, 'cf7b47d4'],
    ['methodBody', ['_m_o4_probe.mjs', '_p3_snapshot_probe.mjs'], 328, '69503fb4'],
    [['runAt', 'runScanAt'], ['scan_v3184_final_four_negctl.mjs', 'scan_v3185_xref_consumer_negctl.mjs',
        'scan_v3186_emotion_recall_negctl.mjs', 'scan_v3193_host_matrix_negctl.mjs',
        'scan_v3193_lexicon_drift_negctl.mjs'], 314, '72230cdf'],
    ['extractBlock', ['scan_bridge_reader.mjs', 'scan_world_clock_reader.mjs', 'scan_world_ledger_reader.mjs'], 238, '14de97bf'],
    [['distributionFace', 'inboundDistributionFace'], ['scan_inbound_faces.mjs', 'scan_open_faces.mjs'], 218, '7fd61df8'],
    [['downstreamModule', 'faceModule'], ['scan_inbound_faces.mjs', 'scan_open_faces.mjs'], 91, '3d714a19'],
    ['readOrNull', ['scan_exit_codes.mjs', 'scan_fixture_sync.mjs'], 75, '3501fac1'],
    [['read', 'readOrNull'], ['scan_cross_repo_binding.mjs', 'scan_ledger_contract.mjs'], 74, 'b7ad68f6'],
];

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有；全部单行，无转义） ----
 * 分两类：声明行（改名用）与体内行（改体用）。
 * 体内行都取过「在 audit 面内的命中数 = 该簇成员数」这一实测事实（见 E1 的当场断言）。 */
const A_MUTATE = 'function mutate(file, anchor, repl, label, expectAttr) {';
const A_RUNAT = 'function runAt(scanPath, dir) {';
const A_RUNSCANAT = 'function runScanAt(scanPath, dir) {';
const A_EXMETHOD = 'function extractMethod(text, name) {';
const A_EXBLOCK = 'function extractBlock(text, startIdx) {';
const A_METHODBODY = 'function methodBody(src, name) {';
const A_READNULL = 'function readOrNull(p) {';
const A_READ = 'function read(p) {';
const A_FACE_IN = 'export function inboundDistributionFace(manifest) {';
const A_FACE_OPEN = 'export function distributionFace(manifest) {';
const A_MEASURE = 'function measureActiveLines(';
/* 体内行（须写成单行字面量，否则 self.includes 的逐字持有断言会空转） */
const A_EXBLOCK_BODY = '    return end > 0 ? text.slice(startIdx, end + 1) : null;';
const A_READNULL_BODY = "    try { return fs.readFileSync(p, 'utf-8'); } catch (_e) { return null; }";
const A_RUNAT_BODY = "        const out = execFileSync('node', [scanPath], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });";
/* 改体用的替换文本（都改到折叠后仍在的字符上；见头部「归一化会吃掉尾部空白」） */
const R_EXBLOCK_BODY = '    return end >= 0 ? text.slice(startIdx, end + 1) : null;';
const R_READNULL_BODY = "    try { return fs.readFileSync(p, 'utf-8'); } catch (e) { return null; }";
const R_RUNAT_BODY = "        const out = execFileSync('node', [scanPath], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });";
const A_SELF_LEN = 'assert.ok(self.length > 6000';
const A_SELF_LEDGER = 'const AUDIT_LEDGER = [';

const FILES = fs.readdirSync(AUDIT).filter((f) => f.endsWith('.mjs')).sort();

/* ══════════════ 提取与聚类（纯函数） ══════════════ */

/** 归一化：剥注释 → 折叠空白 → trim（与 v3280–v3283 同口径，唯一真源 stripComments）。 */
const norm = (s) => stripComments(String(s)).replace(/\s+/g, ' ').trim();

/** 配平取块（跳过引号 / 注释 / 字符串内转义）。 */
function scanBraces(src, open) {
    let i = open, depth = 0, quote = null;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf(NL, i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
        if ('{[('.includes(c)) { depth++; i++; continue; }
        if ('}])'.includes(c)) { depth--; if (depth === 0) return src.slice(open, i + 1); i++; continue; }
        i++;
    }
    return null;
}

const FN_RE = /(?:^|\n)[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/g;

/**
 * 枚举 `function` 声明：跳过参数表（配平圆括号），落到体 `{`，再配平取体。
 * 体的**归一化**结果才是聚类的键 —— 故参数表是否跨行不影响判定（本目录也没有那种写法）。
 */
function fnItemsOf(src) {
    const out = [];
    let m;
    FN_RE.lastIndex = 0;
    while ((m = FN_RE.exec(src)) !== null) {
        const paren = m.index + m[0].length - 1;
        if (src[paren] !== '(') continue;
        let i = paren, depth = 0, quote = null;
        const n = src.length;
        while (i < n) {
            const c = src[i];
            if (quote) {
                if (c === '\\') { i += 2; continue; }
                if (c === quote) quote = null;
                i++; continue;
            }
            if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
            if (c === '(') depth++;
            else if (c === ')') { depth--; if (depth === 0) { i++; break; } }
            i++;
        }
        while (i < n && src[i] !== '{') i++;
        if (i >= n) continue;
        const b = scanBraces(src, i);
        if (b === null) continue;
        const nb = norm(b);
        if (nb.length < MIN_BODY) continue;
        out.push({ name: m[1], body: nb });
    }
    return out;
}

/** 按**体**聚类（不看名字），只留跨 >= 2 文件的簇。 */
function auditClusters(srcMap) {
    const per = new Map();
    let items = 0;
    const files = Object.keys(srcMap).sort();
    for (const f of files) {
        for (const x of fnItemsOf(srcMap[f])) {
            items++;
            if (!per.has(x.body)) per.set(x.body, { names: new Set(), files: new Set() });
            const r = per.get(x.body);
            r.names.add(x.name);
            r.files.add(f);
        }
    }
    const clusters = [];
    for (const [body, r] of per) {
        if (r.files.size < 2) continue;
        clusters.push({
            names: [...r.names].sort(),
            files: [...r.files].sort(),
            len: body.length,
            md5: md5(body),
        });
    }
    clusters.sort((a, b) => b.len - a.len);
    return { files, items, clusters };
}

/* ══════════════ 判据体 ══════════════ */

/**
 * 真判据体：给定「审计面源码表」，返回问题列表；空数组 = 卫生。
 * @param {Object<string,string>} srcMap { audit 面文件名: 源码 }
 * @param {Array} ledger 登记表
 */
function judge(srcMap, ledger) {
    const P = [];
    const { files, items, clusters } = auditClusters(srcMap);
    /* A. 枚举面：审计面必须真的被枚举 */
    if (files.length < MIN_FILES) P.push('A 枚举面失效：只扫到 ' + files.length + ' 个 audit 面 .mjs（下限 ' + MIN_FILES + '）');
    if (items < MIN_ITEMS) P.push('A 枚举面失效：只枚举出 ' + items + ' 个 function 体（下限 ' + MIN_ITEMS + '）');
    if (clusters.length < MIN_CLUSTERS) P.push('A 枚举面失效：只枚举出 ' + clusters.length + ' 个跨文件簇（下限 ' + MIN_CLUSTERS + '）');

    const kOf = (len, h) => len + '#' + h;
    const disk = new Map(clusters.map((r) => [kOf(r.len, r.md5), r]));
    const decl = new Map(ledger.map((r) => [kOf(r[2], r[3]), r]));

    for (const [k, r] of disk) {
        if (!decl.has(k)) {
            P.push('B1 新增未登记的审计面副本：' + r.len + ' 字符 md5=' + r.md5
                + ' names=' + r.names.join('/') + ' files=[' + r.files.join(',') + ']');
        }
    }
    for (const [k, r] of decl) {
        const want = Array.isArray(r[0]) ? [...r[0]].sort() : [r[0]];
        const wantFiles = [...r[1]].sort();
        if (!disk.has(k)) {
            P.push('B2 登记在案的审计面副本已漂移或已消失：' + want.join('/')
                + '（登记成员 [' + wantFiles.join(',') + '] len=' + r[2] + ' md5=' + r[3] + '）');
            continue;
        }
        const got = disk.get(k);
        if (got.files.join(',') !== wantFiles.join(',')) {
            P.push('B2b ' + want.join('/') + ' 成员集合变了：登记 [' + wantFiles.join(',')
                + '] / 实测 [' + got.files.join(',') + '] md5=' + got.md5);
        }
        if (got.names.join(',') !== want.join(',')) {
            P.push('B2c ' + want.join('/') + ' 名字集合变了：登记 [' + want.join(',')
                + '] / 实测 [' + got.names.join(',') + '] md5=' + got.md5);
        }
    }
    for (const r of ledger) {
        const names = Array.isArray(r[0]) ? r[0] : [r[0]];
        if (names.length === 0 || names.some((x) => typeof x !== 'string' || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(x))) {
            P.push('B3 登记项须是非空函数名：' + JSON.stringify(r[0]));
        }
        if (!Array.isArray(r[1]) || r[1].length < 2) P.push('B3 登记项的成员文件必须 >= 2：' + names.join('/'));
        if (!Number.isInteger(r[2]) || r[2] <= 0) P.push('B3 登记项须有体长：' + names.join('/'));
        if (!/^[0-9a-f]{8}$/.test(r[3])) P.push('B3 登记项须有体 md5(8)：' + names.join('/'));
    }
    return P;
}

const readAll = () => {
    const m = {};
    for (const f of FILES) m[f] = read(f);
    return m;
};

const SELF_REL = path.join('tests', 'v3284_o7_audit_copy_ledger.test.mjs');

/* ══════════════ A. 结构面 ══════════════ */
test('v3284 A1. ★★ 枚举面与登记表都在场（枚举失效时「0 簇」是空对空）', () => {
    assert.ok(FILES.length >= MIN_FILES, 'audit 面 .mjs 须 >= ' + MIN_FILES + ' 个（实 ' + FILES.length + '）');
    const { items, clusters } = auditClusters(readAll());
    assert.ok(items >= MIN_ITEMS, 'function 体枚举须非空（实 ' + items + '，下限 ' + MIN_ITEMS + '）');
    assert.ok(clusters.length >= MIN_CLUSTERS, '跨文件簇须非空（实 ' + clusters.length + '，下限 ' + MIN_CLUSTERS + '）');
    assert.ok(AUDIT_LEDGER.length >= MIN_CLUSTERS, '登记表不得被清空（实 ' + AUDIT_LEDGER.length + ' 簇）');
    const seen = new Set();
    for (const r of AUDIT_LEDGER) {
        const names = Array.isArray(r[0]) ? r[0] : [r[0]];
        assert.ok(names.length > 0, '登记项须有名字');
        assert.ok(Array.isArray(r[1]) && r[1].length >= 2, '成员文件须 >= 2：' + names.join('/'));
        for (const f of r[1]) assert.ok(FILES.includes(f), '登记成员须是真 audit 面 .mjs：' + f + '（在 ' + names.join('/') + ' 里）');
        assert.ok(Number.isInteger(r[2]) && r[2] > 0, '须登记体长：' + names.join('/'));
        assert.ok(/^[0-9a-f]{8}$/.test(r[3]), '须登记体 md5(8)：' + names.join('/'));
        assert.ok(!seen.has(r[2] + '#' + r[3]), '同一簇不得重复登记：' + names.join('/'));
        seen.add(r[2] + '#' + r[3]);
    }
    ok('audit 面 ' + FILES.length + ' 个 .mjs / ' + items + ' 个 function 体 / ' + clusters.length + ' 簇；'
        + '登记表 ' + AUDIT_LEDGER.length + ' 簇，名字/成员/体长/md5 格式全过');
});

/* ══════════════ B. 读盘实测 ══════════════ */
test('v3284 B1. ★★★ 9 簇审计面副本值逐字相等，且与登记表双向一致', () => {
    const problems = judge(readAll(), AUDIT_LEDGER);
    assert.deepEqual(problems, [], '盘上真源必须卫生：' + problems.join(' | '));
    ok('9 簇双向一致；无新增未登记簇，无漂移/成员变化/名字变化');
});

test('v3284 B2. ★★ 改声明名 ⇒ 点名 B2c（名字集合变），且不误报成员集合变化', () => {
    const mods = readAll();
    /* 只改**一档**（scan_world_clock_reader.mjs）里的 extractMethod 声明名：
     *   该体便不再带那两个名字 ⇒ 名字集合变 ⇒ B2c（成员集合**不变** —— 体没动）。
     *   命名只影响 B2c，本档刻意把这条与「改体」分开各钉一次。 */
    mods['scan_world_clock_reader.mjs'] = breakSource(mods['scan_world_clock_reader.mjs'], A_EXMETHOD,
        'function extractMethodX(text, name) {', 'v3284_b2');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2c') && p.includes('extractMethod')),
        '必须点名该簇名字集合变化：' + problems.join(' | '));
    assert.ok(problems.every((p) => !p.startsWith('B2b')), '改名不得被算进成员集合：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('md5=')), '归因须带体指纹：' + problems.join(' | '));
    ok('改单档声明名 ⇒ judge 点名 B2c（名字集合变化，带 md5），且不误报成员集合变化');
});

test('v3284 B3. ★★ 只改体内一行（值级漂移）⇒ 点名 B2b（成员集合缩水）+ md5', () => {
    const mods = readAll();
    /* extractBlock 三档共享同一体内行；只改一档 ⇒ 该体与另两档不再同体 ⇒ 3 → 2 */
    mods['scan_bridge_reader.mjs'] = breakSource(mods['scan_bridge_reader.mjs'], A_EXBLOCK_BODY,
        R_EXBLOCK_BODY, 'v3284_b3');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2b') && p.includes('extractBlock')),
        '必须点名该簇成员集合变化：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('md5=')), '漂移侧须带体指纹：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('scan_bridge_reader.mjs')), '须点名掉出去的那一档：' + problems.join(' | '));
    ok('只改一档体内一行 ⇒ judge 点名 B2b（extractBlock 3→2，含掉出去的档名与 md5）');
});

/* ══════════════ C. 真源码破坏（六向） ══════════════ */
test('v3284 C1. ★★ 改声明名使 mutate 簇名字集合变 ⇒ B2c', () => {
    const mods = readAll();
    mods['scan_v3186_emotion_recall_negctl.mjs'] = breakSource(mods['scan_v3186_emotion_recall_negctl.mjs'],
        A_MUTATE, 'function mutateProbe(file, anchor, repl, label, expectAttr) {', 'v3284_c1');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2c') && p.includes('mutate')), '必须点名 mutate 名字集合：' + problems.join(' | '));
    ok('改 scan_v3186 的 mutate 声明名 ⇒ B2c（mutate 不再是该体的名字）');
});

test('v3284 C2. ★★ 改另一档声明名使 extractMethod 簇名字集合变 ⇒ B2c', () => {
    const mods = readAll();
    mods['scan_world_ledger_reader.mjs'] = breakSource(mods['scan_world_ledger_reader.mjs'],
        A_EXMETHOD, 'function extractMethodY(text, name) {', 'v3284_c2');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2c') && p.includes('extractMethod')), '必须点名 extractMethod：' + problems.join(' | '));
    ok('改 scan_world_ledger_reader 的 extractMethod 声明名 ⇒ B2c');
});

test('v3284 C3. ★★ 凭空把一份「唯一实现」复制到新档 ⇒ 该体成了跨档簇 ⇒ B1', () => {
    /* 选一份**当前唯一**（不属任何跨档簇）的体：dead_code_budget.mjs 的 measureActiveLines。
     *   复制它不会撞上任何已登记键，故必须由 B1（新增未登记）抓住。 */
    const host = read('dead_code_budget.mjs');
    const hits = host.split(A_MEASURE).length - 1;
    assert.equal(hits, 1, '宿主侧 measureActiveLines 声明须恰中 1 次（实 ' + hits + '）');
    const at = host.indexOf(A_MEASURE);
    const body = scanBraces(host, host.indexOf('{', at));
    assert.ok(body && body.length > 300, '取到的体必须非空（实 ' + (body ? body.length : 0) + '）');
    const mods = readAll();
    mods['scan_syntax.mjs'] = mods['scan_syntax.mjs'] + NL
        + 'function measureActiveLinesClone(src) ' + body + NL;
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B1')), '必须点名新增未登记：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('scan_syntax.mjs')), '须点名新进来的那一档：' + problems.join(' | '));
    ok('把唯一实现复制进 scan_syntax.mjs ⇒ judge 点名 B1「新增未登记」（含文件名）');
});

test('v3284 C4. ★★ 改 3 档簇其中一档的体内一行 ⇒ B2b（3→2）', () => {
    const mods = readAll();
    mods['scan_world_clock_reader.mjs'] = breakSource(mods['scan_world_clock_reader.mjs'], A_EXBLOCK_BODY,
        '    return end > 0 ? text.slice(startIdx, end) : null;', 'v3284_c4');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2b') && p.includes('extractBlock')), '必须点名 extractBlock：' + problems.join(' | '));
    ok('extractBlock 簇（3 档）改一档体内行 ⇒ B2b 3→2');
});

test('v3284 C5. ★★ 改 2 档簇其中一档的体内一行 ⇒ B2b（2→1）', () => {
    const mods = readAll();
    mods['scan_fixture_sync.mjs'] = breakSource(mods['scan_fixture_sync.mjs'], A_READNULL_BODY,
        R_READNULL_BODY, 'v3284_c5');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2b') && p.includes('readOrNull')), '必须点名 readOrNull：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('scan_fixture_sync.mjs')), '须点名掉出去的那一档：' + problems.join(' | '));
    ok('readOrNull 簇（2 档，75 字符）改一档体内行 ⇒ B2b 2→1');
});

test('v3284 C6. ★★ 改 5 档簇其中一档的体内一行 ⇒ B2b（5→4），另 4 档仍同体', () => {
    const mods = readAll();
    mods['scan_v3193_host_matrix_negctl.mjs'] = breakSource(mods['scan_v3193_host_matrix_negctl.mjs'], A_RUNAT_BODY,
        R_RUNAT_BODY, 'v3284_c6');
    const problems = judge(mods, AUDIT_LEDGER);
    assert.ok(problems.some((p) => p.startsWith('B2b') && p.includes('runAt/runScanAt')),
        '必须点名该簇成员集合变化：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('scan_v3193_host_matrix_negctl.mjs')),
        '须点名掉出去的那一档：' + problems.join(' | '));
    ok('runAt/runScanAt 簇（5 档）改一档体内行 ⇒ B2b 5→4（其余 4 档仍同体）');
});

/* ══════════════ D. 工具两向自证 ══════════════ */
test('v3284 D1. ★★★ 工具两向自证：锚点 0 次/同值替换必抛；原版判据真、破坏副本真红', () => {
    const src = read('scan_bridge_reader.mjs');
    assert.throws(() => assertSingleHit(src, 'function 绝不存在的锚点() {', 'v3284_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(src, A_EXBLOCK_BODY, A_EXBLOCK_BODY, 'v3284_same'), /改变|替换/, '同值替换必须抛');
    const broken = breakSource(src, A_EXBLOCK_BODY,
        '    return end > 0 ? text.slice(startIdx, end + 1) : undefined;', 'v3284_db');
    assert.notEqual(src, broken, '破坏须真的改变源码');
    assert.deepEqual(judge(readAll(), AUDIT_LEDGER), [], '原版上同判据必须真成立');
    const mods = readAll();
    mods['scan_bridge_reader.mjs'] = broken;
    assert.notDeepEqual(judge(mods, AUDIT_LEDGER), [], '破坏副本上同判据必须真翻红');
    ok('两向自证通过；原版判据真、破坏副本真红');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3284 E1. ★★ 判据纯度：每个破坏锚点字面量在本档只有一个持有常量，且真源上各恰中一次', () => {
    const self = readRoot(SELF_REL);
    const holders = new Map();
    const anchors = [['MUTATE', A_MUTATE], ['RUNAT', A_RUNAT], ['RUNSCANAT', A_RUNSCANAT],
        ['EXMETHOD', A_EXMETHOD], ['EXBLOCK', A_EXBLOCK], ['METHODBODY', A_METHODBODY],
        ['READNULL', A_READNULL], ['READ', A_READ], ['FACE_IN', A_FACE_IN], ['FACE_OPEN', A_FACE_OPEN],
        ['MEASURE', A_MEASURE], ['EXBLOCK_BODY', A_EXBLOCK_BODY], ['READNULL_BODY', A_READNULL_BODY],
        ['RUNAT_BODY', A_RUNAT_BODY]];
    for (const [label, a] of anchors) {
        assert.equal(a.includes(NL), false, label + ' 须是单行锚点（计数口径依赖此事实）');
        assert.ok(a.length > 12, label + ' 锚点必须有足够长度（太短会撞上无关文本）');
        const esc = a.replace(/\n/g, '\\n');
        assert.ok(self.includes(esc), label + ' 锚点字面量须逐字被本档持有（否则计数口径空转）');
        if (!holders.has(esc)) holders.set(esc, new Set());
        holders.get(esc).add(label);
    }
    for (const [esc, set] of holders) {
        assert.equal(set.size, 1, '字面量 ' + esc + ' 在本档被多个锚点常量持有：' + [...set].join(' / '));
    }
    /* 反向：**改体用的替换文本不得与任何锚点常量同串**（否则计数口径会把两者混在一起）。 */
    for (const [label, r] of [['R_EXBLOCK_BODY', R_EXBLOCK_BODY], ['R_READNULL_BODY', R_READNULL_BODY],
        ['R_RUNAT_BODY', R_RUNAT_BODY]]) {
        assert.ok(!holders.has(r), label + ' 与某锚点字面量同串（两者须可分）');
        assert.ok(readRoot(SELF_REL).includes(r), label + ' 须逐字被本档持有');
    }
    const declRe = /^const\s+([AR]_[A-Z_]+)\s*=/gm;
    const declNames = [...self.matchAll(declRe)].map((m) => m[1]);
    assert.deepEqual(declNames, ['A_MUTATE', 'A_RUNAT', 'A_RUNSCANAT', 'A_EXMETHOD', 'A_EXBLOCK', 'A_METHODBODY',
        'A_READNULL', 'A_READ', 'A_FACE_IN', 'A_FACE_OPEN', 'A_MEASURE',
        'A_EXBLOCK_BODY', 'A_READNULL_BODY', 'A_RUNAT_BODY',
        'R_EXBLOCK_BODY', 'R_READNULL_BODY', 'R_RUNAT_BODY', 'A_SELF_LEN', 'A_SELF_LEDGER'],
    '本档锚点常量的声明序须稳定（防漏抄/错抄）');
    /* 坐标在各被破坏文件里唯一（同一文件内的声明行只出现 1 次）。 */
    assertSingleHit(read('scan_v3185_xref_consumer_negctl.mjs'), A_MUTATE, 'v3284_h1');
    assertSingleHit(read('scan_v3186_emotion_recall_negctl.mjs'), A_MUTATE, 'v3284_h2');
    assertSingleHit(read('scan_v3193_host_matrix_negctl.mjs'), A_RUNAT, 'v3284_h3');
    assertSingleHit(read('scan_v3193_lexicon_drift_negctl.mjs'), A_RUNAT, 'v3284_h4');
    assertSingleHit(read('scan_v3184_final_four_negctl.mjs'), A_RUNSCANAT, 'v3284_h5');
    assertSingleHit(read('scan_world_clock_reader.mjs'), A_EXMETHOD, 'v3284_h6');
    assertSingleHit(read('scan_bridge_reader.mjs'), A_EXBLOCK, 'v3284_h7');
    assertSingleHit(read('_m_o4_probe.mjs'), A_METHODBODY, 'v3284_h8');
    assertSingleHit(read('scan_exit_codes.mjs'), A_READNULL, 'v3284_h9');
    assertSingleHit(read('scan_ledger_contract.mjs'), A_READNULL, 'v3284_h10');
    assertSingleHit(read('scan_cross_repo_binding.mjs'), A_READ, 'v3284_h11');
    assertSingleHit(read('scan_inbound_faces.mjs'), A_FACE_IN, 'v3284_h12');
    assertSingleHit(read('scan_open_faces.mjs'), A_FACE_OPEN, 'v3284_h13');
    assertSingleHit(read('dead_code_budget.mjs'), A_MEASURE, 'v3284_h14');
    /* 体内行：面内命中数须**恰等于该簇成员数** —— B3/C4/C5/C6 的先决条件，当场钉住。
     *   若哪天有人把某一档的这行改了措辞，这里会先红，而不是让那几条破坏断言悄悄变成空转。 */
    const expectHits = [
        [A_EXBLOCK_BODY, 3, 'extractBlock'],
        [A_READNULL_BODY, 2, 'readOrNull'],
        [A_RUNAT_BODY, 5, 'runAt/runScanAt'],
    ];
    for (const [a, want, label] of expectHits) {
        let got = 0;
        const where = [];
        for (const f of FILES) {
            const n = read(f).split(a).length - 1;
            if (n) { got += n; where.push(f); }
        }
        assert.equal(got, want, label + ' 体内锚点在 audit 面内的命中数须恰为 ' + want + '（实 ' + got + '：' + where.join(',') + '）');
    }
    ok('14 个声明锚点 + 3 个替换文本各只有 1 个持有常量；14 个坐标单命中；'
        + '3 个体内锚点的面内命中数恰为 3 / 2 / 5（= 各簇成员数）');
});

/* ══════════════ F. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3284 F1. ★ 自防护：登记表与判据自身不得被摘掉；O7 既有真源特征仍在场', () => {
    assert.ok(readRoot('index.js').includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(readRoot('index.js').includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    assert.ok(read('scan_v3193_lexicon_drift_negctl.mjs').includes(A_RUNAT), '本档 runAt 簇的真源成员仍在场');
    assert.ok(read('dead_code_budget.mjs').includes(A_MEASURE), '本档 C3 的宿主实现仍在场');
    const self = readRoot(SELF_REL);
    const selfLen = self.length;
    assert.ok(selfLen > 6000, '本档自身不得被清空（实 ' + selfLen + ' 字符）');
    assert.ok(self.includes(A_SELF_LEDGER), '本档须逐字持有登记表锚点');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');
    assert.ok(self.includes("from './_audit_lib.mjs'"), '剥注释须从唯一真源进口（不得本地重写助手）');
    ok('真源特征 / 登记表 / 本档自身均在位（' + selfLen + ' 字符）');
});

test('v3284 F2. ★ 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(readRoot('package.json')).version;
    const man = JSON.parse(readRoot('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(readRoot('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    assert.equal(vnum('3.284.0'), vnum(pkg), '本档恰锚当版');
    ok('三源同源；本档锚 v3.284.0');
});