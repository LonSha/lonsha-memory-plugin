/* ========================================================
 * memory-revisit-schedule.js — [L14-X9] 可挑选的记忆回访日程
 * --------------------------------------------------------
 * 只读回访卡与主题序列；浏览/暂缓不生成事实，不替角色发言。
 * ======================================================== */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemoryRevisitSchedule = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CARD_TYPES = Object.freeze({
        COMMEMORATION: 'commemoration',
        FAREWELL: 'farewell',
        REVISIT: 'revisit',
        DEFER: 'defer'
    });
    const EVENT_ACTIONS = Object.freeze({ VIEWED: 'viewed', DEFERRED: 'deferred' });

    function safeStr(value) { return String(value == null ? '' : value).trim(); }
    function safeArr(value) { return Array.isArray(value) ? value : []; }
    function itemId(item) { return safeStr(item && (item.id || item.topicId || item.factKey)); }
    function sourceOf(item) {
        const source = item && (item.source || item.evidence || item.origin);
        if (source && typeof source === 'object') {
            return {
                sourceId: safeStr(source.sourceId || source.id || source.ref),
                quote: safeStr(source.quote || source.text || source.content)
            };
        }
        return {
            sourceId: safeStr(item && (item.sourceId || item.sourceRef || item.fp)),
            quote: safeStr(item && (item.quote || item.excerpt || item.sourceText || item.content))
        };
    }
    function normalizeType(value) {
        return Object.values(CARD_TYPES).includes(value) ? value : CARD_TYPES.REVISIT;
    }
    function isMuted(id, seasonState) {
        return Boolean(seasonState && seasonState.userActions && seasonState.userActions[id] === 'mute');
    }

    function buildRevisitCards(items, seasonState = {}, options = {}) {
        const cards = [];
        const rejected = [];
        const muted = [];
        for (const raw of safeArr(items)) {
            const id = itemId(raw);
            const source = sourceOf(raw);
            if (!id || !source.sourceId || !source.quote) {
                rejected.push({ id: id || null, reason: 'source-unavailable' });
                continue;
            }
            if (isMuted(id, seasonState)) {
                muted.push(id);
                continue;
            }
            cards.push({
                id,
                title: safeStr(raw.title || raw.summary) || '未命名回访主题',
                type: normalizeType(raw.revisitType || raw.type),
                source: Object.freeze({ ...source }),
                sourceRefs: [source.sourceId],
                theme: safeStr(raw.theme || raw.title || raw.summary),
                date: raw.date == null ? null : safeStr(raw.date),
                location: safeStr(raw.location),
                characterIds: safeArr(raw.characterIds || raw.characters).map(safeStr).filter(Boolean)
            });
        }
        const limit = Number.isFinite(Number(options.limit)) ? Math.max(0, Math.floor(Number(options.limit))) : Infinity;
        return {
            cards: cards.slice(0, limit),
            mutedTopicIds: muted,
            rejected,
            totalEligible: cards.length,
            truncated: Number.isFinite(limit) && cards.length > limit,
            writesNothing: true
        };
    }

    function createRevisitSession(cards, selectedIds, now = Date.now()) {
        const list = safeArr(cards);
        const ids = [...new Set(safeArr(selectedIds).map(safeStr).filter(Boolean))];
        if (!ids.length) return { success: false, reason: 'empty-selection' };
        const byId = new Map(list.map(card => [safeStr(card && card.id), card]));
        const unknownIds = ids.filter(id => !byId.has(id));
        if (unknownIds.length) return { success: false, reason: 'unknown-selection', unknownIds };
        const sequence = ids.map(id => byId.get(id));
        return {
            success: true,
            session: {
                id: `revisit_${now}_${Math.random().toString(36).slice(2, 8)}`,
                status: 'active',
                sequence,
                selectedIds: ids,
                receipts: [],
                createdAt: now,
                updatedAt: now
            }
        };
    }

    function recordRevisitEvent(session, cardId, action, evidenceRefs = [], now = Date.now()) {
        if (!session || typeof session !== 'object') return { success: false, reason: 'missing-session' };
        const id = safeStr(cardId);
        if (!safeArr(session.selectedIds).includes(id)) return { success: false, reason: 'card-not-selected' };
        if (!Object.values(EVENT_ACTIONS).includes(action)) return { success: false, reason: 'invalid-action' };
        const receipt = {
            cardId: id,
            action,
            evidenceRefs: [...new Set(safeArr(evidenceRefs).map(safeStr).filter(Boolean))],
            recordedAt: now,
            createsFact: false,
            generatesSpeech: false
        };
        return {
            success: true,
            receipt,
            session: {
                ...session,
                receipts: [...safeArr(session.receipts), receipt],
                updatedAt: now
            }
        };
    }

    function revisitScheduleSelfCheck() {
        const problems = [];
        if (Object.keys(CARD_TYPES).length !== 4) problems.push('CARD_TYPES 必须恰好为 4 类');
        if (Object.keys(EVENT_ACTIONS).length !== 2) problems.push('EVENT_ACTIONS 必须恰好为 2 类');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    return Object.freeze({
        CARD_TYPES,
        EVENT_ACTIONS,
        buildRevisitCards,
        createRevisitSession,
        recordRevisitEvent,
        revisitScheduleSelfCheck
    });
}));
