/* ============================================================
 * memory-write-idempotent.js — R24-O5 写入幂等：重复记忆与冲突合并
 *
 * 【治的欠债】抽取是「每轮抽一次」，同一事实在十轮里会被抽十条近似记录：
 *   库越写越胖，召回被自己的回声淹没，冲突裁决只在「事后」跑，写入侧没有刹车。
 *
 * 【入口幂等键】subject | predicate | object(归一) | timeBucket
 *   同一个键在同一时间桶内重复写入，库内条数不变 —— 这是幂等的硬判据。
 *
 * 【三态合并（不捣成一个 skip）】
 *   same     对象与限定词都一致 ⇒ 只累加 seenCount 与出处，条目数不变
 *   refine   对象一致、限定词/置信度有增量 ⇒ 原地补全并留痕（保留原 id）
 *   conflict 同键但对象归一后仍不同 ⇒ 交给裁决：newer-wins 或 hold，两造都写进回执
 *
 * 【回执】每次写入都产出一条回执（add/same/refine/conflict），
 *   漏回执就等于「悄悄改了库」，复盘时说不清。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaWriteIdempotent = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATES = Object.freeze({
        same: '对象与限定词一致，只累加出处',
        refine: '对象一致，限定词有增量，原地补全',
        conflict: '同键不同对象，必须裁决'
    });

    var DEFAULT_BUCKET_MS = 6 * 3600 * 1000;

    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function str(v) { return v === null || v === undefined ? '' : String(v); }

    /** 二级键：主体|谓词|时间桶（不带对象）——把「同事实不同说法」判成 conflict */
    function spkKey(rec, options) {
        var o = options && typeof options === 'object' ? options : {};
        var r = rec && typeof rec === 'object' ? rec : {};
        return [str(r.subject || r.owner || '_'), str(r.predicate || r.pred || '_'), bucketOf(r, o.bucketMs)].join('|');
    }

    /** 对象归一：去标点、压空白、统一大小写。归一是幂等键成立的前提。 */
    function normObject(v) {
        // 逐个字符判定，不用转义密集的正则字面量（真机/转义一旦拐弯就静默失效）。
        var raw = str(v).toLowerCase();
        var out = '';
        for (var i = 0; i < raw.length; i++) {
            var c = raw.charCodeAt(i);
            if (c <= 32 || c === 12288 || c === 160) continue;              // 空白（含全角空格、nbsp）
            if (c >= 0x2000 && c <= 0x206f) continue;                       // 通用标点
            if (c >= 0x3000 && c <= 0x303f) continue;                       // CJK 标点（、。「」等）
            if (c >= 0xff00 && c <= 0xff20) continue;                       // 全角符号/数字区
            if (c >= 0xff3b && c <= 0xff40) continue;
            if (c >= 0xff5b && c <= 0xff65) continue;
            if (c >= 0x21 && c <= 0x2f) continue;                           // !"#$%&()*+,-./
            if (c >= 0x3a && c <= 0x40) continue;                           // :;<=>?@
            if (c >= 0x5b && c <= 0x60) continue;                           // [\]^_`
            if (c >= 0x7b && c <= 0x7e) continue;                           // {|}~
            out += raw.charAt(i);
        }
        return out;
    }

    function tsOf(rec) {
        var t = rec && (rec.at || rec.createdAt || rec.timestamp);
        var n = t === undefined || t === null || t === '' ? NaN : Date.parse(t);
        return Number.isFinite(n) ? n : 0;
    }

    function bucketOf(rec, bucketMs) {
        var w = Number(bucketMs) > 0 ? Number(bucketMs) : DEFAULT_BUCKET_MS;
        return Math.floor(tsOf(rec) / w);
    }

    function idempotencyKey(rec, options) {
        var o = options && typeof options === 'object' ? options : {};
        var r = rec && typeof rec === 'object' ? rec : {};
        return [
            str(r.subject || r.owner || '_'),
            str(r.predicate || r.pred || '_'),
            normObject(r.object !== undefined ? r.object : r.value),
            bucketOf(r, o.bucketMs)
        ].join('|');
    }

    /** 限定词面：qualifiers 之外，把 confidence/地点/来源也算进「增量面」。 */
    function facetsOf(rec) {
        var f = {};
        var q = rec && rec.qualifiers && typeof rec.qualifiers === 'object' ? rec.qualifiers : {};
        Object.keys(q).forEach(function (k) { f[k] = normObject(q[k]); });
        if (rec && rec.confidence !== undefined) f.__confidence = Number(rec.confidence);
        return f;
    }

    function emptyStore(input) {
        var s = input && typeof input === 'object' ? input : {};
        return {
            records: Array.isArray(s.records) ? s.records : [],
            receipts: Array.isArray(s.receipts) ? s.receipts : []
        };
    }

    /** 逐条写入（纯函数：返回新库，不改入参）。 */
    function write(store, rec, options) {
        var s = emptyStore(store);
        var o = options && typeof options === 'object' ? options : {};
        var next = clone(s);
        var key = idempotencyKey(rec, o);
        var sk = spkKey(rec, o);
        var nowIso = str(o.at || (rec && rec.at) || '');
        var hit = null;
        for (var i = 0; i < next.records.length; i++) {
            if (next.records[i].__key === key) { hit = next.records[i]; break; }
        }
        var objNow = normObject(rec && (rec.object !== undefined ? rec.object : rec.value));

        // 一级：同幂等键命中 ⇒ same / refine
        if (hit) {
            var fa = facetsOf(hit);
            var fb = facetsOf(rec);
            var diff = [];
            Object.keys(fb).forEach(function (k) {
                if (fa[k] === undefined) { diff.push({ facet: k, before: null, after: fb[k] }); return; }
                if (String(fa[k]) !== String(fb[k])) diff.push({ facet: k, before: fa[k], after: fb[k] });
            });
            if (!diff.length) {
                hit.seenCount = (hit.seenCount || 1) + 1;
                var srcSame = str((rec && (rec.source || rec.sessionId)) || 'unknown');
                if (!Array.isArray(hit.sources)) hit.sources = [];
                if (hit.sources.indexOf(srcSame) === -1) hit.sources.push(srcSame);
                next.receipts.push({ kind: 'same', key: key, id: hit.id, at: nowIso });
                return { ok: true, state: 'same', key: key, id: hit.id, store: next };
            }
            diff.forEach(function (d) {
                if (!hit.qualifiers || typeof hit.qualifiers !== 'object') hit.qualifiers = {};
                if (d.facet === '__confidence') hit.confidence = d.after;
                else hit.qualifiers[d.facet] = d.after;
            });
            next.receipts.push({ kind: 'refine', key: key, id: hit.id, diff: diff, at: nowIso });
            return { ok: true, state: 'refine', key: key, id: hit.id, diff: diff, store: next };
        }

        // 二级：同主体+谓词+时间桶、对象不同 ⇒ conflict（必须裁决，不许默默新增）
        var rival = null;
        for (var j = 0; j < next.records.length; j++) {
            var r0 = next.records[j];
            if (r0.__spk !== sk) continue;
            var o0 = normObject(r0.object !== undefined ? r0.object : r0.value);
            if (o0 !== objNow) { rival = r0; break; }
        }
        if (rival) {
            var keepNew = tsOf(rec) >= tsOf(rival);
            var receipt = {
                kind: 'conflict', key: key, spk: sk, id: rival.id,
                resolution: keepNew ? 'newer-wins' : 'held-older-wins',
                before: rival.object, after: rec.object,
                at: nowIso
            };
            if (keepNew) {
                if (!Array.isArray(rival.superseded)) rival.superseded = [];
                rival.superseded.push({ object: rival.object, at: rival.at, confidence: rival.confidence });
                rival.object = rec.object;
                rival.at = rec.at;
                if (rec.confidence !== undefined) rival.confidence = rec.confidence;
                rival.__key = key;
                rival.conflict = true;
            }
            next.receipts.push(receipt);
            return { ok: true, state: 'conflict', key: key, id: rival.id, resolution: receipt.resolution, store: next };
        }

        // 三级：真新事实 ⇒ add
        var fresh = clone(rec);
        fresh.__key = key;
        fresh.__spk = sk;
        fresh.seenCount = 1;
        fresh.sources = [str((rec && (rec.source || rec.sessionId)) || 'unknown')];
        next.records.push(fresh);
        next.receipts.push({ kind: 'add', key: key, id: fresh.id, at: nowIso });
        return { ok: true, state: 'add', key: key, id: fresh.id, store: next };
    }

    /** 批量写入：按入参顺序逐条走 write。 */
    function writeBatch(store, records, options) {
        var s = emptyStore(store);
        var list = Array.isArray(records) ? records : [];
        var counts = { add: 0, same: 0, refine: 0, conflict: 0 };
        var out = s;
        list.forEach(function (r) {
            var res = write(out, r, options);
            out = res.store;
            counts[res.state] = (counts[res.state] || 0) + 1;
        });
        return { ok: true, counts: counts, size: out.records.length, store: out };
    }

    /** 幂等自证：同一批写两遍，库内条数不许变。 */
    function verifyIdempotent(store, records, options) {
        var first = writeBatch(store, records, options);
        var second = writeBatch(first.store, records, options);
        return {
            ok: second.size === first.size && second.counts.add === 0,
            sizeOnce: first.size,
            sizeTwice: second.size,
            grow: second.size - first.size,
            secondAdds: second.counts.add
        };
    }

    function writeIdempotentSelfCheck() {
        var bad = [];
        var base = { records: [], receipts: [] };
        var rec = { id: 'r1', subject: '我', predicate: '答应', object: '明天在车站见', at: '2026-11-18T09:00:00Z' };
        var a = write(base, rec, { at: '2026-11-18' });
        if (a.state !== 'add' || a.store.records.length !== 1) bad.push('add');
        var b = write(a.store, rec, { at: '2026-11-18' });
        if (b.state !== 'same' || b.store.records.length !== 1) bad.push('same');
        var c = write(b.store, Object.assign({}, rec, { qualifiers: { place: '车站' } }), { at: '2026-11-18' });
        if (c.state !== 'refine' || c.store.records.length !== 1) bad.push('refine');
        var d = write(c.store, Object.assign({}, rec, { object: '后天见', at: '2026-11-18T10:00:00Z' }), { at: '2026-11-18' });
        if (d.state !== 'conflict') bad.push('conflict');
        var idem = verifyIdempotent(base, [rec, rec, rec]);
        if (!idem.ok || idem.sizeOnce !== 1) bad.push('idempotent');
        return {
            ok: bad.length === 0, bad: bad,
            sample: 'states=' + Object.keys(STATES).length + ' receipts=' + d.store.receipts.length + ' idem=' + idem.sizeOnce + '/' + idem.sizeTwice
        };
    }

    return {
        STATES: STATES,
        DEFAULT_BUCKET_MS: DEFAULT_BUCKET_MS,
        normObject: normObject,
        idempotencyKey: idempotencyKey,
        emptyStore: emptyStore,
        write: write,
        writeBatch: writeBatch,
        verifyIdempotent: verifyIdempotent,
        writeIdempotentSelfCheck: writeIdempotentSelfCheck
    };
}));
