/* ============================================================
 * memory-salience-decay-curator.js — [v3.461.0 · 第十八期全新生产基座]
 * 记忆显著度非线性生物衰减精算器 (Salience Decay & Synaptic Pruner)
 * ------------------------------------------------------------
 * 【核心机制与突触可塑性 (Synaptic Plasticity)】
 * 突破线性半衰期遗忘模型的刻板僵化：
 *   基于艾宾浩斯与神经突触修剪双重规律：
 *   - 具有核心情感印记或多次复述反刍的记忆，其显著度半衰期指数级拉长（强化突触）；
 *   - 平庸琐碎记忆（闲聊寒暄）显著度随轮次快速衰减至静默阈值被修剪，保证提示词上下文高信噪比。
 * ============================================================ */

export class MemorySalienceDecayCurator {
    constructor(options = {}) {
        this.options = Object.assign({
            baseDecayRate: 0.05,
            emotionShieldMultiplier: 0.15,
            pruneThreshold: 0.12
        }, options);
    }

    /**
     * 精算记忆节点的当前显著度得分 (Salience Score)
     * @param {Object} memoryNode 
     * @param {number} currentTurn 当前对话轮次
     */
    calculateSalience(memoryNode, currentTurn) {
        if (!memoryNode) return 0;
        const initialSalience = Number(memoryNode.initialSalience || 1.0);
        const age = Math.max(0, currentTurn - (memoryNode.createdTurn || 0));
        const emotionalWeight = Math.min(1.0, Number(memoryNode.emotionalWeight || 0.1));
        const recallCount = Number(memoryNode.recallCount || 0);

        // 情绪强度与回忆频次对衰减的保护性阻尼因子
        const protectionDamping = 1 / (1 + (emotionalWeight * 2.5) + (recallCount * 0.4));
        const effectiveDecayRate = this.options.baseDecayRate * protectionDamping;

        // 非线性生物衰减公式
        const salience = initialSalience * Math.exp(-effectiveDecayRate * age);
        return Number(Math.max(0, salience).toFixed(4));
    }

    /**
     * 突触修剪：过滤掉显著度低于阈值的长尾记忆
     */
    pruneMemories(memories = [], currentTurn = 0) {
        const retained = [];
        const pruned = [];

        for (const m of memories) {
            const currentScore = this.calculateSalience(m, currentTurn);
            const enriched = Object.assign({}, m, { currentSalience: currentScore });
            if (currentScore >= this.options.pruneThreshold || m.isPermanentAnchor) {
                retained.push(enriched);
            } else {
                pruned.push(enriched);
            }
        }

        return { retained, pruned };
    }
}

export default MemorySalienceDecayCurator;