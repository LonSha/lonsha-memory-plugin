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

        // ---------------- [阶段 4: 认知视界四桶动态隔离与防全知] ----------------
        let finalCandidates = firewallSanitized;
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