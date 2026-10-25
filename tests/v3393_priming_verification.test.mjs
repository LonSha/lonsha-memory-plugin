import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    buildPrimingAnchors,
    formatPrimingPrompt,
    verifyAttentionCompliance
} = require('../attention-priming-verification-anchor.js');

test('L10-X2 · buildPrimingAnchors 锚点构建与优先级排序', () => {
    const facts = [
        { id: 'f1', content: 'Alice 在两年前曾借给 Bob 一块怀表', weight: 0.6, kind: 'fact', actors: ['alice', 'bob'] },
        { id: 'f2', content: 'Bob 答应今晚八点归还怀表', weight: 0.7, kind: 'commitment', actors: ['alice', 'bob'] },
        { id: 'f3', content: '城东的面包房刚刚重新开业', weight: 0.9, kind: 'fact', actors: ['charlie'] }
    ];

    // 针对 bob 进行焦点过滤，f2 是 commitment 且包含 bob，优先级最高
    const res = buildPrimingAnchors(facts, { maxAnchors: 2, focusActor: 'bob' });
    assert.equal(res.anchors.length, 2);
    assert.equal(res.anchors[0].id, 'f2', '承诺账且关联焦点角色的事实置顶');
    assert.ok(res.promptBlock.includes('归还怀表'));
    assert.ok(res.promptBlock.includes('[叙事潜意识与焦点对账]'));
});

test('L10-X2 · verifyAttentionCompliance 遵从度对账判定', () => {
    const anchors = [
        { id: 'a1', corePhrase: '今晚八点归还怀表', keywords: ['八点', '归还', '怀表'] },
        { id: 'a2', corePhrase: '两年前借给的信物', keywords: ['两年前', '信物', '借给'] }
    ];

    // 遵从样本：正面回应了怀表
    const goodReply = '“那块怀表我一直带在身上，”Bob低下头从口袋里掏出，“答应过今晚八点还你的。”';
    const reportGood = verifyAttentionCompliance(goodReply, anchors);
    assert.equal(reportGood.compliant, true);
    assert.ok(reportGood.score >= 0.5);
    assert.equal(reportGood.matchedCount, 1);
    assert.equal(reportGood.missedAnchors.length, 1);

    // 完全偏离/无视的样本
    const badReply = '“今天天气不错，我们去喝杯咖啡吧。”Bob笑着说。';
    const reportBad = verifyAttentionCompliance(badReply, anchors);
    assert.equal(reportBad.compliant, false);
    assert.equal(reportBad.score, 0);
    assert.equal(reportBad.matchedCount, 0);
    assert.equal(reportBad.missedAnchors.length, 2);
});