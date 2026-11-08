/* ============================================================
 * psychological-burnout-resilience-decay.js — [v3.460.0 · V21-L18]
 * 长程情绪耗竭与心理韧性衰减模型 (Psychological Burnout Resilience Decay)
 * ------------------------------------------------------------
 * 1. 创伤抗击打心理韧性 (Mental Resilience Meter)
 * 2. 连续绝望境遇下的厌战与情感麻木 (Learned Helplessness)
 * 3. 治愈羁绊事件重塑心理韧性 (Psychological Restoration)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaBurnoutResilience = factory();
        root.PsychologicalBurnoutResilienceDecay = root.LonShaBurnoutResilience;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createResilienceState() {
        return {
            version: VERSION,
            actorResilience: new Map(), // actor -> { resilience: 1.0, exhaustion: 0.0 }
            updatedAt: Date.now()
        };
    }

    function applyStressTrauma(state, actor, stressImpact = 0.25) {
        if (!state || !state.actorResilience) return null;
        const name = String(actor || "");
        if (!state.actorResilience.has(name)) {
            state.actorResilience.set(name, { resilience: 1.0, exhaustion: 0.0 });
        }
        const st = state.actorResilience.get(name);
        st.exhaustion = Math.min(1.0, st.exhaustion + Number(stressImpact));
        st.resilience = Math.max(0.0, 1.0 - st.exhaustion);
        state.updatedAt = Date.now();

        let stateDescription = "心态充沛";
        if (st.exhaustion >= 0.75) {
            stateDescription = "重度心力交瘁，表现出倦怠麻木与习得性无助";
        } else if (st.exhaustion >= 0.4) {
            stateDescription = "有些疲惫与心防脆弱";
        }

        return {
            actor: name,
            resilience: Number(st.resilience.toFixed(2)),
            exhaustion: Number(st.exhaustion.toFixed(2)),
            directive: `[长程情绪耗竭状态] 角色当前处于「${stateDescription}」，言语中偶现疲态。`
        };
    }

    function generateBurnoutDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const resilienceMap = state.actorResilience;
        if (!resilienceMap) return null;
        const st = resilienceMap instanceof Map ? resilienceMap.get(speaker) : resilienceMap[speaker];
        if (!st || st.exhaustion < 0.3) return null;
        return `[当前精力状态] 角色近期稍感疲惫，语气略显温和倦怠。`;
    }

    return {
        VERSION,
        createResilienceState,
        applyStressTrauma,
        generateBurnoutDirectives
    };
}));
