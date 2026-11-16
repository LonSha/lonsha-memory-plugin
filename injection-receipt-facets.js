/**
 * injection-receipt-facets.js — 注入回执全分面汇总 —— 唯一桥（v3.472.0 · L22-O2）
 *
 * 纪律：纯函数。把「多路注入路径各自的回执」汇总成全分面视图：每路一态，
 * 六类路径（candidate/trim/drop/resident/unknown/capacity），缺一面不同形（absent ≠ zero）。
 * 不重算字符账（那归 injection-receipt.js），只做分面覆盖与缺面归因。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'complete', 'partial'];
    var PATHS = ['candidate', 'trim', 'drop', 'resident', 'unknown', 'capacity'];

    function aggregate(receipts) {
        if (!receipts || typeof receipts !== 'object') return { face: 'invalid', facets: [], missing: PATHS.slice() };
        var facets = [];
        var missing = [];
        for (var i = 0; i < PATHS.length; i++) {
            var p = PATHS[i];
            if (Object.prototype.hasOwnProperty.call(receipts, p) && receipts[p] != null) {
                facets.push({ path: p, present: true, value: receipts[p] });
            } else {
                facets.push({ path: p, present: false });
                missing.push(p);
            }
        }
        return { face: missing.length ? 'partial' : 'complete', facets: facets, missing: missing };
    }

    function facetsNote(r) {
        if (!r) return '读不出回执分面';
        if (r.face === 'invalid') return '回执读不出来';
        if (r.face === 'complete') return PATHS.length + ' 面回执齐备';
        return '缺 ' + r.missing.length + ' 面回执：' + r.missing.join('、');
    }

    function selfCheck() {
        var bad = [];
        if (aggregate(null).face !== 'invalid') bad.push('空应 invalid');
        var full = {};
        for (var i = 0; i < PATHS.length; i++) full[PATHS[i]] = 1;
        if (aggregate(full).face !== 'complete') bad.push('全给应 complete');
        var part = aggregate({ candidate: 1, trim: 0 });
        if (part.face !== 'partial') bad.push('缺面应 partial');
        if (part.missing.length !== 4) bad.push('缺面数错，得 ' + part.missing.length);
        if (part.facets[2].present !== false) bad.push('缺面 present 应为 false');
        var zero = aggregate({ candidate: 0, trim: 0, drop: 0, resident: 0, unknown: 0, capacity: 0 });
        if (zero.face !== 'complete') bad.push('零值也是在场应 complete');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, PATHS: PATHS, aggregate: aggregate, facetsNote: facetsNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaInjectionReceiptFacets = api;
})(typeof window !== 'undefined' ? window : globalThis);
