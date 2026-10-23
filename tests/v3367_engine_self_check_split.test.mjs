/* ============================================================
 * tests/v3367_engine_self_check_split.test.mjs — v3.367.0
 * 架构重构：系统全景自检与健康诊断（selfCheck）剥离至 engine-self-check.js
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

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 1000000 + parseInt(m[2], 10) * 1000 + parseInt(m[3], 10);
}

test('v3367 A1. engine-self-check.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-self-check.js')), 'engine-self-check.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-self-check.js'), 'manifest.extra_js 必须登记 engine-self-check.js');
    assert.equal(mf.extra_js.length, 140, 'extra_js 当前总项数应为 140');
});

test('v3367 A2. selfCheck 与 _selfCheckAbsent 委托桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('async selfCheck() {'), 'selfCheck 委托桩签名必须在场');
    assert.ok(idx.includes('_selfCheckAbsent(reason) {'), '_selfCheckAbsent 委托桩签名必须在场');
    assert.ok(idx.includes('engine-self-check.js'), '委托桩必须引用 engine-self-check.js');
    assert.ok(idx.includes('LonShaEngineSelfCheck'), '委托桩必须引用 window.LonShaEngineSelfCheck');
    assert.ok(idx.includes('_formatBindDepsRow(this._bindDepsRead, this._bindDepsRebindRead),'), '自检调用链路在场');
});

test('v3367 A3. engine-self-check.js 导出健全且支持 bindDeps', () => {
    const src = read('engine-self-check.js');
    assert.ok(src.includes('bindDeps: bindDeps'), '导出 bindDeps');
    assert.ok(src.includes('selfCheck: selfCheckExport'), '导出 selfCheck');
    assert.ok(src.includes('selfCheckDescribe: selfCheckDescribe'), '导出 selfCheckDescribe');
    assert.ok(src.includes('selfCheckLine: selfCheckLine'), '导出 selfCheckLine');
});

test('v3367 A4. 宿主装配接线：_assembleComponents 中注入 SC.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEngineSelfCheck'), '装配中获取 LonShaEngineSelfCheck');
    assert.ok(idx.includes('SC.bindDeps({'), '装配中必须调用 SC.bindDeps');
});

test('v3367 A5. 六源同源版本锚', () => {
    const BORN_V = '3.367.0';
    assert.equal(vnum(BORN_V), 3367000, '当版数值锚');
});

test('v3367 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-self-check.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
    assert.equal(typeof mod.selfCheck, 'function', 'selfCheck 必须是函数');
    assert.equal(typeof mod.selfCheckDescribe, 'function', 'selfCheckDescribe 必须是函数');
    assert.equal(typeof mod.selfCheckLine, 'function', 'selfCheckLine 必须是函数');
    const desc = mod.selfCheckDescribe();
    assert.equal(desc.name, 'engine-self-check.js');
    assert.equal(desc.role, 'self-check & diagnostics');
});

test('v3367 B2. 降级安全回执契约：_selfCheckAbsent', () => {
    const mod = require_(path.join(ROOT, 'engine-self-check.js'));
    const dummyEngine = {
        _selfCheckAbsent(reason) {
            return {
                time: new Date().toLocaleString(),
                version: '3.367.0',
                stats: [],
                errors: [],
                pipeline: null,
                schema: null,
                absent: true,
                reason: String(reason || 'module-unavailable')
            };
        }
    };
    const rep = dummyEngine._selfCheckAbsent('test-absent');
    assert.equal(rep.absent, true);
    assert.equal(rep.reason, 'test-absent');
    assert.ok(Array.isArray(rep.stats));
});

test('v3367 B3. selfCheck 在端到端沙箱宿主下真执行且产出全景诊断报告', async () => {
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
    ctx.navigator = { userAgent: 'v3367' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL; ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {}; ctx.Event = class {};
    ctx.SillyTavern = { getContext: () => ({ chat: [] }), eventSource: { on: noop, off: noop, emit: noop }, libs: {} };
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

    const report = await plugin.engine.selfCheck();
    assert.ok(report, 'selfCheck 返回 report 结构体');
    assert.equal(typeof report.time, 'string', '包含 time');
    assert.equal(report.fatal, undefined, '自检报告必须无未捕获 fatal');
    assert.ok(Array.isArray(report.stats), 'stats 是数组');
    assert.ok(report.stats.length >= 100, 'stats 必须包含至少 100 个子系统诊断行，实得 ' + report.stats.length);
    assert.ok(report.schema, '包含 schema 检查');
    assert.equal(report.schema.ok, true, 'schema 检查必须 ok');
});
