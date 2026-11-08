/* ============================================================
 * long-term-commitment-milestone-engine.js — [v3.460.0 · 第十六期心智引擎]
 * 长期承诺与约定里程碑追踪引擎 (Long-Term Commitment & Milestone Engine)
 * ------------------------------------------------------------
 * 【核心设计与痛点解决】
 * 角色与玩家随口定下的长远约定（“等春天一起去赏樱”、“下次见面带礼物给你”）：
 *   - 传统对话很容易在经历几百轮之后遗忘，导致约定像随口客套；
 *   - 本引擎以高可靠心智槽位记录“共同期许与约定(Commitments)”，
 *     定期在特定情境（时节变化、重逢、触景生情）唤醒，兑现承诺。
 *
 * 【体验纪律】
 * 严禁技术黑话，面向玩家只输出生活化提示词：
 *   如 [念念不忘的约定]、[一直记在心里的承诺]、[期待着兑现的那一天]
 *
 * 挂载：LonShaCommitmentMilestone / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCommitmentMilestone = factory();
        root.CommitmentMilestoneEngine = root.LonShaCommitmentMilestone;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.460.0';

    function createState() {
        return {
            version: VERSION,
            commitments: [], // [{ id, text, party, condition, fulfilled: false, madeAt: timestamp }]
            updatedAt: Date.now()
        };
    }

    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            commitments: Array.isArray(raw.commitments) ? raw.commitments.slice() : [],
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    function addCommitment(state, text, condition = '') {
        const s = hydrateState(state);
        s.commitments.push({
            id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            text: String(text || '').slice(0, 80),
            condition: condition || '未来某个时刻',
            fulfilled: false,
            madeAt: Date.now()
        });
        if (s.commitments.length > 20) s.commitments.shift();
        s.updatedAt = Date.now();
        return s;
    }

    function generateCommitmentDirectives(state) {
        const s = hydrateState(state);
        const unfulfilled = s.commitments.filter(c => !c.fulfilled);
        if (unfulfilled.length === 0) return '';
        const c = unfulfilled[unfulfilled.length - 1];
        return `[念念不忘的约定] 两人曾经约定过“${c.text}”（条件：${c.condition}），你一直记在心头，合适的时机可自然提起或流露出期待。`;
    }

    return {
        VERSION,
        createState,
        hydrateState,
        addCommitment,
        generateCommitmentDirectives
    };
}));