(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPyramidClusterEngine = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            clusters: [], // { epochId, title, summary, factCount, timeRange }
            currentBudgetTokens: 1200
        };
    }

    /**
     * 将细碎事实分层聚类压缩为时代纪要金字塔
     */
    function compressFactsIntoPyramid(state, facts = [], epochTitle = '第一纪：初遇老城') {
        if (!facts || facts.length === 0) return null;

        const cluster = {
            id: 'pyr_' + Date.now(),
            epochTitle,
            factCount: facts.length,
            representativeFacts: facts.slice(0, 3).map(f => f.text || f),
            pyramidSummary: `【${epochTitle}】共凝练 ${facts.length} 件过往核心线索，包含对彼此身份的初探与老洋房的暗涌。`,
            createdAt: Date.now()
        };
        state.clusters.push(cluster);
        return cluster;
    }

    /**
     * 依据场景紧张度 (Tension 0.0 ~ 1.0) 弹性伸缩 Token 预算
     * 高紧张 (对抗/追逐) -> 紧凑预算 (400-600 tokens)，提纯当前指令；
     * 低紧张 (闲聊/温情) -> 舒缓预算 (1200-2000 tokens)，释放长程回忆。
     */
    function adjustAttentionBudget(state, tensionScore = 0.2) {
        const tension = Math.max(0, Math.min(1.0, tensionScore));
        if (tension >= 0.7) {
            state.currentBudgetTokens = Math.round(500 * (1.0 - (tension - 0.7)));
        } else {
            state.currentBudgetTokens = Math.round(1200 + (0.7 - tension) * 1000);
        }
        return {
            tension,
            budgetTokens: state.currentBudgetTokens,
            strategy: tension >= 0.7 ? 'HIGH_TENSION_COMPACT' : 'LOW_TENSION_EXPANDED'
        };
    }

    return {
        createState: createState,
        compressFactsIntoPyramid: compressFactsIntoPyramid,
        adjustAttentionBudget: adjustAttentionBudget
    };
}));