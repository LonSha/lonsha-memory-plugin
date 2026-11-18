// [v4.160.0 · R25-O3] 多模态条目参与分层治理
// 验收口径：图像/语音没有正文也能被合理分层；同一批数据两次分层一致；
//           悬空条目只报一次警；悬空条目不被召回（含冷层补扫）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(join(ROOT, 'tiered-memory-plane.js'));

const NOW = Date.parse('2026-11-18T00:00:00Z');
const longDesc = '一张海边合照，两个人都笑着，背景是傍晚的云和退潮的沙滩，照片里还有一只椰子';
const shortDesc = '一只猫';

function store() {
    return { memories: [
        { id: 'img-long', modality: 'image', description: longDesc, at: '2026-11-17', state: 'ok' },
        { id: 'img-short', modality: 'image', description: shortDesc, at: '2026-11-17', state: 'ok' },
        { id: 'img-nodesc', modality: 'image', description: '', at: '2026-11-17', state: 'undescribed' },
        { id: 'aud', modality: 'audio', transcript: '我今天有点累，明天再说吧，先睡了', at: '2026-11-17', state: 'ok' },
        { id: 'txt', text: '普通文本记忆', at: '2026-11-17', state: 'ok' },
        { id: 'gone', modality: 'image', description: '源图已删的那张海边合照', at: '2026-11-17', state: 'dangling', danglingReason: '源已删除' }
    ] };
}

function scoreOf(id) {
    const r = T.classify(store(), { nowMs: NOW });
    const m = r.store.memories.find((x) => x.id === id);
    return m.tierScore;
}

test('O3-1 多模态没有正文也能分层（按描述长度做显著度代理）', () => {
    assert.ok(scoreOf('img-long') > scoreOf('img-short'), '长描述应比短描述更显著');
    assert.ok(scoreOf('img-long') > scoreOf('txt') - 0.5, '长描述图应至少不落在文本中性分之下');
});

test('O3-2 文本条目口径不变（仍 0.5 中性显著度）', () => {
    const r = T.classify(store(), { nowMs: NOW });
    const txt = r.store.memories.find((x) => x.id === 'txt');
    // 只校验显著度一项：把 refs/recency 归零后与纯 salience 对比
    const base = T.classify({ memories: [{ id: 'p', text: '普通文本记忆', at: '2026-11-17' }] }, { nowMs: NOW });
    const same = base.store.memories[0].tierScore;
    assert.equal(Number(txt.tierScore.toFixed(6)), Number(same.toFixed(6)));
});

test('O3-3 显式 salience 优先于长度代理', () => {
    const fixed = { memories: [
        { id: 'a', modality: 'image', description: longDesc, salience: 0.01, at: '2026-11-17' },
        { id: 'b', modality: 'image', description: shortDesc, salience: 0.9, at: '2026-11-17' }
    ] };
    const r = T.classify(fixed, { nowMs: NOW });
    const a = r.store.memories.find((x) => x.id === 'a').tierScore;
    const b = r.store.memories.find((x) => x.id === 'b').tierScore;
    assert.ok(b > a, '显式 salience 应压过长度');
});

test('O3-4 同一批数据两次分层逐字段一致（确定性）', () => {
    const a = T.classify(store(), { nowMs: NOW });
    const b = T.classify(store(), { nowMs: NOW });
    assert.equal(JSON.stringify(a.store), JSON.stringify(b.store));
    assert.deepEqual(a.tiers, b.tiers);
});

test('O3-5 悬空条目只报一次警：10 轮迁移后报警数仍为 1', () => {
    let r = T.classify(store(), { nowMs: NOW });
    let alarms = r.migrated.filter((m) => m.reason === 'dangling').length;
    assert.equal(alarms, 1, '首轮应报一次，实为 ' + alarms);
    for (let i = 0; i < 10; i++) r = T.classify(r.store, { nowMs: NOW });
    const again = r.migrated.filter((m) => m.reason === 'dangling').length;
    assert.equal(again, 0, '后续轮不得重复报警，实为 ' + again);
});

test('O3-6 悬空条目仍留在列表里（不静默消失）且带原因', () => {
    const r = T.classify(store(), { nowMs: NOW });
    const gone = r.store.memories.find((x) => x.id === 'gone');
    assert.ok(gone, '悬空条目不得被删掉');
    assert.equal(gone.state, 'dangling');
    assert.match(String(gone.danglingReason), /源已删除/);
    assert.equal(gone.danglingReported, true);
});

test('O3-7 悬空条目不被召回，且跳过数可见', () => {
    const r = T.classify(store(), { nowMs: NOW });
    const flat = T.recallFlat(r.store, '海边合照');
    assert.equal(flat.results.some((x) => x.id === 'gone'), false);
    assert.equal(flat.skippedDangling, 1);
    assert.ok(flat.results.some((x) => x.id === 'img-long'), '活着的条目应召回');
});

test('O3-8 冷层补扫也不得把悬空条目拉回', () => {
    const cold = { memories: [
        { id: 'old-alive', text: '海边合照（活）', tier: 'cold', at: '2026-01-01', salience: 0.01 },
        { id: 'old-gone', text: '海边合照（源已删）', tier: 'cold', state: 'dangling', at: '2026-01-01', salience: 0.01 }
    ] };
    const auto = T.recallTiered(cold, '海边合照', { includeCold: 'auto', k: 5 });
    const ids = auto.results.map((x) => x.id);
    assert.ok(ids.includes('old-alive'));
    assert.equal(ids.includes('old-gone'), false);
    assert.equal(auto.skippedDangling, 1);
});

test('O3-9 includeCold=always 与 flat 结果等价（两边都排除悬空）', () => {
    const r = T.classify(store(), { nowMs: NOW });
    const flat = T.recallFlat(r.store, '海边合照', { k: 10 });
    const always = T.recallTiered(r.store, '海边合照', { includeCold: 'always', k: 10 });
    assert.deepEqual(always.results.map((x) => x.id), flat.results.map((x) => x.id));
});

test('O3-10 语音条目按转写长度分层，不因没有正文掉进冷层', () => {
    const aud = scoreOf('aud');
    const txt = scoreOf('txt');
    assert.ok(aud >= txt - 0.2, '语音 ' + aud + ' 不应远低于文本 ' + txt);
});

test('O3-11 形态：经典脚本 + 导出面齐全', () => {
    const raw = require('node:fs').readFileSync(join(ROOT, 'tiered-memory-plane.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaTieredMemoryPlane = api;'));
    assert.ok(!/^export /m.test(raw));
    assert.equal(typeof T.substanceOf, 'function');
    assert.equal(typeof T.classify, 'function');
});
