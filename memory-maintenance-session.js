/* ========================================================
 * memory-maintenance-session.js — [M7-O7 · 第七期规划] 记忆维护会话内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   长期项目中积累了大量待办、冲突与潜在过期条目。
 *   传统清理仪表盘一次性展示数百条待办，给用户带来巨大心理压力与倦怠感，
 *   且容易将“延期处理”等同于“已解决”，或者合并错误后无法撤销拆分。
 *   记忆维护会话提供有限、可恢复的轻量整理工作流：
 *     ① 有限队列机制(finiteQueue)：按影响范围、近期使用频度与过期天数进行综合加权排序，
 *        单次会话仅呈现有限批次（默认 3~5 项）；
 *     ② 多源对比与处置动作：支持来源比对、合并(merge)、拆分(split)、延期(defer)与标记解决(resolve)；
 *     ③ 延期与解决严格分形：延期项状态标为 deferred，绝对不计入 resolved，并记录下次建议复审日期；
 *     ④ 错误合并可逆拆分(unmerge)：记录完整的合并源与引用拓扑，支持精准拆分并还原原始条目；
 *     ⑤ 会话中断点保存与可撤销摘要(revertablePatchSummary)：用户可随时退出会话并在下次接回原位置。
 * ======================================================== */

(function (root) {
    'use strict';

    /** 待整理项分类 */
    const MAINTENANCE_ITEM_KINDS = Object.freeze({
        FACT_CONFLICT: 'fact_conflict',         // 事实冲突（如同一事件两处记载矛盾）
        EXPIRED_PROPOSAL: 'expired_proposal',   // 过期承诺/未兑现提议
        UNRESOLVED_RESEARCH: 'unresolved_research' // 未决研究线索/悬空证据
    });

    /** 整理处置状态 */
    const RESOLUTION_STATUS = Object.freeze({
        PENDING: 'pending',     // 待处理
        RESOLVED: 'resolved',   // 已解决（采纳有效结论）
        DEFERRED: 'deferred',   // 已延期（稍后处理，绝非已解决）
        MERGED: 'merged',       // 已合并
        SPLIT: 'split'          // 已拆分
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string') ? val.trim() : fallback;
    }

    function safeNum(val, fallback = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    function clone(val) {
        return JSON.parse(JSON.stringify(val));
    }

    /**
     * 计算优先级权重分数（分高优先进入有限队列）
     */
    function computeMaintenanceScore(item) {
        let score = 0;
        // 影响范围 (0~10)
        score += Math.min(10, Math.max(1, safeNum(item.impactScope, 1))) * 10;
        // 近期使用频度 (0~10)
        score += Math.min(10, Math.max(0, safeNum(item.recentUseCount, 0))) * 5;
        // 悬挂天数 (天数越多越优先处理)
        const ageDays = Math.max(0, Math.floor((Date.now() - safeNum(item.createdAt, Date.now())) / 86400000));
        score += Math.min(30, ageDays * 2);
        return score;
    }

    /**
     * 规范化单条维护项
     */
    function normalizeMaintenanceItem(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const id = safeStr(raw.id, `maint_${Date.now().toString(36)}_${idx}`);
        const title = safeStr(raw.title || raw.summary, '未命名维护项');
        const kindValues = Object.values(MAINTENANCE_ITEM_KINDS);
        const kind = kindValues.includes(raw.kind) ? raw.kind : MAINTENANCE_ITEM_KINDS.FACT_CONFLICT;

        const statusValues = Object.values(RESOLUTION_STATUS);
        const status = statusValues.includes(raw.status) ? raw.status : RESOLUTION_STATUS.PENDING;

        const sources = Array.isArray(raw.sources)
            ? raw.sources.map(s => ({
                sourceId: safeStr(s.sourceId || s.id),
                quote: safeStr(s.quote || s.content),
                floor: safeNum(s.floor, null)
            })).filter(s => s.sourceId || s.quote)
            : [];

        return Object.freeze({
            id,
            title,
            kind,
            status,
            sources: Object.freeze(sources),
            impactScope: safeNum(raw.impactScope, 3),
            recentUseCount: safeNum(raw.recentUseCount, 1),
            createdAt: safeNum(raw.createdAt, Date.now()),
            resolutionNote: safeStr(raw.resolutionNote, ''),
            nextReviewAt: safeNum(raw.nextReviewAt, 0),
            mergedFromIds: Array.isArray(raw.mergedFromIds) ? Object.freeze(raw.mergedFromIds.map(safeStr)) : Object.freeze([])
        });
    }

    /**
     * 构建有限维护会话
     * @param {Array} allCandidates 全部候选待整理项
     * @param {Object} opts 选项
     * @param {number} opts.batchSize 有限队列大小（默认 3 项）
     * @param {string} opts.sessionId 会话ID
     */
    function createMaintenanceSession(allCandidates = [], opts = {}) {
        const rawList = Array.isArray(allCandidates) ? allCandidates : [];
        const normalized = rawList.map((it, idx) => normalizeMaintenanceItem(it, idx)).filter(Boolean);

        // 仅筛选未解决且未延期（或到了延期复审时间）的项
        const now = Date.now();
        const pendingItems = normalized.filter(it => {
            if (it.status === RESOLUTION_STATUS.RESOLVED || it.status === RESOLUTION_STATUS.MERGED) return false;
            if (it.status === RESOLUTION_STATUS.DEFERRED && it.nextReviewAt > now) return false;
            return true;
        });

        // 按优先级降序排序
        pendingItems.sort((a, b) => computeMaintenanceScore(b) - computeMaintenanceScore(a));

        const batchSize = Math.max(1, Math.min(10, safeNum(opts.batchSize, 3)));
        const activeQueue = pendingItems.slice(0, batchSize);
        const remainingQueue = pendingItems.slice(batchSize);

        return Object.freeze({
            sessionId: safeStr(opts.sessionId, `sess_${Date.now().toString(36)}`),
            activeQueue: Object.freeze(activeQueue),
            remainingCount: remainingQueue.length,
            historyPatches: Object.freeze([]), // 记录本轮操作用于可撤销摘要
            createdAt: now,
            updatedAt: now
        });
    }

    /**
     * 解决某维护项（采纳有效结论）
     */
    function resolveItem(session, itemId, resolutionNote) {
        if (!session || !Array.isArray(session.activeQueue)) return session;
        const targetId = safeStr(itemId);
        const note = safeStr(resolutionNote, '用户确立结论解决冲突');

        const patch = { action: 'resolve', targetId, note, timestamp: Date.now() };
        const nextQueue = session.activeQueue.map(it => {
            if (it.id !== targetId) return it;
            return Object.freeze({
                ...it,
                status: RESOLUTION_STATUS.RESOLVED,
                resolutionNote: note
            });
        });

        return Object.freeze({
            ...session,
            activeQueue: Object.freeze(nextQueue),
            historyPatches: Object.freeze([...session.historyPatches, patch]),
            updatedAt: Date.now()
        });
    }

    /**
     * 延期某维护项（暂缓处理，记录下次复审日期）
     * 契约：绝不计入 resolved！
     */
    function deferItem(session, itemId, deferDays = 3, reason = '') {
        if (!session || !Array.isArray(session.activeQueue)) return session;
        const targetId = safeStr(itemId);
        const days = Math.max(1, safeNum(deferDays, 3));
        const nextReviewAt = Date.now() + days * 86400000;
        const note = safeStr(reason, `用户主动延期 ${days} 天复核`);

        const patch = { action: 'defer', targetId, deferDays: days, note, timestamp: Date.now() };
        const nextQueue = session.activeQueue.map(it => {
            if (it.id !== targetId) return it;
            return Object.freeze({
                ...it,
                status: RESOLUTION_STATUS.DEFERRED,
                nextReviewAt,
                resolutionNote: note
            });
        });

        return Object.freeze({
            ...session,
            activeQueue: Object.freeze(nextQueue),
            historyPatches: Object.freeze([...session.historyPatches, patch]),
            updatedAt: Date.now()
        });
    }

    /**
     * 合并两个冲突或互补的维护项
     */
    function mergeItems(session, sourceIdA, sourceIdB, mergedTitle, mergedNote = '') {
        if (!session || !Array.isArray(session.activeQueue)) return session;
        const idA = safeStr(sourceIdA);
        const idB = safeStr(sourceIdB);
        const itemA = session.activeQueue.find(it => it.id === idA);
        const itemB = session.activeQueue.find(it => it.id === idB);
        if (!itemA || !itemB) return session;

        const mergedSources = [...itemA.sources, ...itemB.sources];
        const mergedItem = Object.freeze({
            id: `merged_${idA}_${idB}`,
            title: safeStr(mergedTitle, `${itemA.title} & ${itemB.title}`),
            kind: itemA.kind,
            status: RESOLUTION_STATUS.MERGED,
            sources: Object.freeze(mergedSources),
            impactScope: Math.max(itemA.impactScope, itemB.impactScope),
            recentUseCount: itemA.recentUseCount + itemB.recentUseCount,
            createdAt: Math.min(itemA.createdAt, itemB.createdAt),
            resolutionNote: safeStr(mergedNote, '合并两条互补记忆项'),
            nextReviewAt: 0,
            mergedFromIds: Object.freeze([idA, idB])
        });

        const patch = {
            action: 'merge',
            mergedId: mergedItem.id,
            originalItems: [itemA, itemB],
            timestamp: Date.now()
        };

        const nextQueue = [
            ...session.activeQueue.filter(it => it.id !== idA && it.id !== idB),
            mergedItem
        ];

        return Object.freeze({
            ...session,
            activeQueue: Object.freeze(nextQueue),
            historyPatches: Object.freeze([...session.historyPatches, patch]),
            updatedAt: Date.now()
        });
    }

    /**
     * 拆分/还原已合并项（unmerge 错误合并恢复）
     */
    function unmergeItem(session, mergedItemId) {
        if (!session || !Array.isArray(session.activeQueue)) return session;
        const targetId = safeStr(mergedItemId);
        const lastMergePatch = [...session.historyPatches].reverse().find(p => p.action === 'merge' && p.mergedId === targetId);
        if (!lastMergePatch || !Array.isArray(lastMergePatch.originalItems)) {
            return session;
        }

        const restoredItems = lastMergePatch.originalItems.map(it => Object.freeze({
            ...it,
            status: RESOLUTION_STATUS.PENDING
        }));

        const nextQueue = [
            ...session.activeQueue.filter(it => it.id !== targetId),
            ...restoredItems
        ];

        const patch = { action: 'unmerge', unmergedId: targetId, timestamp: Date.now() };

        return Object.freeze({
            ...session,
            activeQueue: Object.freeze(nextQueue),
            historyPatches: Object.freeze([...session.historyPatches, patch]),
            updatedAt: Date.now()
        });
    }

    /**
     * 生成可撤销的本轮变更摘要
     */
    function generateRevertableSummary(session) {
        if (!session) return { totalPatches: 0, resolvedCount: 0, deferredCount: 0, patches: [] };
        const patches = session.historyPatches || [];
        const resolvedCount = patches.filter(p => p.action === 'resolve').length;
        const deferredCount = patches.filter(p => p.action === 'defer').length;
        const mergedCount = patches.filter(p => p.action === 'merge').length;

        return Object.freeze({
            sessionId: session.sessionId,
            totalPatches: patches.length,
            resolvedCount,
            deferredCount,
            mergedCount,
            patches: Object.freeze([...patches])
        });
    }

    /**
     * 模块自检函数
     */
    function memoryMaintenanceSessionSelfCheck() {
        const problems = [];
        if (Object.keys(MAINTENANCE_ITEM_KINDS).length !== 3) {
            problems.push('MAINTENANCE_ITEM_KINDS 必须恰好为 3 类');
        }
        if (Object.keys(RESOLUTION_STATUS).length !== 5) {
            problems.push('RESOLUTION_STATUS 必须恰好为 5 态');
        }

        // 测试有限队列与排序
        const items = [
            { id: 'i1', title: '小冲突', kind: 'fact_conflict', impactScope: 1, recentUseCount: 1 },
            { id: 'i2', title: '核心设定矛盾', kind: 'fact_conflict', impactScope: 10, recentUseCount: 8 },
            { id: 'i3', title: '过期承诺', kind: 'expired_proposal', impactScope: 5, recentUseCount: 2 },
            { id: 'i4', title: '未决线索', kind: 'unresolved_research', impactScope: 3, recentUseCount: 1 }
        ];

        let sess = createMaintenanceSession(items, { batchSize: 3 });
        if (sess.activeQueue.length !== 3) {
            problems.push(`有限队列应恰好截取 3 项，实得 ${sess.activeQueue.length}`);
        }
        if (sess.activeQueue[0].id !== 'i2') {
            problems.push('权重最高的核心设定矛盾项必须排在第一位');
        }

        // 解决与延期测试
        sess = resolveItem(sess, 'i2', '已确立以第二卷设定为准');
        sess = deferItem(sess, 'i3', 7, '剧情尚未推进到该节点，延期');

        const resolvedItem = sess.activeQueue.find(x => x.id === 'i2');
        const deferredItem = sess.activeQueue.find(x => x.id === 'i3');
        if (resolvedItem?.status !== RESOLUTION_STATUS.RESOLVED) {
            problems.push('resolveItem 后状态应为 resolved');
        }
        if (deferredItem?.status !== RESOLUTION_STATUS.DEFERRED) {
            problems.push('deferItem 后状态应为 deferred，绝非 resolved');
        }

        // 合并与拆分测试
        sess = mergeItems(sess, 'i2', 'i3', '合成果');
        const merged = sess.activeQueue.find(x => x.id === 'merged_i2_i3');
        if (!merged) {
            problems.push('mergeItems 后未找到合并条目');
        }

        sess = unmergeItem(sess, 'merged_i2_i3');
        if (sess.activeQueue.some(x => x.id === 'merged_i2_i3')) {
            problems.push('unmergeItem 后合并条目应被移除并恢复原条目');
        }

        const summary = generateRevertableSummary(sess);
        if (summary.totalPatches !== 4) {
            problems.push(`历史补丁数应为 4，实得 ${summary.totalPatches}`);
        }

        return { problems };
    }

    const api = Object.freeze({
        MAINTENANCE_ITEM_KINDS,
        RESOLUTION_STATUS,
        normalizeMaintenanceItem,
        createMaintenanceSession,
        resolveItem,
        deferItem,
        mergeItems,
        unmergeItem,
        generateRevertableSummary,
        memoryMaintenanceSessionSelfCheck
    });

    root.LonShaMemoryMaintenanceSession = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);