/* [v3.458.0 · V20 批次6] 长尾伏笔沉睡闪回与多维社交声望拓扑测试 */
import test from 'node:test';
import assert from 'node:assert/strict';

import FlashbackLib from '../long-tail-flashback-resonance-hub.js';
import ReputationLib from '../multi-dimensional-reputation-social-graph.js';

test('L20-O15 长尾伏笔沉睡唤醒、语境共振与闪回指令', () => {
    const resState = FlashbackLib.createInitialResonanceState();

    FlashbackLib.registerForeshadowing(resState, {
        nodeId: 'node_ancient_seal',
        character: '主角',
        floor: 12,
        content: '林中老者赠予的生锈钥匙，曾言及“唯有双月同天之时方可开启地宫”',
        triggers: ['双月', '地宫钥匙', '生锈铁钥']
    });

    // 模拟推进至第 60 轮
    FlashbackLib.advanceFloorDormancy(resState, 60);

    // 触发语境
    const awakened = FlashbackLib.evaluateFlashbackResonance(resState, {
        text: '今夜夜空异变，双月竟罕见地并排升起……',
        currentFloor: 60,
        speaker: '主角'
    });

    assert.equal(awakened.length, 1);
    assert.equal(awakened[0].nodeId, 'node_ancient_seal');
    assert.equal(awakened[0].matchedTrigger, '双月');

    const directives = FlashbackLib.generateFlashbackDirectives(awakened, '主角');
    assert.match(directives, /【长尾深层伏笔闪回 · 宿命共振】/);
    assert.match(directives, /生锈钥匙/);
    assert.match(directives, /第12轮伏笔/);
});

test('L20-O16 多维社会声誉阶层压制与恶名戒备', () => {
    const repState = ReputationLib.createInitialReputationState();

    // 恶棍格里夫恶名昭彰
    ReputationLib.setReputation(repState, '屠夫·格里夫', {
        prestige: 60,
        infamy: 88,
        benevolence: 10,
        legitimacy: 20
    });

    // 圣骑士亚瑟拥有极高武勇声望
    ReputationLib.setReputation(repState, '圣骑士·亚瑟', {
        prestige: 92,
        infamy: 0,
        benevolence: 85,
        legitimacy: 90
    });

    // 普通佣兵雷恩面对格里夫
    const directives = ReputationLib.generateReputationDirectives(repState, '雷恩', ['屠夫·格里夫', '圣骑士·亚瑟']);
    assert.match(directives, /【多维社会声望与阶层威压 · 社交拓扑】/);
    assert.match(directives, /屠夫·格里夫.*恶名昭彰/);
    assert.match(directives, /圣骑士·亚瑟.*极高的武勇或声望威压/);
});