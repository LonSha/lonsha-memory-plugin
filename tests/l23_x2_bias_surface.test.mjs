// tests/l23_x2_bias_surface.test.mjs — L23-X2「角色记忆偏差面」判据
// 计划书：只列分歧不裁决；样本不足必须 insufficient。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('memory-bias-surface.js', 'LonShaMemoryBiasSurface');
const A = { actor: '林', claims: [{ factId: 'f1', text: '周三走的' }, { factId: 'f2', text: '下着雨' }] };
const B = { actor: '周', claims: [{ factId: 'f1', text: '周四走的' }, { factId: 'f2', text: '下着雨' }] };

test('【1】同一事实两种说法 → divergent，逐条列两边原文', () => {
    const r = M.compareBias(A, B);
    assert.strictEqual(r.face, 'divergent');
    assert.strictEqual(r.compared, 2);
    assert.strictEqual(r.same, 1);
    assert.deepStrictEqual(r.divergences, [{ factId: 'f1', left: '周三走的', right: '周四走的' }]);
});

test('【2】输出面不含裁决字段（只列不裁）', () => {
    const r = M.compareBias(A, B);
    for (const k of ['winner', 'correct', 'preferred', 'verdict', 'chosen']) {
        assert.strictEqual(k in r, false, `不许带裁决字段 ${k}`);
    }
    assert.deepStrictEqual(Object.keys(r.divergences[0]).sort(), ['factId', 'left', 'right']);
});

test('【3】无可比共同事实 → insufficient（样本不足不产结论）', () => {
    const r = M.compareBias({ claims: [{ factId: 'x', text: 'a' }] }, { claims: [{ factId: 'y', text: 'a' }] });
    assert.strictEqual(r.face, 'insufficient');
    assert.strictEqual(r.reason, 'no-shared-fact');
    assert.strictEqual(r.divergences.length, 0);
    assert.match(M.biasNote(r), /不判断谁记得对/);
});

test('【4】全一致 → consistent，与 divergent 不同形', () => {
    const r = M.compareBias({ claims: [{ factId: 'x', text: 'a' }] }, { claims: [{ factId: 'x', text: 'a' }] });
    assert.strictEqual(r.face, 'consistent');
    assert.strictEqual(r.divergences.length, 0);
    assert.notStrictEqual(r.face, 'divergent');
});

test('【5】负控制：把「无共同事实」当一致必须被判红', () => {
    const real = M.compareBias({ claims: [{ factId: 'x', text: 'a' }] }, { claims: [{ factId: 'y', text: 'b' }] });
    const cheat = { face: 'consistent', compared: 0 };
    assert.strictEqual(real.face, 'insufficient');
    assert.notStrictEqual(real.face, cheat.face, '空交集若算一致，偏差面就对「没比过」撒谎');
});

test('【6】缺一侧 / 无 claims 字段 → insufficient 而不是抛', () => {
    assert.strictEqual(M.compareBias(null, B).face, 'insufficient');
    assert.strictEqual(M.compareBias({}, B).face, 'insufficient');
    assert.strictEqual(M.compareBias(A, { claims: 'nope' }).reason, 'no-claims');
});

test('【7】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    const mf = readManifest();
    assert.ok(mf.extra_js.includes('memory-bias-surface.js'));
});