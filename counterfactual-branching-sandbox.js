/* ============================================================
 * counterfactual-branching-sandbox.js — [L10-X8 · 第十期全量创新]
 * 关键节点反事实假想沙盒（Counterfactual Branching Sandbox）
 * ------------------------------------------------------------
 * 【核心设计】
 *   赋予角色「如果当初我不那样做，现在会怎样」的复杂内心假想能力：
 *   1. 分支抉择关键节点（Pivotal Decision Point）：记录曾发生的重大转折（如放手、决裂、隐瞒）；
 *   2. 反事实平行演化演算（Counterfactual Evolution）：
 *      模拟生成未曾走过的路线所带来的可能后果；
 *   3. 现实与假想的回响共鸣（Echo Resonance）：
 *      在深夜独处、醉酒或故地重游时，被特定触发词唤醒，赋予角色深沉的情感反思与宿命感。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCounterfactualSandbox = factory();
    root.CounterfactualBranchingSandbox = root.LonShaCounterfactualSandbox;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EMOTIONAL_TONE = Object.freeze({
        REGRET: 'regret',           // 悔恨痛苦（“若能重来，绝不放手”）
        RELIEF: 'relief',           // 庆幸释怀（“幸好当时做了决断，避开更大浩劫”）
        NOSTALGIA: 'nostalgia',     // 怅然若失（“或许另有一番光景，但已不可寻”）
        HAUNTED: 'haunted'          // 梦魇缠绕（持续的心魔与执念）
    });

    /**
     * 注册关键抉择节点与反事实假想
     */
    function recordBranchSandbox(data = {}) {
        const triggers = Array.isArray(data.awakeningTriggers) 
            ? data.awakeningTriggers.map(s => String(s).trim()).filter(Boolean)
            : ['深夜', '故地重游', '独处'];

        return {
            id: data.id || `cf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            actorId: String(data.actorId || 'protagonist'),
            anchorFloor: Number.isFinite(data.anchorFloor) ? data.anchorFloor : 0,
            actualChoice: String(data.actualChoice || '').trim(), // 实际发生的抉择
            unpickedRoad: String(data.unpickedRoad || '').trim(), // 未选择的道路
            imaginedConsequence: String(data.imaginedConsequence || '').trim(), // 假想的平行线结局
            tone: Object.values(EMOTIONAL_TONE).includes(data.tone) ? data.tone : EMOTIONAL_TONE.NOSTALGIA,
            awakeningTriggers: triggers,
            weight: Math.max(0.1, Math.min(1.0, Number(data.weight) || 0.7)),
            createdAt: Date.now()
        };
    }

    /**
     * 检测当前场景上下文是否触发反事实共鸣
     * @param {Object} sandbox - 反事实条目
     * @param {string} sceneContext - 当前场景描述或对白
     * @returns {Object|null} 触发时返回心理共鸣引导，否则返回 null
     */
    function evaluateCounterfactualAwakening(sandbox = {}, sceneContext = '') {
        const text = String(sceneContext || '');
        if (!text || !Array.isArray(sandbox.awakeningTriggers)) return null;

        const hitTrigger = sandbox.awakeningTriggers.find(t => text.includes(t));
        if (!hitTrigger) return null;

        let monologue = '';
        switch (sandbox.tone) {
            case EMOTIONAL_TONE.REGRET:
                monologue = `（心中骤然翻起一阵悔意：若当时选了“${sandbox.unpickedRoad}”，结局会否完全不同……）`;
                break;
            case EMOTIONAL_TONE.RELIEF:
                monologue = `（暗自松了一口气：所幸当初“${sandbox.actualChoice}”，否则今日恐怕早已万劫不复。）`;
                break;
            case EMOTIONAL_TONE.HAUNTED:
                monologue = `（那个未曾经历的幻影再次浮现：“${sandbox.imaginedConsequence}”，如附骨之疽挥之不去。）`;
                break;
            case EMOTIONAL_TONE.NOSTALGIA:
            default:
                monologue = `（思绪飘向远方：如果那一年走了“${sandbox.unpickedRoad}”，如今会是怎样一番风景……）`;
                break;
        }

        return {
            sandboxId: sandbox.id,
            hitTrigger,
            tone: sandbox.tone,
            internalEchoPrompt: `【反事实心绪共鸣】因场景触及关键词「${hitTrigger}」，${sandbox.actorId}被过往重大抉择唤醒内心情感：${monologue}`
        };
    }

    return Object.freeze({
        EMOTIONAL_TONE,
        recordBranchSandbox,
        evaluateCounterfactualAwakening
    });
}));