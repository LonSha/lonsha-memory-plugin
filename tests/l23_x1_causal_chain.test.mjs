// tests/l23_x1_causal_chain.test.mjs — L23-X1「记忆因果链回放」判据
// 计划书：三态 traceable / source-gone / incomparable，不许把「锚丢了」说成「没这条事实」。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('memory-causal-chain-replay.js', 'LonShaMemoryCausalChainReplay');

test('【1】锚齐全 → traceable，逐环带原话楼层', () => {
    const r = M.replayChain([
        { fact: 'f1', floor: 10, source: { floor: 3, quote: '我说过周三' } },
        { fact: 'f2', floor: 20, source: { floor: 12, quote: '后来改周四' } }
    ]);
    assert.strictEqual(r.face, 'traceable');
    assert.strictEqual(r.depth, 2);
    assert.deepStrictEqual(r.steps.map((s) => [s.floor, s.sourceFloor]), [[10, 3], [20, 12]]);
    assert.strictEqual(r.steps[0].quote, '我说过周三');
});

test('【2】锚丢了 → source-gone 并指出第几环（不是沉默）', () => {
    const r = M.replayChain([{ fact: 'f', floor: 5, source: { quote: '无楼层' } }]);
    assert.strictEqual(r.face, 'source-gone');
    assert.strictEqual(r.brokenAt, 0);
    assert.strictEqual(r.reason, 'no-source-floor');
    assert.match(M.replayNote(r), /找不到原话锚/);
});

test('【3】源晚于事实 / 跨 epoch → incomparable，与 source-gone 不同形', () => {
    const a = M.replayChain([{ fact: 'f', floor: 5, source: { floor: 9 } }]);
    const b = M.replayChain([{ fact: 'f', floor: 5, epoch: 'x', source: { floor: 1, epoch: 'y' } }]);
    assert.strictEqual(a.face, 'incomparable');
    assert.strictEqual(a.reason, 'source-after-fact');
    assert.strictEqual(b.face, 'incomparable');
    assert.strictEqual(b.reason, 'epoch-mismatch');
    assert.notStrictEqual(a.face, 'source-gone');
});

test('【4】空链是 empty，不是 traceable', () => {
    const r = M.replayChain([]);
    assert.strictEqual(r.face, 'empty');
    assert.strictEqual(r.steps.length, 0);
    assert.strictEqual(M.replayChain(null).face, 'empty', 'null 也不许冒充 traceable');
});

test('【5】负控制：给缺锚的环补 0 楼会改判 → 判据必须能分出来', () => {
    const input = [{ fact: 'f', floor: 5, source: {} }];
    const real = M.replayChain(input);
    const cheat = { face: 'traceable', steps: [{ floor: 5, sourceFloor: 0 }], depth: 1 };
    assert.strictEqual(real.face, 'source-gone');
    assert.notStrictEqual(real.face, cheat.face, '把锚补成 0 会让三态塌成一个，判据即失效');
    assert.strictEqual(real.steps.length, 0, '断在哪一环，之前的环才可回放');
});

test('【6】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('memory-causal-chain-replay.js'));
});