import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Tracker = require('../postgen-intent-cost-tracker.js');

test('L10-O6 · extractIntentProposals 高价值意图鉴别', () => {
  const text1 = '你放心，我答应你明天一定去参加你的毕业典礼。';
  const p1 = Tracker.extractIntentProposals(text1, { speaker: 'Alice', target: 'Bob', floor: 12 });
  assert.equal(p1.length >= 1, true);
  assert.equal(p1[0].type, Tracker.INTENT_TYPES.PLEDGE_COMMITMENT);
  assert.equal(p1[0].valueRating, 'HIGH');
  assert.equal(p1[0].speaker, 'Alice');

  const text2 = '其实我是从十年前穿越回来的特工。';
  const p2 = Tracker.extractIntentProposals(text2, { speaker: 'Alice' });
  assert.equal(p2[0].type, Tracker.INTENT_TYPES.FACTUAL_REVELATION);
  assert.equal(p2[0].valueRating, 'HIGH');

  const text3 = '今天天气不错，哈哈。';
  const p3 = Tracker.extractIntentProposals(text3);
  assert.equal(p3[0].type, Tracker.INTENT_TYPES.CHAT_FILLER);
  assert.equal(p3[0].valueRating, 'LOW');
});

test('L10-O6 · trackExtractionCost 计算代价与认知收益比度量', () => {
  const proposals = [
    { type: Tracker.INTENT_TYPES.PLEDGE_COMMITMENT, valueRating: 'HIGH' },
    { type: Tracker.INTENT_TYPES.EMOTIONAL_DISCLOSURE, valueRating: 'MEDIUM' }
  ];

  const costAudit = Tracker.trackExtractionCost({
    elapsedMs: 15,
    tokensProcessed: 120,
    mode: 'heuristic-fast'
  }, proposals);

  assert.equal(costAudit.highValueProposals, 1);
  assert.equal(costAudit.mediumValueProposals, 1);
  assert.ok(costAudit.totalCostScore > 0);
  assert.ok(costAudit.roi > 0);
  assert.equal(costAudit.mode, 'heuristic-fast');
});