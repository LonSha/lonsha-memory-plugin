/* ============================================================
 * tests/v3205_infrastructure_truthfulness.test.mjs — v3.205.0
 *
 * 主题：基础设施不得「假装通过」—— 把四类「绿不是真绿」的情形变成判据。
 *
 * 本版销掉 TODO 里四项积压 + 一项实测新发现，全部是**基建**而非业务：
 *   T3 死代码行数上界靠手抬      → 上界唯一真源 tests/audit/dead_code_budget.json
 *   T4 九账楼层字段清单手工枚举  → 容器内事件由同一份清单派生（ledger-replay.js）
 *   T5 ledger/echo 语义重叠待复核 → 复核为「四方不同源」，固化成守卫 P5
 *   T6 退役面覆盖率转移只有人工核对 → 登记表加 covered_by，守卫 P6 + 地板
 *   T7 并行偶发假红              → 真根因两条：孙进程泄漏 + 环境资源耗尽冒充判据失败
 *
 * 覆盖：
 *   0  版本锚（锁自己出生版本，不随抬版上抬）
 *   1  结构面：五项落法各自的标记在位
 *   2  T3 行为面：预算真源读数自洽（上界 >= 实测、余量 <= maxSlack、history 非空）
 *   3  T4 行为面：容器内字段与条目字段**同源派生**（不是另抄一份）
 *   4  T5 行为面：守卫 P5 在场且健康树 exit 0
 *   5  T6 行为面：三重登记表列数与见证在役
 *   6  T7 结构面：killGroup / detached / 失败现场落盘 / 资源指纹重试，且**阈值未动**
 *   5  T3 读数自洽 | 6 T4 派生语义 | 7 T5 守卫实跑 | 8 T6 守卫实跑
 *   9  T7 结构面 | 10 阈值不许被抬 | 11 资源指纹宽度自证
 *   12 负控制 T7a：资源指纹失败 → 明示重试且**夹具真的跑了两次**
 *   13 负控制 T7b：真缺陷 → 不重试、直接红（且夹具真的跑过）
 *   14 负控制 T7c：失败现场落盘开关
 *   15 run.mjs 既有契约 | 16 v3159 并发化语义等价 | 17 判据面自防护
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync, copyFileSync } from 'fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBudget, measureActiveLines } from './audit/dead_code_budget.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = REPO_ROOT;
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');

const RUN = read('tests/run.mjs');
const LEDGER = read('ledger-replay.js');
const XR = read('tests/audit/scan_cross_repo_binding.mjs');
const CA = read('tests/audit/scan_v3202_carryover_archive_diff.mjs');
const V3159 = read('tests/v3159_audit_failclosed_and_fallback_parity.test.mjs');
const V3116 = read('tests/v3116_dead_code.test.mjs');

/* ══════════ 0. 版本锚 ══════════ */
test('v3205 0. 版本三源互等，且不低于 3.205.0（锁自己的出生版本）', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(read('index.js'))[1];
    const mf = JSON.parse(read('manifest.json'));
    const pk = JSON.parse(read('package.json'));
    const vnum = (x) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(x || '').trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
    assert.strictEqual(v, mf.version, 'manifest 须跟随 index.js');
    assert.strictEqual(v, pk.version, 'package.json 须跟随 index.js');
    assert.ok(vnum(v) >= vnum('3.205.0'), '本版不得低于 3.205.0');
});

/* ══════════ 1. 结构面：五项落法各自的标记 ══════════ */
test('v3205 1. T3 落法在位：上界唯一真源（JSON + 导出口），测试不再手写数字', () => {
    for (const f of ['tests/audit/dead_code_budget.json', 'tests/audit/dead_code_budget.mjs']) {
        assert.ok(existsSync(path.join(ROOT, f)), '缺唯一真源：' + f);
    }
    assert.ok(/import \{ readBudget \}/.test(V3116), 'v3116 须从真源 import，而不是内联上界');
    const b = readBudget();
    assert.ok(typeof b.ceiling === 'number' && typeof b.maxSlack === 'number', '真源须给出 ceiling / maxSlack');
    assert.ok(Array.isArray(b.history) && b.history.length >= 10, 'history 须保留历次抬升理由（不得只剩一个数字）');
    assert.ok(b.history.every((h) => typeof h.reason === 'string' && h.reason.trim()), '每条 history 都要有理由');
    // 剥掉行注释与块注释：注释里记「历史上界 32450 → 32700」是留痕，不是内联上界。
    const CODE = V3116
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const lits = [...CODE.matchAll(/\b(3[0-9]{4})\b/g)].map((m) => m[1]);
    assert.deepStrictEqual(lits, [], 'v3116 代码体（剥注释后）不得再出现行数上界字面量（应全部来自真源）：' + lits.join(','));
});

test('v3205 2. T4 落法在位：容器内事件字段由条目清单派生（不是另抄一份）', () => {
    assert.ok(/const LEDGER_CHILD_FLOOR_FIELDS = Object\.freeze\(LEDGER_ITEM_FLOOR_FIELDS\)/.test(LEDGER),
        'shift 侧须直接派生自条目清单');
    assert.ok(/LEDGER_CHILD_NON_IDENTITY_FIELDS = Object\.freeze\(LEDGER_ITEM_FLOOR_FIELDS\.filter\(k => k !== 'floor'\)\)/.test(LEDGER),
        'drop 侧须由同一清单过滤 floor 派生');
    // 两侧都不得再出现「只认 floor」的硬编码容器循环
    assert.ok(!/Array\.isArray\(it\.history\)\) for \(const ev of it\.history\) dec\(ev, 'floor'\)/.test(LEDGER),
        'shift 侧不得退回只认 floor 的硬编码');
    assert.ok(!/filter\(ev => Number\(ev && ev\.floor\) !== f\)/.test(LEDGER),
        'drop 侧不得退回只按 floor 摘除（会让 from/to 指向被删楼层）');
    assert.ok(/for \(const boxName of \['history', 'segments'\]\)/.test(LEDGER),
        '两处容器走同一份容器名清单');
});

test('v3205 3. T5 落法在位：守卫 P5 与独立面真源验证', () => {
    assert.ok(/P5 独立面甄别/.test(CA), 'P5 判据标记须在场');
    assert.ok(/this\\\.ledger\\s\*=\\s\*new\\s\+FloorLedger/.test(CA), 'P5 须在宿主上验证 ledger 真源');
    assert.ok(/echo:\\s\*this\\\.echo\\\?\\\.export/.test(CA), 'P5 须在宿主上验证 echo 真源');
    assert.ok(/同源/.test(CA), 'P5 须显式禁止把独立面说成「同源」');
});

test('v3205 4. T6 落法在位：removal_count 三列登记 + P6 判据 + 地板', () => {
    const tsv = read('tests/audit/catalog_version_guard.tsv');
    const rows = tsv.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    assert.ok(rows.length >= 17, '退役面不得缩水（>= 17），实 ' + rows.length);
    assert.ok(rows.every((r) => r.split('\t').length >= 3), '每行须有第三列 covered_by');
    for (const [needle, why] of [
        ['P6 退役登记缺 covered_by', '缺 covered_by 判据'],
        ['P6 covered_by 引用的见证文件不在役', '空洞引用判据'],
        ['P6 无同等覆盖时必须写明理由', '无覆盖理由判据'],
        ['P6 覆盖率转移判据地板失守', '地板判据（全标 - = 没判据）'],
    ]) assert.ok(XR.includes(needle), why + '：' + needle);
    // 地板必须真的可达：`-` 行数不得超过一半
    const dash = rows.filter((r) => r.split('\t')[2].startsWith('-')).length;
    assert.ok(dash <= rows.length / 2, '当前退役面 `-` 行 ' + dash + '/' + rows.length + ' 已超地板');
});

/* ══════════ 2. T3 行为面：读数自洽 ══════════ */
test('v3205 5. T3 读数自洽：上界 >= 实测，且余量不超过 maxSlack（余量过大等于没守）', () => {
    const b = readBudget();
    const m = measureActiveLines(ROOT);
    assert.ok(m.total > 15000, '实测总量异常偏低（' + m.total + '），疑似误删活跃代码');
    assert.ok(m.total < b.ceiling, '实测总量不得越过上界：' + m.total + ' vs ' + b.ceiling);
    assert.ok(b.ceiling - m.total <= b.maxSlack,
        '上界余量 ' + (b.ceiling - m.total) + ' 超过 maxSlack ' + b.maxSlack + '（上界与实测脱节 = 判据失效）');
    assert.strictEqual(m.declared, m.files, '根 .js 文件数须等于入口 + manifest 声明模块');
});

/* ══════════ 3. T4 行为面：容器内字段真的跟随 ══════════ */
test('v3205 6. T4 行为面：同一份清单能同时覆盖条目字段与容器内事件字段（派生而非复制）', () => {
    // 真源码派生关系已由 【2】 结构面钉住；这里证明「派生出来的两份集合语义正确」：
    //   shift 侧须含 floor（身份位也要跟着减），drop 侧须排除 floor（floor===f 整条摘除）。
    const item = /const LEDGER_ITEM_FLOOR_FIELDS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(LEDGER)[1];
    const fields = [...item.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
    assert.ok(fields.includes('floor'), '条目清单须含身份位 floor');
    assert.ok(fields.includes('from') && fields.includes('to'), '条目清单须含区间端点 from/to（容器内事件也要用）');
    const shift = /const LEDGER_CHILD_FLOOR_FIELDS = Object\.freeze\(LEDGER_ITEM_FLOOR_FIELDS\);/.test(LEDGER);
    const drop = /LEDGER_CHILD_NON_IDENTITY_FIELDS = Object\.freeze\(LEDGER_ITEM_FLOOR_FIELDS\.filter\(k => k !== 'floor'\)\);/.test(LEDGER);
    assert.ok(shift && drop, '两侧派生式须同时成立');
});

/* ══════════ 4. T5 行为面：守卫在健康树上通过 ══════════ */
test('v3205 7. T5 行为面：P5 守卫在健康树上 exit 0 且差集卫生', () => {
    const r = spawnSync(process.execPath, ['tests/audit/scan_v3202_carryover_archive_diff.mjs'],
        { cwd: ROOT, encoding: 'utf-8', timeout: 60000 });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树上须 exit 0：' + out.slice(-300));
    assert.ok(/差集为空/.test(out), '须念出差集为空（P2 的结论）: ' + out.slice(0, 200));
});

/* ══════════ 5. T6 行为面：守卫在健康树上通过 ══════════ */
test('v3205 8. T6 行为面：跨仓守卫 exit 0，且读数含在役/退役/参考基准三面', () => {
    const r = spawnSync(process.execPath, ['tests/audit/scan_cross_repo_binding.mjs'],
        { cwd: ROOT, encoding: 'utf-8', timeout: 120000 });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树上须 exit 0：' + out.slice(-300));
    assert.ok(/在役 [1-9][0-9]*/.test(out) && /退役 [1-9][0-9]*/.test(out), '须念出在役/退役读数');
    assert.ok(/问题 0/.test(out), '须报「问题 0」');
});

/* ══════════ 6. T7 结构面 ══════════ */
test('v3205 9. T7 结构面：进程组收割 + 独立进程组 + 失败现场落盘 + 资源指纹重试', () => {
    for (const [needle, why] of [
        ['function killGroup(child)', '缺进程组收割函数'],
        ["process.kill(-child.pid, 'SIGKILL')", '缺按进程组杀（孙进程才会被一起收）'],
        ['detached: true', '缺独立进程组（否则孙进程被孤儿化）'],
        ['function dumpFailure(r, name)', '缺失败现场落盘'],
        ['TEST_FAIL_DUMP', '缺失败现场落盘开关'],
        ['const RESOURCE_SIG =', '缺环境资源耗尽指纹'],
        ['async function runWithRetry(file, useTestRunner)', '缺文件级重试'],
        ['await pool(tests, OPT.jobs, runWithRetry)', '主流程须走重试包装'],
    ]) assert.ok(RUN.includes(needle), why + '：' + needle);
});

test('v3205 10. T7 不许用「抬阈值」掩盖：单文件超时与 A1 阈值都未被本版改动', () => {
    // 阈值不是病根 —— 这条判据钉住它俩没被顺手改大。
    assert.ok(/const TIMEOUT = parseInt\(process\.env\.TEST_TIMEOUT \|\| '', 10\) \|\| 120000;/.test(RUN),
        '单文件超时须仍为 120000ms 默认值（不得为掩盖超时而抬）');
    assert.ok(!/TEST_TIMEOUT \|\| '', 10\) \|\| (?!120000)\d+/.test(RUN), '不得改大默认超时');
    // A1 的 6s 阈值属历史测试，本版不得触碰
    const v3177 = read('tests/v3177_syntax_gate_perf.test.mjs');
    assert.ok(/assert\.ok\(ms < 6000,/.test(v3177), 'A1 阈值须仍为 6000ms（本版不动它）');
});

test('v3205 11. T7 重试只在「环境资源耗尽」时发生：指纹须窄，不得吞掉真缺陷', () => {
    const sig = /const RESOURCE_SIG = (\/.*\/);/.exec(RUN)[1];
    for (const k of ['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM']) {
        assert.ok(sig.includes(k), '指纹须含资源类错误码 ' + k);
    }
    // 宽度自证：断言失败文本（AssertionError / ✖ failed 等）不得落进指纹
    const rx = eval(sig);
    assert.strictEqual(rx.test('AssertionError: expected 1 to equal 2'), false, '指纹不得匹配普通断言失败');
    assert.strictEqual(rx.test('ℹ fail 1'), false, '指纹不得匹配 TAP 失败摘要');
    assert.strictEqual(rx.test('Error: spawn EAGAIN  EAGAIN: resource temporarily unavailable, node:fs:441'), true,
        '指纹须匹配实测到的那类资源耗尽');
    assert.ok(/RETRY_MAX = 3/.test(RUN), '重试次数须有上限（不得无限重试）');
    // 负控制的前提自证：T7a 用的夹具串必须**真的**命中这条指纹，
    // 否则「资源指纹失败 → 重试」测的是一条永远不触发的分支（假绿）。
    const probeLine = ENV_FIXTURE.split('\n').find((l) => l.includes('EAGAIN')) || '';
    assert.ok(probeLine, 'T7a 夹具须含资源耗尽行');
    assert.strictEqual(rx.test(probeLine), true, '夹具串必须被指纹命中，否则该负控制测的是一个空分支');
    assert.strictEqual(rx.test(REAL_FIXTURE), false, 'T7b 的真缺陷夹具不得被指纹命中（否则它会被重试）');
});

/* ══════════ 7. T7 行为面（负控制）：在**临时仓**里跑，不弄脏本仓 ══════════ */
/* [v3.205.0] 夹具不许住在本仓的 tests/ 里（本版第七个坑，两个坑都在判据自己身上）。
 *   第一版把夹具 `_v3205_*.test.mjs` 写在 `tests/` 下 —— 这同时犯两宗罪：
 *     ① 跑批期间改仓库会自伤（acc4 实例：夹具被 v3204 的登记判据抓到，v3159/v3204 双红）；
 *     ② 它让「同一文件在单独跑时绿、在并发门禁下红」，正是本版要根治的那类不稳定。
 *   修法：夹具与 run.mjs 副本一起放进临时仓，`cwd` 指那里 —— 本仓全程只读。
 *   夹具自证仍靠自己的状态文件（在临时仓里）。 */
function makeScratch(tag) {
    const dir = path.join(tmpdir(), 'v3205_' + tag + '_' + process.pid + '_' + Date.now());
    const tdir = path.join(dir, 'tests');
    mkdirSync(tdir, { recursive: true });
    copyFileSync(path.join(ROOT, 'tests', 'run.mjs'), path.join(tdir, 'run.mjs'));
    return { dir, tdir };
}

// 夹具：首次报「资源耗尽」，第二次通过；状态文件记录它真的跑了几次。
const ENV_FIXTURE = [
    "import fs from 'node:fs';",
    "const f = new URL('.v3205_rt_state', import.meta.url).pathname;",
    'let n = 0;',
    'try { n = parseInt(fs.readFileSync(f, "utf8"), 10) || 0; } catch {}',
    'fs.writeFileSync(f, String(n + 1));',
    'if (n === 0) { console.error("Error: spawn EAGAIN  EAGAIN: resource temporarily unavailable, node:fs:441"); process.exit(1); }',
    'console.log("probe passed on attempt " + (n + 1));',
    '',
].join('\n');
// 真缺陷夹具也带状态文件：必须能自证「确实跑过」，否则「不重试直接红」可能只是环境空跑的红。
const REAL_FIXTURE = [
    "import fs from 'node:fs';",
    "fs.writeFileSync(new URL('.v3205_real_state', import.meta.url).pathname, '1');",
    'console.error("AssertionError: expected 1 to equal 2");',
    'process.exit(1);',
    '',
].join('\n');

/* [v3.205.0] 负控制不许被**测试环境传染**（本版第六个坑，出在判据自己身上）。
 *   v3205 自己是被 run.mjs 以 `node --test` 拉起的 —— 环境里带着 NODE_TEST_CONTEXT。
 *   该变量会被传承给夹具的 `node --test`，使它认定自己是**别人的**测试子进程而整段哑掉：
 *   实测夹具一行没跑，run.mjs 报「文件 1/1 通过、通过断言 0」，于是
 *   「资源指纹失败 → 重试转绿」这条负控制测的根本不是重试，而是「什么都没跑」——
 *   正是本版要治的「绿不是真绿」，只不过这次出在判据自己身上。
 *   修法：给临时仓里的 run.mjs 副本来一份干净环境。 */
function runInScratch(scratch, pattern, extraEnv = {}) {
    const env = { ...process.env, ...extraEnv };
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, ['tests/run.mjs', pattern], {
        cwd: scratch.dir, encoding: 'utf-8', env, timeout: 180000,
    });
}

test('v3205 12. 负控制 T7a：带资源指纹的失败 → 须明示重试并转绿（且夹具真的跑了两次）', () => {
    const sc = makeScratch('env');
    const state = path.join(sc.tdir, '.v3205_rt_state');
    writeFileSync(path.join(sc.tdir, '_env_probe.test.mjs'), ENV_FIXTURE);
    try {
        const r = runInScratch(sc, '_env_probe');
        const out = (r.stdout || '') + (r.stderr || '');
        assert.strictEqual(r.status, 0, '资源指纹失败经重试后须转绿：' + out.slice(-400));
        assert.ok(/⟳/.test(out), '重试必须被打印（绿不许来自悄悄重跑）：' + out.slice(-400));
        assert.ok(/经环境资源耗尽重试后转绿/.test(out), '汇总须单独点名重试过的文件');
        assert.ok(/文件 1\/1 通过/.test(out), '该文件须计入通过');
        /* 强断言：夹具必须**真的跑过两次**。
         *   只断言「进程 exit 0」不够 —— 夹具若因环境传承整段哑掉，run.mjs 会报
         *   「文件 1/1 通过」而实际一次都没跑（未创建状态文件），同样 exit 0。
         *   这正是本版要治的「绿不是真绿」，因此这里直接以**夹具的状态文件**为据。 */
        assert.ok(existsSync(state), '夹具须留下状态文件（否则它一行没跑）');
        assert.strictEqual(readFileSync(state, 'utf-8').trim(), '2',
            '夹具须真的跑过两次（首次报资源耗尽 + 重试那次），实=' + (existsSync(state) ? readFileSync(state, 'utf-8').trim() : '无'));
    } finally {
        try { rmSync(sc.dir, { recursive: true, force: true }); } catch {}
    }
});

test('v3205 13. 负控制 T7b：无资源指纹的真缺陷 → 不得重试，须直接红（且夹具真的跑过）', () => {
    const sc = makeScratch('real');
    const state = path.join(sc.tdir, '.v3205_real_state');
    writeFileSync(path.join(sc.tdir, '_real_probe.test.mjs'), REAL_FIXTURE);
    try {
        const r = runInScratch(sc, '_real_probe');
        const out = (r.stdout || '') + (r.stderr || '');
        assert.strictEqual(r.status, 1, '真缺陷必须红：' + out.slice(-300));
        assert.ok(!/⟳/.test(out), '真缺陷不得被重试（否则判据被放宽）：' + out.slice(-300));
        assert.ok(/文件 0\/1 通过/.test(out), '须如实报 0/1 通过');
        // 同 T7a：必须确认它是「真跑了并且真的红」，而不是被环境吐成空跑（那也会 exit 1）。
        assert.ok(existsSync(state), '夹具须留下状态文件（否则一行没跑，红不归因于它）');
    } finally {
        try { rmSync(sc.dir, { recursive: true, force: true }); } catch {}
    }
});

test('v3205 14. 负控制 T7c：失败现场落盘开关缺省关闭，开启后逐文件留档', () => {
    // 缺省关闭：不得凭空在仓库里造文件
    assert.ok(/const dir = process\.env\.TEST_FAIL_DUMP;\n  if \(!dir\) return;/.test(RUN),
        '开关缺省须为关闭（不改变既有行为）');
    assert.ok(/if \(process\.env\.TEST_FAIL_DUMP\) dumpFailure\(r, name\)/.test(RUN), '仅开关打开时才落盘');
    // 缺省关闭的行为证明：不带该变量跑一次真缺陷夹具，临时仓里不得出现落盘目录
    const sc = makeScratch('dump');
    const dumpDir = path.join(sc.dir, 'dump');
    writeFileSync(path.join(sc.tdir, '_real_probe.test.mjs'), REAL_FIXTURE);
    try {
        const r0 = runInScratch(sc, '_real_probe');
        const out0 = (r0.stdout || '') + (r0.stderr || '');
        assert.ok(!/失败现场已落盘/.test(out0), '缺省时不得落盘：' + out0.slice(-200));
        assert.ok(!existsSync(dumpDir), '缺省时不得创建落盘目录');
        const r = runInScratch(sc, '_real_probe', { TEST_FAIL_DUMP: dumpDir });
        const out = (r.stdout || '') + (r.stderr || '');
        assert.ok(/失败现场已落盘/.test(out), '开启后须打印落盘位置：' + out.slice(-300));
        const files = existsSync(dumpDir) ? readdirSync(dumpDir) : [];
        assert.ok(files.length === 1, '须恰为失败文件留档 1 份，实 ' + files.length);
        const body = readFileSync(path.join(dumpDir, files[0]), 'utf-8');
        assert.ok(/code: 1/.test(body) && /AssertionError: expected 1 to equal 2/.test(body),
            '留档须含退出码与原始输出');
    } finally {
        try { rmSync(sc.dir, { recursive: true, force: true }); } catch {}
    }
});

/* ══════════ 8. run.mjs 既有控制流未被改坏 ══════════ */
test('v3205 15. run.mjs 既有契约保持：目录发现 / 并发上限 / 审计档 / 退出码', () => {
    for (const [needle, why] of [
        ["readdirSync(AUDIT_DIR).filter(f => f.endsWith('.mjs') && !f.startsWith('_'))", 'audit 目录发现规则（多个历史测试逐字对齐它）'],
        ["Math.min(8, Math.max(2, os.cpus().length - 1))", '并发默认值口径'],
        ['process.exit(anyFail ? 1 : 0)', '退出码契约'],
        ["console.log(`[run] 通过断言 ${totalPass} | 失败断言 ${totalFail}", '汇总行格式（v3204 等用例按它取数）'],
    ]) assert.ok(RUN.includes(needle), why + '：' + needle);
});

test('v3205 16. v3159 并发化语义等价：结果仍按文件名索引，且并发度可覆写', () => {
    assert.ok(/async function runAuditBatch\(cwd, files, jobs = AUDIT_CONCURRENCY\)/.test(V3159), '缺受控并发池');
    assert.ok(/const byFile = \{\};\s*\n\s*files\.forEach\(\(f, i\) => \{ byFile\[f\] = results\[i\]; \}\);/.test(V3159),
        '结果须仍按文件名索引（与串行逐位等价）');
    assert.ok(/V3159_AUDIT_JOBS/.test(V3159) && /V3159_AUDIT_TIMEOUT/.test(V3159), '并发度/超时须可覆写（负控制需要）');
    assert.ok(!/spawnSync/.test(V3159.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')),
        '已零调用的 spawnSync 不应残留（避免误以为仍有串行路径）');
});

/* ══════════ 9. 判据面自防护 ══════════ */
test('v3205 17. 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水', () => {
    const nAssert = (SELF.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 49, '断言数不得缩水（>= 49），实际 ' + nAssert);
    const nl = SELF.split('\n').filter((l) => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(nl >= 110, '有效代码行不得缩水（>= 110），实际 ' + nl);
    for (const [label, needle] of [
        ['T3 唯一真源', 'readBudget'],
        ['T4 派生式', 'LEDGER_CHILD_NON_IDENTITY_FIELDS'],
        ['T5 P5', 'P5 独立面甄别'],
        ['T6 P6 地板', '覆盖率转移判据地板失守'],
        ['T7 进程组', 'killGroup'],
        ['T7 失败现场', 'TEST_FAIL_DUMP'],
        ['T7 资源指纹', 'RESOURCE_SIG'],
        ['阈值不许被抬', '阈值不是病根'],
        ['负控制：临时仓隔离', 'makeScratch'],
        ['负控制：夹具真跑自证', 'v3205_rt_state'],
        ['负控制：不弄脏本仓', "path.join(tmpdir(), 'v3205_'"],
        ['负控制：剥离测试环境传承', 'NODE_TEST_CONTEXT'],
        ['负控制：真缺陷不重试', '真缺陷不得被重试'],
    ]) assert.ok(SELF.includes(needle) || RUN.includes(needle) || CA.includes(needle) || XR.includes(needle),
        '关键指纹缺失：' + label);
});
