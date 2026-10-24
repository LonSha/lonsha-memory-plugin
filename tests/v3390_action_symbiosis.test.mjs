import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ACTION_OUTCOMES, ingestActionFeedback } = require('../memory-action-symbiosis-circuit.js');

test('L9-X8 · 记忆—行动共生回路与连续拒绝偏好自适应', () => {
    let profile = { actionFeedbackHistory: [] };

    // 第一次采纳
    profile = ingestActionFeedback(profile, {
        suggestionId: 'sug_1',
        outcome: ACTION_OUTCOMES.ACCEPTED
    });
    assert.equal(profile.suggestionPrudenceLevel, 'normal');

    // 两次连续拒绝
    profile = ingestActionFeedback(profile, {
        suggestionId: 'sug_2',
        outcome: ACTION_OUTCOMES.REJECTED,
        reason: '与当前话题不符'
    });
    profile = ingestActionFeedback(profile, {
        suggestionId: 'sug_3',
        outcome: ACTION_OUTCOMES.REJECTED,
        reason: '时间不合适'
    });

    assert.equal(profile.actionFeedbackHistory.length, 3);
    assert.equal(profile.suggestionPrudenceLevel, 'high'); // 连续被拒自动提升谨慎度
});