/* ============================================================
 * cross-examination-confrontation-workbench.js — [L11-O7 · 第十一期认知架构优化]
 * 证据链质询与逆转式对账对抗工作台 (Cross-Examination & Confrontation Workbench)
 * ------------------------------------------------------------
 * 【核心设计】
 *   攻克传统冲突仲裁仅停留在内部安静合并，缺乏戏剧性对质与戳穿高潮：
 *   1. 对质矛盾链发现（Contradiction Discrepancy Discovery）：
 *      自动对比角色口供/证词与物理铁证（物证、时间线不在场证明）；
 *   2. 步步紧逼质询树构建（Interrogation Ladder）：
 *      从隐蔽试探、出示旁证、到致命铁证抛出，赋予角色如同“逆转裁判”般的对质张力；
 *   3. 心理防线击穿判定：当铁证被出示时，强制生成角色惊愕、慌乱或绝望认罪的演出引导。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaConfrontationWorkbench = factory();
        root.CrossExaminationConfrontationWorkbench = root.LonShaConfrontationWorkbench;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const CONFRONTATION_STAGES = Object.freeze({
        PROBING: 'probing',       // 旁敲侧击 / 言语试探
        CORROBORATION: 'corroboration', // 出示旁证 / 缩小退路
        CLIMAX_EVIDENCE: 'climax_evidence' // 致命铁证 / 击穿防线
    });

    /**
     * 构建质询对质链
     * @param {Object} suspectTestimony - 被质询方的口供或谎言
     * @param {Array} hardEvidences - 已经确凿的硬证据库
     * @returns {Object} 质询对质链
     */
    function buildConfrontationChain(suspectTestimony = {}, hardEvidences = []) {
        const claimText = String(suspectTestimony.claim || suspectTestimony.content || '').trim();
        const suspect = suspectTestimony.actor || '对方';

        if (!claimText || !Array.isArray(hardEvidences) || hardEvidences.length === 0) {
            return {
                hasContradiction: false,
                confrontationSteps: [],
                guidancePrompt: ''
            };
        }

        const contradictingEvidences = [];

        for (const ev of hardEvidences) {
            const evContent = String(ev.content || ev.text || '').trim();
            // 简单的对立模式匹配（如声称不在场 vs 出现于现场监控；声称未持有信物 vs 在房间搜出信物）
            if (claimText.includes('没有去过') && (evContent.includes('目击') || evContent.includes('监控') || evContent.includes('脚印'))) {
                contradictingEvidences.push({ evidence: ev, conflictType: 'alibi_refuted' });
            } else if (claimText.includes('没拿') && (evContent.includes('搜出') || evContent.includes('持有') || evContent.includes('指纹'))) {
                contradictingEvidences.push({ evidence: ev, conflictType: 'possession_refuted' });
            } else if (ev.contradictsClaim && ev.contradictsClaim === suspectTestimony.id) {
                contradictingEvidences.push({ evidence: ev, conflictType: 'direct_contradiction' });
            }
        }

        if (contradictingEvidences.length === 0) {
            return {
                hasContradiction: false,
                confrontationSteps: [],
                guidancePrompt: ''
            };
        }

        // 构造三段式质询阶梯
        const primaryEv = contradictingEvidences[0].evidence;
        const steps = [
            {
                stage: CONFRONTATION_STAGES.PROBING,
                directive: `先不要直接揭穿，而是故意询问关于关键细节的问题，观察 [${suspect}] 是否继续圆谎。`
            },
            {
                stage: CONFRONTATION_STAGES.CORROBORATION,
                directive: `指出其言辞中与常理不符的逻辑疑点，步步紧逼封死其借口。`
            },
            {
                stage: CONFRONTATION_STAGES.CLIMAX_EVIDENCE,
                directive: `直接出示致命铁证【${primaryEv.content || primaryEv.title}】，彻底击穿 [${suspect}] 的心理防线。`,
                climaxEvidence: primaryEv
            }
        ];

        const guidancePrompt = `【证据对质对抗指令】：你已掌握戳穿 [${suspect}] 谎言的决定性证据。请遵循逻辑节奏，在对话中展现从冷静质询到致命揭秘的戏剧性张力，绝不可被对方拙劣的借口蒙混过关。`;

        return {
            hasContradiction: true,
            suspect,
            claimText,
            contradictingEvidences,
            confrontationSteps: steps,
            guidancePrompt
        };
    }

    return {
        CONFRONTATION_STAGES,
        buildConfrontationChain
    };
}));