/* ============================================================
 * emotional-anchor-binding-resonance-hub.js — [v3.460.0 · V21-L12]
 * 心锚誓约不可逆反噬与情感羁绊共生中枢 (Emotional Anchor Binding Hub)
 * ------------------------------------------------------------
 * 1. 终身誓约与灵魂心锚建立 (Sacred Oath Inscription)
 * 2. 违约心碎与不可逆信赖坍塌裁决 (Oath-Breaker Karmic Lash)
 * 3. 角色间的情感共生波形联动 (Affective Resonance Symbiosis)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEmotionalAnchor = factory();
        root.EmotionalAnchorBindingResonanceHub = root.LonShaEmotionalAnchor;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createAnchorState() {
        return {
            version: VERSION,
            activeCovenants: new Map(), // covenantId -> covenant
            brokenOaths: [],
            updatedAt: Date.now()
        };
    }

    function inscribeCovenant(state, oathSpec = {}) {
        if (!state || !state.activeCovenants) return null;
        const id = String(oathSpec.id || `cov_${Date.now()}`);
        const covenant = {
            id,
            parties: Array.isArray(oathSpec.parties) ? oathSpec.parties : [],
            promiseText: String(oathSpec.promiseText || oathSpec.title || ""),
            title: String(oathSpec.title || oathSpec.promiseText || ""),
            sanctityLevel: Number(oathSpec.sanctityLevel || 1.0),
            status: "sacred_active",
            createdAt: Date.now()
        };
        state.activeCovenants.set(id, covenant);
        state.updatedAt = Date.now();
        return covenant;
    }

    function shatterCovenant(state, covenantId, breakerActor = "") {
        if (!state || !state.activeCovenants) return null;
        const cov = state.activeCovenants.get(covenantId);
        if (!cov) return null;
        cov.status = "shattered";
        const brokenRecord = {
            covenantId,
            breakerActor: String(breakerActor),
            brokenAt: Date.now(),
            backlashTension: 1.0,
            directive: `[誓约决裂创伤] 誓约已被背弃！角色心中筑起永久性信任冰川，伴随剧烈痛苦与因果反噬。`
        };
        state.brokenOaths.push(brokenRecord);
        state.updatedAt = Date.now();
        return brokenRecord;
    }
    function generateAnchorDirectives(state, speaker = "") {
        if (!state) return null;
        const dirs = [];
        if (Array.isArray(state.brokenOaths) && state.brokenOaths.length > 0) {
            const latestBroken = state.brokenOaths[state.brokenOaths.length - 1];
            dirs.push(latestBroken.directive);
        } else if (state.activeCovenants && state.activeCovenants.size > 0) {
            for (const cov of state.activeCovenants.values()) {
                if (cov.status === "sacred_active") {
                    dirs.push(`[心中立下的誓约] 曾许下不可辜负的诺言：“${cov.promiseText || cov.title || '彼此的誓约'}”，无论面对何种境遇都不可轻易违背。`);
                    break;
                }
            }
        }
        return dirs.length ? dirs.join("\n") : null;
    }
    return {
        VERSION,
        createAnchorState,
        inscribeCovenant,
        shatterCovenant,
        generateAnchorDirectives
    };
}));
