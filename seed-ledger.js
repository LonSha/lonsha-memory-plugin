/* ========================================================
 * seed-ledger.js — 伏笔生命周期账本 [v3.195.0]
 * --------------------------------------------------------
 * 约定账本管的是「谁答应了什么」。伏笔是另一类状态：埋下之后必须能
 * 回答「还没收、正在收、已经收完」。状态机：
 *   open → advance / recover → recovered
 * 另有 cancel（明确作废，不是回收）。
 *
 * 纪律（来自预设的状态机，不搬提示词）：
 *   · 未回收条目禁止删除（remove 对 open/advancing 一律拒绝）。
 *   · 已回收条目在「下一回合」清除：sweep(floor) 只清 recoveredFloor < floor。
 *   · 未回收最多保留 MAX_OPEN 条；超额时拒绝新埋，不静默丢掉旧的未回收。
 *   · 分层：near = 近场（本段就能碰），far = 远场（跨段才碰）。
 * 不推断正文是否真的发生，只接收已经确认的事实。
 * 挂 window.LonShaSeedLedger。
 * ======================================================== */
'use strict';
(function (root) {
  const STATES = Object.freeze(['open', 'advancing', 'recovered', 'cancelled']);
  const LAYERS = Object.freeze(['near', 'far']);
  const ACTIONS = Object.freeze(['plant', 'advance', 'recover', 'cancel']);
  const TERMINAL = Object.freeze({ recovered: true, cancelled: true });
  const MAX_ITEMS = 80;
  const MAX_OPEN = 5;
  const MAX_HISTORY = 8;

  function text(value, max) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  function copyEvent(event) {
    return {
      action: ACTIONS.includes(event.action) ? event.action : 'advance',
      eventKey: text(event.eventKey, 120),
      floor: finite(event.floor),
      source: text(event.source, 40),
      note: text(event.note, 120)
    };
  }
  function copyItem(item) {
    const layer = LAYERS.includes(item.layer) ? item.layer : 'near';
    return {
      id: text(item.id, 80),
      hook: text(item.hook, 160),
      layer,
      status: STATES.includes(item.status) ? item.status : 'open',
      revision: finite(item.revision) || 1,
      floor: finite(item.floor),
      updatedFloor: finite(item.updatedFloor),
      recoveredFloor: finite(item.recoveredFloor),
      source: text(item.source, 40),
      history: Array.isArray(item.history) ? item.history.slice(-MAX_HISTORY).map(copyEvent) : []
    };
  }
  function clone(state) {
    return {
      version: 1,
      seq: finite(state && state.seq) || 0,
      items: Array.isArray(state && state.items) ? state.items.map(copyItem) : []
    };
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.items = state.items.filter((item) => {
      if (!item.id || !item.hook || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(-MAX_ITEMS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'seed_' + state.seq;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, state: normalize(state) }, extra);
  }
  function reject(state, reason) {
    return { ok: false, reason, changed: false, state: normalize(state) };
  }
  function record(item, event) {
    if (item.history.some((old) => old.eventKey && old.eventKey === event.eventKey)) return false;
    item.history.push(event);
    if (item.history.length > MAX_HISTORY) item.history = item.history.slice(-MAX_HISTORY);
    item.revision += 1;
    item.updatedFloor = event.floor;
    return true;
  }
  function openCount(state) {
    return state.items.filter((item) => item.status === 'open' || item.status === 'advancing').length;
  }
  function find(state, ref) {
    const id = text(ref && ref.id, 80);
    if (id) return state.items.find((item) => item.id === id) || null;
    const hook = text(ref && ref.hook, 160).toLowerCase();
    if (!hook) return null;
    return state.items.find((item) => (item.status === 'open' || item.status === 'advancing') && item.hook.toLowerCase() === hook) || null;
  }

  function plant(rawState, input) {
    const state = normalize(rawState);
    const hook = text(input && input.hook, 160);
    if (!hook) return reject(state, 'missing-hook');
    const layer = LAYERS.includes(input && input.layer) ? input.layer : 'near';
    const eventKey = text(input && input.eventKey, 120);
    const existing = state.items.find((item) => item.hook.toLowerCase() === hook.toLowerCase() && (item.status === 'open' || item.status === 'advancing'));
    if (existing) {
      const replayed = !eventKey || existing.history.some((event) => event.eventKey === eventKey);
      if (eventKey && !replayed) record(existing, { action: 'plant', eventKey, floor: finite(input && input.floor), source: text(input && input.source, 40), note: '' });
      return result(state, { item: copyItem(existing), replayed, changed: !replayed });
    }
    if (openCount(state) >= MAX_OPEN) return reject(state, 'open-cap');
    const item = copyItem({
      id: nextId(state), hook, layer, status: 'open', revision: 0,
      floor: input && input.floor, updatedFloor: input && input.floor,
      recoveredFloor: null, source: input && input.source, history: []
    });
    record(item, { action: 'plant', eventKey, floor: item.floor, source: item.source, note: '' });
    state.items.push(item);
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function transition(rawState, action, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (TERMINAL[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    if (action === 'recover' && item.status !== 'open' && item.status !== 'advancing') {
      return reject(state, 'bad-state');
    }
    const note = text(input && input.note, 120);
    if ((action === 'advance' || action === 'recover' || action === 'cancel') && !note && action !== 'recover') {
      if (action !== 'recover') return reject(state, 'empty-note');
    }
    if (action === 'advance' && !note) return reject(state, 'empty-note');
    if (action === 'cancel' && !note) return reject(state, 'empty-note');
    const event = {
      action, eventKey: text(input && input.eventKey, 120), floor: finite(input && input.floor),
      source: text(input && input.source, 40), note
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    if (action === 'advance') item.status = 'advancing';
    else if (action === 'recover') {
      item.status = 'recovered';
      item.recoveredFloor = event.floor;
    } else item.status = 'cancelled';
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  /** 未回收禁止删除。终态才允许按 id 摘除。 */
  function remove(rawState, ref) {
    const state = normalize(rawState);
    const item = find(state, ref) || state.items.find((it) => it.id === text(ref && ref.id, 80));
    if (!item) return reject(state, 'not-found');
    if (!TERMINAL[item.status]) return reject(state, 'open-locked');
    state.items = state.items.filter((it) => it.id !== item.id);
    return result(state, { item: copyItem(item), removed: true, changed: true });
  }

  /**
   * 下回合清已回收：只摘 recoveredFloor < floor 的已回收条。
   * 本回合刚回收的（recoveredFloor === floor 或未知）留到下一回合。
   * 未回收与已作废一律不动。
   */
  function sweep(rawState, floor) {
    const state = normalize(rawState);
    const f = finite(floor);
    if (f == null) return reject(state, 'missing-floor');
    const before = state.items.length;
    state.items = state.items.filter((item) => {
      if (item.status !== 'recovered') return true;
      if (item.recoveredFloor == null) return true;
      return item.recoveredFloor >= f;
    });
    return result(state, { swept: before - state.items.length, changed: state.items.length !== before });
  }

  function list(rawState, filter) {
    const state = normalize(rawState);
    const status = text(filter && filter.status, 20);
    const layer = text(filter && filter.layer, 20);
    return state.items.filter((item) => {
      if (status === 'unrecovered') return item.status === 'open' || item.status === 'advancing';
      if (status && item.status !== status) return false;
      if (layer && item.layer !== layer) return false;
      return true;
    }).map(copyItem);
  }
  function summarize(rawState) {
    const counts = { open: 0, advancing: 0, recovered: 0, cancelled: 0 };
    for (const item of normalize(rawState).items) counts[item.status] += 1;
    return counts;
  }
  function render(rawState, limit) {
    const openItems = list(rawState, { status: 'unrecovered' }).slice(-(finite(limit) || MAX_OPEN));
    if (!openItems.length) return '';
    return '【未回收伏笔】\n' + openItems.map((item) => {
      const tag = item.status === 'advancing' ? '回收中' : (item.layer === 'far' ? '远场' : '近场');
      return '- ' + item.id + '〔' + tag + '〕' + item.hook;
    }).join('\n');
  }

  const api = Object.freeze({
    STATES, LAYERS, MAX_OPEN,
    normalize, plant,
    advance: (state, input) => transition(state, 'advance', input),
    recover: (state, input) => transition(state, 'recover', input),
    cancel: (state, input) => transition(state, 'cancel', input),
    remove, sweep, list, summarize, render
  });
  root.LonShaSeedLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
