// tests/v3318_ui_narrow_layout_gate.test.mjs — v3.318.0 M-O2：窄屏布局容差门的**成对套件**
// 主题：`tests/audit/scan_ui_narrow_layout.mjs` 的每条判据都必须**真能翻红**。
//   本版抓到的缺陷是**产品面真缺陷**（320px 下把 44px 的 checkbox 顶出视口，left=449 > 320）：
//   按本仓先例，处置是「修产品 + 配判据档锚住它（真源码破坏：拆掉断行 / ��掉收缩必须翻红）」，
//   而不是只放宽探针判据。
//
//   【本档钉什么】
//     A  结构面：门在位 + 判据名在册 + 面下限常量在场 + 边界声明在场
//     B  真仓健康态：本门在真仓上必须 exit 0（防「永远红」的另一种假绿）
//     C  合成仓逐条真源码破坏（**两条，与门头 D1/D2 一一对应**）：
//        C1 摘掉 `.ls-hint` 的断行声明 ⇒ N1 必须点名「未声明 overflow-wrap / word-break」
//        C2 摘掉 `.ls-row > div` 的 `min-width: 0` ⇒ N2 必须点名「不允许收缩到内容以下」
//        每条都配**原版对照**（未破坏的真源在同一合成仓上必须 exit 0）——
//        只验「破坏会翻红」不验「原版是绿的」，会把「破坏写死成模拟常量」判成绿。
//     D  fail-closed：settings-ui.js 缺失 / 退化 / 注入样式块不在 ⇒ exit 2（没得判 ≠ 通过）
//     E  面下限可调：抬高字节下限 ⇒ exit 2（结构漂移出口活着，不是恒绿的装饰）
//     F  判据纯度 H5：两个破坏锚点字面量各只有 1 个持有常量 + 真源上各恰中 1 次
//     G  当版锚点 + 四处登记面（探针矩阵 / 在役测试面名册 / v3247 接收方台账 / 灵敏度实测工具）
//
//   【为什么用「合成仓」而不是直接破坏真仓】
//     真仓破坏会污染后续跑批。本档每条破坏都发生在 `mkdtempSync` 出来的独立目录，
//     只放一份（已破坏的）`settings-ui.js`，用 `LONSHA_AUDIT_ROOT` 指过去 ⇒ 真仓零污染，
//     且门判据读到的确实是「被破坏的那份真源码」。
//
//   【边界（诚实，必须与结论一起读）】
//     · 本档证明的是「**门的判据是可信的**」（能翻红、fail-closed、下限非装饰）。
//       它**不**在浏览器里量像素 —— 真像素读数只来自真浏览器取证
//       （`tests/audit/_mo2_realbrowser_probe.mjs`，依赖本地 ST clone 与 Chromium，不进 npm test）。
//     · 破坏只覆盖门头声明的两条（N1 / N2）；门新增判据时**必须**在此补对应破坏组。
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
const SCAN_REL = path.join('tests', 'audit', 'scan_ui_narrow_layout.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const UI_REL = 'settings-ui.js';
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

/* ---- 破坏锚点（逐字取自真源，禁改；全部按单行片段持有）---- */
const A_HINT = '            .ls-hint { font-size: 12px; color: var(--ls-text-3,#6e7681); padding: 6px 8px; line-height: 1.5; overflow-wrap: anywhere; word-break: break-word; }';
const R_HINT = '            .ls-hint { font-size: 12px; color: var(--ls-text-3,#6e7681); padding: 6px 8px; line-height: 1.5; }';
const A_CHILD = '            .ls-row > div { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }';
const R_CHILD = '            .ls-row > div { overflow-wrap: anywhere; word-break: break-word; }';

/* ══════════════ 跑门 ══════════════ */
/** 合成仓一律走**夹具模式**（`LONSHA_AUDIT_FIXTURE=1`）：面下限退到 1，
 *  否则合成仓会先被下限拦成 exit 2，判据根本到不了。
 *  下限本身由 D/E 两组钉住（结构漂移出口不得是装饰）。 */
function runGate(root, extraEnv = {}) {
    const env = Object.assign({}, process.env, {
        LONSHA_AUDIT_ROOT: root, LONSHA_AUDIT_FIXTURE: '1',
    }, extraEnv);
    const r = spawnSync('node', [SCAN], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000 });
    return { rc: r.status === null ? -1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function runGateStrict(root, extraEnv = {}) {
    const env = Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: root }, extraEnv);
    delete env.LONSHA_AUDIT_FIXTURE;
    const r = spawnSync('node', [SCAN], { cwd: ROOT, env, encoding: 'utf8', timeout: 180000 });
    return { rc: r.status === null ? -1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** 合成仓：只放一份 settings-ui.js（门只读它），真仓零污染。 */
function withRepo(uiText, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3318-narrow-'));
    try {
        if (uiText !== null) fs.writeFileSync(path.join(dir, UI_REL), uiText, 'utf8');
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 破坏后语法必须仍然合法：非零退出要能归因于判据，而不是解析崩溃。 */
function assertSyntaxOk(text, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3318-syn-'));
    try {
        const p = path.join(dir, 'x.mjs');
        fs.writeFileSync(p, text, 'utf8');
        const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
        assert.equal(r.status, 0, label + '：破坏后语法必须仍合法（否则非零退出不可归因于判据）'
            + '：' + String(r.stderr || '').slice(0, 200));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ══════════════ A 结构面 ══════════════ */
test('v3318 A1. ★★ 门在位、判据名在册、面下限常量与边界声明在场', () => {
    assert.ok(fs.existsSync(SCAN), '门必须在场：' + SCAN_REL);
    const s = scanSrc();
    for (const w of ['N1 ', 'N2 ', 'N2b ', 'N4 ', 'N5 ']) {
        assert.ok(s.includes(w), '判据名 ' + w.trim() + ' 须在门里（判据被删/改名即失去观测面）');
    }
    for (const c of ['MIN_UI_BYTES', 'MIN_CSS_BYTES', 'MIN_RULES', 'MIN_CARRIERS', 'MIN_FLEX', 'MIN_LONGTOK']) {
        assert.ok(s.includes(c), '面下限常量 ' + c + ' 须在场（下限被摘 ⇒ 0 命中会伪装成卫生）');
    }
    /* 边界声明：本门判「布局前提在册」，不量像素；与四层 UI 门的关系必须写清。 */
    assert.ok(s.includes('最小 DOM shim'), '门须声明四层既有 UI 门跑在最小 DOM shim 上');
    assert.ok(s.includes('_mo2_realbrowser_probe.mjs'), '门须点名真浏览器取证探针（像素读数的唯一来源）');
    for (const u of ['scan_ui_binding.mjs', 'scan_ui_runtime.mjs', 'scan_ui_interaction.mjs', 'scan_ui_panel_drive.mjs']) {
        assert.ok(s.includes(u), '门须声明与既有 UI 门（' + u + '）的关系：不取代，各管一面');
    }
    ok('门在位（' + s.length + ' 字符）；N1/N2/N2b/N4/N5 在册；六个下限常量与边界声明在场');
});

/* ══════════════ B 真仓健康态 ══════════════ */
test('v3318 B1. ★★ 真仓上必须 exit 0（防「永远红」的另一种假绿）', () => {
    const r = spawnSync('node', [SCAN], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, '真仓上本门必须通过：' + String(r.stderr || r.stdout).slice(-300));
    assert.match(String(r.stdout), /N5 面自证：/, '通过时必须给出面自证读数（否则「抽到 0 也绿」）');
    ok('真仓 exit 0：' + String(r.stdout).trim().split(NL).slice(-1)[0].slice(0, 90));
});

/* ══════════════ C 合成仓逐条真源码破坏 ══════════════ */
const UI_SRC = readRoot(UI_REL);

function breakCase(label, anchor, repl, expectHint) {
    const hits = UI_SRC.split(anchor).length - 1;
    assert.equal(hits, 1, label + '：锚点在真源里须恰中 1 次（实 ' + hits + '）—— 锚点漂移则该组不可归因');
    const broken = breakSource(UI_SRC, anchor, repl, 'v3318_' + label);
    assertSyntaxOk(broken, label);
    withRepo(broken, (dir) => {
        const r = runGate(dir);
        assert.equal(r.rc, 1, label + '：破坏后门必须 exit 1（实 ' + r.rc + '）：' + r.out.slice(-260));
        assert.ok(r.out.includes(expectHint),
            label + '：翻红必须点名该判据（期望含「' + expectHint + '」）—— 归因错位等于没有观测点：' + r.out.slice(-300));
    });
    withRepo(UI_SRC, (dir) => {
        const r = runGate(dir);
        assert.equal(r.rc, 0, label + '：原版对照在同一合成仓上必须 exit 0（否则「翻红」不可归因）：' + r.out.slice(-260));
    });
}

test('v3318 C1. ★★★ 摘掉 `.ls-hint` 的断行声明 ⇒ N1 点名「未声明 overflow-wrap / word-break」', () => {
    breakCase('c1', A_HINT, R_HINT, 'N1 长文本载体 .ls-hint 未声明 overflow-wrap / word-break');
    ok('C1 破坏可归因翻红，原版对照 exit 0');
});

test('v3318 C2. ★★★ 摘掉 `.ls-row > div` 的 `min-width: 0` ⇒ N2 点名「不允许收缩到内容以下」', () => {
    breakCase('c2', A_CHILD, R_CHILD, 'N2 flex 行容器 .ls-row');
    ok('C2 破坏可归因翻红，原版对照 exit 0');
});

/* ══════════════ D fail-closed ══════════════ */
test('v3318 D1. ★★ settings-ui.js 缺失 / 退化 / 注入样式块不在 ⇒ exit 2（没得判 ≠ 通过）', () => {
    withRepo(null, (dir) => {
        const r = runGateStrict(dir);
        assert.equal(r.rc, 2, '缺 settings-ui.js 时必须 exit 2（结构漂移），实得 ' + r.rc);
        assert.match(r.out, /settings-ui\.js 0 字节|结构漂移|输入退化/, '须如实说出「没得判」：' + r.out.slice(-200));
    });
    withRepo('// gutted'.padEnd(100, ' '), (dir) => {
        const r = runGateStrict(dir);
        assert.equal(r.rc, 2, '退化输入必须 exit 2，实得 ' + r.rc);
        assert.match(r.out, /输入退化|拒绝给结论/, '须如实说出「拒绝给结论」：' + r.out.slice(-200));
    });
    /* 第三个 fail-closed 面：注入样式块缺席（载体面不在） —— 应如实 exit 2 而非默默绿。 */
    withRepo(UI_SRC.split('style.textContent = `').join('style.textContent = \'X\'; var _ = `'), (dir) => {
        const r = runGateStrict(dir);
        assert.equal(r.rc, 2, '注入样式块不在时必须 exit 2，实得 ' + r.rc);
        assert.match(r.out, /注入样式块|对象面缺席|样式面退化|输入退化/, '须点名缺席面：' + r.out.slice(-200));
    });
    ok('缺文件 / 退化输入 / 样式块缺席 三条 fail-closed 路径都如实 exit 2');
});

/* ══════════════ E 面下限非装饰 ══════════════ */
test('v3318 E1. ★ 抬高字节下限 ⇒ exit 2（下限是活的，不是写死的装饰）', () => {
    withRepo(UI_SRC, (dir) => {
        const r = runGate(dir, { LONSHA_AUDIT_MIN_UI_BYTES: String(UI_SRC.length + 1) });
        assert.equal(r.rc, 2, '阈值抬到真源长度之上时必须 exit 2，实得 ' + r.rc);
        assert.match(r.out, /输入退化|下限/, '须点名下限：' + r.out.slice(-200));
    });
    ok('下限可调且当场生效（真源 ' + UI_SRC.length + ' 字符 ⇒ 阈值 +1 即结构漂移）');
});

/* ══════════════ F 判据纯度（H5） ══════════════ */
test('v3318 F1. ★★ 判据纯度：两个破坏锚点字面量在本档各只有 1 个持有常量，且真源上各恰中 1 次', () => {
    const self = readRoot(path.join('tests', 'v3318_ui_narrow_layout_gate.test.mjs'));
    const pieces = [
        ['A_HINT', A_HINT],
        ['A_CHILD', A_CHILD],
        ['R_HINT', R_HINT],
        ['R_CHILD', R_CHILD],
    ];
    const holders = new Map();
    for (const [name, lit] of pieces) {
        assert.equal(lit.includes(NL), false, name + ' 须是单行字面量（计数口径依赖此事实）');
        assert.ok(lit.length > 12, name + ' 字面量太短会撞上无关文本');
        assert.ok(self.includes(lit), name + ' 须逐字被本档持有（否则计数口径空转）');
        if (!holders.has(lit)) holders.set(lit, new Set());
        holders.get(lit).add(name);
    }
    for (const [lit, set] of holders) {
        if (set.size > 1) assert.fail('字面量 ' + lit.slice(0, 50) + ' 被多个锚点常量持有：' + [...set].join(' / '));
    }
    /* 真源坐标：各恰中一次（就地钉住，防锚点漂移后破坏组静默空转）。 */
    assertSingleHit(UI_SRC, A_HINT, 'v3318_h1');
    assertSingleHit(UI_SRC, A_CHILD, 'v3318_h2');
    /* 工具两向自证：0 次锚点必抛、同值替换必抛。 */
    assert.throws(() => assertSingleHit(UI_SRC, 'const 绝不存在的锚点 = 1;', 'v3318_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(UI_SRC, A_CHILD, A_CHILD, 'v3318_same'), /改变|替换/, '同值替换必须抛');
    ok('4 个单行片段各自只有 1 个持有常量；2 个坐标在真源上单命中；两向自证通过');
});

/* ══════════════ G 当版锚点 + 登记面 ══════════════ */
test('v3318 G1. ★ 当版锚点（精确形）+ 四处登记面已补', () => {
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    const pkg = JSON.parse(readRoot('package.json')).version;
    const self = readRoot(path.join('tests', 'v3318_ui_narrow_layout_gate.test.mjs'));
    assert.ok(self.includes('const SCAN_REL = '), '自防护：套件须自持扫描器路径常量');
    assert.ok(self.includes('assertSingleHit'), '自防护：须用统一锚点校验器');
    /* [v3.318.0] 当版锚（精确形）：本档即当版 frontier，版本必须与 package.json 同源。 */
    assert.equal(vnum(pkg), vnum('3.318.0'), '当版锚点：package.json 须为 3.318.0（实 ' + pkg + '）');
    const matrix = readRoot(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv'));
    assert.ok(/scan_ui_narrow_layout\.mjs/.test(matrix), '探针矩阵须登记本门（否则灵敏度体检面悄悄变窄）');
    const roster = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(/v3318_ui_narrow_layout_gate\.test\.mjs/.test(roster), '在役测试面名册须登记本套件');
    const reg = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(/v3318_ui_narrow_layout_gate\.test\.mjs/.test(reg), 'v3247 接收方台账须登记本套件（它取 breakSource）');
    ok('当版锚 3.318.0；探针矩阵 / 在役名册 / v3247 台账三处登记面齐');
});
