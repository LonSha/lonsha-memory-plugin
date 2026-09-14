// tests/v3100_canonical_stringify.test.mjs — [v3.100] Luker 确定性序列化缝合测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
    canonicalStringify, canonicalStringifyArgs, canonicalEquals, stableHash, fnv1a,
} = require('../canonical-stringify.js');

test('canonicalStringify 键序无关（语义相同→字节相同）', () => {
    assert.equal(
        canonicalStringify({ a: 1, b: 2 }),
        canonicalStringify({ b: 2, a: 1 })
    );
});

test('canonicalStringify 嵌套对象每层排序', () => {
    assert.equal(
        canonicalStringify({ z: { b: 2, a: 1 }, a: 1 }),
        '{"a":1,"z":{"a":1,"b":2}}'
    );
});

test('canonicalStringify 数组保序（数组序是语义）', () => {
    assert.notEqual(canonicalStringify([2, 1]), canonicalStringify([1, 2]));
    assert.equal(canonicalStringify([{ b: 2, a: 1 }]), '[{"a":1,"b":2}]');
});

test('canonicalStringify 原始值直通', () => {
    assert.equal(canonicalStringify('str'), '"str"');
    assert.equal(canonicalStringify(42), '42');
    assert.equal(canonicalStringify(null), 'null');
    assert.equal(canonicalStringify(true), 'true');
});

test('canonicalStringify 循环引用抛错（同 JSON.stringify）', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    assert.throws(() => canonicalStringify(cyclic));
});

test('canonicalStringifyArgs 对象排序序列化', () => {
    assert.equal(canonicalStringifyArgs({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test('canonicalStringifyArgs 非对象塌陷为 {}', () => {
    assert.equal(canonicalStringifyArgs([1, 2]), '{}');   // 数组
    assert.equal(canonicalStringifyArgs('str'), '{}');    // 字符串
    assert.equal(canonicalStringifyArgs(null), '{}');     // null
    assert.equal(canonicalStringifyArgs(undefined), '{}');// undefined
    assert.equal(canonicalStringifyArgs(42), '{}');       // 数字
});

test('canonicalEquals 语义等价判定（键序无关）', () => {
    assert.equal(canonicalEquals({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 }), true);
    assert.equal(canonicalEquals({ a: 1 }, { a: 2 }), false);
    assert.equal(canonicalEquals([1, 2], [2, 1]), false); // 数组序不同不等价
});

test('stableHash 键序无关（同语义同指纹）', () => {
    assert.equal(stableHash({ a: 1, b: 2 }), stableHash({ b: 2, a: 1 }));
});

test('stableHash 异内容异指纹', () => {
    assert.notEqual(stableHash({ a: 1 }), stableHash({ a: 2 }));
});

test('stableHash 返回 8 位十六进制', () => {
    assert.match(stableHash({ name: 'test' }), /^[0-9a-f]{8}$/);
});

test('fnv1a 稳定且确定性', () => {
    assert.equal(fnv1a('hello'), fnv1a('hello'));
    assert.match(fnv1a('hello'), /^[0-9a-f]{8}$/);
    assert.notEqual(fnv1a('hello'), fnv1a('world'));
});