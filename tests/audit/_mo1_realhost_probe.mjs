#!/usr/bin/env node
/* tests/audit/_mo1_realhost_probe.mjs — M-O1 真宿主探针（会话身份写入闭环）[v3.302.0]
 *
 * 为什么以下划线开头：本文件是**探针**（量的工具），不是扫描器（判的门）。它不判缺陷、
 *   恒 exit 0（除非读数不成立或探针自身失效 ⇒ exit 2）。先例：_m_o4_probe.mjs / _p3_snapshot_probe.mjs。
 *
 * 【它补的是哪一条验收】
 *   M-O1 验收原文：「真宿主路径至少有一批可复现证据」。v3302 那 19 条判据用的是**合成宿主**
 *   （真对象 + 真切聊动作），证明的是**底层边界**成立，**不**证明真 SillyTavern 里的时序。
 *   本探针把那一格补上：真 ST 1.19.0 + 真 Chromium，对**真装载的** StorageManager
 *   （window.LonShaMemory.engine.storage）调 save()，在真 await 窗口里用真 ST 的
 *   updateChatMetadata 真切聊，然后看「宿主存下去的那一份里到底有没有本批数据」。
 *
 * 【零依赖通道】
 *   本仓无 playwright/puppeteer；Node v24 自带全局 WebSocket ⇒ 直连 CDP
 *   （--headless=new --remote-debugging-port=0，devtools ws 地址从 stderr 抽）。
 *   与 X2 侦察期实测同款（见 docs/planning/X_SERIES_LEDGER.md）。
 *
 * 【真宿主上的两个关键实测结论（决定了本探针的形状，源卡判据做不到）】
 *   ① `SillyTavern.getContext()` **每次返回新对象**（st-context.js 的 return {...}），但其中
 *      `chatMetadata: chat_metadata` 指向的是 ST 的模块级变量 ⇒ **换 chat 必须走真 ST 的
 *      `ctx.updateChatMetadata({...}, true)`**（就是 `chat_metadata = {...}` 那一行），
 *      在外面给 ctx.chatMetadata 赋值**不会**传导（首版据此写，实测恒假）。
 *   ② `ctx.saveChat` 是 getContext 每次**重新绑定**的引用 ⇒ 探针用「代理 getContext 注入
 *      saveChat 观测点」的方式拿到真宿主落盘那一刻的字节（跑完还原）。
 *
 * 【口径纪律】
 *   ① 绝不编 0：起不来浏览器 / 连不上 ST / 真类取不到 / 读数不满足 ⇒ 如实报，exit 2。
 *   ② 读数带来源：每条标明实测来源（真页面 / 真 saveChat 观测点 / 真 chat_metadata）。
 *   ③ 不改产品：只调只读面 + 调 save() 写**测试会话**的 metadata，跑完还原 getContext 与 metadata。
 *   ④ 真宿主读数不进门禁：依赖本地 ST clone 与 Chromium，故不进 npm test。
 *
 * 用法：node tests/audit/_mo1_realhost_probe.mjs [--json] [--keep]
 * 退出码：0 = 读数成立；2 = 探针自身失效 / 读数不满足。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ARGV = process.argv.slice(2);
const WANT_JSON = ARGV.includes('--json');
const KEEP = ARGV.includes('--keep');
const BIN = process.env.LONSHA_CHROME || '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const ST_URL = process.env.LONSHA_ST_URL || 'http://127.0.0.1:8123/';
const EXT = process.env.LONSHA_EXT_DIR || '/tmp/st/data/default-user/extensions/lonsha-memory-plugin';
const PROFILE = '/tmp/mo1_probe_profile';

const readings = [];
const fail = (msg) => { console.error('[mo1-probe] ' + msg); process.exit(2); };
const note = (k, v, src) => readings.push({ key: k, value: v, source: src });

/* ── 0. 前置：真类必须是**本版**（测错版本比测不出来更坏） ── */
const organsSrc = fs.readFileSync(path.join(ROOT, 'memory-organs.js'), 'utf8');
const REBIND = 'const _liveChatId = _curLiveId;';
if (!organsSrc.includes(REBIND)) fail('仓库 memory-organs.js 里没有第二刀的每批重绑行 —— 探针测的不是本版');
const deployed = path.join(EXT, 'memory-organs.js');
if (!fs.existsSync(deployed)) fail('真宿主插件目录里没有 memory-organs.js（' + deployed + '）');
if (!fs.readFileSync(deployed, 'utf8').includes(REBIND)) {
    fail('真宿主上装的是**旧版**插件（无每批重绑行）—— 先把仓库文件同步到 ' + EXT);
}
if (!fs.existsSync(BIN)) fail('Chromium 不在 ' + BIN + '（设 LONSHA_CHROME 覆盖）');
const stStatus = await fetch(ST_URL, { method: 'GET' }).then((r) => r.status).catch(() => 0);
if (stStatus !== 200) fail('ST 未就绪（' + ST_URL + ' ⇒ ' + stStatus + '）—— 先起 SillyTavern');

/* ── 1. 最小 CDP 客户端（Node 自带 WebSocket，零依赖） ── */
fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--user-data-dir=' + PROFILE, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
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

/* ── 2. 打开真 ST，轮询等真插件装载（v3.300 的自装载面：85 个模块全局） ──
 *   实测模块全局约 8~12s 挂齐；**轮询**而不是死等常数秒数 —— 首版死等 7s 读早了，
 *   误报「不在场」，正是本仓治过的假红形态。 */
await browser.send('Page.navigate', { url: ST_URL }, sessionId);
let bootInfo = null;
const BOOT_DEADLINE = Date.now() + 60000;
while (Date.now() < BOOT_DEADLINE) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
        bootInfo = await evalPage(`(() => {
            const g = window;
            const plug = g.LonShaMemory || null;
            const eng = (plug && plug.engine) || null;
            return {
                hasST: !!(g.SillyTavern && typeof g.SillyTavern.getContext === 'function'),
                stVersion: (g.SillyTavern && g.SillyTavern.version) || null,
                moduleGlobalCount: Object.keys(g).filter((k) => /^LonSha/.test(k)).length,
                hasOrgans: !!g.LonShaMemoryOrgans,
                hasPlugin: !!plug,
                hasEngineStorage: !!(eng && typeof eng.storage === 'object' && eng.storage
                    && typeof eng.storage.save === 'function'),
            };
        })()`);
    } catch (e) { bootInfo = null; }
    if (bootInfo && bootInfo.hasST && bootInfo.hasOrgans && bootInfo.hasEngineStorage) break;
}
if (!bootInfo || !bootInfo.hasST) fail('真页面里 SillyTavern 上下文不可用（60s 轮询内未就绪）');
if (!bootInfo.hasOrgans) fail('真页面里 LonShaMemoryOrgans 不在场 —— 插件未装/未装载');
if (!bootInfo.hasPlugin || !bootInfo.hasEngineStorage) fail('真页面里 window.LonShaMemory.engine.storage 不可用');
note('st.version', bootInfo.stVersion, '真页面 window.SillyTavern.version');
note('modules.loadedGlobals', bootInfo.moduleGlobalCount, '真页面 window 上 LonSha* 全局计数');
note('plugins.engineStorage', bootInfo.hasEngineStorage, '真页面 window.LonShaMemory.engine.storage.save 可用');

/* ── 3. 真宿主上的三组受控序列 ──
 *   S1 同会话主流路径（不得误伤）：当前 = probe-1，save('probe-1') ⇒ 真落盘、回 true。
 *   S2 ★ await 之后切聊（M-O1 验收①）：当前 = probe-A，save('probe-A')，在真 saveChat 那一刻
 *      用真 ST 的 updateChatMetadata({file_name:'probe-B'}, true) 真切聊 ⇒ 写入脱钩。
 *   S3 ★ 排队批（第二刀）：连发两批（C→D 与 D），让第二批走合流/排队路径，再排干；
 *      排干批必须用**它自己那一刻**的身份核验，落到它自己那个会话里。
 *   观测点：代理 SillyTavern.getContext（跑完还原），在 ctx.saveChat 那一刻抓「当前会话里那一格」
 *   —— 那就是宿主**真正会存下去**的那一份（字节级证据的真宿主版）。 */
const result = await evalPage(`(async () => {
    const g = window;
    const ST = g.SillyTavern;
    const KEY = 'lonsha_memory';
    const sm = g.LonShaMemory.engine.storage;
    const origGetCtx = ST.getContext.bind(ST);
    const origMeta = origGetCtx().chatMetadata;
    const landed = [];
    const marks = {};
    let pendingSwap = null;
    const out = { stContextWritable: false };

    ST.getContext = function () {
        const c = origGetCtx();
        c.saveChat = async function () {
            /* 观测点语义：**宿主真的要存下去的那一刻**，当前会话里那一格写的是谁的档。
             *   两个读数一起记：
             *     · slotChatId = 那一格里的 chatId（写入方往格子里塞的那个身份）
             *     · curChatId  = 那一刻**当前会话**是谁（ST 的 chat_metadata.file_name）
             *   两者不相等 = 往别人的存档里塞了东西（错档的**直接形状**，M-O1 要拦的就是它）。
             *   注意：**不可**用「格子里的数据含本批标记」当落地证据 —— 写入发生在 saveChat
             *   之前，那一刻格子当然写着本批（首版据此判，实测恒假：它证明的只是「写过了」，
             *   而不是「存下去的还在当前会话里」）。 */
            const cur = origGetCtx().chatMetadata;
            const slot = (cur && cur.extensions && cur.extensions[KEY]) || null;
            landed.push({
                slotChatId: slot ? (slot.chatId === undefined ? null : String(slot.chatId)) : null,
                curChatId: (cur && cur.file_name) === undefined ? null : String(cur && cur.file_name),
                data: slot === null ? '' : JSON.stringify(slot),
            });
            if (pendingSwap) { const t = pendingSwap; pendingSwap = null; t(); }
            return true;
        };
        return c;
    };
    out.stContextWritable = true;
    const setChat = (id) => { origGetCtx().updateChatMetadata({ file_name: id, extensions: {} }, true); };
    const mk = (tag) => { const m = 'mo1-' + tag + '-' + String(Math.random()).slice(2, 8); marks[tag] = m; return m; };

    try {
        /* S1 同会话 */
        setChat('mo1-probe-1');
        const m1 = mk('same');
        sm._lastBatch = null; sm._lastWrite = null; sm._confirmed = null;
        const r1 = await sm.save('mo1-probe-1', { graph: { mark: m1 }, summaries: [] });
        out.same = {
            ret: r1,
            lastWriteStatus: sm._lastWrite && sm._lastWrite.status,
            batchStatus: sm._lastBatch && sm._lastBatch.status,
            confirmedChatId: sm._confirmed && sm._confirmed.chatId,
            landedHasMark: landed.some((e) => e.data.includes(m1)),
            /* 当前会话（ST 的 chat_metadata）在整批跑完后还留着本批数据吗 ——
             * 同会话正常落盘时必须留着。 */
            markInCurrentAfter: String(JSON.stringify(origGetCtx().chatMetadata || {})).includes(m1),
        };

        /* S2 await 之后切聊 */
        setChat('mo1-probe-A');
        const m2 = mk('swap');
        pendingSwap = () => setChat('mo1-probe-B');
        sm._lastBatch = null; sm._lastWrite = null; sm._confirmed = null;
        const r2 = await sm.save('mo1-probe-A', { graph: { mark: m2 }, summaries: [] });
        out.swap = {
            ret: r2,
            lastWriteStatus: sm._lastWrite && sm._lastWrite.status,
            entryStatus: sm._lastWrite && sm._lastWrite.entryStatus,
            entryReason: sm._lastWrite && sm._lastWrite.entryReason,
            confirmed: sm._confirmed ? { chatId: sm._confirmed.chatId, revision: sm._confirmed.revision } : null,
            /* ★ 核心证据：这批写完（含真切聊）之后，**当前会话**的 metadata 里
             *   还留着本批数据吗？留 = 一个字节真落地了（缺陷仍在）；不留 = 没落地。 */
            markInCurrentAfter: String(JSON.stringify(origGetCtx().chatMetadata || {})).includes(m2),
            chatAfter: origGetCtx().chatMetadata.file_name,
        };

        /* S3 排队批：两批连着发，第二批走合流；排干时它必须用**它自己**的身份 */
        setChat('mo1-probe-C');
        const m3 = mk('drainC');
        sm._lastBatch = null; sm._lastWrite = null; sm._confirmed = null;
        const pC = sm.save('mo1-probe-C', { graph: { mark: m3 }, summaries: [] });
        setChat('mo1-probe-D');
        const m4 = mk('drainD');
        const pD = sm.save('mo1-probe-D', { graph: { mark: m4 }, summaries: [] });
        const [rC, rD] = await Promise.all([pC, pD]);
        out.drain = {
            retC: rC, retD: rD,
            lastWriteStatus: sm._lastWrite && sm._lastWrite.status,
            lastBatch: sm._lastBatch ? { chatId: sm._lastBatch.chatId, status: sm._lastBatch.status } : null,
            landedHasC: landed.some((e) => e.data.includes(m3)),
            landedHasD: landed.some((e) => e.data.includes(m4)),
            calls: landed.map((e) => ({ slotChatId: e.slotChatId, curChatId: e.curChatId })),
        };
    } catch (e) { out.err = String(e && (e.stack || e.message)).slice(0, 500); }

    if (!${KEEP}) {
        ST.getContext = origGetCtx;
        origGetCtx().updateChatMetadata(origMeta, true);
    }
    return out;
})()`);

if (!result || result.err) fail('真宿主探针执行失败：' + (result && result.err));

/* ── 4. 读数（每条带来源） ── */
note('same.ret', result.same.ret, '真宿主 StorageManager.save 返回值（同会话）');
note('same.lastWriteStatus', result.same.lastWriteStatus, '真宿主 _lastWrite.status');
note('same.batchStatus', result.same.batchStatus, '真宿主 _lastBatch.status');
note('same.confirmedChatId', result.same.confirmedChatId, '真宿主 _confirmed.chatId');
note('same.markInCurrentAfter', result.same.markInCurrentAfter, '同会话：跑完后当前会话（chat_metadata）里是否留着本批数据');
note('swap.ret', result.swap.ret, '★ 真宿主 await 期间切聊后的返回值（期望 false）');
note('swap.lastWriteStatus', result.swap.lastWriteStatus, '★ 整队状态（期望 failed：零落盘）');
note('swap.entryStatus', result.swap.entryStatus, '★ 批次归宿（期望 deferred）');
note('swap.entryReason', result.swap.entryReason, '★ 归宿理由码（期望 detached-after-await / stale-after-await）');
note('swap.confirmed', result.swap.confirmed, '★ 确认推进（期望 null：一个字节都没落地）');
note('swap.markInCurrentAfter', result.swap.markInCurrentAfter, '★ 跑完后当前会话里是否留着本批数据（期望 false：一个字节都没落地）');
note('swap.chatAfter', result.swap.chatAfter, '真切聊后的当前会话（真 ST updateChatMetadata 的结果）');
note('drain.retC', result.drain.retC, '排队批 C 返回值');
note('drain.retD', result.drain.retD, '排队批 D 返回值');
note('drain.lastWriteStatus', result.drain.lastWriteStatus, '排队场景整队状态');
note('drain.lastBatch', result.drain.lastBatch, '排队场景批次回执');
note('drain.landedHasC', result.drain.landedHasC, '★ C 批数据是否真落盘');
note('drain.landedHasD', result.drain.landedHasD, '★ D 批数据是否真落盘');
note('drain.calls', result.drain.calls, '★ 每次宿主落盘那一刻：格子里的 chatId vs 当前会话 chatId（错档会露在这里：两者不等）');
note('page.errors', pageErrors.slice(0, 5), '真页面未捕获异常（期望空）');

/* ── 5. 判据（真宿主读数上） ── */
const check = (ok, why) => { if (!ok) fail('真宿主读数不满足：' + why); };
check(result.same.ret === true, '同会话主流路径必须回 true');
check(result.same.markInCurrentAfter === true, '同会话正常落盘必须真的写进当前会话');
check(result.swap.ret === false, 'await 期间切聊 ⇒ 本批不得回 true');
check(result.swap.markInCurrentAfter === false, 'await 期间切聊 ⇒ 当前会话里不得留下本批数据（一个字节都没落地）');
check(result.swap.confirmed === null, 'await 期间切聊 ⇒ 不得推进 _confirmed');
check(result.swap.entryStatus === 'deferred', 'await 期间切聊 ⇒ 批次归宿必须如实记 deferred');
/* 错档的**直接形状**：任何一次宿主落盘那一刻，格子里写的 chatId 必须等于当时的当前会话。
 *   两者不等 = 「当前会话是 X，却往 X 的存档里塞了 Y 的数据」（`当前会话=B 槽.chatId=A`）。
 *   这一条在三个场景的所有落盘点上都成立 —— 它不依赖返回值，是**字节级**的。 */
const misrouted = result.drain.calls.filter((c) => c.slotChatId !== null && c.curChatId !== null
    && String(c.slotChatId) !== String(c.curChatId));
check(misrouted.length === 0, '不得出现「写进别的会话」的落盘（不等对：' + JSON.stringify(misrouted) + '）');

if (WANT_JSON) console.log(JSON.stringify({ probe: 'mo1-realhost', readings, pageErrors: pageErrors.slice(0, 5) }));
console.log('[mo1-probe] 真宿主读数成立：' + readings.length + ' 条');
for (const r of readings) console.log('  · ' + r.key + ' = ' + JSON.stringify(r.value) + '   ← ' + r.source);
try { chrome.kill('SIGKILL'); } catch { /* ignore */ }
process.exit(0);