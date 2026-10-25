/* ============================================================
 * fact-unified-lifecycle-matrix.js — [L10-O1 · 第十期全量优化]
 * 事实全生命周期统一状态流转矩阵（Fact Unified Lifecycle Matrix）
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决用户分不清“候选事实、推断、已确认、已失效与撤回”状态的混淆痛点：
 *   1. 五态严格流转：
 *      DRAFT (草稿/候选) -> VERIFIED (已确认事实) / HYPOTHETICAL (推论) 
 *      -> EXPIRED (自然失效) / REVOKED (人为撤销)；
 *   2. 元数据溯源铁律：
 *      每条事实严格锚定来源楼层 (sourceFloor)、发生时间 (occurredAt)、获知时间 (learnedAt)、
 *      确认者 (verifiedBy) 与撤销理由 (revocationReason)；
 *   3. 零虚假确认：未提供确认来源的事实禁止标记为 VERIFIED。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaFactLifecycleMatrix = factory();
    root.FactUnifiedLifecycleMatrix = root.LonShaFactLifecycleMatrix;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const FACT_STATE = Object.freeze({
        DRAFT: 'draft',                 // 草稿 / 待确认事实
        HYPOTHETICAL: 'hypothetical',   // 假说 / 传闻 / 推测
        VERIFIED: 'verified',           // 确凿生效事实
        EXPIRED: 'expired',             // 自然过期 / 时效结束
        REVOKED: 'revoked'              // 明确撤销 / 证伪
    });

    /**
     * 创建基础事实条目
     */
    function createFactEntry(input = {}) {
        const content = String(input.content || input.text || '').trim();
        const state = Object.values(FACT_STATE).includes(input.state) 
            ? input.state 
            : FACT_STATE.DRAFT;

        return {
            id: input.id || `fact_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            content,
            state,
            sourceFloor: Number.isFinite(input.sourceFloor) ? input.sourceFloor : null,
            occurredAt: input.occurredAt || 'unknown',
            learnedAt: input.learnedAt || 'unknown',
            verifiedBy: input.verifiedBy || null,
            revocationReason: null,
            validUntilFloor: Number.isFinite(input.validUntilFloor) ? input.validUntilFloor : null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * 推进事实状态流转
     * @param {Object} fact - 原始事实
     * @param {string} targetState - 目标状态
     * @param {Object} transitionMeta - 转移参数（如 verifier, reason, currentFloor）
     * @returns {Object} 转移后的事实对象
     */
    function transitionFactState(fact = {}, targetState, transitionMeta = {}) {
        if (!fact || !fact.id) throw new Error('无效的事实对象');
        if (!Object.values(FACT_STATE).includes(targetState)) {
            throw new Error(`非法的目标状态: ${targetState}`);
        }

        const current = fact.state || FACT_STATE.DRAFT;

        // 终态防篡改：已撤销 (REVOKED) 不能静默转回已确认
        if (current === FACT_STATE.REVOKED && targetState === FACT_STATE.VERIFIED) {
            throw new Error('已明确撤销的事实禁止直接转为确认状态，须重新提报');
        }

        // 强契约：转为 VERIFIED 必须具备确认人或确认源
        if (targetState === FACT_STATE.VERIFIED && !transitionMeta.verifiedBy) {
            throw new Error('确认事实必须提供明确的验证者 (verifiedBy)，禁止伪造已确认');
        }

        const updated = {
            ...fact,
            state: targetState,
            updatedAt: Date.now()
        };

        if (targetState === FACT_STATE.VERIFIED) {
            updated.verifiedBy = String(transitionMeta.verifiedBy);
        } else if (targetState === FACT_STATE.REVOKED) {
            updated.revocationReason = String(transitionMeta.reason || '未说明撤回理由');
        } else if (targetState === FACT_STATE.EXPIRED) {
            updated.expiredAtFloor = transitionMeta.currentFloor || null;
        }

        return updated;
    }

    /**
     * 过滤出当前活跃可注入的事实
     * @param {Array} facts
     * @param {number} currentFloor
     * @returns {Array} 可注入的事实清单
     */
    function filterInjectableFacts(facts = [], currentFloor = null) {
        if (!Array.isArray(facts)) return [];
        return facts.filter(f => {
            if (f.state !== FACT_STATE.VERIFIED && f.state !== FACT_STATE.HYPOTHETICAL) {
                return false; // 只有 VERIFIED 和 HYPOTHETICAL 可进入候选
            }
            if (Number.isFinite(currentFloor) && Number.isFinite(f.validUntilFloor)) {
                if (currentFloor > f.validUntilFloor) return false; // 超过有效楼层自动排除
            }
            return true;
        });
    }

    return Object.freeze({
        FACT_STATE,
        createFactEntry,
        transitionFactState,
        filterInjectableFacts
    });
}));