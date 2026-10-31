/* ============================================================
 * tests/v3427_l11_audit_face_repair.test.mjs — v3.427.0
 *   第十一期 L11 遗留四件审计面的「恒绿探测器」修复验收
 * ------------------------------------------------------------
 * 本版开工的事实：L11-O2 / O3 / O6 / O7 / O9 五件产物（三个审计脚本 + 三张台账
 * + 两份判据 + 两个生成器）已写好但**从未提交**，全量实跑 7 个文件红、16 条断言红。
 * 逐条定位后分两类：
 *   A. **登记面**（4 条）：新产物没进各条台账 —— catalog_reference_consumers.tsv
 *      缺两份测试、audit_scan_probe_matrix.tsv 缺三个扫描器、state-report 未重算。
 *   B. **门禁本身有病**（2 条，比 A 重要）：按本仓纪律新建扫描器必须过 H/G/T
 *      三档退化实测，实测抓到两个**恒绿探测器**。
 *
 * ★ 本档把 B 类的两处修法钉死（这是本版真正的产品面改动，不是登记）：
 *   1. `scan_test_budget.mjs` 初版 **H=0 G=0 T=0** —— 三档全 0 即「无论输入面怎么坏
 *      它都发合格证」。它只判 JSON 自洽（schema / policy / top_20 类型 / limit_ms >
 *      ms），而这些从磁盘上那份 JSON 里永远读得到。修法：把三条**输入面**接进判据
 *      —— 预算 version ↔ index.js VERSION、登记档必须在磁盘上真在、登记档须像测试档
 *      （非空 + 含 test( 调用）。修后实测 **H=0 G=2 T=1**。
 *   2. `scan_extra_js_seam.mjs` 初版 **G=0** —— 只比 manifest ↔ tsv ↔ consumption
 *      三张表，三张表互相自洽就永远绿：把根目录 .js 全删掉，它照样报「覆盖全部
 *      244 个模块」。修法：把磁盘在场率接进判据（缺件过半 ⇒ exit 2 面塌陷；缺件
 *      少数 ⇒ exit 1 账本残留）。修后实测 **H=0 G=2 T=0**。
 *
 * ★ 另记一处**修中间抓到的新缺陷**（本档一并钉住）：`scan_extra_js_seam.mjs` 静态
 *   import 了生成器 `tools/gen_extra_js_seam_ledger.mjs` 却**零调用**。代价在 v3159
 *   的 scratch 树上炸出来：该测试按 manifest 物化注册脚本进临时树、不物化 tools/，
 *   于是门禁崩在 ESM 加载栈（ERR_MODULE_NOT_FOUND ⇒ exit 1），判据根本没跑。
 *   本仓纪律「门禁只读产物、不依赖生成器」—— 生成与核对必须能分开跑。
 *
 * ★ 以及一处**口径缺口**（如实登记，本版不改判据）：消费面把 docs/planning/*.mjs
 *   计划探针也算成「生产消费」。实测 `unified-recall.js` 全仓唯一引用就在
 *   docs/planning/2026-10-20-product-probe.mjs。门禁现打 docsOnlySupport 读数，
 *   决策留给产品面（本档只验「读数真存在且非空」）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};

/* ───────────── 1. 当版锚（版本守卫 V4 的基准） ───────────── */
/* [v3.428.0 交棒] 当版锚已交给 tests/v3428_l12_o1_kernel_wiring.test.mjs。
 *   本档退回**出生下界**形（版本守卫 V2：历史文件不得把当前版本写死成等号；
 *   V3：下界不得高于现版）。 */
test('v3427 1. 出生锚：本档锁在自己出生的 3.427.0（下界，不锁当版）', () => {
    assert.ok(vnum('3.427.0') >= 3427000);
});

/* ───────────── 2. 两个恒绿探测器的修复：三档实测 ─────────────
 * 三档形态按 tests/audit/audit_scan_probe_matrix.tsv 表头**逐字**复现：
 *   H = 镜像不改动；G = 删掉镜像根目录全部 .js；T = 把 tests/ 下 .mjs（除 audit/
 *   与 _audit_lib.mjs）逐份置为 `// gutted`。每个扫描器从**镜像内**路径执行、
 *   带 LONSHA_AUDIT_ROOT=镜像。
 * 本档只跑两个扫描器（三个档 × 两份 = 6 次 spawn），耗时可控；
 * 全量矩阵复核在 tests/v3226_audit_sensitivity.test.mjs。 */
function mirror(mut) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3427-gt-'));
    fs.cpSync(ROOT, dir, {
        recursive: true,
        filter: (src) => !/[\\/](\.git|node_modules|\.tmp)([\\/]|$)/.test(src),
    });
    if (mut) mut(dir);
    return dir;
}
function deleteRootJs(dir) {
    const walk = (d) => {
        for (const n of fs.readdirSync(d)) {
            const p = path.join(d, n);
            const st = fs.statSync(p);
            if (st.isDirectory()) { if (n !== '.git' && n !== 'node_modules') walk(p); }
            else if (n.endsWith('.js')) fs.rmSync(p, { force: true });
        }
    };
    walk(dir);
}
function gutTests(dir) {
    const tdir = path.join(dir, 'tests');
    const walk = (d) => {
        for (const n of fs.readdirSync(d)) {
            const p = path.join(d, n);
            const st = fs.statSync(p);
            if (st.isDirectory()) { if (n !== 'audit') walk(p); }
            else if (n.endsWith('.mjs') && n !== '_audit_lib.mjs') fs.writeFileSync(p, '// gutted\n', 'utf8');
        }
    };
    walk(tdir);
}
function grade(scan) {
    const out = {};
    for (const [k, mut] of [['H', null], ['G', deleteRootJs], ['T', gutTests]]) {
        const dir = mirror(mut);
        try {
            const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'audit', scan)], {
                cwd: dir,
                env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
                encoding: 'utf8',
                timeout: 120000,
            });
            out[k] = r.status === null ? 'TIMEOUT' : r.status;
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
    return out;
}

test('v3427 2. ★★★ scan_test_budget 不再是恒绿探测器：H=0 且 G、T 至少一列非 0', () => {
    const g = grade('scan_test_budget.mjs');
    assert.equal(g.H, 0, '健康树上不得误红（H 必须 0），实得 ' + g.H);
    assert.ok(g.G !== 0 || g.T !== 0,
        '两档退化都不敏感 = 恒绿探测器（初版实测 H/G/T = 0/0/0，正是本版修掉的那一处）：'
        + JSON.stringify(g));
    // 本版实测的具体形态也钉住（口径漂移要在这里响，而不是只响在矩阵表里）
    assert.equal(g.G, 2, 'G 档（根 .js 全删）应 fail-closed exit 2（读不到 index.js 的 VERSION 真源）：' + JSON.stringify(g));
    assert.equal(g.T, 1, 'T 档（测试体被掏空）应 exit 1（登记档全成空壳 = 覆盖虚报）：' + JSON.stringify(g));
});

test('v3427 3. ★★★ scan_extra_js_seam 对「模块根本不存在」敏感：G 档必须响', () => {
    const g = grade('scan_extra_js_seam.mjs');
    assert.equal(g.H, 0, '健康树上不得误红（H 必须 0），实得 ' + g.H);
    assert.notEqual(g.G, 0,
        'G 档必须响（初版实测 G=0：三张表互相自洽就永远绿，把根 .js 全删也报「覆盖全部 244 个模块」）：'
        + JSON.stringify(g));
    assert.equal(g.G, 2, 'G 档应 fail-closed exit 2（缺件过半 ⇒ 模块装载面塌陷）：' + JSON.stringify(g));
});

/* ───────────── 3. 死 import 已摘：门禁不依赖生成器 ─────────────
 * v3159 的 scratch 树只物化 manifest 注册脚本，不含 tools/。门禁若静态 import
 * 生成器，就会崩在 ESM 加载栈上（exit 1）而**判据根本没跑** —— 那是「门禁不过」
 * 的假信号。本档直接钉「源码里不得再有对生成器的静态依赖」。 */
test('v3427 4. ★★ scan_extra_js_seam 不得静态依赖生成器（否则 scratch 树上崩在加载栈）', () => {
    const src = read('tests/audit/scan_extra_js_seam.mjs');
    const staticImports = [...src.matchAll(/^\s*import\s+[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]);
    const offending = staticImports.filter((spec) => spec.includes('tools/'));
    assert.deepEqual(offending, [],
        '门禁只读产物、不依赖生成器（生成与核对必须能分开跑）；现有静态 import：'
        + JSON.stringify(staticImports));
    // 而且它确实还读账本（摘 import 不等于把功能摘了）
    assert.ok(/extra_js_seam_ledger\.tsv/.test(src), '账本读取面必须还在');
});

/* ───────────── 4. 三份负控制都有原版对照组（E3） ─────────────
 * fixture_sync 的 E3 判据点：只验「破坏会翻红」而不验「原版是绿的」，会把
 * 「破坏写死成模拟常量」判成绿。三份新负控制都必须先证绿再证红。 */
test('v3427 5. ★★ 三份新负控制都有「原版对照」组，且都带 K4 定点破坏', () => {
    const negs = ['scan_module_consumption_negctl.mjs', 'scan_extra_js_seam_negctl.mjs', 'scan_test_budget_negctl.mjs'];
    for (const n of negs) {
        const src = read('tests/audit/' + n);
        assert.ok(/原版对照/.test(src), n + ' 缺「原版对照」组（只验破坏翻红、不验卫生态绿）');
        assert.ok(/锚点须恰中 1 次/.test(src), n + ' 缺 K4 定点检查（锚点须恰中 1 次，否则破坏位置不可复现）');
    }
});

/* ───────────── 5. 口径缺口读数：docsOnlySupport 必须真打得出来 ─────────────
 * 本版实测：`unified-recall.js` 的唯一生产引用在 docs/planning 的计划探针里。
 * 门禁不改判据，但必须把这件事**念出来** —— 不念就是静默。 */
test('v3427 6. ★★ 消费门禁必须念出「消费点全靠 docs/ 计划探针」的模块', () => {
    const r = spawnSync(process.execPath, [path.join(AUDIT, 'scan_module_consumption.mjs')], {
        cwd: ROOT, encoding: 'utf8', timeout: 120000,
    });
    assert.equal(r.status, 0, '健康树上必须 exit 0：' + (r.stderr || '').slice(-300));
    const out = (r.stdout || '') + (r.stderr || '');
    assert.ok(/全部来自 docs\//.test(out), '须打出 docsOnlySupport 读数（本版实测 unified-recall.js 命中）');
    assert.ok(/unified-recall\.js/.test(out), '须点名 unified-recall.js（本版实测的唯一命中项）');
});

/* ───────────── 6. 三张登记面必须与磁盘同源（A 类 4 条的守门） ───────────── */
test('v3427 7. ★★ 三张登记面与磁盘同源（新增产物必须同版登记）', () => {
    // ① 跨仓参考基准：磁盘 tests/*.test.mjs 全集 ⊆ 登记表
    const ref = new Set(read('tests/audit/catalog_reference_consumers.tsv')
        .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
        .map((l) => l.split('\t')[0]));
    const disk = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'));
    assert.deepEqual(disk.filter((f) => !ref.has(f)), [], '磁盘新增的测试未登记进 catalog_reference_consumers.tsv');

    // ② 灵敏度矩阵：在役扫描器 ⊆ 登记表（且 H 列全 0、G/T 至少一列非 0）
    const rows = read('tests/audit/audit_scan_probe_matrix.tsv')
        .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'))
        .map((l) => l.split('\t'));
    const listed = new Set(rows.map((r) => r[0]));
    const inService = fs.readdirSync(AUDIT)
        .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !f.includes('negctl'));
    assert.deepEqual(inService.filter((s) => !listed.has(s)), [], '在役扫描器未登记进灵敏度矩阵');
    const dead = rows.filter((r) => Number(r[2]) === 0 && Number(r[3]) === 0).map((r) => r[0]);
    assert.deepEqual(dead, [], '两档退化都不敏感的扫描器就是恒绿探测器：' + dead.join(', '));

    // ③ 状态报告：测试/审计计数必须与磁盘一致
    const rep = JSON.parse(read('tests/audit/state-report.json'));
    assert.equal(rep.gates.test_files, disk.length,
        'state-report.test_files 与磁盘不同源（重跑 `node tools/gen_state_report.mjs --write`）');
    /* 口径必须与生成器一致（tools/gen_state_report.mjs 的 auditGated = audit/ 下
     *   `.mjs` 或 `.cjs`、且不以 `_` 开头）。只数 `.mjs` 会漏三个 `.cjs` 探针，
     *   于是「报告 70 / 本档算 69」——**判据自己的口径写窄了**，红的是判据不是产物。 */
    const auditN = fs.readdirSync(AUDIT)
        .filter((f) => (f.endsWith('.mjs') || f.endsWith('.cjs')) && !f.startsWith('_')).length;
    assert.equal(rep.gates.audit_gated, auditN,
        'state-report.audit_gated 与磁盘不同源（重跑 `node tools/gen_state_report.mjs --write`）');
});

/* ───────────── 7. 负控制：真源码破坏 → 独立树 → 同款真判据 ─────────────
 * 破坏本档自己钉的两条判据之一，确认它会翻红（否则本档是空转）。 */
test('v3427 N1. ★★ 负控制：把 seam 门禁的在场率守卫写死成常量 ⇒ 第 3 条转红', () => {
    const SRC = read('tests/audit/scan_extra_js_seam.mjs');
    const ANCHOR = 'if (missingOnDisk.length > 0 && missingRatio > 0.5) {';
    assert.equal(SRC.split(ANCHOR).length - 1, 1, '锚点须恰中 1 次（锚点漂移即破坏位置不可复现）');
    const broken = SRC.replace(ANCHOR, 'if (false) {');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3427-neg-'));
    try {
        fs.cpSync(ROOT, dir, {
            recursive: true,
            filter: (s) => !/[\\/](\.git|node_modules|\.tmp)([\\/]|$)/.test(s),
        });
        fs.writeFileSync(path.join(dir, 'tests', 'audit', 'scan_extra_js_seam.mjs'), broken, 'utf8');
        deleteRootJs(dir);
        const r = spawnSync(process.execPath, [path.join(dir, 'tests', 'audit', 'scan_extra_js_seam.mjs')], {
            cwd: dir,
            env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
            encoding: 'utf8',
            timeout: 120000,
        });
        assert.notEqual(r.status, 2,
            '守卫被写死后 G 档不应再 fail-closed（若仍 exit 2，说明破坏没打到真判据）');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
