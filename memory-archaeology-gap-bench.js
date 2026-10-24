/* ============================================================
 * memory-archaeology-gap-bench.js — [L9-X3 · 第九期规划]
 * 记忆考古与证据缺口路线探索器（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   从残缺线索、互相矛盾的记录与证据空缺出发，构建考古线索树：
 *     - 明确区分四种状态：KNOWN (已知事实), UNKNOWN (已知缺口/待探索),
 *       HYPOTHESIS (推测假设), FALSE_LEAD (已证伪线索)
 *     - "未找到" 绝不被系统自动断言为 "从未发生"
 *     - FALSE_LEAD 作为探索路径被保留回溯，但严格禁止作为有效事实注入正史
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MemoryArchaeologyGapBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CLUE_STATUS = Object.freeze({
        KNOWN: 'known',
        UNKNOWN_GAP: 'unknown_gap',
        HYPOTHESIS: 'hypothesis',
        FALSE_LEAD: 'false_lead'
    });

    function createArchaeologyRoute(rootGoal, initialClues = []) {
        const clues = (Array.isArray(initialClues) ? initialClues : []).map(c => ({
            id: c.id || `clue_${Math.random().toString(36).slice(2, 7)}`,
            title: String(c.title || '').trim(),
            status: Object.values(CLUE_STATUS).includes(c.status) ? c.status : CLUE_STATUS.UNKNOWN_GAP,
            evidenceIds: Array.isArray(c.evidenceIds) ? c.evidenceIds : [],
            notes: c.notes || ''
        }));

        return {
            routeId: `arch_route_${Date.now()}`,
            rootGoal: String(rootGoal || '').trim(),
            clues,
            createdAt: Date.now()
        };
    }

    function verifyClueAdmission(clue) {
        if (!clue) return { allowed: false, reason: 'nil_clue' };
        if (clue.status === CLUE_STATUS.FALSE_LEAD) {
            return {
                allowed: false,
                reason: 'false_lead_strictly_forbidden_from_canon'
            };
        }
        if (clue.status === CLUE_STATUS.KNOWN && clue.evidenceIds.length > 0) {
            return {
                allowed: true,
                reason: 'verified_known_fact'
            };
        }
        return {
            allowed: false,
            reason: 'unverified_gap_or_hypothesis'
        };
    }

    return {
        CLUE_STATUS,
        createArchaeologyRoute,
        verifyClueAdmission
    };
}));