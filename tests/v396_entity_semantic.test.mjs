// tests/v396_entity_semantic.test.mjs — [v3.96] Bakemono 实体语义引擎缝合测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRegistry, SEMANTIC_KINDS, ENTITY_KINDS } = require('../entity-semantic.js');

test('常量导出（text 不可为实体）', () => {
    assert.deepEqual(SEMANTIC_KINDS, ['text', 'person', 'item', 'plan', 'location']);
    assert.ok(!ENTITY_KINDS.includes('text'));
    assert.equal(ENTITY_KINDS.length, 4);
});

test('upsertEntity 登记与别名解析', () => {
    const reg = createRegistry();
    const e = reg.upsertEntity({ kind: 'person', name: '珞珈', aliases: ['小珞', 'Jia'] });
    assert.ok(e.id.startsWith('person-'));
    assert.equal(reg.resolveEntity('person', '小珞')?.name, '珞珈');
    assert.equal(reg.resolveEntity('person', 'Jia')?.name, '珞珈');
    assert.equal(reg.resolveEntity('person', '珞珈')?.id, e.id);
});

test('upsertEntity 校验（text/空名/改名不改kind）', () => {
    const reg = createRegistry();
    assert.throws(() => reg.upsertEntity({ kind: 'text', name: 'x' }), /实体类型/);
    assert.throws(() => reg.upsertEntity({ kind: 'person', name: '  ' }), /填写名称/);
    const e = reg.upsertEntity({ kind: 'person', name: 'A' });
    assert.throws(() => reg.upsertEntity({ id: e.id, kind: 'item', name: 'A' }), /不能.*更改类型/);
    assert.throws(() => reg.upsertEntity({ id: 'ghost', kind: 'person', name: 'B' }), /不存在/);
});

test('upsertEntity 更新已有实体（别名去重）', () => {
    const reg = createRegistry();
    const e = reg.upsertEntity({ kind: 'item', name: '怀表', aliases: ['表'] });
    reg.upsertEntity({ id: e.id, kind: 'item', name: '怀表', aliases: ['表', '表', '旧表', ''] });
    const updated = reg.resolveEntity('item', '旧表');
    assert.deepEqual(updated.aliases, ['表', '旧表']); // 去重+去空
});

test('kind 隔离（同名不同 kind 互不可见）', () => {
    const reg = createRegistry();
    reg.upsertEntity({ kind: 'person', name: '白泽' });
    reg.upsertEntity({ kind: 'location', name: '白泽' });
    assert.equal(reg.resolveEntity('person', '白泽').kind, 'person');
    assert.equal(reg.resolveEntity('location', '白泽').kind, 'location');
});

test('resolveEntity 重名歧义返回 null + resolveAll 给候选', () => {
    const reg = createRegistry();
    reg.upsertEntity({ kind: 'person', name: '甲', aliases: ['小珞'] });
    reg.upsertEntity({ kind: 'person', name: '乙', aliases: ['小珞'] });
    assert.equal(reg.resolveEntity('person', '小珞'), null); // 重名不自动合并
    assert.equal(reg.resolveAll('person', '小珞').length, 2);
});

test('bindValue 显式绑定校正歧义 + unbindValue', () => {
    const reg = createRegistry();
    const e1 = reg.upsertEntity({ kind: 'person', name: '甲', aliases: ['小珞'] });
    reg.upsertEntity({ kind: 'person', name: '乙', aliases: ['小珞'] });
    reg.bindValue('person', '小珞', e1.id);
    assert.equal(reg.resolveEntity('person', '小珞').name, '甲'); // 绑定优先于歧义
    reg.unbindValue('person', '小珞');
    assert.equal(reg.resolveEntity('person', '小珞'), null); // 解绑后回到歧义
});

test('bindValue 类型不匹配抛错', () => {
    const reg = createRegistry();
    const e = reg.upsertEntity({ kind: 'item', name: '剑' });
    assert.throws(() => reg.bindValue('person', '剑', e.id), /不匹配/);
});

test('resolveEntity explicitId 优先', () => {
    const reg = createRegistry();
    const e = reg.upsertEntity({ kind: 'plan', name: '逃离', aliases: ['跑'] });
    assert.equal(reg.resolveEntity('plan', '任意值', e.id)?.name, '逃离');
});

test('findUnresolved 列出无法解析的值', () => {
    const reg = createRegistry();
    reg.upsertEntity({ kind: 'person', name: '珞珈' });
    const unresolved = reg.findUnresolved('person', ['珞珈', '陌生人', '路人甲', '陌生人']);
    assert.deepEqual(unresolved, ['陌生人', '路人甲']); // 去重
});

test('removeEntity 级联清除值绑定', () => {
    const reg = createRegistry();
    const e = reg.upsertEntity({ kind: 'person', name: 'A', aliases: ['x'] });
    reg.bindValue('person', 'x', e.id);
    assert.ok(reg.removeEntity(e.id));
    assert.equal(reg.resolveEntity('person', 'x'), null);
    assert.equal(reg.size, 0);
});

test('exportState / importState 持久化往返', () => {
    const reg = createRegistry();
    const e = reg.upsertEntity({ kind: 'location', name: '县城', aliases: ['老家'] });
    reg.bindValue('location', '故乡', e.id);
    const reg2 = createRegistry();
    reg2.importState(reg.exportState());
    assert.equal(reg2.size, 1);
    assert.equal(reg2.resolveEntity('location', '老家')?.id, e.id);
    assert.equal(reg2.resolveEntity('location', '故乡')?.id, e.id); // 绑定随状态恢复
});

test('normalizeMatch 归一化匹配选项', () => {
    const reg = createRegistry({ normalizeMatch: true });
    reg.upsertEntity({ kind: 'person', name: 'An Ya', aliases: [] });
    assert.equal(reg.resolveEntity('person', 'an ya')?.name, 'An Ya'); // 小写归一
    assert.equal(reg.resolveEntity('person', 'anya')?.name, 'An Ya');  // 去空白
});