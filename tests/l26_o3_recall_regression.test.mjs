// [v3.475.0 · L26-O3] 检索质量跨版本回归
// 验收口径：连续版本趋势可看；退步超阈值即拦；缺读数不许当 0、不许当进步。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Q = require(join(ROOT, 'recall-regression-guard.js'));

test('O3-1 连续版本趋势逐段可看，段数=版本数-1', () => {
    const t = Q.evaluateTrend([
        { version: '3.472.0', score: 0.81 },
        { version: '3.473.0', score: 0.83 },
        { version: '3.474.0', score: 0.82 }
    ]);
    assert.equal(t.steps.length, 2);
    assert.deepEqual(t.steps.map((s) => [s.from, s.to]), [['3.472.0', '3.473.0'], ['3.473.0', '3.474.0']]);
    assert.equal(t.reading, 'trend-ok');
    assert.equal(t.ok, true);
    assert.equal(t.net, 0.01);
});

test('O3-2 输入乱序按版本重排，不许把乱序当趋势', () => {
    const t = Q.evaluateTrend([
        { version: '3.474.0', score: 0.80 },
        { version: '3.472.0', score: 0.80 },
        { version: '3.473.0', score: 0.85 }
    ]);
    assert.deepEqual(t.steps.map((s) => s.from), ['3.472.0', '3.473.0']);
    assert.equal(t.net, 0);
});

test('O3-3 版本号按数值比，不是字典序（3.9 不许大于 3.10）', () => {
    const t = Q.evaluateTrend([
        { version: '3.9.0', score: 0.5 },
        { version: '3.10.0', score: 0.5 }
    ]);
    assert.deepEqual(t.steps.map((s) => s.to), ['3.10.0']);
});

test('O3-4 退步超阈值：拦发布并点名掉了多少', () => {
    const g = Q.gate([
        { version: '3.473.0', score: 0.80 },
        { version: '3.474.0', score: 0.70 }
    ]);
    assert.equal(g.publishable, false);
    assert.equal(g.reading, 'gate-blocked');
    assert.equal(g.trend.regressions.length, 1);
    assert.match(g.reasons[0], /3\.473\.0→3\.474\.0/);
    assert.match(g.reasons[0], /-0\.1/);
});

test('O3-5 退步未超阈值：放行，但读数里仍如实记这段 delta', () => {
    const g = Q.gate([
        { version: '3.473.0', score: 0.800 },
        { version: '3.474.0', score: 0.780 }
    ]);
    assert.equal(g.publishable, true);
    assert.equal(g.reading, 'gate-open');
    assert.equal(g.trend.steps[0].delta, -0.02);
    assert.equal(g.trend.steps[0].blocking, false);
});

test('O3-6 缺读数单列 unknown：不当 0、不当进步、也不许算作通过', () => {
    const g = Q.gate([
        { version: '3.473.0', score: 0.80 },
        { version: '3.474.0', score: null }
    ]);
    assert.equal(g.trend.unknown.length, 1);
    assert.equal(g.trend.unknown[0].version, '3.474.0');
    assert.equal(g.publishable, false);
    assert.match(g.reasons.join('|'), /没有读数/);
});

test('O3-7 阈值必须是负数：给 0 或正数直接抛（方向写错要当场炸）', () => {
    assert.throws(() => Q.evaluateTrend([{ version: '3.1.0', score: 1 }], { threshold: 0 }), TypeError);
    assert.throws(() => Q.evaluateTrend([{ version: '3.1.0', score: 1 }], { threshold: 0.05 }), TypeError);
});

test('O3-8 只有一个版本：说「不够判」，不许说 ok', () => {
    const t = Q.evaluateTrend([{ version: '3.474.0', score: 0.8 }]);
    assert.equal(t.reading, 'trend-insufficient:1');
    assert.equal(t.steps.length, 0);
    const g = Q.gate([{ version: '3.474.0', score: 0.8 }]);
    assert.equal(g.publishable, false);
    assert.equal(g.reading, 'gate-insufficient');
});

test('O3-9 空序列不抛，读数如实为零版本', () => {
    const t = Q.evaluateTrend([]);
    assert.equal(t.steps.length, 0);
    assert.equal(t.span, null);
    assert.equal(t.net, null);
    assert.equal(t.reading, 'trend-insufficient:0');
});
