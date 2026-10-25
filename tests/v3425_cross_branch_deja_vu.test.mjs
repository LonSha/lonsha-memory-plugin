import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('cross-branch-deja-vu-resonance-chamber.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const DejaVuChamber = sandbox.module.exports;

test('L11-X6: 幽灵分支记忆归档与当前场景既视感共振', async (t) => {
    const phantomMemory = DejaVuChamber.archivePhantomEcho({
        branchId: 'branch_bad_end_03',
        content: '大雨中在钟楼顶端的决死对峙',
        actors: ['主角', '宿敌'],
        emotion: 'tragic'
    });

    assert.equal(phantomMemory.originBranch, 'branch_bad_end_03');
    assert.equal(phantomMemory.content, '大雨中在钟楼顶端的决死对峙');

    const vault = [phantomMemory];

    // 当前在新的主线正典中，再次来到了相似的场景
    const currentScene = '窗外暴雨如注，大雨中在钟楼顶端的风声呼啸，眼前的人影隐没在黑暗中。';

    const resonance = DejaVuChamber.resonateDejaVu(currentScene, vault);

    assert.equal(resonance.hasDejaVu, true);
    assert.ok(resonance.echoDirective.includes('【跨世界线既视感·幽灵残影】'));
    assert.ok(resonance.echoDirective.includes('大雨中在钟楼顶端的决死对峙'));
    assert.ok(resonance.echoDirective.includes('似曾相识却又未曾发生过的幻梦'));
});

test('L11-X6 负控制: 破坏既视感共振逻辑导致无法匹配残影', async (t) => {
    const brokenCode = sourceCode.replace('if (words && scene.includes(words))', 'if (false)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenChamber = brokenSandbox.module.exports;

    const vault = [{ content: '钟楼顶端的决死对峙' }];
    const res = BrokenChamber.resonateDejaVu('钟楼顶端的决死对峙', vault);
    assert.equal(res.hasDejaVu, false);
});