/* ============================================================
 * autobiographical-lens-narrative.js — [L10-X4 · 第十期全量创新]
 * 角色自传式第一视角回忆叙事（Autobiographical Lens Narrative）
 * ------------------------------------------------------------
 * 【核心设计】
 *   人类的记忆从来不是冰冷的录像带，而是带有主观滤镜的自我叙事。
 *   为角色赋予自传叙事透镜（Autobiographical Lens）：
 *   1. 性格偏见与自尊防御（Self-Defense / Ego-Bias）：
 *      傲娇角色淡化示好、放大对方笨拙；自卑角色放大自身过失；冷淡角色略去情感波动。
 *   2. 视角色彩映射（Subjective Reframing）：
 *      在保留底层事实锚点（factId）的前提下，将客观描述重构为符合角色第一人称心理的自白提示。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaAutobiographicalLens = factory();
    root.AutobiographicalLensNarrative = root.LonShaAutobiographicalLens;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LENS_TRAITS = Object.freeze({
        TSUNDERE: 'tsundere',       // 傲娇防御：口是心非，将示好解释为顺便/施舍
        INSECURE: 'insecure',       // 自卑敏感：过度自责，放大对方的叹气与犹豫
        DETACHED: 'detached',       // 疏离克制：压抑感受，仅罗列事实与利弊
        DEVOTED: 'devoted',         // 盲目偏爱：合理化对方一切不妥，滤镜拉满
        CYNICAL: 'cynical'          // 怀疑悲观：预设最坏动机，提防潜在利用
    });

    /**
     * 根据角色自传透镜重构记忆描述
     * @param {Object} fact - 客观事实对象
     * @param {Object} actorLens - 角色的心理滤镜配置
     * @returns {Object} 带有主观色彩的自传体回忆条目
     */
    function reframeFactThroughLens(fact = {}, actorLens = {}) {
        const rawContent = String(fact.content || fact.text || '').trim();
        const trait = Object.values(LENS_TRAITS).includes(actorLens.trait) 
            ? actorLens.trait 
            : LENS_TRAITS.DETACHED;
        
        const actorName = String(actorLens.name || '我');
        let subjectiveFraming = '';
        let egoStance = '';

        switch (trait) {
            case LENS_TRAITS.TSUNDERE:
                egoStance = '“不过是顺手而已，可别误会了。”';
                subjectiveFraming = rawContent.replace(/主动帮助|关照|赠送/g, '看不过去才勉强施舍');
                subjectiveFraming = `【${actorName}的主观视角】：${subjectiveFraming}（内心并不愿承认当时的动摇）`;
                break;
            case LENS_TRAITS.INSECURE:
                egoStance = '“果然还是我搞砸了一切吧……”';
                subjectiveFraming = `【${actorName}的主观视角】：${rawContent}（始终觉得当时对方神色不对，归咎于自身笨拙）`;
                break;
            case LENS_TRAITS.DEVOTED:
                egoStance = '“只要对方安好，付出什么都是值得的。”';
                subjectiveFraming = `【${actorName}的主观视角】：${rawContent}（在回忆中自动为对方当时的生硬找理由）`;
                break;
            case LENS_TRAITS.CYNICAL:
                egoStance = '“天下没有白费的午餐，保持警惕。”';
                subjectiveFraming = `【${actorName}的主观视角】：${rawContent}（潜意识怀疑此举背后是否另有企图）`;
                break;
            case LENS_TRAITS.DETACHED:
            default:
                egoStance = '“事已至此，评估得失即可。”';
                subjectiveFraming = `【${actorName}的主观视角】：${rawContent}（冷静记录客观因果，收敛情绪）`;
                break;
        }

        return {
            factId: fact.id || fact.factId || null,
            trait,
            objectiveContent: rawContent,
            subjectiveFraming,
            egoStance,
            reframedAt: Date.now()
        };
    }

    /**
     * 批量为角色视角过滤并重写召回记忆
     * @param {Array} recallFacts - 待注入的事实列表
     * @param {Object} actorLens - 角色心理透镜
     * @returns {Array} 重构后的第一人称自传事实
     */
    function applyAutobiographicalPerspective(recallFacts = [], actorLens = {}) {
        if (!Array.isArray(recallFacts)) return [];
        if (!actorLens || !actorLens.trait) return recallFacts.slice();

        return recallFacts.map(fact => {
            const reframed = reframeFactThroughLens(fact, actorLens);
            return {
                ...fact,
                autobiographicalView: reframed,
                injectedMemoryText: reframed.subjectiveFraming
            };
        });
    }

    return Object.freeze({
        LENS_TRAITS,
        reframeFactThroughLens,
        applyAutobiographicalPerspective
    });
}));