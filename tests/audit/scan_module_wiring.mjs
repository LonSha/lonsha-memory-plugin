// 审计基建 G（v3.163）：模块接线面扫描（加载时冲突 / 符号供给 / 消费面）
// ------------------------------------------------------------
// 为什么存在：
//   manifest.extra_js 里的脚本是作为**经典脚本**（非 ESM）注入宿主页面的，共享同一个
//   全局词法作用域。若两个脚本都在顶层声明同名绑定：
//       modules_combined.js : class GraphDiffusion { … }      （朴素版）
//       graph_algorithms.js : class GraphDiffusion { … }      （增强版）
//   后加载的那个会抛 SyntaxError: Identifier 'GraphDiffusion' has already been declared，
//   **整个文件不执行**。宿主只看到第一个版本的实现，却没有任何报错浮到用户面前
//   （插件自己打印的还是「✓ 图扩散模块已加载」）。
//
//   实测后果（v3.163 修前）：增强版从未加载 —— 稀疏矩阵 PageRank 自适应收敛、
//   DPP 增量采样、多级社区检测、性能埋点全部失效；更要命的是 index.js 调用
//   personalizedPageRank(seeds, hops, topK, pageRankDamping) 的第 4 参被朴素版丢弃，
//   于是「v3.91 审计修复 pageRankDamping 断链」在源码文本上成立、在运行时无效。
//   既有测试只读源码字符串，因此全绿 —— 这正是本审计要堵的假绿通道。
//
// 判定策略（全部基于「真加载」而非文本猜测）：
//   B1 任何两个注册脚本不得在顶层声明同名绑定（静态，带文件归属）
//   B2 按 manifest 顺序把全部脚本灌进同一个隔离上下文，必须零失败（权威）
//   B3 index.js 引用的 window.LonSha* 符号必须由某个注册脚本真实供给，
//      或由 index.js 自身产出（防止拼错符号名导致永久降级为兜底实现）
//   B4 注册脚本对外挂载的全局符号必须被消费（冻结账本，防静默腐烂）
//   B5 结构健康标记 + 每个判定面非零下限（防探测器失效后以全绿通过）
//
// 退出码：0=卫生  1=存在真缺陷（加载失败/符号缺失/新未消费模块）  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import vm from 'node:vm';
import path from 'node:path';

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

/* ---------- 0. 输入与结构预检（fail-closed） ---------- */
const manifestPath = path.join(ROOT, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
    console.error('[module-wiring] 找不到 manifest.json，工作目录可能不对（' + ROOT + '）');
    process.exit(2);
}
let manifest;
try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
    console.error('[module-wiring] manifest.json 解析失败：' + e.message);
    process.exit(2);
}
const entry = manifest.js;
const registered = Array.isArray(manifest.extra_js) ? manifest.extra_js.slice() : [];
// 加载顺序即 manifest 声明顺序：入口先于 extra_js
const loadOrder = [entry, ...registered].filter(Boolean);

const MIN_SCRIPTS = FIXTURE_MODE ? 1 : 20;
const MIN_GLOBALS = FIXTURE_MODE ? 1 : 10;
if (loadOrder.length < MIN_SCRIPTS) {
    console.error('[module-wiring] 只抽到 ' + loadOrder.length + ' 个脚本（脚本数低于下限 ' + MIN_SCRIPTS + '），manifest 抽取器已失效');
    process.exit(2);
}
for (const f of loadOrder) {
    if (!fs.existsSync(path.join(ROOT, f))) {
        console.error('[module-wiring] manifest 注册了不存在的文件：' + f);
        process.exit(1);
    }
}

/* ---------- 1. B1：顶层同名声明（静态，带文件归属） ---------- */
// 判据必须用**花括号深度**而不是「行首列 0」：
//   本仓库的 IIFE 模块内部代码常常不缩进（形如 `const api = {...}` 落在第 0 列），
//   用列 0 判断会把每个模块内部声明都误判成顶层，产生大量假冲突。
//   深度 0 = 真正的顶层；IIFE 内部深度 ≥1。
function stripLiterals(code) {
    let out = '';
    for (let i = 0; i < code.length; i++) {
        const c = code[i], n = code[i + 1];
        if (c === '/' && n === '/') { while (i < code.length && code[i] !== '\n') i++; out += '\n'; continue; }
        if (c === '/' && n === '*') { i += 2; while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) i++; i++; out += ' '; continue; }
        if (c === '"' || c === "'" || c === '`') {
            i++;
            while (i < code.length && code[i] !== c) { if (code[i] === '\\') i++; i++; }
            out += '""';
            continue;
        }
        out += c;
    }
    return out;
}
function topLevelDecls(code) {
    const clean = stripLiterals(code);
    const declRe = /\b(class|function|const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    const found = [];
    let depth = 0, m;
    const marks = [];
    const depthAt = new Int32Array(clean.length + 1);
    for (let i = 0; i < clean.length; i++) {
        const c = clean[i];
        if (c === '{') depth++;
        else if (c === '}') depth = Math.max(0, depth - 1);
        depthAt[i] = depth;
    }
    while ((m = declRe.exec(clean)) !== null) {
        if (depthAt[m.index] === 0) {
            found.push({ kind: m[1], name: m[2], line: clean.slice(0, m.index).split('\n').length });
        }
    }
    return found;
}
const declOwner = new Map(); // name -> [{file,line,kind}]
for (const f of loadOrder) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const d of topLevelDecls(code)) {
        if (!declOwner.has(d.name)) declOwner.set(d.name, []);
        declOwner.get(d.name).push({ file: f, line: d.line, kind: d.kind });
    }
}
const clashes = [];
for (const [name, owners] of declOwner) {
    const files = new Set(owners.map(o => o.file));
    if (files.size > 1) clashes.push({ name, owners });
}

/* ---------- 2. B2：真加载（权威判据） ---------- */
const noop = () => {};
function fakeElement() {
    return new Proxy({}, {
        get: (t, k) => {
            if (k === 'style') return {};
            if (k === 'classList') return { add: noop, remove: noop, toggle: noop, contains: () => false };
            if (typeof k === 'symbol') return undefined;
            if (['appendChild', 'removeChild', 'remove', 'addEventListener', 'removeEventListener',
                'setAttribute', 'getAttribute', 'insertBefore', 'querySelector'].includes(k)) return () => null;
            if (k === 'querySelectorAll') return () => [];
            if (['children', 'childNodes'].includes(k)) return [];
            return undefined;
        },
        set: () => true,
    });
}
function buildSandbox() {
    const ctx = {};
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.self = ctx;
    ctx.console = { log: noop, warn: noop, error: noop, info: noop, debug: noop };
    ctx.document = {
        createElement: fakeElement,
        createTextNode: () => ({}),
        createDocumentFragment: fakeElement,
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
        head: fakeElement(),
        body: fakeElement(),
        documentElement: fakeElement(),
    };
    ctx.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null };
    ctx.performance = { now: () => 0 };
    ctx.setTimeout = () => 0;
    ctx.clearTimeout = noop;
    ctx.setInterval = () => 0;
    ctx.clearInterval = noop;
    ctx.requestAnimationFrame = () => 0;
    ctx.cancelAnimationFrame = noop;
    ctx.navigator = { userAgent: 'audit' };
    ctx.location = { href: 'http://localhost/' };
    ctx.URL = URL;
    ctx.Blob = class {};
    ctx.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });
    ctx.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
    ctx.CustomEvent = class {};
    ctx.Event = class {};
    ctx.SillyTavern = { getContext: () => null, eventSource: { on: noop, off: noop, emit: noop }, libs: {} };
    ctx.addEventListener = noop;
    ctx.removeEventListener = noop;
    return vm.createContext(ctx);
}
const sandbox = buildSandbox();
const loadFailures = [];
for (const f of loadOrder) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try {
        vm.runInContext(code, sandbox, { filename: f });
    } catch (e) {
        loadFailures.push({ file: f, error: e.constructor.name + ': ' + e.message });
    }
}

/* ---------- 3. B3：符号供给面 ---------- */
const GLOBAL_RE = /\b(?:window|global|globalThis|self)\s*\.\s*(LonSha[A-Za-z0-9_]*|[A-Z][A-Za-z0-9]*(?:Diffusion|Visualizer|Engine))\s*=/g;
const provided = new Set();
const providers = new Map(); // symbol -> [file]
for (const f of loadOrder) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of code.matchAll(GLOBAL_RE)) {
        provided.add(m[1]);
        if (!providers.has(m[1])) providers.set(m[1], []);
        if (!providers.get(m[1]).includes(f)) providers.get(m[1]).push(f);
    }
}
// 真加载后再确认一次（静态可能把分支里的赋值也算上）
const actuallyProvided = new Set();
for (const k of Object.keys(sandbox)) {
    if (/^(LonSha[A-Za-z0-9_]*|GraphDiffusion|MemoryVisualizer)$/.test(k)) actuallyProvided.add(k);
}
if (actuallyProvided.size < MIN_GLOBALS) {
    console.error('[module-wiring] 真加载后仅观测到 ' + actuallyProvided.size + ' 个模块全局（低于下限 ' + MIN_GLOBALS + '），沙箱已退化');
    process.exit(2);
}
const entryCode = fs.readFileSync(path.join(ROOT, entry), 'utf8');
const referenced = new Set();
for (const m of entryCode.matchAll(/\bwindow\s*\.\s*(LonSha[A-Za-z0-9_]*)/g)) referenced.add(m[1]);
// index.js 自身产出（同文件内既有赋值）也算供给
const selfProvided = new Set();
for (const m of entryCode.matchAll(/\bwindow\s*\.\s*(LonSha[A-Za-z0-9_]*)\s*=/g)) selfProvided.add(m[1]);
const unresolved = [...referenced].filter(s => !actuallyProvided.has(s) && !selfProvided.has(s)).sort();

/* ---------- 4. B4：消费面（冻结账本） ---------- */
// 这些模块对外挂载了全局符号，但当前无任何调用点（机制要么已内联在 index.js、
// 要么尚未接线）。它们不是死文件（已被注册、有独立单测），但属于「静默腐烂」区，
// 必须显式记账而不是放任增长。
const UNCONSUMED_LEDGER = [
    'LonShaCanonical',        // canonical-stringify.js：index.js 的 _historyFingerprint 手写 FNV，未取值
    'LonShaDependencyClosure',// dependency-closure.js：级联裁剪无调用点
    'LonShaEntitySemantic',   // entity-semantic.js：实体登记表未接入（index.js 另有 EntityLexicon）
    'LonShaExtractionCadence',// extraction-cadence.js：按类型抽取节奏未接线
    'LonShaFloorRange',       // floor-range.js：楼层范围增量追踪未接线
    'LonShaNpcTies',          // npc-ties.js：index.js:378 有同机制内联副本，输出格式已分歧
    'LonShaTurnReconciler',   // turn-reconciler.js：轮次身份仍用 'turn_' + floor
];
const unconsumed = [];
for (const sym of actuallyProvided) {
    if (sym === 'GraphDiffusion' || sym === 'MemoryVisualizer') continue; // 类名经裸标识符消费，下面单独判
    if (selfProvided.has(sym)) continue;                                   // index.js 自产自销
    if (referenced.has(sym)) continue;                                     // 被 index.js 引用
    unconsumed.push(sym);
}
// GraphDiffusion / MemoryVisualizer：仅在确实被某个脚本挂载时，才要求 index.js 消费它
const classConsumed = {};
if (actuallyProvided.has('GraphDiffusion')) {
    classConsumed.GraphDiffusion = /typeof\s+GraphDiffusion|window\.GraphDiffusion/.test(entryCode);
}
if (actuallyProvided.has('MemoryVisualizer')) {
    classConsumed.MemoryVisualizer = /typeof\s+MemoryVisualizer|window\.MemoryVisualizer/.test(entryCode);
}
const newUnconsumed = unconsumed.filter(s => !UNCONSUMED_LEDGER.includes(s));

/* ---------- 判定 ---------- */
const defects = [];
for (const c of clashes) {
    const where = c.owners.map(o => o.file + ':' + o.line).join(' / ');
    defects.push('B1 `' + c.name + '` 被多个注册脚本在顶层声明（' + where + '）：后加载者抛 SyntaxError 整文件不执行，'
        + '前者的实现被静默使用');
}
for (const f of loadFailures) {
    defects.push('B2 ' + f.file + ' 在共享上下文中加载失败 → ' + f.error);
}
for (const s of unresolved) {
    defects.push('B3 index.js 引用了 window.' + s + '，但没有任何注册脚本供给该符号（运行时恒为 undefined，功能静默降级到兜底实现）');
}
for (const [sym, ok] of Object.entries(classConsumed)) {
    if (!ok) defects.push('B3 index.js 未消费全局类 ' + sym);
}
for (const s of newUnconsumed) {
    defects.push('B4 新出现「已挂载但零消费」的模块全局 ' + s + '（机制未接线也未记账，会静默腐烂）');
}

/* ---------- 报告 ---------- */
console.log('=== B 面 模块接线 ===');
console.log('加载顺序 ' + loadOrder.length + ' 个脚本（入口 + extra_js）| 真加载成功 '
    + (loadOrder.length - loadFailures.length) + '/' + loadOrder.length
    + ' | 顶层声明 ' + declOwner.size + ' 个 | 对外全局 ' + actuallyProvided.size + ' 个');
console.log('index.js 引用 window.* 符号 ' + referenced.size + ' 个（自身产出 ' + selfProvided.size + ' 个）| 已挂载未消费 '
    + unconsumed.length + ' 个（账本 ' + UNCONSUMED_LEDGER.length + ' 个）');
console.log('B5 结构健康：' + (defects.length ? '发现 ' + defects.length + ' 项缺陷' : 'ok'));
if (unconsumed.length) {
    console.log('  未消费账本：' + unconsumed.join(', '));
}
if (defects.length) {
    console.error('');
    for (const d of defects) console.error('[module-wiring] ' + d);
    console.error('');
    console.error('[module-wiring] 失败：模块接线面存在 ' + defects.length + ' 项缺陷。');
    process.exit(1);
}
console.log('[module-wiring] 通过：注册脚本零加载冲突、引用符号全部有供给、无新增未消费模块。');
process.exit(0);
