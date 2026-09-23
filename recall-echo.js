/* ========================================================
 * recall-echo.js — 前文回扣账本 [v3.197.0]
 * --------------------------------------------------------
 * 机制来自「前文回扣」提示词条（只搬机制不搬散文）：
 *   从五回合以前的内容中选取回扣价值高的真实细节，在当前情境
 *   自然重现，使其产生剧情/情感/人物关系上的新意义。
 *
 * 账本化约定：
 *   · 候选须是「真实的细节」（不篡改原意，不强行解释为伏笔）。
 *   · 冷却纪律：候选楼层必须 <= 当前楼层 - ECHO_GAP（五回合以前），
 *     太新的细节不收（too-fresh）。
 *   · 状态机：pending（候选）→ echoed（已回扣，强制 echoNote）
 *     / skipped（判定不合适，跳过，强制 skipNote）。
 *   · 防重复：同一 detail（归一化）在 pending 侧不重登记；
 *     已 echoed 的细节冷却期内不再回扣（cooled）。
 *   · 清扫：sweep(floor) 摘除过期回扣——echoed 且 echoFloor <
 *     floor - KEEP_FLOORS 的、全部 skipped 的。pending 不动。
 *   · 不推断正文是否真的重现了，只接收已确认的事实。
 * 挂 window.LonShaRecallEcho。
 * ======================================================== */
'use strict';
(function (root) {
  const STATES = Object.freeze(['pending', 'echoed', 'skipped']);
  const KINDS = Object.freeze(['clue', 'item', 'behavior', 'quote']);
  const ACTIONS = Object.freeze(['mark', 'echo', 'skip']);
  const TERMINAL = Object.freeze({ echoed: true, skipped: true });
  const MAX_ITEMS = 40;
  const MAX_PENDING = 8;
  const ECHO_GAP = 5;      // 候选必须五回合以前
  const KEEP_FLOORS = 20;  // 已回扣条目保留的楼层数
  function text(value, max) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  function copyItem(item) {
    return {
      id: text(item.id, 80),
      detail: text(item.detail, 200),
      kind: KINDS.includes(item.kind) ? item.kind : 'clue',
      weight: finite(item.weight) == null ? 50 : Math.max(0, Math.min(100, finite(item.weight))),
      status: STATES.includes(item.status) ? item.status : 'pending',
      floor: finite(item.floor),
      echoFloor: finite(item.echoFloor),
      echoNote: text(item.echoNote, 160),
      skipNote: text(item.skipNote, 160),
      source: text(item.source, 40)
    };
  }
  function clone(state) {
    return {
      version: 1,
      seq: finite(state && state.seq) || 0,
      lastEchoFloor: finite(state && state.lastEchoFloor),
      items: Array.isArray(state && state.items) ? state.items.map(copyItem) : []
    };
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.items = state.items.filter((item) => {
      if (!item.id || !item.detail || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(-MAX_ITEMS);
    return state;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, state: normalize(state) }, extra);
  }
  function reject(state, reason) {
    return { ok: false, reason, changed: false, state: normalize(state) };
  }
  /** 归一化 detail 指纹（防重复回扣） */
  function fingerprint(detail) {
    return text(detail, 200).toLowerCase().replace(/[，。、！？.,!?~～]/g, '');
  }
  function findByDetail(state, detail, statuses) {
    const fp = fingerprint(detail);
    if (!fp) return null;
    return state.items.find((item) => statuses.includes(item.status) && fingerprint(item.detail) === fp) || null;
  }
  /** 登记回扣候选：必须五回合以前的真实细节 */
  function mark(rawState, input) {
    const state = normalize(rawState);
    const detail = text(input && input.detail, 200);
    if (!detail) return reject(state, 'missing-detail');
    const floor = finite(input && input.floor);
    if (floor == null) return reject(state, 'missing-floor');
    const dup = findByDetail(state, detail, ['pending', 'echoed']);
    if (dup) return result(state, { item: copyItem(dup), replayed: true, changed: false, reason: 'duplicate' });
    const pendingCount = state.items.filter((item) => item.status === 'pending').length;
    if (pendingCount >= MAX_PENDING) return reject(state, 'pending-cap');
    state.seq += 1;
    const item = copyItem({
      id: 'echo_' + state.seq, detail,
      kind: KINDS.includes(input && input.kind) ? input.kind : 'clue',
      weight: finite(input && input.weight) == null ? 50 : finite(input && input.weight),
      status: 'pending', floor, echoFloor: null, echoNote: '', skipNote: '',
      source: input && input.source
    });
    state.items.push(item);
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }
  /** 回扣：把五回合前的细节在当前情境自然重现（强制 echoNote） */
  function echo(rawState, input) {
    const state = normalize(rawState);
    const id = text(input && input.id, 80);
    const item = id
      ? state.items.find((it) => it.id === id)
      : findByDetail(state, input && input.detail, ['pending']);
    if (!item) return reject(state, 'not-found');
    if (item.status === 'echoed') return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    if (item.status === 'skipped') return reject(state, 'bad-state');
    const echoNote = text(input && input.echoNote, 160);
    if (!echoNote) return reject(state, 'empty-note');
    const floor = finite(input && input.floor);
    if (floor == null) return reject(state, 'missing-floor');
    if (item.floor != null && floor - item.floor < ECHO_GAP) return reject(state, 'too-fresh');
    if (state.lastEchoFloor != null && floor === state.lastEchoFloor) return reject(state, 'echo-per-floor');
    item.status = 'echoed';
    item.echoFloor = floor;
    item.echoNote = echoNote;
    state.lastEchoFloor = floor;
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }
  /** 跳过：判定该候选不合适（不强行解释为伏笔），强制 skipNote */
  function skip(rawState, input) {
    const state = normalize(rawState);
    const id = text(input && input.id, 80);
    const item = id
      ? state.items.find((it) => it.id === id)
      : findByDetail(state, input && input.detail, ['pending']);
    if (!item) return reject(state, 'not-found');
    if (item.status === 'skipped') return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    if (item.status === 'echoed') return reject(state, 'bad-state');
    const skipNote = text(input && input.skipNote, 160);
    if (!skipNote) return reject(state, 'empty-note');
    item.status = 'skipped';
    item.skipNote = skipNote;
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }
  /** 清扫：摘过期回扣（echoFloor < floor - KEEP_FLOORS）与全部 skipped；pending 不动 */
  function sweep(rawState, floor) {
    const state = normalize(rawState);
    const f = finite(floor);
    if (f == null) return reject(state, 'missing-floor');
    const before = state.items.length;
    state.items = state.items.filter((item) => {
      if (item.status === 'pending') return true;
      if (item.status === 'skipped') return false;
      if (item.echoFloor == null) return true;
      return item.echoFloor >= f - KEEP_FLOORS;
    });
    return result(state, { swept: before - state.items.length, changed: state.items.length !== before });
  }
  function list(rawState, filter) {
    const state = normalize(rawState);
    const status = text(filter && filter.status, 20);
    const kind = text(filter && filter.kind, 20);
    return state.items.filter((item) => {
      if (status === 'openish') { if (item.status !== 'pending') return false; }
      else if (status && item.status !== status) return false;
      if (kind && item.kind !== kind) return false;
      return true;
    }).map(copyItem);
  }
  function summarize(rawState) {
    const counts = { pending: 0, echoed: 0, skipped: 0 };
    for (const item of normalize(rawState).items) counts[item.status] += 1;
    return counts;
  }
  /** 注入面：只给 pending 里回扣价值最高的候选（生成侧自行决定是否重现） */
  function render(rawState, limit) {
    const pending = list(rawState, { status: 'pending' })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, finite(limit) || 3);
    if (!pending.length) return '';
    return '【可回扣的前文细节】\n' + pending.map((item) => {
      const kindTag = { clue: '线索', item: '物品', behavior: '行为', quote: '原话' }[item.kind] || '细节';
      return '- 〔' + kindTag + '〕' + item.detail + (item.floor != null ? '（出现在第' + item.floor + '楼）' : '');
    }).join('\n') + '\n（若与当前情境自然契合才重现，不篡改原意，不强行解释为伏笔；没有合适内容则跳过）';
  }
  const api = Object.freeze({
    STATES, KINDS, MAX_PENDING, ECHO_GAP,
    normalize, mark, echo, skip, sweep, list, summarize, render
  });
  root.LonShaRecallEcho = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
