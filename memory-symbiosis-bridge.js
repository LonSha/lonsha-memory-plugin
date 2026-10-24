/* ========================================================
 * memory-symbiosis-bridge.js — [M8-X8 · 第八期规划] 记忆共生协议（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决手机行动结果与记忆插件割裂、无法形成“行动-偏好-下次材料”闭环的问题：
 *     ① 接收四态手机行动回执：accepted / rejected / timed_out / partial；
 *     ② 沉淀动态建议偏好：提升采纳策略的优先度，压制被拒绝策略；
 *     ③ 严格桥接契约：不复制手机整个数据库，仅通过轻量回执进行策略共生；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const ACTION_OUTCOMES = Object.freeze({
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        TIMED_OUT: 'timed_out',
        PARTIAL: 'partial'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }

    function normalizeSymbiosisState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                actionReceipts: [], // [{ receiptId, proposalTag, outcome, timestamp }]
                strategyWeights: {}, // proposalTag -> weightMultiplier
                updatedAt: Date.now()
            };
        }
        return {
            actionReceipts: Array.isArray(raw.actionReceipts) ? [...raw.actionReceipts] : [],
            strategyWeights: (raw.strategyWeights && typeof raw.strategyWeights === 'object') ? { ...raw.strategyWeights } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 接收并消化来自手机端的行动回执
     */
    function ingestPhoneActionReceipt(state, receipt, now = Date.now()) {
        const s = normalizeSymbiosisState(state);
        if (!receipt || typeof receipt !== 'object') {
            return { success: false, reason: 'invalid-receipt', state: s };
        }

        const tag = safeStr(receipt.proposalTag);
        const outcome = safeStr(receipt.outcome);

        if (!tag || !Object.values(ACTION_OUTCOMES).includes(outcome)) {
            return { success: false, reason: 'invalid-tag-or-outcome', state: s };
        }

        let currentWeight = typeof s.strategyWeights[tag] === 'number' ? s.strategyWeights[tag] : 1.0;

        if (outcome === ACTION_OUTCOMES.ACCEPTED) {
            currentWeight = Math.min(2.5, currentWeight * 1.3);
        } else if (outcome === ACTION_OUTCOMES.REJECTED) {
            currentWeight = Math.max(0.2, currentWeight * 0.6);
        } else if (outcome === ACTION_OUTCOMES.TIMED_OUT) {
            currentWeight = Math.max(0.5, currentWeight * 0.85);
        } else if (outcome === ACTION_OUTCOMES.PARTIAL) {
            currentWeight = Math.min(1.5, currentWeight * 1.05);
        }

        const entry = {
            receiptId: safeStr(receipt.receiptId) || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            proposalTag: tag,
            outcome,
            timestamp: now
        };

        return {
            success: true,
            adjustedWeight: currentWeight,
            state: {
                ...s,
                actionReceipts: [...s.actionReceipts, entry].slice(-50),
                strategyWeights: {
                    ...s.strategyWeights,
                    [tag]: currentWeight
                },
                updatedAt: now
            }
        };
    }

    /**
     * 根据共生累积的偏好权重，对候选生成材料进行优先级微调
     */
    function adjustCandidatesBySymbiosis(state, candidates = []) {
        const s = normalizeSymbiosisState(state);
        const list = Array.isArray(candidates) ? candidates : [];

        return list.map(item => {
            if (!item || typeof item !== 'object') return null;
            const tag = safeStr(item.proposalTag || item.category);
            const multiplier = s.strategyWeights[tag] || 1.0;
            const baseScore = typeof item.score === 'number' ? item.score : 0.5;

            return {
                ...item,
                symbiosisScore: baseScore * multiplier,
                symbiosisMultiplier: multiplier
            };
        }).filter(Boolean);
    }

    function memorySymbiosisBridgeSelfCheck() {
        const problems = [];
        if (Object.keys(ACTION_OUTCOMES).length !== 4) problems.push('ACTION_OUTCOMES 必须恰好为 4 态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        ACTION_OUTCOMES,
        normalizeSymbiosisState,
        ingestPhoneActionReceipt,
        adjustCandidatesBySymbiosis,
        memorySymbiosisBridgeSelfCheck
    });

    root.LonShaMemorySymbiosisBridge = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);