/* ============================================================
 * autonomous-rumination-dream-engine.js — [v3.460.0 · V21-L11]
 * 角色自主反思与闲暇梦境隐喻编织机 (Autonomous Rumination & Dream Engine)
 * ------------------------------------------------------------
 * 1. 会话间歇期触发角色闲暇心智自反思 (Off-Screen Rumination)
 * 2. 弗洛伊德象征主义隐喻梦境合成 (Metaphorical Dream Weaver)
 * 3. 上线唤醒潜意识信天翁对话启发 (Awakening Dialogue Hooks)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaDreamEngine = factory();
        root.AutonomousRuminationDreamEngine = root.LonShaDreamEngine;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function synthesizeMetaphoricalDream(character, emotionalTheme = "anxiety") {
        const themeMap = {
            anxiety: "梦见在迷雾无尽的旋转阶梯上奔跑，怀中的钟表不断倒流，无论如何也追赶不上那道远去的背影。",
            affection: "梦见在黄昏微风的深蓝海岸边，掌心握着微温的琉璃石，耳畔回荡着熟悉低语。",
            guilt: "梦见站在倾塌的旧宅残垣中，双手沾染洗不净的落叶尘埃，暗处有沉默的眼睛凝视。"
        };
        const dreamText = themeMap[emotionalTheme] || "梦见漂浮在无垠的星海与重叠的迷宫回廊之间。";
        return {
            character: String(character || "主角"),
            theme: emotionalTheme,
            dreamContent: dreamText,
            subconsciousDirective: `[梦境残余心境] 角色清晨从这番隐喻梦境中惊醒，残存的情绪(${emotionalTheme})隐隐影响着最初的交谈口吻。`
        };
    }

    function generateRuminationDirectives(state = {}, speaker = "角色") {
        if (!state) return null;
        const dream = state.latestDream || (Array.isArray(state.history) && state.history[state.history.length - 1]);
        if (!dream) return null;
        const content = dream.dreamContent || dream.content || "";
        return `[昨夜梦境心境] ${speaker}昨夜梦见了「${content}」，醒来后心绪受此触动。`;
    }

    return {
        VERSION,
        synthesizeMetaphoricalDream,
        generateRuminationDirectives
    };
}));
