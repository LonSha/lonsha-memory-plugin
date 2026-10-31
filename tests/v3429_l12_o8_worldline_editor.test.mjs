// tests/v3429_l12_o8_worldline_editor.test.mjs — v3.429.0 L12-O8：世界线跳跃表编辑器 + 实时读数的成对套件
// 主题：`tests/audit/scan_ui_worldline_editor.mjs`（X1~X6）与 `settings-ui.js` /
//   `engine-diagnostic-lines.js` 的编辑器面必须**互相咬住**。
//
//   【问题现场（L12-O8 原文）】
//     v3.425.0 换主键、v3.426.0 修自动推进，两版都把**口径**改对了；但卡作者要落地仍得读
//     CHANGELOG 才知道有五个键，`worldlineJumps` 还只是一个裸 textarea：
//       · 写错一行 ⇒ 闸**静默丢掉**（`_worldlineState` 只给结果，从不告诉人哪一行没生效）；
//       · 「当前纪元到底推成了什么」只在诊断行里，面板里看不到；
//       · v3.426.0 把「把首跳登记在第 1 楼」做成了判据（M3），但那只是**文档里的一条出路**。
//     于是「口径对了」与「作者摸得到」之间差一整块产品面。
//
//   【本档钉什么】
//     A  结构面：编辑器六个挂点 + 原生 textarea 仍绑同一个键（一个键一个控件）+
//        解析单源（`_worldlineState` 的 jumps 必须走 `parseJumpsText`，不得另写一份）+
//        读数机器可读（data-wl-* 五属性）+ 门里 X1~X6 判据名在册
//     B  真仓健康态：门在真仓上 exit 0，且六条读数逐条在场
//     C  六条真源码破坏（每条各配原版对照，防「破坏写死成常量」）：
//        C1 闸不再走 parseJumpsText（把 jumpsSrc 直连旧解析）⇒ X2 必须点名「不是同一段解析」
//        C2 面板读数不再读 `_worldlineState`（改成自己算一份）⇒ X4 必须点名「两套真源」
//        C3 前史缺口被说成「安全」⇒ X5 必须点名
//        C4 坏行不再点名成因 ⇒ X3 必须点名
//        C5 `_worldlineState` 丢掉 startFloor 的自动推进 ⇒ X4 读数与内核双双失效
//        C6 编辑器改格子时顺手写配置（预览写进生效面）⇒ X6 必须点名
//     D  fail-closed：缺 settings-ui.js / 掏空 ⇒ exit 2（没得判 ≠ 通过）
//     E  当版锚（下限形）+ 两处登记面（在役名册 / v3247 接收方台账）+ 锚点单命中 + 工具两向自证
//
//   【边界】
//     本档证明「X1~X6 判据可信 + 编辑器逻辑在 shim 上真跑通」。它**不**证明真浏览器里的
//     排版观感与跨会话存储 —— 那是 shim 的固有边界，门自己也在结论里如实写了。
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
const GATE_REL = path.join('tests', 'audit', 'scan_ui_worldline_editor.mjs');
const GATE = path.join(ROOT, GATE_REL);
const UI_REL = 'settings-ui.js';
const OWNER_REL = 'engine-diagnostic-lines.js';
const HOST_REL = 'index.js';
const TEST_REL = path.join('tests', 'v3429_l12_o8_worldline_editor.test.mjs');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

const UI_SRC = readRoot(UI_REL);
const OWNER_SRC = readRoot(OWNER_REL);
const HOST_SRC = readRoot(HOST_REL);
const GATE_SRC = readRoot(GATE_REL);

const VERSION = (/const VERSION = '([0-9.]+)'/.exec(HOST_SRC) || [])[1] || '0.0.0';
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};

/* ══════════════ 跑门 ══════════════ */
function runGate(root, extraEnv) {
    const env = Object.assign({}, process.env, {
        LONSHA_AUDIT_ROOT: root, LONSHA_AUDIT_FIXTURE: '1',
    }, extraEnv || {});
    const r = spawnSync(process.execPath, [GATE], { cwd: root, env, encoding: 'utf8', timeout: 180000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** 造一棵只含编辑器面所需的合成树（真 settings-ui + 真内核 + 真 shim 来源门）。 */
function mkTree(mutate) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l12o8-'));
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    for (const rel of ['worldline-memory.js', 'engine-diagnostic-lines.js', 'memory-config.js']) {
        fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
    }
    fs.copyFileSync(path.join(ROOT, 'tests', 'audit', 'scan_ui_interaction.mjs'),
        path.join(dir, 'tests', 'audit', 'scan_ui_interaction.mjs'));
    let ui = UI_SRC;
    let owner = OWNER_SRC;
    if (mutate) {
        const got = mutate({ ui: ui, owner: owner });
        if (got && typeof got.ui === 'string') ui = got.ui;
        if (got && typeof got.owner === 'string') owner = got.owner;
    }
    fs.writeFileSync(path.join(dir, UI_REL), ui);
    fs.writeFileSync(path.join(dir, OWNER_REL), owner);
    return dir;
}
const rmTree = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* ignore */ } };

/* ══════════════ A 结构面 ══════════════ */
test('v3429O8 A1. ★★★ 编辑器六个挂点在场，且原生 textarea 仍绑同一个配置键（一个键一个控件）', () => {
    /* 模板里是 `id="ls-wl-…"`（HTML 属性形态），脚本里是 `'#ls-wl-…'`（选择器形态）。
     *   两种形态各查一遍：只查选择器会漏掉「模板没渲染出这个 id」这种真实退化。 */
    for (const id of ['ls-wl-jumps', 'ls-wl-rows', 'ls-wl-readout', 'ls-wl-rejects',
        'ls-wl-add', 'ls-wl-fixfirst', 'ls-wl-jumps-raw']) {
        assert.ok(UI_SRC.includes('id="' + id + '"'), '编辑器挂点未渲染: id="' + id + '"');
    }
    /* 脚本侧取用的是除容器外的六个（容器只是布局壳，没有任何逻辑读它）。 */
    for (const id of ['ls-wl-rows', 'ls-wl-readout', 'ls-wl-rejects',
        'ls-wl-add', 'ls-wl-fixfirst', 'ls-wl-jumps-raw']) {
        assert.ok(UI_SRC.includes("'#" + id + "'"), '编辑器挂点未被取用: #' + id);
    }
    /* ★ 一个键只许一个渲染控件（scan_ui_binding 的 A1）：编辑器是 textarea 的**结构化视图**，
     *   不是第二个写回口。多一个 data-cfg-text="worldlineJumps" 就会 A1 红。 */
    const binds = [...UI_SRC.matchAll(/data-cfg-text="worldlineJumps"/g)].length;
    assert.equal(binds, 1, 'worldlineJumps 的渲染控件必须恰 1 个（实 ' + binds + '）');
    /* 通用保存器仍在（编辑器只改 value，不接管保存）。 */
    assert.ok(UI_SRC.includes("overlay.querySelectorAll('[data-cfg-text]')"),
        '通用 data-cfg-text 收集器必须仍在（编辑器不得另立保存路径）');
    ok('六个挂点在场；worldlineJumps 控件恰 1 个；通用收集器仍在');
});

test('v3429O8 A2. ★★★ 解析单源：闸的 jumps 必须走 parseJumpsText，且导出取数口', () => {
    /* 闸侧：`jumpsSrc` 必须由 parseJumpsText 产出（文本形态），`jumps = jumpsSrc.rows`。 */
    const atSrc = OWNER_SRC.indexOf('const jumpsSrc = (function () {');
    assert.ok(atSrc > 0, '闸里必须有 jumpsSrc 装配点');
    /* 用常量而不是再写一遍字面量：锚点字面量在本档只能出现一次（H5 由 E3 钉）。 */
    const atUse = OWNER_SRC.indexOf(A_SINGLE_SOURCE);
    assert.ok(atUse > atSrc, '文本形态必须走 parseJumpsText（唯一真源）');
    assert.ok(OWNER_SRC.includes('const jumps = jumpsSrc.rows;'), '闸消费的必须是 jumpsSrc.rows');
    /* 解析器本体在现场，且坏行带行号 + 成因（面板要靠它标红）。 */
    assert.ok(OWNER_SRC.includes('function parseJumpsText(raw) {'), '缺 parseJumpsText');
    assert.ok(OWNER_SRC.includes('rejects.push({ line: no, text: s, why:'), '坏行必须带行号与成因');
    /* 取数口导出 + 宿主一行转发（本仓接线范式）。 */
    assert.ok(/worldlineJumpDraft, _materialInventory/.test(OWNER_SRC), '诊断线模块必须导出 worldlineJumpDraft');
    assert.strictEqual((HOST_SRC.match(/worldlineJumpDraft\(\.\.\.args\)/g) || []).length, 1,
        '宿主 worldlineJumpDraft 转发必须恰 1 处');
    /* 取数口**不写配置**：函数体里不得出现任何 `config[...] =` / saveConfig。 */
    const fnAt = OWNER_SRC.indexOf('function worldlineJumpDraft(engine, draft) {');
    const fnEnd = OWNER_SRC.indexOf('    function _worldlineState(engine, opts) {', fnAt);
    assert.ok(fnAt > 0 && fnEnd > fnAt, 'worldlineJumpDraft 函数体边界可定位');
    const body = OWNER_SRC.slice(fnAt, fnEnd);
    assert.ok(!/saveConfig\s*\(/.test(body), '取数口不得调用 saveConfig（预览 ≠ 已生效）');
    assert.ok(!/config\.config\[[^\]]+\]\s*=/.test(body), '取数口不得写配置');
    assert.ok(/writesNothing: true/.test(body), '取数口必须自述「不写任何东西」');
    ok('解析单源（jumpsSrc ⇒ parseJumpsText）；导出 + 宿主一行转发；取数口零写入');
});

test('v3429O8 A3. ★★★ 读数机器可读：五个 data-wl-* 属性 + 缺席态清空读数', () => {
    for (const a of ['data-wl-readout', 'data-wl-epoch', 'data-wl-why', 'data-wl-floor',
        'data-wl-conflict', 'data-wl-rejects']) {
        assert.ok(UI_SRC.includes("'" + a + "'"), '读数属性缺失: ' + a);
    }
    /* 三态标记必须**三串不同**（none / gap / ok，另有 unwired / bad / conflict 三个异常态）。 */
    for (const s of ["stateMark = 'none'", "stateMark = 'gap'", "stateMark = 'ok'"]) {
        assert.ok(UI_SRC.includes(s), '缺三态赋值: ' + s);
    }
    assert.ok(UI_SRC.includes("readEl.setAttribute('data-wl-readout', 'unwired')"),
        '宿主未接线必须是独立一态（不许与「没有跳线」同形）');
    /* 缺席态必须把读数清空：留着旧 epoch 会把「缺席」读成「有数据」。 */
    const unwiredAt = UI_SRC.indexOf("readEl.setAttribute('data-wl-readout', 'unwired')");
    const slice = UI_SRC.slice(unwiredAt, unwiredAt + 900);
    for (const a of ['data-wl-epoch', 'data-wl-why', 'data-wl-floor', 'data-wl-conflict']) {
        assert.ok(slice.includes("setAttribute('" + a + "', '')"), '缺席态未清空 ' + a + '（缺席会读成有数据）');
    }
    ok('六属性齐全；三态标记 + unwired 独立；缺席态清空上一轮读数');
});

test('v3429O8 A4. ★★ 门里 X1~X6 判据名在册，且 fail-closed 两档在场', () => {
    for (const k of ['X1 面自证', 'X2 解析单源', 'X3 结构化编辑真操作',
        'X4 读数与内核 epochAt 一致', 'X5 前史三态不同形', 'X6 保存闭环']) {
        assert.ok(GATE_SRC.includes(k), '门里缺判据段: ' + k);
    }
    assert.ok(GATE_SRC.includes('缺少 settings-ui.js'), '缺 fail-closed：settings-ui 缺失');
    assert.ok(GATE_SRC.includes('设置面板未落 DOM'), '缺 fail-closed：面板未落 DOM');
    assert.ok(GATE_SRC.includes('const FLOOR_UI = FIXTURE_MODE ? 1 : 20000;'), '字节下限必须参数化');
    assert.ok(GATE_SRC.includes("process.exit(2)") || GATE_SRC.includes('drift('), '缺 exit 2 通道');
    ok('六条判据段在册；两档 fail-closed 在场；下限参数化');
});

/* ══════════════ B 真仓健康态 ══════════════ */
test('v3429O8 B1. ★★★ 真仓上门 exit 0，六条读数逐条在场', () => {
    const r = runGate(ROOT);
    assert.equal(r.status, 0, '门在真仓上必须 exit 0，实 ' + r.status + NL + r.out);
    for (const k of ['X1 面：', 'X2 单源：', 'X3 真操作：', 'X4 读数一致：', 'X5 三态：', 'X6 保存闭环：']) {
        assert.ok(r.out.includes(k), '门读数缺段: ' + k + NL + r.out);
    }
    /* X4 必须点名到具体纪元（不是「一致」两个字了事）。 */
    assert.ok(/X4 读数一致：第 \d+ 楼 \S+@\d+/.test(r.out), 'X4 读数必须点名具体纪元' + NL + r.out);
    ok('门 exit 0；六段读数齐；X4 点名到「线@楼层」');
});

/* ══════════════ C 真源码破坏（每条配原版对照） ══════════════ */
/* 破坏锚点：一律逐字取自真源码，且在全档只声明一次（H5 判据纯度由 F1 钉）。 */
const A_SINGLE_SOURCE = 'const parsed = parseJumpsText(raw);';
const A_READOUT_EPOCH = "                    readEl.setAttribute('data-wl-epoch', (adv && cur.lineId && cur.startFloor !== null && cur.startFloor !== undefined) ? (cur.lineId + '@' + cur.startFloor) : '');";
const A_GAP_SAFE = "                    } else if (gap) {";
const A_ADVANCE = 'const at = WM.epochAt(cf, jumps, { layerAlias: layerAlias });';
/* 逐行 input 监听里写回 textarea 的那一处（**24 空格缩进**），它与 render 里的
 *   同名语句（20 空格缩进）缩进不同 ⇒ 锚点由缩进精确定位，恰中 1 次。 */
const A_PREVIEW_WRITE = '                        rawEl.value = serialize();';

/** 跑一次「破坏副本 + 原版副本」，返回两者的门读数（破坏必须真改变行为）。 */
function withBroken(mutate, label, check) {
    const dirB = mkTree(mutate);
    const dirH = mkTree(null);
    try {
        const rB = runGate(dirB);
        const rH = runGate(dirH);
        assert.equal(rH.status, 0, '原版对照必须 exit 0（否则破坏无意义）：' + rH.out);
        check(rB, rH);
    } finally {
        rmTree(dirB);
        rmTree(dirH);
    }
}

test('v3429O8 C1. ★★★ 闸不再走 parseJumpsText ⇒ X2 必须点名「不是同一段解析」', () => {
    withBroken(({ owner }) => ({
        owner: breakSource(owner, A_SINGLE_SOURCE, 'const parsed = { rows: [], rejects: [], warns: [], entries: [] };', '闸绕过解析单源'),
    }), 'C1', (rB) => {
        assert.notEqual(rB.status, 0, '破坏后门必须翻红（实 ' + rB.status + '）' + NL + rB.out);
        assert.ok(/X2/.test(rB.out), '必须点名到 X2：' + rB.out);
        assert.ok(/面板与闸用的不是同一段解析|解析只认了|坏行只点了/.test(rB.out),
            '必须说清「解析不是同一段」：' + rB.out);
    });
    ok('C1：闸绕过单源 ⇒ X2 翻红并点名');
});

test('v3429O8 C2. ★★★ 面板读数改成自己算一份 ⇒ X4 必须点名「两套真源」', () => {
    withBroken(({ ui }) => ({
        ui: breakSource(ui, A_READOUT_EPOCH,
            "                    readEl.setAttribute('data-wl-epoch', (draft.firstFloor !== null && draft.firstFloor !== undefined) ? (String(c.worldlineId || '') + '@' + draft.firstFloor) : '');",
            '面板自算纪元'),
    }), 'C2', (rB) => {
        assert.notEqual(rB.status, 0, '破坏后门必须翻红' + NL + rB.out);
        assert.ok(/X4/.test(rB.out), '必须点名到 X4：' + rB.out);
        assert.ok(/两套真源|不一致/.test(rB.out), '必须说清「两套真源」：' + rB.out);
    });
    ok('C2：面板自算纪元 ⇒ X4 翻红并点名');
});

test('v3429O8 C3. ★★★ 前史缺口被说成「安全」⇒ X5 必须点名', () => {
    withBroken(({ ui }) => ({
        ui: breakSource(ui, A_GAP_SAFE,
            "                    } else if (gap && false) {",
            '前史缺口分支失效（缺口态不再产生）'),
    }), 'C3', (rB) => {
        assert.notEqual(rB.status, 0, '破坏后门必须翻红' + NL + rB.out);
        assert.ok(/X5/.test(rB.out), '必须点名到 X5：' + rB.out);
        /* 缺口分支失效 ⇒ 该档读数落到 ok（把「判不了」读成「已覆盖」＝最坏的那种假安全） */
        assert.ok(/首跳在第 40 楼.*应为 gap|三态不同形/.test(rB.out),
            '必须说清缺口态被吞：' + rB.out);
    });
    ok('C3：缺口分支失效 ⇒ X5 翻红并点名');
});

test('v3429O8 C4. ★★★ 坏行不再点名成因 ⇒ X3 必须点名', () => {
    withBroken(({ owner }) => ({
        owner: breakSource(owner, "                rejects.push({ line: no, text: s, why: '缺层标记（`楼层:` 后面必须写这一层的名字）' });",
            '                rejects.push({});', '坏行丢掉成因'),
    }), 'C4', (rB) => {
        assert.notEqual(rB.status, 0, '破坏后门必须翻红' + NL + rB.out);
        assert.ok(/X2|X3/.test(rB.out), '必须点名到 X2/X3：' + rB.out);
        assert.ok(/成因|缺行号|缺层标记/.test(rB.out), '必须说清「成因丢了」：' + rB.out);
    });
    ok('C4：坏行丢成因 ⇒ X2/X3 翻红并点名');
});

test('v3429O8 C5. ★★★ 自动推进被摘掉 ⇒ X4 读数与内核双双失效', () => {
    withBroken(({ owner }) => ({
        owner: breakSource(owner, A_ADVANCE, 'const at = null;', '摘掉自动推进'),
    }), 'C5', (rB) => {
        /* 破坏后 `epochAt` 不再被调用 ⇒ 当前纪元推不出来 ⇒ X4 要么在 drift 处 exit 2
         *   （内核给不出纪元），要么读数与内核不一致。两种都算「破坏真改变了行为」。 */
        assert.notEqual(rB.status, 0, '破坏后门必须翻红或 fail-closed' + NL + rB.out);
        assert.ok(/epochAt|X4|当前纪元/.test(rB.out), '必须落在 X4/epochAt 面上：' + rB.out);
    });
    ok('C5：摘掉自动推进 ⇒ 门翻红（X4 / fail-closed）');
});

test('v3429O8 C6. ★★★ 编辑器改格子时顺手写配置 ⇒ X6 必须点名「预览写进生效面」', () => {
    /* 破坏形态：把「写 textarea」换成「直接写配置」——这是最容易被误当成「顺手做对」的一步。 */
    withBroken(({ ui }) => ({
        ui: breakSource(ui, A_PREVIEW_WRITE,
            '                        c.worldlineJumps = serialize();',
            '逐行监听里直接写配置'),
    }), 'C6', (rB) => {
        assert.notEqual(rB.status, 0, '破坏后门必须翻红' + NL + rB.out);
        assert.ok(/X6/.test(rB.out), '必须点名到 X6：' + rB.out);
        assert.ok(/预览写进了生效面|没写回 textarea/.test(rB.out), '必须说清「预览写进生效面」：' + rB.out);
    });
    ok('C6：逐行监听里直接写配置 ⇒ X6 翻红并点名');
});

/* ══════════════ D fail-closed ══════════════ */
test('v3429O8 D1. ★★★ 缺 settings-ui.js ⇒ exit 2（没得判 ≠ 通过）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l12o8-miss-'));
    try {
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        fs.copyFileSync(path.join(ROOT, 'engine-diagnostic-lines.js'), path.join(dir, 'engine-diagnostic-lines.js'));
        fs.copyFileSync(path.join(ROOT, 'worldline-memory.js'), path.join(dir, 'worldline-memory.js'));
        fs.copyFileSync(path.join(ROOT, 'tests', 'audit', 'scan_ui_interaction.mjs'),
            path.join(dir, 'tests', 'audit', 'scan_ui_interaction.mjs'));
        const r = runGate(dir);
        assert.equal(r.status, 2, '缺 UI ⇒ 必须 exit 2，实 ' + r.status + NL + r.out);
        assert.ok(/缺少 settings-ui.js/.test(r.out), '必须点名缺什么：' + r.out);
    } finally { rmTree(dir); }
    ok('D1：缺 settings-ui.js ⇒ exit 2 并点名');
});

test('v3429O8 D2. ★★★ 掏空 settings-ui.js ⇒ exit 2（空面不得发合格证）', () => {
    const dir = mkTree(({ ui }) => ({ ui: '// empty' + NL }));
    try {
        const r = runGate(dir);
        assert.equal(r.status, 2, '掏空 ⇒ 必须 exit 2，实 ' + r.status + NL + r.out);
        assert.ok(/面板未落 DOM|输入退化/.test(r.out), '必须说清「没有可驱动的一面」：' + r.out);
    } finally { rmTree(dir); }
    ok('D2：掏空 UI ⇒ exit 2 并说清');
});

/* ══════════════ E 当版锚 + 登记面 + 锚点纯度 + 工具两向自证 ══════════════ */
test('v3429O8 E1. ★★ 当版下界锚：版本 ≥ 3.429.0', () => {
    assert.ok(vnum(VERSION) >= vnum('3.429.0'), 'index.js VERSION 必须 ≥ 3.429.0，实 ' + VERSION);
    const pkg = JSON.parse(readRoot('package.json'));
    assert.ok(vnum(pkg.version) >= vnum('3.429.0'), 'package.json 版本必须 ≥ 3.429.0，实 ' + pkg.version);
    const mf = JSON.parse(readRoot('manifest.json'));
    assert.ok(vnum(mf.version) >= vnum('3.429.0'), 'manifest 版本必须 ≥ 3.429.0，实 ' + mf.version);
    assert.ok(mf.extra_js.includes('worldline-memory.js'), 'worldline-memory.js 必须在册');
    ok('当版锚 ≥ 3.429.0（三处版本一致）');
});

test('v3429O8 E2. ★★ 两处登记面：在役名册 + v3247 接收方台账', () => {
    const cat = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(cat.includes('v3429_l12_o8_worldline_editor.test.mjs'),
        '本档必须进 tests/audit/catalog_reference_consumers.tsv（在役名册）');
    const ledger = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(ledger.includes("'v3429_l12_o8_worldline_editor.test.mjs'"),
        '本档必须进 v3247 的 REGISTRY（否则 _break_kit 取用面无人对账）');
    ok('两处登记面已补');
});

test('v3429O8 E3. ★★★ 破坏锚点在本档各只声明一次（判据纯度 H5）', () => {
    const SELF = readRoot(TEST_REL);
    /* 判据纯度（H5）：锚点字面量在本档只能出现一次（= 它的常量声明处）。
     *   出现两次就是「破坏点」与「判据点」共用同一串字面量 —— 破坏会把判据自己删掉，
     *   负控制就变成对模拟常量断言（假绿三形之一）。 */
    const decls = [
        ['A_SINGLE_SOURCE', A_SINGLE_SOURCE],
        ['A_READOUT_EPOCH', A_READOUT_EPOCH],
        ['A_GAP_SAFE', A_GAP_SAFE],
        ['A_ADVANCE', A_ADVANCE],
        ['A_PREVIEW_WRITE', A_PREVIEW_WRITE],
    ];
    for (const [name, lit] of decls) {
        const n = SELF.split(lit).length - 1;
        assert.strictEqual(n, 1, '锚点 ' + name + ' 在本档应恰出现 1 次（实 ' + n + ' 次）');
        /* 且必须在真源上恰中 1 次，否则破坏会打偏。 */
        assertSingleHit(name === 'A_SINGLE_SOURCE' || name === 'A_ADVANCE' ? OWNER_SRC : UI_SRC, lit, name);
    }
    ok('六枚锚点各只声明一次（H5），且在真源上各恰中 1 次');
});

test('v3429O8 E4. ★★ 工具两向自证：锚点不存在 / 不唯一都必须抛', () => {
    assert.throws(() => assertSingleHit(UI_SRC, '绝对不存在的锚点字符串-xyz', 't-miss'), /拒绝破坏/);
    assert.throws(() => assertSingleHit(UI_SRC, 'data-cfg-text', 't-multi'), /拒绝破坏/);
    assert.throws(() => breakSource(UI_SRC, 'data-cfg-text', 'data-cfg-text', 't-same'), /拒绝破坏/);
    ok('工具两向自证：零命中 / 多命中 / 同值替换均拒绝');
});
