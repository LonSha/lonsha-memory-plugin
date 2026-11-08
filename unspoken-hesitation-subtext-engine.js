/* ============================================================
 * unspoken-hesitation-subtext-engine.js — [v3.460.0 · 第十六期心智引擎]
 * 欲言又止与潜台词心机引擎 (Unspoken Hesitation & Subtext Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 角色在真实人际博弈或深情时刻，往往“话到嘴边留半句”：
 *   - 有些话想说却怕打破现状、怕对方反感或怕过早袒露底牌；
 *   - 本引擎捕捉当前未完全说破的“隐秘心意(Subtext)”与“犹豫顾虑(Hesitation)”，
 *     在角色回复中注入细腻的眼神回避、停顿与未尽之意。
 *
 * 【体验纪律】
 * 严禁技术黑话，面向玩家只输出生活化提示词：
 *   如 [话到嘴边又咽下]、[想问又怕显得唐突]、[眼神有些游移]
 *
 * 挂载：LonShaUnspokenHesitation / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaUnspokenHesitation = factory();
        root.UnspokenHesitationEngine = root.LonShaUnspokenHesitation;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.460.0';

    function createState() {
        return {
            version: VERSION,
            hesitationCount: 0,
            pendingThoughts: [], // 未完全说出口的心声
            updatedAt: Date.now()
        };
    }

    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            hesitationCount: Number(raw.hesitationCount) || 0,
            pendingThoughts: Array.isArray(raw.pendingThoughts) ? raw.pendingThoughts.slice() : [],
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    function addHesitation(state, topic = '', reason = '') {
        const s = hydrateState(state);
        s.hesitationCount += 1;
        if (topic) {
            s.pendingThoughts.push({ topic, reason: reason || '有些顾虑尚未挑明', at: Date.now() });
            if (s.pendingThoughts.length > 5) s.pendingThoughts.shift();
        }
        s.updatedAt = Date.now();
        return s;
    }

    function generateHesitationDirectives(state) {
        const s = hydrateState(state);
        if (s.pendingThoughts.length === 0) return '';
        const latest = s.pendingThoughts[s.pendingThoughts.length - 1];
        return `[话到嘴边又咽下] 其实心里很想聊关于“${latest.topic}”，但因为“${latest.reason}”，在嘴边顿了顿没直接挑明，回答时带着隐隐的停顿或眼神微移。`;
    }

    return {
        VERSION,
        createState,
        hydrateState,
        addHesitation,
        generateHesitationDirectives
    };
}));