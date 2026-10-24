/* ========================================================
 * memory-inbox.js — [M7-O1 · 第七期规划] 记忆收件箱内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   长对话结束后，系统自动提取的内容如果是隐式写入事实库，用户将无法掌控
 *   哪些是真实事实、哪些是主观偏好、哪些是模型推测、哪些产生了冲突。
 *   记忆收件箱提供面向用户的候审与修订闭环：
 *     ① 将候选记忆分为事实(fact)、偏好(preference)、关系(relationship)、承诺(commitment)四类；
 *     ② 显示来源楼层(sourceFloor)、推断标记(inferred)、置信度(confidence)与冲突检测(conflictKey)；
 *     ③ 支持确认(confirm)、改写(rewrite)、暂存(stage)、拒绝(reject)五态流转；
 *     ④ 消费侧契约：确认/改写后方可被下游召回与注入，拒绝后打上负面抑制标记绝不注入。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 候选记忆四大分类 */
    const MEMORY_INBOX_KINDS = Object.freeze({
        FACT: 'fact',
        PREFERENCE: 'preference',
        RELATIONSHIP: 'relationship',
        COMMITMENT: 'commitment'
    });

    /** 收件箱条目审核五大状态 */
    const MEMORY_INBOX_STATUS = Object.freeze({
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        REWRITTEN: 'rewritten',
        STAGED: 'staged',
        REJECTED: 'rejected'
    });

    /** 归因词表 */
    const MEMORY_INBOX_REASONS = Object.freeze({
        OK: '',
        INVALID_ITEM: 'invalid-item',
        ITEM_NOT_FOUND: 'item-not-found',
        UNKNOWN_STATUS: 'unknown-status',
        ALREADY_PROCESSED: 'already-processed',
        EMPTY_CONTENT: 'empty-content',
        NO_STORAGE: 'no-storage',
        WRITE_THREW: 'write-threw'
    });

    const MAX_INBOX_ITEMS = 200;

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeNum(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * 规范化单个收件箱条目
     */
    function normalizeMemoryInboxItem(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        const id = safeStr(raw.id || raw.itemId);
        if (!id) return null;

        const validKinds = Object.values(MEMORY_INBOX_KINDS);
        const kind = validKinds.includes(raw.kind) ? raw.kind : MEMORY_INBOX_KINDS.FACT;

        const content = safeStr(raw.content);
        if (!content) return null;

        const originalDraft = safeStr(raw.originalDraft) || content;
        const sourceFloor = safeNum(raw.sourceFloor, null);
        const inferred = Boolean(raw.inferred);
        const confidence = Math.max(0, Math.min(1, safeNum(raw.confidence, 0.8)));

        const conflictKey = safeStr(raw.conflictKey);
        const conflictsWith = Array.isArray(raw.conflictsWith) ? raw.conflictsWith.map(safeStr).filter(Boolean) : [];

        const validStatuses = Object.values(MEMORY_INBOX_STATUS);
        const status = validStatuses.includes(raw.status) ? raw.status : MEMORY_INBOX_STATUS.PENDING;

        const createdAt = safeNum(raw.createdAt, Date.now());
        const updatedAt = safeNum(raw.updatedAt, createdAt);
        const rejectionReason = safeStr(raw.rejectionReason);

        return Object.freeze({
            id,
            kind,
            content,
            originalDraft,
            sourceFloor,
            inferred,
            confidence,
            conflictKey,
            conflictsWith: Object.freeze(conflictsWith),
            status,
            rejectionReason,
            createdAt,
            updatedAt
        });
    }

    /**
     * 规范化收件箱列表
     */
    function normalizeMemoryInbox(raw) {
        if (!raw || typeof raw !== 'object') return Object.freeze([]);
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw.items) ? raw.items : []);
        const result = [];
        const seenIds = new Set();
        for (const item of list) {
            const norm = normalizeMemoryInboxItem(item);
            if (norm && !seenIds.has(norm.id)) {
                seenIds.add(norm.id);
                result.push(norm);
                if (result.length >= MAX_INBOX_ITEMS) break;
            }
        }
        return Object.freeze(result);
    }

    /**
     * 准入新候选记忆条目
     */
    function admitCandidate(inbox, draft, now = Date.now()) {
        const list = normalizeMemoryInbox(inbox);
        const norm = normalizeMemoryInboxItem({
            ...draft,
            id: safeStr(draft.id) || ('mi_' + now + '_' + Math.random().toString(36).slice(2, 7)),
            status: MEMORY_INBOX_STATUS.PENDING,
            createdAt: now,
            updatedAt: now
        });
        if (!norm) {
            return { ok: false, why: MEMORY_INBOX_REASONS.INVALID_ITEM, item: null, nextInbox: list };
        }

        // 去重：若内容完全一致且已在待处理列表中，则幂等返回
        const existing = list.find(it => it.id === norm.id || (it.content === norm.content && it.kind === norm.kind));
        if (existing) {
            return { ok: true, why: 'replayed', item: existing, nextInbox: list };
        }

        const nextInbox = Object.freeze([norm, ...list].slice(0, MAX_INBOX_ITEMS));
        return { ok: true, why: MEMORY_INBOX_REASONS.OK, item: norm, nextInbox };
    }

    /**
     * 用户确认采纳条目
     */
    function confirmItem(inbox, itemId, now = Date.now()) {
        const list = normalizeMemoryInbox(inbox);
        const targetId = safeStr(itemId);
        const idx = list.findIndex(it => it.id === targetId);
        if (idx < 0) {
            return { ok: false, why: MEMORY_INBOX_REASONS.ITEM_NOT_FOUND, nextInbox: list, item: null };
        }
        const updated = Object.freeze({
            ...list[idx],
            status: MEMORY_INBOX_STATUS.CONFIRMED,
            updatedAt: now
        });
        const nextList = [...list];
        nextList[idx] = updated;
        return { ok: true, why: MEMORY_INBOX_REASONS.OK, nextInbox: Object.freeze(nextList), item: updated };
    }

    /**
     * 用户改写后采纳条目
     */
    function rewriteItem(inbox, itemId, newContent, now = Date.now()) {
        const list = normalizeMemoryInbox(inbox);
        const targetId = safeStr(itemId);
        const cleanedContent = safeStr(newContent);
        if (!cleanedContent) {
            return { ok: false, why: MEMORY_INBOX_REASONS.EMPTY_CONTENT, nextInbox: list, item: null };
        }
        const idx = list.findIndex(it => it.id === targetId);
        if (idx < 0) {
            return { ok: false, why: MEMORY_INBOX_REASONS.ITEM_NOT_FOUND, nextInbox: list, item: null };
        }
        const target = list[idx];
        const updated = Object.freeze({
            ...target,
            content: cleanedContent,
            originalDraft: target.originalDraft || target.content,
            status: MEMORY_INBOX_STATUS.REWRITTEN,
            updatedAt: now
        });
        const nextList = [...list];
        nextList[idx] = updated;
        return { ok: true, why: MEMORY_INBOX_REASONS.OK, nextInbox: Object.freeze(nextList), item: updated };
    }

    /**
     * 用户暂存条目
     */
    function stageItem(inbox, itemId, now = Date.now()) {
        const list = normalizeMemoryInbox(inbox);
        const targetId = safeStr(itemId);
        const idx = list.findIndex(it => it.id === targetId);
        if (idx < 0) {
            return { ok: false, why: MEMORY_INBOX_REASONS.ITEM_NOT_FOUND, nextInbox: list, item: null };
        }
        const updated = Object.freeze({
            ...list[idx],
            status: MEMORY_INBOX_STATUS.STAGED,
            updatedAt: now
        });
        const nextList = [...list];
        nextList[idx] = updated;
        return { ok: true, why: MEMORY_INBOX_REASONS.OK, nextInbox: Object.freeze(nextList), item: updated };
    }

    /**
     * 用户拒绝采纳条目
     */
    function rejectItem(inbox, itemId, reason = '', now = Date.now()) {
        const list = normalizeMemoryInbox(inbox);
        const targetId = safeStr(itemId);
        const idx = list.findIndex(it => it.id === targetId);
        if (idx < 0) {
            return { ok: false, why: MEMORY_INBOX_REASONS.ITEM_NOT_FOUND, nextInbox: list, item: null };
        }
        const target = list[idx];
        const updated = Object.freeze({
            ...target,
            status: MEMORY_INBOX_STATUS.REJECTED,
            rejectionReason: safeStr(reason) || '用户拒绝',
            updatedAt: now
        });
        const nextList = [...list];
        nextList[idx] = updated;
        return { ok: true, why: MEMORY_INBOX_REASONS.OK, nextInbox: Object.freeze(nextList), item: updated };
    }

    /**
     * 消费侧过滤契约：获取可召回的有效记忆（已确认或已改写）
     */
    function filterAdmittedForRecall(inbox) {
        const list = normalizeMemoryInbox(inbox);
        return list.filter(it => it.status === MEMORY_INBOX_STATUS.CONFIRMED || it.status === MEMORY_INBOX_STATUS.REWRITTEN);
    }

    /**
     * 消费侧过滤契约：获取已被拒绝的记忆（用于上下文注入抑制，绝不注入）
     */
    function filterRejectedForSuppression(inbox) {
        const list = normalizeMemoryInbox(inbox);
        return list.filter(it => it.status === MEMORY_INBOX_STATUS.REJECTED);
    }

    /**
     * 自检函数
     */
    function memoryInboxSelfCheck() {
        const problems = [];
        if (Object.keys(MEMORY_INBOX_KINDS).length !== 4) problems.push('MEMORY_INBOX_KINDS 必须恰好为 4 种类型');
        if (Object.keys(MEMORY_INBOX_STATUS).length !== 5) problems.push('MEMORY_INBOX_STATUS 必须恰好为 5 态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        MEMORY_INBOX_KINDS,
        MEMORY_INBOX_STATUS,
        MEMORY_INBOX_REASONS,
        MAX_INBOX_ITEMS,
        normalizeMemoryInboxItem,
        normalizeMemoryInbox,
        admitCandidate,
        confirmItem,
        rewriteItem,
        stageItem,
        rejectItem,
        filterAdmittedForRecall,
        filterRejectedForSuppression,
        memoryInboxSelfCheck
    });

    root.LonShaMemoryInbox = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);