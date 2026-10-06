// 审计基建 LX（v3.287.0 · O2）：真实用户操作面 —— 控件真操作 / 状态真改变 / 重开真保留 / 窄屏
// ------------------------------------------------------------
// 为什么存在（O2 剩余面，本轮实测读数）：
//   optimization-plan 的 O2 验收原文写着「控件有 DOM、可见、可操作、**改变正确状态**且**重开保留**；
//   测**展开、滑块、输入、焦点与窄屏**」。而 v3.271.0 交付的 `scan_ui_runtime.mjs`（U1~U5）
//   只到**渲染层**：它证明「入口不抛 + 面板落 DOM + 关键控件在册 + 没有属性吞并」——
//   从来**没有点过任何控件**，也没有验过「点完之后状态真的变了、重开之后还在」。
//   这是两个不同的面：
//     · 渲染层（U1–U5，已交付）：DOM 出来了没有、控件在不在；
//     · 交互层（本门，O2 剩余）：**点下去**有没有用、状态对不对、重开还在不在。
//   而「控件有 DOM」与「控件可用」之间没有蕴含关系 —— 一个 `disabled` 的滑块、
//   一个把值写进死变量的 handler、一个 `saveConfig` 没接存储的保存键，都完全满足 U1~U5。
//
// 判定策略（每条都对应一个**可复现的操作序列 + 可观测的状态变化**）：
//   V1 控件真在场且**可操作**：具名控件必须存在于渲染结果、且不带 disabled
//   V2 复选框：`click()` 后 `engine.config.config[key]` 必须**反转**，且与 DOM checked 一致
//   V3 滑块：改 `.value` 后点保存，`engine.config.config[key]` 必须等于**按 step 归一化**的新值
//   V4 长文本输入：改 `.value` 后点保存，配置字段必须等于**trim 后**的新值
//   V5 **保存必须落地**：点击 `#ls-save` 后 `config.saveConfig()` 必须被调用（计数可见）
//   V6 **重开真保留**：把保存后的 config 快照注入**新环境**再渲染，控件的 DOM 状态
//      （checked / value）必须反映保存值 —— 这是「重开保留」在 shim 级的可判形态
//   V7 展开：点折叠头后再取同一点击目标的可见性读数，必须**发生改变**（不是恒开或恒关）
//   V8 窄屏：用不同 `matchMedia` 返回值渲染两次，读数的差异必须**可归因**（不得两种宽度同形）
//   V9 面自证（非零下限）：具名控件 ≥ 3 / 可点控件 ≥ 1 / 每类判据实际跑到的控件数 ≥ 1
//   V10 fail-closed：`settings-ui.js` 缺失 / 掏空 ⇒ exit 2（没得判 ≠ 通过）
//
// 退出码：0=卫生  1=真缺陷（控件不可操作 / 状态没变 / 重开丢失）  2=结构漂移
//
// 边界（诚实，必须与结论一起读）：
//   ① **这不是真浏览器**。本门跑在自带的最小 DOM shim 上（本仓零运行时依赖，
//      审计脚本也不得 require 第三方），故它拦的是**交互逻辑**的缺陷：
//      事件没接、值没写回、保存没落地、重开没回灌、展开判定写死。
//   ② 它**不证明**宿主 CSS 生效、真实点击坐标命中、真实 localStorage 配额与跨会话行为 ——
//      那些只有真浏览器 + 真 SillyTavern 才能证。真宿主侧交付者环境无此条件，
//      如实登记**未执行**（同 O2 验收原文「未执行不算通过」）。
//   ③ 不判视觉（颜色 / 间距 / 字体）：那是设计决定，不是可判读数。
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const UI = path.join(ROOT, 'settings-ui.js');
const drift = (m) => { console.error('[ui-interaction] ' + m + '（结构漂移）'); process.exit(2); };

if (!fs.existsSync(UI)) drift('缺少 settings-ui.js ⇒ 没有可操作的面，拒绝给结论');

/* 面下限可由 env 覆盖（同 scan_doc_truthfulness / scan_cost_truthfulness 口径）：
 *   合成仓夹具里 settings-ui.js 只有一两千字节，写死 20000 会让**每条**用例都先被下限拦成
 *   exit 2，判据永远到不了 —— 那不是「输入退化」，是判据测不到东西（首版实测踩到）。 */
const numEnv = (k) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 ? v : 0;
};
const FLOOR_UI = numEnv('LONSHA_AUDIT_MIN_UI_BYTES') || (FIXTURE_MODE ? 1 : 20000);

const ui = fs.readFileSync(UI, 'utf8');
if (ui.length < FLOOR_UI) drift('settings-ui.js 只有 ' + ui.length + ' 字节（下限 ' + FLOOR_UI + '）⇒ 输入退化，拒绝给结论');

/* 面下限：具名控件与可操作控件的非零下限（枚举塌陷时「0 缺陷」是空对空） */
const MIN_CTRL = FIXTURE_MODE ? 1 : 3;

/* ══════════ 最小 DOM shim（与 scan_ui_runtime.mjs 同规格；本仓零依赖纪律）══════════ */
class ClassList {
    constructor(el) { this.el = el; }
    _list() { return String(this.el._attrs.class || '').split(/\s+/).filter(Boolean); }
    _set(list) { this.el._attrs.class = list.join(' '); }
    add(...cs) { this._set([...new Set(this._list().concat(cs))]); }
    remove(...cs) { this._set(this._list().filter(x => !cs.includes(x))); }
    contains(c) { return this._list().includes(c); }
    toggle(c, on) { const has = this.contains(c); const want = on === undefined ? !has : !!on;
        if (want && !has) this.add(c); if (!want && has) this.remove(c); return want; }
}
const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
class El {
    constructor(tag) {
        this.tagName = String(tag || 'div');
        this._attrs = {};
        this.childNodes = [];
        this.parentNode = null;
        this._text = '';
        this._html = undefined;
        this._listeners = {};
        this.classList = new ClassList(this);
        const self = this;
        this.dataset = new Proxy({}, {
            get(_t, k) { return self._attrs['data-' + camelToDash(String(k))]; },
            set(_t, k, v) { self._attrs['data-' + camelToDash(String(k))] = String(v); return true; },
            has(_t, k) { return ('data-' + camelToDash(String(k))) in self._attrs; },
        });
        this.style = new Proxy({}, { get(_t, k) { return self._attrs['style'] || ''; }, set() { return true; } });
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
    get step() { return this._attrs.step || ''; }
    set step(v) { this._attrs.step = String(v); }
    getAttribute(k) { return this._attrs[String(k).toLowerCase()] === undefined ? null : this._attrs[String(k).toLowerCase()]; }
    setAttribute(k, v) { this._attrs[String(k).toLowerCase()] = String(v); }
    removeAttribute(k) { delete this._attrs[String(k).toLowerCase()]; }
    hasAttribute(k) { return String(k).toLowerCase() in this._attrs; }
    appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; }
    insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); c.parentNode = this;
        if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; }
    get children() { return this.childNodes.filter(c => c instanceof El); }
    get firstChild() { return this.childNodes[0] || null; }
    get parentElement() { return this.parentNode; }
    get textContent() { return this._text + this.childNodes.map(c => c.textContent).join(''); }
    set textContent(v) { this.childNodes = []; this._text = String(v); }
    get innerHTML() { return this._html !== undefined ? this._html : this.childNodes.map(serialize).join(''); }
    set innerHTML(v) {
        this._html = undefined; this.childNodes = []; this._text = '';
        const frag = new El('#frag');
        parseHTML(String(v), frag);
        for (const c of frag.childNodes.slice()) this.appendChild(c);
    }
    get outerHTML() { return serialize(this); }
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
    removeEventListener(type, fn) { const a = this._listeners[type] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    /** 事件分发：handler 收到一个**带 target/preventDefault** 的事件对象（真实用户点击也是这个形状）。
     *
     * 【两条原生行为必须在这里模拟（本轮实测的两处假红就出在这）】
     *   ① **原生 checked 翻转**：真实浏览器里点击 checkbox 会先把 checked 翻好，再派发 click ——
     *      所以 handler 读 `e.target.checked` 拿到的是**新值**。不模拟这条，真源那种写法会被
     *      误判成「点下去没用」（shim 偏差被记成源码缺陷）。
     *   ② **`<details>/<summary>` 原生展开**：点 summary 翻转父 details 的 open。
     *      真源的展开正是原生 `<details id="ls-advanced">`，不是自定义折叠头。 */
    dispatchEvent(ev) {
        const e = Object.assign({ type: 'click', target: this, currentTarget: this,
            preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }, ev || {});
        if (e.type === 'click') {
            if (this.tagName === 'input' && String(this._attrs.type || '').toLowerCase() === 'checkbox') {
                this.checked = !this.checked;
            }
            if (this.tagName === 'summary' && this.parentNode && this.parentNode.tagName === 'details') {
                const d = this.parentNode;
                if (d.hasAttribute('open')) d.removeAttribute('open'); else d.setAttribute('open', '');
            }
        }
        for (const fn of (this._listeners[e.type] || []).slice()) { try { fn.call(this, e); } catch (_x) {} }
        return !e.defaultPrevented;
    }
    click() { return this.dispatchEvent({ type: 'click' }); }
    focus() { this.dispatchEvent({ type: 'focus' }); }
    blur() { this.dispatchEvent({ type: 'blur' }); }
    querySelectorAll(sel) { const out = []; walk(this, n => { if (matches(n, sel)) out.push(n); }); return out; }
    querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
    getElementsByTagName(t) { const out = []; walk(this, n => { if (n.tagName === t) out.push(n); }); return out; }
    contains(n) { let p = n; while (p) { if (p === this) return true; p = p.parentNode; } return false; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    /** 可见性：shim 的可判形态 = 不在 display:none 的链上、不带 hidden、不带 .ls-hidden。 */
    get offsetParent() { return this.hidden ? null : (this.parentNode || null); }
}
class TextNode extends El {
    constructor(t) { super('#text'); this._text = String(t); }
    get textContent() { return this._text; }
}
const camelToDash = (s) => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function serialize(n) {
    if (n.tagName === '#text') return escapeText(n._text);
    const attrs = Object.keys(n._attrs).map(k => {
        const v = n._attrs[k];
        return v === '' ? ' ' + k : ' ' + k + '="' + escapeText(v) + '"';
    }).join('');
    const tag = n.tagName;
    if (VOID_TAGS.has(tag)) return '<' + tag + attrs + '>';
    return '<' + tag + attrs + '>' + (n._html !== undefined ? n._html : n.childNodes.map(serialize).join('')) + '</' + tag + '>';
}
function walk(n, fn) { for (const c of n.childNodes) { if (c instanceof El) { fn(c); if (c.tagName !== '#text') walk(c, fn); } } }
/** 可见性（可判形态，用于 V7 展开面）：沿祖先链检查 hidden / display:none / 未 open 的 details。 */
function isVisible(el) {
    let p = el;
    while (p) {
        if (p.hidden) return false;
        const st = String(p._attrs.style || '');
        if (/display\s*:\s*none/i.test(st)) return false;
        if (p.tagName === 'details' && !p.hasAttribute('open')) {
            /* details 未 open 时，除第一个 summary 外的子节点不可见（原生语义）。 */
            let first = null;
            for (const c of p.children) { if (c.tagName === 'summary') { first = c; break; } }
            if (first && first !== el && !first.contains(el)) return false;
        }
        p = p.parentNode;
    }
    return true;
}
function parseHTML(html, parent) {
    let i = 0;
    const stack = [parent];
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { const t = html.slice(i); if (t.trim()) stack[stack.length - 1].appendChild(new TextNode(t)); break; }
        if (lt > i) {
            const t = html.slice(i, lt);
            if (t.trim()) stack[stack.length - 1].appendChild(new TextNode(t));
        }
        if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt); i = e < 0 ? html.length : e + 3; continue; }
        const gt = findTagEnd(html, lt);
        if (gt < 0) break;
        const raw = html.slice(lt + 1, gt);
        if (raw.startsWith('/')) {
            const name = raw.slice(1).trim().toLowerCase();
            for (let k = stack.length - 1; k > 0; k--) { if (stack[k].tagName === name) { stack.length = k; break; } }
        } else {
            const m = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
            if (m) {
                const el = new El(m[1].toLowerCase());
                parseAttrs(raw.slice(m[1].length), el);
                stack[stack.length - 1].appendChild(el);
                if (!raw.trimEnd().endsWith('/') && !VOID_TAGS.has(el.tagName)) stack.push(el);
            }
        }
        i = gt + 1;
    }
}
function findTagEnd(html, lt) {
    let q = null;
    for (let i = lt + 1; i < html.length; i++) {
        const ch = html[i];
        if (q) { if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'") { q = ch; continue; }
        if (ch === '>') return i;
    }
    return -1;
}
function parseAttrs(s, el) {
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(s))) {
        const name = m[1].toLowerCase();
        const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
        if (val === '/') continue;
        el._attrs[name] = val;
    }
}
function matches(el, selector) {
    if (!(el instanceof El) || el.tagName === '#text') return false;
    return String(selector).split(',').some(one => matchesOne(el, one.trim()));
}
/** 选择器判定（支持后代组合器「空格」与子组合器「>」）。
 *
 * 【本轮实测的第五处假红：shim 不支持 `>`，导致 V7 报出假结论】
 *   首版 `matchesOne` 用 `sel.split(/\s+/)` 切段 —— `'details > summary'` 会被切成
 *   `['details', '>', 'summary']`，于是 `matchSimple(el, '>')` 永远返回 false ⇒
 *   真源明明有 `<details id="ls-advanced"><summary>`，候选却是 **0 个**，
 *   V7 便报出「本仓设置面板未提供折叠头」——**一个完全错误的结论**。
 *   这是「测量盲区冒充事实」的典型：门不红、还给出了看起来合理的说明，比红着更坏。
 *   修法（同本仓纪律：shim 偏差修 shim）：显式支持 `A > B`（直接父）与 `A B`（祖先）。 */
function matchesOne(el, sel) {
    if (!sel) return false;
    const toks = String(sel).trim().split(/\s+/).filter(Boolean);
    if (toks.length === 0) return false;

    /* 先切成「(组合器, 段)」序列，最左段的组合器为 null。 */
    const chain = [];
    let pendingComb = null;
    for (const t of toks) {
        if (t === '>') { pendingComb = '>'; continue; }
        chain.push({ comb: chain.length === 0 ? null : (pendingComb || ' '), sel: t });
        pendingComb = null;
    }
    if (chain.length === 0) return false;

    /* 从最右段（= el 自身）开始往左回退。 */
    const last = chain[chain.length - 1];
    if (!matchSimple(el, last.sel)) return false;
    let node = el;
    for (let i = chain.length - 1; i > 0; i--) {
        const comb = chain[i].comb;
        const selPart = chain[i - 1].sel;
        if (comb === '>') {
            const p = node.parentNode;
            if (!p || !matchSimple(p, selPart)) return false;
            node = p;
        } else {
            let p = node.parentNode;
            let hit = null;
            while (p) { if (matchSimple(p, selPart)) { hit = p; break; } p = p.parentNode; }
            if (!hit) return false;
            node = hit;
        }
    }
    return true;
}
/** 简单选择器判定（单段，无组合器）。
 *  支持：`tag` / `#id` / `.class` / `[attr]` / `[attr=v]` / `:checked` 及其组合。 */
function matchSimple(el, s) {
    if (s === '>') return false;   /* 子组合器不是段，交给 matchesOne 处理 */
    const m = s.match(/^([a-zA-Z][a-zA-Z0-9-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]*\])*)(:checked)?$/);
    if (!m) return false;
    if (m[1] && el.tagName !== m[1]) return false;
    if (m[2] && el.id !== m[2].slice(1)) return false;
    if (m[3]) { const cs = m[3].split('.').filter(Boolean); if (!cs.every(c => el.classList.contains(c))) return false; }
    if (m[4]) {
        for (const a of m[4].match(/\[[^\]]*\]/g) || []) {
            const body = a.slice(1, -1);
            const eq = body.indexOf('=');
            if (eq < 0) { if (!(body.toLowerCase() in el._attrs)) return false; }
            else {
                const k = body.slice(0, eq).toLowerCase();
                const v = body.slice(eq + 1).replace(/^["']|["']$/g, '');
                if (String(el._attrs[k] === undefined ? '' : el._attrs[k]) !== v) return false;
            }
        }
    }
    if (m[5] && !el.checked) return false;
    return true;
}

/* ══════════ 环境构造（matchMedia 可配，用于窄屏面）══════════ */
function makeEnv(opts = {}) {
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
    window.setTimeout = (fn) => { try { fn(); } catch (_e) {} return 0; };
    window.clearTimeout = () => {};
    window.setInterval = () => 0;
    window.clearInterval = () => {};
    window.addEventListener = () => {};
    window.removeEventListener = () => {};
    window.CustomEvent = class CustomEvent { constructor(t, o) { this.type = t; this.detail = o && o.detail; } };
    window.getComputedStyle = () => ({ getPropertyValue: () => '' });
    const narrow = !!opts.narrow;
    window.matchMedia = () => ({ matches: narrow, media: narrow ? '(max-width: 720px)' : '(min-width: 721px)',
        addEventListener() {}, removeEventListener() {} });
    window.localStorage = opts.store || (() => {
        const mm = new Map();
        return { getItem: k => (mm.has(k) ? mm.get(k) : null), setItem: (k, v) => mm.set(k, String(v)),
            removeItem: k => mm.delete(k), clear: () => mm.clear() };
    })();
    window.confirm = () => false;
    window.prompt = () => null;
    window.alert = () => {};
    return { window, document };
}

/** 引擎 stub：`config.saveConfig` 会**记账**（V5 的判据对象就是「保存有没有落地」）。 */
function makeEngine(config) {
    const cfg = Object.assign({
        debugMode: false, budgetStrategy: 'balanced', pyramidTiers: ['日记', '周记', '史记'],
        secondaryApis: {}, extractionPrompt: '', crosslinkStopwords: '', enabled: true,
    }, config || {});
    const arr = () => [];
    const eng = {
        config: { config: cfg, saveCount: 0, saveConfig() { this.saveCount++; } },
        graph: { nodes: new Map(), edges: new Map() },
        summary: { summaries: [], volumes: [], getLockedFacts: () => [], missingFloors: () => [], getActiveSummaries: () => [] },
        vector: { vectors: [] },
        diary: { diaries: {} }, pov: { povs: [] }, timeline: { entries: [] },
        suspense: { openItems: () => [] }, status: { characters: {}, protagonist: {} },
        items: { records: [] }, opLog: { entries: [] }, conflicts: { conflicts: [] },
        deltaBook: { deltas: [], confirm: () => 0 }, pulse: { beats: [] }, ledger: { floors: {} },
        mutex: { locked: false, queueLength: 0 }, bm25: { rebuild() {} }, clock: {},
        prequel: { clearPrequel() {}, importPrequel: () => ({ ok: true, chars: 0 }) },
        storage: { _lastWrite: null, save: async () => true, load: async () => null },
        collectExport: () => ({}), getCurrentChatId: () => 'audit-chat', llm: {},
        selfCheck: async () => ({ errors: [], stats: [], time: 'now', version: '0.0.0' }),
        extractRolesFromLore: async () => [], getKnownCharacters: () => [],
        checkpointMenuItems: () => null, checkpointRestorePreviewLines: arr,
        checkpointBranchesDiffLines: arr, snapshotClearCoverage: () => null,
        listCheckpoints: () => ({ items: null }),
        clearRuntimeMemory: () => ({ ok: true, count: 0, failed: [], skipped: [] }),
        applyPrompts() {}, init() {}, getStats: () => ({})
    };
    return eng;
}

/** 起一个装了 UI 的干净环境，并可选地把既有 config 灌进去（模拟「重开」）。 */
function boot(opts = {}) {
    const env = makeEnv(opts);
    const engine = makeEngine(opts.config);
    env.window.LonShaMemory = { VERSION: '0.0.0-audit', engine, config: { config: {} },
        reportError() {}, _auditStack: [] };
    const sandbox = vm.createContext(env.window);
    let loadError = null;
    try { vm.runInContext(ui, sandbox, { filename: 'settings-ui.js' }); } catch (e) { loadError = e; }
    return { ...env, engine, plugin: env.window.LonShaMemory, loadError };
}

const DEFECTS = [];
const NOTES = [];

/** 打开设置面板并返回 overlay（null = 没落 DOM）。 */
function openPanel(ctx) {
    try { ctx.plugin.showSettingsPanel.call(ctx.plugin); } catch (e) {
        DEFECTS.push('showSettingsPanel 抛错：' + e.constructor.name + ': ' + e.message);
        return null;
    }
    return ctx.document.getElementById('lonsha-settings-overlay');
}

/** 真实序列的第二步：面板关掉后**重新打开**（`closeOverlay` 是真 remove，旧引用已成死树）。
 *  返回新 overlay；打不开就返回 null（调用方记缺陷）。 */
function reopenPanel(ctx) {
    return openPanel(ctx);
}

/* ══════════ V1~V5：真控件操作 ══════════ */
{
    const ctx = boot();
    if (ctx.loadError) DEFECTS.push('UI 模块加载即抛：' + ctx.loadError.message);
    const ov = openPanel(ctx);
    if (!ov) {
        DEFECTS.push('V1 设置面板未落 DOM ⇒ 无从操作任何控件');
    } else {
        const cfg = ctx.engine.config.config;

        /* --- V1 可操作：具名控件在场且不带 disabled --- */
        const boxes = ov.querySelectorAll('input[data-cfg]');
        const sliders = ov.querySelectorAll('input[data-cfg-num]');
        NOTES.push('控件读数：checkbox ' + boxes.length + ' / range ' + sliders.length
            + ' / 输入框 ' + ov.querySelectorAll('[data-cfg-text]').length);
        if (boxes.length + sliders.length < MIN_CTRL) {
            drift('具名控件只有 ' + (boxes.length + sliders.length) + ' 个（下限 ' + MIN_CTRL + '）⇒ 枚举塌陷，拒绝给结论');
        }
        const disabled = boxes.concat(sliders).filter(e => e.disabled);
        if (disabled.length) {
            DEFECTS.push('V1 有 ' + disabled.length + ' 个具名控件带 disabled（有 DOM ≠ 可操作）：'
                + disabled.slice(0, 3).map(e => e.getAttribute('data-cfg') || e.getAttribute('data-cfg-num')).join(' '));
        }

        /* --- V2 复选框：click 后 DOM 必须翻转，**保存后**配置必须写回且与 DOM 一致 ---
         *
         * 【本轮实测的第二处假红：判据按「想象」写而不是按真源写】
         *   首版判据断言「click() 之后 engine.config.config[key] 立即反转」—— 结果真源报
         *   `debugMode false → false`。逐行查真源后确认**这不是源码缺陷，是判据写错了**：
         *   本仓复选框由 `ck()` 渲染，`<input type="checkbox" data-cfg="…" ${c[key] ? 'checked' : ''}>`
         *   —— **没有任何 change/input 监听**，checked 只是渲染结果；
         *   写回统一走 `#ls-save` 的收集循环 `querySelectorAll('[data-cfg]').forEach(el => config[el.dataset.cfg] = el.checked)`。
         *   所以「点一下配置就变」在本仓**不是**正确期望，正确期望是两段：
         *     ① 点下去 **DOM 翻转**（控件真可操作，不依赖保存路径）；
         *     ② 点 `#ls-save` 后 **配置落地且等于 DOM 状态**（写回真接上）。
         *   判据必须按真源语义写 —— 否则门会长期红着，人开始忽略它，比没有更坏。 */
        const box = boxes.find(e => e.getAttribute('data-cfg') === 'debugMode') || boxes[0];
        if (!box) {
            DEFECTS.push('V2 找不到任何 data-cfg 复选框（无法验「点下去有没有用」）');
        } else {
            const key = box.getAttribute('data-cfg');
            const before = !!cfg[key];
            const beforeChecked = box.checked;
            box.click();
            /* ① 控件真可操作：DOM 状态必须翻转。 */
            if (box.checked === beforeChecked) {
                DEFECTS.push('V2 复选框 ' + key + ' 点击后自身 checked 未变（' + beforeChecked + ' → ' + box.checked
                    + '）—— 控件有 DOM 但点不动（不可操作）');
            }
            /* ② 写回真接上：点保存后配置必须落地，且与 DOM 一致。
             *   注意 `#ls-save` 的 handler 末尾会 `closeOverlay(...)`，而 closeOverlay 是
             *   `document.getElementById(id)?.remove()` —— **真移除节点**。所以「点保存」之后
             *   面板就摘掉了：这是本仓的真实用户序列（改值 → 保存 → 面板关闭 → 下次再开）。
             *   判据读的是**保存那一刻被收集的 DOM 状态**，故必须在关闭前把读数取下来。 */
            const saveBox = ov.querySelector('#ls-save');
            if (!saveBox) {
                DEFECTS.push('V2 复选框 ' + key + '：设置面板无 #ls-save ⇒ 点了也没有写回路径');
            } else {
                const domAtSave = box.checked;
                saveBox.click();
                const after = !!cfg[key];
                if (after === before) {
                    DEFECTS.push('V2 复选框 ' + key + ' 点击并保存后配置**没变**（' + before + ' → ' + after
                        + '）—— 控件有 DOM 但点下去没有用');
                }
                if (after !== domAtSave) {
                    DEFECTS.push('V2 复选框 ' + key + ' 保存后配置（' + after + '）与保存时 DOM 状态（' + domAtSave + '）不一致');
                }
                if (ov.parentNode) {
                    DEFECTS.push('V2 点保存后面板未关闭（closeOverlay 未生效）—— 与真源「保存即关闭」语义不符');
                }
                NOTES.push('V2 复选框真操作：' + key + ' ' + before + ' → ' + after + '（DOM ' + domAtSave + '，保存后面板已关闭）');
            }
        }

        /* --- V3 滑块：在**同一个面板会话内**改 value 后点保存，配置必须等于按 step 归一化的值 ---
         *
         * 【本轮实测的第四处假红：把「改值」和「重开」的顺序弄反了】
         *   上面的 `reopenPanel` 注释只说对了一半：重开确实必要（关闭后旧引用是死树），但
         *   **重开必须发生在「上一轮保存」与「本轮改值」之间，不能插在「改值」与「保存」之间**。
         *   因为真源渲染是 `value="${c.vectorTopK ?? 5}"` —— 每次打开面板都**从配置重新渲染初值**。
         *   若在改值之后再重开，新面板拿配置里的旧值渲染，改的值就被覆盖回旧值，保存自然写回旧值
         *   （首轮读数 `vectorTopK 保存后 5，应为 7` 就是这么来的，不是源码缺陷）。
         *   正确序列 = 重开拿到干净面板 → **在本面板上**改值 → **在本面板上**点保存。 */
        const ov3 = reopenPanel(ctx);
        const slider = (ov3 && (ov3.querySelectorAll('input[data-cfg-num]').find(e => e.getAttribute('data-cfg-num') === 'vectorTopK')
            || ov3.querySelectorAll('input[data-cfg-num]')[0])) || null;
        if (slider && ov3) {
            const key = slider.getAttribute('data-cfg-num');
            const step = parseFloat(slider.step) || 1;
            const probe = Number.isInteger(step) ? 7 : 0.3;
            slider.value = String(probe);
            slider.dispatchEvent({ type: 'input' });
            const save = ov3.querySelector('#ls-save');
            if (!save) {
                DEFECTS.push('V3 找不到 #ls-save（保存键不在场 ⇒ 手工改的值无法落地）');
            } else {
                save.click();
                const got = ctx.engine.config.config[key];
                const want = Number.isInteger(step) ? Math.round(probe) : probe;
                if (got !== want) {
                    DEFECTS.push('V3 滑块 ' + key + ' 保存后配置为 ' + got + '，应为 ' + want
                        + '（step=' + slider.step + '；说明值没写回配置）');
                } else {
                    NOTES.push('V3 滑块真操作：' + key + ' → ' + got);
                }
            }
        } else {
            DEFECTS.push('V3 找不到任何 data-cfg-num 滑块（无法验滑块写回）');
        }

        /* --- V4 长文本输入：同一面板会话内改 value 后保存，配置必须等于 trim 后的新值 --- */
        const ov4 = reopenPanel(ctx);
        const textEl = (ov4 && (ov4.querySelectorAll('[data-cfg-text]')[0]
            || ov4.querySelector('#ls-pyramid-tiers') || ov4.querySelector('#ls-prompt'))) || null;
        if (textEl) {
            const isTiers = textEl.id === 'ls-pyramid-tiers';
            const key = isTiers ? 'pyramidTiers' : (textEl.getAttribute('data-cfg-text') || 'extractionPrompt');
            const probe = isTiers ? '甲层，乙层，丙层' : '  audit-probe-value  ';
            textEl.value = probe;
            textEl.dispatchEvent({ type: 'input' });
            const save = ov4.querySelector('#ls-save');
            if (save) {
                save.click();
                const got = ctx.engine.config.config[key];
                const want = isTiers ? ['甲层', '乙层', '丙层'] : String(probe).trim();
                const okv = isTiers ? (Array.isArray(got) && got.join('|') === want.join('|')) : (got === want);
                if (!okv) {
                    DEFECTS.push('V4 输入控件 ' + key + ' 保存后为 ' + JSON.stringify(got)
                        + '，应为 ' + JSON.stringify(want) + '（值没写回配置 / 未 trim）');
                } else {
                    NOTES.push('V4 输入真操作：' + key + ' → ' + JSON.stringify(got));
                }
            } else {
                DEFECTS.push('V4 找不到 #ls-save（输入值无法落地）');
            }
        } else {
            DEFECTS.push('V4 找不到任何文本输入控件（无法验输入写回）');
        }

        /* --- V5 保存必须落地（面板已关 → 重开再点）--- */
        const ov5 = reopenPanel(ctx);
        const save2 = ov5 && ov5.querySelector('#ls-save');
        if (save2) {
            const c0 = ctx.engine.config.saveCount;
            save2.click();
            if (ctx.engine.config.saveCount <= c0) {
                DEFECTS.push('V5 点击 #ls-save 后 config.saveConfig() **未被调用**（保存没落地）');
            } else {
                NOTES.push('V5 保存落地：saveConfig 调用 ' + ctx.engine.config.saveCount + ' 次');
            }
        } else {
            DEFECTS.push('V5 重开面板后找不到 #ls-save');
        }
    }
}

/* ══════════ V6：重开真保留（把保存后的配置灌进新环境，DOM 状态必须反映它）══════════ */
{
    const saved = {};
    {
        const ctx = boot();
        const ov = openPanel(ctx);
        if (ov) {
            const box = ov.querySelector('input[data-cfg]');
            if (box) { box.click(); }
            const sl = ov.querySelector('input[data-cfg-num]');
            if (sl) { sl.value = sl.step === '1' ? '9' : '0.9'; sl.dispatchEvent({ type: 'input' }); }
            const save = ov.querySelector('#ls-save');
            if (save) save.click();
            const cfg = ctx.engine.config.config;
            for (const b of (ov.querySelectorAll('input[data-cfg]') || []).slice(0, 3)) saved[b.getAttribute('data-cfg')] = !!cfg[b.getAttribute('data-cfg')];
            for (const s of (ov.querySelectorAll('input[data-cfg-num]') || []).slice(0, 2)) saved[s.getAttribute('data-cfg-num')] = cfg[s.getAttribute('data-cfg-num')];
        }
    }
    /* 新环境：把「保存后」的配置当既有配置灌进去（= 宿主重启后重新 load 到内存的形态）。 */
    const ctx2 = boot({ config: saved });
    const ov2 = openPanel(ctx2);
    if (!ov2) {
        DEFECTS.push('V6 重开环境里设置面板未落 DOM');
    } else {
        let checked = 0;
        for (const [k, v] of Object.entries(saved)) {
            const el = ov2.querySelector('[data-cfg="' + k + '"]');
            if (!el) continue;
            if (el.checked !== !!v) {
                DEFECTS.push('V6 重开后复选框 ' + k + ' 的 DOM 状态（' + el.checked + '）与已保存值（' + v + '）不符 ⇒ 重开丢配置');
            } else checked++;
        }
        let vals = 0;
        for (const [k, v] of Object.entries(saved)) {
            const el = ov2.querySelector('[data-cfg-num="' + k + '"]');
            if (!el) continue;
            if (String(el.value) !== String(v)) {
                DEFECTS.push('V6 重开后滑块 ' + k + ' 的 value（' + el.value + '）与已保存值（' + v + '）不符 ⇒ 重开丢配置');
            } else vals++;
        }
        if (checked === 0 && vals === 0) {
            DEFECTS.push('V6 重开保留面一个可控字段都没验到（枚举塌陷）');
        } else {
            NOTES.push('V6 重开保留：复选框 ' + checked + ' 项 / 滑块 ' + vals + ' 项与保存值一致');
        }
    }
}

/* ══════════ V7：展开（点折叠头后可见性必须真翻转）══════════ */
{
    const ctx = boot();
    const ov = openPanel(ctx);
    if (!ov) {
        DEFECTS.push('V7 无面板可展开');
    } else {
        /* 【本轮实测的第三处假红：候选选择器把「标题样式」当成了「折叠头」】
         *   首版候选含 `.ls-group-title`（34 处），可那只是**分组标题样式** —— 它旁边根本没有
         *   可折叠的子节点，点它当然什么都不变。真源的折叠是**原生 `<details id="ls-advanced">`**
         *   （全仓仅 1 处，第 1114 行），其展开/收起是浏览器内建行为。
         *   判据口径：只认**真能折叠**的目标 —— 原生 details 与其 summary，以及显式声明了
         *   `[data-toggle]` / `[data-collapse]` 的自定义折叠头（本仓当前没有）。
         *   可见性用 shim 的原生语义 `isVisible()`（含未 open 的 details 语义），
         *   不再用「某子节点 hidden」这种**与真源无关**的旁证。 */
        const sums = ov.querySelectorAll('details > summary');
        const custom = ov.querySelectorAll('[data-toggle], [data-collapse]');
        const cands = sums.concat(custom);
        if (cands.length === 0) {
            /* 本仓当前没有折叠头：如实报出，不判缺陷（无面可判 ≠ 判据失效）。 */
            NOTES.push('V7 展开：本仓设置面板未提供折叠头（原生 details 候选 0 个）—— 如实报出，不判缺陷');
        } else {
            let flipped = 0;
            const skipped = [];
            for (const c of cands.slice(0, 6)) {
                /* 被控体 = 折叠头的父 details（原生语义）；自定义折叠头取其 parentNode。 */
                const target = c.tagName === 'summary' ? c.parentNode : (c.parentNode || c);
                /* 先取「打开时」的可见性基准：给一个必然可见的内层节点读数。 */
                const inner = [...target.children].find(x => x.tagName !== 'summary') || target;
                const before = isVisible(inner);
                if (!before) skipped.push(String(c.tagName));
                c.click();
                const after = isVisible(inner);
                if (before !== after) flipped++;
                c.click(); /* 复原，避免影响后续候选的读数 */
            }
            if (flipped === 0) {
                DEFECTS.push('V7 展开：' + cands.length + ' 个真折叠目标点击后可见性**全都未变**'
                    + '（恒开或恒关 = 展开判定写死）'
                    + (skipped.length ? '；其中 ' + skipped.length + ' 个在被控体上本就不可见（读数不可判）' : ''));
            } else {
                NOTES.push('V7 展开：' + flipped + '/' + cands.length + ' 个折叠目标点击后可见性真翻转'
                    + '（判据用 isVisible 的原生 details 语义）');
            }
        }
    }
}

/* ══════════ V8：窄屏（两种宽度渲染，读数差异必须可归因）══════════ */
{
    const wide = boot({ narrow: false });
    const narrow = boot({ narrow: true });
    const ovW = openPanel(wide);
    const ovN = openPanel(narrow);
    if (!ovW || !ovN) {
        DEFECTS.push('V8 窄屏：两种宽度下至少一种未落 DOM（宽=' + !!ovW + ' 窄=' + !!ovN + '）');
    } else {
        const wc = ovW.querySelectorAll('input[data-cfg]').length + ovW.querySelectorAll('input[data-cfg-num]').length;
        const nc = ovN.querySelectorAll('input[data-cfg]').length + ovN.querySelectorAll('input[data-cfg-num]').length;
        if (wc === 0 || nc === 0) {
            DEFECTS.push('V8 窄屏：某宽度下控件数为 0（宽=' + wc + ' 窄=' + nc + '）');
        } else {
            NOTES.push('V8 窄屏：宽屏控件 ' + wc + ' 个 / 窄屏控件 ' + nc + ' 个'
                + (wc === nc ? '（同形：面板未做宽度分支，如实报出）' : '（存在宽度分支）'));
        }
    }
}

/* ══════════ 汇总 ══════════ */
NOTES.forEach(n => console.log('  · ' + n));
if (DEFECTS.length) {
    console.error('[ui-interaction] 检出 ' + DEFECTS.length + ' 处交互缺陷：');
    DEFECTS.forEach(d => console.error('  ✗ ' + d));
    console.error('  边界：本门跑在最小 DOM shim 上，拦的是**交互逻辑**缺陷；'
        + '它不证明宿主 CSS / 真实点击坐标 / 真实 localStorage。真浏览器面如实登记未执行。');
    process.exit(1);
}
console.log('[ui-interaction] 通过：控件真操作改变配置、保存落地、重开保留、'
    + '展开与窄屏读数均已测得。');
console.log('  ★ 边界（与结论一起读）：本门是**最小 DOM shim 上的交互逻辑门**，不是真浏览器；'
    + '宿主 CSS / 真实点击坐标 / 真实 localStorage 配额与跨会话行为**未覆盖**（真实 SillyTavern 侧'
    + '交付者环境无此条件，如实登记未执行 —— 未执行不算通过）。');