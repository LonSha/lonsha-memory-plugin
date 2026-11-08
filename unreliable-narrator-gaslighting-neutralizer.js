/* ============================================================
 * unreliable-narrator-gaslighting-neutralizer.js — [v3.460.0 · V21-L16]
 * 不可信叙述者谎言破绽与防御网关 (Unreliable Narrator Neutralizer)
 * ------------------------------------------------------------
 * 1. 谎言与事实抵触破绽捕获 (Fact Contradiction Spotter)
 * 2. 煤气灯效应心智防御与疑云标记 (Suspicion Cloud Tagging)
 * 3. 侦探视角逻辑破绽结构化提取 (Deductive Flaw Extractor)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaGaslightingNeutralizer = factory();
        root.UnreliableNarratorGaslightingNeutralizer = root.LonShaGaslightingNeutralizer;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function detectNarrativeContradiction(claimStatement = "", establishedFacts = []) {
        const claim = String(claimStatement).trim().toLowerCase();
        const conflicts = [];
        for (const fact of establishedFacts) {
            const factStr = String(fact.content || fact).toLowerCase();
            // 简单对立关键词模式
            if ((claim.includes("从没去过") && factStr.includes("曾到访")) ||
                (claim.includes("独自一人") && factStr.includes("结伴同行"))) {
                conflicts.push({
                    claim: claimStatement,
                    contradictsFact: fact,
                    flawNote: "言辞与既成客观事实产生显式矛盾，疑似不可信叙述/隐瞒真相。"
                });
            }
        }
        return {
            hasContradiction: conflicts.length > 0,
            conflicts,
            directive: conflicts.length > 0 ? "[谎言破绽被察觉] 听者心中浮现疑云，敏锐觉察到叙述中的不自然漏洞。" : null
        };
    }

    return {
        VERSION,
        detectNarrativeContradiction
    };
}));
