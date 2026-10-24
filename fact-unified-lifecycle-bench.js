/* ============================================================
 * fact-unified-lifecycle-bench.js — [M9-O1 · 第九期规划]
 * 事实状态投影与全生命周期工作流裁决工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【治理缺口】
 *   旧事实体系散落于 fact-state(状态推导)、fact-lifecycle(处置/动作)、
 *   fact-version(版本换代)与 native-fact-admission(准入)。
 *   用户无法在单一视口中回答：
 *     1. 这条记忆经历过何种状态流转？
 *     2. 候选/推断/草稿/确认/过期/撤回在召回与注入中如何差分表现？
 *     3. 能否在保留证据链的前提下将事实置为待确认、并列解释或撤回？
 *
 * 【核心设计】
 *   ① 状态机六态收敛：
 *      - candidate:   模型生成/外部提取的候选事实（默认不进正式注入）
 *      - inference:   逻辑推导或多方证据合成事实（附带推导置信证据）
 *      - confirmed:   经用户确认或明确凭证锁定的基准事实（优先进入上下文）
 *      - expired:     时间区间已闭合或被新事实取代的历史事实（保留溯源，受控放行）
 *      - revoked:     用户主动撤回或被推翻的无效事实（绝对阻断注入，证据孤立保留）
 *      - draft:       用户手填或编辑中的未完成草稿
 *
 *   ② 状态转移与可逆裁决 (Transition Matrix)：
 *      - candidate -> confirmed / revoked / inference
 *      - inference -> confirmed / revoked / disputed
 *      - confirmed -> expired (superseded) / revoked / candidate (re-evaluate)
 *      - revoked   -> candidate (re-open with reason)
 *
 *   ③ 注入与召回准入判据 (Admission Verdict)：
 *      - activeGeneration: 仅 confirmed 与指定模式下的 high-confidence inference
 *      - auditVisible: 全状态可见，但 revoked 与 draft 自动掩码敏感细节
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FactUnifiedLifecycleBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LIFECYCLE_STATES = Object.freeze({
        CANDIDATE: 'candidate',
        INFERENCE: 'inference',
        CONFIRMED: 'confirmed',
        EXPIRED: 'expired',
        REVOKED: 'revoked',
        DRAFT: 'draft'
    });

    const ADMISSION_POLICY = Object.freeze({
        STRICT: 'strict',       // 仅 confirmed 放行
        BALANCED: 'balanced',   // confirmed + 高置信 inference
        EXPLORATORY: 'exploratory' // 放行除 revoked 与 draft 外的所有条目
    });

    function normalizeFact(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const id = String(raw.id || raw.factId || '').trim();
        if (!id) return null;

        const rawState = String(raw.state || raw.status || '').trim().toLowerCase();
        let state = LIFECYCLE_STATES.CANDIDATE;

        if (raw.revoked === true || rawState === LIFECYCLE_STATES.REVOKED) {
            state = LIFECYCLE_STATES.REVOKED;
        } else if (raw.to != null || rawState === LIFECYCLE_STATES.EXPIRED || rawState === 'superseded') {
            state = LIFECYCLE_STATES.EXPIRED;
        } else if (rawState === LIFECYCLE_STATES.CONFIRMED || raw.confirmed === true) {
            state = LIFECYCLE_STATES.CONFIRMED;
        } else if (rawState === LIFECYCLE_STATES.INFERENCE || raw.isInference === true) {
            state = LIFECYCLE_STATES.INFERENCE;
        } else if (rawState === LIFECYCLE_STATES.DRAFT || raw.isDraft === true) {
            state = LIFECYCLE_STATES.DRAFT;
        }

        return {
            id,
            subject: String(raw.subject || '').trim(),
            predicate: String(raw.predicate || '').trim(),
            object: String(raw.object || raw.value || '').trim(),
            state,
            floor: typeof raw.floor === 'number' ? raw.floor : (parseInt(raw.floor, 10) || 0),
            confidence: typeof raw.confidence === 'number' ? raw.confidence : 1.0,
            sourceFloor: raw.sourceFloor != null ? raw.sourceFloor : raw.floor,
            provenance: Array.isArray(raw.provenance) ? raw.provenance.slice() : [],
            revisionHistory: Array.isArray(raw.revisionHistory) ? raw.revisionHistory.slice() : [],
            revocationReason: raw.revocationReason ? String(raw.revocationReason).trim() : null,
            validFrom: raw.validFrom || raw.from || null,
            validTo: raw.validTo || raw.to || null,
            updatedAt: raw.updatedAt || Date.now()
        };
    }

    /**
     * 执行用户裁决转移
     */
    function transitionFact(factInput, targetState, options = {}) {
        const fact = normalizeFact(factInput);
        if (!fact) {
            return { ok: false, error: 'invalid-fact', fact: null };
        }

        const validTargets = Object.values(LIFECYCLE_STATES);
        if (!validTargets.includes(targetState)) {
            return { ok: false, error: 'invalid-target-state', fact };
        }

        if (fact.state === targetState) {
            return { ok: true, mutated: false, fact };
        }

        // 核心保护：若从 confirmed 转到 revoked，必须留痕原因
        const reason = String(options.reason || options.justification || 'user-adjudication').trim();
        const operator = String(options.operator || 'user').trim();

        const historyEntry = {
            from: fact.state,
            to: targetState,
            timestamp: Date.now(),
            reason,
            operator
        };

        const updated = Object.assign({}, fact, {
            state: targetState,
            revocationReason: targetState === LIFECYCLE_STATES.REVOKED ? reason : null,
            revisionHistory: fact.revisionHistory.concat([historyEntry]),
            updatedAt: Date.now()
        });

        if (targetState === LIFECYCLE_STATES.EXPIRED && !updated.validTo) {
            updated.validTo = options.validTo || Date.now();
        }

        return {
            ok: true,
            mutated: true,
            previousState: fact.state,
            fact: updated
        };
    }

    /**
     * 批量生成上下文注入准入评定
     */
    function evaluateAdmission(facts, policy = ADMISSION_POLICY.BALANCED) {
        const list = Array.isArray(facts) ? facts : [];
        const admitted = [];
        const rejected = [];
        const explanations = [];

        for (const item of list) {
            const fact = normalizeFact(item);
            if (!fact) continue;

            let isAdmitted = false;
            let reason = '';

            switch (fact.state) {
                case LIFECYCLE_STATES.CONFIRMED:
                    isAdmitted = true;
                    reason = 'confirmed-ground-truth';
                    break;
                case LIFECYCLE_STATES.INFERENCE:
                    if (policy === ADMISSION_POLICY.STRICT) {
                        isAdmitted = false;
                        reason = 'strict-policy-rejects-inference';
                    } else if (fact.confidence >= 0.75 || policy === ADMISSION_POLICY.EXPLORATORY) {
                        isAdmitted = true;
                        reason = 'high-confidence-inference-allowed';
                    } else {
                        isAdmitted = false;
                        reason = 'low-confidence-inference-gated';
                    }
                    break;
                case LIFECYCLE_STATES.CANDIDATE:
                    if (policy === ADMISSION_POLICY.EXPLORATORY) {
                        isAdmitted = true;
                        reason = 'exploratory-policy-permits-candidate';
                    } else {
                        isAdmitted = false;
                        reason = 'candidate-requires-confirmation';
                    }
                    break;
                case LIFECYCLE_STATES.EXPIRED:
                    isAdmitted = false;
                    reason = 'superseded-or-expired';
                    break;
                case LIFECYCLE_STATES.REVOKED:
                    isAdmitted = false;
                    reason = 'strictly-revoked-by-user';
                    break;
                case LIFECYCLE_STATES.DRAFT:
                default:
                    isAdmitted = false;
                    reason = 'uncommitted-draft';
                    break;
            }

            if (isAdmitted) {
                admitted.push(fact);
            } else {
                rejected.push({ fact, reason });
            }

            explanations.push({
                id: fact.id,
                admitted: isAdmitted,
                state: fact.state,
                reason
            });
        }

        return {
            admittedCount: admitted.length,
            rejectedCount: rejected.length,
            admitted,
            rejected,
            explanations
        };
    }

    return {
        LIFECYCLE_STATES,
        ADMISSION_POLICY,
        normalizeFact,
        transitionFact,
        evaluateAdmission
    };
}));
