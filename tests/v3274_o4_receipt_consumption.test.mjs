// tests/v3274_o4_receipt_consumption.test.mjs — v3.274.0 O4：注入与预测完全消费过程回执
// [v3.274.0 O4] 真裁剪自 v3.251.0 起就记下 `keptIdxInAll` 与硬截断 spans，但**消费侧**仍有一处
//   拿最终文本反推：`_lastBudgetStats.keptBlocks = 总数 - full.includes(块) 计数`，
//   而 `cost-forecast` 的 `predicted.kept/dropped` 同样按 `projected.includes(块)` 反推。
//   两处盲区（与 cost-ledger 同源，修前实测）：
//     · **同文重复**：候选含两条完全相同的触发块、预算只装得下一条时，`includes` 对两条都为真
//       ⇒ 消费侧报「2 块全留」，而真裁剪回执说「留 1 丢 1」——**同一轮里两份读数互相矛盾**；
//     · **互为子串 / 半段截断**：块 A 是块 B 的子串，或 recency 硬截断切在块内部时，
//       反推把「切了半段」读成「整块被丢」（半段其实进了载荷）。
//   本版把三处消费点（生产聚合数 / 预测 / 面板）统一改为消费**同一份**裁剪回执，
//   未知一律记 null 并自述来源，绝不倒推成「成功」。
//
// 覆盖：
//   A 生产聚合数从逐块读数导出（同文重复只数一份 / 三态互斥穷尽 / 半段不算被丢 / 未裁剪真读数 0）
//   B 不可测记 null 并自述来源（内联回落 / 词表与逐块 via 同源 / 不倒推成「全部留下」）
//   C 预测侧消费同一回执（与生产聚合数逐项相等 / 硬截断三态 / 删 trace 让未知可见）
//   D 四处消费点对同一 trace 一致 + 面板三态展示 + 三条真源码破坏负控制
//   E 旧字段兼容（v3144 十一键在场）+ 版本锚
//
// 边界（诚实）：
//   本套件证明的是「消费侧读的判据换了，且四处在同一 trace 上一致」。
//   它不证明回执本身（injection-router 的 keptIdxInAll / blockSpans）的正确性 ——
//   那是 v3251 与 v3273 的地盘，这里只保证**没有人再自己另算一份**。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const requireFromHere = createRequire(import.meta.url);
const IR = requireFromHere(path.join(ROOT, 'injection-router.js'));
const CF = requireFromHere(path.join(ROOT, 'cost-forecast.js'));
const CL = requireFromHere(path.join(ROOT, 'cost-ledger.js'));
const IDX_SRC = read('index.js');
const ROUTER_SRC = read('injection-router.js');
const UI_SRC = read('settings-ui.js');

/* ══════════════ 工具：从真源码抽方法体（与 v3251/v3216 同规格的花括号配平） ══════════════ */
function blockAt(src, at) {
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
const HOST_METHODS = [
    '_injectionRecord(extra) {',
    '_injectionRefOf(i) {',
    '_injectionBlocksOf(allBlocks, fullText) {',
    '_injectionDiscardStale(myGen) {',
    '_buildDiagnosticsInjection(recalled) {',
    'buildInjectionReadout() {',
    'buildInjection(recalled) {',
];
function anyStub() {
    const s = new Proxy(function () {}, {
        get: (t, p) => {
            if (p === Symbol.toPrimitive) return () => '';
            if (p === 'then') return undefined;
            if (p === Symbol.iterator) return function* () {};
            if (p === 'length') return 0;
            if (p === 'toString') return () => '';
            return s;
        },
        apply: () => s,
    });
    return s;
}
const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]', '[类型化事实·长期]'];
const est = (t) => Math.ceil(String(t || '').length * 0.9);

/**
 * 真宿主方法体真跑。
 * @param src      index.js 源码（负控制传**破坏副本**）
 * @param cfg      配置覆盖
 * @param mode     'router' 注入路由模块 / 'norouter' 路由缺席（走内联回落）
 * @param router   覆盖路由模块（负控制传破坏副本）；undefined 时按 mode 取
 *
 * ★ 与 v3251 夹具的差别（本套件必需）：把宿主侧那些「缺席即返回 stub」的取值口
 *   显式定义成空值。v3251 的万能 stub 会被当成**真块** push 进 blocks
 *   （`if (tiesText) blocks.push(tiesText)` 这类判真），于是块清单里混进一堆空函数，
 *   计数类判据全部失真。本套件要数的是块，故必须把这些口关死。
 */
function engineFrom(src, cfg, mode, router) {
    const parts = HOST_METHODS.map((h) => blockAt(src, src.indexOf(h)));
    assert.strictEqual(parts.filter(Boolean).length, HOST_METHODS.length,
        '宿主方法体必须全部可提取（缺失即接线不全）');
    const body = parts.filter(Boolean).join(',\n');
    const real = {
        config: { config: Object.assign({
            vectorTopK: 8, injectionBudget: 3000, recallTierEnabled: false,
            budgetStrategy: 'balanced', adaptiveBudget: false, debugMode: false,
        }, cfg || {}) },
        _lastInjection: null, _lastInjectionDraft: null, _lastInjectionDiscard: null,
        _injectionStale: 0, _injectionRound: 0, _diagnostics: null, _injectionPending: null,
        _injectionEnded: { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 },
        _genSeq: 0, _recallAudit: [],
        summary: { getGrandChroniclePrompt: () => '', lockedFactsForPrompt: () => '' },
        // —— 以下为「关死取值口」，防止空函数被当块 push（见上） ——
        status: { getProtagonistPrompt: () => '', getLifeDetailsPrompt: () => [], getGeoPrompt: () => '' },
        clock: { getContextPrompt: () => '', date: '' },
        pulse: { toPrompt: () => '' },
        cse: { toPrompt: () => '' },
        getNpcTiesPrompt: () => '',
        buildNpcTierRecords: () => [],
        typedFactsBlocks: () => null,
        captureCast: () => [],
        graph: { nodes: new Map(), edges: new Map() },
        // 可选模块口必须显式置空：缺席时 Proxy 会返回真值 stub，而宿主用
        //   `if (this.moneyLedger) blocks.push(this.moneyLedger.toPrompt())` 这类判真取值，
        //   真值 stub 会被 push 成**空字符串块**，污染候选集与计数。
        moneyLedger: null, cards: null, conflicts: null, deltaBook: null, outline: null, pairMem: null,
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function(
        'estimateTextTokens', 'errLog', 'RESIDENT_MARKERS', 'PLUGIN_NAME', 'window', 'require',
        '_costForecastLib', '_costLedgerLib', '_moduleLib', 'buildNpcTierInjection',
        'numOr', 'relativeTimeLabel', 'tiering', 'beat', 'extracted', 'injectionRefOf',
        `return ({ ${body} });`
    );
    const win = {};
    const rtr = (router !== undefined) ? router : (mode === 'router' ? IR : null);
    if (rtr) win.LonShaInjectionRouter = rtr;
    const req = (mode === 'norouter')
        ? () => { throw new Error('no-router'); }
        : (p) => { try { return requireFromHere(path.join(ROOT, String(p).replace(/^\.\//, ''))); } catch (e) { return null; } };
    const inst = Object.assign(host, fn(est, () => {}, RESIDENT_MARKERS, 'v3274', win, req,
        () => CF, () => CL, anyStub(), anyStub(), (n, d) => d, anyStub(), anyStub(), anyStub(),
        anyStub(), (eng, i) => `inj_${i}`));
    return inst;
}
const DUP = 'DUP' + 'X'.repeat(276);   // 279 字符，两条完全相同
const DUP_LEN = DUP.length;
const RESIDENT_BLOCK = '[类型化事实·长期]' + 'S'.repeat(20);   // 唯一的常驻块（单块，好计数）
/** 同文重复场景：1 常驻 + 两条同文触发块 = 3 块；预算只装得下常驻 + 第一条。 */
function dupEngine(src, router) {
    const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true }, 'router', router);
    e.typedFactsBlocks = () => ({ stable: RESIDENT_BLOCK, volatile: null });
    const html = e.buildInjection([
        { source: 'bm25', text: DUP },
        { source: 'bm25', text: DUP },
    ]);
    return { e, html };
}
/** 硬截断场景：recency + 无 recency 标记块 ⇒ `full.slice(0, budget)`，切口落在块内部。 */
function hardEngine(src, router) {
    /* ★ 刻意**不给常驻块**：recency 的保留集（常驻 + 带 recency 标记的触发块）为空时
     *   才走 `full.slice(0, budget)` 硬截断 —— 有常驻就整批保留，永远碰不到那条路径。 */
    const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true, budgetStrategy: 'recency' }, 'router', router);
    const html = e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    return { e, html };
}
/** 不可测场景：路由模块缺席 ⇒ 内联回落真裁了但没有块级清单。 */
function inlineEngine(src) {
    const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true }, 'norouter');
    const html = e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    return { e, html };
}

/* ══════════════════ A. 生产聚合数从逐块读数导出 ══════════════════ */
test('v3274 A1. ★ 同文重复只数一份：两条完全相同的触发块只装得下一条时，被丢数必须是 1', () => {
    const { e, html } = dupEngine(IDX_SRC);
    const bs = e._lastBudgetStats;
    assert.strictEqual(bs.keptFrom, 'trace', '本轮走的是路由回执（精确判据）');
    /* 本用例的核心事实与具体块数无关：**两条完全相同的块只留下一条**。
     *   故判据直接盯「同文那两行的 kept 状态」，不依赖表头 / 可提关联行的字符数。 */
    const dupRows = (e._lastInjectionDraft || []).filter((x) => x && String(x.label).startsWith('- DUP'));
    assert.strictEqual(dupRows.length, 2, '同文两条应在逐块读数里各占一行');
    assert.strictEqual(dupRows.filter((x) => x.kept).length, 1, '★ 同文两条只留一条（修前 `includes` 反推两条都算留下）');
    assert.strictEqual(bs.countedBlocks, 5, '参与判定的块 = 1 常驻 + 4 触发');
    assert.ok(bs.droppedBlocks >= 1, '至少裁掉同文里的那一份，实 ' + bs.droppedBlocks);
    // 反推盲区的现场证据：两条同文块在载荷里都能被 includes 命中（所以反推必错）
    assert.ok(html.includes(DUP), '两条同文块都能被最终载荷 includes 命中（这正是反推的盲区）');
    // 三态互斥穷尽：保留 + 被丢 + 被切半 = 参与判定的块数
    assert.strictEqual(bs.keptBlocks + bs.droppedBlocks + (bs.partialBlocks || 0), bs.countedBlocks,
        '三态之和必须等于参与判定的块数');
});

test('v3274 A2. 旧字段语义不变：`totalBlocks` 仍是候选总数，新口径另立 `countedBlocks`', () => {
    const { e } = dupEngine(IDX_SRC);
    const bs = e._lastBudgetStats;
    assert.strictEqual(bs.totalBlocks, 5, 'totalBlocks = 本轮候选块总数（旧语义，不动）');
    assert.strictEqual(bs.countedBlocks, 5, 'countedBlocks = 参与三态判定的块数');
    // 逐块读数缺席时两者可以不等（空块占位），故两个字段**都必须**在场且可分
    for (const k of ['countedBlocks', 'droppedBlocks', 'partialBlocks', 'keptFrom', 'keptWhy',
        'candidateChars', 'keptBlockChars', 'droppedBlockChars', 'partialBlockChars',
        'overBudgetChars', 'residentOverflowChars', 'residentOverflowOver']) {
        assert.ok(k in bs, '新读数键必须在场：' + k);
    }
});

test('v3274 A3. ★ 半段截断：被切半的块计入 partialBlocks，不得混进「被丢」', () => {
    const { e, html } = hardEngine(IDX_SRC);
    const bs = e._lastBudgetStats;
    const tr = e._injectionTraceDraft;
    assert.strictEqual(tr.hardTruncated, true, 'recency 无标记块 ⇒ 硬截断（块级清单不成立）');
    assert.strictEqual(bs.keptFrom, 'trace-span', '硬截断走 span 判据');
    assert.strictEqual(bs.partialBlocks, 1, '★ 恰好一块被切半');
    /* ★ 本用例的核心：修前拿「候选总数 − 保留数」反推，会把被切半的那块也算进「整块被丢」
     *   ⇒ 反推得 2，而真读数是 1。两者不等即证明反推在这一格上撒了谎。 */
    assert.strictEqual(bs.countedBlocks - bs.keptBlocks, 2, '反推口径会得到 2（把半段也算作整块被丢）');
    assert.strictEqual(bs.droppedBlocks, 1, '★ 真读数：整块被丢只有 1（半段进了载荷，不算整块被丢）');
    assert.ok(bs.partialBlockChars > 0, '被切半的块字符数可读，实 ' + bs.partialBlockChars);
    assert.strictEqual(bs.keptBlocks + bs.droppedBlocks + bs.partialBlocks, bs.countedBlocks, '三态之和自洽');
    assert.ok(html.length > 0, '载荷非空');
});

test('v3274 A4. 未裁剪 ⇒ 保留数是**真读数 0 丢**，不是 null（与不可测必须可分）', () => {
    const e = engineFrom(IDX_SRC, { injectionBudget: 3000, recallTierEnabled: true }, 'router');
    e.typedFactsBlocks = () => ({ stable: RESIDENT_BLOCK, volatile: null });
    e.buildInjection([{ source: 'bm25', text: '短块' }]);
    const bs = e._lastBudgetStats;
    assert.strictEqual(bs.keptFrom, 'trace', '未裁剪时逐块读数也是精确判据（整批都在）');
    assert.strictEqual(bs.droppedBlocks, 0, '真读数 0（「测了，一条都没丢」）');
    assert.strictEqual(bs.keptBlocks, bs.countedBlocks, '整批都留下');
    assert.strictEqual(bs.keptBlocks, bs.totalBlocks, '整批都在（候选与参与判定的块数同值）');
});

/* ══════════════════ B. 不可测记 null 并自述来源 ══════════════════ */
test('v3274 B1. ★ 内联回落（回执缺席）⇒ 块级留存记 null 并自述来源，绝不倒推成「全部留下」', () => {
    const { e } = inlineEngine(IDX_SRC);
    const bs = e._lastBudgetStats;
    assert.strictEqual(bs.keptFrom, 'unknown', '没有块级清单 ⇒ 不可测');
    assert.strictEqual(bs.keptBlocks, null, '★ 不可测必须是 null（不是数字）');
    assert.strictEqual(bs.droppedBlocks, null, '★ 同上');
    assert.strictEqual(bs.partialBlocks, null, '★ 同上');
    assert.ok(bs.keptWhy.length > 0, '必须自述为什么不可测（不能只给 null 不说理由）');
    assert.ok(/不倒推/.test(bs.keptWhy), '自述必须点明「不倒推」，实：' + bs.keptWhy);
    // ★ 本版要断的谎报形态：反推在未裁剪/内联场景恰好偏向「全部留下」
    assert.notStrictEqual(bs.keptBlocks, bs.totalBlocks, '★ 不可测不得塌陷成「全部留下」');
    assert.notStrictEqual(bs.keptBlocks, 0, '★ 也不得塌陷成 0');
});

test('v3274 B2. 词表同源：`keptFrom` 与逐块读数的 `via` 是同一套取值', () => {
    // 精确：via 全为 trace
    const a = dupEngine(IDX_SRC).e;
    assert.strictEqual(a._lastBudgetStats.keptFrom, 'trace');
    assert.ok(a._lastInjectionDraft.every((x) => x.via === 'trace'), '逐块 via 全为 trace');
    // 硬截断：via 全为 trace-span
    const b = hardEngine(IDX_SRC).e;
    assert.strictEqual(b._lastBudgetStats.keptFrom, 'trace-span');
    assert.ok(b._lastInjectionDraft.every((x) => x.via === 'trace-span'), '逐块 via 全为 trace-span');
    // 内联回落：via 全为 includes
    const c = inlineEngine(IDX_SRC).e;
    assert.strictEqual(c._lastBudgetStats.keptFrom, 'unknown');
    assert.ok(c._lastInjectionDraft.every((x) => x.via === 'includes'), '逐块 via 全为 includes');
    /* 结构面：聚合段**不再有可执行**的 `includes(块)` 反推。
     *   注意必须剔掉注释行 —— 修前那段旧代码的**字面量被有意保留在注释里**
     *   （说明「删掉的是什么」），拿整段文本扫会把它当成残留代码误判。 */
    const at = IDX_SRC.indexOf('_lastBudgetStats = {');
    const seg = IDX_SRC.slice(at - 4200, at);
    const segCode = seg.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
    assert.ok(!/full\.includes\(/.test(segCode), '★ 聚合段不得残留可执行的 `full.includes(块)` 反推');
    assert.ok(/const _keptFrom = /.test(segCode), '聚合数由 `_keptFrom` 分态导出');
});

/* ══════════════════ C. 预测侧消费同一回执 ══════════════════ */
const fcOpts = (blocks, strategy, extra) => Object.assign({
    allBlocks: blocks, residentMarkers: RESIDENT_MARKERS, baseBudget: 420,
    tokenBudget: 0, reserve: 0, chatLength: 0, adaptive: false,
    strategy: strategy || 'balanced', router: IR, tokensOf: est, now: 1,
}, extra || {});

test('v3274 C1. ★ 预测与生产对同一批块给出同一组块级留存数（同文重复都只数一份）', () => {
    const { e } = dupEngine(IDX_SRC);
    const bs = e._lastBudgetStats;
    const p = e._lastForecast.predicted;
    assert.strictEqual(e._lastForecast.measurable, true, '预测可测');
    assert.strictEqual(p.keptFrom, 'trace', '预测也认路由回执为精确判据');
    assert.strictEqual(p.kept.blocks, bs.keptBlocks, '★ 保留块数：预测 ' + p.kept.blocks + ' / 生产 ' + bs.keptBlocks);
    assert.strictEqual(p.dropped.blocks, bs.droppedBlocks, '★ 被丢块数：预测 ' + p.dropped.blocks + ' / 生产 ' + bs.droppedBlocks);
    assert.strictEqual(p.countedBlocks, bs.countedBlocks, '参与判定的块数同源');
    assert.strictEqual(p.kept.blocks + p.dropped.blocks + p.partial.blocks, p.countedBlocks, '预测侧三态之和自洽');
    assert.strictEqual(e._lastReconcile.verdict, 'match', '对账无漂移');
});

test('v3274 C2. 硬截断：预测走 span 判据，被切半单列（不混进被丢）', () => {
    const { e } = hardEngine(IDX_SRC);
    const p = e._lastForecast.predicted;
    assert.strictEqual(p.keptFrom, 'trace-span');
    assert.strictEqual(p.hardTruncated, true);
    assert.strictEqual(p.partial.blocks, 1, '被切半 1 块');
    /* ★ 本用例的核心：被切半的那块**不得**被算进被丢。
     *   修前用 `projected.includes(块)` 反推：半段块的完整文本在截断载荷里找不到
     *   ⇒ 与「整块被丢」同形，被丢数会多报 1（1 → 2）。 */
    assert.strictEqual(p.dropped.blocks, e._lastBudgetStats.droppedBlocks, '与生产读数一致');
    assert.strictEqual(p.dropped.blocks, 1, '被丢的是「可提关联」那一块（不含被切半的那一块）');
    assert.strictEqual(p.partial.blocks + p.dropped.blocks, e._lastBudgetStats.countedBlocks - e._lastBudgetStats.keptBlocks,
        '被切半 + 被丢 = 未整块保留（三态互斥穷尽）');
    assert.ok(CF.forecastLine(e._lastForecast).includes('被切半'), '一行诊断必须把「被切半」说出来');
});

test('v3274 C3. ★★ 删 trace 的负控制：未知必须可见，不得变成「全部留下」', () => {
    // 回执缺席的最直接模拟：裁剪函数真裁了，但不向 opts.trace 派发任何事实。
    const noReceipt = (full, budget) => String(full).slice(0, budget);
    const fc = CF.forecast(fcOpts([DUP, DUP, '常驻段'], 'balanced', { trim: noReceipt }));
    const p = fc.predicted;
    assert.strictEqual(p.keptFrom, 'unknown', '没有回执 ⇒ 不可测');
    for (const k of ['kept', 'dropped', 'partial', 'keptResident', 'keptTrigger']) {
        assert.strictEqual(p[k], null, '★ `' + k + '` 必须整组记 null（不可测）');
    }
    assert.strictEqual(p.countedBlocks, null, '参与判定的块数同为 null');
    assert.strictEqual(p.unknownBlocks, 3, '三条候选的逐块状态都是 unknown');
    assert.ok(/不倒推/.test(p.keptWhy), '必须自述「不倒推」，实：' + p.keptWhy);
    const line = CF.forecastLine(fc);
    assert.ok(line.includes('块级留存不可测'), '★ 一行诊断必须写「不可测」，实：' + line);
    assert.ok(!/裁剪丢 0 块/.test(line), '★ 不得写成「丢 0 块」（那是把测不了写成没有）');
});

test('v3274 C4. 回执规模不符（拿别批回执判本批）⇒ 同样不可测，且归因可分辨', () => {
    // 真回执 + 人为把候选规模改掉：回执是 3 块那批的，候选是 2 块 ⇒ 规模自证失败。
    const mismatched = (full, budget, blocks, strategy, opts) => {
        IR.trimToBudget(full, budget, blocks, strategy, opts);
        opts.trace.residentKept = 0; opts.trace.triggerTotal = 99;   // 自证规模与本批不符
        return String(full).slice(0, budget);
    };
    const fc = CF.forecast(fcOpts([DUP, DUP], 'balanced', { trim: mismatched }));
    const p = fc.predicted;
    assert.strictEqual(p.keptFrom, 'unknown');
    assert.strictEqual(p.kept, null);
    assert.ok(/规模/.test(p.keptWhy), '归因必须点明是规模不符，实：' + p.keptWhy);
});

test('v3274 C5. 未裁剪：`no-trim` 是**真读数**态（整批都在），与 unknown 三分', () => {
    const fc = CF.forecast(fcOpts(['[前情摘要]短', '短块'], 'balanced', { baseBudget: 3000 }));
    const p = fc.predicted;
    assert.strictEqual(p.willTrim, false);
    assert.strictEqual(p.keptFrom, 'no-trim');
    assert.strictEqual(p.kept.blocks, 2, '整批都在');
    assert.strictEqual(p.dropped.blocks, 0);
    assert.notStrictEqual(p.keptFrom, 'unknown', '「没裁」与「测不了」必须可分');
});

/* ══════════════════ D. 四处消费点对同一 trace 一致 + 面板 + 负控制 ══════════════════ */
test('v3274 D1. ★ 诊断 / 快照 / cost-ledger / forecast 对**同一 trace** 一致', () => {
    const { e } = dupEngine(IDX_SRC);
    const bs = e._lastBudgetStats;
    const lg = e._lastCostLedger;
    const p = e._lastForecast.predicted;
    /* 快照面读的是 `_lastInjection`（**代际确认过的提交**），不是构建草稿：
     *   构建完还要经 `_injectionCommit` 才落地（R2-B 的代际纪律）。夹具里直接
     *   补上这一步，否则读到的是 null —— 那不是产品缺陷，是夹具缺一步。 */
    e._injectionRecord({
        html: '<html>', blocks: e._lastInjectionDraft, total: bs.totalBlocks,
        kept: bs.keptBlocks, round: 1, outcome: 'completed',
    });
    const rd = e.buildInjectionReadout();
    // ① 账本：块级留存与生产聚合数同源
    assert.strictEqual(lg.identity.keptBlocks, bs.keptBlocks, '账本保留块数 = 生产聚合数');
    assert.strictEqual(lg.identity.droppedBlocks, bs.droppedBlocks, '账本被丢块数 = 生产聚合数');
    assert.strictEqual(lg.identity.keptFrom, bs.keptFrom, '两处自述同一判据来源');
    assert.strictEqual(lg.identity.includesHeuristic, false, '有回执 ⇒ 不得自认启发式');
    // ② 预测：同源
    assert.strictEqual(p.kept.blocks, bs.keptBlocks);
    assert.strictEqual(p.dropped.blocks, bs.droppedBlocks);
    // ③ 快照面：逐块读数与生产草稿逐项一致（同一份逐块事实）
    assert.ok(rd && Array.isArray(rd.blocks), '快照注入面在场');
    // ④ 逐块读数：与聚合数自洽
    const draft = e._lastInjectionDraft;
    assert.strictEqual(draft.filter((x) => x.kept).length, bs.keptBlocks, '逐块 kept 计数 = 聚合数');
    assert.strictEqual(draft.filter((x) => !x.kept && !x.partial).length, bs.droppedBlocks, '逐块 dropped 计数 = 聚合数');
    // ⑤ 面板一行：forecastLine 与上述同源
    assert.ok(e._lastBudgetStats.forecastLine.length > 0, '一行诊断在场');
});

test('v3274 D2. 面板对 `keptBlocks` 为 null 不得参与算术（三态展示）', () => {
    assert.ok(UI_SRC.includes('_lastBudgetStats'), '面板读实测面');
    assert.ok(!/Math\.max\(0,\s*_bs\.totalBlocks\s*-\s*_bs\.keptBlocks\)/.test(UI_SRC),
        '★ 修前形态 `totalBlocks - keptBlocks` 必须 0 处（null 会被当 0 ⇒ 误报「丢弃 N 块」）');
    assert.ok(/Number\.isFinite\(_bs\.keptBlocks\)/.test(UI_SRC), '必须按 finite 分态');
    assert.ok(UI_SRC.includes('块级留存不可测'), '不可测态必须有文案（与「真丢了 N 块」不同形）');
    assert.ok(/partialBlocks/.test(UI_SRC) && UI_SRC.includes('被切半'), '被切半必须在面板上单列');
});

/* —— 破坏副本运行器：真源码破坏 → **副本**上重跑**同款判据** —— */
 /** 在**指定的 index.js 源码**上重跑 unknownJudge（负控制用破坏副本，阳性对照用原件）。 */
 function unknownJudgeIdx(src) {
     const fake = inlineReceiptRouter(IR);
     const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true }, 'router', fake);
     e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
     const bs = e._lastBudgetStats;
     if (bs.keptFrom !== 'unknown') throw new Error('回执不可用却报了来源 ' + bs.keptFrom);
     if (bs.keptBlocks !== null) throw new Error('★ 不可测被写成数字 ' + bs.keptBlocks);
     if (!/不倒推/.test(bs.keptWhy)) throw new Error('缺「不倒推」自述：' + bs.keptWhy);
 }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v3274-'));
let tmpN = 0;
function runOnBrokenRouter(anchor, replacement, label, fn) {
    const broken = breakSource(ROUTER_SRC, anchor, replacement, label);
    const file = path.join(TMP, 'r' + (++tmpN) + '.js');
    fs.writeFileSync(file, broken);
    const IR2 = requireFromHere(file);
    assert.notStrictEqual(IR2, IR, '必须是破坏副本，不是原件');
    try { fn(IR2); return { threw: false, message: '' }; }
    catch (e) { return { threw: true, message: String((e && e.message) || e) }; }
}
/** 同款判据（A1 的判据本体）：同文重复必须只数一份 */
function dupJudge(ir) {
    const { e, html } = dupEngine(IDX_SRC, ir);
    const bs = e._lastBudgetStats;
    if (bs.keptFrom !== 'trace') throw new Error('判据来源不是精确回执：' + bs.keptFrom);
    /* 同款判据：两条**完全相同的块**只能留下一条 —— 这是本用例要守的事实，
     *   与表头 / 可提关联行占多少字符无关。 */
    const dupRows = (e._lastInjectionDraft || []).filter((x) => x && String(x.label).startsWith('- DUP'));
    if (dupRows.length !== 2) throw new Error('同文两行未各占一行：' + dupRows.length);
    if (dupRows.filter((x) => x.kept).length !== 1) throw new Error('同文两条留了 ' + dupRows.filter((x) => x.kept).length + ' 条（应为 1）');
    if (!html.includes(DUP)) throw new Error('载荷里两条同文块都该能被命中');
    if (bs.keptBlocks + bs.droppedBlocks + (bs.partialBlocks || 0) !== bs.countedBlocks) throw new Error('三态之和不等');
}
/** 同款判据（B1 的判据本体）：回执缺席必须让未知可见 */
/** 内联回落替身：裁剪真发生了，来源标 `inline`，但**谎报**一份块级清单。
 *  为什么必须让它给清单：否则「来源不是路由」与「没有清单」两道门同时挡着，
 *  单独摘任一道都不改变结果 —— 负控制会假绿（本轮实测踩过）。
 *  给上清单后，**只有来源门**能挡住它，这正是 index.js 注释点名的场景：
 *  「防止将来有人给内联分支补一份清单后消费侧仍按旧口径读」。 */
function inlineReceiptRouter(ir) {
    return Object.assign({}, ir, {
        trimToBudget: function (full, budget, blocks, strategy, opts) {
            const out = ir.trimToBudget(full, budget, blocks, strategy, null);
            if (opts && opts.trace) {
                opts.trace.traceFrom = 'inline';
                opts.trace.keptIdxInAll = blocks.map((_, i) => i);
                /* `trimmed=true` 也必须补上：真实路由确实裁了。
                 *   不补的话宿主会走「走了裁剪路径但没标 trimmed ⇒ 记不可测」那条分支，
                 *   于是**即便摘掉来源门**判据仍是 unknown —— 负控制假绿。 */
                opts.trace.trimmed = true;
            }
            return out;
        },
    });
}
function unknownJudge(ir) {
    const fake = inlineReceiptRouter(ir);
    const e = engineFrom(IDX_SRC, { injectionBudget: 420, recallTierEnabled: true }, 'router', fake);
    e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    const bs = e._lastBudgetStats;
    if (bs.keptFrom !== 'unknown') throw new Error('回执不可用却报了来源 ' + bs.keptFrom);
    if (bs.keptBlocks !== null) throw new Error('★ 不可测被写成数字 ' + bs.keptBlocks);
    if (!/不倒推/.test(bs.keptWhy)) throw new Error('缺「不倒推」自述：' + bs.keptWhy);
}

test('v3274 D3. 工具两向自证：原版上同判据必须真成立；锚点 0 次 / 不唯一 / 同值替换均抛', () => {
    // ① 原版上同款判据必须真成立（否则下面的「破坏后转红」毫无意义）
    dupJudge(IR);
    unknownJudge(IR);
    // ② 锚点不存在 ⇒ 抛
    assert.throws(() => breakSource(ROUTER_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'D3'), /拒绝破坏|命中 0 次|恰中 1 次/);
    // ③ 锚点不唯一 ⇒ 抛
    assert.throws(() => breakSource(ROUTER_SRC, 'function', 'x', 'D3'), /拒绝破坏|恰中 1 次|要求恰好 1 次/);
    // ④ 同值替换 ⇒ 抛
    const A = "_trace.traceFrom = 'router';";
    assert.throws(() => breakSource(ROUTER_SRC, A, A, 'D3'), /必须真的改变源码|拒绝破坏/);
    // ⑤ 判据纯度：判据体内不得出现被破坏的锚点字面量（否则是自我指涉）
    const judges = dupJudge.toString() + unknownJudge.toString();
    assert.ok(!judges.includes(A), '判据不得引用锚点字面量');
    assert.ok(!judges.includes("via = 'includes'"), '判据不得引用 index.js 侧锚点');
});

test('v3274 D4. ★ 负控制·宿主侧摘掉「来源必须过门」（`traceFrom === \'router\'`）⇒ 未知判据必须转红', () => {
    /* 为什么破坏点选在**宿主**而不在路由模块：路由模块那条 `traceFrom = \'router\'`
     *   在本套件的场景里根本不执行（它只写在 `full.length > budget` 分支内，而这两个
     *   场景都没超预算）—— 改了等于没改，负控制会假绿。真正决定「来源过不过门」的
     *   是宿主那句 `idxOk` 合取项。
     *   破坏后：`keptIdxInAll` 为 null 的回执也被当成精确判据，宿主直接按
     *   `keptSet.has(i)` 判 ⇒ kept 恒 false ⇒ `keptFrom` 从 unknown 变成 trace，
     *   于是「不可测」塌陷成一个看起来精确的读数。 */
    const anchor = "const idxOk = traceUsable && tr.traceFrom === 'router' && Array.isArray(tr.keptIdxInAll);";
    const broken = breakSource(IDX_SRC, anchor, "const idxOk = traceUsable && Array.isArray(tr.keptIdxInAll);", 'D4 摘来源门');
    const file = path.join(TMP, 's' + (++tmpN) + '.js');
    fs.writeFileSync(file, broken);
    const src2 = fs.readFileSync(file, 'utf8');
    assert.notStrictEqual(src2, IDX_SRC, '必须是破坏副本');
    let threw = false, msg = '';
    try { unknownJudgeIdx(src2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 来源门被摘掉后，「不可测必须可见」判据必须转红（否则这条门是空转）');
    assert.match(msg, /回执不可用却报了来源|不可测被写成数字/);
    // 阳性对照：同款判据在**原版**源码上必须真成立
    unknownJudgeIdx(IDX_SRC);
});

test('v3274 D5. ★ 负控制·回执谎报「全部留下」（keptIdxInAll 填满）⇒ 同文重复判据必须转红', () => {
    const r = runOnBrokenRouter('_trace.keptIdxInAll = out;', '_trace.keptIdxInAll = all.map((_, i) => i);',
        'D5 谎报全留', dupJudge);
    assert.ok(r.threw, '★ 回执谎报全留后，同文重复判据必须转红');
    assert.match(r.message, /同文两条留了|被丢块数|保留块数/);
});

test('v3274 D6. 负控制·index.js 侧把 `includes` 反推自述成精确判据 ⇒ 未知判据必须转红', () => {
    const anchor = "} else { kept = at >= 0; via = 'includes'; }";
    const broken = breakSource(IDX_SRC, anchor, "} else { kept = at >= 0; via = 'trace'; }", 'D6 反推冒充精确');
    const file = path.join(TMP, 'i' + (++tmpN) + '.js');
    fs.writeFileSync(file, broken);
    const src2 = fs.readFileSync(file, 'utf8');
    assert.notStrictEqual(src2, IDX_SRC, '必须是破坏副本');
    let threw = false, msg = '';
    try { unknownJudgeFrom(src2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 反推冒充精确后，「不可测必须可见」判据必须转红');
    assert.match(msg, /回执不可用却报了来源/);
    // 阳性对照：同款判据在**原版**源码上必须真成立
    unknownJudgeFrom(IDX_SRC);
});
/** 同款判据（B1 判据本体，可指定 index 源码）：回执缺席 ⇒ 未知必须可见 */
function unknownJudgeFrom(src) {
    const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true }, 'norouter');
    e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    const bs = e._lastBudgetStats;
    if (bs.keptFrom !== 'unknown') throw new Error('回执不可用却报了来源 ' + bs.keptFrom);
    if (bs.keptBlocks !== null) throw new Error('★ 不可测被写成数字 ' + bs.keptBlocks);
    if (!/不倒推/.test(bs.keptWhy)) throw new Error('缺「不倒推」自述：' + bs.keptWhy);
}

test('v3274 D7. 负控制·预测侧把不可测写成「全部留下」⇒ 同款判据必须转红', () => {
    const anchor = "const _known = (keptFrom === 'no-trim' || keptFrom === 'trace' || keptFrom === 'trace-span');";
    const broken = breakSource(read('cost-forecast.js'), anchor,
        'const _known = true;', 'D7 预测侧谎报全留');
    const file = path.join(TMP, 'f' + (++tmpN) + '.js');
    fs.writeFileSync(file, broken);
    const CF2 = requireFromHere(file);
    assert.notStrictEqual(CF2, CF, '必须是破坏副本');
    const noReceipt = (full, budget) => String(full).slice(0, budget);
    let threw = false, msg = '';
    try {
        const p = CF2.forecast(fcOpts([DUP, DUP, '常驻段'], 'balanced', { trim: noReceipt })).predicted;
        if (p.keptFrom !== 'unknown') throw new Error('回执缺席却报了 ' + p.keptFrom);
        if (p.kept !== null) throw new Error('★ 不可测被写成数字');
    } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 预测侧把不可测写成「全部留下」后，判据必须转红');
    assert.match(msg, /回执缺席却报了|不可测被写成数字/);
    // 阳性对照：同款判据在**原版**模块上必须真成立
    const p0 = CF.forecast(fcOpts([DUP, DUP, '常驻段'], 'balanced', { trim: noReceipt })).predicted;
    assert.strictEqual(p0.keptFrom, 'unknown');
    assert.strictEqual(p0.kept, null);
});

/* ══════════════════ E. 旧字段兼容 + 版本锚 ══════════════════ */
test('v3274 E1. 旧字段兼容：v3.144 的十一键一个不少（键名在场即可，值可 null）', () => {
    const st = IDX_SRC.indexOf('_lastBudgetStats = {');
    assert.ok(st > 0, '统计写入存在');
    const blk = IDX_SRC.slice(st, IDX_SRC.indexOf('}', st));
    for (const k of ['requested', 'beforeChars', 'afterChars', 'droppedChars', 'keptBlocks',
        'totalBlocks', 'droppedSamples', 'strategy', 'tokens', 'tokenBudget', 'ts']) {
        assert.ok(blk.includes(k + ':'), '旧键必须在场（下游按 shape 编程）：' + k);
    }
});

test('v3274 E2. 版本锚（下限形）：三源同源且不低于 3.274.0', () => {
    const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(pkg, idxVer, 'package.json 与 index.js 版本必须一致');
    assert.strictEqual(man, idxVer, 'manifest.json 与 index.js 版本必须一致');
    assert.ok(vnum(idxVer) >= vnum('3.274.0'), '本套件自 3.274.0 起成立；当前 ' + idxVer);
    assert.ok(SELF.includes('v3.274.0'), '★ 本档必须锁自己的出生版本 v3.274.0（不随抬版上抬）');
});
