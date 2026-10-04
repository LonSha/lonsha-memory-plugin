// 审计基建 D（v3.157）：配置活性扫描 —— 「UI 有控件、引擎无真正消费路径」的死配置
//
// 存在理由：v3.156 审计出 hybridAlpha 是死配置 —— UI 滑杆可见、引擎侧甚至有一段消费代码
//   （`const alpha = this.config.config.hybridAlpha`），但那段代码所在方法 `_legacyHybridMerge`
//   自 v3.50 引入 RRF 后已无任何调用者。
//   这类缺陷逃得过常规「键是否被引用」的扫描（因为代码里确实引用了），
//   只有做「两跳可达性」（键 -> 提及它的方法 -> 该方法是否有调用者）才能抓出来。
//   本脚本即该检查的常驻化。
//
// 判定规则：
//   1. UI 键 = data-cfg / data-cfg-num / data-cfg-text 的取值，以及 ck('KEY' 的调用首参
//   2. 键的「提及」= 该键名在 index.js 中于默认配置块之外的出现（词边界匹配）
//   3. 提及落在某个方法体内 -> 该方法是候选消费路径
//   4. 提及落在方法体外的类体/顶层 -> 视为可到达（说明它在真实代码路径上）
//   5. 若某键的所有提及都落在「无调用者」的方法内 -> 死配置，报错退出 1
// 退出码：0 = 无死配置 / 1 = 发现死配置（阻断 CI）/ 2 = 结构变化导致脚本需同步
import fs from 'fs';
import path from 'path';

/* ---------- 0-a. 扫描面（v3.258.0 A1 第三刀扩面）----------
 * 只读 index.js 的面会让「类已外迁」的消费点凭空消失：v3.258.0 实测 outlinePlanCooldownFloors
 *   的滑杆仍在 UI 上、消费点已随 OutlineDirector 搬到 narrative-generators.js，
 *   而扫描面只取入口 ⇒ 该键被判成「引擎无成员读取形态的消费」（假死配置）。
 * 本仓既有范式（scan_open_faces / scan_inbound_faces / scan_ledger_contract / scan_module_wiring）
 *   一律从 manifest 派生「宿主真正加载的面」，这里与之一致：
 *     面 = manifest.js（入口，**必须排首位**） + manifest.extra_js（按声明顺序）。
 *   入口固定在首位是硬前提：cfgOpen/cfgClose 与「提及是否落在配置块外」的偏移判定
 *   都建立在「faceText 的前缀逐字等于入口」这一条上。
 * 合成树（探针自测夹具）通常只物化 index.js + settings-ui.js、无 manifest.json ⇒
 *   退回单文件面，行为与扩面前逐字一致。 */
const ROOT = process.cwd();
let FACE = ['index.js'];
let ENTRY = 'index.js';
let FACE_SOURCE = 'single-file fallback (no manifest.json)';
try {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    if (mf && typeof mf.js === 'string') ENTRY = mf.js;
    const list = [ENTRY].concat(Array.isArray(mf && mf.extra_js) ? mf.extra_js : []).filter(Boolean);
    if (list.length) { FACE = list; FACE_SOURCE = 'manifest.js + manifest.extra_js'; }
} catch (_e) { /* 无 manifest ⇒ 单文件面 */ }
const faceCode = new Map();
for (const f of FACE) {
    try { faceCode.set(f, fs.readFileSync(path.join(ROOT, f), 'utf8')); }
    catch (_e) { faceCode.set(f, ''); }
}
const idx = faceCode.get(ENTRY) || '';
const faceText = idx + String.fromCharCode(10)
    + FACE.filter((f) => f !== ENTRY).map((f) => faceCode.get(f) || '').join(String.fromCharCode(10));
const faceBytes = faceText.length;
const ui = fs.readFileSync('settings-ui.js', 'utf8');
/* ---------- 0. 结构预检（v3.159 补：此前 UI 侧退化成空文件会报「UI 呈现键 0 / 死配置 0」并 exit 0） ---------- */
// 为什么要有这一段：本脚本的下游全部推理都以「从 UI 里抽到了键」为输入。
//   若 UI 文件退化（空文件 / 结构改名 / 抽取正则失配），键集为空 -> 无键可查 -> 死配置 0 -> 「通过」。
//   这是最危险的失败模式：审计失效的方式是「报告一切正常」。故先验证输入自身在合理区间内，否则 exit 2。
// 例外通道：回归测试会用「人工构造的极小字节”作为探针自测夹具，那些夹具本身就应该越过下限。
//   故只在显式声明「我知道这是夹具」时放行，默认仍严格。
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const MIN_UI_KEYS = FIXTURE_MODE ? 1 : 100;   // 当前实测 144；退化阈值取一半以下，避免正常增删误报
const MIN_UI_BYTES = 20000;
if (!FIXTURE_MODE && (ui.length < MIN_UI_BYTES || !ui.includes('data-cfg'))) {
    console.error('[config-liveness] settings-ui.js 退化（' + ui.length + ' 字节，含 data-cfg=' + ui.includes('data-cfg') + '），无法抽取 UI 配置键，审计脚本需同步结构变化');
    process.exit(2);
}
if (!FIXTURE_MODE && idx.length < 100000) {
    console.error('[config-liveness] index.js 退化（' + idx.length + ' 字节），无法进行可达性分析，审计脚本需同步结构变化');
    process.exit(2);
}
/* v3.258.0 扩面守卫：manifest 声明的模块必须真的读到内容。
 *   语义是「面覆盖了它自称覆盖的文件」，不是「面必须比入口大」—— 后者会在
 *   将来把模块并回入口时误报。夹具模式（合成树无 manifest）下 FACE 只有一个文件，此守卫自动为空集。 */
/* 面派生必须成功：健康树上 manifest 一定在场。若这里退回单文件面（例如 cwd 不对、
 *   manifest.json 被改名），扫描面会静默变窄 —— 正是本脚本头部警告的
 *   「审计失效的方式是报告一切正常」。故非夹具模式下「面里只有入口」即判结构漂移。 */
if (!FIXTURE_MODE && FACE.length < 2) {
    console.error('[config-liveness] 扫描面只抽到入口（' + FACE_SOURCE + '）：manifest 派生失败，'
        + '外迁模块的消费点会假死，本次「无死配置」不具证明力');
    process.exit(2);
}
const emptyMods = FACE.slice(1).filter((f) => (faceCode.get(f) || '').length === 0);
if (!FIXTURE_MODE && emptyMods.length) {
    console.error('[config-liveness] 扫描面缺文件（读到空内容）：' + emptyMods.join(', ')
        + ' —— manifest 声明的模块必须纳入扫描面，否则外迁消费点会假死');
    process.exit(2);
}

/* ---------- 1. 默认配置块 ---------- */
/* [v3.267.0 A1 第七刀] 默认块随 ConfigManager 外移 memory-config.js ⇒ 在**合看面**上定位。
 *   原先读 idx（= ENTRY）：面扩了而定位面没扩，是同一个「坐标面不一致」缺陷的另一半。 */
const CFG_ANCHOR = 'this.config = {' + String.fromCharCode(10);   // 真块是 `{\n`；退路是 `{};`（同行闭合）
const cfgStart = faceText.indexOf(CFG_ANCHOR);
if (cfgStart < 0) {
    console.error('[config-liveness] 未找到 this.config = { 默认配置块，审计脚本需同步结构变化');
    process.exit(2);
}
function braceEnd(text, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) return i; }
    }
    return -1;
}
const cfgOpen = faceText.indexOf('{', cfgStart);
const cfgClose = braceEnd(faceText, cfgOpen);
if (cfgClose < 0) { console.error('[config-liveness] 默认配置块括号不闭合'); process.exit(2); }

/* ---------- 2. UI 呈现的键 ---------- */
const uiKeys = new Set();
for (const m of ui.matchAll(/data-cfg(?:-num|-text)?="([a-zA-Z_][a-zA-Z0-9_]*)"/g)) uiKeys.add(m[1]);
for (const m of ui.matchAll(/\bck\('([a-zA-Z_][a-zA-Z0-9_]*)'/g)) uiKeys.add(m[1]);

/* ---------- 3. 方法区间 ---------- */
const methods = [];
const mre = /^\s{8,20}([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/gm;
let mm;
while ((mm = mre.exec(faceText)) !== null) {
    const name = mm[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name)) continue;
    /* [v3.267.0] 方法区间必须与 mm（faceText 坐标）同面：原写法拿 faceText 的偏移去 idx 里定位，
     *   对模块内成员会静默切出错位区间，进而把「有调用者」判成「无调用者」（假红/假绿双向）。 */
    const open = faceText.indexOf('{', mm.index + mm[0].length - 1);
    const close = braceEnd(faceText, open);
    if (close < 0) continue;
    methods.push({ name, start: open, end: close });
}

/* 方法被视为「被调用」的条件：名字在别处以调用形态出现。
   三种形态分别用不含引号的字符类匹配，避免转义地狱：
     this.name(   ->  'this[.]name\\s*\\('  
     obj.name(    ->  '[.]name\\s*\\('  
     裸 name(     ->  '(?<![A-Za-z0-9_$])name\\s*\\('  
   三者任一命中即视为有调用者（重复计数无害，只判零） */
function callCount(name) {
    let n = 0;
    const e = name.replace(/\$/g, '\\$');
    const a = faceText.match(new RegExp('this[.]' + e + '\\s*\\(', 'g'));
    if (a) n += a.length;
    const b = faceText.match(new RegExp('[.]' + e + '\\s*\\(', 'g'));
    if (b) n += b.length;
    const c = faceText.match(new RegExp('(?<![A-Za-z0-9_$.])' + e + '\\s*\\(', 'g'));
    if (c) n += c.length;
    return n;
}
const noCaller = new Set(methods.filter(mt => callCount(mt.name) <= 1).map(mt => mt.name));

/* ---------- 4. 逐键判定 ---------- */
/* 消费的定义：形如 obj.key 的成员读取。前缀允许标识符尾字符、) 或 ] 以及可选链 ?；
   因此 config.key / cfg.key / config?.key / x['k'].key 都算，
   而 CARD_CFG_KEYS 里的裸字面量 'key' 不算（它不是成员读取）。 */
/* 成员读取就是 .key 形态（源里从不写空格）。不做前缀约束，
   因为约束前缀会误伤 config?.key / cfg.key 等合法写法，得不偿失。 */
function memberReads(key) {
    const re = new RegExp("[.]" + key + "(?![A-Za-z0-9_$])", "g");
    const out = [];
    let m;
    while ((m = re.exec(faceText)) !== null) {
        out.push(m.index);
        if (m.index === re.lastIndex) re.lastIndex++;
    }
    return out;
}

const dead = [];
const reachable = [];
for (const key of [...uiKeys].sort()) {
    const mentions = memberReads(key).filter(pos => !(pos >= cfgOpen && pos <= cfgClose));
    if (mentions.length === 0) { dead.push({ key, why: "引擎无成员读取形态的消费" }); continue; }
    let live = false;
    const owners = new Set();
    for (const pos of mentions) {
        const encl = methods.filter(mt => pos > mt.start && pos < mt.end);
        if (encl.length === 0) { live = true; break; }
        const inner = encl.reduce((x, y) => (x.start > y.start ? x : y));
        owners.add(inner.name);
        if (!noCaller.has(inner.name)) { live = true; break; }
    }
    if (live) reachable.push(key);
    else dead.push({ key, why: "仅被无调用者的方法消费: " + [...owners].join(", ") });
}

if (uiKeys.size < MIN_UI_KEYS) {
    console.error("[config-liveness] 仅抽到 " + uiKeys.size + " 个 UI 配置键（低于下限 " + MIN_UI_KEYS + "），提取器已失效，本次「无死配置」不具证明力");
    process.exit(2);
}
console.log("[config-liveness] 扫描面 " + FACE.length + " 个文件（" + FACE_SOURCE + "，入口 " + ENTRY + " + 模块 " + (FACE.length - 1) + "）/ " + faceBytes + " 字节");
console.log("=== D1 配置活性: UI 呈现键 " + uiKeys.size + " / 可到达 " + reachable.length + " / 死配置 " + dead.length + " ===");
if (dead.length) {
    for (const d of dead) console.log("  x DEAD: " + d.key + "  (" + d.why + ")");
} else {
    console.log("  （无死配置）");
}
console.log("=== D2 无调用者方法（D1 判定的中间量，本身不是错误）: " + noCaller.size + " 个 ===");
console.log("  " + [...noCaller].sort().join(", "));

if (dead.length) {
    console.error("");
    console.error("[config-liveness] 发现 " + dead.length + " 个死配置：UI 有控件但引擎无真正消费路径。");
    console.error("  修法（参照 v3.156 的 hybridAlpha）：要么把消费点接到真实调用路径上，要么删除该控件与配置键。");
    process.exit(1);
}
console.log("");
console.log("[config-liveness] 通过：每个 UI 配置键都至少有一条可到达的消费路径。");
process.exit(0);
