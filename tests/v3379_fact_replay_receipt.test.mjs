import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Replay = require('../fact-postgen-replay-receipt.js');

test('L9-O6 · 生成后候选批次创建与逐条可逆裁决', () => {
    const rawCandidates = [
        { subject: 'Alice', predicate: 'discovered', object: 'Secret Document', sentence: 'Alice 在旧阁楼发现了秘密文档。' },
        { subject: 'Bob', predicate: 'betrayed', object: 'Guild', sentence: '有人传闻 Bob 背叛了公会。' }
    ];

    const batch = Replay.createReplayBatch(42, rawCandidates);
    assert.equal(batch.floor, 42);
    assert.equal(batch.items.length, 2);

    // 采纳第一条
    const r1 = Replay.adjudicateCandidate(batch, 'rep-42-1', Replay.ADOPTION_ACTION.ADOPT, { note: '正文明确提及' });
    assert.equal(r1.ok, true);
    assert.equal(r1.batch.items[0].decision, 'adopt');

    // 舍弃第二条（传闻不采纳）
    const r2 = Replay.adjudicateCandidate(r1.batch, 'rep-42-2', Replay.ADOPTION_ACTION.REJECT, { note: '未证实谣言' });
    assert.equal(r2.ok, true);
    assert.equal(r2.batch.items[1].decision, 'reject');
});