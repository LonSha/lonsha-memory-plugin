/* ============================================================
 * character-habit-growth-evidence.js — [L9-X6 · 第九期规划]
 * 经历驱动的角色习惯与能力成长证据束管理（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   角色的做事方式与能力不是简单的数值分数，而是由经历构建的证据束：
 *     - 四阶段成长轨迹：
 *       'attempted' (尝试) -> 'effective_condition' (在特定条件下有效)
 *       -> 'failed_case' (遭遇失败) -> 'transferred_scenario' (迁移到新场景)
 *     - 当底层关联证据被撤回时，能力状态自动降级为 'needs_reverification' (待验证)，
 *       绝不静默归零，也绝不继续冒充已完全掌握。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CharacterHabitGrowthEvidence = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const STAGES = Object.freeze({
        ATTEMPTED: 'attempted',
        EFFECTIVE: 'effective_condition',
        FAILED: 'failed_case',
        TRANSFERRED: 'transferred_scenario'
    });

    function recordGrowthEvidence(bundle = {}, record = {}) {
        const records = Array.isArray(bundle.records) ? bundle.records.slice() : [];
        const stage = Object.values(STAGES).includes(record.stage) ? record.stage : STAGES.ATTEMPTED;

        const newRec = {
            id: record.id || `grow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            stage,
            evidenceId: record.evidenceId || null,
            description: String(record.description || '').trim(),
            contextCondition: record.contextCondition || 'general',
            timestamp: Date.now()
        };

        records.push(newRec);

        return {
            actorId: bundle.actorId || record.actorId || 'unknown_actor',
            skillOrHabit: bundle.skillOrHabit || record.skillOrHabit || 'general',
            records,
            status: 'active',
            updatedAt: Date.now()
        };
    }

    function evaluateCompetencyAfterRevocation(bundle = {}, revokedEvidenceIds = []) {
        const revokedSet = new Set(Array.isArray(revokedEvidenceIds) ? revokedEvidenceIds : []);
        const records = Array.isArray(bundle.records) ? bundle.records : [];
        
        let hasRevoked = false;
        const validRecords = [];
        for (const r of records) {
            if (r.evidenceId && revokedSet.has(r.evidenceId)) {
                hasRevoked = true;
            } else {
                validRecords.push(r);
            }
        }

        return {
            actorId: bundle.actorId,
            skillOrHabit: bundle.skillOrHabit,
            status: hasRevoked ? 'needs_reverification' : 'active',
            validRecords,
            revokedCount: records.length - validRecords.length,
            updatedAt: Date.now()
        };
    }

    return {
        STAGES,
        recordGrowthEvidence,
        evaluateCompetencyAfterRevocation
    };
}));