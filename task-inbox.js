/**
 * task-inbox.js — [v3.107 缝合] 任务收件箱状态机（幂等准入 + 合法迁移 + 延迟可见）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）domain/memory-inbox.js 与
 *         domain/memory-contract.js 的 ALLOWED_TRANSITIONS，按本插件工程规范
 *         重写为可测纯函数模块（零依赖、IIFE 双导出、时间可注入 → 单测零等待）。
 *
 * 【机制】本插件既有 enqueueRetry/processRetryQueue（v3.70）是一个「按 kind+tier 去重、
 *   指数退避、超 3 次丢弃」的固定队列，它没有的东西恰好是长期调度最容易出问题的三处：
 *     ① 没有显式状态：一个 job 是「排队中 / 已被本轮消费 / 已完成 / 已推迟 / 已放弃」
 *        全靠数组增删表达，出问题时无法判断它到底卡在哪个阶段；
 *     ② 没有合法迁移约束：pending 可以直接跳到 completed（跳过 claim），
 *        被取消的任务还能被重新 claim —— 这类越权迁移在并发/多窗口下会静默产生重复处理；
 *     ③ 没有延迟可见（availableAt）与声明式去重键（dedupeKey）：
 *        退避只是「下轮 find 时跳过」，而不是「此刻不可见」。
 *   本模块把这三件事做成一个纯函数状态机：
 *     - 五态：pending / claimed / completed / deferred / cancelled，含显式迁移表
 *     - admitItem：按 dedupeKey 幂等准入（同键重复准入 → replayed=true，不新增条目）
 *     - planTransition：校验「条目存在 / 状态未变 / 修订未变 / 迁移合法 / 已到可见时间」
 *       五重前置条件，任一不符即抛错（拒绝越权迁移，而非静默改状态）
 *     - planBatchTransition：批量原子——任一失败则整批不生效
 *     - listRunnable：只暴露「pending 且 availableAt <= now」的条目
 *     - summarizeInbox：各状态计数 + 最旧待办等待时长（诊断「任务积压多久」）
 *
 * 【与源码差异】
 *   - 源码把状态变更绑在 ledger 事务上（appendMemoryLedgerTransaction）；
 *     本实现为纯函数（输入条目数组 → 输出新数组），落库交给调用方，
 *     与插件既有的 chatMetadata 持久化路径解耦，可单测、可重放。
 *   - 源码用 materializeInboxState 求 latestByInboxId；本实现要求传入「最新修订列表」
 *     （每个 itemId 一条），另提供 latestByItemId 供保留历史版本时取最新。
 *   - 增加 revision / expectedRevision 校验（源码只有 id 与 status 校验）。
 *   - 增加 summarizeInbox（源码无）；dedupeKey 强制非空（源码由调用方兜底生成，
 *     易出现「静默无去重」）。
 */

(function (global) {
    'use strict';

    const INBOX_STATUS = Object.freeze({
        PENDING: 'pending',
        CLAIMED: 'claimed',
        COMPLETED: 'completed',
        DEFERRED: 'deferred',
        CANCELLED: 'cancelled',
    });

    // 合法迁移表（与源码 ALLOWED_TRANSITIONS 语义一致）
    const ALLOWED_TRANSITIONS = Object.freeze({
        pending: Object.freeze(['claimed', 'deferred', 'cancelled']),
        deferred: Object.freeze(['claimed', 'pending', 'cancelled']),
        claimed: Object.freeze(['completed', 'deferred', 'cancelled']),
        completed: Object.freeze([]),
        cancelled: Object.freeze([]),
    });

    function isStatus(v) {
        return Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, String(v || ''));
    }

    function canTransition(from, to) {
        if (!isStatus(from) || !isStatus(to)) return false;
        return ALLOWED_TRANSITIONS[from].includes(to);
    }

    function normTime(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
    }

    function normStr(v) {
        return String(v == null ? '' : v).trim();
    }

    /**
     * 归一化一个收件箱条目。
     * @param {object} raw
     * @returns {object} 规整后的条目（不可变使用：调用方不应就地改）
     */
    function createInboxItem(raw) {
        const s = raw || {};
        const itemId = normStr(s.itemId || s.id);
        if (!itemId) throw new TypeError('inbox item requires itemId');
        const kind = normStr(s.kind);
        if (!kind) throw new TypeError('inbox item requires kind: ' + itemId);
        const dedupeKey = normStr(s.dedupeKey);
        if (!dedupeKey) throw new TypeError('inbox item requires dedupeKey: ' + itemId);
        const status = normStr(s.status) || INBOX_STATUS.PENDING;
        if (!isStatus(status)) throw new TypeError('invalid inbox status: ' + status);
        const now = normTime(s.createdAt, Date.now());
        const seqRaw = Number(s.sequence);
        return {
            itemId,
            kind,
            dedupeKey,
            status,
            revision: Math.max(0, Number.isFinite(Number(s.revision)) ? Math.floor(Number(s.revision)) : 0),
            sequence: Number.isFinite(seqRaw) && seqRaw >= 0 ? Math.floor(seqRaw) : 0,
            attempt: Math.max(0, Number.isFinite(Number(s.attempt)) ? Math.floor(Number(s.attempt)) : 0),
            previousItemId: normStr(s.previousItemId),
            claimId: normStr(s.claimId),
            claimOwner: normStr(s.claimOwner),
            availableAt: normTime(s.availableAt, now),
            payload: s.payload && typeof s.payload === 'object' ? s.payload : {},
            note: normStr(s.note),
            createdAt: now,
            updatedAt: normTime(s.updatedAt, now),
        };
    }

    function findByDedupeKey(items, dedupeKey) {
        const key = normStr(dedupeKey);
        if (!key) return null;
        for (const it of items || []) {
            if (it && normStr(it.dedupeKey) === key) return it;
        }
        return null;
    }

    function findByItemId(items, itemId) {
        const id = normStr(itemId);
        if (!id) return null;
        for (const it of items || []) {
            if (it && normStr(it.itemId) === id) return it;
        }
        return null;
    }

    /** 从「保留历史版本」的多条记录里取每个 itemId 的最新修订 */
    function latestByItemId(items) {
        const map = new Map();
        for (const it of items || []) {
            if (!it) continue;
            const prev = map.get(it.itemId);
            if (!prev || Number(it.revision) >= Number(prev.revision)) map.set(it.itemId, it);
        }
        return map;
    }

    /**
     * 幂等准入：同 dedupeKey 已存在 → 复用（replayed），不新增条目。
     * @param {Array} items 现有条目
     * @param {object} input { item, dedupeKey, now }
     * @returns {{ items:Array, item:object, admitted:boolean, replayed:boolean }}
     */
    function admitItem(items, input) {
        const list = Array.isArray(items) ? items.slice() : [];
        const s = input || {};
        const dedupeKey = normStr(s.dedupeKey) || normStr(s.item && s.item.dedupeKey);
        if (!dedupeKey) throw new TypeError('admitItem requires dedupeKey');
        const now = normTime(s.now, Date.now());
        const existing = findByDedupeKey(list, dedupeKey);
        if (existing) {
            return { items: list, item: existing, admitted: false, replayed: true };
        }
        const item = createInboxItem(Object.assign({}, s.item || {}, {
            dedupeKey,
            status: INBOX_STATUS.PENDING,
            sequence: 0,
            revision: 0,
            attempt: 0,
            createdAt: now,
            updatedAt: now,
            availableAt: normTime((s.item && s.item.availableAt) != null ? s.item.availableAt : s.availableAt, now),
        }));
        list.push(item);
        return { items: list, item, admitted: true, replayed: false };
    }

    /**
     * 规划一次状态迁移（只算不落）：五重校验，任一不符抛错。
     * @returns {{ current:object, next:object, index:number }}
     */
    function planTransition(items, input) {
        const list = Array.isArray(items) ? items : [];
        const s = input || {};
        const itemId = normStr(s.itemId || s.id);
        if (!itemId) throw new TypeError('planTransition requires itemId');
        const index = list.findIndex(it => it && normStr(it.itemId) === itemId);
        if (index < 0) throw new Error('inbox item not found: ' + itemId);
        const current = list[index];

        const expectedStatus = normStr(s.expectedStatus);
        if (expectedStatus && current.status !== expectedStatus) {
            throw new Error('inbox status changed: ' + current.status);
        }
        const expectedRevision = s.expectedRevision;
        if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== Number(current.revision)) {
            throw new Error('inbox revision changed: ' + itemId);
        }
        const target = normStr(s.status);
        if (!canTransition(current.status, target)) {
            throw new Error('invalid inbox transition: ' + current.status + ' -> ' + target);
        }
        const now = normTime(s.now, Date.now());
        if (target === INBOX_STATUS.CLAIMED && Number(current.availableAt || 0) > now) {
            throw new Error('inbox item is not available: ' + itemId);
        }
        const patch = s.payloadPatch && typeof s.payloadPatch === 'object' ? s.payloadPatch : null;
        const next = createInboxItem(Object.assign({}, current, {
            itemId: current.itemId,
            kind: current.kind,
            dedupeKey: current.dedupeKey,
            status: target,
            revision: Number(current.revision) + 1,
            sequence: Number(current.sequence) + 1,
            previousItemId: current.itemId,
            attempt: target === INBOX_STATUS.CLAIMED ? Number(current.attempt || 0) + 1 : Number(current.attempt || 0),
            claimId: target === INBOX_STATUS.CLAIMED ? normStr(s.claimId) : (normStr(s.claimId) || current.claimId),
            claimOwner: target === INBOX_STATUS.CLAIMED ? normStr(s.claimOwner) : (normStr(s.claimOwner) || current.claimOwner),
            availableAt: target === INBOX_STATUS.DEFERRED
                ? normTime(s.availableAt, now)
                : current.availableAt,
            payload: patch ? Object.assign({}, current.payload, patch) : current.payload,
            note: s.note === undefined ? current.note : normStr(s.note),
            createdAt: current.createdAt,
            updatedAt: now,
        }));
        if (target === INBOX_STATUS.CLAIMED && !next.claimId) {
            throw new TypeError('claiming an inbox item requires claimId: ' + itemId);
        }
        return { current, next, index };
    }

    /** 应用迁移：返回新数组（原数组不被修改） */
    function applyTransition(items, input) {
        const planned = planTransition(items, input);
        const list = (Array.isArray(items) ? items : []).slice();
        list[planned.index] = planned.next;
        return { items: list, item: planned.next, current: planned.current };
    }

    /**
     * 批量原子迁移：先对全部条目校验，任一失败整批不生效（不产生半套新状态）。
     * @returns {{ items:Array, planned:Array }}
     */
    function planBatchTransition(items, input) {
        const s = input || {};
        const ids = [];
        for (const raw of (s.itemIds || [])) {
            const id = normStr(raw);
            if (id && !ids.includes(id)) ids.push(id);
        }
        if (!ids.length) throw new TypeError('inbox batch transition requires itemIds');
        const list = Array.isArray(items) ? items : [];
        let working = list.slice();
        const planned = [];
        ids.forEach((itemId) => {
            const out = applyTransition(working, {
                itemId,
                status: s.status,
                expectedStatus: s.expectedStatus,
                claimId: s.claimId,
                claimOwner: s.claimOwner,
                availableAt: s.availableAt,
                note: s.note,
                payloadPatch: s.payloadPatch,
                now: s.now,
            });
            working = out.items;
            planned.push(out.item);
        });
        return { items: working, planned };
    }

    /** 可执行条目：pending 且已到可见时间（可按 kind 过滤） */
    function listRunnable(items, options) {
        const o = options || {};
        const now = normTime(o.now, Date.now());
        const kind = normStr(o.kind);
        return (items || []).filter(it => it
            && it.status === INBOX_STATUS.PENDING
            && Number(it.availableAt || 0) <= now
            && (!kind || normStr(it.kind) === kind));
    }

    /**
     * 可领取条目：pending 已到点 + deferred 已到点的合并视图。
     * 语义说明（与源码一致）：deferred 不是「自动可执行」，它必须经一次显式 claim
     * （deferred→claimed，见迁移表）才会进入处理；本函数只回答「现在可以领取哪些」。
     */
    function listClaimable(items, options) {
        const o = options || {};
        const now = normTime(o.now, Date.now());
        const kind = normStr(o.kind);
        return (items || []).filter(it => it
            && (it.status === INBOX_STATUS.PENDING || it.status === INBOX_STATUS.DEFERRED)
            && Number(it.availableAt || 0) <= now
            && (!kind || normStr(it.kind) === kind));
    }

    /** 诊断摘要：各状态计数 + 最旧待办等待时长 + 推迟条目数 */
    function summarizeInbox(items, options) {
        const o = options || {};
        const now = normTime(o.now, Date.now());
        const counts = {};
        for (const k of Object.values(INBOX_STATUS)) counts[k] = 0;
        let oldest = null;
        const runnable = listRunnable(items, { now: now });
        for (const it of items || []) {
            if (!it) continue;
            if (counts[it.status] === undefined) counts[it.status] = 0;
            counts[it.status] += 1;
            if (it.status === INBOX_STATUS.PENDING) {
                if (oldest === null || Number(it.createdAt || 0) < Number(oldest.createdAt || 0)) oldest = it;
            }
        }
        return {
            total: (items || []).filter(Boolean).length,
            counts,
            runnable: runnable.length,
            waitingMs: oldest ? Math.max(0, now - Number(oldest.createdAt || 0)) : 0,
            oldestItemId: oldest ? oldest.itemId : null,
        };
    }

    const api = {
        INBOX_STATUS,
        ALLOWED_TRANSITIONS,
        isStatus,
        canTransition,
        createInboxItem,
        findByDedupeKey,
        findByItemId,
        latestByItemId,
        admitItem,
        planTransition,
        applyTransition,
        planBatchTransition,
        listRunnable,
        listClaimable,
        summarizeInbox,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaTaskInbox = api;
})(typeof window !== 'undefined' ? window : globalThis);