import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { evaluateTopicSeason } = require('../memory-season-silence-manager.js');

test('L9-X1 · 记忆季候与沉默因果归因', () => {
    const topic = {
        id: 't_anniversary',
        location: 'library',
        evidenceCount: 2,
        targetEpoch: 1000000
    };

    // 匹配地点浮现
    const locRes = evaluateTopicSeason(topic, { currentLocation: 'library' });
    assert.equal(locRes.status, 'surfacing');
    assert.equal(locRes.canSurfacing, true);

    // 用户静音
    const muteRes = evaluateTopicSeason(topic, { currentLocation: 'library', mutedTopicIds: ['t_anniversary'] });
    assert.equal(muteRes.status, 'silenced');
    assert.equal(muteRes.reason, 'user_muted');

    // 秘密且未授权不可泄漏
    const secretTopic = { id: 't_secret', isSecret: true, evidenceCount: 5 };
    const secretRes = evaluateTopicSeason(secretTopic, { isSecretAuthorized: false });
    assert.equal(secretRes.status, 'silenced');
    assert.equal(secretRes.reason, 'unauthorized');
});