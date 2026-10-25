import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    defineEpoch,
    crystallizeEpochHeritage,
    buildEpochalContextPrompt
} = require('../epochal-heritage-cultural-drift.js');

test('L10-X9 · defineEpoch & crystallizeEpochHeritage 时代封卷与文化沉淀', () => {
    let epoch = defineEpoch({
        name: '蒸汽大拓荒时代',
        startFloor: 1,
        endFloor: 300,
        coreEthos: '机械轰鸣与狂热开拓'
    });

    assert.equal(epoch.status, 'active');
    assert.equal(epoch.name, '蒸汽大拓荒时代');

    const pastFacts = [
        { id: 'f1', content: '第一代飞空艇在雷云中坠落，遗骸化为钢铁地标' },
        { id: 'f2', content: '炼金术士联合公会颁布齿轮规格法案' }
    ];

    epoch = crystallizeEpochHeritage(epoch, pastFacts, {
        newTaboos: ['禁止私自改装高压蒸汽锅炉', '不可在雷雨夜仰望黑云']
    });

    assert.equal(epoch.status, 'archived');
    assert.equal(epoch.crystallizedRelics.length, 2);
    assert.ok(epoch.crystallizedRelics[0].crystallizedLore.includes('蒸汽大拓荒时代遗风'));
    assert.deepEqual(epoch.taboos, ['禁止私自改装高压蒸汽锅炉', '不可在雷雨夜仰望黑云']);
});

test('L10-X9 · buildEpochalContextPrompt 宏观时代背景与旧俗禁忌注入', () => {
    const historicalEpoch = crystallizeEpochHeritage(
        defineEpoch({ name: '黑铁纪元', coreEthos: '残酷战争与禁欲求生' }),
        [{ content: '为抵御严寒，全城点燃永夜熔炉' }],
        { newTaboos: ['严禁浪费任何油脂与火种'] }
    );

    const currentEpoch = defineEpoch({
        name: '黄金联邦纪元',
        coreEthos: '商业自由与异能繁荣'
    });

    const prompt = buildEpochalContextPrompt(currentEpoch, [historicalEpoch]);
    assert.ok(prompt.includes('当前纪元：【黄金联邦纪元】'));
    assert.ok(prompt.includes('严禁浪费任何油脂与火种'));
    assert.ok(prompt.includes('黑铁纪元遗风'));
});