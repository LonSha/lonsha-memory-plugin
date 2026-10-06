// 审计基建 LV（v3.286.0）：测试成本读数真实性扫描（登记 ↔ 磁盘 / 覆盖范围自述）
// ------------------------------------------------------------
// 为什么存在（O8 的真缺口，v3.285.0 实测）：
//   计划 O8 的工作项写着「为测试成本建立热点读数，不减少负控制来换快」——
//   而修前磁盘上**没有任何测试成本读数**：
//     · tests/run.mjs 的摘要只有 `failed[]` 带 duration ⇒ **只有失败档有耗时**，
//       通过的档耗时只活在控制台输出流里；`--audit` 段的 slowest 也只收 top3；
//     · 于是「哪个档最慢」不可磁盘复算，「成本热点」这句话没有交付物。
//   与 v3.285.0 D9「档自述读数」同族：**读数不被登记就没法核**，
//   但登记了不被判据把守，同样会静默漂移（数字过期、指向已改名的档、把定向采样
//   冒充全量）。本扫描器把「成本读数登记」纳进面内。
//
// 判定策略（每条都对应一个**可磁盘重算 / 自洽可判**的事实）：
//   C1 登记在场且结构可解析（latest / rebinds 两段；latest 六个必需字段齐）
//   C2 面自证（**非零下限**）：磁盘测试档 ≥ 200 / audit 面 ≥ 40 / 热点条目 ≥ 1
//      —— 枚举塌陷时「0 不一致」是空对空
//   C3 热点真在场：slowest_top 里每个档**必须还在磁盘上**（改名的档 = 过期读数），
//      且 duration > 0、按 ms 降序（与重绑工具的排序口径同源，可复现）
//   C4 计数不得超出现实：latest.tests_total ≤ 磁盘测试档数（全量快照来自更早的版本，
//      此后新增档是**正常状态**，故用 ≤ 而不是 =；这条只挡「比现存的还多」）
//   C5 **覆盖范围自述**：
//        · scope.full === true  ⇒ measured_at 必须等于该档 version（全量实跑必须盖版本章）
//        · scope.full === false ⇒ 必须带至少一个 pattern（定向采样不得两不沾）
//      本条是本门最要紧的一条：本仓明令「定向采样不得冒充全量」，
//      而修前连「这次是全量还是采样」这个字段都不存在。
//   C6 契约声明（同 D9 手法）：note 里必须留着「零手抄」与「覆盖范围必须自述」两句
//   C7 fail-closed：登记缺失 / 非法 JSON / 关键段缺失 ⇒ exit 2（探测器失效，拒绝给结论）
//
// 退出码：0=卫生  1=真缺陷（读数与磁盘/自洽性冲突）  2=结构漂移（登记缺失，无法给结论）
//
// 边界（诚实）：
//   ① 本扫描器**不自己跑测试**（审计段跑全量会自指，且把审计拖成分钟级）——
//      它只核对「登记 ↔ 磁盘」与「登记自洽」，实跑读数的权威来源是
//      `TEST_SUMMARY_JSON=<path> node tests/run.mjs`，由 tools/_rebind_test_cost.py 写登记。
//   ② 耗时为**本机并发 7 的单次读数**：它证明「谁贵」，不承诺目标设备预算
//      （计划原文要求「先记录新基线，再定目标设备预算」，预算必须来自实机）。
//   ③ 只判**可磁盘重算**的事实。跨机 / 跨时段的耗时波动**不判**（那会产出必然 flaky 的红）。
import fs from 'fs';
import path from 'path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const REG = path.join(ROOT, 'tests', 'audit', 'test_cost_readings.json');
const TESTS = path.join(ROOT, 'tests');
const AUDIT = path.join(TESTS, 'audit');
const problems = [];
const notes = [];
const drift = (m) => { console.error('[cost-truthfulness] ' + m); process.exit(2); };
const bad = (m) => { problems.push(m); };
/** 面下限可由 env 覆盖（同 scan_doc_truthfulness 口径）：合成仓夹具需要把下限降下来，
 *  否则每条合成仓用例都会卡在「枚举塌陷 ⇒ exit 2」，判据本身永远到不了。 */
const numEnv = (k) => {
    const v = Number(process.env[k]);
    return Number.isFinite(v) && v >= 0 ? v : null;
};
const FLOOR_TESTS = numEnv('LONSHA_AUDIT_MIN_TESTS') || (FIXTURE_MODE ? 1 : 200);
const FLOOR_AUDIT = numEnv('LONSHA_AUDIT_MIN_AUDIT') || (FIXTURE_MODE ? 1 : 40);

// ---------- C7 fail-closed ----------
if (!fs.existsSync(TESTS)) drift('缺少 tests/ 目录 ⇒ 无法枚举测试档，结构漂移');
if (!fs.existsSync(AUDIT)) drift('缺少 tests/audit/ 目录 ⇒ 无法枚举审计面，结构漂移');
if (!fs.existsSync(REG)) drift('缺少测试成本读数登记 tests/audit/test_cost_readings.json ⇒ 读数不存在，拒绝给结论（结构漂移）');

/* ---------- C7b 读数真源在场（★ 本条让本门不是恒绿探测器）----------
 * 【为什么必须有这一条】本门只读 tests/ 面 ⇒ 对 G（根 .js 全删）与 T（tests/ 下 .mjs 掏空）
 *   两档都无反应，而 v3226 的 J3 判定「两档皆 0 = 恒绿探测器」（永远通过，人以为有它守着）。
 *   补的两条都不是为凑敏感度，而是本门**真实存在的前提**：
 *     ① index.js 的 `const VERSION`：C8「登记版本不得高于代码版本」的唯一真源；
 *     ② tests/run.mjs 的 slowest / scope 出口：本门所核读数的**产出者**。
 *        T 档把 tests/ 下的 .mjs 置为 `// gutted` ⇒ run.mjs 里这两个出口必然消失，
 *        此时登记是一份「无从产出的孤证」⇒ 如实报结构漂移（exit 2），不报通过。 */
const IDX = path.join(ROOT, 'index.js');
if (!fs.existsSync(IDX)) drift('缺少 index.js ⇒ 读不到 VERSION 真源，无法核对登记版本，结构漂移');
const idxSrc = fs.readFileSync(IDX, 'utf8');
const vMatch = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(idxSrc);
if (!vMatch) drift('index.js 里读不到 const VERSION ⇒ 真源失效，结构漂移');
const VERSION = vMatch[1];

const RUNNER = path.join(TESTS, 'run.mjs');
if (!fs.existsSync(RUNNER)) drift('缺少 tests/run.mjs ⇒ 成本读数没有产出者，结构漂移');
const runSrc = fs.readFileSync(RUNNER, 'utf8');
for (const pair of [['slowest', '逐档耗时出口 tests.slowest'],
    ['scope', '覆盖范围自述出口 summary.scope']]) {
    if (!runSrc.includes(pair[0])) {
        drift('tests/run.mjs 里读不到 ' + pair[1] + ' ⇒ 本门核的读数无从产出，结构漂移');
    }
}
let doc = null;
try {
    doc = JSON.parse(fs.readFileSync(REG, 'utf8'));
} catch (e) {
    drift('成本读数登记非法 JSON：' + String(e && e.message) + '（结构漂移）');
}
if (!doc || typeof doc !== 'object') drift('成本读数登记顶层不是对象（结构漂移）');
if (!doc.latest || typeof doc.latest !== 'object') drift('登记缺 latest 段 ⇒ 没有可比对的读数（结构漂移）');
if (!Array.isArray(doc.rebinds) || !doc.rebinds.length) drift('登记缺 rebinds[] 历史留痕 ⇒ 无法核「只追加」口径（结构漂移）');

const diskTests = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs')).sort();
const diskAudit = fs.readdirSync(AUDIT).filter((f) => f.endsWith('.mjs')).sort();

// ---------- C2 面自证（非零下限）----------
if (diskTests.length < FLOOR_TESTS) {
    drift('磁盘测试档只有 ' + diskTests.length + ' 个（下限 ' + FLOOR_TESTS + '）⇒ 枚举塌陷，拒绝给结论');
}
if (diskAudit.length < FLOOR_AUDIT) {
    drift('审计面只有 ' + diskAudit.length + ' 个（下限 ' + FLOOR_AUDIT + '）⇒ 枚举塌陷，拒绝给结论');
}

// ---------- C1 结构 ----------
const L = doc.latest;
const REQUIRED = ['version', 'scope', 'tests_total', 'tests_wall_s', 'slowest_top'];
for (const k of REQUIRED) {
    if (!(k in L)) bad('latest 缺必需字段 ' + k + '（成本读数不可复算）');
}
if (!L.scope || typeof L.scope !== 'object') bad('latest.scope 不是对象（覆盖范围未自述）');

// ---------- C3 热点真在场 / 可复现 ----------
const top = Array.isArray(L.slowest_top) ? L.slowest_top : [];
if (top.length < 1) bad('slowest_top 为空 ⇒ 没有任何热点读数（成本面等于没建）');
let prevMs = Infinity;
for (const item of top) {
    if (!item || typeof item !== 'object') { bad('slowest_top 含非对象条目'); continue; }
    const rel = String(item.file || '');
    const abs = path.join(ROOT, rel);
    if (!rel) { bad('slowest_top 条目缺 file'); continue; }
    if (!fs.existsSync(abs)) bad('热点档不在磁盘上（已改名/已删 ⇒ 过期读数）：' + rel);
    const ms = Number(item.duration);
    if (!Number.isFinite(ms) || ms <= 0) bad('热点档耗时不合法：' + rel + ' = ' + item.duration);
    // 排序口径与重绑工具同源：按 ms 降序、并列按文件名升序
    if (ms > prevMs) bad('slowest_top 未按耗时降序（排序口径与重绑工具漂移）：' + rel);
    prevMs = ms;
}

// ---------- C4 计数不得超出现实 ----------
const total = Number(L.tests_total);
if (!Number.isFinite(total) || total < 1) bad('latest.tests_total 不合法：' + L.tests_total);
else if (total > diskTests.length) {
    bad('latest.tests_total=' + total + ' 超过磁盘上的测试档数 ' + diskTests.length
        + '（比现存的还多 ⇒ 读数不实）');
}
const wall = Number(L.tests_wall_s);
if (!Number.isFinite(wall) || wall <= 0) bad('latest.tests_wall_s 不合法：' + L.tests_wall_s);

// ---------- C8 版本不自相矛盾 ----------
// 登记声称「这是 vX.Y.Z 的一次实跑」—— 它**不可能**是比代码当前版本更新的版本跑出来的。
// 这条用上了 C7b 的 VERSION 真源（否则那项读出来只用于一条 exit 2，等于没判）。
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
if (typeof L.version === 'string' && /^[0-9]+[.][0-9]+[.][0-9]+$/.test(L.version)) {
    if (vnum(L.version) > vnum(VERSION)) {
        bad('登记版本 ' + L.version + ' 高于代码当前版本 ' + VERSION
            + '（读数是未来的，不可能来自任何一次实跑）');
    }
} else {
    bad('latest.version 不是语义化版本：' + String(L.version));
}

// ---------- C5 覆盖范围自述（本门最要紧的一条）----------
if (typeof L.scope === 'object' && L.scope !== null) {
    const full = L.scope.full;
    const patterns = Array.isArray(L.scope.patterns) ? L.scope.patterns : [];
    if (full === true) {
        if (doc.measured_at !== L.version) {
            bad('scope.full=true 但 measured_at（' + String(doc.measured_at)
                + '）≠ 该档 version（' + String(L.version) + '）—— 全量实跑必须盖版本章');
        }
    } else if (full === false) {
        if (patterns.length < 1) {
            bad('scope.full=false 却没有 patterns ⇒ 既非全量也非定向采样，覆盖范围不可解释');
        }
    }
    // full 缺席（undefined）= 旧登记：如实记入 notes，不判红（历史口径豁免）
    if (full !== true && full !== false) {
        notes.push('latest.scope.full 缺席（旧登记）—— 覆盖范围未自述，如实报出而不判红');
    }
}

// ---------- C6 契约声明 ----------
const note = String(doc.note || '');
if (!note.includes('零手抄')) bad('登记 note 丢了「零手抄」契约声明（读数来源必须写明）');
if (!note.includes('覆盖范围必须自述')) bad('登记 note 丢了「覆盖范围必须自述」契约声明');

// ---------- 汇总 ----------
const readonly = FIXTURE_MODE ? '（夹具模式）' : '';
if (problems.length) {
    console.error('[cost-truthfulness] 发现 ' + problems.length + ' 个真缺陷：');
    for (const p of problems) console.error('  · ' + p);
    process.exit(1);
}
for (const n of notes) console.log('[cost-truthfulness] 注：' + n);
console.log('[cost-truthfulness] ✓ 成本读数卫生：登记在场 · 热点 ' + top.length + ' 条全在磁盘 · '
    + 'tests_total=' + total + '（磁盘 ' + diskTests.length + '）· wall=' + wall
    + 's · scope.full=' + String(L.scope && L.scope.full) + readonly);
process.exit(0);