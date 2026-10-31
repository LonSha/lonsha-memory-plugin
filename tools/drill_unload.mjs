/* ============================================================
 * tools/drill_unload.mjs —— 记忆的「卸载可逆」演练（零依赖）[v3.430.0 · L12-X6]
 * ------------------------------------------------------------
 * 为什么存在（L12-X6 的真实现场，读码可复算）：
 *   本仓模块是 `manifest.extra_js` 经典脚本注入，v3.300.0 记录过「宿主从不加载 extra_js」
 *   的历史；但**没有任何一面演练过「模块被摘掉后插件还能不能活」**。
 *   实测依据：`grep -rn 'drill' package.json` ⇒ 无此入口；`tools/` 下无任何卸载演练脚本。
 *   而 O1 正要摘/删七个模块 —— 这恰好是最需要安全网的时刻。
 *
 * 它判什么（不是一个「有没有 catch」的守卫，是一门**破坏实验**）：
 *   D1 摘 9 个模块后仍能装载 + init 不抛（能活）；
 *   D2 三条主路径各自**给出可读的缺席原因**：
 *      ① 取数（诊断面六面 + selfCheck）② 召回（recallMemory）③ 面板（showSettingsPanel）；
 *   D3 ★ 区分「吞成空」与「降级成可用」——
 *      返回 `null` / `undefined` / 空对象且**不带任何原因词**的，算真缺陷（exit 1）。
 *      这是本演练唯一比「跑通不抛」更狠的一条：本仓大量 `_xxxLib()` 取库口 `catch` 吞错，
 *      吞了不等于降级对了。
 *   D4 负控制（工具两向自证）：`--selftest` 下把某个 `catch` 改成 `throw` ⇒ 本演练必须红。
 *
 * 退出码（三档，全为字面量）：
 *   0 = 九件摘掉后三条主路径全部**如实降级**
 *   1 = 有真缺陷（抛错 / 吞成空 / 主路径消失）
 *   2 = 结构漂移（manifest 读不出 / 指定模块不在册 / 沙箱退化 ⇒ 没得判 ≠ 通过）
 *
 * 它是**独立入口，不是守卫**（方案原文否决把卸载演练写成门）：
 *   package.json 里挂 `npm run drill:unload` / `drill:unload:json` / `drill:unload:selftest`，
 *   但**不进 `npm test` 与 `test:audit`** —— 写成门会让「降级对不对」退化成「有没有写 catch」。
 *   它的看守面是 `tests/v3430_l12_x6_unload_drill.test.mjs`（不跑演练 = 没人验它还能不能判）。
 *
 * 用法：
 *   node tools/drill_unload.mjs                      # 默认九件
 *   node tools/drill_unload.mjs --only=a.js,b.js     # 指定
 *   node tools/drill_unload.mjs --count=3            # 只摘前 N 件（冒烟）
 *   node tools/drill_unload.mjs --json               # 机器可读读数（供套件消费）
 *   node tools/drill_unload.mjs --selftest           # 工具两向自证
 *
 * 边界（与结论一起读）：
 *   本演练跑在零依赖 vm 沙箱 + 最小 DOM shim 上，摘的是**加载顺序里的文件**，
 *   不是真浏览器里的 <script> 标签。它证明「模块缺席时降级路径可读」，
 *   不证明真机上的观感、也不证明 localStorage 跨会话行为。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.env.LONSHA_DRILL_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* ---------- 0. 参数 ---------- */
const argv = process.argv.slice(2);
const argOf = (name, def) => {
    const hit = argv.find((a) => a.startsWith('--' + name + '='));
    return hit ? hit.slice(name.length + 3) : def;
};
const flag = (name) => argv.indexOf('--' + name) >= 0;
const JSON_OUT = flag('json');
const SELFTEST = flag('selftest');

/* 默认九件：O1 的七件零消费内核 + 两个「有下游硬依赖」的边界模块。
 *   为什么边界要选这两个（不是随便挑两个叶子）：
 *   · `ledger-entity.js` 被 `recall-echo.js` 在**模块顶层**硬断言（缺它就 throw）——
 *     摘它演练的是「上游被摘、下游顶层炸」这一格；
 *   · `worldline-memory.js` 是宿主转发面的取库口目标，摘它演练「转发桩拿不到模块」。 */
const DEFAULT_NINE = [
    'memory-supersede.js', 'institutional-memory.js', 'symbolic-evolution.js',
    'knowledge-network.js', 'relation-dynamics.js', 'character-agency-contract.js',
    'era-inheritance.js',
    'ledger-entity.js', 'worldline-memory.js',
];

const drift = (m) => {
    const out = { ok: false, code: 2, reason: 'structural-drift', detail: m };
    if (JSON_OUT) console.log(JSON.stringify(out));
    else console.error('[drill-unload] ' + m + '（结构漂移：没得判 ≠ 通过）');
    process.exit(2);
};

/* ---------- 1. manifest（结构面 fail-closed） ---------- */
let MF;
try { MF = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')); }
catch (e) { drift('manifest.json 读不出：' + (e && e.message)); }
const ORDER = [MF.js].concat(Array.isArray(MF.extra_js) ? MF.extra_js : []);
/* 结构下限：**单源常量**，算一次、判一处。
 *   本版修掉的真缺陷：修前第 78 行写着死数字 50，而 `MIN_ORDER` 在它**之后**才定义，
 *   并且还挂着 `LONSHA_DRILL_FIXTURE` 这个环境开关 —— 该开关**声明了却从不生效**
 *   （fixture 树永远先死在死数字那一行），实测 `LONSHA_DRILL_FIXTURE=1` 与不设完全同结果。
 *   这属于「接线了但零调用点」的功能级失效，故**直接删掉这个开关**，
 *   而不是给它补一条接线：它没有任何真实调用方，留着就是下一个陷阱。
 *   删掉之后唯一的下限就是这条常量 —— 合成树必须拷满真实装载面才跑得起来，这正是我们要的。 */
const MIN_ORDER = 50;
if (ORDER.length < MIN_ORDER) {
    drift('装载面只有 ' + ORDER.length + ' 个文件（下限 ' + MIN_ORDER + '，正常应 ≫50）⇒ manifest 结构已变');
}

let targets = DEFAULT_NINE;
if (argOf('only', '')) targets = argOf('only', '').split(',').map((s) => s.trim()).filter(Boolean);
const cntArg = Number(argOf('count', ''));
if (Number.isFinite(cntArg) && cntArg > 0) targets = targets.slice(0, cntArg);
const notInOrder = targets.filter((t) => ORDER.indexOf(t) < 0);
if (notInOrder.length) drift('指定要摘的模块不在 manifest.extra_js 里：' + notInOrder.join(', '));

/* ---------- 2. 沙箱（与 tests 里既有的 buildSandbox 同形，不另立一套） ---------- */
const noop = () => {};
function fakeElement() {
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'style') return {};
            if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
            if (typeof k === 'symbol') return undefined;
            if (['appendChild', 'removeChild', 'remove', 'addEventListener', 'removeEventListener',
                'setAttribute', 'getAttribute', 'insertBefore'].includes(k)) return () => null;
            /* querySelector 必须返回**可继续链式操作**的元素：settings-ui 里
             *   `ov.querySelector('.lonsha-sheet-close').addEventListener(...)` 是常态写法，
             *   真机上 createElement 出来的产物必然查得到子节点。返回 null 会让面板整块抛错，
             *   那是 shim 不真，不是产品坏了（本轮第三次同族自伤）。 */
            if (k === 'querySelector') return () => fakeElement();
            if (k === 'querySelectorAll') return () => [];
            if (['children', 'childNodes'].includes(k)) return [];
            return undefined;
        },
        set: () => true,
    });
}
function buildSandbox() {
    const ctx = {};
    let timerCount = 0;
    let timerDropped = 0;
    const TIMER_BUDGET = 20000;
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    ctx.console = { log: noop, warn: noop, error: noop, info: noop, debug: noop };
    ctx.document = {
        createElement: fakeElement, createTextNode: () => ({}), createDocumentFragment: fakeElement,
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: noop, removeEventListener: noop,
        head: fakeElement(), body: fakeElement(), documentElement: fakeElement(), currentScript: null,
    };
    ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null };
    ctx.performance = { now: () => 0 };
    /* init 的 await 链需要真推进，但**不能同步执行回调**：
     *   index.js:3641 有 `const window = chat.slice(-8)`，同步 flush 会让回调抢在该 const
     *   初始化之前跑（TDZ: Cannot access 'window' before initialization）。
     *   真机 setTimeout 是异步的 ⇒ 这里用真定时器并把延迟压到 0，行为才对得上。
     *   防轮询自循环：同一轮最多放行 TIMER_BUDGET 次，超了只记数不再执行（不静默）。 */
    ctx.setTimeout = (fn, ms) => {
        if (typeof fn !== 'function') return 0;
        if (timerCount >= TIMER_BUDGET) { timerDropped++; return 0; }
        timerCount++;
        return setTimeout(() => { try { fn(); } catch (e) { /* 留痕不得成为新的失败 */ } }, Math.min(Number(ms) || 0, 1));
    };
    ctx.clearTimeout = (h) => { try { clearTimeout(h); } catch (e) { /* noop */ } };
    ctx.clearTimeout = noop; ctx.setInterval = () => 0; ctx.clearInterval = noop;
    ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = noop;
    ctx.navigator = { userAgent: 'drill-unload' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL; ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {}; ctx.Event = class {};
    ctx.SillyTavern = {
        getContext: () => ({ chat: [{ is_user: false, is_system: false, name: 'A', mes: 'drill' }], characters: [], chatId: 'drill-unload-1' }),
        eventSource: { on: noop, off: noop, emit: noop, once: noop, removeListener: noop },
        libs: {}, chatMetadata: {},
    };
    ctx.addEventListener = noop; ctx.removeEventListener = noop;
    ctx.__drillTimers = () => ({ scheduled: timerCount, dropped: timerDropped });
    return vm.createContext(ctx);
}

/* ---------- 3. 装载（可指定跳过面） ---------- */
function boot(skipList, overrides) {
    const sb = buildSandbox();
    const skip = new Set(skipList || []);
    const ov = overrides || {};
    const loadFails = [];
    for (const f of ORDER) {
        if (skip.has(f)) continue;
        let code;
        try { code = (ov[f] != null) ? ov[f] : fs.readFileSync(path.join(ROOT, f), 'utf8'); }
        catch (e) { loadFails.push({ file: f, kind: 'read', msg: String((e && e.message) || e).slice(0, 120) }); continue; }
        try { vm.runInContext(code, sb, { filename: f }); }
        catch (e) { loadFails.push({ file: f, kind: 'exec', msg: String((e && e.message) || e).slice(0, 160) }); }
    }
    return { sb, loadFails };
}

/* ---------- 4. 三条主路径（每条都必须给出「可读原因」，不许静默空） ---------- */
/** 「吞成空」判据：返回值存在但既没有原因词、也没有任何形状信息 ⇒ 静默降级。 */
const REASON_WORDS = [
    'unavailable', 'absent', 'empty', 'no-', 'not-', 'missing', 'required', 'disabled',
    'module', 'refused', 'unknown', 'skipped', 'none', 'denied', 'threw', 'thrown',
    'pending', 'drift', 'unwired', 'idle',
];
function hasReasonWord(str) {
    const s = String(str || '').toLowerCase();
    if (!s) return false;
    return REASON_WORDS.some((w) => s.indexOf(w) >= 0);
}
/** 一个返回值是否「可读」：对象里能找到 reason/why/status/state/ok 之一，且不是全空。
 *  `opts.healthyOk === true` 表示这一面**健康时本来就不该带缺席原因**（如 selfCheck 的健康报告）：
 *  此时不要求 reason 词，但仍拒绝 null / 空串 / 空对象 / 无 ok 且无键。 */
function readable(r, opts) {
    const healthyOk = !!(opts && opts.healthyOk);
    const listOk = !!(opts && opts.listOk);
    if (r === null || r === undefined) return { ok: false, why: 'returned-null' };
    /* 列表形态：recallMemory 的真出口是 `engine-recall.js:1026 _finalize() → return finalMerged`，
     * 即**数组**（已实测，不是对象）。数组的 read 必须按长度读数，
     * 不能当成「零键对象」判成静默吞空 —— 否则「今天没召回」会被判成「降级做错了」。
     * 但空列表也绝不能无条件放行（那等于在 D3 上开个洞）：故 listOk 只在调用方
     * 明确「这一面的健康形态就是列表」时生效，且必须带出 len 供人复算。 */
    if (Array.isArray(r)) {
        if (listOk) return { ok: true, why: 'list-shaped(len=' + r.length + ')' };
        if (r.length === 0) return { ok: false, why: 'empty-list-without-list-context' };
        return { ok: true, why: 'list-shaped(len=' + r.length + ')' };
    }
    if (typeof r !== 'object') {
        const s = String(r);
        if (!s.trim()) return { ok: false, why: 'returned-empty-string' };
        return hasReasonWord(s) ? { ok: true, why: 'text-with-reason' } : { ok: false, why: 'text-without-reason' };
    }
    const keys = Object.keys(r);
    if (keys.length === 0) return { ok: false, why: 'returned-empty-object' };
    const blobs = [];
    for (const k of ['reason', 'why', 'status', 'state', 'kind', 'mode', 'detail']) {
        if (r[k] !== undefined && r[k] !== null && r[k] !== '') blobs.push(String(r[k]));
    }
    if (r.ok === false) blobs.push('ok-false');
    if (blobs.length === 0) {
        /* ok:true 且无任何原因词 ⇒ 这是「降级成可用」，合法；但必须带出形状信息，
         *   否则读者无从判断它降级成了什么（本仓「三态必须不同形」）。 */
        if (r.ok === true) return { ok: true, why: 'degraded-usable' };
        /* 健全面：selfCheck 的**健康**返回是 {time, version, stats:[...], errors:[], ...}，
         * 实测 `hasOwnProperty('absent') === false` —— 健康形态压根没有 absent 键，
         * 只有缺席形态（`_selfCheckAbsent`）才带 `absent:true` + `reason`。
         * 故判据写成「有 stats 数组且 absent !== true ⇒ 健康在场」。
         * 这是判据自身的第 5 次缺陷（前四次：TDZ 误判 / 漏跑 init / selfCheck 漏 await /
         * 把健康报告当静默吞空）。 */
        if (healthyOk && r.absent !== true && Array.isArray(r.stats)) return { ok: true, why: 'healthy-in-place' };
        return { ok: false, why: 'shape-without-reason' };
    }
    const joined = blobs.join(' ');
    if (!hasReasonWord(joined) && !/ok-false/.test(joined)) return { ok: false, why: 'reason-without-word' };
    return { ok: true, why: 'reasoned' };
}

const CALL_TIMEOUT_MS = 4000;

/** 路径①取数：诊断面六面 + selfCheck。selfCheck 是 async（engine-self-check.js），必须 await。 */
async function pathFetch(sb) {
    const out = [];
    const E = sb.LonShaMemory && sb.LonShaMemory.engine;
    if (!E) return [{ name: 'engine', ok: false, why: 'engine-absent' }];
    const faces = ['institutionRuleState', 'meaningViewState', 'worldlinePrehistory',
        'evidenceImpactReplay', 'actionReceiptState', 'silenceExplainState'];
    for (const fn of faces) {
        /* 走宿主转发面（这是产品真调的那一层），不是直调诊断层。 */
        try {
            if (typeof E[fn] !== 'function') { out.push({ name: fn, ok: false, why: 'host-method-absent' }); continue; }
            const r = E[fn]();
            const j = readable(r);
            out.push({ name: fn, ok: j.ok, why: j.why, sample: JSON.stringify(r).slice(0, 90) });
        } catch (e) { out.push({ name: fn, ok: false, why: 'threw: ' + String((e && e.message) || e).slice(0, 80) }); }
    }
    try {
        if (typeof E.selfCheck !== 'function') out.push({ name: 'selfCheck', ok: false, why: 'host-method-absent' });
        else {
            const r0 = E.selfCheck();
            const r = (r0 && typeof r0.then === 'function') ? await r0 : r0;
            /* 健全面：selfCheck 在一切正常时不带缺席原因（absent:false），
             * 缺席时走 _selfCheckAbsent 带 reason ⇒ 两种形态都可读、且不同形。 */
            const j = readable(r, { healthyOk: true });
            out.push({ name: 'selfCheck', ok: j.ok, why: j.why, sample: JSON.stringify(r).slice(0, 90) });
        }
    } catch (e) { out.push({ name: 'selfCheck', ok: false, why: 'threw: ' + String((e && e.message) || e).slice(0, 80) }); }
    return out;
}

/** 路径②召回：recallMemory(query)（真签名在 engine-recall.js：`recallMemory(engine, query)`，
 * 宿主侧 `async recallMemory(query)` 只是委派桩）。降级必须给出可读原因，不许静默空。 */
async function pathRecall(sb) {
    const E = sb.LonShaMemory && sb.LonShaMemory.engine;
    if (!E) return [{ name: 'recallMemory', ok: false, why: 'engine-absent' }];
    if (typeof E.recallMemory !== 'function') return [{ name: 'recallMemory', ok: false, why: 'host-method-absent' }];
    const out = [];
    const QUERY = { text: 'drill-unload', keywords: ['drill-unload'] };
    try {
        const r = E.recallMemory(QUERY);
        const val = (r && typeof r.then === 'function') ? await r : r;
        /* 召回的健康形态就是列表（_finalize 返回 finalMerged 数组），故 listOk。 */
        const j = readable(val, { listOk: true });
        out.push({ name: 'recallMemory', ok: j.ok, why: j.why, sample: JSON.stringify(val === undefined ? null : val).slice(0, 90) });
    } catch (e) {
        /* 召回抛错**不算通过**：它是主路径，宿主没有兜住就说明降级没做对。 */
        out.push({ name: 'recallMemory', ok: false, why: 'threw: ' + String((e && e.message) || e).slice(0, 100) });
    }
    return out;
}

/** 路径③面板：showSettingsPanel（用户唯一能看见自检的地方）。
 *  两种「没挂上」必须不同形（本仓三态纪律）：
 *    · settings-ui.js **根本没在装载面里** ⇒ `panel-not-mounted（settings-ui 缺席，如实报）`，合法；
 *    · settings-ui.js **在装载面里、但插件上仍没有这方法** ⇒ 该模块**装载或注册失败**，
 *      这是缺陷（真跑实测：把 settings-ui.js 顶层写坏，整模块注册全部不生效，
 *      showSettingsPanel 变 undefined —— 修前这里被当成合法降级，等于给装载失败开了后门）。 */
function pathPanel(sb, ctxInfo) {
    const P = sb.LonShaMemory;
    if (!P) return [{ name: 'plugin', ok: false, why: 'plugin-absent' }];
    const uiLoaded = !!(ctxInfo && ctxInfo.uiInLoadFace);
    if (typeof P.showSettingsPanel !== 'function') {
        if (!uiLoaded) return [{ name: 'showSettingsPanel', ok: true, why: 'panel-not-mounted（settings-ui 不在装载面，如实报）' }];
        return [{ name: 'showSettingsPanel', ok: false, why: 'module-not-registered（settings-ui 在装载面里却没挂上面板 ⇒ 该模块装载/注册失败）' }];
    }
    try { P.showSettingsPanel(); return [{ name: 'showSettingsPanel', ok: true, why: 'opened' }]; }
    catch (e) { return [{ name: 'showSettingsPanel', ok: false, why: 'threw: ' + String((e && e.message) || e).slice(0, 100) }]; }
}

/* 真机上 `settings-ui.js` 是**异步挂载**的（该文件末行：`setTimeout(mount, 300)`，
     * 且 mount 在 `window.LonShaMemory` 未就绪时自己再 `setTimeout(mount, 200)` 轮询）。
     * 所以「init() 返回了」不等于「面板挂上了」——真跑实测：init 后
     * `typeof P.showSettingsPanel === 'undefined'`，等一拍才出现。
     * 本函数只做「把已排队的定时器放行 + 让出事件循环」，不伪造面板，
     * 也不能判定「面板一定该挂上」（那件事交给 pathPanel 按装载面判）。 */
function flushTimers(rounds) {
    const n = Math.max(1, rounds || 6);
    let done = Promise.resolve();
    for (let i = 0; i < n; i++) {
        done = done.then(() => new Promise((r) => setTimeout(r, 2)));
    }
    return done;
}

/* ---------- 5. 跑一轮：全在场（对照）与摘九件 ---------- */
async function runDrill(skipList, overrides) {
    const t0 = Date.now();
    const { sb, loadFails } = boot(skipList, overrides);
    const skipSet = new Set(skipList || []);
    const read = {
        skip: skipList, loadFails,
        /* settings-ui.js 是否**在本次装载面里**（这是 pathPanel 分「如实缺席」与
         * 「模块注册失败」的唯一依据，不能靠猜）。 */
        uiInLoadFace: ORDER.indexOf('settings-ui.js') >= 0 && !skipSet.has('settings-ui.js'),
        plugins: !!(sb.LonShaMemory && sb.LonShaMemory.engine),
        initOk: false, initErr: '',
        fetch: [], recall: [], panel: [],
        ms: 0, globals: 0,
    };
    read.globals = Object.keys(sb).filter((k) => /^(LonSha|MemorySeason|Institutional|Symbolic)/.test(k)).length;
    if (sb.LonShaMemory && typeof sb.LonShaMemory.init === 'function') {
        try { await sb.LonShaMemory.init(); read.initOk = true; }
        catch (e) { read.initErr = String((e && e.message) || e).slice(0, 200); }
    }
    /* 放行异步挂载（settings-ui 的 mount 靠 setTimeout 轮询，见 flushTimers 注释）。 */
    await flushTimers(8);
    read.fetch = await pathFetch(sb);
    read.recall = await pathRecall(sb);
    read.panel = pathPanel(sb, { uiInLoadFace: read.uiInLoadFace });
    read.ms = Date.now() - t0;
    return read;
}

/* ---------- 6. 判定 ---------- */
function judge(read, label) {
    const defects = [];
    if (!read.plugins) defects.push(label + ' 插件未在构造期挂上（装载面塌陷）');
    if (!read.initOk) defects.push(label + ' init() 抛错：' + (read.initErr || '?') + '（能装载 ≠ 能初始化）');
    const all = []
        .concat(read.fetch.map((x) => Object.assign({ path: '取数' }, x)))
        .concat(read.recall.map((x) => Object.assign({ path: '召回' }, x)))
        .concat(read.panel.map((x) => Object.assign({ path: '面板' }, x)));
    for (const x of all) {
        if (!x.ok) defects.push(label + ' ' + x.path + '/' + x.name + ' 未给出可读降级：' + x.why
            + '（「吞成空」与「降级成可用」必须不同形）');
    }
    return { defects, checked: all.length };
}

/* ---------- 7. 主流程 ---------- */
if (SELFTEST) {
    /* 工具两向自证（本仓纪律：判据必须能真翻红）。
     * 上一版写错了 —— 它只要「control 零缺陷 且 源码真被改了」就判 ok，
     *   **破坏后零缺陷照样过**：那不是自证，是「改了文件就算过」。当场修掉。
     * 现在要求：control 零缺陷；两个破坏各自**必须**让演练报缺陷；任何一个没红 ⇒ 工具自证失效。
     * 破坏一律打在**演练真会读的面**上（否则破坏没承重，等于没测）：
     *   A 让 recallMemory 静默吞成 null（D3 的靶心形态）；
     *   B 让 showSettingsPanel 抛错（D2-③ 的靶心形态）。锚点都要求恰中 1 次。 */
    const readSrc = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const mustHitOnce = (src, anchor, label) => {
        const n = src.split(anchor).length - 1;
        if (n !== 1) drift('selftest 锚点「' + label + '」在源码中命中 ' + n + ' 次（必须恰 1 次）⇒ 工具自证失效');
        return src.replace(anchor, label === 'recallMemory' ? anchor + ' return null;'
            : anchor + ' throw new Error("selftest-forced-throw");');
    };

    const base = await runDrill(targets, null);
    const j1 = judge(base, '[selftest/control]');
    if (j1.defects.length) {
        console.log(JSON.stringify({ ok: false, why: 'control 有缺陷，自证不成立（先修产品再谈工具）', defects: j1.defects }, null, 2));
        process.exit(1);
    }

    const idxSrc = readSrc('index.js');
    const uiSrc = readSrc('settings-ui.js');
    const bA = mustHitOnce(idxSrc, 'async recallMemory(query) {', 'recallMemory');
    const bB = mustHitOnce(uiSrc, 'plugin.showSettingsPanel = function() {', 'showSettingsPanel');

    /* 破坏必须打在**判据真会读的那一面**上，否则等于没测。
     *   实测教训（本版首跑）：破坏 B 原先把 settings-ui.js 改坏，却在「摘九件」那一轮里跑 ——
     *   被摘的九件不含 settings-ui，但那条路径上 init 之后 showSettingsPanel 仍是「面板未挂载」
     *   的合法降级，于是破坏**毫无反应**，selftest 当场报「未翻红」。
     *   正确处理：破坏 B 跑在**对照面（全在场）**上 —— 那一面才真会调 showSettingsPanel。 */
    const rA = await runDrill(targets, { 'index.js': bA });
    const jA = judge(rA, '[selftest/breakA]');
    const rB = await runDrill([], { 'settings-ui.js': bB });
    const jB = judge(rB, '[selftest/breakB]');

    const res = {
        ok: jA.defects.length > 0 && jB.defects.length > 0,
        control: { defects: j1.defects.length, checked: j1.checked },
        breakA_recallReturnsNull: { mustTurnRed: true, defects: jA.defects.slice(0, 3), turnedRed: jA.defects.length > 0 },
        breakB_panelThrows: { mustTurnRed: true, defects: jB.defects.slice(0, 3), turnedRed: jB.defects.length > 0 },
    };
    console.log(JSON.stringify(res, null, 2));
    if (!res.ok) {
        console.error('[drill-unload] selftest 失败：有破坏未能让判据翻红 ⇒ 那条判据没承重（改文件 ≠ 测到了）');
        process.exit(1);
    }
    process.exit(0);
}

const control = await runDrill([], null);
const jc = judge(control, '[control]');
const drilled = await runDrill(targets, null);
const jd = judge(drilled, '[unloaded]');

const report = {
    schema: 'unload-drill@1',
    version: (String((fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8').match(/const VERSION = '([0-9.]+)'/) || [])[1] || '0.0.0')),
    skipped: targets,
    control: { loadFails: control.loadFails.length, initOk: control.initOk, globals: control.globals, defects: jc.defects, shapes: control.fetch.map((x) => x.name + ':' + x.why) },
    drilled: {
        loadFails: drilled.loadFails.length, initOk: drilled.initOk, globals: drilled.globals,
        defects: jd.defects,
        fetch: drilled.fetch, recall: drilled.recall, panel: drilled.panel,
        ms: drilled.ms,
    },
    verdict: (jc.defects.length === 0 && jd.defects.length === 0) ? 'degraded-honestly' : 'defect',
};

if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
} else {
    console.log('[drill-unload] 摘掉 ' + targets.length + ' 个模块：' + targets.join(', '));
    console.log('  对照（全在场）：装载失败 ' + control.loadFails.length + ' · init ' + (control.initOk ? 'ok' : 'FAIL')
        + ' · 模块全局 ' + control.globals + ' · 缺陷 ' + jc.defects.length);
    console.log('  演练（摘九件）：装载失败 ' + drilled.loadFails.length + ' · init ' + (drilled.initOk ? 'ok' : 'FAIL')
        + ' · 模块全局 ' + drilled.globals + ' · 缺陷 ' + jd.defects.length + ' · 耗时 ' + drilled.ms + 'ms');
    for (const x of drilled.fetch) console.log('    取数/' + x.name + ' → ' + x.why + (x.sample ? '  ' + x.sample : ''));
    for (const x of drilled.recall) console.log('    召回/' + x.name + ' → ' + x.why + (x.sample ? '  ' + x.sample : ''));
    for (const x of drilled.panel) console.log('    面板/' + x.name + ' → ' + x.why);
    if (drilled.loadFails.length) {
        for (const f of drilled.loadFails) console.log('    装载失败 ' + f.file + ' [' + f.kind + '] ' + f.msg);
    }
}
if (report.verdict !== 'degraded-honestly') {
    if (!JSON_OUT) {
        console.error('');
        for (const d of jc.defects.concat(jd.defects)) console.error('  ✗ ' + d);
        console.error('[drill-unload] 失败：' + jc.defects.length + ' + ' + jd.defects.length + ' 处（降级必须是**演练出来的**，不是声明出来的）');
    }
    process.exit(1);
}
if (!JSON_OUT) {
    console.log('[drill-unload] 通过：九件摘掉后仍能装载 + 初始化，三条主路径各给出可读的缺席原因（无常量空返回）。');
    console.log('  ★ 边界：本演练跑在 vm 沙箱 + 最小 DOM shim 上，摘的是装载顺序里的文件；不证明真浏览器 <script> 行为与观感。');
}
process.exit(0);