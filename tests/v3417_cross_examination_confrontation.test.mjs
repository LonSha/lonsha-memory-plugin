import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('cross-examination-confrontation-workbench.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const ConfrontationWorkbench = sandbox.module.exports;

test('L11-O7: 自动捕获虚假供述与硬证据之间的冲突并生成质询阶梯', async (t) => {
    const suspectTestimony = {
        actor: '卡尔',
        claim: '案发当晚我一直在自己家里睡觉，绝对没有去过城北码头。'
    };

    const hardEvidences = [
        {
            title: '码头监控记录',
            content: '城北码头的监控录像清晰拍摄到了卡尔的风衣与正脸，时间为当晚23点15分。'
        }
    ];

    const chain = ConfrontationWorkbench.buildConfrontationChain(suspectTestimony, hardEvidences);

    assert.equal(chain.hasContradiction, true);
    assert.equal(chain.suspect, '卡尔');
    assert.equal(chain.contradictingEvidences.length, 1);
    assert.equal(chain.confrontationSteps.length, 3);
    assert.equal(chain.confrontationSteps[0].stage, 'probing');
    assert.equal(chain.confrontationSteps[2].stage, 'climax_evidence');
    assert.ok(chain.guidancePrompt.includes('【证据对质对抗指令】'));
});

test('L11-O7 负控制: 破坏证据匹配导致对质链构建失败', async (t) => {
    const brokenCode = sourceCode.replace("claimText.includes('没有去过')", 'false');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenBench = brokenSandbox.module.exports;

    const suspectTestimony = { claim: '我绝对没有去过' };
    const hardEvidences = [{ content: '监控拍摄到' }];
    const res = BrokenBench.buildConfrontationChain(suspectTestimony, hardEvidences);
    assert.equal(res.hasContradiction, false);
});