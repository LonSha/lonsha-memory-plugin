/**
 * view-openability.js — 视图真开判定 —— 唯一桥（v3.472.0 · L22-O3）
 *
 * 纪律：纯函数。「静态可达」不等于「能真打开」。吃一组视图打开探测结果，
 * 分四态：none / opened / threw / missing。抛异常与不存在不同形，不许压平。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'none', 'opened', 'threw', 'missing'];

    function judgeOpen(probes) {
        if (!Array.isArray(probes)) return { face: 'invalid', results: [] };
        var results = [];
        var opened = 0;
        var threw = 0;
        var missing = 0;
        for (var i = 0; i < probes.length; i++) {
            var p = probes[i];
            if (!p || typeof p !== 'object') continue;
            var id = String(p.id == null ? '' : p.id);
            var state;
            if (p.missing === true) { state = 'missing'; missing++; }
            else if (p.threw === true) { state = 'threw'; threw++; }
            else if (p.opened === true) { state = 'opened'; opened++; }
            else { state = 'missing'; missing++; }
            results.push({ id: id, state: state });
        }
        var face;
        if (results.length === 0) face = 'none';
        else if (threw > 0) face = 'threw';
        else if (missing > 0) face = 'missing';
        else face = 'opened';
        return { face: face, results: results, opened: opened, threw: threw, missing: missing };
    }

    function openabilityNote(r) {
        if (!r) return '读不出打开结果';
        if (r.face === 'invalid') return '打开探测读不出来';
        if (r.face === 'none') return '没有可打开的视图';
        if (r.face === 'threw') return r.threw + ' 个视图打开时抛异常';
        if (r.face === 'missing') return r.missing + ' 个视图不存在';
        return r.opened + ' 个视图都能打开';
    }

    function selfCheck() {
        var bad = [];
        if (judgeOpen(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (judgeOpen([]).face !== 'none') bad.push('空应 none');
        if (judgeOpen([{ id: 'a', opened: true }, { id: 'b', opened: true }]).face !== 'opened') bad.push('全开应 opened');
        var t = judgeOpen([{ id: 'a', opened: true }, { id: 'b', threw: true }]);
        if (t.face !== 'threw') bad.push('有抛应 threw');
        var m = judgeOpen([{ id: 'a', opened: true }, { id: 'b', missing: true }]);
        if (m.face !== 'missing') bad.push('有缺应 missing');
        if (t.threw !== 1 || m.missing !== 1) bad.push('计数错');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, judgeOpen: judgeOpen, openabilityNote: openabilityNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaViewOpenability = api;
})(typeof window !== 'undefined' ? window : globalThis);
