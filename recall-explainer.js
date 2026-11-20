/* ============================================================
 * recall-explainer.js — L26-X9 检索解释器
 *
 * 【治的欠债】「为什么你记得这个」目前只能猜。用户看到一条被想起来的记忆，
 *   想知道它是被哪一路召回、命中了哪几个词、证据在哪条消息。
 *
 * 【三条硬要求】
 *   1. 给一条记忆或一个查询，能答：命中哪一路（keyword/vector/recency/…）、
 *      哪几个词、哪条证据消息；
 *   2. **不知道就说不知道**：路由未登记 ⇒ `unknown-route`，词与证据缺失单列，
 *      不许用分数硬编一个解释；
 *   3. 解释里出现的每个数（分数、名次）都必须来自入参，本档不算分。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRecallExplainer = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ROUTES = Object.freeze(['keyword', 'vector', 'recency', 'relation', 'entity']);

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    /**
     * @param {{query?:string, hits:Array}} opts
     *   hits: [{memoryId, route, terms?, score?, rank?, messageId?}]
     */
    function explain(opts) {
        var o = opts || {};
        var hits = Array.isArray(o.hits) ? o.hits : [];
        var rows = hits.map(function (h) {
            var r = h || {};
            var routeOk = ROUTES.indexOf(r.route) >= 0;
            var terms = Array.isArray(r.terms) ? r.terms.filter(function (t) { return typeof t === 'string' && t; }) : [];
            return {
                memoryId: r.memoryId === undefined ? null : r.memoryId,
                route: routeOk ? r.route : 'unknown-route',
                routeRegistered: routeOk,
                terms: terms,
                score: isNum(r.score) ? r.score : null,
                rank: isNum(r.rank) ? r.rank : null,
                evidence: {
                    messageId: r.messageId === undefined ? null : r.messageId,
                    floor: r.floor === undefined ? null : r.floor
                },
                /** 一句话解释；缺什么就明说缺什么，不留空白。 */
                text: (routeOk ? ('由「' + r.route + '」这一路召回') : '召回路径未登记（无法解释，不猜）')
                    + (terms.length ? '，命中词：' + terms.join('、') : '，没有词级证据')
                    + (r.messageId ? '，证据消息 ' + r.messageId : '，没有证据消息')
            };
        });
        var unknownRoute = rows.filter(function (r) { return !r.routeRegistered; }).map(function (r) { return r.memoryId; });
        var noEvidence = rows.filter(function (r) { return !r.evidence.messageId; }).map(function (r) { return r.memoryId; });
        return {
            query: typeof o.query === 'string' ? o.query : '',
            rows: rows,
            unknownRoute: unknownRoute,
            noEvidence: noEvidence,
            ok: rows.length > 0 && unknownRoute.length === 0,
            reading: rows.length === 0
                ? 'explain-no-hit'
                : (unknownRoute.length ? ('explain-unknown-route:' + unknownRoute.length) : ('explain:' + rows.length))
        };
    }

    /** 单条记忆的「为什么记得」：从轨迹里取最近一次命中。 */
    function whyRemembered(memory, trace) {
        var m = memory || {};
        var list = Array.isArray(trace) ? trace : [];
        var id = m.id === undefined ? null : m.id;
        var rows = list.filter(function (t) { return t && (t.memoryId === id || t.id === id); });
        if (!rows.length) {
            return {
                memoryId: id,
                found: false,
                text: '没有召回轨迹，无法解释这条为什么被记得',
                reading: 'explain-no-trace'
            };
        }
        var last = rows[rows.length - 1];
        var e = explain({ hits: [last] });
        return {
            memoryId: id,
            found: true,
            detail: e.rows[0],
            text: e.rows[0].text,
            reading: e.reading
        };
    }

    return {
        ROUTES: ROUTES,
        explain: explain,
        whyRemembered: whyRemembered
    };
}));