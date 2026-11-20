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
    function project(store, options) {
        var o = options && typeof options === "object" ? options : {};
        /* [v4.162.0 · R26-O2] 投影缓存：同一（时点 / 库版本）只算一次。
         *   版本由调用方给（versionOf）；缺省用「条目 id + 正文长度」的粗指纹 ——
         *   粗指纹抓不住「同长度改写」，要精确就让调用方注入 versionOf。 */
        var cache = o.cache && typeof o.cache === "object" ? o.cache : null;
        if (cache) {
            if (!cache.entries || typeof cache.entries !== "object") cache.entries = {};
            if (!Number.isFinite(Number(cache.hits))) cache.hits = 0;
            if (!Number.isFinite(Number(cache.misses))) cache.misses = 0;
            var ver = typeof o.versionOf === "function"
                ? String(o.versionOf(store, o.machineState))
                : arr(store && store.memories).map(function (m) { return String(m && m.id) + ":" + String(m && m.text || "").length; }).join(",");
            var ckey = String(o.atRound === undefined || o.atRound === null ? "live" : "r" + Number(o.atRound)) + "@" + ver;
            if (cache.entries[ckey]) {
                cache.hits += 1;
                var hitProj = JSON.parse(JSON.stringify(cache.entries[ckey]));
                hitProj.meta = Object.assign({}, hitProj.meta, { cache: "hit" });
                return hitProj;
            }
            cache.misses += 1;
            var freshProj = project(store, Object.assign({}, o, { cache: null }));
            freshProj.meta = Object.assign({}, freshProj.meta, { cache: "miss" });
            cache.entries[ckey] = JSON.parse(JSON.stringify(freshProj));
            return freshProj;
        }
        /* [v4.160.0 · R25-O2] 时点投影：给了 atRound 就从时间机器取那一份**不可变快照**作投影源，
         *   而不是拿现库重画。取不到就具名降级（degraded），不许静默退回现库冒充历史。 */
        var meta = { atRound: null, at: "", source: "live", degraded: "" };
        if (o.atRound !== undefined && o.atRound !== null) {
            var api = o.timeMachine && typeof o.timeMachine === "object" ? o.timeMachine : null;
            var state = o.machineState && typeof o.machineState === "object" ? o.machineState : null;
            var mark = api && state && typeof api.findMark === "function" ? api.findMark(state, o.atRound) : null;
            meta.atRound = Number(o.atRound);
            if (mark && mark.store) {
                store = mark.store;
                meta.source = "mark";
                meta.at = String(mark.at || "");
            } else {
                meta.source = "missing";
                meta.degraded = "no-such-round: " + String(o.atRound);
            }
        }
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
            meta: meta,
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
        if (p.empty) return { ok: true, empty: true, message: EMPTY_MSG.timeline, items: [], meta: p.meta || null };
        var f = filter && typeof filter === "object" ? filter : {};
        var items = p.timeline.filter(function (t) {
            if (f.person && t.persons.indexOf(String(f.person)) === -1) return false;
            if (f.place && t.places.indexOf(String(f.place)) === -1) return false;
            if (f.type && t.type !== String(f.type)) return false;
            return true;
        });
        return {
            ok: true, empty: false, items: items, meta: p.meta || null,
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
        if (p.empty) return { ok: true, empty: true, message: EMPTY_MSG.graph, nodes: [], edges: [], meta: p.meta || null };
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
            ok: true, empty: false, meta: p.meta || null,
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
        if (p.empty) return { ok: true, empty: true, message: EMPTY_MSG.search, results: [], meta: p.meta || null };
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
        return { ok: true, empty: false, query: String(query || ""), terms: terms, results: out.slice(0, k), candidates: out.length, meta: p.meta || null };
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

    /** [v4.160.0 · R25-O2] 两时点差异的视图化：行与时间机器的五类差异**逐条同源**，不另算一套。 */
    function diffView(roundA, roundB, timeMachine, machineState) {
        var api = timeMachine && typeof timeMachine === "object" ? timeMachine : null;
        var st = machineState && typeof machineState === "object" ? machineState : null;
        if (!api || !st || typeof api.diff !== "function") return { ok: false, bad: ["no-time-machine"], rows: [], counts: {} };
        var d = api.diff(st, roundA, roundB);
        if (!d || d.ok !== true) return { ok: false, bad: (d && d.bad) || ["diff-failed"], rows: [], counts: {} };
        var rows = arr(d.changes).map(function (c) {
            return { kind: String(c.kind), id: String(c.id), before: c.before === undefined ? "" : String(c.before), after: c.after === undefined ? "" : String(c.after) };
        });
        return { ok: true, from: d.from, to: d.to, rows: rows, counts: d.counts };
    }

    /** [v4.161.0 · R25-X5] 两张图谱按两时点对比：只报对称差，不画不存在的边。
     *  边的集合 = 输入的并集里的人；新增/消失各自点名，新增边带来源楼层（取投影里的 sourceRef）。
     */
    function graphDiff(viewA, viewB, projectB) {
        var a = viewA || {}, b = viewB || {};
        function keyOf(e) { var x = String(e.a), y = String(e.b); return x < y ? x + "||" + y : y + "||" + x; }
        var A = {}, B = {};
        arr(a.edges).forEach(function (e) { A[keyOf(e)] = e; });
        arr(b.edges).forEach(function (e) { B[keyOf(e)] = e; });
        var added = [], removed = [], same = [];
        Object.keys(B).forEach(function (k) {
            if (!A[k]) added.push({ key: k, a: B[k].a, b: B[k].b, weight: B[k].weight });
            else same.push({ key: k, a: B[k].a, b: B[k].b, weight: B[k].weight });
        });
        Object.keys(A).forEach(function (k) { if (!B[k]) removed.push({ key: k, a: A[k].a, b: A[k].b, weight: A[k].weight }); });
        added.sort(function (x, y) { return x.key < y.key ? -1 : 1; });
        removed.sort(function (x, y) { return x.key < y.key ? -1 : 1; });
        var nodes = {};
        arr(b.nodes).forEach(function (n) { nodes[n.key] = n; });
        arr(a.nodes).forEach(function (n) { if (!nodes[n.key]) nodes[n.key] = n; });
        /** 新增边的来源楼层：只从投影的 timeline 里查真楼层，查不到就空着（不编）。 */
        function refsOf(edge) {
            var out = [], ats = [];
            [edge.a, edge.b].forEach(function (k) {
                var n = nodes[k];
                if (!n) return;
                arr(n.sourceRef && n.sourceRef.mems).forEach(function (id) {
                    var t = arr(projectB && projectB.timeline).filter(function (x) { return String(x.id) === String(id); })[0];
                    var f = t && t.sourceRef && t.sourceRef.floor;
                    if (f !== undefined && f !== null && out.indexOf(Number(f)) === -1) out.push(Number(f));
                    var when = t && (t.at || t.createdAt);
                    if (when) ats.push(String(when));
                });
            });
            out.sort(function (x, y) { return x - y; });
            ats.sort();
            return { floors: out, at: ats.length ? ats[ats.length - 1] : "" };
        }
        var rows = added.map(function (e) { var r = refsOf(e); return { kind: "added", edge: e.key, a: e.a, b: e.b, weight: e.weight, floors: r.floors, at: r.at }; })
            .concat(removed.map(function (e) { return { kind: "removed", edge: e.key, a: e.a, b: e.b, weight: e.weight, floors: [], at: "" }; }));
        rows.sort(function (x, y) { return x.edge < y.edge ? -1 : 1; });
        return {
            ok: true, rows: rows,
            added: added, removed: removed, same: same,
            counts: { added: added.length, removed: removed.length, same: same.length, drawn: added.length + same.length },
            symmetricDifference: added.map(function (e) { return e.key; }).sort().concat(removed.map(function (e) { return e.key; }).sort()),
            phantom: 0, dashed: 0
        };
    }

    /** 投影缓存工场：调用方持有它，跨多次投影复用。 */
    /* ================= R26-X5 图谱对比可导出 =================
     * 欠债：差异只活在内存里——能看，不能发给人。
     * 做法：导出成可贴进聊天的定长文本（每行一条边，带方向/两端/权重/楼层/时间），
     *   并给 parseGraphDiff 读回来：条数与边集合必须与对比结果逐条一致（可回查，不是一次性文案）。
     */
    var DIFF_MARK = "[edge]";

    function exportGraphDiff(diff, options) {
        var o = options && typeof options === "object" ? options : {};
        var d = diff && typeof diff === "object" ? diff : {};
        var rows = arr(d.rows);
        var c = d.counts || { added: 0, removed: 0, same: 0, drawn: 0 };
        var head = [
            "# 图谱对比" + (o.title ? "：" + String(o.title) : ""),
            "新增 " + Number(c.added || 0) + " 条 / 消失 " + Number(c.removed || 0) + " 条 / 未变 " + Number(c.same || 0) + " 条",
            o.fromAt || o.toAt ? "时点：" + String(o.fromAt || "?") + " " + String(o.toAt || "?") : ""
        ].filter(function (x) { return x.length > 0; });
        var body = rows.map(function (r) {
            var dir = r.kind === "added" ? "+" : "-";
            var floors = arr(r.floors);
            var floorTxt = floors.length ? floors.join(",") : "?";
            return DIFF_MARK + " " + dir + " " + String(r.a) + " || " + String(r.b)
                + " | w=" + Number(r.weight || 0) + " | floor=" + floorTxt + " | at=" + (String(r.at || "") || "?");
        });
        var text = head.concat(body).join(String.fromCharCode(10));
        return {
            ok: true, text: text, count: rows.length,
            edges: rows.map(function (r) { return String(r.edge); }),
            headLines: head.length, lineCount: head.length + body.length
        };
    }

    /** 把导出文本读回来：只认带标记的行，条数与边要能逐条对得上。 */
    function parseGraphDiff(text) {
        var lines = String(text || "").split(String.fromCharCode(10));
        var rows = [];
        lines.forEach(function (line) {
            var s = line.trim();
            if (s.indexOf(DIFF_MARK) !== 0) return;
            var parts = s.slice(DIFF_MARK.length + 1).split(" | ");
            var head = parts[0] || "";
            var dir = head.charAt(0);
            var pair = head.slice(2).split(" || ");
            var weight = 0, floor = "", at = "";
            parts.slice(1).forEach(function (kv) {
                var eq = kv.indexOf("=");
                if (eq < 0) return;
                var k = kv.slice(0, eq), v = kv.slice(eq + 1);
                if (k === "w") weight = Number(v) || 0;
                else if (k === "floor") floor = v;
                else if (k === "at") at = v;
            });
            var a = String(pair[0] || ""), b = String(pair[1] || "");
            rows.push({
                kind: dir === "+" ? "added" : "removed",
                edge: a < b ? a + "||" + b : b + "||" + a,
                a: a, b: b, weight: weight,
                floors: floor === "?" || floor === "" ? [] : floor.split(",").map(Number),
                at: at === "?" ? "" : at
            });
        });
        return { ok: true, rows: rows, count: rows.length, edges: rows.map(function (r) { return r.edge; }) };
    }

    function makeProjectCache() { return { entries: {}, hits: 0, misses: 0 }; }

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
        project: project, graphDiff: graphDiff, makeProjectCache: makeProjectCache,
        exportGraphDiff: exportGraphDiff, parseGraphDiff: parseGraphDiff, DIFF_MARK: DIFF_MARK,
        timelineView: timelineView, graphView: graphView, searchView: searchView,
        diffView: diffView,
        makeStore: makeStore,
        viewsSelfCheck: viewsSelfCheck
    };
}));
