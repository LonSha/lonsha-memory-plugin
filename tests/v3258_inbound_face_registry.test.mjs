// tests/v3258_inbound_face_registry.test.mjs — v3.258.0
//
// 跨仓**反向**外供面登记表（下游产出 → 上游消费）[v3.258.0]
//
//   【为什么需要它】
//     本仓已有一张正向表（open_face_registry.tsv：上游产出 → 本仓消费），
//     它的表头第 6 行原写着「本表只登记上游→下游方向的外供面（下游→上游方向当前 0 面，
//     故无行）」。而那句现已不真：下游 ruby-phone 的手机记忆桥 `lonshaBridge` 早就在本仓真被消费
//     （本仓 index.js 四处调用点：回填 / 召回 / 楼层生命周期两族）。
//     「声明没有判据 ⇒ 声明会漂移」—— 这次漂的是**两仓的规划文档**，
//     两边都没人说错话，两边也都没人核过。
//
//   【为什么另起一张表 + 另起一份判据】
//     正向表的六条判据（T1~T6）与本文件前身 v3253 的 N0「未破坏时全量判据为零问题」
//     全部是**按「上游产出、下游消费」写的**，方向反转后逐条错位：
//       · T2 要在本仓磁盘上找 upstream_symbol 的定义 —— 而反向面的**产出方在下游**；
//       · T4 的 consumer 语法是 《读出口名》@《下限》，反向面该写的是「上游哪些出口在调」；
//       · T5/T6 的四态与分态口径按产出方写；
//       · N0（阳性对照）会当场把新行判红 —— 那张表的判据无法容纳异向行。
//     硬塞另有第二条死路：把表的语义改成「混合方向」，就丢掉了原表的价值
//     （「本仓一共外供了几面」这个问题从此没有一处能干净回答）。
//
//   【本文件判什么】
//     A 表本体：九列 / 面标识唯一 / 版本形态 / **方向硬断**（owner 不得是本仓）/ 四态逐字
//     B 真源码面：消费面在磁盘且出口名真在场 / 消费面在分发面 / 下限形态
//     C 负控制：真表破坏 ⇒ 同款真判据必须转红（七例）
//     D 工具两向自证：锚点不存在 / 命中多次 / 同值替换 / 空锚点 ⇒ 必须拒绝破坏
//     E 版本锚（当版 frontier）
//     F 判据面自防护：数据行不得自指本套件 / 判据实现住在守卫里 / 入口与套件同源
//     G 两表实时对账：正向表表头不得再声称「下游→上游 0 面」（那句已不真）
//
//   本仓老账（写进判据，防止再犯）：
//     ① 判据撒谎比实现撒谎更难发现 —— 破坏必须打在**真文件内容**上，
//       并观测**同一条真判据**转红（不是另写一份模拟判据）。
//     ② 方向反转的硬断必须在表层就源码可见（owner 不得是本仓）：
//       否则「把消费面当成产出面再登一遍」可以静默通过。
//     ③ 注释不得字面引用锚点（v3216 假红的根因）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import {
    COLS_IN, INVALID_STATES_IN, parseRowsIn, judgeInboundTable, judgeConsumersInbound,
    judgeDistributionInbound, judgeFloorsInbound, judgeInvalidStatesInbound,
    judgeAbsentVsEmptyInbound, symbolHasInboundFace, downstreamModule
} from './audit/scan_inbound_faces.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TABLE = path.join(ROOT, 'tests', 'audit', 'open_face_registry_inbound.tsv');
const FORWARD = path.join(ROOT, 'tests', 'audit', 'open_face_registry.tsv');
const read = (p) => fs.readFileSync(p, 'utf8');
const TABLE_SRC = read(TABLE);
const MANIFEST = JSON.parse(read(path.join(ROOT, 'manifest.json')));
const PARSED = parseRowsIn(TABLE_SRC);
const ROWS = PARSED.rows;

/** 全量判据（与门禁同源：调同一批 judge，不另写一份）。 */
function allProblems(rows) {
    return []
        .concat(judgeInboundTable(rows), judgeConsumersInbound(rows, ROOT),
            judgeDistributionInbound(rows, MANIFEST), judgeFloorsInbound(rows),
            judgeInvalidStatesInbound(rows), judgeAbsentVsEmptyInbound(rows));
}

/* ══════════ A 表本体 ══════════ */
test('v3258 A1. ★★ 反向登记表在场、九列齐备、且面满足四态逐字', () => {
    assert.ok(fs.existsSync(TABLE), '反向登记表必须在场：open_face_registry_inbound.tsv');
    assert.deepEqual(PARSED.problems, [], '每行必须恰有九列（制表符分隔）');
    assert.ok(ROWS.length >= 1, '本版实测 1 面，实得 ' + ROWS.length + '（表被删减？）');
    assert.equal(COLS_IN.length, 9, '列定义即契约，不得增减');
    assert.deepEqual(INVALID_STATES_IN, ['缺席', '旧版', '不产出', '空数据'], '四态词表是本表的核心口径');
    assert.deepEqual(judgeInboundTable(ROWS), [], '面标识唯一 / 不留白 / 版本形态 / 方向硬断');
    assert.deepEqual(judgeInvalidStatesInbound(ROWS), [], '失效条件须把四态分别呈现');
    assert.deepEqual(judgeAbsentVsEmptyInbound(ROWS), [], '「缺席与空如何不同形」必须列出两种以上态');
    assert.deepEqual(judgeFloorsInbound(ROWS), [], 'upstream_floor 只能是 >= 1 的整数');
});

test('v3258 A2. ★ 表头逐字写明九列含义与四态（否则表不可复现）', () => {
    for (const c of COLS_IN) {
        assert.ok(TABLE_SRC.includes(c), '表头必须逐字写明列名：' + c);
    }
    assert.ok(TABLE_SRC.includes('缺席') && TABLE_SRC.includes('旧版')
        && TABLE_SRC.includes('不产出') && TABLE_SRC.includes('空数据'), '表头须写明四态');
    assert.ok(TABLE_SRC.includes('R12'), '表头须指明真跨仓核实挂在下游自己的哪一条判据（否则「声明」无从对照）');
});

/* ══════════ B 真源码面 ══════════ */
test('v3258 B1. ★★★ 消费面真在场：名点的文件在磁盘、且逐出口名真出现（退位项死法）', () => {
    assert.deepEqual(judgeConsumersInbound(ROWS, ROOT), [], '消费面与出口名都必须真在场');
});

test('v3258 B2. ★★ 已登记面必须能被「按模块名反查」——这是「缺行」那半边的唯一入口', () => {
    for (const r of ROWS) {
        const mod = downstreamModule(r.downstream_symbol);
        assert.ok(mod, r.face + ' 的 downstream_symbol 必须含 :: 分隔');
        assert.equal(symbolHasInboundFace(ROWS, mod), true, '反查必须命中：' + mod);
    }
    assert.equal(symbolHasInboundFace(ROWS, 'settings-ui.js'), false, '未登记模块不得反查到');
    assert.equal(symbolHasInboundFace(ROWS, '__ghost__.js'), false, '幽灵模块不得反查到');
});

test('v3258 B3. ★★ 消费面必须在本仓分发面上（不在分发面 = 用户侧永远不加载它）', () => {
    assert.deepEqual(judgeDistributionInbound(ROWS, MANIFEST), [], '消费面必须在 manifest.js / extra_js 上');
});

/* ══════════ C 负控制：真表破坏 ⇒ 同款真判据必须转红 ══════════ */
// 先证明「未破坏时判据全真」—— 否则后面的“转红”可能是判据自己坏了（假红）。
test('v3258 N0. 阳性对照：未破坏时全量判据为零问题（否则 N 组是假红）', () => {
    assert.deepEqual(allProblems(ROWS), [], '原件上必须零问题');
});

/** 换行字符（拼接而不写反斜杠字面量：避免落盘层逐层加码） */
const NL = String.fromCharCode(10);

/** 整行文本（用于“整行复制”那一例：原文件里恰出现 1 次）。 */
const rowTextOf = (r) => COLS_IN.map((c) => r[c]).join('	');

test('v3258 N1. ★★ 负控制·I1 面标识重复 ⇒ judgeInboundTable 转红', () => {
    const line = rowTextOf(ROWS[0]);
    const broken = breakSource(TABLE_SRC, line, line + NL + line, 'I1-dup');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeInboundTable(rows).length > 0, 'face 重复必须让 I1 转红');
    assert.deepEqual(judgeInboundTable(ROWS), [], '对照：原件上仍为零问题');
});

test('v3258 N2. ★★★ 负控制·版本形态非法（“旧版”那半边的判据） ⇒ judgeInboundTable 转红', () => {
    const broken = breakSource(TABLE_SRC, 'v2.2.0', 'vNext', 'I1-ver-shape');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeInboundTable(rows).some((p) => p.includes('producer_version 形态非法')),
        '版本形态被写坏必须转红（上游据此判「旧版」）');
    assert.deepEqual(judgeInboundTable(ROWS), [], '对照：原件上仍为零问题');
});

test('v3258 N2b. ★★★ 负控制·**方向硬断**：owner 写成本仓 ⇒ judgeInboundTable 转红', () => {
    /* 这是本表最重要的一条方向判据：把「消费面当成产出面再登一遍」是本表最容易被写成的形态，
     *   而它与正向表长得一模一样。 */
    const broken = breakSource(TABLE_SRC, 'ruby' + '-phone' + String.fromCharCode(9) + 'v2.2.0', 'lonsha-memory-plugin' + String.fromCharCode(9) + 'v2.2.0', 'I1-direction');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeInboundTable(rows).some((p) => p.includes('owner 是本仓')),
        'owner 写成本仓必须转红（否则方向可以静默倒过来）');
    assert.deepEqual(judgeInboundTable(ROWS), [], '对照：原件上仍为零问题');
});

test('v3258 N3. ★★★ 负控制·消费面不在磁盘 ⇒ judgeConsumersInbound 转红', () => {
    const broken = breakSource(TABLE_SRC, 'index.js:backfill', 'nope-such-file.js:backfill', 'I2-missing');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeConsumersInbound(rows, ROOT).some((p) => p.includes('消费面不在磁盘')),
        '消费面不在磁盘必须转红');
    assert.deepEqual(judgeConsumersInbound(ROWS, ROOT), [], '对照：原件上仍为零问题');
});

test('v3258 N3b. ★★★ 负控制·消费点退役（出口名不再出现） ⇒ judgeConsumersInbound 转红', () => {
    const broken = breakSource(TABLE_SRC, 'backfill,onFloorCommitted', 'backfillRetired,onFloorCommitted', 'I2-retired');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeConsumersInbound(rows, ROOT).some((p) => p.includes('找不到：')),
        '消费点退役而登记未删必须转红（表最容易的死法）');
    assert.deepEqual(judgeConsumersInbound(ROWS, ROOT), [], '对照：原件上仍为零问题');
});

test('v3258 N4. ★★ 负控制·消费点下限回到 0 ⇒ judgeFloorsInbound 转红', () => {
    const broken = breakSource(TABLE_SRC, '	4	', '	0	', 'I4-zero');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeFloorsInbound(rows).some((p) => p.includes('为 0')),
        '「这一面没人在调」不是外供面，应删行，必须转红');
    assert.deepEqual(judgeFloorsInbound(ROWS), [], '对照：原件上仍为零问题');
});

test('v3258 N5. ★★★ 负控制·四态被压成一态 ⇒ judgeInvalidStatesInbound 转红（本仓最贵的老账）', () => {
    const broken = breakSource(TABLE_SRC, ROWS[0].invalid_conditions, '各态已分别呈现', 'I5-collapse');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeInvalidStatesInbound(rows).some((p) => p.includes('未分别呈现四态')),
        '四态压成一态必须转红');
    assert.deepEqual(judgeInvalidStatesInbound(ROWS), [], '对照：原件上仍为零问题');
});

test('v3258 N6. ★★ 负控制·「缺席与空」被写成一句空话 ⇒ judgeAbsentVsEmptyInbound 转红', () => {
    const broken = breakSource(TABLE_SRC, ROWS[0].absent_vs_empty, '已分态', 'I6-vague');
    const rows = parseRowsIn(broken).rows;
    assert.ok(judgeAbsentVsEmptyInbound(rows).some((p) => p.includes('未列出两种以上态')),
        '“已分态”既不是判据也不是读数，必须转红');
    assert.deepEqual(judgeAbsentVsEmptyInbound(ROWS), [], '对照：原件上仍为零问题');
});

test('v3258 N7. ★★ 负控制·移出分发面 ⇒ judgeDistributionInbound 转红', () => {
    const mf = JSON.parse(JSON.stringify(MANIFEST));
    mf.js = 'some-other-entry.js';
    assert.ok(judgeDistributionInbound(ROWS, mf).some((p) => p.includes('不在本仓分发面')),
        '消费面移出 extra_js/js 必须转红（宿主不会加载它）');
    assert.deepEqual(judgeDistributionInbound(ROWS, MANIFEST), [], '对照：原件上仍为零问题');
});

/* ══════════ D 工具两向自证 ══════════ */
test('v3258 D1. ★★ 锚点不存在 ⇒ 拒绝破坏（防“破坏打偏”后判据仍在原件上跑）', () => {
    assert.throws(() => breakSource(TABLE_SRC, '__no_such_anchor_xyz__', 'x', 'D1'), /拒绝破坏/);
});

test('v3258 D2. ★★ 锚点命中多次 ⇒ 拒绝破坏（不是定点，负控制测的已不是那个点）', () => {
    assert.throws(() => breakSource(TABLE_SRC, '	', 'x', 'D2'), /拒绝破坏/);
});

test('v3258 D3. ★★ 同值替换 ⇒ 拒绝破坏（否则“破坏副本”等于原件）', () => {
    assert.throws(() => breakSource(TABLE_SRC, 'v2.2.0', 'v2.2.0', 'D3'), /拒绝破坏/);
});

test('v3258 D4. ★★ 空锚点 ⇒ 拒绝破坏（任何源码都会命中）', () => {
    assert.throws(() => breakSource(TABLE_SRC, '', 'x', 'D4'), /拒绝破坏/);
});

/* ══════════ E 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3258 E1. ★ 版本锚（当版 frontier）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read(path.join(ROOT, 'index.js'))) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.258.0'), '本套件只在 3.258.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
    assert.equal(MANIFEST.version, codeVer);
});

/* ══════════ F 判据面自防护 ══════════ */
test('v3258 F1. ★★ 登记**数据行**不得自指本套件（自指会让双向判据恒真）', () => {
    for (const r of ROWS) {
        const flat = COLS_IN.map((c) => r[c]).join('|');
        assert.equal(flat.includes('v3' + '258'), false, r.face + ' 的数据行不得自指本套件');
        assert.equal(flat.includes('scan_' + 'inbound' + '_faces'), false, r.face + ' 的数据行不得自指守卫名');
    }
});

test('v3258 F2. ★★ 判据面自防护：本套件只调用判据，不重写判据（同一口径只许一处）', () => {
    const own = read(fileURLToPath(import.meta.url));
    /* 锚点字面量必须**拼接**，不得让断言字符串自己命中自己 ——
     *   那是 v3216 假红的根因（注释/字符串字面引用锚点）。 */
    const LIT = 'function ' + 'judge';
    assert.equal(own.includes(LIT + 'InboundTable'), false, '判据实现必须住在守卫里');
    assert.equal(own.includes(LIT + 'ConsumersInbound'), false, '判据实现必须住在守卫里');
    assert.ok(own.includes('judgeInboundTable('), '本套件必须真调用判据');
    assert.ok(own.includes('judgeConsumersInbound('), '本套件必须真调用判据');
});

test('v3258 F3. ★★ 门禁入口与套件用同一份判据（runAll 必须调同一批 judge）', () => {
    const gate = read(path.join(ROOT, 'tests', 'audit', 'scan_inbound_faces.mjs'));
    for (const fn of ['judgeInboundTable', 'judgeConsumersInbound', 'judgeDistributionInbound',
        'judgeFloorsInbound', 'judgeInvalidStatesInbound', 'judgeAbsentVsEmptyInbound']) {
        assert.ok(gate.includes('export function ' + fn), '守卫必须导出 ' + fn);
        assert.ok(gate.includes(fn + '('), 'runAll 必须调用 ' + fn);
    }
    assert.ok(gate.includes('isMain'), '守卫必须只在直接执行时跑主入口（否则 import 会 exit）');
    assert.ok(gate.includes('LONSHA_AUDIT_ROOT'), '守卫必须可指定审计根（负控制要在独立树上跑）');
});

/* ══════════ G 两表实时对账 ══════════ */
test('v3258 G1. ★★★ 正向表表头不得再声称「下游→上游 0 面」（那句现已不真）', () => {
    /* 这条判据直接针对本版要治的漂移：正向表表头曾写着
     *   「本表只登记上游→下游方向的外供面（下游→上游方向当前 0 面，故无行）」。
     *   它与本表同时存在就是自相矛盾，而且正向表自己的六条判据看不见它。 */
    const fwd = read(FORWARD);
    assert.equal(fwd.includes('下游→上游方向当前 0 面'), false,
        '正向表表头仍在声称「下游→上游 0 面」：两行已互相矛盾，须定正为指向反向表');
    assert.ok(fwd.includes('open_face_registry_inbound.tsv'),
        '正向表表头必须指向反向表（否则读者从正向表出发会得到错读数）');
    assert.ok(fwd.includes('open_face_registry_inbound.tsv') && TABLE_SRC.includes('open_face_registry.tsv'),
        '两表必须互相指向（双向可发现）');
});
