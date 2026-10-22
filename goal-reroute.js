/* ========================================================
 * goal-reroute.js — [M6-O9 · v3.357.0] 长期意图推进与改道契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   实现大目标往往面临互斥路线、资源约束与关键角色退出，不能简单勾完清单。
 * 核心机制：
 *   1. 互斥替代路径（Alternative Paths）：排他性选择，选定一条后另一条保持独立，不显示已完成；
 *   2. 遇阻有据改道（Impediment & Reroute Candidates）：
 *      资源耗尽或角色退出时，给出改期/缩减/换线等有据选项，拒绝无依据自动成功；
 *   3. 放弃后重启保护（Restart Preservation）：
 *      放弃后重启目标，完整保留历史代价与尝试痕迹，重开依然可查。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaGoalReroute = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const VERSION = '3.357.0';
    const MAX_PATHS = 10;
    const MAX_CANDIDATES = 10;

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _num(v, def = null) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function createGoal(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const id = _str(r.id || 'goal_' + Math.random().toString(36).slice(2, 8));
        const title = _str(r.title || id);
        const owner = _str(r.owner || 'user');

        const paths = Array.isArray(r.alternativePaths) ? r.alternativePaths.map(normPath).filter(Boolean) : [];
        const commitments = Array.isArray(r.commitments) ? r.commitments.map(normCommitment).filter(Boolean) : [];
        const incurredCosts = Array.isArray(r.incurredCosts) ? r.incurredCosts.map(normCost).filter(Boolean) : [];
        const historicalAttempts = Array.isArray(r.historicalAttempts) ? r.historicalAttempts.map(normAttempt).filter(Boolean) : [];

        return {
            version: 1,
            id,
            title,
            owner,
            status: ['active', 'blocked', 'rerouted', 'abandoned', 'achieved'].includes(r.status) ? r.status : 'active',
            activePathId: _str(r.activePathId || (paths.length > 0 ? paths[0].pathId : null)),
            alternativePaths: paths.slice(0, MAX_PATHS),
            commitments,
            incurredCosts,
            historicalAttempts,
            budgetRemaining: _num(r.budgetRemaining, 100),
            deadlineFloor: _num(r.deadlineFloor, null),
            rerouteHistory: Array.isArray(r.rerouteHistory) ? r.rerouteHistory.slice(0, 20) : [],
            updatedAt: _num(r.updatedAt, Date.now())
        };
    }

    function normPath(p) {
        if (!p || typeof p !== 'object') return null;
        const pathId = _str(p.pathId || p.id);
        if (!pathId) return null;
        return {
            pathId: pathId.slice(0, 60),
            label: _str(p.label || pathId).slice(0, 100),
            prereqs: Array.isArray(p.prereqs) ? p.prereqs.map(_str).filter(Boolean) : [],
            estimatedCost: _num(p.estimatedCost, 10),
            requiredActors: Array.isArray(p.requiredActors) ? p.requiredActors.map(_str).filter(Boolean) : [],
            status: ['available', 'active', 'completed', 'abandoned'].includes(p.status) ? p.status : 'available'
        };
    }

    function normCommitment(c) {
        if (!c || typeof c !== 'object') return null;
        const actor = _str(c.actor);
        if (!actor) return null;
        return {
            actor: actor.slice(0, 40),
            role: _str(c.role || 'supporter').slice(0, 60),
            status: ['committed', 'withdrawn', 'wavering'].includes(c.status) ? c.status : 'committed',
            withdrawnReason: _str(c.withdrawnReason || '').slice(0, 150)
        };
    }

    function normCost(c) {
        if (!c || typeof c !== 'object') return null;
        return {
            floor: _num(c.floor, 0),
            description: _str(c.description || '').slice(0, 150),
            costAmount: _num(c.costAmount, 0),
            costType: _str(c.costType || 'resource').slice(0, 40)
        };
    }

    function normAttempt(a) {
        if (!a || typeof a !== 'object') return null;
        return {
            pathId: _str(a.pathId),
            outcome: _str(a.outcome),
            floor: _num(a.floor, 0),
            notes: _str(a.notes).slice(0, 200)
        };
    }

    function addAlternativePath(goal, rawPath) {
        const p = normPath(rawPath);
        if (!p) return { ok: false, reason: 'invalid_path_payload' };
        const clone = createGoal(goal);
        const idx = clone.alternativePaths.findIndex(x => x.pathId === p.pathId);
        if (idx >= 0) clone.alternativePaths[idx] = p;
        else clone.alternativePaths.push(p);
        clone.updatedAt = Date.now();
        return { ok: true, goal: clone, path: p };
    }

    function selectPath(goal, pathId) {
        const pid = _str(pathId);
        const clone = createGoal(goal);
        const target = clone.alternativePaths.find(x => x.pathId === pid);
        if (!target) return { ok: false, reason: 'path_not_found' };

        for (const p of clone.alternativePaths) {
            if (p.pathId === pid) {
                p.status = 'active';
            } else if (p.status === 'active') {
                p.status = 'available';
            }
        }
        clone.activePathId = pid;
        clone.updatedAt = Date.now();
        return { ok: true, goal: clone, activePath: target };
    }

    function recordCost(goal, costPayload) {
        const c = normCost(costPayload);
        if (!c) return { ok: false, reason: 'invalid_cost_payload' };
        const clone = createGoal(goal);
        clone.incurredCosts.push(c);
        if (c.costAmount > 0) {
            clone.budgetRemaining = Math.max(0, clone.budgetRemaining - c.costAmount);
        }
        clone.updatedAt = Date.now();
        return { ok: true, goal: clone, cost: c };
    }

    function detectImpedimentsAndProposeReroutes(goal, context = {}) {
        const g = createGoal(goal);
        const currentPath = g.alternativePaths.find(p => p.pathId === g.activePathId) || null;

        const withdrawnActors = Array.isArray(context.withdrawnActors) ? context.withdrawnActors : [];
        const isDepleted = (currentPath && g.budgetRemaining < currentPath.estimatedCost) || g.budgetRemaining <= 0 || !!context.depletedResources;
        const currentFloor = _num(context.currentFloor, 0);

        const reasons = [];

        if (currentPath && currentPath.requiredActors.length > 0) {
            for (const act of currentPath.requiredActors) {
                const comm = g.commitments.find(c => c.actor === act);
                if (withdrawnActors.includes(act) || (comm && comm.status === 'withdrawn')) {
                    reasons.push('关键参与者 [' + act + '] 退出无法履责');
                }
            }
        }

        if (isDepleted && currentPath && currentPath.estimatedCost > g.budgetRemaining) {
            reasons.push('预算/资源耗尽（剩余' + g.budgetRemaining + '，所需' + currentPath.estimatedCost + '）');
        }

        if (g.deadlineFloor != null && currentFloor > g.deadlineFloor) {
            reasons.push('超出截止楼层（截止 ' + g.deadlineFloor + '，当前 ' + currentFloor + '）');
        }

        const candidates = [];
        if (reasons.length > 0) {
            candidates.push({
                candidateId: 'cand_reduce_scope',
                type: 'scope_reduction',
                label: '缩小筹备规模，剥离高成本诉求',
                tradeOff: '降低最终成果规格，但可在现有资源下完成'
            });

            candidates.push({
                candidateId: 'cand_reschedule',
                type: 'reschedule',
                label: '与各方协商推迟交付时间',
                tradeOff: '需付出等待代价与重排日程'
            });

            const availableAlternatives = g.alternativePaths.filter(p => p.pathId !== g.activePathId && p.status === 'available');
            for (const alt of availableAlternatives) {
                candidates.push({
                    candidateId: 'cand_switch_' + alt.pathId,
                    type: 'switch_path',
                    targetPathId: alt.pathId,
                    label: '切换至备选方案「' + alt.label + '」',
                    tradeOff: '需重新满足该路线前置，放弃当前路线未完工投入'
                });
            }
        }

        return {
            isBlocked: reasons.length > 0,
            reasons,
            candidates
        };
    }

    function applyReroute(goal, candidateId, choiceMetadata = {}) {
        const cid = _str(candidateId);
        const clone = createGoal(goal);

        const check = detectImpedimentsAndProposeReroutes(clone, choiceMetadata.context || {});
        const cand = check.candidates.find(c => c.candidateId === cid);
        if (!cand) return { ok: false, reason: 'candidate_not_valid_or_not_found' };

        const logEntry = {
            candidateId: cand.candidateId,
            type: cand.type,
            choiceLabel: cand.label,
            floor: _num(choiceMetadata.floor, 0),
            rationale: _str(choiceMetadata.rationale || cand.tradeOff)
        };

        if (cand.type === 'switch_path' && cand.targetPathId) {
            selectPath(clone, cand.targetPathId);
        } else if (cand.type === 'scope_reduction') {
            clone.title = '[精简版] ' + clone.title;
        }

        clone.status = 'rerouted';
        clone.rerouteHistory.push(logEntry);
        clone.updatedAt = Date.now();
        return { ok: true, goal: clone, rerouteApplied: logEntry };
    }

    function abandonGoal(goal, reason, floor = 0) {
        const clone = createGoal(goal);
        clone.status = 'abandoned';
        clone.historicalAttempts.push({
            pathId: clone.activePathId,
            outcome: 'abandoned',
            floor: _num(floor, 0),
            notes: _str(reason || '条件不备而放弃')
        });
        clone.updatedAt = Date.now();
        return { ok: true, goal: clone };
    }

    function restartGoal(goal, newPathId = null) {
        const clone = createGoal(goal);
        if (clone.status !== 'abandoned') {
            return { ok: false, reason: 'goal_is_not_abandoned' };
        }
        clone.status = 'active';
        if (newPathId) {
            selectPath(clone, newPathId);
        }
        clone.updatedAt = Date.now();
        return { ok: true, goal: clone };
    }

    const api = {
        VERSION,
        createGoal,
        addAlternativePath,
        selectPath,
        recordCost,
        detectImpedimentsAndProposeReroutes,
        applyReroute,
        abandonGoal,
        restartGoal
    };
    return api;
});
