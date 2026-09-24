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
   *   multiple      —— [v3.211] 同格挂着 N 条**并列**事实（多值类型，如事件结果/线索/场景事实）；
   *                   与 ambiguous 处置相反：那些事实本来就不该互相压，不存在裁决问题
   *   unversioned   —— 给了 at，但账上所有版本都没有楼层区间，无法按时点取
   *   unknown-type  —— [v3.211] 查询给了 type 但类型校验器不认（拼错/已改名）。
   *                   **不得**与 none 同形：那是「你问错了」，不是「账上没有」。
   */
  const REASONS = Object.freeze(['ok', 'invalid', 'none', 'none-current', 'none-trusted', 'none-revoked', 'ambiguous', 'multiple', 'unversioned', 'unknown-type']);

  /**
   * [v3.210] 冲突处置策略四态（由 memory-type.js 按类型选择；本账只执行，不决定谁用哪个）。
   *   auto       按时间序换代（本账原有行为，缺省值——保证向后兼容）
   *   coexist    永不换代，值不同即并存
   *   prefer-new 新值无条件闭合旧值
   *   forbid     矛盾拒绝写入（返回 ok:false / reason:'conflict-forbidden'）
   */
  const CONFLICT_POLICIES = Object.freeze(['auto', 'coexist', 'prefer-new', 'forbid']);

  /**
   * [v3.211] 类型校验器（由 memory-type.js 注入）。
   *   为什么不直接在本账里写一份类型名清单：那是**第二份真源**。本仓治理过多轮「改一处漏五处」——
   *   类型系统加了一型，账本不认，就会分裂成「模块认、账本不认」。故这里只留一个**可注入的钩子**，
   *   判据（清单）留在类型系统里。
   *   未注入时的行为是**降级放行**（退回 v3.210 口径）：不擅自定义「未知」，也不新增拒绝——
   *   否则单独加载本模块的既有测试会平白翻红，而那种翻红并不能证明任何真实缺陷。
   *   注入后 `lookup({type})` 收到未识别的类型名即拒绝（见 lookup：`unknown-type`）。
   */
  let TYPE_VALIDATOR = null;
  /** 注入类型校验器（memory-type.normalizeType 同形态：认 → 真值，不认 → 假值）。传非函数即注销。 */
  function setTypeValidator(fn) {
    TYPE_VALIDATOR = (typeof fn === 'function') ? fn : null;
    return TYPE_VALIDATOR != null;
  }
  /**
   * 类型位三态（**必须可分**，本仓三态纪律）：
   *   absent  —— 压根没给类型（调用方不做类型维度查询，走全量）
   *   ok      —— 给了，且被认（可能是校验器缺席时的降级放行）
   *   unknown —— 给了，但校验器说它不合法（**拒绝**，不得当成 absent 或 数据没有）
   * 把 unknown 压成 absent，就把「你问错了」读成「你没问」；压成「数据没有」，就是本版要修的病。
   */
  function typeStateOf(type) {
    if (type == null || type === '') return 'absent';
    if (TYPE_VALIDATOR == null) return 'ok';
    return TYPE_VALIDATOR(text(type, 32)) ? 'ok' : 'unknown';
  }

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
      // [v3.210] 记忆类型标注（memory-type.js 的类型名）。本账**不校验**类型合法性——
      //   校验是 memory-type 的职责（单一真源）；这里只当**不透明字符串**存，
      //   否则类型清单会有两份拷贝（本仓治理过多轮的「改一处漏五处」）。
      //   空/缺省一律读回 null（不写空串：空串会让「没标注」与「标注为空」同形）。
      type: (f.type == null || f.type === '') ? null : text(f.type, 32),
      // [v3.211] 落账时的冲突策略（多值对键判断的依据）。缺/非法一律读回 'auto' ——
      //   v3.210 及更早的条目没有该字段，语义本来就是 auto，故这是**向后兼容的读回口径**，
      //   不是「默认值兜底」：写进去的一定是四态之一（assertFact 已过滤非法值）。
      //   ⚠️ 字段名**不得**叫 `conflict`：assertFact 的**返回体**上已有 `conflict`（布尔，
      //   表示「本次写入与既有取值分歧」）。同名不同义会让 `f.conflict` 的读者拿
      //   字符串当布尔用（真实翻红：v3210 组 3 断言 `rE.conflict === true`）。
      //   条目侧字段名与入参名一致（conflictPolicy），语义也一致：策略名。
      conflictPolicy: CONFLICT_POLICIES.includes(f.conflictPolicy) ? f.conflictPolicy : 'auto',
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
  /**
   * [v3.211] 多值类型（coexist）口径的**唯一真源**：这类类型的语义是「值不同即并列，永不互相压」。
   *   为什么提成常量而不是各处写 'coexist' 字面量：判据（lookup 的 multiple 分支、诊断报价）
   *   与调用点必须共用**同一份口径**，否则改名时会出现「一半认一半不认」。
   *   注：曾把「值并入对键」当作 coexist 的实现（pairKeyFor），实测有害已撤 —— 见 assertFact 内说明。
   */
  const MULTI_VALUE_POLICY = 'coexist';
  /** conflictPolicy ⇒ 是否多值对键（**唯一真源**，调用点不得各写各的 if）。 */
  function isMultiValue(policy) {
    return policy === MULTI_VALUE_POLICY;
  }
  /** 内容指纹：同一事实重复提取不应重复登记（幂等键）。[v3.210] 类型参与指纹——同内容但类型不同是两条不同事实。 */
  function factFp(f) {
    return [text(f.subject).toLowerCase(), text(f.predicate).toLowerCase(), text(f.value).toLowerCase(),
      originOf(f.origin), f.from == null ? '*' : finite(f.from), f.to == null ? '*' : finite(f.to),
      (f.type == null || f.type === '') ? '*' : text(f.type, 32).toLowerCase()].join('\u0001');
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
   * input = { subject, predicate, value, origin, from, to, floor, source, evidence, eventKey, type, conflictPolicy }
   *   · from/to 是**剧情楼层号**（可空）。空 from = 无法定位起点。
   *   · type 是**不透明类型标注**（由 memory-type.js 校验合法性；本账只存不判）。
   *   · conflictPolicy [v3.210] 冲突处置策略，四态（缺省 'auto' = 本账原有行为，向后兼容）：
   *       auto       两侧都有 from 且新 from 更大 ⇒ 判「状态更新」，闭合并换代；否则并存标 unsequenced。
   *       coexist    永不换代：值不同即并存（事件结果/叙事线索/场景事实——它们**不该互相压**）。
   *       prefer-new 新值**无条件**闭合旧值（玩家偏好：新偏好压旧偏好，不需要时间序）。
   *       forbid     矛盾**拒绝写入**（世界规则：矛盾=提取错了，不得静默并存成两条「都有效」）。
   *     关键纪律：四种策略的**返回形状必须可分**——forbid 拒绝返回 ok:false + reason:'conflict-forbidden'，
   *     与 coexist 的「并存且 ok:true」绝不能同形，否则调用方无法分辨「没写进去」与「写进去并存了」。
   */
  function assertFact(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const subject = text(i.subject, 40);
    const predicate = text(i.predicate, 40);
    const value = text(i.value, 120);
    if (!subject || !predicate || !value) return reject(state, 'missing-fact');
    const type = (i.type == null || i.type === '') ? null : text(i.type, 32);
    const policy = CONFLICT_POLICIES.includes(i.conflictPolicy) ? i.conflictPolicy : 'auto';
    // [v3.211] 对键**不按策略分流**（曾试行「coexist 把值并入对键」，实测有害，勿回退）：
    //   把值并入对键后，同一格的两条 coexist 落在**两个不同对键**上 ——
    //   ① `versionsOf`（按 pairKey 取该格**全部**版本）会漏掉另一条，时间线视图残缺；
    //   ② 依赖 pairKey 的一致性路径（幂等判重、换代定位、诊断）整体错位；
    //   ③ 真实翻红：v3210 组 3 的 coexist 用例（两条都有效 + 标记冲突）立刻不成立。
    //   正确做法是**语义在查询侧分**（ambiguous = 冲突未决 / multiple = 并列事实），
    //   存储侧对键保持既有口径不变（见 lookup 的 multiple 分支）。
    const pkey = pairKey(subject, predicate);
    const fp = factFp({ subject: subject, predicate: predicate, value: value, origin: i.origin, from: i.from, to: i.to, type: type });
    const dup = state.facts.find(function (f) { return factFp(f) === fp; });
    if (dup) {
      const replayed = true;
      return result(state, { fact: copyFact(dup), replayed: replayed, changed: false, superseded: [], conflict: false, sequenced: true });
    }
    // 同对、未闭合、值不同 ⇒ 冲突候选
    const open = state.facts.filter(function (f) {
      return pairKey(f.subject, f.predicate) === pkey && !f.revoked && f.to == null;
    });
    const differing = open.filter(function (f) { return text(f.value).toLowerCase() !== value.toLowerCase(); });
    const newFrom = i.from == null ? null : finite(i.from);
    // [v3.211] 策略需要**写进条目**（字段名 `conflictPolicy`，与入参同名同义）：此前它只活在
    //   一次调用的局部变量里 —— 落盘后账上读不回「这条当初是按什么处置语义写进来的」，
    //   于是导出/跨会话/诊断面全看不见，只能靠返回体当场看（返回体不落盘）。
    //   为什么读回口径必须是策略名而不是布尔：`lookup` 的 multiple 分支要判「这一格上的
    //   并列条目是否全都按 coexist 写入」（ambiguous = 冲突未决 / multiple = 并列事实，
    //   两者处置相反），布尔表达不了「按哪种策略」。
    //   字段名**不得**叫 `conflict`：assertFact 的返回体上已有同名字段（布尔，表示本次写入
    //   是否与既有取值分歧）；同名不同义会让读者拿策略名当布尔判（真实翻红：v3210 组 3）。
    const factConflict = policy;
    // [v3.210] 按策略决定换代/并存/拒绝。auto 保持原逻辑（仅当两侧都有 from 且新 from 更大才换代）。
    if (policy === 'forbid' && differing.length > 0) {
      // 世界规则矛盾 = 提取错了。**拒绝写入**并把对侧点名，绝不并存成两条「都有效」。
      return {
        ok: false, changed: false, reason: 'conflict-forbidden', policy: policy,
        conflictWith: differing.map(function (f) { return f.id; }),
        state: normalize(state)
      };
    }
    let allSequenced = false;
    if (policy === 'auto') {
      allSequenced = differing.length > 0 && newFrom != null
        && differing.every(function (f) { return f.from != null && newFrom > f.from; });
    } else if (policy === 'prefer-new') {
      allSequenced = differing.length > 0;                 // 新值无条件压旧值
    }                                                    // coexist ⇒ allSequenced 恒 false（只并存）
    const fact = copyFact({
      id: nextId(state), subject: subject, predicate: predicate, value: value, type: type,
      conflictPolicy: factConflict,
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
      fact: copyFact(fact), replayed: false, changed: true, policy: policy,
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
   * 查询。q = { subject, predicate?, at?, minTrust?, type? }
   *   at == null  ⇒ 「现在」：取 to 为空的版本
   *   at 给定      ⇒ 取覆盖该时点的版本
   * 返回 { ok, reason, fact, facts, versions, excludedByTrust, excludedByRevoked, unknownType? }。
   * 注意 ok 只表示「查询执行成功」，取没取到看 reason——两者不是一件事。
   *
   * [v3.211] type 过滤的**未知类型**必须与「确实没有」可分（本仓三态纪律）：
   *   修前实测：`lookup(st, {subject:'A', predicate:'居住', type:'chracter-state'})`（拼错）
   *   返回 `{ok:true, reason:'none', facts:[]}` —— 与「这个主语从没有过该属性的事实」
   *   **完全同形**。调用方据此读到「没有这条事实」，而不是「你类型名写错了」。
   *   这正是本仓治理过多轮的「判不了就报价，不静默」那类病：拼错类型名会让一条**存在**的事实
   *   静默消失，而唯一的线索是「查不到」。故这里显式拒绝：ok:false + reason:'unknown-type'
   *   + 把未识别的类型名回报在 unknownType（可归因，不是「查无此物」）。
   *   注意判据只在**给了 type** 时生效；给了合法类型而账上确实没该类型 ⇒ 仍是 ok:true/none
   *   （这两态语义不同：前者是「你问错了东西」，后者是「账上真没有」）。
   */
  function lookup(rawState, q) {
    const state = normalize(rawState);
    const query = q || {};
    const subject = text(query.subject, 40);
    if (!subject) return { ok: false, reason: 'invalid', fact: null, facts: [], versions: [], excludedByTrust: 0, excludedByRevoked: 0, state: state };
    const minTrust = Number.isFinite(Number(query.minTrust)) ? Number(query.minTrust) : DEFAULT_MIN_TRUST;
    // [v3.210] 可选类型过滤：给了 type 就只在该类型内查（同 (subject,predicate) 可挂不同类型，
    //   例如「A 对 B 的信任」既是人物状态也可能是关系状态——按类型分开查才不串）。
    // [v3.211] 未知类型名 ⇒ 拒绝（见上方说明），不复用 'none'（那会把「写错」读成「没有」）。
    const wantType = (query.type == null || query.type === '') ? null : text(query.type, 32);
    // [v3.211] 校验器注入后，用**三态**判定（absent / ok / unknown），不再本地写死清单：
    //   清单真源在 memory-type.js，本账只问「这个类型名认不认」。校验器缺席 ⇒ 退回 v3.210 的
    //   放行口径（不影响单独加载本模块的既有测试），但**绝不**把 unknown 当成 none。
    const tState = typeStateOf(query.type);
    if (tState === 'unknown') {
      return { ok: false, reason: 'unknown-type', unknownType: wantType, fact: null, facts: [], versions: [], excludedByTrust: 0, excludedByRevoked: 0, state: state };
    }
    const all = versionsOf(state, subject, query.predicate).filter(function (f) {
      if (wantType == null) return true;
      return ((f.type == null || f.type === '') ? null : f.type) === wantType;
    });
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
      // [v3.211] 多值类型（coexist）的「多条并列」不得读成「冲突未决」——两者处置相反：
      //   ambiguous = 同一格上有两个说不清谁新的取值（调用方**不该**任选一个）；
      //   multiple  = N 条**各自独立**的事实（事件结果/线索/场景事实本来就不该互相压，
      //               调用方可以如实全部用，也可以按 from 取最新的一条，不存在「裁决」问题）。
      //   修前实测：E 的「结果=A 赢了」「结果=B 赢了」两条 coexist 并存后，现状查询
      //   返回 ambiguous —— 把「并列事实」读成了「矛盾」，正是本版要修的那类三态压一态。
      const allMulti = picked.every(function (f) { return f.conflictPolicy === MULTI_VALUE_POLICY; });
      if (allMulti) {
        const ordered = uniq.slice().sort(function (a, b) {
          const fa = a.from == null ? -1 : finite(a.from);
          const fb = b.from == null ? -1 : finite(b.from);
          return fa - fb || String(a.id).localeCompare(String(b.id));
        });
        return Object.assign(base, { reason: 'multiple', fact: null, facts: ordered.map(copyFact), multi: ordered.length });
      }
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
      let ambiguous = 0, multiGroups = 0;
      for (const [k, n] of groups) {
        if (n < 2) continue;
        const parts = k.split('\u0000');
        const r = lookup(state, { subject: parts[0], predicate: parts[1] });
        if (r.reason === 'ambiguous') ambiguous++;
        else if (r.reason === 'multiple') multiGroups++;
      }
      const parts2 = ['事实 ' + facts.length, '有效 ' + openN, '已闭合 ' + closedN];
      if (inferredN) parts2.push('推测 ' + inferredN + '（不进现状查询）');
      if (revokedN) parts2.push('已撤销 ' + revokedN);
      if (ambiguous) parts2.push('未决 ' + ambiguous + ' ⚠️');
      // [v3.211] 并列组单列：多值类型（coexist）的「同格 N 条」是**正常形态**，不是未决冲突。
      //   把两者并成「未决」会让「事件结果记了两条」看起来像出了错；不报又会让它彻底不可见。
      if (multiGroups) parts2.push('并列 ' + multiGroups + ' 组（多值类型）');
      // [v3.210] 类型分布：回答「账上事实都标了类型没有」。未归类条目报数（不静默）。
      const typedN = facts.filter(function (f) { return !f.revoked && f.type; }).length;
      const untypedN = facts.filter(function (f) { return !f.revoked && !f.type; }).length;
      if (typedN) parts2.push('已标类型 ' + typedN);
      if (untypedN) parts2.push('未标类型 ' + untypedN);
      return parts2.join(' · ');
    } catch (e) { return '—（事实账异常）'; }
  }
  const api = Object.freeze({
    normalize, assertFact, revokeFact, setOrigin, lookup, timeline, versionsOf, line,
    ORIGINS, ORIGIN_TRUST, DEFAULT_MIN_TRUST, REASONS, FACT_VERSION,
    // [v3.210] 冲突策略清单随账导出：断言方（memory-type.assertTyped / index.js 接线）
    //   从账侧取常量，避免在外部再抄一份四态清单（本仓治理：单一真源）。
    CONFLICT_POLICIES,
    // [v3.211] 类型校验器注入口 + 类型位三态 + 多值对键口径（都随账导出，调用点不得各写各的）：
    //   · setTypeValidator —— 由 memory-type.js 在加载时注入（账本不持有第二份类型清单）；
    //   · typeStateOf       —— absent / ok / unknown 三态，供调用方与诊断面复用同一口径；
    //   · isMultiValue / MULTI_VALUE_POLICY —— 多值类型口径（与 assertFact / lookup 内部**同一份实现**）。
    setTypeValidator, typeStateOf, isMultiValue,
    MULTI_VALUE_POLICY,
    originTrustOf: trustOf, factFp, pairKey
  });
  root.LonShaFactVersion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
