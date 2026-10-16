/* ============================================================
 * tests/v3380_m4o8_center_actions.test.mjs — v3.338.0 · M4-O8
 * 记忆控制中心**处置类动作的生产方落地**（面板 9 handler + 宿主真源出口）
 *
 * 【本档要证明的四件事（不是「函数返回了对象」）】
 *   a) **保存区零同步缺陷已闭合**：面板「保存的查询条件」此前读的是 `state.saved`，
 *      而保存的真源在宿主 `_evidenceSavedQueries` —— 两者零同步 ⇒ 面板保存区**永远空**
 *      （保存了却看不到、看不到却删不掉）。落点：`_memoryCenterStateWithSaved` 在
 *      `memoryCenterView` / `memoryCenterStep` 两处装配点把宿主真源并进界面状态。
 *   b) **处置动作真走宿主真源**：撤回走 fact-version 的 `revokeFact`（不碰 journal ——
 *      伪造 journal 会把「撤销这一批」的真流水覆盖掉）、保存走 `_evidenceSavedQueries`、
 *      删除走 `removeEvidenceQuery`。面板**不再手写 state**（第二张表已清零）。
 *   c) **拿不到就如实报不可用**：`row.dispute` 在事实账上**没有写面**（`disputed` 是
 *      `fact-state.js` 的推导态）⇒ 面板如实报不可用，不编一个假写入。
 *   d) **未圈范围不落笔**：`correctionSourceFacts` 对未圈定 / 颠倒 / 端点读不到的范围
 *      一律 `ok:false` + 具名 reason，**绝不退回全量**（「没圈范围」不等于「全选」）。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。工具两向自证由 `_break_kit` 提供，判据纯度
 *   （H5：三锚点在本档各只声明一次）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const ok = (m) => console.log('  ok ' + m);
const IDX = read('index.js');
const UI = read('settings-ui.js');
const SELF = read(path.join('tests', 'v3380_m4o8_center_actions.test.mjs'));
const C = require_(path.join(R, 'memory-center.js'));
const Q = require_(path.join(R, 'evidence-query.js'));
const CP = require_(path.join(R, 'correction-plan.js'));
const FV = require_(path.join(R, 'fact-version.js'));
const W = require_(path.join(R, 'evidence-workbench.js'));
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {',
    'function _factVersionLib() {',
    'function _correctionPlanLib() {',
    'function _evidenceQueryLib() {',
    'function _memoryCenterLib() {',
    'function _evidenceQueryLedgersOf() {',
    'function _ledgerApis() {',
    'function _evidenceWorkbenchLib() {',
    'function _eventCompletenessLib() {',
    'function _repairLoopLib() {'
];
const HOST_METHODS = [
    'memoryCenterRevoke(id, note) {',
    'memoryCenterSaveQuery(state) {',
    '_memoryCenterStateWithSaved(state) {',
    'correctionSourceFacts(range) {',
    'correctionReextractFacts(opts = {}) {',
    'evidenceSavedQueries() {',
    'saveEvidenceQuery(label, spec) {',
    'removeEvidenceQuery(replayKey) {',
    'replayEvidenceQuery(replayKey, opts) {',
    'memoryCenterDeps() {',
    '_memoryCenterAbsent(state, reason) {',
    'memoryCenterView(state, opts) {',
    'memoryCenterStep(state, action, payload, opts) {',
    'memoryCenterSourceText(ref) {'
];
function methodBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const close = src.indexOf(')', at);
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function libWindow() {
    return { LonShaEvidenceQuery: Q, LonShaCorrectionPlan: CP, LonShaFactVersion: FV, LonShaEvidenceWorkbench: W, LonShaMemoryCenter: C };
}
function engineFrom(src, win) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h));
    const missL = LIB_FNS.filter((h, i) => !libs[i]);
    const meths = HOST_METHODS.map((h) => methodBody(src, h));
    const missM = HOST_METHODS.filter((h, i) => !meths[i]);
    if (missL.length || missM.length) throw new Error('切片缺失：取库口[' + missL.join('/') + '] 出口[' + missM.join('/') + ']');
    const code = libs.join(J) + J + 'return ({ ' + meths.join(',' + J) + ' });';
    return new Function('errLog', 'window', code)(() => {}, win || libWindow());
}
function judgeA1(src) {
    const bad = [];
    const heads = [
        'memoryCenterRevoke(id, note) {', 'memoryCenterSaveQuery(state) {', '_memoryCenterStateWithSaved(state) {',
        'correctionSourceFacts(range) {', 'correctionReextractFacts(opts = {}) {',
        '_correctionOwners() {', 'applyCorrectionPlan(opts = {}) {', 'undoCorrection(opts = {}) {', '_verifyCorrectionItem(kind, item) {'
    ];
    for (const h of heads) {
        const n = src.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次（应恰 1）');
    }
    return bad;
}
function judgeA2(uiSrc) {
    const bad = [];
    const ids = ['row.repair.preview', 'row.detail', 'row.revoke', 'row.dispute', 'row.export',
        'query.save', 'query.reset', 'saved.remove', 'saved.replay'];
    for (const id of ids) {
        const n = uiSrc.split("_memoryCenterHandlers['" + id + "']").length - 1;
        if (n !== 1) bad.push("handler '" + id + "' 命中 " + n + ' 次（应恰 1）');
    }
    if (uiSrc.includes("'undo:fact:manual'")) bad.push('旧伪造 journal token 仍在');
    if (uiSrc.includes('st.spec = hit.spec;')) bad.push('旧手写 spec 仍在（绕过内核 load-saved）');
    if (uiSrc.includes('this._memoryCenterSaved = b;')) bad.push('旧第二张表 _memoryCenterSaved 仍在');
    return bad;
}
function judgeA3(Cx, uiSrc) {
    const declared = (Cx.ACTIONS || []).map((a) => a.id).sort();
    const provided = [];
    for (const a of Cx.ACTIONS || []) {
        if (uiSrc.includes("_memoryCenterHandlers['" + a.id + "']")) provided.push(a.id);
    }
    provided.sort();
    if (JSON.stringify(declared) !== JSON.stringify(provided)) {
        return ['声明面 ' + declared.join('/') + ' != 面板提供面 ' + provided.join('/')];
    }
    if (declared.length !== 9) return ['动作声明数 ' + declared.length + '（应 9）'];
    return [];
}
function judgeSave(idxSrc) {
    const eng = engineFrom(idxSrc);
    const st = C.blankState();
    const r1 = eng.memoryCenterSaveQuery(st);
    if (!r1 || r1.ok !== true) return ['首存失败：' + ((r1 && r1.reason) || 'unknown')];
    if (eng.evidenceSavedQueries().length !== 1) return ['首存后真源条数 ' + eng.evidenceSavedQueries().length + '（应 1）'];
    if (!r1.replayKey) return ['未返回 replayKey'];
    const r2 = eng.memoryCenterSaveQuery(st);
    if (!r2 || r2.ok !== true || r2.replaced !== true) return ['同条件应覆盖（replaced=true）'];
    if (eng.evidenceSavedQueries().length !== 1) return ['覆盖后真源条数 ' + eng.evidenceSavedQueries().length + '（应 1）'];
    return [];
}
function judgeSavedSync(idxSrc) {
    const eng = engineFrom(idxSrc);
    eng.memoryCenterSaveQuery(C.blankState());
    const caller = { page: 7, saved: ['STALE'] };
    const st = eng._memoryCenterStateWithSaved(caller);
    if (st === caller) return ['必须返回新对象（不得原地改调用方）'];
    if (!Array.isArray(caller.saved) || caller.saved[0] !== 'STALE') return ['调用方对象被反写'];
    if (st.page !== 7) return ['浅拷贝丢了原有键'];
    const src = eng.evidenceSavedQueries();
    if (!Array.isArray(st.saved) || st.saved.length !== src.length || st.saved.length !== 1) {
        return ['saved 未与真源同步（面板读到 ' + (st.saved || []).length + '，真源 ' + src.length + '）'];
    }
    return [];
}
function judgeSourceFacts(idxSrc) {
    const eng = engineFrom(idxSrc);
    let st = FV.normalize({ version: 1, seq: 0, facts: [] });
    st = FV.assertFact(st, { subject: '甲', predicate: '答应', value: '还伞', origin: 'stated', from: 3, floor: 3, at: 1 }).state;
    st = FV.assertFact(st, { subject: '乙', predicate: '提到', value: '雨', origin: 'stated', from: 9, floor: 9, at: 2 }).state;
    eng._factVersionState = st;
    const r = eng.correctionSourceFacts({ from: 1, to: 5 });
    if (!r || r.ok !== true) return ['圈范围取数失败：' + ((r && r.reason) || 'unknown')];
    if (r.facts.length !== 1) return ['范围内应恰 1 条（实 ' + r.facts.length + '）'];
    if (r.facts[0].value !== '还伞') return ['取错条目：' + r.facts[0].value];
    return [];
}
function judgeUnscoped(idxSrc) {
    const eng = engineFrom(idxSrc);
    let st = FV.normalize({ version: 1, seq: 0, facts: [] });
    st = FV.assertFact(st, { subject: '甲', predicate: '答应', value: '还伞', origin: 'stated', from: 3, floor: 3, at: 1 }).state;
    eng._factVersionState = st;
    const r = eng.correctionSourceFacts(null);
    if (!r || r.ok !== false) return ['未圈范围必须 ok:false'];
    if (Array.isArray(r.facts) && r.facts.length) return ['未圈范围却退回全量 ' + r.facts.length + ' 条'];
    if (!r.reason) return ['未给具名 reason'];
    return [];
}
function judgeReextract(idxSrc) {
    const eng = engineFrom(idxSrc);
    const f = eng.correctionReextractFacts({ newFacts: [{ id: 'x' }] });
    if (!f || f.ok !== true || f.source !== 'fixture') return ['fixture 通道应原样透传并标 fixture'];
    const a = eng.correctionReextractFacts({});
    if (!a || a.ok !== false || a.reason !== 'extractor-absent') return ['提取器缺席须具名 extractor-absent（实 ' + ((a && a.reason) || '') + '）'];
    if (Array.isArray(a.facts) && a.facts.length) return ['缺席不得给事实（不得拿旧账当新结果）'];
    return [];
}
function judgeRevoke(idxSrc) {
    const eng = engineFrom(idxSrc);
    let st = FV.normalize({ version: 1, seq: 0, facts: [] });
    const a = FV.assertFact(st, { subject: '甲', predicate: '答应', value: '还伞', origin: 'stated', from: 3, floor: 3, at: 1 });
    eng._factVersionState = a.state;
    const id = a.state.facts[0].id;
    eng._correctionJournal = { factToken: 'undo:fact:KEEP', configToken: 'undo:config:KEEP', fact: { landed: [], superseded: [] }, config: null };
    const r = eng.memoryCenterRevoke(id, 'test');
    if (!r || r.ok !== true) return ['撤回失败：' + ((r && r.reason) || 'unknown')];
    if (FV.normalize(eng._factVersionState).facts[0].revoked !== true) return ['真源未被撤回'];
    if (eng._correctionJournal.factToken !== 'undo:fact:KEEP') return ['journal 被覆盖（撤回本批的流水丢了）'];
    const r2 = eng.memoryCenterRevoke(id, 'test');
    if (!r2 || r2.ok !== true || r2.replayed !== true) return ['二次撤回应幂等 replayed=true'];
    const r3 = eng.memoryCenterRevoke('', 'test');
    if (!r3 || r3.ok !== false || r3.reason !== 'missing-id') return ['缺 id 须具名 missing-id'];
    return [];
}
function judgeFaceSaved(idxSrc) {
    const eng = engineFrom(idxSrc);
    eng.memoryCenterSaveQuery(C.blankState());
    const handlers = {};
    for (const a of C.ACTIONS) handlers[a.id] = 1;
    const face = eng.memoryCenterView(null, { availableHandlers: Object.keys(handlers) });
    if (!face || !Array.isArray(face.saved)) return ['视图未产出 saved 面'];
    if (face.saved.length !== 1) return ['面板 saved 面 ' + face.saved.length + ' 条（真源 1 条 ⇒ 零同步未修）'];
    if (face.saved[0].replayKey !== eng.evidenceSavedQueries()[0].replayKey) return ['面板读数与宿主真源不是同一条'];
    return [];
}
function judgeDispute(uiSrc) {
    const head = "plugin._memoryCenterHandlers['row.dispute'] = function";
    const at = uiSrc.indexOf(head);
    if (at < 0) return ['row.dispute handler 不在场'];
    const next = uiSrc.indexOf('plugin._memoryCenterHandlers[', at + head.length);
    const block = uiSrc.slice(at, next < 0 ? at + 600 : next);
    const bad = [];
    if (!block.includes('不可用')) bad.push('未如实报不可用');
    for (const w of ['memoryCenterRevoke(', 'showCorrectionPanel(', '_factVersionState', '_evidenceSavedQueries']) {
        if (block.includes(w)) bad.push('争议面出现了写调用：' + w);
    }
    return bad;
}
test('v3380 A1. ** 宿主六个新出口 + 三个纠错出口在真源各恰一处', () => {
    assert.deepEqual(judgeA1(IDX), [], '声明面漂移：' + judgeA1(IDX).join('；'));
    ok('九处声明各恰 1 次');
});
test('v3380 A2. *** 面板 9 handler 全在场 + 旧手写 state 模式清零', () => {
    assert.deepEqual(judgeA2(UI), [], judgeA2(UI).join('；'));
    ok('9 handler 各恰 1 次 / 旧伪造模式 0 处');
});
test('v3380 A3. ** 内核声明 9 动作与面板提供面逐字相等', () => {
    assert.deepEqual(judgeA3(C, UI), [], judgeA3(C, UI).join('；'));
    ok('声明面 == 提供面（9）');
});
test('v3380 B1. *** 保存条件真落宿主真源（同条件覆盖）', () => {
    assert.deepEqual(judgeSave(IDX), [], judgeSave(IDX).join('；'));
    ok('保存 → 真源 1 条；同条件覆盖 replaced');
});
test('v3380 B2. *** state 注入为浅拷贝且与真源同步', () => {
    assert.deepEqual(judgeSavedSync(IDX), [], judgeSavedSync(IDX).join('；'));
    ok('浅拷贝 + 真源注入 + 调用方对象不被反写');
});
test('v3380 B3. ** 圈定范围只取范围内未撤回事实', () => {
    assert.deepEqual(judgeSourceFacts(IDX), [], judgeSourceFacts(IDX).join('；'));
    ok('范围内恰 1 条');
});
test('v3380 B4. *** 未圈范围不退回全量（具名 reason）', () => {
    assert.deepEqual(judgeUnscoped(IDX), [], judgeUnscoped(IDX).join('；'));
    ok('未圈 ⇒ ok:false 且 facts 空');
});
test('v3380 B5. ** 重提取取数口三态不同形', () => {
    assert.deepEqual(judgeReextract(IDX), [], judgeReextract(IDX).join('；'));
    ok('fixture 透传 / extractor-absent 具名');
});
test('v3380 B6. *** 单条撤回走真写面（幂等 + 不碰 journal）', () => {
    assert.deepEqual(judgeRevoke(IDX), [], judgeRevoke(IDX).join('；'));
    ok('真撤 + 幂等 + journal 保留 + 缺 id 具名');
});
test('v3380 C1. *** 面板视图读到宿主真源保存条件（零同步缺陷闭合）', () => {
    assert.deepEqual(judgeFaceSaved(IDX), [], judgeFaceSaved(IDX).join('；'));
    ok('face.saved 与宿主真源同条');
});
test('v3380 C2. *** row.dispute 如实报不可用（不编假写入）', () => {
    assert.deepEqual(judgeDispute(UI), [], judgeDispute(UI).join('；'));
    ok('争议面无任何写调用');
});
const F1 = String.raw`st.saved = this.evidenceSavedQueries();`;
const F2 = String.raw`if (sc.scoped !== true || sc.known !== true) { out.reason = sc.reason || 'unscoped'; return out; }`;
const F3 = String.raw`out.replayKey = (r.list.length && r.list[r.list.length - 1].replayKey) || '';`;
test('v3380 F1. *** 破坏真源同步 ⇒ 保存区零同步判据当场现形', () => {
    const broken = breakOnce(IDX, F1, String.raw`st.saved = st.saved;`, 'F1');
    assert.notEqual(broken, IDX, '破坏必须真改源码');
    assert.notDeepEqual(judgeFaceSaved(broken), [], 'saved 不再与真源同步必须翻红');
    assert.deepEqual(judgeFaceSaved(IDX), [], '原版上同判据必须真成立');
    ok('负控制成立：同步被摘 ⇒ 面板 saved 面空');
});
test('v3380 F2. *** 破坏未圈范围闸 ⇒ 退回全量判据当场现形', () => {
    const broken = breakOnce(IDX, F2, String.raw`if (false) { out.reason = sc.reason || 'unscoped'; return out; }`, 'F2');
    assert.notEqual(broken, IDX, '破坏必须真改源码');
    assert.notDeepEqual(judgeUnscoped(broken), [], '未圈范围闸被摘必须翻红');
    assert.deepEqual(judgeUnscoped(IDX), [], '原版上同判据必须真成立');
    ok('负控制成立：范围闸被摘 ⇒ 未圈范围退回全量');
});
test('v3380 F3. *** 破坏保存落笔 ⇒ 真源条数判据当场现形', () => {
    const broken = breakOnce(IDX, F3, String.raw`out.replayKey = '';`, 'F3');
    assert.notEqual(broken, IDX, '破坏必须真改源码');
    assert.notDeepEqual(judgeSave(broken), [], '保存回执不含 replayKey 必须翻红');
    assert.deepEqual(judgeSave(IDX), [], '原版上同判据必须真成立');
    ok('负控制成立：回执键被摘 ⇒ replayKey 缺失');
});
test('v3380 G1. *** H5 判据纯度：三个破坏锚点在本档各恰 1 次', () => {
    for (const [nm, a] of [['F1', F1], ['F2', F2], ['F3', F3]]) {
        const n = SELF.split(a).length - 1;
        assert.equal(n, 1, nm + ' 在本档出现 ' + n + ' 次（纯度要求恰 1 次）');
    }
    for (const [nm, a] of [['F1', F1], ['F2', F2], ['F3', F3]]) {
        assert.equal(IDX.split(a).length - 1, 1, nm + ' 在真源上须恰中 1 次');
    }
    ok('三锚点：本档各 1 次、真源各恰中 1 次');
});
test('v3380 H1. *** 自防护 + 当版锚点(供版本守卫 V4 计数)', () => {
    assert.ok(SELF.length > 8000, '本档自身不得被清空(实 ' + SELF.length + ' 字符)');
    assert.ok(SELF.includes('BORN'), '当版锚点必须显式留在本档里');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum(BORN_V), '本套件只在 ' + BORN_V + ' 及以后成立；当前 ' + codeVer);
    ok('自防护 / 当版锚 v' + BORN_V);
});
const BORN_V = '3.338.0';
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
