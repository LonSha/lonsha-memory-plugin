// tests/v3102_model_response.test.mjs
// v3.102 缝合 bionic-memory（BME）agent/model-protocol.js：LLM 响应协议归一化引擎
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(REPO, 'model-response.js'), 'utf8');
// 同语义版本比较（3.100.0 不能用 parseFloat）
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));

// 沙箱加载（IIFE 双导出）
const sandbox = { module: { exports: {} }, window: undefined, globalThis: undefined };
const loader = new Function('globalThis', 'module', 'window',
    src + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaModelResponse;');
const MR = loader(sandbox, sandbox.module, undefined);

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };
const bad = (n) => { fail++; console.log('✗ ' + n); };

// ---------- 0. 版本与注册 ----------
test('【0】版本与 manifest 注册', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.102.0'), `index.js 版本 ${v} < 3.102.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.102.0'), `manifest 版本 ${manifest.version} < 3.102.0`);
    assert.ok(manifest.extra_js.includes('model-response.js'), 'model-response.js 已注册 extra_js');
    ok('版本 / manifest 注册');
});

// ---------- 1. content 归一化 ----------
test('【1】normalizeContent 多形状', () => {
    assert.strictEqual(MR.normalizeContent('hello'), 'hello');
    assert.strictEqual(MR.normalizeContent([{ type: 'text', text: 'a' }, { content: 'b' }, 'c']), 'abc');
    assert.strictEqual(MR.normalizeContent(null), '');
    assert.strictEqual(MR.normalizeContent(42), '');
    assert.strictEqual(MR.normalizeContent([{}, null, undefined]), '');
    ok('content 字符串 / 分片数组 / 非法形状');
});

// ---------- 2. tool call 双形状 ----------
test('【2】normalizeToolCall 包装与平铺', () => {
    const wrapped = MR.normalizeToolCall({ id: 'c1', function: { name: 'search', arguments: '{"q":1}' } }, 0);
    assert.strictEqual(wrapped.name, 'search');
    assert.strictEqual(wrapped.arguments, '{"q":1}');
    assert.strictEqual(wrapped.id, 'c1');
    const flat = MR.normalizeToolCall({ name: 'recall', arguments: { b: 2, a: 1 } }, 1);
    assert.strictEqual(flat.name, 'recall');
    assert.strictEqual(flat.arguments, '{"a":1,"b":2}', '对象参数走稳定序列化（键排序）');
    assert.ok(/^call_1_[0-9a-f]{8}$/.test(flat.id), '缺 id 时按索引+指纹生成: ' + flat.id);
    ok('tool call 包装形状 / 平铺形状 / 指纹 id');
});

// ---------- 3. 缺 name 拒绝 ----------
test('【3】缺 name 抛错', () => {
    assert.throws(() => MR.normalizeToolCall({ arguments: '{}' }, 0), /without a name/);
    assert.throws(() => MR.normalizeToolCall({ name: '   ' }, 0), /without a name/);
    ok('无名 tool call 抛错');
});

// ---------- 4. 响应归一化 ----------
test('【4】normalizeModelResponse 蛇形/驼形 toolCalls', () => {
    const snake = MR.normalizeModelResponse({ content: 'x', tool_calls: [{ function: { name: 'a' } }], finish_reason: 'stop' });
    assert.strictEqual(snake.toolCalls.length, 1);
    assert.strictEqual(snake.finishReason, 'stop');
    const camel = MR.normalizeModelResponse({ content: [{ text: 'y' }], toolCalls: [{ name: 'b' }], finishReason: 'length' });
    assert.strictEqual(camel.content, 'y');
    assert.strictEqual(camel.finishReason, 'length');
    assert.strictEqual(camel.usage, null);
    ok('tool_calls / toolCalls 双命名 + finish_reason 双命名');
});

// ---------- 5. 重复 id 拒绝 ----------
test('【5】重复 tool call id 拒绝（网关串包）', () => {
    assert.throws(() => MR.normalizeModelResponse({
        tool_calls: [{ id: 'dup', function: { name: 'a' } }, { id: 'dup', function: { name: 'b' } }],
    }), /duplicate tool call id/);
    ok('重复 id 抛错');
});

// ---------- 6. 双空拒绝 ----------
test('【6】content 与 tool call 双空拒绝', () => {
    assert.throws(() => MR.normalizeModelResponse({}), /neither content nor tool calls/);
    assert.throws(() => MR.normalizeModelResponse({ content: '   ' }), /neither content nor tool calls/);
    const okResp = MR.normalizeModelResponse({ toolCalls: [{ name: 'a' }], content: '' });
    assert.strictEqual(okResp.content, '');
    assert.strictEqual(okResp.toolCalls.length, 1);
    ok('双空拒绝 / 仅 tool call 合法');
});

// ---------- 7. 截断判定 ----------
test('【7】wasTruncated 三态', () => {
    assert.strictEqual(MR.wasTruncated({ finishReason: 'length' }), true);
    assert.strictEqual(MR.wasTruncated({ finish_reason: 'max_tokens' }), true);
    assert.strictEqual(MR.wasTruncated({ finishReason: 'MAX_OUTPUT_TOKENS' }), true);
    assert.strictEqual(MR.wasTruncated({ finishReason: 'stop' }), false);
    assert.strictEqual(MR.wasTruncated({}), false);
    ok('length / max_tokens / max_output_tokens 判定（大小写无关）');
});

// ---------- 8. assistant 消息 ----------
test('【8】toAssistantMessage 线上形状', () => {
    const { response, message } = MR.toAssistantMessage({ content: 'hi', tool_calls: [{ id: 't1', function: { name: 'go', arguments: '{}' } }] });
    assert.strictEqual(message.role, 'assistant');
    assert.strictEqual(message.content, 'hi');
    assert.strictEqual(message.tool_calls.length, 1);
    assert.strictEqual(message.tool_calls[0].function.name, 'go');
    assert.strictEqual(response.toolCalls.length, 1);
    const plain = MR.toAssistantMessage({ content: 'only text' });
    assert.strictEqual(plain.message.tool_calls, undefined, '无 tool call 不带 tool_calls 字段');
    const reused = MR.toAssistantMessage(response);
    assert.strictEqual(reused.message.content, 'hi');
    ok('assistant 消息 / 无 tool call 省略字段 / 归一化结果二次传入');
});

// ---------- 9. tool 消息 ----------
test('【9】toToolMessage', () => {
    const m = MR.toToolMessage({ id: 't1', name: 'go' }, { content: 'result' });
    assert.deepStrictEqual(m, { role: 'tool', tool_call_id: 't1', name: 'go', content: 'result' });
    const fromFn = MR.toToolMessage({ function: { name: 'f' } }, {});
    assert.strictEqual(fromFn.name, 'f');
    assert.strictEqual(fromFn.tool_call_id, '');
    assert.strictEqual(fromFn.content, '');
    ok('tool 消息字段 / 缺位兜底');
});

// ---------- 10. 稳定序列化与指纹 ----------
test('【10】stableStringify / fnv1a 确定性', () => {
    assert.strictEqual(MR.stableStringify({ b: 1, a: 2 }), MR.stableStringify({ a: 2, b: 1 }));
    assert.strictEqual(MR.stableStringify({ a: undefined, b: 1 }), '{"b":1}');
    assert.strictEqual(MR.stableStringify([1, { b: 2, a: 1 }]), '[1,{"a":1,"b":2}]');
    assert.strictEqual(MR.stableStringify(undefined), 'null');
    assert.strictEqual(MR.stableStringify(10n), '"10"');
    assert.match(MR.fnv1a('abc'), /^[0-9a-f]{8}$/);
    assert.strictEqual(MR.fnv1a('abc'), MR.fnv1a('abc'));
    assert.notStrictEqual(MR.fnv1a('abc'), MR.fnv1a('abd'));
    ok('键序无关 / undefined 剔除 / bigint / 哈希稳定');
});

// ---------- 11. 与 loose-json 协同（截断 → 恢复） ----------
test('【11】截断信号驱动宽松恢复路径', () => {
    const truncated = MR.normalizeModelResponse({
        content: '[{"name":"甲"},{"name":"乙"},{"name":"丙',
        finish_reason: 'length',
    });
    assert.strictEqual(MR.wasTruncated(truncated), true);
    const looseSrc = fs.readFileSync(path.join(REPO, 'loose-json.js'), 'utf8');
    const sbox = { module: { exports: {} }, window: undefined };
    const loadLoose = new Function('globalThis', 'module', 'window',
        looseSrc + '\nreturn (typeof module !== \'undefined\' && module.exports) ? module.exports : globalThis.LonShaLooseJson;');
    const LJ = loadLoose(sbox, sbox.module, undefined);
    const recovered = LJ.parseLooseArray(truncated.content, { fields: ['name'], max: 100 });
    assert.strictEqual(recovered.items.length, 2, '截断前完整条目被保住: ' + JSON.stringify(recovered.items));
    assert.strictEqual(recovered.complete, false);
    ok('finish_reason=length + loose-json 抢救完整条目');
});

console.log(`[v3102] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
