/* ============================================================
 * conflict-group-arbitration-workbench.js
 * 证据冲突成组裁决与多维仲裁工作台 (L10-O2)
 *
 * 核心机制：
 * 1. 证据束聚类：按 subject::predicate 聚合矛盾事实，标记冲突候选并分析信源；
 * 2. 多维法定裁决：
 *    - ADOPT: 采纳正典事实，其余标记为 superseded 并保留追溯链；
 *    - JUXTAPOSE: 并列多重视角 (如表象 vs 真相，或不同角色的不同主观认知)；
 *    - PENDING: 存疑搁置，等待后续更有力证据，阻断高置信直接注入；
 *    - REVOKE: 全面推翻，所有候选事实均作废。
 * 3. 可逆回滚 (undoAdjudication)：恢复裁决前状态，消除误操作；
 * 4. 影响回放 (impactAnalysis)：预测裁决会改变哪些召回路径与下游上下文；
 * 5. 提示词注入格式化：输出格式严整的认知仲裁说明。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaConflictArbitration = factory();
    root.ConflictGroupArbitrationWorkbench = root.LonShaConflictArbitration;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERDICTS = Object.freeze({
    ADOPT: 'ADOPT',
    JUXTAPOSE: 'JUXTAPOSE',
    PENDING: 'PENDING',
    REVOKE: 'REVOKE'
  });

  /**
   * 将事实聚类为证据束并检测冲突
   * @param {Array<Object>} facts
   * @returns {Array<Object>}
   */
  function clusterEvidenceBundles(facts) {
    if (!Array.isArray(facts)) return [];
    var map = {};

    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      if (!f || !f.id) continue;
      var sub = String(f.subject || '').trim();
      var pred = String(f.predicate || '').trim();
      var key = sub + '::' + pred;

      if (!map[key]) {
        map[key] = {
          bundleKey: key,
          subject: sub,
          predicate: pred,
          candidates: [],
          distinctValues: {},
          isConflicting: false
        };
      }
      map[key].candidates.push(f);
      var val = String(f.object !== undefined ? f.object : (f.value !== undefined ? f.value : '')).trim();
      map[key].distinctValues[val] = (map[key].distinctValues[val] || 0) + 1;
    }

    var result = [];
    var keys = Object.keys(map);
    for (var k = 0; k < keys.length; k++) {
      var bundle = map[keys[k]];
      var valKeys = Object.keys(bundle.distinctValues);
      bundle.isConflicting = valKeys.length > 1;
      bundle.candidateCount = bundle.candidates.length;
      result.push(bundle);
    }
    return result;
  }

  /**
   * 执行法定裁决
   * @param {Object} bundle 证据束
   * @param {string} verdict VERDICTS 之一
   * @param {Object} payload 附带信息 { selectedId, reason, operator, timestamp }
   * @returns {Object} 裁决记录
   */
  function executeArbitration(bundle, verdict, payload) {
    if (!bundle || !Array.isArray(bundle.candidates) || bundle.candidates.length === 0) {
      throw new Error('Invalid bundle: candidates required');
    }
    var v = String(verdict || '').toUpperCase();
    if (!VERDICTS[v]) {
      throw new Error('Unsupported verdict: ' + verdict);
    }
    var info = payload || {};
    var record = {
      bundleKey: bundle.bundleKey,
      verdict: v,
      operator: info.operator || 'system',
      reason: info.reason || 'manual adjudication',
      timestamp: info.timestamp || Date.now(),
      previousState: bundle.candidates.map(function (c) {
        return { id: c.id, state: c.state || 'active', isSuperseded: !!c.isSuperseded };
      }),
      results: []
    };

    if (v === VERDICTS.ADOPT) {
      if (!info.selectedId) {
        throw new Error('selectedId is required for ADOPT verdict');
      }
      record.adoptedId = info.selectedId;
      record.results = bundle.candidates.map(function (c) {
        if (c.id === info.selectedId) {
          return Object.assign({}, c, { state: 'adopted', isSuperseded: false, adoptedReason: record.reason });
        } else {
          return Object.assign({}, c, { state: 'superseded', isSuperseded: true, supersededBy: info.selectedId });
        }
      });
    } else if (v === VERDICTS.JUXTAPOSE) {
      record.results = bundle.candidates.map(function (c) {
        return Object.assign({}, c, { state: 'juxtaposed', isSuperseded: false, juxtapositionPerspective: c.perspective || c.speaker || 'alternative' });
      });
    } else if (v === VERDICTS.PENDING) {
      record.results = bundle.candidates.map(function (c) {
        return Object.assign({}, c, { state: 'pending_verification', isSuperseded: false, pendingReason: record.reason });
      });
    } else if (v === VERDICTS.REVOKE) {
      record.results = bundle.candidates.map(function (c) {
        return Object.assign({}, c, { state: 'revoked', isSuperseded: true, revokedReason: record.reason });
      });
    }

    return record;
  }

  /**
   * 撤销裁决，回滚证据束状态
   * @param {Object} bundle
   * @param {Object} arbitrationRecord
   * @returns {Array<Object>} 恢复后的候选事实
   */
  function undoArbitration(bundle, arbitrationRecord) {
    if (!bundle || !Array.isArray(bundle.candidates)) return [];
    if (!arbitrationRecord || !Array.isArray(arbitrationRecord.previousState)) {
      throw new Error('Valid arbitrationRecord with previousState required for undo');
    }

    var stateMap = {};
    for (var i = 0; i < arbitrationRecord.previousState.length; i++) {
      var s = arbitrationRecord.previousState[i];
      stateMap[s.id] = s;
    }

    return bundle.candidates.map(function (c) {
      var prev = stateMap[c.id];
      if (prev) {
        var restored = Object.assign({}, c);
        restored.state = prev.state;
        restored.isSuperseded = prev.isSuperseded;
        delete restored.adoptedReason;
        delete restored.supersededBy;
        delete restored.juxtapositionPerspective;
        delete restored.pendingReason;
        delete restored.revokedReason;
        return restored;
      }
      return c;
    });
  }

  /**
   * 预测裁决对召回与注入的影响分析
   * @param {Object} arbitrationRecord
   * @returns {Object}
   */
  function analyzeArbitrationImpact(arbitrationRecord) {
    if (!arbitrationRecord) return { impactedRecallKeys: [], injectionAdvice: 'NONE' };
    var verdict = arbitrationRecord.verdict;
    var impacted = [arbitrationRecord.bundleKey];

    if (verdict === VERDICTS.ADOPT) {
      return {
        verdict: verdict,
        impactedRecallKeys: impacted,
        injectionStatus: 'EXCLUSIVE_WINNER',
        retainedFactsCount: 1,
        suppressedFactsCount: arbitrationRecord.results.length - 1,
        summary: '仅胜出事实参与主干注入，已压制历史冲突项'
      };
    } else if (verdict === VERDICTS.JUXTAPOSE) {
      return {
        verdict: verdict,
        impactedRecallKeys: impacted,
        injectionStatus: 'DUAL_PERSPECTIVE_INJECTION',
        retainedFactsCount: arbitrationRecord.results.length,
        suppressedFactsCount: 0,
        summary: '各方视角并存，需在注入提示词中明确标注各自归属与认知差异'
      };
    } else if (verdict === VERDICTS.PENDING) {
      return {
        verdict: verdict,
        impactedRecallKeys: impacted,
        injectionStatus: 'SUSPENDED_FROM_CERTAINTY',
        retainedFactsCount: 0,
        suppressedFactsCount: arbitrationRecord.results.length,
        summary: '全部置为存疑，移出高置信注入区，防止误导主干推演'
      };
    } else {
      return {
        verdict: verdict,
        impactedRecallKeys: impacted,
        injectionStatus: 'PURGED',
        retainedFactsCount: 0,
        suppressedFactsCount: arbitrationRecord.results.length,
        summary: '事实已被撤回，完全阻断进入上下文'
      };
    }
  }

  /**
   * 格式化裁决结果为引导 LLM 的上下文提示词
   * @param {Object} arbitrationRecord
   * @returns {string}
   */
  function formatArbitrationPrompt(arbitrationRecord) {
    if (!arbitrationRecord) return '';
    var lines = ['[事实仲裁裁定 · ' + arbitrationRecord.bundleKey + ']'];

    if (arbitrationRecord.verdict === VERDICTS.ADOPT) {
      var winner = arbitrationRecord.results.find(function (r) { return r.id === arbitrationRecord.adoptedId; });
      var winVal = winner ? (winner.object !== undefined ? winner.object : winner.value) : '';
      lines.push('· 权威正典事实：' + winVal);
      lines.push('· 裁决理由：' + arbitrationRecord.reason);
      lines.push('· 严格约束：其余矛盾表述已定性为历史作废或谣传，严禁再次采用旧数据。');
    } else if (arbitrationRecord.verdict === VERDICTS.JUXTAPOSE) {
      lines.push('· 多重视角并存（戏剧张力线）：');
      for (var i = 0; i < arbitrationRecord.results.length; i++) {
        var item = arbitrationRecord.results[i];
        var itemVal = item.object !== undefined ? item.object : item.value;
        lines.push('  - [' + item.juxtapositionPerspective + ' 视角]: ' + itemVal);
      }
      lines.push('· 叙事指引：各角色在互动中维持各自知情面与主观认定，不应无依据地预知他人隐秘。');
    } else if (arbitrationRecord.verdict === VERDICTS.PENDING) {
      lines.push('· 当前状态：存疑待证（理由：' + arbitrationRecord.reason + '）');
      lines.push('· 叙事指引：相关事实尚未盖棺定论，角色应保持试探、怀疑或调查态度。');
    } else if (arbitrationRecord.verdict === VERDICTS.REVOKE) {
      lines.push('· 当前状态：已全盘撤销（' + arbitrationRecord.reason + '）');
      lines.push('· 叙事指引：该线索已被证实完全不成立，角色勿在后续对话中提及。');
    }

    return lines.join('\n');
  }

  return {
    VERDICTS: VERDICTS,
    clusterEvidenceBundles: clusterEvidenceBundles,
    executeArbitration: executeArbitration,
    undoArbitration: undoArbitration,
    analyzeArbitrationImpact: analyzeArbitrationImpact,
    formatArbitrationPrompt: formatArbitrationPrompt
  };
});
