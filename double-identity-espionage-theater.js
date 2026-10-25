/* ============================================================
 * double-identity-espionage-theater.js — [L11-X7 · 第十一期前沿拓展机制]
 * 伪装身份与双重账本欺诈剧场 (Double-Identity & Espionage Theater)
 * ------------------------------------------------------------
 * 【核心设计】
 *   深度支持谍战、卧底潜伏、二重身与双重面具的复杂文学博弈：
 *   1. 双轨认知账本物理隔离（Dual-Ledger Physical Separation）：
 *      - 伪装公共面具（Public Cover Persona）：对外示人的言谈风格、所属阵营、官方人设；
 *      - 真实深层自白（True Allegiance Identity）：心底真实效忠目标、潜伏代号与不可告人秘密；
 *   2. 破绽与暴露风险模型（Exposure Risk Factor 0..1）：
 *      根据知情者怀疑度、遗留物证与对质压力，动态调整被戳穿的危险阈值；
 *   3. 语境自适应面具切换：在公众场合强行佩戴面具，在绝对私密空间才允许暗流涌动。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEspionageTheater = factory();
        root.DoubleIdentityEspionageTheater = root.LonShaEspionageTheater;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 创建双重身份账本
     * @param {Object} spec - { actorName, coverIdentity, trueIdentity }
     * @returns {Object} 双重身份档案
     */
    function createDualIdentityDossier(spec = {}) {
        return {
            actorName: spec.actorName || '无名谍影',
            coverIdentity: {
                role: spec.coverRole || '帝国治安官',
                allegiance: spec.coverAllegiance || '帝国议会',
                publicTraits: spec.coverTraits || ['忠诚刻板', '冷酷执法']
            },
            trueIdentity: {
                codename: spec.trueCodename || '渡鸦',
                allegiance: spec.trueAllegiance || '地下反抗军',
                deepGoal: spec.trueGoal || '窃取要塞防御图并掩护同志撤离'
            },
            exposureRisk: 0.1, // 初始暴露风险 10%
            compromisedClues: []
        };
    }

    /**
     * 评估外界刺激并增加暴露破绽
     * @param {Object} dossier - 双重身份档案
     * @param {Object} suspicionEvent - 怀疑事件 { suspicionLevel, clueText }
     * @returns {Object} 更新后的档案与风险评估
     */
    function recordSuspicionClue(dossier = {}, suspicionEvent = {}) {
        const currentRisk = Number(dossier.exposureRisk || 0.1);
        const delta = Number(suspicionEvent.suspicionLevel || 0.2);
        const clue = String(suspicionEvent.clueText || '露出了可疑破绽').trim();

        const clues = Array.isArray(dossier.compromisedClues) ? dossier.compromisedClues.slice() : [];
        clues.push({ clue, addedAt: Date.now() });

        const newRisk = Number(Math.min(1.0, currentRisk + delta).toFixed(2));

        return {
            ...dossier,
            exposureRisk: newRisk,
            compromisedClues: clues,
            isNearBreach: newRisk >= 0.75
        };
    }

    /**
     * 根据当前所处环境（公众场合 vs 私密安全屋），合成注入提示词
     * @param {Object} dossier - 双重身份档案
     * @param {Object} environmentContext - { isPublic, presentActors, isSafetyHaven }
     * @returns {string} 提示词指导
     */
    function synthesizeEspionageDirective(dossier = {}, environmentContext = {}) {
        const cover = dossier.coverIdentity || {};
        const real = dossier.trueIdentity || {};
        const risk = Number(dossier.exposureRisk || 0.1);

        if (environmentContext.isPublic || !environmentContext.isSafetyHaven) {
            // 公众/非安全场合：强制维持面具
            return `【双重身份·面具坚守】：当前处于公众/危险环境（暴露风险=${Math.round(risk * 100)}%）。角色必须百分之百扮演其伪装身份【${cover.role}】，言行举止必须符合【${cover.publicTraits?.join('、') || '公共人设'}】。即便内心极度动摇，表面也绝不能暴露真实阵营（${real.allegiance}）。`;
        } else {
            // 私密安全屋：展现真面目与疲惫
            return `【双重身份·安全屋独白】：已脱离外部监视视线。角色可以暂时摘下【${cover.role}】的虚伪面具，回归真正的自我【代号：${real.codename}】。角色可流露出潜伏的巨大疲惫与对使命（${real.deepGoal}）的执着。`;
        }
    }

    return {
        createDualIdentityDossier,
        recordSuspicionClue,
        synthesizeEspionageDirective
    };
}));