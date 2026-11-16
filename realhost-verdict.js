/**
 * realhost-verdict.js — 真机读数裁决 —— 唯一桥（v3.472.0 · L22-O5）
 *
 * 纪律：纯函数。两态不同形：available 时必须有读数且过阈值；unavailable 时必须带 cause。
 * 不许把「没环境」压成一句「没问题」。四态：invalid / available / unavailable / failed。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'available', 'unavailable', 'failed'];

    function judgeRealhost(reading) {
        if (!reading || typeof reading !== 'object') return { face: 'invalid', reason: 'no-reading' };
        var verdict = String(reading.verdict == null ? '' : reading.verdict);
        if (verdict === 'environment-unavailable' || verdict === 'unavailable') {
            var cause = String(reading.cause == null ? '' : reading.cause).trim();
            if (!cause) return { face: 'invalid', reason: 'unavailable-without-cause' };
            return { face: 'unavailable', cause: cause, causeGroup: String(reading.causeGroup == null ? '' : reading.causeGroup) };
        }
        if (verdict === 'available') {
            var samples = Number(reading.samples);
            var threshold = Number(reading.threshold);
            if (!isFinite(samples) || samples <= 0) return { face: 'failed', reason: 'no-samples' };
            if (isFinite(threshold) && samples < threshold) return { face: 'failed', reason: 'below-threshold', samples: samples, threshold: threshold };
            return { face: 'available', samples: samples };
        }
        return { face: 'invalid', reason: 'unknown-verdict' };
    }

    function realhostNote(r) {
        if (!r) return '读不出真机读数';
        if (r.face === 'invalid') return '真机读数形状不对：' + (r.reason || '');
        if (r.face === 'unavailable') return '没有真机环境：' + r.cause;
        if (r.face === 'failed') return '真机读数不合格：' + r.reason;
        return '真机读数正常（' + r.samples + ' 个样本）';
    }

    function selfCheck() {
        var bad = [];
        if (judgeRealhost(null).face !== 'invalid') bad.push('空应 invalid');
        if (judgeRealhost({ verdict: 'environment-unavailable' }).face !== 'invalid') bad.push('不可用却无 cause 应 invalid');
        if (judgeRealhost({ verdict: 'environment-unavailable', cause: 'no-st-endpoint' }).face !== 'unavailable') bad.push('带 cause 应 unavailable');
        if (judgeRealhost({ verdict: 'available', samples: 10, threshold: 5 }).face !== 'available') bad.push('过阈应 available');
        if (judgeRealhost({ verdict: 'available', samples: 2, threshold: 5 }).face !== 'failed') bad.push('未过阈应 failed');
        if (judgeRealhost({ verdict: 'available', samples: 0 }).face !== 'failed') bad.push('零样本应 failed');
        if (judgeRealhost({ verdict: 'weird' }).face !== 'invalid') bad.push('未知裁决应 invalid');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, judgeRealhost: judgeRealhost, realhostNote: realhostNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaRealhostVerdict = api;
})(typeof window !== 'undefined' ? window : globalThis);
