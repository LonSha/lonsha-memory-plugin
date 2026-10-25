import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('traumatic-dissociation-dissonance-sandbox.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const DissociationSandbox = sandbox.module.exports;

test('L11-X4: 创伤解离触发与三段式心理防御演变', async (t) => {
    const trauma = {
        severity: 0.9,
        target: '妹妹',
        content: '妹妹在暴风雪中失足坠崖身亡'
    };

    // 初期严重创伤触发强制否认
    const initialSandbox = DissociationSandbox.triggerDissociationSandbox(trauma, {});
    assert.equal(initialSandbox.isDissociated, true);
    assert.equal(initialSandbox.defenseStage, 'denial');
    assert.ok(initialSandbox.promptDirective.includes('【创伤心理防御·强行否认】'));

    // 第一次冲击：勉强自圆其说
    const strike1 = DissociationSandbox.progressDissociation(initialSandbox, { evidence: '搜救队带回了染血的围巾' });
    assert.equal(strike1.defenseStage, 'rationalization');
    assert.ok(strike1.promptDirective.includes('【创伤心理防御·勉强自圆】'));

    // 第二次冲击：全面崩溃破防
    const strike2 = DissociationSandbox.progressDissociation(strike1, { evidence: '亲眼见到遗体' });
    assert.equal(strike2.defenseStage, 'breakdown');
    assert.equal(strike2.isBrokenDown, true);
    assert.ok(strike2.promptDirective.includes('【创伤心理防御·全面崩溃】'));
});

test('L11-X4 负控制: 破坏解离触发逻辑导致创伤无防御机制', async (t) => {
    const brokenCode = sourceCode.replace('const isDissociated = severity >= 0.7;', 'const isDissociated = false;');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenSandbox = brokenSandbox.module.exports;

    const res = BrokenSandbox.triggerDissociationSandbox({ severity: 0.99 }, {});
    assert.equal(res.isDissociated, false);
});