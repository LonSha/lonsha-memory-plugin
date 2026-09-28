// tests/v3253_open_face_registry.test.mjs — 跨仓外供功能登记表（计划一「共同配套」第 2 条）（v3.253.0）
//
//   计划原文要求：每个跨仓功能登记「拥有者 / 生产者版本 / 契约形状 / 消费者 / 失效条件 /
//   单独安装行为」，且「缺席 · 旧版 · 不产出 · 空数据」四种错法**分别呈现**。
//   修前实测（不是推测）：只有散点 —— 事件来源四态在一份 system 套件里、证据面三态在
//   另一份里，而「全仓一共有几面外供 / 每面的失效条件 / 单独装一个仓会怎样」
//   没有一处能回答。tests/audit/open_items_reconcile.md 的未做表里逐字写着「无统一登记表」。
//
//   判据面：
//     A 表本体：九列 / 面标识唯一 / 版本形态 / 四态逐字（计划原话）
//     B 双向：登记的行必须在磁盘上真在场（退位项），且已登记面可被按模块名反查
//     C 真源码破坏 → 同款判据必须转红（四条，每条对应一个 judge）
//     D 工具两向自证：锚点不存在 / 同值替换 / 命中多次 ⇒ 必须拒绝破坏
//     E 版本锚（当版 frontier）
//     F 判据面自防护：登记表里不得出现指向本套件的行（自指会让双向判据恒真）
//
//   本仓老账（写进判据，防止再犯）：
//     ① 「缺席」与「空」必须不同形 —— 而登记表是这件事被人手写的地方，
//        故「已分态」三个字不算：必须列出两种以上态词（T6）。
//     ② 判据撒谎比实现撒谎更难发现 —— 破坏必须打在**真文件内容**上，
//        并观测**同一条真判据**转红（不是另写一份“模拟判据”）。
//     ③ 注释不得字面引用锚点（v3216 假红的根因）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import {
    COLS, INVALID_STATES, parseRows, judgeTable, judgeSymbols, judgeDistribution,
    judgeConsumers, judgeInvalidStates, judgeAbsentVsEmpty, symbolHasFace, faceModule
} from './audit/scan_open_faces.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TABLE = path.join(ROOT, 'tests', 'audit', 'open_face_registry.tsv');
const read = (p) => fs.readFileSync(p, 'utf8');
const TABLE_SRC = read(TABLE);
const MANIFEST = JSON.parse(read(path.join(ROOT, 'manifest.json')));
const PARSED = parseRows(TABLE_SRC);
const ROWS = PARSED.rows;

/** 全量判据（与门禁同源：调同一批 judge，不另写一份）。 */
function allProblems(rows) {
    return []
        .concat(judgeTable(rows), judgeSymbols(rows, ROOT), judgeDistribution(rows, MANIFEST),
            judgeConsumers(rows), judgeInvalidStates(rows), judgeAbsentVsEmpty(rows));
}

/* ══════════ A 表本体 ══════════ */
test('v3253 A1. ★★ 登记表在场、九列齐备、且每面四态逐字（计划原话）', () => {
    assert.ok(fs.existsSync(TABLE), '登记表必须在场');
    assert.deepEqual(PARSED.problems, [], '每行必须恰有九列（制表符分隔）');
    assert.ok(ROWS.length >= 5, '本版实测 5 面，实得 ' + ROWS.length + '（表被删减？）');
    assert.equal(COLS.length, 9, '列定义即契约，不得增减');
    assert.deepEqual(INVALID_STATES, ['缺席', '旧版', '不产出', '空数据'], '四态词表是本表的核心口径');
    assert.deepEqual(judgeTable(ROWS), [], '面标识唯一 / 不流白 / 版本形态 / 归属仓');
    assert.deepEqual(judgeInvalidStates(ROWS), [], '失效条件须把四态分别呈现');
    assert.deepEqual(judgeAbsentVsEmpty(ROWS), [], '「缺席与空如何不同形」必须列出两种以上态');
    assert.deepEqual(judgeConsumers(ROWS), [], 'consumer 列只能是 name@N 或 none@0');
});

test('v3253 A2. ★ 表头逐字写明九列含义（否则表不可复现，也无从判某列该填什么）', () => {
    for (const c of COLS) {
        assert.ok(TABLE_SRC.includes(c), '表头必须逐字写明列名：' + c);
    }
    assert.ok(TABLE_SRC.includes('缺席') && TABLE_SRC.includes('旧版')
        && TABLE_SRC.includes('不产出') && TABLE_SRC.includes('空数据'), '表头须写明四态');
    assert.ok(TABLE_SRC.includes('J8/J10/J11/J12') || TABLE_SRC.includes('bridge-contract-audit'),
        '表头须指明下游核实挂在哪里（否则“声明”无从对照）');
});

/* ══════════ B 双向 ══════════ */
test('v3253 B1. ★★ 登记的每个符号在磁盘上真在场（退位项）', () => {
    assert.deepEqual(judgeSymbols(ROWS, ROOT), [], '登记的模块/符号都必须真在场');
});

test('v3253 B2. ★★★ 已登记面必须能被「按模块名反查」——这是「缺行」那半边的唯一入口', () => {
    for (const r of ROWS) {
        const mod = faceModule(r.upstream_symbol);
        assert.ok(mod, r.face + ' 的 upstream_symbol 必须含 :: 分隔');
        assert.equal(symbolHasFace(ROWS, mod), true, '反查必须命中：' + mod);
    }
    // 反向：未登记的模块必须反查不到（否则「缺行」永远判不出来）
    assert.equal(symbolHasFace(ROWS, 'settings-ui.js'), false, '未登记模块不得反查到');
    assert.equal(symbolHasFace(ROWS, '__ghost__.js'), false, '幽灵模块不得反查到');
});

test('v3253 B3. ★★ 面必须在分发面上（建好了但没上线 = 用户侧与没建同形）', () => {
    assert.deepEqual(judgeDistribution(ROWS, MANIFEST), [], '每个面的模块都必须在 manifest.js / extra_js 上');
});

/* ══════════ C 负控制：真表破坏 ⇒ 同款真判据必须转红 ══════════ */
// 先证明「未破坏时判据全真」—— 否则后面的“转红”可能是判据自己坏了（假红）。
test('v3253 N0. 阳性对照：未破坏时全量判据为零问题（否则 N 组是假红）', () => {
    assert.deepEqual(allProblems(ROWS), [], '原件上必须零问题');
});

test('v3253 N1. ★★ 负控制·T1 面标识重复 ⇒ judgeTable 转红', () => {
    const broken = breakSource(TABLE_SRC,
        'eventPlatforms	lonsha-memory-plugin	', 'projectionEnvelope	lonsha-memory-plugin	',
        'T1-face-dup');
    const rows = parseRows(broken).rows;
    assert.ok(judgeTable(rows).length > 0, 'face 重复必须让 T1 转红');
    assert.deepEqual(judgeTable(ROWS), [], '对照：原件上仍为零问题');
});

test('v3253 N2. ★★★ 负控制·版本形态非法（“旧版”半边的判据） ⇒ judgeTable 转红', () => {
    const broken = breakSource(TABLE_SRC,
        'projectionEnvelope	lonsha-memory-plugin	v3.212.0	',
        'projectionEnvelope	lonsha-memory-plugin	vNext	', 'T1-ver-shape');
    const rows = parseRows(broken).rows;
    assert.ok(judgeTable(rows).some((p) => p.includes('producer_version 形态非法')),
        '版本形态被写坏必须转红（下游据此判「旧版」）');
    assert.deepEqual(judgeTable(ROWS), [], '对照：原件上仍为零问题');
});

test('v3253 N3. ★★★ 负控制·消费面回到零消费 ⇒ judgeConsumers 转红', () => {
    const broken = breakSource(TABLE_SRC, 'readProjection@4', 'readProjection@0', 'T4-zero');
    const rows = parseRows(broken).rows;
    assert.ok(judgeConsumers(rows).some((p) => p.includes('下限为 0')),
        '「某一面回到零消费」正是要拦的形态，必须转红');
    assert.deepEqual(judgeConsumers(ROWS), [], '对照：原件上仍为零问题');
});

test('v3253 N4. ★★★ 负控制·四态被压成一态 ⇒ judgeInvalidStates 转红（本仓最贵的老账）', () => {
    // 把 eventPlatforms 的四态压成一句人话 —— 「已分态」但实际分不开
    const line = ROWS.find((r) => r.face === 'eventPlatforms');
    const broken = breakSource(TABLE_SRC, line.invalid_conditions, '各态已分别呈现', 'T5-collapse');
    const rows = parseRows(broken).rows;
    assert.ok(judgeInvalidStates(rows).some((p) => p.includes('未分别呈现四态')),
        '四态压成一态必须转红');
    assert.deepEqual(judgeInvalidStates(ROWS), [], '对照：原件上仍为零问题');
});

test('v3253 N5. ★★ 负控制·「缺席与空」被写成一句空话 ⇒ judgeAbsentVsEmpty 转红', () => {
    const line = ROWS.find((r) => r.face === 'projectionEnvelope');
    const broken = breakSource(TABLE_SRC, line.absent_vs_empty, '已分态', 'T6-vague');
    const rows = parseRows(broken).rows;
    assert.ok(judgeAbsentVsEmpty(rows).some((p) => p.includes('未列出两种以上态')),
        '“已分态”既不是判据也不是读数，必须转红');
    assert.deepEqual(judgeAbsentVsEmpty(ROWS), [], '对照：原件上仍为零问题');
});

test('v3253 N6. ★★★ 负控制·符号退位（表里留着已不存在的符号） ⇒ judgeSymbols 转红', () => {
    const broken = breakSource(TABLE_SRC, 'contractOf,', 'contractOfRetired,', 'T2-retired');
    const rows = parseRows(broken).rows;
    assert.ok(judgeSymbols(rows, ROOT).some((p) => p.includes('找不到定义')),
        '登记的符号在磁盘上没了必须转红（表最容易的死法）');
    assert.deepEqual(judgeSymbols(ROWS, ROOT), [], '对照：原件上仍为零问题');
});

test('v3253 N7. ★★ 负控制·移出分发面 ⇒ judgeDistribution 转红', () => {
    const mf = JSON.parse(JSON.stringify(MANIFEST));
    mf.extra_js = mf.extra_js.filter((f) => f !== 'projection-pipeline.js');
    assert.ok(judgeDistribution(ROWS, mf).some((p) => p.includes('不在分发面')),
        '模块移出 extra_js 必须转红（宿主不会加载它）');
    assert.deepEqual(judgeDistribution(ROWS, MANIFEST), [], '对照：原件上仍为零问题');
});
/* ══════════ D 工具两向自证 ══════════ */
// 负控制的软肋是「破坏自己没生效，而判据恰好也还绿」。故必须反向证明：
//   锚点不存在 / 锚点命中多次 / 同值替换 —— 三种情况下 breakSource 必须**拒绝**。
test('v3253 D1. ★★ 锚点不存在 ⇒ 拒绝破坏（防“破坏打偏”后判据仍在原件上跑）', () => {
    assert.throws(() => breakSource(TABLE_SRC, '__no_such_anchor_xyz__', 'x', 'D1'), /拒绝破坏/);
});

test('v3253 D2. ★★ 锚点命中多次 ⇒ 拒绝破坏（不是定点，负控制测的已不是那个点）', () => {
    assert.throws(() => breakSource(TABLE_SRC, 'lonsha-memory-plugin', 'x', 'D2'), /拒绝破坏/);
});

test('v3253 D3. ★★ 同值替换 ⇒ 拒绝破坏（否则“破坏副本”等于原件，退化成对原文件断言）', () => {
    assert.throws(() => breakSource(TABLE_SRC, 'readProjection@4', 'readProjection@4', 'D3'), /拒绝破坏/);
});

test('v3253 D4. ★★ 空锚点 ⇒ 拒绝破坏（任何源码都会命中）', () => {
    assert.throws(() => breakSource(TABLE_SRC, '', 'x', 'D4'), /拒绝破坏/);
});

/* ══════════ E 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3253 E1. ★ 版本锚（当版 frontier）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read(path.join(ROOT, 'index.js'))) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.253.0'), '本套件只在 3.253.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
    assert.equal(MANIFEST.version, codeVer);
});

/* ══════════ F 判据面自防护 ══════════ */
test('v3253 F1. ★★ 登记**数据行**不得自指本套件（自指会让双向判据恒真）', () => {
    /* 只看数据行、不看表头注释：表头里写明“由谁守”是有用信息，
     *   数据行里出现套件名才是错的（那种行会让“有没有这一面”恒真）。 */
    for (const r of ROWS) {
        const flat = COLS.map((c) => r[c]).join('|');
        assert.equal(flat.includes('v3' + '253'), false, r.face + ' 的数据行不得自指本套件');
        assert.equal(flat.includes('scan_' + 'open_faces'), false, r.face + ' 的数据行不得自指守卫名');
    }
});

test('v3253 F2. ★★ 判据面自防护：本套件只调用判据，不重写判据（同一口径只许一处）', () => {
    const own = read(path.join(HERE, 'v3253_open_face_registry.test.mjs'));
    /* 锚点字面量必须**拼接**，不得让断言字符串自己命中自己 ——
     *   那是 v3216 假红的根因（注释/字符串字面引用锚点），本仓已治过一次。 */
    const LIT = 'function ' + 'judge';
    assert.equal(own.includes(LIT + 'Table'), false, '判据实现必须住在守卫里');
    assert.equal(own.includes(LIT + 'Consumers'), false, '判据实现必须住在守卫里');
    assert.ok(own.includes('judgeTable('), '本套件必须真调用判据');
    assert.ok(own.includes('judgeSymbols('), '本套件必须真调用判据');
});

test('v3253 F3. ★★ 门禁入口与套件用同一份判据（runAll 必须调同一批 judge）', () => {
    const gate = read(path.join(ROOT, 'tests', 'audit', 'scan_open_faces.mjs'));
    for (const fn of ['judgeTable', 'judgeSymbols', 'judgeDistribution', 'judgeConsumers',
        'judgeInvalidStates', 'judgeAbsentVsEmpty']) {
        assert.ok(gate.includes('export function ' + fn), '守卫必须导出 ' + fn);
        assert.ok(gate.includes(fn + '('), 'runAll 必须调用 ' + fn);
    }
    assert.ok(gate.includes('isMain'), '守卫必须只在直接执行时跑主入口（否则 import 会 exit）');
});
