/* ============================================================
 * autonomic-nervous-somatic-flare-engine.js — [v3.460.0 · V21-L13]
 * 微观生理反射与自律神经失控仿真机 (Autonomic Somatic Flare Engine)
 * ------------------------------------------------------------
 * 1. 心率过速、指尖冰凉、呼吸急促等神经反射计算 (Somatic Reflexes)
 * 2. 极度羞怯/高危场景语言颤抖失控 (Verbal Dysfluency Generator)
 * 3. 身体语言与微动作垂直注入 (Micro-Expression Injection)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSomaticEngine = factory();
        root.AutonomicNervousSomaticFlareEngine = root.LonShaSomaticEngine;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function evaluateSomaticReflex(arousalLevel = 0.5, valenceLevel = 0.0) {
        const arousal = Math.max(0.0, Math.min(1.0, Number(arousalLevel)));
        const valence = Math.max(-1.0, Math.min(1.0, Number(valenceLevel)));

        let physicalReaction = "平静呼吸";
        let verbalTremor = false;

        if (arousal > 0.85) {
            verbalTremor = true;
            physicalReaction = valence < 0 ? "瞳孔骤缩，指尖冰冷发颤，呼吸断续急促" : "心跳轰鸣如擂鼓，耳根滚烫，眼神慌乱不知所措";
        } else if (arousal > 0.6) {
            physicalReaction = valence < 0 ? "下意识紧绷双肩，后背发凉" : "喉头发紧，指节微微收缩握紧";
        }

        return {
            arousal,
            valence,
            physicalReaction,
            verbalTremor,
            promptInjection: `[微观生理神经反射] 身体诚实地给出本能反射：${physicalReaction}。说话时略带不自然的迟疑。`
        };
    }

    function generateSomaticFlareDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const reflex = state.latestReflex || state.reflex;
        if (!reflex) return null;
        const reaction = reflex.physicalReaction || "";
        return `[肢体自然反应] 身体下意识表现：${reaction}。`;
    }

    return {
        VERSION,
        evaluateSomaticReflex,
        generateSomaticFlareDirectives
    };
}));
