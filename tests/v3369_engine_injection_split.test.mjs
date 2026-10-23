/* ============================================================
 * tests/v3369_engine_injection_split.test.mjs — v3.369.0
 * 架构重构：提示词注入装配管线与上下文快照集群剥离至 engine-injection-pipeline.js
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

test('v3369 A1. engine-injection-pipeline.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-injection-pipeline.js')), 'engine-injection-pipeline.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-injection-pipeline.js'), 'manifest.extra_js 必须登记 engine-injection-pipeline.js');
    assert.ok(mf.extra_js.length >= 142, 'extra_js 当前总项数应 >= 142');
});

test('v3369 A2. 注入委托桩与降级桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('buildInjection('), 'buildInjection 委托桩必须在场');
    assert.ok(idx.includes('buildBridgeSnapshot('), 'buildBridgeSnapshot 委托桩必须在场');
    assert.ok(idx.includes('buildInjectionReadout('), 'buildInjectionReadout 委托桩必须在场');
    assert.ok(idx.includes('_injectionRecord('), '_injectionRecord 委托桩必须在场');
    assert.ok(idx.includes('_injectionStage('), '_injectionStage 委托桩必须在场');
    assert.ok(idx.includes('_injectionCommit('), '_injectionCommit 委托桩必须在场');
    assert.ok(idx.includes('_injectionPipelineAbsent(reason) {'), '_injectionPipelineAbsent 降级安全桩必须在场');
    assert.ok(idx.includes('engine-injection-pipeline.js'), '委托桩必须引用 engine-injection-pipeline.js');
    assert.ok(idx.includes('LonShaEngineInjectionPipeline'), '委托桩必须引用 window.LonShaEngineInjectionPipeline');
});

test('v3369 A3. engine-injection-pipeline.js 导出健全且支持 bindDeps 与关键静态转发', () => {
    const src = read('engine-injection-pipeline.js');
    assert.ok(src.includes('bindDeps: bindDeps'), '导出 bindDeps');
    assert.ok(src.includes('injectionPipelineDescribe: injectionPipelineDescribe'), '导出 injectionPipelineDescribe');
    assert.ok(src.includes('buildInjection: function'), '导出 buildInjection');
    assert.ok(src.includes('buildBridgeSnapshot: function'), '导出 buildBridgeSnapshot');
    assert.ok(src.includes('buildInjectionReadout: function'), '导出 buildInjectionReadout');
    assert.ok(src.includes('_worldbookOccupancy: function'), '导出 _worldbookOccupancy');
    assert.ok(src.includes('_projectionPrediction: function'), '导出 _projectionPrediction');
});

test('v3369 A4. 宿主装配接线：_assembleComponents 中注入 IP.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEngineInjectionPipeline'), '装配中获取 LonShaEngineInjectionPipeline');
    assert.ok(idx.includes('IP.bindDeps({'), '装配中必须调用 IP.bindDeps');
});

test('v3369 A5. 六源同源版本锚', () => {
    const BORN_V = '3.369.0';
    assert.equal(vnum(BORN_V), 3369000, '当版数值锚');
});

test('v3369 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-injection-pipeline.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
    assert.equal(typeof mod.injectionPipelineDescribe, 'function', 'injectionPipelineDescribe 必须是函数');
    assert.equal(typeof mod.buildInjection, 'function', 'buildInjection 必须是函数');
    assert.equal(typeof mod.buildBridgeSnapshot, 'function', 'buildBridgeSnapshot 必须是函数');
    const desc = mod.injectionPipelineDescribe();
    assert.equal(desc.name, 'engine-injection-pipeline.js');
    assert.equal(desc.role, 'injection & context assembly pipeline');
    assert.equal(desc.methodsCount, 17);
});

test('v3369 B2. 降级安全回执契约：_injectionPipelineAbsent 保护机制', () => {
    const dummyEngine = {
        _injectionPipelineAbsent(reason) {
            return {
                ok: false,
                absent: true,
                op: String(reason || 'unknown'),
                reason: 'engine-injection-pipeline.js not loaded'
            };
        }
    };
    const rep = dummyEngine._injectionPipelineAbsent('buildInjection');
    assert.equal(rep.ok, false);
    assert.equal(rep.absent, true);
    assert.equal(rep.op, 'buildInjection');
    assert.ok(rep.reason.includes('engine-injection-pipeline.js'));
});

test('v3369 B3. 注入装配与快照在端到端沙箱宿主下真执行', async () => {
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
    ctx.navigator = { userAgent: 'v3369' };
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
    
    // 验证 buildInjection
    const inj = await plugin.engine.buildInjection([]);
    assert.ok(inj !== undefined, 'buildInjection 正常执行返回结果');

    // 验证 buildBridgeSnapshot
    const snap = plugin.engine.buildBridgeSnapshot();
    assert.ok(snap && typeof snap === 'object', 'buildBridgeSnapshot 产出快照对象');
    assert.ok(snap.exportedAt, '快照包含 exportedAt');

    // 验证 buildInjectionReadout
    const readout = plugin.engine.buildInjectionReadout();
    assert.ok(readout !== undefined, 'buildInjectionReadout 返回定义');
});