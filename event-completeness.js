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
  const EC_VERSION = 2;   // [v3.233.0] F-2：平台构成面（state.version 随之升；条目字段面不变，旧档读出逐字一致）
  const MAX_EVENTS = 200;
  const MAX_SEGMENTS = 8;
  /** 段类型四态。顺序即叙事顺序，完整性判断按它推进。 */
  const ROLES = Object.freeze(['cause', 'action', 'result', 'followup']);
  /** 事件状态三态。open 即「未完成事项」——它必须能被单独列出来。 */
  const STATES = Object.freeze(['dangling', 'open', 'complete']);
  /** 来源四态（与 fact-version 同族但独立命名空间，避免两模块互相绑死）。 */
  const ORIGINS = Object.freeze(['confirmed', 'stated', 'inferred', 'system']);
  const ORIGIN_TRUST = Object.freeze({ confirmed: 1, stated: 0.8, inferred: 0.3, system: 0 });
  /**
   * [v3.233.0] F-2 平台词表（**受控**，单一真源）。
   *
   * 【为什么需要这一面 / 修前实测后果】
   *   计划 F-2 的原话是「上游 event-completeness.js / event-chain.js 外供平台维度读数」。
   *   实测两件事：
   *     ① `event-chain.js` 管的是 **agent run 生命周期**（run_started → … → run_completed
   *        的迁移合法性），与「剧情事件的平台」无关——计划行文把两个同名不同物的模块
   *        混成了一件事（陈旧/不准确记载，本版据实改写）。
   *     ② 真正的缺口在事件段的 `source` 字段：它是 **40 字自由文本**，全仓唯一赋值点是
   *        `index.js:_absorbEventSegments` 写死的 `'extract'`。把 `'phone:diary'` 与
   *        `'phone:weibo'` 两种来源**压成一态**读不出来，下游织光机也就无法回答
   *        「这条是插件从正文提的，还是手机 App 里发生的」。
   *
   * 【本词表做什么、不做什么】
   *   · 做：给自由文本一个**分级归因**（同 plan 的 T11「不作文本猜测归类」纪律）：
   *       extract ⇒ 上游提取；`<平台>:<子源>` ⇒ 登记方显式给了平台；
   *       `other:<原串>` ⇒ 给了但不是本仓已知平台（**保留原串**，不丢弃、不猜成 extract）；
   *       none ⇒ 压根没给。四态处置各不相同，压成一态就是错读数。
   *   · 不做：不凭正文猜平台（同 T11；「规则错」不得被读成「普通事实」）。
   *   · 不做：不改变 `addSegment` 的写入语义（`source` 仍原样存 40 字，旧档读出逐字不变）。
   *   词表顺序即平台列表顺序（构成与归因共用同一份真源，不另处再写一遍）。
   */
  const SOURCE_PLATFORMS = Object.freeze(['phone', 'plugin', 'world', 'chat']);
  /** 段来源归因四态。unknown 与 none 必须可分（同本仓反复治理的「三态塌成两态」）。 */
  const SOURCE_LEVELS = Object.freeze(['extract', 'platform', 'other', 'none']);

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
      // [v3.233.0] F-2：**楼层不得走 `finite()` 的 null 塔缩**。
      //   实测缺陷：共享契约 `ledger-entity.js:finite(null)` 返回 **0**
      //   （`Number(null) === 0` 且有限），而 `finite(undefined)` 返回 null。
      //   后果是本函数**非幂等**：第一次 copy 把「没给」undefined 塔成 null，
      //   第二次 copy（normalize 会再走一遍 copyEvent→copySegment）又把 null 塔成 0 ——
      //   于是 `addSegment` 在调用方**从未说过第 0 楼**的情况下写出 `floor: 0`，
      //   而 0 在本仓是「第 0 楼」这个**真楼层**（见 O-1/O-2、T8 同族治理）。
      //   修法：显式分「没给/给了空」（两者对段楼层同义，一律 null）与真值（含真 0）。
      //   仍走 finite 做数值归一，但先排掉 null/undefined —— 不得把两者送进去。
      floor: (s.floor == null ? null : finite(s.floor)),
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
  /**
   * [v3.233.0] F-2 平台维度：把「段的 source 自由文本」折算成**分级归因**（纯函数，只读）。
   *
   * 为什么单独成函数而不写进 completeness()：那是**一条线**的叙事完整度；本面是
   * **来源组成**——两个不同的问题，压成一个读数就会把「这条线缺结果」与「这条线全是手机侧事件」
   * 混成一件事（本仓三态纪律）。
   *
   * 取值分级（顺序即判定顺序，全部字面量精确匹配，不做任何模糊猜测）：
   *   'extract'            ⇒ 上游提取（本仓唯一写入值，逐字认）
   *   `${p}:${rest}`       ⇒ p 在 SOURCE_PLATFORMS 内 ⇒ platform（rest 可空，不给则 label 用 p）
   *   其它非空文本           ⇒ other（**原串保留**；「给了但本仓不认识」≠「没给」）
   *   空 / 非字符串         ⇒ none
   *
   * @param {string} raw 段上的 source 原值
   * @returns {{level:string, platform:string, label:string}}
   */
  function sourceFace(raw) {
    const s = text(raw, 40);
    if (!s) return { level: 'none', platform: '', label: '' };
    if (s === 'extract') return { level: 'extract', platform: '', label: 'extract' };
    const i = s.indexOf(':');
    if (i > 0) {
      const p = s.slice(0, i);
      const rest = s.slice(i + 1);
      if (SOURCE_PLATFORMS.indexOf(p) >= 0) {
        return { level: 'platform', platform: p, label: rest ? (p + ':' + rest) : p };
      }
    }
    return { level: 'other', platform: '', label: s };
  }

  /**
   * [v3.233.0] F-2：事件线的**平台构成**读数（纯函数，只读，有界）。
   *
   * 返回面恒定（下游可按键断言，不必猜缺哪个键）：
   *   { ok, reason, events, segments, platforms[], levels{}, unlabeled, truncated }
   *   · platforms —— 受控词表顺序里**真出现过**的平台（含计数与段数），空则 []
   *   · levels    —— {extract, platform, other, none} 四态计数（**四态齐**，缺一态也给 0）
   *   · unlabeled —— 没给来源的段数（不是错误，是读数；同 coPresence 的「没给楼层」）
   *   · events    —— 逐线：{id, title, floor, segments, levels, platforms[]}
   *                 floor 取**首段的楼层**（事件顶层本无 floor 字段，见 v3.233 修的出处缺陷）
   *   · truncated —— 有上限且**如实报**（计数始终是截断前的真实条数）
   *
   * 【边界：只给构成，不给判断】
   *   本方法答得出「这条线里几个段来自手机侧」，答不出「手机侧的事件更可信/更重要」——
   *   那是产品决定，不在这里做（与 F-3「只给事实」同纪律）。
   */
  function platformFace(rawState, opts) {
    const o = opts || {};
    const maxEvents = finite(o.maxEvents) || MAX_EVENTS;
    const maxSegs = finite(o.maxSegmentsPerEvent) || MAX_SEGMENTS;
    const state = normalize(rawState);
    const levels = { extract: 0, platform: 0, other: 0, none: 0 };
    const byPlatform = {};
    const allEvents = [];
    let segTotal = 0;
    let unlabeled = 0;
    let counted = 0;
    for (const e of state.events) {
      const segs = Array.isArray(e.segments) ? e.segments.slice(-maxSegs) : [];
      const eLevels = { extract: 0, platform: 0, other: 0, none: 0 };
      const ePlats = {};
      for (const s of segs) {
        const f = sourceFace(s.source);
        levels[f.level] += 1;
        eLevels[f.level] += 1;
        segTotal += 1;
        if (f.level === 'none') unlabeled += 1;
        else if (f.level === 'platform') {
          const k = f.platform;
          byPlatform[k] = byPlatform[k] || { platform: k, segments: 0, events: 0 };
          byPlatform[k].segments += 1;
          ePlats[k] = (ePlats[k] || 0) + 1;
        }
      }
      // 逐线：只有含段的线才计入构成（空线是「开过还没落段」，不进构成）
      if (segs.length) {
        const firstFloor = (function () {
          for (const s of segs) { if (s.floor != null) return s.floor; }
          return null;
        })();
        allEvents.push({
          id: e.id, title: e.title, floor: firstFloor,
          segments: segs.length, levels: eLevels,
          platforms: SOURCE_PLATFORMS.filter(function (p) { return ePlats[p]; })
            .map(function (p) { return { platform: p, segments: ePlats[p] }; })
        });
        // 每平台的**覆盖线数**在全量上统计（不得受 maxEvents 影响：
        //   截断只缩展示面，计数必须是真值——否则同一返回面里 segments 是真实值、
        //   events 是截断值，读者无法分辨「平台只覆盖 2 条线」与「展示上限是 2」）。
        for (const p of Object.keys(ePlats)) {
          if (byPlatform[p]) byPlatform[p].events += 1;
        }
        counted += 1;
      }
    }
    const platforms = SOURCE_PLATFORMS.map(function (p) { return byPlatform[p]; }).filter(Boolean);
    const events = allEvents.slice(0, maxEvents);
    return {
      ok: true, reason: state.events.length ? 'ok' : 'no-events',
      events: events, segments: segTotal,
      platforms: platforms, levels: levels,
      unlabeled: unlabeled, countedEvents: counted,
      truncated: counted > maxEvents
    };
  }

  /** 平台构成的一行诊断（与 line() 同风格；无段时不假装有读数）。 */
  function platformLine(rawState) {
    try {
      const f = platformFace(rawState, {});
      if (!f.segments) return '暂无事件段';
      const parts = ['段 ' + f.segments];
      if (f.levels.extract) parts.push('上游提取 ' + f.levels.extract);
      for (const p of f.platforms) parts.push(p.platform + ' ' + p.segments);
      if (f.levels.other) parts.push('其它来源 ' + f.levels.other + ' ⚠');
      if (f.levels.none) parts.push('未标来源 ' + f.levels.none);
      return parts.join(' · ');
    } catch (e) { return '—（平台构成异常）'; }
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
    ROLES, STATES, ORIGINS, ORIGIN_TRUST, EC_VERSION, orderedSegments,
    SOURCE_PLATFORMS, SOURCE_LEVELS, sourceFace, platformFace, platformLine
  });
  root.LonShaEventCompleteness = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);