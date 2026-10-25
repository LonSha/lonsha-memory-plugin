import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('embodied-multi-channel-osmosis-hub.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const OsmosisHub = sandbox.module.exports;

test('L11-O6: 面对面冲突向手机端外溢未发送草稿与勿扰状态', async (t) => {
    const offlineFight = {
        actor: '苏晓',
        stance: -0.6,
        tension: 'confrontational',
        topic: '昨晚的欺瞒'
    };

    const digitalEcho = OsmosisHub.projectRealityToDigital(offlineFight);

    assert.equal(digitalEcho.phoneModeShift, 'do_not_disturb');
    assert.ok(digitalEcho.unsentDraft);
    assert.equal(digitalEcho.unsentDraft.recipient, '苏晓');
    assert.ok(digitalEcho.unsentDraft.content.includes('其实我刚才不该说那么重的话'));
    assert.ok(digitalEcho.generatedNote);
    assert.equal(digitalEcho.generatedNote.sentiment, 'frustrated');
});

test('L11-O6: 手机私密备忘向线下面对面互动合成隐性提示词指导', async (t) => {
    const phoneArtifacts = [
        {
            title: '不能说的秘密',
            body: '其实我一直在偷偷调查那个红色的吊坠，但我不敢告诉苏晓。'
        }
    ];

    const guidance = OsmosisHub.synthesizeDigitalToRealityGuidance(phoneArtifacts, '苏晓');

    assert.ok(guidance.includes('【具身手机数字痕迹渗透】'));
    assert.ok(guidance.includes('偷偷调查那个红色的吊坠'));
    assert.ok(guidance.includes('神态细节与欲言又止'));
});

test('L11-O6 负控制: 破坏渗透生成函数导致提示词指导缺失', async (t) => {
    const brokenCode = sourceCode.replace('return `【具身手机数字痕迹渗透】', "return ''; `【具身手机数字痕迹渗透】");
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenHub = brokenSandbox.module.exports;

    const res = BrokenHub.synthesizeDigitalToRealityGuidance([{ body: '秘密' }], '');
    assert.equal(res, '');
});