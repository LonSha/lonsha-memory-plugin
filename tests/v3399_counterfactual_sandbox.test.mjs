import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    EMOTIONAL_TONE,
    recordBranchSandbox,
    evaluateCounterfactualAwakening
} = require('../counterfactual-branching-sandbox.js');

test('L10-X8 · recordBranchSandbox 反事实分支模型构建', () => {
    const sandbox = recordBranchSandbox({
        actorId: 'alice',
        anchorFloor: 150,
        actualChoice: '决意远赴边关参军',
        unpickedRoad: '留在京城与意中人成婚',
        imaginedConsequence: '或许能安稳度过一生，但会在平凡庸碌中抱憾终生',
        tone: EMOTIONAL_TONE.REGRET,
        awakeningTriggers: ['深夜', '红烛', '旧嫁衣']
    });

    assert.equal(sandbox.actorId, 'alice');
    assert.equal(sandbox.tone, 'regret');
    assert.equal(sandbox.anchorFloor, 150);
    assert.deepEqual(sandbox.awakeningTriggers, ['深夜', '红烛', '旧嫁衣']);
});

test('L10-X8 · evaluateCounterfactualAwakening 场景触发与心绪共鸣', () => {
    const sandbox = recordBranchSandbox({
        actorId: 'alice',
        actualChoice: '远赴边关',
        unpickedRoad: '留在京城成婚',
        tone: EMOTIONAL_TONE.REGRET,
        awakeningTriggers: ['深夜', '雨夜']
    });

    // 命中触发词「深夜」
    const scene = '窗外是凄清的深夜，篝火噼啪作响，四周静悄悄的。';
    const awakening = evaluateCounterfactualAwakening(sandbox, scene);
    assert.ok(awakening !== null);
    assert.equal(awakening.hitTrigger, '深夜');
    assert.ok(awakening.internalEchoPrompt.includes('心中骤然翻起一阵悔意'));
    assert.ok(awakening.internalEchoPrompt.includes('留在京城成婚'));

    // 未命中触发词
    const dayScene = '正午的阳光洒在校场上，士兵们正在操练。';
    const noAwakening = evaluateCounterfactualAwakening(sandbox, dayScene);
    assert.equal(noAwakening, null);
});