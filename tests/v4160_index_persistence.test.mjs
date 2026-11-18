// [v4.160.0 · R25-O8] 大规模内存上界与索引持久化
// 验收口径：dump→load 后检索结果逐条一致；校验和不符/版本不符必须拒收；
//           分段重建与整段重建结果一致；重建后不重复计入同一 id。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const I = require(join(ROOT, 'recall-inverted-index.js'));

const DOCS = I.makeDocs(2000, 7);
const Q = '记忆 承诺 车站';

function ids(results) { return results.map((r) => r.id); }

test('O8-1 dump 是可落盘的数据：版本 + 校验和 + 体', () => {
    const d = I.dump(I.buildIndex(DOCS));
    assert.equal(d.version, I.DUMP_VERSION);
    assert.equal(d.size, DOCS.length);
    assert.ok(/^[0-9a-f]+$/.test(d.checksum));
    assert.ok(JSON.parse(JSON.stringify(d)));
});

test('O8-2 dump→load 后检索结果逐条一致', () => {
    const idx = I.buildIndex(DOCS);
    const back = I.load(I.dump(idx));
    assert.equal(back.ok, true);
    assert.deepEqual(ids(I.query(back.index, DOCS, Q, { k: 10 }).results),
        ids(I.query(idx, DOCS, Q, { k: 10 }).results));
});

test('O8-3 校验和被篡改时必须拒收（不许读回一份坏索引）', () => {
    const d = I.dump(I.buildIndex(DOCS));
    d.body.size = d.body.size + 1;
    const bad = I.load(d);
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.bad, ['checksum-mismatch']);
    assert.equal(bad.index.size, 0, '拒收时应回空索引，不是半损的');
});

test('O8-4 版本不符时拒收（旧版仓格式不得冒充新版）', () => {
    const d = I.dump(I.buildIndex(DOCS));
    d.version = 99;
    const bad = I.load(d);
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.bad, ['version-mismatch']);
});

test('O8-5 空 dump 也能往返（不报错）', () => {
    const back = I.load(I.dump(I.emptyIndex()));
    assert.equal(back.ok, true);
    assert.equal(back.index.size, 0);
});

test('O8-6 分段重建与整段重建结果一致（逐条对拍）', () => {
    const one = I.buildIndex(DOCS);
    const seg = I.rebuildInSegments(DOCS, { segmentSize: 300 });
    assert.equal(seg.segments, 7);
    assert.equal(seg.size, DOCS.length);
    assert.deepEqual(ids(I.query(seg.index, DOCS, Q, { k: 10 }).results),
        ids(I.query(one, DOCS, Q, { k: 10 }).results));
});

test('O8-7 分段大小不影响建库结果（200 与 5000 同结果）', () => {
    const a = I.rebuildInSegments(DOCS, { segmentSize: 200 });
    const b = I.rebuildInSegments(DOCS, { segmentSize: 5000 });
    assert.deepEqual(ids(I.query(a.index, DOCS, Q, { k: 5 }).results),
        ids(I.query(b.index, DOCS, Q, { k: 5 }).results));
});

test('O8-8 重复 id 不重复计入（增量 addDoc 后 size 不虚高）', () => {
    const seg = I.rebuildInSegments(DOCS, { segmentSize: 300 });
    const before = seg.index.size;
    I.addDoc(seg.index, DOCS[0]);
    assert.equal(seg.index.size, before);
});

test('O8-9 落盘体积受控：dump 的 postings 条数不回退成逐字', () => {
    const d = I.dump(I.buildIndex(DOCS));
    const terms = Object.keys(d.body.postings).length;
    assert.ok(terms > 0 && terms < DOCS.length * 20, '词项数 ' + terms + ' 不应爆炸');
});

test('O8-10 1 万条建库与持久化往返都在预算内', () => {
    const big = I.makeDocs(10000, 11);
    const t0 = Date.now();
    const idx = I.buildIndex(big);
    const back = I.load(I.dump(idx));
    const ms = Date.now() - t0;
    assert.equal(back.ok, true);
    assert.equal(back.index.size, big.length);
    assert.ok(ms < 8000, '耗时 ' + ms + 'ms');
});

test('O8-11 形态与自检绿', () => {
    const raw = require('node:fs').readFileSync(join(ROOT, 'recall-inverted-index.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaRecallInvertedIndex = api;'));
    assert.ok(!/^export /m.test(raw));
    assert.equal(I.recallIndexSelfCheck().ok, true);
});
