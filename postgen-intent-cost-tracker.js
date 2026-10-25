/* ============================================================
 * postgen-intent-cost-tracker.js
 * 生成后意图提取与计算代价追踪器 (L10-O6)
 *
 * 核心机制：
 * 1. 意图类型鉴别与价值评级 (INTENT_TYPES):
 *    - PLEDGE_COMMITMENT: 誓约或未来行动承诺 (高认知价值，必须落盘为追踪项)
 *    - FACTUAL_REVELATION: 揭晓客观事实或隐秘 (高认知价值，转入生命周期矩阵)
 *    - EMOTIONAL_DISCLOSURE: 情感袒露或关系突破 (中认知价值，转入边界动力学)
 *    - CHAT_FILLER: 客套问候或口头禅 (低认知价值，直接过滤阻断落盘)
 * 2. 伴随式计算开销追踪 (COMPUTATION_COST):
 *    - 记录单次提取的耗时、Token 输入输出、提取算法模式 (轻量启发式 vs 深度模型)；
 *    - 产出高性价比认知回报率 (Cognitive Return on Compute ROI)。
 * 3. 结构化持久化提议生成 (Persistence Proposal):
 *    - 自动为高价值项附带原始依据、发言人、目标对象与置信度。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaIntentCostTracker = factory();
    root.PostgenIntentCostTracker = root.LonShaIntentCostTracker;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var INTENT_TYPES = Object.freeze({
    PLEDGE_COMMITMENT: 'PLEDGE_COMMITMENT',
    FACTUAL_REVELATION: 'FACTUAL_REVELATION',
    EMOTIONAL_DISCLOSURE: 'EMOTIONAL_DISCLOSURE',
    CHAT_FILLER: 'CHAT_FILLER'
  });

  /**
   * 分析生成文本中的关键意图并评估其认知入库价值
   * @param {string} text 生成的回复文本
   * @param {Object} context { speaker, target, floor }
   * @returns {Array<Object>} 提议列表
   */
  function extractIntentProposals(text, context) {
    if (!text) return [];
    var str = String(text);
    var ctx = context || {};
    var proposals = [];

    // 1. 检测誓约/承诺
    var pledgePatterns = [
      /我(一定|保证|答应|发誓|会).{1,30}(做|去|还|来|陪)/,
      /从明天起.{1,20}/,
      /等.{1,10}之后，我/
    ];
    for (var i = 0; i < pledgePatterns.length; i++) {
      var m = str.match(pledgePatterns[i]);
      if (m) {
        proposals.push({
          type: INTENT_TYPES.PLEDGE_COMMITMENT,
          valueRating: 'HIGH',
          statement: m[0],
          speaker: ctx.speaker || 'assistant',
          target: ctx.target || 'user',
          floor: ctx.floor || 0,
          confidence: 0.9
        });
        break;
      }
    }

    // 2. 检测隐秘揭晓/客观事实认定
    var factPatterns = [
      /其实我是.{1,20}/,
      /真正的秘密是.{1,30}/,
      /原来当年.{1,30}/
    ];
    for (var j = 0; j < factPatterns.length; j++) {
      var mf = str.match(factPatterns[j]);
      if (mf) {
        proposals.push({
          type: INTENT_TYPES.FACTUAL_REVELATION,
          valueRating: 'HIGH',
          statement: mf[0],
          speaker: ctx.speaker || 'assistant',
          target: ctx.target || 'user',
          floor: ctx.floor || 0,
          confidence: 0.85
        });
        break;
      }
    }

    // 3. 检测情感袒露
    var emotionPatterns = [
      /我一直很(害怕|在乎|讨厌|喜欢|感激)你/,
      /只有在你面前，我才/
    ];
    for (var k = 0; k < emotionPatterns.length; k++) {
      var me = str.match(emotionPatterns[k]);
      if (me) {
        proposals.push({
          type: INTENT_TYPES.EMOTIONAL_DISCLOSURE,
          valueRating: 'MEDIUM',
          statement: me[0],
          speaker: ctx.speaker || 'assistant',
          target: ctx.target || 'user',
          floor: ctx.floor || 0,
          confidence: 0.8
        });
        break;
      }
    }

    // 若无任何高/中价值项且文本较短或纯寒暄
    if (proposals.length === 0) {
      proposals.push({
        type: INTENT_TYPES.CHAT_FILLER,
        valueRating: 'LOW',
        statement: str.length > 20 ? str.slice(0, 20) + '...' : str,
        speaker: ctx.speaker || 'assistant',
        floor: ctx.floor || 0,
        confidence: 0.3
      });
    }

    return proposals;
  }

  /**
   * 记录并度量单次提取调度的计算代价
   * @param {Object} metrics { elapsedMs, tokensProcessed, mode }
   * @param {Array<Object>} proposals
   * @returns {Object} 代价追踪审计单
   */
  function trackExtractionCost(metrics, proposals) {
    var met = metrics || {};
    var list = Array.isArray(proposals) ? proposals : [];
    var highValueCount = list.filter(function (p) { return p.valueRating === 'HIGH'; }).length;
    var mediumValueCount = list.filter(function (p) { return p.valueRating === 'MEDIUM'; }).length;

    var totalCostScore = (Number(met.elapsedMs || 0) * 0.1) + (Number(met.tokensProcessed || 0) * 0.05);
    var cognitiveYield = (highValueCount * 10) + (mediumValueCount * 4);
    var roi = totalCostScore > 0 ? Number((cognitiveYield / totalCostScore).toFixed(2)) : cognitiveYield;

    return {
      timestamp: Date.now(),
      elapsedMs: Number(met.elapsedMs || 0),
      tokensProcessed: Number(met.tokensProcessed || 0),
      mode: met.mode || 'heuristic-regex',
      totalCostScore: Number(totalCostScore.toFixed(2)),
      highValueProposals: highValueCount,
      mediumValueProposals: mediumValueCount,
      roi: roi,
      proposals: list
    };
  }

  return {
    INTENT_TYPES: INTENT_TYPES,
    extractIntentProposals: extractIntentProposals,
    trackExtractionCost: trackExtractionCost
  };
});