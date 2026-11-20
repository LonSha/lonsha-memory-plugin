/* ============================================================
 * relation-timeline-view.js — L26-X5 关系时间线视图
 *
 * 【治的欠债】承接 L25-X7：关系变化只有「当前值」，没有「什么时候变的」。
 *   用户问「我们什么时候开始变冷的」，插件答不上来。
 *
 * 【三条硬要求】
 *   1. 时间轴可拖（`viewport` 按窗口裁剪，并报出**窗口外还有几条**）、可筛（按类型/强度）；
 *   2. 每个事件可点到证据消息（`evidence.messageId`）；没有证据的进 `unanchored`，
 *      **不许伪装成有时间的事**；
 *   3. 时间缺失/非法一律进 `unanchored`，不许当 `0` 排在最前面。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRelationTimelineView = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var EVENT_KINDS = Object.freeze(['first-met', 'grow-closer', 'conflict', 'repair', 'distance', 'promise']);
    var EMPTY_TEXT = '还没有关系变化';

    function normalize(events) {
        var anchored = [];
        var unanchored = [];
        (Array.isArray(events) ? events : []).forEach(function (e) {
            var ev = e || {};
            var at = ev.at;
            var okAt = typeof at === 'number' && isFinite(at);
            if (!okAt) {
                unanchored.push({ id: ev.id === undefined ? null : ev.id, kind: ev.kind || 'unknown', why: '没有可信时间，不能排进时间轴' });
                return;
            }
            anchored.push({
                id: ev.id === undefined ? null : ev.id,
                kind: EVENT_KINDS.indexOf(ev.kind) >= 0 ? ev.kind : 'unknown',
                at: at,
                strength: typeof ev.strength === 'number' && isFinite(ev.strength) ? ev.strength : null,
                summary: String(ev.summary === undefined ? '' : ev.summary),
                evidence: {
                    messageId: ev.messageId === undefined ? null : ev.messageId,
                    floor: ev.floor === undefined ? null : ev.floor
                }
            });
        });
        anchored.sort(function (a, b) {
            if (a.at !== b.at) return a.at - b.at;
            return String(a.id) < String(b.id) ? -1 : (String(a.id) > String(b.id) ? 1 : 0);
        });
        return { anchored: anchored, unanchored: unanchored };
    }

    function buildTimeline(events) {
        var n = normalize(events);
        var withEvidence = n.anchored.filter(function (e) { return !!e.evidence.messageId; }).length;
        return {
            items: n.anchored,
            unanchored: n.unanchored,
            span: n.anchored.length ? { from: n.anchored[0].at, to: n.anchored[n.anchored.length - 1].at } : null,
            isEmpty: n.anchored.length === 0,
            evidenceCoverage: n.anchored.length ? Math.round((withEvidence / n.anchored.length) * 1000) / 10 : 0,
            reading: n.anchored.length === 0
                ? 'timeline-empty'
                : ('timeline:' + n.anchored.length + ' 段/证据 ' + withEvidence)
        };
    }

    /** 拖动窗口：只留窗口内的事件，窗口外数量必须报出来（不许静默截断）。 */
    function viewport(timeline, opts) {
        var t = timeline || {};
        var o = opts || {};
        var items = Array.isArray(t.items) ? t.items : [];
        var from = typeof o.from === 'number' && isFinite(o.from) ? o.from : -Infinity;
        var to = typeof o.to === 'number' && isFinite(o.to) ? o.to : Infinity;
        if (from > to) throw new TypeError('[L26-X5] 窗口起点晚于终点：' + from + ' > ' + to);
        var inside = items.filter(function (e) { return e.at >= from && e.at <= to; });
        return {
            items: inside,
            hidden: items.length - inside.length,
            reading: inside.length === 0 ? 'timeline-window-empty' : ('timeline-window:' + inside.length + '/' + items.length)
        };
    }

    /** 筛选：按类型与最小强度。筛掉的条数要报数。 */
    function filterTimeline(timeline, opts) {
        var t = timeline || {};
        var o = opts || {};
        var items = Array.isArray(t.items) ? t.items : [];
        var kinds = Array.isArray(o.kinds) && o.kinds.length ? o.kinds : null;
        var minStrength = typeof o.minStrength === 'number' && isFinite(o.minStrength) ? o.minStrength : null;
        var kept = items.filter(function (e) {
            if (kinds && kinds.indexOf(e.kind) < 0) return false;
            if (minStrength !== null) {
                if (e.strength === null) return false; // 没强度不许当成「很强」
                if (e.strength < minStrength) return false;
            }
            return true;
        });
        return {
            items: kept,
            removed: items.length - kept.length,
            reading: kept.length === 0 ? 'timeline-filter-empty' : ('timeline-filtered:' + kept.length)
        };
    }

    /** 行视图：给 UI 直接铺，空态给人话。 */
    function rows(timeline) {
        var t = timeline || {};
        var items = Array.isArray(t.items) ? t.items : [];
        if (!items.length) return { rows: [], text: EMPTY_TEXT, reading: 'timeline-empty' };
        return {
            rows: items.map(function (e) {
                return {
                    at: e.at,
                    kind: e.kind,
                    text: e.summary || ('（' + e.kind + '）'),
                    clickable: !!e.evidence.messageId,
                    messageId: e.evidence.messageId
                };
            }),
            text: '共 ' + items.length + ' 段关系变化',
            reading: t.reading || 'timeline'
        };
    }

    return {
        EVENT_KINDS: EVENT_KINDS,
        EMPTY_TEXT: EMPTY_TEXT,
        buildTimeline: buildTimeline,
        viewport: viewport,
        filterTimeline: filterTimeline,
        rows: rows
    };
}));