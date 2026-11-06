/* ============================================================
 * dynamic-covenant-consequence-engine.js — [L20-9 · 第二十期史诗级双项目双计划]
 * 动态契约誓言、违约噬心与因果反噬引擎 (Dynamic Covenant & Consequence Engine)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长程叙事中“角色发重誓或结盟立约后，转头就忘、违约无代价”的虚浮问题：
 *   1. 灵魂契约/血誓建档（Sacred Covenant Ledger）：
 *      记录立约各方（Parties）、誓言核心条款（Terms）、神圣见证物与违誓代价（Curse/Penalty）；
 *   2. 违约背叛实时检测器（Covenant Violation Detector）：
 *      当大模型生成或玩家行动触发背叛、擅自泄密或临阵倒戈时，判定契约撕毁；
 *   3. 因果反噬与噬心惩戒指令（Karmic Backfire & Directives）：
 *      违约方遭受道义谴责、心魔噬体或天地因果反噬，注入不可逆转的重大负面剧情惩罚。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCovenantEngine = factory();
        root.DynamicCovenantConsequenceEngine = root.LonShaCovenantEngine;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const COVENANT_STATUS = Object.freeze({
        BOUND: 'bound',             // 契约生效中
        FULFILLED: 'fulfilled',     // 誓言圆满达成
        BREACHED: 'breached'        // 契约破裂被背叛
    });

    /**
     * 创建契约引擎初始状态
     */
    function createInitialCovenantState() {
        return {
            covenants: new Map(), // covenantId -> covenantEntry
            updatedAt: Date.now()
        };
    }

    /**
     * 缔结神圣契约
     */
    function forgeCovenant(state, spec = {}) {
        if (!state || !state.covenants) return null;
        const id = String(spec.id || `cov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
        const covenant = {
            id,
            title: String(spec.title || '同盟密誓').trim(),
            parties: Array.isArray(spec.parties) ? spec.parties.map(s => String(s).trim()).filter(Boolean) : [],
            terms: String(spec.terms || '互不背叛，同生共死').trim(),
            breachPenalty: String(spec.breachPenalty || '血契噬心，遭同盟永世诛杀').trim(),
            forbiddenActions: Array.isArray(spec.forbiddenActions) 
                ? spec.forbiddenActions.map(s => String(s).trim()).filter(Boolean)
                : ['背叛', '出卖', '擅自投降'],
            status: COVENANT_STATUS.BOUND,
            breachedBy: null,
            breachedAt: null,
            createdAt: Date.now()
        };

        state.covenants.set(id, covenant);
        state.updatedAt = Date.now();
        return covenant;
    }

    /**
     * 检测潜在违约背叛行为
     */
    function checkCovenantBreach(state, actorName = '', actionText = '') {
        if (!state || !state.covenants) return [];
        const actor = String(actorName || '').trim().toLowerCase();
        const text = String(actionText || '').toLowerCase();
        const breaches = [];

        for (const cov of state.covenants.values()) {
            if (cov.status !== COVENANT_STATUS.BOUND) continue;
            const isParty = cov.parties.some(p => p.toLowerCase() === actor);
            if (!isParty) continue;

            for (const forbidden of cov.forbiddenActions) {
                if (text.includes(forbidden.toLowerCase())) {
                    cov.status = COVENANT_STATUS.BREACHED;
                    cov.breachedBy = actorName;
                    cov.breachedAt = Date.now();
                    breaches.push(cov);
                    break;
                }
            }
        }

        if (breaches.length > 0) state.updatedAt = Date.now();
        return breaches;
    }

    /**
     * 推导当前角色契约约束与反噬指令
     */
    function resolveCovenantDirectives(state, actorName = '') {
        if (!state || !state.covenants) return [];
        const actor = String(actorName || '').trim().toLowerCase();
        const directives = [];

        for (const cov of state.covenants.values()) {
            const isParty = cov.parties.some(p => p.toLowerCase() === actor);
            if (!isParty) continue;

            if (cov.status === COVENANT_STATUS.BOUND) {
                directives.push(`【神圣誓约在身·${cov.title}】${actorName}受契约铁律约束：“${cov.terms}”。违誓代价：“${cov.breachPenalty}”。不可轻易违背誓约条款。`);
            } else if (cov.status === COVENANT_STATUS.BREACHED && cov.breachedBy?.toLowerCase() === actor) {
                directives.push(`【血誓反噬·大逆背叛】${actorName}撕毁了誓约《${cov.title}》！正遭受因果反噬与噬心惩戒（“${cov.breachPenalty}”）。必须在言行中体现背誓者的惊惶、剧烈心魔与道义重压。`);
            }
        }

        return directives;
    }

    /**
     * 宽容水合
     */
    function hydrateCovenantState(raw = {}) {
        const state = createInitialCovenantState();
        if (!raw || typeof raw !== 'object') return state;

        if (Array.isArray(raw.covenants)) {
            for (const c of raw.covenants) {
                if (c && c.id) state.covenants.set(c.id, c);
            }
        } else if (raw.covenants && typeof raw.covenants === 'object') {
            for (const [k, v] of Object.entries(raw.covenants)) {
                if (v && typeof v === 'object') state.covenants.set(k, v);
            }
        }

        state.updatedAt = Number(raw.updatedAt) || Date.now();
        return state;
    }

    /**
     * 序列化
     */
    function serializeCovenantState(state) {
        if (!state || !state.covenants) return { covenants: [], updatedAt: Date.now() };
        const covenants = [];
        for (const c of state.covenants.values()) covenants.push(c);
        return {
            covenants,
            updatedAt: state.updatedAt || Date.now()
        };
    }

    return {
        COVENANT_STATUS,
        createInitialCovenantState,
        forgeCovenant,
        checkCovenantBreach,
        resolveCovenantDirectives,
        hydrateCovenantState,
        serializeCovenantState
    };
}));