/* ========================================================
 * repair-loop.js — 记忆修复闭环 [v3.194.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   计划点名三条修复动作，本仓**零入口**：
 *     ① 纠正实体归属（这条记忆其实属于另一个人）
 *     ② 拆分误合并事件（两件事被并成一条）
 *     ③ 撤销错误事实并更新派生内容（撤了之后，从它派生出的摘要/关系/时间线还在引用它）
 *   前两条不说，第三条是要害：本仓的摘要、图谱边、时间线、承诺账都是从同一条事实派生的，
 *   只把源事实删掉而不管派生件，等于「源头改了、下游还指着旧值」——
 *   这正是 v3.177/v3.190 治理过的那一族缺陷（生活事件停在旧值、位移改两次）。
 *
 * 【本模块的职责：把一次修复变成一次可复算的传播】
 *   输入是一次修复请求（retarget / split / revoke），输出是**受影响的派生件清单**：
 *     { ok, action, target, affected: [{kind, key, why}], dangling, changed }
 *   宿主拿这份清单去逐处改派生件。本模块**不直接改**那些子系统——
 *   它没有它们的引用，也不该有（否则就是第二份真源）。
 *
 * 【为什么必须有「未处理完」这一态（本项目硬纪律）】
 *   宿主改派生件可能只改成功一部分（某个子系统抛错、某条已被上限淘汰）。
 *   修复不是一次动作，而是一段有状态的流程，所以本模块保留 pending 台账：
 *   每条受影响项标 done / failed / missing，**全部落定**才算修复完成。
 *   不这么做的话，「修了但有一处没跟上」与「修复完成」在界面上完全同形。
 *
 * 【本模块不做什么（边界）】
 *   · 不判断修复是否正确（那是人的决定）；只保证「一次修复被完整传播、且可追踪」。
 *   · 不自动猜该改哪些派生件。命中规则显式写在 affectedBy 里，逐条可读、可测；三类动作扫的针不同，不是同一套换名字。
 *   · 不做批量撤销的级联推理（撤销 A 是否该连带撤销 B 由调用方逐条提交）。
 *
 * 挂 window.LonShaRepairLoop，供 index.js 修复入口 / 诊断面使用。
 * ======================================================== */
'use strict';
(function (root) {
  const RL_VERSION = 1;
  const MAX_REPAIRS = 120;
  /** 三类修复动作（计划点名，不多不少）。 */
  const ACTIONS = Object.freeze(['retarget', 'split', 'revoke']);
  /** 修复记录的终态四态：open=未落定 / applied=全部落定 / partial=有未落定 / abandoned=用户放弃。 */
  const STATES = Object.freeze(['open', 'applied', 'partial', 'abandoned']);
  /** 派生件类型六态——每一类都是本仓真实的派生子系统。 */
  const KINDS = Object.freeze(['summary', 'event', 'relation', 'promise', 'fact', 'timeline']);
  /**
   * [v3.295.0 · X2] 依赖判据两态（**单一真源**）——「确切引用」与「文本命中」不是同一强度。
   *
   * 【修前实测后果】
   *   `affectedBy` 只有 needle 一态：拿 target/subject 的**文本**去每一条派生件的正文里
   *   `includes()`。于是两种完全不同的处境在 affected 清单里**逐字同形**：
   *     · 这条派生件**确实**由被撤的事实派生而来（引用就在它身上）；
   *     · 这条派生件只是正文里出现了这个名字（同名角色、泛指、甚至引号里的一句台词）。
   *   而计划里点名的正是「按确切依赖引用找影响，旧内容的文本命中只标候选」——
   *   旧面把「候选」当成「受影响」交付，调用方无从区分该动哪一条。
   *
   * 【本版口径】
   *   · `ref`    —— 派生件自报 `sourceRefs` / `derivedFrom`，且其中含被修复对象的标识
   *                 ⇒ 引用命中，是**同一件事**（why='by-ref'）；
   *   · `needle` —— 正文文本命中（why='mentions-needle'）⇒ **只标候选**，basis 如实透出。
   *   `basis` 与 `why` 分开：why 是给人读的理由，basis 是给判据/统计用的**类别**。
   */
  const BASES = Object.freeze(['ref', 'needle']);
  /**
   * [v3.295.0 · X2] 落定证据三态（**单一真源**）。
   *
   *   计划验收原文：「仅登记不能显示『事实已纠正』；只有**原数据与持久化回读均证明**修改才记 done」。
   *   旧 `settle()` 只吃 `status`，于是「我改了」与「我证明我改了」在账上**完全同形**——
   *   而 `done` 正是界面显示「已纠正」的唯一依据。故证据单列一维：
   *     · `unconfirmed` —— 只有调用方的声明（原数据未核 / 未回读）；
   *     · `partial`     —— 原数据核过**或**持久化回读过了，只其一；
   *     · `confirmed`   —— 两者均过 ⇒ 这才允许参与终态 `applied`。
   */
  const EVIDENCE = Object.freeze(['unconfirmed', 'partial', 'confirmed']);
  /** 覆盖度两态：有池缺席或池被截断 ⇒ partial（**未覆盖范围必须报出来**，不得当成「扫过了没有」）。 */
  const COVERAGE_STATE = Object.freeze(['full', 'partial']);
  /**
   * [v3.295.0 · X2] 每类派生件**可用的逆操作名**（原 owner 才能提供的那一下）。
   *   计划验收明文：「撤销操作在原 owner 能提供逆操作/检查点时才开放」。
   *   这里登记的是**语义名**而非方法名——方法名是宿主的接线细节，模块不该持有第二份；
   *   宿主按本表逐类接线，接不上的那类在 `revocable` 上如实为 false。
   */
  const INVERSE = Object.freeze({
    summary: 'restore-text', event: 'abandon-event', relation: 'rebuild-edge',
    promise: 'cancel', fact: 'revoke', timeline: 'drop-entry'
  });

  /* [v3.240.0] 账本实体契约单一真源（ledger-entity.js）——本模块此前自带一份 `text` / `finite` 拷贝。
   *   拷贝的判据是 `Number.isFinite(Number(v))`：`Number(null) === 0` 且有限 ⇒ `finite(null)` 得 0，
   *   于是「楼层未知」被静默写成「第 0 楼」（而 0 在本插件是**合法楼层**）。
   *   本仓同一形态已修过三处（O-1 / R3-D / R4-E），v3.240.0 把 `finite` 本体改成「没给 ⇒ null」，
   *   并把本模块（原三份未收编的拷贝之一）一并收进契约 —— 判据只此一份，改一处就全都改到。
   *   取库双通道与六本委派账逐字同形（浏览器走全局、Node 走 require），便于门禁按字面量扫描。 */
  const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity
    : ((typeof module !== 'undefined' && module.exports) ? require('./ledger-entity.js') : (root.LonShaLedgerEntity || null));
  if (!LE) throw new Error('[lonsha] ledger-entity.js 未加载：账本实体契约缺真源（查 manifest.extra_js 加载顺序）');
  const text = LE.text;
  const finite = LE.finite;
  const finiteFloor = LE.finiteFloor;   // [v3.240.0] floor 一族专用（与 finite 同判据，按名点名）
  function copyItem(it) {
    return {
      kind: KINDS.includes(it.kind) ? it.kind : 'summary',
      key: text(it.key, 80),
      why: text(it.why, 80),
      /* [v3.295.0 · X2] 两维随项走，且**旧档缺字段时退默认**（回读不清零、改写形）：
       *   basis    = 这条为什么被列进来（ref 确切引用 / needle 文本候选）；
       *   evidence = 修改是否已被证明（见 EVIDENCE 三态）。 */
      basis: BASES.includes(it.basis) ? it.basis : 'needle',
      evidence: EVIDENCE.includes(it.evidence) ? it.evidence : 'unconfirmed',
      status: ['pending', 'done', 'failed', 'missing'].includes(it.status) ? it.status : 'pending',
      note: text(it.note, 80)
    };
  }
  function copyRepair(r) {
    return {
      id: text(r.id, 48),
      action: ACTIONS.includes(r.action) ? r.action : 'revoke',
      subject: text(r.subject, 40),
      from: text(r.from, 120),
      to: text(r.to, 120),
      target: text(r.target, 80),
      reason: text(r.reason, 120),
      // [v3.214.0] R1-F 幂等键（可选）。**不抬 RL_VERSION**：本字段是纯增量——
      //   旧存档没有它、读回即空串（与「没给」同义），旧代码读到多出的字段也照旧忽略，
      //   两侧都不改变既有语义，故不构成结构代际变化（抬版会逼所有存档走迁移，那是另一件事）。
      dedupeKey: text(r.dedupeKey, 80),
      floor: finiteFloor(r.floor),
      status: STATES.includes(r.status) ? r.status : 'open',
      affected: Array.isArray(r.affected) ? r.affected.map(copyItem).slice(-24) : [],
      /* [v3.295.0 · X2] 登记时就把「方案 / 未覆盖范围 / 悬空依赖」钉在记录上：
       *   事后现算会随运行时漂移（池是现收的），于是「当时看到会影响 5 条」
       *   与「事后复算 3 条」同形——账上说不清到底按哪个清单落的定。 */
      coverage: (function () {
        const c = r.coverage || {};
        const scanned = {};
        const src = (c.scanned && typeof c.scanned === 'object') ? c.scanned : {};
        for (const k of KINDS) scanned[k] = finite(src[k]) || 0;
        return {
          state: COVERAGE_STATE.includes(c.state) ? c.state : 'partial',
          scanned: scanned,
          absent: Array.isArray(c.absent) ? c.absent.filter(function (k) { return KINDS.includes(k); }) : [],
          note: text(c.note, 160)
        };
      })(),
      dangling: Array.isArray(r.dangling) ? r.dangling.slice(0, 24).map(function (d) {
        return { kind: KINDS.includes(d && d.kind) ? d.kind : 'summary', key: text(d && d.key, 80), ref: text(d && d.ref, 48) };
      }) : [],
      /* [v3.295.0 · X2] 记录级证据（`status` 之外的那一维）。**旧档缺字段时**
       *   现算一次而不是给死默认：给 'unconfirmed' 会把「旧数据没这一维」写成
       *   「这些修改被证明没证据」，那是对历史的错判。 */
      evidence: EVIDENCE.includes(r.evidence) ? r.evidence : (function () {
        const list = Array.isArray(r.affected) ? r.affected : [];
        if (!list.length) return 'partial';
        if (list.some(function (it) { return it.status === 'pending'; })) return 'partial';
        if (list.some(function (it) { return it.status === 'failed' || it.status === 'missing'; })) return 'partial';
        if (list.some(function (it) { return it.evidence !== 'confirmed'; })) return 'unconfirmed';
        return 'confirmed';
      })(),
      unproven: finite(r.unproven) || 0,
      at: finiteFloor(r.at)
    };
  }
  function clone(state) {
    return {
      version: RL_VERSION,
      seq: finite(state && state.seq) || 0,
      repairs: Array.isArray(state && state.repairs) ? state.repairs.map(copyRepair) : []
    };
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.repairs = state.repairs.filter(function (r) {
      if (!r.id || !r.subject) return false;
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).slice(-MAX_REPAIRS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'rpr_' + state.seq;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, changed: false, state: normalize(state) }, extra || {});
  }
  function reject(state, reason) {
    return { ok: false, changed: false, reason: reason, state: normalize(state) };
  }
  function find(state, ref) {
    const id = text(ref && ref.id, 48);
    if (id) return state.repairs.find(function (r) { return r.id === id; }) || null;
    return null;
  }
  /**
   * 派生件命中规则（显式表，逐条可读）。
   *   pool = { summaries:[{key,text,floor}], events:[...], relations:[...], promises:[...], facts:[...], timeline:[...] }
   * 每条规则回答「这次修复影响了它吗、为什么」。
   * 关键纪律：**命中就列出来**，不在这里判断「要不要改」——改不改是调用方的事。
   */
  /**
   * 池键名映射（显式表）。**不能**用 kind + 's' 拼键：
   *   summary→summaries、promise→promises 拼不出来（会拼成 summarys / promise s），
   *   结果是摘要池、承诺池与事实池里的 timeline 被静默跳过——「修了但下游没跟着改」
   *   正是本模块存在的理由，它自己踩这个坑就等于没修。单数键也接受（调用方两种写法都能给）。
   */
  const POOL_KEYS = Object.freeze({
    summary: 'summaries', event: 'events', relation: 'relations',
    promise: 'promises', fact: 'facts', timeline: 'timeline'
  });
  function poolList(p, kind) {
    const plural = POOL_KEYS[kind];
    if (Array.isArray(p[plural])) return p[plural];
    if (Array.isArray(p[kind])) return p[kind];
    return [];
  }
  /** 取一条派生件自报的依赖引用（两种既有形状都吃：数组 / 标量）。 */
  function refsOf(it) {
    const out = [];
    const push = function (v) {
      if (Array.isArray(v)) { for (const x of v) push(x); return; }
      const t = text(v, 48);
      if (t) out.push(t);
    };
    /* 【为什么还要读 `eventKey` / `supersededBy`（本条修前是**死通路**）】
     *   本函数原先只读 `sourceRefs` / `derivedFrom` 两个字段，而这两个名字
     *   **全仓零产出**（实测：`grep -rn 'sourceRefs' *.js` 只命中 stale-guard 的
     *   change-set 入参 —— 那是另一件东西；`derivedFrom` 只有本文件自己）。后果是
     *   `hitRef` 恒假、`basis` 恒 'needle'：计划点名的「按**确切依赖引用**找影响」
     *   在生产上**从来没有生效过**，永远只有文本撞名那一态。
     *   本仓真实存在的跨条引用是：
     *     · `supersededBy` —— 事实被换代时指向**取代它的那条事实** id（fact-version.js:309）；
     *     · `eventKey`     —— 写入时带的幂等键，就是「这条是从哪个事件产生的」（账本实体契约）。
     *   两者都照实收下：ref 命中于是**可达**，而不是一条只在测试夹具里成立的判据。 */
    if (it) { push(it.sourceRefs); push(it.derivedFrom); push(it.eventKey); push(it.supersededBy); }
    return out;
  }
  /**
   * 派生件命中规则（显式表，逐条可读）。
   *   pool = { summaries:[{key,text,floor}], events, relations, promises, timeline,
   *            facts:[{key,text,supersededBy?}],   // supersededBy = 换代指向的事实 id（真实 ref 来源）
   *            info?:{<kind>:{scanned,total}}, knownRefs?:[string] }
   * 返回 `{ items, coverage, dangling }`（**不再返回裸数组**）：
   *   · items    —— 受影响派生件，每项带 `basis`（ref / needle）与 `why`；
   *   · coverage —— 本次**实际扫到**的范围 + 缺席/被截断的池（未覆盖范围）；
   *   · dangling —— 引用指向点不到的东西（悬空依赖）。它与「受影响」是两件事，分列。
   * 关键纪律：**命中就列出来**，不在这里判断「要不要改」——改不改是调用方的事。
   * 旧签名返回数组且没有 coverage/dangling —— 档头从 v3.194 起就写着 `dangling` 输出，
   *   而全仓**零实现**：声明的输出从来没出现过（本版补上，不是顺手加的字段）。
   */
  function affectedBy(action, target, subject, pool) {
    const p = pool || {};
    const info = (p && typeof p.info === 'object' && p.info) ? p.info : null;
    /* 已知引用全集：池内所有项自己的 key + 调用方声明的 knownRefs。
     *   —— 只用来判「悬空」，不参与「是否受影响」的判定（两件事，两个出口）。 */
    const known = new Set();
    for (const kind of KINDS) {
      for (const it of (Array.isArray(p[POOL_KEYS[kind]]) ? p[POOL_KEYS[kind]] : (Array.isArray(p[kind]) ? p[kind] : []))) {
        const k = text(it && (it.key || it.id || it.name || it.title), 80);
        if (k) known.add(k);
      }
    }
    for (const r of (Array.isArray(p.knownRefs) ? p.knownRefs : [])) { const t = text(r, 48); if (t) known.add(t); }

    /* 三类动作扫的针不同（不是同一套规则换个名字）：
     *   retarget ⇒ 针 = 旧主体（出现旧名字的派生件受牵连；target 是被纠正的那一条本身）。
     *   split    ⇒ 针 = target（被误合并成一个名字的那条）。
     *   revoke   ⇒ 针 = target（被撤销的事实文本），连同从它派生的下游。 */
    const needle = action === 'retarget' ? subject : target;
    /* `refId` 是**被修复对象的稳定标识**（调用方给；给不出则退化为 target 文本本身）。
     *   为什么允许退化：既有调用点大多只有可读文本，逼它们先造 id 就等于把 X2 挡在门外；
     *   而 by-ref 判据在池项自报引用时依然成立——退化的只是「用什么去比」。 */
    const needleId = text(p.refId, 48) || text(needle, 80);

    const items = [];
    const dangling = [];
    const scanned = {};
    const absent = [];
    const truncated = {};
    const seen = new Map();
    const has = function (v, n) {
      return n && String(v == null ? '' : v).toLowerCase().includes(String(n).toLowerCase());
    };
    for (const kind of KINDS) {
      const list = poolList(p, kind);
      const n = list.length;
      scanned[kind] = n;
      /* `info` 的键**按 kind 取**（单数），并容忍调用方写复数——与 `poolList` 接受
       *   两种池键写法同一个理由：静默取不到就等于「这一池判不了被当成没截断」。
       *   实测过：宿主曾按池键（复数）写 info，于是 `meta` 恒 null，
       *   截断读数**永不触发**，而「总共 900 条、只看了 200 条」在 affected 清单上
       *   与「真的只有 200 条」完全同形 —— 正是本版要治的那一族。 */
      const meta = info ? (info[kind] || info[POOL_KEYS[kind]]) : null;
      if (meta && Number(meta.total) > Number(meta.scanned)) {
        truncated[kind] = { scanned: Number(meta.scanned) || 0, total: Number(meta.total) || 0 };
      }
      /* 池缺席 = **判不了**（不是「扫过了、没有」）。判据：既没有读数也没有项。
       *   给了 info 但 total=0 ⇒ 是真的空池（已覆盖）；没给 info 且数组为空 ⇒ 缺席。 */
      if (n === 0 && !meta) absent.push(kind);
      for (const it of list) {
        if (!it) continue;
        const key = text(it.key || it.id || it.name || it.title, 80);
        const body = text(it.text || it.content || it.value || it.summary || it.desc, 200);
        if (!key && !body) continue;
        const refs = refsOf(it);
        const hitRef = !!(needleId && refs.indexOf(needleId) >= 0);
        const hitText = has(body, needle) || has(key, needle);
        if (!hitRef && !hitText) {
          /* 与本次修复无关，但它自报的引用点不到 ⇒ 悬空依赖，照实报（不混进 affected）。 */
          for (const r of refs) if (!known.has(r)) dangling.push({ kind: kind, key: key || body.slice(0, 40), ref: r });
          continue;
        }
        const basis = hitRef ? 'ref' : 'needle';
        const item = {
          kind: kind, key: key || body.slice(0, 40),
          why: hitRef ? 'by-ref' : 'mentions-needle',
          basis: basis, status: 'pending', note: '', evidence: 'unconfirmed'
        };
        /* 去重：同 kind+key 只留**更强**的那条（ref 胜过 needle）——同一件东西被同名多处
         *   提到不重复列入；而「有确切引用」比「文本撞上」更该被看见。 */
        const dk = kind + '\u0000' + item.key;
        const old = seen.get(dk);
        if (old) { if (old.basis === 'needle' && basis === 'ref') { old.why = 'by-ref'; old.basis = 'ref'; } continue; }
        seen.set(dk, item);
        items.push(item);
      }
    }
    const coverage = {
      state: 'full', scanned: scanned, absent: absent, truncated: truncated, note: ''
    };
    if (absent.length || Object.keys(truncated).length) {
      coverage.state = 'partial';
      const parts = [];
      for (const k of absent) parts.push(k + '(池缺席)');
      for (const k of Object.keys(truncated)) parts.push(k + '(截断 ' + truncated[k].scanned + '/' + truncated[k].total + ')');
      coverage.note = '未覆盖：' + parts.join('、');
    }
    return { items: items, coverage: coverage, dangling: dangling };
  }
  /**
   * [v3.295.0 · X2] 一次修复的**逐项修改方案**（计划原文：「逐项确认修改方案」）。
   *   只读纯函数：吃与 preview 同一份 pool，产出每一条受影响派生件**该怎么改、谁来改、
   *   能不能撤、改完拿什么证明**。不作为调用方的写入口（`wrote:false` 恒为真）。
   * @returns {object} { ok, action, steps, total, coverage, dangling, wrote }
   */
  function plan(input) {
    const i = input || {};
    const bad = validate(i);
    if (bad) return { ok: false, reason: bad, steps: [], total: 0, wrote: false };
    const action = text(i.action, 16);
    const r = affectedBy(action, text(i.target, 80), text(i.subject, 40), i.pool);
    const steps = r.items.map(function (it) {
      const inverse = INVERSE[it.kind] || '';
      return {
        kind: it.kind, key: it.key, why: it.why, basis: it.basis,
        /* owner = **哪一类持有者**要动（kind 与持有者一一对应，不在这里写方法名：
         *   方法名是宿主的接线细节，模块持有第二份就是第二份真源）。 */
        owner: it.kind,
        inverse: inverse,
        /* revocable：撤销类动作只在本类**有逆操作**时才开放（计划验收明文）。 */
        revocable: !!inverse,
        /* 确切引用可以按引用改；文本命中的候选**必须先由人确认**再动。 */
        requires: it.basis === 'ref' ? ['same-ref'] : ['confirm-by-human'],
        /* 记 done 的门（与 settle 的证据门同一口径）：原数据 + 持久化回读。 */
        evidence: ['origin-data', 'persisted-readback'],
        status: it.status
      };
    });
    return {
      ok: true, action: action, subject: text(i.subject, 40), target: text(i.target, 80),
      steps: steps, total: steps.length,
      /* 精确 / 候选分开计数：「有几条真该改」与「有几条只是可能」不是一个读数。 */
      byRef: steps.filter(function (s) { return s.basis === 'ref'; }).length,
      byNeedle: steps.filter(function (s) { return s.basis === 'needle'; }).length,
      coverage: r.coverage, dangling: r.dangling, wrote: false
    };
  }
  /**
   * 入参校验的**单一真源**（request / preview 共用同一份规则）。
   * 为什么必须共用：若预览能过、登记却拒（或反之），界面就会「预览通过 → 点了没反应」，
   *   而用户看到的原因与真实原因不同——两个判据漂移是本仓治理过多轮的形态。
   * @returns {string} '' = 合法；否则是拒绝原因（与 request 的 reason 同词表）
   */
  function validate(input) {
    const i = input || {};
    const action = text(i.action, 16);
    if (!ACTIONS.includes(action)) return 'unknown-action';
    if (!text(i.subject, 40)) return 'missing-subject';
    const target = text(i.target, 80);
    if (action === 'revoke' && !target) return 'missing-target';
    if (action === 'retarget' && !text(i.to, 120)) return 'missing-to';
    if (action === 'split' && !target) return 'missing-target';
    return '';
  }
  /**
   * [v3.214.0] R1-F：**只算不改**的修复预览。
   *
   * 【为什么需要它 / 修前实测后果】
   *   `request()` 是全仓唯一入口，它**同时**做两件事：算受影响派生件 + 写台账。
   *   于是「我只想看看这次修复会牵连哪些派生件」这个再正常不过的诉求，
   *   在旧面上只能靠「真的登记一次、再让人放弃」来实现——而 `request()` **不幂等**，
   *   重试一次就多一条记录，台账被「看一眼」的动作污染，`pending()` 里于是混进
   *   一批从未打算执行的修复。
   *
   * 【契约】
   *   · 纯函数：不接收状态、不返回状态、不写任何东西（签名里没有 rawState 是刻意的，
   *     谁想塞状态进来也塞不进来）；
   *   · 与 request 共用 `validate` + `affectedBy`，故两边算出的 affected 逐条一致；
   *   · 不合法时 `{ ok:false, reason }`，理由与 request 相同（预览过 ⇒ 登记也会过）。
   */
  function preview(input) {
    const i = input || {};
    const action = text(i.action, 16);
    const bad = validate(i);
    if (bad) return { ok: false, reason: bad, affected: [], total: 0 };
    const r = affectedBy(action, text(i.target, 80), text(i.subject, 40), i.pool);
    const affected = r.items;
    const steps = r.items.map(function (it) {
      return { kind: it.kind, key: it.key, why: it.why, basis: it.basis, status: it.status };
    });
    return {
      ok: true, action: action, subject: text(i.subject, 40), target: text(i.target, 80),
      affected: affected.slice(), total: affected.length,
      /* [v3.295.0 · X2] 精确 / 候选分列：`affected` 是**全部**命中，但两态的强度不同，
       *   合并成一个数就等于把「这条肯定要改」与「这条只是名字撞上」说成同一件事。 */
      byRef: steps.filter(function (x) { return x.basis === 'ref'; }).length,
      byNeedle: steps.filter(function (x) { return x.basis === 'needle'; }).length,
      /* 未覆盖范围与悬空依赖随预览一起给出（计划：「报告未覆盖范围」）。 */
      coverage: r.coverage, dangling: r.dangling,
      // 明确回一句「什么都没写」，让调用方不必读源码就知道这是只读面
      wrote: false
    };
  }
  /**
   * 登记一次修复请求：算出受影响派生件清单，写进 open 台账。
   * input = { action, subject, from?, to?, target?, reason?, floor?, pool?, at?, dedupeKey? }
   *
   * [v3.214.0] R1-F 两处收紧，缺键时行为逐字同旧版：
   *   ① **前置校验收进 validate()**（与 preview 共用）：此前四段 if 内联在此，
   *      预览面一加就会立刻分叉出第二份判据。
   *   ② `dedupeKey` 幂等：同一个键若已有**未放弃**的修复，本次不新增记录，
   *      原样交回既有那条并标 `replayed:true`（changed:false）。
   *      —— 为什么只按「未放弃」判重：用户放弃过的那次重试是**新意图**，必须能重新登记；
   *      按全部历史判重会把「改主意后又想做」永久锁死。
   *      不给 dedupeKey 时不做任何判重（旧调用逐字不变）。
   */
  function request(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const action = text(i.action, 16);
    // 校验走 validate()（与 preview 共用同一份判据；此前是内联四段 if）
    const bad = validate(i);
    if (bad) return reject(state, bad);
    const subject = text(i.subject, 40);
    const target = text(i.target, 80);
    // [v3.214.0] 幂等（仅当调用方给了 dedupeKey）：同键且**未放弃**的既有记录 ⇒ 原样交回，
    //   不新增、不改动（changed:false + replayed:true）。缺键时本段整体不生效。
    const dedupeKey = text(i.dedupeKey, 80);
    if (dedupeKey) {
      const old = state.repairs.find(function (r) { return r.dedupeKey === dedupeKey && r.status !== 'abandoned'; });
      if (old) return result(state, {
        repair: copyRepair(old), replayed: true, changed: false,
        affected: old.affected.slice(), total: old.affected.length,
        coverage: old.coverage, dangling: old.dangling.slice()
      });
    }
    const r = affectedBy(action, target, subject, i.pool);
    const affected = r.items;
    const rec = copyRepair({
      id: nextId(state), action: action, subject: subject,
      from: i.from, to: i.to, target: target, reason: i.reason, floor: i.floor,
      dedupeKey: dedupeKey, status: 'open', affected: affected, at: i.at,
      /* 覆盖度与悬空依赖**随记录存档**：它们是「当时这次判定看到了多宽的范围」的证词，
       *   事后现算会随运行时漂移（池是现收的），两处读数就不再指向同一次判定。 */
      coverage: r.coverage, dangling: r.dangling
    });
    state.repairs.push(rec);
    return result(state, {
      repair: copyRepair(rec), changed: true,
      affected: affected.slice(), total: affected.length,
      coverage: r.coverage, dangling: r.dangling
    });
  }
  /**
   * [v3.295.0 · X2] 证据判定（**单一真源**）——「我改了」与「我证明我改了」不是同一句话。
   *
   *   计划验收原文：「仅登记不能显示『事实已纠正』；只有**原数据与持久化回读均证明**修改才记 done」。
   *   `done` 是界面显示「已纠正」的唯一依据，而旧 `settle()` 只看 `status` 一个字——
   *   调用方说 done 就是 done，没有第二个人核过。故本版要求逐项**自报证据**：
   *     · `originData`      —— 原数据（持有者那本账）已核过这次修改；
   *     · `persistedReadback` —— 真落盘后的回读已证明写入存在。
   *   两者**都真**才 `confirmed`；只其一 `partial`；都没有 `unconfirmed`。
   *   ★ 不传证据 = `unconfirmed`（**不判为假，也不判为真**）：旧调用点逐字不变地仍能落定，
   *     但它换不来 `applied`——旧行为里那个无据的 `applied` 正是本版要治的那一处。
   * @returns {string} 'unconfirmed' | 'partial' | 'confirmed'
   */
  function evidenceOf(input) {
    const i = input || {};
    const a = i.originData === true ? 1 : (i.originData === false ? -1 : 0);
    const b = i.persistedReadback === true ? 1 : (i.persistedReadback === false ? -1 : 0);
    if (a > 0 && b > 0) return 'confirmed';
    if (a > 0 || b > 0) return 'partial';
    return 'unconfirmed';
  }
  /**
   * 落定一条受影响项。宿主每改完一处就报一次；不报的就一直是 pending。
   *   status: 'done' | 'failed' | 'missing'（missing = 目标已不存在，如被上限淘汰）
   *   `originData` / `persistedReadback` 两项证据（见 evidenceOf）：只有 `done` **且**
   *   证据 `confirmed` 才算「真落定」；`done` 但证据不足 ⇒ 状态照记、终态只到 `partial`。
   * 全部落定（无 pending）时自动把修复记录推成 applied；有 failed/missing/未证实项则 partial。
   */
  function settle(rawState, input) {
    const state = normalize(rawState);
    const i = input || {};
    const rec = find(state, i);
    if (!rec) return reject(state, 'not-found');
    if (rec.status === 'abandoned') return result(state, { repair: copyRepair(rec), replayed: true, changed: false, reason: 'abandoned' });
    const key = text(i.key, 80);
    const kind = text(i.kind, 24);
    const next = ['done', 'failed', 'missing'].includes(i.status) ? i.status : 'done';
    const item = rec.affected.find(function (it) { return it.key === key && (!kind || it.kind === kind); });
    if (!item) return reject(state, 'item-not-found');
    const ev = evidenceOf(i);
    /* 幂等判据必须带上**证据**：只比 status 的话，「先报 done（无据）、后补证据再报一次」
     *   会被当成重放而丢掉证据 —— 那正是本版新加的那一维，不能栽在旧幂等上。 */
    if (item.status === next && item.evidence === ev) {
      return result(state, { repair: copyRepair(rec), item: copyItem(item), replayed: true, changed: false });
    }
    item.status = next;
    item.evidence = ev;
    item.note = text(i.note, 80);
    const pend = rec.affected.filter(function (it) { return it.status === 'pending'; }).length;
    /* ★ `bad` / `applied` 的口径**逐字保持旧版**（failed / missing 才算不完成）。
     *   为什么本版**没有**顺手把「无据的 done」也算进来：`status` 回答的是**流程**
     *   （这条落定了没有），而 `applied` 是流程的终态；把「有没有被证明」并进同一维，
     *   等于让一个字段同时回答两个问题——本仓那一族「同一形状两个读数」正是这样长出来的。
     *   而全仓已有三处判据（v3194 测试 9/10、v3215 测试 8）咬住「全 done ⇒ applied」，
     *   那是流程语义，本身没错；错的是**把它当成「事实已纠正」来读**。
     *   故证据单列一维，落在记录上（见 rec.evidence / rec.unproven）。 */
    const bad = rec.affected.filter(function (it) { return it.status === 'failed' || it.status === 'missing'; }).length;
    const unproven = rec.affected.filter(function (it) { return it.status === 'done' && it.evidence !== 'confirmed'; }).length;
    rec.status = pend > 0 ? 'open' : (bad > 0 ? 'partial' : 'applied');
    /* 记录级证据聚合（**单一真源**，line / 宿主回执都读它，不再各算一套）：
     *   confirmed —— 至少有过一次落定，且所有 done 项都已证实；
     *   unconfirmed —— 有「报了 done 但没证实」的项（**这才是「仅登记」的那一族**）；
     *   partial —— 其余（还没落定 / 有失败项）。 */
    rec.unproven = unproven;
    rec.evidence = unproven > 0 ? 'unconfirmed'
      : ((pend === 0 && bad === 0 && rec.affected.length > 0) ? 'confirmed' : 'partial');
    return result(state, {
      repair: copyRepair(rec), item: copyItem(item), changed: true,
      pending: pend, failed: bad, settled: rec.status !== 'open',
      evidence: ev, confirmed: ev === 'confirmed',
      /* 「账上已落定」与「账上已证明」两个读数**分列回**，让调用方不必从 applied 猜。 */
      unproven: unproven, repairEvidence: rec.evidence
    });
  }
  /** 放弃一次修复（用户改主意）：把剩余 pending 一并标 missing 并留原因。 */
  function abandon(rawState, input) {
    const state = normalize(rawState);
    const rec = find(state, input);
    if (!rec) return reject(state, 'not-found');
    if (rec.status === 'abandoned') return result(state, { repair: copyRepair(rec), replayed: true, changed: false });
    for (const it of rec.affected) if (it.status === 'pending') { it.status = 'missing'; it.note = 'abandoned'; }
    rec.status = 'abandoned';
    return result(state, { repair: copyRepair(rec), replayed: false, changed: true });
  }
  /** 未落定的修复名单——「修了但没修完」必须能被单独列出来。 */
  function pending(rawState) {
    const state = normalize(rawState);
    return state.repairs.filter(function (r) { return r.status === 'open'; }).map(function (r) {
      return Object.assign(copyRepair(r), {
        pending: r.affected.filter(function (it) { return it.status === 'pending'; }).map(copyItem),
        /* [v3.295.0 · X2] 「已报 done 但证据不足」单列：它不再是 pending（宿主确实动过手），
         *   却也没到 confirmed —— 压进 pending 会让「还没动」与「动了没证」同形，
         *   而不列出来则等于让无据的 done 悄悄消失。 */
        unconfirmed: r.affected.filter(function (it) { return it.status === 'done' && it.evidence !== 'confirmed'; }).map(copyItem),
        /* 未落定名单**只放真 pending**（旧语义不动）；未证实项在上面那格。 */
        evidence: EVIDENCE.includes(r.evidence) ? r.evidence : 'partial'
      });
    });
  }
  /** 诊断一行。 */
  function line(rawState) {
    try {
      const state = normalize(rawState);
      if (!state.repairs.length) return '暂无修复记录';
      let applied = 0, open = 0, partial = 0, abandoned = 0, items = 0, bad = 0, unproven = 0;
      for (const r of state.repairs) {
        items += r.affected.length;
        if (r.status === 'applied') applied++;
        else if (r.status === 'open') open++;
        else if (r.status === 'partial') partial++;
        else abandoned++;
        /* [v3.295.0 · X2] 两个口径都与 settle **逐字同源**，且**分开数**：
         *   bad      = failed / missing（流程未完成）；
         *   unproven = 报了 done 但证据没到 confirmed（流程走完、没被证明）。
         *   合成一个数就会让「没修完」与「修了没证」在诊断行上同形。 */
        bad += r.affected.filter(function (it) { return it.status === 'failed' || it.status === 'missing'; }).length;
        unproven += r.affected.filter(function (it) { return it.status === 'done' && it.evidence !== 'confirmed'; }).length;
      }
      const parts = ['修复 ' + state.repairs.length, '已落定 ' + applied];
      if (open) parts.push('未落定 ' + open + ' ⚠️');
      if (partial) parts.push('部分完成 ' + partial + ' ⚠️');
      if (abandoned) parts.push('已放弃 ' + abandoned);
      parts.push('派生件 ' + items);
      if (bad) parts.push('异常项 ' + bad);
      /* 「已落定但没被证明」单报 —— 它就是「仅登记不能显示事实已纠正」在诊断面上的样子。 */
      if (unproven) parts.push('未证实 ' + unproven + ' ⚠️');
      return parts.join(' · ');
    } catch (e) { return '—（修复账异常）'; }
  }
  const api = Object.freeze({
    normalize, request, settle, abandon, pending, line, affectedBy, poolList,
    // [v3.214.0] R1-F：预览与校验（preview 只算不改；validate 是 request/preview 的共用判据）
    preview, validate,
    /* [v3.295.0 · X2] 逐项修改方案（只读；与 preview 共用 affectedBy 与新 pool 契约）
     *   与证据判定（settle 与宿主回执共用**同一份**口径，不在宿主再抄一份）。 */
    plan, evidenceOf,
    ACTIONS, STATES, KINDS, POOL_KEYS, RL_VERSION,
    BASES, EVIDENCE, COVERAGE_STATE, INVERSE
  });
  root.LonShaRepairLoop = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);