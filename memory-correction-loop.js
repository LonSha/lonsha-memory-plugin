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

    /** [v4.160.0 · R25-O4] 纠错幂等键：同一人同一条目同一改法只落一次修订。
     *   字段按固定顺序序列化（不靠对象键序），因此「文本一样但键序不同」也不会双计。
     */
    function correctionKey(target, p) {
        var k = [String(target), String(p.action || "")];
        if (p.text !== undefined) k.push("text=" + String(p.text));
        if (p.owner !== undefined) k.push("owner=" + String(p.owner));
        if (p.at !== undefined) k.push("at=" + String(p.at));
        if (p.type !== undefined) k.push("type=" + String(p.type));
        if (p.void === true) k.push("void=1");
        return k.join("|");
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
        var key = correctionKey(target, p);
        var dup = arr(next.revisions[target]).filter(function (r) { return r && r.key === key; })[0];
        if (dup) {
            return { ok: true, status: "same", revision: dup.version, key: key, store: next, memory: clone(mem) };
        }
        if (mem.voided && p.void !== false) {
            return { ok: false, bad: ["already-voided"], store: next };
        }
        var revision = {
            key: key,
            patch: clone(p),
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
        if (rev.rolledBack === true) return { ok: true, status: "same", store: s, memory: clone(s.memories[idx]) };
        next.memories[idx] = clone(rev.before);
        if (!Array.isArray(next.revisions[target])) next.revisions[target] = [];
        next.revisions[target].push({
            id: target, version: arr(next.revisions[target]).length + 1,
            key: "rollback|to=" + v, patch: { rollback: v }, rollbackOf: v,
            action: "rollback", at: "", before: clone(rev.after || {}), after: clone(rev.before)
        });
        next.receipts.push({ kind: "correction", id: target, action: "rollback", version: v, at: "" });
        var back = arr(next.revisions[target]).filter(function (r) { return r.version === v; })[0];
        if (back) back.rolledBack = true;
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

    /* ================= R26-O4 纠错审计包 =================
     * 纠错有历史，但没法交出去。审计包只带「一条的修订链」：
     *   带幂等键、带回滚痕迹、带校验和；别人拿到能校验、能重放，不需要全库。
     */
    var AUDIT_VERSION = 1;

    /** 32 位 FNV-1a：只用来「改一个字就对不上」，不当密码学用。 */
    function fnvOf(s) {
        var str = String(s), h = 0x811c9dc5;
        for (var i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ("0000000" + h.toString(16)).slice(-8);
    }

    /** 一条修订对应的可重放指令（老修订没存 patch 就按 before/after 差集推）。 */
    function patchOfRevision(r) {
        if (r && r.patch && typeof r.patch === "object") return clone(r.patch);
        var b = (r && r.before) || {}, a = (r && r.after) || {}, p = {};
        if (r && r.action === "rollback") { p.rollback = Number(r.rollbackOf); return p; }
        if (a.voided === true && b.voided !== true) { p.void = true; return p; }
        if (a.text !== b.text) p.text = a.text;
        if (a.owner !== b.owner) p.owner = a.owner;
        if (a.at !== b.at) p.at = a.at;
        if (a.type !== b.type) p.type = a.type;
        return p;
    }

    function chainOfRevisions(log) {
        return arr(log).map(function (r) {
            return {
                version: Number(r.version),
                action: String(r.action || ""),
                at: String(r.at || ""),
                key: String(r.key || ""),
                rolledBack: r.rolledBack === true,
                rollbackOf: r.rollbackOf === undefined ? null : Number(r.rollbackOf),
                patch: patchOfRevision(r),
                before: clone(r.before || null),
                after: clone(r.after || null)
            };
        });
    }

    /** 校验和只能算「身份 + 版本 + 链」，因此有人改链里一个字符就对不上。 */
    function auditChecksum(pack) {
        var p = pack && typeof pack === "object" ? pack : {};
        return fnvOf(JSON.stringify({ id: String(p.id), version: Number(p.version), chain: arr(p.chain) }));
    }

    /** 按条目导出修订链。查不到条目就明说 not-found，不造一条空链冒充「没改过」。 */
    function auditPack(store, id) {
        var s = emptyStore(store);
        var target = String(id);
        var mem = s.memories.filter(function (m) { return idOf(m) === target; })[0];
        if (!mem) return { ok: false, bad: ["not-found"], version: AUDIT_VERSION, id: target, chain: [], count: 0, checksum: "", empty: true };
        var chain = chainOfRevisions(arr(s.revisions[target]));
        var pack = { ok: true, version: AUDIT_VERSION, id: target, chain: chain, count: chain.length };
        pack.checksum = auditChecksum(pack);
        pack.rolledBackVersions = chain.filter(function (r) { return r.rolledBack; }).map(function (r) { return r.version; });
        pack.keys = chain.map(function (r) { return r.key; });
        pack.empty = chain.length === 0;
        return pack;
    }

    /** 版本与校验和任一不符即拒收。 */
    function verifyAuditPack(pack) {
        if (!pack || typeof pack !== "object" || !Array.isArray(pack.chain)) return { ok: false, bad: ["not-an-audit-pack"] };
        if (Number(pack.version) !== AUDIT_VERSION) return { ok: false, bad: ["version-mismatch"] };
        if (auditChecksum(pack) !== String(pack.checksum)) return { ok: false, bad: ["checksum-mismatch"] };
        return { ok: true, id: String(pack.id), count: pack.chain.length };
    }

    /** 重放：从链头的 before 出发再走一遍，比对 (版本, 动作, 幂等键) 序列是否原样复现。
     *  同一幂等键出现第二次不重复落（记 skipped）——引擎本身产不出这种包，出现就是有人手改过。
     */
    function replayAudit(pack) {
        var v = verifyAuditPack(pack);
        if (!v.ok) return { ok: false, bad: v.bad, chain: [], applied: 0, skipped: 0, duplicateKeys: [], final: null };
        var chain = arr(pack.chain);
        var id = String(pack.id);
        if (!chain.length) return { ok: true, empty: true, chain: [], applied: 0, skipped: 0, duplicateKeys: [], final: null };
        var seed = chain[0].before;
        if (!seed || typeof seed !== "object") return { ok: false, bad: ["chain-head-before-missing"], chain: [], applied: 0, skipped: 0, duplicateKeys: [] };
        var store = { memories: [clone(seed)], revisions: {}, receipts: [] };
        var built = [], applied = 0, skipped = 0, dup = [], seen = {}, broken = null;
        for (var i = 0; i < chain.length; i++) {
            var row = chain[i];
            var patch = patchOfRevision(row);
            var key = String(row.key || correctionKey(id, patch));
            if (seen[key]) { dup.push(key); skipped += 1; continue; }
            seen[key] = true;
            var res;
            if (patch.rollback !== undefined && patch.rollback !== null) res = rollback(store, id, patch.rollback);
            else res = applyCorrection(store, id, patch, { at: row.at });
            if (!res.ok) { broken = ["replay-broke@" + row.version].concat(arr(res.bad)); break; }
            if (res.status === "same") { skipped += 1; continue; }
            store = res.store;
            applied += 1;
            built.push({ version: row.version, action: row.action, key: key });
        }
        var mismatches = broken ? [broken[0]] : [];
        if (!broken) {
            chain.forEach(function (row, idx) {
                var got = built[idx];
                if (!got) { mismatches.push("missing@" + row.version); return; }
                if (got.version !== row.version) mismatches.push("version@" + row.version);
                else if (got.action !== row.action) mismatches.push("action@" + row.version);
                else if (String(row.key) !== got.key) mismatches.push("key@" + row.version);
            });
        }
        return {
            ok: mismatches.length === 0, bad: mismatches.slice(), broken: broken,
            chain: built, applied: applied, skipped: skipped, duplicateKeys: dup,
            final: store.memories.length ? clone(store.memories[0]) : null
        };
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
        ACTIONS: ACTIONS, AUDIT_VERSION: AUDIT_VERSION,
        impact: impact, applyCorrection: applyCorrection, rollback: rollback, correctionKey: correctionKey,
        auditPack: auditPack, verifyAuditPack: verifyAuditPack, replayAudit: replayAudit, auditChecksum: auditChecksum,
        recall: recall, history: history,
        correctionSelfCheck: correctionSelfCheck
    };
}));
