/* ============================================================
 * memory-season-silence-manager.js — [L9-X1 · 第九期规划]
 * 记忆季候与沉默管理引擎（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   记忆主题因故事周期、关系演化、地点重访、新事实涌现而浮现或沉淀：
 *     - silence 状态具备明确因果归因：
 *       'unprocessed' | 'user_muted' | 'no_relation' | 'unauthorized' | 'insufficient_evidence'
 *     - 支持对主题进行 postpone(延后)、mute(静音)、inquire(追问) 与 reopen(重开)
 *     - 秘密记忆严格受权限约束，不因周年/地点等季候机制而意外泄漏
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MemorySeasonSilenceManager = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function evaluateTopicSeason(topic, context = {}) {
        if (!topic || !topic.id) return null;
        
        // 权限与秘密检查
        if (topic.isSecret && !context.isSecretAuthorized) {
            return {
                topicId: topic.id,
                status: 'silenced',
                reason: 'unauthorized',
                canSurfacing: false
            };
        }

        // 用户显式静音
        if (context.mutedTopicIds && context.mutedTopicIds.includes(topic.id)) {
            return {
                topicId: topic.id,
                status: 'silenced',
                reason: 'user_muted',
                canSurfacing: false
            };
        }

        // 证据支持评估
        const evidenceCount = Number(topic.evidenceCount) || 0;
        if (evidenceCount < 1) {
            return {
                topicId: topic.id,
                status: 'silenced',
                reason: 'insufficient_evidence',
                canSurfacing: false
            };
        }

        // 季候浮现触发条件（地点关联、人物在场、叙事事件匹配）
        const matchLocation = Boolean(context.currentLocation && topic.location === context.currentLocation);
        const matchActor = Boolean(context.activeActor && topic.actors && topic.actors.includes(context.activeActor));
        const isAnniversary = Boolean(context.storyClock && topic.targetEpoch && Math.abs(context.storyClock - topic.targetEpoch) < 86400000);

        const isSurfacing = matchLocation || matchActor || isAnniversary;

        return {
            topicId: topic.id,
            status: isSurfacing ? 'surfacing' : 'dormant',
            reason: isSurfacing ? 'context_matched' : 'unprocessed',
            canSurfacing: isSurfacing,
            matchedSignals: {
                matchLocation,
                matchActor,
                isAnniversary
            }
        };
    }

    return {
        evaluateTopicSeason
    };
}));