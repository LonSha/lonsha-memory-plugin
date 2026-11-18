// [v4.162.0 · R26-O9] 诊断包导入前置预览：先看会改哪几项
// 验收口径：预览说会改 3 项，导入后恰好 3 项变。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const C = require(join(ROOT, 'settings-console.js'));

const OPTS = { at: '2026-11-18T05:10:00Z', appVersion: '4.162.0', host: 'android-arm64' };
const three = () => Object.assign({}, C.defaults(), { 'recall.topK': 9, 'inject.budget': 3, 'inject.style': 'prose' });

test('O9-1 预览三列齐：willChange / unchanged / unknown', () => {
    const pack = C.diagnostics(three(), OPTS).pack;
    const pv = C.previewImport(pack, C.defaults());
    assert.equal(pv.ok, true);
    assert.deepEqual(Object.keys(pv).sort(), ['ok', 'unchanged', 'unknown', 'values', 'willChange']);
});

test('O9-2 预览说改 3 项 ⇒ 真导入恰好 3 项变（逐项一致）', () => {
    const pack = C.diagnostics(three(), OPTS).pack;
    const pv = C.previewImport(pack, C.defaults());
    assert.equal(pv.willChange.length, 3);
    const back = C.importDiagnostics(pack);
    assert.equal(C.view(back.values).deviatedCount, 3);
    pv.willChange.forEach((row) => {
        assert.equal(back.values[row.id], row.to, row.id);
        assert.notDeepEqual(row.from, row.to, row.id);
    });
});

test('O9-3 当前值已与包一致 ⇒ willChange 空（不虚报会改）', () => {
    const pack = C.diagnostics(three(), OPTS).pack;
    const pv = C.previewImport(pack, three());
    assert.deepEqual(pv.willChange, []);
    assert.equal(pv.unchanged.length, 3);
});

test('O9-4 陌生 id 进 unknown，不混进 willChange', () => {
    const pack = C.diagnostics(three(), OPTS).pack;
    const mixed = Object.assign({}, pack, { deviations: pack.deviations.concat([{ id: 'future.unknown', current: 1 }]) });
    const pv = C.previewImport(mixed, C.defaults());
    assert.deepEqual(pv.unknown, ['future.unknown']);
    assert.equal(pv.willChange.length, 3);
});

test('O9-5 版本不符 ⇒ 预览拒收且三列皆空（不让用户看着预览以为能导）', () => {
    const pack = Object.assign({}, C.diagnostics(three(), OPTS).pack, { version: 2 });
    const pv = C.previewImport(pack, C.defaults());
    assert.equal(pv.ok, false);
    assert.deepEqual(pv.bad, ['version-mismatch']);
    assert.deepEqual(pv.willChange, []);
    assert.deepEqual(pv.unchanged, []);
    assert.deepEqual(pv.unknown, []);
});

test('O9-6 坏包同样拒收，三列皆空', () => {
    [null, 'x', {}, { kind: 'other' }].forEach((p) => {
        const pv = C.previewImport(p, C.defaults());
        assert.equal(pv.ok, false);
        assert.deepEqual(pv.bad, ['not-a-diagnostics-pack']);
        assert.deepEqual(pv.willChange, []);
    });
});

test('O9-7 预览不改当前值（只读：真是导入前的事）', () => {
    const cur = C.defaults();
    const before = JSON.stringify(cur);
    C.previewImport(C.diagnostics(three(), OPTS).pack, cur);
    assert.equal(JSON.stringify(cur), before);
});

test('O9-8 预览 values 与真导入 values 逐项相同（同一回填路径）', () => {
    const pack = C.diagnostics(three(), OPTS).pack;
    const pv = C.previewImport(pack, C.defaults());
    const back = C.importDiagnostics(pack);
    assert.equal(JSON.stringify(pv.values), JSON.stringify(back.values));
});

test('O9-9 包里本来就等于默认值的项 ⇒ 进 unchanged 而不是 willChange', () => {
    const pack = C.diagnostics(C.defaults(), OPTS).pack;
    const pv = C.previewImport(pack, three());
    assert.deepEqual(pv.willChange, []);
    assert.deepEqual(pv.unknown, []);
});

test('O9-10 自检绿', () => {
    const sc = C.settingsSelfCheck();
    assert.equal(sc.ok, true, JSON.stringify(sc.bad));
});
