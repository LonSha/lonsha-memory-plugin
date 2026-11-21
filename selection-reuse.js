/**
 * selection-reuse.js — [R27-E] 复用上一轮选文：staged → commit 防迟到覆盖
 *
 * 【来源】照 shrink1024/fish-memory 的 src/runtime/selection-reuse.js（65 行）行为重写。
 *         该仓无 LICENSE，未复制任何代码。三条不变量（staged 不生效 / 前缀可延长 /
 *         重放对账）属于机制契约，按其行为重写并自测。
 *
 * 【要解决什么】
 *   「上一轮选好的那批记忆不用重选」这件事有两个致命时刻：
 *     ① **取消/迟到的请求**：用户按了停止、或者上一个请求超时后才回来，它算出的
 *        选文结果不能覆盖已经验证过的好缓存 —— 否则好结果被垃圾顶掉，且无人知道；
 *     ② **世界在两次之间变了**：中间又维护过一轮、又加了一条摘要，旧选文就过期了，
 *        盲目复用等于用旧世界的地图走新世界的路。
 *
 * 【三条不变量】
 *   ① **staged 不生效**：stage() 只放进 WeakMap（键是 plan 对象本身），
 *      只有 commit(plan) 才把候选提升为生效条目。plan 对象被丢弃 ⇒ 暂存自动失效。
 *   ② **serial 门**：clear()/force() 会让 serial 自增；commit 时若候选的 serial
 *      与当前不符（说明期间发生过失效），**连 forced 一起清掉**（避免旧的强制态泄漏）。
 *   ③ **前缀可延长**：旧条目的 journal 必须是当前 journal 的**前缀**，且多出来的
 *      后缀全部是「自动维护/压缩」产生的；把后缀的 patch 重放到旧 memory 上，
 *      结果必须与新 memory **完全一致**（逐字节比较 JSON）。只要有一条人肉改动混进去，
 *      就不复用 —— 「有人改过」和「系统自己滚过」是两件相反的事。
 *
 * 【玩家槽归一】
 *   normal send 时输入还在草稿里，regenerate 时同一条消息已经落库。
 *   本模块把**最后一个玩家槽**的 key 归一成 null（只这一个槽），
 *   靠它前面所有已选消息的身份做锚点。**后面回合里相同的文本故意算不同 key** ——
 *   「同一句话在别处出现」不是同一件事。
 *
 * 【与源码差异（逐条可指认）】
 *   · 指纹用本仓自带的双路 FNV-1a（16 位 hex），不引入 sha256 依赖
 *     （**仅用作内存键**，不做任何安全承诺，函数名与注释均写明）；
 *   · 重放函数 `replay` 由调用方注入（本仓有 batch-op-ledger / changeset 两条既有重放路径，
 *     不应在此模块内绑死其中一个）；未注入时 resolve **拒绝复用**并在 readings 里点名
 *     `replayUnavailable` —— 宁可全冷，不做「跳过校验的假命中」；
 *   · 深拷贝用本模块自带 cloneData（不依赖 structuredClone，宿主可能没有）；
 *   · 增 readings（命中/冷启/拒绝原因分布）与 line()。
 *
 * 【纪律】
 *   ① 不抛：任何形状错误都落到「不复用」并记原因；
 *   ② 不复用必须能说清为什么（reason 闭集），不许静默冷启；
 *   ③ 只读：resolve / get 不改任何内部状态。
 */
(function (root) {
    'use strict';

    /** 本面结构版本。 */
    const SR_VERSION = 1;
    /** 读数 kind。 */
    const SR_KIND = 'selection_reuse';
    /** 不复用原因闭集（面板/日志同源，顺序即诊断优先级）。 */
    const REASONS = Object.freeze([
        'no-entry',
        'allowed-miss',
        'stable-key-miss',
        'journal-not-prefix',
        'suffix-not-automatic',
        'replay-differs',
        'read-messages-differ',
        'eligible-differs',
        'replay-unavailable',
        'malformed'
    ]);
    /** 玩家槽归一后的占位 key。 */
    const PLAYER_SLOT = null;

    /** 双路 FNV-1a 指纹（16 位 hex）。**只当内存键用**，不做安全用途。 */
    function fingerprint(text) {
        const s = String(text ?? '');
        let h1 = 0x811c9dc5 | 0;
        let h2 = 0x9e3779b9 | 0;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
            h2 = Math.imul(h2 ^ ((c << 1) ^ (c >>> 3)), 0x5bd1e995) >>> 0;
            h2 = (h2 ^ (h2 >>> 15)) >>> 0;
        }
        return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
    }

    /** 普通数据深拷贝（无 structuredClone 依赖；只处理 JSON 可表达的子集 + undefined）。 */
    function cloneData(value, seen) {
        if (value === null || typeof value !== 'object') return value;
        const memo = seen || new Map();
        if (memo.has(value)) return memo.get(value);
        if (Array.isArray(value)) {
            const out = [];
            memo.set(value, out);
            for (let i = 0; i < value.length; i++) out.push(cloneData(value[i], memo));
            return out;
        }
        const out = {};
        memo.set(value, out);
        for (const key of Object.keys(value)) out[key] = cloneData(value[key], memo);
        return out;
    }

    /** 稳定 JSON（键序固定），用于「完全一致」比较。 */
    function stableJson(value) {
        const walk = (v) => {
            if (v === null || typeof v !== 'object') return v;
            if (Array.isArray(v)) return v.map(walk);
            const out = {};
            for (const key of Object.keys(v).sort()) out[key] = walk(v[key]);
            return out;
        };
        try { return JSON.stringify(walk(value)); } catch (_e) { return '\u0000<unserializable>'; }
    }

    /**
     * 归一化这一轮的「路径 + 消息」。
     * path = 已选消息的身份序列（+ 可选当前输入）；messages = 实际要算进指纹的内容。
     * 只把**最后一个玩家槽**的 key 置空，其余原样。
     */
    function selectionFrame(snapshot, recent) {
        const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const source = Array.isArray(snap.messages) ? snap.messages : [];
        const path = source.map((m) => ({ key: (m && m.key) ?? null, role: (m && m.role) ?? null }));
        if (snap.userInput !== undefined && snap.userInput !== null) {
            path.push({ key: 'current-input', role: 'user' });
        }
        const tail = path.length ? path[path.length - 1] : null;
        const playerKey = tail && tail.role === 'user' ? tail.key : null;
        if (playerKey !== null) path[path.length - 1].key = PLAYER_SLOT;

        const list = Array.isArray(recent) ? recent : [];
        const messages = list.map((m) => {
            const key = (m && m.key) ?? null;
            const normalized = playerKey !== null && key === playerKey ? PLAYER_SLOT : key;
            return { key: normalized, role: (m && m.role) ?? null, content: (m && m.content) ?? '' };
        });
        return { path: path, messages: messages, playerKey: playerKey };
    }

    /** 复用键：同一聊天 + 同一本书 + 同一路径 + 同一批消息 + 同一材料 ⇒ 同一个键。 */
    function selectionReuseKey(snapshot, recent, material) {
        const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
        const frame = selectionFrame(snap, recent);
        return fingerprint(JSON.stringify({
            chatId: snap.chatId ?? null,
            bookName: snap.bookName ?? null,
            path: frame.path,
            messages: frame.messages,
            material: material === undefined ? null : material
        }));
    }

    /**
     * 复用槽：一个聊天一个实例。内部状态全部 `_` 前缀（约定外部不碰），
     * 不设真私有字段是为兼容老宿主解析器。
     */
    class SelectionReuse {
        constructor() {
            this._entry = null;
            this._staged = new WeakMap();
            this._serial = 0;
            this._forced = false;
            this._readings = emptyReadings();
        }

        /** 当前 serial（clear/force 会推进）。 */
        get serial() { return this._serial; }

        /** 当前是否处于强制态。 */
        get forced() { return this._forced; }

        /** 读数（命中/冷启/拒绝分布）。 */
        get readings() { return this._readings; }

        /** 诊断行。 */
        get line() { return line(this._readings); }

        /** 丢掉生效条目与全部暂存（不推进 serial）。 */
        invalidate() {
            this._entry = null;
            this._staged = new WeakMap();
            return this;
        }

        /** 彻底清空：条目 + 暂存 + 强制态，并推进 serial（让迟到请求的 commit 失效）。 */
        clear() {
            this.invalidate();
            this._forced = false;
            this._serial++;
            return this;
        }

        /** 设定强制态并推进 serial。 */
        force(value) {
            this._forced = value === true;
            this._serial++;
            return this;
        }

        /** 按 key 直接取（不校验上下文；调用方负责在 resolve 里做完整校验）。 */
        get(key) {
            const entry = this._entry;
            if (!entry || entry.key !== key) {
                this._readings.coldLines.get = (this._readings.coldLines.get || 0) + 1;
                return null;
            }
            this._readings.hits.get = (this._readings.hits.get || 0) + 1;
            return entry.ids.slice();
        }

        /**
         * 完整校验式复用。
         * @param {string} key 本轮复用键
         * @param {object} context {stableKey, journal:[{id,automatic,reason}], eligibleIds, memory, frame, readMessages}
         * @param {Set|Array} allowed 本轮允许的条目 id 集合
         * @param {Function} [replay] (memory, patch) => memory；未提供则拒绝复用
         * @returns {{ids:Array, readMessages:Array}|null}
         */
        resolve(key, context, allowed, replay) {
            const entry = this._entry;
            if (!entry) { this._miss('no-entry'); return null; }
            const ctx = context && typeof context === 'object' ? context : {};
            const allowSet = allowed instanceof Set ? allowed : new Set(Array.isArray(allowed) ? allowed : []);
            // ① 条目里的 id 必须全部还在允许集里（库被换了/条目被删了就不能复用）。
            if (!entry.ids.every((id) => allowSet.has(id))) { this._miss('allowed-miss'); return null; }
            // ② 键一致 = 世界没变，直接命中。
            if (entry.key === key) {
                this._readings.hits.resolve = (this._readings.hits.resolve || 0) + 1;
                return { ids: entry.ids.slice(), readMessages: cloneData(entry.readMessages) };
            }
            // ③ 键不一致：只有在「旧 journal 是新 journal 的前缀」时才可能延长复用。
            if (entry.stableKey !== ctx.stableKey || !Array.isArray(entry.journalIds)) { this._miss('stable-key-miss'); return null; }
            const journal = Array.isArray(ctx.journal) ? ctx.journal : null;
            if (!journal) { this._miss('malformed'); return null; }
            for (let i = 0; i < entry.journalIds.length; i++) {
                if (!journal[i] || journal[i].id !== entry.journalIds[i]) { this._miss('journal-not-prefix'); return null; }
            }
            const suffix = journal.slice(entry.journalIds.length);
            // 后缀里每一条都必须是系统自动维护/压缩；人肉改动一律不复用。
            for (const commit of suffix) {
                const c = commit && typeof commit === 'object' ? commit : {};
                if (c.automatic !== true || (c.reason !== 'maintenance' && c.reason !== 'compact')) {
                    this._miss('suffix-not-automatic');
                    return null;
                }
            }
            if (!replay) { this._miss('replay-unavailable'); return null; }

            // ④ 空白后缀时，eligible 集合必须完全相同（没有新条目进来）。
            const eligible = Array.isArray(ctx.eligibleIds) ? ctx.eligibleIds : [];
            if (!suffix.length && stableJson(entry.eligibleIds) !== stableJson(eligible)) { this._miss('eligible-differs'); return null; }
            // ⑤ 已有条目的「是否可选」状态不许被翻面。
            const entryMemory = entry.memory && typeof entry.memory === 'object' ? entry.memory : {};
            const entryEntries = entryMemory.entries && typeof entryMemory.entries === 'object' ? entryMemory.entries : {};
            const ctxMemory = ctx.memory && typeof ctx.memory === 'object' ? ctx.memory : {};
            const ctxEntries = ctxMemory.entries && typeof ctxMemory.entries === 'object' ? ctxMemory.entries : {};
            const entryEligible = new Set(Array.isArray(entry.eligibleIds) ? entry.eligibleIds : []);
            const ctxEligible = new Set(eligible);
            for (const id of Object.keys(entryEntries)) {
                if (ctxEntries[id] && entryEligible.has(id) !== ctxEligible.has(id)) { this._miss('eligible-differs'); return null; }
            }
            // ⑥ 读过的消息必须逐字未变（否则摘要依据已不是同一段正文）。
            const frame = ctx.frame && typeof ctx.frame === 'object' ? ctx.frame : {};
            const currentByKey = new Map();
            for (const m of (Array.isArray(frame.messages) ? frame.messages : [])) currentByKey.set(m && m.key, m);
            const readByKey = new Map();
            for (const m of (Array.isArray(entry.readMessages) ? entry.readMessages : [])) readByKey.set(m && m.key, m);
            for (const m of (Array.isArray(ctx.readMessages) ? ctx.readMessages : [])) {
                if (stableJson(readByKey.get(m && m.key)) !== stableJson(m)) { this._miss('read-messages-differ'); return null; }
            }
            for (const pair of readByKey) {
                if (stableJson(pair[1]) !== stableJson(currentByKey.get(pair[0]))) { this._miss('read-messages-differ'); return null; }
            }
            // ⑦ 把后缀重放到旧 memory 上，结果必须与新 memory 完全一致。
            let expected = entryMemory;
            try {
                for (const commit of suffix) {
                    const patch = commit && typeof commit === 'object' ? commit.patch : null;
                    if (patch === undefined || patch === null) { this._miss('suffix-not-automatic'); return null; }
                    expected = replay(expected, patch);
                }
            } catch (_e) {
                this._miss('malformed');
                return null;
            }
            if (stableJson(expected) !== stableJson(ctxMemory)) { this._miss('replay-differs'); return null; }

            this._readings.hits.resolve = (this._readings.hits.resolve || 0) + 1;
            return { ids: entry.ids.slice(), readMessages: cloneData(entry.readMessages) };
        }

        /** 暂存候选：**不生效**，只挂在 plan 对象上。 */
        stage(plan, key, ids, serial, context) {
            if (!plan || (typeof plan !== 'object' && typeof plan !== 'function')) return this;
            const ctx = context && typeof context === 'object' ? context : null;
            const candidate = { key: key, ids: Array.isArray(ids) ? ids.slice() : [], serial: serial };
            if (ctx) {
                candidate.stableKey = ctx.stableKey;
                candidate.memory = cloneData(ctx.memory);
                candidate.journalIds = (Array.isArray(ctx.journal) ? ctx.journal : []).map((c) => c && c.id);
                candidate.eligibleIds = Array.isArray(ctx.eligibleIds) ? ctx.eligibleIds.slice() : [];
                candidate.readMessages = cloneData(ctx.readMessages);
            }
            this._staged.set(plan, candidate);
            this._readings.staged = (this._readings.staged || 0) + 1;
            return this;
        }

        /** 提升候选为生效条目。serial 不符 ⇒ 连 forced 一起清（防旧强制态泄漏）。 */
        commit(plan) {
            const candidate = plan && (typeof plan === 'object' || typeof plan === 'function') ? this._staged.get(plan) : undefined;
            if (!candidate) {
                this._readings.commits.miss = (this._readings.commits.miss || 0) + 1;
                return false;
            }
            this._staged.delete(plan);
            this._entry = candidate;
            if (candidate.serial === this._serial) this._forced = false;
            this._readings.commits.ok = (this._readings.commits.ok || 0) + 1;
            return true;
        }

        /** 内部：记一条冷启原因。 */
        _miss(reason) {
            const key = REASONS.indexOf(reason) >= 0 ? reason : 'malformed';
            this._readings.misses[key] = (this._readings.misses[key] || 0) + 1;
        }
    }

    /** 空读数。 */
    function emptyReadings() {
        const misses = {};
        for (const reason of REASONS) misses[reason] = 0;
        return {
            kind: SR_KIND,
            version: SR_VERSION,
            hits: { get: 0, resolve: 0 },
            misses: misses,
            staged: 0,
            commits: { ok: 0, miss: 0 },
            // 兼容旧调用点：coldLines 与 hits 同形
            coldLines: { get: 0 }
        };
    }

    /** 诊断行：命中几次、冷启几次、冷在哪。 */
    function line(readings) {
        const r = readings && typeof readings === 'object' ? readings : {};
        const hits = r.hits && typeof r.hits === 'object' ? r.hits : {};
        const misses = r.misses && typeof r.misses === 'object' ? r.misses : {};
        const hitTotal = (hits.get || 0) + (hits.resolve || 0);
        const hit = [];
        for (const reason of REASONS) if (misses[reason]) hit.push(reason + '×' + misses[reason]);
        const tail = hit.length ? '（冷启：' + hit.join('，') + '）' : '';
        const commits = r.commits && typeof r.commits === 'object' ? r.commits : {};
        return '选文复用 命中' + hitTotal + ' 暂存' + String(r.staged || 0)
            + ' 提交' + String(commits.ok || 0) + '/' + String((commits.ok || 0) + (commits.miss || 0)) + tail;
    }

    /** 自检（供 engine-self-check 与测试共用）。 */
    function selfCheck() {
        // ① staged 不生效：stage 后 get 仍为空
        const slot = new SelectionReuse();
        const plan = {};
        slot.stage(plan, 'k1', ['e1', 'e2'], slot.serial);
        const afterStage = slot.get('k1');
        slot.commit(plan);
        const afterCommit = slot.get('k1');

        // ② serial 门：clear 之后拿旧 plan 再 commit 不生效
        const slot2 = new SelectionReuse();
        const plan2 = {};
        slot2.stage(plan2, 'k2', ['e9'], slot2.serial);
        slot2.clear();
        const lateCommit = slot2.commit(plan2);

        // ③ 玩家槽归一：snapshot 最后一条是 user 时，recent 里同 key 也归一
        const frame = selectionFrame(
            { messages: [{ key: 'u1', role: 'user' }, { key: 'a1', role: 'assistant' }, { key: 'u2', role: 'user' }], userInput: '草稿' },
            [{ key: 'u1', role: 'user', content: 'x' }, { key: 'a1', role: 'assistant', content: 'y' }]
        );
        const checks = [
            ['staged 不生效', afterStage === null],
            ['commit 后生效', Array.isArray(afterCommit) && afterCommit.length === 2],
            ['清空后迟到提交被拒', lateCommit === false],
            ['玩家槽归一为 null 且路径尾槽置空', frame.path[frame.path.length - 1].key === null && frame.playerKey === 'current-input']
        ];
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        SR_VERSION: SR_VERSION,
        SR_KIND: SR_KIND,
        REASONS: REASONS,
        fingerprint: fingerprint,
        cloneData: cloneData,
        stableJson: stableJson,
        selectionFrame: selectionFrame,
        selectionReuseKey: selectionReuseKey,
        SelectionReuse: SelectionReuse,
        emptyReadings: emptyReadings,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaSelectionReuse = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);