import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('narrative-foreshadowing-dramatic-echo.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const ForeshadowingEcho = sandbox.module.exports;

test('L11-X5: 伏笔埋设与跨度30轮后高潮对决引爆', async (t) => {
    const clue = ForeshadowingEcho.plantForeshadowing({
        clue: '老旧的银制吊坠夹层里刻着一串密文',
        plantedFloor: 10,
        latentTheme: 'conspiracy'
    });

    assert.equal(clue.plantedFloor, 10);
    assert.equal(clue.detonated, false);

    // 早期（第20轮）：尚未达到引爆跨度
    const checkEarly = ForeshadowingEcho.findAndDetonateEcho([clue], { currentFloor: 20, isClimax: true });
    assert.equal(checkEarly.hasEcho, false);

    // 后期高潮（第60轮）：跨度50轮，触发引爆
    const checkLate = ForeshadowingEcho.findAndDetonateEcho([clue], { currentFloor: 60, isClimax: true });
    assert.equal(checkLate.hasEcho, true);
    assert.equal(checkLate.detonatedClue.detonated, true);
    assert.equal(checkLate.detonatedClue.detonatedFloor, 60);
    assert.ok(checkLate.echoDirective.includes('【伏笔因果回响·高潮揭秘】'));
    assert.ok(checkLate.echoDirective.includes('老旧的银制吊坠夹层里刻着一串密文'));
});

test('L11-X5 负控制: 破坏引爆条件导致伏笔永不揭秘', async (t) => {
    const brokenCode = sourceCode.replace('if (!candidate || !isClimax)', 'if (true)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenEcho = brokenSandbox.module.exports;

    const clue = { clue: '秘密', plantedFloor: 1, detonated: false };
    const res = BrokenEcho.findAndDetonateEcho([clue], { currentFloor: 100, isClimax: true });
    assert.equal(res.hasEcho, false);
});