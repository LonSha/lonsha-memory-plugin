/**
 * memory-emotional-antiphony.js - 情绪反向召回引擎 (Emotional Antiphony Engine)
 * 
 * 机制借鉴与超越：
 * 吸收 SillyTavern 记忆宫殿 (Memory Palace v3.4.0) 的情绪反向召回机制。
 * 当当前剧情或输入检测到强烈负面张力（冲突、争执、怀疑、冷漠）且角色与主角拥有历史
 * 正向羁绊（羁绊/好感度 >= 门槛）时，自动触发反向召回，提取历史中的温情高光、
 * 誓言承诺或初体验记忆，赋予 AI 复杂的心理拉扯与戏剧和解契机。
 */

/* 单次装载包装（[v3.421.0] 修）：本文件在宿主页是按 extra_js 逐个 eval 的经典脚本，
 *   顶层 `class`/`const` 落在同一个脚本作用域里；同一页重复加载一次就会 `Identifier ...
 *   has already been declared`。故与仓内既有模块同形，收进 IIFE。
 *   导出仍是双通道：IIFE 内 `module.exports` 供 tests 具名 import，`root.*` 供宿主消费。 */
(function (root) {
'use strict';
const POLAR_SPECTRUM = {
    anger: ['warmth', 'tenderness', 'shared_secret'],
    conflict: ['promise', 'intimacy', 'first_encounter'],
    distrust: ['rescue', 'sacrifice', 'shared_secret', 'promise'],
    coldness: ['warmth', 'tenderness', 'intimacy'],
    betrayal: ['sacrifice', 'oath', 'rescue'],
    grief: ['comfort', 'warmth', 'companionship'],
    despair: ['hope', 'rescue', 'promise'],
    fear: ['protection', 'rescue', 'warmth']
};

class EmotionalAntiphonyEngine {
    constructor(config = {}) {
        this.minBondThreshold = config.minBondThreshold ?? 35;
        this.maxAntiphonalRecalls = config.maxAntiphonalRecalls ?? 2;
        this.spectrum = { ...POLAR_SPECTRUM, ...(config.customSpectrum || {}) };
    }

    /**
     * 评估情绪极性并计算反向检索目标
     * @param {Object} params
     * @param {string[]} params.currentEmotions - 当前检测到的情绪标签
     * @param {number} params.characterBondScore - 该角色与主角的当前羁绊值 (-100 ~ 100)
     * @param {boolean} params.isIrreversibleConflict - 是否处于不可逆决裂态（若 true 则抑制反向召回）
     * @returns {Object} 判定结论与目标极性标签
     */
    evaluateAntiphonalTrigger({ currentEmotions = [], characterBondScore = 0, isIrreversibleConflict = false }) {
        if (isIrreversibleConflict) {
            return {
                triggered: false,
                reason: 'suppressed_by_irreversible_conflict',
                targetPositiveTags: []
            };
        }

        if (characterBondScore < this.minBondThreshold) {
            return {
                triggered: false,
                reason: 'bond_score_below_threshold',
                targetPositiveTags: []
            };
        }

        const negativeHits = currentEmotions.filter(e => this.spectrum[e.toLowerCase()]);
        if (negativeHits.length === 0) {
            return {
                triggered: false,
                reason: 'no_negative_tension_detected',
                targetPositiveTags: []
            };
        }

        const targetPositiveTags = new Set();
        for (const neg of negativeHits) {
            const targets = this.spectrum[neg.toLowerCase()] || [];
            targets.forEach(t => targetPositiveTags.add(t));
        }

        return {
            triggered: true,
            triggeringNegativeEmotions: negativeHits,
            targetPositiveTags: Array.from(targetPositiveTags),
            bondScore: characterBondScore
        };
    }

    /**
     * 在记忆库候选集中检索并构建反向召回切片
     * @param {Object} params
     * @param {Array} params.memoryEvents - 候选记忆事件数组 [{ id, title, content, emotionalTags: [], importance }]
     * @param {Object} params.evaluation - evaluateAntiphonalTrigger 的返回值
     * @returns {Object} 反向召回结果包
     */
    assembleAntiphonalRecalls({ memoryEvents = [], evaluation }) {
        if (!evaluation || !evaluation.triggered) {
            return {
                recalls: [],
                promptSnippet: ''
            };
        }

        const targetTags = new Set(evaluation.targetPositiveTags);

        // 打分匹配
        const matched = [];
        for (const ev of memoryEvents) {
            const tags = (ev.emotionalTags || []).map(t => t.toLowerCase());
            const overlap = tags.filter(t => targetTags.has(t)).length;
            if (overlap > 0) {
                const importanceBoost = ev.importance === 'major' ? 1.5 : (ev.importance === 'permanent' ? 2.0 : 1.0);
                const score = overlap * 10 * importanceBoost;
                matched.push({
                    event: ev,
                    score,
                    matchedTags: tags.filter(t => targetTags.has(t))
                });
            }
        }

        // 排序并截取 Top-N
        matched.sort((a, b) => b.score - a.score);
        const selected = matched.slice(0, this.maxAntiphonalRecalls);

        if (selected.length === 0) {
            return {
                recalls: [],
                promptSnippet: ''
            };
        }

        const eventLines = selected.map(s => 
            `· [过往高光·${s.event.title || '温情记忆'}] ${s.event.content} (触动心弦: ${s.matchedTags.join('/')})`
        );

        const promptSnippet = [
            `【心理暗流·反向温情共鸣】`,
            `尽管当前情境陷入 [${evaluation.triggeringNegativeEmotions.join('、')}]，但由于过往羁绊深刻，脑海中仍难以抑制地闪回过往：`,
            ...eventLines,
            `角色内心应当展现矛盾拉扯与情感防御，不可单薄地极端化处理冲突。`
        ].join('\n');

        return {
            recalls: selected.map(s => ({
                id: s.event.id,
                title: s.event.title,
                score: s.score,
                matchedTags: s.matchedTags
            })),
            promptSnippet
        };
    }
}

root.LonShaEmotionalAntiphony = { EmotionalAntiphonyEngine };
if (typeof module !== 'undefined' && module.exports) module.exports = { EmotionalAntiphonyEngine };
})(typeof globalThis !== 'undefined' ? globalThis : window);
