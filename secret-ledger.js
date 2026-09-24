/* ========================================================
 * secret-ledger.js — 秘密账本 [v3.196.0]
 * --------------------------------------------------------
 * 伏笔是「还没收的悬念」。秘密是另一类：某个角色此刻绝对不该知道，
 * 揭露必须有出处，不能靠读心或巧合。
 *
 * 纪律（来自秘密档案的状态约束，不搬提示词）：
 *   · 必须点名 keeper（谁还不知道）。没有守密人就拒绝。
 *   · progress 只接受调用方给出的 0–100 整数，不从正文猜。
 *   · 未到 100 禁止 reveal。reveal 必须带 note，说明这一轮怎么被知道。
 *   · 在场名单里出现 keeper 时，禁止把进度推进或标成已揭露。
 *   · 已揭露条目下一回合才清：sweep(floor) 只清 revealedFloor < floor。
 *   · 未揭露最多 MAX_OPEN 条；超额拒绝新秘密，不覆盖旧的。
 * 不推断正文是否真的发生，只接收已经确认的事实。
 * 挂 window.LonShaSecretLedger。
 * ======================================================== */
'use strict';
(function (root) {
  // [v3.207] 账本实体契约单一真源（ledger-entity.js）。取库双通道与 index.js 的 _moduleLib 同形：
  //   浏览器走全局（extra_js 在入口之后加载，故在 IIFE 内**惰性**取，不能构造期缓存）、Node 走 require。
  //   两处写法在六本账里逐字同形，便于常驻门禁按字面量扫描（tests/audit/scan_ledger_contract.mjs）。
  const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity
    : ((typeof module !== 'undefined' && module.exports) ? require('./ledger-entity.js') : (root.LonShaLedgerEntity || null));
  if (!LE) throw new Error('[lonsha] ledger-entity.js 未加载：账本实体契约缺真源（查 manifest.extra_js 加载顺序）');
  const ACTIONS = Object.freeze(['seal', 'advance', 'reveal', 'drop']);
  const OPEN = Object.freeze({ sealed: true, advancing: true });
  const MAX_ITEMS = 80;
  const MAX_OPEN = 5;
  const MAX_HISTORY = 8;

  // [v3.207] text / finite / names 由账本实体契约提供（原为六本账各自抄一份，逐字相同）。
  const text = LE.text;
  const finite = LE.finite;
  const names = (value) => LE.names(value, 40, 8);
  function percent(value) {
    const n = finite(value);
    if (n == null || n < 0 || n > 100) return null;
    return n;
  }
  function copyEvent(event) {
    return {
      action: ACTIONS.includes(event.action) ? event.action : 'advance',
      eventKey: text(event.eventKey, 120),
      floor: finite(event.floor),
      source: text(event.source, 40),
      note: text(event.note, 120),
      progress: percent(event.progress)
    };
  }
  function copyItem(item) {
    const status = item.status === 'revealed' || item.status === 'dropped' ? item.status
      : (item.status === 'advancing' ? 'advancing' : 'sealed');
    const prog = percent(item.progress);
    return {
      id: text(item.id, 80),
      secret: text(item.secret, 180),
      keeper: names(item.keeper),
      about: names(item.about),
      progress: prog == null ? 0 : prog,
      status,
      // [v3.207] 修订号读回走契约（`finite(item.revision) || 1` 原为六本账逐字重复）。
      revision: LE.revisionOf(item),
      floor: finite(item.floor),
      updatedFloor: finite(item.updatedFloor),
      revealedFloor: finite(item.revealedFloor),
      source: text(item.source, 40),
      // [v3.207] 历史读回走契约（末 MAX_HISTORY 条 + 逐条 copyEvent）。
      history: LE.copyHistory(item, MAX_HISTORY, copyEvent)
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
      if (!item.id || !item.secret || !item.keeper.length || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(-MAX_ITEMS);
    return state;
  }
  function nextId(state) {
    state.seq += 1;
    return 'sec_' + state.seq;
  }
  function result(state, extra) {
    return Object.assign({ ok: true, state: normalize(state) }, extra);
  }
  function reject(state, reason) {
    return { ok: false, reason, changed: false, state: normalize(state) };
  }
  // [v3.207] 记一次变更走契约：幂等比对 + push + 截断 + 版本自增 + 戳 updatedFloor。
  //   stampFloor 原样戳 event.floor（**不得**过 finite：null 会被压成 0）。
  function record(item, event) {
    return LE.recordEvent(item, event, { maxHistory: MAX_HISTORY, stampFloor: true });
  }
  function openCount(state) {
    return state.items.filter((item) => OPEN[item.status]).length;
  }
  function find(state, ref) {
    const id = text(ref && ref.id, 80);
    if (id) return state.items.find((item) => item.id === id) || null;
    const secret = text(ref && ref.secret, 180).toLowerCase();
    if (!secret) return null;
    return state.items.find((item) => OPEN[item.status] && item.secret.toLowerCase() === secret) || null;
  }
  function keeperPresent(keeper, present) {
    const here = new Set(names(present).map((name) => name.toLowerCase()));
    if (!here.size) return '';
    return keeper.find((name) => here.has(name.toLowerCase())) || '';
  }

  function seal(rawState, input) {
    const state = normalize(rawState);
    const secret = text(input && input.secret, 180);
    const keeper = names(input && input.keeper);
    if (!secret) return reject(state, 'missing-secret');
    if (!keeper.length) return reject(state, 'missing-keeper');
    const given = input && input.progress != null && input.progress !== '';
    const progress = percent(input && input.progress);
    if (given && progress == null) return reject(state, 'bad-progress');
    if (progress === 100) return reject(state, 'reveal-required');
    const eventKey = text(input && input.eventKey, 120);
    const existing = state.items.find((item) => OPEN[item.status] && item.secret.toLowerCase() === secret.toLowerCase());
    if (existing) {
      const replayed = !eventKey || existing.history.some((event) => event.eventKey === eventKey);
      if (eventKey && !replayed) record(existing, { action: 'seal', eventKey, floor: finite(input && input.floor), source: text(input && input.source, 40), note: '', progress: existing.progress });
      return result(state, { item: copyItem(existing), replayed, changed: !replayed });
    }
    if (openCount(state) >= MAX_OPEN) return reject(state, 'open-cap');
    const item = copyItem({
      id: nextId(state), secret, keeper, about: input && input.about,
      progress: progress == null ? 0 : progress, status: 'sealed', revision: LE.REVISION.CREATE,
      floor: input && input.floor, updatedFloor: input && input.floor,
      revealedFloor: null, source: input && input.source, history: []
    });
    record(item, { action: 'seal', eventKey, floor: item.floor, source: item.source, note: '', progress: item.progress });
    state.items.push(item);
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function advance(rawState, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const progress = percent(input && input.progress);
    if (progress == null) return reject(state, 'bad-progress');
    if (progress >= 100) return reject(state, 'reveal-required');
    if (progress < item.progress) return reject(state, 'progress-back');
    if (keeperPresent(item.keeper, input && input.present) && progress > item.progress) return reject(state, 'keeper-present');
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    const event = {
      action: 'advance', eventKey: text(input && input.eventKey, 120), floor: finite(input && input.floor),
      source: text(input && input.source, 40), note: noteText, progress
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    item.progress = progress;
    item.status = 'advancing';
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function reveal(rawState, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    if (keeperPresent(item.keeper, input && input.present)) return reject(state, 'keeper-present');
    const event = {
      action: 'reveal', eventKey: text(input && input.eventKey, 120), floor: finite(input && input.floor),
      source: text(input && input.source, 40), note: noteText, progress: 100
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    item.progress = 100;
    item.status = 'revealed';
    item.revealedFloor = event.floor;
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }

  function drop(rawState, input) {
    const state = normalize(rawState);
    const item = find(state, input);
    if (!item) return reject(state, 'not-found');
    if (!OPEN[item.status]) return result(state, { item: copyItem(item), replayed: true, changed: false, reason: 'terminal' });
    const noteText = text(input && input.note, 120);
    if (!noteText) return reject(state, 'empty-note');
    const event = {
      action: 'drop', eventKey: text(input && input.eventKey, 120), floor: finite(input && input.floor),
      source: text(input && input.source, 40), note: noteText, progress: item.progress
    };
    if (!record(item, event)) return result(state, { item: copyItem(item), replayed: true, changed: false });
    item.status = 'dropped';
    item.revealedFloor = event.floor;
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
      if (item.revealedFloor == null) return true;
      return item.revealedFloor >= f;
    });
    return result(state, { swept: before - state.items.length, changed: state.items.length !== before });
  }

  function list(rawState, filter) {
    const state = normalize(rawState);
    const status = text(filter && filter.status, 20);
    return state.items.filter((item) => {
      if (status === 'unrevealed') return !!OPEN[item.status];
      if (status && item.status !== status) return false;
      return true;
    }).map(copyItem);
  }

  function render(rawState, limit) {
    const items = list(rawState, { status: 'unrevealed' }).slice(-(finite(limit) || MAX_OPEN));
    if (!items.length) return '';
    return '【尚未揭露的秘密】\n' + items.map((item) => {
      return '- ' + item.id + '〔' + item.keeper.join('、') + '不知 · ' + item.progress + '%〕' + item.secret;
    }).join('\n');
  }

  const api = Object.freeze({
    MAX_OPEN,
    normalize, seal, advance, reveal, drop, remove, sweep, list, render
  });
  root.LonShaSecretLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
