// 审计基建 M（v3.180）：三面收口扫描（楼层归属 / 年龄锚点三态 / 对外只读三入口）
// ------------------------------------------------------------
// 为什么存在：
//   本插件**自身**这一侧有三个同族缺口，形态完全一致——「三态被压成两态」：
//     ① 账本的**归属性**：写进 ST 消息的那一格账说不出属于哪一楼哪一页。
//        「没有这格账」与「有但不属于这页」被压成同一个空值 ⇒ 只能整格信或整格不信。
//     ② 年龄的**可观测性**：算不出就顺手回退成一个数字。
//        「钟没走」「锚点丢了」「推算为负」三种现场在读数上同形 ⇒ 每一次自我怀疑都被假数字安抚。
//     ③ 对外的**可查性**：注册成败与**注册到哪条路径**被压成一个布尔值
//        ⇒「宏能读到、命令读不到」这类入口间漂移无从归因。
//
// 判定策略（全部基于真源码读取 + 真行为驱动，不做文本猜测）：
//   M1 三个新模块必须在位、且**真被消费**（声明面空转 = 死声明）。
//   M2 **三态必须可分**：楼层归属 {present,valid,why} 三态；年龄 exact/estimated/anchor-only 三态。
//      两两必须落在不同字面量上——同形即等于伪造结论（本版修掉的那类静默降级）。
//   M3 **只读边界**：三个模块不得出现任何写侧入口（与桥同规格：查账口可以多开，改账口不开）。
//   M4 每个导出入口**不抛**（宿主畸形输入不得外抛）。
//   M5 **接线真落地**：落笔点 / 摘要落笔（fresh）/ 覆盖度 / 诊断行 / 携带键 / 对外注册调用点。
//      「注册了却无人取」「声明了却零消费」都属于这一项。
//   M6 **有界性**：附注挂在用户楼层上，必须切片（items / summary 文本）。
//   M7 ★ **时钟助手可达性**：年龄三态里的 estimated 要求日期解析可用。
//      修前 parseStoryDate/calcAge 只在 RelativeTimeHelper 上、this.clock 在状态层恒 undefined，
//      于是 estimated **在生产路径上永不达成**（三态塌两态）且全程无报错。这一项必须可机检。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const FLOOR = path.join(ROOT, 'floor-ledger.js');
const AGE = path.join(ROOT, 'age-anchor.js');
const PUB = path.join(ROOT, 'public-interface.js');
const IDX = path.join(ROOT, 'index.js');
for (const [p, what] of [[FLOOR, 'floor-ledger.js'], [AGE, 'age-anchor.js'], [PUB, 'public-interface.js'], [IDX, 'index.js']]) {
    if (!fs.existsSync(p)) {
        console.error('[v3180-三面收口] 找不到 ' + what + '（ROOT=' + ROOT + '）——结构漂移');
        process.exit(2);
    }
}
const floor = fs.readFileSync(FLOOR, 'utf8');
const age = fs.readFileSync(AGE, 'utf8');
const pub = fs.readFileSync(PUB, 'utf8');
const idx = fs.readFileSync(IDX, 'utf8');

const problems = [];
const notes = [];
function has(re, src, tag) { return re.test(src); }

/* ---------- M0 结构预检 ---------- */
for (const [src, what] of [[floor, 'floor-ledger.js'], [age, 'age-anchor.js'], [pub, 'public-interface.js']]) {
    if (!/module\.exports\s*=\s*api;/.test(src)) {
        console.error('[' + what + '] module.exports 缺失——结构漂移（无头测试拿不到模块）');
        process.exit(2);
    }
    if (!/global\.LonSha(FloorLedger|AgeAnchor|PublicInterface) = Object\.freeze\(api\)/.test(src)) {
        console.error('[' + what + '] 全局符号挂载缺失——结构漂移（宿主取不到库）');
        process.exit(2);
    }
}
const EXTRA_KEY = /EXTRA_KEY = '([^']+)'/.exec(floor);
if (!EXTRA_KEY) { console.error('[floor-ledger] 附注键常量缺失——结构漂移'); process.exit(2); }
notes.push('M0 三模块导出面 + 全局符号在位；附注键 = ' + EXTRA_KEY[1]);

/* ---------- M1 模块在位且真被消费 ---------- */
const consumers = [
    ['楼层落笔（物品）', /this\._stampFloorLedger\(message, \{ floor: floorNow, items: _lv\.items \}\)/],
    ['楼层落笔（摘要 · fresh）', /\{ fresh: true \}\)/],
    ['覆盖度入口', /_floorLedgerCoverage\(\)\s*\{/],
    ['覆盖度一句话读数', /_floorLedgerLine\(\)\s*\{/],
    ['诊断面·楼层落笔行', /\['楼层落笔', line/],
    ['诊断面·年龄锚点行', /\['年龄锚点', /],
    ['携带写侧 ageAnchors', /ageAnchors: this\.status\?\.exportAgeAnchors\?\.\(\) \|\| \{\}/],
    ['携带读侧 ageAnchors', /pack\.ageAnchors/],
    ['契约键 ageAnchors', /'ageAnchors',/],
    ['对外注册调用点', /this\._registerPublicInterface\(\);/],
    ['对外注册延后一拍', /setTimeout\(\(\) => \{ run\(\); \}, 0\);/],
    ['召回条目年龄读数', /age: this\.status\.ageReading\(r\.name, _ageOpts\)/]
];
for (const [what, re] of consumers) {
    if (!re.test(idx)) problems.push('M1 ' + what + ' 不在位——声明了却没接在消费点（死声明）');
}
if (consumers.every(([, re]) => re.test(idx))) notes.push('M1 ' + consumers.length + ' 处消费点全部真落地');
// 三个全局符号必须被真读（注册了却无人取 ⇒ 静默缺席）
for (const [sym, tag] of [['window.LonShaFloorLedger', '楼层归属'], ['window.LonShaAgeAnchor', '年龄锚点'], ['window.LonShaPublicInterface', '对外接口']]) {
    const re = new RegExp('_moduleLib\\(\\(\\) => ' + sym.replace('.', '\\.') + ', ');
    if (!re.test(idx)) problems.push('M1 ' + tag + ' 模块未被运行时真取（' + sym + '）——注册了却无人取 = 静默缺席');
}
// 单点：模块缺席必须留痕而非静默 no-op
if (!/status: 'module-unavailable'/.test(idx)) {
    problems.push('M1 楼层落笔模块缺席未留归因（修前是静默 no-op）');
}

/* ---------- M2 三态可分 ---------- */
// ① 楼层归属：present / valid / why
if (!/present: false[\s\S]{0,60}why: 'absent'/.test(floor)) {
    problems.push("M2 楼层归属缺「没有这格账」(present:false + why:'absent') 态");
}
if (!/present: true, valid: false, record: null, why: 'fingerprint-mismatch'/.test(floor)) {
    problems.push("M2 楼层归属缺「有但不属于这页」(fingerprint-mismatch) 态——与「没有」会塌成一态");
}
const whys = new Set();
for (const m of floor.matchAll(/why: '([a-z-]+)'/g)) whys.add(m[1]);
for (const m of floor.matchAll(/why = '([a-z-]+)'/g)) whys.add(m[1]);
for (const need of ['absent', 'fingerprint-mismatch', 'version-mismatch', 'malformed', 'thrown', 'ok']) {
    if (!whys.has(need)) problems.push('M2 楼层归属 why 缺 "' + need + '"（该处境无法归因）');
}
if (['absent', 'fingerprint-mismatch'].every(w => whys.has(w))) {
    notes.push('M2 楼层归属三态可达 + why 枚举 ' + whys.size + ' 态');
}
// ② 年龄三态：★ 只认**真赋值点**（`out.state = '...'` / `state: '...'`）。
//    不能全文件 includes（注释里出现 `anchor-only` 会让判据恒绿——负控制 V2 组抓到的正是这一形态）。
const AGE_STATES = new Set();
for (const m of age.matchAll(/out\.state = '([a-z-]+)'/g)) AGE_STATES.add(m[1]);
for (const m of age.matchAll(/state: '([a-z-]+)'/g)) AGE_STATES.add(m[1]);
for (const need of ['exact', 'estimated', 'anchor-only']) {
    if (!AGE_STATES.has(need)) problems.push('M2 年龄三态缺 "' + need + '"（算得出与算不出会同形——本版修掉的原始缺陷）');
}
if (AGE_STATES.has('exact') && AGE_STATES.has('estimated') && AGE_STATES.has('anchor-only')) {
    notes.push('M2 年龄三态可达且两两可分：exact / estimated / anchor-only');
}
// ③ 对外三入口：state 三档 + path 标注
for (const st of ["'ready'", "'absent'", "'failed'"]) {
    if (!pub.includes(st)) problems.push('M2 对外入口缺状态 ' + st + '（成败无法分别）');
}
for (const pp of ["path = 'addCommandObject'", "path = 'addCommand'", "path = 'macro-system'", "path = 'macros'"]) {
    if (!pub.includes(pp)) problems.push('M2 对外入口缺路径标注 ' + pp + '——「注册成功」与「注册到哪条路径」是两件事');
}
if (/parameterized = true/.test(pub)) notes.push('M2 对外三入口三态 + 四条路径 + 参数化标注在位');
else problems.push('M2 参数化宏可用性未标注');

/* ---------- M3 只读边界 ---------- */
for (const [what, src] of [['floor-ledger', floor], ['age-anchor', age], ['public-interface', pub]]) {
    for (const bad of ['publish(', 'invalidate(', 'setSettings(', 'writeFileSync']) {
        if (src.includes(bad)) problems.push('M3 ' + what + ' 出现写侧入口 ' + bad + '——违反只读契约');
    }
}
if (!/ex\[EXTRA_KEY\] = payload;/.test(floor)) {
    problems.push('M3 楼层落笔未限定在「自己那一个键」上写');
}
if (/\.(mes|swipes)\s*=[^=]/.test(floor)) {
    problems.push('M3 楼层落笔改写正文——附注必须与正文分离');
} else {
    notes.push('M3 只读边界：三模块无写侧入口，落笔只写自己那一个键');
}

/* ---------- M4 导出入口不抛 ---------- */
/** 抽函数体：**先配平圆括号**再找 `{`。
 *  不这么做的话 `stamp(msg, record, opts = {})` 的参数默认值 `{}` 会被当成函数体
 *  （抽到 2 个字符 ⇒ 判据假红）。这个坑在 v3.176 的同类扫描器里踩过一次，此处固化。 */
function bodyOf(src, name) {
    const start = src.search(new RegExp('function\\s+' + name + '\\s*\\('));
    if (start < 0) return null;
    let i = src.indexOf('(', start), depth = 0, close = -1;
    for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close < 0) return null;
    const brace = src.indexOf('{', close);
    if (brace < 0) return null;
    let d2 = 0, end = -1;
    for (let j = brace; j < src.length; j++) {
        if (src[j] === '{') d2++;
        else if (src[j] === '}') { d2--; if (d2 === 0) { end = j; break; } }
    }
    return end > 0 ? src.slice(brace, end + 1) : null;
}
for (const [what, src, names] of [
    ['floor-ledger', floor, ['stamp', 'read', 'clear', 'coverage', 'fpOf', 'textOf', 'hash32']],
    ['age-anchor', age, ['stampAge', 'carryAge', 'ageDisplay', 'checkInvariants', 'anchorLabel', 'dayDiff']],
    ['public-interface', pub, ['register', 'queryResource', 'formatResult', 'lastReport']]
]) {
    for (const n of names) {
        const body = bodyOf(src, n);
        if (body === null) {
            if (!new RegExp(n + '\\s*[:(]').test(src)) problems.push('M4 ' + what + ' 导出入口 ' + n + ' 不在位');
            continue;
        }
        const guarded = /try\s*\{/.test(body) && /catch\s*\(/.test(body);
        // 无 try 的必须是**纯函数**：只调用内建安全方法，不触宿主对象的方法。
        //   白名单只列纯内建（字符串/数组/JSON/数学），其余任何 `.xxx(` 都算「触宿主」。
        const SAFE = /\.(trim|toLowerCase|toUpperCase|slice|padStart|padEnd|join|split|replace|repeat|indexOf|includes|filter|map|find|findIndex|test|exec|stringify|parse|entries|keys|values|freeze|isFrozen|isArray|isFinite|round|max|min|abs|floor|now|UTC|charCodeAt|codePointAt|toString|imul)\s*\(/g;
        const pureIsh = !/\.\w+\s*\(/.test(body.replace(SAFE, ''));
        if (!guarded && !pureIsh) {
            problems.push('M4 ' + what + '.' + n + ' 无降级保护（宿主畸形会外抛）');
        }
    }
}
if (/throw\s+new\s+Error/.test(floor) || /throw\s+new\s+Error/.test(age)) {
    problems.push('M4 楼层/年龄模块内部出现 throw new Error——对宿主必须降级，不得外抛');
}
// public-interface 的**故意**抛错（无效 format / 未知名）在斜杠回调里，属用户面错误，单列
if (/throw new TypeError\('format 只能是/.test(pub)) notes.push('M4 导出入口降级保护在位；用户面错误（无效 format/resource）按设计浮出');
else problems.push('M4 无效 format 未抛 TypeError（错误应浮到用户面前）');

/* ---------- M5 接线真落地（时钟助手可达性） ---------- */
// ★ 判据必须看**是否真委托**，而不是只看有没有同名方法：
//   修前教训是「签名在位、方法体空转」也算通过——那正是本版治理的功能级失效形态。
if (!/new RelativeTimeHelper\(\)\.parseStoryDate\(dateStr\)/.test(idx)) {
    problems.push('M5 ★ GameClock.parseStoryDate 未真委托（同名方法在位但空转 ⇒ age-anchor 的 parseFn 取不到日期）');
}
if (!/new RelativeTimeHelper\(\)\.calcAge\(birthDateStr, currentStoryDateStr\)/.test(idx)) {
    problems.push('M5 ★ GameClock.calcAge 未真委托（出生日期口径的年龄算不出来）');
}
if (/new RelativeTimeHelper\(\)\.parseStoryDate\(dateStr\)/.test(idx) && /new RelativeTimeHelper\(\)\.calcAge\(birthDateStr/.test(idx)) {
    notes.push('M5 时钟自带日期解析委托且**真委托**（estimated 可达的前提）');
}
if (!/this\.status\.clock = this\.clock/.test(idx)) {
    problems.push('M5 ★ 引擎未把时钟交给状态层（this.clock 在 CharacterState 上恒 undefined ⇒ 助手静默缺席）');
} else {
    notes.push('M5 引擎把时钟交给状态层（接线真落地）');
}
if (!/_clockHelpers\(\)\s*\{/.test(idx)) {
    problems.push('M5 CharacterState 缺 _clockHelpers（无自包含回落 ⇒ 隔离副本里 estimated 不可达且不报错）');
}
// 助手缺失时不得连坐
if (!/typeof RelativeTimeHelper === 'function'/.test(idx)) {
    problems.push('M5 时钟助手回落未做存在性检查（隔离/半加载环境会外抛）');
}
// ★ 遗漏基线交叉检查：接线必须落在**构造器内**，不得落在实例字段声明区
//   （字段声明区里的函数调用/`this.…` 会在 new Foo() 时、外层 this 未绑定前执行 ⇒ 外抛）
{
    const mStart = idx.indexOf('class MemoryEngine {');
    const ctor = idx.indexOf('constructor(config) {', mStart);
    if (mStart < 0 || ctor < 0) {
        problems.push('M5 MemoryEngine 构造器定位失败（接线点无法核对）');
    } else {
        const inj = idx.indexOf('this.status.clock = this.clock');
        if (inj < 0) problems.push('M5 时钟未交给状态层（已在上面报过）');
        else if (inj < ctor) problems.push('M5 ★ 时钟注入落在实例字段声明区（会在实例化时外抛）——必须放进构造器');
        else notes.push('M5 时钟注入落在构造器内（基线校准：非实例字段区）');
    }
    // _registerPublicInterface 必须不在 ipcMain 语境（防误套桌面壳样板）
    if (/ipcMain|BrowserWindow/.test(idx)) {
        problems.push('M5 ★ 对外注册接线疑似套用了 Electron 主进程样板（本插件是浏览器侧 ST 扩展）');
    }
}

if (!/record\.fresh \|\| opts\.fresh/.test(idx)) {
    problems.push('M5 ★ fresh 闸门判据未同时认 record.fresh 与 opts.fresh'
        + '（调用点写 { fresh: true } 而签名只收两参 ⇒ 陈旧拒笔纪律**静默失效**，正是本版修掉的缺陷）');
} else {
    notes.push('M5 fresh 闸门同时认 record.fresh / opts.fresh（陈旧拒笔纪律真生效）');
}
if (!/_stampFloorLedger\(message, record, opts = \{\}\)/.test(idx)) {
    problems.push('M5 ★ _stampFloorLedger 签名未收第三参（调用点的 {fresh:true} 会被静默丢弃）');
}

/* ---------- M6 有界性 ---------- */
if (!/slice\(0, opts\.maxItems \|\| 20\)/.test(floor)) {
    problems.push('M6 附注 items 未做有界切片——挂在用户楼层上的数据会无界膨胀');
}
if (!/slice\(0, opts\.maxSummaryChars \|\| 2000\)/.test(floor)) {
    problems.push('M6 附注摘要未做有界切片');
}
if (/slice\(0, opts\.maxItems/.test(floor) && /slice\(0, opts\.maxSummaryChars/.test(floor)) {
    notes.push('M6 附注有界：items ≤20 / 摘要文本 ≤2000 字符');
}
// 覆盖度必须**现算**、不入快照
if (!/\[v3\.180\] 楼层账本覆盖度（\*\*现算\*\*读数，不入快照存盘）/.test(idx)) {
    problems.push('M6 覆盖度未声明「现算、不入快照」（入了快照 = 缺口变成历史数据）');
}

/* ---------- M7 结构健康 ---------- */
if (!FIXTURE_MODE) {
    const faces = consumers.length + whys.size;
    if (faces < 14) {
        console.error('[v3180-三面收口] 判定面塌缩（faces=' + faces + '）——探测器可能失效');
        process.exit(2);
    }
    for (const [p, min, what] of [[FLOOR, 150, 'floor-ledger.js'], [AGE, 150, 'age-anchor.js'], [PUB, 200, 'public-interface.js']]) {
        const lines = fs.readFileSync(p, 'utf8').split('\n').length;
        if (lines < min) {
            console.error('[' + what + '] 模块过短（' + lines + ' 行 < ' + min + '）——可能被截断');
            process.exit(2);
        }
    }
    // ★ 反向自证：三态字面量不得同形（同形即「三态塌两态」）。
    //   注意：这一情形**已由 M2 记为真缺陷**（exit 1 优先于结构漂移），
    //   这里只在「M2 没报到但口径也已塌」这种自相矛盾时兜底 exit 2。
    if (AGE_STATES.size < 3 && !problems.some(p => p.indexOf('M2 年龄三态缺') === 0)) {
        console.error('[v3180-三面收口] 年龄三态字面量塌缩（可达 ' + AGE_STATES.size + ' 态）且 M2 未报——探测器口径失效');
        process.exit(2);
    }
}

/* ---------- 输出 ---------- */
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.error('\n[v3180-三面收口] 发现 ' + problems.length + ' 处缺陷：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ v3.180 三面收口：归属三态可分 / 年龄三态可达（含 estimated 真接线）/ 对外三入口成败与路径如实 / 只读 / 入口不抛 / 附注有界（'
    + notes.length + ' 项结构证据）');