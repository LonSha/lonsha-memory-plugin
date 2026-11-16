/**
 * catalog-registration.js — 台账登记双向核对 —— 唯一桥（v3.472.0 · L22-O6）
 *
 * 纪律：纯函数。「未登记」与「登记过」是两种事实，绝不用一个补登抹平。
 * 吃「盘上测试文件清单」与「台账已登记清单」，吐三桶：registered / unregistered / orphan。
 * 四态：invalid / clean / gaps。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'clean', 'gaps'];

    function reconcile(onDisk, inLedger) {
        if (!Array.isArray(onDisk) || !Array.isArray(inLedger)) return { face: 'invalid', registered: [], unregistered: [], orphan: [] };
        var disk = {};
        var i;
        for (i = 0; i < onDisk.length; i++) { var d = String(onDisk[i] == null ? '' : onDisk[i]).trim(); if (d) disk[d] = true; }
        var ledger = {};
        for (i = 0; i < inLedger.length; i++) { var l = String(inLedger[i] == null ? '' : inLedger[i]).trim(); if (l) ledger[l] = true; }
        var registered = [];
        var unregistered = [];
        var orphan = [];
        for (var k in disk) { if (!Object.prototype.hasOwnProperty.call(disk, k)) continue; if (ledger[k]) registered.push(k); else unregistered.push(k); }
        for (var j in ledger) { if (!Object.prototype.hasOwnProperty.call(ledger, j)) continue; if (!disk[j]) orphan.push(j); }
        registered.sort(); unregistered.sort(); orphan.sort();
        var face = (unregistered.length || orphan.length) ? 'gaps' : 'clean';
        return { face: face, registered: registered, unregistered: unregistered, orphan: orphan };
    }

    function registrationNote(r) {
        if (!r) return '读不出登记对照';
        if (r.face === 'invalid') return '清单读不出来';
        if (r.face === 'clean') return r.registered.length + ' 个测试文件都已登记';
        var bits = [];
        if (r.unregistered.length) bits.push(r.unregistered.length + ' 个未登记');
        if (r.orphan.length) bits.push(r.orphan.length + ' 个登记了但盘上没有');
        return bits.join('，');
    }

    function selfCheck() {
        var bad = [];
        if (reconcile(null, []).face !== 'invalid') bad.push('非数组应 invalid');
        if (reconcile(['a', 'b'], ['a', 'b']).face !== 'clean') bad.push('全登记应 clean');
        var g = reconcile(['a', 'b', 'c'], ['a', 'ghost']);
        if (g.face !== 'gaps') bad.push('有差应 gaps');
        if (g.unregistered.length !== 2) bad.push('未登记数错，得 ' + g.unregistered.length);
        if (g.orphan.length !== 1 || g.orphan[0] !== 'ghost') bad.push('孤儿登记数错');
        if (g.registered.length !== 1) bad.push('已登记数错');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, reconcile: reconcile, registrationNote: registrationNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCatalogRegistration = api;
})(typeof window !== 'undefined' ? window : globalThis);
