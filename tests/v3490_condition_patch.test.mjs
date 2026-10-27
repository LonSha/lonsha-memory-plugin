/* ============================================================
 * tests/v3490_condition_patch.test.mjs — v3.349.0 · 缝入上游 conditionPatch
 * 主角伤情/伤病状况的编号片段补丁(condition-patch.js)
 *
 * 【本档要证明的五件事(不是「函数返回了对象」)】
 *   a) **新伤不再挤掉旧伤**:replace 只改被点名的片段,**未列入的片段原样保留**
 *      (修前缺口:condition 是整段覆盖型字符串,模型只提本轮新伤时旧伤被静默挤掉);
 *   b) **痊愈不再清光**:空串只删**那一条**,删净才算清空
 *      (修前缺口:模型写空串时一次清掉所有伤情,等于自动回血);
 *   c) **编号越界跳过而不夹取**,且文本一字不动(不重排分隔符);
 *   d) **同批给 condition 即作废补丁**(condition 含空串优先,补丁整体具名记账);
 *   e) **宿主真的接上了**:三处调用点的 hasAny 认 conditionPatch,且结果落进
 *      protagonist.condition(不新增任何持久化键)。
 *
 * 【四条「不做」也在判据里】
 *   1 不猜:编号认不出 / 越界 / 同批重复 id / 空 add 一律 skip 并具名;
 *   2 不产百分比 / 置信度:读数里出现 percent / confidence / score 一类键即不通过;
 *   3 不联网 / 不持久化:persistsNothing / writesNothing 恒 true;**零落盘面**;
 *   4 不拆一条伤:逗号**不切**(拆开会把一条伤变成三条互相矛盾的状态)。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** →
 *   必须现形;并反向对照「原版同判据必须通过」。判据纯度(H5)单独一段。
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
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
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
const IDX = read('index.js');
/* [v3.421.0] 宿主合并面。两处 hasAny 调用点自十二批外提后**分居两个面**：
 *   主提取留在入口（index.js:5120），补提取随执行管线外提到 engine-execution-pipeline.js:689。
 *   只读入口会把第二处判成缺失（锚点漂移型假红）。故「两处调用点」只能在合并面上观测。
 *   反向约束：取库口那条判据（window 符号「恰一处」）**必须留在入口单面** ——
 *   该符号在模块面另有 2 处（取库/装载），合并面会把「恰一处」判成假红。
 *   两面分工写在这里，免得下一轮又把它整段搬回 index.js。 */
const HOST_FACE = __hostSurface();
const MC = read('memory-core.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const CP_SRC = read('condition-patch.js');
const SELF = read(path.join('tests', 'v3490_condition_patch.test.mjs'));
const idxVersionOf = (o) => (o && o.version) ? o.version : '';
const BORN_V = '3.349.0';
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
/** 把真源码压成单行:破坏锚点与「恰中 1 次」判定都走这一层,免得对齐/换行造成假红。
 *   先把紧贴花括号的空白折叠掉(JS 里 `... });` 与 `...});` 等价),再压成一行。 */
const mkOneLine = (s) => String(s).replace(/[ \t]+([{}();,])/g, '$1').replace(/\s+/g, ' ');
/** 判定:给定源码能否通过某个真判据(返回问题数组,空 = 绿)。 */
const CP = loadIIFE(CP_SRC, 'LonShaConditionPatch');
const TWO = '左臂受轻微剑伤包扎中；右腿旧伤未愈';
const TWO_SRC = '左臂受轻微剑伤包扎中' + String.fromCharCode(65307) + '右腿旧伤未愈';
/* ══════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════ */
const ANCHORS = Object.freeze({
    /* 内核·未列入片段保留:置假 ⇒ 只剩被点名片段(实测红:A2 拿到 fragmentsAfter 1)。 */
    kUnlisted: "const kept = frags.filter(function (f) { return f !== null && f !== ''; });",
    /* 内核·空串只删那条:置假 ⇒ 空串什么都不做(实测红:A3 拿到 deleted 0)。 */
    kScope: "if (!text) { frags[idx] = null; read.deleted += 1; read.applied += 1;",
    /* 内核·保守不重写:置假 ⇒ 越界时也重排分隔符(实测红:A4 拿到 rewrote true)。 */
    kNoRewrite: "if (!read.applied) {",
    /* 内核·重复 id 只认第一条:置假 ⇒ 两条都生效(实测红:A5 拿到 replaced 2)。 */
    kDup: "if (touched[idx] || frags[idx] === null) {",
    /* 内核·畸形≠缺席:置假 ⇒ 两态同形(实测红:A6 拿到单一 patch-not-object)。 */
    kAbsent: "read.dropped.push((raw === null || raw === undefined) ? 'patch-absent' : 'patch-not-object');",
    /* 宿主·补丁施加:置假 ⇒ 补丁根本不生效(实测红:C1 拿到 condition 未变)。 */
    hApply: "if (patch.conditionPatch !== undefined && patch.conditionPatch !== null) {",
    /* 宿主·同批 condition 优先:置假 ⇒ 补丁照样施加(实测红:C2 拿到 shadowed 缺)。 */
    hShadow: "if (patch.condition !== undefined) {",
    /* 宿主·hasAny 认补丁:置假 ⇒ 主提取把只有补丁的载荷当空(实测红:C3)。
     *   锚点取「具名补丁子句」而非键表尾项:两处 keys 数组必须与 settings-ui.js 的 pFields
     *   逐字同形(它们构成仓内已登记的别名副本簇,v3282 把守),故补丁识别下沉为独立子句。 */
    hKeys: " || (extracted.protagonist.conditionPatch != null)",
});
const loadBoth = (srcCP, srcMC) => {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(srcCP, ctx);
    vm.runInContext(srcMC, ctx);
    return ctx;
};
const SEP = String.fromCharCode(65307);
const S = (o) => JSON.stringify(o);
const expectRed = (fn, label) => {
    let bad = null;
    try { bad = fn(); } catch (e) { bad = ['投抛:' + e.message]; }
    assert.ok(Array.isArray(bad) && bad.length > 0, label + ' 必须现形(判据对破坏副本仍绿 = 负控制无效)');
};
/* ══════════ A. 内核面判据 ══════════ */
/** A1 **未列入片段原样保留**(新伤不挤旧伤) + add 也不挤。 */
function judgeKeep(cp) {
    const bad = [];
    const r = cp.applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '左臂已拆绷带' }] });
    if (r.condition !== '左臂已拆绷带' + SEP + '右腿旧伤未愈') bad.push('未列入片段必须原样保留,实得 ' + S(r.condition));
    if (r.read.replaced !== 1 || r.read.fragmentsBefore !== 2 || r.read.fragmentsAfter !== 2) bad.push('替换读数不对 ' + S(r.read));
    const a = cp.applyConditionPatchRead('右腿旧伤未愈', { add: [{ text: '额角新添一道浅伤' }] });
    if (a.condition !== '右腿旧伤未愈' + SEP + '额角新添一道浅伤') bad.push('add 必须追加而不挤旧伤,实得 ' + S(a.condition));
    if (a.read.added !== 1 || a.read.fragmentsAfter !== 2) bad.push('add 读数不对 ' + S(a.read));
    return bad;
}
/** A2 **空串只删那一条**;删净才算清空(痊愈不清光)。 */
function judgeScoped(cp) {
    const bad = [];
    const one = cp.applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '' }] });
    if (one.condition !== '右腿旧伤未愈') bad.push('空串只能删被点名那条,实得 ' + S(one.condition));
    if (one.read.deleted !== 1 || one.read.cleared !== false) bad.push('单删不得报清空 ' + S(one.read));
    const all = cp.applyConditionPatchRead('左臂受轻微剑伤包扎中', { replace: [{ id: 'c1', text: '' }] });
    if (all.condition !== undefined) bad.push('删净必须归 undefined,实得 ' + S(all.condition));
    if (all.read.cleared !== true) bad.push('删净必须报 cleared ' + S(all.read));
    return bad;
}
/** A3 **越界跳过而不夹取**,且文本一字不动。 */
function judgeOutOfRange(cp) {
    const bad = [];
    const r = cp.applyConditionPatchRead(TWO, { replace: [{ id: 'c9', text: '乱写' }] });
    if (r.condition !== TWO) bad.push('越界不得动文本,实得 ' + S(r.condition));
    if (r.read.skipped.indexOf('replace:out-of-range:c9') < 0) bad.push('越界必须具名进 skipped ' + S(r.read.skipped));
    if (r.read.applied !== 0 || r.read.rewrote !== false) bad.push('越界不得算作已施加 ' + S(r.read));
    /* 尾部分隔符也必须原样(保守不重写:坏编号不得把文本形态改掉)。 */
    const t = cp.applyConditionPatchRead(TWO + '。', { replace: [{ id: 'x1', text: '乱写' }] });
    if (t.condition !== TWO + '。') bad.push('坏编号不得重排/裁剪既有文本,实得 ' + S(t.condition));
    return bad;
}
/** A4 **同批重复 id 只认第一条**(不静默改两次)。 */
function judgeDup(cp) {
    const bad = [];
    const d = cp.applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '第一条' }, { id: 'c1', text: '第二条' }] });
    if (d.read.replaced !== 1) bad.push('重复 id 只准生效一次,实得 ' + d.read.replaced);
    if (d.read.skipped.indexOf('replace:dup-id:c1') < 0) bad.push('重复 id 必须具名进 skipped ' + S(d.read.skipped));
    if (d.condition !== '第一条' + SEP + '右腿旧伤未愈') bad.push('重复 id 不得把第二条盖上去,实得 ' + S(d.condition));
    return bad;
}
/** A5 **畸形≠缺席**(两态各自具名,不混为一个「空」)。 */
function judgeAbsent(cp) {
    const bad = [];
    const absent = cp.cleanConditionPatch(null);
    const malformed = cp.cleanConditionPatch('不是对象');
    if (absent.read.dropped.indexOf('patch-absent') < 0) bad.push('缺席必须具名 patch-absent ' + S(absent.read.dropped));
    if (malformed.read.dropped.indexOf('patch-not-object') < 0) bad.push('畸形必须具名 patch-not-object ' + S(malformed.read.dropped));
    const empty = cp.cleanConditionPatch({ replace: [], add: [] });
    if (empty.patch !== null || empty.read.dropped.indexOf('patch-empty') < 0) bad.push('空补丁必须具名 patch-empty ' + S(empty.read.dropped));
    return bad;
}
/** A6 **不拆一条伤**:逗号不切;渲染带编号且编号只在单次请求内有效。 */
function judgeNoComma(cp) {
    const bad = [];
    if (cp.splitConditionFragments('手臂受伤,夹板固定,暂不能提重物').length !== 1) bad.push('逗号必须不切(拆开会把一条伤变成三条互相矛盾的状态)');
    if (cp.splitConditionFragments(TWO).length !== 2) bad.push('分号必须切');
    if (cp.fmtConditionFragments(TWO) !== '[c1] 左臂受轻微剑伤包扎中' + SEP + '[c2] 右腿旧伤未愈') bad.push('渲染必须是带编号列表,实得 ' + S(cp.fmtConditionFragments(TWO)));
    return bad;
}
/** A7 **只读面真判据**:不改入参 / 不产百分比 / 可序列化 / 自证全绿。 */
function judgeReadOnly(cp) {
    const bad = [];
    const cond = TWO;
    const pat = { replace: [{ id: 'c1', text: '改后' }] };
    const beforeC = String(cond);
    const beforeP = JSON.stringify(pat);
    cp.applyConditionPatchRead(cond, pat);
    if (String(cond) !== beforeC) bad.push('不得原地改 condition 入参');
    if (JSON.stringify(pat) !== beforeP) bad.push('不得原地改 patch 入参');
    const r = cp.applyConditionPatchRead(TWO, { replace: [{ id: 'c1', text: '左臂已拆绷带' }] });
    if (cp.hasPercentKey(r.read)) bad.push('读数里不得出现百分比类键');
    let ser = false;
    try { ser = JSON.parse(JSON.stringify(r.read)).applied === 1; } catch (e) { ser = false; }
    if (!ser) bad.push('读数必须可序列化');
    const sc = cp.selfCheck();
    if (sc.ok !== true) bad.push('内核自证必须全绿:' + S(Object.keys(sc).filter((k) => sc[k] === false)));
    const d = cp.describe();
    if (d.kind !== cp.CP_KIND || d.persistsNothing !== true || d.writesNothing !== true) bad.push('能力自述不得声称会写/会持久化 ' + S(d.kind));
    if (d.commaSplits !== false || d.unlistedKept !== true) bad.push('能力自述必须与真行为同口径(逗号不切 / 未列入保留)');
    return bad;
}
const JUDGE_CP = (cp) => [].concat(judgeKeep(cp), judgeScoped(cp), judgeOutOfRange(cp), judgeDup(cp), judgeAbsent(cp), judgeNoComma(cp), judgeReadOnly(cp));
const JUDGE_CP_SRC = (src) => JUDGE_CP(loadIIFE(src, 'LonShaConditionPatch'));
/* ══════════ C. 宿主接线判据 ══════════ */
/** C1 补丁经 CharacterState 真的落进 protagonist.condition(不新增持久化键)。 */
function judgeHostApply(srcMC, srcCP) {
    const bad = [];
    const ctx = loadBoth(srcCP, srcMC);
    const MC = ctx.LonShaMemoryCore;
    const cs = new MC.CharacterState();
    cs.setProtagonist({ condition: TWO }, 5);
    cs.setProtagonist({ conditionPatch: { replace: [{ id: 'c1', text: '左臂已拆绷带' }] } }, 6);
    const got = cs.getProtagonist().condition;
    if (got !== '左臂已拆绷带' + SEP + '右腿旧伤未愈') bad.push('补丁必须落进 condition,实得 ' + S(got));
    /* **不新增持久化键**:导出载荷里不得出现 conditionPatch 这个键。 */
    if (Object.prototype.hasOwnProperty.call(cs.getProtagonist(), 'conditionPatch')) bad.push('protagonist 不得新增 conditionPatch 持久化键');
    const cs0 = new MC.CharacterState();
    cs0.setProtagonist({ condition: TWO }, 5);
    const baseKeys = Object.keys(cs0.getProtagonist()).sort().join(',');
    const keys = Object.keys(cs.getProtagonist()).sort().join(',');
    if (keys !== baseKeys) {
        bad.push('protagonist 键集不得变(零落盘面):基线 ' + baseKeys + ' vs 施补丁后 ' + keys);
    }
    /* 删净 ⇒ 空串(明确清空,不是「不动」)。 */
    cs.setProtagonist({ conditionPatch: { replace: [{ id: 'c1', text: '' }, { id: 'c2', text: '' }] } }, 7);
    if (cs.getProtagonist().condition !== '') bad.push('删净必须落成空串(否则伤情永远删不掉),实得 ' + S(cs.getProtagonist().condition));
    if (cs.getProtagonistPrompt().indexOf('生理') >= 0) bad.push('清空后不得再注入生理/伤病状况行');
    return bad;
}
/** C2 **同批给 condition 即作废补丁**(condition 优先,补丁具名记账)。 */
function judgeHostShadow(srcMC, srcCP) {
    const bad = [];
    const ctx = loadBoth(srcCP, srcMC);
    const MC = ctx.LonShaMemoryCore;
    const cs = new MC.CharacterState();
    cs.setProtagonist({ condition: TWO }, 5);
    cs.setProtagonist({ condition: '整段重写', conditionPatch: { replace: [{ id: 'c1', text: 'zz' }] } }, 6);
    if (cs.getProtagonist().condition !== '整段重写') bad.push('同批 condition 必须优先,实得 ' + S(cs.getProtagonist().condition));
    const rd = cs._lastConditionPatchRead;
    if (!rd || rd.shadowedByCondition !== true) bad.push('被 condition 顶掉的补丁必须具名记账(shadowedByCondition)');
    if (rd && rd.applied !== 0) bad.push('被顶掉的补丁不得算已施加 ' + S(rd.applied));
    /* 空串也是 condition(含空串=明确清空)—— 同样顶掉补丁。 */
    cs.setProtagonist({ condition: '', conditionPatch: { replace: [{ id: 'c1', text: 'zz' }] } }, 7);
    if (cs.getProtagonist().condition !== '') bad.push('空串 condition 必须同样顶掉补丁 ' + S(cs.getProtagonist().condition));
    return bad;
}
/** C3 hasAny 真的认 conditionPatch(否则「只给补丁」的载荷被当成空对象丢掉)。 */
function judgeHostKeys(srcIdx) {
    const bad = [];
    const lit = ANCHORS.hKeys;
    const flat = mkOneLine(srcIdx);
    const n = flat.split(mkOneLine(lit)).length - 1;
    if (n !== 2) bad.push('两处调用点(主提取 / 补提取)的 hasAny 都必须认 conditionPatch,实测 ' + n + ' 处');
    return bad;
}
/** C4 取库口 + 缺库降级:三法 / 装配点都在位。 */
function judgeHostFace(srcIdx, srcMC) {
    const bad = [];
    const flat = mkOneLine(srcIdx);
    if (flat.split('function _conditionPatchLib()').length - 1 !== 1) bad.push('宿主取库口 _conditionPatchLib 必须恰一处');
    if (flat.split('window.LonShaConditionPatch').length - 1 !== 1) bad.push('全局符号名必须恰一处');
    const fm = mkOneLine(srcMC);
    if (fm.split('_conditionPatchLib()').length - 1 < 2) bad.push('memory-core 必须定义并调用取库口');
    if (fm.split("require('./condition-patch.js')").length - 1 !== 1) bad.push('缺库时必须有条 require 回落');
    return bad;
}
/* ══════════ A 结构面 + 内核面（真仓库） ══════════ */
test('v3490 A1. ★★ 本档是当版档案:头部同现本档名与当版号 + 自锚常量 BORN_V', () => {
    const head = SELF.split(String.fromCharCode(10)).slice(0, 12);
    const line = head.find((l) => l.includes('v3490_condition_patch') && l.includes('v' + BORN_V));
    assert.ok(line, '本档头部须同一行同时写清「本档名 + 当版号」(frontier 的结构性标志)');
    /* [v3.350.0 交棒] 本档不再是 frontier ⇒ 当版锚退回**下界口径**（与 v3470 G1 / v3480 A1 同形）：
     *   仍判「自锚常量在场」与「当版不早于出生版」，但不再锁死等于某一版 ——
     *   硬等号留在历史档里跨版就变成「锁上一版的死数」。当版锚已交给 v3500 本档（version guard V4 计数）。 */
    assert.ok(vnum(idxVersionOf(MF)) >= vnum(BORN_V), '当版不得早于本档出生版本');
    assert.ok(vnum(idxVersionOf(PKG)) >= vnum(BORN_V), 'package.json 不得早于本档出生版本');
    console.log('  ok frontier 头在场,自锚 ' + BORN_V);
});
test('v3490 A2. ★★★★ 内核面:未列入片段原样保留(新伤不挤旧伤) + add 也不挤', () => {
    assert.deepEqual(judgeKeep(CP), [], '内核保留判据不合格:' + judgeKeep(CP).join(' | '));
    console.log('  ok 改一条不会挤掉另一条;add 只追加');
});
test('v3490 A3. ★★★★★ 内核面:空串只删那一条,删净才算清空(痊愈不清光)', () => {
    assert.deepEqual(judgeScoped(CP), [], '删改范围判据不合格:' + judgeScoped(CP).join(' | '));
    console.log('  ok 空串只删被点名那条;删净才归 undefined');
});
test('v3490 A4. ★★★★ 内核面:编号越界跳过而不夹取,文本一字不动', () => {
    assert.deepEqual(judgeOutOfRange(CP), [], '越界判据不合格:' + judgeOutOfRange(CP).join(' | '));
    console.log('  ok 越界具名 skip;坏编号不得重排/裁剪既有文本');
});
test('v3490 A5. ★★★ 内核面:同批重复 id 只认第一条(不静默改两次)', () => {
    assert.deepEqual(judgeDup(CP), [], '重复 id 判据不合格:' + judgeDup(CP).join(' | '));
    console.log('  ok 第一条生效、第二条具名 skip');
});
test('v3490 A6. ★★★ 内核面:畸形 ≠ 缺席 ≠ 空(三态各自具名,不混为一个空)', () => {
    assert.deepEqual(judgeAbsent(CP), [], '入参三态判据不合格:' + judgeAbsent(CP).join(' | '));
    console.log('  ok patch-absent / patch-not-object / patch-empty 三者可分');
});
test('v3490 A7. ★★★ 内核面:逗号不切(一条伤不得拆成三条)+ 渲染带编号', () => {
    assert.deepEqual(judgeNoComma(CP), [], '切分判据不合格:' + judgeNoComma(CP).join(' | '));
    console.log('  ok 逗号不切、分号切、渲染为 [cN] 列表');
});
test('v3490 A8. ★★★★ 内核面:只读(不改入参 / 不产百分比 / 可序列化 / 自证全绿)', () => {
    assert.deepEqual(judgeReadOnly(CP), [], '只读面判据不合格:' + judgeReadOnly(CP).join(' | '));
    console.log('  ok 入参未被原地改、读数无百分比、自证 ok');
});
test('v3490 B1. ★★★★★ 宿主面:补丁真的落进 protagonist.condition(不新增持久化键)', () => {
    const bad = judgeHostApply(MC, CP_SRC);
    assert.deepEqual(bad, [], '宿主施加判据不合格:' + bad.join(' | '));
    console.log('  ok 补丁落进 condition;protagonist 键集未变;删净落成空串');
});
test('v3490 B2. ★★★★★ 宿主面:同批给 condition 即作废补丁(优先 + 具名记账)', () => {
    const bad = judgeHostShadow(MC, CP_SRC);
    assert.deepEqual(bad, [], '同批优先级判据不合格:' + bad.join(' | '));
    console.log('  ok condition(含空串)优先;被顶掉的补丁具名记账且不算已施加');
});
test('v3490 B3. ★★★★ 宿主面:两处调用点的 hasAny 都认 conditionPatch', () => {
    /* [v3.421.0] 两面读数就地钉住：入口恰 1 处（主提取）、合并面恰 2 处（主提取 + 补提取）。
     *   只钉合并面会让「两处都挤在同一文件」也算过；只钉入口则正是本档此前假红的来源。 */
    const _fk = mkOneLine(ANCHORS.hKeys);
    assert.equal(mkOneLine(IDX).split(_fk).length - 1, 1, '入口面须恰 1 处 hasAny 认补丁（主提取）');
    assert.equal(mkOneLine(HOST_FACE).split(_fk).length - 1, 2, '宿主合并面须恰 2 处（主提取 + 补提取）');
    assert.deepEqual(judgeHostKeys(HOST_FACE), [], 'hasAny 判据不合格:' + judgeHostKeys(HOST_FACE).join(' | '));
    console.log('  ok 主提取 / 补提取两处都在位');
});
test('v3490 B4. ★★★★ 宿主面:取库口在场 + 缺库有条 require 回落', () => {
    /* [v3.421.0] 此处**故意**仍旧读入口单面：`window.LonShaConditionPatch` 在模块面另有取库/装载 2 处，
     *   合并面会让「全局符号名恰一处」这条判据变成假红。判据的命题（宿主只有一个装配点）在入口上成立。 */
    assert.deepEqual(judgeHostFace(IDX, MC), [], '取库面判据不合格:' + judgeHostFace(IDX, MC).join(' | '));
    console.log('  ok 取库口恰一处;缺库降级成「没有补丁」(不连坐)');
});
test('v3490 B5. ★★★ 登记面:extra_js 已收录 condition-patch.js(且与本档同源)', () => {
    assert.ok(Array.isArray(MF.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(MF.extra_js.indexOf('condition-patch.js') >= 0, 'condition-patch.js 必须登记进 extra_js');
    assert.ok(IDX.includes("'condition-patch.js'"), '宿主取库口必须点名 condition-patch.js');
    console.log('  ok extra_js ' + MF.extra_js.length + ' 项含 condition-patch.js');
});
test('v3490 B6. ★★★ 落盘面:零新增持久化键(不混 ARCHIVE / CARRYOVER)', () => {
    const mo = read('memory-organs.js');
    assert.ok(mo.indexOf('ARCHIVE_TOP_LEVEL_KEYS') >= 0, '读不到 ARCHIVE_TOP_LEVEL_KEYS(判据错位)');
    assert.ok(mo.indexOf('conditionPatch') < 0, 'memory-organs.js 不得出现 conditionPatch(零落盘面)');
    assert.ok(__hostSurface().indexOf('conditionPatch') >= 0, '宿主侧反向对照:取库口与 hasAny 必须在位');
    assert.ok(read('memory-core.js').indexOf("'conditionPatch'") < 0 || read('memory-core.js').indexOf("patch.conditionPatch") >= 0, 'memory-core 只准读入参键、不得把它写进档案');
    console.log('  ok 归档面/携带面无 conditionPatch 痕迹');
});
/* ══════════ D. 负控制:真源码破坏 → 加载破坏副本 → 同款真判据 ══════════ */
test('v3490 D1. ★★★★ 破坏「未列入片段保留」⇒ A2 判据必须转红(原版必绿)', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.kUnlisted, "const kept = frags.filter(function (f) { return false; });", 'kUnlisted');
    expectRed(() => JUDGE_CP_SRC(bad), 'kUnlisted');
    assert.deepEqual(judgeKeep(CP), [], '原版同判据必须过');
    console.log('  ok 未列入片段被丢掉 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D2. ★★★★★ 破坏「空串只删那条」⇒ A3 判据必须转红(原版必绿)', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.kScope, "if (!text) { continue;", 'kScope');
    expectRed(() => JUDGE_CP_SRC(bad), 'kScope');
    assert.deepEqual(judgeScoped(CP), [], '原版同判据必须过');
    console.log('  ok 空串不删任何片段 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D3. ★★★ 破坏「保守不重写」⇒ A4 判据必须转红(原版必绿)', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.kNoRewrite, "if (false) {", 'kNoRewrite');
    expectRed(() => JUDGE_CP_SRC(bad), 'kNoRewrite');
    assert.deepEqual(judgeOutOfRange(CP), [], '原版同判据必须过');
    console.log('  ok 一条未落地也重写 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D4. ★★★ 破坏「重复 id 只认第一条」⇒ A5 判据必须转红(原版必绿)', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.kDup, "if (false) {", 'kDup');
    expectRed(() => JUDGE_CP_SRC(bad), 'kDup');
    assert.deepEqual(judgeDup(CP), [], '原版同判据必须过');
    console.log('  ok 同批重复 id 两条都生效 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D5. ★★★ 破坏「畸形≠缺席」⇒ A6 判据必须转红(原版必绿)', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.kAbsent, "read.dropped.push('patch-not-object');", 'kAbsent');
    expectRed(() => JUDGE_CP_SRC(bad), 'kAbsent');
    assert.deepEqual(judgeAbsent(CP), [], '原版同判据必须过');
    console.log('  ok 缺席与畸形同形 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D6. ★★★★★ 破坏宿主「补丁施加」⇒ B1 判据必须转红(原版必绿)', () => {
    const badMC = breakOnce(MC, ANCHORS.hApply, "if (false) {", 'hApply');
    expectRed(() => judgeHostApply(badMC, CP_SRC), 'hApply');
    assert.deepEqual(judgeHostApply(MC, CP_SRC), [], '原版同判据必须过');
    console.log('  ok 宿主不施加补丁 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D7. ★★★ 破坏宿主「同批 condition 优先」⇒ B2 判据必须转红(原版必绿)', () => {
    const badMC = breakOnce(MC, ANCHORS.hShadow, "if (false) {", 'hShadow');
    expectRed(() => judgeHostShadow(badMC, CP_SRC), 'hShadow');
    assert.deepEqual(judgeHostShadow(MC, CP_SRC), [], '原版同判据必须过');
    console.log('  ok 同批给 condition 也照样施加补丁 ⇒ 判据照出;原版阳性通过');
});
test('v3490 D8. ★★★ 破坏宿主「hasAny 认补丁」⇒ B3 判据必须转红(原版必绿)', () => {
    /* 该字面量在真源里**恰 2 次**(主提取 / 补提取两处调用点),`breakOnce` 按纪律拒绝非定点破坏
     *   —— 这正是它该做的事。故此处手工做**两次定点破坏**:两处 hasAny 都退回修前的六字段形态;
     *   每一步都显式核对「恰中 1 次 + 真的改了源码」,不靠工具替我们把关。 */
    const FLAT = mkOneLine(ANCHORS.hKeys);
    const joined = (s) => mkOneLine(s).split(FLAT).length - 1;
    assert.equal(joined(HOST_FACE), 2, '真源里该字面量必须恰 2 次(主提取 / 补提取两处调用点)');
    /* [v3.421.0] 破坏面必须与判据面一致：判据读合并面，就地破坏也得打在合并面上。
     *   打在入口上只能摘掉 1 处（第二处已外提），「两处都必须被破坏」这句话就成了空话。 */
    const badIdx = HOST_FACE.split(ANCHORS.hKeys).join("'condition'];");
    assert.notEqual(badIdx, HOST_FACE, '破坏必须真的改变源码');
    assert.equal(joined(badIdx), 0, '两处都必须被破坏(否则判据只看到一半)');
    expectRed(() => judgeHostKeys(badIdx), 'hKeys');
    assert.deepEqual(judgeHostKeys(HOST_FACE), [], '原版同判据必须过');
    console.log('  ok 只有补丁的载荷被当成空 ⇒ 判据照出;原版阳性通过');
});
/* ══════════ F. 判据纯度(H5) + 工具两向自证(H6) ══════════ */
const CNT = (hay, needle) => String(hay).split(String(needle)).length - 1;
const SELF_ONE = mkOneLine(SELF);
test('v3490 F1. ★★★★★ 判据纯度(H5):八锚点在**本档判据层**各恰 1 次', () => {
    const bad = [];
    for (const [k, v] of Object.entries(ANCHORS)) {
        const decl = CNT(SELF_ONE, mkOneLine('"' + v + '"'));
        if (decl !== 1) bad.push('锚点 ' + k + ' 在判据层必须恰声明 1 次,实测 ' + decl);
    }
    assert.deepEqual(bad, [], 'H5 判据纯度不合格:' + bad.join(' | '));
    console.log('  ok 八锚点各恰 1 次(破坏点的字面量只在本档 ANCHORS 里出现)');
});
test('v3490 F2. ★★★★ 工具两向自证(H6):打偏必须拒绝破坏 / 破坏必须真改源码', () => {
    /* ① 锚点不存在 ⇒ 必须抛「拒绝破坏」。 */
    assert.throws(() => breakOnce(CP_SRC, '这个锚点在真源码里不存在()', 'x', 'probe-miss'), /拒绝破坏/);
    /* ② 锚点多处命中 ⇒ 必须抛「恰中 1 次」。 */
    assert.throws(() => breakOnce(CP_SRC, 'return', 'return false;', 'probe-multi'), /恰中 1 次/);
    /* ③ 同值替换 ⇒ 必须抛「必须真的改变源码」。 */
    assert.throws(() => breakOnce(CP_SRC, ANCHORS.kAbsent, ANCHORS.kAbsent, 'probe-same'), /必须真的改变源码/);
    console.log('  ok 打偏/多处/同值三种坏法都被工具自己挡住');
});
test('v3490 G1. ★★ 版本锚:自锚常量 BORN_V 恰是当版(下界口径,不锁当版)', () => {
    assert.ok(vnum(BORN_V) <= vnum(MF.version), '自锚不得承诺未来版');
    assert.ok(vnum(BORN_V) >= vnum('3.349.0'), '自锚不得低于本档出生版本');
    console.log('  ok 锚 ' + BORN_V + ' · 当版 ' + MF.version);
});
