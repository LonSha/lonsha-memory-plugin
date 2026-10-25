import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FeedbackHub = require('../dynamic-recall-route-feedback-hub.js');

test('L10-O4 · rankCandidatesByRoute 依据路线偏好重排序', () => {
  const candidates = [
    { id: '1', title: '决斗事件', type: 'EVENT', relevanceScore: 0.6 },
    { id: '2', title: '盟约公文', type: 'EVIDENCE', relevanceScore: 0.65 }
  ];

  // 经历优先路线
  const expRanked = FeedbackHub.rankCandidatesByRoute(candidates, FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN);
  assert.equal(expRanked[0].id, '1'); // 0.6 * 1.5 = 0.9 > 0.65

  // 证据优先路线
  const eviRanked = FeedbackHub.rankCandidatesByRoute(candidates, FeedbackHub.RECALL_ROUTES.EVIDENCE_TRIANGULATION);
  assert.equal(eviRanked[0].id, '2'); // 0.65 * 1.6 = 1.04 > 0.6
});

test('L10-O4 · disambiguateEntities 同名异人与多版本隔离消歧', () => {
  const candidates = [
    { id: '1', title: '萧忆柔日常', moduleName: '海棠', cleanNickname: '忆柔' },
    { id: '2', title: '萧忆柔太太', moduleName: '萧家日常', cleanNickname: '萧太太' }
  ];

  // 模块 + 昵称精准匹配消歧
  const moduleFiltered = FeedbackHub.disambiguateEntities(candidates, {
    targetModule: '萧家日常',
    cleanNickname: '萧太太'
  });
  assert.equal(moduleFiltered.length, 1);
  assert.equal(moduleFiltered[0].id, '2');

  const ageCandidates = [
    { id: '3', title: '珞珈少年版', characterAge: 17 },
    { id: '4', title: '珞珈十年后', characterAge: 27 }
  ];

  // 年龄版本跨度隔离
  const ageFiltered = FeedbackHub.disambiguateEntities(ageCandidates, {
    characterAge: 27
  });
  // 17 岁与 27 岁差 10 > 5，剔除
  const hasAge17 = ageFiltered.some(it => it.id === '3');
  const hasAge27 = ageFiltered.some(it => it.id === '4');
  assert.equal(hasAge17, false);
  assert.equal(hasAge27, true);
});

test('L10-O4 · recordFeedbackAndAdjust 质量反馈闭环自适应调权', () => {
  let state = { weights: {} };

  // 提交 HELPFUL
  state = FeedbackHub.recordFeedbackAndAdjust(state, FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN, FeedbackHub.FEEDBACK_RATINGS.HELPFUL);
  assert.ok(state.weights[FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN] > 1.0);

  // 提交 HALLUCINATION_INDUCING (大幅降权)
  state = FeedbackHub.recordFeedbackAndAdjust(state, FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN, FeedbackHub.FEEDBACK_RATINGS.HALLUCINATION_INDUCING);
  assert.ok(state.weights[FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN] < 1.0);
  assert.equal(state.history.length, 2);
});