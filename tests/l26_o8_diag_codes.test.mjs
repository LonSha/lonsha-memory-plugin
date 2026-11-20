// [v3.475.0 · L26-O8] 错误可读化收尾
// 验收口径：全部诊断码有人话+下一步；未登记不许上线（可扫）；未登记不许回落成码本身。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const D = require(join(ROOT, 'diag-codes-humanize.js'));

const NEW_MODULES = ['host-refusal-gate.js', 'extra-js-retirement.js', 'data-migration-matrix.js', 'memory-archive-portability.js', 'preset-pack.js'];
const sources = () => {
    const out = {};
    NEW_MODULES.forEach((f) => {
        try { out[f] = readFileSync(join(ROOT, f), 'utf8'); } catch { /* 未落盘的模块不参与本扫 */ }
    });
    return out;
};

test('O8-1 每个已登记码都有「人话 + 下一步」两段', () => {
    const codes = Object.keys(D.REGISTRY);
    assert.ok(codes.length >= 7, String(codes.length));
    codes.forEach((c) => {
        assert.ok(D.REGISTRY[c].human.length > 8, c);
        assert.ok(D.REGISTRY[c].next.length > 6, c);
    });
});

test('O8-2 humanOf 给出人话并带「下一步」提示', () => {
    const s = D.humanOf('MIGRATION_REFUSED');
    assert.match(s, /格式版本/);
    assert.match(s, /下一步/);
});

test('O8-3 未登记码返回显式标记，不许回落成码本身', () => {
    const s = D.humanOf('SOMETHING_NEW');
    assert.equal(s, '⟦未登记诊断码:SOMETHING_NEW⟧');
    assert.notEqual(s, 'SOMETHING_NEW');
});

test('O8-4 从源码里抽码：err.code = 与 code: 两种写法都认', () => {
    const src = "const e = new Error('x'); e.code = 'HOST_REFUSED';\nconst o = { code: 'RETIRE_BLOCKED' };";
    assert.deepEqual(D.extractCodes(src).sort(), ['HOST_REFUSED', 'RETIRE_BLOCKED']);
});

test('O8-5 扫本版新模块：全部码已登记，读数 diag-humanized', () => {
    const a = D.auditCodes({ sources: sources() });
    assert.equal(a.ok, true, JSON.stringify(a.unregistered));
    assert.ok(a.codes.length >= 4, JSON.stringify(a.codes));
    assert.match(a.reading, /^diag-humanized:/);
});

test('O8-6 扫到未登记码：红，且点名文件与码', () => {
    const a = D.auditCodes({ sources: { 'x.js': "e.code = 'WHATEVER_CODE';" } });
    assert.equal(a.ok, false);
    assert.deepEqual(a.unregistered, [{ file: 'x.js', code: 'WHATEVER_CODE' }]);
    assert.match(a.reading, /diag-unregistered:WHATEVER_CODE/);
});

test('O8-7 登记表缺一段（只有 human 没有 next）也算未登记', () => {
    const a = D.auditCodes({
        sources: { 'x.js': "e.code = 'HALF_DONE';" },
        registry: { HALF_DONE: { human: '只有人话没有下一步' } }
    });
    assert.equal(a.ok, false);
});

test('O8-8 renderTable 按码排序，字段齐全（给「诊断码一览」页直接铺）', () => {
    const rows = D.renderTable();
    const codes = rows.map((r) => r.code);
    assert.deepEqual(codes, codes.slice().sort());
    rows.forEach((r) => {
        assert.ok(r.human && r.next);
    });
});

test('O8-9 空源码不炸，读数为 0 个码', () => {
    const a = D.auditCodes({ sources: {} });
    assert.equal(a.ok, true);
    assert.equal(a.codes.length, 0);
    assert.equal(a.reading, 'diag-humanized:0 个码');
});