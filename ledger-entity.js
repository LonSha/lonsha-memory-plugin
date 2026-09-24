/* ========================================================
 * ledger-entity.js — 账本实体契约（单一真源）[v3.207.0]
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓有六本「逐条实体 + 变更历史」的账：
 *     伏笔 seed-ledger · 秘密 secret-ledger · 平行事实 parallel-ledger ·
 *     约定 commitment-ledger · 时间与事实版本 fact-version · 事件线 event-completeness
 *   六本账的**实体读取契约**本是同一套，却各自抄了一份（v3.207 逐文件实测的逐字重复）：
 *     · `revision: finite(x) || 1`            —— 6 处逐字相同
 *     · `item.revision += 1`                  —— 6 处
 *     · `history 幂等比对 + push + 截断`       —— 5 处（前四本逐字相同，fact-version 归一化键）
 *     · `function finite(v)`                  —— 6 处逐字相同
 *     · `function text(v, max)`               —— 6 处逐字相同
 *     · `function names(...)`                 —— 2 处（parallel / secret，仅参数不同）
 *   同形重复本身不是缺陷，但它让一份契约有了 6 份拷贝：**改一处漏五处**正是本仓
 *   治理过多轮的那类漏（与 v3.202「新增子系统忘了接回滚」同形）。
 *   本模块把契约收成一份，六本账只传各自的局部常量（MAX_HISTORY / MAX_ITEMS）与归一化器。
 *
 * 【第二件事：revision 此前是「写进去但没人读」的字段】
 *   v3.207 实测：六本账的 `item.revision` 在本仓**外部零消费** ——
 *   没有任何调用点读它，也没有任何测试锁定它的数值（命中的 `_revision` 是存储层乐观锁，
 *   `task-inbox` 的 revision 是另一族，两者与账本实体的小写 `revision` 不同源）。
 *   本模块把「读回被替代计数」做成只读诊断（`line`），由 index.js 自检面消费 ——
 *   revision 从此有真实消费点，「有账但从未被替代」与「有条目却读不出修订号」都看得见。
 *
 * 【第三件事：一条纪律的显式化（它看起来像缺陷，但复核证伪）】
 *   创建期的 `revision: 0` 与读回期的 `|| 1` **不是** off-by-one：
 *   0 是「尚未定型」的创建占位，读回时定型为 1（首次写入）。故 REVISION 有两位——
 *   CREATE = 0（创建占位） / MIN = 1（定型下界），读回一律 >= MIN。
 *   写进注释是因为 v3.207 侦察初判即为 off-by-one，逐条复核后证伪；
 *   不写下来，下一个人还会再判一次。
 *
 * 【本模块不做什么（边界）】
 *   · 不收 `MAX_ITEMS` / `normalize`：六本账的身份判据（id/title/hook/secret/actor…）各不相同，
 *     强行统一会把「各账保留哪些字段」的差异抹掉。
 *   · 不收 `MAX_HISTORY`：各账不同（平行 6 / 秘密 8 / 伏笔 8 / 约定 12 / 事实 12），
 *     由调用方传参；常量留在各自模块里 —— 局部常量是**意图**，收上来就看不见差异了。
 *   · 不收事件形状（copyEvent 由各账自带）：事件的字段集正是各账的**领域**，
 *     平行事实带 place/who、秘密带 progress、约定带 due —— 这一层不该被统一。
 *   · 不抛：所有函数对畸形输入一律降级为契约内的默认值（与六本账既有行为逐位一致）。
 *
 * 挂 window.LonShaLedgerEntity，供六本账与 index.js 自检面取用。
 * ======================================================== */
'use strict';
(function (root) {
  /** 修订号两位：CREATE = 创建占位（尚未定型）；MIN = 定型下界（读回一律 >= MIN）。 */
  const REVISION = Object.freeze({ CREATE: 0, MIN: 1 });
  /** 名单默认分隔符（与六本账此前的字面量逐字一致）。 */
  const NAME_SEPS = /[、,，]/;
  /** 默认条目容器名（六本账里有四本用 items，其余两本显式传 facts / events）。 */
  const DEFAULT_BOX = 'items';

  function text(value, max) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  /** 名单归一：去空、去重（大小写不敏感）、截断；非数组按分隔符切串。 */
  function names(value, maxEach, maxCount, seps) {
    const src = Array.isArray(value) ? value : String(value == null ? '' : value).split(seps || NAME_SEPS);
    const out = [];
    const seen = new Set();
    for (const raw of src) {
      const name = text(raw, maxEach || 40);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
      if (out.length >= (maxCount || 8)) break;
    }
    return out;
  }
  /** 读回：非法 / 缺省 / 创建占位一律定型为 MIN（1）。**不改入参**。 */
  function revisionOf(item) {
    return finite(item && item.revision) || REVISION.MIN;
  }
  /**
   * 写入：在**原值**上 +1（创建占位 0 → 1，即「定型」）。**不得**经 revisionOf ——
   *   revisionOf 把 0 归一到 MIN=1，定型时就会多加一次（0 → 2）。
   *   这是本版实施时实测踩到的坑（smoke 首跑 revision 全为 2），写下来防复现。
   *   非数值原值按 0 起算；可达路径上条目一律先过 copyItem 定型为数字，
   *   故这一支只对畸形输入生效 —— 取「有定义的 1」而非旧写的 NaN。
   */
  function bumpRevision(item) {
    if (!item || typeof item !== 'object') return REVISION.MIN;
    const raw = finite(item.revision);
    item.revision = (raw == null ? 0 : raw) + 1;
    return item.revision;
  }
  /**
   * 记一次变更：幂等（同 eventKey 不重复入账）→ push → 截断 → 版本 +1 → 可选戳 updatedFloor。
   * @returns {boolean} true = 入账（版本已 +1）；false = 事件重放（一个字都没改）
   * opts.maxHistory 历史条数上限（各账不同，调用方传）；
   * opts.stampFloor  true 时把 `event.floor` **原样**写进 `item.updatedFloor`。
   *   必须原样、**不得过 finite()**：`finite(null)` 得 0 而不是 null，
   *   会把「楼层未知」静默变成「第 0 楼」—— 这是本契约里最容易写错的一格，
   *   故由 v3207 用例把两种写法分开钉住。
   * opts.prepare     push 前的归一化（如某账的 copyEvent）；不给则原样入账。
   */
  function recordEvent(item, event, opts) {
    const o = opts || {};
    const max = Number(o.maxHistory) > 0 ? Number(o.maxHistory) : 0;
    if (!item || !Array.isArray(item.history)) return false;
    const key = text(event && event.eventKey, 120);
    if (key && item.history.some((old) => old && old.eventKey && old.eventKey === key)) return false;
    item.history.push(typeof o.prepare === 'function' ? o.prepare(event) : event);
    if (max && item.history.length > max) item.history = item.history.slice(-max);
    bumpRevision(item);
    if (o.stampFloor) item.updatedFloor = event && event.floor;
    return true;
  }
  /** 读回历史：只取末 max 条，逐条过归一化器（不给归一化器则原样返回）。 */
  function copyHistory(item, max, copyEvent) {
    const src = Array.isArray(item && item.history) ? item.history : [];
    const cut = Number(max) > 0 ? src.slice(-Number(max)) : src;
    return typeof copyEvent === 'function' ? cut.map(copyEvent) : cut;
  }

  /**
   * 单本账的实体读数。三态可分：
   *   total      条目总数
   *   revisions  各条目 revision 之和（revision 的语义 = 该实体写入序号 + 1：创建占位 0 在
   *              定型时 +1，此后每记一次事件再 +1。故「只创建未改过」的条目是 **2**，不是 1，
   *              也不是「被替代过 1 次」—— 本字段因此只做**只读合计**，不解释成「替换次数」）
   *   unformed   读不出合法修订号的条目数（缺字段 / 0 / NaN / 负数 / 非数值）
   * `unformed > 0` 才是真信号：账本实体一律经本契约写出，读回至少 MIN；
   * 读到未定型说明这份状态**不是**本契约写的（旧版存档 / 手改存档 / 有人绕过了写入面）。
   * （注意：revision = 2 是**正常**的「创建后被记录一次以上」，不是异常，故本读数不对它报警。）
   */
  function scanBook(state, box) {
    const list = Array.isArray(state && state[box]) ? state[box] : [];
    let total = 0;
    let revisions = 0;
    let unformed = 0;
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      total++;
      const raw = finite(it.revision);
      if (raw == null || raw < REVISION.MIN) unformed++;
      else revisions += raw;
    }
    return { total: total, revisions: revisions, unformed: unformed };
  }
  /**
   * 诊断一行：回答「六本账有多少条目、修订合计多少、有没有读不出修订号的」。
   * 入参形如 [{ label:'约定', state, box:'items' }, …]（容器名默认 'items'）。
   * 只读：绝不改传进来的状态。
   */
  function line(books) {
    try {
      const list = Array.isArray(books) ? books : [];
      let total = 0;
      let revisions = 0;
      let unformed = 0;
      let live = 0;
      for (const b of list) {
        const r = scanBook(b && b.state, (b && b.box) || DEFAULT_BOX);
        if (r.total) live++;
        total += r.total;
        revisions += r.revisions;
        unformed += r.unformed;
      }
      if (!total) return '暂无账本条目';
      return '账本实体 ' + live + '/' + list.length + ' 本 · 条目 ' + total
        + ' · 修订合计 ' + revisions + (unformed ? ' · 未定型 ' + unformed + '（非本契约写入）' : '');
    } catch (e) { return '—（账本实体异常）'; }
  }

  const api = Object.freeze({
    REVISION, DEFAULT_BOX,
    text, finite, names,
    revisionOf, bumpRevision, recordEvent, copyHistory,
    scanBook, line
  });
  root.LonShaLedgerEntity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
