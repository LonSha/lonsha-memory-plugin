/* ============================================================
 * tests/v3482_settings_panel_wiring.test.mjs — 声明式设置页「真的接上了」
 *
 * 【要证明的三件事】
 *   a) 登记：manifest.extra_js 含 ui-settings-panel.js（不登记 = 永远不加载）；
 *   b) 入口：dashboard-shell.js 里既有按钮（data-ls-open-appearance），
 *      也有点开它后调 LonShaSettingsPanel.openSettingsPanel 的处理函数 —
 *      只有按钮没有处理函数，点下去毫无反应，这是最容易漏的一半；
 *   c) 组装器自身自检全绿（selfCheck 跑在 Node 侧，不碰 DOM）。
 *
 * 【为什么这条判据必须有】
 *   ui-settings-panel.js 1502 行 + css/lonsha-settings.css 1560 行，
 *   在接线之前**没有任何消费者**：占比统计天天涨，屏幕零变化。
 *   判据只审「入口存在」与「处理函数存在」，不审长相 —— 长相归真机。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const RD = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const RJ = (rel) => JSON.parse(RD(rel));

test('W1 登记：ui-settings-panel.js 在 manifest.extra_js 里，且只登记一次', () => {
    const man = RJ('manifest.json');
    const hits = man.extra_js.filter((f) => f === 'ui-settings-panel.js');
    assert.equal(hits.length, 1, 'ui-settings-panel.js 应恰好登记 1 次，实为 ' + hits.length);
    assert.ok(fs.existsSync(path.join(R, 'ui-settings-panel.js')), '登记了但文件不在磁盘');
    /* 它依赖的两层必须在它之前登记或至少存在（顺序错了会拿到 undefined） */
    for (const dep of ['ui-kit-core.js', 'ui-form-controls.js']) {
        assert.ok(man.extra_js.indexOf(dep) >= 0, '依赖未登记：' + dep);
    }
});

test('W2 入口：面板设置页有按钮，并且有处理函数调 openSettingsPanel', () => {
    const src = RD('dashboard-shell.js');
    assert.ok(src.includes('data-ls-open-appearance'), '设置页缺「打开外观设置面板」按钮');
    assert.ok(src.includes("window.LonShaSettingsPanel"), '按钮存在但没有任何地方取 LonShaSettingsPanel');
    assert.ok(src.includes('.openSettingsPanel('), '取了模块却没调 openSettingsPanel');
    /* 只有按钮没有绑定 = 点了没反应：绑定语句必须查得到 */
    assert.ok(src.includes("querySelector('[data-ls-open-appearance]')"),
        '按钮没有绑定 click（只有 HTML 没有 addEventListener）');
    /* 写回必须落到既有的真键上，不许自造一套新键让现网读不到 */
    for (const k of ['lonsha.ui.v2', 'lonsha.ui.v3', 'lonsha.ui.accent']) {
        assert.ok(src.includes(k), 'schema 里没有现网真键：' + k);
    }
});

test('W3 组装器自检：selfCheck() 全绿（Node 侧，不碰 DOM）', () => {
    const P = require(path.join(R, 'ui-settings-panel.js'));
    assert.ok(P && typeof P.openSettingsPanel === 'function', 'ui-settings-panel.js 没有导出 openSettingsPanel');
    const r = P.selfCheck();
    assert.equal(r.ok, true, '自检失败：' + JSON.stringify(r.fails));
    assert.ok(r.checks.length >= 10, '自检项过少（' + r.checks.length + '），覆盖面可疑');
});

test('W4 负控制：schema 写错必须看得见（未知 kind 不静默丢弃）', () => {
    const P = require(path.join(R, 'ui-settings-panel.js'));
    const norm = P.normalizeSchema({
        title: 'x',
        groups: [{ id: 'g', title: 'G', rows: [{ key: 'k1', label: 'L', kind: 'no_such_kind' }] }],
    });
    assert.equal(norm.ok, true, '未知 kind 不应让整页消失（应降级成可见提示）');
    const row = norm.groups[0].rows[0];
    assert.equal(row.kind, 'unsupported', '未知 kind 未被标成 unsupported');
    assert.ok(row.unsupported && row.unsupported.length > 0, '未知 kind 没有说明文字');
});

test('W5 日常入口接线：showPlayerHome 也被包到外壳上（否则用户根本看不到新界面）', () => {
    const src = RD('dashboard-shell.js');
    /* 真因记录：外壳此前只包 showSettingsPanel（#lonsha-settings-overlay）。
       但用户日常停留的是 showPlayerHome 生成的 #lonsha-home-overlay —— 于是
       「新外壳」永远藏在设置按钮后面，日常界面逐字节不变。 */
    assert.ok(src.includes('plugin.showPlayerHome = wrappedHome'),
        'showPlayerHome 没有被包裹：日常入口仍是旧主页');
    assert.ok(src.includes("homeTarget: 'lonsha.ui.homeTarget'"),
        '缺 homeTarget 键：用户无法回落旧主页');
    assert.ok(src.includes('__lsOriginal'), '包装没留原函数：出问题无法回退');
});
