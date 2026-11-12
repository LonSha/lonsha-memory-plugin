// tests/v21_x3_tacit_legibility.test.mjs — L21-X3 默契暗号可解码性双向校验 [v3.465.5]
// 规格：.agents/notes/proposed/feature/2026-11-11-product-expansion-v21.md § L21-X3
// 八条判定 + 负控制（把 ambiguous 并进 coded ⇒ 红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../tacit-code-legibility.js');
const lib = _mod.default ?? _mod; // UMD CJS 形态

const BOOK = [
    { phrase: '下雨了', realMeaning: '有外人监视，提高戒备' },
    { phrase: '老地方', realMeaning: '天台旧长椅，两人的私密据点' },
    { phrase: '红茶不加糖', realMeaning: '心情不佳，需要安静陪伴' }
];

test('x3 T1. 精确命中单一暗号 ⇒ coded（存在性成立）', () => {
    const v = lib.classify('外面下雨了，我们走吧', BOOK, { intimacyLevel: 80 });
    assert.equal(v.state, 'coded');
    assert.deepEqual(v.candidates, ['下雨了']);
});

test('x3 T2. 含义遮蔽：羁绊未到 60 ⇒ 只标"这是暗号"不给 realMeaning', () => {
    const v = lib.classify('外面下雨了', BOOK, { intimacyLevel: 40 });
    assert.equal(v.state, 'coded');
    assert.equal(v.revealMeaning, false);
    assert.ok(!JSON.stringify(v).includes('监视'), '遮蔽态不得泄露 realMeaning');
    assert.ok(lib.marker(v).includes('暗号'));
});

test('x3 T3. 羁绊 ≥60 且无第三者 ⇒ 词典解锁给含义', () => {
    const v = lib.classify('老地方见', BOOK, { intimacyLevel: 80 });
    assert.equal(v.state, 'coded');
    assert.equal(v.revealMeaning, true);
    assert.ok(lib.formatDictionary(BOOK, 80).includes('天台旧长椅'));
});

test('x3 T4. 第三者在场 ⇒ 即使羁绊高，coded 含义也继续遮蔽（防旁人视角剧透）', () => {
    const v = lib.classify('老地方见', BOOK, { intimacyLevel: 80, inPresenceOthers: true });
    assert.equal(v.state, 'coded');
    assert.equal(v.revealMeaning, false, '存在性与含义分离：在场有旁人时含义必须继续遮蔽');
});

test('x3 T5. 多个暗号同时命中 ⇒ ambiguous（列候选，不猜是哪一个）', () => {
    // 构造一句同时含两个暗号的话
    const v = lib.classify('下雨了，去老地方吧', BOOK, { intimacyLevel: 80 });
    assert.equal(v.state, 'ambiguous');
    assert.equal(v.candidates.length, 2);
    assert.ok(v.note.includes('不'));
});

test('x3 T6. 沾边但不确定 ⇒ ambiguous（部分重叠列候选不猜）', () => {
    const v = lib.classify('红茶', BOOK, { intimacyLevel: 80 }); // 暗号是"红茶不加糖"，只说一半
    assert.equal(v.state, 'ambiguous');
    assert.deepEqual(v.candidates, ['红茶不加糖']);
});

test('x3 T7. 完全无关 ⇒ plain，不带任何标记', () => {
    const v = lib.classify('今天晚饭吃什么', BOOK, { intimacyLevel: 80 });
    assert.equal(v.state, 'plain');
    assert.equal(lib.marker(v), '');
});

test('x3 T8. 验收旅程：第三者面前传警告，玩家看到（暗号）但看不到含义', () => {
    const v = lib.classify('下雨了', BOOK, { intimacyLevel: 80, inPresenceOthers: true });
    const mark = lib.marker(v);
    const face = mark + (v.revealMeaning ? v.note : '');
    assert.ok(face.includes('（暗号）'));
    assert.ok(!face.includes('监视') && !face.includes('戒备'), '面板面不得泄露含义');
    // 词典视图：未解锁时只给存在性
    assert.ok(!lib.formatDictionary(BOOK, 50).includes('监视'));
    assert.ok(lib.formatDictionary(BOOK, 50).includes('还不到告诉你含义的时候'));
});

// ── 负控制：把 ambiguous 并进 coded ⇒ 红 ──
test('x3 N1. 负控制：ambiguous 若被并入 coded 必须被识破', () => {
    const src = readFileSync(new URL('../tacit-code-legibility.js', import.meta.url), 'utf8');
    // ① ambiguous 必须作为独立态真实产出（分支在）
    assert.ok(src.includes("STATES.AMBIGUOUS"), 'ambiguous 分支必须存在');
    // ② 语义自证：模糊情形（部分重叠）必须返回 ambiguous 而非 coded
    const partial = lib.classify('红茶', BOOK, {});
    assert.notEqual(partial.state, 'coded');
    assert.equal(partial.state, 'ambiguous');
    // 多命中也必须 ambiguous
    const multi = lib.classify('下雨了，去老地方吧', BOOK, {});
    assert.equal(multi.state, 'ambiguous');
});

// ── 接线面：orchestrator 默契引擎段消费可解码性 ──
test('x3 W1. 接线：orchestrator 阶段 3.12 默契引擎段真消费 classify', () => {
    const orch = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const a = orch.indexOf('tacit-intimacy-code-engine');
    const b = orch.indexOf('trauma-taboo-defense-matrix');
    assert.ok(a > 0 && b > a, '默契段锚点必须存在');
    const seg = orch.slice(a, b);
    assert.ok(seg.includes('tacit-code-legibility'), '取库口必须指向可解码性模块');
    assert.ok(seg.includes('classify') || seg.includes('legibilityVerdicts'), '必须真调用可解码性判定');
});