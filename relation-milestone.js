/**
 * relation-milestone.js — 关系里程碑 —— 唯一桥（v3.472.0 · L22-X3）
 *
 * 纪律：纯函数。从既有关系事件里抽出里程碑（第一次见面/争吵/和好），排成时间线。
 * 只读不改，不重算关系强度（那归图谱）。四态：empty / timeline / invalid。时刻读不出不回落。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'empty', 'timeline'];
    var MILESTONE_KINDS = ['first-meet', 'first-fight', 'first-makeup', 'first-confide'];
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function milestones(events) {
        var arr = Array.isArray(events) ? events : null;
        if (!arr) return { face: 'invalid', items: [], kinds: MILESTONE_KINDS.slice() };
        var seen = {};
        var items = [];
        for (var i = 0; i < arr.length; i++) {
            var e = arr[i];
            if (!e || typeof e !== 'object') continue;
            var kind = String(e.kind == null ? '' : e.kind).trim();
            if (MILESTONE_KINDS.indexOf(kind) < 0) continue;
            if (seen[kind]) continue;
            seen[kind] = true;
            items.push({ kind: kind, atMs: numOrNull(e.storyAt != null ? e.storyAt : e.at), label: String(e.label == null ? '' : e.label) });
        }
        items.sort(function (a, b) {
            if (a.atMs === null && b.atMs === null) return 0;
            if (a.atMs === null) return 1;
            if (b.atMs === null) return -1;
            return a.atMs - b.atMs;
        });
        return { face: items.length ? 'timeline' : 'empty', items: items, kinds: MILESTONE_KINDS.slice() };
    }

    function milestoneNote(r) {
        if (!r) return '读不出关系里程碑';
        if (r.face === 'invalid') return '这些关系事件读不出来';
        if (r.face === 'empty') return '还没有里程碑';
        return r.items.length + ' 个关系里程碑';
    }

    function selfCheck() {
        var bad = [];
        if (milestones(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (milestones([]).face !== 'empty') bad.push('空应 empty');
        var r = milestones([
            { kind: 'first-fight', storyAt: 200 },
            { kind: 'first-meet', storyAt: 100 },
            { kind: 'first-meet', storyAt: 999 },
            { kind: 'noise', storyAt: 50 }
        ]);
        if (r.face !== 'timeline' || r.items.length !== 2) bad.push('里程碑数错，得 ' + r.items.length);
        if (r.items[0].kind !== 'first-meet') bad.push('应按时间正序');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, MILESTONE_KINDS: MILESTONE_KINDS, milestones: milestones, milestoneNote: milestoneNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaRelationMilestone = api;
})(typeof window !== 'undefined' ? window : globalThis);
