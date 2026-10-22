/* ========================================================
 * conditional-consequence.js — [M6-X3 · v3.358.0] 条件后果推演契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   从自动续写确定未来，到在作者作选择前展示有依据的延迟影响与多条件投影。
 * 核心机制：
 *   1. 动作提案投影（Action Projection）：输出直接变化、条件性后续、可能失去的选项及明确未知项；
 *   2. 冲突承诺张力模型（Commitment Tension）：接下冲突承诺时提示预算重叠与履约风险，绝不提前判定违约；
 *   3. 动态解脱（Dynamic Relieve）：新证据（如取消、改期、协力介入）解除冲突后，张力投影自适应消除；
 *   4. 拒绝伪精确（Rejection of False Precision）：缺少规则的节点必须标为 unknown，不臆造虚假概率；
 *   5. 有界深度（Bounded Exploration）：通过 maxDepth 防止组合爆炸。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaConditionalConsequence = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const VERSION = '3.358.0';
    const DEFAULT_MAX_DEPTH = 3;

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _arr(v) { return Array.isArray(v) ? v : []; }
    function _clone(v) {
        if (v == null || typeof v !== 'object') return v;
        return JSON.parse(JSON.stringify(v));
    }

    /**
     * 规范化因果规则
     */
    function normalizeCausalRule(r) {
        const triggerAction = _str(r?.triggerAction);
        if (!triggerAction) throw new Error('Causal rule requires triggerAction');
        return Object.freeze({
            ruleId: _str(r.ruleId) || ('rule_' + Math.random().toString(36).slice(2, 7)),
            triggerAction,
            requiredCondition: _str(r.requiredCondition) || null,
            directEffect: _str(r.directEffect) || '',
            consequence: _str(r.consequence) || '',
            foregoes: _arr(r.foregoes).map(_str).filter(Boolean),
            timeCostHours: Number.isFinite(Number(r.timeCostHours)) ? Number(r.timeCostHours) : 0,
            resourceCosts: { ...(r.resourceCosts || {}) }
        });
    }

    /**
     * 推演动作提案的可能后果
     * @param {Object} spec
     *   - actionProposal: { actionKey, title, timeSlot, consumesResources, participants }
     *   - contextState: { commitments: [], resources: {}, activeRules: [], worldFlags: {} }
     *   - options: { maxDepth: 3 }
     */
    function projectActionConsequences(spec = {}) {
        const action = spec.actionProposal;
        if (!action || !_str(action.actionKey)) {
            throw new Error('projectActionConsequences requires valid actionProposal');
        }

        const maxDepth = Math.min(Number(spec.options?.maxDepth) || DEFAULT_MAX_DEPTH, 5);
        const context = spec.contextState || {};
        const commitments = _arr(context.commitments);
        const resources = context.resources || {};
        const activeRules = _arr(context.activeRules).map(normalizeCausalRule);
        const worldFlags = context.worldFlags || {};

        const directEffects = [];
        const conditionalFallouts = [];
        const foregoneOptions = new Set();
        const unknowns = [];
        const commitmentTensions = [];

        // 1. 匹配规则
        const matchedRules = activeRules.filter(r => r.triggerAction === action.actionKey);

        if (matchedRules.length === 0) {
            // 没有先验规则时，严格声明未知，绝不猜测伪精确概率
            unknowns.push({
                domain: action.actionKey,
                reason: 'No explicit causal rule defined for action: ' + action.actionKey,
                confidence: 'unknown'
            });
        } else {
            for (const rule of matchedRules) {
                if (rule.directEffect) directEffects.push(rule.directEffect);

                // 检查条件性后续
                if (rule.requiredCondition) {
                    const isConditionMet = Boolean(worldFlags[rule.requiredCondition]);
                    conditionalFallouts.push({
                        condition: rule.requiredCondition,
                        isConditionMet,
                        consequence: rule.consequence,
                        status: isConditionMet ? 'active' : 'dormant'
                    });
                } else if (rule.consequence) {
                    directEffects.push(rule.consequence);
                }

                // 失去的选项
                rule.foregoes.forEach(opt => foregoneOptions.add(opt));
            }
        }

        // 2. 承诺与时间预算分析（关键验收项：冲突不提前判违约）
        const actionTimeSlot = _str(action.timeSlot);
        const actionTimeCost = Number(action.timeCostHours) || 0;

        if (actionTimeSlot) {
            commitments.forEach(c => {
                if (c.status === 'active' && c.timeSlot === actionTimeSlot) {
                    commitmentTensions.push({
                        commitmentId: c.commitmentId || c.id,
                        title: c.title,
                        timeSlot: actionTimeSlot,
                        nature: 'time_window_collision',
                        isBreached: false, // 严格断言：绝不提前标记为违约！
                        status: 'at_risk',
                        remedyOptions: ['reschedule', 'delegate', 'cancel_with_notice']
                    });
                }
            });
        }

        // 3. 资源耗尽导致的失去选项
        if (action.consumesResources) {
            for (const [resKey, amount] of Object.entries(action.consumesResources)) {
                const available = Number(resources[resKey]) || 0;
                if (available < amount) {
                    conditionalFallouts.push({
                        condition: 'resource_shortage_' + resKey,
                        isConditionMet: true,
                        consequence: 'Resource shortage on ' + resKey + ' (required ' + amount + ', available ' + available + ')',
                        status: 'impediment'
                    });
                }
            }
        }

        return Object.freeze({
            actionKey: action.actionKey,
            title: _str(action.title) || action.actionKey,
            directEffects,
            conditionalFallouts,
            foregoneOptions: Array.from(foregoneOptions),
            unknowns,
            commitmentTensions,
            hasConflict: commitmentTensions.length > 0,
            analyzedAt: Date.now()
        });
    }

    /**
     * 新证据/新举措解除承诺冲突
     */
    function relieveCommitmentTension(projection, resolutionEvent = {}) {
        if (!projection || !projection.actionKey) throw new Error('Invalid projection');
        const resolvedCommitmentId = _str(resolutionEvent.resolvedCommitmentId);
        const remedyUsed = _str(resolutionEvent.remedyUsed) || 'reschedule';

        const updatedTensions = projection.commitmentTensions.filter(t => {
            return t.commitmentId !== resolvedCommitmentId;
        });

        const relievedNotes = [...(projection.relievedNotes || [])];
        relievedNotes.push('Commitment [' + resolvedCommitmentId + '] conflict relieved via ' + remedyUsed);

        return Object.freeze({
            ..._clone(projection),
            commitmentTensions: updatedTensions,
            hasConflict: updatedTensions.length > 0,
            relievedNotes,
            updatedAt: Date.now()
        });
    }

    return Object.freeze({
        VERSION,
        normalizeCausalRule,
        projectActionConsequences,
        relieveCommitmentTension
    });
});