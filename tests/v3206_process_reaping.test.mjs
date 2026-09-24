/* ============================================================
 * tests/v3206_process_reaping.test.mjs — v3.206.0
 *
 * 主题：测试与审计的**执行成本与资源回收**（M-P0）。
 *
 * 两块内容：
 *   A. 审计段并发化（tests/run.mjs）—— 39 个审计脚本由串行改为受控并发。
 *      实测：审计段 47.5s → 16.0s，`--audit` 总耗时 74.1s → 51.6s。
 *      等价性不是「看起来没冲突」，而是拿 `--audit-jobs 1` 做对照实测：
 *      39 个脚本名集合一致 + 逐项通过状态一致 + 汇总一致。
 *      另加单进程输出上限（4MB，只截累积、判据仍看退出码）。
 *   B. 子进程**统一回收**（v3159 的 spawnOne）—— 同一根因的第二处。
 *      v3.205.0 把「并行偶发假红」的真根因定为孙进程泄漏，修好了 tests/run.mjs，
 *      但测试侧的 spawnOne 仍是裸 spawn：超时只杀直接子进程，孙进程被孤儿化。
 *      实测（人为制造超时）：旧形态留下 1 个存活孙进程（PPID=1），
 *      改 detached + 进程组收割后为 0 个。并把它固化成常驻门禁
 *      tests/audit/scan_process_reaping.mjs。
 *
 * 覆盖：
 *   0  版本锚（锁自己的出生版本，不随抬版上抬）
 *   1  A 结构面：审计段并发池 / 并发度开关 / 输出上限 / 失败现场定位
 *   2  B 结构面：v3159 的 spawnOne 已独立进程组 + 按进程组收割（三条路径）
 *   3  B 行为面：门在真仓库上 exit 0 且读数可察
 *   4  负控制 N1：拆掉 detached → 门必须 exit 1 且点名 R1
 *   5  负控制 N2：拆掉进程组收割 → 门必须 exit 1 且点名 R2
 *   6  负控制 N3：新增一个裸 spawn 文件 → 门必须点名它（不是清单式判据）
 *   7  负控制 N4：空转（无 spawn 使用者）→ 必须 exit 2，不是 exit 0
 *   8  fail-closed：缺 tests/run.mjs → 必须 exit 2
 *   9  保绿对照：合法形态（detached + 组收割）→ 必须 exit 0（判据要能红能绿）
 *   10 负控制工具两向自证：锚点不存在/不唯一必须抛，命中一次必须真破坏
 *   11 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = REPO_ROOT;
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');
const RUN = read('tests/run.mjs');
const V3159_REL = 'tests/v3159_audit_failclosed_and_fallback_parity.test.mjs';
const V3159 = read(V3159_REL);
const GATE_REL = 'tests/audit/scan_process_reaping.mjs';
const GATE = read(GATE_REL);

function vnum(x) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(x || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

/* ══════════ 0. 版本锚 ══════════ */
test('v3206 0. 版本三源互等，且不低于 3.206.0（锁自己的出生版本）', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(read('index.js'))[1];
    const mf = JSON.parse(read('manifest.json'));
    const pk = JSON.parse(read('package.json'));
    assert.strictEqual(v, mf.version, 'manifest 须跟随 index.js');
    assert.strictEqual(v, pk.version, 'package.json 须跟随 index.js');
    assert.ok(vnum(v) >= vnum('3.206.0'), '本版不得低于 3.206.0，实 ' + v);
});

/* ══════════ 1. A 结构面：审计段并发化 + 成本可定位 ══════════ */
test('v3206 1. A 审计段并发化在位：受控并发池 / 独立并发度 / 输出上限 / 失败现场定位', () => {
    for (const [needle, why] of [
        ['--audit-jobs', '审计段并发度开关'],
        ['OPT.auditJobs', '并发度解析落点'],
        ['AUDIT_JOBS', '环境变量覆写（负控制与对照需要）'],
        ['await pool(scripts, OPT.auditJobs, (s) => runOne(s, false))', '审计段须走受控并发池'],
        ['Math.min(4, OPT.jobs)', '默认并发度口径（不与测试段抢进程槽位）'],
        ['const MAX_OUT = 4 * 1024 * 1024;', '单进程输出上限'],
        ['truncated', '输出截断标记（只截累积，判据仍看退出码）'],
        ['[audit] 通过 ', '审计段汇总行（成本可定位）'],
        ['最慢 3', '最慢脚本点名'],
        ['↳ 重跑定位', '失败可定位到脚本'],
        ['↳ 现场摘要', '失败有现场（不是只报文件名）'],
    ]) assert.ok(RUN.includes(needle), why + '：' + needle);
    /* 旧的串行形态必须已消失：`for (const s of scripts)` 逐条 await runOne。
     *   若它回来了，并发化的收益与「等价性已被对照验证」的前提同时失效。 */
    assert.ok(!/for \(const s of scripts\)[^\n]*\n[^\n]*await runOne\(s, false\)/.test(RUN),
        '审计段不得退回逐条串行（并发化已由对照组实测等价）');
});

/* ══════════ 2. B 结构面：测试侧 spawnOne 已统一回收 ══════════ */
test('v3206 2. B v3159 的 spawnOne 已独立进程组 + 按进程组收割（超时/close/error 三条路径）', () => {
    assert.ok(/detached:\s*true/.test(V3159), 'v3159 缺独立进程组（超时会孤儿化孙进程）');
    assert.ok(/function killGroupOne\(child\)/.test(V3159), '缺按进程组收割的辅助函数');
    assert.ok(/process\.kill\(-child\.pid, 'SIGKILL'\)/.test(V3159), '缺按进程组杀（只杀直接子进程对孙无效）');
    // 三条路径都要收：超时、正常 close（父先于孙结束）、error
    const calls = [...V3159.matchAll(/killGroupOne\(child\);/g)].length;
    assert.ok(calls >= 3, '进程组收割须覆盖超时/close/error 三条路径，实 ' + calls + ' 处');
    assert.ok(/const timer = setTimeout\(\(\) => \{ killed = true; killGroupOne\(child\); \}/.test(V3159),
        '超时路径须走进程组收割');
});

/* ══════════ 3. B 行为面：门在真仓库上通过且读数可察 ══════════ */
test('v3206 3. B 行为面：门在真仓库 exit 0，且念出扫描面 / spawn 使用者 / 问题数', () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, GATE_REL)], {
        cwd: ROOT, encoding: 'utf-8', timeout: 120000,
    });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树上必须 exit 0：' + out.slice(-400));
    assert.ok(/扫描面 [1-9][0-9]* 文件/.test(out), '须念出扫描面文件数（退化时可察）');
    assert.ok(/使用异步 spawn [1-9][0-9]* 个/.test(out), '须念出 spawn 使用者数');
    assert.ok(/问题 0/.test(out), '须报「问题 0」');
    // 两个使用者必须都在读数里（防「只认一个文件」的清单式判据）
    assert.ok(out.includes('tests/run.mjs'), '读数须含 run.mjs');
    assert.ok(out.includes('v3159_audit_failclosed_and_fallback_parity.test.mjs'), '读数须含 v3159');
});

/* ══════════ 4-9. 负控制：真源码破坏 → 独立树 → 同款真判据 ══════════ */
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    return src.split(anchor).join(repl);
}
/* 独立树：本仓只**读**，绝不就地改（v3.205.0 的 acc4 教训：跑批期间改仓库会自伤）。 */
function mkTree() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3206-reap-'));
    for (const item of readdirSync(ROOT)) {
        if (item === '.git' || item === 'node_modules') continue;
        cpSync(path.join(ROOT, item), path.join(dir, item), { recursive: true });
    }
    return dir;
}
function runGateOn(root) {
    const r = spawnSync(process.execPath, [path.join(ROOT, GATE_REL)], {
        cwd: root, encoding: 'utf-8', timeout: 120000,
        env: { ...process.env, LONSHA_AUDIT_ROOT: root },
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function withTree(mutate) {
    const dir = mkTree();
    try {
        mutate(dir);
        return runGateOn(dir);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

test('v3206 4. 负控制 N1：拆掉 detached → 必须 exit 1 并点名 R1', () => {
    const r = withTree((d) => {
        const p = path.join(d, V3159_REL);
        const src = readFileSync(p, 'utf-8');
        writeFileSync(p, breakText(src, 'detached: true,', 'detached: false,'));
    });
    assert.strictEqual(r.status, 1, '拆掉独立进程组后门必须红：' + r.out.slice(-400));
    assert.ok(/R1 独立进程组缺失/.test(r.out), '须点名 R1：' + r.out.slice(-300));
    assert.ok(r.out.includes('v3159_audit_failclosed_and_fallback_parity.test.mjs'), '须点名具体文件');
});

test('v3206 5. 负控制 N2：拆掉进程组收割 → 必须 exit 1 并点名 R2', () => {
    const r = withTree((d) => {
        const p = path.join(d, V3159_REL);
        const src = readFileSync(p, 'utf-8');
        // 只把「按进程组杀」改成「只杀直接子进程」——保留 detached，定向验证 R2 承重
        const broken = src.replace(/process\.kill\(-child\.pid, 'SIGKILL'\)/g, 'child.kill("SIGKILL")');
        assert.ok(broken !== src, '破坏须真的发生');
        writeFileSync(p, broken);
    });
    assert.strictEqual(r.status, 1, '拆掉进程组收割后门必须红：' + r.out.slice(-400));
    assert.ok(/R2 进程组收割缺失/.test(r.out), '须点名 R2：' + r.out.slice(-300));
    // R2 是定向的：R1 仍绿（detached 还在），证明确实测的是这一条
    assert.ok(!/R1 独立进程组缺失[^\n]*v3159/.test(r.out), '该破坏应当是定向的：R1 不该同时报 v3159');
});

test('v3206 6. 负控制 N3：新增一个裸 spawn 文件 → 门必须点名它（不是清单式判据）', () => {
    const r = withTree((d) => {
        writeFileSync(path.join(d, 'tests', 'zz_nc_bare_spawn.test.mjs'), [
            "import { spawn } from 'node:child_process';",
            'const c = spawn(process.execPath, ["-e", "0"], { stdio: "ignore" });',
            'c.on("close", () => {});',
            '',
        ].join('\n'));
    });
    assert.strictEqual(r.status, 1, '新增裸 spawn 必须被门抓到：' + r.out.slice(-400));
    assert.ok(r.out.includes('zz_nc_bare_spawn.test.mjs'), '须点名新增的那个文件（按扫描面判，不是按清单）：' + r.out.slice(-300));
});

test('v3206 7. 负控制 N4：空转（扫描面无 spawn 使用者）→ 必须 exit 2，不是 exit 0', () => {
    const r = withTree((d) => {
        // 把所有使用异步 spawn 的文件退化成「没有 spawn」：门不得因此报绿
        for (const f of ['tests/run.mjs', V3159_REL]) {
            const p = path.join(d, f);
            writeFileSync(p, '// no async spawn here\nexport const x = 1;\n');
        }
    });
    assert.strictEqual(r.status, 2, '空转必须是结构漂移（exit 2），不是通过：' + r.out.slice(-400));
    assert.ok(/结构漂移|判据不具证明力/.test(r.out), '须说明是探测器空转：' + r.out.slice(-300));
});

test('v3206 8. fail-closed：缺 tests/run.mjs → 必须 exit 2（不是 0，也不是 1）', () => {
    const r = withTree((d) => rmSync(path.join(d, 'tests', 'run.mjs')));
    assert.strictEqual(r.status, 2, '前置读不到必须 fail-closed：' + r.out.slice(-300));
    assert.ok(r.out.includes('run.mjs'), '应说清缺的是什么：' + r.out.slice(-200));
});

test('v3206 9. 保绿对照：合法形态（detached + 进程组收割）→ 必须 exit 0（判据要能红能绿）', () => {
    const r = withTree((d) => {
        const p = path.join(d, 'tests', 'zz_nc_ok_spawn.test.mjs');
        writeFileSync(p, [
            "import { spawn } from 'node:child_process';",
            'function killGroupOne(child) {',
            "  try { process.kill(-child.pid, 'SIGKILL'); } catch {}",
            "  try { child.kill('SIGKILL'); } catch {}",
            '}',
            'const c = spawn(process.execPath, ["-e", "0"], { stdio: "ignore", detached: true });',
            'c.on("close", () => killGroupOne(c));',
            '',
        ].join('\n'));
    });
    assert.strictEqual(r.status, 0, '合法形态不得被误杀（判据要能红能绿）：' + r.out.slice(-400));
    assert.ok(/问题 0/.test(r.out), '须报「问题 0」：' + r.out.slice(-200));
});

/* ══════════ 10. 负控制工具两向自证 ══════════ */
test('v3206 10. 负控制工具两向自证：锚点不存在 / 不唯一必须抛，命中一次必须真破坏', () => {
    assert.throws(() => breakText('abc', 'zzz', 'q'), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakText('abcabc', 'abc', 'q'), /拒绝破坏/, '锚点不唯一必须抛');
    assert.strictEqual(breakText('abc', 'abc', 'q'), 'q', '锚点唯一时必须真破坏');
    // 工具两向自证的**前提**：即将用到的锚点在真源码里确实恰中 1 次
    assert.strictEqual(V3159.split('detached: true,').length - 1, 1, 'N1 锚点在真源码里须恰中 1 次');
    assert.strictEqual((V3159.match(/process\.kill\(-child\.pid, 'SIGKILL'\)/g) || []).length, 1,
        'N2 锚点在真源码里须恰中 1 次');
});

/* ══════════ 11. 判据面自防护 ══════════ */
test('v3206 11. 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水', () => {
    const nAssert = (SELF.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 40, '断言数不得缩水（>= 40），实际 ' + nAssert);
    const nl = SELF.split('\n').filter((l) => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(nl >= 100, '有效代码行不得缩水（>= 100），实际 ' + nl);
    for (const [label, needle] of [
        ['A：审计段并发池', 'OPT.auditJobs'],
        ['A：输出上限', 'MAX_OUT'],
        ['A：失败现场定位', '重跑定位'],
        ['B：进程组收割', 'killGroupOne'],
        ['B：独立进程组', 'detached: true'],
        ['门：R1 标记', 'R1 独立进程组缺失'],
        ['门：R2 标记', 'R2 进程组收割缺失'],
        ['门：R3 空转判据', '判据不具证明力'],
        ['负控制：独立树', 'mkTree'],
        ['负控制：不弄脏本仓', 'v3206-reap-'],
        ['负控制：新增文件被抓', 'zz_nc_bare_spawn'],
        ['保绿对照', '判据要能红能绿'],
    ]) {
        const hay = SELF + GATE + RUN;
        assert.ok(hay.includes(needle), '关键指纹缺失：' + label + '（' + needle + '）');
    }
    assert.ok(existsSync(path.join(ROOT, GATE_REL)), '门脚本必须在位：' + GATE_REL);
});
