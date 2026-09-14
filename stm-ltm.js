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
const STM_FALLBACK_CHARS = 400;  // 无 summarize 通道时单条 STM 截断
const LTM_FALLBACK_CHARS = 600;  // 无 summarize 通道时 LTM 摘要截断

// ── state 初始化/归一 ────────────────────────────────────────────────
function defaultCursor() {
  return {
    stm: { position: 0, pending_partials: [], completedTurns: 0 },
    ltm: { position: 0, pending_partials: [] }
  };
}

function normalizeState(raw) {
  const s = (raw && typeof raw === 'object') ? raw : {};
  return {
    unconsolidated_stm: Array.isArray(s.unconsolidated_stm) ? s.unconsolidated_stm : [],
    stm_entries: Array.isArray(s.stm_entries) ? s.stm_entries : [],
    ltm_entries: Array.isArray(s.ltm_entries) ? s.ltm_entries : [],
    cursor_state: (s.cursor_state && typeof s.cursor_state === 'object')
      ? {
          stm: { ...defaultCursor().stm, ...(s.cursor_state.stm || {}) },
          ltm: { ...defaultCursor().ltm, ...(s.cursor_state.ltm || {}) }
        }
      : defaultCursor(),
    consolidate_threshold: Math.max(1, Number(s.consolidate_threshold) || DEFAULT_THRESHOLD),
    stm_counter: Number(s.stm_counter) || 0,
    ltm_counter: Number(s.ltm_counter) || 0
  };
}

// ── 1) 摄入：把新消息片段追加到 unconsolidated_stm（增量，不立即巩固）──
/**
 * @param {object} state 归一化前的持久化 state
 * @param {Array} msgs  [{ text, msg_id, floor, ts }] 本轮新增的聊天片段
 * @returns {object} 新 state（unconsolidated_stm 追加、游标不动）
 */
function ingest(state, msgs) {
  const s = normalizeState(state);
  const list = (Array.isArray(msgs) ? msgs : []).filter(m => m && (m.text || m.content));
  const base = s.stm_counter;
  const added = list.map((m, i) => ({
    id: 'raw_' + (base + i + 1) + '_' + (m.msg_id ?? m.floor ?? i),
    text: String(m.text ?? m.content ?? '').trim(),
    msg_id: m.msg_id ?? null,
    floor: m.floor ?? null,
    ts: m.ts ?? Date.now()
  })).filter(e => e.text);
  s.unconsolidated_stm = s.unconsolidated_stm.concat(added);
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
    return { state: s, consolidated: 0, usedAI: false };
  }
  if (!pending.length) return { state: s, consolidated: 0, usedAI: false };

  const texts = pending.map(p => p.text);
  let usedAI = false;
  let distilled;
  if (typeof opts.summarize === 'function') {
    try {
      distilled = String(await opts.summarize(texts) || '').trim();
      usedAI = !!distilled;
    } catch (e) { distilled = ''; usedAI = false; }
  }
  if (!distilled) {
    // 降级：拼接 + 截断
    distilled = texts.join(' / ').slice(-STM_FALLBACK_CHARS);
    usedAI = false;
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

  // STM 容量溢出 → 最旧的并入 LTM
  const overflow = s.stm_entries.length - MAX_STM_ENTRIES;
  if (overflow > 0) {
    const toLtm = s.stm_entries.slice(0, overflow);
    s.stm_entries = s.stm_entries.slice(overflow);
    await _rolloverToLtm(s, toLtm, opts);
  }
  return { state: s, consolidated: pending.length, usedAI };
}

// ── 3) LTM 滚动：把退役 STM 合并成一条长期摘要 ───────────────────────
async function _rolloverToLtm(s, stmList, opts) {
  if (!stmList.length) return s;
  const texts = stmList.map(e => e.text);
  let summary = '';
  if (typeof opts.summarize === 'function') {
    try { summary = String(await opts.summarize(texts) || '').trim(); } catch (e) { summary = ''; }
  }
  if (!summary) summary = texts.join(' / ').slice(-LTM_FALLBACK_CHARS);
  s.ltm_counter += 1;
  const floors = stmList.flatMap(e => e.floors || []);
  s.ltm_entries = s.ltm_entries.concat({
    id: 'ltm_' + s.ltm_counter,
    summary,
    from_stm_ids: stmList.map(e => e.id),
    ts: Date.now(),
    span: floors.length ? { from: Math.min(...floors), to: Math.max(...floors) } : null
  });
  // LTM 滚动窗口：超容量丢最旧
  if (s.ltm_entries.length > MAX_LTM_ENTRIES) {
    s.ltm_entries = s.ltm_entries.slice(s.ltm_entries.length - MAX_LTM_ENTRIES);
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
  s.unconsolidated_stm = s.unconsolidated_stm.filter(e => e.floor == null || !set.has(Number(e.floor)));
  s.stm_entries = s.stm_entries
    .map(e => ({
      ...e,
      floors: (e.floors || []).filter(f => !set.has(Number(f))),
      msg_ids: e.msg_ids // msg_id 不随楼层删（可能跨楼层）
    }))
    .filter(e => (e.floors && e.floors.length) || (e.msg_ids && e.msg_ids.length));
  return s;
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

const api = {
  DEFAULT_THRESHOLD, MAX_STM_ENTRIES, MAX_LTM_ENTRIES,
  normalizeState, defaultCursor,
  ingest, consolidate, pendingRaw, removeByFloors, reextract, recallView
};
if (typeof window !== 'undefined') window.LonShaStmLtm = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
