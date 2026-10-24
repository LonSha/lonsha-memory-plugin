/* ============================================================
 * generation-material-budget-plan.js — [L9-O5 · 第九期规划]
 * 生成上下文预算分层与材料计划编排器（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   材料严格分层入池：
 *     - REQUIRED: 核心约束、锁定事实、强关联上下文（优先保住，绝不裁剪）
 *     - OPTIONAL: 背景经历、泛指修饰、弱相关回忆（预算紧缩时按比例裁剪）
 *     - CONFLICT: 争议提示、对立证据（附带警告标记）
 *   提供预估 token 消耗与超限保护计算
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GenerationMaterialBudgetPlan = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const MATERIAL_TIERS = Object.freeze({
        REQUIRED: 'required',
        OPTIONAL: 'optional',
        CONFLICT: 'conflict'
    });

    function estimateTokenCount(text) {
        if (!text) return 0;
        return Math.ceil(String(text).length / 2);
    }

    /**
     * 编排分层材料注入计划
     */
    function orchestrateMaterialPlan(materials, maxTokenBudget = 2000) {
        const list = Array.isArray(materials) ? materials : [];
        const budget = Number(maxTokenBudget) || 2000;

        let usedTokens = 0;
        const admitted = [];
        const dropped = [];

        // 1. 优先录取 REQUIRED 级别材料
        for (const item of list) {
            if (!item || !item.id) continue;
            const tier = item.tier === MATERIAL_TIERS.REQUIRED ? MATERIAL_TIERS.REQUIRED : (item.tier || MATERIAL_TIERS.OPTIONAL);
            const tokens = typeof item.tokenEstimate === 'number' ? item.tokenEstimate : estimateTokenCount(item.content);

            if (tier === MATERIAL_TIERS.REQUIRED) {
                usedTokens += tokens;
                admitted.push({ ...item, admittedTokens: tokens, tier });
            }
        }

        // 2. 依次按得分择优录取 OPTIONAL / CONFLICT 材料，直至预算耗尽
        const remaining = list.filter(item => item && item.tier !== MATERIAL_TIERS.REQUIRED);
        remaining.sort((a, b) => (b.score || 0) - (a.score || 0));

        for (const item of remaining) {
            const tokens = typeof item.tokenEstimate === 'number' ? item.tokenEstimate : estimateTokenCount(item.content);
            if (usedTokens + tokens <= budget) {
                usedTokens += tokens;
                admitted.push({ ...item, admittedTokens: tokens });
            } else {
                dropped.push({ ...item, reason: 'budget-exceeded' });
            }
        }

        return {
            maxTokenBudget: budget,
            usedTokens,
            remainingTokens: Math.max(0, budget - usedTokens),
            admittedCount: admitted.length,
            droppedCount: dropped.length,
            admitted,
            dropped
        };
    }

    return {
        MATERIAL_TIERS,
        estimateTokenCount,
        orchestrateMaterialPlan
    };
}));