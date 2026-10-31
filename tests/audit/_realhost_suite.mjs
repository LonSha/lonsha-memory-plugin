/* ============================================================
 * tests/audit/_realhost_suite.mjs —— L12-O5 真实宿主最小回归集
 * ------------------------------------------------------------
 * 【为什么存在（计划原文，实测支撑）】
 *   本仓「诚实边界」连四版写着「仍未跑真实 SillyTavern UI」，而仓里其实**已经**有两份
 *   零依赖 CDP 探针：`_mo1_realhost_probe.mjs`（真宿主写盘闭环）与
 *   `_mo2_realbrowser_probe.mjs`（真浏览器控件交互）。问题不在能力，在**入口与落盘**：
 *     · 它们要人记得跑、要人手工看输出；
 *     · 读数不落盘 ⇒ 下一版写 CHANGELOG 时又要凭记忆说「跑过了」；
 *     · 每条探针只回答自己那一格，没有「一次跑完三条最小回归」的地方。
 *   本文件把三条合成**一条命令**，并把读数落到 `tests/audit/realhost_readings.json`。
 *
 * 【三条最小回归（各自独立成块，互不掩盖）】
 *   ① **装载面**：真页面里 `LonSha*` 全局数 ≥ 85、`_extraJsLoad.status === 'ok'`、
 *      未捕获异常为空。它回答的是「插件在真宿主里到底装起来没有」——
 *      v3.300.0 之前宿主根本不加载 extra_js，这类失效只有真宿主能看见。
 *   ② **写盘闭环**（M-O1 的五态 + 字节级错档）：同会话真落盘、await 期间真切聊、
 *      排队批。判据落在**宿主真要存下去的那一刻**（代理 `getContext().saveChat`），
 *      而不是「格子里的数据含本批标记」——后者证明的只是「写过了」。
 *   ③ **世界线纪元**：真宿主里造 α线 1–39 → β线 40–46 → **回跳 α线 47–87**，
 *      断言第 60 楼看第 5 楼是 `blocked`。v3.426.0 的自动推进修法在**无头仿真**里成立，
 *      本块要它在**真宿主**上也成立（这是计划点名的那一格）。
 *
 * 【为什么下划线开头】本文件是**探针**（量的工具），不是扫描器（判的门）。
 *   它不进 `npm test`（`tests/run.mjs` 只发现 `*.test.mjs`；`tests/audit/` 侧
 *   run.mjs 与多数门禁都排除 `_` 前缀）。先例：`_mo1_realhost_probe.mjs` /
 *   `_mo2_realbrowser_probe.mjs` / `_m_o4_probe.mjs`。
 *
 * 【口径纪律（沿用两份前身，逐条写下来防走回头路）】
 *   ① **绝不编 0**：起不来浏览器 / 连不上 ST / 插件未装载 ⇒ 如实报 exit 2，
 *      不写一份「读数看起来正常」的 JSON。
 *   ② **读数带来源**：每条标明实测来源（真页面 / 真 saveChat 观测点 / 真 chat_metadata）。
 *   ③ **不改产品**：只调只读面 + 调 save() 写**测试会话**的 metadata 与一段临时配置，
 *      跑完逐字还原（含 restore 失败也要记一条，不许静默）。
 *   ④ **三档退出码**：0 = 三块全成立；1 = 读数成立但**发现真缺陷**；
 *      2 = 环境缺失 / 探针自身失效（拒绝给结论）。
 *   ⑤ **进程纪律**（由 `scan_process_reaping.mjs` 当场点名）：浏览器放**独立进程组**
 *      （`detached: true`），收尾按**进程组**收割（`process.kill(-pid)`），
 *      与 `tests/run.mjs` 的 killGroup 同形。**连 fail 路径也必须收割** ——
 *      失败的探针若留下孤儿浏览器，下一次跑到的会是上一次的残留实例（前身踩过）。
 *   ⑥ **不抄前身的 helper**：本文件与两份前身**刻意各持一份** CDP 通道（见
 *      `v3284_o7_audit_copy_ledger` 的同款登记理由：让一份证据通道 import 另一份，
 *      会把两套会话/端口假设耦在一起）。但为了不制造**新的逐字副本簇**，
 *      本文件的求值 helper 与两份前身**形状不同**（类方法 + 不同签名），
 *      不给 `v3284` 的 B1「新增未登记簇」添一条假账。
 *
 * 用法：node tests/audit/_realhost_suite.mjs [--json] [--keep] [--block=load|write|worldline]
 * 退出码：0 = 三块读数全成立；1 = 读数成立但检出真缺陷；2 = 环境缺失 / 探针自身失效。
 * ============================================================ */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeLoad, judgeWrite, judgeWorldline, judgePageErrors } from './_realhost_judge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ARGV = process.argv.slice(2);
const WANT_JSON = ARGV.includes('--json');
const KEEP = ARGV.includes('--keep');
const ONE = (ARGV.find((a) => a.startsWith('--block=')) || '').split('=')[1] || '';
const BIN = process.env.LONSHA_CHROME || '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const ST_URL = process.env.LONSHA_ST_URL || 'http://127.0.0.1:8123/';
const EXT = process.env.LONSHA_EXT_DIR || '/tmp/st/data/default-user/extensions/lonsha-memory-plugin';
const PROFILE = '/tmp/realhost_suite_profile';
const OUT_JSON = path.join(HERE, 'realhost_readings.json');

const readings = [];
const defects = [];
let cdpProc = null;

/** 进程组收割（⑥）：组杀 + 直接子进程兜底，可重复调用。 */
function reap() {
    if (!cdpProc) return;
    try { process.kill(-cdpProc.pid, 'SIGKILL'); } catch { /* 组可能已不存在 */ }
    try { cdpProc.kill('SIGKILL'); } catch { /* 兜底 */ }
    cdpProc = null;
}
/** 环境缺失 / 探针失效 ⇒ exit 2（**不给结论**）。 */
function bail(msg) {
    console.error('[realhost] 环境缺失或探针失效：' + msg);
    reap();
    process.exit(2);
}
const note = (block, key, value, source) => readings.push({ block, key, value, source });
/** 真缺陷：读数成立但结论是坏的 ⇒ exit 1。 */
const flag = (block, msg) => defects.push({ block, msg });
const nap = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 0. 前置：仓库 / 部署 / 浏览器 / ST 四件都在，否则 exit 2（不猜） ── */
let repoVersion = '';
try {
    repoVersion = String(JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version);
} catch (_e) { bail('仓库 manifest.json 读不到（工作目录可能不对：' + ROOT + '）'); }
const deployedManifest = path.join(EXT, 'manifest.json');
if (!fs.existsSync(deployedManifest)) bail('真宿主插件目录里没有 manifest.json（' + deployedManifest + '）');
let deployedVersion = '';
try { deployedVersion = String(JSON.parse(fs.readFileSync(deployedManifest, 'utf8')).version); }
catch (_e) { bail('真宿主插件 manifest.json 解析失败：' + deployedManifest); }
if (deployedVersion !== repoVersion) {
    /* 测旧版比测不出来更坏：读数会挂到错误版本的账上。 */
    bail('真宿主装的是 ' + deployedVersion + '，仓库是 ' + repoVersion + ' —— 先把仓库文件同步到 ' + EXT);
}
if (!fs.existsSync(BIN)) bail('Chromium 不在 ' + BIN + '（设 LONSHA_CHROME 覆盖）');
const stStatus = await fetch(ST_URL, { method: 'GET' }).then((r) => r.status).catch(() => 0);
if (stStatus !== 200) bail('ST 未就绪（' + ST_URL + ' ⇒ ' + stStatus + '）—— 先起 SillyTavern');
note('pre', 'version', repoVersion, '仓库 manifest.version（与真宿主部署版本逐字相同）');

/* ── 1. 最小 CDP 客户端（Node 自带 WebSocket，零依赖） ──
 *   与两份前身**不同形**：这里用类方法 `call()` + 显式 sessionId 参数，
 *   求值口另有 `evaluate()` 包装 —— 刻意不制造第三份逐字相同的 `evalPage` 体。 */
fs.rmSync(PROFILE, { recursive: true, force: true });
const cdpProcRef = spawn(BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', '--user-data-dir=' + PROFILE, '--window-size=1280,900', 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
cdpProc = cdpProcRef;
let stderrBuf = '';
const wsEndpoint = await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('起浏览器超时（30s）')), 30000);
    cdpProcRef.stderr.on('data', (chunk) => {
        stderrBuf += chunk.toString();
        const hit = /ws:\/\/[^\s]+/.exec(stderrBuf);
        if (hit) { clearTimeout(timer); res(hit[0]); }
    });
    cdpProcRef.on('exit', (code) => { clearTimeout(timer); rej(new Error('浏览器提前退出 code=' + code)); });
}).catch((e) => bail(String(e.message) + ' | stderr: ' + stderrBuf.slice(0, 300)));

class Wire {
    constructor(ws) { this.ws = ws; this.seq = 0; this.waiting = new Map(); }
    static async open(url) {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('ws 连接失败')), { once: true });
        });
        const w = new Wire(ws);
        ws.addEventListener('message', (ev) => {
            let msg; try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg.id != null && w.waiting.has(msg.id)) {
                const slot = w.waiting.get(msg.id); w.waiting.delete(msg.id);
                if (msg.error) slot.rej(new Error(JSON.stringify(msg.error))); else slot.res(msg.result);
            }
        });
        return w;
    }
    call(method, params = {}, sessionId) {
        const id = ++this.seq;
        return new Promise((res, rej) => {
            this.waiting.set(id, { res, rej });
            this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
            setTimeout(() => {
                if (this.waiting.has(id)) { this.waiting.delete(id); rej(new Error(method + ' 超时')); }
            }, 60000);
        });
    }
}
const wire = await Wire.open(wsEndpoint);
const pageTarget = (await wire.call('Target.createTarget', { url: 'about:blank' })).targetId;
const pageSession = (await wire.call('Target.attachToTarget', { targetId: pageTarget, flatten: true })).sessionId;
await wire.call('Page.enable', {}, pageSession);
await wire.call('Runtime.enable', {}, pageSession);

const pageErrors = [];
wire.ws.addEventListener('message', (ev) => {
    try {
        const msg = JSON.parse(ev.data);
        if (msg.method === 'Runtime.exceptionThrown') {
            const d = msg.params && msg.params.exceptionDetails;
            pageErrors.push((d && ((d.exception && d.exception.description) || d.text)) || 'unknown');
        }
    } catch { /* 非 JSON 帧忽略 */ }
});
/** 真页面求值（与两份前身的 evalPage 形状不同，见文件头⑥）。 */
async function evaluate(expression) {
    const r = await wire.call('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true,
    }, pageSession);
    if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error('页面求值抛错：' + ((d.exception && d.exception.description) || d.text));
    }
    return r.result ? r.result.value : undefined;
}

/* ── 2. 打开真 ST 并**轮询**等插件装载（不死等常数秒数：首版死等 7s 读早了会误报不在场） ── */
await wire.call('Page.navigate', { url: ST_URL }, pageSession);
let boot = null;
const BOOT_DEADLINE = Date.now() + 60000;
while (Date.now() < BOOT_DEADLINE) {
    await nap(1500);
    try {
        boot = await evaluate(`(() => {
            const g = window;
            const plug = g.LonShaMemory || null;
            const eng = (plug && plug.engine) || null;
            return {
                hasST: !!(g.SillyTavern && typeof g.SillyTavern.getContext === 'function'),
                stVersion: (g.SillyTavern && g.SillyTavern.version) || null,
                globals: Object.keys(g).filter((k) => /^LonSha/.test(k)).length,
                hasOrgans: !!g.LonShaMemoryOrgans,
                hasPlugin: !!plug,
                hasStorage: !!(eng && eng.storage && typeof eng.storage.save === 'function'),
                hasUI: !!(plug && typeof plug.showSettingsPanel === 'function'),
            };
        })()`);
    } catch (_e) { boot = null; }
    if (boot && boot.hasST && boot.hasOrgans && boot.hasPlugin && boot.hasStorage) break;
}
if (!boot || !boot.hasST) bail('真页面里 SillyTavern 上下文不可用（60s 轮询内未就绪）');
if (!boot.hasPlugin) bail('真页面里 window.LonShaMemory 不在场 —— 插件未装/未装载');
if (!boot.hasOrgans) bail('真页面里 LonShaMemoryOrgans 不在场 —— 内存器官未装载');
if (!boot.hasStorage) bail('真页面里 window.LonShaMemory.engine.storage.save 不可用');

/* ═══════════ 块 ① 装载面 ═══════════ */
if (!ONE || ONE === 'load') {
    const load = await evaluate(`(() => {
        const p = window.LonShaMemory;
        const l = p._extraJsLoad || {};
        return {
            status: l.status, okCount: l.okCount, triedCount: l.triedCount,
            fails: (l.fail || []).map((f) => String(f.file) + ':' + String(f.why)).slice(0, 8),
            globals: Object.keys(window).filter((k) => /^LonSha/.test(k)).length,
            scriptTags: document.querySelectorAll('script[src*="lonsha-memory-plugin"]').length,
            version: p.VERSION,
            configKeys: Object.keys(p.engine.config.config).length,
            hasUI: typeof p.showSettingsPanel === 'function',
        };
    })()`);
    note('load', 'extraJs.status', load.status, '真页面 plugin._extraJsLoad.status');
    note('load', 'extraJs.ok', load.okCount + '/' + load.triedCount, '真页面 plugin._extraJsLoad.okCount/triedCount');
    note('load', 'globals', load.globals, '真页面 window 上 LonSha* 全局计数');
    note('load', 'scriptTags', load.scriptTags, '真页面 script[src*=lonsha-memory-plugin] 计数');
    note('load', 'version', load.version, '真页面 plugin.VERSION');
    note('load', 'configKeys', load.configKeys, '真页面 config 键数（远小于真实现即为精简快照）');
    note('load', 'fails', load.fails, '真页面装载失败项（期望空）');
    /* 判定**不在这里**：交给 `_realhost_judge.mjs`（探针只量，判据只判）。
     *   若探针体内再留一份内联判据，离线证伪的就只是副本 —— 真跑时用的是另一份。 */
    for (const m of judgeLoad(load)) flag('load', m);
}

/* ═══════════ 块 ② 写盘闭环（M-O1 五态 + 字节级错档） ═══════════ */
if (!ONE || ONE === 'write') {
    const write = await evaluate(`(async () => {
        const g = window;
        const ST = g.SillyTavern;
        const KEY = 'lonsha_memory';
        const sm = g.LonShaMemory.engine.storage;
        const origGetContext = ST.getContext.bind(ST);
        const origMeta = origGetContext().chatMetadata;
        const landed = [];
        const stamps = {};
        let pendingSwap = null;
        const out = {};

        /* 观测点语义：**宿主真要存下去的那一刻**，当前会话里那一格写的是谁的身份。
         *   slotChatId（格子里的 chatId）与 curChatId（那一刻当前会话）不等 ⇒ 错档。
         *   ★ 不可用「格子里的数据含本批标记」当落地证据：写入发生在 saveChat 之前，
         *     那一刻格子当然写着本批 —— 它证明的只是「写过了」，不是「存下去的还在当前会话里」。 */
        ST.getContext = function () {
            const c = origGetContext();
            c.saveChat = async function () {
                const cur = origGetContext().chatMetadata;
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
        const setChat = (id) => { origGetContext().updateChatMetadata({ file_name: id, extensions: {} }, true); };
        const markOf = (tag) => { const m = 'rh-' + tag + '-' + String(Math.random()).slice(2, 8); stamps[tag] = m; return m; };

        try {
            /* S1 同会话主流路径（不得误伤） */
            setChat('rh-suite-1');
            const m1 = markOf('same');
            sm._lastBatch = null; sm._lastWrite = null; sm._confirmed = null;
            out.same = {
                ret: await sm.save('rh-suite-1', { graph: { mark: m1 }, summaries: [] }),
                lastWriteStatus: sm._lastWrite && sm._lastWrite.status,
                batchStatus: sm._lastBatch && sm._lastBatch.status,
                confirmedChatId: sm._confirmed && sm._confirmed.chatId,
                markInCurrentAfter: String(JSON.stringify(origGetContext().chatMetadata || {})).includes(m1),
            };

            /* S2 await 之后切聊（M-O1 验收①）：真 saveChat 那一刻用真 ST 的 updateChatMetadata 真切聊 */
            setChat('rh-suite-A');
            const m2 = markOf('swap');
            pendingSwap = () => setChat('rh-suite-B');
            sm._lastBatch = null; sm._lastWrite = null; sm._confirmed = null;
            out.swap = {
                ret: await sm.save('rh-suite-A', { graph: { mark: m2 }, summaries: [] }),
                lastWriteStatus: sm._lastWrite && sm._lastWrite.status,
                entryStatus: sm._lastWrite && sm._lastWrite.entryStatus,
                entryReason: sm._lastWrite && sm._lastWrite.entryReason,
                confirmed: sm._confirmed ? { chatId: sm._confirmed.chatId, revision: sm._confirmed.revision } : null,
                markInCurrentAfter: String(JSON.stringify(origGetContext().chatMetadata || {})).includes(m2),
                chatAfter: origGetContext().chatMetadata.file_name,
            };

            /* S3 排队批：连发两批，第二批走合流；排干时必须用它**自己**那一刻的身份 */
            setChat('rh-suite-C');
            const m3 = markOf('drainC');
            sm._lastBatch = null; sm._lastWrite = null; sm._confirmed = null;
            const pC = sm.save('rh-suite-C', { graph: { mark: m3 }, summaries: [] });
            setChat('rh-suite-D');
            const m4 = markOf('drainD');
            const pD = sm.save('rh-suite-D', { graph: { mark: m4 }, summaries: [] });
            const [rC, rD] = await Promise.all([pC, pD]);
            out.drain = {
                retC: rC, retD: rD,
                lastWriteStatus: sm._lastWrite && sm._lastWrite.status,
                lastBatch: sm._lastBatch ? { chatId: sm._lastBatch.chatId, status: sm._lastBatch.status } : null,
                landedHasC: landed.some((e) => e.data.includes(m3)),
                landedHasD: landed.some((e) => e.data.includes(m4)),
                calls: landed.map((e) => ({ slotChatId: e.slotChatId, curChatId: e.curChatId })),
            };
        } catch (e) { out.err = String(e && (e.stack || e.message)).slice(0, 600); }

        if (!${KEEP}) {
            ST.getContext = origGetContext;
            try { origGetContext().updateChatMetadata(origMeta, true); out.restored = true; }
            catch (e) { out.restored = false; out.restoreError = String((e && e.message) || e); }
        }
        return out;
    })()`);
    if (!write || write.err) bail('写盘闭环块执行失败：' + (write && write.err));
    note('write', 'same.ret', write.same.ret, '真宿主 StorageManager.save 返回值（同会话）');
    note('write', 'same.markInCurrentAfter', write.same.markInCurrentAfter, '同会话：跑完后当前会话里是否留着本批数据');
    note('write', 'swap.ret', write.swap.ret, '★ await 期间切聊后的返回值（期望 false）');
    note('write', 'swap.lastWriteStatus', write.swap.lastWriteStatus, '★ 整队状态（期望 failed：零落盘）');
    note('write', 'swap.entryStatus', write.swap.entryStatus, '★ 批次归宿（期望 deferred）');
    note('write', 'swap.entryReason', write.swap.entryReason, '★ 归宿理由码');
    note('write', 'swap.confirmed', write.swap.confirmed, '★ 确认推进（期望 null：一个字节都没落地）');
    note('write', 'swap.markInCurrentAfter', write.swap.markInCurrentAfter, '★ 跑完后当前会话里是否留着本批数据（期望 false）');
    note('write', 'swap.chatAfter', write.swap.chatAfter, '真切聊后的当前会话');
    note('write', 'drain.retC', write.drain.retC, '排队批 C 返回值');
    note('write', 'drain.retD', write.drain.retD, '排队批 D 返回值');
    note('write', 'drain.lastWriteStatus', write.drain.lastWriteStatus, '排队场景整队状态');
    note('write', 'drain.landedHasC', write.drain.landedHasC, '★ C 批数据是否真落盘');
    note('write', 'drain.landedHasD', write.drain.landedHasD, '★ D 批数据是否真落盘');
    note('write', 'drain.calls', write.drain.calls, '★ 每次落盘那一刻：格子里的 chatId vs 当前会话 chatId');
    if (write.restored === false) note('write', 'restoreError', write.restoreError, '还原失败（如实记，不静默）');

    for (const m of judgeWrite(write)) flag('write', m);
}

/* ═══════════ 块 ③ 世界线纪元（α 1–39 → β 40–46 → 回跳 α 47–87，第 60 楼看第 5 楼） ═══════════ */
if (!ONE || ONE === 'worldline') {
    const wl = await evaluate(`(async () => {
        const p = window.LonShaMemory;
        const eng = p.engine;
        const cfg = eng.config.config;
        const backup = {
            on: cfg.worldlineMemoryEnabled, id: cfg.worldlineId,
            sf: cfg.worldlineStartFloor, jumps: cfg.worldlineJumps,
        };
        const out = {};
        try {
            cfg.worldlineMemoryEnabled = true;
            cfg.worldlineId = 'α线';
            cfg.worldlineStartFloor = '';          /* ★ 刻意不填：走 v3.426.0 的自动推进 */
            cfg.worldlineJumps = '1:α线' + String.fromCharCode(10) + '40:β线' + String.fromCharCode(10) + '47:α线';
            eng._currentFloor = 60;
            const items = [
                { id: 'era1', floor: 5, worldline: 'α线' },       /* 第一纪元（早于回跳） */
                { id: 'now', floor: 50, worldline: 'α线' },       /* 本纪元 */
                { id: 'beta', floor: 42, worldline: 'β线' },      /* 中间纪元 */
                { id: 'nolocate', text: '既无楼层也无线标' },      /* 判不了 */
            ];
            const gate = eng.worldlineGate({ items: items, viewer: '', floor: 60 });
            const buckets = {};
            for (const b of ['kept', 'held', 'blocked', 'undecided']) {
                for (const row of (gate[b] || [])) {
                    buckets[String(row.key)] = { bucket: b, state: row.state, why: row.why, epoch: row.epoch };
                }
            }
            out.epochAdvance = eng._worldlineState({ floor: 60 }).epochAdvance;
            out.current = gate.current;
            out.counts = gate.counts;
            out.buckets = buckets;
        } catch (e) { out.err = String(e && (e.stack || e.message)).slice(0, 600); }
        finally {
            cfg.worldlineMemoryEnabled = backup.on;
            cfg.worldlineId = backup.id;
            cfg.worldlineStartFloor = backup.sf;
            cfg.worldlineJumps = backup.jumps;
        }
        return out;
    })()`);
    if (!wl || wl.err) bail('世界线纪元块执行失败：' + (wl && wl.err));
    note('worldline', 'epochAdvance', wl.epochAdvance, '真宿主 _worldlineState({floor:60}).epochAdvance（期望 applied:true / floor:60）');
    note('worldline', 'current', wl.current, '真宿主闸门的当前纪元（期望 lineId=α线 / epoch=α线@47）');
    note('worldline', 'counts', wl.counts, '真宿主闸门四桶计数');
    note('worldline', 'buckets', wl.buckets, '★ 四条记忆的归宿（era1=blocked / now=kept / beta=blocked / nolocate=undecided）');
    for (const m of judgeWorldline(wl)) flag('worldline', m);
}

/* ═══════════ 收尾：pageErrors / 落盘 / 三档退出码 ═══════════ */
note('tail', 'pageErrors', pageErrors.slice(0, 5), '真页面未捕获异常（期望空）');
for (const m of judgePageErrors(pageErrors)) flag('tail', m);

const report = {
    schema: 'realhost-readings@1',
    generatedAt: new Date().toISOString(),
    version: repoVersion,
    blocks: {
        load: ONE ? (ONE === 'load') : true,
        write: ONE ? (ONE === 'write') : true,
        worldline: ONE ? (ONE === 'worldline') : true,
    },
    readings,
    defects,
    pageErrors: pageErrors.slice(0, 5),
    ok: defects.length === 0,
};
/* 读数落盘（计划验收：`tests/audit/realhost_readings.json`）——
 *   写失败要**如实报**并 exit 2：一份「跑了但没留下证据」的读数，比没跑更容易被当成跑过。 */
try {
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
} catch (e) {
    bail('读数落盘失败（' + OUT_JSON + '）：' + String((e && e.message) || e));
}
note('tail', 'readingsFile', path.relative(ROOT, OUT_JSON), '本文件落盘位置');

if (WANT_JSON) console.log(JSON.stringify(report));

console.log('[realhost] 三块最小回归：' + readings.length + ' 条读数 / ' + defects.length + ' 项缺陷'
    + '（版本 ' + repoVersion + '）');
for (const r of readings) console.log('  · [' + r.block + '] ' + r.key + ' = ' + JSON.stringify(r.value) + '   ← ' + r.source);
if (defects.length) {
    console.error('');
    console.error('[realhost] 读数成立，但检出 ' + defects.length + ' 项**真缺陷**：');
    for (const d of defects) console.error('  x [' + d.block + '] ' + d.msg);
    reap();
    process.exit(1);
}
reap();
console.log('[realhost] 三块全成立（装载面 / 写盘闭环 / 世界线纪元），读数已落 ' + path.relative(ROOT, OUT_JSON));
process.exit(0);
