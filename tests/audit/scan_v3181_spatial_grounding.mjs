// 审计基建 N（v3.181）：场所图景扫描（场景树 / 到访史 / 在场索引 / 挂账 / 覆盖度 / 不变量）
// ------------------------------------------------------------
// 为什么存在：
//   本插件里**最薄的那个子系统**是场景树：抽取前整个 SceneBook 只有 89 行，
//   对外读法只有 currentKey / chainOf / brief 三个。于是四个日常问题在运行期全是死路：
//     「上一次去『老城›钟楼›顶层』是什么时候」「这一段剧情发生时人在哪儿」
//     「谁在这个地方」「这个街区下还藏着多少处场所、写到了第几层」。
//   本版把它抽成独立模块并补齐六面；本档负责**证明这六面真的可读**（不是声明面空转）。
//
// 判定策略（全部真源码读取 + 真行为驱动）：
//   N1 模块在位且**真被消费**（接线点清单逐条）。
//   N2 ★ 六面各自**真能回答**（不是「方法存在」——存在而空转正是本仓库治理过十几轮的形态）：
//       树/到访/在场/挂账/覆盖度/不变量，逐面构造现场并核对读数。
//   N3 ★ 不变量**三态可达**（ok / warn / broken 三者都必须能真造出来且互不同形）：
//       只声明三态而其中某态恒不可达 = 三态塌两态（本仓库反复出现的缺陷族）。
//   N4 ★ 三处旧缺陷已根除（哑雷三目 / 无到访史 / 清了没人重建），逐条给判据。
//   N5 有界性：附注挂在运行时对象上，上限常量必须真被消费（不是只声明）。
//   N6 模块缺席时退路**同形且如实**（读数一律回报「没有」，绝不伪造能写不能读的世界）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripComments } from '../_audit_lib.mjs';
const require = createRequire(import.meta.url);
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const SB = path.join(ROOT, 'scene-book.js');
const IDX = path.join(ROOT, 'index.js');
const PUB = path.join(ROOT, 'public-interface.js');
for (const [p, what] of [[SB, 'scene-book.js'], [IDX, 'index.js'], [PUB, 'public-interface.js']]) {
    if (!fs.existsSync(p)) {
        console.error('[v3181-场所图景] 找不到 ' + what + '（ROOT=' + ROOT + '）——结构漂移');
        process.exit(2);
    }
}
const sb = fs.readFileSync(SB, 'utf8');
const idx = fs.readFileSync(IDX, 'utf8');
const pub = fs.readFileSync(PUB, 'utf8');
// [v3.190] 位移收口后，场景面的单出口重建在登记表模块里——N1 需要连它一起看
const lrp = path.join(ROOT, 'ledger-replay.js');
const lr = fs.existsSync(lrp) ? fs.readFileSync(lrp, 'utf8') : '';
/**
 * 去掉注释与字符串字面量后的源码（判据纯度工具）。
 * 【为什么必须这么做】本仓库反复踩过同一形态：
 *   「判据对着**注释里的字面量**下结论」——注释里提到 `? true : false` 或 `_cutoff`，
 *   判据就恒红/恒绿，与真代码无关。凡是**源码形态**判据（不是行为判据），
 *   一律走本函数，并配「判据纯度」自证（见配套测试）。
 */
// 形态判据一律走去注释/去字面量后的源码（行为判据仍走真模块）
const sbCode = stripComments(sb);
const idxCode = stripComments(idx);
let M = null;
try { M = require(SB); } catch (e) {
    console.error('[v3181-场所图景] scene-book.js 无法加载（' + String(e && e.message) + '）——结构漂移');
    process.exit(2);
}
const problems = [];
const notes = [];

/* ---------- N0 结构预检 ---------- */
if (!/module\.exports\s*=\s*api;/.test(sb)) { console.error('[scene-book] module.exports 缺失——结构漂移'); process.exit(2); }
if (!/global\.LonShaSceneBook = Object\.freeze\(api\)/.test(sb)) { console.error('[scene-book] 全局符号挂载缺失——结构漂移（宿主取不到库）'); process.exit(2); }
for (const k of ['SCENE_KEY', 'SCENE_VERSION', 'MAX_PATH_DEPTH', 'MAX_NODES', 'MAX_BRIEF_LINES', 'SceneBook', 'keyOf', 'partsOfKey', 'partsOf', 'leafOf', 'ancestorsOf', 'describeShape']) {
    if (!(k in M)) { console.error('[scene-book] 导出面缺 ' + k + ' ——结构漂移'); process.exit(2); }
}
if (typeof M.SceneBook !== 'function' || !M.SceneBook.prototype) { console.error('[scene-book] SceneBook 不是可构造的类——结构漂移'); process.exit(2); }
notes.push('N0 导出面 12 项在位；SCENE_KEY=' + M.SCENE_KEY + ' / SCENE_VERSION=' + M.SCENE_VERSION);

/* ---------- N1 模块真被消费 ---------- */
const consumers = [
    ['取库口（真读表达式）', /_moduleLib\(\(\) => window\.LonShaSceneBook, 'scene-book\.js'\)/],
    ['构造封装 _newSceneBook', /function _newSceneBook\(seed\)\s*\{/],
    ['构造器内接线', /this\.scene = _newSceneBook\(\);/, 'index.js'],
    ['提取落位 setLocation', /this\.scene\.setLocation\(message\.index \|\| 0, extracted\.location\)/],
    ['在场写入 setPresence', /this\.scene\.setPresence\(_nm, extracted\.location, message\.index \|\| 0\)/],
    ['注入清单 {{SCENES}}', /\{\{SCENES\}\}/],
    // [v3.221.0] R3-D：scene 面的前移动作从登记项手抄循环收进模块（shiftFloorRefs），
    //   锚点随语义搬家；守的仍是同一件事「登记表真的接了场所图景这一面」。
    ['登记表 scene 面：前移交给模块（scene-book）', /h\.scene\.shiftFloorRefs\(d\)/, 'ledger'],
    // [v3.221.0] R3-D：退路覆盖度也得含场景头两键（真实现补了、退路没补 ⇒ 缺席时塌成第三态）
    ['退路覆盖度同形（场景头两键）', /headerFloors: \[\], headerCount: 0,/, 'idx'],
    ['删楼回滚', /this\.scene\.rollbackFloorOnly\(floor\);/, 'index.js'],
    // [v3.221.0] R3-D：回滚面必须真的碰场景头（此前 headers 在删楼/前移两条路径上都不跟，
    //   且没有任何判据面 —— 改坏了也看不出来）。
    ['回滚面按楼层撤场景头', /this\.headers\.delete\(f\);/, 'scene'],
    // 宿主不得再整表全清在场：单楼语义的重回滚不得扩成全清（清多少人由模块按楼层定）。
    ['回滚不再由宿主全清在场', /this\.scene\.rollbackFloorOnly\(floor\);\n\s*\/\/ \[v3.181\]/, 'index.js'],
    ['携带写侧 scenePresence', /scenePresence: \(this\.scene && typeof this\.scene\.export === 'function'\)/],
    ['携带读侧 scenePresence', /pack\.scenePresence/, 'index.js'],
    ['契约键 scenePresence', /'scenePresence',/],
    ['快照外供 scene（summary 对读）', /const rawScene = \(this\.scene && typeof this\.scene\.summary === 'function'\)/],
    ['快照外供 scene（落 snap）', /scene: deep\(rawScene\)/],
];
for (const [what, re, only] of consumers) {
    const src = only === 'index.js' ? idx : (only === 'ledger' ? (idx + '\n' + lr) : (only === 'scene' ? sb : (idx + '\n' + pub)));
    if (!re.test(src)) problems.push('N1 「' + what + '」未接线（声明了却零消费 = 死声明）');
    else notes.push('N1 接线在位：' + what);
}

/* ---------- N2 ★ 六面真能回答（真行为驱动） ---------- */
const book = new M.SceneBook();
// ① 场景树（含祖先补齐）
book.apply([
    { action: 'add', path: ['老城', '钟楼', '顶层'], desc: '铜钟与半截梯' },
    { action: 'add', path: ['老城', '钟楼', '地室'], desc: '水痕与铁门' },
    { action: 'add', path: ['老城', '西街'], desc: '夜市' },
], 5);
if (!book.nodes.has('老城') || !book.nodes.has('老城/钟楼')) problems.push('N2 ① 祖先未补齐（层级断裂）');
if (book.currentKey() !== null) problems.push('N2 ① 未定位却报出当前位置（编造读数）');
// ② 到访史
const b2 = new M.SceneBook();
b2.apply([{ action: 'add', path: ['城', '店'], desc: '铺面' }], 3);
b2.setLocation(3, ['城', '店']);
b2.setLocation(3, ['城', '店']);          // 同楼覆盖：不得重复计到访
const v1 = b2.visitsOf(['城', '店']);
if (!v1 || v1.count !== 1) problems.push('N2 ② 同楼覆盖被重复计到访（count=' + (v1 && v1.count) + '，应为 1）');
b2.setLocation(7, ['城', '店']);          // 换楼：算再一次到访
const v2 = b2.visitsOf(['城', '店']);
if (!v2 || v2.count !== 2 || v2.firstFloor !== 3 || v2.lastFloor !== 7) {
    problems.push('N2 ② 到访史读数不对：' + JSON.stringify(v2));
}
if (b2.visitsOf(['不存在']) !== null) problems.push('N2 ② 未到访地点未如实返回 null（编造读数）');
// ③ 在场索引
const b3 = new M.SceneBook();
b3.apply([{ action: 'add', path: ['老城', '钟楼', '顶层'], desc: '塔顶' }], 2);
b3.setPresence('阿沅', ['老城', '钟楼', '顶层'], 2);
b3.setPresence('陆辞', ['老城', '钟楼'], 2);
if (!b3.whereIs('阿沅') || b3.whereIs('阿沅').key !== '老城/钟楼/顶层') problems.push('N2 ③ whereIs 读不出所在');
if (b3.whereIs('不存在的人') !== null) problems.push('N2 ③ 不在场未如实返回 null');
const at = b3.presenceAt('老城/钟楼');
if (at.length !== 2) problems.push('N2 ③ presenceAt 未按层级包含取到下级在场（实 ' + at.length + '）');
if (!at[0].exact) problems.push('N2 ③ presenceAt 精确者未排前（层级包含必须可分）');
if (b3.samePlace('阿沅', '陆辞') !== true) problems.push('N2 ③ samePlace 未认层级包含（同处判定缺失）');
if (b3.samePlace('阿沅', '不存在') !== false) problems.push('N2 ③ samePlace 对不在场者未如实为 false');
if (b3.findByLeaf('钟楼') === null || b3.findByLeaf('钟楼').key !== '老城/钟楼') problems.push('N2 ③ findByLeaf 精确末级名查不到');
if (b3.findByLeaf('钟') !== null) problems.push('N2 ③ ★ findByLeaf 做了模糊匹配（猜出来的路径比没有路径更有害）');
// ④ 挂账
const o = b3.outlineOf(['老城', '钟楼']);
if (!o || o.places !== 2 || o.detailed !== 1 || o.depth !== 1) problems.push('N2 ④ outlineOf 广/深/细写读数不对：' + JSON.stringify(o));
if (!o || !/处场所/.test(o.self || '')) problems.push('N2 ④ 挂账自述句缺失（「这个地方有多大」仍答不出）');
if (b3.outlineOf(['不存在']) !== null) problems.push('N2 ④ 不存在地点未如实返回 null（编造 0）');
// ⑤ 覆盖度
const cov = b3.coverage();
if (!Array.isArray(cov.floors) || cov.floors.length === 0) problems.push('N2 ⑤ 覆盖度未逐楼列号');
if (typeof cov.floorCount !== 'number' || !Array.isArray(cov.steps)) problems.push('N2 ⑤ 覆盖度缺口面缺失');
// ⑥ 不变量三态可达（见 N3）

/* ---------- N3 ★ 不变量三态可达且互不同形 ---------- */
const okBook = new M.SceneBook();
if (okBook.checkInvariants().state !== 'ok') problems.push('N3 ok 态不可达（空书应为 ok）');
const warnBook = new M.SceneBook();
warnBook.setLocation(1, ['没登记过的地方']);       // 有轨迹无节点 ⇒ warn
const warnState = warnBook.checkInvariants();
if (warnState.state !== 'warn') problems.push('N3 warn 态不可达（有到访无节点应为 warn）');
if (!warnState.warnings.some(w => w.kind === 'visit-unregistered' || w.kind === 'track-unregistered')) {
    problems.push('N3 warn 态未给出可归因的 kind（读数可疑却说不清可疑在哪）');
}
const brokenBook = new M.SceneBook();
brokenBook.nodes.set('伪造/键', { path: ['别的', '路径'], desc: 'x', floor: 1, updatedAt: 1 });   // 键与 path 不符
const brokenState = brokenBook.checkInvariants();
if (brokenState.state !== 'broken') problems.push('N3 broken 态不可达（键与 path 不符必须判 broken）');
if (!brokenState.broken.some(b => b.kind === 'key-path-mismatch')) problems.push('N3 broken 态未给出 key-path-mismatch 归因');
const threeStates = new Set([okBook.checkInvariants().state, warnState.state, brokenState.state]);
if (threeStates.size !== 3) {
    problems.push('N3 ★ 不变量三态塌缩（可达 ' + threeStates.size + ' 态，应为 3）——三态不得压成两态');
} else notes.push('N3 不变量三态可达且互不同形：ok / warn / broken');

/* ---------- N4 ★ 三处旧缺陷已根除 ---------- */
// 【判据纯度】以下四条全是**源码形态**判据 ⇒ 一律对着 sbCode（去注释/去字面量）下结论。
//   本仓库反复踩过的形态：真代码已修，但**注释里还留着旧写法当说明**，
//   于是判据对着注释恒红（假红）；反过来也有「注释里提了新写法、真代码没改」的恒绿（假绿）。
//   形态判据读注释 = 判据失效。本档另配负控制证明这四条**会**对真破坏翻红。
// ① 哑雷：不得再有「三目优先级错位」的轨迹过滤，也不得再依赖隐式 _cutoff 状态
if (/\?\s*true\s*:\s*false/.test(sbCode)) {
    problems.push('N4 ① ★ 仍存在三目优先级错位式布尔折叠（`? true : false`）——哑雷未根除');
}
if (/\b_cutoff\b/.test(sbCode)) {
    problems.push('N4 ① ★ 仍依赖隐式 _cutoff 实例状态（有值时轨迹被静默清空，正是本版修掉的哑雷）');
}
if (!/rebuildFromOps\(cutoff\)\s*\{/.test(sbCode) || !/rollbackFrom\(floor, cutoff\)\s*\{/.test(sbCode)) {
    problems.push('N4 ① 轨迹切片未改为显式入参（隐式状态没被消掉）');
}
// ② 到访史存在、且**记账口只有一个**（import 是载入路径，不算第二真源）
if (!/this\.visits = new Map\(\)/.test(sbCode)) problems.push('N4 ② 到访史容器缺失（「去过几次」仍无处落脚）');
{
    const rs = sbCode.indexOf('_recordVisit(key, floor) {');
    const re = sbCode.indexOf('\n    }', rs);
    if (rs < 0 || re < 0) problems.push('N4 ② 记账单 _recordVisit 定位失败（判据面无法核对）');
    else {
        const body = sbCode.slice(rs, re);
        const inBody = (body.match(/this\.visits\.set\(/g) || []).length;
        if (inBody !== 1) problems.push('N4 ② 记账单内有 ' + inBody + ' 处 visits.set（应恰 1 处：到场史只能有一个真源）');
        const total = (sbCode.match(/this\.visits\.set\(/g) || []).length;
        const impStart = sbCode.indexOf('import(data) {');
        const inImport = impStart >= 0 ? (sbCode.slice(impStart).match(/this\.visits\.set\(/g) || []).length : 0;
        if (total !== inBody + inImport) problems.push('N4 ② 到访史在第 ' + (total - inBody - inImport) + ' 处写源（只允许记账单 + 载入路径）');
    }
}
// ③ _rebuild 必须同时重建 opsLog 与 track
{
    // [v3.221.0] R3-D：_rebuild 收了可选参（removedFloor）后不再匹配无参字面，
    //   段锚改为「标识符起、到 clear() 之前」—— 与判据语义（重建段内部）一致。
    const _rbAt = sbCode.indexOf('_rebuild(');
    const rb = sbCode.slice(_rbAt, sbCode.indexOf('clear() {', _rbAt));
    if (!/this\.visits\.clear\(\)/.test(rb)) problems.push('N4 ③ _rebuild 未重建到访史（删楼后到访读数是旧账影子）');
    if (!/for \(const t of \[\.\.\.this\.track\]/.test(rb)) problems.push('N4 ③ _rebuild 未按 track 回填到访史');
    if (!/this\.nodes\.clear\(\)/.test(rb)) problems.push('N4 ③ _rebuild 未清派生缓存');
}
// 删楼回滚不得手动扣减 visits（会被紧随的 _rebuild 覆盖 = 写了等于没写）
{
    const s = sbCode.indexOf('rollbackFloorOnly(floor) {');
    const e = sbCode.indexOf('rebuildFromOps(cutoff) {');
    if (s < 0 || e < 0 || e <= s) problems.push('N4 ③ rollbackFloorOnly 段无法定位（判据面失效）');
    else {
        const rf = sbCode.slice(s, e);
        if (/visits\.delete|visits\.set|\.count\s*-=|\.count--/.test(rf)) {
            problems.push('N4 ③ rollbackFloorOnly 仍在手动扣减到访史（与 _rebuild 双写源 ⇒ 读数会飘）');
        }
    }
}
// 重建可复现：同一现场重建前后到访 count 不得漂
{
    const rb = new M.SceneBook();
    rb.apply([{ action: 'add', path: ['甲', '乙'], desc: 'd' }], 2);
    rb.setLocation(2, ['甲', '乙']);
    rb.setLocation(6, ['甲', '乙']);
    const before = JSON.stringify(rb.visitsOf(['甲', '乙']));
    rb.rollbackFloorOnly(99);                 // 触发一次全量重建（不动真源）
    const after = JSON.stringify(rb.visitsOf(['甲', '乙']));
    if (before !== after) problems.push('N4 ③ 重建前后到访读数漂移（不可复现）：' + before + ' → ' + after);
    else notes.push('N4 ③ 重建可复现：到访读数重建前后一致');
}

/* ---------- N5 有界性（上限常量真被消费） ---------- */
for (const [name, re, why] of [
    ['MAX_NODES', /this\.nodes\.size <= MAX_NODES/, '节点裁剪'],
    ['MAX_TRACK', /this\.track\.length > MAX_TRACK/, '轨迹条数上限'],
    ['MAX_OPS', /this\.opsLog\.length > MAX_OPS/, 'opsLog 条数上限'],
    ['MAX_VISIT_KEYS', /this\.visits\.size >= MAX_VISIT_KEYS/, '到访史键上限'],
    ['MAX_VISIT_FLOORS', /v\.floors\.length > MAX_VISIT_FLOORS/, '单键楼层上限'],
    ['MAX_PRESENCE', /this\.presence\.size >= MAX_PRESENCE/, '在场索引上限'],
    ['MAX_SCAN', /scanned >= MAX_SCAN/, '子树遍历读取预算'],
    ['MAX_DESC', /slice\(0, MAX_DESC\)/, '描述字符上限'],
]) {
    if (!re.test(sb)) problems.push('N5 ' + name + ' 未真被消费（' + why + ' 只声明不执行）');
}
{
    const b = new M.SceneBook();
    for (let i = 0; i < 1200; i++) b.apply([{ action: 'add', path: ['城', 'p' + i], desc: '' }], 1);
    if (b.nodes.size > M.MAX_NODES + 2) problems.push('N5 节点裁剪未生效（' + b.nodes.size + ' > ' + M.MAX_NODES + '）');
    else notes.push('N5 有界性真生效：节点 ' + b.nodes.size + ' ≤ ' + M.MAX_NODES);
}

/* ---------- N6 缺席退路同形且如实 ---------- */
if (!/class SceneBookFallback\s*\{/.test(idx)) problems.push('N6 模块缺席无同形退路（宿主会外抛）');
for (const m of ['setLocation', 'whereIs', 'presenceAt', 'samePlace', 'findByLeaf', 'visitsOf', 'outlineOf', 'scale', 'coverage', 'checkInvariants', 'export', 'summary']) {
    if (!new RegExp('\\b' + m + '\\(\\)\\s*\\{').test(idx)) problems.push('N6 退路缺同形方法 ' + m + '（调用方会在模块缺席时外抛）');
}
if (!/_absent = true/.test(idx)) problems.push('N6 退路未标记缺席（读数会被误当成「真实现说没有」）');
if (!/this\.scene\._absent/.test(idx)) problems.push('N6 缺席标记未被诊断面消费（缺席了也没人知道）');
if (/class SceneBook\s*\{/.test(idx)) problems.push('N6 ★ index.js 里仍有第二份 SceneBook 实现（两份实现必然漂移）');

/* ---------- N7 结构健康与负向自证 ---------- */
if (!FIXTURE_MODE) {
    const faces = consumers.length;
    if (faces < 12) { console.error('[v3181-场所图景] 判定面塌缩（faces=' + faces + '）——探测器可能失效'); process.exit(2); }
    const lines = sb.split('\n').length;
    if (lines < 600) { console.error('[scene-book.js] 模块过短（' + lines + ' 行 < 600）——可能被截断'); process.exit(2); }
    if (threeStates.size !== 3 && !problems.some(p => p.indexOf('N3') === 0)) {
        console.error('[v3181-场所图景] 三态口径塌缩且 N3 未报——探测器口径失效');
        process.exit(2);
    }
    if (!/SCENE_VERSION = \d+/.test(sb)) { console.error('[scene-book.js] 结构版本常量缺失——结构漂移'); process.exit(2); }
}

/* ---------- 输出 ---------- */
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.error('\n[v3181-场所图景] 发现 ' + problems.length + ' 处缺陷：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ v3.181 场所图景：六面可读（树/到访/在场/挂账/覆盖/不变量）· 三态可达 ok|warn|broken · '
    + '三处旧缺陷（哑雷/无到访史/清了没人重建）已根除 · 有界 · 缺席退路同形如实（' + notes.length + ' 项结构证据）');
