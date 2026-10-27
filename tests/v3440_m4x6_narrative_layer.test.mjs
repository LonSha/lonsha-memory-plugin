/* ============================================================
 * tests/v3440_m4x6_narrative_layer.test.mjs — v3.344.0 · M4-X6
 * 梦境、假设、计划与现实的叙事层记忆(层轴 + 现实面隔离 + 计划落实闸)
 *
 * 【本档要证明的四件事(不是「函数返回了对象」)】
 *   a) **层轴与事实类型正交**:同为一条事实,标 reality / dream / hypothesis /
 *      plan / quote 后**逐层可分**;五层 + unspecified 一格不缺;
 *   b) **现实面隔离**:梦里的死、假设里的搬走、一句「决定了」的计划、他人转述
 *      ⇒ **一条都不进** realityView(修前缺口:现实问答吃到非现实结果);
 *   c) **计划落实闸**:说了 done 但**无事件关联** ⇒ 仍读 planned
 *      (M4-X6 验收原文:不因一句「决定了」自动完成);
 *   d) **嵌套可见**:梦里想「如果搬走」⇒ frame 链 depth 2(上限 MAX_FRAMES,
 *      不无限细分),定向回看问得出来。
 *
 * 【三条「不做」也在判据里】
 *   1 不以关键词「梦」一票判定:无标注一律 unspecified,hintOf 只作**提示读数**;
 *   2 不无限细分叙事层:frame 链上限 MAX_FRAMES;
 *   3 不追溯改写无证据的旧记忆:无标注不猜、不重标(读数带 unspecified 计数)。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形;
 *   并反向对照「原版同判据必须通过」。判据纯度(H5)单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum(锚必须住在当版档案里,供版本守卫 V4 计数)。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红（本档即如此）。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = __hostSurface();
const DL = read('engine-diagnostic-lines.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const NL_SRC = read('narrative-layer.js');
const SELF = read(path.join('tests', 'v3440_m4x6_narrative_layer.test.mjs'));
const BORN_V = '3.344.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
/** 在隔离 vm 里加载 IIFE 模块(与生产同形:window 即全局,module 缺席)。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const NL = loadIIFE(NL_SRC, 'LonShaNarrativeLayer');
/* ══════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════ */
const ANCHORS = Object.freeze({
    /* 内核·显式标注:置假 ⇒ 层判定永不成案(实测红:五层判据 B1 全落 unspecified)。 */
    kExplicit: String.raw`if (hit) return { modality: hit, stated: true, via: 'explicit:' + k, raw: clip(v, 24) };`,
    /* 内核·现实面隔离:置假 ⇒ 现实面把非现实条目也收进来(实测红:B2 拿到 count>1)。 */
    kReality: String.raw`if (it && it.stated === true && it.modality === REALITY) keep.push(it);`,
    /* 内核·计划闸:置假 ⇒「说了 done 但无事件关联」被读成已完成(实测红:B3 拿到 done 2)。 */
    kPlanGate: String.raw`if (saidDone && eventRef) {`,
    /* 内核·嵌套框架:置假 ⇒ frame 链永不入链(实测红:B4 深度拿到 0)。 */
    kFrames: String.raw`chain.push(text);`,
    /* 宿主·喂条目:置空 ⇒ 宿主两路取数都拿不到真源(实测红:宿主判据 C1/C6 拿到空盘)。 */
    hItems: String.raw`const items = Array.isArray(o.items) ? o.items`,
    /* 宿主·现实面接线:喂空读 ⇒ 宿主 realityView 拿不到内核真源(实测红:宿主判据 C2 拿到 count 0)。 */
    hReality: String.raw`const rv = NL.realityView(read);`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    'narrativeLayer(...args) {',
    'narrativeReality(...args) {',
    'narrativeProject(...args) {',
    '_narrativeLayerLine(...args) {',
];
function judgeStruct(idxSrc, mf) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idxSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次(应恰 1)');
    }
    if (idxSrc.indexOf('function _narrativeLayerLib() {') < 0) bad.push('缺取库口 _narrativeLayerLib');
    if (idxSrc.indexOf("'narrative-layer.js'") < 0) bad.push('缺模块文件名声明');
    if (idxSrc.indexOf("return ['叙事层', '模块未加载(narrative-layer.js)'];") < 0) bad.push('缺自检行「叙事层」');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('narrative-layer.js') < 0) bad.push('manifest.extra_js 缺 narrative-layer.js');
    /* ★ 只读层判定:本刀**不新增任何持久化键** —— 层标注落在既有条目上(modality 字段)。 */
    if (idxSrc.indexOf('narrativeLayer:') >= 0) bad.push('出现了持久化契约键 narrativeLayer:(本面应零落盘)');
    if (/data\.narrativeLayer/.test(idxSrc)) bad.push('出现了 data.narrativeLayer 还原面(本面应零落盘)');
    /* ★ 不能用 /narrativ/i 宽匹配:归档键里**既有** narrativeEntropy,宽匹配会误报。 */
    const arch = (/const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    const carry = (/const CARRYOVER_EXEMPT_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    if (/'narrativeLayer'/.test(arch) || /'narrativeLayer'/.test(carry)) bad.push('叙事层混进了归档/跨卷键(本面不持久化)');
    return bad;
}
test('v3440 A1. **** 宿主四面各恰一处 + 取库口 + 自检行 + extra_js 登记 + **零落盘面**', () => {
    assert.deepEqual(judgeStruct(IDX, MF), [], judgeStruct(IDX, MF).join(';'));
        /* [v3.345.0 M4-X7 交棒] 原文是硬等号 109;改为**出生值下界**(与本档 A1 的
     *   「narrative-layer.js 在册」在场性判据互补:那里判的是本模块在场,这里判的是数量不缩水)。 */
    assert.ok(MF.extra_js.length >= 109, 'extra_js 不得低于本档出生值 109(实 ' + MF.extra_js.length + ')');
    console.log('  ok 四面各恰 1 次 / 取库口 / 自检行 / extra_js 109 / 无持久化键');
});
function judgeKernel(nl) {
    const bad = [];
    if (nl.NL_VERSION !== 1) bad.push('NL_VERSION 应 1,实 ' + nl.NL_VERSION);
    if (nl.NL_KIND !== 'narrative_layer') bad.push('NL_KIND 不对:' + nl.NL_KIND);
    for (const s of ['reality', 'dream', 'hypothesis', 'plan', 'quote']) {
        if (nl.MODALITIES.indexOf(s) < 0) bad.push('MODALITIES 缺 ' + s);
    }
    if (nl.MODALITIES.length !== 5) bad.push('MODALITIES 应恰 5 层,实 ' + nl.MODALITIES.length);
    if (nl.UNSPECIFIED !== 'unspecified') bad.push('UNSPECIFIED 不是独立一格');
    if (nl.REALITY !== 'reality') bad.push('REALITY 常量不对');
    for (const f of ['build', 'modalityOf', 'frameOf', 'hintOf', 'planStateOf', 'itemOf', 'realityView', 'projectOf', 'line', 'selfCheck']) {
        if (typeof nl[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    /* 自证七项:确定性 / 零写面 / 五层齐 / 现实面隔离 / 无百分比 / 计划闸 / 可序列化。 */
    const sc = nl.selfCheck([
        { character: '甲', fact: 'probe-real', modality: 'reality', floor: 1 },
        { character: '甲', fact: 'probe-dream', modality: 'dream', floor: 2 }
    ]);
    if (sc.ok !== true) bad.push('selfCheck 对合法输入报红:' + JSON.stringify(sc));
    if (sc.writeFaces !== 0) bad.push('selfCheck 数出写面:' + sc.writeFaces);
    if (sc.percentFree !== true) bad.push('selfCheck 未守住「不产百分比」');
    if (sc.realityIsolated !== true) bad.push('selfCheck 未守住「现实面隔离」');
    if (sc.planGate !== true) bad.push('selfCheck 未守住「计划落实闸」');
    if (sc.deterministic !== true || sc.serializable !== true) bad.push('selfCheck 确定性/可序列化未过');
    return bad;
}
test('v3440 A2. **** 内核面:版本 + 五层 + 一格未标注 + 十原语 + 自证七项', () => {
    assert.deepEqual(judgeKernel(NL), [], judgeKernel(NL).join(';'));
    console.log('  ok NL_VERSION 1 / 五层 / unspecified 独立 / build·realityView·planStateOf / 自证七项全过');
});
/* ══════════════ B. 真跑(内核,纯函数) ══════════════ */
/* 夹具:**类型层相同、叙事层不同** —— 同一条「甲死亡」在现实与在梦里各一份(本刀要害)。 */
const F_FIVE = [
    { character: '甲', fact: '甲在桥头落水(现实)', modality: 'reality', floor: 3 },
    { character: '甲', fact: '甲梦见自己死了', modality: 'dream', floor: 4, frame: '甲的那场梦' },
    { character: '乙', fact: '若当初不走,乙会留下', modality: 'hypothesis', floor: 4, frame: '乙的推演' },
    { character: '乙', fact: '乙打算月底搬走', modality: 'plan', floor: 5, status: 'planned' },
    { character: '丙', fact: '丙说甲还活着', modality: 'quote', floor: 6 },
    { character: '丁', fact: '丁在门口等过(无标注)', floor: 7 }
];
/** 判据 a:五层各一 + 一格未标注;每条 stated 与层号自洽。 */
function judgeModality(nl) {
    const r = nl.build(F_FIVE, {});
    if (r.counts.used !== 6) throw new Error('应 6 条入面,实 ' + r.counts.used);
    const want = { reality: 1, dream: 1, hypothesis: 1, plan: 1, quote: 1, unspecified: 1 };
    for (const k of Object.keys(want)) {
        if (r.byLayer[k] !== want[k]) throw new Error('层 ' + k + ' 应 ' + want[k] + ' 条,实 ' + r.byLayer[k]);
    }
    for (const it of r.items) {
        if (it.modality === 'unspecified' && it.stated !== false) throw new Error('未标注条目不得 stated=true');
        if (it.modality !== 'unspecified' && it.stated !== true) throw new Error('显式标注条目应 stated=true:' + it.fact);
    }
    return r;
}
test('v3440 B1. ★★ 层轴:同一条事实标五层后逐层可分 + 未标注独立成格(不猜)', () => {
    const r = judgeModality(NL);
    console.log('  ok 六条入面 / 现实·梦·假设·计划·引述各 1 / 未标注 1(stated=false)');
});
/** 判据 b:现实面隔离 —— 非现实条目**一条都不进** realityView。 */
function judgeReality(nl) {
    const r = nl.build(F_FIVE, {});
    const rv = nl.realityView(r);
    if (rv.count !== 1) throw new Error('现实面应恰 1 条,实 ' + rv.count);
    if (rv.items[0].fact.indexOf('现实') < 0) throw new Error('现实面拿到的不是现实条目:' + rv.items[0].fact);
    if (rv.excluded !== 5) throw new Error('现实面应排除 5 条非现实,实 ' + rv.excluded);
    if (rv.realityOnly !== true || rv.writesNothing !== true) throw new Error('现实面形状不对');
    return rv;
}
test('v3440 B2. ★★★ 现实面隔离:梦里的死 / 假设 / 计划 / 引述 **一条都不进**(修前缺口正解)', () => {
    judgeReality(NL);
    console.log('  ok 现实面 1 条 / 排除 5 条非现实 / realityOnly+writesNothing');
});
/** 判据 c:计划落实闸 —— 说了 done 但无事件关联 ⇒ 仍 planned。 */
function judgePlanGate(nl) {
    const r = nl.build([
        { character: '乙', fact: '乙决定要搬(说 done 无关联)', modality: 'plan', status: 'done', floor: 5 },
        { character: '乙', fact: '乙已搬到新址(带事件关联)', modality: 'plan', status: 'done', eventRef: 'E-9', floor: 9 }
    ], {});
    if (r.counts.planDone !== 1) throw new Error('已落实应恰 1 条,实 ' + r.counts.planDone);
    if (r.counts.planAwaitingEvent !== 1) throw new Error('「说落实但无关联」应恰 1 条,实 ' + r.counts.planAwaitingEvent);
    const awaiting = r.items.filter((x) => x.planReason === 'done-without-event-ref');
    if (awaiting.length !== 1 || awaiting[0].planState !== 'planned') {
        throw new Error('无事件关联的 done 必须仍读 planned(实 ' + (awaiting[0] && awaiting[0].planState) + ')');
    }
    return r;
}
test('v3440 B3. ★★★ 计划落实闸:一句「决定了」**不自动完成**(仍 planned)/ 带事件关联才成案', () => {
    judgePlanGate(NL);
    console.log('  ok done 1 / 待事件关联 1(仍 planned)/ done-with-event-ref 成案');
});
/** 判据 d:嵌套框架可见且有界。 */
function judgeFrames(nl) {
    const f = nl.frameOf({ frame: { text: '甲的那场梦', within: { text: '如果当初搬走' } } });
    if (f.depth !== 2) throw new Error('嵌套框架深度应 2,实 ' + f.depth);
    if (f.text !== '如果当初搬走') throw new Error('最内层框架取错:' + f.text);
    if (f.chain.length !== 2) throw new Error('框架链应 2 环,实 ' + f.chain.length);
    /* 上限:再往里嵌 6 层也不得超过 MAX_FRAMES(不无限细分)。 */
    let deep = { text: 'L0' };
    for (let i = 1; i <= 6; i++) deep = { frame: deep, text: 'L' + i };
    const g = nl.frameOf(deep);
    if (g.depth > nl.MAX_FRAMES) throw new Error('框架链应被 MAX_FRAMES 截断,实 depth ' + g.depth);
    const nested = nl.build([{ character: '甲', fact: '梦里想如果搬走', modality: 'dream', floor: 2, frame: { text: '梦', within: { text: '如果搬走' } } }], {});
    const pj = nl.projectOf(nested, { layer: 'dream' });
    if (pj.layers[0].nested !== 1) throw new Error('分层投影未报出嵌套计数(实 ' + pj.layers[0].nested + ')');
    return f;
}
test('v3440 B4. ★★ 嵌套可见且有界:梦里想「如果搬走」⇒ depth 2 / 超 MAX_FRAMES 截断', () => {
    judgeFrames(NL);
    console.log('  ok 深度 2 / 最内层取字面 / 超过上限被截断 / 分层投影报 nested 1');
});
/** 三条「不做」之一:不以关键词「梦」一票判定 —— 无标注一律 unspecified(提示只作读数)。 */
function judgeNoGuess(nl) {
    const r = nl.build([
        { character: '甲', fact: '梦见下雨了', floor: 1 },
        { character: '乙', fact: '打算搬走', floor: 2 }
    ], {});
    if (r.counts.unspecified !== 2) throw new Error('无标注应两条皆 unspecified,实 ' + r.counts.unspecified);
    if (r.counts.dream !== 0 || r.counts.plan !== 0) throw new Error('关键词不得一票判定成层');
    if (r.counts.hinted !== 2) throw new Error('线索词提示应 2 条(只作读数),实 ' + r.counts.hinted);
    const hints = r.items[0].hint;
    if (hints.indexOf('dream') < 0) throw new Error('hintOf 未报出梦线索:' + JSON.stringify(hints));
    if (r.items[0].modality !== 'unspecified') throw new Error('有线索词但仍须 unspecified(不猜)');
    return r;
}
test('v3440 B5. ★★ 不猜:有「梦」线索词仍 unspecified(hintOf 只作提示读数)', () => {
    judgeNoGuess(NL);
    console.log('  ok 两条未标注 / 层计数 0 / 提示读数 2(梦·计划)/ 层仍 unspecified');
});
/* ══════════════ C. 宿主出口(真方法体 + 真内核 + 真 opts 源) ══════════════ */
function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === '\n' && c !== '`') break;
                k++;
            }
            i = k - 1;
            continue;
        }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {',
    'function _narrativeLayerLib() {',
];
const METH_FNS = [
    'narrativeLayer(...args) {',
    'narrativeReality(...args) {',
    'narrativeProject(...args) {',
    '_narrativeLayerLine(...args) {',
];

/** 从 engine-diagnostic-lines.js 提取方法体，转回类方法格式（engine.→this.）。 */
function extractModuleMethod(source, funcMarker) {
    const start = source.indexOf(funcMarker);
    if (start < 0) return null;
    const bodyStart = start + funcMarker.length - 1;
    if (source[bodyStart] !== '{') return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    let body = source.slice(bodyStart + 1, end);
    body = body.replace(/\bengine\./g, 'this.');
    const asyncP = funcMarker.startsWith('async ') ? 'async ' : '';
    const nm = funcMarker.match(/(?:async\s+)?function\s+(\w+)\s*\(engine(?:,\s*(.*?))?\)\s*\{/);
    if (!nm) return null;
    const params = nm[2] !== undefined ? nm[2] : '';
    return asyncP + nm[1] + '(' + params + ') {' + body + '}';
}

function mkHost(win, src) {
    /* [v3.361.0 剥离] 方法体从 DL 提取(engine.→this.)，*Lib() 从 window 取模块 */
    const idx = src || IDX;
    const moduleLibFn = sliceMember(idx, 'function _moduleLib(getGlobal, fileName) {');
    if (!moduleLibFn) throw new Error('切片缺失: _moduleLib');
    const dlFuncs = [
        'function _narrativeLayerLib() { return (typeof window !== "undefined" && window.LonShaNarrativeLayer) ? window.LonShaNarrativeLayer : null; }',
    ];
    const meths = [
        extractModuleMethod(DL, 'function narrativeLayer(engine, opts) {'),
        extractModuleMethod(DL, 'function narrativeReality(engine, opts) {'),
        extractModuleMethod(DL, 'function narrativeProject(engine, opts) {'),
        extractModuleMethod(DL, 'function _narrativeLayerLine(engine) {'),
    ];
    if (meths.some((x) => !x)) throw new Error('DL 方法体提取缺失');
    const code = moduleLibFn + '\n' + dlFuncs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });';
    return new Function('errLog', 'window', code)(() => {}, win);
}
const NL_WIN = () => ({ LonShaNarrativeLayer: NL });
function nlSelf(win, src) {
    return Object.assign(mkHost(win, src), {
        _narrativeLayerRead: null,
        _lastInjection: 'SENTINEL'
    });
}
function judgeHostLayer(src, items) {
    const self = nlSelf(NL_WIN(), src);
    const r = self.narrativeLayer({ items: items || F_FIVE });
    if (r.ok !== true) throw new Error('宿主出口未成功(reason=' + r.reason + ')');
    if (r.counts.used !== 6) throw new Error('宿主未把条目喂进内核(实 ' + r.counts.used + ')');
    if (r.byLayer.dream !== 1 || r.byLayer.reality !== 1) throw new Error('宿主层分面不对:' + JSON.stringify(r.byLayer));
    if (self._narrativeLayerRead !== r) throw new Error('宿主未把读数存进只读面 _narrativeLayerRead');
    if (self._lastInjection !== 'SENTINEL') throw new Error('只读出口动了注入面(不摸 window / 不读 storage)');
    return r;
}
test('v3440 C1. *** 宿主取真源:opts.items ⇒ 层分面原样带出(出口只读 / 未动注入面)', () => {
    judgeHostLayer(IDX);
    console.log('  ok ok true / used 6 / dream 1·reality 1 / 未动注入面');
});
function judgeHostReality(src, items) {
    const self = nlSelf(NL_WIN(), src);
    const rv = self.narrativeReality({ items: items || F_FIVE });
    if (rv.ok !== true) throw new Error('宿主现实面未成功(reason=' + rv.reason + ')');
    if (rv.count !== 1 || rv.excluded !== 5) throw new Error('宿主现实面隔离失效(实 count ' + rv.count + ' / excluded ' + rv.excluded + ')');
    if (rv.realityOnly !== true || rv.writesNothing !== true) throw new Error('宿主现实面形状不对');
    return rv;
}
test('v3440 C2. *** 宿主现实面接线:非现实 5 条一条不进(realityOnly / 零写)', () => {
    judgeHostReality(IDX);
    console.log('  ok count 1 / excluded 5 / realityOnly + writesNothing');
});
function judgeProj(src) {
    const self = nlSelf(NL_WIN(), src);
    const pj = self.narrativeProject({ items: F_FIVE, layer: 'plan' });
    if (pj.ok !== true) throw new Error('宿主分层投影未成功(reason=' + pj.reason + ')');
    if (pj.layers.length !== 1 || pj.layers[0].layer !== 'plan') throw new Error('分层投影未收窄到 plan');
    if (!pj.layers[0].plans || pj.layers[0].plans.planned !== 1) throw new Error('计划层三态分布不对:' + JSON.stringify(pj.layers[0].plans));
    return pj;
}
test('v3440 C3. ** 宿主分层投影:定向回看按层收窄 + 计划三态分布可读', () => {
    judgeProj(IDX);
    console.log('  ok layers 1 / layer plan / plans.planned 1');
});
function judgeAbsent(src, win) {
    const self = nlSelf(win, src);
    const b = self.narrativeLayer({ items: F_FIVE });
    if (b.ok !== false || b.reason !== 'module-unavailable') throw new Error('缺模块时建面未降级(实 ' + JSON.stringify(b.reason) + ')');
    if (b.writesNothing !== true || b.items.length !== 0) throw new Error('降级信封形状不对');
    const rv = self.narrativeReality({ items: F_FIVE });
    if (rv.ok !== false || rv.reason !== 'module-unavailable') throw new Error('缺模块时现实面未降级');
    if (rv.count !== 0 || rv.realityOnly !== true) throw new Error('降级信封漏 realityOnly');
    const pj = self.narrativeProject({ items: F_FIVE });
    if (pj.ok !== false || pj.reason !== 'module-unavailable') throw new Error('缺模块时分层投影未降级');
    const line = self._narrativeLayerLine();
    if (line !== '模块未加载(narrative-layer.js)') throw new Error('缺模块时诊断行未具名(实 ' + line + ')');
}
test('v3440 C4. ** 缺模块三态:建面 / 现实面 / 分层投影各降级具名 + 诊断行点名文件', () => {
    judgeAbsent(IDX, {});
    console.log('  ok module-unavailable ×3(零写)/ 诊断行点名 narrative-layer.js');
});
function judgeHostLine(src) {
    const self = nlSelf(NL_WIN(), src);
    /* 宿主诊断行走**缺省取数** ⇒ 夹具把带层标注的条目放事实账上(与生产同路)。 */
    self._factVersionState = { version: 1, seq: 6, facts: F_FIVE };
    const line = self._narrativeLayerLine();
    if (!/条目 6/.test(line)) throw new Error('诊断行未报条目数:' + line);
    if (!/现实 1/.test(line)) throw new Error('诊断行未报现实数:' + line);
    if (!/非现实 4/.test(line)) throw new Error('诊断行未把非现实挡在面外报出来:' + line);
    if (!/梦 1/.test(line)) throw new Error('诊断行未报梦境层:' + line);
    /* 空盘:说「暂无」,不编。 */
    const self2 = nlSelf(NL_WIN(), src);
    const empty = self2.narrativeLayer({ items: [] });
    const line3 = NL.line(empty);
    if (!/暂无叙事层条目/.test(line3)) throw new Error('空盘诊断行未说「暂无」:' + line3);
    if (self2._narrativeLayerLine() !== '暂无叙事层条目(无非现实外壳)') throw new Error('空盘宿主诊断行未如实说「暂无」');
    return line;
}
test('v3440 C5. ** 宿主诊断行:四方分开说 + 非现实隔离永远报出来 / 空盘说暂无', () => {
    judgeHostLine(IDX);
    console.log('  ok 条目6·现实1·非现实4(已挡在现实面外)·梦1 / 空盘暂无');
});
/* ★ 宿主缺省取数:**不喂 opts.items 时回落事实账** —— 首版只认 opts.items,
 *   缺省恒空 ⇒ 诊断行永远「暂无」,层轴事实上没接进宿主数据面(真实设计缺陷)。
 *   本条把「显式喂」与「缺省回落」两路都钉住,并对照**:两者读数须一致**。 */
function judgeHostDefault(src) {
    const self = nlSelf(NL_WIN(), src);
    /* 夹具:事实账上**已带层标注**的条目(层标注落在既有条目上,不新增持久化键)。 */
    self._factVersionState = { version: 1, seq: 6, facts: F_FIVE };
    const viaDefault = self.narrativeLayer({});
    if (viaDefault.ok !== true) throw new Error('缺省取数未成功(reason=' + viaDefault.reason + ')');
    if (viaDefault.counts.used !== 6) throw new Error('缺省未回落到事实账 facts(实 used ' + viaDefault.counts.used + ')');
    if (viaDefault.byLayer.dream !== 1 || viaDefault.byLayer.reality !== 1) throw new Error('缺省层分面不对');
    /* 两路读数须一致(显式 items 与缺省回落不得是两份口径)。 */
    const viaExplicit = self.narrativeLayer({ items: F_FIVE });
    if (JSON.stringify(viaExplicit.items) !== JSON.stringify(viaDefault.items)) {
        throw new Error('显式 items 与缺省回落读数不一致(同一件事两份口径)');
    }
    /* 事实账缺席 ⇒ 空盘(如实,不编)。 */
    const self2 = nlSelf(NL_WIN(), src);
    self2._factVersionState = null;
    const empty = self2.narrativeLayer({});
    if (empty.counts.used !== 0) throw new Error('事实账缺席时不得编出条目(实 ' + empty.counts.used + ')');
    return viaDefault;
}
test('v3440 C6. ★★★ 宿主缺省取数:不喂 items 时回落事实账 facts(与显式喂读数一致)', () => {
    judgeHostDefault(IDX);
    console.log('  ok 缺省回落 facts used 6 / 两路读数逐字一致 / 账缺席说空盘');
});
/* ══════════════ D. 负控制(真源码破坏 → 副本重跑同款判据 → 必须现形) ══════════════ */
function expectRed(fn, label) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = String(e && e.message || e); }
    if (!threw) throw new Error(label + ':破坏后判据未转红(负控制空转)');
    return msg;
}
test('v3440 D1. ★★ 破坏「显式标注判定」⇒ 五层判据 B1 必须转红', () => {
    const bad = loadIIFE(breakOnce(NL_SRC, ANCHORS.kExplicit, String.raw`if (false) return { modality: hit, stated: true, via: 'explicit:' + k, raw: clip(v, 24) };`, 'kExplicit'), 'LonShaNarrativeLayer');
    expectRed(() => judgeModality(bad), 'kExplicit');
    judgeModality(NL);
    console.log('  ok 破坏显式标注 ⇒ 五层全落 unspecified 被照出;原版阳性通过');
});
test('v3440 D2. ★★ 破坏「现实面隔离」⇒ 现实面判据 B2 必须转红', () => {
    const bad = loadIIFE(breakOnce(NL_SRC, ANCHORS.kReality, String.raw`if (it) keep.push(it);`, 'kReality'), 'LonShaNarrativeLayer');
    expectRed(() => judgeReality(bad), 'kReality');
    judgeReality(NL);
    console.log('  ok 破坏隔离 ⇒ 非现实条目混入现实面被照出;原版阳性通过');
});
test('v3440 D3. ★★ 破坏「计划闸」⇒ 计划落实判据 B3 必须转红', () => {
    const bad = loadIIFE(breakOnce(NL_SRC, ANCHORS.kPlanGate, String.raw`if (saidDone) {`, 'kPlanGate'), 'LonShaNarrativeLayer');
    expectRed(() => judgePlanGate(bad), 'kPlanGate');
    judgePlanGate(NL);
    console.log('  ok 破坏计划闸 ⇒ 一句「决定了」被读成已完成被照出;原版阳性通过');
});
test('v3440 D4. ★★ 破坏「嵌套框架」⇒ 嵌套判据 B4 必须转红', () => {
    const bad = loadIIFE(breakOnce(NL_SRC, ANCHORS.kFrames, String.raw`/* noop */;`, 'kFrames'), 'LonShaNarrativeLayer');
    expectRed(() => judgeFrames(bad), 'kFrames');
    judgeFrames(NL);
    console.log('  ok 破坏框架入链 ⇒ depth 落到 0 被照出;原版阳性通过');
});
test('v3440 D5. ★★ 破坏宿主「取数」⇒ 宿主建面判据 C1 必须转红', () => {
    const badIdx = breakOnce(DL, ANCHORS.hItems, String.raw`const items = Array.isArray(o.items) ? null`, 'hItems');
    expectRed(() => judgeHostLayer(badIdx), 'hItems');
    judgeHostLayer(IDX);
    console.log('  ok 破坏取数 ⇒ 宿主拿空盘被照出;原版阳性通过');
});
test('v3440 D6. ★★ 破坏宿主「现实面接线」⇒ 宿主现实面判据 C2 必须转红', () => {
    const badIdx = breakOnce(DL, ANCHORS.hReality, String.raw`const rv = NL.realityView({ items: [] });`, 'hReality');
    expectRed(() => judgeHostReality(badIdx), 'hReality');
    judgeHostReality(IDX);
    console.log('  ok 破坏现实面接线 ⇒ 宿主拿到空现实面被照出;原版阳性通过');
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3440 F1. ** H5 判据纯度:破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次(应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过)');
    }
    for (const k of ['kExplicit', 'kReality', 'kPlanGate', 'kFrames']) {
        const n = NL_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 narrative-layer.js 命中 ' + n + ' 次(应恰 1)');
    }
    for (const k of ['hItems', 'hReality']) {
        const n = DL.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '宿主锚 ' + k + ' 在 engine-diagnostic-lines.js 命中 ' + n + ' 次(应恰 1)');
    }
    console.log('  ok 六个锚点在本档各 1 次、在真源各 1 次');
});
test('v3440 F2. ** H6 两向自证:锚点不存在 / 不唯一时 breakOnce 必须拒绝', () => {
    assert.throws(() => breakOnce('abc', 'zzz', 'x'), /锚点命中|拒绝破坏/);
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/);
    console.log('  ok 0 次 / 多次 锚点均被 breakOnce 拒绝');
});
test('v3440 G1. ★★ 版本面:六源同源 + 本档出生锚 BORN_V(下界,不锁当版)', () => {
    /* [v3.343.0 交棒] 逐字硬等号是**本档出生那一版的一次性事实**,不是永久不变量;
     *   按版本守卫 V2 的修法:只守「六源**逐字同源**」与「不低于本档出生版本」;
     *   「当版锚点恰一处」由当版 frontier 套件把守(V4 口径)。 */
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), '宿主版本不得低于本档出生版本(实 ' + idxV + ')');
    assert.equal(MF.version, idxV, 'manifest.json 未与宿主同源');
    assert.equal(PKG.version, idxV, 'package.json 未与宿主同源');
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const s = read(rel);
        assert.match(s, new RegExp(String.raw`let VERSION = '${idxV}'`), rel + ' 未同源');
    }
    assert.ok(vnum(BORN_V) > vnum('3.343.0'), '版本序须前进');
    console.log('  ok 六源逐字同源(' + idxV + ')/ 出生锚 v' + BORN_V + ' / 版本序前进');
});