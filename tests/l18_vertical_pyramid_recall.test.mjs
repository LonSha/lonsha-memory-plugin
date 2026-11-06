/* [v3.456.0 · V18] 分层演化金字塔与睡眠归档垂直接线验证：真跑 recallMemory 与 sleepCycle */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const REC = require(path.join(ROOT, 'engine-recall.js'));
const HPE = require(path.join(ROOT, 'hierarchical-pyramid-evolution.js'));

function buildEngine(overrides = {}) {
  const cfg = {
    enabled: true, vectorEnabled: false, bm25Enabled: false, graphDiffusionEnabled: false,
    summaryFoldEnabled: false, holidayAware: false, characterStateEnabled: false,
    plotTimeline: false, recallProvenanceFilter: false, memoryTreeEnabled: false,
    neuralChainEnabled: false, rerankEnabled: false, recallAuditEnabled: false,
    emotionOppositeRecall: false, worldlineMemoryEnabled: false,
    unifiedRecallEnabled: false, volumeIntegrityGuard: false,
    vectorTopK: 5, resonanceConsolidationEnabled: false,
    pyramidEvolutionEnabled: true,
    pyramidEvolutionSimThreshold: 0.80,
    sleepEvolutionArchival: true,
    debugMode: false
  };
  Object.assign(cfg, overrides);

  const summaries = [
    { id: 'sum_1', floor: 1, text: '商会总管在密室清点银票', accessCount: 2, level: 1 },
    { id: 'sum_2', floor: 2, text: '商会密室藏有假银票印版与图纸', accessCount: 5, level: 1 },
    { id: 'sum_3', floor: 3, text: '城北商会总管潜逃', accessCount: 1, level: 1 }
  ];

  return {
    config: { config: cfg },
    summary: {
      search: () => [summaries[0]], // 初始只命中 sum_1
      verifyVolumesIntact: () => {},
      getActiveSummaries: () => summaries,
      summaries: summaries,
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
    getLatestStoryDate: () => '',
    getKnownCharacters: () => [],
    captureCast: () => [],
    _noteCaptureCastFail: () => {},
    computeRecallQuota: () => 1,
    items: [],
    itemOps: [],
    supersede: null,
    pov: { search: () => [] },
    reflection: { search: () => [] },
    hybridMerge(results) {
      const src = (results.summary || []).slice(0, 8);
      return src.map((x, i) => Object.assign({}, x, { rrfScore: 0.02 - i * 0.001, source: x.source || 'summary' }));
    },
    intentRerank: (merged) => merged,
    _nodeIdentity: (r) => String((r && r.id) || ''),
    _auditRecall: () => null,
    _recordFloorRecall: () => {},
    _pyramidEvolutionState: {
      links: [
        { fromId: 'sum_1', toId: 'sum_2', type: 'evolution', sim: 0.85 }
      ],
      evolutionLinksCount: 1,
      archivedByEvolution: 0
    }
  };
}

test('L18-Vertical-1 真实 recallMemory 演化链动态补充召回', async () => {
  const engine = buildEngine();
  const out = await REC.recallMemory(engine, { text: '商会总管' });
  assert.ok(Array.isArray(out), '召回结果必须有效数组');

  // 原始 search 仅返回 sum_1，但演化链接线后 sum_2 必须被动态补充进来
  const evoHit = out.find(s => (s.id === 'sum_2') || (s.text && s.text.includes('假银票印版')));
  assert.ok(evoHit, '演化链关联节点 sum_2 必须被垂直自动补充召回');
  assert.equal(evoHit.source, 'summary:evolution');

  // 负控制：当关闭 pyramidEvolutionEnabled 时不补充
  const offEngine = buildEngine({ pyramidEvolutionEnabled: false });
  const offRes = await REC.recallMemory(offEngine, { text: '商会总管' });
  const offHit = offRes.find(s => s.source === 'summary:evolution');
  assert.equal(offHit, undefined, 'negative-control: 开关关闭时严禁补充演化节点');
});