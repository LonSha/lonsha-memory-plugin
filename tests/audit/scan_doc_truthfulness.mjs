// 审计基建 LIV（v3.285.0）：文档读数真实性扫描（当前在役面 / 全量快照 ↔ 真源）
// ------------------------------------------------------------
// 为什么存在（O8 的真缺口，v3.284.0 实测）：
//   本仓有 `scan_version_guard` 把守**版本四源**，有 `scan_claim_truthfulness` 把守
//   **运行时成功声称**，但**人读文档里的读数**（测试文件数 / 审计脚本数 / 断言数 /
//   index.js 行数 / extra_js 项数）**没有任何判据**。于是：
//     · README 曾同时写着 `extra_js（79 项）` 与 `extra_js 78 项`（自相矛盾）；
//     · README 版本停在 `3.271.0`，而磁盘已是 `3.284.0`；
//     · README「248 个测试文件」与 PLAN「246 测试文件」互相打架，两个都不对（磁盘 264）；
//     · PLAN 基线停在 `v3.266.0` / `index.js 13883 行`。
//   与 v3.279.0「判据的面漏一类」同族：**文档面整个不在任何判据的枚举面内**。
//   O8 的验收原文就是「当前版本、人读索引和机器装载面一致」——不一致须当场翻红。
//
// 判定策略（每条都对应一个**可磁盘重算**的事实）：
//   D1 README 的「当前版本」必须等于 index.js 的 `const VERSION`
//   D2 README 的测试文件数 / 审计脚本数必须等于磁盘真值
//   D3 README 的 `extra_js` 项数必须等于 manifest 真值，且**全文只准出现一个项数**（防自相矛盾）
//   D4 README 的「运行时模块」数必须等于根级 .js 个数
//   D5 PLAN 的「版本」行必须等于当前版本、「体量」行的 extra_js 必须等于 manifest 真值
//   D6 断言数只在**全量实跑**后才可信：本脚本不读断言数（它需要一次 `npm test` 的产物），
//      改为**结构断言** —— 若 README 写了「N 断言」，那个 N 必须与 `tests/audit/doc_readings.json`
//      的登记值一致；登记值由 `npm test` 全量实跑后由 `tools/_rebind_doc_readings.py` 写入。
//      （不在这里跑全量：审计段跑全量会自指。see 边界③）
//   D7 面自证：文档全集非空、登记文件在场、下限充足（枚举失效时「0 不一致」是空对空）
//   D8 fail-closed：文档缺失 / 关键行缺失 ⇒ exit 2（探测器失效，拒绝给结论）
//   D9 **档自述读数**：文档里逐版写着「`tests/<file>.test.mjs`（N 条）」与各类「N 个」量词，
//      这些也是读数、也必须核回磁盘（与 D1~D6 管「项目读数」分列，见 D9 段头的理由）
//
// 退出码：0=卫生  1=真缺陷（文档读数与磁盘不一致）  2=结构漂移（文档/登记缺失，无法给结论）
//
// 边界（诚实）：
//   ① 只覆盖**可磁盘重算**的读数。叙事性文字、能力描述、历史口径**不判**（那是人写的，
//      判不了）；本脚本钉的是「数字」这一类最容易静默漂移的事实。
//   ② 断言数需要一次全量实跑，故走**登记 + 重绑**：`doc_readings.json` 由重绑工具写，
//      本脚本只核对文档与登记是否一致。登记滞后时 D6 会红 —— 这是**想要**的（提醒重跑）。
//   ③ 本脚本**不**自己跑 `npm test`（审计段跑全量会自指 + 把 33s 审计拖成 90s+）。
//      实跑读数的权威来源是 `TEST_SUMMARY_JSON=<path> node tests/run.mjs`，
//      由 `tools/_rebind_doc_readings.py` 消费。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stripComments } from '../_audit_lib.mjs';

const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const README = path.join(ROOT, 'README.md');
const PLAN = path.join(ROOT, 'PLAN.md');
const IDX = path.join(ROOT, 'index.js');
const MF = path.join(ROOT, 'manifest.json');
const REG = path.join(ROOT, 'tests', 'audit', 'doc_readings.json');

const problems = [];
const notes = [];
const drift = (m) => { console.error('[doc-truthfulness] ' + m); process.exit(2); };

for (const [p, label] of [[README, 'README.md'], [PLAN, 'PLAN.md'], [IDX, 'index.js'], [MF, 'manifest.json']]) {
    if (!fs.existsSync(p)) drift('缺少' + label + ' ⇒ 无法核对，结构漂移');
}
const read = (p) => fs.readFileSync(p, 'utf8');

/* ---------- 磁盘真值 ---------- */
const idxSrc = read(IDX);
const vM = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(idxSrc);
if (!vM) drift('index.js 里读不到 const VERSION ⇒ 真源失效');
const VERSION = vM[1];
const manifest = JSON.parse(read(MF));
const EXTRA_JS = Array.isArray(manifest.extra_js) ? manifest.extra_js.length : -1;
if (EXTRA_JS < 0) drift('manifest.extra_js 不是数组 ⇒ 真源失效');
const TESTS_DIR = path.join(ROOT, 'tests');
const AUDIT_DIR = path.join(TESTS_DIR, 'audit');
const testFiles = fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith('.test.mjs'));
const auditAll = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.mjs'));
const auditGated = auditAll.filter((f) => !f.startsWith('_'));
const rootJs = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && !f.endsWith('.bak'));

/* ---------- 面自证（枚举失效时「0 不一致」是空对空） ---------- */
/* 面下限：**默认值**在夹具模式放松（合成仓天然很小），但机制本身可被 env 覆盖 ——
 *   否则「下限真的在拦」这件事就无法被负控制证明（实测：首版夹具模式把下限降到 1，
 *   C 段的「面塌陷 ⇒ exit 2」全部落空，断言恒不成立）。 */
const numEnv = (k) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v > 0 ? v : 0;
};
const FLOOR_TESTS = numEnv('LONSHA_AUDIT_MIN_TESTS') || (FIXTURE_MODE ? 1 : 200);
const FLOOR_AUDIT = numEnv('LONSHA_AUDIT_MIN_AUDIT') || (FIXTURE_MODE ? 1 : 40);
const FLOOR_ROOTJS = numEnv('LONSHA_AUDIT_MIN_ROOTJS') || (FIXTURE_MODE ? 1 : 60);
if (testFiles.length < FLOOR_TESTS) drift('测试文件面塌陷：只扫到 ' + testFiles.length + '（下限 ' + FLOOR_TESTS + '）');
if (auditGated.length < FLOOR_AUDIT) drift('审计脚本面塌陷：只扫到 ' + auditGated.length + '（下限 ' + FLOOR_AUDIT + '）');
if (rootJs.length < FLOOR_ROOTJS) drift('根级 .js 面塌陷：只扫到 ' + rootJs.length + '（下限 ' + FLOOR_ROOTJS + '）');

const README_SRC = read(README);
const PLAN_SRC = read(PLAN);

/* ---------- D1 README 当前版本 ---------- */
{
    const m = /\*\*当前版本\*\*：`([0-9]+[.][0-9]+[.][0-9]+)`/.exec(README_SRC);
    if (!m) problems.push('D1 README 缺「**当前版本**：`x.y.z`」行（探测器找不到锚点）');
    else if (m[1] !== VERSION) problems.push('D1 README 当前版本 ' + m[1] + ' ≠ index.js 真值 ' + VERSION);
    else notes.push('README 版本 ' + m[1]);
}

/* ---------- D2 README 当前在役面 ---------- */
{
    /* 当前面与全量快照分开：新增测试/审计文件可以立刻进入在役面，
     * 但没有实跑就不能冒充「全量通过」。只读这一条专用行，历史段不参与现值判定。 */
    const surface = /^\*\*在役面读数\*\*[^\n]*?`npm test` 当前发现 \*\*(\d+) 个测试文件\*\*；[^\n]*?`npm test -- --audit` 当前发现 \*\*(\d+)\/(\d+)\*\* 审计脚本（`tests\/audit\/` 磁盘 \*\*(\d+)\*\* 个/m.exec(README_SRC);
    if (!surface) {
        problems.push('D2 README 在役面读数行缺失（需同时给出测试、审计门禁与磁盘数）');
    } else {
        if (+surface[1] !== testFiles.length) {
            problems.push('D2 README 测试文件数 ' + surface[1] + ' ≠ 磁盘 ' + testFiles.length);
        }
        if (+surface[2] !== auditGated.length || +surface[3] !== auditGated.length) {
            problems.push('D2 README 审计脚本 ' + surface[2] + '/' + surface[3] + ' ≠ 磁盘门禁面 ' + auditGated.length);
        }
        if (+surface[4] !== auditAll.length) {
            problems.push('D2 README 审计磁盘数 ' + surface[4] + ' ≠ 磁盘 ' + auditAll.length);
        }
        if (+surface[1] === testFiles.length && +surface[2] === auditGated.length
            && +surface[3] === auditGated.length && +surface[4] === auditAll.length) {
            notes.push('README 在役面 ' + surface[1] + ' / 审计 ' + surface[2] + '/' + surface[3]);
        }
    }
}

/* ---------- D2b README 全文：非现值数字必须自带时点前缀 ---------- */
/* 专用行管「现值」，这条管「别的数字」：README 里任何时候出现「N 个测试文件」，
 *   若 N ≠ 当前磁盘枚举，则**同一行**必须带版本/时点前缀（vX.Y.Z / 截至 / 当时 / 原为 / 当年 / 此前）。
 *   否则读者会把它读成现值 —— 这正是本档要治的漂移。
 *   为什么 PLAN 不适用：PLAN 是追加式历史台账（「2026-10-03 推进计划」等整节都是历史），
 *   对它套现值口径会把诚实的长篇留痕整片判红；README 是面向使用者的当前说明，故从严。 */
{
    const TIME_PREFIX = /v[0-9]+[.][0-9]+[.][0-9]+|截至|当时|原为|当年|此前|历史/;
    let seen = 0;
    for (const [i, line] of README_SRC.split('\n').entries()) {
        for (const m of line.matchAll(/(\d+) 个测试文件/g)) {
            seen++;
            if (+m[1] === testFiles.length) continue;
            /* 时点前缀按**前置窗口**（24 字符）判，不按整行判 ——
             *   实测踩到：合成仓把历史读数写在快照行末尾，同一行别处的 `vX.Y.Z`
             *   会把「无时点」的历史数字整行豁免掉（判据被同行其他读数污染）。 */
            const pre = line.slice(Math.max(0, m.index - 24), m.index);
            if (TIME_PREFIX.test(pre)) continue;
            problems.push('D2b README:' + (i + 1) + ' 的「' + m[1] + ' 个测试文件」既非现值（磁盘 '
                + testFiles.length + '）又未标版本/时点（会被读成现值）');
        }
    }
    if (seen === 0) problems.push('D2b README 全文读不到任何「N 个测试文件」读数（探测器可能已失效）');
    else notes.push('README 全文「N 个测试文件」出现 ' + seen + ' 处（现值 ' + testFiles.length + '）');
}

/* ---------- D3 extra_js 项数：必须与 manifest 一致，且全文只准一个值 ---------- */
{
    /* 两个形态都要收：`` `extra_js`（N 项） ``（分支行）与 `` `extra_js` N 项 ``（载入面行）。
     *   首版第一条正则写成 /extra_js[（(](\d+) 项?[)）]/ —— **它一条都匹配不到**：
     *   真源写法是 `` `extra_js`（79 项） ``，反引号夹在中间。死判据比没有判据更坏（看起来在守）。 */
    const counts = new Set();
    for (const m of README_SRC.matchAll(/`extra_js`\s*[（(](\d+)\s*项/g)) counts.add(+m[1]);
    for (const m of README_SRC.matchAll(/`extra_js`\s*(\d+)\s*项/g)) counts.add(+m[1]);
    if (counts.size === 0) problems.push('D3 README 找不到任何 extra_js 项数读数');
    else if (counts.size > 1) {
        problems.push('D3 README 里的 extra_js 项数自相矛盾：' + [...counts].sort().join(' / ')
            + '（真值 ' + EXTRA_JS + '）');
    } else if ([...counts][0] !== EXTRA_JS) {
        problems.push('D3 README extra_js 项数 ' + [...counts][0] + ' ≠ manifest 真值 ' + EXTRA_JS);
    } else notes.push('README extra_js ' + EXTRA_JS);
}

/* ---------- D4 README 运行时模块数 ---------- */
{
    const m = /\*\*运行时模块\*\*：(\d+) 个/.exec(README_SRC);
    if (!m) problems.push('D4 README 缺「**运行时模块**：N 个」行');
    /* 该行原写作「（根目录 .js，含入口 index.js）」—— 以磁盘根级 .js 为准，不额外要求措辞。 */
    else if (+m[1] !== rootJs.length) problems.push('D4 README 运行时模块 ' + m[1] + ' ≠ 根级 .js ' + rootJs.length);
    else notes.push('README 运行时模块 ' + m[1]);
}

/* ---------- D5 PLAN 版本行 / 体量行 ---------- */
{
    const v = /\| 版本 \| \*\*v?([0-9]+[.][0-9]+[.][0-9]+)\*\*/.exec(PLAN_SRC);
    if (!v) problems.push('D5 PLAN 现状基线表缺「| 版本 | **vX.Y.Z**」行');
    else if (v[1] !== VERSION) problems.push('D5 PLAN 版本 ' + v[1] + ' ≠ index.js 真值 ' + VERSION);
    else notes.push('PLAN 版本 ' + v[1]);

    const s = /\| 体量 \|.*?extra_js \*\*(\d+)\*\* 项/.exec(PLAN_SRC);
    if (!s) problems.push('D5 PLAN 体量行缺「extra_js **N** 项」');
    else if (+s[1] !== EXTRA_JS) problems.push('D5 PLAN extra_js ' + s[1] + ' ≠ manifest 真值 ' + EXTRA_JS);
    else notes.push('PLAN extra_js ' + s[1]);

    const g = /\| 门禁 \| 在役面 \*\*(\d+) 测试文件 \/ (\d+) 个 audit 脚本\*\*（磁盘 (\d+)）/.exec(PLAN_SRC);
    if (!g) problems.push('D5 PLAN 门禁行格式变了（找不到「| 门禁 | 在役面 **N 测试文件 / K 个 audit 脚本**（磁盘 M）」）');
    else {
        if (+g[1] !== testFiles.length) problems.push('D5 PLAN 在役面测试文件数 ' + g[1] + ' ≠ 磁盘 ' + testFiles.length);
        if (+g[2] !== auditGated.length) problems.push('D5 PLAN 在役面 audit 脚本数 ' + g[2] + ' ≠ 磁盘门禁面 ' + auditGated.length);
        if (+g[3] !== auditAll.length) problems.push('D5 PLAN 在役面审计磁盘数 ' + g[3] + ' ≠ 磁盘 ' + auditAll.length);
        notes.push('PLAN 在役面 ' + g[1] + ' / ' + g[2] + '（磁盘 ' + g[3] + '）');
    }
}

/* ---------- D6 全量实跑快照：文档 ↔ 登记 一致，且「未实跑」不得冒充已通过 ---------- */
/* 两条硬要求，缺一不可：
 *   ① 快照四元组（版本 / 测试文件 / 断言 / 审计）必须与登记逐项一致 —— 手抄数字无处藏；
 *   ② 当登记版本 ≠ 当前版本时，文档**必须**显式标「全量待验」。这条是本档存在的核心理由：
 *      上一版把「登记滞后」直接判红，于是「加了一个新测试文件」与「文档说谎」同形，
 *      逼着人为了过门禁去提前跑全量。分开之后，「滞后但如实标注」是**合法状态**，
 *      「滞后却写成已通过」才是缺陷。 */
let reg = null;
if (!fs.existsSync(REG)) {
    /* 缺登记 ⇒ **无法给结论**（断言数没有可信来源），属结构漂移而非「文档说谎」。 */
    drift('缺 tests/audit/doc_readings.json（实跑读数登记）⇒ 断言数无法核对，拒绝给结论');
} else {
    try { reg = JSON.parse(read(REG)); } catch (e) {
        drift('doc_readings.json 不是合法 JSON：' + e.message + ' ⇒ 拒绝给结论');
    }
}
if (reg) {
    const needNum = ['tests_total', 'assertions', 'audit_passed', 'audit_total'];
    const missing = needNum.filter((k) => typeof reg[k] !== 'number' || reg[k] <= 0);
    if (missing.length) {
        problems.push('D6 doc_readings.json 缺读数：' + missing.join(','));
    } else if (typeof reg.version !== 'string' || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(reg.version)) {
        problems.push('D6 doc_readings.json 缺合法的 version 字段（无法判断快照属于哪一版）');
    } else {
        const SNAP = 'v' + reg.version + ' · ' + reg.tests_total + ' 个测试文件 · ' + reg.assertions
            + ' 断言 · 0 失败 · 审计 ' + reg.audit_passed + '/' + reg.audit_total;
        const rm = /\*\*最近一次全量实跑快照\*\*[^\n]*?：v([0-9.]+) · (\d+) 个测试文件 · (\d+) 断言 · 0 失败 · 审计 (\d+)\/(\d+)/.exec(README_SRC);
        if (!rm) problems.push('D6 README 缺「最近一次全量实跑快照」行（或格式不含版本·测试·断言·审计四元组）');
        else if (rm[1] !== reg.version || +rm[2] !== reg.tests_total || +rm[3] !== reg.assertions
            || +rm[4] !== reg.audit_passed || +rm[5] !== reg.audit_total) {
            problems.push('D6 README 全量快照 v' + rm[1] + ' · ' + rm[2] + ' / ' + rm[3] + ' / ' + rm[4] + '/' + rm[5]
                + ' ≠ 登记值 ' + SNAP);
        } else notes.push('README 全量快照 ' + SNAP);

        const pm = /最近全量快照 \*\*v([0-9.]+)：(\d+) 测试文件 \/ (\d+) 断言 0 失败 \/ 审计 (\d+)\/(\d+)\*\*/.exec(PLAN_SRC);
        if (!pm) problems.push('D6 PLAN 缺「最近全量快照 **vX：N 测试文件 / M 断言 0 失败 / 审计 P/Q**」');
        else if (pm[1] !== reg.version || +pm[2] !== reg.tests_total || +pm[3] !== reg.assertions
            || +pm[4] !== reg.audit_passed || +pm[5] !== reg.audit_total) {
            problems.push('D6 PLAN 全量快照 v' + pm[1] + ' · ' + pm[2] + ' / ' + pm[3] + ' / ' + pm[4] + '/' + pm[5]
                + ' ≠ 登记值 ' + SNAP);
        } else notes.push('PLAN 全量快照 ' + SNAP);

        /* 待验标记：登记版本落后于当前版本 ⇒ 两份文档都必须写「当前版本 vX **全量待验**」。
         *   反向同样成立：登记已对齐当前版本却仍标「待验」也是错的（那会把已实跑说成没跑）。 */
        const rp = /当前版本 v([0-9.]+) \*\*全量待验\*\*/.exec(README_SRC);
        const pp = /当前 v([0-9.]+) \*\*全量待验\*\*/.exec(PLAN_SRC);
        if (reg.version !== VERSION) {
            if (!rp || rp[1] !== VERSION) {
                problems.push('D6 当前版本全量待验标记缺失：登记停在 v' + reg.version
                    + '，README 必须写「当前版本 v' + VERSION + ' **全量待验**」（未实跑不得写成已通过）');
            } else notes.push('README 待验标记 v' + VERSION);
            if (!pp || pp[1] !== VERSION) {
                problems.push('D6 PLAN 全量待验标记缺失：登记停在 v' + reg.version
                    + '，PLAN 必须写「当前 v' + VERSION + ' **全量待验**」');
            } else notes.push('PLAN 待验标记 v' + VERSION);
        } else {
            if (rp || pp) {
                problems.push('D6 登记已对齐当前版本 v' + VERSION + '，却仍标「全量待验」'
                    + '（把已实跑说成没跑，同属读数不实）');
            } else notes.push('快照已对齐当前版本，无待验标记');
        }
    }
}

/* ---------- D9 档自述读数：文档里的「本档 N 条」与档案存在性 ---------- */
/* 为什么单列一段（而不是并进 D1~D6）：前面六条钉的是**项目级读数**（当前版本 / 在役面 /
 *   快照），这一段钉的是**逐版留痕里的自述读数** —— 实测四类漂移（v3.285.0 本轮）：
 *     ① 自称 `tests/v3285_...test.mjs`（13 条）而磁盘 15 条（本刀自己写错的第一次）；
 *     ② `tests/v3220_relation_mutual_knowledge.test.mjs`（17 条）实为 18；
 *     ③ `tests/v3164_event_lifecycle.test.mjs`（18 条）实为 19；
 *     ④ `tests/v3162_ui_binding_hygiene.test.mjs`（18 条）实为 22。
 *   四条都在 CHANGELOG 里，全都是「一条可磁盘重算的声明式读数」。
 *
 * 面（为什么不扫全篇，只扫「当前版本节」）：
 *   ① **条数**：只判 **CHANGELOG 顶节**（第一个 `## vX.Y.Z` 之前，即当前版本那一节）里
 *      逐字给出测试档全路径 + 紧邻条数的地方。历史节里的同一形态是**当时的状态声明**
 *      （例如 v3.220.0 当时确为 17 条，此后涨到 18）——判它等于要求每版回头改写历史节，
 *      那是本仓早已定性为反模式的「抬版仪式」（T1），与 D2b 豁免历史口径是同一条边界。
 *      实测：历史节现有三处与今日磁盘有差（v3220 17/18、v3164 18/19、v3162 18/22），
 *      如实记在 CHANGELOG 的边界段，不判。
 *   ② **日期**：**只判当前版本节**（CHANGELOG 顶节）。历史节里的日期是当时的时点，
 *      对它套现值口径等同把留痕判成缺陷（与 D2b 豁免历史口径同一条边界）；
 *      而「顶节写着上一版日期」正是抬版时会真实发生的静默漂移，且完全可机械核对。
 *   ③ 本段只认**逐字给出全路径 + 紧邻条数**这一种无歧义形态；散写「共 13 条」不判
 *      （无从知道说的是哪个档，收进来只会产出假红）。
 *   ④ TODO.md **不判**：它是滚动台账，同一档会在多版留痕里重复出现，改动频率高于 CHANGELOG。
 * 豁免：N 后面带「+」或写作「≥N 条 / 至少 N 条」视为下界声明，不判（那是刻意写宽，不是读数漂移）。 */
{
    const CL = path.join(ROOT, 'CHANGELOG.md');
    if (!fs.existsSync(CL)) drift('缺 CHANGELOG.md ⇒ 档自述读数无法核对，结构漂移');
    const CL_SRC = read(CL);
    const HEAD_SRC = CL_SRC.split(/\n## v[0-9.]+/)[0];
    const claimRe = /`(tests\/[A-Za-z0-9_.\-]+\.test\.mjs)`([^\n]{0,40}?)（(\d+) 条(?!\+)/g;
    let claims = 0; let bad = 0;
    for (const [i, line] of HEAD_SRC.split('\n').entries()) {
        for (const m of line.matchAll(claimRe)) {
            claims++;
            const rel = m[1];
            const claimed = +m[3];
            const tail = m[2];
            /* 下界措辞（「至少 / ≥」）不按等式判；「+」已在正则里排除。 */
            if (/至少|≥|不少于/.test(tail)) continue;
            const abs = path.join(ROOT, rel);
            if (!fs.existsSync(abs)) {
                problems.push('D9 CHANGELOG:' + (i + 1) + ' 自述 ' + rel + '（' + claimed
                    + ' 条）但该文件不在磁盘上（档已改名/退役，留痕未标注）');
                bad++;
                continue;
            }
            const actual = (read(abs).match(/^test\(/gm) || []).length;
            if (claimed !== actual) {
                problems.push('D9 CHANGELOG:' + (i + 1) + ' 自述 ' + rel + '（' + claimed
                    + ' 条）≠ 磁盘 ' + actual + ' 条');
                bad++;
            }
        }
    }
    if (claims === 0) problems.push('D9 CHANGELOG 当前版本节读不到任何「`tests/x.test.mjs`（N 条）」自述（探测器可能已失效）');
    else notes.push('CHANGELOG 当前版本节档自述条数 ' + claims + ' 处（' + (claims - bad) + ' 处一致）');

    /* 当前版本节里「退出码三档」与「自己绝不跑全量」两句是**可机械核对**的声明，
     *   把它们核到扫描器实现上（而不是核日期 —— 实测 CHANGELOG 通篇不写日期，
     *   首版按日期判的写法是一条**永不触发**的判据，正是本仓定性过的「恒绿探测器」）。 */
    /* 读**正在运行的这个脚本自己**（而非 ROOT 下那份）：夹具模式下 ROOT 是合成仓，
     *   那里没有本扫描器 ⇒ 首版按 ROOT 读，健康夹具直接 ENOENT 崩掉（实测 B1 由绿转红）。 */
    const SELF_SCAN = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    if (/退出码三档：0 卫生 \/ 1 真缺陷 \/ 2 结构漂移/.test(HEAD_SRC)) {
        for (const [needle, why] of [['process.exit(0)', '卫生出口'], ['process.exit(1)', '真缺陷出口'],
            ['process.exit(2)', '结构漂移出口']]) {
            if (!SELF_SCAN.includes(needle)) {
                problems.push('D9 当前版本节声明「退出码三档」但扫描器缺 ' + why + '（' + needle + '）');
            }
        }
        notes.push('CHANGELOG 当前节退出码三档 ↔ 扫描器三出口');
    } else {
        problems.push('D9 当前版本节缺「退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移」声明'
            + '（扫描器契约必须在文档里写明，否则读者无从知道 exit 1 与 exit 2 的区别）');
    }
    if (/绝不跑全量/.test(HEAD_SRC)) {
        /* 这条声明的实现形态就是「扫描器里没有任何执行子进程的能力」——
         *   若有人给它接上 spawn，文档这句立刻变成假话，必须当场红。
         *   ★ 字面量按**拼接**写（`'spawn' + 'Sync('`）：直接写完整串的话，这几个字面量
         *   本身就在本文件里，`SELF_SCAN.includes(...)` 会立刻命中自己 ⇒ 恒红。
         *   这是本仓反复踩过的「判据纯度」坑（H5），在此按拼接形态规避。 */
        for (const needle of ['child_' + 'process', 'spawn' + 'Sync(', 'spawn' + '(']) {
            if (SELF_SCAN.includes(needle)) {
                problems.push('D9 当前版本节声明「绝不跑全量」，但扫描器里出现了 ' + needle
                    + '（一旦能起子进程，这句声明就是假的）');
            }
        }
        notes.push('CHANGELOG 当前节「绝不跑全量」↔ 扫描器无子进程能力');
    }
}

/* ---------- D7 面自证（非空 + 下限） ---------- */
if (README_SRC.length < 2000) problems.push('D7 README 内容塌陷（' + README_SRC.length + ' 字符）');
if (PLAN_SRC.length < 3000) problems.push('D7 PLAN 内容塌陷（' + PLAN_SRC.length + ' 字符）');
/* 注释不得被当作判据：这里显式记录一次「已剥注释」的量，防后来者拿注释当读数。 */
const stripped = stripComments(README_SRC).length;

console.log('[doc-truthfulness] 磁盘真值：版本 ' + VERSION + ' / 测试 ' + testFiles.length
    + ' / 审计门禁 ' + auditGated.length + '（磁盘 ' + auditAll.length + '） / 根级 .js ' + rootJs.length
    + ' / extra_js ' + EXTRA_JS);
for (const n of notes) console.log('  ok ' + n);
console.log('  · README 剥注释后 ' + stripped + ' 字符（注释不计入读数）');

if (problems.length) {
    console.error('[doc-truthfulness] 发现 ' + problems.length + ' 处文档读数与磁盘不一致：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('[doc-truthfulness] 通过：README/PLAN 的版本与在役读数与磁盘真源一致');
process.exit(0);
