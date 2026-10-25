import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('dynamic-persona-crystallization-substrate.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const PersonaSubstrate = sandbox.module.exports;

test('L11-O9: 提炼长篇经历后的动态性格结晶增量', async (t) => {
    const initialCard = {
        name: '艾莉亚',
        traits: ['活泼天真', '容易轻信他人'],
        summary: '初出茅庐的贵族大小姐'
    };

    const lifeEvents = [
        { kind: 'betrayal', isTrauma: true, description: '至亲之人的背叛让家族覆灭' },
        { kind: 'sacrifice', description: '为了掩护平民撤退独自殿后' }
    ];

    const currentPsychology = {
        phaseLocked: true,
        lockCause: '家族覆灭之仇'
    };

    const delta = PersonaSubstrate.crystallizePersonaDelta(initialCard, lifeEvents, currentPsychology);

    assert.equal(delta.actorName, '艾莉亚');
    assert.ok(delta.evolvedMaturity >= 4.0);
    assert.equal(delta.shifts.length, 3);
    assert.ok(delta.promptBlock.includes('【心智蜕变与动态性格底座】'));
    assert.ok(delta.promptBlock.includes('褪去了往日的轻信'));
    assert.ok(delta.promptBlock.includes('拥有了愿意为之付出一切的坚固信仰'));
});

test('L11-O9 负控制: 破坏人设增量构造导致提示块缺失', async (t) => {
    const brokenCode = sourceCode.replace("if (shifts.length > 0)", 'if (false)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenSubstrate = brokenSandbox.module.exports;

    const res = BrokenSubstrate.crystallizePersonaDelta({ name: 'A' }, [{ isTrauma: true }], {});
    assert.equal(res.promptBlock, '');
});