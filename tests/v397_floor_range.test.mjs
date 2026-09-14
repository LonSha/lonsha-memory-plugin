// tests/v397_floor_range.test.mjs — [v3.97] Amily2 楼层范围增量追踪缝合测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
    parseFloorRangeKey, mergeRanges, maxCoveredFloor,
    rangeContains, rangesOverlap, computePendingRange, subtractRange, createTracker,
} = require('../floor-range.js');

test('parseFloorRangeKey 解析与容错', () => {
    assert.deepEqual(parseFloorRangeKey('10-25'), { start: 10, end: 25 });
    assert.deepEqual(parseFloorRangeKey(' 3 - 7 '), { start: 3, end: 7 });
    assert.deepEqual(parseFloorRangeKey('25-10'), { start: 10, end: 25 }); // 自动纠正
    assert.equal(parseFloorRangeKey('abc'), null);
    assert.equal(parseFloorRangeKey('10'), null);      // 单点不是区间
    assert.equal(parseFloorRangeKey(''), null);
});

test('mergeRanges 重叠与相邻合并', () => {
    // [1-5]+[5-8] 重叠合并为 [1-8]；[10-12] 独立；[20-22] 独立
    assert.deepEqual(
        mergeRanges([{ start: 1, end: 5 }, { start: 5, end: 8 }, { start: 10, end: 12 }, { start: 20, end: 22 }]),
        [{ start: 1, end: 8 }, { start: 10, end: 12 }, { start: 20, end: 22 }]
    );
    // 相邻（gap=1）合并：[1-5]+[6-9] → [1-9]
    assert.deepEqual(mergeRanges([{ start: 1, end: 5 }, { start: 6, end: 9 }]), [{ start: 1, end: 9 }]);
    // 空输入
    assert.deepEqual(mergeRanges([]), []);
    // 乱序输入排序
    assert.deepEqual(mergeRanges([{ start: 20, end: 22 }, { start: 1, end: 5 }]), [{ start: 1, end: 5 }, { start: 20, end: 22 }]);
});

test('maxCoveredFloor 已覆盖最大楼层', () => {
    assert.equal(maxCoveredFloor([{ start: 1, end: 10 }, { start: 20, end: 30 }]), 30);
    assert.equal(maxCoveredFloor([]), 0);
});

test('rangeContains / rangesOverlap 判定', () => {
    assert.equal(rangeContains({ start: 1, end: 10 }, { start: 3, end: 7 }), true);
    assert.equal(rangeContains({ start: 1, end: 10 }, { start: 5, end: 15 }), false);
    assert.equal(rangesOverlap({ start: 1, end: 10 }, { start: 10, end: 20 }), true); // 端点相接算重叠
    assert.equal(rangesOverlap({ start: 1, end: 10 }, { start: 11, end: 20 }), false);
});

test('computePendingRange 增量计算（无空洞）', () => {
    assert.deepEqual(computePendingRange([{ start: 1, end: 10 }], 15), [{ start: 11, end: 15 }]);
    assert.deepEqual(computePendingRange([{ start: 1, end: 30 }], 30), []); // 全覆盖
});

test('computePendingRange 空洞检测（删楼后）', () => {
    // 已覆盖 1-10、20-30，最新 30 → 待处理空洞 11-19
    assert.deepEqual(
        computePendingRange([{ start: 1, end: 10 }, { start: 20, end: 30 }], 30),
        [{ start: 11, end: 19 }]
    );
    // 多段空洞
    assert.deepEqual(
        computePendingRange([{ start: 1, end: 5 }, { start: 10, end: 12 }, { start: 20, end: 25 }], 25),
        [{ start: 6, end: 9 }, { start: 13, end: 19 }]
    );
});

test('computePendingRange 边界（latestFloor 非法/从零开始）', () => {
    assert.deepEqual(computePendingRange([], 0), []);
    assert.deepEqual(computePendingRange([], -5), []);
    assert.deepEqual(computePendingRange([], 10), [{ start: 1, end: 10 }]); // 无覆盖全量
});

test('subtractRange 删楼扣除（中间分裂）', () => {
    assert.deepEqual(
        subtractRange([{ start: 1, end: 30 }], { start: 10, end: 15 }),
        [{ start: 1, end: 9 }, { start: 16, end: 30 }]
    );
});

test('subtractRange 扣除（边缘裁剪与整体删除）', () => {
    // 裁剪头部
    assert.deepEqual(subtractRange([{ start: 1, end: 30 }], { start: 1, end: 10 }), [{ start: 11, end: 30 }]);
    // 裁剪尾部
    assert.deepEqual(subtractRange([{ start: 1, end: 30 }], { start: 25, end: 30 }), [{ start: 1, end: 24 }]);
    // 整体删除
    assert.deepEqual(subtractRange([{ start: 5, end: 10 }], { start: 1, end: 30 }), []);
    // 无重叠不变
    assert.deepEqual(subtractRange([{ start: 1, end: 5 }], { start: 20, end: 30 }), [{ start: 1, end: 5 }]);
});

test('createTracker 增量工作流（标记→补漏→判新）', () => {
    const t = createTracker();
    t.markProcessed(1, 10);
    assert.deepEqual(t.pending(15), [{ start: 11, end: 15 }]);
    assert.equal(t.isUpToDate(15), false);
    t.markProcessed(11, 15);
    assert.equal(t.isUpToDate(15), true);
    assert.equal(t.maxFloor(), 15);
});

test('createTracker 删楼后重算（remove→pending 出现空洞）', () => {
    const t = createTracker([{ start: 1, end: 30 }]);
    t.remove(10, 15); // 删除 10-15 楼
    assert.deepEqual(t.exportRanges(), [{ start: 1, end: 9 }, { start: 16, end: 30 }]);
    // 重新计算到 30，空洞 10-15 待处理
    assert.deepEqual(t.pending(30), [{ start: 10, end: 15 }]);
    assert.equal(t.isUpToDate(30), false);
});

test('createTracker exportRanges 深拷贝（外部不可篡改内部）', () => {
    const t = createTracker();
    t.markProcessed(1, 5);
    const snap = t.exportRanges();
    snap[0].end = 999;
    assert.equal(t.maxFloor(), 5); // 内部未被外部修改影响
});