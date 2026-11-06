/* [v3.457.0 · V19 记忆专版] 召回主管线与注入管线全域编排防混淆集成测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

test('L19-Vertical-1 真实 recallMemory 全域交响与防混淆消歧真跑贯通', async () => {
  const RECMod = await import(pathToFileURL(path.join(ROOT, 'engine-recall.js')).href);
  const INJMod = await import(pathToFileURL(path.join(ROOT, 'engine-injection-pipeline.js')).href);
  const REC = RECMod.default || RECMod;
  const INJ = INJMod.default || INJMod;

  // 构造真实引擎上下文
  const engine = {
    config: {
      config: {
        memorySymphonyEnabled: true,
        antiConfusionEnabled: true,
        antiConfusionDirectivesEnabled: true,
        resonanceConsolidationEnabled: false,
        pyramidEvolutionEnabled: false,
        rerankEnabled: false,
        recallAuditEnabled: false,
        vectorTopK: 5,
        npcTierInjection: false,
        narrativePulseEnabled: false
      }
    },
    _currentSpeaker: '林深',
    _currentFloor: 25,
    getKnownCharacters: () => ['林深', '艾拉'],
    getUserName: () => '探求者',
    // 基础打桩
    getLatestStoryDate: () => '2026-11-06',
    vector: { search: () => [] },
    pov: { povs: [], search: () => [] },
    timeline: { search: () => [] },
    status: { characters: {}, export: () => ({ characters: {} }) },
    cards: { search: () => [], toPrompt: () => '' },
    conflicts: { getUnresolved: () => [], toPrompt: () => '' },
    deltaBook: { export: () => ({}), toPrompt: () => '' },
    graph: { search: () => [], edges: new Map() },
    summary: {
      volumes: [],
      search: () => [
        { floor: 10, text: '他暗中藏起那封关键信件', character: '林深' },
        { floor: 22, text: '艾拉与林深在钟楼下达成共识', character: '艾拉' }
      ],
      getActiveSummaries: () => [
        { floor: 10, text: '他暗中藏起那封关键信件', character: '林深' },
        { floor: 22, text: '艾拉与林深在钟楼下达成共识', character: '艾拉' }
      ]
    },
    suspense: { openItems: () => [], recentlyResolved: () => [] },
    items: { records: [] },
    itemOps: { getActive: () => [] },
    hybridMerge: (res) => (res.summary || []).slice(),
    intentRerank: (merged) => merged,
    _auditRecall: () => null,
    _recordFloorRecall: () => null,
    buildInjection: function(...args) { return INJ.buildInjection(this, ...args); },
    buildInjectionReadout: function(...args) { return INJ.buildInjectionReadout(this, ...args); },
    _injectionBlocksOf: function(...args) { return INJ._injectionBlocksOf(this, ...args); },
    _injectionRecord: function(...args) { return INJ._injectionRecord(this, ...args); },
    _injectionStage: function(...args) { return INJ._injectionStage(this, ...args); },
    _injectionCommit: function(...args) { return INJ._injectionCommit(this, ...args); },
    _injectionClose: function(...args) { return INJ._injectionClose(this, ...args); },
    _injectionEnd: function(...args) { return INJ._injectionEnd(this, ...args); },
    _injectionRefOf: function(...args) { return INJ._injectionRefOf(this, ...args); },
    _injectionDiscardStale: function(...args) { return INJ._injectionDiscardStale(this, ...args); }
  };

  // 1. 真跑 recallMemory
  const recalled = await REC.recallMemory(engine, {
    text: '信件与钟楼的约定',
    speaker: '林深',
    floor: 25
  });

  assert.ok(Array.isArray(recalled), '召回结果必须为数组');
  assert.equal(recalled.length, 2, '两篇摘要均应被召回');

  // 验证实体锚定前缀是否真实注入到记忆文本中
  const linItem = recalled.find(r => r.floor === 10);
  assert.ok(linItem, '林深的条目必须存在');
  console.log('DEBUG engine._lastSymphonyTrace:', engine._lastSymphonyTrace);
  console.log('DEBUG linItem text:', linItem?.text);
  assert.ok(linItem.text.startsWith('【实体锚定·林深】'), '指代模糊的林深心声必须经交响消歧矩阵打上实体锚定');

  // 验证多角色交互标识
  const meetingItem = recalled.find(r => r.floor === 22);
  assert.ok(meetingItem, '多角色条目必须存在');
  console.log('DEBUG meetingItem text:', meetingItem?.text);
  assert.ok(meetingItem.text.includes('【多角色交互·林深&艾拉】') || meetingItem.text.includes('【多角色交互·艾拉&林深】'), '多角色在场条目必须打上交互标识');

  // 验证交响中枢状态与指令留痕
  assert.ok(engine._lastSymphonyDirectives, '引擎必须保存最后一次防混淆高阶指令');
  assert.ok(engine._lastSymphonyDirectives.includes('【身份边界】'));
  assert.ok(engine._lastSymphonyTrace, '交响追踪日志必须存在');
  assert.equal(engine._lastSymphonyTrace.outputCount, 2);

  // 2. 真跑 buildInjection
  const injectionText = engine.buildInjection(recalled);
  assert.ok(typeof injectionText === 'string', '注入文本必须为字符串');
  assert.ok(injectionText.includes('【防混淆认知矩阵约束】'), '提示词注入私密简报头部必须优雅合流防混淆结构化约束');
  assert.ok(injectionText.includes('【身份边界】现场与已知实体：[林深, 艾拉]'), '已知角色边界必须注入给模型');

  // 3. 负控制验证：当 antiConfusionEnabled: false 时，严禁添加锚定前缀与指令
  engine.config.config.antiConfusionEnabled = false;
  engine._lastSymphonyDirectives = '';
  const offRecalled = await REC.recallMemory(engine, {
    text: '信件与钟楼的约定',
    speaker: '林深',
    floor: 25
  });
  const offLinItem = offRecalled.find(r => r.floor === 10);
  assert.equal(offLinItem.text.startsWith('【实体锚定'), false, 'negative-control: 防混淆关闭时严禁添加前缀');
});