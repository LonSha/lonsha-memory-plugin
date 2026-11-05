import test from 'node:test';
import assert from 'node:assert/strict';
import Reinterpretation from '../character-reinterpretation-versions.js';

test('L14-X3: createReinterpretationLedger and selfCheck', () => {
  const check = Reinterpretation.characterReinterpretationSelfCheck();
  assert.equal(check.status, 'ok');

  const ledger = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: {
      eventId: 'evt_101',
      floor: 12,
      canonicalFactSummary: 'Bob did not attend Alice birthday dinner.'
    }
  });

  assert.equal(ledger.characterId, 'alice');
  assert.equal(ledger.targetEntityId, 'bob');
  assert.equal(ledger.versions.length, 0);
});

test('L14-X3: addInitialInterpretation and proposeReinterpretation with trigger evidence', () => {
  let ledger = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: {
      eventId: 'evt_101',
      floor: 12,
      canonicalFactSummary: 'Bob did not attend Alice birthday dinner.'
    }
  });

  ledger = Reinterpretation.addInitialInterpretation(ledger, {
    floor: 12,
    interpretationText: 'Bob did not care about our friendship and deliberately ignored my party.'
  });

  assert.equal(ledger.versions.length, 1);
  assert.equal(ledger.activeVersionId, 'ver_1');
  assert.equal(ledger.versions[0].status, Reinterpretation.INTERPRETATION_STATUS.ACCEPTED);

  // 缺少触发证据提议改观应抛出异常
  assert.throws(() => {
    Reinterpretation.proposeReinterpretation(ledger, {
      floor: 35,
      interpretationText: 'Maybe he had an urgent matter.'
    });
  }, /trigger-evidence-required/);

  // 携带触发证据
  ledger = Reinterpretation.proposeReinterpretation(ledger, {
    floor: 35,
    interpretationText: 'Bob was actually hospitalized for acute appendicitis on that night.',
    triggerEvidence: {
      evidenceId: 'hospital_record_88',
      floor: 34,
      summary: 'Medical discharge slip showing surgery on that exact evening.'
    }
  });

  assert.equal(ledger.versions.length, 2);
  assert.equal(ledger.versions[1].status, Reinterpretation.INTERPRETATION_STATUS.DRAFT);
  assert.equal(ledger.activeVersionId, 'ver_1'); // 提议阶段旧认知依然活跃
});

test('L14-X3: resolveReinterpretation accept vs reject and compareInterpretations', () => {
  let ledger = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: {
      eventId: 'evt_101',
      floor: 12,
      canonicalFactSummary: 'Bob did not attend Alice birthday dinner.'
    }
  });

  ledger = Reinterpretation.addInitialInterpretation(ledger, {
    floor: 12,
    interpretationText: 'He intentionally skipped my party.'
  });

  ledger = Reinterpretation.proposeReinterpretation(ledger, {
    floor: 35,
    interpretationText: 'He had acute medical emergency.',
    triggerEvidence: {
      evidenceId: 'med_slip_1',
      floor: 34,
      summary: 'Hospital records'
    }
  });

  // 比较两版
  const diff = Reinterpretation.compareInterpretations(ledger, 'ver_1', 'ver_2');
  assert.equal(diff.hasTriggerEvidence, true);
  assert.equal(diff.originalFactPreserved, true);
  assert.equal(diff.older.status, 'accepted');
  assert.equal(diff.newer.status, 'draft');

  // 采纳新解释
  const acceptedLedger = Reinterpretation.resolveReinterpretation(ledger, 'ver_2', 'accept');
  assert.equal(acceptedLedger.activeVersionId, 'ver_2');
  assert.equal(acceptedLedger.versions[0].status, 'superseded'); // 旧版自动被接替归档，不覆写
  assert.equal(acceptedLedger.versions[1].status, 'accepted');

  // 时光机回溯查询：在 floor 20 查询时应得到 ver_1；在 floor 40 查询时得到 ver_2
  const atF20 = Reinterpretation.getInterpretationAtFloor(acceptedLedger, 20);
  assert.equal(atF20.versionId, 'ver_1');
  const atF40 = Reinterpretation.getInterpretationAtFloor(acceptedLedger, 40);
  assert.equal(atF40.versionId, 'ver_2');
});
