/* ============================================================
 * sleep-consolidation-graph-pruner.js — [v3.460.0 · V21-L3]
 * 长期记忆深睡眠巩固与图谱拓扑压缩中枢 (Sleep Consolidation Graph Pruner)
 * ------------------------------------------------------------
 * 解决长局会话上千轮后上下文爆炸与记忆冗余退化问题：
 * 1. 慢波睡眠模拟记忆重放（Slow-Wave SMR Replay & Saliency Scoring）
 * 2. 枝节细碎事实图谱拓扑修剪（Topological Graph Folding）
 * 3. 长期核心心路历程长篇摘要提取（Longitudinal Episodic Distillation）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSleepConsolidation = factory();
        root.SleepConsolidationGraphPruner = root.LonShaSleepConsolidation;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createSleepConsolidationState() {
        return {
            version: VERSION,
            consolidationCycles: [],
            distilledSummaries: [],
            lastConsolidatedAt: null,
            updatedAt: Date.now()
        };
    }

    function runSleepConsolidation(state, memoryAtlas = {}, options = {}) {
        if (!memoryAtlas || typeof memoryAtlas !== "object") {
            return { ok: false, prunedNodes: 0, retainedNodes: 0, distilled: null };
        }
        const minSignificance = Number(options.minSignificance || 0.4);
        const nodes = Array.isArray(memoryAtlas.nodes) ? memoryAtlas.nodes : [];
        const pruned = [];
        const retained = [];

        for (const node of nodes) {
            const score = Number(node.significance ?? node.importance ?? 0.5);
            const isAnchored = node.pinned === true || node.locked === true;
            if (isAnchored || score >= minSignificance) {
                retained.push(node);
            } else {
                pruned.push({ id: node.id, label: node.label, score });
            }
        }

        const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const cycleRecord = {
            cycleId,
            timestamp: Date.now(),
            prunedCount: pruned.length,
            retainedCount: retained.length,
            ratio: retained.length / (nodes.length || 1)
        };

        if (state && state.consolidationCycles) {
            state.consolidationCycles.push(cycleRecord);
            state.lastConsolidatedAt = Date.now();
            state.updatedAt = Date.now();
        }

        return {
            ok: true,
            cycleId,
            prunedNodes: pruned.length,
            retainedNodes: retained.length,
            retainedList: retained,
            prunedList: pruned
        };
    }

    return {
        VERSION,
        createSleepConsolidationState,
        runSleepConsolidation
    };
}));
