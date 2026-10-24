/* ============================================================
 * unified-narrative-clock-axis.js — [L9-O3 · 第九期规划]
 * 叙事时钟与双时间事件轴统合编排器（纯函数内核）
 * ------------------------------------------------------------
 * 【治理缺口】
 *   旧时间处理模块（dual-time, ancient-story-clock, story-clock-parse）
 *   散落于各处。当模型面对“某事件在何时发生、角色在何时得知、当前是否仍有效”
 *   时，经常将现实时间、章节推进时间、古代时辰与虚拟公历混淆。
 *   特别是跨章节回忆或未来承诺场景，容易把过去的有效性误判为当下仍有效。
 *
 * 【核心设计】
 *   ① 四维时间锚定 (Quadruple Temporal Coordinates):
 *      - occurredAt: 故事内部客观发生时辰/时间戳
 *      - learnedAt: 该角色主观获知该事件的时辰/时间戳（知识边界）
 *      - recordedFloor: 记录发生时的楼层索引
 *      - validityRange: [validFrom, validTo] 生效区间
 *
 *   ② 叙事视角时空快照 (Narrative Perspective Snapshot):
 *      给定一个叙事时间点 (currentStoryClock):
 *      - PAST_VALID:    发生于过去，且在当下依然成立
 *      - HISTORICAL:    发生于过去，但已被后续事件覆盖闭合 (validTo < currentStoryClock)
 *      - FUTURE_PLEDGE: 发生/履约时间在未来的承诺或待办
 *      - UNKNOWN_TIMING: 无明确时间戳（绝不胡乱填充当前日期，严格标注未知）
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.UnifiedNarrativeClockAxis = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TEMPORAL_STATUS = Object.freeze({
        CURRENT_VALID: 'current_valid',     // 当下有效
        HISTORICAL_SUPERSEDED: 'historical',// 历史陈迹，已过期
        FUTURE_PLEDGE: 'future_pledge',     // 未来承诺/未到期
        UNKNOWN_TIMING: 'unknown_timing'    // 时间未明，存疑
    });

    function parseStoryTimestamp(val) {
        if (typeof val === 'number') return val;
        if (!val) return null;
        const str = String(val).trim();
        // 尝试解析纯数字
        const num = Number(str);
        if (!Number.isNaN(num) && num > 0) return num;
        // 尝试解析标准 ISO 日期
        const parsed = Date.parse(str);
        return Number.isNaN(parsed) ? null : parsed;
    }

    /**
     * 规范化时间轴事件项
     */
    function normalizeTimelineEvent(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = String(raw.id || raw.eventId || '').trim();
        if (!id) return null;

        const occurredAt = parseStoryTimestamp(raw.occurredAt || raw.happenedAt);
        const learnedAt = parseStoryTimestamp(raw.learnedAt || raw.knownAt || occurredAt);
        const validFrom = parseStoryTimestamp(raw.validFrom || raw.from || occurredAt);
        const validTo = parseStoryTimestamp(raw.validTo || raw.to);

        return {
            id,
            title: String(raw.title || raw.subject || '未命名事件').trim(),
            occurredAt,
            learnedAt,
            validFrom,
            validTo,
            recordedFloor: typeof raw.recordedFloor === 'number' ? raw.recordedFloor : 0,
            hasExplicitTiming: Boolean(occurredAt || validFrom)
        };
    }

    /**
     * 评估事件在特定叙事时钟下的有效性
     */
    function evaluateTemporalValidity(eventInput, currentStoryClock) {
        const ev = normalizeTimelineEvent(eventInput);
        if (!ev) return { ok: false, error: 'invalid-event' };

        const current = parseStoryTimestamp(currentStoryClock);
        if (current == null) {
            return {
                ok: true,
                status: TEMPORAL_STATUS.UNKNOWN_TIMING,
                reason: 'missing-or-invalid-current-story-clock',
                event: ev
            };
        }

        if (!ev.hasExplicitTiming) {
            return {
                ok: true,
                status: TEMPORAL_STATUS.UNKNOWN_TIMING,
                reason: 'event-lacks-explicit-timing-coordinates',
                event: ev
            };
        }

        // 未来承诺：生效时间晚于当前时钟
        if (ev.validFrom && ev.validFrom > current) {
            return {
                ok: true,
                status: TEMPORAL_STATUS.FUTURE_PLEDGE,
                reason: 'valid-from-in-future',
                event: ev
            };
        }

        // 历史已过期：闭合时间早于或等于当前时钟
        if (ev.validTo && ev.validTo <= current) {
            return {
                ok: true,
                status: TEMPORAL_STATUS.HISTORICAL_SUPERSEDED,
                reason: 'valid-to-superseded-or-closed',
                event: ev
            };
        }

        // 当下有效
        return {
            ok: true,
            status: TEMPORAL_STATUS.CURRENT_VALID,
            reason: 'active-within-temporal-envelope',
            event: ev
        };
    }

    /**
     * 将事件列表投影至叙事轴视图
     */
    function projectNarrativeAxis(events, currentStoryClock) {
        const list = Array.isArray(events) ? events : [];
        const active = [];
        const historical = [];
        const future = [];
        const untimed = [];

        for (const item of list) {
            const res = evaluateTemporalValidity(item, currentStoryClock);
            if (!res.ok) continue;

            switch (res.status) {
                case TEMPORAL_STATUS.CURRENT_VALID:
                    active.push(res.event);
                    break;
                case TEMPORAL_STATUS.HISTORICAL_SUPERSEDED:
                    historical.push(res.event);
                    break;
                case TEMPORAL_STATUS.FUTURE_PLEDGE:
                    future.push(res.event);
                    break;
                case TEMPORAL_STATUS.UNKNOWN_TIMING:
                default:
                    untimed.push(res.event);
                    break;
            }
        }

        return {
            currentClock: parseStoryTimestamp(currentStoryClock),
            totalEvents: list.length,
            activeCount: active.length,
            historicalCount: historical.length,
            futureCount: future.length,
            untimedCount: untimed.length,
            active,
            historical,
            future,
            untimed
        };
    }

    return {
        TEMPORAL_STATUS,
        parseStoryTimestamp,
        normalizeTimelineEvent,
        evaluateTemporalValidity,
        projectNarrativeAxis
    };
}));