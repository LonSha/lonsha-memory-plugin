/**
 * cache-identity.js — 派生缓存身份（计划一 M-O4 的第二半）
 *
 * 【为什么需要这一层 / 修前实测】
 *   本插件在 v3.254.0 之前有三样**互相独立**的身份来源，全部真实存在、全部已被使用：
 *     · 会话身份   —— `getCurrentChatId()`（换对话即变）
 *     · 剧情代际   —— `_mutationEpoch`（v3.145 变更栅栏号：回滚 / 恢复 / 导入递增）
 *     · 历史指纹   —— `_historyFingerprint()`（v3.109：早于末楼的已落定楼层折叠）
 *   而缓存各自只认其中一两个：
 *     · `_recallCache`   认 floor + queryKey + 末楼消息指纹（**不含会话、不含代际、不含历史**）
 *     · `recall-artifact` 认 turnId + inputFingerprint + historyFingerprint（**不含会话与代际**）
 *     · `_fragCache`     认 src + maxChars（**不含上述任何一项**）
 *   后果（本仓最贵的那类：不报错、只错结果）：换对话后同楼层同查询可命中上一段会话的
 *   注入；回滚/恢复之后（`_mutationEpoch` 已递增）缓存依然被当作有效；上游楼被编辑
 *   导致历史变了，只有 recall-artifact 那条路能察觉。计划原文点名的正是这一条：
 *   「派生缓存身份包含会话、剧情代际和数据修订号，编辑、删楼、重生成、导入、恢复必须失效」。
 *
 * 【本模块的职责（纯函数、零依赖、不读全局）】
 *   把上面四件读数（会话 / 代际 / 修订号 / 历史指纹）**合并成一份可比较的身份**，
 *   并给出「为什么这一份已失效」的**具名原因**。它不持有缓存、不做失效动作 ——
 *   失效的处置（清空、丢弃、记账）留在各缓存自己的调用点，本模块只负责**判定**。
 *
 * 【口径纪律】
 *   ① **拿不到判据 ≠ 判为失效**：身份里必需位读不到时，`invalidate()` 返回
 *      `reason='no-current'` 且 `stale=false` —— 拿不到判据等于证伪不了，
 *      不得据此丢弃用户数据（与 v3.213 投影新鲜度守卫同一条纪律：取不到 chatId ⇒ 放行）。
 *   ② **缺席与空不同形**：`chatId: ''` 与 `chatId: null/undefined` 不同义 —— 前者是
 *      「宿主明确说是空会话」，后者是「没有这项读数」。
 *   ③ **原因必须具名**：只答「失效了」不足以定位（换会话？回滚？上游被编辑？），
 *      故 reason 是枚举而不是布尔；且原因先后**固定**（会话 → 代际 → 修订 → 历史），
 *      因为一次回滚会同时改变代际与历史指纹，按「发现顺序」报会让同一动作两次运行报不同理由。
 *
 * 【与既有模块的关系（不新建第二真源）】
 *   · 历史指纹的**算法**不在本模块：调用方传入 `_historyFingerprint()` 的结果；
 *   · 代际的**推进**不在本模块：仍由 `_bumpEpoch()` 一处负责；
 *   · 本模块只做「四元组 → 可比身份 + 具名差异」。
 *
 * 零依赖、CJS/IIFE 双导出（与全仓缝合模块同形）。
 */

(function (global) {
    'use strict';

    /** 身份的必需位（顺序即指纹拼装顺序，改动即改变 key 形态）。 */
    const IDENTITY_KEYS = ['chatId', 'epoch', 'revision', 'historyFingerprint'];

    /**
     * 计划原文点名的五种「必须失效」的变更，外加换会话。
     * 这是**对外词表**：诊断面按它说话，调用方不得自创同义字（否则读数无法机检）。
     */
    const INVALIDATION_CAUSES = ['switch', 'edit', 'delete', 'regen', 'import', 'restore'];

    /** 差异原因词表（`diff()` / `invalidate()` 的返回只会落在这些值里）。 */
    const REASONS = [
        'hit',                  // 身份一致
        'no-current',           // 当下身份读不出来（放行，不判失效）
        'no-id',                // 缓存项没有带身份（旧格式 / 未接线）
        'conversation-changed', // 会话变了
        'epoch-changed',        // 剧情代际变了（回滚 / 恢复 / 导入）
        'revision-changed',     // 数据修订号变了（乐观并发修订）
        'history-changed',      // 历史指纹变了（上游楼被编辑 / 删楼 / 重生成）
    ];

    function norm(v) {
        if (v === undefined || v === null) return '';
        return String(v);
    }

    /** 数值位：读不出有限数即记 null（不当成 0 —— 0 是「确实是第 0 代」）。 */
    function normNum(v) {
        if (v === undefined || v === null || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? Math.floor(n) : null;
    }

    /**
     * 归一化一份身份读数。
     * @param {{chatId:*, epoch:*, revision:*, historyFingerprint:*}} raw
     * @returns {{chatId:string, epoch:number|null, revision:number|null,
     *            historyFingerprint:string, complete:boolean, missing:string[]}}
     */
    function identityOf(raw) {
        const s = (raw && typeof raw === 'object') ? raw : {};
        const chatId = norm(s.chatId);
        const epoch = normNum(s.epoch);
        const revision = normNum(s.revision);
        const historyFingerprint = norm(s.historyFingerprint);
        const missing = [];
        if (!chatId) missing.push('chatId');
        if (epoch === null) missing.push('epoch');
        if (historyFingerprint === '') missing.push('historyFingerprint');
        /* revision 缺位**不算不完整**：它是「这一代里还没有过修订」这个真读数，
           故不进 missing，只在 key 里写成 '-' 与「确实是第 0 代」的 0 相区分。 */
        return {
            chatId,
            epoch,
            revision,
            historyFingerprint,
            complete: missing.length === 0,
            missing,
        };
    }

    /**
     * 身份的稳定键（可持久化、可比较、可入日志）。
     * 形态：`<chatId>|e<epoch>|r<revision|'-'>|<historyFingerprint>`
     *   · revision 缺位写成 `-`（**不是 0**）：0 是「修订号为 0」这个真读数。
     *   · chatId / 指纹里若含分隔符会与结构混淆 ⇒ 先转义（可逆，单反斜杠前缀）。
     */
    function identityKey(raw) {
        const id = identityOf(raw);
        const esc = (t) => String(t).replace(/\|/g, '\\|');
        return esc(id.chatId) + '|e' + (id.epoch === null ? '-' : id.epoch)
            + '|r' + (id.revision === null ? '-' : id.revision)
            + '|' + esc(id.historyFingerprint);
    }

    /**
     * 具名差异。
     * **不完整即不同一**：缺位的两侧（都缺同一位）不算「相等」—— 那是「都判不了」，
     * 由 `unjudgeable` 单独说清，避免把「读不到」冒充成「一致」。
     */
    function diffIdentity(prev, next) {
        const a = identityOf(prev), b = identityOf(next);
        const why = [];
        if (a.chatId !== b.chatId) why.push('conversation-changed');
        if (a.epoch !== b.epoch) why.push('epoch-changed');
        if (a.revision !== b.revision) why.push('revision-changed');
        if (a.historyFingerprint !== b.historyFingerprint) why.push('history-changed');
        const unjudgeable = !a.complete || !b.complete;
        return {
            same: !unjudgeable && why.length === 0,
            why,
            unjudgeable,
            from: identityKey(prev),
            to: identityKey(next),
        };
    }

    /**
     * 两份身份是否同一（`diffIdentity` 的布尔面）。
     */
    function sameIdentity(a, b) {
        return diffIdentity(a, b).same;
    }

    /**
     * 失效判定（各缓存调用点的唯一入口口径）。
     * @param {object} entry 缓存项携带的身份（`{}` 表示旧格式没带）
     * @param {object} current 当下身份
     * @param {{noIdIsStale?:boolean}} [opts]
     *   noIdIsStale 默认 false：没带身份**不等于**失效（旧格式是历史事实），
     *     由调用方决定是否收紧；收紧时 reason='no-id' 且 stale=true。
     * @returns {{stale:boolean, reason:string, why:string[], unjudgeable:boolean,
     *            from:string, to:string}}
     */
    function invalidate(entry, current, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const cur = identityOf(current);
        if (!cur.complete) {
            /* 拿不到当下判据 ⇒ 放行（证伪不了不等于失效）。原因具名，供诊断区分。 */
            return { stale: false, reason: 'no-current', why: [], unjudgeable: true, from: identityKey(entry), to: identityKey(current) };
        }
        const e = identityOf(entry);
        if (!e.complete && !e.chatId && e.epoch === null && e.historyFingerprint === '') {
            return {
                stale: o.noIdIsStale === true,
                reason: 'no-id',
                why: [],
                unjudgeable: false,
                from: identityKey(entry),
                to: identityKey(current),
            };
        }
        const d = diffIdentity(entry, current);
        if (d.same) return { stale: false, reason: 'hit', why: [], unjudgeable: false, from: d.from, to: d.to };
        /* 判据不全时**仍然判失效**（保守重算），但把「证据不足」这件事如实带出来：
           「证据充分判失效」与「证据不足只能保守重算」是两个不同的结论，读者有权区分。 */
        const first = d.why[0] || 'history-changed';
        return { stale: true, reason: first, why: d.why, unjudgeable: d.unjudgeable, from: d.from, to: d.to };
    }

    /**
     * 变更动作 → 失效原因（把「谁改了」翻译成计划原文点名的六词）。
     *
     * 【为什么同时收 `event` 与 `op`】修前实测：本模块首稿只认 `op`（`{op:'message_edited'}`），
     *   而 index.js 的事件接线点传的是**宿主事件名**（`event.eventType === 'CHAT_CHANGED'`
     *   一族）。若只收 `op`，接线后每个真实事件都落 'unknown' —— 不报错、只是把六词词表
     *   退化成一根「未知」的柱子。故两个键都认，且事件名大小写不敏感。
     * @param {{event?:string, op?:string, chatChanged?:boolean}} ctx
     * @returns {string} INVALIDATION_CAUSES 之一或 'unknown'
     */
    function causeOf(ctx) {
        const s = (ctx && typeof ctx === 'object') ? ctx : {};
        if (s.chatChanged === true) return 'switch';
        /* 事件名优先于 op：事件名是宿主给的**事实**，op 是调用点的自述。 */
        const raw = norm(s.event) || norm(s.op);
        const op = raw.toLowerCase().replace(/^_+/, '');
        if (!op) return 'unknown';
        if (op === 'chat_changed' || op === 'chatchanged' || op === 'switch' || op === 'chat-switched') return 'switch';
        if (op === 'edit' || op === 'edited' || op === 'message_edited' || op === 'messageeditted') return 'edit';
        if (op === 'delete' || op === 'deleted' || op === 'message_deleted') return 'delete';
        if (op === 'regen' || op === 'regenerate' || op === 'swipe' || op === 'swiped' || op === 'message_swiped') return 'regen';
        if (op.indexOf('restore') === 0 || op.indexOf('rollback') === 0) return 'restore';
        if (op.indexOf('import') === 0 || op.indexOf('carryover') === 0
            || op.indexOf('apply-carryover') === 0) return 'import';
        return 'unknown';
    }

    /**
     * 一行诊断文案（不抛、输入畸形即如实说明）。
     * @param {{stale:boolean, reason:string, from:string, to:string, count?:number}} r
     */
    function line(r) {
        const s = (r && typeof r === 'object') ? r : null;
        if (!s) return '—（无读数）';
        if (s.reason === 'hit') return '一致' + (s.count != null ? '（在册 ' + s.count + ' 项）' : '');
        if (s.reason === 'no-current') return '判不了（当下会话/代际读数缺失，按放行处置）';
        if (s.reason === 'no-id') return '缓存项未带身份（旧格式）';
        return '失效（' + s.reason + '）'
            + (s.unjudgeable ? '［判据不全，保守重算］' : '')
            + (s.from && s.to ? ' ' + s.from + ' → ' + s.to : '');
    }

    const api = {
        IDENTITY_KEYS,
        INVALIDATION_CAUSES,
        REASONS,
        identityOf,
        identityKey,
        sameIdentity,
        diffIdentity,
        invalidate,
        causeOf,
        line,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCacheIdentity = api;
})(typeof window !== 'undefined' ? window : globalThis);