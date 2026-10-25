import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Workbench = require('../conflict-group-arbitration-workbench.js');

test('L10-O2 · clusterEvidenceBundles 聚类与冲突检测', () => {
  const facts = [
    { id: 'f-1', subject: 'Alice', predicate: 'age', object: '17', floor: 5 },
    { id: 'f-2', subject: 'Alice', predicate: 'age', object: '27', floor: 25 },
    { id: 'f-3', subject: 'Alice', predicate: 'hometown', object: 'Baoji', floor: 2 },
    { id: 'f-4', subject: 'Alice', predicate: 'hometown', object: 'Baoji', floor: 10 }
  ];

  const bundles = Workbench.clusterEvidenceBundles(facts);
  assert.equal(bundles.length, 2);

  const ageBundle = bundles.find(b => b.predicate === 'age');
  assert.equal(ageBundle.isConflicting, true);
  assert.equal(ageBundle.candidateCount, 2);

  const homeBundle = bundles.find(b => b.predicate === 'hometown');
  assert.equal(homeBundle.isConflicting, false);
  assert.equal(homeBundle.candidateCount, 2);
});

test('L10-O2 · executeArbitration ADOPT 采纳与历史作废', () => {
  const facts = [
    { id: 'f-1', subject: 'Alice', predicate: 'age', object: '17', state: 'active' },
    { id: 'f-2', subject: 'Alice', predicate: 'age', object: '27', state: 'active' }
  ];
  const bundles = Workbench.clusterEvidenceBundles(facts);
  const ageBundle = bundles[0];

  const record = Workbench.executeArbitration(ageBundle, Workbench.VERDICTS.ADOPT, {
    selectedId: 'f-2',
    reason: '十年后最新身份揭晓',
    operator: 'admin'
  });

  assert.equal(record.verdict, 'ADOPT');
  assert.equal(record.adoptedId, 'f-2');

  const winner = record.results.find(r => r.id === 'f-2');
  assert.equal(winner.state, 'adopted');
  assert.equal(winner.isSuperseded, false);

  const loser = record.results.find(r => r.id === 'f-1');
  assert.equal(loser.state, 'superseded');
  assert.equal(loser.isSuperseded, true);
  assert.equal(loser.supersededBy, 'f-2');

  // 验证可逆 undo
  const restored = Workbench.undoArbitration(ageBundle, record);
  const restored1 = restored.find(r => r.id === 'f-1');
  assert.equal(restored1.state, 'active');
  assert.equal(restored1.isSuperseded, false);
  assert.equal(restored1.supersededBy, undefined);
});

test('L10-O2 · JUXTAPOSE 与 PENDING 裁决及影响面分析', () => {
  const facts = [
    { id: 'f-1', subject: 'Bob', predicate: 'job', object: '侦探', perspective: '表面公知' },
    { id: 'f-2', subject: 'Bob', predicate: 'job', object: '间谍', perspective: '秘密实情' }
  ];
  const bundles = Workbench.clusterEvidenceBundles(facts);
  const jobBundle = bundles[0];

  // JUXTAPOSE
  const jxRecord = Workbench.executeArbitration(jobBundle, Workbench.VERDICTS.JUXTAPOSE, {
    reason: '双重身份设定'
  });
  assert.equal(jxRecord.results.length, 2);
  assert.equal(jxRecord.results[0].state, 'juxtaposed');
  assert.equal(jxRecord.results[1].state, 'juxtaposed');

  const impact = Workbench.analyzeArbitrationImpact(jxRecord);
  assert.equal(impact.injectionStatus, 'DUAL_PERSPECTIVE_INJECTION');
  assert.equal(impact.retainedFactsCount, 2);

  const prompt = Workbench.formatArbitrationPrompt(jxRecord);
  assert.ok(prompt.includes('多重视角并存'));
  assert.ok(prompt.includes('表面公知'));
  assert.ok(prompt.includes('秘密实情'));
});
