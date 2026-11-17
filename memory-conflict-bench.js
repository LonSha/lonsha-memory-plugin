/**
 * memory-conflict-bench.js — 记忆冲突裁决台 —— 唯一桥（v3.473.0 · L23-X5）
 *
 * 纪律：**不自动裁决**。本桥只摆三种处置候选；要落地必须有人（actor）明确点名某一项。
 *   actor 为空 → face='awaiting-human'，判据把「无 actor 也返回 resolved」钉成红。
 * 候选三种：keep-left / keep-right / keep-both（并存，两条都留）。
 */
(function (global) {
    'use strict';

    var OPTIONS = ['keep-left', 'keep-right', 'keep-both'];

    function shapeOf(conflict) {
        if (!conflict || typeof conflict !== 'object') return null;
        var left = conflict.left, right = conflict.right;
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return null;
        return {
            id: conflict.id == null ? null : String(conflict.id),
            left: { fact: left.fact == null ? null : String(left.fact), floor: left.floor == null ? null : Number(left.floor) },
            right: { fact: right.fact == null ? null : String(right.fact), floor: right.floor == null ? null : Number(right.floor) }
        };
    }

    function proposeResolutions(conflict) {
        var c = shapeOf(conflict);
        if (!c) return { face: 'invalid', options: [] };
        return {
            face: 'awaiting-human',
            conflictId: c.id,
            options: OPTIONS.map(function (k) { return { kind: k, note: noteOf(k) }; }),
            autoDecided: false
        };
    }

    function noteOf(kind) {
        if (kind === 'keep-left') return '留这一边，另一边记为被推翻';
        if (kind === 'keep-right') return '留那一边，这一边记为被推翻';
        return '两条并存，不判谁对';
    }

    function resolveConflict(conflict, optionKind, actor) {
        var c = shapeOf(conflict);
        if (!c) return { face: 'invalid', reason: 'bad-conflict' };
        var who = actor == null ? '' : String(actor).trim();
        if (!who) return { face: 'awaiting-human', reason: 'no-actor', conflictId: c.id, options: OPTIONS.slice() };
        if (OPTIONS.indexOf(optionKind) < 0) return { face: 'awaiting-human', reason: 'unknown-option', conflictId: c.id, options: OPTIONS.slice() };
        return { face: 'resolved', conflictId: c.id, decision: optionKind, actor: who, autoDecided: false };
    }

    function conflictNote(res) {
        if (!res || res.face === 'invalid') return '这条冲突读不出来';
        if (res.face === 'resolved') return '已由「' + res.actor + '」定为 ' + res.decision;
        if (res.reason === 'no-actor') return '等人决定：三条路径都摆着，机器不替人选';
        return '等人决定：' + res.options.join(' / ');
    }

    function selfCheck() {
        var bad = [];
        var c = { id: 'c1', left: { fact: 'A', floor: 10 }, right: { fact: 'B', floor: 20 } };
        var p = proposeResolutions(c);
        if (p.face !== 'awaiting-human') bad.push('提议阶段应 awaiting-human');
        if (p.options.length !== 3) bad.push('应三种候选');
        if (resolveConflict(c, 'keep-left', '').face !== 'awaiting-human') bad.push('无 actor 不许落地');
        if (resolveConflict(c, 'keep-left', null).reason !== 'no-actor') bad.push('无 actor 理由应为 no-actor');
        if (resolveConflict(c, 'whatever', 'lin').reason !== 'unknown-option') bad.push('未知选项应拒');
        if (resolveConflict(c, 'keep-both', 'lin').face !== 'resolved') bad.push('有人点名应 resolved');
        if (proposeResolutions(null).face !== 'invalid') bad.push('空冲突应 invalid');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { OPTIONS: OPTIONS, proposeResolutions: proposeResolutions, resolveConflict: resolveConflict, conflictNote: conflictNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryConflictBench = api;
})(typeof window !== 'undefined' ? window : globalThis);