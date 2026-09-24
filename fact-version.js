/* ========================================================
 * fact-version.js — 时间与事实版本 [v3.194.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓早已能登记「事实」，但登记处**没有时间维度**：
 *     · ConflictBook（index.js）只记「版本A ↔ 版本B」两条对立文本 + 严重度，不记谁先谁后；
 *     · DeltaBook 只有 established/uncertain 两态，没有有效区间；
 *     · age-anchor.js 处理年龄锚点，不管住所/工作/关系这类会变的事实。
 *   于是「她以前住在北京，后来搬到上海」在账上只剩两条互相矛盾的记录，
 *   查询「现在去哪里找她」与「回忆大学时生活」只能拿到同一堆东西——
 *   旧状态会被当成现状读出去，而系统没有任何字段能分辨。
 *
 * 【本模块只做三件事】
 *   ① 登记带**有效区间**的事实版本（from/to 楼层 + 来源 + 出处楼层）；
 *   ② 按时点查询：给 at 取覆盖该时点的那一版；不给 at 取当前有效的那一版；
 *   ③ 冲突**不贸然覆盖**：无法判定先后的两条并存并标记，查询时报 ambiguous 而不是替用户裁决。
 *
 * 【五类来源必须可分（计划点名：模型推测的住址不得与正文确认的住址混同）】
 *   ORIGIN_TRUST = { confirmed:1, stated:0.8, reported:0.5, inferred:0.3, system:0 }
 *   默认信任门槛 0.5 ⇒ inferred(0.3) 不够格进「现状查询」。
 *   关键纪律：被门槛挡掉**不是**「没有这个事实」——被挡的条数记在 excludedByTrust 里，
 *   且 reason 取 'none-trusted' 而非 'none'。把「查不到」与「查到了但不够格」写成同一个值，
 *   是这一族缺陷最常见的形态（本仓纪律：判不了就报价，不静默）。
 *
 * 【本模块不做什么（边界）】
 *   · 不解析正文。谁在什么时候搬到哪儿，由提取管线给出；本模块只收已经确认的输入。
 *   · 不删除被换代的事实。换代只是闭合区间（to = 新事实的 from）+ 记 supersededBy，
 *     旧版本始终可查——「回忆大学时生活」要用的正是它。
 *   · 不猜时间标签的先后。区间比较只在**同型**（都有楼层号）时进行；一侧缺楼层即判
 *     'unsequenced'，绝不按写入顺序充当时间顺序。
 *
 * 挂 window.LonShaFactVersion，供 index.js 提取落笔 / 召回查询 / 诊断面使用。
 * ======================================================== */
'use strict';
(function (root) {
  // [v3.207] 账本实体契约单一真源（ledger-entity.js）。取库双通道与 index.js 的 _moduleLib 同形：
  //   浏览器走全局（extra_js 在入口之后加载，故在 IIFE 内**惰性**取，不能构造期缓存）、Node 走 require。
  //   两处写法在六本账里逐字同形，便于常驻门禁按字面量扫描（tests/audit/scan_ledger_contract.mjs）。
  const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity
    : ((typeof module !== 'undefined' && module.exports) ? require('./ledger-entity.js') : (root.LonShaLedgerEntity || null));
  if (!LE) throw new Error('[lonsha] ledger-entity.js 未加载：账本实体契约缺真源（查 manifest.extra_js 加载顺序）');
  const FACT_VERSION = 1;
  const MAX_FACTS = 400;
  const MAX_HISTORY = 12;
  /** 来源五态。改此处即信任口径变化，须同步 CHANGELOG。 */
  const ORIGINS = Object.freeze(['confirmed', 'stated', 'reported', 'inferred', 'system']);
  /** 来源信任度：只有 confirmed/stated 过默认门槛。 */
  const ORIGIN_TRUST = Object.freeze({ confirmed: 1, stated: 0.8, reported: 0.5, inferred: 0.3, system: 0 });
  /** 默认信任门槛：0.5 ⇒ inferred(0.3) 与 system(0) 被挡。挡掉要报价，见 excludedByTrust。 */
  const DEFAULT_MIN_TRUST = 0.5;
  /**
   * 查询结果八态（互不相同，测试逐态构造）。
   *   ok            —— 取到了事实
   *   invalid       —— 查询本身不合法（缺 subject）
   *   none          —— 这个主语/属性从未有过任何事实
   *   none-current  —— 有历史版本，但没有任何版本到今天还开着（被换代且无后续 / 全关闭）
   *   none-trusted  —— 有版本，但全被信任门槛挡掉（模型推测不冒充正文确认）
   *   none-revoked  —— 有版本，但全被撤销
   *   ambiguous     —— 同时有多版有效且无法判定先后（冲突未决，不得替用户裁决）
   *   unversioned   —— 给了 at，但账上所有版本都没有楼层区间，无法按时点取
   */
  const REASONS = Object.freeze(['ok', 'invalid', 'none', 'none-current', 'none-trusted', 'none-revoked', 'ambiguous', 'unversioned']);

  // [v3.207] text / finite 由账本实体契约提供（原为六本账各自抄一份，逐字相同）。
  const text = LE.text;
  const finite = LE.finite;
  function originOf(o) {
    return ORIGINS.includes(o) ? o : 'stated';
  }
  function trustOf(o) {
    const t = ORIGIN_TRUST[originOf(o)];
    return typeof t === 'number' ? t : ORIGIN_TRUST.stated;
  }
  function copyEvent(e) {
    return {
      eventKey: text(e && e.eventKey, 120),
      action: text(e && e.action, 24),
      floor: finite(e && e.floor),
      source: text(e && e.source, 40),
      origin: (e && e.origin == null) ? null : originOf(e.origin),
      reason: text(e && e.reason, 80),
      from: (e && e.from == null) ? null : finite(e.from),
      to: (e && e.to == null) ? null : finite(e.to),
      at: finite(e && e.at)
    };
  }
  function copyFact(f) {
    return {
      id: text(f.id, 48),
      subject: text(f.subject, 40),
      predicate: text(f.predicate, 40),
      value: text(f.value, 120),
      origin: originOf(f.origin),
      trust: trustOf(f.origin),
      from: f.from == null ? null : finite(f.from),
      to: f.to == null ? null : finite(f.to),
      floor: finite(f.floor),
      source: text(f.source, 40),
      evidence: text(f.evidence, 120),
      supersededBy: text(f.supersededBy, 48) || null,
      revoked: f.revoked === true,
      revokeReason: text(f.revokeReason, 80),
      // [v3.207] 修订号读回走契约。
      revision: LE.revisionOf(f),
      // [v3.207] 历史读回走契约（末 MAX_HISTORY 条 + 逐条 copyEvent）。
      history: LE.copyHistory(f, MAX_HISTORY, copyEvent)
    };
  }
  function clone(state) {
    return {
      version: FACT_VERSION,
      seq: finite(state && state.seq) || 0,
      facts: Array.isArray(state && state.facts) ? state.facts.map(copyFact) : []
    };
  }
  /** 规范化：丢无主语/无值的条目、丢重复 id、裁到上限。返回新对象，不改入参。 */
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.facts = state.facts.filter(function (f) {
      if (!f.id || !f.subject || !f.predicate || !f.value) return false;
      if (seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    }).slice(-MAX_FACTS);
    return state;
  }
  function pairKey(subject, predicate) {
    return text(subject, 40).toLowerCase() + '\u0000' + text(predicate, 40).toLowerCase();
  }
  /** 内容指纹：同一事实重复提取不应重复登记（幂等键）。 */
  function factFp(f) {
    return [text(f.subject).toLowerCase(), text(f.predicate).toLowerCase(), text(f.value).toLowerCase(),
      originOf(f.origin), f.from == null ? '*' : finite(f.from), f.to == null ? '*' : finite(f.to)].join('\u0001');
  }
  function nextId(state) {
    state.seq += 1;
    return 'fct_' + state.seq;
  }
  // [v3.207] 记一次变更走契约（本账**不**戳 updatedFloor：它没有该字段，故不传 stampFloor）。
  function record(f, event) {
    const k = text(event.eventKey, 120);
    return LE.recordEvent(f, k ? Object.assign({ eventKey: k }, event) : event, {
      maxHistory: MAX_HISTORY, prepare: copyEvent
    });
  }
  function result(state, extra) {
    return Object.assign({ ok: true, changed: false, state: normalize(state) }, extra || {});
  }
  function reject(state, reason) {
    return { ok: false, changed: false, reason: reason, state: normalize(state) };
  }
  /** 该 (subject, predicate) 下所有版本（含已闭合、已撤销）——「回忆过去」要的原始料。 */
  function versionsOf(rawState, subject, predicate) {
    const state = normalize(rawState);
    const key = predicate ? pairKey(subject, predicate) : null;
    return state.facts.filter(function (f) {
      if (!key) return text(f.subject).toLowerCase() === text(subject).toLowerCase();
      return pairKey(f.subject, f.predicate) === key;
    });
  }
  /**
   * 登记（或复述）一条事实版本。
   * input = { subject, predicate, value, origin, from, to, floor, source, evidence, eventKey }
   *   · from/to 是**剧情楼层号**（可空）。空 from = 无法定位起点。
   *   · 冲突处置：同 (subject,predicate) 已有**未闭合**且值不同的条目时——
   *       两侧都有 from 且新 from 更大 ⇒ 判定为「状态更新」，自动闭合并换代（sequenced:true）；
   *       否则并存放行、标记 unsequenced（不替用户裁决谁对，查询时报 ambiguous）。
   */
  function assertFact(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const subject = text(i.subject, 40);
    const predicate = text(i.predicate, 40);
    const value = text(i.value, 120);
    if (!subject || !predicate || !value) return reject(state, 'missing-fact');
    const fp = factFp({ subject: subject, predicate: predicate, value: value, origin: i.origin, from: i.from, to: i.to });
    const dup = state.facts.find(function (f) { return factFp(f) === fp; });
    if (dup) {
      const replayed = true;
      return result(state, { fact: copyFact(dup), replayed: replayed, changed: false, superseded: [], conflict: false, sequenced: true });
    }
    // 同对、未闭合、值不同 ⇒ 冲突候选
    const open = state.facts.filter(function (f) {
      return pairKey(f.subject, f.predicate) === pairKey(subject, predicate) && !f.revoked && f.to == null;
    });
    const differing = open.filter(function (f) { return text(f.value).toLowerCase() !== value.toLowerCase(); });
    const newFrom = i.from == null ? null : finite(i.from);
    const allSequenced = differing.length > 0 && newFrom != null
      && differing.every(function (f) { return f.from != null && newFrom > f.from; });
    const fact = copyFact({
      id: nextId(state), subject: subject, predicate: predicate, value: value,
      origin: i.origin, from: i.from, to: i.to, floor: i.floor, source: i.source,
      evidence: i.evidence, revision: LE.REVISION.CREATE, history: []
    });
    record(fact, { action: 'assert', eventKey: i.eventKey, floor: i.floor, source: i.source, origin: fact.origin, reason: '', from: fact.from, to: fact.to, at: i.at });
    const superseded = [];
    if (allSequenced) {
      for (const old of differing) {
        const idx = state.facts.findIndex(function (f) { return f.id === old.id; });
        if (idx < 0) continue;
        state.facts[idx].to = newFrom;
        state.facts[idx].supersededBy = fact.id;
        record(state.facts[idx], { action: 'supersede', eventKey: '', floor: newFrom, source: text(i.source, 40), origin: null, reason: 'sequenced-by:' + fact.id, from: null, to: newFrom, at: i.at });
        superseded.push(old.id);
      }
    }
    state.facts.push(fact);
    return result(state, {
      fact: copyFact(fact), replayed: false, changed: true,
      superseded: superseded,
      conflict: differing.length > 0 && !allSequenced,
      sequenced: differing.length === 0 || allSequenced,
      conflictWith: (differing.length > 0 && !allSequenced) ? differing.map(function (f) { return f.id; }) : []
    });
  }
  /** 撤销一条错误事实（不删除，标记 revoked 并留原因——删了就查不出来「曾经记错过」）。 */
  function revokeFact(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const id = text(i.id, 48);
    if (!id) return reject(state, 'missing-id');
    const idx = state.facts.findIndex(function (f) { return f.id === id; });
    if (idx < 0) return reject(state, 'not-found');
    if (state.facts[idx].revoked) return result(state, { fact: copyFact(state.facts[idx]), replayed: true, changed: false });
    state.facts[idx].revoked = true;
    state.facts[idx].revokeReason = text(i.reason, 80);
    record(state.facts[idx], { action: 'revoke', eventKey: i.eventKey, floor: i.floor, source: i.source, origin: null, reason: text(i.reason, 80), from: null, to: null, at: i.at });
    return result(state, { fact: copyFact(state.facts[idx]), replayed: false, changed: true });
  }
  /** 改来源（模型推测被用户/正文确认为明确事实）。这是「修复闭环」里最常走的一条。 */
  function setOrigin(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const id = text(i.id, 48);
    const idx = state.facts.findIndex(function (f) { return f.id === id; });
    if (idx < 0) return reject(state, 'not-found');
    const next = originOf(i.origin);
    if (state.facts[idx].origin === next) return result(state, { fact: copyFact(state.facts[idx]), replayed: true, changed: false });
    const prev = state.facts[idx].origin;
    state.facts[idx].origin = next;
    state.facts[idx].trust = trustOf(next);
    record(state.facts[idx], { action: 'origin', eventKey: i.eventKey, floor: i.floor, source: i.source, origin: next, reason: prev + '->' + next, from: null, to: null, at: i.at });
    return result(state, { fact: copyFact(state.facts[idx]), replayed: false, changed: true, from: prev });
  }
  function coversAt(f, at) {
    if (f.from == null && f.to == null) return null;       // 无区间：判不了，不猜
    if (f.from != null && at < f.from) return false;
    if (f.to != null && at >= f.to) return false;
    return true;
  }
  /**
   * 查询。q = { subject, predicate?, at?, minTrust? }
   *   at == null  ⇒ 「现在」：取 to 为空的版本
   *   at 给定      ⇒ 取覆盖该时点的版本
   * 返回 { ok, reason, fact, facts, versions, excludedByTrust, excludedByRevoked }。
   * 注意 ok 只表示「查询执行成功」，取没取到看 reason——两者不是一件事。
   */
  function lookup(rawState, q) {
    const state = normalize(rawState);
    const query = q || {};
    const subject = text(query.subject, 40);
    if (!subject) return { ok: false, reason: 'invalid', fact: null, facts: [], versions: [], excludedByTrust: 0, excludedByRevoked: 0, state: state };
    const minTrust = Number.isFinite(Number(query.minTrust)) ? Number(query.minTrust) : DEFAULT_MIN_TRUST;
    const all = versionsOf(state, subject, query.predicate);
    if (!all.length) {
      return { ok: true, reason: 'none', fact: null, facts: [], versions: [], excludedByTrust: 0, excludedByRevoked: 0, state: state };
    }
    const revokedN = all.filter(function (f) { return f.revoked; }).length;
    const alive = all.filter(function (f) { return !f.revoked; });
    const trusted = alive.filter(function (f) { return f.trust >= minTrust; });
    const excludedByTrust = alive.length - trusted.length;
    const base = {
      ok: true, versions: all.map(copyFact),
      excludedByTrust: excludedByTrust, excludedByRevoked: revokedN, state: state
    };
    if (!alive.length) return Object.assign(base, { reason: 'none-revoked', fact: null, facts: [] });
    if (!trusted.length) return Object.assign(base, { reason: 'none-trusted', fact: null, facts: [] });
    const at = query.at == null ? null : finite(query.at);
    let picked;
    if (at == null) {
      picked = trusted.filter(function (f) { return f.to == null; });
      if (!picked.length) return Object.assign(base, { reason: 'none-current', fact: null, facts: [] });
    } else {
      const anyVersioned = trusted.some(function (f) { return f.from != null || f.to != null; });
      if (!anyVersioned) return Object.assign(base, { reason: 'unversioned', fact: null, facts: [] });
      picked = trusted.filter(function (f) { return coversAt(f, at) === true; });
      if (!picked.length) return Object.assign(base, { reason: 'none-current', fact: null, facts: [] });
    }
    // 去重同值（同值多版 = 同一事实的重复登记，不算冲突）
    const byValue = new Map();
    for (const f of picked) {
      const k = text(f.value).toLowerCase();
      if (!byValue.has(k)) byValue.set(k, f);
    }
    const uniq = [...byValue.values()];
    if (uniq.length > 1) {
      return Object.assign(base, { reason: 'ambiguous', fact: null, facts: uniq.map(copyFact) });
    }
    return Object.assign(base, { reason: 'ok', fact: copyFact(uniq[0]), facts: [copyFact(uniq[0])] });
  }
  /**
   * 时间线视图：把一个 (subject, predicate) 的全部版本按 from 升序排好。
   * 这正是「她以前住北京，后来搬上海」应有的形状——两段都留着，不丢任何一段。
   */
  function timeline(rawState, q) {
    const state = normalize(rawState);
    const query = q || {};
    const versions = versionsOf(state, text(query.subject, 40), query.predicate);
    const ordered = versions.slice().sort(function (a, b) {
      const fa = a.from == null ? Number.MAX_SAFE_INTEGER : a.from;
      const fb = b.from == null ? Number.MAX_SAFE_INTEGER : b.from;
      return fa - fb || String(a.id).localeCompare(String(b.id));
    });
    return {
      ok: true,
      subject: text(query.subject, 40),
      versions: ordered.map(copyFact),
      current: ordered.filter(function (f) { return !f.revoked && f.to == null; }).map(copyFact),
      closed: ordered.filter(function (f) { return f.to != null; }).map(copyFact)
    };
  }
  /** 诊断一行：回答「账上有多少事实、多少已闭合、多少是模型推测、有多少未决冲突」。 */
  function line(rawState) {
    try {
      const state = normalize(rawState);
      const facts = state.facts;
      if (!facts.length) return '暂无事实版本';
      const openN = facts.filter(function (f) { return !f.revoked && f.to == null; }).length;
      const closedN = facts.filter(function (f) { return f.to != null; }).length;
      const inferredN = facts.filter(function (f) { return f.origin === 'inferred'; }).length;
      const revokedN = facts.filter(function (f) { return f.revoked; }).length;
      const groups = new Map();
      for (const f of facts) {
        if (f.revoked) continue;
        const k = pairKey(f.subject, f.predicate);
        groups.set(k, (groups.get(k) || 0) + 1);
      }
      let ambiguous = 0;
      for (const [k, n] of groups) {
        if (n < 2) continue;
        const parts = k.split('\u0000');
        const r = lookup(state, { subject: parts[0], predicate: parts[1] });
        if (r.reason === 'ambiguous') ambiguous++;
      }
      const parts2 = ['事实 ' + facts.length, '有效 ' + openN, '已闭合 ' + closedN];
      if (inferredN) parts2.push('推测 ' + inferredN + '（不进现状查询）');
      if (revokedN) parts2.push('已撤销 ' + revokedN);
      if (ambiguous) parts2.push('未决 ' + ambiguous + ' ⚠️');
      return parts2.join(' · ');
    } catch (e) { return '—（事实账异常）'; }
  }
  const api = Object.freeze({
    normalize, assertFact, revokeFact, setOrigin, lookup, timeline, versionsOf, line,
    ORIGINS, ORIGIN_TRUST, DEFAULT_MIN_TRUST, REASONS, FACT_VERSION,
    originTrustOf: trustOf, factFp, pairKey
  });
  root.LonShaFactVersion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
