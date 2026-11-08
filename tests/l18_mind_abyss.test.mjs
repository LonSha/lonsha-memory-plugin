import test from 'node:test';
import assert from 'node:assert/strict';

import TemporalFlashbulbDilationEngine from '../temporal-flashbulb-dilation-engine.js';
import DissociativePersonaMaskMatrix from '../dissociative-persona-mask-matrix.js';
import ConfabulationMandelaReconstructEngine from '../confabulation-mandela-reconstruct-engine.js';
import ProustianSynesthesiaRecallEngine from '../proustian-synesthesia-recall-engine.js';
import ZeigarnikUnresolvedGestaltLoop from '../zeigarnik-unresolved-gestalt-loop.js';
import CounterfactualWhatIfRegretMatrix from '../counterfactual-whatif-regret-matrix.js';
import RumorEntropyGossipDiffusion from '../rumor-entropy-gossip-diffusion.js';
import CognitiveScatomaDenialGuard from '../cognitive-scatoma-denial-guard.js';
import DaydreamSpontaneousWanderingEngine from '../daydream-spontaneous-wandering-engine.js';
import VectorSemanticSparseHybridRetrieval from '../vector-semantic-sparse-hybrid-retrieval.js';
import TieredStorageCompactionLedger from '../tiered-storage-tiered-compaction-ledger.js';
import RealtimeConflictGraphRollback from '../realtime-conflict-graph-rollback.js';
import MemorySalienceDecayCurator from '../memory-salience-decay-curator.js';
import CrossSessionIdentityReconciliation from '../cross-session-identity-reconciliation.js';
import PromptBudgetDynamicAllocator from '../prompt-budget-dynamic-allocator.js';
import EpistemicBoundaryAuditor from '../epistemic-boundary-auditor.js';
import AsyncIndexingPipelineDebouncer from '../async-indexing-pipeline-debouncer.js';
import StateMachineChaosMonkeyResilience from '../state-machine-chaos-monkey-resilience.js';

test('L18-X1: 闪光灯主观时间膨胀与情绪像素定格引擎', () => {
    const engine = new TemporalFlashbulbDilationEngine();
    const event = {
        summary: "悬崖边生死拉扯的瞬间",
        arousal: 0.95,
        emotion: "terror",
        sensoryDetails: ["对方手指冷汗的黏腻感", "悬崖下碎石滚落的细微回音"]
    };
    const record = engine.evaluateAndDilate(event);
    assert.strictEqual(record.isFlashbulb, true);
    assert.ok(record.dilationFactor > 5.0);
    const prompt = engine.formatPromptInjection();
    assert.ok(prompt.includes("【潜意识闪光灯定格·时间膨胀体验】"));
    assert.ok(prompt.includes("对方手指冷汗的黏腻感"));
});

test('L18-X2: 伪装面具与多重解离人格视界防火墙', () => {
    const matrix = new DissociativePersonaMaskMatrix();
    matrix.registerPersona("mask_waiter", { type: "mask", name: "端茶倒水的小侍应", secrets: ["地下党联络员"] });
    matrix.registerPersona("core_spy", { type: "core", name: "代号深海的特工", secrets: [] });

    matrix.switchPersona("mask_waiter");
    const memories = [
        { text: "今天给客人端了三杯红茶", isCoreSecret: false },
        { text: "我是地下党联络员，接头暗号是红玫瑰", isCoreSecret: true }
    ];

    const safeMemories = matrix.filterMemoriesByPersonaHorizon(memories);
    assert.strictEqual(safeMemories.length, 1);
    assert.strictEqual(safeMemories[0].text, "今天给客人端了三杯红茶");

    // 开启安全屋环境
    matrix.setSafeHouseEnvironment(true);
    const unsealed = matrix.filterMemoriesByPersonaHorizon(memories);
    assert.strictEqual(unsealed.length, 2);
});

test('L18-X3: 记忆二次重构虚构症与曼德拉自愈篡改引擎', () => {
    const engine = new ConfabulationMandelaReconstructEngine();
    const painful = { fact: "他当众撕毁了我们的盟约" };
    const belief = { topic: "盟约", claim: "他绝对不会背叛我" };

    const confab = engine.reconstructNarrative(painful, belief);
    assert.ok(confab.distortedTruth.includes("绝对不会背叛我") || confab.distortedTruth.includes("并无此事"));
    const prompt = engine.formatConfabulationInjection();
    assert.ok(prompt.includes("曼德拉效应"));
});

test('L18-X4: 普鲁斯特感官通感诱发反射引擎', () => {
    const engine = new ProustianSynesthesiaRecallEngine();
    engine.registerSensoryMemoryAnchor("madeleine_tea", {
        sensoryType: "gustatory",
        stimulusKeys: ["玛德琳蛋糕", "红茶冷香"],
        dormantMemoryExcerpt: "七岁那年外祖母在壁炉旁烤的点心",
        evokedSomaticSensation: "喉头泛起微甜与难以言喻的乡愁"
    });

    const triggered = engine.probeSensoryTriggers("端起那一杯带着红茶冷香的瓷杯，咬下一块点心");
    assert.strictEqual(triggered.length, 1);
    assert.strictEqual(triggered[0].sensation, "喉头泛起微甜与难以言喻的乡愁");
    const prompt = engine.formatProustianPrompt(triggered);
    assert.ok(prompt.includes("普鲁斯特感官通感"));
});

test('L18-X5: 蔡格尼克未闭合执念与潜意识反刍回路', () => {
    const loop = new ZeigarnikUnresolvedGestaltLoop();
    loop.openInterruptedLoop("confess_cut", {
        eventSummary: "正要说出'其实我喜欢你'时被暴雨雷声打断",
        interruptedReason: "暴雨雷声轰鸣",
        urgency: 0.65
    });

    loop.advanceRuminationCycle();
    const prompt = loop.formatRuminationPrompt();
    assert.ok(prompt.includes("蔡格尼克效应"));
    assert.ok(prompt.includes("其实我喜欢你"));
});

test('L18-X6: 反事实推演与懊悔/侥幸代偿引擎', () => {
    const matrix = new CounterfactualWhatIfRegretMatrix();
    const node = matrix.simulateBranch("accident_01", "车祸擦伤了手臂", {
        direction: "upward",
        condition: "如果当时我没有坚持走那条近道",
        betterOrWorseOutcome: "我们就不会遇到那辆失控的泥头车",
        behavioralAdjustment: "极度抗拒夜间走僻静小路",
        impactScore: 0.9
    });

    assert.strictEqual(node.isUpward, true);
    const prompt = matrix.formatCounterfactualPrompt();
    assert.ok(prompt.includes("痛悔代偿"));
});

test('L18-X7: 群体流言熵增失真与 NPC 社交传染模型', () => {
    const gossip = new RumorEntropyGossipDiffusion();
    const secret = { content: "李巡捕昨晚去了码头仓库一次" };
    const step1 = gossip.diffuseRumor("rumor_dock", secret, { name: "酒馆跑堂", bias: "sensationalist" });
    assert.ok(step1.currentVersion.includes("惊爆"));
    assert.strictEqual(step1.hopCount, 1);
});

test('L18-X8: 认知盲点与防御性选择性失聪守卫', () => {
    const guard = new CognitiveScatomaDenialGuard();
    guard.registerBlindspot("father_crime", "父亲是内鬼", 0.9);

    const result = guard.filterAndRationalize("监控拍下了你父亲在金库开锁的正面画面", "father_crime");
    assert.strictEqual(result.filtered, true);
    assert.ok(result.denialPrompt.includes("认知盲点生效"));
});

test('L18-X9: 独处走神白日梦与潜意识心象漂移引擎', () => {
    const engine = new DaydreamSpontaneousWanderingEngine();
    const dream = engine.triggerMindWandering("rainy_evening", "老式座钟");
    assert.ok(dream.streamOfConsciousness.includes("老式座钟"));
    const prompt = engine.formatDaydreamPrompt();
    assert.ok(prompt.includes("心智漫游·独处走神白日梦"));
});

test('L18-O1: 稠密向量与稀疏语义混合检索优化器 (BM25+Dense RRF)', () => {
    const hybrid = new VectorSemanticSparseHybridRetrieval();
    const sparseList = [{ id: "doc1", text: "Alpha Project Secret Code" }, { id: "doc2", text: "Beta Code" }];
    const denseList = [{ id: "doc2", text: "Beta Code" }, { id: "doc1", text: "Alpha Project Secret Code" }];

    const fused = hybrid.fuseRRF(sparseList, denseList);
    assert.strictEqual(fused.length, 2);
    assert.ok(fused[0].hybridScore > 0);
});

test('L18-O2: 分层分级存储与冷热冷凝压缩账本', () => {
    const ledger = new TieredStorageCompactionLedger({ hotCapacity: 3, warmCapacity: 3 });
    for (let i = 0; i < 10; i++) {
        ledger.addMemory({ id: "m_" + i, text: "历史记忆节点 #" + i });
    }
    const stats = ledger.getStats();
    assert.strictEqual(stats.hotCount, 3);
    assert.ok(stats.coldEpochs > 0);
});

test('L18-O3: 运行时因果冲突图谱动态回滚与快照分支中枢', () => {
    const rollback = new RealtimeConflictGraphRollback();
    rollback.createSnapshot(5, { edge: "A->B" });
    rollback.createSnapshot(10, { edge: "A->B->C" });
    rollback.createSnapshot(15, { edge: "A->B->C->D" });

    const restored = rollback.rollbackToFloor(8);
    assert.strictEqual(restored.restoredFloor, 5);
    assert.deepStrictEqual(restored.graphData, { edge: "A->B" });
});

test('L18-O4: 记忆显著度非线性生物衰减精算器 (突触修剪)', () => {
    const curator = new MemorySalienceDecayCurator({ pruneThreshold: 0.2 });
    const memory = { id: "trivial", initialSalience: 1.0, createdTurn: 0, emotionalWeight: 0.05, recallCount: 0 };
    const score = curator.calculateSalience(memory, 50);
    assert.ok(score < 0.2);

    const { retained, pruned } = curator.pruneMemories([memory], 50);
    assert.strictEqual(pruned.length, 1);
});

test('L18-O5: 跨话题多角色实体身份自动对齐与消歧中枢', () => {
    const recon = new CrossSessionIdentityReconciliation();
    recon.registerCanonicalEntity("ent_007", "林强", ["强哥", "阿强", "小林警官"]);

    const resolved = recon.resolveMention("阿强");
    assert.strictEqual(resolved.canonicalName, "林强");
    assert.strictEqual(resolved.id, "ent_007");
});

test('L18-O6: 提示词预算动态弹性竞价分配器', () => {
    const allocator = new PromptBudgetDynamicAllocator({ maxTotalTokenBudget: 1000 });
    const budgets = allocator.allocateBudgets("combat");
    assert.ok(budgets.memoryBudgetTokens > budgets.phoneBudgetTokens);

    const longText = "A".repeat(500);
    const trimmed = allocator.enforceBudget(longText, 100);
    assert.ok(trimmed.includes("超预算动态自适应截断"));
});

test('L18-O7: 认识论边界与非全知严谨性全量审计监视器', () => {
    const auditor = new EpistemicBoundaryAuditor();
    const badPrompt = "角色看着窗外。上帝视角显示那个杀手正躲在隔壁楼顶！";
    const result = auditor.auditAndSanitize(badPrompt);
    assert.strictEqual(result.clean, false);
    assert.ok(!result.text.includes("上帝视角显示"));
    assert.ok(result.text.includes("【隐约感到某些异样】"));
});

test('L18-O8: 异步索引管线防抖并发消峰调度器', async () => {
    const debouncer = new AsyncIndexingPipelineDebouncer({ debounceMs: 50 });
    let flushedCount = 0;
    debouncer.onFlush(batch => { flushedCount += batch.length; });

    debouncer.enqueue("task1");
    debouncer.enqueue("task2");
    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(flushedCount, 2);
});

test('L18-O9: 记忆状态机混沌工程自愈防御盾', () => {
    const chaos = new StateMachineChaosMonkeyResilience();
    const brokenState = {
        activePersonaId: "mask_agent"
        // 故意缺少 frozenMoments, confabulatedNodes, sensoryAnchors
    };
    const healed = chaos.validateAndHeal(brokenState);
    assert.ok(Array.isArray(healed.frozenMoments));
    assert.ok(Array.isArray(healed.confabulatedNodes));
    assert.ok(Array.isArray(healed.sensoryAnchors));
});
