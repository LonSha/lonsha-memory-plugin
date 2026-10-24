/* ============================================================
 * maintenance-cold-warm-session.js — [L9-O7 · 第九期规划]
 * 批量维护会话与冷暖记忆分级迁移工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   记忆库按活跃度与价值分级：
 *     - WARM: 近期活跃、高频交互记忆（常驻活跃池）
 *     - COLD: 长时间未召回的历史记忆（移入冷存储封存，支持索引回捞）
 *   维护会话提供批量预览、单项排除与中断恢复机制。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MaintenanceColdWarmSession = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function planMaintenanceBatch(facts, options = {}) {
        const list = Array.isArray(facts) ? facts : [];
        const coldThresholdMs = Number(options.coldThresholdMs) || (30 * 24 * 3600 * 1000); // 默认 30 天未访问
        const now = Date.now();

        const warm = [];
        const toArchiveCold = [];

        for (const f of list) {
            if (!f || !f.id) continue;
            const lastAccessed = f.lastAccessedAt || f.updatedAt || f.createdAt || 0;
            const isProtected = Boolean(f.pinned || f.isCore || f.state === 'confirmed');

            if (isProtected || (now - lastAccessed) < coldThresholdMs) {
                warm.push(f);
            } else {
                toArchiveCold.push({
                    ...f,
                    archivedAt: now,
                    archiveReason: 'inactive-beyond-threshold'
                });
            }
        }

        return {
            totalInspected: list.length,
            warmCount: warm.length,
            coldCount: toArchiveCold.length,
            warm,
            toArchiveCold
        };
    }

    return {
        planMaintenanceBatch
    };
}));