// 审计基建 R（v3.247.0）：退出码**归因**面 —— 三态可达、自述与代码同源、归因不混码
// ------------------------------------------------------------
// 为什么存在（计划 #3「退出码即归因」，本版实测不是整洁性偏好）：
//   本仓审计面的退出码是**三分**语义（0 卫生 / 1 真缺陷 / 2 结构漂移），但语义此前只活在
//   各脚本的注释里。实测到的三种形态：
//     ① **同码不同因**：`scan_resilience.mjs` 把「探测器零命中」（真缺陷，要修被检对象）
//        与「index.js 退化」（结构漂移，要修门禁）都写成 `exit 2`。
//        两种处置**相反** ⇒ `run.mjs` 汇总表的 `status` 列对它不可解释。
//     ② **自述漏态**：3 份脚本能到某一态而自述里没写（读者按注释理解会漏一整态）。
//     ③ **自述缺失**：9 份脚本一句自述都没有。
//
// 判据：
//   A1 唯一真源在位且导出面齐全（动态加载；缺项即结构漂移）
//   A2 三态盖满自证（EXIT_TABLE 恰为 0/1/2，且 shouldFail 的三种输入各回正确码）
//   B  逐脚本：**能力**与**自述**必须一致 ——
//        · 能到达的码必须全部自述（自述漏态 ⇒ 红）
//        · 自述的码必须全部可达（自述了却永远到不了 ⇒ 红：那是「写在注释里的能力」）
//   C  归因面：本门禁自己必须能区分归因（以 scan_resilience 为**成建制的样本**）——
//        该脚本的「探测器零命中」路径必须退 EXIT.DEFECT，且自述与之一致。
//   D  活性面：脚本数下限（目录读数失真不得当「没问题」）。
// 退出码：0 = 卫生（判据跑完且无缺陷）  1 = 真缺陷（**检查对象**违反判据）  2 = 结构漂移（**探测器**失效，拒绝给结论）
// 夹具通道：LONSHA_EXITCODES_ROOT 指向合成仓库（本门禁自身的单测用）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.LONSHA_EXITCODES_ROOT || path.resolve(HERE, '..', '..');
function bail(msg) {
    console.error('[exit-codes] ' + msg);
    process.exit(2);
}
function readOrNull(p) {
    try { return fs.readFileSync(p, 'utf-8'); } catch (_e) { return null; }
}
/* ---------- A1 唯一真源（动态加载 + 导出面逐项核对） ----------
 * 为什么动态加载：真源在 `tests/*.mjs` 扫描面里。v3226 的 T 档形态（tests/ 下 .mjs 全掏空）
 * 实测过：静态 import 一个被掏空的模块 ⇒ 进程崩在 ESM 加载栈上（exit 1），判据来不及跑。
 * 本仓纪律是「结构漂移必须如实 exit 2 并说清为什么」。 */
let EC = null;
try { EC = await import('../../tests/_exit_codes.mjs'); } catch (e) {
    bail('唯一真源 tests/_exit_codes.mjs 不可加载（' + String((e && e.message) || e) + '）：退出码三态无从核对');
}
const EC_API = ['EXIT', 'EXIT_TABLE', 'DECL_RE', 'declaredCodes', 'reachableCodes', 'shouldFail', 'selfConsistent', 'REQUIRED_CODES'];
for (const k of EC_API) {
    if (EC[k] === undefined) bail('唯一真源缺导出 ' + k + '（被掏空或改写成别的形状）：退出码三态无从核对');
}
for (const k of ['declaredCodes', 'reachableCodes', 'shouldFail', 'selfConsistent']) {
    if (typeof EC[k] !== 'function') bail('唯一真源导出 ' + k + ' 不是函数（typeof=' + typeof EC[k] + '）');
}
const { EXIT, EXIT_TABLE, declaredCodes, reachableCodes, shouldFail, selfConsistent, REQUIRED_CODES } = EC;

/* ---------- A2 三态盖满自证 ---------- */
const defects = [];
if (!selfConsistent()) defects.push('A2 三态表不是恰好 {0,1,2}：分类漏了（判据自身要能回答「我的分类有没有漏」）');
for (const r of EXIT_TABLE) {
    if (typeof r.name !== 'string' || !r.name) defects.push('A2 三态表第 ' + r.code + ' 项的 name 缺失');
    if (typeof r.meaning !== 'string' || !r.meaning) defects.push('A2 三态表第 ' + r.code + ' 项的 meaning 缺失');
}
if (shouldFail({ kind: 'defect' }) !== EXIT.DEFECT) defects.push('A2 shouldFail(defect) 不是 1：归因函数与表不同源');
if (shouldFail({ kind: 'drift' }) !== EXIT.DRIFT) defects.push('A2 shouldFail(drift) 不是 2：归因函数与表不同源');
if (shouldFail({ kind: 'unknown' }) !== EXIT.DRIFT) defects.push('A2 shouldFail(认不出的原因) 不是 2：fail-closed 口径破了（认不出必须当结构漂移，拒绝给结论）');
if (shouldFail(null) !== EXIT.DRIFT) defects.push('A2 shouldFail(null) 不是 2：fail-closed 口径破了');

/* ---------- D 活性面 ---------- */
const AUDIT_DIR = path.join(ROOT, 'tests', 'audit');
if (!fs.existsSync(AUDIT_DIR)) bail('找不到 tests/audit（工作目录可能不对：' + ROOT + '）');
const MIN_SCRIPTS = 40;
const scripts = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
if (scripts.length < MIN_SCRIPTS) {
    bail('审计脚本只找到 ' + scripts.length + ' 个（下限 ' + MIN_SCRIPTS + '）：目录读数失真，本门禁的覆盖面不可信');
}

/* ---------- B 逐脚本：能力 ↔ 自述 ---------- */
const rows = [];
let declaredCount = 0;
for (const f of scripts) {
    const src = readOrNull(path.join(AUDIT_DIR, f));
    if (src == null) { defects.push('B1 读不到审计脚本：' + f); continue; }
    const decl = declaredCodes(src);
    const { codes: reach, dynamic } = reachableCodes(src);
    if (decl.size) declaredCount++;
    /* B1 自述漏态：能到的码必须自述 */
    for (const c of [...reach].sort()) {
        if (!decl.has(c)) {
            defects.push('B1 ' + f + ' 能到达 exit ' + c + ' 但自述里没写（自述与代码不同源：'
                + '读者按注释理解会漏掉一整态）');
        }
    }
    /* B2 自述了却不可达：写在注释里的能力 */
    for (const c of [...decl].sort()) {
        if (!reach.has(c)) {
            defects.push('B2 ' + f + ' 自述里有 exit ' + c + ' 但代码里到不了（注释里的能力不算能力）');
        }
    }
    /* B3 自述必须把三码写全（单行形态，可机检） */
    for (const c of REQUIRED_CODES) {
        if (!decl.has(c)) {
            defects.push('B3 ' + f + ' 的自述缺 exit ' + c + '（三态必须写全：0 卫生 / 1 真缺陷 / 2 结构漂移）');
        }
    }
    /* B4 动态退出（process.exit(变量)）：静态判不了码，如实报出来而不是沉默放过 */
    if (dynamic) {
        /* 【运行时拼接】被检测的那串形态**不得出现在本文件源码里**：
         *   本段首版把示例逐字写进报错文本，`reachableCodes` 扫到自己这份文件时就抽到
         *   一个「实参 = 变量」⇒ 自己判自己红（本仓 v3228 同族：探针名写进判据）。
         *   stripComments 只置空**注释**，字符串内容仍在 —— 故拼接是唯一稳的修法。 */
        defects.push('B4 ' + f + ' 存在无法静态定值的退出（process' + '.exit(' + String.fromCharCode(21464, 37327) + ')）'
            + '—— 归因不可核对；请改成字面量或三元（本仓允许 `process.exit(fail ? 1 : 0)`）');
    }
    rows.push([f, [...reach].sort().join('/'), [...decl].sort().join('/')]);
}

/* ---------- C 归因面：以 scan_resilience 为成建制样本 ----------
 * 为什么单列：本版实测的第一处真缺陷就在这里。它必须**同时**满足两条：
 *   · 代码里「探测器零命中」走 defect（不是 drift）；
 *   · 自述与之一致（能到的码全在自述里）。
 * 样本不可用时是**结构漂移**（判据失去样本）而不是「通过」。 */
const SAMPLE = 'scan_resilience.mjs';
const sampleSrc = readOrNull(path.join(AUDIT_DIR, SAMPLE));
if (sampleSrc == null) {
    bail('归因面的样本缺席：' + SAMPLE + ' 不在（本门禁的 C 段失去对象）');
}
if (!/shouldFail\(\{\s*kind:\s*'defect'\s*\}\)/.test(sampleSrc)) {
    defects.push('C1 ' + SAMPLE + ' 的探测器失效路径未按 defect 归因'
        + '（应为 shouldFail({kind:\'defect\'})）—— 同码会让汇总表的 status 列不可解释');
}
if (!/shouldFail\(\{\s*kind:\s*'drift'\s*\}\)/.test(sampleSrc)) {
    defects.push('C1 ' + SAMPLE + ' 的结构漂移路径未按 drift 归因');
}
if (!/import \{ EXIT, shouldFail \} from '\.\.\/_exit_codes\.mjs';/.test(sampleSrc)) {
    defects.push('C1 ' + SAMPLE + ' 未接三态唯一真源（自写码值 = 第二份口径）');
}
/* C2 三态**不应**在所有脚本上一刀切：负控制兄弟的 1 与 2 语义不同（组失效 vs 组作废），
 *    这里只要求「自述与代码一致」（B 段已判），不再额外要求它们 import 真源 ——
 *    理由：它们是**独立**的观测者，与门禁同源会把「同源失效」耦合起来。如实登记这一取舍。 */

/* ---------- 读数 ---------- */
console.log('  审计脚本 ' + scripts.length + ' 个（含自述 ' + declaredCount + ' 个）｜ 三态表 '
    + EXIT_TABLE.map((r) => r.code + '=' + r.name).join(' / '));
if (defects.length) {
    console.error('');
    console.error('[exit-codes] ' + defects.length + ' 项真缺陷：');
    for (const d of defects) console.error('  x ' + d);
    console.error('');
    console.error('[exit-codes] 失败：退出码的**归因**不成立（三态混码 / 自述与代码不同源）。');
    process.exit(shouldFail({ kind: 'defect' }));
}
console.log('[exit-codes] 通过：三态可达、自述与代码同源、归因不混码（' + rows.length + ' 份逐一核对）。');
process.exit(EXIT.CLEAN);