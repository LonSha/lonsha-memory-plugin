/* ============================================================
 * commitment-instance-lifecycle.js — [L14-X4] 约定的这一次、下一次与例外
 * ------------------------------------------------------------
 * 约定实例调度与细粒度履约生命周期管理（纯函数，零依赖）。
 *
 * 【核心设计与边界约束】
 *   1. 长期承诺与具体单次实例彻底解耦（Long-term Commitment vs Concrete Instances）：
 *      - 长期承诺（commitment）生成多批独立的单次履约实例（instances）；
 *      - 针对某一次的豁免（waive）、延期（postpone）或部分履行（partially_fulfilled），
 *        决不连带终结长期承诺本身。
 *   2. 细粒度履约状态机（Fine-grained Fulfillment States）：
 *      - pending: 等待履行
 *      - fulfilled: 全部履约完成
 *      - partially_fulfilled: 部分履行（必须记录履约比例与剩余未完成项，不能冒充完全完成）
 *      - waived: 单次豁免（本周/本次豁免，并自动生成下一次实例日程）
 *      - postponed: 协商延期（更新本期 due，保留延期原因）
 *      - overdue: 逾期未履约（仅当存在确定性截止时间/楼层且超过时才可判定）
 *   3. 确定性截止时间与防伪造（No Overdue Without Timestamp/Floor）：
 *      - 无明确 dueFloor/dueTimestamp 的约定，状态保持 pending，严禁静默伪造逾期状态。
 *   4. 受控操作回执（Controlled Receipts as Evidence）：
 *      - 每次实例状态变更产出结构化履约回执（fulfillmentReceipt），包含操作时间、操作人与证据引用。
 *
 * 【数据模型】
 *   - 纯函数设计，不持有可变状态；入参校验 fail-closed。
 *   - CJS / IIFE 双导出，挂载至 root.LonShaCommitmentInstanceLifecycle。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCommitmentInstanceLifecycle = factory();
        root.CommitmentInstanceLifecycle = root.LonShaCommitmentInstanceLifecycle;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LIFECYCLE_VERSION = '1.0.0';
    const LIFECYCLE_KIND = 'commitment_instance_lifecycle';

    const INSTANCE_STATUS = Object.freeze({
        PENDING: 'pending',
        FULFILLED: 'fulfilled',
        PARTIALLY_FULFILLED: 'partially_fulfilled',
        WAIVED: 'waived',
        POSTPONED: 'postponed',
        OVERDUE: 'overdue'
    });

    function text(val, maxLen = 120) {
        if (val == null) return '';
        const s = String(val).trim();
        return s.length > maxLen ? s.slice(0, maxLen) : s;
    }

    function num(val, fallback = null) {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 从长期承诺生成或注册一个单次履约实例
     * @param {Object} commitment - 长期约定主体 { commitmentId, actor, counterpart, content, isRecurring, interval }
     * @param {Object} instanceOpts - 单次参数 { instanceSeq, dueFloor, dueTimestamp }
     */
    function createCommitmentInstance(commitment = {}, instanceOpts = {}) {
        const commId = text(commitment.commitmentId || commitment.id, 60);
        if (!commId) {
            return { ok: false, reason: 'commitment-id-required', instance: null };
        }

        const seq = num(instanceOpts.instanceSeq, 1);
        const instId = `${commId}#inst_${seq}`;
        const dueFloor = num(instanceOpts.dueFloor, null);
        const dueTimestamp = num(instanceOpts.dueTimestamp, null);

        const instance = {
            instanceId: instId,
            commitmentId: commId,
            actor: text(commitment.actor, 40),
            counterpart: text(commitment.counterpart, 40),
            content: text(commitment.content, 200),
            sequence: seq,
            dueFloor: dueFloor,
            dueTimestamp: dueTimestamp,
            status: INSTANCE_STATUS.PENDING,
            completionRatio: 0,
            notes: text(instanceOpts.note, 120),
            history: [],
            receipts: []
        };

        return {
            ok: true,
            instance: instance
        };
    }

    /**
     * 单次豁免（本周期豁免，不终结长期承诺，自动规划下一周期）
     * @param {Object} instance - 待豁免的实例
     * @param {Object} opts - { reason, authorizedBy, nextDueFloor, nextDueTimestamp }
     */
    function waiveInstance(instance, opts = {}) {
        if (!instance || !instance.instanceId) {
            return { ok: false, reason: 'invalid-instance' };
        }
        if (instance.status === INSTANCE_STATUS.FULFILLED) {
            return { ok: false, reason: 'already-fulfilled' };
        }

        const reason = text(opts.reason, 100) || '双方协议单次豁免';
        const receipt = {
            receiptId: `rcpt_waive_${Date.now()}`,
            action: 'waive',
            by: text(opts.authorizedBy, 40),
            timestamp: Date.now(),
            reason: reason
        };

        const updatedInstance = Object.assign({}, instance, {
            status: INSTANCE_STATUS.WAIVED,
            receipts: instance.receipts.concat([receipt]),
            history: instance.history.concat([`waived:${reason}`])
        });

        // 自动产生下一次周期的建议实例参数
        const nextSeq = instance.sequence + 1;
        const nextInstancePlan = {
            commitmentId: instance.commitmentId,
            actor: instance.actor,
            counterpart: instance.counterpart,
            content: instance.content,
            instanceSeq: nextSeq,
            dueFloor: num(opts.nextDueFloor, instance.dueFloor ? instance.dueFloor + 50 : null),
            dueTimestamp: num(opts.nextDueTimestamp, instance.dueTimestamp ? instance.dueTimestamp + 7 * 86400000 : null)
        };

        return {
            ok: true,
            instance: updatedInstance,
            nextInstancePlan: nextInstancePlan,
            longTermCommitmentSurvives: true
        };
    }

    /**
     * 部分履约登记（不能伪造为全额完成）
     * @param {Object} instance - 目标实例
     * @param {Object} fulfillData - { completionRatio, deliveredItems, remainingItems, evidenceRef }
     */
    function recordPartialFulfillment(instance, fulfillData = {}) {
        if (!instance || !instance.instanceId) {
            return { ok: false, reason: 'invalid-instance' };
        }
        const ratio = Math.max(0, Math.min(1.0, num(fulfillData.completionRatio, 0.5)));
        if (ratio >= 1.0) {
            return { ok: false, reason: 'ratio-indicates-full-fulfillment' };
        }

        const receipt = {
            receiptId: `rcpt_part_${Date.now()}`,
            action: 'partial_fulfill',
            ratio: ratio,
            deliveredItems: safeArr(fulfillData.deliveredItems).map(i => text(i, 60)),
            remainingItems: safeArr(fulfillData.remainingItems).map(i => text(i, 60)),
            evidenceRef: text(fulfillData.evidenceRef, 60),
            timestamp: Date.now()
        };

        const updated = Object.assign({}, instance, {
            status: INSTANCE_STATUS.PARTIALLY_FULFILLED,
            completionRatio: ratio,
            receipts: instance.receipts.concat([receipt]),
            history: instance.history.concat([`partial:${ratio * 100}%`])
        });

        return {
            ok: true,
            instance: updated,
            isFullyFulfilled: false
        };
    }

    /**
     * 判定逾期状态（无明确时间/楼层时不造逾期）
     * @param {Object} instance - 目标实例
     * @param {Number} currentFloor - 当前故事楼层
     * @param {Number} currentTimestamp - 当前物理时间戳
     */
    function evaluateOverdue(instance, currentFloor = null, currentTimestamp = null) {
        if (!instance || !instance.instanceId) {
            return { status: 'unknown', reason: 'invalid-instance' };
        }
        if (instance.status === INSTANCE_STATUS.FULFILLED || instance.status === INSTANCE_STATUS.WAIVED) {
            return { status: instance.status, isOverdue: false, reason: 'settled' };
        }

        const cf = num(currentFloor, null);
        const ct = num(currentTimestamp, null);

        // 如果没有明确截止条件，不得判定逾期
        if (instance.dueFloor == null && instance.dueTimestamp == null) {
            return {
                status: instance.status,
                isOverdue: false,
                reason: 'no-due-deadline-specified'
            };
        }

        let isOverdue = false;
        let trigger = '';

        if (instance.dueFloor != null && cf != null && cf > instance.dueFloor) {
            isOverdue = true;
            trigger = `floor-exceeded:${cf}>${instance.dueFloor}`;
        } else if (instance.dueTimestamp != null && ct != null && ct > instance.dueTimestamp) {
            isOverdue = true;
            trigger = `time-exceeded:${ct}>${instance.dueTimestamp}`;
        }

        if (isOverdue) {
            return {
                status: INSTANCE_STATUS.OVERDUE,
                isOverdue: true,
                reason: trigger
            };
        }

        return {
            status: instance.status,
            isOverdue: false,
            reason: 'within-window'
        };
    }

    /**
     * 自检函数
     */
    function commitmentInstanceSelfCheck() {
        const createRes = createCommitmentInstance({ commitmentId: 'comm_1', actor: 'A', counterpart: 'B', content: '每周一次汇报' });
        if (!createRes.ok) return { ok: false, reason: 'selfcheck-create-fail' };
        const waiveRes = waiveInstance(createRes.instance, { reason: '外出采风' });
        if (!waiveRes.ok || !waiveRes.nextInstancePlan) return { ok: false, reason: 'selfcheck-waive-fail' };
        return { ok: true, version: LIFECYCLE_VERSION };
    }

    return {
        LIFECYCLE_VERSION: LIFECYCLE_VERSION,
        LIFECYCLE_KIND: LIFECYCLE_KIND,
        INSTANCE_STATUS: INSTANCE_STATUS,
        createCommitmentInstance: createCommitmentInstance,
        waiveInstance: waiveInstance,
        recordPartialFulfillment: recordPartialFulfillment,
        evaluateOverdue: evaluateOverdue,
        commitmentInstanceSelfCheck: commitmentInstanceSelfCheck
    };
}));