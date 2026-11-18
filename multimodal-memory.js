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
            lang: str(o.lang),
            translation: str(o.translation),
            sender: str(o.sender),
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

    /** [v4.161.0 · R25-X2] 跨模态互查：按模态分组 + 命中项的来源楼层与人物。
     *  无描述/悬空条目**永不出现**在结果里（互查不是编造现场）。
     */
    function recallGrouped(store, query, options) {
        var r = recall(store, query, options);
        var groups = { text: [], image: [], audio: [] };
        var entries = arr(store && store.entries);
        arr(r.hits).forEach(function (h) {
            var mod = MODALITIES.indexOf(String(h.modality)) >= 0 ? String(h.modality) : "text";
            // 楼层/人物一律从库里的条目取（检索命中面不带这两个字段，拿命中面就会退化成 null）。
            var e = entries.filter(function (x) { return String(x.id) === String(h.id); })[0] || {};
            var src = e.sourceRef || h.sourceRef || {};
            groups[mod].push({
                id: String(h.id), modality: mod, label: label(h),
                floor: src.floor === undefined || src.floor === null ? null : Number(src.floor),
                srcId: str(src.srcId), people: arr(e.people || h.people).map(str),
                score: Number(h.score || 0)
            });
        });
        return {
            ok: true, groups: groups, order: MODALITIES.slice(),
            hits: arr(r.hits).length, considered: r.considered,
            skipped: {
                undescribed: entries.filter(function (e) { return e.state === "undescribed"; }).length,
                dangling: entries.filter(function (e) { return e.state === "dangling"; }).length
            }
        };
    }

    /** [v4.161.0 · R25-X3] 转写按句切分：句号/问号/感叹号/分号/换行都是边界，空句不占位。 */
    function splitSentences(text) {
        var s0 = str(text).split(String.fromCharCode(13)).join("。");
        s0 = s0.split(String.fromCharCode(10)).join("。");
        var raw = s0.split(/[。！？!?；;]/);
        var out = [];
        for (var i = 0; i < raw.length; i++) {
            var t = raw[i].trim();
            if (t) out.push(t);
        }
        return out;
    }

    /** 语音时间轴：每条语音的每句各自一行，按时间（再按 id / 句序）稳定排序。 */
    function timeline(store) {
        var rows = [];
        arr(store && store.entries).forEach(function (e) {
            if (String(e.modality) !== "audio") return;
            var sentences = splitSentences(e.transcript);
            sentences.forEach(function (t, i) {
                rows.push({
                    id: String(e.id), index: i, sentence: t,
                    at: str(e.capturedAt), floor: e.floor === null || e.floor === undefined ? null : Number(e.floor),
                    srcId: str(e.srcId), state: String(e.state || "")
                });
            });
        });
        rows.sort(function (a, b) {
            if (a.at !== b.at) return a.at < b.at ? -1 : 1;
            if (a.id !== b.id) return a.id < b.id ? -1 : 1;
            return a.index - b.index;
        });
        return { ok: true, rows: rows, total: rows.length };
    }

    /** 句级引用：这一句回到哪条语音、哪一层楼。查不到就说查不到。 */
    function locateSentence(store, id, index) {
        var e = arr(store && store.entries).filter(function (x) { return String(x.id) === String(id); })[0];
        if (!e) return { ok: false, bad: ["no-such-entry"] };
        var sentences = splitSentences(e.transcript);
        var i = Number(index);
        if (!(i >= 0) || i >= sentences.length) return { ok: false, bad: ["no-such-sentence"] };
        return {
            ok: true, id: String(e.id), index: i, sentence: sentences[i],
            floor: e.floor === null || e.floor === undefined ? null : Number(e.floor),
            srcId: str(e.srcId), capturedAt: str(e.capturedAt), total: sentences.length
        };
    }

    /** [v4.162.0 · R26-O3] 描述回填闭环：回填后**索引跟着重建**，层级读数跟着变。
     *   只回填不重建 = 搜不到，等于没回填（第二份真源不跟上就是撒谎）。
     */
    function describeClosed(store, id, text, options) {
        var o = options && typeof options === "object" ? options : {};
        var before = arr(store && store.entries).filter(function (e) { return String(e.id) === String(id); })[0] || null;
        if (!before) return { ok: false, bad: ["no-such-entry"] };
        var r = describe(store, id, text);
        if (!r.ok) return { ok: false, bad: ["describe-failed"] };
        var rebuilt = null, indexVersion = 0;
        var idx = o.index && typeof o.index === "object" ? o.index : null;
        if (idx && typeof idx.rebuild === "function") {
            var docs = arr(r.store.entries).filter(function (e) { return e.state === "ok"; })
                .map(function (e) { return { id: String(e.id), text: searchableText(e) }; });
            rebuilt = idx.rebuild(docs);
            indexVersion = docs.length;
        }
        var tierOf = typeof o.tierOf === "function" ? o.tierOf : function (e) {
            return e && e.state === "ok" && substanceLength(e) > 0 ? "hot" : "cold";
        };
        var tierBefore = before.state === "ok" ? tierOf(before) : "cold";
        var tierAfter = tierOf(r.entry);
        return {
            ok: true, store: r.store, entry: r.entry,
            receipt: {
                id: String(id), stateFrom: String(before.state), stateTo: String(r.entry.state),
                indexRebuilt: rebuilt ? true : false, indexVersion: indexVersion,
                tierFrom: String(tierBefore), tierTo: String(tierAfter), tierMoved: String(tierBefore) !== String(tierAfter),
                searchable: r.entry.state === "ok"
            }
        };
    }

    function substanceLength(e) {
        return (str(e && e.description) + str(e && e.transcript)).replace(/\s+/g, "").length;
    }

    /* ================= R26-X2 图片人物溯源 =================
     * 欠债：互查给了楼层与人物，但「这张图是谁发的」没有专门出口。
     * 做法：按条目反查 sender / floor / 人物（带主次）；没有 sender 就 senderKnown:false，不生造。
     *   主次口径：登记时 people 的顺序就是主次（第一个人是主角），不在这里重排——重排等于编。
     */
    function peopleOf(e) {
        var list = arr(e && e.people).map(str).filter(function (p) { return p.length > 0; });
        return list.map(function (p, i) { return { name: p, order: i + 1, primary: i === 0 }; });
    }

    function provenance(store, id) {
        var target = str(id);
        var e = arr(store && store.entries).filter(function (x) { return str(x.id) === target; })[0] || null;
        if (!e) return { ok: false, bad: ["no-such-entry"], id: target, people: [], primary: null, sender: null, senderKnown: false, floor: null };
        var people = peopleOf(e);
        var sender = str(e.sender);
        return {
            ok: true, id: str(e.id), modality: str(e.modality), label: label(e), state: str(e.state),
            floor: e.floor === undefined || e.floor === null ? null : Number(e.floor),
            srcId: str(e.srcId),
            sender: sender.length ? sender : null, senderKnown: sender.length > 0,
            people: people, primary: people.length ? people[0].name : null,
            peopleCount: people.length
        };
    }

    /** 图片总账：逐张列出楼层 / 发送者 / 人物 / 主次；没人物的一并计入 unnamed，不互补。 */
    function imageIndex(store) {
        var rows = arr(store && store.entries).filter(function (e) { return str(e.modality) === "image"; }).map(function (e) {
            var pv = provenance(store, e.id);
            return {
                id: pv.id, floor: pv.floor, sender: pv.sender, senderKnown: pv.senderKnown,
                people: pv.people, primary: pv.primary, state: pv.state
            };
        });
        return {
            ok: true, rows: rows, count: rows.length,
            unnamed: rows.filter(function (r) { return r.people.length === 0; }).length,
            noSender: rows.filter(function (r) { return r.senderKnown === false; }).length
        };
    }

    /* ================= R26-X3 语音跳语言标注 =================
     * 欠债：转写是原文，翻译后与原文混在一起分不清。
     * 做法：转写带语言标；译文单列一栏；**召回只用原文**（searchableText 不拼译文）——
     *   译文只作展示，不参与检索，两套文本不得混用。
     */
    function bilingual(store, id) {
        var target = str(id);
        var e = arr(store && store.entries).filter(function (x) { return str(x.id) === target; })[0] || null;
        if (!e) return { ok: false, bad: ["no-such-entry"], id: target, original: "", translated: "" };
        var lang = str(e.lang);
        var original = str(e.transcript) || str(e.description);
        var translated = str(e.translation);
        return {
            ok: true, id: target, modality: str(e.modality), state: str(e.state),
            lang: lang.length ? lang : "und", langKnown: lang.length > 0,
            original: original, translated: translated,
            hasTranslation: translated.length > 0,
            searchable: searchableText(e),
            note: "召回只读 searchable（原文），译文只作展示"
        };
    }

    /** 标注译文：只动 translation / lang，不碰 transcript 与 description。 */
    function translate(store, id, text, lang) {
        var target = str(id);
        var hit = false;
        var next = arr(store && store.entries).map(function (e) {
            if (str(e.id) !== target) return e;
            hit = true;
            var c = JSON.parse(JSON.stringify(e));
            c.translation = str(text).trim();
            if (str(lang).length) c.lang = str(lang);
            return c;
        });
        if (!hit) return { ok: false, bad: ["no-such-entry"], store: store, entry: null };
        var entry = next.filter(function (e) { return str(e.id) === target; })[0] || null;
        return { ok: true, store: { seq: store.seq, entries: next }, entry: entry, searchable: searchableText(entry) };
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
        describeClosed: describeClosed, substanceLength: substanceLength, recallGrouped: recallGrouped, splitSentences: splitSentences, timeline: timeline, locateSentence: locateSentence,
        provenance: provenance, imageIndex: imageIndex, peopleOf: peopleOf,
        bilingual: bilingual, translate: translate,
        mmSelfCheck: mmSelfCheck
    };
}));
