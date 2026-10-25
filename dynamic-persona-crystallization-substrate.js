/* ============================================================
 * dynamic-persona-crystallization-substrate.js — [L11-O9 · 第十一期认知架构优化]
 * 角色心智底座动态结晶与热重构器 (Dynamic Persona Crystallization Substrate)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长篇跑团（300+轮）后角色性格与初始角色卡严重脱节的精神分裂问题：
 *   1. 动态人设差量提取（Persona Crystallization Delta）：
 *      从长期自传叙事、重大相变抉择与不可逆心理印记中，提炼角色【当下实际性格】；
 *   2. 人设热重构（Live Substrate Patching）：
 *      在提示词拼装期，将结晶的人设补丁注入到 System Prompt 核心人设区，
 *      优雅覆盖初始卡中的刻板设定，使角色真实呈现“历经沧桑后的当下自我”；
 *   3. 蜕变轨迹审计：保留角色性格蜕变的历史版本链，随时可溯源。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPersonaSynthesizer = factory();
        root.DynamicPersonaCrystallizationSubstrate = root.LonShaPersonaSynthesizer;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 根据历史相变、关键创伤与自传叙事提炼动态结晶人设增量
     * @param {Object} initialCard - 初始人设卡 { name, traits, summary }
     * @param {Array} lifeEvents - 关键人生经历列表
     * @param {Object} currentPsychology - 当前心理阻尼/相变状态
     * @returns {Object} 结晶人设增量包
     */
    function crystallizePersonaDelta(initialCard = {}, lifeEvents = [], currentPsychology = {}) {
        const actorName = initialCard.name || '角色';
        const initialTraits = Array.isArray(initialCard.traits) ? initialCard.traits : [];

        const shifts = [];
        let evolvedMaturity = 1; // 成熟度指数

        // 遍历重大经历
        if (Array.isArray(lifeEvents)) {
            for (const ev of lifeEvents) {
                if (ev.isTrauma || ev.kind === 'betrayal') {
                    shifts.push('褪去了往日的轻信，眼神变得沉静而带有一丝难以察觉的防备');
                    evolvedMaturity += 1.5;
                } else if (ev.kind === 'sacrifice' || ev.kind === 'blood_oath') {
                    shifts.push('拥有了愿意为之付出一切的坚固信仰，不再迷茫动摇');
                    evolvedMaturity += 2.0;
                }
            }
        }

        // 结合当前阻尼与相变态
        if (currentPsychology.phaseLocked) {
            shifts.push(`历经不可逆的命运剧变（${currentPsychology.lockCause || '重大抉择'}），性格基调彻底完成了冷峻的质变蜕变`);
        }

        // 构造动态人设重构注入块
        let promptBlock = '';
        if (shifts.length > 0) {
            promptBlock = `【心智蜕变与动态性格底座】：\n虽然档案记录 [${actorName}] 早期性格为 [${initialTraits.join('、') || '初始设定'}]，但历经漫长岁月与生死洗礼，当下的 [${actorName}] 已经发生深刻蜕变：\n${shifts.map(s => `· ${s}`).join('\n')}\n请以此蜕变后的心智状态作为当前对话演出的核心基底。`;
        }

        return {
            actorName,
            evolvedMaturity: Number(evolvedMaturity.toFixed(1)),
            shifts,
            promptBlock,
            crystallizedAt: Date.now()
        };
    }

    return {
        crystallizePersonaDelta
    };
}));