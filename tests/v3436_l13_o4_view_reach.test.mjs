/* L13-O4: 面板视图入口可达性 —— 从「没人守着」变成「有读数 + 有判据 + 有负控制」。
 *
 * 【背景（实测，不是推测）】
 *   本仓 settings-ui.js 共有 26 个 `viewType === 'x'` 渲染分支。此前**没有任何判据**
 *   在问「这个视图玩家点不点得到」：`scan_ui_binding` 判的是「声明键 ↔ 渲染控件」，
 *   视图写好了但零入口，在全绿下完全隐形。这正是 L13 优化面反复治的那一类
 *   （建好而碰不到）。
 *
 * 【盘面结论（由 tests/audit/scan_ui_view_reach.mjs 落盘读数）】
 *   视图 26 | 导航可达 26 | 仅代码可达 0 | 零可达 0 | 卡片绑定=有
 *   —— 也就是说本项**不是**来补接线的（接线是全的），而是来把「全」这件事
 *   钉成可复算的读数，并把判据本身做成能被真实破坏翻红的形态。
 *
 * 【判定口径】
 *   nav  该视图名以字面量出现在一张 `ls-clickable + data-view` 卡片上，
 *        且存在 `showBrowser(card.dataset.view)` 绑定（卡片是真能点的，不是装饰）。
 *   code 没卡片但有 `showBrowser('x')` 字面量（只能被某条流程跳进来）。
 *   zero 有渲染分支，既没卡片也没任何 showBrowser 指向它 —— 这一档 >0 即红。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyze } from './audit/scan_ui_view_reach.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const UI = fs.readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

/* 锚点（唯一声明处；判据函数不引用这些串） */
const A_CARD_TIMELINE = 'data-view="timeline"';
const A_CARD_BINDING = 'plugin.showBrowser(card.dataset.view)';
const A_BRANCH_TIMELINE = "viewType === 'timeline'";

const R = analyze(UI);

test('L13-O4 A: 零可达视图必须为 0（只有定义没有入口 = 建好而碰不到）', () => {
    assert.equal(R.counts.zero, 0,
        '零可达视图: ' + R.views.filter(v => v.kind === 'zero').map(v => v.view).join(', '));
});

test('L13-O4 B: 渲染分支总数 >= 20，且每个分支都在盘面里（不漏盘）', () => {
    const branches = new Set();
    const re = /viewType\s*===\s*'([a-z0-9_]+)'/g;
    let m;
    while ((m = re.exec(UI))) branches.add(m[1]);
    assert.ok(branches.size >= 20, '视图分支数异常偏少: ' + branches.size);
    const listed = new Set(R.views.map(v => v.view));
    for (const b of branches) assert.ok(listed.has(b), '分支未进盘面: ' + b);
    /* 反向：盘面里的每个视图都得真有分支，不许把 showBrowser 的目标当视图 */
    for (const v of R.views) assert.ok(v.hasBranch, '盘面含无渲染分支的视图: ' + v.view);
});

test('L13-O4 C: 导航可达必须由「卡片 + 绑定」两件事同时成立，不许只看一半', () => {
    assert.equal(R.cardBinding, true, '卡片 -> showBrowser 的绑定必须存在，否则卡片只是装饰');
    for (const v of R.views) {
        if (v.kind !== 'nav') continue;
        const clickable = v.cards.filter(c => c.clickable);
        assert.ok(clickable.length > 0, 'nav 视图必须有 ls-clickable 卡片: ' + v.view);
    }
    /* 三类计数自洽：三个桶加起来必须等于视图总数（防重复计入或漏计） */
    assert.equal(R.counts.nav + R.counts.code + R.counts.zero, R.views.length,
        '三类计数之和须等于视图总数');
});

test('L13-O4 D: 真源码破坏 -> 同一条判据必须翻红（三组负控制）', () => {
    /* ── N1: 卡片去掉 ls-clickable（变成装饰卡，点不动）──
     * 破坏后该视图必须掉出 nav 档，且 nav 计数下降。 */
    const line = UI.split('\n').find(l => l.includes(A_CARD_TIMELINE) && l.includes('ls-clickable'));
    assert.ok(!!line, 'N1 破坏锚点须命中（timeline 卡片行）');
    const n1 = UI.replace(line, line.replace('ls-clickable', 'ls-dead'));
    assert.notEqual(n1, UI, 'N1 破坏须真的改动源码');
    const r1 = analyze(n1);
    const t1 = r1.views.find(v => v.view === 'timeline');
    assert.ok(t1, 'timeline 仍在盘面');
    assert.notEqual(t1.kind, 'nav', '=> C 段 nav 断言在此必然翻红');
    assert.ok(r1.counts.nav < R.counts.nav, '=> nav 计数须下降');
    assert.ok(r1.counts.nav + r1.counts.code + r1.counts.zero === r1.views.length, '计数仍须自洽');

    /* ── N2: 掐掉卡片绑定（卡片留在 DOM 里但点了不跳）──
     * 这是最阴的一种：看起来有卡片，实际全不可达。只判「卡片存在」的判据会假绿。 */
    const n2 = UI.replace(A_CARD_BINDING, 'void 0');
    assert.notEqual(n2, UI, 'N2 破坏锚点须命中');
    const r2 = analyze(n2);
    assert.equal(r2.cardBinding, false, '=> C 段绑定断言在此翻红');
    assert.equal(r2.counts.nav, 0, '=> 绑定被掐后 nav 必须归零');
    assert.ok(r2.counts.zero + r2.counts.code === r2.views.length, '视图全部降级为 code/zero');

    /* ── N3: 删掉一个渲染分支（视图只剩卡片字面量，没有渲染体）──
     * 反向证明「分支数」与「盘面数」是同一套真源：分支一没，hasBranch 立刻翻假，
     * 而卡片字面量仍在盘面里（这正是 B 段「盘面含无渲染分支的视图」要抓的形态）。 */
    const n3 = UI.replace(A_BRANCH_TIMELINE, "viewType === 'timeline_disabled'");
    assert.notEqual(n3, UI, 'N3 破坏锚点须命中');
    const r3 = analyze(n3);
    const t3 = r3.views.find(v => v.view === 'timeline');
    assert.ok(t3, 'timeline 卡片字面量仍在盘面');
    assert.equal(t3.hasBranch, false, '=> B 段分支覆盖断言在此必然翻红');
    assert.ok(r3.views.some(v => v.view === 'timeline_disabled'), '改名的分支须进盘面');

    /* 原版在三条破坏下都必须保持原读数（防「破坏把判据自己改了」的自指假绿） */
    assert.equal(R.counts.zero, 0);
    assert.equal(R.counts.nav, R.views.length);
});

test('L13-O4 E: 读数可复算 —— 同一份源码两次分析结果必须逐项相同', () => {
    const again = analyze(UI);
    assert.deepEqual(again.counts, R.counts);
    assert.deepEqual(again.views.map(v => v.view + ':' + v.kind), R.views.map(v => v.view + ':' + v.kind));
    assert.equal(again.cardBinding, R.cardBinding);
});
/* F: 结构漂移通道（exit 2）—— 「零可达 0」是一个**否定式结论**，探测器塌陷时它照旧成立。
 *
 * 【为什么必须补这一档】本脚本交付时只有 0/1 两态：settings-ui.js 读不到、或视图盘面被
 *   截断成正则失配的空盘时，它会照样打印「零可达 0 ✔」并以 0 退出 ——
 *   即「审计失效」被声明成「一切正常」。v3159 的 [2] / [2d] 当场点名了这一点
 *   （scan_exit_codes 的 B3：自述缺 exit 2）。
 *   修法是给脚本补 fail-closed 通道，**不是**放宽 v3159 的判据。
 *   本段是该通道的观测点：真源码破坏 -> 在破坏副本上跑 -> 必须 exit 2。 */
test('L13-O4 F: 盘面塌陷/源缺失 -> exit 2（探测器失效不得报「零可达 0」）', () => {
    const SCRIPT = path.join(ROOT, 'tests', 'audit', 'scan_ui_view_reach.mjs');
    const src = fs.readFileSync(SCRIPT, 'utf8');
    /* 自证锚点纯度：判据段只在这里引用这些串（H5 口径） */
    const A_MIN = 'const MIN_VIEWS = 20;';
    const A_EXIT2 = 'process.exit(2);';
    assert.ok(src.includes(A_MIN), 'F 下限常量须在位');
    assert.ok(src.includes(A_EXIT2), 'F fail-closed 出口须在位');

    const runIn = (uiText) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3436-'));
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        fs.copyFileSync(SCRIPT, path.join(dir, 'tests', 'audit', 'scan_ui_view_reach.mjs'));
        fs.writeFileSync(path.join(dir, 'settings-ui.js'), uiText);
        const r = spawnSync(process.execPath, [path.join('tests', 'audit', 'scan_ui_view_reach.mjs')],
            { cwd: dir, encoding: 'utf8', timeout: 60000 });
        fs.rmSync(dir, { recursive: true, force: true });
        return r;
    };

    /* ① 健康面：真源码上必须 exit 0（负控制不得把原版判红） */
    const healthy = runIn(UI);
    assert.equal(healthy.status, 0, '健康树必须 exit 0，got ' + healthy.status);

    /* ② 塌陷面：只留个位数视图（越过零字节但正则面崩掉）——
     *    这是最阴的一种：文件在、体积在、`零可达 0` 也成立，只有盘面没了。 */
    const collapsed = runIn(
        "function s(plugin) { const viewType = 'status'; return ''; }\n"
        + "/* " + 'x'.repeat(22000) + " */\n");
    assert.equal(collapsed.status, 2,
        '盘面塌陷必须 exit 2（fail-closed），got ' + collapsed.status + ' / ' + String(collapsed.stdout).slice(-160));

    /* ③ 源缺失：settings-ui.js 不在 ⇒ 读不到就拒绝给结论 */
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'v3436-'));
    fs.mkdirSync(path.join(dir2, 'tests', 'audit'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(dir2, 'tests', 'audit', 'scan_ui_view_reach.mjs'));
    const missing = spawnSync(process.execPath, [path.join('tests', 'audit', 'scan_ui_view_reach.mjs')],
        { cwd: dir2, encoding: 'utf8', timeout: 60000 });
    fs.rmSync(dir2, { recursive: true, force: true });
    assert.equal(missing.status, 2,
        '源缺失必须 exit 2（fail-closed），got ' + missing.status + ' / ' + String(missing.stdout).slice(-160));
});
