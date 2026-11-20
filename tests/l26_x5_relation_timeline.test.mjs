// [v3.475.0 · L26-X5] 关系时间线视图
// 验收口径：时间轴可拖可筛可点证据；时间缺失不许当 0；空态说「还没有」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'relation-timeline-view.js'));

const EVENTS = [
    { id: 'e2', kind: 'conflict', at: 200, strength: 4, summary: '吵了一架', messageId: 'msg-2' },
    { id: 'e1', kind: 'first-met', at: 100, strength: 2, summary: '第一次见', messageId: 'msg-1' },
    { id: 'e3', kind: 'repair', at: 300, summary: '和好' },
    { id: 'e4', kind: 'distance', at: null, summary: '时间不明' }
];

test('X5-1 六种事件类型闭集', () => {
    assert.deepEqual(T.EVENT_KINDS.slice(), ['first-met', 'grow-closer', 'conflict', 'repair', 'distance', 'promise']);
});

test('X5-2 时间升序排列，同刻按 id 升序（可复跑）', () => {
    const tl = T.buildTimeline(EVENTS);
    assert.deepEqual(tl.items.map((e) => e.id), ['e1', 'e2', 'e3']);
    const same = T.buildTimeline([{ id: 'b', kind: 'conflict', at: 5 }, { id: 'a', kind: 'conflict', at: 5 }]);
    assert.deepEqual(same.items.map((e) => e.id), ['a', 'b']);
});

test('X5-3 时间缺失进 unanchored，不许当 0 排在最前', () => {
    const tl = T.buildTimeline(EVENTS);
    assert.equal(tl.unanchored.length, 1);
    assert.equal(tl.unanchored[0].id, 'e4');
    assert.ok(tl.items.every((e) => e.at !== 0));
    assert.match(tl.unanchored[0].why, /没有可信时间/);
});

test('X5-4 证据覆盖率如实报数，没有证据的条目照旧在轴上', () => {
    const tl = T.buildTimeline(EVENTS);
    assert.equal(tl.evidenceCoverage, 66.7);
    assert.match(tl.reading, /证据 2/);
    assert.equal(tl.items.find((e) => e.id === 'e3').evidence.messageId, null);
});

test('X5-5 可拖：窗口裁剪并报出窗口外还有几条', () => {
    const tl = T.buildTimeline(EVENTS);
    const vp = T.viewport(tl, { from: 150, to: 250 });
    assert.deepEqual(vp.items.map((e) => e.id), ['e2']);
    assert.equal(vp.hidden, 2);
    assert.equal(vp.reading, 'timeline-window:1/3');
});

test('X5-6 窗口起点晚于终点：直接抛（拖反了不许静默给空）', () => {
    const tl = T.buildTimeline(EVENTS);
    assert.throws(() => T.viewport(tl, { from: 300, to: 100 }), TypeError);
});

test('X5-7 可筛：按类型筛，筛掉的条数报数', () => {
    const tl = T.buildTimeline(EVENTS);
    const f = T.filterTimeline(tl, { kinds: ['conflict', 'repair'] });
    assert.deepEqual(f.items.map((e) => e.id), ['e2', 'e3']);
    assert.equal(f.removed, 1);
});

test('X5-8 按强度筛：没强度的条目不算「够强」，不许混进来', () => {
    const tl = T.buildTimeline(EVENTS);
    const f = T.filterTimeline(tl, { minStrength: 3 });
    assert.deepEqual(f.items.map((e) => e.id), ['e2']);
});

test('X5-9 行视图：可点到证据消息；空轴给「还没有关系变化」', () => {
    const tl = T.buildTimeline(EVENTS);
    const r = T.rows(tl);
    assert.equal(r.rows.length, 3);
    assert.equal(r.rows[0].clickable, true);
    assert.equal(r.rows[0].messageId, 'msg-1');
    assert.equal(r.rows[2].clickable, false);
    const empty = T.rows(T.buildTimeline([]));
    assert.equal(empty.text, T.EMPTY_TEXT);
    assert.equal(empty.reading, 'timeline-empty');
});

test('X5-10 空轴：isEmpty 为真，span 为 null（不给假区间）', () => {
    const tl = T.buildTimeline([]);
    assert.equal(tl.isEmpty, true);
    assert.equal(tl.span, null);
    assert.equal(tl.evidenceCoverage, 0);
});