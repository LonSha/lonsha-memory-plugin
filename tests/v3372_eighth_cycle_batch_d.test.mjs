/* ============================================================
 * tests/v3372_eighth_cycle_batch_d.test.mjs — [第八期 · 批次 D]
 * 覆盖：
 *   - M8-O9 记忆可读工作台（memory-readable-workbench.js）
 *   - M8-X8 记忆共生协议（memory-symbiosis-bridge.js）
 *   - M8-X9 时代接续剧（era-continuation-drama.js）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const R = process.cwd();

const ReadableWorkbench = require_(path.join(R, 'memory-readable-workbench.js'));
const SymbiosisBridge = require_(path.join(R, 'memory-symbiosis-bridge.js'));
const EraContinuation = require_(path.join(R, 'era-continuation-drama.js'));

test('M8-O9 · 记忆可读工作台：直观任务卡生成、动作指引与断点记忆', () => {
    const check = ReadableWorkbench.memoryReadableWorkbenchSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = ReadableWorkbench.normalizeWorkbenchState(null);

    // 汇编直观任务卡
    const sources = {
        proposals: [{ id: 'p1', content: 'Alice 爱好是拉大提琴' }],
        conflicts: [{ id: 'c1', topic: '生日年份矛盾' }],
        temporalItems: [{ id: 't1', content: '旧租房合同' }],
        risks: [{ id: 'r1', description: '私密秘密存在向群聊扩散风险' }]
    };

    const dashboard = ReadableWorkbench.assembleReadableDashboard(state, sources);
    assert.equal(dashboard.totalActionableCards, 4);
    assert.equal(dashboard.cards[0].type, ReadableWorkbench.WORKBENCH_CARD_TYPES.PENDING_PROPOSAL);
    assert.equal(dashboard.cards[1].type, ReadableWorkbench.WORKBENCH_CARD_TYPES.UNRESOLVED_CONFLICT);

    // 记录用户当前操作焦点
    const focusRes = ReadableWorkbench.recordWorkbenchFocus(state, 'card_prop_p1');
    assert.equal(focusRes.success, true);
    assert.equal(focusRes.state.lastResumedCardId, 'card_prop_p1');
});

test('M8-X8 · 记忆共生协议：手机回执接收、动态策略权重与候选微调', () => {
    const check = SymbiosisBridge.memorySymbiosisBridgeSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = SymbiosisBridge.normalizeSymbiosisState(null);

    // 1. 手机端采纳并执行了“夜间安静”策略
    const rec1 = SymbiosisBridge.ingestPhoneActionReceipt(state, {
        receiptId: 'r_01',
        proposalTag: 'night_quiet_strategy',
        outcome: SymbiosisBridge.ACTION_OUTCOMES.ACCEPTED
    });
    assert.equal(rec1.success, true);
    state = rec1.state;
    assert.ok(state.strategyWeights['night_quiet_strategy'] > 1.0); // 策略加权

    // 2. 手机端拒绝了“强行推荐聚会”策略
    const rec2 = SymbiosisBridge.ingestPhoneActionReceipt(state, {
        receiptId: 'r_02',
        proposalTag: 'force_party_invitation',
        outcome: SymbiosisBridge.ACTION_OUTCOMES.REJECTED
    });
    assert.equal(rec2.success, true);
    state = rec2.state;
    assert.ok(state.strategyWeights['force_party_invitation'] < 1.0); // 策略被压制

    // 3. 候选生成材料编排微调
    const candidates = [
        { id: 'c1', proposalTag: 'night_quiet_strategy', score: 0.6 },
        { id: 'c2', proposalTag: 'force_party_invitation', score: 0.8 }
    ];
    const adjusted = SymbiosisBridge.adjustCandidatesBySymbiosis(state, candidates);
    // c1 虽基础分低，但因被采纳偏好加权，symbiosisScore 反超被驳回的 c2
    assert.ok(adjusted[0].symbiosisScore > adjusted[1].symbiosisScore);
});

test('M8-X9 · 时代接续剧：时代流转、旧规则传承抉择与断代留白', () => {
    const check = EraContinuation.eraContinuationDramaSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = EraContinuation.normalizeEraDramaState(null);

    // 1. 第一代：肇始期（立下家规）
    state = EraContinuation.recordEraNode(state, {
        id: 'era_gen1',
        title: '第一代 · 拓荒岁月',
        phase: EraContinuation.ERA_PHASES.ORIGIN,
        inheritedRelics: ['brass_lantern'],
        activeRules: [{ id: 'rule_isolation', description: '绝不与山外陌生人通商' }]
    }).state;

    // 2. 第二代：过渡期（存在断代与战乱留白）
    state = EraContinuation.recordEraNode(state, {
        id: 'era_gen2',
        title: '第二代 · 动荡迁徙',
        phase: EraContinuation.ERA_PHASES.TRANSITION,
        historicalGap: true,
        gapDescription: '避难途中部分族谱散佚，仅存口述'
    }).state;

    // 3. 第三代：接续新世（对旧规则进行抉择：拒绝旧规，开放通商）
    state = EraContinuation.recordEraNode(state, {
        id: 'era_gen3',
        title: '第三代 · 繁盛平原',
        phase: EraContinuation.ERA_PHASES.SUCCESSION
    }).state;

    const decideRes = EraContinuation.decideOldRuleInheritance(
        state,
        'rule_isolation',
        EraContinuation.RULE_INHERITANCE_ACTIONS.REJECT,
        '新时代需要与邻邦互通有无方能长久生存',
        'char_young_heir'
    );
    assert.equal(decideRes.success, true);
    state = decideRes.state;
    assert.equal(state.ruleDecisions['rule_isolation'].action, EraContinuation.RULE_INHERITANCE_ACTIONS.REJECT);

    // 4. 时代全景检验
    const panorama = EraContinuation.renderEraPanorama(state);
    assert.equal(panorama.totalEras, 3);
    assert.ok(panorama.panoramaOverview.includes('历史断代空白'));
    assert.ok(panorama.panoramaOverview.includes('拓荒岁月'));
});