/* ============================================================
 * adaptive-attention-budget-balancer.js — 检索动态注意力流控与Token弹性预算平衡器
 * [v3.461.0 · 工业级上下文容量自适应与流控平衡中枢]
 * ============================================================ */

export class AdaptiveAttentionBudgetBalancer {
    constructor(options = {}) {
        this.options = Object.assign({
            totalBudgetTokens: 1400,
            minSummaryTokens: 250,
            minFactTokens: 350,
            maxFactRatio: 0.70,
            tokenSafetyMargin: 50
        }, options);
        this.allocationHistory = [];
    }

    /**
     * 根据叙事张力、情绪唤醒度与对话密度，弹性计算三桶预算
     */
    allocateBudget(contextMetrics = {}) {
        const arousal = Math.min(1, Math.max(0, Number(contextMetrics.emotionalArousal) || 0.5));
        const tension = Math.min(1, Math.max(0, Number(contextMetrics.narrativeTension) || 0.5));
        const turnCount = Math.max(1, Number(contextMetrics.recentTurnCount) || 10);
        
        const urgency = (arousal * 0.6) + (tension * 0.4);
        const availableTotal = Math.max(400, this.options.totalBudgetTokens - this.options.tokenSafetyMargin);
        
        // 高紧张/高唤醒度时：大幅倾斜给微细节事实；低紧张日常时：倾斜给宏观摘要与伏笔
        let factRatio = 0.45 + (urgency * 0.25);
        if (factRatio > this.options.maxFactRatio) factRatio = this.options.maxFactRatio;
        
        let immediateFactsBudget = Math.max(this.options.minFactTokens, Math.round(availableTotal * factRatio));
        let summaryBudget = Math.max(this.options.minSummaryTokens, Math.round(availableTotal * (0.35 - (urgency * 0.15))));
        let flashbackBudget = Math.max(100, availableTotal - immediateFactsBudget - summaryBudget);

        // 二次校准确保总数不超过预算
        const sum = immediateFactsBudget + summaryBudget + flashbackBudget;
        if (sum > availableTotal) {
            flashbackBudget -= (sum - availableTotal);
        }

        const plan = {
            totalAllocated: immediateFactsBudget + summaryBudget + flashbackBudget,
            urgencyScore: Number(urgency.toFixed(3)),
            mode: urgency > 0.75 ? "crisis_flash" : urgency > 0.45 ? "active_dialogue" : "reflective_ambient",
            allocations: {
                immediateFacts: immediateFactsBudget,
                narrativeSummary: summaryBudget,
                dormantFlashbacks: flashbackBudget
            },
            timestamp: Date.now()
        };

        this.allocationHistory.push(plan);
        if (this.allocationHistory.length > 50) this.allocationHistory.shift();
        return plan;
    }

    /**
     * 严密修剪事实集合，附带容量保证与智能降权
     */
    filterAndTrim(items = [], tokenBudget = 500, tokenEstimator = null) {
        const estimator = typeof tokenEstimator === "function"
            ? tokenEstimator
            : (it) => Math.ceil(((it?.text || it?.summary || String(it || "")).length) / 1.6);

        let currentTokens = 0;
        const accepted = [];
        const dropped = [];

        // 按显著度或权重降序排序
        const sorted = [...items].sort((a, b) => (b.salience || b.weight || 1) - (a.salience || a.weight || 1));

        for (const it of sorted) {
            const cost = Math.max(1, estimator(it));
            if (currentTokens + cost <= tokenBudget) {
                currentTokens += cost;
                accepted.push(it);
            } else {
                dropped.push({ item: it, requiredTokens: cost, overflow: (currentTokens + cost) - tokenBudget });
            }
        }

        return {
            accepted,
            dropped,
            usedTokens: currentTokens,
            budgetRemaining: Math.max(0, tokenBudget - currentTokens),
            saturationRatio: Number((currentTokens / Math.max(1, tokenBudget)).toFixed(2))
        };
    }

    exportState() {
        return {
            allocationHistory: this.allocationHistory
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.allocationHistory)) {
            this.allocationHistory = [...state.allocationHistory];
        }
    }
}
if (typeof globalThis !== "undefined") { globalThis.AdaptiveAttentionBudgetBalancer = AdaptiveAttentionBudgetBalancer; }
if (typeof window !== "undefined") { window.AdaptiveAttentionBudgetBalancer = AdaptiveAttentionBudgetBalancer; }
if (typeof module !== "undefined" && module.exports) { module.exports = AdaptiveAttentionBudgetBalancer; }
export default AdaptiveAttentionBudgetBalancer;