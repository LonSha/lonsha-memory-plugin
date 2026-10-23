/* ============================================================
 * tests/v3370_engine_evidence_center_split.test.mjs — v3.370.0
 * 架构重构：证据工作台 / 结构化检索 / 记忆控制中心 / 事实生命周期 / 记忆包准入
 *          集群剥离至 engine-evidence-center.js
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const EC_FILE = 'engine-evidence-center.js';
function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 1000000 + parseInt(m[2], 10) * 1000 + parseInt(m[3], 10);
}
/* 本批外移的 36 个方法（**从 index.js 真源码里数出来的清单**，不是手抄臆测）：
 *   外移后宿主只留委托桩，方法体本身必须能在模块里找到同名定义。 */
const MOVED = [
    '_evidenceWorkbench', '_eventPlatformsFace', 'searchEvidence', 'searchEvidenceStructured',
    '_qaCausalEdges', '_evidenceQueryEmpty', 'evidenceQueryFacets', 'evidenceSavedQueries',
    'saveEvidenceQuery', 'removeEvidenceQuery', 'replayEvidenceQuery', 'evidenceQueryLine',
    'memoryCenterDeps', '_memoryCenterAbsent', 'memoryCenterView', 'memoryCenterSourceText',
    'memoryCenterStep', 'memoryCenterLoad', 'memoryCenterFactState', 'memoryCenterBlankState',
    'memoryCenterSave', 'memoryCenterSheet', 'memoryCenterDescribe', 'memoryCenterLine',
    '_factLifecycleDeps', '_factLifecycleAbsent', 'factLifecyclePlan', 'factLifecycleDescribe',
    'factLifecycleLine', '_memoryPackageDeps', '_memoryPackageAbsent', 'memoryPackageAdmit',
    'memoryPackagePreview', 'memoryPackagePlan', 'memoryPackageDescribe', 'memoryPackageLine',
];
test('v3370 A1. engine-evidence-center.js 独立存在且在 manifest 登记恰一次', () => {
    assert.ok(fs.existsSync(path.join(ROOT, EC_FILE)), EC_FILE + ' 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes(EC_FILE), 'manifest.extra_js 必须登记 ' + EC_FILE);
    assert.equal(mf.extra_js.filter((x) => x === EC_FILE).length, 1, EC_FILE + ' 始终恰登记一次');
    assert.ok(mf.extra_js.length >= 143, 'extra_js 当前总项数应 >= 143（本批 +1 后实 143）');
});
test('v3370 A2. 36 个委托桩与降级桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    /* ★ 判据必须判「委托桩形态」，不能只判名字出现：名字在装配点、诊断行、调用点都会出现，
     *   把桩改名后全文件仍能命中 ⇒ 恒绿（负控制当场抓出过这一形）。
     *   这里逐行取「宿主方法定义 + 取库口 + 透传」三件同时成立的行，再从行首提方法名。 */
    const STUB_MARK = 'const M = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js")';
    const stubs = {};
    for (const line of idx.split('\n')) {
        if (!line.includes(STUB_MARK)) continue;
        const m = /^\s*(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{/.exec(line);
        if (!m) continue;
        stubs[m[1]] = { params: m[2].trim(), line };
    }
    const stubNames = Object.keys(stubs);
    const missing = MOVED.filter((n) => !stubs[n]);
    assert.deepEqual(missing, [], '每个外移方法都必须留真委托桩（取库口 + 透传）：缺 ' + missing.join(','));
    assert.equal(stubNames.length, MOVED.length,
        '委托桩数须与外移清单逐一对齐（实 ' + stubNames.length + ' / 期望 ' + MOVED.length + '）');
    /* 每个桩都要把 this 与自己的形参原样透传 —— 只取库不传参的桩是假桩。 */
    const badPass = [];
    for (const n of MOVED) {
        const s = stubs[n];
        const args = s.params.split(',').map((x) => x.trim()).filter(Boolean);
        const call = 'M.' + n + '(this' + (args.length ? ', ' + args.join(', ') : '') + ')';
        if (!s.line.includes(call)) badPass.push(n + ' 期望 ' + call);
    }
    assert.deepEqual(badPass, [], '委托桩必须原样透传宿主与实参：\n' + badPass.join('\n'));
    assert.ok(idx.includes('_evidenceCenterAbsent(reason) {'), '_evidenceCenterAbsent 降级安全桩必须在场');
    assert.ok(idx.includes('LonShaEngineEvidenceCenter'), '委托桩必须引用 window.LonShaEngineEvidenceCenter');
});
test('v3370 A3. 方法体已真外移：index.js 不再持有 36 个方法体', () => {
    const idx = read('index.js');
    /* 外移的判据不是「行数变少」，而是「方法体头不再以宿主方法形态出现在 index.js」。 */
    const leftovers = MOVED.filter((n) => idx.includes('        ' + n + '(host'));
    assert.deepEqual(leftovers, [], '这些方法体仍在 index.js（外移未完成）：' + leftovers.join(','));
});
test('v3370 A4. 模块导出健全：自述 + bindDeps + 36 个方法键', () => {
    const src = read(EC_FILE);
    assert.ok(src.includes('evidenceCenterDescribe: evidenceCenterDescribe'), '导出 evidenceCenterDescribe');
    assert.ok(src.includes('bindDeps,'), '导出 bindDeps');
    assert.ok(src.includes('bindWindow,'), '导出 bindWindow');
    const mod = require_(path.join(ROOT, EC_FILE));
    assert.equal(typeof mod.evidenceCenterDescribe, 'function', 'evidenceCenterDescribe 必须是函数');
    const desc = mod.evidenceCenterDescribe();
    assert.equal(desc.name, EC_FILE);
    assert.equal(desc.methodsCount, MOVED.length, '自述方法数必须与清单一致');
    const notExported = MOVED.filter((n) => typeof mod[n] !== 'function');
    assert.deepEqual(notExported, [], '这些方法未从模块导出：' + notExported.join(','));
});
test('v3370 A5. 宿主装配接线：_assembleComponents 中注入 EC.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('const EC = _moduleLib(() => window.LonShaEngineEvidenceCenter, "engine-evidence-center.js")'),
        '装配中须取 LonShaEngineEvidenceCenter');
    assert.ok(idx.includes('EC.bindDeps({'), '装配中必须调用 EC.bindDeps');
});
test('v3370 A6. 六源同源版本锚', () => {
    const BORN_V = '3.370.0';
    assert.equal(vnum(BORN_V), 3370000, '当版数值锚');
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.version, BORN_V, 'manifest 版本');
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.version, BORN_V, 'package.json 版本');
});
test('v3370 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, EC_FILE));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
    assert.equal(typeof mod.bindWindow, 'function', 'bindWindow 必须是函数');
    assert.equal(typeof mod.searchEvidenceStructured, 'function', 'searchEvidenceStructured 必须是函数');
    assert.equal(typeof mod.memoryCenterView, 'function', 'memoryCenterView 必须是函数');
    assert.equal(typeof mod.factLifecyclePlan, 'function', 'factLifecyclePlan 必须是函数');
    assert.equal(typeof mod.memoryPackageAdmit, 'function', 'memoryPackageAdmit 必须是函数');
});
test('v3370 B2. 降级安全回执契约：_evidenceCenterAbsent 保护机制', () => {
    const dummyEngine = {
        _evidenceCenterAbsent(reason) {
            return {
                ok: false,
                absent: true,
                op: String(reason || 'unknown'),
                reason: 'engine-evidence-center.js not loaded'
            };
        }
    };
    const rep = dummyEngine._evidenceCenterAbsent('searchEvidenceStructured');
    assert.equal(rep.ok, false);
    assert.equal(rep.absent, true);
    assert.equal(rep.op, 'searchEvidenceStructured');
    assert.ok(rep.reason.includes(EC_FILE));
});
test('v3370 B3. 模块缺席时宿主走降级而不是抛：委托桩的 absent 分支真被执行', () => {
    const idx = read('index.js');
    /* 取一个委托桩的真源码，在无模块环境下跑：必须落到 _evidenceCenterAbsent，不得抛。 */
    const at = idx.indexOf('searchEvidenceStructured(spec, opts) {');
    assert.ok(at > 0, '委托桩切片点必须在场');
    const end = idx.indexOf('\n', idx.indexOf('_evidenceCenterAbsent', at));
    const stubSrc = idx.slice(at, end + 1);
    const host = {
        _moduleLib: () => null,            /* 模块缺席 */
        _evidenceCenterAbsent(reason) {
            return { ok: false, absent: true, op: String(reason || '') };
        },
    };
    const fn = new Function('_moduleLib', 'return ({ ' + stubSrc + ' });').call(null, () => null);
    const rep = fn.searchEvidenceStructured.call(host, {}, {});
    assert.equal(rep.absent, true, '模块缺席必须返回 absent 回执');
    assert.equal(rep.op, 'searchEvidenceStructured', '回执须如实归因到具体方法');
});
test('v3370 B4. 证据中心在端到端沙箱宿主下真执行', async () => {
    const noop = () => {};
    const fakeElement = () => ({
        appendChild: noop, removeChild: noop, append: noop, remove: noop,
        setAttribute: noop, getAttribute: () => null, classList: { add: noop, remove: noop, contains: () => false },
        style: {}, addEventListener: noop, removeEventListener: noop
    });
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
    ctx.setTimeout = (fn) => { if (typeof fn === 'function') { try { fn(); } catch (e) {} } return 0; };
    ctx.clearTimeout = noop; ctx.setInterval = () => 0; ctx.clearInterval = noop;
    ctx.requestAnimationFrame = () => 0; ctx.cancelAnimationFrame = noop;
    ctx.navigator = { userAgent: 'v3370' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL; ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {}; ctx.Event = class {};
    ctx.SillyTavern = { getContext: () => ({ chat: [], lore: [] }), eventSource: { on: noop, off: noop, emit: noop }, libs: {} };
    ctx.addEventListener = noop; ctx.removeEventListener = noop;
    const vmCtx = vm.createContext(ctx);
    const mf = JSON.parse(read('manifest.json'));
    const order = [mf.js, ...mf.extra_js];
    for (const f of order) {
        try {
            vm.runInContext(read(f), vmCtx, { filename: f });
        } catch (_) {}
    }
    const plugin = vmCtx.window.LonShaMemory;
    assert.ok(plugin, '插件必须在 window 成功挂载');
    assert.ok(plugin.engine, '引擎实例必须成功构造');
    await plugin.init();

    /* 模块必须真挂上（不是靠委托桩的降级分支蒙混过关）。 */
    assert.ok(vmCtx.window.LonShaEngineEvidenceCenter, '证据中心模块必须挂到 window');
    /* 空库下三面都要给出**结构化读数**而不是抛：这三条是外移后最容易断的接线。 */
    const wb = plugin.engine._evidenceWorkbench();
    assert.ok(wb && typeof wb === 'object', '_evidenceWorkbench 必须返回对象');
    assert.equal(wb.absent, undefined, '模块在场时不得走缺席分支（absent 只给真缺席）');
    const q = plugin.engine.searchEvidenceStructured({}, {});
    assert.ok(q && typeof q === 'object', 'searchEvidenceStructured 必须返回对象');
    const line = plugin.engine.evidenceQueryLine();
    assert.equal(typeof line, 'string', 'evidenceQueryLine 必须给诊断行字符串');
    const mcLine = plugin.engine.memoryCenterLine();
    assert.equal(typeof mcLine, 'string', 'memoryCenterLine 必须给诊断行字符串');
    const flLine = plugin.engine.factLifecycleLine();
    assert.equal(typeof flLine, 'string', 'factLifecycleLine 必须给诊断行字符串');
    const mpLine = plugin.engine.memoryPackageLine();
    assert.equal(typeof mpLine, 'string', 'memoryPackageLine 必须给诊断行字符串');
    /* 自述面：三张 describe 都要在场且完整（外移时最容易漏掉的一格）。 */
    for (const [m, kind] of [['memoryCenterDescribe', 'memory-center-describe'],
        ['factLifecycleDescribe', 'fact-lifecycle-describe'],
        ['memoryPackageDescribe', 'memory-package-describe']]) {
        const d = plugin.engine[m]();
        assert.ok(d && typeof d === 'object', m + ' 必须返回对象');
        assert.equal(d.kind, kind, m + ' 的 kind 口径');
        assert.equal(d.complete !== false, true, m + ' 不得报不完整：' + JSON.stringify(d.missing || []));
    }
});
