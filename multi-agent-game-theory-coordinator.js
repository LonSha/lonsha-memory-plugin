/* ============================================================
 * multi-agent-game-theory-coordinator.js
 * [v3.458.0 · V20 史诗级双计划 · L20-12]
 * 多智能体博弈均衡与动态同盟撕裂协调器 (Multi-Agent Game Theory Coordinator)
 *
 * 核心机制：
 * 1. 建模多人博弈场景下的收益矩阵（零和对抗、囚徒困境、猎鹿博弈、动态背叛利益）；
 * 2. 追踪多个派系与角色之间的同盟信任度（-100 到 +100）及潜在背叛诱惑（Temptation to Defect）；
 * 3. 当某角色的个人利益与同盟利益发生尖锐对立时，注入博弈权衡、利益算计与试探性背刺提示词指令。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MultiAgentGameTheoryCoordinator = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 创建初始博弈状态
   */
  function createInitialGameTheoryState() {
    return {
      alliances: {}, // allianceId -> { name, members: string[], stability: 0..100, commonGoal: string }
      dyadicTension: {}, // "charA:charB" -> { trust: -100..100, mutualBenefit: 0..100, defectionIncentive: 0..100 }
      historyEvents: []
    };
  }

  function getPairKey(a, b) {
    return [a, b].sort().join('::');
  }

  /**
   * 记录或调整双边博弈张力
   */
  function updateDyadicTension(state, charA, charB, { trustDelta = 0, defectionIncentive = null }) {
    if (!state || !charA || !charB) return;
    const key = getPairKey(charA, charB);
    const existing = state.dyadicTension[key] || { trust: 50, mutualBenefit: 50, defectionIncentive: 10 };

    existing.trust = Math.max(-100, Math.min(100, existing.trust + trustDelta));
    if (typeof defectionIncentive === 'number') {
      existing.defectionIncentive = Math.max(0, Math.min(100, defectionIncentive));
    }
    state.dyadicTension[key] = existing;
  }

  /**
   * 评估多方博弈博弈均衡并输出指令
   */
  function evaluateGameBalance({ state, speaker, others = [] }) {
    if (!state || !speaker || !Array.isArray(others) || others.length === 0) return '';

    const tensionDirectives = [];

    for (const target of others) {
      if (target === speaker) continue;
      const key = getPairKey(speaker, target);
      const relation = state.dyadicTension[key];
      if (!relation) continue;

      if (relation.defectionIncentive >= 75 && relation.trust < 30) {
        tensionDirectives.push(`对 [${target}] 的背叛诱惑极高（背刺收益率 ${relation.defectionIncentive}%）。建议在言辞中暗藏筹码试探、隐瞒关键底牌或试探对方底线。`);
      } else if (relation.trust <= -40) {
        tensionDirectives.push(`与 [${target}] 处于深层对抗猜忌状态（信任度 ${relation.trust}）。谨防对方圈套，言语针锋相对或设防。`);
      }
    }

    if (tensionDirectives.length === 0) return '';

    return `【多方博弈均衡与利益算计 · 博弈论张力】\n` +
           tensionDirectives.map(d => `- ${d}`).join('\n');
  }

  /**
   * 水合与序列化
   */
  function hydrateGameTheoryState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialGameTheoryState();
    }
    return {
      alliances: rawState.alliances ? { ...rawState.alliances } : {},
      dyadicTension: rawState.dyadicTension ? { ...rawState.dyadicTension } : {},
      historyEvents: Array.isArray(rawState.historyEvents) ? [...rawState.historyEvents] : []
    };
  }

  function serializeGameTheoryState(state) {
    if (!state) return createInitialGameTheoryState();
    return {
      alliances: state.alliances || {},
      dyadicTension: state.dyadicTension || {},
      historyEvents: state.historyEvents || []
    };
  }

  return {
    createInitialGameTheoryState,
    updateDyadicTension,
    evaluateGameBalance,
    hydrateGameTheoryState,
    serializeGameTheoryState
  };
}));