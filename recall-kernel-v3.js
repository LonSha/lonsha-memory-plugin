/* ============================================================
 * recall-kernel-v3.js — [v4.158.0 · R24-O1] 召回内核：三路融合 + 逐路贡献 + 命中解释
 * ------------------------------------------------------------
 * 【治的欠债】旧「向量」是字符 n-gram 余弦；`calculateSparseScore()` 只是
 *   `lowerDoc.includes(term)` 的命中比例 —— 没有 IDF、没有 tf 饱和、没有长度归一，
 *   于是「常见词命中」与「罕见暗号命中」同权，短句天然占优。融合之后也**没有一路报贡献**，
 *   回答不了「这条为什么被召回」。
 *
 * 【三路候选】
 *   `bm25`  词路：中文单字+二元组 / 拉丁词，IDF + tf 饱和(k1=1.2,b=0.75) + 长度归一；
 *   `ngram` 字符路：保留现有字符 3-gram 余弦（中文短句/近形改述靠它）；
 *   `vector` 向量路：宿主给 embedding 才启用；**没给就是 absent，不许塌成 0 分**。
 *
 * 【融合】确定性 RRF（1/(k+rank)，k=60）—— 同输入两次结果逐条一致；
 *   逐路报账 `{ in, merged, dup, skipped, face }`，关掉某一路能说清哪几条因此掉了。
 *
 * 【命中解释】每条结果带 `why`：命中哪几路、命中哪些词/片段、来自记忆的哪个字段。
 *   缺 why 即不合格（自检直接钉住这条）。
 *
 * 【形态】本仓统一 UMD/IIFE 注册：CJS 侧 module.exports 供测试与注册表 require，
 *   经典脚本侧挂 global.LonShaRecallKernel（宿主 extra_js 按经典脚本加载）。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaRecallKernel = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var ROUTES = Object.freeze(['bm25', 'ngram', 'vector']);
    var ROUTE_FACES = Object.freeze(['hit', 'empty', 'absent', 'disabled']);
    var RRF_K = 60;
    var BM25_K1 = 1.2;
    var BM25_B = 0.75;
    var NGRAM_N = 3;

    /* ---------------- 分词 ---------------- */

    function isCJK(ch) {
        var c = ch.charCodeAt(0);
        return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
    }

    /** 中文：单字 + 相邻二元组（不带滑窗跨标点）；拉丁：小写词。全部小写、去重前先保序。 */
    function tokenize(text) {
        var s = String(text === null || text === undefined ? '' : text).toLowerCase();
        var out = [];
        var i = 0;
        while (i < s.length) {
            var ch = s[i];
            if (/[a-z0-9]/.test(ch)) {
                var j = i;
                while (j < s.length && /[a-z0-9]/.test(s[j])) j += 1;
                out.push(s.slice(i, j));
                i = j;
                continue;
            }
            if (isCJK(ch)) {
                out.push(ch);
                if (i + 1 < s.length && isCJK(s[i + 1])) out.push(ch + s[i + 1]);
                i += 1;
                continue;
            }
            i += 1;
        }
        return out;
    }

    function countTerms(tokens) {
        var m = new Map();
        tokens.forEach(function (t) { m.set(t, (m.get(t) || 0) + 1); });
        return m;
    }

    /* ---------------- 词典与长度表（一次构建，可复用） ---------------- */

    /**
     * @param {Array<{id:string, fields?:object, text?:string}>} docs
     */
    function buildIndex(docs) {
        var list = Array.isArray(docs) ? docs : [];
        var stats = new Map();   // term -> { df }
        var entries = [];
        list.forEach(function (d) {
            var fields = d && typeof d.fields === 'object' && d.fields ? d.fields : { text: String((d && d.text) || '') };
            var perField = {};
            var allTokens = [];
            Object.keys(fields).forEach(function (f) {
                var toks = tokenize(fields[f]);
                perField[f] = countTerms(toks);
                allTokens = allTokens.concat(toks);
            });
            var tfAll = countTerms(allTokens);
            Array.from(tfAll.keys()).forEach(function (t) {
                var rec = stats.get(t) || { df: 0 };
                rec.df += 1;
                stats.set(t, rec);
            });
            entries.push({
                id: String(d && d.id !== undefined ? d.id : ''),
                fieldNames: Object.keys(fields),
                perField: perField,
                tf: tfAll,
                len: allTokens.length
            });
        });
        var avgLen = entries.length ? entries.reduce(function (a, e) { return a + e.len; }, 0) / entries.length : 0;
        return { entries: entries, df: stats, avgLen: avgLen, size: entries.length };
    }

    /** BM25：真 IDF + tf 饱和 + 长度归一。查询词不在库里 ⇒ idf 用 log(1+(N+1)/1) 上限，不返 0。 */
    function bm25Score(index, entry, qTokens) {
        var N = index.size;
        var score = 0;
        var matched = [];
        qTokens.forEach(function (t) {
            var tf = entry.tf.get(t);
            if (!tf) return;
            var df = (index.df.get(t) || { df: 0 }).df;
            var idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
            var denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (entry.len / (index.avgLen || 1)));
            score += idf * ((tf * (BM25_K1 + 1)) / (denom || 1));
            matched.push(t);
        });
        return { score: score, matched: matched };
    }

    /* ---------------- 字符 n-gram 余弦（现有那一路保留） ---------------- */

    function charNgrams(text) {
        var s = String(text === null || text === undefined ? '' : text).toLowerCase().replace(/\s+/g, ' ');
        var out = [];
        for (var i = 0; i + NGRAM_N <= s.length; i += 1) out.push(s.slice(i, i + NGRAM_N));
        if (!out.length && s.length) out.push(s);
        return out;
    }

    function ngramCosine(aText, bText) {
        var a = countTerms(charNgrams(aText));
        var b = countTerms(charNgrams(bText));
        var dot = 0;
        a.forEach(function (v, k) { if (b.has(k)) dot += v * b.get(k); });
        var na = 0; a.forEach(function (v) { na += v * v; });
        var nb = 0; b.forEach(function (v) { nb += v * v; });
        if (!na || !nb) return { score: 0, shared: [] };
        var shared = [];
        a.forEach(function (v, k) { if (b.has(k)) shared.push(k); });
        return { score: dot / (Math.sqrt(na) * Math.sqrt(nb)), shared: shared.slice(0, 6) };
    }

    /* ---------------- 查询改写：只在有证据时做 ---------------- */

    var PRONOUNS = ['他', '她', '它', '他们', '她们', '它们', '这个人', '那个人', '这家伙'];

    /**
     * @param {string} query
     * @param {{activeSubject?:string, subjectEvidence?:number}} context
     */
    function rewriteQuery(query, context) {
        var q = String(query === null || query === undefined ? '' : query);
        var ctx = context && typeof context === 'object' ? context : {};
        var hitPronoun = PRONOUNS.filter(function (p) { return q.indexOf(p) !== -1; });
        if (!hitPronoun.length) return { face: 'not-needed', query: q, replaced: [] };
        var subject = typeof ctx.activeSubject === 'string' ? ctx.activeSubject.trim() : '';
        var evidence = Number(ctx.subjectEvidence);
        if (!subject || !isFinite(evidence) || evidence <= 0) {
            // 证据不足 ⇒ unknown：不改写、不猜，把原因说清楚
            return { face: 'unknown', query: q, replaced: [], reason: 'no-subject-evidence' };
        }
        var out = q;
        hitPronoun.forEach(function (p) { out = out.split(p).join(subject); });
        return { face: 'rewritten', query: out, replaced: hitPronoun, subject: subject, evidence: evidence };
    }

    /* ---------------- 融合：确定性 RRF + 逐路报账 ---------------- */

    function rankedOf(items, scoreOf, fieldOf) {
        var scored = [];
        items.forEach(function (it) {
            var r = scoreOf(it);
            if (r.score > 0) scored.push({ item: it, score: r.score, detail: r });
        });
        // 确定性：分数相同按 id 字典序（不许依赖插入顺序）
        scored.sort(function (x, y) {
            if (y.score !== x.score) return y.score - x.score;
            return String(x.item.id) < String(y.item.id) ? -1 : 1;
        });
        return scored.map(function (s, i) {
            return { id: String(s.item.id), rank: i + 1, score: s.score, detail: s.detail, field: fieldOf ? fieldOf(s.item) : null };
        });
    }

    function textOf(doc) {
        var f = doc && doc.fields && typeof doc.fields === 'object' ? doc.fields : null;
        if (f) return Object.keys(f).map(function (k) { return String(f[k]); }).join(' ');
        return String((doc && doc.text) || '');
    }

    /**
     * @param {{docs:Array, query:string, embeddings?:object, activeSubject?:string, subjectEvidence?:number, routes?:object}} input
     */
    function recall(input) {
        var src = input && typeof input === 'object' ? input : {};
        var docs = Array.isArray(src.docs) ? src.docs : [];
        var enabled = src.routes && typeof src.routes === 'object' ? src.routes : {};
        var useRoute = function (r) { return enabled[r] !== false; };

        var rw = rewriteQuery(src.query, { activeSubject: src.activeSubject, subjectEvidence: src.subjectEvidence });
        var q = rw.query;
        var index = buildIndex(docs);
        var qTokens = tokenize(q).filter(function (t, i, arr) { return arr.indexOf(t) === i; });

        var ledger = {};
        var rankings = {};

        // ① BM25 词路
        if (!useRoute('bm25')) {
            ledger.bm25 = { face: 'disabled', in: 0, merged: 0, dup: 0, skipped: docs.length };
        } else {
            var bm = rankedOf(docs, function (d) {
                var e = index.entries[findEntry(index, d.id)];
                return e ? bm25Score(index, e, qTokens) : { score: 0, matched: [] };
            });
            rankings.bm25 = bm;
            ledger.bm25 = { face: bm.length ? 'hit' : (qTokens.length ? 'empty' : 'empty'), in: docs.length, merged: bm.length, dup: 0, skipped: docs.length - bm.length };
        }

        // ② 字符 n-gram 路
        if (!useRoute('ngram')) {
            ledger.ngram = { face: 'disabled', in: 0, merged: 0, dup: 0, skipped: docs.length };
        } else {
            var ng = rankedOf(docs, function (d) { return ngramCosine(q, textOf(d)); });
            rankings.ngram = ng;
            ledger.ngram = { face: ng.length ? 'hit' : 'empty', in: docs.length, merged: ng.length, dup: 0, skipped: docs.length - ng.length };
        }

        // ③ 向量路：宿主没给 embedding ⇒ absent（不塌成 0 分，也不是 disabled）
        var emb = src.embeddings && typeof src.embeddings === 'object' ? src.embeddings : null;
        if (!useRoute('vector')) {
            ledger.vector = { face: 'disabled', in: 0, merged: 0, dup: 0, skipped: docs.length };
        } else if (!emb || !Array.isArray(emb[String(src.queryHash || 'query')]) && !Array.isArray(emb.__query)) {
            ledger.vector = { face: 'absent', in: 0, merged: 0, dup: 0, skipped: docs.length, reason: 'host-provides-no-embedding' };
        } else {
            var qv = Array.isArray(emb.__query) ? emb.__query : emb[String(src.queryHash || 'query')];
            var vec = rankedOf(docs, function (d) {
                var dv = emb[String(d.id)];
                if (!Array.isArray(dv) || dv.length !== qv.length) return { score: 0, matched: [] };
                var dot = 0; var na = 0; var nb = 0;
                for (var i = 0; i < qv.length; i += 1) { dot += qv[i] * dv[i]; na += qv[i] * qv[i]; nb += dv[i] * dv[i]; }
                return { score: na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0, matched: [] };
            });
            rankings.vector = vec;
            ledger.vector = { face: vec.length ? 'hit' : 'empty', in: docs.length, merged: vec.length, dup: 0, skipped: docs.length - vec.length };
        }

        // 融合：RRF，逐路可追溯
        var acc = new Map();
        var dupCount = 0;
        ROUTES.forEach(function (r) {
            var list = rankings[r] || [];
            list.forEach(function (row) {
                var cur = acc.get(row.id);
                var add = 1 / (RRF_K + row.rank);
                if (!cur) {
                    acc.set(row.id, {
                        id: row.id,
                        score: add,
                        routes: [r],
                        ranks: (function () { var o = {}; o[r] = row.rank; return o; })(),
                        details: {}
                    });
                    acc.get(row.id).details[r] = row.detail;
                } else {
                    dupCount += 1;
                    cur.score += add;
                    cur.routes.push(r);
                    cur.ranks[r] = row.rank;
                    cur.details[r] = row.detail;
                }
            });
            if (ledger[r]) ledger[r].dup = dupCount - (ledger[r].dupBefore || 0);
            if (ledger[r]) ledger[r].dupBefore = dupCount;
        });

        // 内部记账用的 dupBefore 不许外泄（读数面只留 in/merged/dup/skipped/face）
        Object.keys(ledger).forEach(function (k) { delete ledger[k].dupBefore; });

        // 结果：附 why（命中哪几路 / 命中哪些词或片段 / 来自哪个字段）
        var byId = new Map();
        docs.forEach(function (d) { byId.set(String(d && d.id), d); });
        var out = Array.from(acc.values()).map(function (row) {
            var doc = byId.get(row.id) || {};
            var matchedTerms = [];
            if (row.details.bm25 && Array.isArray(row.details.bm25.matched)) matchedTerms = matchedTerms.concat(row.details.bm25.matched);
            var sharedNgrams = row.details.ngram && Array.isArray(row.details.ngram.shared) ? row.details.ngram.shared : [];
            var field = fieldOfHit(doc, matchedTerms);
            return {
                id: row.id,
                score: Number(row.score.toFixed(6)),
                routes: row.routes.slice(),
                ranks: row.ranks,
                why: {
                    routes: row.routes.slice(),
                    terms: matchedTerms.slice(0, 6),
                    ngrams: sharedNgrams.slice(0, 3),
                    field: field,
                    text: String((field ? (doc.fields || {})[field] : textOf(doc)) || '').slice(0, 40)
                }
            };
        }).sort(function (x, y) {
            if (y.score !== x.score) return y.score - x.score;
            return x.id < y.id ? -1 : 1;
        });

        return {
            ok: true,
            query: q,
            rewrite: rw,
            routes: ledger,
            routeFaces: Object.keys(ledger).reduce(function (o, k) { o[k] = ledger[k].face; return o; }, {}),
            results: out,
            counts: { docs: docs.length, hits: out.length, dup: dupCount }
        };
    }

    function findEntry(index, id) {
        var sid = String(id);
        for (var i = 0; i < index.entries.length; i += 1) if (index.entries[i].id === sid) return i;
        return -1;
    }

    function fieldOfHit(doc, terms) {
        var f = doc && doc.fields && typeof doc.fields === 'object' ? doc.fields : null;
        if (!f) return 'text';
        var keys = Object.keys(f);
        for (var i = 0; i < keys.length; i += 1) {
            var lower = String(f[keys[i]]).toLowerCase();
            for (var j = 0; j < terms.length; j += 1) {
                if (lower.indexOf(terms[j]) !== -1) return keys[i];
            }
        }
        return keys[0] || 'text';
    }

    /* ---------------- 自检 ---------------- */

    function recallKernelSelfCheck() {
        var bad = [];
        var docs = [
            { id: 'm1', fields: { text: '他答应过要回来，明天在车站见', time: '3天前' } },
            { id: 'm2', fields: { text: '他说会回来，别担心', time: '昨天' } },
            { id: 'm3', fields: { text: '今天去超市买了牛奶', time: '今天' } },
            { id: 'm4', fields: { text: '暗号：蓝鲸在第七码头', time: '上周' } }
        ];

        // ① 确定性：同输入两次逐条一致
        var a = recall({ docs: docs, query: '他说会回来' });
        var b = recall({ docs: docs, query: '他说会回来' });
        if (JSON.stringify(a.results) !== JSON.stringify(b.results)) bad.push('两次结果必须逐条一致');

        // ② BM25 必须真带 IDF：罕见暗号查询命中时，常见词文档不许挤上来
        var rare = recall({ docs: docs, query: '蓝鲸' });
        if (!rare.results.length || rare.results[0].id !== 'm4') bad.push('罕见词查询应首位命中 m4');

        // ③ 关掉某一路：结果可解释地变化（不是随机漂移）
        var noNgram = recall({ docs: docs, query: '他说会回来', routes: { ngram: false } });
        if (noNgram.routes.ngram.face !== 'disabled') bad.push('关掉 ngarm 应报 disabled');
        if (JSON.stringify(noNgram.results) === JSON.stringify(a.results)) bad.push('关一路后结果必须可解释地变化');
        if (noNgram.results.some(function (r) { return r.routes.indexOf('ngram') !== -1; })) bad.push('关掉的路不许出现在结果 routes 里');

        // ④ 向量路缺席 ⇒ absent（不塌成 0、不是 disabled）
        if (a.routes.vector.face !== 'absent') bad.push('无 embedding 应报 absent');
        if (a.routes.vector.face === a.routes.ngram.face) bad.push('absent 与 hit 不许同形');

        // ⑤ 每条结果都有可读命中理由
        a.results.forEach(function (r) {
            if (!r.why || !r.why.routes.length) bad.push('结果缺命中路：' + r.id);
            if (!r.why.field) bad.push('结果缺命中字段：' + r.id);
            if (!r.why.terms.length && !r.why.ngrams.length) bad.push('结果缺命中证据：' + r.id);
        });

        // ⑥ 指代改写：有证据才做，证据不足 unknown
        var rwUnknown = rewriteQuery('他说会回来', {});
        if (rwUnknown.face !== 'unknown' || rwUnknown.query !== '他说会回来') bad.push('无证据时不许改写（unknown）');
        var rwOk = rewriteQuery('他说会回来', { activeSubject: '阿明', subjectEvidence: 3 });
        if (rwOk.face !== 'rewritten' || rwOk.query.indexOf('阿明') === -1) bad.push('有证据时应改写');

        // ⑦ 逐路报账：in/merged/dup/skipped 都说得清
        if (a.routes.bm25.in !== docs.length) bad.push('bm25 in 应为全库条数');
        var sum = a.routes.bm25.merged + a.routes.bm25.skipped;
        if (sum !== docs.length) bad.push('merged + skipped 应等于全库条数');

        return { ok: bad.length === 0, bad: bad, sample: 'docs=' + docs.length + ' hits=' + a.results.length + ' routes=' + Object.keys(a.routes).filter(function (k) { return a.routes[k].face === 'hit'; }).join('+') };
    }

    return {
        ROUTES: ROUTES,
        ROUTE_FACES: ROUTE_FACES,
        RRF_K: RRF_K,
        tokenize: tokenize,
        buildIndex: buildIndex,
        bm25Score: bm25Score,
        ngramCosine: ngramCosine,
        rewriteQuery: rewriteQuery,
        recall: recall,
        recallKernelSelfCheck: recallKernelSelfCheck
    };
}));