/* ========================================================
 * recall-route-orchestrator.js — [M8-O4 · 第八期规划] 召回路线编排（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决用户无法决定系统如何找到答案、检索黑箱化的问题：
 *     ① 五大检索路线：experience（个人经历）/ evidence（确凿证据）/
 *        relation（人际羁绊）/ lore（世界设定）/ perspective（角色视角）；
 *     ② 路线效果对照与候选来源加权；
 *     ③ 同名消歧与来源排除理由；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const ROUTE_TYPES = Object.freeze({
        EXPERIENCE: 'experience',
        EVIDENCE: 'evidence',
        RELATION: 'relation',
        LORE: 'lore',
        PERSPECTIVE: 'perspective'
    });

    const ROUTE_DEFINITIONS = Object.freeze({
        [ROUTE_TYPES.EXPERIENCE]: {
            id: ROUTE_TYPES.EXPERIENCE,
            name: '优先个人经历',
            description: '优先召回角色亲自参与、目击的事件与直接对话',
            targetTypes: ['episode', 'event', 'conversation'],
            weightMultiplier: 1.5
        },
        [ROUTE_TYPES.EVIDENCE]: {
            id: ROUTE_TYPES.EVIDENCE,
            name: '优先硬性证据',
            description: '严格筛选有具体日期、实物信物、书面契约的客观事实',
            targetTypes: ['fact', 'document', 'contract', 'evidence'],
            weightMultiplier: 1.8
        },
        [ROUTE_TYPES.RELATION]: {
            id: ROUTE_TYPES.RELATION,
            name: '优先人际羁绊',
            description: '优先召回角色间的承诺、好感互动、信任变化与态度演变',
            targetTypes: ['relation', 'pledge', 'attitude'],
            weightMultiplier: 1.4
        },
        [ROUTE_TYPES.LORE]: {
            id: ROUTE_TYPES.LORE,
            name: '优先世界设定',
            description: '优先世界观常识、地域背景、阵营规则与世界书设定',
            targetTypes: ['lore', 'world_rule', 'setting'],
            weightMultiplier: 1.3
        },
        [ROUTE_TYPES.PERSPECTIVE]: {
            id: ROUTE_TYPES.PERSPECTIVE,
            name: '优先角色视角',
            description: '站在指定角色的知情边界和主观认知内筛选材料',
            targetTypes: ['perspective_fact', 'subjective_impression'],
            weightMultiplier: 1.6
        }
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeRouteState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                defaultRoute: ROUTE_TYPES.EXPERIENCE,
                queryOverrides: {},
                updatedAt: Date.now()
            };
        }
        const def = safeStr(raw.defaultRoute);
        return {
            defaultRoute: Object.values(ROUTE_TYPES).includes(def) ? def : ROUTE_TYPES.EXPERIENCE,
            queryOverrides: (raw.queryOverrides && typeof raw.queryOverrides === 'object') ? { ...raw.queryOverrides } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    function setRouteOverride(state, queryId, routeType) {
        const s = normalizeRouteState(state);
        const qId = safeStr(queryId);
        const rType = safeStr(routeType);
        if (!qId || !Object.values(ROUTE_TYPES).includes(rType)) {
            return { success: false, reason: 'invalid-parameters', state: s };
        }
        return {
            success: true,
            state: {
                ...s,
                queryOverrides: {
                    ...s.queryOverrides,
                    [qId]: rType
                },
                updatedAt: Date.now()
            }
        };
    }

    function clearRouteOverride(state, queryId) {
        const s = normalizeRouteState(state);
        const qId = safeStr(queryId);
        const overrides = { ...s.queryOverrides };
        delete overrides[qId];
        return {
            success: true,
            state: {
                ...s,
                queryOverrides: overrides,
                updatedAt: Date.now()
            }
        };
    }

    /**
     * 根据路线编排对候选条目进行加权打分与重排
     */
    function filterAndRankByRoute(routeType, candidates, options = {}) {
        const rType = safeStr(routeType) || ROUTE_TYPES.EXPERIENCE;
        const routeDef = ROUTE_DEFINITIONS[rType] || ROUTE_DEFINITIONS[ROUTE_TYPES.EXPERIENCE];
        const list = safeArr(candidates);
        const perspectiveChar = safeStr(options.perspectiveCharacter);

        const scored = list.map(item => {
            if (!item || typeof item !== 'object') return null;
            let score = typeof item.baseScore === 'number' ? item.baseScore : 0.5;
            const itemType = safeStr(item.type);

            // 1. 路线类型亲和性加权
            if (routeDef.targetTypes.includes(itemType)) {
                score *= routeDef.weightMultiplier;
            }

            // 2. 视角路线时知情隔离过滤
            if (rType === ROUTE_TYPES.PERSPECTIVE && perspectiveChar) {
                const knownBy = safeArr(item.knownBy);
                if (knownBy.length > 0 && !knownBy.includes(perspectiveChar)) {
                    // 该角色不知情，权重归零
                    score = 0;
                }
            }

            return {
                ...item,
                routeScore: score,
                appliedRoute: rType
            };
        }).filter(Boolean);

        scored.sort((a, b) => b.routeScore - a.routeScore);
        return scored;
    }

    /**
     * 同名消歧：当多条事实指代同名但不同实体时，提供明确区分
     */
    function disambiguateCandidates(candidates, targetName) {
        const tName = safeStr(targetName);
        const list = safeArr(candidates);
        const matched = list.filter(c => safeStr(c.entityName) === tName || safeStr(c.name) === tName);

        const groups = {};
        for (const item of matched) {
            const uid = safeStr(item.entityId) || safeStr(item.module) || 'unknown';
            if (!groups[uid]) {
                groups[uid] = {
                    entityId: uid,
                    entityName: tName,
                    disambiguationLabel: item.disambiguationLabel || item.module || '默认实体',
                    items: []
                };
            }
            groups[uid].items.push(item);
        }

        return Object.values(groups);
    }

    function recallRouteSelfCheck() {
        const problems = [];
        if (Object.keys(ROUTE_TYPES).length !== 5) problems.push('ROUTE_TYPES 必须恰好为 5 种路线');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        ROUTE_TYPES,
        ROUTE_DEFINITIONS,
        normalizeRouteState,
        setRouteOverride,
        clearRouteOverride,
        filterAndRankByRoute,
        disambiguateCandidates,
        recallRouteSelfCheck
    });

    root.LonShaRecallRouteOrchestrator = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);