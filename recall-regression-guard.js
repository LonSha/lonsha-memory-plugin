/* ============================================================
 * recall-regression-guard.js — L26-O3 检索质量跨版本回归
 *
 * 【治的欠债】L25-X5 建了基准台，但没人按版本比 —— 「哪一版开始变差」只能靠感觉。
 *   路线图要求：连续版本趋势可看；退步超阈值即拦（作为发布前置）。
 *
 * 【三条硬要求】
 *   1. 趋势按版本升序判，**输入乱序不许当场当趋势**（要么排序要么报错，本档选择排序并留痕）；
 *   2. 退步 = 分数下降；**读数缺失（null/非数字）不许当成 0**，单列 `unknown`，
 *      也不许把 unknown 当进步；
 *   3. 退步超阈值 ⇒ `publishable=false`，并点名「哪一版到哪一版掉了多少」。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRecallRegressionGuard = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DEFAULT_THRESHOLD = -0.03; // 掉 3 个点即拦（相对分数，负数=退步）

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    function versionKey(v) {
        var m = typeof v === 'string' ? v.trim().match(/^(\d+)\.(\d+)\.(\d+)$/) : null;
        if (!m) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    function cmpVersion(a, b) {
        var x = versionKey(a);
        var y = versionKey(b);
        if (!x || !y) return String(a) < String(b) ? -1 : (String(a) > String(b) ? 1 : 0);
        for (var i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
        return 0;
    }

    function normalizeSeries(series) {
        var rows = Array.isArray(series) ? series.slice() : [];
        var unknown = [];
        var valid = [];
        rows.forEach(function (r) {
            var row = r || {};
            if (!isNum(row.score)) {
                unknown.push({ version: row.version, score: row.score, why: '读数缺失或非数字，不能当 0 也不能当进步' });
                return;
            }
            valid.push({ version: row.version, score: row.score });
        });
        valid.sort(function (a, b) { return cmpVersion(a.version, b.version); });
        return { valid: valid, unknown: unknown };
    }

    /**
     * @param {Array<{version:string, score:number}>} series
     * @param {{threshold?:number}} opts threshold 为负数：低于它即拦
     */
    function evaluateTrend(series, opts) {
        var o = opts || {};
        var threshold = isNum(o.threshold) ? o.threshold : DEFAULT_THRESHOLD;
        if (threshold >= 0) {
            throw new TypeError('阈值必须是负数（退步用负分表示），收到 ' + threshold);
        }
        var n = normalizeSeries(series);
        var steps = [];
        var regressions = [];
        for (var i = 1; i < n.valid.length; i++) {
            var prev = n.valid[i - 1];
            var cur = n.valid[i];
            var delta = cur.score - prev.score;
            var step = {
                from: prev.version, to: cur.version,
                fromScore: prev.score, toScore: cur.score,
                delta: Math.round(delta * 1e6) / 1e6,
                blocking: delta < threshold
            };
            steps.push(step);
            if (step.blocking) regressions.push(step);
        }
        var head = n.valid.length ? n.valid[0] : null;
        var tail = n.valid.length ? n.valid[n.valid.length - 1] : null;
        var net = (head && tail) ? Math.round((tail.score - head.score) * 1e6) / 1e6 : null;
        return {
            steps: steps,
            regressions: regressions,
            unknown: n.unknown,
            /** 有效读数个数：gate 用它判「够不够判」，不许用 steps.length 反推（单版本时是 0）。 */
            count: n.valid.length,
            threshold: threshold,
            span: head ? { from: head.version, to: tail.version } : null,
            net: net,
            ok: regressions.length === 0,
            reading: n.valid.length < 2
                ? 'trend-insufficient:' + n.valid.length
                : (regressions.length ? 'trend-regressed:' + regressions.length : 'trend-ok')
        };
    }

    /** 发布前置：不可发布时必须说清「该看哪一段」。 */
    function gate(series, opts) {
        var t = evaluateTrend(series, opts);
        var reasons = t.regressions.map(function (r) {
            return r.from + '→' + r.to + ' 从 ' + r.fromScore + ' 掉到 ' + r.toScore +
                '（' + r.delta + '，阈值 ' + t.threshold + '）';
        });
        if (t.unknown.length) {
            reasons.push('另有 ' + t.unknown.length + ' 个版本没有读数（' + t.unknown.map(function (u) { return u.version; }).join('、') + '），不能算作通过');
        }
        return {
            publishable: t.ok && t.count >= 2,
            reasons: reasons,
            trend: t,
            reading: !t.ok ? 'gate-blocked' : (t.count >= 2 ? 'gate-open' : 'gate-insufficient')
        };
    }

    return {
        DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
        normalizeSeries: normalizeSeries,
        evaluateTrend: evaluateTrend,
        gate: gate
    };
}));
