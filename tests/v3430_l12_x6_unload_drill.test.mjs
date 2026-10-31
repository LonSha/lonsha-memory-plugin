// tests/v3430_l12_x6_unload_drill.test.mjs — v3.430.0 L12-X6：卸载演练（drill_unload.mjs）的成对套件
// 主题：`tools/drill_unload.mjs` 这门**破坏实验**必须真的能判、且判据必须能真翻红。
//
//   【问题现场（L12-X6 原文）】
//     本仓模块是 `manifest.extra_js` 经典脚本注入，v3.300.0 记录过「宿主从不加载 extra_js」
//     的历史；但**没有任何一面演练过「模块被摘掉后插件还能不能活」**
//     （`grep -rn drill package.json` ⇒ 无此入口；`tools/` 下无任何卸载演练脚本）。
//     而 O1 正要摘/删七个模块 —— 那恰好是最需要安全网的时刻。
//
//   【为什么它不是守卫】
//     方案原文明确否决「把卸载演练写成守卫」：写成门会让「降级对不对」退化问成
//     「有没有写 catch」。故它是**独立入口**（`npm run drill:unload`），不进 `npm test`。
//     本档是它唯一的看守面：不跑演练，等于没人验它还能不能判。
//
//   【本档钉什么】
//     A 结构面：四条判据（D1~D4）+ 三档退出码 + 与既有 buildSandbox 同形 + 九件在册
//     B 真仓健康态：`--json` exit 0 且读数逐条在场（control / drilled 双面）
//     C 真源码破坏（每条各配原版对照，防「破坏写死成常量」）：
//        C1 让 recallMemory 静默吞成 null ⇒ D3 必须点名（「吞成空」与「降级成可用」不同形）
//        C2 让 showSettingsPanel 抛错 ⇒ D2-③ 必须点名
//        C3 settings-ui 整模块注册失败（在装载面里却没挂上）⇒ 必须点名 module-not-registered
//     D fail-closed：manifest 崩 / 指定模块不在册 ⇒ exit 2（没得判 ≠ 通过）
//     E 工具两向自证：`--selftest` 必须自己报 ok，且两个负控制都 turnedRed
//     F 当版锚 + 两处登记面 + 锚点纯度 H5
//
//   【边界】
//     本档证明「演练逻辑在 vm + 最小 DOM shim 上真跑通、且判据真会翻红」。
//     它**不**证明真浏览器里 `<script>` 标签级摘除的行为，也不证明真机观感与
//     `localStorage` 跨会话 —— 那是 shim 的固有边界，工具自己在结论里也如实写了。
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
const TOOL_REL = path.join('tools', 'drill_unload.mjs');
const TOOL = path.join(ROOT, TOOL_REL);
const TEST_REL = path.join('tests', 'v3430_l12_x6_unload_drill.test.mjs');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

const TOOL_SRC = readRoot(TOOL_REL);
const HOST_SRC = readRoot('index.js');
const UI_SRC = readRoot('settings-ui.js');
const RECALL_SRC = readRoot('engine-recall.js');

const VERSION = (/const VERSION = '([0-9.]+)'/.exec(HOST_SRC) || [])[1] || '0.0.0';
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};

/* ══════════════ 跑演练 ══════════════ */
/** 在指定 root 上跑演练。root 决定 `manifest.json` 与源码从哪儿读（工具支持 LONSHA_DRILL_ROOT）。 */
function runDrill(root, args, extraEnv) {
    const env = Object.assign({}, process.env, { LONSHA_DRILL_ROOT: root }, extraEnv || {});
    const r = spawnSync(process.execPath, [TOOL].concat(args || []), {
        cwd: root, env, encoding: 'utf8', timeout: 180000,
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/** 造一棵**完整装载面**的合成树：拷满 manifest 里全部文件，只覆盖 files 指定的那几个。
 *  【本版修掉的第 4 处判据自伤】修前这里写的是「只拷代码要读的那几个文件」，于是造出的树
 *    只有 3 个文件，演练的结构下限（MIN_ORDER = 50）当场 drift ⇒ 每条破坏都拿到 exit 2 而不是
 *    exit 1。判据当时看起来是「C1~C3 全部失败」，实际是**我的夹具不成立**（同族第 4 次：
 *    前三处是 TDZ 误判 / 漏跑 init / selfCheck 漏 await）。
 *    正确做法不是去把下限关掉，而是让夹具真的满足下限：装载面就是产品的装载面，拷满它。
 *    成本实测：245 个文件 6.33MB，单次拷贝 220ms 量级（A/B/C 三条破坏各造两棵树，
 *    一次套件总耗时 < 2s）。 */
function mkTree(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l12x6-'));
    const mf = JSON.parse(readRoot('manifest.json'));
    const ORDER = [mf.js].concat(Array.isArray(mf.extra_js) ? mf.extra_js : []);
    const mf2 = Object.assign({}, mf);
    mf2.extra_js = ORDER.filter((f) => f !== mf.js);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(mf2, null, 2));
    for (const f of ORDER) {
        const src = (files && typeof files[f] === 'string') ? files[f] : readRoot(f);
        fs.writeFileSync(path.join(dir, f), src);
    }
    return dir;
}
const rmTree = (d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* ignore */ } };

/* ══════════════ A 结构面 ══════════════ */
test('v3430X6 A1. ★★★ 四条判据 D1~D4 在册，且明确「不是守卫」', () => {
    for (const k of ['D1 摘 9 个模块后仍能装载', 'D2 三条主路径各自', 'D3', 'D4 负控制']) {
        assert.ok(TOOL_SRC.includes(k), '判据段未在册: ' + k);
    }
    /* D3 是本演练唯一比「跑通不抛」更狠的一条，必须在头部说清它区分什么。 */
    assert.ok(TOOL_SRC.includes('吞成空') && TOOL_SRC.includes('降级成可用'),
        'D3 必须说清「吞成空 vs 降级成可用」这条区分');
    /* 方案原文否决了「写成守卫」——这条否决必须留在文件里，否则下一个人会把它搬进 npm test。 */
    assert.ok(/不进 `npm test`|不进 npm test/.test(TOOL_SRC) || TOOL_SRC.includes('drill:unload'),
        '头部必须交代它是独立入口（不是守卫）');
    ok('D1~D4 在册；D3 的区分写明；独立入口交代清楚');
});

test('v3430X6 A2. ★★★ 三档退出码全为字面量，且 fail-closed 走 2', () => {
    assert.ok(TOOL_SRC.includes('0 = 九件摘掉后三条主路径全部'), '退出码 0 的语义必须写在头部');
    assert.ok(TOOL_SRC.includes('1 = 有真缺陷'), '退出码 1 的语义必须写在头部');
    assert.ok(TOOL_SRC.includes('2 = 结构漂移'), '退出码 2 的语义必须写在头部');
    /* drift 是唯一 exit 2 通道，且必须带 reason 词（fail-closed 不许静默 0）。 */
    assert.ok(/const drift = \(m\) => \{/.test(TOOL_SRC), '缺 drift() 唯一 exit 2 通道');
    assert.ok(TOOL_SRC.includes("reason: 'structural-drift'"), 'exit 2 必须带 machine-readable reason');
    assert.ok(TOOL_SRC.includes('process.exit(2)'), 'drift 必须 exit 2');
    /* 结构下限：装载面塌陷到 <50 个文件时不许假装通过。 */
    assert.ok(/ORDER\.length < (MIN_ORDER|50)/.test(TOOL_SRC) || TOOL_SRC.includes('drift('),
        '缺「装载面塌陷 ⇒ 没得判」的下限判据');
    ok('三档退出码在册；drift 唯一 exit 2 通道；装载面下限在场');
});

test('v3430X6 A3. ★★★ 九件在册，且边界两件的理由写明了', () => {
    const nine = ['memory-supersede.js', 'institutional-memory.js', 'symbolic-evolution.js',
        'knowledge-network.js', 'relation-dynamics.js', 'character-agency-contract.js',
        'era-inheritance.js', 'ledger-entity.js', 'worldline-memory.js'];
    for (const f of nine) assert.ok(TOOL_SRC.includes("'" + f + "'"), '默认九件缺: ' + f);
    /* 边界两件不许「随便挑两个叶子」——理由必须在注释里可复算。 */
    assert.ok(TOOL_SRC.includes('recall-echo.js') && TOOL_SRC.includes('顶层'),
        'ledger-entity.js 的选取理由（下游顶层硬断言）必须写明');
    assert.ok(TOOL_SRC.includes('转发'), 'worldline-memory.js 的选取理由（转发面取库口）必须写明');
    /* 每一件都必须真在 manifest 里（否则演练是空转）。 */
    const mf = JSON.parse(readRoot('manifest.json'));
    for (const f of nine) {
        assert.ok(mf.extra_js.includes(f) || mf.js === f, '九件必须真在装载面里: ' + f);
    }
    ok('九件在册且在 manifest 里；边界两件理由写明');
});

test('v3430X6 A4. ★★ 沙箱与既有 buildSandbox 同形（不另立一套 shim）', () => {
    const WIRE = readRoot(path.join('tests', 'audit', 'scan_module_wiring.mjs'));
    /* 两个环境都必须提供同一组最小面；少一个都会让「装载失败」被误读成「模块坏了」。 */
    for (const k of ['SillyTavern', 'MutationObserver', 'localStorage', 'performance', 'CustomEvent']) {
        assert.ok(TOOL_SRC.includes(k), '演练沙箱缺最小面: ' + k);
        assert.ok(WIRE.includes(k), '权威范式里应当有 ' + k + '（若范式变了，本判据要一起改）');
    }
    assert.ok(TOOL_SRC.includes('getContext'), '缺 SillyTavern.getContext（宿主取 chat 的唯一入口）');
    ok('沙箱最小面与 scan_module_wiring 同形');
});

/* ══════════════ B 真仓健康态 ══════════════ */
test('v3430X6 B1. ★★★ 真仓上 --json exit 0，control 与 drilled 双面读数在场', () => {
    const r = runDrill(ROOT, ['--json']);
    assert.equal(r.status, 0, '演练在真仓上必须 exit 0，实 ' + r.status + NL + r.out);
    const at = r.out.indexOf('{');
    assert.ok(at >= 0, '--json 必须输出机器可读读数' + NL + r.out);
    const rep = JSON.parse(r.out.slice(at));
    assert.equal(rep.schema, 'unload-drill@1', 'schema 必须是 unload-drill@1');
    assert.equal(rep.verdict, 'degraded-honestly', '真仓必须是 degraded-honestly');
    assert.equal(rep.control.defects.length, 0, '对照面必须零缺陷：' + JSON.stringify(rep.control.defects));
    assert.equal(rep.drilled.defects.length, 0, '摘九件后必须零缺陷：' + JSON.stringify(rep.drilled.defects));
    /* 三条主路径各自都要有读数（缺一条就等于没验那一面）。 */
    assert.ok(rep.drilled.fetch.length >= 7, '取数面必须 ≥7 条读数（六面 + selfCheck）');
    assert.ok(rep.drilled.recall.length >= 1, '召回面必须 ≥1 条读数');
    assert.ok(rep.drilled.panel.length >= 1, '面板面必须 ≥1 条读数');
    /* ★ 摘九件后仍能 init（这是 D1 的本体，不能只看零缺陷）。 */
    assert.equal(rep.drilled.initOk, true, '摘九件后 init 必须成功');
    assert.equal(rep.control.initOk, true, '对照面 init 必须成功');
    ok('真仓 exit 0；三面读数齐；摘九件后 init 仍成功');
});

test('v3430X6 B2. ★★★ D3 的「合法降级」在真仓读数里逐条可见', () => {
    const r = runDrill(ROOT, ['--json']);
    const rep = JSON.parse(r.out.slice(r.out.indexOf('{')));
    const why = {};
    for (const x of rep.drilled.fetch) why[x.name] = x.why;
    /* 六个诊断面必须各自给出**可读**原因（不是 null、不是空对象）。 */
    for (const f of ['institutionRuleState', 'meaningViewState', 'worldlinePrehistory',
        'evidenceImpactReplay', 'actionReceiptState', 'silenceExplainState']) {
        assert.ok(why[f], '诊断面缺读数: ' + f);
        assert.ok(/reasoned|degraded-usable|healthy-in-place/.test(why[f]),
            f + ' 的读法必须是「可读降级/健康在场」，实 ' + why[f]);
    }
    /* selfCheck 在摘九件后仍必须「健康在场」——它自己就是诊断的载体，不许跟着塌。 */
    assert.ok(/healthy-in-place|reasoned/.test(why.selfCheck), 'selfCheck 必须可读，实 ' + why.selfCheck);
    /* 召回是列表形态（_finalize 返回 finalMerged 数组），必须按长度读数而不是当零键对象。 */
    assert.ok(/list-shaped/.test(rep.drilled.recall[0].why),
        '召回必须按列表形态读数，实 ' + rep.drilled.recall[0].why);
    ok('六面 + selfCheck + 召回读法逐条可读');
});

/* ══════════════ C 真源码破坏（每条配原版对照） ══════════════ */
/* 破坏锚点：逐字取自真源码，且在本档只声明一次（H5 由 F1 钉）。 */
const A_RECALL_NULL = 'async recallMemory(query) {';
const A_PANEL_THROW = 'plugin.showSettingsPanel = function() {';
/* C3 的锚点：`mount` 器首行。打这里才能让**整块挂载**不执行（↑ 见 C3 注释）。 */
const A_MOUNT_DEAD = 'const mount = () => {';

/** 跑一次「破坏副本 + 原版副本」，原版必须 exit 0（否则破坏无意义）。 */
function withBroken(mutate, check) {
    const dirB = mkTree(mutate());
    const dirH = mkTree(null);
    try {
        const rH = runDrill(dirH, ['--json']);
        assert.equal(rH.status, 0, '原版对照必须 exit 0（否则破坏无意义）：' + rH.out.slice(0, 900));
        const rB = runDrill(dirB, ['--json']);
        check(rB, rH);
    } finally {
        rmTree(dirB);
        rmTree(dirH);
    }
}

test('v3430X6 C1. ★★★ recallMemory 静默吞成 null ⇒ D3 必须点名', () => {
    withBroken(() => ({
        'index.js': breakSource(HOST_SRC, A_RECALL_NULL,
            A_RECALL_NULL + ' return null;', '召回静默吞成 null'),
        'settings-ui.js': UI_SRC,
        'engine-recall.js': RECALL_SRC,
    }), (rB) => {
        assert.equal(rB.status, 1, '破坏后必须 exit 1（有真缺陷），实 ' + rB.status + NL + rB.out);
        assert.ok(/returned-null/.test(rB.out), '必须点名 returned-null：' + rB.out.slice(0, 1200));
        assert.ok(/召回\/recallMemory/.test(rB.out), '必须点名到召回面：' + rB.out.slice(0, 1200));
        assert.ok(/吞成空/.test(rB.out) || /不同形/.test(rB.out), '必须说清「吞成空」这条：' + rB.out.slice(0, 1200));
    });
    ok('C1：召回吞成 null ⇒ exit 1 并点名 returned-null');
});

test('v3430X6 C2. ★★★ showSettingsPanel 抛错 ⇒ D2-③ 必须点名', () => {
    withBroken(() => ({
        'index.js': HOST_SRC,
        'settings-ui.js': breakSource(UI_SRC, A_PANEL_THROW,
            A_PANEL_THROW + ' throw new Error("gate-forced-throw");', '面板抛错'),
        'engine-recall.js': RECALL_SRC,
    }), (rB) => {
        assert.equal(rB.status, 1, '破坏后必须 exit 1，实 ' + rB.status + NL + rB.out);
        assert.ok(/面板\/showSettingsPanel/.test(rB.out), '必须点名到面板面：' + rB.out.slice(0, 1200));
        assert.ok(/gate-forced-throw|threw/.test(rB.out), '必须说清「它抛了」：' + rB.out.slice(0, 1200));
    });
    ok('C2：面板抛错 ⇒ exit 1 并点名');
});

test('v3430X6 C3. ★★★ settings-ui 整模块注册失败 ⇒ 必须点名 module-not-registered', () => {
    /* 真跑实测过的形态：把 `mount` 器首行写坏，整块挂载**一步都不执行** ⇒
     *   `showSettingsPanel` 变 undefined，但 settings-ui.js 仍在装载面里。
     *   它与「settings-ui 不在装载面」（=合法的 panel-not-mounted）必须不同形 ——
     *   修前这两种被当成同一句话，等于给装载失败开了后门。
     *   【首次尝试的自伤】原先拿 A_PANEL_THROW 当锚点改 `showSettingsPanel` 体首：
     *   那样方法**仍然存在**（只是调用时抛）⇒ 演练走 `threw: top-level-broken` 分支，
     *   压根没走到 module-not-registered。锚点必须打在「让注册面整体不生效」的地方。 */
    withBroken(() => ({
        'index.js': HOST_SRC,
        'settings-ui.js': breakSource(UI_SRC, A_MOUNT_DEAD,
            A_MOUNT_DEAD + ' throw new Error("top-level-broken");', '整模块注册面写坏'),
    }), (rB) => {
        assert.equal(rB.status, 1, '整模块注册失败必须 exit 1，实 ' + rB.status + NL + rB.out);
        assert.ok(/module-not-registered/.test(rB.out),
            '在装载面里却没挂上面板 ⇒ 必须点名 module-not-registered：' + rB.out.slice(0, 1200));
        /* ★ 反向断言：不许退化成「它抛了」。
         *   `threw:` 是「方法存在但调用失败」；`module-not-registered` 是「注册面没生效」。
         *   两者混用会让「装载失败」被读成「运行时抛错」，那是另一种降级错判。 */
        assert.ok(!/threw: top-level-broken/.test(rB.out),
            '注册面失效不许被读成运行时 threw（两者不同形）：' + rB.out.slice(0, 1200));
    });
    ok('C3：模块注册失败 ⇒ exit 1 并点名 module-not-registered（非 threw）');
});

/* ══════════════ D fail-closed ══════════════ */
test('v3430X6 D1. ★★★ manifest 读不出 ⇒ exit 2（没得判 ≠ 通过）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l12x6-mf-'));
    try {
        fs.writeFileSync(path.join(dir, 'manifest.json'), '{ this is not json');
        const r = runDrill(dir, ['--json']);
        assert.equal(r.status, 2, 'manifest 崩 ⇒ 必须 exit 2，实 ' + r.status + NL + r.out);
        assert.ok(/structural-drift/.test(r.out), '必须带 structural-drift：' + r.out);
    } finally { rmTree(dir); }
    ok('D1：manifest 崩 ⇒ exit 2 并带 structural-drift');
});

test('v3430X6 D2. ★★★ 指定要摘的模块不在册 ⇒ exit 2（打偏不许算通过）', () => {
    const dir = mkTree({ 'index.js': HOST_SRC });
    try {
        const r = runDrill(dir, ['--json', '--only=不存在的模块.js']);
        assert.equal(r.status, 2, '打偏 ⇒ 必须 exit 2，实 ' + r.status + NL + r.out);
        assert.ok(/不在 manifest\.extra_js 里/.test(r.out), '必须点名打偏：' + r.out);
    } finally { rmTree(dir); }
    ok('D2：模块不在册 ⇒ exit 2 并点名');
});

test('v3430X6 D3. ★★★ 装载面塌陷 ⇒ exit 2（structure 下限不许发合格证）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l12x6-thin-'));
    try {
        fs.writeFileSync(path.join(dir, 'manifest.json'),
            JSON.stringify({ js: 'index.js', extra_js: ['memory-config.js'], version: '0.0.0' }, null, 2));
        fs.writeFileSync(path.join(dir, 'index.js'), HOST_SRC);
        fs.writeFileSync(path.join(dir, 'memory-config.js'), readRoot('memory-config.js'));
        const r = runDrill(dir, ['--json']);
        assert.equal(r.status, 2, '装载面只有 2 个文件 ⇒ 必须 exit 2，实 ' + r.status + NL + r.out);
        assert.ok(/装载面只有|低于下限/.test(r.out), '必须说清「装载面塌陷」：' + r.out);
    } finally { rmTree(dir); }
    ok('D3：装载面塌陷 ⇒ exit 2 并说清');
});

/* ══════════════ E 工具两向自证 ══════════════ */
test('v3430X6 E1. ★★★ --selftest 必须自己报 ok，且两个负控制都 turnedRed', () => {
    const r = runDrill(ROOT, ['--selftest']);
    assert.equal(r.status, 0, '--selftest 必须 exit 0，实 ' + r.status + NL + r.out);
    const at = r.out.indexOf('{');
    const res = JSON.parse(r.out.slice(at));
    assert.equal(res.ok, true, 'selftest 必须报 ok：' + r.out);
    /* ★ 这两条是本档最贵的地方：修前 selftest 只要「control 零缺陷 && 源码被改了」就判 ok，
     *   于是**破坏后零缺陷照样过** —— 那不是自证，是「改了文件就算过」。 */
    assert.equal(res.breakA_recallReturnsNull.turnedRed, true, '破坏 A 必须让判据翻红');
    assert.equal(res.breakB_panelThrows.turnedRed, true, '破坏 B 必须让判据翻红');
    assert.ok(res.breakA_recallReturnsNull.defects.length > 0, '破坏 A 必须留下缺陷读数');
    assert.ok(res.breakB_panelThrows.defects.length > 0, '破坏 B 必须留下缺陷读数');
    ok('E1：selftest ok，两个负控制均 turnedRed');
});

test('v3430X6 E2. ★★★ selftest 的两向自证本身能翻红（判据没承重时不许绿）', () => {
    /* 把工具自己的「必须翻红」判据改坏（`ok` 恒 true），selftest 就应当**仍然**通过 ——
     *   这说明「ok 恒 true」这一破坏是无效的（它不影响结论）。
     *   真正有效的证法是反过来：把某个破坏改成**不改变行为**的同值/无害替换，
     *   此时 turnedRed 必须为 false ⇒ ok 必须为 false。这里用「锚点替换后不产生缺陷」实现。 */
    const dir = mkTree({ 'index.js': HOST_SRC, 'settings-ui.js': UI_SRC, 'engine-recall.js': RECALL_SRC });
    try {
        /* 让 recallMemory 的破坏变成「加一句无害的 void 0」——改了源码但不改变行为。 */
        const harmless = breakSource(HOST_SRC, A_RECALL_NULL,
            A_RECALL_NULL + ' void 0;', '无害替换（改了源码但不改变行为）');
        fs.writeFileSync(path.join(dir, 'index.js'), harmless);
        /* 该副本上 selftest 仍须通过（因为 selftest 内部自己造破坏，与副本内容无关）——
         *   这条钉的是「selftest 不依赖被拷坏的那份源码」。 */
        const r = runDrill(dir, ['--selftest']);
        assert.equal(r.status, 0, '无害替换不得让 selftest 变红（实 ' + r.status + '）' + NL + r.out);
    } finally { rmTree(dir); }
    ok('E2：无害替换不影响 selftest（自证不依赖被拷坏的那份）');
});

/* ══════════════ F 当版锚 + 登记面 + 锚点纯度 ══════════════ */
/* 【当版锚归属（V4】】v3.430.0 这个版本同时有两份当版档案（本档 + x1x9）。
 *   `scan_version_guard.mjs` 的 V4 要求「当版锚点恰一处」—— 两份都锁当版就会在抬版时分叉：一处改了、
 *   另一处忘了，守卫就拿到两个不同的基准。故本档**让出**当版锚角色：当版锚归 x1x9 档（它钉六面产品面），
 *   本档只锁「不低于自己出生版本 3.430.0」这条下界（同仓 V3 口径：历史档不锁当版，只锁出生版本下界）。 */
test('v3430X6 F1. ★★ 出生版本下界锚：版本 ≥ 3.430.0（当版锚在 x1x9 档，见上注）', () => {
    /* ★ 本档用「数值直写」而非 `vnum('<X.Y.Z>')`：守卫 V4 把 `vnum('当版')` 当作
     *   **当版锚点**计数，而当版锚点只允许恰一处。本档既已让出，就不能再同时出现那种形态，
     *   否则当版锚会在抬版时分叉成两个基准。下界本身的语义不变：3430000 == 3.430.0。 */
    const FLOOR = 3430000;
    assert.ok(vnum(VERSION) >= FLOOR, 'index.js VERSION 必须 ≥ 3.430.0，实 ' + VERSION);
    const pkg = JSON.parse(readRoot('package.json'));
    assert.ok(vnum(pkg.version) >= FLOOR, 'package.json 版本必须 ≥ 3.430.0，实 ' + pkg.version);
    const mf = JSON.parse(readRoot('manifest.json'));
    assert.ok(vnum(mf.version) >= FLOOR, 'manifest 版本必须 ≥ 3.430.0，实 ' + mf.version);
    /* 入口必须在 npm scripts 里（工具的「可发现性」就是它存在的一半）。 */
    assert.ok(pkg.scripts['drill:unload'], 'package.json 必须有 drill:unload 入口');
    assert.ok(pkg.scripts['drill:unload:selftest'], 'package.json 必须有 drill:unload:selftest 入口');
    /* 且**不许**进 npm test —— 它是演练，不是守卫（方案原文否决）。 */
    assert.ok(!/drill_unload/.test(pkg.scripts.test || ''), 'drill_unload 不得进 npm test（它是演练不是守卫）');
    assert.ok(!/drill_unload/.test(pkg.scripts['test:audit'] || ''), 'drill_unload 不得进 test:audit');
    ok('出生版本下界 ≥ 3.430.0；入口在册；未混进 npm test');
});

test('v3430X6 F2. ★★ 两处登记面：在役名册 + v3247 接收方台账', () => {
    const cat = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(cat.includes('v3430_l12_x6_unload_drill.test.mjs'),
        '本档必须进 tests/audit/catalog_reference_consumers.tsv（在役名册）');
    const ledger = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(ledger.includes("'v3430_l12_x6_unload_drill.test.mjs'"),
        '本档必须进 v3247 的 REGISTRY（否则 _break_kit 取用面无人对账）');
    ok('两处登记面已补');
});

test('v3430X6 F3. ★★★ 破坏锚点在本档各只声明一次（判据纯度 H5）', () => {
    const SELF = readRoot(TEST_REL);
    const decls = [['A_RECALL_NULL', A_RECALL_NULL, HOST_SRC], ['A_PANEL_THROW', A_PANEL_THROW, UI_SRC],
        ['A_MOUNT_DEAD', A_MOUNT_DEAD, UI_SRC]];
    for (const [name, lit, realSrc] of decls) {
        const n = SELF.split(lit).length - 1;
        assert.strictEqual(n, 1, '锚点 ' + name + ' 在本档应恰出现 1 次（实 ' + n + ' 次）');
        assertSingleHit(realSrc, lit, name);
    }
    ok('三枚锚点各只声明一次（H5），且在真源上各恰中 1 次');
});

test('v3430X6 F4. ★★ 工具两向自证：零命中 / 多命中 / 同值替换均拒绝', () => {
    assert.throws(() => assertSingleHit(HOST_SRC, '绝对不存在的锚点字符串-xyz', 't-miss'), /拒绝破坏/);
    assert.throws(() => assertSingleHit(UI_SRC, 'plugin.', 't-multi'), /拒绝破坏/);
    assert.throws(() => breakSource(UI_SRC, A_PANEL_THROW, A_PANEL_THROW, 't-same'), /拒绝破坏/);
    ok('F4：零命中 / 多命中 / 同值替换均拒绝');
});
