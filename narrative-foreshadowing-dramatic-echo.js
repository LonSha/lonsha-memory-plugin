/* ============================================================
 * narrative-foreshadowing-dramatic-echo.js — [L11-X5 · 第十一期前沿拓展机制]
 * 戏剧伏笔与因果回响闭环编排器 (Narrative Foreshadowing & Dramatic Echo)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长篇互动中早期大量细节「沉底腐烂、失去戏剧回响」的问题：
 *   1. 伏笔线索潜伏管理（Foreshadowing Anchor Ledger）：
 *      登记早期漫不经心的细节、无意中留下的谜题或承诺；
 *   2. 关键剧情节点自动共鸣唤醒（Dramatic Echo Resonance）：
 *      当剧情推进到高潮危机或重大对决时，自动检索沉寂 50+ 轮以上的潜伏伏笔；
 *   3. 伏笔引爆与高光闭环（Climax Detonation）：
 *      将伏笔织入当前的叙事注入，让玩家产生“原来命运在百轮之前就已埋下契机”的惊艳宿命感。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaForeshadowingEcho = factory();
        root.NarrativeForeshadowingDramaticEcho = root.LonShaForeshadowingEcho;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 注册一条潜伏伏笔
     * @param {Object} spec - 伏笔规格 { clue, plantedFloor, latentTheme, triggerCondition }
     * @returns {Object} 伏笔对象
     */
    function plantForeshadowing(spec = {}) {
        return {
            id: `clue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            clue: String(spec.clue || '').trim(),
            plantedFloor: Number(spec.plantedFloor || 1),
            latentTheme: spec.latentTheme || 'fate',
            detonated: false,
            detonatedFloor: null
        };
    }

    /**
     * 扫描沉寂伏笔并在当前情境中触发戏剧因果回响
     * @param {Array} plantedClues - 伏笔库
     * @param {Object} currentContext - 当前高潮节点情境 { currentFloor, tension, isClimax, theme }
     * @returns {Object} 回响匹配结果
     */
    function findAndDetonateEcho(plantedClues = [], currentContext = {}) {
        if (!Array.isArray(plantedClues) || plantedClues.length === 0) {
            return { hasEcho: false, detonatedClue: null, echoDirective: '' };
        }

        const currentFloor = Number(currentContext.currentFloor || 1);
        const isClimax = !!currentContext.isClimax || currentContext.tension === 'confrontational';

        // 寻找沉寂超过 30 轮且尚未引爆的伏笔
        const candidate = plantedClues.find(c => !c.detonated && (currentFloor - c.plantedFloor) >= 30);

        if (!candidate || !isClimax) {
            return { hasEcho: false, detonatedClue: null, echoDirective: '' };
        }

        // 引爆伏笔
        const detonatedClue = {
            ...candidate,
            detonated: true,
            detonatedFloor: currentFloor
        };

        const echoDirective = `【伏笔因果回响·高潮揭秘】：早在第 ${candidate.plantedFloor} 轮埋下的伏笔（${candidate.clue}），在当下命运交织的关口被彻底引爆。请在台词或内心独白中自然揭开这层隐秘联系，展现宿命般的闭环震颤。`;

        return {
            hasEcho: true,
            detonatedClue,
            echoDirective
        };
    }

    return {
        plantForeshadowing,
        findAndDetonateEcho
    };
}));