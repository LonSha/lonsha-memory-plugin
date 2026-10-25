/* ============================================================
 * psychological-boundary-shift.js — [L10-X6 · 第十期全量创新]
 * 关系动力学与心理安全边界漂移（Psychological Boundary Shift）
 * ------------------------------------------------------------
 * 【核心设计】
 *   人际关系不是简单的好感度数值，而是具体的禁忌、允许与心理安全边界。
 *   1. 边界层级（Boundary Level）：
 *      FORMAL (客套疏离) -> CAUTIOUS (礼貌防备) -> FAMILIAR (熟稔允许) -> INTIMATE (毫无防线)；
 *   2. 互动特许（Interaction Prerogative）：
 *      亲昵昵称允许、过往隐私探寻、肢体距离触碰、脆弱面袒露；
 *   3. 破窗与壁垒重构（Breach & Re-fortification）：
 *      关系受创时，特许权利被撤回，心理安全边界骤降并重新竖起防御壁垒。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPsychologicalBoundary = factory();
    root.PsychologicalBoundaryShift = root.LonShaPsychologicalBoundary;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const BOUNDARY_TIER = Object.freeze({
        FORMAL: 'formal',       // 客套距离
        CAUTIOUS: 'cautious',   // 礼貌保留
        FAMILIAR: 'familiar',   // 熟稔接纳
        INTIMATE: 'intimate'    // 亲密无防
    });

    const PREROGATIVES = Object.freeze({
        NICKNAME_ALLOWED: 'nickname_allowed',       // 亲昵称谓特许
        PAST_SECRETS_PROBE: 'past_secrets_probe',   // 触碰隐秘过往
        PHYSICAL_PROXIMITY: 'physical_proximity',   // 亲近身体距离
        VULNERABILITY_SHARE: 'vulnerability_share'  // 暴露无助脆弱
    });

    /**
     * 初始化或更新角色间的心理边界状态
     */
    function createBoundaryState(pairKey = 'user_actor', initialTier = BOUNDARY_TIER.CAUTIOUS) {
        const allowed = new Set();
        if (initialTier === BOUNDARY_TIER.FAMILIAR) {
            allowed.add(PREROGATIVES.NICKNAME_ALLOWED);
        } else if (initialTier === BOUNDARY_TIER.INTIMATE) {
            Object.values(PREROGATIVES).forEach(p => allowed.add(p));
        }

        return {
            pairKey,
            tier: initialTier,
            trustScore: initialTier === BOUNDARY_TIER.INTIMATE ? 0.9 : 0.4,
            allowedPrerogatives: Array.from(allowed),
            recentTraumaEvents: [],
            updatedAt: Date.now()
        };
    }

    /**
     * 推进关系特许突破
     */
    function grantPrerogative(state = {}, prerogative) {
        if (!Object.values(PREROGATIVES).includes(prerogative)) return { ...state };
        const set = new Set(Array.isArray(state.allowedPrerogatives) ? state.allowedPrerogatives : []);
        set.add(prerogative);

        let newTier = state.tier;
        if (set.size >= 4) newTier = BOUNDARY_TIER.INTIMATE;
        else if (set.size >= 2) newTier = BOUNDARY_TIER.FAMILIAR;

        return {
            ...state,
            tier: newTier,
            trustScore: Math.min(1.0, (state.trustScore || 0.5) + 0.15),
            allowedPrerogatives: Array.from(set),
            updatedAt: Date.now()
        };
    }

    /**
     * 遭遇背叛或冲突：心理边界骤降，壁垒重构
     */
    function triggerBoundaryRefortification(state = {}, breachReason = '') {
        return {
            ...state,
            tier: BOUNDARY_TIER.CAUTIOUS,
            trustScore: Math.max(0.1, ((state.trustScore || 0.5) * 0.4)),
            // 撤回亲密与隐私特许，仅保留最基础称谓（若曾有）
            allowedPrerogatives: state.allowedPrerogatives.includes(PREROGATIVES.NICKNAME_ALLOWED) 
                ? [PREROGATIVES.NICKNAME_ALLOWED] 
                : [],
            recentTraumaEvents: [
                ...(state.recentTraumaEvents || []),
                { reason: String(breachReason || '信任破裂'), timestamp: Date.now() }
            ],
            defenseNarrative: `【心理防御壁垒重构】：因“${breachReason}”，心理安全边界撤回至礼貌防备，拒绝深层情感探寻。`,
            updatedAt: Date.now()
        };
    }

    return Object.freeze({
        BOUNDARY_TIER,
        PREROGATIVES,
        createBoundaryState,
        grantPrerogative,
        triggerBoundaryRefortification
    });
}));