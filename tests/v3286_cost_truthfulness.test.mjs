// tests/v3286_cost_truthfulness.test.mjs — v3.286.0 O8 第二刀：测试成本读数真实性门的成对套件
// 主题：`tests/audit/scan_cost_truthfulness.mjs` 的每条判据都必须**真能翻红** ——
//   一个「永远 exit 0」的成本扫描器同样是绿的，所以它必须有合成仓负控制。
//
//   【本档钉什么】
//     A  结构面：扫描器在位 + 夹具模式/改根 + 面下限常量在场 + env 出口
//     B  合成仓逐条：C1/C3（四种）/C4/C5（三种）/C6（两条）各自造一处不一致 ⇒ exit 1 且点名到那条
//     C  fail-closed：登记缺失 / 非法 JSON / 缺 latest / 缺 rebinds / 缺 index.js / run.mjs 无出口 ⇒ exit 2
//     D  健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）+ C5 三种合法状态（full=true 盖章 / full 缺席豁免）
//     E  判据纯度 H5：破坏锚点字面量各只有 1 个持有常量 + 声明序 + 真源上单命中
//     F  真源码破坏：摘掉任一条判据 ⇒ 本档同一条合成仓用例不再翻红（判据不是装饰）
//     G  重绑工具 fail-closed：不合用摘要 ⇒ 一律 exit 1 且**从不落盘**（夹具根上验，不碰真仓）
//     H  自防护 + 三源同源 + 当版锚点
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCAN_REL = path.join('tests', 'audit', 'scan_cost_truthfulness.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有；全部单行） ---- */
const A_C1_REQ = "    if (!(k in L)) bad('latest 缺必需字段 ' + k + '";
const A_C3_EMPTY = "if (top.length < 1) bad('slowest_top 为空 ⇒ 没有任何热点读数（成本面等于没建）');";
const A_C3_MISS = "    if (!fs.existsSync(abs)) bad(";
const A_C3_DESC = "if (ms > prevMs) bad('slowest_top 未按耗时降序（排序口径与重绑工具漂移）：' + rel);";
const A_C4_OVER = "else if (total > diskTests.length) {";
const A_C5_MARK = "        if (doc.measured_at !== L.version) {";
const A_C5_PAT = "        if (patterns.length < 1) {";
const A_C6_SRC = "if (!note.includes('零手抄'))";
const A_C6_SCOPE = "if (!note.includes('覆盖范围必须自述'))";
const A_C8_FUTURE = "    if (vnum(L.version) > vnum(VERSION)) {";
const A_C7B_IDX = "if (!fs.existsSync(IDX)) drift('缺少 index.js ⇒ 读不到 VERSION 真源，无法核对登记版本，结构漂移');";
const A_C7B_RUN = "    if (!runSrc.includes(pair[0])) {";
const A_FLOOR_TESTS = "const FLOOR_TESTS = numEnv('LONSHA_AUDIT_MIN_TESTS') || (FIXTURE_MODE ? 1 : 200);";
const A_FLOOR_AUDIT = "const FLOOR_AUDIT = numEnv('LONSHA_AUDIT_MIN_AUDIT') || (FIXTURE_MODE ? 1 : 40);";
const A_SELF_LEN = 'assert.ok(self.length > 6000';
const A_SELF_HEAD = 'const SCAN_REL = ';

/* ══════════════ 合成仓构造 ══════════════ */

/** 造一个最小但「健康」的合成仓：全套判据都应通过。 */
function mkRepo(mut = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-costtruth-'));
    const testsDir = path.join(dir, 'tests');
    const auditDir = path.join(testsDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });

    const state = {
        version: '9.9.9',
        idxHasVersion: true,
        runHasSlowest: true, runHasScope: true,
        testsCount: 210, auditCount: 41,
        omitReg: false, regText: null,
        latest: null,
        note: '测试成本读数登记。**读数零手抄**：由 tools/_rebind_test_cost.py 写入。'
            + '**覆盖范围必须自述**：scope.full=true 才代表一次全量实跑。',
        measuredAt: null,
    };
    state.latest = {
        version: '9.9.9',
        scope: { full: false, patterns: ['v9'], jobs: 7 },
        tests_total: 8,
        tests_wall_s: 16,
        slowest_top: [
            { file: 'tests/t0.test.mjs', duration: 100 },
            { file: 'tests/t1.test.mjs', duration: 50 },
        ],
    };
    mut(state);

    fs.writeFileSync(path.join(dir, 'index.js'), state.idxHasVersion
        ? "const VERSION = '" + state.version + "';" + NL
        : "const VER = '" + state.version + "';" + NL);

    /* run.mjs 夹具：本门要核的两个读数出口的**产出者**。 */
    const runLines = ['// fixture runner'];
    if (state.runHasSlowest) runLines.push('const slowest_export = true;');
    if (state.runHasScope) runLines.push('const scope_export = true;');
    fs.writeFileSync(path.join(testsDir, 'run.mjs'), runLines.join(NL) + NL);

    for (let i = 0; i < state.testsCount; i++) {
        fs.writeFileSync(path.join(testsDir, 't' + i + '.test.mjs'), "test('t', () => {});" + NL);
    }
    for (let i = 0; i < state.auditCount; i++) {
        fs.writeFileSync(path.join(auditDir, 'scan' + i + '.mjs'), '// s' + NL);
    }
    if (!state.omitReg) {
        const text = state.regText !== null ? state.regText : JSON.stringify({
            file: 'tests/audit/test_cost_readings.json',
            note: state.note,
            measured_at: state.measuredAt,
            latest: state.latest,
            rebinds: [state.latest],
        }, null, 1);
        fs.writeFileSync(path.join(auditDir, 'test_cost_readings.json'), text);
    }
    return dir;
}

/** 在合成仓上跑扫描器（夹具模式），返回 {code, out}。 */
function run(dir, extraEnv) {
    const r = spawnSync(process.execPath, [SCAN], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir, ...(extraEnv || {}) },
    });
    return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}

function withRepo(mut, fn) {
    const dir = mkRepo(mut);
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3286 A. 扫描器在位、支持夹具模式与改根、面下限与真源在场检查都在', () => {
    assert.ok(fs.existsSync(SCAN), '扫描器必须在 tests/audit/scan_cost_truthfulness.mjs');
    const s = scanSrc();
    assert.ok(s.includes('LONSHA_AUDIT_FIXTURE'), '须支持夹具模式（合成仓用）');
    assert.ok(s.includes('LONSHA_AUDIT_ROOT'), '须支持改根（合成仓用）');
    assert.ok(s.includes(A_FLOOR_TESTS) && s.includes(A_FLOOR_AUDIT),
        '须有 env 可覆盖的面下限（枚举失效时「0 不一致」是空对空）');
    assert.ok(s.includes(A_C7B_IDX) && s.includes("if (!fs.existsSync(IDX))"),
        '须有读数真源在场检查（★ 本条是「首版两档皆 0 ⇒ 恒绿探测器」的修复）');
    assert.ok(s.includes('audit_scan_probe_matrix') === false, '扫描器自身不得引用登记表（避免自指）');
    assert.ok(s.includes('process.exit(2)'), 'drift 出口必须是 2（结构漂移）');
    assert.ok(s.includes('process.exit(1)'), '真缺陷出口必须是 1');
    assert.ok(s.includes('覆盖范围自述'), 'C5 的存在性锚点：覆盖范围自述判据须在场');
    assert.ok(s.includes('不减少负控制'), '须保留「不减少负控制来换快」这一计划原文约束的说明');
    ok('结构面齐备');
});

/* ══════════════ D1. 健康合成仓 ══════════════ */
test('v3286 D1. 健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）', () => {
    withRepo(() => {}, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '健康仓必须 exit 0：' + r.out.slice(-400));
        assert.ok(r.out.includes('scope.full=false'), '通过时须报出覆盖范围读数');
    });
    ok('健康合成仓 exit 0');
});

/* ══════════════ B. 合成仓逐条翻红 ══════════════ */
test('v3286 B1. C1 登记缺必需字段 ⇒ exit 1 且点名字段', () => {
    withRepo((s) => { delete s.latest.tests_total; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '缺 tests_total 必须 exit 1（成本读数不可复算）');
        assert.ok(r.out.includes('tests_total'), '必须点名缺的字段');
    });
    withRepo((s) => { delete s.latest.slowest_top; delete s.latest.tests_wall_s; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '缺 slowest_top / tests_wall_s 必须 exit 1');
        assert.ok(r.out.includes('slowest_top') && r.out.includes('tests_wall_s'), '须逐项点名');
    });
    withRepo((s) => { s.latest.scope = 'full'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'scope 不是对象必须 exit 1（覆盖范围未自述）');
        assert.ok(r.out.includes('latest.scope 不是对象'), '须点名 scope 自述缺失');
    });
    ok('C1 三类结构缺陷各自翻红');
});

test('v3286 B2. C3 热点真在场 / 耗时可复算 / 排序可复现（四种）', () => {
    /* ① 热点指向已删/已改名的档 ⇒ 过期读数 */
    withRepo((s) => { s.latest.slowest_top[0].file = 'tests/gone.test.mjs'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '热点档不在磁盘上必须 exit 1');
        assert.ok(r.out.includes('过期读数'), '归因须说「过期读数」：' + r.out.slice(-300));
    });
    /* ② 未按耗时降序 ⇒ 排序口径漂移 */
    withRepo((s) => { s.latest.slowest_top = [{ file: 'tests/t0.test.mjs', duration: 50 },
        { file: 'tests/t1.test.mjs', duration: 100 }]; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '未降序必须 exit 1');
        assert.ok(r.out.includes('降序'), '须点名降序漂移');
    });
    /* ③ 空的热点表 ⇒ 成本面等于没建 */
    withRepo((s) => { s.latest.slowest_top = []; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '空 slowest_top 必须 exit 1');
        assert.ok(r.out.includes('没有任何热点读数'), '须点名「成本面等于没建」');
    });
    /* ④ 耗时非正数 ⇒ 读数不合法 */
    withRepo((s) => { s.latest.slowest_top[1].duration = 0; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'duration=0 必须 exit 1');
        assert.ok(r.out.includes('耗时不合法'), '须点名耗时不合法');
    });
    ok('C3 四种各自翻红');
});

test('v3286 B3. C4 计数不得超出现实 / C8 版本不得说谎', () => {
    withRepo((s) => { s.latest.tests_total = 9999; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '计数超过磁盘现存必须 exit 1');
        assert.ok(r.out.includes('比现存的还多'), '归因须说「比现存的还多」');
    });
    /* 边界：恰好等于磁盘数 ⇒ 合法（全量快照在更早版本上跑，此后新增档是正常状态）。
     * 用 ≤ 而非 = 的理由以此条钉住。 */
    withRepo((s) => { s.latest.tests_total = 210; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '计数恰好等于磁盘数必须放行（≤ 而非 =）：' + r.out.slice(-300));
    });
    withRepo((s) => { s.latest.version = '99.9.9'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '登记版本高于代码版本必须 exit 1');
        assert.ok(r.out.includes('读数是未来的'), '须点名「读数是未来的」');
    });
    ok('C4 翻红 + ≤ 边界放行 + C8 翻红');
});

test('v3286 B4. C5 覆盖范围自述（本门最要紧一条）', () => {
    /* full=false 却无 patterns ⇒ 既非全量也非定向采样，覆盖范围不可解释 */
    withRepo((s) => { s.latest.scope = { full: false, patterns: [], jobs: 7 }; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'full=false 无 patterns 必须 exit 1');
        assert.ok(r.out.includes('既非全量也非定向采样'), '须点名覆盖范围不可解释');
    });
    /* full=true 必须盖版本章（measured_at == version） */
    withRepo((s) => { s.latest.scope.full = true; s.measuredAt = '9.9.8'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'full=true 但未盖版本章必须 exit 1');
        assert.ok(r.out.includes('全量实跑必须盖版本章'), '须点名盖章缺失');
    });
    /* full=true 且已盖章 ⇒ 合法（一次真全量实跑的正常形态） */
    withRepo((s) => { s.latest.scope.full = true; s.measuredAt = '9.9.9'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, 'full=true 已盖章必须放行：' + r.out.slice(-300));
    });
    /* full 缺席 = 旧登记 ⇒ 如实报出而不判红（历史口径豁免） */
    withRepo((s) => { s.latest.scope = { patterns: ['v9'], jobs: 7 }; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, 'full 缺席必须豁免（历史口径）：' + r.out.slice(-300));
        assert.ok(r.out.includes('覆盖范围未自述'), '须如实报出「未自述」而不翻红');
    });
    ok('C5：两条翻红 + 两种合法状态放行并如实报出');
});

test('v3286 B5. C6 契约声明两条各自翻红（读数来源与覆盖范围必须写进登记）', () => {
    withRepo((s) => { s.note = s.note.replace('零手抄', '自动生成'); }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '丢「零手抄」声明必须 exit 1');
        assert.ok(r.out.includes('零手抄'), '须点名缺失的声明');
    });
    withRepo((s) => { s.note = s.note.replace('覆盖范围必须自述', '范围自述'); }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '丢「覆盖范围必须自述」声明必须 exit 1');
        assert.ok(r.out.includes('覆盖范围必须自述'), '须点名缺失的声明');
    });
    ok('C6 两条各自翻红');
});

/* ══════════════ C. fail-closed ══════════════ */
test('v3286 C. fail-closed：登记/真源不可用时 ⇒ exit 2，拒绝给结论', () => {
    const CASES = [
        ['登记文件缺失', (s) => { s.omitReg = true; }],
        ['登记非法 JSON', (s) => { s.regText = '{ not json'; s.omitReg = false; }],
        ['登记顶层不是对象', (s) => { s.regText = '[1,2]'; }],
        ['缺 latest 段', (s) => { s.regText = JSON.stringify({ rebinds: [1] }); }],
        ['缺 rebinds 留痕', (s) => { s.regText = JSON.stringify({ latest: { version: '9.9.9' } }); }],
        ['index.js 不在场（G 档形态）', (s) => { s.idxHasVersion = true; }],
    ];
    for (const [label, mut] of CASES) {
        withRepo(mut, (dir) => {
            if (label.startsWith('index.js')) fs.rmSync(path.join(dir, 'index.js'));
            const r = run(dir);
            assert.equal(r.code, 2, label + ' 必须 exit 2（实 ' + r.code + '）：' + r.out.slice(-300));
            assert.ok(r.out.includes('结构漂移') || r.out.includes('拒绝给结论'),
                label + ' 须给出「没得判」的归因');
        });
    }
    /* index.js 在场但读不到版本常量 ⇒ 真源失效 */
    withRepo((s) => { s.idxHasVersion = false; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 2, 'index.js 无 const VERSION 必须 exit 2');
        assert.ok(r.out.includes('真源失效'), '须点名真源失效');
    });
    /* run.mjs 被掏空（T 档形态）⇒ 本门所核的读数无从产出 */
    for (const [label, mut] of [['run.mjs 无 slowest 出口', (s) => { s.runHasSlowest = false; }],
        ['run.mjs 无 scope 出口', (s) => { s.runHasScope = false; }],
        ['run.mjs 不在场', (s) => { s.runHasSlowest = false; s.runHasScope = false; }]]) {
        withRepo(mut, (dir) => {
            if (label.endsWith('不在场')) fs.rmSync(path.join(dir, 'tests', 'run.mjs'));
            const r = run(dir);
            assert.equal(r.code, 2, label + ' 必须 exit 2（实 ' + r.code + '）：' + r.out.slice(-300));
            /* 归因措辞两形态都认：「读数无从产出」（出口被摘）与「缺少 tests/run.mjs」（整档不在场）——
             *   两者是同一事实的两面（产出者不在 ⇒ 读数无从产出），按字面二选一判即可。 */
            assert.ok(r.out.includes('无从产出') || r.out.includes('缺少 tests/run.mjs'),
                label + ' 须点名产出者缺失（实 ' + r.out.slice(-200) + '）');
        });
    }
    ok('六种登记/真源失效 + 四种 run.mjs 出口失效，各自 exit 2 并给出归因');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3286 E. 判据纯度：破坏锚点字面量在本档各只有 1 个持有常量，且真源上单命中', () => {
    const self = readRoot(path.join('tests', 'v3286_cost_truthfulness.test.mjs'));
    const holders = new Map();
    const ANCHORS = [['C1_REQ', A_C1_REQ], ['C3_EMPTY', A_C3_EMPTY], ['C3_MISS', A_C3_MISS],
        ['C3_DESC', A_C3_DESC], ['C4_OVER', A_C4_OVER], ['C5_MARK', A_C5_MARK], ['C5_PAT', A_C5_PAT],
        ['C6_SRC', A_C6_SRC], ['C6_SCOPE', A_C6_SCOPE], ['C8_FUTURE', A_C8_FUTURE],
        ['C7B_IDX', A_C7B_IDX], ['C7B_RUN', A_C7B_RUN], ['FLOOR_TESTS', A_FLOOR_TESTS],
        ['FLOOR_AUDIT', A_FLOOR_AUDIT], ['SELF_LEN', A_SELF_LEN], ['SELF_HEAD', A_SELF_HEAD]];
    /* 只有前 14 条是**扫描器**的锚点（改它们等于摘判据）；后两条是本档自身的自防护锚点，
     *   按定义只能出现在本档里 —— 故单命中校验只对前 14 条做（否则会拿自己的文件去扫扫描器）。 */
    const SCANNER_ANCHORS = ANCHORS.slice(0, 14);
    for (const [label, a] of ANCHORS) {
        assert.equal(a.includes(NL), false, label + ' 须是单行锚点');
        assert.ok(a.length > 12, label + ' 锚点须足够长');
        assert.ok(self.includes(a), label + ' 锚点字面量须逐字被本档持有');
        if (!holders.has(a)) holders.set(a, new Set());
        holders.get(a).add(label);
    }
    for (const [lit, set] of holders) {
        assert.equal(set.size, 1, '字面量 ' + lit + ' 被多个锚点常量持有：' + [...set].join(' / '));
    }
    /* 声明序自证：本档锚点常量的声明顺序须稳定 */
    const declRe = /^const\s+(A_[A-Z0-9_]+)\s*=/gm;
    const declNames = [...self.matchAll(declRe)].map((m) => m[1]);
    assert.deepEqual(declNames, ['A_C1_REQ', 'A_C3_EMPTY', 'A_C3_MISS', 'A_C3_DESC', 'A_C4_OVER',
        'A_C5_MARK', 'A_C5_PAT', 'A_C6_SRC', 'A_C6_SCOPE', 'A_C8_FUTURE', 'A_C7B_IDX', 'A_C7B_RUN',
        'A_FLOOR_TESTS', 'A_FLOOR_AUDIT', 'A_SELF_LEN', 'A_SELF_HEAD'], '本档锚点常量声明序须稳定');
    /* 真源扫描器里，每条锚点各恰中一次 */
    const s = scanSrc();
    for (const [label, a] of SCANNER_ANCHORS) assertSingleHit(s, a, 'v3286_h_' + label);
    ok('16 个锚点各只有 1 个持有常量；14 条扫描器锚点在真源上各恰中一次');
});

/* ══════════════ F. 真源码破坏 ══════════════ */
test('v3286 F. 真源码破坏：摘掉任一条判据 ⇒ 合成仓上不再翻红（判据不是装饰）', () => {
    const s = scanSrc();
    /** 在合成仓上跑一个「被破坏过的扫描器副本」。 */
    const runBroken = (brokenSrc, dir, extraEnv) => {
        const p = path.join(dir, 'tests', 'audit', 'scan2x.mjs');
        fs.writeFileSync(p, brokenSrc);
        const r = spawnSync(process.execPath, [p], {
            cwd: dir, encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir, ...(extraEnv || {}) },
        });
        return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
    };

    /* ① 摘掉 C6「零手抄」声明检查 */
    {
        const broken = breakSource(s, A_C6_SRC, 'if (false)', 'v3286_f1');
        withRepo((st) => { st.note = st.note.replace('零手抄', '自动生成'); }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉该判据后不得再翻红（证明它真在起作用）');
        });
    }
    /* ② 摘掉 C5 盖章检查 */
    {
        const broken = breakSource(s, A_C5_MARK, '        if (false) {', 'v3286_f2');
        withRepo((st) => { st.latest.scope.full = true; st.measuredAt = '9.9.8'; }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉盖章检查后 full=true 未盖章不得再翻红');
        });
    }
    /* ③ 摘掉 C3「热点真在场」 */
    {
        const broken = breakSource(s, A_C3_MISS, '    if (false) bad(', 'v3286_f3');
        withRepo((st) => { st.latest.slowest_top[0].file = 'tests/gone.test.mjs'; }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉在场检查后过期读数不得再翻红');
        });
    }
    /* ④ 摘掉 C4 上限比较 */
    {
        const broken = breakSource(s, A_C4_OVER, 'else if (false) {', 'v3286_f4');
        withRepo((st) => { st.latest.tests_total = 9999; }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉上限比较后虚高计数不得再翻红');
        });
    }
    /* ⑤ 拔掉面下限机制：即便把下限顶到天上，也不该再 exit 2（证明下限真的在拦） */
    {
        const broken = breakSource(s, A_FLOOR_TESTS, 'const FLOOR_TESTS = 0;', 'v3286_f5');
        withRepo(() => {}, (dir) => {
            const r = runBroken(broken, dir, { LONSHA_AUDIT_MIN_TESTS: '99999' });
            assert.equal(r.code, 0, '下限被拔掉后超高下限不得再触发 exit 2（实 ' + r.code + '）');
        });
    }
    /* ⑥ 摘掉 C7b 真源在场检查 —— 本档「首版恒绿探测器」那一课的反面：
     *    若这条被摘，T 档形态（run.mjs 无出口）就退回「静默通过」。 */
    {
        const broken = breakSource(s, A_C7B_RUN, '    if (false) {', 'v3286_f6');
        withRepo((st) => { st.runHasSlowest = false; }, (dir) => {
            assert.equal(runBroken(broken, dir).code, 0, '摘掉真源在场检查后 T 档不得再阻断');
        });
    }
    ok('六处真源码破坏各自让对应判据失去作用（C6 / C5 盖章 / C3 在场 / C4 上限 / 面下限 / C7b 真源）');
});

/* ══════════════ G. 重绑工具 fail-closed ══════════════ */
/* 为什么必测：登记文件是「成本读数」的唯一权威来源，而它由工具写。
 *   工具若把**失败的 / 定向采样的 / 缺出口的**摘要照签不误，就等于把一次不完整的实跑
 *   永久写成「全量读数」—— 本档的合成仓会忠实地拿这个假数字去核对，两边一起绿。
 *   即：**探测器坏了，结论该被怀疑**。 */
test('v3286 G. 重绑工具 fail-closed：不合用摘要 ⇒ exit 1 且从不落盘', () => {
    const TOOL = path.join(ROOT, 'tools', '_rebind_test_cost.py');
    assert.ok(fs.existsSync(TOOL), '重绑工具须在场');
    const mk = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-rebindcost-'));
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        return dir;
    };
    const runTool = (dir, summaryText) => {
        const sp = path.join(dir, 'summary.json');
        fs.writeFileSync(sp, summaryText);
        const r = spawnSync('python3', [TOOL, sp], {
            cwd: ROOT, encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
        });
        const reg = path.join(dir, 'tests', 'audit', 'test_cost_readings.json');
        return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || ''),
            wrote: fs.existsSync(reg), reg };
    };
    const GOOD = JSON.stringify({
        version: '9.9.9', ok: true, at: '2026-10-06T00:00:00.000Z',
        scope: { patterns: ['v9'], full: false, jobs: 7 },
        tests: { total: 8, passed: 8, failed: [], wall: 16,
            slowest: [{ file: 'tests/t0.test.mjs', duration: 100, status: 0 }] },
        audit: { total: 3, passed: 3, failed: [] },
    });

    /* ① 健康摘要（定向采样）⇒ 写入，且覆盖范围原样透传、measured_at 不得被推进 */
    {
        const dir = mk();
        try {
            const r = runTool(dir, GOOD);
            assert.equal(r.code, 0, '健康摘要必须写入（实 ' + r.code + '）：' + r.out.slice(-300));
            assert.ok(r.wrote, '登记文件必须被写出');
            const reg = JSON.parse(fs.readFileSync(r.reg, 'utf8'));
            assert.equal(reg.latest.scope.full, false, '定向采样必须自述 full=false');
            assert.deepEqual(reg.latest.scope.patterns, ['v9'], 'patterns 须原样透传');
            assert.equal(reg.measured_at, null, '定向采样**不得**推进 measured_at（不得冒充全量）');
            assert.equal(reg.latest.tests_total, 8, '读数来自摘要，不得手抄');
            assert.ok(reg.rebinds && reg.rebinds.length === 1, '历史留痕必须追加（不覆盖）');
            assert.ok(reg.note.includes('零手抄') && reg.note.includes('覆盖范围必须自述'),
                'note 必须带两条契约声明（否则本门 C6 会红）');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    /* ② 全量摘要 ⇒ 推进 measured_at */
    {
        const dir = mk();
        try {
            const full = JSON.stringify({
                version: '9.9.9', ok: true, at: '2026-10-06T00:00:00.000Z',
                scope: { patterns: [], full: true, jobs: 7 },
                tests: { total: 8, passed: 8, failed: [], wall: 16, slowest: [] },
                audit: { total: 3, passed: 3, failed: [] },
            });
            const r = runTool(dir, full);
            assert.equal(r.code, 0, '全量摘要必须写入');
            const reg = JSON.parse(fs.readFileSync(r.reg, 'utf8'));
            assert.equal(reg.measured_at, '9.9.9', '全量实跑必须盖版本章');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    /* ③ 七种不合用摘要（含非法 JSON）各自必须 exit 1 且**不写盘** */
    const BAD = [
        ['不是合法 JSON', '{ not json'],
        ['ok=false（失败跑）', JSON.stringify({ version: '9.9.9', ok: false, scope: { full: false, patterns: ['v9'] }, tests: { total: 8, passed: 7, failed: [{ file: 'x' }], wall: 16, slowest: [] }, audit: { total: 3, passed: 3 } })],
        ['缺 scope.full（旧 run.mjs）', JSON.stringify({ version: '9.9.9', ok: true, scope: { patterns: ['v9'] }, tests: { total: 8, passed: 8, failed: [], wall: 16, slowest: [] }, audit: { total: 3, passed: 3 } })],
        ['缺 tests.slowest（缺出口）', JSON.stringify({ version: '9.9.9', ok: true, scope: { full: false, patterns: ['v9'] }, tests: { total: 8, passed: 8, failed: [], wall: 16 }, audit: { total: 3, passed: 3 } })],
        ['缺 tests.wall', JSON.stringify({ version: '9.9.9', ok: true, scope: { full: false, patterns: ['v9'] }, tests: { total: 8, passed: 8, failed: [], slowest: [] }, audit: { total: 3, passed: 3 } })],
        ['审计段有失败', JSON.stringify({ version: '9.9.9', ok: true, scope: { full: false, patterns: ['v9'] }, tests: { total: 8, passed: 8, failed: [], wall: 16, slowest: [] }, audit: { total: 3, passed: 2, failed: [{ file: 'a' }] } })],
        ['缺 version', JSON.stringify({ ok: true, scope: { full: false, patterns: ['v9'] }, tests: { total: 8, passed: 8, failed: [], wall: 16, slowest: [] }, audit: { total: 3, passed: 3 } })],
    ];
    for (const [label, text] of BAD) {
        const dir = mk();
        try {
            const r = runTool(dir, text);
            assert.equal(r.code, 1, label + ' 必须 exit 1（实 ' + r.code + '）');
            assert.equal(r.wrote, false, label + ' 不得写出登记文件（fail-closed 要真的不落盘）');
            assert.ok(r.out.includes('rebind-cost'), label + ' 须给出可读归因');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    /* ④ 摘要路径不存在 ⇒ exit 2（结构漂移，不是「摘要不合用」） */
    {
        const dir = mk();
        try {
            const r = spawnSync('python3', [TOOL, path.join(dir, 'nope.json')], {
                cwd: ROOT, encoding: 'utf8', env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
            });
            assert.equal(r.status, 2, '摘要路径不存在必须 exit 2（实 ' + r.status + '）');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    ok('健康摘要写入（定向采样不推 measured_at / 全量盖章）；七种不合用摘要各自 exit 1 且从不落盘；缺文件 exit 2');
});

/* ══════════════ H. 自防护 + 三源 + 当版锚点 ══════════════ */
test('v3286 H. 自防护：登记文件与扫描器/工具都不得被摘掉；本档恰锚当版', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'audit', 'test_cost_readings.json')), '登记文件须在场');
    assert.ok(fs.existsSync(path.join(ROOT, 'tools', '_rebind_test_cost.py')), '重绑工具须在场');
    assert.ok(readRoot('index.js').includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(readRoot('tests/run.mjs').includes('slowest'), 'run.mjs 的逐档耗时出口仍在场');
    assert.ok(readRoot('tests/run.mjs').includes('scope'), 'run.mjs 的覆盖范围自述出口仍在场');
    const s = scanSrc();
    assert.ok(s.includes('cost-truthfulness'), '扫描器须保留自身标识');
    const self = readRoot(path.join('tests', 'v3286_cost_truthfulness.test.mjs'));
    assert.ok(self.length > 6000, '本档自身不得被清空（实 ' + self.length + ' 字符）');
    assert.ok(self.includes(A_SELF_HEAD), '本档须逐字持有扫描器路径常量');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');

    const pkg = JSON.parse(readRoot('package.json')).version;
    const man = JSON.parse(readRoot('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(readRoot('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'),
        'index.js 版本常量与 package.json 一致');
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    /* [v3.287.0 交棒] 本档写于 3.286.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */
    assert.ok(vnum(pkg) >= vnum('3.286.0'), '本档版本下界 3.286.0 不得被绕过（实 ' + pkg + '）');
    /* 本档必须已登记进两处登记面（否则 v3226 B1 / 在役面守卫会转红） */
    assert.ok(readRoot(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv')).includes('scan_cost_truthfulness.mjs'),
        '新扫描器须登记进探针矩阵');
    assert.ok(readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv')).includes('v3286_cost_truthfulness.test.mjs'),
        '本档须登记进在役测试面名册');
    ok('登记/工具/两个新出口/本档自身均在位（' + self.length + ' 字符）；两处登记面均已补行；版本四源同源');
});
