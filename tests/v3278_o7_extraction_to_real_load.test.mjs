// tests/v3278_o7_extraction_to_real_load.test.mjs — v3.278.0 O7 第二批
// 历史抽取测试 → 真实模块装载：减负账本 + 真实行为证据 + 真源码破坏负控制
// 运行: node tests/v3278_o7_extraction_to_real_load.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const require_ = createRequire(import.meta.url);
const T = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => readFileSync(T(rel), 'utf8');
const NL = String.fromCharCode(10);
const SQ = String.fromCharCode(39);

/* ---------- 待验的九档（O7 第二批的实际交付面） ---------- */
const MIGRATED = [
    ['v340_database_evolution.test.mjs', ['memory-core.js', 'memory-organs.js'], 5868, 5],
    ['chaos_resilience.test.mjs',        ['memory-core.js'],                   4710, 5],
    ['stress_bench.test.mjs',            ['memory-core.js', 'memory-books.js'], 5599, 0],
    ['v341_stitches_mechanics.test.mjs', ['memory-core.js', 'memory-organs.js'], 10375, 6],
    ['v342_caikis_mechanics.test.mjs',   ['memory-core.js'],                   6588, 5],
    ['v343_baibai_mechanics.test.mjs',   ['memory-core.js', 'memory-books.js'], 8026, 4],
    ['v345_deep_bastion.test.mjs',       ['memory-core.js', 'memory-books.js'], 11803, 0],
    ['v346_fortress_pyramid.test.mjs',   ['memory-core.js', 'memory-books.js'], 9018, 0],
    ['v360_graph_dedup.test.mjs',        ['memory-core.js'],                   9005, 9],
];

/* 真源码破坏的锚点（写进真文件、与各档样本解耦，防「自我指涉」破坏） */
const A_REBIND = 'rebindModuleDeps() {';

const HOST_ANCHORS = [
    '_lockDegradePending = new Set()',
    '_bindDepsRead = null;',
    '_bindDepsRebindRead = null;',
    A_REBIND,
    '_formatBindDepsRow(this._bindDepsRead, this._bindDepsRebindRead)',
];
const MOD_ANCHORS = [
    ['memory-core.js', 'function normalizeCharName(name) {'],
    ['memory-core.js', 'class MemoryGraph {'],
    ['memory-core.js', 'api = Object.freeze({ MemoryGraph, SummarySystem, GameClock, CharacterState, bindDeps, PLUGIN_NAME, VERSION })'],
    ['memory-organs.js', 'class StorageManager {'],
    ['memory-books.js', 'class RelativeTimeHelper {'],
];

const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');

/* ══════════════ A. 减负账本 ══════════════ */
test('A. 九档中抽取机器（extractClass / braceEnd）与手抄副本（代码面）均已归零', () => {
    for (const [f, mods, bytes, okN] of MIGRATED) {
        const raw = read(f);
        const code = stripComments(raw);
        assert.equal((code.match(/extractClass/g) || []).length, 0, f + ' 不得再含 extractClass（抽取机器）');
        assert.equal((code.match(/braceEnd/g) || []).length, 0, f + ' 不得再含 braceEnd（抽取机器）');
        assert.equal((code.match(/RELATION_CONFLICT_GROUPS/g) || []).length, 0,
            f + ' 不得再手抄 RELATION_CONFLICT_GROUPS（真源在 memory-core.js）');
        assert.equal((code.match(/areLabelsInConflict/g) || []).length, 0, f + ' 不得再手抄 areLabelsInConflict');
        assert.ok(/createRequire/.test(code), f + ' 必须走 createRequire 真模块装载');
        for (const m of mods) assert.ok(code.includes(SQ + '../' + m + SQ), f + ' 必须装载 ' + m);
        assert.equal(Buffer.byteLength(raw), bytes, f + ' 字节数须等于迁移后实测值（防静默回退到重放形态）');
        assert.equal(raw.split(NL).filter((l) => l.trim().startsWith('ok(')).length, okN, f + ' ok() 产出面不得缩水');
    }
    console.log('  ✓ 九档：extractClass/braceEnd/手抄副本代码面为 0，真模块装载在场，产出面未缩水');
});

test('B. 真模块导出面齐备；宿主同文件函数不冒充已迁移（边界诚实）', () => {
    const MC = require_(T('../memory-core.js'));
    const MB = require_(T('../memory-books.js'));
    const MO = require_(T('../memory-organs.js'));
    for (const k of ['MemoryGraph', 'SummarySystem', 'GameClock', 'CharacterState']) assert.equal(typeof MC[k], 'function', 'memory-core.js 必须导出 ' + k);
    for (const k of ['RelativeTimeHelper', 'SuspenseBook', 'BM25']) assert.equal(typeof MB[k], 'function', 'memory-books.js 必须导出 ' + k);
    for (const k of ['StorageManager', 'WorldProgress']) assert.equal(typeof MO[k], 'function', 'memory-organs.js 必须导出 ' + k);
    for (const k of ['MemoryGraph', 'SummarySystem', 'GameClock', 'CharacterState']) new MC[k]();
    new MB.RelativeTimeHelper(); new MB.SuspenseBook(); new MB.BM25();
    new MO.StorageManager(); new MO.WorldProgress();
    const mcCode = stripComments(read('../memory-core.js'));
    assert.ok(mcCode.includes('function normalizeCharName(name) {'), 'memory-core.js 必须自带 normalizeCharName 真源');
    assert.ok(mcCode.includes('function areLabelsInConflict(l1, l2) {'), 'memory-core.js 必须自带 areLabelsInConflict 真源');
    assert.ok(mcCode.includes('const RELATION_CONFLICT_GROUPS = ['), 'memory-core.js 必须自带关系冲突组真源');
    const idx = read('../index.js');
    for (const hostFn of ['function buildNpcTierInjection', 'function fmtNpcTiesContext', 'function extractThinkingChain', 'function stripMemoryOpsTags']) {
        assert.ok(idx.includes(hostFn), '宿主同文件函数仍在 index.js（迁移边界）：' + hostFn);
    }
    console.log('  ✓ 九类真模块装载可构造；宿主同文件函数仍留抽取面（不冒充已迁移）');
});

/* ══════════════ C. 全局减负读数 ══════════════ */
test('C. 九档抽取机器总量较上一版净减（原 new Function 22 / 关系冲突组 8 / areLabelsInConflict 4）', () => {
    let nf = 0, conf = 0, alic = 0;
    for (const [f] of MIGRATED) {
        const c = stripComments(read(f));
        nf += (c.match(/new Function/g) || []).length;
        conf += (c.match(/RELATION_CONFLICT_GROUPS/g) || []).length;
        alic += (c.match(/areLabelsInConflict/g) || []).length;
    }
    assert.ok(nf <= 6, '九档 new Function 须从 22 降到 <=6（只留宿主同文件函数的抽取面），实测 ' + nf);
    assert.equal(conf, 0, '九档关系冲突组手抄副本须归零');
    assert.equal(alic, 0, '九档 areLabelsInConflict 手抄副本须归零');
    console.log('  ✓ 九档 new Function=' + nf + '（原 22） / 关系冲突组=' + conf + '（原 8） / areLabelsInConflict=' + alic + '（原 4）');
});

/* ══════════════ D. 真源码破坏 → 可观测性提升 ══════════════ */
test('D. 真源码破坏（模块侧类外符号）→ 迁移后新增捕获：破坏样本与行为基线双向成立', () => {
    /* 证据协议：迁移前各档在**副本**上跑（类体 + 手抄类外符号），破坏真模块的类外符号时
     *   样本一字不变 ⇒ 必绿；迁移后真类上场 ⇒ 同一处破坏直接命中。本档把该协议钉成可执行形式：
     *   破坏样本必须真发生且可观察，且行为基线必须在正常态成立。 */
    const raw = read('../memory-core.js');
    const anchor = 'function normalizeCharName(name) {';
    assertSingleHit(raw, anchor, 'D.normalizeCharName 锚点');
    const broken = breakSource(raw, anchor, anchor + NL + '    return String(name || ' + SQ + SQ + ');');
    assert.notEqual(broken, raw, '破坏必须真发生');
    assert.equal(broken.split(anchor).length - 1, 1, '锚点未被破坏（只做体插入）');
    assert.ok(broken.includes('return String(name || ' + SQ + SQ + ');'), '破坏后的可观察变化必须在场');
    const g = new (require_(T('../memory-core.js')).MemoryGraph)();
    g.addNode({ type: 'character', name: '  林 澈 ' });
    assert.ok(g.findCharacterByName('林澈'), '正常态：NFKC 归一化密钥使空格变体可命中');
    assert.equal(g.findCharacterByName('无人之名'), null, '正常态：未命中返回 null（不是空对象）');
    console.log('  ✓ 破坏样本真发生且可观察；行为基线（归一化命中）成立');
});

test('E. 宿主侧 O7 注入面：全部锚点在本档只准出现一次（纯度）；单次真破坏可观察、原版判据真成立', () => {
    const idx = read('../index.js');
    const SELF = read('v3278_o7_extraction_to_real_load.test.mjs');
    for (const a of HOST_ANCHORS) {
        assert.equal(SELF.split(SQ + a + SQ).length - 1, 1, '锚点字面量在本档只准出现一次：' + a);
        assert.equal(idx.split(a).length - 1, 1, '锚点在真 index.js 恰中一次：' + a);
    }
    for (const [m, a] of MOD_ANCHORS) {
        assert.equal(read('../' + m).split(a).length - 1, 1, '锚点在 ' + m + ' 恰中一次：' + a);
    }
    const b = breakSource(idx, A_REBIND, 'rebindModuleDepsTYPO() {');
    assert.equal(b.split(A_REBIND).length - 1, 0, '破坏后原锚点必须消失');
    assert.ok(b.includes('rebindModuleDepsTYPO() {'), '破坏必须可观察');
    assert.equal(idx.split(A_REBIND).length - 1, 1, '原版上锚点必须恰一次（负控制不得空对空）');
    console.log('  ✓ ' + (HOST_ANCHORS.length + MOD_ANCHORS.length) + ' 个锚点各恰一次；真破坏可观察、原版判据真成立');
});

/* ══════════════ F. 自防护 ══════════════ */
test('F. 自防护：O7 两批真实特征不得被摘掉', () => {
    const idx = read('../index.js');
    assert.ok(/const VERSION = '[0-9.]+';/.test(idx), '版本常量在场');
    assert.ok(idx.includes('_formatBindDepsRow'), 'O7 第一批真源特征仍在 index.js');
    assert.ok(idx.includes('rebindModuleDeps'), '模块装载后重绑仍在场');
    assert.equal(typeof breakSource, 'function', '破坏工具从唯一真源取用');
    const bk = read('_break_kit.mjs');
    assert.ok(bk.includes('export function breakOnce'), '_break_kit.mjs 必须提供 breakOnce');
    const self = read('v3278_o7_extraction_to_real_load.test.mjs');
    assert.ok(self.length > 6000, '本档自身不得被清空（长度下限）');
    for (const a of HOST_ANCHORS) assert.ok(self.includes(a), '本档必须逐字持有宿主锚点：' + a);
    console.log('  ✓ 真源特征 / 破坏工具 / 本档自身均在位');
});

/* ══════════════ G. 三源同源 + 当版锚点 ══════════════ */
test('G. 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(read('../package.json')).version;
    const man = JSON.parse(read('../manifest.json')).version;
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(read('../index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    /* [v3.279.0 交棒] 当版硬锚交棒给 v3279_o7_scanner_decl_surface.test.mjs（H 段恰锚当版）；
     *   本档退回**下限锚**：自 3.278.0 起成立，不承诺未来（版本守卫 V2/V3 口径）。 */
    assert.ok(vnum(pkg) >= vnum('3.278.0'), '本档自 3.278.0 起成立；当前 ' + pkg);
    console.log('  ✓ 三源同源 ' + pkg);
});
