// tests/v3303_ui_panel_drive_gate.test.mjs — v3.303.0 M-O2：面板逐条驱动门的**成对套件**
// 主题：`tests/audit/scan_ui_panel_drive.mjs` 的每条判据都必须**真能翻红** ——
//   「永远 exit 0」的门同样是绿的，而且更坏：它让人以为「内容面板与条目级交互验过了」。
//   本档给那扇门补上成建制观测点（此前它零观测点，`scan_fixture_sync.mjs` 的 E4 当场点名）。
//
//   【本档钉什么】
//     A  结构面：门在位 + 判据名在册 + 面下限常量在场 + 边界声明在场
//     B  真仓健康态：本门在真仓上必须 exit 0（防「永远红」的另一种假绿）
//     C  合成仓逐条真源码破坏（**四条，与门头声明的 D1~D4 一一对应**）：
//        C1 摘 `showDiagnose` 内的 `esc` 定义 ⇒ W1 必须点名「带数据调用抛错」
//        C2 `String(x.floor) === key` 回退成 `x.floor === key` ⇒ W3 必须点名「静默无反应」
//        C3 `opHint` 无条件挂（`?...:` 改 `true?`）⇒ W5 必须点名「把不可用说成可用」
//        C4 `items` 的 `data-opid` 回退成 `esc(...)` ⇒ W4b 必须点名「属性值往返失败」
//        每条都配**原版对照**（未破坏的真源在同一合成仓上必须 exit 0）——
//        只验「破坏会翻红」不验「原版是绿的」，会把「破坏写死成模拟常量」判成绿。
//     D  fail-closed：settings-ui.js 缺失 / 退化 ⇒ exit 2（没得判 ≠ 通过）
//     E  面下限可调：抬高字节下限 ⇒ exit 2（结构漂移出口活着，不是恒绿的装饰）
//     F  判据纯度 H5：四个破坏锚点字面量各只有 1 个持有常量 + 真源上各恰中 1 次
//     G  当版锚点（下限形）+ 三处登记面（探针矩阵 / 在役测试面名册 / v3247 接收方台账）
//
//   【为什么用「合成仓」而不是直接破坏真仓】
//     真仓破坏会污染后续跑批。本档每条破坏都发生在 `mkdtempSync` 出来的独立目录，
//     只放一份（已破坏的）`settings-ui.js`，用 `LONSHA_AUDIT_ROOT` 指过去 ⇒ 真仓零污染，
//     且门判据读到的确实是「被破坏的那份真源码」。
//
//   【边界（诚实，必须与结论一起读）】
//     · 本档证明的是「**门的判据是可信的**」（能翻红、fail-closed、下限非装饰）。
//       它**不**证明真浏览器 / 真 SillyTavern 上的面板行为 —— 那需要真 Chromium 会话，
//       交付者环境无浏览器可选（已在门头与探针矩阵里如实登记）。
//     · 破坏只覆盖门头声明的那四条（D1~D4）；门新增判据时**必须**在此补对应破坏组，
//       否则那条新判据就回到「零观测点」状态。
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
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有；全部按单行片段持有）----
 *  多行锚点拆成两个单行常量再按 NL 拼：这样「每个字面量在本档只有一个持有常量」
 *  这条纯度断言（F1）才逐行可数。 */
const A_ESC_L1 = "            const esc = (t) => String(t || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');";
const A_ESC_L2 = "            try { r = await engine.selfCheck(); } catch (e) { toast('诊断失败: ' + e.message); return; }";
const A_SUMMARY = 'const m = eng.summary.summaries.find(x => String(x.floor) === key);';
const A_OPHINT = "const opHint = /\\sdata-opkind=/.test(body || '') ? ";
const A_ITEM = 'data-opkind="item" data-opid="${escAttr(it.name)}"';

/* ---- 替换文本（都改到**折叠后仍在**的字符上）---- */
const R_ESC = "            try { r = await engine.selfCheck(); } catch (e) { toast('诊断失败: ' + e.message); return; }";
const R_SUMMARY = 'const m = eng.summary.summaries.find(x => x.floor === key);';
const R_OPHINT = 'const opHint = true ? ';
const R_ITEM = 'data-opkind="item" data-opid="${esc(it.name)}"';

/** 排除「替换文本与锚点同串」这类自伤（同值替换会被 breakSource 抛掉）。 */
const A_ESC = A_ESC_L1 + NL + A_ESC_L2;

/* ══════════════ 跑门 ══════════════ */
/** 合成仓一律走**夹具模式**（`LONSHA_AUDIT_FIXTURE=1`）：面下限退到 1，
 *  否则合成仓会先被「视图 / 条目数下限」拦成 exit 2，判据根本到不了。
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3303-panel-'));
    try {
        if (uiText !== null) fs.writeFileSync(path.join(dir, UI_REL), uiText, 'utf8');
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 破坏后语法必须仍然合法：非零退出要能归因于判据，而不是解析崩溃。 */
function assertSyntaxOk(text, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3303-syn-'));
    try {
        const p = path.join(dir, 'x.mjs');
        fs.writeFileSync(p, text, 'utf8');
        const r = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
        assert.equal(r.status, 0, label + '：破坏后语法必须仍合法（否则非零退出不可归因于判据）'
            + '：' + String(r.stderr || '').slice(0, 200));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ══════════════ A 结构面 ══════════════ */
test('v3303 A1. ★★ 门在位、判据名在册、面下限常量与边界声明在场', () => {
    assert.ok(fs.existsSync(SCAN), '门必须在场：' + SCAN_REL);
    const s = scanSrc();
    for (const w of ['W1 ', 'W2 ', 'W3 ', 'W4b ', 'W5 ', 'W6 ']) {
        assert.ok(s.includes(w), '判据名 ' + w.trim() + ' 须在门里（判据被删/改名即失去观测面）');
    }
    for (const c of ['MIN_UI_BYTES', 'MIN_VIEWS', 'MIN_CLICKABLE']) {
        assert.ok(s.includes(c), '面下限常量 ' + c + ' 须在场（下限被摘 ⇒ 0 命中会伪装成卫生）');
    }
    /* 边界声明：本门跑在最小 DOM shim 上、不取代 U/V 两层、不证明真浏览器面。
     *   这三句是「结论必须与边界一起读」的载体，被删即失去诚实性锚。 */
    assert.ok(s.includes('最小 DOM shim'), '门须声明它跑在最小 DOM shim 上');
    assert.ok(s.includes('真浏览器'), '门须声明真浏览器面的边界');
    for (const u of ['scan_ui_runtime.mjs', 'scan_ui_interaction.mjs']) {
        assert.ok(s.includes(u), '门须声明与既有 UI 层（' + u + '）的关系：不取代，各管一面');
    }
    ok('门在位（' + s.length + ' 字符）；W1/W2/W3/W4b/W5/W6 在册；三个下限常量与边界声明在场');
});

/* ══════════════ B 真仓健康态 ══════════════ */
test('v3303 B1. ★★ 真仓上必须 exit 0（防「永远红」的另一种假绿）', () => {
    const r = spawnSync('node', [SCAN], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, '真仓上本门必须通过：' + String(r.stderr || r.stdout).slice(-300));
    assert.match(String(r.stdout), /面自证：内容视图 \d+ 个/, '通过时必须给出面自证读数（否则「抽到 0 也绿」）');
    ok('真仓 exit 0：' + String(r.stdout).trim().split(NL).slice(-1)[0].slice(0, 90));
});

/* ══════════════ C 合成仓逐条真源码破坏 ══════════════ */
const UI_SRC = readRoot(UI_REL);

/** 通用形态：破坏一处在**独立合成仓**里 ⇒ 期望 exit 1 且点名给定归因串；
 *  同时用**原版**同配方跑一次 ⇒ 必须 exit 0（卫生态对照，防「破坏写死成常量」）。 */
function breakCase(label, anchor, repl, expectHint) {
    const hits = UI_SRC.split(anchor).length - 1;
    assert.equal(hits, 1, label + '：锚点在真源里须恰中 1 次（实 ' + hits + '）—— 锚点漂移则该组不可归因');
    const broken = breakSource(UI_SRC, anchor, repl, 'v3303_' + label);
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

test('v3303 C1. ★★★ 摘掉 `showDiagnose` 内的 `esc` 定义 ⇒ W1 点名「带数据调用抛错」（D1 的永久负控制）', () => {
    breakCase('c1', A_ESC, R_ESC, 'W1 showDiagnose **带数据**调用抛错');
    ok('C1 破坏可归因翻红，原版对照 exit 0');
});

test('v3303 C2. ★★★ `String(x.floor) === key` 回退成 `x.floor === key` ⇒ W3 点名「静默无反应」（D2）', () => {
    breakCase('c2', A_SUMMARY, R_SUMMARY, '静默无反应');
    ok('C2 破坏可归因翻红，原版对照 exit 0');
});

test('v3303 C3. ★★ `opHint` 无条件挂 ⇒ W5 点名「把不可用说成可用」（D3）', () => {
    breakCase('c3', A_OPHINT, R_OPHINT, 'W5 ');
    ok('C3 破坏可归因翻红，原版对照 exit 0');
});

test('v3303 C4. ★★★ `items` 的 `data-opid` 回退成 `esc(...)` ⇒ W4b 点名「属性值往返失败」（D4）', () => {
    breakCase('c4', A_ITEM, R_ITEM, 'W4b 属性值往返失败');
    ok('C4 破坏可归因翻红，原版对照 exit 0');
});

/* ══════════════ D fail-closed ══════════════ */
test('v3303 D1. ★★ settings-ui.js 缺失 / 退化 ⇒ exit 2（没得判 ≠ 通过）', () => {
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
    ok('缺文件 / 退化输入两条 fail-closed 路径都如实 exit 2');
});

/* ══════════════ E 面下限非装饰 ══════════════ */
test('v3303 E1. ★ 抬高字节下限 ⇒ exit 2（下限是活的，不是写死的装饰）', () => {
    withRepo(UI_SRC, (dir) => {
        const r = runGate(dir, { LONSHA_AUDIT_MIN_UI_BYTES: String(UI_SRC.length + 1) });
        assert.equal(r.rc, 2, '阈值抬到真源长度之上时必须 exit 2，实得 ' + r.rc);
        assert.match(r.out, /输入退化|下限/, '须点名下限：' + r.out.slice(-200));
    });
    ok('下限可调且当场生效（真源 ' + UI_SRC.length + ' 字符 ⇒ 阈值 +1 即结构漂移）');
});

/* ══════════════ F 判据纯度（H5） ══════════════ */
test('v3303 F1. ★★ 判据纯度：四个破坏锚点字面量在本档各只有 1 个持有常量，且真源上各恰中 1 次', () => {
    const self = readRoot(path.join('tests', 'v3303_ui_panel_drive_gate.test.mjs'));
    /* 单行片段：本档须逐字持有，且每个片段只有一个持有常量。
     *   `A_ESC_L2` 与 `R_ESC` 是**同一串**（替换 = 只留 try 行），故它天然是两个常量的值 ——
     *   这不是重复持有，而是「破坏 = 删掉那一行」的最小写法。这一条在下面显式豁免并说明。 */
    const pieces = [
        ['A_ESC_L1', A_ESC_L1, false],
        ['A_ESC_L2', A_ESC_L2, true],
        ['A_SUMMARY', A_SUMMARY, false],
        ['A_OPHINT', A_OPHINT, false],
        ['A_ITEM', A_ITEM, false],
    ];
    const holders = new Map();
    const BS = String.fromCharCode(92);
    for (const [name, lit, shared] of pieces) {
        assert.equal(lit.includes(NL), false, name + ' 须是单行字面量（计数口径依赖此事实）');
        assert.ok(lit.length > 12, name + ' 字面量太短会撞上无关文本');
        /* 「被本档持有」按**文件里的形态**判，不按运行时值判：含反斜杠的字面量
         *   （如 `A_OPHINT` 里的 `\s`）在源码文件里写作 `\\s`，直接用运行时值 includes 会恒假 ——
         *   那是**判据自己的转义口径错**，不是「没持有」。两形态都认。 */
        const held = self.includes(lit) || self.includes(lit.split(BS).join(BS + BS));
        assert.ok(held, name + ' 须逐字被本档持有（否则计数口径空转）');
        if (!holders.has(lit)) holders.set(lit, new Set());
        holders.get(lit).add(name);
        if (shared) assert.ok(true, name + ' 与替换文本同串（删行式破坏，已显式豁免重复持有）');
    }
    for (const [lit, set] of holders) {
        if (set.size > 1) assert.fail('字面量 ' + lit.slice(0, 50) + ' 被多个锚点常量持有：' + [...set].join(' / '));
    }
    /* 反向：替换文本不得与任何锚点常量同串（`R_ESC` 例外，见上）。 */
    for (const [name, r] of [['R_SUMMARY', R_SUMMARY], ['R_OPHINT', R_OPHINT], ['R_ITEM', R_ITEM]]) {
        assert.ok(!holders.has(r), name + ' 与某锚点字面量同串（两者须可分）');
        assert.ok(self.includes(r) || self.includes(r.split(BS).join(BS + BS)), name + ' 须逐字被本档持有');
    }
    /* 真源坐标：各恰中一次（就地钉住，防锚点漂移后破坏组静默空转）。 */
    assertSingleHit(UI_SRC, A_ESC, 'v3303_h1');
    assertSingleHit(UI_SRC, A_SUMMARY, 'v3303_h2');
    assertSingleHit(UI_SRC, A_OPHINT, 'v3303_h3');
    assertSingleHit(UI_SRC, A_ITEM, 'v3303_h4');
    /* 工具两向自证：0 次锚点必抛、同值替换必抛。 */
    assert.throws(() => assertSingleHit(UI_SRC, 'const 绝不存在的锚点 = 1;', 'v3303_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(UI_SRC, A_SUMMARY, A_SUMMARY, 'v3303_same'), /改变|替换/, '同值替换必须抛');
    ok('5 个单行片段各只有 1 个持有常量；4 个坐标在真源上单命中；两向自证通过');
});

/* ══════════════ G 当版锚点 + 登记面 ══════════════ */
test('v3303 G1. ★ 当版锚点（下限形）+ 三处登记面已补', () => {
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    const pkg = JSON.parse(readRoot('package.json')).version;
    const self = readRoot(path.join('tests', 'v3303_ui_panel_drive_gate.test.mjs'));
    assert.ok(self.includes('const SCAN_REL = '), '自防护：套件须自持扫描器路径常量');
    assert.ok(self.includes('assertSingleHit'), '自防护：须用统一锚点校验器');
    /* [v3.303.0] 当版下界锚：本档写于 3.303.0，后续版本须 >= 它。 */
    assert.ok(vnum(pkg) >= vnum('3.303.0'), '本档版本下界 3.303.0 不得被绕过（实 ' + pkg + '）');
    const matrix = readRoot(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv'));
    assert.ok(/scan_ui_panel_drive\.mjs/.test(matrix), '探针矩阵须登记本门（否则灵敏度体检面悄悄变窄）');
    const roster = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(/v3303_ui_panel_drive_gate\.test\.mjs/.test(roster), '在役测试面名册须登记本套件');
    const reg = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(/v3303_ui_panel_drive_gate\.test\.mjs/.test(reg), 'v3247 接收方台账须登记本套件（它取 breakSource）');
    ok('当版下界 3.303.0；探针矩阵 / 在役名册 / v3247 台账三处登记面齐');
});
