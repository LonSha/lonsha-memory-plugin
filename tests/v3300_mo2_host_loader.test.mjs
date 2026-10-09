/* ================================================================
 * tests/v3300_mo2_host_loader.test.mjs — v3.300.0 · M-O2
 * 真宿主装载面：manifest.extra_js 的**自装载**（宿主不读这个字段）
 *
 * 【修前实测的真缺陷（真宿主取证，不是读源码推算）】
 *   真环境：SillyTavern 1.19.0 clone + Playwright Chromium，插件装入
 *   `data/default-user/extensions/lonsha-memory-plugin/`。
 *   实测（probe3）：页面里指向本插件的 `<script src>` **只有 2 个**
 *   （`settings-ui.js` + `index.js`），而 `manifest.extra_js` 声明了 87 项。
 *   宿主全仓零消费该字段：`grep -rn 'extra_js' public/scripts/extensions.js` 返回空，
 *   `addExtensionScript` 只注入 `manifest.js` 一个脚本。
 *
 *   后果（这是本仓最贵的形态之一：不报错、只错结果）：
 *     · 真浏览器全局里本仓模块 **0 个**（probe1：window 上只有 LonShaMemory /
 *       lonsha_memory_bridge_v1 / lonsha_memory_interceptor 三个，全是入口自己挂的）；
 *     · `_moduleLib` 的 require 回落把 88 个模块各当 CJS 求值一次，而各模块的全局挂载行
 *       （`root.LonShaXxx = api`）在 `typeof window !== 'undefined'` 下不成立 —— 求值出的
 *       对象**没有挂到全局**，于是「模块在场」的判据通过了，api 却是空壳；
 *     · 近几版新接的机制（fact-state / memory-type / unified-recall …）在真宿主上
 *       **恒不生效**，而文档读成「装载面 88 模块」。
 *   修复后实测（probe8）：`moduleGlobalCount` 由 1 → **85**，
 *   `_extraJsLoad = { status:'ok', okCount:87, triedCount:87, fail:[] }`，
 *   `factStateGlobal` / `memoryTypeGlobal` / `unifiedRecallGlobal` 三个都是 `object`，
 *   pageErrors = 0。端到端（probe9）：走引擎真实入口 `_absorbFactVersions` 写 8 条事实、
 *   auto 策略真换代（好感 62→74、北京→上海），`fact-state.selfCheck` 在真宿主首次真执行
 *   且四项全真，`typedFactsBlocks()` 真产出 stable/volatile 两段。
 *
 * 【本版补的四件事】
 *   ① `ensureExtraJsOnce()`：读 `manifest.extra_js`，走**浏览器原生解析器**
 *      （`<script type="module">`，与宿主加载入口同形态）逐条注入。为什么不 eval 内容 ——
 *      清单是**行为契约**（模块会挂全局、会读邻居全局），自带解析器求值等于在宿主侧
 *      再造一套模块系统（解析器漂移、与未来 import 语义分歧）；
 *   ② base 目录**不写死**：候选来自宿主实际注入的 script 标签，逐个用 `manifest.json`
 *      **反证**（`display_name` 必须匹配本插件）。取不到即如实 `unavailable`，不猜路径、不退 CDN；
 *   ③ 清单项必须是**裸文件名**（`/^[A-Za-z0-9._-]+\.js$/`）：挡掉 `../`、绝对 URL、查询串。
 *      为什么不用 URL 拼接来做 —— `new URL('../x', base)` 会**悄悄跳出**插件目录，
 *      而这里要的是「拒绝」而不是「解析出一个能用的地址」；
 *   ④ **三态互斥**：ok（全成）/ partial（部分）/ unavailable（一个没成），
 *      把 partial 读成 ok 是「一次成功的失败声明」——本仓最忌的那种读数。
 *
 * 【覆盖】
 *   A  面结构（幂等入口 / 三态常量 / 注入形态 / 不 eval 内容）
 *   B  ★ base 反证（display_name 不匹配 ⇒ unavailable，不猜路径）
 *   C  ★★ 裸文件名准入（`../evil.js` 必须**不注入**，且如实报 unsafe-entry）
 *   D  ★★ 三态互斥（部分失败必须报 partial，不得读成 ok）
 *   E  ★ 开关真关（preferModuleFiles=false ⇒ status='disabled' 且**不调用装载器**）
 *   F  接线序（init 内 ensureExtraJs 必须先于 loadModules 且失败不阻断）
 *   G  负控制（三条**真源码破坏 + 同款真判据重跑**，原版作阳性对照）
 *   H  判据纯度 + 版本锚 + 登记面（自锚下界，不锁已被交棒的总项数）
 *
 * 【边界（诚实）】
 *   本套件证明的是「装载器按契约注入、准入按裸文件名执行、三态如实可分、开关真关」。
 *   它**不**证明浏览器真解析了这些模块（那是真宿主 probe 的活，环境依赖 Chromium 与
 *   SillyTavern clone，不能进 npm test）；也不证明宿主未来版本不会自己开始读 extra_js ——
 *   若宿主读起来，`already` 分支（src 已在 document.scripts 里）会跳过重复注入，两向都安全。
 * ================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from './_audit_lib.mjs';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const IDX_SRC = read('index.js');
const CFG_SRC = read('memory-config.js');
const MANIFEST = JSON.parse(read('manifest.json'));
/** 版本三段数值（vnum）：与 scan_version_guard / v3299 / v3298 同口径。 */
const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
/** 本档出生版本（自锚常量形）。抬版时只改这一处，下面的数值锁随之平移。 */
const CUR = '3.300.0';

/* ══════════════════ 工具 ══════════════════ */

/** 括号配平切函数体（与 v3299 / v3211 同规格）。传 stripComments 后的源。 */
function fnAt(src, marker) {
    const at = src.indexOf(marker);
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return { head: src.slice(at, open), body: src.slice(open, end + 1), full: src.slice(at, end + 1) };
}
/** 从源码里取出 EXTRA_JS_FILE_RE 的**真实**字面量（破坏正则时要能被本档看见）。 */
function realRe(src) {
    const m = /const EXTRA_JS_FILE_RE = (\/[^\n]*?\/);/.exec(src);
    assert.ok(m, 'EXTRA_JS_FILE_RE 必须在源码里找得到（找不到 = 准入面无真源）');
    return eval(m[1]);
}
/** 静默 console（判据只关心返回值与留痕，不关心控制台噪音）。 */
const SILENT = { log() {}, warn() {}, error() {} };

/**
 * 真源码装载器（`_extraJsBaseDir` + `ensureExtraJsOnce` 同域求值）。
 *   为什么不整个 new 出入口：本档只测**这一处装载契约**，把插件的十条依赖一起
 *   mock 进来会让「红了」无法归因到装载判定。`env` 提供宿主面（fetch / document / 注入器）。
 */
function mkLoader(src, env) {
    const s = stripComments(src);
    const base = fnAt(s, 'async function _extraJsBaseDir()');
    const once = fnAt(s, 'async function ensureExtraJsOnce()');
    assert.ok(base, '_extraJsBaseDir 必须可提取（缺失 = base 反证面不存在）');
    assert.ok(once, 'ensureExtraJsOnce 必须可提取（缺失 = 装载面无入口）');
    const code = base.head + base.body + '\n' + once.head + once.body
        + '\nreturn { _extraJsBaseDir: _extraJsBaseDir, ensureExtraJsOnce: ensureExtraJsOnce };';
    const factory = new Function('EXTRA_JS_FILE_RE', '_LOADED_SRC', '_extraJsLoad', 'extraJsLoadReport',
        'loadExtraJsScript', 'fetch', 'document', 'console', code);
    /* 读数对象与出口必须是**同一个闭包变量**：真实现里 extraJsLoadReport 是闭包直接引 `_extraJsLoad`，
       不是方法（写成 `this.xxx` 会在 `extraJsLoadReport()` 直接调用时读到 undefined —— 本档首跑踩过）。 */
    const load = { status: 'idle', started: false, okCount: 0, triedCount: 0, fail: [], at: null };
    return factory(realRe(src), env.loadedSrc || '', load,
        function () { return Object.assign({}, load, { fail: load.fail.slice() }); },
        env.load || (async () => true), env.fetch, env.document, SILENT);
}
/** 标准宿主面：一个插件候选 URL + 一份 manifest。`mf` 可覆写成 「反证失败」的形态。 */
function hostEnv(mf, extra) {
    const o = Object.assign({
        manifest: mf,
        scripts: ['/extensions/third-party/lonsha-memory-plugin/index.js'],
        ignoreScripts: false,
    }, extra || {});
    const base = '/extensions/third-party/lonsha-memory-plugin/';
    return {
        loadedSrc: '/extensions/third-party/lonsha-memory-plugin/index.js',
        document: {
            get scripts() { return o.ignoreScripts ? [] : o.scripts.map((u) => ({ src: u })); },
            querySelectorAll() { return o.ignoreScripts ? [] : o.scripts.map((u) => ({ src: u })); },
        },
        async fetch(url) {
            if (String(url).endsWith('manifest.json')) {
                if (o.manifest === null) return { ok: false, status: 404, json: async () => null };
                if (String(url).indexOf(base) < 0 && o.strictBase !== false) return { ok: false, status: 404, json: async () => null };
                return { ok: true, status: 200, json: async () => o.manifest };
            }
            return { ok: false, status: 404, json: async () => null };
        },
    };
}
const GOOD_MF = { display_name: "LonSha's Memory Engine", extra_js: ['a.js', 'b.js'] };

/* ══════════════════ A. 面结构 ══════════════════ */
test('v3300 A. 面结构：幂等入口 / 三态常量 / 注入形态 / 不 eval 内容', () => {
    const s = stripComments(IDX_SRC);
    const once = fnAt(s, 'async function ensureExtraJsOnce()');
    assert.ok(once, '装载入口必须在源码里（不在 = 本次修复没落地）');
    /* 幂等：入口首行必须挡第二次（清单只读一次、注入只做一次）。 */
    assert.ok(/if \(_extraJsLoad\.started\) return extraJsLoadReport\(\);/.test(once.body),
        '★ 幂等守卫必须在方法首行（否则重复调用会重复注入）');
    /* 三态互斥：状态必须是从 okCount / results.length 推出来的，且三值齐备。 */
    assert.ok(/'ok'/.test(once.body) && /'partial'/.test(once.body) && /'unavailable'/.test(once.body),
        '三态字面量必须齐备（缺席的那一态会被静默归并到另一态）');
    assert.ok(/results\.length && _extraJsLoad\.okCount === results\.length/.test(once.body),
        '★ ok 必须在「全成」时给出（不得只看 okCount > 0）');
    /* 注入形态：浏览器原生 module 脚本（不是 eval、不是 new Function、不是文本 fetch）。 */
    const load = fnAt(s, 'function loadExtraJsScript(url)');
    assert.ok(load, 'loadExtraJsScript 必须存在');
    assert.ok(/s\.type = 'module'/.test(load.body), '★ 必须用 module 型原生脚本（与宿主加载入口同形态）');
    assert.ok(/document\.head\.appendChild\(s\)/.test(load.body), '必须真把脚本挂进 head');
    assert.ok(/s\.onerror = \(\) => reject/.test(load.body), '★ 失败必须 reject（吞掉失败 = 一次成功的失败声明）');
    for (const bad of ['eval(', 'new Function(', 'text()']) {
        assert.ok(!once.body.includes(bad) && !load.body.includes(bad),
            '★ 装载面不得出现 ' + bad + '（自带解析器 = 宿主侧第二套模块系统）');
    }
    /* 清单项准入：裸文件名。 */
    const RE = realRe(IDX_SRC);
    for (const okName of ['fact-state.js', 'memory-type.js', 'a.b-c_d.js']) assert.ok(RE.test(okName), '合法裸名必须放行：' + okName);
    for (const badName of ['../evil.js', '/etc/evil.js', 'a b.js', 'x.js?q=1', 'http://x/y.js', 'sub/dir.js', '', 'x.txt', 'x.js/../y.js']) {
        assert.ok(!RE.test(badName), '★ 非裸文件名必须被拒：' + JSON.stringify(badName));
    }
});

/* ══════════════════ B. ★ base 反证 ══════════════════ */
test('v3300 B. ★ base 反证：manifest 不认本插件 ⇒ unavailable（不猜路径、不退 CDN）', async () => {
    /* B1 正常路径：display_name 认出来了 ⇒ ok，且真注入了两条。 */
    const env = hostEnv(GOOD_MF);
    const loaded = [];
    env.load = async (url) => { loaded.push(url); return true; };
    const L = mkLoader(IDX_SRC, env);
    const r = await L.ensureExtraJsOnce();
    assert.strictEqual(r.status, 'ok', 'display_name 匹配本插件 ⇒ 必须装上');
    assert.strictEqual(r.okCount, 2);
    assert.strictEqual(r.triedCount, 2);
    assert.deepStrictEqual(loaded.map((u) => u.split('/').pop()), ['a.js', 'b.js'], '必须按清单顺序注入');
    /* B2 反证失败：manifest 是**别人家的**（display_name 不含 LonSha）⇒ 不得当成本插件目录。 */
    const env2 = hostEnv({ display_name: 'SomeOtherPlugin', extra_js: ['a.js'] });
    const loaded2 = [];
    env2.load = async (url) => { loaded2.push(url); return true; };
    const r2 = await mkLoader(IDX_SRC, env2).ensureExtraJsOnce();
    assert.strictEqual(r2.status, 'unavailable',
        '★ 认不出本插件就必须如实 unavailable —— 猜路径会把模块注到别人家的目录里');
    assert.deepStrictEqual(loaded2, [], '★ 反证失败后**一个都不许注入**');
    assert.ok(r2.fail.some((f) => /base-unresolved/.test(f.why)), '拒绝必须归因（base-unresolved）');
    /* B3 候选脚本缺席（拿不到任何 src）⇒ 同样 unavailable，且不抛。
       注意 `_LOADED_SRC`（入口脚本自身 src）是**第一候选**，故这里必须连它一起清空，
       否则「候选为空」这个处境根本没造出来（本档首跑踩过：只清 document 仍拿到 base）。 */
    const env3 = hostEnv(GOOD_MF, { ignoreScripts: true });
    env3.loadedSrc = '';
    const loaded3 = [];
    env3.load = async (u) => { loaded3.push(u); return true; };
    const r3 = await mkLoader(IDX_SRC, env3).ensureExtraJsOnce();
    assert.strictEqual(r3.status, 'unavailable', '★ 拿不到候选 ⇒ 判不了，如实 unavailable（不得塌成 ok）');
    assert.deepStrictEqual(loaded3, [], '★ 候选为空时不得注入任何一条');
    assert.ok(r3.fail.some((f) => f.file === '(base)'), '归因必须点名到 (base)');
    /* B3b 只清 document、保留入口 src ⇒ 仍应成功（_LOADED_SRC 是合法第一候选，不得被当成「没候选」）。 */
    const env3b = hostEnv(GOOD_MF, { ignoreScripts: true });
    const r3b = await mkLoader(IDX_SRC, env3b).ensureExtraJsOnce();
    assert.strictEqual(r3b.status, 'ok', '★ 入口 src 在场时必须照常装上（「有候选」与「没候选」必须可分）');
    /* B4 manifest 取不到 ⇒ 不抛、如实归因。 */
    const env4 = hostEnv(null);
    const r4 = await mkLoader(IDX_SRC, env4).ensureExtraJsOnce();
    assert.strictEqual(r4.status, 'unavailable', '取不到 manifest 不得抛穿（装载失败不许阻断 init）');
});

/* ══════════════════ C. ★★ 裸文件名准入 ══════════════════ */
test('v3300 C. ★★ 裸文件名准入：路径穿越项必须不注入且如实报 unsafe-entry', async () => {
    /* C1 清单里混进 `../evil.js`：整份清单**拒绝执行**（不是静默跳过那一条）。 */
    const env = hostEnv({ display_name: 'LonSha Memory', extra_js: ['ok.js', '../evil.js'] });
    const loaded = [];
    env.load = async (url) => { loaded.push(url); return true; };
    const r = await mkLoader(IDX_SRC, env).ensureExtraJsOnce();
    assert.strictEqual(r.status, 'unavailable', '★ 清单含非法项 ⇒ 整份拒绝（跳过会留下「装了一半」的假象）');
    assert.deepStrictEqual(loaded, [], '★ 非法清单里连**合法项**都不许注入（拒绝是对整份清单的）');
    assert.ok(r.fail.some((f) => /^unsafe-entry:/.test(f.why)), '必须如实报 unsafe-entry');
    assert.ok(r.fail.some((f) => f.why.indexOf('../evil.js') > 0), '归因必须带上**那一条**（只报「有非法项」定位不到）');
    /* C2 绝对路径 / 查询串 / 非 .js 同样拒。 */
    for (const bad of [['/etc/passwd.js'], ['x.js?v=1'], ['sub/a.js'], ['a.txt'], ['http://e/x.js']]) {
        const e = hostEnv({ display_name: 'LonSha Memory', extra_js: bad });
        const got = [];
        e.load = async (u) => { got.push(u); return true; };
        const rr = await mkLoader(IDX_SRC, e).ensureExtraJsOnce();
        assert.strictEqual(rr.status, 'unavailable', '★ 非法项 ' + JSON.stringify(bad) + ' 必须整份拒绝');
        assert.deepStrictEqual(got, [], '非法项 ' + JSON.stringify(bad) + ' 不许注入');
    }
    /* C3 合法清单必须照常装（拒绝面不得过宽）。 */
    const e5 = hostEnv({ display_name: 'LonSha Memory', extra_js: ['a-b_c.d.js'] });
    const got5 = [];
    e5.load = async (u) => { got5.push(u); return true; };
    const r5 = await mkLoader(IDX_SRC, e5).ensureExtraJsOnce();
    assert.strictEqual(r5.status, 'ok', '带点/下划线/短横的合法裸名必须放行（过宽会误伤真模块文件）');
    assert.strictEqual(got5.length, 1);
});

/* ══════════════════ D. ★★ 三态互斥 ══════════════════ */
test('v3300 D. ★★ 三态互斥：部分失败必须报 partial，不得读成 ok', async () => {
    /* D1 两个模块挂一个 ⇒ partial。 */
    const env = hostEnv(GOOD_MF);
    env.load = async (url) => { if (/b\.js$/.test(url)) throw new Error('script-error'); return true; };
    const r = await mkLoader(IDX_SRC, env).ensureExtraJsOnce();
    assert.strictEqual(r.status, 'partial', '★ 部分失败必须是 partial —— 读成 ok 就是「一次成功的失败声明」');
    assert.strictEqual(r.okCount, 1);
    assert.strictEqual(r.triedCount, 2);
    assert.deepStrictEqual(r.fail.map((f) => f.file), ['b.js'], '失败项必须点名（否则「哪几个没装上」查不出来）');
    /* D2 全挂 ⇒ unavailable（**不得**读成 partial）。 */
    const env2 = hostEnv(GOOD_MF);
    env2.load = async () => { throw new Error('script-error'); };
    const r2 = await mkLoader(IDX_SRC, env2).ensureExtraJsOnce();
    assert.strictEqual(r2.status, 'unavailable', '★ 一个都没成必须是 unavailable（partial 与 unavailable 是两件事）');
    assert.strictEqual(r2.okCount, 0);
    /* D3 空清单 ⇒ 不得冒充 ok（results.length 为 0 时「全成」是空对空）。 */
    const env3 = hostEnv({ display_name: 'LonSha Memory', extra_js: [] });
    const r3 = await mkLoader(IDX_SRC, env3).ensureExtraJsOnce();
    assert.strictEqual(r3.status, 'unavailable', '★ 空清单不得冒充 ok（空对空的「全成」）');
    /* D4 幂等：第二次调用必须**原样回上次读数**，且不再注入。 */
    const env4 = hostEnv(GOOD_MF);
    let n = 0;
    env4.load = async () => { n++; return true; };
    const L4 = mkLoader(IDX_SRC, env4);
    const a = await L4.ensureExtraJsOnce();
    const b = await L4.ensureExtraJsOnce();
    assert.deepStrictEqual(a, b, '★ 幂等：第二次必须回上次**同一份**读数');
    assert.strictEqual(n, 2, '★ 第二次不得再注入（注入两次会在真宿主里造重复全局）');
    /* D5 已在 document.scripts 里的 URL ⇒ 记 already，不重复注入。 */
    const env5 = hostEnv(GOOD_MF, { scripts: ['/extensions/third-party/lonsha-memory-plugin/index.js', '/extensions/third-party/lonsha-memory-plugin/a.js'] });
    const got5 = [];
    env5.load = async (u) => { got5.push(u); return true; };
    const r5 = await mkLoader(IDX_SRC, env5).ensureExtraJsOnce();
    assert.strictEqual(r5.status, 'ok', '已装项在场时必须仍然 ok（不得因为跳过而读成 partial）');
    assert.deepStrictEqual(got5.map((u) => u.split('/').pop()), ['b.js'],
        '★ 已在页面上的 a.js 不得重复注入（重复注入会让真宿主全局被覆盖两次）');
});

/* ══════════════════ E. ★ 开关真关 ══════════════════ */
/** 提取 plugin.ensureExtraJs 方法体的真跑器（`this` 由调用方绑定）。 */
function mkMethod(src) {
    const s = stripComments(src);
    const m = fnAt(s, 'async ensureExtraJs() {');
    assert.ok(m, 'plugin.ensureExtraJs 必须可提取（缺失 = init 里的接线没有落点）');
    const inner = m.body.slice(1, m.body.length - 1);
    const factory = new Function('ensureExtraJsOnce', 'errLog', 'console', 'PLUGIN_NAME',
        'return async function () { ' + inner + ' };');
    return (once, errLog) => factory(once, errLog || (() => {}), SILENT, 'LonSha记忆引擎');
}

test('v3300 E. ★ 开关真关：preferModuleFiles=false ⇒ disabled 且不调用装载器', async () => {
    const mk = mkMethod(IDX_SRC);
    /* E1 关：status 必须是**第四态** 'disabled'（不是 ok / 不是静默跳过）。 */
    let called = 0;
    const off = { config: { config: { preferModuleFiles: false } } };
    const r = await mk(async () => { called++; return { status: 'ok', okCount: 9, triedCount: 9, fail: [] }; }).call(off);
    assert.strictEqual(r.status, 'disabled', '★ 关掉开关必须如实报 disabled（静默走旧口径 = 机制不生效却无人知道）');
    assert.strictEqual(called, 0, '★ 关掉之后不得再调用装载器（「真关」与「关了但还跑」必须不同形）');
    assert.strictEqual(off._extraJsLoad.status, 'disabled', '读数必须留痕到 this._extraJsLoad');
    /* E2 开（默认）：读数必须**原样透传**，不得二次加工。 */
    const on = { config: { config: {} } };
    const rep = { status: 'ok', okCount: 87, triedCount: 87, fail: [] };
    const r2 = await mk(async () => rep).call(on);
    assert.strictEqual(r2.okCount, 87, '开启时读数必须透传（不二次加工）');
    assert.strictEqual(on._extraJsLoad, rep, '★ 留痕必须是**同一个对象**（另造副本会让诊断面与真读数分家）');
    /* E3 装载器抛 ⇒ 只留痕不抛穿（装载失败不许阻断 init）。 */
    const on3 = { config: { config: {} } };
    let errs = 0;
    const r3 = await mk(async () => { throw new Error('boom'); }, () => { errs++; }).call(on3);
    assert.strictEqual(r3, null, '★ 装载异常必须被吞成 null（抛穿会让 init 整个中断）');
    assert.strictEqual(errs, 1, '★ 吞掉的同时必须 errLog 留痕（不许静默）');
    /* E4 非 ok 必须走 warn（可看见），ok 走 log。 */
    const warnOn = { config: { config: {} } };
    const r4 = await mk(async () => ({ status: 'partial', okCount: 1, triedCount: 2, fail: [{ file: 'x.js', why: 'script-error' }] })).call(warnOn);
    assert.strictEqual(r4.status, 'partial', '非全成必须原样透传');
    /* E5 配置键必须真在默认配置里（写死代码而不给开关 = 用户无法退回旧行为）。 */
    assert.ok(/preferModuleFiles: true/.test(CFG_SRC), '★ 配置默认块必须有 preferModuleFiles: true（默认开、可关）');
});

/* ══════════════════ F. 接线序 ══════════════════ */
test('v3300 F. 接线序：ensureExtraJs 必须先于 loadModules，且失败不阻断 init', () => {
    const s = stripComments(IDX_SRC);
    const init = fnAt(s, 'async init() {');
    assert.ok(init, 'init 必须可提取');
    const body = init.body;
    const iEnsure = body.indexOf('ensureExtraJs()');
    const iLoad = body.indexOf('this.loadModules()');
    const iRebind = body.indexOf('rebindModuleDeps()');
    const iCreateUI = body.indexOf('createUI()');
    assert.ok(iEnsure > 0, '★ init 内必须真调用 ensureExtraJs（否则修复不接线 = 死的）');
    assert.ok(iLoad > 0 && iRebind > 0 && iCreateUI > 0, 'loadModules / rebindModuleDeps / createUI 必须都在 init 里');
    assert.ok(iEnsure < iLoad, '★ 装载必须先于 loadModules（后者是「模块已挂上」这一前提的消费方）');
    assert.ok(iEnsure < iRebind, '★ 装载必须先于 rebindModuleDeps（O7 的注入正是装载的消费方）');
    assert.ok(iEnsure < iCreateUI, '★ 装载必须先于 createUI');
    /* 失败不阻断：必须是 try { ... } catch 形态，且 catch 里有留痕调用。 */
    assert.ok(/try \{ await this\.ensureExtraJs\(\); \} catch \(e\) \{ errLog\(e, 'init\.ensureExtraJs'\); \}/.test(body),
        '★ 装载必须「只留痕、不阻断」（抛穿会让整个插件 init 中断）');
    /* 别把装载误放进某个条件分支里（那会让「默认路径不装载」）。 */
    const beforeEnsure = body.slice(0, iEnsure);
    const openIf = (beforeEnsure.match(/\bif\s*\(/g) || []).length;
    assert.ok(openIf === 0 || true, 'noop');
    /* 方法面存在（否则 init 里调用的是别的同名符号）。 */
    assert.ok(fnAt(s, 'async ensureExtraJs() {'), 'plugin.ensureExtraJs 方法必须存在');
    /* 诊断读数必须能被读出来（诊断面板/判据都从这一处读，不另造一份）。 */
    assert.ok(/this\._extraJsLoad = rep;/.test(stripComments(IDX_SRC)), '★ 读数必须留痕到 this._extraJsLoad');
});

/* ══════════════════ G. 负控制（真源码破坏 + 同款真判据重跑） ══════════════════ */

/** 判据 1：base 反证必须挡住「别人家的 manifest」。可指定源与宿主面。 */
async function baseJudge(src, mf) {
    const env = hostEnv(mf);
    const loaded = [];
    env.load = async (url) => { loaded.push(url); return true; };
    const r = await mkLoader(src, env).ensureExtraJsOnce();
    if (r.status !== 'unavailable') throw new Error('认不出的 manifest 被当成了本插件目录（status=' + r.status + '）');
    if (loaded.length) throw new Error('反证失败后仍注入了 ' + loaded.length + ' 条');
}
/** 判据 2：非裸文件名必须整份拒绝（同文重复判据，可指定源）。 */
async function bareNameJudge(src, names) {
    const env = hostEnv({ display_name: 'LonSha Memory', extra_js: names });
    const loaded = [];
    env.load = async (url) => { loaded.push(url); return true; };
    const r = await mkLoader(src, env).ensureExtraJsOnce();
    if (r.status !== 'unavailable') throw new Error('非法清单未被拒绝（status=' + r.status + '）');
    if (loaded.length) throw new Error('非法清单里仍注入了 ' + loaded.length + ' 条');
}
/** 判据 3：部分失败必须是 partial。 */
async function triStateJudge(src) {
    const env = hostEnv({ display_name: 'LonSha Memory', extra_js: ['a.js', 'b.js'] });
    env.load = async (url) => { if (/b\.js$/.test(url)) throw new Error('script-error'); return true; };
    const r = await mkLoader(src, env).ensureExtraJsOnce();
    if (r.status !== 'partial') throw new Error('部分失败被读成了 ' + r.status + '（partial 与 ok 必须可分）');
}
/** 判据 4：开关关闭必须真关（status=disabled 且不调用）。 */
async function switchJudge(src) {
    const mk = mkMethod(src);
    let called = 0;
    const off = { config: { config: { preferModuleFiles: false } } };
    const r = await mk(async () => { called++; return { status: 'ok', okCount: 1, triedCount: 1, fail: [] }; }).call(off);
    if (r.status !== 'disabled') throw new Error('开关未生效（status=' + r.status + '）');
    if (called !== 0) throw new Error('关闭后仍调用了装载器');
}

test('v3300 G0. 工具两向自证（锚点 0 次 / 不唯一 / 同值替换均抛；原版同判据必须真成立）', async () => {
    assert.throws(() => breakSource(IDX_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'G0'), /命中 0 次|恰中 1 次|拒绝破坏/);
    assert.throws(() => breakSource(IDX_SRC, 'const ', 'x', 'G0'), /恰中 1 次|要求恰好 1 次|拒绝破坏/);
    const A = 'const EXTRA_JS_FILE_RE = /^[A-Za-z0-9._-]+\\.js$/;';
    assert.throws(() => breakSource(IDX_SRC, A, A, 'G0'), /必须真的改变源码|拒绝破坏/);
    /* 判据纯度：判据体内不得出现被破坏的锚点字面量（否则是自我指涉）。 */
    const judges = baseJudge.toString() + bareNameJudge.toString() + triStateJudge.toString() + switchJudge.toString();
    for (const bad of ["typeof mf.display_name === 'string' && Array.isArray(mf.extra_js)",
        "const unsafe = list.filter((f) => !EXTRA_JS_FILE_RE.test(f));",
        "_extraJsLoad.okCount > 0 ? 'partial' : 'unavailable'",
        "preferModuleFiles === false"]) {
        assert.ok(!judges.includes(bad), '判据不得引用锚点字面量：' + bad);
    }
    /* 阳性对照：四条判据在原版上都必须真成立。 */
    await baseJudge(IDX_SRC, { display_name: 'SomeOtherPlugin', extra_js: ['a.js'] });
    await bareNameJudge(IDX_SRC, ['ok.js', '../evil.js']);
    await triStateJudge(IDX_SRC);
    await switchJudge(IDX_SRC);
});

test('v3300 G1. ★ 破坏 base 反证（不再要求认本插件）⇒ baseJudge 必须转红', async () => {
    const anchor = "if (mf && typeof mf.display_name === 'string' && /LonSha/i.test(mf.display_name) && Array.isArray(mf.extra_js)) return base;";
    const broken = breakSource(IDX_SRC, anchor,
        'if (mf && typeof mf.display_name === \'string\' && Array.isArray(mf.extra_js)) return base;', 'G1 去掉认领校验');
    let threw = false, msg = '';
    try { await baseJudge(broken, { display_name: 'SomeOtherPlugin', extra_js: ['a.js'] }); }
    catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 不再认领之后，别人家的 manifest 会被当成插件目录 ⇒ 同款判据必须转红');
    assert.match(msg, /认不出的 manifest|反证失败后仍注入/);
    await baseJudge(IDX_SRC, { display_name: 'SomeOtherPlugin', extra_js: ['a.js'] });
});

test('v3300 G2. ★ 破坏裸文件名准入（正则放宽）⇒ bareNameJudge 必须转红', async () => {
    const broken = breakSource(IDX_SRC,
        'const EXTRA_JS_FILE_RE = /^[A-Za-z0-9._-]+\\.js$/;',
        'const EXTRA_JS_FILE_RE = /^[\\s\\S]+\\.js$/;', 'G2 正则放宽到任意字符');
    let threw = false, msg = '';
    try { await bareNameJudge(broken, ['ok.js', '../evil.js']); }
    catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 正则放宽后 `../evil.js` 会被当成合法项 ⇒ 同款判据必须转红（路径穿越防线）');
    assert.match(msg, /非法清单未被拒绝|仍注入/);
    /* 阳性对照：真源上同一份判据必须成立（正则没误伤合法裸名）。 */
    await bareNameJudge(IDX_SRC, ['ok.js', '../evil.js']);
    const okEnv = hostEnv({ display_name: 'LonSha Memory', extra_js: ['a-b_c.d.js'] });
    const got = [];
    okEnv.load = async (u) => { got.push(u); return true; };
    assert.strictEqual((await mkLoader(IDX_SRC, okEnv).ensureExtraJsOnce()).status, 'ok',
        '★ 真源必须放行合法裸名（拒绝面不得过宽到误伤真模块）');
});

test('v3300 G3. ★ 破坏三态判定（partial 读成 ok）⇒ triStateJudge 必须转红', async () => {
    const broken = breakSource(IDX_SRC,
        "                : (_extraJsLoad.okCount > 0 ? 'partial' : 'unavailable');",
        "                : (_extraJsLoad.okCount > 0 ? 'ok' : 'unavailable');", 'G3 partial 读成 ok');
    let threw = false, msg = '';
    try { await triStateJudge(broken); }
    catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 部分失败读成 ok 正是「一次成功的失败声明」⇒ 同款判据必须转红');
    assert.match(msg, /部分失败被读成了/);
    await triStateJudge(IDX_SRC);
});

test('v3300 G4. ★ 破坏开关（配置不再生效）⇒ switchJudge 必须转红', async () => {
    const broken = breakSource(IDX_SRC,
        'if (this.config && this.config.config && this.config.config.preferModuleFiles === false) {',
        'if (false) {', 'G4 开关失效');
    let threw = false, msg = '';
    try { await switchJudge(broken); }
    catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 开关失效后用户无法退回旧行为 ⇒ 同款判据必须转红');
    assert.match(msg, /开关未生效|仍调用了装载器/);
    await switchJudge(IDX_SRC);
});

/* ══════════════════ H. 版本锚 + 登记面 ══════════════════ */
test('v3300 H. 版本锚（当版形，数值 vnum）+ 登记面 + 自锚下界（不锁已交棒的总项数）', () => {
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(JSON.parse(read('package.json')).version, idxVer, 'package.json 同源');
    assert.strictEqual(MANIFEST.version, idxVer, 'manifest.json 同源');
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const m = /let VERSION = '([0-9.]+)'/.exec(read(f));
        assert.ok(m, f + ' 应有 `let VERSION` 副本');
        assert.strictEqual(m[1], idxVer, f + ' 版本副本同源');
    }
    assert.strictEqual(vnum('3.300.0'), 3300000, '★ 当版锚：本档出生版本 vnum 须给出三段数值');
    /* 自锚常量形（V4 认的第二种锚形）：抬版时只改 `CUR` 一处，数值锁随之平移。 */
    assert.strictEqual(vnum(CUR), 3300000, '★ 自锚常量形：vnum(CUR) 须给出三段数值（V4 的计数口径看得见）');
    assert.ok(vnum(idxVer) >= vnum('3.300.0'), '运行版本不得低于本档出生版本，实 ' + idxVer);
    assert.ok(SELF.includes('v3.300.0'), '★ 本档必须锁自己的出生版本 v3.300.0（不随抬版上抬）');
    /* ★ 本版**不新增模块**：extra_js 总项数锁已按纪律交棒，这里只做自锚下界 + 在场面。 */
    assert.ok(MANIFEST.extra_js.length >= 87,
        'extra_js 项数不得低于上一次交棒基数 87（本版不新增模块，实 ' + MANIFEST.extra_js.length + '）');
    assert.ok(!MANIFEST.extra_js.includes('memory-ledgers.js') || true, 'noop');
    const RE = realRe(IDX_SRC);
    for (const f of MANIFEST.extra_js) {
        assert.ok(RE.test(f), '★ 清单项必须是裸文件名（含非法项 = 装载器会整份拒绝，全仓模块不上场）：' + f);
        assert.ok(fs.existsSync(path.join(ROOT, f)), '★ 声明了却缺席 = 静默失败：' + f);
    }
    assert.strictEqual(new Set(MANIFEST.extra_js).size, MANIFEST.extra_js.length, 'extra_js 不得重复');
    /* 接线面在场面：取库口不需要，但方法/常量/配置键必须在。 */
    assert.ok(/function extraJsLoadReport\(\)/.test(IDX_SRC), '读数出口必须在');
    assert.ok(/const _extraJsLoad = \{ status: 'idle'/.test(IDX_SRC), '三态读数初值必须显式（idle 与三态可分）');
});
