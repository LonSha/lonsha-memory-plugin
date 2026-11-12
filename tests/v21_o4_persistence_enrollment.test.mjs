/* ============================================================
 * tests/v21_o4_persistence_enrollment.test.mjs — v3.464.0
 * —— 第二十一期 L21-O4：持久化字段登记判据（新增字段不可能忘记进三处枚举）
 * ------------------------------------------------------------
 * 计划原文的三条验收（本文件逐条落成判据）：
 *   ① 三向对账全绿（当前应有 0 处缺口，若有则本项先修）；
 *   ② **负控制**：往构造函数加一个假字段不进任何枚举 ⇒ 必须红；
 *   ③ **反向负控制**：把已在枚举里的字段塞进豁免表 ⇒ 必须红。
 *
 * 【本文件治的是什么形态（先写清楚，免得判据变成摆设）】
 *   计划原文只说「WorldProgress 的三处枚举」。但现场实测（v3.463.0 起点）暴露出
 *   **两条**同类缺陷，且形态完全不同，绝不许合成一句「登记不全」：
 *
 *   形态甲（字段级漏格）：`export()` 写了 knowledgeTraces / branchSemanticsRead /
 *     volumeContinuationRead 三个键、`import()` 也读回来了，但**构造函数里一个都没建格**。
 *     于是全新实例上 `worldProg.knowledgeTraces === undefined`，而读取侧用
 *     `this.x || (this.x = {...})` 懒建 —— 「还没记过」与「记了但读不到」同形。
 *
 *   形态乙（函数名对不上真码）：持久化水合表登记 50 项，其中 **39 项**登记的水合函数
 *     在对应模块上根本不存在。而 **index.js 的 v21Initializers 18 项全部不存在** ——
 *     v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」**从未发生**。
 *     这是「声明 ↔ 真码」对账，比字段漏格更重：它让一句已发布的声明变成假的。
 *
 *   两型的共同点是「三处/两处登记彼此对不上」，但**处置完全不同**（建格 vs 补函数/撤登记），
 *   故判据也分成 A、B 两组，各自有各自的负控制。
 *
 * 【判据清单】
 *   A1 判定体纯函数、不读磁盘（结构与副作用分离）
 *   A2 构造函数 / 导出 / 导入三向对账全绿（0 缺口）
 *   A3 三个「导出有、构造函数无同名格」的字段必须能被 `_` 前缀映射到已建格
 *   A4 豁免表逐条有理由（不许空字符串糊弄）
 *   A5 负控制：往构造函数加假字段不进枚举 ⇒ 必须红
 *   A6 反向负控制：把已在枚举里的字段塞进豁免表 ⇒ 必须红
 *   A7 负控制：导出多写一个键、导入不读 ⇒ exportNotImported 必须红
 *   A8 切不出来不是通过：类名写错时判定体必须显式报 slice-failed
 *   B1 水合表面三处（写盘 / 手写恢复 / 登记表）双向对齐
 *   B2 登记的水合函数必须在该模块的任一形态上存在（static / instance）
 *   B3 instance 形态必须被单列计数，不许并进 static 冒充「一样」
 *   B4 接线判据：登记成静态、模块却是类形态 ⇒ miswired 必须点名（宿主已支持两型）
 *   B5 负控制：把一个已撤登记的项手工加回表 ⇒ 必须红
 *   B6 index.js v21Initializers 登记的初始化函数必须真的存在
 *   B7 撤登记必须留痕：原位必须有「撤登记」说明（不许静默豁免）
 *   C1 措辞单源：两条判据的问题描述不得两处各写一份
 *   C2 诚实边界写进判定体导出
 *   Z1 当版锚
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    judgeWorldProgressFields, extractCtorFields, extractExportKeys, extractImportPairs,
    extractHydrationSurface, judgeHydrationTable, judgeHydrationWiring,
    extractExports, classHydratorInfo, DEFAULT_WORLD_PROGRESS_EXEMPT,
    QUESTION, BOUNDARY,
} from './audit/_persistence_field_judge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ORGANS = read('memory-organs.js');
const OPS = read('engine-persistence-ops.js');
const INDEX = read('index.js');

const readModule = (f) => {
    const p = path.join(ROOT, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};

const srcOf = (organsText) => ({
    ctor: extractCtorFields(organsText),
    exportKeys: extractExportKeys(organsText),
    importPairs: extractImportPairs(organsText),
});

const vnum = (s) => s.match(/v?(\d+)\.(\d+)\.(\d+)/);

/* ---------- A. WorldProgress 三向对账 ---------- */

test('A1 判定体是纯函数：不打 fs / 不写盘', () => {
    const src = read('tests/audit/_persistence_field_judge.mjs');
    assert.ok(!/from\s+['"]node:fs['"]/.test(src), '判定体不得 import node:fs');
    assert.ok(!/\bfs\.(write|read)File/.test(src), '判定体不得直接读写文件');
});

test('A2 三向对账全绿：构造函数 / 导出 / 导入 0 缺口', () => {
    const r = judgeWorldProgressFields(srcOf(ORGANS));
    assert.equal(r.ok, true, '缺口：' + JSON.stringify(r.gaps));
    assert.deepEqual(r.gaps.exportNotImported, []);
    assert.deepEqual(r.gaps.importNotExported, []);
    assert.deepEqual(r.gaps.importStoreMissing, []);
    assert.deepEqual(r.gaps.exportKeyNoStore, []);
    assert.deepEqual(r.gaps.ctorNotPersisted, []);
    assert.deepEqual(r.exemptViolations, []);
    // 规模不塌陷：这三处都要有实际内容，避免「空对空」的假绿
    assert.ok(r.stats.ctor >= 40, '构造函数字段数异常偏低：' + r.stats.ctor);
    assert.ok(r.stats.exportKeys >= 30, '导出键数异常偏低：' + r.stats.exportKeys);
    assert.ok(r.stats.importKeys >= 30, '导入键数异常偏低：' + r.stats.importKeys);
});

test('A3 knowledgeTraces 等三字段必须真的在构造函数里建格（本版修的形态甲）', () => {
    const ctor = extractCtorFields(ORGANS);
    for (const f of ['knowledgeTraces', '_knowledgeTraceRead', '_branchSemanticsRead', '_volumeContinuationRead']) {
        assert.ok(ctor.includes(f), '构造函数缺少建格：' + f);
    }
});

test('A4 豁免表逐条有非空理由', () => {
    const keys = Object.keys(DEFAULT_WORLD_PROGRESS_EXEMPT);
    assert.ok(keys.length >= 5, '豁免表不应为空表（空表也要显式存在）');
    for (const k of keys) {
        const why = DEFAULT_WORLD_PROGRESS_EXEMPT[k];
        assert.equal(typeof why, 'string');
        assert.ok(why.trim().length >= 8, '豁免理由太短，等于没写：' + k);
    }
});

test('A5 负控制：构造函数加一个假字段、不进任何枚举 ⇒ 必须红', () => {
    const fake = ORGANS.replace(
        'this.topicSeasons = [];',
        'this.topicSeasons = [];\n        this.__fakeNewField = 0;',
    );
    assert.notEqual(fake, ORGANS, '负控制注入点没命中，判据本身失效');
    const r = judgeWorldProgressFields(srcOf(fake));
    assert.equal(r.ok, false, '假字段未被抓住 —— 三向对账形同虚设');
    assert.ok(r.gaps.ctorNotPersisted.includes('__fakeNewField'), 'gaps 未点名 __fakeNewField');
});

test('A6 反向负控制：把已在枚举里的字段塞进豁免表 ⇒ 必须红', () => {
    const bad = { ...DEFAULT_WORLD_PROGRESS_EXEMPT, promises: '假装它不需要持久化' };
    const r = judgeWorldProgressFields(srcOf(ORGANS), bad);
    assert.equal(r.ok, false, '豁免表腐烂未被抓住');
    assert.ok(r.exemptViolations.includes('promises'), 'exemptViolations 未点名 promises');
});

test('A7 负控制：导出多写一个键、导入不读 ⇒ exportNotImported 必须红', () => {
    const bad = ORGANS.replace(
        '            plotArcs: this.plotArcs || []',
        '            plotArcs: this.plotArcs || [],\n            __exportOnly: this.plotArcs || []',
    );
    assert.notEqual(bad, ORGANS, '负控制注入点没命中');
    const r = judgeWorldProgressFields(srcOf(bad));
    assert.equal(r.ok, false);
    assert.ok(r.gaps.exportNotImported.includes('__exportOnly'), '导出独有键未被抓住');
});

test('A8 类名写错 ⇒ 判定体必须显式报 slice-failed，不许静默当通过', () => {
    const r = judgeWorldProgressFields({ ctor: null, exportKeys: [], importPairs: [] });
    assert.equal(r.ok, false);
    assert.equal(r.stats.error, 'slice-failed');
});

/* ---------- B. 水合表面与初始化面（声明 ↔ 真码） ---------- */

test('B1 水合表面三处双向对齐：写盘 / 手写恢复 / 登记表', () => {
    const r = judgeHydrationTable(extractHydrationSurface(OPS), readModule);
    assert.equal(r.ok, true, '缺口：' + JSON.stringify({
        writeOnly: r.gaps.writeOnly, readOnly: r.gaps.readOnly,
        missingFile: r.gaps.missingFile, dupKeys: r.gaps.dupKeys, dupStores: r.gaps.dupStores,
        detail: r.detail.slice(0, 3),
    }));
    assert.deepEqual(r.gaps.writeOnly, []);
    assert.deepEqual(r.gaps.readOnly, []);
    assert.deepEqual(r.gaps.missingFile, []);
    assert.deepEqual(r.gaps.dupKeys, []);
    assert.deepEqual(r.gaps.dupStores, []);
});

test('B2 登记的水合函数必须在模块的任一形态上真的存在', () => {
    const r = judgeHydrationTable(extractHydrationSurface(OPS), readModule);
    assert.deepEqual(r.gaps.hydratorMissing, [], '登记的函数名在真码上不存在：' + r.detail.slice(0, 5).join(' | '));
});

test('B3 instance 形态必须单列计数，不许并进 static 冒充一样', () => {
    const r = judgeHydrationTable(extractHydrationSurface(OPS), readModule);
    assert.ok(r.stats.instanceForm >= 10, '类形态计数异常偏低：' + r.stats.instanceForm);
    assert.ok(r.stats.staticForm >= 20, '静态形态计数异常偏低：' + r.stats.staticForm);
    assert.equal(r.stats.staticForm + r.stats.instanceForm, r.stats.table, '两形态之和必须等于登记总数');
});

test('B4 接线判据：类形态必须被点名，且宿主真码必须**同时**支持两型调用', () => {
    const w = judgeHydrationWiring(extractHydrationSurface(OPS).table, readModule);
    /* ★ 这条判据原先写成「miswired 必须为空」—— 那是错的（v3.463.0 自纠）。
     *   miswired 的语义是「模块有能力水合，但宿主按**静态函数**登记」，
     *   它**不是缺陷本身**，而是「需要宿主按实例形态调用」的清单。
     *   把它断言成空，等于要求所有模块都必须导出静态函数 —— 那会把 12 个
     *   类形态引擎逼成「再造一个静态包装」，多一份实现、多一个真源。
     *   正确的问法是两问：
     *     ① 类形态项必须被**点名**（不许静默漏掉，否则宿主不知道要按实例调）；
     *     ② 宿主源码里必须**真的**有 new 实例 + 调实例方法那条分支（否则点名也没用）。 */
    assert.ok(w.miswired.length >= 10, '类形态项未被点名，判据失效：' + w.miswired.length);
    assert.ok(w.miswired.every(x => x.kind === 'instance-method'), '点名项应为实例方法形态');
    assert.ok(/mod\.prototype\s*&&\s*typeof\s+mod\.prototype\[hydrator\]/.test(OPS),
        '宿主必须真的有「new 实例 + 调实例方法」分支');
    assert.ok(/new\s+mod\(\)/.test(OPS), '宿主必须真的 new 出实例');
    assert.ok(/exportState/.test(OPS), '写盘侧必须走 exportState()，否则 Map 会序列化成 {}');
});

test('B5 负控制：手工把已撤登记的无状态项加回表 ⇒ 必须红', () => {
    const surf = extractHydrationSurface(OPS);
    const poisoned = {
        ...surf,
        table: [...surf.table, {
            extKey: 'lonshaFloorFingerprintState', store: '_floorFingerprintState',
            globalName: 'LonShaFloorFingerprintSelfHealer', file: 'floor-fingerprint-self-healer.js',
            hydrator: 'hydrateState', line: -1,
        }],
    };
    const r = judgeHydrationTable(poisoned, readModule);
    assert.equal(r.ok, false, '把无状态项加回表却仍判绿 —— 判据形同虚设');
    assert.ok(r.gaps.hydratorMissing.some(x => x.extKey === 'lonshaFloorFingerprintState'));
});

test('B6 index.js v21Initializers 登记的初始化函数必须真的存在', () => {
    const lines = INDEX.split('\n');
    const rows = [];
    let on = false;
    for (let i = 0; i < lines.length; i++) {
        if (/const v21Initializers\s*=\s*\[/.test(lines[i])) on = true;
        if (!on) continue;
        const m = lines[i].match(/\[\s*'(\w+)',\s*(\w+),\s*'(\w+)',\s*'(\w+)'/);
        if (m) rows.push({ key: m[1], getLib: m[2], initFn: m[3] });
        if (/^\s*\];/.test(lines[i])) break;
    }
    assert.ok(rows.length >= 10, '初始化表项数异常偏低：' + rows.length);

    const libDef = new Map();
    const re = /function\s+(\w+)\s*\(\s*\)\s*\{[\s\S]{0,400}?window\.(\w+)[\s\S]{0,200}?'([\w.-]+\.js)'/g;
    let mm;
    while ((mm = re.exec(INDEX))) libDef.set(mm[1], { file: mm[3] });

    const bad = [];
    for (const r of rows) {
        const d = libDef.get(r.getLib);
        if (!d) { bad.push(r.key + '(lib未解析)'); continue; }
        const src = readModule(d.file);
        if (src === null) { bad.push(r.key + '(文件缺失)'); continue; }
        if (!extractExports(src).has(r.initFn)) bad.push(r.key + '(缺 ' + r.initFn + ')');
    }
    assert.deepEqual(bad, [], '初始化函数在真码上不存在：' + bad.join(', '));
});

test('B7 撤登记必须留痕：原位必须有「撤登记」说明', () => {
    const hits = (OPS.match(/L21-O4 撤登记/g) || []).length;
    assert.ok(hits >= 8, '水合表面撤登记留痕过少，疑似被静默删除：' + hits);
    const idxHits = (INDEX.match(/L21-O4 撤登记/g) || []).length;
    assert.ok(idxHits >= 7, '初始化面撤登记留痕过少：' + idxHits);
});

/* ---------- C. 措辞与边界 ---------- */

test('C1 措辞单源：两条判据的问题描述各只有一份', () => {
    const judgeSrc = read('tests/audit/_persistence_field_judge.mjs');
    const a = judgeSrc.split('fields:').length - 1;
    const b = judgeSrc.split('hydration:').length - 1;
    assert.equal(a, 1, 'fields 措辞出现次数应为 1，实际 ' + a);
    assert.equal(b, 1, 'hydration 措辞出现次数应为 1，实际 ' + b);
    assert.ok(QUESTION.fields.includes('三处'));
    assert.ok(QUESTION.hydration.includes('真码'));
});

test('C2 诚实边界必须写进判定体导出', () => {
    assert.ok(BOUNDARY.includes('不能证明'), '边界必须写明做不到什么');
    assert.ok(BOUNDARY.includes('运行时'), '边界必须点明运行时不在本判定射程内');
    assert.ok(BOUNDARY.includes('漏登记'), '边界必须说明绿的含义是什么');
});

/* ---------- Z. 当版锚 ---------- */

test('Z1 锚点：本文件生于 v3.464.0，四源同源且版本不倒退', () => {
    const self = read('tests/v21_o4_persistence_enrollment.test.mjs');
    const head = self.split('\n').slice(0, 3).join('\n');
    assert.ok(/v3\.464\.0/.test(head), '文件头必须标注**出生**版本号');
    const pkg = JSON.parse(read('package.json'));
    const manifest = JSON.parse(read('manifest.json'));
    /* ★ 本判据曾写成「pkg/manifest/三副本必须恰好等于 3.464.0」——
     *   那是把历史测试钉死在出生版本上：下一次正常抬版必然打红它，逼人回来改数字
     *   （V3 治的正是这种「死数伪装成判据」的形态）。改为两条各自成立的事：
     *   ① 四源此刻必须互相同源（这才是本仓真正要守的）；
     *   ② 且不得回退到本套件出生版本之前。 */
    assert.equal(pkg.version, manifest.version, 'package.json 与 manifest.json 必须同源');
    for (const f of ['memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        const m = read(f).match(/let\s+VERSION\s*=\s*['"]([\d.]+)['"]/);
        assert.ok(m, f + ' 缺 let VERSION');
        assert.equal(m[1], manifest.version, f + ' 副本版本未与 manifest 同步');
    }
    assert.ok(vnum('3.464.0'), '出生版本锚点必须能被 vnum 恰好计数（V4）');
    const cmp = (a, b) => {
        for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] - b[i]; }
        return 0;
    };
    assert.ok(cmp(vnum(manifest.version).slice(1), vnum('3.464.0').slice(1)) >= 0,
        '仓库版本 ' + manifest.version + ' 不得回退到本套件出生版本 v3.464.0 之前');
});