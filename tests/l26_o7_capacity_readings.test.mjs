// [v3.475.0 · L26-O7] 容量治理（10w / 50w 档）
// 验收口径：两个档位各出读数；触顶给可执行清理建议；数值不许弱口径当 0。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'capacity-readings.js'));

test('O7-1 档位来自常量表：10w 与 50w 都在，顺序不靠猜', () => {
    assert.deepEqual(C.TIERS.map((t) => t.name), ['10w', '50w']);
    assert.deepEqual(C.TIERS.map((t) => t.count), [100000, 500000]);
});

test('O7-2 两档各出读数，预算宽松时 capacity-ok', () => {
    const r = C.estimateCapacity({ perItemBytes: 240, budgetBytes: 400 * 1024 * 1024 });
    assert.equal(r.rows.length, 2);
    assert.deepEqual(r.rows.map((x) => x.tier), ['10w', '50w']);
    assert.equal(r.reading, 'capacity-ok');
    assert.equal(r.overBudgetTiers.length, 0);
});

test('O7-3 50w 档越界必须点名，读数带百分比（10w 仍在预算内：400B×1.6=64MB 刚好压在 64MiB 以下）', () => {
    const r = C.estimateCapacity({ perItemBytes: 400, budgetBytes: 64 * 1024 * 1024 });
    assert.deepEqual(r.overBudgetTiers, ['50w']);
    assert.equal(r.rows[0].withinBudget, true);
    assert.match(r.reading, /^capacity-over:/);
    assert.match(r.reading, /50w@/);
});

test('O7-4 数值弱口径一律拒绝：null / 字符串 / NaN 不许当 0', () => {
    [null, '1024', NaN, undefined].forEach((bad) => {
        assert.throws(() => C.estimateCapacity({ perItemBytes: bad, budgetBytes: 1024 }), TypeError, String(bad));
    });
    assert.throws(() => C.estimateCapacity({ perItemBytes: 0, budgetBytes: 1024 }), TypeError);
});

test('O7-5 含 0 条数不出现除零：perItemBytes 为 0 直接抛', () => {
    assert.throws(() => C.estimateCapacity({ perItemBytes: 0, budgetBytes: 1024 * 1024 }), /除零|不许为 0/);
});

test('O7-6 未触顶时 adviseCleanup 说「继续用」，不硬凑建议', () => {
    const a = C.adviseCleanup({ usedBytes: 1000, budgetBytes: 2000, inventory: { transient: 5 } });
    assert.equal(a.overBudget, false);
    assert.equal(a.reading, 'capacity-within-budget');
    assert.match(a.message, /继续用/);
});

test('O7-7 触顶建议按优先级排序，每条带「清哪类、多少条、释放多少、清完剩多少」', () => {
    const a = C.adviseCleanup({
        usedBytes: 3000, budgetBytes: 2000, perItemBytes: 100,
        inventory: { transient: 5, duplicate: 3, expired: 0, lowSalience: 20 }
    });
    assert.equal(a.overBudget, true);
    assert.deepEqual(a.suggestions.map((s) => s.kind), ['transient', 'duplicate', 'lowSalience']);
    a.suggestions.forEach((s) => {
        assert.ok(s.items > 0);
        assert.ok(s.releasesBytes > 0);
        assert.match(s.action, /清理 \d+ 条/);
        assert.equal(typeof s.after, 'number');
    });
    assert.equal(a.suggestions[0].releasesBytes, 500);
    assert.equal(a.suggestions[0].after, 2500);
});

test('O7-8 只清可清项不够时明说需要归档，而不是给个假建议', () => {
    const a = C.adviseCleanup({
        usedBytes: 100000, budgetBytes: 2000, perItemBytes: 100,
        inventory: { transient: 1 }
    });
    assert.equal(a.suffices, false);
    assert.equal(a.reading, 'capacity-needs-archive');
    assert.match(a.message, /导出归档/);
});

test('O7-9 够清时读数带建议条数，并说「按顺序清即可」', () => {
    const a = C.adviseCleanup({
        usedBytes: 3000, budgetBytes: 2000, perItemBytes: 100,
        inventory: { transient: 20 }
    });
    assert.equal(a.suffices, true);
    assert.equal(a.reading, 'capacity-relief-planned:1');
    assert.match(a.message, /按建议顺序清理/);
    assert.equal(a.needBytes, 1000);
});

test('O7-10 inventory 里出现非数字：抛错，不许静默当 0 条', () => {
    assert.throws(() => C.adviseCleanup({
        usedBytes: 3000, budgetBytes: 2000, inventory: { transient: null }
    }), TypeError);
});