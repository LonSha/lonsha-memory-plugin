import test from 'node:test';
import assert from 'node:assert/strict';

import rippleBus from '../engine-orchestration-ripple-bus.js';
import causalityLock from '../spatiotemporal-causality-lock.js';
import sleepPruner from '../sleep-consolidation-graph-pruner.js';
import tabooDefense from '../obsessive-taboo-multi-tier-defense.js';
import parallaxIso from '../intersubjective-parallax-isolation.js';
import triModalRecall from '../tri-modal-resonance-recall-funnel.js';
import counterfactualSb from '../counterfactual-butterfly-sandbox.js';
import telemetryDash from '../engine-diagnostics-telemetry-dashboard.js';
import soulBrand from '../transgenerational-soul-brand-synthesis.js';
import waAssimilator from '../worldaxis-objective-to-subjective-assimilator.js';
import dreamEngine from '../autonomous-rumination-dream-engine.js';
import anchorHub from '../emotional-anchor-binding-resonance-hub.js';
import somaticEngine from '../autonomic-nervous-somatic-flare-engine.js';
import amnesiaBench from '../dissociative-amnesia-puzzle-workbench.js';
import styleMod from '../stylistic-drift-emotional-lexicon-modulator.js';
import gaslightingNet from '../unreliable-narrator-gaslighting-neutralizer.js';
import identityMatrix from '../dual-identity-exposure-risk-matrix.js';
import burnoutResilience from '../psychological-burnout-resilience-decay.js';

test('L21-1: 统一事件波纹编排总线测试 (Ripple Bus & Abort Cascade)', () => {
    const state = rippleBus.createOrchestrationState();
    let step1Ran = false;
    let step2Ran = false;

    rippleBus.registerEngine(state, 'engineA', {
        priority: 10,
        handler: (ctx) => {
            step1Ran = true;
            return { mutatedContext: { stepA: 'completed' } };
        }
    });

    rippleBus.registerEngine(state, 'engineB', {
        priority: 20,
        handler: (ctx) => {
            step2Ran = true;
            return { abortCascade: true, reason: 'high_tension_abort' };
        }
    });

    let step3Ran = false;
    rippleBus.registerEngine(state, 'engineC', {
        priority: 30,
        handler: () => { step3Ran = true; }
    });

    const res = rippleBus.dispatchRippleEvent(state, { type: 'memory_commit', payload: { init: true } });
    assert.equal(res.ok, true);
    assert.equal(step1Ran, true);
    assert.equal(step2Ran, true);
    assert.equal(step3Ran, false, '被 engineB 级联阻断，后续引擎不应执行');
    assert.equal(res.finalContext.stepA, 'completed');
});

test('L21-2: 全时态因果一致性与防死者行动锁测试 (Spatiotemporal Causality Lock)', () => {
    const lockState = causalityLock.createCausalityLockState();
    causalityLock.setCharacterLifespan(lockState, '落难贤者', {
        bornAt: 1000,
        deceasedAt: 5000
    });

    // 1. 尝试在死后行动
    const postMortemCheck = causalityLock.validateCausalConsistency(lockState, {
        actor: '落难贤者',
        timestamp: 6000,
        action: '施放禁咒'
    });
    assert.equal(postMortemCheck.valid, false);
    assert.match(postMortemCheck.violations[0], /post_mortem_action/);

    // 2. 正常时间生前行动
    const preMortemCheck = causalityLock.validateCausalConsistency(lockState, {
        actor: '落难贤者',
        timestamp: 3000,
        action: '书写密卷'
    });
    assert.equal(preMortemCheck.valid, true);
});

test('L21-3: 创伤禁忌三层渐进心理防线测试 (Multi-Tier Defense)', () => {
    const defState = tabooDefense.createMultiTierDefenseState();
    tabooDefense.registerCharacterTaboo(defState, '艾莉西亚', {
        topic: '火灾',
        keywords: ['大火', '烧伤', '烈焰'],
        traumaThreshold: 0.7
    });

    // 第一次触碰：轻微回避
    const ev1 = tabooDefense.evaluatePsychologicalDefense(defState, '艾莉西亚', '那天的大火到底是怎么回事？');
    assert.equal(ev1.tier, 1, '初次触碰进入 Tier 1 轻微回避');

    // 再次刺激：掩饰合理化
    const ev2 = tabooDefense.evaluatePsychologicalDefense(defState, '艾莉西亚', '你手臂上的烧伤明明就是证据！');
    assert.equal(ev2.tier, 2, '连续触碰升级为 Tier 2 掩饰性合理化');

    // 极限刺激：破防崩溃
    const ev3 = tabooDefense.evaluatePsychologicalDefense(defState, '艾莉西亚', '烈焰吞噬了一切，你在撒谎！');
    assert.equal(ev3.tier, 3, '张力拉满触发 Tier 3 重度破防崩溃');
});

test('L21-4: WorldAxis 客观世界快照主观折射摄入测试 (WorldAxis Assimilator)', () => {
    const worldSnapshot = {
        clock: { label: '第三纪元·秋季·霜降' },
        weather: '暴风雨夹杂雷电',
        undercurrents: ['反抗军暗号频传']
    };
    const res = waAssimilator.assimilateWorldAxisState(worldSnapshot, { name: '希尔维亚', sensitivity: 0.8 });
    assert.equal(res.ok, true);
    assert.match(res.subjectiveRefraction, /暴风雨夹杂雷电/);
    assert.match(res.subjectiveRefraction, /暗流涌动/);
});

test('L21-5: 誓约心锚与背弃反噬测试 (Emotional Anchor & Shatter)', () => {
    const anchorState = anchorHub.createAnchorState();
    const cov = anchorHub.inscribeCovenant(anchorState, {
        parties: ['玩家', '诺艾尔'],
        promiseText: '绝不在黎明前弃城而逃'
    });
    assert.equal(cov.status, 'sacred_active');

    const backlash = anchorHub.shatterCovenant(anchorState, cov.id, '诺艾尔');
    assert.equal(backlash.covenantId, cov.id);
    assert.match(backlash.directive, /誓约已被背弃/);
});

test('L21-6: 18项全新模块与引擎全量可达性与契约健全自检', () => {
    assert.equal(typeof sleepPruner.runSleepConsolidation, 'function');
    assert.equal(typeof parallaxIso.grantFactKnowledge, 'function');
    assert.equal(typeof triModalRecall.rankRecallCandidates, 'function');
    assert.equal(typeof counterfactualSb.forkHypotheticalSandbox, 'function');
    assert.equal(typeof telemetryDash.inspectEngineHealth, 'function');
    assert.equal(typeof soulBrand.inscribeSoulBrand, 'function');
    assert.equal(typeof dreamEngine.synthesizeMetaphoricalDream, 'function');
    assert.equal(typeof somaticEngine.evaluateSomaticReflex, 'function');
    assert.equal(typeof amnesiaBench.registerHiddenFragment, 'function');
    assert.equal(typeof styleMod.modulateLexiconByAffection, 'function');
    assert.equal(typeof gaslightingNet.detectNarrativeContradiction, 'function');
    assert.equal(typeof identityMatrix.recordCovertSlip, 'function');
    assert.equal(typeof burnoutResilience.applyStressTrauma, 'function');
});