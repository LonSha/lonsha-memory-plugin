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
        ['LonShaUnspokenHesitation', 'unspoken-hesitation-subtext-engine.js'],
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
        ['StateMachineChaosMonkeyResilience', 'state-machine-chaos-monkey-resilience.js']
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