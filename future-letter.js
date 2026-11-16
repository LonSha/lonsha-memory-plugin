/**
 * future-letter.js — 给未来的信 —— 唯一桥（v3.472.0 · L22-X2）
 *
 * 纪律：候选不替角色选。本桥只产「此刻有哪些信可以回响」的候选，绝不自作主张注入。
 * 写盘归宿主；纯函数零 IO。四态：none / pending / due / invalid。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'none', 'pending', 'due'];
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function letterState(letter, nowMs) {
        if (!letter || typeof letter !== 'object') return { face: 'invalid' };
        var openAt = numOrNull(letter.openAt);
        var now = numOrNull(nowMs);
        if (openAt === null || now === null) return { face: 'invalid', reason: 'no-clock' };
        if (letter.respondedAt != null) return { face: 'none', reason: 'already' };
        if (now >= openAt) return { face: 'due', openAt: openAt, text: String(letter.text == null ? '' : letter.text) };
        return { face: 'pending', openAt: openAt, remainMs: openAt - now };
    }

    function dueCandidates(letters, nowMs) {
        var arr = Array.isArray(letters) ? letters : [];
        var due = [];
        for (var i = 0; i < arr.length; i++) {
            var st = letterState(arr[i], nowMs);
            if (st.face === 'due') due.push({ index: i, letter: arr[i], openAt: st.openAt, text: st.text });
        }
        return { face: due.length ? 'due' : 'none', candidates: due, count: due.length };
    }

    function futureLetterNote(r) {
        if (!r) return '读不出这些信';
        if (r.face === 'invalid') return '有封信的时刻读不出来';
        if (r.face === 'due') return r.count + ' 封给未来的信到日子了';
        return '还没有到日子的信';
    }

    function selfCheck() {
        var bad = [];
        if (letterState(null, 0).face !== 'invalid') bad.push('空信应 invalid');
        if (letterState({ openAt: 100 }, 50).face !== 'pending') bad.push('未到日应 pending');
        if (letterState({ openAt: 100 }, 150).face !== 'due') bad.push('到日应 due');
        if (letterState({ openAt: 100, respondedAt: 120 }, 150).face !== 'none') bad.push('已回应应 none');
        var cand = dueCandidates([{ openAt: 100 }, { openAt: 200 }, { openAt: 50 }], 150);
        if (cand.count !== 2) bad.push('候选数错，得 ' + cand.count);
        if (cand.candidates[0].index !== 0) bad.push('候选应带原下标');
        if (dueCandidates([], 100).face !== 'none') bad.push('空应 none');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, letterState: letterState, dueCandidates: dueCandidates, futureLetterNote: futureLetterNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaFutureLetter = api;
})(typeof window !== 'undefined' ? window : globalThis);
