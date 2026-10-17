/* ============================================================
 * tests/v3328_f_pack_canon_fated.test.mjs — v3.328.0 · F 包(M3-X6 + M3-X8)
 *
 * 【本档要证明的是「两件产品项真的端到端长出来了」,不是「两个文件在场」】
 *   M3-X6:支线结果的正史选择工作区。修前 `branch-semantics` 能对照两条分支、
 *     `project-registry::compareProjects` 能比两个项目、`volume-continuation` 能把一卷
 *     接出去 —— 但**没有任何一面**回答「这两条支线的结局,哪一条成为后续正史?」。
 *     于是两条结局限定同时成立(读数上与「只有一条结局」同形),下游把两条都当既成事实注入。
 *   M3-X8:情境触发的旧事重现。修前 `recall-echo` / `echo-ledger` / `narrative-pulse`
 *     都靠生成侧**自己记得去查**:没有任何一面答「此刻为什么该想起来」,也没有一面
 *     拦住「旧事里带角色还不知道的内容」。
 *
 *   判据分五面(每面有独立的证伪路径):
 *     A 结构面:两模块导出面逐字对账 / 冻结 / 依赖面键名 / selfCheck 与缺格宣报
 *     B M3-X6 真跑:逐冲突三态 / 选择三档与幂等 / canon 至多一条 / 未选即阻止交接 /
 *       未选中的历史必须留痕 / 撤销不改原分支 · 秘密权限不扩大
 *     C M3-X8 真跑:触发四类穷尽 / 冷却窗口 / 策略三态(off · hint-only 可注入恒 0)/
 *       知情面正交集(未知一律不唤回)/ 无来源不出建议 / 情绪只读不改写
 *     D 零写与不抛:输入容器一个字节不改 + 模块 seeking 宿主状态为零 + 畸形入参不抛
 *     E 宿主接线:两取库口 / 装配面键名 / 出口齐全 / 诊断两行 / 中文人读面 / 登记面 / 内联残留为零
 *
 * 【诚实边界(不判的两条)】
 *   1 M3-X6 的冲突判定是**按位机械匹配**(collision 键或 slot 退化键),不是语义理解 ——
 *     本档只判「同一位上两条终结声明不会同时成立」与「未选不得交接」,
 *     不判「这两条剧情是不是真的互斥」(那需要剧情语义,不在本项范围)。
 *   2 M3-X8 的触发是**按情境字段机械匹配**,本档不判「这条旧事在此刻是否真的应景」——
 *     只判它「有来源、不重复、角色知情、按策略可注入」四条硬口径。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形;
 *   并反向对照「原版同判据必须通过」。工具两向自证(H6)与判据纯度(H5)各一段。
 * 【当版锚点】本档自锚常量 BORN + vnum。
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
const ok = (m) => console.log('  ✓ ' + m);

const IDX = read('index.js');
const BC_SRC = read('branch-canon.js');
const FR_SRC = read('fated-recall.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const SELF_REL = path.join('tests', 'v3328_f_pack_canon_fated.test.mjs');
const SELF = read(SELF_REL);

const BORN = '3.328.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/** 与生产同形地在隔离 vm 里加载 IIFE 模块(window 即全局、module 缺席)。 */
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
const BC = loadIIFE(BC_SRC, 'LonShaBranchCanon');
const FR = loadIIFE(FR_SRC, 'LonShaFatedRecall');

/* ── 负控制锚点(每个在本档内必须恰好出现 1 次:见 G1) ── */
const A_BC1 = "verdict = (hashes.size === 1) ? CLASH.SHARED_TERMINAL : CLASH.BOTH_TERMINAL;";
const A_BC2 = "const isClash = !!(row && (row.verdict === CLASH.BOTH_TERMINAL || row.verdict === CLASH.DIVERGENT)) || terminalHere > 0;";
const A_BC3 = "            scope: 'handoff-only',";
const A_FR1 = "if (!x.hasSource) {";
const A_FR2 = "out.injectable = (policy === POLICY.INJECT) ? out.suggested.slice() : [];";
const A_FR3 = "const known = x.subjects.some((s) => ks.set.indexOf(s) >= 0);";
const A_IDX1 = "return _moduleLib(() => window.LonShaBranchCanon, 'branch-canon.js');";
const A_IDX2 = "return _moduleLib(() => window.LonShaFatedRecall, 'fated-recall.js');";

/* ── 夹具(两模块共用口径:同一位两条终结声明 · 一条未知主体 · 一条无来源) ── */
function canonDeps() {
    return {
        BRANCH_OUTCOMES: [
            { branch: 'b1', collision: 'k1', terminal: true, value: 'A', items: [{ key: 'i1', title: '塔顶', floor: 3 }] },
            { branch: 'b2', collision: 'k1', terminal: true, value: 'B', items: [{ key: 'i2', title: '井底', floor: 5, secret: 'hidden' }] },
            { branch: 'b1', collision: 'k2', terminal: true, value: 'C' },
            { branch: 'b2', slot: 's3', terminal: false, value: 'D' },
            { branch: 'b2', value: 'E' },
        ],
        CONFIRMED_FACTS: {},
        SECRET_BODY_KEYS: ['secret', 'secretText', 'secretBody'],
    };
}
function fatedDeps() {
    return {
        PAST_DETAILS: [
            { key: 'd1', title: '旧地一别', keys: ['place:school'], subjects: ['甲'], text: 'x', source: { ref: 'f3', floor: 3 }, weight: 60, hint: '那年操场上' },
            { key: 'd2', title: '那日的物', keys: ['item:ring'], subjects: ['乙'], text: 'y', source: { ref: 'f9', floor: 9 }, weight: 80 },
            { key: 'd3', title: '无来源', keys: ['place:school'], subjects: ['甲'], text: 'z', weight: 10 },
            { key: 'd4', title: '无主体', keys: ['place:school'], subjects: [], text: 'w', source: { ref: 'f1' } },
        ],
        KNOWN_FACTS: { '甲': ['甲'], '乙': ['乙'] },
        COOLDOWN_DAYS: 3,
    };
}

/* ══════════════ 判据体(纯函数;吃 api / 源码表,返回问题列表) ══════════════ */
/** A. 结构面:导出面逐字 / 冻结 / 依赖面 / 自证。 */
function structureJudge(bc, fr) {
    const P = [];
    /* [v3.342.0 · M4-X3 交棒] 导出面 +14（落卷面：ADOPT 三态 / UNMAPPED 三缺因 /
     *   buildContinuePack / adoptionBrief / revokeGuard / adoptItemOf / adoptableItems /
     *   adoptionLine / adoptProbeDeps / adoptProbePlan / 两张标签与来源表）；既有 32 项逐字不动。 */
    const bcWant = ['ADOPT', 'ADOPT_ITEM_FIELDS', 'ADOPT_KIND', 'ADOPT_LABEL', 'ADOPT_SOURCES', 'BC_KIND', 'BC_VERSION',
        'CLASH', 'DECISION', 'DECISION_LABEL', 'MAX_OUTCOMES', 'PREVIEW', 'PROVENANCE', 'REQUIRED_DEPS',
        'SECRET_BODY_KEYS', 'SECRET_MASK', 'UNMAPPED', 'adoptItemOf', 'adoptProbeDeps', 'adoptProbePlan',
        'adoptableItems', 'adoptionBrief', 'adoptionLine', 'arrOf', 'buildContinuePack', 'clip', 'collisionKeyOf',
        'conflicts', 'describe', 'describePlan', 'entryKeyOf', 'filterByKeeper', 'hash32', 'keyOf', 'line',
        'listOutcomes', 'maskSecretBody', 'numOr', 'outcomeOf', 'planCanon', 'previewHandoff', 'revokeGuard',
        'revokeScopeOf', 'selfCheck', 'setDecision', 'strOf'];
    const gotBc = Object.keys(bc).sort();
    if (gotBc.join(',') !== bcWant.join(',')) P.push('branch-canon 导出面变了:实测 [' + gotBc.join(',') + ']');
    const frWant = ['CANDIDATE', 'DEFAULT_COOLDOWN', 'FR_KIND', 'FR_VERSION', 'KNOWING', 'MAX_CANDIDATES', 'POLICY', 'POLICY_LABEL',
        'REQUIRED_DEPS', 'SECRET_BODY_KEYS', 'SECRET_MASK', 'TRIGGERS', 'TRIGGER_LABEL', 'arrOf', 'clip', 'cooldownOf',
        'describe', 'detailOf', 'entryKeyOf', 'hash32', 'keyOf', 'knowingOf', 'knownSetOf', 'line', 'markShown',
        'maskSecretBody', 'numOr', 'render', 'safe', 'sameValue', 'selfCheck', 'setPolicy', 'strOf', 'suggest', 'triggerKeys'];
    const gotFr = Object.keys(fr).sort();
    if (gotFr.join(',') !== frWant.join(',')) P.push('fated-recall 导出面变了:实测 [' + gotFr.join(',') + ']');
    if (!Object.isFrozen(bc)) P.push('branch-canon 导出面未冻结');
    if (!Object.isFrozen(fr)) P.push('fated-recall 导出面未冻结');
    /* 依赖面键名:与宿主装配点逐字一致(改名 = 静默变成「依赖缺席」)。 */
    if ((bc.REQUIRED_DEPS || []).map((d) => d.key).join(',') !== 'BRANCH_OUTCOMES,CONFIRMED_FACTS,SECRET_BODY_KEYS') {
        P.push('branch-canon 依赖面键名变了:' + (bc.REQUIRED_DEPS || []).map((d) => d.key).join(','));
    }
    if ((fr.REQUIRED_DEPS || []).map((d) => d.key).join(',') !== 'PAST_DETAILS,KNOWN_FACTS,COOLDOWN_DAYS') {
        P.push('fated-recall 依赖面键名变了:' + (fr.REQUIRED_DEPS || []).map((d) => d.key).join(','));
    }
    if (bc.BC_KIND !== 'branch_canon') P.push('BC_KIND 不符:' + bc.BC_KIND);
    if (fr.FR_KIND !== 'fated_recall') P.push('FR_KIND 不符:' + fr.FR_KIND);
    /* 三处同形常量:受限正文键与定长站位串在前序模块里是同一个值。 */
    if (bc.SECRET_BODY_KEYS.join(',') !== 'secret,secretText,secretBody') P.push('branch-canon 受限键面变了');
    if (fr.SECRET_BODY_KEYS.join(',') !== 'secret,secretText,secretBody') P.push('fated-recall 受限键面变了');
    if (bc.SECRET_MASK !== fr.SECRET_MASK) P.push('两模块的定长站位串不同形');
    if (bc.SECRET_MASK.replace(String.fromCharCode(10216), '').replace(String.fromCharCode(10217), '').length === 0) P.push('站位串为空');
    /* 自证(依赖齐备时)与缺格宣报(依赖未给时)。 */
    const s1 = bc.selfCheck(canonDeps());
    if (s1.ok !== true) P.push('branch-canon selfCheck 未过:' + JSON.stringify(s1.note));
    const s2 = fr.selfCheck(fatedDeps());
    if (s2.ok !== true) P.push('fated-recall selfCheck 未过:' + JSON.stringify(s2.note));
    const m1 = bc.selfCheck({});
    if (m1.depsComplete !== false || m1.missing.length !== 3) P.push('branch-canon 缺格宣报不满三格');
    const m2 = fr.selfCheck({});
    if (m2.depsComplete !== false || m2.missing.length !== 3) P.push('fated-recall 缺格宣报不满三格');
    /* 模块级自证探针:四个真探针必须成立(不是对常量自己断言)。 */
    if (s1.bothTerminalBlocked !== true) P.push('自证探针:两条终结声明未判成冲突');
    /* [v3.342.0 · M4-X3] 落卷面七个真探针:形状可接 / 三态不同形 / 未选尽不出包 /
     *   幂等键稳定 / 三缺因具名 / 撤销保护面 / 受限正文不进包。 */
    for (const k of ['adoptShapeOk', 'adoptThreeStates', 'adoptBlockedNoPack', 'adoptIdStable',
        'adoptUnmappedNamed', 'adoptRevokeGuards', 'adoptMaskFixed']) {
        if (s1[k] !== true) P.push('自证探针未成立:' + k);
    }
    if (s1.maskFixedLength !== true) P.push('自证探针:掩码不定长');
    if (s1.revokeTouchesNoBranch !== true) P.push('自证探针:撤销面动了原分支');
    for (const k of ['triggersExhaustive', 'blindByUnknown', 'policyGatesInjection', 'cooldownUnjudgedVisible', 'cooldownAfterMark', 'maskFixedLength']) {
        if (s2[k] !== true) P.push('自证探针未成立:' + k);
    }
    if (s2.judgedFace.ungiven === s2.judgedFace.withScene) P.push('自证探针:情境未给与在场同形');
    return P;
}

/** B. M3-X6 真跑(逐冲突 / 选择 / 交接 / 出处 / 撤销)。 */
function canonJudge(bc) {
    const P = [];
    const deps = canonDeps();
    const snap = JSON.stringify(deps);
    const cf = bc.conflicts(deps);
    /* 1 逐冲突三态:两条终结声明 ⇒ 冲突;单位置但无终结声明 ⇒ none;单条终结 ⇒ single。 */
    const row = (k) => (cf.rows || []).filter((r) => r.key === k)[0] || {};
    if (row('k1').verdict !== 'both-terminal') P.push('k1 两条终结声明未判成 both-terminal,实 ' + row('k1').verdict);
    if (row('b2#s3').verdict !== 'none') P.push('未声明终结的位不应判成冲突,实 ' + row('b2#s3').verdict);
    if (row('k2').verdict !== 'single') P.push('单条终结声明位应判 single,实 ' + row('k2').verdict);
    if (cf.blocked !== 1) P.push('待选冲突位计数不对:' + cf.blocked);
    if (cf.unkeyed !== 1) P.push('无位结局未如实宣报:' + cf.unkeyed);
    if (cf.total !== 5) P.push('结局总数不对:' + cf.total);
    /* 2 两态不许同形:未给清单 ⇒ 未判;空表 ⇒ 查过没有。 */
    if (bc.conflicts({}).judged !== false) P.push('未给结局清单时冲突面应报未判');
    if (bc.conflicts({ BRANCH_OUTCOMES: [] }).judged !== true) P.push('空表应视为「查过、没有」');
    /* 3 选择:未选之前不得交接(两条终结声明位仍在 pending)。 */
    const un = bc.previewHandoff(deps, null, {});
    if (un.ok !== false || un.preview !== 'blocked' || un.pack !== null) P.push('未选定就放行交接:' + JSON.stringify({ ok: un.ok, preview: un.preview, pack: un.pack }));
    if (un.pendingCount !== 2) P.push('未选定读数里的 pending 数不对(两条终结位 + 单位置显式终局位):' + un.pendingCount);
    /* 4 选择之后:canon 至多一条,其余落 excluded 并留痕 why。 */
    const d1 = bc.setDecision(null, { key: 'k1', decision: 'canon', branch: 'b1', note: '选 b1' });
    if (d1.ok !== true || d1.plan.decisions.k1.decision !== 'canon') P.push('置 canon 失败:' + JSON.stringify(d1));
    const pl = bc.planCanon(deps, d1.plan);
    if (pl.chosen.length !== 1 || pl.chosen[0].branch !== 'b1') P.push('canon 未落到指定支线:' + JSON.stringify(pl.chosen));
    const prov = pl.provenance || [];
    if (!prov.some((x) => x.verdict === 'excluded' && x.branch === 'b2' && x.why === 'unselected-sibling')) {
        P.push('未被选中的历史未留痕(unselected-sibling)');
    }
    if (!prov.some((x) => x.verdict === 'excluded' && x.why === 'unkeyed')) P.push('无位结局未留痕');
    if (pl.preview !== 'blocked') P.push('仍有未选终局位时预览应 blocked,实 ' + pl.preview);
    if (pl.pending.length !== 1) P.push('未选终局位应计入 pending(单位置显式终局也要人选定),实 ' + pl.pending.length);
    /* 5 幂等:同档重复置位不改变计划(changed 必须 false;不许悄悄加一条)。 */
    const d1b = bc.setDecision(d1.plan, { key: 'k1', decision: 'canon', branch: 'b1' });
    if (d1b.changed !== false || d1b.reason !== 'noop') P.push('同档重复置位未幂等:' + JSON.stringify({ changed: d1b.changed, reason: d1b.reason }));
    /* 6 并存档:两条都进 coexisted(显式用户选择,不是默认)。 */
    const dc0 = bc.setDecision(null, { key: 'k1', decision: 'coexist', branch: '' });
    const dc = bc.setDecision(dc0.plan, { key: 'k2', decision: 'canon', branch: 'b1' });
    const pc = bc.planCanon(deps, dc.plan);
    if (pc.coexisted.length !== 2) P.push('coexist 未把两条都带上:' + pc.coexisted.length);
    if (pc.pending.length !== 0) P.push('两位选尽后仍有未选位:' + pc.pending.length);
    const ph = bc.previewHandoff(deps, dc.plan, { viewer: 'p1', volumeId: 'v9' });
    if (!ph.pack || ph.pack.branches.length !== 2) P.push('coexist 后交接包未带两条支线');
    /* 7 交接包:秘密权限不扩大 —— 带 secret 的条目走掩码,且不得原样外泄。 */
    const d2a = bc.setDecision(null, { key: 'k1', decision: 'canon', branch: 'b2' });
    const d2 = bc.setDecision(d2a.plan, { key: 'k2', decision: 'canon', branch: 'b1' });
    const ph2 = bc.previewHandoff(deps, d2.plan, { viewer: 'p1' });
    if (!ph2.pack) P.push('两位选尽后交接包不应为 null:' + JSON.stringify(ph2.preview));
    if (ph2.preview !== 'warn') P.push('两位选尽且有未选中项时预览应 warn,实 ' + ph2.preview);
    const leaked = (ph2.pack.entries || []).some((e) => e.secret === 'hidden' || JSON.stringify(e).indexOf('hidden') >= 0);
    if (leaked) P.push('受限正文原样进了交接包(权限被扩大)');
    /* 8 keeper 面:不知情者被挡的条目必须具名,不是静默消失。 */
    const keep = bc.filterByKeeper([{ key: 'a' }, { key: 'b', keeper: ['p2'] }, { key: 'c', keeper: ['p1'] }], 'p1');
    if (keep.kept.length !== 2 || keep.withheld.length !== 1 || keep.withheld[0].why !== 'keeper-denied') {
        P.push('知情过滤面不对:' + JSON.stringify(keep));
    }
    if (bc.filterByKeeper([{ key: 'a' }], '').unknown !== true) P.push('viewer 缺席时知情面应报未判');
    /* 9 撤销范围:只撤本次接续、原分支零写。 */
    const rv = bc.revokeScopeOf(d1.plan, { volumeId: 'v9' });
    if (rv.scope !== 'handoff-only' || rv.branchWrites !== 0 || rv.count !== 1) P.push('撤销范围不对:' + JSON.stringify(rv));
    /* 10 零写:整轮跑完入参一个字节不改。 */
    if (JSON.stringify(deps) !== snap) P.push('判据跑一次就改了调用方载荷(必须零写)');
    return P;
}

/** C. M3-X8 真跑(触发 / 冷却 / 知情 / 策略 / 情绪只读)。 */
function fatedJudge(fr) {
    const P = [];
    const deps = fatedDeps();
    const snap = JSON.stringify(deps);
    /* 1 触发四类穷尽:四个真情境各一,产出集合恰好等于词表。 */
    const probes = [
        fr.triggerKeys({ place: 'p' }), fr.triggerKeys({ date: 7 }),
        fr.triggerKeys({ item: 'i' }), fr.triggerKeys({ person: 'who' }),
    ];
    const kinds = [];
    for (const pr of probes) for (const k of pr.keys) if (kinds.indexOf(k.kind) < 0) kinds.push(k.kind);
    if (kinds.length !== fr.TRIGGERS.length) P.push('触发四类不穷尽:' + kinds.join(','));
    if (kinds.some((k) => fr.TRIGGERS.indexOf(k) < 0)) P.push('触发出了词表外的类:' + kinds.join(','));
    /* 2 情境未给 ⇒ 未判(不是「没有旧事」)。 */
    const none = fr.suggest(deps, {}, { actor: '甲', day: 1 });
    if (none.judged !== false) P.push('未给情境时应报未判');
    if ((none.suggested || []).length !== 0) P.push('未给情境却出了建议');
    /* 3 命中 + 知情 + 有来源 ⇒ 出建议;无来源 / 无主体一律不出。 */
    const r = fr.suggest(deps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, policy: 'inject' });
    if (r.judged !== true) P.push('情境与依赖齐备时应判');
    if (r.suggested.length !== 1 || r.suggested[0].detailKey !== 'd1') P.push('建议面不对:' + JSON.stringify(r.suggested.map((x) => x.detailKey)));
    if (!r.noSource.some((x) => x.detailKey === 'd3')) P.push('无来源候选未单独成档(不许隐去来源后照样出建议)');
    if (!r.blind.some((x) => x.detailKey === 'd4' && x.knowing === 'unknown-side')) P.push('无主体候选未进知情挡档');
    /* 4 知情面正交集:主体不在该角色知情名单 ⇒ 一律不唤回。 */
    const other = fr.suggest(deps, {}, { scene: { item: 'ring' }, actor: '甲', day: 10 });
    if (other.suggested.length !== 0) P.push('角色不知情的旧事被建议了(替角色回忆)');
    if (!other.blind.some((x) => x.detailKey === 'd2')) P.push('不知情候选未具名进 blind');
    /* 5 知情名单缺失 / 该角色无记录 ⇒ 未判,且不放行。 */
    const noKf = fr.suggest({ PAST_DETAILS: deps.PAST_DETAILS, COOLDOWN_DAYS: 3 }, {}, { scene: { place: 'school' }, actor: '甲', day: 10 });
    if (noKf.suggested.length !== 0) P.push('知情名单缺席时仍出了建议');
    if (!noKf.blind.length) P.push('知情名单缺席未具名宣报');
    /* 6 冷却:窗口未给 ⇒ 未判但建议照出(不许读成无冷却);给了窗口且已展示 ⇒ 落 cooled。 */
    const noWin = fr.suggest({ PAST_DETAILS: deps.PAST_DETAILS, KNOWN_FACTS: deps.KNOWN_FACTS }, {}, { scene: { place: 'school' }, actor: '甲', day: 10 });
    if (noWin.suggested.length !== 1) P.push('冷却窗口缺席时建议不该消失');
    if (noWin.suggested[0].cooldownJudged !== false || noWin.cooldownUnjudged.length !== 1) P.push('冷却未判未随条目带走');
    /* ★ 未判读数只对**过了来源面与知情面**的候选登记:被挡掉的候选谈不到「该不该重复提」。 */
    if (noWin.cooldownUnjudged.some((x) => x.detailKey !== 'd1')) P.push('冷却未判登记面混进了被挡候选');
    const st = fr.markShown({}, { triggerKey: 'place:school', detailKey: 'd1', day: 10 });
    if (st.ok !== true || st.changed !== true) P.push('展示登记失败:' + JSON.stringify(st));
    const st2 = fr.markShown(st.state, { triggerKey: 'place:school', detailKey: 'd1', day: 10 });
    if (st2.changed !== false) P.push('同日同情境重复登记未幂等');
    const r2 = fr.suggest(deps, st.state, { scene: { place: 'school' }, actor: '甲', day: 11 });
    if (r2.suggested.length !== 0 || !r2.cooled.some((x) => x.detailKey === 'd1')) P.push('冷却窗口内未挡住重复建议');
    const r3 = fr.suggest(deps, st.state, { scene: { place: 'school' }, actor: '甲', day: 20 });
    if (r3.suggested.length !== 1) P.push('冷却窗口之外应可再次建议');
    /* 7 策略三态:off / hint-only 的可注入面**恒为 0**,而建议仍出。 */
    for (const pol of ['off', 'hint-only']) {
        const rr = fr.suggest(deps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, policy: pol });
        if (rr.policy !== pol) P.push('策略未生效:' + pol + ' -> ' + rr.policy);
        if (rr.injectable.length !== 0) P.push('策略 ' + pol + ' 下仍可注入(关停面失效)');
        if (rr.suggested.length !== 1) P.push('策略 ' + pol + ' 下建议不该消失');
        if (!rr.note) P.push('策略 ' + pol + ' 未在读数里自述');
    }
    if (fr.setPolicy('nope').ok !== false || fr.setPolicy('off').policy !== 'off') P.push('策略白名单不对');
    /* 8 情绪**只读**回显:既不改写建议,也不据情绪强制重现。 */
    const neg = fr.suggest(deps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, emotion: 'sad' });
    if (neg.emotion !== 'sad') P.push('情绪未原样回显');
    if (neg.emotionUsed !== false) P.push('情绪被当成判据用了(负面情绪不得强制回忆好事)');
    if (neg.suggested.length !== r.suggested.length || neg.injectable.length !== r.injectable.length) P.push('情绪改变了候选面(必须只读)');
    /* 9 渲染:只给建议与来源;未判时明写未判;空建议渲染为空串(不编内容)。 */
    const txt = fr.render(r);
    if (!txt || txt.indexOf('旧地一别') < 0) P.push('渲染缺建议内容');
    if (txt.indexOf('hidden') >= 0) P.push('渲染漏了受限正文');
    if (fr.render({ judged: true, suggested: [], cooled: [], blind: [] }) !== '') P.push('空建议必须渲染为空串');
    if (fr.render({ judged: false, reasons: ['no-trigger'], suggested: [] }).indexOf('未判') < 0) P.push('未判时渲染须明写未判');
    /* 10 零写:整轮跑完入参一个字节不改。 */
    if (JSON.stringify(deps) !== snap) P.push('判据跑一次就改了调用方载荷(必须零写)');
    return P;
}

/** D. 零写与不抛(两模块共用)。 */
function hygieneJudge() {
    const P = [];
    const bad = [];
    /* 1 模块实现体不得 seek 宿主状态(this.* / window.* 读宿主对象)。 */
    for (const [name, src] of [['branch-canon.js', BC_SRC], ['fated-recall.js', FR_SRC]]) {
        if (/this\.(worldProg|graph|config|engine|summary|vector|scene)/.test(src)) bad.push(name + ' 读了宿主 this');
        if (/window\.(LonSha(?!BranchCanon|FatedRecall))/.test(src)) bad.push(name + ' 读了别的模块全局');
        if (src.indexOf('localStorage') >= 0) bad.push(name + ' 出现 localStorage(零依赖/离线纪律)');
        if (/fetch\(|XMLHttpRequest\(/.test(src)) bad.push(name + ' 出现网络调用');
    }
    P.push(...bad);
    /* 2 畸形入参一律不抛(退化为可读降级读数)。 */
    const weird = [undefined, null, 0, '', 'x', [], [{}], { a: 1 }, { BRANCH_OUTCOMES: 'nope' }, { BRANCH_OUTCOMES: [null, 5, 'x'] }];
    for (const w of weird) {
        try { BC.conflicts(w); BC.listOutcomes(w); BC.planCanon(w, null); BC.previewHandoff(w, null); }
        catch (e) { P.push('branch-canon 遇畸形入参抛了:' + String(e && e.message)); break; }
    }
    const weird2 = [undefined, null, 0, '', 'x', [], [{}], { a: 1 }, { PAST_DETAILS: 'nope', KNOWN_FACTS: 5 }, { scene: 'x' }];
    for (const w of weird2) {
        try {
            FR.suggest(w, null, null); FR.suggest(w, {}, { scene: w }); FR.detailOf(w);
            FR.markShown(w, null); FR.cooldownOf(w, {}, null, null, null); FR.knownSetOf(w, null);
        } catch (e) { P.push('fated-recall 遇畸形入参抛了:' + String(e && e.message)); break; }
    }
    /* 3 空串键不许当「同一个位」用(collisionKeyOf 三档迥异)。 */
    if (BC.collisionKeyOf({}) !== '') P.push('无位结局必须返回空键(不许现编)');
    if (BC.collisionKeyOf({ slot: 's', branch: 'b' }) !== 'b#s') P.push('退化位键拼法不对');
    if (BC.collisionKeyOf({ collision: 'c', slot: 's', branch: 'b' }) !== 'c') P.push('显式 collision 必须优先');
    return P;
}

/** E. 宿主接线。 */
function hostJudge(idx, mf) {
    const P = [];
    if (idx.split(A_IDX1).length - 1 !== 1) P.push('取库口(branch-canon)须恰一处');
    if (idx.split(A_IDX2).length - 1 !== 1) P.push('取库口(fated-recall)须恰一处');
    /* 装配面键名:与模块 REQUIRED_DEPS 逐字一致(改名 = 静默变成「依赖缺席」)。 */
    for (const k of ['BRANCH_OUTCOMES', 'CONFIRMED_FACTS', 'SECRET_BODY_KEYS', 'PAST_DETAILS', 'KNOWN_FACTS', 'COOLDOWN_DAYS']) {
        if (idx.indexOf(k + ':') < 0) P.push('宿主装配面缺键 ' + k);
    }
    /* 出口齐全(两个面各九项,含两条诊断行)。 */
    for (const m of ['branchCanonState', 'branchCanonDecide', 'branchCanonPlan', 'branchCanonPreview', 'branchCanonRevoke',
        'branchCanonDescribe', 'branchCanonLine', 'fatedRecallSuggest', 'fatedRecallMark', 'fatedRecallRender',
        'fatedRecallDescribe', 'fatedRecallLine']) {
        if (idx.indexOf(m + '(') < 0) P.push('宿主导出缺 ' + m);
    }
    /* 转发不改写:两处 describe 都必须把 reason 透传/标注,不得吞掉。 */
    if (idx.indexOf("d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';") < 0) P.push('自述未标 deps-missing');
    /* 诊断两行 + 中文人读面。 */
    if (idx.indexOf("rows.push(['支线正史', this.branchCanonLine()])") < 0) P.push('自检缺「支线正史」行');
    if (idx.indexOf("rows.push(['旧事重现', this.fatedRecallLine()])") < 0) P.push('自检缺「旧事重现」行');
    if (idx.indexOf('模块未加载(branch-canon.js;哪条算数不得而知)') < 0) P.push('人读面须中文与半句(支线正史)');
    if (idx.indexOf('模块未加载(fated-recall.js;该不该提醒不得而知)') < 0) P.push('人读面须中文与半句(旧事重现)');
    /* 登记面。 */
    if (mf.extra_js.filter((x) => x === 'branch-canon.js').length !== 1) P.push('extra_js 登记 branch-canon.js 恰一次');
    if (mf.extra_js.filter((x) => x === 'fated-recall.js').length !== 1) P.push('extra_js 登记 fated-recall.js 恰一次');
    if (mf.extra_js[0] !== 'ledger-entity.js') P.push('ledger-entity.js 仍须在 extra_js 首位');
    if (new Set(mf.extra_js).size !== mf.extra_js.length) P.push('extra_js 不得重复');
    /* 内联实现残留为零:模块内标识不得在宿主里出现(两份实现必然漂)。 */
    for (const s of ['DECISION_LABEL[', 'TRIGGER_LABEL[', 'POLICY_LABEL[', 'SECRET_MASK', 'CLASH.', 'PROVENANCE.', 'COLLISION']) {
        if (idx.indexOf(s) >= 0) P.push('内联实现残留:' + s);
    }
    /* 零写纪律:宿主不得把分支写指令藏在本面里。 */
    if (idx.indexOf('handoff-only') >= 0) P.push('宿主内联了撤销范围字面量(必须由内核产出)');
    return P;
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3328 A1. ★★★★ 两模块结构面:导出面逐字对账 / 冻结 / 依赖面键名 / 自证与六探针', () => {
    assert.deepEqual(structureJudge(BC, FR), [], '结构面');
    ok('branch-canon 32 项导出 / fated-recall 35 项导出,键名与宿主装配点逐字对齐,六探针全成立');
});

/* ══════════════ B. M3-X6 真跑 ══════════════ */
test('v3328 B1. ★★★★ M3-X6 逐冲突三态 + 两条终结声明不得同时成立 + 未选不得交接', () => {
    assert.deepEqual(canonJudge(BC), [], 'M3-X6');
    ok('same 位两条终结 ⇒ both-terminal 且未选即 blocked;单条 ⇒ single;未声明 ⇒ none;无位如实宣报');
});
test('v3328 B2. ★★★ M3-X6 未被选中的历史必须留痕 + 秘密权限不扩大', () => {
    const deps = canonDeps();
    const p1 = BC.setDecision(null, { key: 'k1', decision: 'canon', branch: 'b2' }).plan;
    const plan = BC.setDecision(p1, { key: 'k2', decision: 'exclude', branch: '' }).plan;
    const ph = BC.previewHandoff(deps, plan, { viewer: 'p1' });
    const prov = BC.planCanon(deps, plan).provenance;
    assert.ok(prov.some((x) => x.why === 'unselected-sibling'), '未选中项须带 why');
    assert.equal(JSON.stringify(ph.pack).indexOf('hidden'), -1, '受限正文不得原样进交接包');
    assert.equal(ph.pack.withheldCount, 0, 'keeper 缺失的条目随条目走');
    ok('出处清单覆盖每条结局;交接包内受限正文已掩');
});
test('v3328 B3. ★★★ M3-X6 撤销只撤本次接续:原分支零写', () => {
    const plan = BC.setDecision(null, { key: 'k1', decision: 'canon', branch: 'b1' }).plan;
    const rv = BC.revokeScopeOf(plan, { volumeId: 'v9' });
    assert.equal(rv.scope, 'handoff-only');
    assert.equal(rv.branchWrites, 0, '撤销面不得产生任何分支写');
    assert.deepEqual(rv.keys, ['k1']);
    ok('撤销范围 handoff-only · branchWrites 0 · 不吃原分支');
});

/* ══════════════ C. M3-X8 真跑 ══════════════ */
test('v3328 C1. ★★★★ M3-X8 触发四类穷尽 + 冷却窗口 + 策略三态(off/hint 可注入恒 0)', () => {
    assert.deepEqual(fatedJudge(FR), [], 'M3-X8');
    ok('四类触发各可达;窗口内重复被冷却、窗口外可再提;off/hint-only 下可注入恒 0 而建议照出');
});
test('v3328 C2. ★★★★ M3-X8 不唤回角色未知内容(判据是正交集)', () => {
    const deps = fatedDeps();
    const r = FR.suggest(deps, {}, { scene: { item: 'ring' }, actor: '甲', day: 10 });
    assert.equal(r.suggested.length, 0, '不知情内容一律不出建议');
    assert.ok(r.blind.some((x) => x.detailKey === 'd2' && x.knowing === 'unknown-side'), '须具名进 blind');
    const noKf = FR.suggest({ PAST_DETAILS: deps.PAST_DETAILS, COOLDOWN_DAYS: 3 }, {}, { scene: { place: 'school' }, actor: '甲', day: 10 });
    assert.equal(noKf.suggested.length, 0, '知情名单缺席时不得放行');
    ok('未知 / 未判 / 无主体三态均不放行,且各自具名');
});
test('v3328 C3. ★★★ M3-X8 情绪只读 + 无来源不出建议 + 空建议渲染为空串', () => {
    const deps = fatedDeps();
    const a = FR.suggest(deps, {}, { scene: { place: 'school' }, actor: '甲', day: 10 });
    const b = FR.suggest(deps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, emotion: 'sad' });
    assert.equal(b.emotion, 'sad');
    assert.equal(b.emotionUsed, false, '情绪不得被当判据');
    assert.equal(a.suggested.length, b.suggested.length, '情绪不得改变候选面');
    assert.ok(a.noSource.some((x) => x.detailKey === 'd3'), '无来源候选须单独成档');
    assert.equal(FR.render({ judged: true, suggested: [], cooled: [], blind: [] }), '', '空建议渲染为空串');
    ok('情绪只读回显;无来源不出建议;渲染不编内容');
});

/* ══════════════ D. 零写与不抛 ══════════════ */
test('v3328 D1. ★★★ 零写与不抛:入参一个字节不改;两模块不 seek 宿主状态;畸形入参零抛', () => {
    assert.deepEqual(hygieneJudge(), [], '零写与不抛');
    ok('两模块无 localStorage / 无网络 / 不读宿主 this;十档畸形入参零抛');
});
test('v3328 D2. ★★★ 离线自述为真:两模块都不落盘、不建库、不自建常驻代理', () => {
    for (const [name, api] of [['branch-canon', BC.selfCheck(canonDeps())], ['fated-recall', FR.selfCheck(fatedDeps())]]) {
        assert.equal(api.offline, true, name + ' 须自述离线');
        assert.equal(api.writesNothing, true, name + ' 须自述零写');
    }
    ok('两模块 selfCheck 自述 offline / writesNothing 为真');
});

/* ══════════════ E. 宿主接线 ══════════════ */
test('v3328 E1. ★★★★ 宿主接线:两取库口 / 装配面键名 / 出口齐全 / 诊断两行 / 登记面 / 内联残留为零', () => {
    assert.deepEqual(hostJudge(IDX, MF), [], '宿主接线');
    ok('两取库口各一处;六键装配面逐字对齐;十二项出口在位;两诊断行中文;内联残留为零');
});
test('v3328 E2. ★★★ 宿主不得自己算:四条降级面同键且不冒充结论', () => {
    for (const s of ['_branchCanonAbsent', '_fatedRecallAbsent']) {
        assert.ok(IDX.indexOf(s + '(') >= 0, '缺降级面 ' + s);
    }
    assert.ok(IDX.indexOf('不得而知') >= 0, '降级串须说清「不得而知」的那一面');
    const absentKinds = IDX.split('_branchCanonAbsent(').length - 1 + IDX.split('_fatedRecallAbsent(').length - 1;
    assert.ok(absentKinds >= 10, '降级面调用点太少(实 ' + absentKinds + ')');
    ok('两处同键降级面在位,且都写明「不报什么」');
});
test('v3328 E3. ★★★ 分发面:两模块各登记一次,模块内标识在宿主一个都搜不到', () => {
    assert.equal(MF.extra_js.length, 107, '分发面长度(v3.328.0 F 包两支 + v3.340.0 M4-X4 qa-thread.js)');
    assert.equal(MF.extra_js.filter((x) => x === 'branch-canon.js').length, 1);
    assert.equal(MF.extra_js.filter((x) => x === 'fated-recall.js').length, 1);
    /* 末两项按加载序位于分发面末尾(本版新模块)。 */
    assert.deepEqual(MF.extra_js.slice(-2), ['fated-recall.js', 'qa-thread.js']);
    /* 模块内标识在宿主里零命中(宿主只转发,不复制实现)。 */
    const leaks = ['SECRET_MASK', 'TRIGGER_LABEL', 'DECISION_LABEL', 'CLASH.', 'PROVENANCE.'].filter((x) => IDX.indexOf(x) >= 0);
    assert.deepEqual(leaks, [], '宿主内联了模块标识:' + leaks.join(','));
    ok('分发面 ' + MF.extra_js.length + ' 项,两模块各一次且位于末尾');
});

/* ══════════════ F. 真源码破坏负控制 ══════════════ */
test('v3328 F1. ★★★★ 破坏「两条终结声明同时成立」判定 ⇒ 冲突面当场现形', () => {
    const broken = breakOnce(BC_SRC, A_BC1, 'verdict = CLASH.SINGLE;', 'F1');
    assert.notDeepEqual(canonJudge(loadIIFE(broken, 'LonShaBranchCanon')), [], '两条终结同立漏报必须翻红');
    assert.deepEqual(canonJudge(BC), [], '原版上同判据必须真成立');
    ok('负控制成立:两条结局同立被读成单条即红');
});
test('v3328 F2. ★★★★ 破坏「未选不得交接」⇒ 未选位放行当场现形', () => {
    const broken = breakOnce(BC_SRC, A_BC2, 'const isClash = false;', 'F2');
    assert.notDeepEqual(canonJudge(loadIIFE(broken, 'LonShaBranchCanon')), [], '未选位放行必须翻红');
    assert.deepEqual(canonJudge(BC), [], '原版上同判据必须真成立');
    ok('负控制成立:pending 被抹即红');
});
test('v3328 F3. ★★★ 破坏撤销范围语义 ⇒ 撤销不改原分支当场现形', () => {
    const broken = breakOnce(BC_SRC, A_BC3, '            scope: \'branch-write\',', 'F3');
    assert.notDeepEqual(canonJudge(loadIIFE(broken, 'LonShaBranchCanon')), [], '撤销面动原分支必须翻红');
    assert.deepEqual(canonJudge(BC), [], '原版上同判据必须真成立');
    ok('负控制成立:撤销范围变成分支写即红');
});
test('v3328 F4. ★★★★ 破坏「无来源不出建议」⇒ 来源面漏网当场现形', () => {
    const broken = breakOnce(FR_SRC, A_FR1, 'if (false) {', 'F4');
    assert.notDeepEqual(fatedJudge(loadIIFE(broken, 'LonShaFatedRecall')), [], '无来源候选漏报必须翻红');
    assert.deepEqual(fatedJudge(FR), [], '原版上同判据必须真成立');
    ok('负控制成立:无来源候选混进建议即红');
});
test('v3328 F5. ★★★★ 破坏策略门(hint-only)⇒ 关停面失效当场现形', () => {
    const broken = breakOnce(FR_SRC, A_FR2, 'out.injectable = out.suggested.slice();', 'F5');
    assert.notDeepEqual(fatedJudge(loadIIFE(broken, 'LonShaFatedRecall')), [], 'hint-only 仍注入必须翻红');
    assert.deepEqual(fatedJudge(FR), [], '原版上同判据必须真成立');
    ok('负控制成立:hint-only 下可注入非 0 即红');
});
test('v3328 F6. ★★★★ 破坏知情面正交集 ⇒ 替角色回忆当场现形', () => {
    const broken = breakOnce(FR_SRC, A_FR3, 'const known = true;', 'F6');
    assert.notDeepEqual(fatedJudge(loadIIFE(broken, 'LonShaFatedRecall')), [], '角色未知内容被唤回必须翻红');
    assert.deepEqual(fatedJudge(FR), [], '原版上同判据必须真成立');
    ok('负控制成立:知情面短路即红');
});
test('v3328 F7. ★★★ 破坏宿主取库口(branch-canon)⇒ 接线判据当场现形', () => {
    const broken = breakOnce(IDX, A_IDX1, 'return null;', 'F7');
    assert.notDeepEqual(hostJudge(broken, MF), [], '取库口被拿掉必须翻红');
    assert.deepEqual(hostJudge(IDX, MF), [], '原版上同判据必须真成立');
    ok('负控制成立:取库口消失即红');
});
test('v3328 F8. ★★★ 破坏宿主取库口(fated-recall)⇒ 接线判据当场现形', () => {
    const broken = breakOnce(IDX, A_IDX2, 'return null;', 'F8');
    assert.notDeepEqual(hostJudge(broken, MF), [], '取库口被拿掉必须翻红');
    assert.deepEqual(hostJudge(IDX, MF), [], '原版上同判据必须真成立');
    ok('负控制成立:取库口消失即红');
});

/* ══════════════ G. H5 判据纯度 + H6 工具两向自证 ══════════════ */
test('v3328 G1. ★★★ H5 判据纯度:每个负控制锚在本档里各自只出现 1 次', () => {
    const anchors = { A_BC1, A_BC2, A_BC3, A_FR1, A_FR2, A_FR3, A_IDX1, A_IDX2 };
    const bad = [];
    for (const [k, v] of Object.entries(anchors)) {
        const n = SELF.split(v).length - 1;
        if (n !== 1) bad.push(k + ' 出现 ' + n + ' 次');
    }
    assert.deepEqual(bad, [], '锚点在判据体内不得被逐字复述(两处各写一份 ⇒ 改一处漏一处会恒过)');
    ok('八个锚点各恰出现 1 次');
});
test('v3328 G2. ★★★ H6 工具两向自证:打偏 / 同值替换都必须被 breakOnce 拒绝', () => {
    assert.throws(() => breakOnce(BC_SRC, 'thisAnchorDoesNotExist' + 'Anywhere', 'x', 'G2'), /拒绝破坏/, '打偏必须拒');
    assert.throws(() => breakOnce(BC_SRC, A_BC1, A_BC1, 'G2'), /必须真的改变源码/, '同值替换必须拒');
    assert.notEqual(breakOnce(BC_SRC, A_BC1, 'verdict = CLASH.SINGLE;', 'G2'), BC_SRC, '真锚点必须真改');
    ok('0 命中 / 同值两形态均被拒,真锚点可用');
});

/* ══════════════ H. 自防护 + 六源同源 + 当版锚 ══════════════ */
test('v3328 H1. ★★★ 自防护:档头诚实边界与八锚列表在位;六源同源;当版锚 v' + BORN, () => {
    assert.ok(SELF.indexOf('诚实边界') >= 0, '档头须写明不判的两条');
    assert.ok(SELF.indexOf('真源码破坏') >= 0, '档头须写明负控制形态');
    assert.equal(vnum(BORN), 3328000, '当版锚必须住在当版档案里');
    const idxV = (IDX.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN), 'index VERSION >= born (got ' + idxV + ')');
    assert.ok(vnum(PKG.version) >= vnum(BORN), 'package.json >= born (got ' + PKG.version + ')');
    assert.ok(vnum(MF.version) >= vnum(BORN), 'manifest.json >= born (got ' + MF.version + ')');
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        assert.ok(read(f).indexOf("= '" + idxV + "'") >= 0, f + ' version not synced to host VERSION (six-source)');
    }
    ok('自防护 / 六源同源 / 当版锚 v' + BORN);
});
