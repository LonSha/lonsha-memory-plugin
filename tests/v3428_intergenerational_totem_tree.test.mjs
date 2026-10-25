import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('intergenerational-mental-totem-tree.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const TotemTree = sandbox.module.exports;

test('L11-X9: 先辈精神图腾结晶与代际薪火相传绑定', async (t) => {
    const predecessor = {
        name: '老骑士雷恩',
        era: '第一纪元·黑雨之年',
        coreBelief: '剑锋所指，唯有弱小者的安宁',
        unfulfilledPledge: '寻回遗落圣城失落的七枚火种',
        totemArtifact: '满是豁口的苍银巨剑'
    };

    const totem = TotemTree.crystallizeMentalTotem(predecessor);

    assert.equal(totem.founderName, '老骑士雷恩');
    assert.equal(totem.totemArtifact, '满是豁口的苍银巨剑');
    assert.equal(totem.successors.length, 0);

    // 传承给新一代主角
    const inherited = TotemTree.passTotemToSuccessor(totem, '年轻的侍从修');
    assert.equal(inherited.currentBearer, '年轻的侍从修');
    assert.equal(inherited.successors.length, 1);
    assert.ok(inherited.heritageGuidance.includes('【代际图腾·薪火相传】'));
    assert.ok(inherited.heritageGuidance.includes('年轻的侍从修'));
    assert.ok(inherited.heritageGuidance.includes('满是豁口的苍银巨剑'));
    assert.ok(inherited.heritageGuidance.includes('剑锋所指，唯有弱小者的安宁'));
});

test('L11-X9 负控制: 破坏继承传递逻辑导致后继者为空', async (t) => {
    const brokenCode = sourceCode.replace("successors.push(successorName);", '');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenTree = brokenSandbox.module.exports;

    const totem = { founderName: '先辈', successors: [] };
    const res = BrokenTree.passTotemToSuccessor(totem, '后继者');
    assert.equal(res.successors.length, 0);
});