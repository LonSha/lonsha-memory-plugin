// tests/l23_x8_capacity_watermark.test.mjs — L23-X8「容量水位与淘汰预告」
// 计划书：只预告不执行。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('memory-capacity-watermark.js', 'LonShaMemoryCapacityWatermark');
const mk = () => ({
    used: 990, capacity: 1000, perTurnGrowth: 5, turnsAhead: 10,
    units: [{ id: 'a', size: 40, significance: 0.9 }, { id: 'b', size: 60, significance: 0.1 }]
});

test('【1】超出水位 → over，且给出淘汰候选', () => {
    const r = M.forecastCapacity(mk(), {});
    assert.strictEqual(r.face, 'over');
    assert.strictEqual(r.projected, 1040);
    assert.ok(r.evictionCandidates.length >= 1);
    assert.strictEqual(r.evictionCandidates[0].id, 'b', '先淘汰 significance 最低的（新近 ≠ 重要）');
});

test('【2】只预告不执行：executed 恒 false、需人确认', () => {
    const r = M.forecastCapacity(mk(), {});
    assert.strictEqual(r.executed, false);
    assert.strictEqual(r.requiresConfirmation, true);
    assert.match(M.capacityNote(r), /尚未执行/);
});

test('【3】绝不改入参（深比较）', () => {
    const input = mk();
    const snapshot = JSON.stringify(input);
    M.forecastCapacity(input, {});
    assert.strictEqual(JSON.stringify(input), snapshot);
});

test('【4】三态：ok / near / over 不塌', () => {
    assert.strictEqual(M.forecastCapacity({ used: 10, capacity: 1000 }, {}).face, 'ok');
    assert.strictEqual(M.forecastCapacity({ used: 850, capacity: 1000, perTurnGrowth: 0 }, {}).face, 'near');
    assert.strictEqual(M.forecastCapacity({ used: 1200, capacity: 1000, perTurnGrowth: 0 }, {}).face, 'over');
});

test('【5】账上不够抵 → 显式记缺口（不许假装够了）', () => {
    const r = M.forecastCapacity({ used: 999, capacity: 1000, perTurnGrowth: 10, turnsAhead: 1, units: [{ id: 'x', size: 1, significance: 0.5 }] }, {});
    const gap = r.evictionCandidates.find((c) => c.note);
    assert.ok(gap, '缺口必须写成一条带 note 的候选');
    assert.strictEqual(gap.size, 8);
});

test('【6】负控制：偷偷改入参或标 executed 的实现在此判红', () => {
    const input = mk();
    const before = JSON.stringify(input);
    const r = M.forecastCapacity(input, {});
    assert.strictEqual(r.executed, false);
    assert.strictEqual(JSON.stringify(input), before);
    assert.notStrictEqual(r.executed, true);
});

test('【7】坏数字 → invalid（不把 capacity=0 当已满）', () => {
    assert.strictEqual(M.forecastCapacity({ used: 1, capacity: 0 }, {}).face, 'invalid');
    assert.strictEqual(M.forecastCapacity(null, {}).face, 'invalid');
});

test('【8】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('memory-capacity-watermark.js'));
});