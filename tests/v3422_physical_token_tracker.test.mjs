import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('physical-token-spatial-trace-tracker.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const TokenTracker = sandbox.module.exports;

test('L11-X3: 具身信物创建、归属流转与触碰回响', async (t) => {
    const token = TokenTracker.createToken({
        name: '破旧的黄铜怀表',
        initialOwner: '老船长',
        boundMemory: '二十年前沉船夜的诀别约定',
        location: '大衣内侧口袋'
    });

    assert.equal(token.name, '破旧的黄铜怀表');
    assert.equal(token.currentOwner, '老船长');
    assert.equal(token.transferHistory.length, 1);

    // 转移给主角
    const transferred = TokenTracker.transferToken(token, '主角', '临终托付');
    assert.equal(transferred.currentOwner, '主角');
    assert.equal(transferred.transferHistory.length, 2);

    // 物理触碰回响
    const touchEcho = TokenTracker.interactWithToken(transferred, 'touch');
    assert.ok(touchEcho.promptDirective.includes('【具身信物触觉回响】'));
    assert.ok(touchEcho.promptDirective.includes('二十年前沉船夜的诀别约定'));

    // 信物受损裂开
    const damageEcho = TokenTracker.interactWithToken(transferred, 'break');
    assert.ok(damageEcho.promptDirective.includes('【具身信物受损剧痛】'));
});

test('L11-X3 负控制: 破坏信物交互指令构造导致提示串缺失', async (t) => {
    const brokenCode = sourceCode.replace("prompt = `【具身信物触觉回响】", "prompt = ''; `【具身信物触觉回响】");
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenTracker = brokenSandbox.module.exports;

    const res = BrokenTracker.interactWithToken({ name: '怀表', boundMemory: '秘密' }, 'touch');
    assert.equal(res.promptDirective, '');
});