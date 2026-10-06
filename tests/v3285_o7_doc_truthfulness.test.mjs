// tests/v3285_o7_doc_truthfulness.test.mjs — v3.285.0 O8：文档读数真实性门的成对套件
// 主题：`tests/audit/scan_doc_truthfulness.mjs` 的每条判据都必须**真能翻红** ——
//   一个「永远 exit 0」的文档扫描器同样是绿的，所以它必须有合成仓负控制。
//
//   【本档钉什么】
//     A  结构面：扫描器在位 + 支持夹具模式 + 下限常量在场 + 从唯一真源进口 stripComments
//     B  合成仓逐条：D1~D6 各自造一处不一致 ⇒ exit 1 且点名到那条判据
//     B2b 非现值数字未标时点 ⇒ exit 1（现值口径从「门禁基线行」扩到 README 全文）
//     C  fail-closed：文档/登记缺失 ⇒ exit 2（探测器失效，拒绝给结论）
//     D  健康仓 ⇒ exit 0（防「永远红」的另一种假绿）
//     E  历史口径豁免：带版本前缀的历史数字不得被判缺陷（防把诚实留痕当说谎）
//     F  面自证：枚举塌陷（根级 .js 太少 / 审计面太少）⇒ exit 2
//     G  判据纯度 H5：破坏锚点字面量各只有 1 个持有常量 + 真源上单命中
//     H  真源码破坏：摘掉任一条判据 ⇒ 本档同一条判据翻红
//     I  自防护 + 三源同源 + 当版锚点
//     J  重绑工具 fail-closed：不真跑 / 非全量 / 有失败 / 缺审计 / 版本错位 ⇒ 一律 exit 1，不写盘
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SCAN_REL = path.join('tests', 'audit', 'scan_doc_truthfulness.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  ✓ ' + m);
const NL = String.fromCharCode(10);

/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有；全部单行） ---- */
const A_D1 = "problems.push('D1 README 当前版本 '";
const A_D2 = "problems.push('D2 README 测试文件数 '";
const A_D2B = "problems.push('D2b README:'";
const A_D3 = "problems.push('D3 README 里的 extra_js 项数自相矛盾：'";
const A_D4 = "problems.push('D4 README 运行时模块 '";
const A_D5 = "problems.push('D5 PLAN 版本 '";
const A_D6 = "problems.push('D6 README 全量快照 v'";
const A_FLOOR = "const FLOOR_TESTS = numEnv('LONSHA_AUDIT_MIN_TESTS') || (FIXTURE_MODE ? 1 : 200);";
const A_DRIFT = "const drift = (m) => { console.error('[doc-truthfulness] ' + m); process.exit(2); };";
const A_SELF_LEN = 'assert.ok(self.length > 6000';
const A_SELF_HEAD = 'const SCAN_REL = ';

/* ══════════════ 合成仓构造 ══════════════ */

/** 造一个最小但「健康」的合成仓：扫描器全套判据都应通过。 */
function mkRepo(mut = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-doctruth-'));
    const testsDir = path.join(dir, 'tests');
    const auditDir = path.join(testsDir, 'audit');
    fs.mkdirSync(auditDir, { recursive: true });

    const state = {
        version: '9.9.9',
        tests: 210, auditGated: 41, auditAll: 43, rootJs: 62, extraJs: 7,
        readmeVersion: '9.9.9',
        readmeTests: 210, readmeAudit: 41, readmeAuditDisk: 43,
        readmeExtra: 7, readmeExtraAgain: 7, readmeModules: 62,
        readmeAssertions: 1234,
        planVersion: '9.9.9', planExtra: 7, planTests: 210, planAssertions: 1234, planAudit: 41,
        regVersion: '9.9.9', regAssertions: 1234,
        /* 快照版本与当前版本分开：滞后但如实标「全量待验」是**合法状态**。 */
        snapVersion: '9.9.9',
        staleMarker: false,
        omitReadme: false, omitPlan: false, omitReg: false, omitCl: false,
        /* D9 档自述：合成仓里也必须有一份「当前版本节」——
         *   缺 CHANGELOG 是结构漂移（exit 2），故夹具默认给一份健康的。 */
        clClaimFile: 'tests/t0.test.mjs', clClaimCount: 1,
        readmeHistorical: '（截至 v3.266.0，246 个测试文件 · 0 失败）',
        readmeFiller: 'x'.repeat(2200), planFiller: 'y'.repeat(3200),
    };
    mut(state);

    fs.writeFileSync(path.join(dir, 'index.js'), "const VERSION = '" + state.version + "';" + NL);
    const extra = [];
    for (let i = 0; i < state.extraJs; i++) extra.push('mod' + i + '.js');
    fs.writeFileSync(path.join(dir, 'manifest.json'),
        JSON.stringify({ js: 'index.js', css: 'style.css', extra_js: extra }, null, 1));
    /* index.js 已单独写出，故填充 printf 根级 .js 只建 rootJs-1 个 —— 否则恒比 state.rootJs 多 1。 */
    for (let i = 0; i < state.rootJs - 1; i++) fs.writeFileSync(path.join(dir, 'root' + i + '.js'), '// m' + NL);
    for (let i = 0; i < state.tests; i++) {
        /* 每个档放**一条** `test(` —— D9 要按 `^test(` 数条数，夹具必须让它可算。 */
        fs.writeFileSync(path.join(testsDir, 't' + i + '.test.mjs'), "test('t', () => {});" + NL);
    }
    for (let i = 0; i < state.auditAll; i++) {
        const nm = (i < state.auditAll - state.auditGated) ? '_probe' + i + '.mjs' : 'scan' + i + '.mjs';
        fs.writeFileSync(path.join(auditDir, nm), '// s' + NL);
    }

    if (!state.omitReadme) {
        const readme = [
            '# syn',
            '**当前版本**：`' + state.readmeVersion + '`（由 scan_version_guard 把守）',
            '**在役面读数**（磁盘枚举，不代表已实跑）：`npm test` 当前发现 **' + state.readmeTests
                + ' 个测试文件**；`npm test -- --audit` 当前发现 **' + state.readmeAudit + '/' + state.readmeAudit
                + '** 审计脚本（`tests/audit/` 磁盘 **' + state.readmeAuditDisk + '** 个，3 个 `_` 前缀探针不进门禁扫描面）。',
            '**最近一次全量实跑快照**：v' + state.snapVersion + ' · ' + state.readmeTests + ' 个测试文件 · '
                + state.readmeAssertions + ' 断言 · 0 失败 · 审计 ' + state.readmeAudit + '/' + state.readmeAudit
                + '。' + (state.staleMarker ? '当前版本 v' + state.readmeVersion + ' **全量待验**。' : '')
                + state.readmeHistorical,
            '```bash',
            'npm test             # 全部用例：' + state.readmeTests + ' 个测试文件，各自独立子进程（隔离全局态污染）',
            '```',
            '模块位于**根目录**：由 `manifest.json` 的 `extra_js`（' + state.readmeExtra + ' 项）按**文件名**加载，',
            '├── manifest.json             # 插件清单（js / css / extra_js ' + state.readmeExtraAgain + ' / extra_css 2）',
            '**载入面**：`index.js` + `extra_js` ' + state.readmeExtra + ' 项 + CSS 3 项',
            '另注：`extra_js` ' + state.readmeExtraAgain + ' 项。',
            '**运行时模块**：' + state.readmeModules + ' 个（根目录 `.js`，含入口 `index.js`）',
            '**在役门禁**：`tests/` ' + state.readmeTests + ' 个测试文件（`*.test.mjs`）/ `tests/audit/` '
                + state.readmeAudit + ' 个审计脚本（磁盘 ' + state.readmeAuditDisk + '，3 个 `_` 探针不进门禁扫描面）',
            state.readmeFiller,
        ].join(NL) + NL;
        fs.writeFileSync(path.join(dir, 'README.md'), readme);
    }
    if (!state.omitPlan) {
        const plan = [
            '# plan',
            '| 量 | 读数 | 出处 |',
            '|---|---|---|',
            '| 版本 | **v' + state.planVersion + '**（四源同源） | `scan_version_guard.mjs` |',
            '| 门禁 | 在役面 **' + state.planTests + ' 测试文件 / ' + state.planAudit + ' 个 audit 脚本**（磁盘 '
                + state.readmeAuditDisk + '） | `tests/` 实读 |',
            '| 全量快照 | 最近全量快照 **v' + state.snapVersion + '：' + state.planTests + ' 测试文件 / '
                + state.planAssertions + ' 断言 0 失败 / 审计 ' + state.planAudit + '/' + state.planAudit + '**'
                + (state.staleMarker ? '；当前 v' + state.planVersion + ' **全量待验**' : '') + ' | 登记 |',
            '| 体量 | `index.js` **100 行** + extra_js **' + state.planExtra + '** 项 | `wc -l` |',
            state.planFiller,
        ].join(NL) + NL;
        fs.writeFileSync(path.join(dir, 'PLAN.md'), plan);
    }
    if (!state.omitReg) {
        fs.writeFileSync(path.join(auditDir, 'doc_readings.json'), JSON.stringify({
            file: 'tests/audit/doc_readings.json',
            measured_at: 'v' + state.regVersion, version: state.regVersion,
            tests_total: state.tests, assertions: state.regAssertions,
            audit_passed: state.auditGated, audit_total: state.auditGated,
        }, null, 1));
    }
    /* D9 面的源：合成仓的 CHANGELOG「当前版本节」。
     *   两句契约声明（退出码三档 / 绝不跑全量）必须逐字在场，否则 D9 会因「缺声明」恒红 ——
     *   而夹具存在的意义是让**被测判据**成为唯一变量。 */
    if (!state.omitCl) {
        const cl = [
            '## v' + state.version, '',
            '**合成仓**（D9 夹具）。',
            '- 交付 `' + state.clClaimFile + '`（' + state.clClaimCount + ' 条）：夹具档。',
            '退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。',
            '本脚本绝不跑全量（断言数需要一次实跑才可信，改走登记 + 重绑）。',
            '',
            '## v9.9.8', '旧版留痕（历史节，不受现值口径约束）。',
        ].join(NL) + NL;
        fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), cl);
    }
    /* 关键：破坏副本要与真源**同形层级**（tests/audit/），因为扫描器 import '../_audit_lib.mjs'。
     *   首版把副本写在仓根 ⇒ 该 import 解析到 <tmp>/../_audit_lib.mjs ⇒ MODULE_NOT_FOUND ⇒ 恒 rc=1，
     *   F 段四条「摘掉判据后必须不再翻红」全部落空（实测）。故这里补一份同形真源。 */
    fs.copyFileSync(path.join(ROOT, 'tests', '_audit_lib.mjs'), path.join(testsDir, '_audit_lib.mjs'));
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
test('v3285 A. 扫描器在位、支持夹具模式、下限常量与真源进口都在场', () => {
    assert.ok(fs.existsSync(SCAN), '扫描器必须在 tests/audit/scan_doc_truthfulness.mjs');
    const s = scanSrc();
    assert.ok(s.includes('LONSHA_AUDIT_FIXTURE'), '须支持夹具模式（合成仓用）');
    assert.ok(s.includes('LONSHA_AUDIT_ROOT'), '须支持改根（合成仓用）');
    assert.ok(s.includes('FLOOR_TESTS') && s.includes('FLOOR_AUDIT') && s.includes('FLOOR_ROOTJS'),
        '须有面下限常量（枚举失效时「0 不一致」是空对空）');
    assert.ok(s.includes("from '../_audit_lib.mjs'"), '须从唯一真源进口助手（不得本地重写）');
    assert.ok(s.includes('process.exit(2)'), 'drift 出口必须是 2（结构漂移）');
    assert.ok(s.includes('process.exit(1)'), '真缺陷出口必须是 1');
    /* D9 的存在性锚点：缺了它，扫描器就退回「只管项目级读数」的上一版。 */
    assert.ok(s.includes("D9 CHANGELOG"), '须有 D9 档自述读数判据（文档逐版自述也是读数）');
    assert.ok(s.includes("const HEAD_SRC = CL_SRC.split(/\\n## v[0-9.]+/)[0]"),
        'D9 的面须限定在「当前版本节」（历史节的自述是当时时点，判它是反模式）');
    assert.ok(s.includes("['child_' + 'process'"), 'D9 的「绝不跑全量」核对须按拼接形态写（防判据自命中）');
    ok('结构面齐备');
});

/* ══════════════ B. 合成仓逐条（六条判据各自翻红） ══════════════ */
test('v3285 B1. 健康合成仓 ⇒ exit 0（防「永远红」的另一种假绿）', () => {
    withRepo(() => {}, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '健康仓必须 exit 0：' + r.out.slice(-400));
    });
    ok('健康合成仓 exit 0');
});

test('v3285 B2. D1 README 版本与 index.js 不一致 ⇒ exit 1 且点名 D1', () => {
    withRepo((s) => { s.readmeVersion = '9.9.8'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '版本不一致必须 exit 1');
        assert.ok(r.out.includes('D1'), '必须点名 D1：' + r.out.slice(-300));
    });
    ok('D1 翻红');
});

test('v3285 B3. D2 测试文件数 / 审计脚本数不一致 ⇒ exit 1 且点名 D2', () => {
    withRepo((s) => { s.readmeTests = 205; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '测试数不一致必须 exit 1');
        assert.ok(r.out.includes('D2'), '必须点名 D2');
    });
    withRepo((s) => { s.readmeAudit = 40; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '审计数不一致必须 exit 1');
        assert.ok(r.out.includes('D2'), '必须点名 D2');
    });
    withRepo((s) => { s.readmeAuditDisk = 42; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '磁盘数不一致必须 exit 1');
        assert.ok(r.out.includes('D2'), '必须点名 D2');
    });
    ok('D2 三个读数各自翻红');
});

test('v3285 B4. D3 extra_js 自相矛盾 + D4 运行时模块数不一致 ⇒ exit 1', () => {
    withRepo((s) => { s.readmeExtraAgain = 6; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '自相矛盾的 extra_js 必须 exit 1');
        assert.ok(r.out.includes('D3'), '必须点名 D3（自相矛盾）');
    });
    withRepo((s) => { s.readmeExtra = 6; s.readmeExtraAgain = 6; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'extra_js 与 manifest 不一致必须 exit 1');
        assert.ok(r.out.includes('D3'), '必须点名 D3');
    });
    withRepo((s) => { s.readmeModules = 60; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '运行时模块数不一致必须 exit 1');
        assert.ok(r.out.includes('D4'), '必须点名 D4');
    });
    ok('D3（两种）+ D4 翻红');
});

test('v3285 B5. D5 PLAN 版本 / extra_js / 门禁数不一致 ⇒ exit 1', () => {
    withRepo((s) => { s.planVersion = '9.9.8'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'PLAN 版本不一致必须 exit 1');
        assert.ok(r.out.includes('D5'), '必须点名 D5');
    });
    withRepo((s) => { s.planExtra = 6; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'PLAN extra_js 不一致必须 exit 1');
        assert.ok(r.out.includes('D5'), '必须点名 D5');
    });
    withRepo((s) => { s.planAudit = 40; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'PLAN audit 数不一致必须 exit 1');
        assert.ok(r.out.includes('D5'), '必须点名 D5');
    });
    ok('D5 三个读数各自翻红');
});

test('v3285 B6. D6 全量快照四元组 ↔ 登记 逐项一致，且「未实跑」不得冒充已通过', () => {
    /* 前两种：手抄数字与登记不符（断言数 / 快照版本）。 */
    withRepo((s) => { s.readmeAssertions = 1200; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'README 断言数与登记不一致必须 exit 1');
        assert.ok(r.out.includes('D6'), '必须点名 D6');
    });
    withRepo((s) => { s.snapVersion = '9.9.8'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '快照版本与登记不一致必须 exit 1');
        assert.ok(r.out.includes('D6'), '必须点名 D6');
    });
    withRepo((s) => { s.regAssertions = 1200; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, 'PLAN/README 与登记不一致必须 exit 1');
        assert.ok(r.out.includes('D6'), '必须点名 D6');
    });
    /* ★ 合法状态：快照滞后于当前版本，但**如实标「全量待验」** ⇒ exit 0。
     *   这条是本档存在的核心理由：未实跑 ≠ 文档说谎。若把它判红，过门禁的唯一出路
     *   就是提前跑全量（而用户纪律明确禁止）。 */
    withRepo((s) => { s.regVersion = '9.9.8'; s.snapVersion = '9.9.8'; s.staleMarker = true; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '快照滞后但已如实标「全量待验」⇒ 必须 exit 0（实 ' + r.code + '）：' + r.out.slice(-400));
    });
    /* 反向：滞后却写成已通过（无待验标记）⇒ 缺陷 */
    withRepo((s) => { s.regVersion = '9.9.8'; s.snapVersion = '9.9.8'; s.staleMarker = false; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '快照滞后却未标「全量待验」⇒ 必须 exit 1（未实跑不得冒充已通过）');
        assert.ok(r.out.includes('全量待验'), '归因须点名「全量待验」缺失：' + r.out.slice(-300));
    });
    /* 反向之二：快照已对齐当前版本却仍留待验标记 ⇒ 把已实跑说成没跑，同属读数不实 */
    withRepo((s) => { s.staleMarker = true; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '快照已对齐却仍标「全量待验」⇒ 必须 exit 1');
    });
    ok('D6：三条不一致翻红 + 滞后已标注为绿 + 滞后未标署 / 对齐却标待验各自翻红');
});

/* ══════════════ B2b. README 全文现值口径 ══════════════ */
test('v3285 B2b. README 全文「N 个测试文件」：非现值必须带时点前缀，否则 exit 1', () => {
    /* 现值（磁盘 210）⇒ 无需前缀，绿。 */
    withRepo((s) => { s.readmeHistorical = '（另有 210 个测试文件 · 0 失败）'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '现值数字即使写在别处也必须被接受：' + r.out.slice(-300));
    });
    /* 非现值 + 无时点前缀 ⇒ 会被读成现值 ⇒ 缺陷。 */
    withRepo((s) => { s.readmeHistorical = '（另有 246 个测试文件 · 0 失败）'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '非现值且无时点前缀必须 exit 1');
        assert.ok(r.out.includes('D2b'), '必须点名 D2b：' + r.out.slice(-300));
    });
    /* 非现值 + 时点前缀 ⇒ 合法留痕，每种前缀形态各验一次。 */
    for (const hist of ['（截至 v3.266.0，246 个测试文件 · 0 失败）', '（当年 246 个测试文件）',
        '（原为 246 个测试文件）', '（此前 246 个测试文件）']) {
        withRepo((s) => { s.readmeHistorical = hist; }, (dir) => {
            const r = run(dir);
            assert.equal(r.code, 0, '带时点前缀的历史读数必须被豁免：' + hist + ' ⇒ ' + r.out.slice(-240));
        });
    }
    ok('现值免前缀；非现值无前缀翻红；四种时点前缀各自豁免');
});

/* ══════════════ B7. D9 档自述读数 ══════════════ */
test('v3285 B7. D9 档自述条数 / 契约声明不一致 ⇒ exit 1（文档逐版自述也是读数）', () => {
    /* ① 自述条数 ≠ 磁盘 `^test(` 条数 —— 这正是本刀自己在 CHANGELOG 里犯过的错（13 vs 15）。 */
    withRepo((s) => { s.clClaimCount = 2; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '自述条数与磁盘不符必须 exit 1（实 ' + r.code + '）：' + r.out.slice(-300));
        assert.ok(r.out.includes('D9'), '须点名 D9：' + r.out.slice(-300));
        assert.ok(r.out.includes('≠ 磁盘'), '须给出磁盘真值：' + r.out.slice(-300));
    });
    /* ② 自述一个**不存在**的档 —— 档改名/退役后留痕未标注。 */
    withRepo((s) => { s.clClaimFile = 'tests/t_ghost_9999.test.mjs'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '自述不存在的档必须 exit 1（实 ' + r.code + '）');
        assert.ok(r.out.includes('不在磁盘上'), '须点名「文件不在磁盘上」：' + r.out.slice(-300));
    });
    /* ③ 当前版本节缺「退出码三档」声明 —— 扫描器契约必须写在文档里。 */
    withRepo((s) => { s.clClaimFile = 'tests/t0.test.mjs'; }, (dir) => {
        const clPath = path.join(dir, 'CHANGELOG.md');
        fs.writeFileSync(clPath, fs.readFileSync(clPath, 'utf8')
            .replace('退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。', '（声明被摘）'));
        const r = run(dir);
        assert.equal(r.code, 1, '缺「退出码三档」声明必须 exit 1（实 ' + r.code + '）');
        assert.ok(r.out.includes('退出码三档'), '须点名缺哪句声明：' + r.out.slice(-300));
    });
    /* ④ 健康夹具必须绿（否则上面三条可能是「永远红」）。 */
    withRepo(() => {}, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '健康夹具上 D9 不得误红（实 ' + r.code + '）：' + r.out.slice(-300));
    });
    /* ⑤ 「绝不跑全量」支路必须有翻红证明：往扫描器副本里塞进起子进程的能力 ⇒ 必红。
     *   为什么单列：D9 的第二支路（无子进程能力）此前只有**正向读数**（真仓上打印 ok），
     *   没有任何东西证明它**真的会拦** —— 那正是 v3226 C2「恒绿探测器」的形态。 */
    {
        const broken = scanSrc() + '\n// 假破坏：spawn(' + 'process.execPath, []);\n';
        withRepo(() => {}, (dir) => {
            const p = path.join(dir, 'tests', 'audit', 'scan2.mjs');
            fs.writeFileSync(p, broken);
            const r = spawnSync(process.execPath, [p], {
                cwd: dir, encoding: 'utf8',
                env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir },
            });
            const code = r.status == null ? -1 : r.status;
            const out = String(r.stdout || '') + String(r.stderr || '');
            assert.equal(code, 1, '扫描器出现子进程能力时必须翻红（实 ' + code + '）：' + out.slice(-300));
            assert.ok(out.includes('绝不跑全量'), '须点名被违反的那句声明：' + out.slice(-300));
        });
    }
    ok('D9：条数不符 / 幽灵档 / 缺契约声明 / 子进程能力各自翻红，健康夹具仍绿');
});

/* ══════════════ C. fail-closed（结构漂移 ⇒ exit 2） ══════════════ */
test('v3285 C. 文档缺失 / 登记缺失 / 面塌陷 ⇒ exit 2（不得给结论）', () => {
    for (const [mut, label] of [
        [(s) => { s.omitReadme = true; }, 'README 缺失'],
        [(s) => { s.omitPlan = true; }, 'PLAN 缺失'],
        [(s) => { s.omitReg = true; }, '登记缺失'],
        [(s) => { s.omitCl = true; }, 'CHANGELOG 缺失（D9 面的源）'],
    ]) {
        withRepo(mut, (dir) => {
            const r = run(dir);
            assert.equal(r.code, 2, label + ' 必须 exit 2（实 ' + r.code + '）：' + r.out.slice(-300));
        });
    }
    /* 变体：不合法 JSON 的登记同样属「无法给结论」 */
    withRepo(() => {}, (dir) => {
        fs.writeFileSync(path.join(dir, 'tests', 'audit', 'doc_readings.json'), '{ not json');
        const r = run(dir);
        assert.equal(r.code, 2, '登记不是合法 JSON ⇒ exit 2（不得静默通过）');
        assert.ok(r.out.includes('doc_readings.json'), '须点名登记文件：' + r.out.slice(-300));
    });
    /* 面下限：机制本身须可被证明（默认值在夹具模式放松，故用 env 覆盖来触发） */
    for (const [env, label] of [
        [{ LONSHA_AUDIT_MIN_TESTS: '99999' }, '测试面上限'],
        [{ LONSHA_AUDIT_MIN_AUDIT: '99999' }, '审计面上限'],
        [{ LONSHA_AUDIT_MIN_ROOTJS: '99999' }, '根级 .js 上限'],
    ]) {
        withRepo(() => {}, (dir) => {
            const r = run(dir, env);
            assert.equal(r.code, 2, label + ' 触发时必须 exit 2（实 ' + r.code + '）：' + r.out.slice(-300));
            assert.ok(r.out.includes('塌陷'), '须点名「面塌陷」：' + r.out.slice(-300));
        });
    }
    ok('3 种缺件 + 非法登记 + 3 种面下限触发 ⇒ 全部 exit 2');
});

/* ══════════════ D. 历史口径豁免 ══════════════ */
test('v3285 D. 带版本前缀的历史数字不得被判缺陷（诚实留痕 ≠ 说谎）', () => {
    withRepo((s) => { s.readmeHistorical = '（截至 v3.266.0，246 个测试文件 · 0 失败）'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '带「截至 vX.Y.Z」的历史数字必须被豁免：' + r.out.slice(-300));
    });
    /* 反向：历史数字**不带**版本前缀 ⇒ 必须报「未标时点」（否则会被读成现值） */
    withRepo((s) => { s.readmeHistorical = '（当年 246 个测试文件 · 0 失败）'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '「当年」也是时点标记，应豁免');
    });
    withRepo((s) => { s.readmeHistorical = '（另有 246 个测试文件 · 0 失败）'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '既非现值又无时点前缀的数字必须翻红（防被读成现值）');
        assert.ok(r.out.includes('未标版本/时点'), '须给出「未标时点」的归因：' + r.out.slice(-300));
    });
    ok('历史口径豁免（含反向：无时点前缀则红）');
});

/* ══════════════ E. 判据纯度（H5） ══════════════ */
test('v3285 E. 判据纯度：破坏锚点字面量在本档各只有 1 个持有常量，且真源上单命中', () => {
    const self = readRoot(path.join('tests', 'v3285_o7_doc_truthfulness.test.mjs'));
    const holders = new Map();
    for (const [label, a] of [['D1', A_D1], ['D2', A_D2], ['D2b', A_D2B], ['D3', A_D3], ['D4', A_D4],
        ['D5', A_D5], ['D6', A_D6], ['FLOOR', A_FLOOR], ['DRIFT', A_DRIFT]]) {
        assert.equal(a.includes(NL), false, label + ' 须是单行锚点');
        assert.ok(a.length > 12, label + ' 锚点须足够长');
        const esc = a.replace(/\n/g, '\\n');
        assert.ok(self.includes(esc), label + ' 锚点字面量须逐字被本档持有');
        if (!holders.has(esc)) holders.set(esc, new Set());
        holders.get(esc).add(label);
    }
    for (const [esc, set] of holders) {
        assert.equal(set.size, 1, '字面量 ' + esc + ' 被多个锚点常量持有：' + [...set].join(' / '));
    }
    /* 这些锚点必须**恰在本档的锚点数组里**各出现一次（声明序自证） */
    const declRe = /^const\s+(A_[A-Z0-9_]+)\s*=/gm;
    const declNames = [...self.matchAll(declRe)].map((m) => m[1]);
    assert.deepEqual(declNames, ['A_D1', 'A_D2', 'A_D2B', 'A_D3', 'A_D4', 'A_D5', 'A_D6', 'A_FLOOR',
        'A_DRIFT', 'A_SELF_LEN', 'A_SELF_HEAD'], '本档锚点常量声明序须稳定');
    /* 真源扫描器里，每条归因文案与两个结构锚点各恰中一次 */
    const s = scanSrc();
    assertSingleHit(s, A_D1, 'v3285_h1');
    assertSingleHit(s, A_D2, 'v3285_h2');
    assertSingleHit(s, A_D2B, 'v3285_h2b');
    assertSingleHit(s, A_D3, 'v3285_h3');
    assertSingleHit(s, A_D4, 'v3285_h4');
    assertSingleHit(s, A_D5, 'v3285_h5');
    assertSingleHit(s, A_D6, 'v3285_h6');
    assertSingleHit(s, A_FLOOR, 'v3285_h7');
    assertSingleHit(s, A_DRIFT, 'v3285_h8');
    ok('9 个锚点各只有 1 个持有常量，且在真源扫描器上各恰中一次');
});

/* ══════════════ F. 真源码破坏（同一条判据必须翻红） ══════════════ */
test('v3285 F. 真源码破坏：摘掉任一条判据 ⇒ 合成仓上不再翻红（判据不是装饰）', () => {
    const s = scanSrc();
    /** 在合成仓上跑一个「被破坏过的扫描器副本」。 */
    const runBroken = (brokenSrc, dir, extraEnv) => {
        /* 必须落在 tests/audit/ —— 扫描器 import '../_audit_lib.mjs' 的解析基准就是它所在目录。 */
        /* 覆盖夹具已有门禁文件，保持 auditAll/auditGated 两个枚举读数不变。 */
        const p = path.join(dir, 'tests', 'audit', 'scan2.mjs');
        fs.writeFileSync(p, brokenSrc);
        const r = spawnSync(process.execPath, [p], {
            cwd: dir, encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir, ...(extraEnv || {}) },
        });
        return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
    };

    /* ① 摘掉 D1：把 D1 的比较改成恒等 */
    {
        const broken = breakSource(s, 'else if (m[1] !== VERSION) problems.push(\'D1 README 当前版本 \'',
            'else if (false) problems.push(\'D1 README 当前版本 \'', 'v3285_f1');
        withRepo((st) => { st.readmeVersion = '9.9.8'; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.equal(r.code, 0, '摘掉 D1 后，版本不一致必须**不再**翻红（证明该判据真的在起作用）');
        });
    }
    /* ② 摘掉 D3 的自相矛盾检查 */
    {
        const broken = breakSource(s, "    else if (counts.size > 1) {",
            '    else if (false) {', 'v3285_f2');
        withRepo((st) => { st.readmeExtraAgain = 6; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.equal(r.code, 0, '摘掉自相矛盾检查后必须不再翻红');
        });
    }
    /* ③ 摘掉 D6 的快照滞后分支（整支：待验标记与反向判据都在其中） */
    {
        const broken = breakSource(s, "        if (reg.version !== VERSION) {",
            "        if (false) {", 'v3285_f3');
        withRepo((st) => { st.regVersion = '9.9.8'; st.snapVersion = '9.9.8'; st.staleMarker = false; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.equal(r.code, 0, '摘掉快照滞后分支后必须不再翻红（实 ' + r.code + '）');
        });
    }
    /* ③b 摘掉「对齐却仍标待验」的反向判据：把已实跑说成没跑也不该再翻红。
     *   为什么单列一条：这一条是本档**存在理由**的另一面（读数不实，两个方向都要判），
     *   它若被摘掉而无人发现，整档就退化成一个多此一举的格式检查。 */
    {
        const broken = breakSource(s, "            if (rp || pp) {",
            "            if (false) {", 'v3285_f3b');
        withRepo((st) => { st.staleMarker = true; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.equal(r.code, 0, '摘掉反向判据后，对齐却标待验不得再翻红（实 ' + r.code + '）：' + r.out.slice(-300));
        });
    }
    /* ③c 摘掉 D2b 的现值口径：非现值数字不再被判缺陷。 */
    {
        const broken = breakSource(s, "            if (TIME_PREFIX.test(pre)) continue;",
            "            if (true) continue;", 'v3285_f3c');
        withRepo((st) => { st.readmeHistorical = '（另有 246 个测试文件 · 0 失败）'; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.equal(r.code, 0, '摘掉 D2b 归因后必须不再翻红（实 ' + r.code + '）：' + r.out.slice(-300));
        });
    }
    /* ④ 拔掉下限机制：即便把下限顶到天上去，也不该再 exit 2（证明下限真的在拦） */
    {
        const broken = breakSource(s, A_FLOOR,
            "const FLOOR_TESTS = 0;", 'v3285_f4');
        withRepo(() => {}, (dir) => {
            const r = runBroken(broken, dir, { LONSHA_AUDIT_MIN_TESTS: '99999' });
            assert.equal(r.code, 0, '下限被拔掉后，超高下限不得再触发 exit 2（实 ' + r.code + '）');
        });
    }
    /* ⑤ 摘掉 D9 的条数比较：文档自称「N 条」与实际不符时不再翻红。 */
    {
        const broken = breakSource(s, "            if (claimed !== actual) {",
            '            if (false) {', 'v3285_f5');
        withRepo((st) => { st.clClaimCount = 2; }, (dir) => {
            const r = runBroken(broken, dir);
            assert.equal(r.code, 0, '摘掉 D9 条数比较后必须不再翻红（实 ' + r.code + '）：' + r.out.slice(-300));
        });
    }
    ok('七处真源码破坏各自让对应判据失去作用（D1 / D3 / D6 滞后分支 / D6 反向 / D2b / 面下限 / D9 条数）');
});

/* ══════════════ G. 自防护 + 三源 + 当版锚点 ══════════════ */
/* ══════════════ J. 重绑工具：不真跑的摘要不得被登记成真读数 ══════════════ */
/* 为什么必测（本档的理由同源）：登记文件是「断言数」的唯一权威来源，而它由工具写。
 *   工具若把**失败摘要 / 未带 --audit 的摘要 / 旧版摘要**照签不误，那就等于把
 *   「一次不完整或失败的实跑」永久写成「N 文件 · M 断言 · 0 失败」—— 本档 D6 会
 *   忠实地拿这个假数字去核对文档，两边一起绿。即：**探测器坏了，结论该被怀疑**。 */
test('v3285 J. 重绑工具 fail-closed：六种不合用摘要 ⇒ exit 1 且不写盘', () => {
    const TOOL = path.join(ROOT, 'tools', '_rebind_doc_readings.py');
    assert.ok(fs.existsSync(TOOL), '重绑工具须在场');
    const mk = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-rebind-'));
        fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.js'), "const VERSION = '9.9.9';" + NL);
        return dir;
    };
    const runTool = (dir, summaryText) => {
        const sp = path.join(dir, 'summary.json');
        fs.writeFileSync(sp, summaryText);
        const r = spawnSync('python3', [TOOL, sp], {
            cwd: ROOT, encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
        });
        const reg = path.join(dir, 'tests', 'audit', 'doc_readings.json');
        return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || ''), wrote: fs.existsSync(reg), reg };
    };
    const GOOD = JSON.stringify({
        version: '9.9.9', ok: true, assertions: 4242,
        tests: { total: 5, passed: 5, failed: [], wall: 1 },
        audit: { total: 3, passed: 3, failed: [], wall: 1 },
    });

    /* ① 健康摘要 ⇒ 写入，且写入值零手抄（断言数来自 summary.assertions） */
    {
        const dir = mk();
        try {
            const r = runTool(dir, GOOD);
            assert.equal(r.code, 0, '健康摘要必须写入（实 ' + r.code + '）：' + r.out.slice(-300));
            assert.ok(r.wrote, '登记文件必须被写出');
            const reg = JSON.parse(fs.readFileSync(r.reg, 'utf8'));
            assert.equal(reg.version, '9.9.9');
            assert.equal(reg.tests_total, 5);
            assert.equal(reg.assertions, 4242, '断言数来自摘要，不得手抄');
            assert.equal(reg.audit_passed, 3);
            assert.equal(reg.audit_total, 3);
            assert.ok(reg.rebinds && reg.rebinds['v9.9.9'], '历史留痕 rebinds 必须追加（不覆盖）');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }

    /* ② 六种不合用摘要（含非法 JSON）各自必须 exit 1 且**不写盘** */
    const BAD = [
        ['不是合法 JSON', '{ not json'],
        ['ok=false（失败跑）', JSON.stringify({ version: '9.9.9', ok: false, assertions: 1, tests: { total: 5, passed: 4, failed: [{ file: 'x' }] }, audit: { total: 3, passed: 3 } })],
        ['有失败文件但 ok=true', JSON.stringify({ version: '9.9.9', ok: true, assertions: 1, tests: { total: 5, passed: 4, failed: [{ file: 'x' }] }, audit: { total: 3, passed: 3 } })],
        ['缺 audit 段（未带 --audit）', JSON.stringify({ version: '9.9.9', ok: true, assertions: 1, tests: { total: 5, passed: 5, failed: [] }, audit: null })],
        ['审计有失败', JSON.stringify({ version: '9.9.9', ok: true, assertions: 1, tests: { total: 5, passed: 5, failed: [] }, audit: { total: 3, passed: 2 } })],
        ['版本错位（旧摘要签当版）', JSON.stringify({ version: '9.9.8', ok: true, assertions: 1, tests: { total: 5, passed: 5, failed: [] }, audit: { total: 3, passed: 3 } })],
        ['拿不到断言数', JSON.stringify({ version: '9.9.9', ok: true, tests: { total: 5, passed: 5, failed: [] }, audit: { total: 3, passed: 3 } })],
    ];
    for (const [label, text] of BAD) {
        const dir = mk();
        try {
            const r = runTool(dir, text);
            assert.equal(r.code, 1, label + ' 必须 exit 1（实 ' + r.code + '）');
            assert.equal(r.wrote, false, label + ' 不得写出登记文件（fail-closed 要真的不落盘）');
            assert.ok(r.out.includes('rebind-doc-readings'), label + ' 须给出可读归因');
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    ok('健康摘要写入且零手抄；七种不合用摘要（含非法 JSON）各自 exit 1 且从不落盘');
});

test('v3285 G. 自防护：登记文件与扫描器都不得被摘掉；O8 真源特征在场', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'tests', 'audit', 'doc_readings.json')), '登记文件须在场');
    assert.ok(fs.existsSync(path.join(ROOT, 'tools', '_rebind_doc_readings.py')), '重绑工具须在场');
    assert.ok(readRoot('index.js').includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(readRoot('index.js').includes('rebindModuleDeps'), 'O7 第一批真源特征仍在场');
    const s = scanSrc();
    assert.ok(s.includes('doc-truthfulness'), '扫描器须保留自身标识');
    const self = readRoot(path.join('tests', 'v3285_o7_doc_truthfulness.test.mjs'));
    assert.ok(self.length > 6000, '本档自身不得被清空（实 ' + self.length + ' 字符）');
    assert.ok(self.includes(A_SELF_HEAD), '本档须逐字持有扫描器路径常量');
    assert.ok(self.includes(A_SELF_LEN), '本档须持有自防护锚点');
    assert.ok(self.includes("from './_audit_lib.mjs'"), '剥注释须从唯一真源进口');
    ok('登记 / 工具 / 真源特征 / 本档自身均在位（' + self.length + ' 字符）');
});

test('v3285 H. 三源同源，且本档恰锚当版（供版本守卫 V4 计数）', () => {
    const pkg = JSON.parse(readRoot('package.json')).version;
    const man = JSON.parse(readRoot('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    const vnum = (s) => String(s).split('.').map((x) => Number(x)).join('.');
    const mf = JSON.parse(readRoot('manifest.json'));
    assert.equal(pkg, man, 'package.json 与 manifest.json 版本一致');
    assert.ok(readRoot('index.js').includes('const VERSION = ' + SQ + pkg + SQ + ';'), 'index.js 版本常量与 package.json 一致');
    /* O8 的“机器装载面一致”里最硬的一条：extra_js 数组里每一项都真实存在 */
    for (const m of mf.extra_js) {
        assert.ok(fs.existsSync(path.join(ROOT, m)), 'extra_js 登记的模块必须真实存在：' + m);
    }
    /* [v3.286.0 交棒] 本档写于 3.285.0；转下限锚：后续版本须 >= 它，不得把历史档锁成恰好等于当版。 */
    assert.ok(vnum(pkg) >= vnum('3.285.0'), '本档版本下界 3.285.0 不得被绕过（实 ' + pkg + '）');
    ok('三源同源；manifest.extra_js ' + mf.extra_js.length + ' 项全部真实存在；本档下界 v3.285.0（当版锚已交棒给 v3286）');
});