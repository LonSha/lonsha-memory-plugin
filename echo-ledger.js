/* ========================================================
 * echo-ledger.js — 回声账本（角色生活微场景） [v3.197.0]
 * --------------------------------------------------------
 * 机制来自「ta的物品组件」提示词条（只搬机制不搬散文）：
 *   11 种微场景模式（提问箱/口袋小物/冰箱留言/快递包裹/未发草稿/
 *   乱科普/迷情剪辑/谣言小报/名场面回放/今日误会/垃圾桶残留），
 *   每回合随机挑一种给角色生成一条「生活的余温」。
 *
 * 账本化约定：
 *   · 模式登记：一种模式一条记录，内容是最近一次产出（只保留最新，
 *     不堆历史——历史交给正文与楼导），字段齐全才收（missing-field）。
 *   · 防重复：连续产出同模式拒绝（repeat-mode）；同一回合产出两条拒绝
 *     （echo-per-floor）。
 *   · 产量帽：MAX_MODES 条封顶（满了拒绝，不静默挤掉旧的）。
 *   · 归属：必填 char（哪个角色的回声）；清空全部用 reset。
 *   · 不推断正文，只接收已确认的产出。
 * 挂 window.LonShaEchoLedger。
 * ======================================================== */
'use strict';
(function (root) {
  const MODES = Object.freeze(['askbox', 'pocket', 'fridge', 'parcel', 'draft', 'science', 'clip', 'tabloid', 'scene', 'misunderstand', 'trash']);
  const MODE_TAGS = Object.freeze({
    askbox: '提问箱', pocket: '口袋小物', fridge: '冰箱留言', parcel: '快递包裹',
    draft: '未发草稿', science: '乱科普', clip: '迷情剪辑', tabloid: '谣言小报',
    scene: '名场面回放', misunderstand: '今日误会', trash: '垃圾桶残留'
  });
  const MAX_ITEMS = MODES.length; // 11
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
      mode: MODES.includes(item.mode) ? item.mode : 'askbox',
      char: text(item.char, 40),
      floor: finite(item.floor),
      fields: (item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields))
        ? Object.fromEntries(Object.entries(item.fields).slice(0, 6).map(([k, v]) => [text(k, 20), text(v, 300)]))
        : {},
      os: text(item.os, 160)
    };
  }
  function clone(state) {
    return {
      version: 1,
      lastFloor: finite(state && state.lastFloor),
      lastMode: MODES.includes(state && state.lastMode) ? state.lastMode : null,
      items: Array.isArray(state && state.items) ? state.items.map(copyItem) : []
    };
  }
  function normalize(raw) {
    const state = clone(raw);
    const seen = new Set();
    state.items = state.items.filter((item) => {
      if (seen.has(item.char + '|' + item.mode)) return false;
      seen.add(item.char + '|' + item.mode);
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
  /** 产出一条回声：连续同模式拒绝，同回合拒绝，字段必须齐全 */
  function produce(rawState, input) {
    const state = normalize(rawState);
    const mode = MODES.includes(input && input.mode) ? input.mode : null;
    if (!mode) return reject(state, 'bad-mode');
    const char = text(input && input.char, 40);
    if (!char) return reject(state, 'missing-char');
    const floor = finite(input && input.floor);
    if (floor == null) return reject(state, 'missing-floor');
    const fields = copyItem({ fields: input && input.fields }).fields;
    const fieldKeys = Object.keys(fields);
    if (!fieldKeys.length) return reject(state, 'missing-field');
    const os = text(input && input.os, 160);
    if (!os) return reject(state, 'missing-os');
    if (state.lastFloor === floor) return reject(state, 'echo-per-floor');
    if (state.lastMode === mode && state.lastFloor != null && floor === state.lastFloor + 1) return reject(state, 'repeat-mode');
    const item = copyItem({ mode, char, floor, fields, os });
    const idx = state.items.findIndex((it) => it.char === char && it.mode === mode);
    if (idx >= 0) state.items.splice(idx, 1);
    state.items.push(item);
    state.lastFloor = floor;
    state.lastMode = mode;
    return result(state, { item: copyItem(item), replayed: false, changed: true });
  }
  function list(rawState, filter) {
    const state = normalize(rawState);
    const char = text(filter && filter.char, 40);
    const mode = MODES.includes(filter && filter.mode) ? filter.mode : null;
    return state.items.filter((item) => {
      if (char && item.char !== char) return false;
      if (mode && item.mode !== mode) return false;
      return true;
    });
  }
  function summarize(rawState) {
    const state = normalize(rawState);
    const counts = {};
    for (const m of MODES) counts[m] = 0;
    for (const item of state.items) counts[item.mode] += 1;
    counts._chars = new Set(state.items.map((item) => item.char)).size;
    return counts;
  }
  /** 清空：换会话/重开 story 时用 */
  function reset(rawState) {
    return { ok: true, changed: normalize(rawState).items.length > 0, state: { version: 1, seq: 0, lastFloor: null, lastMode: null, items: [] } };
  }
  /** 注入面：按角色给出最近回声，标注「仅氛围补全，不得改写为既定事实」 */
  function render(rawState, char, limit) {
    const items = list(rawState, { char }).slice(-1 * (finite(limit) || 3));
    if (!items.length) return '';
    return '【' + text(char, 40) + '的生活回声（最近）】\n' + items.map((item) => {
      const tag = MODE_TAGS[item.mode] || item.mode;
      const fieldLines = Object.entries(item.fields).map(([k, v]) => k + '：' + v).join('；');
      return '- 〔' + tag + '〕' + fieldLines + '\n  OS：' + item.os;
    }).join('\n') + '\n（仅作氛围补全与角色温度，不得改写为剧情既定事实）';
  }
  const api = Object.freeze({
    MODES, MODE_TAGS,
    normalize, produce, list, summarize, reset, render
  });
  root.LonShaEchoLedger = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);