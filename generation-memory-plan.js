/* ========================================================
 * generation-memory-plan.js — [M7-O5 · 第七期规划] 生成前记忆计划内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   作者准备长篇关键场景时，无法预先看清本幕生成将采用哪些记忆材料；
 *   材料要么全盘隐式丢进提示词导致预算溢出，要么意外混入未经确认的私密信息。
 *   生成前记忆计划提供分层材料编排与预算管控：
 *     ① 四层材料计划：必需(essential) / 可选(optional) / 冲突(conflicting) / 缺失(unknown)；
 *     ② 支持用户交互调整：可移除私密条目（生成链不再消费）或补入条目；
 *     ③ 预算透明取舍(applyBudgetLimit)：预算超额时优先裁剪可选条目并如实记录原因；
 *     ④ 对比计划与实际消费差异(comparePlanConsumption)，实现端到端闭环验证。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 材料层级 */
    const MATERIAL_TIERS = Object.freeze({
        ESSENTIAL: 'essential',     // 必需材料（关键人设立场/近期核心承诺）
        OPTIONAL: 'optional',       // 可选材料（背景佐证/环境氛围）
        CONFLICTING: 'conflicting', // 冲突材料（存在争议的事实）
        UNKNOWN: 'unknown'          // 缺失材料（待补充）
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeNum(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * 规范化单条材料项
     */
    function normalizePlanItem(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const id = safeStr(raw.id || raw.factKey) || ('item_' + idx);
        const title = safeStr(raw.title || raw.text || raw.content) || '未命名材料';
        const content = safeStr(raw.content || raw.text);
        const validTiers = Object.values(MATERIAL_TIERS);
        const tier = validTiers.includes(raw.tier) ? raw.tier : MATERIAL_TIERS.OPTIONAL;
        const tokenCost = Math.max(5, Math.min(2000, safeNum(raw.tokenCost, 50)));
        const removed = Boolean(raw.removed);
        const removeReason = safeStr(raw.removeReason);

        return Object.freeze({
            id,
            title,
            content,
            tier,
            tokenCost,
            removed,
            removeReason
        });
    }

    /**
     * 构造生成前记忆计划
     */
    function buildGenerationPlan(sceneGoal, candidateMaterials = [], opts = {}) {
        const goal = safeStr(sceneGoal) || '常规生成场景';
        const rawList = Array.isArray(candidateMaterials) ? candidateMaterials : [];
        const items = rawList.map((m, idx) => normalizePlanItem(m, idx)).filter(Boolean);

        const essential = [];
        const optional = [];
        const conflicting = [];
        const unknown = [];

        for (const item of items) {
            if (item.removed) continue;
            if (item.tier === MATERIAL_TIERS.ESSENTIAL) essential.push(item);
            else if (item.tier === MATERIAL_TIERS.CONFLICTING) conflicting.push(item);
            else if (item.tier === MATERIAL_TIERS.UNKNOWN) unknown.push(item);
            else optional.push(item);
        }

        const totalCost = [...essential, ...optional, ...conflicting].reduce((sum, it) => sum + it.tokenCost, 0);

        return Object.freeze({
            sceneGoal: goal,
            characterId: safeStr(opts.characterId) || null,
            essential: Object.freeze(essential),
            optional: Object.freeze(optional),
            conflicting: Object.freeze(conflicting),
            unknown: Object.freeze(unknown),
            totalTokenCost: totalCost,
            items: Object.freeze(items)
        });
    }

    /**
     * 用户移除某材料项（例如作者剔除不希望本次使用的私密信息）
     */
    function removePlanItem(plan, itemId, reason = '') {
        if (!plan || !Array.isArray(plan.items)) return plan;
        const targetId = safeStr(itemId);
        const updatedItems = plan.items.map(it => {
            if (it.id !== targetId) return it;
            return Object.freeze({
                ...it,
                removed: true,
                removeReason: safeStr(reason) || '用户手动剔除'
            });
        });
        return buildGenerationPlan(plan.sceneGoal, updatedItems, { characterId: plan.characterId });
    }

    /**
     * 用户补入材料项
     */
    function addPlanItem(plan, item) {
        if (!plan || !Array.isArray(plan.items)) return plan;
        const norm = normalizePlanItem(item, plan.items.length);
        if (!norm) return plan;
        const updatedItems = [norm, ...plan.items.filter(it => it.id !== norm.id)];
        return buildGenerationPlan(plan.sceneGoal, updatedItems, { characterId: plan.characterId });
    }

    /**
     * 应用 Token 预算约束（优先保障必需材料，裁剪可选材料）
     */
    function applyBudgetLimit(plan, maxBudgetTokens) {
        if (!plan || typeof plan !== 'object') return plan;
        const budget = safeNum(maxBudgetTokens, Infinity);
        if (plan.totalTokenCost <= budget) {
            return Object.freeze({
                ...plan,
                budget,
                budgetTrimmed: false,
                trimmedItems: Object.freeze([])
            });
        }

        let currentCost = plan.essential.reduce((sum, it) => sum + it.tokenCost, 0);
        const acceptedOptional = [];
        const trimmed = [];

        for (const opt of plan.optional) {
            if (currentCost + opt.tokenCost <= budget) {
                acceptedOptional.push(opt);
                currentCost += opt.tokenCost;
            } else {
                trimmed.push(Object.freeze({
                    ...opt,
                    trimmedReason: 'budget_exceeded'
                }));
            }
        }

        return Object.freeze({
            sceneGoal: plan.sceneGoal,
            characterId: plan.characterId,
            essential: plan.essential,
            optional: Object.freeze(acceptedOptional),
            conflicting: plan.conflicting,
            unknown: plan.unknown,
            totalTokenCost: currentCost,
            items: plan.items,
            budget,
            budgetTrimmed: trimmed.length > 0,
            trimmedItems: Object.freeze(trimmed)
        });
    }

    /**
     * 对比计划材料与实际生成消费
     */
    function comparePlanConsumption(plan, actuallyInjectedIds = []) {
        if (!plan || !Array.isArray(plan.items)) {
            return { fullyCompliant: false, missedInjections: [], unplannedInjections: [] };
        }
        const actualSet = new Set((Array.isArray(actuallyInjectedIds) ? actuallyInjectedIds : []).map(safeStr));
        const plannedSet = new Set([
            ...plan.essential.map(i => i.id),
            ...plan.optional.map(i => i.id)
        ]);

        const missed = [...plannedSet].filter(id => !actualSet.has(id));
        const unplanned = [...actualSet].filter(id => !plannedSet.has(id));

        return Object.freeze({
            fullyCompliant: missed.length === 0 && unplanned.length === 0,
            plannedCount: plannedSet.size,
            actualCount: actualSet.size,
            missedInjections: Object.freeze(missed),
            unplannedInjections: Object.freeze(unplanned)
        });
    }

    /**
     * 自检函数
     */
    function generationMemoryPlanSelfCheck() {
        const problems = [];
        if (Object.keys(MATERIAL_TIERS).length !== 4) problems.push('MATERIAL_TIERS 必须包含 4 层');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        MATERIAL_TIERS,
        normalizePlanItem,
        buildGenerationPlan,
        removePlanItem,
        addPlanItem,
        applyBudgetLimit,
        comparePlanConsumption,
        generationMemoryPlanSelfCheck
    });

    root.LonShaGenerationMemoryPlan = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);