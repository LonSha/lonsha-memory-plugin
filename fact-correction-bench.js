/* ========================================================
 * fact-correction-bench.js — [M7-O2 · 第七期规划] 记忆修订台内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   用户发现角色年龄/事件地点记错，希望纠正事实并检查依赖它的摘要、目标、关系和研究结论。
 *   旧链路缺少依赖影响可见性，改动要么只改一条源事实导致下游结论陈旧自相矛盾，
 *   要么粗暴级联覆盖导致用户手写/锁定的内容被静默冲掉。
 *   记忆修订台提供带依赖影响图的纯函数修订方案：
 *     ① 划定下游三级影响：可自动重算(recomputable) / 需确认(needs_confirm) / 不可自动改(manual_only)；
 *     ② 修订源事实后将受影响下游标记为过期(stale: true)，无关分支零影响保持不变；
 *     ③ 撤销修订(rollback)可精准恢复前序版本，下游过期状态同步解除；
 *     ④ 撤销/删除源事实(revocation)时，下游依赖标记为无法验证(unverifiable: true)，不继续伪造断言。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 下游影响级别 */
    const IMPACT_TIERS = Object.freeze({
        RECOMPUTABLE: 'recomputable',   // 可自动重算（如衍生摘要、统计计数值）
        NEEDS_CONFIRM: 'needs_confirm', // 需用户确认（如剧情称谓、关键承诺）
        MANUAL_ONLY: 'manual_only'      // 不可自动改（用户手写笔记、锁定条目）
    });

    /** 修订动作类型 */
    const REVISION_ACTIONS = Object.freeze({
        UPDATE_VALUE: 'update_value',
        REVOKE: 'revoke',
        ROLLBACK: 'rollback'
    });

    /** 归因词表 */
    const BENCH_REASONS = Object.freeze({
        OK: '',
        FACT_NOT_FOUND: 'fact-not-found',
        INVALID_REVISION: 'invalid-revision',
        NO_HISTORY: 'no-history-to-rollback',
        PROTECTED_ENTRY: 'protected-manual-entry'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }

    /**
     * 分析某源事实的下游依赖影响图
     * @param {string} factKey 事实主键 (如 'xiaoxue:age')
     * @param {Array<object>} dependents 下游依赖项数组
     */
    function traceImpactGraph(factKey, dependents = []) {
        const key = safeStr(factKey);
        const list = Array.isArray(dependents) ? dependents : [];
        const affected = [];
        const unaffected = [];

        for (const dep of list) {
            if (!dep || typeof dep !== 'object') continue;
            const deps = Array.isArray(dep.dependsOn) ? dep.dependsOn.map(safeStr) : [];
            const isMatch = deps.includes(key);

            if (isMatch) {
                // 判断影响级别
                let tier = IMPACT_TIERS.NEEDS_CONFIRM;
                if (dep.isManual || dep.locked) {
                    tier = IMPACT_TIERS.MANUAL_ONLY;
                } else if (dep.category === 'summary' || dep.category === 'count' || dep.autoRecomputable) {
                    tier = IMPACT_TIERS.RECOMPUTABLE;
                }

                affected.push(Object.freeze({
                    id: safeStr(dep.id),
                    title: safeStr(dep.title || dep.id),
                    category: safeStr(dep.category),
                    tier,
                    isManual: Boolean(dep.isManual || dep.locked),
                    currentValue: dep.value !== undefined ? dep.value : null
                }));
            } else {
                unaffected.push(Object.freeze({
                    id: safeStr(dep.id),
                    title: safeStr(dep.title || dep.id),
                    category: safeStr(dep.category)
                }));
            }
        }

        return Object.freeze({
            factKey: key,
            affected: Object.freeze(affected),
            unaffected: Object.freeze(unaffected),
            summary: Object.freeze({
                totalAffected: affected.length,
                recomputableCount: affected.filter(a => a.tier === IMPACT_TIERS.RECOMPUTABLE).length,
                needsConfirmCount: affected.filter(a => a.tier === IMPACT_TIERS.NEEDS_CONFIRM).length,
                manualOnlyCount: affected.filter(a => a.tier === IMPACT_TIERS.MANUAL_ONLY).length
            })
        });
    }

    /**
     * 生成并应用事实修订计划
     * @param {object} factRecord 既有事实记录 { key, value, version, history: [] }
     * @param {any} newValue 新值
     * @param {Array<object>} dependents 下游依赖项集合
     * @param {number} now 时间戳
     */
    function reviseFact(factRecord, newValue, dependents = [], now = Date.now()) {
        if (!factRecord || typeof factRecord !== 'object') {
            return { ok: false, why: BENCH_REASONS.FACT_NOT_FOUND, updatedFact: null, updatedDependents: dependents };
        }
        const key = safeStr(factRecord.key);
        const history = Array.isArray(factRecord.history) ? [...factRecord.history] : [];
        const oldVersion = Number.isFinite(Number(factRecord.version)) ? Number(factRecord.version) : 1;

        // 保存历史快照
        history.push(Object.freeze({
            version: oldVersion,
            value: factRecord.value,
            modifiedAt: factRecord.updatedAt || now
        }));

        const updatedFact = Object.freeze({
            ...factRecord,
            key,
            value: newValue,
            version: oldVersion + 1,
            history: Object.freeze(history),
            revoked: false,
            updatedAt: now
        });

        // 计算下游影响
        const impact = traceImpactGraph(key, dependents);
        const affectedIds = new Set(impact.affected.map(a => a.id));

        const updatedDependents = (Array.isArray(dependents) ? dependents : []).map(dep => {
            if (!dep || !affectedIds.has(safeStr(dep.id))) {
                return dep; // 无关分支绝不修改，直接原样返回
            }
            const impactInfo = impact.affected.find(a => a.id === safeStr(dep.id));
            return Object.freeze({
                ...dep,
                stale: true,
                staleReason: 'source_fact_revised',
                staleSourceKey: key,
                impactTier: impactInfo.tier,
                unverifiable: false,
                staleAt: now
            });
        });

        return {
            ok: true,
            why: BENCH_REASONS.OK,
            action: REVISION_ACTIONS.UPDATE_VALUE,
            updatedFact,
            updatedDependents: Object.freeze(updatedDependents),
            impact
        };
    }

    /**
     * 回滚源事实到上一版本
     */
    function rollbackFact(factRecord, dependents = [], now = Date.now()) {
        if (!factRecord || typeof factRecord !== 'object') {
            return { ok: false, why: BENCH_REASONS.FACT_NOT_FOUND, updatedFact: null, updatedDependents: dependents };
        }
        const history = Array.isArray(factRecord.history) ? [...factRecord.history] : [];
        if (history.length === 0) {
            return { ok: false, why: BENCH_REASONS.NO_HISTORY, updatedFact: factRecord, updatedDependents: dependents };
        }

        const prev = history.pop();
        const updatedFact = Object.freeze({
            ...factRecord,
            value: prev.value,
            version: Math.max(1, (Number(factRecord.version) || 2) - 1),
            history: Object.freeze(history),
            revoked: false,
            updatedAt: now
        });

        const key = safeStr(factRecord.key);
        // 回退后，解除下游因该事实 revision 导致的 stale 标记
        const updatedDependents = (Array.isArray(dependents) ? dependents : []).map(dep => {
            if (dep && dep.staleSourceKey === key) {
                const copy = { ...dep };
                delete copy.stale;
                delete copy.staleReason;
                delete copy.staleSourceKey;
                delete copy.impactTier;
                delete copy.staleAt;
                return Object.freeze(copy);
            }
            return dep;
        });

        return {
            ok: true,
            why: BENCH_REASONS.OK,
            action: REVISION_ACTIONS.ROLLBACK,
            updatedFact,
            updatedDependents: Object.freeze(updatedDependents)
        };
    }

    /**
     * 撤销/删除源事实
     * 规则：源事实删除后，依赖项标记为 unverifiable: true（无法验证），而非继续视为有效事实
     */
    function revokeSourceFact(factRecord, dependents = [], reason = '', now = Date.now()) {
        if (!factRecord || typeof factRecord !== 'object') {
            return { ok: false, why: BENCH_REASONS.FACT_NOT_FOUND, updatedFact: null, updatedDependents: dependents };
        }
        const key = safeStr(factRecord.key);
        const updatedFact = Object.freeze({
            ...factRecord,
            revoked: true,
            revokeReason: safeStr(reason) || '用户撤销事实',
            revokedAt: now
        });

        const impact = traceImpactGraph(key, dependents);
        const affectedIds = new Set(impact.affected.map(a => a.id));

        const updatedDependents = (Array.isArray(dependents) ? dependents : []).map(dep => {
            if (!dep || !affectedIds.has(safeStr(dep.id))) {
                return dep;
            }
            return Object.freeze({
                ...dep,
                stale: true,
                unverifiable: true,
                unverifiableReason: 'source_fact_revoked',
                staleSourceKey: key,
                staleAt: now
            });
        });

        return {
            ok: true,
            why: BENCH_REASONS.OK,
            action: REVISION_ACTIONS.REVOKE,
            updatedFact,
            updatedDependents: Object.freeze(updatedDependents),
            impact
        };
    }

    /**
     * 自检函数
     */
    function correctionBenchSelfCheck() {
        const problems = [];
        if (Object.keys(IMPACT_TIERS).length !== 3) problems.push('IMPACT_TIERS 必须恰好为 3 级');
        if (Object.keys(REVISION_ACTIONS).length !== 3) problems.push('REVISION_ACTIONS 必须包含 3 种动作');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        IMPACT_TIERS,
        REVISION_ACTIONS,
        BENCH_REASONS,
        traceImpactGraph,
        reviseFact,
        rollbackFact,
        revokeSourceFact,
        correctionBenchSelfCheck
    });

    root.LonShaFactCorrectionBench = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);