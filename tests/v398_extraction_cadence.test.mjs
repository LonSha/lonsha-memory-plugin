// tests/v398_extraction_cadence.test.mjs — [v3.98] Luker 按类型抽取节奏缝合测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
    computeActiveTypes, nextActiveSeq, buildPerTypeRulesBlock,
    assembleSystemPrompt, summarizeCadence,
} = require('../extraction-cadence.js');

const SCHEMA = [
    { id: 'Relation', extractEveryN: 1, extractionInstructions: 'rel rule' },
    { id: 'World', extractEveryN: 5, extractionInstructions: 'world rule' },
    { id: 'Detail', extractEveryN: 10, extractionInstructions: 'detail rule' },
];

test('computeActiveTypes 节奏激活', () => {
    assert.deepEqual([...computeActiveTypes(SCHEMA, 0)].sort(), ['detail', 'relation', 'world']);
    assert.deepEqual([...computeActiveTypes(SCHEMA, 3)], ['relation']);
    assert.deepEqual([...computeActiveTypes(SCHEMA, 5)].sort(), ['relation', 'world']);
    assert.deepEqual([...computeActiveTypes(SCHEMA, 10)].sort(), ['detail', 'relation', 'world']);
    assert.deepEqual([...computeActiveTypes(SCHEMA, 7)], ['relation']); // 7%5,7%10 均不整除
});

test('computeActiveTypes id 归一化（大小写）', () => {
    const s = [{ id: 'WORLD', extractEveryN: 2, extractionInstructions: 'x' }];
    assert.ok(computeActiveTypes(s, 4).has('world'));
});

test('computeActiveTypes 容错（空 schema/非法 seq/非法 everyN）', () => {
    assert.equal(computeActiveTypes([], 5).size, 0);
    assert.equal(computeActiveTypes(null, 5).size, 0);
    // everyN 非法回落 1（每楼激活）
    const s = [{ id: 'a', extractEveryN: 0, extractionInstructions: 'x' }];
    assert.ok(computeActiveTypes(s, 7).has('a'));
    // 负 seq 归一为 0
    assert.deepEqual([...computeActiveTypes(SCHEMA, -3)].sort(), ['detail', 'relation', 'world']);
});

test('computeActiveTypes 跳过无 id 条目', () => {
    const s = [{ id: '', extractEveryN: 1 }, { id: 'valid', extractEveryN: 1 }];
    assert.deepEqual([...computeActiveTypes(s, 0)], ['valid']);
});

test('nextActiveSeq 预测下次激活', () => {
    assert.equal(nextActiveSeq(5, 3), 5);
    assert.equal(nextActiveSeq(5, 5), 5); // 本轮即激活
    assert.equal(nextActiveSeq(5, 6), 10);
    assert.equal(nextActiveSeq(10, 7), 10);
    assert.equal(nextActiveSeq(1, 99), 99); // 每楼激活
});

test('buildPerTypeRulesBlock 仅含激活且有指令的类型', () => {
    const active = computeActiveTypes(SCHEMA, 3); // 仅 relation
    const block = buildPerTypeRulesBlock(SCHEMA, active);
    assert.ok(block.includes('[relation]'));
    assert.ok(block.includes('rel rule'));
    assert.ok(!block.includes('[world]'));
    assert.ok(!block.includes('[detail]'));
    assert.ok(block.startsWith('=== Per-type extraction rules'));
});

test('buildPerTypeRulesBlock 多类型拼接与空结果', () => {
    const active = computeActiveTypes(SCHEMA, 10); // 三类型
    const block = buildPerTypeRulesBlock(SCHEMA, active);
    assert.ok(block.includes('[relation]') && block.includes('[world]') && block.includes('[detail]'));
    // 无激活 → 空串
    assert.equal(buildPerTypeRulesBlock(SCHEMA, new Set()), '');
    // 激活但无指令 → 空串
    const noInstr = [{ id: 'x', extractEveryN: 1 }];
    assert.equal(buildPerTypeRulesBlock(noInstr, new Set(['x'])), '');
});

test('buildPerTypeRulesBlock activeTypes 接受数组', () => {
    const block = buildPerTypeRulesBlock(SCHEMA, ['world']);
    assert.ok(block.includes('[world]'));
    assert.ok(!block.includes('[relation]'));
});

test('assembleSystemPrompt 字节稳定（trim）', () => {
    assert.equal(assembleSystemPrompt('  base prompt  '), 'base prompt');
    assert.equal(assembleSystemPrompt(''), '');
    assert.equal(assembleSystemPrompt(null), '');
    // 同一 base 跨轮不变（prompt-cache 友好）
    assert.equal(assembleSystemPrompt('sys'), assembleSystemPrompt('sys'));
});

test('summarizeCadence 节奏摘要', () => {
    const sum = summarizeCadence(SCHEMA, 7);
    const rel = sum.find(s => s.id === 'relation');
    const world = sum.find(s => s.id === 'world');
    const detail = sum.find(s => s.id === 'detail');
    assert.equal(rel.active, true);
    assert.equal(rel.floorsUntilNext, 0);
    assert.equal(world.active, false);
    assert.equal(world.nextSeq, 10);
    assert.equal(world.floorsUntilNext, 3);
    assert.equal(detail.nextSeq, 10);
    assert.equal(sum.length, 3);
});