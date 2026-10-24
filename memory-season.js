/* ========================================================
 * memory-season.js — [M8-X1 · 第八期规划] 记忆季候内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   让长期记忆不再是永远相同权重的死板文本，而是有节律地浮现与沉寂：
 *     ① 季候四态：dormant（休眠沉淀）/ resurfacing（正在浮现）/
 *        resonant（强烈共鸣）/ afterglow（回响余韵）；
 *     ② 四种触发契机：anniversary（周期纪念）/ revisit_location（重回旧地）/
 *        relation_milestone（关系转折）/ echo_event（相似事件）；
 *     ③ 用户互动响应：embrace（接纳唤醒）/ defer（延后改期）/ mute（静音暂隐）/ probe（追问细节）；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const SEASON_PHASES = Object.freeze({
        DORMANT: 'dormant',
        RESURFACING: 'resurfacing',
        RESONANT: 'resonant',
        AFTERGLOW: 'afterglow'
    });

    const SEASON_ACTIONS = Object.freeze({
        EMBRACE: 'embrace',
        DEFER: 'defer',
        MUTE: 'mute',
        PROBE: 'probe'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeSeasonState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                seasons: {},
                userActions: {},
                updatedAt: Date.now()
            };
        }
        return {
            seasons: (raw.seasons && typeof raw.seasons === 'object') ? { ...raw.seasons } : {},
            userActions: (raw.userActions && typeof raw.userActions === 'object') ? { ...raw.userActions } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 评估记忆条目在当前情境下的季候相位
     */
    function evaluateSeasonPhase(memoryItem, context = {}) {
        if (!memoryItem || typeof memoryItem !== 'object') {
            return { phase: SEASON_PHASES.DORMANT, reason: 'invalid-item' };
        }
        const userAction = context.userActions ? context.userActions[memoryItem.id] : null;
        if (userAction === SEASON_ACTIONS.MUTE) {
            return { phase: SEASON_PHASES.DORMANT, reason: 'user-muted' };
        }
        if (userAction === SEASON_ACTIONS.DEFER) {
            return { phase: SEASON_PHASES.DORMANT, reason: 'user-deferred' };
        }

        const currentLocation = safeStr(context.currentLocation);
        const itemLocation = safeStr(memoryItem.location);
        if (currentLocation && itemLocation && currentLocation === itemLocation) {
            return { phase: SEASON_PHASES.RESONANT, reason: 'revisit-location-match' };
        }

        const currentTopic = safeStr(context.currentTopic);
        const itemTheme = safeStr(memoryItem.theme);
        if (currentTopic && itemTheme && currentTopic.includes(itemTheme)) {
            return { phase: SEASON_PHASES.RESURFACING, reason: 'theme-echo' };
        }

        return { phase: SEASON_PHASES.DORMANT, reason: 'resting-in-sediment' };
    }

    /**
     * 用户对浮现季候做出处理
     */
    function applySeasonAction(state, memoryId, action) {
        const s = normalizeSeasonState(state);
        const mid = safeStr(memoryId);
        if (!mid) {
            return { success: false, reason: 'missing-memory-id', state: s };
        }
        if (!Object.values(SEASON_ACTIONS).includes(action)) {
            return { success: false, reason: 'invalid-action', state: s };
        }

        return {
            success: true,
            memoryId: mid,
            action,
            state: {
                ...s,
                userActions: {
                    ...s.userActions,
                    [mid]: action
                },
                updatedAt: Date.now()
            }
        };
    }

    function memorySeasonSelfCheck() {
        const problems = [];
        if (Object.keys(SEASON_PHASES).length !== 4) problems.push('SEASON_PHASES 必须恰好为 4 态');
        if (Object.keys(SEASON_ACTIONS).length !== 4) problems.push('SEASON_ACTIONS 必须恰好为 4 项动作');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        SEASON_PHASES,
        SEASON_ACTIONS,
        normalizeSeasonState,
        evaluateSeasonPhase,
        applySeasonAction,
        memorySeasonSelfCheck
    });

    root.LonShaMemorySeason = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);