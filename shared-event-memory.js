/* ============================================================
 * shared-event-memory.js — R24-X6 世界共享记忆：多个角色记得同一件事
 *
 * 【治的欠债】隔离层解决的是「各不串记忆」；机构/集体层不是「共享事实」。
 *   现状：A 与 B 都经历了同一场雨，两条记忆各记一份，永远对不上。
 *
 * 【本体一份】共享事件只存一份本体（时间/地点/参与人）；角色持有的是**视角记忆**（引用本体）。
 * 【三态】agreed / divergent / single_witness。
 * 【不仲裁】分歧不合并：两条视角并存，差异逐字段列出。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaSharedEventMemory = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATES = Object.freeze(["agreed", "divergent", "single_witness"]);
    var FACETS = Object.freeze(["when", "where", "who", "what"]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function str(v) { return v === undefined || v === null ? "" : String(v); }

    function buildBodies(memories) {
        var bodies = {};
        arr(memories).forEach(function (m) {
            var eid = str(m.eventId);
            if (!eid) return;
            if (!bodies[eid]) {
                bodies[eid] = {
                    eventId: eid, when: str(m.when), where: str(m.where),
                    who: arr(m.who).map(String).sort(), what: str(m.what || m.text), holders: []
                };
            }
            bodies[eid].holders.push(str(m.holder));
        });
        Object.keys(bodies).forEach(function (k) { bodies[k].holders = bodies[k].holders.sort(); });
        return bodies;
    }

    function facetOf(m) {
        return {
            when: str(m.when), where: str(m.where),
            who: arr(m.who).map(String).sort().join(","),
            what: str(m.what || m.text)
        };
    }

    function diffs(a, b) {
        var fa = facetOf(a), fb = facetOf(b), out = [];
        FACETS.forEach(function (f) { if (fa[f] !== fb[f]) out.push({ facet: f, a: fa[f], b: fb[f] }); });
        return out;
    }

    function summarize(memories) {
        var list = arr(memories);
        var bodies = buildBodies(list);
        var byEvent = {};
        list.forEach(function (m) {
            var eid = str(m.eventId);
            if (!eid) return;
            (byEvent[eid] = byEvent[eid] || []).push(m);
        });
        var rows = [];
        Object.keys(byEvent).sort().forEach(function (eid) {
            var group = byEvent[eid], holders = {};
            group.forEach(function (m) { holders[str(m.holder)] = true; });
            var names = Object.keys(holders).sort();
            var state = "agreed", detail = [];
            if (names.length === 1) { state = "single_witness"; }
            else {
                var first = group[0];
                var bad = [];
                group.slice(1).forEach(function (m) {
                    var d = diffs(first, m);
                    if (d.length) bad.push({ holders: [str(first.holder), str(m.holder)], diffs: d });
                });
                if (bad.length) { state = "divergent"; detail = bad; }
            }
            rows.push({
                eventId: eid, state: state, holders: names,
                bodyCount: bodies[eid] ? 1 : 0, divergences: detail,
                perspectives: group.map(function (m) { return { id: str(m.id), holder: str(m.holder), text: str(m.text) }; })
            });
        });
        var counts = { agreed: 0, divergent: 0, single_witness: 0 };
        rows.forEach(function (r) { counts[r.state] += 1; });
        return { ok: true, bodies: bodies, bodyCount: Object.keys(bodies).length, rows: rows, counts: counts };
    }

    function recallFor(summary, who, options) {
        var o = options && typeof options === "object" ? options : {};
        var rows = arr(summary && summary.rows);
        var target = str(who), out = [];
        rows.forEach(function (r) {
            if (o.eventId && r.eventId !== str(o.eventId)) return;
            if (r.holders.indexOf(target) !== -1) {
                var mine = r.perspectives.filter(function (p) { return p.holder === target; })[0];
                out.push({ eventId: r.eventId, mode: "own", text: mine.text, holder: target });
            } else if (o.publicEvents !== false) {
                var body = summary.bodies[r.eventId];
                out.push({
                    eventId: r.eventId, mode: "heard_about",
                    text: body ? (body.what + "（听说，来源：" + r.holders.join("/") + "）") : "（听说）",
                    holder: r.holders.slice()
                });
            }
        });
        return { ok: true, who: target, results: out };
    }

    function fixture() {
        return [
            { id: "a1", eventId: "rain", holder: "林夏", when: "2026-11-01", where: "车站", who: ["林夏", "陈舟"], what: "雨下得很大", text: "雨下得很大", secret: "她很害怕" },
            { id: "b1", eventId: "rain", holder: "陈舟", when: "2026-11-01", where: "车站", who: ["林夏", "陈舟"], what: "雨下得很大，他先走了", text: "雨下得很大，他先走了", secret: "他忘了带伞" },
            { id: "c1", eventId: "book", holder: "小雨", when: "2026-11-05", where: "书店", who: ["小雨"], what: "书店关门了", text: "书店关门了" }
        ];
    }

    function sharedSelfCheck() {
        var bad = [];
        if (STATES.length !== 3) bad.push("states");
        var s = summarize(fixture());
        if (s.bodyCount !== 2) bad.push("body-count:" + s.bodyCount);
        if (s.bodies.rain.holders.length !== 2) bad.push("holders");
        var rain = s.rows.filter(function (r) { return r.eventId === "rain"; })[0];
        if (rain.state !== "divergent") bad.push("should-be-divergent");
        if (!rain.divergences.length || !rain.divergences[0].diffs.length) bad.push("no-diffs");
        if (rain.perspectives.length !== 2) bad.push("perspectives-merged");
        var book = s.rows.filter(function (r) { return r.eventId === "book"; })[0];
        if (book.state !== "single_witness") bad.push("single");
        var me = recallFor(s, "小雨");
        var heard = me.results.filter(function (r) { return r.eventId === "rain"; })[0];
        if (!heard || heard.mode !== "heard_about") bad.push("heard-about");
        if (heard && heard.text.indexOf("听说") === -1) bad.push("heard-annotation");
        var own = recallFor(s, "林夏");
        if (!own.results.some(function (r) { return r.eventId === "rain" && r.mode === "own"; })) bad.push("own-mode");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "events=" + s.rows.length + " bodies=" + s.bodyCount + " divergent=" + s.counts.divergent + " single=" + s.counts.single_witness
        };
    }

    return {
        STATES: STATES, FACETS: FACETS,
        buildBodies: buildBodies, summarize: summarize, diffs: diffs,
        recallFor: recallFor, fixture: fixture,
        sharedSelfCheck: sharedSelfCheck
    };
}));
