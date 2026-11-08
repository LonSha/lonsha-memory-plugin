/* ============================================================
 * tri-modal-resonance-recall-funnel.js — [v3.460.0 · V21-L6]
 * 三模态共振动态召回漏斗深度融合 (Tri-Modal Resonance Recall Funnel)
 * ------------------------------------------------------------
 * 融合字面量匹配、语义拓扑距离、心绪张力三大召回流：
 * 1. 词法/实体字面精确流 (Lexical Token Match)
 * 2. 关系图谱与因果拓扑流 (Causal & Social Graph Distance)
 * 3. 情绪波形与当前情境张力共鸣 (Affective Resonance)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTriModalRecall = factory();
        root.TriModalResonanceRecallFunnel = root.LonShaTriModalRecall;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function scoreCandidateTriModal(candidate = {}, queryContext = {}) {
        const queryText = String(queryContext.text || "").toLowerCase();
        const candText = String(candidate.content || candidate.label || "").toLowerCase();

        // 1. 词法得分 (0.0 ~ 1.0)
        let lexicalScore = 0.0;
        if (candText && queryText) {
            const candWords = candText.split(/\s+/);
            const matches = candWords.filter(w => w && queryText.includes(w));
            lexicalScore = Math.min(1.0, matches.length / Math.max(1, candWords.length));
        }

        // 2. 拓扑图谱得分 (0.0 ~ 1.0)
        const hops = Number(candidate.graphHops ?? 1);
        const topologicalScore = Math.max(0.1, 1.0 / (hops + 1));

        // 3. 情绪张力共鸣得分 (0.0 ~ 1.0)
        const currentTension = Number(queryContext.tension ?? 0.5);
        const candIntensity = Number(candidate.intensity ?? candidate.importance ?? 0.5);
        const emotionalDiff = Math.abs(currentTension - candIntensity);
        const affectiveScore = Math.max(0.0, 1.0 - emotionalDiff);

        // 动态加权合成
        const compositeScore = (lexicalScore * 0.4) + (topologicalScore * 0.3) + (affectiveScore * 0.3);

        return {
            id: candidate.id,
            compositeScore: Number(compositeScore.toFixed(4)),
            breakdown: {
                lexical: Number(lexicalScore.toFixed(3)),
                topological: Number(topologicalScore.toFixed(3)),
                affective: Number(affectiveScore.toFixed(3))
            }
        };
    }

    function rankRecallCandidates(candidates = [], queryContext = {}) {
        if (!Array.isArray(candidates)) return [];
        const scored = candidates.map(c => ({
            candidate: c,
            evaluation: scoreCandidateTriModal(c, queryContext)
        }));
        scored.sort((a, b) => b.evaluation.compositeScore - a.evaluation.compositeScore);
        return scored;
    }

    return {
        VERSION,
        scoreCandidateTriModal,
        rankRecallCandidates
    };
}));
