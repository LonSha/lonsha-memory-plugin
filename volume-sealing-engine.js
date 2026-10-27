/**
 * volume-sealing-engine.js - 阶段卷宗封卷引擎 (Volume Sealing Engine)
 * 
 * 机制借鉴与超越：
 * 吸收 Mneme (v1.0.0) 的 10 轮卷宗封卷（Volume Sealing）与阶段 recap 架构。
 * 针对长线长聊场景，避免单条记忆扁平堆叠导致检索发散与上下文击穿。
 * 支持自适应步长（默认 10 轮）或剧变里程碑自动封卷，生成凝练的阶段卷宗（Volume），
 * 形成“热层活跃记忆 + 冷层分卷摘要”的双层检索与归档拓扑。
 */

/* 单次装载包装（[v3.421.0] 修）：本文件在宿主页是按 extra_js 逐个 eval 的经典脚本，
 *   顶层 `class`/`const` 落在同一个脚本作用域里；同一页重复加载一次就会 `Identifier ...
 *   has already been declared`。故与仓内既有模块同形，收进 IIFE。
 *   导出仍是双通道：IIFE 内 `module.exports` 供 tests 具名 import，`root.*` 供宿主消费。 */
(function (root) {
'use strict';
class VolumeSealingEngine {
    constructor(config = {}) {
        this.sealingBatchSize = config.sealingBatchSize ?? 10;
        this.maxRecapLength = config.maxRecapLength ?? 200;
    }

    /**
     * 检查当前未封卷条目是否达到封卷契机
     * @param {Object} params
     * @param {Array} params.activeEntries - 当前处于活跃（未封卷）状态的记忆条目
     * @param {boolean} params.forceMilestoneSeal - 是否因剧情大转折强制提前封卷
     * @returns {Object} 判定结论
     */
    evaluateSealingTrigger({ activeEntries = [], forceMilestoneSeal = false }) {
        if (forceMilestoneSeal && activeEntries.length >= 3) {
            return {
                shouldSeal: true,
                reason: 'milestone_forced_sealing',
                count: activeEntries.length
            };
        }

        if (activeEntries.length >= this.sealingBatchSize) {
            return {
                shouldSeal: true,
                reason: 'batch_size_threshold_reached',
                count: activeEntries.length
            };
        }

        return {
            shouldSeal: false,
            reason: 'below_threshold',
            count: activeEntries.length
        };
    }

    /**
     * 执行封卷动作，生成 Volume 实体与更新后的热/冷层状态
     * @param {Object} params
     * @param {number} params.volumeIndex - 当前新卷编号（从 1 开始递增）
     * @param {string} params.title - 卷标题（如“第一卷·盛夏初识”）
     * @param {Array} params.entriesToSeal - 待封存的一批记忆条目
     * @param {string} params.summaryRecap - 本卷阶段凝练总览 (recap)
     * @param {string} params.timeRange - 本卷涵盖的故事时间跨度 (如 "2026.04~2026.06")
     * @returns {Object} 包含 sealedVolume 以及归档状态
     */
    sealVolume({ volumeIndex = 1, title = '', entriesToSeal = [], summaryRecap = '', timeRange = '' }) {
        if (!entriesToSeal || entriesToSeal.length === 0) {
            throw new Error('Cannot seal an empty volume');
        }

        // 提取主要出场人物与核心锚点
        const charactersSet = new Set();
        const anchorsSet = new Set();
        let majorCount = 0;

        for (const entry of entriesToSeal) {
            (entry.characters || []).forEach(c => charactersSet.add(c));
            if (entry.anchor) anchorsSet.add(entry.anchor);
            if (entry.importance === 'major' || entry.importance === 'permanent') {
                majorCount++;
            }
        }

        // 形成规范的 recap
        const recap = summaryRecap.trim() || entriesToSeal.map(e => e.summary || e.content).join('；');
        const truncatedRecap = recap.length > this.maxRecapLength 
            ? recap.slice(0, this.maxRecapLength) + '...'
            : recap;

        const sealedVolume = {
            index: volumeIndex,
            title: title || `第${volumeIndex}卷·剧情备忘`,
            timeRange: timeRange || '未明时间段',
            recap: truncatedRecap,
            entryIds: entriesToSeal.map(e => e.id),
            characters: Array.from(charactersSet),
            anchors: Array.from(anchorsSet),
            entryCount: entriesToSeal.length,
            majorEventCount: majorCount,
            sealedAt: Date.now()
        };

        return {
            sealedVolume,
            archivedEntryIds: entriesToSeal.map(e => e.id)
        };
    }

    /**
     * 构建适合注入上下文或在面板中查看的卷宗目录投影
     * @param {Array} volumes - 已封卷的历史 Volume 数组
     * @returns {string} 凝练的分卷编年史文本
     */
    renderChronicleProjection(volumes = []) {
        if (!volumes || volumes.length === 0) {
            return '';
        }

        const lines = ['【长剧本分卷编年史】'];
        for (const v of volumes) {
            lines.push(`▶ [${v.title}] (${v.timeRange})：${v.recap} (在场: ${v.characters.join('、') || '众人'})`);
        }
        return lines.join('\n');
    }
}

root.LonShaVolumeSealingEngine = { VolumeSealingEngine };
if (typeof module !== 'undefined' && module.exports) module.exports = { VolumeSealingEngine };
})(typeof globalThis !== 'undefined' ? globalThis : window);
