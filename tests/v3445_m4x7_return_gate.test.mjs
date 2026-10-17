/* ============================================================
 * tests/v3445_m4x7_return_gate.test.mjs — v3.345.0 · M4-X7
 * 旧事重现进入真实生成且由玩家控频(动作生命周期轴 + 控频强度档 + 重复轰炸闸)
 *
 * 【本档要证明的四件事(不是「函数返回了对象」)】
 *   a) **三通道分列且冷却只认两档**:同一条旧事标 preview / shown / used 后
 *      **逐通道可分**,而 **预览一律不消耗冷却**(M4-X7 立身之本);
 *      「预览了一下就取消」不得把下一轮想提的旧事堵死(修前缺口:预览误耗冷却);
 *   b) **控频强度档三态不同形**:默认 **hint-only**(计划验收原文「默认提示」),
 *      只有显式 inject 才产可注入面,off 恒零 —— 三态读数**互不同形**;
 *   c) **重复轰炸闸**:同 (触发键, 旧事键) 在 REPEAT_WINDOW 楼内已 shown/used
 *      ⇒ 再问一律 held(reason `repeat-window`);**预览过不算**(与 a 同源);
 *   d) **反馈只是呈现偏好**:never 不出建议面 / less 押后仍可见,
 *      而 marks **一条不删**(计划「不做」区明写「不用情绪猜测修改历史」)。
 *
 * 【三条「不做」也在判据里】
 *   1 不猜冷却:窗口未给 / 当前楼层未给 ⇒ 冷却面**未判**(judged:false),
 *     不读成「无冷却」;未判的条目**不进可注入面**(即便策略允许);
 *   2 不产百分比 / 置信度:读数里出现 percent / confidence / score 一类键即不通过;
 *   3 不据情绪改写:情绪面**只读**(emotionUsed 恒 false),不回写候选权重。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形;
 *   并反向对照「原版同判据必须通过」。判据纯度(H5)单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum(锚必须住在当版档案里,供版本守卫 V4 计数)。
 * 【本版新增的一格】**持久化面也进负控制**:宿主把控制状态写在 worldProg.returnGate 上,
 *   而 worldProg 子键是逐项枚举持久化的 —— 不登记则「跨会话携带」是假声明(见 D7/A3)。
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
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const RG_SRC = read('return-gate.js');
const ORG_SRC = read('memory-organs.js');
const SELF = read(path.join('tests', 'v3445_m4x7_return_gate.test.mjs'));
const BORN_V = '3.345.0';
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
const RG = loadIIFE(RG_SRC, 'LonShaReturnGate');
/** 器官模块另走一路:它挂 `global.LonShaMemoryOrgans`(与 narrative-layer 的 window 面不同)。 */
function loadOrgans(src) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx.LonShaMemoryOrgans;
    if (!api) throw new Error('器官模块未挂 LonShaMemoryOrgans');
    return api;
}
const MO = loadOrgans(ORG_SRC);
/* ══════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════ */
const ANCHORS = Object.freeze({
    /* 内核·冷却只认 shown/used:置假 ⇒ 预览也算冷却(实测红:B1 拿到 cooled:true)。 */
    kCooldown: String.raw`if (COOLDOWN_CHANNELS.indexOf(m.channel) < 0) continue;`,
    /* 内核·默认策略:置错 ⇒ 缺省不再落到 hint-only(实测红:B3 默认档拿到 inject)。 */
    kDefault: String.raw`return POLICY.HINT;`,
    /* 内核·重复闸:置假 ⇒ 窗口内已展示过的旧事照旧放行(实测红:B4 拿不到 held)。 */
    kRepeat: String.raw`if (cd.judged && cd.cooled) { g = 'held'; why = 'repeat-window'; }`,
    /* 内核·偏好 never:置假 ⇒ never 不再挡在建议面外(实测红:B5 拿到 blocked 0)。 */
    kNever: String.raw`else if (pf.known && pf.pref === PREFERENCE.NEVER) { g = 'blocked'; why = 'pref-never'; neverN++; }`,
    /* 内核·可注入面闸:置假 ⇒ 只给提示时也产可注入面(实测红:B2 拿到 injectable>0)。
     *   ★ 注意:本锚点的破坏在「注入了 open 但 policy 非 inject」的场景才现形 ——
     *     D5 因此另取**关停档**锚点(见 kOff):它在该夹具下**确实**改行为(
     *     置假后 off 档不再 blocked,open 由 0 → 3),负控制不会空转。 */
    kInject: String.raw`const injectable = (policy === POLICY.INJECT && cdUnjudged === 0) ? open.slice() : [];`,
    /* 内核·关停档:置假 ⇒ off 档不再 blocked(实测红:B2 的 off 断言拿到 open 3 / blocked 0)。
     *   为什么 D5 用这一条而不是 kInject:负控制必须**可观测改行为**,
     *   而 kInject 的破坏在 B2 那个夹具下(默认 hint-only)不改变任何读数。 */
    kOff: String.raw`if (policy === POLICY.OFF) { g = 'blocked'; why = 'policy-off'; }`,
    /* 宿主·候选装配:置假 ⇒ 显式喂候选被当成「没有候选」(实测红:宿主判据 C1 拿到空盘)。
     *   ★ 锚点是**打过三态补丁之后**的形态(显式给了就原样透传)。 */
    hCands: String.raw`if (o.candidates !== undefined && o.candidates !== null) return { candidates: o.candidates, source: 'given' };`,
    /* 宿主·移交面:置假 ⇒ 移交把全部闸条目都放出去(实测红:宿主判据 C3 拿到闭闸条目)。 */
    hAdmit: String.raw`const adm = Array.isArray(read.injectable) ? read.injectable : [];`,
    /* 器官·持久化面:置假 ⇒ 控制状态存盘即丢(实测红:A3 导出面拿到 returnGate 缺失)。 */
    kPersist: String.raw`            returnGate: this.returnGate || null,`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    'returnGate(opts) {',
    'returnGateAdmit(opts) {',
    'returnGateMark(channel, rec) {',
    'returnGatePrefer(detailKey, pref) {',
    '_returnGateLine() {',
];
function judgeStruct(idxSrc, mf, orgSrc) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idxSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次(应恰 1)');
    }
    if (idxSrc.indexOf('function _returnGateLib() {') < 0) bad.push('缺取库口 _returnGateLib');
    if (idxSrc.indexOf("'return-gate.js'") < 0) bad.push('缺模块文件名声明');
    if (idxSrc.indexOf("return ['控频闸', '模块未加载(return-gate.js)'];") < 0) bad.push('缺自检行「控频闸」');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('return-gate.js') < 0) bad.push('manifest.extra_js 缺 return-gate.js');
    /* ★ 本刀**不新增顶层持久化键** —— 状态落在既有 worldProg 的子键上(逐项枚举那一张表)。 */
    if (idxSrc.indexOf('returnGate:') >= 0) bad.push('出现了顶层持久化契约键 returnGate:(应落在 worldProg 子键上)');
    const arch = (/const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    const carry = (/const CARRYOVER_EXEMPT_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    if (/'returnGate'/.test(arch) || /'returnGate'/.test(carry)) bad.push('控频闸混进了顶层归档/跨卷键(本面只落在 worldProg 子键)');
    /* ★ 子键必须**同时**出现在 constructor / export / import 三面(缺任一面 = 存盘即丢或读档即空)。 */
    for (const f of ['this.returnGate = null;', 'returnGate: this.returnGate || null,', "this.returnGate = (data.returnGate"]) {
        if (orgSrc.split(f).length - 1 !== 1) bad.push('worldProg 子键三面缺一处:' + f);
    }
    return bad;
}
test('v3445 A1. **** 宿主五出口各恰一处 + 取库口 + 自检行 + extra_js 登记 + **零顶层落盘面**', () => {
    assert.deepEqual(judgeStruct(IDX, MF, ORG_SRC), [], judgeStruct(IDX, MF, ORG_SRC).join(';'));
    assert.ok(MF.extra_js.length >= 110, 'extra_js 不得低于本档出生值 110(实 ' + MF.extra_js.length + ')');
    console.log('  ok 五出口各恰 1 次 / 取库口 / 自检行 / extra_js ≥ 110(实 ' + MF.extra_js.length + ') / 无顶层持久化键');
});
function judgeKernel(rg) {
    const bad = [];
    if (rg.RG_VERSION !== 1) bad.push('RG_VERSION 应 1,实 ' + rg.RG_VERSION);
    if (rg.RG_KIND !== 'return_gate') bad.push('RG_KIND 不对:' + rg.RG_KIND);
    for (const s of ['preview', 'shown', 'used']) {
        if (rg.CHANNELS.indexOf(s) < 0) bad.push('CHANNELS 缺 ' + s);
    }
    if (rg.CHANNELS.length !== 3) bad.push('CHANNELS 应恰 3 通道,实 ' + rg.CHANNELS.length);
    if (rg.COOLDOWN_CHANNELS.length !== 2 || rg.COOLDOWN_CHANNELS.indexOf('preview') >= 0) {
        bad.push('COOLDOWN_CHANNELS 应恰 shown/used 两档(预览不得在内)');
    }
    if (rg.POLICY.OFF !== 'off' || rg.POLICY.HINT !== 'hint-only' || rg.POLICY.INJECT !== 'inject') bad.push('POLICY 三态常量不对');
    if (rg.GATE.length !== 3) bad.push('GATE 应恰 open/held/blocked 三档');
    if (rg.REPEAT_WINDOW !== 3) bad.push('REPEAT_WINDOW 应 3,实 ' + rg.REPEAT_WINDOW);
    for (const f of ['keyOf', 'floorOf', 'normState', 'markChannel', 'preferenceOf', 'withPreference', 'cooldownOf', 'cooldownByChannel', 'candidateOf', 'policyOf', 'gate', 'build', 'render', 'describe', 'hasPercentKey', 'line', 'selfCheck']) {
        if (typeof rg[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    /* 自证八项:确定性 / 零写面 / 三通道齐 / **预览不消耗** / 展示与真用落冷却 / 默认提示 / 无百分比 / 反馈不改历史。 */
    const sc = rg.selfCheck();
    if (sc.ok !== true) bad.push('selfCheck 对合法输入报红:' + JSON.stringify(sc));
    if (sc.writeFaces !== 0) bad.push('selfCheck 数出写面:' + sc.writeFaces);
    if (sc.channelsComplete !== true) bad.push('selfCheck 未守住「三通道齐」');
    if (sc.previewFree !== true) bad.push('selfCheck 未守住「预览不消耗冷却」(本刀立身之本)');
    if (sc.shownUsedCool !== true) bad.push('selfCheck 未守住「展示/真用落冷却」');
    if (sc.defaultHint !== true) bad.push('selfCheck 未守住「默认提示」');
    if (sc.percentFree !== true) bad.push('selfCheck 未守住「不产百分比」');
    if (sc.feedbackKeepsHistory !== true) bad.push('selfCheck 未守住「反馈不改历史」');
    if (sc.deterministic !== true || sc.serializable !== true) bad.push('selfCheck 确定性/可序列化未过');
    return bad;
}
test('v3445 A2. **** 内核面:版本 + 三通道(冷却两档)+ 三策略 + 三闸态 + 十七原语 + 自证八项', () => {
    assert.deepEqual(judgeKernel(RG), [], judgeKernel(RG).join(';'));
    console.log('  ok RG_VERSION 1 / CHANNELS 3 · COOLDOWN 2(无 preview)/ POLICY 3 / GATE 3 / 自证八项全过');
});
/** 判据 A3:控制状态**真的**跨会话携带,且随删楼回滚(修前:写进 worldProg 但不在枚举表 ⇒ 存盘即丢)。 */
function judgePersist(mo) {
    const WP = mo && mo.WorldProgress;
    if (typeof WP !== 'function') throw new Error('器官模块未导出 WorldProgress');
    const mk = () => ({
        marks: [
            { triggerKey: 'place:school', detailKey: 'd1', channel: 'shown', floor: 5, at: 1 },
            { triggerKey: 'place:school', detailKey: 'd1', channel: 'used', floor: 8, at: 2 },
            { triggerKey: 'item:ring', detailKey: 'd2', channel: 'preview', floor: 9, at: 3 },
        ],
        prefs: { d2: 'never' },
    });
    const wp = new WP();
    if (wp.returnGate !== null) throw new Error('新器官的 returnGate 应 null,实 ' + JSON.stringify(wp.returnGate));
    wp.returnGate = mk();
    const ex = wp.export();
    if (!Object.prototype.hasOwnProperty.call(ex, 'returnGate')) throw new Error('export() 未携带 returnGate(存盘即丢)');
    if (!ex.returnGate || ex.returnGate.marks.length !== 3) throw new Error('export() 的 returnGate 形状不对');
    /* 往返:存 → 读 ⇒ 状态本体(marks + prefs)一字不差。 */
    const back = new WP();
    back.import(JSON.parse(JSON.stringify(ex)));
    if (!back.returnGate || back.returnGate.marks.length !== 3) throw new Error('import() 未恢复 marks(读档即空)');
    if (back.returnGate.prefs.d2 !== 'never') throw new Error('import() 未恢复呈现偏好');
    /* 畸形一律回落 null(不抛、不半截)。 */
    const bad = new WP();
    bad.import({ returnGate: 'not-object' });
    if (bad.returnGate !== null) throw new Error('畸形 returnGate 应回落 null,实 ' + JSON.stringify(bad.returnGate));
    /* 删楼:该楼标记整条摘除(否则冷却命中永久留着 ⇒ 该条旧事永久 held)。 */
    const d = new WP();
    d.import(JSON.parse(JSON.stringify(ex)));
    const rm = d.removeByFloor(5);
    if (!(rm >= 1)) throw new Error('removeByFloor 未报出摘除计数,实 ' + rm);
    if (d.returnGate.marks.length !== 2) throw new Error('第 5 楼的标记应摘除,实剩 ' + d.returnGate.marks.length);
    if (d.returnGate.marks.some((m) => Number(m.floor) === 5)) throw new Error('第 5 楼标记仍在');
    /* 前移:只摘不挪 ⇒ 窗口判据会把它算成未来的命中。 */
    const s = new WP();
    s.import(JSON.parse(JSON.stringify(ex)));
    s.shiftFloorRefs(7);
    const floors = s.returnGate.marks.map((m) => Number(m.floor)).sort((a, b) => a - b);
    if (JSON.stringify(floors) !== JSON.stringify([5, 7, 8])) throw new Error('删楼前移未同步 marks.floor,实 ' + JSON.stringify(floors));
    if (s.returnGate.prefs.d2 !== 'never') throw new Error('前移不得动呈现偏好');
    return ex;
}
test('v3445 A3. ★★★ 持久化面:状态真跨会话携带(constructor/export/import 三面)+ 随删楼摘除与前移', () => {
    judgePersist(MO);
    console.log('  ok ctor null / export 带 marks 3 + prefs / 往返一字不差 / 畸形回落 null / 删楼摘除 + 前移');
});
/* ══════════════ B. 真跑(内核,纯函数) ══════════════ */
/** 夹具:三条候选,键互不相同(便于逐条追闸态)。 */
const T_CANDS = [
    { kind: 'place', triggerKey: 'place:school', detailKey: 'd1', title: '旧教室', source: '旧日记' },
    { kind: 'item', triggerKey: 'item:ring', detailKey: 'd2', title: '旧戒指', source: '抽屉底' },
    { kind: 'person', triggerKey: 'person:lin', detailKey: 'd3', title: '旧同事' },
];
/** 判据 a:**预览不消耗冷却**(与「展示落冷却」成对 —— 同键、通道不同,结果必须不同)。 */
function judgePreviewFree(rg) {
    const pv = rg.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'preview', floor: 10 });
    if (pv.ok !== true || pv.changed !== true) throw new Error('登记预览标记失败:' + JSON.stringify(pv));
    const cd = rg.cooldownOf(pv.state, 'place:school', 'd1', 11, { window: 3 });
    if (cd.judged !== true) throw new Error('冷却面应已判(window+now 都给了)');
    if (cd.cooled !== false) throw new Error('★ 预览不得落冷却(实 cooled:' + cd.cooled + ')');
    if (cd.hitCount !== 0) throw new Error('预览标记不得进命中,实 ' + cd.hitCount);
    /* 反面对照:同键改 shown / used ⇒ 必须**落冷却**(否则「分列」是空话)。 */
    const sw = rg.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'shown', floor: 10 });
    const swCd = rg.cooldownOf(sw.state, 'place:school', 'd1', 11, { window: 3 });
    if (swCd.judged !== true || swCd.cooled !== true) throw new Error('展示必须落冷却(实 ' + JSON.stringify(swCd) + ')');
    const us = rg.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'used', floor: 10 });
    const usCd = rg.cooldownOf(us.state, 'place:school', 'd1', 11, { window: 3 });
    if (usCd.judged !== true || usCd.cooled !== true) throw new Error('真用必须落冷却');
    const byCh = rg.cooldownByChannel(swCd.hits.concat(usCd.hits));
    if (byCh.shown !== 1 || byCh.used !== 1) throw new Error('冷却归因未按通道拆开:' + JSON.stringify(byCh));
    /* 三通道分列:逐通道可分(同键同楼只通道不同 ⇒ 冷却结论相反)。 */
    const all = rg.markChannel(us.state, { triggerKey: 'item:ring', detailKey: 'd2', channel: 'preview', floor: 10 });
    if (all.state.marks.length !== 2) throw new Error('三通道标记应各自入库(d1.used + d2.preview),实 ' + all.state.marks.length);
    if (all.state.marks.filter((m) => m.channel === 'used').length !== 1) throw new Error('used 通道标记未入库');
    if (all.state.marks.filter((m) => m.channel === 'preview').length !== 1) throw new Error('preview 通道标记未入库');
    /* 幂等:同键同通道同楼重复登记不得重复计。 */
    const dup = rg.markChannel(all.state, { triggerKey: 'item:ring', detailKey: 'd2', channel: 'preview', floor: 10 });
    if (dup.reason !== 'duplicate' || dup.changed !== false) throw new Error('重复登记应变 duplicate/changed:false:' + JSON.stringify(dup));
    /* 非法通道一律拒绝(不猜成某个通道)。 */
    const badCh = rg.markChannel({}, { triggerKey: 't', detailKey: 'd', channel: 'nope', floor: 1 });
    if (badCh.ok !== false || badCh.reason !== 'bad-channel') throw new Error('非法通道未拒绝:' + JSON.stringify(badCh));
    return cd;
}
test('v3445 B1. ★★★ 预览不消耗冷却(标记照记)/ 展示与真用落冷却 / 三通道可分 / 幂等 / 非法通道拒绝', () => {
    judgePreviewFree(RG);
    console.log('  ok 预览 cooled:false · hit 0 / shown·used cooled:true / 归因 1:1 / 重复 duplicate / bad-channel 拒绝');
});
/** 判据 b:控频强度档三态**不同形** */
function judgePolicies(rg) {
    const dflt = rg.build(T_CANDS, { now: 10 });
    if (dflt.policy !== 'hint-only') throw new Error('缺省策略应 hint-only(计划验收原文「默认提示」),实 ' + dflt.policy);
    if (dflt.injectable.length !== 0) throw new Error('只给提示时不得产可注入面,实 ' + dflt.injectable.length);
    if (dflt.counts.open !== 3) throw new Error('提示档仍应给出建议面(open 3),实 ' + dflt.counts.open);
    const inj = rg.build(T_CANDS, { now: 10, policy: 'inject' });
    if (inj.policy !== 'inject') throw new Error('显式 inject 未生效');
    if (inj.injectable.length !== 3) throw new Error('显式 inject 且冷却已判 ⇒ 可注入面应 3,实 ' + inj.injectable.length);
    const off = rg.build(T_CANDS, { now: 10, policy: 'off' });
    if (off.policy !== 'off') throw new Error('off 档未生效');
    if (off.counts.open !== 0 || off.counts.blocked !== 3) throw new Error('关停档应全部 blocked,实 ' + JSON.stringify(off.counts));
    if (off.injectable.length !== 0) throw new Error('关停档不得产可注入面');
    /* 三态**读数不同形**(合并任意两档都会让人误判「这条到底会不会进生成」)。 */
    const shape = (r) => JSON.stringify([r.policy, r.counts.open, r.counts.blocked, r.counts.injectable]);
    if (new Set([shape(dflt), shape(inj), shape(off)]).size !== 3) throw new Error('三档读数同形:' + [shape(dflt), shape(inj), shape(off)].join(' | '));
    /* 非法策略名 ⇒ 回落缺省(不猜)。 */
    if (rg.build(T_CANDS, { now: 10, policy: 'whatever' }).policy !== 'hint-only') throw new Error('非法策略名未回落缺省');
    return inj;
}
test('v3445 B2. ★★★ 控频强度档:默认 hint-only(不自动注入)/ 显式 inject 才产可注入面 / off 恒零', () => {
    judgePolicies(RG);
    console.log('  ok hint-only open3·injectable0 / inject injectable3 / off blocked3·injectable0 / 三档不同形');
});
/** 判据 c:重复轰炸闸 —— 窗口内已 shown/used ⇒ held(reason repeat-window);**预览过不算**。 */
function judgeRepeat(rg) {
    const sw = rg.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'shown', floor: 10 });
    const r = rg.build(T_CANDS, { now: 12, policy: 'inject', state: sw.state, window: 3 });
    const hit = r.gates.find((x) => x.detailKey === 'd1');
    if (!hit) throw new Error('闸面里没有 d1');
    if (hit.gate !== 'held' || hit.reason !== 'repeat-window') throw new Error('窗口内已展示过的旧事应 held/repeat-window,实 ' + hit.gate + '/' + hit.reason);
    if (r.injectable.some((x) => x.detailKey === 'd1')) throw new Error('押后条目不得出现在可注入面');
    if (r.counts.held !== 1) throw new Error('押后应恰 1 条,实 ' + r.counts.held);
    /* 窗口外 ⇒ 重新放行(冷却落地,不是永久封杀)。 */
    const far = rg.build(T_CANDS, { now: 40, policy: 'inject', state: sw.state, window: 3 });
    if (far.gates.find((x) => x.detailKey === 'd1').gate !== 'open') throw new Error('窗口外的旧事应重新放行');
    /* ★ 预览过**不算**(与 B1 同源:冷却只按 shown/used 落定)。 */
    const pv = rg.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'preview', floor: 10 });
    const afterPv = rg.build(T_CANDS, { now: 12, policy: 'inject', state: pv.state, window: 3 });
    if (afterPv.gates.find((x) => x.detailKey === 'd1').gate !== 'open') throw new Error('★ 预览过不得算作已提过(否则「预览一下」就再也提不出来)');
    if (afterPv.counts.injectable !== 3) throw new Error('预览后的可注入面应仍是 3,实 ' + afterPv.counts.injectable);
    return r;
}
test('v3445 B3. ★★★ 重复轰炸闸:窗口内已 shown/used ⇒ held(repeat-window)/ 窗口外放行 / **预览过不算**', () => {
    judgeRepeat(RG);
    console.log('  ok 窗口内 held·reason repeat-window / 窗口外 open / 预览后仍 open(injectable 3)');
});
/** 判据 d:反馈只是呈现偏好 —— never 不出建议面 / less 押后仍可见 / marks 一条不删。 */
function judgePreference(rg) {
    const base = { marks: [{ triggerKey: 'item:ring', detailKey: 'd2', channel: 'preview', floor: 1, at: 1 }], prefs: {} };
    const nv = rg.withPreference(base, 'd2', 'never');
    if (nv.ok !== true || nv.changed !== true) throw new Error('设偏好失败:' + JSON.stringify(nv));
    if (rg.normState(nv.state).state.marks.length !== 1) throw new Error('★ 设偏好不得删历史标记(计划「不做」区:不用情绪猜测修改历史)');
    const gNv = rg.build(T_CANDS, { now: 10, state: nv.state });
    const d2 = gNv.gates.find((x) => x.detailKey === 'd2');
    if (d2.gate !== 'blocked' || d2.reason !== 'pref-never') throw new Error('never 应挡在建议面外(blocked/pref-never),实 ' + d2.gate + '/' + d2.reason);
    if (gNv.counts.blocked !== 1) throw new Error('不出应恰 1 条,实 ' + gNv.counts.blocked);
    if (gNv.prefsApplied.never !== 1) throw new Error('偏好读数未记 never 1,实 ' + gNv.prefsApplied.never);
    /* less:押后,但仍可见(与 never 不同档)。 */
    const ls = rg.withPreference(base, 'd1', 'less');
    const gLs = rg.build(T_CANDS, { now: 10, state: ls.state });
    const d1 = gLs.gates.find((x) => x.detailKey === 'd1');
    if (d1.gate !== 'held' || d1.reason !== 'pref-less') throw new Error('less 应押后(pref-less),实 ' + d1.gate + '/' + d1.reason);
    if (gLs.prefsApplied.less !== 1) throw new Error('偏好读数未记 less 1');
    /* 未记录的偏好**与 normal 不同形**(不读成「默认 normal」)。 */
    const none = rg.preferenceOf({}, 'd1');
    if (none.known !== false || none.pref !== 'normal') throw new Error('未记录偏好应 known:false + pref normal,实 ' + JSON.stringify(none));
    /* normal ⇒ 删除记录(回默认),但**不碰 marks**。 */
    const back = rg.withPreference(nv.state, 'd2', 'normal');
    if (back.reason !== 'cleared' || back.changed !== true) throw new Error('回默认应 cleared,实 ' + JSON.stringify(back));
    if (rg.normState(back.state).state.marks.length !== 1) throw new Error('回默认不得动 marks');
    if (rg.preferenceOf(back.state, 'd2').known !== false) throw new Error('回默认后不应再有记录');
    /* 非法偏好名 ⇒ 拒绝。 */
    if (rg.withPreference({}, 'd1', 'whatever').reason !== 'bad-pref') throw new Error('非法偏好名未拒绝');
    return gNv;
}
test('v3445 B4. ★★★ 反馈只是呈现偏好:never 不出 / less 押后 / **不删任何历史标记** / 未记录≠normal', () => {
    judgePreference(RG);
    console.log('  ok never blocked·1 / less held·1 / marks 1 不变 / 未记录 known:false / normal 回默认 cleared');
});
/** 判据 e:不猜冷却 —— 窗口/楼层未给 ⇒ 未判,且**未判不进可注入面**;不产百分比。 */
function judgeNoGuess(rg) {
    const noNow = rg.build(T_CANDS, { now: null, policy: 'inject' });
    if (noNow.cooldownUnjudged !== 3) throw new Error('当前楼层未给 ⇒ 三条皆未判,实 ' + noNow.cooldownUnjudged);
    if (noNow.injectable.length !== 0) throw new Error('★ 冷却未判时即便策略允许也不得进可注入面(不猜)');
    if (noNow.counts.open !== 3) throw new Error('未判不影响建议面(建议仍出)');
    if (!noNow.reasons.some((x) => /冷却未判/.test(x))) throw new Error('未判必须写进 reasons(否则读者以为「无冷却」)');
    const noWin = rg.cooldownOf({}, 't', 'd', 5, {});
    if (noWin.judged !== false || noWin.cooled !== false) throw new Error('窗口未给 ⇒ 冷却面未判(不读成无冷却):' + JSON.stringify(noWin));
    if (!/未判/.test(noWin.why)) throw new Error('未判必须具名说出为什么');
    /* 楼层 null 的标记**不参与命中**(如实计入 noFloor),也不编成第 0 楼。 */
    const nn = rg.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'shown', floor: null });
    const cd = rg.cooldownOf(nn.state, 'place:school', 'd1', 11, { window: 3 });
    if (cd.judged !== true || cd.cooled !== false || cd.noFloor !== 1) throw new Error('无楼层标记应如实 noFloor 1 且不命中:' + JSON.stringify(cd));
    if (rg.floorOf('') !== null || rg.floorOf(null) !== null) throw new Error('空/缺楼层应如实 null(不编 0)');
    /* 不产百分比 / 置信度(PERCENT_KEYS 深度扫描)。 */
    const full = rg.build(T_CANDS, { now: 10, policy: 'inject' });
    if (rg.hasPercentKey(full) !== false) throw new Error('读数里出现了百分比/置信度键');
    if (rg.hasPercentKey({ a: { confidence: 3 } }) !== true) throw new Error('扫描器失效(合成的置信度键没被照出)');
    /* 情绪只读:喂情绪不改闸结论,emotionUsed 恒 false。 */
    const emo = rg.build(T_CANDS, { now: 10, policy: 'inject', emotion: '焦躁' });
    if (emo.emotionUsed !== false) throw new Error('情绪面必须只读(emotionUsed 恒 false)');
    if (emo.counts.injectable !== full.counts.injectable) throw new Error('★ 情绪不得改写闸结论');
    /* 截断:超上限如实报截断数,不静默丢。 */
    const many = new Array(20).fill(0).map((_, i) => ({ kind: 'place', triggerKey: 'k' + i, detailKey: 'd' + i, title: 't' + i }));
    const tr = rg.build(many, { now: 10, policy: 'inject' });
    if (tr.truncated !== 20 - rg.MAX_CANDIDATES) throw new Error('截断数应 ' + (20 - rg.MAX_CANDIDATES) + ',实 ' + tr.truncated);
    return noNow;
}
test('v3445 B5. ★★ 不猜:窗口/楼层未给 ⇒ 冷却未判且不进可注入面 / 无楼层不编第 0 楼 / 不产百分比 / 情绪只读', () => {
    judgeNoGuess(RG);
    console.log('  ok 未判 3 · injectable 0 · reasons 具名 / noFloor 1 / percentFree / emotionUsed false / 截断 8');
});
/** 判据 f:入参三态**不同形**(畸形 / 缺席 / 空数组)—— 不把「判不了」并进「没有候选」。 */
function judgeInputShapes(rg) {
    const mal = rg.build('not-array', { now: 10 });
    if (mal.malformedInput !== true || mal.judged !== false) throw new Error('显式非数组应报畸形:' + JSON.stringify(mal.malformedInput));
    if (!mal.reasons.some((x) => /不是数组|畸形/.test(x))) throw new Error('畸形必须具名(不得读成「没有可提的旧事」)');
    const none = rg.build(undefined, {});
    if (none.malformedInput) throw new Error('根本没给候选不应报畸形(合法的「这一次没有候选」)');
    if (none.counts.total !== 0 || none.judged !== true) throw new Error('缺席应是合法的空面,实 ' + JSON.stringify(none.counts));
    const empty = rg.build([], { now: 10 });
    if (empty.counts.total !== 0 || empty.degraded) throw new Error('空数组应是合法空面');
    /* 三态读数不同形。 */
    const shape = (r) => JSON.stringify([!!r.malformedInput, !!r.degraded, r.judged, r.counts.total]);
    if (new Set([shape(mal), shape(none), shape(empty)]).size < 2) throw new Error('畸形与缺席同形(修前缺口:判不了被读成没有)');
    /* 建面异常不外抛(建面降级面可复算)。 */
    if (typeof rg.gate(null, {}, {}) !== 'object') throw new Error('gate 对 null 候选应返回读数而非抛');
    return mal;
}
test('v3445 B6. ** 入参三态不同形:畸形(candidates 非数组)≠ 缺席 ≠ 空数组 / 建面绝不外抛', () => {
    judgeInputShapes(RG);
    console.log('  ok 畸形 malformed·judged:false / 缺席合法空面 / 空数组空面 / 三者不同形');
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
    'function _fatedRecallLib() {',
    'function _returnGateLib() {',
];
const METH_FNS = [
    '_returnGateCandidates(opts) {',
    'returnGate(opts) {',
    'returnGateAdmit(opts) {',
    'returnGateMark(channel, rec) {',
    'returnGatePrefer(detailKey, pref) {',
    '_returnGateLine() {',
];
function mkHost(win, src) {
    const idx = src || IDX;
    const libs = LIB_FNS.map((h) => sliceMember(idx, h));
    const meths = METH_FNS.map((h) => sliceMember(idx, h));
    const miss = LIB_FNS.filter((h, i) => !libs[i]).concat(METH_FNS.filter((h, i) => !meths[i]));
    if (miss.length) throw new Error('切片缺失:' + miss.join(' / '));
    const code = libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });';
    return new Function('errLog', 'window', code)(() => {}, win);
}
const RG_WIN = () => ({ LonShaReturnGate: RG });
function rgSelf(win, src) {
    return Object.assign(mkHost(win, src), { worldProg: {}, _lastInjection: 'SENTINEL' });
}
function judgeHostRead(src, cands) {
    const self = rgSelf(RG_WIN(), src);
    const r = self.returnGate({ candidates: cands || T_CANDS, now: 10, policy: 'inject' });
    if (r.ok !== true) throw new Error('宿主出口未成功(reason=' + r.reason + ')');
    if (r.counts.total !== 3) throw new Error('宿主未把候选喂进内核(实 ' + r.counts.total + ')');
    if (r.candidateSource !== 'given') throw new Error('候选来源应记 given,实 ' + r.candidateSource);
    if (r.injectable.length !== 3) throw new Error('显式 inject 下可注入面应 3,实 ' + r.injectable.length);
    if (self._returnGateRead !== r) throw new Error('宿主未把读数存进只读面 _returnGateRead');
    if (self._lastInjection !== 'SENTINEL') throw new Error('只读出口动了注入面(不摸 window / 不读 storage)');
    return r;
}
test('v3445 C1. *** 宿主取真源:opts.candidates ⇒ 三通道过闸原样带出(出口只读 / 未动注入面)', () => {
    judgeHostRead(IDX);
    console.log('  ok ok true / total 3 / source given / injectable 3 / 未动注入面');
});
/** 判据:宿主缺省取数 —— 无 fated-recall ⇒ 如实报 no-fated 空盘(**不编候选**)。 */
function judgeHostDefault(src) {
    const self = rgSelf(RG_WIN(), src);
    const r = self.returnGate({ now: 10, policy: 'inject' });
    if (r.ok !== true) throw new Error('缺 fated-recall 时宿主应仍建成空面(reason=' + r.reason + ')');
    if (r.candidateSource !== 'no-fated') throw new Error('缺 fated-recall 应如实记 no-fated,实 ' + r.candidateSource);
    if (r.counts.total !== 0) throw new Error('★ 不得凭空编出候选(实 ' + r.counts.total + ')');
    /* 显式喂了 candidates ⇒ 就不再走回落(两条路口径不得混)。 */
    const self2 = rgSelf(RG_WIN(), src);
    const r2 = self2.returnGate({ candidates: T_CANDS, now: 10, policy: 'inject' });
    if (r2.candidateSource !== 'given' || r2.counts.total !== 3) throw new Error('显式喂候选未走 given 路');
    return r;
}
test('v3445 C2. ** 宿主缺省取数:无 fated-recall ⇒ 如实 no-fated 空盘(不编候选)/ 显式喂则走 given', () => {
    judgeHostDefault(IDX);
    console.log('  ok no-fated total 0 / given total 3 / 两路口径不混');
});
/** 判据:移交面 —— 只给**策略允许 + gate open + 冷却已判**的条目,且**移交不算已用**。 */
function judgeAdmit(src) {
    const self = rgSelf(RG_WIN(), src);
    const sw = RG.markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'shown', floor: 10 });
    self.worldProg.returnGate = sw.state;
    const a = self.returnGateAdmit({ candidates: T_CANDS, now: 12, policy: 'inject', window: 3 });
    if (a.ok !== true) throw new Error('移交面未成功(reason=' + a.reason + ')');
    if (a.count !== 2) throw new Error('窗口内已展示的 d1 不得移交,应余 2 条,实 ' + a.count);
    if (a.admitted.some((x) => x.detailKey === 'd1')) throw new Error('★ 押后条目漏进了移交面');
    if (a.injectable !== true) throw new Error('inject 档下 injectable 应 true');
    if (!/移交不算已用|不算已用/.test(a.note || '')) throw new Error('移交面必须说清「移交不算已用」');
    if (self._returnGateAdmit !== a) throw new Error('移交读数未留痕');
    /* 只给提示 ⇒ 移交面为空,且 reason 说得出为什么(不静默)。 */
    const hint = self.returnGateAdmit({ candidates: T_CANDS, now: 10 });
    if (hint.count !== 0 || hint.injectable !== false) throw new Error('hint-only 下移交面应为空');
    if (hint.reason !== 'hint-only') throw new Error('空移交面必须具名原因,实 ' + hint.reason);
    /* ★ 移交**不得**自己落冷却(只有真用了才调 mark('used')).
     *   夹具里 d1 是「已展示过」⇒ 它本就出局,故基线是 2(不是 3);关键是**不因移交而减少**。 */
    const before = self.returnGate({ candidates: T_CANDS, now: 12, policy: 'inject', window: 3 });
    if (before.counts.injectable !== 2) throw new Error('基线 injectable 应 2(d1 窗口内出局),实 ' + before.counts.injectable);
    const after = self.returnGate({ candidates: T_CANDS, now: 12, policy: 'inject', window: 3 });
    if (after.counts.injectable !== 2) throw new Error('★ 移交动作本身不得消耗冷却(移交后应仍是 2,实 ' + after.counts.injectable + ')');
    return a;
}
test('v3445 C3. ★★ 宿主移交面:只给策略允许 + 开闸 + 冷却已判者 / **移交不算已用**(不消耗冷却)', () => {
    judgeAdmit(IDX);
    console.log('  ok count 2(d1 出局)/ note 声明不算已用 / hint-only 空面具名 / 移交后 injectable 仍 3');
});
/** 判据:登记面 —— 三通道分列落 worldProg.returnGate,**且真进持久化子键**。 */
function judgeMark(src) {
    const self = rgSelf(RG_WIN(), src);
    const pv = self.returnGateMark('preview', { triggerKey: 'place:school', detailKey: 'd1', floor: 10 });
    if (pv.ok !== true || pv.changed !== true) throw new Error('登记预览失败:' + JSON.stringify(pv));
    if (pv.kind !== 'return_gate_mark') throw new Error('登记读数未带 kind,实 ' + pv.kind);
    if (!self.worldProg.returnGate || self.worldProg.returnGate.marks.length !== 1) throw new Error('状态未落 worldProg.returnGate');
    const dup = self.returnGateMark('preview', { triggerKey: 'place:school', detailKey: 'd1', floor: 10 });
    if (dup.changed !== false || dup.reason !== 'duplicate') throw new Error('重复登记应变 duplicate:' + JSON.stringify(dup));
    const sh = self.returnGateMark('shown', { triggerKey: 'place:school', detailKey: 'd1', floor: 10 });
    if (sh.changed !== true) throw new Error('换通道登记应生效(三通道分列)');
    if (self.worldProg.returnGate.marks.length !== 2) throw new Error('两通道标记应各自入库,实 ' + self.worldProg.returnGate.marks.length);
    /* 非法通道 ⇒ 不改状态。 */
    const bad = self.returnGateMark('nope', { triggerKey: 't', detailKey: 'd', floor: 1 });
    if (bad.ok !== false || bad.reason !== 'bad-channel') throw new Error('非法通道未拒绝:' + JSON.stringify(bad));
    if (self.worldProg.returnGate.marks.length !== 2) throw new Error('非法通道不得改状态');
    /* 偏好面同样落世界推进子键,且**不删标记**。 */
    const pr = self.returnGatePrefer('d1', 'never');
    if (pr.ok !== true || pr.changed !== true) throw new Error('设偏好失败:' + JSON.stringify(pr));
    if (pr.kind !== 'return_gate_prefer') throw new Error('偏好读数未带 kind,实 ' + pr.kind);
    if (self.worldProg.returnGate.marks.length !== 2) throw new Error('★ 设偏好不得删标记');
    if (self.worldProg.returnGate.prefs.d1 !== 'never') throw new Error('偏好未落世界推进子键');
    return self.worldProg.returnGate;
}
test('v3445 C4. ★★ 宿主登记面:三通道分列落 worldProg.returnGate / 幂等 / 非法通道拒绝 / 设偏好不删标记', () => {
    const st = judgeMark(IDX);
    console.log('  ok preview→shown 两标记入库 / duplicate / bad-channel 不改状态 / prefs.d1=never · marks 仍 2');
    /* ★ 交界自证:宿主实际写出的状态形状,内核必须认得(不靠人眼比对结构)。 */
    const cd = RG.cooldownOf(st, 'place:school', 'd1', 11, { window: 3 });
    if (cd.judged !== true || cd.cooled !== true) throw new Error('宿主写出的状态未被内核识别为已冷却');
    if (RG.cooldownByChannel(cd.hits).shown !== 1) throw new Error('宿主状态里 shown 通道没被认出');
});
/** 判据:缺模块三态 —— 建面 / 移交 / 诊断行各降级具名。 */
function judgeAbsent(src, win) {
    const self = rgSelf(win, src);
    const b = self.returnGate({ candidates: T_CANDS, now: 10 });
    if (b.ok !== false || b.reason !== 'module-unavailable') throw new Error('缺模块时建面未降级(实 ' + JSON.stringify(b.reason) + ')');
    if (b.writesNothing !== true || b.gates.length !== 0) throw new Error('降级信封形状不对');
    const a = self.returnGateAdmit({ candidates: T_CANDS, now: 10 });
    if (a.ok !== false || a.count !== 0 || a.writesNothing !== true) throw new Error('缺模块时移交面未降级');
    const m = self.returnGateMark('preview', { triggerKey: 't', detailKey: 'd', floor: 1 });
    if (m.ok !== false || m.reason !== 'module-absent') throw new Error('缺模块时登记未降级(实 ' + m.reason + ')');
    const pr = self.returnGatePrefer('d', 'never');
    if (pr.ok !== false || pr.reason !== 'module-absent') throw new Error('缺模块时偏好未降级');
    const line = self._returnGateLine();
    if (line !== '模块未加载(return-gate.js)') throw new Error('缺模块时诊断行未具名(实 ' + line + ')');
}
test('v3445 C5. ** 缺模块四态:建面 / 移交 / 登记 / 偏好各降级具名 + 诊断行点名文件', () => {
    judgeAbsent(IDX, {});
    console.log('  ok module-unavailable ×3 + module-absent ×2(零写)/ 诊断行点名 return-gate.js');
});
/** 判据:宿主诊断行 —— 四方分开说 + 三条真损失永远报出来 + 空盘说暂无。 */
function judgeHostLine(src) {
    const self = rgSelf(RG_WIN(), src);
    const r = self.returnGate({ candidates: T_CANDS, now: 10, policy: 'inject' });
    const line = RG.line(r);
    for (const t of [/候选 3/, /可提 3/, /\*\*可注入 3\*\*/]) {
        if (!t.test(line)) throw new Error('诊断行漏说「' + t.source + '」:' + line);
    }
    /* hint-only:必须把「只给提示,不自动注入」说出口(否则读者以为已注入)。 */
    const hint = RG.line(self.returnGate({ candidates: T_CANDS, now: 10 }));
    if (!/只给提示,不自动注入/.test(hint)) throw new Error('提示档未说明「不自动注入」:' + hint);
    /* 冷却未判:必须报出来(三条真损失之一)。 */
    const unjudged = RG.line(self.returnGate({ candidates: T_CANDS, now: null, policy: 'inject' }));
    if (!/冷却未判 3 条/.test(unjudged)) throw new Error('未判未报出来:' + unjudged);
    /* 空盘:说「暂无」,不编。 */
    const empty = RG.line(self.returnGate({ now: 10 }));
    if (!/暂无旧事候选/.test(empty)) throw new Error('空盘未说「暂无」:' + empty);
    /* 畸形:具名说清判不了(不得与「暂无」同形)。 */
    const mal = RG.line(self.returnGate({ candidates: 'nope', now: 10 }));
    if (!/输入畸形/.test(mal)) throw new Error('畸形行未具名:' + mal);
    if (mal === empty) throw new Error('★ 畸形与空盘同形(修前缺口:判不了被读成没有)');
    return line;
}
test('v3445 C6. ** 宿主诊断行:四方分开说 / 提示档声明不自动注入 / 冷却未判永远报出来 / 空盘说暂无', () => {
    judgeHostLine(IDX);
    console.log('  ok 候选3·可提3·可注入3 / 「只给提示,不自动注入」/ 冷却未判 3 条 / 空盘暂无 / 畸形≠空盘');
});
/* ══════════════ D. 负控制(真源码破坏 → 副本重跑同款判据 → 必须现形) ══════════════ */
function expectRed(fn, label) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = String(e && e.message || e); }
    if (!threw) throw new Error(label + ':破坏后判据未转红(负控制空转)');
    return msg;
}
test('v3445 D1. ★★ 破坏「冷却只认 shown/used」⇒ 预览不消耗判据 B1 必须转红', () => {
    const bad = loadIIFE(breakOnce(RG_SRC, ANCHORS.kCooldown, String.raw`if (false) continue;`, 'kCooldown'), 'LonShaReturnGate');
    expectRed(() => judgePreviewFree(bad), 'kCooldown');
    judgePreviewFree(RG);
    console.log('  ok 破坏冷却通道过滤 ⇒ 预览也算冷却被照出;原版阳性通过');
});
test('v3445 D2. ★★ 破坏「默认策略」⇒ 默认提示判据 B2 必须转红', () => {
    const bad = loadIIFE(breakOnce(RG_SRC, ANCHORS.kDefault, String.raw`return POLICY.INJECT;`, 'kDefault'), 'LonShaReturnGate');
    expectRed(() => judgePolicies(bad), 'kDefault');
    judgePolicies(RG);
    console.log('  ok 破坏缺省档 ⇒ 不给策略也自动注入被照出;原版阳性通过');
});
test('v3445 D3. ★★ 破坏「重复轰炸闸」⇒ 窗口内押后判据 B3 必须转红', () => {
    const bad = loadIIFE(breakOnce(RG_SRC, ANCHORS.kRepeat, String.raw`if (false) { g = 'held'; why = 'repeat-window'; }`, 'kRepeat'), 'LonShaReturnGate');
    expectRed(() => judgeRepeat(bad), 'kRepeat');
    judgeRepeat(RG);
    console.log('  ok 破坏重复闸 ⇒ 窗口内已提过的照旧放行被照出;原版阳性通过');
});
test('v3445 D4. ★★ 破坏「偏好 never」⇒ 呈现偏好判据 B4 必须转红', () => {
    const bad = loadIIFE(breakOnce(RG_SRC, ANCHORS.kNever, String.raw`else if (false) { g = 'blocked'; why = 'pref-never'; neverN++; }`, 'kNever'), 'LonShaReturnGate');
    expectRed(() => judgePreference(bad), 'kNever');
    judgePreference(RG);
    console.log('  ok 破坏 never 挡面 ⇒ 「说了不提还照出」被照出;原版阳性通过');
});
test('v3445 D5. ★★ 破坏「关停档」⇒ 提示档不自动注入判据 B2 必须转红', () => {
    const bad = loadIIFE(breakOnce(RG_SRC, ANCHORS.kOff, String.raw`if (false) { g = 'blocked'; why = 'policy-off'; }`, 'kOff'), 'LonShaReturnGate');
    expectRed(() => judgePolicies(bad), 'kOff');
    /* kInject 另走一条**真能现形**的路:候选与策略都合法,但把闸做成「不看策略」——
     *   用 hint 档 + 已判冷却 ⇒ 破坏后 injectable 由 0 → 3(可观测)。 */
    const badInj = loadIIFE(breakOnce(RG_SRC, ANCHORS.kInject, String.raw`const injectable = (cdUnjudged === 0) ? open.slice() : [];`, 'kInject'), 'LonShaReturnGate');
    const noNow = badInj.build(T_CANDS, { now: 10 });
    if (noNow.injectable.length === 0) throw new Error('kInject:破坏后「只给提示也产注入面」未现形(负控制空转)');
    if (noNow.policy !== 'hint-only') throw new Error('kInject:夹具前提不成立(策略应 hint-only)');
    judgePolicies(RG);
    console.log('  ok 破坏关停档 ⇒ off 不再 blocked 被照出;破坏注入面闸 ⇒ 未判也进注入面被照出;原版阳性通过');
});
test('v3445 D6. ★★ 破坏宿主「候选装配」⇒ 宿主三态不塌判据 C1 必须转红', () => {
    /* ★ 破坏形态:退回「只认数组」的旧写法 ⇒ 显式喂的**畸形**候选又落回 fated-recall,
     *   与「根本没给」同形(这正是本版修掉的那一格)。 */
    const badIdx = breakOnce(IDX, ANCHORS.hCands, String.raw`if (Array.isArray(o.candidates)) return { candidates: o.candidates, source: 'given' };`, 'hCands');
    expectRed(() => {
        const self = rgSelf(RG_WIN(), badIdx);
        const r = self.returnGate({ candidates: 'nope', now: 10 });
        if (r.candidateSource === 'given') throw new Error('畸形候选被当成合法候选');
        if (r.ok !== true || r.reason !== 'malformed') throw new Error('★ 三态塌了:畸形候选落回 ' + r.candidateSource + ' 而不是原样透传给内核');
    }, 'hCands');
    judgeHostRead(IDX);
    console.log('  ok 破坏候选装配(退回只认数组)⇒ 畸形候选与「没给」同形被照出;原版阳性通过');
});
test('v3445 D7. ★★ 破坏宿主「移交面」⇒ 移交只给开闸者判据 C3 必须转红', () => {
    const badIdx = breakOnce(IDX, ANCHORS.hAdmit, String.raw`const adm = Array.isArray(read.gates) ? read.gates : [];`, 'hAdmit');
    expectRed(() => judgeAdmit(badIdx), 'hAdmit');
    judgeAdmit(IDX);
    console.log('  ok 破坏移交面 ⇒ 押后/不出条目漏进移交面被照出;原版阳性通过');
});
test('v3445 D8. ★★★ 破坏器官「持久化面」⇒ 跨会话携带判据 A3 必须转红', () => {
    const badOrg = breakOnce(ORG_SRC, ANCHORS.kPersist, String.raw`            returnGate: null,`, 'kPersist');
    const badMO = loadOrgans(badOrg);
    expectRed(() => judgePersist(badMO), 'kPersist');
    judgePersist(MO);
    console.log('  ok 破坏 export 面 ⇒ 状态存盘即丢被照出(★「跨会话携带」不得是假声明);原版阳性通过');
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3445 F1. ** H5 判据纯度:破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次(应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过)');
    }
    for (const k of ['kCooldown', 'kDefault', 'kRepeat', 'kNever', 'kInject', 'kOff']) {
        const n = RG_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 return-gate.js 命中 ' + n + ' 次(应恰 1)');
    }
    for (const k of ['hCands', 'hAdmit']) {
        const n = IDX.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '宿主锚 ' + k + ' 在 index.js 命中 ' + n + ' 次(应恰 1)');
    }
    const np = ORG_SRC.split(ANCHORS.kPersist).length - 1;
    assert.equal(np, 1, '器官锚 kPersist 在 memory-organs.js 命中 ' + np + ' 次(应恰 1)');
    console.log('  ok 八个锚点在本档各 1 次、在真源各 1 次');
});
test('v3445 F2. ** H6 两向自证:锚点不存在 / 不唯一时 breakOnce 必须拒绝', () => {
    assert.throws(() => breakOnce('abc', 'zzz', 'x'), /锚点命中|拒绝破坏/);
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/);
    console.log('  ok 0 次 / 多次 锚点均被 breakOnce 拒绝');
});
test('v3445 G1. ★★ 版本面:六源同源 + 本档出生锚 BORN_V(下界,不锁当版)', () => {
    /* 逐字硬等号是**本档出生那一版的一次性事实**,不是永久不变量;
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
    assert.ok(vnum(BORN_V) > vnum('3.344.0'), '版本序须前进');
});