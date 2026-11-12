/* ============================================================
 * tests/audit/_loading_surface_judge.mjs
 * —— L21-O3「不依赖真机的装载面五段替代证据链」的**判定体**（唯一真源）
 * ------------------------------------------------------------
 * 【为什么存在（本项立项依据，实测读数）】
 *   `realhost_readings.json` 长期只有一句 `environment-unavailable`，
 *   三个真机套件 bail 之后，**装载面就没人管了** —— 而 v3.461.0 修的
 *   「36 个 R18 内核从 ESM 转回 UMD」正是**只有真装载才暴露**的失效形态：
 *   那批文件在宿主 extra_js 里整文件语法错误、从未挂载成功，而仓里所有
 *   静态扫描器（含当时的 module_consumption）都说它们「在役」。
 *   ⇒ 结论：**没有真机时，装载面必须有别的读数**，否则同一类缺陷会再发生一次。
 *
 * 【本证明是什么 / 不是什么（诚实边界，写进读数，也写进判据）】
 *   · 它证明：manifest 逐项 → 磁盘在 → 能编译 → 形态合法 → 全局名真挂上 → 台账有消费。
 *   · 它**不能**替代真机：真机还覆盖「宿主是否真加载 extra_js」「init 是否真跑完」
 *     「storage.save 真落盘」这些只有真页面才能回答的事。
 *     故本证明的每一份读数都带 `equivRealhost: false` 与 `boundary` 原文；
 *     判据里有一条专门钉死「必须这么说」，不许把替代证据吹成真机结论。
 *
 * 【为什么判据与量具分开】
 *   `tests/audit/loading_surface_proof.mjs` 是可执行探针（读真仓、落 JSON）；
 *   本文件是纯函数集（只接受 world 抽象：manifest / exists / readFile / ledger）。
 *   这样五段每段的负控制都能在**合成或破坏副本**上离线证伪 ——
 *   否则「这一段判得对不对」就只能靠真机验证，等于不可证伪的死文本。
 *   （与 `_realhost_judge.mjs` 同一条纪律，先例明确。）
 *
 * 【五段（每段独立可红，不合成一个布尔）】
 *   S1 disk        manifest.extra_js 逐项：唯一、`.js` 后缀、磁盘存在、非空
 *   S2 syntax      逐文件可编译（`vm.Script` 编译期，不执行）
 *   S3 umd-tail    形态合法：IIFE/UMD 包装在位 + 至少一条导出通道（CJS 或宿主挂载）
 *   S4 global-eval 按 manifest 顺序在**同一上下文累积装载**，声明过的全局名必须真挂上
 *   S5 ledger      台账里恰有一条，且不是「零消费」也未标 `declared_dormant` 假象
 * ============================================================ */
import vm from 'node:vm';

/** 段名（顺序即读数顺序；判据按此枚举，不许各写一套）。 */
export const SEGMENTS = ['disk', 'syntax', 'umd-tail', 'global-eval', 'ledger'];

/** 每段「答的是什么问题」—— 汇报与读数共用，防两处措辞分叉。 */
export const SEGMENT_QUESTION = {
  disk: '清单里的每个模块，磁盘上真有一份非空文件吗？',
  syntax: '每个模块能被 JS 引擎编译通过吗（v3.461.0 那类整文件语法错误）？',
  'umd-tail': '每个模块的尾部形态合法吗（有包装、有导出/挂载通道）？',
  'global-eval': '按 manifest 顺序累积装载后，模块声明过的全局名真的挂上了吗？',
  ledger: '台账里对每个模块都有一条真实消费记录吗（不是零消费、不是分类假象）？',
};

/** 诚实边界原文（读数与判据共引，不许各写一份）。 */
export const BOUNDARY = '本证明只覆盖「模块能否被装进一个最小上下文」，'
  + '不等价于真机：宿主是否真加载 extra_js、init 是否真跑完、storage.save 是否真落盘，'
  + '仍只能由真机（tests/audit/_realhost_suite.mjs）回答。';

/* ── 宿主对象「真挂载」识别式：与 tests/_consumption_lib.mjs 的 HOST_MOUNT_RE 同源口径 ──
 *   这里**刻意再写一份**而不是 import 那个共享库：消费台账的口径与本证明的口径
 *   回答的是两个不同问题（「有没有人用」vs「挂没挂上」），共用一份会让两处
 *   同时被同一次 bug 打穿（本仓 v3.46x 刚治过「同一事实两套口径」，反过来
 *   「两个事实被迫一套口径」同样错）。一致性由判据 D 段逐条对拍保证。 */
const MOUNT_RE = /(?<![\w$.])(?:window|global|globalThis)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?![=>])/g;
const CJS_EXPORT_RE = /(?:^|[^\w$.])module\.exports\s*=|(?:^|[^\w$.])exports\.[A-Za-z_$][\w$]*\s*=|\breturn\s+api\b/m;
/* 第三种出口形态：**方法挂载**（把函数挂到已存在的宿主对象上）。
 *   实测现场：`settings-ui.js:2959 plugin.showSettingsPanel = function() {` ——
 *   它没有 module.exports，也不挂 window 全局名，而是往 `window.LonShaMemory` 这个
 *   **已存在的插件对象**上装方法。这在真宿主里是完整可用的出口
 *   （`_realhost_judge.judgeLoad` 判的正是 `hasUI = showSettingsPanel 可用`）。
 *   若不认这一种，本段会把一个**工作正常**的面板模块判成「装上了也取不到」——
 *   而它恰恰是产品唯一的面板入口。这是本段首轮实勘抓到的唯一一条，如实记在此。 */
const METHOD_MOUNT_RE = /(?:^|[^\w$.])[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.[A-Za-z_$][\w$]*\s*=\s*(?:function\b|\(?\s*[A-Za-z_$][\w$]*\s*\)?\s*=>)/m;
const IIFE_HEAD_RE = /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|'use strict';|"use strict";|\s)*\(?\s*(?:function\b|\(\s*(?:function\b|\(?[^)\n]{0,80}\)?\s*=>))/;
const ESM_LEAK_RE = /^\s*(?:import|export)\s/m;

/** 从源码抽「它声明要挂上去的全局名」（排除 `__` 内部哨兵）。 */
export function declaredGlobals(src) {
  const out = new Set();
  for (const m of String(src || '').matchAll(MOUNT_RE)) {
    const name = m[1];
    if (name.startsWith('__')) continue;
    if (name === 'undefined' || name === 'NaN') continue;
    out.add(name);
  }
  return Array.from(out);
}

/** 最小 DOM / 宿主 shim（累积装载需要它；只在本证明内部用）。 */
function hostShim() {
  const mk = () => ({
    readyState: 'complete', style: {}, dataset: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    children: [], childNodes: [], parentNode: null,
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, hasAttribute: () => false,
    appendChild(c) { this.children.push(c); return c; }, removeChild: (c) => c,
    insertBefore(c) { this.children.push(c); return c; }, replaceChild: (c) => c,
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true,
    querySelector: () => null, querySelectorAll: () => [], getElementsByClassName: () => [],
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    focus() {}, blur() {}, click() {}, remove() {}, cloneNode: mk,
    innerHTML: '', textContent: '', value: '', checked: false, hidden: false, tagName: 'DIV',
  });
  const doc = {
    readyState: 'complete', documentElement: mk(), head: mk(), body: mk(),
    createElement: mk, createTextNode: mk, createDocumentFragment: mk,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    getElementsByTagName: () => [], getElementsByClassName: () => [],
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true, cookie: '',
  };
  const win = {};
  const store = new Map();
  const sb = {
    window: win, globalThis: win, self: win, top: win, parent: win, document: doc,
    navigator: { userAgent: 'lonsha-loading-surface-proof', language: 'zh-CN', languages: ['zh-CN'], platform: 'linux', clipboard: { writeText: async () => {} } },
    location: { href: 'http://127.0.0.1/', protocol: 'http:', host: '127.0.0.1', search: '', hash: '', pathname: '/' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear(), key: (i) => Array.from(store.keys())[i] ?? null, get length() { return store.size; } },
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {}, trace() {}, group() {}, groupEnd() {}, table() {} },
    /* 定时器**只跑一次即刻返回**：本证明要的是「模块顶层能完成挂载」，不是跑活它。 */
    setTimeout: (fn) => { try { if (typeof fn === 'function') fn(); } catch { /* 顶层回调失败不算装载失败 */ } return 0; },
    clearTimeout() {}, setInterval: () => 0, clearInterval() {}, setImmediate: () => 0,
    requestAnimationFrame: (fn) => { try { if (typeof fn === 'function') fn(0); } catch { /* 同 setTimeout */ } return 0; },
    cancelAnimationFrame() {}, queueMicrotask() {},
    alert() {}, confirm: () => true, prompt: () => null,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }),
    URL: { createObjectURL: () => 'blob:proof', revokeObjectURL() {} },
    MutationObserver: class { observe() {} disconnect() {} takeRecords() { return []; } },
    IntersectionObserver: class { observe() {} disconnect() {} unobserve() {} },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    HTMLElement: class {}, Node: class {}, NodeList: class {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
  };
  sb.global = win;
  vm.createContext(sb);
  return { win, sb };
}

/* ═══════════ S1 disk ═══════════ */
/** @param {object} world {manifest, exists, readFile} @returns {{ok:boolean, defects:string[], checked:number}} */
export function judgeDisk(world) {
  const defects = [];
  const list = (world && world.manifest && Array.isArray(world.manifest.extra_js)) ? world.manifest.extra_js : null;
  if (list === null) return { ok: false, defects: ['manifest.extra_js 缺失或不是数组（装载面无从成立）'], checked: 0 };
  if (list.length === 0) return { ok: false, defects: ['manifest.extra_js 为空'], checked: 0 };
  const seen = new Set();
  for (const f of list) {
    if (typeof f !== 'string' || !f.trim()) { defects.push('清单里有非字符串/空条目：' + JSON.stringify(f)); continue; }
    if (seen.has(f)) defects.push('清单重复项（同一模块登记两次 ⇒ 装载两次 ⇒ 后挂的覆盖前挂的）：' + f);
    seen.add(f);
    if (!/\.js$/.test(f)) defects.push('清单条目不是 .js：' + f);
    if (!world.exists(f)) { defects.push('磁盘上不存在：' + f); continue; }
    const src = world.readFile(f);
    if (typeof src !== 'string' || src.length === 0) defects.push('磁盘上是空文件（空文件「加载成功」＝最坏的假绿）：' + f);
  }
  return { ok: defects.length === 0, defects, checked: list.length };
}

/* ═══════════ S2 syntax ═══════════ */
export function judgeSyntax(world) {
  const defects = [];
  const list = (world.manifest && world.manifest.extra_js) || [];
  for (const f of list) {
    const src = world.exists(f) ? world.readFile(f) : null;
    if (typeof src !== 'string') { defects.push('读不到源码（无从判语法）：' + f); continue; }
    try { new vm.Script(src, { filename: f }); } catch (e) {
      defects.push(f + ' :: ' + String((e && e.message) || e).split('\n')[0].slice(0, 160));
    }
  }
  return { ok: defects.length === 0, defects, checked: list.length };
}

/* ═══════════ S3 umd-tail ═══════════ */
/**
 * 形态合法 = ①有 IIFE/UMD 包装（不是裸顶层脚本）②至少一条导出通道。
 * ② 之所以必须有：没有出口的模块**装上了也永远拿不到**，
 * 这正是「文件在 manifest 里、扫描器说在役、产品里其实取不到」的形态。
 */
export function judgeUmdTail(world) {
  const defects = [];
  const list = (world.manifest && world.manifest.extra_js) || [];
  for (const f of list) {
    const src = world.exists(f) ? world.readFile(f) : null;
    if (typeof src !== 'string') continue;   // 读不到由 S1/S2 报，这里不重复记
    if (ESM_LEAK_RE.test(src)) {
      defects.push(f + ' :: 顶层残留 ESM import/export（宿主 extra_js 是经典脚本，整文件会语法错误）：'
        + (ESM_LEAK_RE.exec(src) || [''])[0].trim());
    }
    if (!IIFE_HEAD_RE.test(src)) defects.push(f + ' :: 缺 IIFE/UMD 包装（顶层裸脚本会污染宿主全局）');
    const hasCjs = CJS_EXPORT_RE.test(src);
    const hasMount = declaredGlobals(src).length > 0;
    const hasMethod = METHOD_MOUNT_RE.test(src);
    /* 三种合法出口：CJS 导出 / 宿主全局挂载 / 往已存在对象上装方法。
     * 只有**三种都没有**才是非法 —— 那才是「装上了也永远取不到」。 */
    if (!hasCjs && !hasMount && !hasMethod) {
        defects.push(f + ' :: 没有任何导出通道（既无 module.exports/exports.x、无宿主挂载、也无方法挂载）⇒ 装上了也取不到');
    }
  }
  return { ok: defects.length === 0, defects, checked: list.length };
}

/* ═══════════ S4 global-eval ═══════════ */
/**
 * 按 manifest 顺序**在同一上下文累积装载**，断言「声明过的全局名都挂上了」。
 *
 * 为什么必须累积：`ledger-entity.js` 是 9 个账本模块的**前置契约**，
 * 单独装载它们会因 `未加载：账本实体契约缺真源` 而抛错 —— 那是**正确的 fail-closed**，
 * 不是缺陷。首轮实勘就踩了这个坑（10 个模块误报），故本段按序累积。
 */
export function judgeGlobalEval(world) {
  const defects = [];
  const list = (world.manifest && world.manifest.extra_js) || [];
  const { win, sb } = hostShim();
  let evaluated = 0;
  let mountedTotal = 0;
  for (const f of list) {
    const src = world.exists(f) ? world.readFile(f) : null;
    if (typeof src !== 'string') continue;
    const declared = declaredGlobals(src);
    try {
      new vm.Script(src, { filename: f }).runInContext(sb, { timeout: 20000 });
      evaluated += 1;
    } catch (e) {
      defects.push(f + ' :: 求值抛错 ' + String((e && e.message) || e).split('\n')[0].slice(0, 160));
      continue;
    }
    if (declared.length === 0) continue;   // 纯 CJS 导出型，由 S3/S5 覆盖
    const missing = declared.filter((n) => !(n in win));
    if (missing.length) defects.push(f + ' :: 声明了却没挂上 ' + JSON.stringify(missing));
  }
  mountedTotal = Object.keys(win).filter((k) => !k.startsWith('__')).length;
  return { ok: defects.length === 0, defects, checked: list.length, evaluated, mountedTotal };
}

/* ═══════════ S5 ledger ═══════════ */
/**
 * 台账里每个模块恰有一条，且**不是**「零消费」/「只有装载面引用」/「declared_dormant」。
 *
 * 为什么把 dormant 也算红：`declared_dormant` 的语义是「保留文件与注册表条目，
 * **但不计入业务能力**」。它在这条证明里能过，就等于把「休眠」记成「装载面成立」，
 * 那会把 L21-O1 的定性成果又抹平。故本段**显式排除** dormant，
 * 并在读数里单列 `dormantExcluded` 计数（不许静默吞掉）。
 */
export function judgeLedger(world) {
  const defects = [];
  const list = (world.manifest && world.manifest.extra_js) || [];
  const ledgerObj = (world.ledger && world.ledger.modules) || world.ledger || null;
  if (!ledgerObj || typeof ledgerObj !== 'object') {
    return { ok: false, defects: ['台账缺失或形状不合法（无从对账）'], checked: 0, dormantExcluded: 0 };
  }
  const dormant = new Set(Array.isArray(world.dormant) ? world.dormant : []);
  let dormantExcluded = 0;
  for (const f of list) {
    const row = ledgerObj[f];
    if (!row) { defects.push('台账里没有这一条（审计盲区）：' + f); continue; }
    if (row.why === 'declared_dormant' || dormant.has(f)) { dormantExcluded += 1; continue; }
    const prod = Number(row.prod_call_sites);
    const biz = Number(row.business_call_sites);
    if (!Number.isFinite(prod)) { defects.push('台账读数缺 prod_call_sites：' + f); continue; }
    if (prod <= 0) { defects.push('台账记为零消费（prod_call_sites ≤ 0）：' + f); continue; }
    if (row.why === 'load_surface_only' || row.load_surface_only === true) {
      defects.push('台账记的引用只来自装载面（被取到 ≠ 被使用）：' + f);
      continue;
    }
    if (Number.isFinite(biz) && biz <= 0 && prod > 0) {
      defects.push('业务消费为零、只有非业务引用：' + f);
    }
  }
  return { ok: defects.length === 0, defects, checked: list.length, dormantExcluded };
}

/* ═══════════ 汇总 ═══════════ */
/** 每段「回答的问题 + 读数」——单一形状，探针落盘与判据读盘共用。 */
export function judgeProof(world) {
  const run = {
    disk: () => judgeDisk(world),
    syntax: () => judgeSyntax(world),
    'umd-tail': () => judgeUmdTail(world),
    'global-eval': () => judgeGlobalEval(world),
    ledger: () => judgeLedger(world),
  };
  const segments = {};
  const failed = [];
  for (const name of SEGMENTS) {
    let r;
    try { r = run[name](); } catch (e) {
      r = { ok: false, defects: ['段自身抛错（段失效，不得当通过）：' + String((e && e.message) || e)], checked: 0 };
    }
    segments[name] = {
      question: SEGMENT_QUESTION[name],
      ok: r.ok === true,
      checked: r.checked ?? null,
      defects: r.defects || [],
      ...(r.evaluated !== undefined ? { evaluated: r.evaluated } : {}),
      ...(r.mountedTotal !== undefined ? { mountedTotal: r.mountedTotal } : {}),
      ...(r.dormantExcluded !== undefined ? { dormantExcluded: r.dormantExcluded } : {}),
    };
    if (!segments[name].ok) failed.push(name);
  }
  return {
    schema: 'loading-surface-proof@1',
    segments,
    failedSegments: failed,
    ok: failed.length === 0,
    boundary: BOUNDARY,
    /* 诚实边界：任何读者第一眼就该看到「这不是真机」。 */
    equivRealhost: false,
  };
}
