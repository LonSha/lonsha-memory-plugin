/* ============================================================
 * tests/v3400_m4x4_qa_thread.test.mjs — v3.340.0 · M4-X4
 * 带消歧与条件继承的多轮记忆问答（对话状态 + 消歧 + 条件继承）
 *
 * 【本档要证明的四件事（不是「函数返回了对象」）】
 *   a) **条件真继承**：代词「她」在**唯一**已确认主体下继承上一轮主体；
 *      主体 / 时点下界 / 分支 / 比较轴 逐条可读到「沿用了哪个轴」；
 *   b) **消歧不静默**：两个及以上主体遇到代词 ⇒ 状态转 `awaiting-disambig`、
 *      列出候选、**不产确定结论**（宿主据此**不跑查询**）；点选后接回；
 *   c) **身份不越界**：会话 / 分支身份变了 ⇒ 作废重建并具名，不跨会话暗中继承；
 *   d) **宿主真落笔**：`askMemoryQuestionFollowUp` 把继承的约束并进每条计划的 spec
 *      （只并既有 FILTERS 键），走**同一个** query / composeAnswer；awaiting 时不落查询。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。判据纯度（H5）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const EQ_SRC = read('evidence-query.js');
const QT_SRC = read('qa-thread.js');
const EQT_SRC = read('engine-qa-tools.js');
const PERSIST_SRC = read('engine-persistence-ops.js');
const NL = '\n';
const ALL_HOST_SRC = IDX + NL + PERSIST_SRC + NL + EQT_SRC;
const SELF = read(path.join('tests', 'v3400_m4x4_qa_thread.test.mjs'));
const BORN_V = '3.340.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
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
const EQ = loadIIFE(EQ_SRC, 'LonShaEvidenceQuery');
const QT = loadIIFE(QT_SRC, 'LonShaQaThread');
const WB = require_(path.join(R, 'evidence-workbench.js'));
const CL = require_(path.join(R, 'commitment-ledger.js'));
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════ */
const ANCHORS = Object.freeze({
    /* 内核·待决态：置掉 awaited 分支 ⇒ 状态不再转 awaiting-disambig（实测红：消歧未进待决态）。 */
    kAwaitState: String.raw`state: awaiting ? 'awaiting-disambig' : (subjects.length ? 'open' : 'idle'),`,
    /* 内核·唯一主体继承：把 `=== 1` 改成 `=== 0` ⇒ 单主体下代词不继承（实测红：代词未继承唯一主体）。 */
    kSingleSubject: String.raw`if (prevSubjects.length === 1) {`,
    /* 内核·身份对账：条件置假 ⇒ 换会话不再作废（实测红：跨会话暗中继承）。 */
    kIdentityCheck: String.raw`if (chatChanged || branchChanged) {`,
    /* 宿主·spec 合并：只留 plan 原 spec ⇒ 继承条件不落查询（实测红：继承的主体没进 spec）。 */
    hSpecMerge: String.raw`const spec = Object.assign({}, p.spec, ts.spec);`,
    /* 宿主·待决闸：置假 ⇒ awaiting 时仍跑查询（实测红：待决时产出了确定结论）。 */
    hAwaitGate: String.raw`if (adv.awaiting === true) {`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    '_qaThreadState() {',
    'askMemoryQuestionFollowUp(question, opts) {',
    'qaThreadResolve(picks, opts) {',
    'qaThread() {',
];
function judgeStruct(hostSrc, mf) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = hostSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次（应恰 1）');
    }
    if (hostSrc.indexOf('function _qaThreadLib() {') < 0) bad.push('缺取库口 _qaThreadLib');
    for (const k of ['qaThread:', '_qaThread = data.qaThread', "'qaThread',"]) {
        if (hostSrc.indexOf(k) < 0) bad.push('持久化 / 契约面缺 ' + k);
    }
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('qa-thread.js') < 0) bad.push('manifest.extra_js 缺 qa-thread.js');
    return bad;
}
test('v3400 A1. **** 宿主四面各恰一处 + 取库口 + 持久化/契约面在位 + extra_js 登记', () => {
    assert.deepEqual(judgeStruct(ALL_HOST_SRC, MF), [], judgeStruct(ALL_HOST_SRC, MF).join('；'));
    /* [v3.343.0 交棒] 原文是逐字硬等号(`=== 107`)—— 那是本档出生那一版的一次性事实,
     *   不是永久不变量;抬版即红,而红的信息量只剩「数字不对」(与 v3264/v3266/v3296/v3298/v3300 同族坑,均已交棒)。
     *   改按下界口径:本档只守「自己那一项仍在且不少于出生值」,「当版总项数恰一处」由**当版 frontier 套件**把守(v3209 的数量锁)。 */
    assert.ok(MF.extra_js.length >= 107, 'extra_js 不得低于本档出生值 107(实 ' + MF.extra_js.length + ')');
    console.log('  ok 四面各恰 1 次 / 取库口 / 契约与还原面 / extra_js ≥ 107');
});
function judgeKernel(qt) {
    const bad = [];
    if (qt.QT_VERSION !== 1) bad.push('QT_VERSION 应 1，实 ' + qt.QT_VERSION);
    if (!Array.isArray(qt.QT_STATES) || qt.QT_STATES.indexOf('awaiting-disambig') < 0) bad.push('QT_STATES 缺 awaiting-disambig');
    for (const f of ['advanceThread', 'openThread', 'resolveAmbiguity', 'threadSpec', 'threadLine', 'marksOf', 'atFloorOf']) {
        if (typeof qt[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    const d = qt.describe({});
    if (d.version !== 1 || d.writesNothing !== true) bad.push('describe 版本/只读标记不对');
    const sc = qt.selfCheck({ state: 'awaiting-disambig', candidates: ['a', 'b'] });
    if (sc.ok !== true) bad.push('selfCheck 对合法待决态报红：' + JSON.stringify(sc.bad));
    const sc2 = qt.selfCheck({ state: 'awaiting-disambig', candidates: ['a'] });
    if (sc2.ok !== false) bad.push('selfCheck 未守住「待决必须有可选项」不变式');
    return bad;
}
test('v3400 A2. **** 内核面：版本 + 四态（含 awaiting-disambig）+ 六原语 + 自述/自证不变式', () => {
    assert.deepEqual(judgeKernel(QT), [], judgeKernel(QT).join('；'));
    console.log('  ok QT_VERSION 1 / 四态 / advanceThread·openThread·resolveAmbiguity·threadSpec·threadLine / 自证守不变式');
});
/* ══════════════ B. 真跑（内核，纯函数） ══════════════ */
const P1 = { actors: ['苏晴'], plans: [{ id: 'promise', spec: { text: '' } }], intents: ['promise'], gaps: [] };
function judgeInherit(qt) {
    const o1 = qt.openThread('苏晴答应了什么？', P1, { chatKey: 'c1' });
    const o2 = qt.advanceThread(o1.thread, { actors: [], plans: [{ id: 'later' }] }, { question: '她后来呢', chatKey: 'c1' });
    if (o2.thread.state !== 'open') throw new Error('唯一主体下代词追问应留在 open，实 ' + o2.thread.state);
    if (o2.thread.subjects.join(',') !== '苏晴') throw new Error('代词未继承唯一主体（实 ' + o2.thread.subjects.join(',') + '）');
    if (!o2.inherit.some((x) => x.axis === 'subject')) throw new Error('inherit 未逐条报出继承的轴');
    if (o2.awaiting !== false) throw new Error('唯一主体下不应进消歧');
    if (o2.thread.turn !== 2) throw new Error('轮次未推进（实 ' + o2.thread.turn + '）');
}
test('v3400 B1. ** 条件继承：代词「她」在唯一已确认主体下继承（inherit 逐条可读）', () => judgeInherit(QT) === undefined && console.log('  ok 唯一主体继承 / inherit[subject] / turn=2'));
function judgeDisambig(qt) {
    const o1 = qt.openThread('苏晴答应了什么？', P1, { chatKey: 'c1' });
    const o2 = qt.advanceThread(o1.thread, { actors: ['苏晴', '林一'], plans: [] }, { question: '苏晴和林一怎么认识的', chatKey: 'c1' });
    if (o2.thread.subjects.length !== 2) throw new Error('两名显式人名未同时进主体');
    const o3 = qt.advanceThread(o2.thread, { actors: [], plans: [] }, { question: '她后来呢', chatKey: 'c1' });
    if (o3.awaiting !== true) throw new Error('多主体下代词应进消歧（不猜）');
    if (o3.thread.state !== 'awaiting-disambig') throw new Error('状态未转 awaiting-disambig，实 ' + o3.thread.state);
    if (o3.thread.candidates.length !== 2) throw new Error('候选未列出（实 ' + o3.thread.candidates.length + '）');
    if (!o3.gaps.some((g) => g.kind === 'ambiguous-subject')) throw new Error('消歧缺口未具名');
    const o4 = qt.resolveAmbiguity(o3.thread, ['林一']);
    if (o4.resolved !== true) throw new Error('点选候选应 resolved');
    if (o4.thread.subjects.join(',') !== '林一' || o4.thread.state !== 'open') throw new Error('点选未接回主体');
    const o5 = qt.resolveAmbiguity(o3.thread, ['查无此人']);
    if (o5.resolved !== false) throw new Error('点选非法候选不应 resolved（不产确定结论）');
}
test('v3400 B2. ** 消歧不静默：多主体遇代词 ⇒ awaiting-disambig + 候选 + 点选接回', () => judgeDisambig(QT) === undefined && console.log('  ok awaiting-disambig / 候选 2 / 点选接回 / 非法点选不解'));
function judgeSwitchBranch(qt) {
    const o1 = qt.openThread('苏晴答应了什么？', P1, { chatKey: 'c1' });
    const o2 = qt.advanceThread(o1.thread, { actors: ['林一'] }, { question: '换个人，林一呢', chatKey: 'c1' });
    if (o2.thread.subjects.join(',') !== '林一') throw new Error('换人未替换主体（实 ' + o2.thread.subjects.join(',') + '）');
    if (!o2.marks.includes('switch')) throw new Error('换人标记未认出');
    /* 切分支：无 branchKey ⇒ 保留并具名；有 ⇒ 更新。 */
    const o3 = qt.advanceThread(o2.thread, { actors: [] }, { question: '另一个结局呢', chatKey: 'c1' });
    if (!o3.gaps.some((g) => g.kind === 'branch-key-absent')) throw new Error('切分支缺 branchKey 未具名');
    const o4 = qt.advanceThread(o3.thread, { actors: [] }, { question: '走另一条线呢', chatKey: 'c1', branchKey: 'B' });
    if (o4.thread.branchKey !== 'B') throw new Error('branchKey 未更新（实 ' + o4.thread.branchKey + '）');
}
test('v3400 B3. ** 换人替换主体不残留 / 切分支缺键具名且不擅立', () => judgeSwitchBranch(QT) === undefined && console.log('  ok switch 替换 / branch 缺键具名 / 给键则更新'));
function judgeAtPoint(qt) {
    const o1 = qt.openThread('苏晴答应了什么？', P1, { chatKey: 'c1' });
    /* 有锚：折算成楼层下界。 */
    const o2 = qt.advanceThread(o1.thread, { actors: [] }, { question: '回到第10楼，她当时说了什么', chatKey: 'c1' });
    if (o2.thread.atFloor !== 10) throw new Error('「第10楼」未折算成时点下界（实 ' + o2.thread.atFloor + '）');
    /* 无锚且此前无时点：不折算，具名。 */
    const o3 = qt.advanceThread(o1.thread, { actors: [] }, { question: '那时候她说了什么', chatKey: 'c1' });
    if (o3.thread.atFloor !== null) throw new Error('无锚不应猜出楼层（实 ' + o3.thread.atFloor + '）');
    if (!o3.gaps.some((g) => g.kind === 'at-hint-unresolved')) throw new Error('无锚时点未具名');
    /* 无锚但上一轮已定下时点 ⇒ 继承（不新猜）。 */
    const o4 = qt.advanceThread(o2.thread, { actors: [] }, { question: '那时候呢', chatKey: 'c1' });
    if (o4.thread.atFloor !== 10) throw new Error('无锚应继承已定时点（实 ' + o4.thread.atFloor + '）');
    /* threadSpec 只含既有 FILTERS 键。 */
    const ts = qt.threadSpec(o4.thread);
    const keys = Object.keys(ts.spec);
    if (!keys.every((k) => ['actors', 'floorFrom'].includes(k))) throw new Error('threadSpec 造出自有键：' + keys.join(','));
}
test('v3400 B4. ** 时点：有锚折算 / 无锚不猜且具名 / 无锚继承已定 / spec 只含既有键', () => judgeAtPoint(QT) === undefined && console.log('  ok atFloor 折算 / 不猜 / 继承 / spec ⊆ FILTERS'));
function judgeIdentity(qt) {
    const o1 = qt.openThread('苏晴答应了什么？', P1, { chatKey: 'c1' });
    const o2 = qt.advanceThread(o1.thread, { actors: [] }, { question: '她后来呢', chatKey: 'c2' });
    if (o2.why !== 'thread-identity-changed') throw new Error('换会话未作废重建（why=' + o2.why + '）');
    if (o2.thread.chatKey !== 'c2') throw new Error('重建后 chatKey 未更新');
    if (!o2.gaps.some((g) => g.kind === 'thread-identity-changed')) throw new Error('身份变更未具名');
    /* 同分支身份不变 ⇒ 不作废（避免把正常追问判成越界）。 */
    const o3 = qt.advanceThread(o1.thread, { actors: [] }, { question: '她后来呢', chatKey: 'c1' });
    if (o3.why !== 'advanced') throw new Error('同会话追问不应作废（why=' + o3.why + '）');
}
test('v3400 B5. ** 身份不越界：换会话作废重建并具名 / 同会话正常推进', () => judgeIdentity(QT) === undefined && console.log('  ok chatKey 变更 ⇒ thread-identity-changed / 同会话照常'));
/* ══════════════ C. 宿主出口（真方法体 + 真内核 + 真账本） ══════════════ */
/** 从 engine-qa-tools.js 提取方法体，转回类方法格式（engine.→this.）。 */
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
    'function _evidenceQueryLib() {',
    'function _qaThreadLib() {',
    'function _evidenceWorkbenchLib() {',
    'function _evidenceQueryLedgersOf() {',
    'function _ledgerApis() {',
    'function _factVersionLib() {',
    'function _eventCompletenessLib() {',
    'function _repairLoopLib() {',
];
const METH_FNS = [
    '_qaActorAliases() {',
    '_qaKnownActors(limit) {',
    '_qaThreadState() {',
    'askMemoryQuestionFollowUp(question, opts) {',
    'qaThreadResolve(picks, opts) {',
    'qaThread() {',
];
function mkHost(win, src, eqtSrc) {
    const idx = src || IDX;
    const eqt = eqtSrc || EQT_SRC;
    const libs = LIB_FNS.map((h) => sliceMember(idx, h));
    const meths = [
        extractModuleMethod(eqt, 'function _qaActorAliases(engine) {'),
        extractModuleMethod(eqt, 'function _qaKnownActors(engine, limit) {'),
        extractModuleMethod(eqt, 'function _qaThreadState(engine) {'),
        extractModuleMethod(eqt, 'function askMemoryQuestionFollowUp(engine, question, opts) {'),
        extractModuleMethod(eqt, 'function qaThreadResolve(engine, picks, opts) {'),
        extractModuleMethod(eqt, 'function qaThread(engine) {'),
        extractModuleMethod(eqt, 'function askMemoryQuestion(engine, question, opts) {')
    ];
    const miss = LIB_FNS.filter((h, i) => !libs[i]);
    if (miss.length || meths.some((x) => !x)) throw new Error('切片缺失：' + miss.join(' / '));
    const code = libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });';
    return new Function('errLog', 'window', code)(() => {}, win);
}
/** 夹具：真账本造的宿主状态（两条约定，一条已履行）。 */
function qaHostState() {
    let cs = CL.normalize(undefined);
    cs = CL.open(cs, { actor: '苏晴', counterpart: '林一', content: '答应周三还书', floor: 3, eventKey: 'e1' }).state;
    cs = CL.open(cs, { actor: '苏晴', counterpart: '林一', content: '答应带的伞', floor: 9, eventKey: 'e2' }).state;
    cs = CL.fulfill(cs, { actor: '苏晴', content: '答应带的伞', floor: 12, eventKey: 'e3' }).state;
    return { worldProg: { commitmentLedger: cs } };
}
const QA_WIN = () => ({ LonShaEvidenceQuery: EQ, LonShaQaThread: QT, LonShaEvidenceWorkbench: WB, LonShaCommitmentLedger: CL });
function qaSelf(win, src, chatId, eqtSrc) {
    const eng = mkHost(win, src, eqtSrc);
    return Object.assign({}, eng, {
        getCurrentChatId: () => (chatId === undefined ? 'chat-1' : chatId),
        _entityIdByName: new Map([['林一', 'ent_lin'], ['王五', 'ent_wang']]),
        graph: { nodes: new Map([['n1', { type: 'character', name: '苏晴' }]]) },
        worldProg: qaHostState().worldProg,
        _lastInjection: 'SENTINEL'
    });
}
function judgeHostInherit(src, eqtSrc) {
    const self = qaSelf(QA_WIN(), src, undefined, eqtSrc);
    const r1 = self.askMemoryQuestionFollowUp('苏晴答应了什么？', {});
    if (r1.followUp !== true || r1.turn !== 1) throw new Error('首轮追问未建档（turn=' + r1.turn + '）');
    const r2 = self.askMemoryQuestionFollowUp('她后来呢', {});
    if (r2.turn !== 2) throw new Error('第二轮未推进（turn=' + r2.turn + '）');
    if (!r2.inherit.some((x) => x.axis === 'subject')) throw new Error('inherit 未报出继承的轴');
    /* 继承的主体必须**真的进 spec**（只看 inherit 字段不足以证明落进查询）。 */
    const hit = r2.plans.some((p) => Array.isArray(p.spec.actors) && p.spec.actors.includes('苏晴'));
    if (!hit) throw new Error('继承的主体没进任何计划的 spec：' + JSON.stringify(r2.plans.map((p) => p.spec)));
    if (self._lastInjection !== 'SENTINEL') throw new Error('追问跑了真查询却动了注入面（出口只读）');
    return r2;
}
test('v3400 C1. *** 宿主继承：代词追问继承主体并**并进 spec**（走同一个 query/composeAnswer）', () => {
    judgeHostInherit(IDX);
    console.log('  ok turn 1→2 / inherit[subject] / spec.actors 含继承主体 / 未动注入面');
});
function judgeHostAwait(src, eqtSrc) {
    const self = qaSelf(QA_WIN(), src, undefined, eqtSrc);
    self.askMemoryQuestionFollowUp('苏晴和林一怎么回事', {});
    const r = self.askMemoryQuestionFollowUp('她后来呢', {});
    if (r.awaiting !== true) throw new Error('多主体代词未进待决');
    if (r.accepted !== false) throw new Error('待决时 accepted 应为 false（不产确定结论）');
    if (r.plans.length !== 0) throw new Error('待决时**不应跑查询**（plans 应为空，实 ' + r.plans.length + '）');
    if (r.answer.length !== 0) throw new Error('待决时不应有答案句');
    if (r.candidates.length !== 2) throw new Error('待决候选未外送（实 ' + r.candidates.length + '）');
    /* 点选接回后，下一轮能正常查出（主体落 spec）。 */
    const r2 = self.qaThreadResolve(['林一'], {});
    if (r2.resolved !== true) throw new Error('点选出口未接回');
    const r3 = self.askMemoryQuestionFollowUp('她后来呢', {});
    if (r3.awaiting !== false) throw new Error('点选后仍待决');
    const hit = r3.plans.some((p) => Array.isArray(p.spec.actors) && p.spec.actors.includes('林一'));
    if (!hit) throw new Error('点选后的主体没进 spec');
    return r;
}
test('v3400 C2. *** 宿主待决闸：awaiting 时不跑查询 + 候选外送 + 点选接回后生效', () => {
    judgeHostAwait(IDX);
    console.log('  ok awaiting ⇒ plans 0 / candidates 2 / 点选后主体落 spec');
});
function judgeHostIdentity(src, eqtSrc) {
    const self = qaSelf(QA_WIN(), src, 'chat-1', eqtSrc);
    self.askMemoryQuestionFollowUp('苏晴答应了什么？', {});
    /* 会话身份变化：宿主 getCurrentChatId 变 ⇒ 内核作废重建。 */
    const self2 = Object.assign({}, self, { getCurrentChatId: () => 'chat-2' });
    const r = self2.askMemoryQuestionFollowUp('她后来呢', {});
    if (!r.gaps.some((g) => g.kind === 'thread-identity-changed')) throw new Error('换会话未作废（缺口未具名）');
    if (r.turn !== 1) throw new Error('换会话后应重建为新 thread（turn 应 1，实 ' + r.turn + '）');
}
test('v3400 C3. ** 宿主身份：会话变更 ⇒ 作废重建（不跨会话暗中继承）', () => judgeHostIdentity(IDX) === undefined && console.log('  ok 换会话 ⇒ thread-identity-changed / turn 归 1'));
function judgeHostReadout(src, eqtSrc) {
    const self = qaSelf(QA_WIN(), src, undefined, eqtSrc);
    const t = self.qaThread();
    if (t.turn !== 0 || t.state !== 'idle') throw new Error('未追问时读数应为 idle/0');
    self.askMemoryQuestionFollowUp('苏晴答应了什么？', {});
    const t2 = self.qaThread();
    if (t2.turn !== 1 || t2.subjects.join(',') !== '苏晴') throw new Error('读数未反映 thread（实 ' + JSON.stringify(t2) + '）');
    const line = QT.threadLine({ thread: t2, inherit: [], condition: [] });
    if (!/追问 第1轮/.test(line)) throw new Error('诊断行未报轮次：' + line);
    /* 未追问的三态之一：threadLine 对空 thread 说「未开始」。 */
    if (!/未开始/.test(QT.threadLine({ thread: null }))) throw new Error('空 thread 诊断行未说「未开始」');
}
test('v3400 C4. ** 宿主读数与诊断行：idle 待用 / 有 thread 报轮次与主体 / 空 thread 说未开始', () => judgeHostReadout(IDX) === undefined && console.log('  ok qaThread 只读读数 / threadLine 三态'));
/* ══════════════ D. 负控制（真源码破坏 → 副本重跑同款判据 → 必须现形） ══════════════ */
function expectRed(fn, label) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = String(e && e.message || e); }
    if (!threw) throw new Error(label + '：破坏后判据未转红（负控制空转）');
    return msg;
}
test('v3400 D1. ★★ 破坏「待决态判定」⇒ 消歧判据 B2 必须转红', () => {
    const bad = loadIIFE(breakOnce(QT_SRC, ANCHORS.kAwaitState, String.raw`state: (subjects.length ? 'open' : 'idle'),`, 'kAwaitState'), 'LonShaQaThread');
    expectRed(() => judgeDisambig(bad), 'kAwaitState');
    judgeDisambig(QT); // 反向对照：原版同判据必须过
    console.log('  ok 破坏待决态 ⇒ 转红；原版阳性通过');
});
test('v3400 D2. ★★ 破坏「唯一主体继承」⇒ 条件继承判据 B1 必须转红', () => {
    const bad = loadIIFE(breakOnce(QT_SRC, ANCHORS.kSingleSubject, String.raw`if (prevSubjects.length === 0) {`, 'kSingleSubject'), 'LonShaQaThread');
    expectRed(() => judgeInherit(bad), 'kSingleSubject');
    judgeInherit(QT);
    console.log('  ok 破坏单主体继承 ⇒ 转红；原版阳性通过');
});
test('v3400 D3. ★★ 破坏「身份对账」⇒ 不越界判据 B5 必须转红', () => {
    const bad = loadIIFE(breakOnce(QT_SRC, ANCHORS.kIdentityCheck, String.raw`if (false) {`, 'kIdentityCheck'), 'LonShaQaThread');
    expectRed(() => judgeIdentity(bad), 'kIdentityCheck');
    judgeIdentity(QT);
    console.log('  ok 破坏身份对账 ⇒ 跨会话暗中继承被照出；原版阳性通过');
});
test('v3400 D4. ★★ 破坏宿主「spec 合并」⇒ 宿主继承判据 C1 必须转红', () => {
    const bad = breakOnce(EQT_SRC, ANCHORS.hSpecMerge, String.raw`const spec = Object.assign({}, p.spec);`, 'hSpecMerge');
    expectRed(() => judgeHostInherit(IDX, bad), 'hSpecMerge');
    judgeHostInherit(IDX);
    console.log('  ok 破坏 spec 合并 ⇒ 继承条件不落查询被照出；原版阳性通过');
});
test('v3400 D5. ★★ 破坏宿主「待决闸」⇒ 宿主待决判据 C2 必须转红', () => {
    const bad = breakOnce(EQT_SRC, ANCHORS.hAwaitGate, String.raw`if (false) {`, 'hAwaitGate');
    expectRed(() => judgeHostAwait(IDX, bad), 'hAwaitGate');
    judgeHostAwait(IDX);
    console.log('  ok 破坏待决闸 ⇒ 待决时仍跑查询被照出；原版阳性通过');
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3400 F1. ** H5 判据纯度：破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次（应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过）');
    }
    /* 真源上各恰中 1 次（H6 两向自证之一：不唯一即应拒绝破坏）。 */
    for (const k of ['kAwaitState', 'kSingleSubject', 'kIdentityCheck']) {
        const n = QT_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 qa-thread.js 命中 ' + n + ' 次（应恰 1）');
    }
    for (const k of ['hSpecMerge', 'hAwaitGate']) {
        const n = EQT_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '宿主锚 ' + k + ' 在 engine-qa-tools.js 命中 ' + n + ' 次（应恰 1）');
    }
    console.log('  ok 五个锚点在本档各 1 次、在真源各 1 次');
});
test('v3400 F2. ** H6 两向自证：锚点不存在 / 不唯一时 breakOnce 必须拒绝', () => {
    assert.throws(() => breakOnce('abc', 'zzz', 'x'), /锚点命中|拒绝破坏/);
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/);
    console.log('  ok 0 次 / 多次 锚点均被 breakOnce 拒绝');
});
test('v3400 G1. ★★ 版本面：六源同源 + 本档出生锚 BORN_V（下界，不锁当版）', () => {
    /* [v3.341.0 交棒] 原文是逐字硬等号（`const VERSION = '3.340.0'` + MF/PKG === BORN_V）——
     *   与 v3264 C / v3266 C / v3232 C1 / v3315 踩过的是**同一族坑**：那是本档出生那一版的一次性事实，
     *   不是永久不变量；抬版即红，而红的信息量只剩「数字不对」。
     *   改按版本守卫 V2 的修法（「三源互等 + vnum(v) >= vnum(该测试自己的出生版本)，不要写死当前版本」）：
     *   本档只守「六源**逐字同源**」与「不低于本档出生版本」；「当版锚点恰一处」由**当版 frontier 套件**把守
     *   （V4 口径：锚必须住在当版档案里，历史文件锁当版反而会被 V2 抓）。 */
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), '宿主版本不得低于本档出生版本（实 ' + idxV + '）');
    assert.equal(MF.version, idxV, 'manifest.json 未与宿主同源');
    assert.equal(PKG.version, idxV, 'package.json 未与宿主同源');
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const s = read(rel);
        assert.match(s, new RegExp(String.raw`let VERSION = '${idxV}'`), rel + ' 未同源');
    }
    assert.ok(vnum(BORN_V) > vnum('3.339.0'), '版本序须前进');
    console.log('  ok 六源逐字同源（' + idxV + '）/ 出生锚 v' + BORN_V + ' / 版本序前进');
});