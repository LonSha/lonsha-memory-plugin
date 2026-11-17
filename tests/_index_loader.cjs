/* ============================================================
 * tests/_index_loader.cjs — index.js 的最小宿主（L22-O1）
 * ------------------------------------------------------------
 * 为什么需要它：
 *   index.js 是**单个 IIFE**，结尾没有 module.exports，全靠往 window 上挂
 *   `LonShaXxx` 符号；而它开头就摸 `window`（CCv3/ConfigManager 还要 localStorage）。
 *   于是「入口能不能装起来」「导出面有没有变」这两件事，此前**一条判据都没有**
 *   （docs/planning/2026-11-17-index-split-plan.md §五 已把它列为本项最大风险）。
 *   本文件就是把这两件事变成可读数的工具，只做「够装」的宿主，不模拟业务。
 *
 * 口径（诚实写明）：
 *   · 这不是浏览器，也不是 SillyTavern 本机：它只提供 index.js 装载期真正摸到的
 *     最小面（window / localStorage / document 的一点点），业务行为一律不假装。
 *   · 装载后**主动 process.exit**：插件注册了定时器与事件监听，node 否则不会退出
 *     （实测会一直挂到超时）。退出码 0 表示「装载没抛」。
 *   · 导出面 = 装载前后 window/globalThis 上**新增**的键的分类快照（名字 + 类型），
 *     用它判「拆分不许改变对外面」。
 * ============================================================ */
'use strict';

function makeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  };
}

function makeHost() {
  const storage = makeStorage();
  const noop = () => {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, setAttribute: noop, removeAttribute: noop,
    addEventListener: noop, removeEventListener: noop, querySelector: () => null,
    querySelectorAll: () => [], closest: () => null, textContent: '', innerHTML: '',
  });
  const documentStub = {
    readyState: 'complete',
    localStorage: storage,
    createElement: el,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    body: el(),
    head: el(),
  };
  globalThis.window = globalThis;
  globalThis.document = documentStub;
  globalThis.localStorage = storage;
  /* navigator 在 node 里是只读 getter，删不掉也赋不了值：不碰它，需求方自己兜底。 */
  /* 宿主侧常见全局：装载期若被直接调用，返回空对象而不是抛 —— 但**不记录成功**，
   *   装载判据只看「有没有抛」，不看这些桩被调了几次。 */
  globalThis.jQuery = globalThis.$ = function () { return { on: noop, off: noop, val: () => '', text: () => '', html: () => '', length: 0 }; };
  globalThis.toastr = { success: noop, error: noop, warning: noop, info: noop };
  globalThis.SillyTavern = globalThis.SillyTavern || {};
  return { storage };
}

/** 装载 index.js，返回导出面快照（新增键 → 类型）。任何抛错都如实返回。 */
function loadIndex() {
  makeHost();
  const before = new Set(Object.getOwnPropertyNames(globalThis));
  let error = null;
  try {
    require('../index.js');
  } catch (e) {
    error = String((e && e.message) || e);
  }
  const added = Object.getOwnPropertyNames(globalThis).filter((k) => !before.has(k) && k !== '__loaderError');
  const classify = (k) => {
    let v;
    try { v = globalThis[k]; } catch (_e) { return 'unreadable'; }
    if (v === null) return 'null';
    if (typeof v === 'function') return 'function';
    if (typeof v === 'object') return Array.isArray(v) ? 'array' : 'object';
    return typeof v;
  };
  const surface = {};
  for (const k of added.sort()) surface[k] = classify(k);
  return { ok: error === null, error, surface, count: added.length };
}

module.exports = { loadIndex, makeHost };

if (require.main === module) {
  const r = loadIndex();
  const payload = { ok: r.ok, error: r.error, count: r.count, surface: r.surface };
  /* 验收工具要机读，但 index.js 装载期会往 stdout 打日志（「初始化...」），
   *   所以给了路径就**只写文件**，不再往 stdout 混 JSON。 */
  const out = process.argv[2];
  if (out) {
    require('node:fs').writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log('[index-loader] ok=' + r.ok + ' surface=' + r.count + (r.error ? ' error=' + r.error : '') + ' → ' + out);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
  /* 装载后主动退出：插件注册了定时器/监听，node 不会自己退出。 */
  process.exit(r.ok ? 0 : 1);
}