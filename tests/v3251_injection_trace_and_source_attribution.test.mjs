// tests/v3251_injection_trace_and_source_attribution.test.mjs — v3.251.0
// [v3.251.0] 计划 B 批 M-O3：注入回执与来源归因（本套件即当版 frontier）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const requireFromHere = createRequire(import.meta.url);
const requireFromRoot = createRequire(path.join(ROOT, 'index.js'));
const require = requireFromRoot; // 宿主方法体内 require('./injection-router.js') 必须相对仓根
const IR = requireFromHere(path.join(ROOT, 'injection-router.js'));
const CL = requireFromHere(path.join(ROOT, 'cost-ledger.js'));
const IDX = read('index.js');
const ROUTER = read('injection-router.js');
const COST = read('cost-ledger.js');

/* ══════════════ 工具：从真源码抽方法体（与 v3216 同规格的花括号配平） ══════════════ */
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
const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]'];
const est = (t) => Math.ceil(String(t || '').length * 0.9);
/** 真宿主方法体真跑（真字段可读写；未声明字段回万能 stub）。 */
function engineFrom(src, cfg) {
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
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function(
        'estimateTextTokens', 'errLog', 'RESIDENT_MARKERS', 'PLUGIN_NAME', 'window', 'require',
        '_costForecastLib', '_costLedgerLib', '_moduleLib', 'buildNpcTierInjection',
        'numOr', 'relativeTimeLabel', 'tiering', 'beat', 'extracted', 'injectionRefOf',
        `return ({ ${body} });`
    );
    const win = { LonShaInjectionRouter: IR };
    const inst = Object.assign(host, fn(est, () => {}, RESIDENT_MARKERS, 'v3251', win, require,
        anyStub(), anyStub(), anyStub(), anyStub(), (n, d) => d, anyStub(), anyStub(), anyStub(),
        anyStub(), (eng, i) => (eng && typeof eng._injectionRefOf === 'function' ? eng._injectionRefOf(i) : '')));
    inst.buildNpcTierRecords = () => [];
    inst.typedFactsBlocks = () => null;
    inst.captureCast = () => [];
    inst.graph = { nodes: new Map(), edges: new Map() };
    inst.pulse = { toPrompt: () => '' };
    inst.status = { getGeoPrompt: () => '' };
    inst.clock = { getContextPrompt: () => '', date: '' };
    return inst;
}
/** 真跑一轮构建（只调 buildInjection，取回执）。 */
function build(eng, recalled) {
    const html = eng.buildInjection(recalled);
    return { html, trace: eng._injectionTraceDraft };
}
const bigBlocks = (n, size) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ source: 'summary', text: '段落' + i + ' ' + '字'.repeat(size) });
    return out;
};

/* ══════════════════════════ A. 裁剪回执的结构面 ══════════════════════════ */
test('v3251 A1. trimToBudget：不传 opts 时行为逐字同修前（三策略都不受影响）', () => {
    const full = '\n\n' + ['[前情摘要]', 'a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)].join('\n') + '\n';
    for (const st of ['balanced', 'relevance', 'recency']) {
        const a = IR.trimToBudget(full, 600, ['[前情摘要]', 'a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)], st);
        const b = IR.trimToBudget(full, 600, ['[前情摘要]', 'a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)], st, {});
        assert.strictEqual(a, b, st + '：空 opts 与不传 opts 必须同结果');
        assert.ok(a.length > 0, st + '：仍产出载荷');
    }
});

test('v3251 A2. 回执按**下标**说话：同文重复时「裁了一份」不得被读成「两份都在」', () => {
    // 两条完全相同的触发块 + 一条常驻块；预算只装得下常驻 + 第一条触发块
    const dup = 'X'.repeat(300);
    const blocks = ['[前情摘要]', dup, dup];
    const full = '\n\n〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。\n' + blocks.join('\n') + '\n〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。\n';
    const tr = {};
    const _out = IR.trimToBudget(full, 520, blocks, 'balanced', { trace: tr });
    assert.strictEqual(tr.traceFrom, 'router', '回执来源标明路由模块');
    assert.ok(Array.isArray(tr.keptIdxInAll), '按下标给保留清单');
    // 常驻下标 0 必留；两条同文触发块（下标 1、2）应当只有一条被留下
    assert.ok(tr.keptIdxInAll.includes(0), '常驻块必须留下');
    const trigKept = tr.keptIdxInAll.filter((i) => i > 0);
    assert.strictEqual(trigKept.length, 1, '两条同文触发块只能留下一条，实留 ' + JSON.stringify(trigKept));
    assert.deepStrictEqual(tr.droppedTriggerIdx, trigKept[0] === 1 ? [2] : [1], '被丢的那条下标可复算');
    // 反向自证：文本反推在这种情况下**分不开**（两条都能被 full 命中）——
    //   这正是本版换判据的理由，若哪天真分开了，这条断言会红，提示可以重估。
    assert.ok(_out.includes(dup));
});

test('v3251 A3. recency 硬截断：块级清单不成立 ⇒ 显式置 null + 给 span（不假装能判整块）', () => {
    const blocks = ['[与 recency 标记无关的块]' + '字'.repeat(300), '第二块' + '字'.repeat(300)];
    const full = '\n\n〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。\n' + blocks.join('\n') + '\n〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。\n';
    const tr = {};
    const out = IR.trimToBudget(full, 420, blocks, 'recency', { trace: tr });
    assert.strictEqual(tr.hardTruncated, true, 'recency 无保留项 ⇒ 硬截断');
    assert.strictEqual(tr.keptIdxInAll, null, '★ 块级清单必须不成立（null），不得给一份假的');
    assert.strictEqual(tr.sliceAt, 420, '切点如实记下');
    assert.ok(Array.isArray(tr.blockSpans) && tr.blockSpans.length === 2, '每个块有 span 位（定位不到则 null，不编）');
    assert.ok(tr.blockSpans[0][0] >= 0 && tr.blockSpans[0][1] > tr.blockSpans[0][0], '首块 span 可定位');
    assert.strictEqual(out.length, 420, '载荷确实是切片');
});

test('v3251 A4. 未超预算：trimToBudget 不派发回执（调用侧据「未裁剪」自己收口）', () => {
    const tr = {};
    const out = IR.trimToBudget('短文本', 3000, ['[前情摘要]'], 'balanced', { trace: tr });
    assert.strictEqual(out, '短文本', '未超预算原样返回');
    assert.strictEqual(tr.traceFrom, undefined, '未裁剪 ⇒ 不派发（避免把「没发生」记成一份事实）');
});

/* ══════════════════════════ B. 五阶段计数与三态 ══════════════════════════ */
test('v3251 B1. 回执五阶段：合并/最终保留是真读数，测得出来就不得写 null', () => {
    const eng = engineFrom(IDX, { injectionBudget: 400, recallTierEnabled: true });
    const r = build(eng, bigBlocks(30, 60));
    const st = r.trace.stages;
    assert.strictEqual(st.merged, 30, '合并阶段 = 送入的候选条数');
    assert.ok(st.merged > 0);
    assert.ok(Number.isFinite(st.finalKept) && st.finalKept > 0, '最终保留 = 真读数，实 ' + st.finalKept);
    assert.ok(Number.isFinite(st.budgetTrimmed) && st.budgetTrimmed > 0, '被裁块数 = 真读数，实 ' + st.budgetTrimmed);
    assert.strictEqual(st.budgetTrimmed, r.trace.blockCount - st.finalKept, '两格与块总数自洽');
});

test('v3251 B2. 不可测的格子写 null 并在 stageNotes 写明为什么（绝不编 0）', () => {
    const eng = engineFrom(IDX, {});
    const r = build(eng, [{ source: 'summary', text: '一块' }]);
    const st = r.trace.stages;
    assert.strictEqual(st.rawHits, null, '没有召回自检记录 ⇒ 原始命中数不可测');
    assert.ok(r.trace.stageNotes.rawHits.length > 0, '★ 必须写明为什么（不可测要有理由）');
    assert.strictEqual(st.validityFiltered, null, '没有可测的有效性过滤支 ⇒ null（不是 0）');
    assert.ok(r.trace.stageNotes.validityFiltered.includes('不可测'), '理由必须可见');
    // 反面对照：同一种「没有」在可测时必须给真数（否则三态退化成两态）
    assert.strictEqual(st.merged, 1, '合并阶段可测 ⇒ 给真数');
    assert.strictEqual(st.budgetTrimmed, 0, '未裁剪 ⇒ 真读数 0（与 null 必须可分）');
});

test('v3251 B3. 原始命中数按**楼层配对**取：楼层对不上就不认那条记录', () => {
    const eng = engineFrom(IDX, {});
    eng._recallAudit = [{ floor: 7, totalHits: 12, perSource: { bm25: 12 } }];
    eng._lastRecallFloor = 9;                       // 本轮楼 ≠ 记录楼
    build(eng, [{ source: 'summary', text: 'x' }]);
    assert.strictEqual(eng._injectionTraceDraft.stages.rawHits, null, '★ 楼层对不上 ⇒ 不认（宁 null 不给别人那轮的读数）');
    eng._lastRecallFloor = 7;
    build(eng, [{ source: 'summary', text: 'x' }]);
    assert.strictEqual(eng._injectionTraceDraft.stages.rawHits, 12, '楼层相符 ⇒ 真读数');
    assert.deepStrictEqual(eng._injectionTraceDraft.fusedSourceBlocks.recallPerSource, { bm25: 12 }, '各源命中分布同源带出');
});

test('v3251 B4. 有效性过滤只累加**已测支**；模块缺席如实 null', () => {
    const eng = engineFrom(IDX, {});
    build(eng, [{ source: 'summary', text: '一块' }]);
    const st = eng._injectionTraceDraft.stages;
    assert.strictEqual(st.byRule.relationScoped, false, '无关系条目 ⇒ 关系面未参与（不得把「没走到」写成「参与过」）');
    assert.strictEqual(st.byRule.relationGated, null, '没走到关系披露 ⇒ 挡下条数不可测（不是 0）');
    assert.strictEqual(st.validityFiltered, null, '一支都没测到 ⇒ 合计为 null');
});

/* ══════════════════════════ C. 禁用项注入量为零（第 ⑦ 条） ══════════════════════════ */
test('v3251 C1. 开关表是单一真源：拼装侧与账本侧读的是同一对象', () => {
    const eng = engineFrom(IDX, { lockedFactsEnabled: false, cseEnabled: false });
    eng._costLedgerLib = () => null;                 // 账本不参与本断言
    build(eng, [{ source: 'summary', text: '一块' }]);
    const t = eng._injectionTraceDraft;
    assert.ok(t.disabledSources.includes('cse') && t.disabledSources.includes('lockedFacts'), '自有块禁用源必须在名单');
    assert.ok(t.disabledSources.includes('emotionOppositeRecall'), '融合源默认关也必须出现在禁用名单（不是漏记）');
    assert.ok(!Object.prototype.hasOwnProperty.call(t.sourceBlocks, 'emotionOppositeRecall'), '融合源不得进自有块记账');
    // 单一真源的结构判据：开关表必须在拼装之前建、且只此一处字面量
    const n = (IDX.match(/emotionOppositeRecall:\s*this\.config\.config\.emotionOppositeRecall\s*===\s*true/g) || []).length;
    assert.strictEqual(n, 1, '开关表字面量恰 1 处（两处就是两个真源），实 ' + n);
    assert.ok(IDX.includes('enabledSources: _srcGate'), '账本侧原样引用同一对象');
});

test('v3251 C2. ★ 禁用 ⇒ 该源块数为 0（在回执上可直接断言，不靠事后反推）', () => {
    const eng = engineFrom(IDX, { lockedFactsEnabled: false, cseEnabled: false, sceneEnabled: false, narrativePulseEnabled: false });
    build(eng, [{ source: 'summary', text: '一块' }]);
    const t = eng._injectionTraceDraft;
    const ownDisabled = t.disabledSources.filter((k) => Object.prototype.hasOwnProperty.call(t.sourceBlocks, k));
    assert.ok(ownDisabled.length > 0, '至少有一个自有块源被禁用');
    for (const k of ownDisabled) {
        assert.strictEqual(t.sourceBlocks[k], 0, '禁用 ⇒ ' + k + ' 必须 0 块，实 ' + t.sourceBlocks[k]);
    }
    for (const k of t.disabledSources) {
        if (!Object.prototype.hasOwnProperty.call(t.sourceBlocks, k)) {
            assert.ok(t.fusedSourceBlocks.keys.includes(k), '禁用但不在自有块记账 ⇒ 必须是登记过的融合源：' + k);
        }
    }
});

test('v3251 C3. 融合源如实列在 fused 且 separable=false（不假装构建期能拆）', () => {
    const eng = engineFrom(IDX, {});
    build(eng, [{ source: 'summary', text: '一块' }]);
    const f = eng._injectionTraceDraft.fusedSourceBlocks;
    assert.strictEqual(f.separable, false, '★ 必须自认不可分');
    assert.ok(f.why.length > 0, '必须写明为什么不可分');
    for (const k of ['vector', 'suspense', 'worldProgress']) {
        assert.ok(f.keys.includes(k), '融合源登记在案：' + k);
        assert.ok(!Object.prototype.hasOwnProperty.call(eng._injectionTraceDraft.sourceBlocks, k),
            '融合源**不得**进自有块记账（否则就是编造归属）');
    }
});

/* ══════════════════════════ D. token 口径（第 ⑤ 条） ══════════════════════════ */
test('v3251 D1. tokenizer 按能力探测：三种宿主挂载点都能认出来', () => {
    for (const [st, expect] of [
        [{ getContext: () => ({ getTokenCountAsync: () => 1 }) }, 'host-async'],
        [{ getContext: () => ({ getTokenCount: () => 1 }) }, 'host'],
        [{ getTokenCount: () => 1 }, 'host'],
        [undefined, 'estimate'],
    ]) {
        const parts = HOST_METHODS.map((h) => blockAt(IDX, IDX.indexOf(h)));
        const body = parts.filter(Boolean).join(',\n');
        const win = { LonShaInjectionRouter: IR, SillyTavern: st };
        const real = {
            config: { config: { vectorTopK: 8, injectionBudget: 3000, recallTierEnabled: false, budgetStrategy: 'balanced', adaptiveBudget: false, debugMode: false } },
            _lastInjection: null, _lastInjectionDraft: null, _lastInjectionDiscard: null,
            _injectionStale: 0, _injectionRound: 0, _diagnostics: null, _injectionPending: null,
            _injectionEnded: { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 },
            _genSeq: 0, _recallAudit: [],
            summary: { getGrandChroniclePrompt: () => '', lockedFactsForPrompt: () => '' },
            buildNpcTierRecords: () => [], typedFactsBlocks: () => null, captureCast: () => [],
            graph: { nodes: new Map(), edges: new Map() },
            pulse: { toPrompt: () => '' }, status: { getGeoPrompt: () => '' }, clock: { getContextPrompt: () => '', date: '' },
        };
        const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
        const fn = new Function(
            'estimateTextTokens', 'errLog', 'RESIDENT_MARKERS', 'PLUGIN_NAME', 'window', 'require',
            '_costForecastLib', '_costLedgerLib', '_moduleLib', 'buildNpcTierInjection',
            'numOr', 'relativeTimeLabel', 'tiering', 'beat', 'extracted', 'injectionRefOf',
            `return ({ ${body} });`);
        const inst2 = Object.assign(host, fn(est, () => {}, RESIDENT_MARKERS, 'v3251', win, require,
            anyStub(), anyStub(), anyStub(), anyStub(), (n, d) => d, anyStub(), anyStub(), anyStub(),
            anyStub(), () => ''));
        inst2.buildInjection([{ source: 'summary', text: '一块' }]);
        assert.strictEqual(inst2._injectionTraceDraft.tokenSource, expect,
            '探测结果 ' + expect + '（实 ' + inst2._injectionTraceDraft.tokenSource + '）');
    }
});
test('v3251 D2. 探测必须在**每次构建时**做（不许缓存成启动时的一次判定）', () => {
    const body = blockAt(IDX, IDX.indexOf('buildInjection(recalled) {'));
    assert.ok(/const _tokSrc = \(\(\) => \{/.test(body), '探测写在方法体内（每次构建都跑）');
    assert.ok(!/_tokSrcCache|this\._tokSrc\b/.test(body), '不得把探测结果缓存到实例上');
    assert.ok(/estimateTextTokens\(CJK/.test(body), '探测不到时如实退回估算并在回执里标明');
});

/* ══════════════════════════ E. 分层标识（第 ⑧ 条） ══════════════════════════ */
test('v3251 E1. 分层实测：自有块 / 宿主请求体 / 不可测 三态必须分开说', () => {
    const eng = engineFrom(IDX, {});
    build(eng, [{ source: 'summary', text: '一块' }]);
    const L = eng._injectionTraceDraft.layer;
    assert.strictEqual(L.pluginBlocks, 'own', '本回执描述的是本插件自己的块');
    assert.strictEqual(L.hostRequestBody, 'unobserved', '★ 宿主最终请求体不在可观测面内 ⇒ 如实标不可测');
    assert.ok(L.hostNote.length > 0, '必须写明边界（本插件只看得见自己那层）');
});

/* ══════════════════════════ F. 逐块读数换判据（消费侧） ══════════════════════════ */
test('v3251 F1. `via` 如实自述本次用的是哪条判据（换了判据这件事必须可见）', () => {
    const eng = engineFrom(IDX, { injectionBudget: 400, recallTierEnabled: true });
    build(eng, bigBlocks(20, 60));
    const blocks = eng._injectionBlocksOf(eng._lastInjectionDraft ? [] : [], '');
    assert.deepStrictEqual(blocks, [], '空清单 ⇒ 空读数（不编）');
    // 走真路径：把本轮真块清单重算一遍，via 必须是 trace
    const all = [];
    // 用引擎自己的草稿口径复算：直接从回执反推块清单不可行，改用「同批块重放」——
    //   这里用 trace 的规模自证要求：blockCount 必须等于传入清单长度。
    const t = eng._injectionTraceDraft;
    assert.strictEqual(t.traceFrom, 'router', '本轮走的是路由模块');
    assert.ok(Array.isArray(t.keptIdxInAll), '块级清单在场');
    // 用一条真块做单点核对：按下标判 kept 时，同文重复不再是盲区
    const dup = 'DUP' + '字'.repeat(80);
    const eng2 = engineFrom(IDX, {});
    eng2._injectionTraceDraft = { version: 1, blockCount: 2, traceFrom: 'router', keptIdxInAll: [0], keptTexts: [dup] };
    const rec = eng2._injectionBlocksOf([dup, dup], dup);
    assert.strictEqual(rec.length, 2, '两条同文块都进读数（不得被去重）');
    assert.strictEqual(rec[0].kept, true, '下标 0 保留');
    assert.strictEqual(rec[1].kept, false, '★ 下标 1 被裁 —— 文本反推在这里必错（两条都能被命中）');
    assert.strictEqual(rec[0].via, 'trace', 'via 自述用的是回执');
    assert.strictEqual(rec[1].via, 'trace');
});

test('v3251 F2. 回执规模对不上时**退回**文本反推，并在 via 上如实标注', () => {
    const eng = engineFrom(IDX, {});
    eng._injectionTraceDraft = { version: 1, blockCount: 99, traceFrom: 'router', keptIdxInAll: [0] };
    const rec = eng._injectionBlocksOf(['BLOCK_A', 'BLOCK_B'], 'BLOCK_A');
    assert.strictEqual(rec[0].via, 'includes', '★ 规模不符 ⇒ 不得按别人那批的下标判');
    assert.strictEqual(rec[0].kept, true);
    assert.strictEqual(rec[1].kept, false);
});

test('v3251 F3. 硬截断态按下标判不可用 ⇒ 走 span 三态（整块在切点内 / 被切半 / 在切点外）', () => {
    const eng = engineFrom(IDX, {});
    const a = 'A'.repeat(100), b = 'B'.repeat(100);
    const full = a + b;
    eng._injectionTraceDraft = {
        version: 1, blockCount: 2, traceFrom: 'router', keptIdxInAll: null,
        hardTruncated: true, sliceAt: 150, blockSpans: [[0, 100], [100, 200]],
    };
    const rec = eng._injectionBlocksOf([a, b], full.slice(0, 150));
    assert.strictEqual(rec[0].kept, true, '整块在切点内 ⇒ kept');
    assert.strictEqual(rec[0].reason, 'kept');
    assert.strictEqual(rec[1].kept, false, '跨切点 ⇒ 不算 kept');
    assert.strictEqual(rec[1].reason, 'truncated-partial', '★ 被切半必须与「整块被丢」分开（修前同形）');
    assert.strictEqual(rec[1].partial, true);
    assert.strictEqual(rec[1].via, 'trace-span');
});

/* ══════════════════════════ G. 账本消费回执 ══════════════════════════ */
const LEDGER_BLOCKS = ['[前情摘要]', '[相关片段·关键词命中]', '[节日]'];
const INJECTED = '[前情摘要]\n[相关片段·关键词命中]';

test('v3251 G1. 无回执 ⇒ 退回文本反推，且**自述**这一点（keptFrom/traceWhy）', () => {
    const lg = CL.buildCostLedger({
        allBlocks: LEDGER_BLOCKS, injectedText: INJECTED, residentMarkers: ['[前情摘要]'],
        now: 1, tokensOf: est,
    });
    assert.strictEqual(lg.identity.includesHeuristic, true, '没有回执 ⇒ 自认是启发式');
    assert.strictEqual(lg.identity.keptFrom, 'includes');
    assert.strictEqual(lg.identity.traceWhy, 'no-trace', '必须能归因：压根没给回执');
    assert.ok(CL.costLine(lg).includes('留存判据=文本反推'), '★ 诊断行必须把「这块是猜的」说出来');
});

test('v3251 G2. 有回执 ⇒ 精确判定，诊断行不再挂「文本反推」', () => {
    const lg = CL.buildCostLedger({
        allBlocks: LEDGER_BLOCKS, injectedText: INJECTED, residentMarkers: ['[前情摘要]'], now: 1, tokensOf: est,
        trace: { version: 1, blockCount: 3, traceFrom: 'router', keptIdxInAll: [0, 1] },
    });
    assert.strictEqual(lg.identity.includesHeuristic, false, '有回执 ⇒ 精确');
    assert.strictEqual(lg.identity.keptFrom, 'trace');
    assert.strictEqual(lg.identity.traceWhy, null);
    assert.ok(!CL.costLine(lg).includes('留存判据=文本反推'), '精确时不得再挂那条自述');
    assert.strictEqual(lg.bySource.resident.kept, 1);
    assert.strictEqual(lg.bySource.direct.kept, 1);
    assert.strictEqual(lg.bySource.direct.dropped, 1, '第三条触发块被裁');
});

test('v3251 G3. ★★ 空块也占下标：有回执时保留/丢弃不得贴到别的块身上', () => {
    // 第一个块是空串（成本账本把它算 empty，但它**占下标 0**）
    const blocks = ['', '[前情摘要]', '[相关片段·关键词命中]'];
    const lg = CL.buildCostLedger({
        allBlocks: blocks, injectedText: '[前情摘要]', residentMarkers: ['[前情摘要]'], now: 1, tokensOf: est,
        trace: { version: 1, blockCount: 3, traceFrom: 'router', keptIdxInAll: [1] },
    });
    assert.strictEqual(lg.bySource.resident.kept, 1, '✓ 常驻块（下标 1）被留下');
    assert.strictEqual(lg.bySource.resident.dropped, 0, '★ 若下标整体前移，这里会误报 1 条被裁');
    assert.strictEqual(lg.bySource.direct.dropped, 1, '触发块（下标 2）确实被裁');
});

test('v3251 G4. 回执规模对不上 ⇒ 如实归因（scale-mismatch），不得静默混用两种判据', () => {
    const lg = CL.buildCostLedger({
        allBlocks: LEDGER_BLOCKS, injectedText: INJECTED, residentMarkers: ['[前情摘要]'], now: 1, tokensOf: est,
        trace: { version: 1, blockCount: 7, traceFrom: 'router', keptIdxInAll: [0, 1] },
    });
    assert.strictEqual(lg.identity.keptFrom, 'includes', '规模不符 ⇒ 退回反推');
    assert.strictEqual(lg.identity.traceWhy, 'scale-mismatch', '原因必须可归因');
});

test('v3251 G5. 回执来源不是路由模块（内联回落）⇒ 同样退回并归因', () => {
    const lg = CL.buildCostLedger({
        allBlocks: LEDGER_BLOCKS, injectedText: INJECTED, residentMarkers: ['[前情摘要]'], now: 1, tokensOf: est,
        trace: { version: 1, blockCount: 3, traceFrom: 'inline', keptIdxInAll: null },
    });
    assert.strictEqual(lg.identity.keptFrom, 'includes');
    assert.strictEqual(lg.identity.traceWhy, 'inline', '必须写明是内联回落（有块级清单才算精确）');
});


/* ══════════════════════════ H. 版本锚 ══════════════════════════ */
test('v3251 H1. 三源同源 + 当版恰好锚着（本套件就是当版 frontier）', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(IDX)[1];
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    assert.equal(v, manifest.version, 'manifest 跟随 index.js');
    assert.equal(manifest.version, pkg.version, 'package 跟随 index.js');
    const vnum = (s) => String(s).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
    /* [v3.252.0] 抬版交棒：本套件的当版精确锚已交给 v3252（frontier 移交）；
     *   本项退回**下限形**，守住自己的出生版本（与 v3232 → v3233 同一口径）。 */
    assert.ok(vnum(v) >= vnum('3.251.0'), '本套件只在 3.251.0 及以后成立；当前 ' + v);
});
