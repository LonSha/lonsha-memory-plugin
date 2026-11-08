/* ============================================================
 * dual-identity-exposure-risk-matrix.js — [v3.460.0 · V21-L17]
 * 双重身份暴露风险博弈与隐秘掩饰中枢 (Dual Identity Exposure Matrix)
 * ------------------------------------------------------------
 * 1. 双重面具与社会怀疑度追踪 (Social Suspicion Meter 0.0 ~ 1.0)
 * 2. 破绽累积与应急掩护策略 (Cover Strategy Synthesis)
 * 3. 临界戒备与身份撕裂反制 (Exposure Threshold Breach)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaIdentityExposure = factory();
        root.DualIdentityExposureRiskMatrix = root.LonShaIdentityExposure;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createExposureState() {
        return {
            version: VERSION,
            covertIdentities: new Map(), // actor -> { publicRole, secretRole, suspicionLevel }
            updatedAt: Date.now()
        };
    }

    function recordCovertSlip(state, actor, suspicionDelta = 0.2) {
        if (!state || !state.covertIdentities) return null;
        const name = String(actor || "");
        if (!state.covertIdentities.has(name)) {
            state.covertIdentities.set(name, {
                actor: name,
                publicRole: "平民",
                secretRole: "特工/卧底",
                suspicionLevel: 0.1
            });
        }
        const record = state.covertIdentities.get(name);
        record.suspicionLevel = Math.max(0.0, Math.min(1.0, record.suspicionLevel + Number(suspicionDelta)));
        state.updatedAt = Date.now();

        let alertLevel = "safe";
        if (record.suspicionLevel >= 0.8) alertLevel = "critical_danger";
        else if (record.suspicionLevel >= 0.5) alertLevel = "suspicious";

        return {
            actor: name,
            currentSuspicion: record.suspicionLevel,
            alertLevel
        };
    }

    function generateRiskDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const identities = state.covertIdentities;
        if (!identities) return null;
        const record = identities instanceof Map ? identities.get(speaker) : identities[speaker];
        if (!record || record.suspicionLevel < 0.4) return null;
        return `[身份防线提示] 对话中注意维护表层身份(${record.publicRole || "普通身份"})，避免无意间流露破绽。`;
    }

    return {
        VERSION,
        createExposureState,
        recordCovertSlip,
        generateRiskDirectives
    };
}));
