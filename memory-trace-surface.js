/**
 * memory-trace-surface.js — 可回源追踪面 —— 唯一装配点（v3.473.0 · L23-X1~X9）
 *
 * 纪律：本模块**不实现业务**，只把九座桥按同一份快照装订成一张面，供
 *   public-interface 的 /lonsha-get trace 与下游按名读取（这就是九个 X 项的**真实消费点**）。
 * 缺数据时的口径：每一项各自出三态，**整面永远不抛**；快照缺某项 → 该面 insufficient/empty，
 *   绝不拿 0 或空数组冒充「查过了没有」。
 */
(function (global) {
    'use strict';

    function safe(fn, fallback) {
        try { return fn(); } catch (_e) { return fallback; }
    }

    function need(modName, globalName) {
        try {
            if (typeof require === 'function') return require('./' + modName);
        } catch (_e) { /* 宿主里可能没有 require，落到全局 */ }
        return global[globalName] || null;
    }

    function buildTraceSurface(snap) {
        var s = snap && typeof snap === 'object' ? snap : {};
        var chain = need('memory-causal-chain-replay.js', 'LonShaMemoryCausalChainReplay');
        var bias = need('memory-bias-surface.js', 'LonShaMemoryBiasSurface');
        var commit = need('commitment-followthrough.js', 'LonShaCommitmentFollowthrough');
        var forget = need('forgetting-explanation.js', 'LonShaForgettingExplanation');
        var conflict = need('memory-conflict-bench.js', 'LonShaMemoryConflictBench');
        var rank = need('recall-ranking-explain.js', 'LonShaRecallRankingExplain');
        var revise = need('memory-revision-history.js', 'LonShaMemoryRevisionHistory');
        var water = need('memory-capacity-watermark.js', 'LonShaMemoryCapacityWatermark');
        var cross = need('cross-session-continuation.js', 'LonShaCrossSessionContinuation');

        var absent = [];
        function used(name, mod) { if (!mod) absent.push(name); return !!mod; }

        var out = {
            face: 'surface',
            absent: absent,
            causal: { face: 'insufficient', reason: 'module-absent' },
            bias: { face: 'insufficient', reason: 'module-absent' },
            commitments: { face: 'empty' },
            forgetting: { face: 'insufficient', reason: 'no-input' },
            conflicts: { face: 'invalid' },
            ranking: { face: 'empty', items: [] },
            revisions: { face: 'empty', items: [] },
            capacity: { face: 'invalid', reason: 'no-input' },
            continuation: { face: 'insufficient', reason: 'no-claims' }
        };

        if (used('causal', chain) && Array.isArray(s.causalChain)) out.causal = safe(function () { return chain.replayChain(s.causalChain); }, out.causal);
        if (used('bias', bias) && s.perspectiveA && s.perspectiveB) out.bias = safe(function () { return bias.compareBias(s.perspectiveA, s.perspectiveB); }, out.bias);
        if (used('commitments', commit)) out.commitments = safe(function () { return commit.trackCommitments(Array.isArray(s.commitments) ? s.commitments : [], s.floor); }, out.commitments);
        if (used('forgetting', forget) && s.forgetting) out.forgetting = safe(function () { return forget.explainForgetting(s.forgetting); }, out.forgetting);
        if (used('conflicts', conflict) && s.conflict) out.conflicts = safe(function () { return conflict.proposeResolutions(s.conflict); }, out.conflicts);
        if (used('ranking', rank) && Array.isArray(s.recallCandidates)) out.ranking = safe(function () { return rank.explainRanking(s.recallCandidates, { weights: s.recallWeights }); }, out.ranking);
        if (used('revisions', revise) && Array.isArray(s.revisions)) out.revisions = safe(function () { return revise.revisionChain(s.revisions); }, out.revisions);
        if (used('capacity', water) && s.capacity) out.capacity = safe(function () { return water.forecastCapacity(s.capacity); }, out.capacity);
        if (used('continuation', cross) && s.continuation) out.continuation = safe(function () { return cross.proveContinuation(s.continuation); }, out.continuation);

        out.face = absent.length > 0 ? 'partial' : 'surface';
        return out;
    }

    function selfCheck() {
        var bad = [];
        var surface = buildTraceSurface({
            floor: 100,
            commitments: [{ id: 'a', dueFloor: 50 }],
            recallCandidates: [{ id: 'x', scores: { vector: 1, recency: 1, significance: null, graph: 1 } }],
            revisions: [{ id: 'v1' }],
            causalChain: [{ fact: 'f', floor: 10, source: { floor: 2 } }]
        });
        if (surface.face !== 'surface' && surface.face !== 'partial') bad.push('面态只能是 surface / partial');
        if (surface.commitments.face !== 'tracked') bad.push('承诺应 tracked');
        if (surface.ranking.face !== 'ranked') bad.push('排序应 ranked');
        if (surface.ranking.items[0].parts.significance !== 'unknown') bad.push('缺项仍须 unknown');
        if (surface.revisions.face !== 'single') bad.push('单版应 single');
        if (surface.causal.face !== 'traceable') bad.push('锚齐全应 traceable');
        if (surface.absent.length !== 0) bad.push('九桥都必须在场，absent 应为空');
        var empty = buildTraceSurface(null);
        if (empty.face !== 'surface') bad.push('九桥在场时面态应为 surface');
        for (var k in empty) {
            if (k === 'face' || k === 'absent') continue;
            if (!empty[k] || typeof empty[k].face !== 'string') bad.push('空快照下 ' + k + ' 必须自出三态');
        }
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { buildTraceSurface: buildTraceSurface, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryTraceSurface = api;
})(typeof window !== 'undefined' ? window : globalThis);