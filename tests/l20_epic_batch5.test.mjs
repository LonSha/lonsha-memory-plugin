/* [v3.458.0 · V20 批次5] 深层记忆蒸馏图谱与动态势力版图拓扑测试 */
import test from 'node:test';
import assert from 'node:assert/strict';

import AtlasLib from '../deep-memory-distillation-atlas.js';
import TerritoryLib from '../dynamic-faction-territory-topology-hub.js';

test('L20-O13 深层记忆分层抽象与认知概念图谱生成', () => {
    const atlasState = AtlasLib.createInitialAtlasState();

    const theme = AtlasLib.distillMemoriesToAtlas(atlasState, {
        character: '林深',
        memories: ['mem_01_buy_rations', 'mem_02_haggling_bullets'],
        themeLabel: '极端匮乏焦虑',
        coreBelief: '任何信义在生存物资归零前都不值一提，必须随身储备三倍余量。',
        confidence: 0.92
    });

    assert.ok(theme);
    assert.equal(atlasState.distilledThemes.length, 1);
    assert.equal(theme.character, '林深');

    const directives = AtlasLib.generateAtlasDirectives(atlasState, '林深');
    assert.match(directives, /【深层记忆蒸馏图谱 · 核心认知信条】/);
    assert.match(directives, /极端匮乏焦虑/);
    assert.match(directives, /确信度：92%/);
});

test('L20-O14 动态势力版图地理拓扑控制与法度约束', () => {
    const terrState = TerritoryLib.createInitialTerritoryState();

    TerritoryLib.registerTerritory(terrState, {
        regionId: 'reg_iron_citadel',
        name: '铁壁要塞',
        rulingFaction: '圣血裁决所',
        controlIndex: 95,
        lawEnforcementLevel: 'MARTIAL_LAW',
        localSentiment: 'TERRIFIED'
    });

    const ok = TerritoryLib.setSceneLocation(terrState, 'reg_iron_citadel');
    assert.equal(ok, true);

    const directive = TerritoryLib.generateTerritoryDirectives(terrState);
    assert.match(directive, /【地缘势力统治与区域管制法则】/);
    assert.match(directive, /铁壁要塞/);
    assert.match(directive, /圣血裁决所/);
    assert.match(directive, /统治稳固度：95%/);
    assert.match(directive, /MARTIAL_LAW/);
});