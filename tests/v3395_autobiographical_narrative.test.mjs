import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    LENS_TRAITS,
    reframeFactThroughLens,
    applyAutobiographicalPerspective
} = require('../autobiographical-lens-narrative.js');

test('L10-X4 · reframeFactThroughLens 傲娇与自卑透镜主观重构', () => {
    const rawFact = {
        id: 'fact_gift_01',
        content: 'Alice主动帮助Bob修好了收音机'
    };

    // 傲娇透镜：将主动帮助重构为“看不过去才勉强施舍”
    const tsundereLens = { name: 'Alice', trait: LENS_TRAITS.TSUNDERE };
    const resTsundere = reframeFactThroughLens(rawFact, tsundereLens);
    assert.equal(resTsundere.trait, 'tsundere');
    assert.ok(resTsundere.subjectiveFraming.includes('勉强施舍'));
    assert.ok(resTsundere.egoStance.includes('不过是顺手而已'));

    // 自卑透镜：重构为自我归咎
    const insecureLens = { name: 'Bob', trait: LENS_TRAITS.INSECURE };
    const resInsecure = reframeFactThroughLens(rawFact, insecureLens);
    assert.equal(resInsecure.trait, 'insecure');
    assert.ok(resInsecure.subjectiveFraming.includes('归咎于自身笨拙'));
    assert.ok(resInsecure.egoStance.includes('搞砸了一切'));
});

test('L10-X4 · applyAutobiographicalPerspective 批量映射透镜', () => {
    const facts = [
        { id: 'f1', content: '双方在站台道别' },
        { id: 'f2', content: '对方递过来一把伞' }
    ];

    const lens = { name: '冷酷剑客', trait: LENS_TRAITS.DETACHED };
    const applied = applyAutobiographicalPerspective(facts, lens);
    assert.equal(applied.length, 2);
    assert.ok(applied[0].injectedMemoryText.includes('冷静记录客观因果'));
    assert.equal(applied[1].autobiographicalView.trait, 'detached');
});