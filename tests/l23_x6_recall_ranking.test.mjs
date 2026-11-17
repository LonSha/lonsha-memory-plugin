// tests/l23_x6_recall_ranking.test.mjs — L23-X6「检索可解释排序」判据
// 计划书原文：四项分项（vector/recency/significance/graph），缺项标 unknown 不许写 0。
// 判据 ① 四项分项齐 ② 缺项=unknown 不是 0 ③ 真 0 分不许变 unknown ④ 排序稳定可复算
//      ⑤ 三态（ranked/empty/invalid）不塌 ⑥ 负控制：把 unknown 写成 0 必须被判红
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const SRC = path.join(REPO, 'recall-ranking-explain.js');
const src = fs.readFileSync(SRC, 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

const sandbox = { module: { exports: {} }, window: undefined, globalThis: undefined };
const loader = new Function('globalThis', 'module', 'window',
    src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaRecallRankingExplain;');
const M = loader(sandbox, sandbox.module, undefined);

test('【1】四项分项齐、缺项记 unknown、真 0 不变形', () => {
    const r = M.explainRanking([
        { id: 'a', scores: { vector: 1, recency: 0, significance: null, graph: 2 } },
        { id: 'b', scores: { vector: 0, recency: 1, significance: 0, graph: 0 } }
    ]);
    assert.deepStrictEqual(M.CHANNELS, ['vector', 'recency', 'significance', 'graph']);
    assert.strictEqual(r.face, 'ranked');
    assert.strictEqual(r.items[0].parts.significance, 'unknown', '缺项必须 unknown');
    assert.strictEqual(r.items[1].parts.vector, 0, '真 0 分不许变 unknown');
    assert.deepStrictEqual(r.unknownChannels, ['significance']);
    assert.strictEqual(r.complete, false);
    assert.strictEqual(r.items[0].unknown.includes('significance'), true);
});

test('【2】缺项不计入 total（不是按 0 计）', () => {
    const only = M.explainRanking([{ id: 'x', scores: { vector: 2 } }]);
    assert.strictEqual(only.items[0].total, 2, '只有 vector 有分，total 应为 2');
    const both = M.explainRanking([{ id: 'x', scores: { vector: 2, recency: 3 } }]);
    assert.strictEqual(both.items[0].total, 5);
});

test('【3】权重只作用于已给分的通道', () => {
    const r = M.explainRanking([{ id: 'x', scores: { vector: 2, recency: null } }], { weights: { vector: 10, recency: 100 } });
    assert.strictEqual(r.items[0].total, 20, 'recency 缺分时权重不得凭空生效');
});

test('【4】排序与 rank 可复算、同分按 id 稳定', () => {
    const r = M.explainRanking([
        { id: 'b', scores: { vector: 1, recency: 1, significance: 1, graph: 1 } },
        { id: 'a', scores: { vector: 1, recency: 1, significance: 1, graph: 1 } },
        { id: 'c', scores: { vector: 9, recency: 9, significance: 9, graph: 9 } }
    ]);
    assert.deepStrictEqual(r.order, ['c', 'a', 'b']);
    assert.deepStrictEqual(r.items.map((i) => i.rank), [1, 2, 3]);
    assert.strictEqual(r.complete, true);
});

test('【5】三态不塌：empty / invalid 与 ranked 不同形', () => {
    const e = M.explainRanking([]);
    assert.strictEqual(e.face, 'empty');
    assert.strictEqual(e.items.length, 0);
    const i = M.explainRanking(null);
    assert.strictEqual(i.face, 'invalid');
    assert.notStrictEqual(e.face, i.face);
    assert.match(M.explainNote(e), /没有候选/);
    assert.match(M.explainNote(i), /读不出来/);
});

test('【6】负控制：把 unknown 顶替成 0 的实现必须被判红', () => {
    // 同形实现：缺项按 0 计（total 相同、但 complete 与 unknownChannels 不同）
    const cheat = (cands) => {
        const rows = cands.map((c) => {
            const parts = {}; let total = 0;
            for (const ch of M.CHANNELS) {
                const n = c.scores[ch] === null || c.scores[ch] === undefined ? 0 : Number(c.scores[ch]);
                parts[ch] = n; total += n;
            }
            return { id: c.id, parts, total, unknown: [], complete: true };
        });
        return { face: 'ranked', items: rows, unknownChannels: [], complete: true };
    };
    const input = [{ id: 'a', scores: { vector: 1, recency: null, significance: 0, graph: 0 } }];
    const real = M.explainRanking(input);
    const fake = cheat(input);
    assert.strictEqual(real.items[0].parts.recency, 'unknown');
    assert.strictEqual(fake.items[0].parts.recency, 0);
    assert.notStrictEqual(real.complete, fake.complete, '两态必须可分，否则这条判据恒绿');
    assert.strictEqual(real.unknownChannels.length > 0 && fake.unknownChannels.length === 0, true);
});

test('【7】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(manifest.extra_js.includes('recall-ranking-explain.js'), '模块必须登记 extra_js');
});
