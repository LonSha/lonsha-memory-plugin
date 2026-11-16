/**
 * frozen-freshness.js — 冻读取新鲜度 —— 唯一桥（v3.472.0 · L22-O8）
 *
 * 纪律：纯函数。冻读取会过期。按「冻结时刻 + 允许龄期 + 现在」判三态。
 * fresh / stale / expired 各答各的，不许合成一个布尔。时刻读不出 = unknown。
 * 四态：invalid / fresh / stale / expired。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'fresh', 'stale', 'expired'];
    var DAY = 86400000;

    function judgeFreshness(frozenAt, nowMs, allowanceMs) {
        var f = Number(frozenAt), n = Number(nowMs), a = Number(allowanceMs);
        if (!isFinite(f) || !isFinite(n) || f <= 0 || n <= 0) return { face: 'invalid', reason: 'no-clock' };
        if (!isFinite(a) || a <= 0) a = 7 * DAY;
        var age = n - f;
        if (age < 0) return { face: 'invalid', reason: 'clock-backwards', ageMs: age };
        if (age <= a) return { face: 'fresh', ageMs: age, allowanceMs: a };
        if (age <= 2 * a) return { face: 'stale', ageMs: age, allowanceMs: a };
        return { face: 'expired', ageMs: age, allowanceMs: a };
    }

    function freshnessNote(r) {
        if (!r) return '读不出新鲜度';
        if (r.face === 'invalid') return '冻结时刻读不出来：' + (r.reason || '');
        if (r.face === 'fresh') return '冻结读数仍然是现行事实';
        if (r.face === 'stale') return '冻结读数偏旧，建议重跑';
        return '冻结读数已过期，必须重跑';
    }

    function selfCheck() {
        var bad = [];
        if (judgeFreshness(null, 100).face !== 'invalid') bad.push('空时刻应 invalid');
        if (judgeFreshness(100, 50).face !== 'invalid') bad.push('时钟倒走应 invalid');
        if (judgeFreshness(100, 100 + DAY, 7 * DAY).face !== 'fresh') bad.push('龄期内应 fresh');
        if (judgeFreshness(100, 100 + 10 * DAY, 7 * DAY).face !== 'stale') bad.push('超一两倍应 stale');
        if (judgeFreshness(100, 100 + 30 * DAY, 7 * DAY).face !== 'expired') bad.push('超两倍应 expired');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, judgeFreshness: judgeFreshness, freshnessNote: freshnessNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaFrozenFreshness = api;
})(typeof window !== 'undefined' ? window : globalThis);
