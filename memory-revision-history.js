/**
 * memory-revision-history.js — 记忆修订历史 —— 唯一桥（v3.473.0 · L23-X7）
 *
 * 纪律：**不许抹掉历史**。输入多少条就输出多少条，缺环只标 broken，绝不静默丢行。
 * 三态：single（只有一版）/ chained（从根到梢能串起来）/ broken（某条的父版本不在账上）。
 */
(function (global) {
    'use strict';

    function idOf(v) {
        return v == null ? null : String(v);
    }

    function revisionChain(revisions) {
        if (!Array.isArray(revisions)) return { face: 'invalid', items: [] };
        if (revisions.length === 0) return { face: 'empty', items: [] };
        var items = [];
        var seen = {};
        var bad = [];
        for (var i = 0; i < revisions.length; i++) {
            var r = revisions[i];
            if (!r || typeof r !== 'object') {
                items.push({ index: i, id: null, parentId: null, floor: null, dropped: false });
                bad.push({ index: i, reason: 'not-object' });
                continue;
            }
            var id = idOf(r.id);
            var parentId = idOf(r.parentId);
            if (id !== null) seen[id] = true;
            items.push({
                index: i,
                id: id,
                parentId: parentId,
                floor: r.floor == null ? null : Number(r.floor),
                text: r.text == null ? null : String(r.text),
                dropped: false
            });
        }
        for (var j = 0; j < items.length; j++) {
            var it = items[j];
            if (it.id === null) { bad.push({ index: j, reason: 'no-id' }); continue; }
            if (it.parentId !== null && !seen[it.parentId]) bad.push({ index: j, reason: 'parent-missing', parentId: it.parentId });
        }
        /* 断环优先于「只有一版」：单版但父版本不在账上，仍是 broken（自检当场抓到过这一处） */
        if (bad.length > 0) return { face: 'broken', items: items, depth: items.length, bad: bad };
        if (items.length === 1) return { face: 'single', items: items, depth: 1, bad: [] };
        return { face: 'chained', items: items, depth: items.length, bad: [] };
    }

    function historyNote(res) {
        if (!res || res.face === 'invalid') return '修订史读不出来';
        if (res.face === 'empty') return '还没有修订过';
        if (res.face === 'single') return '只有一版，没改过';
        if (res.face === 'broken') return '有 ' + res.bad.length + ' 条接不上上一版（不丢行，只标断）';
        return '共 ' + res.depth + ' 版，能一路串起来';
    }

    function selfCheck() {
        var bad = [];
        var chain = revisionChain([
            { id: 'v1', parentId: null, floor: 10, text: 'a' },
            { id: 'v2', parentId: 'v1', floor: 20, text: 'b' }
        ]);
        if (chain.face !== 'chained') bad.push('两版能串应 chained');
        if (chain.items.length !== 2) bad.push('不许丢行');
        if (revisionChain([{ id: 'v1' }]).face !== 'single') bad.push('单版应 single');
        var broken = revisionChain([{ id: 'v2', parentId: 'v9' }]);
        if (broken.face !== 'broken') bad.push('父版本缺失应 broken');
        if (broken.items.length !== 1) bad.push('断环也要保留该行');
        if (revisionChain([]).face !== 'empty') bad.push('空史应 empty');
        if (revisionChain(null).face !== 'invalid') bad.push('非数组应 invalid');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { revisionChain: revisionChain, historyNote: historyNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryRevisionHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);