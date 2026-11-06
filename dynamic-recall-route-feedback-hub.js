/* ============================================================
 * dynamic-recall-route-feedback-hub.js
 * 召回路线与质量反馈闭环中枢 (L10-O4)
 *
 * 核心机制：
 * 1. 六大召回路线偏好调度 (RECALL_ROUTES):
 *    - EXPERIENCE_CHAIN: 经历优先（因果事件链与动作脉络）
 *    - EVIDENCE_TRIANGULATION: 证据三角互证优先（公文/信物/证言）
 *    - RELATIONSHIP_TENSION: 关系动力优先（情感边界与心理安全）
 *    - PERSPECTIVE_PARALLAX: 角色视角视差优先（严格根据其知情面召回）
 *    - WORLD_LORE_ARCHIVE: 宏观世界观与时代印记优先
 *    - BALANCED_HYBRID: 默认平衡混合模式
 * 2. 同名角色/地点消歧策略 (DISAMBIGUATION_STRATEGIES):
 *    - CONTEXT_MODULE_MATCH: 依据所属模块/所属作品上下文消歧
 *    - NICKNAME_KEY_ISOLATION: 依据别名与绑定唯一标识符隔离
 *    - CHRONO_EPOCH_BOUND: 依据年代跨度 (如 17 岁 vs 27 岁) 隔离
 * 3. 用户反馈强化学习环路 (Feedback Loop):
 *    - 记录评分：HELPFUL (有效), IRRELEVANT (噪音), HALLUCINATION_INDUCING (诱导幻觉), MISSING_CONTEXT (遗漏关键)
 *    - 自适应调整局部路由偏好权重，绝不改写底层客观证据，保障系统无副作用。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaRecallRouteFeedbackHub = factory();
    root.DynamicRecallRouteFeedbackHub = root.LonShaRecallRouteFeedbackHub;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RECALL_ROUTES = Object.freeze({
    EXPERIENCE_CHAIN: 'EXPERIENCE_CHAIN',
    EVIDENCE_TRIANGULATION: 'EVIDENCE_TRIANGULATION',
    RELATIONSHIP_TENSION: 'RELATIONSHIP_TENSION',
    PERSPECTIVE_PARALLAX: 'PERSPECTIVE_PARALLAX',
    WORLD_LORE_ARCHIVE: 'WORLD_LORE_ARCHIVE',
    BALANCED_HYBRID: 'BALANCED_HYBRID'
  });

  var FEEDBACK_RATINGS = Object.freeze({
    HELPFUL: 'HELPFUL',
    IRRELEVANT: 'IRRELEVANT',
    HALLUCINATION_INDUCING: 'HALLUCINATION_INDUCING',
    MISSING_CONTEXT: 'MISSING_CONTEXT'
  });

  /**
   * 依据路由偏好与权重对召回候选条目进行重排序
   * @param {Array<Object>} candidates 候选记忆项列表
   * @param {string} route RECALL_ROUTES 之一
   * @param {Object} routeWeights 路由自适应权重表
   * @returns {Array<Object>} 重排后列表
   */
  function rankCandidatesByRoute(candidates, route, routeWeights) {
    var list = Array.isArray(candidates) ? candidates.slice() : [];
    var activeRoute = route || RECALL_ROUTES.BALANCED_HYBRID;
    var weights = routeWeights || {};

    return list.sort(function (a, b) {
      var scoreA = computeItemRouteScore(a, activeRoute, weights);
      var scoreB = computeItemRouteScore(b, activeRoute, weights);
      return scoreB - scoreA;
    });
  }

  function computeItemRouteScore(item, route, weights) {
    var base = Number(item.relevanceScore || item.score || 0.5);
    var boost = 1.0;
    var type = String(item.type || item.category || '').toUpperCase();

    if (route === RECALL_ROUTES.EXPERIENCE_CHAIN) {
      if (type.indexOf('EVENT') !== -1 || type.indexOf('ACTION') !== -1) boost = 1.5;
    } else if (route === RECALL_ROUTES.EVIDENCE_TRIANGULATION) {
      if (type.indexOf('EVIDENCE') !== -1 || type.indexOf('DOCUMENT') !== -1) boost = 1.6;
    } else if (route === RECALL_ROUTES.RELATIONSHIP_TENSION) {
      if (type.indexOf('RELATION') !== -1 || type.indexOf('EMOTION') !== -1) boost = 1.5;
    } else if (route === RECALL_ROUTES.PERSPECTIVE_PARALLAX) {
      if (item.perspectiveOwner || type.indexOf('PERSPECTIVE') !== -1) boost = 1.5;
    } else if (route === RECALL_ROUTES.WORLD_LORE_ARCHIVE) {
      if (type.indexOf('LORE') !== -1 || type.indexOf('WORLD') !== -1) boost = 1.4;
    }

    var routeModifier = weights[route] !== undefined ? weights[route] : 1.0;
    return base * boost * routeModifier;
  }

  /**
   * 同名消歧过滤器：防止同名异人、跨世界线串扰或不同时期跨模块串扰
   * @param {Array<Object>} candidates
   * @param {Object} contextOptions { targetModule, characterAge, cleanNickname, targetWorldline, excludeIds, temporaryExclusions }
   * @returns {Array<Object>}
   */
  function disambiguateEntities(candidates, contextOptions) {
    if (!Array.isArray(candidates)) return [];
    var opts = contextOptions || {};
    var excludedSet = {};
    if (Array.isArray(opts.excludeIds)) {
      for (var e = 0; e < opts.excludeIds.length; e++) excludedSet[opts.excludeIds[e]] = true;
    }
    if (Array.isArray(opts.temporaryExclusions)) {
      for (var t = 0; t < opts.temporaryExclusions.length; t++) excludedSet[opts.temporaryExclusions[t]] = true;
    }

    // [v3.450.0 · L15-O2] 检索消歧的人际图谱动态加权计算
    var graphEdges = Array.isArray(opts.graphEdges) ? opts.graphEdges : [];
    var speaker = opts.currentSpeaker ? String(opts.currentSpeaker).trim().toLowerCase() : null;

    var filtered = candidates.filter(function (it) {
      if (!it) return false;
      // 0. 一次性排除或显式指定排除
      if (it.id && excludedSet[it.id]) return false;
      // 1. 所属模块过滤
      if (opts.targetModule && it.moduleName) {
        if (it.moduleName !== opts.targetModule && !it.isSharedCrossModule) {
          return false;
        }
      }
      // 2. 年龄/版本隔离 (例如 17 岁县城版 vs 27 岁十年后版)
      if (opts.characterAge !== undefined && it.characterAge !== undefined) {
        if (Math.abs(Number(opts.characterAge) - Number(it.characterAge)) > 5) {
          return false;
        }
      }
      // 3. 干净昵称严格匹配 (如 萧太太 vs 萧忆柔)
      if (opts.cleanNickname && it.cleanNickname) {
        if (opts.cleanNickname !== it.cleanNickname) {
          return false;
        }
      }
      // 4. 世界线/平行分支隔离 (同名两人分属不同世界线时不串命中)
      if (opts.targetWorldline !== undefined && it.worldline !== undefined) {
        if (String(opts.targetWorldline) !== String(it.worldline) && !it.isUniversalWorldline) {
          return false;
        }
      }
      return true;
    });

    if (speaker && graphEdges.length > 0) {
      // 提取与 speaker 有关的直接关系网络与亲密权重
      var affinityMap = {};
      for (var gi = 0; gi < graphEdges.length; gi++) {
        var edge = graphEdges[gi];
        if (!edge) continue;
        var s = String(edge.source || edge.from || '').toLowerCase();
        var t = String(edge.target || edge.to || '').toLowerCase();
        var w = Number(edge.weight || edge.intimacy || edge.closeness || 1.0);
        if (s === speaker && t) {
          affinityMap[t] = Math.max(affinityMap[t] || 0, w);
        } else if (t === speaker && s) {
          affinityMap[s] = Math.max(affinityMap[s] || 0, w);
        }
      }

      // 对过滤后的条目根据与当前主谈角色的人际亲密动态增权
      filtered.forEach(function (it) {
        var charName = String(it.character || it.characterName || it.entity || it.source || '').toLowerCase();
        var affinity = affinityMap[charName];
        if (affinity !== undefined && affinity > 0) {
          it.graphAffinityBoost = Number((1.0 + Math.min(1.0, affinity * 0.2)).toFixed(2));
          var oldScore = Number(it.relevanceScore || it.score || 0.5);
          it.relevanceScore = Number((oldScore * it.graphAffinityBoost).toFixed(3));
          it.graphDisambiguationReason = '人际图谱强关联加成 x' + it.graphAffinityBoost;
        }
      });
    }

    return filtered;
  }

  /**
   * 提交用户质量反馈并自适应调校路由偏好
   * @param {Object} feedbackState 当前路由偏好状态 { weights: {} }
   * @param {string} route 所评测的路线
   * @param {string} rating FEEDBACK_RATINGS
   * @returns {Object} 更新后的权重状态
   */
  function recordFeedbackAndAdjust(feedbackState, route, rating) {
    var state = feedbackState || { weights: {} };
    if (!state.weights) state.weights = {};
    var currWeight = state.weights[route] !== undefined ? state.weights[route] : 1.0;

    if (rating === FEEDBACK_RATINGS.HELPFUL) {
      currWeight = Math.min(2.5, currWeight + 0.15);
    } else if (rating === FEEDBACK_RATINGS.IRRELEVANT) {
      currWeight = Math.max(0.3, currWeight - 0.1);
    } else if (rating === FEEDBACK_RATINGS.HALLUCINATION_INDUCING) {
      currWeight = Math.max(0.1, currWeight - 0.3);
    } else if (rating === FEEDBACK_RATINGS.MISSING_CONTEXT) {
      currWeight = Math.min(2.5, currWeight + 0.2);
    }

    state.weights[route] = Number(currWeight.toFixed(2));
    if (!state.history) state.history = [];
    state.history.push({
      timestamp: Date.now(),
      route: route,
      rating: rating,
      newWeight: state.weights[route]
    });

    return state;
  }

  /**
   * 创建偏好状态快照以支持回退与隔离
   * @param {Object} feedbackState
   * @returns {Object} 独立深拷贝的偏好快照
   */
  function snapshotFeedbackState(feedbackState) {
    if (!feedbackState) return { weights: {}, history: [] };
    var copyWeights = {};
    if (feedbackState.weights) {
      for (var k in feedbackState.weights) {
        if (Object.prototype.hasOwnProperty.call(feedbackState.weights, k)) {
          copyWeights[k] = feedbackState.weights[k];
        }
      }
    }
    var copyHistory = [];
    if (Array.isArray(feedbackState.history)) {
      for (var i = 0; i < feedbackState.history.length; i++) {
        var h = feedbackState.history[i];
        copyHistory.push({
          timestamp: h.timestamp,
          route: h.route,
          rating: h.rating,
          newWeight: h.newWeight
        });
      }
    }
    return {
      weights: copyWeights,
      history: copyHistory
    };
  }

  /**
   * 应用单次临时偏好微调（不修改持久化偏好状态，支持回退原排序）
   * @param {Object} baseState 基础全局状态
   * @param {Object} transientOverrides 单次临时权重覆盖或一次性排除
   * @returns {Object} 仅供本轮查询使用的临时状态对象
   */
  function applyTransientRouteOverrides(baseState, transientOverrides) {
    var snap = snapshotFeedbackState(baseState);
    if (!transientOverrides) return snap;
    if (transientOverrides.weights) {
      for (var r in transientOverrides.weights) {
        if (Object.prototype.hasOwnProperty.call(transientOverrides.weights, r)) {
          snap.weights[r] = transientOverrides.weights[r];
        }
      }
    }
    if (transientOverrides.routeBoost && transientOverrides.route) {
      var w = snap.weights[transientOverrides.route] !== undefined ? snap.weights[transientOverrides.route] : 1.0;
      snap.weights[transientOverrides.route] = Number((w * Number(transientOverrides.routeBoost)).toFixed(2));
    }
    snap.isTransient = true;
    return snap;
  }

  /**
   * 生成召回条目的命中与消歧解释
   * @param {Object} item 召回候选条目
   * @param {string} activeRoute 当前路由
   * @param {Object} weights 当前偏好权重
   * @param {Object} contextOptions 消歧选项
   * @returns {Object} 解释详情 { hitReason, disambiguationPassed, scoreBreakdown }
   */
  function explainRecallHit(item, activeRoute, weights, contextOptions) {
    if (!item) return { hitReason: 'none', disambiguationPassed: false };
    var opts = contextOptions || {};
    var type = String(item.type || item.category || 'UNKNOWN').toUpperCase();
    var route = activeRoute || RECALL_ROUTES.BALANCED_HYBRID;
    var baseScore = Number(item.relevanceScore || item.score || 0.5);
    var routeMod = (weights && weights[route] !== undefined) ? weights[route] : 1.0;

    var matchedWorldline = true;
    if (opts.targetWorldline !== undefined && item.worldline !== undefined) {
      matchedWorldline = (String(opts.targetWorldline) === String(item.worldline) || !!item.isUniversalWorldline);
    }
    var isAgeMatched = true;
    if (opts.characterAge !== undefined && item.characterAge !== undefined) {
      isAgeMatched = Math.abs(Number(opts.characterAge) - Number(item.characterAge)) <= 5;
    }

    return {
      itemId: item.id,
      title: item.title || item.name || '',
      type: type,
      activeRoute: route,
      routeWeight: routeMod,
      baseScore: baseScore,
      finalScore: computeItemRouteScore(item, route, weights || {}),
      worldline: item.worldline || 'main',
      disambiguation: {
        passed: matchedWorldline && isAgeMatched,
        matchedWorldline: matchedWorldline,
        matchedAge: isAgeMatched,
        cleanNickname: item.cleanNickname || null
      },
      reason: '匹配路由 [' + route + ']，基础分 ' + baseScore + '，权重系数 ' + routeMod
    };
  }

  function recallRouteFeedbackHubSelfCheck(hub) {
    if (!hub) return { ok: false, reason: 'module-absent' };
    const routesOk = !!(hub.RECALL_ROUTES && hub.RECALL_ROUTES.BALANCED_HYBRID);
    const disambiguateOk = typeof hub.disambiguateEntities === 'function';
    const snapshotOk = typeof hub.snapshotFeedbackState === 'function';
    const transientOk = typeof hub.applyTransientRouteOverrides === 'function';
    const explainOk = typeof hub.explainRecallHit === 'function';
    return {
      ok: routesOk && disambiguateOk && snapshotOk && transientOk && explainOk,
      routesOk,
      disambiguateOk,
      snapshotOk,
      transientOk,
      explainOk
    };
  }

  return {
    RECALL_ROUTES: RECALL_ROUTES,
    FEEDBACK_RATINGS: FEEDBACK_RATINGS,
    rankCandidatesByRoute: rankCandidatesByRoute,
    disambiguateEntities: disambiguateEntities,
    recordFeedbackAndAdjust: recordFeedbackAndAdjust,
    snapshotFeedbackState: snapshotFeedbackState,
    applyTransientRouteOverrides: applyTransientRouteOverrides,
    explainRecallHit: explainRecallHit,
    recallRouteFeedbackHubSelfCheck: recallRouteFeedbackHubSelfCheck
  };
});