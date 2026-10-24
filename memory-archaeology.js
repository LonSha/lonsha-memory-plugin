/* ========================================================
 * memory-archaeology.js — [M8-X4 · 第八期规划] 记忆考古（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决长期经历中碎片与空缺被直接伪装成“没有发生”的问题：
 *     ① 四种具名空缺：unknown（真相未知）/ redacted（私密未解锁）/
 *        contradictory（记录冲突）/ missing_link（因果链断裂）；
 *     ② 显式线索碎片聚合与断层诊断；
 *     ③ 考古假说工作台：提出假设、比对实证并更新论证状态；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const ARCHAEOLOGY_GAP_TYPES = Object.freeze({
        UNKNOWN: 'unknown',
        REDACTED: 'redacted',
        CONTRADICTORY: 'contradictory',
        MISSING_LINK: 'missing_link'
    });

    const HYPOTHESIS_STATUS = Object.freeze({
        PROPOSED: 'proposed',
        CORROBORATED: 'corroborated',
        REFUTED: 'refuted'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeArchaeologyState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                hypotheses: {}, // id -> hypothesisObj
                excavatedGaps: [],
                updatedAt: Date.now()
            };
        }
        return {
            hypotheses: (raw.hypotheses && typeof raw.hypotheses === 'object') ? { ...raw.hypotheses } : {},
            excavatedGaps: Array.isArray(raw.excavatedGaps) ? [...raw.excavatedGaps] : [],
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 分析记忆碎片间的断层与空缺，输出具名空缺列表
     */
    function analyzeArchaeologicalGaps(fragments, contextFacts = []) {
        const frags = safeArr(fragments);
        const facts = safeArr(contextFacts);
        const gaps = [];

        // 1. 检查因果断裂（已知前置与后置，但缺少中介事件）
        for (const f of frags) {
            if (!f || typeof f !== 'object') continue;
            if (f.requiresCausalBridge && !facts.some(k => k.bridgeId === f.id)) {
                gaps.push({
                    id: `gap_causal_${f.id}`,
                    gapType: ARCHAEOLOGY_GAP_TYPES.MISSING_LINK,
                    title: `缺失因果过渡：${safeStr(f.title || f.id)}`,
                    description: '已发生转折但缺乏中间过渡事件证据',
                    relatedFragmentId: f.id
                });
            }
            if (f.isRedacted === true) {
                gaps.push({
                    id: `gap_redacted_${f.id}`,
                    gapType: ARCHAEOLOGY_GAP_TYPES.REDACTED,
                    title: `权限受限：${safeStr(f.title || f.id)}`,
                    description: '该历史记录处于私密封闭状态，需要特定信物或关系解锁',
                    relatedFragmentId: f.id
                });
            }
        }

        return gaps;
    }

    /**
     * 建立考古假说
     */
    function createArchaeologyHypothesis(state, hypothesisSpec, now = Date.now()) {
        const s = normalizeArchaeologyState(state);
        const spec = (hypothesisSpec && typeof hypothesisSpec === 'object') ? hypothesisSpec : {};
        const id = safeStr(spec.id) || `hyp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const premise = safeStr(spec.premise);

        if (!premise) {
            return { success: false, reason: 'empty-premise', state: s };
        }

        const hypothesis = {
            id,
            targetGapId: safeStr(spec.targetGapId),
            premise,
            author: safeStr(spec.author) || 'user',
            status: HYPOTHESIS_STATUS.PROPOSED,
            supportingEvidences: safeArr(spec.supportingEvidences),
            counterEvidences: safeArr(spec.counterEvidences),
            createdAt: now,
            updatedAt: now
        };

        return {
            success: true,
            hypothesis,
            state: {
                ...s,
                hypotheses: {
                    ...s.hypotheses,
                    [id]: hypothesis
                },
                updatedAt: now
            }
        };
    }

    /**
     * 比对实证，更新假说论证状态
     */
    function verifyHypothesis(state, hypothesisId, evidenceList = [], now = Date.now()) {
        const s = normalizeArchaeologyState(state);
        const hId = safeStr(hypothesisId);
        const hyp = s.hypotheses[hId];

        if (!hyp) {
            return { success: false, reason: 'hypothesis-not-found', state: s };
        }

        const evs = safeArr(evidenceList);
        const supporting = [...hyp.supportingEvidences];
        const counter = [...hyp.counterEvidences];

        for (const ev of evs) {
            if (!ev || typeof ev !== 'object') continue;
            if (ev.stance === 'support') {
                supporting.push(ev);
            } else if (ev.stance === 'refute') {
                counter.push(ev);
            }
        }

        let newStatus = hyp.status;
        if (counter.length > supporting.length && counter.length > 0) {
            newStatus = HYPOTHESIS_STATUS.REFUTED;
        } else if (supporting.length > 0) {
            newStatus = HYPOTHESIS_STATUS.CORROBORATED;
        }

        const updatedHyp = {
            ...hyp,
            status: newStatus,
            supportingEvidences: supporting,
            counterEvidences: counter,
            updatedAt: now
        };

        return {
            success: true,
            status: newStatus,
            hypothesis: updatedHyp,
            state: {
                ...s,
                hypotheses: {
                    ...s.hypotheses,
                    [hId]: updatedHyp
                },
                updatedAt: now
            }
        };
    }

    function memoryArchaeologySelfCheck() {
        const problems = [];
        if (Object.keys(ARCHAEOLOGY_GAP_TYPES).length !== 4) problems.push('ARCHAEOLOGY_GAP_TYPES 必须恰好为 4 种空缺');
        if (Object.keys(HYPOTHESIS_STATUS).length !== 3) problems.push('HYPOTHESIS_STATUS 必须恰好为 3 种状态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        ARCHAEOLOGY_GAP_TYPES,
        HYPOTHESIS_STATUS,
        normalizeArchaeologyState,
        analyzeArchaeologicalGaps,
        createArchaeologyHypothesis,
        verifyHypothesis,
        memoryArchaeologySelfCheck
    });

    root.LonShaMemoryArchaeology = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);