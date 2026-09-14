// tests/v399_npc_ties.test.mjs — [v3.99] 柏宝书 NPC 长期关系网缝合测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
    oneLine, relationKey, splitTies,
    fmtNpcTiesContext, fmtNpcSummaryList, parseNpcTiesContext,
} = require('../npc-ties.js');

test('oneLine 换行折叠', () => {
    assert.equal(oneLine('a\nb\r\nc'), 'a b c');
    assert.equal(oneLine('  x  '), 'x');
    assert.equal(oneLine(null), '');
});

test('relationKey 归一化（小写+分号归一+空白折叠）', () => {
    assert.equal(relationKey('挚友；青梅'), '挚友;青梅');
    assert.equal(relationKey('ABC  Def'), 'abc def');
});

test('splitTies 分号拆分去空', () => {
    assert.deepEqual(splitTies('a；b;c'), ['a', 'b', 'c']);
    assert.deepEqual(splitTies('a;;b;'), ['a', 'b']);
    assert.deepEqual(splitTies(''), []);
});

test('fmtNpcTiesContext 重名 NPC ties 聚合去重', () => {
    const npcs = [
        { name: 'A', ties: 'x1;x2' },
        { name: 'A', ties: 'x2;x3' }, // x2 交叠
        { name: 'B', ties: 'y1' },
    ];
    const ctx = fmtNpcTiesContext(npcs);
    assert.ok(ctx.includes('- A:x1;x2;x3')); // 聚合+去重
    assert.ok(ctx.includes('- B:y1'));
    assert.ok(ctx.includes('不因是否在场而失效'));
});

test('fmtNpcTiesContext 大小写名字归一聚合', () => {
    const npcs = [
        { name: 'Anya', ties: 'x1' },
        { name: 'anya', ties: 'x2' },
    ];
    const ctx = fmtNpcTiesContext(npcs);
    assert.ok(ctx.includes('- Anya:x1;x2')); // 归一到首个名字形态
});

test('fmtNpcTiesContext 忽略无名/无 ties 项 + 空结果', () => {
    assert.equal(fmtNpcTiesContext([{ name: '', ties: 'x' }, { name: 'A', ties: '' }]), '');
    assert.equal(fmtNpcTiesContext([]), '');
});

test('fmtNpcTiesContext 自定义 header', () => {
    const ctx = fmtNpcTiesContext([{ name: 'A', ties: 'x1' }], { header: 'CUSTOM:' });
    assert.ok(ctx.startsWith('CUSTOM:'));
});

test('fmtNpcSummaryList 完整字段渲染', () => {
    const out = fmtNpcSummaryList([
        { name: 'A', gender: 'f', age: '17', ageTime: '第3天', important: true, follow: true, relation: 'r1', ties: 't1', title: 'title1', outfit: 'o1', condition: 'c1' },
    ]);
    assert.ok(out.includes('★ A(f·17·记于第3天) [随行]'));
    assert.ok(out.includes('与主角:r1'));
    assert.ok(out.includes('人际:t1'));
    assert.ok(out.includes('title1'));
    assert.ok(out.includes('着装:o1;状态:c1'));
});

test('fmtNpcSummaryList 非重要+定位（非随行）', () => {
    const out = fmtNpcSummaryList([{ name: 'C', location: 'loc', important: false }]);
    assert.ok(!out.includes('★'));
    assert.ok(out.includes('- C [在:loc]'));
});

test('fmtNpcSummaryList 空名册返回占位', () => {
    assert.equal(fmtNpcSummaryList([]), '  (无)');
    assert.equal(fmtNpcSummaryList(null), '  (无)');
});

test('parseNpcTiesContext 逆解析还原', () => {
    const npcs = [{ name: 'A', ties: 'x1;x2' }, { name: 'B', ties: 'y1' }];
    const parsed = parseNpcTiesContext(fmtNpcTiesContext(npcs));
    assert.deepEqual(parsed, [
        { name: 'A', ties: ['x1', 'x2'] },
        { name: 'B', ties: ['y1'] },
    ]);
});

test('parseNpcTiesContext 容错（非条目行忽略）', () => {
    const parsed = parseNpcTiesContext('标题行\n  - A:x1;x2\n普通文本\n  - B:y1');
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed[0].ties, ['x1', 'x2']);
});