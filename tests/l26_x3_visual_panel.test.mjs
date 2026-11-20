// [v3.475.0 · L26-X3] 记忆可视化面板
// 验收口径：图可点回源；悬空引用单列；无数据时显示「还没有」而非空图。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const V = require(join(ROOT, 'memory-visual-panel.js'));

const RECORDS = [
    { id: 'n1', content: '她喜欢雨天', messageId: 'msg-1', weight: 3 },
    { id: 'n2', summary: '约定周三', messageId: 'msg-2' },
    { id: 'n3', content: '一起看的电影' }
];
const RELATIONS = [
    { from: 'n1', to: 'n2', kind: 'same-period' },
    { from: 'n2', to: 'gone', kind: 'caused' }
];

test('X3-1 节点带 messageId（图能点回源）与兜底标题', () => {
    const g = V.buildGraph({ records: RECORDS, relations: RELATIONS });
    assert.equal(g.nodes.length, 3);
    const n2 = g.nodes.find((n) => n.id === 'n2');
    assert.equal(n2.label, '约定周三');
    assert.equal(n2.messageId, 'msg-2');
    assert.equal(g.nodes.find((n) => n.id === 'n3').messageId, null);
});

test('X3-2 悬空引用单列，不许静默丢掉', () => {
    const g = V.buildGraph({ records: RECORDS, relations: RELATIONS });
    assert.equal(g.edges.length, 1);
    assert.equal(g.dangling.length, 1);
    assert.match(g.dangling[0].why, /不在记忆里/);
    assert.match(g.reading, /dangling:1/);
});

test('X3-3 孤立节点（没有任何关系）单列', () => {
    const g = V.buildGraph({ records: RECORDS, relations: RELATIONS });
    assert.deepEqual(g.isolated, ['n3']);
});

test('X3-4 重复 id 只画一个点，不重复计数', () => {
    const g = V.buildGraph({ records: [...RECORDS, { id: 'n1', content: '重复' }], relations: [] });
    assert.equal(g.nodes.length, 3);
});

test('X3-5 无数据：显示「还没有记忆」，不是空图', () => {
    const vm = V.panelViewModel({ records: [], relations: [] });
    assert.equal(vm.empty, true);
    assert.equal(vm.text, V.EMPTY_TEXT);
    assert.equal(vm.text, '还没有记忆');
    assert.equal(vm.reading, 'visual-empty');
    assert.equal(vm.clickable, 0);
});

test('X3-6 有数据：文案给条数与悬空提示，clickable 只数有证据的', () => {
    const vm = V.panelViewModel({ records: RECORDS, relations: RELATIONS });
    assert.equal(vm.empty, false);
    assert.match(vm.text, /共 3 条记忆、1 条关系/);
    assert.match(vm.text, /1 条关系指向已删除的记忆/);
    assert.equal(vm.clickable, 2);
});

test('X3-7 没有 id 的记录不画点（画了也点不回去）', () => {
    const g = V.buildGraph({ records: [{ content: '没有 id' }, ...RECORDS], relations: [] });
    assert.equal(g.nodes.length, 3);
});

test('X3-8 关系的 kind 缺省为 related，缺端点的不算关系', () => {
    const g = V.buildGraph({ records: RECORDS, relations: [{ from: 'n1', to: 'n2' }, { from: 'n1' }] });
    assert.equal(g.edges.length, 1);
    assert.equal(g.edges[0].kind, 'related');
});