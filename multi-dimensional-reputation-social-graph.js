/* ============================================================
 * multi-dimensional-reputation-social-graph.js
 * [v3.458.0 · V20 史诗级双计划 · L20-16]
 * 多维声誉声望与动态社交拓扑图谱 (Multi-Dimensional Reputation Social Graph)
 *
 * 核心机制：
 * 1. 突破传统单一数值好感度（Affection），引入多维社会声誉模型：
 *    - 崇敬度/武勇声望（Martial Prestige: 0..100）
 *    - 奸诈/背信恶名（Notoriety / Infamy: 0..100）
 *    - 慷慨度/慈善信义（Benevolence: 0..100）
 *    - 阶层正统性（Legitimacy: 0..100）
 * 2. 角色之间的态度由上述声望矩阵的内积综合加权决定；
 * 3. 当发话角色面对声名狼藉或备受敬畏的对手时，强制注入言语敬畏、戒备忌惮或傲慢蔑视的社交地位差异指引。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MultiDimensionalReputationSocialGraph = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInitialReputationState() {
    return {
      characterReputations: {} // character -> { prestige: 50, infamy: 0, benevolence: 50, legitimacy: 50 }
    };
  }

  /**
   * 注册或更新角色的多维社会声望
   */
  function setReputation(state, character, { prestige = 50, infamy = 0, benevolence = 50, legitimacy = 50 }) {
    if (!state || !character) return;
    state.characterReputations[character] = {
      prestige: Math.max(0, Math.min(100, prestige)),
      infamy: Math.max(0, Math.min(100, infamy)),
      benevolence: Math.max(0, Math.min(100, benevolence)),
      legitimacy: Math.max(0, Math.min(100, legitimacy))
    };
  }

  /**
   * 评估双边声誉压制与社交阶层张力
   */
  function evaluateReputationTension(state, speaker, target) {
    if (!state || !speaker || !target || !state.characterReputations[target]) return null;

    const targetRep = state.characterReputations[target];
    const speakerRep = state.characterReputations[speaker] || { prestige: 50, infamy: 0, benevolence: 50, legitimacy: 50 };

    let tensionType = 'EQUAL';
    let detail = '';

    if (targetRep.infamy >= 70) {
      tensionType = 'DREAD_INFAMY';
      detail = `[${target}] 凶名在外、恶名昭彰（恶名值 ${targetRep.infamy}）。必须在互动中表现出强烈的警惕防备，防范其不择手段的阴险背刺。`;
    } else if (targetRep.prestige >= 80 && speakerRep.prestige <= 50) {
      tensionType = 'AWE_PRESTIGE';
      detail = `[${target}] 拥有极高的武勇或声望威压（威望值 ${targetRep.prestige}）。阶层与气势被压制，言语态度不由自主带上三分敬畏或谨小慎微。`;
    }

    if (!detail) return null;

    return {
      speaker,
      target,
      tensionType,
      directiveText: detail
    };
  }

  /**
   * 生成声誉社交压制提示词指令
   */
  function generateReputationDirectives(state, speaker, others = []) {
    if (!state || !speaker || !Array.isArray(others) || others.length === 0) return '';

    const lines = [];
    for (const target of others) {
      if (target === speaker) continue;
      const tension = evaluateReputationTension(state, speaker, target);
      if (tension) {
        lines.push(`- ${tension.directiveText}`);
      }
    }

    if (lines.length === 0) return '';

    return `【多维社会声望与阶层威压 · 社交拓扑】\n` +
           lines.join('\n');
  }

  /**
   * 水合与序列化
   */
  function hydrateReputationState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialReputationState();
    }
    return {
      characterReputations: rawState.characterReputations ? { ...rawState.characterReputations } : {}
    };
  }

  function serializeReputationState(state) {
    if (!state) return createInitialReputationState();
    return {
      characterReputations: state.characterReputations || {}
    };
  }

  return {
    createInitialReputationState,
    setReputation,
    evaluateReputationTension,
    generateReputationDirectives,
    hydrateReputationState,
    serializeReputationState
  };
}));