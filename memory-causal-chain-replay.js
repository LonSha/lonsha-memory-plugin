/**
 * memory-causal-chain-replay.js — 记忆因果链回放 —— 唯一桥（v3.473.0 · L23-X1）
 *
 * 纪律：纯函数。只回答「这条记忆能不能一路回放到原话」，不裁剪、不补写、不替角色推断。
 * 三态：traceable（每一环都有可核对的楼层锚）/ source-gone（某环锚丢了，指到第几环）/
 *       incomparable（锚在，但楼层跨了不同时间轴，无法比较先后）。空链 = empty。
 */
(function (global) {
    'use strict';

    function floorOf(v) {
        if (v === null || v === undefined || v === '') return null;
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function replayChain(nodes) {
        if (!Array.isArray(nodes) || nodes.length === 0) return { face: 'empty', steps: [] };
        var steps = [];
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (!n || typeof n !== 'object') return { face: 'source-gone', brokenAt: i, steps: steps, reason: 'not-object' };
            var own = floorOf(n.floor);
            var src = n.source && typeof n.source === 'object' ? n.source : null;
            var srcFloor = src ? floorOf(src.floor) : null;
            if (own === null || srcFloor === null) {
                return { face: 'source-gone', brokenAt: i, steps: steps, reason: own === null ? 'no-own-floor' : 'no-source-floor' };
            }
            if (n.epoch && src.epoch && String(n.epoch) !== String(src.epoch)) {
                return { face: 'incomparable', brokenAt: i, steps: steps, reason: 'epoch-mismatch' };
            }
            if (srcFloor > own) {
                return { face: 'incomparable', brokenAt: i, steps: steps, reason: 'source-after-fact' };
            }
            steps.push({
                index: i,
                fact: n.fact == null ? null : String(n.fact),
                floor: own,
                sourceFloor: srcFloor,
                quote: src.quote == null ? null : String(src.quote)
            });
        }
        return { face: 'traceable', steps: steps, depth: steps.length };
    }

    function replayNote(res) {
        if (!res) return '这条链读不出来';
        if (res.face === 'empty') return '这条链没有可回放的环节';
        if (res.face === 'traceable') return '回放到第 ' + res.steps[0].sourceFloor + ' 楼原话，共 ' + res.depth + ' 环';
        if (res.face === 'source-gone') return '第 ' + (res.brokenAt + 1) + ' 环找不到原话锚（' + res.reason + '）';
        return '第 ' + (res.brokenAt + 1) + ' 环的锚和事实不在同一条时间轴上（' + res.reason + '）';
    }

    function selfCheck() {
        var bad = [];
        var okChain = replayChain([
            { fact: 'f1', floor: 10, source: { floor: 3, quote: 'q1' } },
            { fact: 'f2', floor: 20, source: { floor: 12 } }
        ]);
        if (okChain.face !== 'traceable') bad.push('两环齐全应 traceable');
        if (okChain.depth !== 2) bad.push('depth 应为 2');
        if (replayChain([{ fact: 'f', floor: 5, source: {} }]).face !== 'source-gone') bad.push('缺 source.floor 应 source-gone');
        if (replayChain([{ fact: 'f', floor: 5, source: { floor: 9 } }]).face !== 'incomparable') bad.push('源晚于事实应 incomparable');
        if (replayChain([{ fact: 'f', floor: 5, source: { floor: 1 }, epoch: 'a' }, { fact: 'g', floor: 6, source: { floor: 2, }, epoch: 'b' }]).face !== 'traceable') bad.push('同 epoch 应 traceable');
        if (replayChain([{ fact: 'f', floor: 5, source: { floor: 1, epoch: 'a' }, epoch: 'b' }]).face !== 'incomparable') bad.push('epoch 不一致应 incomparable');
        if (replayChain([]).face !== 'empty') bad.push('空链应 empty');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { replayChain: replayChain, replayNote: replayNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryCausalChainReplay = api;
})(typeof window !== 'undefined' ? window : globalThis);