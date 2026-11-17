// tests/l23_x4_forgetting.test.mjs — L23-X4「遗忘的叙事解释」
// 计划书：候选句素 + 频率门 fail-closed，不替角色说死。
import { test } from 'node:test';
import assert from 'node:assert';
import { loadIife, readManifest } from './_iife_load.mjs';

const M = loadIife('forgetting-explanation.js', 'LonShaForgettingExplanation');

test('【1】样本足 → 给多条候选，每条带读数证据', () => {
    const r = M.explainForgetting({ hits: 5, gapFloors: 30, sessionCount: 1, lastSeenFloor: 100, nowFloor: 140 });
    assert.strictEqual(r.face, 'explained');
    assert.ok(r.candidates.length >= 3);
    for (const c of r.candidates) {
        assert.ok(c.evidence && c.evidence.length > 0, '候选必须带证据');
        assert.match(c.text, /可能|也许/, '措辞不许说死');
    }
    assert.deepStrictEqual(r.candidates.map((c) => c.kind).includes('long-gap'), true);
});

test('【2】频率门 fail-closed：命中 1 次 → insufficient，零候选', () => {
    const r = M.explainForgetting({ hits: 1, gapFloors: 30 });
    assert.strictEqual(r.face, 'insufficient');
    assert.strictEqual(r.reason, 'below-frequency-gate');
    assert.strictEqual(r.candidates.length, 0);
    assert.match(M.forgettingNote(r), /不猜/);
});

test('【3】频率门可用参数调，但不许关掉（0 也按默认算）', () => {
    assert.strictEqual(M.explainForgetting({ hits: 2, gapFloors: 1 }, { minHits: 2 }).face, 'explained');
    const zero = M.explainForgetting({ hits: 1, gapFloors: 1 }, { minHits: 0 });
    assert.strictEqual(zero.hits, 1);
    assert.strictEqual(M.MIN_HITS, 3);
});

test('【4】输出面没有终局字段（不替角色说死）', () => {
    const r = M.explainForgetting({ hits: 9, gapFloors: 2, sessionCount: 1 });
    assert.strictEqual(r.final, false);
    for (const k of ['reason', 'verdict', 'conclusion', 'definitely']) {
        assert.strictEqual(k in r, false, `不许有 ${k}`);
    }
});

test('【5】负控制：拿 1 次命中也给解释必须被判红', () => {
    const thin = M.explainForgetting({ hits: 1, gapFloors: 99, sessionCount: 1 });
    const cheat = { face: 'explained', candidates: [{ kind: 'long-gap' }] };
    assert.strictEqual(thin.face, 'insufficient');
    assert.notStrictEqual(thin.face, cheat.face);
});

test('【6】自检与注册', () => {
    assert.strictEqual(M.selfCheck().ok, true, M.selfCheck().bad.join('; '));
    assert.ok(readManifest().extra_js.includes('forgetting-explanation.js'));
});