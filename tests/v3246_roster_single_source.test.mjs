/* ============================================================
 * tests/v3246_roster_single_source.test.mjs — v3.246.0
 *
 * 主题：账本名册**单一真源**（TODO「未收敛面」的收编）与 R9 的观测点。
 *
 * 修前实测（本版逐条核过，不是猜的）：
 *   同一份「谁在契约扫描面里」的名册在本仓有**四处手抄**：
 *     · `scan_ledger_contract.mjs` 的 `BOOKS` / `MIN_BOOKS`
 *     · `v3207` 的 `BOOKS`（＋ `NEEDS` / `NO_REVISION_BOOKS`）
 *     · `v3240` 的 `BOOK_FILES`
 *     · `v3242` / `v3243` 逐字相同的 `GAUGED`
 *   收编前先逐条判「同一份名册还是同名异义」：前三处是**同一份名册**（谁在契约扫描面里）；
 *   第四处的 `GAUGED` 是**同名异义** —— 它是 mirror 树要搬的文件集（manifest / 主入口 /
 *   契约 / 九账 / 登记表），与「账本名册」不是一件事。故：前三处收编，第四处只把其中
 *   「九本账」那一截换成派生（其余条目显式保留）。
 *
 * 更要紧的是**判据面的同源**：门禁原先断言「扫描面里有 N 本账」—— 判的是手抄的那份清单，
 *   不是磁盘事实。于是新增一本账本级的契约消费者能同时绕开 R2/R2b/R3/R3b/R3c（不在 `books`）
 *   与 R1（它在 manifest 里、装载面正常）。本版新增门禁 R9 量同一件事的两侧：
 *   谁真的在跑契约（派生读数）↔ 名册登记了谁（手写一处）。
 *
 * 覆盖：
 *   A 唯一真源面（真源导出面 + 指纹与九本账逐本命中，且只认代码）
 *   B 同源面（四处落点都点名真源入口，且不再有九账硬编码数组）
 *   C 行为面（合成树上跑派生函数：命中 / 不命中 / 只认代码三种形态）
 *   D 负控制（真源码破坏 → 破坏副本 → 同款判据必须转红）
 *   E 版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ledgerLevelConsumers, LE_BLOCK, NON_BOOK_CONSUMERS, RUNTIME_DEPS } from './_fixture_sync.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');
const LIB_SRC = read('tests/_fixture_sync.mjs');
const GATE_REL = 'tests/audit/scan_ledger_contract.mjs';
const GATE_SRC = read(GATE_REL);
const v3207Src = read('tests/v3207_ledger_entity_contract.test.mjs');
const v3240Src = read('tests/v3240_ledger_null_is_not_zero.test.mjs');
const v3242Src = read('tests/v3242_contract_domain_table.test.mjs');
const v3243Src = read('tests/v3243_numornull_semantics.test.mjs');
const ok = (m) => console.log('  ✓ ' + m);
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};
const CONTRACT = 'ledger-entity.js';
/* 磁盘面派生一次，供全档复用。 */
const BOOKS_ON_DISK = ledgerLevelConsumers(ROOT, readdirSync(ROOT).filter((f) => f.endsWith('.js')));

/* ══════════ A 唯一真源面 ══════════ */
test('v3246 A1. ★★★★ 名册由唯一真源派生（不是第五份手抄）', () => {
    for (const k of ['ledgerLevelConsumers', 'LE_BLOCK', 'NON_BOOK_CONSUMERS', 'RUNTIME_DEPS']) {
        assert.match(LIB_SRC, new RegExp('export (function|const) ' + k + '\\b'),
            '真源须导出 ' + k);
    }
    assert.ok(Array.isArray(BOOKS_ON_DISK), '派生入口必须回数组');
    assert.equal(BOOKS_ON_DISK.length, 9, '磁盘面派生九本（实测 ' + BOOKS_ON_DISK.length + '）');
    for (const f of ['seed-ledger.js', 'secret-ledger.js', 'parallel-ledger.js', 'commitment-ledger.js',
        'fact-version.js', 'event-completeness.js', 'recall-echo.js', 'echo-ledger.js', 'repair-loop.js']) {
        assert.ok(BOOKS_ON_DISK.indexOf(f) >= 0, '派生名册必须含 ' + f);
    }
    ok('唯一真源导出 4 项、磁盘面派生 9 本');
});
test('v3246 A2. ★★★ 指纹与九本账逐本逐字命中（判据 = 取库块，与门禁 R2 同一串）', () => {
    for (const f of BOOKS_ON_DISK) {
        assert.ok(read(f).includes(LE_BLOCK), f + ' 的取库块与真源指纹不逐字一致');
    }
    // 门禁必须用**同一个**指纹（不得各写一份字面量）
    assert.match(GATE_SRC, /const LE_BLOCK = FX\.LE_BLOCK;/,
        '门禁的取库块指纹须由真源给出（各写一份会在分叉时给出两个结论）');
    assert.ok(GATE_SRC.indexOf("const LE_BLOCK = \"const LE =") < 0,
        '门禁不得再自带一份指纹字面量');
    ok('九本账逐本命中同一串指纹');
});
test('v3246 A3. ★★★ 只认代码：注释里写着取库块不算消费', () => {
    const dir = mkdtempSync(path.join(path.resolve(process.env.TMPDIR || '/tmp'), 'v3246-a3-'));
    try {
        writeFileSync(path.join(dir, 'only-comment.js'),
            '// 当年这里是 ' + LE_BLOCK + '\nmodule.exports = 1;\n');
        writeFileSync(path.join(dir, 'real.js'),
            LE_BLOCK + '\nmodule.exports = 2;\n');
        const got = ledgerLevelConsumers(dir, ['only-comment.js', 'real.js']);
        assert.deepEqual(got, ['real.js'], '只认代码（注释里的指纹不算）');
    } finally { rmSync(dir, { recursive: true, force: true }); }
    assert.match(LIB_SRC, /stripComments\(src\)\.includes\(LE_BLOCK\)/,
        '派生入口必须先剥注释再判（否则注释里写着也算消费）');
    ok('注释形态被排除、真实形态被收录');
});

/* ══════════ B 同源面：四处落点 ══════════ */
test('v3246 B1. ★★★★ 四处落点都点名真源入口，且不再有九账硬编码数组', () => {
    assert.match(GATE_SRC, /const LEDGER_LEVEL = FX\.ledgerLevelConsumers\(ROOT, extra\);/,
        '门禁须在 extra_js 加载面上派生');
    assert.match(GATE_SRC, /const BOOKS = \['seed-ledger\.js'/,
        '门禁仍保留一处**显式名册**（R9 要拿它与派生读数对差，不能两边都派生）');
    assert.match(v3207Src, /const BOOKS = ledgerLevelConsumers\(ROOT, readdirSync\(ROOT\)/,
        'v3207 的名册须由真源派生');
    assert.match(v3240Src, /const BOOK_FILES = ledgerLevelConsumers\(ROOT, fs\.readdirSync\(ROOT\)/,
        'v3240 的名册须由真源派生');
    for (const [name, src] of [['v3207', v3207Src], ['v3240', v3240Src]]) {
        assert.ok(!/'seed-ledger\.js', 'secret-ledger\.js', 'parallel-ledger\.js'/.test(src),
            name + ' 不得再有九账硬编码数组（收编后应只剩派生调用）');
    }
    ok('三处收编 + 门禁保留 R9 的对差锚');
});
test('v3246 B2. ★★★ GAUGED 是**同名异义**：只把九账那一截派生，其余显式保留', () => {
    for (const [name, src] of [['v3242', v3242Src], ['v3243', v3243Src]]) {
        assert.ok(!/'seed-ledger\.js', 'secret-ledger\.js'/.test(src),
            name + ' 的 GAUGED 不得再手抄九账');
        assert.match(src, /const GAUGED = \['manifest\.json', 'index\.js', CONTRACT_REL,\s*\n\s*\.\.\.ledgerLevelConsumers\(/,
            name + ' 的 GAUGED 须由真源派生九账那一截');
        assert.match(src, /'tests\/audit\/catalog_reference_consumers\.tsv'\];/,
            name + ' 的 GAUGED 须仍显式保留登记表（它不是账本级消费者，派生不出来）');
        assert.match(src, /同名异义/, name + ' 须留痕说明「GAUGED 不是账本名册」');
    }
    ok('GAUGED 九账段派生、其余显式保留、留痕在场');
});
test('v3246 B3. ★★ NON_BOOK_CONSUMERS 是显式登记点（空表也有读数，不是死表）', () => {
    assert.ok(Array.isArray(NON_BOOK_CONSUMERS), '登记面必须是数组');
    assert.equal(NON_BOOK_CONSUMERS.length, 0, '当前事实：没有非账本消费者（实测）');
    assert.match(GATE_SRC, /new Set\(BOOKS\.concat\(FX\.NON_BOOK_CONSUMERS\)\)/,
        '门禁须把登记面算进「已登记」一侧（否则登记了也没用）');
    assert.match(GATE_SRC, /含非账本消费者 ' \+ FX\.NON_BOOK_CONSUMERS\.length/,
        '空表也要有读数（有值没人读正是本仓治理过的形态）');
    ok('登记面已接线且有读数');
});

/* ══════════ C 行为面（合成树） ══════════ */
test('v3246 C1. ★★★ 派生入口在合成树上的四种形态', () => {
    const dir = mkdtempSync(path.join(path.resolve(process.env.TMPDIR || '/tmp'), 'v3246-c1-'));
    try {
        assert.deepEqual(ledgerLevelConsumers(dir, []), [], '空入参 → 空');
        assert.deepEqual(ledgerLevelConsumers(dir, ['absent.js']), [], '文件不在场 → 跳过（不抛）');
        writeFileSync(path.join(dir, 'a.js'), LE_BLOCK + '\n');
        writeFileSync(path.join(dir, 'b.js'), 'const LE = null;\n');
        assert.deepEqual(ledgerLevelConsumers(dir, ['a.js', 'b.js']), ['a.js'],
            '只收真在跑契约的（本地实现不算）');
        assert.deepEqual(ledgerLevelConsumers(dir, null), [], '非数组入参 → 空（不抛）');
    } finally { rmSync(dir, { recursive: true, force: true }); }
    ok('四种形态：空入参 / 缺席 / 命中与不命中并存 / 非数组');
});

/* ══════════ D 负控制（真源码破坏 → 破坏副本 → 同款判据必须转红） ══════════ */
/** 判据 1：真源的派生入口必须「先剥注释」（否则注释里写着也算消费） */
function judgeStripsComments(src) {
    return /stripComments\(src\)\.includes\(LE_BLOCK\)/.test(src);
}
/** 判据 2：门禁必须由真源派生（不得退回手抄） */
function judgeGateDerives(src) {
    return /const LEDGER_LEVEL = FX\.ledgerLevelConsumers\(ROOT, extra\);/.test(src);
}
/** 判据 3：套件不得退回手抄九账 */
function judgeNoHandcopy(src) {
    return /ledgerLevelConsumers\(ROOT, readdirSync\(ROOT\)/.test(src)
        && !/'seed-ledger\.js', 'secret-ledger\.js'/.test(src);
}
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    const out = src.split(anchor).join(repl);
    if (out === src) throw new Error('拒绝破坏：替换未改变源码');
    return out;
}
test('v3246 D1. ★★★★ 判据在原件上先正一次（否则后面的负控制是假红）', () => {
    assert.ok(judgeStripsComments(LIB_SRC), '真源须先剥注释');
    assert.ok(judgeGateDerives(GATE_SRC), '门禁须由真源派生');
    assert.ok(judgeNoHandcopy(v3207Src), 'v3207 须由真源派生');
    ok('三条判据在原件上为真');
});
test('v3246 D2. ★★★★ N1 去掉 stripComments ⇒ 同款判据必须转红', () => {
    const broken = breakText(LIB_SRC,
        'if (stripComments(src).includes(LE_BLOCK)) out.push(f);',
        'if (src.includes(LE_BLOCK)) out.push(f);');
    assert.equal(judgeStripsComments(broken), false, '去掉剥注释后判据必须转红');
});
test('v3246 D3. ★★★★ N2 门禁退回手抄 ⇒ 同款判据必须转红', () => {
    const broken = breakText(GATE_SRC,
        'const LEDGER_LEVEL = FX.ledgerLevelConsumers(ROOT, extra);',
        "const LEDGER_LEVEL = ['seed-ledger.js', 'secret-ledger.js'];");
    assert.equal(judgeGateDerives(broken), false, '退回手抄后判据必须转红');
});
test('v3246 D4. ★★★★ N3 v3207 退回手抄 ⇒ 同款判据必须转红', () => {
    const broken = breakText(v3207Src,
        "const BOOKS = ledgerLevelConsumers(ROOT, readdirSync(ROOT).filter((f) => f.endsWith('.js')));",
        "const BOOKS = ['seed-ledger.js', 'secret-ledger.js', 'parallel-ledger.js',\n"
            + "    'commitment-ledger.js', 'fact-version.js', 'event-completeness.js',\n"
            + "    'recall-echo.js', 'echo-ledger.js', 'repair-loop.js'];");
    assert.equal(judgeNoHandcopy(broken), false, '退回手抄后判据必须转红');
});
test('v3246 D5. ★★★ 破坏工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakText(LIB_SRC, 'THIS_ANCHOR_ABSENT_V3246', ''), /拒绝破坏/);
    assert.throws(() => breakText(LIB_SRC, 'const ', ''), /拒绝破坏/);
    assert.throws(() => breakText(LIB_SRC, 'export const', 'export const'), /拒绝破坏/);
    ok('工具两向自证成立');
});
test('v3246 D6. ★★★ 运行时依赖清单是两项（按加载图，不按改动）', () => {
    assert.deepEqual(RUNTIME_DEPS, ['tests/_audit_lib.mjs', 'tests/_fixture_sync.mjs'],
        'RUNTIME_DEPS 必须含真源**自己**的依赖（只列新加那个 import 会让夹具跑不起来）');
    assert.match(LIB_SRC, /import \{ stripComments \} from '\.\/_audit_lib\.mjs';/,
        '真源确实依赖 _audit_lib（清单与加载图同源）');
    ok('RUNTIME_DEPS 两项，与加载图一致');
});

/* ══════════ E 判据面自防护与版本锚 ══════════ */
test('v3246 E1. ★★ 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 30, '本套件断言数 ' + asserts + ' 少于 30：判据被稀释');
    for (const fp of ['ledgerLevelConsumers', 'LE_BLOCK', 'NON_BOOK_CONSUMERS', 'RUNTIME_DEPS',
        'scan_ledger_contract.mjs', 'FX.ledgerLevelConsumers', '同名异义', '拒绝破坏']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    ok('断言 ' + asserts + ' 条，指纹齐全');
});
test('v3246 E2. ★ 版本锚（下限锚，不随抬版漂移；三源同源）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    assert.ok(vnum(codeVer) >= vnum('3.246.0'), '本套件只在 3.246.0 及以后成立；当前 ' + codeVer);
    assert.equal(JSON.parse(read('manifest.json')).version, codeVer, 'manifest 与入口同源');
    assert.equal(JSON.parse(read('package.json')).version, codeVer, 'package.json 与入口同源');
    assert.ok(SELF.includes("vnum('3.246.0')"), '须显式留下出生版本锚');
    ok('版本 ' + codeVer + ' 三源互等');
});