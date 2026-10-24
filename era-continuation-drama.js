/* ========================================================
 * era-continuation-drama.js — [M8-X9 · 第八期规划] 时代接续剧（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决长期跨时代或跨阶段推进时，历史被粗暴压平成一段空洞总摘要的问题：
 *     ① 三阶段时代脉络：origin（肇始期）/ transition（过渡转折）/ succession（接续新世）；
 *     ② 继承物与旧规则抉择：新一代可对旧誓约/规则执行 honor（恪守）/ reject（废弃）/ reinterpret（重释）；
 *     ③ 断代诚实显式留白（historical_gap）：历史空白处绝不伪造虚假编年史；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const ERA_PHASES = Object.freeze({
        ORIGIN: 'origin',
        TRANSITION: 'transition',
        SUCCESSION: 'succession'
    });

    const RULE_INHERITANCE_ACTIONS = Object.freeze({
        HONOR: 'honor',
        REJECT: 'reject',
        REINTERPRET: 'reinterpret'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeEraDramaState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                eras: {}, // eraId -> eraObj
                currentEraId: null,
                ruleDecisions: {}, // ruleId -> { action, rationale, successorChar, timestamp }
                updatedAt: Date.now()
            };
        }
        return {
            eras: (raw.eras && typeof raw.eras === 'object') ? { ...raw.eras } : {},
            currentEraId: safeStr(raw.currentEraId) || null,
            ruleDecisions: (raw.ruleDecisions && typeof raw.ruleDecisions === 'object') ? { ...raw.ruleDecisions } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 注册或开启一个新时代节点
     */
    function recordEraNode(state, eraSpec, now = Date.now()) {
        const s = normalizeEraDramaState(state);
        const spec = (eraSpec && typeof eraSpec === 'object') ? eraSpec : {};
        const id = safeStr(spec.id) || `era_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const title = safeStr(spec.title);
        const phase = Object.values(ERA_PHASES).includes(spec.phase) ? spec.phase : ERA_PHASES.ORIGIN;

        if (!title) {
            return { success: false, reason: 'title-required', state: s };
        }

        const era = {
            id,
            title,
            phase,
            inheritedRelics: safeArr(spec.inheritedRelics), // ['relic_pocket_watch']
            activeRules: safeArr(spec.activeRules), // [{ id: 'rule_1', description: '族规' }]
            historicalGap: Boolean(spec.historicalGap), // 标记是否存在断代失传
            gapDescription: safeStr(spec.gapDescription),
            createdAt: now
        };

        return {
            success: true,
            era,
            state: {
                ...s,
                eras: { ...s.eras, [id]: era },
                currentEraId: id,
                updatedAt: now
            }
        };
    }

    /**
     * 新一代对旧规则执行抉择（恪守 / 拒绝废除 / 重新诠释）
     */
    function decideOldRuleInheritance(state, ruleId, action, rationale = '', successorChar = 'successor', now = Date.now()) {
        const s = normalizeEraDramaState(state);
        const rId = safeStr(ruleId);
        const act = safeStr(action);

        if (!rId || !Object.values(RULE_INHERITANCE_ACTIONS).includes(act)) {
            return { success: false, reason: 'invalid-rule-or-action', state: s };
        }

        const decision = {
            ruleId: rId,
            action: act,
            rationale: safeStr(rationale),
            successorChar: safeStr(successorChar),
            decidedAt: now
        };

        return {
            success: true,
            decision,
            state: {
                ...s,
                ruleDecisions: {
                    ...s.ruleDecisions,
                    [rId]: decision
                },
                updatedAt: now
            }
        };
    }

    /**
     * 输出时代传承全景视像
     */
    function renderEraPanorama(state) {
        const s = normalizeEraDramaState(state);
        const eraList = Object.values(s.eras);

        const summaries = eraList.map(era => {
            const gapNotice = era.historicalGap ? ` [注：此处存在历史断代空白 · ${era.gapDescription || '无记载'}]` : '';
            return `【${era.phase.toUpperCase()}】${era.title}${gapNotice}`;
        });

        return {
            totalEras: eraList.length,
            currentEra: s.currentEraId ? s.eras[s.currentEraId] : null,
            decidedRulesCount: Object.keys(s.ruleDecisions).length,
            panoramaOverview: summaries.join(' -> ')
        };
    }

    function eraContinuationDramaSelfCheck() {
        const problems = [];
        if (Object.keys(ERA_PHASES).length !== 3) problems.push('ERA_PHASES 必须恰好为 3 阶段');
        if (Object.keys(RULE_INHERITANCE_ACTIONS).length !== 3) problems.push('RULE_INHERITANCE_ACTIONS 必须恰好为 3 种动作');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        ERA_PHASES,
        RULE_INHERITANCE_ACTIONS,
        normalizeEraDramaState,
        recordEraNode,
        decideOldRuleInheritance,
        renderEraPanorama,
        eraContinuationDramaSelfCheck
    });

    root.LonShaEraContinuationDrama = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);