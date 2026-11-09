/* Unified optional-engine registry. Loaded by the host so dormant pure engines are
 * discoverable and callable through one stable surface. */
(function (root) {
    'use strict';
    const entries = [
        ['EvidenceConflictAdjudicationBench', 'evidence-conflict-adjudication-bench.js'],
        ['UnifiedNarrativeClockAxis', 'unified-narrative-clock-axis.js'],
        ['RecallRouteFeedbackBench', 'recall-route-feedback-bench.js'],
        ['GenerationMaterialBudgetPlan', 'generation-material-budget-plan.js'],
        ['MaintenanceColdWarmSession', 'maintenance-cold-warm-session.js'],
        ['ProjectMigrationBoundaryBench', 'project-migration-boundary-bench.js'],
        ['MemoryTaskWorkbench', 'memory-task-workbench.js'],
        ['FactUnifiedLifecycleBench', 'fact-unified-lifecycle-bench.js'],
        ['FactPostgenReplayReceipt', 'fact-postgen-replay-receipt.js'],
        ['MeaningEvolutionMap', 'meaning-evolution-map.js'],
        ['MemoryActionSymbiosisCircuit', 'memory-action-symbiosis-circuit.js'],
        ['LonShaSceneTabooReflector', 'scene-taboo-reflector.js'],
        ['SceneTabooReflector', 'scene-taboo-reflector.js'],
        ['CounterfactualFirewall', 'counterfactual-firewall-engine.js'],
        ['CovenantEngine', 'dynamic-covenant-consequence-engine.js'],
        ['CovertEspionage', 'covert-espionage-exposure-hub.js'],
        ['EpistemicMatrix', 'epistemic-parallax-asymmetry-matrix.js'],
        ['MacroEpochDrift', 'macro-epoch-cultural-drift-engine.js'],
        ['ObsessiveTrauma', 'obsessive-trauma-taboo-engine.js'],
        ['DeepMemoryDistillationAtlas', 'deep-memory-distillation-atlas.js'],
        ['DreamSubconsciousMetaphorSynthesizer', 'dream-subconscious-metaphor-synthesizer.js'],
        ['DynamicFactionTerritoryTopologyHub', 'dynamic-faction-territory-topology-hub.js'],
        ['FateConvergenceClimaxLoom', 'fate-convergence-climax-loom.js'],
        ['LongTailFlashbackResonanceHub', 'long-tail-flashback-resonance-hub.js'],
        ['MultiAgentGameTheoryCoordinator', 'multi-agent-game-theory-coordinator.js'],
        ['MultiDimensionalReputationSocialGraph', 'multi-dimensional-reputation-social-graph.js'],
        ['SomaticMicroExpressionReflexEngine', 'somatic-micro-expression-reflex-engine.js'],
        ['SoulBrandReincarnationHub', 'soul-brand-reincarnation-hub.js'],
        ['CSE', 'cse-engine.js'],
        ['EngineOrchestrationRippleBus', 'engine-orchestration-ripple-bus.js'],
        ['SpatiotemporalCausalityLock', 'spatiotemporal-causality-lock.js'],
        ['SleepConsolidationGraphPruner', 'sleep-consolidation-graph-pruner.js'],
        ['ObsessiveTabooMultiTierDefense', 'obsessive-taboo-multi-tier-defense.js'],
        ['IntersubjectiveParallaxIsolation', 'intersubjective-parallax-isolation.js'],
        ['TriModalResonanceRecallFunnel', 'tri-modal-resonance-recall-funnel.js'],
        ['CounterfactualButterflySandbox', 'counterfactual-butterfly-sandbox.js'],
        ['EngineDiagnosticsTelemetryDashboard', 'engine-diagnostics-telemetry-dashboard.js'],
        ['TransgenerationalSoulBrandSynthesis', 'transgenerational-soul-brand-synthesis.js'],
        ['WorldAxisObjectiveToSubjectiveAssimilator', 'worldaxis-objective-to-subjective-assimilator.js'],
        ['AutonomousRuminationDreamEngine', 'autonomous-rumination-dream-engine.js'],
        ['EmotionalAnchorBindingResonanceHub', 'emotional-anchor-binding-resonance-hub.js'],
        ['AutonomicNervousSomaticFlareEngine', 'autonomic-nervous-somatic-flare-engine.js'],
        ['DissociativeAmnesiaPuzzleWorkbench', 'dissociative-amnesia-puzzle-workbench.js'],
        ['StylisticDriftEmotionalLexiconModulator', 'stylistic-drift-emotional-lexicon-modulator.js'],
        ['UnreliableNarratorGaslightingNeutralizer', 'unreliable-narrator-gaslighting-neutralizer.js'],
        ['DualIdentityExposureRiskMatrix', 'dual-identity-exposure-risk-matrix.js'],
        ['PsychologicalBurnoutResilienceDecay', 'psychological-burnout-resilience-decay.js'],
        ['LonShaNarrativeMomentum', 'narrative-momentum-flow-inertia-engine.js'],
        ['LonShaSocialBondReciprocity', 'latent-social-bond-reciprocity-engine.js'],
        ['LonShaTacitUnderstanding', 'character-tacit-understanding-engine.js'],
        ['LonShaCommitmentMilestone', 'long-term-commitment-milestone-engine.js'],
        ['LonShaRoutineRhythm', 'everyday-shared-routine-rhythm-engine.js'],
        ['HierarchicalPyramidEvolution', 'hierarchical-pyramid-evolution.js'],
        ['SubconsciousUndercurrentEngine', 'subconscious-undercurrent-engine.js'],
        ['RoundEntrySnapshot', 'round-entry-snapshot.js'],
        // [v18] 第十八期灵魂深潜主观认知失真引擎
        ['TemporalFlashbulbDilationEngine', 'temporal-flashbulb-dilation-engine.js'],
        ['DissociativePersonaMaskMatrix', 'dissociative-persona-mask-matrix.js'],
        ['ConfabulationMandelaReconstructEngine', 'confabulation-mandela-reconstruct-engine.js'],
        ['ProustianSynesthesiaRecallEngine', 'proustian-synesthesia-recall-engine.js'],
        ['ZeigarnikUnresolvedGestaltLoop', 'zeigarnik-unresolved-gestalt-loop.js'],
        ['CounterfactualWhatIfRegretMatrix', 'counterfactual-whatif-regret-matrix.js'],
        ['RumorEntropyGossipDiffusion', 'rumor-entropy-gossip-diffusion.js'],
        ['CognitiveScatomaDenialGuard', 'cognitive-scatoma-denial-guard.js'],
        ['DaydreamSpontaneousWanderingEngine', 'daydream-spontaneous-wandering-engine.js'],
        ['VectorSemanticSparseHybridRetrieval', 'vector-semantic-sparse-hybrid-retrieval.js'],
        ['TieredStorageTieredCompactionLedger', 'tiered-storage-tiered-compaction-ledger.js'],
        ['RealtimeConflictGraphRollback', 'realtime-conflict-graph-rollback.js'],
        ['MemorySalienceDecayCurator', 'memory-salience-decay-curator.js'],
        ['CrossSessionIdentityReconciliation', 'cross-session-identity-reconciliation.js'],
        ['PromptBudgetDynamicAllocator', 'prompt-budget-dynamic-allocator.js'],
        ['EpistemicBoundaryAuditor', 'epistemic-boundary-auditor.js'],
        ['AsyncIndexingPipelineDebouncer', 'async-indexing-pipeline-debouncer.js'],
        ['StateMachineChaosMonkeyResilience', 'state-machine-chaos-monkey-resilience.js'],
        // [v18·36项演化双计划] 18 大认知心智引擎（index.js 的 loadModules 走 loadAll() 取类）
        //   登记纪律：此表之外的模块 index.js 取不到 ⇒ 静默 null ⇒ 引擎永不实例化。
        ['EngineSymphonyWaveScheduler', 'engine-symphony-wave-scheduler.js'],
        ['ActiveReminiscenceEpiphanyEngine', 'active-reminiscence-epiphany-engine.js'],
        ['EmotionalInertiaMoodResidueEngine', 'emotional-inertia-mood-residue-engine.js'],
        ['LongTermCovenantBreachResonator', 'long-term-covenant-breach-resonator.js'],
        ['LatentSocialDebtReciprocityMatrix', 'latent-social-debt-reciprocity-matrix.js'],
        ['EpistemicFourBucketGuard', 'epistemic-four-bucket-guard.js'],
        ['HesitationSubtextMicroflowEngine', 'hesitation-subtext-microflow-engine.js'],
        ['MultiAgentSpatialTemporalResolver', 'multi-agent-spatial-temporal-resolver.js'],
        ['BiomimeticHebbianSalienceCurator', 'biomimetic-hebbian-salience-curator.js'],
        ['MemoryConflictHealingArbitrator', 'memory-conflict-healing-arbitrator.js'],
        ['MetaphoricalDreamSynthesizer', 'metaphorical-dream-synthesizer.js'],
        ['MultiFactionGameConspiracyCoordinator', 'multi-faction-game-conspiracy-coordinator.js'],
        ['DramaticRevealCatharsisHub', 'dramatic-reveal-catharsis-hub.js'],
        ['EmbodiedMicroMannerismHabits', 'embodied-micro-mannerism-habits.js'],
        ['RuntimeMemoryResetGuard', 'runtime-memory-reset-guard.js'],
        ['AdaptiveAttentionBudgetBalancer', 'adaptive-attention-budget-balancer.js'],
        ['HierarchicalCompactionLedger', 'hierarchical-compaction-ledger.js'],
        ['UITelemetryMetricsVisualizer', 'ui-telemetry-metrics-visualizer.js'],
        // [v18·补登记] 此前仅在 manifest.extra_js 登记、未进注册表，index.js 取不到
        //   注意：以下 6 项是**工厂对象**而非类（导出 {…} 方法集合，不是 constructor），
        //   故登记名用它们真实挂载的全局名；调用方必须按「工厂」消费（见 index.js 的
        //   _factoryOrClass 取用纪律），不得直接 `new`。
        ['LonShaUnspokenHesitation', 'unspoken-hesitation-subtext-engine.js']
    ];
    function loadOne(globalName, fileName) {
        try {
            if (root && root[globalName]) return root[globalName];
            if (typeof require === 'function') return require('./' + fileName);
        } catch (_) {}
        return null;
    }
    function loadAll() {
        const loaded = {};
        for (const [name, file] of entries) {
            const value = loadOne(name, file);
            if (value) loaded[name] = value;
        }
        return loaded;
    }
    function status() {
        return entries.map(([name, file]) => ({ name, file, loaded: !!loadOne(name, file) }));
    }
    const api = Object.freeze({ entries: entries.slice(), loadAll, status });
    if (root) root.LonShaOptionalEngineRegistry = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));