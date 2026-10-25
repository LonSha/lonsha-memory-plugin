import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('social-rumor-drift-network.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const RumorNetwork = sandbox.module.exports;

test('L11-X2: 社交网络多跳传播中的信息畸变与添油加醋', async (t) => {
    const rawFact = {
        originalFact: '罗伊在街角和城防守卫起了点小争执',
        text: '罗伊在街角和城防守卫起了点小争执',
        distortionScore: 0.1,
        hops: 0
    };

    // 第一跳：普通市民转述
    const hop1 = RumorNetwork.propagateRumorHop(rawFact, { faction: '平民', hostility: 0.1 });
    assert.equal(hop1.hops, 1);
    assert.ok(hop1.text.includes('听人言之凿凿地说'));

    // 第二跳：敌对帮派恶意添油加醋
    const hop2 = RumorNetwork.propagateRumorHop(hop1, { faction: '黑蛇帮', hostility: 0.8 });
    assert.equal(hop2.hops, 2);
    assert.ok(hop2.text.includes('拔刀血洗当场'));
    assert.ok(hop2.distortionScore >= 0.5);

    // 生成流言反噬指令
    const directive = RumorNetwork.formatRumorFeedbackDirective(hop2, '罗伊');
    assert.ok(directive.includes('【市井流言风暴·认知失真】'));
    assert.ok(directive.includes('充满畏惧、敌意或指指点点'));
});

test('L11-X2 负控制: 破坏敌对转述替换逻辑使畸变失效', async (t) => {
    const brokenCode = sourceCode.replace("evolvedText = evolvedText.replace(/争吵|起冲突|争执/g, '拔刀血洗当场');", '');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenRumor = brokenSandbox.module.exports;

    const res = BrokenRumor.propagateRumorHop({ text: '起冲突' }, { hostility: 0.9 });
    assert.ok(!res.text.includes('拔刀血洗当场'));
});