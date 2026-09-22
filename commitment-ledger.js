/* ========================================================
 * commitment-ledger.js — 约定闭环账本 [v3.187.0]
 * --------------------------------------------------------
 * 已有 promises 账本记录“立下 / 履行 / 违约”，但缺少约定变更、
 * 截止时间与撤销原因。本模块是纯函数账本：
 *   open → amend / fulfill / break / cancel
 * 每次变化保留来源、时间、修订号与历史；重复事件按 eventKey 幂等。
 * 不推断正文是否真的发生，只接收已经确认的事实。
 * 挂 window.LonShaCommitmentLedger。
 * ======================================================== */
'use strict';
(function (root) {
  const STATES = Object.freeze(['open', 'fulfilled', 'broken', 'cancelled']);
  const ACTIONS = Object.freeze(['open', 'amend', 'fulfill', 'break', 'cancel']);
  const TERMINAL = Object.freeze({ fulfilled: true, broken: true, cancelled: true });
  const MAX_ITEMS = 200;
  const MAX_HISTORY = 12;

  function text(value, max) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  function clone(state) {
    return {
      version: 1,
      seq: finite(state?.seq) || 0,
      items: Array.isArray(state?.items) ? state.items.map(copyItem) : []
    };
  }
  function copyItem(item) {
    return {
      id: text(item.id, 80),
      actor: text(item.actor, 40),
      content: text(item.content, 160),
      counterpart: text(item.counterpart, 40),
      due: item.due == null ? null : text(item.due, 40),
      status: STATES.includes(item.status) ? item.status : 'open',
      revision: finite(item.revision) || 1,
      floor: finite(item.floor),
      updatedFloor: finite(item.updatedFloor),
      source: text(item.source, 40),
      history: Array.isArray(item.history) ? item.history.slice(-MAX_HISTORY).map(copyEvent) : []
    };
  }
  function copyEvent(event) {
    return {
      action: ACTIONS.includes(event.action) ? event.action : 'amend',
      eventKey: text(event.eventKey, 120),
      floor: finite(event.floor),
      source: text(event.source, 40),
      reason: text(event.reason, 120),
      due: event.due == null ? null : text(event.due, 40)
    };
  }
  function keyOf(item) {
    return text(item.actor).toLowerCase() + '\u0000' + text(item.content).toLowerCase();
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.items = state.items.filter((item) => {
      if (!item.id || !item.actor || !item.content || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(-MAX_ITEMS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'cmt_' + state.seq;
  }
  function find(state, ref) {
    const id = text(ref?.id, 80);
    if (id) return state.items.find((item) => item.id === id) || null;
    const actor = text(ref?.actor, 40);
    const content = text(ref?.content, 160);
    if (!actor || !content) return null;
    const key = actor.toLowerCase() + '\u0000' + content.toLowerCase();
    return state.items.find((item) => item.status === 'open' && keyOf(item) === key) || null;
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

  function open(rawState, input) {
    const state = normalize(rawState);
    const actor = text(input?.actor, 40);
    const content = text(input?.content, 160);
    if (!actor || !content) return reject(state, 'missing-fact');
    const existing = state.items.find((item) => item.status === 'open' && keyOf(item) === keyOf({ actor, content }));
    const eventKey = text(input?.eventKey, 120);
    if (existing) {
      const replayed = !eventKey || existing.history.some((event) => event.eventKey === eventKey);
      if (eventKey && !replayed) record(existing, { action: 'open', eventKey, floor: finite(input?.floor), source: text(input?.source, 40), reason: '', due: existing.due });
      return result(state, { item: copyItem(existing), replayed, changed: !replayed });
    }
    const item = copyItem({
      id: nextId(state), actor, content,
      counterpart: input?.counterpart, due: input?.due,
      status: 'open', revision: 0, floor: input?.floor,
      updatedFloor: input?.floor, source: input?.source, history: []
    });
    record(item, { action: 'open', eventKey, floor: item.floor, source: item.source, reason: '', due: item.due });
    state.items.push(item);
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function transition(rawState, action, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (TERMINAL[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const event = {
      action, eventKey: text(input?.eventKey, 120), floor: finite(input?.floor),
      source: text(input?.source, 40), reason: text(input?.reason, 120), due: input?.due == null ? item.due : text(input.due, 40)
    };
    if (action === 'amend' && !event.reason && (input?.due == null || event.due === item.due) && !text(input?.content, 160)) {
      return reject(state, 'empty-amend');
    }
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    if (action === 'amend') {
      if (input?.due !== undefined) item.due = event.due;
      const content = text(input?.content, 160);
      if (content) item.content = content;
    } else item.status = action === 'fulfill' ? 'fulfilled' : action === 'break' ? 'broken' : 'cancelled';
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function list(rawState, filter) {
    const state = normalize(rawState);
    const status = text(filter?.status, 20);
    const actor = text(filter?.actor, 40).toLowerCase();
    return state.items.filter((item) => (!status || item.status === status) && (!actor || item.actor.toLowerCase() === actor)).map(copyItem);
  }
  function summarize(rawState) {
    const counts = { open: 0, fulfilled: 0, broken: 0, cancelled: 0 };
    for (const item of normalize(rawState).items) counts[item.status] += 1;
    return counts;
  }
  function render(rawState, limit) {
    const openItems = list(rawState, { status: 'open' }).slice(-(finite(limit) || 6));
    if (!openItems.length) return '';
    return '【未完成约定】\n' + openItems.map((item) => {
      const who = item.counterpart ? item.actor + ' 对 ' + item.counterpart : item.actor;
      return '- ' + item.id + ' ' + who + '：' + item.content + (item.due ? '（' + item.due + '前）' : '');
    }).join('\n');
  }

  const api = Object.freeze({
    normalize, open,
    amend: (state, input) => transition(state, 'amend', input),
    fulfill: (state, input) => transition(state, 'fulfill', input),
    break: (state, input) => transition(state, 'break', input),
    cancel: (state, input) => transition(state, 'cancel', input),
    list, summarize, render
  });
  root.LonShaCommitmentLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
