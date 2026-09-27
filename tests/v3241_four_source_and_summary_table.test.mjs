/* ============================================================
 * tests/v3241_four_source_and_summary_table.test.mjs — v3.241.0
 *
 * 主题：抬版四源同步 + 失败汇总表 —— 「门禁时只看汇总表」得先有表可看。
 *
 *   两件同源的事（都是接手面）：
 *     ① 版本守卫此前只查**机器读的三份**（index / manifest / package）。
 *        本仓的发布面还有两份**人读**的：CHANGELOG.md 顶节（用户看那节说明）与
 *        TODO.md「最近更新」（下一个人先看那一行）。实测抬版时这两份最常漏，
 *        而漏了不会有任何机器读数报警 —— 只在下一版被某个历史测试
 *        `startsWith('## v'+CUR)` 抓住，那时归因已经远了。
 *     ② 失败清单此前只活在**输出流里**（人得往上翻）；audit 段只给一行「通过 N/M」。
 *        于是「门禁时只看汇总表」这句话当时没有可看的东西。
 *
 *   判据一律落**真源码 / 真进程**：
 *     A 结构面：
 *     B 行为面：真仓库上版本守卫 exit 0 且念出四源读数
 *     C 负控制：真源码破坏 → 独立树 → 同款真判据（含一组保绿对照：缺席容忍）
 *     D run.mjs 端到端：夹具树里真跑一个红文件 + 一个绿文件，汇总表/JSON 必须带得出归因
 *     E 判据面自防护与版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakText } from './_break_kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const VG_REL = 'tests/audit/scan_version_guard.mjs';
const RUN_REL = 'tests/run.mjs';
const VG = readFileSync(path.join(ROOT, VG_REL), 'utf-8');
const RUN = readFileSync(path.join(ROOT, RUN_REL), 'utf-8');
const CUR = /const VERSION = '([0-9.]+)'/.exec(readFileSync(path.join(ROOT, 'index.js'), 'utf-8'))[1];

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
const ok = (msg) => console.log('  ✓ ' + msg);

/* ══════════ A. 结构面 ══════════ */
test('v3241 A1. 版本守卫含 V6/V7（人读面两份）与四源读数行', () => {
    for (const [needle, why] of [
        ['V6 ', '缺 V6 判据标记（CHANGELOG 顶节）'],
        ['V7 ', '缺 V7 判据标记（TODO 最近更新）'],
        ["read('CHANGELOG.md')", 'V6 须真的去读 CHANGELOG.md'],
        ["read('TODO.md')", 'V7 须真的去读 TODO.md'],
        ['四源 ', '报告行须念出四源读数（否则「查了」与「没查」在输出上同形）'],
        ['缺席', '缺席容忍必须显式表达（夹具树里可以没有这两份）'],
        ['!= VERSION ', '不同源必须点名期望值'],
    ]) assert.ok(VG.includes(needle), why + '：' + needle);
    ok('V6/V7 + 四源读数行齐备');
});

test('v3241 A2. 版本守卫仍是版本无关的（V6/V7 不得引入版本字面量）', () => {
    const code = VG.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const lits = [...code.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
    assert.deepStrictEqual(lits, [], '守卫必须版本无关（写死当版号 = 下一版即失效）：' + lits.join(','));
    ok('版本无关性未被 V6/V7 破坏');
});

test('v3241 A3. run.mjs 含汇总表三件：firstError / 失败汇总表 / TEST_SUMMARY_JSON', () => {
    for (const [needle, why] of [
        ['function firstError(', '缺归因抽取（汇总表要带得动归因）'],
        ['[run] 失败汇总表', '缺汇总表输出（「只看汇总表」得先有表）'],
        ['TEST_SUMMARY_JSON', '缺结构化摘要落盘通道'],
        ['auditSummary', 'audit 段须并入同一张表'],
        ['摘要**不参与判定**', '摘要与判据的边界必须写明（否则摘要会变成第二套判据）'],
    ]) assert.ok(RUN.includes(needle), why + '：' + needle);
    ok('汇总表三件齐备');

    // 摘要不得改变退出码语义：仍是 anyFail 一处决定。
    assert.ok(/process\.exit\(anyFail \? 1 : 0\)/.test(RUN),
        '退出码须仍由 anyFail 单点决定（摘要不得参与判定）');
});

/* ══════════ B. 行为面 ══════════ */
function runScan(root) {
    return spawnSync(process.execPath, [path.join(ROOT, VG_REL)], {
        encoding: 'utf-8', timeout: 120000, cwd: ROOT,
        env: { ...process.env, LONSHA_AUDIT_ROOT: root },
    });
}
test('v3241 B1. 真仓库上版本守卫 exit 0，四源全部在场且一致', () => {
    const r = runScan(ROOT);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树必须 exit 0：' + out.slice(-400));
    assert.ok(out.includes('四源 manifest✓ package✓ CHANGELOG TODO'),
        '四源读数须逐项在场：' + (out.split('\n')[0] || ''));
    assert.ok(/问题 0/.test(out), '须报「问题 0」');
    ok('真仓库四源一致');
});

/* ══════════ C. 负控制：真源码破坏 → 独立树 → 同款真判据 ══════════ */
/** 独立夹具树：三源 + tests/（**不搬** CHANGELOG/TODO，用于保绿对照与缺席分支）。 */
function mkTree(withDocs) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3241-vg-'));
    for (const f of ['index.js', 'manifest.json', 'package.json']) {
        writeFileSync(path.join(dir, f), readFileSync(path.join(ROOT, f)));
    }
    cpSync(path.join(ROOT, 'tests'), path.join(dir, 'tests'), { recursive: true });
    if (withDocs) {
        for (const f of ['CHANGELOG.md', 'TODO.md']) {
            writeFileSync(path.join(dir, f), readFileSync(path.join(ROOT, f)));
        }
    }
    return dir;
}
function withTree(withDocs, mutate) {
    const dir = mkTree(withDocs);
    try {
        mutate(dir);
        const r = runScan(dir);
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('v3241 C1. 负控制 N1：CHANGELOG 顶节停在上一版 → 必须 exit 1（V6）', () => {
    const r = withTree(true, (d) => {
        const p = path.join(d, 'CHANGELOG.md');
        const src = readFileSync(p, 'utf-8');
        // 真源码破坏：把顶节标题的版本号改成「上一版」形态（不是写死常量，是改真文件文本）
        writeFileSync(p, breakText(src, '## v' + CUR, '## v0.0.1'));
    });
    assert.strictEqual(r.status, 1, 'V6 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/V6 /.test(r.out), '归因串须指向 V6');
    assert.ok(r.out.includes('CHANGELOG.md'), '须点名文件');
});

test('v3241 C2. 负控制 N2：TODO 最近更新停在上一版 → 必须 exit 1（V7）', () => {
    const r = withTree(true, (d) => {
        const p = path.join(d, 'TODO.md');
        writeFileSync(p, breakText(readFileSync(p, 'utf-8'), '最近更新：v' + CUR, '最近更新：v0.0.1'));
    });
    assert.strictEqual(r.status, 1, 'V7 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/V7 /.test(r.out), '归因串须指向 V7');
    assert.ok(r.out.includes('TODO.md'), '须点名文件');
});

test('v3241 C3. 负控制 N3：两份人读面各删一行 → 两判据同时点名（不是「有一个就够了」）', () => {
    const r = withTree(true, (d) => {
        writeFileSync(path.join(d, 'CHANGELOG.md'),
            readFileSync(path.join(d, 'CHANGELOG.md'), 'utf-8').replace(/^## v[\s\S]*?\n/, '（本版无说明）\n'));
        writeFileSync(path.join(d, 'TODO.md'),
            readFileSync(path.join(d, 'TODO.md'), 'utf-8').replace(/最近更新：v[0-9.]+/, '最近更新：未知'));
    });
    assert.strictEqual(r.status, 1, '两份都坏必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-300));
    assert.ok(/V6 /.test(r.out), 'V6 须点名（顶节缺标题）');
    assert.ok(/V7 /.test(r.out), 'V7 须点名（最近更新不可解析）');
});

test('v3241 C4. 保绿对照：夹具树里两份人读面缺席 → 仍须 exit 0（缺席容忍）', () => {
    const probe = mkTree(false);
    try {
        assert.ok(!existsSync(path.join(probe, 'CHANGELOG.md')) && !existsSync(path.join(probe, 'TODO.md')),
            '夹具前提：这一档的树里确实没有那两份人读面（否则本组测的不是缺席容忍）');
    } finally { rmSync(probe, { recursive: true, force: true }); }
    const r = withTree(false, () => { /* 什么都不做：树里本就没有这两份 */ });
    assert.strictEqual(r.status, 0,
        '缺文件时不得 fail-closed（同 V1 对 package.json 的口径：容忍缺席，不容忍不一致）：'
        + r.out.slice(-300));
    assert.ok(r.out.includes('CHANGELOG(缺席)') && r.out.includes('TODO(缺席)'),
        '缺席须在读数里如实标出（缺席与「查过没问题」不得同形）：' + (r.out.split('\n')[0] || ''));
});

test('v3241 C5. 负控制工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakText(VG, 'THIS_ANCHOR_ABSENT_V3241', ''), /拒绝破坏/,
        '锚点不存在必须抛（否则「破坏」是假的）');
    assert.throws(() => breakText(VG, 'const ', ''), /拒绝破坏/, '多命中必须抛');
    assert.throws(() => breakText(VG, 'const VERSION = ', 'const VERSION = '), /拒绝破坏/,
        '同值替换必须抛（改了源码但行为未变，破坏不可观测）');
    assert.ok(VG.includes('const VERSION'), '真源码里锚点前提成立（否则整组负控制是空的）');
});

/* ══════════ D. run.mjs 端到端：汇总表必须带得出归因 ══════════ */
/** 造一个最小夹具仓库：run.mjs + index.js（版本真源）+ 一个真红文件 + 一个真绿文件。 */
function mkRunTree() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3241-run-'));
    mkdirSync(path.join(dir, 'tests'), { recursive: true });
    writeFileSync(path.join(dir, 'tests', 'run.mjs'), readFileSync(path.join(ROOT, RUN_REL)));
    writeFileSync(path.join(dir, 'index.js'), "const VERSION = '" + CUR + "';\n");
    writeFileSync(path.join(dir, 'tests', 'zz_red.test.mjs'),
        "import test from 'node:test';\nimport assert from 'node:assert';\n"
        + "test('故意红', () => { assert.ok(false, '故意失败：汇总表须带出这条归因'); });\n");
    writeFileSync(path.join(dir, 'tests', 'zz_green.test.mjs'),
        "import test from 'node:test';\nimport assert from 'node:assert';\n"
        + "test('故意绿', () => { assert.ok(true); });\n");
    return dir;
}
/* [夹具自身的缺陷，本版首跑即撞] 子运行器**必须**先剥掉外层 harness 的注入标记：
 *   本套件自己跑在 `node --test` 里，进程环境带着 NODE_TEST_CONTEXT 等内部标记；
 *   若原样继承给夹具里的 run.mjs，它会连同这些标记一起传给自己的子进程，
 *   子进程的 TAP 行为随之改变（实测：夹具里的退出码不再等于真判据结果，
 *   于是 D1 报「有红文件必须 exit 1」—— 红的是夹具，不是运行器）。
 *   这与 v3207 那次的教训同形：**夹具要把被测对象放到干净环境里跑**。 */
function cleanEnv(extra) {
    const env = { ...process.env };
    for (const k of Object.keys(env)) {
        if (k === 'NODE_OPTIONS' || k.startsWith('NODE_TEST')) delete env[k];
    }
    return { ...env, ...(extra || {}) };
}
function runRunner(dir, extraEnv) {
    const json = path.join(dir, 'summary.json');
    const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'run.mjs')], {
        encoding: 'utf-8', timeout: 120000, cwd: dir,
        env: cleanEnv({ TEST_SUMMARY_JSON: json, ...(extraEnv || {}) }),
    });
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(json, 'utf-8')); } catch (e) { parsed = null; }
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), summary: parsed, jsonPath: json };
}

test('v3241 D1. 真红文件：汇总表带出文件名与第一条错误，JSON 摘要带同一份归因', () => {
    const dir = mkRunTree();
    try {
        const r = runRunner(dir);
        assert.strictEqual(r.status, 1, '有红文件必须 exit 1：' + r.out.slice(-400));
        assert.ok(r.out.includes('[run] 失败汇总表'), '须打印汇总表：' + r.out.slice(-400));
        const row = r.out.split('\n').find((l) => l.startsWith('  test  |') && l.includes('zz_red.test.mjs'));
        assert.ok(row, '汇总表须有该文件的表行：' + r.out.slice(-600));
        assert.ok(row.includes('故意失败'), '表行须带第一条错误原文（归因要摆在眼前，不能只给退出码）：' + row);
        assert.ok(r.summary, '结构化摘要须落盘且可解析');
        assert.strictEqual(r.summary.ok, false, '摘要须如实记失败');
        const f = r.summary.tests.failed.find((x) => x.file.includes('zz_red.test.mjs'));
        assert.ok(f, 'JSON 摘要须含该文件：' + JSON.stringify(r.summary.tests));
        assert.ok(/故意失败/.test(f.firstError), 'JSON 里的 firstError 须是那条真错误：' + f.firstError);
        assert.strictEqual(r.summary.version, CUR, '摘要须带真源版本读数：' + r.summary.version);
        ok('红文件归因端到端可达');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v3241 D2. 全绿夹具：exit 0、无失败表、摘要 ok=true（表不是恒打印装饰）', () => {
    const dir = mkRunTree();
    try {
        writeFileSync(path.join(dir, 'tests', 'zz_red.test.mjs'),
            "import test from 'node:test';\nimport assert from 'node:assert';\n"
            + "test('转绿', () => { assert.ok(true); });\n");
        const r = runRunner(dir);
        assert.strictEqual(r.status, 0, '全绿须 exit 0：' + r.out.slice(-400));
        assert.ok(!r.out.includes('[run] 失败汇总表'), '全绿时不得打印失败表：' + r.out.slice(-400));
        assert.ok(r.summary && r.summary.ok === true, '摘要须 ok=true');
        assert.deepStrictEqual(r.summary.tests.failed, [], '摘要失败清单须为空');
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ══════════ E. 判据面自防护与版本锚 ══════════ */
test('v3241 E1. 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 40, '本套件断言数 ' + asserts + ' 少于 40：判据被稀释');
    for (const fp of ['V6 ', 'V7 ', 'firstError', 'TEST_SUMMARY_JSON', '失败汇总表',
        'CHANGELOG(缺席)', '拒绝破坏', 'scan_version_guard.mjs', 'run.mjs']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    ok('断言 ' + asserts + ' 条，指纹齐全');
});

test('v3241 E2. 版本锚：本版不低于出生版本 3.241.0', () => {
    assert.ok(vnum(CUR) >= vnum('3.241.0'), '本版不得低于出生版本（CUR=' + CUR + '）');
    assert.ok(SELF.includes("vnum('3.241.0')"), '须显式留下出生版本锚（否则本文件会被当成无锚历史文件）');
});
