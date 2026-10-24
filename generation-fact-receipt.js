/* ========================================================
 * generation-fact-receipt.js — [M7-O6 · 第七期规划] 生成后事实回执内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   一轮生成常混杂真实新事实、条件承诺与模型推测的草稿；
 *   以往直接全部沉淀进长期记忆，导致模型的临时胡话被自动当真。
 *   生成后事实回执提供增量审查与防污染屏障：
 *     ① 区分三种条目形态：确立事实(confirmed_fact) / 条件提议(conditional_proposal) / 模型草稿(model_draft)；
 *     ② 用户四态处置：待定(pending) / 采纳(accepted) / 拒绝(rejected) / 改写采纳(edited)；
 *     ③ 消费侧防污染契约：被拒绝的条目绝不写入长期事实账本，且后续摘要不继承；
 *     ④ 宿主楼层回滚联动(rollbackFloorReceipts)：楼层回退时，对应回执自动标记作废。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 回执条目形态 */
    const RECEIPT_ENTRY_KINDS = Object.freeze({
        CONFIRMED_FACT: 'confirmed_fact',           // 确立事实
        CONDITIONAL_PROPOSAL: 'conditional_proposal', // 条件提议/临时承诺
        MODEL_DRAFT: 'model_draft'                  // 模型草稿/猜测
    });

    /** 审查处置状态 */
    const RECEIPT_ENTRY_STATUS = Object.freeze({
        PENDING: 'pending',
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        EDITED: 'edited',
        ROLLED_BACK: 'rolled_back'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeNum(v, fallback = 0) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * 规范化单条事实回执项
     */
    function normalizeReceiptEntry(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const id = safeStr(raw.id) || ('gfe_' + idx);
        const originalSentence = safeStr(raw.originalSentence || raw.text || raw.content);
        if (!originalSentence) return null;

        const content = safeStr(raw.content) || originalSentence;
        const validKinds = Object.values(RECEIPT_ENTRY_KINDS);
        const kind = validKinds.includes(raw.kind) ? raw.kind : RECEIPT_ENTRY_KINDS.MODEL_DRAFT;

        const validStatuses = Object.values(RECEIPT_ENTRY_STATUS);
        const status = validStatuses.includes(raw.status) ? raw.status : RECEIPT_ENTRY_STATUS.PENDING;

        const subject = safeStr(raw.subject);
        const predicate = safeStr(raw.predicate);
        const rejectionReason = safeStr(raw.rejectionReason);

        return Object.freeze({
            id,
            originalSentence,
            content,
            kind,
            status,
            subject,
            predicate,
            rejectionReason
        });
    }

    /**
     * 构建生成后事实回执
     */
    function buildGenerationReceipt(floorNumber, generatedText = '', candidateEntries = [], now = Date.now()) {
        const floor = safeNum(floorNumber, null);
        const rawEntries = Array.isArray(candidateEntries) ? candidateEntries : [];
        const entries = rawEntries.map((e, idx) => normalizeReceiptEntry(e, idx)).filter(Boolean);

        return Object.freeze({
            floor,
            generatedSnippet: safeStr(generatedText).slice(0, 500),
            entries: Object.freeze(entries),
            createdAt: now,
            floorRolledBack: false
        });
    }

    /**
     * 采纳回执项
     */
    function acceptReceiptItem(receipt, itemId) {
        if (!receipt || !Array.isArray(receipt.entries)) return receipt;
        const targetId = safeStr(itemId);
        const nextEntries = receipt.entries.map(e => {
            if (e.id !== targetId) return e;
            return Object.freeze({
                ...e,
                status: RECEIPT_ENTRY_STATUS.ACCEPTED
            });
        });
        return Object.freeze({
            ...receipt,
            entries: Object.freeze(nextEntries)
        });
    }

    /**
     * 拒绝回执项（附带理由）
     */
    function rejectReceiptItem(receipt, itemId, reason = '') {
        if (!receipt || !Array.isArray(receipt.entries)) return receipt;
        const targetId = safeStr(itemId);
        const nextEntries = receipt.entries.map(e => {
            if (e.id !== targetId) return e;
            return Object.freeze({
                ...e,
                status: RECEIPT_ENTRY_STATUS.REJECTED,
                rejectionReason: safeStr(reason) || '用户拒绝采纳'
            });
        });
        return Object.freeze({
            ...receipt,
            entries: Object.freeze(nextEntries)
        });
    }

    /**
     * 编辑改写回执项
     */
    function editReceiptItem(receipt, itemId, newContent) {
        if (!receipt || !Array.isArray(receipt.entries)) return receipt;
        const targetId = safeStr(itemId);
        const cleaned = safeStr(newContent);
        if (!cleaned) return receipt;

        const nextEntries = receipt.entries.map(e => {
            if (e.id !== targetId) return e;
            return Object.freeze({
                ...e,
                content: cleaned,
                status: RECEIPT_ENTRY_STATUS.EDITED
            });
        });
        return Object.freeze({
            ...receipt,
            entries: Object.freeze(nextEntries)
        });
    }

    /**
     * 提取允许沉淀到长期记忆与事实账本的条目
     * 契约：仅 ACCEPTED 与 EDITED 允许写入；REJECTED 绝对被过滤排除
     */
    function filterAdmittedFacts(receiptOrList) {
        if (!receiptOrList) return Object.freeze([]);
        const list = Array.isArray(receiptOrList) ? receiptOrList : [receiptOrList];
        const results = [];
        for (const receipt of list) {
            if (!receipt || !Array.isArray(receipt.entries) || receipt.floorRolledBack) continue;
            for (const e of receipt.entries) {
                if (e.status === RECEIPT_ENTRY_STATUS.ACCEPTED || e.status === RECEIPT_ENTRY_STATUS.EDITED) {
                    results.push(e);
                }
            }
        }
        return Object.freeze(results);
    }

    /**
     * 楼层回滚联动
     */
    function rollbackFloorReceipts(receiptList = [], rollbackFloor) {
        const list = Array.isArray(receiptList) ? receiptList : [];
        const floor = safeNum(rollbackFloor, null);
        if (floor === null) return list;

        return Object.freeze(list.map(rc => {
            if (rc.floor !== null && rc.floor >= floor) {
                return Object.freeze({
                    ...rc,
                    floorRolledBack: true,
                    entries: Object.freeze(rc.entries.map(e => Object.freeze({ ...e, status: RECEIPT_ENTRY_STATUS.ROLLED_BACK })))
                });
            }
            return rc;
        }));
    }

    /**
     * 自检函数
     */
    function generationFactReceiptSelfCheck() {
        const problems = [];
        if (Object.keys(RECEIPT_ENTRY_KINDS).length !== 3) problems.push('RECEIPT_ENTRY_KINDS 必须为 3 类');
        if (Object.keys(RECEIPT_ENTRY_STATUS).length !== 5) problems.push('RECEIPT_ENTRY_STATUS 必须为 5 态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        RECEIPT_ENTRY_KINDS,
        RECEIPT_ENTRY_STATUS,
        normalizeReceiptEntry,
        buildGenerationReceipt,
        acceptReceiptItem,
        rejectReceiptItem,
        editReceiptItem,
        filterAdmittedFacts,
        rollbackFloorReceipts,
        generationFactReceiptSelfCheck
    });

    root.LonShaGenerationFactReceipt = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);