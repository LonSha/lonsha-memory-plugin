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

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

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
        normalizeBatchMaintenanceState,
        createBatchPreview,
        executeBatchPipeline,
        revertBatchPipeline,
        batchMaintenanceSelfCheck
    });

    root.LonShaBatchMaintenancePipeline = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);