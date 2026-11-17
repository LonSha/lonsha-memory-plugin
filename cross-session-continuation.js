/**
 * cross-session-continuation.js — 跨会话延续证明 —— 唯一桥（v3.473.0 · L23-X9）
 *
 * 纪律：跨会话措辞必须带楼层锚。没有锚的「上次说过」不许被当成延续证据。
 * 三态：anchored（每条跨会话引用都有楼层）/ unanchored（列出缺锚的下标）/
 *       single-session（只有一段会话，没什么可证的）。空面 = insufficient。
 */
(function (global) {
    'use strict';

    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function proveContinuation(input) {
        if (!input || typeof input !== 'object' || !Array.isArray(input.claims)) {
            return { face: 'insufficient', reason: 'no-claims', anchors: [] };
        }
        var claims = input.claims.filter(function (c) { return c && typeof c === 'object'; });
        if (claims.length === 0) return { face: 'insufficient', reason: 'empty-claims', anchors: [] };
        var sessions = {};
        var missing = [];
        var anchors = [];
        for (var i = 0; i < claims.length; i++) {
            var c = claims[i];
            var sid = c.sessionId == null ? null : String(c.sessionId);
            if (sid !== null) sessions[sid] = true;
            var floor = numOrNull(c.floor);
            if (floor === null) {
                missing.push({ index: i, sessionId: sid, text: c.text == null ? null : String(c.text) });
                continue;
            }
            anchors.push({ index: i, sessionId: sid, floor: floor });
        }
        var sessionCount = Object.keys(sessions).length;
        if (sessionCount <= 1 && missing.length === 0) {
            return { face: 'single-session', sessionCount: sessionCount, anchors: anchors };
        }
        if (missing.length > 0) {
            return { face: 'unanchored', sessionCount: sessionCount, anchors: anchors, missing: missing };
        }
        return { face: 'anchored', sessionCount: sessionCount, anchors: anchors };
    }

    function continuationNote(res) {
        if (!res || res.face === 'insufficient') return '延续读不出来（' + (res ? res.reason : 'no-result') + '）';
        if (res.face === 'single-session') return '只有一段会话，谈不上跨会话延续';
        if (res.face === 'unanchored') return '有 ' + res.missing.length + ' 条跨会话措辞找不到楼层锚，不许当延续';
        return '跨 ' + res.sessionCount + ' 段会话，' + res.anchors.length + ' 条引用都带楼层锚';
    }

    function selfCheck() {
        var bad = [];
        var ok = proveContinuation({ claims: [{ sessionId: 's1', floor: 12 }, { sessionId: 's2', floor: 40 }] });
        if (ok.face !== 'anchored') bad.push('两条都带锚应 anchored');
        if (ok.anchors.length !== 2) bad.push('锚应逐条列出');
        var miss = proveContinuation({ claims: [{ sessionId: 's1', floor: 12 }, { sessionId: 's2' }] });
        if (miss.face !== 'unanchored') bad.push('缺锚应 unanchored');
        if (miss.missing.length !== 1) bad.push('缺锚应列出下标');
        if (proveContinuation({ claims: [{ sessionId: 's1', floor: 1 }] }).face !== 'single-session') bad.push('单会话应 single-session');
        if (proveContinuation({}).face !== 'insufficient') bad.push('无 claims 应 insufficient');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { proveContinuation: proveContinuation, continuationNote: continuationNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCrossSessionContinuation = api;
})(typeof window !== 'undefined' ? window : globalThis);