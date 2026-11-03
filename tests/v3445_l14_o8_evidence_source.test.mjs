/* L14-O8: cross-floor source location and confirmed rebind. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => require(path.join(ROOT, name));
const L = load('evidence-source-locator.js');
const D = load('engine-diagnostic-lines.js');
const LE = load('ledger-entity.js');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function makeChat() {
    return [
        { is_user: false, mes: '旧楼：没有目标证据。', send_date: '0' },
        { is_user: false, mes: '原始证据：目标人物在北门留下了钥匙。', send_date: '1' },
        { is_user: false, mes: '编辑后的正文，原文已不在这里。', send_date: '2' },
    ];
}

function setup(item, chat) {
    const spec = {
        id: 'seed',
        state: () => ({ items: [item] }),
        pick: (_api, state) => state.items,
        project: () => ({ title: 'seed' }),
    };
    D.bindDeps({
        moduleLib: () => null,
        errLog: () => {},
        libs: {
            _evidenceSourceLocatorLib: () => L,
            _ledgerEntityLib: () => LE,
            _evidenceQueryLedgersOf: () => [spec],
            _ledgerApis: () => ({ seed: {} }),
        },
    });
    return { engine: { worldProg: { seedLedger: { items: [item] } } }, spec, chat };
}

test('manifest registers the locator before diagnostic consumers', () => {
    assert.ok(manifest.extra_js.includes('evidence-source-locator.js'));
});

test('same floor requires text verification for verified; fp-only is located', () => {
    const chat = makeChat();
    const fp = L.msgFpOf(chat[1]);
    assert.equal(L.locate({ floor: 1, fp, anchor: '原始证据：目标人物' }, chat).state, 'verified');
    const fpOnly = L.locate({ floor: 1, fp }, chat);
    assert.equal(fpOnly.state, 'located');
    assert.equal(fpOnly.checked.text, false);
});

test('deleted source is missing and does not silently point to the neighbor', () => {
    const chat = makeChat();
    const fp = L.msgFpOf(chat[1]);
    const result = L.locate({ floor: 1, fp, anchor: '原始证据：目标人物' }, [chat[0], chat[2]]);
    assert.equal(result.state, 'missing');
    assert.equal(result.recovery.state, 'none');
    assert.equal(result.recovery.candidates.length, 0);
});

test('unique fingerprint recovery previews first and writes only after confirm', () => {
    const chat = makeChat();
    const item = { id: 's1', floor: 1, fp: L.msgFpOf(chat[1]), anchor: '原始证据：目标人物', history: [], revision: 1 };
    const { engine } = setup(item, chat);
    const preview = D.evidenceSourceRebind(engine, { ref: 'seed:s1', chat, candidateFloor: 2 });
    assert.equal(preview.reason, 'confirm-required');
    assert.equal(preview.writes, false);
    assert.equal(item.floor, 1);
    const applied = D.evidenceSourceRebind(engine, { ref: 'seed:s1', chat, candidateFloor: 0, confirm: true });
    assert.equal(applied.writes, true);
    assert.equal(item.floor, 0);
    assert.equal(item.updatedFloor, 0);
    assert.equal(item.history.at(-1).action, 'reanchor');
});

test('ambiguous fingerprint recovery is never guessed', () => {
    const chat = makeChat();
    const fp = L.msgFpOf(chat[1]);
    const result = L.findByFingerprint([chat[1], chat[1]], fp);
    assert.equal(result.state, 'ambiguous');
    assert.equal(L.findRecoverable({ floor: 9, fp }, [chat[1], chat[1]]).state, 'ambiguous');
});

test('bench is read-only and reports all five source states', () => {
    const chat = makeChat();
    const item = { id: 's1', floor: 1, fp: L.msgFpOf(chat[1]), anchor: '原始证据：目标人物', history: [], revision: 1 };
    const { engine } = setup(item, chat);
    const before = JSON.stringify(item);
    const result = D.evidenceSourceBench(engine, { chat, refs: ['seed:s1'] });
    assert.equal(result.ok, true);
    assert.equal(result.writesNothing, true);
    assert.equal(result.counts.verified, 1);
    assert.equal(JSON.stringify(item), before);
});
