/* ============================================================
 * memory-healing-immunity-adjudicator.js — [v3.458.0 · V20-L5]
 * 记忆自愈免疫与在线抗幻觉冲突仲裁器 (Memory Healing Immunity Adjudicator)
 * ------------------------------------------------------------
 * 【核心设计】
 *   在长程多轮交互中，大模型偶发产生虚构幻觉（如将已故角色复活、
 *   篡改已锁定剧情事实、捏造不存在的道具归属）。
 *   本仲裁器扮演「记忆免疫系统」角色：
 *   1. 在线幻觉检测 (Hallucination Detection):
 *      实时校验模型生成文本与既有锁定事实账本 (Locked Facts / Invariants)
 *      的矛盾度（实体身份、生死状态、时间线逻辑）；
 *   2. 轻量自愈补丁生成 (Self-Healing Patching):
 *      当发现违规幻觉时，自动在内存层合成「自愈矫正说明」，
 *      并在下一轮提示词头部实施免疫接种 (Immunization Inoculation)，
 *      阻断幻觉污染持久化知识库。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemoryHealingImmunity = factory();
        root.MemoryHealingImmunityAdjudicator = root.LonShaMemoryHealingImmunity;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.458.0';

    /**
     * 创建纯净免疫系统状态
     */
    function createState() {
        return {
            version: VERSION,
            immunePatches: [],      // [{ id, floor, violatedRule, correction, targetEntities, severity, timestamp }]
            quarantinedFacts: [],   // 被隔离的幻觉事实 [{ text, reason, floor }]
            totalInoculations: 0,
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合
     */
    function hydrateState(raw = {}) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            immunePatches: Array.isArray(raw.immunePatches) ? raw.immunePatches.slice() : [],
            quarantinedFacts: Array.isArray(raw.quarantinedFacts) ? raw.quarantinedFacts.slice() : [],
            totalInoculations: Number(raw.totalInoculations) || 0,
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 审查文本并在线仲裁抗幻觉自愈
     * @param {String} generatedText 模型最新生成文本
     * @param {Array} establishedInvariants 既有权威不变量/锁定事实
     * @param {Object} state 免疫状态
     * @param {Number} currentFloor 当前楼层
     * @returns {Object} { healthy: Boolean, violations: Array, patch: Object|null }
     */
    function adjudicateAndHeal(generatedText = '', establishedInvariants = [], state = {}, currentFloor = 1) {
        const text = String(generatedText || '');
        if (!text || !Array.isArray(establishedInvariants) || !establishedInvariants.length) {
            return { healthy: true, violations: [], patch: null };
        }

        const violations = [];

        for (const inv of establishedInvariants) {
            if (!inv || typeof inv !== 'object') continue;
            const ruleText = String(inv.rule || inv.fact || inv.text || '');
            const character = String(inv.character || inv.entity || '');

            // 规则1：死亡/阵亡不变量违背（死者复生）
            if (character && (ruleText.includes('已死亡') || ruleText.includes('阵亡') || ruleText.includes('逝世'))) {
                const alivePattern = new RegExp(`${character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^。？！\n]*(?:说话|大笑|拔剑|跑向|微笑着说|神情严肃)`);
                if (alivePattern.test(text) && !text.includes('回忆') && !text.includes('幻觉') && !text.includes('梦见')) {
                    violations.push({
                        type: 'mortality_violation',
                        character,
                        rule: ruleText,
                        reason: `角色「${character}」已于早期定论确凿死亡，当前正文将其作为存活实体直接描写行为`
                    });
                }
            }

            // 规则2：物品彻底销毁/遗失不变量违背
            if (ruleText.includes('彻底损毁') || ruleText.includes('焚毁') || ruleText.includes('沉入渊薮')) {
                const item = inv.item || inv.entity || '';
                if (item && (text.includes(`拿出${item}`) || text.includes(`佩戴${item}`))) {
                    violations.push({
                        type: 'item_persistence_violation',
                        item,
                        rule: ruleText,
                        reason: `物品「${item}」已彻底销毁，不可凭空重现`
                    });
                }
            }
        }

        if (!violations.length) {
            return { healthy: true, violations: [], patch: null };
        }

        // 合成轻量自愈补丁
        state.totalInoculations = (state.totalInoculations || 0) + 1;
        const correctionDescriptions = violations.map(v => v.reason).join('；');
        const patch = {
            id: `patch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            floor: currentFloor,
            violations,
            correction: `【事实锁定自愈校准】注意：${correctionDescriptions}。此为绝对既成定论，下轮叙事严禁延续上述幻觉描写。`,
            createdAt: Date.now()
        };

        if (state.immunePatches) {
            state.immunePatches.push(patch);
            if (state.immunePatches.length > 20) state.immunePatches.shift();
        }
        state.updatedAt = Date.now();

        return {
            healthy: false,
            violations,
            patch
        };
    }

    /**
     * 构建免疫接种提示词指令 (Immunization Directive)
     */
    function buildImmunizationDirectives(state = {}) {
        const patches = Array.isArray(state.immunePatches) ? state.immunePatches.slice(-3) : [];
        if (!patches.length) return '';
        const lines = patches.map(p => `- 第${p.floor}楼校准：${p.correction}`);
        return `【记忆自愈免疫接种】\n${lines.join('\n')}`;
    }

    return {
        VERSION,
        createState,
        hydrateState,
        adjudicateAndHeal,
        buildImmunizationDirectives
    };
}));