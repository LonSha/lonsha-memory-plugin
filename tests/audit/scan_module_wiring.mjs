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
import { HOST_MODULES } from '../_audit_lib.mjs';

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
/* [v3.461.0 · L18] 水合表真名核对需要「文件 -> 真实挂载名」映射。
 *   UMD 尾巴的挂载形态是 \`root.X = api\`（root 即 globalThis），与 \`window.X =\` 语义等价，
 *   但 GLOBAL_RE 只认后者 —— 只看 GLOBAL_RE 会把 36 个 R18 引擎的挂载全漏掉，
 *   于是真名核对永远失败、判据退化成全红。这里把 root / Object.assign(root,{..}) 一并收入。 */
const FILE_MOUNT_RE = /(?:window|global|globalThis|self|root)\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)/g;
const ASSIGN_MOUNT_RE = /Object\.assign\(\s*(?:window|global|globalThis|self|root)\s*,\s*\{([\s\S]{0,1500}?)\}\s*\)/g;
const providersByFile = new Map(); // moduleFile -> Set<globalName>
for (const f of loadOrder) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const set = new Set();
    for (const m of code.matchAll(FILE_MOUNT_RE)) {
        const nm = m[1];
        if (/^(LonSha|GraphDiffusion|MemoryVisualizer)/.test(nm)) set.add(nm);
        else if (/(Engine|Ledger|Matrix|Guard|Loop|Rollback|Reconciliation|Diffusion|Sandbox|Funnel|Workbench|Modulator|Exposure|Resilience|Attention|Pruner|Register|Cache|Store)$/.test(nm)) set.add(nm);
    }
    for (const m of code.matchAll(ASSIGN_MOUNT_RE)) for (const n of m[1].matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*[:,]/g)) set.add(n[1]);
    providersByFile.set(f, set);
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
/* [v3.264.0 A1 第五刀] 消费面的真实形态：A1 刀口把类外移后，那些类对其他模块全局符号的 *   消费点**随类一起搬走了**（同一全局作用域、同一插件，仍是真消费）。
 *   若消费面只认入口一个文件，每一刀都会把「真接线」误报成「零消费」——
 *   那是假红，与 B4 想拓的假绿同属「判据量错了对象」。
 *   故把 A1 刀口的模块列为**同族消费载体**（仅限这些：它们是从本文件剥出去的，不是新外部依赖）。 */
/* [v3.266.0 A1 第六刀] 刀口模块又多了 memory-core.js（四个内核数据模型类的消费点随类一同搬过去）。
 *   [v3.267.0 A1 第七刀] memory-config.js 也纳入同族消费载体：ConfigManager 配置/迁移路径随类外移。
 *   同族载体清单必须随每一刀扩面：否则新刀口下的真接线会被误报成「零消费」（假红）。 */
/* [v3.439.0 · L13-O9] 消费面还必须认**独立注册的面板模块**。
 *   `config-effect-registry.js` 挂 `window.LonShaMemoryConfigEffects` 之后，唯一的消费点是
 *   `settings-ui.js` 的 `const configEffects = window.LonShaMemoryConfigEffects` —— 面板模块
 *   从来不在 index.js 里被引用（它是宿主页直接注入的独立脚本），于是 B4 把这条**真接线**
 *   报成「已挂载但零消费」。判据量错了对象，与上面 A1 刀口那串假红同族：
 *   修法是让消费面认这类宿主直挂模块，不是把符号塞进账本（记账会把真接线记成腐烂）。 */
const HOST_FACE_CONSUMERS = ['settings-ui.js'].filter((f) => loadOrder.includes(f));
/* [v3.461.0 · 第十八期接线修复] 消费面必须认**交响编排器**这个真消费宿主。
 *   memory-symphony-orchestrator.js 是 L-O1~L-O9 各引擎的**唯一**调用方，形态为
 *   `typeof LonShaX !== 'undefined' ? LonShaX : require('./x.js')` 的裸守卫三元式 ——
 *   既没有 `window.LonShaX` 文本、也没有 `_winModule('LonShaX')`，于是 19 个**真接线**
 *   被 B4 当场报成「已挂载但零消费」。这与 v3.264（A1 刀口）、v3.301（_winModule 形态）、
 *   v3.439（宿主直挂面板）是同一家族：判据量错了对象。修法是让消费面认第三种形态，
 *   不是把符号塞进账本（记账会把真接线记成腐烂）。 */
const A1_CARRIERS = Array.from(new Set([
    'memory-ledgers.js', 'memory-aux.js', 'narrative-generators.js', 'memory-books.js',
    'memory-organs.js', 'memory-core.js', 'memory-config.js', 'engine-diagnostic-lines.js',
    'engine-report.js', 'engine-recall.js', 'memory-symphony-orchestrator.js',
    ...HOST_MODULES, ...HOST_FACE_CONSUMERS
])).filter((f) => loadOrder.includes(f));
const consumptionCode = [entryCode].concat(
    A1_CARRIERS.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))).join(String.fromCharCode(10));
const referenced = new Set();
for (const m of consumptionCode.matchAll(/\bwindow\s*\.\s*(LonSha[A-Za-z0-9_]*)/g)) referenced.add(m[1]);
/* [v3.301.0 M-O2 第二刀] 消费面必须认**第二种取库形态**：`this._winModule('LonShaX','Y')`。
 *   本刀把七个「构造期直取 window」的点改为惰性取库（构造期读不到、重建期读得到），
 *   若消费面只认 `window.LonShaX` 文本，这三个**真接线**会被 B4 当场误报成「已挂载但零消费」
 *   —— 正是本文件开头点名的假红（「判据量错了对象」）。两条形态都算真消费，非放宽判定。 */
for (const m of consumptionCode.matchAll(/\b_winModule\(\s*['"](LonSha[A-Za-z0-9_]*)['"]/g)) referenced.add(m[1]);
/* [v3.461.0] 第三种取库形态：裸全局守卫三元式
 *   `typeof LonShaX !== 'undefined' ? LonShaX : require('./x.js')`
 *   这是编排器与持久化水合表外的真实消费形态。只认「typeof 后跟符号名」这一处，
 *   不认注释里的同名文本（consumptionCode 已剥注释由 _audit_lib 负责；此处再收紧为
 *   必须紧跟 !== 'undefined' 的比较，防把「只是提了一嘴名字」算成消费）。
 *   假绿风险：本形态要求符号确实被**读出来用**（三元式的真分支），比纯文本命中更严。 */
for (const m of consumptionCode.matchAll(/typeof\s+(LonSha[A-Za-z0-9_]*)\s*!==\s*['"]undefined['"]/g)) referenced.add(m[1]);
/* [v3.461.0] 第四种形态（水合表字符串登记）经实测**不采纳**：
 *   第 3 列是「期望的全局名」，名字写错时它正是缺陷本身 —— 把它当消费，
 *   等于让「取错名」这件事自证为绿（实测：加上该形态后 B4 从 23 降到 3，
 *   代价是 B3 当场冒出 12 个「引用了但无人供给」—— 假绿被挪进了另一条判据）。
 *   正确修法是统一真源：让消费方按模块**真实挂载名**取库，而不是放宽消费面。 */
/* [v3.461.0 · L18 接线闭环] 第四种取库形态：**持久化水合表的字符串登记**
 *   engine-persistence-ops.js 的 v21Engines 表每行形如
 *     ['lonshaXState', '_xState', 'TemporalFlashbulbDilationEngine', 'x.js', 'hydrateState']
 *   恢复存档时按第 3 列的全局名 hydrate —— 这是**真接线**（36 个 R18 引擎的唯一持久化消费点），
 *   但它既无 window.* 文本也无 typeof 守卫，于是 B4 把它报成「已挂载但零消费」。
 *   ★ 为什么不能像前三种形态那样直接 add 进 referenced（本次实测踩过的坑）：
 *     第 3 列写的是「**期望**的全局名」，名字写错时它恰恰就是缺陷本身。若直接当消费计入，
 *     等于让「取错名」自证为绿 —— 实测加上后 B4 从 23 降到 3，代价是 B3 当场冒出 12 个
 *     「引用了但无人供给」：假绿只是被挪进了另一条判据，不是修好。
 *   ★ 收紧口径（三重齐备 + 真名核对）：
 *     ① 一行内同时出现 '_xxxState' 状态槽、全局名字符串、'x.js' 文件名三者；
 *     ② 该行登记的全局名必须**等于该文件真实挂载的全局名**（providersByFile 真名核对），
 *        名字写错时核对失败 -> 仍报 B4，杜绝登记表自证；
 *     ③ 只影响 B4，不进 referenced（不改 B3 引用面）。
 *   一句话：判据只承认「登记名 == 真名」的登记，写错名永远只能报红。 */
const hydrateRegistered = new Set();
for (const line of consumptionCode.split(String.fromCharCode(10))) {
    if (!/'_[A-Za-z0-9]+State'/.test(line)) continue;
    const fm = /'([A-Za-z0-9._-]+\.js)'/.exec(line);
    if (!fm) continue;
    const owner = providersByFile.get(fm[1]);
    if (!owner || owner.size === 0) continue;
    /* 该行的**全部**字符串字面量逐个拿去核对真名：不能只取第一个，
     * 水合表第 1 格是 extKey（lonshaXState）、第 3 格才是全局名，
     * 只取首个字面量会永远错到 extKey 上，判据退化成全红（本次实测踩到）。 */
    for (const q of line.matchAll(/'([A-Za-z_$][A-Za-z0-9_$]*)'/g)) {
        if (owner.has(q[1])) hydrateRegistered.add(q[1]);
    }
}
// index.js 自身产出（同文件内既有赋值）也算供给；[v3.264.0] getter 挂载（defineProperty）同为自产
const selfProvided = new Set();
for (const m of entryCode.matchAll(/\bwindow\s*\.\s*(LonSha[A-Za-z0-9_]*)\s*=/g)) selfProvided.add(m[1]);
for (const m of entryCode.matchAll(/defineProperty\(\s*window\s*,\s*'([A-Za-z0-9_]+)'/g)) selfProvided.add(m[1]);
const unresolved = [...referenced].filter(s => !actuallyProvided.has(s) && !selfProvided.has(s)).sort();

/* ---------- 4. B4：消费面（冻结账本） ---------- */
// 这些模块对外挂载了全局符号，但当前无任何调用点（机制要么已内联在 index.js、
// 要么尚未接线）。它们不是死文件（已被注册、有独立单测），但属于「静默腐烂」区，
// 必须显式记账而不是放任增长。
const UNCONSUMED_LEDGER = [
    // [v3.173] 缝合模块接线面：**账本已清空**。
    //   v3.163 建账时这里冻结了 7 个「已挂载但零消费」的模块（canonical / dependency-closure /
    //   entity-semantic / extraction-cadence / floor-range / npc-ties / turn-reconciler）。
    //   v3.173 把 7 个全部接上真实消费点，故账本清空 —— 从此本判据变成**零容忍**：
    //   任何新挂载却无人消费的模块立即报 B4，不再有「先记账再慢慢接」的缓冲。
    //
    /* [v3.464.0 · L21-O4] 重新建账 1 项，并写明为什么这次必须记账而不是接线。
     * `LonShaFloorFingerprintSelfHealer`（floor-fingerprint-self-healer.js，
     *   computeFingerprint / reanchorEvidence）。
     * 它是怎么暴露的：本版撤掉了它那条**错误的水合登记**（该模块无 createState、无累加状态，
     *   宿主 `_floorFingerprintState` 全仓零赋值点）。撤掉之后它失去「水合表登记」这条豁免，
     *   B4 立刻报「已挂载但零消费」—— 也就是说：**它此前一直被水合登记掩盖着**，
     *   登记本身从来没让任何人真的调用它。
     * 为什么不趁这次接上：接线需要有**真实宿主时机**。它的语义是「楼层文本被编辑/回档后
     *   重新锚定证据」，而本仓当前的编辑/回档路径（importSupersede / 快照环回滚）里
     *   证据锚点走的是 `factVersions` 与 `repairLog`，没有一处能自然落到它头上。
     *   硬塞一个调用点就是 `config-effect-registry.js` 明令禁止的
     *   `do not add a consumer solely to satisfy the audit` —— 那会让本审计从
     *   「防静默腐烂」退化成「防不绿」，是假绿的另一张脸。
     * 故：如实记账（这条记录本身说明「已挂载、零消费、缺时机」），
     *   待真有编辑/回档锚点需求时再接，届时删掉本条即可（本条只是计数凭据，不是永久豁免）。 */
    'LonShaFloorFingerprintSelfHealer',
];
// [v3.173] 清空必须是有凭据的清空：下列 7 个模块是**本版声明已接线**的，必须逐个确认
//   index.js 里真有对它全局符号的引用。否则「删掉引用 + 删掉账本记录」也能让 B4 全绿 ——
//   那正是本审计要堵的假绿形态（账本自证）。
const WIRED_AT_3173 = [
    'LonShaCanonical', 'LonShaDependencyClosure', 'LonShaEntitySemantic',
    'LonShaExtractionCadence', 'LonShaFloorRange', 'LonShaNpcTies', 'LonShaTurnReconciler',
];
const unconsumed = [];
for (const sym of actuallyProvided) {
    if (sym === 'GraphDiffusion' || sym === 'MemoryVisualizer') continue; // 类名经裸标识符消费，下面单独判
    if (selfProvided.has(sym)) continue;                                   // index.js 自产自销
    if (referenced.has(sym)) continue;                                     // 被 index.js 引用
    if (hydrateRegistered.has(sym)) continue;                              // 持久化水合表按真名登记（L18）
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
// v3.173 接线凭据：声明已接线的模块必须在 index.js 里真的被引用（防「删引用+删账本」假绿）
//   夹具模式下 index.js 是合成小文件，不含真实接线，故本判据只在真仓库生效。
const wiredNotConsumed = FIXTURE_MODE ? [] : WIRED_AT_3173.filter(s => !referenced.has(s));

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
for (const s of wiredNotConsumed) {
    defects.push('B4 v3.173 声明已接线的模块全局 ' + s + ' 在 index.js 中已不可见引用（接线被静默摘除，模块退回零消费）');
}

/* ---------- 报告 ---------- */
console.log('=== B 面 模块接线 ===');
console.log('加载顺序 ' + loadOrder.length + ' 个脚本（入口 + extra_js）| 真加载成功 '
    + (loadOrder.length - loadFailures.length) + '/' + loadOrder.length
    + ' | 顶层声明 ' + declOwner.size + ' 个 | 对外全局 ' + actuallyProvided.size + ' 个');
console.log('index.js 引用 window.* 符号 ' + referenced.size + ' 个（自身产出 ' + selfProvided.size + ' 个）| 已挂载未消费 '
    + unconsumed.length + ' 个（账本 ' + UNCONSUMED_LEDGER.length + ' 个）');
console.log('v3.173 接线凭据：声明已接线 ' + WIRED_AT_3173.length + ' 个，其中真被引用 '
    + (WIRED_AT_3173.length - wiredNotConsumed.length) + ' 个');
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
