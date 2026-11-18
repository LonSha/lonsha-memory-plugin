// [v4.158.0 · R24-X5] 遗忘权与隐私面：用户能证明「它真的忘了」
// 验收口径：导出→删除→再导出，差异与删除清单逐条对应；回执条数=实删数；脱敏后名字不可见。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'privacy-forgetting-proof.js'));


test('X5-1 四档删除齐：单条 / 人物 / 时间段 / 全部', () => {
    assert.deepEqual(P.SCOPES, ['one', 'person', 'range', 'all']);
});

test('X5-2 我的记忆清单：可搜、可分页、按时间倒序', () => {
    const s = P.makeStore(30);
    const page1 = P.list(s, { page: 1, size: 10 });
    assert.equal(page1.total, 30);
    assert.equal(page1.pages, 3);
    assert.equal(page1.items.length, 10);
    const ats = page1.items.map((m) => Date.parse(m.at));
    assert.deepEqual(ats, ats.slice().sort((a, b) => b - a));
    const page2 = P.list(s, { page: 2, size: 10 });
    assert.notDeepEqual(page1.items.map((m) => m.id), page2.items.map((m) => m.id));
});

test('X5-3 导出含原文出处（会话 + 楼层）', () => {
    const e = P.exportJSON(P.makeStore(5), { all: true });
    assert.equal(e.count, 5);
    e.memories.forEach((m) => {
        assert.ok(m.source && typeof m.source.sessionId === 'string');
        assert.ok(typeof m.source.floor === 'number');
    });
});

test('X5-4 导出→删除→再导出：差异与删除清单逐条对应', () => {
    const s = P.makeStore(30);
    const before = P.exportJSON(s, { all: true });
    const d = P.forget(s, 'person', { person: '林夏' });
    const after = P.exportJSON(d.store, { all: true });
    const beforeIds = before.memories.map((m) => m.id);
    const afterIds = after.memories.map((m) => m.id);
    const diff = beforeIds.filter((id) => afterIds.indexOf(id) === -1).sort();
    assert.deepEqual(diff, d.receipt.deletedIds);
    assert.equal(before.count - after.count, d.receipt.deletedCount);
});

test('X5-5 删除回执：条数 / 涉及面 / 校验摘要 / 会删什么', () => {
    const d = P.forget(P.makeStore(30), 'person', { person: '陈舟' }, { at: '2026-11-18' });
    assert.equal(typeof d.receipt.deletedCount, 'number');
    assert.deepEqual(d.receipt.surfaces, ['body', 'index', 'summary', 'receipt']);
    assert.match(d.receipt.digest, /^d-\d+-[0-9a-f]+$/);
    assert.ok(d.receipt.what && d.receipt.what.length > 8);
});

test('X5-6 回执摘要确定性：同样删两次，摘要相同', () => {
    const s = P.makeStore(30);
    const a = P.forget(s, 'all', {});
    const b = P.forget(s, 'all', {});
    assert.equal(a.receipt.digest, b.receipt.digest);
    assert.equal(a.receipt.deletedCount, b.receipt.deletedCount);
});

test('X5-7 单条删除只删一条（不许误伤）', () => {
    const s = P.makeStore(30);
    const d = P.forget(s, 'one', { id: 'm7' });
    assert.equal(d.receipt.deletedCount, 1);
    assert.deepEqual(d.receipt.deletedIds, ['m7']);
    assert.equal(d.store.memories.length, 29);
});

test('X5-8 时间段删除：只动区间内的', () => {
    const s = P.makeStore(30);
    const d = P.forget(s, 'range', { from: '2026-11-01', to: '2026-11-05' });
    assert.ok(d.receipt.deletedCount > 0);
    d.receipt.deletedIds.forEach((id) => {
        const m = s.memories.find((x) => x.id === id);
        assert.ok(Date.parse(m.at) >= Date.parse('2026-11-01') && Date.parse(m.at) <= Date.parse('2026-11-05'));
    });
});

test('X5-9 全部删除：库空但回执留下（可核对）', () => {
    const d = P.forget(P.makeStore(30), 'all', {});
    assert.equal(d.store.memories.length, 0);
    assert.equal(d.receipt.deletedCount, 30);
    assert.ok(d.store.receipts.some((r) => r.kind === 'forget'));
});

test('X5-10 脱敏导出：原文人物名一个都扫不到', () => {
    const e = P.exportJSON(P.makeStore(30), { all: true, desensitize: true });
    const joined = e.memories.map((m) => m.text + '|' + m.persons.join(',')).join('|');
    ['林夏', '陈舟', '小雨'].forEach((n) => assert.equal(joined.indexOf(n), -1, n));
    assert.equal(e.desensitized, true);
});

test('X5-11 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('privacy-forgetting-proof.js'));
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaForgettingProof', 'privacy-forgetting-proof.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('this.engine.forgettingProof'));
    assert.ok(idx.includes("typeof api.forget === 'function'"));
});

test('X5-12 自检绿 + 经典脚本形态', () => {
    const s = P.privacySelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /scopes=4/);
    const src = readFileSync(join(ROOT, 'privacy-forgetting-proof.js'), 'utf8');
    assert.ok(src.includes('root.LonShaForgettingProof = api;'));
    assert.ok(!/^export /m.test(src));
});
