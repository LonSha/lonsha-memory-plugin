// tests/audit/scan_fakegreen_hygiene.mjs
// [v3.267.0 · A2 判据面卫生] 负控制卫生常驻门禁：三形态假绿的可机检面
// ------------------------------------------------------------
// 为什么存在（PLAN.md A2 原文）：
//   「固化三形态假绿自检（对原文件断言 / 破坏写死常量 / 破坏把判据自己删了），
//     统一『真源码破坏 → 加载副本 → 副本上重跑同款真判据』范式」。
//   本门禁是这条计划项的**载体**：把「负控制该有的形状」做成一处可机检读数，
//   而不是继续靠 17 份 fixture 各自的写法与读者记忆。
//
//   本仓最贵的形态是「绿着，但绿的成因不是判据在守」。三形态假绿正是它的三个入口：
//     ① 对原文件断言 —— 破坏根本没发生，负控制绿得毫无意义；
//     ② 破坏写死成模拟常量 —— 判据被绕过，被测物从未被调用；
//     ③ 破坏把判据自己删了 —— 自我指涉，判据引用锚点串后必然「翻红」。
//
// 判据：
//   A 面（扫描面自证）：负控制清单非空 + 覆盖下限 + 每份都可读
//   B 面（三形态）：逐份过 tests/_fakegreen_hygiene.mjs 的硬信号集（K1–K8），
//       并把「不饱和信号」作为**读数**报出（不阻断 —— 用不饱和信号做硬判据会立刻假红）
//   C 面（判据纯度 H5）：负控制/判据层内不得把被破坏的锚点字面量声明一遍
//   D 面（fail-closed）：探测器失效（面塌成 0 份 / 清单不可读）一律 exit 2，不给结论
// 退出码：0 = 卫生 / 1 = 真缺陷（某份负控制缺硬信号） / 2 = 结构漂移（探测器失效）
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../_audit_lib.mjs';
import { auditNegctlSource, NEGCTL_SIGNALS, FAKE_GREEN_FORMS } from '../_fakegreen_hygiene.mjs';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const AUDIT_DIR = path.join(ROOT, 'tests', 'audit');
const TESTS_DIR = path.join(ROOT, 'tests');
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
/* 面下限：实测 17 份 negctl（2026-10-04）。取 12 —— 留自然增减余量；低于 12 说明扫描面塌了。 */
const MIN_NEGCTL = FIXTURE_MODE ? 1 : 12;

const drift = [];
const defects = [];
const notes = [];

if (!fs.existsSync(AUDIT_DIR)) {
    console.error('[negctl-hygiene] 找不到 ' + path.relative(ROOT, AUDIT_DIR) + '，工作目录可能不对（' + ROOT + '）');
    process.exit(2);
}
const negFiles = fs.readdirSync(AUDIT_DIR).filter((f) => f.endsWith('_negctl.mjs')).sort();
if (negFiles.length < MIN_NEGCTL) {
    drift.push('负控制清单退化：实测 ' + negFiles.length + ' 份，下限 ' + MIN_NEGCTL + '（扫描面塌了，拒绝给结论）');
}

/* ---------- A/B 面：逐份过硬信号集 ---------- */
const rows = [];
for (const f of negFiles) {
    let raw = '';
    try { raw = fs.readFileSync(path.join(AUDIT_DIR, f), 'utf8'); } catch (e) {
        drift.push('读不到 ' + f + '：' + String((e && e.message) || e));
        continue;
    }
    /* 剥注释后再判：不剥时头注里的 `mkdtempSync` / `writeFileSync` 会让信号集看起来饱和。 */
    const pid = auditNegctlSource(stripComments(raw));
    rows.push({ file: f, pid });
    if (!pid.ok) defects.push(f + ' 缺硬信号（三形态假绿的入口）：' + pid.missing.join(' ｜ '));
}
if (rows.length && rows.every((r) => r.pid.ok)) {
    notes.push('B 面：' + rows.length + ' 份负控制全部具备 K1–K8（' + NEGCTL_SIGNALS.map((g) => g.id).join('/') + '）');
}

/* ---------- C 面：判据纯度（H5）----------
 * 被破坏的锚点若在**判据层**里被完整声明一遍，就会「宿主里删了也绿」（判据自我满足）。
 * 本仓的合格写法是运行时拼接（`'rollbackPreviewEnable' + 'X: true,'` 这类）。
 * 检出方式：把负控制源码里「长 ≥ 24 且含代码形态（= / ; / ( ) 」的字符串字面量数出来，
 * 与它**真写进破坏调用**的锚点对照 —— 但静态地不知道哪个是锚点，故这里的口径是
 * **禁止清单式**：只报「同一份文件里，同一个长字面量既出现在拼接表达式里又整串出现」。
 * 为避免假红，本面只产**读数**（notes），由 H5 的强判定留在各套件自己的 N 组里。 */
for (const f of negFiles) {
    let raw = '';
    try { raw = fs.readFileSync(path.join(AUDIT_DIR, f), 'utf8'); } catch { continue; }
    const code = stripComments(raw);
    const lits = [...code.matchAll(/(['"`])([^'"`\n]{24,})\1/g)].map((m) => m[2])
        .filter((s) => /[=;(){}]/.test(s));
    if (lits.length) notes.push('C 读面：' + f + ' 含 ' + lits.length + ' 个长代码字面量（H5 强判定在各套件 N 组内）');
}

/* ---------- 报告 ---------- */
console.log('[negctl-hygiene] 负控制清单 ' + negFiles.length + ' 份 ｜ 硬信号 ' + NEGCTL_SIGNALS.length + ' 条 ｜ 判据真源 tests/_fakegreen_hygiene.mjs');
console.log('[negctl-hygiene] 三形态假绿：' + Object.values(FAKE_GREEN_FORMS).join(' / '));
for (const n of notes) console.log('  · ' + n);
const advCount = rows.filter((r) => r.pid.advisories.length).length;
console.log('  · 读数（不阻断）：' + advCount + '/' + rows.length + ' 份缺「自计数出口」（非必需，K5 已保证归因）');
if (drift.length) {
    console.error('[negctl-hygiene] ' + drift.length + ' 项结构漂移（探测器失效，拒绝给结论）：');
    for (const d of drift) console.error('  x ' + d);
    process.exit(2);
}
if (defects.length) {
    console.error('[negctl-hygiene] ' + defects.length + ' 项真缺陷：');
    for (const d of defects) console.error('  x ' + d);
    process.exit(1);
}
console.log('[negctl-hygiene] 通过：' + rows.length + ' 份负控制均具备「真源码破坏 → 独立树上真跑 → 按归因翻红」的形状。');
process.exit(0);