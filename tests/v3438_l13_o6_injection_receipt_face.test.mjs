// tests/v3438_l13_o6_injection_receipt_face.test.mjs — v3.435.0
/* [v3.435.0 · L13-O6] 注入面「这一轮用了什么」可复算。
 *
 * 计划原文（`.agents/notes/implemented/architecture/2026-10-31-product-optimization-v13.md` L13-O6）：
 *   · 生成回执里取**逐条**记录：条目 id / 来源面 / 占多少字符 / 是否被裁（含理由码）；
 *   · 面板 `injection` 视图改成**列表 + 逐条可展开**，每条给「凭什么进来」；
 *   · 加一枚「这一轮有没有条目因为预算被裁」的显式读数；
 *   · 判据：造一轮「预算刚好不够」的注入，被裁条目必须**同时**出现在面板与被裁计数里；
 *   · 禁止：只显示总数 / 把「被裁」当「没命中」 / 面板自己按预算重算（必须读回执）；
 *   · 验收负控制：回执少一条 ⇒ 面板与它同源（不会多出来），但判据报「回执与注入不一致」。
 *
 * 本套件只做一件事：让上面每一条都有**一条会红的判据**，且每条判据都能被真源码破坏翻红。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const requireFromRoot = createRequire(path.join(ROOT, 'index.js'));
const require = requireFromRoot;   // 方法体内 `require('./injection-router.js')` 相对仓根
const IR = require(path.join(ROOT, 'injection-router.js'));

const PIPE = read('engine-injection-pipeline.js');
const UI = read('settings-ui.js');

/* ══════════════ 锚点（字面量只在此声明一次；判据函数不得引用这些串） ══════════════ */
const A_BLOCK_SRC = 'const _blockSrc = [];';
const A_COUNT_SRC = 'const _countSource = (key, n) => {';
const A_ALL_B = 'const _allB = _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks;';
const A_ALL_SRC_END = 'return _idx.map((_i) => _blockSrc[_i] || \'unattributed\');';
const A_TRACE_BS = 'blockSources: { attribution: \'by-order\', keys: _blockSrc.slice() },';
const A_PROJ_HEAD = '        _injectionTraceProjection() {';
const A_PROJ_TAIL = '        _injectionCommit(myGen) {';
const A_STAGE_TRACE = 'trace: this._injectionTraceProjection(),';
const A_COMMIT_TRACE = 'this._lastInjectionTrace = p.trace || null;';
const A_TRACE_READOUT = 'trace: (this._lastInjectionTrace && typeof this._lastInjectionTrace';
const A_ROWS_HEAD = "                    if (Array.isArray(inj.blocks) && inj.blocks.length) {";
const A_ROWS_TAIL = '                    // [v3.144] CP: 预算实测条（丢弃可见性）——超预算时丢了什么此前完全静默';

function slot(src, head, tail, label) {
    const a = src.indexOf(head);
    assert.ok(a >= 0, label + '：起点锚点必须在场');
    const b = src.indexOf(tail, a + head.length);
    assert.ok(b > a, label + '：终点锚点必须在起点之后（提前命中即切错段）');
    return src.slice(a, b);
}
function countOf(src, lit) {
    return src.split(lit).length - 1;
}

/* ══════════════ 真跑面：把内核方法体抠出来执行（同 v3216/v3251 规格） ══════════════ */
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
    '_injectionStage(payload) {',
    '_injectionTraceProjection() {',
    '_injectionCommit(myGen) {',
    '_injectionDiscardStale(myGen) {',
    '_buildDiagnosticsInjection(recalled) {',
    'buildInjectionReadout() {',
    'buildInjection(recalled) {',
];
const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]'];
const est = (t) => Math.ceil(String(t || '').length * 0.9);

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

/** 真宿主方法体真跑（真字段可读写；未声明字段回万能 stub）。 */
function engineFrom(src, cfg) {
    const parts = HOST_METHODS.map((h) => blockAt(src, src.indexOf(h)));
    assert.strictEqual(parts.filter(Boolean).length, HOST_METHODS.length,
        '宿主方法体必须全部可提取（缺失即接线不全）：缺 ' + HOST_METHODS.filter((h, i) => !parts[i]).join(' / '));
    const body = parts.join(',\n');
    const real = {
        config: { config: Object.assign({
            vectorTopK: 8, injectionBudget: 3000, recallTierEnabled: false,
            budgetStrategy: 'balanced', adaptiveBudget: false, debugMode: false,
        }, cfg || {}) },
        _lastInjection: null, _lastInjectionDraft: null, _lastInjectionTrace: null,
        _lastInjectionDiscard: null, _injectionStale: 0, _injectionRound: 0,
        _diagnostics: null, _injectionPending: null,
        _injectionEnded: { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 },
        _genSeq: 0, _recallAudit: [],
        summary: { getGrandChroniclePrompt: () => '', lockedFactsForPrompt: () => '' },
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function(
        'estimateTextTokens', 'errLog', 'RESIDENT_MARKERS', 'PLUGIN_NAME', 'window', 'require',
        '_costForecastLib', '_costLedgerLib', '_moduleLib', 'buildNpcTierInjection',
        'numOr', 'relativeTimeLabel', 'tiering', 'beat', 'extracted', 'injectionRefOf',
        `return ({ ${body} });`
    );
    const win = { LonShaInjectionRouter: IR };
    const inst = Object.assign(host, fn(est, () => {}, RESIDENT_MARKERS, 'v3438', win, require,
        anyStub(), anyStub(), anyStub(), anyStub(), (n, d) => d, anyStub(), anyStub(), anyStub(),
        anyStub(), (eng, i) => (eng && typeof eng._injectionRefOf === 'function' ? eng._injectionRefOf(i) : '')));
    inst.buildNpcTierRecords = () => [];
    inst.typedFactsBlocks = () => null;
    inst.castCapture = () => [];
    inst.captureCast = () => [];
    inst.graph = { nodes: new Map(), edges: new Map() };
    inst.pulse = { toPrompt: () => '' };
    inst.status = { getGeoPrompt: () => '' };
    inst.clock = { getContextPrompt: () => '', date: '' };
    return inst;
}

/** 走真发布链：buildInjection → 暂存 → 提交（读数与回执同代落地）。 */
function generate(eng, recalled) {
    const html = eng.buildInjection(recalled);
    eng._genSeq = (Number(eng._genSeq) || 0) + 1;
    const draft = Array.isArray(eng._lastInjectionDraft) ? eng._lastInjectionDraft : [];
    eng._injectionStage({
        html: html || '', blocks: draft,
        total: draft.length, kept: draft.filter((b) => b && b.kept).length,
        gen: eng._genSeq,
    });
    return eng._injectionCommit(eng._genSeq);
}

/** 只跑构建、不提交（回执可取，读数不落地）—— 用于「回执少一条」的负控制。 */
function buildOnly(eng, recalled) {
    const html = eng.buildInjection(recalled);
    return { html, trace: eng._injectionTraceDraft, draft: eng._lastInjectionDraft };
}

const bigBlocks = (n, size) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ source: 'summary', text: '第' + i + '段 ' + '字'.repeat(size) });
    return out;
};

/* ═════════════════════════ A. 回执逐条：来源面 / 理由码 / 被裁 ═════════════════════════ */
test('v3438 A1. 回执逐块带来源面：每条都有 src，且来源**不是**凭块文本反推的空壳', () => {
    const eng = engineFrom(PIPE, { injectionBudget: 3000 });
    generate(eng, bigBlocks(6, 40));
    const blocks = eng._lastInjection.blocks;
    assert.ok(blocks.length > 0, '要有逐块读数');
    for (const b of blocks) {
        assert.strictEqual(typeof b.src, 'string', '# ' + b.id + ' 必须带来源面');
        assert.ok(b.src.length > 0, '# ' + b.id + ' 来源面不得为空串（那与「没归属」同形）');
    }
    /* 反向自证：这一轮的块**并非**全是 unattributed —— 否则「有 src 字段」这个断言
     *   能被一个恒返回 'unattributed' 的实现骗过（那等于没来源面）。 */
    const named = blocks.filter((b) => b.src !== 'unattributed').length;
    assert.ok(named > 0, '至少有一条真被归属过（否则字段只是摆设），实 ' + named + '/' + blocks.length);
    /* 未归属必须是一个**能说的词**，不是空串/undefined —— 下游按它分叉。 */
    const un = blocks.filter((b) => b.src === 'unattributed').length;
    assert.strictEqual(un, blocks.length - named, '归属与未归属必须互补穷尽');
});

test('v3438 A2. 来源面与逐块读数**同一份回执**：改乱来源面长度 ⇒ 逐条退回未归属（错位不许静默）', () => {
    const a = engineFrom(PIPE, { injectionBudget: 3000 });
    buildOnly(a, bigBlocks(6, 40));
    const named = (a._lastInjectionDraft || []).filter((b) => b && b.src && b.src !== 'unattributed').length;
    assert.ok(named > 0, '正常一轮应有已归属条目，实 ' + named);

    const b = engineFrom(PIPE, { injectionBudget: 3000 });
    const r = buildOnly(b, bigBlocks(6, 40));
    assert.ok(r.trace && r.trace.blockSources, '回执必须有来源面');
    assert.ok(Array.isArray(r.trace.blockSources.byInjectionOrder), '回执必须有按注入序的来源面');
    /* 破坏：把来源面截掉一半（规模自证必然不过）。重建逐块读数必须整片退回 unattributed，
     *   而不是按错位下标硬对 —— 那正是「来源面错一格，面板上看不出来」的形态。 */
    r.trace.blockSources.byInjectionOrder = r.trace.blockSources.byInjectionOrder.slice(0, 2);
    const rows = b._injectionBlocksOf(r.draft.map(() => 'x'), '');
    assert.ok(rows.length === 0 || rows.every((x) => x.src === 'unattributed'),
        '来源面规模对不上 ⇒ 逐条必须整片 unattributed，实 ' + JSON.stringify(rows.map((x) => x.src)));
});

test('v3438 A3. 「被裁」与「没命中」不同形：被裁条目的理由码可辨认，且不回填进 Kept', () => {
    /* 预算刚好不够：造一批块，让裁剪必然发生而又不是全裁。 */
    const eng = engineFrom(PIPE, { injectionBudget: 420, recallTierEnabled: false });
    generate(eng, bigBlocks(12, 60));
    const blocks = eng._lastInjection.blocks;
    const dropped = blocks.filter((b) => b && !b.kept);
    const kept = blocks.filter((b) => b && b.kept);
    assert.ok(kept.length > 0, '要留一部分（否则测不到「被裁 vs 保留」的对比）');
    assert.ok(dropped.length > 0, '预算刚好不够时必须有被裁条目，实 保留 ' + kept.length + ' / 候选 ' + blocks.length);
    for (const b of dropped) {
        assert.ok(b.reason === 'dropped-budget' || b.reason === 'truncated-partial',
            '被裁必须带可辨认理由码，实 ' + b.reason + '（# ' + b.id + '）');
        assert.notStrictEqual(b.reason, 'kept', '被裁条目不得被标成 kept（两态不同形）');
    }
    for (const b of kept) assert.strictEqual(b.reason, 'kept', '保留条目理由码为 kept');
    /* 被裁条目的名字要能读（否则「丢了什么」在面板上仍是一团空白） */
    for (const b of dropped) assert.ok(String(b.label || '').length > 0, '被裁条目必须有可读标签');
});

test('v3438 A4. 被裁条目**同时**出现在逐条读数与被裁计数里（O6 明写的验收）', () => {
    const eng = engineFrom(PIPE, { injectionBudget: 420, recallTierEnabled: false });
    generate(eng, bigBlocks(12, 60));
    const out = eng.buildInjectionReadout();
    assert.ok(out && Array.isArray(out.blocks), '外供面必须带逐条读数');
    const droppedFromRows = out.blocks.filter((b) => !b.kept).length;
    const tr = out.trace;
    assert.ok(tr && typeof tr === 'object', '外供面必须带本轮次的回执投影');
    /* 回执自报的裁剪事实（`trimmed` 三态）。这一轮是**真裁过**，故必须是 true 而不是 null。 */
    assert.strictEqual(tr.trimmed, true, '预算刚好不够 ⇒ 回执必须自报「裁过」，实 ' + String(tr.trimmed));
    /* 被裁计数（`stages.budgetTrimmed`）与逐条读数的被裁数**同源同值**：
     *   本仓最容易静默损失的一格，一旦两处不一致，面板就会报一个「看不见的被裁」。 */
    const st = tr.stages || {};
    assert.ok(Number.isFinite(st.budgetTrimmed), '被裁块数必须是真读数，实 ' + String(st.budgetTrimmed));
    assert.ok(st.budgetTrimmed > 0, '这一轮必须真的裁了东西，实 ' + st.budgetTrimmed);
    assert.strictEqual(st.budgetTrimmed, droppedFromRows,
        '★ 被裁计数必须等于逐条读数里的被裁条数（' + st.budgetTrimmed + ' vs ' + droppedFromRows + '）');
    /* 逐条与总数自洽。 */
    assert.strictEqual(out.kept, out.blocks.filter((b) => b.kept).length, 'kept 与逐条读数自洽');
    assert.strictEqual(out.total, out.blocks.length, 'total 与逐条读数自洽');
});

/* ═════════════════════════ B. 面板：列表 + 逐条可展开 + 显式被裁读数 ═════════════════════════ */
/** 把面板的注入视图段整段切出来求值（真跑渲染，不做字符串在场判定）。 */
function panelSection(src) {
    return slot(src, A_ROWS_HEAD, A_ROWS_TAIL, 'injection 视图逐条段');
}
/** 真求值：把逐条段包进函数，喂受控读数，取回 HTML。 */
function renderRows(src, extra) {
    const seg = panelSection(src);
    const escAttrLit = '(t) => String(t || \'\').replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\').replace(/"/g, \'"\')';
    const escLit = '(t) => String(t || \'\').replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\')';
    const fn = new Function('inj', 's', 'esc', 'escAttr',
        'let head = \'\';\n' + seg + '\nreturn head;');
    const e = extra || {};
    return fn(e.inj, e.s, (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '"'));
}
const rowOf = (b) => ({
    ref: 'inj_1_' + b.id, id: b.id, label: b.label, kept: b.kept,
    chars: b.chars, reason: b.reason, at: 0, via: 'trace', partial: !!b.partial,
    src: b.src || 'unattributed',
});

test('v3438 B1. 面板逐条可展开：每条一个 `<details>`，张数 = 回执条数（不多不少）', () => {
    const rows = [
        { id: 0, label: '第一块', kept: true, chars: 100, reason: 'kept', src: 'lockedFacts' },
        { id: 1, label: '第二块', kept: true, chars: 120, reason: 'kept', src: 'cse' },
        { id: 2, label: '第三块', kept: false, chars: 130, reason: 'dropped-budget', src: 'scene' },
    ];
    const inj = { total: 3, kept: 2, blocks: rows.map(rowOf) };
    const html = renderRows(UI, { inj, s: { _lastInjectionTrace: { trimmed: true, stages: { budgetTrimmed: 1 }, blockSources: { attribution: 'by-order', aligned: true, byInjectionOrder: rows.map((r) => r.src) }, sourceBlocks: { lockedFacts: 1, cse: 1, scene: 1 } } } });
    const n = html.split('<details').length - 1;
    assert.strictEqual(n, rows.length, '逐条张数必须等于回执条数（多出来的就是面板自己编的）');
    for (const r of rows) {
        assert.ok(html.includes('data-inj-row="' + r.id + '"'), '# ' + r.id + ' 必须有可点开的行');
        assert.ok(html.includes('data-inj-src="' + r.src + '"'), '# ' + r.id + ' 必须标来源面');
    }
    /* 每行都要能回答「凭什么进来」：判据来源（via）必须在展开体里。 */
    assert.ok(html.includes('凭什么判'), '每条展开体必须给判据来源');
    assert.ok(html.includes('trace'), 'via 取值必须现形（否则「凭什么」仍是一句空话）');
});

test('v3438 B2. 面板被裁读数三态不同形：真裁 / 没裁 / 不可测，且数字取自回执', () => {
    const rows = [
        { id: 0, label: 'A', kept: true, chars: 10, reason: 'kept', src: 'cse' },
        { id: 1, label: 'B', kept: false, chars: 20, reason: 'dropped-budget', src: 'scene' },
    ];
    const mk = (trimmed) => renderRows(UI, {
        inj: { total: 2, kept: 1, blocks: rows.map(rowOf) },
        s: { _lastInjectionTrace: { trimmed, stages: {}, blockSources: { attribution: 'by-order', aligned: true, byInjectionOrder: ['cse', 'scene'] }, sourceBlocks: { cse: 1, scene: 1 } } },
    });
    const t = mk(true), f = mk(false), u = mk(null);
    assert.notStrictEqual(t, f, '真裁 与 没裁 必须不同形');
    assert.notStrictEqual(f, u, '没裁 与 不可测 必须不同形');
    assert.notStrictEqual(t, u, '真裁 与 不可测 必须不同形');
    /* 不可测态**不许**出现「0 条」这类具体数字（那是把测不了写成读数） */
    assert.ok(!/被裁\s*<b>0<\/b>/.test(u), '不可测态不得显示「被裁 0 条」');
    assert.ok(/不可测/.test(u), '不可测态必须自己说不可测');
    /* 真裁态必须给出与回执同源的数字 */
    assert.ok(/被裁\s*<b>1<\/b>/.test(t), '真裁态必须报出被裁条数（取自逐条读数），实 ' + t.slice(0, 400));
    assert.ok(/data-inj-trim="trimmed"/.test(t), '真裁态必须带机器可判标记');
    assert.ok(/data-inj-trim="within-budget"/.test(f), '没裁态必须带另一个标记（两态不同标记）');
    assert.ok(/data-inj-trim="unknown"/.test(u), '不可测态必须带第三个标记');
});

test('v3438 B3. 来源面归属手法必须**自述**在读数旁：按拼装顺序推定 != 语义归属', () => {
    const rows = [{ id: 0, label: 'A', kept: true, chars: 10, reason: 'kept', src: 'cse' }];
    const html = renderRows(UI, {
        inj: { total: 1, kept: 1, blocks: rows.map(rowOf) },
        s: { _lastInjectionTrace: { trimmed: false, stages: {}, blockSources: { attribution: 'by-order', aligned: true, byInjectionOrder: ['cse'] }, sourceBlocks: { cse: 1 } } },
    });
    /* 面板必须把「按拼装顺序推定」这句话摆出来 —— 否则读的人会把来源列当结论。 */
    assert.ok(/拼装顺序推定/.test(html), '必须自述归属手法');
    /* 未对齐时必须**明写**不可用作结论（而非悄悄照样显示来源）。 */
    const bad = renderRows(UI, {
        inj: { total: 1, kept: 1, blocks: rows.map(rowOf) },
        s: { _lastInjectionTrace: { trimmed: false, stages: {}, blockSources: { attribution: 'by-order', aligned: false, byInjectionOrder: ['cse'] }, sourceBlocks: { cse: 1 } } },
    });
    assert.notStrictEqual(bad, html, '对齐与未对齐必须不同形');
    assert.ok(/不可用作结论/.test(bad), '未对齐必须明写「不可用作结论」');
    /* 完全没有回执时，来源列必须如实退成「没归属」，不许编。 */
    const none = renderRows(UI, { inj: { total: 1, kept: 1, blocks: rows.map(rowOf) }, s: {} });
    assert.ok(/来源面不可用/.test(none), '无回执时必须明写来源面不可用');
    assert.ok(/data-inj-src="cse"/.test(none), '逐条来源列仍应显示回执给的 src（面板不二次推断）');
});

/* ═════════════════════════ C. 单源纪律：面板不重算 ═════════════════════════ */
test('v3438 C1. 面板不按预算重算：整段里没有预算算术，只有读回执', () => {
    const seg = panelSection(UI);
    /* 面板段内不得出现「按预算自己算丢弃数」的算术（`total - kept` / `budget -` 之类）。
     *   这是 O6 明令禁止的解法：重算就是第二套真源，必然与回执漂移。 */
    assert.ok(!/total\s*-\s*inj\.kept|inj\.total\s*-\s*_keptN|budget\s*-\s*\w+\.length/.test(seg),
        '面板段内不得做预算算术（必须读回执）');
    assert.ok(/trimmed/.test(seg), '面板必须读回执的 trimmed 三态');
    assert.ok(!/injectionBudget/.test(seg), '面板段内不得读配置预算自己重算');
});

test('v3438 C2. 回执投影单源：外供面 trace 与读数同一次提交落地（不现读 draft）', () => {
    /* 单源纪律：投影**一处在落**（提交时快照），外供面只搬运。
     *   若外供面现读 `_injectionTraceDraft`，那么下一次 buildInjection（含诊断 dry-run）
     *   会把「这一轮用了什么」换成别人的回执。 */
    assert.ok(countOf(PIPE, A_PROJ_HEAD) === 1, '投影必须只有一个定义点');
    assert.ok(countOf(PIPE, A_STAGE_TRACE) === 1, '暂存时快照回执必须恰一处');
    assert.ok(countOf(PIPE, A_COMMIT_TRACE) === 1, '提交时落地回执必须恰一处');
    const readout = slot(PIPE, 'buildInjectionReadout() {', 'trace: (this._lastInjectionTrace && typeof this._lastInjectionTrace', 'buildInjectionReadout');
    assert.ok(!readout.includes('_injectionTraceDraft'),
        '★ 外供面不得现读 draft（那会把别的路的回执当成这一轮）');
    /* 反向自证：外供面确实带上了回执（少这一格 = 下游只能拿到 id/kept = O6 禁止的解法）。
     *   这一格由上面那条终点锚点**亲自**证明在场：锚点即搬运语句本身。 */
    assert.strictEqual(countOf(PIPE, A_TRACE_READOUT), 1, '外供面必须搬运已落地的回执快照（恰一处）');
});

/* ═════════════════════════ D. 破坏负控制（真源码破坏 → 同款判据翻红） ═════════════════════════ */
test('v3438 D1. 负控制：回执少一条 ⇒ 面板与它同源（不多出来），但被裁计数与逐条不一致 ⇒ 判据红', () => {
    /* 真跑一轮，拿到基线。 */
    const base = engineFrom(PIPE, { injectionBudget: 420, recallTierEnabled: false });
    generate(base, bigBlocks(12, 60));
    const out = base.buildInjectionReadout();
    const droppedB = out.blocks.filter((b) => !b.kept).length;
    assert.ok(droppedB > 0, '基线必须有被裁条目，实 ' + droppedB);
    assert.strictEqual(out.trace.stages.budgetTrimmed, droppedB, '基线两处被裁数一致');

    /* 破坏（真源码级）：把外供面逐块清单**砍掉一条被裁块**（模拟「回执少一条」）。
     *   注意这里破坏的是**真源码里那条 map 的输入**——用一份被截短的回执重新走真 readout。 */
    const broken = Object.assign(Object.create(Object.getPrototypeOf(base)), base);
    broken._lastInjection = Object.assign({}, base._lastInjection, {
        blocks: base._lastInjection.blocks.filter((b) => b.kept || b.id !== (base._lastInjection.blocks.find((x) => !x.kept) || {}).id),
    });
    const out2 = broken.buildInjectionReadout();
    const dropped2 = out2.blocks.filter((b) => !b.kept).length;
    assert.strictEqual(dropped2, droppedB - 1, '破坏必须真的少了一条被裁块（否则这条负控制没生效）');
    /* 同款判据在破坏副本上重跑：必须红。 */
    assert.notStrictEqual(out2.trace.stages.budgetTrimmed, dropped2,
        '★ 同款判据必须翻红：回执少一条后，被裁计数与逐条读数不得再自洽');
});

test('v3438 D2. 负控制：真源码破坏来源面标注 ⇒ 「至少一条真被归属」判据红', () => {
    /* 破坏方式：把 `_countSource` 里标源那行改成恒不标（真源码级、锚点唯一）。
     *   破坏后每次 `_blockSrc` 只填 'unattributed'，于是 A1 的「至少一条真被归属」必然红。 */
    const lit = 'for (let _i = _srcSegEnd; _i < blocks.length; _i++) _blockSrc[_i] = key;';
    assert.strictEqual(countOf(PIPE, lit), 1, '破坏锚点必须在真源码里恰一处（否则破坏无从谈起）');
    const broken = PIPE.replace(lit, 'for (let _i = _srcSegEnd; _i < blocks.length; _i++) _blockSrc[_i] = \'unattributed\';');
    assert.notStrictEqual(broken, PIPE, '破坏必须真的改了源码');
    const eng = engineFrom(broken, { injectionBudget: 3000 });
    generate(eng, bigBlocks(6, 40));
    const named = (eng._lastInjection.blocks || []).filter((b) => b.src && b.src !== 'unattributed').length;
    assert.strictEqual(named, 0, '★ 同款判据必须翻红：破坏后不得有任何一条被归属，实 ' + named);
    /* 且原本的 A1 判据（named > 0）此刻必然失败 —— 这正是它存在的意义。 */
    assert.ok(!(named > 0), 'A1 判据在破坏副本上必须为假');
});

test('v3438 D3. 负控制：面板把「被裁」写成「没命中」⇒ 两态不同形判据红', () => {
    /* 破坏方式：把面板里被裁条目的理由码渲染改成「未命中」（真源码级、锚点唯一）。
     *   这正对应计划里点名的禁止解法：「把被裁当成没命中」。 */
    const lit = "if (k === 'dropped-budget') return '被预算裁掉';";
    assert.strictEqual(countOf(UI, lit), 1, '破坏锚点必须在真源码里恰一处');
    const broken = UI.replace(lit, "if (k === 'dropped-budget') return '未命中';");
    const rows = [
        { id: 0, label: 'A', kept: true, chars: 10, reason: 'kept', src: 'cse' },
        { id: 1, label: 'B', kept: false, chars: 20, reason: 'dropped-budget', src: 'scene' },
    ];
    const okHtml = renderRows(UI, {
        inj: { total: 2, kept: 1, blocks: rows.map(rowOf) },
        s: { _lastInjectionTrace: { trimmed: true, stages: { budgetTrimmed: 1 }, blockSources: { attribution: 'by-order', aligned: true, byInjectionOrder: ['cse', 'scene'] }, sourceBlocks: { cse: 1, scene: 1 } } },
    });
    const badHtml = renderRows(broken, {
        inj: { total: 2, kept: 1, blocks: rows.map(rowOf) },
        s: { _lastInjectionTrace: { trimmed: true, stages: { budgetTrimmed: 1 }, blockSources: { attribution: 'by-order', aligned: true, byInjectionOrder: ['cse', 'scene'] }, sourceBlocks: { cse: 1, scene: 1 } } },
    });
    assert.ok(/被预算裁掉/.test(okHtml), '原版必须说「被预算裁掉」');
    assert.ok(/未命中/.test(badHtml), '破坏版确实变成了「未命中」');
    assert.ok(!/被预算裁掉/.test(badHtml), '★ 同款判据必须翻红：破坏后不得再出现「被裁」措辞');
    /* 且逐条行上的机器标记也必须跟着变（面板不能只在人话上撒谎）。 */
    const badRow = badHtml.slice(badHtml.indexOf('data-inj-row="1"'), badHtml.indexOf('data-inj-row="1"') + 900);
    assert.ok(/未命中/.test(badRow), '被裁行的理由码必须现形为破坏后的文案');
});

/* ═════════════════════════ E. 锚点自证 ═════════════════════════ */
test('v3438 E1. 锚点自证：本套件切出来的段确实含判据要读的每一格', () => {
    const seg = panelSection(UI);
    assert.ok(seg.includes('data-inj-list'), '逐条段必须含清单容器');
    assert.ok(seg.includes('data-inj-trim'), '逐条段必须含被裁读数格');
    assert.ok(seg.includes('_lastInjectionTrace'), '逐条段必须读已落地的回执快照');
    assert.ok(seg.includes('inj.blocks'), '逐条段必须读逐块读数');
    const proj = slot(PIPE, A_PROJ_HEAD, A_PROJ_TAIL, '投影段');
    for (const k of ['trimmed', 'stages', 'blockSources', 'sourceBlocks', 'fusedSourceBlocks', 'layer']) {
        assert.ok(proj.includes(k + ':'), '投影必须带 ' + k + '（少一格 = 下游该面缺失）');
    }
    /* 破坏锚点自证：三个锚点都必须在真源码里恰一处 —— 否则 D2/D3 的破坏对象可能是错的。 */
    assert.strictEqual(countOf(PIPE, 'for (let _i = _srcSegEnd; _i < blocks.length; _i++) _blockSrc[_i] = key;'), 1);
    assert.strictEqual(countOf(UI, "if (k === 'dropped-budget') return '被预算裁掉';"), 1);
    assert.strictEqual(countOf(PIPE, '_injectionTraceProjection() {'), 1);
});
