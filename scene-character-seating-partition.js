/* ============================================================
 * scene-character-seating-partition.js
 * [v3.448.0 · 第十四期 L14-X6]
 * 下一幕多角色分席材料编排引擎 (纯函数 / 纯契约内核)
 *
 * 核心设计规则：
 * 1. 席位与知情面拆分 (Seating Knowledge Partition)：
 *    将下一幕参与的角色划分为活跃席位，依据材料的知情授权链（knownByCharacters）拆分为：
 *    - `sharedPool`: 所有在席角色共同知晓、可在公共对话中公开引用的材料。
 *    - `privatePockets`: 仅单个角色知晓的私有记忆/心事/秘密，绝不能泄露给其他人。
 *    - `partialSubsets`: 席位中部分角色（>=2 且 < 全员）知晓的材料（可用于眼神交流或私聊）。
 *    - `embargoedSecrets`: 在席角色无人知晓、本幕完全禁运的材料。
 * 2. 动态撤席与重算 (Dynamic Re-partitioning)：
 *    当某一角色离场（撤席）或新增角色入席时，分席材料池必须纯函数即时重算。
 * 3. 严格无污染泄露阻断 (Leakage Barrier)：
 *    公共对话块中绝不包含任何单个角色的私有 Pocket 材料。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaSceneSeatingPartition = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '3.448.0';

  const MATERIAL_VISIBILITY = Object.freeze({
    SHARED: 'shared',         // 全员可知
    PARTIAL: 'partial',       // 部分可知
    PRIVATE: 'private',       // 独知
    EMBARGOED: 'embargoed'    // 全员不知（禁运）
  });

  function _sanitizeStr(s, maxLen = 300) {
    if (typeof s !== 'string') return '';
    const trimmed = s.trim();
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }

  function _sanitizeList(list, itemMax = 50) {
    if (!Array.isArray(list)) return [];
    return list.map(item => _sanitizeStr(item, itemMax)).filter(Boolean);
  }

  /**
   * 创建场景分席准备会话
   */
  function createSeatingSession(params = {}) {
    return {
      version: VERSION,
      sceneId: _sanitizeStr(params.sceneId || 'scene_0', 50),
      sceneTitle: _sanitizeStr(params.sceneTitle || 'Next Scene', 100),
      activeSeats: _sanitizeList(params.activeSeats || []),
      createdAt: Date.now()
    };
  }

  /**
   * 席位变更（入席/离席）
   */
  function updateSeats(session, activeSeats = []) {
    return {
      ...session,
      activeSeats: _sanitizeList(activeSeats)
    };
  }

  /**
   * 执行分席划分计算
   * materials: [{ materialId, summary, knownByCharacters: [...] }]
   */
  function partitionMaterialsForSeats(session, materials = []) {
    const seats = Array.isArray(session?.activeSeats) ? session.activeSeats : [];
    const seatSet = new Set(seats);
    const seatCount = seats.length;

    const result = {
      sceneId: session?.sceneId || 'unknown',
      activeSeats: seats,
      sharedPool: [],       // 全员知晓
      partialSubsets: [],   // 部分在席人知晓 (>=2 && < seatCount)
      privatePockets: {},   // 每个人各自的独享私密 { charId: [material] }
      embargoedSecrets: []  // 在席人无一知晓
    };

    seats.forEach(charId => {
      result.privatePockets[charId] = [];
    });

    if (seatCount === 0) {
      return result;
    }

    (Array.isArray(materials) ? materials : []).forEach(mat => {
      if (!mat || !mat.materialId) return;

      const knownBy = _sanitizeList(mat.knownByCharacters || []);
      const seatedKnown = knownBy.filter(c => seatSet.has(c));
      const kCount = seatedKnown.length;

      const matSummary = {
        materialId: _sanitizeStr(mat.materialId, 50),
        summary: _sanitizeStr(mat.summary || '', 300),
        knownBySeated: seatedKnown
      };

      if (kCount === 0) {
        // 在席角色全不知道
        result.embargoedSecrets.push({
          ...matSummary,
          visibility: MATERIAL_VISIBILITY.EMBARGOED
        });
      } else if (kCount === seatCount && seatCount > 1) {
        // 全员都知道且席位人数 > 1
        result.sharedPool.push({
          ...matSummary,
          visibility: MATERIAL_VISIBILITY.SHARED
        });
      } else if (kCount === 1) {
        // 只有一个人知道 -> 归入该角色的私密 Pocket
        const soleChar = seatedKnown[0];
        result.privatePockets[soleChar].push({
          ...matSummary,
          visibility: MATERIAL_VISIBILITY.PRIVATE
        });
      } else {
        // 部分人知道 (>= 2 且 < seatCount)
        result.partialSubsets.push({
          ...matSummary,
          visibility: MATERIAL_VISIBILITY.PARTIAL
        });
      }
    });

    return result;
  }

  /**
   * 构造为特定角色视角注入的上下文片段
   */
  function buildCharacterPerspectivePrompt(partitionResult, characterId) {
    if (!partitionResult || !characterId) return '';

    const shared = partitionResult.sharedPool || [];
    const privates = partitionResult.privatePockets[characterId] || [];
    const partials = (partitionResult.partialSubsets || []).filter(p => (p.knownBySeated || []).includes(characterId));

    let prompt = `=== Scene Context for ${characterId} ===\n`;

    if (shared.length > 0) {
      prompt += `[Public Knowledge (All Seated Characters Know)]:\n`;
      shared.forEach(m => {
        prompt += `- ${m.summary}\n`;
      });
    }

    if (partials.length > 0) {
      prompt += `[Semi-Private Knowledge (Shared with specific characters)]:\n`;
      partials.forEach(m => {
        prompt += `- ${m.summary} (Known also by: ${m.knownBySeated.filter(c => c !== characterId).join(', ')})\n`;
      });
    }

    if (privates.length > 0) {
      prompt += `[Strictly Private Knowledge (Only you know - DO NOT blur into public context without intentional monologue)]:\n`;
      privates.forEach(m => {
        prompt += `- ${m.summary}\n`;
      });
    }

    return prompt.trim();
  }

  function sceneSeatingPartitionSelfCheck() {
    return {
      version: VERSION,
      name: 'scene-character-seating-partition',
      status: 'ok'
    };
  }

  return {
    VERSION,
    MATERIAL_VISIBILITY,
    createSeatingSession,
    updateSeats,
    partitionMaterialsForSeats,
    buildCharacterPerspectivePrompt,
    sceneSeatingPartitionSelfCheck
  };
}));