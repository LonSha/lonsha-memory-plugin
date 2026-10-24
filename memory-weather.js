/* ========================================================
 * memory-weather.js — [M8-X3 · 第八期规划] 记忆天气与沉积内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决长期互动世界缺乏连贯沉浸氛围、或靠模型胡乱臆测情绪的问题：
 *     ① 天气类型五态：tranquil（安宁澄澈）/ nostalgic_echo（怀旧回响）/
 *        unsettled_tension（未决张力）/ heavy_reminiscence（厚重沉思）/ dawn_renewal（破晓新生）；
 *     ② 基于客观事实指标合成：未决承诺数、未裁决冲突数、近期里程碑事件与历史沉积规模；
 *     ③ 结构化输出：主基调、氛围提示词、关注主题与不确定度，拒绝黑箱幻觉；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const WEATHER_TYPES = Object.freeze({
        TRANQUIL: 'tranquil',
        NOSTALGIC_ECHO: 'nostalgic_echo',
        UNSETTLED_TENSION: 'unsettled_tension',
        HEAVY_REMINISCENCE: 'heavy_reminiscence',
        DAWN_RENEWAL: 'dawn_renewal'
    });

    const WEATHER_DESCRIPTIONS = Object.freeze({
        [WEATHER_TYPES.TRANQUIL]: {
            name: '安宁澄澈',
            vibe: '日常平静，过往承诺均已落实，人际关系稳定从容'
        },
        [WEATHER_TYPES.NOSTALGIC_ECHO]: {
            name: '怀旧回响',
            vibe: '旧地与旧物频现，往日约定重回心头，带着淡淡温存与回望'
        },
        [WEATHER_TYPES.UNSETTLED_TENSION]: {
            name: '未决张力',
            vibe: '存在未裁决的矛盾或紧迫未达承诺，空气中潜藏着抉择的压力'
        },
        [WEATHER_TYPES.HEAVY_REMINISCENCE]: {
            name: '厚重沉思',
            vibe: '历史积淀深厚，多重因果交织，言行间承载着过往的重量'
        },
        [WEATHER_TYPES.DAWN_RENEWAL]: {
            name: '破晓新生',
            vibe: '重大转折刚刚确立，旧章节画上句号，崭新的方向正在展开'
        }
    });

    function safeNum(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * 计算记忆天气与叙事沉淀投影
     */
    function calculateMemoryWeather(indicators = {}) {
        const openCommitments = safeNum(indicators.openCommitments, 0);
        const unresolvedConflicts = safeNum(indicators.unresolvedConflicts, 0);
        const recentMilestones = safeNum(indicators.recentMilestones, 0);
        const historicalItemCount = safeNum(indicators.historicalItemCount, 0);

        let type = WEATHER_TYPES.TRANQUIL;
        let dominantFactor = 'balanced-state';

        if (unresolvedConflicts > 0 || openCommitments >= 4) {
            type = WEATHER_TYPES.UNSETTLED_TENSION;
            dominantFactor = unresolvedConflicts > 0 ? 'unresolved-conflicts' : 'heavy-commitments';
        } else if (recentMilestones > 0) {
            type = WEATHER_TYPES.DAWN_RENEWAL;
            dominantFactor = 'recent-milestone-breakthrough';
        } else if (historicalItemCount > 50) {
            type = WEATHER_TYPES.HEAVY_REMINISCENCE;
            dominantFactor = 'deep-historical-accumulation';
        } else if (historicalItemCount > 15) {
            type = WEATHER_TYPES.NOSTALGIC_ECHO;
            dominantFactor = 'medium-historical-resonance';
        }

        const meta = WEATHER_DESCRIPTIONS[type];
        return {
            weatherType: type,
            weatherName: meta.name,
            vibeSummary: meta.vibe,
            dominantFactor,
            metrics: {
                openCommitments,
                unresolvedConflicts,
                recentMilestones,
                historicalItemCount
            },
            calculatedAt: Date.now()
        };
    }

    /**
     * 格式化为用于 Prompt 上下文的精炼氛围说明
     */
    function formatWeatherForPrompt(weather) {
        if (!weather || typeof weather !== 'object') return '';
        const name = weather.weatherName || '安宁';
        const vibe = weather.vibeSummary || '';
        return `【世界叙事氛围·${name}】${vibe}`;
    }

    function memoryWeatherSelfCheck() {
        const problems = [];
        if (Object.keys(WEATHER_TYPES).length !== 5) problems.push('WEATHER_TYPES 必须恰好为 5 项');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        WEATHER_TYPES,
        WEATHER_DESCRIPTIONS,
        calculateMemoryWeather,
        formatWeatherForPrompt,
        memoryWeatherSelfCheck
    });

    root.LonShaMemoryWeather = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);