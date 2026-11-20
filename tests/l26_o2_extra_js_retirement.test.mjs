// [v3.475.0 · L26-O2] 加载瘦身与退役机制
// 验收口径：退役候选带理由；退役后判据全绿；退役清单可回滚；仍被消费的一律不许退役。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const R = require(join(ROOT, 'extra-js-retirement.js'));

const EXTRA = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js'];
const CONSUMERS = { 'a.js': ['index.js'], 'b.js': ['a.js'] };
const TESTS = { 'c.js': ['tests/c.test.mjs'] };
const KEEP = { 'd.js': '被用户设置页直接 require，静态扫描看不见' };

test('O2-1 三档处置闭集，没有「先放着」这一档', () => {
    assert.deepEqual(R.DISPOSITIONS.slice(), ['retire', 'keep', 'undisposed']);
});

test('O2-2 零引用与只被测试引用都给退役候选，且各带理由', () => {
    const p = R.buildRetirementPlan({ extraJs: EXTRA, consumers: CONSUMERS, testRefs: TESTS, keep: KEEP });
    assert.equal(p.ok, true);
    const names = p.candidates.map((c) => c.file).sort();
    assert.deepEqual(names, ['c.js', 'e.js']);
    const kinds = Object.fromEntries(p.candidates.map((c) => [c.file, c.kind]));
    assert.equal(kinds['c.js'], 'test-only');
    assert.equal(kinds['e.js'], 'zero-reference');
    p.candidates.forEach((c) => assert.ok(c.reason.length > 6, c.file));
});

test('O2-3 仍被消费的文件不许进候选', () => {
    const p = R.buildRetirementPlan({ extraJs: EXTRA, consumers: CONSUMERS, testRefs: TESTS, keep: KEEP });
    assert.equal(p.candidates.some((c) => c.file === 'a.js'), false);
    assert.equal(p.candidates.some((c) => c.file === 'b.js'), false);
    const kept = Object.fromEntries(p.kept.map((k) => [k.file, k]));
    assert.match(kept['a.js'].reason, /仍被 1 处引用/);
});

test('O2-4 keep 必须写理由，空理由算未处置（不是通过）', () => {
    const p = R.buildRetirementPlan({ extraJs: ['x.js'], consumers: {}, testRefs: {}, keep: { 'x.js': '  ' } });
    assert.equal(p.ok, false);
    assert.equal(p.undisposed.length, 1);
    assert.equal(p.reading, 'retirement-undisposed:1');
});

test('O2-5 清单里出现非文件名：算未处置，不许静默跳过', () => {
    const p = R.buildRetirementPlan({ extraJs: ['ok.js', 42], consumers: {}, testRefs: {} });
    assert.equal(p.ok, false);
    assert.equal(p.undisposed.length, 1);
    assert.match(p.undisposed[0].why, /非文件名/);
});

test('O2-6 退役返回被摘掉的名字与原始序位，清单里别的项顺序不动', () => {
    const p = R.buildRetirementPlan({ extraJs: EXTRA, consumers: CONSUMERS, testRefs: TESTS, keep: KEEP });
    const app = R.applyRetirement(EXTRA, p);
    assert.deepEqual(app.extraJs, ['a.js', 'b.js', 'd.js']);
    assert.deepEqual(app.removed.map((r) => r.file), ['c.js', 'e.js']);
    assert.deepEqual(app.removed.map((r) => r.index), [2, 4]);
});

test('O2-7 回滚后与原清单逐项相等（可回滚不是「大概能回去」）', () => {
    const p = R.buildRetirementPlan({ extraJs: EXTRA, consumers: CONSUMERS, testRefs: TESTS, keep: KEEP });
    const app = R.applyRetirement(EXTRA, p);
    const back = R.rollbackPlan(app.extraJs, app.rollback);
    assert.deepEqual(back.extraJs, EXTRA);
    assert.equal(back.identicalToOriginal, true);
    assert.equal(back.restored, 2);
});

test('O2-8 已确认仍被消费的文件硬闯退役：直接抛错点名', () => {
    const badPlan = {
        candidates: [{ file: 'a.js', disposition: 'retire' }],
        kept: [{ file: 'a.js', consumers: ['index.js'] }]
    };
    assert.throws(() => R.applyRetirement(EXTRA, badPlan), (e) => {
        assert.equal(e.code, 'RETIRE_BLOCKED');
        assert.deepEqual(e.blocked, ['a.js']);
        return true;
    });
});

test('O2-9 空清单不是失败，也不产生候选', () => {
    const p = R.buildRetirementPlan({ extraJs: [], consumers: {}, testRefs: {} });
    assert.equal(p.ok, true);
    assert.equal(p.candidates.length, 0);
    assert.equal(p.reading, 'retirement-plan:0 可退役 / 0 保留');
});
