/* ============================================================
 * memory-action-symbiosis-circuit.js — [L9-X8 · 第九期规划]
 * 记忆—行动共生回路与反馈闭环协调器（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   协调 LonSha 记忆与外部行动宿主（如 RubyPhone 建议执行）：
 *     - 四大行动反馈结果：
 *       'accepted' (已采纳执行), 'rejected' (明确拒绝),
 *       'timed_out' (超时未办), 'partially_completed' (部分完成)
 *     - 将行动反馈转化为下次材料准备与提示偏好，绝不全量复制外部应用状态
 *     - 即使外部桥梁断开，记忆内核保持自治与可用
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MemoryActionSymbiosisCircuit = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ACTION_OUTCOMES = Object.freeze({
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        TIMED_OUT: 'timed_out',
        PARTIAL: 'partially_completed'
    });

    function ingestActionFeedback(existingProfile = {}, feedback = {}) {
        const history = Array.isArray(existingProfile.actionFeedbackHistory)
            ? existingProfile.actionFeedbackHistory.slice()
            : [];

        const outcome = Object.values(ACTION_OUTCOMES).includes(feedback.outcome)
            ? feedback.outcome
            : ACTION_OUTCOMES.REJECTED;

        const record = {
            id: `act_fb_${Date.now()}`,
            suggestionId: feedback.suggestionId || 'unknown_suggestion',
            outcome,
            reason: String(feedback.reason || '').trim(),
            contextTopic: feedback.contextTopic || 'general',
            timestamp: Date.now()
        };

        history.push(record);

        // 调整下一次提示偏好：若连续被拒，增加建议谨慎度
        const recentRejections = history.slice(-3).filter(h => h.outcome === ACTION_OUTCOMES.REJECTED).length;
        const suggestionPrudenceLevel = recentRejections >= 2 ? 'high' : 'normal';

        return {
            ...existingProfile,
            actionFeedbackHistory: history,
            suggestionPrudenceLevel,
            lastFeedbackAt: Date.now()
        };
    }

    return {
        ACTION_OUTCOMES,
        ingestActionFeedback
    };
}));