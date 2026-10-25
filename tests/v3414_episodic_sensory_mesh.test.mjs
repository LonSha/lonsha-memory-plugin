import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('episodic-sensory-anchor-mesh.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const SensoryMesh = sandbox.module.exports;

test('L11-O4: 从情境文本中提取五感残差锚点', async (t) => {
    const event = {
        content: '暴雨如注，空气中弥漫着刺鼻的硝烟与铁锈味，耳边只有沉重的脚步声与冰冷的枪管顶在额头。'
    };

    const anchors = SensoryMesh.extractSensoryAnchors(event);
    assert.ok(anchors.length >= 3);

    const modalities = anchors.map(a => a.modality);
    assert.ok(modalities.includes('olfactory')); // 硝烟/铁锈
    assert.ok(modalities.includes('auditory'));  // 脚步声
    assert.ok(modalities.includes('tactile'));   // 冰冷
});

test('L11-O4: 场景描写触发潜意识感官应激共振', async (t) => {
    const memoryBank = [
        {
            id: 'trauma_01',
            content: '那晚枪响之后，只有刺骨的冰冷与刺鼻的硝烟',
            sensoryAnchors: [
                { modality: 'olfactory', cues: ['硝烟'] },
                { modality: 'tactile', cues: ['冰冷'] }
            ]
        }
    ];

    // 当前场景描写：只描写了环境，未提及任何当事人名字
    const currentScene = '推开废弃仓库的锈铁门，外头弥漫着尚未散尽的硝烟，冷雨浸湿了衣领。';

    const result = SensoryMesh.resonateSensoryCues(currentScene, memoryBank);

    assert.equal(result.resonated, true);
    assert.ok(result.triggerCues.includes('硝烟'));
    assert.ok(result.somaticResponsePrompt.includes('【感官潜意识共振】'));
    assert.ok(result.somaticResponsePrompt.includes('身体本能已产生隐性微反应'));
});

test('L11-O4 负控制: 破坏共振匹配逻辑导致命中失效', async (t) => {
    const brokenCode = sourceCode.replace('if (desc.includes(cue))', 'if (false)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenMesh = brokenSandbox.module.exports;

    const memoryBank = [{ sensoryAnchors: [{ cues: ['硝烟'] }] }];
    const res = BrokenMesh.resonateSensoryCues('空气中有硝烟', memoryBank);
    assert.equal(res.resonated, false);
});