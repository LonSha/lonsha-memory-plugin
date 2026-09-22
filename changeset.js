/* ========================================================
 * changeset.js — [v3.184.0] 行级变更集（改了什么 → 从什么变成什么）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件现在有三种「回看刚才改了什么」的设施，**没有一种记了前后值**：
 *     · SnapshotManager（index.js 13287）——粒度是**整楼层**：save(chatId, floor, data)
 *       存一份完整数据快照，restore 整份覆盖。只知道「第 N 楼改过」，不知道改了哪一格。
 *     · OpLog（index.js 13191）——记的是**意图**：{type, op, ref, floor, meta}，
 *       meta 是调用方自填的一段描述且被裁剪到 80 字符。
 *     · CharacterState.ops——同理，_logOp 存的是 `effective.push(c)`，
 *       即**提取管线想要做什么**（{character, field, delta:5}），而不是「这一格原来是 3、现在是 8」。
 *   于是「第 12 楼到底把谁的好感从多少改到了多少」在本仓库**无处可查**：
 *   把 op 里的 delta 反推需要知道当时的值，而那已经不存在了。删楼重放（rollbackFloor →
 *   status.ops 过滤 → rebuildFromOps）也只在「意图」这一层做减法——
 *   一旦某次写入没被记成 op（比如基线补齐、主角档案、生活小档案各走各的路径），
 *   回滚对它就是隐形的。
 *
 *   nocturne_memory 的 db/snapshot.py 正是治这个：ChangesetStore 累积**行级**
 *   before/after，覆盖语义明确（同一主键首次触碰时冻结 before，之后只更新 after），
 *   净零变更（before == after）自动从展示里滤掉，并回收「创建后又删掉」的无意义变更。
 *
 *   本模块取其**机制**，按 LonSha 规范重写：
 *     · 行键 = 表名 + 主键（本仓表格：status / protagonist / lifeDetail / graph / summary …），
 *       复合主键用 '|' 连接 —— 与源实现同构，因为「同一格的判据」必须可复现。
 *     · 覆盖语义：首次触碰冻结 before（**一次写入产生的多步改动合成一个 before→after 对**，
 *       否则「先 +5 再 -5」会留下两条各自看似成立的记录，读者拼不出真相）。
 *     · 净零过滤：before === after 的行**不占展示位**但仍计入 noop 计数
 *       （滤掉 ≠ 没发生：noop 计数说明「这一步被算过」）。
 *     · 「创建后又删掉」回收：before 与 after 都为「不存在」的行带
 *       `noopCreate` 标记，不展示（源实现的 _gc_noop_creates）。
 *     · 有界：总行数上限 + 淘汰计数（本仓 I6 纪律：淘汰必须可见，否则读者把窗口当全集）。
 *     · 不抛：写入路径在提取管线里，抛一次会连坐整轮提取。
 *
 * 【与既有三者的分工（互不重叠）】
 *   SnapshotManager  粗粒度整楼层快照 —— 「把整个存档退回这一楼之前」
 *   OpLog            事件意图流水     —— 「这一轮系统做了哪些动作」
 *   CharacterState.ops 提取意图账     —— 「提取管线要求加减多少」
 *   本模块            行级前后值       —— 「这一格从什么变成了什么、是不是白改」
 *   四者关系是**不同分辨率**，不是重复：撤销一次误改需要前后值（本模块），
 *   回退一整楼需要整份快照（SnapshotManager），定位责任需要意图流水（OpLog）。
 *
 * 【可移植性说明】
 *   机制出处：nocturne_memory（Dataojitori/nocturne_memory）backend/db/snapshot.py 的
 *   ChangesetStore（单池累积 + 先冻结 before + 净零过滤 + noop 回收）。
 *   实现按本仓规范重写（零依赖、不抛、有界、I6 读数），未复制其代码。
 */
(function (root) {
    'use strict';
    const CHANGESET_VERSION = 1;
    const CHANGESET_KIND = 'row_changeset';
    // 单池行数上限。长线里「一轮改 30 格」很常见，不设界会在几百轮后堆成几万行。
    const MAX_ROWS = 400;
    // 展示明细的打样条数（读数只需要知道「大概改了什么」，不需要全量）。
    const MAX_SAMPLE = 8;

    function normStr(v) { return String(v == null ? '' : v); }
    /** 值归一化：undefined 与 null 在「这一格有没有值」的意义上等价，必须同形。 */
    function normVal(v) {
        if (v === undefined || v === null) return null;
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'boolean') return v;
        return String(v);
    }
    /** 行键：表名 + 主键。复合主键按传入顺序用 '|' 连接（顺序即契约）。 */
    function makeRowKey(table, pk) {
        const parts = Array.isArray(pk) ? pk.map(normStr) : [normStr(pk)];
        return normStr(table) + ':' + parts.join('|');
    }
    /** 行相等判据（含「两边都不存在」= 相等）。 */
    function rowsEqual(a, b) {
        const A = (a === undefined) ? null : a;
        const B = (b === undefined) ? null : b;
        if (A === null && B === null) return true;
        if (A === null || B === null) return false;
        if (typeof A === 'number' && typeof B === 'number') return Math.abs(A - B) < 1e-9;
        return String(A) === String(B);
    }

    /**
     * 变更集池（单池累积，覆盖语义见文件头）。
     */
    class ChangesetStore {
        constructor(opts) {
            const o = opts || {};
            this.maxRows = Math.max(20, Number(o.maxRows) || MAX_ROWS);
            this.rows = new Map();        // key -> {key, table, pk, before, after, floor, at, touched}
            this.evicted = 0;             // 累计淘汰行数（I6：淘汰必须可见）
            this.noop = 0;                // 净零变更数（滤掉但计数）
            this.noopCreate = 0;          // 「创建后又删掉」数
            this.overwritten = 0;         // after 被覆盖的次数（说明同一格本轮被改了多次）
            this.badInput = 0;            // 非法输入（无表名/无主键）——静默丢弃是不可接受的
        }
        /**
         * 记一次行级变更。
         * @param {{table:string, pk:any, before:any, after:any, floor?:number}} rec
         * @returns {boolean} 是否真记下（净零/非法返回 false，但仍进计数）
         */
        record(rec) {
            try {
                if (!rec || typeof rec !== 'object') { this.badInput++; return false; }
                const table = normStr(rec.table).trim();
                const pkEmpty = Array.isArray(rec.pk) ? (rec.pk.length === 0 || rec.pk.every(p => normStr(p).trim() === '')) : (normStr(rec.pk).trim() === '');
                if (!table || pkEmpty) { this.badInput++; return false; }
                const key = makeRowKey(table, rec.pk);
                const before = normVal(rec.before);
                const after = normVal(rec.after);
                const existing = this.rows.get(key);
                if (existing) {
                    // 覆盖语义：before **冻结**，只更新 after；同键重记不占新位
                    existing.after = after;
                    existing.touched = (existing.touched || 1) + 1;
                    this.overwritten++;
                    if (rec.floor != null) existing.lastFloor = Number(rec.floor);
                    return true;
                }
                this.rows.set(key, {
                    key: key, table: table, pk: Array.isArray(rec.pk) ? rec.pk.slice() : [rec.pk],
                    before: before, after: after,
                    floor: rec.floor != null ? Number(rec.floor) : null,
                    at: Date.now(), touched: 1,
                });
                // 有界：超限先淘汰最早的（Map 保持插入序）
                while (this.rows.size > this.maxRows) {
                    const first = this.rows.keys().next();
                    if (first.done) break;
                    this.rows.delete(first.value);
                    this.evicted++;
                }
                return true;
            } catch (_e) { this.badInput++; return false; }
        }
        /** 批量记录（供一次提取的多次写入合并入池）。 */
        recordMany(list) {
            const arr = Array.isArray(list) ? list : [];
            let n = 0;
            for (const r of arr) { try { if (this.record(r)) n++; } catch (_e) { this.badInput++; } }
            return n;
        }
        /** 池内记录条数（含净零与 noopCreate —— 它们被滤在展示之外，但仍占池）。 */
        getChangeCount() { return this.rows.size; }
        /** 逐行判类（纯函数、不抛）：'noop' | 'noopCreate' | 'change'。 */
        classify(row) {
            if (!row) return 'noop';
            const b = row.before, a = row.after;
            if (rowsEqual(b, a)) return (b === null && a === null) ? 'noopCreate' : 'noop';
            return 'change';
        }
        /** 有无意义行的清点（不改池）：{noop, noopCreate, change}。 */
        counts() {
            const out = { noop: 0, noopCreate: 0, change: 0 };
            for (const row of this.rows.values()) out[this.classify(row)]++;
            return out;
        }
        /**
         * 净零/无意义行回收（源实现的 _gc_noop_creates）。返回回收条数。
         * 注意：**noop 也一并回收**——它们的 before/after 已经相等，
         *   留在池里只会占满有界窗口，把真正的变更挤掉。
         */
        gcNoopCreates() {
            let n = 0;
            for (const [key, row] of Array.from(this.rows.entries())) {
                const cls = this.classify(row);
                if (cls === 'noop' || cls === 'noopCreate') {
                    this.rows.delete(key);
                    if (cls === 'noop') this.noop++; else this.noopCreate++;
                    n++;
                }
            }
            return n;
        }
        /** 展示视图：只含真有变化的行（含 before/after）。 */
        getSnapshotView() {
            const out = [];
            for (const row of this.rows.values()) {
                if (this.classify(row) !== 'change') continue;
                out.push({ key: row.key, table: row.table, pk: row.pk.slice(), before: row.before, after: row.after, floor: row.floor, touched: row.touched });
            }
            return out;
        }
        /** 按行键摘除（回滚重放时撤掉该楼产生的记录）。返回摘除条数。 */
        removeKeys(keys) {
            const arr = Array.isArray(keys) ? keys : [keys];
            let n = 0;
            for (const k of arr) { if (this.rows.delete(normStr(k))) n++; }
            return n;
        }
        /** 按楼层摘除（删楼重放：该楼的行级变更全部作废）。返回摘除条数。 */
        removeByFloor(floor) {
            const f = Number(floor);
            let n = 0;
            for (const [key, row] of Array.from(this.rows.entries())) {
                if (row.floor === f) { this.rows.delete(key); n++; }
            }
            return n;
        }
        clearAll() { const n = this.rows.size; this.rows.clear(); return n; }

        /** 一行自述（I6：窗口 / 累计淘汰 / 净零 / 覆盖 / 非法输入齐报）。 */
        summarize(sample) {
            const c = this.counts();
            const bits = ['变更 ' + c.change + '/' + this.rows.size + ' 行'];
            if (this.evicted) bits.push('已淘汰 ' + this.evicted);
            if (this.noop) bits.push('净零 ' + this.noop);
            if (this.noopCreate) bits.push('空建 ' + this.noopCreate);
            if (this.overwritten) bits.push('覆盖 ' + this.overwritten);
            if (this.badInput) bits.push('非法输入 ' + this.badInput);
            if (sample) {
                const view = this.getSnapshotView().slice(0, MAX_SAMPLE).map(r =>
                    (r.pk && r.pk.length ? r.pk.join('.') : r.key) + ' ' +
                    (r.before === null ? '∅' : String(r.before)) + '→' + (r.after === null ? '∅' : String(r.after)));
                if (view.length) bits.push(view.join('，'));
            }
            return bits.join(' · ');
        }
        export() {
            return {
                rows: Array.from(this.rows.values()),
                evicted: this.evicted, noop: this.noop, noopCreate: this.noopCreate,
                overwritten: this.overwritten, badInput: this.badInput,
                maxRows: this.maxRows,
            };
        }
        import(data) {
            try {
                if (!data || typeof data !== 'object') return false;
                this.rows = new Map();
                for (const r of (Array.isArray(data.rows) ? data.rows : [])) {
                    if (r && r.key) this.rows.set(String(r.key), r);
                }
                this.evicted = Number(data.evicted) || 0;
                this.noop = Number(data.noop) || 0;
                this.noopCreate = Number(data.noopCreate) || 0;
                this.overwritten = Number(data.overwritten) || 0;
                this.badInput = Number(data.badInput) || 0;
                if (data.maxRows) this.maxRows = Math.max(20, Number(data.maxRows) || MAX_ROWS);
                return true;
            } catch (_e) { return false; }
        }
    }

    /** 诊断面读数（纯函数、不抛）。 */
    function line(read) {
        const r = read || {};
        if (r.moduleMissing) return '模块未加载（changeset.js）';
        if (!r.rows) return '本轮尚无变更集';
        const bits = ['变更 ' + (r.change || 0) + '/' + r.rows + ' 行'];
        if (r.evicted) bits.push('已淘汰 ' + r.evicted);
        if (r.noop) bits.push('净零 ' + r.noop);
        if (r.noopCreate) bits.push('空建 ' + r.noopCreate);
        if (r.overwritten) bits.push('同格覆盖 ' + r.overwritten);
        if (r.badInput) bits.push('非法输入 ' + r.badInput);
        return bits.join(' · ');
    }

    const api = {
        CHANGESET_VERSION: CHANGESET_VERSION,
        CHANGESET_KIND: CHANGESET_KIND,
        MAX_ROWS: MAX_ROWS,
        MAX_SAMPLE: MAX_SAMPLE,
        ChangesetStore: ChangesetStore,
        makeRowKey: makeRowKey,
        rowsEqual: rowsEqual,
        normVal: normVal,
        line: line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaChangeset = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);