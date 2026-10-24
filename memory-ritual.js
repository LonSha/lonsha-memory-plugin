/* ========================================================
 * memory-ritual.js — [M8-X5 · 第八期规划] 记忆仪式（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决用户与角色对重要节点（告别、纪念、重新开始）缺乏仪式感互动的问题：
 *     ① 三大仪式类型：commemoration（纪念）/ farewell（告别）/ restart（重新开始）；
 *     ② 角色具名响应状态：attending（出席）/ declined（婉拒）/ absent（客观缺席）；
 *     ③ 仪式不自动改写或抹除事实，只产生具备参与者、证言与后续影响的结构化新事件；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const RITUAL_TYPES = Object.freeze({
        COMMEMORATION: 'commemoration',
        FAREWELL: 'farewell',
        RESTART: 'restart'
    });

    const ATTENDANCE_STATUS = Object.freeze({
        ATTENDING: 'attending',
        DECLINED: 'declined',
        ABSENT: 'absent'
    });

    const RITUAL_STATUS = Object.freeze({
        PREPARING: 'preparing',
        CONCLUDED: 'concluded'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeRitualState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                rituals: {}, // id -> ritualObj
                updatedAt: Date.now()
            };
        }
        return {
            rituals: (raw.rituals && typeof raw.rituals === 'object') ? { ...raw.rituals } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 发起一场记忆仪式
     */
    function createRitual(state, ritualSpec, now = Date.now()) {
        const s = normalizeRitualState(state);
        const spec = (ritualSpec && typeof ritualSpec === 'object') ? ritualSpec : {};
        const id = safeStr(spec.id) || `ritual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const title = safeStr(spec.title);
        const type = Object.values(RITUAL_TYPES).includes(spec.type) ? spec.type : RITUAL_TYPES.COMMEMORATION;

        if (!title) {
            return { success: false, reason: 'empty-title', state: s };
        }

        const ritual = {
            id,
            title,
            type,
            themeTarget: safeStr(spec.themeTarget), // 关联的目标人物、事件或物品
            status: RITUAL_STATUS.PREPARING,
            initiator: safeStr(spec.initiator) || 'user',
            participants: {}, // charId -> { status, testimony, respondedAt }
            outcomes: null,
            createdAt: now,
            updatedAt: now
        };

        return {
            success: true,
            ritual,
            state: {
                ...s,
                rituals: {
                    ...s.rituals,
                    [id]: ritual
                },
                updatedAt: now
            }
        };
    }

    /**
     * 记录参与者的出席反馈与仪式证言
     */
    function recordParticipantResponse(state, ritualId, characterId, status, testimony = '', now = Date.now()) {
        const s = normalizeRitualState(state);
        const rId = safeStr(ritualId);
        const cId = safeStr(characterId);
        const ritual = s.rituals[rId];

        if (!ritual) {
            return { success: false, reason: 'ritual-not-found', state: s };
        }
        if (!cId) {
            return { success: false, reason: 'invalid-character-id', state: s };
        }

        const validStatus = Object.values(ATTENDANCE_STATUS).includes(status) ? status : ATTENDANCE_STATUS.ATTENDING;

        const updatedParticipants = {
            ...ritual.participants,
            [cId]: {
                characterId: cId,
                status: validStatus,
                testimony: safeStr(testimony),
                respondedAt: now
            }
        };

        const updatedRitual = {
            ...ritual,
            participants: updatedParticipants,
            updatedAt: now
        };

        return {
            success: true,
            ritual: updatedRitual,
            state: {
                ...s,
                rituals: {
                    ...s.rituals,
                    [rId]: updatedRitual
                },
                updatedAt: now
            }
        };
    }

    /**
     * 结算并礼成仪式，生成总结事件
     */
    function concludeRitual(state, ritualId, outcomesSpec = {}, now = Date.now()) {
        const s = normalizeRitualState(state);
        const rId = safeStr(ritualId);
        const ritual = s.rituals[rId];

        if (!ritual) {
            return { success: false, reason: 'ritual-not-found', state: s };
        }

        const outcomes = {
            summary: safeStr(outcomesSpec.summary) || `完成了关于【${ritual.title}】的${ritual.type}仪式`,
            subsequentPledges: safeArr(outcomesSpec.subsequentPledges),
            concludedAt: now
        };

        const concludedRitual = {
            ...ritual,
            status: RITUAL_STATUS.CONCLUDED,
            outcomes,
            updatedAt: now
        };

        return {
            success: true,
            ritual: concludedRitual,
            state: {
                ...s,
                rituals: {
                    ...s.rituals,
                    [rId]: concludedRitual
                },
                updatedAt: now
            }
        };
    }

    function memoryRitualSelfCheck() {
        const problems = [];
        if (Object.keys(RITUAL_TYPES).length !== 3) problems.push('RITUAL_TYPES 必须恰好为 3 种类型');
        if (Object.keys(ATTENDANCE_STATUS).length !== 3) problems.push('ATTENDANCE_STATUS 必须恰好为 3 种状态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        RITUAL_TYPES,
        ATTENDANCE_STATUS,
        RITUAL_STATUS,
        normalizeRitualState,
        createRitual,
        recordParticipantResponse,
        concludeRitual,
        memoryRitualSelfCheck
    });

    root.LonShaMemoryRitual = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);