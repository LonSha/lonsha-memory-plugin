/* ========================================================
 * meaning-map.js — [M8-X2 · 第八期规划] 意义地图内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决长线对话中重要意象（物件、地名、约定词）的象征含义被磨平为普通名词的问题：
 *     ① 意象演变阶段：origin（初见原义）/ invested（倾注情感）/
 *        symbolic（核心信物）/ contested（矛盾焦点）/ transformed（释怀升华）；
 *     ② 多角色主观视角映射：同一物件在不同人物心中有截然不同的象征；
 *     ③ 演变时间线追溯：记录赋予新意义的关键事件与来源楼层；
 *     ④ 会话隔离，严格纯函数，下游提示词切片生成。
 * ======================================================== */
(function (root) {
    'use strict';

    const MEANING_STAGES = Object.freeze({
        ORIGIN: 'origin',
        INVESTED: 'invested',
        SYMBOLIC: 'symbolic',
        CONTESTED: 'contested',
        TRANSFORMED: 'transformed'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeMeaningMapState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                symbols: {},
                updatedAt: Date.now()
            };
        }
        const symbols = {};
        if (raw.symbols && typeof raw.symbols === 'object') {
            for (const [id, sym] of Object.entries(raw.symbols)) {
                if (!sym || typeof sym !== 'object') continue;
                symbols[id] = {
                    id: safeStr(sym.id) || id,
                    name: safeStr(sym.name) || '未命名意象',
                    history: safeArr(sym.history),
                    perspectives: (sym.perspectives && typeof sym.perspectives === 'object') ? { ...sym.perspectives } : {}
                };
            }
        }
        return {
            symbols,
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 为意象追加一次意义跃迁
     */
    function recordMeaningShift(state, spec) {
        const s = normalizeMeaningMapState(state);
        if (!spec || typeof spec !== 'object') {
            return { success: false, reason: 'invalid-spec', state: s };
        }
        const symbolId = safeStr(spec.symbolId);
        const name = safeStr(spec.name) || symbolId;
        if (!symbolId) {
            return { success: false, reason: 'missing-symbol-id', state: s };
        }

        const stage = Object.values(MEANING_STAGES).includes(spec.stage) ? spec.stage : MEANING_STAGES.INVESTED;
        const node = {
            stage,
            meaningSummary: safeStr(spec.meaningSummary) || '意义更新',
            triggerEvent: safeStr(spec.triggerEvent),
            floor: typeof spec.floor === 'number' ? spec.floor : null,
            recordedAt: Date.now()
        };

        const existing = s.symbols[symbolId] || {
            id: symbolId,
            name,
            history: [],
            perspectives: {}
        };

        // 若指定了角色主观视角
        let perspectives = { ...existing.perspectives };
        const observer = safeStr(spec.observer);
        if (observer) {
            perspectives[observer] = {
                currentMeaning: node.meaningSummary,
                stage: node.stage,
                updatedAt: node.recordedAt
            };
        }

        const updatedSymbol = {
            ...existing,
            name,
            history: [...existing.history, node],
            perspectives
        };

        return {
            success: true,
            symbol: updatedSymbol,
            state: {
                ...s,
                symbols: {
                    ...s.symbols,
                    [symbolId]: updatedSymbol
                },
                updatedAt: Date.now()
            }
        };
    }

    /**
     * 生成当前意象在 Prompt 中的紧凑描述切片
     */
    function generateMeaningPromptSlice(symbol, observer) {
        if (!symbol || typeof symbol !== 'object') return '';
        const obs = safeStr(observer);
        let meaning = '';
        if (obs && symbol.perspectives && symbol.perspectives[obs]) {
            meaning = `[${obs}的视角] ${symbol.perspectives[obs].currentMeaning}`;
        } else if (symbol.history && symbol.history.length > 0) {
            const latest = symbol.history[symbol.history.length - 1];
            meaning = latest.meaningSummary;
        } else {
            meaning = symbol.name;
        }
        return `【象征意象·${symbol.name}】${meaning}`;
    }

    function meaningMapSelfCheck() {
        const problems = [];
        if (Object.keys(MEANING_STAGES).length !== 5) problems.push('MEANING_STAGES 必须恰好为 5 态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        MEANING_STAGES,
        normalizeMeaningMapState,
        recordMeaningShift,
        generateMeaningPromptSlice,
        meaningMapSelfCheck
    });

    root.LonShaMeaningMap = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);