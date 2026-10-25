/* ============================================================
 * intergenerational-mental-totem-tree.js — [L11-X9 · 第十一期前沿拓展机制]
 * 角色代际记忆继承与精神图腾沉淀树 (Intergenerational Mental Totem Tree)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决宏大多代跑团、换代传承与精神火种延续时的【代际图腾与薪火相传】：
 *   1. 精神图腾结晶（Mental Totem Crystallization）：
 *      当上一代角色退场、牺牲或老去时，其核心遗愿、未竟信约与图腾信物被结晶为【精神图腾】；
 *   2. 代际继承树与精神羁绊（Heritage Bond & Guidance）：
 *      下一代年轻主角继承该图腾，在潜意识中获得精神力量、信仰加护与宿命沉重感；
 *   3. 历史断代阻断机制：确保前代的私人隐秘不会非法穿帮，唯有公开信仰与精神图腾流芳百世。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaTotemTree = factory();
        root.IntergenerationalMentalTotemTree = root.LonShaTotemTree;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /**
     * 从退场前代角色的生平中提炼精神图腾
     * @param {Object} predecessor - 前代角色信息 { name, era, unfulfilledPledge, coreBelief, totemArtifact }
     * @returns {Object} 精神图腾节点
     */
    function crystallizeMentalTotem(predecessor = {}) {
        const name = predecessor.name || '先辈';
        const belief = predecessor.coreBelief || '守护这片土地上的万家灯火';
        const pledge = predecessor.unfulfilledPledge || '未竟的黎明之约';
        const artifact = predecessor.totemArtifact || '一把残破的佩剑';

        return {
            totemId: `totem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            founderName: name,
            originEra: predecessor.era || '旧时代',
            coreBelief: belief,
            unfulfilledPledge: pledge,
            totemArtifact: artifact,
            successors: [],
            crystallizedAt: Date.now()
        };
    }

    /**
     * 将精神图腾绑定并传承给下一代继承者
     * @param {Object} totem - 精神图腾
     * @param {string} successorName - 新一代继承者名字
     * @returns {Object} 传承回执与潜意识精神指导
     */
    function passTotemToSuccessor(totem = {}, successorName = '') {
        const successors = Array.isArray(totem.successors) ? totem.successors.slice() : [];
        if (successorName && !successors.includes(successorName)) {
            successors.push(successorName);
        }

        const guidance = `【代际图腾·薪火相传】：继承者 [${successorName}] 接过了先辈 [${totem.founderName}] 留下的精神图腾【${totem.totemArtifact}】与未竟之誓（${totem.unfulfilledPledge}）。先辈的信仰（${totem.coreBelief}）在继承者心中化作不灭的火种，在面临抉择时赋予其超越常人的意志。`;

        return {
            ...totem,
            successors,
            currentBearer: successorName,
            heritageGuidance: guidance
        };
    }

    return {
        crystallizeMentalTotem,
        passTotemToSuccessor
    };
}));