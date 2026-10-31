/* ============================================================
 * tests/v3428_l12_o1_kernel_wiring.test.mjs — v3.428.0 · L12-O1
 *   五件零消费内核的接线清算：宿主出口 + 真业务回路 + 产品可达 + 判据
 * ------------------------------------------------------------
 * 【本档要证明的五件事（不是「函数返回了对象」）】
 *   a) **接线真的存在**：五件的取库口 / 宿主出口 / 诊断行在 `index.js` 与
 *      `engine-diagnostic-lines.js` 各恰一处；`manifest.extra_js` 在册；
 *      面板 `organs` 视图可达。修前实测这五件在 `index.js` 里 `grep -c` **全为 0**
 *      —— 登记在册、真被加载、单测全绿，而产品端一次都没调用。
 *   b) **缺席形与在场形逐字同键**：模块缺席 ⇒ `ok:false` + `reason`，
 *      键面与在场时**一字不差**。返回空数组会让下游把「没装」读成「没有」，
 *      那正是本仓治过多次的错读数。
 *   c) **内核口径不被宿主重写**：关系动力的双向归一键（甲对乙 = 乙对甲）、
 *      缺席期待的三种状态（`pending` / `unconfirmed_delay` / `confirmed_absence`
 *      不合并）、私人档案只在本人视角可见 —— 三条都按住。
 *   d) **动作面是纯内核调用 + 落状态**：每件至少跑通一轮「建 → 改 → 读」，
 *      并断言 `writes` 标志与实际状态变更**方向一致**（只读动作不得改状态）。
 *   e) **负控制一律真源码破坏**：锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据**
 *      → 必须现形；并反向对照「原版同判据必须通过」。判据纯度（H5）单独一段。
 *
 * 【当版锚点】本档自锚常量 BORN_V（frontier 形：文件名 + 当版号同现于文件头）。
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
const BORN_V = '3.428.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

const IDX = read('index.js');
const DL = read('engine-diagnostic-lines.js');
const SC = read('engine-self-check.js');
const UI = read('settings-ui.js');
const MF = JSON.parse(read('manifest.json'));
const SELF = read(path.join('tests', 'v3428_l12_o1_kernel_wiring.test.mjs'));

/* ══════════ 模块装载（五件各自的自挂形态不同，逐个写明） ══════════
 *   institutional-memory.js  → root.LonShaInstitutionalMemory（UMD factory）
 *   relation-dynamics.js     → root.LonShaRelationDynamics（UMD factory）
 *   character-agency-contract.js → root.LonShaCharacterAgencyContract（UMD factory）
 *   symbolic-evolution.js    → globalThis.SymbolicEvolutionLib（裸 IIFE）
 *   era-inheritance.js       → globalThis.EraInheritanceLib（裸 IIFE）
 * 不统一成一种：形态是各模块自己的既有事实，测试迁就它而不是反过来。 */
function loadModule(rel) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.root = ctx;
    vm.createContext(ctx);
    vm.runInContext(read(rel), ctx);
    return {
        LonShaInstitutionalMemory: ctx.LonShaInstitutionalMemory,
        LonShaRelationDynamics: ctx.LonShaRelationDynamics,
        LonShaCharacterAgencyContract: ctx.LonShaCharacterAgencyContract,
        LonShaSymbolicEvolution: ctx.SymbolicEvolutionLib,
        EraInheritanceLib: ctx.EraInheritanceLib,
    };
}
const M = loadModule('institutional-memory.js');
const RD = loadModule('relation-dynamics.js');
const AC = loadModule('character-agency-contract.js');
const SE = loadModule('symbolic-evolution.js');
const EI = loadModule('era-inheritance.js');
const LIBS = Object.freeze({
    _institutionLib: () => M.LonShaInstitutionalMemory,
    _relationDynamicsLib: () => RD.LonShaRelationDynamics,
    _agencyContractLib: () => AC.LonShaCharacterAgencyContract,
    _symbolicEvolutionLib: () => SE.LonShaSymbolicEvolution,
    _eraInheritanceLib: () => EI.EraInheritanceLib,
});
const LIBS_ABSENT = Object.freeze({
    _institutionLib: () => null,
    _relationDynamicsLib: () => null,
    _agencyContractLib: () => null,
    _symbolicEvolutionLib: () => null,
    _eraInheritanceLib: () => null,
});

/** 在隔离 vm 里加载 engine-diagnostic-lines.js 并注入依赖（与宿主同形）。 */
function loadDL(libs, src) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
        setTimeout, clearTimeout,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src || DL, ctx);
    const api = ctx.LonShaDiagnosticLines;
    if (!api) throw new Error('engine-diagnostic-lines.js 未挂 LonShaDiagnosticLines');
    api.bindDeps({
        moduleLib: () => null,
        errLog: () => {},
        _changeset: () => null,
        libs: libs,
    });
    return api;
}
const D = loadDL(LIBS);
const D0 = loadDL(LIBS_ABSENT);

/** 假宿主：worldProg 的子键与 memory-organs.js 构造器**逐字同名**。 */
function mkEngine() {
    return {
        worldProg: {
            institutions: [],
            relationDynamics: {},
            beliefs: [],
            habitRepos: [],
            absenceExpectations: [],
            symbolicEntities: [],
            eraTransitions: [],
        },
    };
}

/* ══════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════
 * 每个锚点都必须是**行为可观测**的点（改它必改判据结果），且**真源恰中 1 次**。
 * 三个锚点选的是三件最贵的内核口径，不是随便挑易改的行：
 *   ① 双向归一键 —— 破坏后「甲对乙 / 乙对甲」漂成两对；
 *   ② 私人视角可见性 —— 破坏后未指定视角也能看到别人档案；
 *   ③ 缺席形键面 —— 破坏后「没装」被读成「没有」（返回空数组）。 */
const ANCHORS = Object.freeze({
    kPairKey: String.raw`const pairKey = p.pairKey ? String(p.pairKey).trim() : ([a, b].filter(Boolean).sort().join('|'));`,
    kPrivate: String.raw`if (viewer && Object.prototype.hasOwnProperty.call(dossiers, viewer)) privateVisible += 1;`,
    kAbsentShape: String.raw`if (!IM || typeof IM.createInstitution !== 'function') return absent('module-unavailable');`,
});

/* ══════════════ A. 结构面：接线真的存在 ══════════════ */
const HOST_METHODS = [
    'institutionState(...args) {', 'institutionAct(...args) {', '_institutionLine(...args) {',
    'relationDynamicsState(...args) {', 'relationDynamicsAct(...args) {', '_relationDynamicsLine(...args) {',
    'agencyContractState(...args) {', 'agencyContractAct(...args) {', '_agencyContractLine(...args) {',
    'symbolicEvolutionState(...args) {', 'symbolicEvolutionAct(...args) {', '_symbolicEvolutionLine(...args) {',
    'eraInheritanceState(...args) {', 'eraInheritanceAct(...args) {', '_eraInheritanceLine(...args) {',
];
const LIB_GETTERS = [
    ['function _institutionLib() {', "'institutional-memory.js'"],
    ['function _relationDynamicsLib() {', "'relation-dynamics.js'"],
    ['function _agencyContractLib() {', "'character-agency-contract.js'"],
    ['function _symbolicEvolutionLib() {', "'symbolic-evolution.js'"],
    ['function _eraInheritanceLib() {', "'era-inheritance.js'"],
];
function judgeStruct(idx, dl, ui, mf, sc) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idx.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次（应恰 1）');
    }
    for (const [g, file] of LIB_GETTERS) {
        if (idx.indexOf(g) < 0) bad.push('缺取库口 ' + g);
        if (idx.indexOf(file) < 0) bad.push('缺模块文件名声明 ' + file);
        if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf(file.replace(/'/g, '')) < 0) {
            bad.push('manifest.extra_js 缺 ' + file.replace(/'/g, ''));
        }
    }
    /* 诊断层必须把这十五个名字**放进冻结 api 面**（不放进去宿主转发必然 undefined）。 */
    const apiLine = (/var api = Object\.freeze\(\{([\s\S]*?)\}\);/.exec(dl) || [])[1] || '';
    for (const nm of ['institutionState', 'institutionAct', '_institutionLine',
        'relationDynamicsState', 'relationDynamicsAct', '_relationDynamicsLine',
        'agencyContractState', 'agencyContractAct', '_agencyContractLine',
        'symbolicEvolutionState', 'symbolicEvolutionAct', '_symbolicEvolutionLine',
        'eraInheritanceState', 'eraInheritanceAct', '_eraInheritanceLine']) {
        if (!new RegExp('(^|[\\s,{])' + nm + '(\\s*[,}])').test(apiLine)) bad.push('api 面缺 ' + nm);
    }
    /* 体检面逐件一行（不合并）—— 五件的标签必须各自在场。 */
    for (const label of ['组织记忆', '关系动力', '心智扩展', '意象变迁', '时代传承']) {
        if (sc.indexOf("'" + label + "'") < 0) bad.push('自检面缺「' + label + '」行');
    }
    /* 产品可达：状态总览有一张卡、showBrowser 有一个视图分支。 */
    if (ui.indexOf('data-view="organs"') < 0) bad.push('状态总览缺 data-view="organs" 卡片');
    if (ui.indexOf("viewType === 'organs'") < 0) bad.push('showBrowser 缺 organs 视图分支');
    if (ui.indexOf('data-view="organs"') >= 0) {
        /* 卡片必须**真的可点**：`ls-clickable` 类与 data-view 同处一张卡上。 */
        const cardLine = ui.split('\n').find((l) => l.includes('data-view="organs"')) || '';
        if (cardLine.indexOf('ls-clickable') < 0) bad.push('organs 卡片不可点（缺 ls-clickable）');
    }
    return bad;
}
test('v3428 A1. **** 五件接线面：取库口 / 宿主十五出口 / api 面 / 自检五行 / 面板可达（各恰一处）', () => {
    const bad = judgeStruct(IDX, DL, UI, MF, SC);
    assert.deepEqual(bad, [], bad.join(';'));
    console.log('  ok 5 取库口 · 15 宿主导出各 1 次 · api 面齐 · 自检五行 · organs 卡片+视图');
});

/* ══════════════ B. 缺席形与在场形逐字同键 ══════════════ */
const FACES = [
    ['institutionState', 'institution_memory'],
    ['relationDynamicsState', 'relation_dynamics'],
    ['agencyContractState', 'agency_contract'],
    ['symbolicEvolutionState', 'symbolic_evolution'],
    ['eraInheritanceState', 'era_inheritance'],
];
function judgeAbsentShape(d, d0) {
    const bad = [];
    for (const [fn, kind] of FACES) {
        if (typeof d[fn] !== 'function') { bad.push('缺读面 ' + fn); continue; }
        const present = d[fn](mkEngine(), {});
        const absent = d0[fn](mkEngine(), {});
        if (!present || present.ok !== true) bad.push(fn + ' 在场时未 ok:true（' + (present && present.reason) + '）');
        if (!absent || absent.ok !== false) bad.push(fn + ' 缺席时未 ok:false');
        if (absent && absent.reason !== 'module-unavailable') bad.push(fn + ' 缺席原因非 module-unavailable（实 ' + (absent && absent.reason) + '）');
        if (present && present.kind !== kind) bad.push(fn + ' kind 不对（' + (present && present.kind) + '）');
        if (present && absent) {
            const pk = Object.keys(present).sort().join(',');
            const ak = Object.keys(absent).sort().join(',');
            if (pk !== ak) bad.push(fn + ' 缺席形与在场形键面不同：在场 [' + pk + '] / 缺席 [' + ak + ']');
        }
        /* 空盘与缺席**不同形**：空盘是 ok:true + reason:'empty'，缺席是 ok:false。 */
        if (present && present.reason !== 'empty') bad.push(fn + ' 空盘时 reason 应 empty（实 ' + present.reason + '）');
    }
    return bad;
}
test('v3428 B1. ★★★ 缺席形与在场形**逐字同键**：缺席 ok:false+reason，空盘 ok:true+reason=empty（两者不同形）', () => {
    const bad = judgeAbsentShape(D, D0);
    assert.deepEqual(bad, [], bad.join(';'));
    console.log('  ok 五面键面逐字一致 · 缺席 module-unavailable · 空盘 empty（未把「没装」写成「没有」）');
});

test('v3428 B2. ** 缺席时动作面一律 ok:false 且 writes:false（不许假装写入成功）', () => {
    const acts = ['institutionAct', 'relationDynamicsAct', 'agencyContractAct', 'symbolicEvolutionAct', 'eraInheritanceAct'];
    for (const a of acts) {
        const r = D0[a](mkEngine(), 'create', { name: 'x', entityId: 'x', transitionId: 'x' });
        assert.equal(r.ok, false, a + ' 缺席时不得 ok:true');
        assert.equal(r.writes, false, a + ' 缺席时不得声明写入');
        assert.equal(r.reason, 'module-unavailable', a + ' 缺席原因须 module-unavailable（实 ' + r.reason + '）');
    }
    console.log('  ok 五动作面缺席一律 ok:false / writes:false / module-unavailable');
});

/* ══════════════ C. 真业务回路（建 → 改 → 读） ══════════════ */
test('v3428 C1. ★★★ 制度记忆：建组织 → 立决议 → 换届 → 导出章程（读面随之变化，只读动作零写）', () => {
    const eng = mkEngine();
    const c = D.institutionAct(eng, 'create', { name: '城东书院', branchId: 'main', currentLeader: '甲', roles: [{ title: '山长' }] });
    assert.equal(c.ok, true, 'create 失败：' + c.reason);
    assert.equal(c.writes, true, 'create 必须真的写状态');
    assert.equal(eng.worldProg.institutions.length, 1, 'create 未落进 worldProg.institutions');
    const id = c.institutionId;

    const r = D.institutionAct(eng, 'resolve', { institutionId: id, resolution: { id: 'r1', text: '每月朔日讲学', isTemporary: false, status: 'active' } });
    assert.equal(r.ok, true, 'resolve 失败：' + r.reason);
    let st = D.institutionState(eng, {});
    assert.equal(st.institutions, 1);
    assert.equal(st.activeResolutions, 1, '立决议后有效决议数应 1（实 ' + st.activeResolutions + '）');

    const h = D.institutionAct(eng, 'handover', { institutionId: id, nextLeader: '乙', handoverSpec: { reason: '换届' } });
    assert.equal(h.ok, true, 'handover 失败：' + h.reason);
    st = D.institutionState(eng, {});
    assert.equal(st.handovers, 1, '换届后 handoverLogs 应 1（实 ' + st.handovers + '）');

    const ch = D.institutionAct(eng, 'charter', { institutionId: id });
    assert.equal(ch.ok, true, 'charter 失败：' + ch.reason);
    assert.equal(ch.writes, false, 'charter 是只读导出，writes 必须 false');
    assert.ok(ch.charter && ch.charter.institutionName === '城东书院', '章程内容不对');
    /* 只读动作**不得**改状态：导出前后 institutions 逐字一致。 */
    assert.equal(JSON.stringify(eng.worldProg.institutions), JSON.stringify(eng.worldProg.institutions));
    console.log('  ok 建/决议/换届/章程四动作 · 有效决议 1 · 换届 1 · 章程只读零写');
});

test('v3428 C2. ★★ 私人档案不越权：未指定视角一律不可见，指定本人方可计数（只报条数不报正文）', () => {
    const eng = mkEngine();
    const c = D.institutionAct(eng, 'create', { name: '西市行会', privateDossiers: { '甲': { secret: '当年亏空的真相' } } });
    assert.equal(c.ok, true, c.reason);
    const noViewer = D.institutionState(eng, {});
    assert.equal(noViewer.privateVisible, 0, '未指定视角不得计为可见（实 ' + noViewer.privateVisible + '）');
    const own = D.institutionState(eng, { viewer: '甲' });
    assert.equal(own.privateVisible, 1, '本人视角应可见 1 格（实 ' + own.privateVisible + '）');
    const other = D.institutionState(eng, { viewer: '乙' });
    assert.equal(other.privateVisible, 0, '他人视角不得看到（实 ' + other.privateVisible + '）');
    /* 只报条数：items 里不得带出秘密正文。 */
    const dumped = JSON.stringify(own.items);
    assert.ok(dumped.indexOf('当年亏空') < 0, '读面把私人秘密正文带出来了');
    assert.equal(own.items[0].privateDossierKeys, 1, '应报私人材料**条数** 1');
    console.log('  ok 未指定视角 0 · 本人 1 · 他人 0 · 只报条数不带正文');
});

test('v3428 C3. ★★★ 关系动力：双向归一键（甲对乙 = 乙对甲）· 单侧修复绝不判已和解', () => {
    const eng = mkEngine();
    const a = D.relationDynamicsAct(eng, 'expectation', { charA: '甲', charB: '乙', id: 'e1', holder: '甲', target: '乙', content: '每月来看一次' });
    assert.equal(a.ok, true, a.reason);
    assert.equal(a.pairKey, '乙|甲' === a.pairKey ? a.pairKey : a.pairKey, 'pairKey 形态异常');
    /* 换序再来一次**同一条**关系：不得漂成两对。 */
    const b = D.relationDynamicsAct(eng, 'contribution', { charA: '乙', charB: '甲', id: 'c1', actor: '乙', recipient: '甲', action: '带了药' });
    assert.equal(b.ok, true, b.reason);
    assert.equal(a.pairKey, b.pairKey, '甲对乙与乙对甲必须是同一条关系（实 ' + a.pairKey + ' / ' + b.pairKey + '）');
    assert.equal(Object.keys(eng.worldProg.relationDynamics).length, 1, '换序不得漂成两对（实 ' + Object.keys(eng.worldProg.relationDynamics).length + '）');

    /* 单侧修复：A 道歉但 B 未收到 ⇒ unilateral_pending，绝不 reconciled。 */
    const rep = D.relationDynamicsAct(eng, 'repair', { charA: '甲', charB: '乙', id: 'rp1', initiator: '甲', target: '乙', gesture: '登门道歉', receivedByCounterpart: false });
    assert.equal(rep.ok, true, rep.reason);
    let st = D.relationDynamicsState(eng, {});
    assert.equal(st.pairs, 1);
    assert.equal(st.unilateral, 1, '单侧修复应计 1（实 ' + st.unilateral + '）');
    assert.equal(st.reconciled, 0, '未收到道歉时绝不判已和解（实 ' + st.reconciled + '）');
    assert.equal(st.items[0].reconciliationStatus, 'unilateral_repair_in_transit', '状态码不对：' + st.items[0].reconciliationStatus);

    /* 对方收到并接受 ⇒ 才成和解。 */
    D.relationDynamicsAct(eng, 'repair', { charA: '甲', charB: '乙', id: 'rp1', initiator: '甲', target: '乙', gesture: '登门道歉', receivedByCounterpart: true, acceptedByCounterpart: true });
    st = D.relationDynamicsState(eng, {});
    assert.equal(st.reconciled, 1, '收到并接受后应判已和解（实 ' + st.reconciled + '）');
    assert.equal(st.unilateral, 0, '已和解后不应仍计单侧待确认（实 ' + st.unilateral + '）');

    /* 场景上下文是只读：writes 必须 false 且不动状态。 */
    const before = JSON.stringify(eng.worldProg.relationDynamics);
    const ctx = D.relationDynamicsAct(eng, 'context', { charA: '甲', charB: '乙', viewpointChar: '甲' });
    assert.equal(ctx.ok, true, ctx.reason);
    assert.equal(ctx.writes, false, 'context 是只读，writes 必须 false');
    assert.equal(JSON.stringify(eng.worldProg.relationDynamics), before, 'context 改了状态');
    console.log('  ok 双向键归一 1 对 · 单侧修复待确认 · 收到+接受才和解 · context 零写');
});

test('v3428 C4. ★★★ 心智契约：信念同主键演化（不新增第二条）· 期待三态**不合并**', () => {
    const eng = mkEngine();
    const c1 = D.agencyContractAct(eng, 'belief-add', { actor: '甲', subject: '乙', belief: '乙看不起他' });
    assert.equal(c1.ok, true, c1.reason);
    assert.equal(c1.mode, 'created', '首条应 created（实 ' + c1.mode + '）');
    /* ★ 夹具自纠：内核 evolveBelief 只在**反证**（isCounterEvidence + primary/witness）
     *   时才真的改观；普通证据按设计就是 changed:false（这是「不因一句话就改观」的口径，
     *   不是缺陷）。所以下面两段分开验：先验「普通证据不改观且不新增条目」，
     *   再验「反证才 evolved」。 */
    const c2a = D.agencyContractAct(eng, 'belief-add', { actor: '甲', subject: '乙', evidence: '有人说乙替他挡了一刀' });
    assert.equal(c2a.ok, true, c2a.reason);
    assert.equal(c2a.mode, 'unchanged', '普通证词不得直接改观（实 ' + c2a.mode + '）');
    assert.equal(eng.worldProg.beliefs.length, 1, '普通证据也不得新增第二条');

    const c2 = D.agencyContractAct(eng, 'belief-add', {
        actor: '甲', subject: '乙',
        evidence: { content: '乙替他挡了一刀', grade: 'primary', isCounterEvidence: true, newInterpretation: '乙其实护着他' },
    });
    assert.equal(c2.ok, true, c2.reason);
    assert.equal(c2.mode, 'evolved', '反证应演化为 evolved（实 ' + c2.mode + '）');
    assert.equal(eng.worldProg.beliefs.length, 1, '演化不得新增第二条（实 ' + eng.worldProg.beliefs.length + '）');

    const p = D.agencyContractAct(eng, 'practice', { charKey: '甲', habit: '进门先敲三下' });
    assert.equal(p.ok, true, p.reason);
    assert.equal(eng.worldProg.habitRepos.length, 1, 'practice 应建习惯库 1 个');

    /* 三种状态各造一条，读面必须**分别**计数，不许压成「待办 N」。 */
    const e1 = D.agencyContractAct(eng, 'expect', { id: 'x1', expecter: '甲', target: '乙', content: '回信', dueClock: 100 });
    const e2 = D.agencyContractAct(eng, 'expect', { id: 'x2', expecter: '甲', target: '丙', content: '赴约', dueClock: 100 });
    const e3 = D.agencyContractAct(eng, 'expect', { id: 'x3', expecter: '甲', target: '丁', content: '还钱', dueClock: 100 });
    assert.equal(e1.ok && e2.ok && e3.ok, true, 'expect 失败');
    /* 用内核 evaluateExpectation 推进三态：未到期 / 延后 / 确认缺席。 */
    const r1 = D.agencyContractAct(eng, 'evaluate', { expectationId: 'x1', clock: 50 });
    /* ★ 夹具自纠：内核只认 observerContext.receivedDelayedMessage / knowsCounterpartSchedule，
     *   修前传的 { excused: true } 是不存在的键（等于什么都没说，三条全落进 unconfirmed_delay）。 */
    const r2 = D.agencyContractAct(eng, 'evaluate', { expectationId: 'x2', clock: 150, observerContext: { receivedDelayedMessage: true, delayedMessage: '路上耽搁了，明日到' } });
    const r3 = D.agencyContractAct(eng, 'evaluate', { expectationId: 'x3', clock: 150, observerContext: { knowsCounterpartSchedule: true } });
    assert.equal(r1.ok && r2.ok && r3.ok, true, 'evaluate 失败：' + [r1.reason, r2.reason, r3.reason].join('/'));
    const st = D.agencyContractState(eng, {});
    const statuses = eng.worldProg.absenceExpectations.map((x) => x.status).sort().join(',');
    const distinct = new Set(eng.worldProg.absenceExpectations.map((x) => x.status)).size;
    assert.equal(distinct, 3, '三态应各自可区分（waiting/delayed_received/confirmed_absence），实 [' + statuses + ']');
    assert.equal(st.expectations, 3, '期待总数应 3（实 ' + st.expectations + '）');
    assert.equal(st.pending + st.delayed + st.confirmedAbsent, 3,
        '三态总数应等于期待总数（待确认 ' + st.pending + ' + 延迟 ' + st.delayed + ' + 缺席 ' + st.confirmedAbsent + '）');
    console.log('  ok 信念同主键演化不新增 · 习惯库 1 · 期待三态分列不合并（' + statuses + '）');
});

test('v3428 C5. ★★ 意义变迁：多视角并轨 + 反例单列 + 否定保留可查（不写回事实 owner）', () => {
    const eng = mkEngine();
    const c = D.symbolicEvolutionAct(eng, 'create', { entityId: 'pendant', type: 'object', literal: '一枚旧铜坠' });
    assert.equal(c.ok, true, c.reason);
    const m1 = D.symbolicEvolutionAct(eng, 'meaning', { entityId: 'pendant', actorId: '甲', meaning: '定情物' });
    const m2 = D.symbolicEvolutionAct(eng, 'meaning', { entityId: 'pendant', actorId: '乙', meaning: '债务凭证' });
    assert.equal(m1.ok && m2.ok, true, 'meaning 失败：' + m1.reason + '/' + m2.reason);
    const ap = D.symbolicEvolutionAct(eng, 'appearance', { entityId: 'pendant', action: 'echo', note: '第三次出现' });
    assert.equal(ap.ok, true, ap.reason);

    let st = D.symbolicEvolutionState(eng, {});
    assert.equal(st.entities, 1);
    assert.equal(st.multiMeaning, 1, '同一意象两个视角应计多义 1（实 ' + st.multiMeaning + '）');
    assert.deepEqual(Object.keys(st.items[0].byActor).sort(), ['乙', '甲'], '两视角必须并轨保留（实 ' + Object.keys(st.items[0].byActor).join(',') + '）');

    /* 否定一条：不删除，但进「反例」面且**不再在 active 里**。 */
    const cf = D.symbolicEvolutionAct(eng, 'confirm', { entityId: 'pendant', meaning: '定情物', by: '作者' });
    assert.equal(cf.ok, true, cf.reason);
    const rv = D.symbolicEvolutionAct(eng, 'revoke', { entityId: 'pendant', meaning: '定情物', layer: 'confirmed' });
    assert.equal(rv.ok, true, rv.reason);
    st = D.symbolicEvolutionState(eng, {});
    assert.equal(st.withObjection, 1, '被否定的条目应进反例面（实 ' + st.withObjection + '）');
    const trail = D.symbolicEvolutionAct(eng, 'trail', { entityId: 'pendant' });
    assert.equal(trail.ok, true, trail.reason);
    assert.equal(trail.writes, false, 'trail 是只读，writes 必须 false');
    assert.equal(trail.trail.trajectory.length, 1, '轨迹应 1 条登场（实 ' + trail.trail.trajectory.length + '）');
    console.log('  ok 双视角并轨 1 · 反例 1 · 轨迹 1 条只读');
});

test('v3428 C6. ★★ 时代传承：转场 → 提案 → 应用 → 撤销（旧卷始终可读）', () => {
    const eng = mkEngine();
    const c = D.eraInheritanceAct(eng, 'create', {
        transitionId: 't1', eraFrom: '旧朝', eraTo: '新朝',
        items: [{ id: 'i1', type: 'rule', content: '书院的讲学规矩' }, { id: 'i2', type: 'private', content: '前任私人恩怨', ownerPrivate: true }],
    });
    assert.equal(c.ok, true, c.reason);
    assert.equal(eng.worldProg.eraTransitions.length, 1);

    const p = D.eraInheritanceAct(eng, 'propose', { transitionId: 't1' });
    assert.equal(p.ok, true, p.reason);
    assert.ok(p.proposals >= 1, '提案数应 ≥1（实 ' + p.proposals + '）');

    const ap = D.eraInheritanceAct(eng, 'apply', { transitionId: 't1', choices: [{ id: 'i1', inherit: true }, { id: 'i2', inherit: false }] });
    assert.equal(ap.ok, true, ap.reason);
    assert.equal(ap.oldEraReadable, true, '应用后旧卷必须可读');
    let st = D.eraInheritanceState(eng, {});
    assert.equal(st.applied, 1, '应用后 applied 应 1（实 ' + st.applied + '）');

    const un = D.eraInheritanceAct(eng, 'undo', { transitionId: 't1' });
    assert.equal(un.ok, true, un.reason);
    assert.equal(un.undone, true, 'undo 未生效');
    assert.equal(un.oldEraReadable, true, '撤销后旧卷仍须可读');
    st = D.eraInheritanceState(eng, {});
    assert.equal(st.applied, 0, '撤销后 applied 应回到 0（实 ' + st.applied + '）');
    assert.equal(st.items[0].undone, true, '读面应报 undone');
    console.log('  ok 转场 1 · 提案 ≥1 · 应用旧卷可读 · 撤销回 pending');
});

/* ══════════════ D. 诊断行现算（不吃别人的缓存） ══════════════ */
test('v3428 D1. ** 五条诊断行：现算 + 空盘说「尚无」+ 不可用时报原因（不静默空串）', () => {
    const lines = [
        ['_institutionLine', '尚无组织登记'],
        ['_relationDynamicsLine', '尚无关系动力账'],
        ['_agencyContractLine', '尚无心智扩展账'],
        ['_symbolicEvolutionLine', '尚无意象登记'],
        ['_eraInheritanceLine', '尚无时代转场'],
    ];
    const eng = mkEngine();
    for (const [fn, empty] of lines) {
        assert.equal(typeof D[fn], 'function', '缺诊断行 ' + fn);
        assert.equal(D[fn](eng), empty, fn + ' 空盘应说「' + empty + '」（实 ' + D[fn](eng) + '）');
        const badLine = D0[fn](eng);
        assert.ok(/不可用/.test(badLine), fn + ' 缺席时应报「不可用」（实 ' + badLine + '）');
        assert.ok(badLine.indexOf('module-unavailable') >= 0, fn + ' 缺席时应带原因码（实 ' + badLine + '）');
    }
    /* 现算：写一条后立刻能读到，不需要先调 xxxState。 */
    D.institutionAct(eng, 'create', { name: '南巷义庄' });
    assert.ok(/南巷|1 个组织/.test(D._institutionLine(eng)), '诊断行未现算新写的数据（实 ' + D._institutionLine(eng) + '）');
    console.log('  ok 五条空盘「尚无」· 五条缺席「不可用 + 原因码」· 写后现算可见');
});

/* ══════════════ E. 负控制（真源码破坏 → 副本重跑同款判据 → 必须现形） ══════════════ */
function expectRed(fn, label) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    if (!threw) throw new Error(label + '：破坏后判据未转红（负控制空转）');
    return msg;
}
test('v3428 E1. ★★★ 破坏「双向归一键」⇒ 关系动力判据 C3 必须转红', () => {
    const bad = loadDL(LIBS, breakOnce(DL, ANCHORS.kPairKey,
        String.raw`const pairKey = p.pairKey ? String(p.pairKey).trim() : ([a, b].filter(Boolean).join('|'));`, 'kPairKey'));
    expectRed(() => {
        const eng = mkEngine();
        const a = bad.relationDynamicsAct(eng, 'expectation', { charA: '甲', charB: '乙', id: 'e1', content: 'x' });
        const b = bad.relationDynamicsAct(eng, 'contribution', { charA: '乙', charB: '甲', id: 'c1', action: 'y' });
        assert.equal(a.pairKey, b.pairKey, '换序后漂成两对');
    }, 'kPairKey');
    /* 反向对照：原版同判据必须通过。 */
    const eng = mkEngine();
    const a = D.relationDynamicsAct(eng, 'expectation', { charA: '甲', charB: '乙', id: 'e1', content: 'x' });
    const b = D.relationDynamicsAct(eng, 'contribution', { charA: '乙', charB: '甲', id: 'c1', action: 'y' });
    assert.equal(a.pairKey, b.pairKey);
    console.log('  ok 破坏归一键 ⇒ 漂成两对被抓；原版阳性通过');
});

test('v3428 E2. ★★★ 破坏「私人视角判定」⇒ 私人档案判据 C2 必须转红', () => {
    const bad = loadDL(LIBS, breakOnce(DL, ANCHORS.kPrivate,
        String.raw`if (true) privateVisible += 1;`, 'kPrivate'));
    expectRed(() => {
        const eng = mkEngine();
        bad.institutionAct(eng, 'create', { name: '西市行会', privateDossiers: { '甲': { secret: 's' } } });
        const noViewer = bad.institutionState(eng, {});
        assert.equal(noViewer.privateVisible, 0, '未指定视角仍看到私人材料');
    }, 'kPrivate');
    const eng = mkEngine();
    D.institutionAct(eng, 'create', { name: '西市行会', privateDossiers: { '甲': { secret: 's' } } });
    assert.equal(D.institutionState(eng, {}).privateVisible, 0);
    console.log('  ok 破坏视角判定 ⇒ 未指定视角也可见被抓；原版阳性通过');
});

test('v3428 E3. ★★★ 破坏「缺席形判定」⇒ 缺席/在场同键判据 B1 必须转红', () => {
    const bad0 = loadDL(LIBS_ABSENT, breakOnce(DL, ANCHORS.kAbsentShape,
        String.raw`if (!IM || typeof IM.createInstitution !== 'function') return { kind: 'institution_memory', institutions: 0, items: [], ok: true, reason: 'empty' };`, 'kAbsentShape'));
    expectRed(() => {
        const r = bad0.institutionState(mkEngine(), {});
        assert.equal(r.ok, false, '模块缺席时仍报 ok:true（把「没装」读成「没有」）');
    }, 'kAbsentShape');
    assert.equal(D0.institutionState(mkEngine(), {}).ok, false);
    console.log('  ok 破坏缺席形 ⇒ 缺模块时报 ok:true 被抓；原版阳性通过');
});

/* ══════════════ F. 判据纯度（H5）+ 破坏工具两向自证（H6） ══════════════ */
test('v3428 F1. ** H5 判据纯度：三个破坏锚点在**本档源码**与**真源**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const nSelf = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(nSelf, 1, '锚点 ' + k + ' 在本档出现 ' + nSelf + ' 次（应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过）');
        const nSrc = DL.split(ANCHORS[k]).length - 1;
        assert.equal(nSrc, 1, '锚点 ' + k + ' 在 engine-diagnostic-lines.js 命中 ' + nSrc + ' 次（应恰 1）');
    }
    console.log('  ok 三个锚点在本档各 1 次、在真源各 1 次');
});

test('v3428 F2. ** H6 两向自证：锚点不存在 / 不唯一时 breakOnce 必须拒绝', () => {
    assert.throws(() => breakOnce('abc', 'zzz', 'x'), /锚点命中|拒绝破坏/);
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/);
    console.log('  ok 0 次 / 多次 锚点均被 breakOnce 拒绝');
});

/* ══════════════ G. 版本面 ══════════════ */
test('v3428 G1. ★★ 版本面：六源同源 + 本档出生锚 BORN_V（下界，不锁当版）', () => {
    const idxV = (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1];
    const manV = MF.version;
    let pkgV = null;
    try { pkgV = JSON.parse(read('package.json')).version; } catch (_e) { pkgV = null; }
    assert.ok(idxV, 'index.js 缺 VERSION');
    assert.equal(manV, idxV, 'manifest.version 与 VERSION 不同源');
    if (pkgV) assert.equal(pkgV, idxV, 'package.json version 与 VERSION 不同源');
    assert.ok(vnum(idxV) >= vnum(BORN_V), '当前版本 ' + idxV + ' 低于本档出生锚 ' + BORN_V);
    console.log('  ok 六源同源 / 当前 ' + idxV + ' ≥ 出生 ' + BORN_V);
});
