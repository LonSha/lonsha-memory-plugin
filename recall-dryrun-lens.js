/* ========================================================
 * recall-dryrun-lens.js — [v3.484.0] 召回干跑透镜
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   `engine-recall.js` / `unified-recall.js` 里 `dryRun` / `dryrun` / `透视` /
 *   `预演` / `不发请求` 的出现次数为 **0**（两文件实测）。本仓能预演**世界书**
 *   的挤占（projection-pipeline.js::predictInjection），却答不了最常被问的
 *   那一句：「我这句问下去，会捞回哪几条、每条各得多少分、预算涨到哪里被谁挤掉」。
 *   于是一旦召回结果不对味，只能改配置、真发请求、看注入串 —— 一轮一轮试。
 *
 * 【缝合来源 / 只搬纪律不搬实现】
 *   源：光域·镜忆 V0.1 的「同源召回透视镜（Dry-Run）」：不发请求、不计费、
 *   100% 复现发包前的真实召回，逐条给出 denseScore / bm25Score / rrfScore /
 *   预算占用 / 被谁挤掉，外加红线绿灯网格。
 *   本模块只搬「同一批判据复算 + 逐条列 + 三态可辨」这条纪律：
 *   **不重算分数**（分数的真源是 recall-kernel-v3 / unified-recall，
 *   这里只吃它们已经算出来的数），只做排名、预算、拦截归因与红线判定。
 *
 * 【为什么必须「吃已有分数」而不是自己再算一遍】
 *   再算一遍就是第二个真源：干跑说 0.42、真路径说 0.39，用户无从判断信谁。
 *   本模块的承重承诺是「干跑与真路径同源」—— 分数进来什么样，出去什么样。
 *
 * 【三档不可混同】
 *   'inspected'  —— 有候选，已排名与分预算
 *   'empty'      —— 候选为空（本轮没捞到东西）⇒ 与「没跑」不同形
 *   'malformed'  —— 入参不合法 ⇒ 三面全空且标明原因，不抛
 *
 * 【不做什么（边界）】
 *   · 不发请求、不读 storage、不读 window：纯函数；
 *   · 不裁候选、不改分数、不排序入参（返回新数组）；
 *   · 不判「这条记忆好不好」：只报「进没进预算、被谁挤掉」，价值判断在别处。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRecallDryRunLens = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATES = { INSPECTED: 'inspected', EMPTY: 'empty', MALFORMED: 'malformed' };

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    /** 估算字符→token：不引入分词器（宿主没有），CJK 按 1.5 字/token、其余 3.5。 */
    function estimateTokens(text) {
        var s = String(text == null ? '' : text);
        if (!s) return 0;
        var cjk = 0;
        for (var i = 0; i < s.length; i += 1) {
            var c = s.charCodeAt(i);
            if (c >= 0x2e80) cjk += 1;
        }
        var rest = s.length - cjk;
        return Math.ceil(cjk / 1.5 + rest / 3.5);
    }

    function scoreOf(c) {
        var r = num(c && c.rrfScore);
        if (r !== null) return r;
        var s = c && c.sources && typeof c.sources === 'object' ? c.sources : null;
        if (s) {
            var d = num(s.dense) || 0;
            var b = num(s.bm25) || 0;
            if (d || b) return d + b;
        }
        return null;
    }

    /**
     * inspect({ candidates, budgetTokens, tokenOf }) -> { state, rows, readings, redLines }
     *   rows 只增不改：每条候选一行，含 rank / tokens / cumTokens / admitted / cutBy。
     */
    function inspect(input) {
        var ipt = input && typeof input === 'object' ? input : {};
        var cands = ipt.candidates;
        var readings = {
            state: STATES.MALFORMED,
            candidateCount: 0,
            admitted: 0,
            cut: 0,
            tokensUsed: 0,
            tokensLeft: null,
            budgetTokens: null,
            scored: 0,
            unscored: 0,
            reason: ''
        };
        if (!Array.isArray(cands)) {
            readings.reason = 'candidates-not-array';
            return { state: STATES.MALFORMED, rows: [], readings: readings, redLines: [] };
        }
        var budget = num(ipt.budgetTokens);
        readings.budgetTokens = budget;
        var tokenOf = typeof ipt.tokenOf === 'function' ? ipt.tokenOf : null;
        var rows = [];
        for (var i = 0; i < cands.length; i += 1) {
            var c = cands[i];
            if (!c || typeof c !== 'object') continue;
            var sc = scoreOf(c);
            var text = String(c.text == null ? '' : c.text);
            var toks = tokenOf ? num(tokenOf(c)) : null;
            if (toks === null) toks = isFinite(Number(c.tokens)) ? Number(c.tokens) : estimateTokens(text);
            rows.push({
                id: String(c.id == null ? c.turnUid == null ? '#' + i : c.turnUid : c.id),
                floor: num(c.floor),
                rrfScore: sc,
                dense: num(c.sources && c.sources.dense),
                bm25: num(c.sources && c.sources.bm25),
                grain: c.matchedGrain || c.grain || '',
                tokens: toks,
                rank: 0,
                cumTokens: 0,
                admitted: false,
                cutBy: ''
            });
            if (sc === null) readings.unscored += 1; else readings.scored += 1;
        }
        readings.candidateCount = rows.length;
        if (rows.length === 0) {
            readings.state = STATES.EMPTY;
            return { state: STATES.EMPTY, rows: [], readings: readings, redLines: redLinesOf(rows, readings) };
        }
        /* 排名：分数降序、同分按 id 字典序（确定性；真路径同 uid 已先去重）。 */
        rows.sort(function (a, b) {
            var sa = a.rrfScore === null ? -Infinity : a.rrfScore;
            var sb = b.rrfScore === null ? -Infinity : b.rrfScore;
            if (sb !== sa) return sb - sa;
            return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
        });
        var cum = 0;
        var cutAt = -1;
        for (var k = 0; k < rows.length; k += 1) {
            var r = rows[k];
            r.rank = k + 1;
            if (budget === null) {
                r.admitted = true;
                r.cutBy = 'no-budget';
                cum += r.tokens;
                r.cumTokens = cum;
                readings.admitted += 1;
                continue;
            }
            if (cutAt === -1 && cum + r.tokens <= budget) {
                cum += r.tokens;
                r.cumTokens = cum;
                r.admitted = true;
                readings.admitted += 1;
            } else {
                if (cutAt === -1) cutAt = r.rank;
                r.admitted = false;
                r.cutBy = 'budget';
                r.cumTokens = cum;
                readings.cut += 1;
            }
        }
        readings.tokensUsed = cum;
        readings.tokensLeft = budget === null ? null : Math.max(0, budget - cum);
        readings.state = STATES.INSPECTED;
        return { state: STATES.INSPECTED, rows: rows, readings: readings, redLines: redLinesOf(rows, readings) };
    }

    /**
     * 红线网格：每格只有 green / red / na 三态。
     *   na 与 green 必须分开 —— 「这条检查没适用条件」不等于「检查通过」。
     */
    function redLinesOf(rows, readings) {
        var ids = {};
        var dup = 0;
        var noFloor = 0;
        for (var i = 0; i < rows.length; i += 1) {
            var id = rows[i].id;
            if (ids[id]) dup += 1; else ids[id] = 1;
            if (rows[i].floor === null) noFloor += 1;
        }
        var out = [];
        out.push({
            key: 'budget',
            state: readings.budgetTokens === null ? 'na' : (readings.tokensUsed <= readings.budgetTokens ? 'green' : 'red'),
            detail: readings.budgetTokens === null
                ? '未给预算，只排名不裁'
                : ('用 ' + readings.tokensUsed + ' / ' + readings.budgetTokens + ' token')
        });
        out.push({
            key: 'score_present',
            state: readings.candidateCount === 0 ? 'na' : (readings.unscored === 0 ? 'green' : 'red'),
            detail: readings.unscored ? (readings.unscored + ' 条没有分数（干跑与真路径可能不同源）') : '每条都有分数'
        });
        out.push({
            key: 'unique_ids',
            state: readings.candidateCount === 0 ? 'na' : (dup === 0 ? 'green' : 'red'),
            detail: dup ? (dup + ' 条重复 id（去重没生效）') : '无重复'
        });
        out.push({
            key: 'floor_seated',
            state: readings.candidateCount === 0 ? 'na' : (noFloor === 0 ? 'green' : 'red'),
            detail: noFloor ? (noFloor + ' 条没有楼层归属') : '全部可定位'
        });
        out.push({
            key: 'ranked',
            state: rows.length === 0 ? 'na' : 'green',
            detail: rows.length ? ('按分数降序 ' + rows.length + ' 条') : '无候选'
        });
        return out;
    }

    /** 一行摘要（诊断行直接用，避免措辞各处漂移）。 */
    function summary(res) {
        var r = (res && res.readings) || {};
        if (!res || res.state === STATES.MALFORMED) return '入参不合法（' + (r.reason || 'unknown') + '）';
        if (res.state === STATES.EMPTY) return '本轮候选 0 条';
        var s = '候选 ' + r.candidateCount + ' 条 · 进预算 ' + r.admitted + ' 条';
        if (r.cut) s += ' · **被预算挡下 ' + r.cut + ' 条**';
        if (r.budgetTokens !== null) s += ' · ' + r.tokensUsed + '/' + r.budgetTokens + ' token';
        if (r.unscored) s += ' · **' + r.unscored + ' 条无分数**';
        return s;
    }

    return {
        STATES: STATES,
        inspect: inspect,
        redLinesOf: redLinesOf,
        summary: summary,
        estimateTokens: estimateTokens
    };
}));
