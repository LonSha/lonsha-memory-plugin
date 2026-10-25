/* ============================================================
 * phase-transition-shift-safeguard.js — [L11-O8 · 第十一期认知架构优化]
 * 状态突变不可逆质变守护器 (Phase Transition & Irreversible Shift Safeguard)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长程叙事中重大剧情里程碑（反目成仇、生死告白、血契结缔、堕入魔道）
 *   极易因长上下文稀释而发生「廉价的剧情退步或无缝回档」：
 *   1. 相变单向阀（One-Way Valve）：
 *      一旦触发相变（Phase Transition），系统将历史交互模式物理封印；
 *   2. 交互协议重置：生成全新的底座提示词约束，严禁退回旧有舒适区客套；
 *   3. 心结解除门禁（Closure Gate）：若要达成任何程度的和解或关系软化，
 *      必须显式通过代价巨大的仪式性事件，杜绝轻浮复合。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPhaseSafeguard = factory();
        root.PhaseTransitionShiftSafeguard = root.LonShaPhaseSafeguard;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const TRANSITION_TYPES = Object.freeze({
        IRREVERSIBLE_RUPTURE: 'irreversible_rupture', // 彻底决裂/誓不两立
        BLOOD_OATH: 'blood_oath',                     // 生死契约/忠诚烙印
        FALLEN_CORRUPTION: 'fallen_corruption',       // 黑化堕落/人性剥落
        ETERNAL_CONFESSION: 'eternal_confession'      // 永恒确认/不可逆依恋
    });

    /**
     * 记录并确权一个不可逆相变里程碑
     * @param {Object} currentRelationship - 当前关系实体
     * @param {Object} transitionEvent - 相变触发事件 { type, cause, floor, actors }
     * @returns {Object} 锁定后的相变关系态
     */
    function lockPhaseTransition(currentRelationship = {}, transitionEvent = {}) {
        const type = transitionEvent.type || TRANSITION_TYPES.IRREVERSIBLE_RUPTURE;
        const cause = transitionEvent.cause || '重大不可逆历史事件';
        const floor = Number(transitionEvent.floor || 1);

        const lockedState = {
            ...currentRelationship,
            phaseLocked: true,
            phaseType: type,
            lockedAtFloor: floor,
            lockCause: cause,
            closureAchieved: false, // 是否达成心结解开
            prePhaseHistoryArchived: true
        };

        // 构造针对模型的单向阀不可逆硬约束
        let protocolDirective = '';
        if (type === TRANSITION_TYPES.IRREVERSIBLE_RUPTURE) {
            protocolDirective = `【相变单向阀：绝裂已定】：角色与对方的关系已发生不可逆的本质崩塌（原因：${cause}）。旧日的所有温情与习惯全部被封印。角色言行严禁出现任何轻浮的妥协、客套撒娇或毫无由头的旧情复燃。`;
        } else if (type === TRANSITION_TYPES.BLOOD_OATH) {
            protocolDirective = `【相变单向阀：永恒信约】：双方已确立生死不渝的契约纽带。即使面临猜忌与困境，其底层忠诚与誓约已不可动摇。`;
        }

        lockedState.protocolDirective = protocolDirective;
        return lockedState;
    }

    /**
     * 校验当前生成的对白或动作是否试图非法回退至相变前状态
     * @param {string} generatedText - AI 生成的文本
     * @param {Object} lockedPhaseState - 锁定的相变状态
     * @returns {Object} { allowed, regressionDetected, warning }
     */
    function verifyPhaseRegression(generatedText = '', lockedPhaseState = {}) {
        if (!lockedPhaseState || !lockedPhaseState.phaseLocked || lockedPhaseState.closureAchieved) {
            return { allowed: true, regressionDetected: false, warning: null };
        }

        const text = String(generatedText || '');
        const type = lockedPhaseState.phaseType;

        if (type === TRANSITION_TYPES.IRREVERSIBLE_RUPTURE) {
            // 决裂后若出现轻浮打情骂俏、亲昵称呼
            if (/(撒娇|扑进怀里|开心地笑了起来|亲昵地|像往常一样|甜蜜地)/.test(text)) {
                return {
                    allowed: false,
                    regressionDetected: true,
                    warning: '检测到严重的相变退行：双方已决裂，严禁未经相变解除就出现往日亲昵行为'
                };
            }
        }

        return { allowed: true, regressionDetected: false, warning: null };
    }

    return {
        TRANSITION_TYPES,
        lockPhaseTransition,
        verifyPhaseRegression
    };
}));