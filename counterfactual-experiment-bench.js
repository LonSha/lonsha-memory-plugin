/* ============================================================
 * counterfactual-experiment-bench.js — [L9-X4 · 第九期规划]
 * 受证据约束的反事实实验与推演隔离工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   允许用户或角色探索平行抉择，严格实施三层分离：
 *     1. FACT_BOUND: 由已知事实铁律约束的不可逾越边界
 *     2. PLAUSIBLE_DEDUCTION: 基于证据推演的高合理性走向
 *     3. FREE_PERFORMANCE: 纯演出的戏剧性推测
 *   所有实验强制在隔离分支运行，绝不静默写入正史 (Canon)。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CounterfactualExperimentBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EXPERIMENT_LAYERS = Object.freeze({
        FACT_BOUND: 'fact_bound',
        PLAUSIBLE_DEDUCTION: 'plausible_deduction',
        FREE_PERFORMANCE: 'free_performance'
    });

    function createExperimentBranch(canonBaseFacts = [], hypothesis = {}) {
        const branchId = `cf_branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        return {
            branchId,
            hypothesis: String(hypothesis.description || '').trim(),
            premiseChoiceId: hypothesis.choiceId || null,
            baseFactsCount: (Array.isArray(canonBaseFacts) ? canonBaseFacts : []).length,
            records: [],
            isIsolated: true,
            status: 'active'
        };
    }

    function addExperimentOutcome(branch, outcome = {}) {
        if (!branch || !branch.isIsolated) {
            return { success: false, reason: 'branch_not_isolated' };
        }
        const records = Array.isArray(branch.records) ? branch.records.slice() : [];
        const layer = Object.values(EXPERIMENT_LAYERS).includes(outcome.layer)
            ? outcome.layer
            : EXPERIMENT_LAYERS.FREE_PERFORMANCE;

        const record = {
            id: `rec_${Date.now()}`,
            statement: String(outcome.statement || '').trim(),
            layer,
            cannotPromoteToCanon: true, // 铁律门禁：反事实推演绝不可作为确认事实注入正史
            timestamp: Date.now()
        };

        records.push(record);
        return {
            ...branch,
            records
        };
    }

    return {
        EXPERIMENT_LAYERS,
        createExperimentBranch,
        addExperimentOutcome
    };
}));