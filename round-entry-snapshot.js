/* ========================================================
 * round-entry-snapshot.js — [v3.443.0] L13-X8 本轮条目集合摘要 + 只回滚新增
 *
 * 【为什么需要这一面 / 修前实测后果（Problem 8）】
 *   本仓能「撤回」的东西只有一种：`row.revoke` 撤的是**证据裁决**（那条结论作废）；
 *   另有 `snapshot-checkpoint` 做的是**整份载荷**级检查点（取个名字存下来、整份对照）。
 *   缺的是中间那一层：**「这一轮生成到底新塞进了哪些条目」** ——
 *   一轮生成可能往图谱加 3 个节点、往锁定事实加 1 条、往摘要加 2 条，
 *   用户发现「这轮抽错了」时只能去各面对着手删，或者整份回滚（把同轮别的正确写入也一起吞掉）。
 *   于是「这轮加错了」与「整份都废了」两件事被压成同一种处置。
 *
 * 【本模块的边界（不做的事，逐条是计划明令）】
 *   · **不复制正文**：摘要只记 `id` + **指纹**（长度 + 首尾 24 字 + 简易哈希），
 *     不存第二条正文副本 —— 复制正文等于绕开各账 owner 另建一份真源，之后两边不再同步。
 *   · **不新建存储系统**：快照挂在调用方给的 engine 槽位上（`engine._roundSnapshots`），
 *     随引擎存档一起走；本模块自己不碰 localStorage / 不建表。
 *   · **不回退「本轮修改」**：修改类差异只**标待复核**（`pendingReview`），绝不自动写回旧值
 *     —— 回退修改会吞掉别的动作（同一格可能被后一轮合法改动，回退即覆盖别人的结果）。
 *   · **不猜条目身份**：id 一律由调用方给的 `collect` 回调提供；取不到 id 的条目**不入摘要**
 *     （并计入 `skippedNoId`），不按索引对齐装成「按 id 对齐了」。
 *   · **不做批量语义的"全部撤销"**：`undoRound` 撤销的是**一轮**（这正是本面要回答的粒度），
 *     但它仍然**逐账、逐 id** 走各账自己的删除口；不存在跨账的强制清空。
 *
 * 【三态纪律（本仓老账，逐条落进判据）】
 *   ① `absent` 与 `empty` 不同形：拿不到 collect / 没有快照账 ⇒ `ok:false + reason`；
 *      「有账但零快照」⇒ `ok:true + rounds []`。合成一个「没有」正是 O-1 / R3-D 抓过的形态。
 *   ② `modified` 与 `added` 不同形，且**只有 added 可撤销**（`undoable:false` + `why`）。
 *   ③ `unknown-fingerprint`（没有指纹可比）与 `same`（比过、一样）不同形 ——
 *      拿不到判据不等于证伪。
 *
 * 【快照形状（单一真源，读侧只认这一份）】
 *   { floor, ts, seq, entries: { <ledgerKey>: [ { id, fp } ] }, counts: { <ledgerKey>: n } }
 *   —— `entries` 里**只有 id 与指纹**，没有任何正文。
 *
 * 零依赖、CJS/IIFE 双导出，挂 window.LonShaRoundEntrySnapshot。
 * ======================================================== */
'use strict';

(function (global) {
    var VERSION = '3.444.0';
    /** 摘要上限：一轮里某本账超过这个条数就只记前 N 并**如实报截断**（不静默丢）。 */
    var MAX_ENTRIES_PER_LEDGER = 400;
    /** 快照环大小：只留最近这么几轮（更早的连 id 列表也不留 —— 回滚太久以前的一轮没有意义）。 */
    var MAX_ROUNDS = 12;

    function safe(fn, dflt) {
        try { var v = fn(); return v === undefined ? dflt : v; } catch (_e) { return dflt; }
    }

    /** 简易 32 位哈希（FNV-1a 变体）—— 只用于「这一条变没变」，不用于安全。 */
    function hash32(s) {
        var h = 0x811c9dc5;
        for (var i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    /** 条目指纹：长度 + 首尾 24 字 + 哈希。**不存正文**，且长度单列 ——
     *  「同长度不同内容」靠首尾+哈希看得见，「长度变了」靠 len 立刻看得见。 */
    function fingerprintOf(item) {
        if (item == null) return null;
        var text;
        if (typeof item === 'string') text = item;
        else if (typeof item === 'number' || typeof item === 'boolean') text = String(item);
        else if (typeof item === 'object') {
            /* 正文取哪一格：本仓各账不统一（text / content / summary / title / name / value）。
             * 取不到就退回「非 id 键的稳定串」—— 仍**不复制整条正文**进快照。 */
            var cand = ['text', 'content', 'summary', 'title', 'name', 'value', 'desc', 'fact'];
            for (var i = 0; i < cand.length; i++) {
                var v = safe(function () { return item[cand[i]]; }, null);
                if (typeof v === 'string' && v !== '') { text = v; break; }
            }
            if (text === undefined) {
                var keys = safe(function () { return Object.keys(item); }, []).filter(function (k) {
                    return k !== 'id' && k !== 'uid' && k !== 'key' && k !== 'ts' && k !== 'timestamp';
                }).sort();
                var parts = [];
                for (var j = 0; j < keys.length && j < 8; j++) {
                    var pv = safe(function () { return item[keys[j]]; }, null);
                    if (pv == null) continue;
                    parts.push(keys[j] + '=' + (typeof pv === 'object' ? '[o]' : String(pv)));
                }
                text = parts.join('\u0001');
            }
        } else return null;
        var s = String(text == null ? '' : text);
        return {
            len: s.length,
            head: s.slice(0, 24),
            tail: s.length > 24 ? s.slice(-24) : '',
            h: hash32(s),
        };
    }

    function fpEqual(a, b) {
        if (!a || !b) return 'unknown-fingerprint';
        if (a.len !== b.len || a.h !== b.h) return false;
        /* 哈希撞了也不轻易认「一样」：长度与首尾也走一遍（哈希只用来快速排除）。 */
        return (a.head === b.head && a.tail === b.tail);
    }

    /** 取条目 id 的唯一判定口：只认这几种键，且值必须非空。
     *  取不到返回 null ⇒ 调用方**不得**假装按 id 对齐。 */
    var ID_KEYS = ['id', 'uid', 'key', 'mid', 'factId', 'nodeId', 'summaryId'];
    function idOf(item) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        for (var i = 0; i < ID_KEYS.length; i++) {
            var v = safe(function () { return item[ID_KEYS[i]]; }, null);
            if (typeof v === 'string' && v.trim() !== '') return v.trim();
            if (typeof v === 'number' && isFinite(v)) return String(v);
        }
        return null;
    }

    /**
     * 采集一次条目集合摘要（**只读**：不改任何账）。
     * @param {Array<{key:string, label?:string, list:()=>Array}>} ledgers 账本清单（调用方给）
     * @returns {{ok:boolean, reason:string, entries:Object, counts:Object, skippedNoId:number,
     *            truncatedOnto:Object, ledgerCount:number}}
     */
    function collectSummary(ledgers) {
        var out = { ok: false, reason: '', entries: {}, counts: {}, skippedNoId: 0, truncatedOnto: {}, ledgerCount: 0 };
        if (!Array.isArray(ledgers) || !ledgers.length) { out.reason = 'no-ledgers'; return out; }
        var usable = 0;
        for (var i = 0; i < ledgers.length; i++) {
            var L = ledgers[i];
            if (!L || typeof L.key !== 'string' || !L.key || typeof L.list !== 'function') continue;
            var rows = safe(function () { return L.list(); }, null);
            if (!Array.isArray(rows)) { out.reason = out.reason || 'ledger-unreadable:' + L.key; continue; }
            usable++;
            var arr = [];
            var cut = false;
            for (var j = 0; j < rows.length; j++) {
                var id = idOf(rows[j]);
                if (!id) { out.skippedNoId++; continue; }
                if (arr.length >= MAX_ENTRIES_PER_LEDGER) { cut = true; break; }
                arr.push({ id: id, fp: fingerprintOf(rows[j]) });
            }
            out.entries[L.key] = arr;
            out.counts[L.key] = arr.length;
            if (cut) out.truncatedOnto[L.key] = true;
        }
        out.ledgerCount = usable;
        if (!usable) { out.reason = out.reason || 'no-readable-ledger'; return out; }
        out.ok = true;
        return out;
    }

    /**
     * 对拍两份摘要（**纯读**）：给出 added / removed / modified 三类。
     *  ★ modified 只标待复核，**不产出旧值用于回退** —— 结构上就没有「改回去」这条路。
     */
    function diffSummaries(before, after) {
        var res = {
            ok: false, reason: '', comparable: false,
            added: [], removed: [], modified: [],
            counts: { added: 0, removed: 0, modified: 0 },
        };
        if (!before || !after || !before.entries || !after.entries) { res.reason = 'summary-absent'; return res; }
        res.comparable = true;
        var keys = {};
        Object.keys(before.entries).forEach(function (k) { keys[k] = 1; });
        Object.keys(after.entries).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) {
            var A = Array.isArray(before.entries[k]) ? before.entries[k] : [];
            var B = Array.isArray(after.entries[k]) ? after.entries[k] : [];
            var mA = {}; A.forEach(function (e) { mA[e.id] = e.fp; });
            var mB = {}; B.forEach(function (e) { mB[e.id] = e.fp; });
            Object.keys(mB).forEach(function (id) {
                if (!(id in mA)) { res.added.push({ ledger: k, id: id }); return; }
                var cmp = fpEqual(mA[id], mB[id]);
                if (cmp === true) return;
                /* ★ 三态：拿不到指纹 ⇒ unknown-fingerprint（**不**算改动，**也不**算没改）。 */
                res.modified.push({ ledger: k, id: id, why: cmp === false ? 'content-changed' : 'unknown-fingerprint' });
            });
            Object.keys(mA).forEach(function (id) {
                if (!(id in mB)) res.removed.push({ ledger: k, id: id });
            });
        });
        res.counts.added = res.added.length;
        res.counts.removed = res.removed.length;
        res.counts.modified = res.modified.length;
        res.ok = true;
        return res;
    }

    /** 本模块自己持有的快照环（engine 上的槽位是唯一存储，这里只是操作它的函数）。 */
    function readRounds(engine) {
        var arr = safe(function () { return engine._roundSnapshots; }, null);
        return Array.isArray(arr) ? arr : [];
    }

    /**
     * 记一次快照（"本轮开始前" 或 "本轮结束后" 各调一次）。
     * @param {object} engine
     * @param {{phase:'before'|'after', floor?:number, summary:object, seq?:number}} o
     */
    function recordSnapshot(engine, o) {
        var opt = o && typeof o === 'object' ? o : {};
        var phase = String(opt.phase || '');
        if (phase !== 'before' && phase !== 'after') {
            return { ok: false, reason: 'phase-invalid', writes: false, seq: null };
        }
        var sum = opt.summary;
        if (!sum || sum.ok !== true) {
            /* 采集没成功 ⇒ **不记假快照**（记下来会让「本轮新增 0 条」变成一个编出来的结论）。 */
            return { ok: false, reason: 'summary-unavailable:' + (sum && sum.reason ? sum.reason : 'absent'), writes: false, seq: null };
        }
        if (!engine || typeof engine !== 'object') return { ok: false, reason: 'engine-absent', writes: false, seq: null };
        var rounds = readRounds(engine).slice();
        /* ★ 一对一号：同一轮的 before/after 共享同一个 seq。
         *   若按「上一条 seq + 1」算，一轮会被编成两个号（before=1 / after=2），
         *   而面板与 `roundUndoState` 报的是 `after.seq` —— 用户会看到「第 2 轮」
         *   而实际只跑过一轮。故：最后一条是 before ⇒ after 复用它那个 seq。 */
        var last = rounds.length ? rounds[rounds.length - 1] : null;
        var seq;
        if (typeof opt.seq === 'number' && isFinite(opt.seq)) seq = opt.seq;
        else if (phase === 'after' && last && last.phase === 'before') seq = Number(last.seq) || 1;
        else seq = last ? (Number(last.seq) || 0) + 1 : 1;
        rounds.push({
            seq: seq,
            phase: phase,
            floor: (typeof opt.floor === 'number' && isFinite(opt.floor)) ? opt.floor : null,
            ts: Date.now(),
            entries: sum.entries,
            counts: sum.counts,
            skippedNoId: sum.skippedNoId || 0,
            truncated: Object.keys(sum.truncatedOnto || {}).length > 0 ? sum.truncatedOnto : null,
            ledgerCount: sum.ledgerCount,
        });
        while (rounds.length > MAX_ROUNDS) rounds.shift();
        engine._roundSnapshots = rounds;
        return { ok: true, reason: '', writes: true, seq: seq, phase: phase, rounds: rounds.length };
    }

    /** 取"最近一轮"的 before/after 对；缺任一半即如实报缺哪一半（不凑一对）。 */
    function lastRoundPair(engine) {
        var rounds = readRounds(engine);
        /* ★ 两段扫，不许把「找 before」挂在「已找到 after」之下：
         *   那样「记了 before、after 还没记」会落到 missing=['before','after'] ⇒ no-round，
         *   而它其实是 half-round（采集断在半路）。两者对用户意义相反。 */
        var afterIdx = -1;
        for (var i = rounds.length - 1; i >= 0; i--) {
            if (rounds[i].phase === 'after') { afterIdx = i; break; }
        }
        var after = afterIdx >= 0 ? rounds[afterIdx] : null;
        var before = null;
        /* 有 after 时 before 只在**它之前**找：否则会跟「下一轮刚记的 before」错配
         *   （[B1,A1,B2] 必须报 B1/A1 这一对，不是 A1/B2）。 */
        var scanTo = afterIdx >= 0 ? afterIdx : rounds.length;
        for (var j = scanTo - 1; j >= 0; j--) {
            if (rounds[j].phase === 'before') { before = rounds[j]; break; }
        }
        var missing = [];
        if (!before) missing.push('before');
        if (!after) missing.push('after');
        return { before: before, after: after, missing: missing, rounds: rounds.length };
    }

    /**
     * 本轮可撤销清单（**纯读**）：只读最近一轮 before/after 的摘要对拍。
     * ★ `undoable` 只对 added 为 true；modified 恒 false + why（本面不回退修改）。
     */
    function roundUndoState(engine) {
        var absent = function (why) {
            return {
                kind: 'round_undo', version: 0, state: 'unavailable',
                seq: null, floor: null, counts: { added: 0, removed: 0, modified: 0 },
                added: [], modified: [], removed: [],
                writesNothing: true, ok: false, reason: why,
            };
        };
        try {
            var pair = lastRoundPair(engine);
            if (pair.missing.length) {
                /* 「只有半对」与「一对都没有」不同形（前者说明采集到一半断了）。 */
                return {
                    kind: 'round_undo', version: 1, state: pair.missing.length === 2 ? 'no-round' : 'half-round',
                    seq: pair.after ? pair.after.seq : null,
                    floor: pair.after ? pair.after.floor : null,
                    counts: { added: 0, removed: 0, modified: 0 },
                    added: [], modified: [], removed: [],
                    missing: pair.missing,
                    writesNothing: true, ok: true, reason: pair.missing.length === 2 ? '' : 'half-round:' + pair.missing.join('+'),
                };
            }
            /* ★ 第四态 `undone`：这一轮已经**全部**撤过。
             *   [L14-O1] 与 undoRound 的 undoneIds 配套：只把**没有剩余可撤 id** 的轮
             *   报成 undone；还剩的继续走 ok + 剩余 added（已撤 id 不再进清单）。
             *   修前这个标志只被写、从不被读 —— 撤销完再点一次，面板照样报
             *   「新增 3 条可撤」，然后拿三个已不存在的 id 去删，报三个 failed。
             *   用户看到「撤销失败」，而事实是上一次已撤成功。四态必须互不同形。 */
            if (pair.after && pair.after.undone === true) {
                var _d0 = diffSummaries(pair.before, pair.after);
                var _undoneIds = pair.after.undoneIds || {};
                var _remaining = [];
                if (_d0 && _d0.ok) {
                    for (var _i = 0; _i < _d0.added.length; _i++) {
                        var _x = _d0.added[_i];
                        if (!_undoneIds[_x.ledger + '|' + _x.id]) _remaining.push(_x);
                    }
                }
                if (_remaining.length === 0) {
                    return {
                        kind: 'round_undo', version: 1, state: 'undone',
                        seq: pair.after.seq, floor: pair.after.floor,
                        undoneAt: pair.after.undoneAt || null,
                        counts: { added: 0, removed: 0, modified: 0 },
                        added: [], modified: [], removed: [],
                        writesNothing: true, ok: true, reason: 'already-undone',
                    };
                }
                /* 还有剩余 ⇒ 不落 undone 态，落到下面 ok 分支只报剩余 id。 */
            }
            var d = diffSummaries(pair.before, pair.after);
            if (!d.ok) return absent(d.reason || 'diff-failed');
            /* [L14-O1] counts 与清单都是**剩余可撤**口径：已撤掉的 id 从 added 中剔除，
             *   面板不能再把上一次已撤成功的条目报成「还可撤」。
             *   removed/modified 不受 undoneIds 影响（本面从不撤销它们）。 */
            var _leftIds = (pair.after && pair.after.undoneIds) || {};
            var _addedLeft = d.added.filter(function (x) { return !_leftIds[x.ledger + '|' + x.id]; });
            var _countsLeft = { added: _addedLeft.length, removed: d.counts.removed, modified: d.counts.modified };
            return {
                kind: 'round_undo', version: 1, state: 'ok',
                seq: pair.after.seq, floor: pair.after.floor,
                counts: _countsLeft,
                added: _addedLeft.map(function (x) { return { ledger: x.ledger, id: x.id, undoable: true }; }),
                /* ★ removed 不可"撤"回来（正文没存，撤回来等于编造）—— 如实标不可撤销。 */
                removed: d.removed.map(function (x) { return { ledger: x.ledger, id: x.id, undoable: false, why: 'content-not-kept' }; }),
                /* ★ modified 只待复核，**不提供旧值**：结构上就没有回退路径。 */
                modified: d.modified.map(function (x) { return { ledger: x.ledger, id: x.id, undoable: false, why: x.why, pendingReview: true }; }),
                writesNothing: true, ok: true, reason: '',
            };
        } catch (_e) {
            return absent('thrown');
        }
    }

    /**
     * 撤销本轮**新增**条目（唯一写入口）。
     * @param {object} engine
     * @param {{removers:Object<string, (id:string)=>boolean>, confirm?:boolean, seq?:number}} payload
     *   `removers` 由调用方按账给：`{ ledgerKey: (id)=>是否删成功 }`。
     *   ★ 本模块**不自己删账** —— 各账的删除口归各账 owner（本面只决定「删哪些 id」）。
     */
    function undoRound(engine, payload) {
        var bad = function (why) { return { ok: false, reason: why, writes: false, removed: [], failed: [], skipped: [] }; };
        try {
            var p = payload && typeof payload === 'object' ? payload : {};
            /* ★ 二次确认是硬门槛：没有 confirm:true 一律拒绝（误点一次就把整轮写入抹掉）。 */
            if (p.confirm !== true) return bad('confirm-required');
            if (!engine || typeof engine !== 'object') return bad('engine-absent');
            var removers = p.removers;
            if (!removers || typeof removers !== 'object') return bad('removers-required');
            var st = roundUndoState(engine);
            if (st.ok !== true) return bad(st.reason || 'state-unavailable');
            /* ★ 已经撤过这一轮 ⇒ 不重放（理由见 roundUndoState 的第四态）。 */
            if (st.state === 'undone') return bad('already-undone');
            if (st.state !== 'ok') return bad('no-round:' + st.state);
            if (!st.added.length) {
                /* 「本轮没有新增」不是失败，但要与「撤成功了」不同形（writes:false + 专属 reason）。
                 * ★ counts 必须一起给：本函数其余每条返回路径都带它，缺一条就是
                 *   「同一函数返回不同键」—— 调用方统一按 r.counts 读时会在这一条上拿到 undefined。 */
                return {
                    ok: true, reason: 'nothing-to-undo', writes: false,
                    seq: st.seq, removed: [], failed: [], skipped: [],
                    counts: { removed: 0, failed: 0, skipped: 0 },
                };
            }
            var removed = [], failed = [], skipped = [];
            for (var i = 0; i < st.added.length; i++) {
                var row = st.added[i];
                var fn = removers[row.ledger];
                if (typeof fn !== 'function') { skipped.push({ ledger: row.ledger, id: row.id, why: 'no-remover' }); continue; }
                var out = safe(function () { return fn(row.id); }, false);
                if (out === true) removed.push({ ledger: row.ledger, id: row.id });
                else failed.push({ ledger: row.ledger, id: row.id, why: out === false ? 'refused' : 'thrown-or-missing' });
            }
            /* ★ 撤销后必须把最近这一轮标成已撤销：否则再点一次会拿同一批 id 重放，
             *   而那时 id 已经不存在 —— 报一堆 failed 反而像是缺陷。
             *   [L14-O1] 但只标**已成功移除的 id**（undoneIds）；撤完最后一粒才置
             *   undone。修前 removed.length 非零就把整轮标 undone，partial 后
             *   用户修好原因重试会永远撞 already-undone —— 失败的 id 从此无法
             *   撤销，违背 E3「partial 不静默算成功」口径。 */
            if (removed.length) {
                var rounds = readRounds(engine).slice();
                for (var k = rounds.length - 1; k >= 0; k--) {
                    if (rounds[k].phase === 'after' && rounds[k].seq === st.seq) {
                        var rec = rounds[k];
                        rec.undoneIds = rec.undoneIds || {};
                        for (var m = 0; m < removed.length; m++) {
                            rec.undoneIds[removed[m].ledger + '|' + removed[m].id] = true;
                        }
                        rec.undoneAt = Date.now();
                        /* [L14-O1] totalAdded 取 max：partial 重试时 st.added 已是剩余口径，
                         *   直接赋值会缩水，导致「撤完剩余却不算撤完」。 */
                        rec.totalAdded = Math.max(rec.totalAdded || 0, st.added.length);
                        var undoneCount = 0;
                        for (var kk in rec.undoneIds) { if (rec.undoneIds[kk]) undoneCount++; }
                        if (undoneCount >= rec.totalAdded) rec.undone = true;
                        break;
                    }
                }
                engine._roundSnapshots = rounds;
            }
            return {
                ok: failed.length === 0,
                reason: failed.length === 0 ? '' : 'partial',
                writes: removed.length > 0,
                seq: st.seq,
                removed: removed, failed: failed, skipped: skipped,
                counts: { removed: removed.length, failed: failed.length, skipped: skipped.length },
            };
        } catch (_e) { return bad('thrown'); }
    }

    var api = {
        VERSION: VERSION,
        MAX_ENTRIES_PER_LEDGER: MAX_ENTRIES_PER_LEDGER,
        MAX_ROUNDS: MAX_ROUNDS,
        fingerprintOf: fingerprintOf,
        fpEqual: fpEqual,
        idOf: idOf,
        collectSummary: collectSummary,
        diffSummaries: diffSummaries,
        recordSnapshot: recordSnapshot,
        lastRoundPair: lastRoundPair,
        roundUndoState: roundUndoState,
        undoRound: undoRound,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof global !== 'undefined') global.LonShaRoundEntrySnapshot = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
