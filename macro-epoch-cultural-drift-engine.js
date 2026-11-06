/* ============================================================
 * macro-epoch-cultural-drift-engine.js — [L20-6 · 第二十期史诗级双项目双计划]
 * 宏观纪元演进与世界观文化漂移引擎 (Macro Epoch & Cultural Drift Engine)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决超长程宏大叙事中“岁月流逝但时代风貌、禁忌律令、社会语系停滞不前”的失真感：
 *   1. 纪元时代更迭模型（Epoch Transition Timeline）：
 *      按叙事楼层或宏观时间戳跨度定义时代阶段（如：黄金盛世 -> 帝国余晖 -> 灾厄乱纪 -> 觉醒新生）；
 *   2. 文化风尚与时代禁忌漂移（Societal Value & Taboo Drift）：
 *      每个纪元自带独特的流行称谓、禁忌词汇与主导信仰体系；
 *   3. 时代印记对长程记忆的染色校准（Epoch-Aware Salience Calibration）：
 *      古老记忆在当今纪元会被赋予「历史厚重感/失传典故」色彩，防止现代语境违和感。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMacroEpochDrift = factory();
        root.MacroEpochCulturalDriftEngine = root.LonShaMacroEpochDrift;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 创建宏观纪元漂移初始状态
     */
    function createInitialEpochState() {
        return {
            currentEpochId: 'era_default',
            epochs: new Map([
                ['era_default', {
                    id: 'era_default',
                    name: '当前通用纪元',
                    startFloor: 0,
                    socialTone: '稳步演进',
                    taboos: [],
                    promotedConcepts: [],
                    archaicLinguisticStyle: '当下自然白话口吻'
                }]
            ]),
            driftHistory: [],
            updatedAt: Date.now()
        };
    }

    /**
     * 注册或切换时代纪元
     */
    function registerEpoch(state, epochSpec = {}) {
        if (!state || !state.epochs) return null;
        const id = String(epochSpec.id || `epoch_${Date.now()}`);
        const epoch = {
            id,
            name: String(epochSpec.name || '新纪元').trim(),
            startFloor: Number.isFinite(epochSpec.startFloor) ? epochSpec.startFloor : 0,
            socialTone: String(epochSpec.socialTone || '时代变迁').trim(),
            taboos: Array.isArray(epochSpec.taboos) ? epochSpec.taboos.map(s => String(s).trim()).filter(Boolean) : [],
            promotedConcepts: Array.isArray(epochSpec.promotedConcepts) ? epochSpec.promotedConcepts.map(s => String(s).trim()).filter(Boolean) : [],
            archaicLinguisticStyle: String(epochSpec.archaicLinguisticStyle || '').trim()
        };

        state.epochs.set(id, epoch);
        state.updatedAt = Date.now();
        return epoch;
    }

    /**
     * 设置当前生效纪元
     */
    function setCurrentEpoch(state, epochId) {
        if (!state || !state.epochs) return false;
        if (state.epochs.has(epochId)) {
            const old = state.currentEpochId;
            state.currentEpochId = epochId;
            state.driftHistory.push({
                fromEpoch: old,
                toEpoch: epochId,
                timestamp: Date.now()
            });
            state.updatedAt = Date.now();
            return true;
        }
        return false;
    }

    /**
     * 获取当前纪元的宏观文化漂移叙事约束指引
     * @param {Object} state - 纪元状态
     * @returns {string|null}
     */
    function resolveEpochCulturalDirectives(state) {
        if (!state || !state.epochs || !state.currentEpochId) return null;
        const current = state.epochs.get(state.currentEpochId);
        if (!current || current.id === 'era_default') return null;

        const parts = [];
        parts.push(`【纪元风尚·${current.name}】当前世界观正处“${current.socialTone}”大背景。`);
        if (current.taboos.length > 0) {
            parts.push(`时代禁忌：严禁或避讳公开谈论[${current.taboos.join('、')}]；`);
        }
        if (current.promotedConcepts.length > 0) {
            parts.push(`主导思潮：社会普遍推崇[${current.promotedConcepts.join('、')}]；`);
        }
        if (current.archaicLinguisticStyle) {
            parts.push(`言辞风尚遵循“${current.archaicLinguisticStyle}”。`);
        }
        return parts.join(' ');
    }

    /**
     * 宽容水合纪元状态
     */
    function hydrateEpochState(raw = {}) {
        const state = createInitialEpochState();
        if (!raw || typeof raw !== 'object') return state;

        state.currentEpochId = String(raw.currentEpochId || 'era_default');
        if (Array.isArray(raw.epochs)) {
            for (const ep of raw.epochs) {
                if (ep && ep.id) state.epochs.set(ep.id, ep);
            }
        } else if (raw.epochs && typeof raw.epochs === 'object') {
            for (const [k, v] of Object.entries(raw.epochs)) {
                if (v && typeof v === 'object') state.epochs.set(k, v);
            }
        }

        if (Array.isArray(raw.driftHistory)) {
            state.driftHistory = raw.driftHistory.slice(-20);
        }

        state.updatedAt = Number(raw.updatedAt) || Date.now();
        return state;
    }

    /**
     * 序列化纪元状态
     */
    function serializeEpochState(state) {
        if (!state || !state.epochs) return { currentEpochId: 'era_default', epochs: [], driftHistory: [], updatedAt: Date.now() };
        const epochs = [];
        for (const ep of state.epochs.values()) {
            epochs.push(ep);
        }
        return {
            currentEpochId: state.currentEpochId || 'era_default',
            epochs,
            driftHistory: Array.isArray(state.driftHistory) ? state.driftHistory.slice(-20) : [],
            updatedAt: state.updatedAt || Date.now()
        };
    }

    return {
        createInitialEpochState,
        registerEpoch,
        setCurrentEpoch,
        resolveEpochCulturalDirectives,
        hydrateEpochState,
        serializeEpochState
    };
}));