/**
 * memory-capsule.js — 记忆时间胶囊 —— 唯一桥（v3.472.0 · L22-X1）
 *
 * 纪律：纯函数。只判「一条封存记忆此刻该不该开」与「封存期是否该静默」。
 * 写盘（谁封、封了啥）归宿主；本桥不写任何存储。
 * 三态：sealed（未到日）/ openable（到日可开）/ opened（已开）。时刻读不出 = 不猜，如实 invalid。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'sealed', 'openable', 'opened'];
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function capsuleState(capsule, nowMs) {
        if (!capsule || typeof capsule !== 'object') return { face: 'invalid' };
        var openAt = numOrNull(capsule.openAt);
        var now = numOrNull(nowMs);
        if (openAt === null || now === null) return { face: 'invalid', reason: 'no-clock' };
        if (capsule.openedAt != null) {
            return { face: 'opened', openedAt: numOrNull(capsule.openedAt), openAt: openAt };
        }
        if (now < openAt) return { face: 'sealed', openAt: openAt, remainMs: openAt - now };
        return { face: 'openable', openAt: openAt };
    }

    function shouldSuppress(capsule, nowMs) {
        var st = capsuleState(capsule, nowMs);
        return st.face === 'sealed';
    }

    function capsuleNote(st) {
        if (!st) return '读不出这颗胶囊';
        if (st.face === 'invalid') return '这颗胶囊的时刻读不出来';
        if (st.face === 'opened') return '这颗胶囊已经打开过了';
        if (st.face === 'openable') return '一颗封存的记忆可以打开了';
        var d = Math.ceil(st.remainMs / 86400000);
        return '还有 ' + (d > 0 ? d + ' 天' : '不到一天') + '才到打开的日子';
    }

    function selfCheck() {
        var bad = [];
        if (capsuleState(null, 0).face !== 'invalid') bad.push('空胶囊应 invalid');
        if (capsuleState({ openAt: 100 }, null).face !== 'invalid') bad.push('无 now 应 invalid');
        if (capsuleState({ openAt: 100 }, 50).face !== 'sealed') bad.push('未到日应 sealed');
        if (capsuleState({ openAt: 100 }, 150).face !== 'openable') bad.push('到日应 openable');
        if (capsuleState({ openAt: 100, openedAt: 120 }, 150).face !== 'opened') bad.push('已开应 opened');
        if (capsuleState({ openAt: 0 }, 0).face !== 'openable') bad.push('openAt=0 合法应 openable');
        if (shouldSuppress({ openAt: 100 }, 50) !== true) bad.push('封存期应静默');
        if (shouldSuppress({ openAt: 100 }, 150) !== false) bad.push('到日不该静默');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, capsuleState: capsuleState, shouldSuppress: shouldSuppress, capsuleNote: capsuleNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryCapsule = api;
})(typeof window !== 'undefined' ? window : globalThis);
