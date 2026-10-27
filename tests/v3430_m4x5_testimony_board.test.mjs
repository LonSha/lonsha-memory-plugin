/* ============================================================
 * tests/v3430_m4x5_testimony_board.test.mjs — v3.343.0 · M4-X5
 * 同一事件的多方证词与争议档案(来源去重 + 争议未裁决 + 撤回更新)
 *
 * 【本档要证明的四件事(不是「函数返回了对象」)】
 *   a) **三条都在场**:甲亲历、乙转述甲、丙反证 —— 同一事件(显式 eventId 聚合)
 *      下三种说法同时可见,谁在场、谁转述、谁反证逐条可读;
 *   b) **同源不重复计**:前两条(甲亲历 / 乙转述甲)**共用来源**
 *      ⇒ 独立支持恒为 1 份,不得算两份独立(转述如实计数并报同源对象);
 *   c) **未裁决保留**:立场对立且判不开 ⇒ contested,且**三档分列**
 *      (ambiguous / below-threshold / transmittal-only),不裁剪、不合成一个布尔;
 *   d) **揭密前后分面 + 撤回更新**:identity surface/revealed 分列(split);
 *      撤回证据 ⇒ 命中条目标 revoked 并列进 revokedItems,**重算争议状态**
 *      (撤到无独立支持 ⇒ 不退化成 contested)。
 *
 * 【五条「不做」也在判据里】
 *   1 不多数票裁真相(只报事实,不判对错);2 不加虚构置信百分比(读数无 percent/score 键);
 *   3 不把全知档案注入每个角色(dossiers 按角色分面,**不产统一陈述**);
 *   4 不做同义改写指代消解(side 只认显式声明,判不出一律 neutral);
 *   5 不摸 window / 不读 storage(只读投影:writesNothing 恒 true、出口末动注入面)。
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
const TB_SRC = read('testimony-board.js');
const SELF = read(path.join('tests', 'v3430_m4x5_testimony_board.test.mjs'));
const BORN_V = '3.343.0';
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
const TB = loadIIFE(TB_SRC, 'LonShaTestimonyBoard');
/* ══════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════ */
const ANCHORS = Object.freeze({
    /* 内核·来源去重:置假 ⇒ 同证据第二条不再计入转述(实测红:转述计数丢失、同源对象未报)。 */
    kDedupe: String.raw`if (seen.has(key)) {`,
    /* 内核·对立判定:置假 ⇒ 对立永不成案(实测红:争议未裁决判据 B2 拿到 supported)。 */
    kOpposed: String.raw`const opposed = sides.size > 1 || texts.size > 1;`,
    /* 内核·撤回命中:置假 ⇒ 被撤证据一条也不命中(实测红:撤回判据拿到 revokedItems 0)。 */
    kRevokeHit: String.raw`const hit = (c && c.evidenceKey && keys.has(c.evidenceKey)) || (c && c.traceId && keys.has(c.traceId));`,
    /* 内核·揭密分面:置假 ⇒ 揭密前后不再判作各有视角(实测红:split 判据 B4 拿到 false)。 */
    kSplit: String.raw`split: buckets.surface.length > 0 && buckets.revealed.length > 0`,
    /* 宿主·取真源:喂空输入 ⇒ 宿主不再读 worldProg.knowledgeTraces(实测红:宿主判据 C1 拿到空盘)。 */
    hBuild: String.raw`const out = TB.build(traces, opts || {});`,
    /* 宿主·撤回接线:喂被撤清单的地方置空 ⇒ 宿主撤回不命中(实测红:宿主判据 C2 拿到 unchanged)。 */
    hRevoke: String.raw`const res = TB.revokeEvidence({ testimonies: board.testimonies, state: board.state }, dropped);`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    'testimonyBoard(...args) {',
    'testimonyRevoke(...args) {',
    '_testimonyBoardLine(...args) {',
];
function judgeStruct(idxSrc, mf) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idxSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次(应恰 1)');
    }
    if (idxSrc.indexOf('function _testimonyBoardLib() {') < 0) bad.push('缺取库口 _testimonyBoardLib');
    if (idxSrc.indexOf("'testimony-board.js'") < 0) bad.push('缺模块文件名声明');
    if (idxSrc.indexOf("return ['证词面', '模块未加载(testimony-board.js)'];") < 0) bad.push('缺自检行「证词面」');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('testimony-board.js') < 0) bad.push('manifest.extra_js 缺 testimony-board.js');
    /* ★ 只读投影:本刀**不新增任何持久化键** —— 不摸 ARCHIVE/CARRYOVER,不写契约面。 */
    if (idxSrc.indexOf('testimonyBoard:') >= 0) bad.push('出现了持久化契约键 testimonyBoard:(本面应零落盘)');
    if (/data\.testimonyBoard/.test(idxSrc)) bad.push('出现了 data.testimonyBoard 还原面(本面应零落盘)');
    const arch = (/const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    const carry = (/const CARRYOVER_EXEMPT_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    if (/testimon/i.test(arch) || /testimon/i.test(carry)) bad.push('证词面混进了归档/跨卷键(本面不持久化)');
    return bad;
}
test('v3430 A1. **** 宿主三面各恰一处 + 取库口 + 自检行 + extra_js 登记 + **零落盘面**', () => {
    assert.deepEqual(judgeStruct(IDX, MF), [], judgeStruct(IDX, MF).join(';'));
    /* [v3.344.0 交棒] 原为硬等号 `assert.equal(MF.extra_js.length, 108)`,本版新增
     *   narrative-layer.js 后必然顶穿 —— 与本档 v3400/v3410/v3420 同款改为**下界口径**
     *   (本档出生值 108 不得回退;此后增模块不算回归)。这是本仓抬版连带面的一类:
     *   当版硬锁在下一版被顶穿,而它锁的不是版本号(故 V2 管不到),得按先例交棒。 */
    assert.ok(MF.extra_js.length >= 108, 'extra_js 不得低于本档出生值 108(实 ' + MF.extra_js.length + ')');
    console.log('  ok 三面各恰 1 次 / 取库口 / 自检行 / extra_js ≥ 108(实 ' + MF.extra_js.length + ') / 无持久化键');
});
function judgeKernel(tb) {
    const bad = [];
    if (tb.TB_VERSION !== 1) bad.push('TB_VERSION 应 1,实 ' + tb.TB_VERSION);
    if (tb.TB_KIND !== 'testimony_board') bad.push('TB_KIND 不对:' + tb.TB_KIND);
    for (const s of ['supported', 'contested', 'undecided', 'withdrawn']) {
        if (tb.TB_STATES.indexOf(s) < 0) bad.push('TB_STATES 缺 ' + s);
    }
    for (const s of ['witnessed', 'relayed', 'rebutted', 'undecided']) {
        if (tb.TB_CLAIM_STATES.indexOf(s) < 0) bad.push('TB_CLAIM_STATES 缺 ' + s);
    }
    for (const k of ['ambiguous', 'below-threshold', 'transmittal-only']) {
        if (tb.UNRESOLVED.indexOf(k) < 0) bad.push('UNRESOLVED 缺 ' + k);
    }
    for (const f of ['build', 'supportsOf', 'disputesOf', 'stateOfOf', 'identitiesOf', 'revokeEvidence', 'line', 'selfCheck', 'claimOf', 'boardKeyOf', 'evidenceKeyOf', 'sideOf', 'strengthOf']) {
        if (typeof tb[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    /* 自证六项:确定性 / 零写面 / 三档齐 / 未裁决可见 / 无百分比 / 可序列化。 */
    const sc = tb.selfCheck([
        { character: '甲', fact: 'probe', eventId: 'E', action: 'acquire', via: 'witnessed', side: 'affirm', floor: 1 },
        { character: '丙', fact: 'probe-x', eventId: 'E', action: 'acquire', via: 'witnessed', side: 'deny', floor: 2 }
    ]);
    if (sc.ok !== true) bad.push('selfCheck 对合法输入报红:' + JSON.stringify(sc));
    if (sc.writeFaces !== 0) bad.push('selfCheck 数出写面:' + sc.writeFaces);
    if (sc.percentFree !== true) bad.push('selfCheck 未守住「不产百分比」');
    if (sc.deterministic !== true || sc.serializable !== true) bad.push('selfCheck 确定性/可序列化未过');
    return bad;
}
test('v3430 A2. **** 内核面:版本 + 四态 + 三档 + 十三原语 + 自证六项', () => {
    assert.deepEqual(judgeKernel(TB), [], judgeKernel(TB).join(';'));
    console.log('  ok TB_VERSION 1 / 四态 / 三档 / build·revokeEvidence·selfCheck / 自证六项全过');
});
/* ══════════════ B. 真跑(内核,纯函数) ══════════════ */
/* 夹具:同一事件 E1 —— 甲亲历、乙转述甲(**同源 K1**)、丙亲历反证(K2)。 */
const T_E1 = [
    { character: '甲', fact: '甲亲眼看见他把书拿走了', eventId: 'E1', action: 'acquire', via: 'witnessed', side: 'affirm', floor: 3, evidenceKey: 'K1', traceId: 't1' },
    { character: '乙', fact: '乙听甲说他拿走了书', eventId: 'E1', action: 'acquire', via: 'told', side: 'affirm', from: '甲', floor: 5, evidenceKey: 'K1', traceId: 't2' },
    { character: '丙', fact: '丙说那天他一直在家没出门', eventId: 'E1', action: 'acquire', via: 'witnessed', side: 'deny', floor: 4, evidenceKey: 'K2', traceId: 't3' }
];
/** 判据 (a)(b):三条都在场、同源只算一份独立支持。 */
function judgeDedupe(tb) {
    const r = tb.build(T_E1, { event: 'E1' });
    if (r.boards.length !== 1) throw new Error('同一事件未聚成一块(实 ' + r.boards.length + ')');
    const b = r.boards[0];
    if (b.counts.testimonies !== 3) throw new Error('三条说法未同时在案(实 ' + b.counts.testimonies + ')');
    if (b.supports.independentCount !== 2) throw new Error('独立支持应为 2(实 ' + b.supports.independentCount + ')');
    if (b.supports.transmittalCount !== 1) throw new Error('转述应如实计 1(实 ' + b.supports.transmittalCount + ')');
    if (b.counts.firsthand !== 2) throw new Error('一手支持应 2(实 ' + b.counts.firsthand + ')');
    if (b.supports.transmittals[0].fromCharacter !== '甲') throw new Error('转述未报同源对象(应是甲)');
    return r;
}
test('v3430 B1. ** 来源去重:甲亲历 / 乙转述甲(同源) / 丙反证 ⇒ 独立 2 · 转述 1(不重复计)', () => judgeDedupe(TB) === undefined && console.log('  ok 三条在场 / indep 2 / transmittal 1 / 同源对象=甲'));
/** 判据 (c):对立且判不开 ⇒ contested,三档分列可读。 */
function judgeDisputes(tb) {
    const r = tb.build(T_E1, { event: 'E1' });
    const b = r.boards[0];
    if (b.state !== 'contested') throw new Error('对立未裁决应 contested(实 ' + b.state + ')');
    if (!b.disputes.contested) throw new Error('disputes.contested 未立');
    if (b.disputes.items.length !== 2) throw new Error('未裁决说法应全保留 2 条(实 ' + b.disputes.items.length + ')');
    if (b.counts.unresolved !== 2) throw new Error('counts.unresolved 应 2(实 ' + b.counts.unresolved + ')');
    if (b.disputes.kinds['ambiguous'] !== 2) throw new Error('两条一手对立应归 ambiguous(实 ' + b.disputes.kinds['ambiguous'] + ')');
    return r;
}
test('v3430 B2. ** 争议未裁决:立场对立 ⇒ contested + 两条全保留 + 不下结论', () => judgeDisputes(TB) === undefined && console.log('  ok contested / items 2 / kinds.ambiguous 2'));
/** 三档分列:三种处境各进各的档,不合成一格。 */
function judgeThreeKinds(tb) {
    const r = tb.build([
        { character: '甲', fact: '甲说听说他拿了', eventId: 'E9', action: 'acquire', via: 'told', side: 'affirm', evidenceKey: 'X1' },
        { character: '丁', fact: '丁亲眼看见他拿了', eventId: 'E9', action: 'acquire', via: 'witnessed', side: 'affirm', evidenceKey: 'X2' },
        { character: '丙', fact: '丙说东西一直在原处', eventId: 'E9', action: 'acquire', via: 'witnessed', origin: 'inferred', side: 'deny', evidenceKey: 'X3' }
    ], {});
    const k = r.boards[0].disputes.kinds;
    if (k['transmittal-only'] !== 1) throw new Error('transmittal-only 档应 1(实 ' + k['transmittal-only'] + ')');
    if (k['below-threshold'] !== 1) throw new Error('below-threshold 档应 1(实 ' + k['below-threshold'] + ')');
    if (k['ambiguous'] !== 1) throw new Error('ambiguous 档应 1(实 ' + k['ambiguous'] + ')');
    return r;
}
test('v3430 B3. ** 三档分列:转述独有 / 低于门槛 / 真正判不开 —— 各进各档(合成一格就说不出「为什么」)', () => judgeThreeKinds(TB) === undefined && console.log('  ok 三档各 1(transmittal-only / below-threshold / ambiguous)'));
/** 判据 (d) 前半:揭密前后分面。 */
function judgeSplit(tb) {
    const r = tb.build([
        { character: '甲', fact: '他自称是林家的远亲', eventId: 'E2', action: 'acquire', via: 'witnessed', side: 'affirm', identity: 'surface', evidenceKey: 'S1' },
        { character: '乙', fact: '他其实是林家的私生子', eventId: 'E2', action: 'acquire', via: 'witnessed', side: 'affirm', identity: 'revealed', evidenceKey: 'S2' }
    ], { event: 'E2' });
    const id = r.boards[0].identities;
    if (id.split !== true) throw new Error('揭密前后应各有一套视角(split 应 true)');
    if (id.surface.length !== 1 || id.revealed.length !== 1) throw new Error('身份面未分列(实 surface=' + id.surface.length + ' revealed=' + id.revealed.length + ')');
    return r;
}
test('v3430 B4. ** 揭密分面:明面身份 / 真实身份分列(split)⇒ 查得出「他什么时候改口」', () => judgeSplit(TB) === undefined && console.log('  ok surface 1 / revealed 1 / split true'));
/** 判据 (d) 后半:撤回更新争议状态(不静默保留 contested)。 */
function judgeRevoke(tb) {
    const r = tb.build(T_E1, { event: 'E1' });
    const b = r.boards[0];
    const w = tb.revokeEvidence({ testimonies: b.testimonies, state: b.state }, ['K2']);
    if (w.revokedItems.length !== 1) throw new Error('被撤证据未列进 revokedItems(实 ' + w.revokedItems.length + ')');
    if (w.changed !== true) throw new Error('撤掉对立证据后状态应变化');
    if (w.stateBefore !== 'contested' || w.stateAfter !== 'supported') throw new Error('状态未重算(实 ' + w.stateBefore + ' -> ' + w.stateAfter + ')');
    /* 撤一条不等于撤一批:未命中证据一条不动。 */
    const w2 = tb.revokeEvidence({ testimonies: b.testimonies, state: b.state }, ['查无此键']);
    if (w2.unchanged !== 3 || w2.revokedItems.length !== 0) throw new Error('未命中证据被动过了');
    if (w2.changed !== false) throw new Error('没撤到东西不该报 changed');
    /* 全撤 ⇒ withdrawn(不静默留一个没人能举证的 contested)。 */
    const w3 = tb.revokeEvidence({ testimonies: b.testimonies, state: b.state }, ['K1', 'K2']);
    if (w3.stateAfter !== 'withdrawn') throw new Error('全撤应 withdrawn(实 ' + w3.stateAfter + ')');
    return w;
}
test('v3430 B5. ** 撤回更新:命中列 revokedItems + contested→supported / 未命中不动 / 全撤 withdrawn', () => judgeRevoke(TB) === undefined && console.log('  ok revoked 1 / contested→supported / unchanged 3 / 全撤 withdrawn'));
/** 五条「不做」中的三条在读数管线上当场可证。 */
function judgeNotDo(tb) {
    const r = tb.build(T_E1, { event: 'E1' });
    if (r.writesNothing !== true) throw new Error('writesNothing 应恒 true(本面零落盘)');
    /* 不加虚构置信百分比:读数键里不得出现 percent / confidence / score 一类。 */
    const keys = JSON.stringify(r).toLowerCase();
    for (const bad of ['percent', 'confidence', 'score', 'probability']) {
        if (keys.indexOf('"' + bad) >= 0) throw new Error('读数混进置信字段:' + bad);
    }
    /* 不做同义改写指代消解:side 只认显式声明,读不出一律 neutral。 */
    if (tb.sideOf({ side: 'pro' }) !== 'affirm') throw new Error('显式同义写法未收拢');
    if (tb.sideOf({ side: '看起来像是反对' }) !== 'neutral') throw new Error('未做语义抽取(应 neutral)');
    /* 不产全知统一陈述:dossiers 按角色分面,每角色一格且只装他自己的说法。 */
    const d = r.boards[0].dossiers;
    if (d.length !== 3) throw new Error('dossiers 应按角色分面 3 格(实 ' + d.length + ')');
    if (d.some((x) => x.statements.some((s) => s.character && s.character !== x.character))) throw new Error('dossier 混进了别人的说法(产了全知陈述)');
    return r;
}
test('v3430 B6. ** 五条不做之境:零落盘 / 无百分比 / 不抽语义 / 不产全知统一陈述', () => judgeNotDo(TB) === undefined && console.log('  ok writesNothing / 无置信字段 / side neutral / dossiers 3 格自分面'));
/* ══════════════ C. 宿主出口(真方法体 + 真内核 + 真 worldProg 源) ══════════════ */
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
    'function _testimonyBoardLib() {',
];
const METH_FNS = [
    'testimonyBoard(...args) {',
    'testimonyRevoke(...args) {',
    '_testimonyBoardLine(...args) {',
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
    /* [v3.361.0 剥离] 方法体移至 engine-diagnostic-lines.js：
     *   从 DL 提取方法体（engine.→this. 转换），从 IDX 提取 _moduleLib。
     *   *Lib() 函数从 window 取对应模块（与 DL 中 bindDeps 注入的等价）。 */
    const idx = src || IDX;
    const moduleLibFn = sliceMember(idx, 'function _moduleLib(getGlobal, fileName) {');
    if (!moduleLibFn) throw new Error('切片缺失: _moduleLib');
    const dlFuncs = [
        'function _testimonyBoardLib() { return (typeof window !== "undefined" && window.LonShaTestimonyBoard) ? window.LonShaTestimonyBoard : null; }',
    ];
    const meths = [
        extractModuleMethod(DL, 'function testimonyBoard(engine, opts) {'),
        extractModuleMethod(DL, 'function testimonyRevoke(engine, dropped, opts) {'),
        extractModuleMethod(DL, 'function _testimonyBoardLine(engine) {'),
    ];
    if (meths.some((x) => !x)) throw new Error('DL 方法体提取缺失');
    const code = moduleLibFn + '\n' + dlFuncs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });';
    return new Function('errLog', 'window', code)(() => {}, win);
}
/** 夹具:宿主状态 —— 轨迹直接落在 worldProg.knowledgeTraces.traces(与 perspectiveCard 同源,不新增键)。 */
function tbHostState() {
    return { worldProg: { knowledgeTraces: { traces: T_E1 } } };
}
const TB_WIN = () => ({ LonShaTestimonyBoard: TB });
function tbSelf(win, src) {
    const eng = mkHost(win, src);
    return Object.assign({}, eng, {
        worldProg: tbHostState().worldProg,
        _testimonyBoardRead: null,
        _lastInjection: 'SENTINEL'
    });
}
function judgeHostBoard(src) {
    const self = tbSelf(TB_WIN(), src);
    const r = self.testimonyBoard({ event: 'E1' });
    if (r.ok !== true) throw new Error('宿主出口未成功(reason=' + r.reason + ')');
    const b = r.boards[0];
    if (b.state !== 'contested') throw new Error('宿主未把争议态带出来(实 ' + b.state + ')');
    if (b.counts.independent !== 2 || b.counts.transmittals !== 1) throw new Error('宿主计数不对(实 ' + b.counts.independent + '/' + b.counts.transmittals + ')');
    if (self._testimonyBoardRead !== r) throw new Error('宿主未把读数存进只读面 _testimonyBoardRead');
    if (self._lastInjection !== 'SENTINEL') throw new Error('只读出口动了注入面(不摸 window / 不读 storage)');
    return r;
}
test('v3430 C1. *** 宿主取真源:worldProg.knowledgeTraces.traces ⇒ 争议态原样带出(出口只读)', () => {
    judgeHostBoard(IDX);
    console.log('  ok ok true / contested / indep 2 / transmittal 1 / 未动注入面');
});
function judgeHostRevoke(src) {
    const self = tbSelf(TB_WIN(), src);
    self.testimonyBoard({ event: 'E1' });
    const w = self.testimonyRevoke(['K2'], { event: 'E1' });
    if (w.ok !== true) throw new Error('宿主撤回未成功(reason=' + w.reason + ')');
    if (w.revokedItems.length !== 1) throw new Error('宿主撤回未命中(实 ' + w.revokedItems.length + ')');
    if (w.changed !== true || w.stateAfter !== 'supported') throw new Error('宿主未重算状态(实 ' + w.stateBefore + ' -> ' + w.stateAfter + ')');
    if (w.writesNothing !== true) throw new Error('宿主撤回面动了写(E 面必须零写)');
    return w;
}
test('v3430 C2. *** 宿主撤回接线:喂被撤证据键 ⇒ 命中 + 重算争议状态(contested→supported)', () => {
    judgeHostRevoke(IDX);
    console.log('  ok ok true / revoked 1 / contested→supported / 零写');
});
function judgeAbsent(src, win) {
    const self = tbSelf(win, src);
    const b = self.testimonyBoard({});
    if (b.ok !== false || b.reason !== 'module-unavailable') throw new Error('缺模块时 board 未降级(实 ' + JSON.stringify(b.reason) + ')');
    if (b.writesNothing !== true || b.boards.length !== 0) throw new Error('降级信封形状不对');
    const w = self.testimonyRevoke(['K1'], {});
    if (w.ok !== false || w.reason !== 'module-unavailable') throw new Error('缺模块时 revoke 未降级');
    if (w.writesNothing !== true) throw new Error('降级信封漏 writesNothing');
    const line = self._testimonyBoardLine();
    if (line !== '模块未加载(testimony-board.js)') throw new Error('缺模块时诊断行未具名(实 ' + line + ')');
}
test('v3430 C3. ** 缺模块三态:board / revoke 各降级具名 + 诊断行点名文件', () => judgeAbsent(IDX, {}) === undefined && console.log('  ok module-unavailable ×2(零写)/ 诊断行点名 testimony-board.js'));
function judgeHostLine(src) {
    const self = tbSelf(TB_WIN(), src);
    const line = self._testimonyBoardLine();
    if (!/事件 1/.test(line)) throw new Error('诊断行未报事件数:' + line);
    if (!/说法 3/.test(line)) throw new Error('诊断行未报说法数:' + line);
    if (!/争议未决 1\(不下结论\)/.test(line)) throw new Error('诊断行未把未裁决争议报出来:' + line);
    /* 空盘:说「暂无证词」,不编。 */
    const self2 = tbSelf(TB_WIN(), src);
    self2.worldProg = { knowledgeTraces: { traces: [] } };
    const line2 = self2._testimonyBoardLine();
    if (!/暂无证词/.test(line2)) throw new Error('空盘诊断行未说「暂无证词」:' + line2);
    return line;
}
test('v3430 C4. ** 宿主诊断行:四方分开说 + 未决争议永远报出来 / 空盘说暂无', () => judgeHostLine(IDX) === undefined && console.log('  ok 事件1·说法3·争议未决1(不下结论)/ 空盘暂无证词'));
/* ══════════════ D. 负控制(真源码破坏 → 副本重跑同款判据 → 必须现形) ══════════════ */
function expectRed(fn, label) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = String(e && e.message || e); }
    if (!threw) throw new Error(label + ':破坏后判据未转红(负控制空转)');
    return msg;
}
test('v3430 D1. ★★ 破坏「来源去重」⇒ 独立支持判据 B1 必须转红', () => {
    const bad = loadIIFE(breakOnce(TB_SRC, ANCHORS.kDedupe, String.raw`if (false) {`, 'kDedupe'), 'LonShaTestimonyBoard');
    expectRed(() => judgeDedupe(bad), 'kDedupe');
    judgeDedupe(TB);
    console.log('  ok 破坏去重 ⇒ 转述计数丢失被照出;原版阳性通过');
});
test('v3430 D2. ★★ 破坏「对立判定」⇒ 争议未裁决判据 B2 必须转红', () => {
    const bad = loadIIFE(breakOnce(TB_SRC, ANCHORS.kOpposed, String.raw`const opposed = false;`, 'kOpposed'), 'LonShaTestimonyBoard');
    expectRed(() => judgeDisputes(bad), 'kOpposed');
    judgeDisputes(TB);
    console.log('  ok 破坏对立判定 ⇒ contested 落到 supported 被照出;原版阳性通过');
});
test('v3430 D3. ★★ 破坏「撤回命中」⇒ 撤回更新判据 B5 必须转红', () => {
    const bad = loadIIFE(breakOnce(TB_SRC, ANCHORS.kRevokeHit, String.raw`const hit = false;`, 'kRevokeHit'), 'LonShaTestimonyBoard');
    expectRed(() => judgeRevoke(bad), 'kRevokeHit');
    judgeRevoke(TB);
    console.log('  ok 破坏撤回命中 ⇒ 被撤证据不落账被照出;原版阳性通过');
});
test('v3430 D4. ★★ 破坏「揭密分面」⇒ 揭密判据 B4 必须转红', () => {
    const bad = loadIIFE(breakOnce(TB_SRC, ANCHORS.kSplit, String.raw`split: false`, 'kSplit'), 'LonShaTestimonyBoard');
    expectRed(() => judgeSplit(bad), 'kSplit');
    judgeSplit(TB);
    console.log('  ok 破坏揭密分面 ⇒ 前后视角不再分列被照出;原版阳性通过');
});
test('v3430 D5. ★★ 破坏宿主「取真源」⇒ 宿主出口判据 C1 必须转红', () => {
    const badIdx = breakOnce(DL, ANCHORS.hBuild, String.raw`const out = TB.build([], opts || {});`, 'hBuild');
    expectRed(() => judgeHostBoard(badIdx), 'hBuild');
    judgeHostBoard(IDX);
    console.log('  ok 破坏取真源 ⇒ 宿主拿空盘被照出;原版阳性通过');
});
test('v3430 D6. ★★ 破坏宿主「撤回接线」⇒ 宿主撤回判据 C2 必须转红', () => {
    const badIdx = breakOnce(DL, ANCHORS.hRevoke, String.raw`const res = TB.revokeEvidence({ testimonies: [], state: board.state }, dropped);`, 'hRevoke');
    expectRed(() => judgeHostRevoke(badIdx), 'hRevoke');
    judgeHostRevoke(IDX);
    console.log('  ok 破坏撤回接线 ⇒ 宿主撤回不命中被照出;原版阳性通过');
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3430 F1. ** H5 判据纯度:破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次(应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过)');
    }
    for (const k of ['kDedupe', 'kOpposed', 'kRevokeHit', 'kSplit']) {
        const n = TB_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 testimony-board.js 命中 ' + n + ' 次(应恰 1)');
    }
    for (const k of ['hBuild', 'hRevoke']) {
        const n = DL.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '宿主锚 ' + k + ' 在 engine-diagnostic-lines.js 命中 ' + n + ' 次(应恰 1)');
    }
    console.log('  ok 六个锚点在本档各 1 次、在真源各 1 次');
});
test('v3430 F2. ** H6 两向自证:锚点不存在 / 不唯一时 breakOnce 必须拒绝', () => {
    assert.throws(() => breakOnce('abc', 'zzz', 'x'), /锚点命中|拒绝破坏/);
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/);
    console.log('  ok 0 次 / 多次 锚点均被 breakOnce 拒绝');
});
test('v3430 G1. ★★ 版本面:六源同源 + 本档出生锚 BORN_V(下界,不锁当版)', () => {
    /* [v3.341.0 交棒] 逐字硬等号是**本档出生那一版的一次性事实**,不是永久不变量;
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
    assert.ok(vnum(BORN_V) > vnum('3.342.0'), '版本序须前进');
    console.log('  ok 六源逐字同源(' + idxV + ')/ 出生锚 v' + BORN_V + ' / 版本序前进');
});
