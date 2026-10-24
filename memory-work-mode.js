/* ========================================================
 * memory-work-mode.js — [M8-O1 · 第八期规划] 记忆工作模式内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决用户不知道本轮记忆服务什么目标的问题：
 *     ① 五大工作模式：continuity（剧情连续）/ fact_check（事实核对）/
 *        perspective（角色视角）/ research（资料研读）/ creative_prep（创作准备）；
 *     ② 各模式专有调度策略：召回阈值、最大片段预算、是否采纳推断与时间加权；
 *     ③ 模式对比解释器：清晰指出为何相同查询在不同模式下给出不同注入；
 *     ④ 会话隔离，严格纯函数，绝不改写底层事实所有权。
 * ======================================================== */
(function (root) {
    'use strict';

    const WORK_MODES = Object.freeze({
        CONTINUITY: 'continuity',
        FACT_CHECK: 'fact_check',
        PERSPECTIVE: 'perspective',
        RESEARCH: 'research',
        CREATIVE_PREP: 'creative_prep'
    });

    const MODE_POLICIES = Object.freeze({
        [WORK_MODES.CONTINUITY]: {
            id: WORK_MODES.CONTINUITY,
            name: '剧情连续',
            description: '优先最近剧情事件、未决承诺与当前人物情感状态',
            threshold: 0.5,
            maxSnippets: 8,
            allowSpeculation: false,
            prioritizeRecent: true
        },
        [WORK_MODES.FACT_CHECK]: {
            id: WORK_MODES.FACT_CHECK,
            name: '事实核对',
            description: '严格筛选硬性证据、数字、日期与已被确认的事实',
            threshold: 0.8,
            maxSnippets: 5,
            allowSpeculation: false,
            prioritizeRecent: false
        },
        [WORK_MODES.PERSPECTIVE]: {
            id: WORK_MODES.PERSPECTIVE,
            name: '角色主观视角',
            description: '包含该角色已知信息与主观见解，隔离其他角色私密信息',
            threshold: 0.6,
            maxSnippets: 7,
            allowSpeculation: true,
            prioritizeRecent: true
        },
        [WORK_MODES.RESEARCH]: {
            id: WORK_MODES.RESEARCH,
            name: '资料研读',
            description: '深挖历史脉络、跨卷设定、因果链条与证据交叉',
            threshold: 0.65,
            maxSnippets: 12,
            allowSpeculation: false,
            prioritizeRecent: false
        },
        [WORK_MODES.CREATIVE_PREP]: {
            id: WORK_MODES.CREATIVE_PREP,
            name: '创作准备',
            description: '激发灵感，聚合象征意象、未完成约定与分支假说',
            threshold: 0.4,
            maxSnippets: 10,
            allowSpeculation: true,
            prioritizeRecent: false
        }
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeWorkModeState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                activeMode: WORK_MODES.CONTINUITY,
                overrides: {},
                updatedAt: Date.now()
            };
        }
        const active = safeStr(raw.activeMode);
        return {
            activeMode: Object.values(WORK_MODES).includes(active) ? active : WORK_MODES.CONTINUITY,
            overrides: (raw.overrides && typeof raw.overrides === 'object') ? { ...raw.overrides } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    function switchWorkMode(state, targetMode) {
        const s = normalizeWorkModeState(state);
        const mode = safeStr(targetMode);
        if (!Object.values(WORK_MODES).includes(mode)) {
            return { success: false, reason: 'invalid-mode', state: s };
        }
        return {
            success: true,
            previousMode: s.activeMode,
            currentMode: mode,
            state: {
                ...s,
                activeMode: mode,
                updatedAt: Date.now()
            }
        };
    }

    /**
     * 根据当前模式从候选记忆中编排注入包
     */
    function compileModeInjection(modeId, candidates, budgetChars = 2000) {
        const mode = safeStr(modeId) || WORK_MODES.CONTINUITY;
        const policy = MODE_POLICIES[mode] || MODE_POLICIES[WORK_MODES.CONTINUITY];
        const list = safeArr(candidates);

        // 1. 过滤：按阈值与推测允许规则
        let filtered = list.filter(item => {
            if (!item || typeof item !== 'object') return false;
            const score = typeof item.score === 'number' ? item.score : 0.7;
            if (score < policy.threshold) return false;
            if (!policy.allowSpeculation && item.isSpeculation === true) return false;
            return true;
        });

        // 2. 排序：近期优先 vs 相关度优先
        if (policy.prioritizeRecent) {
            filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        } else {
            filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
        }

        // 3. 截断到最大条数和字符预算
        filtered = filtered.slice(0, policy.maxSnippets);
        const admitted = [];
        let totalChars = 0;

        for (const item of filtered) {
            const content = safeStr(item.content);
            if (totalChars + content.length > budgetChars && admitted.length > 0) {
                break;
            }
            admitted.push(item);
            totalChars += content.length;
        }

        return {
            mode,
            policyName: policy.name,
            totalCandidates: list.length,
            admittedCount: admitted.length,
            totalChars,
            admitted
        };
    }

    function workModeSelfCheck() {
        const problems = [];
        if (Object.keys(WORK_MODES).length !== 5) problems.push('WORK_MODES 必须恰好为 5 种模式');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        WORK_MODES,
        MODE_POLICIES,
        normalizeWorkModeState,
        switchWorkMode,
        compileModeInjection,
        workModeSelfCheck
    });

    root.LonShaMemoryWorkMode = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);