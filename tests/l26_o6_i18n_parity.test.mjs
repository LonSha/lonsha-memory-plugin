// [v3.475.0 · L26-O6] 多语言键集合与缺键标记
// 验收口径：两语言键集合相等；缺键显示显式标记而非空串。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const I = require(join(ROOT, 'i18n-keys-parity.js'));

const ZH = { ui: { save: '保存', cancel: '取消', tips: { empty: '还没有记忆' } }, n: 1 };
const EN = { ui: { save: 'Save', cancel: 'Cancel', tips: { empty: 'No memories yet' } }, n: 1 };

test('O6-1 键展开成点号路径，数组按索引算键', () => {
    const keys = I.flattenKeys({ a: { b: 1 }, c: [10, 20] });
    assert.deepEqual(keys.sort(), ['a.b', 'c.0', 'c.1']);
});

test('O6-2 两份包键集合相等时 parity 为真，读数 i18n-parity', () => {
    const r = I.comparePacks(ZH, EN);
    assert.equal(r.parity, true);
    assert.equal(r.ok, true);
    assert.equal(r.leftKeys, 4);
    assert.equal(r.shared, 4);
    assert.equal(r.reading, 'i18n-parity');
});

test('O6-3 缺键双向分列：缺在英文侧与缺在中文侧各记各的', () => {
    const en = { ui: { save: 'Save', cancel: 'Cancel', tips: {} }, n: 1, extra: 'x' };
    const r = I.comparePacks(ZH, en);
    assert.deepEqual(r.missingInRight, ['ui.tips.empty']);
    assert.deepEqual(r.missingInLeft, ['extra']);
    assert.equal(r.parity, false);
    assert.equal(r.reading, 'i18n-gaps:1+1');
});

test('O6-4 缺键显示显式标记，绝不返回空串', () => {
    const v = I.translate(EN, 'ui.notThere');
    assert.equal(v, '⟦缺键:ui.notThere⟧');
    assert.notEqual(v, '');
});

test('O6-5 键存在但值是空串/空白：也算缺键（空串会被当成「本来就没这个词」）', () => {
    const pack = { ui: { blank: '   ', empty: '' } };
    assert.equal(I.translate(pack, 'ui.blank'), '⟦缺键:ui.blank⟧');
    assert.equal(I.translate(pack, 'ui.empty'), '⟦缺键:ui.empty⟧');
    assert.equal(I.translate({ ui: { ok: '好' } }, 'ui.ok'), '好');
});

test('O6-6 两边都有键但一边是空串：emptyValues 单列，ok 为假', () => {
    const left = { a: 'x', b: 'y' };
    const right = { a: 'X', b: '  ' };
    const r = I.comparePacks(left, right);
    assert.equal(r.parity, true);
    assert.deepEqual(r.emptyValues, ['b']);
    assert.equal(r.ok, false);
    assert.equal(r.reading, 'i18n-empty:1');
});

test('O6-7 少于两包不许对拍：直接抛（单包看不出缺键）', () => {
    assert.throws(() => I.auditLocales({ locales: { zh: ZH } }), TypeError);
});

test('O6-8 多包审计逐对给结果，坏的那份点名', () => {
    const ja = { ui: { save: '保存', cancel: 'キャンセル', tips: { empty: 'まだ' } }, n: 1 };
    const out = I.auditLocales({ locales: { zh: ZH, en: EN, ja } });
    assert.equal(out.ok, true);
    assert.equal(out.pairs.length, 2);
    const bad = I.auditLocales({ locales: { zh: ZH, en: { ui: { save: 'S' } } } });
    assert.equal(bad.ok, false);
    assert.match(bad.reading, /i18n-broken:en/);
});