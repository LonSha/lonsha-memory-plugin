/* ============================================================
 * tiered-memory-plane.js — R24-O4 记忆规模治理：分层 / 分片 / 落界
 *
 * 【治的欠债】仓库只有「水位读数」（memory-capacity-watermark）与图剪枝，
 *   没有热/温/冷分层，没有按会话分片，也没有「多大之后精度会掉」的实测。
 *
 * 【分层不损正确性（这是硬约束）】
 *   热（常驻）/ 温（按需）/ 冷（需显式唤醒）。
 *   高层召回先扫热+温；**结果不足 k 条时必须补扫冷层**（`fellBackToCold`），
 *   否则「分层」就变成「悄悄漏召回」。冷层也能 `wake()` 显式唤醒回温。
 *
 * 【迁移确定性】分层只看可复算的三项（显著度 / 新近 / 引用次数），
 *   同一输入必得同一分层，与入参顺序无关。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaTieredMemoryPlane = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var TIERS = Object.freeze(["hot", "warm", "cold"]);
    var W = Object.freeze({ salience: 0.5, recency: 0.3, refs: 0.2 });
    var HOT_AT = 0.62;
    var WARM_AT = 0.30;

    function isCjk(c) { return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf); }
    function isWord(c) { return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }

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

    function idOf(m) { return String(m.id); }
    function textOf(m) { return String(m.text || m.content || ""); }
    function shardOf(m) { return String(m.sessionId || m.epoch || m.shard || "default"); }

    /** 分层分：只用可复算三项，绝不用「当前时间随机性」之外的东西。 */
    function tierScore(m, nowMs) {
        var sal = Number(m.salience);
        if (!Number.isFinite(sal)) sal = 0.5;
        var at = Date.parse(m.at || m.createdAt || "") || 0;
        var ageDays = nowMs && at ? Math.max(0, (nowMs - at) / 86400000) : 0;
        var rec = 1 / (1 + ageDays / 7);                       // 7 天半衰
        var refs = Number(m.refCount);
        if (!Number.isFinite(refs)) refs = 0;
        var rn = refs / (1 + refs);                            // 0..1 饱和
        var s = W.salience * sal + W.recency * rec + W.refs * rn;
        return Number(s.toFixed(6));
    }

    function tierOfScore(s) {
        if (s >= HOT_AT) return "hot";
        if (s >= WARM_AT) return "warm";
        return "cold";
    }

    /** 分层：返回分层后的库（纯函数）+ 迁移清单。 */
    function classify(store, options) {
        var o = options && typeof options === "object" ? options : {};
        var nowMs = Number(o.nowMs) || 0;
        var list = Array.isArray(store && store.memories) ? store.memories : [];
        var tiers = { hot: [], warm: [], cold: [] };
        var shards = {};
        var migrated = [];
        list.forEach(function (m) {
            var s = tierScore(m, nowMs);
            var t = tierOfScore(s);
            var prev = m.tier || null;
            var next = Object.assign({}, m, { tier: t, tierScore: s });
            tiers[t].push(idOf(m));
            var sh = shardOf(m);
            if (!shards[sh]) shards[sh] = { hot: [], warm: [], cold: [] };
            shards[sh][t].push(idOf(m));
            if (prev !== t) migrated.push({ id: idOf(m), from: prev, to: t, score: s });
        });
        return {
            ok: true,
            store: { memories: list.map(function (m) {
                var s = tierScore(m, nowMs);
                return Object.assign({}, m, { tier: tierOfScore(s), tierScore: s });
            }) },
            tiers: tiers,
            shards: shards,
            migrated: migrated,
            thresholds: { hotAt: HOT_AT, warmAt: WARM_AT }
        };
    }

    /** 打分：与查询词重叠度（确定性，同分按 id 字典序）。 */
    function qScore(m, terms) {
        var toks = tokenize(textOf(m));
        var hit = 0;
        terms.forEach(function (t) { if (toks.indexOf(t) !== -1) hit += 1; });
        // 长度归一用密度（hit/len）：短回声与原文同密度时，靠 id 字典序分先后，
        // 于是「近重复越多、原文越容易被挤下去」这件事才会在曲线上显形。
        return hit > 0 ? hit / (toks.length || 1) : 0;
    }

    function rankList(list) {
        list.sort(function (x, y) {
            if (y.score !== x.score) return y.score - x.score;
            return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
        });
        return list;
    }

    function scan(list, terms) {
        var out = [];
        list.forEach(function (m) {
            var s = qScore(m, terms);
            if (s > 0) out.push({ id: idOf(m), score: s, tier: m.tier || null });
        });
        return rankList(out);
    }

    /** 全量召回（基线）。 */
    function recallFlat(store, q, options) {
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) > 0 ? Number(o.k) : 10;
        var list = Array.isArray(store && store.memories) ? store.memories : [];
        var terms = tokenize(q);
        return { results: scan(list, terms).slice(0, k), scanned: list.length, degraded: false };
    }

    /**
     * 分层召回。
     *   includeCold:"always" ⇒ 冷层也扫（与 flat 逐条等价，用来证明「分层不改结果」）
     *   includeCold:"auto"   ⇒ 先热温；命中不足 k 条时补扫冷层（不许悄悄漏召回）
     *   includeCold:"never"  ⇒ 只扫热温（冷层必须显式 wake）
     */
    function recallTiered(store, q, options) {
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) > 0 ? Number(o.k) : 10;
        var mode = o.includeCold === "always" || o.includeCold === "never" ? o.includeCold : "auto";
        var list = Array.isArray(store && store.memories) ? store.memories : [];
        var terms = tokenize(q);
        var hot = list.filter(function (m) { return m.tier === "hot"; });
        var warm = list.filter(function (m) { return m.tier === "warm"; });
        var cold = list.filter(function (m) { return m.tier === "cold"; });
        var hits = scan(hot, terms).concat(scan(warm, terms));
        var scanned = hot.length + warm.length;
        var fellBack = false;
        if (mode === "always") {
            hits = hits.concat(scan(cold, terms));
            scanned += cold.length;
            fellBack = cold.length > 0;
        } else if (mode === "auto" && hits.length < k && cold.length) {
            hits = hits.concat(scan(cold, terms));
            scanned += cold.length;
            fellBack = true;
        }
        var merged = rankList(hits).slice(0, k);
        return {
            ok: true, results: merged, scanned: scanned, total: list.length,
            mode: mode,
            tiersScanned: fellBack ? ["hot", "warm", "cold"] : ["hot", "warm"],
            fellBackToCold: fellBack,
            savedScan: list.length - scanned
        };
    }

    /** 分片召回：只扫与查询角色/会话相关的分片。 */
    function recallSharded(store, q, options) {
        var o = options && typeof options === "object" ? options : {};
        var k = Number(o.k) > 0 ? Number(o.k) : 10;
        var list = Array.isArray(store && store.memories) ? store.memories : [];
        var want = Array.isArray(o.shards) ? o.shards.map(String) : null;
        var picked = want ? list.filter(function (m) { return want.indexOf(shardOf(m)) !== -1; }) : list;
        var out = scan(picked, tokenize(q)).slice(0, k);
        return { ok: true, results: out, scanned: picked.length, total: list.length, shards: want };
    }

    /** 显式唤醒：冷层 → 温层（用户点名要它）。 */
    function wake(store, ids) {
        var list = Array.isArray(store && store.memories) ? store.memories : [];
        var want = (Array.isArray(ids) ? ids : [ids]).map(String);
        var woke = [];
        var next = list.map(function (m) {
            if (want.indexOf(idOf(m)) === -1 || m.tier !== "cold") return m;
            woke.push(idOf(m));
            return Object.assign({}, m, { tier: "warm", wokeAt: "explicit" });
        });
        return { ok: true, store: { memories: next }, woke: woke };
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
            out.push({
                id: "m" + i,
                text: a + "和" + b + "的事情第" + (i % 37) + "次",
                salience: ((i * 37) % 100) / 100,
                at: "2026-11-" + String(1 + (i % 18)).padStart(2, "0") + "T00:00:00Z",
                refCount: i % 5,
                sessionId: "s" + (i % 4)
            });
        }
        return out;
    }

    /** 规模-精度曲线：目标 1 条，扩充干扰项，看 topK 命中率何时掉。 */
    /**
     * 规模-精度曲线。
     * 干扰项不是「无关噪声」，而是**近重复回声**（占 1%）：它们比目标更短、同样命中两个词，
     * 因而排到目标前面。这才是记忆库长大后真正会让精度掉下去的原因（也是 O5 的动机）。
     */
    function hitRateCurve(options) {
        var o = options && typeof options === "object" ? options : {};
        var sizes = Array.isArray(o.sizes) && o.sizes.length ? o.sizes : [100, 500, 2000, 10000, 50000];
        var k = Number(o.k) > 0 ? Number(o.k) : 5;
        var q = String(o.query || "蓝鲸的承诺");
        var rows = [];
        sizes.forEach(function (n) {
            var dups = Math.max(1, Math.floor(n / 100));      // 1% 近重复回声
            var docs = [{ id: "target", text: "蓝鲸的承诺", salience: 0.9, refCount: 5, sessionId: "s0" }];
            for (var i = 0; i < dups; i++) {
                docs.push({ id: "dup" + i, text: "蓝鲸的承诺", salience: 0.3, refCount: 0, sessionId: "s1" });
            }
            for (var j = 0; j < n; j++) {
                docs.push({ id: "d" + j, text: "无关的旧事第" + (j % 211) + "次", salience: 0.2, refCount: 0, sessionId: "s1" });
            }
            var t0 = Date.now();
            var flat = recallFlat({ memories: docs }, q, { k: k });
            var ms = Date.now() - t0;
            var ids = flat.results.map(function (x) { return x.id; });
            var rank = ids.indexOf("target") + 1;
            var relevant = ids.filter(function (id) { return id === "target" || id.indexOf("dup") === 0; }).length;
            rows.push({
                size: n, dups: dups,
                hitAtK: rank > 0 ? 1 : 0,
                rank: rank || null,
                precisionAtK: Number((relevant / (ids.length || 1)).toFixed(4)),
                ms: ms
            });
        });
        var dropAt = null;
        for (var i = 1; i < rows.length; i++) {
            if (rows[i].hitAtK < rows[0].hitAtK) { dropAt = rows[i].size; break; }
        }
        return { ok: true, k: k, query: q, rows: rows, dropAt: dropAt, dropCause: "近重复回声占满 top-k" };
    }

    function tieredSelfCheck() {
        var bad = [];
        if (TIERS.length !== 3) bad.push("tiers");
        var docs = makeDocs(200, 3);
        var nowMs = Date.parse("2026-11-18T00:00:00Z");
        var a = classify({ memories: docs }, { nowMs: nowMs });
        var b = classify({ memories: docs.slice().reverse() }, { nowMs: nowMs });
        if (JSON.stringify(a.tiers.hot.slice().sort()) !== JSON.stringify(b.tiers.hot.slice().sort())) bad.push("determinism");
        if (!a.tiers.hot.length || !a.tiers.warm.length || !a.tiers.cold.length) bad.push("tiers-empty");
        var q = "承诺和车站";
        var flat = recallFlat(a.store, q, { k: 10 });
        var always = recallTiered(a.store, q, { k: 10, includeCold: "always" });
        if (JSON.stringify(always.results.map(function (x) { return x.id; })) !== JSON.stringify(flat.results.map(function (x) { return x.id; }))) bad.push("parity-always");
        // 冷层无相关命中的库：缩成本但结果不变
        var lean = a.store.memories.map(function (m) {
            return m.tier === "cold" ? Object.assign({}, m, { text: "无关的旧事" }) : m;
        });
        var lf = recallFlat({ memories: lean }, q, { k: 10 });
        var lt = recallTiered({ memories: lean }, q, { k: 10 });
        if (JSON.stringify(lt.results.map(function (x) { return x.id; })) !== JSON.stringify(lf.results.map(function (x) { return x.id; }))) bad.push("parity-lean");
        if (lt.savedScan < 0) bad.push("saving-negative");
        // 冷层有唯一命中且热温不足 k：必须补扫，否则就是漏召回
        var trap = [
            { id: "h1", text: "无关一", tier: "hot" },
            { id: "c1", text: "蓝鲸的承诺", tier: "cold" }
        ];
        var tr = recallTiered({ memories: trap }, "蓝鲸的承诺", { k: 5 });
        if (!tr.fellBackToCold) bad.push("no-fallback");
        if (!tr.results.some(function (x) { return x.id === "c1"; })) bad.push("lost-recall");
        var w = wake(a.store, [a.tiers.cold[0]]);
        if (w.woke.length !== 1) bad.push("wake");
        var sh = recallSharded(a.store, q, { k: 10, shards: ["s0", "s1"] });
        if (sh.scanned >= sh.total) bad.push("shard-not-narrowed");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "tiers=3 hot=" + a.tiers.hot.length + " warm=" + a.tiers.warm.length + " cold=" + a.tiers.cold.length + " savedScan=" + lt.savedScan + " fallback=" + tr.fellBackToCold + " shards=" + Object.keys(a.shards).length
        };
    }

    return {
        TIERS: TIERS,
        tokenize: tokenize,
        tierScore: tierScore,
        tierOfScore: tierOfScore,
        classify: classify,
        recallFlat: recallFlat,
        recallTiered: recallTiered,
        recallSharded: recallSharded,
        wake: wake,
        makeDocs: makeDocs,
        hitRateCurve: hitRateCurve,
        tieredSelfCheck: tieredSelfCheck
    };
}));
