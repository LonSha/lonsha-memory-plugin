/* L13-O2: 单条角色记忆编辑、置顶、遗忘与撤销闭环。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const require_ = createRequire(import.meta.url);
const CENTER_SOURCE = read('memory-center.js');
const ORGANS_SOURCE = read('memory-organs.js');
const UI_SOURCE = read('settings-ui.js');
const INDEX_SOURCE = read('index.js');
const EC_SOURCE = read('engine-evidence-center.js');
const C = require_(path.join(ROOT, 'memory-center.js'));

function loadBank(source = ORGANS_SOURCE) {
    const context = {
        console, globalThis: {}, window: undefined, module: { exports: {} },
        Math, Date, JSON, Number, String, Object, Array, Set, Map, Float32Array,
        fetch: async () => ({ ok: true })
    };
    vm.runInNewContext(source, context, { filename: 'memory-organs.js' });
    return context.module.exports.CharacterMemoryBank;
}
function loadCenter(source = CENTER_SOURCE) {
    const context = { console, globalThis: {}, window: undefined, module: { exports: {} } };
    vm.runInNewContext(source, context, { filename: 'memory-center.js' });
    return context.module.exports;
}
function fixture() {
    const events = [];
    const Bank = loadBank();
    const bank = new Bank();
    bank.bindOpLog({ log: (...args) => events.push(args) });
    const item = bank.addRecent('苏晴', '旧的角色记忆', 7);
    const ref = 'char-mem:' + encodeURIComponent('苏晴') + ':' + encodeURIComponent(item.id);
    return { bank, item, ref, events };
}
function memoryRows(bank) {
    return bank.memoryCenterRows().map((x) => ({
        ref: 'char-mem:' + encodeURIComponent(x.char) + ':' + encodeURIComponent(x.item.id),
        title: x.item.text, detail: x.char + ' · ' + x.bucket, status: x.item.pinned ? 'pinned' : 'active',
        floor: x.item.floor, updatedFloor: x.item.editedAt || x.item.ts, revision: x.item.memoryRevision || 0,
        actors: [{ field: 'char', name: x.char }], text: x.item.text, memoryItem: x.item
    }));
}
function deps() {
    const Q = require_(path.join(ROOT, 'evidence-query.js'));
    const W = require_(path.join(ROOT, 'evidence-workbench.js'));
    return { query: Q.query, normalizeSpec: Q.normalizeSpec, upsertSaved: Q.upsertSaved,
        removeSaved: Q.removeSaved, replaySaved: Q.replaySaved, FILTERS: Q.FILTERS, LEDGERS: W.LEDGERS };
}
function fakeHost(bank) {
    return { charMem: bank, worldProg: { seedLedger: null, commitmentLedger: null, parallelLedger: null,
        secretLedger: null, recallEcho: null, echoLedger: null }, _factVersionState: { facts: [] },
        _eventThreadState: { events: [] }, _repairState: { repairs: [] } };
}

function assertMemoryActions(face) {
    const row = face.actions.filter((a) => ['row.edit', 'row.pin', 'row.forget'].includes(a.id));
    assert.equal(row.length, 3);
    assert.ok(row.every((a) => a.kind === 'write' && a.writes === true && a.undo === true));
}

test('L13-O2 A: 动作声明、owner slot 与面板行内编辑入口在场', () => {
    assert.deepEqual(C.ACTIONS.filter((a) => a.id.startsWith('row.')).map((a) => a.id),
        ['row.detail', 'row.repair.preview', 'row.revoke', 'row.dispute', 'row.export', 'row.edit', 'row.pin', 'row.forget']);
    assert.match(INDEX_SOURCE, /memoryCenterEdit\(ref, text, opts\)/);
    assert.match(INDEX_SOURCE, /memoryCenterPin\(ref, opts\)/);
    assert.match(INDEX_SOURCE, /memoryCenterForget\(ref, opts\)/);
    assert.match(UI_SOURCE, /plugin\._memoryCenterHandlers\['row\.edit'\]/);
    assert.match(UI_SOURCE, /data-mc-inline-editor/);
    assert.match(UI_SOURCE, /plugin\._memoryCenterHandlers\['row\.pin'\]/);
    assert.match(UI_SOURCE, /plugin\._memoryCenterHandlers\['row\.forget'\]/);
    assert.match(EC_SOURCE, /memoryCenterRows\(\)/);
    assert.match(ORGANS_SOURCE, /memoryCenterRows\(\)/);
});

test('L13-O2 B: 编辑走 memory-organs slot，保留 id，oplog 记 edit/undo，导出导入仍为新正文', () => {
    const { bank, item, ref, events } = fixture();
    const host = fakeHost(bank);
    const edited = C.editRow(host, ref, '新的角色记忆');
    assert.equal(edited.ok, true);
    assert.equal(edited.changed, true);
    assert.equal(edited.before, '旧的角色记忆');
    assert.equal(edited.after, '新的角色记忆');
    assert.equal(bank.of('苏晴').recent[0].id, item.id);
    assert.equal(bank.of('苏晴').recent[0].text, '新的角色记忆');
    assert.ok(events.some((e) => e[0] === 'char_mem' && e[1] === 'edit' && e[2] === item.id));
    const packed = bank.export();
    const Bank = loadBank();
    const restored = new Bank();
    const restoredEvents = [];
    restored.bindOpLog({ log: (...args) => restoredEvents.push(args) });
    restored.import(packed);
    assert.equal(restored.of('苏晴').recent[0].text, '新的角色记忆');
    const undone = C.editRow({ charMem: restored }, ref, '旧的角色记忆', { undo: true, expectedAfter: '新的角色记忆' });
    assert.equal(undone.ok, true);
    assert.equal(restored.of('苏晴').recent[0].text, '旧的角色记忆');
    assert.ok(restoredEvents.some((e) => e[0] === 'char_mem' && e[1] === 'undo' && e[2] === item.id));
    assert.equal(C.editRow({ charMem: restored }, ref, '不应覆盖', { undo: true, expectedAfter: '已被别处改过' }).reason, 'stale-current');
});

test('L13-O2 C: 置顶与遗忘走 owner slot，撤销分别恢复状态，tombstone/oplog 保留 provenance', () => {
    const { bank, item, ref, events } = fixture();
    const host = fakeHost(bank);
    const pin = C.pinRow(host, ref, { pinned: true });
    assert.equal(pin.ok, true);
    assert.equal(bank.of('苏晴').recent[0].pinned, true);
    assert.equal(C.pinRow(host, ref, { undo: true, beforePinned: false, expectedAfter: true }).ok, true);
    assert.equal(bank.of('苏晴').recent[0].pinned, false);
    const forgotten = C.forgetRow(host, ref, {});
    assert.equal(forgotten.ok, true);
    assert.equal(bank.of('苏晴').recent.some((x) => x.id === item.id), false);
    assert.equal(bank.listTombstones('苏晴')[0].item.id, item.id);
    assert.ok(events.some((e) => e[0] === 'tombstone' && e[1] === 'delete' && e[2] === item.id));
    assert.equal(C.forgetRow(host, ref, { undo: true }).ok, true);
    assert.equal(bank.of('苏晴').recent[0].text, '旧的角色记忆');
    assert.ok(events.some((e) => e[0] === 'tombstone' && e[1] === 'restore' && e[2] === item.id));
});

test('L13-O2 D: memory-center 读面来自 owner slot，HTML 仅给角色记忆三动作', () => {
    const { bank } = fixture();
    const face = C.dispatch(deps(), C.blankState(), {
        host: fakeHost(bank), apis: {}, memoryRows: memoryRows(bank),
        availableHandlers: C.ACTIONS.map((a) => a.id)
    });
    assertMemoryActions(face);
    assert.equal(face.memoryRows.length, 1);
    assert.equal(face.memoryRows[0].title, '旧的角色记忆');
    const html = C.sheetHtml(face);
    assert.match(html, /data-ref="char-mem:/);
    assert.match(html, /data-action="row\.edit"/);
    assert.match(html, /data-action="row\.pin"/);
    assert.match(html, /data-action="row\.forget"/);
});

test('L13-O2 F: 长记忆编辑不得被显示层截断污染 owner 正文（title 截 160 / owner 保 200）', () => {
    /* 读面与写面量纲不同：memory-center 的 title 是**显示串**（MAX_TEXT=160），
     *   owner slot 的正文上限是 200。面板行内编辑若拿显示串当初值，长记忆的尾部
     *   会被静默截掉并写回 slot —— 这是数据损坏，不能用「显示截断」解释掉。 */
    const bank = new (loadBank())();
    const long = '甲'.repeat(199) + '煞';
    const item = bank.addRecent('苏晴', long, 7);
    assert.equal(item.text.length, 200, 'owner 须原样持有 200 字');
    const ref = 'char-mem:' + encodeURIComponent('苏晴') + ':' + encodeURIComponent(item.id);
    const face = C.dispatch(deps(), C.blankState(), {
        host: fakeHost(bank), apis: {}, memoryRows: memoryRows(bank),
        availableHandlers: C.ACTIONS.map((a) => a.id)
    });
    const row = face.memoryRows[0];
    /* text() 截断会追加省略号：160 字 + 「…」= 161 字符，故判据钉「已截断且尾部是省略号」，不钉固定长度 */
    assert.ok(row.title.length < 200 && row.title.endsWith('…'), '读面 title 是被截断的显示串（尾带省略号）');
    assert.equal(row.memoryItem.text.length, 200, '同一行的 owner 原文必须仍是 200（两面不混用）');
    /* 用 owner 原文作为编辑初值：尾部必须逐字保留 */
    const kept = C.editRow({ charMem: bank }, ref, row.memoryItem.text);
    assert.equal(kept.ok, true);
    assert.equal(bank.of('苏晴').recent[0].text.length, 200, '用 owner 原文编辑后长度不变');
    assert.equal(bank.of('苏晴').recent[0].text.slice(-1), '煞', '尾部一字不得丢');
    /* 负控制：若误用显示串当初值，尾部就会丢 —— 同一判据必须能翻红 */
    const broken = new (loadBank())();
    const brokenItem = broken.addRecent('苏晴', long, 7);
    const brokenRef = 'char-mem:' + encodeURIComponent('苏晴') + ':' + encodeURIComponent(brokenItem.id);
    const brokenFace = C.dispatch(deps(), C.blankState(), {
        host: fakeHost(broken), apis: {}, memoryRows: memoryRows(broken),
        availableHandlers: C.ACTIONS.map((a) => a.id)
    });
    C.editRow({ charMem: broken }, brokenRef, brokenFace.memoryRows[0].title);
    assert.notEqual(broken.of('苏晴').recent[0].text.length, 200, '误用显示串必丢尾部（判据非恒真）');
    /* 源码面：行内编辑初值必须引 owner 原文，不得只剩 DOM 取文 */
    assert.match(UI_SOURCE, /memoryItem\.text/, '行内编辑初值须取 owner 原文 memoryItem.text');
    assert.match(UI_SOURCE, /_owner == null \? \(row\.querySelector\('\.ls-item-text'\)/,
        'DOM 取文只能作为 face 缺席时的降级分支');
});
test('L13-O2 E: 三条真源码破坏负控制都能观测到失败', () => {
    const { bank, ref } = fixture();
    assert.equal(C.editRow({ charMem: bank }, ref, '新正文').ok, true);

    const brokenCenter = loadCenter(CENTER_SOURCE.replace('slot.editMemory?.', 'slot.__editMemoryMissing?.'));
    assert.equal(brokenCenter.editRow({ charMem: bank }, ref, '再改一次').ok, false);

    const brokenLog = ORGANS_SOURCE.replace("this.opLog?.log?.('char_mem', 'edit'", "this.opLog?.log?.('char_mem', 'edit_broken'");
    const BrokenBank = loadBank(brokenLog);
    const events = [];
    const brokenBank = new BrokenBank();
    brokenBank.bindOpLog({ log: (...args) => events.push(args) });
    const brokenItem = brokenBank.addRecent('苏晴', '旧', 7);
    const brokenRef = 'char-mem:' + encodeURIComponent('苏晴') + ':' + encodeURIComponent(brokenItem.id);
    assert.equal(C.editRow({ charMem: brokenBank }, brokenRef, '新').ok, true);
    assert.equal(events.some((e) => e[0] === 'char_mem' && e[1] === 'edit'), false);

    const brokenUndo = ORGANS_SOURCE.replace("this.opLog?.log?.('char_mem', 'undo'", "this.opLog?.log?.('char_mem', 'undo_broken'");
    const UndoBank = loadBank(brokenUndo);
    const undoEvents = [];
    const undoBank = new UndoBank();
    undoBank.bindOpLog({ log: (...args) => undoEvents.push(args) });
    const undoItem = undoBank.addRecent('苏晴', '旧', 7);
    const undoRef = 'char-mem:' + encodeURIComponent('苏晴') + ':' + encodeURIComponent(undoItem.id);
    assert.equal(C.editRow({ charMem: undoBank }, undoRef, '新').ok, true);
    assert.equal(C.editRow({ charMem: undoBank }, undoRef, '旧', { undo: true, expectedAfter: '新' }).ok, true);
    assert.equal(undoEvents.some((e) => e[0] === 'char_mem' && e[1] === 'undo'), false);
});
