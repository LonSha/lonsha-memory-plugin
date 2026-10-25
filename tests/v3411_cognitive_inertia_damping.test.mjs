import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 动态载入被测模块
const modulePath = path.resolve('cognitive-inertia-damping-dynamics.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

// 在受控沙盒环境下初始化
const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const CognitiveInertia = sandbox.module.exports;

test('L11-O1: 心理质量与创伤阻尼系数计算验证', async (t) => {
    // 1. 无创伤基础计算
    const baseProfile = { stubbornness: 0.6 };
    const mass1 = CognitiveInertia.computePsychologicalMass(baseProfile, []);
    assert.equal(mass1.mass, 0.6);
    assert.ok(mass1.frictionCoeff > 0.3);
    assert.ok(mass1.barrierThreshold > 1.0);

    // 2. 携带背叛创伤 (BETRAYAL: 0.9)
    const traumaEvents = [
        { kind: 'BETRAYAL', severity: 1.0 },
        { kind: 'SUSPICION', severity: 0.5 }
    ];
    const mass2 = CognitiveInertia.computePsychologicalMass(baseProfile, traumaEvents);
    // 0.6 + 0.9*1.0 + 0.6*0.5 = 0.6 + 0.9 + 0.3 = 1.8
    assert.equal(mass2.mass, 1.8);
    assert.ok(mass2.barrierThreshold >= 3.9);
});

test('L11-O1: 单次甜言蜜语无法击穿深重心理防线（势垒未突破）', async (t) => {
    const dampingParams = {
        mass: 2.0,
        frictionCoeff: 1.0,
        barrierThreshold: 4.4
    };

    const currentDynamics = {
        currentStance: -0.8, // 极度敌视
        cumulativeImpulse: 0,
        historyRounds: 0
    };

    // 外部施加单次强烈的善意言语 (valence: 1.0, intensity: 1.0)
    const stimulus = { valence: 1.0, intensity: 1.0, rationale: '真诚道歉并示好' };

    const stepResult = CognitiveInertia.applyDampingStep(currentDynamics, stimulus, dampingParams);

    // 势垒未突破
    assert.equal(stepResult.barrierCrossed, false);
    // 态度不能发生剧烈翻转，依然保持在负向戒备区 (-0.8 到 -0.7 之间)
    assert.ok(stepResult.nextStance < -0.7);
    assert.ok(stepResult.promptDirective.includes('心理阻尼防线'));
});

test('L11-O1: 多轮持续积累冲量最终跨越势垒引发防线松动', async (t) => {
    const dampingParams = {
        mass: 1.0,
        frictionCoeff: 0.4,
        barrierThreshold: 1.5
    };

    let state = {
        currentStance: -0.5,
        cumulativeImpulse: 0,
        historyRounds: 0
    };

    const stimulus = { valence: 0.8, intensity: 0.9 };

    // 连续进行 5 轮高强度真诚互动积累
    for (let i = 0; i < 5; i++) {
        state = CognitiveInertia.applyDampingStep(state, stimulus, dampingParams);
    }

    // 此时冲量已突破阈值
    assert.equal(state.barrierCrossed, true);
    assert.ok(state.nextStance > -0.5); // 防线实质性松动
    assert.ok(state.promptDirective.includes('心理势垒松动'));
});

test('L11-O1 负控制: 破坏势垒判定条件必导致状态失真可观测报错', async (t) => {
    // 源码真破坏：把 barrierThreshold 扩大 100 倍
    const brokenCode = sourceCode.replace('Math.abs(newCumulativeImpulse) >= barrier', 'false');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenInertia = brokenSandbox.module.exports;

    const dampingParams = { mass: 0.5, frictionCoeff: 0.2, barrierThreshold: 0.1 };
    let state = { currentStance: -0.5, cumulativeImpulse: 10.0, historyRounds: 0 };
    const res = BrokenInertia.applyDampingStep(state, { valence: 1.0, intensity: 1.0 }, dampingParams);

    // 破坏后哪怕冲量达到 10 也绝不跨越
    assert.equal(res.barrierCrossed, false);
});
