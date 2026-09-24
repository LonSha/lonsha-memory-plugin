/* ========================================================
 * memory-type.js — 记忆类型系统（v3.210.0，计划 L-F1）
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓此前把所有「事实」都当成同一种东西：fact-version.js 有来源信任、时间区间、
 *   冲突换代，但**没有「类型」维度** —— 「主角喜欢喝奶茶」和「魔王被打败了」和
 *   「A 与 B 是师徒」在账上是同一形状，共用同一套覆盖/冲突/可见性规则。
 *   结果是：
 *     · 长期世界规则被一条新轮次的推断覆盖（规则应是锁定项，不该被一句随口话顶掉）；
 *     · 「事件结果」与「人物状态」互相换代（事件结果只该并存、不该互相压）；
 *     · 玩家偏好没有「新偏好压旧偏好」规则（旧偏好赖着不走）；
 *     · 矛盾的世界规则照常并存（本该报警「提取错了」，却当成合理冲突挂着）。
 *   实际后果不是缺数据，而是**数据在，规则用错** —— 提取层给了正确的事实，
 *   账本用错策略处置，读侧只能拿到被错误换代/错误并存的版本。
 *
 * 【本模块只做一件事，两种输出】
 *   · 类型注册表（9 种 × 6 项策略属性）—— 唯一真源，禁止在调用点各写各的 if；
 *   · 把类型映射成 fact-version 能执行的冲突策略（conflictPolicy）与查询/注入路由。
 *   本模块**不自己存储**：类型标注落在 fact-version 的条目上（type 字段），
 *   策略执行在 fact-version 的 assertFact（conflictPolicy 参数）。
 *   这里只负责「这条事实属于哪个类型、该类型有什么策略、该路由到哪个注入分区」。
 *
 * 【9 种类型（计划 L-F1 点名）】
 *   character-state      人物状态      —— 好感/疲劳/心情/立场等会变的状态
 *   relationship-state   关系状态      —— A 看 B 的关系（单向主观，A→B 与 B→A 可不同）
 *   location-state       地点状态      —— 人物所在/场景位置
 *   item-state           物品状态      —— 持有者/完好度/位置
 *   event-outcome        事件结果      —— 已发生事件的结果（不可覆盖、只并存）
 *   plot-thread          叙事线索      —— 伏笔/未解之谜/剧情线索（只并存，不互相换代）
 *   player-preference    玩家偏好      —— 新偏好无条件压旧偏好
 *   world-rule           长期世界规则  —— 锁定项：矛盾=提取错了（拒绝并存）
 *   scene-fact           暂时场景事实  —— 当下场景才有效（短生命周期，不回溯）
 *
 * 【6 项策略属性（计划 L-F1 点名）】
 *   lifecycle    生命周期：permanent（永久）/ long / medium / short / dynamic（动态）
 *   visibility   可见性：public（公开）/ pov（角色视角）/ private（私密）/ authorial（幕后）/ scene（场景内）
 *   trust        默认信任度（对齐 fact-version ORIGIN_TRUST 口径）
 *   overrideable 是否可被覆盖（false = 锁定项，写入矛盾即拒绝或并存，不静默替代）
 *   conflict     冲突策略（映射 fact-version conflictPolicy）：
 *                  auto（按时间序换代，fact-version 现逻辑）
 *                  coexist（永不换代，矛盾并存）
 *                  prefer-new（新值无条件闭合旧值）
 *                  forbid（矛盾拒绝写入，world-rule 矛盾=提取错了）
 *   retroactive  是否允许回溯查询（false = 只答现状，不答「当时是什么」）
 *
 * 【边界】
 *   · 不做存储、不做提取解析：谁在什么时候变成什么，由提取管线给出并带 type；
 *   · 不猜类型：未知类型**拒绝**（不静默归 default——归 default 会把「规则错」读成「普通事实」）；
 *   · 不硬编码分区名：routeForType 返回的只是**路由键**，由 index.js 映射到 injection-router 分区。
 *
 * 挂 window.LonShaMemoryType，供 index.js 提取落笔归类 / selfCheck 诊断 / 注入路由使用。
 * ======================================================== */
'use strict';
(function (root) {
  /** 类型注册表 —— 本仓记忆分类的**唯一真源**。 */
  const TYPES = Object.freeze({
    'character-state': Object.freeze({ lifecycle: 'long', visibility: 'public', trust: 0.8, overrideable: true, conflict: 'auto', retroactive: true, label: '人物状态' }),
    'relationship-state': Object.freeze({ lifecycle: 'long', visibility: 'pov', trust: 0.8, overrideable: true, conflict: 'auto', retroactive: true, label: '关系状态' }),
    'location-state': Object.freeze({ lifecycle: 'medium', visibility: 'public', trust: 0.8, overrideable: true, conflict: 'auto', retroactive: true, label: '地点状态' }),
    'item-state': Object.freeze({ lifecycle: 'medium', visibility: 'public', trust: 0.8, overrideable: true, conflict: 'auto', retroactive: true, label: '物品状态' }),
    'event-outcome': Object.freeze({ lifecycle: 'permanent', visibility: 'public', trust: 1, overrideable: false, conflict: 'coexist', retroactive: false, label: '事件结果' }),
    'plot-thread': Object.freeze({ lifecycle: 'dynamic', visibility: 'authorial', trust: 0.5, overrideable: false, conflict: 'coexist', retroactive: false, label: '叙事线索' }),
    'player-preference': Object.freeze({ lifecycle: 'long', visibility: 'private', trust: 0.8, overrideable: true, conflict: 'prefer-new', retroactive: true, label: '玩家偏好' }),
    'world-rule': Object.freeze({ lifecycle: 'permanent', visibility: 'authorial', trust: 1, overrideable: false, conflict: 'forbid', retroactive: false, label: '世界规则' }),
    'scene-fact': Object.freeze({ lifecycle: 'short', visibility: 'scene', trust: 0.5, overrideable: true, conflict: 'coexist', retroactive: false, label: '场景事实' })
  });

  /** 类型名校验：合法类型返回其策略对象；未知类型返回 null（**拒绝**，不静默归 default）。 */
  function policyOf(type) {
    return (type != null && Object.prototype.hasOwnProperty.call(TYPES, type)) ? TYPES[type] : null;
  }

  /** 归一：未知类型必须显式拒绝，绝不静默归 default（归 default = 把「规则错」读成「普通事实」）。 */
  function normalizeType(type) {
    return policyOf(type) ? type : null;
  }

  /**
   * 谓词 → 类型推断（尽力而为，猜不到返回 null 让调用方显式给 type）。
   *   依据：谓词/字段名里的领域词。推断是**提示**不是裁决——调用方能给 type 就用 type。
   */
  const PREDICATE_HINTS = Object.freeze([
    [/所在|住在|位于|搬|地点|场景|位置/, 'location-state'],
    [/好感|疲劳|心情|健康|信任|金钱|情绪|立场|态度|状态|status/, 'character-state'],
    [/对.+的|关系|relation|师徒|恋人|好友|敌视|暗恋|警惕|依赖|挚友/, 'relationship-state'],
    [/结果|outcome|完成|达成|失败|胜利|结局/, 'event-outcome'],
    [/线索|伏笔|谜团|悬念|未解|plot/, 'plot-thread'],
    [/喜欢|偏好|prefer|爱好|想要|希望/, 'player-preference'],
    [/规则|定律|法则|设定|world-rule|always|永不|必然/, 'world-rule'],
    [/持有|物品|道具|item|装备|钱包/, 'item-state']
  ]);

  function inferType(predicate) {
    const p = String(predicate || '');
    if (!p) return null;
    for (const [re, type] of PREDICATE_HINTS) {
      if (re.test(p)) return type;
    }
    return null;
  }

  /**
   * 类型化登记入口：包装 fact-version 的 assertFact，带上 type 与冲突策略。
   *   FV  —— fact-version api（LonShaFactVersion）
   *   input —— assertFact 的输入 + type 字段
   * 返回与 assertFact 同形，但：
   *   · type 未知 ⇒ { ok:false, reason:'unknown-type', changed:false, state }
   *   · type 对应的 conflictPolicy 传入 assertFact
   */
  function assertTyped(FV, rawState, input) {
    const i = input || {};
    const type = normalizeType(i.type != null ? i.type : inferType(i.predicate));
    if (!type) {
      return { ok: false, changed: false, reason: 'unknown-type', state: FV.normalize(rawState) };
    }
    const policy = TYPES[type].conflict;
    return FV.assertFact(rawState, Object.assign({}, i, { type: type, conflictPolicy: policy }));
  }

  /** 按类型过滤账上所有事实（含已闭合/已撤销？由 aliveOnly 决定，默认只看未撤销）。 */
  function queryByType(state, type, opts) {
    const o = opts || {};
    const t = normalizeType(type);
    if (!t) return { ok: false, reason: 'unknown-type', facts: [] };
    const facts = (Array.isArray(state && state.facts) ? state.facts : []).filter(function (f) {
      if (f.type !== t) return false;
      if (!o.includeRevoked && f.revoked === true) return false;
      return true;
    }).map(function (f) {
      // 精简复制：不拖 history 大字段（查询侧只需现状，历史在 timeline 里取）。
      return {
        id: f.id, subject: f.subject, predicate: f.predicate, value: f.value, type: f.type,
        origin: f.origin, trust: f.trust, from: f.from, to: f.to, floor: f.floor,
        source: f.source, evidence: f.evidence, supersededBy: f.supersededBy,
        revoked: f.revoked === true, revokeReason: f.revokeReason, revision: f.revision
      };
    });
    return { ok: true, type: t, count: facts.length, facts: facts };
  }

  /** 类型 → 注入路由键（由 index.js 映射到 injection-router 分区名；这里不硬编码分区名）。 */
  function routeForType(type) {
    const t = normalizeType(type);
    if (!t) return null;
    // visibility 决定注入可见性层级；long/permanent 稳定注入，short/dynamic 只在当轮相关时注入。
    const vis = TYPES[t].visibility;
    const stable = TYPES[t].lifecycle === 'permanent' || TYPES[t].lifecycle === 'long';
    return { type: t, visibility: vis, stable: stable, partition: 'typed:' + t };
  }

  /** 六项策略的速查（供测试与调用方按需读取，避免到处解引用 TYPES）。 */
  function policyOfType(type) {
    const t = normalizeType(type);
    return t ? Object.assign({}, TYPES[t], { type: t }) : null;
  }

  /** 诊断一行：各类型计数（回答「账上事实都按什么类型分布」）。 */
  function lineByType(state) {
    try {
      const facts = Array.isArray(state && state.facts) ? state.facts : [];
      if (!facts.length) return '暂无类型化事实';
      const parts = [];
      const byType = {};
      let untyped = 0;
      for (const f of facts) {
        if (f.revoked) continue;
        // 诊断只认**显式标注**：不拿 inferType 的猜测冒充标注，否则会把「没标类型」
        //   读成「类型覆盖良好」（本仓三态纪律：猜到的 ≠ 标了的，两态必须可分）。
        const t = policyOf(f.type) ? f.type : null;
        if (t) byType[t] = (byType[t] || 0) + 1;
        else untyped++;
      }
      for (const t of Object.keys(TYPES)) {
        if (byType[t]) parts.push(TYPES[t].label + ' ' + byType[t]);
      }
      if (untyped) parts.push('未归类 ' + untyped + ' ⚠️');
      return parts.join(' · ');
    } catch (e) { return '—（类型诊断异常）'; }
  }

  const api = Object.freeze({
    TYPES, policyOf, normalizeType, inferType, assertTyped,
    queryByType, routeForType, policyOfType, lineByType,
    // [v3.211] 注入账侧类型校验器 + 让宿主能按分区取类型账（见下）
    bindLedger, typedBuckets, typedLine
  });
  /**
   * [v3.211] 把本模块的**类型校验器**注入事实账（fact-version）。
   *   为什么必须注入而不是让账本自己写清单：清单真源在本模块（TYPES）。
   *   修前实测：`lookup({type:'chracter-state'})`（拼错）返回 `reason:'none'` —— 与
   *   「账上没有该属性的事实」同形；调用方读到的结论是「没这条事实」，而不是「类型名写错了」。
   *   注入后账本走 `typeStateOf` 三态，未识别一律 `unknown-type` 拒绝。
   *   **幂等**：重复注入同一函数不产生副作用；返回是否注入成功（账本缺导出面即 false，不抛）。
   */
  function bindLedger(FV) {
    if (!FV || typeof FV.setTypeValidator !== 'function') return false;
    return FV.setTypeValidator(function (t) { return normalizeType(t) != null; }) === true;
  }
  /**
   * [v3.211] 类型 → 注入分区键（**这是宿主该看的那一层**）。
   *   与 routeForType 的分工：routeForType 给「这一条该按哪种可见性/稳定性注入」的单条决策；
   *   本函数给「整本账按类型分几个桶」的聚合视图，桶键用 `typed:<type>`（与 routeForType 同口径）。
   *   仍然**不硬编码宿主分区名** —— `typed:*` 是本模块自己的命名空间，映射到真实分区是宿主的事。
   */
  function typedBuckets(state, opts) {
    const o = opts || {};
    const out = {};
    for (const t of Object.keys(TYPES)) out['typed:' + t] = [];
    const facts = Array.isArray(state && state.facts) ? state.facts : [];
    for (const f of facts) {
      if (!o.includeRevoked && f && f.revoked === true) continue;
      const t = policyOf(f && f.type) ? f.type : null;
      if (!t) continue;                                   // 未标类型不进任何类型桶（**不猜**）
      out['typed:' + t].push(f);
    }
    return out;
  }
  /** [v3.211] 诊断一行（注入面）：报「校验器是否已接上 + 几个类型桶有货」。 */
  function typedLine(FV) {
    const bound = !!(FV && typeof FV.setTypeValidator === 'function');
    return bound ? '类型校验器已注入事实账' : '类型校验器未注入（账本无 setTypeValidator 导出面）';
  }
  root.LonShaMemoryType = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // [v3.211] 加载即自注入（浏览器）：extra_js 按 manifest 顺序加载，fact-version 在前、本模块在后，
  //   故此处 fact-version 必已挂好。注入失败**不抛**（账本不在场时仍要能用类型表本身）。
  try {
    const _FV = (typeof window !== 'undefined' && window.LonShaFactVersion) ? window.LonShaFactVersion : null;
    if (_FV) bindLedger(_FV);
  } catch (e) { /* 自注入失败不影响本模块自身可用 */ }
})(typeof globalThis !== 'undefined' ? globalThis : window);