/* L13-O8: 记忆软删、可查、可恢复、可彻底清除的行为验收。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url);
const source = fs.readFileSync(new URL('memory-organs.js', root), 'utf8');

function loadBank(sourceText = source) {
  const context = {
    console,
    globalThis: {},
    window: undefined,
    module: { exports: {} },
    Math, Date, JSON, Number, String, Object, Array, Set, Map, Float32Array,
    fetch: async () => ({ ok: true }),
  };
  vm.runInNewContext(sourceText, context, { filename: 'memory-organs.js' });
  return context.module.exports.CharacterMemoryBank;
}

test('L13-O8: 删除进入 tombstone、of 不召回、oplog 可查、恢复保留原 id 与字段', () => {
  const Bank = loadBank();
  const events = [];
  const bank = new Bank();
  bank.bindOpLog({ log: (...args) => events.push(args) });
  const original = bank.addRecent('A', '必须保留原文', 7);
  const before = JSON.parse(JSON.stringify(original));
  assert.equal(bank.deleteMemory('A', original.id, { deletedBy: 'tester', reason: '验收' }), true);
  assert.equal(bank.of('A').recent.some((x) => x.id === original.id), false);
  const tomb = bank.listTombstones('A');
  assert.equal(tomb.length, 1);
  assert.deepEqual(tomb[0].item, before);
  assert.equal(tomb[0].deletedBy, 'tester');
  assert.ok(events.some((e) => e[0] === 'tombstone' && e[1] === 'delete' && e[2] === original.id));
  assert.equal(bank.restoreMemory('A', original.id), true);
  assert.deepEqual(bank.of('A').recent[0], before);
  assert.equal(bank.listTombstones('A').length, 0);
  assert.ok(events.some((e) => e[0] === 'tombstone' && e[1] === 'restore' && e[2] === original.id));
});

test('L13-O8: tombstone export/import 对称，彻底清除必须显式 confirm', () => {
  const Bank = loadBank();
  const bank = new Bank();
  const item = bank.addCore('A', '待彻底清除', 1);
  bank.deleteMemory('A', item.id);
  const packed = bank.export();
  assert.equal(packed.tombstones.A[0].item.id, item.id);
  const copy = new Bank();
  copy.import(packed);
  assert.equal(copy.listTombstones('A')[0].item.id, item.id);
  assert.equal(copy.purgeTombstone('A', item.id), false);
  assert.equal(copy.purgeTombstone('A', item.id, { confirm: true }), true);
  assert.equal(copy.listTombstones('A').length, 0);
});

test('L13-O8: 负控制 — 真源去掉 tombstone 写入后，原验收判据必须观测到失败', () => {
  const brokenSource = source.replace(
    "this._tombList(char).push(tomb);",
    "/* negative-control: tombstone write removed */"
  );
  assert.notEqual(brokenSource, source, '负控制锚点必须恰中真源码一次');
  const Bank = loadBank(brokenSource);
  const bank = new Bank();
  const item = bank.addRecent('A', '负控制条目', 2);
  bank.deleteMemory('A', item.id);
  assert.equal(bank.listTombstones('A').length, 0, '破坏后应观测到 tombstone 缺失');
  assert.notEqual(bank.listTombstones('A').length, 1, '原版验收条件在破坏副本上必须为假');
});