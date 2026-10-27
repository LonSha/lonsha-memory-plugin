/* ============================================================
 * tests/v3370_m4o7_evidence_protect.test.mjs — v3.337.0 · M4-O7
 * 长期压缩与遗忘保住不可替代证据
 *
 * 【本档要证明的(验收原文拆三条)】
 *   a) 人工可核的长篇样本经过多次摘要与 3 轮容量回收,首段埋入的约定/金额/原话
 *      仍能回源 —— 落点:stm-ltm LTM 滚动不再连 salient 带体一起丢(前移到存活条目),
 *      且 lookupSalient 能查回;
 *   b) 已撤回事实不因保留策略复活 —— 落点:宿主证据判定器 `revoked === true` 明确不保,
 *      容量删除照删(判据在 memory-gc 模块层 + 宿主层各证一次);
 *   c) 容量不足明确降级,不静默无限增库 —— 落点:保护预算用尽 ⇒ overBudget 计数可见,
 *      被降级的仍删除(主库不无限膨胀),且证据读数被宿主 `_lastGcEvidence` 收账。
 *
 * 【判据分层(每面独立证伪)】
 *   A 模块层(memory-gc.js):evidenceScreen 三态 / capByForgetValue 保护与降级 /
 *     capSummaries 保护 / orphanOpsOf 保护 / runGc 证据汇总读数
 *   B stm-ltm 层:LTM 滚动 salient 前移 / 落账 salientCarriedOver / lookupSalient 可回源 /
 *     selfReport 计数
 *   C 宿主层:index.js 判定器(revoked 不保 / pinned 保 / 文本特征保)+ _lastGcEvidence 收账 +
 *     getDegradationLedger 并入 overBudget
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 破坏副本上重跑同款判据 → 必须现形;
 *   原版同判据必须通过。
 *
 * 【当版锚点】BORN + vnum(必须住在当版档案里,供版本守卫 V4 计数)。
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

const GC_SRC = read('memory-gc.js');
const STM_SRC = read('stm-ltm.js');
const IDX = read('index.js');
const SELF_REL = path.join('tests', 'v3370_m4o7_evidence_protect.test.mjs');
const SELF = read(SELF_REL);

/** 与生产同形地在隔离 vm 里加载 IIFE 模块。 */
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
const GC = loadIIFE(GC_SRC, 'LonShaMemoryGc');
/** stm-ltm.js 是模块语法(非 IIFE 浏览器全局),用 require 直载。 */
const { createRequire } = await import('node:module');
const require_ = createRequire(import.meta.url);
const STM = require_(path.join(R, 'stm-ltm.js'));

/* ══════════════ 判据体(纯函数) ══════════════ */

/** A 模块层:证据保护筛三态 + 容量路保护/降级。 */
function moduleJudge(gc) {
    const P = [];
    const now = 1e12;
    /* A1 evidenceScreen 三态:judge 缺席 ⇒ 全部可删(逐字旧行为) */
    const cand = [{ item: { text: 'x' }, order: 0 }, { item: { text: 'y' }, order: 1 }];
    const noJ = gc.evidenceScreen(cand, null, 8);
    if (noJ.deletable.length !== 2 || noJ.protectedCount !== 0) P.push('judge 缺席须逐字旧行为(全部可删)');
    /* A2 judge 判 keep ⇒ 保住;超预算 ⇒ overBudget */
    const keepX = (it) => it.text === 'x' ? { keep: true, rank: 9, reason: 'promise' } : null;
    const ok1 = gc.evidenceScreen(cand, keepX, 1);
    if (ok1.protectedCount !== 1 || ok1.overBudget !== 0) P.push('预算内保护计数错:' + JSON.stringify(ok1));
    if (!ok1.protected.some((x) => x.text === 'x')) P.push('被判 keep 的条目没被保住');
    const over = gc.evidenceScreen(cand, keepX, 0);
    if (over.overBudget !== 1 || over.protectedCount !== 0) P.push('预算 0 ⇒ 想保没额度须计 overBudget:' + JSON.stringify(over));
    /* A3 capByForgetValue:带 judge 时唯一证据保住 ⇒ 主库略超上限;预算 0 ⇒ 降级删 */
    const vs = [];
    for (let i = 0; i < 12; i++) vs.push({ text: 'v' + i, timestamp: now - i * 3600000, importance: 1, accessCount: 0 });
    const jv = (v) => v.text === 'v11' ? { keep: true, rank: 99, reason: 'promise-open' } : null;
    const r2 = gc.capByForgetValue(vs, 3, now, jv, 8);
    if (r2.cut !== 8) P.push('唯一证据被保时 cut 应减去保护数:' + r2.cut);
    if (!r2.vectors.some((v) => v.text === 'v11')) P.push('被判 keep 的向量没保住');
    if (r2.evidence.protectedCount !== 1) P.push('向量保护读数错:' + r2.evidence.protectedCount);
    const r3 = gc.capByForgetValue(vs, 3, now, jv, 0);
    if (r3.cut !== 9 || r3.evidence.overBudget !== 1) P.push('预算 0 须降级删除(想保没额度要看得见)');
    /* A4 capSummaries:折叠摘要自身是唯一载体时可保 */
    const sums = [];
    for (let i = 0; i < 6; i++) sums.push({ floor: i, folded: true, text: 'sum' + i });
    /* 判 floor 0:它必在「候选删除集」(foldable=4 取前 4 条即 floor 0..3)内 ——
     *   保护判定只对候选删除集工作,judge 看得到它才算数。 */
    const js = (s) => s.floor === 0 ? { keep: true, rank: 10, reason: 'identity-turn' } : null;
    const r4 = gc.capSummaries(sums, 2, js, 4);
    if (r4.removed !== 3 || !r4.summaries.some((s) => s.floor === 0)) P.push('摘要保护失败(保护后 removed 应 3):' + JSON.stringify(r4));
    /* A5 orphanOpsOf:fp 判废但唯一载体可保 */
    const ro = gc.orphanOpsOf([{ fp: 'dead', floor: 999 }], [], () => '', (x) => x.length,
        (o) => o && o.fp === 'dead' ? { keep: true, rank: 50, reason: 'user-keep' } : null, 2);
    if (ro.dropped !== 0 || !ro.ops.some((o) => o.fp === 'dead')) P.push('孤儿 ops 保护失败:' + JSON.stringify(ro));
    /* A6 runGc 证据汇总读数:judged 计数 + byRoute 分路 */
    /* 注意:孤儿路要真正触发判定须给**非空 chat**(空 chat 走「读不到 ⇒ 不动」短路,
     *   那是另一条既定行为,不参与本判据)。 */
    const r6 = gc.runGc({
        vectors: vs, vectorMaxCount: 3, nowMs: now, evidenceJudgeVec: jv, protectBudgetVec: 8,
        summarySummaries: sums, summaryMaxCount: 2, evidenceJudgeSum: js, protectBudgetSum: 4,
        itemOps: [{ fp: 'dead', floor: 1 }], chat: [{ is_user: false, mes: 'live', send_date: '2026-01-01' }],
        msgFpOf: () => 'fp:live', hash32: (x) => String(x).length,
        evidenceJudgeOps: (o) => o && o.fp === 'dead' ? { keep: true, rank: 50, reason: 'user-keep' } : null, protectBudgetOps: 2,
        graphNodes: new Map(), graphEdges: new Map(), normalizeName: (s) => String(s || ''),
    });
    if (r6.evidence.judged !== 3) P.push('judged(注入过判定器的路数)应为 3:' + r6.evidence.judged);
    if (r6.evidence.protectedTotal !== 3) P.push('protectedTotal 应为 3(三路各保 1):' + r6.evidence.protectedTotal);
    if (r6.evidence.byRoute.vecCap.protected !== 1 || r6.evidence.byRoute.sumCap.protected !== 1
        || r6.evidence.byRoute.orphanOps.protected !== 1) P.push('byRoute 分路读数错:' + JSON.stringify(r6.evidence.byRoute));
    return P;
}

/** B stm-ltm 层:LTM 滚动 salient 前移 + 回源 + 落账。 */
async function stmLtmJudge(stm) {
    const P = [];
    let s = stm.normalizeState(null);
    s.ltm_entries = [];
    for (let k = 0; k < 24; k++) s.ltm_entries.push({ id: 'ltm_' + (k + 1), summary: '旧摘要' + k, salient: [], ts: 1000 + k, recoverable: true });
    // 首条 LTM 携带关键保底句(约定/金额/原话) —— 它是「首段证据」的载体
    s.ltm_entries[0].salient = ['约定三天后还书', '欠款 500 元', '「明天一定还你」'];
    s.ltm_entries[0].summary = '首段摘要:约定三天后还书,欠款 500 元,「明天一定还你」';
    // 触发一次 STM 溢出 → rollover → LTM 25 条 → 滚动丢最旧(带 salient 的)
    s.stm_entries = [];
    for (let k = 0; k < 40; k++) s.stm_entries.push({ id: 'stm_' + k, text: '第' + k + '条剧情', msg_ids: [k], floors: [k], ts: 2000 + k, salient: [] });
    s.unconsolidated_stm = [{ text: '她答应明天把钱还我', msg_id: 999, floor: 999 }];
    const out = await stm.consolidate(s, { summarize: () => Promise.resolve('AI摘要'), force: true });
    const o = out.state;
    // B1 滚动丢 1 条且保底句前移
    if (o.ltm_entries.length !== 24) P.push('LTM 滚动后应保持 24 条:' + o.ltm_entries.length);
    if (Number(o.loss.salientCarriedOver) < 3) P.push('salientCarriedOver 应 ≥3(三条保底句被前移):' + o.loss.salientCarriedOver);
    // B2 三句仍可回源
    const all = o.ltm_entries.flatMap((e) => Array.isArray(e.salient) ? e.salient : []);
    for (const phrase of ['约定三天后还书', '欠款 500 元', '「明天一定还你」']) {
        if (!all.includes(phrase)) P.push('保底句丢了:' + phrase);
    }
    // B3 lookupSalient 可查回
    const lk = stm.lookupSalient(o, ['约定']);
    if (!lk || lk.count < 1 || !lk.hits.some((h) => h.matched.some((t) => t.includes('约定三天后还书')))) {
        P.push('lookupSalient 查不回前移的保底句:');
    }
    // B4 selfReport 计数可见
    const rep = stm.selfReport(o);
    if (Number(rep.counters.salientCarriedOver) < 3) P.push('selfReport.counter 未报 salientCarriedOver');
    return P;
}

/** C 宿主层:判定器 revoked 不保 / pinned 保 / 文本特征保 + 收账。 */
function hostJudge(idx) {
    const P = [];
    /* C1 判定器必须存在且含「撤回不保」分支 */
    /* [v3.421.0] 窗口 2400 → 2800：本批给判定器加了治理锁定分支与注释，体内已 2468 字符，原窗口把收尾行顶出去、整条匹配不上。
     *   窗口只用来把检查限定在判定器体内，不是长度判据。
     *   非贪婪 + 收尾锚在，窗口给宽不会吞到隔壁函数。 */
    const m = /const _evJudge = \((item)\) => \{[\s\S]{0,2800}?\n\s*\};/.exec(idx);
    if (!m) P.push('缺 _evJudge 判定器');
    else {
        const body = m[0];
        /* 判定器自己的「撤回不保」分支:检查带 item. 前缀的整串(裸 `revoked === true`
         *   在 index.js 别处也有,不得把别人的判定当成判定器的)。 */
        if (!body.includes(A_IDX_REVOKED)) P.push('判定器须识别 revoked(已撤回事实不得复活)');
        if (!body.includes('pinned === true')) P.push('判定器须识别 pinned(用户明确保留)');
        if (!body.includes('keepSalient')) P.push('判定器须走 stm-ltm keepSalient(文本特征单一真源)');
        if (body.includes('_evJudgeAgg')) P.push('恒等死代码 _evJudgeAgg 不应残留');
    }
    /* C2 预算默认 32 + 可配置 0 关闭 */
    if (!/return 32;/.test(idx)) P.push('保护预算默认须 32');
    if (!idx.includes('gcProtectBudget')) P.push('须支持 gcProtectBudget 配置');
    /* C3 _lastGcEvidence 收账 + getDegradationLedger 并入 overBudget */
    if (!idx.includes('this._lastGcEvidence = _r.evidence || null;')) P.push('缺 _lastGcEvidence 收账');
    if (!idx.includes('证据保护预算')) P.push('getDegradationLedger 缺证据保护预算档');
    return P;
}

/* ══════════════ 负控制锚点(判据层只声明一次 —— H5) ══════════════ */
/* [v3.421.0] 锚点跟随：真源保护项已拆成 exemptList/normalList 两路，
 *   容量式改吃 normalList.length。破坏点仍是同一个（把 safe 抹平）。 */
const A_GC_EV = "const safe = Math.min(normalList.length, b);";
const A_STM_CARRY = "for (const t of e.salient) carry.push(String(t));";
const A_IDX_REVOKED = "item.revoked === true";

/* ══════════════ 测试体 ══════════════ */
test('v3370 A1. ★★★★ 模块层:证据保护筛三态 + 三路保护/降级 + 汇总读数', () => {
    assert.deepEqual(moduleJudge(GC), [], '模块层证据保护判据');
    ok('evidenceScreen 三态 / 三路保护 / overBudget 降级 / judged 汇总');
});
test('v3370 B1. ★★★★ stm-ltm 层:LTM 滚动 salient 前移 + 回源 + 落账', async () => {
    const P = await stmLtmJudge(STM);
    assert.deepEqual(P, [], 'LTM 滚动保底转移判据');
    ok('滚动丢最旧但保底句前移;约定/金额/原话仍可回源;lookupSalient 命中;落账可见');
});
test('v3370 C1. ★★★★ 宿主层:判定器驳回撤回 / 保 pinned / 文本特征 / 收账', () => {
    assert.deepEqual(hostJudge(IDX), [], '宿主证据判定与收账判据');
    ok('revoked 不保 / pinned 保 / keepSalient 文本 / _lastGcEvidence 收账 / 预算默认 32');
});
test('v3370 F1. ★★★ 破坏 GC evidenceScreen 保护 ⇒ 保护判据当场现形', () => {
    const broken = breakOnce(GC_SRC, A_GC_EV, "const safe = 0;", 'F1');
    assert.notEqual(broken, GC_SRC, '破坏必须真改源码');
    assert.notDeepEqual(moduleJudge(loadIIFE(broken, 'LonShaMemoryGc')), [], '保护被抹平必须翻红');
    assert.deepEqual(moduleJudge(GC), [], '原版上同判据必须真成立');
    ok('负控制成立:保护被抹平即红,原版仍绿');
});
test('v3370 F2. ★★★ 破坏 LTM 滚动转移 ⇒ 回源判据当场现形', async () => {
    const broken = breakOnce(STM_SRC, A_STM_CARRY, "if (false) carry.push(String(t));", 'F2');
    assert.notEqual(broken, STM_SRC, '破坏必须真改源码');
    /* stm-ltm.js 双导出(window + module),给 vm 上下文加 window 即经 ctx.LonShaStmLtm 取到。 */
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(broken, ctx);
    const brokenApi = ctx.LonShaStmLtm;
    if (!brokenApi) throw new Error('破坏版未挂 LonShaStmLtm');
    const P = await stmLtmJudge(brokenApi);
    assert.notDeepEqual(P, [], '转移被破坏必须翻红');
    assert.deepEqual(await stmLtmJudge(STM), [], '原版上同判据必须真成立');
    ok('负控制成立:转移被破坏即红');
});
test('v3370 F3. ★★★ 破坏宿主 revoked 判定 ⇒ 撤回复活判据当场现形', () => {
    const broken = breakOnce(IDX, A_IDX_REVOKED, "item.revoked === false", 'F3');
    assert.notEqual(broken, IDX, '破坏必须真改源码');
    assert.notDeepEqual(hostJudge(broken), [], 'revoked 不再识别必须翻红');
    assert.deepEqual(hostJudge(IDX), [], '原版上同判据必须真成立');
    ok('负控制成立:撤回判定失效即红');
});
test('v3370 G1. ★★★ H5 判据纯度:三个破坏锚点在本档各恰 1 次', () => {
    for (const [nm, a] of [['A_GC_EV', A_GC_EV], ['A_STM_CARRY', A_STM_CARRY], ['A_IDX_REVOKED', A_IDX_REVOKED]]) {
        const n = SELF.split(a).length - 1;
        assert.equal(n, 1, nm + ' 在本档出现 ' + n + ' 次(纯度要求恰 1 次)');
    }
    for (const [nm, a, src] of [['A_GC_EV', A_GC_EV, GC_SRC], ['A_STM_CARRY', A_STM_CARRY, STM_SRC], ['A_IDX_REVOKED', A_IDX_REVOKED, IDX]]) {
        assert.equal(src.split(a).length - 1, 1, nm + ' 在真源上须恰中 1 次');
    }
    ok('三个锚点:本档各 1 次、真源各恰中 1 次');
});
test('v3370 H1. ★★★ 自防护 + 当版锚点(供版本守卫 V4 计数)', () => {
    assert.ok(SELF.length > 6000, '本档自身不得被清空(实 ' + SELF.length + ' 字符)');
    assert.ok(SELF.includes('BORN'), '当版锚点必须显式留在本档里');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum(BORN_V), '本套件只在 ' + BORN_V + ' 及以后成立;当前 ' + codeVer);
    ok('自防护 / 当版锚 v' + BORN_V);
});
const BORN_V = '3.337.0';
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}