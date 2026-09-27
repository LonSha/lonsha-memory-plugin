// 审计门禁：证据面契约（九账登记 ↔ 宿主取库 ↔ 加载面）—— 计划 #11 + #12 [v3.248.0]
// ------------------------------------------------------------
// 为什么存在（本版实测，不是「整洁性偏好」）：
//   `evidence-workbench.js` 的 `LEDGERS` 是九账的**单一真源登记表**：每项声明
//   id / label / apiGlobal / state / pick / keyOf / project。宿主侧 `_ledgerApis()`
//   按同一批 id 取库，`manifest.extra_js` 决定谁被加载。**三处各写一份名单**，
//   而同名不同源正是本仓治理过多轮的形态（v3.191 stripComments 分裂 4 变体、
//   v3.246 账本名册四处手抄、v3.247 破坏形态 27 份各写一份）。本门禁开跑前实测：
//     · `grep -rln 'apiGlobal' tests/` **零命中** —— 这张登记表**从来没有任何判据**；
//     · 把 `apiGlobal: 'LonShaSeedLedger'` 改个名 ⇒ 宿主仍取旧键 ⇒ `readLedger`
//       落 `absent / module-unavailable` ⇒ **工作台永远显示「模块未挂」**，
//       而全仓没有一道门会响。这正是本仓一直在治的**静默失效**。
//     · 九键内联版在宿主里出现过一次并**当场自伤**（见 index.js 的 `_ledgerApis`
//       注释：六个未定义引用 ⇒ `_evidenceWorkbench()` 每次抛 ReferenceError，
//       被外层 catch 吞成 `reason:'thrown'` ⇒ 工作台永远「不可用」且**不报错**）。
//       同形回潮此前没有任何判据挡。
//   R6 是第二种静默失效：`project(it, api)` 的**第 2 参**。v3.233.0 起
//   event-completeness 那一本要靠 `api` 取段真值；调用点若退化成 `project(it)`，
//   该本账**不抛**、只是投影列少一截 —— 读数错而不报错。
// 判据：
//   R1 证据面在场：模块登记进 `manifest.extra_js`，且导出 `LonShaEvidenceWorkbench`
//   R2 登记表结构：九项各带 id / label / apiGlobal / state / pick / keyOf，id 互异
//   R3 **存活性（计划 #11）**：每个 `apiGlobal` 名必须在宿主取库面里按名出现
//   R4 **加载面**：宿主声明的每个证据模块文件名都在 `manifest.extra_js` 里且磁盘存在
//      （不在 extra_js ⇒ 浏览器静默不加载 ⇒ 九账全落 absent；不存在 ⇒ 同上）
//   R5 **键集对差**：`_ledgerApis()` 的键集 == `LEDGERS` 的 id 集（多/少/改名都响）
//   R6 **project 调用点兼容（计划 #12）**：调用点必须传第 2 参 `api`，且每个
//      `project` 都是函数（口径：**兼容性**检查，不是「签名完全一致」——
//      实测 9 处定义中 8 处 `(it)`、1 处 `(it, api)`，按字面要求一致会误伤 8 处）
//   R7 反重复：九键不得在宿主工作方法里再内联一份裸取库
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测对象不在 ⇒ fail-closed）
// 夹具通道：`LONSHA_AUDIT_ROOT` 指定被测根（镜像树单测用）
import fs from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, bodyOf } from '../_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(HERE, '..', '..');
const readOrNull = (p) => { try { return fs.readFileSync(p, 'utf-8'); } catch (e) { return null; } };
/* 结构漂移一律走这里；退出码写**字面量**而不是变量 —— 静态守卫要能看出本脚本会 fail-closed */
function bail(msg) {
    console.error('[evidence-binding] ' + msg);
    process.exit(2);
}
const defects = [];

/* ---------- 0. 结构预检（fail-closed） ---------- */
const wbSrc = readOrNull(path.join(ROOT, 'evidence-workbench.js'));
if (wbSrc == null) bail('找不到 evidence-workbench.js：证据面不在，判据无从谈起（' + ROOT + '）');
const idxSrc = readOrNull(path.join(ROOT, 'index.js'));
if (idxSrc == null) bail('找不到 index.js');
const mfRaw = readOrNull(path.join(ROOT, 'manifest.json'));
if (mfRaw == null) bail('找不到 manifest.json');
let manifest;
try { manifest = JSON.parse(mfRaw); } catch (e) { bail('manifest.json 解析失败：' + e.message); }
const extra = Array.isArray(manifest.extra_js) ? manifest.extra_js.slice() : [];
if (!extra.length) bail('manifest.extra_js 为空：加载面抽取器已失效');

/* ---------- R1 证据面在场 ---------- */
if (extra.indexOf('evidence-workbench.js') < 0) {
    defects.push('R1 evidence-workbench.js 未登记进 manifest.extra_js —— 不登记 = 不加载 = 工作台永远缺席');
}
if (wbSrc.indexOf('root.LonShaEvidenceWorkbench = api') < 0) {
    defects.push('R1 证据面未导出 LonShaEvidenceWorkbench（宿主 `_moduleLib(() => window.LonShaEvidenceWorkbench, …)` 会一直取空）');
}

/* ---------- R2 登记表结构 ---------- */
const specRe = /id:\s*'([^']+)',\s*label:\s*'([^']+)',\s*apiGlobal:\s*'([^']+)'/g;
const specs = [];
let sm;
while ((sm = specRe.exec(wbSrc)) !== null) specs.push({ id: sm[1], label: sm[2], apiGlobal: sm[3] });
if (!specs.length) bail('LEDGERS 里一条 `id/label/apiGlobal` 都解析不出：登记表被改写或抽取器失效');
const ids = specs.map((s) => s.id);
if (new Set(ids).size !== ids.length) defects.push('R2 登记表 id 有重复：' + ids.join('/') + '（同一本账登记两次 ⇒ 三态计数与 selfConsistent 不可信）');
for (const s of specs) {
    for (const [k, re] of [['state', new RegExp("id:\\s*'" + s.id + "'[\\s\\S]{0,900}?state\\s*:")],
        ['pick', new RegExp("id:\\s*'" + s.id + "'[\\s\\S]{0,900}?pick\\s*:")],
        ['project', new RegExp("id:\\s*'" + s.id + "'[\\s\\S]{0,900}?project\\s*:")]]) {
        if (!re.test(wbSrc)) defects.push('R2 登记项 ' + s.id + ' 缺 ' + k + ' 字段（登记表是单一真源，缺字段 = 该本账的读数面不完整）');
    }
}
/* [v3.248.0 判据自纠 ×2] 两条只在健康树上暴露的判据缺陷，留痕：
 *   ① 初版把 `keyOf` 列为**必需**字段 ⇒ 健康树上 8 项被判缺字段、门禁误红。
 *      真值：登记表注释原文写的是「keyOf **（可选**；条目没有 `id` 时用它）」——
 *      判据比契约更严，就是判据错了。改为「出现时必须是函数形态」，不要求九项都有。
 *   ② 初版 R7 用 `window.<global>` 在 **index.js 全文件**的计数判「内联回潮」⇒ 8 项误红。
 *      真值：那些命中是**别处业务面的合法直读**（如 `const seedApi = window.LonShaSeedLedger`，
 *      实测 3~4 处/键），与「工作台九键各写一份」不是一回事。
 *      R7 的原意是**工作台**不得内联 ⇒ 判据收窄到 `_evidenceWorkbench()` 体内。 */
if (/keyOf\s*:/.test(wbSrc) && !/keyOf\s*:\s*\(/.test(wbSrc)) {
    defects.push('R2 keyOf 出现但不是函数形态（登记表把它当 `(item) => ref` 用）');
}

/* ---------- 宿主取库面：解析 `_ledgerApis()` ---------- */
const idxCode = stripComments(idxSrc);
/* [v3.248.0 自纠] 锚点必须点名 `function`：直接用 `_ledgerApis()` 会命中的是
 *   `_evidenceWorkbench()` 里的**调用点** `const apis = _ledgerApis();` ——
 *   bodyOf 会取到 `{ apis: apis }` 这个对象字面量，于是「九键一个都解析不出」，
 *   门禁在健康树上 fail-closed。这是本仓的老形态：**锚点落在调用点而不是定义点**。 */
const apiBody = bodyOf(idxCode, 'function _ledgerApis(');
if (!apiBody) bail('index.js 里找不到 `function _ledgerApis(` 定义体：宿主取库面探测对象不在（判据失去对差锚）');
const entries = [];
const ENTRY_RE = /'([^']+)'\s*:\s*(?:safe\(\(\)\s*=>\s*window\.(\w+)\s*,\s*'([^']+)'\)|_(\w+)\(\))/g;
let em;
while ((em = ENTRY_RE.exec(apiBody)) !== null) {
    if (em[2] && em[3]) { entries.push({ key: em[1], globalName: em[2], file: em[3] }); continue; }
    const helper = em[4];
    const hb = bodyOf(idxCode, 'function _' + helper + '(');
    const hm = hb && /window\.(\w+)\s*,\s*'([^']+)'/.exec(hb);
    if (!hm) {
        defects.push('R3 取库助手 _' + helper + '() 里取不到「window 全局名 + 文件名」：形如 _moduleLib(() => window.X, \'x.js\')');
        continue;
    }
    entries.push({ key: em[1], globalName: hm[1], file: hm[2] });
}
if (!entries.length) bail('`_ledgerApis()` 里一个取库项都解析不出：宿主取库面被改写（九键内联/改名/换写法）');

/* ---------- R3 存活性：apiGlobal 名必须在宿主取库面里按名出现（计划 #11） ---------- */
const hostGlobals = new Set(entries.map((e) => e.globalName));
const hostByKey = new Map(entries.map((e) => [e.key, e]));
for (const s of specs) {
    if (!hostGlobals.has(s.apiGlobal)) {
        defects.push('R3 登记表 ' + s.id + '(' + s.label + ') 声明 apiGlobal=' + s.apiGlobal
            + '，但宿主取库面里没有这个名字 —— 改这名 = 工作台永远显示「模块未挂」且不报错（存活性缺口）');
    } else {
        const e = entries.find((x) => x.globalName === s.apiGlobal);
        if (e && e.key !== s.id) {
            defects.push('R3 登记表 id=' + s.id + ' 与宿主键=' + e.key + ' 指向同一个全局 ' + s.apiGlobal
                + '：同一本账两个身份，读数会被记到另一行');
        }
    }
}

/* ---------- R4 加载面：宿主声明的文件必须在 extra_js 里且磁盘存在 ---------- */
for (const e of entries) {
    if (extra.indexOf(e.file) < 0) {
        defects.push('R4 宿主为 ' + e.key + ' 取 ' + e.file + '，但它不在 manifest.extra_js —— 浏览器静默不加载 ⇒ 该本账永远 absent');
    } else if (!fs.existsSync(path.join(ROOT, e.file))) {
        defects.push('R4 宿主为 ' + e.key + ' 取 ' + e.file + '，磁盘上不存在该文件（改名/删除后宿主未跟改）');
    }
}

/* ---------- R5 键集对差 ---------- */
const hostKeys = entries.map((e) => e.key).sort();
const specIds = ids.slice().sort();
const missHost = specIds.filter((k) => hostKeys.indexOf(k) < 0);
const missSpec = hostKeys.filter((k) => specIds.indexOf(k) < 0);
if (missHost.length) defects.push('R5 登记表有而宿主取库面没有的键：' + missHost.join('/') + '（该本账永远读成缺席）');
if (missSpec.length) defects.push('R5 宿主取库面有而登记表没有的键：' + missSpec.join('/') + '（取了库但没人读 ⇒ 又一处「有字段没人读」）');
if (hostKeys.length !== hostGlobals.size) defects.push('R5 宿主取库面有重复全局名（两键取同一个 window 对象）');

/* ---------- R6 project 调用点兼容（计划 #12） ---------- */
const projDefs = wbSrc.match(/project:\s*\(it[^)]*\)\s*(?:=>|\{)/g) || [];
if (!projDefs.length) bail('`project:` 一处都解析不出：投影面被改写（本判据失去对象）');
for (const d of projDefs) {
    if (!/^project:\s*\(it(\s*,\s*api)?\)/.test(d)) {
        defects.push('R6 project 定义形态异常：' + JSON.stringify(d) + '（只接受 (it) 或 (it, api)）');
    }
}
const callRe = /spec\.project\s*\?\s*spec\.project\(\s*([^)]*)\)/;
const cm = callRe.exec(wbSrc);
if (!cm) {
    defects.push('R6 找不到 `spec.project(it, api)` 调用点：投影调用面被改写，无法判定第 2 参是否传');
} else if (!/\bapi\b/.test(cm[1])) {
    defects.push('R6 project 调用点退化为单参（`' + cm[0] + '`）—— 靠 api 取段真值的那本账不抛、只是投影列少一截：读数错而不报错');
}

/* ---------- R7 反重复：**工作台**不得再内联一份裸取库 ---------- */
/* [v3.248.0 判据自纠 ③] bodyOf 的**裸名**形式只认 `function name(` / `const name =`，
 *   而 `_evidenceWorkbench()` 是**类方法**（`_evidenceWorkbench() {`）⇒ 裸名取不到（实测 fail）。
 *   更贵的是：若改用 `_evidenceWorkbench()` 作 marker，先命中的是 7716 行的
 *   **调用点** `this._evidenceWorkbench()`（同 `_ledgerApis()` 那种「锚点落在调用点」的形态）。
 *   故 marker 必须带 `() {`，唯一命中定义行。 */
const wbHost = bodyOf(idxCode, '_evidenceWorkbench() {') || '';
if (!wbHost) {
    defects.push('R7 找不到 `function _evidenceWorkbench(` 宿主方法：「九键内联」回潮与否无从判定');
} else {
    for (const e of entries) {
        if (wbHost.indexOf('window.' + e.globalName) >= 0) {
            defects.push('R7 window.' + e.globalName + ' 出现在 `_evidenceWorkbench()` 体内：九键内联版回潮 —— '
                + 'v3.214.0 那次内联当场自伤成 ReferenceError，被外层吞成 reason:\'thrown\'，工作台永远「不可用」且不报错');
        }
    }
    if (wbHost.indexOf('_ledgerApis(') < 0) {
        defects.push('R7 `_evidenceWorkbench()` 未调用 `_ledgerApis()`：取库面绕开单一真源');
    }
}

/* ---------- 报告 ---------- */
console.log('=== 证据面契约（九账登记 ↔ 宿主取库 ↔ 加载面） ===');
console.log('登记表 ' + specs.length + ' 项 | 宿主取库 ' + entries.length + ' 键 | extra_js ' + extra.length + ' 个脚本');
console.log('对差：' + specs.map((s) => s.id + '→' + s.apiGlobal).join(' '));
if (defects.length) {
    console.error('');
    for (const d of defects) console.error('[evidence-binding] ' + d);
    console.error('');
    console.error('[evidence-binding] 失败：证据面契约存在 ' + defects.length + ' 项缺陷。');
    process.exit(1);
}
console.log('[evidence-binding] 通过：九账登记与宿主取库**按名同源**、模块全部在加载面且磁盘存在、'
    + '键集零对差、project 调用点带 api（R1~R7）。');
process.exit(0);
