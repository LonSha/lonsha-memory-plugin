// tests/v3230_dead_method_disposal.test.mjs — P-1 死方法处置（O-6 挂账收口）[v3.229.0]
//   主题：v3.227.0（O-6）把「定义在 index.js 里却没人调」的方法冻结成台账（4 条），
//   本版把台账上的 4 条**逐条实测后删除定义**，集合归零。
//
//   为什么「台账归零」需要一整套判据（不是删完就算）：
//     · 台账是**双向**判据（新增即红 / 清掉也要改表），删掉后它与实测都是空集 ——
//       「空对空」是一种会骗人的绿（它永远成立），所以必须有别的东西钉住「确实是空的、确实是删了的」；
//     · 删代码最怕**删错**（把同名活方法或它的同族兄弟一起带走）。本套件对「保留面」逐条点名；
//     · 台账里那条「删它需连配置键一起处置」的旧推测，经实测**不成立**（与配置键无绑定关系），
//       这件反坐实必须留痕 —— 否则后人会照旧推测重新「回滚修复」。
//
//   口径声明（与 O-6 同一边界）：文本形态判定，不解析 AST、不追动态拼名调用。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const LEDGER = path.join(AUDIT, 'scan_wiring_dead_methods.tsv');
const read = (p) => fs.readFileSync(p, 'utf8');
const idxSrc = read(path.join(ROOT, 'index.js'));
const ledger = read(LEDGER);

/* 本版处置的四条（顺序即台账顺序） */
const DISPOSED = ['_legacyHybridMerge', 'breakPromise', 'callGeneric', 'queryByFloor'];
/* 判据自持的定义形态口径：与 scan_wiring 的 DEF_RE 同族（行首方法名 + 参数表 + `{`）。 */
const defRe = (n) => new RegExp('^\\s*(?:async\\s+)?' + n.replace(/[$]/g, '\\$') + '\\s*\\([^)]*\\)\\s*\\{', 'm');

/** 真源码破坏 → 整仓镜像 → 同款判据（本仓 v310/v311/v3225 同款基建）。 */
function withMirror(mut, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3230-mir-'));
    try {
        fs.cpSync(ROOT, dir, { recursive: true, filter: (s) => !s.split(path.sep).includes('.git') });
        for (const [rel, body] of Object.entries(mut)) fs.writeFileSync(path.join(dir, rel), body);
        return fn(dir);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
/** 跑扫描器（在指定树里），返回 { status, out }。 */
function runScan(dir, script) {
    const r = spawnSync(process.execPath, [path.join('tests', 'audit', script)], { cwd: dir, encoding: 'utf8', timeout: 180000 });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

/* ══════════ A 处置本身 ══════════ */
test('v3230 A1. ★★★ 四条方法定义确已删除（跨文件扫描面）', () => {
    const mods = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && !f.endsWith('.bak'));
    for (const n of DISPOSED) {
        for (const f of mods) {
            const src = f === 'index.js' ? idxSrc : read(path.join(ROOT, f));
            assert.equal(defRe(n).test(src), false, f + ' 里不得再有 ' + n + ' 的定义形态');
        }
    }
    /* 对照：处置**前**确实有过（台账是删过东西的证据，不是空文件） */
    const archived = DISPOSED.filter((n) => ledger.includes(n));
    assert.deepEqual(archived.sort(), [...DISPOSED].sort(), '台账必须记着这四条（删过什么要说得出）');
});

test('v3230 A2. ★★ 保留面逐条在场（删代码最怕删错同族兄弟）', () => {
    for (const keep of [
        'fulfillPromise(id) {',                 // 同族的「履行」入口（测试在用，保留）
        'resolvePromise(id, status',            // 产品路径唯一入口（两个旧入口都不再直调）
        'hybridMerge(results) {',               // 遗留融合的**活**替代者
        'queryByRef(refId) {',                  // OpLog 三类检索里的仍活着的两条
        'queryByType(type) {',
        'recent(n) {',
    ]) {
        assert.ok(idxSrc.includes(keep), '保留面缺失: ' + keep);
    }
});

test('v3230 A3. ★★★ 台账为处置台账：[已删·分类] + 方法名 + 理由，逐条齐备', () => {
    const lines = ledger.split('\n').filter((l) => /^#\s*\[已删·/.test(l.trim()));
    assert.equal(lines.length, DISPOSED.length, '处置台账条数应与 DISPOSED 一致，实得 ' + lines.length);
    for (const l of lines) {
        const m = /^#\s*\[已删·([^\]]+)\]\s*([A-Za-z_][A-Za-z0-9_]*)\s*—\s*(.+)$/.exec(l.trim());
        assert.ok(m, '每条须形如「# [已删·分类] 方法名 — 理由」: ' + l.slice(0, 80));
        assert.ok(m[1].length >= 2, '分类不得为空: ' + l.slice(0, 80));
        assert.ok(DISPOSED.includes(m[2]), '方法名须是本次处置的四条之一: ' + m[2]);
        assert.ok(m[3].trim().length >= 10, '理由不得是空话: ' + m[3]);
    }
});

/* ══════════ B 基线不退化 ══════════ */
test('v3230 B1. ★★★ 冻结基线当前为空集，但台账非空（防「空对空」退化成永远绿）', () => {
    const base = ledger.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    assert.deepEqual(base, [], '当前零引用集合应为空（四条已在 v3.229.0 处置），实得 ' + base.join(', '));
    const ledgered = ledger.split('\n').filter((l) => /^#\s*\[已删·/.test(l.trim()));
    assert.ok(ledgered.length >= 4, '台账不得随基线一起清空（那才是真的把判据删了）');
});

test('v3230 B2. ★★ 反坐实留痕：与配置键无绑定关系这件事必须写在台账里', () => {
    assert.match(ledger, /hybridAlpha/, '台账必须写明 hybridAlpha 的活消费点是 hybridMerge（与遗留方法无绑定）');
    assert.match(ledger, /配置键|hybridMerge/, '反坐实须写清「为什么原推测不成立」');
    /* 实测：配置键仍是活配置（scan_config_liveness 是这条的常驻判据） */
    const { status, out } = runScan(ROOT, 'scan_config_liveness.mjs');
    assert.equal(status, 0, '删除后配置活性审计仍须通过: ' + out.slice(-200));
});

/* ══════════ C 口径与扫描面未退化 ══════════ */
test('v3230 C1. ★★ A7 扫描面仍含全部根级模块（不得退回只扫 index.js）', () => {
    const scan = read(path.join(AUDIT, 'scan_wiring.mjs'));
    assert.match(scan, /ROOT_MODULES/, '扫描面自述在场');
    assert.match(scan, /基线里的方法已不再零引用/, '基线长霉仍须报（双向判据未拆）');
    const { status, out } = runScan(ROOT, 'scan_wiring.mjs');
    assert.equal(status, 0, 'scan_wiring 在健康树上必须 exit 0: ' + out.slice(-300));
    assert.match(out, /零引用 0/, '读数应为零引用 0（本条读的是实测，不是基线）');
});

/* ══════════ N 负控制（真源码破坏 → 整仓镜像 → 同款判据） ══════════ */
test('v3230 N1. ★★★ 再塞一个零引用方法 ⇒ A7.1 必须硬失败（新增即红）', () => {
    /* 为什么这条不能省：本版把基线清空了，若「新增零引用即红」也随之失效，
     *   冻结基线就从判据退化成了一句注释。破坏形态选**最像真实回归**的一种：
     *   有人重新加回一个没人调的方法。
     * 【口径纪律 · 本轮实测的坑】探针方法名必须**运行时拼接**构造 ——
     *   A7 的扫描面含 tests/ 全量在役 .mjs，若完整方法名字面量写在本文件里，
     *   扫描器会把「本判据的探针文本」当成「有一条测试引用」，
     *   于是该名字落进 A7.2 仅测试引用、而非 A7.1 零引用 —— 负控制当场变假绿。
     *   实测形态：方法 430→431 / 仅测试 33→34 / 零引用仍为 0（破坏根本没被观测到）。 */
    const PROBE = 'probeDead' + 'MethodN1';
    const anchor = '        buildQuery(context) {';
    assert.equal(idxSrc.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    const mutIdx = idxSrc.replace(anchor, '        ' + PROBE + '() { return 1; }\n' + anchor);
    assert.notEqual(mutIdx, idxSrc, '破坏必须真发生');
    const { status, out } = withMirror({ 'index.js': mutIdx }, (dir) => runScan(dir, 'scan_wiring.mjs'));
    assert.equal(status, 1, '新增零引用方法后必须 exit 1；实际 ' + status);
    assert.match(out, /A7\.1 新增零引用方法/, '必须点名 A7.1 新增零引用: ' + out.slice(-300));
    assert.ok(out.includes(PROBE), '点名必须落到具体方法名上');
});

test('v3230 N2. ★★ 基线里塞活方法名 ⇒ 扫描器必须点名「已不再零引用」', () => {
    const mutTsv = ledger + '\nbuildInjection\n';
    const { status, out } = withMirror({ [path.join('tests', 'audit', 'scan_wiring_dead_methods.tsv')]: mutTsv }, (dir) => runScan(dir, 'scan_wiring.mjs'));
    assert.equal(status, 1, '基线污染必须 exit 1；实际 ' + status);
    assert.match(out, /基线里的方法已不再零引用/, '必须点名基线长霉: ' + out.slice(-300));
});

/* ══════════ D 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3230 D1. ★ 版本锚（下限形，当版精确判定交当版 frontier 套件）+ 三源同源', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(idxSrc) || [])[1];
    /* [v3.230.0] 当版锚交棒：本套件出生版本 3.229.0，抬版后改为下限锚（仓内口径，
     *   见 tests/audit/scan_version_guard.mjs 的 V2/V4 判定），
     *   当版精确判定交给当版 frontier 套件（本版即 v3231 F1）。 */
    assert.ok(vnum(codeVer) >= vnum('3.229.0'), '本套件只在 3.229.0 及以后成立；当前 ' + codeVer);
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const mf = JSON.parse(read(path.join(ROOT, 'manifest.json')));
    assert.equal(pkg.version, codeVer, 'package.json 同源');
    assert.equal(mf.version, codeVer, 'manifest.json 同源');
    assert.ok(vnum(codeVer) >= vnum('3.229.0'));
});
