// tests/v3286_plan_currency.test.mjs — v3.286.0 O8 第二刀：计划陈旧口径门的成对套件
// 主题：`tests/audit/scan_plan_currency.mjs` 的每条判据都必须**真能翻红** ——
//   一个「永远 exit 0」的计划扫描器同样是绿的，所以它必须有合成仓负控制。
//
//   【本档钉什么】
//     A  结构面：扫描器在位 + 夹具模式/改根 + 面下限 + 三份真源在场检查
//     B  合成仓逐条：P1（0 个 / 2 个现行节）/P2（旧节无陈旧标记）/P3（执行状态版本错位）
//        /P4（已交付 Op 复活）/P5（未登记 / 退位项）/P6（契约声明缺失）各自 ⇒ exit 1 且点名
//     C  fail-closed：PLAN 缺失 / 登记缺失 / index.js 缺版本真源 ⇒ exit 2
//     D  健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）
//     E  判据纯度 H5：破坏锚点字面量各只有 1 个持有常量 + 声明序 + 真源上单命中
//     F  真源码破坏：摘掉任一条判据 ⇒ 本档同一条合成仓用例不再翻红（判据不是装饰）
//     G  自防护 + 三源同源 + 当版锚点 + 两处登记面已补
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCAN_REL = path.join('tests', 'audit', 'scan_plan_currency.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有；全部单行） ---- */
const A_P1_NONE = "    bad('PLAN 里找不到「唯一现行排序」节 ⇒ 读者无从分辨哪一节是现行排序（本门存在的理由）');";
const A_P1_MULTI = "    bad('PLAN 里有 ' + currentSections.length + ' 个「唯一现行排序」节（第 '";
const A_P2 = "        bad('PLAN 第 ' + ln + ' 行的排序型节「' + title + '」未带陈旧标记 ⇒ '";
const A_P3 = "        bad('PLAN 当前执行状态写 v' + m[1] + ' ≠ index.js 真值 v' + VERSION";
const A_P4 = "                bad('现行排序节的下一步里出现「O' + num + '」（文首现状节记为已交付）却未标状态'";
const A_P5_MISS = "    if (missing.length) bad('实际读到的排序型节未登记（新增排序节必须登记）：' + missing.join(' / '));";
const A_P5_EXTRA = "    if (extra.length) bad('登记了但磁盘上已没有该排序型节（退位项须一并摘掉）：' + extra.join(' / '));";
const A_P6_A = "    if (!regSrc.includes('唯一现行排序')) bad('plan_currency.tsv 丢了「唯一现行排序」契约声明');";
const A_P6_B = "    if (!regSrc.includes('陈旧标记')) bad('plan_currency.tsv 丢了「陈旧标记」契约声明');";
const A_FLOOR_LINES = "if (lines.length < 40) drift('PLAN 只有 ' + lines.length + ' 行（下限 40）⇒ 枚举塌陷，拒绝给结论');";
const A_FLOOR_H2 = "if (h2.length < 4) drift('PLAN 的 H2 节只有 ' + h2.length + ' 个（下限 4）⇒ 结构塌陷，拒绝给结论');";
const A_SELF_LEN = 'assert.ok(self.length > 6000';
const A_SELF_HEAD = 'const SCAN_REL = ';

/* ══════════════ 合成仓构造 ══════════════ */

/** 造一个最小但「健康」的合成仓 PLAN：全套判据都应通过。 */
function mkRepo(mut = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-plancur-'));
    const auditDir = path.join(dir, 'tests', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });

    const st = {
        version: '9.9.9',
        idxHasVersion: true,
        omitPlan: false, planText: null,
        omitReg: false, regText: null,
        currentTitle: '当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）',
        dupCurrent: false,                 // true ⇒ 造两个现行节（P1 多值）
        dropCurrent: false,                // true ⇒ 完全没有现行节（P1 零值）
        oldTitle: '优先级',
        oldStale: true,                    // 旧节是否带陈旧标记
        handTitle: '起手两件（历史节）',
        handStale: true,
        stepOp: 'O8',                      // 下一步里点名的 Op
        stepOpStated: true,                // 该条是否带「已交付/收口/交付」字样
        extraSortSection: null,            // 追加一个排序型节（P5 未登记用）
    };
    mut(st);

    fs.writeFileSync(path.join(dir, 'index.js'), st.idxHasVersion
        ? "const VERSION = '" + st.version + "';" + NL
        : "const VER = '" + st.version + "';" + NL);

    const filler = [];
    /* 填充 20 行：须让**最小**形态（删掉现行节那一段）仍在面下限 40 行之上 ——
     *   否则 P1 用例会被面下限先拦成 exit 2，测的就成了下限而不是 P1（首版踩到，实测）。 */
    for (let i = 0; i < 20; i++) filler.push('填充行 ' + i + '：使 PLAN 达到面下限，避免枚举塌陷误判。');

    const blocks = [];
    blocks.push('# 合成仓发展规划');
    blocks.push('');
    blocks.push('> **当前执行状态（2026-10-06，v' + st.version + '）**：【本节是唯一现行口径】');
    blocks.push('> · **优化计划 O1–O8**：O1（甲）/ O2（乙）/ O3（丙）/ O4（丁）/ O5（戊）/ O6（己）/ O7（庚）'
        + '已交付各自定向门；**O8 为当前主线**。');
    blocks.push('');
    blocks.push('## 现状基线（规划起点）');
    blocks.push('');
    blocks.push('| 量 | 读数 |');
    blocks.push('|---|---|');
    blocks.push('| 版本 | **v' + st.version + '** |');
    blocks.push('');
    if (!st.dropCurrent) {
        blocks.push('## ' + st.currentTitle);
        blocks.push('');
        blocks.push('> 本节是唯一现行排序；其余排序节一律带陈旧标记。');
        blocks.push('');
        blocks.push('1. **' + st.stepOp + (st.stepOpStated ? ' 收口' : ' 推进')
            + '**（' + (st.stepOpStated ? '已交付第一刀；本刀补第二刀后收口' : '按计划继续') + '）。');
        blocks.push('2. **下一项乙** —— 尚未做。');
        blocks.push('3. **下一项丙** —— 尚未做。');
        blocks.push('');
    }
    if (st.dupCurrent) {
        blocks.push('## 当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）（副本，故意造重）');
        blocks.push('');
        blocks.push('1. **伪现行** —— 与上一节并列，读者无从分辨。');
        blocks.push('');
    }
    blocks.push('## 一、优化提升');
    blocks.push('正文……');
    for (const f of filler) blocks.push('> ' + f);
    blocks.push('');
    blocks.push('## ' + st.oldTitle);
    if (st.oldStale) blocks.push('> **【陈旧节 · 勿当排序读】** 本节属上一轮，仅作交付史保留。');
    blocks.push('1. **A1 + A2** —— 早已交付。');
    blocks.push('');
    blocks.push('## ' + st.handTitle);
    if (st.handStale) blocks.push('> **【陈旧节 · 勿当排序读】** 本节属收尾轮，均已交付。');
    blocks.push('① 甲；② 乙。');
    blocks.push('');
    if (st.extraSortSection) {
        blocks.push('## ' + st.extraSortSection);
        blocks.push('> **【陈旧节 · 勿当排序读】** 占位。');
        blocks.push('1. 占位项。');
        blocks.push('');
    }
    const planText = st.planText !== null ? st.planText : blocks.join(NL) + NL;
    if (!st.omitPlan) fs.writeFileSync(path.join(dir, 'PLAN.md'), planText);

    /* 登记表：由**实际造出的**排序型节名决定（健康仓双向齐全）。 */
    const sortTitles = [];
    for (const t of [st.dropCurrent ? null : st.currentTitle,
        st.dupCurrent ? '当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）（副本，故意造重）' : null,
        st.oldTitle, st.handTitle, st.extraSortSection]) {
        if (t && !sortTitles.includes(t)) sortTitles.push(t);
    }
    const regLines = ['# 合成仓登记', '# 契约：唯一现行排序 · 陈旧标记', ...sortTitles];
    const regText = st.regText !== null ? st.regText : regLines.join(NL) + NL;
    if (!st.omitReg) fs.writeFileSync(path.join(auditDir, 'plan_currency.tsv'), regText);
    st.sortTitles = sortTitles;
    return dir;
}

/** 在合成仓上跑扫描器（夹具模式），返回 {code, out}。 */
function run(dir, extraEnv) {
    const r = spawnSync(process.execPath, [SCAN], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir, ...(extraEnv || {}) },
    });
    return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

function withRepo(mut, fn) {
    const dir = mkRepo(mut);
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3286B A. 扫描器在位、支持夹具模式与改根、面下限与三份真源在场', () => {
    assert.ok(fs.existsSync(SCAN), '扫描器必须在 tests/audit/scan_plan_currency.mjs');
    const s = scanSrc();
    assert.ok(s.includes('LONSHA_AUDIT_FIXTURE'), '须支持夹具模式（合成仓用）');
    assert.ok(s.includes('LONSHA_AUDIT_ROOT'), '须支持改根（合成仓用）');
    assert.ok(s.includes(A_FLOOR_LINES) && s.includes(A_FLOOR_H2),
        '须有面下限（枚举塌陷时「0 不一致」是空对空）');
    assert.ok(s.includes('plan_currency.tsv') && s.includes('PLAN.md') && s.includes("'index.js'"),
        '须核对三份真源（登记 / PLAN / index.js 版本）');
    assert.ok(s.includes('process.exit(2)') && s.includes('process.exit(1)'), '三档退出码须在场');
    assert.ok(s.includes('唯一现行排序'), 'P1 的存在性锚点');
    assert.ok(s.includes('陈旧'), 'P2 的存在性锚点');
    ok('结构面齐备');
});

/* ══════════════ D. 健康合成仓 ══════════════ */
test('v3286B D. 健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）', () => {
    withRepo(() => {}, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '健康仓必须 exit 0：' + r.out.slice(-400));
        assert.ok(r.out.includes('现行节 1 个'), '通过时须报出现行节读数');
    });
    ok('健康合成仓 exit 0');
});

/* ══════════════ B. 合成仓逐条翻红 ══════════════ */
test('v3286B B1. P1 现行节：零个 / 两个 ⇒ exit 1', () => {
    withRepo((s) => { s.dropCurrent = true; }, (dir) => {
        /* 登记面须与「删掉现行节」后的磁盘一致（否则会先撞 P5 退位项，掩盖 P1：这正是
         *   「一条用例只该有一个变量」的口径 —— 判据套件测的是被测判据，不是别的判据。 */
        const p = path.join(dir, 'tests', 'audit', 'plan_currency.tsv');
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
            .replace('当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）' + NL, ''));
        const r = run(dir);
        assert.equal(r.code, 1, '没有现行节必须 exit 1');
        assert.ok(r.out.includes('无从分辨'), '须点名「读者无从分辨」');
    });
    withRepo((s) => { s.dupCurrent = true; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '两个现行节必须 exit 1');
        assert.ok(r.out.includes('自相矛盾'), '须点名「唯一」自相矛盾');
    });
    ok('P1 两种形态翻红');
});

test('v3286B B2. P2 排序型旧节缺陈旧标记 ⇒ exit 1 并点名行号', () => {
    withRepo((s) => { s.oldStale = false; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '旧排序节无陈旧标记必须 exit 1');
        assert.ok(r.out.includes('未带陈旧标记') && r.out.includes('优先级'), '须点名节名与成因');
    });
    withRepo((s) => { s.handStale = false; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '「起手」类旧节同样必须带标记（标题写法不豁免）');
        assert.ok(r.out.includes('起手'), '须点名该节');
    });
    ok('P2 两类排序型节各自翻红');
});

test('v3286B B3. P3 当前执行状态版本与代码不同源 ⇒ exit 1', () => {
    withRepo((s) => { s.version = '9.9.9'; s.planText = null; s.planVersionOverride = true; }, (dir) => {
        /* 直接把 PLAN 里的执行状态版本改成旧版：锚点两侧都造出真实形态。 */
        const p = path.join(dir, 'PLAN.md');
        const t = fs.readFileSync(p, 'utf8').replace('，v9.9.9）', '，v9.9.8）');
        fs.writeFileSync(p, t);
        const r = run(dir);
        assert.equal(r.code, 1, '执行状态停旧版必须 exit 1');
        assert.ok(r.out.includes('现行口径停在旧版本'), '须点名成因：旧排序会被当现行读');
    });
    ok('P3 翻红');
});

test('v3286B B4. P4 已交付条目复活为下一步 ⇒ exit 1', () => {
    withRepo((s) => { s.stepOp = 'O6'; s.stepOpStated = false; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '已交付的 O6 被列为下一步且未标状态必须 exit 1');
        assert.ok(r.out.includes('复活为待办'), '须点名「已交付条目被复活」');
    });
    /* 对照：同一编号但**自带状态**（收口）⇒ 合法，不得误红 */
    withRepo((s) => { s.stepOp = 'O6'; s.stepOpStated = true; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '自带「已交付/收口」字样的条目必须放行：' + r.out.slice(-300));
    });
    ok('P4 翻红 + 带状态放行（防误红）');
});

test('v3286B B5. P5 登记面：未登记 / 退位项 ⇒ exit 1', () => {
    withRepo((s) => { s.extraSortSection = '新优先级（尚未登记）'; }, (dir) => {
        /* 造一个真的未登记排序节：登记表按**未含**它的形态写死。 */
        const dir2 = dir;
        const p = path.join(dir2, 'tests', 'audit', 'plan_currency.tsv');
        const t = fs.readFileSync(p, 'utf8').replace('新优先级（尚未登记）' + NL, '');
        fs.writeFileSync(p, t);
        const r = run(dir2);
        assert.equal(r.code, 1, '新增排序节未登记必须 exit 1');
        assert.ok(r.out.includes('未登记'), '须点名未登记');
    });
    withRepo((s) => { s.regText = null; }, (dir) => {
        const p = path.join(dir, 'tests', 'audit', 'plan_currency.tsv');
        fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + '幽灵节（已退位）' + NL);
        const r = run(dir);
        assert.equal(r.code, 1, '登记了不在磁盘的排序节必须 exit 1');
        assert.ok(r.out.includes('退位项'), '须点名退位项');
    });
    ok('P5 两种形态各自翻红');
});

test('v3286B B6. P6 契约声明缺失 ⇒ exit 1', () => {
    withRepo((s) => { s.regText = '# 只剩标题，无契约声明' + NL + '优先级' + NL + '起手两件（历史节）' + NL; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '缺契约声明必须 exit 1');
        assert.ok(r.out.includes('契约声明'), '须点名契约声明缺失');
    });
    ok('P6 翻红');
});

/* ══════════════ C. fail-closed ══════════════ */
test('v3286B C. fail-closed：三份真源不可用 ⇒ exit 2', () => {
    withRepo((s) => { s.omitPlan = true; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 2, 'PLAN 缺失必须 exit 2（没得判 ≠ 通过）');
        assert.ok(r.out.includes('结构漂移'), '须给出结构漂移归因');
    });
    withRepo((s) => { s.omitReg = true; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 2, '登记缺失必须 exit 2');
    });
    withRepo((s) => { s.idxHasVersion = false; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 2, 'index.js 缺 VERSION 真源必须 exit 2');
        assert.ok(r.out.includes('版本真源失效'), '须点名版本真源失效');
    });
    /* 面下限：PLAN 被掏空成几行 ⇒ 枚举塌陷 */
    withRepo((s) => { s.planText = '# 空壳' + NL + '## 一' + NL + '## 二' + NL + '## 三' + NL; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 2, 'PLAN 行数塌陷必须 exit 2（下限 40）');
        assert.ok(r.out.includes('枚举塌陷'), '须点名枚举塌陷');
    });
    ok('四类结构漂移各自 exit 2');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3286B E. 判据纯度：破坏锚点字面量在本档各只有 1 个持有常量，且真源上单命中', () => {
    const self = readRoot(path.join('tests', 'v3286_plan_currency.test.mjs'));
    const ANCHORS = [['P1_NONE', A_P1_NONE], ['P1_MULTI', A_P1_MULTI], ['P2', A_P2], ['P3', A_P3],
        ['P4', A_P4], ['P5_MISS', A_P5_MISS], ['P5_EXTRA', A_P5_EXTRA], ['P6_A', A_P6_A], ['P6_B', A_P6_B],
        ['FLOOR_LINES', A_FLOOR_LINES], ['FLOOR_H2', A_FLOOR_H2],
        ['SELF_LEN', A_SELF_LEN], ['SELF_HEAD', A_SELF_HEAD]];
    const SCANNER_ANCHORS = ANCHORS.slice(0, 11);
    const holders = new Map();
    for (const [label, a] of ANCHORS) {
        assert.equal(a.includes(NL), false, label + ' 须是单行锚点');
        assert.ok(a.length > 12, label + ' 锚点须足够长');
        assert.ok(self.includes(a), label + ' 锚点字面量须逐字被本档持有');
        if (!holders.has(a)) holders.set(a, new Set());
        holders.get(a).add(label);
    }
    for (const [lit, set] of holders) {
        assert.equal(set.size, 1, '字面量 ' + lit + ' 被多个锚点常量持有：' + [...set].join(' / '));
    }
    const declRe = /^const\s+(A_[A-Z0-9_]+)\s*=/gm;
    const declNames = [...self.matchAll(declRe)].map((m) => m[1]);
    assert.deepEqual(declNames, ['A_P1_NONE', 'A_P1_MULTI', 'A_P2', 'A_P3', 'A_P4', 'A_P5_MISS',
        'A_P5_EXTRA', 'A_P6_A', 'A_P6_B', 'A_FLOOR_LINES', 'A_FLOOR_H2', 'A_SELF_LEN', 'A_SELF_HEAD'],
        '本档锚点常量声明序须稳定');
    const s = scanSrc();
    for (const [label, a] of SCANNER_ANCHORS) assertSingleHit(s, a, 'v3286b_h_' + label);
    ok('13 个锚点各只有 1 个持有常量；11 条扫描器锚点在真源上各恰中一次');
});

/* ══════════════ F. 真源码破坏 ══════════════ */
test('v3286B F. 真源码破坏：摘掉任一条判据 ⇒ 合成仓上不再翻红（判据不是装饰）', () => {
    const s = scanSrc();
    const runBroken = (brokenSrc, dir, extraEnv) => {
        const p = path.join(dir, 'tests', 'audit', 'scan2b.mjs');
        fs.writeFileSync(p, brokenSrc);
        const r = spawnSync(process.execPath, [p], {
            cwd: dir, encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir, ...(extraEnv || {}) },
        });
        return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
    };
    /* ① 摘掉 P2 陈旧标记检查 */
    {
        const broken = breakSource(s, A_P2, "        if (false) bad('PLAN 第 ' + ln + ' 行的排序型节「' + title + '」未带陈旧标记 ⇒ '", 'v3286b_f1');
        withRepo((st) => { st.oldStale = false; }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉 P2 后无标记不得再翻红');
        });
    }
    /* ② 摘掉 P3 版本同源检查 */
    {
        const broken = breakSource(s, A_P3, "        if (false) bad('PLAN 当前执行状态写 v' + m[1] + ' ≠ index.js 真值 v' + VERSION", 'v3286b_f2');
        withRepo((st) => { st.version = '9.9.9'; }, (dir) => {
            const p = path.join(dir, 'PLAN.md');
            fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('，v9.9.9）', '，v9.9.8）'));
            assert.equal(runBroken(broken, dir).code, 0, '摘掉 P3 后版本错位不得再翻红');
        });
    }
    /* ③ 摘掉 P4 复活检查 */
    {
        const broken = breakSource(s, A_P4, "                if (false) bad('现行排序节的下一步里出现「O' + num + '」（文首现状节记为已交付）却未标状态'", 'v3286b_f3');
        withRepo((st) => { st.stepOp = 'O6'; st.stepOpStated = false; }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉 P4 后复活条目不得再翻红');
        });
    }
    /* ④ 摘掉 P5「未登记」检查 */
    {
        const broken = breakSource(s, A_P5_MISS, "    if (false) bad('');", 'v3286b_f4');
        withRepo((st) => { st.extraSortSection = '新优先级（尚未登记）'; }, (dir) => {
            const p = path.join(dir, 'tests', 'audit', 'plan_currency.tsv');
            fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('新优先级（尚未登记）' + NL, ''));
            assert.equal(runBroken(broken, dir).code, 0, '摘掉 P5 后未登记不得再翻红');
        });
    }
    /* ⑤ 拔掉面下限：即便把 PLAN 砍到几行，也不该再 exit 2（证明下限真的在拦） */
    {
        const broken = breakSource(s, A_FLOOR_LINES, 'if (lines.length < 0) drift(', 'v3286b_f5');
        withRepo((st) => { st.planText = '# 空壳' + NL + '## 一' + NL + '## 二' + NL + '## 三' + NL; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.notEqual(r.code, 2, '下限被拔掉后行数塌陷不得再触发 exit 2（实 ' + r.code + '）');
        });
    }
    ok('五处真源码破坏各自让对应判据失去作用（P2 / P3 / P4 / P5 / 面下限）');
});

/* ══════════════ G. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3286B G. 自防护、当版锚点与两处登记面', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'audit', 'plan_currency.tsv')), '登记表须在场');
    assert.ok(readRoot(path.join('tests', 'audit', 'plan_currency.tsv')).includes('唯一现行排序'),
        '登记表须带契约声明');
    const s = scanSrc();
    assert.ok(s.includes('plan-currency'), '扫描器须保留自身标识');
    const self = readRoot(path.join('tests', 'v3286_plan_currency.test.mjs'));
    assert.ok(self.length > 6000, '本档自身不得被清空（实 ' + self.length + ' 字符）');
    assert.ok(self.includes(A_SELF_HEAD) && self.includes(A_SELF_LEN), '本档须持有自防护锚点');

    const pkg = JSON.parse(readRoot('package.json')).version;
    const man = JSON.parse(readRoot('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(readRoot('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'),
        'index.js 版本常量与 package.json 一致');
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    /* [v3.287.0 交棒] 本档写于 3.286.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */
    assert.ok(vnum(pkg) >= vnum('3.286.0'), '本档版本下界 3.286.0 不得被绕过（实 ' + pkg + '）');
    assert.ok(readRoot(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv')).includes('scan_plan_currency.mjs'),
        '新扫描器须登记进探针矩阵');
    assert.ok(readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv')).includes('v3286_plan_currency.test.mjs'),
        '本档须登记进在役测试面名册');
    ok('登记表/扫描器/本档均在位（' + self.length + ' 字符）；两处登记面已补行；版本四源同源');
});