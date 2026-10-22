/**
 * symbolic-evolution.js — [v3.359.0 · 第六期 M6-X6]
 *   「意象与意义变迁：同一地点、物件或话语能有不同分量」（纯函数 / 纯契约内核）
 *
 * 【计划原文（M6-X6）】
 *   把重复出现的对象关联到不同人物视角下的经历与意义；保留字面事实、
 *   作者确认的象征解释和纯候选三层。下一幕可选择呼应、反转或不提。
 *   验收：①同一物件对A是约定、对B只是工具，生成不能混同；
 *   ②三次登场后含义可改变，历史解释仍可查；
 *   ③作者否定象征解释后不继续反复强行呼应。
 *
 * 【机制】
 *   1 **createSymbolicEntity**：建立一个可变迁的意象实体（地点/物件/话语），
 *      带 literal（字面事实层）、confirmed（作者确认的象征解释层）、
 *      candidate（纯候选层）三层分离；
 *   2 **addPerspectiveMeaning**：不同角色对同一意象有不同意义，
 *      按角色视角分轨，互不覆盖（A 的约定 ≠ B 的工具）；
 *   3 **logAppearance**：每次登场记一条记录，可追踪含义演变轨迹；
 *   4 **revokeSymbolicClaim**：作者否定某条象征解释后，
 *      该条标 revoked，后续不再强行呼应（但不删除历史记录）。
 *
 * 【口径纪律】
 *   · 三层严格分离：literal 是事实、confirmed 是作者意志、candidate 是推测；
 *   · 角色视角独立存轨，不合并成「大家都这么认为」；
 *   · 否定不等于删除：revoked 保留可查，但不再注入生成；
 *   · 不把所有重复词强制升级成文学母题（万物皆伏笔）。
 */
'use strict';
(function () {
  const VERSION = '3.359.0';

  /** 三层语义 */
  const LAYERS = Object.freeze({
    literal: Object.freeze({ label: '字面事实', note: '物理事实层：这把椅子的位置、材质、状态' }),
    confirmed: Object.freeze({ label: '作者确认', note: '作者明确设定的象征解释' }),
    candidate: Object.freeze({ label: '纯候选', note: '模型推测但未经作者确认的可能含义' }),
  });

  /** 登场状态 */
  const APPEARANCE_ACTIONS = Object.freeze({
    echo: 'echo',       // 呼应：延续已有含义
    invert: 'invert',   // 反转：含义发生转变
    silent: 'silent',   // 不提：刻意不使用
  });

  const LIMITS = Object.freeze({ maxAppearances: 50, maxPerspectives: 20, textMax: 300 });

  function _s(x, max) {
    var t = (x === null || x === undefined) ? '' : String(x);
    return max ? t.slice(0, max) : t;
  }

  /**
   * 创建一个可变迁的意象实体。
   * @param {object} input
   *   · `entityId`   — 实体标识（如 'old-station'）
   *   · `type`       — 'place' | 'object' | 'phrase'
   *   · `literal`    — 字面事实描述
   *   · `at`         — 创建时点
   * @returns {object} 意象实体
   */
  function createSymbolicEntity(input) {
    input = (input && typeof input === 'object') ? input : {};
    return {
      v: VERSION,
      entityId: _s(input.entityId, 80).trim() || 'entity-unknown',
      type: ['place', 'object', 'phrase'].includes(_s(input.type, 20).trim()) ? _s(input.type, 20).trim() : 'object',
      literal: _s(input.literal, LIMITS.textMax).trim(),
      confirmed: [],      // [{meaning, by, at, revoked}]
      candidate: [],      // [{meaning, by, at, revoked}]
      perspectives: {},    // {actorId: [{meaning, appearanceIndex, at}]}
      appearances: [],    // [{index, at, action, note, actorId}]
      _maxApp: LIMITS.maxAppearances,
      _maxPer: LIMITS.maxPerspectives,
    };
  }

  /**
   * 添加角色视角下的意义（不同角色对同一意象有不同意义）。
   * @param {object} entity
   * @param {string} actorId
   * @param {string} meaning 该角色对这意象的意义
   * @param {number} at
   * @returns {object} {ok, reason, entry}
   */
  function addPerspectiveMeaning(entity, actorId, meaning, at) {
    if (!entity || typeof entity !== 'object') return { ok: false, reason: '意象不在场' };
    var aid = _s(actorId, 60).trim();
    if (!aid) return { ok: false, reason: '缺角色' };
    var m = _s(meaning, LIMITS.textMax).trim();
    if (!m) return { ok: false, reason: '缺意义描述' };
    if (!entity.perspectives) entity.perspectives = {};
    if (!Array.isArray(entity.perspectives[aid])) entity.perspectives[aid] = [];
    if (entity.perspectives[aid].length >= LIMITS.maxPerspectives) entity.perspectives[aid].shift();
    var entry = { meaning: m, appearanceIndex: entity.appearances.length, at: (typeof at === 'number' ? at : 0) };
    entity.perspectives[aid].push(entry);
    return { ok: true, reason: 'ok', entry: entry };
  }

  /**
   * 记录一次登场，可追踪含义演变。
   * @param {object} entity
   * @param {object} appearance {at, action, note, actorId}
   * @returns {object} {ok, reason, index}
   */
  function logAppearance(entity, appearance) {
    if (!entity || typeof entity !== 'object') return { ok: false, reason: '意象不在场' };
    var ap = (appearance && typeof appearance === 'object') ? appearance : {};
    var action = _s(ap.action, 20).trim();
    if (!Object.prototype.hasOwnProperty.call(APPEARANCE_ACTIONS, action)) {
      action = 'echo'; // 默认呼应
    }
    var index = entity.appearances.length;
    var record = {
      index: index,
      at: (typeof ap.at === 'number') ? ap.at : 0,
      action: action,
      note: _s(ap.note, LIMITS.textMax),
      actorId: _s(ap.actorId, 60),
    };
    entity.appearances.push(record);
    if (entity.appearances.length > LIMITS.maxAppearances) entity.appearances.shift();
    return { ok: true, reason: 'ok', index: index };
  }

  /**
   * 作者确认一条象征解释（从 candidate 提升到 confirmed）。
   * @param {object} entity
   * @param {string} meaning
   * @param {string} by 确认者
   * @param {number} at
   * @returns {object} {ok, reason}
   */
  function confirmSymbol(entity, meaning, by, at) {
    if (!entity || typeof entity !== 'object') return { ok: false, reason: '意象不在场' };
    var m = _s(meaning, LIMITS.textMax).trim();
    if (!m) return { ok: false, reason: '缺意义描述' };
    if (!Array.isArray(entity.confirmed)) entity.confirmed = [];
    entity.confirmed.push({ meaning: m, by: _s(by, 60), at: (typeof at === 'number' ? at : 0), revoked: false });
    // 从 candidate 中移除已确认的
    entity.candidate = (Array.isArray(entity.candidate) ? entity.candidate : []).filter(function (c) {
      return c.meaning !== m;
    });
    return { ok: true, reason: 'ok' };
  }

  /**
   * 作者否定一条象征解释。
   * 否定不等于删除：revoked 保留可查，但不再注入生成。
   * @param {object} entity
   * @param {string} meaning 要否定的解释
   * @param {string} layer 'confirmed' | 'candidate'
   * @returns {object} {ok, reason, revoked}
   */
  function revokeSymbolicClaim(entity, meaning, layer) {
    if (!entity || typeof entity !== 'object') return { ok: false, reason: '意象不在场', revoked: 0 };
    var m = _s(meaning, LIMITS.textMax).trim();
    if (!m) return { ok: false, reason: '缺意义描述', revoked: 0 };
    var target = (layer === 'candidate') ? entity.candidate : entity.confirmed;
    if (!Array.isArray(target)) return { ok: false, reason: '层不存在', revoked: 0 };
    var count = 0;
    for (var i = 0; i < target.length; i++) {
      if (target[i] && target[i].meaning === m && !target[i].revoked) {
        target[i].revoked = true;
        target[i].revokedAt = Date.now();
        count++;
      }
    }
    return { ok: true, reason: count > 0 ? '已否定' : '未找到匹配项', revoked: count };
  }

  /**
   * 获取意象的当前有效含义（排除 revoked）。
   * @param {object} entity
   * @returns {object} {literal, confirmedActive, candidateActive, perspectives, appearanceCount}
   */
  function getActiveMeaning(entity) {
    if (!entity || typeof entity !== 'object') return { literal: '', confirmedActive: [], candidateActive: [], perspectives: {}, appearanceCount: 0 };
    return {
      literal: entity.literal || '',
      confirmedActive: (Array.isArray(entity.confirmed) ? entity.confirmed : []).filter(function (c) { return !c.revoked; }),
      candidateActive: (Array.isArray(entity.candidate) ? entity.candidate : []).filter(function (c) { return !c.revoked; }),
      perspectives: entity.perspectives || {},
      appearanceCount: Array.isArray(entity.appearances) ? entity.appearances.length : 0,
    };
  }

  /**
   * 获取含义演变轨迹（按登场顺序）。
   * @param {object} entity
   * @returns {object} {trajectory, summary}
   */
  function getEvolutionTrail(entity) {
    if (!entity || typeof entity !== 'object') return { trajectory: [], summary: '意象不在场' };
    var trail = (Array.isArray(entity.appearances) ? entity.appearances : []).map(function (ap) {
      var perspectivesAtTime = {};
      for (var aid in (entity.perspectives || {})) {
        var pms = entity.perspectives[aid].filter(function (p) { return p.appearanceIndex <= ap.index; });
        if (pms.length > 0) perspectivesAtTime[aid] = pms[pms.length - 1].meaning;
      }
      return {
        index: ap.index,
        at: ap.at,
        action: ap.action,
        note: ap.note,
        actorId: ap.actorId,
        perspectivesAtTime: perspectivesAtTime,
      };
    });
    var summary = entity.entityId + '：' + trail.length + ' 次登场'
      + (trail.some(function (t) { return t.action === 'invert'; }) ? ' · 含反转' : '');
    return { trajectory: trail, summary: summary };
  }

  var api = Object.freeze({
    VERSION: VERSION,
    LAYERS: LAYERS,
    APPEARANCE_ACTIONS: APPEARANCE_ACTIONS,
    LIMITS: LIMITS,
    createSymbolicEntity: createSymbolicEntity,
    addPerspectiveMeaning: addPerspectiveMeaning,
    logAppearance: logAppearance,
    confirmSymbol: confirmSymbol,
    revokeSymbolicClaim: revokeSymbolicClaim,
    getActiveMeaning: getActiveMeaning,
    getEvolutionTrail: getEvolutionTrail,
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.SymbolicEvolutionLib = api;
})();
