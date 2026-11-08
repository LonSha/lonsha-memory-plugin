/* ============================================================
 * worldaxis-objective-to-subjective-assimilator.js — [v3.460.0 · V21-L10]
 * WorldAxis 客观世界快照的主观摄入与消化中枢 (WorldAxis Assimilator)
 * ------------------------------------------------------------
 * 专门对接 WorldAxis 客观世界桥 window.worldaxis_bridge_v1：
 * 1. 过滤宏观天气、时钟与突发事件 (Ingest Objective World Snapshot)
 * 2. 结合角色性格与心智模型转化为角色主观认知与感叹 (Subjective Filter)
 * 3. 避免双重世界推演，只做主观心智折射 (No Wheel Reinvention)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaWorldAxisAssimilator = factory();
        root.WorldAxisObjectiveToSubjectiveAssimilator = root.LonShaWorldAxisAssimilator;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function assimilateWorldAxisState(worldSnapshot = {}, characterPersona = {}) {
        if (!worldSnapshot || typeof worldSnapshot !== "object") {
            return { ok: false, subjectiveRefraction: null };
        }
        const clock = worldSnapshot.clock || {};
        const weather = worldSnapshot.weather || "晴朗";
        const currents = Array.isArray(worldSnapshot.undercurrents) ? worldSnapshot.undercurrents : [];
        const charName = String(characterPersona.name || "角色");
        const sensitivity = Number(characterPersona.sensitivity || 0.6);

        const refractions = [];
        if (weather.includes("雨") || weather.includes("雪") || weather.includes("暴")) {
            refractions.push(`窗外恶劣的气候(${weather})让${charName}有些心绪不宁。`);
        }
        if (currents.length > 0 && sensitivity > 0.5) {
            refractions.push(`${charName}隐约察觉到城中暗流涌动，气氛似乎有些不对劲。`);
        }

        return {
            ok: true,
            assimilatedTime: clock.label || "当下时刻",
            weather,
            subjectiveRefraction: refractions.join(" ")
        };
    }

    function generateAssimilatorDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const ref = state.latestRefraction || state.subjectiveRefraction;
        if (!ref) return null;
        return `[场景氛围感知] ${ref}`;
    }

    return {
        VERSION,
        assimilateWorldAxisState,
        generateAssimilatorDirectives
    };
}));
