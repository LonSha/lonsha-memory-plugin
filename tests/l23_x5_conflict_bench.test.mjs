// tests/l23_x5_conflict_bench.test.mjs — L23-X5「记忆冲突裁决台」
// 计划书：三种处置候选，自动裁决即翻红。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('memory-conflict-bench.js', 'LonShaMemoryConflictBench');
const C = { id: 'c1', left: { fact: '她说周三走', floor: 10 }, right: { fact: '她说周四走', floor: 20 } };

test('【1】只摆三种候选，不自带结论', () => {
    const p = M.proposeResolutions(C);
    assert.strictEqual(p.face, 'awaiting-human');
    assert.deepStrictEqual(p.options.map((o) => o.kind), ['keep-left', 'keep-right', 'keep-both']);
    assert.strictEqual(p.autoDecided, false);
    assert.strictEqual('decision' in p, false);
    assert.strictEqual('chosen' in p, false);
});

test('【2】无 actor 一律不许落地（自动裁决即翻红）', () => {
    assert.strictEqual(M.resolveConflict(C, 'keep-left', '').face, 'awaiting-human');
    assert.strictEqual(M.resolveConflict(C, 'keep-left', null).reason, 'no-actor');
    assert.strictEqual(M.resolveConflict(C, 'keep-left', undefined).face, 'awaiting-human');
    assert.strictEqual(M.resolveConflict(C, 'keep-left', '   ').reason, 'no-actor');
});

test('【3】有人点名且选项合法才 resolved，且 autoDecided 恒 false', () => {
    const r = M.resolveConflict(C, 'keep-both', 'lin');
    assert.strictEqual(r.face, 'resolved');
    assert.strictEqual(r.decision, 'keep-both');
    assert.strictEqual(r.actor, 'lin');
    assert.strictEqual(r.autoDecided, false);
    assert.match(M.conflictNote(r), /已由/);
});

test('【4】未知选项拒绝，不许默认取第一条', () => {
    const r = M.resolveConflict(C, 'keep-all', 'lin');
    assert.strictEqual(r.face, 'awaiting-human');
    assert.strictEqual(r.reason, 'unknown-option');
});

test('【5】负控制：把 awaiting 当 resolved 的实现在此判红', () => {
    const p = M.proposeResolutions(C);
    const cheat = { face: 'resolved', decision: 'keep-left', autoDecided: true };
    assert.notStrictEqual(p.face, cheat.face);
    assert.strictEqual(M.resolveConflict(C, 'keep-left', '').face !== cheat.face, true);
});

test('【6】形状不全 → invalid（不猜哪边是哪边）', () => {
    assert.strictEqual(M.proposeResolutions(null).face, 'invalid');
    assert.strictEqual(M.proposeResolutions({ left: { fact: 'x' } }).face, 'invalid');
    assert.strictEqual(M.resolveConflict({}, 'keep-left', 'lin').reason, 'bad-conflict');
});

test('【7】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('memory-conflict-bench.js'));
});