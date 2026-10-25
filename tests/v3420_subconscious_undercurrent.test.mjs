import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('subconscious-undercurrent-engine.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const SubconsciousEngine = sandbox.module.exports;

test('L11-X1: 对敏感话题触发潜意识防御与回避推演', async (t) => {
    const actorProfile = {
        unstatedDesire: '渴望被毫无保留地接纳',
        deepFear: '害怕再次被弃若敝屣',
        latentGuilt: '当年没能拉住坠崖的挚友'
    };

    // 对方提及离开/抛弃相关话题，激发深层恐惧
    const incoming1 = '如果你觉得累了，随时可以一个人离开这里。';
    const result1 = SubconsciousEngine.deduceUndercurrent(actorProfile, incoming1);

    assert.equal(result1.triggeredElement, 'fear');
    assert.equal(result1.evasionType, 'defensive_pride');
    assert.ok(result1.undercurrentDirective.includes('【潜意识暗涌·防御激发】'));
    assert.ok(result1.undercurrentDirective.includes('绝不可直接坦承脆弱'));

    // 对方提及道歉/当初，激发愧疚逃逸
    const incoming2 = '当初那件事，真的不怪你，别再说对不起了。';
    const result2 = SubconsciousEngine.deduceUndercurrent(actorProfile, incoming2);
    assert.equal(result2.triggeredElement, 'guilt');
    assert.equal(result2.evasionType, 'topic_deflection');
    assert.ok(result2.undercurrentDirective.includes('【潜意识暗涌·愧疚逃逸】'));
});

test('L11-X1 负控制: 破坏暗涌推演逻辑导致恐惧防御无法激发', async (t) => {
    const brokenCode = sourceCode.replace("topic.includes('离开')", 'false');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenEngine = brokenSandbox.module.exports;

    const res = BrokenEngine.deduceUndercurrent({ deepFear: '怕被抛弃' }, '你要离开吗');
    assert.notEqual(res.triggeredElement, 'fear');
});