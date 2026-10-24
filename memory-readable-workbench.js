/* ========================================================
 * memory-readable-workbench.js — [M8-O9 · 第八期规划] 记忆可读工作台（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决用户进入插件后面对海量内部指标、模块名和工程审计术语产生认知压迫的问题：
 *     ① 四大首层任务卡：待确认提议（pendingProposals）/ 待裁决冲突（conflicts）/
 *        时效需复核（temporalReviews）/ 边界风险（boundaryRisks）；
 *     ② 动作指引与工作位置记忆：记录用户上次处理断点，重开后不丢失；
 *     ③ 结构化可读概览输出；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const WORKBENCH_CARD_TYPES = Object.freeze({
        PENDING_PROPOSAL: 'pending_proposal',
        UNRESOLVED_CONFLICT: 'unresolved_conflict',
        TEMPORAL_REVIEW: 'temporal_review',
        BOUNDARY_RISK: 'boundary_risk'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeWorkbenchState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                lastResumedCardId: null,
                dismissedCardIds: [],
                updatedAt: Date.now()
            };
        }
        return {
            lastResumedCardId: safeStr(raw.lastResumedCardId) || null,
            dismissedCardIds: safeArr(raw.dismissedCardIds).map(safeStr).filter(Boolean),
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 汇编当前插件的直观可读任务清单
     */
    function assembleReadableDashboard(state, sources = {}) {
        const s = normalizeWorkbenchState(state);
        const dismissedSet = new Set(s.dismissedCardIds);

        const proposals = safeArr(sources.proposals);
        const conflicts = safeArr(sources.conflicts);
        const temporalItems = safeArr(sources.temporalItems);
        const risks = safeArr(sources.risks);

        const cards = [];

        // 1. 待确认提议卡
        for (const p of proposals) {
            const cardId = `card_prop_${p.id || p.factKey}`;
            if (dismissedSet.has(cardId)) continue;
            cards.push({
                cardId,
                type: WORKBENCH_CARD_TYPES.PENDING_PROPOSAL,
                title: '发现待确认事实提议',
                summary: safeStr(p.content || p.summary),
                actionLabel: '前往核准/驳回',
                sourceRef: p.id || p.factKey
            });
        }

        // 2. 待裁决冲突卡
        for (const c of conflicts) {
            const cardId = `card_conf_${c.id || c.conflictKey}`;
            if (dismissedSet.has(cardId)) continue;
            cards.push({
                cardId,
                type: WORKBENCH_CARD_TYPES.UNRESOLVED_CONFLICT,
                title: '存在互相矛盾的历史记载',
                summary: safeStr(c.description || c.topic || '多方陈述存在矛盾'),
                actionLabel: '前往裁决台',
                sourceRef: c.id || c.conflictKey
            });
        }

        // 3. 时效需复核卡
        for (const t of temporalItems) {
            const cardId = `card_temp_${t.id}`;
            if (dismissedSet.has(cardId)) continue;
            cards.push({
                cardId,
                type: WORKBENCH_CARD_TYPES.TEMPORAL_REVIEW,
                title: '条目进入失效或需复核窗口',
                summary: safeStr(t.content || t.title),
                actionLabel: '确认时效',
                sourceRef: t.id
            });
        }

        // 4. 边界风险卡
        for (const r of risks) {
            const cardId = `card_risk_${r.id}`;
            if (dismissedSet.has(cardId)) continue;
            cards.push({
                cardId,
                type: WORKBENCH_CARD_TYPES.BOUNDARY_RISK,
                title: '跨角色/跨项目知情边界提示',
                summary: safeStr(r.description || r.warning),
                actionLabel: '审阅知情范围',
                sourceRef: r.id
            });
        }

        return {
            totalActionableCards: cards.length,
            cards,
            lastResumedCardId: s.lastResumedCardId
        };
    }

    /**
     * 记录用户当前操作焦点
     */
    function recordWorkbenchFocus(state, cardId, now = Date.now()) {
        const s = normalizeWorkbenchState(state);
        return {
            success: true,
            state: {
                ...s,
                lastResumedCardId: safeStr(cardId),
                updatedAt: now
            }
        };
    }

    function memoryReadableWorkbenchSelfCheck() {
        const problems = [];
        if (Object.keys(WORKBENCH_CARD_TYPES).length !== 4) problems.push('WORKBENCH_CARD_TYPES 必须恰好为 4 种类型');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        WORKBENCH_CARD_TYPES,
        normalizeWorkbenchState,
        assembleReadableDashboard,
        recordWorkbenchFocus,
        memoryReadableWorkbenchSelfCheck
    });

    root.LonShaMemoryReadableWorkbench = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);