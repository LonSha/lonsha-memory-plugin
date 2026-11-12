// tests/v21_x4_trauma_depth.test.mjs — L21-X4 创伤防线分档含 undecided [v3.465.6]
// 规格：.agents/notes/proposed/feature/2026-11-11-product-expansion-v21.md § L21-X4
// 六条判定 + 负控制（undecided 并进 deflect ⇒ 红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../trauma-defense-depth-read.js');
const lib = _mod.default ?? _mod;

// 用真引擎造三层真实状态
const _tmod = await import('../trauma-taboo-defense-matrix.js');
const trauma = _tmod.default ?? _tmod;

// 引擎契约：assessTraumaTrigger 原地改状态并返回评估对象（不返回新状态），
//   故这里不重绑 s —— 重绑会把评估对象当状态传入，属判据用法错。
function stateAtTier(state, tier) {
    let s = state;
    for (let i = 0; i < 4; i++) {
        trauma.assessTraumaTrigger(s, '大火烧死了所有人');
        const t = s.taboos.find(t2 => t2.topic === '火灾/浓烟');
        if (t.defenseTier >= tier) break;
    }
    return s;
}

test('x4 T1. 浅层命中 ⇒ deflect，依据含关键词与压力读数', () => {
    const s = stateAtTier(trauma.createState(), 1);
    const v = lib.readDepth(s, '那场大火真可怕');
    assert.equal(v.level, 'deflect');
    assert.ok(v.evidence.includes('压力读数') && v.evidence.includes('第 1 层'));
});

test('x4 T2. 中层戒备 ⇒ guard（持续追问后压力达 0.4+）', () => {
    const s = trauma.createState();
    trauma.assessTraumaTrigger(s, '大火里你们被困了吗');
    trauma.assessTraumaTrigger(s, '大火里你们被困了吗');
    const v = lib.readDepth(s, '大火');
    assert.equal(v.level, 'guard');
    assert.ok(v.evidence.includes('第 2 层'));
});

test('x4 T3. 深层应激 ⇒ flashback（压力 0.8+）', () => {
    const s = trauma.createState();
    for (let i = 0; i < 3; i++) trauma.assessTraumaTrigger(s, '大火烧死');
    const v = lib.readDepth(s, '被困在大火里');
    assert.equal(v.level, 'flashback');
});

test('x4 T4. 没踩到禁忌但有余波 ⇒ undecided（余波不等于当前层，不许猜）', () => {
    const s = trauma.createState();
    trauma.assessTraumaTrigger(s, '大火'); // 先触发一次留余波
    const v = lib.readDepth(s, '今天天气不错');
    assert.equal(v.level, 'undecided');
    assert.ok(v.evidence.includes('余波') && v.evidence.includes('没踩到'));
});

test('x4 T5. 什么都没有 ⇒ undecided，明说"无法判断"', () => {
    const v = lib.readDepth(trauma.createState(), '晚饭吃什么');
    assert.equal(v.level, 'undecided');
    assert.ok(lib.formatPanel(v).includes('无法判断'));
});

test('x4 T6. readDepth 只读不改引擎状态；tier 异常也判 undecided 不猜', () => {
    const s = stateAtTier(trauma.createState(), 1);
    const before = JSON.stringify(s);
    lib.readDepth(s, '大火');
    assert.equal(JSON.stringify(s), before, '读面不得改写引擎状态');
    const bad = { taboos: [{ topic: 'x', keywords: ['y'], currentPressure: 0.5, defenseTier: 7 }] };
    const v = lib.readDepth(bad, 'y');
    assert.equal(v.level, 'undecided', 'tier=7 异常 ⇒ 不许猜层');
});

// ── 负控制：undecided 并进 deflect ⇒ 红 ──
test('x4 N1. 负控制：undecided 若被并入 deflect 必须被识破', () => {
    const src = readFileSync(new URL('../trauma-defense-depth-read.js', import.meta.url), 'utf8');
    // ① undecided 必须是独立分档常量
    assert.ok(src.includes("UNDECIDED: 'undecided'"), 'undecided 独立档必须存在');
    // ② 语义自证：无命中情形必须返回 undecided 而非 deflect
    const plain = lib.readDepth(trauma.createState(), '晚饭吃什么');
    assert.equal(plain.level, 'undecided');
    assert.notEqual(plain.level, 'deflect');
    // 余波情形同样不得给层
    const s = trauma.createState();
    trauma.assessTraumaTrigger(s, '大火');
    const aftershock = lib.readDepth(s, '天气不错');
    assert.equal(aftershock.level, 'undecided');
});

// ── 接线面 ──
test('x4 W1. 接线：orchestrator 创伤引擎段真消费 readDepth', () => {
    const orch = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const a = orch.indexOf('trauma-taboo-defense-matrix');
    const b = orch.indexOf('rumor-mutation-entropy-engine');
    assert.ok(a > 0 && b > a, '创伤段锚点必须存在');
    const seg = orch.slice(a, b);
    assert.ok(seg.includes('trauma-defense-depth-read'), '取库口必须指向分档读面');
    assert.ok(seg.includes('readDepth') || seg.includes('traumaDepthVerdict'), '必须真调用分档读面');
});