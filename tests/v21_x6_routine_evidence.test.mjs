// tests/v21_x6_routine_evidence.test.mjs — L21-X6 共同起居习惯「已沉淀 vs 待观察」分档 [v3.465.8]
// 六条判定 + 负控制（observed 当 established ⇒ 红）+ 接线真消费。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../shared-routine-evidence.js');
const lib = (_mod.default ?? _mod);

test('T1 三档互斥：第2次=observed 不提', () => {
    const v = lib.classify({ id: 'h1', name: '深夜聊天', observedCount: 2 });
    assert.equal(v.tier, 'observed');
    assert.equal(v.shouldMention, false);
    assert.equal(v.progressText, '第 2/5 次');
    assert.ok(v.reason.includes('未达阈值'));
});

test('T2 第5次=established 可提且有据', () => {
    const v = lib.classify({ id: 'h1', name: '深夜聊天', observedCount: 5 });
    assert.equal(v.tier, 'established');
    assert.ok(v.reason.includes('已沉淀'));
    assert.ok(v.reason.includes('第 5/5 次'), '理由必须带可查进度');
});

test('T3 atypical 优先于计数：今天反常不提', () => {
    const v = lib.classify({ id: 'h1', name: '深夜聊天', observedCount: 9 }, { atypicalToday: true });
    assert.equal(v.tier, 'atypical');
    assert.equal(v.shouldMention, false);
    assert.ok(v.reason.includes('反常'));
});

test('T4 阈值可读：单一具名常量，无散落魔数', () => {
    assert.equal(lib.ESTABLISH_THRESHOLD, 5);
    const src = readFileSync(new URL('../shared-routine-evidence.js', import.meta.url), 'utf8');
    const magic = src.match(/(?<!ESTABLISH_THRESHOLD[^]{0,80})>=\s*5\b/);
    assert.ok(!magic, '阈值 5 不得散落为魔数比较');
    assert.ok(src.includes('const ESTABLISH_THRESHOLD = 5'), '阈值必须具名常量');
});

test('T5 负控制：observed 当 established ⇒ 红', () => {
    // 若把阈值改成 2（第2次就提），必须与 T1 的「第2次不提」直接冲突——
    // 用模块自身输出验矛盾：classify 第2次的 tier 若不是 observed，本条转红。
    const v2 = lib.classify({ id: 'h1', name: '深夜聊天', observedCount: 2 });
    assert.equal(v2.tier, 'observed', 'observed 不得被当 established');
    const v4 = lib.classify({ id: 'h1', name: '深夜聊天', observedCount: 4 });
    assert.equal(v4.tier, 'observed', '阈值-1 仍必须 observed');
});

test('T6 玩家读面：面板每行带「第 n/5 次」进度', () => {
    const panel = lib.formatPanel({
        habits: [
            { id: 'a', name: '晨起互道早安', observedCount: 5 },
            { id: 'b', name: '深夜熬夜关怀', observedCount: 2 }
        ]
    });
    assert.ok(panel.includes('☕ 共同起居'));
    assert.ok(panel.includes('第 5/5 次'));
    assert.ok(panel.includes('第 2/5 次'));
});

test('T7 接线真消费：orchestrator 阶段 3.12 circadian 段内调用 classifyAll 并落 trace.stages.routineEvidence', () => {
    const src = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const iCirc = src.indexOf('// L17-X6: 日常生活节律共鸣与习惯沉淀');
    const iOath = src.indexOf('// L17-X7: 誓约心锚与信任裂痕');
    assert.ok(iCirc > 0 && iOath > iCirc, '锚点存在');
    const seg = src.slice(iCirc, iOath);
    assert.ok(seg.includes('classifyAll'), 'circadian 段必须真调用 classifyAll');
    assert.ok(seg.includes('routineEvidence'), '必须真调用读面');
    assert.ok(seg.includes('trace.stages.routineEvidence'), '判定必须落 trace');
});

test('T8 负控制：接线真源码破坏 ⇒ 红', () => {
    const src = readFileSync(new URL('../memory-symphony-orchestrator.js', import.meta.url), 'utf8');
    const iCirc = src.indexOf('// L17-X6: 日常生活节律共鸣与习惯沉淀');
    const iOath = src.indexOf('// L17-X7: 誓约心锚与信任裂痕');
    const seg = src.slice(iCirc, iOath);
    assert.ok(!seg.includes('established_when_observed'), '不得出现把 observed 当 established 的假接线');
    assert.ok(seg.includes('engine._routineEvidenceVerdicts'), '判定必须真落引擎读面');
});