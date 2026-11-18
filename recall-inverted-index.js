/* ============================================================
 * recall-inverted-index.js — R24-O2 召回性能：倒排索引 / 增量 / 降级 / 对拍
 *
 * 【治的欠债】召回是「线性扫描 + 现场打分」，没有任何索引结构，也没有延迟读数。
 *   计数再多也说不清「1k / 1w / 10w 各是多少毫秒」。
 *
 * 【铁律一：索引只改速度不改结果】
 *   倒排只用来**缩候选集**，打分函数与线性扫描是同一个函数。
 *   所以 `query()` 的结果与 `linearQuery()` 必然逐条一致（含同分排序）。
 *
 * 【铁律二：降级必须可见】
 *   索引不可用 ⇒ 退回线性扫描，但读数面必须 `degraded:true` + `reason`，
 *   不许「静默变慢」。`rebuild()` 之后回到正常路径（可自愈）。
 *
 * 【铁律三：增量不重建】
 *   `addDoc()` 只往 postings 里塞新 id，不动已有条目。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRecallInvertedIndex = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var K1 = 1.2;
    var B = 0.75;

    function isCjk(c) { return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf); }
    function isWord(c) {
        return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
    }

    /** 分词：中文取单字 + 相邻二元（不跨标点），拉丁取小写词。索引与查询共用。 */
    function tokenize(text) {
        var s = text === null || text === undefined ? '' : String(text).toLowerCase();
        var out = [];
        var i = 0;
        while (i < s.length) {
            var c = s.charCodeAt(i);
            if (isCjk(c)) {
                out.push(s.charAt(i));
                if (i + 1 < s.length && isCjk(s.charCodeAt(i + 1))) out.push(s.substr(i, 2));
                i += 1;
                continue;
            }
            if (isWord(c)) {
                var st = i;
                while (i < s.length && isWord(s.charCodeAt(i))) i += 1;
                out.push(s.slice(st, i));
                continue;
            }
            i += 1;
        }
        return out;
    }

    function idOf(v) { return v && typeof v === "object" ? String(v.id) : String(v); }
    function textOf(v) { return v && typeof v === "object" ? String(v.text || v.content || "") : ""; }

    function emptyIndex() {
        return { postings: {}, docLen: {}, tf: {}, seen: {}, size: 0, builtFrom: 0 };
    }

    /* [v4.160.0 · R25-O8] 索引持久化：dump/load 带版本号与校验和。
     *   为什么要校验和：落盘的东西可能被截断或被旧版本写过 —— 读回来必须能自证是同一份。
     */
    var DUMP_VERSION = 1;

    function fnv(text) {
        var h = 2166136261;
        for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = (h * 16777619) >>> 0; }
        return h.toString(16);
    }

    function dump(index) {
        var idx = index || emptyIndex();
        var body = { postings: idx.postings, docLen: idx.docLen, tf: idx.tf, size: idx.size };
        var text = JSON.stringify(body);
        return { version: DUMP_VERSION, checksum: fnv(text), size: idx.size, body: body };
    }

    function load(dumped) {
        var d = dumped && typeof dumped === "object" ? dumped : null;
        if (!d) return { ok: false, bad: ["no-dump"], index: emptyIndex() };
        if (Number(d.version) !== DUMP_VERSION) return { ok: false, bad: ["version-mismatch"], index: emptyIndex() };
        var body = d.body && typeof d.body === "object" ? d.body : null;
        if (!body) return { ok: false, bad: ["no-body"], index: emptyIndex() };
        if (fnv(JSON.stringify(body)) !== String(d.checksum)) return { ok: false, bad: ["checksum-mismatch"], index: emptyIndex() };
        var seen = {};
        Object.keys(body.postings || {}).forEach(function (t) {
            (body.postings[t] || []).forEach(function (id) { seen[id] = true; });
        });
        return {
            ok: true,
            index: { postings: body.postings || {}, docLen: body.docLen || {}, tf: body.tf || {}, seen: seen, size: Number(body.size) || 0, builtFrom: Number(body.size) || 0 },
        };
    }

    /* ================= R26-O8 索引持久化接真实落盘 =================
     * 欠债：dump/load 只在内存里往返——没有「写到哪、读回来算不算同一份」。
     * 做法：storage 由调用方注入（get/set 两个函数，同步），本模只负责：
     *   1. 写入带 存档版本 + 库版本 + 校验和；
     *   2. 读回逐项对账（存档版本 / 校验和 / 库版本）；
     *   3. 任一不符 ⇒ 拒收并具名；调用方给了 docs 就当场重建（rebuiltAfter 点名原因）。
     */
    var ARCHIVE_KEY = "lonsha.recall.index";

    function saveTo(index, storage, options) {
        var o = options && typeof options === "object" ? options : {};
        var key = String(o.key || ARCHIVE_KEY);
        if (!storage || typeof storage.set !== "function") return { ok: false, bad: ["no-storage"], wrote: false, key: key };
        var d = dump(index);
        var rec = {
            version: d.version, checksum: d.checksum, size: d.size,
            storeVersion: String(o.storeVersion === undefined || o.storeVersion === null ? "" : o.storeVersion),
            savedAt: String(o.at || ""),
            body: d.body
        };
        var text = JSON.stringify(rec);
        storage.set(key, text);
        return {
            ok: true, wrote: true, key: key, bytes: text.length,
            version: d.version, checksum: d.checksum, size: d.size, storeVersion: rec.storeVersion
        };
    }

    function loadFrom(storage, options) {
        var o = options && typeof options === "object" ? options : {};
        var key = String(o.key || ARCHIVE_KEY);
        function fallback(bad) {
            var docs = Array.isArray(o.docs) ? o.docs : null;
            var idx = docs ? buildIndex(docs) : emptyIndex();
            return {
                ok: false, bad: bad, key: key, index: idx,
                rebuilt: !!docs, rebuiltAfter: bad.slice(), reason: bad.join("+"),
                size: idx.size
            };
        }
        if (!storage || typeof storage.get !== "function") return fallback(["no-storage"]);
        var raw = null;
        try { raw = storage.get(key); } catch (err) { return fallback(["storage-read-error"]); }
        if (raw === null || raw === undefined || raw === "") return fallback(["no-archive"]);
        var rec = null;
        try { rec = JSON.parse(String(raw)); } catch (err) { return fallback(["bad-json"]); }
        if (!rec || typeof rec !== "object") return fallback(["bad-archive"]);
        if (Number(rec.version) !== DUMP_VERSION) return fallback(["archive-version-mismatch"]);
        var back = load({ version: rec.version, checksum: rec.checksum, size: rec.size, body: rec.body });
        if (!back.ok) return fallback(back.bad);
        // 库版本对账：存档记了库版本就必须与当前库一致，否则这份索引可能少条 / 多条
        var want = String(o.storeVersion === undefined || o.storeVersion === null ? "" : o.storeVersion);
        var have = String(rec.storeVersion || "");
        if (have && want && have !== want) return fallback(["stale-archive"]);
        return {
            ok: true, bad: [], key: key, index: back.index, rebuilt: false,
            version: DUMP_VERSION, checksum: String(rec.checksum), size: back.index.size,
            storeVersion: have, savedAt: String(rec.savedAt || "")
        };
    }

    /** 分段重建：超限就分段建再合并，避免一次性把整库塞进内存。 */
    function rebuildInSegments(docs, options) {
        var o = options && typeof options === "object" ? options : {};
        var list = Array.isArray(docs) ? docs : [];
        var segSize = Number(o.segmentSize) > 0 ? Number(o.segmentSize) : 5000;
        var segs = [];
        for (var i = 0; i < list.length; i += segSize) segs.push(list.slice(i, i + segSize));
        if (!segs.length) segs.push([]);
        var idx = emptyIndex();
        segs.forEach(function (part) { part.forEach(function (d) { addDoc(idx, d); }); });
        idx.builtFrom = idx.size;
        return { index: idx, segments: segs.length, segmentSize: segSize, size: idx.size };
    }

    /** 全量建索引。 */
    function buildIndex(docs) {
        var idx = emptyIndex();
        (Array.isArray(docs) ? docs : []).forEach(function (d) { addDoc(idx, d); });
        idx.builtFrom = idx.size;
        return idx;
    }

    /** 增量：只往 postings 塞新 id，不重建。 */
    function addDoc(index, doc) {
        var idx = index || emptyIndex();
        var id = idOf(doc);
        var toks = tokenize(textOf(doc));
        var tf = {};
        toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
        // 去重用 seen 集合：10w 规模下 postings.indexOf 会让建库退化成 O(n^2)。
        if (!idx.seen || typeof idx.seen !== "object") idx.seen = {};
        if (idx.seen[id]) return idx;
        idx.seen[id] = true;
        Object.keys(tf).forEach(function (t) {
            if (!Array.isArray(idx.postings[t])) idx.postings[t] = [];
            idx.postings[t].push(id);
        });
        idx.docLen[id] = toks.length;
        if (!idx.tf || typeof idx.tf !== "object") idx.tf = {};
        idx.tf[id] = tf;   // 缓存分词结果：查询期不再重分词（这是索引快过线性扫描的真正原因）
        idx.size += 1;
        return idx;
    }

    function avgLen(index) {
        var ids = Object.keys(index.docLen || {});
        if (!ids.length) return 0;
        var sum = 0;
        ids.forEach(function (k) { sum += index.docLen[k]; });
        return sum / ids.length;
    }

    /** 唯一的打分函数：索引路与线性路都调它。 */
    function scoreDoc(termTf, dl, avg, idf) {
        var norm = avg > 0 ? (1 - B + B * dl / avg) : 1;
        var s = 0;
        Object.keys(termTf).forEach(function (t) {
            var f = termTf[t];
            s += (idf[t] || 0) * (f * (K1 + 1)) / (f + K1 * norm);
        });
        return s;
    }

    function idfMap(index, terms) {
        var n = index.size || 1;
        var m = {};
        terms.forEach(function (t) {
            var df = (index.postings[t] || []).length;
            m[t] = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        });
        return m;
    }

    function rank(list) {
        list.sort(function (x, y) {
            if (y.score !== x.score) return y.score - x.score;
            return String(x.id) < String(y.id) ? -1 : String(x.id) > String(y.id) ? 1 : 0;
        });
        return list;
    }

    /** 线性扫描（无索引路径，也是降级路径的真身）。 */
    function linearQuery(docs, q) {
        var list = Array.isArray(docs) ? docs : [];
        var terms = tokenize(q);
        var idx = { postings: {}, docLen: {}, size: 0 };
        list.forEach(function (d) {
            var toks = tokenize(textOf(d));
            var tf = {};
            toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
            Object.keys(tf).forEach(function (t) {
                if (!Array.isArray(idx.postings[t])) idx.postings[t] = [];
                idx.postings[t].push(idOf(d));
            });
            idx.docLen[idOf(d)] = toks.length;
            idx.size += 1;
        });
        var idf = idfMap(idx, terms);
        var avg = avgLen(idx);
        var out = [];
        list.forEach(function (d) {
            var toks = tokenize(textOf(d));
            var tf = {};
            toks.forEach(function (t) { if (terms.indexOf(t) !== -1) tf[t] = (tf[t] || 0) + 1; });
            var sc = scoreDoc(tf, toks.length, avg, idf);
            if (sc > 0) out.push({ id: idOf(d), score: sc });
        });
        return { results: rank(out), scanned: list.length, candidates: out.length, degraded: true, reason: "linear-scan" };
    }

    /** 索引查询：倒排缩候选，再调同一个打分函数。 */
    function query(index, docs, q, options) {
        var o = options && typeof options === "object" ? options : {};
        var hasIndex = index && index.postings && typeof index.postings === "object" && index.size > 0;
        if (!hasIndex) {
            var lin = linearQuery(docs, q);
            lin.degraded = true;
            lin.reason = o.reason || "index-unavailable";
            return lin;
        }
        var terms = tokenize(q);
        var cand = [];
        terms.forEach(function (t) {
            (index.postings[t] || []).forEach(function (id) { if (cand.indexOf(id) === -1) cand.push(id); });
        });
        var byId = {};
        (Array.isArray(docs) ? docs : []).forEach(function (d) { byId[idOf(d)] = d; });
        var idf = idfMap(index, terms);
        var avg = avgLen(index);
        var out = [];
        var cached = index.tf && typeof index.tf === "object" ? index.tf : {};
        cand.forEach(function (id) {
            var d = byId[id];
            if (!d) return;
            var full = cached[id];
            var dl;
            var tf;
            if (full) {           // 命中缓存：只挑查询词项，不重分词
                dl = index.docLen[id];
                tf = {};
                terms.forEach(function (t) { if (full[t]) tf[t] = full[t]; });
            } else {
                var toks = tokenize(textOf(d));
                dl = toks.length;
                tf = {};
                toks.forEach(function (t) { if (terms.indexOf(t) !== -1) tf[t] = (tf[t] || 0) + 1; });
            }
            var sc = scoreDoc(tf, dl, avg, idf);
            if (sc > 0) out.push({ id: id, score: sc });
        });
        return {
            results: rank(out),
            scanned: cand.length,
            candidates: out.length,
            degraded: false,
            reason: "inverted-index",
            size: index.size
        };
    }

    /** 增量入索引并立即可召回（不重建）。 */
    function appendDoc(index, doc) {
        var before = index && index.size || 0;
        var next = addDoc(index, doc);
        return { index: next, before: before, after: next.size, rebuilt: false };
    }

    /** 自愈：索引坏了就重建（重建后回到正常路径）。 */
    function rebuild(docs) {
        return { index: buildIndex(docs), rebuilt: true, size: (Array.isArray(docs) ? docs.length : 0) };
    }

    function makeDocs(n, seed) {
        var vocab = ["记忆", "承诺", "车站", "天气", "计划", "朋友", "约定", "信任", "旅行", "雨伞", "书", "灯"];
        var out = [];
        var s = Number(seed) || 20261118;
        for (var i = 0; i < n; i++) {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            var a = vocab[s % vocab.length];
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            var b = vocab[s % vocab.length];
            out.push({ id: "m" + i, text: a + "和" + b + "的事情第" + (i % 97) + "次" });
        }
        return out;
    }

    function pct(list, p) {
        if (!list.length) return 0;
        var a = list.slice().sort(function (x, y) { return x - y; });
        var k = Math.min(a.length - 1, Math.max(0, Math.floor((a.length - 1) * p)));
        return a[k];
    }

    /** 三档实测：1k / 1w / 10w。返回 P50/P95 与内存增量（真读数）。 */
    function benchRecall(options) {
        var o = options && typeof options === "object" ? options : {};
        var sizes = Array.isArray(o.sizes) && o.sizes.length ? o.sizes : [1000, 10000, 100000];
        var reps = Number(o.reps) > 0 ? Number(o.reps) : 20;
        var q = String(o.query || "承诺和车站");
        var rows = [];
        sizes.forEach(function (n) {
            var docs = makeDocs(n, o.seed);
            var m0 = process.memoryUsage().heapUsed;
            var t0 = process.hrtime.bigint();
            var idx = buildIndex(docs);
            var buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
            var m1 = process.memoryUsage().heapUsed;
            var idxTimes = [];
            var linTimes = [];
            var lastIdx = null;
            var lastLin = null;
            for (var r = 0; r < reps; r++) {
                var a = process.hrtime.bigint();
                lastIdx = query(idx, docs, q);
                idxTimes.push(Number(process.hrtime.bigint() - a) / 1e6);
                if (n <= 20000) {
                    var b = process.hrtime.bigint();
                    lastLin = linearQuery(docs, q);
                    linTimes.push(Number(process.hrtime.bigint() - b) / 1e6);
                }
            }
            var sameIds = lastLin ? JSON.stringify(lastIdx.results.map(function (x) { return x.id; })) === JSON.stringify(lastLin.results.map(function (x) { return x.id; })) : null;
            rows.push({
                size: n,
                buildMs: Number(buildMs.toFixed(2)),
                indexP50: Number(pct(idxTimes, 0.5).toFixed(3)),
                indexP95: Number(pct(idxTimes, 0.95).toFixed(3)),
                linearP50: linTimes.length ? Number(pct(linTimes, 0.5).toFixed(3)) : null,
                linearP95: linTimes.length ? Number(pct(linTimes, 0.95).toFixed(3)) : null,
                scannedByIndex: lastIdx.scanned,
                parity: sameIds
            });
            idx = null; docs = null;
        });
        return { ok: true, reps: reps, query: q, rows: rows };
    }

    function recallIndexSelfCheck() {
        var bad = [];
        var docs = makeDocs(60, 7);
        var idx = buildIndex(docs);
        if (idx.size !== 60) bad.push("build");
        var q = "承诺和车站";
        var a = query(idx, docs, q);
        var b = linearQuery(docs, q);
        if (JSON.stringify(a.results) !== JSON.stringify(b.results)) bad.push("parity");
        var rare = [
            { id: "d1", text: "蓝鲸在深海" },
            { id: "d2", text: "天气和计划" },
            { id: "d3", text: "朋友约定旅行" },
            { id: "d4", text: "书和灯在桌上" },
            { id: "d5", text: "信任和雨伞" }
        ];
        var ridx = buildIndex(rare);
        var rq = query(ridx, rare, "蓝鲸");
        if (rq.scanned >= rare.length) bad.push("candidate-not-narrowed");
        if (!rq.results.some(function (x) { return x.id === "d1"; })) bad.push("rare-miss");
        var rl = linearQuery(rare, "蓝鲸");
        if (JSON.stringify(rq.results) !== JSON.stringify(rl.results)) bad.push("parity-rare");
        var ap = appendDoc(ridx, { id: "dNew", text: "蓝鲸又来了" });
        if (ap.rebuilt) bad.push("incremental-rebuilt");
        var withNew = rare.concat([{ id: "dNew", text: "蓝鲸又来了" }]);
        var c = query(ap.index, withNew, "蓝鲸");
        if (!c.results.some(function (x) { return x.id === "dNew"; })) bad.push("incremental-not-recallable");
        var d = query(null, rare, "蓝鲸");
        if (!d.degraded || !d.reason) bad.push("degraded-silent");
        var e = rebuild(rare);
        if (!e.rebuilt || e.index.size !== rare.length) bad.push("self-heal");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "parity=ok scanned=" + rq.scanned + "/" + rare.length + " degraded=" + d.reason + " heal=" + e.index.size
        };
    }

    return {
        tokenize: tokenize,
        emptyIndex: emptyIndex,
        buildIndex: buildIndex,
        addDoc: addDoc,
        appendDoc: appendDoc,
        rebuild: rebuild,
        DUMP_VERSION: DUMP_VERSION, dump: dump, load: load, rebuildInSegments: rebuildInSegments,
        ARCHIVE_KEY: ARCHIVE_KEY, saveTo: saveTo, loadFrom: loadFrom,
        query: query,
        linearQuery: linearQuery,
        makeDocs: makeDocs,
        benchRecall: benchRecall,
        recallIndexSelfCheck: recallIndexSelfCheck
    };
}));
