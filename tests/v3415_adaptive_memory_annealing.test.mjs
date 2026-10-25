import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('adaptive-memory-annealing-curve.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const MemoryAnnealing = sandbox.module.exports;

test('L11-O5: 记忆经过多轮沉寂后发生对数退火衰减', async (t) => {
    const memory = {
        id: 'mem_01',
        content: '我们在第三号街角喝了一杯温热的咖啡，闲聊了半小时。',
        lastTouchedRound: 10,
        accessCount: 1
    };

    // 刚发生不久（第12轮，沉寂2轮）
    const stateEarly = MemoryAnnealing.computeAnnealingState(memory, 12);
    assert.equal(stateEarly.tier, 'detailed');
    assert.ok(stateEarly.clarity > 0.85);

    // 经过长程沉寂（第70轮，沉寂60轮）
    const stateLate = MemoryAnnealing.computeAnnealingState(memory, 70);
    assert.equal(stateLate.tier, 'faded');
    assert.ok(stateLate.clarity < 0.25);
    assert.ok(stateLate.renderedContent.includes('[记忆斑驳]'));
});

test('L11-O5: 核心不变量与高频触碰记忆自动结晶', async (t) => {
    const traumaMem = {
        kind: 'trauma',
        content: '亲眼目睹母星毁灭的决裂时刻',
        lastTouchedRound: 1,
        accessCount: 1
    };

    // 不变量经历 500 轮也绝不衰退
    const traumaState = MemoryAnnealing.computeAnnealingState(traumaMem, 500);
    assert.equal(traumaState.tier, 'crystal');
    assert.equal(traumaState.clarity, 1.0);

    // 普通记忆反复触碰达到 5 次，结晶为永久记忆
    let regularMem = { content: '彼此间独特的暗号约定', accessCount: 4 };
    const reactivated = MemoryAnnealing.reactivateMemory(regularMem, 100);
    assert.equal(reactivated.isPermanent, true);
    assert.equal(reactivated.crystallized, true);
    assert.equal(reactivated.accessCount, 5);
});

test('L11-O5 负控制: 破坏退火公式使计算失真', async (t) => {
    const brokenCode = sourceCode.replace('Math.exp(-0.693 * (decayRounds / halfLife))', '1.0');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenAnnealing = brokenSandbox.module.exports;

    const mem = { content: '琐事', lastTouchedRound: 1, accessCount: 1 };
    const res = BrokenAnnealing.computeAnnealingState(mem, 1000);
    // 破坏后永不退火
    assert.equal(res.clarity, 1.0);
});