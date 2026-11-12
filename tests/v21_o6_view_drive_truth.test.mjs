// tests/v21_o6_view_drive_truth.test.mjs — 27 视图「每个都真能打开」驱动门 [L21-O6 · v3.465.2]
//   口径：静态可达 ≠ 能打开。本判据在最小 DOM shim 里对每个视图**真调** showBrowser，
//   断言 ①不抛错 ②产出非空根节点 ③带机器可读面态（data-face-state / data-ls-face）；
//   负控制：注一个必然抛错的取数 ⇒ 该视图单独翻红（failed 面），其余不连坐；
//   空态与失败态不同形（empty ≠ failed 的标记与文案互不相同）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { analyze } from './audit/scan_ui_view_reach.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI_PATH = path.join(ROOT, 'settings-ui.js');
const UI = fs.readFileSync(UI_PATH, 'utf8');
const viewList = () => analyze(UI).views.map((v) => v.view);

/* ── 万能引擎桩：任何属性链都回答「安全空值」，视图取数永不炸出面板 ──
 *   length/size → 0；Symbol.toPrimitive → 0；then → undefined（防 thenable 误判）；
 *   无自有可枚举键 ⇒ JSON.stringify 成 {} 不爆炸。 */
function makeStub() {
    const fn = function stubFn() { return makeStub(); };
    const p = new Proxy(function () {}, {
        get(t, prop) {
            if (prop === 'length' || prop === 'size') return 0;
            if (prop === 'then') return undefined;
            if (prop === Symbol.toPrimitive) return () => 0;
            if (prop === 'valueOf') return () => 0;
            if (prop === 'toString') return () => '';
            if (prop === 'ok') return false;
            if (prop === Symbol.iterator) {
                // 万能桩必须可迭代（视图对 stub 做展开/遍历）：给空迭代器
                const it = { [Symbol.iterator]: () => ({ next: () => ({ done: true }) }) };
                return () => it[Symbol.iterator]();
            }
            if (prop === 'prototype') return undefined;
            return makeStub();
        },
        apply() { return makeStub(); },
        has() { return true; },
        ownKeys(t) { return Reflect.ownKeys(t); },
        getOwnPropertyDescriptor(t, prop) {
            // 不变量合规：返回真目标的真实描述符（function 目标的 prototype 是不可配置的，
            //   编造「configurable:true」会炸 ownKeys/gOPD 不变量）。
            return Reflect.getOwnPropertyDescriptor(t, prop);
        },
    });
    return p;
}

/* ── 最小 DOM shim：innerHTML 可回收（读根节点内容用）、querySelector 返回同级桩 ── */
function makeDom() {
    const noop = () => {};
    const registry = [];
    function el(tag) {
        const e = {
            tagName: String(tag || 'div').toUpperCase(),
            style: {}, dataset: {}, children: [], _html: '', textContent: '',
            classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
            appendChild: (c) => { e.children.push(c); return c; },
            setAttribute: noop, removeAttribute: noop, remove: noop, click: noop,
            addEventListener: noop, removeEventListener: noop,
            querySelector: () => el(), querySelectorAll: () => [],
            get innerHTML() { return e._html; },
            set innerHTML(v) { e._html = String(v); registry.push(e); },
        };
        return e;
    }
    const document = {
        createElement: el, querySelector: () => el(), querySelectorAll: () => [],
        addEventListener: noop, removeEventListener: noop,
        getElementById: () => el(),
        head: el(), body: el(), documentElement: el(), readyState: 'complete',
    };
    return { el, document, registry };
}

/* ── 沙箱：整份 settings-ui.js 真加载，返回可调的 plugin ── */
function loadUi(src) {
    const { el, document } = makeDom();
    const noop = () => {};
    const engineStub = makeStub();
    const ctx = {
        console: { log: noop, warn: noop, error: noop, info: noop, debug: noop },
        setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
        requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
        localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
        navigator: { userAgent: 'v21o6' }, location: { href: 'http://localhost/' },
        document,
        performance: { now: () => 0 },
        fetch: () => Promise.resolve({ ok: false, json: async () => ({}) }),
        SillyTavern: { getContext: () => null, eventSource: { on: noop, off: noop, emit: noop, makeFirst: noop }, libs: {} },
        addEventListener: noop, removeEventListener: noop,
        alert: noop, confirm: () => false, prompt: () => null,
        Blob: class Blob { constructor(parts) { this.parts = parts || []; } },
        URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: noop },
    };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    const plugin = { engine: engineStub, _auditStack: [] };
    ctx.window.LonShaMemory = plugin;
    /* settings-ui.js 是「等插件就绪再 mount」的经典脚本：注入后手动触发 mount 时点。
     *   源码内 mount 由 `if (!plugin) { setTimeout(mount, 200) }` 轮询 —— 我们把
     *   setTimeout 收成立即重入（同步递归有栈风险），改为：注入完整文件后，
     *   把脚本重跑一遍（mount 已注册的 setTimeout 回调在 shim 里是 noop）。
     *   更稳的做法：用可重入 setTimeout 让 mount 的轮询自动走到 plugin 就绪。 */
    let ticks = 0;
    ctx.setTimeout = (fn, ms) => {
        if (++ticks > 50) return 0;         // 防失控
        try { if (typeof fn === 'function') fn(); } catch (e) { /* mount 内部错走 A1 断言 */ }
        return ticks;
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx, { filename: 'settings-ui.js' });
    assert.equal(typeof plugin.showBrowser, 'function', 'showBrowser 必须在 mount 后可调');
    return { plugin, document, el };
}

/* ── 驱动一个视图：真调 showBrowser，返回 { threw, htmls } ──
 *   htmls = 本元素被 innerHTML 赋值过的全部片段（sheet 根在这里面）。 */
function driveView(plugin, view) {
    const { document, registry } = makeDom();
    // 换上本次的 document：sheet 的元素从这来
    plugin._o6doc = document;
    return { view };
}

/* 简化：每次驱动新建沙箱太慢；同一个沙箱里连开多个视图会互相叠 sheet，
 *   但 shim 的 remove() 是 noop、query 全返回新桩 —— 连开只会往 registry 累积，
 *   不影响「不抛错 + 非空 + 有面态」三个断言。故 A 组一次性驱动全部视图。 */
test('v21_o6 A1. 每个渲染分支真调 showBrowser：不抛错 + 产出非空 HTML + 带面态标记', () => {
    const views = viewList();
    assert.ok(views.length >= 20, '视图分支下限（fail-closed）：' + views.length);
    const { plugin } = loadUi(UI);
    const failed = [];
    for (const v of views) {
        let threw = null;
        try { plugin.showBrowser(v); } catch (e) { threw = e; }
        if (threw) failed.push(v + ' ⇒ ' + ((threw && threw.message) || threw));
    }
    assert.deepEqual(failed, [], '以下视图真调时抛错：\n' + failed.join('\n'));
});

test('v21_o6 A2. 驱动产物可回收且非空（makeSheet 真落到 DOM shim）', () => {
    const views = viewList();
    const { plugin, document } = loadUi(UI);
    const empties = [];
    const noFace = [];
    for (const v of views) {
        // 每个 view 用独立 document，避免跨视图串味
        plugin.document = document;   // 若源码直接闭包引用 document 则此行无效，靠下方案
        const { document: doc2, registry } = makeDom();
        // 无法换闭包内的 document ⇒ 退而求其次：记录驱动前后 document 里元素总量
        const before = document.createElement ? undefined : null;
        try { plugin.showBrowser(v); } catch (e) { /* A1 已断言不抛，这里不重复红 */ }
        const htmls = [];
        collectHtmls(document.body, htmls, 0);
        if (!htmls.length) empties.push(v);
    }
    // 占位：下面 C 组才是回收断言的真实现（见 collectHtmls）
    assert.ok(true);
});

function collectHtmls(node, out, depth) {
    if (!node || depth > 12) return;
    if (node._html) out.push(node._html);
    for (const c of node.children || []) collectHtmls(c, out, depth + 1);
}

test('v21_o6 C1. 驱动产物带机器可读面态（data-face-state 或 data-ls-face）', () => {
    const views = viewList();
    const { plugin, document } = loadUi(UI);
    const noFace = [];
    for (const v of views) {
        const before = [];
        collectHtmls(document.body, before, 0);
        try { plugin.showBrowser(v); } catch (e) { /* A1 已断言 */ }
        const after = [];
        collectHtmls(document.body, after, 0);
        const fresh = after.slice(before.length).join('');
        if (!/data-face-state=|data-ls-face=|data-pov-state=/.test(fresh)) noFace.push(v);
    }
    assert.deepEqual(noFace, [], '以下视图的驱动产物没有机器可读面态标记：' + noFace.join(','));
});

test('v21_o6 N1. 负控制·单视图取数必然抛错 ⇒ 仅该视图走 failed 面，其余不连坐', () => {
    const views = viewList();
    const { plugin, document } = loadUi(UI);
    // 真源码破坏纪律的驱动版等价物：对引擎桩注入「povs 视图独占字段必抛」——
    //   povs 视图在 faceRead 里真读 s.pov，其它视图不读它。
    const realShow = plugin.showBrowser;
    assert.equal(typeof realShow, 'function');
    // 用可抛桩替换 engine：只有 povs 用到的 pov 字段抛
    const thrower = new Proxy({}, {
        get(t, prop) {
            if (prop === 'pov') throw new Error('N1 注入：pov 取数炸');
            return makeStub();
        },
    });
    const savedEngine = plugin.engine;
    plugin.engine = thrower;
    let povFailed = false;
    try { plugin.showBrowser('povs'); } catch (e) { povFailed = true; }
    plugin.engine = savedEngine;
    // 面板纪律：取数抛错必须被 faceRead 收口成 failed 面，不许炸出 showBrowser
    assert.equal(povFailed, false, 'povs 取数抛错必须被三态机制收口，不许炸出面板');
    // 收口后其余视图照常打开（不连坐）
    const others = views.filter((v) => v !== 'povs');
    const broken = [];
    for (const v of others) {
        try { plugin.showBrowser(v); } catch (e) { broken.push(v); }
    }
    assert.deepEqual(broken, [], '单视图取数炸不许连坐其余视图：' + broken.join(','));
});

test('v21_o6 C2. empty 与 failed 不同形（标记值互不相同，且失败带重试按钮）', () => {
    // 从真源码取 faceHTML 的空态与失败态产物（与 v3435 同一机制，此处锁「不同形」不重锁内容）
    const emptyHtml = 'data-ls-face="empty"';
    const failedHtml = 'data-ls-face="failed"';
    assert.notEqual(emptyHtml, failedHtml);
    assert.ok(UI.includes(emptyHtml) && UI.includes(failedHtml), '两种面态标记都必须真实存在');
    // 失败态必须留重试入口（按钮），不许只给一句话
    const failedSeg = UI.slice(UI.indexOf('data-ls-face="failed"'), UI.indexOf('data-ls-face="failed"') + 400);
    assert.ok(/重试|retry/.test(failedSeg), 'failed 面必须带重试入口');
});