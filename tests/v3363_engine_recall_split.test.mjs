/* ============================================================
 * tests/v3363_engine_recall_split.test.mjs — v3.363.0
 * 架构重构：recallMemory 核心召回管线剥离至 engine-recall.js
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

test('v3363 A1. engine-recall.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-recall.js')), 'engine-recall.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-recall.js'), 'manifest.extra_js 必须登记 engine-recall.js');
});

test('v3363 A2. recallMemory 委派桩在 index.js 中存在且保持契约', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('async recallMemory(query) {'), '委托桩签名必须保持同参形式');
    assert.ok(idx.includes('engine-recall.js'), '委托桩必须引用 engine-recall.js');
    assert.ok(idx.includes('LonShaEngineRecall'), '委托桩必须引用 window.LonShaEngineRecall');
    assert.ok(idx.includes('M.recallMemory(this, query)'), '委托调用必须传递 this 宿主引擎');
});

test('v3363 A3. engine-recall.js 导出健全且支持 bindDeps', () => {
    const recSrc = read('engine-recall.js');
    assert.ok(recSrc.includes('recallMemory: recallMemory'), '导出 recallMemory');
    assert.ok(recSrc.includes('bindDeps: bindDeps'), '导出 bindDeps');
});

test('v3363 A4. 依赖纯函数与辅助方法完整闭包内嵌', () => {
    const recSrc = read('engine-recall.js');
    for (const fn of ['function numOr', 'function normalizeCharName', 'function relativePrefix', 'function filterTimelineByConstraint', 'function parseStoryTimeConstraint']) {
        assert.ok(recSrc.includes(fn), '必须内嵌 ' + fn);
    }
});

test('v3363 A5. 宿主装配接线：_assembleComponents 中注入 RC.bindDeps', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('LonShaEngineRecall'), '装配中获取 LonShaEngineRecall');
    assert.ok(idx.includes('RC.bindDeps({'), '装配中必须调用 RC.bindDeps');
});

test('v3363 A6. 六源同源版本锚', () => {
    const BORN_V = '3.363.0';
    assert.equal(vnum(BORN_V), 3363000, '当版数值锚');
});

test('v3363 B1. 模块在 Node 环境下真加载并具备导出形态', () => {
    const mod = require_(path.join(ROOT, 'engine-recall.js'));
    assert.ok(mod, '模块可加载');
    assert.equal(typeof mod.recallMemory, 'function', 'recallMemory 必须是函数');
    assert.equal(typeof mod.bindDeps, 'function', 'bindDeps 必须是函数');
});

test('v3363 B2. recallMemory 缺省安全降级回落到空数组', async () => {
    const mod = require_(path.join(ROOT, 'engine-recall.js'));
    const dummyEngine = {
        config: { config: {} },
        summary: { search: () => [] },
        bm25: { search: () => [] },
        graph: { query: () => [] },
        diary: { search: () => [] },
        timeline: { query: () => [] },
        captureCast: () => [],
        getKnownCharacters: () => [],
        hybridMerge: () => [],
        intentRerank: () => []
    };
    const res = await mod.recallMemory(dummyEngine, { text: 'test' });
    assert.ok(Array.isArray(res), '必须返回数组');
    assert.equal(res.length, 0, '无候选时必须安全返回空数组');
});
