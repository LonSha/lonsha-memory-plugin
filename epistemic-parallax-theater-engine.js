/* ============================================================
 * epistemic-parallax-theater-engine.js — [L10-X7 · 第十期全量创新]
 * 多角色知情视差与戏剧张力机（Epistemic Parallax Theater Engine）
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决群戏与多角色互动中「全员上帝视角、无戏剧张力」的痛点：
 *   经典戏剧张力源于【信息差】（Dramatic Irony）—— 玩家知道、A 知道，但 B 不知道甚至产生合理误解。
 *   1. 知情视差三元组（Parallax Triad）：
 *      - 客观真实现象（Ground Truth）
 *      - 知情者群体（Knowers：拥有真相）
 *      - 蒙在鼓里/误解者群体（Misinformed：基于有限线索形成猜疑或假象）
 *   2. 角色视角提示词分流（Perspective-Specific Prompt Split）：
 *      同一场对话中，为知情角色注入「守秘/试探」提示，为误解角色注入「合理误判」提示，形成天然张力。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEpistemicParallax = factory();
    root.EpistemicParallaxTheaterEngine = root.LonShaEpistemicParallax;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 创建知情视差条目
     */
    function createParallaxEntry(item = {}) {
        return {
            id: item.id || `para_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            groundTruth: String(item.groundTruth || '').trim(), // 事实真相
            knowers: Array.isArray(item.knowers) ? item.knowers.filter(Boolean) : [], // 知情者
            ignorantActors: Array.isArray(item.ignorantActors) ? item.ignorantActors.filter(Boolean) : [], // 不知情者
            plausibleMisconception: String(item.plausibleMisconception || '').trim(), // 不知情者的合理误解
            tensionClimaxFloor: Number.isFinite(item.tensionClimaxFloor) ? item.tensionClimaxFloor : null, // 揭秘高潮预设楼层
            status: 'active',
            createdAt: Date.now()
        };
    }

    /**
     * 针对特定角色，生成定制化的视差知情/误解引导提示
     * @param {Object} parallax - 视差三元组
     * @param {string} actorName - 当前生成视角的角色名
     * @returns {Object} { roleStance: 'knower' | 'ignorant' | 'unrelated', narrativeGuidance: string }
     */
    function resolvePerspectiveGuidance(parallax = {}, actorName = '') {
        const name = String(actorName || '').trim();
        const isKnower = Array.isArray(parallax.knowers) && parallax.knowers.includes(name);
        const isIgnorant = Array.isArray(parallax.ignorantActors) && parallax.ignorantActors.includes(name);

        if (isKnower) {
            return {
                roleStance: 'knower',
                narrativeGuidance: `【知情者视角】：你深知真相（${parallax.groundTruth}），但深知某些在场者并不知情。请在言行中保持守秘、试探或隐晦掩护，勿直接破梗。`
            };
        } else if (isIgnorant) {
            const mis = parallax.plausibleMisconception || '完全不知情，凭有限线索产生直觉怀疑';
            return {
                roleStance: 'ignorant',
                narrativeGuidance: `【视差误解视角】：你对核心真相一无所知！在你的认知体系中，当前情况是：“${mis}”。请务必展现这种由于信息差带来的困惑、误会或错误判断！`
            };
        }

        return {
            roleStance: 'unrelated',
            narrativeGuidance: ''
        };
    }

    /**
     * 揭晓真相：破除视差，完成叙事高潮
     */
    function revealGroundTruth(parallax = {}, actorWhoRevealed = '') {
        return {
            ...parallax,
            status: 'revealed',
            revealedBy: String(actorWhoRevealed || 'unknown'),
            revealedAt: Date.now(),
            aftermathNarrative: `【戏剧张力释出】：${actorWhoRevealed}当众揭晓了“${parallax.groundTruth}”，此前所有误解与防线全面坍塌。`
        };
    }

    return Object.freeze({
        createParallaxEntry,
        resolvePerspectiveGuidance,
        revealGroundTruth
    });
}));