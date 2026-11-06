/* ============================================================
 * dream-subconscious-metaphor-synthesizer.js
 * [v3.458.0 · V20 史诗级双计划 · L20-10]
 * 梦境解析与潜意识超现实隐喻合成器 (Dream Subconscious Metaphor Synthesizer)
 *
 * 核心机制：
 * 1. 当角色处于深度睡眠、昏迷、重伤晕厥或深夜独处冥想状态时触发潜意识解构；
 * 2. 扫描当日前台积累的未决压力源（特工暴露破绽、深层创伤敏感、契约反噬压迫等）；
 * 3. 通过象征性隐喻矩阵将冷酷事实转化为超现实主义潜意识梦境副文本（如枯萎的圣剑、深水巨蟒、滴血怀表）；
 * 4. 在次日清晨唤醒或心理直觉闪回时，注入高质感潜意识回响指令，严禁直接全知剧透客观事实。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DreamSubconsciousMetaphorSynthesizer = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 象征性隐喻符号映射库 (抽象心理意象)
   */
  const METAPHOR_SYMBOLS = {
    betrayal: ['断裂的黑木十字架', '背后无声合拢的青铜锁链', '结冰的毒酒'],
    guilt: ['洗不净的暗红锈迹', '自深井深处直视的无数双盲眼', '坠落不停的镜之碎片'],
    anxiety: ['倒流的黑沙漏', '在胸口跳动的发条巨轮', '逐渐收窄的长廊与无声关门'],
    longing: ['迷雾中燃烧的灯塔', '指缝间流逝的冷白飞雪', '无法拼合的瓷鸟']
  };

  /**
   * 创建初始梦境与潜意识状态
   */
  function createInitialDreamState() {
    return {
      activeDreams: [], // Array<{ dreamId, character, theme, metaphorText, triggeredBy, createdAt, echoed }>
      subconsciousUndercurrents: {}, // character -> Array<{ symbol, intensity, hint }>
      lastSleepCycle: null
    };
  }

  /**
   * 合成潜意识梦境意象
   */
  function synthesizeDream({ character, traumaKeywords = [], stressLevel = 0, exposureRisk = 0, isSleeping = true }) {
    if (!character || !isSleeping) return null;

    let theme = 'anxiety';
    if (exposureRisk > 0.6) {
      theme = 'betrayal';
    } else if (stressLevel > 70) {
      theme = 'guilt';
    } else if (traumaKeywords.length > 0) {
      theme = 'longing';
    }

    const symbols = METAPHOR_SYMBOLS[theme] || METAPHOR_SYMBOLS.anxiety;
    const selectedSymbol = symbols[Math.floor(Math.random() * symbols.length)] || symbols[0];

    const metaphorText = `角色 [${character}] 在深层意识界域坠入混沌幻梦：周遭浮现【${selectedSymbol}】。白昼被压抑的警觉或痛苦被超现实折射，隐约感知到命运指针的危险异动。`;

    return {
      dreamId: 'dream_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      character,
      theme,
      symbol: selectedSymbol,
      metaphorText,
      stressLevel,
      echoed: false,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 生成梦境回响提示词指令 (用于晨起、恍惚或神游状态)
   */
  function generateDreamEchoDirective({ dreamState, speaker, isAwakening = false }) {
    if (!dreamState || !dreamState.activeDreams || !speaker) return '';

    const pendingDream = dreamState.activeDreams.find(d => d.character === speaker && !d.echoed);
    if (!pendingDream) return '';

    // 标记为已折射
    pendingDream.echoed = true;

    return `【潜意识梦境余波折射 · 直觉隐喻】\n` +
           `角色 [${speaker}] 脑海中残存着昨夜荒诞梦魇的心理回响（意象：${pendingDream.symbol}）。\n` +
           `要求：发话时允许带有一丝晨起恍惚、莫名心悸或对特定细节的不祥预感，严禁将其作为全知情报直接说出，仅作为情绪潜流或动作微沉重表现。`;
  }

  /**
   * 序列化/反序列化水合
   */
  function hydrateDreamState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialDreamState();
    }
    return {
      activeDreams: Array.isArray(rawState.activeDreams) ? [...rawState.activeDreams] : [],
      subconsciousUndercurrents: rawState.subconsciousUndercurrents ? { ...rawState.subconsciousUndercurrents } : {},
      lastSleepCycle: rawState.lastSleepCycle || null
    };
  }

  function serializeDreamState(state) {
    if (!state) return createInitialDreamState();
    return {
      activeDreams: state.activeDreams || [],
      subconsciousUndercurrents: state.subconsciousUndercurrents || {},
      lastSleepCycle: state.lastSleepCycle
    };
  }

  return {
    createInitialDreamState,
    synthesizeDream,
    generateDreamEchoDirective,
    hydrateDreamState,
    serializeDreamState
  };
}));
