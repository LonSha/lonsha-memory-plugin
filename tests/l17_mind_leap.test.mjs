import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// 导入 LonSha 第十七期全新心智引擎
import LonShaEgoDefense from '../ego-defense-mechanisms-engine.js';
import LonShaLatentForeshadowing from '../latent-plot-foreshadowing-engine.js';
import LonShaMemorySymphony from '../memory-symphony-orchestrator.js';
const LonShaTacitIntimacy = require('../tacit-intimacy-code-engine.js');
const LonShaTraumaTabooMatrix = require('../trauma-taboo-defense-matrix.js');
const LonShaRumorMutation = require('../rumor-mutation-entropy-engine.js');
const LonShaCircadianRoutine = require('../circadian-shared-routine-engine.js');
const LonShaOathFracture = require('../oath-fracture-repercussion-engine.js');
const LonShaCounterfactualSandbox = require('../counterfactual-multiverse-sandbox.js');
const LonShaSpatialWhisperGuard = require('../spatial-whisper-eavesdropping-guard.js');
const LonShaSourceWitnessGuard = require('../source-witness-isolation-guard.js');
const LonShaBeliefSelfHealingDAG = require('../cascading-belief-self-healing-dag.js');
const LonShaCausalityInvariantLock = require('../causality-invariant-fuse-lock.js');
const LonShaPyramidClusterEngine = require('../hierarchical-pyramid-attention-elastic.js');
const LonShaEntityDisambiguator = require('../entity-disambiguation-affinity-graph.js');
const LonShaBranchDiffMerger = require('../branch-diff-incremental-merger.js');
const LonShaFloorFingerprintSelfHealer = require('../floor-fingerprint-self-healer.js');
const LonShaMindBarometer = require('../mind-barometer-dashboard-snapshot.js');

test('L17-X1: 心理防御机制与自欺欺人叙事重塑引擎 (Ego Defense & Narrative Self-Deception)', () => {
    let state = LonShaEgoDefense.createState();
    assert.equal(state.defenseLevel, 0.1);
    assert.equal(state.activeMechanisms.length, 0);

    // 受到外界指责/揭露过失
    state = LonShaEgoDefense.processEgoThreat(state, {
        statement: '你刚才失手把花瓶弄坏了，全怪你粗心大意！',
        speaker: '玩家'
    });

    assert.ok(state.defenseLevel >= 0.4, '防御等级必须显著提升');
    assert.ok(state.activeMechanisms.includes('projection') || state.activeMechanisms.includes('rationalize'));
    assert.ok(state.subjectiveDistortions.length > 0);

    const directives = LonShaEgoDefense.generateEgoDirectives(state);
    assert.ok(directives.length > 0);
    assert.ok(directives.some(d => d.includes('内心防御') || d.includes('心虚掩饰')));
    assert.ok(directives.some(d => d.includes('真实主观心境')));
});

test('L17-X2: 宿命伏笔与草蛇灰线主动提问发动机 (Latent Foreshadowing & Proactive Inquiry)', () => {
    let state = LonShaLatentForeshadowing.createState();
    assert.equal(state.openSuspenses.length, 0);

    // 登记重大承诺与伏笔
    state = LonShaLatentForeshadowing.registerSuspense(
        state,
        '去看初雪',
        '承诺等今年第一场雪落下时，一起去山顶看雪景',
        0.85
    );
    assert.equal(state.openSuspenses.length, 1);
    assert.equal(state.openSuspenses[0].topic, '去看初雪');

    // 轮次推进与主动探问触发
    const res = LonShaLatentForeshadowing.evaluateProactiveInquiry(state, 12);
    assert.equal(res.shouldInquire, true);
    assert.ok(res.candidate !== null);
    assert.equal(res.candidate.topic, '去看初雪');

    const directives = LonShaLatentForeshadowing.generateInquiryDirectives(res.candidate);
    assert.ok(directives.length > 0);
    assert.ok(directives[0].includes('【角色心中牵挂与主动探问】'));
    assert.ok(directives[0].includes('去看初雪'));

    // 触发后应进入冷却期
    const cooledRes = LonShaLatentForeshadowing.evaluateProactiveInquiry(res.nextState, 13);
    assert.equal(cooledRes.shouldInquire, false, '触发后必须进入冷却防碎碎念');
});

test('L17-Orchestration: 交响总线单周期直通心智防御与草蛇灰线', () => {
    const fakeEngine = {
        _egoDefenseState: LonShaEgoDefense.createState(),
        _latentForeshadowingState: LonShaLatentForeshadowing.createState(),
        factState: { getAll: () => [] },
        ledger: { entries: [] }
    };

    // 预先存入未决悬念
    fakeEngine._latentForeshadowingState = LonShaLatentForeshadowing.registerSuspense(
        fakeEngine._latentForeshadowingState,
        '神秘钥匙',
        '在废弃老宅找到的古旧黄铜钥匙到底能开哪扇门',
        0.9
    );

    const result = LonShaMemorySymphony.orchestrateMemorySymphony(fakeEngine, [], {
        text: '你刚才失误弄丢了线索，太自私了！',
        queryText: '你刚才失误弄丢了线索，太自私了！',
        currentSpeaker: '用户',
        activeFloor: 5
    });

    assert.ok(result && result.directives, '必须生成交响提示词指令');
    assert.ok(result.directives.includes('内心防御') || result.directives.includes('心虚掩饰'), '主生成管线必须无缝注入防御心境');
    assert.ok(result.directives.includes('神秘钥匙'), '主生成管线必须无缝注入主动探问悬念');
});

test('L17-X3: 角色默契与专属私语暗号引擎 (Tacit Intimacy Code Engine)', () => {
    const tacitLib = LonShaTacitIntimacy;
    const state = tacitLib.createState({ intimacyLevel: 80 });

    // 命中预设暗号“下雨了”
    const res = tacitLib.evaluateTacitContext(state, {
        currentSpeaker: '用户',
        userUtterance: '外面好像下雨了呢……'
    });
    assert.equal(res.active, true);
    assert.equal(res.matchedCode.phrase, '下雨了');
    assert.ok(res.promptDirective.includes('专属私语暗号'));
    assert.ok(res.promptDirective.includes('有外人监视/提高戒备'));

    // 注册新暗号
    tacitLib.registerCode(state, '吃冰淇淋', '暗示逃离无聊聚会');
    const res2 = tacitLib.evaluateTacitContext(state, {
        currentSpeaker: '用户',
        userUtterance: '我们要不要去吃冰淇淋？'
    });
    assert.equal(res2.active, true);
    assert.equal(res2.matchedCode.phrase, '吃冰淇淋');
});

test('L17-X4: 潜意识创伤禁忌三层防御中枢 (Trauma Taboo Defense Matrix)', () => {
    const traumaLib = LonShaTraumaTabooMatrix;
    const state = traumaLib.createState();

    // 浅层触发火灾
    const d1 = traumaLib.generateTraumaDirectives(state, '听说那场大火很可怕');
    assert.equal(d1.length, 1);
    assert.ok(d1[0].includes('第1层礼貌回避'));

    // 持续追问加剧压力进入第2层
    const d2 = traumaLib.generateTraumaDirectives(state, '大火里到底发生了什么？');
    assert.equal(d2.length, 1);
    assert.ok(d2[0].includes('第2层警戒抗拒'));

    // 再度逼问进入第3层急性应激
    const d3 = traumaLib.generateTraumaDirectives(state, '你当时为什么被困在浓烟和大火里？');
    assert.equal(d3.length, 1);
    assert.ok(d3[0].includes('第3层急性应激/崩溃'));
});

test('L17-X5: 传闻流转的信息衰减与谣言异化发生器 (Rumor Mutation Engine)', () => {
    const rumorLib = LonShaRumorMutation;
    const state = rumorLib.createState();

    const r = rumorLib.createRumor(state, '实验室昨晚保险丝烧断');
    assert.equal(r.hops, 0);

    // 第一轮传播
    rumorLib.spreadRumor(state, r.id);
    assert.equal(r.hops, 1);
    assert.ok(r.currentNarrative.includes('听说'));
    assert.ok(r.currentNarrative.includes('离奇小火灾'));

    // 第二轮传播
    rumorLib.spreadRumor(state, r.id);
    assert.equal(r.hops, 2);
    assert.ok(r.currentNarrative.includes('剧烈爆炸事故'));

    // 第三轮传播：滔天阴谋异化
    rumorLib.spreadRumor(state, r.id);
    assert.equal(r.hops, 3);
    assert.ok(r.currentNarrative.includes('人体炼金') || r.currentNarrative.includes('封锁'));

    const dirs = rumorLib.generateRumorDirectives(state);
    assert.ok(dirs.length > 0);
    assert.ok(dirs[0].includes('社交传闻异化·信息失真'));
});

test('L17-X6: 日常生活节律共鸣与习惯沉淀共生器 (Circadian Shared Routine Engine)', () => {
    const circLib = LonShaCircadianRoutine;
    const state = circLib.createState();

    // 晨起槽位测试 (07:00)
    const morningDirs = circLib.generateRoutineDirectives(state, 7);
    assert.ok(morningDirs.length > 0);
    assert.ok(morningDirs[0].includes('晨光破晓') || morningDirs[0].includes('早安'));

    // 深夜槽位测试 (23:00)
    const nightDirs = circLib.generateRoutineDirectives(state, 23);
    assert.ok(nightDirs.length > 0);
    assert.ok(nightDirs[0].includes('深夜共守') || nightDirs[0].includes('温热饮品'));
});

test('L17-X7: 誓约心锚、信任裂痕与违约心理反噬 (Oath Fracture Repercussion)', () => {
    const oathLib = LonShaOathFracture;
    const state = oathLib.createState();
    assert.equal(state.trustScore, 100);
    
    // 建立誓约
    const oath = oathLib.bindOath(state, '永远不对彼此隐瞒身世秘密', '用户', 1.5);
    assert.equal(state.activeOaths.length, 1);

    // 遭遇背信断约
    oathLib.recordFracture(state, oath.id, '在地下拍卖行发现对方秘密联络仇敌');
    assert.ok(state.trustScore <= 55, '信任分必须骤降');
    
    // 再度违约
    oathLib.recordFracture(state, oath.id, '二次隐瞒信件');
    assert.ok(state.trustScore < 40, '信任分降至冰点');

    const dirs = oathLib.generateFractureDirectives(state);
    assert.ok(dirs.length > 0);
    assert.ok(dirs[0].includes('誓约心锚与信任重度裂痕'));
    assert.ok(dirs[0].includes('礼貌的疏离') || dirs[0].includes('警惕防御'));
});

test('L17-X8: 反事实记忆推演与平行人生沙盘 (Counterfactual Multiverse Sandbox)', () => {
    const cfLib = LonShaCounterfactualSandbox;
    const state = cfLib.createState();

    const pivot = cfLib.recordPivotEvent(state, '三年前的雨夜车站', '登上列车前往北方', '留在站台接过递来的雨伞');
    assert.equal(state.pivotEvents.length, 1);

    const sim = cfLib.simulateAlternateOutcome(state, pivot.id);
    assert.ok(sim !== null);
    assert.ok(sim.hypotheticalWorld.includes('如果当初没有'));
    assert.ok(sim.hypotheticalWorld.includes('留在站台接过递来的雨伞'));

    const dirs = cfLib.generateCounterfactualDirectives(state);
    assert.ok(dirs.length > 0);
    assert.ok(dirs[0].includes('反事实平行人生感怀'));
    assert.ok(dirs[0].includes('珍惜当下'));
});

test('L17-X9: 空间声学密谈隔断与偷听有限感知 (Spatial Whisper Eavesdropping Guard)', () => {
    const spatialLib = LonShaSpatialWhisperGuard;
    const state = spatialLib.createState();

    spatialLib.definePartition(state, 'study_door', '厚重红木书房门', 0.6);
    const evt = spatialLib.filterUtteranceForListener(
        state,
        'study_door',
        '我们必须在今晚午夜十二点准时调换保险柜里的绝密档案！',
        '门外偷听的女仆'
    );
    assert.ok(evt.fragmentedUtterance.includes('隔着厚重红木书房门'));
    assert.ok(evt.fragmentedUtterance.includes('……'));
    assert.ok(!evt.fragmentedUtterance.includes('调换保险柜里的绝密档案'), '严禁泄露完整敏感明文');

    const dirs = spatialLib.generateEavesdroppingDirectives(evt);
    assert.ok(dirs.length > 0);
    assert.ok(dirs[0].includes('空间声学隔断·偷听有限感知'));
    assert.ok(dirs[0].includes('严格禁止展现全知视角'));
});

test('L17-O2: 认知视界四桶物理硬隔离防穿透仲裁器 (Source Witness Isolation Guard)', () => {
    const witnessLib = LonShaSourceWitnessGuard;
    const state = witnessLib.createState();

    witnessLib.recordWitness(state, 'secret_will_001', '苏离', 'WITNESS', 1.0);
    witnessLib.recordWitness(state, 'secret_will_001', '林深', 'ABSENT', 0.0);

    // 苏离亲历知晓
    const accessSuli = witnessLib.verifyKnowledgeAccess(state, 'secret_will_001', '苏离');
    assert.equal(accessSuli.allowed, true);
    assert.equal(accessSuli.role, 'WITNESS');

    // 林深未在场硬隔离，绝对熔断穿帮
    const accessLinshen = witnessLib.verifyKnowledgeAccess(state, 'secret_will_001', '林深');
    assert.equal(accessLinshen.allowed, false);
    assert.equal(accessLinshen.reason, 'CONFIRMED_ABSENT_RESTRICTION');
    assert.ok(accessLinshen.redactedFact.includes('物理硬隔离·角色绝对未在场'));
    assert.equal(state.blockedAccessCount, 1);
});

test('L17-O3: 事实版本演化与信念纠错级联自愈 (Cascading Belief Self-Healing DAG)', () => {
    const dagLib = LonShaBeliefSelfHealingDAG;
    const state = dagLib.createState();

    dagLib.registerFactNode(state, 'fact_root_fire', '实验室昨晚发生火灾是人为蓄意纵火');
    dagLib.registerFactNode(state, 'fact_infer_suli', '苏离昨晚出现在走廊有重大作案嫌疑');
    dagLib.registerFactNode(state, 'fact_infer_motive', '苏离的作案动机是销毁研究论文');

    dagLib.addDerivationEdge(state, 'fact_root_fire', 'fact_infer_suli');
    dagLib.addDerivationEdge(state, 'fact_infer_suli', 'fact_infer_motive');

    // 查明真相其实是电线短路（推翻根事实）
    const healingRes = dagLib.invalidateFactCascading(state, 'fact_root_fire', '官方查证为电路老化短路事故');
    assert.equal(healingRes.invalidatedCount, 3);
    assert.deepEqual(healingRes.invalidatedIds, ['fact_root_fire', 'fact_infer_suli', 'fact_infer_motive']);
    assert.equal(state.nodes['fact_infer_motive'].valid, false);
    assert.equal(state.nodes['fact_infer_motive'].invalidationReason, '官方查证为电路老化短路事故');
});

test('L17-O6: 剧情日历、双时钟与因果不变量主动熔断 (Causality Invariant Fuse Lock)', () => {
    const lockLib = LonShaCausalityInvariantLock;
    const state = lockLib.createState();

    // 第三章：老宅怀表在火灾中彻底熔毁
    lockLib.registerAnchor(state, 'chapter_03', 1000, {
        pocket_watch: 'DESTROYED',
        brass_key: 'EXISTS'
    });

    // 第五章：尝试正常使用黄铜钥匙 -> 允许
    const checkKey = lockLib.verifyCausality(state, 'chapter_05', 'brass_key', 'USE');
    assert.equal(checkKey.allowed, true);
    assert.equal(checkKey.fused, false);

    // 第五章：若剧情尝试掏出完好的老宅怀表 -> 强制熔断
    const checkWatch = lockLib.verifyCausality(state, 'chapter_05', 'pocket_watch', 'USE');
    assert.equal(checkWatch.allowed, false);
    assert.equal(checkWatch.fused, true);
    assert.ok(checkWatch.reason.includes('因果不变量主动熔断'));
    assert.ok(checkWatch.reason.includes('chapter_03'));
    assert.equal(state.fuseViolations.length, 1);
});

test('L17-O4: 万级长局记忆分层金字塔聚类与动态注意力弹性伸缩 (Pyramid Cluster & Elastic Budget)', () => {
    const pyrLib = LonShaPyramidClusterEngine;
    const state = pyrLib.createState();

    const cluster = pyrLib.compressFactsIntoPyramid(state, [
        { text: '老洋房阁楼藏有暗门' },
        { text: '雨夜里听见钟表齿轮反向转动' }
    ], '序章：旧宅谜影');
    assert.equal(state.clusters.length, 1);
    assert.equal(cluster.factCount, 2);

    // 高紧张对抗场景 -> 紧凑预算提纯
    const highTension = pyrLib.adjustAttentionBudget(state, 0.9);
    assert.equal(highTension.strategy, 'HIGH_TENSION_COMPACT');
    assert.ok(highTension.budgetTokens <= 600);

    // 闲聊温情场景 -> 舒缓大预算释放长程记忆
    const lowTension = pyrLib.adjustAttentionBudget(state, 0.1);
    assert.equal(lowTension.strategy, 'LOW_TENSION_EXPANDED');
    assert.ok(lowTension.budgetTokens >= 1500);
});

test('L17-O5: 实体指代消歧与人际图谱关系亲密度动态加权 (Entity Disambiguation)', () => {
    const disambig = LonShaEntityDisambiguator;
    const state = disambig.createState();

    disambig.registerCharacter(state, '苏离', ['她', '苏小姐'], 90);
    disambig.registerCharacter(state, '陆敏', ['她', '陆总'], 40);

    // 两人同时在场，出现代词“她”，必须根据亲密度加权命中苏离
    const res = disambig.resolvePronounTarget(state, '她', ['苏离', '陆敏']);
    assert.equal(res.resolvedTarget, '苏离');
    assert.ok(res.confidence > 0.9);
});

test('L17-O7: 记忆跨周目与多分支存档差异增量比对合并中枢 (Branch Diff & Merge)', () => {
    const merger = LonShaBranchDiffMerger;
    const branchA = [
        { id: 'f1', text: '共同解开了老宅谜题' },
        { id: 'f2', text: '在拍卖行遭受背刺' }
    ];
    const branchB = [
        { id: 'f1', text: '共同解开了老宅谜题' },
        { id: 'f3', text: '在樱花树下许下永恒之约' }
    ];

    const diffRes = merger.diffBranches(branchA, branchB);
    assert.equal(diffRes.commonCount, 1);
    assert.equal(diffRes.uniqueToACount, 1);
    assert.equal(diffRes.uniqueToBCount, 1);

    // 挑拣合并：从 B 分支挑选 f3 誓约并入 A 分支
    const mergeRes = merger.cherryPickMerge(branchA, branchB, ['f3']);
    assert.equal(mergeRes.addedCount, 1);
    assert.equal(mergeRes.mergedTotal, 3);
    assert.ok(mergeRes.mergedFacts.some(f => f.id === 'f3'));
});

test('L17-O8: 跨楼层证据引用的正文局部编辑自愈重新锚定 (Floor Fingerprint Self-Healer)', () => {
    const healer = LonShaFloorFingerprintSelfHealer;
    const originalText = '苏离在午夜三点悄悄离开了房间，手里紧握着那把带血的黄铜钥匙。';
    const fp = healer.computeFingerprint(originalText);

    const anchor = {
        floor: 12,
        originalLength: originalText.length,
        headSnippet: '苏离在午夜三点',
        fingerprint: fp
    };

    // 用户在酒馆中微调该楼层错字（如修正语序或标点）
    const editedText = '苏离在午夜三点左右，悄悄离开了卧室，手里死死攥着那把带血的黄铜钥匙！';
    const healRes = healer.reanchorEvidence(anchor, editedText);

    assert.equal(healRes.healed, true);
    assert.ok(healRes.confidence > 0.9);
    assert.ok(healRes.message.includes('楼层证据自愈'));
});

test('L17-O9: 玩家端极简心智诊断面板与状态无损持久化 (Mind Barometer Dashboard)', () => {
    const baro = LonShaMindBarometer;
    
    // 默契深厚场景 -> 触发彩虹心情晴雨表
    const rainbowDashboard = baro.aggregateBarometer(
        { defenseLevel: 0.1 },
        { taboos: [] },
        { intimacyLevel: 85 }
    );
    assert.equal(rainbowDashboard.moodWeather, 'RAINBOW');
    assert.ok(rainbowDashboard.moodLabel.includes('心花怒放'));
    assert.ok(rainbowDashboard.renderedDashboardHtml.includes('🌈'));

    // 创伤应激场景 -> 触发暴风雨
    const stormDashboard = baro.aggregateBarometer(
        { defenseLevel: 0.8 },
        { taboos: [{ currentPressure: 0.9 }] },
        { intimacyLevel: 40 }
    );
    assert.equal(stormDashboard.moodWeather, 'THUNDERSTORM');
    assert.equal(stormDashboard.traumaDefense, true);
    assert.ok(stormDashboard.renderedDashboardHtml.includes('⚡'));

    // 全量心智无损持久化快照导出
    const snapshot = baro.exportMindSnapshot({
        flow: 88,
        mood: 'RAINBOW',
        barometer: rainbowDashboard
    });
    assert.equal(snapshot.snapshotVersion, '17.0.0');
    assert.ok(snapshot.checksum.startsWith('mind_'));
    assert.equal(snapshot.state.mood, 'RAINBOW');
});
