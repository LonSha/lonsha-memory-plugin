// branch-guard.js — 分支守护（Branch Guard），v3.183.0
// ------------------------------------------------------------
// 为什么存在：
//   本仓库的 swipeFingerprintGuard（v3.89）只保护**召回缓存**——命中前校验末楼指纹，
//   翻 swipe 让缓存失效。但**生成期**没有同类保护：用户点「重新生成」或向左/右翻 swipe，
//   本轮正在跑的提取管线仍按旧楼层口径落笔，写进 summary / graph / pov / timeline。
//   表现形态：翻完 swipe 之后，摘要里躺着的是**上一个分支**的事实。
//
//   yuzuki-Memory 的 branch-snapshot.js 用「消息签名 + 楼层快照 + 三态待回滚队列」解决
//   同一问题。本模块取其**机制**（不搬它的表格记录快照——本仓的楼层归属已由
//   ledger-replay.js 统一回放，两份快照会漂移），按 LonSha 规范重写为：
//     · 纯函数、零依赖、IIFE + CJS 双导出（单类测试可 require）
//     · 三态归因：ok / absent / threw，绝不把「没接上」说成「已保护」
//     · 不抛：任何一处抛都只降级成一条报告，不阻断生成管线
//
// 三个待回滚队列（对应三种触发，语义各不相同，不可合并）：
//   request  请求前：用户点「重新生成」/ 发送前，该楼本轮作废
//   apply    应用时：生成结果落层时发现该楼已翻页，本轮结果作废
//   swipe    翻页时：用户主动翻到另一页，该楼已归新页
// 为什么分三态而不是一个布尔：三者的**发现时机**不同（请求前 / 落层时 / 翻页后），
// 处置也不同（request 在生成前丢弃、apply 在落层时丢弃、swipe 在翻页后重提取）。
// 合成一个开关会让「该丢的没丢」和「不该丢的丢了」无法区分。
//
// 手动编辑保护：
//   用户手动改过楼 / 手动加过摘要时，绝不自动回滚——那是用户在写，不是系统在读。
//   markManualEdit 记录最近一次手动编辑时间戳，此后短窗口内的自动回滚一律跳过。
(function (root) {
    'use strict';
    const BRANCH_GUARD_VERSION = 1;

    // 单条待回滚记录的默认存活时长。TTL 的意义：用户点了重新生成又取消、
    // 或翻页后没有再生成，这条记录不该永久占位。过期即视为「无人认领」。
    const DEFAULT_TTL = 180000;
    // 单队列上限。队列是内存态 Map，会话切走不清理会无限增长。
    const MAX_ENTRIES = 200;

    /** 与 index.js hash32 同口径（FNV-1a 32 位）——签名跨模块必须一致，否则两边对不上。 */
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    /** 该楼**当前显示那一页**的正文（swipe_id 决定页）。与 index.js msgTextOf 同口径。 */
    function textOf(msg) {
        try {
            if (!msg) return '';
            const sw = Math.max(0, Math.round(Number(msg.swipe_id) || 0));
            if (Array.isArray(msg.swipes) && typeof msg.swipes[sw] === 'string') return msg.swipes[sw];
            return String(msg.mes || msg.content || msg.text || '');
        } catch (_e) { return ''; }
    }

    /** 是否 AI 楼。user / system 楼不参与分支守护（它们没有 swipe）。 */
    function isAssistantMessage(message) {
        if (!message || typeof message !== 'object') return false;
        if (message.is_user === true || message.role === 'user' || message.role === 'system' || message.is_system === true) return false;
        return true;
    }

    /**
     * 消息签名：角色 + 页码 + 正文 hash + 生成代次 + 时间戳。
     * 与 index.js msgFpOf 的差别：**多带 gen_id 与 send_date**。
     * 为什么：msgFpOf 回答「这一页还是不是那一页」；本签名要回答「这一页是不是
     * 同一代生成的」。同页不同代（重新生成覆盖了 swipe）必须判为不同分支——
     * 只靠正文 hash 会把「生成内容恰好相同」误判成同分支，那时旧管线结果反而是对的。
     */
    function signatureOf(message) {
        try {
            if (!message || typeof message !== 'object') return '';
            const extra = (message.extra && typeof message.extra === 'object') ? message.extra : {};
            const genHint = String(extra.gen_id ?? extra.generation_id ?? extra.swipe_generation_id ?? '');
            const timeHint = String(message.send_date ?? message.gen_started ?? extra.send_date ?? '');
            const swipeId = Math.max(0, Math.round(Number(message.swipe_id ?? 0)));
            return [
                isAssistantMessage(message) ? 'a' : 'o',
                swipeId,
                hash32(textOf(message)),
                genHint,
                timeHint,
            ].join('|');
        } catch (_e) { return ''; }
    }

    /** 楼层号归一（缺失/畸形给 -1）。 */
    function floorOf(value) {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : -1;
    }

    // ------------------------------------------------------------
    // 待回滚队列。三张表同构，故收成一个工厂，避免三份复制粘贴漂移。
    // now 必须注入：TTL 语义靠时钟判定，测试要能推进时钟才能覆盖过期路径。
    // ------------------------------------------------------------
    function makeQueue(ttl, nowFn) {
        const entries = new Map();   // key -> expiresAt
        return {
            /** 记一条。返回是否记上（楼层畸形则拒绝，不写半格）。 */
            mark(floor, sessionId, ttlMs) {
                const f = floorOf(floor);
                if (f < 0) return false;
                const key = (sessionId || 'default') + ':' + f;
                entries.set(key, nowFn() + Math.max(1000, Number(ttlMs) || ttl || DEFAULT_TTL));
                // 上限收敛：超过上限先清过期，仍超则丢最早写入的那条。
                if (entries.size > MAX_ENTRIES) {
                    const now = nowFn();
                    for (const [k, exp] of entries) { if (exp <= now) entries.delete(k); }
                    while (entries.size > MAX_ENTRIES) {
                        const oldest = entries.keys().next();
                        if (oldest.done) break;
                        entries.delete(oldest.value);
                    }
                }
                return true;
            },
            /** 取走本会话所有未过期楼层（消费语义：取走即清）。 */
            consumeAll(sessionId) {
                const prefix = (sessionId || 'default') + ':';
                const now = nowFn();
                const floors = [];
                for (const [key, exp] of entries) {
                    if (exp <= now) { entries.delete(key); continue; }
                    if (!key.startsWith(prefix)) continue;
                    const f = Number.parseInt(key.slice(prefix.length), 10);
                    if (Number.isFinite(f) && f >= 0) floors.push(f);
                    entries.delete(key);
                }
                return Array.from(new Set(floors)).sort((a, b) => a - b);
            },
            /** 查一条是否在列（**不**取走——调用方可能只想问「这楼被标记了吗」）。 */
            peek(floor, sessionId) {
                const f = floorOf(floor);
                if (f < 0) return false;
                const key = (sessionId || 'default') + ':' + f;
                const exp = entries.get(key);
                if (!Number.isFinite(exp)) return false;
                if (exp <= nowFn()) { entries.delete(key); return false; }
                return true;
            },
            /** 取走一条（消费语义）。 */
            consume(floor, sessionId) {
                const f = floorOf(floor);
                if (f < 0) return false;
                const key = (sessionId || 'default') + ':' + f;
                const exp = entries.get(key);
                entries.delete(key);
                return Number.isFinite(exp) && exp > nowFn();
            },
            /** 会话切走时清空该会话的残留。 */
            clearSession(sessionId) {
                const prefix = (sessionId || 'default') + ':';
                for (const key of entries.keys()) {
                    if (key.startsWith(prefix)) entries.delete(key);
                }
            },
            size() { return entries.size; },
        };
    }

    /**
     * 建一个守护实例。
     * @param {object} opts
     *   now        注入时钟（测试用；默认 Date.now）
     *   manualWindowMs 手动编辑后的静默窗口（该窗口内不自动回滚）
     */
    function createGuard(opts = {}) {
        const nowFn = (typeof opts.now === 'function') ? opts.now : () => Date.now();
        const manualWindowMs = Number.isFinite(Number(opts.manualWindowMs)) ? Math.max(0, Number(opts.manualWindowMs)) : 3000;

        const requestQ = makeQueue(DEFAULT_TTL, nowFn);
        const applyQ = makeQueue(DEFAULT_TTL, nowFn);
        const swipeQ = makeQueue(DEFAULT_TTL, nowFn);
        /** 每楼「已处理的那一代」签名——用来判断落层时这楼是不是还停在原代。 */
        const processedSig = new Map();   // key -> signature
        let lastManualEditAt = 0;

        /** 会话键：会话是分支的**自然边界**，跨会话的楼层号毫无意义。 */
        const keyOf = (floor, sessionId) => (sessionId || 'default') + ':' + floorOf(floor);

        return {
            BRANCH_GUARD_VERSION,

            /** 标记「请求前该楼作废」。 */
            markRequestRollback(floor, sessionId, ttlMs) { return requestQ.mark(floor, sessionId, ttlMs); },
            /** 标记「落层时该楼已翻页」。 */
            markApplyRollback(floor, sessionId, ttlMs) { return applyQ.mark(floor, sessionId, ttlMs); },
            /** 标记「用户翻到另一页」。 */
            markSwipeMode(floor, sessionId, ttlMs) { return swipeQ.mark(floor, sessionId, ttlMs); },

            /** 取走本会话所有「请求前作废」楼层（生成入口用，消费语义）。 */
            consumeRequestRollbacks(sessionId) { return requestQ.consumeAll(sessionId); },
            /** 该楼是否处于「请求前作废」态（不取走）。 */
            isRequestRollback(floor, sessionId) { return requestQ.peek(floor, sessionId); },
            /** 取走「落层时翻页」标记（落层路径用，消费语义）。 */
            consumeApplyRollback(floor, sessionId) { return applyQ.consume(floor, sessionId); },
            /** 该楼是否处于「翻页」态（不取走）。 */
            isSwipeMode(floor, sessionId) { return swipeQ.peek(floor, sessionId); },

            /** 记住某楼已处理的那一代。 */
            setProcessedSignature(floor, signature, sessionId) {
                const f = floorOf(floor);
                if (f < 0) return false;
                const key = keyOf(f, sessionId);
                if (signature) processedSig.set(key, String(signature));
                else processedSig.delete(key);
                return true;
            },
            /** 某楼已处理的那一代（没有则空串）。 */
            getProcessedSignature(floor, sessionId) {
                const f = floorOf(floor);
                if (f < 0) return '';
                return processedSig.get(keyOf(f, sessionId)) || '';
            },
            /** 清掉某楼的已处理代次（重新生成前必须清，否则旧代次会被当成已处理）。 */
            clearProcessedSignature(floor, sessionId) {
                const f = floorOf(floor);
                if (f < 0) return false;
                return processedSig.delete(keyOf(f, sessionId));
            },

            /**
             * 手动编辑登记。返回当前最近手动编辑时间。
             * 用 max 取大：手动编辑时间只会前进，不会因为乱序事件回退。
             */
            markManualEdit(timestamp) {
                const t = Number(timestamp);
                if (Number.isFinite(t)) lastManualEditAt = Math.max(lastManualEditAt, t);
                else lastManualEditAt = Math.max(lastManualEditAt, nowFn());
                return lastManualEditAt;
            },
            /** 是否处于手动编辑静默窗口内（窗口内不自动回滚）。 */
            inManualEditWindow(at) {
                if (!lastManualEditAt) return false;
                const t = Number.isFinite(Number(at)) ? Number(at) : nowFn();
                return (t - lastManualEditAt) <= manualWindowMs;
            },
            manualEditAt() { return lastManualEditAt; },

            /**
             * 生成入口：这次请求该从哪一楼开始重做。
             *
             * 语义：取待回滚楼层里**最小**的那个——它之后的楼都可能已被这次翻页/重生成污染，
             * 从最早的那楼重做才不会漏。没有待回滚楼层时按 chat 末尾推（末楼是 AI 楼则末楼，
             * 否则是「即将新增的那一楼」= chat.length）。
             *
             * @returns {{target:number, basis:string, pending:number[]}}
             *   basis ∈ 'request'（有待回滚楼层） | 'tail'（按末尾推）
             */
            resolveRequestTarget(chat, sessionId) {
                const pending = this.consumeRequestRollbacks(sessionId);
                if (pending.length) {
                    return { target: Math.min.apply(null, pending), basis: 'request', pending };
                }
                const rows = Array.isArray(chat) ? chat : [];
                const last = rows.length ? rows[rows.length - 1] : null;
                return { target: isAssistantMessage(last) ? rows.length - 1 : rows.length, basis: 'tail', pending: [] };
            },

            /**
             * 落层守卫：这一轮的提取结果还能不能写到 floor 上。
             *
             * **只有「判得出问题」才拦**——判不了（没签名 / 楼畸形）一律放行并标 judged:false。
             * 依据与 Liyuan 的分支隔离同一条纪律：隔离漏一点，好过让用户的记忆整体消失。
             * 首次提取、老对话、模块刚接入时必然「判不了」，若一律拦，等于把记忆功能关掉。
             *
             * 判定顺序（前三项是「判得出问题」，最后两项是「判不了」）：
             *   1. 手动编辑窗口内           → 拦（用户在写，系统别抢）
             *   2. 该楼已标记「落层时翻页」   → 拦（apply）
             *   3. 该楼当前签名 ≠ 落笔时签名  → 拦（翻页 / 重生成覆盖）
             *   4. 没有期望签名（从未处理过）  → 放行，judged:false
             *   5. 楼畸形 / 签名取不到       → 放行，judged:false
             *
             * @param {object} message   当前该楼的消息对象（live）
             * @param {string} expectedSig 落笔时记下的签名（getProcessedSignature 的返回值）
             * @returns {{accept:boolean, judged:boolean, reason:string, current:string}}
             *   reason ∈ 'accepted' | 'manual-edit-window' | 'apply-rollback' |
             *             'signature-mismatch' | 'no-signature' | 'malformed'
             */
            guardApply(message, expectedSig, sessionId) {
                try {
                    if (this.inManualEditWindow()) {
                        return { accept: false, judged: true, reason: 'manual-edit-window', current: signatureOf(message) };
                    }
                    const floor = floorOf(message && message.index);
                    if (floor >= 0 && this.consumeApplyRollback(floor, sessionId)) {
                        return { accept: false, judged: true, reason: 'apply-rollback', current: signatureOf(message) };
                    }
                    const current = signatureOf(message);
                    const expect = String(expectedSig || '');
                    if (!expect) {
                        // 从未处理过这一楼 ⇒ 判不了。放行（不是缺陷，是首次提取的常态）。
                        return { accept: true, judged: false, reason: 'no-signature', current };
                    }
                    if (!current) {
                        return { accept: true, judged: false, reason: 'malformed', current: '' };
                    }
                    if (current !== expect) {
                        return { accept: false, judged: true, reason: 'signature-mismatch', current };
                    }
                    return { accept: true, judged: true, reason: 'accepted', current };
                } catch (_e) {
                    return { accept: true, judged: false, reason: 'malformed', current: '' };
                }
            },

            /**
             * 翻页入口：用户翻到另一页时，该楼回到「重做」态。
             * 去重：同一楼短时间内的重复翻页只处理第一次（DOM 点击与 MESSAGE_SWIPED
             * 事件会双双到达，不去重就回滚两次，第二次会作用在已回滚的状态上）。
             * @returns {{prepared:boolean, skipped:boolean, reason:string}}
             */
            prepareSwipe(floor, sessionId, opts = {}) {
                try {
                    const f = floorOf(floor);
                    if (f < 0) return { prepared: false, skipped: true, reason: 'malformed-floor' };
                    const key = keyOf(f, sessionId);
                    const now = nowFn();
                    const dedupeMs = Number.isFinite(Number(opts.dedupeMs)) ? Math.max(0, Number(opts.dedupeMs)) : 120;
                    const lastAt = Number((this._swipeDedupe && this._swipeDedupe.get(key)) || 0);
                    if (dedupeMs > 0 && lastAt && (now - lastAt) <= dedupeMs) {
                        return { prepared: false, skipped: true, reason: 'duplicate' };
                    }
                    if (!this._swipeDedupe) this._swipeDedupe = new Map();
                    this._swipeDedupe.set(key, now);
                    this.markRequestRollback(f, sessionId, opts.ttlMs);
                    this.markApplyRollback(f, sessionId, opts.ttlMs);
                    this.markSwipeMode(f, sessionId, opts.ttlMs);
                    this.clearProcessedSignature(f, sessionId);
                    return { prepared: true, skipped: false, reason: 'prepared' };
                } catch (_e) {
                    return { prepared: false, skipped: false, reason: 'threw' };
                }
            },

            /** 重生成入口：与翻页同构，但**不**去重（每次点击都该作废该楼）。 */
            prepareRegenerate(floor, sessionId, opts = {}) {
                try {
                    const f = floorOf(floor);
                    if (f < 0) return { prepared: false, reason: 'malformed-floor' };
                    this.markRequestRollback(f, sessionId, opts.ttlMs);
                    this.markApplyRollback(f, sessionId, opts.ttlMs);
                    this.markSwipeMode(f, sessionId, opts.ttlMs);
                    this.clearProcessedSignature(f, sessionId);
                    return { prepared: true, reason: 'prepared' };
                } catch (_e) {
                    return { prepared: false, reason: 'threw' };
                }
            },

            /** 会话切走：清掉该会话的全部残留（楼层号跨会话无意义）。 */
            clearSession(sessionId) {
                requestQ.clearSession(sessionId);
                applyQ.clearSession(sessionId);
                swipeQ.clearSession(sessionId);
                const prefix = (sessionId || 'default') + ':';
                for (const key of processedSig.keys()) {
                    if (key.startsWith(prefix)) processedSig.delete(key);
                }
                if (this._swipeDedupe) {
                    for (const key of this._swipeDedupe.keys()) {
                        if (key.startsWith(prefix)) this._swipeDedupe.delete(key);
                    }
                }
                return true;
            },

            /** 体检：三张队列 + 已处理代次表 + 手动编辑窗口的当前规模。 */
            stats() {
                return {
                    version: BRANCH_GUARD_VERSION,
                    request: requestQ.size(),
                    apply: applyQ.size(),
                    swipe: swipeQ.size(),
                    processed: processedSig.size,
                    manualEditAt: lastManualEditAt,
                    inManualWindow: this.inManualEditWindow(),
                };
            },

            /** 一句话读数（诊断面用）。 */
            line() {
                const s = this.stats();
                let txt = `待回滚 请求${s.request}/应用${s.apply}/翻页${s.swipe} · 已处理代次 ${s.processed}`;
                txt += s.inManualWindow ? ' · 手动编辑静默中' : '';
                return txt;
            },
        };
    }

    const api = {
        BRANCH_GUARD_VERSION,
        DEFAULT_TTL,
        MAX_ENTRIES,
        hash32,
        textOf,
        signatureOf,
        isAssistantMessage,
        floorOf,
        createGuard,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : root;
    try { g.LonShaBranchGuard = Object.freeze(api); } catch (e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
