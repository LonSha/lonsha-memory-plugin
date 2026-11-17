// tests/l23_x7_revision_history.test.mjs — L23-X7「记忆修订历史」
// 计划书：chained / single，不许抹掉历史。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('memory-revision-history.js', 'LonShaMemoryRevisionHistory');

test('【1】能串起来 → chained，且逐版保留原文', () => {
    const r = M.revisionChain([
        { id: 'v1', parentId: null, floor: 10, text: '她住在城南' },
        { id: 'v2', parentId: 'v1', floor: 20, text: '她搬到城北' },
        { id: 'v3', parentId: 'v2', floor: 30, text: '她又搬回城南' }
    ]);
    assert.strictEqual(r.face, 'chained');
    assert.strictEqual(r.depth, 3);
    assert.deepStrictEqual(r.items.map((i) => i.text), ['她住在城南', '她搬到城北', '她又搬回城南']);
});

test('【2】只有一版 → single，与 chained 不同形', () => {
    const r = M.revisionChain([{ id: 'v1' }]);
    assert.strictEqual(r.face, 'single');
    assert.notStrictEqual(r.face, 'chained');
});

test('【3】父版本缺失 → broken，且不丢行（行数 = 输入条数）', () => {
    const input = [{ id: 'v2', parentId: 'v9' }, { id: 'v3', parentId: 'v2' }];
    const r = M.revisionChain(input);
    assert.strictEqual(r.face, 'broken');
    assert.strictEqual(r.items.length, input.length, '抹历史就是缺陷');
    assert.strictEqual(r.bad[0].reason, 'parent-missing');
    assert.match(M.historyNote(r), /不丢行/);
});

test('【4】空史 empty、非数组 invalid，不塌成 chained', () => {
    assert.strictEqual(M.revisionChain([]).face, 'empty');
    assert.strictEqual(M.revisionChain(null).face, 'invalid');
});

test('【5】负控制：静默丢掉断环那行的实现必须被判红', () => {
    const input = [{ id: 'v1' }, { id: 'v2', parentId: 'gone' }];
    const real = M.revisionChain(input);
    const cheat = { face: 'chained', items: [input[0]], depth: 1 };
    assert.strictEqual(real.items.length, 2);
    assert.notStrictEqual(real.items.length, cheat.items.length);
    assert.notStrictEqual(real.face, cheat.face);
});

test('【6】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('memory-revision-history.js'));
});