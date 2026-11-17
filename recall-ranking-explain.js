/**
 * recall-ranking-explain.js — 检索可解释排序 —— 唯一桥（v3.473.0 · L23-X6）
 *
 * 纪律：纯函数。只把「候选为什么排在这里」摊开成四项分项，不重排宿主给定的分数口径以外的任何东西，
 *   也不写存储、不碰全局状态。
 * 三态：ranked（有候选且有分项）/ empty（无候选）/ invalid（形状读不出）。
 * 缺项纪律：某一路分数**没有**（undefined / null / NaN / 非数字）时必须记 'unknown'，
 *   **禁止用 0 顶替** —— 0 是「这一路给了零分」，unknown 是「这一路没给分」，两者结论不同。
 *   unknown 不计入 total，且结果 complete=false，调用方据此不许把它当满分候选。
 */
(function (global) {
    'use strict';

    var CHANNELS = ['vector', 'recency', 'significance', 'graph'];

    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function explainOne(cand, weights) {
        if (!cand || typeof cand !== 'object') return null;
        var parts = {};
        var unknown = [];
        var total = 0;
        for (var i = 0; i < CHANNELS.length; i++) {
            var ch = CHANNELS[i];
            var raw = cand.scores && typeof cand.scores === 'object' ? cand.scores[ch] : undefined;
            var n = numOrNull(raw);
            if (n === null) {
                parts[ch] = 'unknown';
                unknown.push(ch);
            } else {
                parts[ch] = n;
                total += n * (weights[ch] == null ? 1 : weights[ch]);
            }
        }
        return {
            id: cand.id == null ? null : String(cand.id),
            parts: parts,
            unknown: unknown,
            total: total,
            complete: unknown.length === 0
        };
    }

    function explainRanking(cands, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        var weights = o.weights && typeof o.weights === 'object' ? o.weights : {};
        if (!Array.isArray(cands)) return { face: 'invalid', reason: 'not-array', items: [] };
        var rows = [];
        for (var i = 0; i < cands.length; i++) {
            var row = explainOne(cands[i], weights);
            if (row) rows.push(row);
        }
        if (rows.length === 0) return { face: 'empty', items: [], complete: false };
        rows.sort(function (a, b) {
            if (b.total !== a.total) return b.total - a.total;
            var an = a.id === null ? '' : a.id;
            var bn = b.id === null ? '' : b.id;
            return an < bn ? -1 : an > bn ? 1 : 0;
        });
        for (var k = 0; k < rows.length; k++) rows[k].rank = k + 1;
        var unknownChannels = CHANNELS.filter(function (ch) {
            return rows.some(function (r) { return r.unknown.indexOf(ch) >= 0; });
        });
        return {
            face: 'ranked',
            order: rows.map(function (r) { return r.id; }),
            items: rows,
            unknownChannels: unknownChannels,
            complete: unknownChannels.length === 0
        };
    }

    function explainNote(res) {
        if (!res) return '排序读不出来';
        if (res.face === 'invalid') return '候选面读不出来';
        if (res.face === 'empty') return '这一轮没有候选';
        var head = '按 ' + res.items[0].id + ' 起排，共 ' + res.items.length + ' 条';
        if (!res.complete) head += '；缺分项：' + res.unknownChannels.join('/') + '（缺项不按 0 计）';
        return head;
    }

    function selfCheck() {
        var bad = [];
        var r = explainRanking([
            { id: 'a', scores: { vector: 1, recency: 0, significance: null, graph: 2 } },
            { id: 'b', scores: { vector: 0, recency: 1, significance: 0, graph: 0 } }
        ], {});
        if (r.face !== 'ranked') bad.push('两条候选应 ranked');
        if (r.items[0].parts.significance !== 'unknown') bad.push('缺项应记 unknown');
        if (r.complete !== false) bad.push('有缺项应 complete=false');
        if (r.items[0].unknown.indexOf('significance') < 0) bad.push('unknown 清单漏 significance');
        if (r.items[1].parts.vector !== 0) bad.push('真 0 分不许变 unknown');
        if (explainRanking([], {}).face !== 'empty') bad.push('空候选应 empty');
        if (explainRanking(null, {}).face !== 'invalid') bad.push('非数组应 invalid');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = {
        CHANNELS: CHANNELS,
        explainRanking: explainRanking,
        explainNote: explainNote,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaRecallRankingExplain = api;
})(typeof window !== 'undefined' ? window : globalThis);
