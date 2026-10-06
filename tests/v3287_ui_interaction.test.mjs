// tests/v3287_ui_interaction.test.mjs — v3.287.0 O2：真实用户操作面门的成对套件
// 主题：`tests/audit/scan_ui_interaction.mjs` 的每条判据都必须**真能翻红** ——
//   一个「永远 exit 0」的交互门同样是绿的（而且更坏：它让人以为「操作面验过了」），
//   所以它必须有合成仓负控制，且负控制必须是**真源码破坏**而非模拟常量。
//
//   【本档钉什么】
//     A  结构面：扫描器在位 + 夹具模式/改根 + 面下限常量在场 + 边界声明在场
//     B  shim 忠实性（本门存活的前提）：若 shim 与真实浏览器偏差，门会报**假结论** ——
//        本轮实测已踩到五处，故把三处结构性偏差各钉一条：
//        B1 checkbox 原生 checked 翻转（不模拟 ⇒ 真源写法被误判「点不动」）
//        B2 `<details>/<summary>` 原生展开 + isVisible 的 details 语义（不模拟 ⇒ 展开面全假红）
//        B3 `>` 子组合器支持（不支持 ⇒ `details > summary` 恒 0，报出「本仓无折叠头」的**假结论**）
//     C  合成仓逐条：V1 disabled / V2 写回不落地 / V3 滑块不写回 / V4 输入不 trim
//        / V5 保存不落地 / V6 重开不保留 / V9 枚举塌陷 各自 ⇒ 对应退出码且点名到那条
//     D  fail-closed：settings-ui.js 缺失 / 掏空 ⇒ exit 2（没得判 ≠ 通过）
//     E  健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）
//     F  判据纯度 H5：破坏锚点字面量各只有 1 个持有常量 + 真源上单命中
//     G  真源码破坏：摘掉任一条判据 ⇒ 本档同一条合成仓用例不再翻红（判据不是装饰）
//     H  自防护 + 当版锚点 + 三处登记面已补
//
// 边界（与本门结论一起读，同 O2 验收原文的诚实要求）：
//   本档只证明**交互逻辑门本身是可信的**（判据能翻红、shim 忠实、fail-closed）。
//   它**不证明**真浏览器面已覆盖 —— 真宿主侧交付者环境无浏览器可选，如实登记未执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCAN_REL = path.join('tests', 'audit', 'scan_ui_interaction.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const UI_REL = 'settings-ui.js';
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有；全部单行） ---- */
const A_SHIM_CHECKED = "            if (this.tagName === 'input' && String(this._attrs.type || '').toLowerCase() === 'checkbox') {";
const A_SHIM_DETAILS = "            if (this.tagName === 'summary' && this.parentNode && this.parentNode.tagName === 'details') {";
const A_SHIM_VISIBLE = "        if (p.tagName === 'details' && !p.hasAttribute('open')) {";
const A_SHIM_COMB = "        if (t === '>') { pendingComb = '>'; continue; }";
const A_V1_DISABLED = "            DEFECTS.push('V1 有 ' + disabled.length + ' 个具名控件带 disabled（有 DOM ≠ 可操作）：'";
const A_V2_WRITEBACK = "                    DEFECTS.push('V2 复选框 ' + key + ' 点击并保存后配置**没变**（' + before + ' → ' + after";
const A_V2_CLOSED = "                    DEFECTS.push('V2 点保存后面板未关闭（closeOverlay 未生效）—— 与真源「保存即关闭」语义不符');";
const A_V3 = "                    DEFECTS.push('V3 滑块 ' + key + ' 保存后配置为 ' + got + '，应为 ' + want";
const A_V4 = "                    DEFECTS.push('V4 输入控件 ' + key + ' 保存后为 ' + JSON.stringify(got)";
const A_V5 = "                DEFECTS.push('V5 点击 #ls-save 后 config.saveConfig() **未被调用**（保存没落地）');";
const A_V6_BOX = "                DEFECTS.push('V6 重开后复选框 ' + k + ' 的 DOM 状态（' + el.checked + '）与已保存值（' + v + '）不符 ⇒ 重开丢配置');";
const A_V7 = "                DEFECTS.push('V7 展开：' + cands.length + ' 个真折叠目标点击后可见性**全都未变**'";
const A_V8 = "            DEFECTS.push('V8 窄屏：某宽度下控件数为 0（宽=' + wc + ' 窄=' + nc + '）');";
const A_V9 = "            drift('具名控件只有 ' + (boxes.length + sliders.length) + ' 个（下限 ' + MIN_CTRL + '）⇒ 枚举塌陷，拒绝给结论');";
const A_FLOOR_MISS = "if (!fs.existsSync(UI)) drift('缺少 settings-ui.js ⇒ 没有可操作的面，拒绝给结论');";
const A_FLOOR_LEN = "if (ui.length < FLOOR_UI) drift('settings-ui.js 只有 ' + ui.length + ' 字节（下限 ' + FLOOR_UI + '）⇒ 输入退化，拒绝给结论');";
const A_SELF_HEAD = 'const SCAN_REL = ';
const A_V2_NO_SAVE = "                DEFECTS.push('V2 复选框 ' + key + '：设置面板无 #ls-save ⇒ 点了也没有写回路径');";

/* ══════════════ 跑扫描器 ══════════════ */
/** 合成仓一律走**夹具模式**（`LONSHA_AUDIT_FIXTURE=1`）：面下限退到 1，
 *  否则十几条用例会全部先被「字节下限」拦成 exit 2，判据根本到不了。
 *  下限本身仍由 D 组（掏空 ⇒ exit 2）与 A 组（下限常量在场）钉住。 */
function runScan(root, extraEnv = {}) {
    const env = Object.assign({}, process.env, {
        LONSHA_AUDIT_ROOT: root, LONSHA_AUDIT_FIXTURE: '1',
    }, extraEnv);
    const r = spawnSync('node', [SCAN], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
    return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function runScanSrc(srcText, root, extraEnv = {}) {
    const tmp = path.join(root, '_probe_scan.mjs');
    fs.writeFileSync(tmp, srcText, 'utf8');
    const env = Object.assign({}, process.env, {
        LONSHA_AUDIT_ROOT: root, LONSHA_AUDIT_FIXTURE: '1',
    }, extraEnv);
    const r = spawnSync('node', [tmp], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
    return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/** 非夹具模式跑一次（D 组验真下限用）。 */
function runScanStrict(root) {
    const env = Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: root });
    delete env.LONSHA_AUDIT_FIXTURE;
    const r = spawnSync('node', [SCAN], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
    return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ══════════════ 合成仓：造一个「能跑通全套 V 判据」的最小 settings-ui.js ══════════════ */
/** 造的 UI 必须满足本门的所有真实期待：
 *   · 有 `showSettingsPanel` 入口、面板 id、`#ls-save`
 *   · checkbox / range / textarea 三类具名控件
 *   · 保存 handler 收集三类控件写回 `engine.config.config` 并调 `saveConfig()`
 *   · 保存后 remove 面板（`closeOverlay` 语义）
 *   · 一个原生 `<details><summary>`
 *   · 渲染初值取 `c.<key> ?? 默认值`（重开保留面靠它）
 *  这才能让「健康仓 exit 0」成立；任一处坏掉由负控制逐条钉。 */
function mkUi(st = {}) {
    const P = st.UI_PREFIX !== undefined ? st.UI_PREFIX :
        `(function(){
  const plugin = window.LonShaMemory;
  const c = plugin.engine.config.config;
`;
    const SAVE_BODY = st.saveBody !== undefined ? st.saveBody : `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { c[el.dataset.cfg] = el.checked; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                window.LonShaMemory.engine.config.saveConfig();
                overlay.remove();`;

    return P + `
  plugin.showSettingsPanel = function() {
    const old = document.getElementById('lonsha-settings-overlay');
    if (old) old.remove();
    const overlay = document.createElement('div');
    overlay.id = 'lonsha-settings-overlay';
    overlay.innerHTML =
        '<div class="ls-group">' +
        '<input type="checkbox" data-cfg="enabled" ' + (c.enabled ? 'checked' : '') + '>' +
        '<input type="checkbox" data-cfg="debugMode" ' + (c.debugMode ? 'checked' : '') + '>' +
        '<input type="checkbox" data-cfg="autoSave" ' + (c.autoSave ? 'checked' : '') + '>' +
        '<input type="range" step="1" value="' + (c.vectorTopK == null ? 5 : c.vectorTopK) + '" data-cfg-num="vectorTopK">' +
        '<input type="range" step="0.1" value="' + (c.hybridAlpha == null ? 0.7 : c.hybridAlpha) + '" data-cfg-num="hybridAlpha">' +
        '<textarea data-cfg-text="smartTriggerPatterns">' + (c.smartTriggerPatterns || '') + '</textarea>' +
        '<details id="ls-advanced"><summary>高级</summary><div class="ls-hint">内部参数</div></details>' +
        '<button id="ls-save">save</button>' +
        '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#ls-save').addEventListener('click', () => {${SAVE_BODY}
    });
  };
})();
`;
}

function mkRepo(mut = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-uiint-'));
    const st = { ui: null };
    /* 形态归一：调用处既可传「改状态的函数」，也可直接传「一个状态对象」——
     *   （首版只支持前者，而 B/C/E/G 组都传了对象 ⇒ 全部 `mut is not a function` 假红。） */
    if (typeof mut === 'function') mut(st);
    else if (mut && typeof mut === 'object') Object.assign(st, mut);
    else throw new TypeError('mkRepo 的 mut 必须是函数或对象，收到 ' + typeof mut);
    const ui = st.ui !== undefined && st.ui !== null ? st.ui : mkUi(st);
    fs.writeFileSync(path.join(dir, UI_REL), ui, 'utf8');
    return dir;
}
function withRepo(mut, fn) {
    /* 支持两种调用形态：withRepo(fn) 与 withRepo(mut, fn)。 */
    if (fn === undefined && typeof mut === 'function') { fn = mut; mut = {}; }
    const dir = mkRepo(mut);
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ══════════════ A 结构面 ══════════════ */
test('v3287 A. 结构面：扫描器在位 + 夹具/改根出口 + 面下限 + 边界声明', () => {
    const s = scanSrc();
    assert.ok(fs.existsSync(SCAN), '扫描器必须在位');
    assert.ok(s.includes("process.env.LONSHA_AUDIT_FIXTURE"), '须有夹具模式出口');
    assert.ok(s.includes("process.env.LONSHA_AUDIT_ROOT"), '须有改根出口（合成仓才能跑）');
    assert.ok(s.includes('MIN_CTRL'), '须有面下限常量');
    assert.ok(s.includes('未执行不算通过'), '须如实声明「真宿主面未执行」这一边界');
    assert.ok(s.includes('最小 DOM shim'), '须点名本门跑在 shim 上而非真浏览器');
    assert.ok(s.length > 20000, '扫描器本体须有规模（实测 ' + s.length + ' 字节）');
    ok('结构面齐备');
});

/* ══════════════ B shim 忠实性（本门存活前提）══════════════ */
test('v3287 B1. shim 必须模拟 checkbox 原生 checked 翻转（否则报假结论）', () => {
    const s = scanSrc();
    assertSingleHit(s, A_SHIM_CHECKED, 'B1 锚点');
    /* 真源码破坏：摘掉原生翻转 ⇒ 用一份「依赖原生翻转」的 UI 去跑，必须**不再通过**。 */
    const broken = breakSource(s, A_SHIM_CHECKED, '            if (false) {', 'v3287_b1');
    /* 该 UI 的 handler 读 e.target.checked（真实浏览器里这是新值）。 */
    const ui = mkUi({ saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { c[el.dataset.cfg] = el.checked; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                window.LonShaMemory.engine.config.saveConfig();
                overlay.remove();` });
    withRepo({ ui }, (dir) => {
        const good = runScanSrc(s, dir);
        assert.equal(good.rc, 0, '原版 shim 下该 UI 应通过：' + good.out.slice(-300));
        const bad = runScanSrc(broken, dir);
        assert.notEqual(bad.rc, 0, '摘掉原生 checked 翻转后，本门必须能翻红（否则该模拟是装饰）');
    });
    ok('B1 shim 原生 checked 翻转是真判据');
});

test('v3287 B2. shim 必须模拟 details 原生展开 + isVisible 语义（否则展开面全假红）', () => {
    const s = scanSrc();
    assertSingleHit(s, A_SHIM_DETAILS, 'B2a 锚点');
    assertSingleHit(s, A_SHIM_VISIBLE, 'B2b 锚点');
    const broken = breakSource(s, A_SHIM_DETAILS, '            if (false) {', 'v3287_b2');
    withRepo({}, (dir) => {
        const good = runScanSrc(s, dir);
        assert.equal(good.rc, 0, '原版 shim 下应通过：' + good.out.slice(-300));
        assert.ok(/V7 展开：1\/1/.test(good.out), 'V7 须真读到 1 个折叠目标（不是「候选 0 个」）');
        const bad = runScanSrc(broken, dir);
        assert.notEqual(bad.rc, 0, '摘掉 details 原生展开后，V7 必须翻红');
        assert.ok(/V7/.test(bad.out), '翻红须点名 V7');
    });
    ok('B2 details 原生语义是真判据');
});

test('v3287 B3. shim 必须支持 `>` 子组合器（不支持则报出「本仓无折叠头」的假结论）', () => {
    const s = scanSrc();
    assertSingleHit(s, A_SHIM_COMB, 'B3 锚点');
    const broken = breakSource(s, A_SHIM_COMB, '        if (false) { pendingComb = null; }', 'v3287_b3');
    withRepo({}, (dir) => {
        const good = runScanSrc(s, dir);
        assert.ok(/V7 展开：1\/1/.test(good.out), '原版须真命中折叠目标');
        assert.ok(!/候选 0 个/.test(good.out), '原版不得报「候选 0 个」（那正是本处要防的假结论）');
        const bad = runScanSrc(broken, dir);
        assert.ok(/候选 0 个/.test(bad.out),
            '摘掉子组合器支持后，必须复现「候选中 0 个」这一假结论（证明 B3 钉的是真机制）');
    });
    ok('B3 子组合器支持是真判据');
});

/* ══════════════ C 合成仓逐条翻红 ══════════════ */
test('v3287 C1. V1 disabled 控件 ⇒ exit 1 且点名', () => {
    const ui = mkUi({ UI_PREFIX: undefined });
    withRepo({ ui: ui.replace('<input type="range" step="1"', '<input type="range" disabled step="1"') }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 1, '带 disabled 控件应 exit 1：' + r.out.slice(-300));
        assert.ok(/V1 有 1 个具名控件带 disabled/.test(r.out), '须点名 V1 与数量');
    });
    ok('C1 翻红');
});

test('v3287 C2. V2 保存后写回不落地 ⇒ exit 1 且点名', () => {
    /* 保存 handler 收 checkbox 但**写进死变量**（不写回 config）。 */
    const ui = mkUi({ saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { const dead = el.checked; void dead; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                window.LonShaMemory.engine.config.saveConfig();
                overlay.remove();` });
    withRepo({ ui }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 1, '写回不落地应 exit 1：' + r.out.slice(-300));
        assert.ok(/V2 复选框 .* 点击并保存后配置\*\*没变/.test(r.out), '须点名 V2 与「没变」');
    });
    ok('C2 翻红');
});

test('v3287 C3. V3 滑块值不写回 ⇒ exit 1 且点名', () => {
    const ui = mkUi({ saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { c[el.dataset.cfg] = el.checked; });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                window.LonShaMemory.engine.config.saveConfig();
                overlay.remove();` });
    withRepo({ ui }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 1, '滑块不写回应 exit 1：' + r.out.slice(-300));
        assert.ok(/V3 滑块 vectorTopK 保存后配置为/.test(r.out), '须点名 V3 与控件名');
    });
    ok('C3 翻红');
});

test('v3287 C4. V4 长文本不 trim ⇒ exit 1 且点名', () => {
    const ui = mkUi({ saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { c[el.dataset.cfg] = el.checked; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value; });
                window.LonShaMemory.engine.config.saveConfig();
                overlay.remove();` });
    withRepo({ ui }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 1, '未 trim 应 exit 1：' + r.out.slice(-300));
        assert.ok(/V4 输入控件 /.test(r.out), '须点名 V4');
    });
    ok('C4 翻红');
});

test('v3287 C5. V5 保存不落地（不调 saveConfig）⇒ exit 1 且点名', () => {
    const ui = mkUi({ saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { c[el.dataset.cfg] = el.checked; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                overlay.remove();` });
    withRepo({ ui }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 1, '不落盘应 exit 1：' + r.out.slice(-300));
        assert.ok(/V5 点击 #ls-save 后 config\.saveConfig\(\) \*\*未被调用\*\*/.test(r.out), '须点名 V5');
    });
    ok('C5 翻红');
});

test('v3287 C6. V6 重开不保留（渲染不读配置）⇒ exit 1 且点名', () => {
    /* 渲染初值写死，不读 c.<key> ⇒ 重开后 DOM 不反映已保存值。 */
    const ui = mkUi({ UI_PREFIX: `(function(){
  const plugin = window.LonShaMemory;
  const c = plugin.engine.config.config;
` }).replace(/\(c\.enabled \? 'checked' : ''\)/, "'checked'")
        .replace(/\(c\.debugMode \? 'checked' : ''\)/, "''")
        .replace(/\(c\.vectorTopK == null \? 5 : c\.vectorTopK\)/, '5');
    withRepo({ ui }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 1, '重开丢配置应 exit 1：' + r.out.slice(-400));
        assert.ok(/V6 重开后/.test(r.out), '须点名 V6');
    });
    ok('C6 翻红');
});

test('v3287 C7. V9 枚举塌陷（控件不足）⇒ exit 2', () => {
    const tiny = `(function(){
  const plugin = window.LonShaMemory;
  const c = plugin.engine.config.config;
  plugin.showSettingsPanel = function() {
    const o = document.createElement('div');
    o.id = 'lonsha-settings-overlay';
    o.innerHTML = '<button id="ls-save">s</button>';
    document.body.appendChild(o);
  };
})();
` + '/* filler '.padEnd(21000, 'x') + ' */';
    withRepo({ ui: tiny }, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 2, '控件枚举塌陷应 exit 2（结构漂移）：' + r.out.slice(-300));
        assert.ok(/枚举塌陷/.test(r.out), '须点名枚举塌陷');
    });
    ok('C7 翻红（exit 2）');
});

/* ══════════════ D fail-closed ══════════════ */
test('v3287 D. fail-closed：settings-ui.js 缺失 / 掏空 ⇒ exit 2', () => {
    const empty = mkdtemp('lonsha-uiint-nofile-');
    try {
        const r = runScan(empty);
        assert.equal(r.rc, 2, '缺 settings-ui.js 应 exit 2：' + r.out.slice(-200));
        assert.ok(/缺少 settings-ui\.js/.test(r.out), '须点名缺文件');
    } finally { fs.rmSync(empty, { recursive: true, force: true }); }

    withRepo({ ui: '// gutted' }, (dir) => {
        const r = runScanStrict(dir);
        assert.equal(r.rc, 2, '掏空应 exit 2：' + r.out.slice(-200));
        assert.ok(/下限 20000/.test(r.out), '须点名面下限');
    });
    ok('D fail-closed 成立');
});

function mkdtemp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

/* ══════════════ E 健康仓 exit 0 ══════════════ */
test('v3287 E. 健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）', () => {
    withRepo({}, (dir) => {
        const r = runScan(dir);
        assert.equal(r.rc, 0, '健康仓必须通过：' + r.out.slice(-400));
        assert.ok(/V2 复选框真操作/.test(r.out), '须有 V2 读数');
        assert.ok(/V3 滑块真操作/.test(r.out), '须有 V3 读数');
        assert.ok(/V6 重开保留/.test(r.out), '须有 V6 读数');
        assert.ok(/V7 展开：1\/1/.test(r.out), '须有 V7 真读数（1/1 而非 0）');
    });
    ok('E 健康仓通过');
});

/* ══════════════ F 判据纯度 H5 ══════════════ */
test('v3287 F. 判据纯度：破坏锚点逐条单命中（锚点串在本档只声明一次）', () => {
    const s = scanSrc();
    const anchors = {
        A_SHIM_CHECKED, A_SHIM_DETAILS, A_SHIM_VISIBLE, A_SHIM_COMB,
        A_V1_DISABLED, A_V2_WRITEBACK, A_V2_CLOSED, A_V3, A_V4, A_V5, A_V6_BOX,
        A_V7, A_V8, A_V9, A_FLOOR_MISS, A_FLOOR_LEN, A_V2_NO_SAVE,
    };
    for (const [k, a] of Object.entries(anchors)) {
        assertSingleHit(s, a, k);
    }
    ok(Object.keys(anchors).length + ' 个锚点在真源上各单命中');
});

/* ══════════════ G 真源码破坏 ⇒ 判据不是装饰 ══════════════ */
test('v3287 G. 真源码破坏：摘掉判据 ⇒ 对应合成仓用例不再翻红', () => {
    const s = scanSrc();
    const cases = [
        ['A_V2_WRITEBACK', A_V2_WRITEBACK, '            if (false) DEFECTS.push(\'\');',
            { saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { const dead = el.checked; void dead; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                window.LonShaMemory.engine.config.saveConfig();
                overlay.remove();` }, /V2 复选框 [^\n]*点击并保存后配置/],
        ['A_V5', A_V5, '                if (false) DEFECTS.push(\'\');',
            { saveBody: `
                overlay.querySelectorAll('[data-cfg]').forEach(el => { c[el.dataset.cfg] = el.checked; });
                overlay.querySelectorAll('[data-cfg-num]').forEach(el => { c[el.dataset.cfgNum] = parseInt(el.value, 10); });
                overlay.querySelectorAll('[data-cfg-text]').forEach(el => { c[el.dataset.cfgText] = el.value.trim(); });
                overlay.remove();` }, /V5 点击/],
    ];
    for (const [label, anchor, repl, st, keyed] of cases) {
        const broken = breakSource(s, anchor, repl, 'v3287_' + label);
        withRepo(st, (dir) => {
            const good = runScanSrc(s, dir);
            assert.notEqual(good.rc, 0, label + '：原版在该合成仓上必须翻红（否则用例选错了）');
            assert.ok(keyed.test(good.out), label + '：原版须点名该判据');
            const bad = runScanSrc(broken, dir);
            assert.ok(!keyed.test(bad.out),
                label + '：摘掉判据后该点名必须消失（判据不能是装饰）');
        });
    }
    /* 面下限单独走非夹具模式（夹具模式下下限本就是 1，破坏掉也看不出来）。 */
    const floorBroken = breakSource(s, A_FLOOR_LEN, '', 'v3287_floor');
    withRepo({ ui: '// gutted' }, (dir) => {
        const good = runScanStrict(dir);
        assert.equal(good.rc, 2, '原版：掏空须 exit 2');
        assert.ok(/下限 20000/.test(good.out), '原版须点名下限');
        const tmp = path.join(dir, '_floor_probe.mjs');
        fs.writeFileSync(tmp, floorBroken, 'utf8');
        const env = Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: dir });
        delete env.LONSHA_AUDIT_FIXTURE;
        const r = spawnSync('node', [tmp], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
        const out = (r.stdout || '') + (r.stderr || '');
        assert.ok(!/下限 20000/.test(out),
            'A_FLOOR_LEN：摘掉下限后该点名必须消失（判据不能是装饰）');
    });
    ok('G 三条判据经真源码破坏验证非装饰');
});

/* ══════════════ H 自防护 + 当版锚点 + 登记面 ══════════════ */
test('v3287 H1. 当版锚点：套件与包版本同源（V4 数得到）', () => {
    /* vnum 必须是**数值**形态：assert.equal 是严格相等，返回数组的 split('.').map(Number)
     * 会让 [3,287,0] === [3,287,0] 恒假（引用不等）—— 首版 H1 即因此常红。
     * 版本守卫 V4 的计数口径也是数值比较，两处须同形。 */
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    const pkg = JSON.parse(readRoot('package.json')).version;
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    assert.ok(self.includes(A_SELF_HEAD), '自防护：套件须自持扫描器路径常量');
    assert.ok(self.includes('assertSingleHit'), '自防护：须用统一锚点校验器');
    assert.equal(vnum('3.287.0'), vnum(pkg), '当版锚点须与 package.json 同源（V4 计数形态）');
    ok('当版锚点 ' + pkg);
});

test('v3287 H2. 三处登记面已补（探针矩阵 / 在役测试面名册 / v3247 接收方台账）', () => {
    const matrix = readRoot(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv'));
    assert.ok(/scan_ui_interaction\.mjs/.test(matrix), '探针矩阵须登记本门');
    const roster = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(/v3287_ui_interaction\.test\.mjs/.test(roster), '在役测试面名册须登记本套件');
    const reg = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(/v3287_ui_interaction\.test\.mjs/.test(reg), 'v3247 接收方台账须登记本套件');
    ok('三处登记面已补');
});