/* ========================================================
 * recall-correction.js — [M7-O3 · 第七期规划] 召回解释与用户校正内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   用户看到记忆回答漏掉例外或混入相似人物时，过去只能干瞪眼，无法把“答错原因”
 *   反馈到下一次查询；或者只能粗暴删除条目，造成历史事实丢失。
 *   召回解释与用户校正提供结构化解释与反馈闭环：
 *     ① 呈现可展开依据(evidences)、未命中候选(missedCandidates)与排除理由(exclusionReasons)；
 *     ② 支持五类结构化校正：错人(wrong_person) / 过期(outdated) / 无关(irrelevant) /
 *        反例(counter_example) / 缺少来源(missing_source)；
 *     ③ 校正精准作用于相关查询与实体的召回重排/过滤，而无关查询零退化；
 *     ④ 用户可随时撤销/清除校正，恢复初始召回行为。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 五类标准校正类型 */
    const CORRECTION_TYPES = Object.freeze({
        WRONG_PERSON: 'wrong_person',       // 错人：张冠李戴
        OUTDATED: 'outdated',               // 过期：事实已变迁
        IRRELEVANT: 'irrelevant',           // 无关：跑题检索
        COUNTER_EXAMPLE: 'counter_example', // 反例：存在特殊例外
        MISSING_SOURCE: 'missing_source'    // 缺少来源：凭空推测
    });

    /** 排除理由词表 */
    const EXCLUSION_REASONS = Object.freeze({
        BUDGET_TRIMMED: 'budget_trimmed',                     // 预算超额截断
        TEMPORAL_MISMATCH: 'temporal_mismatch',               // 时态不符（如当下查当时）
        VALIDITY_FILTERED: 'validity_filtered',               // 事实已撤销或无效
        USER_CORRECTION_FILTERED: 'user_correction_filtered', // 被用户校正规则命中过滤
        LOW_RELEVANCE: 'low_relevance'                        // 相关度低于阈值
    });

    /** 归因词表 */
    const CORRECTION_REASONS = Object.freeze({
        OK: '',
        INVALID_CORRECTION: 'invalid-correction',
        CORRECTION_NOT_FOUND: 'correction-not-found',
        MISSING_TARGET: 'missing-target'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }

    /**
     * 构建召回解释报告（依据展开 + 排除归因）
     * @param {Array<object>} keptCandidates 最终保留注入的候选
     * @param {Array<object>} droppedCandidates 被筛除的候选（含排除原因）
     * @param {object} meta 轮次元信息
     */
    function buildRecallExplanation(keptCandidates = [], droppedCandidates = [], meta = {}) {
        const evidences = (Array.isArray(keptCandidates) ? keptCandidates : []).map(c => Object.freeze({
            id: safeStr(c.id || c.factKey),
            factKey: safeStr(c.factKey),
            text: safeStr(c.text || c.content),
            sourceFloor: c.sourceFloor !== undefined ? c.sourceFloor : null,
            score: typeof c.score === 'number' ? c.score : 1.0,
            source: safeStr(c.source || 'default')
        }));

        const missed = (Array.isArray(droppedCandidates) ? droppedCandidates : []).map(d => Object.freeze({
            id: safeStr(d.id || d.factKey),
            factKey: safeStr(d.factKey),
            text: safeStr(d.text || d.content),
            reason: safeStr(d.reason) || EXCLUSION_REASONS.LOW_RELEVANCE
        }));

        return Object.freeze({
            query: safeStr(meta.query),
            floor: meta.floor !== undefined ? meta.floor : null,
            evidences: Object.freeze(evidences),
            missedCandidates: Object.freeze(missed),
            summary: Object.freeze({
                totalKept: evidences.length,
                totalMissed: missed.length
            })
        });
    }

    /**
     * 规范化单条用户校正记录
     */
    function normalizeUserCorrection(raw) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return null;
        }
        const id = safeStr(raw.id);
        const targetFactKey = safeStr(raw.targetFactKey);
        if (!id || !targetFactKey) return null;

        const validTypes = Object.values(CORRECTION_TYPES);
        const type = validTypes.includes(raw.type) ? raw.type : CORRECTION_TYPES.IRRELEVANT;

        const queryScope = safeStr(raw.queryScope).toLowerCase(); // 限制生效的查询关键词或主题
        const reason = safeStr(raw.reason);
        const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();

        return Object.freeze({
            id,
            targetFactKey,
            type,
            queryScope,
            reason,
            createdAt
        });
    }

    /**
     * 规范化校正账本
     */
    function normalizeCorrectionLedger(raw) {
        if (!raw || typeof raw !== 'object') return Object.freeze([]);
        const list = Array.isArray(raw) ? raw : (Array.isArray(raw.corrections) ? raw.corrections : []);
        const result = [];
        const seenIds = new Set();
        for (const item of list) {
            const norm = normalizeUserCorrection(item);
            if (norm && !seenIds.has(norm.id)) {
                seenIds.add(norm.id);
                result.push(norm);
            }
        }
        return Object.freeze(result);
    }

    /**
     * 记录用户校正
     */
    function recordUserCorrection(ledger, draft, now = Date.now()) {
        const list = normalizeCorrectionLedger(ledger);
        const id = safeStr(draft.id) || ('uc_' + now + '_' + Math.random().toString(36).slice(2, 7));
        const norm = normalizeUserCorrection({
            ...draft,
            id,
            createdAt: now
        });
        if (!norm) {
            return { ok: false, why: CORRECTION_REASONS.INVALID_CORRECTION, nextLedger: list, correction: null };
        }
        const nextList = Object.freeze([norm, ...list.filter(c => c.id !== norm.id)]);
        return { ok: true, why: CORRECTION_REASONS.OK, nextLedger: nextList, correction: norm };
    }

    /**
     * 撤销用户校正
     */
    function revertCorrection(ledger, correctionId) {
        const list = normalizeCorrectionLedger(ledger);
        const targetId = safeStr(correctionId);
        const idx = list.findIndex(c => c.id === targetId);
        if (idx < 0) {
            return { ok: false, why: CORRECTION_REASONS.CORRECTION_NOT_FOUND, nextLedger: list };
        }
        const nextList = Object.freeze(list.filter(c => c.id !== targetId));
        return { ok: true, why: CORRECTION_REASONS.OK, nextLedger: nextList };
    }

    /**
     * 应用用户校正规则过滤/重排候选集
     * 核心契约：
     *   1. 仅当 query 命中校正条目的 queryScope（若指定）时才应用该校正；
     *   2. 命中 wrong_person 或 irrelevant 时，从候选集中排除该条目并记录排除原因；
     *   3. 无关查询零退化：若 query 与校正主题无关，原有候选集不受任何影响。
     */
    function applyUserCorrections(candidates = [], query = '', ledger = []) {
        const list = Array.isArray(candidates) ? candidates : [];
        const corrections = normalizeCorrectionLedger(ledger);
        const q = safeStr(query).toLowerCase();

        if (corrections.length === 0 || list.length === 0) {
            return {
                admitted: Object.freeze([...list]),
                dropped: Object.freeze([])
            };
        }

        const activeCorrections = corrections.filter(c => {
            if (!c.queryScope) return true; // 全局适用
            return q.includes(c.queryScope);
        });

        if (activeCorrections.length === 0) {
            // 无关查询零退化：直接原样返回
            return {
                admitted: Object.freeze([...list]),
                dropped: Object.freeze([])
            };
        }

        const excludedKeys = new Map();
        for (const c of activeCorrections) {
            if (c.type === CORRECTION_TYPES.WRONG_PERSON || c.type === CORRECTION_TYPES.IRRELEVANT || c.type === CORRECTION_TYPES.OUTDATED) {
                excludedKeys.set(c.targetFactKey, c);
            }
        }

        const admitted = [];
        const dropped = [];

        for (const item of list) {
            const key = safeStr(item.factKey || item.id);
            if (excludedKeys.has(key)) {
                const matchCorrection = excludedKeys.get(key);
                dropped.push(Object.freeze({
                    ...item,
                    reason: EXCLUSION_REASONS.USER_CORRECTION_FILTERED,
                    correctionType: matchCorrection.type,
                    correctionReason: matchCorrection.reason
                }));
            } else {
                admitted.push(item);
            }
        }

        return {
            admitted: Object.freeze(admitted),
            dropped: Object.freeze(dropped)
        };
    }

    /**
     * 自检函数
     */
    function recallCorrectionSelfCheck() {
        const problems = [];
        if (Object.keys(CORRECTION_TYPES).length !== 5) problems.push('CORRECTION_TYPES 必须恰好为 5 类');
        if (Object.keys(EXCLUSION_REASONS).length !== 5) problems.push('EXCLUSION_REASONS 必须包含 5 种原因');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        CORRECTION_TYPES,
        EXCLUSION_REASONS,
        CORRECTION_REASONS,
        buildRecallExplanation,
        normalizeUserCorrection,
        normalizeCorrectionLedger,
        recordUserCorrection,
        revertCorrection,
        applyUserCorrections,
        recallCorrectionSelfCheck
    });

    root.LonShaRecallCorrection = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);