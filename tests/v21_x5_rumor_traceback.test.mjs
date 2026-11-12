// tests/v21_x5_rumor_traceback.test.mjs — L21-X5 谣言可回溯原始证据链 [v3.465.7]
// 规格：.agents/notes/proposed/feature/2026-11-11-product-expansion-v21.md § L21-X5
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../rumor-trace-back.js');
const lib = _mod.default ?? _mod;
const _rmod = await import('../rumor-mutation-entropy-engine.js');
const rumor = _rmod.default ?? _rmod;

test('x5 T1. 未转述 ⇒ hops=0，summary 明说"没有走样"', () => {
    const s = rumor.createState({ rumors: [] });
    const r = rumor.createRumor(s, '昨晚实验楼保险丝烧断了');
    const tb = lib.traceBack(r);
    assert.equal(tb.hops, 0);
    assert.equal(tb.chain.length, 1);
    assert.ok(tb.summary.includes('没有走样'));
});

test('x5 T2. 转述后 ⇒ 逐跳链条齐全，originFact 永远可读', () => {
    const s = rumor.createState({ rumors: [] });
    const r = rumor.createRumor(s, '昨晚实验楼三楼保险丝烧断，产生了一股焦糊味');
    rumor.spreadRumor(s, r.id);
    rumor.spreadRumor(s, r.id);
    const tb = lib.traceBack(r);
    assert.equal(tb.hops, 2);
    assert.equal(tb.chain.length, 3); // 原始 + 2 跳
    assert.ok(tb.originFact.includes('保险丝烧断'), '原始证据必须永远可读');
    assert.ok(tb.chain[0].changed.includes('最初'));
    assert.ok(tb.chain[1].changed.includes('新添'));
});

test('x5 T3. 异化度直读不重算：distortionPct 与引擎 distortionScore 一致', () => {
    const s = rumor.createState({ rumors: [] });
    const r = rumor.createRumor(s, '事实A');
    rumor.spreadRumor(s, r.id); // 引擎给 hops=1 distortionScore=0.33
    const tb = lib.traceBack(r);
    assert.equal(tb.distortionPct, Math.round(r.distortionScore * 100));
});

test('x5 T4. traceAll 按异化度排序且不改引擎状态', () => {
    const s = rumor.createState({ rumors: [] });
    const a = rumor.createRumor(s, '事实A');
    const b = rumor.createRumor(s, '事实B');
    rumor.spreadRumor(s, b.id);
    rumor.spreadRumor(s, b.id);
    const before = JSON.stringify(s);
    const all = lib.traceAll(s);
    assert.equal(all.length, 2);
    assert.equal(all[0].rumorId, b.id, '传得最凶的排最前');
    assert.equal(JSON.stringify(s), before, '读面不得改写引擎状态');
});

test('x5 T5. 面板渲染：传言+来历+最初的事实+逐手，无黑话', () => {
    const s = rumor.createState({ rumors: [] });
    const r = rumor.createRumor(s, '保险丝烧断了');
    rumor.spreadRumor(s, r.id);
    const panel = lib.formatPanel(lib.traceBack(r));
    assert.ok(panel.includes('最初的事实'));
    assert.ok(panel.includes('保险丝烧断'));
    assert.ok(panel.includes('第 1 手'));
    assert.ok(!/distortion|hops|trace|DAG/i.test(panel));
});

test('x5 T6. 空状态/坏数据不抛错', () => {
    assert.deepEqual(lib.traceAll(null), []);
    const tb = lib.traceBack(null);
    assert.equal(tb.hops, 0);
    assert.ok(lib.formatPanel(null) === '');
});

// ── 负控制：原始证据若被 currentNarrative 覆盖 ⇒ 红 ──
test('x5 N1. 负控制：originFact 被改写/丢弃必须被识破（读面只许直读引擎字段）', () => {
    const src = readFileSync(new URL('../rumor-trace-back.js', import.meta.url), 'utf8');
    // ① 读面必须直读 originFact 字段（不许用 currentNarrative 冒充原始证据）
    assert.ok(src.includes('r.originFact'), 'originFact 必须直读');
    // ② 语义自证：多手转述后 originFact 与 currentNarrative 必须分叉且读面都保留
    const s = rumor.createState({ rumors: [] });
    const r = rumor.createRumor(s, '保险丝烧断，一股焦糊味');
    for (let i = 0; i < 3; i++) rumor.spreadRumor(s, r.id);
    const tb = lib.traceBack(r);
    assert.notEqual(tb.originFact, tb.currentNarrative, '多手后两者必须分叉');
    assert.ok(tb.originFact.includes('保险丝'), '原始证据不得被改写覆盖');
});

// ── 接线面 ──
test('x5 W1. 接线：orchestrator 谣言引擎段真消费 traceBack', () => {
    const orch = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const a = orch.indexOf('rumor-mutation-entropy-engine');
    const b = orch.indexOf('circadian-shared-routine-engine');
    assert.ok(a > 0 && b > a, '谣言段锚点必须存在');
    const seg = orch.slice(a, b);
    assert.ok(seg.includes('rumor-trace-back'), '取库口必须指向回溯读面');
    assert.ok(seg.includes('traceAll') || seg.includes('rumorTraceBacks'), '必须真调用回溯读面');
});