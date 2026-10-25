import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    CREDIBILITY_LEVEL,
    evaluateFactCredibility,
    triageFactBatch
} = require('../irony-pretense-immune-filter.js');

test('L10-X3 · evaluateFactCredibility 反讽口嗨识别与隔离', () => {
    // 典型反讽口嗨样本
    const ironicItem = {
        content: '你可真行啊，真是太棒了，简直是世界第一大善人。',
        contextTone: 'sarcastic',
        isDirectAction: false
    };
    const resIronic = evaluateFactCredibility(ironicItem);
    assert.equal(resIronic.credibility, CREDIBILITY_LEVEL.QUARANTINED);
    assert.ok(resIronic.cuesDetected.length >= 2);
    assert.ok(resIronic.score < 0.45);
    assert.ok(resIronic.quarantineReason.includes('检测到反讽/戏谑线索'));

    // 确凿动作样本
    const solidItem = {
        content: 'Bob在契约书末尾郑重签下了自己的名字并加盖印章。',
        contextTone: 'formal',
        isDirectAction: true
    };
    const resSolid = evaluateFactCredibility(solidItem);
    assert.equal(resSolid.credibility, CREDIBILITY_LEVEL.CONFIRMED);
    assert.ok(resSolid.score >= 0.85);
    assert.equal(resSolid.quarantineReason, null);
});

test('L10-X3 · triageFactBatch 候选事实三态分流', () => {
    const batch = [
        { id: '1', content: 'Alice交付了钥匙', isDirectAction: true },
        { id: '2', content: '我怎么可能会喜欢你，下辈子吧', contextTone: 'playful' },
        { id: '3', content: '据酒馆传言，城主可能生病了', contextTone: 'casual' }
    ];

    const triaged = triageFactBatch(batch);
    assert.equal(triaged.confirmed.length, 1);
    assert.equal(triaged.confirmed[0].id, '1');

    assert.equal(triaged.quarantined.length, 1);
    assert.equal(triaged.quarantined[0].id, '2');

    assert.equal(triaged.hypothetical.length, 1);
    assert.equal(triaged.hypothetical[0].id, '3');
});