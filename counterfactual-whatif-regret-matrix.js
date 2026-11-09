/* ============================================================
 * counterfactual-whatif-regret-matrix.js — [v3.461.0 · 第十八期全新认知引擎]
 * 反事实推演与懊悔/侥幸代偿引擎 (Counterfactual What-If Regret Matrix)
 * ------------------------------------------------------------
 * 【核心机制与认知心理学】
 * 模拟人类在重大历史节点后的"如果当时……"反事实思维 (Counterfactual Thinking)：
 *   - 向上反事实 (Upward Counterfactual): "如果我当时拉住他，就不会发生悲剧" -> 产生内疚/代偿保护欲；
 *   - 向下反事实 (Downward Counterfactual): "要不是差了那一秒，我就没命了" -> 产生心有余悸与风险规避。
 * ============================================================ */

class CounterfactualWhatIfRegretMatrix {
    constructor(options = {}) {
        this.options = Object.assign({
            maxSimulationBranches: 5,
            regretDecayRate: 0.02
        }, options);
        this.counterfactualNodes = new Map();
    }

    /**
     * 针对转折事件构建 What-If 假设分支
     */
    simulateBranch(eventId, actualOutcome, hypotheticalPivot) {
        const id = "cft_" + (eventId || Date.now());
        const isUpward = hypotheticalPivot.direction === "upward"; // 向上反事实 (后悔) vs 向下反事实 (庆幸)
        const emotionalImpact = Number(hypotheticalPivot.impactScore || 0.75);

        const node = {
            id,
            eventId,
            actualOutcome,
            hypotheticalPivot: hypotheticalPivot.condition || "如果当时换一种选择",
            hypotheticalOutcome: hypotheticalPivot.betterOrWorseOutcome || "结局会截然不同",
            isUpward,
            regretOrReliefScore: emotionalImpact,
            compensatoryBehavior: hypotheticalPivot.behavioralAdjustment || "过度谨慎并时刻关注对方动向",
            createdAt: Date.now()
        };

        this.counterfactualNodes.set(id, node);
        return node;
    }

    formatCounterfactualPrompt() {
        if (this.counterfactualNodes.size === 0) return "";
        const top = Array.from(this.counterfactualNodes.values())
            .sort((a, b) => b.regretOrReliefScore - a.regretOrReliefScore)
            .slice(0, 2);

        const lines = ["【反事实推演与心理代偿倾向 (What-If)】"];
        for (const n of top) {
            const tag = n.isUpward ? "痛悔代偿" : "心有余悸";
            lines.push(`- [${tag}] 假定: \"${n.hypotheticalPivot}\" -> 预期: \"${n.hypotheticalOutcome}\" (潜意识代偿行为: ${n.compensatoryBehavior})`);
        }
        return lines.join("\n");
    }

    exportState() {
        return { counterfactualNodes: Array.from(this.counterfactualNodes.entries()) };
    }

    hydrateState(state) {
        if (state && Array.isArray(state.counterfactualNodes)) {
            this.counterfactualNodes = new Map(state.counterfactualNodes);
        }
    }
}

/* ============================================================
 * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
 * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
 * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
 * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
 * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
 * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.CounterfactualWhatIfRegretMatrix = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return CounterfactualWhatIfRegretMatrix;
}));
