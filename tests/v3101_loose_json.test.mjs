// tests/v3101_loose_json.test.mjs — [v3.101] 织幕截断容错 JSON 恢复缝合测试
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
    asText, stripJsonFence, decodeLooseString,
    recoverObjectItems, tryParseStrict, parseLooseArray,
} = require('../loose-json.js');

test('asText 非字符串塌陷空串', () => {
    assert.equal(asText('x'), 'x');
    assert.equal(asText(42), '');
    assert.equal(asText(null), '');
});

test('stripJsonFence 剥 Markdown JSON 围栏', () => {
    assert.equal(stripJsonFence('```json\n{"a":1}\n```'), '{"a":1}');
    assert.equal(stripJsonFence('```\n[1]\n```'), '[1]');
    assert.equal(stripJsonFence('{"a":1}'), '{"a":1}');
});

test('decodeLooseString 转义与 \\uXXXX 还原', () => {
    assert.equal(decodeLooseString('a\\u4e2d'), 'a中');
    assert.equal(decodeLooseString('l1\\nl2'), 'l1\nl2');
    assert.equal(decodeLooseString('q\\"q'), 'q"q');
});

test('tryParseStrict 严格→尾逗号修复→null', () => {
    assert.deepEqual(tryParseStrict('[1,2]'), [1, 2]);
    assert.deepEqual(tryParseStrict('[1,2,]'), [1, 2]);   // 尾逗号修复
    assert.deepEqual(tryParseStrict('{"a":1}'), { a: 1 });
    assert.equal(tryParseStrict('not json'), null);
    assert.equal(tryParseStrict(''), null);
});

test('parseLooseArray 完整数组走严格分支', () => {
    const r = parseLooseArray('[{"type":"人物","content":"A"},{"type":"物品","content":"B"}]');
    assert.equal(r.mode, 'strict-array');
    assert.equal(r.complete, true);
    assert.equal(r.items.length, 2);
    assert.deepEqual(r.warnings, []);
});

test('parseLooseArray 截断恢复（保住完整项，丢弃半截项）', () => {
    const truncated = '[{"type":"人物","content":"A友"},{"type":"物品","content":"B剑"},{"type":"地点","content":"C城';
    const r = parseLooseArray(truncated, { fields: ['type', 'content'] });
    assert.equal(r.mode, 'loose-recovery');
    assert.equal(r.complete, false);           // 明确标记非完整
    assert.equal(r.items.length, 2);           // 保住 2 项完整，丢弃半截第 3 项
    assert.equal(r.items[0].type, '人物');
    assert.equal(r.items[1].content, 'B剑');
});

test('parseLooseArray 兼容 {output:[...]} 包装', () => {
    const r = parseLooseArray('{"thinking":"x","output":[{"a":1}]}');
    assert.equal(r.mode, 'strict-output');
    assert.equal(r.complete, true);
    assert.deepEqual(r.items, [{ a: 1 }]);
});

test('parseLooseArray 完全无法恢复时给 warning', () => {
    const r = parseLooseArray('完全不是JSON的文本', { fields: ['type', 'content'] });
    assert.equal(r.complete, false);
    assert.equal(r.items.length, 0);
    assert.ok(r.warnings.length > 0);
});

test('recoverObjectItems 字段提取与转义还原', () => {
    const src = '[{"type":"人物","content":"A\\u4e2d"}]';
    const items = recoverObjectItems({ source: src, fields: ['type', 'content'] });
    assert.equal(items.length, 1);
    assert.equal(items[0].content, 'A中'); // \u4e2d 还原
});

test('recoverObjectItems 枚举字段约束', () => {
    const src = '[{"position":"start","content":"x"},{"position":"BAD","content":"y"}]';
    const items = recoverObjectItems({
        source: src,
        fields: ['position', 'content'],
        enumFields: [['position', 'start|end|before|after']],
    });
    assert.equal(items.length, 1);        // BAD 不被枚举匹配 → 跳过
    assert.equal(items[0].position, 'start');
});

test('recoverObjectItems normalize 过滤', () => {
    const src = '[{"type":"人物","content":"A"},{"type":"","content":""}]';
    const items = recoverObjectItems({
        source: src,
        fields: ['type', 'content'],
        normalize: (v) => (v.content ? v : null), // 空 content 丢弃
    });
    assert.equal(items.length, 1);
});

test('recoverObjectItems max 上限防失控', () => {
    const one = '{"type":"t","content":"c"}';
    const src = '[' + Array(10).fill(one).join(',') + ']';
    const items = recoverObjectItems({ source: src, fields: ['type', 'content'], max: 3 });
    assert.equal(items.length, 3);
});
