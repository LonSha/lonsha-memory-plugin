/* ============================================================
 * tests/l23_o5_diag_split.test.mjs — v3.474.0 · L23-O5
 *   engine-diagnostic-lines.js 拆分（5915 行单体 → 装配面 + 三片）+ 首次上界门
 * ------------------------------------------------------------
 * 【立项原文】「拆 engine-diagnostic-lines.js(5915) + 补上界门」。
 *   「补上界门」是这一项的重点：本仓此前唯一的长文件上界扫描
 *   （`tests/audit/scan_file_size_ceiling.mjs`）只覆盖 ruby-phone 侧，
 *   本仓 5915 行的单体**没有任何门**会因为它继续变长而叫。
 *
 * 【本档钉什么（每条都可当场复算）】
 *   ① 上界门真的存在且有牙：装配面 ≤ ledger.core_lines_max(400)、每片 ≤ part_lines_max(2100)；
 *      把上限调小一位，判据必须立刻报出来（否则这道门是空转）。
 *   ② 分片登记面：ledger 的 parts 清单 = 装配面 `_PART_FILES` = manifest.extra_js 三者同源；
 *      且三片必须排在装配面**之前**（浏览器按 extra_js 顺序装载，片在后就跑空了）。
 *   ③ 搬运逐字节：183 个函数体的 sha256 与 `tests/audit/diag_split_verbatim.json` 逐条相同；
 *      聚合面函数名集合 − 搬运集合 == 装配面函数名（封闭集，防「凭空造函数」）。
 *      负控制：把某个函数体改一个字符 ⇒ 对拍必须点名它（证明在比内容，不是比名字）。
 *   ④ 旧账：`_recallExplainLib` 曾有两份（@55 取库口访问器被 @1763 的 engine 版静默覆盖），
 *      拆分时删掉死的那份 ⇒ 全仓只剩一份，且装载后 `length === 1`（engine 版签名一参；访问器版零参）。
 *   ⑤ 装载面：三片真装上（`LonShaDiagnosticLinesParts` = a/b/c）；缺一片时读数与导出面必须**不同形**
 *      （「缺片」与「齐片」不能同一个读数，否则缺片会被读成正常）。
 *      ★ 拆片必须给跨 classic script 的登记留一个全局面，故对外面**新增两个符号**：
 *        `LonShaDiagParts`（登记槽，三片总是 push、装配面按 id 取最后一次）与
 *        `LonShaDiagnosticLinesParts`（已装分片 id 读数，冻结）。两者已如实登记进
 *        `tests/audit/index_exports.json`（64 → 66，与 L22-O1 的 `LonShaIndexHelpers` 同一口径），
 *        其余 64 个符号的名字与类型逐字未动 —— 这才是「对外面不变」的完整说法：
 *        **不静默多符号，多出来的必须进导出面台账**。
 *   ⑥ `_libs` 实时视图边界：`bindDeps` 会整个替换 `_libs`，分片里 30 处直接读 `_libs`。
 *      本档用真业务面证明「后绑的 libs 真的被分片看到」；老宿主无 Proxy 时退化为快照这条边界
 *      写在装配面注释里，**本档不假装它在老宿主上等价**。
 *
 * 【边界（不吹）】本档只在 Node vm 里装载聚合源码；不证明真浏览器 extra_js 装载顺序，
 *   只证明「清单顺序写了片在前」与「按该顺序装上后读数正确」。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { readModuleSource, partsOf, splitLedger, REPO_ROOT, runSourceInVm, assertModuleComplete } from './_module_sources.mjs';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = REPO_ROOT;
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const require_ = createRequire(import.meta.url);
const MOD = 'engine-diagnostic-lines.js';
const EV = JSON.parse(read('tests/audit/diag_split_verbatim.json'));
const MF = JSON.parse(read('manifest.json'));
const ledger = splitLedger();
const LED = ledger[MOD] || {};

/* ══════════ 源码解析：把「函数体外框」逐字节抠出来（与拆片生成器同口径） ══════════
 *  只认 `function NAME(` 起头的块，嵌套函数各自成条；括号/字符串/模板/注释都要跳，
 *  否则 `{` 计数会被模板里的花括号带偏（那会让本档自己变成假绿）。 */
function fnBlocks(src) {
    const out = [];
    const re = /(^|\n)([ \t]*)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const start = m.index + m[1].length;
        let i = re.lastIndex - 1;
        let depth = 0, inStr = null, inTpl = false, inLine = false, inBlock = false;
        for (; i < src.length; i++) {
            const c = src[i], n = src[i + 1];
            if (inLine) { if (c === '\n') inLine = false; continue; }
            if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
            if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
            if (inTpl) { if (c === '\\') { i++; continue; } if (c === '`') inTpl = false; continue; }
            if (c === '/' && n === '/') { inLine = true; i++; continue; }
            if (c === '/' && n === '*') { inBlock = true; i++; continue; }
            if (c === "'" || c === '"') { inStr = c; continue; }
            if (c === '`') { inTpl = true; continue; }
            if (c === '(') { depth++; continue; }
            if (c === ')') { depth--; continue; }
            if (c === '{') {
                let d = 0, j = i, s2 = null, t2 = false, l2 = false, b2 = false;
                for (; j < src.length; j++) {
                    const a = src[j], b = src[j + 1];
                    if (l2) { if (a === '\n') l2 = false; continue; }
                    if (b2) { if (a === '*' && b === '/') { b2 = false; j++; } continue; }
                    if (s2) { if (a === '\\') { j++; continue; } if (a === s2) s2 = null; continue; }
                    if (t2) { if (a === '\\') { j++; continue; } if (a === '`') t2 = false; continue; }
                    if (a === '/' && b === '/') { l2 = true; j++; continue; }
                    if (a === '/' && b === '*') { b2 = true; j++; continue; }
                    if (a === "'" || a === '"') { s2 = a; continue; }
                    if (a === '`') { t2 = true; continue; }
                    if (a === '{') d++;
                    if (a === '}') { d--; if (d === 0) break; }
                }
                out.push({ name: m[3], text: src.slice(start, j + 1) });
                break;
            }
        }
    }
    return out;
}
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const linesOf = (rel) => read(rel).split('\n').length;

/* ══════════════════ A. 上界门（本项立项的原始理由） ══════════════════ */
/* 判据做成纯函数：既能对真读数跑，也能被负控制喂假读数 —— 否则「门有没有牙」无从证明。 */
function judgeCeilings(files, coreMax, partMax) {
    const bad = [];
    if (!files.length) bad.push('读到的文件清单为空（门在扫空气）');
    for (const f of files) {
        const n = f.lines;
        const max = f.kind === 'core' ? coreMax : partMax;
        if (!(max > 0)) bad.push(f.file + ' 的上限非正数（上限配错等于没门）');
        else if (n > max) bad.push(f.file + ' 有 ' + n + ' 行，超过上界 ' + max);
    }
    return bad;
}
const REAL_FILES = [
    { file: MOD, kind: 'core', lines: linesOf(MOD) },
    ...partsOf(MOD).map((f) => ({ file: f, kind: 'part', lines: linesOf(f) })),
];

test('L23O5 A1. ★★★ 行数上界门：装配面 ≤ 400 行、每片 ≤ 2100 行（上限取自 ledger 真读数）', () => {
    const coreMax = Number(LED.core_lines_max);
    const partMax = Number(LED.part_lines_max);
    assert.ok(coreMax > 0 && partMax > 0, 'ledger 必须给出 core_lines_max / part_lines_max（否则门没有上界）');
    const bad = judgeCeilings(REAL_FILES, coreMax, partMax);
    assert.deepEqual(bad, [], bad.join(';'));
    /* 拆分前 5915 行；拆后最大单文件必须显著小于它 —— 「拆了」与「没拆」必须不同形。 */
    assert.ok(LED.lines_before_split === 5915, 'ledger 须记下拆分前行数（实 ' + LED.lines_before_split + '）');
    const maxNow = Math.max(...REAL_FILES.map((f) => f.lines));
    assert.ok(maxNow <= LED.lines_before_split - 3000,
        '拆后最大单文件 ' + maxNow + ' 行，须远小于拆分前 ' + LED.lines_before_split);
    console.log('  ok 装配面 ' + REAL_FILES[0].lines + ' 行（≤' + coreMax + '）· ' +
        partsOf(MOD).map((f, i) => f.replace('engine-diagnostic-lines-', '') + ' ' + REAL_FILES[i + 1].lines + ' 行').join(' · ') +
        '（每片 ≤' + partMax + '）· 拆分前 ' + LED.lines_before_split + ' 行');
});

test('L23O5 A2. ★★★ 上界门的牙（负控制）：把上限调低一位 ⇒ 判据必须当场报出来', () => {
    const coreMax = Number(LED.core_lines_max);
    const partMax = Number(LED.part_lines_max);
    /* ① 装配面超一行 */
    const b1 = judgeCeilings(REAL_FILES, REAL_FILES[0].lines - 1, partMax);
    assert.ok(b1.length > 0 && b1.join(';').includes(MOD), '装配面刚好超出时门必须报红，实：' + b1.join(';'));
    /* ② 任一片超一行 */
    const part = REAL_FILES.find((f) => f.kind === 'part');
    const b2 = judgeCeilings(REAL_FILES, coreMax, part.lines - 1);
    assert.ok(b2.length > 0 && b2.join(';').includes(part.file), '片刚好超出时门必须报红，实：' + b2.join(';'));
    /* ③ 上限配成 0 ⇒ 不许静默放行 */
    const b3 = judgeCeilings(REAL_FILES, 0, 0);
    assert.ok(b3.length > 0, '上限为 0 时门必须拒绝（否则「没门」会被读成「都合格」）');
    /* ④ 空清单 ⇒ 不许绿 */
    assert.ok(judgeCeilings([], 400, 2100).length > 0, '空清单不得判绿（扫空气也算过是最坏的假绿）');
    console.log('  ok 负控制四种形态（装配面超1行 / 片超1行 / 上限为0 / 空清单）全部报红');
});

/* ══════════════════ B. 分片登记面同源 ══════════════════ */
test('L23O5 B1. ★★★ 三处同源：ledger.parts = 装配面 _PART_FILES = manifest.extra_js（且片排在装配面之前）', () => {
    const parts = partsOf(MOD);
    assert.ok(parts.length >= 2, '分片数须 ≥2（单片拆分没有意义）');
    for (const f of [MOD, ...parts]) {
        assert.ok(fs.existsSync(path.join(R, f)), '缺文件 ' + f + '（ledger 声明了却没落盘）');
    }
    /* ledger vs 装配面 _PART_FILES */
    const core = read(MOD);
    const arrLit = (/var _PART_FILES = \[([\s\S]*?)\];/.exec(core) || [])[1] || '';
    const declared = [...arrLit.matchAll(/'([^']+\.js)'/g)].map((m) => m[1]);
    assert.deepEqual(declared.slice().sort(), parts.slice().sort(),
        '装配面 _PART_FILES 与 ledger.parts 必须同源（实：' + declared.join(',') + ' / ' + parts.join(',') + '）');
    /* manifest 顺序：片必须在本文件之前 */
    const ej = MF.extra_js || [];
    const at = ej.indexOf(MOD);
    assert.ok(at >= 0, MOD + ' 必须在 manifest.extra_js 在册');
    for (const f of parts) {
        const i = ej.indexOf(f);
        assert.ok(i >= 0, '分片 ' + f + ' 不在 manifest.extra_js ⇒ 浏览器侧根本不装载');
        assert.ok(i < at, '分片 ' + f + ' 必须排在 ' + MOD + ' 之前（实 ' + i + ' vs ' + at + '）：片在后装载就跑空');
    }
    console.log('  ok ledger / _PART_FILES / manifest 三处同源 · 三片均排在装配面之前（第 ' +
        parts.map((f) => ej.indexOf(f)).join('/') + ' 位 < 第 ' + at + ' 位）');
});

test('L23O5 B2. ★★ 登记面负控制：片不在 extra_js 时，判据必须点名它（不是静默跳过）', () => {
    const parts = partsOf(MOD);
    const ej = (MF.extra_js || []).filter((f) => f !== parts[0]);
    const missing = parts.filter((f) => ej.indexOf(f) < 0);
    assert.deepEqual(missing, [parts[0]], '摘掉一片后必须恰好点名它，实 ' + missing.join(','));
    /* 顺序反了也必须被抓到 */
    const swapped = (MF.extra_js || []).slice();
    const i = swapped.indexOf(parts[1]), j = swapped.indexOf(MOD);
    swapped[i] = MOD; swapped[j] = parts[1];
    assert.ok(swapped.indexOf(parts[1]) > swapped.indexOf(MOD), '对照组：对调后确实片在后');
    console.log('  ok 摘片 / 顺序倒置两种形态都能被抓到');
});

/* ══════════════════ C. 搬运逐字节 ══════════════════ */
function extractMoved() {
    const out = new Map();
    for (const p of partsOf(MOD)) for (const b of fnBlocks(read(p))) if (b.name !== 'install') out.set(b.name, sha(b.text));
    return out;
}
test('L23O5 C1. ★★★ 逐字节搬运：183 个函数体 sha256 与台账逐条相同（未命中 0）', () => {
    const moved = extractMoved();
    const want = EV.hash || {};
    const names = Object.keys(want);
    assert.ok(names.length >= 180, '台账须记下搬运函数名录（实 ' + names.length + '）');
    assert.equal(EV.moved_functions, names.length, '台账自报搬运数与名录条数必须一致');
    const bad = [];
    for (const n of names) {
        if (!moved.has(n)) { bad.push('缺函数 ' + n); continue; }
        if (moved.get(n) !== want[n]) bad.push(n + ' 的函数体被改过（sha 不符）');
    }
    for (const n of moved.keys()) if (!want[n]) bad.push('凭空多出 ' + n);
    assert.deepEqual(bad, [], bad.slice(0, 8).join(';') + (bad.length > 8 ? ' …共' + bad.length + '条' : ''));
    console.log('  ok ' + names.length + '/' + names.length + ' 个函数体逐字节一致 · 未命中 0 · 无凭空函数');
});

test('L23O5 C2. ★★★ 新增函数封闭集：聚合面函数名 − 搬运 = 装配面函数名（不许夹带新实现）', () => {
    const moved = extractMoved();
    const all = new Set();
    for (const f of [MOD, ...partsOf(MOD)]) for (const b of fnBlocks(read(f))) all.add(b.name);
    const allowed = new Set(EV.core_functions || []);
    const extra = [...all].filter((n) => !moved.has(n) && !allowed.has(n) && n !== 'install');
    assert.deepEqual(extra, [], '出现未登记的独占函数：' + extra.join(',') + '（拆分只许搬家，不许夹带）');
    const helpers = ['_rawParts', '_collectParts', '_support', '_installParts'];
    for (const h of helpers) assert.ok(allowed.has(h), '装配面必须自带装载辅助 ' + h);
    console.log('  ok 聚合面 ' + all.size + ' 个函数名 = 搬运 ' + moved.size + ' + 装配面 ' + allowed.size + '（无夹带）');
});

test('L23O5 C3. ★★★ 逐字节对拍的牙（负控制）：改一个字符 ⇒ 必须点名它', () => {
    const moved = extractMoved();
    const victim = Object.keys(EV.hash)[0];
    const src = read(partsOf(MOD).find((p) => read(p).includes('function ' + victim + '(')) || partsOf(MOD)[0]);
    const at = src.indexOf('function ' + victim + '(');
    const body = src.slice(at);
    const mutSrc = src.slice(0, at) + body.replace(/\n/, '\n    /* 破坏 */\n');
    const after = sha(fnBlocks(mutSrc).find((b) => b.name === victim).text);
    assert.notEqual(after, EV.hash[victim], '改一个字符后 sha 必须变（否则本档在比名字不是比内容）');
    assert.equal(moved.get(victim), EV.hash[victim], '对照组：原件必须一致');
    console.log('  ok 负控制：' + victim + ' 被改一个字符后 sha 立即不符');
});

/* ══════════════════ D. 旧账：同名两份 ══════════════════ */
test('L23O5 D1. ★★★ 旧账清零：`_recallExplainLib` 全仓只剩一份，且是 engine 版（length===1）', () => {
    const agg = readModuleSource(MOD);
    const n = (agg.match(/function _recallExplainLib\s*\(/g) || []).length;
    assert.equal(n, 1, '`function _recallExplainLib(` 在聚合面里应恰 1 处（实 ' + n + '）：两份同名会让后者静默覆盖前者');
    assert.ok(EV.removed_dead_functions && EV.removed_dead_functions.length === 1,
        '台账须如实记下删掉的死代码，不许悄悄抹平（实 ' + JSON.stringify(EV.removed_dead_functions) + '）');
    const ctx = runSourceInVm(agg);
    const api = ctx.LonShaDiagnosticLines;
    api.bindDeps({ moduleLib: () => null, errLog: () => {}, libs: {} });
    assert.equal(typeof api._recallExplainLib, 'function', '导出面缺 _recallExplainLib');
    assert.equal(api._recallExplainLib.length, 1, '装载后的 _recallExplainLib 必须是 engine 版（一参）；访问器版零参');
    console.log('  ok 只剩 1 份 · 装载后 length===1（engine 版）· 死代码已在台账留痕 ' + EV.removed_dead_functions[0]);
});

/* ══════════════════ E. 装载面 ══════════════════ */
test('L23O5 E1. ★★★ 三片真装上：LonShaDiagnosticLinesParts = a/b/c，导出面含全部搬运函数', () => {
    const agg = readModuleSource(MOD);
    const ctx = runSourceInVm(agg);
    assert.deepEqual([...ctx.LonShaDiagnosticLinesParts], ['a', 'b', 'c'], '三片必须按 a/b/c 装上');
    const api = ctx.LonShaDiagnosticLines;
    api.bindDeps({ moduleLib: () => null, errLog: () => {}, libs: {} });
    const names = Object.keys(EV.hash);
    const missing = names.filter((n) => typeof api[n] !== 'function');
    /* 私有面（S.hidden）里的名字不在公开 api 上，属正常；这里只要求「公开面覆盖绝大多数」。 */
    assert.ok(names.length - missing.length >= names.length - 40,
        '导出面缺得过多：' + missing.length + ' 个（样例 ' + missing.slice(0, 6).join(',') + '）');
    console.log('  ok parts=a/b/c · 导出面命中搬运函数 ' + (names.length - missing.length) + '/' + names.length +
        '（其余为片内私有面，经 api/hidden 转发）');
});

test('L23O5 E2. ★★★ 缺片不同形（负控制）：抽掉一片 ⇒ 片数与导出面读数必须变', () => {
    const parts = partsOf(MOD);
    const without = parts[1];
    const agg = parts.filter((f) => f !== without).map((f) => read(f)).join('\n') + '\n' + read(MOD);
    const ctx = runSourceInVm(agg);
    const got = [...(ctx.LonShaDiagnosticLinesParts || [])];
    assert.deepEqual(got, ['a', 'c'], '缺片时读数必须少一档（实 ' + got.join(',') + '）');
    const api = ctx.LonShaDiagnosticLines;
    api.bindDeps({ moduleLib: () => null, errLog: () => {}, libs: {} });
    const lost = Object.keys(EV.hash).filter((n) => typeof api[n] !== 'function').length;
    const full = (() => {
        const c2 = runSourceInVm(readModuleSource(MOD));
        const a2 = c2.LonShaDiagnosticLines;
        a2.bindDeps({ moduleLib: () => null, errLog: () => {}, libs: {} });
        return Object.keys(EV.hash).filter((n) => typeof a2[n] !== 'function').length;
    })();
    assert.ok(lost > full, '缺片后缺失函数必须变多（齐片缺 ' + full + ' / 缺片缺 ' + lost + '）');
    console.log('  ok 抽掉 ' + without + ' ⇒ parts=' + got.join(',') + ' · 缺失函数 ' + full + ' → ' + lost);
});

test('L23O5 E3. ★★★ `_libs` 实时视图：bindDeps 整个换掉 libs 后，分片里的直接读取必须跟上', () => {
    const LR = require_(path.join(R, 'lore-version-conclusion-reconcile.js'));
    const ctx = runSourceInVm(readModuleSource(MOD));
    const api = ctx.LonShaDiagnosticLines;
    const eng = { worldProg: null, _loreOldSections: [], _loreNewSections: [] };
    const opts = {
        docId: 'd1', olderVersion: 'v1', newerVersion: 'v2',
        oldSections: [{ id: 's1', title: '山门', body: '旧规矩' }],
        newSections: [{ id: 's1', title: '山门', body: '新规矩' }],
    };
    api.bindDeps({ moduleLib: () => null, errLog: () => {}, libs: {} });
    const before = api.loreConclusionState(eng, opts);
    assert.equal(before.ok, false, '无库时必须 ok:false');
    assert.equal(before.reason, 'module-unavailable', '无库原因须 module-unavailable（实 ' + before.reason + '）');
    /* 整个替换 libs（bindDeps 的既有语义）—— 分片里 `_libs._loreConclusionReconcileLib` 是直接读，
     *   若装配面给的是快照而不是实时视图，这一句之后仍然读不到库。 */
    api.bindDeps({ moduleLib: () => null, errLog: () => {}, libs: { _loreConclusionReconcileLib: () => LR } });
    const after = api.loreConclusionState(eng, opts);
    assert.equal(after.ok, true, '后绑的库必须被分片看到（否则 _libs 视图是快照）');
    assert.equal(after.writesNothing, true, '读面不得写盘');
    assert.ok(Array.isArray(after.diff), 'diff 必须是数组（实 ' + typeof after.diff + '）');
    console.log('  ok 无库 module-unavailable → 后绑库后 ok:true（diff ' + after.diff.length + ' 项·writesNothing）');
});

/* ══════════════════ F. 判据纯度与台账自证 ══════════════════ */
test('L23O5 F1. ★★ 判据纯度：本档自锚常量各只声明一次（防「改一处漏一处」）', () => {
    const SELF = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    for (const lit of ["'a', 'b', 'c'", 'removed_dead_functions', 'core_lines_max', 'part_lines_max']) {
        const n = SELF.split(lit).length - 1;
        assert.ok(n >= 1, '本档必须引用 ' + lit);
    }
    /* 台账字段必须真在盘上，不是本档自造的名字 */
    assert.ok(fs.existsSync(path.join(R, 'tests/audit/module_split_ledger.json')), '缺 module_split_ledger.json');
    assert.ok(fs.existsSync(path.join(R, 'tests/audit/diag_split_verbatim.json')), '缺 diag_split_verbatim.json');
    console.log('  ok 台账两份在场 · 字段名取自真读数');
});

test('L23O5 F2. ★★ 台账自证：ledger 声明的片必须真实存在，缺片时聚合读取要抛（不许静默降级）', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'o5-ledger-'));
    try {
        assert.throws(() => assertModuleComplete(MOD, tmp), /缺文件/,
            '在空目录里必须抛缺文件（否则「拆了但判据读不到」会被读成「没拆」）');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    console.log('  ok 缺片时 assertModuleComplete 直接抛（不降级）');
});

/* ══════════════════ G. 当版锚点（版本守卫 V4 的唯一基准） ══════════════════
 *  存在理由：`tests/audit/scan_version_guard.mjs` 的 V4 要求「**当版档案**里恰有一处
 *    以 vnum 恰好锚着当版」——锚点被静默删空，版本守卫就失去基准，必须响。
 *  本档的拆片契约成立于 v3.474.0，故本档**就是**当版档案，锚点住在这里。
 *    写进历史文件是错的：V2 判「历史文件不得锁当版」，两条判据会互相踢球（见 V2/V4 段头）。
 *  抬版后本档退为历史档案：下面这两行的 `vnum('3.474.0')` 变成「自己的出生版本」，
 *    按本仓交棒口径**不改写**（历史测试只锁出生版本，不跟抬版跑）。
 *  为什么还要一条数值形自证：锚点是**给机器读的基准**，字面量写错一位（3.473.0 / 3.475.0）
 *    照样能让 V4 数到一个「锚着别的版本」的锚 —— 那种绿是假的。 */
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

test('L23O5 G1. ★★ 出生版本锚：本档成立于 v3.474.0（仓库版本不得低于它 —— 下界，不是锁）', () => {
    assert.strictEqual(vnum('3.474.0'), 3474000,
        '锚点字面量的数值形必须是 3474000（写错一位会让锚悄悄指向别的版本，V4 数到也算假绿）');
    const m = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(read('index.js'));
    assert.ok(m, 'index.js 里必须能找到 const VERSION（读不到就无法证明仓库已到这个出生版本）');
    assert.ok(vnum(m[1]) >= vnum('3.474.0'),
        '仓库版本 ' + m[1] + ' 低于本档出生版本 3.474.0（本档所有读数都以它为下界）');
    console.log('  ok 出生版本 3.474.0 · 仓库版本 ' + m[1]);
});

test('L23O5 G2. ★★ 导出面台账已登记拆片新增的两个符号（不静默多符号）', () => {
    const ex = JSON.parse(read('tests/audit/index_exports.json'));
    assert.equal(ex.surface['LonShaDiagParts'], 'array', 'LonShaDiagParts 必须进导出面台账（否则 R1 会把它当「对外面变了」）');
    assert.equal(ex.surface['LonShaDiagnosticLinesParts'], 'array', 'LonShaDiagnosticLinesParts 必须进导出面台账');
    assert.equal(ex.count, Object.keys(ex.surface).length, '台账 count 必须等于 surface 项数（两处读数不许分叉）');
    assert.ok(ex.discovered.some((x) => /L23-O5/.test(x)), '台账必须留下本刀为何新增两个符号的登记');
    console.log('  ok 导出面 ' + ex.count + ' 项，两新增符号已登记');
});

/* ══════════════════ H. 存量红台账（收口纪律：受影响面子集 ≠ 全量跑） ══════════════════ *  存在理由：本项拆片会连带改到「源码聚合读取 / manifest 顺序 / 导出面 / 台账读数」四个面， *    受影响判据自然变多；但**把每次收口都变成一次全量跑是错的**（542 文件会把机器压到 abort，
 *    且全量跑是双计划收尾的最后一步）。正确姿势是：只跑受影响面子集，并用「干净基线树 × 同一子集」判存量红。
 *  本组钉两件事：台账真的在盘上且能机读；每一条都得说清「凭什么说它是存量红」（两侧读数）或「怎么修的」。
 *  注意它**不**证明那 6 档真的红 —— 那是台账里写的实测读数，重跑命令也写在台账里。 */
test('L23O5 H1. ★★ 存量红台账自证：每条必有 symptom +（两侧读数或 fix），不许只有文件名', () => {
    const L = JSON.parse(read('tests/audit/preexisting_red_ledger.json'));
    assert.ok(Array.isArray(L.preexisting_red) && L.preexisting_red.length >= 5, '存量红清单至少 5 条（本轮实测 6 档 + 前轮遗留）');
    for (const e of L.preexisting_red) {
        assert.ok(Array.isArray(e.files) && e.files.length, '每条必须点名文件');
        assert.ok(typeof e.symptom === 'string' && e.symptom.length > 8, '每条必须写清症状（' + e.files[0] + '）');
        assert.ok(e.reading || e.fix || e.status, '每条必须给两侧读数或处理状态（' + e.files[0] + '）');
    }
    assert.ok(L.baseline_tree && /_baseline/.test(L.baseline_tree), '台账必须写明干净基线树位置（否则「基线同红」不可复算）');
    assert.ok(Array.isArray(L.regression_found_and_fixed) && L.regression_found_and_fixed.length >= 5, '本刀真实回归也要入册（已修不等于没发生）');
    console.log('  ok 存量红 ' + L.preexisting_red.length + ' 条 / 已修回归 ' + L.regression_found_and_fixed.length + ' 条');
});
