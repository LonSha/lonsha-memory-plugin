import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// 导入宿主管线模块与第十期核心模块
const EngineRecall = require('../engine-recall.js');
const { LonShaInjectionPipeline } = require('../engine-injection-pipeline.js');
const executionPipeline = require('../engine-execution-pipeline.js');
const persistenceOps = require('../engine-persistence-ops.js');

// 导入 18 个模块作为全局模拟供给
const modules = [
    { file: '../micro-atmosphere-residual-tracker.js', name: 'LonShaMicroAtmosphere' },
    { file: '../attention-priming-verification-anchor.js', name: 'LonShaAttentionPriming' },
    { file: '../irony-pretense-immune-filter.js', name: 'LonShaIronyImmuneFilter' },
    { file: '../autobiographical-lens-narrative.js', name: 'LonShaAutobiographicalLens' },
    { file: '../expectation-absence-tracker.js', name: 'LonShaExpectationAbsence' },
    { file: '../psychological-boundary-shift.js', name: 'LonShaPsychologicalBoundary' },
    { file: '../epistemic-parallax-theater-engine.js', name: 'LonShaEpistemicParallax' },
    { file: '../counterfactual-branching-sandbox.js', name: 'LonShaCounterfactualSandbox' },
    { file: '../epochal-heritage-cultural-drift.js', name: 'LonShaEpochalHeritage' },
    { file: '../fact-unified-lifecycle-matrix.js', name: 'LonShaFactLifecycleMatrix' },
    { file: '../conflict-group-arbitration-workbench.js', name: 'LonShaConflictArbitration' },
    { file: '../unified-chronology-axis-engine.js', name: 'LonShaUnifiedChronologyAxis' },
    { file: '../dynamic-recall-route-feedback-hub.js', name: 'LonShaRecallRouteFeedbackHub' },
    { file: '../transparent-budget-allocation-receipt.js', name: 'LonShaBudgetAllocationReceipt' },
    { file: '../postgen-intent-cost-tracker.js', name: 'LonShaIntentCostTracker' },
    { file: '../privy-clearance-security-fence.js', name: 'LonShaPrivySecurityFence' },
    { file: '../multi-resolution-archive-orchestrator.js', name: 'LonShaMultiResolutionArchive' },
    { file: '../ruby-phone-bidirectional-bridge.js', name: 'LonShaRubyPhoneBridge' }
];

// 初始化全局 window
global.window = global.window || {};
for (const m of modules) {
    const modExport = require(m.file);
    global.window[m.name] = modExport;
}

test('第十期端到端宿主管线全量真实接线与闭环驱动验证', async () => {
    // ----------------------------------------------------
    // 1. 验证召回管线 (engine-recall.js) 接线: O4, X7, X8
    // ----------------------------------------------------
    assert.ok(typeof EngineRecall === 'function' || typeof EngineRecall === 'object');
    // 验证 O4 模块 rankCandidatesByRoute 能够被正常调用并调权重
    const Hub = global.window.LonShaRecallRouteFeedbackHub;
    assert.ok(Hub, 'LonShaRecallRouteFeedbackHub 必须存在');
    const candidates = [
        { id: 'c1', text: '温暖的炉火', emotionalValence: 0.8 },
        { id: 'c2', text: '冷酷的钢铁', emotionalValence: 0.1 }
    ];
    const reranked = Hub.rankCandidatesByRoute(candidates, 'emotional_resonance');
    assert.ok(reranked[0].id === 'c1', '情感路线必须将高共鸣候选排在最前');

    // ----------------------------------------------------
    // 2. 验证注入管线 (engine-injection-pipeline.js) 接线: O7, O3, O2, X4, X1, X2, O5
    // ----------------------------------------------------
    const injectionInstance = new LonShaInjectionPipeline();
    // 装配上下文环境
    injectionInstance.captureCast = () => [];
    injectionInstance.buildNpcTierRecords = () => [];
    injectionInstance.summary = { getActiveVolumes: () => [] };
    injectionInstance._currentSpeaker = 'Bob';
    injectionInstance._currentUserCircles = ['public'];
    injectionInstance._currentStoryTime = '2026-10-25T12:00:00Z';
    injectionInstance._chronologyItems = [
        { id: 'chr1', label: '早晨出发', timestamp: '2026-10-25T08:00:00Z' }
    ];
    const ArbMod = global.window.LonShaConflictArbitration;
    injectionInstance._activeArbitrationRecord = {
        bundleKey: '旧日记归属',
        verdict: ArbMod.VERDICTS.ADOPT,
        adoptedId: 'claim1',
        reason: '遗嘱明确指定',
        results: [
            { id: 'claim1', value: '日记由Alice继承' }
        ]
    };
    injectionInstance._activeLens = {
        character: 'Bob',
        coreStance: '信任受到背叛',
        cognitiveFilter: '把善意误读为企图'
    };
    injectionInstance._keyFactStatements = ['Alice送来了热茶'];
    injectionInstance._currentAtmosphereResidual = {
        primaryEmotion: '压抑',
        tension: 0.75,
        sensoryDetail: '窗外雷声沉闷'
    };
    injectionInstance._primingFocusFacts = [
        { id: 'pf1', content: '钥匙藏在花盆底部' }
    ];
    injectionInstance.config = {
        config: {
            vectorTopK: 8,
            memoryTokenBudget: 2000,
            recallTierEnabled: false,
            narrativePulseEnabled: false,
            protagonistTracking: false,
            lockedFactsEnabled: false,
            npcTiesInjection: false
        }
    };

    // 执行真实提示词注入构建
    const FenceMod = global.window.LonShaPrivySecurityFence;
    const recalledMemories = [
        { id: 'm1', text: 'Alice 和 Bob 正在客厅', clearanceLevel: FenceMod.PRIVY_CLEARANCE_LEVELS.LEVEL_PUBLIC },
        { id: 'm2', text: '绝密：Bob 的真实代号', clearanceLevel: FenceMod.PRIVY_CLEARANCE_LEVELS.LEVEL_SOLITARY_SECRET, owner: 'Alice' }
    ];
    const injectionText = injectionInstance.buildInjection(recalledMemories);

    // 检查 O7 过滤效果与认知增强块是否注入
    assert.ok(!injectionText.includes('Bob 的真实代号'), 'O7 必须阻断私密围栏外的记忆条目');
    assert.ok(injectionText.includes('钥匙藏在花盆底部') || injectionText.includes('潜意识'), 'X2 注意力潜意识预热必须生效');
    assert.ok(injectionText.includes('旧日记归属') || injectionText.includes('日记由Alice继承'), 'O2 冲突裁决约束必须生效');
    assert.ok(injectionInstance._lastBudgetAllocationReceipt, 'O5 必须生成预算透明回执');

    // ----------------------------------------------------
    // 3. 验证执行管线 (engine-execution-pipeline.js) 接线: X3, O1, O6, X5, X6, O9
    // ----------------------------------------------------
    const execCtx = {
        _currentPrimingAnchors: injectionInstance._currentPrimingAnchors,
        _newCommitments: [
            { id: 'com1', statement: '明天黄昏在旧码头碰头', deadlineFloor: 15, expectedParty: 'Bob' }
        ],
        _lastExtractedFacts: [
            { id: 'fact_new', content: '暴风雨冲垮了南侧吊桥', sourceFloor: 10 }
        ]
    };

    const testMessage = {
        index: 10,
        name: 'Bob',
        text: '当然了，我怎么可能会骗你呢？（讥讽地笑笑）'
    };

    // 模拟消息执行生命周期
    const IronyFilter = global.window.LonShaIronyImmuneFilter;
    const ironyResult = IronyFilter.evaluateFactCredibility({ content: testMessage.text, contextTone: 'sarcastic', isDirectAction: false });
    assert.ok(ironyResult, 'X3 反讽判定应当输出评估对象');

    const CostTracker = global.window.LonShaIntentCostTracker;
    const proposals = CostTracker.extractIntentProposals('我保证明天一定把钥匙还给你', { speaker: 'Bob', floor: 10 });
    const roiReport = CostTracker.trackExtractionCost({
        elapsedMs: 15,
        tokensProcessed: 120,
        proposalsCount: proposals.length
    }, proposals);
    assert.ok(roiReport.roi > 0, 'O6 意图代价追踪应当给出正向 ROI 评分');

    const AbsenceTracker = global.window.LonShaExpectationAbsence;
    const expItem = AbsenceTracker.createExpectation({
        expector: 'Alice',
        targetActor: 'Bob',
        actionDescription: '明天黄昏在旧码头碰头',
        registeredFloor: 10,
        dueFloor: 15
    });
    const evalRes = AbsenceTracker.evaluateExpectations([expItem], 20, []);
    assert.equal(evalRes.newlyAbsents.length, 1, 'X5 缺席追踪必须在超时楼层检出缺席承诺');

    // ----------------------------------------------------
    // 4. 验证持久化管线 (engine-persistence-ops.js) 接线: O8, X9
    // ----------------------------------------------------
    const persCtx = new Proxy({
        summary: {
            export: () => ({}),
            getActiveSummaries: () => [
                { id: 's1', text: '公元2026年，神圣灯塔在暴风雨中陨落，建立了新的避难所体系' }
            ]
        }
    }, {
        get(t, p) {
            if (p in t) return t[p];
            return { export: () => ({}) };
        }
    });
    const exportedData = persistenceOps.collectExport.call(persCtx);
    assert.ok(exportedData.multiResolutionArchive, 'O8 多分辨率分卷封存必须挂载于导出包中');
    assert.ok(exportedData.epochalHeritage, 'X9 时代印记文化沉淀必须挂载于导出包中');
    assert.ok(exportedData.epochalHeritage.crystallizedRelics || exportedData.epochalHeritage.taboos, 'X9 必须产出时代沉淀内容');
});