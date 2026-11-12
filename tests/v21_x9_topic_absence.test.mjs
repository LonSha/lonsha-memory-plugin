// tests/v21_x9_topic_absence.test.mjs — L21-X9「我为什么不记得」话题级四态归因 [v3.466.1]
// 九条判定 + 负控制（undecided 并进 never-told ⇒ 红）+ 接线真消费。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const _mod = await import('../topic-absence-explain.js');
const lib = (_mod.default ?? _mod);

test('T1 四态齐备且互不同形', () => {
    assert.deepEqual(Object.values(lib.VERDICTS).sort(), ['never-told', 'told-before-branch', 'told-but-dropped', 'undecided']);
});

test('T2 never-told：全账确认没记过', () => {
    const r = lib.explain('第一次见面', { everRecorded: false, fullScan: true });
    assert.equal(r.verdict, 'never-told');
    assert.ok(r.reason.includes('从没记录过'));
});

test('T3 told-but-dropped：给楼层与裁剪原因（验收旅程原文）', () => {
    const r = lib.explain('第一次见面', { dropped: { floor: 12, why: '预算裁剪' } });
    assert.equal(r.verdict, 'told-but-dropped');
    assert.ok(r.reason.includes('第 12 楼') && r.reason.includes('预算裁剪'), r.reason);
    assert.ok(r.reason.includes('可展开看原文'));
});

test('T4 told-before-branch：另一条世界线', () => {
    const r = lib.explain('第一次见面', { otherBranch: { lineId: '分支A' } });
    assert.equal(r.verdict, 'told-before-branch');
    assert.ok(r.reason.includes('分支A'));
});

test('T5 负控制核心：搜索面没有 + 全账未核验 ⇒ undecided，绝不 never-told', () => {
    const r = lib.explain('第一次见面', { everRecorded: false, fullScan: false });
    assert.equal(r.verdict, 'undecided', '全账未核验时不得下 never-told 结论');
    assert.ok(r.reason.includes('判不了'), r.reason);
    // 无任何证据输入同样 undecided
    const r2 = lib.explain('第一次见面', {});
    assert.equal(r2.verdict, 'undecided');
});

test('T6 searchable=true ⇒ 不缺，无需归因', () => {
    const r = lib.explain('第一次见面', { searchable: true });
    assert.equal(r.needed, false);
    assert.equal(r.verdict, null);
});

test('T7 dropped 缺 why ⇒ 证据不齐 undecided（不许硬给 told-but-dropped）', () => {
    const r = lib.explain('第一次见面', { dropped: { floor: 12, why: '' } });
    assert.equal(r.verdict, 'undecided');
});

test('T8 负控制（结构级）：源码里 undecided 与 never-told 不得并档', () => {
    const src = readFileSync(new URL('../topic-absence-explain.js', import.meta.url), 'utf8');
    assert.ok(src.includes("NEVER_TOLD: 'never-told'"));
    assert.ok(src.includes("UNDECIDED: 'undecided'"));
    assert.ok(!/UNDECIDED\s*[:=]\s*NEVER_TOLD/.test(src), '不得把 undecided 并进 never-told');
    assert.ok(src.includes('判不了'), 'undecided 档必须自述「判不了」');
});

test('T9 接线真消费：记忆控制中心空结果页真调 explain + formatLine', () => {
    const src = readFileSync(new URL('../engine-evidence-center.js', import.meta.url), 'utf8');
    const iFn = src.indexOf('memoryCenterSheet(host');
    const iEnd = src.indexOf('memoryCenterDescribe(host');
    assert.ok(iFn > 0 && iEnd > iFn);
    const seg = src.slice(iFn, iEnd);
    assert.ok(seg.includes('topic-absence-explain.js'), '必须真挂 topic-absence-explain');
    assert.ok(seg.includes('TA.explain'), '必须真调用 explain');
    assert.ok(seg.includes("view === 'empty' && face.reason === 'no-match'"), '只在空结果页归因');
    assert.ok(!seg.includes("verdict = 'never-told'"), '面板不得自行判 never-told（归因只出自模块）');
});

test('T10 面板读面：四态四种记号', () => {
    assert.ok(lib.formatLine(lib.explain('x', { everRecorded: false, fullScan: true })).includes('🚫'));
    assert.ok(lib.formatLine(lib.explain('x', { dropped: { floor: 3, why: '预算' } })).includes('✂️'));
    assert.ok(lib.formatLine(lib.explain('x', { otherBranch: { lineId: 'B' } })).includes('🌿'));
    assert.ok(lib.formatLine(lib.explain('x', {})).includes('❓'));
    assert.equal(lib.formatLine({ needed: false }), '');
});