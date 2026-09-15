// tests/v3131_ground_truth.test.mjs
// [v3.131] 保存地面真源：recordSaveSource 行为级验证 + A8 持久化对称性审计联动
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

function extractMethod(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, i = src.indexOf('{', start);
    const open = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}

test('v3.131 recordSaveSource 行为：来源计数累加、楼层保留', () => {
    const errLog = () => {};
    const body = extractMethod('recordSaveSource(source, floor = -1) {');
    const fn = new Function('errLog', `return function (source, floor = -1) { ${body} }`)(errLog);
    const eng = { _lastSaveGroundTruth: { ts: 0, floor: 5, sources: {} } };
    fn.call(eng, 'realtime', 6);
    assert.equal(eng._lastSaveGroundTruth.floor, 6);
    assert.equal(eng._lastSaveGroundTruth.sources.realtime, 1);
    fn.call(eng, 'realtime', 7);
    assert.equal(eng._lastSaveGroundTruth.sources.realtime, 2);
    fn.call(eng, 'swipe', 7);
    assert.deepEqual(eng._lastSaveGroundTruth.sources, { realtime: 2, swipe: 1 });
    // 非法楼层回退到 prev.floor
    fn.call(eng, 'edit', NaN);
    assert.equal(eng._lastSaveGroundTruth.floor, 7);
    // ts 单调推进
    const t1 = eng._lastSaveGroundTruth.ts;
    fn.call(eng, 'delete', 8);
    assert.ok(eng._lastSaveGroundTruth.ts >= t1);
});

test('v3.131 全部 storage.save 调用点登记来源', () => {
    // 已登记的保存点（realtime 带楼层参数，其余无参）
    assert.ok(src.includes("recordSaveSource('realtime'"), '保存点 realtime 应登记来源');
    for (const srcName of ['stmLtm', 'backfill', 'edit', 'swipe', 'delete']) {
        assert.ok(src.includes(`recordSaveSource('${srcName}')`), `保存点 ${srcName} 应登记来源`);
    }
    // OMR 主保存应先登记再保存（登记调用在 collectExport 之前）
    const i = src.indexOf("recordSaveSource('realtime'");
    const j = src.indexOf('await this.storage.save(chatId, await this.collectExport())');
    assert.ok(i > 0 && j > i, 'OMR: 登记先于保存');
});

test('v3.131 A8 持久化对称性审计当前零缺口', () => {
    const out = execSync('node tests/audit/scan_wiring.mjs', { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    const m1 = /=== A8\.1 存而不读[^\n]*\((\d+)\)/.exec(out);
    const m2 = /=== A8\.2 读而无存[^\n]*\((\d+)\)/.exec(out);
    assert.ok(m1 && m2, 'A8 输出存在');
    assert.equal(m1[1], '0', '存而不读应为 0');
    assert.equal(m2[1], '0', '读而无存应为 0');
});

test('v3.131 诊断面板展示地面真源', () => {
    assert.match(ui, /保存地面真源/);
});