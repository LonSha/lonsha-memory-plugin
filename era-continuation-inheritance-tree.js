/* ============================================================
 * era-continuation-inheritance-tree.js — [L9-X9 · 第九期规划]
 * 时代接续与可玩传承谱系树（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   叙事进入新时代或篇章跨越时的传承资产沉淀：
 *     - 四大传承物状态：
 *       'accepted' (后辈接纳), 'rejected' (拒绝继承),
 *       'reformed' (改造再造), 'lost' (遗失于历史)
 *     - 秘密与知情边界断代阻断：新一代绝不自动获知前代未公开的秘密
 *     - 断代缺口显式表达为缺失，绝不由模型无凭捏造补全
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EraContinuationInheritanceTree = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const INHERITANCE_FATE = Object.freeze({
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        REFORMED: 'reformed',
        LOST: 'lost'
    });

    function inheritEraArtifact(artifact = {}, successorAction = {}) {
        if (!artifact || !artifact.id) {
            return { success: false, reason: 'invalid_artifact' };
        }

        const fate = Object.values(INHERITANCE_FATE).includes(successorAction.fate)
            ? successorAction.fate
            : INHERITANCE_FATE.ACCEPTED;

        const isSecret = Boolean(artifact.isSecret);
        const successorKnowsSecret = isSecret && Boolean(successorAction.revealedByWill);

        return {
            success: true,
            artifactId: artifact.id,
            originEra: artifact.era || 'first_era',
            successorActorId: successorAction.successorActorId || 'unknown_successor',
            fate,
            isSecret,
            successorKnowsSecret,
            secretRedacted: isSecret && !successorKnowsSecret,
            reformedNotes: fate === INHERITANCE_FATE.REFORMED ? String(successorAction.reformedNotes || '').trim() : null,
            timestamp: Date.now()
        };
    }

    return {
        INHERITANCE_FATE,
        inheritEraArtifact
    };
}));