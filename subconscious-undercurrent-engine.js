/* ============================================================
 * subconscious-undercurrent-engine.js — [L11-X1 · 第十一期前沿拓展机制]
 * 角色未明言动机与潜意识暗涌推演器 (Subconscious Undercurrent Engine)
 * ------------------------------------------------------------
 * 【核心设计】
 *   打破传统 NPC「言行一致、有问必答」的工具人假象，赋予其文学层面的【潜意识冰山与隐藏动机】：
 *   1. 潜意识张力三元组（Desire / Fear / Guilt）：
 *      表面诉求与深层渴望的剪刀差；
 *   2. 言不由衷推演（Speech-Action Discrepancy）：
 *      当表面对话触及深层恐惧或愧疚时，推演出微观的防御性回避（话语闪烁、转移话题、过度解释）；
 *   3. 暗涌独白提示插桩：在提示词中生成角色的心理暗涌指引，使对话具备戏剧张力。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSubconsciousEngine = factory();
        root.SubconsciousUndercurrentEngine = root.LonShaSubconsciousEngine;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 推演角色在当前情境下的潜意识暗涌状态
     * @param {Object} actorProfile - 角色隐藏动机档案 { unstatedDesire, deepFear, latentGuilt }
     * @param {string} incomingTopic - 当前玩家/对方提及的话题
     * @returns {Object} 暗涌推演结果
     */
    function deduceUndercurrent(actorProfile = {}, incomingTopic = '') {
        const desire = actorProfile.unstatedDesire || '不愿承认的被认可渴望';
        const fear = actorProfile.deepFear || '害怕再次被弃若敝屣';
        const guilt = actorProfile.latentGuilt || null;

        const topic = String(incomingTopic || '').trim();
        let triggeredElement = null;
        let evasionType = 'none';

        // 碰撞判定
        if (topic && (topic.includes('离开') || topic.includes('抛弃') || topic.includes('一个人') || topic.includes('走'))) {
            triggeredElement = 'fear';
            evasionType = 'defensive_pride'; // 用傲慢掩盖恐惧
        } else if (guilt && topic && (topic.includes('对不起') || topic.includes('当初') || topic.includes('道歉'))) {
            triggeredElement = 'guilt';
            evasionType = 'topic_deflection'; // 转移话题，回避愧疚
        } else if (topic && (topic.includes('喜欢') || topic.includes('相信') || topic.includes('同行'))) {
            triggeredElement = 'desire';
            evasionType = 'ambiguous_feign'; // 表面推辞，实则渴求
        }

        let undercurrentDirective = '';
        if (triggeredElement === 'fear') {
            undercurrentDirective = `【潜意识暗涌·防御激发】：对方的话题触碰了角色心底最深的恐惧（${fear}）。角色的表面反应绝不可直接坦承脆弱，而是会下意识用冷淡、嘲弄或刻意拉开距离的言辞来构筑心理护甲。`;
        } else if (triggeredElement === 'guilt') {
            undercurrentDirective = `【潜意识暗涌·愧疚逃逸】：对方提及的内容刺痛了角色隐秘的愧疚（${guilt}）。角色的视线会微不可察地下移或转移话题，言辞变得简短生硬。`;
        } else if (triggeredElement === 'desire') {
            undercurrentDirective = `【潜意识暗涌·深层渴望】：角色内心渴望得到确认（${desire}），但碍于自尊或戒备，表面上会假装漫不经心或找借口掩饰期待。`;
        } else {
            undercurrentDirective = `【潜意识常态】：角色保持表里基本平衡，但深层动机（${desire}）仍在潜移默化地主导其对利益与距离的算计。`;
        }

        return {
            triggeredElement,
            evasionType,
            undercurrentDirective,
            desire,
            fear,
            guilt
        };
    }

    return {
        deduceUndercurrent
    };
}));