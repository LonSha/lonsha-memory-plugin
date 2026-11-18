/* ============================================================
 * recall-quality-gate.js — R25-O1 召回质量回归闸
 *
 * 【治的欠债】R24-X2 能跑出 Recall@k / MRR，但它只是一份报告：没有任何东西在
 *   阻止下一次改动把指标拉低。报告绿着的时候没人看，红了也没有人会知道。
 *
 * 【口径】基准是**数据不是代码**（data/golden-recall-baseline.json）：新增金标
 *   只改数据，不改判据；判据只负责「同配置两次必须一样」与「比基准差一条就点名」。
 * 【有牙】人为关掉某一路 ⇒ 必红且逐组点名哪组掉了；指标变好不算红。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRecallQualityGate = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var VERSION = 1;
    var METRIC_KEYS = Object.freeze(["recallAtK", "mrr", "falseRecall"]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
    function ids(v) { return arr(v).map(String).sort(); }

    /** 基快照：只留可复算读数与逐组命中位置（不存 UI 文案）。 */
    function snapshot(result, options) {
        var o = options && typeof options === "object" ? options : {};
        var r = result && typeof result === "object" ? result : {};
        var m = r.metrics && typeof r.metrics === "object" ? r.metrics : {};
        var groups = {};
        arr(r.perItem).forEach(function (it) {
            groups[String(it.id)] = { hit: it.hit === true, rank: it.hit === true ? Number(it.rank) || null : null };
        });
        return {
            version: VERSION,
            k: num(r.k),
            routes: arr(r.routes).map(String).sort(),
            count: num(r.count),
            set: String(o.set || "golden-recall-set.json"),
            metrics: {
                recallAtK: num(m.recallAtK),
                mrr: num(m.mrr),
                falseRecall: num(m.falseRecall)
            },
            groups: groups
        };
    }

    /**
     * 判据主体：同一配置两次必一样；比基准差即红；变好不算红。
     * @returns {{ok:boolean, bad:string[], regressed:Array, improved:Array, delta:Object}}
     */
    function judge(actual, baseline, options) {
        var o = options && typeof options === "object" ? options : {};
        var tol = isFinite(Number(o.epsilon)) ? Math.abs(Number(o.epsilon)) : 0.0001;
        var bad = [], regressed = [], improved = [];
        var a = actual && typeof actual === "object" ? actual : null;
        var b = baseline && typeof baseline === "object" ? baseline : null;
        if (!a) return { ok: false, bad: ["no-actual"], regressed: [], improved: [], delta: {} };
        if (!b) return { ok: false, bad: ["no-baseline"], regressed: [], improved: [], delta: {} };
        if (num(a.k) !== num(b.k)) bad.push("k-changed: " + num(b.k) + " -> " + num(a.k));
        if (num(a.count) !== num(b.count)) bad.push("count-changed: " + num(b.count) + " -> " + num(a.count));
        var ra = ids(a.routes).join("+"), rb = ids(b.routes).join("+");
        if (ra !== rb) bad.push("routes-changed: " + rb + " -> " + ra);

        var gb = b.groups && typeof b.groups === "object" ? b.groups : {};
        var ga = a.groups && typeof a.groups === "object" ? a.groups : {};
        Object.keys(gb).forEach(function (id) {
            var was = gb[id] || {};
            var now = ga[id];
            if (!now) { regressed.push({ id: id, why: "group-missing", wasRank: was.rank || null, nowRank: null }); return; }
            if (was.hit === true && now.hit !== true) {
                regressed.push({ id: id, why: "fell-out-of-topk", wasRank: was.rank || null, nowRank: null });
                return;
            }
            if (was.hit === true && now.hit === true && was.rank && now.rank && Number(now.rank) > Number(was.rank)) {
                regressed.push({ id: id, why: "rank-worse", wasRank: Number(was.rank), nowRank: Number(now.rank) });
                return;
            }
            if (was.hit !== true && now.hit === true) improved.push(id);
            else if (was.hit === true && now.hit === true && Number(now.rank) < Number(was.rank)) improved.push(id);
        });
        Object.keys(ga).forEach(function (id) { if (!gb[id]) improved.push(id); });

        var ma = a.metrics || {}, mb = b.metrics || {};
        var delta = {};
        METRIC_KEYS.forEach(function (k) {
            var d = num(ma[k]) - num(mb[k]);
            delta[k] = Number(d.toFixed(6));
            if (d < -tol) bad.push("metric-down: " + k + " " + num(mb[k]) + " -> " + num(ma[k]));
        });
        if (regressed.length) bad.push("regressed-groups: " + regressed.map(function (r) { return r.id; }).join(","));
        return { ok: bad.length === 0, bad: bad, regressed: regressed, improved: improved, delta: delta };
    }

    /** 确定性：同配置两次跑出来的快照必须逐字段相同（否则闸门自己就不稳）。 */
    function sameSnapshot(x, y) {
        return JSON.stringify(x) === JSON.stringify(y);
    }

    function gateSelfCheck() {
        var bad = [];
        if (METRIC_KEYS.length !== 3) bad.push("metrics");
        var a = { k: 5, routes: ["lex", "ngram"], count: 3, metrics: { recallAtK: 1, mrr: 1, falseRecall: 0 },
            groups: { g1: { hit: true, rank: 1 }, g2: { hit: true, rank: 2 }, g3: { hit: true, rank: 3 } } };
        if (!judge(a, a).ok) bad.push("identical-not-ok");
        var worse = JSON.parse(JSON.stringify(a));
        worse.groups.g2 = { hit: false, rank: null };
        worse.metrics.recallAtK = 0.6667;
        var v = judge(worse, a);
        if (v.ok) bad.push("regression-silent");
        if (v.regressed.length !== 1 || v.regressed[0].id !== "g2") bad.push("not-named");
        var offLex = JSON.parse(JSON.stringify(a));
        offLex.routes = ["ngram"];
        if (judge(offLex, a).ok) bad.push("route-off-silent");
        var better = JSON.parse(JSON.stringify(a));
        better.metrics.mrr = 1;
        better.groups.g1 = { hit: true, rank: 1 };
        var bt = JSON.parse(JSON.stringify(a));
        bt.groups.g3 = { hit: false, rank: null };
        bt.metrics.recallAtK = 0.6667;
        var imp = judge(a, bt);
        if (!imp.ok) bad.push("improvement-judged-red");
        if (!imp.improved.length) bad.push("improvement-not-listed");
        return { ok: bad.length === 0, bad: bad, sample: "metrics=" + METRIC_KEYS.join("|") + " regress=" + v.regressed.length + " improved=" + imp.improved.length };
    }

    return {
        VERSION: VERSION, METRIC_KEYS: METRIC_KEYS,
        snapshot: snapshot, judge: judge, sameSnapshot: sameSnapshot,
        gateSelfCheck: gateSelfCheck
    };
}));
