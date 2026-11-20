// [v3.475.0 · L26-X1] 记忆档案可携
// 验收口径：导出人类可读；三模式结果不同形；导入前出差异预览；冲突不静默覆盖。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const A = require(join(ROOT, 'memory-archive-portability.js'));

const LOCAL = [
    { id: 'm1', content: '她喜欢雨天', tags: ['天气'], weight: 3 },
    { id: 'm2', content: '约定周三见面', tags: [] }
];
const INCOMING = [
    { id: 'm1', content: '她喜欢雨天（档案版）', tags: ['天气'], weight: 3 },
    { id: 'm3', content: '换设备后新增的一条', tags: ['迁移'] }
];

test('X1-1 三模式闭集', () => {
    assert.deepEqual(A.MODES.slice(), ['replace', 'merge', 'fill-empty']);
});

test('X1-2 导出人类可读：缩进 JSON、带 schema 与条数、逐条有 text', () => {
    const out = A.exportArchive(LOCAL, { now: '2026-11-20T00:00:00Z' });
    assert.equal(out.count, 2);
    assert.equal(out.archive.schema, A.SCHEMA);
    assert.match(out.text, /\n  "schema"/);
    out.archive.items.forEach((i) => assert.ok(i.text && i.text.length > 0, i.id));
    const parsed = JSON.parse(out.text);
    assert.equal(parsed.count, 2);
});

test('X1-3 导出：无 id 的条目被剔除（脏数据不许混进档案）', () => {
    const out = A.exportArchive([{ content: '没有 id' }, ...LOCAL]);
    assert.equal(out.count, 2);
    assert.deepEqual(out.archive.items.map((i) => i.id), ['m1', 'm2']);
});

test('X1-4 差异预览：新增/冲突/相同/仅本地四类分开数', () => {
    const p = A.previewImport(LOCAL, INCOMING);
    assert.deepEqual(p.adds.map((r) => r.id), ['m3']);
    assert.deepEqual(p.conflicts.map((c) => c.id), ['m1']);
    assert.deepEqual(p.identical, []);
    assert.deepEqual(p.onlyLocal, ['m2']);
    assert.match(p.summary, /新增 1 条 \/ 冲突 1 条/);
});

test('X1-5 replace：以档案为准，本地多出来的被丢掉（模式可区分）', () => {
    const r = A.importArchive(LOCAL, INCOMING, 'replace');
    assert.deepEqual(r.records.map((x) => x.id).sort(), ['m1', 'm3']);
    assert.equal(r.records.find((x) => x.id === 'm1').content, '她喜欢雨天（档案版）');
    assert.equal(r.conflicts.length, 0);
});

test('X1-6 merge：保留本地冲突值并点名，绝不静默覆盖', () => {
    const r = A.importArchive(LOCAL, INCOMING, 'merge');
    assert.deepEqual(r.records.map((x) => x.id).sort(), ['m1', 'm2', 'm3']);
    assert.equal(r.records.find((x) => x.id === 'm1').content, '她喜欢雨天');
    assert.equal(r.conflicts.length, 1);
    assert.equal(r.conflicts[0].kept, 'local');
    assert.equal(r.conflicts[0].fields[0].field, 'content');
    assert.match(r.reading, /archive-imported-with-conflicts:1/);
});

test('X1-7 fill-empty：只往空字段里填，已有值一律不动', () => {
    const local = [{ id: 'm1', content: '她喜欢雨天', tags: [] }];
    const incoming = [{ id: 'm1', content: '档案版', tags: ['天气', '雨'] }, { id: 'm4', content: '新的' }];
    const r = A.importArchive(local, incoming, 'fill-empty');
    const m1 = r.records.find((x) => x.id === 'm1');
    assert.equal(m1.content, '她喜欢雨天');
    assert.deepEqual(m1.tags, ['天气', '雨']);
    assert.ok(r.records.some((x) => x.id === 'm4'));
});

test('X1-8 三模式结果确实不同形（同输入不同结果）', () => {
    // 关键在「本地有字段但值为空」的记录：merge 保留空、fill-empty 填上、replace 换成本地没有的值。
    const local = [{ id: 'm1', content: '她喜欢雨天', tags: [] }];
    const incoming = [{ id: 'm1', content: '档案版', tags: ['天气'] }];
    const a = A.importArchive(local, incoming, 'replace');
    const b = A.importArchive(local, incoming, 'merge');
    const c = A.importArchive(local, incoming, 'fill-empty');
    const shape = (r) => r.records.map((x) => x.id + ':' + x.content + ':' + JSON.stringify(x.tags)).sort().join('|');
    assert.notEqual(shape(a), shape(b));
    assert.notEqual(shape(b), shape(c));
    assert.notEqual(shape(a), shape(c));
});

test('X1-9 未知模式：抛 ARCHIVE_REFUSED，不许猜一个默认模式', () => {
    assert.throws(() => A.importArchive(LOCAL, INCOMING, 'append'), (e) => {
        assert.equal(e.code, 'ARCHIVE_REFUSED');
        assert.match(e.message, /未知导入模式/);
        return true;
    });
});

test('X1-10 幂等：同一份档案 merge 两次结果不变（第二次零冲突）', () => {
    const once = A.importArchive(LOCAL, INCOMING, 'merge');
    const twice = A.importArchive(once.records, INCOMING, 'merge');
    assert.deepEqual(twice.records.map((x) => x.id).sort(), once.records.map((x) => x.id).sort());
    assert.equal(twice.count, once.count);
});