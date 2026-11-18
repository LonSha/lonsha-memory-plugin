// [v4.163.0 · R26-O6] 遗忘权接迁移包：删掉的人不得被旧包带回来
// 验收口径：删过人之后导出的包不含他；拿旧包导入也拦得住。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'privacy-forgetting-proof.js'));

const WHO = '林夏';
const emptyStore = () => ({ memories: [], receipts: [] });

function scene() {
    const base = P.makeStore(30);
    const oldPack = P.exportPack(base, {}).pack;   // 删之前导出的旧包
    const del = P.forget(base, 'person', { person: WHO }, { at: '2026-11-18' });
    return { base, oldPack, del, after: del.store };
}

test('O6-1 删除回执记下「是谁」：receipt.people 具名', () => {
    const { del } = scene();
    assert.deepEqual(del.receipt.people, [WHO]);
    assert.equal(del.receipt.deletedCount, 10);
    assert.ok(del.store.receipts.some((r) => r.kind === 'forget' && r.people.indexOf(WHO) !== -1));
});

test('O6-2 禁入名单从回执派生：删过才有，没删过是空表', () => {
    const { base, after } = scene();
    assert.deepEqual(P.denyList(after), [WHO]);
    assert.equal(P.isDenied(after, WHO), true);
    assert.equal(P.isDenied(after, '陈舟'), false);
    assert.deepEqual(P.denyList(base), []);
});

test('O6-3 删过人之后导出的包不含他（逐条查 people）', () => {
    const { after } = scene();
    const ex = P.exportPack(after, {});
    assert.equal(ex.pack.count, 20);
    ex.pack.entries.forEach((e) => {
        assert.equal(e.people.indexOf(WHO), -1, e.id + ':' + e.people.join(','));
    });
    assert.deepEqual(ex.denied, [WHO]);
});

test('O6-4 过滤要具名：回执已在但条目仍在（另一路刚落进来）⇒ 拦下并进 excluded', () => {
    const { base, del } = scene();
    // 回执照旧生效，但库里又出现了他的条目（例如别的会话刚落进来一条）
    const mixed = { memories: base.memories.slice(), receipts: del.store.receipts };
    const ex = P.exportPack(mixed, {});
    assert.equal(ex.excluded.length, 10);
    assert.equal(ex.pack.count, 20, '拦下的 10 条不应进包');
    ex.excluded.forEach((x) => {
        assert.ok(del.receipt.deletedIds.indexOf(x.id) !== -1, x.id);
        assert.deepEqual(x.people, [WHO]);
        assert.match(String(x.why), /denied-person/);
    });
});

test('O6-5 旧包导入被二次拦截：一条也不落库', () => {
    const { oldPack, after } = scene();
    assert.equal(oldPack.count, 30);
    const back = P.importPack(after, oldPack);
    assert.equal(back.ok, true);
    assert.equal(back.blockedCount, 10);
    assert.equal(back.added, 0);
    assert.equal(back.total, 20, '库内存量不得被旧包拉回 30');
    assert.equal(back.store.memories.some((m) => P.peopleOf(m).indexOf(WHO) !== -1), false);
});

test('O6-6 拦截同样具名：blocked 带 id / people / why，且不进 added 也不进 skipped', () => {
    const { oldPack, after } = scene();
    const back = P.importPack(after, oldPack);
    back.blocked.forEach((b) => {
        assert.deepEqual(b.people, [WHO]);
        assert.match(String(b.why), /denied-person/);
        assert.match(String(b.why), /遗忘权/);
    });
    assert.equal(back.blocked.length + back.added + back.skipped, 30);
});

test('O6-7 负控制：没删过人的库导同一份旧包 ⇒ 一条不拦（不是无差别拒收）', () => {
    const { oldPack } = scene();
    const back = P.importPack(emptyStore(), oldPack);
    assert.equal(back.blockedCount, 0);
    assert.equal(back.added, 30);
    assert.equal(back.total, 30);
});

test('O6-8 删过之后新导的包，导进空库也不带他（链条两头对得上）', () => {
    const { after } = scene();
    const fresh = P.exportPack(after, {}).pack;
    const into = P.importPack(emptyStore(), fresh);
    assert.equal(into.added, 20);
    assert.equal(into.blockedCount, 0);
    assert.equal(into.store.memories.some((m) => P.peopleOf(m).indexOf(WHO) !== -1), false);
});

test('O6-9 按人导出时同样受禁入名单约束：不因为选了别人就把禁入者夹带进来', () => {
    const { after } = scene();
    const ex = P.exportPack(after, { person: '陈舟' });
    assert.equal(ex.pack.count, 10);
    assert.equal(ex.pack.entries.every((e) => e.people.length === 1 && e.people[0] === '陈舟'), true);
    assert.equal(ex.excluded.length, 0, '选陈舟时本就不该碰林夏的条目');
});

test('O6-10 导出与导入都是只读的：库不变形，且自检绿', () => {
    const { after } = scene();
    const before = JSON.stringify(after);
    P.exportPack(after, {});
    P.importPack(after, P.exportPack(after, {}).pack);
    assert.equal(JSON.stringify(after), before);
    assert.equal(P.SCOPES.length, 4);
    const sc = P.privacySelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
