/* ============================================================
 * dissociative-amnesia-puzzle-workbench.js — [v3.460.0 · V21-L14]
 * 记忆解离、创伤遗忘与迷雾碎片考古工作台 (Amnesia Puzzle Workbench)
 * ------------------------------------------------------------
 * 1. 记忆碎片迷雾遮蔽与解密进度 (Fog-of-Memory Obfuscation)
 * 2. 旧物证线索催化解锁判定 (Catalytic Clue Unlocking)
 * 3. 终极真相拼齐高潮大回响 (Climax Epiphany Resonance)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaAmnesiaWorkbench = factory();
        root.DissociativeAmnesiaPuzzleWorkbench = root.LonShaAmnesiaWorkbench;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createPuzzleState() {
        return {
            version: VERSION,
            hiddenFragments: new Map(), // fragmentId -> { clueRequirements, isUnlocked, content }
            unlockedCount: 0,
            updatedAt: Date.now()
        };
    }

    function registerHiddenFragment(state, fragment = {}) {
        if (!state || !state.hiddenFragments) return null;
        const id = String(fragment.id || `frag_${Date.now()}`);
        const record = {
            id,
            title: String(fragment.title || "残缺记忆碎片"),
            content: String(fragment.content || ""),
            clueRequired: String(fragment.clueRequired || "key"),
            isUnlocked: false
        };
        state.hiddenFragments.set(id, record);
        state.updatedAt = Date.now();
        return record;
    }

    function presentClueTrigger(state, clueKeyword = "") {
        if (!state || !state.hiddenFragments) return [];
        const newlyUnlocked = [];
        for (const [id, frag] of state.hiddenFragments.entries()) {
            if (!frag.isUnlocked && clueKeyword.includes(frag.clueRequired)) {
                frag.isUnlocked = true;
                state.unlockedCount++;
                newlyUnlocked.push(frag);
            }
        }
        state.updatedAt = Date.now();
        return newlyUnlocked;
    }

    return {
        VERSION,
        createPuzzleState,
        registerHiddenFragment,
        presentClueTrigger
    };
}));
