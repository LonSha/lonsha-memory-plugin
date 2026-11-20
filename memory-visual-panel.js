/* ============================================================
 * memory-visual-panel.js — L26-X3 记忆可视化面板
 *
 * 【治的欠债】只有文本列表，没有关系/时间线的图。用户看不到「这些记忆怎么连起来」。
 *
 * 【三条硬要求】
 *   1. 图可点回源：每个节点带 `messageId`（从图点回具体那条消息）；
 *   2. 悬空引用单列（边指向不存在的节点 ⇒ `dangling` 读数），不许静默丢掉；
 *   3. 无数据时显示「还没有」而不是空图 —— 空图看起来像「画不出来」。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaMemoryVisualPanel = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var EMPTY_TEXT = '还没有记忆';

    function nodeOf(rec) {
        var r = rec || {};
        var id = r.id || r.memoryId;
        if (typeof id !== 'string' || !id) return null;
        return {
            id: id,
            label: String(r.title || r.summary || r.content || '').slice(0, 40) || '（无标题）',
            kind: r.kind === undefined ? 'memory' : String(r.kind),
            weight: typeof r.weight === 'number' && isFinite(r.weight) ? r.weight : 1,
            /** 点回源：图上的点必须能回到具体消息。 */
            messageId: r.messageId === undefined ? null : r.messageId
        };
    }

    /**
     * @param {{records:Array, relations:Array}} opts relations: [{from,to,kind}]
     */
    function buildGraph(opts) {
        var o = opts || {};
        var nodes = [];
        var seen = {};
        (Array.isArray(o.records) ? o.records : []).forEach(function (rec) {
            var n = nodeOf(rec);
            if (!n || seen[n.id]) return;
            seen[n.id] = true;
            nodes.push(n);
        });
        var edges = [];
        var dangling = [];
        (Array.isArray(o.relations) ? o.relations : []).forEach(function (rel) {
            var r = rel || {};
            if (!r.from || !r.to) return;
            if (!seen[r.from] || !seen[r.to]) {
                dangling.push({ from: r.from, to: r.to, kind: r.kind || 'related', why: '两端至少有一端不在记忆里' });
                return;
            }
            edges.push({ from: r.from, to: r.to, kind: r.kind || 'related' });
        });
        var connected = {};
        edges.forEach(function (e) { connected[e.from] = true; connected[e.to] = true; });
        var isolated = nodes.filter(function (n) { return !connected[n.id]; }).map(function (n) { return n.id; });
        return {
            nodes: nodes,
            edges: edges,
            dangling: dangling,
            isolated: isolated,
            isEmpty: nodes.length === 0,
            reading: nodes.length === 0
                ? 'visual-empty'
                : ('visual-graph:' + nodes.length + 'n/' + edges.length + 'e' + (dangling.length ? '/dangling:' + dangling.length : ''))
        };
    }

    /** 面板视图模型：空态给人话，有数据给图与可点回源的数量。 */
    function panelViewModel(opts) {
        var g = buildGraph(opts);
        if (g.isEmpty) {
            return {
                graph: g,
                empty: true,
                text: EMPTY_TEXT,
                clickable: 0,
                reading: g.reading
            };
        }
        return {
            graph: g,
            empty: false,
            text: '共 ' + g.nodes.length + ' 条记忆、' + g.edges.length + ' 条关系' +
                (g.dangling.length ? '；另有 ' + g.dangling.length + ' 条关系指向已删除的记忆' : ''),
            clickable: g.nodes.filter(function (n) { return !!n.messageId; }).length,
            reading: g.reading
        };
    }

    return {
        EMPTY_TEXT: EMPTY_TEXT,
        buildGraph: buildGraph,
        panelViewModel: panelViewModel
    };
}));