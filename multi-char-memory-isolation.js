/**
 * multi-char-memory-isolation.js — 多角色同台记忆隔离 —— 唯一桥（v3.472.0 · L22-X9）
 *
 * 纪律：纯函数。对一条记忆按「归属角色/共享标记」判可见性。
 * 私有记忆只对归属角色可见；共享记忆对同场所有角色可见；归属读不出 = 不可比（不猜）。
 * 三态：private / shared / incomparable。不替角色选，绝不把私有泄露给他人。
 */
(function (global) {
    'use strict';

    var FACES = ['incomparable', 'private', 'shared'];

    function visibility(memory, viewer) {
        if (!memory || typeof memory !== 'object') return { face: 'incomparable', reason: 'no-memory' };
        if (memory.shared === true) return { face: 'shared', visible: true };
        var owner = String(memory.ownerChar == null ? '' : memory.ownerChar).trim();
        var v = String(viewer == null ? '' : viewer).trim();
        if (!owner || !v) return { face: 'incomparable', reason: 'no-owner' };
        if (memory.shared === false) {
            return owner === v ? { face: 'private', visible: true, owner: owner } : { face: 'private', visible: false, owner: owner };
        }
        return { face: 'incomparable', reason: 'no-flag' };
    }

    function filterVisible(memories, viewer) {
        var arr = Array.isArray(memories) ? memories : [];
        var kept = [];
        var hidden = 0;
        var incomparable = 0;
        for (var i = 0; i < arr.length; i++) {
            var v = visibility(arr[i], viewer);
            if (v.face === 'incomparable') { incomparable++; continue; }
            if (v.visible) kept.push(arr[i]);
            else hidden++;
        }
        return { kept: kept, hidden: hidden, incomparable: incomparable };
    }

    function isolationNote(r) {
        if (!r) return '读不出隔离结果';
        var bits = ['可见 ' + r.kept.length + ' 条'];
        if (r.hidden) bits.push('私有隐藏 ' + r.hidden + ' 条');
        if (r.incomparable) bits.push('不可比 ' + r.incomparable + ' 条');
        return bits.join('，');
    }

    function selfCheck() {
        var bad = [];
        if (visibility(null, 'x').face !== 'incomparable') bad.push('空记忆应 incomparable');
        if (visibility({ shared: true }, 'x').face !== 'shared') bad.push('共享应 shared');
        if (visibility({ shared: false, ownerChar: 'a' }, 'a').visible !== true) bad.push('私有归属本人应可见');
        if (visibility({ shared: false, ownerChar: 'a' }, 'b').visible !== false) bad.push('私有他人不该可见');
        if (visibility({ ownerChar: 'a' }, 'a').face !== 'incomparable') bad.push('无标记应 incomparable 不猜');
        var r = filterVisible([
            { shared: true },
            { shared: false, ownerChar: 'a' },
            { shared: false, ownerChar: 'b' },
            { ownerChar: 'a' }
        ], 'a');
        if (r.kept.length !== 2) bad.push('可见数错，得 ' + r.kept.length);
        if (r.hidden !== 1) bad.push('隐藏数错');
        if (r.incomparable !== 1) bad.push('不可比数错');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, visibility: visibility, filterVisible: filterVisible, isolationNote: isolationNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMultiCharIsolation = api;
})(typeof window !== 'undefined' ? window : globalThis);
