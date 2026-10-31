// tests/v3428_l12_o4_face_three_states.test.mjs — v3.428.0 L12-O4：三态出口（空 / 缺席 / 失败）的成对套件
// 主题：`tests/audit/scan_ui_panel_drive.mjs` 的 W7 判据与 `settings-ui.js` 的三态出口必须**互相咬住**。
//
//   【问题现场（L12-O4 原文）】
//     settings-ui.js 有 41 处 `show*` 出口、24 个 `viewType` 分支，而面板逐条驱动门此前只覆盖
//     诊断面板与条目浏览两条路径；内容视图的空态一律是单句「暂无X。…」——
//     「没装上」（absent）「没有数据」（empty）「取不到」（failed）**三态同形**，
//     读者分不出「这个模块没装」与「真的还没有内容」，后者更会把可恢复的失败读成「没有」。
//
//   【本档钉什么】
//     A  结构面：三态标记三串互不相同 / faceHTML 三分支在场 / throwOn 驱动在场 /
//        FACE_VIEWS ≥ 8 且每行第四列是合法夹具真相 / 门里有 W7 判据名
//     B  真仓健康态：门在真仓上 exit 0，且给出四档读数（ok/empty/absent/failed）
//     C  四条真源码破坏（每条各配原版对照，防「破坏写死成常量」）：
//        C1 摘掉 absent 态的 `data-ls-face="absent"` ⇒ W7 B 档必须点名「把没装上读成了没有」
//        C2 摘掉重试按钮 `ls-face-retry` ⇒ W7 C 档必须点名「可恢复的失败没给恢复入口」
//        C3 空态退回单句「暂无数据」⇒ W7 必须点名（三态同形/写成暂无）
//        C4 摘掉 faceRead 的 catch（异常外抛）⇒ W7 C 档必须点名「不许把异常扔给宿主」
//     D  当版锚（下限形）+ 两处登记面（在役名册 / v3247 接收方台账）
//
//   【边界】
//     本档证明「W7 判据可信 + 三态**源码**不同形」。它**不**证明真浏览器里的观感
//     （配色/排版/重试按钮可点性）—— 那需要真 Chromium 会话，已由 `_mo2_realbrowser_probe.mjs`
//     另行登记，不进 npm test。
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
const SCAN_REL = path.join('tests', 'audit', 'scan_ui_panel_drive.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const UI_REL = 'settings-ui.js';
const TEST_REL = path.join('tests', 'v3428_l12_o4_face_three_states.test.mjs');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);
const UI_SRC = readRoot(UI_REL);
const SCAN_SRC = readRoot(SCAN_REL);

/* ══════════════ A 结构面 ══════════════ */
test('v3428O4 A1. ★★★ 三态标记三串互不相同、faceHTML 三分支在场、throwOn 驱动在场', () => {
    /* 三态必须**标记层面**就不同：同标记不同文案只是措辞差别，程序读不出三态。 */
    const marks = ['data-ls-face="absent"', 'data-ls-face="empty"', 'data-ls-face="failed"'];
    for (const m of marks) assert.ok(UI_SRC.includes(m), '缺三态标记 ' + m);
    assert.equal(new Set(marks).size, 3, '三态标记本身不得重复');
    /* 三个 CSS class 各自在场（样式面也分得开，不是只改了属性）。 */
    for (const c of ['ls-face-absent', 'ls-face-empty', 'ls-face-failed']) {
        assert.ok(UI_SRC.includes(c), '缺三态样式类 ' + c);
    }
    /* 文案面三分支各自的措辞：不可用 / 真的没有 / 取数失败。 */
    for (const w of ['⚠️ 不可用 · ', '真的没有。', '⚠️ 取数失败 · ']) {
        assert.ok(UI_SRC.includes(w), '缺三态文案「' + w + '」（三态不同形的最低要求是说人话）');
    }
    /* 失败态必须留恢复入口。 */
    assert.ok(UI_SRC.includes('ls-face-retry'), '失败态缺重试按钮（可恢复的失败没给恢复入口）');
    /* 门侧：W7 在册 + 驱动形态是「读取即抛」。 */
    assert.ok(SCAN_SRC.includes('W7 '), '门里缺 W7 判据名');
    assert.ok(SCAN_SRC.includes('const throwOn = '), 'C 档驱动必须是「读取即抛」（throwOn），不是「赋成空」');
    assert.ok(SCAN_SRC.includes('const MIN_FACE_VIEWS = '), '面下限常量必须参数化（写死就没法验下限是否活的）');
    ok('三态标记/样式/文案三层各不相同；重试入口在场；W7 与 throwOn 驱动在册');
});

test('v3428O4 A2. ★★★ FACE_VIEWS 覆盖 ≥8 个视图，且每行都声明了夹具真相', () => {
    /* 从门里读出表体：逗号分隔的 4 元组行。字数下限与「第四列合法」两条一起守覆盖塌陷。 */
    const m = /const FACE_VIEWS = \[([\s\S]*?)\n\];/.exec(SCAN_SRC);
    assert.ok(m, '门里必须有 FACE_VIEWS 表');
    const rows = m[1].split(NL).filter((l) => /^\s*\[/.test(l));
    assert.ok(rows.length >= 8, 'FACE_VIEWS 只有 ' + rows.length + ' 个视图（下限 8）⇒ 覆盖塌陷');
    const truths = [];
    for (const r of rows) {
        const t = /'(data|empty|absent)'\s*\]/.exec(r);
        assert.ok(t, 'FACE_VIEWS 每行都必须声明夹具真相（data/empty/absent）：' + r.trim().slice(0, 60));
        truths.push(t[1]);
        assert.match(r, /throwOn\(e, k, '/, '每行的 C 档驱动都必须是 throwOn（读取即抛）：' + r.trim().slice(0, 60));
    }
    /* 三档都得有样本：全 data 就测不到缺席/空盘，全 absent 就测不到「有数据不出标记」。 */
    for (const k of ['data', 'empty', 'absent']) {
        assert.ok(truths.includes(k), '夹具真相里没有 ' + k + ' 档的视图 ⇒ 该档无从核验（表列真了才敢报读数）');
    }
    ok('FACE_VIEWS ' + rows.length + ' 行，夹具真相三档齐全（data/empty/absent），C 档驱动全为 throwOn');
});

/* ══════════════ B 真仓健康态 ══════════════ */
test('v3428O4 B1. ★★ 真仓上门必须 exit 0，且给出四档读数（抽到 0 不许算通过）', () => {
    const r = spawnSync('node', [SCAN], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    assert.equal(r.status, 0, '真仓上本门必须 exit 0：' + String(r.stderr || r.stdout).slice(-400));
    const out = String(r.stdout);
    assert.match(out, /W7 三态不同形：有数据 \d+ \/ 真没有 \d+ \/ 缺席 \d+ \/ 失败 \d+/,
        '通过时必须给出四档读数（否则「抽到 0 也绿」）：' + out.slice(-300));
    const mm = /有数据 (\d+) \/ 真没有 (\d+) \/ 缺席 (\d+) \/ 失败 (\d+)/.exec(out);
    assert.ok(mm, '四档读数不可解析');
    assert.ok(+mm[1] >= 8, '有数据档 ' + mm[1] + ' 个（下限 8）⇒ 该档样本不足');
    assert.ok(+mm[4] >= 8, '失败档 ' + mm[4] + ' 个（下限 8）⇒ 该档没真跑');
    assert.ok(+mm[2] >= 1, '真没有档 ' + mm[2] + ' 个 ⇒ 空态从未被核验');
    assert.ok(+mm[3] >= 1, '缺席档 ' + mm[3] + ' 个 ⇒ 缺席态从未被核验');
    ok('真仓 exit 0；四档读数 有数据 ' + mm[1] + ' / 真没有 ' + mm[2] + ' / 缺席 ' + mm[3] + ' / 失败 ' + mm[4]);
});

/* ══════════════ C 四条真源码破坏（各配原版对照） ══════════════ */
/** 替换文本不得与锚点同串（同值替换会被 breakSource 拒掉，本档须自己先排除）。 */
function assertSyntaxOk(text, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3428o4-syn-'));
    try {
        const p = path.join(dir, 'x.mjs');
        fs.writeFileSync(p, text, 'utf8');
        const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
        assert.equal(r.status, 0, label + '：破坏后语法必须仍合法（否则非零退出不可归因于判据）：'
            + String(r.stderr || '').slice(0, 200));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function withRepo(uiText, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3428o4-panel-'));
    try {
        if (uiText !== null) fs.writeFileSync(path.join(dir, UI_REL), uiText, 'utf8');
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function runGate(root) {
    const env = Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: root, LONSHA_AUDIT_FIXTURE: '1' });
    const r = spawnSync('node', [SCAN], { cwd: ROOT, env, encoding: 'utf8', timeout: 300000 });
    return { rc: r.status === null ? -1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ---- 破坏锚点：逐字取自真源，全部单行（H5 计数口径） ---- */
/* C1 absent 态的标记属性：摘掉即「没装上」与「没有」在 DOM 上同形。 */
const A_ABSENT = 'class="ls-hint ls-face-absent" data-ls-face="absent"';
const R_ABSENT = 'class="ls-hint ls-face-absent"';
/* C2 重试按钮：摘掉即失败态没有恢复入口。 */
const A_RETRY = '<button class="ls-btn ls-face-retry"';
const R_RETRY = '<button class="ls-btn"';
/* C3 空态措辞：退回单句空态（改造前的老形态）。 */
const A_EMPTY = 'class="ls-hint ls-face-empty" data-ls-face="empty">真的没有。';
const R_EMPTY = 'class="ls-hint ls-face-empty" data-ls-face="empty">暂无数据。';
/* C4 faceRead 的 catch：把「吞错并落 failed」换成「原样外抛」。
 *   ★ 这里必须两行拼装（同 v3303 的 A_ESC 写法）：单行 `} catch (e) {` 在真源里有 13 处
 *   （每个视图各一个），只锚它必撞多命中、破坏点不再定点。两段各自单行 ⇒ H5 计数口径不变，
 *   组合串在真源里唯一。 */
const A_CATCH_L1 = "                } catch (e) {";
const A_CATCH_L2 = "                    faceState.state = 'failed';";
const R_CATCH_L2 = "                    throw e;";
const A_CATCH = A_CATCH_L1 + NL + A_CATCH_L2;
const R_CATCH = A_CATCH_L1 + NL + R_CATCH_L2;

function breakCase(label, anchor, repl, expectHint) {
    const hits = UI_SRC.split(anchor).length - 1;
    assert.equal(hits, 1, label + '：锚点在真源里须恰中 1 次（实 ' + hits + '）—— 锚点漂移则该组不可归因');
    const broken = breakSource(UI_SRC, anchor, repl, 'v3428o4_' + label);
    assertSyntaxOk(broken, label);
    withRepo(broken, (dir) => {
        const r = runGate(dir);
        assert.notEqual(r.rc, 0, label + '：破坏后门必须翻红（实 rc=' + r.rc + '）：' + r.out.slice(-300));
        assert.ok(r.out.includes(expectHint),
            label + '：翻红必须点名该判据（期望含「' + expectHint + '」）—— 归因错位等于没有观测点：'
            + r.out.slice(-400));
    });
    /* 原版对照：同一合成仓、同一配方、未破坏 ⇒ 必须 exit 0。
     *   只验「破坏会翻红」不验「原版是绿的」，会把「破坏写死成模拟常量」判成绿（本仓负控制三形之一）。 */
    withRepo(UI_SRC, (dir) => {
        const r = runGate(dir);
        assert.equal(r.rc, 0, label + '：原版对照在同一合成仓上必须 exit 0（否则「翻红」不可归因）：'
            + r.out.slice(-300));
    });
    ok(label + ' 破坏可归因翻红，原版对照 exit 0');
}

test('v3428O4 C1. ★★★ 摘掉缺席态标记 ⇒ W7 必须点名「把没装上读成了没有」', () => {
    breakCase('c1', A_ABSENT, R_ABSENT, '（应为 absent）—— 把「没装上」读成了「没有」');
});

test('v3428O4 C2. ★★★ 摘掉重试按钮 ⇒ W7 必须点名「可恢复的失败没给恢复入口」', () => {
    breakCase('c2', A_RETRY, R_RETRY, '没有重试按钮');
});

test('v3428O4 C3. ★★★ 空态退回「暂无数据」⇒ W7 必须点名（三态同形）', () => {
    breakCase('c3', A_EMPTY, R_EMPTY, '没写「真的没有」');
});

test('v3428O4 C4. ★★★ 摘掉 faceRead 的 catch ⇒ W7 必须点名「不许把异常扔给宿主」', () => {
    breakCase('c4', A_CATCH, R_CATCH, '抛出面板外');
});

/* ══════════════ D 当版锚 + 登记面 ══════════════ */
test('v3428O4 D1. ★★ 当版锚（下限形）+ 两处登记面已补', () => {
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    const pkg = JSON.parse(readRoot('package.json')).version;
    const self = readRoot(TEST_REL);
    assert.ok(self.includes('const SCAN_REL = '), '自防护：套件须自持扫描器路径常量');
    assert.ok(self.includes('assertSingleHit'), '自防护：须用统一锚点校验器');
    /* 当版出生锚写成**下界形**（不锁当版）：本档生于 3.428.0，后续版本须 >= 它。 */
    assert.ok(vnum(pkg) >= vnum('3.428.0'), '本档版本下界 3.428.0 不得被绕过（实 ' + pkg + '）');
    const roster = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(/v3428_l12_o4_face_three_states\.test\.mjs/.test(roster), '在役测试面名册须登记本套件');
    const reg = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(/v3428_l12_o4_face_three_states\.test\.mjs/.test(reg),
        'v3247 接收方台账须登记本套件（本档从 _break_kit 取 breakSource/assertSingleHit）');
    /* 锚点纯度自证：四个破坏锚点在真源里各恰中 1 次（就地钉住，防锚点漂移后破坏组静默空转）。 */
    assertSingleHit(UI_SRC, A_ABSENT, 'v3428o4_h1');
    assertSingleHit(UI_SRC, A_RETRY, 'v3428o4_h2');
    assertSingleHit(UI_SRC, A_EMPTY, 'v3428o4_h3');
    assertSingleHit(UI_SRC, A_CATCH, 'v3428o4_h4');
    /* 工具两向自证：0 次锚点必抛、同值替换必抛。 */
    assert.throws(() => assertSingleHit(UI_SRC, 'const 绝不存在的锚点 = 1;', 'v3428o4_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(UI_SRC, A_RETRY, A_RETRY, 'v3428o4_same'), /改变|替换/, '同值替换必须抛');
    ok('当版下界 3.428.0；两处登记面齐全；四个锚点在真源上单命中；两向自证通过');
});
