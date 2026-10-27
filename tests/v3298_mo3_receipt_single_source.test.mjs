// tests/v3298_mo3_receipt_single_source.test.mjs — v3.298.0 · M-O3：预算/裁剪/注入回执的单一真源
// [v3.298.0 · M-O3] v3.251.0 把「谁被留下」从文本反推换成裁剪回执，v3.274.0 把三处消费点
//   （生产聚合数 / 预测 / 面板）统一到同一份回执。但**量纲**这一面仍是三处各算一遍，且缺两类量：
//     · `_lastBudgetStats.candidateChars` 自己 `_allB.reduce(长度)`；cost-ledger 自己累 `tagged`；
//       cost-forecast 自己累 resident+trigger —— **同一事实三份实现**（本仓点名的头号缺陷形态），
//       任一处漏掉空块 / 封装口径就漂移，且没有任何判据看着；
//     · 「裁剪减少的字符」（裁剪前全文 − 载荷，**含**首尾说明与块间分隔符）与
//       「被丢块的字符之和」（**不含**封装）被混着叫 `droppedChars` —— 实测三触发块场景
//       124 vs 122（差的两个字符正是块间分隔符）。把两者当同一个量对账必然假 drift；
//     · 判据不可用时（回执缺席 / 内联回落 / 规模不符）**没有任何一格回答**
//       「这批候选里有多少字符是不可归因的」—— 修前整组退回 `includes` 反推，
//       而反推在未裁剪场景恰好偏向「全部留下」，正是 M-O3 要断的谎报形态。
//   本版新增 `injection-receipt.js`：在同一条 trace 上把**六类量**拆开各自命名
//   （候选 / 载荷 / 被丢块 / 裁剪减少 / 预算溢出 / 未知），一律不倒推；
//   常驻超量时把**原因与选择**显式报告；容量口径（首尾说明 / 分隔符 / token）逐项披露。
//
// 覆盖：
//   A 六类量分列（各自独立、互不折算；未裁剪时全为真读数；溢出量与载荷−预算逐项一致）
//   B 单一真源（回执与生产旧键逐项一致；回执与 cost-ledger / cost-forecast 同一条 trace 一致）
//   C 未知不倒推（内联回落 / 规模不符 / 删 trace / span 定位不到 ⇒ 未知可见，绝不塌陷成「全留」）
//   D 常驻超量显式报告（原因 + 选择 + 溢出三者在场）+ 容量口径（frameCheck 精确闭合）
//   E 负控制（回执谎报全留 / 未知写成 0 / 常驻归因缺席）+ 版本锚 + 登记面
//
// 边界（诚实）：
//   本套件证明的是「量纲有唯一真源、六类量可分、不可测不倒推」。它**不**证明
//   `injection-router` 那条 trace 本身的正确性（那是 v3251 / v3273 的地盘），
//   也不证明常驻保护这个设计意图是否正确（那是 v3273 B1 的地盘）——
//   这里只保证**没有第二个人再自己算一遍量纲**。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const requireFromHere = createRequire(import.meta.url);
const IR = requireFromHere(path.join(ROOT, 'injection-router.js'));
const CF = requireFromHere(path.join(ROOT, 'cost-forecast.js'));
const CL = requireFromHere(path.join(ROOT, 'cost-ledger.js'));
const RC = requireFromHere(path.join(ROOT, 'injection-receipt.js'));
const IDX_SRC = __hostSurface();
const ROUTER_SRC = read('injection-router.js');
const RECEIPT_SRC = read('injection-receipt.js');
const UI_SRC = read('settings-ui.js');
const MANIFEST = JSON.parse(read('manifest.json'));

/* ══════════════ 工具：从真源码抽方法体（与 v3251 / v3274 同规格的花括号配平） ══════════════ */
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
 * 真宿主方法体真跑（含 v3.298.0 新增的 `_injectionReceiptLib` 接线口）。
 * @param src      index.js 源码（负控制传**破坏副本**）
 * @param cfg      配置覆盖
 * @param mode     'router' 路由模块在场 / 'norouter' 路由缺席（走内联回落）
 * @param router   覆盖路由模块（负控制传破坏副本）
 * @param receipt  覆盖回执模块（负控制传破坏副本）；undefined ⇒ 真模块
 * @param vals     取库口覆盖（逆序注入用：callback 先定义、赋值后到）
 */
function engineFrom(src, cfg, mode, router, receipt, vals) {
    const V = vals || {};
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
        // —— 关死取值口：缺席时 Proxy 会返回真值 stub，被 `if (x) blocks.push(...)` 当真块 push ——
        status: { getProtagonistPrompt: () => '', getLifeDetailsPrompt: () => [], getGeoPrompt: () => '' },
        clock: { getContextPrompt: () => '', date: '' },
        pulse: { toPrompt: () => '' },
        cse: { toPrompt: () => '' },
        getNpcTiesPrompt: () => '',
        buildNpcTierRecords: () => [],
        typedFactsBlocks: () => null,
        captureCast: () => [],
        graph: { nodes: new Map(), edges: new Map() },
        moneyLedger: null, cards: null, conflicts: null, deltaBook: null, outline: null, pairMem: null,
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function(
        'estimateTextTokens', 'errLog', 'RESIDENT_MARKERS', 'PLUGIN_NAME', 'window', 'require',
        '_costForecastLib', '_costLedgerLib', '_moduleLib', '_injectionReceiptLib', 'buildNpcTierInjection',
        'numOr', 'relativeTimeLabel', 'tiering', 'beat', 'extracted', 'injectionRefOf',
        `return ({ ${body} });`
    );
    const win = {};
    const rtr = (router !== undefined) ? router : (mode === 'router' ? IR : null);
    if (rtr) win.LonShaInjectionRouter = rtr;
    const rec = (receipt !== undefined) ? receipt : RC;
    if (rec) win.LonShaInjectionReceipt = rec;
    const req = (mode === 'norouter')
        ? () => { throw new Error('no-router'); }
        : (p) => { try { return requireFromHere(path.join(ROOT, String(p).replace(/^\.\//, ''))); } catch (e) { return null; } };
    const pass = {};
    const inst = Object.assign(host, fn(est, () => {}, RESIDENT_MARKERS, 'v3298', win, req,
        () => CF, () => CL, anyStub(), (V.receiptLib !== undefined ? V.receiptLib : () => rec), anyStub(),
        (n, d) => d, anyStub(), anyStub(), anyStub(), anyStub(), (eng, i) => `inj_${i}`));
    if (V.after) V.after(inst, pass);
    return inst;
}
const RESIDENT_BLOCK = '[类型化事实·长期]' + 'S'.repeat(20);
/** 同文重复场景：两条完全相同的触发块（`includes` 反推的头号盲区）。 */
function dupEngine(src, cfg, router, receipt) {
    const e = engineFrom(src, Object.assign({ injectionBudget: 420, recallTierEnabled: true }, cfg || {}), 'router', router, receipt);
    e.typedFactsBlocks = () => ({ stable: RESIDENT_BLOCK, volatile: null });
    e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    return e;
}
/** 硬截断场景：recency + 无 recency 标记块 ⇒ `full.slice(0, budget)`，切口落在块内部。 */
function hardEngine(src) {
    const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true, budgetStrategy: 'recency' }, 'router');
    e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    return e;
}
/** 未裁剪场景：预算宽裕。 */
function looseEngine(src) {
    const e = engineFrom(src, { injectionBudget: 3000, recallTierEnabled: true }, 'router');
    e.typedFactsBlocks = () => ({ stable: RESIDENT_BLOCK, volatile: null });
    e.buildInjection([{ source: 'bm25', text: '短块甲' }]);
    return e;
}
/** 内联回落场景：路由模块缺席 ⇒ 裁剪真发生但没有块级清单。 */
function inlineEngine(src, receipt) {
    const e = engineFrom(src, { injectionBudget: 420, recallTierEnabled: true }, 'norouter', undefined, receipt);
    e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    return e;
}
/**
 * 常驻自身超预算场景：唯一块是超长常驻块（+ 一条极短触发）。
 * ★ 为什么单独造：`dupEngine` 的注入里混着表头 / 可提关联等宿主块，注入预算调小时
 *   可能是**触发侧**先被裁而不触发常驻溢出 —— 判据会以「常驻溢出未登记」红，
 *   那是夹具没造出场景，不是产品缺陷（首轮实测就踩到这一条）。
 *   本场景把常驻块做成 300 字符、预算 120 ⇒ 常驻封装必然超预算。
 */
function residentOverEngine(src, receipt) {
    const e = engineFrom(src, { injectionBudget: 120, recallTierEnabled: true }, 'router', undefined, receipt);
    e.typedFactsBlocks = () => ({ stable: '[类型化事实·长期]' + 'R'.repeat(300), volatile: null });
    e.buildInjection([{ source: 'bm25', text: '短' }]);
    return e;
}
const QK = ['candidateChars', 'payloadChars', 'droppedBlockChars', 'trimReductionChars', 'budgetOverflowChars', 'unknownChars'];

/* ══════════════════ A. 六类量分列 ══════════════════ */
test('v3298 A1. 六类量键齐备且各自独立：候选/载荷/被丢块/裁剪减少/预算溢出/未知', () => {
    const e = dupEngine(IDX_SRC);
    const rc = e._lastBudgetStats.receipt;
    assert.ok(rc && rc.quantities, '回执必须在生产路径上派生出来（_lastBudgetStats.receipt）');
    for (const k of QK) assert.ok(k in rc.quantities, '六类量键必须在场：' + k);
    assert.strictEqual(rc.quantities.candidateChars, rc.blocks.reduce((a, x) => a + x.chars, 0),
        '候选字符 = Σ 候选块文本长度（含空块 0，不含封装）');
    assert.strictEqual(rc.quantities.payloadChars, e._lastBudgetStats.afterChars,
        '载荷字符 = 最终注入文本长度（即 AI 真见的那串）');
    assert.strictEqual(rc.version, RC.RECEIPT_VERSION, '回执带自己的版本标记（结构可判）');
});

test('v3298 A2. ★「裁剪减少」与「被丢块字符」是两个量：块间分隔符与半段入载荷部分使两者不等', () => {
    const e = dupEngine(IDX_SRC);
    const q = e._lastBudgetStats.receipt.quantities;
    const id = e._lastBudgetStats.receipt.identity;
    /* 修前两者共用一个名字 `droppedChars`，于是「对账」必然假 drift。
     *   本判据把它们的**关系**钉住：裁剪减少 = 被丢块字符 + 随之消失的块间分隔符。 */
    assert.ok(Number.isFinite(q.droppedBlockChars), '可测场景下被丢块字符是真读数');
    assert.strictEqual(q.trimReductionChars, q.droppedBlockChars + (id.droppedBlocks || 0),
        '★ 裁剪减少 = 被丢块字符 + 被丢块各带走的一个块间分隔符（实测 124 vs 122 的差就是它）');
    assert.notStrictEqual(q.trimReductionChars, q.droppedBlockChars,
        '★ 两个量**必须不等**（相等说明其中一个被折算成了另一个）');
    // 精确闭合：载荷 = 整块保留 + 半段入载荷部分 + 载荷内非块字符
    assert.strictEqual(q.payloadChars,
        e._lastBudgetStats.receipt.derived.keptBlockChars
        + e._lastBudgetStats.receipt.derived.partialKeptChars
        + e._lastBudgetStats.receipt.derived.frameChars,
        '★ 载荷字符精确闭合到「块字符 + 封装」（差一个字符就说明有量被漏算）');
});

test('v3298 A3. 未裁剪 ⇒ 六类量全是**真读数**（unknownChars 是「测到的 0」，不是不可测）', () => {
    const e = looseEngine(IDX_SRC);
    const rc = e._lastBudgetStats.receipt;
    assert.strictEqual(rc.identity.from, 'no-trim', '未超预算 ⇒ no-trim（不是 unknown）');
    assert.strictEqual(rc.quantities.unknownChars, 0, '★ 测到的 0：整批已逐块归因，没有一块不可测');
    assert.strictEqual(rc.quantities.droppedBlockChars, 0, '真读数 0 丢（不是 null）');
    assert.strictEqual(rc.quantities.trimReductionChars, 0, '裁剪减少 0');
    assert.strictEqual(rc.identity.fullyAccounted, true, '归因完备');
    assert.strictEqual(rc.unknown.filter((u) => u.field === 'droppedBlockChars').length, 0,
        '★ 「测到的 0」不得被登记进未知清单（0 与不可测必须可分）');
});

test('v3298 A4. 预算溢出量：与「载荷 − 预算」逐项一致，且常驻保护时可 > 0', () => {
    const e = dupEngine(IDX_SRC, { injectionBudget: 200 });
    const bs = e._lastBudgetStats;
    const rc = bs.receipt;
    assert.strictEqual(rc.quantities.budgetOverflowChars, Math.max(0, bs.afterChars - bs.requested),
        '溢出量与生产旧键逐项一致（同一口径）');
    assert.strictEqual(rc.capacity.budget, bs.requested, '容量口径里的预算取同一真源');
    assert.ok(rc.quantities.budgetOverflowChars >= 0, '溢出量非负（软预算下可能为 0）');
});

/* ══════════════════ B. 单一真源 ══════════════════ */
test('v3298 B1. ★ 回执量纲与生产旧键逐项一致（同一份事实，不是第二份算法）', () => {
    const e = dupEngine(IDX_SRC);
    const bs = e._lastBudgetStats, rc = bs.receipt;
    assert.strictEqual(rc.quantities.candidateChars, bs.candidateChars, '候选字符：回执 = 生产旧键');
    assert.strictEqual(rc.quantities.payloadChars, bs.afterChars, '载荷字符：回执 = 生产旧键');
    assert.strictEqual(rc.quantities.budgetOverflowChars, bs.overBudgetChars, '溢出量：回执 = 生产旧键');
    assert.strictEqual(rc.identity.keptBlocks, bs.keptBlocks, '保留块数：回执 = 生产旧键');
    assert.strictEqual(rc.identity.droppedBlocks, bs.droppedBlocks, '被丢块数：回执 = 生产旧键');
    /* 被切半块数：本场景走「下标清单」态（半段在构造上不可能发生），故回执给**测到的 0**；
     *   生产旧键在非 span 态**不计算**这一格（null）。「0」与「不计算」是两回事，不硬拉相等。 */
    assert.strictEqual(rc.identity.partialBlocks, 0, '本场景构造上无半段 ⇒ 回执给测到的 0');
    assert.ok(bs.partialBlocks === null || bs.partialBlocks === 0, '生产旧键非 span 态可留 null：' + bs.partialBlocks);
    assert.strictEqual(rc.identity.from, bs.keptFrom, '判据来源四态：回执 = 生产旧键');
    assert.strictEqual(rc.derived.keptBlockChars, bs.keptBlockChars, '保留块字符：回执 = 生产旧键');
    /* 被切半字符：本场景走「下标清单」态（构造上不可能有半段），故回执给**测到的 0**；
     *   而生产旧键只在 span 态才计算这一格（非 span 态留 null）。两者是「0 与不计算」的
     *   区别，不是两个数 —— 故这里分开断言，不硬拉相等（硬拉相等才是把两种口径混成一个）。 */
    assert.strictEqual(rc.identity.partialBlocks, 0, '本场景构造上无半段 ⇒ 测到的 0');
    assert.ok(bs.partialBlockChars === null || bs.partialBlockChars === 0,
        '生产旧键在非 span 态不计算这一格（null）或为 0，两者都可接受：' + bs.partialBlockChars);
    // span 态的相等放在真正有半段的场景里断言（v3298 D4 已覆盖）
});

test('v3298 B2. ★ 五处消费点对同一条 trace 一致（生产 / 回执 / 账本 / 预测逐项相等）', () => {
    const e = dupEngine(IDX_SRC);
    const bs = e._lastBudgetStats, rc = bs.receipt;
    const lg = e._lastCostLedger, p = e._lastForecast.predicted;
    assert.strictEqual(lg.identity.keptBlocks, bs.keptBlocks, '账本保留块数 = 生产聚合数');
    assert.strictEqual(lg.identity.droppedBlocks, bs.droppedBlocks, '账本被丢块数 = 生产聚合数');
    assert.strictEqual(p.kept.blocks, bs.keptBlocks, '预测保留块数 = 生产聚合数');
    assert.strictEqual(p.dropped.blocks, bs.droppedBlocks, '预测被丢块数 = 生产聚合数');
    assert.strictEqual(rc.identity.keptBlocks, lg.identity.keptBlocks, '★ 回执 = 账本（同一条 trace）');
    assert.strictEqual(rc.identity.droppedBlocks, p.dropped.blocks, '★ 回执 = 预测（同一条 trace）');
    assert.strictEqual(rc.identity.from, lg.identity.keptFrom, '回执与账本自述同一判据来源');
    assert.strictEqual(e._lastReconcile.verdict, 'match', '预测与实测对账无漂移');
});

test('v3298 B3. 结构面：量纲派生只有一处（index.js 只**读**回执，不另算）', () => {
    const at = IDX_SRC.indexOf('_lastBudgetStats.receipt = this._lastReceipt;');
    assert.ok(at > 0, '生产路径必须把回执挂上读数面');
    const seg = IDX_SRC.slice(at - 1600, at);
    assert.ok(/_injectionReceiptLib\(\)/.test(seg), '★ 取库口必须是唯一入口（不许就地另写一份算法）');
    assert.ok(/deriveReceipt\(/.test(seg), '派生只经 deriveReceipt');
    assert.ok(/this\._lastBudgetStats\.receiptLine = /.test(IDX_SRC), '一行诊断随回执落账');
    // 构造函数里必须显式置 null：「模块未加载」与「本轮是空的」可分
    assert.ok(/this\._lastReceipt = null;/.test(IDX_SRC), '读数面显式初始化（不靠 undefined）');
    assert.ok(/function _injectionReceiptLib\(\) \{/.test(IDX_SRC), '取库口定义在场（_moduleLib 同形）');
});

/* ══════════════════ C. 未知不倒推 ══════════════════ */
test('v3298 C1. ★ 内联回落（回执缺席）⇒ 块级量整组 null，未知字符 = 全部候选字符', () => {
    const e = inlineEngine(IDX_SRC);
    const rc = e._lastBudgetStats.receipt;
    assert.strictEqual(rc.identity.from, 'unknown', '没有块级清单 ⇒ 不可测');
    assert.strictEqual(rc.quantities.droppedBlockChars, null, '★ 块级量必须是 null（不是数字）');
    assert.strictEqual(rc.identity.keptBlocks, null, '★ 保留块数同上');
    assert.strictEqual(rc.identity.droppedBlocks, null, '★ 被丢块数同上');
    assert.strictEqual(rc.quantities.unknownChars, rc.quantities.candidateChars,
        '★ 不可归因的字符量 = 全部候选字符（不是 0，也不是「全部留下」）');
    assert.ok(/不倒推/.test(rc.identity.why), '必须自述「不倒推」，实：' + rc.identity.why);
    assert.strictEqual(rc.identity.fullyAccounted, false, '归因不完备必须如实自述');
    assert.strictEqual(rc.identity.charsEqual, null, '字符账不可判时记 null（不是 true）');
});

test('v3298 C2. ★ 规模不符（拿别批回执判本批）⇒ 不可测，且归因可分辨', () => {
    // 真回执 + 人为把自证规模改掉：回执说 3 块那批，候选是 2 块 ⇒ 规模自证失败
    const u = RC.traceUsable({ version: 1, traceFrom: 'router', blockCount: 3, keptIdxInAll: [0] }, 2);
    assert.strictEqual(u.ok, false, '规模不符 ⇒ 回执不可用');
    assert.strictEqual(u.why, 'scale-mismatch', '归因点名是规模不符');
    const rc = RC.deriveReceipt({
        trace: { version: 1, traceFrom: 'router', blockCount: 3, keptIdxInAll: [0] },
        blocks: ['块甲', '块乙'], payloadText: '载荷', preTrimChars: 30, budget: 10,
    });
    assert.strictEqual(rc.identity.from, 'unknown', '规模不符 ⇒ 不可测');
    assert.strictEqual(rc.quantities.droppedBlockChars, null, '不倒推');
    assert.strictEqual(rc.quantities.unknownChars, 4, '未知字符 = 两条候选的长度和（块甲3 + 块乙3？按实际文本计）');
});

test('v3298 C3. ★ 两种等价规模自证都收（宿主 blockCount / 路由 residentKept+triggerTotal）', () => {
    /* 修前 index.js 只认 `blockCount`、cost-forecast 只认 `residentKept+triggerTotal` ——
     *   同一份回执在一处「可用」、在另一处「不可用」（cost-forecast 首版因此把
     *   每一次精确回执都判成「未派发」，整组记 null：假不可测）。本函数把两者收成一条判据。 */
    const byCount = RC.traceUsable({ version: 1, traceFrom: 'router', blockCount: 3, keptIdxInAll: [0] }, 3);
    assert.strictEqual(byCount.ok, true, '宿主口径可自证');
    assert.strictEqual(byCount.scaleFrom, 'blockCount');
    const byParts = RC.traceUsable({ traceFrom: 'router', residentKept: 1, triggerTotal: 2, keptIdxInAll: [0] }, 3);
    assert.strictEqual(byParts.ok, true, '★ 路由口径（无 version / 无 blockCount）同样可自证');
    assert.strictEqual(byParts.scaleFrom, 'residentKept+triggerTotal');
    // 来源不是路由 ⇒ 一律不可用（内联回落即使补了清单也不认）
    const inline = RC.traceUsable({ version: 1, traceFrom: 'inline', blockCount: 3, keptIdxInAll: [0, 1, 2] }, 3);
    assert.strictEqual(inline.ok, false, '★ 来源门必须挡住「内联回落却谎报清单」');
    assert.strictEqual(inline.why, 'inline', '归因点名来源');
});

test('v3298 C4. ★ 删 trace 的负控制：未知必须可见，不得变成「全部留下」', () => {
    const rc = RC.deriveReceipt({
        trace: null, blocks: ['甲'.repeat(30), '乙'.repeat(30)],
        payloadText: '截断后的载荷', preTrimChars: 200, budget: 20,
    });
    assert.strictEqual(rc.identity.from, 'unknown', '无回执 ⇒ 不可测');
    assert.notStrictEqual(rc.identity.keptBlocks, 2, '★ 不可测不得塌陷成「全部留下」');
    assert.notStrictEqual(rc.identity.keptBlocks, 0, '★ 也不得塌陷成 0');
    assert.strictEqual(rc.identity.keptBlocks, null, '★ 只能是 null');
    const line = RC.receiptLine(rc);
    assert.ok(line.includes('丢块不可测'), '★ 一行诊断必须写「不可测」，实：' + line);
    assert.ok(!/丢块 0 字符/.test(line), '★ 不得写成「丢块 0 字符」（那是把测不了写成没有）');
    assert.ok(/未知 60 字符/.test(line), '★ 未知字符量必须在诊断行上现身，实：' + line);
});

test('v3298 C5. 硬截断 span 定位不到 ⇒ 该块记 unknown（**不退回 includes** 降级）', () => {
    const tr = {
        traceFrom: 'router', trimmed: true, hardTruncated: true, sliceAt: 20,
        residentKept: 0, triggerTotal: 2,
        blockSpans: [null, [30, 60]],   // 首块定位不到（互文互子串等）
    };
    const rc = RC.deriveReceipt({
        trace: tr, blocks: ['甲'.repeat(30), '乙'.repeat(30)],
        payloadText: '甲'.repeat(30) + '\n', preTrimChars: 100, budget: 20,
    });
    const st = rc.blocks.map((x) => x.state);
    assert.deepStrictEqual(st[0], 'unknown', '★ span 缺席 ⇒ 该块不可判，记 unknown');
    assert.deepStrictEqual(st[1], 'dropped', 'span 在切点之后 ⇒ 整块被丢（可判）');
    assert.strictEqual(rc.quantities.unknownChars, 30, '未知字符只计那一条不可判的块');
    assert.strictEqual(rc.identity.fullyAccounted, false, '含未知块 ⇒ 归因不完备');
    assert.ok(rc.identity.viaCounts['trace-truncated-nospan'] >= 1, '来源逐块可追（viaCounts）');
});

test('v3298 C6. unknown 清单机器可判：每一格 null 都在清单里点名并给原因', () => {
    const rc = RC.deriveReceipt({
        trace: null, blocks: ['甲'.repeat(30)], payloadText: null, preTrimChars: null, budget: null,
    });
    const fields = rc.unknown.map((u) => u.field);
    for (const f of ['payloadChars', 'droppedBlockChars', 'trimReductionChars', 'budgetOverflowChars']) {
        assert.ok(fields.includes(f), '★ 为 null 的量必须在未知清单里点名：' + f);
    }
    for (const u of rc.unknown) assert.ok(String(u.why || '').length > 0, '每条未知都必须带原因：' + u.field);
    assert.ok(fields.includes('blockAttribution'), '块级归因不完备也要进清单');
    assert.ok(fields.includes('residentChars'), '常驻下标缺席 ⇒ 常驻字量不可测，进清单');
});

/* ══════════════════ D. 常驻显式报告 + 容量口径 ══════════════════ */
test('v3298 D1. ★ 常驻超量 ⇒ 原因 / 选择 / 溢出量三者同时在场（不静默裁断关键事实）', () => {
    const e = residentOverEngine(IDX_SRC);
    const rc = e._lastBudgetStats.receipt;
    assert.ok(rc.resident.overflow && rc.resident.overflow.over > 0, '常驻自身超预算 ⇒ 溢出量可读');
    assert.ok(rc.resident.reason.length > 0, '★ 原因必须在场（不是光秃秃一个数字）：' + rc.resident.reason);
    assert.ok(/全保留/.test(rc.resident.decision), '★ 选择必须在场（常驻块按设计全保留）：' + rc.resident.decision);
    assert.ok(/关键事实保护/.test(rc.resident.decision), '选择文本要点明设计意图');
    assert.ok(rc.resident.note.length > 0, '溢出归因（来自常驻保护而非触发装满）也要说清');
    assert.ok(rc.quantities.budgetOverflowChars > 0, '载荷如实超预算（不假装裁掉了）');
    assert.ok(RC.receiptLine(rc).includes('常驻溢出'), '诊断行必须把常驻溢出摆出来');
});

test('v3298 D2. 常驻未超 ⇒ 不凭空登记 overflow，但**选择仍是显式的**（decision 恒在场）', () => {
    const e = dupEngine(IDX_SRC);
    const rc = e._lastBudgetStats.receipt;
    const ro = rc.resident.overflow;
    assert.ok(ro === null || !(ro.over > 0), '常驻没超就不许登记溢出');
    assert.strictEqual(rc.resident.reason, '', '没超 ⇒ 原因留空（不编一段解释）');
    assert.ok(/全保留/.test(rc.resident.decision), '★ 但「选择」这一格恒在场（软预算的口径任何一轮都该读得出来）');
    assert.strictEqual(rc.resident.blocks, rc.resident.keptBlocks, '常驻块全都留下了');
});

test('v3298 D3. 容量口径：首尾说明 + 块间分隔符披露，且与载荷内非块字符精确核对', () => {
    const e = dupEngine(IDX_SRC);
    const cap = e._lastBudgetStats.receipt.capacity;
    assert.ok(cap.frame && cap.frame.headLen === 52 && cap.frame.tailLen === 39, 'HEAD/TAIL 长度与真源一致（52/39）');
    assert.strictEqual(cap.frame.separatorLen, 1, '块间分隔符口径披露（1 字符）');
    assert.ok(cap.tokenSource, 'token 口径必须在场（host-* 真 tokenizer / estimate 估算）');
    assert.ok(/含/.test(cap.note) && /估算/.test(cap.note), '容量说明必须点明「预算含首尾说明」与「估算值不得当精确值」');
    const chk = cap.frameCheck;
    assert.ok(chk && chk.equal === true, '★ 载荷内非块字符必须与「首尾说明 + 分隔符 × 块数」精确相等，实：' + JSON.stringify(chk));
    assert.strictEqual(chk.actual, cap.frameChars, '核对用的是同一格实测值（不是另算一份）');
    /* 期望值按**真留在载荷里的块数**算（保留 + 被切半；被丢的块不占分隔符也不再占载荷）。
     *   首轮这里误用 `countedBlocks - 1`（把被丢的块也算进分隔符），自招一红 —— 记在此处。 */
    const nIn = e._lastBudgetStats.receipt.identity.keptBlocks + e._lastBudgetStats.receipt.identity.partialBlocks;
    assert.strictEqual(chk.expected, cap.frame.headLen + cap.frame.tailLen + cap.frame.separatorLen * Math.max(0, nIn - 1),
        '期望值按实际留在载荷里的块数（保留 + 被切半）算，实 nIn=' + nIn);
});

test('v3298 D4. 半段场景：被切半的块入载荷部分可精确算（裁半不再整组不可测）', () => {
    const e = hardEngine(IDX_SRC);
    const rc = e._lastBudgetStats.receipt;
    assert.strictEqual(rc.identity.from, 'trace-span', '硬截断走 span 判据');
    assert.ok(rc.identity.partialBlocks >= 1, '确有块被切半，实 ' + rc.identity.partialBlocks);
    assert.ok(rc.derived.partialKeptChars > 0, '★ 半段**入载荷的那部分**字符可精确算，实 ' + rc.derived.partialKeptChars);
    assert.ok(rc.derived.partialBlockChars > rc.derived.partialKeptChars, '整块字符 > 入载荷部分（确实是半段而非整块）');
    assert.strictEqual(rc.quantities.payloadChars,
        rc.derived.keptBlockChars + rc.derived.partialKeptChars + rc.derived.frameChars,
        '★ 半段场景下载荷同样精确闭合（修前这一格整组不可测）');
});

/* ══════════════════ E. 负控制 + 版本锚 + 登记面 ══════════════════ */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v3298-'));
let tmpN = 0;
function writeBroken(name, src) {
    const file = path.join(TMP, (++tmpN) + '-' + name);
    fs.writeFileSync(file, src);
    return file;
}
/** 同款判据（A2 本体）：两个量必须可分且载荷精确闭合。 */
function quantitiesJudge(rcMod) {
    const e = dupEngine(IDX_SRC, undefined, undefined, rcMod);
    const rc = e._lastBudgetStats.receipt;
    if (rc.quantities.trimReductionChars === rc.quantities.droppedBlockChars) {
        throw new Error('两个量被折算成同一个：' + rc.quantities.trimReductionChars);
    }
    const d = rc.derived;
    if (rc.quantities.payloadChars !== d.keptBlockChars + d.partialKeptChars + d.frameChars) {
        throw new Error('载荷未精确闭合：' + JSON.stringify({ q: rc.quantities, d: d }));
    }
}
/** 同款判据（C1 本体）：回执缺席 ⇒ 未知必须可见。 */
function unknownJudge(rcMod) {
    const e = inlineEngine(IDX_SRC, rcMod);
    e.buildInjection([]);   // 触发一次（保持接口一致；本判据只读首次构建的读数）
    const rc = e._lastBudgetStats.receipt;
    if (rc.identity.from !== 'unknown') throw new Error('回执不可用却报了来源 ' + rc.identity.from);
    if (rc.quantities.droppedBlockChars !== null) throw new Error('★ 不可测被写成数字 ' + rc.quantities.droppedBlockChars);
    if (rc.quantities.unknownChars !== rc.quantities.candidateChars) throw new Error('★ 未知字符量被写成 ' + rc.quantities.unknownChars + '（应为全部候选 ' + rc.quantities.candidateChars + '）');
    if (!/不倒推/.test(rc.identity.why)) throw new Error('缺「不倒推」自述：' + rc.identity.why);
}
/** 同款判据（D1 本体）：常驻超量必须把原因与选择都说出来。 */
function residentJudge(rcMod) {
    const e = residentOverEngine(IDX_SRC, rcMod);
    const rc = e._lastBudgetStats.receipt;
    if (!rc.resident.overflow || !(rc.resident.overflow.over > 0)) throw new Error('常驻溢出未登记');
    if (!rc.resident.reason) throw new Error('缺常驻溢出的**原因**');
    if (!/全保留/.test(rc.resident.decision)) throw new Error('缺常驻的**选择**自述');
}

test('v3298 E0. 工具两向自证：锚点 0 次 / 不唯一 / 同值替换均抛；原版上同判据必须真成立', () => {
    // ① 阳性对照：同款判据在**原版模块**上必须真成立（否则下面的「破坏后转红」毫无意义）
    quantitiesJudge(RC);
    unknownJudge(RC);
    residentJudge(RC);
    // ② 锚点不存在 ⇒ 抛
    assert.throws(() => breakSource(RECEIPT_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'E0'), /拒绝破坏|命中 0 次|恰中 1 次/);
    // ③ 锚点不唯一 ⇒ 抛
    assert.throws(() => breakSource(RECEIPT_SRC, 'const ', 'x', 'E0'), /拒绝破坏|恰中 1 次|要求恰好 1 次/);
    // ④ 同值替换 ⇒ 抛
    const A = "const RECEIPT_VERSION = 1;";
    assert.throws(() => breakSource(RECEIPT_SRC, A, A, 'E0'), /必须真的改变源码|拒绝破坏/);
    // ⑤ 判据纯度：判据体内不得出现被破坏的锚点字面量（否则是自我指涉）
    const judges = quantitiesJudge.toString() + unknownJudge.toString() + residentJudge.toString();
    for (const bad of [A, 'const unknownChars = 0;', 'reason: (false)']) {
        assert.ok(!judges.includes(bad), '判据不得引用锚点字面量：' + bad);
    }
});

test('v3298 E1. ★ 负控制·回执谎报「全部留下」（keptIdxInAll 填满）⇒ 同文重复判据必须转红', () => {
    const broken = breakSource(ROUTER_SRC, '_trace.keptIdxInAll = out;',
        '_trace.keptIdxInAll = all.map((_, i) => i);', 'E1 谎报全留');
    const file = writeBroken('router.js', broken);
    const IR2 = requireFromHere(file);
    assert.notStrictEqual(IR2, IR, '必须是破坏副本');
    let threw = false, msg = '';
    try { quantitiesJudge(undefined); dupJudgeWithRouter(IR2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 回执谎报全留后，同文重复判据必须转红（否则这条门是空转）');
    assert.match(msg, /同文两条留了|被丢块数|保留块数|两个量被折算/);
    // 阳性对照：同款判据在**原版**路由模块上必须真成立
    dupJudgeWithRouter(IR);
});
/** 同款判据（A1 本体，可指定路由模块）：两条完全相同的块只能留下一条。 */
function dupJudgeWithRouter(ir) {
    const e = engineFrom(IDX_SRC, { injectionBudget: 420, recallTierEnabled: true }, 'router', ir);
    e.typedFactsBlocks = () => ({ stable: RESIDENT_BLOCK, volatile: null });
    e.buildInjection([{ source: 'bm25', text: '字'.repeat(300) }, { source: 'bm25', text: '乙'.repeat(300) }]);
    const bs = e._lastBudgetStats, rc = bs.receipt;
    if (bs.keptFrom !== 'trace') throw new Error('判据来源不是精确回执：' + bs.keptFrom);
    if (rc.identity.droppedBlocks < 1) throw new Error('被丢块数 ' + rc.identity.droppedBlocks);
    if (rc.quantities.droppedBlockChars !== bs.droppedBlockChars) throw new Error('保留块数 ' + rc.identity.keptBlocks);
}

test('v3298 E2. ★ 负控制·把「未知字符」写成 0（不可测冒充「测了没有」）⇒ 未知判据必须转红', () => {
    const broken = breakSource(RECEIPT_SRC,
        'const unknownChars = xs.reduce((a, x) => a + ((x.state === \'unknown\') ? x.chars : 0), 0);',
        'const unknownChars = 0;', 'E2 未知写 0');
    const file = writeBroken('receipt-unknown.js', broken);
    const RC2 = requireFromHere(file);
    assert.notStrictEqual(RC2, RC, '必须是破坏副本');
    let threw = false, msg = '';
    try { unknownJudge(RC2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 未知量被写成 0 后，「不可测必须可见」判据必须转红');
    assert.match(msg, /未知字符量被写成/);
});

test('v3298 E3. ★ 负控制·删掉常驻溢出的「原因」⇒ 常驻显式报告判据必须转红', () => {
    const broken = breakSource(RECEIPT_SRC,
        'reason: (roOver !== null && roOver > 0)', 'reason: (false)', 'E3 去原因');
    const file = writeBroken('receipt-reason.js', broken);
    const RC2 = requireFromHere(file);
    assert.notStrictEqual(RC2, RC, '必须是破坏副本');
    let threw = false, msg = '';
    try { residentJudge(RC2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 删掉原因后，常驻显式报告判据必须转红');
    assert.match(msg, /缺常驻溢出的/);
});

test('v3298 E4. ★ 负控制·把量纲算错一个字符（候选量私自改口径）⇒ 一致性判据必须转红', () => {
    const broken = breakSource(RECEIPT_SRC,
        'const candChars = xs.reduce((a, x) => a + x.chars, 0);',
        'const candChars = xs.reduce((a, x) => a + x.chars, 0) + 1;', 'E4 候选量偏 1');
    const file = writeBroken('receipt-cand.js', broken);
    const RC2 = requireFromHere(file);
    assert.notStrictEqual(RC2, RC, '必须是破坏副本');
    let threw = false, msg = '';
    try { agreementJudge(RC2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 量纲偏 1 后，「与生产旧键逐项一致」判据必须转红（证明该判据不是空转）');
    assert.match(msg, /候选字符/);
    // 阳性对照
    agreementJudge(RC);
});
/** 同款判据（B1 本体）：回执量纲与生产旧键逐项一致。 */
function agreementJudge(rcMod) {
    const e = dupEngine(IDX_SRC, undefined, undefined, rcMod);
    const bs = e._lastBudgetStats, rc = bs.receipt;
    if (rc.quantities.candidateChars !== bs.candidateChars) throw new Error('候选字符：回执 ' + rc.quantities.candidateChars + ' ≠ 生产 ' + bs.candidateChars);
    if (rc.quantities.payloadChars !== bs.afterChars) throw new Error('载荷字符：回执 ' + rc.quantities.payloadChars + ' ≠ 生产 ' + bs.afterChars);
    if (rc.quantities.budgetOverflowChars !== bs.overBudgetChars) throw new Error('溢出量：回执 ' + rc.quantities.budgetOverflowChars + ' ≠ 生产 ' + bs.overBudgetChars);
    if (rc.identity.droppedBlocks !== bs.droppedBlocks) throw new Error('被丢块数：回执 ' + rc.identity.droppedBlocks + ' ≠ 生产 ' + bs.droppedBlocks);
}

test('v3298 E5. 版本锚（当版形，数值 vnum）+ 六源同源', () => {
    const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(pkg, idxVer, 'package.json 与 index.js 版本必须一致');
    assert.strictEqual(man, idxVer, 'manifest.json 与 index.js 版本必须一致');
    /* 三份模块副本（`let VERSION`）同源 —— 与既有抬版纪律同规格。 */
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const m = /let VERSION = '([0-9.]+)'/.exec(read(f));
        assert.ok(m, f + ' 应有 `let VERSION` 副本');
        assert.strictEqual(m[1], idxVer, f + ' 的版本副本必须与 index.js 同源');
    }
    /* ★ 当版锚（vnum 数值形态）—— 形态与 v3263 / v3209 / v3297 等带锚档一致，三条纪律：
     *   ① 字面量**入 vnum**（只写进字符串里不算）⇒ 版本守卫 V4 的计数口径看得见；
     *   ② 锚住在**当版自己的档案**里 ⇒ 不占历史文件的口子（V2 只判非当版档）。
     *      修前 V4 数的是全网任意文件，于是「给当版补锚」的直觉动作必然踩 V2（见 V2/V4 段头）；
     *   ③ 锚的是「本档出生版本」这条**自洽事实**，不绑运行版本 ⇒ 抬版后本行无需再改
     *      （旧形态绑 idxVer，抬版必红）；运行版本另判「不得低于本档出生版本」。 */
    assert.strictEqual(vnum('3.298.0'), 3298000, '出生版本锚（v3.299.0 起降为历史下界，当版锚交棒给 v3299）：vnum 须给出三段数值');
    assert.ok(vnum(idxVer) >= vnum('3.298.0'), '运行版本不得低于本档出生版本 3.298.0，实 ' + idxVer);
    assert.ok(SELF.includes('v3.298.0'), '★ 本档必须锁自己的出生版本 v3.298.0（不随抬版上抬）');
    assert.strictEqual(RC.RECEIPT_VERSION, 1, '回执结构版本独立于插件版本（结构可判）');
});

test('v3298 E6. 登记面：新模块进 extra_js、进人读面、数量锁同步', () => {
    assert.ok(Array.isArray(MANIFEST.extra_js), 'manifest.extra_js 是数组');
    assert.strictEqual(MANIFEST.extra_js.filter((x) => x === 'injection-receipt.js').length, 1,
        '★ injection-receipt.js 须在 extra_js 恰好声明一次');
    assert.ok(MANIFEST.extra_js.indexOf('injection-receipt.js') > MANIFEST.extra_js.indexOf('cost-forecast.js'),
        '加载序：回执模块排在它所消费的 cost-forecast 之后');
    assert.ok(fs.existsSync(path.join(ROOT, 'injection-receipt.js')), '模块文件必须在磁盘上（声明了却缺席 = 静默失败）');
    /* 项数锁随抬版**交棒给当版**（v3299）：本档只判「自己登记的那一项在场且恰一次」，
     *   不再锁总项数 —— 否则每加一个模块都要回头改历史档（本仓早已定性为抬版仪式）。 */
    assert.strictEqual(MANIFEST.extra_js.filter((x) => x === 'injection-receipt.js').length, 1,
        'injection-receipt.js 始终恰登记一次');
    // 人读面（README / PLAN）由 scan_doc_truthfulness 的 D3 / D5 常驻把守，这里只确认登记面在场
    assert.ok(fs.existsSync(path.join(ROOT, 'tests/audit/catalog_reference_consumers.tsv')), '在役测试面登记表在场');
});
