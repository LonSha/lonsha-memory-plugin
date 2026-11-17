/**
 * memory-bias-surface.js — 角色记忆偏差面 —— 唯一桥（v3.473.0 · L23-X2）
 *
 * 纪律：**只列分歧，不裁决**。输出里没有 winner / correct / preferred 这类字段，
 *   因为「谁记对了」不是本桥能知道的事 —— 它只有两边的说法。
 * 三态：divergent（同一 factId 两边说法不同）/ consistent（都对得上的部分一致）/
 *       insufficient（没有可比的共同事实，样本不足不产结论）。
 */
(function (global) {
    'use strict';

    function claimsOf(side) {
        if (!side || typeof side !== 'object' || !Array.isArray(side.claims)) return null;
        var map = {};
        for (var i = 0; i < side.claims.length; i++) {
            var c = side.claims[i];
            if (!c || typeof c !== 'object' || c.factId == null) continue;
            map[String(c.factId)] = c.text == null ? '' : String(c.text);
        }
        return map;
    }

    function compareBias(left, right) {
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
            return { face: 'insufficient', reason: 'missing-side', divergences: [] };
        }
        var a = claimsOf(left), b = claimsOf(right);
        if (a === null || b === null) return { face: 'insufficient', reason: 'no-claims', divergences: [] };
        var common = Object.keys(a).filter(function (k) { return Object.prototype.hasOwnProperty.call(b, k); });
        if (common.length === 0) {
            return { face: 'insufficient', reason: 'no-shared-fact', divergences: [], leftOnly: Object.keys(a).length, rightOnly: Object.keys(b).length };
        }
        var divergences = [];
        var same = 0;
        for (var i = 0; i < common.length; i++) {
            var id = common[i];
            if (a[id] === b[id]) { same++; continue; }
            divergences.push({ factId: id, left: a[id], right: b[id] });
        }
        if (divergences.length === 0) return { face: 'consistent', compared: common.length, same: same, divergences: [] };
        return { face: 'divergent', compared: common.length, same: same, divergences: divergences };
    }

    function biasNote(res) {
        if (!res) return '偏差面读不出来';
        if (res.face === 'insufficient') return '可比的共同事实不足（' + res.reason + '），不判断谁记得对';
        if (res.face === 'consistent') return '可比的 ' + res.compared + ' 条说法一致';
        return '可比 ' + res.compared + ' 条里有 ' + res.divergences.length + ' 条说法不同（只列不裁）';
    }

    function selfCheck() {
        var bad = [];
        var r = compareBias(
            { actor: 'A', claims: [{ factId: 'f1', text: '周三' }, { factId: 'f2', text: '雨天' }] },
            { actor: 'B', claims: [{ factId: 'f1', text: '周四' }, { factId: 'f2', text: '雨天' }] }
        );
        if (r.face !== 'divergent') bad.push('说法不同应 divergent');
        if (r.divergences.length !== 1) bad.push('应只列 1 条分歧');
        if ('winner' in r || 'correct' in r) bad.push('不许带裁决字段');
        if (compareBias({ claims: [{ factId: 'x', text: 'a' }] }, { claims: [{ factId: 'y', text: 'a' }] }).face !== 'insufficient') bad.push('无共同事实应 insufficient');
        if (compareBias({ claims: [{ factId: 'x', text: 'a' }] }, { claims: [{ factId: 'x', text: 'a' }] }).face !== 'consistent') bad.push('一致应 consistent');
        if (compareBias(null, { claims: [] }).face !== 'insufficient') bad.push('缺一侧应 insufficient');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { compareBias: compareBias, biasNote: biasNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryBiasSurface = api;
})(typeof window !== 'undefined' ? window : globalThis);