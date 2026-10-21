/**
 * research-collection.js — [v3.353.0 · M5-X9] 跨资料专题的证据集合与可追溯结论
 * 纯函数 IIFE，零依赖。挂 window.LonShaResearchCollection。
 *
 * 让用户选定资料集合和研究问题，收拢支持/反证/待确认段落及结论引用。
 * 结论仅是研究草稿，重新打开可回源复核。不复制全文，只存引用。
 */
(function (root) {
    'use strict';
    var VERSION = 1;
    var MAX_COLLECTIONS = 10;
    var MAX_CITATIONS = 60;
    var MAX_CONCLUSIONS = 20;

    function text(v, max) {
        var s = String(v == null ? '' : v).trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }

    var CITE_TYPES = Object.freeze(['supporting', 'contradicting', 'pending', 'personal-note']);
    var COLL_STATES = Object.freeze(['open', 'reviewing', 'closed', 'archived']);

    function normalizeCitation(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var source = text(raw.source, 80);
        var ref = text(raw.ref || raw.reference, 120);
        if (!source && !ref) return null;
        var type = CITE_TYPES.indexOf(raw.type) >= 0 ? raw.type : 'pending';
        return {
            id: text(raw.id, 60),
            source: source, ref: ref, type: type,
            character: text(raw.character, 40),
            note: text(raw.note, 200),
            floor: raw.floor != null ? raw.floor : null
        };
    }

    function normalizeConclusion(raw) {
        if (!raw || typeof raw !== 'object') return null;
        var content = text(raw.content || raw.text, 500);
        if (!content) return null;
        return {
            id: text(raw.id, 60),
            content: content,
            citations: Array.isArray(raw.citations) ? raw.citations.slice(0, MAX_CITATIONS) : [],
            isPersonalOpinion: !!raw.isPersonalOpinion,
            needsReview: !!raw.needsReview
        };
    }

    function normalize(raw) {
        var o = raw && typeof raw === 'object' ? raw : {};
        var list = Array.isArray(o.collections) ? o.collections : [];
        var out = { version: VERSION, collections: [], malformed: 0 };
        for (var i = 0; i < list.length && out.collections.length < MAX_COLLECTIONS; i++) {
            var c = list[i];
            if (!c || typeof c !== 'object') { out.malformed++; continue; }
            var citations = (Array.isArray(c.citations) ? c.citations : []).map(normalizeCitation).filter(Boolean);
            var conclusions = (Array.isArray(c.conclusions) ? c.conclusions : []).map(normalizeConclusion).filter(Boolean);
            out.collections.push({
                id: text(c.id, 60) || ('rsrch_' + (out.collections.length + 1)),
                title: text(c.title, 120),
                question: text(c.question, 200),
                sources: Array.isArray(c.sources) ? c.sources.slice(0, 20) : [],
                citations: citations.slice(0, MAX_CITATIONS),
                conclusions: conclusions.slice(0, MAX_CONCLUSIONS),
                state: COLL_STATES.indexOf(c.state) >= 0 ? c.state : 'open',
                createdAt: c.createdAt || 0
            });
        }
        return out;
    }

    function createCollection(rawState, input) {
        var state = normalize(rawState);
        if (state.collections.length >= MAX_COLLECTIONS) return { ok: false, reason: 'capacity', state: state };
        var c = {
            id: text(input && input.id, 60) || ('rsrch_' + (state.collections.length + 1)),
            title: text(input && input.title, 120) || '未命名专题',
            question: text(input && input.question, 200),
            sources: Array.isArray(input && input.sources) ? input.sources.slice(0, 20) : [],
            citations: [], conclusions: [],
            state: 'open', createdAt: Date.now()
        };
        state.collections.push(c);
        return { ok: true, state: state, collection: c, changed: true };
    }

    function addCitation(rawState, collId, citation) {
        var state = normalize(rawState);
        var c = state.collections.find(function(x) { return x.id === collId; });
        if (!c) return { ok: false, reason: 'not-found', state: state };
        var cite = normalizeCitation(citation);
        if (!cite) return { ok: false, reason: 'bad-citation', state: state };
        cite.id = cite.id || ('cite_' + (c.citations.length + 1));
        c.citations.push(cite);
        if (c.citations.length > MAX_CITATIONS) c.citations = c.citations.slice(-MAX_CITATIONS);
        return { ok: true, state: state, citation: cite, changed: true };
    }

    function addConclusion(rawState, collId, conclusion) {
        var state = normalize(rawState);
        var c = state.collections.find(function(x) { return x.id === collId; });
        if (!c) return { ok: false, reason: 'not-found', state: state };
        var con = normalizeConclusion(conclusion);
        if (!con) return { ok: false, reason: 'bad-conclusion', state: state };
        con.id = con.id || ('con_' + (c.conclusions.length + 1));
        c.conclusions.push(con);
        if (c.conclusions.length > MAX_CONCLUSIONS) c.conclusions = c.conclusions.slice(-MAX_CONCLUSIONS);
        return { ok: true, state: state, conclusion: con, changed: true };
    }

    function markReviewNeeded(rawState, collId, sourceRemoved) {
        var state = normalize(rawState);
        var c = state.collections.find(function(x) { return x.id === collId; });
        if (!c) return { ok: false, reason: 'not-found', state: state };
        var marked = 0;
        for (var i = 0; i < c.conclusions.length; i++) {
            var con = c.conclusions[i];
            if (con.citations && con.citations.indexOf(sourceRemoved) >= 0) {
                con.needsReview = true;
                marked++;
            }
        }
        return { ok: true, state: state, marked: marked, changed: marked > 0 };
    }

    function closeCollection(rawState, collId) {
        var state = normalize(rawState);
        var c = state.collections.find(function(x) { return x.id === collId; });
        if (!c) return { ok: false, reason: 'not-found', state: state };
        c.state = 'closed';
        return { ok: true, state: state, changed: true };
    }

    function line(state) {
        var s = normalize(state);
        if (!s.collections.length) return '暂无研究专题';
        var open = 0, reviewing = 0, closed = 0;
        var totalCites = 0, totalCons = 0;
        for (var i = 0; i < s.collections.length; i++) {
            var st = s.collections[i].state;
            if (st === 'open') open++;
            else if (st === 'reviewing') reviewing++;
            else if (st === 'closed') closed++;
            totalCites += (s.collections[i].citations || []).length;
            totalCons += (s.collections[i].conclusions || []).length;
        }
        return '专题 ' + s.collections.length + ' · 开放 ' + open + ' · 关闭 ' + closed + ' · 引用 ' + totalCites + ' · 结论 ' + totalCons;
    }

    var api = {
        VERSION: VERSION, MAX_COLLECTIONS: MAX_COLLECTIONS, MAX_CITATIONS: MAX_CITATIONS,
        MAX_CONCLUSIONS: MAX_CONCLUSIONS, CITE_TYPES: CITE_TYPES, COLL_STATES: COLL_STATES,
        normalize: normalize, createCollection: createCollection,
        addCitation: addCitation, addConclusion: addConclusion,
        markReviewNeeded: markReviewNeeded, closeCollection: closeCollection,
        line: line
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaResearchCollection = Object.freeze(api); } catch (_e) {}
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);