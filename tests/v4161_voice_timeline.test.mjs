// [v4.161.0 · R25-X3] 语音时间轴：哪句话发生在什么时候
// 验收口径：一条语音切成 N 句后召回「其中一句」能定位回该语音与楼层。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const M = require(join(ROOT, 'multimodal-memory.js'));

const T1 = '你还在吗。我有点想走了！真的';
function store() {
    let s = M.createStore();
    s = M.register(s, { modality: 'audio', srcId: 'v1', floor: 7, capturedAt: '2026-11-10 21:00', transcript: T1 }).store;
    s = M.register(s, { modality: 'audio', srcId: 'v2', floor: 9, capturedAt: '2026-11-09 08:00', transcript: '早上好' }).store;
    return s;
}

test('X3-1 一句语音按标点切成 N 句（句号/感叹号都是边界）', () => {
    assert.deepEqual(M.splitSentences(T1), ['你还在吗', '我有点想走了', '真的']);
    assert.deepEqual(M.splitSentences('早上好'), ['早上好']);
});

test('X3-2 切句不产空句：连续标点 / 首尾空白都不占位', () => {
    assert.deepEqual(M.splitSentences('。你好。。走了。'), ['你好', '走了']);
    assert.deepEqual(M.splitSentences('   '), []);
    assert.deepEqual(M.splitSentences(''), []);
});

test('X3-3 时间轴按时间排：早的在前，同时间的按 id / 句序稳定', () => {
    const tl = M.timeline(store());
    assert.equal(tl.total, 4);
    assert.deepEqual(tl.rows.map((r) => r.id + '#' + r.index), ['audio-2#0', 'audio-1#0', 'audio-1#1', 'audio-1#2']);
});

test('X3-4 每句都挂剧情时间与楼层（句级引用不丢来源）', () => {
    const rows = M.timeline(store()).rows;
    rows.forEach((r) => {
        assert.ok(r.at.length > 0, r.id);
        assert.equal(typeof r.floor, 'number');
        assert.ok(r.sentence.length > 0);
    });
});

test('X3-5 句子保留原文（不改写、不截断）', () => {
    const rows = M.timeline(store()).rows.filter((r) => r.id === 'audio-1');
    assert.deepEqual(rows.map((r) => r.sentence), ['你还在吗', '我有点想走了', '真的']);
});

test('X3-6 召回「其中一句」能定位回该语音与楼层', () => {
    const s = store();
    const r = M.recall(s, '想走');
    assert.ok(r.hits.length >= 1);
    const hit = r.hits[0];
    assert.equal(hit.id, 'audio-1');
    const loc = M.locateSentence(s, hit.id, 1);
    assert.equal(loc.ok, true);
    assert.equal(loc.sentence, '我有点想走了');
    assert.equal(loc.floor, 7);
    assert.equal(loc.srcId, 'v1');
});

test('X3-7 句索引越界 / 条目不存 ⇒ 各自具名', () => {
    const s = store();
    assert.deepEqual(M.locateSentence(s, 'audio-1', 9).bad, ['no-such-sentence']);
    assert.deepEqual(M.locateSentence(s, 'zzz', 0).bad, ['no-such-entry']);
});

test('X3-8 无转写的语音不进时间轴（不编句子）', () => {
    let s = M.createStore();
    s = M.register(s, { modality: 'audio', floor: 2 }).store;
    assert.equal(M.timeline(s).total, 0);
});

test('X3-9 时间轴可复现：同库两次同结果', () => {
    const s = store();
    assert.equal(JSON.stringify(M.timeline(s)), JSON.stringify(M.timeline(s)));
});

test('X3-10 自检绿', () => {
    const sc = M.mmSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
