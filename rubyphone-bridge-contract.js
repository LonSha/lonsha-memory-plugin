/* ============================================================
 * rubyphone-bridge-contract.js — L26-X2 与 RubyPhone 互通（对应 R26-X2）
 *
 * 【治的欠债】同一段对话两仓各记一份、互不知情。用户在手机上说完，插件里
 *   再记一遍；两边内容一旦不同，谁也不知道该信哪份。
 *
 * 【三条硬要求】
 *   1. 同一段对话两边都能查到（按 `messageId` 对，不按文本猜）；
 *   2. 差异可列出：字段级 `{local, remote}`，不许只报「有冲突」；
 *   3. **不静默覆盖**：合并保留本地值并在 conflicts 里点名，取远端要用户显式选；
 *      双仓同轮验收：只有两侧都查到同一条 messageId 才算通过。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRubyphoneBridgeContract = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SOURCES = Object.freeze(['ruby-phone', 'lonsha']);

    function keyOf(rec) {
        var k = rec && (rec.messageId || rec.msgId || rec.id);
        return typeof k === 'string' && k ? k : null;
    }

    /** 统一成互通记录：手机仓的字段名与本仓不同，入口收一次，后面不再判断来源。 */
    function toSharedRecord(rec, source) {
        var r = rec || {};
        var k = keyOf(r);
        if (!k) throw new TypeError('[L26-X2] 记录没有 messageId，无法互通（不许靠文本相似度猜身份）');
        var at = r.at === undefined ? r.timestamp : r.at;
        return {
            messageId: k,
            chatId: r.chatId === undefined ? null : r.chatId,
            text: String(r.text === undefined ? (r.content === undefined ? '' : r.content) : r.text),
            at: typeof at === 'number' && isFinite(at) ? at : null,
            source: SOURCES.indexOf(source) >= 0 ? source : 'lonsha'
        };
    }

    function index(list, source) {
        var map = {};
        (Array.isArray(list) ? list : []).forEach(function (row) {
            var rec = toSharedRecord(row, source);
            map[rec.messageId] = rec;
        });
        return map;
    }

    function diffFields(a, b) {
        var out = [];
        ['chatId', 'text', 'at'].forEach(function (f) {
            if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
                out.push({ field: f, local: a[f], remote: b[f] });
            }
        });
        return out;
    }

    /** 对账：两边都有的 / 只在一边的，分开列（差异可列出）。 */
    function match(local, remote) {
        var l = index(local, 'lonsha');
        var r = index(remote, 'ruby-phone');
        var matched = [];
        var conflicts = [];
        Object.keys(l).forEach(function (id) {
            if (!r[id]) return;
            var df = diffFields(l[id], r[id]);
            matched.push({ messageId: id, fields: df.length });
            if (df.length) conflicts.push({ messageId: id, fields: df });
        });
        return {
            matched: matched,
            conflicts: conflicts,
            onlyLocal: Object.keys(l).filter(function (id) { return !r[id]; }),
            onlyRemote: Object.keys(r).filter(function (id) { return !l[id]; }),
            reading: Object.keys(l).length && Object.keys(r).length && matched.length
                ? (conflicts.length ? ('bridge-diff:' + conflicts.length) : 'bridge-in-sync')
                : 'bridge-single-side'
        };
    }

    /** 合并：默认保留本地；`prefer:'remote'` 需调用方显式给。 */
    function merge(local, remote, opts) {
        var o = opts || {};
        var prefer = o.prefer === 'remote' ? 'remote' : 'local';
        var l = index(local, 'lonsha');
        var r = index(remote, 'ruby-phone');
        var out = [];
        var conflicts = [];
        Object.keys(l).forEach(function (id) { out.push(l[id]); });
        Object.keys(r).forEach(function (id) {
            if (!l[id]) {
                out.push(r[id]);
                return;
            }
            var df = diffFields(l[id], r[id]);
            if (!df.length) return;
            conflicts.push({ messageId: id, kept: prefer, fields: df });
            if (prefer === 'remote') {
                var idx = out.findIndex(function (x) { return x.messageId === id; });
                out[idx] = r[id];
            }
        });
        var err = null;
        if (conflicts.length && o.strict) {
            err = new Error('[L26-X2] 双仓内容不一致：' + conflicts.map(function (c) { return c.messageId; }).join('、'));
            err.code = 'BRIDGE_CONFLICT';
            err.conflicts = conflicts;
        }
        return {
            records: out,
            count: out.length,
            conflicts: conflicts,
            prefer: prefer,
            error: err,
            reading: conflicts.length ? ('bridge-merged-with-conflicts:' + conflicts.length) : 'bridge-merged'
        };
    }

    /**
     * 双仓同轮验收：单边完成判未交付（路线图 §4 纪律 2）。
     * @param {{local:Array, remote:Array, probeIds:string[]}} opts
     */
    function acceptance(opts) {
        var o = opts || {};
        var l = index(o.local, 'lonsha');
        var r = index(o.remote, 'ruby-phone');
        var ids = Array.isArray(o.probeIds) && o.probeIds.length
            ? o.probeIds
            : Object.keys(l).filter(function (id) { return !!r[id]; });
        var checks = ids.map(function (id) {
            return { messageId: id, inLocal: !!l[id], inRemote: !!r[id], ok: !!(l[id] && r[id]) };
        });
        var failed = checks.filter(function (c) { return !c.ok; });
        return {
            checks: checks,
            failed: failed,
            ok: checks.length > 0 && failed.length === 0,
            reading: checks.length === 0
                ? 'bridge-no-shared-message'
                : (failed.length ? 'bridge-single-side:' + failed.map(function (c) { return c.messageId; }).join(',') : 'bridge-both-sides-ok')
        };
    }

    return {
        SOURCES: SOURCES,
        toSharedRecord: toSharedRecord,
        diffFields: diffFields,
        match: match,
        merge: merge,
        acceptance: acceptance
    };
}));