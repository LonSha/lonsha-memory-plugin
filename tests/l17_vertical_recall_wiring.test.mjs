/* [v3.455.0 · V17] 召回主管线真实接线端到端：真跑 recallMemory，验证共振统计与就地改序 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const REC = require(path.join(ROOT, 'engine-recall.js'));
const RS = require(path.join(ROOT, 'memory-resonance-consolidation.js'));

function buildEngine(overrides = {}) {
  const cfg = {
    enabled: true, vectorEnabled: false, bm25Enabled: false, graphDiffusionEnabled: false,
    summaryFoldEnabled: false, holidayAware: false, characterStateEnabled: false,
    plotTimeline: false, recallProvenanceFilter: false, memoryTreeEnabled: false,
    neuralChainEnabled: false, rerankEnabled: false, recallAuditEnabled: false,
    emotionOppositeRecall: false, worldlineMemoryEnabled: false,
    unifiedRecallEnabled: false, volumeIntegrityGuard: false,
    vectorTopK: 5, resonanceConsolidationEnabled: true,
    resonanceHops: 2, resonanceDecay: 0.6, resonanceRescoreBound: 0.01,
    debugMode: false
  };
  Object.assign(cfg, overrides);
  const summaries = [
    { id: 'm_alice', key: 'sum_1', text: 'Alice 在旧书店买到了一本泛黄笔记本', floor: 1 },
    { id: 'm_bob', key: 'sum_2', text: 'Bob 在码头收到了一封匿名信', floor: 2 },
    { id: 'm_dock', key: 'sum_3', text: '旧书店旁的码头夜里亮着灯塔', floor: 3 }
  ];
  return {
    config: { config: cfg },
    summary: {
      search: () => summaries.slice(),
      verifyVolumesIntact: () => {},
      getActiveSummaries: () => summaries,
      volumes: [],
      searchVolumes: () => [],
      getLockedFacts: () => []
    },
    graph: { findByNames: () => [], edges: new Map(), nodes: new Map(), findCharacterByName: () => null },
    diary: { search: () => [] },
    vector: { search: async () => [], dimension: 0 },
    bm25: { N: 0, search: () => [], searchBranches: () => [] },
    suspense: { openItems: () => [] },
    status: { characters: {}, searchByNames: () => [], ageReading: () => '' },
    timeline: { entries: [], searchNear: () => [] },
    holiday: { current: () => null, keywords: () => [] },
    clock: { date: '' },
    charMem: { search: () => [] },
    pov: { search: () => [] },
    reflection: { search: () => [] },
    items: [],
    itemOps: [],
    supersede: null,
    hybridMerge(results) {
      const src = (results.summary || []).slice(0, 8);
      return src.map((x, i) => Object.assign({}, x, { rrfScore: 0.02 - i * 0.001, source: 'summary' }));
    },
    intentRerank(merged) { return merged; },
    computeRecallQuota: () => 1,
    getLatestStoryDate: () => '',
    getKnownCharacters: () => [],
    captureCast: () => [],
    _noteCaptureCastFail: () => {},
    _diffusionFatigue: new Map(),
    _diffusionFatigueTopN: 5,
    _diffusionFatigueTimeout: 3,
    _nodeIdentity: (r) => String((r && r.id) || ''),
    unifiedRecall: null,
    worldlineGate: null,
    _auditRecall: () => null,
    _recordFloorRecall: () => {},
    _resonanceState: null,
    _lastResonanceStats: null
  };
}

// 把库口经 bindDeps 注入（与 index.js assembleComponents 真实路径一致）
REC.bindDeps({ errLog: () => {}, libs: { _resonanceLib: () => RS } });

test('L17-V1 真跑 recallMemory：共振段必须执行并留下真实统计', async () => {
  const engine = buildEngine();
  const out = await REC.recallMemory(engine, { text: '旧书店的笔记本后来去了哪里' });
  assert.ok(Array.isArray(out) && out.length > 0, '召回必须返回候选');
  const st = engine._lastResonanceStats;
  assert.ok(st && st.active === true, '共振段必须真实执行（不是只定义不调用）');
  assert.equal(st.seedsFed, 0, '无图谱/BM25 种子时如实报 0，不伪造');
  assert.ok(st.scanned >= 3, '必须扫过全部融合候选');
  assert.ok(engine._resonanceState && typeof engine._resonanceState === 'object', '宿主状态必须被惰性建立');
  // 关掉总闸：零行为变化且如实留痕
  const off = buildEngine({ resonanceConsolidationEnabled: false });
  const out2 = await REC.recallMemory(off, { text: '旧书店' });
  assert.ok(Array.isArray(out2));
  assert.equal(off._lastResonanceStats.active, false, '总闸关闭必须如实报未激活');
  assert.equal(off._lastResonanceStats.reason, 'disabled');
});

test('L17-V2 真跑 recallMemory：图种子 + 时序边驱动多跳提权并就地改序', async () => {
  const engine = buildEngine();
  engine.graph.edges = new Map([
    ['e1', { from: 'm_alice', to: 'm_dock', weight: 1 }],
    ['e2', { from: 'm_dock', to: 'm_bob', weight: 1 }]
  ]);
  engine.graph.findByNames = () => [{ id: 'm_alice', name: '书店老板' }];
  engine.captureCast = () => ['书店老板'];
  const out = await REC.recallMemory(engine, { text: '灯塔与那封信', characters: ['书店老板'] });
  const st = engine._lastResonanceStats;
  assert.ok(st.active === true);
  assert.ok(st.seedsFed >= 1, '图谱命中实体必须成为引燃种子');
  assert.ok(st.edgesFed === 2, '真实图边必须进入 PEDSA 扩散');
  assert.ok(st.energyHits >= 1, '至少一条融合候选必须拿到激活能');
  assert.ok(out.length >= 3, '共振不得吞掉候选');
  assert.ok(out.some(x => x._resonanceScore > 0), '命中条目必须带共振分（可诊断、可归因）');
  // 负控制：把 bound 设为 0，逐字节等同旧排序（第一条仍是 hybridMerge 的首条）
  const off = buildEngine({ resonanceRescoreBound: 0 });
  off.graph.edges = engine.graph.edges;
  off.graph.findByNames = engine.graph.findByNames;
  off.captureCast = engine.captureCast;
  const out3 = await REC.recallMemory(off, { text: '灯塔与那封信', characters: ['书店老板'] });
  assert.equal(out3[0].id, 'm_alice', 'negative-control: 叠加量归零时必须保持既有主排序次序');
});

test('L17-V3 模块缺席不得静默伪装成功（失败必须点名）', async () => {
  REC.bindDeps({ errLog: () => {}, libs: { _resonanceLib: () => null } });
  const engine = buildEngine();
  await REC.recallMemory(engine, { text: '任意查询' });
  assert.equal(engine._lastResonanceStats.active, false);
  assert.equal(engine._lastResonanceStats.reason, 'module-missing', '模块缺席必须点名，不伪装成「融合 0 条」');
  REC.bindDeps({ errLog: () => {}, libs: { _resonanceLib: () => RS } });   // 复原，防污染其他测试
});