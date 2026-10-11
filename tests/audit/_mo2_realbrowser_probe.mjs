
/* ============================================================
 * tests/audit/_mo2_realbrowser_probe.mjs —— M-O2 真浏览器控件交互探针
 * ------------------------------------------------------------
 * 为什么存在（M-O2 原文第一条「真实浏览器与真宿主的控件交互回归」）：
 *   v3.287.0 交付的是**零依赖 DOM shim** 下的交互逻辑切片（scan_ui_interaction），
 *   v3.271.0 / v3.303.0 交付的是**同款 shim**下的入口实调与面板逐条驱动。
 *   三者共同的边界：它们是 shim，**不是真浏览器**——
 *   宿主 CSS 是否遮住控件、真实坐标点击是否命中、真实 localStorage 配额、
 *   Emulation 窄屏下是否仍是同一套控件、重开后是否真保留，全部未覆盖。
 *   本探针把那一格补上：真 Chromium（CDP 直连）+ 真 SillyTavern，
 *   用**真鼠标事件**点、**真键盘事件**改、**真 Emulation** 改宽度，
 *   读数一律回读**页面真状态**（config 对象 / localStorage / DOM 可见性）。
 *
 * 【零依赖通道】本仓无 playwright/puppeteer；Node v24 自带全局 WebSocket ⇒
 *   直连 CDP（--headless=new --remote-debugging-port=0，devtools ws 从 stderr 抽）。
 *   与 _mo1_realhost_probe.mjs 同款。
 *
 * 【口径纪律】
 *   ① 绝不编 0：起不来浏览器 / 连不上 ST / 插件未装载 / 读数不满足 ⇒ 如实报，exit 2。
 *   ② 读数带来源：每条标明实测来源（真页面 / 真鼠标 / 真 localStorage / 真 Emulation）。
 *   ③ 不改产品代码：只驱动 UI 入口 + 改一个可回滚的测试配置键，跑完还原。
 *   ④ 真宿主读数不进门禁：依赖本地 ST clone 与 Chromium，不进 npm test（`_` 前缀）。
 *   ⑤ 进程纪律：浏览器放独立进程组（detached），收尾按**进程组**收割。
 *
 * 用法：node tests/audit/_mo2_realbrowser_probe.mjs [--json] [--keep]
 * 退出码：0 = 读数成立；2 = 探针自身失效 / 读数不满足。
 * ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ARGV = process.argv.slice(2);
const WANT_JSON = ARGV.includes('--json');
const BIN = process.env.LONSHA_CHROME || '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const ST_URL = process.env.LONSHA_ST_URL || 'http://127.0.0.1:8123/';
const EXT = process.env.LONSHA_EXT_DIR || '/tmp/st/data/default-user/extensions/lonsha-memory-plugin';
const PROFILE = '/tmp/mo2_probe_profile';
const TEST_KEY = 'debugMode';

const readings = [];
let chromeProc = null;
/* ★ 探针自身纪律：中途 fail 也必须收割浏览器进程组 —— 否则失败的探针会**留下孤儿浏览器**，
 *   而留下的那个还占着调试端口与 profile，跑第二次时读数会落到上一次残留实例上
 *   （实测：不收割时第二次跑到的视口宽度仍是上次 Emulation 设过的 320 ——「探针污染下一次探针」）。 */
const reap = () => {
    if (!chromeProc) return;
    try { process.kill(-chromeProc.pid, 'SIGKILL'); } catch { /* 组可能已不存在 */ }
    try { chromeProc.kill('SIGKILL'); } catch { /* 兜底 */ }
    chromeProc = null;
};
const fail = (msg) => { console.error('[mo2-probe] ' + msg); reap(); process.exit(2); };
const note = (k, v, src) => readings.push({ key: k, value: v, source: src });

/* ── 0. 前置：真类必须是**本版**（测错版本比测不出来更坏） ── */
const repoManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
if (repoManifest.display_name !== 'LonSha记忆引擎') fail('仓库 manifest 不是本插件');
const VER = String(repoManifest.version);
const deployed = path.join(EXT, 'manifest.json');
if (!fs.existsSync(deployed)) fail('真宿主插件目录里没有 manifest.json（' + deployed + '）');
if (String(JSON.parse(fs.readFileSync(deployed, 'utf8')).version) !== VER) {
    fail('真宿主上装的是旧版插件（' + deployed + ' 非 ' + VER + '）—— 先同步仓库文件到 ' + EXT);
}
if (!fs.existsSync(BIN)) fail('Chromium 不在 ' + BIN + '（设 LONSHA_CHROME 覆盖）');
const stStatus = await fetch(ST_URL, { method: 'GET' }).then((r) => r.status).catch(() => 0);
if (stStatus !== 200) fail('ST 未就绪（' + ST_URL + ' => ' + stStatus + '）—— 先起 SillyTavern');

/* ── 1. 最小 CDP 客户端（Node 自带 WebSocket，零依赖） ── */
fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = chromeProc = spawn(BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--user-data-dir=' + PROFILE, '--window-size=1280,900', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let errBuf = '';
const wsUrl = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('起浏览器超时（30s）')), 30000);
    chrome.stderr.on('data', (d) => {
        errBuf += d.toString();
        const m = /ws:\/\/[^\s]+/.exec(errBuf);
        if (m) { clearTimeout(t); res(m[0]); }
    });
    chrome.on('exit', (c) => { clearTimeout(t); rej(new Error('浏览器提前退出 code=' + c)); });
}).catch((e) => fail(String(e.message) + ' | stderr: ' + errBuf.slice(0, 300)));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
    static async connect(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('ws 连接失败')), { once: true });
        });
        const c = new CDP(ws);
        ws.addEventListener('message', (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch { return; }
            if (m.id != null && c.pending.has(m.id)) {
                const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
                if (m.error) rej(new Error(JSON.stringify(m.error))); else res(m.result);
            }
        });
        return c;
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id;
        return new Promise((res, rej) => {
            this.pending.set(id, { res, rej });
            this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
            setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error(method + ' 超时')); } }, 60000);
        });
    }
}
const browser = await CDP.connect(wsUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
await browser.send('Page.enable', {}, sessionId);
await browser.send('Runtime.enable', {}, sessionId);
await browser.send('DOM.enable', {}, sessionId);
const pageErrors = [];
browser.ws.addEventListener('message', (ev) => {
    try {
        const m = JSON.parse(ev.data);
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params && m.params.exceptionDetails;
            pageErrors.push((d && ((d.exception && d.exception.description) || d.text)) || 'unknown');
        }
    } catch { /* ignore */ }
});
async function evalPage(expr) {
    const r = await browser.send('Runtime.evaluate', {
        expression: expr, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true,
    }, sessionId);
    if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('页面求值抛错：' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result ? r.result.value : undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 2. 真鼠标 / 真键盘（CDP Input 域，不是 JS 合成事件） ── */
async function boxOf(sel) {
    return evalPage(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return { x: r.x, y: r.y, w: r.width, h: r.height, vis: st.visibility, disp: st.display, op: st.opacity };
    })()`);
}
async function clickAt(x, y) {
    const p = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p }, sessionId);
    await browser.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...p }, sessionId);
    await browser.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...p }, sessionId);
}
async function realClick(sel) {
    const b = await boxOf(sel);
    if (!b) return { ok: false, why: 'not-found' };
    if (b.w <= 0 || b.h <= 0) return { ok: false, why: 'zero-size' };
    if (b.vis === 'hidden' || b.disp === 'none') return { ok: false, why: 'not-visible:' + b.vis + '/' + b.disp };
    await clickAt(b.x + b.w / 2, b.y + b.h / 2);
    return { ok: true, box: b };
}
/* ★ 只有真浏览器会暴露的一格：长面板里控件可能在**折叠线以下** ——
 *   此时 getBoundingClientRect 给出的是「文档里的位置」而非「视口内可点位置」，
 *   Input.dispatchMouseEvent 的坐标是视口坐标 ⇒ 直接点会点到视口外、什么都不发生。
 *   shim 门里没有视口概念，所以这一类**结构上就测不出来**。
 *   故：点之前先把目标滚进视野，再重测坐标。 */
async function scrollIntoCenter(sel) {
    return evalPage(`(() => {
        const el = document.querySelector(${JSON.stringify(sel)});
        if (!el) return false;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        return true;
    })()`);
}
async function realClickScrolled(sel) {
    await scrollIntoCenter(sel);
    await sleep(250);
    const b = await boxOf(sel);
    if (!b) return { ok: false, why: 'not-found' };
    const inView = b.y >= 0 && (b.y + b.h) <= (await evalPage('window.innerHeight'));
    await clickAt(b.x + b.w / 2, b.y + b.h / 2);
    return { ok: true, box: b, inView };
}
async function keyPress(key, code, keyCode) {
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }, sessionId);
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }, sessionId);
}

/* ── 3. 打开真 ST，轮询等真插件装载 ── */
await browser.send('Page.navigate', { url: ST_URL }, sessionId);
let boot = null;
const DL = Date.now() + 60000;
while (Date.now() < DL) {
    await sleep(1500);
    try {
        boot = await evalPage(`(() => {
            const g = window; const p = g.LonShaMemory;
            return {
                hasST: !!(g.SillyTavern && typeof g.SillyTavern.getContext === 'function'),
                globals: Object.keys(g).filter((k) => /^LonSha/.test(k)).length,
                hasPlugin: !!p,
                hasFab: !!document.getElementById('lonsha-memory-fab'),
                hasUI: !!(p && typeof p.showSettingsPanel === 'function'),
            };
        })()`);
    } catch (e) { boot = null; }
    if (boot && boot.hasST && boot.hasPlugin && boot.hasFab && boot.hasUI) break;
}
if (!boot || !boot.hasST) fail('真页面里 SillyTavern 上下文不可用（60s 轮询内未就绪）');
if (!boot.hasPlugin) fail('真页面里 window.LonShaMemory 不在场 —— 插件未装/未装载');
if (!boot.hasFab) fail('真页面里 #lonsha-memory-fab 不在场 —— FAB 入口未挂');
note('boot.stVersion', await evalPage('(window.SillyTavern && window.SillyTavern.version) || null'), '真页面 window.SillyTavern.version');
note('boot.globals', boot.globals, '真页面 window 上 LonSha* 全局计数');

/* ── 4. 真装载面读数（本版关键：extra_js 96/96） ── */
const load = await evalPage(`(() => {
    const p = window.LonShaMemory;
    const l = p._extraJsLoad || {};
    const mf = ${JSON.stringify(repoManifest)};
    return {
        status: l.status, okCount: l.okCount, triedCount: l.triedCount,
        fail: (l.fail || []).map((f) => f.file + ':' + f.why).slice(0, 5),
        manifestCount: mf.extra_js.length,
        scripts: document.querySelectorAll('script[src*="lonsha-memory-plugin"]').length,
        version: p.VERSION,
        preferModuleFiles: p.engine.config.config.preferModuleFiles,
        configKeys: Object.keys(p.engine.config.config).length,
    };
})()`);
note('load.extraJsStatus', load.status, '真页面 plugin._extraJsLoad.status');
note('load.extraJsOk', load.okCount + '/' + load.triedCount, '真页面 plugin._extraJsLoad.okCount/triedCount');
note('load.manifestExtraJs', load.manifestCount, '仓库 manifest.extra_js 项数（与真装载数对账）');
note('load.scriptTags', load.scripts, '真页面 script[src*=lonsha-memory-plugin] 计数');
note('load.globals', boot.globals, '真页面 LonSha* 全局数');
note('load.version', load.version, '真页面 plugin.VERSION');
note('load.configKeys', load.configKeys, '真页面 config 键数（≡181 表示装的是真实现）');
note('load.fail', load.fail, '真页面装载失败项（期望空）');

/* ── 5. 真鼠标开面板：点 FAB → 点菜单「设置」 ── */
const fabInfo = await boxOf('#lonsha-memory-fab');
const fabClick = await realClick('#lonsha-memory-fab');
await sleep(400);
const menu = await evalPage(`(() => {
    const m = document.getElementById('lonsha-fab-menu');
    if (!m) return null;
    return { items: Array.from(m.querySelectorAll('.lsm-item')).map((e) => e.dataset.act) };
})()`);
note('fab.clicked', fabClick.ok, '真鼠标点击 #lonsha-memory-fab（坐标来自 getBoundingClientRect）');
note('fab.menuItems', menu ? menu.items : null, '真点击后 #lonsha-fab-menu 的 data-act 列表');
if (!menu) fail('真鼠标点击 FAB 后快捷菜单未出现（#lonsha-fab-menu 不在场）');

const setItemBox = await evalPage(`(() => {
    const el = document.querySelector('#lonsha-fab-menu .lsm-item[data-act="settings"]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
if (!setItemBox) fail('快捷菜单里没有 data-act=settings 项');
await clickAt(setItemBox.x, setItemBox.y);
await sleep(700);
const panel = await evalPage(`(() => {
    const ov = document.getElementById('lonsha-settings-overlay');
    if (!ov) return null;
    const cnt = (s) => ov.querySelectorAll(s).length;
    const save = ov.querySelector('#ls-save');
    const sr = save ? save.getBoundingClientRect() : null;
    return {
        mounted: true,
        checkboxes: cnt('[data-cfg]'),
        sliders: cnt('[data-cfg-num]'),
        texts: cnt('[data-cfg-text]'),
        saveFound: !!save,
        saveBox: sr ? { x: sr.x + sr.width / 2, y: sr.y + sr.height / 2, w: sr.width, h: sr.height } : null,
        saveVisible: sr ? (sr.width > 0 && sr.height > 0) : false,
    };
})()`);
note('panel.viaRealMenuClick', panel ? panel.mounted : false, '真鼠标「FAB → 设置」后 #lonsha-settings-overlay 真落 DOM');
if (!panel) fail('真鼠标点菜单「设置」后面板未落 DOM');
note('panel.checkboxes', panel.checkboxes, '面板内 [data-cfg] 控件数');
note('panel.sliders', panel.sliders, '面板内 [data-cfg-num] 控件数');
note('panel.texts', panel.texts, '面板内容 [data-cfg-text] 控件数');
note('panel.saveVisible', panel.saveVisible, '#ls-save 真可见（宽高 > 0）');

/* ── 6. 真鼠标改一个 checkbox（含可回滚还原） ── */
const before = await evalPage(`(() => { const c = window.LonShaMemory.engine.config.config; return { dom: document.querySelector('[data-cfg="${TEST_KEY}"]').checked, cfg: !!c['${TEST_KEY}'] }; })()`);
await realClickScrolled('[data-cfg="' + TEST_KEY + '"]');
await sleep(200);
const afterClick = await evalPage(`(() => ({ dom: document.querySelector('[data-cfg="${TEST_KEY}"]').checked }))()`);
note('checkbox.beforeDom', before.dom, '真鼠标点击前该 checkbox 的 checked');
note('checkbox.afterDom', afterClick.dom, '真鼠标点击后该 checkbox 的 checked');
note('checkbox.toggled', before.dom !== afterClick.dom, '真鼠标点击是否真改变了控件状态');
if (before.dom === afterClick.dom) fail('真鼠标点击 checkbox 未改变其状态（控件不可操作）');

/* ── 7. 真鼠标点保存 → 回读 config 与 localStorage ── */
if (!panel.saveBox) fail('#ls-save 不在面板里');
const saveClick = await realClickScrolled('#ls-save');
await sleep(500);
if (!saveClick.ok) fail('#ls-save 真点击失败：' + saveClick.why);
note('save.clickedInView', saveClick.inView, '保存按钮点击时是否真在视口内（长面板折叠线探测）');
const saved = await evalPage(`(() => {
    const raw = window.localStorage.getItem('lonsha_memory_config');
    let parsed = null; try { parsed = JSON.parse(raw || 'null'); } catch (e) { parsed = null; }
    return {
        lsLen: raw ? raw.length : 0,
        keyPresent: !!parsed && Object.prototype.hasOwnProperty.call(parsed, '${TEST_KEY}'),
        value: parsed ? parsed['${TEST_KEY}'] : null,
        overlayGone: !document.getElementById('lonsha-settings-overlay'),
    };
})()`);
note('save.lsBytes', saved.lsLen, '真页面 localStorage[lonsha_memory_config] 字节数（点击 #ls-save 后）');
note('save.valueInStorage', saved.value, '真落盘的 ' + TEST_KEY + ' 值');
note('save.overlayClosed', saved.overlayGone, '保存后面板是否自行关闭');
if (saved.lsLen <= 0) fail('真鼠标点「保存设置」后 localStorage 一字未写（保存路径在真宿主上不生效）');
if (saved.value !== afterClick.dom) fail('落盘值与控件状态不一致（保存未把控件值写进配置）');

/* ── 8. 重开保留：真点击重开面板，控件须保持上次落盘值 ── */
await realClick('#lonsha-memory-fab');
await sleep(400);
const setItem2 = await evalPage(`(() => { const el = document.querySelector('#lonsha-fab-menu .lsm-item[data-act="settings"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (!setItem2) fail('第二次打开快捷菜单失败');
await clickAt(setItem2.x, setItem2.y);
await sleep(700);
const reopen = await evalPage(`(() => {
    const ov = document.getElementById('lonsha-settings-overlay');
    if (!ov) return null;
    const el = ov.querySelector('[data-cfg="${TEST_KEY}"]');
    return { checked: el ? el.checked : null, mounted: true };
})()`);
note('reopen.mounted', reopen ? reopen.mounted : false, '重开后 #lonsha-settings-overlay 是否真落 DOM');
note('reopen.checked', reopen ? reopen.checked : null, '重开后该 checkbox 的 checked（应等于落盘值）');
if (!reopen) fail('重开面板失败（第二次真点击后 overlay 不在场）');
if (reopen.checked !== afterClick.dom) fail('重开后控件未保留落盘值（重开保留不成立）');

/* ── 9. 真键盘改一个文本输入（真鼠标聚焦 + 真键盘输入） ── */
const txtSel = '[data-cfg-text="embeddingModel"]';
let typed = { ran: false };
const txtClick = await realClickScrolled(txtSel);
if (txtClick.ok) {
    await sleep(200);
    const focused = await evalPage('(() => { const a = document.activeElement; return a ? (a.tagName + (a.dataset && a.dataset.cfgText ? "#" + a.dataset.cfgText : "")) : null; })()');
    /* 真键盘：CDP Input.insertText 走真实输入管线（非 JS 赋值） */
    await browser.send('Input.insertText', { text: 'mo2-probe-model' }, sessionId);
    await sleep(250);
    const val = await evalPage(`(() => { const el = document.querySelector(${JSON.stringify(txtSel)}); return el ? el.value : null; })()`);
    typed = { ran: true, ok: val === 'mo2-probe-model', focused, val };
    note('input.focused', focused, '真鼠标滚入并点击后 document.activeElement');
    note('input.valueAfterRealTyping', val, '真键盘（CDP Input.insertText）输入后的控件值');
    if (focused !== 'INPUT#' + txtSel.slice(txtSel.indexOf('"') + 1, txtSel.lastIndexOf('"'))) {
        note('input.focusNote', 'activeElement 与目标不一致', '如实登记（可能被面板焦点管理重定向）');
    }
} else {
    note('input.focusSkipped', txtClick.why, '目标输入控件不可点（如实登记，不当作通过）');
}

/* ── 10. 真 Emulation 窄屏（320px）：控件仍须在场且可见 ── */
await browser.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true }, sessionId);
await sleep(400);
const narrowRaw0 = await evalPage('({ w: window.innerWidth, h: window.innerHeight })');
const narrow = await evalPage(`(() => {
    const ov = document.getElementById('lonsha-settings-overlay');
    if (!ov) return null;
    const boxes = (s) => Array.from(ov.querySelectorAll(s)).filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length;
    const all = Array.from(ov.querySelectorAll('[data-cfg], [data-cfg-num]'));
    const over = all.filter((e) => { const r = e.getBoundingClientRect(); return !(r.left >= -1 && r.right <= window.innerWidth + 1); });
    const overInfo = over.slice(0, 5).map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, key: e.dataset.cfg || e.dataset.cfgNum || null, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), parentCls: e.parentElement ? e.parentElement.className : null }; });
    return { innerWidth: window.innerWidth, visibleCheckboxes: boxes('[data-cfg]'), visibleSliders: boxes('[data-cfg-num]'), inView: all.length - over.length, total: all.length, overInfo };
})()`);
note('narrow.innerWidth', narrow ? narrow.innerWidth : null, '真 Emulation 宽度（320）');
note('narrow.visibleControls', narrow ? (narrow.visibleCheckboxes + '/' + narrow.visibleSliders) : null, '320px 下仍可见的 checkbox/slider 数');
note('narrow.inViewOfControls', narrow ? (narrow.inView + '/' + narrow.total) : null, '320px 下横向落在视口内的控件数/总数');
note('narrow.overflow', narrow ? narrow.overInfo : null, '320px 下横向溢出视口的控件（报告项，逐项点名形态）');
if (!narrow || narrow.innerWidth !== 320) fail('真 Emulation 未把视口改成 320px');
if (narrow.visibleCheckboxes === 0 || narrow.visibleSliders === 0) fail('320px 窄屏下控件不可见（面板未做窄屏适配）');
await browser.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);

/* ── 11. 还原测试改动（只还原测试键，不动其余） ── */
if (!ARGV.includes('--keep')) {
    await evalPage(`(() => {
        const c = window.LonShaMemory.engine.config.config;
        c['${TEST_KEY}'] = ${JSON.stringify(before.cfg)};
        try { window.LonShaMemory.engine.config.saveConfig(); } catch (e) { /* 还原失败如实可见 */ }
        return c['${TEST_KEY}'];
    })()`);
}
note('page.errors', pageErrors.slice(0, 5), '真页面未捕获异常（期望空）');

/* ── 12. 判据（真读数上） ── */
const check = (ok, why) => { if (!ok) fail('真浏览器读数不满足：' + why); };
check(load.status === 'ok', 'extra_js 装载面必须 ok（实 ' + load.status + '）');
check(load.okCount === load.manifestCount, '真装载数必须等于 manifest.extra_js 项数（实 ' + load.okCount + '/' + load.manifestCount + '）');
check(load.fail.length === 0, '不得有装载失败项（实 ' + JSON.stringify(load.fail) + '）');
check(load.configKeys > 100, 'config 必须由真实现提供（键数 > 100，实 ' + load.configKeys + '）');
check(menu.items.length >= 7, '快捷菜单实项数须 >= 7（实 ' + menu.items.length + '）');
check(typeof typed.ok !== 'undefined', '输入控件探测必须执行');
check(pageErrors.length === 0, '真页面不得有未捕获异常（实 ' + pageErrors.length + '）');

if (WANT_JSON) console.log(JSON.stringify({ probe: 'mo2-realbrowser', readings, pageErrors: pageErrors.slice(0, 5) }));
console.log('[mo2-probe] 真浏览器读数成立：' + readings.length + ' 条');
for (const r of readings) console.log('  · ' + r.key + ' = ' + JSON.stringify(r.value) + '   <- ' + r.source);
reap();
process.exit(0);
