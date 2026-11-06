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
        ['SceneTabooReflector', 'scene-taboo-reflector.js'],
        ['CSE', 'cse-engine.js']
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