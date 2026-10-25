import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('life-epilogue-retrospective-synthesizer.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const EpilogueSynthesizer = sandbox.module.exports;

test('L11-X8: 跨时代人生转折提炼与三体裁终局回望长卷编排', async (t) => {
    const actorSummary = {
        name: '亚瑟',
        title: '最后的守夜人'
    };

    const turningPoints = [
        { title: '离开故乡', summary: '十七岁那年背负断剑踏上征途' },
        { title: '至暗围城', summary: '坚守要塞七十天，目睹挚友战死' },
        { title: '终末抉择', summary: '亲手封印深渊之门，选择留在永夜' }
    ];

    // 体裁一：回忆录
    const memoir = EpilogueSynthesizer.composeLifeEpilogue(actorSummary, turningPoints, 'memoir');
    assert.equal(memoir.actorName, '亚瑟');
    assert.equal(memoir.turningPointsCount, 3);
    assert.ok(memoir.epilogueText.includes('【终局回忆录·晚年自白】'));
    assert.ok(memoir.epilogueText.includes('十七岁那年背负断剑踏上征途'));

    // 体裁二：列传
    const historical = EpilogueSynthesizer.composeLifeEpilogue(actorSummary, turningPoints, 'historical');
    assert.ok(historical.epilogueText.includes('【青史列传·卷末赞曰】'));
    assert.ok(historical.epilogueText.includes('《后世书·亚瑟传》'));

    // 体裁三：碑铭
    const epitaph = EpilogueSynthesizer.composeLifeEpilogue(actorSummary, turningPoints, 'epitaph');
    assert.ok(epitaph.epilogueText.includes('【终章碑铭·永恒长眠】'));
    assert.ok(epitaph.epilogueText.includes('这里长眠着 [亚瑟]'));
});

test('L11-X8 负控制: 破坏体裁分流逻辑导致文本渲染失真', async (t) => {
    const brokenCode = sourceCode.replace("if (genre === EPILOGUE_GENRES.MEMOIR)", 'if (false)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenSynthesizer = brokenSandbox.module.exports;

    const res = BrokenSynthesizer.composeLifeEpilogue({ name: 'A' }, [], 'memoir');
    assert.ok(!res.epilogueText.includes('【终局回忆录·晚年自白】'));
});