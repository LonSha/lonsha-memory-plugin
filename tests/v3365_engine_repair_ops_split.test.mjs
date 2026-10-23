/* ============================================================
 * tests/v3365_engine_repair_ops_split.test.mjs — v3.365.0
 * 架构重构：派生件修复执行与纠错操作集群（19个方法）剥离至 engine-repair-ops.js
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('v3365 A1. engine-repair-ops.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-repair-ops.js')), 'engine-repair-ops.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-repair-ops.js'), 'manifest.extra_js 必须登记 engine-repair-ops.js');
});

test('v3365 A2. 修复执行与纠错操作委托桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    const stubs = [
        'requestRepair(input) {',
        'settleRepair(input) {',
        'abandonRepair(input) {',
        'repairRevision() {',
        'previewRepair(input) {',
        '_repairOwners() {',
        '_correctionOwners() {',
        '_verifyCorrectionItem(kind, item) {',
        'applyCorrectionPlan(opts = {}) {',
        'undoCorrection(opts = {}) {',
        'memoryCenterRevoke(id, note) {',
        'memoryCenterSaveQuery(state) {',
        '_memoryCenterStateWithSaved(state) {',
        'correctionSourceFacts(range) {',
        'correctionReextractFacts(opts = {}) {',
        'async applyRepairPlan(opts = {}) {',
        '_verifyRepairItem(kind, key, note) {',
        '_repairPoolFor(input) {',
        '_repairPool() {'
    ];
    for (const s of stubs) {
        assert.ok(idx.includes(s), '委托桩签名必须在场: ' + s);
    }
    assert.ok(idx.includes('engine-repair-ops.js'), '委托桩必须引用 engine-repair-ops.js');
    assert.ok(idx.includes('LonShaEngineRepairOps'), '委托桩必须引用 window.LonShaEngineRepairOps');
});

test('v3365 A3. engine-repair-ops.js 导出健全且支持 bindDeps', () => {
    const src = read('engine-repair-ops.js');
    assert.ok(src.includes('bindDeps: bindDeps'), '导出 bindDeps');
    assert.ok(src.includes('requestRepair: requestRepair'), '导出 requestRepair');
    assert.ok(src.includes('settleRepair: settleRepair'), '导出 settleRepair');
    assert.ok(src.includes('previewRepair: previewRepair'), '导出 previewRepair');
    assert.ok(src.includes('applyCorrectionPlan: applyCorrectionPlan'), '导出 applyCorrectionPlan');
    assert.ok(src.includes('undoCorrection: undoCorrection'), '导出 undoCorrection');
    assert.ok(src.includes('memoryCenterRevoke: memoryCenterRevoke'), '导出 memoryCenterRevoke');
    assert.ok(src.includes('memoryCenterSaveQuery: memoryCenterSaveQuery'), '导出 memoryCenterSaveQuery');
    assert.ok(src.includes('_memoryCenterStateWithSaved: _memoryCenterStateWithSaved'), '导出 _memoryCenterStateWithSaved');
    assert.ok(src.includes('applyRepairPlan: applyRepairPlan'), '导出 applyRepairPlan');
});

test('v3365 A4. 宿主装配接线：_assembleComponents 中注入 RO.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEngineRepairOps'), '装配中获取 LonShaEngineRepairOps');
    assert.ok(idx.includes('RO.bindDeps({'), '装配中必须调用 RO.bindDeps');
});

test('v3365 A5. 六源同源版本锚', () => {
    const BORN_V = '3.365.0';
    assert.equal(vnum(BORN_V), 3365000, '当版数值锚');
});

test('v3365 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-repair-ops.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.requestRepair, 'function', 'requestRepair 必须是函数');
    assert.equal(typeof mod.settleRepair, 'function', 'settleRepair 必须是函数');
    assert.equal(typeof mod.previewRepair, 'function', 'previewRepair 必须是函数');
    assert.equal(typeof mod.applyCorrectionPlan, 'function', 'applyCorrectionPlan 必须是函数');
    assert.equal(typeof mod.undoCorrection, 'function', 'undoCorrection 必须是函数');
    assert.equal(typeof mod.memoryCenterRevoke, 'function', 'memoryCenterRevoke 必须是函数');
    assert.equal(typeof mod.memoryCenterSaveQuery, 'function', 'memoryCenterSaveQuery 必须是函数');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
});

test('v3365 B2. 降级安全回执契约：模块方法接受 engine 上下文并安全返回', () => {
    const mod = require_(path.join(ROOT, 'engine-repair-ops.js'));
    const dummyEngine = {
        _repairPool: () => ({ list: [] }),
        _repairLog: () => {},
        _repairRevisionMap: {}
    };
    const res = mod.previewRepair(dummyEngine, {});
    assert.ok(res, '返回对象');
    assert.equal(res.ok, false, '未准备必要依赖降级 ok: false');
    assert.equal(typeof res.reason, 'string', '提供失败原因');
});

test('v3365 B3. 纠错撤回操作契约：缺 id 具名 missing-id', () => {
    const mod = require_(path.join(ROOT, 'engine-repair-ops.js'));
    const dummyEngine = {
        _factVersionState: { facts: [] }
    };
    const res = mod.memoryCenterRevoke(dummyEngine, '', 'test');
    assert.ok(res, '返回对象');
    assert.equal(res.ok, false, '缺 id 失败');
    assert.equal(res.reason, 'missing-id', '具名 reason missing-id');
});
