/* ============================================================
 * tests/v3510_m5_o4.test.mjs — v3.351.0 · 第五期 M5-O4
 *   下一幕材料冲突按事实依据裁定
 *
 * 【本档要证明的六件事】
 *   A  superseded 材料不进包（packIds 中无 f1），且 held.superseded 具名 f1
 *      且 f1 的 why 为 'fact-superseded'（与楼层决胜的 'superseded' 不同形）；
 *   B  revoked 同理不进包，why 为 'fact-revoked'；
 *   C  disputed 保留双条（都进包但标 disputed），held.disputed 命中；
 *   D  同为 active 且无争议时仍按楼层决胜（旧口径不变）；
 *   E  没有 conflictGroup 的 superseded 材料也被标不可用（不漏网）；
 *   F  line() 读数包含 '争议保留' 字样（当 disputed > 0 时）。
 *
 * 【负控制：真源码破坏】
 *   破坏点：materialOf 的 usable 判据去掉 factState 过滤（已移除） →
 *   对破坏副本跑同款判据，必须现形（superseded 材料进包了）。
 *
 * 【当版锚点】本档自锚常量 BORN_V + vnum。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const MP_SRC = read('material-pack.js');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const SELF = read(path.join('tests', 'v3510_m5_o4.test.mjs'));
const BORN_V = '3.351.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/** 在隔离 vm 里加载 IIFE 模块。 */
function loadIIFE(src, globalName, extra) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    if (extra) for (const k of Object.keys(extra)) ctx[k] = extra[k];
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}

const MP = loadIIFE(MP_SRC, 'LonShaMaterialPack');

/* ══════════ 判据实现 ══════════ */

/** A: superseded 不进包 + 具名 + why 不同形 */
function judgeA(api) {
    const bad = [];
    const FACT = [
        { id: 'f1', facet: 'place', title: '旧教室', floor: 10, conflictGroup: 'h1', factState: 'superseded', source: 'recall' },
        { id: 'f2', facet: 'place', title: '新教室', floor: 7, conflictGroup: 'h1', factState: 'active', source: 'recall' },
    ];
    const fc = api.build('meet', FACT, { budget: 5 });
    if (fc.packIds.includes('f1')) bad.push('superseded 的 f1 进了包');
    if (!fc.packIds.includes('f2')) bad.push('active 的 f2 没进包');
    const sup = fc.held.superseded.find((s) => s.id === 'f1');
    if (!sup) bad.push('held.superseded 未具名 f1');
    else if (sup.why !== 'fact-superseded') bad.push('f1.why 应为 fact-superseded，实测 ' + sup.why);
    if (fc.counts.superseded === 0) bad.push('counts.superseded 应 >= 1');
    return bad;
}

/** B: revoked 不进包 + why 不同形 */
function judgeB(api) {
    const bad = [];
    const FACT = [
        { id: 'r1', facet: 'place', title: '老地方', floor: 10, conflictGroup: 'h2', factState: 'revoked', source: 'recall' },
        { id: 'r2', facet: 'place', title: '新地方', floor: 5, conflictGroup: 'h2', factState: 'active', source: 'recall' },
    ];
    const fc = api.build('meet', FACT, { budget: 5 });
    if (fc.packIds.includes('r1')) bad.push('revoked 的 r1 进了包');
    const sup = fc.held.superseded.find((s) => s.id === 'r1');
    if (!sup) bad.push('held.superseded 未具名 r1');
    else if (sup.why !== 'fact-revoked') bad.push('r1.why 应为 fact-revoked，实测 ' + sup.why);
    return bad;
}

/** C: disputed 保留双条 */
function judgeC(api) {
    const bad = [];
    const FACT = [
        { id: 'd1', facet: 'place', title: '甲说这里', floor: 10, conflictGroup: 'h3', factState: 'disputed', source: 'recall' },
        { id: 'd2', facet: 'place', title: '乙说那里', floor: 8, conflictGroup: 'h3', factState: 'disputed', source: 'recall' },
    ];
    const fc = api.build('meet', FACT, { budget: 5 });
    if (!fc.packIds.includes('d1')) bad.push('disputed 的 d1 应进包');
    if (!fc.packIds.includes('d2')) bad.push('disputed 的 d2 应进包');
    if (!fc.held.disputed || fc.held.disputed.length === 0) bad.push('held.disputed 为空');
    else if (fc.held.disputed[0].count !== 2) bad.push('disputed 应保留双条，实测 count=' + fc.held.disputed[0].count);
    return bad;
}

/** D: 同为 active 按楼层决胜（旧口径） */
function judgeD(api) {
    const bad = [];
    const FACT = [
        { id: 'a1', facet: 'place', title: '老地', floor: 10, conflictGroup: 'h4', factState: 'active', source: 'recall' },
        { id: 'a2', facet: 'place', title: '新地', floor: 5, conflictGroup: 'h4', factState: 'active', source: 'recall' },
    ];
    const fc = api.build('meet', FACT, { budget: 5 });
    if (!fc.packIds.includes('a1')) bad.push('楼层更大的 a1 应胜出进包');
    if (fc.packIds.includes('a2')) bad.push('楼层更小的 a2 不应进包');
    const sup = fc.held.superseded.find((s) => s.id === 'a2');
    if (!sup) bad.push('a2 应在 superseded 中');
    else if (sup.why !== 'superseded') bad.push('a2.why 应为 superseded（楼层淘汰），实测 ' + sup.why);
    return bad;
}

/** E: 没有 conflictGroup 的 superseded 也不进包 */
function judgeE(api) {
    const bad = [];
    const FACT = [
        { id: 's1', facet: 'place', title: '被废弃的', floor: 10, factState: 'superseded', source: 'recall' },
        { id: 's2', facet: 'place', title: '正常', floor: 5, factState: 'active', source: 'recall' },
    ];
    const fc = api.build('meet', FACT, { budget: 5 });
    if (fc.packIds.includes('s1')) bad.push('无 conflictGroup 的 superseded s1 不应进包');
    if (!fc.packIds.includes('s2')) bad.push('正常的 s2 应进包');
    return bad;
}

/** F: line() 读数包含 '争议保留' */
function judgeF(api) {
    const bad = [];
    const FACT = [
        { id: 'd1', facet: 'place', title: '甲说', floor: 10, conflictGroup: 'h5', factState: 'disputed', source: 'recall' },
        { id: 'd2', facet: 'place', title: '乙说', floor: 8, conflictGroup: 'h5', factState: 'disputed', source: 'recall' },
    ];
    const fc = api.build('meet', FACT, { budget: 5 });
    const line = api.line(fc);
    if (line.indexOf('争议保留') < 0) bad.push('line 读数应含 争议保留，实测: ' + line);
    return bad;
}

/* ══════════ 测试 ══════════ */

test('M5-O4 A: superseded 不进包 + why=fact-superseded', () => {
    const bad = judgeA(MP);
    assert.equal(bad.length, 0, bad.join('; '));
});

test('M5-O4 B: revoked 不进包 + why=fact-revoked', () => {
    const bad = judgeB(MP);
    assert.equal(bad.length, 0, bad.join('; '));
});

test('M5-O4 C: disputed 保留双条', () => {
    const bad = judgeC(MP);
    assert.equal(bad.length, 0, bad.join('; '));
});

test('M5-O4 D: 同为 active 仍按楼层决胜', () => {
    const bad = judgeD(MP);
    assert.equal(bad.length, 0, bad.join('; '));
});

test('M5-O4 E: 无 conflictGroup 的 superseded 也不进包', () => {
    const bad = judgeE(MP);
    assert.equal(bad.length, 0, bad.join('; '));
});

test('M5-O4 F: line 读数含 争议保留', () => {
    const bad = judgeF(MP);
    assert.equal(bad.length, 0, bad.join('; '));
});

/* ══════════ 版本锚点 ══════════ */

test('V4 版本锚：当版套件自锚 BORN_V 在 index.js 版本号语义区间', () => {
    const m = IDX.match(/const\s+VERSION\s*=\s*'([^']+)'/);
    assert.ok(m, 'index.js 中未找到 VERSION 常量');
    const idxV = vnum(m[1]);
    assert.ok(idxV >= vnum(BORN_V), 'index.js 版本 ' + m[1] + ' 低于 ' + BORN_V);
});

test('V4 版本锚：当版套件 BORN_V 出现在 SELF 源码中', () => {
    assert.ok(SELF.indexOf(BORN_V) >= 0, 'BORN_V 不在本档源码中');
});

/* ══════════ 负控制：真源码破坏 ══════════ */

test('H6 负控制：移除两处 factState 过滤 → 判据 A 必须转红', () => {
    /* 锚点1：resolveConflicts 中 filter inactive */
    const anchor1 = "const inactive = arr.filter(function (m) { return m.factState === 'superseded' || m.factState === 'revoked'; });";
    /* 锚点2：build 中兜底过滤 */
    const anchor2 = "if (m.usable && (m.factState === 'superseded' || m.factState === 'revoked'))";
    const escRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    assert.equal((MP_SRC.match(escRe(anchor1)) || []).length, 1, '锚点1 命中次数应为 1');
    assert.equal((MP_SRC.match(escRe(anchor2)) || []).length, 1, '锚点2 命中次数应为 1');

    /* 破坏：两处都改为永假 */
    const BROKEN_SRC = MP_SRC
        .replace(anchor1, 'const inactive = [];')
        .replace(anchor2, 'if (false)');
    assert.equal((BROKEN_SRC.match(escRe(anchor1)) || []).length, 0, '破坏后锚点1 应消失');
    assert.equal((BROKEN_SRC.match(escRe(anchor2)) || []).length, 0, '破坏后锚点2 应消失');

    const BROKEN = loadIIFE(BROKEN_SRC, 'LonShaMaterialPack');
    const bad = judgeA(BROKEN);
    assert.ok(bad.length > 0, '破坏副本上判据 A 必须转红（实测全绿 ⇒ 判据空转）');
});

test('H6 负控制：移除 build 兜底 factState 过滤 → 判据 E 必须转红', () => {
    const anchor = "if (m.usable && (m.factState === 'superseded' || m.factState === 'revoked'))";
    const escRe = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    assert.equal((MP_SRC.match(escRe(anchor)) || []).length, 1, '锚点命中次数应为 1');

    const BROKEN_SRC = MP_SRC.replace(anchor, 'if (false)');
    assert.equal((BROKEN_SRC.match(escRe(anchor)) || []).length, 0, '破坏后锚点应消失');

    const BROKEN = loadIIFE(BROKEN_SRC, 'LonShaMaterialPack');
    const bad = judgeE(BROKEN);
    assert.ok(bad.length > 0, '破坏副本上判据 E 必须转红');
});

/* ══════════ H5 判据纯度 ══════════ */

test('H5 判据纯度：锚点字符串在判据中仅出现在破坏逻辑里', () => {
    /* 锚点字面量在测试判据函数中不应出现（判据不应引用锚点字符串） */
    const judgeSrc = judgeA.toString();
    assert.ok(judgeSrc.indexOf('inactive') < 0, '判据 A 不应引用锚点字面量 inactive');
    assert.ok(judgeSrc.indexOf('arr.filter') < 0, '判据 A 不应引用锚点字面量 arr.filter');
});
