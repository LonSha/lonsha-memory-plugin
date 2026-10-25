import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('proactive-causal-verification-circuit.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const CausalCircuit = sandbox.module.exports;

test('L11-O3: 前摄因果校验拦截死者复生幻觉', async (t) => {
    const invariants = [
        { kind: 'death', target: '老约翰', content: '老约翰已于暴风雨夜中枪身亡' }
    ];

    // 合法事实：在墓碑前回忆老约翰
    const validFact = { content: '我站在墓碑前，深深地回忆起老约翰生前的教诲' };
    const checkValid = CausalCircuit.verifyCausalInvariants(validFact, invariants);
    assert.equal(checkValid.allowed, true);
    assert.equal(checkValid.anomaly, false);

    // 幻觉事实：老约翰突然走过来拍了拍我的肩膀并说话
    const invalidFact = { content: '老约翰走过来拍了拍我的肩膀，微笑着说话' };
    const checkInvalid = CausalCircuit.verifyCausalInvariants(invalidFact, invariants);
    assert.equal(checkInvalid.allowed, false);
    assert.equal(checkInvalid.anomaly, true);
    assert.ok(checkInvalid.violationReason.includes('实体 [老约翰] 已确认消亡'));
});

test('L11-O3: 熔断器过滤管道隔离已焚毁信物', async (t) => {
    const invariants = [
        { kind: 'destroyed', target: '母亲留下的玉佩', content: '玉佩已被扔进熔炉彻底烧成灰烬' }
    ];

    const candidates = [
        { id: 1, content: '我们在废墟里翻找遗物残骸' },
        { id: 2, content: '她忽然拿出了母亲留下的玉佩递过去' }, // 严重违背因果
        { id: 3, content: '天色渐渐暗了下来' }
    ];

    const result = CausalCircuit.runCircuitBreakerPipeline(candidates, invariants);

    assert.equal(result.admittedFacts.length, 2);
    assert.equal(result.quarantinedFacts.length, 1);
    assert.equal(result.circuitBreaksCount, 1);
    assert.equal(result.quarantinedFacts[0].fact.id, 2);
    assert.ok(result.quarantinedFacts[0].quarantineReason.includes('物品 [母亲留下的玉佩] 已彻底焚毁'));
});

test('L11-O3 负控制: 破坏熔断器判断使违背因果的事实逃逸', async (t) => {
    const brokenCode = sourceCode.replace('if (check.allowed)', 'if (true)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenCircuit = brokenSandbox.module.exports;

    const invariants = [{ kind: 'death', target: '某人' }];
    const candidates = [{ content: '某人走过来拍了拍我微笑着说话' }];
    const res = BrokenCircuit.runCircuitBreakerPipeline(candidates, invariants);

    // 破坏后本该被隔离的事实逃逸进入准入列表
    assert.equal(res.admittedFacts.length, 1);
    assert.equal(res.quarantinedFacts.length, 0);
});