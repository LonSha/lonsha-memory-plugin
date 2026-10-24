/* ============================================================
 * memory-task-workbench.js — [L9-O9 · 第九期规划]
 * 面向任务的记忆工作台首层投影与状态聚合器（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   摒弃暴露底层引擎名称的复杂控制面板，重组为 6 大用户直觉任务区：
 *     1. pending_confirm: 待采纳/待确认事实
 *     2. pending_revision: 存在冲突/存疑待修订条目
 *     3. in_use: 当前上下文活跃注入与叙事时钟生效条目
 *     4. recall_review: 最近召回命中与反馈记录
 *     5. boundary_risk: 跨项目/私密边界风险提示
 *     6. resume_point: 上次工作断点与未完结批次
 *   并为各任务区提供统一的四态规范 (empty, absent, unavailable, pending_verify)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MemoryTaskWorkbench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function buildTaskWorkbenchState(sources = {}) {
        const facts = Array.isArray(sources.facts) ? sources.facts : [];
        const conflicts = Array.isArray(sources.conflicts) ? sources.conflicts : [];
        const activeInjections = Array.isArray(sources.activeInjections) ? sources.activeInjections : [];
        const feedbackLogs = Array.isArray(sources.feedbackLogs) ? sources.feedbackLogs : [];
        const boundaries = Array.isArray(sources.boundaries) ? sources.boundaries : [];
        const resumePoint = sources.resumePoint || null;

        const sections = {
            pending_confirm: {
                title: '待确认事实',
                items: facts.filter(f => f.state === 'candidate' || f.needsVerification),
                state: 'ready'
            },
            pending_revision: {
                title: '待裁决冲突',
                items: conflicts.filter(c => c.status === 'open' || c.status === 'pending_revision'),
                state: 'ready'
            },
            in_use: {
                title: '当前使用中',
                items: activeInjections,
                state: 'ready'
            },
            recall_review: {
                title: '召回回看与反馈',
                items: feedbackLogs.slice(0, 10),
                state: 'ready'
            },
            boundary_risk: {
                title: '边界风险',
                items: boundaries.filter(b => b.hasRisk),
                state: 'ready'
            },
            resume_point: {
                title: '继续上次工作',
                point: resumePoint,
                state: resumePoint ? 'ready' : 'empty'
            }
        };

        // 统一空态
        for (const [key, section] of Object.entries(sections)) {
            if (key !== 'resume_point' && (!section.items || section.items.length === 0)) {
                section.state = 'empty';
            }
        }

        return {
            timestamp: Date.now(),
            sections,
            summary: {
                totalPendingConfirm: sections.pending_confirm.items.length,
                totalPendingRevision: sections.pending_revision.items.length,
                totalInUse: sections.in_use.items.length,
                hasRisk: sections.boundary_risk.items.length > 0,
                canResume: Boolean(resumePoint)
            }
        };
    }

    return {
        buildTaskWorkbenchState
    };
}));