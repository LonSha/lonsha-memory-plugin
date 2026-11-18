// [v4.161.0 · R25-X7] 问诊式问答：为什么忘了这条
// 验收口径：问一条确实不存在的记忆，回复必须说「没找到」而不是编一条。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'memory-checkup-page.js'));

const MEM = [
    { id: 'm1', text: '他送的那把剑', tier: 'cold' },
    { id: 'm2', text: '雨下得很大', salience: 0.5 },
    { id: 'm3', text: '那一年的旧事', at: '2025-01-01' }
];

test('X7-1 问一条确实不存在的记忆 ⇒ 明说没找到，绝不编一条', () => {
    const r = C.askWhy(MEM, '太空飞船' );
    assert.equal(r.ok, true);
    assert.equal(r.found, false);
    assert.equal(r.fabricated, false);
    assert.equal(r.matched, null);
    assert.ok(r.answer.includes('没找到'), r.answer);
});

test('X7-2 没找到时也给三条可操作建议（不是死路）', () => {
    const r = C.askWhy(MEM, '太空飞船');
    assert.equal(r.suggestions.length, 3);
    r.suggestions.forEach((s) => assert.ok(s.length > 2));
});

test('X7-3 问到冷层里的那条 ⇒ 人话说原因 + 三条建议', () => {
    const r = C.askWhy(MEM, '那把剑呢');
    assert.equal(r.found, true);
    assert.equal(r.code, 'tier-cold');
    assert.ok(r.answer.includes('冷层'), r.answer);
    assert.equal(r.suggestions.length, 3);
    assert.ok(r.suggestions.some((s) => s.includes('冷层')));
});

test('X7-4 问得太旧 ⇒ 归因到时间，建议点明「纠正时间」', () => {
    const r = C.askWhy(MEM, '旧事');
    assert.equal(r.found, true);
    assert.equal(r.code, 'expired');
    assert.ok(r.suggestions.some((s) => s.includes('纠正')));
});

test('X7-5 命中项标清是哪一条（可点回去）', () => {
    const r = C.askWhy(MEM, '雨下得很大');
    assert.equal(r.found, true);
    assert.equal(r.matched.id, 'm2');
    assert.ok(r.answer.includes('雨下得很大'));
});

test('X7-6 回答里不出现库里没有的内容（只复述命中条目与原因）', () => {
    const r = C.askWhy(MEM, '那把剑呢');
    assert.equal(r.answer.includes('太空飞船'), false);
    assert.equal(r.answer.includes('雨下得很大'), false);
});

test('X7-7 空库 ⇒ 没找到（不因为空而报错）', () => {
    const r = C.askWhy([], '那把剑');
    assert.equal(r.found, false);
    assert.equal(r.code, 'no-match');
});

test('X7-8 空问题 ⇒ 没找到，不拿第一条顶上', () => {
    const r = C.askWhy(MEM, '');
    assert.equal(r.found, false);
});

test('X7-9 同问两次同答（可复现）', () => {
    assert.equal(JSON.stringify(C.askWhy(MEM, '那把剑呢')), JSON.stringify(C.askWhy(MEM, '那把剑呢')));
});

test('X7-10 自检绿', () => {
    const sc = C.checkupSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
