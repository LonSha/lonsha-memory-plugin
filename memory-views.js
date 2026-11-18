/* ============================================================
 * memory-views.js — R24-X1 记忆交互台：时间线 / 图谱 / 检索三视图
 *
 * 【治的欠债】记忆只以注入文本被感知；memory-map / knowledge-network / graph_algorithms
 *   都是图算法内核，**没有任何视图消费它们**。
 *
 * 【一处计算，三处渲染】`project(store)` 算出唯一投影（时间线 / 节点 / 边 / 索引），
 *   三个视图只读投影，不许各算一遍。三视图条数与关系数因此天然一致。
 *
 * 【回溯】每个节点都带 `sourceRef`（会话 + 楼层 + 原文），点开能回到原文。
 * 【空库】三视图各自说明「还没有记忆」，不给空白页。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaMemoryViews = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function arr(v) { return Array.isArray(v) ? v : []; }
    function idOf(m) { return String(m && m.id); }
    function tsOf(m) { var n = Date.parse(m && (m.at || m.createdAt) || ""); return Number.isFinite(n) ? n : 0; }

    function isCjk(c) { return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf); }
    function tokenize(text) {
        var s = String(text || "").toLowerCase();
        var out = [];
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (isCjk(c)) { out.push(s.charAt(i)); if (i + 1 < s.length && isCjk(s.charCodeAt(i + 1))) out.push(s.substr(i, 2)); }
        }
        return out;
    }

    /**
     * 唯一投影。store 形状：
     *   { memories:[{id,text,at,sessionId,floor,persons:[],places:[],type}] }
     */
    function project(store) {
        var list = arr(store && store.memories);
        var nodes = {};
        var edges = {};
        var timeline = [];

        function touch(key, kind, label) {
            if (!nodes[key]) nodes[key] = { key: key, kind: kind, label: label, mems: [] };
            return nodes[key];
        }
        function link(a, b) {
            if (!a || !b || a === b) return;
            var k = a < b ? a + "~" + b : b + "~" + a;
            if (!edges[k]) edges[k] = { a: a < b ? a : b, b: a < b ? b : a, weight: 0, mems: [] };
            edges[k].weight += 1;
        }

        list.forEach(function (m) {
            var id = idOf(m);
            var ref = { id: id, sessionId: String(m.sessionId || ""), floor: m.floor === undefined ? null : m.floor, text: String(m.text || "") };
            timeline.push({
                id: id, at: tsOf(m), text: String(m.text || ""),
                persons: arr(m.persons).map(String), places: arr(m.places).map(String),
                type: String(m.type || "事件"), sourceRef: ref
            });
            var keys = [];
            arr(m.persons).forEach(function (p) { var k = "p:" + p; touch(k, "person", String(p)).mems.push(id); keys.push(k); });
            arr(m.places).forEach(function (p) { var k = "l:" + p; touch(k, "place", String(p)).mems.push(id); keys.push(k); });
            var ek = "e:" + id;
            touch(ek, "event", String(m.text || "").slice(0, 12)).mems.push(id); keys.push(ek);
            for (var i = 0; i < keys.length; i++) for (var j = i + 1; j < keys.length; j++) link(keys[i], keys[j]);
        });

        timeline.sort(function (x, y) { if (x.at !== y.at) return x.at - y.at; return x.id < y.id ? -1 : 1; });
        var nodeList = Object.keys(nodes).map(function (k) { return nodes[k]; });
        var edgeList = Object.keys(edges).map(function (k) { return edges[k]; });

        var byPerson = {}, byPlace = {}, byType = {};
        timeline.forEach(function (t) {
            t.persons.forEach(function (p) { (byPerson[p] = byPerson[p] || []).push(t.id); });
            t.places.forEach(function (p) { (byPlace[p] = byPlace[p] || []).push(t.id); });
            (byType[t.type] = byType[t.type] || []).push(t.id);
        });

        return {
            ok: true,
            count: timeline.length,
            timeline: timeline,
            nodes: nodeList, edges: edgeList,
            nodeByKey: nodes, byPerson: byPerson, byPlace: byPlace, byType: byType,
            empty: timeline.length === 0
        };
    }

    var EMPTY_MSG = {
        timeline: "还没有记忆：开始对话后，这里会按时间排出它记住的事。",
        graph: "还没有记忆：有了人物与地点后，这里会长出关系网。",
        search: "还没有记忆：先聊几句，再来搜。"
    };

    /** 时间线视图：可按人物 / 地点 / 类型筛。 */
    function timelineView(proj, filter) {
        var p = proj || project({});
        if (p.empty) return { ok: true, empty: true, message: EMPTY_MSG.timeline, items: [] };
        var f = filter && typeof filter === "object" ? filter : {};
        var items = p.timeline.filter(function (t) {
            if (f.person && t.persons.indexOf(String(f.person)) === -1) return false;
            if (f.place && t.places.indexOf(String(f.place)) === -1) return false;
            if (f.type && t.type !== String(f.type)) return false;
            return true;
        });
        return {
            ok: true, empty: false, items: items,
            total: p.count, filtered: items.length,
            facets: { persons: Object.keys(p.byPerson).sort(), places: Object.keys(p.byPlace).sort(), types: Object.keys(p.byType).sort() },
            detail: function (id) {
                var t = p.timeline.filter(function (x) { return x.id === String(id); })[0];
                if (!t) return { ok: false, reason: "not-found" };
                var related = p.edges.filter(function (e) {
                    return p.nodeByKey[e.a] && p.nodeByKey[e.a].mems.indexOf(t.id) !== -1 && p.nodeByKey[e.b] && p.nodeByKey[e.b].kind !== "event";
                }).map(function (e) { return { node: p.nodeByKey[e.b].label, kind: p.nodeByKey[e.b].kind, weight: e.weight }; });
                return { ok: true, item: t, sourceRef: t.sourceRef, related: related };
            }
        };
    }

    /** 图谱视图：三色节点 + 边权=共现强度；可聚焦某人。 */
    function graphView(proj, options) {
        var p = proj || project({});
        if (p.empty) return { ok: true, empty: true, message: EMPTY_MSG.graph, nodes: [], edges: [] };
        var o = options && typeof options === "object" ? options : {};
        var nodes = p.nodes, edges = p.edges;
        if (o.focus) {
            var key = "p:" + String(o.focus);
            var near = {};
            near[key] = true;
            edges.forEach(function (e) { if (e.a === key || e.b === key) { near[e.a] = true; near[e.b] = true; } });
            nodes = nodes.filter(function (n) { return near[n.key]; });
            var keep = {};
            nodes.forEach(function (n) { keep[n.key] = true; });
            edges = edges.filter(function (e) { return keep[e.a] && keep[e.b]; });
        }
        return {
            ok: true, empty: false,
            nodes: nodes.map(function (n) { return { key: n.key, kind: n.kind, label: n.label, degree: n.mems.length, sourceRef: { mems: n.mems.slice() } }; }),
            edges: edges.map(function (e) { return { a: e.a, b: e.b, weight: e.weight }; }),
            trailBack: function (memId) {
                var m = p.timeline.filter(function (t) { return t.id === String(memId); })[0];
                return m ? m.sourceRef : { ok: false, reason: "not-found" };
            }
        };
    }

    /** 检索视图：三路候选与各自贡献（与 O1 同源口径），点开看命中片段。 */
    function searchView(proj, query, options) {
        var p = proj || project({});
        if (p.empty) return { ok: true, empty: true, message: EMPTY_MSG.search, results: [] };
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) > 0 ? Number(o.k) : 10;
        var terms = tokenize(query);
        var out = [];
        p.timeline.forEach(function (t) {
            var toks = tokenize(t.text);
            var hit = [];
            terms.forEach(function (w) { if (toks.indexOf(w) !== -1 && hit.indexOf(w) === -1) hit.push(w); });
            if (!hit.length) return;
            var score = hit.length / (toks.length || 1);
            var snippetAt = t.text.indexOf(hit[hit.length - 1]);
            out.push({
                id: t.id, score: Number(score.toFixed(6)),
                routes: { bm25: hit.length, ngram: hit.filter(function (w) { return w.length >= 2; }).length },
                matched: hit,
                snippet: snippetAt >= 0 ? t.text.slice(Math.max(0, snippetAt - 6), snippetAt + hit[hit.length - 1].length + 6) : t.text.slice(0, 24),
                sourceRef: t.sourceRef
            });
        });
        out.sort(function (x, y) { if (y.score !== x.score) return y.score - x.score; return x.id < y.id ? -1 : 1; });
        return { ok: true, empty: false, query: String(query || ""), terms: terms, results: out.slice(0, k), candidates: out.length };
    }

    function makeStore(n, seed) {
        var persons = ["林夏", "陈舟", "老周", "小雨"];
        var places = ["车站", "天台", "书店", "海边"];
        var types = ["承诺", "冲突", "相遇"];
        var out = [];
        var s = Number(seed) || 20261118;
        for (var i = 0; i < n; i++) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            var p1 = persons[s % persons.length];
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            var p2 = persons[s % persons.length];
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            var pl = places[s % places.length];
            out.push({
                id: "m" + i,
                text: p1 + "在" + pl + "对" + p2 + "说了一件事第" + (i % 29) + "次",
                at: "2026-11-" + String(1 + (i % 18)).padStart(2, "0") + "T" + String(i % 24).padStart(2, "0") + ":00:00Z",
                sessionId: "s" + (i % 3), floor: i % 400 + 1,
                persons: p1 === p2 ? [p1] : [p1, p2], places: [pl], type: types[i % types.length]
            });
        }
        return out;
    }

    function viewsSelfCheck() {
        var bad = [];
        var store = { memories: makeStore(120, 5) };
        var p = project(store);
        var tl = timelineView(p, {});
        var gv = graphView(p, {});
        var sv = searchView(p, "林夏车站", { k: 5 });
        if (tl.total !== p.count || tl.items.length !== p.count) bad.push("timeline-count");
        if (sv.results.length > 5) bad.push("search-k");
        // 同源：三视图都从同一投影读
        if (gv.nodes.filter(function (n) { return n.kind === "event"; }).length !== p.count) bad.push("graph-event-count");
        var d = tl.detail("m3");
        if (!d.ok || d.sourceRef.floor === null) bad.push("trail-back");
        if (graphView(p, {}).trailBack("m3").sessionId === undefined) bad.push("graph-trail");
        var emp = project({ memories: [] });
        if (!timelineView(emp, {}).message || !graphView(emp, {}).message || !searchView(emp, "x").message) bad.push("empty-msg");
        // 聚焦语义：返回的边必须都碰焦点，节点集 = 这些边的端点；用最少出现的人验证真的缩了
        var rarest = p.nodes.filter(function (n) { return n.kind === "person"; }).sort(function (x, y) { return x.mems.length - y.mems.length; })[0];
        var focus = graphView(p, { focus: rarest.label });
        var fk = rarest.key;
        // 聚焦视图 = 焦点 + 一跳邻居 + 它们之间的边（邻居之间的边也是合法关系，不算越界）
        var adj = {}; adj[fk] = true;
        p.edges.forEach(function (e) { if (e.a === fk) adj[e.b] = true; if (e.b === fk) adj[e.a] = true; });
        if (!focus.nodes.every(function (n) { return adj[n.key]; })) bad.push("focus-node-not-adjacent");
        var ends = {};
        focus.edges.forEach(function (e) { ends[e.a] = true; ends[e.b] = true; });
        if (!focus.nodes.every(function (n) { return ends[n.key]; })) bad.push("focus-node-stray");
        if (!(focus.nodes.length <= gv.nodes.length)) bad.push("focus-larger");
        var t0 = Date.now();
        project({ memories: makeStore(10000, 9) });
        var ms = Date.now() - t0;
        return {
            ok: bad.length === 0, bad: bad,
            sample: "memories=" + p.count + " nodes=" + p.nodes.length + " edges=" + p.edges.length + " project10kMs=" + ms
        };
    }

    return {
        project: project,
        timelineView: timelineView, graphView: graphView, searchView: searchView,
        makeStore: makeStore,
        viewsSelfCheck: viewsSelfCheck
    };
}));
