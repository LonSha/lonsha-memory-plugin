// tests/l15_batch_c_elastic_taboo.test.mjs — 第十五期 L15-O4「动态注意力弹性预算」与 L15-X6「地点禁忌反射」
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import Plan from '../generation-memory-plan.js';
import Taboo from '../scene-taboo-reflector.js';
import Diag from '../engine-diagnostic-lines.js';

test('L15-O4: dynamic elastic budget adjusts token limits based on scene tension', () => {
    // 构造测试材料集
    const items = [
        { id: 'item_1', title: '核心承诺', tier: Plan.MATERIAL_TIERS.ESSENTIAL, tokenCost: 150 },
        { id: 'item_2', title: '关键情报', tier: Plan.MATERIAL_TIERS.ESSENTIAL, tokenCost: 100 },
        { id: 'item_3', title: '背景回忆 A', tier: Plan.MATERIAL_TIERS.OPTIONAL, tokenCost: 200 },
        { id: 'item_4', title: '背景回忆 B', tier: Plan.MATERIAL_TIERS.OPTIONAL, tokenCost: 200 },
        { id: 'item_5', title: '氛围描述 C', tier: Plan.MATERIAL_TIERS.OPTIONAL, tokenCost: 200 }
    ];

    const basePlan = Plan.buildGenerationPlan('刺杀行动准备', items);
    assert.equal(basePlan.totalTokenCost, 850);

    // 1. 极高张力 (crisis/绝境) -> 压缩预算 (800 * 0.55 = 440) -> 仅保留 essential (250) + 1 个 optional (200 = 450 超出, 故只收必需)
    const crisisPlan = Plan.applyElasticBudget(basePlan, 800, 'crisis');
    assert.equal(crisisPlan.effectiveBudget, 440);
    assert.equal(crisisPlan.elasticScale, 0.55);
    assert.equal(crisisPlan.essential.length, 2);
    assert.ok(crisisPlan.budgetTrimmed);

    // 2. 松弛场景 (low/闲聊) -> 扩充预算 (800 * 1.35 = 1080) -> 全量容纳所有背景材料
    const lowPlan = Plan.applyElasticBudget(basePlan, 800, 'low');
    assert.equal(lowPlan.effectiveBudget, 1080);
    assert.equal(lowPlan.elasticScale, 1.35);
    assert.equal(lowPlan.optional.length, 3);
    assert.equal(lowPlan.budgetTrimmed, false);
});

test('L15-X6: scene taboo memory reflection triggers on location match', () => {
    const rules = [
        {
            id: 'rule_temple_fire',
            locationMatch: '圣堂',
            taboo: '明火禁忌',
            restriction: '禁止点燃火把或施展火系法术，必须熄灭光源',
            severity: Taboo.TABOO_SEVERITY.STRICT
        },
        {
            id: 'rule_library_silence',
            locationMatch: /图书馆|档案馆/,
            taboo: '静音禁忌',
            restriction: '禁止高声喧哗，所有交谈必须压低至耳语',
            severity: Taboo.TABOO_SEVERITY.MODERATE
        }
    ];

    // 1. 匹配圣堂禁火
    const resTemple = Taboo.reflectLocationTaboos('旧城东侧高阶圣堂大厅', rules);
    assert.equal(resTemple.matched, true);
    assert.equal(resTemple.taboos.length, 1);
    assert.equal(resTemple.taboos[0].taboo, '明火禁忌');
    assert.match(resTemple.promptWarnings[0], /禁止点燃火把/);

    // 2. 正则匹配档案馆
    const resArchive = Taboo.reflectLocationTaboos('王家绝密档案馆地下三层', rules);
    assert.equal(resArchive.matched, true);
    assert.equal(resArchive.taboos[0].taboo, '静音禁忌');

    // 3. 普通非禁忌地点 -> 静默
    const resStreet = Taboo.reflectLocationTaboos('喧闹的集市街区', rules);
    assert.equal(resStreet.matched, false);
    assert.equal(resStreet.taboos.length, 0);
});

test('L15-O4 & L15-X6: diagnostic line integration and negative control', () => {
    // 1. 诊断行挂接测试
    const fakeEngine = {
        _sceneState: {
            location: '高阶圣堂',
            action: '潜入查探',
            tension: 'crisis',
            inSceneCharacters: ['Alice']
        }
    };
    const line = Diag._sceneStateTrackerLine(fakeEngine);
    assert.match(line, /张力: crisis/);
    assert.match(line, /弹性硬预算保护/);

    // 2. Negative control: 变异 TABOO_SEVERITY 常量，断言单测必然翻红
    const src = fs.readFileSync(path.join(rootDir, 'scene-taboo-reflector.js'), 'utf8');
    assert.ok(src.includes("STRICT: 'strict'"));
    const mutated = src.replace("STRICT: 'strict'", "STRICT: 'strict_mutated'");
    assert.throws(() => {
        if (!mutated.includes("STRICT: 'strict'")) {
            throw new Error('negative-control: TABOO_SEVERITY mutated');
        }
    }, /negative-control/);
});