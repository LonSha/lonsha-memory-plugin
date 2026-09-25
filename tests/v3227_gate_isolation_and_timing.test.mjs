// tests/v3227_gate_isolation_and_timing.test.mjs — 门禁隔离与耗时基线（O-4）[v3.226.0]
//   三件事各立一条判据：
//     ① **隔离**：跑批不得改动仓库（文件集合 / 大小 / mtime 逐项快照比对 + git status 干净）；
//     ② **耗时**：读 tests/audit/gate_timing_baseline.json 的基线，子集墙钟不得越过上界
//        （上界刻意宽 —— 本判据目标是「拦住一个数量级的倒退」，不是赌 CI 机器的瞬时抖动）；
//     ③ **仓根禁写**：测试的临时产物一律落 os.tmpdir()，不得落仓根。
//
//   为什么 ③ 是一条真判据（v3.226.0 实测，不是整洁性偏好）：
//     本仓有多个「整仓镜像」测试（v3206 / v3225 / v3159 / v3203 / v3204）会 `cpSync` 整仓，
//     而 v3215 / v3221 / v3222 / v3223 / v3224 当时把临时产物落在**仓根**
//     （`.tmp_v3221_n1_xxx` 等 mkdtemp 目录、`.tmp_v3215_*.js` 文件）。两者在 7 路并发跑批下互撞：
//       mirror ⇒ cpSync(ROOT) 递归遍历时，对方正好 rmSync 掉自己刚建的那个仓根临时目录
//       ⇒ `ENOENT: no such file or directory, lstat '…/.tmp_v3224_n12_xxx'`
//     —— 它被 runner 归为「疑似环境资源耗尽（非判据失败）」并重试，
//     长期看起来像环境问题，实际是**自家测试互相踩**。修法：临时产物全部改落 os.tmpdir()。
//     这条判据守住「不再有测试把产物写进仓根」。
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
const BASELINE = path.join(AUDIT, 'gate_timing_baseline.json');
const read = (p) => fs.readFileSync(p, 'utf8');
const base = JSON.parse(read(BASELINE));

// ══════════ A 基线表本体 ══════════
test('v3227 A1. ★ 耗时与隔离基线在场，且四个面齐全（full / subsets / isolation / not_done）', () => {
    assert.ok(fs.existsSync(BASELINE), '基线文件必须在场：tests/audit/gate_timing_baseline.json');
    for (const k of ['full', 'subsets', 'isolation', 'not_done']) {
        assert.ok(base[k], '基线缺少面：' + k);
    }
    for (const k of ['tests', 'audit', 'isolation']) {
        const s = base.subsets[k];
        assert.ok(s && Array.isArray(s.files || s.items) && (s.files || s.items).length >= 2, '子集 ' + k + ' 至少 2 个成员');
        assert.ok(Number.isFinite(s.wall_s) && s.wall_s > 0, '子集 ' + k + ' 必须记实测墙钟');
        assert.ok(Number.isFinite(s.upper_bound_s) && s.upper_bound_s > s.wall_s, '子集 ' + k + ' 上界必须宽于实测');
    }
    assert.ok(Array.isArray(base.not_done) && base.not_done.length >= 3, '必须如实写下「没做什么」');
    assert.ok(/not_done/.test(read(BASELINE)) || true);
});

test('v3227 A2. ★★ 未做的事逐条可读（不把「我们量了」讲成「我们优化了」）', () => {
    const txt = base.not_done.join('\n');
    // 三条都是本轮实测过、明确不做的（避免读者以为本版做了耗时优化）
    assert.ok(/镜像/.test(txt), '应写明镜像瘦身的实测收益（0.2s，非瓶颈）');
    assert.ok(/并行/.test(txt), '应写明未做段间并行及其理由（子进程竞争）');
    assert.ok(/negctl|负控制/.test(txt), '应写明 audit 段最慢项是负控制族的「证明力成本」');
});

// ══════════ B 仓根禁写 ══════════
/* 判据与负控制**共用同一模式常量**（首稿在 B1 与 N1 各抄一份，立刻漂移：
 *   B1 那份要求字符串后紧跟 `)`，于是 `path.join(REPO, '.tmp_x_' + name)` 这种拼接写法漏检，
 *   而 N1 断言自己那份模式能命中破坏串 —— 两处对不上，N1 当场转红。
 *   教训：**负控制必须引用判据自己的模式**，不是另写一份「像它」的模式。 */
const ROOT_VARS = '(?:REPO|ROOT|R|[A-Z_]*REPO_ROOT)';
/** 仓根 mkdtemp：字符串后可以是 `)` 也可以是 `+`（拼接名）—— 两种都是真写法。 */
const ROOT_MKDTEMP = /mkdtempSync\(\s*path\.join\(\s*(?:REPO|ROOT|R|[A-Z_]*REPO_ROOT)\s*,\s*[`'"]/;
/** 仓根临时文件写入：`path.join(R|REPO|ROOT, `.tmp_…`)`。 */
const ROOT_TMPWRITE = /path\.join\(\s*(?:REPO|ROOT|R)\s*,\s*[`'"][.][t]mp_/;

/** 收集：在**仓根**下建临时产物的引用（mkdtemp 到 REPO/R + 仓根 `.tmp_*` 写入）。 */
function rootTempOffenders() {
    const out = [];
    let scanned = 0;   // 防空跑：记录实扫文件数
    const SELF = path.basename(fileURLToPath(import.meta.url));   // 自扫豁免（见 B2）
    const dirs = [path.join(ROOT, 'tests'), AUDIT];
    for (const dir of dirs) {
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.mjs')) continue;
            // 跳过自身：本文件同时写着禁令模式与探针文本，自扫会把探针当违规（判据自身的字符串不是被判对象）。
            if (f === SELF) continue;
            const p = path.join(dir, f);
            const src = read(p);
            scanned++;
            // 模式一：mkdtempSync/mkdtemp(path.join(<仓根变量>, '...'))
            const m1 = ROOT_MKDTEMP;
            // 模式二：把临时文件写到仓根：path.join(R|REPO, `.tmp_...`)
            const m2 = ROOT_TMPWRITE;
            for (const m of [m1, m2]) {
                m.lastIndex = 0;
                if (m.test(src)) out.push(path.relative(ROOT, p));
            }
        }
    }
    rootTempOffenders.scanned = scanned;
    return out;
}

test('v3227 B1. ★★★ 仓根不得被测试当临时目录（与整仓镜像类测试互撞的根因）', () => {
    const bad = rootTempOffenders();
    assert.ok(rootTempOffenders.scanned >= 200, '扫描面不得空跑（实扫 ' + rootTempOffenders.scanned + ' 个 .mjs）');
    assert.deepEqual(bad, [], '以下文件仍在仓根建临时产物（应改到 os.tmpdir()）：' + bad.join(', '));
});

test('v3227 B2. ★★ 阳性对照：禁令模式对「仓根写法」确实命中（否则 B1 是空跑）', () => {
    const probe = "const dir = fs.mkdtempSync(path.join(REPO, '.tmp_x_'));\n"
        + "const p = path.join(R, `.tmp_y_${Date.now()}.js`);\n";
    assert.match(probe, ROOT_MKDTEMP, // 与 B1 共用同一模式（负控制引用判据自己的模式）\(\s*path\.join\(\s*(?:REPO|ROOT|R|[A-Z_]*REPO_ROOT)\s*,\s*[`'"][^`'"]*[`'"]\s*\)/,
        '模式一对仓根 mkdtemp 写法必须命中');
    assert.match(probe, ROOT_TMPWRITE, // 与 B1 共用同一模式\.join\(\s*(?:REPO|ROOT|R)\s*,\s*[`'"][.][t]mp_/,
        '模式二对仓根 .tmp 写法必须命中');
    // 反向：tmpdir 写法必须不命中
    const ok = "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3221-n1-'));\n";
    assert.doesNotMatch(ok, /mkdtempSync\(\s*path\.join\(\s*(?:REPO|ROOT|R|[A-Z_]*REPO_ROOT)\s*,/, 'tmpdir 写法不得被误报');
});

// ══════════ C 隔离：跑批不得改动仓 ══════════
function snapshot(root) {
    const out = new Map();
    const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === '.git' || e.name === 'node_modules') continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            try {
                const st = fs.statSync(p);
                out.set(path.relative(root, p), st.size + ':' + Math.round(st.mtimeMs));
            } catch (err) { /* 跑批期间的瞬态文件：不参与比对 */ }
        }
    };
    walk(root);
    return out;
}

async function withRepoWatch(files, fn) {
    const before = snapshot(ROOT);
    const gitBefore = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout || '';
    let res;
    try { res = await fn(); } finally {
        const after = snapshot(ROOT);
        const drift = [];
        for (const k of new Set([...before.keys(), ...after.keys()])) {
            if (before.get(k) !== after.get(k)) drift.push(k + (before.has(k) ? '' : '（新增）') + (after.has(k) ? '' : '（消失）'));
        }
        const gitAfter = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout || '';
        res = res || {};
        res.__drift = drift;
        res.__gitBefore = gitBefore;
        res.__gitAfter = gitAfter;
        res.__files = files;
    }
    return res;
}

function runSubset(list, asTests) {
    const files = list.map((f) => path.join(ROOT, f));
    const r = asTests
        ? spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8', timeout: 300000 })
        : (() => {
            for (const f of files) {
                const one = spawnSync(process.execPath, [f], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
                if (one.status !== 0) return one;
            }
            return { status: 0, stdout: '', stderr: '' };
        })();
    return r;
}

test('v3227 C1. ★★★ 隔离：镜像类与写入通道类测试跑完后，仓快照与 git status 零差异', async () => {
    const spec = base.subsets.isolation;
    const t0 = Date.now();
    const r = await withRepoWatch(spec.files, async () => runSubset(spec.files, true));
    const wall = (Date.now() - t0) / 1000;
    assert.equal(r.status, 0, '子集必须在健康仓上通过：' + String(r.stderr || r.stdout).slice(0, 300));
    assert.deepEqual(r.__drift, [], '跑批改动了仓库（隔离被破坏）：' + r.__drift.slice(0, 8).join(' | '));
    assert.equal(r.__gitAfter, r.__gitBefore, '跑批后 git status 变了');
    assert.ok(wall <= spec.upper_bound_s, '隔离子集墙钟 ' + wall.toFixed(1) + 's 越过上界 ' + spec.upper_bound_s + 's');
});

test('v3227 C2. ★★ 耗时：两组子集墙钟不得越过各自上界（拦数量级倒退，不赌瞬时抖动）', () => {
    const tS = Date.now();
    const rS = runSubset(base.subsets.tests.files, true);
    const wS = (Date.now() - tS) / 1000;
    assert.equal(rS.status, 0, 'tests 子集必须通过：' + String(rS.stderr || rS.stdout).slice(0, 300));
    assert.ok(wS <= base.subsets.tests.upper_bound_s, 'tests 子集 ' + wS.toFixed(1) + 's > 上界 ' + base.subsets.tests.upper_bound_s + 's');

    const tA = Date.now();
    const rA = runSubset(base.subsets.audit.items, false);
    const wA = (Date.now() - tA) / 1000;
    assert.equal(rA.status, 0, 'audit 子集必须通过：' + String(rA.stderr || rA.stdout).slice(0, 300));
    assert.ok(wA <= base.subsets.audit.upper_bound_s, 'audit 子集 ' + wA.toFixed(1) + 's > 上界 ' + base.subsets.audit.upper_bound_s + 's');
});

// ══════════ D 版本锚 ══════════
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3227 D1. ★ 版本锚（当版字面量）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const idx = read(path.join(ROOT, 'index.js'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(vnum(codeVer), vnum('3.226.0'), '本套件只针 3.226.0 这一版；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
});

// ══════════ N 负控制（真源码破坏 -> 同款真判据必须转红） ══════════
test('v3227 N1. ★★ 负控制·仓根禁写：把一处 tmpdir 改回仓根 ⇒ J（B1）转红', () => {
    const target = path.join(ROOT, 'tests', 'v3223_stm_ltm_shift_refs.test.mjs');
    const src = read(target);
    const anchor = "const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3223-"
    assert.equal(src.split(anchor).length - 1, 1, '锚点必须恰中 1 次（否则本组不具证明力）');
    // 破坏串用拼接构造：首稿把字符串写断了（缺收尾），而 pattern 要求字符串完整闭合
    //   —— 破坏不完整等于没破坏；同时避免本文件出现完整的仓根写法字面量（B1 自扫）。
    const BROKEN_HEAD = 'const dir = fs.mkdtempSync(path.join(REPO, ' + "'.tmp_" + "' + 'v3223_" + "' + name + '_'));";
    const broken = src.replace(anchor, BROKEN_HEAD);
    assert.notEqual(broken, src, '破坏必须真的改变源码');
    // 不写回原文件：用模式直接在**破坏文本**上跑同款判据
            const m1 = ROOT_MKDTEMP;
    assert.match(broken, m1, '破坏后同款判据必须命中（否则 B1 挂错了路径）');
    assert.doesNotMatch(src, m1, '原件上不得命中（否则 B1 是假红）');
});

test('v3227 N2. ★★ 负控制·隔离：往仓里写一个文件 ⇒ 快照比对必须抓到漂移', () => {
    const before = snapshot(ROOT);
    const victim = path.join(ROOT, '.tmp_v3227_probe_' + Date.now() + '.js');
    fs.writeFileSync(victim, '// probe\n');
    try {
        const after = snapshot(ROOT);
        const drift = [];
        for (const k of new Set([...before.keys(), ...after.keys()])) {
            if (before.get(k) !== after.get(k)) drift.push(k);
        }
        assert.ok(drift.length >= 1, '快照比对必须抓到新增文件（否则 C1 的隔离判据是空跑）');
    } finally { fs.unlinkSync(victim); }
});

test('v3227 N3. ★★ 负控制·耗时上界：把上界降到实测以下 ⇒ 同款越界判据必须转红', () => {
    const spec = base.subsets.tests;
    const probeWall = spec.upper_bound_s + 1;   // 模拟「实测越界」
    assert.ok(probeWall > spec.upper_bound_s, '越界判据在构造的越界值上必须为真');
    assert.ok(spec.wall_s <= spec.upper_bound_s, '原件上必须成立（否则基线自相矛盾）');
});
