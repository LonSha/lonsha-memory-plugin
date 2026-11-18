// [v4.158.0 · R24-O5] 写入幂等：重复记忆与冲突合并
// 验收口径（原文）：同一事实重复抽取两次，库内条数不变；合并必须留痕（回执）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const W = require(join(ROOT, 'memory-write-idempotent.js'));

const base = () => W.emptyStore({});
const fact = (over) => Object.assign({ id: 'f1', subject: '我', predicate: '答应', object: '明天在车站见', at: '2026-11-18T09:00:00Z' }, over || {});

test('O5-1 三态齐且不塌成一个 skip', () => {
    assert.deepEqual(Object.keys(W.STATES).sort(), ['conflict', 'refine', 'same']);
    ['same', 'refine', 'conflict'].forEach((k) => assert.ok(W.STATES[k] && W.STATES[k].length > 2, k));
});

test('O5-2 归一：标点/空白/大小写不影响幂等键', () => {
    const a = W.idempotencyKey(fact({ object: '明天在车站见。' }));
    const b = W.idempotencyKey(fact({ object: ' 明天 在车站见 ' }));
    assert.equal(a, b);
});

test('O5-3 同一批抽取两次：库内条数不变（第二次全是 same）', () => {
    const batch = [fact(), fact(), fact()];
    const once = W.writeBatch(base(), batch);
    const twice = W.writeBatch(once.store, batch);
    assert.equal(once.size, 1, '同一批里重复的事实只该成 1 条');
    assert.equal(twice.size, once.size, '再抽一遍条数必须不变');
    assert.equal(twice.counts.add, 0, '第二次不许再有 add');
    assert.equal(twice.counts.same, 3);
});

test('O5-4 same 只累加出处与次数，不动实体', () => {
    const a = W.write(base(), fact({ source: 's1' }));
    const b = W.write(a.store, fact({ source: 's2' }));
    const r = b.store.records[0];
    assert.equal(r.seenCount, 2);
    assert.deepEqual(r.sources, ['s1', 's2']);
    assert.equal(r.object, '明天在车站见', 'same 不许改对象');
});

test('O5-5 refine 原地补全 + 留痕 diff，id 不变', () => {
    const a = W.write(base(), fact());
    const b = W.write(a.store, fact({ qualifiers: { place: '车站' } }));
    assert.equal(b.state, 'refine');
    assert.equal(b.store.records.length, 1);
    assert.equal(b.store.records[0].id, 'f1');
    assert.equal(b.store.records[0].qualifiers.place, '车站');
    assert.ok(Array.isArray(b.diff) && b.diff.some((d) => d.facet === 'place'));
});

test('O5-6 conflict：同主体+谓词+时间桶但对象不同 ⇒ 走裁决，不默默新增', () => {
    const a = W.write(base(), fact());
    const b = W.write(a.store, fact({ id: 'f2', object: '后天见', at: '2026-11-18T10:00:00Z' }));
    assert.equal(b.state, 'conflict');
    assert.equal(b.store.records.length, 1, '冲突不许变成两条并排记录');
    assert.equal(b.resolution, 'newer-wins');
    const rc = b.store.receipts[b.store.receipts.length - 1];
    assert.equal(rc.kind, 'conflict');
    assert.ok(rc.before && rc.after, '两造都要写进回执');
    assert.equal(b.store.records[0].object, '后天见');
    assert.equal(b.store.records[0].superseded[0].object, '明天在车站见', '旧说法必须留痕');
});

test('O5-7 负控制：跨时间桶不许判 same（时间桶真的在起作用）', () => {
    const a = W.write(base(), fact());
    const b = W.write(a.store, fact({ at: '2026-11-19T09:00:00Z' }));
    assert.equal(b.state, 'add', '跨桶就是新事实');
    assert.equal(b.store.records.length, 2);
});

test('O5-8 每次写入产出一条回执（漏回执等于悄悄改库）', () => {
    const a = W.write(base(), fact());
    assert.equal(a.store.receipts.length, 1);
    const b = W.write(a.store, fact());
    assert.equal(b.store.receipts.length, 2);
    const c = W.writeBatch(base(), [fact(), fact({ object: '别的', at: '2026-11-18T11:00:00Z' })]);
    // 回执对齐的是「写入次数」而不是「条目数」：冲突不新增条目，但必须留一条回执。
    assert.equal(c.store.receipts.length, 2);
    assert.equal(c.size, 1);
});

test('O5-9 纯函数：不许改入参库', () => {
    const s0 = base();
    const snap = JSON.stringify(s0);
    W.write(s0, fact());
    assert.equal(JSON.stringify(s0), snap, '写入不许污染入参');
    const once = W.write(base(), fact());
    const snap2 = JSON.stringify(once.store);
    W.write(once.store, fact({ qualifiers: { place: '站' } }));
    assert.equal(JSON.stringify(once.store), snap2);
});

test('O5-10 接线：manifest.extra_js + registry + index.js 真消费点', () => {
    const mf = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok((mf.extra_js || []).includes('memory-write-idempotent.js'), 'extra_js 未登记 ⇒ 真机永不加载');
    const rg = readFileSync(join(ROOT, 'optional-engine-registry.js'), 'utf8');
    assert.ok(rg.includes("'LonShaWriteIdempotent', 'memory-write-idempotent.js'"));
    const idx = readFileSync(join(ROOT, 'index.js'), 'utf8');
    assert.ok(idx.includes('optEngines.LonShaWriteIdempotent'));
    assert.ok(idx.includes('this.engine.writeIdempotent'));
    assert.ok(idx.includes("typeof api.write === 'function'"), '必须做形态校验，不许拿到毛坯就挂');
});

test('O5-11 自检绿（模块自带读数）', () => {
    const s = W.writeIdempotentSelfCheck();
    assert.equal(s.ok, true, JSON.stringify(s.bad));
    assert.match(s.sample, /states=3/);
});

test('O5-12 经典脚本形态：无 module 时挂 global.LonShaWriteIdempotent', () => {
    const src = readFileSync(join(ROOT, 'memory-write-idempotent.js'), 'utf8');
    assert.ok(src.includes('root.LonShaWriteIdempotent = api;'));
    assert.ok(src.includes('module.exports = factory()'));
    assert.ok(!/^export /m.test(src), 'extra_js 按经典脚本加载，出现 export 即语法错误');
});
