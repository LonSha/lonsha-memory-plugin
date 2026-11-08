(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTraumaTabooMatrix = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = 'v17.0.0-L17-X4';

    /**
     * 防御层级枚举:
     * 1: 浅层礼貌推脱 (Polite Deflection)
     * 2: 中层戒备抗拒 (Guarded Resistance)
     * 3: 深层应激解离/反弹 (Acute Traumatic Freeze/Lash-Out)
     */
    function createState(initial = {}) {
        return {
            taboos: Array.isArray(initial.taboos) ? initial.taboos : [
                {
                    topic: '火灾/浓烟',
                    keywords: ['大火', '火灾', '烧死', '浓烟', '被困'],
                    sensitivity: 0.85,
                    currentPressure: 0,
                    defenseTier: 1
                },
                {
                    topic: '背叛/抛弃',
                    keywords: ['丢下我', '背叛', '抛弃', '失信', '孤儿院'],
                    sensitivity: 0.75,
                    currentPressure: 0,
                    defenseTier: 1
                }
            ],
            globalTraumaLevel: typeof initial.globalTraumaLevel === 'number' ? initial.globalTraumaLevel : 0.2,
            lastTriggeredTaboo: initial.lastTriggeredTaboo || null
        };
    }

    function hydrateState(state) {
        if (!state) return createState();
        return {
            taboos: Array.isArray(state.taboos) ? state.taboos : [],
            globalTraumaLevel: typeof state.globalTraumaLevel === 'number' ? state.globalTraumaLevel : 0.2,
            lastTriggeredTaboo: state.lastTriggeredTaboo || null
        };
    }

    function assessTraumaTrigger(state, text = '') {
        if (!state || !state.taboos) return { triggered: false };
        const content = String(text || '').toLowerCase();
        let hitTaboo = null;

        for (const taboo of state.taboos) {
            const matched = (taboo.keywords || []).some(k => content.includes(k.toLowerCase()));
            if (matched) {
                hitTaboo = taboo;
                // 压力累加与层级判定
                const oldPressure = taboo.currentPressure || 0;
                taboo.currentPressure = Math.min(1.0, oldPressure + 0.34);
                // 防御层级
                if (taboo.currentPressure >= 0.8) {
                    taboo.defenseTier = 3;
                } else if (taboo.currentPressure >= 0.4) {
                    taboo.defenseTier = 2;
                } else {
                    taboo.defenseTier = 1;
                }
                state.globalTraumaLevel = Math.min(1.0, (state.globalTraumaLevel || 0) + 0.2);
                state.lastTriggeredTaboo = {
                    topic: taboo.topic,
                    tier: taboo.defenseTier,
                    pressure: taboo.currentPressure
                };
                break;
            }
        }

        if (!hitTaboo) {
            // 随时间自然轻微降温
            for (const taboo of state.taboos) {
                if (taboo.currentPressure > 0) {
                    taboo.currentPressure = Math.max(0, taboo.currentPressure - 0.1);
                    if (taboo.currentPressure < 0.35) taboo.defenseTier = 1;
                    else if (taboo.currentPressure < 0.7) taboo.defenseTier = 2;
                }
            }
            state.globalTraumaLevel = Math.max(0.1, (state.globalTraumaLevel || 0) - 0.05);
            return { triggered: false };
        }

        return {
            triggered: true,
            taboo: hitTaboo,
            tier: hitTaboo.defenseTier,
            pressure: hitTaboo.currentPressure
        };
    }

    function generateTraumaDirectives(state, userUtterance = '') {
        const assessment = assessTraumaTrigger(state, userUtterance);
        if (!assessment.triggered || !assessment.taboo) {
            return [];
        }

        const directives = [];
        const taboo = assessment.taboo;

        if (assessment.tier === 1) {
            directives.push(`【创伤禁忌·第1层礼貌回避】：对方无意触及了你的禁忌话题「${taboo.topic}」。你神色微僵，但仍维持礼貌，下意识轻描淡写岔开话题或转移注意力。`);
        } else if (assessment.tier === 2) {
            directives.push(`【创伤禁忌·第2层警戒抗拒】：对方在持续探问你的创伤记忆「${taboo.topic}」。你的心理防线拉起，语气明显冷淡或生硬，双手下意识攥紧/后退，明确表示不想谈论此事。`);
        } else if (assessment.tier >= 3) {
            directives.push(`【创伤禁忌·第3层急性应激/崩溃】：核心创伤「${taboo.topic}」被重度触发！你出现短暂窒息感或情绪失控反弹，言语颤抖、呼吸紊乱，可能产生剧烈的情绪抗拒甚至突然沉默僵住。`);
        }

        return directives;
    }

    return {
        VERSION,
        createState,
        hydrateState,
        assessTraumaTrigger,
        generateTraumaDirectives
    };
}));