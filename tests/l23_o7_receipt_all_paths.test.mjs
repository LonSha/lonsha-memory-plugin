// tests/l23_o7_receipt_all_paths.test.mjs — L23-O7：注入回执覆盖全部路径，每面不同形 [v3.474.0]
//
// 计划原文：「注入回执覆盖全部路径（含失败/跳过/降级），每面不同形」。
//
// 本刀修的两处真缺陷（都是「不同形」被压成同一形）：
//   ① **失败面被吞**：`deriveReceipt` 抛错时 pipeline 只 errLog 一句就完，
//      `_lastBudgetStats.receipt` **保持上一次的旧值** ⇒ 下游把「这次没算出来」
//      读成「上次算出来的那份」。现在四态 `receiptStatus`：not-run / ok / module-absent / derive-failed，
//      且非 ok 一律把 receipt 置空（宁可说「没有」，不许递旧账）。
//   ② **跳过面不可见**：材料因会话/修订过期被整包丢掉（`_projectionDropped`），
//      修前只落在 `this._projectionDropped` 与 snap.meta 里，读注入回执的人看不到。
//      现在 `_lastBudgetStats.skipped` 具名 `{source, reason, from, to}`，reason=null 与字符串两态不同形。
//
// 块级五态（kept / partial / dropped / empty / unknown）由 `injection-receipt.js::classifyBlocks`
// **真调**验证：五态互斥、`unknown` 不倒推成 `kept`、五态计数之和 === 候选块数（账要平）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';

const require_ = createRequire(import.meta.url);
const RCV = require_('../injection-receipt.js');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIPE = path.join(ROOT, 'engine-injection-pipeline.js');

const BLOCKS = ['【常驻】A段', '【常驻】B段', '【触发】C段', '', '【触发】D段'];

/** 五态之一：真裁剪 + 块级清单（trace），C 留下、D 丢掉、B 切半、空块单列。 */
function traceFixture() {
    /* blockSpans 用「块在裁剪前全文里的 [起,止) 区间」表达，切点 sliceAt 落在 B 内部 */
    const spans = [];
    let at = 0;
    for (const b of BLOCKS) { spans.push([at, at + b.length]); at += b.length; }
    const sliceAt = spans[1][0] + 2;   // 切在 B 的第 2 个字符后 ⇒ B 是 partial
    return {
        traceFrom: 'router',
        blockCount: BLOCKS.length,
        trimmed: true,
        hardTruncated: true,
        sliceAt,
        blockSpans: spans,
        /* 刻意**不给** keptIdxInAll：给了就走 'trace' 档，块级区间那一档（trace-span）
         *   在本档里就永远测不到 —— 这正是「判据只测到自己搭的那条路」的经典漏测。 */
    };
}

const stateCount = (r) => r.blocks.reduce((acc, b) => { acc[b.state] = (acc[b.state] || 0) + 1; return acc; }, {});

test('A1 块级五态互斥且穷尽：真裁剪（trace-span）能同时造出 kept/partial/dropped/empty', () => {
    const r = RCV.classifyBlocks({ trace: traceFixture(), blocks: BLOCKS, preTrimChars: 100, payloadChars: 50 });
    const c = stateCount(r);
    assert.equal(r.from, 'trace-span', '硬截断 + 块区间 ⇒ 来源必须是 trace-span');
    assert.ok(c.kept >= 1, '必须有 kept，实：' + JSON.stringify(c));
    assert.equal(c.partial, 1, 'B 段被切半必须单列成 partial，实：' + JSON.stringify(c));
    assert.ok(c.dropped >= 1, 'D 段必须记 dropped，实：' + JSON.stringify(c));
    assert.equal(c.empty, 1, '空块必须单列成 empty（不许混进 dropped），实：' + JSON.stringify(c));
    /* 五态的词面必须两两不同 —— 「同一形」正是本刀要断的东西 */
    const vocab = new Set(['kept', 'partial', 'dropped', 'empty', 'unknown']);
    for (const b of r.blocks) assert.ok(vocab.has(b.state), '块状态越界：' + b.state);
    assert.equal(r.blocks.length, BLOCKS.length, '逐块读数不许少算（少算等于静默丢条目）');
});

test('A2 未裁剪路径：from=no-trim，只有 kept/empty，不许出现 dropped（没裁就不可能被裁掉）', () => {
    const r = RCV.classifyBlocks({ trace: null, blocks: BLOCKS, preTrimChars: 80, payloadChars: 80 });
    assert.equal(r.from, 'no-trim');
    const c = stateCount(r);
    assert.deepEqual(Object.keys(c).sort(), ['empty', 'kept'], '未裁剪只该有 kept/empty，实：' + JSON.stringify(c));
    assert.equal(c.empty, 1);
});

test('A3 回执不可用（内联回落）：from=unknown 且 why 非空，且**不许倒推**成 kept', () => {
    const r = RCV.classifyBlocks({
        trace: { traceFrom: 'inline', blockCount: BLOCKS.length },
        blocks: BLOCKS, preTrimChars: 100, payloadChars: 50,
    });
    assert.equal(r.from, 'unknown', '内联回落 ⇒ 块级来源必须 unknown');
    assert.ok(String(r.why).length > 10, '不可测必须说清为什么，实：' + r.why);
    const c = stateCount(r);
    assert.equal(c.kept || 0, 0, '不可测时把块判成 kept 就是谎报（倒推）');
    assert.ok((c.unknown || 0) >= 1, '必须记 unknown');
});

test('B1 账要平：五态计数之和 === 候选块数（每一档路径都成立）', () => {
    const cases = [
        ['trace-span', { trace: traceFixture(), blocks: BLOCKS, preTrimChars: 100, payloadChars: 50 }],
        ['no-trim', { trace: null, blocks: BLOCKS, preTrimChars: 80, payloadChars: 80 }],
        ['unknown', { trace: { traceFrom: 'inline', blockCount: BLOCKS.length }, blocks: BLOCKS, preTrimChars: 100, payloadChars: 50 }],
        ['trace', { trace: { traceFrom: 'router', blockCount: BLOCKS.length, trimmed: true, keptIdxInAll: [0, 1] }, blocks: BLOCKS, preTrimChars: 100, payloadChars: 50 }],
    ];
    for (const [label, opts] of cases) {
        const r = RCV.classifyBlocks(opts);
        const sum = r.blocks.reduce((a, b) => a + 1, 0);
        assert.equal(sum, BLOCKS.length, label + '：块数不平（' + sum + ' ≠ ' + BLOCKS.length + '）');
        const c = stateCount(r);
        const counted = Object.values(c).reduce((a, b) => a + b, 0);
        assert.equal(counted, BLOCKS.length, label + '：五态计数之和 ' + counted + ' ≠ 候选 ' + BLOCKS.length);
    }
});

test('B2 真码三态接线：ok / module-absent / derive-failed 各自恰写 1 次，且三值互不相同', () => {
    const src = fs.readFileSync(PIPE, 'utf8');
    const STATES = {
        'not-run': "state: 'not-run'",
        'ok': "state: 'ok'",
        'module-absent': "state: 'module-absent'",
        'derive-failed': "state: 'derive-failed'",
    };
    for (const [label, a] of Object.entries(STATES)) {
        assert.equal(src.split(a).length - 1, 1, '回执状态 ' + label + ' 必须恰写 1 次（多写=两处真源，零写=面缺失）');
    }
    /* 失败面不许静默：catch 里必须同时「置空 receipt」与「留成因」 */
    const catchBlock = src.slice(src.indexOf("} catch (e) {\n                    /* 第三态"), src.indexOf("errLog(e, 'buildInjection.回执派生');"));
    assert.ok(catchBlock.includes('this._lastReceipt = null;'), '派生失败必须把 receipt 置空（不许递旧账）');
    assert.ok(/why: String\(\(e && e\.message\) \|\| e\)/.test(catchBlock), '派生失败必须留异常消息');
});

test('B3 跳过面接线：`_lastBudgetStats.skipped` 具名 source/reason/from/to，且 reason 两态（null 与字符串）', () => {
    const src = fs.readFileSync(PIPE, 'utf8');
    assert.ok(src.includes('skipped: this._projectionDropped'), '跳过面必须由真读数（_projectionDropped）驱动');
    for (const k of ['source:', 'reason:', 'from:', 'to:']) {
        assert.ok(src.includes(k) && src.includes('skipped'), '跳过面缺字段 ' + k);
    }
    assert.ok(/reason: String\(this\._projectionDropped\.reason \|\| 'unknown'\)/.test(src), '有丢弃时必须带成因');
    assert.ok(/reason: null/.test(src), '没丢弃时必须是 null（与「丢了但不知为何」不同形）');
    /* 三态不同形：没丢 / 丢了有原因 —— 不许都写成空字符串 */
    assert.ok(!/skipped: \{\s*source: 'projection', reason: ''/.test(src), '空字符串会把「没丢」和「丢了没说」压成同一形');
});

test('D1 负控制：把派生失败改回「静默只 errLog」⇒ B2 必须红', () => {
    const src = fs.readFileSync(PIPE, 'utf8');
    const broken = breakOnce(src,
        "                    this._lastBudgetStats.receiptStatus = { state: 'derive-failed', lib: 'injection-receipt.js', why: String((e && e.message) || e) };",
        '',
        'O7 静默派生失败');
    assert.equal(broken.split("state: 'derive-failed'").length - 1, 0, '破坏必须真的删掉失败面');
    assert.equal(src.split("state: 'derive-failed'").length - 1, 1, '原文件必须仍恰有 1 处（对照）');
});

test('D2 负控制：把 module-absent 改成与 ok 同值 ⇒ 「三值互不相同」必须红', () => {
    const src = fs.readFileSync(PIPE, 'utf8');
    const broken = breakOnce(src, "state: 'module-absent'", "state: 'ok'", 'O7 两态同形');
    const vals = new Set((broken.match(/state: '[a-z-]+'/g) || []));
    assert.ok(vals.size < 4, '破坏后不同状态值必须少于 4 个，实：' + [...vals].join(','));
    const okCount = broken.split("state: 'ok'").length - 1;
    assert.equal(okCount, 2, '破坏后 ok 应出现两次（与 absent 同形），实 ' + okCount);
});

test('D3 负控制：把 skipped 的 reason 两态压成空串 ⇒ B3 必须红', () => {
    const src = fs.readFileSync(PIPE, 'utf8');
    const broken = breakOnce(src, "reason: null, from: null, to: null }", "reason: '', from: null, to: null }", 'O7 跳过面同形');
    const bad = /skipped: \{\s*source: 'projection', reason: ''/.test(broken)
        || broken.includes("reason: ''");
    assert.ok(bad, '破坏必须真的把 null 换成空串');
});

test('E1 单一真源 + 出生锚：回执状态词表住在 pipeline（不另立第二份），本档锚 v3.474.0', () => {
    const src = fs.readFileSync(PIPE, 'utf8');
    /* 词表只此一处：别处若再写 'derive-failed' 就是第二份真源 */
    assert.equal(src.split("'derive-failed'").length - 1, 1, "'derive-failed' 只许出现 1 次");
    assert.equal(src.split("'module-absent'").length - 1, 1, "'module-absent' 只许出现 1 次");
    /* 本档出生版本用数值数组比较，避免与当版版本号锚点撞车 */
    const BIRTH = [3, 474, 0];
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const cur = String(pkg.version).split('.').map((x) => Number(x));
    const cmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
    assert.ok(cmp(cur, BIRTH) >= 0, '本档不早于其出生版本，实：' + pkg.version);
});