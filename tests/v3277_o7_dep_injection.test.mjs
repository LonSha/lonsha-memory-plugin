/* ============================================================
 * tests/v3277_o7_dep_injection.test.mjs — v3.277.0
 *
 * 主题：O7 —— 外移模块依赖真正生效（bindDeps 全量注入及失败部分可观察）。
 *
 * 【为什么本档存在】
 *   O7 之前的机制声称是「宿主把主人符号**现算注入**模块，避免副本静默漂移」，
 *   但**没有任何一面**能回答「这一轮到底注进去了没有」：三处调用点把返回值丢掉，
 *   而失败（模块缺席）与「成功但换了 0 项」的返回值都是 0 —— 三种根因同形。
 *
 * 【本轮实测的真缺陷（全部用真 vm 装载复现，不是文本推断）】
 *   ① 键面不匹配：宿主以对象简写写 `_moduleLib,`（键名即 `_moduleLib`），而模块读
 *      `d.moduleLib` ⇒ 这一个键**永不注入**（实测：对象简写换 7 项、显式键换 8 项）。
 *   ② 注入时机不存在：真实装载顺序是**入口先 / extra_js 后**，而三处注入点在引擎
 *      构造期，取库口又刻意惰性 ⇒ 构造期三处**必定** module-missing（实测读数），
 *      即这个机制在真实顺序下**从未生效过**，模块永远用自己的副本。
 *   ③ config 模板被 null 清空：模块侧用 `!== undefined` 放行 null，
 *      而 index.js 的注释声称「模块侧对 null 的处置是忽略」——注释与实现相反。
 *      触发路径即 `_newConfigManager` 首次构造前把尚为 null 的宿主变量推给模块。
 *   ④ 诊断行住在 selfCheck 的内联 IIFE 里 ⇒ 只能读源码判断、无法真跑。
 *
 * 【判据（全部以真源码为对象，破坏后必须翻红）】
 *   A 真装载：按 manifest 顺序把全部脚本灌进同一个 vm 上下文，必须零失败
 *   B 构造期读数：三处必须**如实**报 module-missing（不得伪造 ok）
 *   C 装载后重绑：三处全 ok，organs 必须换满 8 项（DEP_KEYS 键面）
 *   C2 init 时序：重绑必须真的挂在 loadModules 之后（真跑 init 复核）
 *   D 行为面：哨兵注入后模块内部符号**真的**被换（不是只改了计数器）
 *   E config null 语义 + 宿主注释与模块实现一致
 *   F 三态格式化真跑（未注入 / 全 ok / 有失败）
 *   G 自防护：判据体住本档 + 破坏走唯一真源 + 清单不得缩水 + 锚点纯度
 *   H 真源码破坏 -> 同一条判据必须翻红（五条）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { braceMatch, stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const Q = String.fromCharCode(39);
const IDX = read('index.js');
const SELF = read('tests/v3277_o7_dep_injection.test.mjs');
const MF = JSON.parse(read('manifest.json'));

/* ---------- 三处注入口与它们的键面（宿主必须逐个真供给） ---------- */
const INJECTORS = [
    { tag: 'organs', fn: '_bindOrganDeps', mod: 'memory-organs.js', g: 'LonShaMemoryOrgans',
      keys: ['errLog', 'numOr', 'decayScore', 'initEbbingMeta', 'sanitizeJson', 'moduleLib', 'fetchWithTimeoutRetry', 'version'] },
    { tag: 'core', fn: '_bindCoreDeps', mod: 'memory-core.js', g: 'LonShaMemoryCore',
      keys: ['errLog', 'sanitizeJson', 'moduleLib', 'memoryBooksLib', 'changesetLib', 'relativeTimeHelperFactory', 'version'] },
    { tag: 'config', fn: '_bindConfigDeps', mod: 'memory-config.js', g: 'LonShaMemoryConfig',
      keys: ['errLog', 'moduleLib', 'clearApiCooldowns', 'configDefaultsTemplate', 'version'] },
];
/* 判据与负控制共用的锚点。
 *   为什么写成模板串而不是字符串拼接：G 段的纯度判据要求「锚点字面量在本档只准出现一次」——
 *   拼接写法下档内根本不存在那段字面量（count=0），纯度判据就变成了空转。
 *   每个锚点在真源码里也必须恰中 1 次（否则负控制会误伤别处）。 */
const A_KEY = `                errLog, numOr, decayScore, sanitizeJson,
                moduleLib: _moduleLib,`;
const A_INIT = `            try { this.engine.rebindModuleDeps(); } catch (e) { errLog(e, 'O7.init.rebindModuleDeps'); }
`;
const A_NULL = ' && d.configDefaultsTemplate != null) {';
const A_BADOF = '        const badOf = (r) => r.filter((x) => !x || x.ok !== true);';
const A_REBIND = `            const read = [
                Object.assign({ tag: 'organs' }, _bindOrganDeps()),`;
const A_LIB = "_moduleLib(() => window.LonShaMemoryOrgans, 'memory-organs.js')";
const A_METHOD = 'rebindModuleDeps() {';

const noop = () => {};
const ok = (m) => console.log('  \u2713 ' + m);

/* ---------- 真实装载夹具（形同 tests/audit/scan_module_wiring.mjs 的 buildSandbox） ---------- */
function fakeElement() {
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'style') return {};
            if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
            if (typeof k === 'symbol') return undefined;
            if (['appendChild', 'removeChild', 'remove', 'addEventListener', 'removeEventListener',
                'setAttribute', 'getAttribute', 'insertBefore', 'querySelector'].includes(k)) return () => null;
            if (k === 'querySelectorAll') return () => [];
            if (['children', 'childNodes'].includes(k)) return [];
            return undefined;
        },
        set: () => true,
    });
}
/** 造一个隔离上下文；syncTimers=true 时 setTimeout 同步执行回调（否则 init 的 await 链不推进）。 */
function buildSandbox(syncTimers) {
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
    if (syncTimers) ctx.setTimeout = (fn) => { if (typeof fn === 'function') { try { fn(); } catch (e) {} } return 0; };
    else ctx.setTimeout = () => 0;
    ctx.clearTimeout = noop; ctx.setInterval = () => 0; ctx.clearInterval = noop;
    ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = noop;
    ctx.navigator = { userAgent: 'v3277' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL; ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {}; ctx.Event = class {};
    ctx.SillyTavern = { getContext: () => ({ chat: [] }), eventSource: { on: noop, off: noop, emit: noop }, libs: {} };
    ctx.addEventListener = noop; ctx.removeEventListener = noop;
    return { ctx: vm.createContext(ctx), logs };
}
/** 按 manifest 顺序真加载（入口先 / extra_js 后 —— 就是宿主的真实顺序）。overrides 可替换某文件内容。 */
function loadHost(order, overrides, syncTimers) {
    const { ctx, logs } = buildSandbox(syncTimers);
    const ov = overrides || {};
    const fails = [];
    for (const f of order) {
        try { vm.runInContext(ov[f] != null ? ov[f] : read(f), ctx, { filename: f }); }
        catch (e) { fails.push(f + ': ' + e.message); }
    }
    return { ctx, logs, fails };
}
const LOAD_ORDER = [MF.js, ...MF.extra_js];

/* ---------- 判据（正反两段跑的是同一个函数） ---------- */
/** A：真装载零失败 + 三处注入口与模块导出面在场。返回 null 或问题串。 */
function judgeA(h) {
    if (h.fails.length) return '装载失败：' + JSON.stringify(h.fails);
    const P = h.ctx.window.LonShaMemory;
    if (!P || !P.engine) return '入口未在构造期挂上 plugin/engine';
    for (const inj of INJECTORS) {
        if (typeof h.ctx.window[inj.g] !== 'object') return inj.mod + ' 未挂上全局';
        if (!new RegExp('function ' + inj.fn + '\\(\\)\\s*\\{').test(IDX)) return '宿主缺注入口 ' + inj.fn + '()';
        const mod = read(inj.mod);
        if (!/function bindDeps\(deps\)\s*\{/.test(mod)) return inj.mod + ' 缺 bindDeps(deps)';
        for (const k of inj.keys) {
            if (!mod.includes('d.' + k)) return inj.mod + ' 的 bindDeps 未读键 ' + k;
        }
    }
    return null;
}
/** B：构造期必须如实报三处 module-missing。 */
function judgeB(h) {
    const r = h.ctx.window.LonShaMemory.engine._bindDepsRead;
    if (!Array.isArray(r)) return '构造期未留下注入读数（修前返回值被丢弃）';
    if (r.length !== INJECTORS.length) return '读数不是三处：' + r.length;
    for (let i = 0; i < INJECTORS.length; i++) {
        if (r[i].tag !== INJECTORS[i].tag) return '读数顺序与注入口顺序不一致';
        if (r[i].ok !== false) return INJECTORS[i].tag + ' 在真实顺序下构造期必缺席，却报了 ok';
        if (r[i].why !== 'module-missing') return INJECTORS[i].tag + ' 缺席未点名根因：' + r[i].why;
        if (r[i].swapped !== 0) return INJECTORS[i].tag + ' 缺席时 swapped 应为 0';
    }
    return null;
}
/** C：装载后重绑三处全 ok 且 organs 换满 8 项、core 换满 7 项。 */
function judgeC(h) {
    const E = h.ctx.window.LonShaMemory.engine;
    if (E._bindDepsRebindRead !== null) return '重绑前应当是 null（与「重绑后全缺席」不同形）';
    const rd = E.rebindModuleDeps();
    if (!Array.isArray(rd) || rd.length !== INJECTORS.length) return '重绑读数不是三处';
    for (const x of rd) {
        if (!x || x.ok !== true) return (x && x.tag) + ' 装载后仍未注入成功：' + ((x && x.why) || '?');
    }
    const organ = rd.filter((x) => x.tag === 'organs')[0];
    if (organ.swapped !== 8) return 'organs 只换 ' + organ.swapped + ' 项（键面 DEP_KEYS 须 8 项）';
    const core = rd.filter((x) => x.tag === 'core')[0];
    if (core.swapped !== 7) return 'core 只换 ' + core.swapped + ' 项';
    /* config 键面 5 项，但这套夹具里宿主尚未冻结模板 ⇒ 第 5 项 `configDefaultsTemplate`
     *   是 null，**必须被忽略** ⇒ 只能换 4 项。这一条是 E 段语义在重绑读数上的观测点：
     *   若回到 `!== undefined`，同一夹具下会从 4 变 5（null 被当成一次真注入）。 */
    const cfg = rd.filter((x) => x.tag === 'config')[0];
    if (cfg.swapped !== 4) return 'config 应换 4 项（第 5 项 null 必须被忽略），实得 ' + cfg.swapped;
    return null;
}
/** C2：重绑必须真挂在 loadModules 之后 + 真跑 init 后读数落地。 */
function judgeInitOrder(idxSrc) {
    const L = idxSrc.split(NL);
    const li = L.findIndex((l) => l.indexOf('this.loadModules();') >= 0);
    if (li < 0) return 'init 里找不到 this.loadModules();';
    const win = L.slice(li, li + 6).join(NL);
    if (!win.includes('rebindModuleDeps()')) return 'loadModules 之后没有重绑调用（机制在真实顺序下永不生效）';
    return null;
}
/** D：哨兵真换了模块内部符号（不是只改计数器）。 */
function judgeD(mo) {
    for (const k of INJECTORS[0].keys) {
        const d = {};
        d[k] = (k === 'version') ? '9.9.9' : function sentinel() {};
        let n = null;
        try { n = mo.bindDeps(d); } catch (e) { return 'organs 的键 ' + k + ' 注入时抛了：' + e.message; }
        if (n !== 1) return 'organs 的键 ' + k + ' 单独注入未被接受（实得 ' + n + ' ⇒ 键名或类型不对）';
    }
    const bad = (function () { try { return mo.bindDeps({ _moduleLib: function () {} }); } catch (e) { return 'throw'; } })();
    if (bad !== 0) return '错键名 `_moduleLib` 被接受了（假绿：宿主写错也看起来注进去了）';
    /* 真换符号的行为证据：pass 进来的对象被模块当场上挂 clearCooldowns/getCooldownStats。 */
    const marker = function fetchWithTimeoutRetrySentinel() {};
    const n2 = mo.bindDeps({ fetchWithTimeoutRetry: marker });
    if (n2 !== 1) return 'fetchWithTimeoutRetry 未被接受';
    if (typeof marker.clearCooldowns !== 'function' || typeof marker.getCooldownStats !== 'function') return '模块声明换了符号，却没对传进来的对象做静态挂载（只改了计数器）';
    return null;
}
/** E：config 模板 null 语义 + 注释与实现一致。 */
function judgeE(overrides) {
    const ov = overrides || {};
    const mcSrc = ov['memory-config.js'] != null ? ov['memory-config.js'] : read('memory-config.js');
    const code = stripComments(mcSrc);
    if (!/configDefaultsTemplate\s*!=\s*null/.test(code)) return '模块侧未用 != null 落地「忽略 null」';
    if (/configDefaultsTemplate\s*!==\s*undefined/.test(code)) return '修前的 `!== undefined`（放行 null）复现';
    const ctx = {};
    ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx; ctx.global = ctx;
    ctx.console = { log: noop, warn: noop, error: noop, info: noop, debug: noop };
    ctx.module = { exports: {} }; ctx.exports = ctx.module.exports;
    const sb = vm.createContext(ctx);
    try { vm.runInContext(mcSrc, sb, { filename: 'memory-config.js' }); } catch (e) { return '模块装载失败：' + e.message; }
    const A = ctx.LonShaMemoryConfig || ctx.module.exports;
    if (!A || typeof A.bindDeps !== 'function' || typeof A.getConfigDefaultsTemplate !== 'function') return '模块导出面不齐';
    const before = A.getConfigDefaultsTemplate();
    const nNull = A.bindDeps({ configDefaultsTemplate: null });
    if (nNull !== 0) return 'null 被计入 swapped（' + nNull + '）—— null 不是一次真注入';
    if (A.getConfigDefaultsTemplate() !== before) return 'null 注入清空了已冻模板（迁移会静默失效）';
    const t = { a: 1 };
    const nVal = A.bindDeps({ configDefaultsTemplate: t });
    if (nVal !== 1) return '非 null 真值未被接受';
    if (A.getConfigDefaultsTemplate() !== t) return '非 null 真值未落地';
    if (!IDX.includes('\u6a21\u5757\u4fa7\u5bf9 null/undefined \u7684\u5904\u7f6e\u662f\u300c\u5ffd\u7565\u300d')) return '宿主注释缺失（注释与实现必须同时在场才可对账）';
    if (!IDX.includes('MC.bindDeps({ configDefaultsTemplate: _configDefaultsTemplate });')) return '宿主触发路径缺失（_newConfigManager 未把宿主变量推给模块）';
    return null;
}
/** F：三态格式化真跑。 */
function judgeF(idxSrc) {
    /* bodyOf 返回的是花括号体（不含参数列表），故这里自己接上声明头。 */
    const head = 'function _formatBindDepsRow(constructRead, rebindRead)';
    const at = idxSrc.indexOf(head);
    if (at < 0) return '找不到 _formatBindDepsRow（诊断行必须住在一个可被真跑的纯函数里）';
    const bd = braceMatch(idxSrc, idxSrc.indexOf('{', at));
    if (!bd) return '_formatBindDepsRow 的花括号不配对';
    let mk = null;
    try { mk = new Function('return ' + head + bd)(); } catch (e) { return '_formatBindDepsRow 不能真跑：' + e.message; }
    if (typeof mk !== 'function') return '_formatBindDepsRow 不是函数';
    const okRead = INJECTORS.map((x) => ({ tag: x.tag, ok: true, swapped: x.keys.length, why: '' }));
    const badRead = INJECTORS.map((x, i) => ({ tag: x.tag, ok: i !== 0, swapped: i === 0 ? 0 : x.keys.length, why: i === 0 ? 'module-missing' : '' }));
    const r1 = mk(null, null);
    if (!Array.isArray(r1) || r1.length !== 2 || r1[0] !== '依赖注入') return '返回形态不是 [标题, 值]';
    if (!r1[1].includes('未注入')) return '未走到构造期时必须如实说未注入，实得：' + r1[1];
    const r2 = mk(badRead, okRead);
    if (!r2[1].includes('已补齐')) return '构造期缺席 + 装载后补齐必须被说明（那是时机不是缺陷），实得：' + r2[1];
    if (!r2[1].includes('organs')) return '全 ok 时必须逐处报出 tag 与 swapped';
    const r3 = mk(okRead, badRead);
    if (!r3[1].startsWith('\u26a0')) return '有失败项时必须带警示（不得静默），实得：' + r3[1];
    if (!r3[1].includes('module-missing')) return '失败必须点名 why';
    /* 构造期就全 ok（模块提前在场）时，不得反过来说「已补齐」——「补齐」蕴含「曾经缺席」。 */
    const r4 = mk(okRead, null);
    if (r4[1].includes('已补齐')) return '构造期就全 ok，却声称「已补齐」（补齐蕴含曾经缺席，这是自我矛盾）';
    if (r4[1].startsWith('\u26a0')) return '构造期全 ok 时不应带警示';
    /* 构造期缺 1 项且未重绑时，必须明说「未重绑」（否则读者会以为是最终态）。 */
    const r5 = mk(badRead, null);
    if (!r5[1].includes('未重绑')) return '构造期有缺席且未重绑时必须点名「模块装载后未重绑」，实得：' + r5[1];
    return null;
}

/* ========== A 真装载 ========== */
test('v3277 A. 真实装载顺序（入口先 / extra_js 后）零失败，且三处注入口与模块导出面在场', () => {
    const h = loadHost(LOAD_ORDER);
    const p = judgeA(h);
    assert.equal(p, null, p || '');
    ok('入口 + ' + MF.extra_js.length + ' 个额外脚本零失败；三处键面与模块消费者名一致');
});

/* ========== B 构造期读数 ========== */
test('v3277 B. 构造期必须如实报三处 module-missing（不得伪造 ok / 不得静默）', () => {
    const h = loadHost(LOAD_ORDER);
    const p = judgeB(h);
    assert.equal(p, null, p || '');
    ok('构造期三态如实：' + h.ctx.window.LonShaMemory.engine._bindDepsRead.map((x) => x.tag + '/' + x.why).join(' '));
});

/* ========== C 装载后重绑 ========== */
test('v3277 C. 模块装载后重绑：三处全 ok，且 organs 必须换满键面全部 8 项', () => {
    const h = loadHost(LOAD_ORDER);
    const p = judgeC(h);
    assert.equal(p, null, p || '');
    ok('重绑读数：' + h.ctx.window.LonShaMemory.engine._bindDepsRebindRead.map((x) => x.tag + ' ' + x.swapped).join(' / '));
});

/* ========== C2 init 时序（真跑 init） ========== */
test('v3277 C2. 重绑真挂在 loadModules 之后：真跑 init 后读数落地', async () => {
    const p0 = judgeInitOrder(IDX);
    assert.equal(p0, null, p0 || '');
    const h = loadHost(LOAD_ORDER, {}, true);
    const P = h.ctx.window.LonShaMemory;
    await P.init();
    const rd = P.engine._bindDepsRebindRead;
    assert.ok(Array.isArray(rd), 'init 走完后重绑读数必须已落地（否则机制从未生效）');
    const organ = rd.filter((x) => x.tag === 'organs')[0];
    assert.equal(organ.ok, true, 'init 流程里 organs 必须注入成功');
    assert.equal(organ.swapped, 8, 'init 流程里 organs 必须换满 8 项，实得 ' + organ.swapped);
    assert.equal(P.initialized, true, 'init 必须真的走完（否则本判据是在空转）');
    ok('init 真跑：重绑读数落地 ' + rd.map((x) => x.tag + ' ' + x.swapped).join(' / ') + '；initialized=true');
});

/* ========== D 行为面 ========== */
test('v3277 D. 行为面：八个键逐个被接受、错键名被拒、且模块真换了符号（不是只改计数器）', () => {
    const h = loadHost(LOAD_ORDER);
    const p = judgeD(h.ctx.window.LonShaMemoryOrgans);
    assert.equal(p, null, p || '');
    ok('八键逐个接受；错键名 `_moduleLib` 如实拒绝；fetchWithTimeoutRetry 静态挂载真执行');
});

/* ========== E config null 语义 ========== */
test('v3277 E. config 模板：null 必须被忽略（不得清空已冻值），注释与实现一致', () => {
    const p = judgeE(null);
    assert.equal(p, null, p || '');
    ok('null 忽略 / 真值接受 / `!= null` 与宿主注释一致');
});

/* ========== F 三态格式化真跑 ========== */
test('v3277 F. 依赖注入诊断行：三态真跑（未注入 / 已补齐 / 失败点名 / 未重绑）', () => {
    const p = judgeF(IDX);
    assert.equal(p, null, p || '');
    assert.ok(IDX.includes('_formatBindDepsRow(this._bindDepsRead, this._bindDepsRebindRead),'), 'selfCheck 必须真的调用这个纯函数（否则纯函数是死代码）');
    ok('三态真跑：未注入 / 已补齐 / 失败点名 / 未重绑；selfCheck 真调用它');
});

/* ========== G 自防护 ========== */
test('v3277 G. 判据面自防护：实现住本档 + 破坏走唯一真源 + 清单不缩水 + 锚点纯度', () => {
    assert.ok(SELF.includes('breakSource') && SELF.includes('./_break_kit.mjs'), '破坏必须走唯一真源');
    assert.ok(SELF.includes('vm.createContext'), '必须真装载（不是文本推断）');
    assert.ok(SELF.includes('rebindModuleDeps'), '必须真跑重绑');
    assert.equal(INJECTORS.length, 3, '三处注入口，不得缩水');
    assert.equal(INJECTORS[0].keys.length, 8, 'organs 键面八项');
    assert.equal(INJECTORS[1].keys.length, 7, 'core 键面七项');
    assert.equal(INJECTORS[2].keys.length, 5, 'config 键面五项');
    assert.ok(SELF.length > 9000, '本档不得被掏空（当前 ' + SELF.length + ' 字节）');
    for (const [label, anchor, src] of [
        ['键面行', A_KEY, IDX],
        ['init 重绑调用', A_INIT, IDX],
        ['null 过滤', A_NULL, read('memory-config.js')],
        ['失败过滤', A_BADOF, IDX],
        ['重绑收集点', A_REBIND, IDX],
        ['取库口', A_LIB, IDX],
        ['重绑方法', A_METHOD, IDX],
    ]) {
        assert.equal(src.split(anchor).length - 1, 1, label + ' 锚点在真源码里必须恰中 1 次（否则负控制会误伤别处）');
        assert.equal(SELF.split(anchor).length - 1, 1, label + ' 的锚点字面量在本档只准声明一次（纯度：判据不得引用自身破坏锚点）');
    }
    ok('判据实现 / 破坏真源 / 清单规模 / 锚点纯度四者自洽');
});

/* ========== H 真源码破坏 -> 同一条判据必须翻红 ========== */
test('v3277 H. 真源码破坏 -> 同一条判据必须翻红（键名 / 时机 / null / 三态 / 伪报各一条）', () => {
    const noted = [];
    /* ① 键名退回对象简写（修前缺陷）⇒ organs 只换 7 项，C/D 必须翻红。 */
    const b1 = breakSource(IDX, A_KEY, '                errLog, numOr, decayScore, sanitizeJson,' + NL + '                _moduleLib,', 'O7-键名退简写');
    const p1 = judgeC(loadHost(LOAD_ORDER, { 'index.js': b1 }));
    assert.ok(p1 && p1.includes('8'), '键名写错后 C 必须翻红并指出项数，实得：' + p1);
    const mo1 = breakSource(read('memory-organs.js'), "        if (typeof d.moduleLib === 'function') { _moduleLib = d.moduleLib; n++; }", '', 'O7-模块改读错键');
    const p1b = judgeD(loadHost(LOAD_ORDER, { 'memory-organs.js': mo1 }).ctx.window.LonShaMemoryOrgans);
    assert.ok(p1b && p1b.includes('moduleLib'), '模块侧改读错键后 D 必须翻红，实得：' + p1b);
    noted.push('键名');
    /* ② 删掉装载后重绑调用 ⇒ 时序判据必须翻红。 */
    const b2 = breakSource(IDX, A_INIT, '', 'O7-重绑调用被删');
    const p2 = judgeInitOrder(b2);
    assert.ok(p2, '删掉重绑调用后时序判据必须翻红（实得 null ⇒ 判据没在工作）');
    noted.push('时机');
    /* ③ 模块侧退回 `!== undefined`（放行 null）⇒ null 语义判据必须翻红。 */
    const b3 = breakSource(read('memory-config.js'), A_NULL, ' && d.configDefaultsTemplate !== undefined) {', 'O7-null 过滤被撤');
    const p3 = judgeE({ 'memory-config.js': b3 });
    assert.ok(p3, '撤掉 null 过滤后 E 必须翻红（实得 null ⇒ 判据没在工作）');
    /* 同一破坏必须也打在重绑读数上：null 被当一次真注入 ⇒ config 从 4 变 5（C 翻红）。 */
    const p3b = judgeC(loadHost(LOAD_ORDER, { 'memory-config.js': b3 }));
    assert.ok(p3b && p3b.indexOf('config') >= 0, '撤掉 null 过滤后 C 必须一起翻红（实得 ' + p3b + ' ⇒ 两个观测点没闭环）');
    noted.push('null');
    /* ④ 失败过滤退化成空数组 ⇒ 三态判据必须翻红（有失败也报 ok）。 */
    const b4 = breakSource(IDX, A_BADOF, '        const badOf = (r) => [];', 'O7-三态退化');
    const p4 = judgeF(b4);
    assert.ok(p4, '三态退化后 F 必须翻红（实得 null ⇒ 判据没在工作）');
    noted.push('三态');
    /* ⑤ 重绑只写读数不真注入 ⇒ C 的 swapped 必须掉下来。 */
    const b5 = breakSource(IDX, A_REBIND, '            const read = [' + NL + '                Object.assign({ tag: ' + Q + 'organs' + Q + ' }, { ok: true, swapped: 0, why: ' + Q + Q + ' }),', 'O7-重绑伪报');
    const p5 = judgeC(loadHost(LOAD_ORDER, { 'index.js': b5 }));
    assert.ok(p5, '重绑伪报后 C 必须翻红（实得 null ⇒ 判据被伪报骗过）');
    noted.push('伪报');
    /* 破坏口径（真源唯一）：锚点恰中 1 次由 breakSource 保证，这里补「必须真的改变源码」。 */
    for (const [tag, a, b] of [['键名', IDX, b1], ['重绑调用', IDX, b2], ['null 过滤', read('memory-config.js'), b3], ['三态', IDX, b4], ['重绑伪报', IDX, b5]]) {
        assert.notEqual(a, b, tag + ' 的破坏必须真的改变源码');
    }
    ok('五条真源码破坏各自打在观测点上并让同款判据翻红：' + noted.join(' / '));
});

/* ========== I 版本锚（当版锚点，供版本守卫 V4） ========== */
test('v3277 I. 四源同源：index / manifest / package 三源都是当版', () => {
    const m = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(IDX);
    assert.ok(m, 'index.js 里找不到 const VERSION');
    const vnum = (s) => { const q = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim()); return q ? Number(q[1]) * 1000000 + Number(q[2]) * 1000 + Number(q[3]) : NaN; };
    assert.ok(vnum(m[1]) === vnum('3.277.0'), 'index.js VERSION 应为当版，实得 ' + m[1]);
    assert.equal(MF.version, m[1], 'manifest.version 与 index.js 同源');
    assert.equal(JSON.parse(read('package.json')).version, m[1], 'package.json version 与 index.js 同源');
    ok('三源同源 ' + m[1]);
});
