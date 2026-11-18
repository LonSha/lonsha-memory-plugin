// [v4.161.0 · R25-X8] 记忆迁移包：只带某个人 / 某段时间 / 某模态
// 验收口径：导出再导入同一包两次，库内存量不变；导入后召回结果与导出前一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'privacy-forgetting-proof.js'));

const STORE = {
    memories: [
        { id: 'a', text: '海边日落', people: ['林夏'], modality: 'image', at: '2026-11-10', floor: 3 },
        { id: 'b', text: '他说要走', people: ['林夏'], at: '2026-11-11', floor: 4 },
        { id: 'c', text: '别人家的事', people: ['陈舟'], at: '2026-11-12', floor: 5 }
    ],
    receipts: []
};

test('X8-1 按人筛：包里只带这个人，别的人一条不带', () => {
    const ex = P.exportPack(STORE, { person: '林夏' });
    assert.equal(ex.pack.kind, 'lonsha-memory-migration');
    assert.equal(ex.pack.version, 1);
    assert.deepEqual(ex.pack.entries.map((e) => e.id), ['a', 'b']);
    assert.equal(ex.pack.count, 2);
});

test('X8-2 按时段筛 / 按模态筛，都能单独生效', () => {
    assert.deepEqual(P.exportPack(STORE, { from: '2026-11-11' }).pack.entries.map((e) => e.id), ['b', 'c']);
    assert.deepEqual(P.exportPack(STORE, { to: '2026-11-10' }).pack.entries.map((e) => e.id), ['a']);
    assert.deepEqual(P.exportPack(STORE, { modality: 'image' }).pack.entries.map((e) => e.id), ['a']);
});

test('X8-3 包带校验和：同输入必同校验和，改一个字必变', () => {
    const a = P.exportPack(STORE, { person: '林夏' });
    const b = P.exportPack(STORE, { person: '林夏' });
    assert.equal(a.pack.checksum, b.pack.checksum);
    const tampered = JSON.parse(JSON.stringify(a.pack));
    tampered.entries[0].text = '海边日落（改）';
    assert.notEqual(tampered.entries[0].text, a.pack.entries[0].text);
    assert.deepEqual(P.verifyPack(tampered).bad, ['checksum-mismatch']);
});

test('X8-4 坏包拒收：不是包 / 版本不符，各自具名', () => {
    assert.deepEqual(P.verifyPack({ kind: 'other', version: 1 }).bad, ['not-a-pack']);
    assert.deepEqual(P.verifyPack(null).bad, ['not-a-pack']);
    const v2 = { kind: 'lonsha-memory-migration', version: 2, checksum: 'x', entries: [] };
    assert.deepEqual(P.verifyPack(v2).bad, ['version-mismatch']);
});

test('X8-5 导出再导入空库两次 ⇒ 第二次一条不加（幂等）', () => {
    const pack = P.exportPack(STORE, { person: '林夏' }).pack;
    const empty = { memories: [], receipts: [] };
    const once = P.importPack(empty, pack);
    assert.equal(once.ok, true);
    assert.equal(once.added, 2);
    assert.equal(once.total, 2);
    const twice = P.importPack(once.store, pack);
    assert.equal(twice.added, 0);
    assert.equal(twice.skipped, 2);
    assert.equal(twice.total, 2, '库内存量必须不变');
});

test('X8-6 导回原库 ⇒ 一条不双写（同 id 同正文就是同一条）', () => {
    const pack = P.exportPack(STORE, { person: '林夏' }).pack;
    const back = P.importPack(STORE, pack);
    assert.equal(back.added, 0);
    assert.equal(back.total, STORE.memories.length);
});

test('X8-7 导入后召回结果与导出前一致（内容不变形）', () => {
    const pack = P.exportPack(STORE, {}).pack;
    const into = P.importPack({ memories: [], receipts: [] }, pack);
    const a = P.list(STORE, { query: '海边' });
    const b = P.list(into.store, { query: '海边' });
    assert.ok(a.items.length >= 1);
    assert.deepEqual(a.items.map((r) => r.id), b.items.map((r) => r.id));
    assert.deepEqual(a.items.map((r) => r.text), b.items.map((r) => r.text));
});

test('X8-8 包不带内部多余字段（只搬数据，不搬实现痕迹）', () => {
    const pack = P.exportPack(STORE, {}).pack;
    const keys = Object.keys(pack).sort();
    assert.deepEqual(keys, ['checksum', 'count', 'entries', 'kind', 'selector', 'version']);
    assert.deepEqual(Object.keys(pack.entries[0]).sort(), ['at', 'floor', 'id', 'modality', 'people', 'text', 'type']);
});

test('X8-9 空选面 ⇒ 空包（count 0，不乱抓）', () => {
    const pack = P.exportPack(STORE, { person: '查无此人' }).pack;
    assert.equal(pack.count, 0);
    assert.deepEqual(pack.entries, []);
    assert.equal(P.importPack({ memories: [], receipts: [] }, pack).added, 0);
});

test('X8-10 自检绿', () => {
    const sc = P.privacySelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
