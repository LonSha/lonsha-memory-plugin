// tests/audit/scan_audit_lib_consolidation.mjs
// [v3.191.0] 审计基建收敛扫描：唯一真源 + 判据自身的行为自证
// ------------------------------------------------------------
// 为什么需要它（本轮实测，不是整洁性偏好）：
//   ① stripComments 曾在 9 个 audit 脚本里各写一份（实测 4 种变体），bodyOf 两份
//      且签名不同，codeLines 在 4 处各写一份 —— 同一条口径多份实现，修一处漏一处。
//   ② 旧变体不认字符串 / 正则字面量。用 HEAD 抽出的真品对本仓 47 个 .js 实测：
//      · index.js:1450 剥后该行被截断成 const api_base = (cfg.embeddingUrl || 单引号 https:
//        —— 真凶是字符串里的冒号双斜杠：它被当行注释，把字符串后半与整个 replace(...)
//        一起吃掉（不是整行为空，是该行后半被吞）；
//      · 47 个 .js 中 2 个剥算不同（index.js:1450 / settings-ui.js:25）；
//      · 同行内的真代码会被一起吞：const re = /[//]/; const keep = 4; 整段后半消失。
//      对审计脚本的后果是双向的：吞掉调用点 => 假红灯；吞掉手抄位移语句 => 假绿。
//   ③ 辅助文件若混在扫描面上，会被 run.mjs 的目录发现规则（排除下划线前缀之前）
//      当成审计脚本直接执行，纯定义文件零调用即通过（实测 exit 0 / 11 字节被判绿）。
//      「审计失效 = 报告一切正常」，正是本仓最贵的形态。
//   ④（v3.192.0）本文件自己也犯过同一族：判据写了、没接出口。
//      扫描面 / 接线面 / 发现面共 4 条 drift 只 push 进 structural，而结构出口
//      只在 E0 段，因此它们永远不改变结局（实测：把 MIN_AUDIT_SCRIPTS 改成 999，
//      仍 exit 0 并打印「通过」）。现在三道保障：逐条接出口、exit 事件兜底
//      （structural 非空就拒绝给结论）、以及把这个形态本身做成永久负控制 N5。
//
// 判据分五层：
//   E1 结构面：不得再本地重写这些助手（delegating 包装合法；例外须在 EXEMPT 登记并说明）
//   E2 接线面：audit 扫描器凡调用助手，必须从唯一真源 import
//   E3 行为面：真跑 7 形态（含 index.js:1450 同形）+ 长度/换行不变 + bodyOf/braceMatch/codeLines
//   E4 负控制：真源码破坏（锚点恰中 1 次）=> 在破坏副本上重跑同一批判据 => 必须翻红
//   E5 发现面：run.mjs 必须排除下划线前缀（否则辅助文件被当扫描器判绿）
// 退出码：0 通过 / 1 真缺陷 / 2 结构漂移或探测器失效
//
// 注：本文件**刻意不出现反斜杠字面量**（BS/NL 由 fromCharCode 拼装，注释里的示例
//   也改写为文字描述）。原因：本轮经终端 heredoc / 补丁层落盘时，反斜杠会被逐层
//   加码（1 个变 4 个），正则字面量因此变成非法正则 —— 返工两次。零反斜杠源
//   不受任何一层转义影响。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const SRC = process.cwd();
const LIB_REL = 'tests/_audit_lib.mjs';
const AUDIT_REL = 'tests/audit';
const RUN_REL = 'tests/run.mjs';
const EXPECT_LIB_MD5 = '2d7413e5839f8fe3fbd62d1c5063cd2f';
const MIN_AUDIT_SCRIPTS = 25;
const MIN_LIB_BYTES = 8000;
const MIN_IMPORTERS = 8;

const findings = [];
const structural = [];
const bad = (m) => findings.push(m);
const drift = (m) => structural.push(m);
function reportDrift() {
    console.error('[audit-lib] ' + structural.length + ' 项结构漂移（探测器失效，拒绝给结论）：');
    for (const x of structural) console.error('  x ' + x);
    process.exit(2);
}
// fail-closed 兜底（v3.192.0）：靠「每条 drift 后面自己记得接出口」是纪律，不是结构。
//   本版实测的就是这一族：扫描面/接线面/发现面共 4 条 drift 曾经永远不改变结局（把常量改成 999 仍 exit 0 并打印「通过」）。
//   现在只要走到 0 出口时 structural 非空，一律拒绝给结论——对未来新增的守卫同样生效。
process.on('exit', (code) => {
    if (code === 0 && structural.length) {
        console.error('[audit-lib] ' + structural.length + ' 项结构漂移未接出口（fail-closed 兜底，拒绝给结论）：');
        for (const x of structural) console.error('  x ' + x);
        process.exit(2);
    }
});

// ── E0 结构预检（fail-closed：探不到东西也算失效） ──
const libAbs = path.join(SRC, LIB_REL);
if (!fs.existsSync(libAbs)) drift('唯一真源缺失：' + LIB_REL);
if (!fs.existsSync(path.join(SRC, AUDIT_REL))) drift('扫描面缺失：' + AUDIT_REL);
if (!fs.existsSync(path.join(SRC, RUN_REL))) drift('runner 缺失：' + RUN_REL);
if (structural.length) reportDrift();
// 自含常量：真源退化/缺失时必须先判结构漂移，不得先崩在读取上
const libSrc = fs.statSync(libAbs).size >= MIN_LIB_BYTES ? fs.readFileSync(libAbs, 'utf8') : '';
const LIB_MD5 = createHash('md5').update(libSrc).digest('hex');
if (libSrc.length < MIN_LIB_BYTES) drift('唯一真源退化（' + libSrc.length + ' 字节 < ' + MIN_LIB_BYTES + '）');
if (LIB_MD5 !== EXPECT_LIB_MD5) {
    drift('唯一真源指纹变更（磁盘 ' + LIB_MD5 + ' != 常量 ' + EXPECT_LIB_MD5 + '）：真源被改动，须显式复核并同步本常量（防悄悄换掉口径）');
}
let LIB;
try {
    LIB = await import(pathToFileURL(libAbs).href);
} catch (e) {
    drift('唯一真源不可加载：' + e.message);
}
for (const k of ['stripComments', 'codeLines', 'bodyOf', 'braceMatch']) {
    if (typeof LIB?.[k] !== 'function') drift('唯一真源缺导出 ' + k);
}
if (structural.length) reportDrift();

// ── E3 行为面：一批判据，既用于真源，也用于破坏副本 ──
// 每样例：name / src / keep（必须保留的真代码）/ drop（必须清除的注释内容）。
// 注：需要与下一行区分的形态，判据一律放在同一行——旧实现只吞到行尾。
const CASES = [
    { name: '行注释', src: 'const a = 1; // real' + NL + 'const keep1 = 1;' + NL, keep: ['keep1'], drop: ['// real'] },
    { name: '字符串含注释符', src: 'const u = "http://x/y";' + NL + 'const keep2 = 2;' + NL, keep: ['keep2', 'http://x/y'], drop: [] },
    { name: '单引号串含块注释起始符', src: "const s = 'a /* not a comment';" + NL + 'const keep3 = 3;' + NL, keep: ['keep3'], drop: [] },
    { name: '模板串含块注释起始符', src: 'const s = `a /* not a comment`;' + NL + 'const keep3b = 3;' + NL, keep: ['keep3b'], drop: [] },
    { name: '正则字面量含行注释符（同行真代码）', src: 'const re = /[//]/; const keep4 = 4;' + NL, keep: ['keep4'], drop: [] },
    { name: 'index.js:1450 同形（字符串 + replace 正则）', src: "const api_base = (x || 'https://api.openai.com').replace(/" + BS + "+$/, ''); const keep5 = 5;" + NL, keep: ['keep5', 'replace'], drop: [] },
    { name: '块注释', src: 'a /* b' + NL + 'zzz */ ccc' + NL + 'const keep6 = 6;' + NL, keep: ['keep6', 'ccc'], drop: ['zzz'] },
];
function behaviorChecks(M) {
    const fails = [];
    for (const c of CASES) {
        const out = M.stripComments(c.src);
        if (out.length !== c.src.length) fails.push(c.name + ': 剥后长度 ' + out.length + ' != ' + c.src.length + '（偏移会漂移）');
        if (out.split(NL).length !== c.src.split(NL).length) fails.push(c.name + ': 换行数改变');
        for (const k of c.keep) if (!out.includes(k)) fails.push(c.name + ': 真代码被吞 -> ' + k);
        for (const d of c.drop) if (out.includes(d)) fails.push(c.name + ': 注释未被清除 -> ' + d);
    }
    const pure = 'const zz = 1;' + NL;
    if (M.stripComments(pure) !== pure) fails.push('纯代码不得被改动');
    const tpl = 'const t = `a${ {b: 1}.b }c`;' + NL;
    if (M.stripComments(tpl) !== tpl) fails.push('模板插值被改动');
    const classSrc = 'class A { m() { return 1; } }' + NL + 'function helper() { return 2; }' + NL;
    if (M.bodyOf(classSrc, 'm()') !== '{ return 1; }') fails.push('bodyOf 显式 marker 口径错');
    if (M.bodyOf(classSrc, 'helper') !== '{ return 2; }') fails.push('bodyOf 裸名字口径错');
    if (M.bodyOf(classSrc, 'nope') !== null) fails.push('bodyOf 找不到应返回 null 而非抛');
    if (M.braceMatch('{a{"}"}b}', 0) !== '{a{"}"}b}') fails.push('braceMatch 把字符串里的花括号计了进去');
    const esc = '{p="a' + BS + '"' + '{";q}';
    if (M.braceMatch(esc, 0) !== esc) fails.push('braceMatch 未跳过字符串内转义（会读到残实现）');
    if (M.braceMatch('x', 0) !== null) fails.push('braceMatch 非 { 起点应返回 null');
    const cl = M.codeLines('// c' + NL + 'const a = 1;' + NL + NL + '  ' + NL + 'const b = 2;' + NL);
    if (cl.length !== 2 || !cl[0].includes('const a = 1;')) fails.push('codeLines 口径错：' + JSON.stringify(cl));
    return fails;
}
const origFails = behaviorChecks(LIB);
if (origFails.length) {
    console.error('[audit-lib] 唯一真源行为不符（' + origFails.length + ' 项）：判据与实现至少有一边错，拒绝给结论');
    for (const f of origFails) console.error('  x ' + f);
    process.exit(2);
}

// ── E4 负控制：真源码破坏 -> 在破坏副本上重跑同一批判据 ──
//  纪律（v3.170 起本仓反复踩过）：破坏必须发生在真源码上（锚点恰中 1 次），
//  判据必须在破坏副本上重跑；不得对原文件断言、不得把破坏写死成模拟常量。
const NC = [];
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    return src.split(anchor).join(repl);
}
async function runNegative(name, anchor, repl, expectHint) {
    let broken;
    try {
        broken = breakText(libSrc, anchor, repl);
    } catch (e) {
        NC.push({ name, ok: false, why: e.message });
        return;
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-auditlib-'));
    try {
        fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
        const p = path.join(dir, 'tests', '_audit_lib_broken.mjs');
        fs.writeFileSync(p, broken);
        let M;
        try {
            M = await import(pathToFileURL(p).href);
        } catch (e) {
            NC.push({ name, ok: false, why: '破坏副本不可加载（破坏必须保持语法合法）：' + e.message });
            return;
        }
        const fails = behaviorChecks(M);
        if (fails.length === 0) NC.push({ name, ok: false, why: '破坏后判据仍全绿（判据不具证明力）' });
        else if (expectHint && !fails.some((f) => f.includes(expectHint))) {
            NC.push({ name, ok: false, why: '翻红了但不是本组归因：' + JSON.stringify(fails.slice(0, 3)) });
        } else NC.push({ name, ok: true, why: fails.length + ' 项翻红，首项：' + fails[0] });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const Q1 = String.fromCharCode(39);
const Q2 = String.fromCharCode(34);
const BT = String.fromCharCode(96);
await runNegative('N1 正则识别被关掉', 'if (c === ' + Q1 + '/' + Q1 + ' && (REGEX_PREV.has(prevSig) || REGEX_PREV_WORD.has(word(i)))) {', 'if (false && c === ' + Q1 + '/' + Q1 + ') {', '正则字面量');
await runNegative('N2 行注释不再置空', 'blank(i, j);', 'void 0;', '未被清除');
await runNegative('N3 字符串内转义不再生效', 'if (src[k] === ' + Q1 + BS + BS + Q1 + ') { k += 2; continue; }', 'void src[k];', 'braceMatch');
await runNegative('N4 bodyOf 定位花括号失效', 'const brace = text.indexOf(' + Q1 + '{' + Q1 + ', at);', 'const brace = -1;', 'bodyOf');
let toolOk = false;
try {
    breakText(libSrc, '绝不存在的锚点__audit_lib__', '');
} catch (e) {
    toolOk = /拒绝破坏/.test(e.message);
}
if (!toolOk) NC.push({ name: 'N0 工具两向自证', ok: false, why: '锚点不存在时未拒绝破坏（破坏工具恒绿）' });
// N5 漏接出口的 drift 必须被兜底拦下（把「未来新增守卫忘记接出口」做成可证伪形态）
//   手法：镜像 tests/ 到临时目录 -> 向镜像里的本文件末尾真源码注入一条「没有出口」的 drift
//   -> 子进程跑镜像扫描器 -> 必须 exit 2 且点名未接出口。
if (process.env.LONSHA_AUDITLIB_NO_SELFCHECK !== '1') {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-auditlib-exit-'));
    try {
        fs.cpSync(path.join(SRC, 'tests'), path.join(t, 'tests'), { recursive: true });
        const selfRel = path.join('tests', 'audit', 'scan_audit_lib_consolidation.mjs');
        const selfAbs = path.join(t, selfRel);
        const orig = fs.readFileSync(selfAbs, 'utf8');
        fs.writeFileSync(selfAbs, orig + NL + "drift('N5 自证：这条 drift 刻意不接出口');" + NL);
        const r5 = spawnSync(process.execPath, [selfRel], {
            cwd: t, encoding: 'utf8', timeout: 120000,
            env: Object.assign({}, process.env, { LONSHA_AUDITLIB_NO_SELFCHECK: '1' }),
        });
        const out5 = (r5.stdout || '') + (r5.stderr || '');
        if (r5.status !== 2 || !out5.includes('未接出口')) {
            NC.push({ name: 'N5 漏接出口的 drift', ok: false, why: '兜底未拦下（status=' + r5.status + '）：未来新增守卫仍可能写了判据不改变结局' });
        } else {
            NC.push({ name: 'N5 漏接出口的 drift', ok: true, why: '兜底拦下并 exit 2（漏接出口不再能静默通过）' });
        }
    } catch (e) {
        NC.push({ name: 'N5 漏接出口的 drift', ok: false, why: '夹具异常：' + e.message });
    } finally {
        fs.rmSync(t, { recursive: true, force: true });
    }
}
const negFailed = NC.filter((n) => !n.ok);

// ── E1 结构面 / E2 接线面 ──
const HELPERS = ['stripComments', 'codeLines', 'bodyOf', 'braceMatch'];
// 例外表：确属**语义不同**或必须自持的场景（delegating 包装无需登记，见下）。
const EXEMPT = {
    // 「数缩进行数」的局部变量，与库里的 codeLines（剥注释后取代码行）不同义
    'tests/v3164_event_lifecycle.test.mjs': ['codeLines'],
    'tests/v3165_claim_truthfulness.test.mjs': ['codeLines'],
    'tests/v3185_querytext_and_xref_consumer.test.mjs': ['codeLines'],
    // 审计基建自身的负控制工具：它必须能独立于真源工作（破坏目标就是真源）
    'tests/_negative_util.mjs': ['codeLines'],
};
const filesToScan = [];
for (const f of fs.readdirSync(path.join(SRC, AUDIT_REL)).filter((x) => x.endsWith('.mjs'))) filesToScan.push(AUDIT_REL + '/' + f);
for (const f of fs.readdirSync(path.join(SRC, 'tests')).filter((x) => x.endsWith('.mjs'))) filesToScan.push('tests/' + f);
const auditScripts = filesToScan.filter((x) => x.startsWith(AUDIT_REL));
if (auditScripts.length < MIN_AUDIT_SCRIPTS) {
    drift('扫描面过小（' + auditScripts.length + ' < ' + MIN_AUDIT_SCRIPTS + '），探测器失效：这是结构漂移，必须立刻拒绝给结论');
    reportDrift();
}
const helperRe = (h) => new RegExp('(?:function|const|let|var)' + BS + 's+' + h + '[0-9A-Za-z_$]*' + BS + 's*[=(]');
// import 行：[^}]* 到 }，反斜杠用 BS 拼装
const IMPORT_RE = new RegExp('from' + BS + 's+[' + Q1 + Q2 + '][^' + Q1 + Q2 + ']*_audit_lib' + BS + '.mjs[' + Q1 + Q2 + ']');
const IMPORT_NAMED_RE = new RegExp('import' + BS + 's*' + BS + '{([^}]*)}' + BS + 's*from' + BS + 's*[' + Q1 + Q2 + '][^' + Q1 + Q2 + ']*_audit_lib' + BS + '.mjs[' + Q1 + Q2 + ']');
function stmtAt(code, idx) {
    let end = code.indexOf(';', idx);
    const nl = code.indexOf(NL, idx);
    if (nl >= 0 && (end < 0 || nl < end)) end = nl;
    return code.slice(idx, end < 0 ? Math.min(code.length, idx + 400) : end);
}
let copiedFiles = 0;
let importedFiles = 0;
for (const rel of filesToScan) {
    if (rel === LIB_REL) continue;
    const code = LIB.stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'));
    const exempt = EXEMPT[rel] || [];
    const aliases = new Set();
    const imp = IMPORT_NAMED_RE.exec(code);
    if (imp) for (const part of imp[1].split(',')) {
        const seg = part.trim();
        if (!seg) continue;
        const m2 = new RegExp('(?:^|' + BS + 's)as' + BS + 's+([A-Za-z_$][' + BS + 'w$]*)$').exec(seg);
        aliases.add(m2 ? m2[1] : seg.split(new RegExp(BS + 's+')).pop());
    }
    for (const h of HELPERS) {
        if (exempt.includes(h)) continue;
        const re = new RegExp(helperRe(h).source, 'g');
        let m;
        while ((m = re.exec(code)) !== null) {
            const stmt = stmtAt(code, m.index);
            const delegating = [...aliases].some((a) => new RegExp('(?<![' + BS + 'w$.])' + a + BS + 'b').test(stmt));
            if (delegating) continue;
            bad(rel + ' 仍在本地重写 ' + h + '（v3.191 已收敛到唯一真源；确属语义不同者须在 EXEMPT 登记并说明）');
            copiedFiles++;
            break;
        }
    }
    if (IMPORT_RE.test(code)) importedFiles++;
}
if (importedFiles < MIN_IMPORTERS) {
    drift('接线面过小（只有 ' + importedFiles + ' 个文件 import 真源 < ' + MIN_IMPORTERS + '），探测器失效');
    reportDrift();
}
for (const rel of auditScripts) {
    const code = LIB.stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8'));
    const hasImport = IMPORT_RE.test(code);
    for (const h of HELPERS) {
        const calls = new RegExp('(?<![' + BS + 'w$.])' + h + BS + 's*' + BS + '(').test(code);
        if (calls && !helperRe(h).test(code) && !hasImport) {
            bad(rel + ' 调用了 ' + h + ' 却既未本地定义也未从唯一真源 import（第二份定义/隐式全局）');
        }
    }
}

// ── E5 发现面：run.mjs 必须排除下划线前缀 ──
const runCode = LIB.stripComments(fs.readFileSync(path.join(SRC, RUN_REL), 'utf8'));
if (!/AUDIT_DIR/.test(runCode)) drift('run.mjs 不再按目录发现审计脚本（本扫描的 E5 失去意义）');
if (!new RegExp('readdirSync' + BS + 's*' + BS + '(' + BS + 's*AUDIT_DIR' + BS + 's*' + BS + ')').test(runCode)) drift('run.mjs 的审计发现不再走 readdirSync(AUDIT_DIR)');
if (structural.length) reportDrift();
const reUnd = new RegExp('startsWith' + BS + 's*' + BS + '(' + BS + 's*[' + Q1 + Q2 + ']_[' + Q1 + Q2 + ']' + BS + 's*' + BS + ')');
if (!reUnd.test(runCode)) {
    bad('run.mjs 未排除下划线前缀文件：辅助文件会被当扫描器执行，纯定义零调用即判绿（实测过 11 字节假绿）');
}

console.log('[audit-lib] 唯一真源 ' + LIB_REL + ' md5=' + LIB_MD5 + ' chars=' + libSrc.length);
console.log('[audit-lib] 扫描面 ' + filesToScan.length + ' 文件（audit ' + auditScripts.length + ' 个）/ import 真源 ' + importedFiles + ' 个（文件）/ 本地重写 ' + copiedFiles + ' 个（每文件最多计 1）');
console.log('[audit-lib] 行为判据 ' + CASES.length + ' 形态 + bodyOf/braceMatch/codeLines 三口径全通过');
for (const n of NC) console.log('  ' + (n.ok ? 'ok ' : 'x  ') + n.name + '：' + n.why);
if (negFailed.length) {
    console.error('[audit-lib] ' + negFailed.length + ' 组负控制失败：');
    for (const n of negFailed) console.error('  x ' + n.name + '：' + n.why);
    process.exit(1);
}
if (findings.length) {
    console.error('[audit-lib] ' + findings.length + ' 项真缺陷：');
    for (const f of findings) console.error('  x ' + f);
    process.exit(1);
}
console.log('[audit-lib] 通过：唯一真源在位、调用者已接线、判据自身经真源码破坏自证（' + NC.length + ' 组负控制）。');
