// tests/v3279_o7_scanner_decl_surface.test.mjs — v3.279.0 O7 第三批收尾
// 主题：**扫描器的面漏了一类，结论就完全反了** —— A7 死代码台账从「方法级」扩到「声明级」
//       （方法 + 函数声明 + 顶层常量表），引用面从「根级 .js + tests/*.mjs」补上
//       「tests/audit/* + tools/*」；同版处置两条扩面后现形的真死声明。
//
//   【为什么本档存在（真缺口，不是假想）】
//     本轮实测：`index.js` 里有两条**永不执行**的声明 —— `collectCycleTasks(tasks, position)`
//     与 `const TIME_WORDS_ZH = [...]`。而 `scan_wiring` 的 A7 一直报「零引用 0」。
//     根因是**面**：A7 的 DEF_RE 负向断言里显式排除 `function\b`（函数声明本就不带
//     `name(args) {` 形态），顶层 `const` 数据表更不在面内。于是「读数 0」被读成
//     「没有死代码」，而真死代码一直躺在那里。
//     这与 v3.227.0 踩过的形态同族：那一版是**文件面**漏了 settings-ui.js（`fetchModels`
//     被判零引用，结论反了）；本版是**形态面**漏了函数声明与顶层常量表。
//
//   【判据与负控制跑同一份源码判据】
//     `judge(scanSrc)` 是纯函数（读文本、返回问题列表）。A 段对磁盘真源码跑它；
//     D 段对**真源码破坏后的副本**跑**同一个它**。破坏一律走唯一真源 `tests/_break_kit.mjs`
//     的 `breakSource`（锚点须恰中 1 次）：判据与负控制不平行实现，是本仓的既有纪律。
//
//   【边界（诚实）】
//     本档证明：① 三条声明正则都在盘上且在面内；② 两个引用面目录都被读；③ 台账头的口径
//     与实测读数（零引用 0）一致；④ 摘掉任一正则 / 任一引用面 / 台账头口径 / 声明面非重复，
//     同一条判据都会翻红。本档**不**证明 A7 的引用判定与「人眼判断谁在调用」等价 ——
//     它只保证**面**不漏类、且落桶规则（先生产面、再测试面、再审计/工具面）被如实遵守。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SCAN_REL = path.join('tests', 'audit', 'scan_wiring.mjs');
const TSV_REL = path.join('tests', 'audit', 'scan_wiring_dead_methods.tsv');
const ok = (m) => console.log('  ✓ ' + m);

/* ---- 扩面的真源锚点（逐条取自磁盘源码，禁改；本档须逐字持有） ---- */
const A_FN = "const FN_RE = /^(\\s*)(?:async\\s+)?function\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\(/;";
const A_CT = "const CT_RE = /^(\\s{4})const\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*[\\[{]/;";
const A_FN_LOOP = "    const m = FN_RE.exec(lines[i]);";
const A_CT_LOOP = "    const m = CT_RE.exec(lines[i]);";
const A_AUDIT = "const AUDIT_BLOB = {};";
const A_AUDIT_READ = "fs.readdirSync('tests/audit')";
const A_TOOL = "const TOOL_BLOB = {};";
const A_TOOL_READ = "fs.readdirSync('tools')";
const A_TOOL_TALLY = "if (TOOL_BLOB[kA].includes(name)) methodHits[name].test++;";
/* [v3.279.0] 裸标识符形态（ref）的真源锚点 */
const A_REF_FORM = "ref: (n) => new RegExp('(?<![' + WORD + '])' + n + '(?![' + WORD + '])'),";
const A_REF_BUCKET = "if (h.call || h.opt || h.prop || h.q || h.ref) continue;";
const A_REF_STRIP = "const IDX_PLAIN_LINES = _stripComments(idx).split(String.fromCharCode(10));";
const A_BUCKET = "=== A7 声明级死代码台账（v3.279.0 扩面：方法 + 函数声明 + 顶层常量表；形态含裸标识符）";
const A_TITLE = "=== A7.1 零引用（真死代码，硬失败） (";
const A_NEW_MSG = "A7.1 新增零引用方法（本面含函数声明与顶层常量表） ";
const A_GONE_MSG = "A7.1 基线里的方法已不再零引用（请更新基线；本面含函数声明与顶层常量表）";
/* 台账口径锚点（TSV） */
const A_TSV_FACE = "#   本表口径随之变为：声明（方法 / 函数声明 / 顶层常量表）在全部根级 .js + tests/*.mjs + tests/audit/* + tools/*";

const INDEX_SRC = read('index.js');

/**
 * 真判据体（纯函数）：给定 scan_wiring.mjs 的源码文本，返回问题列表；空数组 = 卫生。
 * A 段跑磁盘真源码，D 段跑真源码破坏后的副本 —— 同一个它。
 * @param {string} scanSrc scan_wiring.mjs 源码
 * @param {string} tsvSrc  tests/audit/scan_wiring_dead_methods.tsv 源码
 */
function judge(scanSrc, tsvSrc) {
    const P = [];
    /* ① 声明面三条正则都必须在场（方法 / 函数声明 / 顶层常量表） */
    if (!scanSrc.includes(A_FN)) P.push('B1 函数声明面缺席（FN_RE 不在场）');
    if (!scanSrc.includes(A_CT)) P.push('B1 顶层常量表面缺席（CT_RE 不在场）');
    if (!scanSrc.includes("const DEF_RE = ")) P.push('B1 方法面缺席（DEF_RE 不在场）');
    /* ② 两个新面必须真的被**收集**（正则在场但循环被摘掉 = 假绿通道） */
    if (!scanSrc.includes(A_FN_LOOP)) P.push('B1 函数声明面未入收集循环');
    if (!scanSrc.includes(A_CT_LOOP)) P.push('B1 顶层常量表面未入收集循环');
    if (!scanSrc.includes(A_AUDIT) || !scanSrc.includes(A_AUDIT_READ)) P.push('B1 审计引用面缺席（tests/audit）');
    if (!scanSrc.includes(A_TOOL) || !scanSrc.includes(A_TOOL_READ)) P.push('B1 工具引用面缺席（tools）');
    if (!scanSrc.includes(A_TOOL_TALLY)) P.push('B1 工具面命中未计入（落桶规则被拆）');
    /* [v3.279.0] 裸标识符形态与其去注释面必须在场 */
    if (!scanSrc.includes(A_REF_FORM)) P.push('B1 裸标识符形态缺席（ref 未入 FORM）');
    if (!scanSrc.includes(A_REF_BUCKET)) P.push('B1 裸标识符未参与落桶（被引用的声明会掉进仅测试桶）');
    if (!scanSrc.includes(A_REF_STRIP)) P.push('B1 裸标识符面无去注释（注释里提过一次会冒充真引用）');
    /* ③ 台账头口径必须与实现同步（口径与实现不符 = 读者按口径理解会反） */
    if (!tsvSrc.includes(A_TSV_FACE)) P.push('B1 台账头口径未随扩面同步');
    /* ④ 声明面不得被重复收集（同一行两条正则同时命中 ⇒ 计数翻倍） */
    const lineNo = new Map();
    for (const af of [A_FN, A_CT]) {
        const ln = scanSrc.split('\n').findIndex((l) => l.includes(af)) + 1;
        if (ln <= 0) continue;
        lineNo.set(af, ln);
    }
    const dup = [...lineNo.values()].filter((v, i, a) => a.indexOf(v) !== i);
    if (dup.length) P.push('B1 声明面重复收集（行号重合 ' + dup.join(',') + '）');
    return P;
}

/* ---- 整仓镜像 + 跑扫描器（本仓 v310/v311/v3225/v3230 同款基建） ---- */
function withMirror(mut, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3279-mir-'));
    try {
        fs.cpSync(ROOT, dir, { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
        for (const [rel, body] of Object.entries(mut)) fs.writeFileSync(path.join(dir, rel), body);
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function runScan(dir) {
    const r = spawnSync(process.execPath, [SCAN_REL], { cwd: dir, encoding: 'utf8', timeout: 180000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ══════════════ A. 盘上真源码必须卫生 ══════════════ */
test('v3279 A1. ★★★ 声明级三面与两个引用面逐条在场（面漏一类 ⇒ 结论会反）', () => {
    const problems = judge(read(SCAN_REL), read(TSV_REL));
    assert.deepEqual(problems, [], '盘上源码必须卫生：' + problems.join(' | '));
    ok('三条声明正则 + 两条收集循环 + 两个引用面 + 台账口径 全在面内');
});

test('v3279 A2. ★★ 两条曾被漏掉的死声明已处置（扩面后现形 ⇒ 删除）', () => {
    /* 正向：两者都不得再有任何定义形态。反向（防空对空）：搜的是**声明形态**而非名字，
     * 故本档自己的字符串常量不会被算进来 —— 若把判据写成 `!includes('name')`，
     * 本档自身持有这些字面量就会自反（假绿通道）。 */
    for (const [name, re] of [
        ['collectCycleTasks', /^\s*(?:async\s+)?function\s+collectCycleTasks\s*\(/m],
        ['TIME_WORDS_ZH', /^\s{4}const\s+TIME_WORDS_ZH\s*=\s*\[/m],
    ]) {
        assert.equal(re.test(INDEX_SRC), false, 'index.js 不得再有 ' + name + ' 的定义形态');
    }
    ok('两条函数/常量级死声明的定义形态均已消失');
});

/* ══════════════ B. 读数与落桶（扫描器真跑） ══════════════ */
test('v3279 B1. ★★★ 真跑扫描器：rc=0 且三面读数如实（零引用 0 不是靠基线洗出来的）', () => {
    const { status, out } = withMirror({}, (dir) => runScan(dir));
    assert.equal(status, 0, '健康树上 scan_wiring 必须 exit 0: ' + out.slice(-400));
    assert.match(out, new RegExp(A_BUCKET.replace(/[（）+]/g, (c) => '\\' + c)),
        '必须打出声明级台账读数行: ' + out.slice(-400));
    assert.match(out, /声明 5[0-9][0-9] \/ 有真引用 5[0-9][0-9] \/ 仅测试·审计 \d+ \/ 零引用 0 /,
        '读数形态须为「声明 / 有真引用 / 仅测试·审计 / 零引用」: ' + out.slice(-400));
    /* [v3.279.0] 形态面补了裸标识符（ref）后，被误落「仅测试」桶的 14 个名字必须回「有真引用」桶 ——
     *   本断言钉住「形态面确实生效」，且用**具体名字**而非仅计数（计数会被别的变动顶走）。 */
    assert.match(out, /仅测试·审计 (?:[1-9]|1[0-2]) \/ 零引用 0 /,
        '补 ref 后仅测试·审计桶须降到 12 以内（旧口径 26）: ' + out.slice(-400));
    assert.match(out, new RegExp(A_TITLE.replace(/[()]/g, (c) => '\\' + c) + '0\\)'),
        'A7.1 零引用须为 0: ' + out.slice(-400));
    /* 仅测试/审计桶必须点名审计面独占的那一个（证明 audit 面真参与了落桶） */
    assert.match(out, /_cacheWorkloadLib/, 'A7.2 必须含 _cacheWorkloadLib（唯一消费点在审计脚本）');
    ok('rc=0；声明级读数与零引用 0 一致；审计面独占名落进 A7.2');
});

/* ══════════════ C. 真源码破坏 → 副本上重跑同款判据 ══════════════ */
test('v3279 C1. ★★ 摘掉函数声明正则 ⇒ 同一判据必须翻红', () => {
    const b = breakSource(read(SCAN_REL), A_FN,
        "const FN_RE = /^(?![\\s\\S])/;   // [破坏] 函数声明面整面停摆", 'v3279_fn');
    assert.ok(!b.includes(A_FN), '破坏必须可观察（原锚点消失）');
    const problems = judge(b, read(TSV_REL));
    assert.ok(problems.some((p) => p.includes('函数声明面缺席')), '必须点名函数声明面缺席：' + problems.join(' | '));
    ok('摘掉 FN_RE ⇒ 判据点名「函数声明面缺席」');
});

test('v3279 C2. ★★ 摘掉审计引用面 ⇒ 同一条判据必须翻红（面漏一类结论就反）', () => {
    const b = breakSource(read(SCAN_REL), A_AUDIT,
        "const AUDIT_BLOB = Object.freeze({});   // [破坏] 审计面不再收集任何文件", 'v3279_audit');
    const problems = judge(b, read(TSV_REL));
    assert.ok(problems.some((p) => p.includes('审计引用面缺席')), '必须点名审计面缺席：' + problems.join(' | '));
    ok('摘掉审计面收集 ⇒ 判据点名「审计引用面缺席」');
});

test('v3279 C3. ★★ 摘掉工具面落桶 ⇒ 同一条判据必须翻红', () => {
    const b = breakSource(read(SCAN_REL), A_TOOL_TALLY,
        "if (false) methodHits[name].test++;   // [破坏] 工具面命中不再落桶", 'v3279_tool');
    const problems = judge(b, read(TSV_REL));
    assert.ok(problems.some((p) => p.includes('工具面命中未计入')), '必须点名落桶规则被拆：' + problems.join(' | '));
    ok('摘掉工具面落桶 ⇒ 判据点名「工具面命中未计入」');
});

test('v3279 C4. ★★ 台账头口径被摘掉 ⇒ 同一条判据必须翻红（口径与实现不得脱节）', () => {
    const b = breakSource(read(TSV_REL), A_TSV_FACE, '#    （口径被摘掉）', 'v3279_tsv');
    const problems = judge(read(SCAN_REL), b);
    assert.ok(problems.some((p) => p.includes('台账头口径未随扩面同步')), '必须点名台账口径脱节：' + problems.join(' | '));
    ok('摘掉台账头口径 ⇒ 判据点名「未随扩面同步」');
});

test('v3279 C5. ★★ 摘掉裸标识符形态 ⇒ 同一条判据必须翻红（真被引用的声明会掉进仅测试桶）', () => {
    const b = breakSource(read(SCAN_REL), A_REF_BUCKET,
        "if (h.call || h.opt || h.prop || h.q) continue;   // [破坏] 裸标识符不再算真引用", 'v3279_ref');
    const problems = judge(b, read(TSV_REL));
    assert.ok(problems.some((p) => p.includes('裸标识符未参与落桶')), '必须点名裸标识符未参与落桶：' + problems.join(' | '));
    ok('摘掉 ref 落桶 ⇒ 判据点名「裸标识符未参与落桶」');
});

test('v3279 C6. ★★ 摘掉裸标识符的**去注释**面 ⇒ 同一条判据必须翻红（读注释当调用是假绿通道）', () => {
    const b = breakSource(read(SCAN_REL), A_REF_STRIP,
        "const IDX_PLAIN_LINES = lines;   // [破坏] 裸标识符面退回不去注释的原文", 'v3279_strip');
    const problems = judge(b, read(TSV_REL));
    assert.ok(problems.some((p) => p.includes('裸标识符面无去注释')), '必须点名去注释面被摘：' + problems.join(' | '));
    ok('摘掉去注释面 ⇒ 判据点名「注释里提过一次会冒充真引用」');
});

test('v3279 C7. ★★★ 捆绑未测副本：ref 一旦失效，**真被使用的**声明会掉进 A7.2「仅测试」桶（硬失败抓不到）', () => {
    /* 本条不能用纯文本判据证明（纯文本判据只能看见「ref 在场」）—— 它是一条**运行时**断言：
     *   真跑扫描器，读它真打出来的 A7.2 名单。对照组与破坏组都是同一次真跑。 */
    const listOf = (dir) => {
        const { status, out } = runScan(dir);
        assert.equal(status, 0, '两组都必须 exit 0（否则读不到 A7.2 名单）: ' + out.slice(-300));
        const a = out.indexOf('=== A7.2');
        const b = out.indexOf('=== A8');
        assert.ok(a >= 0 && b > a, '必须能切出 A7.2 段: ' + out.slice(-300));
        return out.slice(a, b);
    };
    /* 对照组：原样树上，真被 `for (const group of RELATION_CONFLICT_GROUPS)` 引用的常量
     *   必须**不在** A7.2（它是活代码）。 */
    /* ★ 两次扫描都必须在 withMirror 的**回调内**完成：`withMirror` 在回调返回后即销毁镜像目录，
     *   把目录路径带出来再 spawn 会拿到 status=null（不是红判据，是工具用错 —— 本档 C7 首稿即如此）。 */
    const ctrl = withMirror({}, (d) => listOf(d));
    assert.equal(ctrl.includes('RELATION_CONFLICT_GROUPS'), false,
        '原样树上 RELATION_CONFLICT_GROUPS 不得落进 A7.2（它被裸标识符引用，是活代码）');
    /* 破坏组：只摘掉「裸标识符算真引用」这一条判据，其余一切不动 —— 该常量必须掉进 A7.2。 */
    const brokenScan = breakSource(read(SCAN_REL), A_REF_BUCKET,
        "if (h.call || h.opt || h.prop || h.q) continue;   // [破坏] 裸标识符不再算真引用", 'v3279_bundle');
    const broke = withMirror({ [SCAN_REL]: brokenScan }, (d) => listOf(d));
    assert.ok(broke.includes('RELATION_CONFLICT_GROUPS'),
        '★ 摘掉 ref 后，真被使用的声明必须掉进 A7.2「仅测试」桶 —— 这就是「真死代码被测试提一次即可藏身」的机制：' + broke.slice(0, 400));
    ok('对照：活声明在有 ref 时不在 A7.2；破坏：摘掉 ref 后当场掉进去（硬失败 A7.1 抓不到）');
});

/* ══════════════ D. 工具两向自证 + 反向可观测（不是「破坏写死成常量」） ══════════════ */
test('v3279 D1. ★★★ 工具两向自证：锚点 0 次/不唯一必抛、同值替换必抛；真破坏真改行为', () => {
    assert.throws(() => assertSingleHit(read(SCAN_REL), 'const 绝不存在的锚点 = 1;', 'v3279_n0'),
        /锚点/, '锚点不存在必须抛');
    assert.throws(() => assertSingleHit(read(SCAN_REL), 'const ', 'v3279_nmany'),
        /锚点/, '锚点不唯一必须抛');
    assert.throws(() => breakSource(read(SCAN_REL), A_AUDIT, A_AUDIT, 'v3279_same'),
        /改变|替换/, '同值替换必须抛');
    /* 关键：C1 那次破坏的方向也要在**原版**上验证判据为真 —— 否则「破坏后翻红」可能是
     * 判据恒假造成的假绿（本项目 H6 纪律）。 */
    const broken = breakSource(read(SCAN_REL), A_FN, "const FN_RE = /^(?![\\s\\S])/;", 'v3279_db');
    assert.notEqual(read(SCAN_REL), broken, '破坏须真的改变源码');
    assert.deepEqual(judge(read(SCAN_REL), read(TSV_REL)), [], '原版上同判据必须真成立');
    assert.notDeepEqual(judge(broken, read(TSV_REL)), [], '破坏副本上同判据必须真翻红');
    ok('两向自证通过；原版判据真、破坏副本真红');
});

/* ══════════════ E. 判据纯度（H5）：锚点字面量在本档只准声明一次 ══════════════ */
test('v3279 E1. ★★ 判据纯度：破坏锚点字面量在本档只出现一次，且判据不引用锚点串', () => {
    const self = read(path.join('tests', 'v3279_o7_scanner_decl_surface.test.mjs'));
    /* 本档是**源码文本**，含反斜杠的锚点在文件里是转义形态（`\\s`），故比对前须把锚点值
     * 反向转义一次 —— 直接拿运行时值去 `split` 原始文本会 0 命中，那是假绿通道。 */
    const rawForm = (s) => s.replace(/[\\]/g, '\\\\');
    for (const [label, a] of [['FN_RE', A_FN], ['CT_RE', A_CT], ['AUDIT_BLOB', A_AUDIT], ['TOOL_TALLY', A_TOOL_TALLY], ['REF_BUCKET', A_REF_BUCKET]]) {
        const n = self.split(rawForm(a)).length - 1;
        assert.equal(n, 1, label + ' 锚点字面量在本档须恰好出现 1 次（实 ' + n + '）');
    }
    /* 每个锚点在**真源文件**上恰中一次 —— 判据与破坏必须打在同一个坐标上。 */
    const scan = read(SCAN_REL);
    for (const [label, a] of [['FN_RE', A_FN], ['CT_RE', A_CT], ['AUDIT_BLOB', A_AUDIT],
        ['AUDIT_READ', A_AUDIT_READ], ['TOOL_BLOB', A_TOOL], ['TOOL_READ', A_TOOL_READ],
        ['TOOL_TALLY', A_TOOL_TALLY], ['BUCKET', A_BUCKET], ['TITLE', A_TITLE],
        ['NEW_MSG', A_NEW_MSG], ['GONE_MSG', A_GONE_MSG],
        ['REF_FORM', A_REF_FORM], ['REF_BUCKET', A_REF_BUCKET], ['REF_STRIP', A_REF_STRIP]]) {
        assertSingleHit(scan, a, 'v3279_' + label);
    }
    ok('14 个真源锚点各恰中一次；破坏锚点字面量在本档各只声明一次');
});

/* ══════════════ F. 被扩面后不许留下旧面残留 ══════════════ */
test('v3279 F1. ★★ 旧面残留归零：旧台账标题与旧口径描述不得再在场', () => {
    const scan = read(SCAN_REL);
    assert.equal(scan.includes('A7 方法级死代码台账（v3.227.0 分域）: 方法 '), false,
        '旧读数行必须已被声明级读数取代（两套读数并存 = 读者看哪套？）');
    assert.equal(scan.includes('仅测试引用（对外契约面，由测试守着）'), false,
        '旧 A7.2 标题必须已随之更新');
    const tsv = read(TSV_REL);
    assert.equal(tsv.includes('A7.1「零引用方法」冻结基线'), true,
        '台账头的历史标题应保留（历史留痕不得抹），但口径段须已同步');
    ok('旧读数行/旧 A7.2 标题已消失；台账历史标题保留');
});

/* ══════════════ G. 自防护 ══════════════ */
test('v3279 G1. ★ 自防护：O7 三批真源特征与本档自身不得被摘掉', () => {
    assert.ok(INDEX_SRC.includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(INDEX_SRC.includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    assert.ok(INDEX_SRC.includes('_formatBindDepsRow'), 'O7 第一批真源特征仍在场');
    assert.ok(typeof breakSource === 'function', '破坏工具从唯一真源取用');
    const self = read(path.join('tests', 'v3279_o7_scanner_decl_surface.test.mjs'));
    assert.ok(self.length > 6000, '本档自身不得被清空（长度下限）');
    const rawForm2 = (s) => s.replace(/[\\]/g, '\\\\');
    for (const a of [A_FN, A_CT, A_AUDIT, A_TOOL_TALLY, A_REF_BUCKET]) assert.ok(self.includes(rawForm2(a)), '本档须逐字持有锚点：' + a);
    ok('真源特征 / 破坏工具 / 本档自身均在位');
});

/* ══════════════ H. 三源同源 + 当版锚点 ══════════════ */
test('v3279 H1. ★ 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(INDEX_SRC.includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    assert.equal(vnum('3.279.0'), vnum(pkg), '本档恰锚当版');
    ok('三源同源 ' + pkg);
});
