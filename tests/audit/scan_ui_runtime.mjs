/* ============================================================
 * tests/audit/scan_ui_runtime.mjs —— UI 入口**运行时**冒烟门（零依赖）
 * ------------------------------------------------------------
 * 为什么存在（v3.271.0 实测，不是整洁性偏好）：
 *
 *   本仓已有 scan_ui_binding.mjs（A1–A6）做「静态绑定卫生」——重复控件、
 *   重复 id、幽灵控件、类型一致、保存路径目标存在、结构健康标记。它从不
 *   **执行**任何 UI 入口。于是出现了这个组合：
 *     · 250 个测试文件全绿；
 *     · scan_ui_binding / scan_syntax / scan_open_faces / scan_inbound_faces /
 *       scan_cross_repo_binding 五个审计脚本 rc=0；
 *     · 而用户在真实宿主里点「设置」——**一个字都渲染不出来**。
 *
 *   真因（v3.271.0 一次性实测出五处，全部只在运行时暴露）：
 *     D1 showSettingsPanel 函数体内未定义 esc → 一进 HTML 构造即 ReferenceError；
 *     D2 showStatsPanel 内 4 段判定块引用 viewType（那是 showBrowser 的形参）→ 恒抛；
 *     D3 ${ck(...)} 被双反斜杠转义 → 渲染成字面代码而非复选框；
 *     D5 style 属性模板值缺右双引号 → 属性吞并后续 HTML → #ls-clear 不存在 →
 *        同一函数后段的 querySelector('#ls-clear').addEventListener 炸在 **null** 上。
 *     （修前：调用设置面板入口抛 TypeError: Cannot read properties of null；
 *       修后：8 个入口 0 异常。）
 *
 *   这五处的共同点是**静态读不出来**：D1/D2 是作用域错位（词法上合法），
 *   D5 是 HTML 解析层的属性吞并（字符串本身合法，被浏览器解析后才出错）。
 *   唯一能拦住的形态，就是「真加载、真调用、看它抛不抛」。
 *
 * 判定策略（每条都必须有非零下限，否则抽到 0 会以全绿通过）：
 *   U1 入口实调：settings-ui.js 暴露的每个 show* 入口调用后不得抛。
 *   U2 DOM 真落：showSettingsPanel 必须真的把面板挂进文档（不是「没抛就算过」）。
 *   U3 关键控件在册：#ls-save / #ls-clear / #ls-export / #ls-import 必须真在
 *      渲染结果里能找到 —— 防「属性吞并」「被 innerHTML 截断」这类静默丢控件。
 *   U4 属性吞并探测：渲染结果里不得出现把标签当属性值的形态
 *      （如 class="ls-btn=" / 属性值里出现 '<'）。
 *   U5 结构健康：入口数、字节数、面板 DOM 元素数均有非零下限。
 *
 * 实现约束（勿凭直觉改动）：
 *   · 本仓**零运行时依赖**（manifest 声明的 extra_js 全为本地文件，宿主不装 npm 包），
 *     审计脚本也不得 require 第三方 —— 故自带一份**最小 DOM shim**，
 *     只实现 settings-ui.js 实测用到的 API 面（createElement / appendChild /
 *     innerHTML 解析 / querySelector(All) / classList / dataset / 事件）。
 *   · innerHTML 解析走**子集**：标签、引号属性、自闭合、纯文本。设置面板只用到这些。
 *     不实现 CSS 选择器引擎的完整语义，只支持 `#id` / `.class` / `tag` /
 *     `[attr]` / `[attr="v"]` / `:checked` / 后代组合 —— 实测 settings-ui.js 的
 *     44 个选择器字面量全部落在这一子集内（无 :is/:not/:has/>/+/~）。
 *   · shim 若与真实浏览器有偏差，本门是**入门的近似**而非等价物；它拦的是
 *     「函数一调用就抛」「控件根本没进 DOM」这两类，不承诺渲染像素正确。
 *
 * 退出码：0=卫生  1=存在真缺陷  2=结构漂移/探测器失效
 * ============================================================ */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ---------- 0. 结构预检（fail-closed） ---------- */
const UI_PATH = path.join(ROOT, 'settings-ui.js');
let ui = '';
try { ui = fs.readFileSync(UI_PATH, 'utf8'); } catch (_e) { ui = ''; }
const MIN_UI_BYTES = 20000;
if (ui.length < MIN_UI_BYTES) {
    console.error('[ui-runtime] 输入退化（settings-ui.js ' + ui.length + ' 字节 < ' + MIN_UI_BYTES + '），审计脚本需同步结构变化');
    process.exit(2);
}

/* ---------- 1. 最小 DOM shim ---------- */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);

class ClassList {
    constructor(el) { this.el = el; }
    _list() { return String(this.el._attrs.class || '').split(/\s+/).filter(Boolean); }
    _set(list) { this.el._attrs.class = list.join(' '); }
    add(...cs) { const l = this._list(); cs.forEach(c => { if (c && !l.includes(c)) l.push(c); }); this._set(l); }
    remove(...cs) { this._set(this._list().filter(x => !cs.includes(x))); }
    contains(c) { return this._list().includes(c); }
    toggle(c, on) { const has = this.contains(c); const want = on === undefined ? !has : !!on; if (want && !has) this.add(c); if (!want && has) this.remove(c); return want; }
    get value() { return this.el._attrs.class || ''; }
}

class El {
    constructor(tag) {
        this.tagName = String(tag || 'div').toLowerCase();
        this._attrs = {};
        this.childNodes = [];
        this.parentNode = null;
        this._listeners = {};
        this._text = '';
        this.classList = new ClassList(this);
        const self = this;
        this.style = new Proxy({}, {
            get: (_t, k) => (k === 'cssText' ? (self._attrs.style || '') : (self._styleProps && self._styleProps[k]) || ''),
            set: (_t, k, v) => { self._styleProps = self._styleProps || {}; self._styleProps[k] = v; if (k === 'cssText') self._attrs.style = String(v); return true; }
        });
        this.dataset = new Proxy({}, {
            get: (_t, k) => { const a = self._attrs['data-' + camelToDash(String(k))]; return a === undefined ? undefined : a; },
            set: (_t, k, v) => { self._attrs['data-' + camelToDash(String(k))] = String(v); return true; }
        });
    }
    get id() { return this._attrs.id || ''; }
    set id(v) { this._attrs.id = String(v); }
    get className() { return this._attrs.class || ''; }
    set className(v) { this._attrs.class = String(v); }
    get value() { return this._attrs.value === undefined ? '' : this._attrs.value; }
    set value(v) { this._attrs.value = String(v); }
    get checked() { return this._attrs.checked === '' || this._attrs.checked === 'checked' || this._attrs.checked === true; }
    set checked(v) { if (v) this._attrs.checked = ''; else delete this._attrs.checked; }
    get disabled() { return this._attrs.disabled !== undefined; }
    set disabled(v) { if (v) this._attrs.disabled = ''; else delete this._attrs.disabled; }
    get hidden() { return this._attrs.hidden !== undefined; }
    set hidden(v) { if (v) this._attrs.hidden = ''; else delete this._attrs.hidden; }
    get type() { return this._attrs.type || ''; }
    set type(v) { this._attrs.type = String(v); }

    setAttribute(k, v) { this._attrs[k] = String(v); }
    getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; }
    removeAttribute(k) { delete this._attrs[k]; }
    hasAttribute(k) { return this._attrs[k] !== undefined; }

    get textContent() {
        if (this._text) return this._text;
        return this.childNodes.map(c => (c instanceof El ? c.textContent : String(c))).join('');
    }
    set textContent(v) { this.childNodes = []; this._text = String(v); }

    get innerHTML() { return this._html !== undefined ? this._html : this.childNodes.map(serialize).join(''); }
    set innerHTML(v) {
        this._html = String(v);
        this.childNodes = parseHTML(String(v), this);
    }

    appendChild(node) {
        if (!node) return node;
        if (node.parentNode) node.parentNode.removeChild(node);
        node.parentNode = this;
        this.childNodes.push(node);
        this._html = undefined;
        return node;
    }
    append(...ns) { ns.forEach(n => this.appendChild(typeof n === 'string' ? new TextNode(n) : n)); }
    removeChild(node) {
        const i = this.childNodes.indexOf(node);
        if (i >= 0) { this.childNodes.splice(i, 1); node.parentNode = null; }
        this._html = undefined;
        return node;
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); this._text = ''; }
    insertAdjacentHTML(_pos, html) { parseHTML(String(html), this).forEach(n => this.appendChild(n)); }

    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    removeEventListener(type, fn) { const l = this._listeners[type]; if (l) this._listeners[type] = l.filter(f => f !== fn); }
    dispatchEvent(ev) {
        const type = ev && ev.type;
        (this._listeners[type] || []).forEach(fn => { try { fn.call(this, ev); } catch (_e) { /* 事件处理器异常不上升 */ } });
        return true;
    }
    click() { this.dispatchEvent({ type: 'click', target: this, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }); }
    focus() {}
    closest(sel) { let n = this; while (n) { if (n instanceof El && matches(n, sel)) return n; n = n.parentNode; } return null; }
    matches(sel) { return matches(this, sel); }
    querySelectorAll(sel) { const out = []; walk(this, n => { if (matches(n, sel)) out.push(n); }); return out; }
    querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }; }
    get children() { return this.childNodes.filter(c => c instanceof El); }
    get firstChild() { return this.childNodes[0] || null; }
    get nextSibling() { if (!this.parentNode) return null; const i = this.parentNode.childNodes.indexOf(this); return this.parentNode.childNodes[i + 1] || null; }
}

class TextNode extends El {
    constructor(t) { super('#text'); this._text = String(t); }
    get textContent() { return this._text; }
    get innerHTML() { return escapeText(this._text); }
}

function camelToDash(s) { return s.replace(/[A-Z]/g, m => '-' + m.toLowerCase()); }
function escapeText(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function serialize(n) {
    if (!(n instanceof El)) return String(n);
    if (n.tagName === '#text') return escapeText(n._text);
    const attrs = Object.entries(n._attrs).map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '"')}"`)).join('');
    const open = `<${n.tagName}${attrs}>`;
    if (VOID_TAGS.has(n.tagName)) return open;
    return open + n.childNodes.map(serialize).join('') + `</${n.tagName}>`;
}
function walk(n, fn) { for (const c of n.childNodes) { if (c instanceof El) { fn(c); if (c.tagName !== '#text') walk(c, fn); } } }

/* --- HTML 子集解析：标签 + 引号属性 + 自闭合 + 文本 --- */
function parseHTML(html, parent) {
    const out = [];
    let i = 0;
    const stack = [];
    const pushTop = (n) => { const host = stack.length ? stack[stack.length - 1] : null; if (host) host.appendChild(n); else out.push(n); };
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { const t = html.slice(i); if (t) pushTop(new TextNode(t)); break; }
        if (lt > i) { const t = html.slice(i, lt); if (t) pushTop(new TextNode(t)); }
        // 注释
        if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e < 0 ? html.length : e + 3; continue; }
        const gt = findTagEnd(html, lt);
        if (gt < 0) { pushTop(new TextNode(html.slice(lt))); break; }
        const raw = html.slice(lt + 1, gt);
        if (raw.startsWith('/')) {
            const name = raw.slice(1).trim().toLowerCase();
            for (let k = stack.length - 1; k >= 0; k--) { if (stack[k].tagName === name) { stack.length = k; break; } }
        } else {
            const mm = raw.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
            if (mm) {
                const el = new El(mm[1]);
                parseAttrs(raw.slice(mm[1].length), el);
                pushTop(el);
                const selfClose = raw.trim().endsWith('/') || VOID_TAGS.has(el.tagName);
                if (!selfClose) stack.push(el);
            }
        }
        i = gt + 1;
    }
    return out;
}
function findTagEnd(html, lt) {
    let q = null;
    for (let i = lt + 1; i < html.length; i++) {
        const ch = html[i];
        if (q) { if (ch === q) q = null; }
        else if (ch === '"' || ch === "'") q = ch;
        else if (ch === '>') return i;
    }
    return -1;
}
function parseAttrs(s, el) {
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(s))) {
        const name = m[1].toLowerCase();
        const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
        if (val === '/' ) continue;
        el._attrs[name] = val;
    }
}

/* --- 选择器子集：逗号分组 + 后代组合 + (tag|#id|.class|[attr]|[attr=v])(:checked)? --- */
function matches(el, selector) {
    if (!(el instanceof El) || el.tagName === '#text') return false;
    return String(selector).split(',').some(one => matchesOne(el, one.trim()));
}
function matchesOne(el, sel) {
    if (!sel) return false;
    const parts = sel.split(/\s+/).filter(Boolean);
    if (!matchSimple(el, parts[parts.length - 1])) return false;
    let node = el.parentNode;
    for (let k = parts.length - 2; k >= 0; k--) {
        let found = false;
        while (node) { if (node instanceof El && matchSimple(node, parts[k])) { found = true; node = node.parentNode; break; } node = node.parentNode; }
        if (!found) return false;
    }
    return true;
}
function matchSimple(el, s) {
    if (!s) return true;
    const m = s.match(/^([a-zA-Z][a-zA-Z0-9-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]*\])*)(:checked)?$/);
    if (!m) return false;
    if (m[1] && el.tagName !== m[1].toLowerCase()) return false;
    if (m[2] && el.id !== m[2].slice(1)) return false;
    if (m[3]) { const cs = m[3].split('.').filter(Boolean); if (!cs.every(c => el.classList.contains(c))) return false; }
    if (m[4]) {
        const attrs = m[4].match(/\[[^\]]*\]/g) || [];
        for (const a of attrs) {
            const inner = a.slice(1, -1);
            const eq = inner.indexOf('=');
            if (eq < 0) { if (!el.hasAttribute(inner.trim())) return false; }
            else {
                const k = inner.slice(0, eq).trim();
                let v = inner.slice(eq + 1).trim();
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
                if (String(el.getAttribute(k)) !== v) return false;
            }
        }
    }
    if (m[5] && !el.checked) return false;
    return true;
}

/* ---------- 2. 造 window/document ---------- */
function makeEnv() {
    const document = new El('#document');
    const head = new El('head');
    const body = new El('body');
    document.appendChild(head); document.appendChild(body);
    document.head = head; document.body = body;
    document.readyState = 'complete';
    document.createElement = (t) => new El(t);
    document.createTextNode = (t) => new TextNode(t);
    document.getElementById = (id) => { let r = null; walk(document, n => { if (!r && n.id === id) r = n; }); return r; };
    document.addEventListener = () => {};
    document.removeEventListener = () => {};
    document.documentElement = document;

    const window = { document, navigator: { userAgent: 'node' }, location: { href: 'https://localhost/' } };
    window.window = window;
    window.setTimeout = (fn) => { try { fn(); } catch (_e) {}
        return 0; };
    window.clearTimeout = () => {};
    window.setInterval = () => 0;
    window.clearInterval = () => {};
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    window.CustomEvent = class CustomEvent { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
    window.getComputedStyle = () => ({ getPropertyValue: () => '' });
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    window.localStorage = (() => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), clear: () => m.clear() }; })();
    window.confirm = () => false;
    window.prompt = () => null;
    window.alert = () => {};
    return { window, document };
}

/* ---------- 3. 引擎 stub（只给形状，不给行为） ---------- */
function makeEngine() {
    const cfg = {
        debugMode: false, budgetStrategy: 'balanced', pyramidTiers: ['日记', '周记', '史记'],
        secondaryApis: {}, extractionPrompt: '', crosslinkStopwords: ''
    };
    const arr = () => [];
    return {
        config: { config: cfg, saveConfig() {} },
        graph: { nodes: new Map(), edges: new Map() },
        summary: { summaries: [], volumes: [], getLockedFacts: () => [], missingFloors: () => [], getActiveSummaries: () => [] },
        vector: { vectors: [] },
        diary: { diaries: {} },
        pov: { povs: [] },
        timeline: { entries: [] },
        suspense: { openItems: () => [] },
        status: { characters: {}, protagonist: {} },
        items: { records: [] },
        opLog: { entries: [] },
        conflicts: { conflicts: [] },
        deltaBook: { deltas: [], confirm: () => 0 },
        pulse: { beats: [] },
        ledger: { floors: {} },
        mutex: { locked: false, queueLength: 0 },
        bm25: { rebuild() {} },
        clock: {}, prequel: { clearPrequel() {}, importPrequel: () => ({ ok: true, chars: 0 }) },
        storage: { _lastWrite: null, save: async () => true, load: async () => null },
        collectExport: () => ({}),
        getCurrentChatId: () => 'audit-chat',
        llm: {},
        selfCheck: async () => ({ errors: [], stats: [], time: 'now', version: '0.0.0' }),
        extractRolesFromLore: async () => [],
        getKnownCharacters: () => [],
        checkpointMenuItems: () => null,
        checkpointRestorePreviewLines: arr,
        checkpointBranchesDiffLines: arr,
        snapshotClearCoverage: () => null,
        listCheckpoints: () => ({ items: null }),
        clearRuntimeMemory: () => ({ ok: true, count: 0, failed: [], skipped: [] }),
        applyPrompts() {}, init() {}, getStats: () => ({})
    };
}

/* ---------- 4. 入口调用 ---------- */
const { window, document } = makeEnv();
window.LonShaMemory = { VERSION: '0.0.0-audit', engine: makeEngine(), config: { config: {} }, reportError() {}, _auditStack: [] };

const sandbox = vm.createContext(window);
let loadError = null;
try {
    vm.runInContext(ui, sandbox, { filename: 'settings-ui.js' });
} catch (e) { loadError = e; }

const DEFECTS = [];
const NOTES = [];

if (loadError) {
    DEFECTS.push('UI 模块加载即抛：' + loadError.message);
}

const plugin = window.LonShaMemory;
const entries = Object.keys(plugin).filter(k => /^show[A-Z]/.test(k) && typeof plugin[k] === 'function').sort();

/* U5 结构健康：入口数非零下限
 *
 * 【归因分档（v3.271.0 实测踩到，必须这么写）】入口数 < 下限有**两种成因**，
 *   处置相反，故不能同码：
 *     · 模块**加载失败**（语法错误 / 顶层抛）⇒ 被检的 UI 源码坏了 = **真缺陷**（exit 1）；
 *     · 模块加载正常却抽不到入口 ⇒ 抽取器/命名约定漂移 = **结构漂移**（exit 2）。
 *   修前版本不看 loadError 就先判入口数，于是「源码被改坏成语法错误」被报成
 *   「探测器失效」（exit 2）—— 读者会去查门禁，而该改的是源码。
 *   实测（v3271 D2 负控制首跑）：一个右引号破坏让入口数掉到 0，门禁报 exit 2。 */
const MIN_ENTRIES = 5;
if (loadError) {
    /* 加载失败已经是真缺陷（上面已入 DEFECTS），此处不再叠加一次结构漂移。 */
} else if (entries.length < MIN_ENTRIES) {
    console.error('[ui-runtime] 结构漂移：只发现 ' + entries.length + ' 个 show* 入口（下限 ' + MIN_ENTRIES + '），探测器失效');
    process.exit(2);
}
NOTES.push('入口 ' + entries.length + ' 个：' + entries.join(' '));

/* U1 入口实调：每个入口调用后不得抛 */
const ARG = { showBrowser: 'summaries' };
const thrown = [];
for (const name of entries) {
    // 每个入口重建干净文档，避免互相污染（真实用户也是一个个点）
    const fresh = makeEnv();
    fresh.window.LonShaMemory = { VERSION: '0.0.0-audit', engine: makeEngine(), config: { config: {} }, reportError() {}, _auditStack: [] };
    const ctx = vm.createContext(fresh.window);
    vm.runInContext(ui, ctx, { filename: 'settings-ui.js' });
    const p = fresh.window.LonShaMemory;
    if (typeof p[name] !== 'function') continue;
    try {
        const r = p[name].call(p, ARG[name]);
        if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) {
        thrown.push(name + ' → ' + e.constructor.name + ': ' + e.message);
    }
}
if (thrown.length) {
    DEFECTS.push('U1 入口实调抛错 ' + thrown.length + ' 个：\n    ' + thrown.join('\n    '));
}

/* U2/U3/U4：只在干净环境里跑一次设置面板 */
{
    const fresh = makeEnv();
    fresh.window.LonShaMemory = { VERSION: '0.0.0-audit', engine: makeEngine(), config: { config: {} }, reportError() {}, _auditStack: [] };
    const ctx = vm.createContext(fresh.window);
    try {
        vm.runInContext(ui, ctx, { filename: 'settings-ui.js' });
        const p = fresh.window.LonShaMemory;
        let callErr = null;
        try { p.showSettingsPanel.call(p); } catch (e) { callErr = e; }
        /* 【U2 与 U3 必须**独立**取数（v3.271.0 实测改正）】
         *   修前把 U3 写在 `else` 分支里：一旦入口抛错（而抛错本身正是本门禁最想抓的形态），
         *   U3 整段**到不了** —— 判据挂在墙上。实测（v3271 D3 负控制首跑）：
         *   把 `#ls-import` 的 id 搬成 data- 属性后，同函数后段的
         *   `querySelector('#ls-import').addEventListener` 先炸在 null 上，
         *   于是输出里只有 U2、没有 U3 —— 破坏确实被抓到了，但**归因只剩一半**，
         *   读者不知道丢的是哪个控件。现在先收 U2，再**无条件**独立测量 DOM 面。 */
        if (callErr) {
            DEFECTS.push('U2 showSettingsPanel 调用抛错：' + callErr.constructor.name + ': ' + callErr.message);
        }
        {
            const ov = fresh.document.getElementById('lonsha-settings-overlay');
            if (!ov) {
                DEFECTS.push('U2 showSettingsPanel 未把面板挂进文档（没抛错 ≠ 渲染出来了）');
            } else {
                const MUST = ['ls-save', 'ls-clear', 'ls-export', 'ls-import', 'ls-snap-restore', 'ls-extract-roles'];
                const missing = MUST.filter(id => !fresh.document.getElementById(id));
                if (missing.length) DEFECTS.push('U3 关键控件丢失 ' + missing.length + ' 个：' + missing.join(' ') + '（HTML 属性吞并/静态截断的典型症状）');
                // U4 属性吞并探测：标签名被当成属性值、属性值里含 '<'
                const html = ov.innerHTML;
                const badAttr = html.match(/\s(?:class|id|style)="[^"]*(?:<|\w+-?\w*="[^"]*"[^>]*>)/);
                if (badAttr) DEFECTS.push('U4 疑似属性吞并：' + JSON.stringify(badAttr[0].slice(0, 120)));
                const danglingStyle = html.match(/style="[^"]*;\s*[>]/);
                if (danglingStyle) DEFECTS.push('U4 style 属性未闭合疑似吞并：' + JSON.stringify(danglingStyle[0].slice(0, 120)));
                NOTES.push('设置面板 DOM：元素 ' + countEls(ov) + ' 个，控件 ' + ov.querySelectorAll('[id]').length + ' 个带 id');
            }
        }
    } catch (e) {
        DEFECTS.push('U2 环境构造阶段异常：' + e.message);
    }
}

function countEls(root) { let n = 0; walk(root, () => n++); return n; }

/* ---------- 5. 汇总 ---------- */
NOTES.forEach(n => console.log('  · ' + n));
if (DEFECTS.length) {
    console.error('[ui-runtime] 检出 ' + DEFECTS.length + ' 处运行时缺陷：');
    DEFECTS.forEach(d => console.error('  ✗ ' + d));
    process.exit(1);
}
console.log('[ui-runtime] 通过：' + entries.length + ' 个 UI 入口实调 0 异常，设置面板真落 DOM 且关键控件在册。');
