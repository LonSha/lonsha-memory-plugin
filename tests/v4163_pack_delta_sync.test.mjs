// [v4.163.0 · R26-X8] 迁移包增量同步：只带新增与改过，没变就交空增量
// 验收口径：两次导出之间无改动 ⇒ 第二次包为空且明说无变化。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'privacy-forgetting-proof.js'));

const BASE = {
    memories: [
        { id: 'a', text: '海边日落', people: ['林夏'], at: '2026-11-10', floor: 3 },
        { id: 'b', text: '他说要走', people: ['林夏'], at: '2026-11-11', floor: 4 },
        { id: 'c', text: '别人家的事', people: ['陈舟'], at: '2026-11-12', floor: 5 }
    ],
    receipts: []
};

function firstSync(store, sel) {
    const r = P.exportDelta(store || BASE, sel || {}, null);
    return { r: r, sync: r.sync };
}

test('X8-1 第一次同步（没有上次记录）⇒ 全部算新增', () => {
    const { r } = firstSync();
    assert.equal(r.ok, true);
    assert.equal(r.pack.count, 3);
    assert.deepEqual(r.added.sort(), ['a', 'b', 'c']);
    assert.deepEqual(r.changed, []);
    assert.equal(r.unchanged, 0);
    assert.equal(r.base, '');
});

test('X8-2 同步回执记下：整包校验和 + 每条的正文指纹', () => {
    const { r, sync } = firstSync();
    assert.equal(sync.checksum, r.pack.checksum);
    assert.deepEqual(Object.keys(sync.entries).sort(), ['a', 'b', 'c']);
    sync.entries_ = null;
    BASE.memories.forEach((m) => {
        assert.equal(typeof sync.entries[m.id], 'string');
        assert.ok(sync.entries[m.id].length > 0);
    });
    assert.equal(sync.entries.a, P.packKey({ id: 'a', text: '海边日落' }));
});

test('X8-3 两次导出之间无改动 ⇒ 空增量，且明说没变化', () => {
    const { sync } = firstSync();
    const r = P.exportDelta(BASE, {}, sync);
    assert.equal(r.empty, true);
    assert.equal(r.pack.count, 0);
    assert.deepEqual(r.pack.entries, []);
    assert.match(r.reason, /没有任何改动/);
    assert.ok(r.reason.indexOf(sync.checksum) !== -1);
    assert.equal(r.unchanged, 3);
});

test('X8-4 改一条 ⇒ 只带那一条，且记成 changed', () => {
    const { sync } = firstSync();
    const edited = { memories: BASE.memories.map((m) => (m.id === 'b' ? Object.assign({}, m, { text: '他说要回海边' }) : m)), receipts: [] };
    const r = P.exportDelta(edited, {}, sync);
    assert.equal(r.pack.count, 1);
    assert.deepEqual(r.pack.entries.map((e) => e.id), ['b']);
    assert.deepEqual(r.changed, ['b']);
    assert.deepEqual(r.added, []);
    assert.equal(r.unchanged, 2);
});

test('X8-5 加一条 ⇒ 只带新增那条', () => {
    const { sync } = firstSync();
    const grown = { memories: BASE.memories.concat([{ id: 'd', text: '新来的', people: ['小雨'], at: '2026-11-13', floor: 6 }]), receipts: [] };
    const r = P.exportDelta(grown, {}, sync);
    assert.deepEqual(r.added, ['d']);
    assert.deepEqual(r.pack.entries.map((e) => e.id), ['d']);
    assert.equal(r.pack.count, 1);
});

test('X8-6 删一条 ⇒ 增量里不带它（只搬新增与改过，不搬删除）', () => {
    const { sync } = firstSync();
    const cut = { memories: BASE.memories.filter((m) => m.id !== 'c'), receipts: [] };
    const r = P.exportDelta(cut, {}, sync);
    assert.equal(r.empty, true);
    assert.equal(r.pack.count, 0);
    assert.equal(r.total, 2);
    assert.equal(r.pack.entries.some((e) => e.id === 'c'), false);
});

test('X8-7 空增量包仍是合法包：能校验、能导入、一条不加', () => {
    const { sync } = firstSync();
    const r = P.exportDelta(BASE, {}, sync);
    assert.equal(P.verifyPack(r.pack).ok, true);
    const into = P.importPack({ memories: [], receipts: [] }, r.pack);
    assert.equal(into.ok, true);
    assert.equal(into.added, 0);
    assert.equal(into.total, 0);
});

test('X8-8 有改动的增量包能真导入：空库导入后条数 = 增量条数', () => {
    const { sync } = firstSync();
    const edited = { memories: BASE.memories.map((m) => (m.id === 'a' ? Object.assign({}, m, { text: '海边日落（改）' }) : m)), receipts: [] };
    const r = P.exportDelta(edited, {}, sync);
    const into = P.importPack({ memories: [], receipts: [] }, r.pack);
    assert.equal(into.added, 1);
    assert.equal(into.total, r.pack.count);
    assert.equal(into.store.memories[0].text, '海边日落（改）');
});

test('X8-9 增量也受禁入名单约束：删过的人不会因为增量而回流', () => {
    const del = P.forget(BASE, 'person', { person: '林夏' }, { at: '2026-11-18' });
    const r = P.exportDelta(del.store, {}, null);
    assert.equal(r.pack.entries.some((e) => P.peopleOf(e).indexOf('林夏') !== -1), false);
    assert.ok(r.denied.indexOf('林夏') !== -1);
    const old = P.exportDelta(BASE, {}, null).pack;   // 删之前的旧全量
    const back = P.importPack(del.store, old);
    assert.equal(back.blockedCount, 2);
    assert.equal(back.total, del.store.memories.length);
});

test('X8-10 同输入两次同结果，且自检绿', () => {
    const a = P.exportDelta(BASE, {}, null);
    const b = P.exportDelta(BASE, {}, null);
    assert.equal(a.pack.checksum, b.pack.checksum);
    assert.equal(JSON.stringify(a.sync), JSON.stringify(b.sync));
    assert.equal(P.privacySelfCheck().ok, true);
});
