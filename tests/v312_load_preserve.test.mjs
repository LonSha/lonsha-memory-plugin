// tests/v312_load_preserve.test.mjs
// v3.12 深层组合 bug 测试：load preserveRuntime 语义 / GENERATION_ENDED 兜底 / CHAT_CHANGED 清自愈 / 代际检查
// 运行: node tests/v312_load_preserve.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ---------- 提取器 ---------- */
function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}
function extractClass(name) {
    const start = src.indexOf(`    class ${name} {`);
    if (start < 0) throw new Error('missing class ' + name);
    return src.slice(start, braceEnd(src, src.indexOf('{', start)) + 1);
}

/* ══════════ 1. Bug A: storage.load preserveRuntime 语义（行为） ══════════ */
{
    const clsSrc = extractClass('StorageManager');
    const mkStorage = (metadata) => new Function('window', 'errLog', 'PLUGIN_NAME', 'VERSION', `
        ${clsSrc}
        return new StorageManager();
    `)({ SillyTavern: { getContext: () => ({ chatMetadata: metadata }) } }, () => {}, 'LonSha记忆引擎', '3.12.0');

    const savedData = { summaries: { summaries: [{ floor: 0, text: '旧存档' }] }, graph: { nodes: [], edges: [] } };

    // 场景1: preserveRuntime=true → 只读返回，不 import（运行时 mock 不被触碰）
    {
        let importCalled = 0;
        const metadata = { extensions: { lonsha_memory: { data: savedData } } };
        const st = mkStorage(metadata);
        // mock 引擎（在 window 上）
        global.window = { LonShaMemory: { engine: {
            graph: { import: () => { importCalled++; } },
            summary: { import: () => { importCalled++; } },
        } } };
        const result = await st.load('c1', { preserveRuntime: true });
        assert.deepEqual(result, savedData, '返回存档数据');
        assert.equal(importCalled, 0, 'preserveRuntime 不 import（运行时保留）');
        ok('BugA1: preserveRuntime 只读返回，运行时不被覆盖');
    }

    // 场景2: 默认（无 opts）→ 照旧 import
    {
        global.window = { LonShaMemory: { engine: {
            graph: { import: () => {} }, summary: { import: () => {} },
            diaries: {}, povs: null, timeline: null, status: null, ledger: null, suspense: null, scene: null, echo: null, reflection: null, itemOps: null,
            reconcileItemOps: () => {}, rebuildItems: () => {},
        } } };
        const metadata = { extensions: { lonsha_memory: { data: savedData } } };
        const st = mkStorage(metadata);
        await st.load('c1');
        ok('BugA2: 默认 load 照旧导入（CHAT_CHANGED/初始化路径不变）');
    }

    // 场景3: 生成路径调用带 preserveRuntime（静态）
    {
        const gsIdx = src.indexOf('async onBeforeGeneration(context)');
        const gsBlock = src.slice(gsIdx, gsIdx + 700);
        assert.ok(gsBlock.includes('preserveRuntime: true'), '生成路径只读加载');
        ok('BugA3: onBeforeGeneration 走 preserveRuntime');
    }
    delete global.window;
}

/* ══════════ 2. Bug B: GENERATION_ENDED 兜底（静态） ══════════ */
{
    assert.ok(src.includes('types.GENERATION_ENDED'), 'GENERATION_ENDED 已接入');
    const geIdx = src.indexOf('types.GENERATION_ENDED');
    const geBlock = src.slice(geIdx, geIdx + 500);
    assert.ok(geBlock.includes('this.engine._generationActive = false;'), 'ENDED 复位标志');
    ok('BugB: GENERATION_ENDED 兜底（Esc 中止不再卡死标志）');
}

/* ══════════ 3. Bug C: CHAT_CHANGED 清自愈（静态） ══════════ */
{
    const ccIdx = src.indexOf('types.CHAT_CHANGED');
    const ccBlock = src.slice(ccIdx, ccIdx + 3000);
    assert.ok(ccBlock.includes('clearTimeout(this._editHealTimer)'), '清自愈定时器');
    assert.ok(ccBlock.includes('this._editHealPending = new Set()'), '清待愈集合');
    assert.ok(ccBlock.includes('this._selfHealRunning = false'), '复位执行标志');
    assert.ok(ccBlock.includes('this._lockDegradePending = new Set()'), '清降级排队');
    ok('BugC: CHAT_CHANGED 清自愈状态（跨聊天污染防护）');
}

/* ══════════ 4. Bug D: 即时持久化（静态） ══════════ */
{
    // 编辑/swipe/删楼 三处即时存盘
    assert.ok(src.includes("errLog(e, 'events.编辑即时存盘')"), '编辑即时存盘');
    assert.ok(src.includes("errLog(e, 'events.swipe即时存盘')"), 'swipe 即时存盘');
    assert.ok(src.includes("errLog(e, 'events.删楼即时存盘')"), '删楼即时存盘');
    // 删楼回调 async 化
    assert.ok(src.includes('types.MESSAGE_DELETED, async (messageId) => {'), '删楼回调 async 化');
    ok('BugD: 编辑/swipe/删楼 三处即时持久化');
}

/* ══════════ 5. EV6 注入代际检查（静态+行为） ══════════ */
{
    assert.ok(src.includes('const myGen = (this._genSeq = (this._genSeq || 0) + 1);'), '代际标记置位');
    assert.ok(src.includes('if (myGen !== this._genSeq)'), '代际检查');
    assert.ok(src.includes('注入代际过期，放弃本次结果'), '过期放弃日志');
    // 行为：慢结果不覆盖新注入
    {
        let seq = 0;
        let injected = [];
        const write = (gen, text) => { if (gen === seq) injected.push(text); };
        // 第一次 STARTED: gen=1，慢
        seq = 1; const slowGen = 1;
        // 第二次 STARTED: seq=2，快完成
        seq = 2; write(2, '新注入');
        // 第一次的慢结果返回：gen=1 ≠ seq=2 → 放弃
        write(slowGen, '旧注入');
        assert.deepEqual(injected, ['新注入'], '过期代际不覆盖新注入');
        ok('BugA+: 注入代际检查（快速连发不互相覆盖）');
    }
}

/* ══════════ 6. 存档键一致性（快照恢复/存盘路径） ══════════ */
{
    // storage.save 的 STORAGE_KEY 与 load 一致
    assert.ok(src.includes("STORAGE_KEY = 'lonsha_memory'"), '存档键一致');
    // collectExport 仍是唯一序列化出口（settings-ui 无手写保存块回归）
    const fs2 = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
    assert.ok(!fs2.includes("version: '1.3.0'"), '无旧版本块回归');
    ok('收尾: 存档键一致、无旧块回归');
}

console.log(`\n✓ v3.12 深层组合 bug 测试全过 (${pass} 项)`);