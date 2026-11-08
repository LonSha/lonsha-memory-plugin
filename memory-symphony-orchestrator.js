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
        const queryText = String(query.text || query.queryText || '');

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
        // [L17-O6] 剧情日历因果不变量主动熔断
        try {
            const fuseLockLib = (typeof LonShaCausalInvariantFuseLock !== 'undefined' ? LonShaCausalInvariantFuseLock : (typeof require !== 'undefined' ? (() => { try { return require('./causality-invariant-fuse-lock.js'); } catch { return null; } })() : null));
            if (fuseLockLib && engine._causalityFuseLockState) {
                const fusePassed = [];
                for (const c of causalFiltered) {
                    const chk = fuseLockLib.verifyCausality(c, engine._causalityFuseLockState);
                    if (chk && chk.violation) {
                        fuseLockLib.tripFuse(engine._causalityFuseLockState, chk.reason);
                    } else {
                        fusePassed.push(c);
                    }
                }
                causalFiltered = fusePassed;
            }
        } catch (e) {}
        // [L17-O3] 矛盾假说级联作废与信念自愈 DAG 校验
        try {
            const dagLib = (typeof LonShaBeliefSelfHealingDAG !== 'undefined' ? LonShaBeliefSelfHealingDAG : (typeof require !== 'undefined' ? (() => { try { return require('./cascading-belief-self-healing-dag.js'); } catch { return null; } })() : null));
            if (dagLib && engine._beliefDAGState) {
                causalFiltered = causalFiltered.filter(c => {
                    const cid = c.id || c.factId;
                    if (cid && engine._beliefDAGState.nodes && engine._beliefDAGState.nodes[cid]) {
                        return engine._beliefDAGState.nodes[cid].valid !== false;
                    }
                    return true;
                });
            }
        } catch (e) {}

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

        // [L17-O5] 现场在场与高亲密度多角色代词消歧图谱
        try {
            const disambigLib = (typeof LonShaEntityDisambiguator !== 'undefined' ? LonShaEntityDisambiguator : (typeof require !== 'undefined' ? (() => { try { return require('./entity-disambiguation-affinity-graph.js'); } catch { return null; } })() : null));
            if (disambigLib && engine._entityDisambiguationState) {
                const queryText = String(query.text || query.queryText || '');
                for (const pronoun of ['他', '她', '它', '他们']) {
                    if (queryText.includes(pronoun)) {
                        const target = disambigLib.resolvePronounTarget(engine._entityDisambiguationState, pronoun, knownCharacters);
                        if (target && !disambiguatedCandidates.some(c => (c.text || '').includes(target))) {
                            // 保持上下文代词绑定
                        }
                    }
                }
            }
        } catch (e) {}

        // [L17-O4] 万级长局记忆分层金字塔聚类与动态注意力弹性伸缩
        try {
            const pyramidLib = (typeof LonShaHierarchicalPyramidAttention !== 'undefined' ? LonShaHierarchicalPyramidAttention : (typeof require !== 'undefined' ? (() => { try { return require('./hierarchical-pyramid-attention-elastic.js'); } catch { return null; } })() : null));
            if (pyramidLib && disambiguatedCandidates.length > 10) {
                const tension = engine._tensionScore || 0.5;
                const budgetRes = pyramidLib.adjustAttentionBudget(tension, 20);
                const pyramid = pyramidLib.buildHierarchicalPyramid(disambiguatedCandidates);
                if (pyramid && pyramid.macroSummaries && pyramid.macroSummaries.length > 0) {
                    disambiguatedCandidates = pyramidLib.condenseContextByPyramid(pyramid, budgetRes.detailLimit);
                }
            }
        } catch (e) {}

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

        // ---------------- [阶段 3.6: V20 反事实假想沙盒防火墙隔离] ----------------
        let firewallSanitized = psychologicallyDistorted;
        const firewallOn = cfg.counterfactualFirewallEnabled !== false;
        try {
            const fwLib = (typeof engine._counterfactualFirewallLib === 'function')
                ? engine._counterfactualFirewallLib()
                : (typeof LonShaCounterfactualFirewall !== 'undefined' ? LonShaCounterfactualFirewall : (typeof require !== 'undefined' ? (() => { try { return require('./counterfactual-firewall-engine.js'); } catch { return null; } })() : null));
            if (firewallOn && fwLib && typeof fwLib.sanitizeCanonicalCandidates === 'function') {
                if (!engine._counterfactualFirewallState || typeof engine._counterfactualFirewallState !== 'object') {
                    engine._counterfactualFirewallState = fwLib.createInitialFirewallState();
                }
                const fwRes = fwLib.sanitizeCanonicalCandidates(engine._counterfactualFirewallState, psychologicallyDistorted, {
                    query: query.text || '',
                    actorName: currentSpeaker
                });
                firewallSanitized = fwRes.cleanMemories || psychologicallyDistorted;
                if (Array.isArray(fwRes.echoDirectives) && fwRes.echoDirectives.length > 0) {
                    const fwTxt = fwRes.echoDirectives.join('\n');
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${fwTxt}` : fwTxt;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
                trace.stages.counterfactualFirewall = {
                    quarantinedCount: fwRes.quarantinedCount || 0
                };
            } else {
                trace.stages.counterfactualFirewall = { status: firewallOn ? 'skipped_or_unavailable' : 'disabled' };
            }
        } catch (e) {
            trace.stages.counterfactualFirewall = { error: String(e && e.message) };
        }

        // ---------------- [阶段 3.7: V20 视差博弈矩阵与宏观纪元文化漂移] ----------------
        const parallaxOn = cfg.epistemicParallaxMatrixEnabled !== false;
        try {
            const paraLib = (typeof engine._epistemicParallaxLib === 'function')
                ? engine._epistemicParallaxLib()
                : (typeof LonShaEpistemicMatrix !== 'undefined' ? LonShaEpistemicMatrix : (typeof require !== 'undefined' ? (() => { try { return require('./epistemic-parallax-asymmetry-matrix.js'); } catch { return null; } })() : null));
            if (parallaxOn && paraLib && typeof paraLib.resolvePerspectiveDirectives === 'function' && engine._epistemicParallaxState) {
                const paraDirs = paraLib.resolvePerspectiveDirectives(engine._epistemicParallaxState, currentSpeaker, knownCharacters);
                if (paraDirs && paraDirs.length > 0) {
                    const pTxt = paraDirs.join('\n');
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${pTxt}` : pTxt;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const epochOn = cfg.macroEpochDriftEnabled !== false;
        try {
            const epochLib = (typeof engine._macroEpochLib === 'function')
                ? engine._macroEpochLib()
                : (typeof LonShaMacroEpochDrift !== 'undefined' ? LonShaMacroEpochDrift : (typeof require !== 'undefined' ? (() => { try { return require('./macro-epoch-cultural-drift-engine.js'); } catch { return null; } })() : null));
            if (epochOn && epochLib && typeof epochLib.resolveEpochCulturalDirectives === 'function' && engine._macroEpochState) {
                const epDir = epochLib.resolveEpochCulturalDirectives(engine._macroEpochState);
                if (epDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${epDir}` : epDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        // ---------------- [阶段 3.8: V20 特工潜伏、心理创伤与誓约反噬] ----------------
        const espionageOn = cfg.covertEspionageEnabled !== false;
        try {
            const espLib = (typeof engine._covertEspionageLib === 'function')
                ? engine._covertEspionageLib()
                : (typeof LonShaCovertEspionage !== 'undefined' ? LonShaCovertEspionage : (typeof require !== 'undefined' ? (() => { try { return require('./covert-espionage-exposure-hub.js'); } catch { return null; } })() : null));
            if (espionageOn && espLib && typeof espLib.resolveEspionageDirectives === 'function' && engine._covertEspionageState) {
                const espDirs = espLib.resolveEspionageDirectives(engine._covertEspionageState, currentSpeaker, knownCharacters);
                if (espDirs && espDirs.length > 0) {
                    const eTxt = espDirs.join('\n');
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${eTxt}` : eTxt;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const traumaOn = cfg.obsessiveTraumaEnabled !== false;
        try {
            const traumaLib = (typeof engine._obsessiveTraumaLib === 'function')
                ? engine._obsessiveTraumaLib()
                : (typeof LonShaObsessiveTrauma !== 'undefined' ? LonShaObsessiveTrauma : (typeof require !== 'undefined' ? (() => { try { return require('./obsessive-trauma-taboo-engine.js'); } catch { return null; } })() : null));
            if (traumaOn && traumaLib && typeof traumaLib.resolveTraumaDirectives === 'function' && engine._obsessiveTraumaState) {
                const tDirs = traumaLib.resolveTraumaDirectives(engine._obsessiveTraumaState, currentSpeaker, query.text || '');
                if (tDirs && tDirs.length > 0) {
                    const tTxt = tDirs.join('\n');
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${tTxt}` : tTxt;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const covenantOn = cfg.dynamicCovenantEnabled !== false;
        try {
            const covLib = (typeof engine._dynamicCovenantLib === 'function')
                ? engine._dynamicCovenantLib()
                : (typeof LonShaCovenantEngine !== 'undefined' ? LonShaCovenantEngine : (typeof require !== 'undefined' ? (() => { try { return require('./dynamic-covenant-consequence-engine.js'); } catch { return null; } })() : null));
            if (covenantOn && covLib && typeof covLib.resolveCovenantDirectives === 'function' && engine._dynamicCovenantState) {
                const cDirs = covLib.resolveCovenantDirectives(engine._dynamicCovenantState, currentSpeaker);
                if (cDirs && cDirs.length > 0) {
                    const cTxt = cDirs.join('\n');
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${cTxt}` : cTxt;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        // ---------------- [阶段 3.9: V20 梦境隐喻、生理微表情与多方博弈张力] ----------------
        const dreamOn = cfg.dreamMetaphorEnabled !== false;
        try {
            const dreamLib = (typeof engine._dreamMetaphorLib === 'function')
                ? engine._dreamMetaphorLib()
                : (typeof DreamSubconsciousMetaphorSynthesizer !== 'undefined' ? DreamSubconsciousMetaphorSynthesizer : (typeof require !== 'undefined' ? (() => { try { return require('./dream-subconscious-metaphor-synthesizer.js'); } catch { return null; } })() : null));
            if (dreamOn && dreamLib && typeof dreamLib.generateDreamEchoDirective === 'function' && engine._dreamMetaphorState) {
                const dEcho = dreamLib.generateDreamEchoDirective({ dreamState: engine._dreamMetaphorState, speaker: currentSpeaker });
                if (dEcho) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${dEcho}` : dEcho;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const somaticOn = cfg.somaticReflexEnabled !== false;
        try {
            const somaticLib = (typeof engine._somaticReflexLib === 'function')
                ? engine._somaticReflexLib()
                : (typeof SomaticMicroExpressionReflexEngine !== 'undefined' ? SomaticMicroExpressionReflexEngine : (typeof require !== 'undefined' ? (() => { try { return require('./somatic-micro-expression-reflex-engine.js'); } catch { return null; } })() : null));
            if (somaticOn && somaticLib && typeof somaticLib.evaluateSomaticReflex === 'function' && typeof somaticLib.generateSomaticDirective === 'function') {
                const stress = (engine._obsessiveTraumaState && engine._obsessiveTraumaState.characterProfiles && engine._obsessiveTraumaState.characterProfiles[currentSpeaker])
                    ? engine._obsessiveTraumaState.characterProfiles[currentSpeaker].stressMeter : 0;
                const somaticReport = somaticLib.evaluateSomaticReflex({ character: currentSpeaker, stressLevel: stress, text: queryText });
                if (somaticReport) {
                    const sTxt = somaticLib.generateSomaticDirective({ somaticReport });
                    if (sTxt) {
                        generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${sTxt}` : sTxt;
                        trace.antiConfusionDirectives = generatedDirectives;
                    }
                }
            }
        } catch (e) {}

        const gameTheoryOn = cfg.multiAgentGameTheoryEnabled !== false;
        try {
            const gameLib = (typeof engine._gameTheoryLib === 'function')
                ? engine._gameTheoryLib()
                : (typeof MultiAgentGameTheoryCoordinator !== 'undefined' ? MultiAgentGameTheoryCoordinator : (typeof require !== 'undefined' ? (() => { try { return require('./multi-agent-game-theory-coordinator.js'); } catch { return null; } })() : null));
            if (gameTheoryOn && gameLib && typeof gameLib.evaluateGameBalance === 'function' && engine._gameTheoryState) {
                const gDir = gameLib.evaluateGameBalance({ state: engine._gameTheoryState, speaker: currentSpeaker, others: knownCharacters });
                if (gDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${gDir}` : gDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const atlasOn = cfg.deepMemoryAtlasEnabled !== false;
        try {
            const atlasLib = (typeof engine._deepMemoryAtlasLib === 'function')
                ? engine._deepMemoryAtlasLib()
                : (typeof DeepMemoryDistillationAtlas !== 'undefined' ? DeepMemoryDistillationAtlas : (typeof require !== 'undefined' ? (() => { try { return require('./deep-memory-distillation-atlas.js'); } catch { return null; } })() : null));
            if (atlasOn && atlasLib && typeof atlasLib.generateAtlasDirectives === 'function' && engine._deepMemoryAtlasState) {
                const aDir = atlasLib.generateAtlasDirectives(engine._deepMemoryAtlasState, currentSpeaker);
                if (aDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${aDir}` : aDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const territoryOn = cfg.factionTerritoryEnabled !== false;
        try {
            const terrLib = (typeof engine._factionTerritoryLib === 'function')
                ? engine._factionTerritoryLib()
                : (typeof DynamicFactionTerritoryTopologyHub !== 'undefined' ? DynamicFactionTerritoryTopologyHub : (typeof require !== 'undefined' ? (() => { try { return require('./dynamic-faction-territory-topology-hub.js'); } catch { return null; } })() : null));
            if (territoryOn && terrLib && typeof terrLib.generateTerritoryDirectives === 'function' && engine._factionTerritoryState) {
                const tDir = terrLib.generateTerritoryDirectives(engine._factionTerritoryState);
                if (tDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${tDir}` : tDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const flashbackOn = cfg.longTailFlashbackEnabled !== false;
        try {
            const fbLib = (typeof engine._longTailFlashbackLib === 'function')
                ? engine._longTailFlashbackLib()
                : (typeof LongTailFlashbackResonanceHub !== 'undefined' ? LongTailFlashbackResonanceHub : (typeof require !== 'undefined' ? (() => { try { return require('./long-tail-flashback-resonance-hub.js'); } catch { return null; } })() : null));
            if (flashbackOn && fbLib && typeof fbLib.evaluateFlashbackResonance === 'function' && engine._longTailFlashbackState) {
                const curFlr = (typeof engine.getCurrentFloor === 'function' ? engine.getCurrentFloor() : 100) || 100;
                const awakened = fbLib.evaluateFlashbackResonance(engine._longTailFlashbackState, { text: queryText, currentFloor: curFlr, speaker: currentSpeaker });
                if (awakened && awakened.length > 0) {
                    const fbDir = fbLib.generateFlashbackDirectives(awakened, currentSpeaker);
                    if (fbDir) {
                        generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${fbDir}` : fbDir;
                        trace.antiConfusionDirectives = generatedDirectives;
                    }
                }
            }
        } catch (e) {}

        const reputationOn = cfg.multiDimensionalReputationEnabled !== false;
        try {
            const repLib = (typeof engine._reputationSocialGraphLib === 'function')
                ? engine._reputationSocialGraphLib()
                : (typeof MultiDimensionalReputationSocialGraph !== 'undefined' ? MultiDimensionalReputationSocialGraph : (typeof require !== 'undefined' ? (() => { try { return require('./multi-dimensional-reputation-social-graph.js'); } catch { return null; } })() : null));
            if (reputationOn && repLib && typeof repLib.generateReputationDirectives === 'function' && engine._reputationSocialGraphState) {
                const repDir = repLib.generateReputationDirectives(engine._reputationSocialGraphState, currentSpeaker, knownCharacters);
                if (repDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${repDir}` : repDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const soulBrandOn = cfg.soulBrandReincarnationEnabled !== false;
        try {
            const soulLib = (typeof engine._soulBrandReincarnationLib === 'function')
                ? engine._soulBrandReincarnationLib()
                : (typeof SoulBrandReincarnationHub !== 'undefined' ? SoulBrandReincarnationHub : (typeof require !== 'undefined' ? (() => { try { return require('./soul-brand-reincarnation-hub.js'); } catch { return null; } })() : null));
            if (soulBrandOn && soulLib && typeof soulLib.evaluateSoulBrandResonance === 'function' && engine._soulBrandReincarnationState) {
                const sDir = soulLib.evaluateSoulBrandResonance(engine._soulBrandReincarnationState, { speaker: currentSpeaker, presentCharacters: knownCharacters, currentContext: queryText });
                if (sDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${sDir}` : sDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        const climaxLoomOn = cfg.fateClimaxLoomEnabled !== false;
        try {
            const loomLib = (typeof engine._fateClimaxLoomLib === 'function')
                ? engine._fateClimaxLoomLib()
                : (typeof FateConvergenceClimaxLoom !== 'undefined' ? FateConvergenceClimaxLoom : (typeof require !== 'undefined' ? (() => { try { return require('./fate-convergence-climax-loom.js'); } catch { return null; } })() : null));
            if (climaxLoomOn && loomLib && typeof loomLib.evaluateClimaxConvergence === 'function' && engine._fateClimaxLoomState) {
                const cDir = loomLib.evaluateClimaxConvergence(engine._fateClimaxLoomState, { speaker: currentSpeaker, presentCharacters: knownCharacters });
                if (cDir) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${cDir}` : cDir;
                    trace.antiConfusionDirectives = generatedDirectives;
                }
            }
        } catch (e) {}

        // ---------------- [阶段 3.10: V21 史诗级心智扩展引擎指令注入] ----------------
        try {
            // L21-X1: WorldAxis 客观世界快照主观折射
            const waLib = (typeof LonShaWorldAxisAssimilator !== 'undefined' ? LonShaWorldAxisAssimilator : (typeof require !== 'undefined' ? (() => { try { return require('./worldaxis-objective-to-subjective-assimilator.js'); } catch { return null; } })() : null));
            if (waLib && engine._worldaxisAssimilatorState) {
                const waDir = waLib.generateAssimilatorDirectives(engine._worldaxisAssimilatorState, currentSpeaker);
                if (waDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${waDir}` : waDir;
            }
        } catch (e) {}
        try {
            // L21-X2: 闲暇梦境与反刍隐喻
            const dreamLib = (typeof LonShaRuminationDream !== 'undefined' ? LonShaRuminationDream : (typeof require !== 'undefined' ? (() => { try { return require('./autonomous-rumination-dream-engine.js'); } catch { return null; } })() : null));
            if (dreamLib && engine._ruminationDreamState) {
                const dDir = dreamLib.generateRuminationDirectives(engine._ruminationDreamState, currentSpeaker);
                if (dDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${dDir}` : dDir;
            }
        } catch (e) {}
        try {
            // L21-X4: 自律神经与躯体微表情爆发
            const flareLib = (typeof LonShaSomaticFlare !== 'undefined' ? LonShaSomaticFlare : (typeof require !== 'undefined' ? (() => { try { return require('./autonomic-nervous-somatic-flare-engine.js'); } catch { return null; } })() : null));
            if (flareLib && engine._somaticFlareState) {
                const fDir = flareLib.generateSomaticFlareDirectives(engine._somaticFlareState, currentSpeaker);
                if (fDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${fDir}` : fDir;
            }
        } catch (e) {}
        try {
            // L21-X7: 隐秘特工身份暴露风险矩阵
            const riskLib = (typeof LonShaExposureRisk !== 'undefined' ? LonShaExposureRisk : (typeof require !== 'undefined' ? (() => { try { return require('./dual-identity-exposure-risk-matrix.js'); } catch { return null; } })() : null));
            if (riskLib && engine._exposureRiskState) {
                const rDir = riskLib.generateRiskDirectives(engine._exposureRiskState, currentSpeaker);
                if (rDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${rDir}` : rDir;
            }
        } catch (e) {}
        try {
            // L21-X8: 心理耗竭与抗逆韧性衰减
            const burnLib = (typeof LonShaBurnoutDecay !== 'undefined' ? LonShaBurnoutDecay : (typeof require !== 'undefined' ? (() => { try { return require('./psychological-burnout-resilience-decay.js'); } catch { return null; } })() : null));
            if (burnLib && engine._burnoutDecayState) {
                const bDir = burnLib.generateBurnoutDirectives(engine._burnoutDecayState, currentSpeaker);
                if (bDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${bDir}` : bDir;
            }
        } catch (e) {}

        // ---------------- [阶段 3.12: 第十七期全新心智防御与草蛇灰线引擎] ----------------
        try {
            // L17-X1: 心理防御机制与自欺欺人叙事重塑
            const egoLib = (typeof LonShaEgoDefense !== "undefined" ? LonShaEgoDefense : (typeof require !== "undefined" ? (() => { try { return require("./ego-defense-mechanisms-engine.js"); } catch { return null; } })() : null));
            if (egoLib) {
                if (!engine._egoDefenseState) engine._egoDefenseState = egoLib.createState();
                engine._egoDefenseState = egoLib.processEgoThreat(engine._egoDefenseState, { text: queryText, speaker: currentSpeaker, floor: activeFloor });
                const egoDirs = egoLib.generateEgoDirectives(engine._egoDefenseState);
                if (egoDirs && egoDirs.length > 0) {
                    const joined = egoDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}

        // ---------------- [阶段 3.13: 第十八期灵魂深潜主观认知失真引擎] ----------------
        // L18-X1: 闪光灯主观时间膨胀与情绪像素定格
        try {
            if (engine.flashbulbDilationEngine && typeof engine.flashbulbDilationEngine.formatPromptInjection === 'function') {
                const flashPrompt = engine.flashbulbDilationEngine.formatPromptInjection(2);
                if (flashPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${flashPrompt}` : flashPrompt;
            }
        } catch (e) {}
        // L18-X2: 伪装面具与多重解离人格视界防火墙
        try {
            if (engine.dissociativeMaskMatrix && typeof engine.dissociativeMaskMatrix.formatMaskStatusPrompt === 'function') {
                const maskPrompt = engine.dissociativeMaskMatrix.formatMaskStatusPrompt();
                if (maskPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${maskPrompt}` : maskPrompt;
            }
        } catch (e) {}
        // L18-X3: 曼德拉记忆二次重构与自愈虚构
        try {
            if (engine.mandelaConfabulationEngine && typeof engine.mandelaConfabulationEngine.formatConfabulationInjection === 'function') {
                const confabPrompt = engine.mandelaConfabulationEngine.formatConfabulationInjection();
                if (confabPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${confabPrompt}` : confabPrompt;
            }
        } catch (e) {}
        // L18-X4: 普鲁斯特感官通感诱发反射
        try {
            if (engine.proustianSynesthesiaEngine) {
                const probeFn = engine.proustianSynesthesiaEngine.probeSensoryTriggers || engine.proustianSynesthesiaEngine.triggerBySensoryStimulus;
                if (typeof probeFn === 'function') {
                    const triggered = probeFn.call(engine.proustianSynesthesiaEngine, queryText);
                    if (triggered && triggered.length > 0) {
                        const proustPrompt = engine.proustianSynesthesiaEngine.formatProustianPrompt(triggered);
                        if (proustPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${proustPrompt}` : proustPrompt;
                    }
                }
            }
        } catch (e) {}
        // L18-X5: 蔡格尼克未闭合执念与潜意识反刍回路
        try {
            if (engine.zeigarnikLoopEngine && typeof engine.zeigarnikLoopEngine.formatRuminationPrompt === 'function') {
                const zeigPrompt = engine.zeigarnikLoopEngine.formatRuminationPrompt();
                if (zeigPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${zeigPrompt}` : zeigPrompt;
            }
        } catch (e) {}
        // L18-X6: 反事实推演与懊悔/侥幸代偿
        try {
            if (engine.whatIfRegretMatrix && typeof engine.whatIfRegretMatrix.formatCounterfactualPrompt === 'function') {
                const whatIfPrompt = engine.whatIfRegretMatrix.formatCounterfactualPrompt();
                if (whatIfPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${whatIfPrompt}` : whatIfPrompt;
            }
        } catch (e) {}
        // L18-X7: 群体流言熵增失真与 NPC 社交传染
        try {
            if (engine.rumorEntropyDiffusion && typeof engine.rumorEntropyDiffusion.formatRumorPrompt === 'function') {
                const rumorPrompt = engine.rumorEntropyDiffusion.formatRumorPrompt();
                if (rumorPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${rumorPrompt}` : rumorPrompt;
            }
        } catch (e) {}
        // L18-X8: 认知盲点与防御性选择性失聪守卫
        try {
            if (engine.cognitiveScatomaGuard && typeof engine.cognitiveScatomaGuard.formatScatomaPrompt === 'function') {
                const scatomaPrompt = engine.cognitiveScatomaGuard.formatScatomaPrompt();
                if (scatomaPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${scatomaPrompt}` : scatomaPrompt;
            }
        } catch (e) {}
        // L18-X9: 独处走神白日梦与潜意识心象漂移
        try {
            if (engine.daydreamWanderingEngine && typeof engine.daydreamWanderingEngine.formatDaydreamPrompt === 'function') {
                const daydreamPrompt = engine.daydreamWanderingEngine.formatDaydreamPrompt();
                if (daydreamPrompt) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${daydreamPrompt}` : daydreamPrompt;
            }
        } catch (e) {}
        try {
            // L17-X2: 宿命伏笔与草蛇灰线主动提问
            const foresLib = (typeof LonShaLatentForeshadowing !== "undefined" ? LonShaLatentForeshadowing : (typeof require !== "undefined" ? (() => { try { return require("./latent-plot-foreshadowing-engine.js"); } catch { return null; } })() : null));
            if (foresLib) {
                if (!engine._latentForeshadowingState) engine._latentForeshadowingState = foresLib.createState();
                const evalRes = foresLib.evaluateProactiveInquiry(engine._latentForeshadowingState, activeFloor);
                engine._latentForeshadowingState = evalRes.nextState;
                if (evalRes.shouldInquire && evalRes.candidate) {
                    const inqDirs = foresLib.generateInquiryDirectives(evalRes.candidate);
                    if (inqDirs && inqDirs.length > 0) {
                        const joined = inqDirs.join("\n");
                        generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                    }
                }
            }
        } catch (e) {}
        try {
            // L17-X3: 角色默契与专属私语暗号
            const tacitX3 = (typeof LonShaTacitIntimacy !== "undefined" ? LonShaTacitIntimacy : (typeof require !== "undefined" ? (() => { try { return require("./tacit-intimacy-code-engine.js"); } catch { return null; } })() : null));
            if (tacitX3) {
                if (!engine._tacitIntimacyState) engine._tacitIntimacyState = tacitX3.createState();
                const tacitDirs = tacitX3.generateTacitDirectives(engine._tacitIntimacyState, { currentSpeaker, userUtterance: queryText });
                if (tacitDirs && tacitDirs.length > 0) {
                    const joined = tacitDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        try {
            // L17-X4: 潜意识创伤禁忌三层防御
            const traumaX4 = (typeof LonShaTraumaTabooMatrix !== "undefined" ? LonShaTraumaTabooMatrix : (typeof require !== "undefined" ? (() => { try { return require("./trauma-taboo-defense-matrix.js"); } catch { return null; } })() : null));
            if (traumaX4) {
                if (!engine._traumaTabooState) engine._traumaTabooState = traumaX4.createState();
                const traumaDirs = traumaX4.generateTraumaDirectives(engine._traumaTabooState, queryText);
                if (traumaDirs && traumaDirs.length > 0) {
                    const joined = traumaDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        try {
            // L17-X5: 传闻流转的信息衰减与谣言异化
            const rumorX5 = (typeof LonShaRumorMutation !== "undefined" ? LonShaRumorMutation : (typeof require !== "undefined" ? (() => { try { return require("./rumor-mutation-entropy-engine.js"); } catch { return null; } })() : null));
            if (rumorX5) {
                if (!engine._rumorMutationState) engine._rumorMutationState = rumorX5.createState();
                const rumorDirs = rumorX5.generateRumorDirectives(engine._rumorMutationState);
                if (rumorDirs && rumorDirs.length > 0) {
                    const joined = rumorDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        try {
            // L17-X6: 日常生活节律共鸣与习惯沉淀
            const circX6 = (typeof LonShaCircadianRoutine !== "undefined" ? LonShaCircadianRoutine : (typeof require !== "undefined" ? (() => { try { return require("./circadian-shared-routine-engine.js"); } catch { return null; } })() : null));
            if (circX6) {
                if (!engine._circadianRoutineState) engine._circadianRoutineState = circX6.createState();
                const circDirs = circX6.generateRoutineDirectives(engine._circadianRoutineState);
                if (circDirs && circDirs.length > 0) {
                    const joined = circDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        try {
            // L17-X7: 誓约心锚与信任裂痕
            const oathX7 = (typeof LonShaOathFracture !== "undefined" ? LonShaOathFracture : (typeof require !== "undefined" ? (() => { try { return require("./oath-fracture-repercussion-engine.js"); } catch { return null; } })() : null));
            if (oathX7 && engine._oathFractureState) {
                const oathDirs = oathX7.generateFractureDirectives(engine._oathFractureState);
                if (oathDirs && oathDirs.length > 0) {
                    const joined = oathDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        try {
            // L17-X8: 反事实平行人生沙盘
            const counterX8 = (typeof LonShaCounterfactualSandbox !== "undefined" ? LonShaCounterfactualSandbox : (typeof require !== "undefined" ? (() => { try { return require("./counterfactual-multiverse-sandbox.js"); } catch { return null; } })() : null));
            if (counterX8 && engine._counterfactualState) {
                const countDirs = counterX8.generateCounterfactualDirectives(engine._counterfactualState);
                if (countDirs && countDirs.length > 0) {
                    const joined = countDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        try {
            // L17-X9: 有限空间声学衰减偷听与防全知隔断 (Spatial Whisper Guard)
            const whisperX9 = (typeof LonShaSpatialWhisperGuard !== "undefined" ? LonShaSpatialWhisperGuard : (typeof require !== "undefined" ? (() => { try { return require("./spatial-whisper-eavesdropping-guard.js"); } catch { return null; } })() : null));
            if (whisperX9 && engine._spatialWhisperState) {
                const whisperDirs = whisperX9.generateEavesdroppingDirectives(engine._spatialWhisperState);
                if (whisperDirs && whisperDirs.length > 0) {
                    const joined = whisperDirs.join("\n");
                    generatedDirectives = generatedDirectives ? (generatedDirectives + "\n" + joined) : joined;
                }
            }
        } catch (e) {}
        // ---------------- [阶段 3.11: V22 第十六期全新日常生活与心流互动引擎] ----------------
        try {
            // L16-X1: 对话动量与心流势头维持
            const momentumLib = (typeof LonShaNarrativeMomentum !== 'undefined' ? LonShaNarrativeMomentum : (typeof require !== 'undefined' ? (() => { try { return require('./narrative-momentum-flow-inertia-engine.js'); } catch { return null; } })() : null));
            if (momentumLib) {
                if (!engine._narrativeMomentumState) engine._narrativeMomentumState = momentumLib.createState();
                engine._narrativeMomentumState = momentumLib.updateMomentum(engine._narrativeMomentumState, { text: queryText, speaker: currentSpeaker, floor: activeFloor });
                const mDir = momentumLib.generateMomentumDirectives(engine._narrativeMomentumState);
                if (mDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${mDir}` : mDir;
            }
        } catch (e) {}

        try {
            // L16-X2: 隐性人情羁绊与互惠张力
            const bondLib = (typeof LonShaSocialBondReciprocity !== 'undefined' ? LonShaSocialBondReciprocity : (typeof require !== 'undefined' ? (() => { try { return require('./latent-social-bond-reciprocity-engine.js'); } catch { return null; } })() : null));
            if (bondLib && engine._socialBondState) {
                const bondDir = bondLib.generateReciprocityDirectives(engine._socialBondState, currentSpeaker);
                if (bondDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${bondDir}` : bondDir;
            }
        } catch (e) {}

        try {
            // L16-X3: 角色默契心领神会与未言明暗号
            const tacitLib = (typeof LonShaTacitUnderstanding !== 'undefined' ? LonShaTacitUnderstanding : (typeof require !== 'undefined' ? (() => { try { return require('./character-tacit-understanding-engine.js'); } catch { return null; } })() : null));
            if (tacitLib && engine._tacitUnderstandingState) {
                const tDir = tacitLib.generateTacitDirectives(engine._tacitUnderstandingState, currentSpeaker, queryText);
                if (tDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${tDir}` : tDir;
            }
        } catch (e) {}

        try {
            // L16-X4: 欲言又止与潜台词心机
            const hesitLib = (typeof LonShaUnspokenHesitation !== 'undefined' ? LonShaUnspokenHesitation : (typeof require !== 'undefined' ? (() => { try { return require('./unspoken-hesitation-subtext-engine.js'); } catch { return null; } })() : null));
            if (hesitLib && engine._unspokenHesitationState) {
                const hDir = hesitLib.generateHesitationDirectives(engine._unspokenHesitationState);
                if (hDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${hDir}` : hDir;
            }
        } catch (e) {}

        try {
            // L16-X5: 长期承诺与约定里程碑追踪
            const cmtLib = (typeof LonShaCommitmentMilestone !== 'undefined' ? LonShaCommitmentMilestone : (typeof require !== 'undefined' ? (() => { try { return require('./long-term-commitment-milestone-engine.js'); } catch { return null; } })() : null));
            if (cmtLib && engine._commitmentMilestoneState) {
                const cDir = cmtLib.generateCommitmentDirectives(engine._commitmentMilestoneState);
                if (cDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${cDir}` : cDir;
            }
        } catch (e) {}

        try {
            // L16-X6: 日常生活习惯共生与节律共鸣
            const routineLib = (typeof LonShaRoutineRhythm !== 'undefined' ? LonShaRoutineRhythm : (typeof require !== 'undefined' ? (() => { try { return require('./everyday-shared-routine-rhythm-engine.js'); } catch { return null; } })() : null));
            if (routineLib) {
                const rDir = routineLib.generateRoutineDirectives();
                if (rDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${rDir}` : rDir;
            }
        } catch (e) {}

        try {
            // L16-X7: 誓约心锚与背弃反噬共振中心
            const anchorLib = (typeof LonShaEmotionalAnchor !== 'undefined' ? LonShaEmotionalAnchor : (typeof require !== 'undefined' ? (() => { try { return require('./emotional-anchor-binding-resonance-hub.js'); } catch { return null; } })() : null));
            if (anchorLib && engine._emotionalAnchorState) {
                const aDir = anchorLib.generateAnchorDirectives(engine._emotionalAnchorState, currentSpeaker);
                if (aDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${aDir}` : aDir;
            }
        } catch (e) {}

        try {
            // L16-X8: 创伤禁忌三层渐进心理防线
            const multiTabooLib = (typeof LonShaMultiTierDefense !== 'undefined' ? LonShaMultiTierDefense : (typeof require !== 'undefined' ? (() => { try { return require('./obsessive-taboo-multi-tier-defense.js'); } catch { return null; } })() : null));
            if (multiTabooLib && engine._multiTierDefenseState) {
                const defenseRes = multiTabooLib.evaluatePsychologicalDefense(engine._multiTierDefenseState, currentSpeaker, queryText);
                if (defenseRes && defenseRes.directive) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${defenseRes.directive}` : defenseRes.directive;
                }
            }
        } catch (e) {}

        try {
            // L16-X9: 客观世界因果桥主观折射摄入引擎
            const assimLib = (typeof LonShaWorldAxisAssimilator !== 'undefined' ? LonShaWorldAxisAssimilator : (typeof require !== 'undefined' ? (() => { try { return require('./worldaxis-objective-to-subjective-assimilator.js'); } catch { return null; } })() : null));
            if (assimLib && engine._worldAxisAssimilatorState) {
                const asDir = assimLib.generateAssimilatorDirectives(engine._worldAxisAssimilatorState, currentSpeaker);
                if (asDir) generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${asDir}` : asDir;
            }
        } catch (e) {}

        try {
            // L16-O1: 全引擎交响总线波纹级联驱动 (Ripple Bus Dispatch)
            const rippleBusLib = (typeof LonShaEngineOrchestration !== 'undefined' ? LonShaEngineOrchestration : (typeof require !== 'undefined' ? (() => { try { return require('./engine-orchestration-ripple-bus.js'); } catch { return null; } })() : null));
            if (rippleBusLib && engine._rippleBusState) {
                const busResult = rippleBusLib.dispatchRippleEvent(engine._rippleBusState, {
                    type: 'symphony_round',
                    speaker: currentSpeaker,
                    queryText,
                    floor: activeFloor
                }, { engine, directives: generatedDirectives });
                trace.stages.rippleBus = { ok: busResult.ok, dispatched: busResult.dispatched };
            }
        } catch (e) {}

        try {
            // L16-O4: 分层折叠金字塔与演化替代处理 (Hierarchical Pyramid Evolution)
            const pyramidLib = (typeof HierarchicalPyramidEvolution !== 'undefined' ? HierarchicalPyramidEvolution : (typeof require !== 'undefined' ? (() => { try { return require('./hierarchical-pyramid-evolution.js'); } catch { return null; } })() : null));
            if (pyramidLib && engine._pyramidEvolutionState && candidates.length > 5) {
                const plan = pyramidLib.planHierarchicalClusters(candidates, engine._pyramidEvolutionState);
                if (plan && plan.clusters && plan.clusters.length > 0) {
                    trace.stages.pyramidClusters = plan.clusters.length;
                }
            }
        } catch (e) {}

        try {
            // L16-O8: 潜意识未明言动机暗涌推演 (Subconscious Undercurrent)
            const undercurrentLib = (typeof SubconsciousUndercurrentEngine !== 'undefined' ? SubconsciousUndercurrentEngine : (typeof require !== 'undefined' ? (() => { try { return require('./subconscious-undercurrent-engine.js'); } catch { return null; } })() : null));
            if (undercurrentLib && engine._subconsciousProfile) {
                const uRes = undercurrentLib.deduceUndercurrent(engine._subconsciousProfile, queryText);
                if (uRes && uRes.undercurrentDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${uRes.undercurrentDirective}` : uRes.undercurrentDirective;
                }
            }
        } catch (e) {}

        trace.antiConfusionDirectives = generatedDirectives;

        // ---------------- [阶段 4: 认知视界四桶动态隔离与防全知] ----------------
        let finalCandidates = firewallSanitized;
        // [L17-O2] 当事人与旁观见证动态四桶硬隔离 (Source Witness Isolation Guard)
        try {
            const witnessLib = (typeof LonShaSourceWitnessGuard !== 'undefined' ? LonShaSourceWitnessGuard : (typeof require !== 'undefined' ? (() => { try { return require('./source-witness-isolation-guard.js'); } catch { return null; } })() : null));
            if (witnessLib) {
                const viewer = currentSpeaker || '当前角色';
                const witRes = witnessLib.enforceWitnessIsolation(finalCandidates, viewer);
                if (witRes && Array.isArray(witRes.filteredCandidates)) {
                    finalCandidates = witRes.filteredCandidates;
                    if (witRes.defenseDirective) {
                        generatedDirectives = generatedDirectives ? (generatedDirectives + '\n' + witRes.defenseDirective) : witRes.defenseDirective;
                    }
                }
            }
        } catch (e) {}
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

        if (cfg.hypergraphCausalEnabled !== false && engine._hypergraphCausalState) {
            const hub = typeof LonShaHypergraphCausalHub !== 'undefined' ? LonShaHypergraphCausalHub : (typeof require === 'function' ? require('./hypergraph-causal-backtracking-hub.js') : null);
            if (hub) {
                const summaries = [];
                const queryText = String(query.text || query.queryText || '');
                const targets = Object.keys(engine._hypergraphCausalState.nodes || {}).filter(id => id && queryText.includes(id)).slice(0, 3);
                for (const target of targets) {
                    const closure = hub.backtrackCausalClosure(engine._hypergraphCausalState, target, 3);
                    if (closure.rationaleSummary) summaries.push(closure.rationaleSummary.slice(0, 1200));
                }
                if (summaries.length) generatedDirectives += '\n' + summaries.join('\n');
            }
        }
        trace.outputCount = finalCandidates.length;
        trace.durationMs = Date.now() - trace.startTime;
        // [L17-O9] 极简心智晴雨表与全量状态快照引擎提纯留痕
        try {
            const baroLib = (typeof LonShaMindBarometerSnapshot !== 'undefined' ? LonShaMindBarometerSnapshot : (typeof require !== 'undefined' ? (() => { try { return require('./mind-barometer-dashboard-snapshot.js'); } catch { return null; } })() : null));
            if (baroLib) {
                const tension = engine._tensionScore || 0.5;
                const pressure = (engine._egoDefenseState && engine._egoDefenseState.threatLevel) || 0.2;
                const weather = baroLib.computeBarometerWeather({ currentTension: tension, currentPressure: pressure });
                if (!engine._mindBarometerState) engine._mindBarometerState = baroLib.createState();
                engine._mindBarometerState.lastWeather = weather;
            }
        } catch (e) {}
        // [L18-O7] 认识论边界审计与防全知终审
        try {
            const auditorLib = (typeof EpistemicBoundaryAuditor !== "undefined" ? EpistemicBoundaryAuditor : (typeof require !== "undefined" ? (() => { try { return require("./epistemic-boundary-auditor.js").default || require("./epistemic-boundary-auditor.js"); } catch { return null; } })() : null));
            if (auditorLib) {
                const auditor = new (auditorLib.EpistemicBoundaryAuditor || auditorLib)();
                const auditRes = auditor.auditAndSanitize(generatedDirectives, currentSpeaker);
                if (auditRes && auditRes.text) {
                    generatedDirectives = auditRes.text;
                }
            }
        } catch (e) {}

        
        // ============================================================
        // [LonSha 36项演化双计划 · 18大新引擎管线接线装配]
        // ============================================================
        // 1. [L-X1] 触景生情主动顿悟 (Active Reminiscence Epiphany)
        try {
            const EpiphanyLib = (typeof ActiveReminiscenceEpiphanyEngine !== "undefined" ? ActiveReminiscenceEpiphanyEngine : (typeof require !== "undefined" ? (() => { try { return require("./active-reminiscence-epiphany-engine.js"); } catch { return null; } })() : null));
            if (EpiphanyLib) {
                if (!engine._activeReminiscenceEngine) engine._activeReminiscenceEngine = new (EpiphanyLib.default || EpiphanyLib)();
                const epiRes = engine._activeReminiscenceEngine.probeCuesInDialogue(queryText, (engine.getCurrentFloor && engine.getCurrentFloor()) || 1);
                if (epiRes && epiRes.triggered && epiRes.promptDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${epiRes.promptDirective}` : epiRes.promptDirective;
                }
            }
        } catch (e) {}

        // 2. [L-X2] 情绪余震滞后阻尼与心境残余 (Emotional Inertia Mood Residue)
        try {
            const MoodResidueLib = (typeof EmotionalInertiaMoodResidueEngine !== "undefined" ? EmotionalInertiaMoodResidueEngine : (typeof require !== "undefined" ? (() => { try { return require("./emotional-inertia-mood-residue-engine.js"); } catch { return null; } })() : null));
            if (MoodResidueLib) {
                if (!engine._moodResidueEngine) engine._moodResidueEngine = new (MoodResidueLib.default || MoodResidueLib)();
                const residueRes = engine._moodResidueEngine.getCurrentResidueSummary();
                if (residueRes && residueRes.promptDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${residueRes.promptDirective}` : residueRes.promptDirective;
                }
            }
        } catch (e) {}

        // 3. [L-X3] 隐性人情亏欠补偿网络 (Latent Social Debt Reciprocity)
        try {
            const DebtMatrixLib = (typeof LatentSocialDebtReciprocityMatrix !== "undefined" ? LatentSocialDebtReciprocityMatrix : (typeof require !== "undefined" ? (() => { try { return require("./latent-social-debt-reciprocity-matrix.js"); } catch { return null; } })() : null));
            if (DebtMatrixLib) {
                if (!engine._socialDebtEngine) engine._socialDebtEngine = new (DebtMatrixLib.default || DebtMatrixLib)();
                const debtRes = engine._socialDebtEngine.assessReciprocityTension(currentSpeaker, knownCharacters[0] || "你");
                if (debtRes && debtRes.promptDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${debtRes.promptDirective}` : debtRes.promptDirective;
                }
            }
        } catch (e) {}

        // 4. [L-X4] 欲言又止微流潜台词 (Hesitation Subtext Microflow)
        try {
            const SubtextLib = (typeof HesitationSubtextMicroflowEngine !== "undefined" ? HesitationSubtextMicroflowEngine : (typeof require !== "undefined" ? (() => { try { return require("./hesitation-subtext-microflow-engine.js"); } catch { return null; } })() : null));
            if (SubtextLib) {
                if (!engine._hesitationSubtextEngine) engine._hesitationSubtextEngine = new (SubtextLib.default || SubtextLib)();
                if (queryText.includes("...") || queryText.includes("……") || queryText.length > 50) {
                    const subtextRes = engine._hesitationSubtextEngine.synthesizeSubtext(currentSpeaker, queryText, "心防拉扯");
                    if (subtextRes && subtextRes.formattedInjection) {
                        generatedDirectives = generatedDirectives ? `${generatedDirectives}
${subtextRes.formattedInjection}` : subtextRes.formattedInjection;
                    }
                }
            }
        } catch (e) {}

        // 5. [L-X5] 长期誓约碎裂冰川共鸣 (Long-term Covenant Breach Resonator)
        try {
            const CovenantBreachLib = (typeof LongTermCovenantBreachResonator !== "undefined" ? LongTermCovenantBreachResonator : (typeof require !== "undefined" ? (() => { try { return require("./long-term-covenant-breach-resonator.js"); } catch { return null; } })() : null));
            if (CovenantBreachLib) {
                if (!engine._covenantBreachEngine) engine._covenantBreachEngine = new (CovenantBreachLib.default || CovenantBreachLib)();
                const activeCovs = engine._covenantBreachEngine.getActiveCovenants();
                if (activeCovs && activeCovs.length > 0) {
                    const firstCov = activeCovs[0];
                    if (queryText.includes("违背") || queryText.includes("背叛") || queryText.includes("泄漏")) {
                        const covRes = engine._covenantBreachEngine.judgeBreachOrFulfill(firstCov.id, "breach", queryText);
                        if (covRes && covRes.promptDirective) {
                            generatedDirectives = generatedDirectives ? `${generatedDirectives}\n${covRes.promptDirective}` : covRes.promptDirective;
                        }
                    }
                }
                if (covRes && covRes.promptDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${covRes.promptDirective}` : covRes.promptDirective;
                }
            }
        } catch (e) {}

        // 6. [L-X6] 角色专属口癖习惯微动作 (Embodied Micro Mannerism Habits)
        try {
            const MannerismLib = (typeof EmbodiedMicroMannerismHabits !== "undefined" ? EmbodiedMicroMannerismHabits : (typeof require !== "undefined" ? (() => { try { return require("./embodied-micro-mannerism-habits.js"); } catch { return null; } })() : null));
            if (MannerismLib) {
                if (!engine._mannerismHabitsEngine) engine._mannerismHabitsEngine = new (MannerismLib.default || MannerismLib)();
                const mannerRes = engine._mannerismHabitsEngine.synthesizeEmbodiedCue(currentSpeaker, queryText);
                if (mannerRes && mannerRes.directive) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${mannerRes.directive}` : mannerRes.directive;
                }
            }
        } catch (e) {}

        // 7. [L-X7] 戏剧性高潮揭露中枢 (Dramatic Reveal Catharsis Hub)
        try {
            const CatharsisLib = (typeof DramaticRevealCatharsisHub !== "undefined" ? DramaticRevealCatharsisHub : (typeof require !== "undefined" ? (() => { try { return require("./dramatic-reveal-catharsis-hub.js"); } catch { return null; } })() : null));
            if (CatharsisLib) {
                if (!engine._catharsisEngine) engine._catharsisEngine = new (CatharsisLib.default || CatharsisLib)();
                const cathRes = engine._catharsisEngine.triggerClimaxIfReady();
                if (cathRes && cathRes.promptDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${cathRes.promptDirective}` : cathRes.promptDirective;
                }
            }
        } catch (e) {}

        // 8. [L-X8] 潜意识超现实残梦隐喻 (Metaphorical Dream Synthesizer)
        try {
            const DreamSynthLib = (typeof MetaphoricalDreamSynthesizer !== "undefined" ? MetaphoricalDreamSynthesizer : (typeof require !== "undefined" ? (() => { try { return require("./metaphorical-dream-synthesizer.js"); } catch { return null; } })() : null));
            if (DreamSynthLib) {
                if (!engine._dreamSynthesizerEngine) engine._dreamSynthesizerEngine = new (DreamSynthLib.default || DreamSynthLib)();
                const dreamRes = engine._dreamSynthesizerEngine.synthesizeDream(currentSpeaker, queryText);
                if (dreamRes && dreamRes.promptDirective) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${dreamRes.promptDirective}` : dreamRes.promptDirective;
                }
            }
        } catch (e) {}

        // 9. [L-X9] 多方暗流同盟博弈 (Multi-Faction Game Conspiracy Coordinator)
        try {
            const FactionCoordLib = (typeof MultiFactionGameConspiracyCoordinator !== "undefined" ? MultiFactionGameConspiracyCoordinator : (typeof require !== "undefined" ? (() => { try { return require("./multi-faction-game-conspiracy-coordinator.js"); } catch { return null; } })() : null));
            if (FactionCoordLib) {
                if (!engine._factionConspiracyEngine) engine._factionConspiracyEngine = new (FactionCoordLib.default || FactionCoordLib)();
                const standing = engine._factionConspiracyEngine.getFactionStanding(currentSpeaker);
                if (standing && standing.allies && standing.allies.length > 0) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
【阵营博弈立场】当前依附阵营结盟方: ${standing.allies.join(", ")}` : `【阵营博弈立场】当前依附阵营结盟方: ${standing.allies.join(", ")}`;
                }
            }
        } catch (e) {}

        // 10. [L-O3] 多主体时空连续性校验与代词消歧 (Multi-Agent Spatial Temporal Resolver)
        try {
            const SpatialResolverLib = (typeof MultiAgentSpatialTemporalResolver !== "undefined" ? MultiAgentSpatialTemporalResolver : (typeof require !== "undefined" ? (() => { try { return require("./multi-agent-spatial-temporal-resolver.js"); } catch { return null; } })() : null));
            if (SpatialResolverLib) {
                if (!engine._spatialTemporalResolver) engine._spatialTemporalResolver = new (SpatialResolverLib.default || SpatialResolverLib)();
                const spatialDirectives = engine._spatialTemporalResolver.formatDisambiguationDirectives([currentSpeaker, ...(knownCharacters || [])]);
                if (spatialDirectives) {
                    generatedDirectives = generatedDirectives ? `${generatedDirectives}
${spatialDirectives}` : spatialDirectives;
                }
            }
        } catch (e) {}

        // 11. [L-O2] 动态注意力与Token弹性平衡 (Adaptive Attention Budget Balancer)
        try {
            const BudgetBalancerLib = (typeof AdaptiveAttentionBudgetBalancer !== "undefined" ? AdaptiveAttentionBudgetBalancer : (typeof require !== "undefined" ? (() => { try { return require("./adaptive-attention-budget-balancer.js"); } catch { return null; } })() : null));
            if (BudgetBalancerLib && generatedDirectives) {
                if (!engine._budgetBalancer) engine._budgetBalancer = new (BudgetBalancerLib.default || BudgetBalancerLib)();
                const budgetAlloc = engine._budgetBalancer.allocateBudget(generatedDirectives.length, 1200);
                if (budgetAlloc && budgetAlloc.maxChars && generatedDirectives.length > budgetAlloc.maxChars) {
                    generatedDirectives = generatedDirectives.slice(0, budgetAlloc.maxChars) + "[...弹性预算截断]";
                }
            }
        } catch (e) {}

        // [L18-O6] 提示词预算动态弹性竞价分配
        try {
            const allocLib = (typeof PromptBudgetDynamicAllocator !== "undefined" ? PromptBudgetDynamicAllocator : (typeof require !== "undefined" ? (() => { try { return require("./prompt-budget-dynamic-allocator.js").default || require("./prompt-budget-dynamic-allocator.js"); } catch { return null; } })() : null));
            if (allocLib && generatedDirectives) {
                const allocator = new (allocLib.PromptBudgetDynamicAllocator || allocLib)();
                generatedDirectives = allocator.enforceBudget(generatedDirectives, 1200);
            }
        } catch (e) {}

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