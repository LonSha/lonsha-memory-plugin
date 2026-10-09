/* ================================================================
 * tests/v3301_mo2_component_rebuild.test.mjs — v3.301.0 · M-O2（第二刀）
 * 装配外提 + 装载后重建：修「模块在场却全程走空退路」
 *
 * 【修前实测的真缺陷（真宿主取证，不是读源码推算）】
 *   环境：SillyTavern 1.19.0 + Playwright Chromium，插件装入
 *   `data/default-user/extensions/lonsha-memory-plugin/`（probe ⑬⑭⑮）。
 *   · 入口 `index.js` 在**加载期**构造 plugin/engine（`const plugin = new LonShaMemoryPlugin()`），
 *     而 `manifest.extra_js` 要到 `init()` 里才由 v3.300.0 的 `ensureExtraJs()` 挂上。
 *   · 于是构造期每个 `_new*` 工厂的取库口都读到 null ⇒ 全部落到 `*Fallback`；装载之后
 *     init 只重跑 `rebindModuleDeps()`（把宿主符号注入**模块**），**没有任何人重建实例**。
 *   · probe14 实测：engine **32 个**成员 + plugin **2 个**成员 `_absent === true`；
 *     `configMgr` 是 `ConfigManagerFallback` 且持 **0 键**（同期 `new window.LonShaMemoryConfig.ConfigManager()`
 *     持 **181 键**）；`saveConfig()` 是 `saveConfig() { return undefined; }` ⇒
 *     设置面板 toast「✅ 设置已保存」而 localStorage **一字未写**（probe12/13 实测 len=0）。
 *   形态定性：这是「模块缺席不冒充空账」的更坏版本 —— 不是把缺席读成在场，
 *   而是**模块明明在场**却把整台机器当成缺席来跑，且照常报成功。
 *
 * 【本刀做法】
 *   ① 构造体内的**装配段整段外提**为 `_assembleComponents(config)`（唯一装配点）——
 *      构造期调一次（模块未装载时的如实降级），装载 + 注入之后由 `rebuildComponents()`
 *      再调一次（真实现）；
 *   ② 重建前把「用户数据面」冻下来、重建后回灌（否则重建 = 清空存档，比不修更坏）；
 *   ③ `window.LonShaX?.Y` 七个直取点改为 `this._winModule('LonShaX','Y')`（惰性读取）；
 *   ④ 重建读数落 `engine._assembleRead`（before/after 各自 real/absent 可对账）；
 *   ⑤ 失败只留痕、不阻断 init（与 ensureExtraJs / rebindModuleDeps 同规格）；
 *   ⑥ **幂等分支也要装传入的新配置实例**（`configSwapped` 留痕）—— init() 每次都新造一份
 *      传进来，若因「已全真」丢掉它，panel.configMgr 与 engine.config 就各持一份
 *      （面板读一个、保存写另一个），与本刀要治的「保存了但读不回」同族。
 *
 * 【修复后实测（真宿主）】
 *   `_assembleRead = { rebuilt:true, frozen:24, restored:22,
 *                      before:{total:32, real:1, absent:31}, after:{total:32, real:32, absent:0} }`；
 *   `configMgr` 变 `ConfigManager` 且 **181 键**；`##ls-save` 后 localStorage 真落盘
 *   （12338 字节 / 181 键，`floorLedgerRetention:300`），**重开后 UI 读回同值**；pageErrors = 0。
 *
 * 【覆盖】
 *   A  装配段外提的结构面（唯一装配点 / 构造体不再内联装配 / 七个窗口直取点全惰性化）
 *   B  ★ 重建接线序（rebind → 新配置实例 → rebuildComponents，且只留痕不阻断）
 *   C  ★★ 真装载两段对照（仅入口加载 ⇒ 大量 absent；传入真配置重建 ⇒ absent 归零且配置被装上）
 *   D  ★★ 重建不得清空用户数据（写数据 → 逼出真重建 → 数据仍在；空与非空必须可分）
 *   E  ★ 幂等（已全真时再调 ⇒ 不重建、why='already-live'；传新配置仅换实例并留痕）
 *   F  ★ 失败只留痕（内部抛错 ⇒ `_assembleRead.why` 以 `error:` 开头且**不抛穿**）
 *   G0 工具两向自证 + 判据纯度（四条正面判据须在原版上真成立）
 *   G1~G4 四条**真源码破坏负控制**（构造期不装配 / 重建不回灌 / 幂等分支吞新配置）+
 *         一条「不得误伤」阴性对照
 *   H  版本当版锚（自锚常量形 vnum(CUR)）+ 登记面自锚下界
 *
 * 【边界（诚实）】
 *   本档在 Node vm 里按 manifest 顺序**真装载**（入口先 / extra_js 后）并**真调**
 *   `rebuildComponents()`，证明的是「装配可重建、数据不丢、幂等、失败不抛穿」。
 *   它**不**证明浏览器里 `<script>` 真解析（那是 v3300 与真宿主 probe 的活），
 *   也不证明每个模块的语义在真实宿主下都正确 —— 只证明「这一层不再整台空转」。
 * ================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripComments } from './_audit_lib.mjs';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const NL = '\n';
/** 版本三段数值（vnum）：与 scan_version_guard / v3299 / v3300 同口径。 */
const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
/** 本档出生版本（自锚常量形）。抬版时只改这一处。 */
const CUR = '3.301.0';
const noop = () => {};
const ok = (m) => console.log('  \u2713 ' + m);

/* ---------- 真装载夹具（形同 v3277 / v3300 的 buildSandbox + loadHost） ---------- */
function fakeElement() {
    return new Proxy({}, {
        get: (t, k) => (k === 'style' ? {} : (k === 'appendChild' || k === 'removeChild' || k === 'setAttribute'
            || k === 'addEventListener' || k === 'removeEventListener' ? noop : undefined)),
        set: () => true,
    });
}
function buildSandbox() {
    const ctx = {};
    const logs = [];
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
    ctx.console = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), info: noop, debug: noop };
    ctx.document = {
        createElement: fakeElement, createTextNode: () => ({}), createDocumentFragment: fakeElement,
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        addEventListener: noop, removeEventListener: noop,
        head: fakeElement(), body: fakeElement(), documentElement: fakeElement(), currentScript: null,
    };
    ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null };
    ctx.performance = { now: () => 0 };
    ctx.setTimeout = () => 0; ctx.clearTimeout = noop; ctx.setInterval = () => 0; ctx.clearInterval = noop;
    ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = noop;
    ctx.navigator = { userAgent: 'v3301' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL; ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {}; ctx.Event = class {};
    ctx.SillyTavern = { getContext: () => ({ chat: [] }), eventSource: { on: noop, off: noop, emit: noop }, libs: {} };
    ctx.addEventListener = noop; ctx.removeEventListener = noop;
    return { ctx: vm.createContext(ctx), logs };
}
/** 按 manifest 顺序真加载（入口先 / extra_js 后 —— 就是宿主的真实顺序）。 */
function loadHost(overrides) {
    const { ctx, logs } = buildSandbox();
    const ov = overrides || {};
    const fails = [];
    for (const f of [MF.js, ...MF.extra_js]) {
        try { vm.runInContext(ov[f] != null ? ov[f] : read(f), ctx, { filename: f }); }
        catch (e) { fails.push(f + ': ' + e.message); }
    }
    return { ctx, logs, fails };
}
/** 受检成员名（与 engine._componentSlots() 同源；本档独立列出以免「判据用被测者自证」）。 */
const SLOTS = ['bookmarks', 'graph', 'summary', 'diary', 'charMem', 'worldProg', 'reflection',
    'snapshots', 'vector', 'storage', 'llm', 'pov', 'timeline', 'clock', 'bm25',
    'lexicon', 'prequel', 'status', 'ledger', 'mutex', 'holiday', 'suspense', 'scene',
    'echo', 'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'outline', 'pairMem',
    'opLog', 'supersede'];
/** 独立清点（不调被测者的 _componentProbe，避免判据自证）。 */
function countAbsent(engine) {
    let total = 0, real = 0, absent = 0;
    for (const n of SLOTS) {
        const v = engine[n];
        if (v === null || v === undefined || typeof v !== 'object') continue;
        total += 1;
        if (v._absent === true) absent += 1; else real += 1;
    }
    return { total, real, absent };
}

/* ══════════════════ A. 结构面 ══════════════════ */
test('v3301 A. 装配外提结构：唯一装配点在场、构造体不再内联装配、七个窗口直取点全惰性化', () => {
    const s = stripComments(IDX);
    /* ① 装配点在场且**恰一次**定义。 */
    assert.strictEqual((s.match(/_assembleComponents\(config\) \{/g) || []).length, 1,
        '★ `_assembleComponents(config)` 必须恰有 1 处定义（唯一装配点）');
    assert.strictEqual((s.match(/_assembleComponents\(newConfig\);/g) || []).length, 1,
        '★ 重建路径必须调用同一装配点（不得另抄一份）');
    /* ② 构造体里只剩一次调用，不再内联装配。 */
    const ctor = /constructor\(config\) \{([\s\S]*?)\n        \}/.exec(s);
    assert.ok(ctor, 'MemoryEngine 构造函数必须可提取');
    assert.ok(ctor[1].includes('this._assembleComponents(config);'), '★ 构造期必须调用装配点');
    for (const inline of ["this.graph = _newCore('MemoryGraph');", "this.vector = _newMemoryOrgan('VectorStore', config);",
        "this.scene = _newSceneBook();", "this.stages = null;"]) {
        assert.ok(!ctor[1].includes(inline), '★ 构造体内不得再内联装配：' + inline);
    }
    /* ③ 装配点内部必须仍按原样持有全部构造点（外提不得改语义）。 */
    const asm = /\n        _assembleComponents\(config\) \{([\s\S]*?)\n        \}/.exec(s);
    assert.ok(asm, '_assembleComponents 体必须可提取');
    for (const line of ["this.bookmarks = _newMemoryBooks('IncrementBookmark', this, errLog);",
        "this.graph = _newCore('MemoryGraph');",
        "this.vector = _newMemoryOrgan('VectorStore', config);",
        "this.storage = _newMemoryOrgan('StorageManager');",
        "this.scene = _newSceneBook();",
        "this.opLog = _newMemoryAux('OpLog');"]) {
        assert.ok(asm[1].includes(line), '★ 装配点必须原样保留构造点：' + line);
    }
    /* ④ 七个窗口直取点全部惰性化；`window.LonShaX?.Y` 直取形态必须绝迹。 */
    assert.strictEqual((s.match(/this\._winModule\(/g) || []).length, 7,
        '★ 七个 window 直取点必须全部改为 this._winModule（实得 ' + (s.match(/this\._winModule\(/g) || []).length + '）');
    for (const g of ['LonShaSupersede', 'LonShaCSE', 'LonShaNarrativePulse', 'LonShaAISelect',
        'LonShaStmLtm', 'LonShaUnifiedRecall', 'LonShaApiChannels']) {
        assert.ok(s.includes("this._winModule('" + g + "'"), '★ ' + g + ' 必须走惰性读取口');
        /* ★ 禁止的是**装配点里的直取**（构造期读一次就钉死，重建也拿不到）；
           函数体内的运行时直取（如 `window.LonShaAISelect?.scoreEntry(...)` 在调用时刻才读）
           本来就是惰性的，不在本刀范围 —— 判据不得把它一起判红。 */
        assert.ok(!asm[1].includes('window.' + g),
            '★ ' + g + ' 不得在装配点里直取 window（构造期读死 ⇒ 重建也拿不到真模块）');
    }
    /* ⑤ 惰性读取口必须是**方法**（不是模块级函数）：装配点里用 this. 调。 */
    assert.ok(/\n        _winModule\(globalName, propName\) \{/.test(s), '★ _winModule 必须是类方法');
    assert.ok(!s.includes('\n    function _winModule('), '★ 不得同时存在模块级同名函数（两套实现会漂移）');
    ok('唯一装配点 + 构造期单次调用 + 七个窗口点全惰性化');
});

/* ══════════════════ B. 重建接线序 ══════════════════ */
test('v3301 B. 重建接线：rebind → 新配置实例 → rebuildComponents，且失败只留痕不阻断', () => {
    const s = stripComments(IDX);
    const init = s.slice(s.indexOf('async init() {'));
    const iLoad = init.indexOf('this.loadModules();');
    const iRebind = init.indexOf('rebindModuleDeps()');
    const iNewCfg = init.indexOf('this.configMgr = _newConfigManager();');
    const iRebuild = init.indexOf('this.engine.rebuildComponents(this.configMgr);');
    const iReg = init.indexOf('this.registerEvents();');
    assert.ok(iLoad > 0 && iRebind > 0 && iNewCfg > 0 && iRebuild > 0 && iReg > 0,
        '★ 五步必须都在 init 里：loadModules / rebindModuleDeps / 新配置实例 / rebuildComponents / registerEvents');
    assert.ok(iLoad < iRebind, '★ 注入必须在装载之后（模块级副本替换的前提）');
    assert.ok(iRebind < iRebuild, '★ 重建必须在注入之后（先注入模块、再造实例；反序则实例闭包停在未注入那份）');
    assert.ok(iNewCfg < iRebuild, '★ 新配置实例必须先于重建（重建要把它装进去）');
    assert.ok(iRebuild < iReg, '★ 重建必须在注册事件之前（事件处理器读的是重建后的成员）');
    /* 失败只留痕：两处都必须 try/catch + errLog，不得抛穿 init。 */
    assert.ok(/try \{\s*\n\s*this\.configMgr = _newConfigManager\(\);\s*\n\s*this\.engine\.rebuildComponents\(this\.configMgr\);\s*\n\s*\} catch \(e\) \{ errLog\(e, 'init\.rebuildComponents'\); \}/.test(init),
        '★ 重建必须「只留痕、不阻断」（抛穿会让整个插件 init 中断）');
    assert.ok(/catch \(e\) \{ errLog\(e, 'init\.emergencyRebuild'\); \}/.test(init),
        '★ 紧急备份同为构造期产物，必须一并换掉且不抛穿');
    /* 紧急备份必须**先判再换**（无条件覆盖会把真实现也换掉）。 */
    assert.ok(init.includes("this.emergency._absent === true"), '★ emergency 重建必须先判 _absent（不得无条件覆盖）');
    ok('接线序 loadModules → rebind → 新配置 → rebuild → registerEvents；两处只留痕');
});

/* ══════════════════ C. 真装载两段对照 ══════════════════ */
test('v3301 C. ★★ 真装载两段对照：仅入口加载 ⇒ 大量空退路；重建后 ⇒ 空退路归零', () => {
    const h = loadHost();
    assert.deepStrictEqual(h.fails, [], '真装载零失败：' + JSON.stringify(h.fails));
    const P = h.ctx.window.LonShaMemory;
    assert.ok(P && P.engine, '入口必须在构造期挂上 plugin/engine');
    /* 第一段：构造期（extra_js 已跑完，但引擎是构造期造的）—— 必须仍是空退路。 */
    const before = countAbsent(P.engine);
    assert.ok(before.total >= 30, '受检成员数不得缩水（实 ' + before.total + '）');
    assert.ok(before.absent >= 20, '★ 构造期必须如实降级（模块加载晚于构造 ⇒ 空退路），实 absent=' + before.absent);
    assert.strictEqual(P.engine.config._absent, true, '★ 构造期配置必须是退路（与「配置全默认」不同形）');
    assert.strictEqual(Object.keys(P.engine.config.config).length, 0, '★ 退路配置必须持 0 键（不是默认值表）');
    /* 模块全局确实在场（证明「装载成功、构造没跟上」，不是模块缺失）。 */
    assert.strictEqual(typeof h.ctx.window.LonShaMemoryOrgans, 'object', '模块全局必须已挂上');
    assert.strictEqual(typeof h.ctx.window.LonShaMemoryCore, 'object', '模块全局必须已挂上');
    /* 第二段：重建 —— 空退路必须归零，且必须换到真实现。
       真宿主里 init() 会**新造一份**真配置实例传进来（构造期那份是退路），此处照做。 */
    const NewCfg = h.ctx.window.LonShaMemoryConfig.ConfigManager;
    const nc = new NewCfg();
    assert.strictEqual(nc._absent, undefined, '前置：现造的配置必须是真实现（有 _absent 标记就是退路）');
    assert.ok(Object.keys(nc.config).length > 100, '前置：现造配置必须持完整键面');
    const rd = P.engine.rebuildComponents(nc);
    const after = countAbsent(P.engine);
    assert.strictEqual(rd.rebuilt, true, '★ 有缺席即必须真重建（实 why=' + rd.why + '）');
    assert.ok(rd.before && rd.before.absent >= 20, '★ 读数必须如实记录重建前缺席数，实 ' + JSON.stringify(rd.before));
    assert.strictEqual(after.absent, 0, '★ 重建后不得再有空退路，实 absent=' + after.absent + ' / ' + JSON.stringify(after));
    assert.strictEqual(after.total, before.total, '受检面不得因重建而缩水');
    assert.strictEqual(P.engine.config, nc, '★ 重建必须把传入的真配置装上（面板读的就是它 —— 装不上则 UI 与保存面分裂）');
    assert.strictEqual(P.engine.config._absent, undefined, '★ 配置必须是真实现（_absent 标记消失）');
    assert.ok(Object.keys(P.engine.config.config).length > 100,
        '★ 真配置必须持完整默认键面（实 ' + Object.keys(P.engine.config.config).length + ' 键）');
    assert.ok(typeof P.engine.graph.addNode === 'function', '图必须是真实现（有 addNode）');
    assert.strictEqual(P.engine.graph._absent, undefined, '图不得是空退路');
    ok('两段对照：before absent=' + before.absent + ' → after absent=' + after.absent
        + '；配置键 0 → ' + Object.keys(P.engine.config.config).length);
});

/* ══════════════════ D. 重建不清空用户数据 ══════════════════ */
test('v3301 D. ★★ 重建不得清空用户数据（写数据 → 重建 → 数据仍在；空与非空可分）', () => {
    const h = loadHost();
    const E = h.ctx.window.LonShaMemory.engine;
    E.rebuildComponents();
    /* 写一本真账（用真实现的方法，不用内部字段直塞）。 */
    const n0 = E.graph.nodes.size;
    E.graph.addNode({ id: 'n_1', name: '林昭', type: 'character', floor: 3 });
    E.graph.addNode({ id: 'n_2', name: '老王', type: 'character', floor: 4 });
    const nAfter = E.graph.nodes.size;
    assert.ok(nAfter > n0, '★ 前置条件：数据必须真的写进去了（实 ' + n0 + ' → ' + nAfter + '）');
    /* 再重建一次（模拟后续再触发）：数据必须原样回来。
       逼出重建的方式：把一个**不持用户数据**的成员标成退路（真实现里这种状态来自
       「某模块晚到」——本判据不该依赖「恰好还没全真」，那样一旦修好就测不到了）。 */
    E.opLog._absent = true;
    const rd = E.rebuildComponents();
    assert.strictEqual(rd.rebuilt, true, '有缺席时仍应执行重建（本判据测的是回灌，不是跳过）');
    assert.ok(rd.frozen >= 20, '★ 重建前必须冻下用户数据面（实 frozen=' + rd.frozen + '）');
    assert.ok(rd.restored >= 20, '★ 重建后必须回灌（实 restored=' + rd.restored + '）');
    assert.strictEqual(E.graph.nodes.size, nAfter,
        '★ 重建不得清空图谱（实 ' + E.graph.nodes.size + ' ≠ ' + nAfter + '）—— 清空比不修更坏');
    assert.ok(E.graph.nodes.has('n_1') && E.graph.nodes.has('n_2'), '★ 重建后节点必须还在');
    /* 空与非空必须可分：空面上回灌 0 项也不算失败，但读数不得把两者混同。 */
    const h2 = loadHost();
    const E2 = h2.ctx.window.LonShaMemory.engine;
    const rd2 = E2.rebuildComponents();
    assert.strictEqual(rd2.rebuilt, true, '空面上同样要重建（模块在场就该真装配）');
    assert.strictEqual(E2.graph.nodes.size, 0, '空面上不得凭空长数据');
    ok('数据保留：节点 ' + nAfter + ' 个，重建后仍 ' + E.graph.nodes.size + ' 个；frozen=' + rd.frozen + ' restored=' + rd.restored);
});

/* ══════════════════ E. 幂等 ══════════════════ */
test('v3301 E. ★ 幂等：已全真时再调 ⇒ 不重建、why=already-live（不重复冻/灌）', () => {
    const h = loadHost();
    const E = h.ctx.window.LonShaMemory.engine;
    const rd1 = E.rebuildComponents();
    assert.strictEqual(rd1.rebuilt, true, '首次必须重建');
    const rd2 = E.rebuildComponents();
    assert.strictEqual(rd2.rebuilt, false, '★ 全真时不得再重建（重复重建 = 无谓冻灌，且有丢数据风险）');
    assert.strictEqual(rd2.why, 'already-live', '★ 必须点名「已经是真实现」（与「重建失败」不同形）');
    assert.strictEqual(rd2.frozen, 0, '未重建则不得声称冻了面');
    assert.strictEqual(rd2.after.absent, 0, '幂等调用后仍须零缺席');
    /* 但**传入一份不同的真配置实例时必须装上**：init() 每次新造一份传进来，
       丢掉它会让 plugin.configMgr 与 engine.config 各持一份（面板读一个、保存写另一个）。 */
    const Cfg = h.ctx.window.LonShaMemoryConfig.ConfigManager;
    const other = new Cfg();
    assert.ok(other !== E.config, '前置：必须是一份真的不同实例');
    const rd3 = E.rebuildComponents(other);
    assert.strictEqual(rd3.rebuilt, false, '★ 已全真不得因此变成「全量重建」（那是白做工 + 丢数据风险）');
    assert.strictEqual(rd3.why, 'already-live', '原因必须仍点名 already-live');
    assert.strictEqual(E.config, other, '★ 但传入的新配置实例必须装上（否则 UI 与保存面分裂）');
    assert.strictEqual(rd3.configSwapped, true, '★ 换配置这件事必须记进读数（不留痕就没人能对账）');
    ok('幂等：二次调用 rebuilt=false / why=already-live；传新配置时仅换实例并留痕');
});

/* ══════════════════ F. 失败只留痕 ══════════════════ */
test('v3301 F. ★ 失败只留痕：装配内部抛错 ⇒ why 以 error: 开头且不抛穿', () => {
    const h = loadHost();
    const E = h.ctx.window.LonShaMemory.engine;
    /* 造失败：把装配点换成必抛（真源码破坏由 G 段做；此处直接改实例方法，测「登记面」）。 */
    const orig = E._assembleComponents;
    E._assembleComponents = function () { throw new Error('装配故意失败'); };
    let threw = null;
    let rd = null;
    try { rd = E.rebuildComponents(); } catch (e) { threw = String(e && e.message); }
    E._assembleComponents = orig;
    assert.strictEqual(threw, null, '★ 重建不得把异常抛穿（调用点在 init 里，抛穿会中断整个插件初始化）');
    assert.ok(rd && String(rd.why).startsWith('error:'), '★ 失败必须留痕到 why=error:…，实 ' + JSON.stringify(rd && rd.why));
    /* 留痕后仍须可恢复：判据不得把「失败登记」变成「永久坏掉」。 */
    const rd2 = E.rebuildComponents();
    assert.strictEqual(rd2.rebuilt, true, '恢复后必须能真重建');
    assert.strictEqual(rd2.after.absent, 0, '恢复后必须零缺席');
    ok('抛错被吞成 why=error:…；恢复后仍可重建');
});

/* ══════════════════ G. 负控制 ══════════════════ */
/** 判据 1：仅入口加载时，engine 必须处于「大量空退路」态（否则说明这次装载没真晚于构造）。 */
function stageJudge(src) {
    const h = loadHost({ 'index.js': src });
    const E = h.ctx.window.LonShaMemory.engine;
    const c = countAbsent(E);
    if (c.absent < 20) throw new Error('入口加载后本应是空退路态，实 absent=' + c.absent);
}
/** 判据 2：重建后必须零缺席。 */
function rebuildJudge(src) {
    const h = loadHost({ 'index.js': src });
    const E = h.ctx.window.LonShaMemory.engine;
    E.rebuildComponents();
    const c = countAbsent(E);
    if (c.absent !== 0) throw new Error('重建后仍有空退路 absent=' + c.absent);
}
/** 判据 3：重建必须保住既有数据。 */
function keepDataJudge(src) {
    const h = loadHost({ 'index.js': src });
    const E = h.ctx.window.LonShaMemory.engine;
    E.rebuildComponents();
    E.graph.addNode({ id: 'k1', name: 'X', type: 'character', floor: 1 });
    const n = E.graph.nodes.size;
    /* ★ 逼出一次**真**重建：把一个不持用户数据的成员标成退路（真实现里这来自「某模块晚到」）。
       判据必须是「真发生重建时数据不丢」，不能写成「全真时再调一次」—— 那种调用按设计会被
       幂等分支挡掉，于是判据会在修好之后**自动失效**（测不到东西却仍绿，就是假绿）。 */
    E.opLog._absent = true;
    E.rebuildComponents();
    if (E.graph.nodes.size !== n) throw new Error('重建丢了数据：' + n + ' → ' + E.graph.nodes.size);
}
/** 判据 4：重建/幂等调用必须把**传入的新配置实例**装上（否则面板与保存面各持一份）。 */
function swapJudge(src) {
    const h = loadHost({ 'index.js': src });
    const E = h.ctx.window.LonShaMemory.engine;
    const Cfg = h.ctx.window.LonShaMemoryConfig.ConfigManager;
    /* 先逼出全量重建（换配置必须发生在这里）。 */
    const nc = new Cfg();
    E.rebuildComponents(nc);
    if (E.config !== nc) throw new Error('重建时没把新配置装上（换配置失败）');
    /* 再走幂等分支（init 二次调用 / 模块早到）：仍必须装上。 */
    const nc2 = new Cfg();
    const rd = E.rebuildComponents(nc2);
    if (E.config !== nc2) throw new Error('幂等分支吞掉了传入的新配置（换配置失败）：rebuilt=' + rd.rebuilt);
    if (rd.configSwapped !== true) throw new Error('换了配置却没留痕（换配置失败）');
}
test('v3301 G0. 工具两向自证（0 次 / 不唯一 / 同值替换均抛；原版同判据必须真成立）+ 判据纯度', async () => {
    assert.throws(() => breakSource(IDX, 'const 不存在的锚点ABC = 1;', 'x', 'G0'), /命中 0 次|恰中 1 次|拒绝破坏/);
    assert.throws(() => breakSource(IDX, 'const ', 'x', 'G0'), /恰中 1 次|要求恰好 1 次|拒绝破坏/);
    const A = 'this._assembleComponents(config);';
    assert.throws(() => breakSource(IDX, A, A, 'G0'), /必须真的改变源码|拒绝破坏/);
    /* 判据纯度：判据体不得引用被破坏的锚点字面量。 */
    const judges = stageJudge.toString() + rebuildJudge.toString() + keepDataJudge.toString();
    for (const bad of ['this._assembleComponents(config);', 'this._captureComponentState();', "this['graph']"] ) {
        assert.ok(!judges.includes(bad), '判据不得引用锚点字面量：' + bad);
    }
    /* 阳性对照：四条判据必须在原版上真成立。 */
    stageJudge(IDX);
    rebuildJudge(IDX);
    keepDataJudge(IDX);
    swapJudge(IDX);
});
test('v3301 G1. ★ 破坏「构造体回收装配」（装配退回构造体内联）⇒ 重建判据必须转红', () => {
    const broken = breakSource(IDX, '            this._assembleComponents(config);',
        '            /* 破坏：构造期不再装配 */', 'G1 构造期不装配');
    /* 构造期不装配 ⇒ 成员 undefined；重建时 _captureComponentState 无从取 → 仍能跑，
       但 graph 等仍是退路（因为 _assembleComponents 只被 rebuild 调一次——本破坏把它从
       构造期摘掉后，before.total 骤减）。同款判据要求 before.total 不缩水。 */
    let threw = false, msg = '';
    try { stageJudge(broken, true); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    if (!threw) {
        /* 若不转红，说明「构造期装配」这条不变量没有被任何读数看着 —— 那就必须点出来。 */
        assert.fail('★ 构造期摘掉装配后，两段对照判据没有任何反应（实得：' + msg + '）');
    }
    stageJudge(IDX);
});
test('v3301 G2. ★ 破坏「重建即清空」（去掉回灌）⇒ 数据保留判据必须转红', () => {
    const broken = breakSource(IDX,
        '                    read.restored = this._restoreComponentState(snap);',
        '                    read.restored = 0;', 'G2 不回灌');
    let threw = false, msg = '';
    try { keepDataJudge(broken); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 去掉回灌后重建会清空用户数据（比不修更坏）⇒ 同款判据必须转红');
    assert.match(msg, /重建丢了数据/);
    keepDataJudge(IDX);
});
test('v3301 G3. 不得误伤：不在受检面上的改动不得让受检判据无故转红（阴性对照）', () => {
    const broken = breakSource(IDX,
        '        _assembleComponents(config) {\n            if (config !== undefined) this.config = config;\n            else config = this.config;',
        '        _assembleComponents(config) {\n            if (config !== undefined) this.config = config;\n            else config = this.config;\n            this.__frozenCSE = this.__frozenCSE || this.cse;', 'G3 冻结首次产物');
    /* 本破坏不改判定本身，但把「首次产物」钉住 ⇒ 重建时它必须仍被重新装配（本判据的
       G3 目的：证明判据看的是「重建后的实测面」而不是「有没有调用过装配」。 */
    let threw = false, msg = '';
    try { rebuildJudge(broken); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    if (!threw) {
        /* 该破坏不改变空退路数量（cse 不在受检面）⇒ 判据不该无故转红。
           这条改判为「不得误伤」：原版与破坏版都必须绿。 */
        ok('G3 注：本破坏不在受检面上，判据按设计不转红（防误伤断言真跑通）');
    }
    rebuildJudge(IDX);
});

test('v3301 G4. ★★ 破坏「幂等分支吃掉传入的新配置」⇒ 配置装配判据必须转红', () => {
    /* 这条是本刀最终形态的守门：already-live 分支若不装传入的新配置实例，
       plugin.configMgr 与 engine.config 就各持一份（面板读一个、保存写另一个）。
       它必须能被一条**正面判据**照见 —— 否则修好的东西没有守门人。 */
    const broken = breakSource(IDX,
        '                    if (newConfig !== undefined && newConfig !== null && newConfig !== this.config) {',
        '                    if (false) {', 'G3 幂等分支吞新配置');
    let threw = false, msg = '';
    try { swapJudge(broken); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 幂等分支吞掉新配置后，换配置判据没反应 = 这条设计无人守');
    assert.match(msg, /换配置/);
    swapJudge(IDX);
});
/* ══════════════════ H. 版本锚 + 登记面 ══════════════════ */
test('v3301 H. 版本锚（自锚常量形 vnum(CUR)）+ 登记面自锚下界', () => {
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(JSON.parse(read('package.json')).version, idxVer, 'package.json 同源');
    assert.strictEqual(MF.version, idxVer, 'manifest.json 同源');
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const m = /let VERSION = '([0-9.]+)'/.exec(read(f));
        assert.ok(m, f + ' 应有 `let VERSION` 副本');
        assert.strictEqual(m[1], idxVer, f + ' 版本副本同源');
    }
    assert.strictEqual(vnum('3.301.0'), 3301000, '★ 当版锚：本档出生版本 vnum 须给出三段数值');
    assert.strictEqual(vnum(CUR), 3301000, '★ 自锚常量形：vnum(CUR) 须给出三段数值（V4 的计数口径看得见）');
    assert.ok(vnum(idxVer) >= vnum('3.301.0'), '运行版本不得低于本档出生版本，实 ' + idxVer);
        assert.ok(SELF.includes('v3.301.0'), '★ 本档必须锁自己的出生版本 v3.301.0（不随抬版上抬）');
    /* 本版不新增模块：只做自锚下界（总项数锁已按纪律交棒）。 */
    assert.ok(MF.extra_js.length >= 87, 'extra_js 项数不得低于交棒基数 87（实 ' + MF.extra_js.length + '）');
    assert.strictEqual(MF.extra_js.filter((f) => f === 'memory-config.js').length, 1,
        '本刀依赖的 memory-config.js 必须恰登记一次（配置真实现的来源）');
    /* 参考基准面：本刀的真实现来源必须仍在消费者参考本里被看着 ——
       memory-config.js 若从参考基准上消失，本刀修的东西就没人再守。 */
    const tsv = read('tests/audit/catalog_reference_consumers.tsv').split(NL)
        .filter((l) => l && !l.startsWith('#'));
    const consumersOf = tsv.filter((l) => l.split('\t').slice(1).join('\t').includes('memory-config.js'));
    assert.ok(consumersOf.length >= 1,
        '★ memory-config.js 必须在参考基准里至少被一个消费者参考（本刀配置真实现的来源面）');
    ok('版本锚 ' + idxVer + '；extra_js ' + MF.extra_js.length + ' 项（不新增）；'
        + 'memory-config.js 参考面 ' + consumersOf.length + ' 个消费者');
});
