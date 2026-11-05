import test from 'node:test';
import assert from 'node:assert/strict';
import RS from '../round-entry-snapshot.js';

test('L14-O1: Fingerprint and basic collector integrity', () => {
  const fp1 = RS.fingerprintOf('short text');
  const fp2 = RS.fingerprintOf('short text');
  assert.equal(RS.fpEqual(fp1, fp2), true);

  const fp3 = RS.fingerprintOf('different text');
  assert.equal(RS.fpEqual(fp1, fp3), false);

  assert.equal(RS.idOf({ id: 'f_1' }), 'f_1');
  assert.equal(RS.idOf({ factId: 'fact_99' }), 'fact_99');
  assert.equal(RS.idOf({ invalidKey: '123' }), null);
});

test('L14-O1: Full lifecycle: record before/after, inspect undoState, undo added only', () => {
  const engine = {};

  let factsStore = [{ id: 'f1', text: 'Alice is a mage' }];
  const ledgersBefore = [
    { key: 'facts', list: () => factsStore }
  ];
  const sumBefore = RS.collectSummary(ledgersBefore);
  assert.equal(sumBefore.ok, true);
  const recBefore = RS.recordSnapshot(engine, { phase: 'before', summary: sumBefore });
  assert.equal(recBefore.ok, true);
  assert.equal(recBefore.seq, 1);

  // 模拟本轮写入：新增 f2、f3，修改 f1
  factsStore = [
    { id: 'f1', text: 'Alice is a grand archmage' }, // modified
    { id: 'f2', text: 'Bob found a crystal' },       // added
    { id: 'f3', text: 'Charlie entered the hall' }    // added
  ];
  const ledgersAfter = [
    { key: 'facts', list: () => factsStore }
  ];
  const sumAfter = RS.collectSummary(ledgersAfter);
  assert.equal(sumAfter.ok, true);
  const recAfter = RS.recordSnapshot(engine, { phase: 'after', summary: sumAfter });
  assert.equal(recAfter.ok, true);
  assert.equal(recAfter.seq, 1); // 复用同轮 seq

  // 状态检查
  const state = RS.roundUndoState(engine);
  assert.equal(state.ok, true);
  assert.equal(state.state, 'ok');
  assert.equal(state.added.length, 2);
  assert.equal(state.modified.length, 1);

  // 执行撤销，修改项保留，只撤销 added
  const removedIds = [];
  const removers = {
    facts: (id) => {
      removedIds.push(id);
      factsStore = factsStore.filter(item => item.id !== id);
      return true; // 返回 true 表示删除成功
    }
  };

  const undoRes = RS.undoRound(engine, { confirm: true, removers });
  assert.equal(undoRes.ok, true);
  assert.equal(undoRes.writes, true);
  assert.equal(removedIds.length, 2);
  assert.ok(removedIds.includes('f2'));
  assert.ok(removedIds.includes('f3'));

  // 原有修改项保留
  assert.equal(factsStore.length, 1);
  assert.equal(factsStore[0].id, 'f1');
  assert.equal(factsStore[0].text, 'Alice is a grand archmage');
});

test('L14-O1: Cross-session boundary and failure isolation: aborted round does not pollute another session', () => {
  const sessionA = {};
  const sessionB = {};

  const sumA = RS.collectSummary([{ key: 'facts', list: () => [{ id: 'a1', text: 'alpha' }] }]);
  RS.recordSnapshot(sessionA, { phase: 'before', summary: sumA });

  // sessionB 完全独立，无快照对
  const stateB = RS.roundUndoState(sessionB);
  assert.equal(stateB.ok, true);
  assert.equal(stateB.state, 'no-round');

  // sessionA 只有 before，属于 half-round
  const stateA = RS.roundUndoState(sessionA);
  assert.equal(stateA.ok, true);
  assert.equal(stateA.state, 'half-round');
  assert.equal(stateA.missing.includes('after'), true);
});