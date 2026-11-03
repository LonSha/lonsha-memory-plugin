/* ========================================================
 * evidence-source-locator.js - [v3.445.0 / L14-O8]
 *
 * Pure evidence-source locator. It does not mutate ledgers or chat messages.
 * The diagnostic layer owns writes and must require an explicit confirmation.
 * ======================================================== */
'use strict';
(function (global) {
    const MIN_ANCHOR_LENGTH = 6;
    const STATES = Object.freeze({
        VERIFIED: 'verified',
        LOCATED: 'located',
        EDITED: 'edited',
        MISSING: 'missing',
        UNKNOWN_FLOOR: 'unknown-floor',
    });

    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    /* Keep this byte-for-byte compatible with index.js msgTextOf/msgFpOf. */
    function msgTextOf(m) {
        try {
            const sw = Math.max(0, Math.round(Number(m && m.swipe_id) || 0));
            if (Array.isArray(m && m.swipes) && typeof m.swipes[sw] === 'string') return m.swipes[sw];
            return String((m && m.mes) || (m && m.content) || (m && m.text) || '');
        } catch (_e) { return ''; }
    }

    function msgFpOf(m) {
        try {
            return [((m && m.is_user === true) || (m && m.role === 'user')) ? 'u' : 'a',
                Math.max(0, Math.round(Number(m && m.swipe_id) || 0)),
                hash32(msgTextOf(m)),
                String((m && m.send_date) || (m && m.extra && m.extra.send_date) || '')].join('|');
        } catch (_e) { return ''; }
    }

    function text(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    function cleanAnchor(value) {
        return text(value).trim();
    }

    function validFloor(value) {
        if (value === null || value === undefined || value === '') return false;
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 && Math.floor(n) === n;
    }

    function floorOf(message) {
        if (!message || typeof message !== 'object') return null;
        const raw = message.index !== undefined ? message.index : message.floor;
        return validFloor(raw) ? Number(raw) : null;
    }

    function sourceMessage(chat, floor) {
        if (!Array.isArray(chat) || !validFloor(floor)) return null;
        const m = chat[Number(floor)];
        return m && typeof m === 'object' ? m : null;
    }

    function anchorMatch(message, anchor) {
        const needle = cleanAnchor(anchor);
        if (!message || needle.length < MIN_ANCHOR_LENGTH) return false;
        return msgTextOf(message).indexOf(needle) >= 0;
    }

    function sourceSnapshot(message, floor) {
        if (!message) return null;
        const body = msgTextOf(message);
        return {
            floor: validFloor(floor) ? Number(floor) : floorOf(message),
            fp: msgFpOf(message),
            textHash: hash32(body),
            length: body.length,
            preview: body.slice(0, 120),
        };
    }

    function itemKey(item, fallback) {
        const it = item && typeof item === 'object' ? item : {};
        return text(it.id || it.key || it.keyOf || it.title || fallback || '').trim();
    }

    function refOf(ledgerId, item, fallback) {
        const id = text(ledgerId).trim();
        const key = itemKey(item, fallback);
        return id && key ? id + ':' + key : '';
    }

    function normalizeCandidate(candidate, index) {
        const c = candidate && typeof candidate === 'object' ? candidate : {};
        const floor = c.floor !== undefined ? c.floor : c.index;
        return {
            floor: validFloor(floor) ? Number(floor) : null,
            fp: text(c.fp || c.fingerprint || ''),
            textHash: text(c.textHash || c.hash || ''),
            message: c.message || c.msg || null,
            index: index,
        };
    }

    function findByFingerprint(chat, fp, opts) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const rows = Array.isArray(chat) ? chat : [];
        const needle = text(fp).trim();
        if (!needle) return { state: 'none', candidates: [], reason: 'no-fingerprint' };
        const found = [];
        for (let i = 0; i < rows.length; i++) {
            const m = rows[i];
            if (!m || typeof m !== 'object') continue;
            if (o.assistantOnly && (m.is_user === true || m.role === 'user')) continue;
            if (msgFpOf(m) !== needle) continue;
            found.push({ floor: i, fp: needle, message: m, snapshot: sourceSnapshot(m, i) });
        }
        if (found.length === 1) return { state: 'unique', candidates: found, candidate: found[0], reason: 'unique-match' };
        if (found.length > 1) return { state: 'ambiguous', candidates: found, reason: 'multiple-matches' };
        return { state: 'none', candidates: [], reason: 'fingerprint-not-found' };
    }

    function locate(item, chat, opts) {
        const it = item && typeof item === 'object' ? item : {};
        const o = opts && typeof opts === 'object' ? opts : {};
        const requestedFloor = it.floor !== undefined ? it.floor : it.updatedFloor;
        const floorKnown = validFloor(requestedFloor);
        const anchor = cleanAnchor(it.anchor || it.sourceText || it.quote || it.excerpt || '');
        const expectedFp = text(it.fp || it.fingerprint || it.sourceFp || '').trim();
        const expectedHash = text(it.textHash || it.sourceTextHash || '').trim();
        const current = floorKnown ? sourceMessage(chat, Number(requestedFloor)) : null;

        if (!floorKnown) {
            const recovery = findByFingerprint(chat, expectedFp, o);
            return {
                state: STATES.UNKNOWN_FLOOR,
                reason: 'unknown-floor',
                floor: null,
                expectedFloor: null,
                expectedFp,
                anchor,
                source: null,
                recovery,
                checked: { floor: false, text: false, fingerprint: !!expectedFp },
            };
        }

        if (!current) {
            const recovery = findByFingerprint(chat, expectedFp, o);
            return {
                state: STATES.MISSING,
                reason: 'floor-missing',
                floor: Number(requestedFloor),
                expectedFloor: Number(requestedFloor),
                expectedFp,
                anchor,
                source: null,
                recovery,
                checked: { floor: true, text: false, fingerprint: !!expectedFp },
            };
        }

        const currentFp = msgFpOf(current);
        const currentText = msgTextOf(current);
        const fpOk = !!expectedFp && currentFp === expectedFp;
        const anchorOk = !!anchor && anchor.length >= MIN_ANCHOR_LENGTH && currentText.indexOf(anchor) >= 0;
        const hashOk = !!expectedHash && hash32(currentText) === expectedHash;
        const textChecked = !!anchor || !!expectedHash;

        if (fpOk && (anchorOk || hashOk)) {
            return {
                state: STATES.VERIFIED,
                reason: 'fingerprint-and-text-match',
                floor: Number(requestedFloor),
                expectedFloor: Number(requestedFloor),
                expectedFp,
                currentFp,
                anchor,
                source: sourceSnapshot(current, requestedFloor),
                recovery: { state: 'none', candidates: [], reason: 'already-at-floor' },
                checked: { floor: true, text: textChecked, fingerprint: !!expectedFp },
            };
        }

        if (anchorOk || hashOk || fpOk) {
            return {
                state: STATES.LOCATED,
                reason: fpOk ? (textChecked ? 'text-match' : 'fingerprint-match-text-unverified') : 'floor-text-match-fingerprint-differs',
                floor: Number(requestedFloor),
                expectedFloor: Number(requestedFloor),
                expectedFp,
                currentFp,
                anchor,
                source: sourceSnapshot(current, requestedFloor),
                recovery: { state: 'none', candidates: [], reason: 'text-at-floor' },
                checked: { floor: true, text: textChecked, fingerprint: !!expectedFp },
            };
        }

        const recovery = findByFingerprint(chat, expectedFp, o);
        return {
            state: recovery.state === 'unique' ? STATES.EDITED : STATES.MISSING,
            reason: recovery.state === 'unique' ? 'fingerprint-recovered-at-new-floor' : 'source-text-not-found',
            floor: Number(requestedFloor),
            expectedFloor: Number(requestedFloor),
            expectedFp,
            currentFp,
            anchor,
            source: sourceSnapshot(current, requestedFloor),
            recovery,
            checked: { floor: true, text: textChecked, fingerprint: !!expectedFp },
        };
    }

    function locateItem(item, chat, opts) {
        return locate(item, chat, opts);
    }

    function collectLedgerItems(ledgers, opts) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const out = [];
        if (!ledgers || typeof ledgers !== 'object') return out;
        for (const ledgerId of Object.keys(ledgers)) {
            const ledger = ledgers[ledgerId];
            const items = Array.isArray(ledger) ? ledger : (ledger && Array.isArray(ledger.items) ? ledger.items : []);
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item || typeof item !== 'object') continue;
                out.push({ ledger: ledgerId, item, ref: refOf(ledgerId, item, '#' + i) });
            }
        }
        if (o.maxItems && out.length > Number(o.maxItems)) return out.slice(0, Number(o.maxItems));
        return out;
    }

    function findRecoverable(item, chat, opts) {
        const result = locate(item, chat, opts);
        if (result.recovery && result.recovery.state === 'unique') {
            return { state: 'unique', candidate: result.recovery.candidate, candidates: result.recovery.candidates, result };
        }
        if (result.recovery && result.recovery.state === 'ambiguous') {
            return { state: 'ambiguous', candidate: null, candidates: result.recovery.candidates, result };
        }
        return { state: 'none', candidate: null, candidates: [], result };
    }

    function previewRebind(item, candidate, opts) {
        const it = item && typeof item === 'object' ? item : {};
        const c = normalizeCandidate(candidate, 0);
        const nextFloor = c.floor;
        const oldFloor = validFloor(it.floor) ? Number(it.floor) : null;
        const oldFp = text(it.fp || it.fingerprint || it.sourceFp || '');
        const nextFp = c.fp || (c.message ? msgFpOf(c.message) : '');
        const oldTextHash = text(it.textHash || it.sourceTextHash || '');
        const nextTextHash = c.textHash || (c.message ? hash32(msgTextOf(c.message)) : '');
        const changes = [];
        if (oldFloor !== nextFloor) changes.push({ field: 'floor', from: oldFloor, to: nextFloor });
        if (oldFp !== nextFp) changes.push({ field: 'fp', from: oldFp, to: nextFp });
        if (oldTextHash !== nextTextHash && (oldTextHash || nextTextHash)) changes.push({ field: 'textHash', from: oldTextHash, to: nextTextHash });
        return {
            ok: validFloor(nextFloor) && !!nextFp,
            changed: changes.length > 0,
            oldFloor,
            newFloor: validFloor(nextFloor) ? nextFloor : null,
            oldFp,
            newFp: nextFp,
            oldTextHash,
            newTextHash: nextTextHash,
            changes,
            candidate: c,
            requiresConfirm: true,
            writesNothing: true,
            reason: !validFloor(nextFloor) ? 'bad-floor' : (!nextFp ? 'missing-fingerprint' : (changes.length ? 'preview-ready' : 'already-current')),
        };
    }

    function statusLine(result) {
        const r = result && typeof result === 'object' ? result : {};
        const state = text(r.state || 'unknown');
        const reason = text(r.reason || '');
        return reason ? state + ': ' + reason : state;
    }

    const api = Object.freeze({
        MIN_ANCHOR_LENGTH,
        STATES,
        hash32,
        msgTextOf,
        msgFpOf,
        floorOf,
        sourceMessage,
        anchorMatch,
        sourceSnapshot,
        itemKey,
        refOf,
        findByFingerprint,
        locate,
        locateItem,
        collectLedgerItems,
        findRecoverable,
        previewRebind,
        statusLine,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (global) {
        try { global.LonShaEvidenceSourceLocator = api; } catch (_e) { /* read-only host */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
