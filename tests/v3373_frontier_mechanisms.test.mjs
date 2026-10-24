/* ========================================================
 * tests/v3373_frontier_mechanisms.test.mjs
 * LonSha 记忆引擎 v3.373.0 前沿机制超越测试套件
 * 
 * 验证 6 大超越模块：
 * 1. M-EX1 情绪反向召回引擎 (Emotional Antiphony)
 * 2. M-EX2 阶段卷宗封卷引擎 (Volume Sealing)
 * 3. M-EX3 多主角等权动态注册台 (Multi-Protagonist Registry)
 * 4. M-EX4 古法历法与不连续时辰投影 (Ancient Story Clock)
 * 5. M-EX5 单一事实千事重放管线 (Fact Replay Pipeline)
 * 6. M-EX6 伴随式零额外开销提取解析器 (In-band Extraction Parser)
 * ======================================================== */

import test from 'node:test';
import assert from 'node:assert/strict';

import { EmotionalAntiphonyEngine } from '../memory-emotional-antiphony.js';
import { VolumeSealingEngine } from '../volume-sealing-engine.js';
import { MultiProtagonistRegistry } from '../multi-protagonist-registry.js';
import { AncientStoryClock } from '../ancient-story-clock.js';
import { FactReplayPipeline } from '../fact-replay-pipeline.js';
import { InbandExtractionParser } from '../inband-extraction-parser.js';

test('M-EX1 · 情绪反向召回引擎：张力触发、门槛约束与反向温情切片装配', () => {
    const engine = new EmotionalAntiphonyEngine({ minBondThreshold: 40, maxAntiphonalRecalls: 2 });

    // 1. 低羁绊时不触发
    const lowBondResult = engine.evaluateAntiphonalTrigger({
        currentEmotions: ['anger', 'conflict'],
        characterBondScore: 20
    });
    assert.strictEqual(lowBondResult.triggered, false);
    assert.strictEqual(lowBondResult.reason, 'bond_score_below_threshold');

    // 2. 不可逆决裂时强制抑制
    const irreversibleResult = engine.evaluateAntiphonalTrigger({
        currentEmotions: ['anger'],
        characterBondScore: 80,
        isIrreversibleConflict: true
    });
    assert.strictEqual(irreversibleResult.triggered, false);
    assert.strictEqual(irreversibleResult.reason, 'suppressed_by_irreversible_conflict');

    // 3. 高羁绊且存在负面情绪触发
    const hitResult = engine.evaluateAntiphonalTrigger({
        currentEmotions: ['conflict', 'betrayal'],
        characterBondScore: 65,
        isIrreversibleConflict: false
    });
    assert.strictEqual(hitResult.triggered, true);
    assert.ok(hitResult.targetPositiveTags.includes('promise'));
    assert.ok(hitResult.targetPositiveTags.includes('sacrifice'));

    // 4. 装配切片
    const mockEvents = [
        { id: 'ev1', title: '星空下的誓言', content: '曾在废墟中承诺永不放弃彼此', emotionalTags: ['promise', 'warmth'], importance: 'permanent' },
        { id: 'ev2', title: '日常争吵', content: '因为琐事有些不快', emotionalTags: ['conflict'], importance: 'normal' },
        { id: 'ev3', title: '初次相遇', content: '在古树下相遇', emotionalTags: ['first_encounter'], importance: 'major' }
    ];

    const assembled = engine.assembleAntiphonalRecalls({ memoryEvents: mockEvents, evaluation: hitResult });
    assert.strictEqual(assembled.recalls.length, 2);
    assert.strictEqual(assembled.recalls[0].id, 'ev1'); // 高分优先
    assert.ok(assembled.promptSnippet.includes('【心理暗流·反向温情共鸣】'));
    assert.ok(assembled.promptSnippet.includes('星空下的誓言'));
});

test('M-EX2 · 阶段卷宗封卷引擎：阈值触达、卷宗生成与分卷编年史投影', () => {
    const engine = new VolumeSealingEngine({ sealingBatchSize: 3, maxRecapLength: 100 });

    const activeEntries = [
        { id: 'e1', summary: '抵达落霞镇', characters: ['阿绫'], anchor: '落霞镇', importance: 'normal' },
        { id: 'e2', summary: '探访古城遗迹', characters: ['阿绫', '言和'], anchor: '古城', importance: 'major' }
    ];

    // 未达步长不封卷
    const check1 = engine.evaluateSealingTrigger({ activeEntries, forceMilestoneSeal: false });
    assert.strictEqual(check1.shouldSeal, false);

    // 步长达标或强制里程碑
    const check2 = engine.evaluateSealingTrigger({ 
        activeEntries: [...activeEntries, { id: 'e3', summary: '战胜阴影魔兽', characters: ['言和'], importance: 'permanent' }],
        forceMilestoneSeal: false 
    });
    assert.strictEqual(check2.shouldSeal, true);

    // 执行封卷
    const { sealedVolume, archivedEntryIds } = engine.sealVolume({
        volumeIndex: 1,
        title: '第一卷·边陲风云',
        entriesToSeal: [...activeEntries, { id: 'e3', summary: '战胜阴影魔兽', characters: ['言和'], importance: 'permanent' }],
        summaryRecap: '主角一行人抵达落霞镇，探访古城遗迹并齐心战胜魔兽',
        timeRange: '天启三年初春'
    });

    assert.strictEqual(sealedVolume.index, 1);
    assert.strictEqual(sealedVolume.entryCount, 3);
    assert.strictEqual(sealedVolume.majorEventCount, 2);
    assert.deepStrictEqual(archivedEntryIds, ['e1', 'e2', 'e3']);

    // 编年史投影渲染
    const projection = engine.renderChronicleProjection([sealedVolume]);
    assert.ok(projection.includes('【长剧本分卷编年史】'));
    assert.ok(projection.includes('第一卷·边陲风云'));
    assert.ok(projection.includes('天启三年初春'));
});

test('M-EX3 · 多主角等权动态实体注册台：别名消歧归一、升格主要角色与上下文引导', () => {
    const registryEngine = new MultiProtagonistRegistry({ minInteractionCountToPromote: 4, minBondScoreToPromote: 30 });
    const registry = new Map();

    // 初始先录入第一主角
    registryEngine.registerProtagonist(registry, { name: '白清夜', role: '青梅竹马' });

    // 别名归一测试
    assert.strictEqual(registryEngine.canonicalizeName('白清夜（学姐）', ['白清夜']), '白清夜');
    assert.strictEqual(registryEngine.canonicalizeName('苏晓队长', ['苏晓']), '苏晓');

    // 评估是否可升格
    const candidateEva = registryEngine.evaluatePromotion({
        name: '苏晓',
        role: '调查员',
        interactionCount: 5,
        bondScore: 45
    }, registry);

    assert.strictEqual(candidateEva.shouldPromote, true);
    assert.strictEqual(candidateEva.canonName, '苏晓');

    // 注册升格
    const regResult = registryEngine.registerProtagonist(registry, {
        name: '苏晓',
        role: '调查员',
        evidence: candidateEva.evidence,
        initialSentiment: '信任'
    });

    assert.strictEqual(regResult.success, true);
    assert.strictEqual(registry.size, 2);

    // 再次评估已升格角色，防止降级
    const secondEva = registryEngine.evaluatePromotion({ name: '苏晓（常服）', interactionCount: 10, bondScore: 50 }, registry);
    assert.strictEqual(secondEva.shouldPromote, false);
    assert.strictEqual(secondEva.isAlreadyProtagonist, true);

    // Prompt 提示块构建
    const promptBlock = registryEngine.formatProtagonistPromptBlock(registry);
    assert.ok(promptBlock.includes('《白清夜》'));
    assert.ok(promptBlock.includes('《苏晓》'));
    assert.ok(promptBlock.includes('等权主要角色'));
});

test('M-EX4 · 古法历法与不连续时辰投影：十二时辰刻度解析、公历兼容与模糊排序', () => {
    const clock = new AncientStoryClock();

    // 1. 十二时辰初正刻度解析
    const shichen1 = clock.parseStoryTime('景德三年·午正三刻');
    assert.strictEqual(shichen1.type, 'ancient_shichen');
    assert.strictEqual(shichen1.shichen, '午时');
    assert.strictEqual(shichen1.phase, '正');
    assert.strictEqual(shichen1.quarter, '三刻');
    assert.strictEqual(shichen1.sortKey, 'ANCIENT_11:105');

    // 2. 公历标准时间解析
    const gregorian = clock.parseStoryTime('2026-10-24 14:00');
    assert.strictEqual(gregorian.type, 'gregorian');
    assert.strictEqual(gregorian.sortKey, '2026-10-24');

    // 3. 模糊叙事时间解析
    const fuzzy = clock.parseStoryTime('翌日残阳西下');
    assert.strictEqual(fuzzy.type, 'fuzzy_literary');
    assert.strictEqual(fuzzy.isComparable, false);

    // 4. 排序与分段
    const events = [
        { id: '1', title: '黄昏相聚', storyTime: '翌日残阳西下' },
        { id: '2', title: '午后茶会', storyTime: '未初一刻' },
        { id: '3', title: '清晨出发', storyTime: '卯正二刻' }
    ];

    const ordered = clock.orderEventsByClock(events);
    assert.strictEqual(ordered.chronological.length, 2);
    assert.strictEqual(ordered.chronological[0].id, '3'); // 卯正早于未初
    assert.strictEqual(ordered.chronological[1].id, '2');
    assert.strictEqual(ordered.fuzzy.length, 1);
    assert.strictEqual(ordered.fuzzy[0].id, '1');
});

test('M-EX5 · 单一事实千事重放管线：重放生成图、删除标记过滤与人工覆盖保留', () => {
    const pipeline = new FactReplayPipeline();

    const floorDeltas = [
        {
            floorId: 10,
            events: [
                { id: 'ev_101', title: '初次商议', matterId: 'matter_travel', status: 'planned', people: ['Alice', 'Bob'] },
                { id: 'ev_102', title: '购买马匹', matterId: 'matter_travel', status: 'inProgress', people: ['Alice'] }
            ],
            relations: [
                { fromEventId: 'ev_101', toEventId: 'ev_102', type: 'progress' }
            ],
            deletedEventIds: []
        },
        {
            floorId: 11,
            events: [
                { id: 'ev_103', title: '临时取消行程', matterId: 'matter_travel', status: 'cancelled', people: ['Bob'] },
                { id: 'ev_104', title: '无效草稿事件', matterId: null }
            ],
            relations: [
                { fromEventId: 'ev_102', toEventId: 'ev_103', type: 'progress' }
            ],
            deletedEventIds: ['ev_104'] // 标记删除 ev_104
        }
    ];

    // 人工整线覆盖：用户在界面强制将行程改为已完成
    const manualOverrides = {
        manualMatterStatus: {
            'matter_travel': 'completed'
        },
        manualEvents: {
            'ev_103': { description: '经用户手动确认：实际上顺利启程' }
        }
    };

    const graph = pipeline.replayGraph({ floorDeltas, manualOverrides });

    assert.strictEqual(graph.totalValidEvents, 3); // ev_104 被删除过滤
    assert.strictEqual(graph.totalRelations, 2);
    assert.strictEqual(graph.matters.length, 1);

    const matter = graph.matters[0];
    assert.strictEqual(matter.matterId, 'matter_travel');
    assert.strictEqual(matter.status, 'completed'); // 人工覆盖生效
    assert.strictEqual(matter.isManuallyOverridden, true);
    assert.ok(matter.involvedPeople.includes('Alice'));
    assert.ok(matter.involvedPeople.includes('Bob'));

    const ev103 = graph.events.find(e => e.id === 'ev_103');
    assert.strictEqual(ev103.description, '经用户手动确认：实际上顺利启程');
});

test('M-EX6 · 伴随式零额外开销提取解析器：注释块安全剥离、JSON容错与提示词模板输出', () => {
    const parser = new InbandExtractionParser();

    const rawMessage = `晨光熹微，落叶纷飞。两人并肩走在青石板路上。
“今天天气不错呢。”
<!-- LONSHA_MEM
{
  "summary": "晨间在青石板路散步谈心",
  "storyTime": "卯正二刻",
  "location": "青石板路",
  "characters": ["白清夜"],
  "bonds": [{"name": "白清夜", "delta": 2, "reason": "清晨散步舒缓心情"}],
  "items": [{"name": "热奶茶", "status": "consumed"}],
  "importance": "normal"
}
LONSHA_MEM -->`;

    const { cleanText, hasDelta, delta, parseError } = parser.extractAndStrip(rawMessage);

    assert.strictEqual(parseError, undefined);
    assert.strictEqual(hasDelta, true);
    assert.ok(!cleanText.includes('LONSHA_MEM'));
    assert.ok(cleanText.includes('“今天天气不错呢。”'));
    assert.strictEqual(delta.summary, '晨间在青石板路散步谈心');
    assert.strictEqual(delta.storyTime, '卯正二刻');
    assert.strictEqual(delta.bonds[0].name, '白清夜');
    assert.strictEqual(delta.items[0].status, 'consumed');

    // 提示词模板生成验证
    const prompt = parser.generateInstructionPrompt();
    assert.ok(prompt.includes('【伴随式记忆输出规范】'));
    assert.ok(prompt.includes('LONSHA_MEM'));
});
