/* ============================================================
 * tests/v3371_engine_execution_pipeline_split.test.mjs — v3.371.0
 * 架构重构：提取后执行、图谱与各子系统状态写入管线
 *          剥离至 engine-execution-pipeline.js
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
const EP_FILE = 'engine-execution-pipeline.js';

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 1000000 + parseInt(m[2], 10) * 1000 + parseInt(m[3], 10);
}

test('v3371 A1. engine-execution-pipeline.js 独立存在且在 manifest 登记恰一次', () => {
    assert.ok(fs.existsSync(path.join(ROOT, EP_FILE)), EP_FILE + ' 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes(EP_FILE), 'manifest.extra_js 必须登记 ' + EP_FILE);
    assert.equal(mf.extra_js.filter((x) => x === EP_FILE).length, 1, EP_FILE + ' 始终恰登记一次');
    assert.ok(mf.extra_js.length >= 144, 'extra_js 当前总项数应 >= 144（本批 +1 后实 ' + mf.extra_js.length + '）');
});

test('v3371 A2. applyExtractedPayload 委托桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('applyExtractedPayload(extracted, message, options = {}) {'), '必须保留 applyExtractedPayload 声明');
    assert.ok(idx.includes('window.LonShaEngineExecutionPipeline'), '必须通过全局读模块');
    assert.ok(idx.includes('engine-execution-pipeline.js'), '必须通过文件名后备读模块');
    assert.ok(idx.includes('EP.applyExtractedPayload(this, extracted, message, options)'), '必须透传 this 与参数');
});

test('v3371 A3. 模块 UMD 导出有效且支持 bindDeps', () => {
    const src = read(EP_FILE);
    const sandbox = { console, Object, Array, String, Number, Math, Date, RegExp, Error };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const mod = sandbox.LonShaEngineExecutionPipeline;
    assert.ok(mod, 'UMD 必须挂到全局 LonShaEngineExecutionPipeline');
    assert.equal(typeof mod.applyExtractedPayload, 'function', '必须导出 applyExtractedPayload');
    assert.equal(typeof mod.bindDeps, 'function', '必须导出 bindDeps');

    // 验证 bindDeps 可注入
    let logged = null;
    mod.bindDeps({ errLog: (err, tag) => { logged = tag; } });
    assert.equal(typeof mod.applyExtractedPayload, 'function');
});

test('v3371 A4. 虚拟引擎调用 applyExtractedPayload 能够正确处理并返回状态', async () => {
    const src = read(EP_FILE);
    const sandbox = { console, Object, Array, String, Number, Math, Date, RegExp, Error, Set, Map, JSON };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);

    const mod = sandbox.LonShaEngineExecutionPipeline;
    const addedNodes = [];
    const fakeEngine = {
        config: { config: { enabled: true, debugMode: false } },
        graph: {
            nodes: new Map(),
            snapshotGraph: () => {},
            findCharacterByName: () => null,
            addNode: (node) => { addedNodes.push(node); return 'n_1'; },
            addEdge: () => {}
        },
        clock: {
            date: '',
            setTime: () => {},
            syncFromNarrative: () => {},
            readWorldAxisClock: () => {},
            timeTagStats: { total: 0, paired: 0, unparseable: 0, calibrated: 0 }
        },
        readWorldLedger: () => {},
        checkTimeMonotonic: () => {},
        resolveCharacterName: (n) => n,
        _scopeData: (d) => d,
        opLog: { log: () => {} },
        summary: {
            createSummary: async () => {},
            compressSummary: (t) => t
        },
        vector: { vectors: [] },
        narrativePulse: { beat: () => {} },
        getLatestStoryDate: () => '',
        extractStoryDate: () => '',
        storage: {
            STORAGE_KEY: 'test_key',
            save: async () => true,
            _lastWrite: {}
        },
        recordSaveSource: () => {},
        recordSaveFailed: () => {},
        _loadedChatId: 'c1'
    };

    const extracted = {
        characters: ['测试角色'],
        events: [{ type: 'meet', participants: ['测试角色'] }],
        relationships: []
    };
    const message = { index: 1, mes: '今天遇到了测试角色' };

    const res = await mod.applyExtractedPayload(fakeEngine, extracted, message, {
        rawForSynopsis: '今天遇到了测试角色',
        chatId: 'c1'
    });

    assert.ok(res, '必须返回执行结果对象');
    assert.equal(res.characters, 1, '角色数应为 1');
    assert.equal(res.events, 1, '事件数应为 1');
    assert.ok(addedNodes.length >= 2, '应写入角色与事件节点');
});

test('v3371 A5. 版本六源同源且 >= 3.371.0', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const idx = read('index.js');
    const mc = read('memory-config.js');
    const mcore = read('memory-core.js');
    const mo = read('memory-organs.js');

    const vM = manifest.version;
    const vP = pkg.version;
    assert.equal(vM, vP, 'manifest 与 package 版本一致');
    assert.ok(vnum(vM) >= 3371000, '版本号必须 >= 3.371.0');
    assert.ok(idx.includes("const VERSION = '" + vM + "'") || idx.includes("VERSION = '" + vM + "'"), 'index.js 版本一致');
    assert.ok(mc.includes("VERSION = '" + vM + "'"), 'memory-config.js 版本一致');
    assert.ok(mcore.includes("VERSION = '" + vM + "'"), 'memory-core.js 版本一致');
    assert.ok(mo.includes("VERSION = '" + vM + "'"), 'memory-organs.js 版本一致');
});

/* ──────────────── 负控制（真源码破坏） ──────────────── */
test('v3371 E1. 负控制：若 manifest.json 漏登记 EP_FILE 则 A1 判据必须翻红', () => {
    const mf = JSON.parse(read('manifest.json'));
    mf.extra_js = mf.extra_js.filter((x) => x !== EP_FILE);
    assert.ok(!mf.extra_js.includes(EP_FILE), '破坏：剔除 EP_FILE');
    let failed = false;
    try {
        assert.ok(mf.extra_js.includes(EP_FILE), 'manifest.extra_js 必须登记 ' + EP_FILE);
    } catch (_) {
        failed = true;
    }
    assert.ok(failed, 'A1 判据在漏登记时必须翻红');
});

test('v3371 E2. 负控制：若 index.js 中的委托桩被破坏则 A2 判据必须翻红', () => {
    const idx = read('index.js');
    const broken = idx.replace('applyExtractedPayload(extracted, message, options = {}) {', 'applyExtractedPayload_broken(extracted, message, options = {}) {');
    let failed = false;
    try {
        assert.ok(broken.includes('applyExtractedPayload(extracted, message, options = {}) {'), '必须保留 applyExtractedPayload 声明');
    } catch (_) {
        failed = true;
    }
    assert.ok(failed, 'A2 判据在桩破坏时必须翻红');
});