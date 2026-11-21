/**
 * tests/v3481_settings_controls.test.mjs — v3.481.0 设置类部件的守门判据
 *
 * 【本文件要守住什么】
 *   1. ui-form-controls 能在 Node 下 require 且自检全绿（纯函数部分不靠浏览器）。
 *   2. 它**真的被登记**（manifest.extra_js）且**真的被调用**
 *      （ui-data-panels 的 openRowsTable 用它的 renderSeg 做「每页条数」）。
 *   3. **判定顺序纪律**（本仓复发三次的缺陷）：值域/选项非法 与 无 DOM
 *      同时成立时，返回的**理由必须指向值域**。反过来，真机上表现是
 *      「控件不出现」，而真正原因是配置写错了 —— 排查方向会被带偏。
 *   4. **el 对象签名纪律**：第二参传字符串只在真机炸，Node 自检测不到，
 *      所以必须静态读源码判。
 *   5. 纯函数口径不回退：浮点对齐不产生长尾小数、档位表超限截断、
 *      去重按 value 字符串、找不到下标返回 found:false、脏检查不受键序影响。
 *   6. **不许再写死版本**（复发四次的形态）：本文件与 v3480 都只判「六处同版 + x.y.z」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const FC = require('../ui-form-controls.js');
const PANELS = require('../ui-data-panels.js');

/* ── 【0】版本 ─────────────────────────────────────────────────── */
test('【0】版本六处同版，且形态是 x.y.z（不写死字面量）', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const m = /const VERSION = '([0-9.]+)'/.exec(read('index.js'));
    assert.ok(m, 'index.js 里没有 const VERSION');
    const v = m[1];
    assert.ok(/^\d+\.\d+\.\d+$/.test(v), '版本形态应是 x.y.z，实际 ' + v);
    assert.equal(manifest.version, v);
    assert.equal(pkg.version, v);
    for (const rel of ['memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        assert.ok(read(rel).includes("'" + v + "'"), rel + ' 未与 index.js 同版');
    }
});

/* ── 【0b】反向守卫：判据里不许再写死版本号 ─────────────────────── */
test('【0b】反向守卫：v3480 / v3481 判据里不得写死 assert.equal(v, \'3.4xx.0\')', () => {
    // 这个形态已经复发四次：v3478 治过一次、v3479 治过一次、v3480 初版又写死、
    // 本轮 v3480 才改成判形态。所以本条直接扫源码，防止下一轮又抄回去。
    const bad = /assert\.equal\(\s*v\s*,\s*'3\.\d+\.\d+'/;
    for (const rel of ['tests/v3480_ui_density.test.mjs', 'tests/v3481_settings_controls.test.mjs']) {
        // 跳过两类行：① 注释（「这里原来是 …」是解释病因，不是活断言）；
        // ② 本守卫自己的正控制行（它必须包含反例才能证明正则有效）。
        // 不跳过这两类，判据就只能靠删注释变绿 —— 那是判据在惩罚解释。
        const suspect = read(rel).split('\n').filter((ln) => {
            const t = ln.trim();
            if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
            if (/bad\.test\(/.test(ln)) return false;
            return true;
        }).filter((ln) => bad.test(ln));
        assert.equal(suspect.length, 0,
            rel + ' 里又写死了版本号：\n' + suspect.join('\n'));
    }
    // 正控制：正则必须能抓住反例
    assert.equal(bad.test("assert.equal(v, '3.480.0');"), true, '守卫正则失效');
});

/* ── 【1】ui-form-controls 自检全绿 ──────────────────────────────── */
test('【1】ui-form-controls 自检全绿', () => {
    const r = FC.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 51, '自检条数应 ≥51，实际 ' + r.total);
    assert.equal(r.ok, true);
});

/* ── 【2】面板自检仍全绿（接线后条数上升）──────────────────────── */
test('【2】ui-data-panels 自检全绿且条数 ≥29', () => {
    const r = PANELS.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 29, '接线后应 ≥29，实际 ' + r.total);
    const names = r.checks.map((c) => c.name).join('|');
    assert.ok(names.includes('formLib'), '自检里缺 formLib 判据');
});

/* ── 【3】登记与顺序 ─────────────────────────────────────────────── */
test('【3】登记：extra_js 含 ui-form-controls，extra_css 含 lonsha-settings', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const js = manifest.extra_js || [];
    assert.ok(js.includes('ui-form-controls.js'), 'ui-form-controls.js 未登记');
    assert.ok(js.indexOf('ui-form-controls.js') > js.indexOf('ui-kit-core.js'),
        '应排在 ui-kit-core.js 之后（依赖 el）');
    assert.ok(js.indexOf('ui-form-controls.js') > js.indexOf('ui-data-panels.js'),
        '应排在 ui-data-panels.js 之后（面板才消费它）');

    const css = manifest.extra_css || [];
    assert.ok(css.includes('css/lonsha-settings.css'), 'lonsha-settings.css 未登记');
    assert.ok(css.indexOf('css/lonsha-settings.css') > css.indexOf('css/lonsha-design.css'),
        '设置层应排在 token 真源之后');
    assert.ok(read('css/style.css').includes('lonsha-settings.css'), 'style.css 未 @import');
});

/* ── 【4】调用点证据 ─────────────────────────────────────────────── */
test('【4】调用点证据：面板解析 ui-form-controls 并用 renderSeg 做每页条数', () => {
    const src = read('ui-data-panels.js');
    assert.ok(src.includes("safeRequire('./ui-form-controls.js')"), '缺 require 回退');
    assert.ok(src.includes('root.LonShaFormControls'), '缺全局读取（消费审计判零引用）');
    assert.ok(src.includes('F.renderSeg({'), '未真正调用 renderSeg');
    assert.ok(src.includes('options: [20, 50, 100]'), '每页条数档位不是 20/50/100');
    assert.ok(src.includes('pageSize = n;'), '切档后未更新 pageSize');
    assert.ok(src.includes('paintTable();'), '切档后未重画表格');
    // 库缺失时整栏不出现，而不是留一个点了没反应的控件
    assert.ok(/if \(built && built\.ok\)/.test(src), '未按可用性装配每页条数栏');
});

/* ── 【5】负控制 ─────────────────────────────────────────────────── */
test('【5】负控制：删掉 renderSeg 调用后【4】的断言必须变红', () => {
    const stripped = read('ui-data-panels.js')
        .replace(/F\.renderSeg\(\{/g, 'noopSeg({')
        .replace(/pageSize = n;/g, 'nothing();');
    assert.equal(stripped.includes('F.renderSeg({'), false, '负控制失效');
    assert.equal(stripped.includes('pageSize = n;'), false, '负控制失效');
});

/* ── 【6】挂载前置 ───────────────────────────────────────────────── */
test('【6】挂载前置成立', () => {
    assert.ok(/window\.LonShaFormControls\s*=\s*api/.test(read('ui-form-controls.js')),
        '缺 window.LonShaFormControls = api');
    assert.equal(typeof FC.renderSeg, 'function');
    assert.equal(typeof FC.clampStep, 'function');
});

/* ── 【7】el 签名静态守卫 ────────────────────────────────────────── */
test('【7】el 签名纪律：ui-form-controls 不得出现 el(tag, 字符串)', () => {
    const bad = /\bel\(\s*'[a-z]+'\s*,\s*'/;
    const lines = read('ui-form-controls.js').split('\n');
    const hits = [];
    lines.forEach((ln, i) => { if (bad.test(ln)) hits.push((i + 1) + ': ' + ln.trim()); });
    assert.equal(hits.length, 0, '仍有字符串签名调用：\n' + hits.join('\n'));
    // 正/负控制
    assert.equal(bad.test("const x = el('div', 'ls-x');"), true);
    assert.equal(bad.test('const x = el(tag, { class: c });'), false);
});

/* ── 【8】判定顺序：值域优先于环境 ──────────────────────────────── */
test('【8】值域/选项非法时，理由必须指向配置而不是环境', () => {
    // 三件都在 Node（无 DOM）下调用，如果顺序写反，理由会是「没有 document」
    const a = FC.renderSlider({ min: 10, max: 0, step: 1, value: 5 });
    assert.equal(a.ok, false);
    assert.ok(/值域/.test(a.reason), '滑杆理由应指向值域，实际：' + a.reason);
    assert.equal(/document/.test(a.reason), false, '滑杆理由不许退化成环境缺失');

    const b = FC.renderStepper({ min: 0, max: 10, step: 0, value: 5 });
    assert.equal(b.ok, false);
    assert.ok(/值域/.test(b.reason), '步进器理由应指向值域，实际：' + b.reason);

    const c = FC.renderSeg({ options: 'oops', value: 'a' });
    assert.equal(c.ok, false);
    assert.ok(/选项/.test(c.reason), '分段理由应指向选项，实际：' + c.reason);

    // 反向：配置合法时，无 DOM 就该老实说「没有 document」
    const d = FC.renderSlider({ min: 0, max: 10, step: 1, value: 5 });
    assert.equal(d.ok, false);
    assert.ok(/document/.test(d.reason), '配置合法时应报环境缺失，实际：' + d.reason);
});

/* ── 【9】纯函数口径 ────────────────────────────────────────────── */
test('【9】浮点对齐 / 档位截断 / 去重 / found:false / 脏检查不受键序影响', () => {
    // 0.1 步长不许出 0.30000000000000004
    assert.equal(String(FC.clampStep(0.3, { min: 0, max: 1, step: 0.1 }).value), '0.3');
    // 超大档位表要截断并标注
    const g = FC.stepValues({ min: 0, max: 1000000, step: 0.001 });
    assert.equal(g.truncated, true);
    assert.equal(g.values.length, 10000);
    // 去重按 value 字符串：1 与 '1' 是同一项
    assert.equal(FC.normalizeSegments([1, '1', 2]).items.length, 2);
    // 找不到下标不静默给 0
    const idx = FC.segIndexOf('无此项', FC.normalizeSegments(['a', 'b']).items);
    assert.equal(idx.found, false);
    assert.equal(idx.index, -1);
    // 脏检查不受键序影响（JSON.stringify 会误判）
    assert.equal(FC.dirtyDiff({ a: 1, b: 2 }, { b: 2, a: 1 }).count, 0);
    assert.equal(FC.dirtyDiff({ a: NaN }, { a: NaN }).count, 0);
    // 百分比：值域退化返回 null 而不是 0
    assert.equal(FC.percentOf(5, 5, 5), null);
    // 文本超长如实报，不截断
    const t = FC.validateText({ value: 'abcdef', maxLength: 4 });
    assert.equal(t.over, true);
    assert.equal(t.value, 'abcdef');
});

/* ── 【10】CSS 纪律 ─────────────────────────────────────────────── */
test('【10】设置样式层只消费 token、含双降级、且有窄屏与触摸目标', () => {
    const css = read('css/lonsha-settings.css');
    const defs = css.match(/^\s*--ls-[a-z0-9-]+\s*:/gm) || [];
    assert.equal(defs.length, 0, '本文件不得重声明 token，实际 ' + defs.length + ' 处');
    assert.ok(css.includes('--ls-'), '应消费 --ls-* token');
    assert.ok(/prefers-reduced-motion/.test(css), '缺减少动效降级');
    assert.ok(/@media\s+print/.test(css), '缺打印降级');
    assert.ok(/safe-area-inset-bottom/.test(css), '缺安全区适配（底部保存条会被手势条压住）');
    assert.ok(/max-width: 480px/.test(css), '缺窄屏适配');
    // 触摸目标：开关必须有 44px 热区（48×28 视觉 + 外扩）
    assert.ok(/\.ls-switch::after/.test(css), '开关缺触摸热区外扩');
    // 输入框字号不许低于 16px（iOS 聚焦会放大页面）
    assert.ok(/font-size: 16px/.test(css), '输入框缺 16px 下限');
});

/* ── 【11】占比不回落 ───────────────────────────────────────────── */
test('【11】呈现层占比不得回落到 15.5% 以下', async () => {
    const { execFileSync } = await import('node:child_process');
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tests/audit/ui_ratio.mjs'), '--json'], {
        cwd: ROOT, encoding: 'utf8',
    });
    const j = JSON.parse(out.slice(out.indexOf('{')));
    assert.ok(j.ratio >= 0.155, '占比回落：' + (j.ratio * 100).toFixed(1) + '%（基线 15.5%）');
    const uiNames = j.uiFiles.map(([n]) => n);
    assert.ok(uiNames.includes('ui-form-controls.js'), 'ui-form-controls.js 未计入 UI 侧');
    const cssNames = j.cssFiles.map(([n]) => n);
    assert.ok(cssNames.includes('lonsha-settings.css'), 'lonsha-settings.css 未计入');
});