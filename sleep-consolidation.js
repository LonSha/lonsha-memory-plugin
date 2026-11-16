/**
 * sleep-consolidation.js — 剧情夜间记忆整理 —— 唯一桥（v3.472.0 · L22-X7）
 *
 * 纪律：纯函数。判「夜里该把哪些记忆压缩、哪些固化」，只产候选与计数，不写盘、不真的压缩。
 * 压缩阈值走显著度；固化走重要性。既低又不重要的才压；高重要的固化。
 * 四态：invalid / quiet（无可整理）/ consolidated。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'quiet', 'consolidated'];
    var LIMITS = { compressBelow: 0.2, keepAbove: 0.75 };
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function planConsolidation(items) {
        var arr = Array.isArray(items) ? items : null;
        if (!arr) return { face: 'invalid', compress: [], keep: [], untouched: 0 };
        var compress = [];
        var keep = [];
        var untouched = 0;
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!it || typeof it !== 'object') continue;
            var salience = numOrNull(it.salience);
            var importance = numOrNull(it.importance);
            if (salience === null || importance === null) { untouched++; continue; }
            var key = String(it.key == null ? '' : it.key);
            if (importance >= LIMITS.keepAbove) keep.push({ key: key, importance: importance });
            else if (salience < LIMITS.compressBelow) compress.push({ key: key, salience: salience });
            else untouched++;
        }
        var face = (compress.length || keep.length) ? 'consolidated' : 'quiet';
        return { face: face, compress: compress, keep: keep, untouched: untouched };
    }

    function consolidationNote(r) {
        if (!r) return '读不出昨夜整理';
        if (r.face === 'invalid') return '记忆读数读不出来';
        if (r.face === 'quiet') return '昨夜没有需要整理的记忆';
        return '昨夜整理了 ' + r.compress.length + ' 条、固化 ' + r.keep.length + ' 条';
    }

    function selfCheck() {
        var bad = [];
        if (planConsolidation(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (planConsolidation([]).face !== 'quiet') bad.push('空应 quiet');
        var r = planConsolidation([
            { key: 'a', salience: 0.1, importance: 0.1 },
            { key: 'b', salience: 0.9, importance: 0.9 },
            { key: 'c', salience: 0.5, importance: 0.5 },
            { key: 'd' }
        ]);
        if (r.compress.length !== 1 || r.compress[0].key !== 'a') bad.push('应压缩低显著低重要');
        if (r.keep.length !== 1 || r.keep[0].key !== 'b') bad.push('应固化高重要');
        if (r.untouched !== 2) bad.push('未处理计数错，得 ' + r.untouched);
        if (r.face !== 'consolidated') bad.push('有动作应 consolidated');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, LIMITS: LIMITS, planConsolidation: planConsolidation, consolidationNote: consolidationNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaSleepConsolidation = api;
})(typeof window !== 'undefined' ? window : globalThis);
