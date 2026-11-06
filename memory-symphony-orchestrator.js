/* ============================================================
 * memory-symphony-orchestrator.js — [v3.457.0 · V19 记忆专版]
 * 全引擎全域编排与防混淆交响控制中枢 (Memory Symphony Full-Engine Orchestrator)
 * ------------------------------------------------------------
 * 【核心使命】
 * 将 LonSha 记忆引擎内部所有独立模块、算法引擎与认知机制深度串联：
 *   - 阶段 1 [Perception] 现场实体与发言人情境感知 (Context & Speaker Sensing)
 *   - 阶段 2 [Causal Pre-check] 不可逆世界不变量前摄校验与熔断 (Proactive Causal Guard)
 *   - 阶段 3 [Multi-route Recall] 图谱/稀疏/向量/卷摘要/手机记忆多路并发检索 (Multi-source Recall)
 *   - 阶段 4 [PEDSA Resonance] 仿生能量多跳扩散与 Hebbian 访问强化重排 (Resonance Consolidation)
 *   - 阶段 5 [Pyramid Evolution] 提取驱动分层折叠金字塔与演化替代处理 (Evolution Links Traversal)
 *   - 阶段 6 [Anti-Confusion Matrix] 实体指代消歧、互斥仲裁与认知锚定 (Anti-Confusion Disambiguation)
 *   - 阶段 7 [Cognitive Horizon] 亲历/共历/传闻/禁区四桶物理隔离与防全知封口 (Cognitive Horizon Filter)
 *   - 阶段 8 [Symphony Directives] 防混淆高阶注入指令装配与预算分配 (Directives & Injection Integration)
 *   - 阶段 9 [Telemetry & Audit] 全域调用链路透明留痕与诊断暴露 (Symphony Telemetry Line)
 *
 * 挂载：window.LonShaMemorySymphony / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemorySymphony = factory();
        root.MemorySymphonyOrchestrator = root.LonShaMemorySymphony;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.457.0';

    /**
     * 创建干净的交响编排状态机
     */
    function createState() {
        return {
            version: VERSION,
            totalSymphonyRounds: 0,
            activeEngines: [],
            lastOrchestrationTrace: null,
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合存档状态
     */
    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            totalSymphonyRounds: Number(raw.totalSymphonyRounds) || 0,
            activeEngines: Array.isArray(raw.activeEngines) ? raw.activeEngines.slice() : [],
            lastOrchestrationTrace: (raw.lastOrchestrationTrace && typeof raw.lastOrchestrationTrace === 'object') ? { ...raw.lastOrchestrationTrace } : null,
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 执行全域记忆引擎交响编排
     * @param {Object} engine - LonSha 引擎上下文
     * @param {Array} recallCandidates - 上游检索合并的候选记忆列表
     * @param {Object} query - 查询上下文 { text, characters, speaker, floor, ... }
     * @param {Object} options - 配置参数
     * @returns {Object} 编排治理后的结果 { candidates, directives, trace }
     */
    function orchestrateMemorySymphony(engine = {}, recallCandidates = [], query = {}, options = {}) {
        const trace = {
            version: VERSION,
            startTime: Date.now(),
            stages: {},
            inputCount: recallCandidates.length,
            outputCount: 0,
            resolvedConflicts: 0,
            disambiguatedCount: 0,
            antiConfusionDirectives: ''
        };

        if (!engine || typeof engine !== 'object') {
            trace.error = 'Invalid engine instance';
            return { candidates: recallCandidates, directives: '', trace };
        }

        let candidates = Array.isArray(recallCandidates) ? recallCandidates.slice() : [];
        const cfg = (engine.config && engine.config.config) || {};

        // ---------------- [阶段 1: 现场实体与发言人感知] ----------------
        const knownCharacters = (typeof engine.getKnownCharacters === 'function') 
            ? engine.getKnownCharacters() 
            : (Array.isArray(query.characters) ? query.characters : []);
        const currentSpeaker = query.speaker || engine._currentSpeaker || (knownCharacters[0] || '对方');
        const activeFloor = Number(query.floor || engine._currentFloor || 1);

        trace.stages.perception = {
            knownCharacters: knownCharacters.slice(0, 5),
            currentSpeaker,
            activeFloor
        };

        // ---------------- [阶段 2: 前摄因果校验与世界不变量碰撞] ----------------
        let causalFiltered = candidates;
        try {
            const causalLib = (typeof engine._causalCircuitLib === 'function') 
                ? engine._causalCircuitLib() 
                : (typeof LonShaCausalCircuit !== 'undefined' ? LonShaCausalCircuit : (typeof require !== 'undefined' ? (() => { try { return require('./proactive-causal-verification-circuit.js'); } catch { return null; } })() : null));
            if (causalLib && typeof causalLib.verifyCausalInvariants === 'function') {
                const invariants = (engine.invariants && Array.isArray(engine.invariants.items)) ? engine.invariants.items : [];
                const passed = [];
                let violations = 0;
                for (const item of candidates) {
                    const check = causalLib.verifyCausalInvariants(item, invariants);
                    if (check && check.allowed === false) {
                        violations++;
                    } else {
                        passed.push(item);
                    }
                }
                causalFiltered = passed;
                trace.stages.causalCircuit = { checked: candidates.length, violations };
            } else {
                trace.stages.causalCircuit = { status: 'skipped_or_unavailable' };
            }
        } catch (e) {
            trace.stages.causalCircuit = { error: String(e && e.message) };
        }

        // ---------------- [阶段 3: 多维防混淆与实体认知锚定矩阵] ----------------
        let disambiguatedCandidates = causalFiltered;
        let generatedDirectives = '';
        const antiConfusionOn = cfg.antiConfusionEnabled !== false;
        try {
            const antiConfusionLib = (typeof engine._antiConfusionLib === 'function') 
                ? engine._antiConfusionLib() 
                : (typeof LonShaAntiConfusion !== 'undefined' ? LonShaAntiConfusion : (typeof require !== 'undefined' ? (() => { try { return require('./anti-confusion-matrix-disambiguator.js'); } catch { return null; } })() : null));
            if (antiConfusionOn && antiConfusionLib && typeof antiConfusionLib.disambiguateMemoryCandidates === 'function') {
                if (!engine._antiConfusionState || typeof engine._antiConfusionState !== 'object') {
                    engine._antiConfusionState = antiConfusionLib.createState();
                }
                const disResult = antiConfusionLib.disambiguateMemoryCandidates(causalFiltered, {
                    knownCharacters,
                    currentSpeaker,
                    userName: (typeof engine.getUserName === 'function') ? engine.getUserName() : '你',
                    activeFloor
                }, engine._antiConfusionState);

                disambiguatedCandidates = disResult.candidates || causalFiltered;
                generatedDirectives = disResult.directives || '';
                trace.disambiguatedCount = disResult.disambiguatedCount || 0;
                trace.resolvedConflicts = (disResult.resolvedConflicts || []).length;
                trace.antiConfusionDirectives = generatedDirectives;
                trace.stages.antiConfusion = {
                    disambiguated: disResult.disambiguatedCount,
                    conflictsResolved: (disResult.resolvedConflicts || []).length
                };
            } else {
                trace.stages.antiConfusion = { status: antiConfusionOn ? 'skipped_or_unavailable' : 'disabled' };
            }
        } catch (e) {
            trace.stages.antiConfusion = { error: String(e && e.message) };
        }

        // ---------------- [阶段 3.5: V20 认知心理防御与潜意识移情扭曲] ----------------
        let psychologicallyDistorted = disambiguatedCandidates;
        const psychOn = cfg.psychologicalDefenseEnabled !== false;
        try {
            const psychLib = (typeof engine._psychologicalDefenseLib === 'function')
                ? engine._psychologicalDefenseLib()
                : (typeof LonShaPsychologicalDefense !== 'undefined' ? LonShaPsychologicalDefense : (typeof require !== 'undefined' ? (() => { try { return require('./psychological-defense-engine.js'); } catch { return null; } })() : null));
            if (psychOn && psychLib && typeof psychLib.evaluatePsychologicalDistortion === 'function') {
                if (!engine._psychologicalDefenseState || typeof engine._psychologicalDefenseState !== 'object') {
                    engine._psychologicalDefenseState = psychLib.createState();
                }
                const psychRes = psychLib.evaluatePsychologicalDistortion(disambiguatedCandidates, {
                    currentSpeaker,
                    inSceneCharacters: knownCharacters,
                    queryText: query.text || ''
                }, engine._psychologicalDefenseState);

                psychologicallyDistorted = psychRes.candidates || disambiguatedCandidates;
                if (psychRes.directives) {
                    generatedDirectives = generatedDirectives 
                        ? `${generatedDirectives}\n${psychRes.directives}` 
                        : psychRes.directives;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
                trace.stages.psychologicalDefense = {
                    distortedCount: psychRes.distortedCount || 0
                };
            } else {
                trace.stages.psychologicalDefense = { status: psychOn ? 'skipped_or_unavailable' : 'disabled' };
            }
        } catch (e) {
            trace.stages.psychologicalDefense = { error: String(e && e.message) };
        }

        // ---------------- [阶段 4: 认知视界四桶动态隔离与防全知] ----------------
        let finalCandidates = psychologicallyDistorted;
        try {
            const horizonLib = (typeof engine._cognitiveHorizonLib === 'function') 
                ? engine._cognitiveHorizonLib() 
                : (typeof LonShaCognitiveHorizonFilter !== 'undefined' ? LonShaCognitiveHorizonFilter : (typeof require !== 'undefined' ? (() => { try { return require('./cognitive-horizon-bucket-filter.js'); } catch { return null; } })() : null));
            if (horizonLib && typeof horizonLib.filterContextForCognitiveHorizon === 'function') {
                const viewer = currentSpeaker || '当前角色';
                const filterRes = horizonLib.filterContextForCognitiveHorizon(disambiguatedCandidates, viewer, {
                    inSceneCharacters: knownCharacters,
                    strictOmniscienceBan: true
                });
                if (Array.isArray(filterRes)) {
                    finalCandidates = filterRes;
                } else if (filterRes && Array.isArray(filterRes.allowed)) {
                    finalCandidates = filterRes.allowed;
                }
                trace.stages.cognitiveHorizon = {
                    viewer,
                    before: disambiguatedCandidates.length,
                    after: finalCandidates.length
                };
            } else {
                trace.stages.cognitiveHorizon = { status: 'skipped_or_unavailable' };
            }
        } catch (e) {
            trace.stages.cognitiveHorizon = { error: String(e && e.message) };
        }

        trace.outputCount = finalCandidates.length;
        trace.durationMs = Date.now() - trace.startTime;

        // 更新交响状态留痕
        if (!engine._symphonyState || typeof engine._symphonyState !== 'object') {
            engine._symphonyState = createState();
        }
        engine._symphonyState.totalSymphonyRounds = (engine._symphonyState.totalSymphonyRounds || 0) + 1;
        engine._symphonyState.lastOrchestrationTrace = trace;
        engine._symphonyState.updatedAt = Date.now();

        return {
            candidates: finalCandidates,
            directives: generatedDirectives,
            trace
        };
    }

    return {
        VERSION,
        createState,
        hydrateState,
        orchestrateMemorySymphony
    };
}));