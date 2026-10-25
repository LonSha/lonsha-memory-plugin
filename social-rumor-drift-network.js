/* ============================================================
 * social-rumor-drift-network.js — [L11-X2 · 第十一期前沿拓展机制]
 * 社交网络传闻流变与群体认知失真网 (Social Rumor Drift & Distorted Network)
 * ------------------------------------------------------------
 * 【核心设计】
 *   打破「全员拥有上帝视角或绝对客观共享事实」的失真假象，构建【流言发酵与认知失真网】：
 *   1. 社交多跳传播链（Cascading Social Hops）：
 *      事实在不同派系、不同阶层的 NPC 之间传递时，根据传播者属性发生漂移；
 *   2. 信息畸变与添油加醋（Rumor Drift & Distortion）：
 *      客观事实（“A在夜市与守卫争执”）经过三次转述演变为离谱传闻（“A刺杀了治安队长并叛逃”）；
 *   3. 传闻反噬回流：当失真传闻重新传回主角或焦点角色耳中时，引爆深刻的社会性误解与公关危机。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRumorNetwork = factory();
        root.SocialRumorDriftNetwork = root.LonShaRumorNetwork;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 模拟事实在 NPC 社交网络中单跳传播的信息畸变
     * @param {Object} currentRumor - 当前传闻版本 { text, distortionScore, hops }
     * @param {Object} spreader - 传播者偏见特征 { faction, hostility, credulity }
     * @returns {Object} 畸变后的新传闻
     */
    function propagateRumorHop(currentRumor = {}, spreader = {}) {
        const text = String(currentRumor.text || currentRumor.content || '').trim();
        const score = Number(currentRumor.distortionScore || 0);
        const hops = Number(currentRumor.hops || 0);

        const hostility = Number(spreader.hostility || 0); // 敌意 [0..1]
        let evolvedText = text;

        if (hostility > 0.5) {
            // 敌对派系夸大罪状
            if (evolvedText.includes('争吵') || evolvedText.includes('起冲突') || evolvedText.includes('争执')) {
                evolvedText = evolvedText.replace(/争吵|起冲突|争执/g, '拔刀血洗当场');
            } else if (evolvedText.includes('受伤')) {
                evolvedText = evolvedText.replace(/受伤/g, '惨死');
            } else {
                evolvedText = `${evolvedText}，据说手段极其残忍，连妇孺都不放过`;
            }
        } else {
            // 中立/盲目市民添油加醋
            evolvedText = `听人言之凿凿地说：${evolvedText}`;
        }

        const newScore = Number(Math.min(1.0, score + 0.25 + (hostility * 0.2)).toFixed(2));

        return {
            originalFact: currentRumor.originalFact || text,
            text: evolvedText,
            distortionScore: newScore,
            hops: hops + 1,
            lastSpreaderFaction: spreader.faction || '街头传闻'
        };
    }

    /**
     * 生成街头传闻对当事人的提示词震撼约束
     * @param {Object} finalRumor - 最终在市井流传的传闻
     * @param {string} targetActor - 当事人名字
     * @returns {string} 提示词引导
     */
    function formatRumorFeedbackDirective(finalRumor = {}, targetActor = '') {
        const text = finalRumor.text || '';
        return `【市井流言风暴·认知失真】：在外界民众与守卫耳中，事件已被严重歪曲为：“${text}”。当 [${targetActor}] 与外界接触时，面对的是充满畏惧、敌意或指指点点的恶意舆论，其真实解释会被视作狡辩。`;
    }

    return {
        propagateRumorHop,
        formatRumorFeedbackDirective
    };
}));