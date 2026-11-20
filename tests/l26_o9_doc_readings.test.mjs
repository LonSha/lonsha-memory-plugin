// [v3.475.0 · L26-O9] 文档与实现同源
// 验收口径：读数由生成器产出；文档声明逐条对拍；量不出来的单列且不算通过。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const G = require(join(ROOT, 'doc-readings-generator.js'));

test('O9-1 读数只来自注入的测量器', () => {
    const r = G.collectReadings({ 测试文件数: () => 605, '根 js 数': () => 415 });
    assert.equal(r.ok, true);
    assert.deepEqual(Object.keys(r.readings), ['测试文件数', '根 js 数']);
    assert.equal(r.readings['测试文件数'], 605);
    assert.equal(r.readings['根 js 数'], 415);
});

test('O9-2 测量器不是函数或返回非数字：单列失败，不算通过', () => {
    const r = G.collectReadings({ a: 5, b: () => null, c: () => 3 });
    assert.equal(r.ok, false);
    assert.deepEqual(r.failures.map((f) => f.key).sort(), ['a', 'b']);
    assert.deepEqual(r.readings, { c: 3 });
});

test('O9-3 文档声明与生成读数一致：doc-synced 且 ok', () => {
    const a = G.auditDoc({ docText: '本版共有测试文件数: 605 个，根 js 数：415 个。', readings: { 测试文件数: 605, 根js数: 415 } });
    assert.equal(a.ok, true);
    assert.equal(a.reading, 'doc-synced');
});

test('O9-4 文档过期：stale 点名「文档写 X、实际 Y」，不许静默通过', () => {
    const a = G.auditDoc({ docText: '测试文件数：605', readings: { 测试文件数: 623 } });
    assert.equal(a.ok, false);
    assert.deepEqual(a.stale, [{ key: '测试文件数', doc: 605, actual: 623 }]);
    assert.equal(a.reading, 'doc-stale:测试文件数');
});

test('O9-5 文档里根本没提读数：doc-no-readings，不算同源', () => {
    const a = G.auditDoc({ docText: '本版修了一堆东西。', readings: { 测试文件数: 605 } });
    assert.equal(a.ok, false);
    assert.equal(a.reading, 'doc-no-readings');
});

test('O9-6 量不出来的「像读数」单列 unverifiable：不算通过也不算失败', () => {
    const a = G.auditDoc({ docText: '测试文件数：605；改动行数：9999', readings: { 测试文件数: 605 } });
    assert.equal(a.stale.length, 0);
    assert.deepEqual(a.unverifiable, [{ key: '改动行数', doc: 9999 }]);
});

test('O9-7 三种声明写法都认（冒号/中文冒号/等号）', () => {
    const claims = G.extractClaims('测试文件数: 605 / 测试文件数：606 / 测试文件数 = 607', ['测试文件数']);
    assert.deepEqual(claims.map((c) => c.value), [605, 606, 607]);
});

test('O9-8 生成块只从读数来，末尾带「手改无效」声明', () => {
    const block = G.renderReadingsBlock({ b: 2, a: 1 }, '本版读数');
    assert.match(block, /### 本版读数/);
    assert.match(block, /\| a \| 1 \|/);
    assert.match(block, /手改无效/);
    assert.ok(block.indexOf('| a |') < block.indexOf('| b |'), '键要排序，避免每次重排 diff');
});

test('O9-9 读数键含正则元字符也能对拍（不靠字符串拼正则）', () => {
    const a = G.auditDoc({ docText: 'r26.test: 7', readings: { 'r26.test': 7 } });
    assert.equal(a.ok, true);
});