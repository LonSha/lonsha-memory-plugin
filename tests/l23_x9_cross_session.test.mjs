// tests/l23_x9_cross_session.test.mjs — L23-X9「跨会话延续证明」
// 计划书：跨会话措辞必须带楼层锚。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('cross-session-continuation.js', 'LonShaCrossSessionContinuation');

test('【1】跨会话且每条带锚 → anchored，锚逐条列出', () => {
    const r = M.proveContinuation({ claims: [
        { sessionId: 's1', floor: 12, text: '上次说的事' },
        { sessionId: 's2', floor: 40, text: '你还记得吧' }
    ] });
    assert.strictEqual(r.face, 'anchored');
    assert.strictEqual(r.sessionCount, 2);
    assert.deepStrictEqual(r.anchors.map((a) => a.floor), [12, 40]);
});

test('【2】缺楼层锚 → unanchored，并指出是第几条', () => {
    const r = M.proveContinuation({ claims: [
        { sessionId: 's1', floor: 12 },
        { sessionId: 's2', text: '我们之前说好的' }
    ] });
    assert.strictEqual(r.face, 'unanchored');
    assert.strictEqual(r.missing.length, 1);
    assert.strictEqual(r.missing[0].index, 1);
    assert.match(M.continuationNote(r), /不许当延续/);
});

test('【3】只有一段会话 → single-session，不算跨会话证据', () => {
    const r = M.proveContinuation({ claims: [{ sessionId: 's1', floor: 3 }] });
    assert.strictEqual(r.face, 'single-session');
    assert.notStrictEqual(r.face, 'anchored');
});

test('【4】无 claims / 空数组 → insufficient（样本不足不产结论）', () => {
    assert.strictEqual(M.proveContinuation({}).face, 'insufficient');
    assert.strictEqual(M.proveContinuation({ claims: [] }).reason, 'empty-claims');
});

test('【5】负控制：给缺锚的引用补 0 楼会从 unanchored 变 anchored → 判据必须能分', () => {
    const input = { claims: [{ sessionId: 's1', floor: 5 }, { sessionId: 's2', text: '上次那件事' }] };
    const real = M.proveContinuation(input);
    // 作弊实现：缺锚补 0
    const cheat = M.proveContinuation({ claims: input.claims.map((c) => ({ ...c, floor: c.floor == null ? 0 : c.floor })) });
    assert.strictEqual(real.face, 'unanchored');
    assert.strictEqual(cheat.face, 'anchored');
    assert.notStrictEqual(real.face, cheat.face, '补 0 能洗白，说明三态没守住');
});

test('【6】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('cross-session-continuation.js'));
});