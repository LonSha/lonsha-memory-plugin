/* ============================================================
 * memory-forget-cascade.js — [v4.158.0 · R24-O8] 压缩与真删除：让「忘记」真的发生
 * ------------------------------------------------------------
 * 【治的欠债】仓库里到处在做「压缩」（memory-gc / hierarchical-compaction-ledger /
 *   tiered-storage-tiered-compaction-ledger），但压缩的产物仍留在盘上；
 *   `forgetting-explanation.js` 只解释「为什么忘了」。用户要求删掉某段记忆时，
 *   **没有任何路径能真的删除** —— 这也卡住了 X5 隐私面。
 *
 * 【三级删除语义】（三态不塌，各自成态）
 *   `mask`      不再注入、不再召回，本体仍留（留审计）；写墓碑 `masked`。
 *   `purge`     物理删除正文，留墓碑（留下「删过」这个事实，不留内容）。
 *   `purge_all` 连墓碑一起删，不可恢复。
 *
 * 【级联四处】本体 / 索引条目 / 摘要引用 / 注入回执里的快照 —— 同批处理，
 *   漏一处就等于「删了但还能查到」，故 `verifyAbsent()` 逐面验证，
 *   召回面 / 证据面 / 时间线面三面都必须查不到。
 *
 * 【压缩不销毁原文】`compactPreservingSource()` 双留：原文 + 摘要并存，
 *   只有用户明确选 `purge` 才动正文。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaForgetCascade = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var LEVELS = Object.freeze({
        mask: '不注入不召回，正文仍留（留审计）',
        purge: '物理删除正文，留墓碑',
        purge_all: '连墓碑一起删，不可恢复'
    });

    var SURFACES = Object.freeze(['body', 'index', 'summary', 'receipt']);

    function clone(v) { return JSON.parse(JSON.stringify(v)); }

    /**
     * 空库骨架（调用方可用自己的结构，只要四个面同名）。
     */
    function createStore(input) {
        var s = input && typeof input === 'object' ? input : {};
        return {
            memories: Array.isArray(s.memories) ? s.memories : [],
            index: s.index && typeof s.index === 'object' ? s.index : {},
            summaries: Array.isArray(s.summaries) ? s.summaries : [],
            receipts: Array.isArray(s.receipts) ? s.receipts : [],
            tombstones: Array.isArray(s.tombstones) ? s.tombstones : []
        };
    }

    function idOf(x) { return String(x && x.id !== undefined ? x.id : x); }

    function indexTermsOf(index, id) {
        var sid = idOf(id);
        return Object.keys(index || {}).filter(function (t) {
            return Array.isArray(index[t]) && index[t].indexOf(sid) !== -1;
        });
    }

    /** 删一条：返回新库（不改入参），并给出逐面回执。 */
    function forget(store, targetId, level, options) {
        var src = createStore(store);
        var sid = idOf(targetId);
        var lv = LEVELS[level] ? level : null;
        if (!lv) return { ok: false, bad: ['unknown-level'], level: level };
        var o = options && typeof options === 'object' ? options : {};
        var next = clone(src);
        var before = {
            body: next.memories.filter(function (m) { return idOf(m) === sid; }).length,
            index: indexTermsOf(next.index, sid).length,
            summary: next.summaries.filter(function (s) {
                return Array.isArray(s.refs) && s.refs.map(idOf).indexOf(sid) !== -1;
            }).length,
            receipt: next.receipts.filter(function (r) {
                return r && r.snapshot && Array.isArray(r.snapshot.ids) && r.snapshot.ids.map(idOf).indexOf(sid) !== -1;
            }).length
        };

        // ① 索引条目：三级都清（mask 也不许再被召回）
        Object.keys(next.index).forEach(function (t) {
            if (!Array.isArray(next.index[t])) return;
            next.index[t] = next.index[t].filter(function (x) { return idOf(x) !== sid; });
            if (!next.index[t].length) delete next.index[t];
        });

        // ② 摘要引用：三级都清（时间线面不许再指向它）
        next.summaries.forEach(function (s) {
            if (!s || !Array.isArray(s.refs)) return;
            s.refs = s.refs.filter(function (x) { return idOf(x) !== sid; });
        });

        // ③ 注入回执里的快照：三级都清（证据面不许再引它）
        next.receipts.forEach(function (r) {
            if (!r || !r.snapshot || !Array.isArray(r.snapshot.ids)) return;
            r.snapshot.ids = r.snapshot.ids.filter(function (x) { return idOf(x) !== sid; });
        });

        // ④ 本体
        if (lv === 'mask') {
            next.memories.forEach(function (m) {
                if (idOf(m) !== sid) return;
                m.masked = true;
                m.text = o.keepText === true ? m.text : m.text;  // mask 不删正文，只标记
            });
            if (!next.tombstones.some(function (t) { return t.id === sid && t.level === 'mask'; })) {
                next.tombstones.push({ id: sid, level: 'mask', at: String(o.at || ''), note: '留审计，不注入不召回' });
            }
        } else if (lv === 'purge') {
            next.memories.forEach(function (m) {
                if (idOf(m) !== sid) return;
                m.purged = true;
                m.masked = true;
                m.text = null;                    // 正文真的没了
            });
            next.tombstones.push({ id: sid, level: 'purge', at: String(o.at || ''), note: '正文已物理删除' });
        } else {
            next.memories = next.memories.filter(function (m) { return idOf(m) !== sid; });
            next.tombstones = next.tombstones.filter(function (t) { return t.id !== sid; });
        }

        return {
            ok: true,
            level: lv,
            id: sid,
            before: before,
            cascaded: {
                body: lv === 'purge_all' ? before.body : before.body,
                index: before.index,
                summary: before.summary,
                receipt: before.receipt
            },
            store: next
        };
    }

    /** 逐面自证：召回 / 证据 / 时间线三面都查不到（mask 亦须零注入）。 */
    function verifyAbsent(store, targetId) {
        var s = createStore(store);
        var sid = idOf(targetId);
        var recallable = indexTermsOf(s.index, sid).length > 0;
        var inBody = s.memories.some(function (m) { return idOf(m) === sid && m.purged !== true && m.masked !== true; });
        var inSummary = s.summaries.some(function (x) {
            return Array.isArray(x.refs) && x.refs.map(idOf).indexOf(sid) !== -1;
        });
        var inReceipt = s.receipts.some(function (r) {
            return r && r.snapshot && Array.isArray(r.snapshot.ids) && r.snapshot.ids.map(idOf).indexOf(sid) !== -1;
        });
        var tombstoned = s.tombstones.some(function (t) { return t.id === sid; });
        // 【读数面约定】recall/evidence/timeline 读作「该面已清净」（true=查不到）；
        // injectable 读作「仍可被注入」（true=还能注入）。两向都给出，免得调用方猜。
        return {
            recall: !recallable,
            evidence: !inReceipt,
            timeline: !inSummary,
            injectable: inBody,
            tombstoned: tombstoned,
            // 正向同位读数（同名口径，供 debug 与判据直读）
            stillRecallable: recallable,
            stillOnEvidence: inReceipt,
            stillOnTimeline: inSummary,
            ok: !recallable && !inReceipt && !inSummary && !inBody
        };
    }

    /** 压缩：原文与摘要双留（压缩不销毁原文）。 */
    function compactPreservingSource(store, ids, summaryText, options) {
        var s = createStore(store);
        var o = options && typeof options === 'object' ? options : {};
        var list = (Array.isArray(ids) ? ids : []).map(idOf);
        var next = clone(s);
        var texts = next.memories.filter(function (m) { return list.indexOf(idOf(m)) !== -1; });
        if (!texts.length) return { ok: false, bad: ['no-source'], store: next };
        if (texts.some(function (m) { return m.purged === true; })) return { ok: false, bad: ['source-purged'], store: next };
        next.summaries.push({
            id: String(o.id || ('sum-' + (next.summaries.length + 1))),
            text: String(summaryText || ''),
            refs: list.slice(),
            createdAt: String(o.at || '')
        });
        return {
            ok: true,
            store: next,
            keptSource: texts.length,          // 原文一条都没少
            summaryRefs: list.length
        };
    }

    /** 召回面查询（给「删后查不到」的实测用）。 */
    function searchByTerm(store, term) {
        var s = createStore(store);
        return (s.index[String(term)] || []).map(String);
    }

    function forgetCascadeSelfCheck() {
        var bad = [];
        var base = createStore({
            memories: [
                { id: 'm1', text: '他答应过要回来', storyAt: 100 },
                { id: 'm2', text: '今天买了牛奶', storyAt: 200 }
            ],
            index: { '回来': ['m1'], '牛奶': ['m2'], '他': ['m1'] },
            summaries: [{ id: 's1', text: '这三天发生了两件事', refs: ['m1', 'm2'] }],
            receipts: [{ id: 'r1', snapshot: { ids: ['m1', 'm2'] } }],
            tombstones: []
        });

        // mask：不召回、不注入、不引证据，但正文还在（可审计）
        var masked = forget(base, 'm1', 'mask', { at: '2026-11-18' });
        if (!masked.ok) bad.push('mask 应成功');
        if (verifyAbsent(masked.store, 'm1').ok !== true) bad.push('mask 后三面都应查不到');
        var m1 = masked.store.memories.filter(function (m) { return m.id === 'm1'; })[0];
        if (!m1 || m1.text !== '他答应过要回来') bad.push('mask 不许删正文（留审计）');
        if (m1.masked !== true) bad.push('mask 应打标记');
        if (!masked.store.tombstones.length) bad.push('mask 应留墓碑');

        // purge：正文真没了，墓碑在
        var purged = forget(base, 'm1', 'purge', { at: '2026-11-18' });
        var p1 = purged.store.memories.filter(function (m) { return m.id === 'm1'; })[0];
        if (p1 && p1.text !== null) bad.push('purge 必须把正文置空（不是只打标记）');
        if (!purged.store.tombstones.some(function (t) { return t.id === 'm1' && t.level === 'purge'; })) bad.push('purge 应留墓碑');
        if (verifyAbsent(purged.store, 'm1').ok !== true) bad.push('purge 后三面都应查不到');
        if (searchByTerm(purged.store, '回来').length) bad.push('purge 后索引不该还查得到');

        // purge_all：连墓碑一起没了
        var wiped = forget(base, 'm1', 'purge_all', { at: '2026-11-18' });
        if (wiped.store.tombstones.some(function (t) { return t.id === 'm1'; })) bad.push('purge_all 应连墓碑一起删');
        if (verifyAbsent(wiped.store, 'm1').tombstoned !== false) bad.push('purge_all 后不应还有墓碑');
        if (verifyAbsent(wiped.store, 'm1').ok !== true) bad.push('purge_all 后三面都应查不到');

        // 级联回执说清每一面删了几条
        if (purged.cascaded.index !== 2) bad.push('m1 在索引里占两个词，应如实报 2');
        if (purged.cascaded.summary !== 1) bad.push('摘要引用应报 1');
        if (purged.cascaded.receipt !== 1) bad.push('回执快照应报 1');

        // 不许动入参
        if (JSON.stringify(base) !== JSON.stringify(createStore(base))) bad.push('forget 不许改入参库');
        if (base.index['回来'] && base.index['回来'].length !== 1) bad.push('原库索引不该被清');

        // 未知级别拒判
        if (forget(base, 'm1', 'nuke').ok !== false) bad.push('未知级别应拒');

        // 压缩双留：原文一条不少，摘要引用齐
        var cmp = compactPreservingSource(base, ['m1', 'm2'], '这三天发生了两件事', { id: 's2', at: '2026-11-18' });
        if (!cmp.ok) bad.push('压缩应成功');
        if (cmp.keptSource !== 2) bad.push('压缩必须保留原文');
        if (cmp.store.memories.length !== 2) bad.push('压缩后原文条数不变');
        if (cmp.store.summaries.filter(function (s) { return s.id === 's2'; })[0].refs.length !== 2) bad.push('摘要应带两条出处');

        return { ok: bad.length === 0, bad: bad, sample: 'levels=3 surfaces=4 cascade=' + SURFACES.join('/') };
    }

    return {
        LEVELS: LEVELS,
        SURFACES: SURFACES,
        createStore: createStore,
        forget: forget,
        verifyAbsent: verifyAbsent,
        compactPreservingSource: compactPreservingSource,
        searchByTerm: searchByTerm,
        forgetCascadeSelfCheck: forgetCascadeSelfCheck
    };
}));