/* [v3.458.0 · V20 批次7] 跨周目灵魂烙印与命运高潮纺织机测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import SoulBrandLib from '../soul-brand-reincarnation-hub.js';
import FateLoomLib from '../fate-convergence-climax-loom.js';

test('L20-O17 跨周目灵魂烙印提炼、代际转生与宿命既视感', () => {
    const soulState = SoulBrandLib.createInitialReincarnationState();

    // 在第一周目刻下未了宿誓
    const brand = SoulBrandLib.inscribeSoulBrand(soulState, {
        soulOwner: '艾尔登骑士·罗兰',
        targetEntity: '深渊魔皇·卡西斯',
        brandType: 'UNRESOLVED_VOW',
        summary: '纵然身死魂灭，余烬终将刺破黑暗王座',
        intensity: 0.95
    });
    assert.ok(brand);
    assert.equal(soulState.soulBrands.length, 1);

    // 跨入第二周目（转生）
    SoulBrandLib.advanceReincarnationCycle(soulState, {
        reincarnatedCharacter: '流浪少年·罗恩',
        inheritBrandIds: [brand.brandId]
    });
    assert.equal(soulState.currentCycle, 2);

    // 罗恩面对魔皇卡西斯残留遗迹时的本能共振
    const directives = SoulBrandLib.evaluateSoulBrandResonance(soulState, {
        speaker: '流浪少年·罗恩',
        presentCharacters: ['流浪少年·罗恩', '卡西斯遗迹'],
        currentContext: '踏足那座漆黑王座遗址的瞬间，空气骤然冰封'
    });

    assert.ok(directives);
    assert.match(directives, /【跨周目灵魂烙印 · 宿世因果既视感】/);
    assert.match(directives, /纵然身死魂灭/);
    assert.match(directives, /深渊魔皇·卡西斯/);
});

test('L20-O18 命运交汇纺织机、戏剧张力熵与高潮爆发收束', () => {
    const loomState = FateLoomLib.createInitialLoomState();

    // 编织三条高张力命运线
    FateLoomLib.registerLoomThread(loomState, {
        threadId: 'thread_blood_debt',
        title: '世家血仇对峙',
        tensionLevel: 90,
        involvesCharacters: ['林深', '楚天阔']
    });
    FateLoomLib.registerLoomThread(loomState, {
        threadId: 'thread_relic_secret',
        title: '古代神器归属之争',
        tensionLevel: 85,
        involvesCharacters: ['林深', '艾拉', '楚天阔']
    });

    // 计算熵并判定高潮收束
    const climaxDirectives = FateLoomLib.evaluateClimaxConvergence(loomState, {
        speaker: '林深',
        presentCharacters: ['林深', '楚天阔', '艾拉']
    });

    assert.ok(climaxDirectives);
    assert.match(climaxDirectives, /【命运奇点交汇 · 全局戏剧高潮爆发】/);
    assert.match(climaxDirectives, /世家血仇对峙/);
    assert.match(climaxDirectives, /古代神器归属之争/);
    assert.match(climaxDirectives, /戏剧张力熵/);
});
