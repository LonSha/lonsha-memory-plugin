import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FeedbackHub = require('../dynamic-recall-route-feedback-hub.js');

test('L14-O4 · 同名两人分属不同世界线时不串命中 (世界线消歧隔离)', () => {
  const candidates = [
    { id: 'char_alpha_1', name: '林澈', worldline: 'world_timeline_A', relevanceScore: 0.8 },
    { id: 'char_beta_2', name: '林澈', worldline: 'world_timeline_B', relevanceScore: 0.9 },
    { id: 'char_universal', name: '世界观察者', worldline: 'any', isUniversalWorldline: true, relevanceScore: 0.5 }
  ];

  // 1. 过滤查询为 timeline_A，不得串命中 timeline_B 的同名角色
  const filteredA = FeedbackHub.disambiguateEntities(candidates, {
    targetWorldline: 'world_timeline_A'
  });
  const hasA = filteredA.some(c => c.id === 'char_alpha_1');
  const hasB = filteredA.some(c => c.id === 'char_beta_2');
  const hasUniversal = filteredA.some(c => c.id === 'char_universal');

  assert.equal(hasA, true, '应当召回 timeline_A 的林澈');
  assert.equal(hasB, false, 'timeline_B 的同名林澈必须被隔离剔除');
  assert.equal(hasUniversal, true, '具有 isUniversalWorldline 的通用条目应当放行');
});

test('L14-O4 · 一次性排除与临时偏好微调不改写全局持久偏好 (可回退原排序)', () => {
  const baseGlobalState = {
    weights: {
      [FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN]: 1.2,
      [FeedbackHub.RECALL_ROUTES.EVIDENCE_TRIANGULATION]: 1.0
    },
    history: []
  };

  const candidates = [
    { id: 'ev_1', title: '旧信件', type: 'EVIDENCE', relevanceScore: 0.8 },
    { id: 'act_1', title: '突围战斗', type: 'EVENT', relevanceScore: 0.75 }
  ];

  // 原始排序（经历优先 0.75*1.5*1.2=1.35，证据优先 0.8*1.6*1.0=1.28）
  const originalRanked = FeedbackHub.rankCandidatesByRoute(candidates, FeedbackHub.RECALL_ROUTES.BALANCED_HYBRID, baseGlobalState.weights);
  assert.equal(originalRanked[0].id, 'ev_1');

  // 单次查询临时偏好覆盖：临时强化 EVIDENCE_TRIANGULATION，降权 EXPERIENCE_CHAIN
  const transientState = FeedbackHub.applyTransientRouteOverrides(baseGlobalState, {
    weights: {
      [FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN]: 0.5,
      [FeedbackHub.RECALL_ROUTES.EVIDENCE_TRIANGULATION]: 2.0
    }
  });

  // 全局偏好未被污染
  assert.equal(baseGlobalState.weights[FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN], 1.2, '全局状态不得被原地修改');
  assert.equal(transientState.weights[FeedbackHub.RECALL_ROUTES.EXPERIENCE_CHAIN], 0.5, '临时状态应当反映覆盖权重');

  // 回退操作（丢弃临时状态，重新使用 baseGlobalState）完全复现原排序
  const restoredRanked = FeedbackHub.rankCandidatesByRoute(candidates, FeedbackHub.RECALL_ROUTES.BALANCED_HYBRID, baseGlobalState.weights);
  assert.deepEqual(restoredRanked.map(c => c.id), originalRanked.map(c => c.id), '回退偏好后必须复现原排序');
});

test('L14-O4 · 一次性排除临时生效且不写底层事实', () => {
  const candidates = [
    { id: 'fact_101', text: '昨日密谈', relevanceScore: 0.9 },
    { id: 'fact_102', text: '今日动向', relevanceScore: 0.8 }
  ];

  const filtered = FeedbackHub.disambiguateEntities(candidates, {
    excludeIds: ['fact_101']
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'fact_102');
  assert.equal(candidates[0].id, 'fact_101', '原始事实条目保持不变');
});

test('L14-O4 · explainRecallHit 输出条目命中解释与消歧隔离状态', () => {
  const item = {
    id: 'char_test_1',
    title: '少年沈浪',
    type: 'CHARACTER',
    worldline: 'timeline_alpha',
    characterAge: 16,
    relevanceScore: 0.7
  };

  const exp = FeedbackHub.explainRecallHit(item, FeedbackHub.RECALL_ROUTES.BALANCED_HYBRID, {}, {
    targetWorldline: 'timeline_alpha',
    characterAge: 18
  });

  assert.equal(exp.itemId, 'char_test_1');
  assert.equal(exp.disambiguation.passed, true);
  assert.equal(exp.disambiguation.matchedWorldline, true);
  assert.equal(exp.disambiguation.matchedAge, true);
  assert.ok(exp.reason.includes('匹配路由'));
});

test('L14-O4 · recallRouteFeedbackHubSelfCheck 自检接口契约', () => {
  const check = FeedbackHub.recallRouteFeedbackHubSelfCheck(FeedbackHub);
  assert.equal(check.ok, true);
  assert.equal(check.disambiguateOk, true);
  assert.equal(check.snapshotOk, true);
  assert.equal(check.transientOk, true);
  assert.equal(check.explainOk, true);
});
