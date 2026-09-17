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

const idx = fs.readFileSync('index.js', 'utf8');
const ui = fs.readFileSync('settings-ui.js', 'utf8');

/* ---------- 1. 默认配置块 ---------- */
const cfgStart = idx.indexOf('this.config = {');
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
const cfgOpen = idx.indexOf('{', cfgStart);
const cfgClose = braceEnd(idx, cfgOpen);
if (cfgClose < 0) { console.error('[config-liveness] 默认配置块括号不闭合'); process.exit(2); }

/* ---------- 2. UI 呈现的键 ---------- */
const uiKeys = new Set();
for (const m of ui.matchAll(/data-cfg(?:-num|-text)?="([a-zA-Z_][a-zA-Z0-9_]*)"/g)) uiKeys.add(m[1]);
for (const m of ui.matchAll(/\bck\('([a-zA-Z_][a-zA-Z0-9_]*)'/g)) uiKeys.add(m[1]);

/* ---------- 3. 方法区间 ---------- */
const methods = [];
const mre = /^\s{8,20}([A-Za-z_$][A-Za-z0-9_$]*)\s*\([^)]*\)\s*\{/gm;
let mm;
while ((mm = mre.exec(idx)) !== null) {
    const name = mm[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name)) continue;
    const open = idx.indexOf('{', mm.index + mm[0].length - 1);
    const close = braceEnd(idx, open);
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
    const a = idx.match(new RegExp('this[.]' + e + '\\s*\\(', 'g'));
    if (a) n += a.length;
    const b = idx.match(new RegExp('[.]' + e + '\\s*\\(', 'g'));
    if (b) n += b.length;
    const c = idx.match(new RegExp('(?<![A-Za-z0-9_$.])' + e + '\\s*\\(', 'g'));
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
    while ((m = re.exec(idx)) !== null) {
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
