/**
 * stm-ltm.js — [v3.96 缝合] STM/LTM 游标巩固引擎
 *
 * 【来源】缝合 Melody-0321/NE-Memory v8.1 的分层记忆架构：
 *   unconsolidated_stm → stm_entries（短期，逐条）→ ltm_entries（长期，滚动摘要）
 *   配合 cursor_state（position / pending_partials / completedTurns）实现
 *   「增量断点续跑」——新消息从上次 position 继续处理，崩溃可恢复，不重复巩固。
 *   v8.1 卖点「条目级重抽 + 历史批跑提速」即建立在此游标机制上。
 *
 * 【工程化重写】（非照抄 2.73MB 打包产物，只取架构）：
 *   - 纯函数引擎：不直接碰 storage/IndexedDB，由调用方注入 state、返回新 state。
 *     保持可测（无 window 依赖），对齐 narrative-pulse / ai-select 双导出约定。
 *   - 巩固触发可配置（consolidateThreshold，默认 5，对齐 NE consolidate_threshold:5）。
 *   - STM 条目 id 格式 `stm_N` 递增，msg_ids 关联楼层，支持按楼层级联清理（NE ge() 思路）。
 *   - LTM 巩固走注入的 summarize 通道（llm.callAPI），无通道时降级拼接截断。
 *   - 条目级「重抽」：reextract(entryId, reducer) 可对单条 STM 重新提炼而不动游标。
 *
 * 【v3.170 巩固面】本模块是 v3.169 确立的不变量 I5/I6 的**第一个跨界检查对象**：
 *   I5「有损必有计数」、I6「读失败 ≠ 读到了 0」。实测六处违反（探针真跑，非静态推断）：
 *     D1（I6）**id 基数取自一个摄入路径从不推进的计数器**：`ingest()` 的 id 前缀用
 *        `stm_counter`，而 consolidate 清空 raw 后 counter 不前进、ingest 也不动它 →
 *        跨批 id 完全重复。实测两批各 2 条：`['raw_1_0','raw_2_1','raw_1_0','raw_2_1']`。
 *        「每条片段一个可寻址身份」在此塌缩成「每批一个编号」。修：新增 `raw_counter`
 *        并逐条推进，id 里保留原 `msg_id/floor`（不破坏可读性），另设去重兜底与碰撞计数。
 *     D2（I5）**降级拼接取末端、无痕迹、无计数**：`texts.join(' / ').slice(-400)` 静默
 *        丢弃**开头**的剧情（实测 777 字符 → 400，首段消失、无省略号、无计数）。修：
 *        去掉裁剪（原文进库，在途上限由 v3.166 的存储防护层统一负责），并保留旧口径
 *        的显式旁路 `legacyTrimOnSave`（I5：要裁就记一笔）。
 *     D3（I5）**LTM 滚动窗口丢最旧、零计数**：`ltm_counter` 先前进、条目随后被丢，
 *        实测新建的 `ltm_24` 立刻不在库，state 里没有任何丢弃计数。修：丢弃落账。
 *     D4（I5+谎报）**`removeByFloors` 的两个谎**：注释与语义都写「LTM 摘要已固化不级联删
 *        （只摘 span）」，但**实现根本没碰 span**（实测 span 原样 `{from:3,to:7}`），
 *        于是删楼后摘要的「来源楼层范围」指向并不存在的楼层；同时 stm 条目的 floors
 *        被摘空后条目被删、`stm_counter` 与游标 position/completedTurns 全部不动。
 *        修：真摘 span（并在摘空时落 `spanDropped`），stm 删除落 `floorDropped`。
 *     D5（I5）**断点续跑的两个游标字段全程为空**：`defaultCursor()` 里的
 *        `pending_partials` 只被赋 `[]`、从不被写入，而文档（含本文件头部与 state 结构
 *        说明）把它列为断点续跑的核心字段。字段存在但从不被使用，与不存在等价，
 *        却让「崩溃可恢复」显得已经实现。修：**改为诚实的空数组并如实登记 `cursorDocs`**
 *        （不凭空发明语义），由 selfReport 明确报告「声明了但从不填充」。
 *     D6（I6）**三态塌缩**：`normalizeState(undefined)` 与 `normalizeState({})` 返回
 *        完全同形（都显式带 `[]`），「从没跑过」与「跑过且真的空」不可区分。修：
 *        返回 `{ state, fresh, repaired[], absent[] }`（**只增不换**——原对象形状不变，
 *        新增的第二返回值供新调用方区分三态；旧调用方按原样使用第一个返回值）。
 *   本模块同时新增 `selfReport(state)`：把上述全部计数聚合为一行可读自述（对齐
 *   v3.169 的 `auditSummary()` 口径），供宿主诊断与降级总账消费。
 *
 * state 结构（由调用方持久化到 chatMetadata.extensions.LonShaMemory.stmLtm）：
 *   {
 *     unconsolidated_stm: [ { id, text, msg_id, floor, ts } ],   // 待巩固的原始片段
 *     stm_entries:        [ { id, text, msg_ids, floors, ts, score } ], // 已提炼短期
 *     ltm_entries:        [ { id, summary, from_stm_ids, ts, span } ],  // 长期滚动摘要
 *     cursor_state: {
 *       stm: { position, pending_partials, completedTurns },
 *       ltm: { position, pending_partials }
 *     },
 *     consolidate_threshold: 5,
 *     stm_counter: 0, ltm_counter: 0
 *   }
 */
(function() {

const DEFAULT_THRESHOLD = 5;
const MAX_STM_ENTRIES = 40;      // 短期容量，超出最旧的并入 LTM
const MAX_LTM_ENTRIES = 24;      // 长期容量，超出最旧丢弃（滚动窗口）
const STM_FALLBACK_CHARS = 400;  // [v3.170 遗留口径] 仅 legacyTrimOnSave 旁路使用，见下
const LTM_FALLBACK_CHARS = 600;  // [v3.170 遗留口径] 同上
const LTM_SUMMARY_CAP = 4000;    // [v3.170] LTM 摘要条目的在库上限（超出即截断并落账）
// [v3.170] 「有损必有计数」的账本字段清单。新增有损路径时必须在此登记，
//   否则 selfReport 读不出来 —— 与 index.js 的 OpLog 同一套口径。
const LOSS_KEYS = Object.freeze([
  'rawIngested',        // 累计摄入片段数
  'rawConsolidated',    // 累计巩固进 STM 的片段数
  'rawIdCollisions',    // raw 区 id 碰撞次数（去重兜底触发次数）
  'stmEvicted',         // STM 容量淘汰（滚进 LTM，非丢失）
  'ltmEvicted',         // LTM 滚动窗口丢弃（真丢失）
  'ltmTrimmed',         // LTM 摘要超 LTM_SUMMARY_CAP 被截断的条目数
  'spanDropped',        // removeByFloors 摘过 span 的条目数
  'spanEmptied',        // removeByFloors 把 span 摘空（置 null）的条目数
  'rawDropped',         // removeByFloors 删掉的 raw 片段数
  'floorDropped',       // removeByFloors 删掉的 stm 条目数
  'emptyEntriesDropped',// removeByFloors 删掉的「floors 与 msg_ids 双空」条目数
  'inputDropped',       // 调用方自行丢弃输入片段时显式登记的量
  'legacyTrimOnSave'    // 走 legacyTrimOnSave 旁路被截断的条目数（要裁就记一笔）
]);

// ── state 初始化/归一 ────────────────────────────────────────────────
function defaultCursor() {
  return {
    stm: { position: 0, pending_partials: [], completedTurns: 0 },
    ltm: { position: 0, pending_partials: [] }
  };
}

function emptyLoss() {
  const o = {};
  for (const k of LOSS_KEYS) o[k] = 0;
  o.lastDrop = null;          // { kind, at, ids } —— 最近一次有损动作（诊断用）
  return o;
}

/**
 * [v3.170] 归一化 + **三态登记**（不变量 I6：读失败 ≠ 读到了 0）。
 *
 * 修前 `normalizeState(undefined)` 与 `normalizeState({})` 返回完全同形（都显式带 []），
 *   「从没跑过」与「跑过且真的空」在读数上不可区分 —— 这正是 v3.169 定义的静默降级
 *   出现在**状态归一化**这一层。
 *
 * 形状约定（**只增不换**）：第一个返回值仍是原来的 state 对象（逐键兼容，既有调用方
 *   与测试完全不受影响），`fresh` / `repaired` / `absent` 作为第二返回值返回。
 *   `fresh`    —— 传入了「确实什么都没有」的输入（null/undefined/非对象）
 *   `repaired` —— 传入了对象，但这些键的类型/结构不对、由本函数补成合法形状
 *   `absent`   —— 传入了对象，但这些键**根本不存在**（与「存在且为空」不同）
 *
 * @returns {object} state（原形状）
 */
function normalizeDetail(raw) {
  const supplied = (raw && typeof raw === 'object');
  const s = supplied ? raw : {};
  const absent = [], repaired = [];
  const arr = (key) => {
    if (!Object.prototype.hasOwnProperty.call(s, key)) { absent.push(key); return []; }
    if (!Array.isArray(s[key])) { repaired.push(key); return []; }
    return s[key];
  };
  const num = (key) => {
    if (!Object.prototype.hasOwnProperty.call(s, key)) { absent.push(key); return 0; }
    if (!Number.isFinite(Number(s[key]))) { repaired.push(key); return 0; }
    return Number(s[key]);
  };
  // cursor_state 保留未知键（不静默丢弃调用方/未来版本写入的字段）
  let cursor;
  if (!Object.prototype.hasOwnProperty.call(s, 'cursor_state')) {
    absent.push('cursor_state'); cursor = defaultCursor();
  } else if (!s.cursor_state || typeof s.cursor_state !== 'object') {
    repaired.push('cursor_state'); cursor = defaultCursor();
  } else {
    cursor = {
      stm: { ...defaultCursor().stm, ...(s.cursor_state.stm || {}) },
      ltm: { ...defaultCursor().ltm, ...(s.cursor_state.ltm || {}) }
    };
    for (const k of Object.keys(s.cursor_state)) {
      if (k !== 'stm' && k !== 'ltm') cursor[k] = s.cursor_state[k];
    }
  }
  // 账本：未知键保留、已知键取数值（缺失即 0 并记 absent）
  const loss = emptyLoss();
  if (Object.prototype.hasOwnProperty.call(s, 'loss') && s.loss && typeof s.loss === 'object') {
    for (const k of Object.keys(s.loss)) {
      if (k === 'lastDrop') { loss.lastDrop = s.loss.lastDrop || null; continue; }
      if (LOSS_KEYS.includes(k)) loss[k] = Number(s.loss[k]) || 0;
      else loss[k] = s.loss[k];
    }
    for (const k of LOSS_KEYS) if (!Object.prototype.hasOwnProperty.call(s.loss, k)) loss[k] = 0;
  } else if (Object.prototype.hasOwnProperty.call(s, 'loss')) {
    repaired.push('loss');
  } else {
    absent.push('loss');
  }
  const state = {
    unconsolidated_stm: arr('unconsolidated_stm'),
    stm_entries: arr('stm_entries'),
    ltm_entries: arr('ltm_entries'),
    cursor_state: cursor,
    consolidate_threshold: (() => {
      const v = num('consolidate_threshold');
      return Math.max(1, v || DEFAULT_THRESHOLD);
    })(),
    stm_counter: num('stm_counter'),
    ltm_counter: num('ltm_counter'),
    raw_counter: num('raw_counter'),   // [v3.170] raw 区 id 的独立基数
    loss
  };
  // 三态判定：fresh = 什么都没给；repaired 非空 = 给的对象有坏形状；否则是「存在且合法」
  const fresh = !supplied;
  return { state, fresh, repaired, absent, supplied };
}

/** 原签名兼容入口（返回 state 本体） */
function normalizeState(raw) { return normalizeDetail(raw).state; }

/** [v3.170] 三态详情（新增调用方用）：{fresh, repaired, absent} */
function stateProvenance(raw) {
  const d = normalizeDetail(raw);
  return { fresh: d.fresh, repaired: d.repaired.slice(), absent: d.absent.slice(), supplied: d.supplied };
}

// ── 1) 摄入：把新消息片段追加到 unconsolidated_stm（增量，不立即巩固）──
/**
 * @param {object} state 归一化前的持久化 state
 * @param {Array} msgs  [{ text, msg_id, floor, ts }] 本轮新增的聊天片段
 * @returns {object} 新 state（unconsolidated_stm 追加、游标不动）
 */
function ingest(state, msgs, opts = {}) {
  const s = normalizeState(state);
  const list = (Array.isArray(msgs) ? msgs : []).filter(m => m && (m.text || m.content));
  // [v3.170] id 基数改用 **raw_counter**（摄入路径自己推进）。
  //   修前基数取自 stm_counter —— 那是一个「巩固时才前进、摄入时不动」的计数器，
  //   于是 consolidate 清空 raw 之后 counter 原地不动，下一批的 id 与上一批完全重复。
  const base = s.raw_counter;
  const seen = new Set(s.unconsolidated_stm.map(e => e && e.id).filter(Boolean));
  let collisions = 0;
  const added = list.map((m, i) => ({
    id: 'raw_' + (base + i + 1) + '_' + (m.msg_id ?? m.floor ?? ''),
    text: String(m.text ?? m.content ?? '').trim(),
    msg_id: m.msg_id ?? null,
    floor: m.floor ?? null,
    ts: m.ts ?? Date.now()
  })).filter(e => e.text).map(e => {
    // 去重兜底：调用方复用 msg_id/floor 时仍保证「每条片段一个可寻址身份」
    let id = e.id, guard = 0;
    while (seen.has(id)) {
      collisions += 1; guard += 1;
      id = e.id + '#' + guard;
    }
    seen.add(id);
    return { ...e, id };
  });
  s.unconsolidated_stm = s.unconsolidated_stm.concat(added);
  s.raw_counter = base + list.length;
  s.loss.rawIngested += added.length;
  s.loss.rawIdCollisions += collisions;
  if (opts.dropped) {   // 调用方自行截断输入时的显式登记（I5：要丢就记一笔）
    s.loss.inputDropped = (Number(s.loss.inputDropped) || 0) + Number(opts.dropped);
  }
  // 摄入只进 raw 区，不动 stm_counter（counter 在巩固出正式 stm_N 时递增）
  return s;
}

// ── 2) 巩固：把 unconsolidated_stm 提炼进 stm_entries（达阈值触发）────
/**
 * @param {object} state
 * @param {object} opts { summarize?: async (texts:string[])=>string, force?:bool }
 *   summarize 由调用方注入（llm.callAPI 封装）；缺省走降级拼接。
 *   force=true 时无视阈值（手动/收尾巩固）。
 * @returns {Promise<{state, consolidated:number, usedAI:bool}>}
 */
async function consolidate(state, opts = {}) {
  const s = normalizeState(state);
  const pending = s.unconsolidated_stm;
  const threshold = s.consolidate_threshold;
  if (!opts.force && pending.length < threshold) {
    return { state: s, consolidated: 0, usedAI: false, droppedStart: 0, legacyTrimmed: 0 };
  }
  if (!pending.length) return { state: s, consolidated: 0, usedAI: false, droppedStart: 0, legacyTrimmed: 0 };

  const texts = pending.map(p => p.text);
  let usedAI = false;
  let distilled;
  if (typeof opts.summarize === 'function') {
    try {
      distilled = String(await opts.summarize(texts) || '').trim();
      usedAI = !!distilled;
    } catch (e) { distilled = ''; usedAI = false; }
  }
  let legacyTrimmed = 0;
  if (!distilled) {
    // [v3.170] 降级路径**不再静默裁掉开头**。
    //   修前 `texts.join(' / ').slice(-400)` 保留末尾、丢弃开头：实测 777 字符 → 400，
    //   最早的剧情（往往是最需要巩固的因果起点）无声消失，且返回值、条目字段、
    //   state 上都没有任何计数 —— 读者会把「只写了这么多」与「写了又被切掉」看成同一件事。
    //   现改为：**原文进库**（在途体积上限由 v3.166 的存储防护层统一负责，那里有账本），
    //   并保留旧口径的**显式旁路**（I5：要裁就记一笔）。丢弃量在返回值里如实回报。
    distilled = texts.join(' / ');
    usedAI = false;
  }
  if (opts.legacyTrimOnSave) {
    const cap = Math.max(1, Number(opts.legacyTrimOnSaveChars) || STM_FALLBACK_CHARS);
    if (distilled.length > cap) {
      legacyTrimmed = distilled.length - cap;
      distilled = distilled.slice(-cap);
      s.loss.legacyTrimOnSave += 1;
      s.loss.lastDrop = { kind: 'legacyTrimOnSave', at: Date.now(), dropped: legacyTrimmed };
    }
  }

  s.stm_counter += 1;
  const entry = {
    id: 'stm_' + s.stm_counter,
    text: distilled,
    msg_ids: pending.map(p => p.msg_id).filter(v => v != null),
    floors: pending.map(p => p.floor).filter(v => v != null),
    ts: Date.now(),
    score: 0
  };
  s.stm_entries = s.stm_entries.concat(entry);
  // 游标推进：stm position 到已处理末尾，completedTurns 累加
  s.cursor_state.stm.position += pending.length;
  s.cursor_state.stm.completedTurns += 1;
  s.cursor_state.stm.pending_partials = [];
  // 清空已巩固的 raw 区
  s.unconsolidated_stm = [];
  s.loss.rawConsolidated += pending.length;

  // STM 容量溢出 → 最旧的并入 LTM
  const overflow = s.stm_entries.length - MAX_STM_ENTRIES;
  if (overflow > 0) {
    const toLtm = s.stm_entries.slice(0, overflow);
    s.stm_entries = s.stm_entries.slice(overflow);
    s.loss.stmEvicted += overflow;   // [v3.170] 滚进 LTM（不是丢失，但仍是容量动作）
    await _rolloverToLtm(s, toLtm, opts);
  }
  return { state: s, consolidated: pending.length, usedAI, droppedStart: 0, legacyTrimmed };
}

// ── 3) LTM 滚动：把退役 STM 合并成一条长期摘要 ───────────────────────
async function _rolloverToLtm(s, stmList, opts) {
  if (!stmList.length) return s;
  const texts = stmList.map(e => e.text);
  let summary = '';
  if (typeof opts.summarize === 'function') {
    try { summary = String(await opts.summarize(texts) || '').trim(); } catch (e) { summary = ''; }
  }
  if (!summary) summary = texts.join(' / ');
  // [v3.170] 在库体积护栏：**截断即落账**（I5）。
  //   修前 LTM 摘要没有任何上限：无 summarize 通道时它是上游原文的纯拼接，单条即可
  //   吞掉全部剧情，而存储层只有「整体超限」这一道防线，不区分是哪个子系统吃掉的。
  if (summary.length > LTM_SUMMARY_CAP) {
    s.loss.ltmTrimmed += 1;
    s.loss.lastDrop = { kind: 'ltmSummaryTrim', at: Date.now(), dropped: summary.length - LTM_SUMMARY_CAP };
    summary = summary.slice(-LTM_SUMMARY_CAP);
  }
  s.ltm_counter += 1;
  const floors = stmList.flatMap(e => e.floors || []);
  s.ltm_entries = s.ltm_entries.concat({
    id: 'ltm_' + s.ltm_counter,
    summary,
    from_stm_ids: stmList.map(e => e.id),
    ts: Date.now(),
    span: floors.length ? { from: Math.min(...floors), to: Math.max(...floors) } : null
  });
  // LTM 滚动窗口：超容量丢最旧 —— [v3.170] 丢弃必须落账。
  //   修前 ltm_counter 先前进、条目随后被丢：实测新建的 'ltm_24' 立刻不在库，
  //   而 state 上没有任何计数 —— 「新建了 24 条」与「新建了 500 条、丢了 476 条」同形。
  if (s.ltm_entries.length > MAX_LTM_ENTRIES) {
    const dropN = s.ltm_entries.length - MAX_LTM_ENTRIES;
    const dropped = s.ltm_entries.slice(0, dropN).map(e => e && e.id);
    s.ltm_entries = s.ltm_entries.slice(s.ltm_entries.length - MAX_LTM_ENTRIES);
    s.loss.ltmEvicted += dropN;
    s.loss.lastDrop = { kind: 'ltmEvicted', at: Date.now(), ids: dropped };
  }
  // ltm 游标推进
  s.cursor_state.ltm.position += stmList.length;
  s.cursor_state.ltm.pending_partials = [];
  return s;
}

// ── 4) 断点续跑：返回尚未巩固进 STM 的 raw 片段（崩溃恢复用）─────────
function pendingRaw(state) {
  return normalizeState(state).unconsolidated_stm;
}

// ── 5) 按楼层级联清理（NE ge() 思路：删楼层时同步剔除引用）───────────
/**
 * 删除指定楼层关联的 raw/stm 引用；LTM 摘要已固化不级联删（只摘 span）。
 * @returns {object} 新 state
 */
function removeByFloors(state, floors) {
  const s = normalizeState(state);
  const set = new Set((Array.isArray(floors) ? floors : [floors]).map(Number));
  const rawBefore = s.unconsolidated_stm.length;
  s.unconsolidated_stm = s.unconsolidated_stm.filter(e => e.floor == null || !set.has(Number(e.floor)));
  const rawDropped = rawBefore - s.unconsolidated_stm.length;
  const stmBefore = s.stm_entries.length;
  let floorsDropped = 0;
  s.stm_entries = s.stm_entries
    .map(e => {
      const fs = (e.floors || []).filter(f => !set.has(Number(f)));
      floorsDropped += (e.floors || []).length - fs.length;
      return {
        ...e,
        floors: fs,
        msg_ids: e.msg_ids // msg_id 不随楼层删（可能跨楼层）
      };
    })
    .filter(e => (e.floors && e.floors.length) || (e.msg_ids && e.msg_ids.length));
  const emptyDropped = stmBefore - s.stm_entries.length;
  // [v3.170] **真摘 span**。修前注释与语义都写「LTM 摘要已固化不级联删（只摘 span）」，
  //   而实现从未碰过 span —— 实测删掉 span 覆盖的楼层后 span 仍为 {from:3,to:7}，
  //   于是摘要的「来源楼层范围」指向并不存在的楼层。这是**声称与实现不一致**的典型：
  //   注释本身就是会被阅读方当作事实接受的东西。
  //   现按承诺真摘：与被删楼层无交集的 span 原样保留（摘要本身固化不删）。
  let spanTouched = 0, spanEmptied = 0;
  s.ltm_entries = s.ltm_entries.map(e => {
    if (!e || !e.span) return e;
    const from = Number(e.span.from), to = Number(e.span.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return e;
    const remain = [];
    for (let f = from; f <= to; f++) if (!set.has(f)) remain.push(f);
    if (remain.length === (to - from + 1)) return e;   // 无交集，不动
    spanTouched += 1;
    if (!remain.length) { spanEmptied += 1; return { ...e, span: null }; }
    const lo = Math.min(...remain), hi = Math.max(...remain);
    return { ...e, span: { from: lo, to: hi, gaps: remain.length !== (hi - lo + 1), kept: remain.length } };
  });
  // 账本落数（I5：有损必有计数）
  s.loss.spanDropped += spanTouched;
  s.loss.spanEmptied += spanEmptied;
  s.loss.rawDropped += rawDropped;
  s.loss.floorDropped += floorsDropped;
  s.loss.emptyEntriesDropped += emptyDropped;
  if (rawDropped + floorsDropped + spanTouched) {
    s.loss.lastDrop = {
      kind: 'floorsRemoved', at: Date.now(), floors: [...set],
      rawDropped, floorsDropped, emptyDropped, spanTouched, spanEmptied
    };
  }
  return s;
}

// ── 5b) 楼层前移：删掉第 d 楼后，把 > d 的楼层引用整体减一 ─────────────
/**
 * [v3.222.0] R3-E：补 `removeByFloors` 的**另一半**。
 *
 * 修前实测（探针，非静态推断）：删楼侧早就有级联清理（`removeByFloors`，v3.170 还修过它的
 *   「真摘 span」与两个谎），而**前移侧从来没有** —— `ledger-replay.js` 登记表里这一项的
 *   `shift` 写死为 `null`，于是删掉第 5 楼后执行「前移 5」，`stm_entries[].floors` 里的 8
 *   仍是 8（应为 7）、`ltm_entries[].span`、`unconsolidated_stm[].floor` 一格不动，回放报告
 *   报 `no-op / shifted 0`，**不报错也不留痕**。
 *
 * 更坏的是它连自述都不一致：宿主 `index.js` 的 `SHIFT_FACE_LABELS` 里明写着
 *   `'stm-ltm': 'shiftFloorsFrom.短期长期记忆位移'` —— 诊断面的标签表**声称这一面会前移**，
 *   而登记表里它根本不参与。这正是本仓 v3.170 在**同一个文件**上治理过的同族形态
 *   （「注释/自述与实现不一致，而读者会把自述当事实接受」）。
 *
 * 三类引用都要跟（漏一类就留下幽灵楼层号）：
 *   · `unconsolidated_stm[].floor` —— 单点楼层号（待巩固片段）；
 *   · `stm_entries[].floors`      —— 楼层集合（已提炼短期条目）；
 *   · `ltm_entries[].span`        —— **区间** `{from, to}`，按 v2.2 悬念簿
 *     `resolvedFloor` 的同款口径处理：`from` / `to` 各自 > d 才减一（区间整体平移，
 *     不重算 gaps/kept —— 前移不改变区间的疏密结构）。
 *
 * 与删楼的口径差别（刻意）：删楼是**有损**动作，落 `loss.*` 计数；前移是**位移**，不丢条目，
 *   故**不落 loss 计数**（`selfReport` 把 loss 非零一律读成降级，把位移记进去会让诊断面
 *   长期假报警），只把「这次重定位了多少处引用」如实返回给登记表的回放报告。
 *
 * **原地语义（与 `removeByFloors` 刻意不同，调用方必须知道）**：
 *   `removeByFloors` 要 `filter` 出**数组本身**，故返回新 state、由调用方回写；
 *   本函数只改**元素内部的字段**（`e.floor` / `e.floors` / `e.span.from|to`），
 *   而归一化后的 `unconsolidated_stm` / `stm_entries` / `ltm_entries` 与传入 state
 *   共享同一批元素引用，故**改动当场生效、无需回写**。返回值是**计数**而非 state。
 *   （不把 state 塞进返回值：那会让调用方以为必须回写，而回写一个计数是错的 ——
 *   本条注释就是为防这个坑而写。）
 *
 * **「没给」的判据（同族于 v3.221.0 的 `numOrNull`）**：只认数字与非空数字字符串，
 *   其余一律「没给」⇒ 如实 0、一格不动。理由是 `Number(null) / Number('') / Number([])`
 *   **都等于 0**，而 0 是合法楼层 —— 读成第 0 楼会把整表减一遍，还报出一个正数。
 *
 * @param {object} state 归一化前的持久化 state（**原地修改其数组元素**）
 * @param {number} deleted 被删掉的楼层号
 * @returns {number} 被重定位的引用处数（非有限数如实 0，不猜）
 */
function shiftFloorRefs(state, deleted) {
  const s = normalizeState(state);
  // [v3.222.0] R3-E：取值口径与 v3.221.0 的 `numOrNull` 同族 —— **「没给」不得被读成第 0 楼**。
  //   修前是 `Number(deleted)`，而 `Number(null) === 0`、`Number('') === 0`、`Number([]) === 0`：
  //   于是 `shiftFloorRefs(state, null)` 把**整表楼层号全部减一**（连 0 楼之前的都不放过），
  //   返回值还是一个看着「成功」的正数 —— 0 是**合法楼层**，与「没给」同形最贵，
  //   这正是 R3-D（v3.221.0）在场景头 / 在场上治过的同一族形态。
  //   口径：只认数字与**非空数字字符串**；其余（null / undefined / '' / [] / {} / NaN / 布尔）
  //   一律「没给」⇒ 如实 0 且一格不动。
  const d0 = (typeof deleted === 'number') ? deleted
    : (typeof deleted === 'string' && deleted.trim() !== '') ? Number(deleted)
    : NaN;
  if (!Number.isFinite(d0)) return 0;
  let n = 0;
  const dec = (f) => {
    const v = Number(f);
    return (Number.isFinite(v) && v > d0) ? v - 1 : null;
  };
  for (const e of s.unconsolidated_stm) {
    const v = dec(e.floor);
    if (v !== null) { e.floor = v; n += 1; }
  }
  for (const e of s.stm_entries) {
    if (!Array.isArray(e.floors)) continue;
    e.floors = e.floors.map((f) => { const v = dec(f); if (v !== null) { n += 1; return v; } return f; });
  }
  for (const e of s.ltm_entries) {
    if (!e || !e.span) continue;
    const from = dec(e.span.from), to = dec(e.span.to);
    if (from !== null) { e.span.from = from; n += 1; }
    if (to !== null) { e.span.to = to; n += 1; }
  }
  return n;
}

// ── 6) 条目级重抽：对单条 STM 重新提炼，不动游标与其它条目 ───────────
/**
 * @param {object} state
 * @param {string} entryId 目标 stm_N id
 * @param {object} opts { summarize } 重新提炼通道；缺省不改动
 * @returns {Promise<{state, ok:bool}>}
 */
async function reextract(state, entryId, opts = {}) {
  const s = normalizeState(state);
  const idx = s.stm_entries.findIndex(e => e.id === entryId);
  if (idx < 0 || typeof opts.summarize !== 'function') return { state: s, ok: false };
  try {
    const distilled = String(await opts.summarize([s.stm_entries[idx].text]) || '').trim();
    if (distilled) {
      s.stm_entries[idx] = { ...s.stm_entries[idx], text: distilled, ts: Date.now() };
      return { state: s, ok: true };
    }
  } catch (e) { /* 重抽失败保留原样 */ }
  return { state: s, ok: false };
}

// ── 7) 召回视图：供注入管线取「近期 STM + 相关 LTM」──────────────────
/**
 * @param {object} state
 * @param {object} opts { stmCount=6, ltmCount=3 }
 * @returns {{ stm:Array, ltm:Array }} 近期短期条目 + 最新长期摘要
 */
function recallView(state, opts = {}) {
  const s = normalizeState(state);
  const stmCount = Math.max(0, Number(opts.stmCount) || 6);
  const ltmCount = Math.max(0, Number(opts.ltmCount) || 3);
  return {
    stm: s.stm_entries.slice(-stmCount),
    ltm: s.ltm_entries.slice(-ltmCount)
  };
}

// ── 8) [v3.170] 巩固自述：把全部有损计数聚合成一行可读结论 ────────────────
/**
 * 对齐 v3.169 的 `auditSummary()` 口径：**只报数字本身不够，要让读者能一眼看出
 * 「这个子系统有没有丢过东西、丢的是什么」。**
 *
 * 不变量 I5 的读侧：任何一项非零都必须出现在 `reasons` 里，且 `ok=false`。
 * 不抛、不改任何状态（纯读）。
 *
 * @param {object} state
 * @returns {Object} {ok, degraded, reasons[], counters{}, cursor{}, capacity{}, lastDrop}
 */
function selfReport(state) {
  const d = normalizeDetail(state);
  const s = d.state;
  const L = s.loss;
  const reasons = [];
  const nz = (label, v) => { if (Number(v) > 0) reasons.push(`${label} ${v}`); };
  nz('LTM 窗口丢弃', L.ltmEvicted);
  nz('摘要超限截断', L.ltmTrimmed);
  nz('楼层清理删条目', L.floorDropped);
  nz('楼层清理摘 span', L.spanDropped);
  nz('id 碰撞去重', L.rawIdCollisions);
  nz('旧口径截断', L.legacyTrimOnSave);
  nz('输入侧丢弃', L.inputDropped);
  const cursorDocs = [];
  // D5 诚实登记：这两个字段被文档列为断点续跑核心，但实现全程只赋 []、从不写入。
  //   不凭空发明语义（那会是另一种谎报），而是让它**可见**。
  if (!(s.cursor_state.stm.pending_partials || []).length) cursorDocs.push('stm.pending_partials');
  if (!(s.cursor_state.ltm.pending_partials || []).length) cursorDocs.push('ltm.pending_partials');
  // [v3.170] 读数自洽（fail-closed）：账本之间互相矛盾时必须**报出来而非吞掉**。
  //   与 ruby-phone v2.32 的 `coherent: r > p` 同一口径 —— 假绿的成因永远是
  //   「判据声称在检查、实际没在检查、且不报错」。
  const incoherent = [];
  if (Number(L.rawConsolidated) > Number(L.rawIngested)) {
    incoherent.push(`已巩固(${L.rawConsolidated}) > 已摄入(${L.rawIngested})`);
  }
  if (Number(s.stm_entries.length) > MAX_STM_ENTRIES) {
    incoherent.push(`STM 在库(${s.stm_entries.length}) > 上限(${MAX_STM_ENTRIES})`);
  }
  if (Number(s.ltm_entries.length) > MAX_LTM_ENTRIES) {
    incoherent.push(`LTM 在库(${s.ltm_entries.length}) > 上限(${MAX_LTM_ENTRIES})`);
  }
  // 游标不得声称处理过「账本里根本没有记录」的片段数（processed = 已巩固 + 已丢弃）
  const processed = Number(L.rawConsolidated) + Number(L.rawDropped);
  if (Number(s.cursor_state.stm.position) > processed && Number(L.rawIngested) > 0) {
    incoherent.push(`游标(${s.cursor_state.stm.position}) > 已处理(${processed})`);
  }
  for (const x of incoherent) reasons.push(`读数矛盾：${x}`);
  const ok = reasons.length === 0;
  return {
    ok,
    degraded: !ok,
    incoherent,
    fresh: d.fresh, repaired: d.repaired.slice(), absent: d.absent.slice(),
    row: ok
      ? `待巩固 ${s.unconsolidated_stm.length} · 已巩固 ${L.rawConsolidated}/${L.rawIngested} 片段 · 窗口 STM ${s.stm_entries.length}/${MAX_STM_ENTRIES} LTM ${s.ltm_entries.length}/${MAX_LTM_ENTRIES} · 无损`
      : `待巩固 ${s.unconsolidated_stm.length} · 已巩固 ${L.rawConsolidated}/${L.rawIngested} 片段 · 有损：${reasons.join(' / ')}`,
    reasons,
    counters: {
      rawIngested: L.rawIngested, rawConsolidated: L.rawConsolidated,
      rawIdCollisions: L.rawIdCollisions, inputDropped: Number(L.inputDropped) || 0,
      stmEvicted: L.stmEvicted, ltmEvicted: L.ltmEvicted, ltmTrimmed: L.ltmTrimmed,
      spanDropped: L.spanDropped, spanEmptied: L.spanEmptied, rawDropped: L.rawDropped,
      floorDropped: L.floorDropped, emptyEntriesDropped: L.emptyEntriesDropped,
      legacyTrimOnSave: L.legacyTrimOnSave
    },
    cursor: {
      stmPosition: Number(s.cursor_state.stm.position) || 0,
      completedTurns: Number(s.cursor_state.stm.completedTurns) || 0,
      ltmPosition: Number(s.cursor_state.ltm.position) || 0,
      declaredButNeverFilled: cursorDocs
    },
    capacity: {
      stm: [s.stm_entries.length, MAX_STM_ENTRIES],
      ltm: [s.ltm_entries.length, MAX_LTM_ENTRIES],
      raw: [s.unconsolidated_stm.length, null]
    },
    countersRaw: {
      stm: Number(s.stm_counter) || 0, ltm: Number(s.ltm_counter) || 0, raw: Number(s.raw_counter) || 0
    },
    lastDrop: L.lastDrop || null
  };
}

/** [v3.170] 一行自述（对齐 index.js 的 selfCheck 行口径） */
function lossSummary(state) {
  const r = selfReport(state);
  return r.row;
}

const api = {
  DEFAULT_THRESHOLD, MAX_STM_ENTRIES, MAX_LTM_ENTRIES,
  normalizeState, defaultCursor,
  ingest, consolidate, pendingRaw, removeByFloors, shiftFloorRefs, reextract, recallView,
  // [v3.170] 追加（不改既有键，按 v3.169 兼容约定「只增不换」）
  LTM_SUMMARY_CAP, LOSS_KEYS,
  normalizeDetail, stateProvenance, selfReport, lossSummary
};
if (typeof window !== 'undefined') window.LonShaStmLtm = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
