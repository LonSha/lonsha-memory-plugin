// tests/v3189_emotion_evidence.test.mjs
// [v3.189.0] 情绪证据分层：一拍的分数必须能还原到命中词。
//   旧拍只存 polarity / tension / dominant，同一个分数可以来自完全不同的词。
//   本版不新建词表、不重扫正文：只把 scanEmotion 已经计进分数的那些词记在拍上。
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';

const require_ = createRequire(import.meta.url);
const NP = require_('../narrative-pulse.js');
const { NarrativePulse, scanEmotion, emotionEvidence, EMO_LEXICON } = NP;

test('v3189 1. 扫描记下真正计入分数的词，且与词典权重一致', () => {
  const r = scanEmotion('她心里难过，又难过，他却温柔地陪着。');
  const words = r.evidence.map((h) => h.word);
  assert.ok(words.includes('难过'), '必须记下「难过」');
  assert.ok(words.includes('温柔'), '必须记下「温柔」');
  const sad = r.evidence.find((h) => h.word === '难过');
  assert.equal(sad.dim, 'sad');
  assert.equal(sad.count, 2);
  assert.equal(sad.weight, EMO_LEXICON.sad['难过']);
  assert.equal(r.scores.sad, sad.weight * sad.count);
});

test('v3189 2. 词频上限与计分一致：同一词最多记 4 次', () => {
  const r = scanEmotion('难过难过难过难过难过难过');
  const sad = r.evidence.find((h) => h.word === '难过');
  assert.equal(sad.count, 4);
  assert.equal(r.scores.sad, EMO_LEXICON.sad['难过'] * 4);
});

test('v3189 3. 无情绪词的新拍是 none，不是 missing', () => {
  const p = new NarrativePulse();
  const beat = p.beat(3, { mesText: '今天天气不错。' });
  const layer = emotionEvidence(beat);
  assert.equal(layer.layer, 'none');
  assert.equal(layer.hits.length, 0);
  assert.equal(layer.strongest, null);
});

test('v3189 4. 旧拍没有证据字段时读成 missing，不伪装成没有情绪', () => {
  const legacy = { floor: 1, polarity: -0.6, tension: 0.4, dominant: 'sad' };
  const layer = emotionEvidence(legacy);
  assert.equal(layer.layer, 'missing');
  assert.deepEqual(layer.hits, []);
});

test('v3189 5. 词典里没有的词不进层，即使拍上写了', () => {
  const forged = { evidence: [{ dim: 'sad', word: '不在词典的词', count: 3, weight: 9 }] };
  const layer = emotionEvidence(forged);
  assert.equal(layer.layer, 'none');
  assert.equal(layer.hits.length, 0);
});

test('v3189 6. 同楼覆盖后证据跟随最新正文', () => {
  const p = new NarrativePulse();
  p.beat(4, { mesText: '她很开心。' });
  const beat = p.beat(4, { mesText: '她很难过。' });
  assert.equal(p.beats.length, 1);
  const layer = emotionEvidence(beat);
  assert.equal(layer.layer, 'scored');
  assert.ok(layer.hits.some((h) => h.word === '难过'));
  assert.ok(!layer.hits.some((h) => h.word === '开心'));
});

test('v3189 7. 导出仍带证据，旧存档导入后按 missing 读', () => {
  const p = new NarrativePulse();
  p.beat(2, { mesText: '他承诺会守护她。' });
  const pack = p.export();
  assert.ok(Array.isArray(pack.beats[0].evidence));
  const q = new NarrativePulse();
  q.import({ beats: [{ floor: 2, polarity: 0.8, tension: 0, dominant: 'warm' }], arcs: {} });
  assert.equal(emotionEvidence(q.beats[0]).layer, 'missing');
});

test('v3189 8. 分数可从证据层还原，不另持一份计分', () => {
  const text = '她恐惧地颗抖，他把她抱进怀里。';
  const scanned = scanEmotion(text);
  const p = new NarrativePulse();
  const beat = p.beat(8, { mesText: text });
  const layer = emotionEvidence(beat);
  const rebuilt = {};
  for (const hit of layer.hits) rebuilt[hit.dim] = (rebuilt[hit.dim] || 0) + hit.score;
  for (const dim of Object.keys(scanned.scores)) {
    if (!scanned.scores[dim]) continue;
    assert.equal(rebuilt[dim], scanned.scores[dim], dim + ' 的分数必须能由证据加总还原');
  }
});

test('v3189 9. 版本三源同源', () => {
  const root = new URL('..', import.meta.url);
  const src = readFileSync(new URL('index.js', root), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  const v = /const VERSION = '([^']+)'/.exec(src)[1];
  assert.equal(v, '3.198.0');
  assert.equal(manifest.version, v);
  assert.equal(pkg.version, v);
});
