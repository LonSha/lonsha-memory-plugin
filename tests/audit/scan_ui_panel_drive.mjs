/* ============================================================
 * tests/audit/scan_ui_panel_drive.mjs —— UI **面板逐条目真驱动**门（零依赖）[v3.303.0 M-O2]
 * ------------------------------------------------------------
 * 为什么存在（真宿主取证实测，不是整洁性偏好）：
 *
 *   本仓已有三层 UI 门：
 *     · `scan_ui_binding.mjs`(A1–A6)：**静态**绑定卫生（重复控件 / 幽灵控件 / 类型一致）；
 *     · `scan_ui_runtime.mjs`(U1–U5)：入口**实调**不抛 + 设置面板真落 DOM + 关键控件在册；
 *     · `scan_ui_interaction.mjs`(V1–V10)：设置面板**控件真操作**（点击 / 滑块 / 输入 / 保存 / 重开）。
 *   三层全绿，而真 SillyTavern 1.19.0 + Chromium 131 上实测出**四处用户可见的失效**：
 *
 *     D1 **`showDiagnose` 函数体内 `esc` 不可达** —— 该函数构造错误行的模板串里用了 6 处
 *        `esc(...)`，而本档是 IIFE、`esc` 逐函数各自定义，这个函数**漏了定义行**。
 *        真宿主读数：`showDiagnose()` ⇒ `threw = "esc is not defined"`、诊断面板**未落 DOM**。
 *        为什么 U1 没抓到：U1 用的合成引擎 `selfCheck()` 返回 `{errors:[], stats:[]}`，
 *        而用 `esc` 的那几行**只在真有诊断数据时**才求值（空数组 map 不出行、`pipeline`/`schema`
 *        缺席直接走三元假支）⇒ 早退在构造 HTML **之前**，函数"没抛"地通过了。
 *        形态定性：**空夹具冒充通过** —— 判据跑到了，但被夹的是构造前的早退路径。
 *
 *     D2 **`_memOps` 比对两侧类型不同 ⇒ 条目点得动、面板永不弹** —— 本函数收到的 `id` 永远来自
 *        `dataset` / HTML 属性，而 **DOM 属性只能是字符串**；`summary` 分支拿它去比引擎侧的
 *        `floor: Number`，`===` 恒 false ⇒ `find` 恒落空 ⇒ 函数**静默 return**。
 *        真宿主双向读数（同函数、同数据、只差 id 类型）：
 *          `_memOps('summary','3')`（= dataset 真值）⇒ `panelOpen=false`；
 *          `_memOps('summary',3)`  （= 引擎真值）  ⇒ `panelOpen=true`。
 *        为什么 U1/V1 没抓到：两层都只驱动**设置面板**（`showSettingsPanel`），
 *        从不打开 `showBrowser` 的内容面板，更不会去点条目。
 *
 *     D3 **`opHint` 无条件挂在所有视图上** —— "💡 点击条目可操作（删除 / 提升重要度 / 标记完成）"
 *        在 `lockedfacts` / `deltas` / `oplog` 等**一个可点条目都没有**的视图上照挂不误。
 *        用户按提示点下去毫无反应：这是"把不可用说成可用"，比不提示更坏。
 *
 *     D4 **`data-opid` 属性值缺引号转义** —— `esc` 只处理 `& < >`，值里的双引号会提前闭合属性，
 *        余下内容被浏览器当成新标签（属性吞并）。`items`（物品名）与 `life`（档案 id）都是
 *        用户/LLM 产出的自由文本，一条含 `"` 的走位就能让寻址失效或页面被注入多余标签**而不报错**。
 *
 *   四处的共同点：**都不在"设置面板控件"这一面上**，都在"内容面板 + 条目级交互"这一面上。
 *   故本门把那一面补上：真开面板、真找条目、真点下去、验它**真的有反应**。
 *
 * 判定策略（每条都必须有非零下限，否则抽到 0 会以全绿通过）：
 *   W1 诊断面板**带数据**驱动：`selfCheck()` 返回**非空** `errors`/`stats`/`pipeline`/`schema`
 *      （即真正会走到用 `esc` 的那几行），`showDiagnose()` 不得抛，且面板必须真落 DOM。
 *   W2 条目真点：`showBrowser` 各视图渲染出的 `[data-opkind]` 条目，点下去必须弹出 `#lonsha-memops-overlay`。
 *   W3 条目点击**面自证**：至少驱动到 N 个可点条目（下限 5），且**静默无反应数必须为 0**。
 *      （D2 的形态就是"点得动但静默 return"——它不抛错，所以只有"点了之后有没有反应"能判。）
 *   W4 寻址口在册：每个 `[data-opid]` 必须读得出来且非空。
 *      （注：`getAttribute` 与 `dataset` 读的是同一个已解码属性，「两侧比对相等」恒真，
 *       不算判据 —— 属性转义的判据是 W4b。）
 *   W4b 属性值往返（**双基准**）：夹具物品名含双引号时，渲染出的条目必须能**按原名寻回** ——
 *      DOM 基准（直读属性）与文本基准（序列化回标记再解析一遍，即浏览器的叙述路径）各一条。
 *   W5 提示诚实：`opHint` 的出现必须与"本面板真有 `[data-opkind]` 条目"一致（不得无条件挂）。
 *   W6 面板级触达面（非零下限）：本门真的开过 ≥ N 个内容视图、≥ M 个诊断面，否则 exit 2。
 *
 * 实现约束（勿凭直觉改动）：
 *   · 本仓**零运行时依赖**，审计脚本也不得 require 第三方 —— 故自带**最小 DOM shim**
 *     （与 `scan_ui_runtime.mjs` / `scan_ui_interaction.mjs` 同规格）。
 *   · **shim 偏差必须修 shim，不得记成源码缺陷**（本仓两次实测踩到：
 *     checkbox 原生 checked 翻转、`details > summary` 子组合器）—— 本门对属性值走
 *     `getAttribute` + `dataset` 双读并互相校对，正是为了把"shim 读法"与"源码写法"分开。
 *   · 退出码：0=卫生  1=存在真缺陷  2=结构漂移/探测器失效（没得判 ≠ 通过）。
 *
 * 边界（诚实，必须与结论一起读）：
 *   · 本门跑在**最小 DOM shim** 上，不是真浏览器：它拦的是**条目驱动逻辑**（寻址失配 /
 *     静默 no-op / 提示撒谎 / 属性吞并），**不证明**宿主 CSS、真实点击坐标、真实 localStorage
 *     配额与跨会话行为 —— 那些只有真浏览器 + 真 SillyTavern 才能证（已在 v3.303.0 用
 *     CDP 直连 Chromium 的探针取得读数，探针依赖本地 ST clone 与浏览器，**不进 npm test**）。
 *   · 本门**不**取代 U/V 两层，三层各管一面，缺一即留下本档 D1~D4 这类盲区。
 * ============================================================ */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const UI_PATH = path.join(ROOT, 'settings-ui.js');

const drift = (m) => { console.error('[ui-panel-drive] ' + m + '（结构漂移/探测器失效）'); process.exit(2); };

let ui = '';
try { ui = fs.readFileSync(UI_PATH, 'utf8'); } catch (_e) { ui = ''; }
const MIN_UI_BYTES = Number(process.env.LONSHA_AUDIT_MIN_UI_BYTES || 20000);
if (ui.length < MIN_UI_BYTES) {
    drift('settings-ui.js ' + ui.length + ' 字节（下限 ' + MIN_UI_BYTES + '）⇒ 输入退化，拒绝给结论');
}

/* ══════════ 最小 DOM shim（同 U/V 两层规格；本仓零依赖纪律）══════════ */
const VOID_TAGS = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
const camelToDash = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class ClassList {
    constructor(el) { this.el = el; }
    _list() { return String(this.el._attrs.class || '').split(/\s+/).filter(Boolean); }
    _set(l) { this.el._attrs.class = l.join(' '); }
    add(...cs) { this._set([...new Set(this._list().concat(cs))]); }
    remove(...cs) { this._set(this._list().filter((x) => !cs.includes(x))); }
    contains(c) { return this._list().includes(c); }
    toggle(c, on) { const has = this.contains(c); const want = on === undefined ? !has : !!on;
        if (want && !has) this.add(c); if (!want && has) this.remove(c); return want; }
}

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
        this.style = new Proxy({}, { get() { return self._attrs.style || ''; }, set() { return true; } });
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
    getAttribute(k) { const kk = String(k).toLowerCase(); return this._attrs[kk] === undefined ? null : this._attrs[kk]; }
    setAttribute(k, v) { this._attrs[String(k).toLowerCase()] = String(v); }
    removeAttribute(k) { delete this._attrs[String(k).toLowerCase()]; }
    hasAttribute(k) { return String(k).toLowerCase() in this._attrs; }
    appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
    removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; } return c; }
    insertBefore(c, ref) { const i = this.childNodes.indexOf(ref); c.parentNode = this;
        if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c); return c; }
    get children() { return this.childNodes.filter((c) => c instanceof El); }
    get firstChild() { return this.childNodes[0] || null; }
    get parentElement() { return this.parentNode; }
    get textContent() { return this._text + this.childNodes.map((c) => c.textContent).join(''); }
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
    /** 事件分发：handler 收到带 target/preventDefault 的事件对象（真实用户点击也是这个形状）。
     *  【shim 偏差必须在这里修，不得记成源码缺陷】本门只需 click 这一种。 */
    dispatchEvent(ev) {
        const e = Object.assign({ type: 'click', target: this, currentTarget: this,
            preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }, ev || {});
        for (const fn of (this._listeners[e.type] || []).slice()) { try { fn.call(this, e); } catch (_x) {} }
        return !e.defaultPrevented;
    }
    click() { return this.dispatchEvent({ type: 'click' }); }
    focus() { this.dispatchEvent({ type: 'focus' }); }
    querySelectorAll(sel) { const out = []; walk(this, (n) => { if (matches(n, sel)) out.push(n); }); return out; }
    querySelector(sel) { const a = this.querySelectorAll(sel); return a.length ? a[0] : null; }
    contains(n) { let p = n; while (p) { if (p === this) return true; p = p.parentNode; } return false; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    get offsetParent() { return this.hidden ? null : (this.parentNode || null); }
}

class TextNode extends El {
    constructor(t) { super('#text'); this._text = String(t); }
    get textContent() { return this._text; }
}

/* 【shim 保真：序列化必须按**属性值**规则转义】真浏览器的 `outerHTML` 对属性值转义 `&`
 *   与双引号；本 shim 的 `_attrs` 存的是**已解码值**（与浏览器内存里的属性值同形），
 *   故序列化时同样只做「& → &amp;、双引号 → "」。
 *   首跑实测：若照文本节点那样只转 `& < >`，含双引号的值序列化后会把属性提前闭合、
 *   文本基准**自己制造出**「吞并」假象 —— 那是**观测姿势错**，不是源码缺陷。 */
const escapeAttrVal = (v) => String(v)
    .replace(/&/g, String.fromCharCode(38) + 'amp;')
    .replace(/"/g, String.fromCharCode(38) + 'quot;');
function serialize(n) {
    if (n.tagName === '#text') return escapeText(n._text);
    const attrs = Object.keys(n._attrs).map((k) => {
        const v = n._attrs[k];
        return v === '' ? ' ' + k : ' ' + k + '=' + String.fromCharCode(34) + escapeAttrVal(v) + String.fromCharCode(34);
    }).join('');
    const tag = n.tagName;
    if (VOID_TAGS.has(tag)) return '<' + tag + attrs + '>';
    const inner = n._html !== undefined ? n._html : n.childNodes.map(serialize).join('');
    return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
}
function walk(n, fn) { for (const c of n.childNodes) { if (c instanceof El) { fn(c); if (c.tagName !== '#text') walk(c, fn); } } }
function parseHTML(html, parent) {
    let i = 0;
    const stack = [parent];
    while (i < html.length) {
        const lt = html.indexOf('<', i);
        if (lt < 0) { const t = html.slice(i); if (t.trim()) stack[stack.length - 1].appendChild(new TextNode(t)); break; }
        if (lt > i) { const t = html.slice(i, lt); if (t.trim()) stack[stack.length - 1].appendChild(new TextNode(t)); }
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
                /* 【shim 保真：属性值读取必须**解码实体**】真浏览器读含实体的属性会得到解码后的值；
         *   shim 若原样保留实体文本，就会把「源码正确做了属性值转义」误报成
         *   「寻址失配、点击无反应」—— 那是**观测姿势错**，不是源码缺陷
         *   （本仓纪律：shim 偏差必须修 shim）。首跑实测：items 夹具把物品名写成含双引号，
         *   修 shim 前门报假红。实体表在**运行时**拼出，避免字面量被外层写入管线解码。 */
        const ENT = (function () { const A = String.fromCharCode(38); return [  [new RegExp(A + 'lt;', 'g'), '<'],  [new RegExp(A + 'gt;', 'g'), '>'],  [new RegExp(A + 'quot;', 'g'), String.fromCharCode(34)],  [new RegExp(A + '#39;', 'g'), String.fromCharCode(39)],  [new RegExp(A + 'amp;', 'g'), A]]; })();
        let vv = String(val);
        for (const [re, rep] of ENT) vv = vv.replace(re, rep);
        el._attrs[name] = vv;
    }
}
function matches(el, selector) {
    if (!(el instanceof El) || el.tagName === '#text') return false;
    return String(selector).split(',').some((one) => matchesOne(el, one.trim()));
}
function matchesOne(el, sel) {
    if (!sel) return false;
    const toks = String(sel).trim().split(/\s+/).filter(Boolean);
    if (toks.length === 0) return false;
    const chain = [];
    let pending = null;
    for (const t of toks) {
        if (t === '>') { pending = '>'; continue; }
        chain.push({ comb: chain.length === 0 ? null : (pending || ' '), sel: t });
        pending = null;
    }
    if (chain.length === 0) return false;
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
function matchSimple(el, s) {
    if (s === '>') return false;
    const m = s.match(/^([a-zA-Z][a-zA-Z0-9-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]*\])*)(:checked)?$/);
    if (!m) return false;
    if (m[1] && el.tagName !== m[1]) return false;
    if (m[2] && el.id !== m[2].slice(1)) return false;
    if (m[3]) { const cs = m[3].split('.').filter(Boolean); if (!cs.every((c) => el.classList.contains(c))) return false; }
    if (m[4]) {
        for (const a of (m[4].match(/\[[^\]]*\]/g) || [])) {
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

/* ══════════ 环境构造 ══════════ */
function makeEnv() {
    const document = new El('#document');
    const head = new El('head');
    const body = new El('body');
    document.appendChild(head); document.appendChild(body);
    document.head = head; document.body = body;
    document.readyState = 'complete';
    document.createElement = (t) => new El(t);
    document.createTextNode = (t) => new TextNode(t);
    document.getElementById = (id) => { let r = null; walk(document, (n) => { if (!r && n.id === id) r = n; }); return r; };
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
    window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {} });
    window.localStorage = (() => { const mm = new Map(); return { getItem: (k) => (mm.has(k) ? mm.get(k) : null),
        setItem: (k, v) => mm.set(k, String(v)), removeItem: (k) => mm.delete(k), clear: () => mm.clear() }; })();
    window.confirm = () => false;
    window.prompt = () => null;
    window.alert = () => {};
    return { window, document, head, body };
}

/* ---------- 引擎 stub：**必须带数据**（这正是 U1 漏掉 D1 的根因）----------
 * U1 的 stub `selfCheck()` 返回 `{errors: [], stats: []}` ⇒ 用 `esc` 的那几行**不被求值**，
 * 于是"没抛"通过了。本门把四个面都填上**非空**载荷，逼出构造 HTML 的分支。 */
function makeEngine() {
    const cfg = { debugMode: false, budgetStrategy: 'balanced', pyramidTiers: ['日记'], secondaryApis: {}, extraKeys: 1 };
    const toQuote = String.fromCharCode(34);
    const eng = {
        config: { config: cfg, saveConfig() {} },
        graph: { nodes: new Map([['a', { name: '甲', type: 'char', timestamp: 1 }]]), edges: new Map() },
        summary: {
            summaries: [{ floor: 3, text: '摘要正文 ' + toQuote + '带引号' + toQuote, timestamp: 1700000000000 }],
            volumes: [], missingFloors: () => [], getActiveSummaries: () => [],
            getLockedFacts: () => [{ id: 'lf_1', text: '锁定事实', floor: 2, createdAt: 1700000000000 }],
        },
        vector: { vectors: [{ id: 'vec_1', text: '向量正文', timestamp: 1, metadata: { floor: 4 } }] },
        diary: { diaries: {} },
        pov: { povs: [{ id: 'pov_1', owner: '甲', content: '私密记忆', floor: 5, count: 1, timestamp: 1 }] },
        timeline: { entries: [{ id: 'tl_1', date: '第三天', text: '时间线正文', floor: 6, importance: 5, timestamp: 1 }] },
        suspense: { openItems: () => [{ id: 'sus_1', kind: 'suspense', content: '悬念正文', floor: 7 }],
            items: [{ id: 'sus_1', kind: 'suspense', content: '悬念正文', floor: 7 }], resolve() {} },
        status: {
            characters: { 甲: { fields: { 好感: '74' }, todos: [{ date: '第四天', text: '待办' }], life: [] } },
            protagonist: { gender: '男', age: '20', identity: '学生', floor: 3 },
            lifeDetails: [{ id: 'life_1', text: '生活档案', tier: 'active', floor: 8, createdAt: 1 }],
        },
        items: { records: [{ name: '物品甲' + String.fromCharCode(34) + '危险', holder: '甲', state: '完好', desc: '描述' }] },
        opLog: { entries: [{ seq: 1, ts: 1, type: 'summary', op: 'add', ref: 'sum_3', floor: 3, meta: '' }],
            stats: () => ({ total: 1, byType: { summary: 1 }, truncated: false, trimFields: false }),
            auditSummary: () => '窗口 1', recent: (n) => [{ seq: 1, ts: 1, type: 'summary', op: 'add', ref: 'sum_3', floor: 3, meta: '' }].slice(0, n) },
        conflicts: { conflicts: [] },
        deltaBook: { deltas: [{ summary: '增量事实甲', status: 'uncertain', evidenceFloor: 9, timestamp: 1 }], confirm: () => 1 },
        pulse: { beats: [{ floor: 1, polarity: 0.3, tension: 0.5, dominant: 'conflict', importance: 3, ts: 1 }] },
        ledger: { floors: {} },
        mutex: { locked: false, queueLength: 0 },
        bm25: { rebuild() {} },
        clock: {},
        prequel: { clearPrequel() {}, importPrequel: () => ({ ok: true, chars: 0 }) },
        storage: { _lastWrite: null, save: async () => true, load: async () => null },
        collectExport: () => ({}),
        getCurrentChatId: () => 'audit-chat',
        llm: {},
        /* ★ 关键：非空诊断载荷（逼出用 `esc` 的那几行；U1 的空载荷正是漏网处）。 */
        selfCheck: async () => ({
            errors: [{ tag: 'storage', msg: '写入被拒', hint: '检查配额', t: 1700000000000 }],
            stats: [{ k: '摘要', v: '1' }, { k: '向量', v: '1' }],
            time: 'now', version: '0.0.0',
            pipeline: { ok: false, note: '管线异常', hint: '看日志' },
            schema: { ok: false, missing: ['floorLedger'], hint: '补字段' },
        }),
        extractRolesFromLore: async () => [],
        getKnownCharacters: () => [],
        checkpointMenuItems: () => null,
        checkpointRestorePreviewLines: () => [],
        checkpointBranchesDiffLines: () => [],
        snapshotClearCoverage: () => null,
        listCheckpoints: () => ({ items: null }),
        clearRuntimeMemory: () => ({ ok: true, count: 0, failed: [], skipped: [] }),
        rebuildItems() {}, applyPrompts() {}, init() {}, getStats: () => ({})
    };
    return eng;
}

const UI_SRC = ui;
function boot() {
    const env = makeEnv();
    const engine = makeEngine();
    env.window.LonShaMemory = { VERSION: '0.0.0-audit', engine, config: { config: {} }, reportError() {}, _auditStack: [] };
    let loadError = null;
    try {
        const sandbox = vm.createContext(env.window);
        vm.runInContext(UI_SRC, sandbox, { filename: 'settings-ui.js' });
    } catch (e) { loadError = e; }
    return Object.assign(env, { engine, plugin: env.window.LonShaMemory, loadError });
}

const DEFECTS = [];
const NOTES = [];
const OBSERVED = { views: 0, items: 0, diagnoseFace: 0 };

/* ══════════ W1 诊断面板带数据驱动 ══════════ */
{
    const ctx = boot();
    if (ctx.loadError) DEFECTS.push('W1 UI 模块加载即抛：' + ctx.loadError.message);
    else {
        let threw = null;
        try {
            /* `showDiagnose` 是 async：面板在 **microtask** 里才挂上去。
             *  # 对同步读 DOM 的判据来说，不 await 就等于「还没渲染就问有没有」——
             *  # 那是观测姿势不对（shim 无错），不是源码缺陷。故此处**必须 await**。 */
            await ctx.plugin.showDiagnose.call(ctx.plugin);
        } catch (e) { threw = e; }
        if (threw) {
            DEFECTS.push('W1 showDiagnose **带数据**调用抛错（' + threw.constructor.name + ': ' + threw.message +
                '）—— 空数据下早退掩盖的那条路径，恰恰是真有诊断数据时用户会走的那条');
        } else {
            const ov = ctx.document.getElementById('lonsha-diag-overlay');
            if (!ov) DEFECTS.push('W1 showDiagnose 未把诊断面板挂进文档（没抛错 != 渲染出来了）');
            else {
                OBSERVED.diagnoseFace++;
                const txt = ov.textContent || '';
                if (txt.indexOf('存储') < 0 && txt.indexOf('storage') < 0) {
                    DEFECTS.push('W1 诊断面板里找不到已注入的错误行标签（夹具给了 errors[0].tag=storage）⇒ 错误面没被渲染');
                } else NOTES.push('W1 诊断面板真落 DOM：' + txt.replace(/\s+/g, ' ').trim().slice(0, 90));
            }
        }
    }
}

/* ══════════ W2/W3/W4 内容面板逐条目真驱动 ══════════ */
const VIEWS = ['summaries', 'timeline', 'povs', 'vectors', 'items', 'suspense', 'lockedfacts', 'deltas', 'protagonist'];
let totalClickable = 0;
let silentNoop = [];
let attrProblems = [];
{
    const ctx = boot();
    if (!ctx.loadError) {
        for (const vt of VIEWS) {
            /* 每个视图都从**干净文档**起步（真实用户也是一个个点开） */
            ctx.document.body.childNodes.slice().forEach((c) => ctx.document.body.removeChild(c));
            let bThrew = null;
            try { ctx.plugin.showBrowser.call(ctx.plugin, vt); } catch (e) { bThrew = e; }
            if (bThrew) { DEFECTS.push('W2 showBrowser("' + vt + '") 抛错：' + bThrew.constructor.name + ': ' + bThrew.message); continue; }
            const ov = ctx.document.getElementById('lonsha-browser-overlay');
            if (!ov) { DEFECTS.push('W2 showBrowser("' + vt + '") 未把面板挂进文档'); continue; }
            OBSERVED.views++;

            const items = ov.querySelectorAll('[data-opkind]');
            /* --- W5 提示诚实：提示的出现必须与本面板真有可点条目一致 --- */
            const hintPresent = (ov.textContent || '').indexOf('点击条目可操作') >= 0;
            if (hintPresent && items.length === 0) {
                DEFECTS.push('W5 视图 "' + vt + '" 一个可点条目都没有，却挂着「点击条目可操作」提示（把不可用说成可用）');
            }
            if (!hintPresent && items.length > 0) {
                NOTES.push('W5 注：视图 "' + vt + '" 有 ' + items.length + ' 个可点条目但未挂提示（保守，不判缺陷）');
            }

            for (const it of items) {
                totalClickable++;
                /* --- W4 寻址口在册：data-opid 必须**读得出来且非空** ---
                 *   注：`getAttribute` 与 `dataset` 在真浏览器与 shim 里读的都是**同一份已解码值**，
                 *   故「两者比对相等」是恒真的自我核对，**不构成判据**（首跑实测：它把「值里合法
                 *   含双引号」误报成「属性吞并」）。属性转义的判据是 W4b —— 拿夹具原名往返。 */
                const raw = it.getAttribute('data-opid');
                const viaDataset = it.dataset.opid;
                if (raw === null || raw === undefined || String(raw) === '') {
                    attrProblems.push(vt + '：data-opid 读不出来或为空（寻址口不在册）');
                }
                /* --- W2/W3 真点：必须弹出操作面板，不得静默无反应 --- */
                const before = ctx.document.getElementById('lonsha-memops-overlay');
                if (before && before.parentNode) before.parentNode.removeChild(before);
                try { it.click(); } catch (e) {
                    DEFECTS.push('W2 条目点击抛错（视图 ' + vt + '，opkind=' + it.dataset.opkind + '）：' + e.message);
                    continue;
                }
                const after = ctx.document.getElementById('lonsha-memops-overlay');
                if (!after) {
                    silentNoop.push(vt + '/' + it.dataset.opkind + '=' + String(viaDataset));
                } else {
                    OBSERVED.items++;
                    const head = (after.textContent || '').replace(/\s+/g, ' ').trim();
                    if (head.indexOf('记忆操作') < 0) {
                        DEFECTS.push('W2 视图 ' + vt + ' 的条目点了之后弹出了面板，但内容不像操作面板：' + head.slice(0, 60));
                    }
                }
            }
        }
    } else {
        DEFECTS.push('W2 UI 模块加载即抛：' + ctx.loadError.message);
    }
}

/* --- W4b 往返判据（夹具锚定，**双基准**）：物品名含双引号时，渲染出的条目必须能**按原名寻回**。
 *   为什么必须存在：D4（属性值缺引号转义）的症状是**属性在引号处提前闭合** —— 值被截断成
 *   残缺串。而 `getAttribute` 与 `dataset` 读的是**同一个已解码属性** ⇒ 两侧恒相等，
 *   故 W4 的「两侧比对」抓不住它；只有「拿夹具里的原名去对」才抓得住。
 *   两条基准一起用（任何单条都可能被观测姿势宽恕）：
 *     · DOM 基准：直读条目属性（shim 与浏览器在这一步读的是同一份已解码值）；
 *     · 文本基准：把条目序列化回标记文本、**再解析一遍** —— 真浏览器正是走这条路径
 *       （模板串 ⇒ `innerHTML` 赋值 ⇒ HTML 词法器），所以这条基准就是「浏览器看到的样子」。
 *   修前实测：两条基准都读回被吞并后的残缺串；修后都读回原名。 */
{
    const ctxQ = boot();
    ctxQ.plugin.showBrowser.call(ctxQ.plugin, 'items');
    const ovQ = ctxQ.document.getElementById('lonsha-browser-overlay');
    const want = '物品甲' + String.fromCharCode(34) + '危险';
    const itQ = ovQ ? ovQ.querySelectorAll('[data-opkind]')[0] : null;
    const viaDom = itQ ? String(itQ.getAttribute('data-opid')) : null;
    let viaMarkup = null;
    if (itQ) {
        const frag = new El('#frag');
        parseHTML(serialize(itQ), frag);
        const back = frag.childNodes.filter((c) => c instanceof El)[0] || null;
        viaMarkup = back ? String(back.getAttribute('data-opid')) : '(序列化后无法解析回元素)';
    }
    if (viaDom !== want || viaMarkup !== want) {
        DEFECTS.push('W4b 属性值往返失败：夹具物品名含双引号（' + want + '），DOM 基准读到 ' +
            JSON.stringify(viaDom) + '、文本基准读到 ' + JSON.stringify(viaMarkup) +
            ' —— 属性值未做引号转义，属性被提前闭合（属性吞并）');
    } else {
        NOTES.push('W4b 往返判据（双基准）：含双引号的物品名在 DOM 直读与序列化标记两条路径上都按原名寻回');
    }
}

if (silentNoop.length) {
    DEFECTS.push('W3 **静默无反应** ' + silentNoop.length + ' 处（点得动，点完什么都没发生）：' + silentNoop.join(' / ') +
        ' —— 典型根因是寻址口拿 DOM 属性（字符串）去比引擎侧原生值（数字/其他形状），`===` 恒 false 后函数静默 return');
}
if (attrProblems.length) {
    DEFECTS.push('W4 属性同一性问题 ' + attrProblems.length + ' 处：' + attrProblems.join(' / '));
} else if (totalClickable > 0) {
    NOTES.push('W4 寻址口在册：' + totalClickable + ' 个条目的 data-opid 均可读且非空（转义判据见 W4b）');
}

/* ══════════ W6 面自证（非零下限；抽到 0 不得算通过）══════════ */
const MIN_VIEWS = 5;
const MIN_CLICKABLE = 5;
if (OBSERVED.views < MIN_VIEWS) drift('只开到 ' + OBSERVED.views + ' 个内容视图（下限 ' + MIN_VIEWS + '）⇒ 枚举塌陷，拒绝给结论');
if (totalClickable < MIN_CLICKABLE) drift('只驱动到 ' + totalClickable + ' 个可点条目（下限 ' + MIN_CLICKABLE + '）⇒ 判据测不到东西，拒绝给结论');
if (OBSERVED.items < MIN_CLICKABLE) drift('真弹出操作面板的条目只有 ' + OBSERVED.items + ' 个（下限 ' + MIN_CLICKABLE + '）⇒ 拒绝给结论');

/* ══════════ 汇总 ══════════ */
NOTES.forEach((n) => console.log('  · ' + n));
console.log('  · 面自证：内容视图 ' + OBSERVED.views + ' 个 / 可点条目 ' + totalClickable + ' 个 / 弹面板 ' + OBSERVED.items + ' 个 / 诊断面 ' + OBSERVED.diagnoseFace + ' 个');
if (DEFECTS.length) {
    console.error('[ui-panel-drive] 检出 ' + DEFECTS.length + ' 处面板驱动缺陷：');
    DEFECTS.forEach((d) => console.error('  ✗ ' + d));
    process.exit(1);
}
console.log('[ui-panel-drive] 通过：诊断面板带数据真落 DOM，内容面板 ' + totalClickable + ' 个条目真点、' +
    '全部弹出操作面板（0 静默无反应），属性同一性与提示诚实均成立。');
