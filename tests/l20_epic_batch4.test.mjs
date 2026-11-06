/* [v3.458.0 · V20 批次4] 梦境隐喻、生理微表情与多方博弈测试 */
import test from 'node:test';
import assert from 'node:assert/strict';

import DreamLib from '../dream-subconscious-metaphor-synthesizer.js';
import SomaticLib from '../somatic-micro-expression-reflex-engine.js';
import GameTheoryLib from '../multi-agent-game-theory-coordinator.js';

test('L20-O10 梦境解析与潜意识隐喻合成、晨起余波折射', () => {
    const dreamState = DreamLib.createInitialDreamState();
    const dream = DreamLib.synthesizeDream({
        character: '阿尔温',
        traumaKeywords: ['枯萎誓言'],
        stressLevel: 85,
        exposureRisk: 0.8,
        isSleeping: true
    });

    assert.ok(dream);
    assert.equal(dream.character, '阿尔温');
    assert.equal(dream.theme, 'betrayal');
    assert.ok(dream.symbol);
    dreamState.activeDreams.push(dream);

    // 唤醒并生成回响指令
    const directive = DreamLib.generateDreamEchoDirective({
        dreamState,
        speaker: '阿尔温',
        isAwakening: true
    });

    assert.match(directive, /【潜意识梦境余波折射 · 直觉隐喻】/);
    assert.match(directive, new RegExp(dream.symbol));
    assert.equal(dream.echoed, true);
});

test('L20-O11 生理反射与微表情神经自律引擎', () => {
    const reportHighStress = SomaticLib.evaluateSomaticReflex({
        character: '雷恩',
        stressLevel: 95,
        exposureRisk: 0.8,
        defenseActive: false
    });

    assert.ok(reportHighStress);
    assert.equal(reportHighStress.reflexKey, 'DIGITAL_TREMOR');
    const directive = SomaticLib.generateSomaticDirective({ somaticReport: reportHighStress });
    assert.match(directive, /【神经生理自律反射 · 不由自主的微表情】/);
    assert.match(directive, /指尖发生极轻微的肌张力震颤/);

    const reportLying = SomaticLib.evaluateSomaticReflex({
        character: '雷恩',
        stressLevel: 40,
        exposureRisk: 0.3,
        defenseActive: true
    });
    assert.ok(reportLying);
    assert.equal(reportLying.reflexKey, 'MICRO_GAZE_AVOIDANCE');
});

test('L20-O12 多智能体博弈均衡与背刺诱惑指令', () => {
    const state = GameTheoryLib.createInitialGameTheoryState();
    GameTheoryLib.updateDyadicTension(state, '主角', '黑商格里夫', {
        trustDelta: -60,
        defectionIncentive: 85
    });

    const directives = GameTheoryLib.evaluateGameBalance({
        state,
        speaker: '主角',
        others: ['黑商格里夫']
    });

    assert.match(directives, /【多方博弈均衡与利益算计 · 博弈论张力】/);
    assert.match(directives, /对 \[黑商格里夫\] 的背叛诱惑极高/);
    assert.match(directives, /背刺收益率 85%/);
});