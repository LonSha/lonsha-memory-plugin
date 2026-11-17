/**
 * forgetting-explanation.js — 遗忘的叙事解释 —— 唯一桥（v3.473.0 · L23-X4）
 *
 * 纪律：纯函数；**不替角色说死**。只给「可能的解释候选 + 支撑它的读数」，
 *   措辞一律「可能 / 之一」，输出里没有定论字段。
 * 频率门 fail-closed：命中次数 < minHits（默认 3）时 face=insufficient，
 *   一条候选都不给 —— 样本不足时给解释就是编。
 */
(function (global) {
    'use strict';

    var MIN_HITS = 3;

    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function explainForgetting(input, opts) {
        var o = opts && typeof opts === 'object' ? opts : {};
        var minHits = numOrNull(o.minHits);
        if (minHits === null) minHits = MIN_HITS;
        if (!input || typeof input !== 'object') return { face: 'insufficient', reason: 'no-input', candidates: [] };
        var hits = numOrNull(input.hits);
        if (hits === null || hits < minHits) {
            return { face: 'insufficient', reason: 'below-frequency-gate', hits: hits, minHits: minHits, candidates: [] };
        }
        var candidates = [];
        var gap = numOrNull(input.gapFloors);
        var sessions = numOrNull(input.sessionCount);
        var lastSeen = numOrNull(input.lastSeenFloor);
        var now = numOrNull(input.nowFloor);
        if (gap !== null && gap > 0) {
            candidates.push({ kind: 'long-gap', evidence: '距上次提及 ' + gap + ' 楼', text: '隔得太久了，可能记不清' });
        }
        if (sessions !== null && sessions <= 1) {
            candidates.push({ kind: 'single-session', evidence: '只在 ' + sessions + ' 段对话里出现过', text: '只提过一次，可能是没往心里去' });
        }
        if (lastSeen === null) {
            candidates.push({ kind: 'never-accessed', evidence: '没有最近提及楼层', text: '也许一直没再想起过' });
        }
        if (now !== null && lastSeen !== null && now - lastSeen > 0) {
            candidates.push({ kind: 'since-last-seen', evidence: '此后又过了 ' + (now - lastSeen) + ' 楼', text: '这之后发生了别的，可能被盖过去了' });
        }
        if (candidates.length === 0) return { face: 'insufficient', reason: 'no-candidate', hits: hits, candidates: [] };
        return { face: 'explained', hits: hits, candidates: candidates, final: false };
    }

    function forgettingNote(res) {
        if (!res || res.face === 'insufficient') return '解释不出（' + (res ? res.reason : 'no-result') + '），不猜';
        return '可能的原因之 ' + res.candidates.length + '：' + res.candidates.map(function (c) { return c.text; }).join('；');
    }

    function selfCheck() {
        var bad = [];
        var rich = explainForgetting({ hits: 5, gapFloors: 30, sessionCount: 1, lastSeenFloor: 100, nowFloor: 140 });
        if (rich.face !== 'explained') bad.push('样本足应 explained');
        if (rich.candidates.length < 2) bad.push('应给多条候选');
        if (rich.final !== false) bad.push('不许给终局结论');
        var thin = explainForgetting({ hits: 1, gapFloors: 30 });
        if (thin.face !== 'insufficient') bad.push('低于频率门应 insufficient');
        if (thin.candidates.length !== 0) bad.push('样本不足时不许给候选');
        if (explainForgetting(null).face !== 'insufficient') bad.push('空输入应 insufficient');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { MIN_HITS: MIN_HITS, explainForgetting: explainForgetting, forgettingNote: forgettingNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaForgettingExplanation = api;
})(typeof window !== 'undefined' ? window : globalThis);