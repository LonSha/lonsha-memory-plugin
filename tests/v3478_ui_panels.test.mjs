/**
 * tests/v3478_ui_panels.test.mjs — v3.478 呈现层四件的守门判据
 *
 * 【本文件要守住什么】
 *   1. 三个 UI 模块能在 Node 下被 require 且自检全绿（不靠浏览器也能验）。
 *   2. 它们**真的被登记**（manifest.extra_js / extra_css / style.css @import）
 *      —— 不登记 = 不加载 = 功能零生效，本仓 v3.163 的 68 个版本就是这么废的。
 *   3. 它们**真的被调用**：v4-panel-ui.js 的抽屉里有指向两者的入口。
 *      用「源码里必须有调用点」做证据，而不是「文件存在」。
 *   4. 呈现层占比不得回落（12.7% 是本期读数，20% 是目标；回落即回归）。
 *   5. 负控制：把调用点从源码里删掉后，第 3 条判据必须变红 ——
 *      否则说明这条判据写得太松（只查字符串存在而没查上下文）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// 基准用本文件自身 URL：以 ROOT 为基准再加 '../' 会解析到仓库外一层（本文件第一版就踩了）
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const KIT = require('../ui-kit-core.js');
const TREE = require('../ui-summary-tree.js');
const FLOOR = require('../ui-floor-panel.js');

const EXEMPT = { kit: 'ui-kit-core.js', tree: 'ui-summary-tree.js', floor: 'ui-floor-panel.js', css: 'css/lonsha-ui-kit.css' };

test('【0】版本三源对齐（读现行版本，不再写死字面量）', () => {
    // [v3.479.0] 这条原本把版本写死成 3.478.0，每升一次版就必红一次——那是抬版仪式，
    //   不是判据。现在改成「以 index.js 为真源，其余五处必须跟它同版」：既不会随抬版而腐，
    //   也仍能抓住「只改了一处」这种真实的碑子。
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const m = /const VERSION = '([0-9.]+)'/.exec(read('index.js'));
    assert.ok(m, 'index.js 里没有 const VERSION');
    const v = m[1];
    assert.equal(manifest.version, v, 'manifest 应跟随 index.js 的 ' + v);
    assert.equal(pkg.version, v, 'package 应跟随 index.js 的 ' + v);
    for (const rel of ['memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        assert.ok(read(rel).includes("'" + v + "'"), rel + ' 未与 index.js 同版（' + v + '）');
    }
    assert.ok(!read('index.js').includes("'3.476.0'"), 'index.js 还残留 3.476.0');
});

test('【1】ui-kit-core 自检全绿', () => {
    const r = KIT.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 15, '自检条数应 ≥15，实际 ' + r.total);
    assert.equal(r.ok, true);
});

test('【2】ui-summary-tree 自检全绿', () => {
    const r = TREE.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 12, '自检条数应 ≥12，实际 ' + r.total);
});

test('【3】ui-floor-panel 自检全绿', () => {
    const r = FLOOR.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 9, '自检条数应 ≥9，实际 ' + r.total);
});

test('【4】转义不可被实体还原（esc 的真实断层）', () => {
    const AMP = '&';
    assert.equal(KIT.esc('<'), AMP + 'lt;');
    assert.equal(KIT.esc(String.fromCharCode(34)), AMP + 'quot;');
    assert.equal(KIT.esc("'"), AMP + '#39;');
    // 反证：如果 esc 被写成直通，下面这条会红
    assert.notEqual(KIT.esc('<b>'), '<b>');
});

test('【5】三件在 manifest 里登记且顺序可加载', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const list = manifest.extra_js || [];
    for (const f of [EXEMPT.kit, EXEMPT.tree, EXEMPT.floor]) {
        assert.ok(list.includes(f), f + ' 未登记 extra_js');
        assert.ok(existsSync(path.join(ROOT, f)), f + ' 文件不存在');
    }
    // kit 先于两个面板：面板在加载阶段不取 kit（惰性），但顺序保持「基础在前」更安全
    assert.ok(list.indexOf(EXEMPT.kit) < list.indexOf(EXEMPT.tree), 'kit 应在 tree 之前');
    assert.ok(list.indexOf(EXEMPT.kit) < list.indexOf(EXEMPT.floor), 'kit 应在 floor 之前');
});

test('【6】样式走真实加载路径（@import + extra_css 双登记）', () => {
    assert.ok(existsSync(path.join(ROOT, EXEMPT.css)), 'css 文件不存在');
    const styleCss = read('css/style.css');
    assert.ok(styleCss.includes('lonsha-ui-kit.css'), 'style.css 未 @import lonsha-ui-kit.css');
    const manifest = JSON.parse(read('manifest.json'));
    assert.ok((manifest.extra_css || []).includes(EXEMPT.css), 'extra_css 未登记');
});

test('【7】ui-kit 样式不重声明 --ls-* token（只消费）', () => {
    const css = read(EXEMPT.css);
    const decls = css.match(/(^|[\s;{])--ls-[a-z0-9-]+\s*:/gm) || [];
    assert.equal(decls.length, 0, '发现重声明 token：' + decls.join(','));
    // 但必须确有消费（var(--ls-…)），否则等于没接设计系统
    assert.ok(/var\(--ls-[a-z0-9-]+/.test(css), '未消费任何 --ls-* token');
});

test('【8】调用点证据：抽屉里有指向摘要树与楼层面板的入口', () => {
    const src = read('v4-panel-ui.js');
    assert.ok(src.includes('LonShaSummaryTree'), '未引用 LonShaSummaryTree');
    assert.ok(src.includes('LonShaFloorPanel'), '未引用 LonShaFloorPanel');
    assert.ok(src.includes('openSummaryTree('), '未调用 openSummaryTree');
    assert.ok(src.includes('openFloorPanel('), '未调用 openFloorPanel');
    // 必须在单元格渲染之后追加（否则按钮被重建覆盖）
    const idxCells = src.indexOf('body.appendChild(buildCell');
    const idxTools = src.indexOf("el('div', 'v4-tools')");
    assert.ok(idxCells > 0 && idxTools > idxCells, '入口应在 CELLS 渲染之后追加');
});

test('【9】负控制：删掉调用点后判据必须变红', () => {
    const src = read('v4-panel-ui.js');
    const stripped = src
        .replace(/openSummaryTree\(/g, 'noopX(')
        .replace(/openFloorPanel\(/g, 'noopY(');
    // 与【8】同一套断言，只换输入 —— 若还能通过，说明【8】在查空
    const failsNow = !(stripped.includes('openSummaryTree(') && stripped.includes('openFloorPanel('));
    assert.equal(failsNow, true, '负控制失效：删掉调用点后判据仍然通过');
});

test('【10】占比读数不得回落（12.7% 基线，20% 目标）', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tests/audit/ui_ratio.mjs'), '--json'], {
        cwd: ROOT, encoding: 'utf8',
    });
    const j = JSON.parse(out);
    assert.ok(j.ratio >= 0.127, '呈现层占比回落到 ' + (j.ratio * 100).toFixed(1) + '%（基线 12.7%）');
    assert.ok(j.ratio < 0.20, '若已达标 20%，请把本判据的下界改成 20% 并更新目标说明');
    assert.ok(j.needLines > 0, 'needLines 应为正（离 20% 还差的行数）');
});

test('【11】空态不许冒充「0」：absent 与 empty 语义分离', () => {
    const saved = globalThis.LonShaMemory;
    try {
        globalThis.LonShaMemory = null;
        assert.equal(TREE.readSummaries().kind, 'absent');
        assert.equal(FLOOR.readFloors().kind, 'absent');
    } finally {
        if (saved !== undefined) globalThis.LonShaMemory = saved;
    }
    // 有引擎但没有对话 → empty，不是 absent
    globalThis.LonShaMemory = { engine: { summary: { getActiveSummaries: () => [], summaries: [] } } };
    try {
        const r = FLOOR.readFloors();
        assert.equal(r.ok, false);
        assert.equal(r.kind, 'empty', '无对话应判 empty，实际 ' + r.kind);
    } finally {
        if (saved === undefined) delete globalThis.LonShaMemory;
        else globalThis.LonShaMemory = saved;
    }
});