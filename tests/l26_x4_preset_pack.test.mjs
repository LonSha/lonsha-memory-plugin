// [v3.475.0 · L26-X4] 预设与模板分发
// 验收口径：预设可导入导出可校验；导入失败给原因；未知字段不许静默接受。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require(join(ROOT, 'preset-pack.js'));

const GOOD = { recallTopK: 20, minScore: 0.35, decayHalfLifeDays: 30, injectBudgetChars: 1200, language: 'zh' };

test('X4-1 合法预设：校验通过，读数 preset-valid', () => {
    const r = P.validatePreset({ schema: P.SCHEMA, values: GOOD });
    assert.equal(r.ok, true, JSON.stringify(r.errors));
    assert.equal(r.reading, 'preset-valid');
});

test('X4-2 导出带 schema / 字段说明（用户才知道每个数字干嘛）', () => {
    const out = P.exportPreset(GOOD, { name: '高召回' });
    assert.equal(out.preset.schema, P.SCHEMA);
    assert.equal(out.preset.name, '高召回');
    assert.ok(out.preset.legend.length >= 5);
    assert.match(out.text, /\n {2}"legend"/);
    assert.equal(out.reading, 'preset-exported');
});

test('X4-3 导出后可原样导回（往返一致）', () => {
    const out = P.exportPreset(GOOD, { name: '往返' });
    const back = P.importPreset(out.text);
    assert.deepEqual(back.values, GOOD);
    assert.equal(back.name, '往返');
    assert.equal(back.reading, 'preset-imported');
});

test('X4-4 缺必填项：逐项给原因', () => {
    const r = P.validatePreset({ schema: P.SCHEMA, values: { recallTopK: 10 } });
    assert.equal(r.ok, false);
    const fields = r.errors.map((e) => e.field);
    ['minScore', 'decayHalfLifeDays', 'injectBudgetChars', 'language'].forEach((f) => assert.ok(fields.includes(f), f));
    r.errors.forEach((e) => assert.ok(e.why.length > 4, e.field));
});

test('X4-5 越界与类型错分开报原因', () => {
    const r = P.validatePreset({ schema: P.SCHEMA, values: { ...GOOD, recallTopK: 999, minScore: '0.5' } });
    assert.equal(r.ok, false);
    assert.match(r.errors.find((e) => e.field === 'recallTopK').why, /应在 1~200/);
    assert.match(r.errors.find((e) => e.field === 'minScore').why, /类型不对/);
});

test('X4-6 未知字段：点名「拼写错了？」，不许静默接受', () => {
    const r = P.validatePreset({ schema: P.SCHEMA, values: { ...GOOD, minScroe: 0.5 } });
    assert.equal(r.ok, false);
    assert.match(r.errors.find((e) => e.field === 'minScroe').why, /未知字段/);
});

test('X4-7 schema 不对：明确要求哪一版', () => {
    const r = P.validatePreset({ schema: 'lonsha-preset/0', values: GOOD });
    assert.equal(r.ok, false);
    assert.match(r.errors[0].why, new RegExp(P.SCHEMA.replace(/\//g, '\\/')));
});

test('X4-8 导入非法 JSON / 非法值：抛 PRESET_INVALID 并带原因', () => {
    assert.throws(() => P.importPreset('{ not json'), (e) => e.code === 'PRESET_INVALID');
    assert.throws(() => P.importPreset(JSON.stringify({ schema: P.SCHEMA, values: { ...GOOD, language: 'fr' } })), (e) => {
        assert.equal(e.code, 'PRESET_INVALID');
        assert.ok(e.errors.some((x) => x.field === 'language'));
        return true;
    });
});

test('X4-9 导出前也校验：坏参数不许导出成「一份看起来能用的预设」', () => {
    assert.throws(() => P.exportPreset({ ...GOOD, language: 'fr' }), (e) => e.code === 'PRESET_INVALID');
});