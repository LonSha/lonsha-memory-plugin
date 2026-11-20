// [v3.475.0 · L26-X9] 检索解释器
// 验收口径：能答命中哪一路/哪几个词/哪条证据；不知道就说不知道；分值只来自入参。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const E = require(join(ROOT, 'recall-explainer.js'));

const HITS = [
    { memoryId: 'm1', route: 'keyword', terms: ['雨天', '伞'], score: 0.81, rank: 1, messageId: 'msg-11', floor: 3 },
    { memoryId: 'm2', route: 'vector', score: 0.62, rank: 2 }
];

test('X9-1 五路召回闭集（未登记的一律说不知道）', () => {
    assert.deepEqual(E.ROUTES.slice(), ['keyword', 'vector', 'recency', 'relation', 'entity']);
});

test('X9-2 解释一条命中：命中哪一路、哪几个词、哪条证据', () => {
    const out = E.explain({ query: '雨天', hits: HITS });
    const r = out.rows[0];
    assert.equal(r.route, 'keyword');
    assert.deepEqual(r.terms, ['雨天', '伞']);
    assert.equal(r.evidence.messageId, 'msg-11');
    assert.match(r.text, /由「keyword」这一路召回/);
    assert.match(r.text, /命中词：雨天、伞/);
    assert.match(r.text, /证据消息 msg-11/);
    assert.equal(out.reading, 'explain:2');
});

test('X9-3 分数与名次只抄入参，本档不算分', () => {
    const out = E.explain({ hits: HITS });
    assert.equal(out.rows[0].score, 0.81);
    assert.equal(out.rows[0].rank, 1);
    assert.equal(out.rows[1].score, 0.62);
});

test('X9-4 缺词、缺证据：明说缺什么，不留空白', () => {
    const out = E.explain({ hits: [HITS[1]] });
    assert.match(out.rows[0].text, /没有词级证据/);
    assert.match(out.rows[0].text, /没有证据消息/);
    assert.deepEqual(out.noEvidence, ['m2']);
});

test('X9-5 路由未登记：判 unknown-route 并点名（不猜一个解释）', () => {
    const out = E.explain({ hits: [{ memoryId: 'm9', route: 'telepathy', score: 0.9 }] });
    assert.equal(out.rows[0].route, 'unknown-route');
    assert.equal(out.rows[0].routeRegistered, false);
    assert.match(out.rows[0].text, /无法解释/);
    assert.deepEqual(out.unknownRoute, ['m9']);
    assert.equal(out.ok, false);
    assert.equal(out.reading, 'explain-unknown-route:1');
});

test('X9-6 没有命中：explain-no-hit，不给空解释冒充通过', () => {
    const out = E.explain({ hits: [] });
    assert.equal(out.reading, 'explain-no-hit');
    assert.equal(out.ok, false);
});

test('X9-7 whyRemembered：从轨迹里取最近一次命中并给出人话', () => {
    const trace = [
        { memoryId: 'm1', route: 'vector', score: 0.4, rank: 5 },
        { memoryId: 'm1', route: 'keyword', terms: ['雨天'], messageId: 'msg-11' }
    ];
    const w = E.whyRemembered({ id: 'm1' }, trace);
    assert.equal(w.found, true);
    assert.equal(w.detail.route, 'keyword');
    assert.match(w.text, /雨天/);
    assert.equal(w.reading, 'explain:1');
});

test('X9-8 whyRemembered 没有轨迹：说「无法解释」，不编理由', () => {
    const w = E.whyRemembered({ id: 'm404' }, []);
    assert.equal(w.found, false);
    assert.equal(w.reading, 'explain-no-trace');
    assert.match(w.text, /无法解释/);
});

test('X9-9 词数组里混入非字符串：过滤掉，不许出现 undefined 命中词', () => {
    const out = E.explain({ hits: [{ memoryId: 'm1', route: 'keyword', terms: ['雨天', null, 3, ''] }] });
    assert.deepEqual(out.rows[0].terms, ['雨天']);
});