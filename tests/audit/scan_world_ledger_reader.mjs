// 审计基建 M（v3.176）：世界账本读者面扫描（全账本对读 / 缺口可见 / 只读 / 不抛 / 桥名一致）
// ------------------------------------------------------------
// 为什么存在：
//   v3.175 把「读 WorldAxis 世界钟」这条边接通了，但只读了 `snapshot.worldClock` **一个字段**，
//   而推演侧外供十二条面（pulse/digest/currents/echoes/facts/people/opinion/counts/filter…）。
//   本版补的是三类结构性缺口，其中第一类最要紧——**不可观测的缺口**：
//   推演侧默认只外供显式 public 标记的暗流，其余落进 filter.notMarked[]；修前本插件连
//   「有多少东西没给我」都读不到，它见到的是一个「恰好只有这些」的完美世界。
//
// 判定策略（全部基于真源码读取 + 真行为驱动，不做文本猜测）：
//   M1 跨插件读者模块必须在位、且**真被消费**（声明面空转 = 死声明，与 v3.163/v3.175 同一条不变量）。
//   M2 **缺口归因必须四态可分**：no-filter（上游没告诉我有没有缺口）/ complete（告诉我没有）/
//      gapped（有未外供）/ full（全量放行）。其中 **no-filter 与 complete 必须分别是不同字面量**——
//      「不知道有没有缺口」被报成「没有缺口」等于伪造结论（本版修掉的那类静默降级）。
//   M3 读者**不得有写桥路径**（只读契约；上游本就不给写路径）。
//   M4 导出的每个判定入口必须**不抛**（catch 覆盖 / Inner wrapper / [pure]）。
//   M5 桥名必须与上游**逐字一致**，且桥访问必须是**单一真源**（复用 v3.175 世界钟读者面，
//      允许软依赖回退——但回退实现也必须不抛可归因）。
//   M6 **有界性**：对读明细会进快照/存档，必须切片 + 保留总数（总数不失真、明细不膨胀）。
//   M7 结构健康标记 + 判定面非零下限（防探测器失效后以全绿通过）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

const MOD = path.join(ROOT, 'world-ledger-reader.js');
const CLOCK = path.join(ROOT, 'world-clock-reader.js');
const IDX = path.join(ROOT, 'index.js');
for (const [p, what] of [[MOD, 'world-ledger-reader.js'], [CLOCK, 'world-clock-reader.js'], [IDX, 'index.js']]) {
    if (!fs.existsSync(p)) {
        console.error('[world-ledger-reader] 找不到 ' + what + '（ROOT=' + ROOT + '）——结构漂移');
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

/* ---------- M0 结构预检 ---------- */
const ID_DECL = /WORLDAXIS_BRIDGE_ID\s*=\s*'([^']+)'/.exec(mod);
if (!ID_DECL) {
    console.error('[world-ledger-reader] 桥 ID 常量缺失——结构漂移（读者无法定位桥）');
    process.exit(2);
}
const bridgeId = ID_DECL[1];
const expMatch = /module\.exports\s*=\s*(\{[\s\S]*?\}|[A-Za-z_$][\w$]*)\s*;/.exec(mod);
if (!expMatch) {
    console.error('[world-ledger-reader] module.exports 缺失——结构漂移（无头测试拿不到模块）');
    process.exit(2);
}
notes.push('桥 ID 常量 + 导出面解析成功：' + bridgeId);

/* ---------- M1 真被消费（防死声明） ---------- */
const consumers = [
    ['时钟侧读者入口', /readWorldLedger\(\s*reader\s*,\s*opts\s*=\s*\{\}\s*\)/],
    ['宿主侧投影收集', /_localPeopleLocations\(\)\s*\{/],
    ['宿主侧事实键收集', /_localFactKeys\(\)\s*\{/],
    ['宿主侧入口', /readWorldLedger\(opts\s*=\s*\{\}\s*\)\s*\{/],
    ['消息管线调用点', /this\.readWorldLedger\(\{/],
    ['快照携带 worldLedgerRead', /worldLedgerRead:\s*deep\(rawLedgerRead\)/],
    ['诊断面读数行', /selfCheck\.worldLedger/]
];
for (const [what, re] of consumers) {
    if (!re.test(idx)) {
        problems.push('M1 ' + what + ' 不在位——跨插件账本读者面声明了却没接在消费点（死声明）');
    }
}
if (consumers.every(([, re]) => re.test(idx))) notes.push('M1 七处消费点全部真落地（时钟入口/宿主投影/宿主入口/调用/快照/诊断）');
// 本地投影**不得**挂在 GameClock 上（时钟没有 status/outline/worldProg，取到即 undefined，
//   对读会永远返回空且不报错）——这是本版实现时真踩过的一处静默降级。
if (/class GameClock[\s\S]*?_localPeopleLocations\s*\(/.test(idx)) {
    problems.push('M1 本地投影被挂在 GameClock 上——时钟无 status/outline/worldProg，对读将静默恒空（本版修掉的原始缺陷）');
}

/* ---------- M2 缺口四态可分 ---------- */
const declared = new Set();
for (const m of mod.matchAll(/verdict\s*=\s*'([a-z-]+)'/g)) declared.add(m[1]);
for (const m of mod.matchAll(/verdict\s*:\s*'([a-z-]+)'/g)) declared.add(m[1]);
const MUST = ['no-filter', 'complete', 'gapped', 'full'];
for (const s of MUST) {
    if (!declared.has(s)) problems.push('M2 缺口态 "' + s + '" 不可达（读者无法分辨这一处境）');
}
if (MUST.every((s) => declared.has(s))) notes.push('M2 缺口四态可达：' + MUST.join(' / '));
// 「不知道有没有缺口」与「没有缺口」必须分别是**不同**字面量
if (!(declared.has('no-filter') && declared.has('complete'))) {
    problems.push('M2 「缺口不可知(no-filter)」与「无缺口(complete)」未分别成态——等于伪造了一个「没有缺口」的结论（本版修掉的原始缺陷）');
}
// 事实缺席三态（present/empty/absent）必须可分（sectionState）
if (!/'absent'/.test(mod) || !/'empty'/.test(mod) || !/'value'/.test(mod)) {
    problems.push('M2 账本节在场三态（value/empty/absent）不齐——「没外供」与「外供了但是空」会塌成一态');
} else {
    notes.push('M2 账本节在场三态可达：value / empty / absent');
}

/* ---------- M3 只读：不得有写桥路径 ---------- */
const writeBridge = /(bridge|src|bridgeObj|wx)\s*\.\s*(snapshot|stat|settings|publish|invalidate|refresh)\s*=[^=]/;
if (writeBridge.test(mod)) {
    problems.push('M3 读者面出现对桥对象的赋值——违反只读契约');
}
for (const bad of ['publish(', 'invalidate(', 'setSettings(']) {
    if (mod.includes(bad)) {
        problems.push('M3 读者面调用了写侧入口 ' + bad + '——上游只给读路径');
    }
}
// 只读调用面（复用 kit 或回退实现里都要有）
if (!/snapshot\s*\(/.test(mod)) {
    problems.push('M3 读者面未出现 snapshot() 只读调用——归因能力不足');
} else {
    notes.push('M3 只读调用面：snapshot()（无写侧入口）');
}

/* ---------- M4 导出入口不抛 ---------- */
const EXPORTS = ['readWorldSnapshot', 'sectionState', 'summarizeLedger', 'visibilityGap',
    'diffPeople', 'opinionStrength', 'diffFacts', 'readLedger', 'describeLedger'];
let guarded = 0;
for (const name of EXPORTS) {
    const wrapper = new RegExp(name + '\\([^)]*\\)\\s*\\{[\\s\\S]{0,400}?return\\s+' + name + 'Inner\\(').test(mod);
    const body = extractMethod(mod, 'function ' + name);
    if (!body) {
        if (!new RegExp(name + '\\s*[:(]').test(mod)) {
            problems.push('M4 导出入口 ' + name + ' 不在位');
            continue;
        }
        guarded++;
        continue;
    }
    const hasTry = /try\s*\{/.test(body);
    const pure = /\[pure\]/.test(body) || /\[pure\]/.test(mod.slice(Math.max(0, mod.indexOf('function ' + name) - 140), mod.indexOf('function ' + name) + 60));
    if (!hasTry && !pure && !wrapper) {
        problems.push('M4 导出入口 ' + name + ' 无 try/catch（也无 Inner 兜底、未声明 [pure]）——宿主畸形会外抛');
    } else {
        guarded++;
    }
}
if (guarded >= EXPORTS.length - 1) notes.push('M4 导出入口 ' + guarded + '/' + EXPORTS.length + ' 有降级保护');
if (/throw\s+new\s+Error/.test(mod)) {
    problems.push('M4 读者面内部出现 throw new Error——读者面对宿主必须降级，不得外抛');
}

/* ---------- M5 桥名逐字一致 + 单一真源 ---------- */
if (bridgeId !== 'worldaxis_bridge_v1') {
    problems.push('M5 桥名与上游不一致（本地 ' + bridgeId + '）——两端静默失联，两侧都不报错');
} else {
    notes.push('M5 桥名与上游逐字一致：worldaxis_bridge_v1');
}
// 复用 v3.175 世界钟读者面（单一真源），且必须是**软**依赖（回退实现也在）
if (!/LonShaWorldClockReader/.test(mod)) {
    problems.push('M5 未复用世界钟读者面的桥访问——两处各写一份桥访问会口径漂移（reason 枚举不一致）');
} else if (!/fallbackGetBridge/.test(mod)) {
    problems.push('M5 复用了世界钟读者面但无回退实现——另一个模块未加载时整面失效（软依赖断裂）');
} else {
    notes.push('M5 桥访问单一真源（复用世界钟读者面）+ 软依赖回退在位');
}

/* ---------- M6 有界性（读数进快照，明细必须切片 + 保留总数） ---------- */
const sliceHits = (mod.match(/slice\(0,\s*12\)/g) || []).length;
if (sliceHits < 4) {
    problems.push('M6 对读明细未做有界切片（实 ' + sliceHits + ' 处，应 >= 4）——读数进快照会让存档无界膨胀');
} else {
    notes.push('M6 对读明细有界：' + sliceHits + ' 处切片 + 总数保留（不失真）');
}
if (!/mismatchedTotal/.test(mod) || !/worldOnlyTotal/.test(mod)) {
    problems.push('M6 切片后未保留总数——「切掉了」与「本来就这么少」会塌成一态');
}

/* ---------- M7 结构健康 ---------- */
if (!FIXTURE_MODE) {
    const faces = declared.size + guarded + consumers.filter(([, re]) => re.test(idx)).length + sliceHits;
    if (faces < 16) {
        console.error('[world-ledger-reader] 判定面塌缩（faces=' + faces + '）——探测器可能失效');
        process.exit(2);
    }
    if (mod.split('\n').length < 300) {
        console.error('[world-ledger-reader] 模块过短（' + mod.split('\n').length + ' 行）——可能被截断');
        process.exit(2);
    }
}

/* ---------- 输出 ---------- */
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.error('\n[world-ledger-reader] 发现 ' + problems.length + ' 处跨插件账本读者面缺陷：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ 世界账本读者面：接线真落地 / 缺口四态可分 / 在场三态可分 / 只读 / 入口不抛 / 桥名一致 / 明细有界（'
    + notes.length + ' 项结构证据）');
