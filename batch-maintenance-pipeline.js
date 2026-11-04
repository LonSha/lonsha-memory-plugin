/* ========================================================
 * batch-maintenance-pipeline.js — [M8-O7 · 第八期规划] 批量记忆维护流水线（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决长期记忆膨胀后，用户无法安全、批量管理海量碎片的问题：
 *     ① 四大批量操作：archive（归档）/ degrade_to_speculation（降级推测）/
 *        set_security_tier（调密级）/ tag_entity（打标实体）；
 *     ② 强制三步流程：dry-run 预览 -> 生成审计回执 -> 提交生效；
 *     ③ 支持单凭证全局无损回滚，保证批量操作可逆；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const BATCH_ACTIONS = Object.freeze({
        ARCHIVE: 'archive',
        DEGRADE_TO_SPECULATION: 'degrade_to_speculation',
        SET_SECURITY_TIER: 'set_security_tier',
        TAG_ENTITY: 'tag_entity'
    });
    const SCOPED_MAINTENANCE_ACTIONS = Object.freeze({
        ARCHIVE: BATCH_ACTIONS.ARCHIVE,
        DEGRADE_TO_SPECULATION: BATCH_ACTIONS.DEGRADE_TO_SPECULATION,
        SET_SECURITY_TIER: BATCH_ACTIONS.SET_SECURITY_TIER,
        TAG_ENTITY: BATCH_ACTIONS.TAG_ENTITY,
        MUTE: 'mute'
    });
    const MAINTENANCE_TASK_STATUS = Object.freeze({
        PREVIEW: 'preview',
        READY: 'ready',
        APPLIED: 'applied'
    });
    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }
    function itemId(item) { return safeStr(item && (item.id || item.factKey || item.topicId)); }
    function uniqueIds(ids) {
        return [...new Set(safeArr(ids).map(safeStr).filter(Boolean))];
    }
    function recallImpact(action) {
        if (action === SCOPED_MAINTENANCE_ACTIONS.MUTE) {
            return { defaultRecall: 'suppressed', evidence: 'preserved', reversible: true };
        }
        if (action === SCOPED_MAINTENANCE_ACTIONS.ARCHIVE) {
            return { defaultRecall: 'excluded', evidence: 'preserved', reversible: true };
        }
        if (action === SCOPED_MAINTENANCE_ACTIONS.DEGRADE_TO_SPECULATION) {
            return { defaultRecall: 'downgraded', evidence: 'preserved', reversible: true };
        }
        return { defaultRecall: 'unchanged', evidence: 'preserved', reversible: true };
    }

    function normalizeBatchMaintenanceState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                executedReceipts: {}, // receiptId -> receiptObj
                updatedAt: Date.now()
            };
        }
        return {
            executedReceipts: (raw.executedReceipts && typeof raw.executedReceipts === 'object') ? { ...raw.executedReceipts } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 生成批量操作预览（Dry-Run）
     */
    function createBatchPreview(items, action, params = {}) {
        const list = safeArr(items);
        const act = safeStr(action);

        if (!Object.values(BATCH_ACTIONS).includes(act)) {
            return { valid: false, reason: 'unsupported-action', previewItems: [] };
        }

        const previewItems = list.map(item => {
            if (!item || typeof item !== 'object') return null;
            const original = { ...item };
            const transformed = { ...item };

            if (act === BATCH_ACTIONS.ARCHIVE) {
                transformed.isArchived = true;
            } else if (act === BATCH_ACTIONS.DEGRADE_TO_SPECULATION) {
                transformed.isSpeculation = true;
                transformed.tier = 'speculation';
            } else if (act === BATCH_ACTIONS.SET_SECURITY_TIER) {
                transformed.securityTier = safeStr(params.securityTier) || 'public_known';
            } else if (act === BATCH_ACTIONS.TAG_ENTITY) {
                const tags = new Set(safeArr(transformed.entities));
                tags.add(safeStr(params.entityTag));
                transformed.entities = Array.from(tags).filter(Boolean);
            }

            return {
                id: item.id || item.factKey,
                original,
                transformed
            };
        }).filter(Boolean);

        return {
            valid: true,
            action: act,
            params,
            targetCount: previewItems.length,
            previewItems
        };
    }

    /**
     * 生成严格限定到用户选择集的维护任务预览。
     * 该层不写入任何源数据，任务可 JSON 序列化后作为断点恢复。
     */
    function createScopedMaintenanceTask(items, selectedIds, action, params = {}, now = Date.now()) {
        const list = safeArr(items);
        const ids = uniqueIds(selectedIds);
        const act = safeStr(action);
        if (!ids.length) return { valid: false, reason: 'empty-selection', status: MAINTENANCE_TASK_STATUS.PREVIEW };
        if (!Object.values(SCOPED_MAINTENANCE_ACTIONS).includes(act)) {
            return { valid: false, reason: 'unsupported-action', status: MAINTENANCE_TASK_STATUS.PREVIEW };
        }
        const byId = new Map(list.map(item => [itemId(item), item]));
        const unknownIds = ids.filter(id => !byId.has(id));
        if (unknownIds.length) {
            return { valid: false, reason: 'unknown-selection', unknownIds, status: MAINTENANCE_TASK_STATUS.PREVIEW };
        }
        const selectedItems = ids.map(id => byId.get(id));
        const previewItems = selectedItems.map(item => {
            const original = { ...item };
            const transformed = { ...item };
            if (act === SCOPED_MAINTENANCE_ACTIONS.MUTE) {
                transformed.muted = true;
                transformed.mutedAt = now;
            } else {
                const preview = createBatchPreview([item], act, params);
                if (!preview.valid) return null;
                Object.assign(transformed, preview.previewItems[0].transformed);
            }
            return {
                id: itemId(item),
                original,
                transformed,
                evidence: Array.isArray(item.evidence) ? [...item.evidence] : (Array.isArray(item.sources) ? [...item.sources] : [])
            };
        }).filter(Boolean);
        return {
            valid: true,
            status: MAINTENANCE_TASK_STATUS.READY,
            taskId: `mtask_${now}_${Math.random().toString(36).slice(2, 8)}`,
            action: act,
            params: { ...params },
            selectedIds: ids,
            targetCount: previewItems.length,
            previewItems,
            impact: recallImpact(act),
            createdAt: now,
            checkpoint: { selectedIds: ids, action: act, params: { ...params }, createdAt: now }
        };
    }

    /**
     * 提交已预览的范围任务。未经 confirm 不返回任何写入载荷。
     */
    function applyScopedMaintenanceTask(state, task, options = {}) {
        const s = normalizeBatchMaintenanceState(state);
        if (!task || task.valid !== true || task.status !== MAINTENANCE_TASK_STATUS.READY) {
            return { success: false, reason: 'invalid-task', state: s };
        }
        if (options.confirm !== true) {
            return { success: false, reason: 'confirmation-required', writes: false, state: s, task };
        }
        const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
        const receiptId = `srec_${task.action}_${now}_${Math.random().toString(36).slice(2, 8)}`;
        const receipt = {
            receiptId,
            taskId: task.taskId,
            action: task.action,
            params: task.params,
            selectedIds: [...task.selectedIds],
            affectedCount: task.previewItems.length,
            rollbackSnapshots: task.previewItems.map(item => ({ ...item.original })),
            evidenceSnapshots: task.previewItems.map(item => ({ id: item.id, evidence: [...item.evidence] })),
            impact: { ...task.impact },
            executedAt: now
        };
        return {
            success: true,
            writes: true,
            receipt,
            transformedItems: task.previewItems.map(item => ({ ...item.transformed })),
            task: { ...task, status: MAINTENANCE_TASK_STATUS.APPLIED, appliedAt: now },
            state: {
                ...s,
                executedReceipts: { ...s.executedReceipts, [receiptId]: receipt },
                updatedAt: now
            }
        };
    }

    function resumeScopedMaintenanceTask(checkpoint, items, now = Date.now()) {
        if (!checkpoint || typeof checkpoint !== 'object') return { valid: false, reason: 'missing-checkpoint' };
        return createScopedMaintenanceTask(items, checkpoint.selectedIds, checkpoint.action, checkpoint.params || {}, now);
    }

    /**
     * 提交执行批量操作并生成可撤销回执
     */
    function executeBatchPipeline(state, preview, now = Date.now()) {
        const s = normalizeBatchMaintenanceState(state);
        if (!preview || !preview.valid || !Array.isArray(preview.previewItems)) {
            return { success: false, reason: 'invalid-preview', state: s };
        }

        const receiptId = `brec_${preview.action}_${now}_${Math.random().toString(36).slice(2, 6)}`;
        const transformedItems = preview.previewItems.map(p => p.transformed);
        const rollbackSnapshots = preview.previewItems.map(p => p.original);

        const receipt = {
            receiptId,
            action: preview.action,
            params: preview.params,
            affectedCount: preview.previewItems.length,
            rollbackSnapshots,
            executedAt: now
        };

        return {
            success: true,
            receipt,
            transformedItems,
            state: {
                ...s,
                executedReceipts: { ...s.executedReceipts, [receiptId]: receipt },
                updatedAt: now
            }
        };
    }

    /**
     * 一键撤销批量操作，返回前态数据列表
     */
    function revertBatchPipeline(state, receiptId, now = Date.now()) {
        const s = normalizeBatchMaintenanceState(state);
        const rId = safeStr(receiptId);
        const receipt = s.executedReceipts[rId];

        if (!receipt) {
            return { success: false, reason: 'receipt-not-found', state: s };
        }

        const restoredItems = [...receipt.rollbackSnapshots];
        const nextReceipts = { ...s.executedReceipts };
        delete nextReceipts[rId];

        return {
            success: true,
            restoredCount: restoredItems.length,
            restoredItems,
            state: {
                ...s,
                executedReceipts: nextReceipts,
                updatedAt: now
            }
        };
    }

    function batchMaintenanceSelfCheck() {
        const problems = [];
        if (Object.keys(BATCH_ACTIONS).length !== 4) problems.push('BATCH_ACTIONS 必须恰好为 4 种操作');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        BATCH_ACTIONS,
        SCOPED_MAINTENANCE_ACTIONS,
        MAINTENANCE_TASK_STATUS,
        normalizeBatchMaintenanceState,
        createBatchPreview,
        createScopedMaintenanceTask,
        applyScopedMaintenanceTask,
        resumeScopedMaintenanceTask,
        executeBatchPipeline,
        revertBatchPipeline,
        batchMaintenanceSelfCheck
    });

    root.LonShaBatchMaintenancePipeline = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);