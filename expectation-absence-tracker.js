/* ============================================================
 * expectation-absence-tracker.js — [L10-X5 · 第十期全量创新]
 * 缺席与期待记忆追踪器（Expectation & Absence Tracker）
 * ------------------------------------------------------------
 * 【核心设计】
 *   戏剧性的核心往往在于「本该发生但没有发生的事」：
 *   - 约定每天道晚安，但今晚沉默了；
 *   - 答应周五在码头见面，但船靠岸时人影皆无。
 *   追踪机制：
 *   1. 期待槽位（Expectation Slot）：注册预期的行为、时间窗口（楼层范围）与发起/期待主体；
 *   2. 缺席判决（Absence Verdict）：当故事推进超过截止楼层且无对应履约记录时，
 *      判定为「反常缺席（Anomalous Absence）」，转化为高优先级戏剧冲突记忆。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaExpectationAbsence = factory();
    root.ExpectationAbsenceTracker = root.LonShaExpectationAbsence;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EXPECTATION_STATUS = Object.freeze({
        PENDING: 'pending',       // 等待中
        FULFILLED: 'fulfilled',   // 如期履约
        BREACHED_ABSENT: 'breached_absent', // 逾期缺席（未发生）
        WAIVED: 'waived'          // 双方明确免除/取消
    });

    /**
     * 创建期待槽位
     */
    function createExpectation(slot = {}) {
        return {
            id: slot.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            expector: String(slot.expector || 'user'),     // 期待者
            targetActor: String(slot.targetActor || ''),   // 预期履约者
            actionDescription: String(slot.actionDescription || '').trim(), // 预期动作
            registeredFloor: Number.isFinite(slot.registeredFloor) ? slot.registeredFloor : 0,
            dueFloor: Number.isFinite(slot.dueFloor) ? slot.dueFloor : 100, // 截止楼层
            significance: Math.max(0.1, Math.min(1.0, Number(slot.significance) || 0.6)), // 关键度
            status: EXPECTATION_STATUS.PENDING,
            fulfilledAtFloor: null,
            breachedAtFloor: null
        };
    }

    /**
     * 结算期待状态：根据当前楼层与履约事实清单判定是否发生缺席
     * @param {Array} expectationList - 期待槽位列表
     * @param {number} currentFloor - 当前楼层
     * @param {Array} actionLogs - 期间发生的行为/履约事实
     * @returns {Object} { updatedList, newlyAbsents }
     */
    function evaluateExpectations(expectationList = [], currentFloor = 0, actionLogs = []) {
        if (!Array.isArray(expectationList)) return { updatedList: [], newlyAbsents: [] };

        const updatedList = [];
        const newlyAbsents = [];

        for (const exp of expectationList) {
            if (exp.status !== EXPECTATION_STATUS.PENDING) {
                updatedList.push({ ...exp });
                continue;
            }

            // 检查是否有对应的履约事实
            const isFulfilled = actionLogs.some(log => {
                if (log.actor && log.actor !== exp.targetActor) return false;
                const desc = String(log.description || log.text || '');
                return desc.includes(exp.actionDescription);
            });

            if (isFulfilled) {
                updatedList.push({
                    ...exp,
                    status: EXPECTATION_STATUS.FULFILLED,
                    fulfilledAtFloor: currentFloor
                });
            } else if (currentFloor > exp.dueFloor) {
                // 超过截止楼层，判定为缺席违约
                const absentRecord = {
                    ...exp,
                    status: EXPECTATION_STATUS.BREACHED_ABSENT,
                    breachedAtFloor: currentFloor,
                    memoryNarrative: `【反常缺席】：${exp.targetActor}未能在约定节点（第${exp.dueFloor}楼前）履行“${exp.actionDescription}”，让${exp.expector}陷入悬空与失落。`
                };
                updatedList.push(absentRecord);
                newlyAbsents.push(absentRecord);
            } else {
                updatedList.push({ ...exp });
            }
        }

        return { updatedList, newlyAbsents };
    }

    return Object.freeze({
        EXPECTATION_STATUS,
        createExpectation,
        evaluateExpectations
    });
}));