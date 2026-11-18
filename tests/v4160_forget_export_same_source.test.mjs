// [v4.160.0 · R25-O6] 遗忘权与备份/导出同源
// 验收口径：删完立刻重建索引；导出/备份里搜不到删掉的句子；回执带索引版本号。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const F = require(join(ROOT, 'privacy-forgetting-proof.js'));
const I = require(join(ROOT, 'recall-inverted-index.js'));

function store() {
    return { memories: [
        { id: 'k1', text: '林夏说那把生锈的钥匙藏在阁楼第三块地板下面', persons: ['林夏'], owner: '林夏', at: '2026-11-01', sessionId: 's1', floor: 3 },
        { id: 'k2', text: '陈舟提过一家叫青石的小馆子', persons: ['陈舟'], owner: '陈舟', at: '2026-11-02', sessionId: 's1', floor: 7 },
        { id: 'k3', text: '小雨喜欢傍晚的海边', persons: ['小雨'], owner: '小雨', at: '2026-11-03', sessionId: 's2', floor: 11 }
    ], receipts: [] };
}

const docs = (s) => s.memories.map((m) => ({ id: m.id, text: m.text }));

test('O6-1 删完即重建：回执带索引版本号与 rebuilt 标记', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'one', { id: 'k1' }, { index: I, indexVersion: docs(s).length });
    assert.equal(r.ok, true);
    assert.equal(r.indexVersion, 2, '删后应只剩 2 条可建索引');
    assert.equal(r.receipt.rebuilt, true);
});

test('O6-2 重建后的索引里搜不到删掉的句子', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'one', { id: 'k1' }, { index: I });
    const q = I.query(r.index, docs(r.store), '生锈的钥匙');
    assert.equal(q.results.some((x) => x.id === 'k1'), false);
});

test('O6-3 导出全文搜不到原句（默认脱敏也覆盖）', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'one', { id: 'k1' }, { index: I });
    const audit = F.auditExport(r.store, ['生锈的钥匙', '阁楼第三块地板']);
    assert.equal(audit.ok, true, '导出泄漏：' + audit.leaks.join(','));
});

test('O6-4 未删的条目仍在导出里（负控制：审计不是永远绿）', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'one', { id: 'k1' }, { index: I });
    const audit = F.auditExport(r.store, ['青石的小馆子']);
    assert.equal(audit.ok, false, '未删内容必须被搜到，否则审计是摆设');
});

test('O6-5 按人删除：该人的句子在导出与索引里都消失，别人的还在', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'person', { person: '林夏' }, { index: I });
    assert.equal(F.auditExport(r.store, ['生锈的钥匙']).ok, true);
    assert.equal(F.auditExport(r.store, ['青石的小馆子']).ok, false);
    const q = I.query(r.index, docs(r.store), '青石');
    assert.ok(q.results.length > 0, '别人的记忆仍可检索');
});

test('O6-6 全删：索引为空、导出只剩空壳且不报错', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'all', {}, { index: I });
    assert.equal(r.store.memories.length, 0);
    assert.equal(r.indexVersion, 0);
    const ex = F.exportJSON(r.store, { all: true });
    assert.ok(JSON.stringify(ex).length > 0);
});

test('O6-7 没给 index 时诚实降级（不假装重建过）', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'one', { id: 'k1' }, {});
    assert.equal(r.ok, true);
    assert.equal(r.receipt.rebuilt, false);
    assert.equal(r.indexVersion, 0);
});

test('O6-8 作用域非法时不改库也不重建', () => {
    const s = store();
    const before = JSON.stringify(s);
    const r = F.forgetAndRebuild(s, 'nope', {}, { index: I });
    assert.equal(r.ok, false);
    assert.deepEqual(r.bad, ['unknown-scope']);
    assert.equal(JSON.stringify(s), before);
});

test('O6-9 重建后的索引与全量重扫结果一致（逐条对拍）', () => {
    const s = store();
    const r = F.forgetAndRebuild(s, 'person', { person: '陈舟' }, { index: I });
    const q1 = I.query(r.index, docs(r.store), '海边');
    const q2 = I.linearQuery(docs(r.store), '海边');
    assert.deepEqual(q1.results.map((x) => x.id), q2.results.map((x) => x.id));
});

test('O6-10 幂等：同一删除再跑一次不报错、规模不变', () => {
    const s = store();
    const r1 = F.forgetAndRebuild(s, 'one', { id: 'k1' }, { index: I });
    const r2 = F.forgetAndRebuild(r1.store, 'one', { id: 'k1' }, { index: I });
    assert.equal(r2.ok, true);
    assert.equal(r2.store.memories.length, r1.store.memories.length);
});

test('O6-11 形态与自检绿', () => {
    const raw = require('node:fs').readFileSync(join(ROOT, 'privacy-forgetting-proof.js'), 'utf8');
    assert.ok(raw.includes('root.LonShaPrivacyForgettingProof = api;') || raw.includes('root.LonShaForgettingProof = api;'));
    assert.ok(!/^export /m.test(raw));
    assert.equal(typeof F.forgetAndRebuild, 'function');
    assert.equal(typeof F.auditExport, 'function');
});
