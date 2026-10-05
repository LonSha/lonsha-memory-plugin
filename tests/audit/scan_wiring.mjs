// 审计基建 A（v2）：接线完整性扫描 —— 修正为本项目实际结构
// 结构事实：IIFE 内 4sp class，8sp 方法；配置块为 ConfigManager 内 `this.config = {`
/*
 * 退出码（[v3.247.0] 补自述；语义表见 tests/_exit_codes.mjs）：
 * 退出码：0 = 卫生（判据跑完且无缺陷）  1 = 真缺陷（**检查对象**违反判据）  2 = 结构漂移（**探测器**失效，拒绝给结论）
 */
import fs from 'fs';
const idx = fs.readFileSync('index.js', 'utf8');
const ui = fs.readFileSync('settings-ui.js', 'utf8');
const lines = idx.split('\n');
/* [v3.267.0 A1 第七刀] 配置面改读「入口 + memory-config.js」合看。
 *   为什么只扩配置面、不动方法面（A5/A7）与持久化面（A8）：ConfigManager 整类外移后，
 *   它的 `this.config = {` 默认块不再在入口 —— 配置面若仍只读入口，`cfgStart` 会命中
 *   退路实例上的 `this.config = {};`（键数 0）⇒ A1 键数 < 100 ⇒ exit 2（探测器失效）。
 *   而方法面 / 持久化面在**前六刀**就已确立「只读入口」的口径（六刀剥走的类同样不在入口），
 *   本刀不单方面更改那条既立口径，只在此显式记账这一分层。
 *   配置面的行号体系随之改为合看面，故 readCount 的「跳过块内行」也走合看行面。 */
const cfgModSrc = (function () {
    try { return fs.readFileSync('memory-config.js', 'utf8'); }
    catch (_e) { return ''; }
})();
/* [v3.267.0] 判别锚：真默认块是 `{\n`（后紧跟换行），退路是 `{};`（同行闭合）。
 *   用裸 `this.config = {` 会在合看面上先命中宿主 L1422 的退路空对象（键数 0 ⇒ exit 2）。 */
const cfgFace = idx + String.fromCharCode(10) + cfgModSrc;
const cfgFaceLines = cfgFace.split('\n');
/* ---------- 0. 结构预检（v3.159 补） ---------- */
// 本脚本旧版没有任何 exit 语句：所有指标都是计数，不管数字多不合理，进程都以 0 退出。
//   一旦 index.js / settings-ui.js 退化（空文件、结构改名），它会报「配置键 0 / 方法 0 / 孤儿 0」并「通过」。
//   所以这里同样先验输入，再把已知为零的硬缺陷变成阻断条件。
const MIN_IDX_BYTES = 100000;
const MIN_UI_BYTES = 20000;
const MIN_CFG_KEYS = 100;
if (idx.length < MIN_IDX_BYTES || ui.length < MIN_UI_BYTES) {
    console.error('[wiring] 输入退化（index.js ' + idx.length + ' 字节 / settings-ui.js ' + ui.length + ' 字节），审计脚本需同步结构变化');
    process.exit(2);
}
// 体量还不够：ui_trunc 场景（截断到前 200 行）字节数仍可能超过下限，但配置控件已经不在了。
//   故再验一个与结构直接相关、与文件大小无关的量：UI 侧 data-cfg* 控件数。
const MIN_UI_CFG_CTRLS = 30;   // 当前实测 data-cfg* 出现 67 次；截断到前 200 行时为 0
const uiCfgCtrls = (ui.match(/data-cfg/g) || []).length;
if (uiCfgCtrls < MIN_UI_CFG_CTRLS) {
    console.error('[wiring] settings-ui.js 仅含 ' + uiCfgCtrls + ' 个 data-cfg* 控件（低于下限 ' + MIN_UI_CFG_CTRLS + '），UI 抽取面已退化，审计脚本需同步结构变化');
    process.exit(2);
}

function braceBlock(text, fromIdx) {
    let i = text.indexOf('{', fromIdx), depth = 0;
    const start = i;
    for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
    }
    return text.slice(start, i + 1);
}

// ---------- 1. 配置默认值键 ----------
const CFG_ANCHOR = 'this.config = {' + String.fromCharCode(10);
const cfgStart = cfgFace.indexOf(CFG_ANCHOR);
if (cfgStart < 0) {
    console.error('[wiring] 合看面（入口 + memory-config.js）里找不到 this.config = {，审计脚本需同步结构变化');
    process.exit(2);
}
const cfgBlock = braceBlock(cfgFace, cfgStart);
const cfgKeys = new Set();
for (const km of cfgBlock.matchAll(/^\s{12,20}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)) cfgKeys.add(km[1]);
if (cfgKeys.size < MIN_CFG_KEYS) {
    console.error('[wiring] 仅抽到 ' + cfgKeys.size + ' 个配置键（低于下限 ' + MIN_CFG_KEYS + '），配置块抽取器已失效，本次结果不具证明力');
    process.exit(2);
}

// ---------- 2. UI 键 ----------
const uiKeys = new Set();
for (const km of ui.matchAll(/['"]([a-zA-Z_][a-zA-Z0-9_]{2,40})['"]/g)) uiKeys.add(km[1]);
for (const km of ui.matchAll(/config(?:\?)?\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) uiKeys.add(km[1]);

// ---------- 3. 配置键在别处的出现次数 ----------
const cfgL0 = cfgFace.slice(0, cfgStart).split('\n').length;
const cfgL1 = cfgL0 + cfgBlock.split('\n').length;
const readCount = {};
for (const k of cfgKeys) {
    const re = new RegExp(`\\b${k}\\b`);
    let n = 0;
    /* [v3.267.0] 行面随之改合看面：cfgL0/cfgL1 是合看面坐标，与 lines（入口面）不同体系。 */
    for (let i = 0; i < cfgFaceLines.length; i++) {
        if (i + 1 >= cfgL0 && i + 1 <= cfgL1) continue;
        if (re.test(cfgFaceLines[i])) n++;
    }
    readCount[k] = n;
}

// ---------- 4. 方法定义（8sp） vs 调用 ----------
const defined = new Map();
for (let i = 0; i < lines.length; i++) {
    const dm = lines[i].match(/^ {8}(?:async\s+)?(?:static\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
    if (!dm) continue;
    const n = dm[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'constructor', 'else', 'do', 'try'].includes(n)) continue;
    if (!defined.has(n)) defined.set(n, []);
    defined.get(n).push(i + 1);
}
const orphan = [], dup = [];
for (const [n, at] of defined) {
    if (at.length > 1) dup.push(`${n} @${at.join(',')}`);
    const callRe = new RegExp(`\\w\\??\\.${n}\\s*\\(|\\['${n}'\\]|["']${n}["']`, 'g');
    const cIdx = (idx.match(callRe) || []).length;
    const cUi = (ui.match(new RegExp(`\\.${n}\\s*\\(|["']${n}["']`, 'g')) || []).length;
    if (cIdx + cUi === 0) orphan.push(`${n} @${at[0]}`);
}

// ---------- 5. 输出 ----------
const neverRead = Object.entries(readCount).filter(([, v]) => v === 0).map(([k]) => k);
const noUi = [...cfgKeys].filter(k => !uiKeys.has(k));

console.log('=== A1 配置键总数:', cfgKeys.size, `(块位于 L${cfgL0}-L${cfgL1})`);
console.log('=== A2 定义但从未在别处出现的配置键 (' + neverRead.length + '):');
console.log(neverRead.length ? '  ' + neverRead.join(', ') : '  （无）');
console.log('=== A3 有默认值但 UI 完全未提及 (' + noUi.length + '):');
console.log(noUi.length ? '  ' + noUi.join(', ') : '  （无）');
console.log('=== A5 方法定义总数:', defined.size);
console.log('=== A6 同名方法多处定义 (' + dup.length + '):');
console.log(dup.length ? '  ' + dup.join('\n  ') : '  （无）');
/* ---------- A7 方法级死代码台账（v3.227.0 重写：由「形态漏报」升级为「分域 + 冻结基线」） ----------
 * 旧口径只认「裸名字 + 可选空格 + (`，且**扫不到两种真实写法** —— 实测：
 *   · `this.getNpcTiesPrompt?.()`（可选调用；旧口径记为 orphan，实际是活代码）；
 *   · `'getPublicData'`（引号里的公共出口名，由桥按名调用；旧口径同样记为 orphan）。
 * 误报 93 条 ≈ 全是这两类，读者最终会**不再看这个数** —— 那比没有这个数更坏。
 * 新口径按出现**形态**分域，并把「零引用」冻结成基线（新增即红，改动要留理由）：
 *   call  name( / name?.(            （真调用）
 *   opt   ?.name?.(                     （可选链调用，旧口径漏的形态之一）
 *   prop  name:                         （对象键 / 标签表）
 *   q     引号中的名字                   （公共出口 / 桥按名取，旧口径漏的形态之二）
 *   test  仅测试引用                     （对外契约面：供测试直调；由测试自己守着）
 *   zero  以上全无                       ⇒ 真零引用（**硬失败**）
 * 冻结基线：tests/audit/<files>.tsv —— zero 集合必须与之逐条一致（多一条即红）。
 * [v3.279.0 O7] 声明面从「方法」扩到「方法 + 函数声明 + 顶层常量表」，引用面从「根级 .js + tests/*.mjs」
 *   扩到含 tests/audit 与 tools。两条扩面的共同理由：**判据的面漏一类，结论就完全反了**
 *   （函数声明级死代码在本仓真实存在过，而 A7 一直报「零引用 0」）。
 */
const DEF_RE = /^(\s*)(?:async\s+)?(?!if|for|while|switch|catch|return|function\b)([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/;
/* [v3.279.0 O7] 面扩展到**声明级**：本轮实测踩到的盲区 —— DEF_RE 的负向断言显式排除 `function\b`，
 *   顶层 `const <表> = [` 也不在面内，于是 `collectCycleTasks` / `TIME_WORDS_ZH` 这类**永不会被调用的声明**
 *   在 A7 里完全不可见（读数「零引用 0」被误读成「没有死代码」）。三条正则各自独立，定义行集合按名合并。 */
const FN_RE = /^(\s*)(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const CT_RE = /^(\s{4})const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*[\[{]/;
const defLines = new Map();   // name -> Set(line)
for (let i = 0; i < lines.length; i++) {
    const m = DEF_RE.exec(lines[i]);
    if (!m) continue;
    if (!defLines.has(m[2])) defLines.set(m[2], new Set());
    defLines.get(m[2]).add(i + 1);
}
/* [v3.279.0 O7] 函数声明与顶层常量表同样入面：后者被 DEF_RE 的负向断言排除，前者本就不带参数表 `{`。 */
for (let i = 0; i < lines.length; i++) {
    const m = FN_RE.exec(lines[i]);
    if (!m) continue;
    if (!defLines.has(m[2])) defLines.set(m[2], new Set());
    defLines.get(m[2]).add(i + 1);
}
for (let i = 0; i < lines.length; i++) {
    const m = CT_RE.exec(lines[i]);
    if (!m) continue;
    if (!defLines.has(m[2])) defLines.set(m[2], new Set());
    defLines.get(m[2]).add(i + 1);
}
const WORD = "A-Za-z0-9_$";
const QCH = String.fromCharCode(39, 34, 96);   // 引号三形态：' " `
const FORM = {
    call: (n) => new RegExp('(?<![' + WORD + '])' + n + '[\\s]*[(]'),
    // 可选调用是 `name?.(`（?. 在名字**之后**）；首稿写成 `?.name?.(` ⇒ 真写法全被漏判。
    opt: (n) => new RegExp('(?<![' + WORD + '])' + n + '[\\s]*[?][.][\\s]*[(]'),
    prop: (n) => new RegExp('(?<![' + WORD + '])' + n + '[\\s]*:'),
    q: (n) => new RegExp('[' + QCH + ']' + n + '[' + QCH + ']'),
};
const methodHits = {};
for (const name of defLines.keys()) methodHits[name] = { call: 0, opt: 0, prop: 0, q: 0, test: 0 };
const KNOWN_TESTS = fs.existsSync('tests') ? fs.readdirSync('tests').filter((f) => f.endsWith('.mjs')) : [];
/* [v3.227.0] A7 的扫描面必须含**全部根级模块**：首稿只扫 index.js，于是 `fetchModels` 与
 *   `unlockFact` 被判成零引用 —— 它们的调用点在 **settings-ui.js**（同一根目录的另一模块，
 *   `this.engine.llm.fetchModels(...)` / `s.unlockFact(...)`）。判据的面漏了一个文件，
 *   结论就完全反了（真死代码 vs 活代码）。 */
const ROOT_MODULES = fs.existsSync('.') ? fs.readdirSync('.').filter((f) => f.endsWith('.js') && !f.endsWith('.bak')).sort() : [];
const MOD_BLOB = {};
for (const mf of ROOT_MODULES) { try { MOD_BLOB[mf] = mf === 'index.js' ? idx : fs.readFileSync(mf, 'utf8'); } catch (e) { /* 读不到跳过 */ } }
// 测试面 blob：**先读一次**再逐个方法查（首稿在方法循环里逐文件读 ⇒ 434 x 269 = 116k 次读盘）。
const TEST_BLOB = {};
for (const tf of KNOWN_TESTS) { try { TEST_BLOB[tf] = fs.readFileSync('tests/' + tf, 'utf8'); } catch (e) { /* 读不到跳过 */ } }
/* [v3.279.0 O7] 引用面须含**审计脚本与工具**：`_cacheWorkloadLib` 的唯一消费点是
 *   tests/audit/scan_v3254_cache_identity.mjs（取库口台账）。只在「根级 .js + tests/*.mjs」两面里找，
 *   会把它判成真死声明 —— 与 v3.227.0「面漏一个文件，结论就完全反了」同型。 */
const AUDIT_BLOB = {};
try {
    for (const af of fs.readdirSync('tests/audit')) {
        const p = 'tests/audit/' + af;
        try { if (fs.statSync(p).isFile()) AUDIT_BLOB[p] = fs.readFileSync(p, 'utf8'); } catch (e) { /* 跳过 */ }
    }
} catch (e) { /* 无 tests/audit 目录：跳过（结构漂移由别处判） */ }
const TOOL_BLOB = {};
try {
    for (const kT of fs.readdirSync('tools')) {
        const p = 'tools/' + kT;
        try { if (fs.statSync(p).isFile()) TOOL_BLOB[p] = fs.readFileSync(p, 'utf8'); } catch (e) { /* 跳过 */ }
    }
} catch (e) { /* 无 tools 目录：跳过 */ }
for (const name of defLines.keys()) {
    const forms = {};
    for (const k of ['call', 'opt', 'prop', 'q']) forms[k] = FORM[k](name.replace(/[$]/g, '\$'));
    for (const mf of Object.keys(MOD_BLOB)) {
        const mLines = mf === 'index.js' ? lines : MOD_BLOB[mf].split('\n');
        for (let i = 0; i < mLines.length; i++) {
            const ln = i + 1;
            if (mf === 'index.js' && defLines.get(name).has(ln)) continue;   // 只跳过定义行（只在本文件里有意义）
            const l = mLines[i];
            if (!l.includes(name)) continue;
            if (forms.opt.test(l)) methodHits[name].opt++;
            else if (forms.call.test(l)) methodHits[name].call++;
            else if (forms.prop.test(l)) methodHits[name].prop++;
            else if (forms.q.test(l)) methodHits[name].q++;
        }
    }
    for (const tf of Object.keys(TEST_BLOB)) {
        if (TEST_BLOB[tf].includes(name)) methodHits[name].test++;
    }
    /* [v3.279.0 O7] 审计/工具面命中也算「有面守着」，与 TEST_BLOB 同桶。 */
    for (const kA of Object.keys(AUDIT_BLOB)) {
        if (AUDIT_BLOB[kA].includes(name)) methodHits[name].test++;
    }
    for (const kA of Object.keys(TOOL_BLOB)) {
        if (TOOL_BLOB[kA].includes(name)) methodHits[name].test++;
    }
}
const zeroRefs = [], testOnly = [];
for (const [name, h] of Object.entries(methodHits)) {
    if (h.call || h.opt || h.prop || h.q) continue;
    if (h.test) testOnly.push(name); else zeroRefs.push(name);
}
zeroRefs.sort(); testOnly.sort();
console.log('=== A7 声明级死代码台账（v3.279.0 扩面：方法 + 函数声明 + 顶层常量表）: 声明 ' + defLines.size + ' / 有真引用 ' + (defLines.size - zeroRefs.length - testOnly.length) + ' / 仅测试·审计 ' + testOnly.length + ' / 零引用 ' + zeroRefs.length + ' ===');
console.log('=== A7.1 零引用（真死代码，硬失败） (' + zeroRefs.length + '):');
console.log(zeroRefs.length ? '  ' + zeroRefs.join(String.fromCharCode(10) + '  ') : '  （无）');
console.log('=== A7.2 仅测试/审计引用（对外契约面，由测试与扫描器守着） (' + testOnly.length + '):');
console.log(testOnly.length ? '  ' + testOnly.join(', ') : '  （无）');
const DEAD_BASELINE = 'tests/audit/scan_wiring_dead_methods.tsv';
let baselineList = null;
if (fs.existsSync(DEAD_BASELINE)) {
    baselineList = fs.readFileSync(DEAD_BASELINE, 'utf8').split(String.fromCharCode(10))
        .map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).sort();
}
if (baselineList === null) {
    console.error('');
    console.error('[wiring] A7 冻结基线缺失：' + DEAD_BASELINE + '（新口径必须有基线，否则「零引用」无法分「已知」与「新增」）');
    process.exit(2);
}
/* ---------- 6. [v3.131] 持久化对称性审计（stbme 单真源）：collectExport 导出键 vs storage.load 恢复引用键 ---------- */
const ceStart = idx.indexOf('collectExport() {');
const ceEnd = idx.indexOf('getCurrentChatId() {', ceStart);
const ceBlock = idx.slice(ceStart, ceEnd);
const ldStart = idx.indexOf('async load(chatId, opts = {}) {');
const ldEnd = idx.indexOf('class EmergencyBackup', ldStart);
let ldBlock = idx.slice(ldStart, ldEnd);
// [v3.138] CP-L2: 恢复管线单真源 restoreFromPayload 也是恢复面的一部分（load 收编后 data.<key> 引用在此处）
const rpStart = idx.indexOf('restoreFromPayload(data) {');
const rpEnd = idx.indexOf('getCurrentChatId() {', rpStart);
if (rpStart >= 0 && rpEnd > rpStart) ldBlock += idx.slice(rpStart, rpEnd);
const exportKeys = new Set();
for (const km of ceBlock.matchAll(/^\s*(\w+):\s*this\./gm)) exportKeys.add(km[1]);
// 导出键的恢复写法有两种：engine.xxx.import(data.key) / data.key 直赋；放宽为 data.key 在 load 块出现即可
const exportOnly = [...exportKeys].filter(k => !new RegExp(`data\\.${k}\\b`).test(ldBlock));
// 反向：load 读取但 collectExport 不导出的键（排除游标等由其他路径写入的键）
const cursorKeys = new Set(['diaryInjectFloor', 'timelineInjectFloor']);
const loadOnly = [...ldBlock.matchAll(/data\.(\w+)/g)].map(m => m[1])
    .filter(k => !exportKeys.has(k) && !cursorKeys.has(k) && !ceBlock.includes(`${k}:`))
    .filter((k, i, a) => a.indexOf(k) === i);
console.log('=== A8 持久化对称性: collectExport 导出键', exportKeys.size, '/ load 恢复引用键', (ldBlock.match(/data\.\w+/g) || []).length, '===');
console.log('=== A8.1 存而不读（导出但 load 无 data.<key> 恢复） (' + exportOnly.length + '):');
console.log(exportOnly.length ? '  ' + exportOnly.join(', ') + '\n  ⚠ 这些键换会话会归零' : '  （无）');
console.log('=== A8.2 读而无存（load 读取但 collectExport 不导出） (' + loadOnly.length + '):');
console.log(loadOnly.length ? '  ' + loadOnly.join(', ') + '\n  ⚠ 这些键恢复永远为空' : '  （无）');
/* ---------- 7. 终局判定（v3.159 补）：把已知为零的硬缺陷变成阻断条件 ---------- */
// A8.1/A8.2 是实质缺陷（存而不读 = 换会话归零；读而无存 = 恢复永远为空），不是参考信息。
//   当前两项均为 0，故可以直接升为红线：以后新增字段忘写恢复侧时，这里会截断而不是埋在输出里。
const hardFails = [];
if (exportOnly.length) hardFails.push('A8.1 存而不读 ' + exportOnly.length + ' 个: ' + exportOnly.join(', '));
if (loadOnly.length) hardFails.push('A8.2 读而无存 ' + loadOnly.length + ' 个: ' + loadOnly.join(', '));
// [v3.227.0] A7.1 零引用同样是实质缺陷（注册了但没人调 ⇒ 永不执行）；用冻结基线分「已知」与「新增」，新增即硬失败。
const newDead = zeroRefs.filter((n) => !baselineList.includes(n));
const goneDead = baselineList.filter((n) => !zeroRefs.includes(n));
if (newDead.length) hardFails.push('A7.1 新增零引用方法（本面含函数声明与顶层常量表） ' + newDead.length + ' 个: ' + newDead.join(', '));
if (goneDead.length) hardFails.push('A7.1 基线里的方法已不再零引用（请更新基线；本面含函数声明与顶层常量表）: ' + goneDead.join(', '));
if (hardFails.length) {
    console.error('');
    console.error('[wiring] 发现 ' + hardFails.length + ' 类硬缺陷：');
    for (const h of hardFails) console.error('  x ' + h);
    process.exit(1);
}
console.log('');
console.log('[wiring] 通过：配置键、方法调用与持久化对称性均无硬缺陷。');
process.exit(0);
