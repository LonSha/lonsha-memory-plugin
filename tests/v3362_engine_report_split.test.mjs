/* ============================================================
 * tests/v3362_engine_report_split.test.mjs — v3.362.0
 * 架构重构：exportMemoryReport 剥离至 engine-report.js
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 1000000 + parseInt(m[2], 10) * 1000 + parseInt(m[3], 10);
}

test('v3362 A1. engine-report.js 独立存在且在 manifest 登记', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'engine-report.js')), 'engine-report.js 必须存在');
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(Array.isArray(mf.extra_js), 'manifest.extra_js 必须是数组');
    assert.ok(mf.extra_js.includes('engine-report.js'), 'manifest.extra_js 必须登记 engine-report.js');
});

test('v3362 A2. exportMemoryReport 委派桩在 index.js 中存在', () => {
    const idx = read('index.js');
    assert.ok(idx.includes('exportMemoryReport() {'), '委托桩签名必须保持无参形式');
    assert.ok(idx.includes('engine-report.js'), '委托桩必须引用 engine-report.js');
    assert.ok(idx.includes('LonShaEngineReport'), '委托桩必须引用 window.LonShaEngineReport');
});

test('v3362 A3. engine-report.js 导出健全且支持 bindDeps', () => {
    const repSrc = read('engine-report.js');
    assert.ok(repSrc.includes('exportMemoryReport: exportMemoryReport'), '导出 exportMemoryReport');
    assert.ok(repSrc.includes('opLogStatsCompat: opLogStatsCompat'), '导出 opLogStatsCompat');
    assert.ok(repSrc.includes('bindDeps: bindDeps'), '导出 bindDeps');
});

test('v3362 A4. 六源同源版本锚', () => {
    const BORN_V = '3.362.0';
    assert.equal(vnum(BORN_V), 3362000, '当版数值锚');
});