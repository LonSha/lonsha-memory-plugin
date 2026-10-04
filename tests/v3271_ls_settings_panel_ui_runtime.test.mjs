/* ============================================================
 * tests/v3271_ls_settings_panel_ui_runtime.test.mjs — v3.271.0 · 设置面板「一个字都渲染不出来」
 *
 * 主题：把「点了设置、面板整块打不开」从**用户报障**变成**判据捕获**。
 *
 * 为什么需要本档（真实故障，不是整洁性偏好）：
 *   本仓此前有 250 个测试文件 + 5 个审计脚本全绿，而用户在真实宿主里点 ⚙️ 设置
 *   ——面板**一个字都渲染不出来**。五个审计脚本里唯一的 UI 门禁 scan_ui_binding.mjs
 *   是 A1–A6 **静态绑定卫生**（重复控件 / 重复 id / 幽灵键 / 类型一致 / 保存目标 /
 *   结构健康）。它读文本，从不**执行**任何 UI 入口。于是这类缺陷整族没有出口：
 *
 *   | 编号 | 形态 | 为什么静态读不出来 |
 *   |---|---|---|
 *   | D1 | showSettingsPanel 函数体内 `esc` 未定义 | 词法合法：别的函数里有同名 local |
 *   | D2 | showStatsPanel 内 4 段判定块引用 viewType（那是 showBrowser 的形参） | 同上，跨函数作用域错位 |
 *   | D3 | `${ck(...)}` 被双反斜杠转义 | 字符串合法，只是渲染成字面文本 |
 *   | D5 | `style="display:none;`（模板值缺右双引号） | **字符串本身完全合法**，只有 HTML 解析器
 *        |   | 才暴露：属性吞并后续整段 HTML ⇒ `#ls-clear` 不存在 ⇒ 同函数后段的
 *        |   | `querySelector('#ls-clear').addEventListener` 炸在 **null** 上 |
 *
 *   本档 = 这五处的**消失证据** + 同类形态**不得回流**的常驻判据 + 门禁的真源码破坏负控制。
 *   判据分层（前两层在门禁 tests/audit/scan_ui_runtime.mjs，本档真跑它）：
 *     · 门禁 U1–U5：入口实调不抛 / DOM 真落 / 关键控件在册 / 属性吞并无 / 结构健康（带非零下限）
 *     · 本档：修复位点逐处与磁盘同源；四类破坏**必须**让门禁按归因翻红；
 *       源码面「同类形态」静默检查（不得出现第二处未闭合 style / 第二处双反斜杠 ck）
 *
 * 覆盖：
 *   A 五处缺陷的消失证据（逐处与磁盘同源，不是「记得修过」）
 *   B 门禁在真仓上 rc=0 + 覆盖面读数非零下限
 *   C 结构漂移面（settings-ui.js 退化 ⇒ 门禁必须 exit 2，不得报「通过」）
 *   D 真源码破坏负控制（删 esc / 去右引号 / 搬走控件 id / 掏空）+ 工具两向自证
 *   E 同类形态不得再出现（源码面静默检查）
 *   F 台账 + 版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
const UI_REL = 'settings-ui.js';
const GATE_REL = path.join('tests', 'audit', 'scan_ui_runtime.mjs');
const UI = fs.readFileSync(path.join(ROOT, UI_REL), 'utf8');
const GATE_SRC = fs.readFileSync(path.join(ROOT, GATE_REL), 'utf8');

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  xx ' + m); };

/* 引号/属性锚点按字符拼，避免测试源码里的转义与文档里的写法互相污染 */
const Q = String.fromCharCode(39);    // '
const DQ = String.fromCharCode(34);   // "
/* 闭合形态：'style="display:none;"' —— 文件里恰中 1 次 */
const OK_ATTR = Q + 'style=' + DQ + 'display:none;' + DQ + Q;
/* 破坏形态：'style="display:none;' —— 只去掉**属性值的右双引号**（不是整个字符串的单引号）。
 *   【留痕】首版写成 OK_ATTR.slice(0, -1)：那去掉的是 JS 单引号 ⇒ 源码变成语法错误，
 *   门禁在加载阶段就崩、入口数掉到 0、报 exit 2（结构漂移）—— 破坏真的发生了，
 *   但**测的不是 HTML 属性吞并**。这正是本仓「破坏要点在判据的检查对象上」那条教训。 */
const BAD_ATTR = Q + 'style=' + DQ + 'display:none;' + Q;

/* ---------- 破坏运行器：独立树 + 门禁副本，真跑取 rc 与输出 ---------- */
function runGateOn(mut) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3271-'));
    try {
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        fs.copyFileSync(path.join(ROOT, GATE_REL), path.join(dir, GATE_REL));
        fs.writeFileSync(path.join(dir, UI_REL), mut(UI));
        const r = spawnSync(process.execPath, [path.join(dir, GATE_REL)], {
            encoding: 'utf8', cwd: dir, timeout: 180000,
        });
        return { status: r.status, out: ((r.stdout || '') + (r.stderr || '')) };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const okCases = (cases, label) => {
    for (const [name, mut, wantCode, wantText] of cases) {
        let got;
        try { got = runGateOn(mut); }
        catch (e) { bad(label + ' · ' + name + ' 破坏未成立：' + String(e.message).split('\n')[0]); continue; }
        if (got.status !== wantCode) {
            bad(label + ' · ' + name + ' 期望 rc=' + wantCode + '，实得 rc=' + got.status
                + '：' + got.out.trim().slice(-400));
            continue;
        }
        if (wantText && !got.out.includes(wantText)) {
            bad(label + ' · ' + name + ' rc 对了但**归因错**：输出里没有「' + wantText + '」');
            continue;
        }
        ok(label + ' · ' + name + ' → rc=' + got.status + (wantText ? '（点名 ' + wantText + '）' : ''));
    }
};

/* ══════════ A. 五处缺陷的消失证据（逐处与磁盘同源） ══════════ */
test('v3271 A1. D1/D5 修复位点与磁盘同源，且形态恰中 1 次（防「记得修过」）', () => {
    const ESC_LINE = 'const esc = (t) => String(t || ' + Q + Q + ').replace(/&/g,' + Q + '&amp;' + Q + ')'
        + '.replace(/</g,' + Q + '&lt;' + Q + ').replace(/>/g,' + Q + '&gt;' + Q + ');';
    const escLine = '            ' + ESC_LINE;
    const inPanelBody = UI.split('plugin.showSettingsPanel = function() {').pop();
    const panelHead = inPanelBody.split('\n').slice(0, 8).join('\n');
    if (panelHead.includes(ESC_LINE)) ok('D1 设置面板函数体内 esc 已定义（面板 HTML 构造不再抛 ReferenceError）');
    else bad('D1 设置面板函数体前 8 行里找不到 esc 定义 —— 面板一进 HTML 构造就会抛 ReferenceError');

    /* D5：未闭合 style 属性 —— 源码里只允许出现「闭合」形态 */
    assertSingleHit(UI, OK_ATTR, 'D5 已闭合 style 模板值');
    ok('D5 style 模板值带右双引号，且全文件恰中 1 次（属性吞并形态已消失）');
    assert.equal(UI.split(DQ + 'display:none;' + DQ).length - 1, 1,
        '同一断言的第二形态：`"display:none;"` 只许出现 1 次（多一处即需人工判是否同类缺陷）');
    ok('D5 闭合形态唯一');

    /* D3：双反斜杠转义 ck —— 源码里恰好 0 处 */
    assert.equal(UI.split('\\\\${ck(').length - 1, 0,
        'D3 `${ck(` 被双反斜杠转义的形态必须为 0 处（存在即渲染成字面代码而非复选框）');
    ok('D3 双反斜杠 ck 形态 0 处');

    /* D2：viewType 引用只许在 showBrowser 内 */
    const lines = UI.split('\n');
    const browserAt = lines.findIndex((l) => l.includes('plugin.showBrowser = function('));
    const statsAt = lines.findIndex((l) => l.includes('plugin.showStatsPanel = function('));
    assert.ok(browserAt > 0 && statsAt > 0 && statsAt < browserAt,
        'showStatsPanel 应排在 showBrowser 之前（本档的区间判据依赖这个次序）');
    const stray = [];
    lines.forEach((l, i) => {
        if (!l.includes('viewType')) return;
        if (i >= browserAt) return;
        if (/^\s*(\/\/|\*)/.test(l)) return;      // 注记不算引用
        stray.push((i + 1) + ': ' + l.trim().slice(0, 80));
    });
    assert.deepEqual(stray, [], 'D2 错位复制品回流：showBrowser 之前仍引用 viewType（那是它的形参）：' + stray.join(' / '));
    ok('D2 viewType 引用全部落在 showBrowser 内');
});

/* ══════════ B. 门禁在真仓上通过 + 读数非零下限 ══════════ */
test('v3271 B1. 门禁在真仓 rc=0，且入口数与 DOM 读数均有非零下限', () => {
    const got = runGateOn((s) => s);
    assert.equal(got.status, 0, '真仓上门禁必须通过：' + got.out.trim().slice(-400));
    const mEntries = /入口 (\d+) 个/.exec(got.out);
    const mIds = /控件 (\d+) 个带 id/.exec(got.out);
    assert.ok(mEntries, '门禁必须报出「入口 N 个」读数（否则判据不可复核）');
    assert.ok(mIds, '门禁必须报出「控件 N 个带 id」读数');
    assert.ok(Number(mEntries[1]) >= 5, '入口数 ' + mEntries[1] + ' 低于下限 5：探测器失效');
    assert.ok(Number(mIds[1]) >= 30, '设置面板控件数 ' + mIds[1] + ' 低于下限 30：面板被截断或抽取器失效');
    ok('门禁 rc=0，入口 ' + mEntries[1] + ' 个，控件 ' + mIds[1] + ' 个带 id');
});

test('v3271 B2. 六个关键控件在**渲染结果**里真能被查到（不是「源码里有」）', () => {
    for (const id of ['ls-save', 'ls-clear', 'ls-export', 'ls-import', 'ls-snap-restore', 'ls-extract-roles']) {
        assert.ok(UI.includes('id=' + DQ + id + DQ), id + ' 在源码里都没有 id 声明');
    }
    const got = runGateOn((s) => s);
    assert.ok(!/U3 关键控件丢失/.test(got.out), '门禁报了 U3 控件丢失：' + got.out.trim().slice(-300));
    ok('6 个关键控件在渲染结果中全部在册');
});

/* ══════════ C. 结构漂移面：退化必须 exit 2，不得报「通过」 ══════════ */
test('v3271 C1. settings-ui.js 被删 / 被掏空 ⇒ 门禁 exit 2（没得判 ≠ 通过）', () => {
    okCases([
        ['删掉 settings-ui.js', () => '', 2, '输入退化'],
        ['掏空到 11 字节', () => '// gutted\n', 2, '输入退化'],
    ], 'C1');
});

/* ══════════ D. 真源码破坏负控制（真判据必须按归因翻红） ══════════ */
test('v3271 D1. ★★★ 删掉 showSettingsPanel 内的 esc 定义 ⇒ 门禁必须 exit 1 并点名 U2', () => {
    const ESC_LINE = '            const esc = (t) => String(t || ' + Q + Q + ').replace(/&/g,' + Q + '&amp;' + Q + ')'
        + '.replace(/</g,' + Q + '&lt;' + Q + ').replace(/>/g,' + Q + '&gt;' + Q + ');\n';
    /* 锚点必须**恰中 1 次**：全文件的 esc 定义有 4 处（160/199/680/1588 行的同名 local），
     *   只拿 esc 那一行会命中 3 次 —— 破坏工具会当场拒绝（口径①）。
     *   故锚点带上紧随其后的 `const c = this.engine.config.config;`：
     *   那是本函数体独有的上下文，实测全文件恰中 1 次。 */
    const ESC_ANCHOR = ESC_LINE + '            const c = this.engine.config.config;';
    okCases([
        ['N1 删 esc（D1 复发）', (s) => breakSource(s, ESC_ANCHOR, '            const c = this.engine.config.config;', 'D1 esc'),
            1, 'U2 showSettingsPanel 调用抛错'],
    ], 'D1');
});

test('v3271 D2. ★★★ 把 style 模板值的右双引号去掉 ⇒ 门禁必须 exit 1（属性吞并复发）', () => {
    okCases([
        ['N2 去掉属性值右引号（D5 复发）', (s) => breakSource(s, OK_ATTR, BAD_ATTR, 'D5 style'),
            1, null],
    ], 'D2');
});

test('v3271 D3. ★★ 把关键控件的 id 搬成 data- 属性 ⇒ 门禁必须 exit 1 并点名 U3', () => {
    okCases([
        ['N3 控件 id 被搬走', (s) => breakSource(s,
            '<button class="ls-btn" id=' + DQ + 'ls-import' + DQ + '>', '<button class="ls-btn" data-was="ls-import">', 'U3 控件'),
            1, 'U3 关键控件丢失'],
    ], 'D3');
});

/* ══════════ E. 同类形态不得回流（源码面静默检查） ══════════ */
test('v3271 E1. 门禁自己不得把「恒绿」写进结构预检：不得只数目录里有没有 settings-ui.js', () => {
    assert.ok(GATE_SRC.includes('MIN_UI_BYTES'), '门禁须有字节下限常量（防掏空后以「零缺陷」通过）');
    assert.ok(/ui\.length < MIN_UI_BYTES/.test(GATE_SRC), '字节下限必须真的被用（写了常量而不用 = 装饰）');
    assert.ok(GATE_SRC.includes('MIN_ENTRIES'), '入口数下限必须在场');
    assert.ok(/entries\.length < MIN_ENTRIES/.test(GATE_SRC), '入口数下限必须真的被判');
    ok('门禁的两处非零下限都在用（不是写来好看的常量）');
});

test('v3271 E2. 判据纯度：门禁不读环境、不写盘、不引入第三方（零运行时依赖是硬约束）', () => {
    const code = GATE_SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.equal(/\bprocess\.env\b/.test(code), false, '门禁不得读环境（同一份源码在不同环境结论必须相同）');
    for (const dep of ['jsdom', 'puppeteer', 'playwright']) {
        assert.equal(new RegExp('from\\s+[' + Q + DQ + ']' + dep).test(code), false,
            '门禁不得引入 ' + dep + '（本仓 manifest 声明 extra_js 全为本地文件，宿主不装 npm 包）');
    }
    assert.ok(code.includes('class El'), '门禁必须自带最小 DOM shim（否则无法在零依赖下真跑入口）');
    ok('判据纯度：零环境依赖、零第三方、自带 shim');
});

/* ══════════ F. 台账 + 版本锚 ══════════ */
test('v3271 F1. 两张台账都点名本档', () => {
    const cat = fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'catalog_reference_consumers.tsv'), 'utf8');
    assert.ok(cat.includes('v3271_ls_settings_panel_ui_runtime.test.mjs'), '参考基准台账未登记本档');
    const kit = fs.readFileSync(path.join(ROOT, 'tests', 'v3247_break_kit_consolidation.test.mjs'), 'utf8');
    assert.ok(kit.includes('v3271_ls_settings_panel_ui_runtime.test.mjs'), '破坏件接收方台账未登记本档');
    ok('两张台账均在册');
});

test('v3271 F2. 灵敏度矩阵登记本门禁，且三档实测读数与表一致', () => {
    const matrix = fs.readFileSync(path.join(ROOT, 'tests', 'audit', 'audit_scan_probe_matrix.tsv'), 'utf8');
    const row = matrix.split('\n').find((l) => l.startsWith('scan_ui_runtime.mjs' + '\t'));
    assert.ok(row, 'scan_ui_runtime.mjs 必须登记进 audit_scan_probe_matrix.tsv（v3226 B1 双向齐全）');
    const cols = row.split('\t');
    assert.deepEqual([cols[1], cols[2], cols[3]], ['0', '2', '0'],
        '登记读数须与实测一致（H 健康树 0 / G 根 .js 全删 2 / T tests 掏空 0）：表内为 ' + JSON.stringify(cols.slice(1, 4)));
    ok('矩阵登记与实测读数一致（H/G/T = 0/2/0）');
});

test('v3271 F3. 版本锚：本档锁出生版本 v3.271.0', () => {
    assert.ok(SELF.includes('v3.271.0'), '★ 本档必须锁自己的出生版本 v3.271.0（不随抬版上抬）');
    const vIdx = (/const VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8')) || [])[1];
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.strictEqual(vIdx, mf.version, 'index.js 与 manifest.json 版本必须一致');
    assert.strictEqual(mf.version, pkg.version, 'manifest.json 与 package.json 版本必须一致');
    const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
    assert.ok(vnum(vIdx) >= vnum('3.271.0'), '版本 ' + vIdx + ' 不得低于本套件出生版本 3.271.0');
    ok('版本锚 ' + vIdx);
});

/* ---------- 汇总 ---------- */
test('v3271 Z1. 汇总', () => {
    console.log('  v3271 断言 ' + pass + ' 通过 / ' + fail + ' 失败');
    assert.equal(fail, 0, '本档有 ' + fail + ' 条失败：' + pass + ' 通过');
});
