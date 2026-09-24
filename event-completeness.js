/* ========================================================
 * event-completeness.js — 事件完整性 [v3.194.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓已有 event-chain.js，但它管的是 **agent run 生命周期**
 *   （run_started → … → run_completed 的迁移合法性）——那是插件自己的执行流程，
 *   不是**剧情里的一个事件**。两者同名不同物，不能互相顶替。
 *   剧情侧现状：事件只在提取时被压成一句 description（index.js 的 events[]），
 *   散落在若干楼里的「为什么发生 / 做了什么 / 结果如何 / 之后怎样」被抹平成一条线。
 *   于是召回只能给出几个有关键词的碎片，回答不了「那件事最后怎么了」。
 *
 * 【本模块的职责】
 *   把分散楼层里的四类段，按事件 id 组织成一条有形状的线：
 *     cause（起因） → action（行动） → result（结果） → followup（后续）
 *   「完整性」不是布尔值，而是一份**缺什么**的清单：
 *     · 四段齐 ⇒ state='complete'
 *     · 有行动、缺结果或后续 ⇒ state='open'（**这就是未完成事项**）
 *     · 只有起因 ⇒ state='dangling'
 *   关键纪律：「这一段没来」与「这一段来了但内容为空」必须可分（后者是 rejected 记账，
 *   不是静默丢弃）。把两者混成一个值，就等于把「还没发生」和「提取漏了」混为一谈。
 *
 * 【顺序与楼层（不猜优先）】
 *   段的先后**只**按 floor 升序判定，同楼按到达顺序。缺 floor 的段标 unsequenced，
 *   排在有序段之后且**不参与**「结果早于行动」这类判断——按到达顺序充当时间顺序
 *   是本仓治理过多轮的假信号。
 *
 * 【本模块不做什么（边界）】
 *   · 不判断正文里的事件是否真发生（那是提取与人的事）；只收已确认的段。
 *   · 不自动补段。缺 result 就报缺 result，不按 summary 猜一个。
 *   · 不删未完成事项。它们正是「保留未完成事项」这条需求的交付物，淘汰只按上限走。
 *
 * 挂 window.LonShaEventCompleteness，供 index.js 提取落笔 / 召回组织 / 诊断面使用。
 * ======================================================== */
'use strict';
(function (root) {
  // [v3.207] 账本实体契约单一真源（ledger-entity.js）。取库双通道与 index.js 的 _moduleLib 同形：
  //   浏览器走全局（extra_js 在入口之后加载，故在 IIFE 内**惰性**取，不能构造期缓存）、Node 走 require。
  //   两处写法在六本账里逐字同形，便于常驻门禁按字面量扫描（tests/audit/scan_ledger_contract.mjs）。
  const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity
    : ((typeof module !== 'undefined' && module.exports) ? require('./ledger-entity.js') : (root.LonShaLedgerEntity || null));
  if (!LE) throw new Error('[lonsha] ledger-entity.js 未加载：账本实体契约缺真源（查 manifest.extra_js 加载顺序）');
  const EC_VERSION = 1;
  const MAX_EVENTS = 200;
  const MAX_SEGMENTS = 8;
  /** 段类型四态。顺序即叙事顺序，完整性判断按它推进。 */
  const ROLES = Object.freeze(['cause', 'action', 'result', 'followup']);
  /** 事件状态三态。open 即「未完成事项」——它必须能被单独列出来。 */
  const STATES = Object.freeze(['dangling', 'open', 'complete']);
  /** 来源四态（与 fact-version 同族但独立命名空间，避免两模块互相绑死）。 */
  const ORIGINS = Object.freeze(['confirmed', 'stated', 'inferred', 'system']);
  const ORIGIN_TRUST = Object.freeze({ confirmed: 1, stated: 0.8, inferred: 0.3, system: 0 });

  // [v3.207] text / finite 由账本实体契约提供（原为六本账各自抄一份，逐字相同）。
  const text = LE.text;
  const finite = LE.finite;
  function originOf(o) {
    return ORIGINS.includes(o) ? o : 'stated';
  }
  function copySegment(s) {
    return {
      role: ROLES.includes(s.role) ? s.role : 'action',
      text: text(s.text, 160),
      floor: finite(s.floor),
      source: text(s.source, 40),
      origin: originOf(s.origin),
      eventKey: text(s.eventKey, 120),
      at: finite(s.at)
    };
  }
  function copyEvent(e) {
    return {
      id: text(e.id, 48),
      title: text(e.title, 60),
      actors: Array.isArray(e.actors) ? e.actors.map(function (a) { return text(a, 40); }).filter(Boolean).slice(0, 6) : [],
      segments: Array.isArray(e.segments) ? e.segments.map(copySegment).slice(-MAX_SEGMENTS) : [],
      abandoned: e.abandoned === true,
      abandonReason: text(e.abandonReason, 80),
      // [v3.207] 修订号读回走契约。
      revision: LE.revisionOf(e)
    };
  }
  function clone(state) {
    return {
      version: EC_VERSION,
      seq: finite(state && state.seq) || 0,
      events: Array.isArray(state && state.events) ? state.events.map(copyEvent) : []
    };
  }
  /** 规范化：丢无标题条目、丢重复 id。**不丢缺段的条目**——缺段正是它的意义所在。 */
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.events = state.events.filter(function (e) {
      if (!e.id || !e.title) return false;
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    }).slice(-MAX_EVENTS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'evt_' + state.seq;
  }
  function findEvent(state, ref) {
    const id = text(ref && ref.id, 48);
    if (id) return state.events.find(function (e) { return e.id === id; }) || null;
    const title = text(ref && ref.title, 60);
    if (!title) return null;
    return state.events.find(function (e) { return text(e.title).toLowerCase() === title.toLowerCase(); }) || null;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, changed: false, state: normalize(state) }, extra || {});
  }
  function reject(state, reason) {
    return { ok: false, changed: false, reason: reason, state: normalize(state) };
  }
  /** 按楼层排序（同楼按到达序）。缺楼层的排后面并记入 unsequenced。 */
  function orderedSegments(segs) {
    const withFloor = [];
    const noFloor = [];
    segs.forEach(function (s, i) {
      if (s.floor == null) noFloor.push({ s: s, i: i });
      else withFloor.push({ s: s, i: i });
    });
    withFloor.sort(function (a, b) { return a.s.floor - b.s.floor || a.i - b.i; });
    return {
      ordered: withFloor.map(function (x) { return x.s; }).concat(noFloor.map(function (x) { return x.s; })),
      unsequenced: noFloor.length
    };
  }
  /** 完整性：返回 { state, present[], missing[], counts, unsequenced, outOfOrder }。 */
  function completeness(evt) {
    const present = [];
    const missing = [];
    const counts = {};
    for (const r of ROLES) {
      const n = evt.segments.filter(function (s) { return s.role === r; }).length;
      counts[r] = n;
      if (n > 0) present.push(r); else missing.push(r);
    }
    const ord = orderedSegments(evt.segments);
    // 越序检测：有序段里 result 的楼层早于 action —— 这是真信号（提取把两件事接错了），
    //   而不是「缺楼层所以判不了」。故只在两侧都有楼层时判。
    let outOfOrder = false;
    const firstAction = ord.ordered.find(function (s) { return s.role === 'action' && s.floor != null; });
    const firstResult = ord.ordered.find(function (s) { return s.role === 'result' && s.floor != null; });
    if (firstAction && firstResult && firstResult.floor < firstAction.floor) outOfOrder = true;
    let st;
    if (evt.abandoned) st = 'dangling';
    else if (counts.action === 0) st = 'dangling';   // 无行动就不成线：仅有起因也只是悬着
    else if (counts.result > 0 && counts.followup > 0) st = 'complete';
    else st = 'open';
    return {
      state: st, present: present, missing: missing, counts: counts,
      unsequenced: ord.unsequenced, outOfOrder: outOfOrder
    };
  }
  /**
   * 开一条事件线（幂等：同标题返回既有条目，不新建）。
   * input = { id?, title, actors?, floor?, source? }
   */
  function openEvent(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const title = text(i.title, 60);
    if (!title) return reject(state, 'missing-title');
    const existing = findEvent(state, { title: title });
    if (existing) return result(state, { event: copyEvent(existing), replayed: true, created: false });
    const evt = copyEvent({
      id: text(i.id, 48) || nextId(state), title: title, actors: i.actors,
      segments: [], revision: LE.REVISION.CREATE
    });
    state.events.push(evt);
    return result(state, { event: copyEvent(evt), replayed: false, created: true, changed: true });
  }
  /**
   * 追加一段。这是本模块的核心写入面。
   * input = { id? , title?, role, text, floor, source, origin, eventKey }
   * 幂等：同 (role, eventKey) 重复到达不重复入账（重复提取不翻倍）。
   * 空文本 ⇒ rejected:empty-segment（**不是**静默丢弃——「来了但为空」要看得见）。
   */
  function addSegment(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const role = text(i.role, 24);
    if (!ROLES.includes(role)) return reject(state, 'unknown-role');
    const body = text(i.text, 160);
    if (!body) return reject(state, 'empty-segment');
    let evt = findEvent(state, i);
    let autoOpened = false;
    if (!evt) {
      const title = text(i.title, 60) || text(i.id, 48);
      if (!title) return reject(state, 'event-not-found');
      // 就地新建：不能拿 openEvent 返回的规范化副本往下写（那是另一个对象，改了不进 state）。
      const t2 = text(title, 60);
      const dupTitle = state.events.find(function (e) { return text(e.title).toLowerCase() === t2.toLowerCase(); });
      if (dupTitle) evt = dupTitle;
      else {
        evt = { id: text(i.id, 48) || nextId(state), title: t2,
          actors: (Array.isArray(i.actors) ? i.actors : []).map(function (x) { return text(x, 40); }).filter(Boolean).slice(0, 6),
          segments: [], abandoned: false, abandonReason: '', revision: LE.REVISION.CREATE };
        state.events.push(evt);
        autoOpened = true;
      }
    }
    const eventKey = text(i.eventKey, 120);
    if (eventKey) {
      const dup = evt.segments.find(function (s) { return s.role === role && s.eventKey && s.eventKey === eventKey; });
      if (dup) {
        const snap = copyEvent(evt);
        return result(state, { event: snap, segment: copySegment(dup), replayed: true, duplicated: true, autoOpened: autoOpened, completeness: completeness(snap) });
      }
    }
    evt.segments.push(copySegment({ role: role, text: body, floor: i.floor, source: i.source, origin: i.origin, eventKey: eventKey, at: i.at }));
    LE.bumpRevision(evt);
    const snap = copyEvent(evt);
    return result(state, { event: snap, segment: snap.segments[snap.segments.length - 1], replayed: false, duplicated: false, autoOpened: autoOpened, changed: true, completeness: completeness(snap) });
  }
  /** 放弃一条事件（「未完成事项」的一种终局：不再等它了，但记录放弃理由）。 */
  function abandonEvent(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const evt = findEvent(state, i);
    if (!evt) return reject(state, 'event-not-found');
    if (evt.abandoned) return result(state, { event: copyEvent(evt), replayed: true, changed: false });
    evt.abandoned = true;
    evt.abandonReason = text(i.reason, 80);
    LE.bumpRevision(evt);
    return result(state, { event: copyEvent(evt), replayed: false, changed: true });
  }
  /** 未完成事项名单（缺结果或后续、且未放弃）——计划点名「保留未完成事项」的直接交付物。 */
  function outstanding(rawState, filter) {
    const state = normalize(rawState);
    const f = filter || {};
    const actor = text(f.actor, 40).toLowerCase();
    return state.events.filter(function (e) {
      if (e.abandoned) return false;
      const c = completeness(e);
      if (c.state === 'complete') return false;
      if (c.state === 'dangling') return false;   // 只有起因/无行动 ⇒ 还谈不上「未完成」，不算事项
      if (actor && !e.actors.some(function (a) { return a.toLowerCase() === actor; })) return false;
      return true;
    }).map(function (e) { return Object.assign(copyEvent(e), { completeness: completeness(e) }); });
  }
  /** 单条事件的组织视图（起因—行动—结果—后续按序排好，标出缺哪段）。 */
  function thread(rawState, ref) {
    const state = normalize(rawState);
    const evt = findEvent(state, ref);
    if (!evt) return { ok: false, reason: 'event-not-found', segments: [], completeness: null };
    const ord = orderedSegments(evt.segments);
    return {
      ok: true, id: evt.id, title: evt.title, actors: evt.actors.slice(),
      segments: ord.ordered.map(function (s) { return copySegment(s); }),
      completeness: completeness(evt),
      abandoned: evt.abandoned, abandonReason: evt.abandonReason
    };
  }
  /** 渲染成一行行文本（召回注入用）。缺段要显式写出来，不假装完整。 */
  function render(rawState, ref, limit) {
    const t = thread(rawState, ref);
    if (!t.ok) return '';
    const label = { cause: '起因', action: '行动', result: '结果', followup: '后续' };
    const rows = t.segments.slice(-(finite(limit) || MAX_SEGMENTS)).map(function (s) {
      return '- [' + label[s.role] + ']' + (s.floor != null ? '（' + s.floor + '楼）' : '') + s.text;
    });
    if (!rows.length) return '';
    const miss = t.completeness.missing.map(function (r) { return label[r]; }).join('/');
    const tail = t.completeness.state === 'complete' ? ''
      : '（这条线还缺：' + (miss || '—') + (t.completeness.outOfOrder ? '；⚠️ 结果早于行动，疑似接线错' : '') + '）';
    return '【' + t.title + '】' + tail + '\n' + rows.join('\n');
  }
  /** 诊断一行。 */
  function line(rawState) {
    try {
      const state = normalize(rawState);
      if (!state.events.length) return '暂无事件线';
      let complete = 0, open = 0, dangling = 0, abandoned = 0, bad = 0;
      for (const e of state.events) {
        if (e.abandoned) { abandoned++; continue; }
        const c = completeness(e);
        if (c.state === 'complete') complete++;
        else if (c.state === 'open') open++;
        else dangling++;
        if (c.outOfOrder) bad++;
      }
      const parts = ['事件 ' + state.events.length, '完整 ' + complete, '未完成 ' + open];
      if (dangling) parts.push('仅有起因 ' + dangling);
      if (abandoned) parts.push('已放弃 ' + abandoned);
      if (bad) parts.push('越序 ' + bad + ' ⚠️');
      return parts.join(' · ');
    } catch (e) { return '—（事件账异常）'; }
  }
  const api = Object.freeze({
    normalize, openEvent, addSegment, abandonEvent, outstanding, thread, render, line, completeness,
    ROLES, STATES, ORIGINS, ORIGIN_TRUST, EC_VERSION, orderedSegments
  });
  root.LonShaEventCompleteness = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);