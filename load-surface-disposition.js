/**
 * load-surface-disposition.js — 装载面模块定性 —— 唯一桥（v3.472.0 · L22-O7）
 *
 * 纪律：纯函数。「被 loadAll 取到」不等于「被业务用」。对每个模块按读数二分：
 * wired（有业务调用点）或 dormant（只在装载面，明确降级）。三态由 business_call_sites 唯一决定，
 * 不许模糊挂账。四态：invalid / empty / all_wired / mixed。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'empty', 'all_wired', 'mixed'];

    function dispose(modules) {
        if (!Array.isArray(modules)) return { face: 'invalid', wired: [], dormant: [] };
        var wired = [];
        var dormant = [];
        for (var i = 0; i < modules.length; i++) {
            var m = modules[i];
            if (!m || typeof m !== 'object') continue;
            var name = String(m.module == null ? '' : m.module);
            var biz = Number(m.business_call_sites);
            var loadOnly = m.load_surface_only === true;
            if (isFinite(biz) && biz > 0) wired.push({ module: name, sites: biz });
            else if (loadOnly || !isFinite(biz)) dormant.push({ module: name, why: String(m.why == null ? 'load-surface-only' : m.why) });
            else dormant.push({ module: name, why: 'zero-business' });
        }
        var face;
        if (wired.length === 0 && dormant.length === 0) face = 'empty';
        else if (dormant.length === 0) face = 'all_wired';
        else face = 'mixed';
        return { face: face, wired: wired, dormant: dormant };
    }

    function dispositionNote(r) {
        if (!r) return '读不出模块定性';
        if (r.face === 'invalid') return '模块读数读不出来';
        if (r.face === 'empty') return '没有模块';
        if (r.face === 'all_wired') return r.wired.length + ' 个模块都已接线';
        return r.wired.length + ' 个已接线，' + r.dormant.length + ' 个只在装载面（需降级或接线）';
    }

    function selfCheck() {
        var bad = [];
        if (dispose(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (dispose([]).face !== 'empty') bad.push('空应 empty');
        if (dispose([{ module: 'a', business_call_sites: 3 }]).face !== 'all_wired') bad.push('全接应 all_wired');
        var mix = dispose([
            { module: 'a', business_call_sites: 2 },
            { module: 'b', business_call_sites: 0, load_surface_only: true },
            { module: 'c', load_surface_only: true }
        ]);
        if (mix.face !== 'mixed') bad.push('混合应 mixed');
        if (mix.wired.length !== 1) bad.push('接线数错');
        if (mix.dormant.length !== 2) bad.push('降级数错，得 ' + mix.dormant.length);
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, dispose: dispose, dispositionNote: dispositionNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaLoadSurfaceDisposition = api;
})(typeof window !== 'undefined' ? window : globalThis);
