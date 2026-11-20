// [v3.475.0 · L26-X7] 记忆健康看板
// 验收口径：增长/异常/损坏/悬空一眼看出；损坏优先于增长；无基线判 unknown 不判 ok。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const H = require(join(ROOT, 'memory-health-board.js'));

const OK_RECORDS = [
    { id: 'a', content: '一条' },
    { id: 'b', content: '两条' }
];

test('X7-1 五态闭集', () => {
    assert.deepEqual(H.STATES.slice(), ['broken', 'growing', 'anomaly', 'unknown', 'ok']);
});

test('X7-2 没有基线：判 unknown，不许判 ok（没量过不等于健康）', () => {
    const b = H.board({ records: OK_RECORDS });
    assert.equal(b.state, 'unknown');
    assert.equal(b.reading, 'health-unknown');
    assert.match(b.action, /建立基线/);
});

test('X7-3 有基线且平稳：ok，增长比可复算', () => {
    const b = H.board({ records: OK_RECORDS, baseline: { count: 2 } });
    assert.equal(b.state, 'ok');
    assert.equal(b.growth, 1);
    assert.equal(b.reading, 'health-ok');
});

test('X7-4 超增长比：判 growing 并给可执行动作', () => {
    const b = H.board({ records: OK_RECORDS, baseline: { count: 1 } });
    assert.equal(b.state, 'growing');
    assert.equal(b.growth, 2);
    assert.match(b.action, /记忆体检|写入门槛/);
});

test('X7-5 损坏（空正文 / 无 id / 重复 id）逐条列出，且优先于增长', () => {
    const records = [
        { id: 'a', content: '好的' },
        { id: 'b', content: '   ' },
        { content: '没有 id' },
        { id: 'a', content: '重复' }
    ];
    const b = H.board({ records, baseline: { count: 1 } });
    assert.equal(b.state, 'broken');
    assert.equal(b.broken.length, 3);
    assert.match(b.reading, /^health-broken:3/);
    assert.equal(b.growth, 4);
});

test('X7-6 悬空引用也算损坏，读数条数含悬空', () => {
    const b = H.board({ records: OK_RECORDS, relations: [{ from: 'a', to: 'gone' }] });
    assert.equal(b.state, 'broken');
    assert.equal(b.dangling.length, 1);
    assert.match(b.action, /关系/);
});

test('X7-7 条数比基线少：判 anomaly 并提示可能是批量删过', () => {
    const b = H.board({ records: [{ id: 'a', content: 'x' }], baseline: { count: 5 } });
    assert.equal(b.state, 'anomaly');
    assert.match(b.action, /批量删/);
});

test('X7-8 增长比 ≤1 直接抛（1 会把「没长」判成增长）', () => {
    assert.throws(() => H.board({ records: [], growthRatio: 1 }), TypeError);
    assert.throws(() => H.board({ records: [], growthRatio: 0.5 }), TypeError);
    assert.throws(() => H.board({ records: [], growthRatio: '1.5' }), TypeError);
});

test('X7-9 看板条目每项都带动作（每项可点进去处理）', () => {
    const tiles = H.tiles({ records: OK_RECORDS, baseline: { count: 2 } });
    assert.deepEqual(tiles.map((t) => t.key), ['total', 'growth', 'broken', 'dangling']);
    tiles.forEach((t) => assert.ok(t.action && t.action.length > 2, t.key));
});

test('X7-10 空库：无损坏、无基线 ⇒ unknown（不是 ok）', () => {
    const b = H.board({ records: [] });
    assert.equal(b.total, 0);
    assert.equal(b.broken.length, 0);
    assert.equal(b.state, 'unknown');
});