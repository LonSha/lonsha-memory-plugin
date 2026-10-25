/* ============================================================
 * adaptive-memory-annealing-curve.js — [L11-O5 · 第十一期认知架构优化]
 * 记忆沉淀退火与自适应半衰期遗忘曲线 (Adaptive Memory Annealing Curve)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长程互动（500+轮）中记忆库无差别膨胀导致的内存沉重与上下文稀释：
 *   1. 模拟退火与遗忘动力学（Ebbinghaus Simulated Annealing）：
 *      记忆细节清晰度（Resolution）随沉寂轮次对数衰减；
 *   2. 高光再激活降温（Re-activation Freezing）：
 *      一旦濒临遗忘的记忆再次被提及或与当前焦点共振，其衰减速率大幅降低，
 *      并结晶为低Token消耗的【概念化核心信念】（Conceptual Crystallization）；
 *   3. 细节剥落与自适应修剪：将陈旧琐碎事实平滑退化为摘要标签，维持极高信噪比。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemoryAnnealing = factory();
        root.AdaptiveMemoryAnnealingCurve = root.LonShaMemoryAnnealing;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const RESOLUTION_TIERS = Object.freeze({
        CRYSTAL: 'crystal',     // 结晶态：永恒核心信念/不可逆转折（零衰减）
        DETAILED: 'detailed',   // 细节态：完整对话、感官与微表情（初期活跃）
        ABSTRACT: 'abstract',   // 抽象态：仅保留主谓宾与核心结果（中期退火）
        FADED: 'faded'          // 斑驳态：极简标签，仅作为背景线索索引
    });

    /**
     * 计算单条记忆在经过 N 轮沉寂后的清晰度与退火状态
     * @param {Object} memoryItem - 记忆对象 { content, lastTouchedRound, accessCount, baseWeight, isPermanent }
     * @param {number} currentRound - 当前故事轮次
     * @param {Object} options - 退火参数
     * @returns {Object} 退火评估结果
     */
    function computeAnnealingState(memoryItem = {}, currentRound = 1, options = {}) {
        if (memoryItem.isPermanent || memoryItem.kind === 'invariant' || memoryItem.kind === 'trauma') {
            return {
                clarity: 1.0,
                tier: RESOLUTION_TIERS.CRYSTAL,
                renderedContent: String(memoryItem.content || ''),
                decayRounds: 0
            };
        }

        const lastTouched = Number(memoryItem.lastTouchedRound || 0);
        const accessCount = Math.max(1, Number(memoryItem.accessCount || 1));
        const decayRounds = Math.max(0, currentRound - lastTouched);

        // 访问越多，半衰期越长 (自适应抗衰减)
        const halfLife = 15 * Math.log2(accessCount + 1); // 基础半衰期15轮
        // 指数退火计算清晰度 [0..1]
        const clarity = Number(Math.exp(-0.693 * (decayRounds / halfLife)).toFixed(3));

        let tier = RESOLUTION_TIERS.DETAILED;
        let renderedContent = String(memoryItem.content || '');

        if (clarity < 0.25) {
            tier = RESOLUTION_TIERS.FADED;
            // 剥落为简短标签
            renderedContent = `[记忆斑驳] ${renderedContent.slice(0, 20)}…`;
        } else if (clarity < 0.6) {
            tier = RESOLUTION_TIERS.ABSTRACT;
            renderedContent = `[记忆概貌] ${renderedContent.slice(0, 45)}…`;
        }

        return {
            clarity,
            tier,
            renderedContent,
            decayRounds,
            halfLife: Number(halfLife.toFixed(1))
        };
    }

    /**
     * 当记忆被再次成功召回或互动引用时，执行高光再激活与结晶沉淀
     * @param {Object} memoryItem - 记忆对象
     * @param {number} currentRound - 当前轮次
     * @returns {Object} 强化后的记忆对象
     */
    function reactivateMemory(memoryItem = {}, currentRound = 1) {
        const currentCount = Number(memoryItem.accessCount || 1);
        const newCount = currentCount + 1;

        // 若被反复触及达到阈值（如5次以上），自动结晶为长效核心信念
        const becomeCrystal = newCount >= 5;

        return {
            ...memoryItem,
            lastTouchedRound: currentRound,
            accessCount: newCount,
            isPermanent: becomeCrystal || !!memoryItem.isPermanent,
            crystallized: becomeCrystal
        };
    }

    return {
        RESOLUTION_TIERS,
        computeAnnealingState,
        reactivateMemory
    };
}));