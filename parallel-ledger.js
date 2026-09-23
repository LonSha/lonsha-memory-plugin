/* ========================================================
 * parallel-ledger.js — 平行事实账本 [v3.196.0]
 * --------------------------------------------------------
 * 伏笔账本回答「还没收的悬念」。本账本回答另一件事：主场景之外，
 * 别处正在发生、且可能回头影响主线的事实。
 *
 * 纪律（来自平行事件的状态约束，不搬提示词）：
 *   · 必须带地点。没有地点就不是「别处」，拒绝，不编一个地点。
 *   · audience 缺省 hidden：主场景角色不得靠读心、巧合或无理由直觉知道。
 *   · 公开（overheard）才允许进主线可见注入；hidden 只进作者侧背景块。
 *   · 在场角色（present）不得被记成这件事的知情人。
 *   · 未了结最多 MAX_OPEN 条；超额拒绝新记，不静默丢掉旧事实。
 *   · 了结后下一回合才清：sweep(floor) 只清 settledFloor < floor。
 * 不推断正文是否真的发生，只接收已经确认的事实。
 * 挂 window.LonShaParallelLedger。
 * ======================================================== */
'use strict';
(function (root) {
  const AUDIENCE = Object.freeze(['hidden', 'overheard']);
  const ACTIONS = Object.freeze(['note', 'touch', 'settle', 'drop']);
  const OPEN = Object.freeze({ open: true, touched: true });
  const MAX_ITEMS = 80;
  const MAX_OPEN = 4;
  const MAX_HISTORY = 6;

  function text(value, max) {
    const s = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return max ? s.slice(0, max) : s;
  }
  function finite(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  function names(value, maxEach, maxCount) {
    const src = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[、,，]/);
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
  function copyEvent(event) {
    return {
      action: ACTIONS.includes(event.action) ? event.action : 'touch',
      eventKey: text(event.eventKey, 120),
      floor: finite(event.floor),
      source: text(event.source, 40),
      note: text(event.note, 120)
    };
  }
  function copyItem(item) {
    const audience = AUDIENCE.includes(item.audience) ? item.audience : 'hidden';
    const status = item.status === 'settled' || item.status === 'dropped' ? item.status
      : (item.status === 'touched' ? 'touched' : 'open');
    return {
      id: text(item.id, 80),
      title: text(item.title, 80),
      fact: text(item.fact, 180),
      place: text(item.place, 80),
      when: text(item.when, 40),
      who: names(item.who, 40, 8),
      audience,
      status,
      revision: finite(item.revision) || 1,
      floor: finite(item.floor),
      updatedFloor: finite(item.updatedFloor),
      settledFloor: finite(item.settledFloor),
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
      if (!item.id || !item.title || !item.fact || !item.place || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(-MAX_ITEMS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'par_' + state.seq;
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
    return state.items.filter((item) => OPEN[item.status]).length;
  }
  function find(state, ref) {
    const id = text(ref && ref.id, 80);
    if (id) return state.items.find((item) => item.id === id) || null;
    const title = text(ref && ref.title, 80).toLowerCase();
    if (!title) return null;
    return state.items.find((item) => OPEN[item.status] && item.title.toLowerCase() === title) || null;
  }
  function blockedByPresence(who, present) {
    const here = new Set(names(present, 40, 12).map((name) => name.toLowerCase()));
    if (!here.size) return '';
    return names(who, 40, 8).find((name) => here.has(name.toLowerCase())) || '';
  }

  function note(rawState, input) {
    const state = normalize(rawState);
    const title = text(input && input.title, 80);
    const fact = text(input && input.fact, 180);
    const place = text(input && input.place, 80);
    if (!title) return reject(state, 'missing-title');
    if (!fact) return reject(state, 'missing-fact');
    if (!place) return reject(state, 'missing-place');
    const who = names(input && input.who, 40, 8);
    const blocked = blockedByPresence(who, input && input.present);
    if (blocked) return reject(state, 'present-knows');
    const audience = AUDIENCE.includes(input && input.audience) ? input.audience : 'hidden';
    const eventKey = text(input && input.eventKey, 120);
    const existing = state.items.find((item) => OPEN[item.status] && item.title.toLowerCase() === title.toLowerCase());
    if (existing) {
      const replayed = !eventKey || existing.history.some((event) => event.eventKey === eventKey);
      if (eventKey && !replayed) record(existing, { action: 'note', eventKey, floor: finite(input && input.floor), source: text(input && input.source, 40), note: '' });
      return result(state, { item: copyItem(existing), replayed, changed: !replayed });
    }
    if (openCount(state) >= MAX_OPEN) return reject(state, 'open-cap');
    const item = copyItem({
      id: nextId(state), title, fact, place, when: input && input.when, who, audience,
      status: 'open', revision: 0, floor: input && input.floor, updatedFloor: input && input.floor,
      settledFloor: null, source: input && input.source, history: []
    });
    record(item, { action: 'note', eventKey, floor: item.floor, source: item.source, note: '' });
    state.items.push(item);
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function transition(rawState, action, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    const event = {
      action, eventKey: text(input && input.eventKey, 120), floor: finite(input && input.floor),
      source: text(input && input.source, 40), note: noteText
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    if (action === 'touch') item.status = 'touched';
    else {
      item.status = action === 'drop' ? 'dropped' : 'settled';
      item.settledFloor = event.floor;
    }
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function remove(rawState, ref) {
    const state = normalize(rawState);
    const item = find(state, ref) || state.items.find((it) => it.id === text(ref && ref.id, 80));
    if (!item) return reject(state, 'not-found');
    if (OPEN[item.status]) return reject(state, 'open-locked');
    state.items = state.items.filter((it) => it.id !== item.id);
    return result(state, { item: copyItem(item), removed: true, changed: true });
  }

  function sweep(rawState, floor) {
    const state = normalize(rawState);
    const f = finite(floor);
    if (f == null) return reject(state, 'missing-floor');
    const before = state.items.length;
    state.items = state.items.filter((item) => {
      if (OPEN[item.status]) return true;
      if (item.settledFloor == null) return true;
      return item.settledFloor >= f;
    });
    return result(state, { swept: before - state.items.length, changed: state.items.length !== before });
  }

  function list(rawState, filter) {
    const state = normalize(rawState);
    const status = text(filter && filter.status, 20);
    const audience = text(filter && filter.audience, 20);
    return state.items.filter((item) => {
      if (status === 'openish') {
        if (!OPEN[item.status]) return false;
      } else if (status && item.status !== status) {
        return false;
      }
      if (audience && item.audience !== audience) return false;
      return true;
    }).map(copyItem);
  }
  const EOL = String.fromCharCode(10);
  function lineOf(item) {
    const who = item.who.length ? '，渊及 ' + item.who.join('、') : '';
    return '- ' + item.id + ' ' + item.title + '（' + item.place + '）' + who + '：' + item.fact;
  }
  function renderVisible(rawState, limit) {
    const items = list(rawState, { status: 'openish', audience: 'overheard' }).slice(-(finite(limit) || MAX_OPEN));
    if (!items.length) return '';
    return '「别处已传开的事」' + EOL + items.map(lineOf).join(EOL);
  }
  function renderHidden(rawState, limit) {
    const items = list(rawState, { status: 'openish', audience: 'hidden' }).slice(-(finite(limit) || MAX_OPEN));
    if (!items.length) return '';
    return '「别处正在发生｜在场角色不得知晓」' + EOL + items.map(lineOf).join(EOL);
  }
  const api = Object.freeze({
    AUDIENCE, MAX_OPEN,
    normalize, note,
    touch: (state, input) => transition(state, 'touch', input),
    settle: (state, input) => transition(state, 'settle', input),
    drop: (state, input) => transition(state, 'drop', input),
    remove, sweep, list, renderVisible, renderHidden
  });
  root.LonShaParallelLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
