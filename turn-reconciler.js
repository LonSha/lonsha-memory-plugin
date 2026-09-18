/**
 * turn-reconciler.js — [v3.105 缝合] 历史轮次对账引擎（位置无关身份 + 多级匹配认领）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）domain/history-reconciliation.js 的
 *         assignHistoryTurnIds / planHistoryReconciliation，按本插件工程规范重写为
 *         可测纯函数模块（零依赖、IIFE 双导出）。
 *
 * 【机制】本插件已有 msgFpOf（楼层消息指纹），能回答「这条消息还是原来那条吗」，
 *   但当一整批历史被编辑/删楼/翻 swipe/回填之后，需要回答的是另一个问题：
 *   「这批轮次里，哪些和库里已有的其实是同一轮（只是位置挪了），哪些是新的，
 *     哪些是库里已有但现在不再出现的（该失效）？」
 *
 *   本模块把该对账拆成两步纯函数：
 *     1) assignTurnIds —— 多级匹配（turnId → hostTurnKey → contentHash →
 *        logicalSlotKey → userKey）逐级降级；每条既有记录一旦被认领（claim）
 *        就不再被后续轮次复用（避免同文本轮次互相抢同一条既有记录）；
 *        同一用户文本重复出现时按 occurrence 序号参与派生 id，保证「第三次说同一句话」
 *        与前两次拿到不同 id；同时把 previousTurnId 串成链（位置无关身份）。
 *     2) diffTurnSets —— 期望集合与已激活集合比对，产出三类差异：
 *        admitted（新增）/ activated（原有但失活需复活）/ invalidated（原有但不再需要）。
 *
 * 【与源码差异】
 *   - 不再依赖 ledger/领域 ID 生成器，纯函数自包含
 *   - 匹配键可配置（matchKeys 顺序数组），匹配来源通过 matchBy 回报（可诊断「靠什么配上的」）
 *   - 增加 planReconciliation：合并两步并给出幂等键 + changed 标记
 */

(function (global) {
    'use strict';

    // ---------- 基础工具 ----------

    function stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'bigint') return JSON.stringify(String(value));
            const s = JSON.stringify(value);
            return s === undefined ? 'null' : s;
        }
        if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
        const keys = Object.keys(value).sort().filter(k => value[k] !== undefined);
        return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
    }

    function fnv1a(str) {
        let h = 0x811c9dc5;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    /** 文本归一：统一换行 + 折叠首尾空白（对账时 CRLF 差异不算内容变化） */
    function normalizeText(value) {
        return String(value ?? '').replace(/\r\n/g, '\n').trim();
    }

    function toIntOrNull(value) {
        if (value === null || value === undefined || value === '') return null;
        const n = Number(value);
        return Number.isFinite(n) ? Math.floor(n) : null;
    }

    // ---------- 1) 轮次归一 ----------

    /**
     * 归一化单个轮次。assistantText 为空 → null（无 AI 回复的轮次不参与记忆）。
     * @param {object} turn 原始轮次（支持 snake/camel 与 user/assistant 简写）
     * @param {number} index 原始序号（保留为 ordinal，仅供诊断排序）
     */
    function normalizeTurn(turn, index) {
        const t = turn || {};
        const assistantText = String(t.assistantText ?? t.assistant ?? '');
        if (!assistantText.trim()) return null;
        const userText = String(t.userText ?? t.user ?? '');
        return {
            turnId: String(t.turnId || '').trim(),
            hostTurnKey: String(t.hostTurnKey || '').trim(),
            logicalSlotKey: String(t.logicalSlotKey || '').trim(),
            userText,
            assistantText,
            normalizedUserText: normalizeText(t.normalizedUserText ?? userText),
            normalizedAssistantText: normalizeText(t.normalizedAssistantText ?? assistantText),
            userFloor: toIntOrNull(t.userFloor),
            assistantFloor: toIntOrNull(t.assistantFloor),
            assistantSwipeId: toIntOrNull(t.assistantSwipeId),
            generationId: String(t.generationId || '').trim(),
            speaker: String(t.speaker || '').trim(),
            historyFingerprint: String(t.historyFingerprint || '').trim(),
            ordinal: index,
        };
    }

    /* ---------- [v3.173] 接线：规范化序列化交给 canonical-stringify 模块 ----------
       本模块缝合后 68 个版本无人调用（v3.163 账本「已挂载但零消费」）。轮次身份
       全部建立在「同一内容 → 同一 hash」之上（contentHash 级匹配、turnId 派生），
       而本文件自带一份 stableStringify （自家实现）——同一语义两处实现，正是
       漂移的源。现改为**优先**取用 window.LonShaCanonical / require 结果，
       并把「取到了没、字节多长、丢了几个 undefined 字段」写进可选 carry。
       注意：两实现的输出在本函数的入参形状上逐字节一致（都是排序键、都是字符串值），
       故 hash 值不变——这不能用断言代替验证，测试里会做逐字节比对。 */
    function _canonicalLib() {
        let C = (global && global.LonShaCanonical) || null;
        if (!C && typeof require !== 'undefined') {
            try { C = require('./canonical-stringify.js'); } catch (e) { C = null; }
        }
        return (C && typeof C.canonicalStringify === 'function') ? C : null;
    }
    /** 轮次内容指纹（用于 contentHash 级匹配；位置无关）
     * @param {object} turn
     * @param {object} [carry] 可选末位参数：读数出口（I5/I6 同族）
     */
    function turnContentHash(turn, carry = null) {
        const t = normalizeTurn(turn, 0) || {};
        const body = {
            user: t.normalizedUserText || '',
            assistant: t.normalizedAssistantText || '',
        };
        const C = _canonicalLib();
        let text = null;
        const read = { source: 'local', canonicalFailed: false, bytes: 0, undefinedDropped: 0 };
        if (C) {
            const _c = {};
            try {
                text = C.canonicalStringify(body, _c);
                read.source = 'canonical';
                read.bytes = Number(_c.canonical && _c.canonical.bytes) || 0;
                read.undefinedDropped = Number(_c.canonical && _c.canonical.undefinedDropped) || 0;
            } catch (e) {
                text = null;
                read.canonicalFailed = true;   // 失败不是「读到了空」（I6）：独立状态位
            }
        }
        if (text === null) {
            text = stableStringify(body);
            if (!read.bytes) read.bytes = text.length;
        }
        if (carry && typeof carry === 'object') carry.turnHash = read;
        return fnv1a(text);
    }

    // ---------- 2) 多级匹配 + 认领 ----------

    /** 从既有记录中按 key 取值（兼容多种字段命名） */
    function valueOfKey(record, key) {
        const r = record || {};
        if (key === 'contentHash') return String(r.contentHash || '').trim();
        if (key === 'turnId') return String(r.turnId || '').trim();
        if (key === 'hostTurnKey') return String(r.hostTurnKey || (r.metadata && r.metadata.hostTurnKey) || '').trim();
        if (key === 'logicalSlotKey') return String(r.logicalSlotKey || (r.metadata && r.metadata.logicalSlotKey) || '').trim();
        if (key === 'userKey') return normalizeText(r.normalizedUserText ?? (r.content && r.content.normalizedUser) ?? '');
        return '';
    }

    /** 轮次按同一 key 取值（与 valueOfKey 对齐，便于比对） */
    function probeOfKey(turn, key) {
        const t = normalizeTurn(turn, 0);
        if (!t) return '';
        if (key === 'contentHash') return turnContentHash(t);
        if (key === 'turnId') return t.turnId;
        if (key === 'hostTurnKey') return t.hostTurnKey;
        if (key === 'logicalSlotKey') return t.logicalSlotKey;
        if (key === 'userKey') return t.normalizedUserText;
        return '';
    }

    const DEFAULT_MATCH_KEYS = ['turnId', 'hostTurnKey', 'contentHash', 'logicalSlotKey', 'userKey'];

    /**
     * 为一批历史轮次分配位置无关的稳定 id。
     *
     * @param {Array<object>} turns 待对账轮次（按剧情顺序）
     * @param {Array<object>} existing 库中既有轮次记录（每项至少含 id + 可匹配字段）
     * @param {object} [options]
     * @param {Array<string>} [options.matchKeys] 匹配优先级（默认 turnId→hostTurnKey→contentHash→logicalSlotKey→userKey）
     * @param {string} [options.idPrefix='turn'] 派生 id 前缀
     * @param {string} [options.chatId=''] 参与派生 id（跨会话隔离）
     * @returns {{ assigned:Array<object>, unmatched:number, claimedIds:string[], duplicateUsers:number }}
     *          assigned 每项：{...turn, turnId, matchedId, matchBy, occurrence}
     */
    function assignTurnIds(turns, existing, options, carry = null) {
        const opts = options || {};
        // [v3.173] 读数：多级匹配逐级降级本身是「有损」的——靠 contentHash/userKey
        //   配上的轮次，其身份会随文本微调而漂移。旧实现只报 unmatched 一个总数，
        //   「靠哪一级配上的」完全不可见（matchBy 只存在每条记录里，无人汇总）。
        const _read = { byMatchKey: {}, unmatched: 0, claimed: 0, duplicateUsers: 0, total: 0, assigned: 0 };
        if (carry && typeof carry === 'object') carry.turnMatch = _read;
        const keys = (Array.isArray(opts.matchKeys) && opts.matchKeys.length ? opts.matchKeys : DEFAULT_MATCH_KEYS)
            .filter(k => DEFAULT_MATCH_KEYS.includes(k));
        const pool = (Array.isArray(existing) ? existing : []).filter(r => r && String(r.id || '').trim());
        const claimed = new Set();
        const userOccurrences = new Map();
        const assigned = [];
        let unmatched = 0;
        let duplicateUsers = 0;
        let previousTurnId = 'root';

        const list = Array.isArray(turns) ? turns : [];
        for (let i = 0; i < list.length; i++) {
            const t = normalizeTurn(list[i], i);
            if (!t) continue;

            let matched = null;
            let matchBy = '';
            for (const key of keys) {
                const probe = probeOfKey(t, key);
                if (!probe) continue;
                const hit = pool.find(r => !claimed.has(String(r.id)) && valueOfKey(r, key) === probe);
                if (hit) { matched = hit; matchBy = key; break; }
            }

            const userKey = t.normalizedUserText;
            const occurrence = (userOccurrences.get(userKey) || 0) + 1;
            userOccurrences.set(userKey, occurrence);
            if (occurrence > 1) duplicateUsers++;

            let turnId = t.turnId || (matched ? String(matched.turnId || '').trim() : '');
            if (!turnId) {
                const prefix = String(opts.idPrefix || 'turn');
                turnId = prefix + '_' + fnv1a(stableStringify({
                    chat: String(opts.chatId || ''),
                    hostTurnKey: t.hostTurnKey,
                    logicalSlotKey: t.logicalSlotKey,
                    previousTurnId,
                    user: userKey,
                    speaker: t.speaker,
                    occurrence,
                }));
            }
            if (matched) claimed.add(String(matched.id)); else unmatched++;
            previousTurnId = turnId;
            assigned.push(Object.assign({}, t, {
                turnId,
                matchedId: matched ? String(matched.id) : '',
                matchBy: matchBy || (matched ? 'turnId' : ''),
                occurrence,
                contentHash: turnContentHash(t),
            }));
        }
        _read.total = list.length;
        _read.assigned = assigned.length;
        _read.unmatched = unmatched;
        _read.claimed = claimed.size;
        _read.duplicateUsers = duplicateUsers;
        for (const a of assigned) {
            const k = a.matchBy || '(new)';
            _read.byMatchKey[k] = (_read.byMatchKey[k] || 0) + 1;
        }
        return {
            assigned,
            unmatched,
            claimedIds: [...claimed],
            duplicateUsers,
            read: _read,
        };
    }

    // ---------- 3) 集合差异 ----------

    /**
     * 期望集合 vs 已激活集合。
     * @param {Array<string>} desiredIds
     * @param {Array<string>} activeIds
     * @returns {{ admitted:string[], activated:string[], invalidated:string[], unchanged:string[], changed:boolean }}
     */
    function diffTurnSets(desiredIds, activeIds) {
        const desired = new Set((desiredIds || []).map(String));
        const active = new Set((activeIds || []).map(String));
        const admitted = [];
        const unchanged = [];
        for (const id of desired) {
            if (active.has(id)) unchanged.push(id); else admitted.push(id);
        }
        const activated = [];
        const invalidated = [];
        for (const id of active) {
            if (desired.has(id)) {
                // 已在 unchanged 中
            } else {
                invalidated.push(id);
            }
        }
        return {
            admitted,
            activated,
            invalidated,
            unchanged,
            changed: admitted.length > 0 || activated.length > 0 || invalidated.length > 0,
        };
    }

    // ---------- 4) 组合规划 ----------

    /**
     * 对账规划：分配 id → 计算差异 → 组织为一次「变更记录列表」（纯描述，不落库）。
     *
     * @param {object} input
     * @param {Array<object>} input.turns 当前历史轮次
     * @param {Array<object>} input.existing 库中既有轮次记录
     * @param {Array<string>} [input.activeIds] 其中仍处于激活态的 id；不给则视为全部激活
     * @param {string} [input.chatId]
     * @param {string} [input.reason='history-reconciled']
     * @param {boolean} [input.softInvalidate=true] true=失效只标记（可复活），false=移出
     * @returns {{ records:Array<object>, diff:object, assigned:Array<object>,
     *             fingerprint:string, mutationId:string, changed:boolean, summary:string }}
     */
    function planReconciliation(input, carry = null) {
        const o = input || {};
        const assigned = assignTurnIds(o.turns, o.existing, { chatId: o.chatId }, carry);
        const desiredIds = assigned.assigned.map(t => t.turnId);
        const existingList = Array.isArray(o.existing) ? o.existing : [];
        const activeIds = Array.isArray(o.activeIds)
            ? o.activeIds.map(String)
            : existingList.map(r => String(r.id || '')).filter(Boolean);

        // 已在库（按 matchedId 认领）的轮次 → 用既有记录 id 参与集合差异；
        // 未认领（新轮次）的用派生 turnId 参与。
        // 注意三分：认领且在激活集 = 不变；认领但已失活 = 复活；未认领 = 新增。
        const claimedIds = new Set(assigned.claimedIds);
        const newTurnIds = assigned.assigned.filter(t => !t.matchedId).map(t => t.turnId);
        const claimedActive = [...claimedIds].filter(id => activeIds.includes(id));
        const claimedInactive = [...claimedIds].filter(id => !activeIds.includes(id));
        const invalidatedIds = activeIds.filter(id => !claimedIds.has(id));
        // 期望集合 = 认领的既有记录 + 新轮次派生 id（供指纹/幂等使用）
        const desiredRecordIds = [...claimedIds, ...newTurnIds];
        const diff = {
            admitted: newTurnIds,
            activated: claimedInactive,
            invalidated: invalidatedIds,
            unchanged: claimedActive,
            changed: newTurnIds.length > 0 || claimedInactive.length > 0 || invalidatedIds.length > 0,
        };

        const reason = String(o.reason || 'history-reconciled');
        const fingerprint = fnv1a(stableStringify({ ids: desiredRecordIds }));
        const mutationId = String(o.mutationId || ('hist_' + fnv1a(stableStringify({
            chat: String(o.chatId || ''), fingerprint, reason,
        }))));

        const records = [];
        for (const t of assigned.assigned) {
            if (t.matchedId) {
                if (!activeIds.includes(t.matchedId)) records.push({ op: 'activate', id: t.matchedId, turnId: t.turnId, matchBy: t.matchBy });
                continue;
            }
            records.push({ op: 'admit', turnId: t.turnId, matchBy: t.matchBy, occurrence: t.occurrence, contentHash: t.contentHash });
        }
        const soft = o.softInvalidate !== false;
        for (const id of diff.invalidated) {
            records.push({ op: soft ? 'invalidate' : 'drop', id, reason, mutationId, sourceFingerprint: fingerprint });
        }

        const changed = records.length > 0;
        const summary = [
            `轮次对账（${reason}）`,
            `  当前轮次: ${assigned.assigned.length}（新 ${assigned.unmatched} / 认领 ${assigned.claimedIds.length}）`,
            `  差异: 新增 ${diff.admitted.length} / 复活 ${diff.activated.length} / 失效 ${diff.invalidated.length} / 不变 ${diff.unchanged.length}`,
            assigned.duplicateUsers ? `  重复用户文本轮次: ${assigned.duplicateUsers}` : '',
            `  指纹: ${fingerprint}`,
        ].filter(Boolean).join('\n');

        return {
            records,
            diff,
            assigned: assigned.assigned,
            fingerprint,
            mutationId,
            changed,
            summary,
        };
    }

    const api = {
        normalizeTurn,
        normalizeText,
        turnContentHash,
        canonicalLib: _canonicalLib,
        stableStringify,
        assignTurnIds,
        diffTurnSets,
        planReconciliation,
        valueOfKey,
        probeOfKey,
        stableStringify,
        fnv1a,
        DEFAULT_MATCH_KEYS,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaTurnReconciler = api;
})(typeof window !== 'undefined' ? window : globalThis);