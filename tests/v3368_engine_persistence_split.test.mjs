/* ============================================================
 * tests/v3368_engine_persistence_split.test.mjs — v3.368.0
 * 架构重构：持久化、快照与检查点集群（persistence & checkpoint ops）剥离至 engine-persistence-ops.js
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

test('v3368 A1. engine-persistence-ops.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-persistence-ops.js')), 'engine-persistence-ops.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-persistence-ops.js'), 'manifest.extra_js 必须登记 engine-persistence-ops.js');
    assert.ok(mf.extra_js.length >= 141, 'extra_js 当前总项数应 >= 141');
});

test('v3368 A2. 持久化委托桩与降级桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('collectExport() {'), 'collectExport 委托桩必须在场');
    assert.ok(idx.includes('restoreFromPayload(data) {'), 'restoreFromPayload 委托桩必须在场');
    assert.ok(idx.includes('checkpointStore() {'), 'checkpointStore 委托桩必须在场');
    assert.ok(idx.includes('saveCheckpoint('), 'saveCheckpoint 委托桩必须在场');
    assert.ok(idx.includes('listCheckpoints(chatId) {'), 'listCheckpoints 委托桩必须在场');
    assert.ok(idx.includes('readCheckpoint(name, chatId) {'), 'readCheckpoint 委托桩必须在场');
    assert.ok(idx.includes('dropCheckpoint(name, chatId) {'), 'dropCheckpoint 委托桩必须在场');
    assert.ok(idx.includes('getCurrentChatId() {'), 'getCurrentChatId 委托桩必须在场');
    assert.ok(idx.includes('_persistenceOpsAbsent(reason) {'), '_persistenceOpsAbsent 降级安全桩必须在场');
    assert.ok(idx.includes('engine-persistence-ops.js'), '委托桩必须引用 engine-persistence-ops.js');
    assert.ok(idx.includes('LonShaEnginePersistenceOps'), '委托桩必须引用 window.LonShaEnginePersistenceOps');
});

test('v3368 A3. engine-persistence-ops.js 导出健全且支持 bindDeps 与关键静态转发', () => {
    const src = read('engine-persistence-ops.js');
    assert.ok(src.includes('bindDeps: bindDeps'), '导出 bindDeps');
    assert.ok(src.includes('persistenceOpsDescribe: persistenceOpsDescribe'), '导出 persistenceOpsDescribe');
    assert.ok(src.includes('collectExport: function'), '导出 collectExport');
    assert.ok(src.includes('restoreFromPayload: function'), '导出 restoreFromPayload');
    assert.ok(src.includes('checkpointStore: function'), '导出 checkpointStore');
    assert.ok(src.includes('saveCheckpoint: function'), '导出 saveCheckpoint');
    assert.ok(src.includes('listCheckpoints: function'), '导出 listCheckpoints');
    assert.ok(src.includes('readCheckpoint: function'), '导出 readCheckpoint');
    assert.ok(src.includes('dropCheckpoint: function'), '导出 dropCheckpoint');
    assert.ok(src.includes('previewCheckpointRestore: function'), '导出 previewCheckpointRestore');
    assert.ok(src.includes('compareBranchCheckpoints: function'), '导出 compareBranchCheckpoints');
});

test('v3368 A4. 宿主装配接线：_assembleComponents 中注入 PO.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEnginePersistenceOps'), '装配中获取 LonShaEnginePersistenceOps');
    assert.ok(idx.includes('PO.bindDeps({'), '装配中必须调用 PO.bindDeps');
});

test('v3368 A5. 六源同源版本锚', () => {
    const BORN_V = '3.368.0';
    assert.equal(vnum(BORN_V), 3368000, '当版数值锚');
});

test('v3368 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-persistence-ops.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
    assert.equal(typeof mod.persistenceOpsDescribe, 'function', 'persistenceOpsDescribe 必须是函数');
    assert.equal(typeof mod.collectExport, 'function', 'collectExport 必须是函数');
    assert.equal(typeof mod.restoreFromPayload, 'function', 'restoreFromPayload 必须是函数');
    assert.equal(typeof mod.checkpointStore, 'function', 'checkpointStore 必须是函数');
    assert.equal(typeof mod.saveCheckpoint, 'function', 'saveCheckpoint 必须是函数');
    const desc = mod.persistenceOpsDescribe();
    assert.equal(desc.name, 'engine-persistence-ops.js');
    assert.equal(desc.role, 'persistence & checkpoint operations');
    assert.equal(desc.methodsCount, 28);
});

test('v3368 B2. 降级安全回执契约：_persistenceOpsAbsent 保护机制', () => {
    const dummyEngine = {
        _persistenceOpsAbsent(opName) {
            return {
                ok: false,
                absent: true,
                op: String(opName || 'unknown'),
                reason: 'engine-persistence-ops.js not loaded'
            };
        }
    };
    const rep = dummyEngine._persistenceOpsAbsent('saveCheckpoint');
    assert.equal(rep.ok, false);
    assert.equal(rep.absent, true);
    assert.equal(rep.op, 'saveCheckpoint');
    assert.ok(rep.reason.includes('engine-persistence-ops.js'));
});

test('v3368 B3. 持久化与快照在端到端沙箱宿主下真执行', async () => {
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
    ctx.navigator = { userAgent: 'v3368' };
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
    
    // 验证 collectExport
    const exp = plugin.engine.collectExport();
    assert.ok(exp, 'collectExport 产出导出结构');
    assert.equal(typeof exp, 'object');
    assert.ok(exp.schemaVersion, '包含 schemaVersion');

    // 验证 checkpointStore
    const store = plugin.engine.checkpointStore();
    assert.ok(store, 'checkpointStore 返回可用 store');
    assert.ok(typeof store.getItem === 'function', 'store 具备 getItem 方法');
    const listRes = plugin.engine.listCheckpoints('test-chat');
    assert.ok(listRes && typeof listRes === 'object', 'listCheckpoints 产出结果对象');
    assert.ok(Array.isArray(listRes.items), 'items 必须是数组');
});
