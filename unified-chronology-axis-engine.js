/* ============================================================
 * unified-chronology-axis-engine.js
 * 双时间统一时钟轴与叙事时空流转引擎 (L10-O3)
 *
 * 核心机制：
 * 1. 四维时空坐标模型 (Quadruple Temporal Coordinates):
 *    - occurredAt: 故事宇宙内客观发生时间 (绝对时间戳 / 章节虚拟公历 / 古代干支时辰)
 *    - learnedAt: 特定角色主观获知时间 (处理知情权视差与时间差)
 *    - recordedFloor: 记录写入时的楼层索引 (真实物理对话序)
 *    - validityInterval: [validFrom, validTo] 事实成立的有效时空窗口
 * 2. 五态时空演进判定 (TEMPORAL_STATES):
 *    - CURRENT_ACTIVE: 当下时刻处于有效区间内，确凿生效
 *    - HISTORICALLY_CLOSED: 发生于过去且已到期/被后事覆写 (如前任执政者)
 *    - FUTURE_PROMISE: 生效点在当前叙事时刻之后 (契约/约定/待办)
 *    - EXPIRED_BREACH: 承诺已超期未履约或计划落空
 *    - UNDETERMINED: 时间戳未明，严格拒绝盲目填充当前时刻
 * 3. 跨时钟投影转换：兼容古风十二时辰 (子丑寅卯) 与数字毫秒时间戳的换算。
 * 4. 叙事时间轴提示词注入：为 LLM 清晰勾勒出“当下确凿事实”与“过去历史沉淀”。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaUnifiedChronologyAxis = factory();
    root.UnifiedChronologyAxisEngine = root.LonShaUnifiedChronologyAxis;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TEMPORAL_STATES = Object.freeze({
    CURRENT_ACTIVE: 'CURRENT_ACTIVE',
    HISTORICALLY_CLOSED: 'HISTORICALLY_CLOSED',
    FUTURE_PROMISE: 'FUTURE_PROMISE',
    EXPIRED_BREACH: 'EXPIRED_BREACH',
    UNDETERMINED: 'UNDETERMINED'
  });

  var SHICHEN_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

  /**
   * 将时间戳或古风时辰解析为可比较的标量数值
   * @param {any} val
   * @returns {number|null}
   */
  function parseTemporalValue(val) {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    var str = String(val).trim();
    var num = Number(str);
    if (!isNaN(num)) return num;

    // 检查十二时辰
    for (var i = 0; i < SHICHEN_ORDER.length; i++) {
      if (str.indexOf(SHICHEN_ORDER[i]) !== -1) {
        return (i + 1) * 7200000; // 每个时辰映射为 2 小时毫秒基准
      }
    }

    var parsedDate = Date.parse(str);
    if (!isNaN(parsedDate)) return parsedDate;

    return null;
  }

  /**
   * 判定特定实体/事件在给定叙事时刻下的时空状态
   * @param {Object} item 事实或事件 { occurredAt, learnedAt, validFrom, validTo, isPromised }
   * @param {any} currentStoryTime 当前故事时钟
   * @returns {Object} 判定结论
   */
  function evaluateTemporalState(item, currentStoryTime) {
    if (!item) {
      return { state: TEMPORAL_STATES.UNDETERMINED, reason: 'EMPTY_ITEM' };
    }

    var curr = parseTemporalValue(currentStoryTime);
    if (curr === null) {
      return { state: TEMPORAL_STATES.UNDETERMINED, reason: 'NO_VALID_CURRENT_CLOCK' };
    }

    var from = parseTemporalValue(item.validFrom !== undefined ? item.validFrom : item.occurredAt);
    var to = parseTemporalValue(item.validTo);

    if (from === null && to === null) {
      return { state: TEMPORAL_STATES.UNDETERMINED, reason: 'NO_TIME_COORDINATES' };
    }

    // 未来承诺或未到期事件
    if (from !== null && from > curr) {
      return {
        state: TEMPORAL_STATES.FUTURE_PROMISE,
        relativeDelta: from - curr,
        reason: '生效时间晚于当前时钟'
      };
    }

    // 历史已闭合
    if (to !== null && to <= curr) {
      if (item.isPromised && !item.fulfilled) {
        return {
          state: TEMPORAL_STATES.EXPIRED_BREACH,
          expiredAgo: curr - to,
          reason: '承诺已逾期且未履约'
        };
      }
      return {
        state: TEMPORAL_STATES.HISTORICALLY_CLOSED,
        closedAgo: curr - to,
        reason: '有效窗口已截止，退为历史背景'
      };
    }

    // 处于有效窗口内
    return {
      state: TEMPORAL_STATES.CURRENT_ACTIVE,
      validFrom: from,
      validTo: to,
      reason: '当下时刻完全处于有效区间内'
    };
  }

  /**
   * 投影时间轴切片：区分当下有效、未来预期、历史旧事
   * @param {Array<Object>} items
   * @param {any} currentStoryTime
   * @returns {Object}
   */
  function projectChronologySnapshot(items, currentStoryTime) {
    var list = Array.isArray(items) ? items : [];
    var snapshot = {
      currentStoryTime: currentStoryTime,
      active: [],
      historical: [],
      future: [],
      breached: [],
      undetermined: []
    };

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var evaluation = evaluateTemporalState(item, currentStoryTime);
      var enriched = Object.assign({}, item, { temporalEvaluation: evaluation });

      if (evaluation.state === TEMPORAL_STATES.CURRENT_ACTIVE) {
        snapshot.active.push(enriched);
      } else if (evaluation.state === TEMPORAL_STATES.HISTORICALLY_CLOSED) {
        snapshot.historical.push(enriched);
      } else if (evaluation.state === TEMPORAL_STATES.FUTURE_PROMISE) {
        snapshot.future.push(enriched);
      } else if (evaluation.state === TEMPORAL_STATES.EXPIRED_BREACH) {
        snapshot.breached.push(enriched);
      } else {
        snapshot.undetermined.push(enriched);
      }
    }

    return snapshot;
  }

  /**
   * 格式化时空轴注入提示词
   * @param {Object} snapshot
   * @returns {string}
   */
  function formatChronologyPrompt(snapshot) {
    if (!snapshot) return '';
    var lines = ['[双时间叙事时钟轴 · 当前节点: ' + snapshot.currentStoryTime + ']'];

    if (snapshot.active.length > 0) {
      lines.push('【当下确凿生效】');
      for (var i = 0; i < snapshot.active.length; i++) {
        var it = snapshot.active[i];
        lines.push('· ' + (it.title || it.subject + ' ' + it.predicate + ' ' + (it.object || it.value)));
      }
    }

    if (snapshot.future.length > 0) {
      lines.push('【未来待办/承诺约定】');
      for (var j = 0; j < snapshot.future.length; j++) {
        var fut = snapshot.future[j];
        lines.push('· ' + (fut.title || fut.subject + ' ' + fut.predicate) + ' (预定节点: ' + (fut.validFrom || fut.occurredAt) + ')');
      }
    }

    if (snapshot.breached.length > 0) {
      lines.push('【反常/违约逾期警示】');
      for (var k = 0; k < snapshot.breached.length; k++) {
        var br = snapshot.breached[k];
        lines.push('· [逾期未赴] ' + (br.title || br.subject + ' ' + br.predicate) + ' (本应截止于: ' + br.validTo + ')');
      }
    }

    if (snapshot.historical.length > 0) {
      lines.push('【已闭合历史陈迹】(仅供追忆或回溯，勿当成当下现状): ' +
        snapshot.historical.map(function (h) { return h.title || h.subject; }).join(', '));
    }

    return lines.join('\n');
  }

  return {
    TEMPORAL_STATES: TEMPORAL_STATES,
    parseTemporalValue: parseTemporalValue,
    evaluateTemporalState: evaluateTemporalState,
    projectChronologySnapshot: projectChronologySnapshot,
    formatChronologyPrompt: formatChronologyPrompt
  };
});