/* ========================================================
 * character-growth-drama.js — [M8-X6 · 第八期规划] 记忆驱动的角色成长剧（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决角色能力、性格或行为模式变化缺乏经历证明、凭空变强或突兀变脸的问题：
 *     ① 四段成长阶梯：learning（模仿学习）-> failure（挫败试错）->
 *        adjustment（反思调适）-> mastery（迁移掌握）；
 *     ② 显式实证支撑：每个成长阶梯必须锚定发生的经历、事件或作品证据；
 *     ③ 经历失效级联反冲：回滚关键经历后，成长状态标为“证据缺失需复核”；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const GROWTH_STAGES = Object.freeze({
        LEARNING: 'learning',
        FAILURE: 'failure',
        ADJUSTMENT: 'adjustment',
        MASTERY: 'mastery'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeGrowthState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                trajectories: {}, // trajectoryId -> trajectoryObj
                updatedAt: Date.now()
            };
        }
        return {
            trajectories: (raw.trajectories && typeof raw.trajectories === 'object') ? { ...raw.trajectories } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 开启一条技能/性格成长轨迹
     */
    function initiateGrowthTrajectory(state, characterId, domainKey, title, now = Date.now()) {
        const s = normalizeGrowthState(state);
        const cId = safeStr(characterId);
        const dKey = safeStr(domainKey);
        const tTitle = safeStr(title);

        if (!cId || !dKey) {
            return { success: false, reason: 'character-and-domain-required', state: s };
        }

        const id = `grow_${cId}_${dKey}`;
        const trajectory = {
            id,
            characterId: cId,
            domainKey: dKey,
            title: tTitle || dKey,
            currentStage: GROWTH_STAGES.LEARNING,
            milestones: [], // [{ stage, evidenceEventId, reflection, timestamp }]
            isEvidenceCompromised: false,
            createdAt: now,
            updatedAt: now
        };

        return {
            success: true,
            trajectory,
            state: {
                ...s,
                trajectories: { ...s.trajectories, [id]: trajectory },
                updatedAt: now
            }
        };
    }

    /**
     * 推进成长阶段（要求提供具体的证据事件 ID）
     */
    function recordGrowthMilestone(state, trajectoryId, targetStage, evidenceEventId, reflection = '', now = Date.now()) {
        const s = normalizeGrowthState(state);
        const tId = safeStr(trajectoryId);
        const stage = safeStr(targetStage);
        const evId = safeStr(evidenceEventId);

        const traj = s.trajectories[tId];
        if (!traj) {
            return { success: false, reason: 'trajectory-not-found', state: s };
        }
        if (!Object.values(GROWTH_STAGES).includes(stage)) {
            return { success: false, reason: 'invalid-growth-stage', state: s };
        }
        if (!evId) {
            return { success: false, reason: 'evidence-event-required', state: s };
        }

        const milestone = {
            stage,
            evidenceEventId: evId,
            reflection: safeStr(reflection),
            timestamp: now
        };

        const updatedTraj = {
            ...traj,
            currentStage: stage,
            milestones: [...traj.milestones, milestone],
            isEvidenceCompromised: false,
            updatedAt: now
        };

        return {
            success: true,
            milestone,
            trajectory: updatedTraj,
            state: {
                ...s,
                trajectories: { ...s.trajectories, [tId]: updatedTraj },
                updatedAt: now
            }
        };
    }

    /**
     * 当某段历史经历被回滚或删除时，校验成长轨迹证据完整性
     */
    function reconcileGrowthEvidence(state, revokedEventIds = [], now = Date.now()) {
        const s = normalizeGrowthState(state);
        const revokedSet = new Set(safeArr(revokedEventIds).map(safeStr));
        const updatedTrajectories = {};
        let compromisedCount = 0;

        for (const [id, traj] of Object.entries(s.trajectories)) {
            const hasRevokedEvidence = traj.milestones.some(m => revokedSet.has(m.evidenceEventId));
            if (hasRevokedEvidence) {
                updatedTrajectories[id] = {
                    ...traj,
                    isEvidenceCompromised: true,
                    updatedAt: now
                };
                compromisedCount++;
            } else {
                updatedTrajectories[id] = traj;
            }
        }

        return {
            compromisedCount,
            state: {
                ...s,
                trajectories: updatedTrajectories,
                updatedAt: now
            }
        };
    }

    function characterGrowthSelfCheck() {
        const problems = [];
        if (Object.keys(GROWTH_STAGES).length !== 4) problems.push('GROWTH_STAGES 必须恰好为 4 阶');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        GROWTH_STAGES,
        normalizeGrowthState,
        initiateGrowthTrajectory,
        recordGrowthMilestone,
        reconcileGrowthEvidence,
        characterGrowthSelfCheck
    });

    root.LonShaCharacterGrowthDrama = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);