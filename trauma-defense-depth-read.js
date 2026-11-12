/* L21-X4: trauma defense depth read — 创伤防线「退避程度」可读分档 [v3.465.6]
 * 底座：trauma-taboo-defense-matrix.js（LonShaTraumaTabooMatrix，三层：礼貌推脱/戒备/应激）。
 * 现有引擎没有任何读面能回答「这一句是第几层」——本模块把三层映射为可读分档：
 *   deflect   —— 浅层礼貌推脱（tier 1）
 *   guard     —— 中层戒备（tier 2）
 *   flashback —— 深层应激/闪回（tier 3）
 *   undecided —— 判不了时不许猜层（诚实分档，绝不并入 deflect）
 * 每档必须带触发依据（关键词命中/压力读数/降温中）。
 * 挂载：LonShaTraumaDefenseDepthRead / CJS / AMD */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) define([], factory);
  else if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LonShaTraumaDefenseDepthRead = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '3.465.6';
  const LEVELS = Object.freeze({ DEFLECT: 'deflect', GUARD: 'guard', FLASHBACK: 'flashback', UNDECIDED: 'undecided' });
  const TIER_TO_LEVEL = Object.freeze({ 1: 'deflect', 2: 'guard', 3: 'flashback' });

  const textOf = x => String(x == null ? '' : x).trim();

  /**
   * 读面主函数：对当前这句话给出防线分档与依据。**只读不改**引擎状态。
   * @param {Object} state  trauma-taboo-defense-matrix 的状态（taboos/globalTraumaLevel/lastTriggeredTaboo）
   * @param {string} text   当前这句话
   * @returns {{level, topic, evidence, pressure, note}}
   *   level ∈ deflect/guard/flashback/undecided；evidence 是可读触发依据。
   */
  function readDepth(state, text) {
    const s = textOf(text).toLowerCase();
    const out = { level: LEVELS.UNDECIDED, topic: '', evidence: '', pressure: null, note: '' };

    // ① 先看这句话有没有真踩到某个禁忌的关键词
    const taboos = (state && Array.isArray(state.taboos)) ? state.taboos : [];
    const hit = taboos.find(t => (t.keywords || []).some(k => s.includes(String(k).toLowerCase())));
    if (hit) {
      out.topic = textOf(hit.topic);
      out.pressure = Number(hit.currentPressure) || 0;
      const tier = Number(hit.defenseTier);
      if (TIER_TO_LEVEL[tier]) {
        out.level = TIER_TO_LEVEL[tier];
        out.evidence = '这句话提到「' + hit.topic + '」相关内容（命中关键词），当前压力读数 ' + out.pressure.toFixed(2) + '，处于第 ' + tier + ' 层防线';
      } else {
        // tier 值异常（不在 1/2/3）⇒ 判不了就不许猜
        out.level = LEVELS.UNDECIDED;
        out.evidence = '命中了「' + hit.topic + '」但防线层数读数异常（' + tier + '），无法判断层';
      }
      return out;
    }

    // ② 没踩到：看引擎刚记录的触发余波（lastTriggeredTaboo）——只作"余波"说明，不给层级
    const last = state && state.lastTriggeredTaboo;
    if (last && last.topic) {
      out.topic = textOf(last.topic);
      out.evidence = '这句话没踩到禁忌，但「' + last.topic + '」的余波还在（上一轮触发过），防线正在回落';
      out.level = LEVELS.UNDECIDED;
      out.note = '余波不等于当前层，不给层';
      return out;
    }

    // ③ 什么都没有 ⇒ undecided，明说无法判断
    out.evidence = '这句话没有命中任何禁忌关键词，也没有近期触发的余波可依';
    out.note = '无法判断';
    return out;
  }

  /* 面板读面：心境面板「🛡️ 心理戒备区」的当前分档与依据（无黑话） */
  function formatPanel(verdict) {
    if (!verdict) return '';
    const cn = { deflect: '浅层礼貌推脱', guard: '中层戒备', flashback: '深层应激', undecided: '无法判断' };
    return '🛡️ 当前防线：' + (cn[verdict.level] || verdict.level) + (verdict.topic ? '（话题：' + verdict.topic + '）' : '') + '\n' + verdict.evidence;
  }

  return { VERSION, LEVELS, TIER_TO_LEVEL, readDepth, formatPanel };
}));