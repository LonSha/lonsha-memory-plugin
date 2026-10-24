/* ============================================================
 * tests/v3372_eighth_cycle_batch_b.test.mjs — [第八期 · 批次 B]
 * 覆盖：
 *   - M8-O4 召回路线编排（recall-route-orchestrator.js）
 *   - M8-O5 记忆预算编排（memory-budget-orchestrator.js）
 *   - M8-O6 生成结果回放（generation-fact-replay.js）
 *   - M8-X4 记忆考古（memory-archaeology.js）
 *   - M8-X5 记忆仪式（memory-ritual.js）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const R = process.cwd();

const RecallRoute = require_(path.join(R, 'recall-route-orchestrator.js'));
const MemoryBudget = require_(path.join(R, 'memory-budget-orchestrator.js'));
const FactReplay = require_(path.join(R, 'generation-fact-replay.js'));
const MemoryArchaeology = require_(path.join(R, 'memory-archaeology.js'));
const MemoryRitual = require_(path.join(R, 'memory-ritual.js'));

test('M8-O4 · 召回路线编排：路线自检、加权排序与同名消歧', () => {
    const check = RecallRoute.recallRouteSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = RecallRoute.normalizeRouteState(null);
    assert.equal(state.defaultRoute, RecallRoute.ROUTE_TYPES.EXPERIENCE);

    // 候选样本：包含经历、硬性证据与主观视角
    const candidates = [
        { id: 'c1', type: 'episode', content: 'Alice 在雨夜奔跑', baseScore: 0.8 },
        { id: 'c2', type: 'contract', content: '房产租赁书面合同', baseScore: 0.75 },
        { id: 'c3', type: 'perspective_fact', content: 'Bob 主观认为 Alice 在隐瞒秘密', baseScore: 0.8, knownBy: ['Bob'] }
    ];

    // 1. 采用 EVIDENCE 路线：硬性证据 c2 被加权到第一名
    const rankedEvidence = RecallRoute.filterAndRankByRoute(RecallRoute.ROUTE_TYPES.EVIDENCE, candidates);
    assert.equal(rankedEvidence[0].id, 'c2');

    // 2. 采用 PERSPECTIVE 路线且视角为 Alice：Bob 的私密认知 c3 知情隔离权重大降或归零
    const rankedAlice = RecallRoute.filterAndRankByRoute(RecallRoute.ROUTE_TYPES.PERSPECTIVE, candidates, {
        perspectiveCharacter: 'Alice'
    });
    const c3Item = rankedAlice.find(x => x.id === 'c3');
    assert.equal(c3Item.routeScore, 0);

    // 3. 同名消歧：同名但来自不同模块/实体
    const ambiguousCandidates = [
        { id: 'a1', entityName: '萧忆柔', module: '萧家日常', title: '萧家主母' },
        { id: 'a2', entityName: '萧忆柔', module: '海棠', title: '海棠医仙' }
    ];
    const disambiguated = RecallRoute.disambiguateCandidates(ambiguousCandidates, '萧忆柔');
    assert.equal(disambiguated.length, 2);
    assert.ok(disambiguated.some(g => g.disambiguationLabel === '萧家日常'));
    assert.ok(disambiguated.some(g => g.disambiguationLabel === '海棠'));
});

test('M8-O5 · 记忆预算编排：分层编排、锁定项保护与牺牲项透明化', () => {
    const check = MemoryBudget.memoryBudgetSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = MemoryBudget.normalizeBudgetState(null);

    // 锁定关键记忆项 m3
    const lockRes = MemoryBudget.lockMaterial(state, 'm3', '关键破案线索');
    assert.equal(lockRes.success, true);
    state = lockRes.state;

    // 候选材料，字符数各 100
    const materials = [
        { id: 'm1', content: 'x'.repeat(100), tier: MemoryBudget.BUDGET_TIERS.MANDATORY, score: 0.9 },
        { id: 'm2', content: 'x'.repeat(100), tier: MemoryBudget.BUDGET_TIERS.OPTIONAL, score: 0.8 },
        { id: 'm3', content: 'x'.repeat(100), tier: MemoryBudget.BUDGET_TIERS.OPTIONAL, score: 0.5 }, // 虽然分低且是 optional，但被锁定
        { id: 'm4', content: 'x'.repeat(100), tier: MemoryBudget.BUDGET_TIERS.OPTIONAL, score: 0.6 }
    ];

    // 预算仅限 250 字符：m1(100) + 锁定m3(100) = 200，剩余 50 无法容纳 m2(100)
    const result = MemoryBudget.orchestrateMemoryBudget(materials, 250, state);
    assert.equal(result.admittedCount, 2);
    assert.ok(result.admitted.some(x => x.id === 'm1'));
    assert.ok(result.admitted.some(x => x.id === 'm3'));
    assert.equal(result.sacrificedCount, 2);
    assert.ok(result.sacrificed.some(s => s.item.id === 'm2' && s.reason === 'budget-exhausted'));
});

test('M8-O6 · 生成结果回放：事实生命周期、采纳理由与回滚', () => {
    const check = FactReplay.factReplaySelfCheck();
    assert.deepEqual(check.problems, []);

    let state = FactReplay.normalizeFactReplayState(null);
    const now = 1700000000000;

    // 1. 记录模型生成的事实提议
    const recRes = FactReplay.recordGeneratedFact(state, {
        id: 'gf_01',
        content: 'Alice 曾经在维也纳皇家音乐厅演出',
        sourceFloor: 42,
        rawQuote: '维也纳那一夜的琴声我永远不会忘记',
        entityId: 'char_alice'
    }, now);
    assert.equal(recRes.success, true);
    state = recRes.state;
    assert.equal(state.facts['gf_01'].stage, FactReplay.FACT_STAGES.PROPOSED);

    // 2. 推进为正式入库（ADMITTED）并记录采纳理由
    const admitRes = FactReplay.transitionFactStage(
        state,
        'gf_01',
        FactReplay.FACT_STAGES.ADMITTED,
        '用户对话中明确证实并作为主线设定',
        now + 1000
    );
    assert.equal(admitRes.success, true);
    state = admitRes.state;
    assert.equal(state.facts['gf_01'].stage, FactReplay.FACT_STAGES.ADMITTED);

    // 3. 溯源解释检查
    const trace = FactReplay.traceFactProvenance(state.facts['gf_01']);
    assert.ok(trace.includes('第 42 楼'));
    assert.ok(trace.includes('维也纳皇家音乐厅演出'));
    assert.ok(trace.includes('用户对话中明确证实'));

    // 4. 发现矛盾，回滚已入库事实
    const revertRes = FactReplay.revertAdmittedFact(state, 'gf_01', '后续证实为谎言', now + 2000);
    assert.equal(revertRes.success, true);
    state = revertRes.state;
    assert.equal(state.facts['gf_01'].stage, FactReplay.FACT_STAGES.REJECTED);
});

test('M8-X4 · 记忆考古：断层具名分析、假说建立与实证检验', () => {
    const check = MemoryArchaeology.memoryArchaeologySelfCheck();
    assert.deepEqual(check.problems, []);

    // 1. 碎片断层分析：某事件标记了 requiresCausalBridge 但上下文中无中介事实
    const fragments = [
        { id: 'frag_war', title: '边境战争爆发', requiresCausalBridge: true },
        { id: 'frag_secret', title: '皇室禁书', isRedacted: true }
    ];
    const gaps = MemoryArchaeology.analyzeArchaeologicalGaps(fragments, []);
    assert.equal(gaps.length, 2);
    assert.equal(gaps[0].gapType, MemoryArchaeology.ARCHAEOLOGY_GAP_TYPES.MISSING_LINK);
    assert.equal(gaps[1].gapType, MemoryArchaeology.ARCHAEOLOGY_GAP_TYPES.REDACTED);

    // 2. 针对断层提出假说
    let state = MemoryArchaeology.normalizeArchaeologyState(null);
    const hypRes = MemoryArchaeology.createArchaeologyHypothesis(state, {
        id: 'hyp_peace_talk_failed',
        targetGapId: gaps[0].id,
        premise: '在边境战争爆发前，曾发生过一次被暗杀打断的秘密和谈'
    });
    assert.equal(hypRes.success, true);
    state = hypRes.state;

    // 3. 补充支持证据与反驳证据
    const verifyCorroborated = MemoryArchaeology.verifyHypothesis(state, 'hyp_peace_talk_failed', [
        { stance: 'support', snippet: '在旧城遗址发现了印有和谈双印章的残卷' }
    ]);
    assert.equal(verifyCorroborated.success, true);
    assert.equal(verifyCorroborated.status, MemoryArchaeology.HYPOTHESIS_STATUS.CORROBORATED);
});

test('M8-X5 · 记忆仪式：发起仪式、角色具名出席与礼成结算', () => {
    const check = MemoryRitual.memoryRitualSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = MemoryRitual.normalizeRitualState(null);
    const now = 1700000000000;

    // 1. 发起告别仪式
    const ritualRes = MemoryRitual.createRitual(state, {
        id: 'ritual_farewell_station',
        title: '老车站的最后告别',
        type: MemoryRitual.RITUAL_TYPES.FAREWELL,
        themeTarget: '旧铁路终点站'
    }, now);
    assert.equal(ritualRes.success, true);
    state = ritualRes.state;

    // 2. 角色反馈：Alice 出席并留下证言，Bob 婉拒
    state = MemoryRitual.recordParticipantResponse(
        state,
        'ritual_farewell_station',
        'char_alice',
        MemoryRitual.ATTENDANCE_STATUS.ATTENDING,
        '无论列车开往哪里，我都不会忘记这里的落日。',
        now + 100
    ).state;

    state = MemoryRitual.recordParticipantResponse(
        state,
        'ritual_farewell_station',
        'char_bob',
        MemoryRitual.ATTENDANCE_STATUS.DECLINED,
        '我不喜欢告别的场面，但我会在钟楼看着列车远去。',
        now + 200
    ).state;

    // 3. 礼成结算
    const concludeRes = MemoryRitual.concludeRitual(state, 'ritual_farewell_station', {
        summary: '旧车站拆除前的告别仪式顺利落幕，众人达成了新的前行共识。',
        subsequentPledges: ['每年初夏在钟楼重聚']
    }, now + 1000);
    assert.equal(concludeRes.success, true);
    assert.equal(concludeRes.ritual.status, MemoryRitual.RITUAL_STATUS.CONCLUDED);
    assert.equal(concludeRes.ritual.outcomes.subsequentPledges.length, 1);
});