import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('phase-transition-shift-safeguard.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const PhaseSafeguard = sandbox.module.exports;

test('L11-O8: 相变单向阀确权并生成硬约束提示词', async (t) => {
    const relationship = { actor: '凌羽', trust: 0.1 };
    const event = {
        type: 'irreversible_rupture',
        cause: '在关键战役中为了自保亲手出卖了主角团',
        floor: 120
    };

    const locked = PhaseSafeguard.lockPhaseTransition(relationship, event);

    assert.equal(locked.phaseLocked, true);
    assert.equal(locked.phaseType, 'irreversible_rupture');
    assert.equal(locked.lockedAtFloor, 120);
    assert.ok(locked.protocolDirective.includes('【相变单向阀：绝裂已定】'));
    assert.ok(locked.protocolDirective.includes('严禁出现任何轻浮的妥协'));
});

test('L11-O8: 拦截相变后的非法退行亲昵行为', async (t) => {
    const lockedState = {
        phaseLocked: true,
        phaseType: 'irreversible_rupture',
        closureAchieved: false
    };

    // 违背相变单向阀的生成对白
    const regressiveText = '凌羽像往常一样亲昵地拉住我的衣袖，扑进怀里开心地笑了起来。';
    const check1 = PhaseSafeguard.verifyPhaseRegression(regressiveText, lockedState);
    assert.equal(check1.allowed, false);
    assert.equal(check1.regressionDetected, true);
    assert.ok(check1.warning.includes('检测到严重的相变退行'));

    // 合规冷硬生成对白
    const properText = '凌羽神色冷淡地移开视线，语气没有丝毫起伏：“我们之间没什么好说的了。”';
    const check2 = PhaseSafeguard.verifyPhaseRegression(properText, lockedState);
    assert.equal(check2.allowed, true);
    assert.equal(check2.regressionDetected, false);
});

test('L11-O8 负控制: 破坏退行校验逻辑导致非法亲昵逃逸', async (t) => {
    const brokenCode = sourceCode.replace('if (/(撒娇|扑进怀里|开心地笑了起来|亲昵地|像往常一样|甜蜜地)/.test(text))', 'if (false)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenSafeguard = brokenSandbox.module.exports;

    const lockedState = { phaseLocked: true, phaseType: 'irreversible_rupture' };
    const res = BrokenSafeguard.verifyPhaseRegression('扑进怀里', lockedState);
    assert.equal(res.allowed, true);
});