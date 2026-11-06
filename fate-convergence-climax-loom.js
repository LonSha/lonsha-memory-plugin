/* ============================================================
 * fate-convergence-climax-loom.js
 * [v3.458.0 · V20 史诗级双计划 · L20-18]
 * 命运交汇纺织机与叙事高潮熵中枢 (Fate Convergence Climax Loom)
 *
 * 核心机制：
 * 1. 攻克长程叙事容易陷入平庸日常、多线发散不收束或情节停滞疲劳的顽疾；
 * 2. 编织与追踪多角色的未决剧情线索与命运线（Loom Threads: tension 0..100）；
 * 3. 度量全局戏剧张力熵（Global Narrative Tension Entropy），当张力积累达临界阈值（>= 85）
 *    或线索发散超标时，在交响流水线中强力触发“命运奇点收束与戏剧高潮爆发”指令，
 *    驱动所有在场角色在剧情高潮节点正面碰撞交锋，彻底打破剧情僵局。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.FateConvergenceClimaxLoom = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInitialLoomState() {
    return {
      threads: [], // Array<{ threadId, title, tensionLevel: 0..100, involvesCharacters: string[], status: 'OPEN'|'RESOLVING'|'CONVERGED' }>
      globalTensionEntropy: 45, // 0..100 全局戏剧张力熵
      climaxTriggered: false
    };
  }

  /**
   * 注册一条命运编织线
   */
  function registerLoomThread(state, { threadId, title, tensionLevel = 50, involvesCharacters = [] }) {
    if (!state || !threadId || !title) return;
    state.threads.push({
      threadId,
      title,
      tensionLevel: Math.max(0, Math.min(100, tensionLevel)),
      involvesCharacters: Array.isArray(involvesCharacters) ? involvesCharacters : [String(involvesCharacters)],
      status: 'OPEN'
    });
    recomputeGlobalEntropy(state);
  }

  /**
   * 重新计算全局戏剧张力熵
   */
  function recomputeGlobalEntropy(state) {
    if (!state || state.threads.length === 0) {
      state.globalTensionEntropy = 30;
      return;
    }
    const openThreads = state.threads.filter(t => t.status === 'OPEN');
    if (openThreads.length === 0) {
      state.globalTensionEntropy = 20;
      return;
    }
    const avgTension = openThreads.reduce((sum, t) => sum + t.tensionLevel, 0) / openThreads.length;
    // 线索越多，张力熵适当乘数上浮
    const countBonus = Math.min(25, openThreads.length * 5);
    state.globalTensionEntropy = Math.min(100, Math.round(avgTension + countBonus));
  }

  /**
   * 评估并触发命运交汇与高潮收束指令
   */
  function evaluateClimaxConvergence(state, { speaker, presentCharacters = [] }) {
    if (!state || !speaker) return '';

    recomputeGlobalEntropy(state);

    if (state.globalTensionEntropy >= 80) {
      const relatedThreads = state.threads.filter(t => t.status === 'OPEN' && (t.involvesCharacters.includes(speaker) || t.involvesCharacters.some(c => presentCharacters.includes(c))));
      const threadTitles = relatedThreads.length > 0
        ? relatedThreads.map(t => `【${t.title}】`).join('、')
        : '多股隐匿暗流';

      return `【命运奇点交汇 · 全局戏剧高潮爆发】\n` +
             `当前故事的叙事戏剧张力熵已攀升至顶点（${state.globalTensionEntropy}/100），悬而未决的伏线（${threadTitles}）在此刻形成命运闭环合流！\n` +
             `要求：打破一切平庸周旋与日常琐碎，让矛盾激化至最高峰。要求在场角色正面交锋对质，迫使关键真相撕开或决裂对决爆发！`;
    }

    return '';
  }

  /**
   * 水合与序列化
   */
  function hydrateLoomState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialLoomState();
    }
    return {
      threads: Array.isArray(rawState.threads) ? [...rawState.threads] : [],
      globalTensionEntropy: typeof rawState.globalTensionEntropy === 'number' ? rawState.globalTensionEntropy : 45,
      climaxTriggered: !!rawState.climaxTriggered
    };
  }

  function serializeLoomState(state) {
    if (!state) return createInitialLoomState();
    return {
      threads: state.threads || [],
      globalTensionEntropy: state.globalTensionEntropy || 45,
      climaxTriggered: !!state.climaxTriggered
    };
  }

  return {
    createInitialLoomState,
    registerLoomThread,
    recomputeGlobalEntropy,
    evaluateClimaxConvergence,
    hydrateLoomState,
    serializeLoomState
  };
}));