/* ========================================================
 * recall-grain-merge.js — [v3.484.0] 双粒度同源择优
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓召回是**单粒度**的：一个 turn 只带一种表示（摘要卡或原文块），
 *   `grain` / `matchedGrain` / `rawChunk` 在 467 个运行时模块里只有
 *   `commitment-instance-lifecycle.js` 命中、且是另一个语义。
 *   后果是两类错：① 摘要卡把细节压掉了 → 问「他原话怎么说的」捞不回来；
 *   ② 同一个 turn 的两种表示同时进候选 → 同一条记忆占两个预算位。
 *
 * 【缝合来源 / 只搬纪律不搬实现】
 *   源：光域·镜忆 V0.1 的 grain 合并：同一 turnUid 的 raw / card 两种表示
 *   按 uid 归并、取高分那一种并标 `matchedGrain`，命中原句时把
 *   `bestRawChunkText` 一起带上（让「原话」可被引用，而不必再查一次）。
 *
 * 【为什么同分时优先 card 而不是 raw】
 *   card 更短、更像记忆（而非日志），同分时选它省预算；但**原话仍然带出去**
 *   （bestRawChunkText），所以「省」不会变成「丢」。两者都留：分数选边、文本不丢。
 *
 * 【三档不可混同】
 *   'merged'    —— 至少一个 uid 有两条以上表示（真发生了合并）
 *   'single'    —— 每条都只有一种表示（没东西可合）
 *   'malformed' —— 入参不合法，空面 + 原因
 *
 * 【不做什么（边界）】
 *   · 不算分：分数由召回内核给，这里只比较；
 *   · 不删条目：落选者进 dropped（带 reason），由调用方决定记不记；
 *   · 不跨 uid 合并：不同楼层的「相似内容」不是同一条记忆，不许合。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRecallGrainMerge = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATES = { MERGED: 'merged', SINGLE: 'single', MALFORMED: 'malformed' };
    var GRAINS = { RAW: 'raw', CARD: 'card' };

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function grainOf(item) {
        var g = String((item && (item.grain || item.matchedGrain)) || '').toLowerCase();
        if (g === 'raw' || g === 'rawchunk' || g === '原文' || g === '原文块') return GRAINS.RAW;
        if (g === 'card' || g === 'summary' || g === '摘要' || g === '摘要卡') return GRAINS.CARD;
        return GRAINS.CARD; /* 缺省按 card：本仓既有条目绝大多数是摘要卡 */
    }

    function uidOf(item, idx) {
        if (!item || typeof item !== 'object') return '';
        var u = item.turnUid || item.turnId || item.turn || '';
        if (u) return String(u);
        var f = num(item.floor);
        return f === null ? '#anon' + idx : 'floor:' + f;
    }

    /**
     * merge(items, opts) -> { state, items, dropped, counts }
     *   opts.tiePrefer: 'card'（默认） | 'raw'
     */
    function merge(items, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        var tiePrefer = String(o.tiePrefer || GRAINS.CARD).toLowerCase() === 'raw' ? GRAINS.RAW : GRAINS.CARD;
        var counts = {
            state: STATES.MALFORMED,
            input: 0,
            merged: 0,
            raw: 0,
            card: 0,
            both: 0,
            rawOnly: 0,
            cardOnly: 0,
            ties: 0,
            dropped: 0,
            reason: ''
        };
        if (!Array.isArray(items)) {
            counts.reason = 'items-not-array';
            return { state: STATES.MALFORMED, items: [], dropped: [], counts: counts };
        }
        var groups = {};
        var orderIdx = [];
        for (var i = 0; i < items.length; i += 1) {
            var it = items[i];
            if (!it || typeof it !== 'object') continue;
            var uid = uidOf(it, i);
            if (!groups[uid]) { groups[uid] = []; orderIdx.push(uid); }
            groups[uid].push({ item: it, grain: grainOf(it), score: num(it.score != null ? it.score : it.rrfScore) });
            counts.input += 1;
            if (grainOf(it) === GRAINS.RAW) counts.raw += 1; else counts.card += 1;
        }
        var out = [];
        var dropped = [];
        for (var g = 0; g < orderIdx.length; g += 1) {
            var uid2 = orderIdx[g];
            var bucket = groups[uid2];
            var best = null;
            var bestRaw = null;
            var tie = false;
            for (var k = 0; k < bucket.length; k += 1) {
                var e = bucket[k];
                if (e.grain === GRAINS.RAW && (bestRaw === null || (e.score || 0) > (bestRaw.score || 0))) bestRaw = e;
                if (best === null) { best = e; continue; }
                var bs = best.score === null ? -Infinity : best.score;
                var es = e.score === null ? -Infinity : e.score;
                if (es > bs) { best = e; tie = false; continue; }
                if (es === bs) {
                    tie = true;
                    if (e.grain === tiePrefer) best = e;
                }
            }
            if (tie) counts.ties += 1;
            var base = best.item;
            var mergedItem = {};
            for (var key in base) { if (Object.prototype.hasOwnProperty.call(base, key)) mergedItem[key] = base[key]; }
            mergedItem.turnUid = base.turnUid || uid2;
            mergedItem.matchedGrain = best.grain;
            mergedItem.score = best.score === null ? base.score : best.score;
            mergedItem.grains = bucket.map(function (x) { return x.grain; }).filter(function (v, i2, a) { return a.indexOf(v) === i2; });
            mergedItem.bestRawChunkText = bestRaw && typeof bestRaw.item.text === 'string' ? bestRaw.item.text : (base.bestRawChunkText || '');
            out.push(mergedItem);
            for (var d = 0; d < bucket.length; d += 1) {
                if (bucket[d] !== best) {
                    dropped.push({ turnUid: uid2, grain: bucket[d].grain, score: bucket[d].score, reason: 'lower-grain-same-turn' });
                }
            }
            if (bucket.length > 1) counts.both += 1;
            else if (best.grain === GRAINS.RAW) counts.rawOnly += 1;
            else counts.cardOnly += 1;
        }
        counts.merged = out.length;
        counts.dropped = dropped.length;
        counts.state = counts.both > 0 ? STATES.MERGED : STATES.SINGLE;
        return { state: counts.state, items: out, dropped: dropped, counts: counts };
    }

    function summary(res) {
        var c = (res && res.counts) || {};
        if (!res || res.state === STATES.MALFORMED) return '入参不合法（' + (c.reason || 'unknown') + '）';
        var s = '同源 ' + c.input + ' 条 → ' + c.merged + ' 条';
        if (c.both) s += ' · 合并 ' + c.both + ' 组（落选 ' + c.dropped + ' 条）';
        if (c.rawOnly) s += ' · 仅原话 ' + c.rawOnly + ' 条';
        if (c.cardOnly) s += ' · 仅摘要 ' + c.cardOnly + ' 条';
        if (c.ties) s += ' · 同分 ' + c.ties + ' 组';
        return s;
    }

    return {
        STATES: STATES,
        GRAINS: GRAINS,
        merge: merge,
        grainOf: grainOf,
        summary: summary
    };
}));
