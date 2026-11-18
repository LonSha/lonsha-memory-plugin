/* ============================================================
 * privacy-forgetting-proof.js — R24-X5 遗忘权与隐私面
 *
 * 【治的欠债】O8 给了删除机制，但用户需要的是一整套**权利面**：
 *   知道存了什么 → 能导出 → 能删 → 能证明删干净了。现在只有开发者能进控制台。
 *
 * 【四档删除】单条 / 某人物 / 某时间段 / 全部。每档都返回「删了什么、保留什么」。
 * 【删除回执】条数 + 涉及面 + 校验摘要（确定性摘要，用户可留底比对）。
 * 【脱敏】导出时人物名换占位符（用于反馈问题）。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaForgettingProof = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var SCOPES = Object.freeze(["one", "person", "range", "all"]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function idOf(m) { return String(m && m.id); }
    function tsOf(m) { var n = Date.parse(m && (m.at || m.createdAt) || ""); return Number.isFinite(n) ? n : 0; }
    function has(hay, needle) { return String(hay || "").indexOf(String(needle || "")) !== -1; }

    function store(input) {
        var s = input && typeof input === "object" ? input : {};
        return { memories: arr(s.memories), receipts: arr(s.receipts) };
    }

    /** 确定性摘要（不用 crypto，也不依赖宿主）：同输入必得同摘要。 */
    function digest(ids) {
        var list = arr(ids).map(String).sort();
        var h = 2166136261;
        for (var i = 0; i < list.length; i++) {
            var s = list[i];
            for (var j = 0; j < s.length; j++) { h ^= s.charCodeAt(j); h = (h * 16777619) >>> 0; }
        }
        return "d-" + list.length + "-" + h.toString(16);
    }

    /** [v4.160.0 · R25-O6] 删完立刻重建索引：索引是第二份真源，不重建就等于没删干净。
     *   index 由调用方注入（不为了一行代码把这个模块和倒排索引绑死）。
     */
    function forgetAndRebuild(storeIn, scope, target, options) {
        var o = options && typeof options === "object" ? options : {};
        var r = forget(storeIn, scope, target, o);
        if (!r.ok) return r;
        var idx = o.index && typeof o.index === "object" ? o.index : null;
        var rebuilt = null, indexVersion = 0;
        if (idx && typeof idx.rebuild === "function") {
            var docs = arr(r.store && r.store.memories).map(function (m) {
                return { id: String(m.id), text: String(m.text || "") };
            });
            rebuilt = idx.rebuild(docs);
            indexVersion = arr(docs).length;
        }
        var receipt = r.receipt || {};
        receipt.indexVersion = indexVersion;
        receipt.rebuilt = rebuilt ? true : false;
        return { ok: true, store: r.store, receipt: receipt, index: rebuilt ? rebuilt.index : null, indexVersion: indexVersion, removed: r.removed }; 
    }

    /** [v4.160.0 · R25-O6] 导出/备份面审计：删过的句子不得在导出文本里残留。 */
    function auditExport(storeIn, needles, options) {
        var o = options && typeof options === "object" ? options : {};
        var s = store(storeIn);
        var ex = exportJSON(s, Object.assign({}, o, { all: true }));
        var text = JSON.stringify(ex);
        var leaks = arr(needles).map(String).filter(function (n) { return n && text.indexOf(n) !== -1; });
        return { ok: leaks.length === 0, leaks: leaks, bytes: text.length };
    }

    /** 我的记忆清单：搜 / 模 / 分页。 */
    function list(storeIn, options) {
        var s = store(storeIn);
        var o = options && typeof options === "object" ? options : {};
        var rows = s.memories.filter(function (m) {
            if (o.person && arr(m.persons).map(String).indexOf(String(o.person)) === -1 && String(m.owner || "") !== String(o.person)) return false;
            if (o.from && tsOf(m) < Date.parse(o.from)) return false;
            if (o.to && tsOf(m) > Date.parse(o.to)) return false;
            if (o.query && !has(m.text, o.query)) return false;
            return true;
        });
        rows.sort(function (x, y) { if (tsOf(x) !== tsOf(y)) return tsOf(y) - tsOf(x); return idOf(x) < idOf(y) ? -1 : 1; });
        var page = Math.max(1, Number(o.page) || 1);
        var size = Math.max(1, Number(o.size) || 20);
        var slice = rows.slice((page - 1) * size, page * size);
        return { ok: true, total: rows.length, page: page, size: size, pages: Math.ceil(rows.length / size) || 1, items: slice };
    }

    /** 导出：人类可读 JSON（含原文出处），可脱敏。 */
    function exportJSON(storeIn, options) {
        var s = store(storeIn);
        var o = options && typeof options === "object" ? options : {};
        var rows = list(s, o).items;
        if (o.all === true) rows = list(s, Object.assign({}, o, { page: 1, size: 100000 })).items;
        var names = {};
        rows.forEach(function (m) { arr(m.persons).forEach(function (p) { names[String(p)] = true; }); if (m.owner) names[String(m.owner)] = true; });
        var nameList = Object.keys(names).sort();
        function mask(text) {
            var t = String(text || "");
            if (o.desensitize !== true) return t;
            nameList.forEach(function (n, i) { t = t.split(n).join("人物" + (i + 1)); });
            return t;
        }
        return {
            ok: true,
            version: "v4.158.0",
            exportedAt: String(o.at || ""),
            desensitized: o.desensitize === true,
            count: rows.length,
            memories: rows.map(function (m) {
                return {
                    id: idOf(m), at: String(m.at || ""),
                    text: mask(m.text),
                    persons: arr(m.persons).map(function (p) { return o.desensitize === true ? mask(p) : String(p); }),
                    source: { sessionId: String(m.sessionId || ""), floor: m.floor === undefined ? null : m.floor }
                };
            })
        };
    }

    /** 四档删除 + 回执。 */
    function forget(storeIn, scope, target, options) {
        var s = store(storeIn);
        var o = options && typeof options === "object" ? options : {};
        var sc = SCOPES.indexOf(String(scope)) !== -1 ? String(scope) : null;
        if (!sc) return { ok: false, bad: ["unknown-scope"], store: clone(s) };
        var t = target && typeof target === "object" ? target : {};
        var keep = [];
        var gone = [];
        s.memories.forEach(function (m) {
            var del = false;
            if (sc === "all") del = true;
            else if (sc === "one") del = idOf(m) === String(t.id);
            else if (sc === "person") del = arr(m.persons).map(String).indexOf(String(t.person)) !== -1 || String(m.owner || "") === String(t.person);
            else if (sc === "range") del = tsOf(m) >= Date.parse(t.from || 0) && tsOf(m) <= Date.parse(t.to || 0);
            if (del) gone.push(idOf(m)); else keep.push(m);
        });
        var next = { memories: keep, receipts: s.receipts.slice() };
        var receipt = {
            ok: true,
            scope: sc,
            deletedCount: gone.length,
            deletedIds: gone.slice().sort(),
            surfaces: ["body", "index", "summary", "receipt"],
            digest: digest(gone),
            what: scopeExplain(sc, t),
            at: String(o.at || "")
        };
        next.receipts.push({ kind: "forget", scope: sc, deleted: gone.length, digest: receipt.digest });
        return { ok: true, store: next, receipt: receipt };
    }

    function scopeExplain(sc, t) {
        if (sc === "one") return "删掉这一条的正文与引用，保留其他记忆。";
        if (sc === "person") return "删掉与 " + String(t.person) + " 相关的全部记忆，保留其他人物的。";
        if (sc === "range") return "删掉 " + String(t.from) + " 至 " + String(t.to) + " 之间的记忆，保留此段之外的。";
        return "删掉全部记忆（不可恢复），但保留删除回执供核对。";
    }

    function makeStore(n) {
        var persons = ["林夏", "陈舟", "小雨"];
        var out = [];
        for (var i = 0; i < (Number(n) || 30); i++) {
            out.push({
                id: "m" + i,
                text: persons[i % 3] + "记得第" + i + "件事",
                persons: [persons[i % 3]], owner: persons[i % 3],
                at: "2026-11-" + String(1 + (i % 18)).padStart(2, "0") + "T00:00:00Z",
                sessionId: "s" + (i % 3), floor: i + 1
            });
        }
        return { memories: out, receipts: [] };
    }

    /** [v4.161.0 · R25-X8] 记忆迁移包：只带选中的人/时段/模态，带版本与校验和。
     *   导入走幂等键（id + 正文摘要），同一包导两次库内存量不变。
     */
    function fnvOf(text) {
        var s0 = String(text || ""), h = 2166136261;
        for (var i = 0; i < s0.length; i += 1) { h ^= s0.charCodeAt(i); h = (h * 16777619) >>> 0; }
        return h.toString(16);
    }

    function packKey(m) {
        return String(m && m.id) + "|" + fnvOf(String(m && m.text || ""));
    }

    function pickFields(m) {
        return {
            id: String(m.id), text: String(m.text || ""),
            at: String(m.at || ""), floor: m.floor === undefined || m.floor === null ? null : Number(m.floor),
            type: String(m.type || ""), modality: String(m.modality || "text"),
            people: arr(m.people).map(String)
        };
    }

    function exportPack(storeIn, selector) {
        var sel = selector && typeof selector === "object" ? selector : {};
        var list = arr(store(storeIn).memories).filter(function (m) {
            if (sel.person && arr(m.people).map(String).indexOf(String(sel.person)) === -1) return false;
            if (sel.modality && String(m.modality || "text") !== String(sel.modality)) return false;
            if (sel.from && String(m.at || "") < String(sel.from)) return false;
            if (sel.to && String(m.at || "") > String(sel.to)) return false;
            return true;
        }).map(pickFields);
        var body = JSON.stringify(list);
        return {
            ok: true,
            pack: {
                kind: "lonsha-memory-migration", version: 1,
                selector: { person: String(sel.person || ""), modality: String(sel.modality || ""), from: String(sel.from || ""), to: String(sel.to || "") },
                count: list.length, checksum: "k-" + list.length + "-" + fnvOf(body), entries: list
            }
        };
    }

    function verifyPack(pack) {
        var p0 = pack && typeof pack === "object" ? pack : null;
        if (!p0 || p0.kind !== "lonsha-memory-migration") return { ok: false, bad: ["not-a-pack"] };
        if (Number(p0.version) !== 1) return { ok: false, bad: ["version-mismatch"] };
        var list = arr(p0.entries).map(pickFields);
        var want = "k-" + list.length + "-" + fnvOf(JSON.stringify(list));
        if (String(p0.checksum) !== want) return { ok: false, bad: ["checksum-mismatch"] };
        return { ok: true, entries: list };
    }

    function importPack(storeIn, pack) {
        var v = verifyPack(pack);
        if (!v.ok) return { ok: false, bad: v.bad, store: store(storeIn), added: 0, skipped: 0 };
        var base = store(storeIn);
        var have = {};
        arr(base.memories).forEach(function (m) { have[packKey(m)] = true; });
        var added = 0, skipped = 0, next = arr(base.memories).slice();
        arr(v.entries).forEach(function (e) {
            var k = packKey(e);
            if (have[k]) { skipped += 1; return; }
            have[k] = true; added += 1; next.push(e);
        });
        return {
            ok: true, added: added, skipped: skipped,
            store: { memories: next, receipts: arr(base.receipts) },
            total: next.length, checksum: String(pack.checksum)
        };
    }

    function privacySelfCheck() {
        var bad = [];
        if (SCOPES.length !== 4) bad.push("scopes");
        var base = makeStore(30);
        var before = exportJSON(base, { all: true });
        if (before.count !== 30) bad.push("export-count");
        var del = forget(base, "person", { person: "林夏" }, { at: "2026-11-18" });
        if (!del.ok || del.receipt.deletedCount !== 10) bad.push("person-delete:" + (del.receipt && del.receipt.deletedCount));
        var after = exportJSON(del.store, { all: true });
        if (after.count !== 20) bad.push("after-count");
        var overlap = after.memories.filter(function (m) { return del.receipt.deletedIds.indexOf(m.id) !== -1; });
        if (overlap.length !== 0) bad.push("not-really-deleted");
        if (del.receipt.digest !== digest(del.receipt.deletedIds)) bad.push("digest-mismatch");
        var b2 = forget(base, "person", { person: "林夏" });
        if (b2.receipt.digest !== del.receipt.digest) bad.push("digest-not-deterministic");
        var des = exportJSON(base, { all: true, desensitize: true });
        var joined = des.memories.map(function (m) { return m.text + "|" + m.persons.join(","); }).join("|");
        ["林夏", "陈舟", "小雨"].forEach(function (nm) { if (joined.indexOf(nm) !== -1) bad.push("desensitize-leak:" + nm); });
        var r2 = forget(base, "range", { from: "2026-11-01", to: "2026-11-05" });
        if (!(r2.receipt.deletedCount > 0 && r2.receipt.deletedCount < 30)) bad.push("range");
        var rAll = forget(base, "all", {});
        if (rAll.receipt.deletedCount !== 30 || rAll.store.memories.length !== 0) bad.push("all");
        if (!forget(base, "nope", {}) || forget(base, "nope", {}).ok !== false) bad.push("bad-scope");
        var paged = list(base, { page: 2, size: 10 });
        if (paged.items.length !== 10 || paged.pages !== 3) bad.push("paging");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "scopes=4 export=" + before.count + "->" + after.count + " digest=" + del.receipt.digest
        };
    }

    return {
        SCOPES: SCOPES, digest: digest,
        list: list, exportJSON: exportJSON, forget: forget,
        forgetAndRebuild: forgetAndRebuild, auditExport: auditExport,
        exportPack: exportPack, verifyPack: verifyPack, importPack: importPack, packKey: packKey,
        makeStore: makeStore,
        privacySelfCheck: privacySelfCheck
    };
}));
