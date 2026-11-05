/* memory-migrate-pack.js
 * [v3.445.0 . L13-X5] Portable memory migration pack.
 *
 * WHY THIS MODULE EXISTS
 *   Before this file, the plugin had no real import path: `importMemory` does not
 *   exist anywhere in index.js, `exportMemoryReport` emits a human report (not a
 *   re-importable artifact), and the four `import(data)` calls inside
 *   memory-organs.js are internal state hydrators, not user facing migration.
 *   A person who wants to move half a memory ledger onto another conversation
 *   therefore had no way to do it, and no way to review what would happen first.
 *
 * WHAT IT IS / IS NOT
 *   - It is a serializer + verifier. It owns NO storage and defines NO new
 *     storage key: every byte it touches comes from `organs.export()` shape
 *     ({ memories, autobiographies, tombstones }) which lives in
 *     chatMetadata.extensions['lonsha_memory'].data.
 *   - It never mutates the caller's state in place. `applyImport` returns a NEW
 *     state object; the host decides whether to persist it.
 *   - It never overwrites anything by default. Conflicts carry no decision =>
 *     the entry is skipped and reported as pending.
 *   - Corruption is fail-closed: one bad per-entry sha (or a bad head sha) makes
 *     the WHOLE pack unusable. Partial trust is worse than no trust.
 *
 * PACK SHAPE (schema 1)
 *   {
 *     format: 'lonsha-memory-pack',
 *     schema: 1,
 *     createdAt: <ms>,
 *     meta: { ... free-form provenance, not covered by headSha },
 *     counts: { entries: n, chars: n, layers: { core: n, recent: n } },
 *     entries: [ { char, layer: 'core'|'recent', item: {...}, sha: <64 hex> } ],
 *     headSha: <64 hex over format+schema+counts+entries>
 *   }
 *
 * EXPORTED API
 *   packMemory(opts)                 -> pack
 *   verifyPack(pack)                 -> { ok, reason, entries }
 *   precheckImport(pack, local)      -> { ok, rejected, counts, added, conflicts, identical, unrecognized }
 *   applyImport(pack, local, dec)    -> { ok, rejected, state, report, pending }
 *   conflictIdOf(char, text, floor)  -> deterministic id for 'keep both' copies
 *   entryKeyOf(char, layer, id)      -> stable decision key
 */
(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
    else { root.LonShaMigratePack = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var VERSION = '3.446.0';
    const FORMAT = 'lonsha-memory-pack';
    const PACK_SCHEMA = 1;
    const MAX_TEXT = 200;
    const LAYERS = ['core', 'recent'];
    const ID_PREFIX = { core: 'cm_', recent: 'mr_' };
    const CONFLICT_PREFIX = 'cf_';

    // ---------- small helpers ----------
    function _s(v) { return (v === null || v === undefined) ? '' : String(v); }
    function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function _deep(v) {
        try { return (v === undefined) ? undefined : JSON.parse(JSON.stringify(v)); }
        catch (_) { return null; }
    }
    function _rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

    // ---------- sha256 (self contained, no deps) ----------
    const _K = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];

    function _utf8(str) {
        const s = _s(str);
        const out = [];
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c < 0x80) { out.push(c); }
            else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
            else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
                const cp = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
            } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
        }
        return out;
    }

    function sha256(msg) {
        const body = _utf8(msg);
        const bitLen = body.length * 8;
        body.push(0x80);
        while (body.length % 64 !== 56) { body.push(0); }
        const hi = Math.floor(bitLen / 4294967296);
        const lo = bitLen >>> 0;
        body.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
        body.push((lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);

        const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
        const w = new Array(64);

        for (let off = 0; off < body.length; off += 64) {
            for (let i = 0; i < 16; i++) {
                w[i] = (((body[off + i * 4] << 24) | (body[off + i * 4 + 1] << 16) | (body[off + i * 4 + 2] << 8) | body[off + i * 4 + 3]) >>> 0);
            }
            for (let i = 16; i < 64; i++) {
                const s0 = (_rotr(w[i - 15], 7) ^ _rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
                const s1 = (_rotr(w[i - 2], 17) ^ _rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
                w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
            }
            let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
            for (let i = 0; i < 64; i++) {
                const S1 = (_rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25)) >>> 0;
                const ch = ((e & f) ^ (~e & g)) >>> 0;
                const t1 = (h + S1 + ch + _K[i] + w[i]) >>> 0;
                const S0 = (_rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22)) >>> 0;
                const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
                const t2 = (S0 + maj) >>> 0;
                h = g; g = f; f = e; e = (d + t1) >>> 0;
                d = c; c = b; b = a; a = (t1 + t2) >>> 0;
            }
            H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
            H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
        }
        return H.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
    }

    // ---------- canonical form (stable key order, so both ends hash alike) ----------
    function canon(v) {
        if (v === undefined) { return 'null'; }
        if (v === null || typeof v !== 'object') { return JSON.stringify(v); }
        if (Array.isArray(v)) { return '[' + v.map(canon).join(',') + ']'; }
        const keys = Object.keys(v).sort();
        const parts = [];
        for (let i = 0; i < keys.length; i++) { parts.push(JSON.stringify(keys[i]) + ':' + canon(v[keys[i]])); }
        return '{' + parts.join(',') + '}';
    }

    // ---------- keys ----------
    function entryKeyOf(char, layer, id) { return _s(char) + '|' + _s(layer) + '|' + _s(id); }
    function conflictIdOf(char, text, floor) {
        const f = Math.max(0, Math.round(Number(floor) || 0));
        return CONFLICT_PREFIX + sha256(_s(char) + '|' + _s(text)).slice(0, 12) + '_' + f;
    }

    function _entrySha(char, layer, item) {
        return sha256(canon({ char: _s(char), layer: _s(layer), item: item }));
    }
    function _headSha(pack) {
        const body = {
            format: FORMAT,
            schema: pack.schema,
            counts: pack.counts,
            entries: pack.entries
        };
        const identity = _identityOf(pack.meta);
        if (Object.keys(identity).length) body.identity = identity;
        return sha256(canon(body));
    }
    function _identityOf(meta) {
        const raw = _isObj(meta) && _isObj(meta.identity) ? meta.identity : {};
        const out = {};
        ['character', 'project', 'branch', 'chatId'].forEach(function (key) {
            const value = _s(raw[key]).trim();
            if (value) out[key] = value.slice(0, 160);
        });
        return out;
    }
    function _identityCheck(pack, local) {
        const source = _identityOf(pack && pack.meta);
        const target = _identityOf(local && local.migrationIdentity ? { identity: local.migrationIdentity } : local && local.meta);
        const compared = [];
        const mismatches = [];
        ['character', 'project', 'branch'].forEach(function (key) {
            if (source[key] && target[key]) {
                compared.push(key);
                if (source[key] !== target[key]) mismatches.push(key);
            }
        });
        return {
            source: source,
            target: target,
            compared: compared,
            mismatches: mismatches,
            comparable: compared.length > 0,
            ok: mismatches.length === 0
        };
    }
    // ---------- item normalization / shape checks ----------
    function _normItem(item) {
        if (!_isObj(item)) { return { ok: false, reason: 'item-not-object' }; }
        const id = _s(item.id).trim();
        if (!id) { return { ok: false, reason: 'item-id-missing' }; }
        if (typeof item.text !== 'string') { return { ok: false, reason: 'item-text-missing' }; }
        if (item.text.length > MAX_TEXT) { return { ok: false, reason: 'item-text-too-long' }; }
        const floor = Number(item.floor);
        if (item.floor !== undefined && item.floor !== null && !isFinite(floor)) { return { ok: false, reason: 'item-floor-invalid' }; }
        const out = _deep(item) || {};
        out.id = id;
        out.text = item.text;
        out.floor = isFinite(floor) ? Math.max(0, Math.round(floor)) : 0;
        return { ok: true, item: out };
    }

    function _checkEntryShape(e) {
        if (!_isObj(e)) { return { ok: false, reason: 'entry-not-object' }; }
        const char = _s(e.char);
        if (!char.trim()) { return { ok: false, reason: 'entry-char-missing' }; }
        if (LAYERS.indexOf(_s(e.layer)) < 0) { return { ok: false, reason: 'entry-layer-invalid' }; }
        const norm = _normItem(e.item);
        if (!norm.ok) { return { ok: false, reason: 'entry-' + norm.reason }; }
        return { ok: true };
    }

    // Semantic recognizability: shape legal but the entry cannot be trusted to
    // restore anything meaningful. These are NEVER written, only reported.
    function _recognize(char, layer, item) {
        const id = _s(item.id);
        if (!_s(item.text).trim()) { return { ok: false, reason: 'empty-text' }; }
        const want = ID_PREFIX[layer];
        const prefixed = id.indexOf(want) === 0 || id.indexOf(CONFLICT_PREFIX) === 0;
        if (!prefixed) { return { ok: false, reason: 'id-prefix-mismatch:' + layer }; }
        if (_s(char).length > 120) { return { ok: false, reason: 'char-name-too-long' }; }
        return { ok: true };
    }

    // ---------- state normalization (never mutates input) ----------
    function _normState(local) {
        const src = _isObj(local) ? local : {};
        const memSrc = _isObj(src.memories) ? src.memories : (src.core || src.recent ? src : {});
        const out = {
            memories: {},
            autobiographies: _isObj(src.autobiographies) ? (_deep(src.autobiographies) || {}) : {},
            tombstones: _isObj(src.tombstones) ? (_deep(src.tombstones) || {}) : {}
        };
        const names = Object.keys(memSrc);
        for (let i = 0; i < names.length; i++) {
            const b = _isObj(memSrc[names[i]]) ? memSrc[names[i]] : {};
            out.memories[names[i]] = {
                core: Array.isArray(b.core) ? (_deep(b.core) || []) : [],
                recent: Array.isArray(b.recent) ? (_deep(b.recent) || []) : []
            };
        }
        return out;
    }

    function _bucket(state, char) {
        if (!state.memories[char]) { state.memories[char] = { core: [], recent: [] }; }
        const b = state.memories[char];
        if (!Array.isArray(b.core)) { b.core = []; }
        if (!Array.isArray(b.recent)) { b.recent = []; }
        return b;
    }

    function _tombstoneIds(state, char) {
        const rows = state.tombstones && state.tombstones[char];
        const set = {};
        if (Array.isArray(rows)) {
            for (let i = 0; i < rows.length; i++) {
                const id = _s(rows[i] && rows[i].item && rows[i].item.id);
                if (id) { set[id] = true; }
            }
        }
        return set;
    }

    // ---------- export ----------
    function packMemory(opts) {
        const o = _isObj(opts) ? opts : {};
        const src = _isObj(o.source) ? o.source : {};
        const memories = _isObj(src.memories) ? src.memories : (src.core || src.recent ? src : {});
        const allChars = Object.keys(memories);

        let chars = allChars;
        if (Array.isArray(o.chars) && o.chars.length) {
            const want = {};
            for (let i = 0; i < o.chars.length; i++) { want[_s(o.chars[i])] = true; }
            chars = allChars.filter(function (c) { return want[c] === true; });
        }

        let layers = LAYERS.slice();
        if (Array.isArray(o.layers) && o.layers.length) {
            layers = LAYERS.filter(function (l) { return o.layers.indexOf(l) >= 0; });
        }

        const since = (typeof o.sinceFloor === 'number' && isFinite(o.sinceFloor)) ? o.sinceFloor : null;
        const until = (typeof o.untilFloor === 'number' && isFinite(o.untilFloor)) ? o.untilFloor : null;

        const entries = [];
        const skipped = [];
        const layerCount = { core: 0, recent: 0 };
        const charSeen = {};

        for (let ci = 0; ci < chars.length; ci++) {
            const char = chars[ci];
            const bucket = _isObj(memories[char]) ? memories[char] : null;
            if (!bucket) { continue; }
            for (let li = 0; li < layers.length; li++) {
                const layer = layers[li];
                const list = Array.isArray(bucket[layer]) ? bucket[layer] : [];
                for (let ii = 0; ii < list.length; ii++) {
                    const norm = _normItem(list[ii]);
                    if (!norm.ok) { skipped.push({ char: char, layer: layer, index: ii, reason: norm.reason }); continue; }
                    if (since !== null && norm.item.floor < since) { continue; }
                    if (until !== null && norm.item.floor > until) { continue; }
                    entries.push({
                        char: char,
                        layer: layer,
                        item: norm.item,
                        sha: _entrySha(char, layer, norm.item)
                    });
                    layerCount[layer] = (layerCount[layer] || 0) + 1;
                    charSeen[char] = true;
                }
            }
        }

        const pack = {
            format: FORMAT,
            schema: PACK_SCHEMA,
            createdAt: (typeof o.now === 'number' && isFinite(o.now)) ? o.now : Date.now(),
            meta: _isObj(o.meta) ? (_deep(o.meta) || {}) : {},
            counts: {
                entries: entries.length,
                chars: Object.keys(charSeen).length,
                layers: { core: layerCount.core || 0, recent: layerCount.recent || 0 }
            },
            entries: entries
        };
        pack.headSha = _headSha(pack);
        pack.skipped = skipped;
        return pack;
    }

    // ---------- verify (fail closed) ----------
    function verifyPack(pack) {
        function fail(reason, at) {
            return { ok: false, reason: reason, entries: 0, at: (typeof at === 'number' ? at : -1) };
        }
        try {
            if (!_isObj(pack)) { return fail('not-object'); }
            if (pack.format !== FORMAT) { return fail('bad-format'); }
            const schema = pack.schema;
            if (!(typeof schema === 'number' && schema >= 1 && schema <= PACK_SCHEMA)) { return fail('bad-schema:' + _s(schema)); }
            if (!Array.isArray(pack.entries)) { return fail('entries-not-array'); }
            if (!_isObj(pack.counts)) { return fail('counts-missing'); }
            if (Number(pack.counts.entries) !== pack.entries.length) { return fail('count-mismatch'); }

            for (let i = 0; i < pack.entries.length; i++) {
                const e = pack.entries[i];
                const shape = _checkEntryShape(e);
                if (!shape.ok) { return fail('entry-shape:' + shape.reason, i); }
                if (!_s(e.sha)) { return fail('entry-sha-missing', i); }
                const got = _entrySha(e.char, e.layer, e.item);
                if (_s(e.sha) !== got) { return fail('entry-sha-mismatch', i); }
            }

            const head = _s(pack.headSha);
            if (!head) { return fail('head-sha-missing'); }
            if (head !== _headSha(pack)) { return fail('head-sha-mismatch'); }

            return { ok: true, reason: 'ok', entries: pack.entries.length, at: -1 };
        } catch (err) {
            return fail('verify-threw:' + _s(err && err.message));
        }
    }

    // ---------- precheck (writes nothing) ----------
    function precheckImport(pack, local) {
        const v = verifyPack(pack);
        const empty = { added: [], conflicts: [], identical: [], unrecognized: [] };
        if (!v.ok) {
            return {
                ok: false, rejected: true, reason: v.reason, at: v.at,
                counts: { add: 0, conflict: 0, identical: 0, unrecognized: 0, tombstoned: 0, total: 0 },
                summary: { total: 0, add: 0, conflict: 0, identical: 0, unrecognized: 0, tombstoned: 0, identity: null },
                added: [], conflicts: [], identical: [], unrecognized: [],
                tombstoned: []
            };
        }
        const identity = _identityCheck(pack, local);
        if (!identity.ok) {
            return {
                ok: false, rejected: true, reason: 'identity-mismatch', at: -1,
                counts: { add: 0, conflict: 0, identical: 0, unrecognized: 0, tombstoned: 0, total: pack.entries.length },
                summary: { total: pack.entries.length, add: 0, conflict: 0, identical: 0, unrecognized: 0, tombstoned: 0, identity: identity },
                added: [], conflicts: [], identical: [], unrecognized: [], tombstoned: [], identity: identity
            };
        }
        const state = _normState(local);
        const out = { added: [], conflicts: [], identical: [], unrecognized: [], tombstoned: [] };
        const dead = {};

        for (let i = 0; i < pack.entries.length; i++) {
            const e = pack.entries[i];
            const row = {
                key: entryKeyOf(e.char, e.layer, e.item.id),
                char: e.char, layer: e.layer, index: i,
                item: _deep(e.item), sha: e.sha
            };
            const rec = _recognize(e.char, e.layer, e.item);
            if (!rec.ok) {
                row.reason = rec.reason;
                out.unrecognized.push(row);
                continue;
            }
            if (!dead[e.char]) { dead[e.char] = _tombstoneIds(state, e.char); }
            if (dead[e.char][e.item.id]) {
                row.reason = 'tombstoned-locally';
                out.tombstoned.push(row);
                continue;
            }
            const bucket = state.memories[e.char];
            const list = (bucket && Array.isArray(bucket[e.layer])) ? bucket[e.layer] : [];
            let found = null;
            for (let j = 0; j < list.length; j++) {
                if (_s(list[j] && list[j].id) === _s(e.item.id)) { found = list[j]; break; }
            }
            if (!found) { out.added.push(row); }
            else if (_s(found.text) === _s(e.item.text)) { row.local = _deep(found); out.identical.push(row); }
            else { row.local = _deep(found); out.conflicts.push(row); }
        }

        return {
            ok: true, rejected: false, reason: 'ok', at: -1,
            counts: {
                add: out.added.length,
                conflict: out.conflicts.length,
                identical: out.identical.length,
                unrecognized: out.unrecognized.length,
                tombstoned: out.tombstoned.length,
                total: pack.entries.length
            },
            summary: {
                total: pack.entries.length,
                add: out.added.length,
                conflict: out.conflicts.length,
                identical: out.identical.length,
                unrecognized: out.unrecognized.length,
                tombstoned: out.tombstoned.length,
                identity: identity
            },
            identity: identity,
            added: out.added,
            conflicts: out.conflicts,
            identical: out.identical,
            unrecognized: out.unrecognized,
            tombstoned: out.tombstoned
        };
    }

    // ---------- apply (explicit decisions only, never default overwrite) ----------
    const DECISIONS = ['keep-local', 'use-pack', 'keep-both'];

    function applyImport(pack, local, decisions) {
        const pre = precheckImport(pack, local);
        if (!pre.ok) {
            return {
                ok: false, rejected: true, reason: pre.reason,
                state: null, pending: [], decisionsApplied: [],
                report: { written: 0, added: 0, replaced: 0, keptLocal: 0, keptBoth: 0, identical: 0, unrecognized: 0, tombstoned: 0, pending: 0 },
                summary: pre.summary || null,
                identity: pre.identity || null
            };
        }
        const d = _isObj(decisions) ? decisions : {};
        const next = _normState(local);
        const report = { written: 0, added: 0, replaced: 0, keptLocal: 0, keptBoth: 0, identical: 0, unrecognized: 0, tombstoned: 0, pending: 0 };
        const pending = [];
        const decisionsApplied = [];

        function push(entry) {
            const b = _bucket(next, entry.char);
            b[entry.layer].push(_deep(entry.item));
            report.written++;
        }

        for (let i = 0; i < pre.added.length; i++) {
            push(pre.added[i]);
            report.added++;
        }

        report.identical = pre.identical.length;
        report.unrecognized = pre.unrecognized.length;
        report.tombstoned = pre.tombstoned.length;

        for (let i = 0; i < pre.conflicts.length; i++) {
            const row = pre.conflicts[i];
            const raw = _s(d[row.key]);
            const dec = DECISIONS.indexOf(raw) >= 0 ? raw : '';
            if (!dec) {
                report.pending++;
                pending.push({ key: row.key, char: row.char, layer: row.layer, id: row.item.id, reason: 'no-decision' });
                continue;
            }
            decisionsApplied.push({ key: row.key, decision: dec });
            if (dec === 'keep-local') { report.keptLocal++; continue; }
            if (dec === 'use-pack') {
                const b = _bucket(next, row.char);
                const list = b[row.layer];
                let hit = -1;
                for (let j = 0; j < list.length; j++) {
                    if (_s(list[j] && list[j].id) === _s(row.item.id)) { hit = j; break; }
                }
                if (hit >= 0) { list[hit] = _deep(row.item); report.replaced++; report.written++; }
                else { list.push(_deep(row.item)); report.replaced++; report.written++; }
                continue;
            }
            // keep-both: local stays untouched, pack copy enters under a fresh
            // deterministic conflict id so re-running the same import is idempotent.
            const cid = conflictIdOf(row.char, row.item.text, row.item.floor);
            const b = _bucket(next, row.char);
            const list = b[row.layer];
            let exists = false;
            for (let j = 0; j < list.length; j++) {
                if (_s(list[j] && list[j].id) === cid) { exists = true; break; }
            }
            if (exists) { report.keptBoth++; continue; }
            const copy = _deep(row.item);
            copy.id = cid;
            copy.conflict = true;
            copy.conflictOf = row.item.id;
            list.push(copy);
            report.keptBoth++;
            report.written++;
        }

        return {
            ok: true, rejected: false,
            reason: report.pending > 0 ? 'partial-conflicts-pending' : 'ok',
            state: next,
            pending: pending,
            decisionsApplied: decisionsApplied,
            report: report,
            summary: Object.assign({}, pre.summary || {}, {
                pending: report.pending,
                written: report.written
            }),
            identity: pre.identity || null
        };
    }

    return {
        FORMAT: FORMAT,
        PACK_SCHEMA: PACK_SCHEMA,
        MAX_TEXT: MAX_TEXT,
        LAYERS: LAYERS.slice(),
        DECISIONS: DECISIONS.slice(),
        sha256: sha256,
        canon: canon,
        entryKeyOf: entryKeyOf,
        conflictIdOf: conflictIdOf,
        entrySha: _entrySha,
        headShaOf: function (pack) { return _headSha(pack); },
        packMemory: packMemory,
        verifyPack: verifyPack,
        precheckImport: precheckImport,
        applyImport: applyImport
    };
});
