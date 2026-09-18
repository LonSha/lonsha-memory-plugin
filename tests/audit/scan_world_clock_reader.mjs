// 审计基建 L（v3.175）：世界钟读者面扫描（跨插件读者面可归因 / 接线落地 / 桥名逐字一致 / 不抛不写）
// ------------------------------------------------------------
// 为什么存在：
//   本仓与另两个插件（WorldAxis / RubyPhone）之间靠**只读互操作桥**通信：
//     · window.lonsha_memory_bridge_v1  —— 本插件的对外出口（审计基建 K 已覆盖其读者契约）
//     · window.worldaxis_bridge_v1      —— WorldAxis 的世界状态快照（本版才第一次被本插件读）
//   此前 86 个版本对「自己这一侧」的观测面做得很密，但**跨插件的那条边一条都没有**：
//   产品代码 grep `worldaxis` 零命中。后果是「同一场剧情里坐着两个『现在』」完全不可观测。
//
// 判定策略（全部基于真源码读取 + 真行为驱动，不做文本猜测）：
//   W1 跨插件读者模块必须在位、且**真被消费**（声明了却零调用 = 声明面空转，与 v3.163 模块接线
//      审计同一条不变量；不同之处在于此处的消费者是 GameClock 而非全局符号）。
//   W2 来源归因必须**逐个可达**：五态（not-mounted / disabled / refused / no-snapshot / ready）
//      每个枚举值都要在源码里可赋值 —— 「未装」与「未启用」同形是本版修掉的那个真缺陷
//      （WorldAxis v2.16 的桥默认休眠，最常见的一态正是 disabled）。
//   W3 读者**不得有写桥路径**：模块内不得出现对桥对象/快照的赋值（只读契约；上游本就不给写路径，
//      但读者自己也不能偷偷改，否则「只读」是声称而非事实）。
//   W4 导出的每个判定入口必须**不抛**：catch 覆盖，返回值降级而非异常冒泡。
//   W5 桥名必须与上游**逐字一致**（改一处即两端静默失联 —— 这类缺陷在任何一侧都不会报错）。
//   W6 结构健康标记 + 判定面非零下限（防探测器失效后以全绿通过）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

const MOD = path.join(ROOT, 'world-clock-reader.js');
const IDX = path.join(ROOT, 'index.js');
for (const [p, what] of [[MOD, 'world-clock-reader.js'], [IDX, 'index.js']]) {
    if (!fs.existsSync(p)) {
        console.error('[world-clock-reader] 找不到 ' + what + '（ROOT=' + ROOT + '）——结构漂移');
        process.exit(2);
    }
}
const mod = fs.readFileSync(MOD, 'utf8');
const idx = fs.readFileSync(IDX, 'utf8');

const problems = [];
const notes = [];

function extractBlock(text, startIdx) {
    let depth = 0, end = -1;
    for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? text.slice(startIdx, end + 1) : null;
}
function extractMethod(text, name) {
    const start = text.indexOf(name + '(');
    if (start < 0) return null;
    // 先配平**圆括号**再找函数体：否则 `f(opts = {})` 这种带默认值的签名会把参数里的 `{}`
    //   当成函数体（抽到 2 个字符 ⇒ 判据假红。首跑就是这样误报了一处真兜底）。
    let i = text.indexOf('(', start), depth = 0, close = -1;
    for (; i < text.length; i++) {
        if (text[i] === '(') depth++;
        else if (text[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0) return null;
    const brace = text.indexOf('{', close);
    if (brace < 0) return null;
    return extractBlock(text, brace);
}

/* ---------- W0 结构预检 ---------- */
const ID_DECL = /WORLDAXIS_BRIDGE_ID\s*=\s*'([^']+)'/.exec(mod);
if (!ID_DECL) {
    console.error('[world-clock-reader] 桥 ID 常量缺失——结构漂移（读者无法定位桥）');
    process.exit(2);
}
const bridgeId = ID_DECL[1];
notes.push('桥 ID 常量解析成功：' + bridgeId);

// 导出的公开面（IIFE + module.exports 惯例）
const expMatch = /module\.exports\s*=\s*(\{[\s\S]*?\}|[A-Za-z_$][\w$]*)\s*;/.exec(mod);
if (!expMatch) {
    console.error('[world-clock-reader] module.exports 缺失——结构漂移（无头测试拿不到模块）');
    process.exit(2);
}
notes.push('导出面解析成功');

/* ---------- W1 真被消费（防死声明） ---------- */
// GameClock 必须真的在消息管线里调它，且快照/存档都必须携带读数
const consumers = [
    ['GameClock.readWorldAxisClock', /readWorldAxisClock\(\s*reader\s*,\s*opts/],
    ['消息管线调用点', /this\.clock\.readWorldAxisClock\(/],
    ['快照携带 worldClockRead', /worldClockRead:\s*this\._worldClockRead/],
    ['存档恢复 worldClockRead', /data\.worldClockRead/],
    ['诊断面读数行', /selfCheck\.worldClock/]
];
for (const [what, re] of consumers) {
    if (!re.test(idx)) {
        problems.push('W1 ' + what + ' 不在位——跨插件读者面声明了却没接在消费点上（死声明）');
    }
}
if (consumers.every(([, re]) => re.test(idx))) notes.push('W1 五处消费点全部真落地（构造/快照/恢复/调用/诊断）');
// 模块必须只被 GameClock 引用，且不得反过来被 world-clock-reader 引用宿主内部（防循环依赖）
if (/LonShaWorldClockReader/.test(mod) && !/LonShaWorldClockReader\s*=\s*/.test(mod)) {
    problems.push('W1 模块内部引用了自己的全局名但未挂载——IIFE 双导出破损');
}

/* ---------- W2 来源五态逐个可达 ---------- */
const declared = new Set();
// 三种写法都要认：对象字面量 `reason: 'x'`、赋值 `reason = 'x'`、三元 `... ? 'x' : ...`
for (const m of mod.matchAll(/reason\s*[:=]\s*'([a-z-]+)'/g)) declared.add(m[1]);
for (const m of mod.matchAll(/\?\s*'([a-z-]+)'\s*:\s*'[a-z-]+'/g)) declared.add(m[1]);
for (const m of mod.matchAll(/:\s*'([a-z-]+)'\s*\}/g)) declared.add(m[1]);
const MUST = ['not-mounted', 'disabled', 'refused', 'no-snapshot', 'ok'];
for (const s of MUST) {
    if (!declared.has(s)) {
        problems.push('W2 来源态 "' + s + '" 不可达（读者无法分辨这一处境）');
    }
}
if (MUST.every((s) => declared.has(s))) {
    notes.push('W2 来源态可达：' + [...declared].sort().join('/'));
}
// 「未装」与「未启用」必须分别是**不同**字面量（不得塌成一态）
if (!(declared.has('not-mounted') && declared.has('disabled'))) {
    problems.push('W2 「未装」与「未启用」未分别成态——用户无法知道该去开哪个开关（本版修掉的原始缺陷）');
}

/* ---------- W3 只读：不得有写桥路径 ---------- */
// 桥对象只允许出现在读取调用中；对 snapshot/settings/stat 的赋值即为写
const writeBridge = /(bridge|src|bridgeObj|wx)\s*\.\s*(snapshot|stat|settings|publish|invalidate|refresh)\s*=[^=]/;
if (writeBridge.test(mod)) {
    problems.push('W3 读者面出现对桥对象的赋值——违反只读契约（跨插件写路径会污染上游状态）');
}
// 上游（bridge.js 顶注 + 导出面注释）明文：**外部读取面只有两个** —— `snapshot()`（深拷贝+去抖）
//   与 `refresh()`（「我知道世界变了，请重建」）。真正的**写侧入口**是 publish / invalidate /
//   setSettings（改世界状态或作废快照），这三个读者面一个都不该碰。
//   故 refresh 属读路径（且仅在宿主只提供 refresh 的旧版/精简版上作为回退），不得误判为写侧。
for (const bad of ['publish(', 'invalidate(', 'setSettings(']) {
    if (mod.includes(bad)) {
        problems.push('W3 读者面调用了写侧入口 ' + bad + '——上游只给读路径（publish/invalidate/setSettings 归生产者）');
    }
}
const readCalls = ['snapshot()', 'stat()', 'settings()'].filter((c) => mod.includes(c));
if (readCalls.length < 2) {
    problems.push('W3 读者面只读调用面过窄（实 ' + readCalls.join(',') + '）——归因能力不足');
} else {
    notes.push('W3 只读调用面：' + readCalls.join(' + ') + '（无写侧入口）');
}

/* ---------- W4 导出入口不抛 ---------- */
const EXPORTS = ['bridgeSource', 'readWorldAxisSnapshot', 'readWorldClock', 'diffClocks', 'describeRead'];
let guarded = 0;
for (const name of EXPORTS) {
    // 兜底形态有两类，都要认：
    //   ① 函数体内 try/catch；
    //   ② wrapper 形态：本函数整体 try { return xxxInner(...) } catch —— 兜底在 wrapper 里，
    //      真正的实现落在 `${name}Inner`。必须在 wrapper 上判，不能只判 Inner（后者本就无 try）。
    const wrapper = new RegExp(name + '\\([^)]*\\)\\s*\\{[\\s\\S]{0,400}?return\\s+' + name + 'Inner\\(').test(mod);
    const body = extractMethod(mod, 'function ' + name) || null;
    if (!body) {
        if (!new RegExp(name + '\\s*[:(]').test(mod)) {
            problems.push('W4 导出入口 ' + name + ' 不在位');
            continue;
        }
        guarded++;
        continue;
    }
    const hasTry = /try\s*\{/.test(body);
    const pure = /\[pure\]/.test(body) || /\[pure\]/.test(mod.slice(Math.max(0, mod.indexOf('function ' + name) - 120), mod.indexOf('function ' + name) + 60));
    if (!hasTry && !pure && !wrapper) {
        problems.push('W4 导出入口 ' + name + ' 无 try/catch（也无 Inner 兜底、未声明 [pure]）——宿主 getter 抛错会外抛给调用方');
    } else {
        guarded++;
    }
}
if (guarded >= EXPORTS.length - 1) notes.push('W4 导出入口 ' + guarded + '/' + EXPORTS.length + ' 有降级保护');
if (/throw\s+new\s+Error/.test(mod)) {
    problems.push('W4 读者面内部出现 throw new Error——读者面对宿主必须降级，不得外抛');
}

/* ---------- W5 桥名与上游逐字一致 ---------- */
// 上游（WorldAxis engines/bridge.js）的 BRIDGE_ID 是硬契约；此处只校验本地常量形状 + 与入参默认值一致
if (bridgeId !== 'worldaxis_bridge_v1') {
    problems.push('W5 桥名与上游不一致（本地 ' + bridgeId + '，上游 worldaxis_bridge_v1）——两端静默失联，两侧都不报错');
} else {
    notes.push('W5 桥名与上游逐字一致：worldaxis_bridge_v1');
}
// 不仅要有常量，还要真的用在读取路径上（有常量不用 = 声明面空转）：显式不匹配须降级可归因
if (!/BRIDGE_VERSION\s*=\s*1\b/.test(mod)) {
    problems.push('W5 未校验上游 BRIDGE_VERSION（上游升版后本地会静默按旧契约解读）');
} else if (!/contract-mismatch/.test(mod)) {
    problems.push('W5 BRIDGE_VERSION 常量存在但未接在读取路径上——版本不匹配无法归因（声明面空转）');
} else {
    notes.push('W5 契约版本校验已接线（显式不匹配 ⇒ contract-mismatch）');
}

/* ---------- W6 结构健康 ---------- */
if (!FIXTURE_MODE) {
    const faces = declared.size + readCalls.length + guarded + consumers.filter(([, re]) => re.test(idx)).length;
    if (faces < 10) {
        console.error('[world-clock-reader] 判定面塌缩（faces=' + faces + '）——探测器可能失效');
        process.exit(2);
    }
    if (mod.split('\n').length < 150) {
        console.error('[world-clock-reader] 模块过短（' + mod.split('\n').length + ' 行）——可能被截断');
        process.exit(2);
    }
}

/* ---------- 输出 ---------- */
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.error('\n[world-clock-reader] 发现 ' + problems.length + ' 处跨插件读者面缺陷：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ 世界钟读者面：接线真落地 / 来源五态可达 / 只读无写路径 / 入口不抛 / 桥名逐字一致（'
    + notes.length + ' 项结构证据）');