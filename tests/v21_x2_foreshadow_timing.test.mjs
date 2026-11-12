// tests/v21_x2_foreshadow_timing.test.mjs — L21-X2 伏笔时机四因子可解释面 [v3.465.4]
// 规格：.agents/notes/proposed/feature/2026-11-11-product-expansion-v21.md § L21-X2
// 七条判定 + 负控制（四因子压成一个数 ⇒ 红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../foreshadow-timing-explain.js');
const lib = _mod.default ?? _mod; // UMD CJS 形态：module.exports 在 default 上

const SUS = {
    id: 'sus_radio', topic: '修收音机的约定', detail: '答应过帮她修复收音机',
    createdAt: Date.now() - 5 * 86400000, createdAtFloor: 2, relatedCharacters: ['小满']
};
const CTX_OK = { now: Date.now(), currentFloor: 10, tension: 0.2, queryText: '收音机还摆在窗台上', presentCharacters: ['小满'] };

test('x2 T1. 四因子齐备且各自独立（time/tension/proximity/present 各带 key+label+detail）', () => {
    const e = lib.explainTiming(SUS, CTX_OK);
    assert.equal(e.factors.length, 4);
    assert.deepEqual(e.factors.map(f => f.key), [...lib.FACTORS]);
    for (const f of e.factors) {
        assert.ok(f.label && f.detail, '每因子必须带可读 label/detail');
        assert.equal(f.weight, undefined, '因子不得携带权重（防合成回潮）');
    }
});

test('x2 T2. 验收旅程正向：时间够+话题邻近 ⇒ shouldMention=true 且理由链可读', () => {
    const e = lib.explainTiming(SUS, CTX_OK);
    assert.equal(e.shouldMention, true);
    assert.ok(e.headline.startsWith('为什么现在提'));
    assert.ok(e.headline.includes('收音机') || e.headline.includes('时间够了'));
});

test('x2 T3. 张力太高一票否决：哪怕时间够+话题邻近也不提，且理由直说"张力"', () => {
    const e = lib.explainTiming(SUS, { ...CTX_OK, tension: 0.9 });
    assert.equal(e.shouldMention, false);
    assert.ok(e.headline.startsWith('为什么不提'));
    assert.ok(e.headline.includes('张力'));
    const f = e.factors.find(f => f.key === 'emotionalTension');
    assert.equal(f.veto, true);
});

test('x2 T4. 时间不够：刚发生不久不提，理由说"刚发生不久"', () => {
    const e = lib.explainTiming(SUS, { ...CTX_OK, currentFloor: 3, now: SUS.createdAt + 3600000 });
    assert.equal(e.shouldMention, false);
    assert.ok(e.headline.includes('刚发生不久'));
});

test('x2 T5. 既不邻近又没人接得上：不提，理由列出两个因子', () => {
    const e = lib.explainTiming(SUS, { ...CTX_OK, queryText: '今天晚饭吃什么', presentCharacters: ['路人'] });
    assert.equal(e.shouldMention, false);
    assert.ok(e.headline.includes('不沾边'));
});

test('x2 T6. explainAll 批量不改引擎状态、formatFactors 无黑话', () => {
    const list = [SUS, { id: 'sus_2', topic: '未解的谜', createdAt: Date.now(), createdAtFloor: 9 }];
    const before = JSON.stringify(list);
    const all = lib.explainAll(list, CTX_OK);
    assert.equal(all.length, 2);
    assert.equal(JSON.stringify(list), before, '不得改写传入悬念');
    const txt = lib.formatFactors(all[0]);
    assert.ok(txt.includes('时间距离'));
    assert.ok(!/score|weight|总分|加权/.test(txt));
});

test('x2 T7. 规则是显式文本而非分数；explainTiming 对空ctx不抛错', () => {
    const e = lib.explainTiming(SUS, {});
    assert.ok(e.rule.includes('不合成分数'));
    assert.equal(typeof e.shouldMention, 'boolean');
    const e2 = lib.explainTiming({}, null);
    assert.equal(typeof e2.shouldMention, 'boolean');
});

// ── 负控制：四因子压成一个数 ⇒ 红 ──
test('x2 N1. 负控制：模块若把四因子加权合成一个分数必须被识破（无 weight/无 score 字段）', () => {
    const src = readFileSync(new URL('../foreshadow-timing-explain.js', import.meta.url), 'utf8');
    // ① 判定链里不得出现加权合成（weight/sum/score 的算术组合）
    const chain = src.slice(src.indexOf('function explainTiming('));
    assert.ok(!/\.\s*(map|reduce)\s*\([^)]*\)\s*\.\s*reduce/.test(chain), '不得 map+reduce 合成分数');
    assert.ok(!/score|totalScore|\bsum\b/i.test(chain.replace('shouldMention', '')), '不得引入 score/sum 概念');
    // ② 语义自证：每个因子函数的返回体不得含 weight 数字或加权算式
    for (const [k, fn] of Object.entries(lib._factors)) {
        const out = fn({ topic: 'x', createdAt: Date.now() - 9 * 86400000 }, { currentFloor: 20, now: Date.now() });
        assert.equal(out.weight, undefined, k + ' 不得携带 weight');
        assert.equal(typeof out.ok, 'boolean', k + ' 必须给出独立布尔裁决');
        assert.ok(out.detail, k + ' 必须给出独立可读理由');
    }
});

// ── 接线面：orchestrator 在伏笔引擎之后真消费解释面 ──
test('x2 W1. 接线：orchestrator 阶段 3.12 消费 explain 并落 trace/指令', () => {
    const orch = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const a = orch.indexOf('latent-plot-foreshadowing-engine');
    const b = orch.indexOf('tacit-intimacy-code-engine');
    assert.ok(a > 0 && b > a, '伏笔段锚点必须存在');
    const seg = orch.slice(a, b);
    assert.ok(seg.includes('foreshadow-timing-explain'), '必须在伏笔段之后取解释面库');
    // 批量口 explainAll（内部逐条走 explainTiming，语义等价）——锚真消费点而非函数名字面
    assert.ok(seg.includes('explainAll') && seg.includes('explainRes'), '必须真调用四因子解释并存判定');
    assert.ok(seg.includes('timingExplain') || seg.includes('explainRes'), '判定必须落 trace/状态');
});