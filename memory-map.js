/**
 * memory-map.js — 记忆地图 —— 唯一桥（v3.472.0 · L22-X6）
 *
 * 纪律：纯函数。把关系图谱投影成「节点 + 边」的地图数据（可缩放由视图负责）。
 * 只投影已有边，不重算权重。四态：invalid / empty / map。孤立节点如实保留。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'empty', 'map'];

    function buildMap(nodes, edges) {
        if (!Array.isArray(nodes) || !Array.isArray(edges)) return { face: 'invalid', nodes: [], edges: [], isolated: 0 };
        var nodeIds = {};
        var outNodes = [];
        for (var i = 0; i < nodes.length; i++) {
            var nd = nodes[i];
            if (!nd || typeof nd !== 'object') continue;
            var id = String(nd.id == null ? '' : nd.id).trim();
            if (!id || nodeIds[id]) continue;
            nodeIds[id] = true;
            outNodes.push({ id: id, label: String(nd.label == null ? '' : nd.label), kind: String(nd.kind == null ? '' : nd.kind) });
        }
        var outEdges = [];
        var degree = {};
        for (var j = 0; j < edges.length; j++) {
            var e = edges[j];
            if (!e || typeof e !== 'object') continue;
            var from = String(e.from == null ? '' : e.from).trim();
            var to = String(e.to == null ? '' : e.to).trim();
            if (!from || !to || !nodeIds[from] || !nodeIds[to]) continue;
            outEdges.push({ from: from, to: to, kind: String(e.kind == null ? '' : e.kind) });
            degree[from] = (degree[from] || 0) + 1;
            degree[to] = (degree[to] || 0) + 1;
        }
        var isolated = 0;
        for (var k = 0; k < outNodes.length; k++) if (!degree[outNodes[k].id]) isolated++;
        var face = outNodes.length ? 'map' : 'empty';
        return { face: face, nodes: outNodes, edges: outEdges, isolated: isolated };
    }

    function mapNote(r) {
        if (!r) return '读不出记忆地图';
        if (r.face === 'invalid') return '图谱数据读不出来';
        if (r.face === 'empty') return '还没有可成图的记忆';
        var extra = r.isolated ? '（' + r.isolated + ' 个孤立节点）' : '';
        return r.nodes.length + ' 个节点 / ' + r.edges.length + ' 条边' + extra;
    }

    function selfCheck() {
        var bad = [];
        if (buildMap(null, []).face !== 'invalid') bad.push('非数组应 invalid');
        if (buildMap([], []).face !== 'empty') bad.push('空应 empty');
        var r = buildMap(
            [{ id: 'a', label: 'A' }, { id: 'b' }, { id: 'c' }, { id: 'a' }],
            [{ from: 'a', to: 'b' }, { from: 'a', to: 'zzz' }]
        );
        if (r.nodes.length !== 3) bad.push('去重节点错，得 ' + r.nodes.length);
        if (r.edges.length !== 1) bad.push('悬空边应丢弃');
        if (r.isolated !== 1) bad.push('孤立节点计数错');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, buildMap: buildMap, mapNote: mapNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryMap = api;
})(typeof window !== 'undefined' ? window : globalThis);
