/* ============================================================
 * recall-quality-bench.js — R24-X2 记忆质量基准台
 *
 * 【治的欠债】551 套判据全是**结构判据**（有没有这个字段、三态是否不同形）。
 *   没有一套回答「该被召回的那条，到底召回了没有」。于是所有调参都是凭手感。
 *
 * 【数据不是代码】金标集在 data/golden-recall-set.json，增删条目不需要改本文件。
 * 【同一份召回结果】指标计算直接吃 bench 自己的排序结果，不另写一套判定。
 * 【有牙】关掉 ngram 路，同义改述类指标必须掉——掉不动就说明基准是摆设。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRecallQualityBench = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var RRF_K = 60;

    function bigrams(text) {
        var s = String(text || "").replace(/\s+/g, "");
        var out = [];
        for (var i = 0; i + 1 < s.length; i++) out.push(s.substr(i, 2));
        return out;
    }

    function cosine(a, b) {
        var A = bigrams(a), B = bigrams(b);
        if (!A.length || !B.length) return 0;
        var m = {};
        A.forEach(function (t) { m[t] = (m[t] || 0) + 1; });
        var dot = 0;
        B.forEach(function (t) { if (m[t]) dot += 1; });
        return dot / Math.sqrt(A.length * B.length);
    }

    /** lex 路：查询串在原文里出现（精确子串）。 */
    function lexScore(q, text) {
        var s = String(text || "").replace(/\s+/g, "");
        var t = String(q || "").replace(/\s+/g, "");
        if (!t) return 0;
        return s.indexOf(t) !== -1 ? 1 : 0;
    }

    function rankBy(item, routeName) {
        var rows = item.memories.map(function (m) {
            var sc = routeName === "lex" ? lexScore(item.query, m.text) : cosine(item.query, m.text);
            return { id: m.id, score: sc };
        });
        rows.sort(function (x, y) { if (y.score !== x.score) return y.score - x.score; return x.id < y.id ? -1 : 1; });
        return rows.filter(function (r) { return r.score > 0; });
    }

    /** 单组：RRF 融合启用中的路（与 O1 同口径）。 */
    function rankItem(item, routes) {
        var use = Array.isArray(routes) && routes.length ? routes : ["lex", "ngram"];
        var acc = {};
        use.forEach(function (r) {
            rankBy(item, r).forEach(function (row, i) {
                acc[row.id] = acc[row.id] || { id: row.id, score: 0, routes: [] };
                acc[row.id].score += 1 / (RRF_K + i + 1);
                acc[row.id].routes.push(r);
            });
        });
        var rows = Object.keys(acc).map(function (k) { return acc[k]; });
        rows.sort(function (x, y) { if (y.score !== x.score) return y.score - x.score; return x.id < y.id ? -1 : 1; });
        return rows;
    }

    function runSet(set, options) {
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) || Number(set && set.k) || 5;
        var routes = Array.isArray(o.routes) ? o.routes : ["lex", "ngram"];
        var items = Array.isArray(set && set.items) ? set.items : [];
        var perItem = [];
        var sRecall = 0, sMrr = 0, sFalse = 0;
        items.forEach(function (it) {
            var ranked = rankItem(it, routes);
            var top = ranked.slice(0, k).map(function (r) { return r.id; });
            var expected = Array.isArray(it.expectedIds) ? it.expectedIds.map(String) : [];
            var hitIdx = top.indexOf(expected[0]);
            var hit = hitIdx !== -1;
            var mrr = hit ? 1 / (hitIdx + 1) : 0;
            var falseCount = top.filter(function (id) { return expected.indexOf(id) === -1; }).length;
            var falseRate = top.length ? falseCount / top.length : 0;
            sRecall += hit ? 1 : 0;
            sMrr += mrr;
            sFalse += falseRate;
            perItem.push({
                id: it.id, category: it.category || "",
                hit: hit, rank: hit ? hitIdx + 1 : null,
                recall: hit ? 1 : 0, mrr: Number(mrr.toFixed(6)),
                falseRate: Number(falseRate.toFixed(4)),
                top: top, expected: expected,
                why: it.why || ""
            });
        });
        var n = items.length || 1;
        return {
            ok: true,
            k: k, routes: routes, count: items.length,
            metrics: {
                recallAtK: Number((sRecall / n).toFixed(4)),
                mrr: Number((sMrr / n).toFixed(4)),
                falseRecall: Number((sFalse / n).toFixed(4))
            },
            perItem: perItem
        };
    }

    function compare(baseline, current) {
        var a = {}, b = {};
        (baseline.perItem || []).forEach(function (r) { a[r.id] = r; });
        (current.perItem || []).forEach(function (r) { b[r.id] = r; });
        var better = [], worse = [], same = 0;
        Object.keys(b).forEach(function (id) {
            if (!a[id]) return;
            if (b[id].recall > a[id].recall) better.push(id);
            else if (b[id].recall < a[id].recall) worse.push(id);
            else same += 1;
        });
        return { ok: true, better: better, worse: worse, same: same };
    }

    return {
        RRF_K: RRF_K,
        bigrams: bigrams, cosine: cosine, lexScore: lexScore,
        rankItem: rankItem, runSet: runSet, compare: compare
    };
}));
