/* ============================================================
 * deep-memory-distillation-atlas.js
 * [v3.458.0 · V20 史诗级双计划 · L20-13]
 * 深层记忆蒸馏图谱与分层概念抽象机 (Deep Memory Distillation Atlas)
 *
 * 核心机制：
 * 1. 解决超长程（数百轮）对话下原始碎片记忆堆积导致的注意力分散；
 * 2. 将低层离散事件（如“去酒馆买酒”、“交谈金币价格”）聚合蒸馏为中层主题（“经济拮据与物资筹备”），
 *    并进一步提炼为顶层角色核心哲学或宿命宏观概念（如“对生存资源的匮乏焦虑与实用主义倾向”）；
 * 3. 产生高密度图谱层级（Concept Atlas），在交响编排中以极低上下文开销注入顶层认知基石。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DeepMemoryDistillationAtlas = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInitialAtlasState() {
    return {
      conceptHierarchies: {}, // conceptId -> { level: 'macro'|'theme'|'event', label, summary, childIds: string[], character: string }
      distilledThemes: [],    // Array<{ themeId, character, coreBelief, evidenceIds: string[], confidence: number }>
      lastDistilledAt: null
    };
  }

  /**
   * 将多条离散记忆条目蒸馏为高阶认知概念
   */
  function distillMemoriesToAtlas(state, { character, memories = [], themeLabel, coreBelief, confidence = 0.85 }) {
    if (!state || !character || !Array.isArray(memories) || memories.length === 0) {
      return null;
    }

    const themeId = 'theme_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const macroConceptId = 'macro_' + character.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();

    const distilledTheme = {
      themeId,
      character,
      themeLabel: themeLabel || '深层认知沉淀',
      coreBelief: coreBelief || '长程经历所塑造的核心行动信条',
      evidenceIds: memories.map(m => (typeof m === 'object' ? (m.id || String(m)) : String(m))),
      confidence: Math.max(0, Math.min(1.0, confidence)),
      distilledAt: new Date().toISOString()
    };

    state.distilledThemes.push(distilledTheme);

    state.conceptHierarchies[macroConceptId] = {
      level: 'macro',
      label: distilledTheme.themeLabel,
      summary: distilledTheme.coreBelief,
      childIds: [themeId],
      character
    };

    state.lastDistilledAt = new Date().toISOString();
    return distilledTheme;
  }

  /**
   * 生成概念蒸馏图谱提示词指引 (注入高阶认知定式)
   */
  function generateAtlasDirectives(state, character) {
    if (!state || !character || !Array.isArray(state.distilledThemes)) return '';

    const matching = state.distilledThemes.filter(t => t.character === character);
    if (matching.length === 0) return '';

    const themesText = matching.map(t => `- [${t.themeLabel}]：${t.coreBelief}（确信度：${Math.round(t.confidence * 100)}%）`).join('\n');

    return `【深层记忆蒸馏图谱 · 核心认知信条】\n` +
           `角色 [${character}] 经历过往事件沉淀，已内化出以下核心哲学信念与行动定式：\n` +
           `${themesText}\n` +
           `要求：在面对抉择与反应时，其潜意识决策必须严格契合上述深层信念基石。`;
  }

  /**
   * 水合与序列化
   */
  function hydrateAtlasState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialAtlasState();
    }
    return {
      conceptHierarchies: rawState.conceptHierarchies ? { ...rawState.conceptHierarchies } : {},
      distilledThemes: Array.isArray(rawState.distilledThemes) ? [...rawState.distilledThemes] : [],
      lastDistilledAt: rawState.lastDistilledAt || null
    };
  }

  function serializeAtlasState(state) {
    if (!state) return createInitialAtlasState();
    return {
      conceptHierarchies: state.conceptHierarchies || {},
      distilledThemes: state.distilledThemes || [],
      lastDistilledAt: state.lastDistilledAt
    };
  }

  return {
    createInitialAtlasState,
    distillMemoriesToAtlas,
    generateAtlasDirectives,
    hydrateAtlasState,
    serializeAtlasState
  };
}));