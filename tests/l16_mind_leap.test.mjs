import test from 'node:test';
import assert from 'node:assert/strict';

// 导入 LonSha 第十六期全新日常生活与心流心智引擎
import LonShaNarrativeMomentum from '../narrative-momentum-flow-inertia-engine.js';
import LonShaSocialBondReciprocity from '../latent-social-bond-reciprocity-engine.js';
import LonShaTacitUnderstanding from '../character-tacit-understanding-engine.js';
import LonShaUnspokenHesitation from '../unspoken-hesitation-subtext-engine.js';
import LonShaCommitmentMilestone from '../long-term-commitment-milestone-engine.js';
import LonShaRoutineRhythm from '../everyday-shared-routine-rhythm-engine.js';
import LonShaEmotionalAnchor from '../emotional-anchor-binding-resonance-hub.js';
import LonShaMultiTierDefense from '../obsessive-taboo-multi-tier-defense.js';
import LonShaWorldAxisAssimilator from '../worldaxis-objective-to-subjective-assimilator.js';
import LonShaEngineOrchestration from '../engine-orchestration-ripple-bus.js';
import LonShaMemorySymphony from '../memory-symphony-orchestrator.js';

test('L16-1: 对话动量与心流势头维持引擎 (Narrative Momentum & Emotional Inertia)', () => {
    let state = LonShaNarrativeMomentum.createState();
    assert.equal(state.intensity, 0.2);

    // 连续两次激发，使动量冲入极高区间 (>= 0.7)
    state = LonShaNarrativeMomentum.updateMomentum(state, { text: '真的好喜欢你！千万不要离开我！', speaker: '女主角' });
    state = LonShaNarrativeMomentum.updateMomentum(state, { text: '一定要永远在一起啊！', speaker: '女主角' });
    assert.ok(state.intensity >= 0.7);
    assert.equal(state.dominantTone, '激昂');

    const directives = LonShaNarrativeMomentum.generateMomentumDirectives(state);
    assert.ok(directives.includes('[聊天氛围正浓]'));
    assert.ok(!directives.includes('主观折射'), '严禁生僻黑话');
});

test('L16-2: 隐性人情羁绊与互惠张力引擎 (Latent Social Bond & Reciprocity)', () => {
    let state = LonShaSocialBondReciprocity.createState();
    state = LonShaSocialBondReciprocity.recordSocialEvent(state, '玩家', 'gift', '送了一杯热咖啡与手写卡片');
    state = LonShaSocialBondReciprocity.recordSocialEvent(state, '玩家', 'care', '听我倾诉心事直到深夜');

    const directives = LonShaSocialBondReciprocity.generateReciprocityDirectives(state, '玩家');
    assert.ok(directives.includes('[心怀感激与挂念]'));
    assert.ok(directives.includes('听我倾诉心事直到深夜'));
    assert.ok(!directives.includes('因果闭包'), '严禁技术黑话');
});

test('L16-3: 角色默契心领神会与专属暗号引擎 (Character Tacit Understanding)', () => {
    let state = LonShaTacitUnderstanding.createState();
    state = LonShaTacitUnderstanding.reinforceTacitBond(state, '搭档', { signal: '红茶加半勺糖', meaning: '代表有紧急情况，准备撤退' });

    const directives = LonShaTacitUnderstanding.generateTacitDirectives(state, '搭档', '老板，来一杯红茶加半勺糖。');
    assert.ok(directives.includes('[只有你们才懂的暗号]'));
    assert.ok(directives.includes('代表有紧急情况，准备撤退'));
});

test('L16-4: 欲言又止与潜台词心机引擎 (Unspoken Hesitation & Subtext)', () => {
    let state = LonShaUnspokenHesitation.createState();
    state = LonShaUnspokenHesitation.addHesitation(state, '昨晚看到你和别人在一起', '怕显得自己太小气或吃醋');

    const directives = LonShaUnspokenHesitation.generateHesitationDirectives(state);
    assert.ok(directives.includes('[话到嘴边又咽下]'));
    assert.ok(directives.includes('昨晚看到你和别人在一起'));
    assert.ok(directives.includes('怕显得自己太小气或吃醋'));
});

test('L16-5: 长期承诺与约定里程碑追踪引擎 (Long-Term Commitment Milestone)', () => {
    let state = LonShaCommitmentMilestone.createState();
    state = LonShaCommitmentMilestone.addCommitment(state, '今年冬天初雪时一起去故宫看雪', '冬天初雪');

    const directives = LonShaCommitmentMilestone.generateCommitmentDirectives(state);
    assert.ok(directives.includes('[念念不忘的约定]'));
    assert.ok(directives.includes('今年冬天初雪时一起去故宫看雪'));
});

test('L16-6: 全引擎贯通交响中枢阶段 3.11 端到端深度注入测试', () => {
    const mockEngine = {
        config: { config: {} },
        _narrativeMomentumState: LonShaNarrativeMomentum.createState(),
        _socialBondState: LonShaSocialBondReciprocity.createState(),
        _tacitUnderstandingState: LonShaTacitUnderstanding.createState(),
        _unspokenHesitationState: LonShaUnspokenHesitation.createState(),
        _commitmentMilestoneState: LonShaCommitmentMilestone.createState(),
        getKnownCharacters: () => ['主角', '林雨晴']
    };

    // 初始化一些深层羁绊
    mockEngine._socialBondState = LonShaSocialBondReciprocity.recordSocialEvent(mockEngine._socialBondState, '林雨晴', 'gift', '送了一把定制雨伞');
    mockEngine._socialBondState = LonShaSocialBondReciprocity.recordSocialEvent(mockEngine._socialBondState, '林雨晴', 'care', '冒雨赶来');
    mockEngine._commitmentMilestoneState = LonShaCommitmentMilestone.addCommitment(mockEngine._commitmentMilestoneState, '下次放假一起去海边看日出');

    const result = LonShaMemorySymphony.orchestrateMemorySymphony(mockEngine, [], {
        text: '太好啦！今天真的好开心！',
        speaker: '林雨晴'
    });

    assert.ok(result.directives);
    assert.ok(result.directives.includes('[聊天氛围正浓]') || result.directives.includes('[心怀感激与挂念]'));
    assert.ok(result.directives.includes('[此时生活状态：'), '日常节律已成功自然注入');
});

test('L16-7: 誓约心锚与背弃反噬共振中心 (Emotional Anchor Hub)', () => {
    let state = LonShaEmotionalAnchor.createAnchorState();
    LonShaEmotionalAnchor.inscribeCovenant(state, { id: 'cov_forever', title: '共同守护秘密基地' });
    let dirs = LonShaEmotionalAnchor.generateAnchorDirectives(state, '玩家');
    assert.ok(dirs.includes('[心中立下的誓约]'));
    assert.ok(dirs.includes('共同守护秘密基地'));

    LonShaEmotionalAnchor.shatterCovenant(state, 'cov_forever', '背叛者');
    dirs = LonShaEmotionalAnchor.generateAnchorDirectives(state, '玩家');
    assert.ok(dirs.includes('[誓约决裂创伤]'));
    assert.ok(dirs.includes('永久性信任冰川'));
});

test('L16-8: 创伤禁忌三层渐进心理防线 (Obsessive Taboo Multi-Tier Defense)', () => {
    let state = LonShaMultiTierDefense.createMultiTierDefenseState();
    LonShaMultiTierDefense.registerCharacterTaboo(state, '林雨晴', { keyword: '火灾', traumaThreshold: 0.7 });
    
    // Tier 1: 轻微回避 (第一次触碰，张力 0.35)
    let res1 = LonShaMultiTierDefense.evaluatePsychologicalDefense(state, '林雨晴', '那场火灾发生后……');
    assert.equal(res1.tier, 1);
    assert.ok(res1.directive.includes('[轻微回避]'));

    // Tier 2: 掩饰性谎言 (第二次触碰，张力累加至 0.70 >= 0.4)
    let res2 = LonShaMultiTierDefense.evaluatePsychologicalDefense(state, '林雨晴', '你真的忘记大火灾里的事了吗？');
    assert.equal(res2.tier, 2);
    assert.ok(res2.directive.includes('[掩饰性防御]'));

    // Tier 3: 应激崩溃破防 (第三次触碰，张力累加至 1.0 >= 0.75)
    let res3 = LonShaMultiTierDefense.evaluatePsychologicalDefense(state, '林雨晴', '火灾就是你引起的对不对！');
    assert.equal(res3.tier, 3);
    assert.ok(res3.directive.includes('[心理创伤重度应激]'));
});

test('L16-9: 客观世界因果桥主观折射摄入引擎 (WorldAxis Objective to Subjective Assimilator)', () => {
    const worldSnapshot = {
        clock: { label: '深夜十一点' },
        weather: '雷暴大雨',
        undercurrents: ['城市电力瘫痪']
    };
    const assimilated = LonShaWorldAxisAssimilator.assimilateWorldAxisState(worldSnapshot, { name: '林雨晴' });
    assert.ok(assimilated.ok);
    const directive = LonShaWorldAxisAssimilator.generateAssimilatorDirectives(assimilated, '林雨晴');
    assert.ok(directive.includes('[场景氛围感知]'));
    assert.ok(directive.includes('雷暴大雨') || directive.includes('雨'));
});

test('L16-10: 全融会贯通大交响：波纹级联、金字塔聚类与潜意识暗涌', () => {
    const rippleState = LonShaEngineOrchestration.createOrchestrationState();
    LonShaEngineOrchestration.registerEngine(rippleState, 'test_listener', 20, (evt) => {
        return { handled: true, eventType: evt.type };
    });

    const mockEngine = {
        config: { config: {} },
        _rippleBusState: rippleState,
        _narrativeMomentumState: LonShaNarrativeMomentum.createState(),
        _emotionalAnchorState: LonShaEmotionalAnchor.createAnchorState(),
        _multiTierDefenseState: LonShaMultiTierDefense.createMultiTierDefenseState(),
        _subconsciousProfile: { desire: '被认可', fear: '被抛弃', guilt: '隐瞒' },
        getKnownCharacters: () => ['主角', '林雨晴']
    };
    LonShaEmotionalAnchor.inscribeCovenant(mockEngine._emotionalAnchorState, { id: 'secret_pact', title: '绝不反悔的约定' });
    LonShaMultiTierDefense.registerCharacterTaboo(mockEngine._multiTierDefenseState, '林雨晴', { keyword: '背叛' });

    const result = LonShaMemorySymphony.orchestrateMemorySymphony(mockEngine, [], {
        text: '你是不是背叛了我们？',
        speaker: '林雨晴'
    });

    assert.ok(result.directives);
    assert.ok(result.directives.includes('[轻微回避]') || result.directives.includes('[心中立下的誓约]'));
    assert.ok(result.directives.includes('【潜意识常态】：') || result.directives.includes('【潜意识暗涌】：'));
    assert.ok(result.trace.stages.rippleBus);
    assert.equal(result.trace.stages.rippleBus.ok, true);
});
