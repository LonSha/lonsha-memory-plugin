/**
 * commitment-followthrough.js — 承诺兑现追踪 —— 唯一桥（v3.473.0 · L23-X3）
 *
 * 纪律：纯函数。只判「这条承诺此刻算不算兑现 / 过没过期」，不替角色解释、不写盘。
 * 三态：kept（有兑现楼层）/ pending（没到日）/ overdue（过了日还没兑现），
 *   另外 undated（读不出期限）**单列**，不许并进 pending —— 并进去就等于替它定了个日子。
 */
(function (global) {
    'use strict';

    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function trackCommitments(list, nowFloor) {
        if (!Array.isArray(list)) return { face: 'invalid', items: [] };
        var now = numOrNull(nowFloor);
        var kept = [], pending = [], overdue = [], undated = [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            if (!c || typeof c !== 'object') continue;
            var id = c.id == null ? '#' + i : String(c.id);
            var keptAt = numOrNull(c.keptAtFloor);
            if (keptAt !== null) {
                kept.push({ id: id, keptAtFloor: keptAt, text: c.text == null ? null : String(c.text) });
                continue;
            }
            var due = numOrNull(c.dueFloor);
            if (due === null) {
                undated.push({ id: id, text: c.text == null ? null : String(c.text) });
                continue;
            }
            var row = { id: id, dueFloor: due, text: c.text == null ? null : String(c.text) };
            if (now === null) { pending.push(row); continue; }
            if (now < due) pending.push(row);
            else {
                row.overdueBy = now - due;
                overdue.push(row);
            }
        }
        var total = kept.length + pending.length + overdue.length + undated.length;
        if (total === 0) return { face: 'empty', kept: [], pending: [], overdue: [], undated: [] };
        return {
            face: 'tracked',
            kept: kept, pending: pending, overdue: overdue, undated: undated,
            counts: { kept: kept.length, pending: pending.length, overdue: overdue.length, undated: undated.length },
            clockKnown: now !== null
        };
    }

    function followthroughNote(res) {
        if (!res || res.face === 'invalid') return '承诺面读不出来';
        if (res.face === 'empty') return '这一轮没有承诺要追';
        var s = '兑现 ' + res.counts.kept + ' / 未到期 ' + res.counts.pending + ' / 过期 ' + res.counts.overdue;
        if (res.counts.undated) s += ' / 期限读不出 ' + res.counts.undated;
        if (!res.clockKnown) s += '（此刻读不出，过期未判）';
        return s;
    }

    function selfCheck() {
        var bad = [];
        var r = trackCommitments([
            { id: 'a', dueFloor: 100, keptAtFloor: 40 },
            { id: 'b', dueFloor: 200 },
            { id: 'c', dueFloor: 50 },
            { id: 'd' }
        ], 100);
        if (r.face !== 'tracked') bad.push('应 tracked');
        if (r.counts.kept !== 1 || r.counts.pending !== 1 || r.counts.overdue !== 1 || r.counts.undated !== 1) bad.push('四态计数不对');
        if (r.kept[0].id !== 'a' || r.overdue[0].id !== 'c') bad.push('分桶错位');
        if (trackCommitments([], 1).face !== 'empty') bad.push('空清单应 empty');
        var noClock = trackCommitments([{ id: 'x', dueFloor: 1 }], null);
        if (noClock.overdue.length !== 0) bad.push('无此刻不许判过期');
        if (noClock.undated.length !== 0) bad.push('有期限的不许进 undated');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { trackCommitments: trackCommitments, followthroughNote: followthroughNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCommitmentFollowthrough = api;
})(typeof window !== 'undefined' ? window : globalThis);