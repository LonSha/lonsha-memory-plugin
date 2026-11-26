// tests/l23_o8_view_drive_all.test.mjs — L23-O8：视图分支逐个**真调** [v3.474.0]
//
// 计划原文：「34 个视图分支逐个真调：不抛 + 落 DOM + 带机器可读面态」。
//
// 先给实测口径（不是猜的，是本档枚举并逐个驱动过的）：
//   · settings-ui.js 的浏览器视图（`viewType === 'x'`）= **28** 个，已由 `v21_o6` 在最小 DOM shim 里逐个真调；
//   · modules_combined.js 的可视化面板（`render*View`）= **4** 个（graph/timeline/stats/community），
//     **此前没有任何判据驱动过它们**，而且它们连机器可读面态都没有（只有 `lonsha-empty` 这个类名）。
//   ⇒ 真视图面 = **31**，与计划写的 34 差 3（差异如实记进 `tests/audit/view_drive_ledger.json`，
//     不为了凑数去造三个假分支）。
//
// 本刀修的产品面缺陷（两处，都是「面态缺失/同形」）：
//   ① 4 个 viz 视图没有机器可读面态 ⇒ 新增 `_face(el, state, why)` 单一实现 + 各分支写
//      `data-face-state` / `data-face-why`（empty / ok / blocked 三态不同形）；
//   ② 「依赖缺席」与「本来没数据」同形（都是 `lonsha-empty` + 一句话）⇒ community 在
//      `GraphDiffusion` 缺席时记 `blocked`、有模块但没社区记 `empty` —— 一个叫你去装，一个叫你别等。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { analyze } from './audit/scan_ui_view_reach.mjs';
import { breakOnce } from './_break_kit.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIZ_PATH = path.join(ROOT, 'modules_combined.js');
const UI_PATH = path.join(ROOT, 'settings-ui.js');
const LEDGER_PATH = path.join(ROOT, 'tests', 'audit', 'view_drive_ledger.json');
const VIZ_SRC = fs.readFileSync(VIZ_PATH, 'utf8');

/* ── 最小 DOM：够 viz 面板跑，不多给一点（多给就等于替产品兜底） ── */
function makeEl() {
    const attrs = {};
    const el = {
        innerHTML: '',
        style: {},
        dataset: {},
        width: 800,
        height: 600,
        setAttribute(k, v) { attrs[k] = String(v); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
        addEventListener() {},
        getBoundingClientRect() { return { left: 0, top: 0 }; },
        getContext() {
            const noop = () => {};
            return { clearRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, arc: noop, fill: noop, fillText: noop, set strokeStyle(v) {}, set lineWidth(v) {}, set fillStyle(v) {}, set font(v) {}, set textAlign(v) {} };
        },
    };
    return el;
}

/** 在隔离 context 里加载 viz 源码并驱动四个视图。返回 {面态, innerHTML, 抛错} 读数。 */
function drive(srcText, opts) {
    const o = opts || {};
    const els = {};
    const sandbox = {
        console,
        Math,
        Date,
        JSON,
        Array,
        Object,
        Number,
        String,
        requestAnimationFrame() {},
        document: {
            getElementById(id) {
                if (id === 'lonsha-graph-canvas') { if (!els[id]) els[id] = makeEl(); return els[id]; }
                if (o.missing && o.missing.includes(id)) return null;
                if (!els[id]) els[id] = makeEl();
                return els[id];
            },
            createElement() { return makeEl(); },
        },
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;
    if (o.diffusion) {
        sandbox.GraphDiffusion = class { constructor() {} detectCommunities() { return o.communities || []; } };
        sandbox.window.GraphDiffusion = sandbox.GraphDiffusion;
    }
    vm.runInNewContext(srcText, sandbox, { filename: 'modules_combined.js' });
    const MV = sandbox.MemoryVisualizer;
    assert.equal(typeof MV, 'function', 'modules_combined.js 必须在全局暴露 MemoryVisualizer');
    const engine = {
        graph: {
            nodes: new Map(o.nodes || []),
            edges: new Map(o.edges || []),
            nameIndex: new Map(),
            export() { return {}; },
        },
        summary: { summaries: o.summaries || [], export() { return {}; } },
        diary: { diaries: o.diaries || {}, export() { return {}; } },
        vector: { vectors: o.vectors || [], export() { return {}; } },
    };
    const v = new MV(engine);
    const out = {};
    const errs = {};
    for (const name of ['renderGraphView', 'renderTimelineView', 'renderStatsView', 'renderCommunityView']) {
        const id = { renderGraphView: 'lonsha-viz-graph', renderTimelineView: 'lonsha-viz-timeline', renderStatsView: 'lonsha-viz-stats', renderCommunityView: 'lonsha-viz-community' }[name];
        assert.equal(typeof v[name], 'function', name + ' 必须是函数（视图分支被删了就必须红）');
        try {
            v[name]();
            const el = els[id];
            out[name] = { state: el ? el.getAttribute('data-face-state') : null, why: el ? el.getAttribute('data-face-why') : null, html: el ? String(el.innerHTML) : '' };
        } catch (e) { errs[name] = String((e && e.stack) || e); }
    }
    return { out, errs };
}

const VIZ_VIEWS = ['renderGraphView', 'renderTimelineView', 'renderStatsView', 'renderCommunityView'];

test('A1 视图面枚举：settings-ui 28 + viz 面板 4 = 32，且枚举是扫出来的不是写死的', () => {
    const settings = analyze(fs.readFileSync(UI_PATH, 'utf8')).views.map((v) => v.view);
    assert.equal(settings.length, 28, 'settings-ui 浏览器视图数变了（28）⇒ 台账必须同步：' + settings.length);
    const declared = (VIZ_SRC.match(/(render[A-Za-z0-9_]*View)\s*\(/g) || [])
        .map((x) => x.replace(/\s*\($/, ''))
        .filter((x, i, a) => a.indexOf(x) === i)
        .filter((x) => !['renderGraphView', 'renderTimelineView', 'renderStatsView', 'renderCommunityView'].includes(x) || true);
    /* 只数「方法定义」：`renderXView() {` */
    const defs = (VIZ_SRC.match(/\n\s+(render[A-Za-z0-9_]*View)\(\)\s*\{/g) || []).map((x) => x.trim().replace('() {', '').trim());
    assert.deepEqual(defs.sort(), [...VIZ_VIEWS].sort(),
        'viz 面板的渲染分支集合变了 ⇒ 判据必须跟着扩面（新增分支不许不驱动）：实 ' + defs.join(','));
    void declared;
    assert.equal(settings.length + defs.length, 32, '真视图面 = 28 + 4 = 32');
});

test('A2 台账与现场一致：总数 31、计划写 34 的差异必须写清（不凑数）', () => {
    const led = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    assert.equal(led.counts.settings_ui, 28, '台账 settings_ui 数必须与现场一致');
    assert.equal(led.counts.viz_panel, 4, '台账 viz_panel 数必须与现场一致');
    assert.equal(led.counts.total, led.counts.settings_ui + led.counts.viz_panel, '台账总数必须是两项之和');
    assert.equal(led.plan_expectation, 34, '计划原文的数字必须留档（不改计划去迎合实测）');
    assert.equal(led.plan_expectation - led.counts.total, 2, '差异条数必须如实写在台账里（v3.485.0 新增 drylens 后 34 - 32 = 2）');
    assert.ok(String(led.why || '').length >= 40, '差异原因必须写清（不许一句「口径不同」了事）');
    assert.ok(Array.isArray(led.driven_by) && led.driven_by.length >= 2, '每个面由谁驱动必须点名');
});

test('B1 四个 viz 视图「空数据」态：不抛、落 DOM、面态是 empty（stats 恒 ok：0 条也是这一页）', () => {
    const { out, errs } = drive(VIZ_SRC, {});
    assert.deepEqual(Object.keys(errs), [], '空数据态不许抛：' + JSON.stringify(errs));
    for (const k of ['renderGraphView', 'renderTimelineView']) {
        assert.equal(out[k].state, 'empty', k + ' 空数据必须记 empty，实 ' + out[k].state);
        assert.ok(out[k].html.length > 0, k + ' 必须真的落 DOM（innerHTML 为空等于没渲染）');
        assert.ok(String(out[k].why).length > 0, k + ' empty 必须带成因码（空给谁看？）');
    }
    /* community 在「没给 GraphDiffusion」的场景里是 blocked 而不是 empty —— 这正是 B3 要钉的不同形，
     *   本条的期望值也随之分开：**不许要求它 empty**（那会逼产品把「依赖缺席」谎报成「没数据」）。 */
    assert.equal(out.renderCommunityView.state, 'blocked', '依赖缺席场景下 community 必须是 blocked');
    assert.ok(out.renderCommunityView.html.length > 0, 'blocked 也必须落 DOM（一句话也要给）');
    assert.equal(out.renderStatsView.state, 'ok', '统计页恒 ok —— 「全 0」不等于「没有这一页」');
    assert.ok(out.renderStatsView.html.includes('图谱节点'), 'stats 必须真渲染出内容');
});

test('B2 四个 viz 视图「有数据」态：拿到 ok，且 DOM 内容与 empty 不同形', () => {
    const nodes = [['n1', { id: 'n1', type: 'character', name: '甲', timestamp: 1 }]];
    const edges = [['e1', { from: 'n1', to: 'n1' }]];
    const summaries = [{ timestamp: 1, text: '第一段', floor: 1 }];
    const withData = drive(VIZ_SRC, { nodes, edges, summaries, diffusion: true, communities: [[{ id: 'n1', name: '甲' }]] });
    const empty = drive(VIZ_SRC, {});
    assert.deepEqual(Object.keys(withData.errs), [], '有数据态不许抛：' + JSON.stringify(withData.errs));
    for (const k of VIZ_VIEWS) {
        assert.equal(withData.out[k].state, 'ok', k + ' 有数据必须 ok，实 ' + withData.out[k].state);
        assert.notEqual(withData.out[k].html, empty.out[k].html, k + ' 有数据与没数据的 DOM 不许同形');
    }
});

test('B3 「依赖缺席」与「没数据」不同形：community 在 GraphDiffusion 缺席时是 blocked', () => {
    const blocked = drive(VIZ_SRC, {});
    const emptyComm = drive(VIZ_SRC, { diffusion: true, communities: [] });
    assert.equal(blocked.out.renderCommunityView.state, 'blocked', '依赖缺席必须 blocked（叫你去装）');
    assert.equal(blocked.out.renderCommunityView.why, 'graph-diffusion-missing', 'why 必须是具名成因码');
    assert.equal(emptyComm.out.renderCommunityView.state, 'empty', '有模块但没社区必须 empty（叫你别等）');
    assert.notEqual(blocked.out.renderCommunityView.state, emptyComm.out.renderCommunityView.state,
        'blocked 与 empty 塌成同一形，正是本刀要断的形态');
});

test('B4 面态是「一处实现」：四个分支都经 `_face`，不许各写各的 setAttribute', () => {
    const calls = (VIZ_SRC.match(/this\._face\(container,/g) || []).length;
    assert.ok(calls >= 6, '四个分支的空/有数据两态都要经 _face，实测调用 ' + calls + ' 处（<6 说明有分支漏了）');
    assert.equal((VIZ_SRC.match(/setAttribute\('data-face-state'/g) || []).length, 1,
        "data-face-state 只许在 _face 里写一次（多处写=第二份真源）");
});

test('B5 28 个 settings-ui 视图由 v21_o6 驱动，且驱动清单来自 analyze（不是写死 28）', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tests', 'v21_o6_view_drive_truth.test.mjs'), 'utf8');
    assert.match(src, /viewList\(\)/, 'v21_o6 必须遍历 analyze 出来的清单（写死列表会漏掉新视图）');
    assert.match(src, /data-face-state|data-ls-face/, 'v21_o6 必须断言机器可读面态');
    assert.equal(analyze(fs.readFileSync(UI_PATH, 'utf8')).views.length, 28);
});

test('C1 入口事实如实登记：实例化 1 处但「打开面板」0 处 ⇒ 台账必须写清这两条（不假装可达）', () => {
    const files = [];
    const walk = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === '.git' || e.name === 'docs' || e.name === 'tests') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs)$/.test(e.name)) continue;
            files.push({ rel: path.relative(ROOT, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf8') });
        }
    };
    walk(ROOT);
    const inst = [];
    const openers = [];
    for (const { rel, text } of files) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (/new\s+MemoryVisualizer\s*\(/.test(lines[i])) inst.push(rel + ':' + (i + 1));
            /* 只数「调用」：`x.createPanel(` / `.createPanel(`，不数方法定义 */
            if (/\.\s*createPanel\s*\(/.test(lines[i])) openers.push(rel + ':' + (i + 1));
        }
    }
    const led = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
    assert.equal(inst.length, led.instantiations_product,
        '台账 instantiations_product 与现场不一致（现场 ' + inst.length + '：' + inst.join(',') + '）');
    assert.equal(openers.length, led.panel_openers,
        '台账 panel_openers 与现场不一致（现场 ' + openers.length + '：' + openers.join(',') + '）');
    /* 外部入口 = `visualizer.createPanel(` 这种「拿实例去开面板」的调用（内部自调用不算入口） */
    const external = files.filter((f) => /\.\s*visualizer\s*\.\s*createPanel\s*\(/.test(f.text))
        .map((f) => f.rel);
    assert.equal(external.length, led.external_entry_sites,
        '台账 external_entry_sites 与现场不一致（现场 ' + external.length + '：' + external.join(',') + '）');
    assert.equal(led.instantiations_product > 0 && led.external_entry_sites === 0, true,
        '本档登记的形态是「有实例、没外部入口」——若哪天接了入口，必须同时改台账与这条期望，不能让它悄悄漂');
    /* 两件事必须分开记：实例存在 ≠ 面板能打开。合起来写成一个「可达」布尔就是本仓反复治的谎报形态。 */
    assert.ok(String(led.entry_note || '').length >= 40, '入口事实必须写清（实例化数 与 打开数 各自意味着什么）');
    assert.ok(/createPanel/.test(led.entry_note), 'entry_note 必须点名「没人调用 createPanel」这条真读数');
});

test('D1 负控制：把 graph 的 empty 面态删掉 ⇒ B1 必须红（面态真的来自源码，不是判据自己编的）', () => {
    const broken = breakOnce(VIZ_SRC, "            this._face(container, 'empty', 'no-graph-data');\n", '', 'O8 删空态面态');
    const { out } = drive(broken, {});
    assert.notEqual(out.renderGraphView.state, 'empty', '删掉面态后面态还成立 ⇒ 判据在自证自己（假绿）');
    assert.equal(out.renderGraphView.state, null, '实：' + out.renderGraphView.state);
});

test('D2 负控制：把 community 的 blocked 改成 empty ⇒ B3 必须红', () => {
    const broken = breakOnce(VIZ_SRC, "this._face(container, 'blocked', 'graph-diffusion-missing');", "this._face(container, 'empty', 'graph-diffusion-missing');", 'O8 blocked 塌成 empty');
    const { out } = drive(broken, {});
    assert.equal(out.renderCommunityView.state, 'empty', '破坏后必须塌成 empty');
    assert.notEqual(out.renderCommunityView.state, 'blocked');
});

test('E1 出生锚：本档不早于 v3.474.0（数值数组比较，不与当版版本号锚点撞车）', () => {
    const BIRTH = [3, 474, 0];
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const cur = String(pkg.version).split('.').map((x) => Number(x));
    const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
    assert.ok(cmp(cur, BIRTH) >= 0, '本档不早于其出生版本，实：' + pkg.version);
});