/* ============================================================
 * fact-postgen-replay-receipt.js — [L9-O6 · 第九期规划]
 * 生成后事实逐句回放与可逆采纳工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   模型生成文本后，伴随式提取出的候选事实可能包含虚构或推论。
 *   回放工作台将提取结果拆解为待审列表：
 *     - ADOPT:  采纳并写入事实库
 *     - REJECT: 舍弃，并标记该推论不成立
 *     - DEFER:  暂缓，存入收件箱等候后续轮次判定
 *   支持按楼层撤销历史采纳操作，保障可逆性。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FactPostgenReplayReceipt = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ADOPTION_ACTION = Object.freeze({
        ADOPT: 'adopt',
        REJECT: 'reject',
        DEFER: 'defer'
    });

    /**
     * 规范化生成后候选事实
     */
    function createReplayBatch(floorIndex, extractedCandidates) {
        const floor = Number(floorIndex) || 0;
        const candidates = Array.isArray(extractedCandidates) ? extractedCandidates : [];

        return {
            floor,
            batchId: `batch-floor-${floor}-${Date.now()}`,
            items: candidates.map((c, idx) => ({
                replayId: `rep-${floor}-${idx + 1}`,
                subject: String(c.subject || '').trim(),
                predicate: String(c.predicate || '').trim(),
                object: String(c.object || c.value || '').trim(),
                originSentence: String(c.originSentence || c.sentence || '').trim(),
                decision: 'pending',
                decisionNote: null,
                decidedAt: null
            })),
            createdAt: Date.now()
        };
    }

    /**
     * 对特定候选执行用户采纳决定
     */
    function adjudicateCandidate(batch, replayId, action, options = {}) {
        if (!batch || !Array.isArray(batch.items)) return { ok: false, error: 'invalid-batch' };
        if (!Object.values(ADOPTION_ACTION).includes(action)) {
            return { ok: false, error: 'invalid-action' };
        }

        const items = batch.items.slice();
        const targetIdx = items.findIndex(x => x.replayId === replayId);
        if (targetIdx < 0) return { ok: false, error: 'candidate-not-found' };

        const target = items[targetIdx];
        items[targetIdx] = {
            ...target,
            decision: action,
            decisionNote: String(options.note || '').trim(),
            decidedAt: Date.now()
        };

        return {
            ok: true,
            batch: {
                ...batch,
                items,
                updatedAt: Date.now()
            }
        };
    }

    return {
        ADOPTION_ACTION,
        createReplayBatch,
        adjudicateCandidate
    };
}));