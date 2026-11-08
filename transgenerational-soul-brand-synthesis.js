/* ============================================================
 * transgenerational-soul-brand-synthesis.js — [v3.460.0 · V21-L9]
 * 跨周目灵魂烙印转生与深层潜意识代际沉淀 (Transgenerational Soul Brand Synthesis)
 * ------------------------------------------------------------
 * 1. 跨周目核心记忆升华为前世直觉烙印 (Instinctive Soul Brands)
 * 2. 轮回既视感微反应触发器 (Deja-Vu Epiphany Sensor)
 * 3. 宿命宿怨因果转生传承 (Reincarnation Karmic Lineage)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSoulBrand = factory();
        root.TransgenerationalSoulBrandSynthesis = root.LonShaSoulBrand;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createSoulBrandState() {
        return {
            version: VERSION,
            activeBrands: [], // [{ id, pastEpoch, characterOrigin, brandEssence, triggerKeywords, intuitionBonus }]
            incarnationCycle: 1,
            updatedAt: Date.now()
        };
    }

    function inscribeSoulBrand(state, brand = {}) {
        if (!state || !state.activeBrands) return false;
        const entry = {
            id: String(brand.id || `brand_${Date.now()}`),
            pastEpoch: String(brand.pastEpoch || "previous_life"),
            characterOrigin: String(brand.characterOrigin || "ancestor"),
            brandEssence: String(brand.brandEssence || "前世记忆的执念"),
            triggerKeywords: Array.isArray(brand.triggerKeywords) ? brand.triggerKeywords : [],
            intuitionBonus: String(brand.intuitionBonus || "莫名熟悉的第六感"),
            inscribedAt: Date.now()
        };
        state.activeBrands.push(entry);
        state.updatedAt = Date.now();
        return entry;
    }

    function probeDejaCasualResonance(state, contextText = "") {
        if (!state || !state.activeBrands) return [];
        const matches = [];
        for (const b of state.activeBrands) {
            for (const kw of b.triggerKeywords) {
                if (contextText.includes(kw)) {
                    matches.push({
                        brandId: b.id,
                        origin: b.characterOrigin,
                        flashbackPrompt: `[宿命既视感] 角色心中骤然升起强烈的莫明战栗与前世既视感：${b.intuitionBonus}`
                    });
                    break;
                }
            }
        }
        return matches;
    }

    return {
        VERSION,
        createSoulBrandState,
        inscribeSoulBrand,
        probeDejaCasualResonance
    };
}));
