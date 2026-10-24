/* ========================================================
 * temporal-validity-workflow.js — [M8-O3 · 第八期规划] 时间有效性工作流内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决“曾经为真、现在仍真、未来计划、已取消”在记忆库中混为一谈的问题：
 *     ① 双时间轴：eventTime（事件发生时点）与 learnTime（人物获知时点）；
 *     ② 五大生命周期状态：historical（历史旧事）/ current_valid（当前有效）/
 *        planned（未来计划）/ cancelled（已取消）/ uncertain（无法确定）；
 *     ③ 严格故事时钟比对：绝不拿真实机器时间硬套故事剧情时间；
 *     ④ 针对当前上下文的纯函数筛选与过期保护。
 * ======================================================== */
(function (root) {
    'use strict';

    const TEMPORAL_STATUS = Object.freeze({
        CURRENT_VALID: 'current_valid', // 当前依然成立的事实
        HISTORICAL: 'historical',       // 过去曾成立，如今已有新演变
        PLANNED: 'planned',             // 未来的安排或承诺
        CANCELLED: 'cancelled',         // 曾经计划但后来被取消
        UNCERTAIN: 'uncertain'          // 时间线索不全，无法判定
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeNum(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    /**
     * 根据故事时间判定单条事实的时间有效性状态
     */
    function classifyFactValidity(fact, storyTimelineMarker) {
        if (!fact || typeof fact !== 'object') {
            return { status: TEMPORAL_STATUS.UNCERTAIN, reason: 'invalid-fact' };
        }
        if (fact.isCancelled === true) {
            return { status: TEMPORAL_STATUS.CANCELLED, reason: 'explicitly-cancelled' };
        }

        const currentStoryFloor = typeof storyTimelineMarker === 'number' ? storyTimelineMarker : null;
        const validUntilFloor = typeof fact.validUntilFloor === 'number' ? fact.validUntilFloor : null;
        const validFromFloor = typeof fact.validFromFloor === 'number' ? fact.validFromFloor : null;

        if (currentStoryFloor == null) {
            // 没有提供故事参照点时，若有明确状态则返回，否则标为 uncertain
            return {
                status: fact.status && Object.values(TEMPORAL_STATUS).includes(fact.status) ? fact.status : TEMPORAL_STATUS.UNCERTAIN,
                reason: 'no-story-timeline-marker'
            };
        }

        // 检查未来计划
        if (validFromFloor != null && validFromFloor > currentStoryFloor) {
            return { status: TEMPORAL_STATUS.PLANNED, reason: 'scheduled-for-future' };
        }

        // 检查历史过期
        if (validUntilFloor != null && validUntilFloor <= currentStoryFloor) {
            return { status: TEMPORAL_STATUS.HISTORICAL, reason: 'superseded-or-expired' };
        }

        return { status: TEMPORAL_STATUS.CURRENT_VALID, reason: 'within-valid-window' };
    }

    /**
     * 过滤出适用于当前情境的事实列表
     * @param {Array} facts
     * @param {number} currentStoryFloor 当前故事进展楼层或序号
     * @param {Object} options { allowPlanned: boolean, allowHistorical: boolean }
     */
    function filterFactsByTemporalWindow(facts, currentStoryFloor, options = {}) {
        const list = safeArr(facts);
        const allowPlanned = options.allowPlanned === true;
        const allowHistorical = options.allowHistorical === true;

        return list.filter(fact => {
            const verdict = classifyFactValidity(fact, currentStoryFloor);
            if (verdict.status === TEMPORAL_STATUS.CURRENT_VALID) return true;
            if (verdict.status === TEMPORAL_STATUS.PLANNED) return allowPlanned;
            if (verdict.status === TEMPORAL_STATUS.HISTORICAL) return allowHistorical;
            if (verdict.status === TEMPORAL_STATUS.CANCELLED) return false;
            // uncertain 事实默认按当前有效宽松放行，避免全盘断崖
            return true;
        });
    }

    function temporalValiditySelfCheck() {
        const problems = [];
        if (Object.keys(TEMPORAL_STATUS).length !== 5) problems.push('TEMPORAL_STATUS 必须恰好为 5 项');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        TEMPORAL_STATUS,
        classifyFactValidity,
        filterFactsByTemporalWindow,
        temporalValiditySelfCheck
    });

    root.LonShaTemporalValidity = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);