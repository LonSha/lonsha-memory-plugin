import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('retinal-attention-steering-arranger.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const RetinalAttention = sandbox.module.exports;

test('L11-O2: 显著性得分计算与核心冲突加权', async (t) => {
    const normalFact = { kind: 'fact', content: '今天天气晴朗', weight: 0.5 };
    const conflictFact = { kind: 'conflict', content: '三年前你在背后开枪背叛了我', weight: 0.6, tensionPolarity: 'confrontational' };

    const scoreNormal = RetinalAttention.computeSaliencyScore(normalFact, {});
    const scoreConflict = RetinalAttention.computeSaliencyScore(conflictFact, {});

    assert.ok(scoreConflict > scoreNormal);
    assert.ok(scoreConflict >= 0.85); // 0.6 + 0.35 + 0.15 = 1.0 (capped)
});

test('L11-O2: 视网膜分区与三明治尾部回响排布', async (t) => {
    const facts = [
        { id: 1, kind: 'fact', content: '普通背景资料A', weight: 0.3 },
        { id: 2, kind: 'conflict', content: '致命秘密档案：实验室核心密码', weight: 0.8, tensionPolarity: 'confrontational' },
        { id: 3, kind: 'fact', content: '普通背景资料B', weight: 0.4 },
        { id: 4, kind: 'commitment', content: '不可违背的生死约定', weight: 0.7 }
    ];

    const result = RetinalAttention.arrangeRetinalAttention(facts, {}, { maxFoveal: 2 });

    // 中央凹应精准捕获 2 条高显著性事实
    assert.equal(result.fovealItems.length, 2);
    assert.equal(result.fovealItems[0].id, 2); // 冲突事实排第一
    assert.equal(result.peripheralItems.length, 2);

    // 三明治回响插桩必须存在且包含焦点
    assert.ok(result.sandwichRecap.includes('【当前注意力最高优先级回响】'));
    assert.ok(result.sandwichRecap.includes('致命秘密档案'));
});

test('L11-O2 负控制: 破坏三明治回响构造使回响串缺失', async (t) => {
    const brokenCode = sourceCode.replace("recapText = `【当前注意力最高优先级回响】：\\n${bulletPoints}`;", "recapText = '';");
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenRetinal = brokenSandbox.module.exports;

    const facts = [{ id: 1, kind: 'conflict', content: '紧急危机' }];
    const res = BrokenRetinal.arrangeRetinalAttention(facts, {}, { maxFoveal: 1 });
    assert.equal(res.sandwichRecap, '');
});