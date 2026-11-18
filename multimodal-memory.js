/* ============================================================
 * multimodal-memory.js — R24-X3 多模态记忆：图片与语音也能进记忆
 *
 * 【治的欠债】载体是纯文本。角色发了图、发了语音，下一轮完全记不得。
 *
 * 【分工】描述/转写由**宿主生成侧**提供，本仓不调模型；缺失则 undescribed。
 * 【不静默】源被删除后条目转 dangling，仍在列表中可见，只是不可注入。
 * 【标注】注入时明确标「（图片）」「（语音）」，与条目属性同源。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaMultimodalMemory = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var MODALITIES = Object.freeze(["text", "image", "audio"]);
    var STATES = Object.freeze(["ok", "undescribed", "dangling"]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function str(v) { return v === undefined || v === null ? "" : String(v); }

    function isCjk(ch) {
        var c = ch.charCodeAt(0);
        return c >= 0x3400 && c <= 0x9FFF;
    }

    function tokens(text) {
        var s = str(text).toLowerCase();
        var out = [];
        var run = "";
        for (var i = 0; i < s.length; i++) {
            var ch = s.charAt(i);
            if (isCjk(ch)) { run += ch; continue; }
            if (run) { pushCjk(out, run); run = ""; }
        }
        if (run) pushCjk(out, run);
        var words = s.split(/[^a-z0-9]+/);
        for (var w = 0; w < words.length; w++) if (words[w].length > 1) out.push(words[w]);
        return out;
    }

    function pushCjk(out, run) {
        if (run.length === 1) { out.push(run); return; }
        for (var i = 0; i < run.length - 1; i++) out.push(run.substr(i, 2));
        out.push(run);
    }

    /** 条目的可检索文本：描述/转写。undescribed / dangling 不参与文本检索。 */
    function searchableText(e) {
        if (!e) return "";
        if (e.state !== "ok") return "";
        return str(e.description) + " " + str(e.transcript);
    }

    function label(e) {
        if (!e) return "";
        if (e.modality === "image") return "图片";
        if (e.modality === "audio") return "语音";
        return "文本";
    }

    function makeId(prefix, seq) { return str(prefix) + "-" + seq; }

    function createStore() { return { seq: 0, entries: [] }; }

    /** 登记一条多模态记忆。描述/转写由宿主提供，缺失就诚实地标 undescribed。 */
    function register(store, input) {
        var s = store && typeof store === "object" ? store : createStore();
        var o = input && typeof input === "object" ? input : {};
        var modality = MODALITIES.indexOf(String(o.modality)) >= 0 ? String(o.modality) : "text";
        var desc = str(o.description).trim();
        var trans = str(o.transcript).trim();
        var hasText = desc.length > 0 || trans.length > 0;
        var seq = Number(s.seq || 0) + 1;
        var entry = {
            id: String(o.id || makeId(modality, seq)),
            modality: modality,
            srcId: str(o.srcId),
            floor: o.floor === undefined ? null : Number(o.floor),
            sourceRef: { floor: o.floor === undefined ? null : Number(o.floor), srcId: str(o.srcId) },
            description: desc,
            transcript: trans,
            capturedAt: str(o.capturedAt),
            people: arr(o.people).map(str),
            durationMs: o.durationMs === undefined ? null : Number(o.durationMs),
            state: hasText ? "ok" : "undescribed",
            danglingReason: ""
        };
        return { ok: true, store: { seq: seq, entries: arr(s.entries).concat([entry]) }, entry: entry };
    }

    /** 宿主侧事后补描述：undescribed 转 ok，重新进入检索。 */
    function describe(store, id, text) {
        var s = store;
        var next = arr(s && s.entries).map(function (e) {
            if (String(e.id) !== String(id)) return e;
            var c = JSON.parse(JSON.stringify(e));
            c.description = str(text).trim();
            if (c.state === "undescribed" && (c.description || c.transcript)) c.state = "ok";
            return c;
        });
        var hit = next.filter(function (e) { return String(e.id) === String(id); })[0] || null;
        return { ok: !!hit, store: { seq: s.seq, entries: next }, entry: hit };
    }

    function idf(entries, term) {
        var n = entries.length || 1;
        var df = entries.filter(function (e) { return tokens(searchableText(e)).indexOf(term) >= 0; }).length;
        return Math.log(1 + (n - df + 0.5) / (df + 0.5));
    }

    /** 三模态走同一套检索：描述/转写参与打分，命中带来源楼层。 */
    function recall(store, query, options) {
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) > 0 ? Number(o.k) : 5;
        var entries = arr(store && store.entries);
        var qTerms = tokens(query);
        if (!qTerms.length) return { ok: true, hits: [], considered: entries.length, skipped: 0 };
        var skipped = entries.filter(function (e) { return e.state !== "ok"; });
        var pool = entries.filter(function (e) { return e.state === "ok"; });
        var cache = {};
        pool.forEach(function (e) { cache[e.id] = tokens(searchableText(e)); });
        var scored = pool.map(function (e) {
            var toks = cache[e.id] || [];
            var score = 0;
            qTerms.forEach(function (t) {
                var tf = toks.filter(function (x) { return x === t; }).length;
                if (!tf) return;
                var key = t;
                if (cache.__idf === undefined) cache.__idf = {};
                if (cache.__idf[key] === undefined) cache.__idf[key] = idf(pool, t);
                score += cache.__idf[key] * (tf / (tf + 1.2));
            });
            return { entry: e, score: score };
        }).filter(function (r) { return r.score > 0; });
        scored.sort(function (a, b) { return b.score - a.score; });
        return {
            ok: true,
            hits: scored.slice(0, k).map(function (r) {
                return { id: r.entry.id, modality: r.entry.modality, label: label(r.entry), score: Number(r.score.toFixed(4)), srcId: r.entry.srcId, floor: r.entry.floor, text: searchableText(r.entry).trim() };
            }),
            considered: pool.length,
            skipped: skipped.length
        };
    }

    /** 注入文本：模态标注与条目属性同源（不靠调用方自己拼）。 */
    function injectText(entry) {
        var e = entry || {};
        if (e.state === "dangling") return "";
        var body = e.modality === "audio" ? str(e.transcript) : str(e.description);
        if (e.modality === "audio" && e.description) body = e.description + "；" + str(e.transcript);
        if (!body) return "";
        var at = e.capturedAt ? "（剧情时间 " + e.capturedAt + "）" : "";
        return "（" + label(e) + "）" + at + body;
    }

    /** 源被删除：转 dangling，不静默消失。 */
    function removeSource(store, srcId, reason) {
        var s = store;
        var changed = [];
        var next = arr(s && s.entries).map(function (e) {
            if (!srcId || String(e.srcId) !== String(srcId)) return e;
            var c = JSON.parse(JSON.stringify(e));
            c.state = "dangling";
            c.danglingReason = str(reason) || "源已删除";
            changed.push(c.id);
            return c;
        });
        return { ok: changed.length > 0, store: { seq: s.seq, entries: next }, changed: changed };
    }

    /** 列表视图：dangling 也列出来（带原因），不假装干净。 */
    function list(store) {
        var entries = arr(store && store.entries);
        return {
            total: entries.length,
            byModality: MODALITIES.reduce(function (acc, m) {
                acc[m] = entries.filter(function (e) { return e.modality === m; }).length;
                return acc;
            }, {}),
            rows: entries.map(function (e) {
                return { id: e.id, modality: e.modality, label: label(e), state: e.state, at: e.capturedAt, floor: e.floor, reason: e.danglingReason };
            })
        };
    }

    function mmSelfCheck() {
        var bad = [];
        if (MODALITIES.length !== 3) bad.push("modalities");
        var s = createStore();
        var r1 = register(s, { modality: "image", srcId: "img1", floor: 12, capturedAt: "第三天黄昏", people: ["林夏"], description: "一张海边合照，两人都笑着" });
        s = r1.store;
        var r2 = register(s, { modality: "image", srcId: "img2", floor: 13 });
        s = r2.store;
        if (r2.entry.state !== "undescribed") bad.push("undescribed");
        var r3 = register(s, { modality: "audio", srcId: "aud1", floor: 14, transcript: "我今天有点累，明天再说" });
        s = r3.store;
        var hit = recall(s, "海边合照");
        if (!hit.hits.length) bad.push("no-recall");
        else if (hit.hits[0].modality !== "image") bad.push("wrong-modality");
        if (!/（图片）/.test(injectText(r1.entry))) bad.push("no-label");
        var rm = removeSource(s, "img1");
        if (!rm.ok || rm.changed[0] !== r1.entry.id) bad.push("dangling");
        if (recall(rm.store, "海边合照").hits.length !== 0) bad.push("dangling-still-hit");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "entries=" + arr(rm.store.entries).length + " undescribed=" + list(rm.store).rows.filter(function (e) { return e.state === "undescribed"; }).length + " dangling=" + list(rm.store).rows.filter(function (e) { return e.state === "dangling"; }).length + " audio=" + list(rm.store).byModality.audio
        };
    }

    return {
        MODALITIES: MODALITIES, STATES: STATES, tokens: tokens,
        createStore: createStore, register: register, describe: describe,
        recall: recall, injectText: injectText, removeSource: removeSource, list: list,
        mmSelfCheck: mmSelfCheck
    };
}));
