/* ========================================================
 * hierarchical-pyramid-evolution.js — [v3.456.0 · V18/L18]
 * 分层记忆折叠金字塔与整合去重演化引擎 (Hierarchical Pyramid Evolution Engine)
 *
 * 【设计哲学与参考源 (STBME #18/#19/#21 & BAIBAI 森林 L1/L2)】
 * 1. 提取次数驱动的分层折叠金字塔 (Access-driven / Extraction-driven Tiering):
 *    - 既有 maybeFold 是固定的楼层数硬阈值 (如 30 条活跃日记折叠)，
 *      缺乏基于「提取/使用强度 (access/intensity)」的主动分层折叠与同层合并 (fan-in rollup)。
 *    - 当一组活跃日记或相邻事实提取访问密度极高 (accessCount/heat)，或同主题聚集达到 fan-in 阈值时，
 *      自动按语义/时间卷入高层 (Level 1 日记/细粒度 -> Level 2 场景/周记 -> Level 3 卷/史记)，
 *      并无缝迁移外部关系边 (external edge migration)，子节点安全收敛。
 * 2. 整合去重与演化边链 (Deduplication & Evolution Links):
 *    - 结合余弦相似度 / 2-gram 相似度判定高度重复 (sim >= 0.80) 或相关 (sim >= 0.62)。
 *    - 不直接物理销毁历史节点，而是通过建立 'evolution_related' (强度 0.70)
 *      或 'evolution_supersedes' (换代抑制) 边，将旧记忆演化指向新记忆，
 *      同时将累积的 accessCount 与重要度按比例结转 (credit transfer)。
 * 3. 睡眠遗忘与自愈归档安全联动 (Sleep-forgetting Retention Archival):
 *    - 结合 retentionValue = (importance/10) * recency * (1 + accessFreq)，
 *      将真正低价值的衰亡记忆优雅归档 (archivedForSleep = true, archivedAt, retentionValue)，
 *      同时与 sleep-awaken 保持对称；若已有演化边指向新节点，优先软归档。
 *
 * 【纯逻辑无副作用与可移植性】
 *   - IIFE + CJS 规范导出，零全局硬编码，支持单元测试与浏览器环境。
 *   - 宿主传入依赖 (engine/summaries/vectors/graph)，本模块提供判据与纯操作。
 * ======================================================== */
'use strict';
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaPyramidEvolution = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PYRAMID_VERSION = 1;
  const KIND = 'hierarchical_pyramid_evolution';

  /** 默认参数规范 */
  const DEFAULTS = Object.freeze({
    enabled: true,
    fanInThreshold: 3,           // 同主题/密集访问聚集触发折叠的最小数量
    evolutionSimThreshold: 0.80, // 去重/演化边相似度门限
    relatedSimThreshold: 0.62,   // 关联边相似度门限
    evolutionEdgeWeight: 0.70,   // 演化边默认权重
    maxSummariesConsidered: 100, // 单次巡检最大考虑条数
    minAgeHoursForSleep: 1.0     // 睡眠归档最低保护小时数
  });

  function _num(v, fb) { const n = Number(v); return Number.isFinite(n) ? n : fb; }
  function _text(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }

  /**
   * 2-gram 相似度计算（兜底纯词法余弦）
   */
  function calcOverlapSim(a, b) {
    const ta = _text(a).toLowerCase();
    const tb = _text(b).toLowerCase();
    if (!ta || !tb) return 0;
    if (ta === tb) return 1.0;
    const grams = (s) => {
      const set = new Set();
      const clean = s.replace(/[\s，。！？、；：""''（）【】《》…—·,.!?;:'"()\[\]{}<>]/g, '');
      for (let i = 0; i < clean.length - 1; i++) set.add(clean.slice(i, i + 2));
      if (clean.length === 1) set.add(clean);
      return set;
    };
    const setA = grams(ta), setB = grams(tb);
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const g of setA) if (setB.has(g)) inter++;
    return (2 * inter) / (setA.size + setB.size);
  }

  /**
   * 状态管理：创建全新初始状态
   */
  function createState() {
    return {
      version: PYRAMID_VERSION,
      kind: KIND,
      clustersFolded: 0,
      evolutionLinksCount: 0,
      archivedByEvolution: 0,
      lastRunTs: 0,
      links: [] // 记录最近演化边 { fromId, toId, type, sim, ts }
    };
  }

  /**
   * 状态管理：宽容反序列化与水合
   */
  function hydrateState(raw) {
    const base = createState();
    if (!raw || typeof raw !== 'object') return base;
    base.clustersFolded = Math.max(0, _num(raw.clustersFolded, 0));
    base.evolutionLinksCount = Math.max(0, _num(raw.evolutionLinksCount, 0));
    base.archivedByEvolution = Math.max(0, _num(raw.archivedByEvolution, 0));
    base.lastRunTs = Math.max(0, _num(raw.lastRunTs, 0));
    if (Array.isArray(raw.links)) {
      base.links = raw.links.slice(0, 200).map(l => ({
        fromId: String(l.fromId || ''),
        toId: String(l.toId || ''),
        type: String(l.type || 'related'),
        sim: _num(l.sim, 0),
        ts: _num(l.ts, 0)
      }));
    }
    return base;
  }

  /**
   * 扫描并识别可折叠/汇总的分层集群 (Extraction/Access-driven Clustering)
   * @param {Array<Object>} summaries 活跃摘要列表
   * @param {Object} options 配置项
   * @returns {Array<Object>} 待折叠集群列表
   */
  function planHierarchicalClusters(summaries, options) {
    const list = Array.isArray(summaries) ? summaries.filter(s => s && !s.folded && !s.archivedForSleep) : [];
    if (!list.length) return [];
    const opts = Object.assign({}, DEFAULTS, options || {});
    const fanIn = Math.max(2, _num(opts.fanInThreshold, DEFAULTS.fanInThreshold));
    
    // 按楼层升序排列
    const sorted = list.slice().sort((a, b) => (_num(a.floor, 0) - _num(b.floor, 0)));
    const clusters = [];
    let currentCluster = [];

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      if (!currentCluster.length) {
        currentCluster.push(item);
        continue;
      }
      const prev = currentCluster[currentCluster.length - 1];
      const floorDiff = Math.abs(_num(item.floor, 0) - _num(prev.floor, 0));
      const sim = calcOverlapSim(item.text, prev.text);
      
      // 相邻楼层 <= 5 或 相似度较高且楼层 <= 15
      if (floorDiff <= 5 || (sim >= opts.relatedSimThreshold && floorDiff <= 15)) {
        currentCluster.push(item);
      } else {
        if (currentCluster.length >= fanIn) {
          clusters.push(currentCluster);
        }
        currentCluster = [item];
      }
    }
    if (currentCluster.length >= fanIn) {
      clusters.push(currentCluster);
    }

    return clusters.map(c => {
      const floors = c.map(x => _num(x.floor, 0));
      const totalAccess = c.reduce((acc, x) => acc + _num(x.accessCount, 0), 0);
      const startFloor = Math.min(...floors);
      const endFloor = Math.max(...floors);
      return {
        id: `cluster_${startFloor}_${endFloor}_${Date.now()}`,
        startFloor,
        endFloor,
        count: c.length,
        items: c,
        totalAccess,
        targetLevel: Math.max(...c.map(x => _num(x.level, 1))) + 1
      };
    });
  }

  /**
   * 发现潜在的演化/去重关系 (Evolution & Related Linking)
   * @param {Array<Object>} items 待比较条目列表
   * @param {Object} options 配置项
   * @returns {Array<Object>} 演化边建议列表
   */
  function planEvolutionLinks(items, options) {
    const list = Array.isArray(items) ? items.filter(x => x && x.text) : [];
    if (list.length < 2) return [];
    const opts = Object.assign({}, DEFAULTS, options || {});
    const evoThresh = _num(opts.evolutionSimThreshold, DEFAULTS.evolutionSimThreshold);
    const relThresh = _num(opts.relatedSimThreshold, DEFAULTS.relatedSimThreshold);
    const weight = _num(opts.evolutionEdgeWeight, DEFAULTS.evolutionEdgeWeight);

    const edges = [];
    const n = Math.min(list.length, opts.maxSummariesConsidered || 100);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = list[i];
        const b = list[j];
        const sim = calcOverlapSim(a.text, b.text);
        if (sim >= evoThresh) {
          // 判定较新的作为演化目标，较旧的演化到较新的
          const aTime = _num(a.timestamp || a.createdAt, 0);
          const bTime = _num(b.timestamp || b.createdAt, 0);
          const from = aTime <= bTime ? a : b;
          const to = aTime <= bTime ? b : a;
          edges.push({
            type: 'evolution',
            fromId: from.id || ('sum_' + from.floor),
            toId: to.id || ('sum_' + to.floor),
            fromFloor: from.floor,
            toFloor: to.floor,
            similarity: sim,
            weight: 0.90,
            action: 'merge_or_supersede',
            reason: `高语义重叠(${sim.toFixed(2)})历史演化`
          });
        } else if (sim >= relThresh) {
          edges.push({
            type: 'related',
            fromId: a.id || ('sum_' + a.floor),
            toId: b.id || ('sum_' + b.floor),
            fromFloor: a.floor,
            toFloor: b.floor,
            similarity: sim,
            weight: weight,
            action: 'link_context',
            reason: `相关话题(${sim.toFixed(2)})上下文关联`
          });
        }
      }
    }
    return edges;
  }

  /**
   * 睡眠遗忘与演化归档协同判决 (Sleep-Retention Plan)
   * @param {Array<Object>} summaries 待评估摘要
   * @param {Array<Object>} evolutionEdges 已确认的演化边
   * @param {Object} options 配置项
   * @returns {Object} { toArchive: [], totalEvaluated: number }
   */
  function planSleepEvolutionArchival(summaries, evolutionEdges, options) {
    const list = Array.isArray(summaries) ? summaries : [];
    const edges = Array.isArray(evolutionEdges) ? evolutionEdges : [];
    const opts = Object.assign({}, DEFAULTS, options || {});
    const now = Date.now();
    const threshold = _num(opts.sleepForgetThreshold, 0.50);
    const minAgeMs = _num(opts.minAgeHoursForSleep, 1.0) * 3600 * 1000;

    // 收集所有被演化替代的源节点 ID
    const supersededFromIds = new Set(
      edges.filter(e => e.type === 'evolution').map(e => e.fromId)
    );

    const toArchive = [];

    for (const s of list) {
      if (!s || s.archivedForSleep) continue;
      const sId = s.id || ('sum_' + s.floor);
      const imp = _num(s.importance, 5);
      if (imp >= 8) continue; // 高重要度豁免

      const created = _num(s.createdAt || s.timestamp, 0);
      const ageMs = now - created;
      if (created > 0 && ageMs < minAgeMs) continue; // 保护期豁免

      const ageHours = Math.max(0.1, ageMs / 3600000);
      const recency = 1 / (1 + Math.log10(1 + ageHours));
      const accessCount = _num(s.accessCount, 0);
      const accessFreq = accessCount / Math.max(1, ageHours / 24);
      let retentionValue = (imp / 10) * recency * (1 + accessFreq);

      // 如果已被新节点演化替代，保留价值按 0.6 衰减加速睡眠沉淀
      let evolved = false;
      if (supersededFromIds.has(sId)) {
        retentionValue *= 0.6;
        evolved = true;
      }

      if (retentionValue < threshold) {
        toArchive.push({
          id: sId,
          floor: s.floor,
          retentionValue: Math.round(retentionValue * 1000) / 1000,
          reason: evolved ? '演化替代加速休眠' : '保留价值衰减至阈值下',
          importance: imp,
          accessCount
        });
      }
    }

    return {
      toArchive,
      totalEvaluated: list.length,
      evolvedCount: toArchive.filter(x => x.reason.includes('演化')).length
    };
  }

  /**
   * 应用演化边到图谱或演化状态表
   * @param {Object} state 引擎持有的演化状态
   * @param {Array<Object>} newEdges 发现的演化边
   * @returns {number} 新增记录数
   */
  function applyEvolutionEdges(state, newEdges) {
    if (!state || !Array.isArray(newEdges) || !newEdges.length) return 0;
    state.links = state.links || [];
    const existing = new Set(state.links.map(l => `${l.fromId}->${l.toId}`));
    let added = 0;
    const now = Date.now();
    for (const e of newEdges) {
      const key = `${e.fromId}->${e.toId}`;
      if (!existing.has(key)) {
        state.links.push({
          fromId: e.fromId,
          toId: e.toId,
          type: e.type,
          sim: e.similarity,
          ts: now
        });
        existing.add(key);
        added++;
      }
    }
    state.evolutionLinksCount = state.links.length;
    state.lastRunTs = now;
    return added;
  }

  /**
   * 导出 API
   */
  return Object.freeze({
    VERSION: PYRAMID_VERSION,
    KIND,
    DEFAULTS,
    createState,
    hydrateState,
    calcOverlapSim,
    planHierarchicalClusters,
    planEvolutionLinks,
    planSleepEvolutionArchival,
    applyEvolutionEdges
  });
});
