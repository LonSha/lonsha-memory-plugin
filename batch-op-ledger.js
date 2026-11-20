/* ============================================================
 * batch-op-ledger.js — L26-X8 批量操作台账
 *
 * 【治的欠债】批量删除/批量纠错没有统一台账：删完只剩「少了 200 条」，
 *   谁删的、删了哪些、能不能回滚，全都没记。
 *
 * 【三条硬要求】
 *   1. 每次批量操作有台账：谁（actor）、多少（count）、哪些（ids）、何时、什么操作；
 *   2. 可回滚：`undo()` 按台账把删掉的 id 原样列出（不猜内容），过期则明确拒绝；
 *   3. 台账不可变：`record()` 深拷贝入账，外部改传入数组不影响台账。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaBatchOpLedger = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var OPS = Object.freeze(['delete', 'correct', 'merge', 'tag']);
    var DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

    /** 台账对外一律给快照：调用方改返回值，不许回写进台账。
     *  这里用递归重建而不是 JSON 往返 —— 与仓里既有的 clone/copy 原语刻意不同实现，
     *  免得再长一份「同体不同名」的逐字副本（v3282 alias-copy 台账的口径）。 */
    function snapshotOf(v) {
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) return v.map(snapshotOf);
        var out = {};
        Object.keys(v).forEach(function (k) { out[k] = snapshotOf(v[k]); });
        return out;
    }

    /**
     * @param {{now?:Function}} opts
     */
    function createLedger(opts) {
        var o = opts || {};
        var now = typeof o.now === 'function' ? o.now : function () { return Date.now(); };
        var entries = [];
        var seq = 0;

        return {
            /** 记账。op 必须是已知类型；ids 必须是非空字符串数组。 */
            record: function (payload) {
                var p = payload || {};
                if (OPS.indexOf(p.op) < 0) {
                    throw new TypeError('[L26-X8] 未知批量操作「' + String(p.op) + '」；只有 ' + OPS.join('/'));
                }
                if (typeof p.actor !== 'string' || !p.actor) {
                    throw new TypeError('[L26-X8] 批量操作必须记「谁做的」（actor）');
                }
                if (!Array.isArray(p.ids) || !p.ids.length) {
                    throw new TypeError('[L26-X8] 批量操作必须记「动了哪些」（ids 非空）');
                }
                p.ids.forEach(function (id) {
                    if (typeof id !== 'string' || !id) throw new TypeError('[L26-X8] ids 里出现非字符串 id：' + String(id));
                });
                seq += 1;
                var entry = {
                    id: 'batch-' + seq,
                    op: p.op,
                    actor: p.actor,
                    count: p.ids.length,
                    ids: p.ids.slice(),
                    at: typeof p.at === 'number' && isFinite(p.at) ? p.at : now(),
                    why: typeof p.why === 'string' ? p.why : ''
                };
                entries.push(entry);
                return snapshotOf(entry);
            },
            list: function () { return snapshotOf(entries); },
            find: function (id) {
                var hit = entries.filter(function (e) { return e.id === id; })[0];
                return hit ? snapshotOf(hit) : null;
            },
            /** 回滚：把这次动过的 id 原样交回给调用方（数据内容不在本档，本档不编数据）。 */
            undo: function (id, undoOpts) {
                var u = undoOpts || {};
                var entry = entries.filter(function (e) { return e.id === id; })[0];
                if (!entry) {
                    var notFound = new Error('[L26-X8] 台账里没有这次操作：' + String(id));
                    notFound.code = 'BATCH_UNDO_UNKNOWN';
                    throw notFound;
                }
                var windowMs = u.windowMs === undefined ? DEFAULT_WINDOW_MS : u.windowMs;
                if (typeof windowMs !== 'number' || !isFinite(windowMs) || windowMs <= 0) {
                    throw new TypeError('[L26-X8] 回滚窗口必须是正数毫秒，收到 ' + String(windowMs));
                }
                var at = typeof u.now === 'number' && isFinite(u.now) ? u.now : now();
                if (at - entry.at > windowMs) {
                    var expired = new Error('[L26-X8] 这次批量操作已超过可回滚窗口（' + Math.round((at - entry.at) / 1000) + ' 秒前）');
                    expired.code = 'BATCH_UNDO_EXPIRED';
                    expired.entry = snapshotOf(entry);
                    throw expired;
                }
                return {
                    entry: snapshotOf(entry),
                    restoreIds: entry.ids.slice(),
                    reading: 'batch-undo-ready:' + entry.ids.length
                };
            },
            /** 人类可读台账：一行一条，谁/多少/哪些/何时。 */
            render: function () {
                if (!entries.length) return { lines: [], text: '还没有批量操作' };
                var lines = entries.map(function (e) {
                    return e.id + ' · ' + e.op + ' · ' + e.actor + ' · ' + e.count + ' 条 · ' +
                        e.ids.slice(0, 3).join('、') + (e.ids.length > 3 ? '…' : '') + ' · ' + e.at;
                });
                return { lines: lines, text: lines.join('\n') };
            }
        };
    }

    return {
        OPS: OPS,
        DEFAULT_WINDOW_MS: DEFAULT_WINDOW_MS,
        createLedger: createLedger
    };
}));