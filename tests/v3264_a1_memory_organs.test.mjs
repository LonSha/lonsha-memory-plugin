// tests/v3264_a1_memory_organs.test.mjs - v3.264.0
//
// 主题：A1 宿主巨兽第五刀 —— 六个「器官级」类（LLMCaller / VectorStore /
//   CharacterMemoryBank / EntityLexicon / WorldProgress / StorageManager）抽为
//   memory-organs.js 之后的**接线、行为、依赖收口与破坏面**。
//
//   【为什么本档存在】
//     前四刀剥的是彼此独立或只共享「书册/时间」簇的类；本刀六个类对**主人模块级符号**
//     有真依赖（errLog / numOr / decayScore / _initEbbingMeta / sanitizeJson / hash32 /
//     fetchWithTimeoutRetry / _moduleLib / VERSION / PLUGIN_NAME /
//     ARCHIVE_TOP_LEVEL_KEYS / ARCHIVE_TOP_LEVEL_KEY_SET / STORAGE_FP_FIELDS）。
//     于是本刀多出两类**只有本刀才有的**风险：
//       · ★ 依赖面被搬散：宿主符号若被一起搬走，host_beast / dead_code 两条读数轴的
//         基线口径就被偷偷改掉（那是「改了尺子还说量准了」）。
//       · ★ 抽取面被掐死：历史套件把类抠进 `new Function` 单独重放（v3147 / v3168 / v320），
//         类内自由标识符一旦无法解析，那些套件**全部当场 ReferenceError**。
//     故本档不问「文件里有没有这个类」，而问「接线是否逐点在场、依赖是否真被注入、
//     副本是否与宿主同源、破坏之后同一条判据会不会翻红」。
//
//   【判据与负控制跑同一份代码】
//     judgeSlice(idxSrc, modSrc) 是纯函数；A 段对磁盘真源码跑它，D 段对**真源码破坏后的副本**
//     跑同一个它。破坏一律走唯一真源 tests/_break_kit.mjs 的 breakSource（锚点须恰中 1 次）。
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
const Q = String.fromCharCode(39);
const MOD_REL = 'memory-organs.js';
const IDX = read('index.js');
const MOD = read(MOD_REL);
const M = (await import('../memory-organs.js')).default;
const SELF = read('tests/v3264_a1_memory_organs.test.mjs');
/** 本刀剥走的六个器官类。 */
const ORGANS = ['LLMCaller', 'VectorStore', 'CharacterMemoryBank', 'EntityLexicon', 'WorldProgress', 'StorageManager'];
/** 宿主实例字段 -> 类名（刻意不同名，故不能按类名推字段名）。 */
const FIELDS = {
    llm: 'LLMCaller', vector: 'VectorStore', charMem: 'CharacterMemoryBank',
    lexicon: 'EntityLexicon', worldProg: 'WorldProgress', storage: 'StorageManager',
};
/** 类成员面（不含 constructor）：退路与真实现按方法名对账，也是「搬完整了没有」的抽样面。 */
const MEMBERS = {
    LLMCaller: ['_eventChainLib', '_nativeToolsLib', '_pristineFetchLib', '_fetchOpts', 'callAPI', 'getLastEventChain', '_callAPIInner', 'rewriteQuery', 'getLastIntent', 'rerank', 'fetchModels', 'callOpenAI', '_callOpenAILegacy', '_callOpenAINative', '_nativeToolMaxRounds', '_dispatchMemoryTools', '_dispatchMemoryTool'],
    VectorStore: ['_calcHashes', 'getEmbedding', 'simpleEmbedding', 'addVector', 'addVectorAuto', 'cosineSimilarity', 'removeByFloor', 'search', '_heatEntry', 'heatByText', 'getCacheStats', 'export', 'import'],
    CharacterMemoryBank: ['_detId', 'addCore', 'addRecent', '_gcCore', 'gc', 'promoteToCore', 'demoteToRecent', 'deleteMemory', 'of', 'search', '_c', 'removeByFloor', 'shiftFloorRefs', 'export', 'import'],
    EntityLexicon: ['normalizeText', '_hitBoundary', 'match', 'resolve', '_register', 'promptRules', 'export', 'import'],
    WorldProgress: ['addPromise', 'checkPromises', 'fulfillPromise', 'resolvePromise', '_knowledgeNet', '_knowledgeTally', 'markUnaware', 'revealKnowledge', 'getReEntryNotice', 'addPlotArc', 'touchArc', 'decayArcs', 'removeByFloor', 'shiftFloorRefs', 'markPending', 'candidates', 'select', 'propose', 'publish', 'discard', 'reconcile', 'generateFromMemory', 'store', 'toInjection', 'export', 'import'],
    StorageManager: ['getRevision', 'setStateIfRevision', 'save', 'load'],
};
/** 依赖收口面：宿主函数符号（模块内各有逐字副本 + bindDeps 活口）。
 *  errLog 是**唯一非逐字**的一份（宿主那份内嵌 43 条错误提示矩阵），故单列在下方判。 */
const VERBATIM_FNS = ['hash32', 'numOr', 'sanitizeJson', 'fetchWithTimeoutRetry', 'decayScore', '_initEbbingMeta', '_moduleLib'];
/** 依赖收口面：宿主常量（逐字副本）。 */
const VERBATIM_CONSTS = ['PLUGIN_NAME', 'VERSION', 'ARCHIVE_TOP_LEVEL_KEYS', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'STORAGE_FP_FIELDS'];
/** bindDeps 的键面（宿主 _bindOrganDeps 必须逐个提供）。 */
const DEP_KEYS = ['errLog', 'numOr', 'decayScore', 'initEbbingMeta', 'sanitizeJson', 'moduleLib', 'fetchWithTimeoutRetry', 'version'];

function classEnd(src, at) {
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return i + 1; }
    }
    return src.length;
}
const CTRL = ['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new'];
const memberRe = (indent) => new RegExp('^ {' + (indent + 4) + '}(?:static\\s+)?(?:async\\s+)?(?:get\\s+|set\\s+)?([A-Za-z_$][\\w$]*)\\s*\\(', 'gm');
const methodNames = (body, indent) => [...body.matchAll(memberRe(indent))].map((m) => m[1]).filter((n) => !CTRL.includes(n));
function methodsOf(src, name) {
    const at = src.indexOf('class ' + name + ' {');
    if (at < 0) return null;
    const indent = at - (src.lastIndexOf(NL, at - 1) + 1);
    return methodNames(src.slice(at, classEnd(src, at)), indent);
}
/** 逐字副本比对：归一化空白后必须完全相同。 */
const nz = (s) => s.replace(/\\s+/g, '');
function fnBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    return src.slice(at, classEnd(src, src.indexOf('{', at)));
}
const ok = (m) => console.log('  \u2713 ' + m);
/** [v3.277.0 O7] 调用点判据（纯函数，A 段与 D 段共用）：注入口必须被真调用两次，且返回值全被读走。
 *  ① 收集点 >= 2：构造期一次 + 模块装载后重绑一次。真实装载顺序是入口先 / extra_js 后，
 *     取库口又刻意惰性 ⇒ 构造期那次必定 module-missing；没有第二次，这个机制在真实顺序下从未生效。
 *  ② 不得有裸语句调用：返回值落空会让「模块缺席 / 模块抛错 / 一个 key 都没对上」三种根因同形为 0。 */
function capturedCalls(tag, fn, src) {
    const here = 'Object.assign({ tag: ' + Q + tag + Q + ' }, ' + fn + '())';
    const collected = src.split(here).length - 1;
    const bare = new RegExp('(?:^|[\n;{}])[ \t]*' + fn + '\(\);').test(src);
    return { collected, bare };
}

/**
 * 真判据体（纯函数，无副作用）。返回问题列表，空数组 = 卫生。
 * A 段与 D 段跑的是**同一个它**。
 */
function judgeSlice(idxSrc, modSrc) {
    const problems = [];
    /* \u2460 \u5bbf\u4e3b\u4e0d\u5f97\u518d\u5185\u8054\u58f0\u660e\uff0c\u6a21\u5757\u5fc5\u987b\u771f\u58f0\u660e\u5b83 */
    for (const name of ORGANS) {
        if (new RegExp('class ' + name + '\\s*\\{').test(idxSrc)) problems.push('index.js \u4ecd\u5185\u8054 ' + name);
        if (!modSrc.includes('class ' + name + ' {')) problems.push(MOD_REL + ' \u7f3a ' + name);
    }
    /* \u2461 \u6784\u9020\u70b9\u9010\u70b9\u5728\u573a\u3001\u6070\u4e00\u6b21\u3001\u63a5\u5728\u5bbf\u4e3b\u5b57\u6bb5\u4e0a */
    for (const [field, name] of Object.entries(FIELDS)) {
        const needle = 'this.' + field + ' = _newMemoryOrgan(' + Q + name + Q;
        const n = idxSrc.split(needle).length - 1;
        if (n !== 1) problems.push('\u6784\u9020\u70b9 ' + needle + ' \u547d\u4e2d ' + n + ' \u6b21\uff08\u987b\u6070 1\uff09');
    }
    /* \u2462 \u53d6\u5e93\u53e3\uff1a\u5177\u540d\u51fd\u6570 + \u771f\u8bfb\u8868\u8fbe\u5f0f */
    if (!/function _memoryOrgansLib\(\)\s*\{/.test(idxSrc)) problems.push('\u7f3a\u5177\u540d\u53d6\u5e93\u53e3 _memoryOrgansLib()');
    if (!idxSrc.includes("_moduleLib(() => window.LonShaMemoryOrgans, '" + MOD_REL + "')")) {
        problems.push('\u53d6\u5e93\u53e3\u4e0d\u662f\u771f\u8bfb\u8868\u8fbe\u5f0f window.LonShaMemoryOrgans');
    }
    /* \u2463 \u7f3a\u5e2d\u9000\u8def + \u7edf\u4e00\u6784\u9020\u70b9 + \u4f9d\u8d56\u6ce8\u5165\u53e3 */
    if (!/class OrganFallback/.test(idxSrc)) problems.push('\u7f3a\u7f3a\u5e2d\u9000\u8def OrganFallback');
    if (!/function _newMemoryOrgan\(name, \.\.\.args\)/.test(idxSrc)) problems.push('\u7f3a\u7edf\u4e00\u6784\u9020\u70b9 _newMemoryOrgan(name, ...args)');
    if (!/function _bindOrganDeps\(\)\s*\{/.test(idxSrc)) problems.push('\u7f3a\u4f9d\u8d56\u6ce8\u5165\u53e3 _bindOrganDeps()');
    /* [v3.277.0 O7] 调用点判据升级：不再查裸语句字面量（O7 已把它改成收集返回值的形态），
     *   改判**返回值真被读出来** —— 修前返回值被丢弃，于是三种根因（模块缺席 / 模块抛错 /
     *   模块在但一个 key 都没对上）同形为 0，没有任何一面能回答「这一轮注进去了没有」。 */
    /* [v3.277.0 O7] 调用点判据（两处 + 无裸语句）：见 capturedCalls 的两条理由。 */
    { const c = capturedCalls('organs', '_bindOrganDeps', idxSrc);
      if (c.collected < 2) problems.push('_bindOrganDeps 的注入读数收集点只有 ' + c.collected + ' 处（须 >= 2：构造期 + 模块装载后重绑）');
      if (c.bare) problems.push('_bindOrganDeps 存在裸语句调用（返回值落空 ⇒ 注入成败不可观察）'); }
    /* \u2464 \u4f9d\u8d56\u9762\uff1a\u6a21\u5757\u5fc5\u987b\u771f\u5bfc\u51fa bindDeps\uff0c\u5bbf\u4e3b\u5fc5\u987b\u9010\u4e2a\u4f9b\u7ed9 */
    if (!/function bindDeps\(deps\)\s*\{/.test(modSrc)) problems.push(MOD_REL + ' \u7f3a bindDeps(deps)');
    const bindBlock = fnBody(idxSrc, 'function _bindOrganDeps() {') || '';
    for (const k of DEP_KEYS) {
        const re = new RegExp('(^|[\\s{,])' + k + '\\s*[:,]');
        if (!re.test(bindBlock)) problems.push('_bindOrganDeps \u672a\u63d0\u4f9b ' + k);
    }
    /* \u2465 \u9000\u8def\u4e0e\u771f\u5b9e\u73b0\u6309\u65b9\u6cd5\u540d\u5bf9\u8d26 */
    problems.push(...fallbackParity(idxSrc, modSrc));
    /* \u2466 \u6210\u5458\u9762\u4e0d\u5f97\u7f29\u6c34 */
    for (const [name, members] of Object.entries(MEMBERS)) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' \u91cc\u5207\u4e0d\u51fa ' + name + '\uff08\u5224\u636e\u81ea\u8eab\u5931\u6548\uff09'); continue; }
        for (const m of members) if (!real.includes(m)) problems.push('\u6a21\u5757 ' + name + ' \u7f3a\u6210\u5458 ' + m);
    }
    /* \u2467 \u9010\u5b57\u526f\u672c\u5fc5\u987b\u4e0e\u5bbf\u4e3b\u540c\u6e90\uff08\u552f\u4e00\u771f\u6e90\u4ecd\u662f\u5bbf\u4e3b\uff09 */
    for (const fn of VERBATIM_FNS) {
        const _raw = fnBody(modSrc, 'let ' + fn + ' = function ' + fn) || fnBody(modSrc, 'let ' + fn + ' = async function ' + fn);
        const modBody = _raw ? _raw.slice(_raw.indexOf('function ')) : null;
        const hostBody = fnBody(idxSrc, 'function ' + fn) || fnBody(idxSrc, 'async function ' + fn);
        if (!modBody) { problems.push(MOD_REL + ' \u7f3a ' + fn + ' \u7684\u9010\u5b57\u526f\u672c'); continue; }
        if (!hostBody) { problems.push('\u5bbf\u4e3b\u7f3a ' + fn + '\uff08\u5224\u636e\u81ea\u8eab\u5931\u6548\uff09'); continue; }
        if (nz(modBody) !== nz(hostBody)) problems.push(MOD_REL + ' \u7684 ' + fn + ' \u526f\u672c\u4e0e\u5bbf\u4e3b\u4e0d\u9010\u5b57\u540c\u6e90\uff08\u526f\u672c\u5df2\u6f02\u79fb\uff09');
    }
    for (const c of VERBATIM_CONSTS) {
        if (!new RegExp('(const|let)\\s+' + c + '\\s*=').test(modSrc)) problems.push(MOD_REL + ' \u7f3a\u5e38\u91cf\u526f\u672c ' + c);
    }
    /* \u2468 \u6a21\u5757\u81ea\u8eab\u53ea\u51c6\u6709\u53d7\u63a7\u5bbf\u4e3b\u63a5\u89e6\u9762\uff08\u5fc5\u987b\u5728\u5265\u6ce8\u91ca\u526f\u672c\u4e0a\u770b\uff09 */
    const modCode = stripComments(modSrc);
    /* require 只准以「双通道取库」形态出现：每一处 require 都必须在 `typeof require !== 'undefined'` 守卫的同行或下一行内
     *   （宿主也是这个形态：`if (typeof require !== 'undefined') { try { return require(...) } }` → 守卫在上一行）；
     *   裸 require才是模块自长出来的宿主依赖。 */
    const _mLines = stripComments(modSrc).split(NL);
    for (let i = 0; i < _mLines.length; i++) {
        if (!_mLines[i].includes('require(')) continue;
        const _win = [_mLines[i], _mLines[i - 1] || '', _mLines[i - 2] || ''].join(NL);
        if (_win.includes('typeof require')) continue;
        problems.push(MOD_REL + ' 出现未守卫的裸 require(（模块自长的宿主依赖）');
        break;
    }
    if (!modSrc.includes('global.LonShaMemoryOrgans = api')) problems.push(MOD_REL + ' \u7f3a\u5168\u5c40\u5bfc\u51fa\u9762');
    if (!modSrc.includes('module.exports = api')) problems.push(MOD_REL + ' \u7f3a CommonJS \u5bfc\u51fa\u9762');
    /* \u2469 \u53e6\u4e00\u4e2a\u5bbf\u4e3b\u63a5\u89e6\u9762\uff1a\u517c\u5bb9\u6302\u8f7d\u70b9\u5fc5\u987b\u4ee5 getter \u5f62\u6001\u5728\u573a\uff08\u6784\u9020\u671f\u6a21\u5757\u8fd8\u6ca1\u6302\u4e0a\uff09 */
    if (!idxSrc.includes('window.LonShaEntityLexicon')) problems.push('\u517c\u5bb9\u6302\u8f7d\u70b9 window.LonShaEntityLexicon \u4e0d\u5728\u573a\uff08\u5916\u90e8\u811a\u672c/\u5386\u53f2\u5957\u4ef6\u8bfb\u5b83\uff09');
    if (!/defineProperty\(\s*window,\s*'LonShaEntityLexicon'/.test(idxSrc)) problems.push('\u6302\u8f7d\u70b9\u4e0d\u662f getter\uff08\u6784\u9020\u671f\u53d6\u503c\u4f1a\u62ff\u5230 undefined\uff09');
    /* \u246A \u65e7\u7684\u5185\u8054\u964d\u7ea7\u5bf9\u8c61\u5fc5\u987b\u5df2\u6d88\u5931\uff08\u4e24\u4efd\u5b9e\u73b0\u4f1a\u6f02\u79fb\uff09 */
    if (/new \(window\\.LonShaEntityLexicon/.test(idxSrc)) problems.push('lexicon \u4ecd\u8d70\u5185\u8054\u964d\u7ea7\u5bf9\u8c61\uff08\u5e94\u8d70\u7edf\u4e00\u6784\u9020\u70b9\uff09');
    /* \u246B \u4f9d\u8d56\u951a\u70b9\uff1a\u5bbf\u4e3b\u90a3\u4e9b\u7b26\u53f7\u5fc5\u987b\u4ecd\u5728\u5bbf\u4e3b\uff08\u642c\u8d70\u5c31\u662f\u6539\u4e86\u8bfb\u6570\u8f74\u7684\u5c3a\u5b50\uff09 */
    for (const c of VERBATIM_CONSTS) {
        if (c === 'VERSION') continue;
        if (!new RegExp('(const|let)\\s+' + c + '\\s*=').test(idxSrc)) problems.push('\u5bbf\u4e3b\u5df2\u4e22\u5931 ' + c + '\uff08\u4f9d\u8d56\u951a\u70b9\u88ab\u642c\u8d70\uff09');
    }
    for (const fn of ['numOr', 'decayScore', '_initEbbingMeta', 'sanitizeJson', 'hash32', 'fetchWithTimeoutRetry', 'errLog']) {
        if (!new RegExp('(function|let)\\s+' + fn + '\\b').test(idxSrc)) problems.push('\u5bbf\u4e3b\u5df2\u4e22\u5931 ' + fn + '\uff08\u4f9d\u8d56\u951a\u70b9\u88ab\u642c\u8d70\uff09');
    }
    return problems;
}

/** 退路与真实现的方法面必须对得上（真实现有的，退路必须有同名空实现）。 */
function fallbackParity(idxSrc, modSrc) {
    const problems = [];
    const at = idxSrc.indexOf('class OrganFallback');
    if (at < 0) return ['\u9000\u8def\u7c7b\u4f53\u5207\u4e0d\u51fa\u6765\uff08\u5224\u636e\u81ea\u8eab\u5931\u6548\uff09'];
    const fbIndent = at - (idxSrc.lastIndexOf(NL, at - 1) + 1);
    const fbNames = new Set(methodNames(idxSrc.slice(at, classEnd(idxSrc, at)), fbIndent));
    for (const name of ORGANS) {
        const real = methodsOf(modSrc, name);
        if (!real) { problems.push(MOD_REL + ' \u91cc\u5207\u4e0d\u51fa ' + name + '\uff08\u5224\u636e\u81ea\u8eab\u5931\u6548\uff09'); continue; }
        for (const m of real) {
            if (m === 'constructor') continue;
            if (!fbNames.has(m)) problems.push('\u9000\u8def\u7f3a\u65b9\u6cd5 ' + name + '.' + m);
        }
    }
    return problems;
}

/* ========== A 接线逐点在场 ========== */
test('v3264 A. \u63a5\u7ebf\u9010\u70b9\u5728\u573a\uff1a\u5bbf\u4e3b\u4e0d\u5185\u8054 / \u6a21\u5757\u771f\u58f0\u660e\u4e14\u6210\u5458\u9f50 / \u516d\u5904\u6784\u9020\u70b9\u5bf9\u4f4d / \u9000\u8def\u540c\u5f62 / \u4f9d\u8d56\u6536\u53e3', () => {
    const problems = judgeSlice(IDX, MOD);
    assert.deepEqual(problems, [], '\u63a5\u7ebf\u9762\u7f3a\u9677\uff1a' + JSON.stringify(problems));
    ok('\u63a5\u7ebf\u9010\u70b9\u5728\u573a\uff08\u5224\u636e\u4f53\u4e0e D \u6bb5\u8d1f\u63a7\u5236\u540c\u6e90\uff09');
});

/* ========== B \u6a21\u5757\u771f\u52a0\u8f7d + \u884c\u4e3a ========== */
test('v3264 B. \u6a21\u5757\u771f\u52a0\u8f7d\uff1a\u5bfc\u51fa\u516d\u9879 + \u516d\u7c7b\u771f\u6784\u9020 + \u9010\u7c7b\u8bed\u4e49\u62bd\u68c0\uff08\u542b\u72ec\u7acb\u53ef\u7528\u6027\uff09', async () => {
    for (const n of ORGANS) assert.equal(typeof M[n], 'function', n + ' \u987b\u53ef\u6784\u9020');
    assert.equal(typeof M.bindDeps, 'function', 'bindDeps \u987b\u53ef\u771f\u8c03\u7528');
    assert.equal(M.PLUGIN_NAME, (IDX.match(/const PLUGIN_NAME = '([^']*)'/) || [])[1], 'PLUGIN_NAME \u526f\u672c\u987b\u4e0e\u5bbf\u4e3b\u540c\u503c');
    assert.equal(M.VERSION, (IDX.match(/const VERSION = '([^']*)'/) || [])[1], 'VERSION \u526f\u672c\u987b\u4e0e\u5bbf\u4e3b\u540c\u503c');
    /* CharacterMemoryBank\uff1a\u786e\u5b9a\u6027 id / \u4e24\u5c42\u8bb0\u5fc6 / \u8870\u51cf GC / \u6309\u697c\u5220\u9664 */
    const b = new M.CharacterMemoryBank();
    const c1 = b.addCore('\u590f\u6728', '\u590f\u6728\u4e0e\u4e3b\u89d2\u521d\u9047', 1);
    const c1b = b.addCore('\u590f\u6728', '\u590f\u6728\u4e0e\u4e3b\u89d2\u521d\u9047', 1);
    assert.equal(c1.id, c1b.id, '\u786e\u5b9a\u6027 id\uff1a\u540c\u89d2\u8272\u540c\u6587\u672c\u540c\u697c\u5c42\u5e42\u7b49');
    for (let i = 0; i < 4; i++) b.addRecent('\u590f\u6728', 'r' + i, i + 2);
    assert.equal(b.of('\u590f\u6728').recent.length, 3, '\u8fd1\u671f\u4fdd\u7559 3 \u6761\uff08RECENT_KEEP\uff09');
    assert.equal(b.removeByFloor(3), 1, '\u6309\u697c\u5220\u9664\u771f\u7684\u5220\u6389\u4e00\u6761');
    assert.equal(b.shiftFloorRefs(3), 2, '\u52a0\u5220\u540e\u4ecd\u5728\u7684\u4e24\u6761\uff08\u697c\u5c42 4/5\uff09\u771f\u88ab\u4f4d\u79fb\uff08\u5404\u51cf 1\uff09');
    assert.ok(Array.isArray(b.search('\u590f\u6728', '\u521d\u9047')), 'search \u8fd4\u56de\u6570\u7ec4');
    /* EntityLexicon\uff1aNFKC \u5f52\u4e00 / \u8bcd\u8fb9\u754c / \u6761\u6570\u4e0a\u9650 */
    const lx = new M.EntityLexicon({ max: 12 });
    assert.equal(lx.resolve('\u96ea\u72fc\u5251', 1).existed, false, '\u9996\u6b21\u767b\u8bb0\u4e3a\u65b0');
    assert.equal(lx.resolve('\u96ea\u72fc\u5251', 2).existed, true, '\u91cd\u590d\u767b\u8bb0\u547d\u4e2d\u5df2\u6709');
    assert.equal(lx.match('\u4ed6\u62ff\u7740\u96ea\u72fc\u5251').length, 1, 'match \u547d\u4e2d\u672f\u8bed');
    assert.equal(lx.resolve('x', 1), null, '\u5355\u5b57\u62d2\u7edd\u5165\u5178\uff08\u5982\u5b9e\u56de null\uff09');
    assert.ok(lx.promptRules().includes('9l.'), 'promptRules \u771f\u51fa\u89c4\u5219');
    /* VectorStore\uff1a\u53cc hash / \u76f8\u4f3c\u5ea6 / \u5bfc\u5165\u9884\u70ed */
    const vs = new M.VectorStore({ config: { embeddingUrl: '' } });
    const h = vs._calcHashes('\u6587\u672cA', { floor: 1 });
    assert.ok(h.docHash.startsWith('doc_') && h.payloadHash.startsWith('pay_'), '\u53cc hash \u524d\u7f00\u771f\u5728');
    assert.equal(vs.cosineSimilarity([1, 0], [1, 0]), 1, '\u4f59\u5f26\u76f8\u4f3c\u5ea6\u540c\u5411=1');
    assert.equal(vs.getCacheStats().cacheSize, 0, '\u7a7a\u5e93\u7f13\u5b58\u4e3a 0');
    /* \u65e0\u5bc6\u94a5\u65f6\u4e0d\u662f null\uff1a\u8d70\u672c\u5730 simpleEmbedding \u515c\u5e95\uff08\u8be5\u8def\u5f84\u5e94\u8ba1\u5165 _embedDegrade.noKey\uff09\u2014\u2014\u672c\u6761\u53ea\u5b88\u300c\u4e0d\u629b\u3001\u771f\u51fa\u5411\u91cf\u300d\u3002 */
    const _emb = await vs.getEmbedding('\u6587\u672cA');
    assert.ok(Array.isArray(_emb) && _emb.length > 0, '\u65e0\u5bc6\u94a5\u65f6\u9000\u56de\u672c\u5730 simpleEmbedding\uff08\u4e0d\u629b\u3001\u771f\u51fa\u5411\u91cf\uff09');
    assert.equal(typeof vs._embedDegrade, 'object', '\u964d\u7ea7\u5fc5\u6709\u8ba1\u6570\uff08\u8be5\u8def\u5f84\u4e0d\u5f97\u9759\u9ed8\uff09');
    /* WorldProgress\uff1a\u627f\u8bfa\u8d26\u672c / \u552f\u4e00\u547d\u4e2d\u624d\u7ed3 / \u53d1\u5e03\u786e\u8ba4 / \u5bf9\u8d26 */
    const wp = new M.WorldProgress();
    const p1 = wp.addPromise({ character: '\u7231\u4e3d\u4e1d', content: '\u5728\u56fe\u4e66\u9986\u5f52\u8fd8\u5178\u7c4d', deadlineFloor: 15, floor: 5 });
    assert.ok(p1.id.startsWith('prom_'), 'promise id \u524d\u7f00');
    assert.equal(wp.resolvePromise(p1.id, 'fulfilled', 6).status, 'fulfilled', '\u5c65\u7ea6\u6210\u529f');
    assert.equal(wp.resolvePromise(p1.id, 'broken', 7), null, '\u5e42\u7b49\uff1a\u5df2\u4e86\u7ed3\u4e0d\u91cd\u590d\u7ffb\u8f6c');
    wp.propose('A', 1, 'A\u7684\u884c\u52a8', 8);
    assert.equal(Object.keys(wp.active).length, 0, 'propose \u4e0d\u7acb\u5373\u751f\u6548');
    wp.publish();
    assert.equal(Object.keys(wp.active).length, 1, 'publish \u540e\u751f\u6548');
    assert.ok(Array.isArray(wp.toInjection([])), 'toInjection \u8fd4\u56de\u6570\u7ec4');
    assert.equal(typeof wp.export(), 'object', 'export \u8fd4\u56de\u5bf9\u8c61');
    /* StorageManager\uff1a\u4fee\u8ba2\u53f7\u4e50\u89c2\u5e76\u53d1\uff08\u65e0 ST \u4e0a\u4e0b\u6587\u65f6\u5982\u5b9e\u56de false\uff09 */
    const st = new M.StorageManager();
    assert.equal(st.getRevision(), 0, '\u521d\u59cb\u4fee\u8ba2\u53f7 0');
    st._revision = 5;
    assert.equal(st.setStateIfRevision(3, () => {}), false, '\u843d\u540e\u7248\u672c\u88ab\u62d2');
    assert.equal(st.setStateIfRevision(5, () => {}), true, '\u540c\u7248\u672c\u653e\u884c');
    assert.equal((await st.save('c1', { a: 1 })), false, '\u65e0 chatMetadata \u65f6\u5982\u5b9e\u56de false\uff08\u4e0d\u4f2a\u9020\u843d\u76d8\uff09');
    /* LLMCaller\uff1a\u65e0\u5bc6\u94a5/\u65e0\u4e0a\u6e38\u65f6\u5982\u5b9e\u56de null\uff0c\u4e0d\u629b */
    const llm = new M.LLMCaller({ config: { apiProviderCustom: false } });
    assert.equal(llm.getLastIntent(), null, 'INTENT \u521d\u59cb\u4e3a null');
    assert.equal(llm.getLastEventChain(), null, '\u4e8b\u4ef6\u94fe\u521d\u59cb\u4e3a null');
    assert.equal(llm._nativeToolMaxRounds(), 3, '\u9ed8\u8ba4\u8f6e\u6570 3');
    assert.equal(await llm.callAPI('x'), null, '\u65e0\u4e0a\u6e38\u65f6 callAPI \u5982\u5b9e\u56de null');
    ok('\u516d\u7c7b\u771f\u6784\u9020\uff1b\u786e\u5b9a\u6027 id / \u552f\u4e00\u547d\u4e2d / \u4e50\u89c2\u5e76\u53d1 / \u4e24\u5c42\u8bb0\u5fc6 / \u53cc hash / \u8bcd\u5178\u4e0a\u9650 \u5747\u771f\u751f\u6548');
});

/* ========== C \u52a0\u8f7d\u9762\u4e0e\u57fa\u7ebf ========== */
test('v3264 C. \u52a0\u8f7d\u9762\u4e0e\u57fa\u7ebf\uff1amanifest \u6070 1 \u9879\u4e14\u63a5\u7ba1\u672b\u9879 + \u57fa\u7ebf\u8bfb\u6570\u4e0e\u771f\u6587\u4ef6\u540c\u6e90', () => {
    const mf = JSON.parse(read('manifest.json'));
    assert.equal(mf.extra_js.filter((f) => f === MOD_REL).length, 1, MOD_REL + ' \u987b\u5728 extra_js \u6070\u597d 1 \u6b21');
    /* [v3.266.0 交棒] 「谁是末项」属于当版 frontier，随版本移动：第六刀 memory-core.js 已成为末项，
     *   本档只保留「本刀模块仍在 extra_js 内」这一自身不变量；末项断言由 tests/v3266_a1_memory_core.test.mjs 接管。 */
    assert.ok(mf.extra_js.indexOf(MOD_REL) >= 0, MOD_REL + ' 须仍在 extra_js 内（末项断言已交棒 v3266）');
    assert.equal(mf.extra_js[0], 'ledger-entity.js', 'ledger-entity.js \u4ecd\u987b\u5728\u9996\u4f4d\uff08v3.207 \u4e0d\u53d8\u91cf\uff09');
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.readings.total_lines, IDX.split(NL).length, '\u57fa\u7ebf\u884c\u6570\u987b\u7b49\u4e8e\u771f index.js \u884c\u6570');
    assert.ok(b.rebuilds[b.measured_at], '\u5f53\u7248\u987b\u5728 rebuilds \u9762\u7559\u8bfb\u6570');
    assert.equal(b.rebuilds[b.measured_at].readings.member_count, b.readings.member_count, 'rebuilds \u4e0e readings \u540c\u8bfb\u6570');
    assert.ok(b.readings.total_lines < 16000, '\u884c\u6570\u987b\u5df2\u968f\u672c\u5200\u4e0b\u964d\uff08\u5265\u8d70\u524d 17091\uff09\uff0c\u5b9e\u6d4b ' + b.readings.total_lines);
    assert.ok(b.readings.total_lines < 18401, '\u2605 A1 \u4e4b\u540e\u5bbf\u4e3b\u8bfb\u6570\u987b\u59cb\u7ec8\u4f4e\u4e8e A1 \u9996\u5200\u524d\u57fa\u7ebf\uff0818401\uff09');
    ok('manifest \u6070 1 \u9879\u4e14\u5728\u672b\u4f4d\uff1b\u57fa\u7ebf\u884c\u6570/\u6210\u5458\u6570\u4e0e\u771f\u6587\u4ef6\u540c\u6e90\u4e14\u5df2\u4e0b\u964d');
});

/* ========== D \u771f\u6e90\u7801\u7834\u574f -> \u540c\u4e00\u6761\u5224\u636e\u5fc5\u987b\u7ffb\u7ea2 ========== */
test('v3264 D. \u771f\u6e90\u7801\u7834\u574f -> \u540c\u4e00\u6761\u5224\u636e\u5fc5\u987b\u7ffb\u7ea2\uff08\u53d6\u5e93\u53e3 / \u6a21\u5757\u7c7b\u540d / \u6784\u9020\u70b9 / \u9000\u8def\u65b9\u6cd5 / \u4f9d\u8d56\u6ce8\u5165 / \u526f\u672c\u540c\u6e90 / \u6210\u5458\u9762 \u5404\u4e00\u6761\uff09', () => {
    const b1 = breakSource(IDX, "_moduleLib(() => window.LonShaMemoryOrgans, 'memory-organs.js')",
        "_moduleLib(() => window.LonShaMemoryOrgansTYPO, 'memory-organs.js')", 'A1-\u53d6\u5e93\u53e3');
    assert.ok(judgeSlice(b1, MOD).some((p) => p.includes('\u771f\u8bfb\u8868\u8fbe\u5f0f')), '\u53d6\u5e93\u53e3\u8bfb\u9519\u5168\u5c40\u540d\u5fc5\u987b\u7ffb\u7ea2');
    const b2 = breakSource(MOD, 'class EntityLexicon {', 'class EntityLexiconX {', 'A1-\u6a21\u5757\u7c7b\u540d');
    assert.ok(judgeSlice(IDX, b2).some((p) => p.includes('\u7f3a EntityLexicon')), '\u6a21\u5757\u7f3a\u7c7b\u5fc5\u987b\u7ffb\u7ea2');
    const b3 = breakSource(IDX, "this.vector = _newMemoryOrgan('VectorStore', config);", 'this.vector = null;', 'A1-\u6f0f\u63a5\u6784\u9020\u70b9');
    assert.ok(judgeSlice(b3, MOD).some((p) => p.includes("_newMemoryOrgan('VectorStore'")), '\u6f0f\u63a5\u6784\u9020\u70b9\u5fc5\u987b\u7ffb\u7ea2');
    const b4 = breakSource(IDX, '        getRevision() { return 0; }\n', '', 'A1-\u9000\u8def\u7f3a\u65b9\u6cd5');
    assert.ok(judgeSlice(b4, MOD).some((p) => p.includes('\u9000\u8def\u7f3a\u65b9\u6cd5 StorageManager.getRevision')), '\u9000\u8def\u5c11\u4e00\u4e2a\u65b9\u6cd5\u5fc5\u987b\u7ffb\u7ea2');
    /* \u7834\u574f\u5fc5\u987b\u6253\u5728\u89c2\u6d4b\u70b9\u4e0a\uff1a\u76ee\u6807\u662f\u300c\u952e\u9762\u6d88\u5931\u300d\uff0c\u6545\u628a\u952e\u9762\u672c\u8eab\u6362\u6389\u3002 */
    const b5 = breakSource(IDX, '                errLog, numOr, decayScore, sanitizeJson,', '                /* \u4f9d\u8d56\u9762\u88ab\u6458 */', 'A1-\u4f9d\u8d56\u6ce8\u5165\u88ab\u6458');
    assert.ok(judgeSlice(b5, MOD).some((p) => p.includes('\u672a\u63d0\u4f9b')), '\u4f9d\u8d56\u6ce8\u5165\u88ab\u6458\u5fc5\u987b\u7ffb\u7ea2');
    const b6 = breakSource(MOD, 'return (h >>> 0).toString(16).padStart(8, ' + Q + '0' + Q + ');', 'return String(h);', 'A1-\u526f\u672c\u6f02\u79fb');
    assert.ok(judgeSlice(IDX, b6).some((p) => p.includes('\u4e0d\u9010\u5b57\u540c\u6e90')), '\u526f\u672c\u4e0e\u5bbf\u4e3b\u4e0d\u540c\u6e90\u5fc5\u987b\u7ffb\u7ea2');
    const b7 = breakSource(MOD, '    toInjection(knownChars = []) {', '    toInjectionRENAMED(knownChars = []) {', 'A1-\u6210\u5458\u9762\u7f29\u6c34');
    assert.ok(judgeSlice(IDX, b7).some((p) => p.includes('\u7f3a\u6210\u5458 toInjection')), '\u6210\u5458\u9762\u7f29\u6c34\u5fc5\u987b\u7ffb\u7ea2');
    /* [v3.277.0 O7] 新增负控制：调用点改回**裸语句**（返回值被丢弃）必须翻红。 */
    /* 只打掉**一处**收集点即须翻红 —— 这正是「两处」不变量在工作（收集点从 2 掉到 1）。 */
    const b8 = breakSource(IDX,
        '                Object.assign({ tag: ' + Q + 'organs' + Q + ' }, _bindOrganDeps()),' + NL
        + '                Object.assign({ tag: ' + Q + 'core' + Q + ' }, _bindCoreDeps()),   // [v3.266.0] A1 第六刀',
        '                _bindOrganDeps();' + NL
        + '                Object.assign({ tag: ' + Q + 'core' + Q + ' }, _bindCoreDeps()),   // [v3.266.0] A1 第六刀',
        'A1-注入读数被丢');
    assert.ok(judgeSlice(b8, MOD).some((p) => p.includes('收集点只有')), '收集点掉到 1 处必须翻红（否则「两轮」不变量没有观测点）');
    ok('\u4e03\u6761\u771f\u6e90\u7801\u7834\u574f\u5404\u81ea\u88ab\u540c\u4e00\u6761\u5224\u636e\u6293\u5230');
});

/* ========== E \u51fa\u751f\u7248\u672c\u4e0b\u9650\u951a ========== */
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3264 E. \u51fa\u751f\u7248\u672c\u4e0b\u9650\u951a\uff08\u672c\u6863\u51fa\u751f\u5728 3.264.0\uff0c\u5df2\u4e8e 3.266.0 \u4ea4\u68d2\uff09', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.equal(codeVer, JSON.parse(read('manifest.json')).version, 'manifest \u987b\u4e0e\u5165\u53e3\u540c\u6e90');
    assert.equal(codeVer, JSON.parse(read('package.json')).version, 'package \u987b\u4e0e\u5165\u53e3\u540c\u6e90');
    assert.equal(codeVer, M.VERSION, '\u6a21\u5757\u526f\u672c VERSION \u987b\u4e0e\u5165\u53e3\u540c\u6e90\uff08\u5426\u5219 bindDeps \u6ce8\u5165\u524d\u5c31\u5df2\u6f02\u79fb\uff09');
    /* [v3.266.0 交棒] 原句是三条当版**硬锚**（`vnum('3.264.0')` / 数值 3264000 / `startsWith('## v3.264.0')`）。
     *   一抬版就必红，而红的信息量只有「版本变大了」—— 按 v3.203 交棒纪律退回出生版本**下限锚**。
     *   「同源」本身不随版本变化，故三源 / 模块副本四者相等的判据继续保留；
     *   CHANGELOG / TODO 两人读面改按**当前版本**判（不因交棒而放宽）。
     *   当版锚点（V4）已由 tests/v3266_a1_memory_core.test.mjs 接管。 */
    assert.ok(vnum(codeVer) >= vnum('3.264.0'), '入口版本不得回退到本档出生版本之前，当前 ' + codeVer);
    assert.ok(read('CHANGELOG.md').startsWith('## v' + codeVer), 'CHANGELOG 顶节须是当前版本（人读面同源）');
    assert.ok(read('TODO.md').includes('最近更新：v' + codeVer), 'TODO 最近更新须是当前版本');
    ok('三源 + 模块副本四者同源；本档已退回出生版本下限锚（' + codeVer + '）');
});

/* ========== F \u5224\u636e\u9762\u81ea\u9632\u62a4 ========== */
test('v3264 F. \u5224\u636e\u9762\u81ea\u9632\u62a4\uff1a\u5b9e\u73b0\u4f4f\u5728\u672c\u6863 + \u8d70\u552f\u4e00\u7834\u574f\u771f\u6e90 + \u6e05\u5355\u4e0d\u5f97\u7f29\u6c34 + \u8d1f\u63a7\u5236\u951a\u70b9\u7eaf\u5ea6', () => {
    assert.ok(/function judgeSlice\(/.test(SELF), '\u5224\u636e\u4f53\u5fc5\u987b\u4f4f\u5728\u672c\u6863');
    assert.ok(/function fallbackParity\(/.test(SELF), '\u9000\u8def\u5bf9\u8d26\u5fc5\u987b\u4f4f\u5728\u672c\u6863');
    assert.ok(SELF.includes('breakSource') && SELF.includes('./_break_kit.mjs'), '\u7834\u574f\u5fc5\u987b\u8d70\u552f\u4e00\u771f\u6e90');
    assert.equal(ORGANS.length, 6, '\u672c\u5200\u5265\u8d70\u7684\u7c7b\u9762\u4e3a\u516d\u9879\uff0c\u4e0d\u5f97\u7f29\u6c34');
    assert.equal(Object.keys(FIELDS).length, 6, '\u6784\u9020\u70b9\u5bf9\u4f4d\u8868\u4e3a\u516d\u9879');
    assert.equal(Object.keys(MEMBERS).length, 6, '\u6210\u5458\u9762\u5bf9\u8d26\u8868\u4e3a\u516d\u9879');
    const allMemberNames = Object.keys(MEMBERS).reduce((a, k) => a.concat(MEMBERS[k]), []);
    assert.equal(allMemberNames.length, 83, '\u6309\u7c7b\u5206\u522b\u5217\u5408\u8ba1 83 \u9879\uff08\u4e0d\u5f97\u7f29\u6c34\uff09');
    assert.equal(VERBATIM_FNS.length, 7, '\u9010\u5b57\u526f\u672c\u51fd\u6570\u4e03\u9879');
    assert.equal(VERBATIM_CONSTS.length, 5, '\u9010\u5b57\u526f\u672c\u5e38\u91cf\u4e94\u9879');
    assert.equal(DEP_KEYS.length, 8, 'bindDeps \u952e\u9762\u516b\u9879');
    assert.ok(SELF.length > 18000, '\u672c\u6863\u4e0d\u5f97\u88ab\u638f\u7a7a\uff08\u5f53\u524d ' + SELF.length + ' \u5b57\u8282\uff09');
    assert.ok(SELF.includes('read(' + Q + 'index.js' + Q + ')') && SELF.includes('read(MOD_REL)'), '\u771f\u6e90\u5fc5\u987b\u4ece\u78c1\u76d8\u8bfb');
    /* \u8d1f\u63a7\u5236\u951a\u70b9\u7eaf\u5ea6\uff1a\u6bcf\u4e2a\u951a\u70b9\u5b57\u9762\u91cf\u5728\u300c\u5224\u636e\u4f53\u4e0e D \u6bb5\u4e4b\u5916\u300d\u4e0d\u5f97\u591a\u4e8e\u4e00\u5904\u3002
     *   \u53e3\u5f84\u540c v3261\uff1a\u603b\u6570 - \u533a\u5185\u6570 <= 1\uff08\u533a\u5185\u51fa\u73b0\u662f\u5224\u636e\u4f53\u81ea\u5df1\u7684\u4e8b\uff09\u3002 */
    const judgeRegion = SELF.slice(SELF.indexOf('function judgeSlice('), SELF.indexOf('function fallbackParity('));
    const dBlock = SELF.slice(SELF.indexOf("test('v3264 D."), SELF.indexOf('/* ========== E'));
    const inRegion = (a) => judgeRegion.split(a).length - 1 + dBlock.split(a).length - 1;
    for (const [label, anchor, src] of [
        ['\u53d6\u5e93\u53e3', "_moduleLib(() => window.LonShaMemoryOrgans, '" + MOD_REL + "')", IDX],
        ['\u6a21\u5757\u7c7b\u540d', 'class EntityLexicon {', MOD],
        ['\u6784\u9020\u70b9', "this.vector = _newMemoryOrgan('VectorStore', config);", IDX],
        ['\u9000\u8def\u65b9\u6cd5', '        getRevision() { return 0; }', IDX],
        ['\u4f9d\u8d56\u6ce8\u5165', '            const n = MO.bindDeps({', IDX],
    ]) {
        assert.ok(src.includes(anchor), label + ' \u951a\u70b9\u5728\u771f\u6e90\u7801\u91cc\u5fc5\u987b\u5b58\u5728\uff08\u5426\u5219\u8d1f\u63a7\u5236\u662f\u7a7a\u7684\uff09');
        const all = SELF.split(anchor).length - 1;
        assert.ok(all >= 1, label + ' \u951a\u70b9\u5fc5\u987b\u81f3\u5c11\u88ab\u5199\u4e00\u5904');
        assert.ok(all - inRegion(anchor) <= 1, label + ' \u7684\u951a\u70b9\u5b57\u9762\u91cf\u5728\u300c\u5224\u636e\u4f53\u4e0e D \u6bb5\u4e4b\u5916\u300d\u4e0d\u5f97\u591a\u4e8e\u4e00\u5904\uff08\u5b9e\u6d4b ' + (all - inRegion(anchor)) + ' \u6b21\uff09');
    }
    ok('\u5224\u636e\u5b9e\u73b0 / \u7834\u574f\u771f\u6e90 / \u6e05\u5355\u89c4\u6a21 / \u951a\u70b9\u7eaf\u5ea6\u56db\u8005\u81ea\u6d3d');
});
