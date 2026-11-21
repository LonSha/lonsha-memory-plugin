/**
 * tests/v3480_ui_density.test.mjs — v3.480.0 呈现层第二批的守门判据
 *
 * 【本文件要守住什么】
 *   1. ui-json-tree.js / ui-table.js 能在 Node 下 require 且自检全绿。
 *   2. 两件**真的被登记**（manifest.extra_js）且**真的被调用**
 *      —— 本仓 v3.163 有 68 个版本「缝了机制没人调」，同一类死法的前科。
 *   3. **el 签名纪律**（本批踩实的真 bug）：ui-kit 的 el 是 el(tag, props对象, children)，
 *      第二参传字符串会走 Object.keys('ls-x') → setAttribute('0','l') →
 *      InvalidCharacterError，**只在真机炸，Node 自检永远测不到**。
 *      所以必须有一条静态守卫直接读源码，而不是靠运行期。
 *   4. absent 与 empty 分离：结构漂移要报「读不出来」，不是「没有数据」。
 *   5. 纯函数口径不回退：排序空值沉底、分页越界夹紧、环不无限增长。
 *   6. 负控制：删掉接线后判据必须变红，否则说明判据在查空。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const TREE = require('../ui-json-tree.js');
const TABLE = require('../ui-table.js');
const PANELS = require('../ui-data-panels.js');

/* ── 【0】版本三源对齐（读现行版本，不写死字面量）────────────────── */
test('【0】版本三源对齐（读现行版本，不写死字面量）', () => {
    // 与 v3478 / v3479 同一口径：index.js 是唯一真源，其余各处必须跟它同版。
    // 写死版本号的判据每升一次版就必红一次，那是抬版仪式，不是判据。
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const m = /const VERSION = '([0-9.]+)'/.exec(read('index.js'));
    assert.ok(m, 'index.js 里没有 const VERSION');
    const v = m[1];
    assert.equal(manifest.version, v, 'manifest 应跟随 index.js 的 ' + v);
    assert.equal(pkg.version, v, 'package 应跟随 index.js 的 ' + v);
    assert.equal(v, '3.480.0', '本判据文件对应的版本应为 3.480.0');
});

/* ── 【1】ui-json-tree 自检全绿 ─────────────────────────────────── */
test('【1】ui-json-tree 自检全绿（含判环 / 截断 / absent）', () => {
    const r = TREE.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 22, '自检条数应 ≥22，实际 ' + r.total);
    assert.equal(r.ok, true);
});

/* ── 【2】ui-table 自检全绿 ─────────────────────────────────────── */
test('【2】ui-table 自检全绿（排序 / 分页 / absent）', () => {
    const r = TABLE.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 20, '自检条数应 ≥20，实际 ' + r.total);
    assert.equal(r.ok, true);
});

/* ── 【3】ui-data-panels 自检全绿且新增了接线判据 ────────────────── */
test('【3】ui-data-panels 自检全绿，且含接线判据', () => {
    const r = PANELS.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 27, '接线后自检条数应 ≥27（原 21 + 新增 6），实际 ' + r.total);
    const names = r.checks.map((c) => c.name).join('|');
    assert.ok(names.includes('openRowsTable'), '自检里缺 openRowsTable 判据');
    assert.ok(names.includes('tableLib'), '自检里缺 tableLib 判据');
    assert.ok(names.includes('jsonLib'), '自检里缺 jsonLib 判据');
});

/* ── 【4】登记与顺序 ────────────────────────────────────────────── */
test('【4】三件都登记在 manifest，且排在 ui-kit-core 之后', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const list = manifest.extra_js || [];
    for (const mod of ['ui-json-tree.js', 'ui-table.js']) {
        assert.ok(list.includes(mod), mod + ' 未登记 extra_js');
        assert.ok(list.indexOf(mod) > list.indexOf('ui-kit-core.js'),
            mod + ' 应排在 ui-kit-core.js 之后（它依赖 el / panel）');
    }
    assert.ok((manifest.extra_css || []).includes('css/lonsha-ui-kit-ext.css'),
        'css/lonsha-ui-kit-ext.css 未登记 extra_css');
    // 样式必须排在 token 真源之后
    const css = manifest.extra_css || [];
    assert.ok(css.indexOf('css/lonsha-ui-kit-ext.css') > css.indexOf('css/lonsha-design.css'),
        '样式第二层应排在 lonsha-design.css 之后');
});

/* ── 【5】调用点证据：接线真的落在 ui-data-panels.js 上 ──────────── */
test('【5】调用点证据：tableLib / jsonLib 解析两件，且两个面板都接上 onTable / onRaw', () => {
    const src = read('ui-data-panels.js');
    assert.ok(src.includes("safeRequire('./ui-table.js')"), '缺 ui-table.js 的解析回退');
    assert.ok(src.includes("safeRequire('./ui-json-tree.js')"), '缺 ui-json-tree.js 的解析回退');
    assert.ok(src.includes('root.LonShaUiTable'), '缺 LonShaUiTable 全局读取');
    assert.ok(src.includes('root.LonShaJsonTree'), '缺 LonShaJsonTree 全局读取');
    // 两个面板各自接线（状态变量 + 物品台账）
    assert.ok(src.includes("title: '状态变量（表格）'"), '状态变量面板未接表格视图');
    assert.ok(src.includes("title: '物品台账（表格）'"), '物品台账面板未接表格视图');
    assert.ok(src.includes("openRawTree(d, '状态变量 · 原始结构'"), '状态变量面板未接原始结构');
    assert.ok(src.includes("openRawTree(d, '物品台账 · 原始结构'"), '物品台账面板未接原始结构');
    // 底栏按钮按能力装配：没配 onTable 就不该出现该按钮
    assert.ok(src.includes("if (typeof o.onTable === 'function')"), '底栏按钮未按能力装配');
    // 真调用，不是只解析
    assert.ok(src.includes('T.renderTable({'), 'openRowsTable 未真正调用 renderTable');
    assert.ok(src.includes('J.openJsonTree({'), 'openRawTree 未真正调用 openJsonTree');
});

/* ── 【6】负控制：删掉接线后判据必须变红 ─────────────────────────── */
test('【6】负控制：删掉接线后【5】的断言必须变红', () => {
    const src = read('ui-data-panels.js')
        .replace(/T\.renderTable\(\{/g, 'noopT({')
        .replace(/J\.openJsonTree\(\{/g, 'noopJ({')
        .replace(/if \(typeof o\.onTable === 'function'\)/g, 'if (false)');
    assert.equal(src.includes('T.renderTable({'), false, '负控制失效：renderTable 调用未被识别');
    assert.equal(src.includes('J.openJsonTree({'), false, '负控制失效：openJsonTree 调用未被识别');
    assert.equal(src.includes('if (typeof o.onTable === \'function\')'), false,
        '负控制失效：能力装配未被识别');
});

/* ── 【7】el 签名静态守卫（本批踩实的真 bug）─────────────────────── */
test('【7】el 签名纪律：渲染层不得出现 el(tag, 字符串) 形态', () => {
    // 为什么必须静态查：ui-kit 的 el 第二参是 props 对象，传字符串会在真机抛
    //   InvalidCharacterError，而 Node 自检没有 DOM，走不到那条分支 —— 运行时测不出来。
    // 合法形态只剩两种：el('tag')（单参）、el('tag', {对象})，以及本地 mk(tag, cls, text)。
    const bad = /\bel\(\s*'[a-z]+'\s*,\s*'/;
    for (const rel of ['ui-json-tree.js', 'ui-table.js']) {
        const lines = read(rel).split('\n');
        const hits = [];
        lines.forEach((ln, i) => {
            if (bad.test(ln)) hits.push((i + 1) + ': ' + ln.trim());
        });
        assert.equal(hits.length, 0, rel + ' 里仍有字符串签名调用：\n' + hits.join('\n'));
    }
    // 正控制：bad 正则必须能抓住反例，否则这条守卫在查空
    assert.equal(bad.test("const x = el('div', 'ls-x');"), true, '守卫正则失效：抓不到反例');
    assert.equal(bad.test("const x = el('thead');"), false, '守卫误报：单参形态应合法');
    assert.equal(bad.test('const x = el(tag, { class: c });'), false, '守卫误报：对象形态应合法');
});

/* ── 【8】挂载前置（消费审计只认 window.X = 形态）────────────────── */
test('【8】挂载前置成立', () => {
    assert.ok(/window\.LonShaJsonTree\s*=\s*api/.test(read('ui-json-tree.js')),
        'ui-json-tree.js 缺 window.LonShaJsonTree = api');
    assert.ok(/window\.LonShaUiTable\s*=\s*api/.test(read('ui-table.js')),
        'ui-table.js 缺 window.LonShaUiTable = api');
    assert.ok(typeof TREE.openJsonTree === 'function', 'openJsonTree 未导出');
    assert.ok(typeof TABLE.renderTable === 'function', 'renderTable 未导出');
});

/* ── 【9】absent 与 empty 分离 ──────────────────────────────────── */
test('【9】结构漂移判 absent 且理由准确（不是「没有数据」）', () => {
    // 表格：rows 不是数组 → 结构漂移
    const a = TABLE.renderTable({ rows: null, columns: [] });
    assert.equal(a.ok, false);
    assert.equal(a.kind, 'absent');
    assert.ok(/数组/.test(a.reason), '理由应指明不是数组，实际：' + a.reason);
    // 表格：没有 DOM 是环境问题，理由必须与结构漂移不同
    const b = TABLE.renderTable({ rows: [], columns: [] });
    assert.equal(b.kind, 'absent');
    assert.ok(/document/.test(b.reason), '理由应指明缺 document，实际：' + b.reason);
    assert.notEqual(a.reason, b.reason, '结构漂移与环境缺失的理由不能同形');
    // 结构树：没有 DOM → absent，不许假装成功
    const c = TREE.openJsonTree({ data: { a: 1 } });
    assert.equal(c.ok, false);
    assert.equal(c.kind, 'absent');
    // 面板层：rows 非数组时报结构漂移（不是报环境）——判定顺序即优先级
    const d = PANELS.openRowsTable({ rows: null, columns: [] });
    assert.equal(d.ok, false);
    assert.ok(/数组/.test(d.reason), '面板层理由应指明不是数组，实际：' + d.reason);
});

/* ── 【10】纯函数口径不回退 ─────────────────────────────────────── */
test('【10】排序空值沉底 / 分页越界夹紧 / 环不无限增长', () => {
    // 空值无论升降序都沉底（否则「空」会插到「有值」中间，读起来像排名）
    const mixed = [{ v: 'b' }, { v: null }, { v: 'a' }, { v: '' }];
    const asc = TABLE.sortRows(mixed, 'v', 'asc').map((r) => r.v);
    assert.equal(asc[0], 'a');
    assert.equal(asc[1], 'b');
    // 越界页夹到末页：渲染空页会让「这页没数据」与「数据没了」同形
    const rows = Array.from({ length: 25 }, (_, i) => ({ i }));
    const pg = TABLE.paginate(rows, 99, 20);
    assert.equal(pg.page, 2, '第 99 页应夹到第 2 页（共 2 页），实际 ' + pg.page);
    assert.equal(pg.rows.length, 5, '末页应剩 5 行');
    // 自指环不无限增长
    const cyc = { name: 'x' };
    cyc.self = cyc;
    const f = TREE.flatten(cyc);
    assert.ok(f.rows.length <= 4, '环应被截止，实际行数 ' + f.rows.length);
    assert.ok(f.rows.some((r) => r.circular === true), '环应被标记 circular');
});

/* ── 【11】CSS 只消费不重声明 token ─────────────────────────────── */
test('【11】样式第二层只消费 --ls-* token，不重新声明', () => {
    const css = read('css/lonsha-ui-kit-ext.css');
    // 形如 `--ls-xxx:` 的定义（声明），本文件必须为 0
    const defs = css.match(/^\s*--ls-[a-z0-9-]+\s*:/gm) || [];
    assert.equal(defs.length, 0, '本文件不得重声明 token，实际 ' + defs.length + ' 处：' + defs.slice(0, 5).join(','));
    assert.ok(css.includes('--ls-'), '本文件应消费 --ls-* token');
    // 降级必须存在：减少动效 + 打印
    assert.ok(/prefers-reduced-motion/.test(css), '缺 prefers-reduced-motion 降级');
    assert.ok(/@media\s+print/.test(css), '缺 @media print 降级');
    // style.css 已 @import
    assert.ok(read('css/style.css').includes('lonsha-ui-kit-ext.css'), 'style.css 未 @import 本文件');
});

/* ── 【12】占比不回落 ───────────────────────────────────────────── */
test('【12】呈现层占比不得回落到 14.2% 以下', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tests/audit/ui_ratio.mjs'), '--json'], {
        cwd: ROOT, encoding: 'utf8',
    });
    const j = JSON.parse(out.slice(out.indexOf('{')));
    assert.ok(j.ratio >= 0.142, '占比回落：' + (j.ratio * 100).toFixed(1) + '%（基线 14.2%）');
    // 三件必须都计入分子
    const uiNames = j.uiFiles.map(([n]) => n);
    assert.ok(uiNames.includes('ui-table.js'), 'ui-table.js 未计入 UI 侧');
    assert.ok(uiNames.includes('ui-json-tree.js'), 'ui-json-tree.js 未计入 UI 侧');
    const cssNames = j.cssFiles.map(([n]) => n);
    assert.ok(cssNames.includes('lonsha-ui-kit-ext.css'), '样式第二层未计入');
});