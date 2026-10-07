// tests/v3282_o7_alias_copy_ledger.test.mjs — v3.282.0 O7 第四项（续二）：别名副本面
// 主题：**同一份实现被抄到另一个名字下** —— 「名字不同」让既有判据整片看不见它。
//
//   【为什么本档存在（真缺口，逐条有读数）】
//     O7 到此为止已经建了三层副本判据，但三层的枚举面都**只按名字**配对：
//       · v3280「宿主 index.js ↔ 模块」——LEDGER 是 [函数名, 模块文件]，靠**同名**发现副本
//       · v3281「模块 ↔ 模块」——buildClusters 的名字→体→成员三层 Map，同样按**同名**聚类
//       · v3264 / v3266 的 VERBATIM_CONSTS —— 同名常量声明在场性
//     于是「同名同体的副本」已被三层夹住，而**「同体不同名」整面没有任何判据**：
//     把同一段实现换个名字抄过去，三层判据全部静默（这正是「判据的面漏一类」的第五处）。
//
//     实测（真源 tests/_audit_lib.mjs 的 stripComments 归一化口径，全 80 个根级 .js，
//     3 种形态：function 声明 / 类方法 / 常量表与箭头常量，体长下限 30/20）⇒ **9 个簇**：
//
//       _numOrNull / numOrNull        index.js ↔ snapshot-checkpoint.js （258 字符）
//       floorOrNull / toNum           ledger-replay.js ↔ archive-shift.js （208）
//       RESIDENT_FALLBACK / _MARKERS  cost-ledger.js ↔ index.js （159，跨行数组）
//       keys / pFields                index.js ↔ settings-ui.js （64）
//       _trunc / truncateText         unified-recall.js ↔ ai-select.js （61）
//       _num / _num0                  cost-forecast.js ↔ projection-pipeline.js （60，箭头）
//       _text / txt                   sleep-awaken.js ↔ world-ledger-reader.js （56）
//       normOp / normRef / normStr    index.js · fuzzy-patch.js · changeset.js · relation-disclosure.js （34）
//       PRECHECK / PREVIEW            branch-semantics.js ↔ volume-continuation.js （42，常量表；v3.293.0 补）
//
//     其中两条注释**自己承认**了跨文件重复（真源逐字）：
//       archive-shift.js:28-29 「两处是**各自路径上的门**……不是同一份事实的两份实现；
//                               改口径必须两处同改（v3275 C2 把两者钉在同一批样本上）」
//       cost-ledger.js:43    「常驻标记表回落值（与 index.js RESIDENT_MARKERS 保持同字面量）」
//     但注释里那两条「钉」都是**行为等价**（v3239 A2 抽方法体逐输入比对 / v3211 §8 只比成员集合），
//     不是逐字副本台账 —— 值级漂移（改一个字面量、改一处空白布局）它们都看不见。
//
//   【与既有三层的关系（补第四面，不是重复建设）】
//     本档判的是「**同名**副本之外的**别名**副本」：一条登记在 v3281（如 hash32 模块簇）
//     与一条登记在本档（如 _num/_num0）是两件不同的事 —— 前者的副本靠名字就能被发现，
//     后者只能靠**体**去发现。本档刻意**不**登记同名簇（它们已归 v3280 / v3281），
//     以保持「四档射程互不重叠、合起来才是全枚举面」。
//
//   【判据（fail-closed）】
//     A  枚举面：全仓 items 下限 + 别名簇数下限 + 登记表格式（名字互不相同，否则它就不是别名簇）
//     B  读盘实测：9 簇逐字相同；任一簇少一个成员即「漂移/消失」（红，且点名差异成员）
//     C  真源码破坏（三向）：改成员 A 的体 ⇒ 该簇成员缩水；改另一族成员 ⇒ 同样；凭空抄一份 ⇒ 新增未登记
//     D  工具两向自证：breakSource 的 0 次 / 同值必抛；原版判据真、破坏副本真红
//     E  判据纯度 H5：破坏锚点字面量在本档各只声明一次（按**转义形态**计数），真源上各恰中一次
//     F  自防护 + 三源同源 + 当版锚点
//
//   【边界（诚实）】
//     ① 本档只保证「登记在案的别名副本仍在、且新出现的必须登记」。它**不**判定某一簇是否
//        应当合并去重 —— 收拢到共用原语是设计决定（例如 `_numOrNull` 那份注释已说明是刻意
//        「模块不加载时仍要工作」的双实现），不是文本比对能得出的结论。
//     ② 阈值（体长 30/20、仅两文件不同名）是**面**的选择而非事实边界：调到 12/12 会多出
//        `_r2shift` 之类探针助手（tests/ 下，不是根级 .js，本档不覆盖）；调到 60/40 会漏掉
//        `_text/txt`（56）。取 30/20 是让「一行取值门」（normOp 那一簇 34 字符）也在面内，
//        而不是因为它们「重要程度相当」。
//     ③ 本档与 v3281 共享同一个体的归一化口径（都从 tests/_audit_lib.mjs 进口 stripComments），
//        但**枚举与聚类各写一遍**是有意的：两档要能各自独立翻红，不共享运行时状态。
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
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);

/** 体长下限：30 让「一行取值门」（normOp 那一簇 34）也在面内；常量表 20（跨行数组较短）。 */
const MIN_BODY = 30;
const MIN_TAB = 20;
/** 全仓 items 下限（实 2153）：枚举面塌陷时「0 别名簇」会伪装成卫生。 */
const MIN_ITEMS = 1200;
/** 别名簇数下限（实 9）：登记表被清空或聚类失效时立刻红。 */
const MIN_CLUSTERS = 6;

/**
 * 登记表（唯一真源）。
 * 每条：['形态', [该簇各成员的名字]（必须互不相同）, [成员文件], 体长, 体 md5(8)]
 * 名字互不相同 ⇒ 它天然是别名簇；同名簇归 v3280 / v3281。
 */
const ALIAS_LEDGER = [
    ['meth', ['_numOrNull', 'numOrNull'], ['index.js', 'snapshot-checkpoint.js'], 258, '2ea9877b'],
    ['fn', ['floorOrNull', 'toNum'], ['archive-shift.js', 'ledger-replay.js'], 208, 'b3a7cfaf'],
    ['tab', ['RESIDENT_FALLBACK', 'RESIDENT_MARKERS'], ['cost-ledger.js', 'index.js'], 159, '61d3358a'],
    ['tab', ['keys', 'pFields'], ['index.js', 'settings-ui.js'], 64, '0b16baa8'],
    ['fn', ['_trunc', 'truncateText'], ['ai-select.js', 'unified-recall.js'], 61, 'f7c9c6b4'],
    ['arr', ['_num', '_num0'], ['cost-forecast.js', 'projection-pipeline.js'], 60, '885d07fc'],
    ['fn', ['_text', 'txt'], ['sleep-awaken.js', 'world-ledger-reader.js'], 56, 'c590df35'],
    ['fn', ['normOp', 'normRef', 'normStr'], ['changeset.js', 'fuzzy-patch.js', 'index.js', 'relation-disclosure.js'], 34, '311c820d'],
    /* X6/X7：同一个「预检三档」体在两个新模块里挂了两个名字 —— 名字不同，故三层按名配对的
     *   判据（v3280/v3281）整片看不见它，正落入本档射程。两模块刻意各持一份（见 v3281 同簇留痕）。 */
    ['tab', ['PRECHECK', 'PREVIEW'], ['branch-semantics.js', 'volume-continuation.js'], 42, '9471dab4'],
];

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ---- */
/* 取两条短而唯一的**声明行**做破坏坐标：体级多行锚点在真源里的缩进形态易漂（本轮已踩两次）。 */
const A_NUM = 'function numOrNull(v) ';                                    // snapshot-checkpoint.js（fn）
const A_NUM2 = '        _numOrNull(v) ';                                   // index.js（meth）
const A_TO = '    function toNum(v) ';                                     // archive-shift.js（fn）
const A_PF = "const pFields = ['gender'";                                  // settings-ui.js（tab）
const A_SELF_LEN = 'assert.ok(self.length > 6000';
const A_SELF_LEDGER = 'const ALIAS_LEDGER = [';

const FILES = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.bak'))
    .sort();

/* ══════════════ 判据体（纯函数：吃源码表，返回问题列表） ══════════════ */

/** 归一化：剥注释 → 折叠空白 → trim。与 v3280 / v3281 同口径（唯一真源 stripComments）。 */
const norm = (s) => stripComments(String(s)).replace(/\s+/g, ' ').trim();

/**
 * 配平取块（跳过引号 / 注释 / 字符串内转义）。
 * 为什么不能裸数花括号：体里的正则字面量或字符串可能含 `{`，裸计数会提前收口 ——
 *   于是两侧即使真漂移也可能「同样地被截断」而看起来相等。
 */
function blockFrom(src, startBrace) {
    let depth = 0, i = startBrace, quote = null;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf(String.fromCharCode(10), i); i = e < 0 ? n : e + 1; continue; }
        if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i); i = e < 0 ? n : e + 2; continue; }
        if ('{[('.includes(c)) { depth++; i++; continue; }
        if ('}])'.includes(c)) { depth--; if (depth === 0) return src.slice(startBrace + 1, i); i++; continue; }
        i++;
    }
    return null;
}

/** 跳过参数表，返回其后的 `{` 下标（找不到给 -1）。 */
function braceAfterParams(src, parenOpen) {
    let depth = 0, i = parenOpen, quote = null;
    const n = src.length;
    while (i < n) {
        const c = src[i];
        if (quote) {
            if (c === '\\') { i += 2; continue; }
            if (c === quote) quote = null;
            i++; continue;
        }
        if (c === '"' || c === "'" || c === '`') { quote = c; i++; continue; }
        if (c === '/' && src[i + 1] === '/') { const e = src.indexOf(String.fromCharCode(10), i); i = e < 0 ? n : e + 1; continue; }
        if (c === '(') { depth++; i++; continue; }
        if (c === ')') { depth--; if (depth === 0) break; i++; continue; }
        i++;
    }
    const j = src.indexOf('{', i);
    return j < 0 ? -1 : j;
}

const CLASS_RE = /(?:^|\n)[ \t]*class[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[^{]*\{/g;
const METH_RE = /(?:^|\n)[ \t]*(?:static[ \t]+)?(?:async[ \t]+)?(?:get[ \t]+|set[ \t]+)?([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\([^)]*\)[ \t]*\{/g;
const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'do', 'else', 'try', 'new', 'typeof', 'await', 'delete', 'void']);
const FN_RE = /(?:^|\n)[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*\(/g;
const TAB_RE = /(?:^|\n)[ \t]*const[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*(?:Object\.freeze\(\s*)?(?:new\s+(?:Set|Map)\s*\(\s*)?([\[{])/g;
const ARR_RE = /(?:^|\n)[ \t]*const[ \t]+([A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=[ \t]*(?:async[ \t]+)?(?:\([^)]*\)|[A-Za-z_$][A-Za-z0-9_$]*)[ \t]*=>[ \t]*([^\n]*)/g;

/** 枚举某源码里三种形态的实现体 → [{kind, name, body}]。 */
function itemsOf(src) {
    const out = [];
    let m;
    FN_RE.lastIndex = 0;
    while ((m = FN_RE.exec(src)) !== null) {
        const j = braceAfterParams(src, m.index + m[0].length - 1);
        if (j < 0) continue;
        const b = blockFrom(src, j);
        if (b === null) continue;
        const nb = norm(b);
        if (nb.length >= MIN_BODY) out.push({ kind: 'fn', name: m[1], body: nb });
    }
    CLASS_RE.lastIndex = 0;
    while ((m = CLASS_RE.exec(src)) !== null) {
        const cb = blockFrom(src, m.index + m[0].length - 1);
        if (cb === null) continue;
        let mm; METH_RE.lastIndex = 0;
        while ((mm = METH_RE.exec(cb)) !== null) {
            if (KW.has(mm[1])) continue;
            const b = blockFrom(cb, mm.index + mm[0].length - 1);
            if (b === null) continue;
            const nb = norm(b);
            if (nb.length >= MIN_BODY) out.push({ kind: 'meth', name: mm[1], body: nb });
        }
    }
    TAB_RE.lastIndex = 0;
    while ((m = TAB_RE.exec(src)) !== null) {
        const i = m.index + m[0].length - 1;
        const b = (src[i] === '[' || src[i] === '{') ? blockFrom(src, i) : null;
        if (b === null) continue;
        const nb = norm(b);
        if (nb.length >= MIN_TAB) out.push({ kind: 'tab', name: m[1], body: nb });
    }
    ARR_RE.lastIndex = 0;
    while ((m = ARR_RE.exec(src)) !== null) {
        const nb = norm(m[2]);
        if (nb.length >= MIN_BODY) out.push({ kind: 'arr', name: m[1], body: nb });
    }
    return out;
}

/** 按**体**聚类，只留「跨 ≥2 文件、且名字互不相同」的簇 —— 这就是别名副本面。 */
function buildAliasClusters(srcMap) {
    const per = new Map();     // body -> [{file, name, kind}]
    for (const [f, src] of Object.entries(srcMap)) {
        for (const it of itemsOf(src)) {
            if (!per.has(it.body)) per.set(it.body, []);
            per.get(it.body).push({ file: f, name: it.name, kind: it.kind });
        }
    }
    const rows = [];
    for (const [body, list] of per) {
        const files = [...new Set(list.map((x) => x.file))].sort();
        if (files.length < 2) continue;
        const names = [...new Set(list.map((x) => x.name))].sort();
        if (names.length < 2) continue;          // 同名簇归 v3280 / v3281
        rows.push([list[0].kind, names, files, body.length, md5(body)]);
    }
    return rows;
}

/** 把簇压成可比对的键：kind|名字集|成员集|体长|md5。 */
const keyOf = (r) => [r[0], r[1].join('+'), r[2].join(','), r[3], r[4]].join('|');

/**
 * 真判据体：给定「全仓源码表」，返回问题列表；空数组 = 卫生。
 * @param {Object<string,string>} srcMap { 文件名: 源码 }
 * @param {Array} ledger 登记表（[kind, names, files, len, md5]）
 */
function judge(srcMap, ledger) {
    const P = [];
    const files = Object.keys(srcMap);
    const clusters = buildAliasClusters(srcMap);
    /* A. 枚举面：整仓必须真的被枚举（否则「0 别名簇」是空对空） */
    if (files.length < 60) P.push('A 枚举面失效：只扫到 ' + files.length + ' 个根级 .js（下限 60）');
    const items = files.reduce((a, f) => a + itemsOf(srcMap[f]).length, 0);
    if (items < MIN_ITEMS) P.push('A 枚举面失效：只枚举出 ' + items + ' 个实现体（下限 ' + MIN_ITEMS + '）');
    if (clusters.length < MIN_CLUSTERS) P.push('A 枚举面失效：只枚举出 ' + clusters.length + ' 个别名簇（下限 ' + MIN_CLUSTERS + '）');

    const disk = new Map(clusters.map((r) => [keyOf(r), r]));
    const decl = new Map(ledger.map((r) => [keyOf(r), r]));

    for (const [k, r] of disk) {
        if (!decl.has(k)) P.push('B1 新增未登记的别名副本（同体不同名）：' + r[0] + ' ' + r[1].join('/') + ' @[' + r[2].join(',') + '] md5=' + r[4]);
    }
    for (const [k, r] of decl) {
        if (!disk.has(k)) {
            P.push('B2 登记在案的别名副本已不再逐字相同（漂移）或已消失：'
                + r[0] + ' ' + r[1].join('/') + '（登记成员 [' + r[2].join(',') + '] md5=' + r[4] + '）');
            continue;
        }
        const got = disk.get(k);
        if (got[2].join(',') !== r[2].join(',')) {
            P.push('B2 ' + r[0] + ' ' + r[1].join('/') + ' 成员集合变了：登记 [' + r[2].join(',') + '] / 实测 [' + got[2].join(',') + ']');
        }
    }
    /* B3. 名字/成员不足以定位时点名（登记项自身退化） */
    for (const r of ledger) {
        if (new Set(r[1]).size !== r[1].length) P.push('B3 登记项的名字必须互不相同（否则它不是别名簇）：' + r[1].join('/'));
        if (r[2].length < 2) P.push('B3 登记项的成员文件必须 >= 2：' + r[1].join('/'));
    }
    return P;
}

/** 读盘：全仓根级 .js → { 文件名: 源码 }。 */
function readAll() {
    const m = {};
    for (const f of FILES) m[f] = read(f);
    return m;
}

const SELF_REL = path.join('tests', 'v3282_o7_alias_copy_ledger.test.mjs');

/* ══════════════ A. 结构面 ══════════════ */
test('v3282 A1. ★★ 枚举面与登记表都在场（枚举失效时「0 别名簇」是空对空）', () => {
    assert.ok(FILES.length >= 60, '根级 .js 面须 >= 60 个（实 ' + FILES.length + '）');
    const items = FILES.reduce((a, f) => a + itemsOf(read(f)).length, 0);
    assert.ok(items >= MIN_ITEMS, '全仓实现体枚举须非空（实 ' + items + '，下限 ' + MIN_ITEMS + '）');
    assert.ok(ALIAS_LEDGER.length >= MIN_CLUSTERS, '登记表不得被清空（实 ' + ALIAS_LEDGER.length + ' 簇）');
    const seen = new Set();
    for (const [kind, names, files, len, h] of ALIAS_LEDGER) {
        assert.ok(['fn', 'meth', 'tab', 'arr'].includes(kind), '登记项形态须受控：' + kind);
        assert.ok(Array.isArray(names) && names.length >= 2, '别名簇须 >= 2 个名字：' + names.join('/'));
        assert.equal(new Set(names).size, names.length, '别名簇的名字必须互不相同（同名簇归 v3280/v3281）：' + names.join('/'));
        assert.ok(Array.isArray(files) && files.length >= 2, '成员文件须 >= 2：' + names.join('/'));
        for (const f of files) assert.ok(FILES.includes(f), '登记成员须是真根级 .js：' + f + '（在 ' + names.join('/') + ' 里）');
        assert.ok(Number.isInteger(len) && len > 0, '须登记体长：' + names.join('/'));
        assert.ok(/^[0-9a-f]{8}$/.test(h), '须登记体 md5(8)：' + names.join('/'));
        const k = kind + '|' + names.slice().sort().join('+') + '|' + files.slice().sort().join(',') + '|' + len + '|' + h;
        assert.ok(!seen.has(k), '同一簇不得重复登记：' + names.join('/'));
        seen.add(k);
    }
    ok('根级 ' + FILES.length + ' 个 .js；登记表 ' + ALIAS_LEDGER.length + ' 簇，名字集/成员集/体长/md5 格式全过');
});

/* ══════════════ B. 读盘实测 ══════════════ */
test('v3282 B1. ★★★ 登记别名簇逐字副本与登记表双向一致（少一个成员即漂移）', () => {
    const problems = judge(readAll(), ALIAS_LEDGER);
    assert.deepEqual(problems, [], '盘上真源必须卫生：' + problems.join(' | '));
    ok('簇级双向一致；无新增未登记别名簇，无成员漂移');
});

test('v3282 B2. ★★ 漂移可归因（成员缩水会点名，不是「有一簇不一样」）', () => {
    const mods = readAll();
    /* 把 settings-ui.js 的 pFields 改掉一个字符 —— 该文件必须从 keys/pFields 那一簇掉出去 */
    mods['settings-ui.js'] = breakSource(mods['settings-ui.js'], A_PF,
        "const pFields = ['genderX'", 'v3282_b2');
    const problems = judge(mods, ALIAS_LEDGER);
    assert.ok(problems.some((p) => p.includes('pFields')), '必须点名 pFields：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('settings-ui.js')), '归因必须点名掉出去的成员：' + problems.join(' | '));
    ok('改 settings-ui.js 的 pFields 一处字面量 ⇒ judge 点名该簇成员集合变化');
});

/* ══════════════ C. 真源码破坏（三向） ══════════════ */
test('v3282 C1. ★★ 改「取值门」簇成员（snapshot-checkpoint.js 的 numOrNull）⇒ 同一条 judge 翻红', () => {
    /* 替换文本刻意**不包含** A_NUM 作为前缀：A_NUM 无右边界，若写成 `A_NUM + 后缀`，
     *   `!includes(A_NUM)` 恒假（原串仍在新串里），可观察性断言会自相矛盾。 */
    const broken = breakSource(read('snapshot-checkpoint.js'), A_NUM,
        'function numOrNullX(v) ', 'v3282_c1');
    assert.ok(broken.includes('function numOrNullX(v) '), '破坏必须可观察（替换文本进场）');
    assert.equal(broken.includes(A_NUM), false, '破坏必须可观察（原锚点退出）');
    const mods = readAll();
    mods['snapshot-checkpoint.js'] = broken;
    const problems = judge(mods, ALIAS_LEDGER);
    assert.ok(problems.some((p) => p.includes('numOrNull')), '必须点名 numOrNull：' + problems.join(' | '));
    ok('改 snapshot-checkpoint.js 的 numOrNull ⇒ judge 翻红（该簇成员缩水）');
});

test('v3282 C2. ★★ 改另一族成员（index.js 的 _numOrNull / settings-ui.js 的 pFields）⇒ 同一条 judge 翻红', () => {
    const mods = readAll();
    mods['index.js'] = breakSource(mods['index.js'], A_NUM2, '        _numOrNullX(v) ', 'v3282_c2');
    let problems = judge(mods, ALIAS_LEDGER);
    assert.ok(problems.some((p) => p.includes('_numOrNull')), '必须点名 _numOrNull：' + problems.join(' | '));

    const mods2 = readAll();
    mods2['archive-shift.js'] = breakSource(mods2['archive-shift.js'], A_TO, '    function toNumX(v) ', 'v3282_c2b');
    problems = judge(mods2, ALIAS_LEDGER);
    assert.ok(problems.some((p) => p.includes('toNum')), '必须点名 toNum：' + problems.join(' | '));
    ok('改 index.js 的 _numOrNull / archive-shift.js 的 toNum ⇒ judge 均翻红');
});

test('v3282 C3. ★★ 凭空把同一段体抄到两个新名字下 ⇒ judge 点名「新增未登记别名簇」', () => {
    const mods = readAll();
    const B = "function probeAliasFn(v) {\n  const n = Number(v);\n  if (!Number.isFinite(n)) return null;\n  return n > 1000 ? 1000 : n;\n}\n";
    mods['age-anchor.js'] = mods['age-anchor.js'] + '\n' + B;
    mods['crosslink.js'] = mods['crosslink.js'] + '\n' + B.replace('probeAliasFn', 'probeAliasTw');
    const problems = judge(mods, ALIAS_LEDGER);
    assert.ok(problems.some((p) => p.includes('B1') && p.includes('新增未登记')), '必须报新增未登记：' + problems.join(' | '));
    assert.ok(problems.some((p) => p.includes('probeAliasFn') || p.includes('probeAliasTw')), '归因须点名新簇：' + problems.join(' | '));
    ok('凭空抄一份到 age-anchor.js + crosslink.js ⇒ judge 点名新增未登记别名簇');
});

/* ══════════════ D. 工具两向自证 ══════════════ */
test('v3282 D1. ★★★ 工具两向自证：锚点 0 次/不唯一/同值替换必抛；原版判据真、破坏副本真红', () => {
    const src = read('snapshot-checkpoint.js');
    assert.throws(() => assertSingleHit(src, 'function 绝不存在的锚点', 'v3282_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => assertSingleHit(src, 'function ', 'v3282_nmany'), /锚点/, '锚点不唯一必须抛');
    assert.throws(() => breakSource(src, A_NUM, A_NUM, 'v3282_same'), /改变|替换/, '同值替换必须抛');
    const broken = breakSource(src, A_NUM, 'function numOrNullZ(v) ', 'v3282_db');
    assert.notEqual(src, broken, '破坏须真的改变源码');
    assert.deepEqual(judge(readAll(), ALIAS_LEDGER), [], '原版上同判据必须真成立');
    const mods = readAll();
    mods['snapshot-checkpoint.js'] = broken;
    assert.notDeepEqual(judge(mods, ALIAS_LEDGER), [], '破坏副本上同判据必须真翻红');
    ok('两向自证通过；原版判据真、破坏副本真红');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3282 E1. ★★ 判据纯度：破坏锚点字面量在本档各只声明一次，且真源上各恰中一次', () => {
    const self = read(SELF_REL);
    /* 计数用**转义形态**（`\n` 两字符）只是保险：本档刻意只用**单行**声明行做锚点
     *   （多行体级锚点的缩进形态易漂，本轮已踩两次）。若将来改成多行锚点，
     *   下面这条「无多行锚点」的断言会先红，提醒计数口径要重判。 */
    for (const [label, a] of [['NUM', A_NUM], ['NUM2', A_NUM2], ['TO', A_TO], ['PF', A_PF]]) {
        assert.equal(a.includes(String.fromCharCode(10)), false, label + ' 须是单行锚点（计数口径依赖此事实）');
        const esc = a.replace(/\n/g, '\\n');
        const n = self.split(esc).length - 1;
        assert.equal(n, 1, label + ' 锚点字面量在本档须恰好出现 1 次（实 ' + n + '）');
    }
    /* 坐标在各被破坏文件里唯一 —— E1 与 C1/C2/C3 用的是同一批常量，故下面也是那几段的定点证明。 */
    assertSingleHit(read('snapshot-checkpoint.js'), A_NUM, 'v3282_h1');
    assertSingleHit(read('index.js'), A_NUM2, 'v3282_h2');
    assertSingleHit(read('archive-shift.js'), A_TO, 'v3282_h3');
    assertSingleHit(read('settings-ui.js'), A_PF, 'v3282_h4');
    ok('4 个破坏锚点字面量各只声明一次；4 个坐标在真源上各恰中一次');
});

/* ══════════════ F. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3282 F1. ★ 自防护：登记表与判据自身不得被摘掉；O7 既有真源特征仍在场', () => {
    assert.ok(read('index.js').includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(read('index.js').includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    assert.ok(read('snapshot-checkpoint.js').includes('numOrNull'), '本档第一簇的真源成员仍在场');
    const self = read(SELF_REL);
    const selfLen = self.length;
    assert.ok(selfLen > 6000, '本档自身不得被清空（实 ' + selfLen + ' 字符）');
    assert.ok(self.includes(A_SELF_LEDGER), '本档须逐字持有登记表锚点');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');
    ok('真源特征 / 登记表 / 本档自身均在位（' + selfLen + ' 字符）');
});

test('v3282 F2. ★ 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(read('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    /* [v3.283.0 交棒] 本档写于 3.282.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */
    assert.ok(vnum(pkg) >= vnum('3.282.0'), '本档版本下界 3.282.0 不得被绕过（实 ' + pkg + '）');
    ok('三源同源；本档锚 v3.282.0');
});
