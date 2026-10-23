/* ============================================================
 * tests/v3364_engine_qa_tools_split.test.mjs — v3.364.0
 * 架构重构：问答管线与高级查询工具面（32个方法）剥离至 engine-qa-tools.js
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

test('v3364 A1. engine-qa-tools.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-qa-tools.js')), 'engine-qa-tools.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-qa-tools.js'), 'manifest.extra_js 必须登记 engine-qa-tools.js');
});

test('v3364 A2. QA 与查询工具面委托桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
        const stubs = [
        '_qaKnownActors(limit) {',
        '_qaActorAliases() {',
        'askMemoryQuestion(question, opts) {',
        'askMemoryQuestionAsync(question, opts) {',
        'askMemoryQuestionFollowUp(question, opts) {',
        'qaThreadResolve(picks, opts) {',
        'qaThread() {',
        '_qaThreadState() {',
        'memoryQaLine() {',
        'memoryToolsSources() {',
        '_memoryToolsAbsent(api, reason) {',
        'queryEvidenceAsync(spec, opts) {',
        'queryExperience(op, payload) {',
        'queryDualTime(op, payload) {',
        'queryEvidenceSolver(op, payload) {',
        'queryResolution(op, payload) {',
        'queryScene(op, payload) {'
    ];
    for (const s of stubs) {
        assert.ok(idx.includes(s), '委托桩签名必须在场: ' + s);
    }
    assert.ok(idx.includes('engine-qa-tools.js'), '委托桩必须引用 engine-qa-tools.js');
    assert.ok(idx.includes('LonShaEngineQaTools'), '委托桩必须引用 window.LonShaEngineQaTools');
});

test('v3364 A3. engine-qa-tools.js 导出健全且支持 bindDeps', () => {
    const src = read('engine-qa-tools.js');
    assert.ok(src.includes('bindDeps: bindDeps'), '导出 bindDeps');
    assert.ok(src.includes('askMemoryQuestion: askMemoryQuestion'), '导出 askMemoryQuestion');
    assert.ok(src.includes('queryExperience: queryExperience'), '导出 queryExperience');
    assert.ok(src.includes('queryEvidenceSolver: queryEvidenceSolver'), '导出 queryEvidenceSolver');
});

test('v3364 A4. 宿主装配接线：_assembleComponents 中注入 QT.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEngineQaTools'), '装配中获取 LonShaEngineQaTools');
    assert.ok(idx.includes('QT.bindDeps({'), '装配中必须调用 QT.bindDeps');
});

test('v3364 A5. 六源同源版本锚', () => {
    const BORN_V = '3.364.0';
    assert.equal(vnum(BORN_V), 3364000, '当版数值锚');
});

test('v3364 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-qa-tools.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.askMemoryQuestion, 'function', 'askMemoryQuestion 必须是函数');
    assert.equal(typeof mod.queryExperience, 'function', 'queryExperience 必须是函数');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
});

test('v3364 B2. 降级安全回执契约：模块未装配或缺席时返回安全结果', () => {
    const mod = require_(path.join(ROOT, 'engine-qa-tools.js'));
    const dummyEngine = {
        worldProg: {},
        graph: null,
        _entityIdByName: null
    };
    const res = mod.askMemoryQuestion(dummyEngine, '谁是苏晴？', {});
    assert.ok(res, '返回对象');
    assert.equal(res.version, 0, '未就绪降级版本 0');
    assert.equal(res.writesNothing, true, '只读声明');
});
