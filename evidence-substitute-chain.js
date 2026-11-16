/**
 * evidence-substitute-chain.js — 替代证据链 —— 唯一桥（v3.472.0 · L22-O4）
 *
 * 纪律：纯函数。当一条结论缺直接证据时，给「替代证据链」：按可信度降序的候选证据，
 * 明说缺了哪一环（direct 缺席），不把替代当直接。四态：invalid / none / direct / substitute。
 */
(function (global) {
    'use strict';

    var FACES = ['invalid', 'none', 'direct', 'substitute'];
    var TIERS = ['direct', 'corroborate', 'circumstantial', 'hearsay'];

    function buildChain(claim) {
        if (!claim || typeof claim !== 'object') return { face: 'invalid', chain: [], missing: [] };
        var evidences = Array.isArray(claim.evidences) ? claim.evidences.filter(function (e) { return e && typeof e === 'object'; }) : [];
        if (evidences.length === 0) return { face: 'none', chain: [], missing: ['direct'] };
        var chain = [];
        var hasDirect = false;
        for (var i = 0; i < evidences.length; i++) {
            var e = evidences[i];
            var tier = String(e.tier == null ? '' : e.tier);
            var rank = TIERS.indexOf(tier);
            if (rank < 0) continue;
            if (tier === 'direct') hasDirect = true;
            chain.push({ tier: tier, rank: rank, source: String(e.source == null ? '' : e.source) });
        }
        chain.sort(function (a, b) { return a.rank - b.rank; });
        var missing = hasDirect ? [] : ['direct'];
        var face = chain.length === 0 ? 'none' : (hasDirect ? 'direct' : 'substitute');
        return { face: face, chain: chain, missing: missing };
    }

    function chainNote(r) {
        if (!r) return '读不出证据链';
        if (r.face === 'invalid') return '证据读不出来';
        if (r.face === 'none') return '没有任何证据';
        if (r.face === 'direct') return '有直接证据';
        return '只有替代证据（' + r.chain.length + ' 条），缺直接证据';
    }

    function selfCheck() {
        var bad = [];
        if (buildChain(null).face !== 'invalid') bad.push('空应 invalid');
        if (buildChain({ evidences: [] }).face !== 'none') bad.push('无证据应 none');
        var direct = buildChain({ evidences: [{ tier: 'direct', source: 'a' }, { tier: 'hearsay', source: 'b' }] });
        if (direct.face !== 'direct') bad.push('有直接应 direct');
        if (direct.chain[0].tier !== 'direct') bad.push('应直接证据排首');
        var sub = buildChain({ evidences: [{ tier: 'hearsay', source: 'b' }, { tier: 'corroborate', source: 'c' }] });
        if (sub.face !== 'substitute') bad.push('无直接应 substitute');
        if (sub.missing.indexOf('direct') < 0) bad.push('应明说缺直接证据');
        if (sub.chain[0].tier !== 'corroborate') bad.push('应按可信度降序');
        return { ok: bad.length === 0, bad: bad };
    }

    var api = { FACES: FACES, TIERS: TIERS, buildChain: buildChain, chainNote: chainNote, selfCheck: selfCheck };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaEvidenceSubstituteChain = api;
})(typeof window !== 'undefined' ? window : globalThis);
