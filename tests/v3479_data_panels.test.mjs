/**
 * tests/v3479_data_panels.test.mjs — v3.479 四个数据面板的守门判据
 *
 * 【本文件要守住什么】
 *   1. ui-data-panels.js 能在 Node 下被 require 且自检全绿（不靠浏览器也能验）。
 *   2. 它**真的被登记**（manifest.extra_js）且**真的被调用**（index.js + v4-panel-ui.js 有调用点）
 *      —— 本仓 v3.163 有 68 个版本「缝了机制没人调」，那是同一类死法的前科。
 *   3. **absent 与 empty 必须分开**：没有引擎 ≠ 引擎里没数据。
 *      这是本仓反复踩的坑（判不了被写成没有），所以每个 reader 都单独判一次。
 *   4. 结构漂移要判 absent 而不是 empty：items.records 不是数组时，
 *      正确反应是「读不出来」，不是「一件物品都没有」。
 *   5. 场景槽 worldProg.scenes 无写入方，必须**如实标注**而不是渲染成「没有场景」。
 *   6. 负控制：删掉调用点后判据必须变红，否则说明判据在查空。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

const PANELS = require('../ui-data-panels.js');

/** 临时换掉全局插件，跑完还原（绝不留脏状态给后面的判据） */
function withEngine(plugin, fn) {
    const saved = globalThis.LonShaMemory;
    const had = Object.prototype.hasOwnProperty.call(globalThis, 'LonShaMemory');
    globalThis.LonShaMemory = plugin;
    try {
        return fn();
    } finally {
        if (had) globalThis.LonShaMemory = saved;
        else delete globalThis.LonShaMemory;
    }
}

test('【0】版本三源对齐（读现行版本，不写死字面量）', () => {
    // [v3.480.0] 这条原本把 3.479.0 写死，每升一次版就必红一次——那是抬版仪式，
    //   不是判据（v3478 已经治理过一次同一形态，我写 v3479 时又照抄了）。
    //   现在以 index.js 为真源，其余各处必须跟它同版：既不会随抬版而腐，
    //   也仍能抓住「六处里只改了一处」这种真实碑子。
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
    assert.ok(!read('index.js').includes("'3.479.0'"), 'index.js 还残留 3.479.0');
});

test('【1】ui-data-panels 自检全绿', () => {
    const r = PANELS.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.equal(r.ok, true);
    assert.ok(r.total >= 21, '自检条数应 ≥21，实际 ' + r.total);
});

test('【2】无引擎时四个 reader 全部 absent（不许写成 empty）', () => {
    withEngine(null, () => {
        for (const name of ['readNpcTies', 'readPresence', 'readStateVars', 'readItems']) {
            const r = PANELS[name]();
            assert.equal(r.ok, false, name + ' 无引擎应 ok=false');
            assert.equal(r.kind, 'absent', name + ' 无引擎应判 absent，实际 ' + r.kind);
            assert.ok(typeof r.reason === 'string' && r.reason.length > 0, name + ' 缺席必须带理由');
        }
    });
});

test('【3】结构漂移判 absent：items.records 不是数组', () => {
    withEngine({ engine: { items: { records: { not: 'array' } } } }, () => {
        const r = PANELS.readItems();
        assert.equal(r.kind, 'absent', '：结构漂移应判 absent，实际 ' + r.kind);
        assert.ok(/结构漂移/.test(r.reason), '理由应点明结构漂移，实际：' + r.reason);
    });
});

test('【4】presence 是 Map，要转成行并按楼层倒序', () => {
    const presence = new Map([
        ['甲', { atFloor: 3 }],
        ['乙', { atFloor: 9 }],
        ['丙', { atFloor: 1 }],
    ]);
    withEngine({ engine: { scene: { presence } } }, () => {
        const r = PANELS.readPresence();
        assert.equal(r.kind, 'ok');
        assert.equal(r.total, 3);
        assert.deepEqual(r.rows.map((x) => x.name), ['乙', '甲', '丙'], '应按 atFloor 倒序');
        assert.ok(Array.isArray(r.sceneSlots), 'sceneSlots 必须是数组');
        assert.ok(/没有写入方/.test(r.sceneSlotNote), '场景槽必须如实标注无写入方，实际：' + r.sceneSlotNote);
    });
});

test('【5】状态变量取 baselines 与 drifts 的并集', () => {
    withEngine({
        engine: {
            status: {
                baselines: { 甲: { traits: ['冷静'] } },
                drifts: { 乙: { mood: '焦躁', floor: 7 } },
            },
        },
    }, () => {
        const r = PANELS.readStateVars();
        assert.equal(r.kind, 'ok');
        assert.equal(r.total, 2, '并集应有 2 个角色，实际 ' + r.total);
        const byName = new Map(r.rows.map((x) => [x.name, x]));
        assert.equal(byName.get('甲').hasBaseline, true);
        assert.equal(byName.get('甲').hasDrift, false);
        assert.equal(byName.get('乙').hasBaseline, false);
        assert.equal(byName.get('乙').hasDrift, true);
    });
});

test('【6】物品按「随身 / 在：地点 / 持有者」三类分组，且 25 条判 capped', () => {
    const records = [
        { name: '剑', carried: true },
        { name: '信', location: '书房' },
        { name: '印', holder: '老王' },
    ];
    withEngine({ engine: { items: { records, _stale: 2 } } }, () => {
        const r = PANELS.readItems();
        assert.equal(r.kind, 'ok');
        assert.equal(r.total, 3);
        assert.deepEqual([...r.groups.keys()], ['随身携带', '在：书房', '老王'], '分组键');
        assert.equal(r.stale, 2, '_stale 应带出');
        assert.equal(r.capped, false, '3 条不该判 capped');
    });
    // 25 条 = 派生视图的硬上限，必须能读出来「可能被截断」
    const many = Array.from({ length: 25 }, (_, i) => ({ name: 'i' + i }));
    withEngine({ engine: { items: { records: many } } }, () => {
        assert.equal(PANELS.readItems().capped, true, '满 25 条必须判 capped');
    });
});

test('【7】在 manifest.extra_js 里登记，且排在 ui-floor-panel 之后', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const list = manifest.extra_js || [];
    assert.ok(list.includes('ui-data-panels.js'), '未登记 extra_js');
    assert.ok(existsSync(path.join(ROOT, 'ui-data-panels.js')), '文件不存在');
    assert.ok(list.indexOf('ui-data-panels.js') > list.indexOf('ui-floor-panel.js'),
        '应排在 ui-floor-panel.js 之后（ui 件聚在末尾）');
    // 依赖的 ui-kit 必须更早
    assert.ok(list.indexOf('ui-kit-core.js') < list.indexOf('ui-data-panels.js'), 'ui-kit 应在之前');
});

test('【8】调用点证据：index.js 与抽屉里都有指向四个面板的真实入口', () => {
    // [v3.479.0] 接线已从 index.js 搬到 ui-panel-seam.js（入口有行数 ratchet），
    //   因此调用点证据跟着接线走，而不是固守在某个文件名上。
    const seam = read('ui-panel-seam.js');
    assert.ok(seam.includes('LonShaDataPanels'), 'ui-panel-seam.js 未引用 LonShaDataPanels');
    assert.ok(seam.includes('p.openDataPanel = makeDataOpener(p)'), 'ui-panel-seam.js 未暴露 openDataPanel');
    assert.ok(seam.includes('m.open(kind)'), 'ui-panel-seam.js 未真正调用 m.open');
    assert.ok(seam.includes('window.LonShaUiSeam = api'), 'ui-panel-seam.js 缺 window 挂载（消费审计会判零引用）');

    const v4 = read('v4-panel-ui.js');
    assert.ok(v4.includes('root.LonShaDataPanels'), 'v4-panel-ui.js 未引用 LonShaDataPanels');
    for (const fn of ['openNpcPanel', 'openScenePanel', 'openVarsPanel', 'openItemsPanel']) {
        assert.ok(v4.includes("'" + fn + "'"), 'v4-panel-ui.js 未挂 ' + fn + ' 入口');
    }
    assert.ok(v4.includes('panelsMod[fnName]()'), 'v4-panel-ui.js 未真正调用面板方法');
});

test('【9】负控制：删掉调用点后判据必须变红', () => {
    const v4 = read('v4-panel-ui.js');
    const stripped = v4
        .replace(/panelsMod\[fnName\]\(\)/g, 'noopZ()')
        .replace(/'openNpcPanel'/g, "'noopA'")
        .replace(/'openItemsPanel'/g, "'noopB'");
    // 与【8】同一套断言，只换输入
    const stillPasses = stripped.includes('panelsMod[fnName]()') && stripped.includes("'openNpcPanel'");
    assert.equal(stillPasses, false, '负控制失效：删掉调用点后判据仍然通过');
    // 接线侧（seam）同样做一次
    const seamSrc = read('ui-panel-seam.js');
    const seamStripped = seamSrc.replace(/m\.open\(kind\)/g, 'noopQ(kind)');
    assert.equal(seamStripped.includes('m.open(kind)'), false, '负控制失效：seam 侧调用点未被识别');
});

test('【10】挂载前置成立（消费审计只认 window.X = 形态）', () => {
    const src = read('ui-data-panels.js');
    assert.ok(/window\.LonShaDataPanels\s*=\s*api/.test(src),
        '必须存在 window.LonShaDataPanels = api（否则消费审计判零引用）');
    assert.ok(PANELS && typeof PANELS.open === 'function', 'open 分发器未导出');
});

test('【11】open 分发器对未知 kind 必须抛错，不许静默返回', () => {
    let threw = false;
    try {
        withEngine(null, () => PANELS.open('不存在的面板'));
    } catch (_e) {
        threw = true;
    }
    assert.equal(threw, true, '未知 kind 应抛错');
});

test('【12】有引擎但真没数据 → empty（与 absent 分离）', () => {
    withEngine({
        engine: {
            getNpcTiesRecords: () => [],
            scene: { presence: new Map() },
            status: { baselines: {}, drifts: {} },
            items: { records: [] },
        },
    }, () => {
        for (const name of ['readNpcTies', 'readPresence', 'readStateVars', 'readItems']) {
            const r = PANELS[name]();
            assert.equal(r.ok, true, name + ' 有引擎应 ok=true');
            assert.equal(r.kind, 'empty', name + ' 空数据应判 empty，实际 ' + r.kind);
            assert.equal(r.total, 0);
        }
    });
});

test('【13】呈现层占比不得回落（12.7% 基线）', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tests/audit/ui_ratio.mjs'), '--json'], {
        cwd: ROOT, encoding: 'utf8',
    });
    const j = JSON.parse(out);
    assert.ok(j.ratio >= 0.127, '呈现层占比回落到 ' + (j.ratio * 100).toFixed(2) + '%（基线 12.7%）');
    assert.ok(j.needLines > 0, 'needLines 应为正（离 20% 还差的行数）');
});

test('【14】反向守卫：UI 接线不许回到 index.js（入口有行数 ratchet）', () => {
    const idx = read('index.js');
    // 这三行曾经写在 index.js 里，把 R2「行数只降不涨」撑红。搬走之后不许回来。
    assert.ok(!idx.includes('plugin.openSummaryTree ='), 'openSummaryTree 又写回 index.js 了');
    assert.ok(!idx.includes('plugin.openFloorPanel ='), 'openFloorPanel 又写回 index.js 了');
    assert.ok(!idx.includes('plugin.openDataPanel ='), 'openDataPanel 又写回 index.js 了');
    assert.ok(idx.includes('ui-panel-seam.js'), 'index.js 应留下指向接缝模块的说明');
    // 天花板仍须低于拆前（ratchet 方向不许反转）
    const ledger = JSON.parse(read('tests/audit/index_split_ledger.json'));
    assert.ok(ledger.index_lines_max < ledger.lines_before_split,
        '天花板 ' + ledger.index_lines_max + ' 必须 < 拆前 ' + ledger.lines_before_split);
});

test('【15】接缝模块自检全绿，且登记在 manifest', () => {
    const SEAM = require('../ui-panel-seam.js');
    const r = SEAM.selfCheck();
    assert.equal(r.failed, 0, JSON.stringify(r.fails));
    assert.ok(r.total >= 12, '自检条数应 ≥12，实际 ' + r.total);
    const list = JSON.parse(read('manifest.json')).extra_js || [];
    assert.ok(list.includes('ui-panel-seam.js'), '未登记 extra_js');
    assert.ok(existsSync(path.join(ROOT, 'ui-panel-seam.js')), '文件不存在');
});
