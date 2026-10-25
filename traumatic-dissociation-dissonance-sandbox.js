/* ============================================================
 * traumatic-dissociation-dissonance-sandbox.js — [L11-X4 · 第十一期前沿拓展机制]
 * 角色创伤解离与认知失调自圆沙盒 (Traumatic Dissociation & Dissonance Sandbox)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决传统 AI 角色「得知绝望惨剧后机械接受、毫无文学心理防卫机制」的虚假感：
 *   1. 认知失调沙盒（Cognitive Dissonance Sandbox）：
 *      当遭遇极度残酷的现实真相（创伤强度 > 阈值）时，角色认知触发【创伤解离态】；
 *   2. 心理防御与自圆其说（Defensive Rationalization / Denial）：
 *      在解离期内，角色拒绝直接承认真相，并自发编造逻辑自洽的防御性借口；
 *   3. 现实冲击穿透与崩溃解除：随着外界确凿证据反复冲撞，解离状态由否认、愤怒、逐步过渡至崩溃接受。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaDissociationSandbox = factory();
        root.TraumaticDissociationDissonanceSandbox = root.LonShaDissociationSandbox;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DEFENSE_STAGES = Object.freeze({
        DENIAL: 'denial',         // 否认：绝不可能，这一定是恶作剧/谣言
        RATIONALIZATION: 'rationalization', // 自圆其说：他只是暂时有事离开了
        BREAKDOWN: 'breakdown',   // 破防崩溃：心理防线瓦解，被迫直面残酷真相
        INTEGRATION: 'integration'// 创伤整合：接受现实并带着伤痛前行
    });

    /**
     * 评估突发冲击事件是否触发角色的创伤解离防御
     * @param {Object} traumaticFact - 残酷事实 { content, severity, target }
     * @param {Object} actorVulnerability - 角色脆弱点
     * @returns {Object} 解离沙盒状态
     */
    function triggerDissociationSandbox(traumaticFact = {}, actorVulnerability = {}) {
        const severity = Number(traumaticFact.severity || 0.8);
        const target = traumaticFact.target || '至亲/挚爱';
        const content = traumaticFact.content || '';

        // 严重创伤 (> 0.7) 必然触发初期否认与解离
        const isDissociated = severity >= 0.7;

        let defenseStage = DEFENSE_STAGES.DENIAL;
        let rationalizedNarrative = `这绝对是假的，[${target}] 怎么可能出事？他昨天还答应过我今天回来的！`;

        let promptDirective = `【创伤心理防御·强行否认】：面对残酷真相，角色无法承受巨大的精神冲击，触发了心理防御解离机制。角色绝不可理智平静地接受事实，而是会瞳孔放大、剧烈摇头并愤怒斥责对方胡说八道，坚信对方在欺骗自己。`;

        return {
            isDissociated,
            severity,
            target,
            originalTrauma: content,
            defenseStage,
            rationalizedNarrative,
            impactStrikes: 0,
            promptDirective
        };
    }

    /**
     * 外部确凿证据或现实残酷冲击再次降临，推进解离沙盒阶段演化
     * @param {Object} currentSandbox - 当前解离状态
     * @param {Object} newStrike - 新的现实证据冲击
     * @returns {Object} 推进后的状态
     */
    function progressDissociation(currentSandbox = {}, newStrike = {}) {
        if (!currentSandbox.isDissociated) return currentSandbox;

        const strikes = Number(currentSandbox.impactStrikes || 0) + 1;
        let stage = currentSandbox.defenseStage;
        let prompt = '';

        if (strikes === 1) {
            stage = DEFENSE_STAGES.RATIONALIZATION;
            prompt = `【创伤心理防御·勉强自圆】：眼前的证据让角色产生强烈的认知失调。角色开始语无伦次地寻找各种荒谬的巧合来解释，试图抓住最后一根救命稻草维持虚假的幻想。`;
        } else if (strikes >= 2) {
            stage = DEFENSE_STAGES.BREAKDOWN;
            prompt = `【创伤心理防御·全面崩溃】：无可辩驳的残酷现实彻底击碎了角色的所有心理借口。所有的幻想破灭，角色陷入巨大的情绪崩溃或彻底失神的呆滞状态，防线彻底失守。`;
        }

        return {
            ...currentSandbox,
            defenseStage: stage,
            impactStrikes: strikes,
            promptDirective: prompt,
            isBrokenDown: stage === DEFENSE_STAGES.BREAKDOWN
        };
    }

    return {
        DEFENSE_STAGES,
        triggerDissociationSandbox,
        progressDissociation
    };
}));