/* ========================================================
 * generation-fact-replay.js — [M8-O6 · 第八期规划] 生成结果回放（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决用户看不见一条新事实是如何从模型输出进入长期记忆的问题：
 *     ① 五阶段流转：draft（草稿）-> proposed（提议）->
 *        conflict（冲突待决）/ admitted（入库正史）/ rejected（否决）；
 *     ② 显式保留采纳理由、证据溯源楼层、模型原句与知情角色；
 *     ③ 支持回滚已入库事实，精准溯源与审计；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const FACT_STAGES = Object.freeze({
        DRAFT: 'draft',
        PROPOSED: 'proposed',
        CONFLICT: 'conflict',
        ADMITTED: 'admitted',
        REJECTED: 'rejected'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeFactReplayState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                facts: {}, // id -> factRecord
                history: [], // [{ factId, fromStage, toStage, reason, timestamp }]
                updatedAt: Date.now()
            };
        }
        return {
            facts: (raw.facts && typeof raw.facts === 'object') ? { ...raw.facts } : {},
            history: Array.isArray(raw.history) ? [...raw.history] : [],
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 记录一条新提取的生成事实候选
     */
    function recordGeneratedFact(state, factSpec, now = Date.now()) {
        const s = normalizeFactReplayState(state);
        const spec = (factSpec && typeof factSpec === 'object') ? factSpec : {};
        const id = safeStr(spec.id) || `gfact_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const content = safeStr(spec.content);

        if (!content) {
            return { success: false, reason: 'empty-content', state: s };
        }

        const stage = Object.values(FACT_STAGES).includes(spec.stage) ? spec.stage : FACT_STAGES.PROPOSED;

        const record = {
            id,
            content,
            sourceFloor: typeof spec.sourceFloor === 'number' ? spec.sourceFloor : null,
            rawQuote: safeStr(spec.rawQuote),
            entityId: safeStr(spec.entityId),
            knownBy: safeArr(spec.knownBy),
            stage,
            admissionReason: safeStr(spec.admissionReason),
            createdAt: now,
            updatedAt: now
        };

        const nextFacts = { ...s.facts, [id]: record };
        const nextHistory = [
            ...s.history,
            { factId: id, fromStage: null, toStage: stage, reason: 'initial-extraction', timestamp: now }
        ];

        return {
            success: true,
            fact: record,
            state: {
                ...s,
                facts: nextFacts,
                history: nextHistory,
                updatedAt: now
            }
        };
    }

    /**
     * 流转事实状态（例如 proposed -> admitted 或 proposed -> conflict）
     */
    function transitionFactStage(state, factId, targetStage, reason = '', now = Date.now()) {
        const s = normalizeFactReplayState(state);
        const fId = safeStr(factId);
        const tStage = safeStr(targetStage);

        if (!s.facts[fId]) {
            return { success: false, reason: 'fact-not-found', state: s };
        }
        if (!Object.values(FACT_STAGES).includes(tStage)) {
            return { success: false, reason: 'invalid-stage', state: s };
        }

        const current = s.facts[fId];
        const prevStage = current.stage;

        const updatedFact = {
            ...current,
            stage: tStage,
            admissionReason: tStage === FACT_STAGES.ADMITTED ? safeStr(reason) : current.admissionReason,
            updatedAt: now
        };

        return {
            success: true,
            previousStage: prevStage,
            currentStage: tStage,
            fact: updatedFact,
            state: {
                ...s,
                facts: { ...s.facts, [fId]: updatedFact },
                history: [
                    ...s.history,
                    { factId: fId, fromStage: prevStage, toStage: tStage, reason: safeStr(reason), timestamp: now }
                ],
                updatedAt: now
            }
        };
    }

    /**
     * 撤销已接纳事实（admitted -> rejected / proposed）
     */
    function revertAdmittedFact(state, factId, reason = '', now = Date.now()) {
        const s = normalizeFactReplayState(state);
        const fId = safeStr(factId);
        if (!s.facts[fId]) {
            return { success: false, reason: 'fact-not-found', state: s };
        }
        if (s.facts[fId].stage !== FACT_STAGES.ADMITTED) {
            return { success: false, reason: 'fact-not-in-admitted-stage', state: s };
        }

        return transitionFactStage(s, fId, FACT_STAGES.REJECTED, `reverted: ${safeStr(reason)}`, now);
    }

    /**
     * 溯源解释：格式化展示一条事实从生成到沉淀的证据链
     */
    function traceFactProvenance(fact) {
        if (!fact || typeof fact !== 'object') return '无有效事实溯源信息';
        const parts = [
            `【事实内容】${safeStr(fact.content)}`,
            `【当前状态】${safeStr(fact.stage)}`,
            fact.sourceFloor != null ? `【源楼层】第 ${fact.sourceFloor} 楼` : null,
            fact.rawQuote ? `【原文引用】“${fact.rawQuote}”` : null,
            fact.knownBy && fact.knownBy.length > 0 ? `【知情角色】${fact.knownBy.join(', ')}` : null,
            fact.admissionReason ? `【采纳理由】${fact.admissionReason}` : null
        ].filter(Boolean);
        return parts.join('\n');
    }

    function getReplaySummary(state) {
        const s = normalizeFactReplayState(state);
        const counts = {
            [FACT_STAGES.DRAFT]: 0,
            [FACT_STAGES.PROPOSED]: 0,
            [FACT_STAGES.CONFLICT]: 0,
            [FACT_STAGES.ADMITTED]: 0,
            [FACT_STAGES.REJECTED]: 0
        };
        for (const f of Object.values(s.facts)) {
            if (counts[f.stage] !== undefined) {
                counts[f.stage]++;
            }
        }
        return {
            totalFacts: Object.keys(s.facts).length,
            counts,
            recentTransitions: s.history.slice(-10)
        };
    }

    function factReplaySelfCheck() {
        const problems = [];
        if (Object.keys(FACT_STAGES).length !== 5) problems.push('FACT_STAGES 必须恰好为 5 种状态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        FACT_STAGES,
        normalizeFactReplayState,
        recordGeneratedFact,
        transitionFactStage,
        revertAdmittedFact,
        traceFactProvenance,
        getReplaySummary,
        factReplaySelfCheck
    });

    root.LonShaGenerationFactReplay = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);