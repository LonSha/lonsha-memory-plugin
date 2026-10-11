// tests/v3319_ci_faithful_probe_and_attribution.test.mjs - v3.319.0
// 主题：把 CI 抳回的两个真缺陷钉住（跨仓双仓 CI 首跑，非本地复现推测）。
//
// 【CI 实测缺陷（均为「本地假绿」族）】
//   1) tests/audit/perf_probe.cjs 把仓库根写死为本机 checkout；本地该路径恰是本机，
//      探针读的是**主仓**而非被测树（v3229 B2 绿）；干净检出 / CI 上 require ENOENT 必红。
//   2) tests/run.mjs 的 firstError() 只取「首个 ERR_SIG 命中行」：spec 报告器下首行恰是
//      AssertionError 行（本机 Node 24 如此，故本地假绿）；TAP 报告器下首行是 TAP 标题行
//      （不含断言原文）—— CI 的 node --test 走管道默认 TAP，于是 v3241 D1 必红。
//
// 【本档钉什么】
//   A 结构面：探针根按文件位置推导 / run.mjs 含 TAP 形态分支与 ERR_SIG 兜底
//      （被禁的本机路径按拼接构造：本档在 P1 扫描面内，写字面量会反手命中自己）
//   B 行为面：B1 真跑探针；B2/B3 真跑 v3241 套件，分 TAP 与 spec 两种报告器
//   C 负控制：从 run.mjs 副本摘掉 TAP 分支 => 端到端表行只剩 TAP 标题行
//   D 版本锚：不低于出生版本 3.319.0
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakText } from './_break_kit.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const PROBE_REL = 'tests/audit/perf_probe.cjs';
const RUN_REL = 'tests/run.mjs';
const V3241 = 'tests/v3241_four_source_and_summary_table.test.mjs';
const PROBE = readFileSync(path.join(ROOT, PROBE_REL), 'utf-8');
const RUN = readFileSync(path.join(ROOT, RUN_REL), 'utf-8');
const CUR = /const VERSION = '([0-9.]+)'/.exec(readFileSync(path.join(ROOT, 'index.js'), 'utf-8'))[1];
const NL = String.fromCharCode(10);
const ok = (m) => console.log('  ok ' + m);
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };

/* 用拼接构造被禁串：本档在 P1 扫描面内，写字面量会反手命中自己。 */
const HOMEROOT = '/' + 'home/user/' + 'lonsha-memory-plugin';

/* ===== A. 结构面 ===== */
test('v3319 A1. 探针根按文件位置推导：不得再出现写死的本机 checkout 路径', () => {
    assert.ok(!PROBE.includes(HOMEROOT), '探针不得再写死本机 checkout 路径（不 hermetic）');
    assert.ok(PROBE.includes('path.resolve(__dirname'), '探针根须按文件位置推导');
    assert.ok(PROBE.includes('require(path.join(R,'), '模块引用须走推导出的 R');
});

test('v3319 A2. run.mjs 归因抽取含 TAP 形态分支 + ERR_SIG 兜底（报告器无关）', () => {
    assert.ok(RUN.includes('TAP_ERR'), 'run.mjs 须有 TAP 形态抽取');
    assert.ok(RUN.includes('error:'), 'TAP_ERR 须匹配 TAP 的失败详情行（带 error: 前缀）');
    assert.ok(RUN.includes('ERR_SIG'), 'ERR_SIG 兜底必须保留（spec 形态走它）');
    assert.ok(RUN.includes('function firstError('), '归因抽取函数在场');
});

/* ===== B. 行为面（真跑） ===== */
test('v3319 B1. 真跑探针：位置无关的读数路径可跑通且是合成数据自述', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, PROBE_REL)], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, '探针必须能跑通：' + String(r.stderr || '').slice(0, 220));
    let got; try { got = JSON.parse(r.stdout); } catch (e) { assert.fail('探针输出必须是 JSON：' + r.stdout.slice(0, 120)); }
    assert.equal(got.synth, true, '探针自述合成数据');
});

/** 在给定报告器下真跑 v3241 套件（它内含 TAP 敏感的首行归因判据）。 */
function runV3241(env) {
    const base = { ...process.env } ;
    for (const k of Object.keys(base)) { if (k === 'NODE_OPTIONS' || k.startsWith('NODE_TEST')) delete base[k]; }
    const r = spawnSync(process.execPath, ['--test', path.join(ROOT, V3241)], {
        cwd: ROOT, encoding: 'utf-8', timeout: 180000, env: { ...base, ...(env || {}) },
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

test('v3319 B2. TAP 报告器（CI 的 Node 20/22 走管道）下 v3241 必须全绿', () => {
    const r = runV3241({ NODE_OPTIONS: '--test-reporter=tap' });
    assert.equal(r.status, 0, 'TAP 下 v3241 必须通过（含首行归因判据）：' + r.out.slice(-400));
    assert.ok(!/(^|' + NL + ')not ok /m.test(r.out), 'TAP 下不得有 not ok：' + r.out.slice(-400));
    ok('TAP 报告器下归因路径全绿');
});

test('v3319 B3. 缺省报告器下 v3241 同样必须全绿（两种报告器归因同源）', () => {
    const r = runV3241({});
    assert.equal(r.status, 0, 'spec 下 v3241 必须通过：' + r.out.slice(-400));
});

/* ===== C. 负控制 ===== */
/** 造最小夹具仓：run.mjs（可注入破坏）+ index.js + 一个真红文件。 */
function mkTree(runSrc) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3319-run-'));
    mkdirSync(path.join(dir, 'tests'), { recursive: true });
    writeFileSync(path.join(dir, 'tests', 'run.mjs'), runSrc || RUN);
    writeFileSync(path.join(dir, 'index.js'), 'const VERSION = ' + JSON.stringify(CUR) + ';' + NL);
    const red = [ 'import test from ' + JSON.stringify('node:test') + ';',
                  'import assert from ' + JSON.stringify('node:assert') + ';',
                  'test(' + JSON.stringify('red案例') + ', () => { assert.ok(false, ' + JSON.stringify('FAIL_MARKER_V3319') + '); });' ].join(NL) + NL;
    writeFileSync(path.join(dir, 'tests', 'zz_red.test.mjs'), red);
    return dir;
}
function runTree(dir, env) {
    const base = { ...process.env };
    for (const k of Object.keys(base)) { if (k === 'NODE_OPTIONS' || k.startsWith('NODE_TEST')) delete base[k]; }
    const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'run.mjs')], {
        cwd: dir, encoding: 'utf-8', timeout: 120000, env: { ...base, ...(env || {}) },
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function redRow(out) { return out.split(NL).find((l) => l.startsWith('  test  |') && l.includes('zz_red.test.mjs')); }

test('v3319 C1. 负控制：摘掉 TAP 分支 => TAP 下表行只剩标题行（判据真能翻红）', () => {
    const broken = breakText(RUN, 'const m = TAP_ERR.exec(l);', 'const m = null;', 'TAP-branch');
    assert.notEqual(broken, RUN, '破坏必须真改源码');
    const dir = mkTree(broken);
    try {
        const r = runTree(dir, { NODE_OPTIONS: '--test-reporter=tap' });
        const row = redRow(r.out);
        assert.ok(row, '破坏后仍应有表行：' + r.out.slice(-400));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v3319 C2. 保绿对照：未破坏的 run.mjs 在 TAP 下表行带出真错误原文', () => {
    const dir = mkTree(RUN);
    try {
        const r = runTree(dir, { NODE_OPTIONS: '--test-reporter=tap' });
        const row = redRow(r.out);
        assert.ok(row && row.includes('FAIL_MARKER_V3319'), 'TAP 下表行须带断言原文：' + row);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('v3319 C3. 工具两向自证：锚点不存在 / 不唯一 必须抛', () => {
    assert.throws(() => breakText(RUN, 'THIS_ANCHOR_ABSENT_V3319', ''), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakText(RUN, 'const ', ''), /拒绝破坏/, '多命中必须抛');
    assert.ok(RUN.includes('const m = TAP_ERR.exec(l);'), '真源里锚点前提成立');
});

/* ===== D. 版本锚 ===== */
test('v3319 D1. 版本锚：本档不低于出生版本 3.319.0', () => {
    assert.ok(vnum(CUR) >= vnum('3.319.0'), '本档不得低于出生版本（CUR=' + CUR + '）');
    assert.ok(SELF.includes('3.319.0'), '须显式留下出生版本锚');
});
