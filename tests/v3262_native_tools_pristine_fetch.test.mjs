// tests/v3262_native_tools_pristine_fetch.test.mjs - v3.260.0
//
// 主题：缝合 AlbusKen/shujuku（数剧）的两个协议面之后的**接线、行为与破坏面**。
//   · native-tools.js —— 原生函数调用协议（工具定义 / 三形态响应累积 / 消息锚定 / 预填充剥离）
//   · pristine-fetch.js —— 绕宿主包装取数（已知标记剥离 → 隐藏同源 iframe → 全局兜底）
//
//   【为什么本档存在】
//     本刀的两件都不是「新功能」，而是**两条既有静默失效路径的补口**：
//       · ★ 协议面：callOpenAI 在 v3.102 归一化之后只 `return norm.content || ''`，
//         tool_calls 被原地丢掉 —— 工具协议写多少遍都到不了调用方。症状是
//         「模型明明发了 tool_calls，插件这边什么都没有」，且不报错。
//       · ★ 取数面：宿主预设脚本（Kemini 伴生面板一类）patch 页面 fetch 后改写生成端点，
//         内部请求被注入或剥改，同样不报错。
//     两条路径的共同形态是「**静默**」：坏了没人知道。故本档不问「文件里有没有这两个模块」，
//     而问「接线是否逐点在场、退路是否同形、破坏之后同一条判据会不会翻红」。
//
//   【判据与负控制跑同一份代码】
//     judgeSlice(idxSrc, modSrc) 是纯函数；A/C 段对磁盘真源码跑它，D 段对**真源码破坏后的副本**
//     跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
//     B 段直接 require 真模块做真执行 —— 判据测的是真实现，不是文本形状。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
/** 版本序（仅本档 V4 当版锚点用）：3.260.0 → 3260000。 */
const vnum = (v) => String(v).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
const IDX = read('index.js');
/* [v3.264.0 A1 第五刀] LLMCaller 已外移 memory-organs.js：本档判据里「取数注入口 / 旧路径 / 三工具消费点 / 轮数钳制」四面均在该模块内，
 *   故对应锚点改读模块（语义一字不改，只换被读的文件）；D 段四条破坏也改打在真源上。 */
const ORG_SRC = read('memory-organs.js');

const NT_SRC = read('native-tools.js');
const PF_SRC = read('pristine-fetch.js');
const SELF = read('tests/v3262_native_tools_pristine_fetch.test.mjs');
const MOD_NT = 'native-tools.js';
const MOD_PF = 'pristine-fetch.js';
/** 本刀两模块的冻结出口面（A 段逐项在场；D 段破坏后必须消失）。 */
const NT_EXPORTS = [
    'MEMORY_TOOL_NAMES', 'MEMORY_TOOL_DEFINITIONS', 'TOOL_THINK_PREFILL', 'USER_PREFILL_CONTENT',
    'normalizeStoredToolCall', 'normalizeModelReply', 'toolArguments', 'toolMessagesFromCalls',
    'openAiToolCalls', 'isJsonPrefillStub', 'dropTerminalJsonPrefill', 'isThinkPrefillStub',
    'anchorToolCalls', 'withThinkPrefill', 'isModelExchangeSequence', 'createAccumulator',
    'absorbChatCompletionEvent', 'finishChatTurn', 'chatTurnFromJson', 'readChatTurn',
];
const PF_EXPORTS = [
    'KNOWN_FETCH_PATCH_MARKERS', 'MAX_UNWRAP_DEPTH', 'PRISTINE_FRAME_ID', 'readRegisteredOriginal',
    'isNativeFetch', 'unwrapKnownPatches', 'resolveFrameFetch', 'toAbsoluteInput',
    'resolvePristineFetch', 'pristineFetch', '__resetFrameForTest',
];

/**
 * 纯判据切片：对「入口源码 + 两模块源码」做静态核对。
 * 返回缺陷清单（空数组 = 通过）。A/C 段与 D 段跑的是同一个它。
 */
function judgeSlice(idxSrc, ntSrc, pfSrc, orgSrcIn) {
    const defects = [];
    const stripped = stripComments(idxSrc);
    // 1) 入口必须真消费两个新模块的全局符号（B4 零容忍面）
    /* [v3.264.0 A1 第五刀] 两个取库口原本都在 LLMCaller 内（`_nativeToolsLib` / `_pristineFetchLib`），
     *   已随该类外移 memory-organs.js：故「谁真消费了这个全局符号」的判据面改为**入口 + 模块**两处合并看。
     *   这不是放宽：符号被真读这件事仍然必须成立，只是消费点从一个文件移到了另一个。 */
    const consuming = stripComments(orgSrcIn || ORG_SRC) + stripped;
    if (!consuming.includes('window.LonShaNativeTools')) defects.push('入口未消费 window.LonShaNativeTools（模块挂载了却无人取用）');
    if (!consuming.includes('window.LonShaPristineFetch')) defects.push('入口未消费 window.LonShaPristineFetch（模块挂载了却无人取用）');
    // 2) 取数注入口必须在场且是「注入优先、全局兜底」形态
    const orgStripped = stripComments(orgSrcIn || ORG_SRC);
    if (!orgStripped.includes('(fetchImpl || fetch)(url')) defects.push('fetchWithTimeoutRetry 缺 (fetchImpl || fetch) 取数注入口（[v3.264.0] 随 LLMCaller 外移）');
    if (!orgStripped.includes('fetchImpl = null')) defects.push('fetchWithTimeoutRetry 缺 fetchImpl 形参默认值（[v3.264.0] 随 LLMCaller 外移）');
    // 3) 分派面：旧路径**定义**必须保留（回落兜底），原生路径必须真读到协议库
    if (!orgStripped.includes('async _callOpenAILegacy(prompt, url, key, model) {')) defects.push('callOpenAI 分派后旧路径 _callOpenAILegacy 定义不在场（失去逐字节回落面）（[v3.264.0] 随 LLMCaller 外移）');
    if (!orgStripped.includes('_nativeToolsLib()')) defects.push('缺 _nativeToolsLib() 取库口（[v3.264.0] 随 LLMCaller 外移）');
    if (!orgStripped.includes('_pristineFetchLib()')) defects.push('缺 _pristineFetchLib() 取库口（[v3.264.0] 随 LLMCaller 外移）');
    if (!orgStripped.includes('_fetchOpts()')) defects.push('缺 _fetchOpts() 传输选项口（[v3.264.0] 随 LLMCaller 外移）');
    // 4) 三工具各有真实消费点（带接收者的调用形态 —— 裸方法名在定义处也在场，故不能按裸名判）
    if (!orgStripped.includes('eng.bm25.search(')) defects.push('search_memory 无消费点（engine.bm25.search 不在场）（[v3.264.0] 随 LLMCaller 外移）');
    if (!orgStripped.includes('eng.summary.addManualSummary(')) defects.push('write_memory 无消费点（engine.summary.addManualSummary 不在场）（[v3.264.0] 随 LLMCaller 外移）');
    if (!orgStripped.includes('eng.vector.search(')) defects.push('vector_search 无消费点（engine.vector.search 不在场）（[v3.264.0] 随 LLMCaller 外移）');
    // 4b) 取库口必须被真调用（只定义不调用 = 协议库取来不用，静默退回文本路径）
    if (!orgStripped.includes('const NT = this._nativeToolsLib();')) defects.push('callOpenAI 未真调用 _nativeToolsLib()（协议库取来不用）（[v3.264.0] 随 LLMCaller 外移）');
    // 5) 模块侧：IIFE 双导出 + 全局挂载名
    for (const [src, g, tag] of [[ntSrc, 'LonShaNativeTools', MOD_NT], [pfSrc, 'LonShaPristineFetch', MOD_PF]]) {
        if (!src.includes('global.' + g + ' = api')) defects.push(tag + ' 未挂载全局 ' + g);
        if (!src.includes('module.exports = api')) defects.push(tag + ' 缺 CommonJS 双导出');
    }
    // 6) 协议边界三纪律必须在场（缺一条即静默失效）
    if (!ntSrc.includes('不得包含文本协议 action')) defects.push('native-tools 缺 action 字段拒绝（文本协议边界）');
    if (!ntSrc.includes('ID 或函数名无效、或 ID 重复')) defects.push('native-tools 缺调用 ID 去重');
    if (!ntSrc.includes('tool_call_id')) defects.push('native-tools 缺 tool 回执编号锚定面');
    // 7) 取数三段解析必须在场
    if (!pfSrc.includes('__keminiAntiTruncation__')) defects.push('pristine-fetch 缺已知拦截器标记');
    if (!pfSrc.includes('[native code]')) defects.push('pristine-fetch 缺原生判定（[native code]）');
    if (!pfSrc.includes('lonsha-pristine-fetch-frame')) defects.push('pristine-fetch 缺专用隐藏 iframe 兜底');
    return defects;
}

/* ========== A 模块面：出口清单冻结 + 静态判据（对磁盘真源码） ========== */
test('v3262 A. 模块面：出口清单冻结 + 双导出 + 静态判据', async () => {
    const M = (await import('../native-tools.js')).default;
    const P = (await import('../pristine-fetch.js')).default;
    for (const k of NT_EXPORTS) assert.ok(k in M, 'native-tools 出口须在场: ' + k);
    for (const k of PF_EXPORTS) assert.ok(k in P, 'pristine-fetch 出口须在场: ' + k);
    assert.deepEqual(Object.keys(M).sort(), [...NT_EXPORTS].sort(), 'native-tools 出口面须与冻结清单逐项一致');
    assert.deepEqual(Object.keys(P).sort(), [...PF_EXPORTS].sort(), 'pristine-fetch 出口面须与冻结清单逐项一致');
    assert.deepEqual(M.MEMORY_TOOL_NAMES, ['search_memory', 'write_memory', 'vector_search'], '工具名冻结');
    assert.equal(M.MEMORY_TOOL_DEFINITIONS.length, 3, '工具定义 3 条');
    for (const d of M.MEMORY_TOOL_DEFINITIONS) {
        assert.equal(d.type, 'function');
        assert.equal(d.function.parameters.additionalProperties, false, d.function.name + ' 参数须闭合（additionalProperties:false）');
    }
    assert.deepEqual(P.KNOWN_FETCH_PATCH_MARKERS, ['__keminiAntiTruncation__', '__keminiFetchInterceptor__'], '已知标记冻结');
    assert.equal(P.MAX_UNWRAP_DEPTH, 16, '包装链深度上限');
    const defects = judgeSlice(IDX, NT_SRC, PF_SRC);
    assert.deepEqual(defects, [], '静态判据须零缺陷，实为: ' + JSON.stringify(defects));
});

/* ========== B 行为面：真模块真执行 ========== */
test('v3262 B. 行为面：三形态累积器 + 锚定 + 预填充 + 校验 + 取数三段', async () => {
    const M = (await import('../native-tools.js')).default;
    const P = (await import('../pristine-fetch.js')).default;
    // B1 OpenAI 流式分片（arguments 跨帧拼接）
    const s1 = M.createAccumulator();
    M.absorbChatCompletionEvent(s1, { choices: [{ delta: { content: 'A', tool_calls: [{ index: 0, id: 'c1', function: { name: 'search_memory', arguments: '{"que' } }] } }] });
    M.absorbChatCompletionEvent(s1, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"x"}' } }] } }] });
    const t1 = M.finishChatTurn(s1);
    assert.equal(t1.content, 'A');
    assert.deepEqual(t1.toolCalls.map((c) => c.id), ['c1']);
    assert.equal(t1.toolCalls[0].arguments, '{"query":"x"}', '分片 arguments 须拼接成完整 JSON');
    // B2 Anthropic content_block_start/delta
    const s2 = M.createAccumulator();
    M.absorbChatCompletionEvent(s2, { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't1', name: 'write_memory' } });
    M.absorbChatCompletionEvent(s2, { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"floor":3}' } });
    assert.equal(M.finishChatTurn(s2).toolCalls[0].name, 'write_memory');
    assert.equal(M.finishChatTurn(s2).toolCalls[0].arguments, '{"floor":3}');
    // B3 Gemini parts（函数名剥命名空间前缀；thought:true 不进正文）
    const s3 = M.createAccumulator();
    M.absorbChatCompletionEvent(s3, { candidates: [{ content: { parts: [{ text: '想', thought: true }, { text: '看' }, { functionCall: { name: 'ns:vector_search', args: { query: 'q' } } }] } }] });
    const t3 = M.finishChatTurn(s3);
    assert.equal(t3.content, '看', 'thought 片段不得进正文');
    assert.equal(t3.toolCalls[0].name, 'vector_search', '命名空间前缀须剥除');
    assert.equal(t3.toolCalls[0].id, 'call_0', '空 id 须补 call_N');
    // B4 锚定：连续 assistant 合并保留全部编号 + 孤儿 tool 回执补编号
    const anchored = M.anchorToolCalls([
        { role: 'assistant', content: 'a', tool_calls: [{ id: 'x1', type: 'function', function: { name: 'search_memory', arguments: '{}' } }] },
        { role: 'assistant', content: 'b', tool_calls: [{ id: 'x2', type: 'function', function: { name: 'write_memory', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'x3', content: 'r' },
    ]);
    assert.equal(anchored.length, 2, '连续 assistant 须并成一条');
    assert.deepEqual(anchored[0].tool_calls.map((c) => c.id), ['x1', 'x2', 'x3'], '合并须保留全部编号 + 孤儿回执补编号');
    assert.equal(anchored[0].content, 'a' + NL + NL + 'b');
    // B5 预填充剥离 + 思维链补齐（末条已是 assistant 时不补）
    const stub = '{' + NL + '  "thought": "';
    assert.equal(M.isJsonPrefillStub(stub), true);
    assert.equal(M.isJsonPrefillStub(stub + 'x"}'), false, '已闭合的 JSON 不得被判为 stub');
    assert.equal(M.dropTerminalJsonPrefill([{ role: 'user', content: 'u' }, { role: 'assistant', content: stub }]).length, 1);
    const wp = M.withThinkPrefill([{ role: 'user', content: 'u' }, { role: 'tool', tool_call_id: 'k', content: 'r' }]);
    assert.equal(wp.length, 3, '末条须补一条思维链预填充');
    assert.equal(wp[wp.length - 1].content, M.TOOL_THINK_PREFILL, '补齐内容须逐字等于模块常量');
    assert.equal(wp[wp.length - 1].content, ' thinking' + NL, '思维链预填充须以尖括号 think 开头（防被当正文）');
    assert.equal(M.withThinkPrefill([{ role: 'user', content: 'u' }, { role: 'assistant', content: 'done' }]).length, 2, '末条已是 assistant 不得再补');
    // B6 协议边界三抛
    assert.throws(() => M.toolArguments([{ id: 'a', name: 'search_memory', arguments: '{"action":"read"}' }]), /action/, '携带文本协议 action 须抛');
    assert.throws(() => M.toolArguments([{ id: 'a', name: 's', arguments: '{}' }, { id: 'a', name: 's', arguments: '{}' }]), /重复/, 'ID 重复须抛');
    assert.throws(() => M.toolArguments([{ id: 'a', name: 's', arguments: '[]' }]), /JSON 对象/, '非对象参数须抛');
    const okArgs = M.toolArguments([{ id: 'a', name: 'search_memory', arguments: '{"query":"q"}' }]);
    assert.equal(okArgs[0].payload.action, 'search_memory', '合法参数须附 action 域供分发器使用');
    // B7 回执序列 + 非流式/流式读取
    const msgs = M.toolMessagesFromCalls('正文', [{ id: 'i1', name: 'search_memory', arguments: '{}' }], ['结果']);
    assert.equal(msgs.length, 2);
    assert.equal(msgs[1].role, 'tool');
    assert.equal(msgs[1].tool_call_id, 'i1');
    const rj = await M.readChatTurn({
        headers: { get: () => 'application/json' },
        json: async () => ({ choices: [{ message: { content: 'hi', tool_calls: [{ id: 'z', type: 'function', function: { name: 'search_memory', arguments: '{"query":"a"}' } }] } }] }),
    }, false);
    assert.equal(rj.turn.content, 'hi');
    assert.equal(rj.turn.toolCalls.length, 1);
    const enc = new TextEncoder();
    const frames = [
        'data: {"choices":[{"delta":{"content":"流"}}]}' + NL + NL,
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"s1","function":{"name":"vector_search","arguments":"{\\"query\\":\\"b\\"}"}}]}}]}' + NL + NL,
        'data: [DONE]' + NL + NL,
    ].map((t) => enc.encode(t));
    let fi = 0;
    const rs = await M.readChatTurn({
        headers: { get: () => 'text/event-stream' },
        body: { getReader: () => ({ read: async () => (fi < frames.length ? { done: false, value: frames[fi++] } : { done: true }), releaseLock: () => {} }) },
    }, true);
    assert.equal(rs.turn.content, '流');
    assert.equal(rs.turn.toolCalls[0].name, 'vector_search', 'SSE 帧须被逐行解析');
    assert.equal(rs.turn.toolCalls[0].arguments, '{"query":"b"}');
    // B8 取数三段：原生直通 / 标记剥离 / iframe 兜底 / 全局兜底
    const g = globalThis;
    const savedFetch = g.fetch;
    try {
        // 原生判定：名字为 fetch 且源码恰为 [native code] 形态。
        //   ★ 样本只能靠 Proxy 造：Function.prototype.toString 读的是**引擎真源码**，
        //   自有 toString 覆盖不了它；而 `new Function('... [native code] ...')` 根本不是合法 JS
        //   （[native code] 不是语句），会直接 SyntaxError。V8 对 Proxy 的 toString 恰返回
        //   "function () { [native code] }"，再把 name 定义成 fetch，即得确定性的「原生形态」样本。
        //   样本须带真实现：Proxy 会把调用转发给 target，target 是空函数的话取数三段就拿到 undefined。
        const nativeTarget = function (input, init) { return { via: 'native', url: input }; };
        const nativeish = new Proxy(nativeTarget, {});
        Object.defineProperty(nativeish, 'name', { value: 'fetch', configurable: true });
        assert.equal(nativeish.name, 'fetch');
        assert.match(Function.prototype.toString.call(nativeish), /\{\s*\[native code\]\s*\}\s*$/);
        assert.equal(P.isNativeFetch(nativeish), true, 'name===fetch 且 [native code] 须判原生');
        assert.equal(P.isNativeFetch(new Function('return function fetch(a,b){ return 1; }')()), false, '真 JS 实现不得判原生');
        assert.equal(P.isNativeFetch(function boundFetch() {}), false, '普通包装函数不得判原生');
        g.fetch = function fetch(u, i) { return { via: 'wrapped' }; };
        P.__resetFrameForTest(null);
        const resolved = P.resolvePristineFetch({});
        assert.equal(resolved, g.fetch, '未知包装且无 DOM 时须回退全局（不阻断）');
        // 段 1：已知标记剥离后是原生 → 走剥离结果
        const wrapped = function fetch(u, i) { return { via: 'patched' }; };
        wrapped.__keminiFetchInterceptor__ = { original: nativeish };
        g.fetch = wrapped;
        const unwrapped = P.unwrapKnownPatches(g.fetch);
        assert.equal(unwrapped, nativeish, '已知标记须被剥离到原函数');
        assert.equal(P.readRegisteredOriginal(wrapped), nativeish);
        // 段 3：iframe 兜底（注入假文档确定性驱动）
        g.fetch = function fetch(u, i) { return { via: 'patched-again' }; };
        const fakeFrameWindow = { fetch: nativeish };
        const fakeDoc = {
            getElementById: () => null,
            createElement: () => ({ setAttribute() {}, style: {}, get contentWindow() { return fakeFrameWindow; } }),
            body: { appendChild() {} },
            baseURI: 'https://example.com/chat',
        };
        P.__resetFrameForTest(null);
        const viaFrame = P.resolvePristineFetch({ _doc: fakeDoc });
        const out = viaFrame('/api/x', {});
        assert.equal(out.via, 'native', '无 DOM 路径失败时须改用专用 iframe 的原生 fetch');
        assert.equal(out.url, 'https://example.com/api/x', '相对地址须按宿主文档解析为绝对地址');
        assert.equal(P.PRISTINE_FRAME_ID, 'lonsha-pristine-fetch-frame');
    } finally {
        g.fetch = savedFetch;
    }
});

/* ========== C 接线面：入口消费点与配置/UI/自检 ========== */
test('v3262 C. 接线面：六处接线 + 三配置键 + 面板 + 自检行 + 加载序', () => {
    const mf = JSON.parse(read('manifest.json'));
    for (const m of [MOD_NT, MOD_PF]) {
        assert.equal(mf.extra_js.filter((f) => f === m).length, 1, m + ' 须在 extra_js 恰好 1 次');
        assert.ok(mf.extra_js.includes(m), m + ' 须在 extra_js 内');
    }
    // 末项 frontier 守卫已交棒后续版本（v3.261.0 起末项是 archive-audit.js）：本档只守「仍在册」。
    assert.ok(mf.extra_js.includes(MOD_PF) && mf.extra_js.includes(MOD_NT), '本刀两模块须仍在 extra_js 内（末项守卫已移交后续版本）');
    // 三配置键 + 默认值
    assert.match(IDX, /pristineFetchEnabled:\s*true/, 'pristineFetchEnabled 默认须为 true（纯传输层防御）');
    assert.match(IDX, /nativeToolExtractEnabled:\s*false/, 'nativeToolExtractEnabled 默认须为 false（实验）');
    assert.match(IDX, /nativeToolMaxRounds:\s*3/, 'nativeToolMaxRounds 默认须为 3');
    // 面板两行（settings-ui）
    const UI = read('settings-ui.js');
    assert.ok(UI.includes("ck('pristineFetchEnabled'"), 'settings-ui 缺 pristineFetchEnabled 控件');
    assert.ok(UI.includes("ck('nativeToolExtractEnabled'"), 'settings-ui 缺 nativeToolExtractEnabled 控件');
    // [v3.261.0 补] nativeToolMaxRounds 当时只有「默认值在场」断言，没有「可达性」断言 ——
    //   于是它成了死声明（引擎读了、面板调不到、白名单也没有），v3161 [1] 报红才发现。
    //   本档补上：三配置键里凡是被引擎读取的，都必须有一条可设置路径。
    assert.ok(UI.includes('data-cfg-num="nativeToolMaxRounds"'), 'settings-ui 缺 nativeToolMaxRounds 控件（旋钮不可达 = 死声明）');
    const WL = (IDX.match(/const CARD_CFG_KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
    for (const k of ['pristineFetchEnabled', 'nativeToolExtractEnabled', 'nativeToolMaxRounds']) {
        assert.ok(UI.includes(k) || WL.includes("'" + k + "'"), k + ' 须至少有一条可设置路径（UI 控件或卡白名单）');
    }
    // 自检行（四态可分）
    assert.ok(IDX.includes("'原生工具回合'"), 'selfCheck 缺「原生工具回合」一栏');
    assert.ok(IDX.includes('_nativeToolLedger'), 'selfCheck 须读 _nativeToolLedger 台账');
    // 传输注入口接线：两处消费点（旧路径 + 原生回合）都须带 _fetchOpts
    assert.ok((stripComments(ORG_SRC).match(/_fetchOpts\(\)/g) || []).length >= 3, '_fetchOpts 须在定义之外至少 2 处消费（旧路径 + 原生回合）[v3.264.0 随 LLMCaller 外移]');
    // 轮数钳制
    assert.ok(ORG_SRC.includes('Math.min(5, Math.floor(n))'), '轮数上限须钳 1~5 [v3.264.0 随 LLMCaller 外移]');
    // 基线与本档同源
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '基线行数须等于真 index.js 行数');
    assert.ok(b.rebuilds[b.measured_at], '当版须在 rebuilds 面留读数');
    assert.equal(b.rebuilds[b.measured_at].readings.member_count, b.readings.member_count, 'rebuilds 与 readings 同读数');
    // 数量锁已被本刀接管
    const V3209 = read('tests/v3209_migration_registry.test.mjs');
    /* [v3.266.0 交棒] 数量锁已随第六刀上抬到 78（memory-core.js 计入）：本桡只守「数量锁仍以当前值在场」这一交棒形态。 */
assert.ok(/mf\.extra_js\.length === \d+/.test(V3209), 'v3209 数量锁须仍在场（具体值由当版刀口接管，当前接管者：v3266）');
    // 判据面自防护
    assert.ok(SELF.length > 9000, '本套件不得被掏空（当前 ' + SELF.length + ' 字节）');
    assert.ok((SELF.match(/assert\./g) || []).length >= 40, '断言密度须 >= 40，实为 ' + (SELF.match(/assert\./g) || []).length);
    assert.ok(SELF.includes('★'), '关键判据须带 ★ 标记');
});

/* ========== D 真源码破坏负控制（副本上跑同一份判据） ========== */
test('v3262 D. 负控制：真源码破坏后同一条判据必须翻红', () => {
    const cases = [
        // 1) 入口不再消费协议库（B4 零容忍面；锚点取「真取库调用」处 ——
//   模块名在入口出现两次：一次在取库口表达式、一次在自检行，故不能按模块名打点）
        { label: '入口摘除协议库取库口', org: true, anchor: 'const NT = this._nativeToolsLib();', repl: 'const NT = null;', want: /未真调用 _nativeToolsLib\(\)/ },
        // 2) 取数注入口被拿掉（退回直呼全局 fetch）
        { label: '取数注入口被摘', org: true, anchor: '(fetchImpl || fetch)(url, { ...init, signal: ctrl.signal })', repl: 'fetch(url, { ...init, signal: ctrl.signal })', want: /缺 \(fetchImpl \|\| fetch\)/ },
        // 3) 旧路径被删（失去回落面）
        { label: '旧路径 _callOpenAILegacy 被删', org: true, anchor: 'async _callOpenAILegacy(prompt, url, key, model) {', repl: 'async _callOpenAILegacyDELETED(prompt, url, key, model) {', want: /旧路径/ },
        // 4) 三工具之一失去消费点
        { label: 'write_memory 消费点被摘', org: true, anchor: 'eng.summary.addManualSummary(', repl: 'eng.summary.addManualSummaryXXXX(', want: /write_memory 无消费点/ },
        // 5) 协议边界纪律被摘（action 拒绝）
        { label: 'action 拒绝被摘', idx: false, anchor: "不得包含文本协议 action", repl: "不得包含文本协议 ACTIONXXXX", want: /action 字段拒绝/ },
        // 6) 调用 ID 去重被摘
        // ★ 替换串不得**包含**锚点：初版写成「锚点原文 + XXXX」，判据按 includes 比对仍命中，
        //   破坏等于打在判据的观测点上（v3249 记载的「打在空气上」变体）。此处整段换掉。
        { label: 'ID 去重被摘', idx: false, anchor: 'ID 或函数名无效、或 ID 重复', repl: '调用标识缺失或重号（去重纪律被摘）', want: /调用 ID 去重/ },
        // 7) 已知拦截器标记被摘
        { label: '已知标记被摘', idx: false, anchor: '__keminiAntiTruncation__', repl: '__keminiAntiTruncationXXXX__', want: /缺已知拦截器标记/ },
        // 8) 原生判定被摘
        { label: '原生判定被摘', idx: false, anchor: '[native code]', repl: '[native codeXXXX]', want: /缺原生判定/ },
        // 9) 专用 iframe 兜底被摘
        // ★ 同 6)：repl 不得包含锚点，否则 includes 判据仍命中（破坏打在观测点上）
        { label: 'iframe 兜底被摘', idx: false, anchor: 'lonsha-pristine-fetch-frame', repl: 'lonsha-pristine-frame-RENAMED', want: /缺专用隐藏 iframe 兜底/ },
        // 10) 模块全局挂载名被改（双导出面）
        { label: '全局挂载名被改', idx: false, anchor: 'global.LonShaNativeTools = api', repl: 'global.LonShaNativeToolsXXXX = api', want: /未挂载全局 LonShaNativeTools/ },
    ];
    for (const c of cases) {
        // 破坏打在哪一份源码：入口 / 协议模块 / 取数模块（按锚点归属）
        const isOg = c.org === true;
        const isPf = !isOg && (c.anchor.includes('kemini') || c.anchor.includes('native code') || c.anchor.includes('frame') || c.anchor.includes('LonShaPristineFetch'));
        /* [v3.264.0] 第四个归属面：organs（LLMCaller 已外移）。破坏必须打在**真源**上，
         *   否则就是「打在空气上」的假绿（本仓 v3249 记过这个形态）。 */
        const src = isOg ? ORG_SRC : (c.idx ? IDX : (isPf ? PF_SRC : NT_SRC));
        const broken = breakSource(src, c.anchor, c.repl, c.label);
        assert.notEqual(broken, src, c.label + '：破坏须真的改变源码');
        const d = judgeSlice(
            (!isOg && c.idx) ? broken : IDX,
            (!isOg && !c.idx && !isPf) ? broken : NT_SRC,
            (!isOg && !c.idx && isPf) ? broken : PF_SRC,
            isOg ? broken : ORG_SRC,
        );
        const hit = d.some((x) => c.want.test(x));
        assert.ok(hit, c.label + '：破坏后同一条判据必须翻红，实得 ' + JSON.stringify(d));
    }
});

/* ========== E 版本锚 ========== */
test('v3262 E. 版本锚：三源互等 + 本档锁自己的出生版本（不随抬版上抬）', () => {
    // [v3.261.0 交棒] 原文是「硬等号锁当版 3.260.0 + vnum 当版锚点」—— 那是**当版 frontier** 的形态，
    //   抬版后必然翻红（本仓既有口径：历史测试只锁自己那版，下界不承诺未来；
    //   当版锚点由当版套件 v3263 接管）。
    const ver = (IDX.match(/const VERSION = '([0-9.]+)'/) || [])[1];
    assert.equal(ver, JSON.parse(read('manifest.json')).version, 'manifest 版本须与入口同源');
    assert.equal(ver, JSON.parse(read('package.json')).version, 'package 版本须与入口同源');
    assert.ok(vnum(ver) >= vnum('3.260.0'), '本档只在 3.260.0 及以后成立；当前 ' + ver);
    // 抬版不得吞掉上一版节 —— 本仓实测过这个形态：v3.260.0 的顶节重写把 `## v3.259.0` 标题吃掉。
    //   那条不变量与本档同寿（比版本号锚更耐久），故留在这里而不是随抬版消失。
    assert.ok(read('CHANGELOG.md').includes('## v3.260.0'), '★ 抬版不得吞掉 v3.260.0 节标题');
});
