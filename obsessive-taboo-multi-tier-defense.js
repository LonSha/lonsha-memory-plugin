/* ============================================================
 * obsessive-taboo-multi-tier-defense.js — [v3.460.0 · V21-L4]
 * 创伤禁忌与应激失控的多层心理防线重构 (Multi-Tier Taboo Defense Engine)
 * ------------------------------------------------------------
 * 升级 V20 机械硬拦截为动态心理张力波形与三层渐进心理防线：
 * Tier 1: 轻微回避 (Defensive Diversion & Evasion)
 * Tier 2: 掩饰性谎言/合理化 (Rationalization & Masking)
 * Tier 3: 应激崩溃破防 (Acute Traumatic Meltdown & Lash-Out)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMultiTierDefense = factory();
        root.ObsessiveTabooMultiTierDefense = root.LonShaMultiTierDefense;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    const DEFENSE_TIER = Object.freeze({
        TIER_1_EVASION: 1,       // 轻微回避
        TIER_2_RATIONALIZE: 2,   // 掩饰合理化
        TIER_3_MELTDOWN: 3       // 应激破防
    });

    function createMultiTierDefenseState() {
        return {
            version: VERSION,
            tabooSensors: new Map(), // character -> [{ tabooId, keyword, triggerCount, traumaThreshold }]
            stressTension: new Map(), // character -> tensionLevel (0.0 ~ 1.0)
            updatedAt: Date.now()
        };
    }

    function registerCharacterTaboo(state, character, taboo = {}) {
        if (!state || !state.tabooSensors) return false;
        const charName = String(character || "").trim();
        if (!charName) return false;
        if (!state.tabooSensors.has(charName)) {
            state.tabooSensors.set(charName, []);
            state.stressTension.set(charName, 0.0);
        }
        const list = state.tabooSensors.get(charName);
        list.push({
            tabooId: String(taboo.id || taboo.tabooId || `taboo_${Date.now()}`),
            topic: String(taboo.topic || taboo.keyword || "").trim(),
            keywords: Array.isArray(taboo.keywords) ? taboo.keywords : [String(taboo.keyword || taboo.topic || taboo || "")].filter(Boolean),
            traumaThreshold: Number(taboo.traumaThreshold || 0.7),
            sensitizedAt: Date.now()
        });
        state.updatedAt = Date.now();
        return true;
    }

    function evaluatePsychologicalDefense(state, character, incomingText = "") {
        if (!state || !state.tabooSensors) return { tier: 0, tension: 0.0, directive: null };
        const charName = String(character || "").trim();
        const taboos = state.tabooSensors.get(charName) || [];
        let currentTension = state.stressTension.get(charName) || 0.0;
        let matchedTaboo = null;

        for (const t of taboos) {
            for (const kw of t.keywords) {
                if (incomingText.includes(kw)) {
                    matchedTaboo = t;
                    currentTension = Math.min(1.0, currentTension + 0.35);
                    break;
                }
            }
            if (matchedTaboo) break;
        }

        if (!matchedTaboo) {
            currentTension = Math.max(0.0, currentTension - 0.05); // 自然平复
        }

        state.stressTension.set(charName, currentTension);
        state.updatedAt = Date.now();

        if (currentTension >= 0.75) {
            return {
                tier: DEFENSE_TIER.TIER_3_MELTDOWN,
                tension: currentTension,
                matchedTaboo,
                directive: "[心理创伤重度应激] 角色情绪彻底失控破防，表现出歇斯底里、剧烈抗拒或攻击性防御，语序破碎。"
            };
        } else if (currentTension >= 0.4) {
            return {
                tier: DEFENSE_TIER.TIER_2_RATIONALIZE,
                tension: currentTension,
                matchedTaboo,
                directive: "[掩饰性防御] 角色内心警惕紧绷，言语中极力粉饰太平、编造合理化借口试图转移矛盾。"
            };
        } else if (currentTension > 0.1) {
            return {
                tier: DEFENSE_TIER.TIER_1_EVASION,
                tension: currentTension,
                matchedTaboo,
                directive: "[轻微回避] 角色眼神游移、短暂沉默，试图轻描淡写地换个轻松话题避开尴尬点。"
            };
        }

        return { tier: 0, tension: currentTension, matchedTaboo: null, directive: null };
    }

    return {
        VERSION,
        DEFENSE_TIER,
        createMultiTierDefenseState,
        registerCharacterTaboo,
        evaluatePsychologicalDefense
    };
}));
