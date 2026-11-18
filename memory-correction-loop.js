/* ============================================================
 * memory-correction-loop.js — R24-X4 纠错闭环：用户改一条，召回真的变
 *
 * 【治的欠债】recall-correction / fact-correction-transaction / memory-revision-history
 *   **机制齐备，但没有用户入口**。用户看到「记错了」，只能重置整个会话。
 *
 * 【四类动作】改内容 / 改归属人物 / 改时间 / 作废（void）。
 * 【即时生效】编辑后的下一次召回就用新内容（不是「下次重建索引后」），并标记 correctedByUser。
 * 【可回滚】每次编辑进修订历史；回滚到任一版，内容与当时**逐字段一致**。
 * 【影响面】编辑后告诉用户「这条被召回过 N 次，最近一次在第 M 轮」。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaCorrectionLoop = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ACTIONS = Object.freeze(["edit", "owner", "time", "void"]);

    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function idOf(m) { return String(m && m.id); }
    function tokenize(t) {
        var s = String(t || "").toLowerCase(), out = [];
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if ((c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf)) { out.push(s.charAt(i)); if (i + 1 < s.length) out.push(s.substr(i, 2)); }
            else if ((c >= 48 && c <= 57) || (c >= 97 && c <= 122)) out.push(s.charAt(i));
        }
        return out;
    }

    function emptyStore(input) {
        var s = input && typeof input === "object" ? input : {};
        return {
            memories: arr(s.memories),
            revisions: s.revisions && typeof s.revisions === "object" ? s.revisions : {},
            receipts: arr(s.receipts)
        };
    }

    /** 影响面：这条被召回过几次、最近一次在第几轮。 */
    function impact(store, id) {
        var s = emptyStore(store);
        var target = String(id);
        var hits = arr(s.receipts).filter(function (r) {
            return r && r.kind === "recall" && arr(r.ids).map(String).indexOf(target) !== -1;
        });
        var last = hits.length ? hits[hits.length - 1] : null;
        return {
            recalledTimes: hits.length,
            lastRound: last ? (last.round === undefined ? null : last.round) : null,
            note: hits.length
                ? "这条此前被召回过 " + hits.length + " 次，最近一次在第 " + (last.round === undefined ? "?" : last.round) + " 轮"
                : "这条还没被召回过，改了也不会影响历史输出",
            historyMatched: hits.length
        };
    }

    /** 应用一次纠正（纯函数：返回新库 + 修订号）。 */
    function applyCorrection(store, id, patch, options) {
        var s = emptyStore(store);
        var o = options && typeof options === "object" ? options : {};
        var target = String(id);
        var p = patch && typeof patch === "object" ? patch : {};
        var next = clone(s);
        var idx = -1;
        for (var i = 0; i < next.memories.length; i++) { if (idOf(next.memories[i]) === target) { idx = i; break; } }
        if (idx === -1) return { ok: false, bad: ["not-found"], store: next };
        var mem = next.memories[idx];
        if (mem.voided && p.void !== false) {
            return { ok: false, bad: ["already-voided"], store: next };
        }
        var revision = {
            id: target,
            version: arr(next.revisions[target]).length + 1,
            at: String(o.at || ""),
            action: String(p.action || (p.void === true ? "void" : p.owner !== undefined ? "owner" : p.at ? "time" : "edit")),
            before: clone(mem)
        };
        if (!Array.isArray(next.revisions[target])) next.revisions[target] = [];
        next.revisions[target].push(revision);
        if (p.void === true) {
            mem.voided = true;
            mem.voidedAt = String(o.at || "");
        } else {
            if (p.text !== undefined) mem.text = String(p.text);
            if (p.owner !== undefined) { mem.owner = String(p.owner); mem.persons = [String(p.owner)]; }
            if (p.at !== undefined) mem.at = String(p.at);
            if (p.type !== undefined) mem.type = String(p.type);
            mem.correctedByUser = true;
        }
        var after = clone(mem);
        revision.after = after;
        next.receipts.push({ kind: "correction", id: target, action: revision.action, version: revision.version, at: revision.at });
        return {
            ok: true, id: target, version: revision.version, action: revision.action,
            memory: after, store: next,
            impact: impact(s, target)
        };
    }

    /** 回滚到某一版（逐字段一致）。 */
    function rollback(store, id, version) {
        var s = emptyStore(store);
        var target = String(id);
        var log = arr(s.revisions[target]);
        var v = Number(version);
        var rev = log.filter(function (r) { return r.version === v; })[0];
        if (!rev) return { ok: false, bad: ["no-such-version"], store: s };
        var next = clone(s);
        var idx = -1;
        for (var i = 0; i < next.memories.length; i++) { if (idOf(next.memories[i]) === target) { idx = i; break; } }
        if (idx === -1) return { ok: false, bad: ["not-found"], store: next };
        next.memories[idx] = clone(rev.before);
        if (!Array.isArray(next.revisions[target])) next.revisions[target] = [];
        next.revisions[target].push({
            id: target, version: arr(next.revisions[target]).length + 1,
            action: "rollback", at: "", before: clone(rev.after || {}), after: clone(rev.before)
        });
        next.receipts.push({ kind: "correction", id: target, action: "rollback", version: v, at: "" });
        return { ok: true, store: next, memory: clone(rev.before), restoredVersion: v };
    }

    /** 召回：作废的不参与，改过的用新内容（即时生效）。 */
    function recall(store, query, options) {
        var s = emptyStore(store);
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) > 0 ? Number(o.k) : 10;
        var terms = tokenize(query);
        var out = [];
        s.memories.forEach(function (m) {
            if (m.voided) return;
            var toks = tokenize(m.text);
            var hit = 0;
            terms.forEach(function (t) { if (toks.indexOf(t) !== -1) hit += 1; });
            if (!hit) return;
            out.push({ id: idOf(m), score: Number((hit / (toks.length || 1)).toFixed(6)), correctedByUser: !!m.correctedByUser });
        });
        out.sort(function (x, y) { if (y.score !== x.score) return y.score - x.score; return x.id < y.id ? -1 : 1; });
        return { ok: true, results: out.slice(0, k), scanned: s.memories.length };
    }

    function history(store, id) {
        var s = emptyStore(store);
        return arr(s.revisions[String(id)]).map(function (r) {
            return { version: r.version, action: r.action, at: r.at };
        });
    }

    function correctionSelfCheck() {
        var bad = [];
        if (ACTIONS.length !== 4) bad.push("actions");
        var base = {
            memories: [{ id: "m1", text: "他在车站答应要回来", owner: "陈舟", at: "2026-11-01T00:00:00Z" }],
            receipts: [{ kind: "recall", ids: ["m1"], round: 7 }],
            revisions: {}
        };
        var a = applyCorrection(base, "m1", { text: "他在海边答应要回来" }, { at: "2026-11-18" });
        if (!a.ok || a.version !== 1) bad.push("edit");
        var r1 = recall(a.store, "海边");
        if (!r1.results.some(function (x) { return x.id === "m1"; })) bad.push("immediate-recall");
        var r0 = recall(a.store, "车站");
        if (r0.results.some(function (x) { return x.id === "m1"; })) bad.push("old-content-still-recalled");
        if (a.impact.recalledTimes !== 1 || a.impact.lastRound !== 7) bad.push("impact");
        var b = applyCorrection(a.store, "m1", { owner: "林夏" }, { at: "2026-11-18" });
        if (!b.ok || b.memory.owner !== "林夏") bad.push("owner");
        var c = applyCorrection(b.store, "m1", { void: true }, { at: "2026-11-18" });
        if (!c.ok) bad.push("void");
        var rv = recall(c.store, "海边");
        if (rv.results.length !== 0) bad.push("void-still-recalled");
        var rb = rollback(c.store, "m1", 1);
        if (!rb.ok || rb.memory.text !== "他在车站答应要回来") bad.push("rollback");
        if (rb.memory.voided) bad.push("rollback-voided");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "actions=4 history=" + history(c.store, "m1").length + " impact=" + a.impact.recalledTimes + " rollback=v1"
        };
    }

    return {
        ACTIONS: ACTIONS,
        impact: impact, applyCorrection: applyCorrection, rollback: rollback,
        recall: recall, history: history,
        correctionSelfCheck: correctionSelfCheck
    };
}));
