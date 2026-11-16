/**
 * memory-timeline.js — 记忆时间线 —— 唯一桥（v3.472.0 · L22-X5）
 *
 * 纪律：纯函数。把散落记忆按剧情钟排成一条时间线，每条可回源（sourceKey）。
 * 时刻读不出的沉底并如实标 no-clock，绝不按墙钟顶替。四态：empty / timeline / invalid。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'empty', 'timeline'];
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function buildTimeline(items) {
        var arr = Array.isArray(items) ? items : null;
        if (!arr) return { face: 'invalid', points: [], noClock: 0 };
        var points = [];
        var noClock = 0;
        for (var i = 0; i < arr.length; i++) {
            var it = arr[i];
            if (!it || typeof it !== 'object') continue;
            var at = numOrNull(it.storyAt != null ? it.storyAt : it.at);
            var sourceKey = String(it.sourceKey == null ? '' : it.sourceKey).trim();
            var text = String(it.text != null ? it.text : (it.summary != null ? it.summary : ''));
            if (at === null) { noClock++; continue; }
            points.push({ atMs: at, text: text, sourceKey: sourceKey });
        }
        points.sort(function (a, b) { return a.atMs - b.atMs; });
        return { face: points.length ? 'timeline' : 'empty', points: points, noClock: noClock };
    }

    function timelineNote(r) {
        if (!r) return '读不出时间线';
        if (r.face === 'invalid') return '这些记忆读不出来';
        if (r.face === 'empty') return '还没有可排入时间线的记忆';
        var extra = r.noClock ? '（另有 ' + r.noClock + ' 条时间不详未排入）' : '';
        return r.points.length + ' 个记忆节点' + extra;
    }

    function selfCheck() {
        var bad = [];
        if (buildTimeline(null).face !== 'invalid') bad.push('非数组应 invalid');
        if (buildTimeline([]).face !== 'empty') bad.push('空应 empty');
        var r = buildTimeline([
            { storyAt: 300, text: 'c' },
            { storyAt: 100, text: 'a' },
            { text: 'no clock' },
            { storyAt: 200, text: 'b', sourceKey: 'k2' }
        ]);
        if (r.face !== 'timeline' || r.points.length !== 3) bad.push('节点数错，得 ' + r.points.length);
        if (r.noClock !== 1) bad.push('无钟计数错');
        if (r.points[0].atMs !== 100) bad.push('应按时间升序');
        if (r.points[1].sourceKey !== 'k2') bad.push('源键丢失');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, buildTimeline: buildTimeline, timelineNote: timelineNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
