/* ============================================================
 * cross-branch-deja-vu-resonance-chamber.js — [L11-X6 · 第十一期前沿拓展机制]
 * 跨支线记忆残影与既视感共振舱 (Cross-Branch Déjà-Vu & Phantom Echo Chamber)
 * ------------------------------------------------------------
 * 【核心设计】
 *   赋予跑团分支与重开剧情极具文学厚重感的【既视感（Déjà-vu）与命运残影】：
 *   1. 幽灵分支记忆隔离库（Phantom Branch Echo Vault）：
 *      保存被回档、重生成或放弃的分支中，具备极高情感烈度的记忆快照；
 *   2. 跨世界线既视感共振（Cross-Timeline Resonance）：
 *      当在当前正典分支中经历高度相似的场景、对话或地点时，触发梦境般的潜意识既视感；
 *   3. 虚实交织提示词插桩：让角色在恍惚间产生“我仿佛在另一个时空经历过一模一样的事”的宿命战栗。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaDejaVuChamber = factory();
        root.CrossBranchDejaVuResonanceChamber = root.LonShaDejaVuChamber;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 将废弃分支的高光记忆归档为幽灵残影
     * @param {Object} discardedBranchMemory - 废弃分支记忆 { branchId, content, actors, emotion }
     * @returns {Object} 幽灵残影对象
     */
    function archivePhantomEcho(discardedBranchMemory = {}) {
        return {
            phantomId: `phantom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            originBranch: discardedBranchMemory.branchId || 'discarded_branch',
            content: String(discardedBranchMemory.content || '').trim(),
            actors: Array.isArray(discardedBranchMemory.actors) ? discardedBranchMemory.actors : [],
            emotion: discardedBranchMemory.emotion || 'haunting',
            archivedAt: Date.now()
        };
    }

    /**
     * 计算当前场景与幽灵记忆库之间的既视感共振
     * @param {string} currentSceneText - 当前正典场景描写
     * @param {Array} phantomVault - 幽灵残影库
     * @returns {Object} 既视感共振结果
     */
    function resonateDejaVu(currentSceneText = '', phantomVault = []) {
        if (!currentSceneText || !Array.isArray(phantomVault) || phantomVault.length === 0) {
            return { hasDejaVu: false, echoDirective: '', matchedPhantom: null };
        }

        const scene = String(currentSceneText);
        // 寻找包含相似意象的幽灵记忆
        let matched = null;
        for (const p of phantomVault) {
            const rawContent = String(p.content || '');
            const words = rawContent.length > 8 ? rawContent.slice(0, 8) : rawContent;
            if (words && scene.includes(words)) {
                matched = p;
                break;
            }
        }

        if (!matched) {
            return { hasDejaVu: false, echoDirective: '', matchedPhantom: null };
        }

        const echoDirective = `【跨世界线既视感·幽灵残影】：当前场景与废弃时空的记忆（${matched.content}）产生奇妙共振。角色的呼吸微微一滞，脑海中猛然闪过一段似曾相识却又未曾发生过的幻梦：“我们是不是……曾经在某个地方也这样对峙过？”`;

        return {
            hasDejaVu: true,
            matchedPhantom: matched,
            echoDirective
        };
    }

    return {
        archivePhantomEcho,
        resonateDejaVu
    };
}));