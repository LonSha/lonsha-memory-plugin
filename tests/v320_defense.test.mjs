// tests/v320_defense.test.mjs
// v3.2 防御包综合测试：DF1 槽位生命周期 / DF2 外部取消 / DF3 op清洗 / DF6 空清除
// 运行: node tests/v320_defense.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ---------- 通用提取器 ---------- */
function braceEnd(src, openBraceIdx) { // 从 '{' 起做大括号配对，返回闭合 '}' 的索引
    let depth = 0;
    for (let i = openBraceIdx; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { // 跳过字符串（含模板串的简化处理）
            const q = ch; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        }
        else if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; } // 行注释
    }
    return -1;
}
function extractFn(name) { // function 声明（4空格缩进），自动带上 async 前缀
    let start = src.indexOf(`async function ${name}(`);
    if (start < 0) start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error('missing fn ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    const end = braceEnd(src, brace);
    if (end < 0) throw new Error('unterminated fn ' + name);
    return src.slice(start, end + 1);
}
function extractMethod(name) { // 类方法（8空格缩进）
    const start = src.indexOf(`        ${name}(`);
    if (start < 0) throw new Error('missing method ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    const end = braceEnd(src, brace);
    if (end < 0) throw new Error('unterminated method ' + name);
    return 'function ' + src.slice(start + 8, end + 1);
}

/* ══════════ DF2: fetchWithTimeoutRetry 外部取消语义 ══════════ */
{
    const code = extractFn('fetchWithTimeoutRetry');
    const make = (mockFetch) => new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout',
        `${code}; return fetchWithTimeoutRetry;`)(mockFetch, AbortController, setTimeout, clearTimeout);

    // a) 外部已取消 → 立即抛「已取消」，fetch 零调用
    {
        let calls = 0;
        const fn = make(async () => { calls++; throw new Error('x'); });
        const ctrl = new AbortController(); ctrl.abort();
        await assert.rejects(() => fn('http://x', {}, { externalSignal: ctrl.signal, retries: 2, label: 'T' }), /已取消/);
        assert.equal(calls, 0);
        ok('DF2a 外部已取消 → 立即抛、零调用');
    }

    // b) fetch 期间外部取消（AbortError）→ 绝不重试（1 次调用即终止）
    {
        let calls = 0;
        const ctrl = new AbortController();
        const fn = make(async () => {
            calls++;
            ctrl.abort(); // 模拟外部取消传播
            const err = new Error('aborted'); err.name = 'AbortError';
            throw err;
        });
        await assert.rejects(() => fn('http://x', {}, { externalSignal: ctrl.signal, retries: 3, label: 'T' }), /已取消/);
        assert.equal(calls, 1);
        ok('DF2b 外部取消不重试（3 次重试机会只调用 1 次）');
    }

    // c) 内部超时 → 重试（慢路径，1.2s 超时×1 重试；验证 2 次调用后放弃）
    {
        let calls = 0;
        const fn = make((url, init) => new Promise((resolve, reject) => {
            calls++;
            // 永不 resolve，靠内部超时 abort（fetch mock 不响应 signal，模拟挂起——但测试要快）
            init.signal?.addEventListener('abort', () => {
                const err = new Error('aborted'); err.name = 'AbortError';
                reject(err);
            });
        }));
        const t0 = Date.now();
        await assert.rejects(() => fn('http://x', {}, { timeoutSec: 1.2, retries: 1, label: 'T' }));
        const dt = Date.now() - t0;
        assert.equal(calls, 2); // 1 次 + 1 次重试
        assert.ok(dt >= 2400, `应经历 2 次超时(1200ms each)+800ms退避, 实测 ${dt}ms`);
        ok(`DF2c 内部超时不带外部信号 → 正常重试 (${dt}ms, 2 次调用)`);
    }
}

/* ══════════ DF3: _sanitizeItemOp 物品 op 清洗 ══════════ */
{
    const code = extractMethod('_sanitizeItemOp');
    const sanitize = new Function('errLog', `${code}; return _sanitizeItemOp;`)(() => {});

    const r1 = sanitize({ action: 'add', name: '  苹果 🍎 ', desc: 'x'.repeat(100), holder: 'y'.repeat(30), state: 'z'.repeat(20), floor: 5 });
    assert.equal(r1.action, 'add');
    assert.equal(r1.name, '苹果 🍎');
    assert.equal(r1.desc.length, 80);
    assert.equal(r1.holder.length, 20);
    assert.equal(r1.state.length, 10);
    assert.equal(r1.floor, 5);
    ok('DF3a 正常 add：字段截断 + trim');

    assert.equal(sanitize({ action: 'delete', name: 'x' }), null);
    assert.equal(sanitize({ action: '', name: 'x' }), null);
    ok('DF3b 非法 action → null（白名单）');

    assert.equal(sanitize({ action: 'add', name: '   ' }), null);
    assert.equal(sanitize(null), null);
    assert.equal(sanitize('str'), null);
    ok('DF3c 空名/非对象 → null');

    const r2 = sanitize({ action: 'update', name: 'ＡＢＣ１２３', floor: -3 });
    assert.equal(r2.name, 'ABC123'); // NFKC 全角归一
    assert.equal(r2.floor, 0);
    assert.ok(!('desc' in r2) || r2.desc === undefined);
    ok('DF3d NFKC 归一 + 负楼层钳制');

    const r3 = sanitize({ action: 'add', name: '水'.repeat(60) });
    assert.equal(r3.name.length, 40);
    ok('DF3e name 超长截断 40');
}

/* ══════════ DF6: 空召回=显式清除（静态断言） ══════════ */
{
    assert.equal((src.match(/if \(injection\)/g) || []).length, 0, '旧「if (injection) 才写槽」模式应绝迹');
    const oc = (src.match(/injection \|\| ''/g) || []).length;
    assert.ok(oc >= 2, `injection || ''（空=清除）应 >= 2 处, 实际 ${oc}`);
    ok('DF6a 空召回显式清除（主路径 + interceptor）');

    assert.ok(/writeInjectSlot\('lonsha_memory_history', this\.engine\.buildVolumeInjection\(\) \|\| '', 9999\)/.test(src)
        || /writeInjectSlot\('lonsha_memory_history', plugin\.engine\.buildVolumeInjection\(\) \|\| '', 9999\)/.test(src),
        '卷摘要槽写入两处存在');
    ok('DF6b 卷摘要槽独立刷新');
}

/* ══════════ DF1: 槽位生命周期（静态断言） ══════════ */
{
    const clearCalls = (src.match(/clearInjectSlots\(\)/g) || []).length;
    assert.ok(clearCalls >= 3, `clearInjectSlots 调用(含定义内) >= 3, 实际 ${clearCalls}`);
    assert.ok(src.includes("errLog(e, 'events.CHAT_CHANGED槽位清空')"), 'CHAT_CHANGED 清空存在');
    ok('DF1 槽位生命周期：CHAT_CHANGED + 停用 + 生成前 三触点');

    assert.ok(src.includes("const INJECT_POSITION_IN_CHAT = 1;") && src.includes("const INJECT_ROLE_SYSTEM = 0;"));
    ok('DF1/DF5 常量：IN_CHAT=1 / ROLE_SYSTEM=0');
}

/* ══════════ DF4/DF5 回归（简明） ══════════ */
{
    assert.ok(src.includes('errors: _errBuf.slice(-15)'), 'DF4 诊断错误裁剪存在');
    ok('DF4 诊断面板错误日志裁剪 ≥15 条');
    assert.equal((src.match(/\.setExtensionPrompt\s*\(/g) || []).length, 1, 'DF5 setExtensionPrompt 收敛为唯一通道');
    ok('DF5 回归：唯一写入通道');
}

console.log(`\n✓ v3.2 防御包综合测试全过 (${pass} 项)`);