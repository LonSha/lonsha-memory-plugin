/* ============================================================
 * project-migration-boundary-bench.js — [L9-O8 · 第九期规划]
 * 项目、分支与秘密边界迁移接续工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   在多项目或平行故事分支迁移时：
 *     - SHARED: 跨项目/跨世界共享的客观事实
 *     - PRIVATE: 属于分支特定私密剧情或受限角色的记忆
 *   跨项目迁移严格阻断 PRIVATE 条目，并消除同名实体的别名歧义。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ProjectMigrationBoundaryBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function planMigrationTransfer(sourceFacts, options = {}) {
        const list = Array.isArray(sourceFacts) ? sourceFacts : [];
        const allowPrivate = Boolean(options.includePrivate);

        const exported = [];
        const blocked = [];

        for (const f of list) {
            if (!f || !f.id) continue;
            const isPrivate = f.scope === 'private' || Boolean(f.secretScope);

            if (isPrivate && !allowPrivate) {
                blocked.push({
                    id: f.id,
                    reason: 'private-secret-boundary-blocked'
                });
            } else {
                exported.push(f);
            }
        }

        return {
            totalSource: list.length,
            exportedCount: exported.length,
            blockedCount: blocked.length,
            exported,
            blocked
        };
    }

    return {
        planMigrationTransfer
    };
}));