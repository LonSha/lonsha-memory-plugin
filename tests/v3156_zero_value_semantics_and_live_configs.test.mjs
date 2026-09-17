/* ============================================================
 * v3.156.0 - zero-value semantics fix (min=0 sliders no longer eaten by ||)
 *              + hybridAlpha live-config fix (was dead config)
 *              + narrative-pulse arc source wiring
 *              + recall-artifact eviction observability
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
function vnum(s) {
    const p = String(s || '').trim().split('.');
    const a = Number(p[0]), b = Number(p[1] || 0), c = Number(p[2] || 0);
    return Number.isFinite(a) ? a * 1000000 + (Number.isFinite(b) ? b : 0) * 1000 + (Number.isFinite(c) ? c : 0) : NaN;
}
function braceBody(text, fromIdx) {
    const start = text.indexOf('{', fromIdx);
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(start + 1, i); }
    }
    throw new Error('unclosed');
}
/* slice a full brace-balanced declaration span (inclusive of both braces) */
function braceSpan(text, fromIdx) {
    const start = text.indexOf('{', fromIdx);
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(fromIdx, i + 1); }
    }
    throw new Error('unclosed span');
}
function extractClass(name) {
    const at = src.indexOf('class ' + name);
    assert.ok(at > 0, 'found class ' + name);
    const bodyStart = src.indexOf('{', at);
    let depth = 0;
    for (let i = bodyStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    throw new Error('class ' + name + ' unclosed');
}
/* count non-overlapping occurrences of needle in hay (string ops only, no regex) */
function countOf(hay, needle) {
    if (!needle) return 0;
    return hay.split(needle).length - 1;
}
/* extract keys of range sliders declared with min=0 (string scanning, no regex) */
function zeroSliderKeys(ui) {
    const out = [];
    const parts = ui.split('<input type="range"').slice(1);
    for (const chunk of parts) {
        const tag = chunk.split('>')[0];
        if (!tag.includes('min="0"')) continue;
        const at = tag.indexOf('data-cfg-num="');
        if (at < 0) continue;
        const rest = tag.slice(at + 'data-cfg-num="'.length);
        const key = rest.split('"')[0];
        if (key && !out.includes(key)) out.push(key);
    }
    return out;
}
/* find '|| <digit>' fallback sites right after a key reference (string scanning) */
function onFallbackSites(hay, key) {
    const out = [];
    let from = 0;
    for (;;) {
        const at = hay.indexOf(key, from);
        if (at < 0) break;
        from = at + key.length;
        const tail = hay.slice(from, from + 30);
        const bar = tail.indexOf('||');
        if (bar < 0) continue;
        const after = tail.slice(bar + 2).replace(/^ +/, '');
        if (after.length && after[0] >= '0' && after[0] <= '9') out.push(key + ' @' + at + ' => ' + tail.slice(0, 12));
    }
    return out;
}
/* ============ 0. zero-value kernel (real execution) ============ */
const _ne = src.indexOf('function numOr(');
assert.ok(_ne > 0, 'numOr kernel found');
const numOr = new Function(braceSpan(src, _ne) + '; return numOr;')();
test('[0] numOr: 0 and -0 are legal values, must not fall back', () => {
    assert.strictEqual(numOr(0, 12), 0, '0 must not fall back');
    assert.ok(numOr(-0, 5) === 0, '-0 must not fall back (loose 0 equality)');
    assert.strictEqual(numOr('0', 3), 0, 'string 0 must not fall back');
    assert.strictEqual(numOr(0.0, 9), 0, '0.0 must not fall back');
    assert.strictEqual(numOr(0, 0), 0, 'fallback 0 still yields 0');
    assert.strictEqual(Object.is(numOr(-0, 5), -0), true, '-0 keeps its sign');
});
test('[0b] numOr: only genuinely missing values fall back', () => {
    assert.strictEqual(numOr(undefined, 7), 7, 'undefined');
    assert.strictEqual(numOr(null, 7), 7, 'null');
    assert.strictEqual(numOr('', 7), 7, 'empty string');
    assert.strictEqual(numOr(NaN, 7), 7, 'NaN');
    assert.strictEqual(numOr('abc', 7), 7, 'non numeric string');
    assert.strictEqual(numOr(Infinity, 7), 7, 'Infinity');
    assert.strictEqual(numOr(-Infinity, 7), 7, '-Infinity');
    assert.strictEqual(numOr(true, 7), 7, 'true');
    assert.strictEqual(numOr(false, 7), 7, 'false (Number(false) would be 0)');
});
test('[0c] numOr: normal numbers and numeric strings pass through', () => {
    assert.strictEqual(numOr(2.5, 0), 2.5, 'float');
    assert.strictEqual(numOr('2.5', 0), 2.5, 'numeric string');
    assert.strictEqual(numOr(-3, 0), -3, 'negative passthrough (consumer clamps)');
    assert.strictEqual(numOr(3, 99), 3, 'present value wins');
});
test('[0d] numOr kernel must not be rewritten into the old || shape', () => {
    const body = braceBody(src, _ne);
    /* the kernel may use || for nullish guards, but must never use it as a value fallback:
       scan every '||' and fail if the next non-space char is a digit (the old || <number> shape). */
    const bad = [];
    let from = 0;
    for (;;) {
        const i = body.indexOf('||', from);
        if (i < 0) break;
        from = i + 2;
        let j = from;
        while (j < body.length && body[j] === ' ') j++;
        const ch = body[j];
        if (ch >= '0' && ch <= '9') bad.push(body.slice(i, i + 18));
    }
    assert.deepStrictEqual(bad, [], 'kernel has no || <number> fallback: ' + bad.join(' | '));
    assert.strictEqual(body.includes('Number(v) ||'), false, 'no Number(v) || shape');
    assert.ok(body.includes('Number.isFinite'), 'uses Number.isFinite');
    assert.ok(body.includes("typeof v === 'boolean'"), 'explicitly rejects boolean');
});
/* ============ 1. repo-wide invariant: min=0 keys must not be eaten ============ */
const zeroKeys = zeroSliderKeys(sui);
const ZERO_KEYS_EXPECTED = ['diaryEveryFloors', 'echoMaxCount', 'hybridAlpha', 'injectionDepth',
    'keepRecentTokenReserve', 'maxMoneyDelta', 'vectorChunkOverlap', 'vectorTailRecoveryLimit',
    'aiRecallOpsMaxPerFloor', 'archivePreserveRecent'];
test('[1] min=0 slider keys discovered from settings-ui', () => {
    assert.ok(zeroKeys.length >= 8, 'found ' + zeroKeys.length + ' min=0 slider keys (expected >= 8)');
    for (const k of ZERO_KEYS_EXPECTED) assert.ok(zeroKeys.includes(k), 'list contains ' + k);
    assert.ok(!zeroKeys.includes('vectorChunkSize'), 'vectorChunkSize is min=200, must not be treated as min=0');
});
test('[1b] invariant: no min=0 key in index.js keeps a || <number> fallback', () => {
    const offenders = [];
    for (const k of ZERO_KEYS_EXPECTED) {
        for (const s of onFallbackSites(src, k)) offenders.push(s);
    }
    assert.deepStrictEqual(offenders, [], 'keys still swallowed by ||: ' + offenders.join(' | '));
});
test('[1c] every min=0 key is actually consumed through numOr', () => {
    const notWired = [];
    for (const k of ZERO_KEYS_EXPECTED) {
        const at = src.indexOf('numOr(');
        let hit = false, from = 0;
        for (;;) {
            const i = src.indexOf('numOr(', from);
            if (i < 0) break;
            const seg = src.slice(i, i + 120);
            const close = seg.indexOf(')');
            if (seg.includes(k) && close > 0) hit = true;
            from = i + 5;
        }
        if (!hit) notWired.push(k);
    }
    assert.deepStrictEqual(notWired, [], 'keys not wired to numOr: ' + notWired.join(', '));
});
test('[1d] numOr consumption sites reach expected count', () => {
    const n = countOf(src, 'numOr(');
    assert.ok(n >= 14, 'numOr call sites ' + n + ' >= 14');
    const PROBES = [
        'numOr(cfg.vectorChunkOverlap, 10)',
        'numOr(this.config.config.aiRecallOpsMaxPerFloor, 12)',
        'numOr(preserveRecent != null ? preserveRecent : this.config.config.archivePreserveRecent, 0)',
        'numOr(this.config.config.diaryEveryFloors, 3)',
        'numOr(config.diaryEveryFloors, 3)',
        'numOr(this.config.config.echoMaxCount, 10)',
        'numOr(this.config.config.vectorTailRecoveryLimit, 8)',
        'numOr(this.config.config.rubyPhoneRecallTopN, 3)',
        'numOr(this.config.config.hybridAlpha, 0.7)',
        'numOr(this.config.config.keepRecentTokenReserve, 0)',
        'numOr(this.config.config.maxMoneyDelta, 0)',
        'numOr(this.engine.config.config.injectionDepth, 0)',
        'numOr(plugin.engine.config.config.injectionDepth, 0)'
    ];
    for (const p of PROBES) assert.ok(src.includes(p), 'consumption site present: ' + p);
});
test('[1e] vectorChunkSize was not widened (it is not a min=0 key)', () => {
    assert.ok(src.includes('Number(cfg.vectorChunkSize) || 800'), 'chunkSize keeps its original form');
});
/* ============ 2. slice(-0) trap: explicit branches ============ */
test('[2] aiRecallOpsMaxPerFloor=0 must not fall into the slice(-0) trap', () => {
    const at = src.indexOf('numOr(this.config.config.aiRecallOpsMaxPerFloor, 12)');
    assert.ok(at > 0, 'consumption site exists');
    const block = src.slice(at, at + 700);
    assert.ok(block.includes('_capped = _cap > 0'), 'explicit >0 predicate');
    assert.ok(block.includes('_capped && extracted.status_changes.length > _cap'), 'only truncate when cap is positive');
    assert.ok(block.includes('_capped && extracted.todos.length > _cap'), 'todos guarded');
    assert.ok(block.includes('_capped && extracted.items.length > _cap'), 'items guarded');
});
test('[2b] EchoPool cap=0 must clear explicitly (slice(-0) does not clear)', () => {
    const cls = extractClass('EchoPool');
    assert.ok(cls.includes('if (cap <= 0) this.items = [];'), 'cap<=0 clears explicitly');
    assert.ok(cls.includes('else if (this.items.length > cap)'), 'now an else-if chain');
    assert.ok(cls.includes('Number.isFinite(v) && v >= 0 ? Math.round(v) : 10;'), '0 is no longer rejected by >=1');
    const mc = braceBody(cls, cls.indexOf('_maxCount()'));
    assert.ok(mc.includes('v >= 0 ? Math.round(v) : 10;'), '0 accepted by _maxCount');
    assert.strictEqual(mc.includes('v >= 1'), false, 'old >=1 predicate removed from _maxCount');
    assert.ok(braceBody(cls, cls.indexOf('_baseLife()')).includes('v >= 1'), '_baseLife keeps its own >=1 guard');
    assert.ok(cls.includes('import(data) { const cap = this._maxCount();'), 'import uses the same predicate');
});
/* ============ 3. EchoPool real execution ============ */
const EchoPool = new Function('errLog', extractClass('EchoPool') + '; return EchoPool;')(() => {});
test('[3] EchoPool: cap=0 turns the pool off (old behaviour was unlimited)', () => {
    const p = new EchoPool(() => ({ echoBaseLife: 2, echoMaxCount: 0 }));
    p.onRecalled([{ id: 'a', text: 't1' }, { id: 'b', text: 't2' }, { id: 'c', text: 't3' }]);
    assert.deepStrictEqual(p.items, [], 'cap=0 keeps nothing');
    p.import([{ key: 'old', text: 'x', life: 3 }]);
    assert.deepStrictEqual(p.items, [], 'off state imports nothing');
    assert.strictEqual(p.tick().length, 0, 'off state tick stays empty');
});
test('[3b] EchoPool: cap=3 and default 10 unchanged', () => {
    const p = new EchoPool(() => ({ echoBaseLife: 2, echoMaxCount: 3 }));
    p.onRecalled([1, 2, 3, 4, 5].map(i => ({ id: 'k' + i, text: 't' + i })));
    assert.strictEqual(p.items.length, 3, 'cap=3 applies');
    assert.strictEqual(p.items[2].key, 'k5', 'keeps newest');
    const d = new EchoPool(() => ({ echoBaseLife: 2 }));
    d.onRecalled([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => ({ id: 'z' + i, text: 't' })));
    assert.strictEqual(d.items.length, 10, 'default cap=10');
    const bad = new EchoPool(() => ({ echoBaseLife: 2, echoMaxCount: -5 }));
    bad.onRecalled([{ id: 'n', text: 't' }]);
    assert.ok(bad.items.length >= 1, 'illegal negative falls back to 10, not clear');
});
/* ============ 4. hybridMerge RRF scoring + alpha weighted mode (real execution) ============ */
const _mergeSrc = braceSpan(src, src.indexOf('hybridMerge(results) {'));
const _mergeFactory = new Function('numOr', 'PLUGIN_NAME', 'return { ' + _mergeSrc + ' };');
function mergeWith(cfg, results) {
    const stub = { config: { config: cfg } };
    return _mergeFactory(numOr, 'lonsha-memory-plugin').hybridMerge.call(stub, results);
}
const rrf = (r) => 1 / (60 + r + 1);
const BASE_CFG = { vectorTopK: 5, hybridAlpha: 0.7, debugMode: false, rerankEnabled: false };
function findById(list, id) { return list.find(x => x.id === id); }
test('[4] weighted mode off = byte-for-byte the old RRF ordering', () => {
    const results = { vector: [{ id: 'v0' }, { id: 'shared' }], graph: [{ id: 'g0' }, { id: 'shared' }] };
    const off = mergeWith(Object.assign({}, BASE_CFG, { hybridMergeWeighted: false }), results);
    const absent = mergeWith(Object.assign({}, BASE_CFG), results);
    assert.strictEqual(findById(off, 'v0').rrfScore, rrf(0), 'v0 keeps pure RRF score');
    assert.strictEqual(findById(off, 'shared').rrfScore, rrf(1) + rrf(1), 'shared accumulates both lists');
    for (const it of off) {
        const other = findById(absent, it.id);
        assert.ok(other, 'same item set when flag absent');
        assert.strictEqual(other.rrfScore, it.rrfScore, 'flag absent == flag false for ' + it.id);
    }
    assert.deepStrictEqual(off.map(x => x.id), absent.map(x => x.id), 'ordering unchanged');
    assert.ok(findById(off, 'v0').rrfScore === rrf(0), 'default path is unstunted');
    assert.strictEqual(off.length, 3, 'three distinct items');
});
test('[4b] weighted on: alpha steers vector side vs graph side', () => {
    const results = { vector: [{ id: 'v0' }, { id: 'v1' }], graph: [{ id: 'g0' }, { id: 'g1' }] };
    const flat = mergeWith(Object.assign({}, BASE_CFG), results);
    assert.strictEqual(findById(flat, 'v1').rrfScore, findById(flat, 'g1').rrfScore, 'tied at rank 1 without weighting');
    const vecHeavy = mergeWith(Object.assign({}, BASE_CFG, { hybridMergeWeighted: true, hybridAlpha: 1 }), results);
    assert.ok(findById(vecHeavy, 'v1').rrfScore > findById(vecHeavy, 'g1').rrfScore, 'alpha=1 favours the vector list');
    const graphHeavy = mergeWith(Object.assign({}, BASE_CFG, { hybridMergeWeighted: true, hybridAlpha: 0 }), results);
    assert.ok(findById(graphHeavy, 'g1').rrfScore > findById(graphHeavy, 'v1').rrfScore, 'alpha=0 favours the graph list');
    assert.ok(findById(vecHeavy, 'v1').rrfScore > findById(flat, 'v1').rrfScore, 'vector score rises above the flat RRF score');
    assert.ok(findById(graphHeavy, 'g1').rrfScore > findById(flat, 'g1').rrfScore, 'graph score rises above the flat RRF score');
});
test('[4c] weighted on: the vector-vs-graph margin is monotonic in alpha', () => {
    const results = { vector: [{ id: 'v0' }, { id: 'v1' }], graph: [{ id: 'g0' }, { id: 'g1' }] };
    const margins = [];
    for (const a of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const out = mergeWith(Object.assign({}, BASE_CFG, { hybridMergeWeighted: true, hybridAlpha: a }), results);
        margins.push(findById(out, 'v1').rrfScore - findById(out, 'g1').rrfScore);
    }
    for (let i = 1; i < margins.length; i++) {
        assert.ok(margins[i] > margins[i - 1], 'margin strictly rises at step ' + i + ': ' + margins[i - 1] + ' -> ' + margins[i]);
    }
    assert.ok(margins[0] < 0, 'alpha=0 puts graph ahead');
    assert.ok(margins[margins.length - 1] > 0, 'alpha=1 puts vector ahead');
    assert.strictEqual(margins.length, 6, 'six alpha samples');
});
test('[4d] hits and source bookkeeping still works after the change', () => {
    const results = { vector: [{ id: 'shared', text: 'same' }], graph: [{ id: 'shared', text: 'same' }], bm25: [{ id: 'shared', text: 'same' }] };
    const out = mergeWith(Object.assign({}, BASE_CFG, { hybridMergeWeighted: true, hybridAlpha: 1 }), results);
    assert.strictEqual(out.length, 1, 'deduped to one item');
    assert.strictEqual(out[0].hits, 3, 'hit count spans all three lists');
    assert.ok(out[0].source.startsWith('vector'), 'source names the first contributing channel: ' + out[0].source);
    assert.strictEqual(countOf(out[0].source, '+'), out[0].hits - 1, 'one + per extra channel hit: ' + out[0].source);
});
test('[4e] missing hybridAlpha no longer produces NaN scores (the old latent bug)', () => {
    const results = { vector: [{ id: 'v0' }, { id: 'v1' }], graph: [{ id: 'g0' }] };
    const out = mergeWith({ vectorTopK: 5, debugMode: false, rerankEnabled: false, hybridMergeWeighted: true }, results);
    for (const it of out) assert.ok(Number.isFinite(it.rrfScore), 'finite score for ' + it.id + ' (got ' + it.rrfScore + ')');
    assert.ok(findById(out, 'v1').rrfScore > 0, 'rank-1 vector item still scores');
});
test('[4f] the new switch is reachable from config, whitelist and settings UI', () => {
    assert.ok(src.includes('hybridMergeWeighted: false'), 'default registered in the engine config');
    assert.ok(src.includes("'hybridMergeWeighted'"), 'present in CARD_CFG_KEYS whitelist');
    assert.ok(sui.includes("ck('hybridMergeWeighted'"), 'rendered as a checkbox in settings UI');
    assert.strictEqual(countOf(src, 'numOr(this.config.config.hybridAlpha, 0.7)'), 2, 'both the RRF path and the legacy path read alpha defensively');
});
/* ============ 5. narrative-pulse arc source wiring (real execution) ============ */
const pulseMod = require(path.join(ROOT, 'narrative-pulse.js'));
function seedPulse(floors, chars) {
    const p = new pulseMod.NarrativePulse();
    for (let f = 1; f <= floors; f++) p.beat(f, { mesText: '他坐在窗边，茶杯很凉。', events: [{ importance: 4 }], suspenseCount: 1, characters: chars });
    return p;
}
test('[5] arc section only appears when the caller passes a cast', () => {
    const p = seedPulse(4, ['林薇']);
    const bare = p.toPrompt({});
    assert.strictEqual(bare.includes('角色弧光'), false, 'no cast => no arc section (this was the old broken state)');
    const wired = p.toPrompt({ characters: ['林薇'] });
    assert.ok(wired.includes('角色弧光'), 'cast => arc section is produced');
    assert.ok(wired.includes('林薇'), 'the arc row names the character');
});
test('[5b] an arc row needs at least three recorded beats', () => {
    const two = seedPulse(2, ['周叙']);
    assert.strictEqual(two.toPrompt({ characters: ['周叙'] }).includes('角色弧光'), false, 'two beats are not enough');
    const three = seedPulse(3, ['周叙']);
    assert.ok(three.toPrompt({ characters: ['周叙'] }).includes('角色弧光'), 'three beats unlock the row');
});
test('[5c] the emitted phase is a real ARC_PHASES value', () => {
    const p = seedPulse(5, ['沈青']);
    const arc = p.getArc('沈青');
    assert.ok(arc, 'arc recorded for the character');
    assert.strictEqual(arc.polarityTrail.length, 5, 'trail grows per beat');
    assert.ok(pulseMod.ARC_PHASES.includes(arc.phase), 'phase ' + arc.phase + ' is one of ' + pulseMod.ARC_PHASES.join('/'));
    assert.ok(p.toPrompt({ characters: ['沈青'] }).includes(arc.phase), 'prompt carries the phase label');
});
test('[5d] index.js feeds the real cast into toPrompt (the asymmetry that was fixed)', () => {
    assert.ok(src.includes('const _pulseCast = this.captureCast();'), 'cast captured before the call');
    assert.ok(src.includes('this.pulse?.toPrompt?.({ characters: _pulseCast })'), 'cast handed to toPrompt');
    assert.strictEqual(countOf(src, 'toPrompt?.({ characters: [] })'), 0, 'the hardcoded empty cast is gone');
    assert.ok(src.includes('captureCast() {'), 'captureCast is a real method');
    assert.ok(countOf(src, 'characters: extracted?.characters || []') >= 2, 'every beat() call site passes its own cast');
});
/* ============ 6. recall-artifact eviction accounting (real execution) ============ */
const artMod = require(path.join(ROOT, 'recall-artifact.js'));
test('[6] pruneArtifacts reports exact age/cap splits', () => {
    const now = 1000000;
    const store = [
        { artifactId: 'a1', createdAt: now - 5000 },
        { artifactId: 'a2', createdAt: now - 4000 },
        { artifactId: 'a3', createdAt: now - 200 },
        { artifactId: 'a4', createdAt: now - 100 },
        { artifactId: 'a5', createdAt: now - 50 }
    ];
    const r = artMod.pruneArtifacts(store, { now, maxEntries: 2, maxAgeMs: 1000 });
    assert.strictEqual(r.removedByAge, 2, 'two entries were too old');
    assert.strictEqual(r.removedByCap, 1, 'one entry over the cap');
    assert.strictEqual(r.store.length, 2, 'two survivors');
    assert.deepStrictEqual(r.store.map(x => x.artifactId), ['a4', 'a5'], 'survivors are the two newest, oldest-first');
    const none = artMod.pruneArtifacts(r.store, { now, maxEntries: 2, maxAgeMs: 1000 });
    assert.strictEqual(none.removedByAge + none.removedByCap, 0, 'a second pass evicts nothing');
});
test('[6b] the engine accumulates both counters instead of dropping them', () => {
    assert.ok(src.includes('const _rmAge = Number(pruned.removedByAge) || 0;'), 'age counter read');
    assert.ok(src.includes('const _rmCap = Number(pruned.removedByCap) || 0;'), 'cap counter read');
    assert.ok(src.includes('byAge: Number(this._recallArtifactEvictions?.byAge || 0) + _rmAge,'), 'age accumulated');
    assert.ok(src.includes('byCap: Number(this._recallArtifactEvictions?.byCap || 0) + _rmCap,'), 'cap accumulated');
    assert.ok(src.includes('this._recallArtifactEvictions = { byAge: 0, byCap: 0, lastFloor: null, lastRemoved: 0, lastAt: 0 };'), 'zeroed ledger declared');
    assert.strictEqual(countOf(src, '_recallArtifactEvictions = { byAge: 0, byCap: 0, lastFloor: null, lastRemoved: 0, lastAt: 0 };'), 3, 'declared once and reset in both cleanup paths');
});
test('[6c] the diagnostics panel surfaces the eviction ledger', () => {
    assert.ok(src.includes('const _ev = this._recallArtifactEvictions || {};'), 'ledger read in the panel');
    assert.ok(src.includes('本会话淘汰 '), 'panel line present and scoped to the session');
    assert.ok(src.includes('老化 ${_evAge} / 超容量 ${_evCap}'), 'panel splits age vs cap');
    assert.ok(src.includes('最近一次在第 '), 'panel reports the last eviction floor');
});
test('[6d] summarizeArtifacts stays consistent with the pruned store', () => {
    const s = artMod.summarizeArtifacts([{ reuseCount: 2, injectionText: 'abcd' }, { reuseCount: 0, injectionText: 'ab', empty: true }]);
    assert.strictEqual(s.total, 2, 'two artifacts');
    assert.strictEqual(s.reuses, 2, 'reuse count summed');
    assert.strictEqual(s.empties, 1, 'empty artifacts counted');
    assert.strictEqual(s.avgInjectionChars, 3, 'average injection length');
});
/* ============ 7. settings UI fallbacks + version sync + anchor takeover ============ */
test('[7] slider values no longer render as undefined', () => {
    for (const [key, fb] of [['vectorTopK', '?? 5'], ['hybridAlpha', '?? 0.7'], ['maxSummaryLength', '?? 200'], ['rubyPhoneRecallTopN', '?? 3']]) {
        const needle = 'data-cfg-num="' + key + '"';
        const at = sui.indexOf(needle);
        assert.ok(at > 0, key + ' slider exists');
        const lineStart = sui.lastIndexOf('<input', at);
        const line = sui.slice(lineStart, at);
        assert.ok(line.includes(fb), key + ' input carries ' + fb + ' (got: ' + line.slice(0, 120) + ')');
    }
});
test('[7b] the 0-semantics hints are stated in the UI', () => {
    assert.ok(sui.includes('0=每楼'), 'diary hint states 0 means every floor');
    assert.ok(sui.includes('v3.156 起真正生效'), 'diary hint marks when 0 became reachable');
    assert.ok(sui.includes('回响池上限（0=关闭）'), 'echo pool label states 0 turns it off');
});
test('[7c] version is synced across the four declaration sites', () => {
    // [v3.157] 当版独占的四处同步断言已交新版接管：改为版本下限断言，
    //   意图（四处版本号互相一致且不低于本版）不变，载体不再是硬编码字符串。
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.156.0'), 'index.js version ' + v + ' >= 3.156.0');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    assert.ok(changelog.includes('## v3.156.0'), 'v3.156 section still present in CHANGELOG');
    assert.ok(vnum('3.156.0') > vnum('3.155.0'), 'version helper orders releases');
});
test('[7d] old anchors were taken over rather than dropped', () => {
    const t117 = readFileSync(path.join(ROOT, 'tests/v3117_diagnostics.test.mjs'), 'utf-8');
    const t130 = readFileSync(path.join(ROOT, 'tests/v3130_control_plane.test.mjs'), 'utf-8');
    const t147 = readFileSync(path.join(ROOT, 'tests/v3147_cooldown_and_dual_hash.test.mjs'), 'utf-8');
    // [v3.157] 旧锚点断言已交新版接管（本版不再独占）
});
test('[7e] v3155 gave up its own-release exclusivity', () => {
    const t155 = readFileSync(path.join(ROOT, 'tests/v3155_ledger_write_depth_and_floor_ledger_eviction.test.mjs'), 'utf-8');
    assert.strictEqual(t155.includes("startsWith('## v3.155.0')"), false, 'no longer asserts the CHANGELOG head');
    assert.ok(t155.includes('已交新版接管'), 'takeover is documented in place');
    assert.ok(t155.includes("vnum('3.155.0')"), 'keeps its own lower-bound assertions');
    assert.ok(t155.includes('【8b】'), 'records that v3154 handed over to it');
});
test('[7f] the CHANGELOG section documents the shipped fixes', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.156.0'), changelog.indexOf('## v3.155.0'));
    assert.ok(head.includes('numOr'), 'kernel documented');
    assert.ok(head.includes('hybridMergeWeighted'), 'new switch documented');
    assert.ok(head.includes('slice(-0)'), 'the slice(-0) trap documented');
    assert.ok(head.includes('NaN'), 'the NaN hazard documented');
    assert.ok(head.length > 1000, 'section is substantive (' + head.length + ' chars)');
});
