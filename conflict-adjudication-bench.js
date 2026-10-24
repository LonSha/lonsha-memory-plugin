/* ========================================================
 * conflict-adjudication-bench.js — [M8-O2 · 第八期规划] 冲突裁决台内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决事实冲突被底层打分器隐式覆盖、用户无法知情与纠正的问题：
 *     ① 冲突发现与归纳：时空、数值、身份或关系对立条目聚类；
 *     ② 四大裁决动作：adopt（采纳正史）/ parallel（并列存疑）/
 *        pending（待查实）/ withdraw（撤回答案）；
 *     ③ 决策追溯：记录裁决理由、时间戳与操作者；
 *     ④ 回滚支持与下游消费过滤，绝不隐式物理删除源数据。
 * ======================================================== */
(function (root) {
    'use strict';

    const ADJUDICATION_ACTIONS = Object.freeze({
        ADOPT: 'adopt',         // 确认为正史，下游主要采纳
        PARALLEL: 'parallel',   // 双方均有根据，保留并列展示
        PENDING: 'pending',     // 悬置待后续查证，暂不进入严谨材料
        WITHDRAW: 'withdraw'    // 确认错误或已废弃，抑制下游使用
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeAdjudicationState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                adjudications: {},
                history: [],
                updatedAt: Date.now()
            };
        }
        const adjudications = {};
        if (raw.adjudications && typeof raw.adjudications === 'object') {
            for (const [k, adj] of Object.entries(raw.adjudications)) {
                if (!adj || typeof adj !== 'object') continue;
                adjudications[k] = {
                    conflictKey: safeStr(adj.conflictKey) || k,
                    chosenFactId: safeStr(adj.chosenFactId),
                    action: Object.values(ADJUDICATION_ACTIONS).includes(adj.action) ? adj.action : ADJUDICATION_ACTIONS.PENDING,
                    reason: safeStr(adj.reason),
                    adjudicatedAt: typeof adj.adjudicatedAt === 'number' ? adj.adjudicatedAt : Date.now(),
                    adjudicatedBy: safeStr(adj.adjudicatedBy) || 'user'
                };
            }
        }
        return {
            adjudications,
            history: safeArr(raw.history).slice(-50),
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 针对两个具有相同 conflictKey 的事实进行裁决
     */
    function adjudicateConflict(state, conflictKey, action, options = {}) {
        const s = normalizeAdjudicationState(state);
        const key = safeStr(conflictKey);
        if (!key) {
            return { success: false, reason: 'missing-conflict-key', state: s };
        }
        if (!Object.values(ADJUDICATION_ACTIONS).includes(action)) {
            return { success: false, reason: 'invalid-action', state: s };
        }

        const now = Date.now();
        const adj = {
            conflictKey: key,
            chosenFactId: safeStr(options.chosenFactId),
            action,
            reason: safeStr(options.reason) || '用户裁决',
            adjudicatedAt: now,
            adjudicatedBy: safeStr(options.adjudicatedBy) || 'user'
        };

        const prev = s.adjudications[key];
        const nextAdjudications = {
            ...s.adjudications,
            [key]: adj
        };

        const logEntry = {
            conflictKey: key,
            previousAction: prev ? prev.action : null,
            newAction: action,
            timestamp: now
        };

        return {
            success: true,
            adjudication: adj,
            state: {
                ...s,
                adjudications: nextAdjudications,
                history: [...s.history, logEntry].slice(-50),
                updatedAt: now
            }
        };
    }

    /**
     * 撤销特定冲突的裁决（恢复为未裁决状态）
     */
    function rollbackAdjudication(state, conflictKey) {
        const s = normalizeAdjudicationState(state);
        const key = safeStr(conflictKey);
        if (!s.adjudications[key]) {
            return { success: false, reason: 'no-adjudication-found', state: s };
        }
        const nextAdjudications = { ...s.adjudications };
        delete nextAdjudications[key];
        return {
            success: true,
            conflictKey: key,
            state: {
                ...s,
                adjudications: nextAdjudications,
                updatedAt: Date.now()
            }
        };
    }

    /**
     * 下游消费侧过滤：根据裁决结果决定事实条目是否放行
     */
    function filterFactsByAdjudication(facts, adjudications = {}) {
        const list = safeArr(facts);
        return list.filter(fact => {
            if (!fact || typeof fact !== 'object') return false;
            const cKey = safeStr(fact.conflictKey);
            if (!cKey || !adjudications[cKey]) return true; // 未冲突或未裁决，放行

            const adj = adjudications[cKey];
            switch (adj.action) {
                case ADJUDICATION_ACTIONS.ADOPT:
                    // 仅放行被选中的那条事实
                    return safeStr(fact.id) === adj.chosenFactId;
                case ADJUDICATION_ACTIONS.WITHDRAW:
                    // 全部抑制
                    return false;
                case ADJUDICATION_ACTIONS.PARALLEL:
                    // 并列展示全部
                    return true;
                case ADJUDICATION_ACTIONS.PENDING:
                default:
                    // 待查实：默认带待查标记放行，由调用方选择性降权
                    return true;
            }
        });
    }

    function conflictAdjudicationSelfCheck() {
        const problems = [];
        if (Object.keys(ADJUDICATION_ACTIONS).length !== 4) problems.push('ADJUDICATION_ACTIONS 必须恰好为 4 项动作');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        ADJUDICATION_ACTIONS,
        normalizeAdjudicationState,
        adjudicateConflict,
        rollbackAdjudication,
        filterFactsByAdjudication,
        conflictAdjudicationSelfCheck
    });

    root.LonShaConflictAdjudication = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);