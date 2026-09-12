// tests/df5_inject_slot.test.mjs
// DF5 注入通道行为测试：静态绝迹断言 + 从 index.js 提取 writeInjectSlot/clearInjectSlots 实测参数序列。
// 运行: node tests/df5_inject_slot.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;

// ── 静态断言 1: 旧错位调用模式必须绝迹 ──
const bad = [
    /'lonsha_memory', injection, depth, true, 4\)/,
    /'lonsha_memory_history', volText \|\| '', 9999, true, 4\)/,
    /'lonsha_memory', '', 0, false, 4\)/,
    /'lonsha_memory_history', '', 9999, false, 4\)/,
];
for (const p of bad) {
    assert.ok(!p.test(src), `旧错位模式仍存在: ${p}`);
    pass++;
}
console.log(`ok: 旧错位调用模式绝迹 (${bad.length} 项)`);

// ── 静态断言 2: setExtensionPrompt 直接调用仅剩通道内 1 处 ──
const calls = [...src.matchAll(/\.setExtensionPrompt\s*\(/g)];
assert.equal(calls.length, 1, `setExtensionPrompt 直接调用应仅剩通道内 1 处 (实际 ${calls.length})`);
pass++;
console.log('ok: setExtensionPrompt 直接调用收敛为唯一通道');

// ── 静态断言 3: 通道定义与调用点存在 ──
assert.ok(src.includes('function writeInjectSlot('), 'writeInjectSlot 定义存在');
assert.ok(src.includes('function clearInjectSlots('), 'clearInjectSlots 定义存在');
assert.ok(src.includes('const INJECT_POSITION_IN_CHAT = 1;'), 'IN_CHAT 常量存在');
pass += 3;
const wc = [...src.matchAll(/writeInjectSlot\s*\(/g)].length;
assert.ok(wc >= 7, `writeInjectSlot 出现次数 >= 7 (定义1+清空2+主注入2+interceptor2, 实际 ${wc})`);
pass++;
console.log(`ok: 通道定义齐全, writeInjectSlot 出现 ${wc} 次`);

// ── 行为测试: 抠出通道函数实测参数序列 ──
function extractFn(name) {
    const marker = `function ${name}(`;
    const start = src.indexOf(marker);
    if (start < 0) throw new Error('missing ' + name);
    const end = src.indexOf('\n    }', start);
    if (end < 0) throw new Error('unterminated ' + name);
    return src.slice(start, end + 6);
}
const harness = `
const INJECT_POSITION_IN_CHAT = 1;
const INJECT_ROLE_SYSTEM = 0;
${extractFn('writeInjectSlot')}
${extractFn('clearInjectSlots')}
return { writeInjectSlot, clearInjectSlots };
`;
const recorded = [];
const mockWindow = { SillyTavern: { getContext: () => ({ setExtensionPrompt: (...args) => { recorded.push(args); } }) } };
const { writeInjectSlot, clearInjectSlots } = new Function('window', 'errLog', harness)(mockWindow, () => {});

writeInjectSlot('lonsha_memory', 'hello', 2);
assert.deepStrictEqual(recorded[0], ['lonsha_memory', 'hello', 1, 2, false, 0, null]); pass++;
console.log('ok: depth=2 → position=1(IN_CHAT), depth=2, scan=false, role=0, filter=null');

writeInjectSlot('lonsha_memory', 'x', 0);
assert.deepStrictEqual(recorded[1], ['lonsha_memory', 'x', 1, 0, false, 0, null]); pass++;
console.log('ok: depth=0 → position=1, depth=0');

writeInjectSlot('lonsha_memory', 'x', 'abc');
assert.equal(recorded[2][3], 0); pass++;
console.log('ok: 非法 depth 容错 → 0');

writeInjectSlot('lonsha_memory_history', 'vol', 9999);
assert.deepStrictEqual(recorded[3], ['lonsha_memory_history', 'vol', 1, 9999, false, 0, null]); pass++;
console.log('ok: 卷摘要 depth=9999 原样通过');

clearInjectSlots();
assert.deepStrictEqual(recorded[4], ['lonsha_memory', '', 1, 0, false, 0, null]); pass++;
assert.deepStrictEqual(recorded[5], ['lonsha_memory_history', '', 1, 9999, false, 0, null]); pass++;
console.log('ok: clearInjectSlots 双槽清空(空串+正常 position)');

const noCtx = new Function('window', 'errLog', harness)({}, () => {});
assert.equal(noCtx.writeInjectSlot('k', 'v', 0), false); pass++;
console.log('ok: setExtensionPrompt 不可用 → false 无异常');

console.log(`\n✓ DF5 测试全过 (${pass} 项)`);
