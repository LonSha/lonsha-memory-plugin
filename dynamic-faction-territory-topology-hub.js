/* ============================================================
 * dynamic-faction-territory-topology-hub.js
 * [v3.458.0 · V20 史诗级双计划 · L20-14]
 * 动态势力版图与地理拓扑控制中枢 (Dynamic Faction Territory Topology Hub)
 *
 * 核心机制：
 * 1. 建模世界观宏观地理版图（城邦、边境据点、禁忌荒原、走私航线）；
 * 2. 追踪各大派系势力对不同地理节点的控制力（Control Index: 0%..100%）与警戒管制等级；
 * 3. 当发话角色身处特定区域时，动态注入当地政权法度、搜查巡逻频次、民间对该势力的排斥/拥戴态度指引。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DynamicFactionTerritoryTopologyHub = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInitialTerritoryState() {
    return {
      regions: {}, // regionId -> { name, rulingFaction, controlIndex: 0..100, lawEnforcementLevel: 'LOW'|'MEDIUM'|'HIGH'|'MARTIAL_LAW', localSentiment: 'LOYAL'|'REBELLIOUS'|'TERRIFIED' }
      currentLocation: null,
      borderConflicts: [] // Array<{ regionA, regionB, contestedBy: string[], intensity: number }>
    };
  }

  /**
   * 注册或更新地理区域控制力
   */
  function registerTerritory(state, { regionId, name, rulingFaction, controlIndex = 80, lawEnforcementLevel = 'MEDIUM', localSentiment = 'LOYAL' }) {
    if (!state || !regionId) return;
    state.regions[regionId] = {
      regionId,
      name: name || regionId,
      rulingFaction: rulingFaction || '独立中立派',
      controlIndex: Math.max(0, Math.min(100, controlIndex)),
      lawEnforcementLevel,
      localSentiment
    };
  }

  /**
   * 切换当前场景所处地理位置
   */
  function setSceneLocation(state, regionId) {
    if (!state || !state.regions[regionId]) return false;
    state.currentLocation = regionId;
    return true;
  }

  /**
   * 生成地缘政治与区域管制约束提示词
   */
  function generateTerritoryDirectives(state) {
    if (!state || !state.currentLocation || !state.regions[state.currentLocation]) return '';

    const reg = state.regions[state.currentLocation];

    return `【地缘势力统治与区域管制法则】\n` +
           `当前所处区域：[${reg.name}]（实际统治方：${reg.rulingFaction}，统治稳固度：${reg.controlIndex}%）。\n` +
           `治安管制等级：${reg.lawEnforcementLevel} | 民间氛围倾轧：${reg.localSentiment}。\n` +
           `要求：角色言行与行动受到当地势力的哨卡盘查、法规禁令和群众敌友视线的严格物理制约。`;
  }

  /**
   * 水合与序列化
   */
  function hydrateTerritoryState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialTerritoryState();
    }
    return {
      regions: rawState.regions ? { ...rawState.regions } : {},
      currentLocation: rawState.currentLocation || null,
      borderConflicts: Array.isArray(rawState.borderConflicts) ? [...rawState.borderConflicts] : []
    };
  }

  function serializeTerritoryState(state) {
    if (!state) return createInitialTerritoryState();
    return {
      regions: state.regions || {},
      currentLocation: state.currentLocation,
      borderConflicts: state.borderConflicts || []
    };
  }

  return {
    createInitialTerritoryState,
    registerTerritory,
    setSceneLocation,
    generateTerritoryDirectives,
    hydrateTerritoryState,
    serializeTerritoryState
  };
}));