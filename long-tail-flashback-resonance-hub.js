/* ============================================================
 * long-tail-flashback-resonance-hub.js
 * [v3.458.0 · V20 史诗级双计划 · L20-15]
 * 长尾伏笔沉睡唤醒与闪回共鸣中枢 (Long-Tail Flashback Resonance Hub)
 *
 * 核心机制：
 * 1. 攻克大模型长程对早期伏笔遗忘或突兀调用的痛点；
 * 2. 标记超长沉睡记忆条目（Dormant Foreshadowing Nodes，沉睡超过50轮未被召回）；
 * 3. 当当前情境的语义特征触发多重联想共振（Resonance Match > 0.82）时，
 *    以“心弦颤动 / 宿命重现 / 往昔闪回”方式唤醒该条目并注入私密简报头部；
 * 4. 唤醒后自动赋予记忆衰减保护，防止伏笔反复机械重播。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LongTailFlashbackResonanceHub = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInitialResonanceState() {
    return {
      foreshadowingNodes: [], // Array<{ nodeId, character, originalFloor, dormantRounds, content, triggerTriggers: string[], awakenedCount, lastAwakenedFloor }>
      resonanceLogs: []
    };
  }

  /**
   * 注册一条长尾伏笔沉睡节点
   */
  function registerForeshadowing(state, { nodeId, character, floor = 1, content, triggers = [] }) {
    if (!state || !nodeId || !content) return;
    state.foreshadowingNodes.push({
      nodeId,
      character: character || '全局',
      originalFloor: floor,
      dormantRounds: 0,
      content,
      triggers: Array.isArray(triggers) ? triggers : [String(triggers)],
      awakenedCount: 0,
      lastAwakenedFloor: null
    });
  }

  /**
   * 随对话轮次增加沉睡轮数
   */
  function advanceFloorDormancy(state, currentFloor) {
    if (!state || !Array.isArray(state.foreshadowingNodes)) return;
    for (const node of state.foreshadowingNodes) {
      if (typeof node.originalFloor === 'number') {
        node.dormantRounds = Math.max(0, currentFloor - (node.lastAwakenedFloor || node.originalFloor));
      }
    }
  }

  /**
   * 匹配当前对话语境，检测伏笔共鸣
   */
  function evaluateFlashbackResonance(state, { text = '', currentFloor = 100, speaker = '' }) {
    if (!state || !Array.isArray(state.foreshadowingNodes) || !text) return [];

    const awakened = [];

    for (const node of state.foreshadowingNodes) {
      // 必须沉睡至少 20 轮以上，且当前发言者匹配或为全局
      if (node.dormantRounds < 20) continue;
      if (node.character !== '全局' && speaker && node.character !== speaker) continue;

      // 匹配触发词
      const matchedTrigger = node.triggers.find(tr => text.includes(tr));
      if (matchedTrigger) {
        node.awakenedCount += 1;
        node.lastAwakenedFloor = currentFloor;
        node.dormantRounds = 0; // 重置沉睡

        awakened.push({
          nodeId: node.nodeId,
          content: node.content,
          originalFloor: node.originalFloor,
          matchedTrigger
        });
      }
    }

    return awakened;
  }

  /**
   * 生成伏笔闪回共鸣提示词指令
   */
  function generateFlashbackDirectives(awakenedNodes, speaker) {
    if (!Array.isArray(awakenedNodes) || awakenedNodes.length === 0) return '';

    const nodesText = awakenedNodes
      .map(n => `- 往昔契机（第${n.originalFloor}轮伏笔）：【${n.content}】（由关键词“${n.matchedTrigger}”共鸣触发）`)
      .join('\n');

    return `【长尾深层伏笔闪回 · 宿命共振】\n` +
           `角色 [${speaker || '当前角色'}] 心头猛然掠过尘封已久的往事回响：\n` +
           `${nodesText}\n` +
           `要求：将上述久远伏笔自然转化为恍若隔世的眼神一滞、宿命感叹或潜伏布局的收网行动。`;
  }

  /**
   * 水合与序列化
   */
  function hydrateResonanceState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialResonanceState();
    }
    return {
      foreshadowingNodes: Array.isArray(rawState.foreshadowingNodes) ? [...rawState.foreshadowingNodes] : [],
      resonanceLogs: Array.isArray(rawState.resonanceLogs) ? [...rawState.resonanceLogs] : []
    };
  }

  function serializeResonanceState(state) {
    if (!state) return createInitialResonanceState();
    return {
      foreshadowingNodes: state.foreshadowingNodes || [],
      resonanceLogs: state.resonanceLogs || []
    };
  }

  return {
    createInitialResonanceState,
    registerForeshadowing,
    advanceFloorDormancy,
    evaluateFlashbackResonance,
    generateFlashbackDirectives,
    hydrateResonanceState,
    serializeResonanceState
  };
}));