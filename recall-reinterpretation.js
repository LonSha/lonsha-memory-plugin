/**
 * recall-reinterpretation.js — [v3.359.0 · 第六期 M6-X8]
 *   「回忆再理解：同一往事被重新讲述时，人物会获得新认识」（纯函数 / 纯契约内核）
 *
 * 【计划原文（M6-X8）】
 *   为一次回忆记录讲述时点、讲述者、所引用经历、当时解释与后来解释；
 *   区分事实修正、主观改观、叙事省略。生成可呈现不同人生阶段的回望，不反写原事件。
 *   验收：①同一离别在两时点被不同解释，原文出处不变；
 *   ②用户修改回忆措辞不改变正史事实；
 *   ③旧视角回放仍用当年解释，当前续写使用新理解。
 *
 * 【机制】
 *   1 **createRecallSession**：建立一次回忆讲述会话，带讲述时点、讲述者、引用经历；
 *   2 **addInterpretation**：在回忆会话中添加一层解释（当时解释 / 后来再理解），
 *      标明 interpretationType（original / revised / corrected / omitted）；
 *   3 **getTimelineContrast**：比较同一经历在不同时点的解释差异，
 *      输出「哪些变了、哪些没变」的对照读数；
 *   4 **protectOriginalFact**：回忆措辞修改不改变正史事实——
 *      返回受保护的事实引用，回忆只能改解释不能改出处。
 *
 * 【口径纪律】
 *   · 事实修正 ≠ 主观改观 ≠ 叙事省略：三种类型结构上分开，不混同；
 *   · 原事件出处不变：回忆改的是「怎么理解」，不是「发生了什么」；
 *   · 旧视角回放仍用当年解释：历史不反写，当前续写用新理解；
 *   · 纯函数：不写存储、不碰 DOM、不读时钟。
 */
'use strict';
(function () {
  const VERSION = '3.359.0';

  /** 解释类型 */
  const INTERPRETATION_TYPES = Object.freeze({
    original: Object.freeze({ label: '当时解释', note: '回忆发生时讲述者的理解' }),
    revised: Object.freeze({ label: '后来再理解', note: '人物后来改变了对往事的理解' }),
    corrected: Object.freeze({ label: '事实修正', note: '原事实记错了，后来纠正' }),
    omitted: Object.freeze({ label: '叙事省略', note: '讲述时有意略去的部分' }),
  });

  const LIMITS = Object.freeze({ maxInterpretations: 30, maxSessions: 50, textMax: 400 });

  function _s(x, max) {
    var t = (x === null || x === undefined) ? '' : String(x);
    return max ? t.slice(0, max) : t;
  }

  /**
   * 创建一次回忆讲述会话。
   * @param {object} input
   *   · `sessionId`  — 会话标识
   *   · `tellerId`   — 讲述者
   *   · `experienceRef` — 引用的经历出处（经历 ID 或事实引用）
   *   · `toldAt`     — 讲述时点（毫秒，由调用方给）
   *   · `context`    — 讲述场景描述
   * @returns {object} 回忆会话
   */
  function createRecallSession(input) {
    input = (input && typeof input === 'object') ? input : {};
    return {
      v: VERSION,
      sessionId: _s(input.sessionId, 80).trim() || ('recall-' + Date.now().toString(36)),
      tellerId: _s(input.tellerId, 60),
      experienceRef: _s(input.experienceRef, 120),
      toldAt: (typeof input.toldAt === 'number') ? input.toldAt : 0,
      context: _s(input.context, LIMITS.textMax),
      interpretations: [],  // [{type, text, at, by, revoked}]
      _maxInt: LIMITS.maxInterpretations,
    };
  }

  /**
   * 在回忆会话中添加一层解释。
   * @param {object} session
   * @param {string} type 解释类型（original/revised/corrected/omitted）
   * @param {string} text 解释文本
   * @param {number} at 解释时点
   * @param {string} by 解释者
   * @returns {object} {ok, reason, entry}
   */
  function addInterpretation(session, type, text, at, by) {
    if (!session || typeof session !== 'object') return { ok: false, reason: '会话不在场' };
    var t = _s(type, 20).trim();
    if (!Object.prototype.hasOwnProperty.call(INTERPRETATION_TYPES, t))
      return { ok: false, reason: '解释类型认不出：' + t };
    var tx = _s(text, LIMITS.textMax).trim();
    if (!tx) return { ok: false, reason: '缺解释文本' };
    if (!Array.isArray(session.interpretations)) session.interpretations = [];
    var entry = {
      type: t,
      text: tx,
      at: (typeof at === 'number') ? at : 0,
      by: _s(by, 60),
      revoked: false,
    };
    session.interpretations.push(entry);
    if (session.interpretations.length > LIMITS.maxInterpretations) session.interpretations.shift();
    return { ok: true, reason: 'ok', entry: entry };
  }

  /**
   * 比较同一经历在不同时点的解释差异。
   * @param {Array} sessions 同一经历的多场回忆会话（按时间排序）
   * @returns {object} {contrasts, changedCount, unchangedCount, summary}
   */
  function getTimelineContrast(sessions) {
    var list = Array.isArray(sessions) ? sessions.filter(function (s) { return s && typeof s === 'object'; }) : [];
    if (list.length === 0) return { contrasts: [], changedCount: 0, unchangedCount: 0, summary: '无会话可比' };
    list.sort(function (a, b) { return (a.toldAt || 0) - (b.toldAt || 0); });
    var contrasts = [];
    for (var i = 1; i < list.length; i++) {
      var prev = list[i - 1];
      var curr = list[i];
      var prevInts = (prev.interpretations || []).filter(function (x) { return !x.revoked; });
      var currInts = (curr.interpretations || []).filter(function (x) { return !x.revoked; });
      var prevTexts = prevInts.map(function (x) { return x.text; });
      var currTexts = currInts.map(function (x) { return x.text; });
      var changed = prevTexts.some(function (t) { return !currTexts.includes(t); }) ||
                    currTexts.some(function (t) { return !prevTexts.includes(t); });
      var typeShift = currInts.some(function (x) { return x.type === 'revised' || x.type === 'corrected'; });
      contrasts.push({
        from: prev.toldAt,
        to: curr.toldAt,
        changed: changed,
        typeShift: typeShift,
        prevInterpretations: prevInts,
        currInterpretations: currInts,
      });
    }
    var changedCount = contrasts.filter(function (c) { return c.changed; }).length;
    var unchangedCount = contrasts.filter(function (c) { return !c.changed; }).length;
    var summary = list[0].experienceRef + '：' + list.length + ' 场回忆 · 变化 ' + changedCount + ' 次 · 不变 ' + unchangedCount + ' 次';
    return { contrasts: contrasts, changedCount: changedCount, unchangedCount: unchangedCount, summary: summary };
  }

  /**
   * 保护正史事实：回忆措辞修改不改变正史事实。
   * 返回受保护的事实引用快照，回忆只能改解释不能改出处。
   * @param {object} session
   * @returns {object} {protectedRef, note}
   */
  function protectOriginalFact(session) {
    if (!session || typeof session !== 'object') return { protectedRef: '', note: '会话不在场' };
    return {
      protectedRef: session.experienceRef || '',
      note: '回忆措辞可修改，但正史事实出处（' + (session.experienceRef || '无') + '）不受回忆影响',
    };
  }

  /**
   * 获取当前有效解释（排除 revoked）。
   * @param {object} session
   * @returns {object} {active, summary}
   */
  function getActiveInterpretation(session) {
    if (!session || typeof session !== 'object') return { active: [], summary: '会话不在场' };
    var active = (Array.isArray(session.interpretations) ? session.interpretations : []).filter(function (x) { return !x.revoked; });
    var latest = active.length > 0 ? active[active.length - 1] : null;
    var summary = session.sessionId + '：' + active.length + ' 条有效解释'
      + (latest ? ' · 最新类型 ' + (INTERPRETATION_TYPES[latest.type] ? INTERPRETATION_TYPES[latest.type].label : latest.type) : '');
    return { active: active, latest: latest, summary: summary };
  }

  /**
   * 撤回一条解释（标 revoked，不删除）。
   * @param {object} session
   * @param {string} text 要撤回的解释文本
   * @returns {object} {ok, reason, revoked}
   */
  function revokeInterpretation(session, text) {
    if (!session || typeof session !== 'object') return { ok: false, reason: '会话不在场', revoked: 0 };
    var tx = _s(text, LIMITS.textMax).trim();
    if (!tx) return { ok: false, reason: '缺解释文本', revoked: 0 };
    var count = 0;
    for (var i = 0; i < (session.interpretations || []).length; i++) {
      if (session.interpretations[i] && session.interpretations[i].text === tx && !session.interpretations[i].revoked) {
        session.interpretations[i].revoked = true;
        count++;
      }
    }
    return { ok: true, reason: count > 0 ? '已撤回' : '未找到', revoked: count };
  }

  var api = Object.freeze({
    VERSION: VERSION,
    INTERPRETATION_TYPES: INTERPRETATION_TYPES,
    LIMITS: LIMITS,
    createRecallSession: createRecallSession,
    addInterpretation: addInterpretation,
    getTimelineContrast: getTimelineContrast,
    protectOriginalFact: protectOriginalFact,
    getActiveInterpretation: getActiveInterpretation,
    revokeInterpretation: revokeInterpretation,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.RecallReinterpretationLib = api;
})();