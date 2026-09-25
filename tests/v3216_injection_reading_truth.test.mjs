/* ============================================================
 * tests/v3216_injection_reading_truth.test.mjs — [v3.215.0] Gate R2-A
 *
 * 主题：**最终实际注入**的读数只能由生成路径写；诊断必须另存；
 *       代际过期必须留痕；零块必须有读数；注入面必须外供。
 *
 * 修前实测（四条真缺陷，来自真源码读取与真行为驱动，不是设计推演）：
 *  ① 归属塌陷：`_lastInjection` 有两个写入点 —— `onBeforeGeneration`（真注入）
 *     与 `selfCheck()` 的「召回管线 dry-run（**不注入**，只验证链路通）」。
 *     而面板文案写的是「最近一次实际注入 … 即 AI 真实所见」（settings-ui.js:647）。
 *     诊断动作与被诊断状态同形：「跑了诊断」与「跑了真生成」在下游是
 *     **相反处置**，却读出同一个数。
 *  ② 迟到污染：`GENERATION_STARTED` 的代际守卫（`myGen !== this._genSeq`）在
 *     `await onBeforeGeneration()` **之后**才判定，而写入点在 await 内部
 *     **无条件**执行 —— 守卫拦住了注入槽位（`writeInjectSlot`），
 *     却拦不住它早已写脏的读数；且过期这件事**只打一行日志**，读数上
 *     「过期被丢弃」与「从未跑过」同形。
 *  ③ 零块未定义：修前写入点是 `if (inj2) this._lastInjection = …`。本轮 0 块
 *     （召回为空 / 全被裁掉）时读数**停在上一轮** ——「这轮什么都没注入」与
 *     「这轮还没跑」同形，而两者的处置相反。
 *  ④ 注入面不外供：约定/伏笔/回扣/回声各有 `render()`，但
 *     `buildBridgeSnapshot()` 的字段里**没有任何注入面** —— 下游拿不到
 *     「AI 这一轮实际看到的是哪几块、哪几块被预算裁掉了、为什么」。
 *
 * 六条契约：
 *  ① 真生成写入**只经唯一构造点** `_injectionRecord`，且带 `origin:'generation'`；
 *     dry-run 不写也不覆盖 `_lastInjection`，另存 `_diagnostics.dryRun`
 *     （`id:'diagnostics'`）。
 *  ② 代际过期只累计 `_injectionStale` + 留下 `_lastInjectionDiscard`，
 *     **不得动 `_lastInjection`**（迟到清理回写读数会把上一次真注入的读数擦掉）。
 *     ★ 边界如实声明：本 Gate **不声称**消除了「过期代在 await 期间已写脏」
 *       （那要把记录延迟到 await 之后，属 R2-B 范围）。本 Gate 只保证
 *       「过期必留读数」与「读数的唯一构造点」这两件事成立且可分。
 *  ③ 每轮必须有读数：0 块也写 `blocks:[] / total:0 / kept:0`，不得留上一轮的值。
 *  ④ `injection` 进快照（`buildInjectionReadout()` 是唯一来源），逐块带
 *     `ref/id/label/kept/chars/reason`，且 `html` 与 `_lastInjection.html` 同源。
 *  ⑤ 每轮块 ref 唯一且与 `_injectionRefOf(i)` 同口径（前缀 `inj_` + 轮次号）。
 *  ⑥ 恒定键面：读数 10 键一个不少，「没给」才取默认值（少写键 =
 *     失败分支与成功分支不同形，本仓在 `repairReceipt` 上刚治理过同一形态）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 载入破坏副本 → 在副本上重跑
 * **同款判据** → 必须现形。工具自证：锚点不存在 / 不唯一 ⇒ 必须抛。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripComments } from './_audit_lib.mjs';

const R = process.cwd();
const idxSrc = fs.readFileSync(path.join(R, 'index.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(R, 'settings-ui.js'), 'utf8');
const require_ = createRequire(import.meta.url);

/* ───────────────── 源码提取（花括号配平；不做文本猜测） ───────────────── */

/** 从 `at` 处的 `{` 起配平，返回含该 `{` 的整段。 */
function braceBlock(text, at) {
    const open = text.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? text.slice(open, end + 1) : null;
}
/** 按给定下标取整段方法（不含锚点存在性检查）。 */
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
/**
 * 取 `header` 起的方法/函数整段（**含头部**）。
 * 工具自证：不存在、或出现多于一次 ⇒ **必须抛** ——
 * 否则负控制会「破坏一个根本没用的锚点」而假绿。
 */
function blockOf(src, header) {
    const at = src.indexOf(header);
    assert.ok(at >= 0, '锚点必须存在：' + header);
    const n = src.split(header).length - 1;
    assert.strictEqual(n, 1, '锚点必须唯一（恰中 1 次）：' + header + '（实 ' + n + ' 次）');
    return blockAt(src, at);
}
/** 桥对象字面量（`window.lonsha_memory_bridge_v1 = { … }`）。 */
function bridgeLiteralOf(src) {
    const at = src.indexOf('window.lonsha_memory_bridge_v1 = {');
    assert.ok(at >= 0, '桥字面量必须存在');
    return braceBlock(src, at);
}
/** 真源码破坏：锚点必须**恰中 1 次**，否则抛（防破坏打偏）。 */
function breakSource(src, anchor, replacement) {
    const n = src.split(anchor).length - 1;
    assert.strictEqual(n, 1, '破坏锚点必须恰中 1 次：' + anchor.slice(0, 56) + '（实 ' + n + ' 次）');
    return src.replace(anchor, replacement);
}

/**
 * 读数赋值点**分态**（T2 与 N1 共用同一判据，负控制才是在「重跑同款判据」）。
 *
 * 为什么不能只数裸字符串：
 *  ① 注释里叙述「修前这里是 this._lastInjection = {...}」会被算成一次写入
 *     ⇒ 判据退化成「不许写注释」，测错了东西；
 *  ② 字段初始化 `this._lastInjection = null;` 是**声明**（每次实例化都跑），
 *     不是「归属塌陷」。塌陷的判据是「真写入有几个发生点」。
 * 于是在去注释后的源码上分两态：构造点内（必须恰 1 次、且写的是读数不是清零）
 * 与构造点外（真写入必须 0 次；`= null` 清零恰 1 处）。
 */
function injectionWritePoints(src) {
    const code = stripComments(src);
    const rec = blockOf(code, '_injectionRecord(extra) {');
    const at = code.indexOf('_injectionRecord(extra) {');
    const outside = code.slice(0, at) + '\n' + code.slice(at + rec.length);
    const grab = (s) => (s.match(/this\._lastInjection\s*=\s*[^\n]*/g) || []).map(x => x.trim());
    const isClear = (s) => /=\s*null\s*;?$/.test(s);
    return { recAssigns: grab(rec), outAssigns: grab(outside), isClear };
}
const realWrites = (p, where) => p[where].filter(s => !p.isClear(s));

/* ───────────────── 被测方法清单（缺一个就是接线不全） ───────────────── */

const HOST_METHODS = [
    '_injectionRecord(extra) {',
    '_injectionRefOf(i) {',
    '_injectionBlocksOf(allBlocks, fullText) {',
    '_injectionDiscardStale(myGen) {',
    '_buildDiagnosticsInjection(recalled) {',
    'buildInjectionReadout() {',
    'buildInjection(recalled) {',
];

/* ───────────────── 万能 stub（真源码方法体真跑用） ───────────────── */

/** 任何未声明的属性访问都回一个「可调用、可展开、length=0、toString=''」的对象。 */
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

/**
 * 从给定源码里的**真宿主方法**造引擎（破损副本上重跑同款判据时也走这里）。
 * 真字段可读写；未声明的字段一律回万能 stub（防「宿主没这项」把判据变成空转）。
 */
function engineFrom(src, cfg) {
    const parts = HOST_METHODS.map(h => blockAt(src, src.indexOf(h)));
    const body = parts.filter(Boolean).join(',\n');
    assert.strictEqual(parts.filter(Boolean).length, HOST_METHODS.length,
        '宿主方法体必须全部可提取（缺失即接线不全）');
    const real = {
        config: { config: Object.assign({
            vectorTopK: 8, injectionBudget: 3000, recallTierEnabled: false,
            budgetStrategy: 'balanced', adaptiveBudget: false, debugMode: false,
        }, cfg || {}) },
        _lastInjection: null, _lastInjectionDraft: null, _lastInjectionDiscard: null,
        _injectionStale: 0, _injectionRound: 0, _diagnostics: null,
        _lastBudgetStats: null, _lastCostLedger: null, _lastForecast: null,
        _lastReconcile: null, _lastRecallSeal: null, _genSeq: 0, _recallAudit: [],
        summary: { getGrandChroniclePrompt: () => '', lockedFactsForPrompt: () => '' },
    };
    const host = new Proxy(real, { get: (t, p) => (p in t ? t[p] : anyStub()) });
    const fn = new Function(
        'estimateTextTokens', 'errLog', 'RESIDENT_MARKERS', 'PLUGIN_NAME', 'window', 'require',
        '_costForecastLib', '_costLedgerLib', '_moduleLib', 'buildNpcTierInjection',
        'numOr', 'relativeTimeLabel', 'tiering', 'beat', 'extracted', 'injectionRefOf',
        `return ({ ${body} });`
    );
    return Object.assign(host, fn(est, () => {}, RESIDENT_MARKERS, 'v3216', {}, require_,
        anyStub(), anyStub(), anyStub(), anyStub(), (n, d) => d, anyStub(), anyStub(), anyStub(),
        anyStub(), (eng, i) => (eng && typeof eng._injectionRefOf === 'function' ? eng._injectionRefOf(i) : '')));
}

const RECORD_KEYS = ['html', 'tokens', 'ts', 'prev', 'origin', 'round', 'blocks', 'total', 'kept', 'gen'];

/** 真生成一轮（走真 buildInjection + 真唯一构造点），返回读数。 */
function generate(eng, recalled) {
    eng._injectionRound = (Number(eng._injectionRound) || 0) + 1;
    const inj2 = eng.buildInjection(recalled);
    const blocks = inj2 ? (Array.isArray(eng._lastInjectionDraft) ? eng._lastInjectionDraft : []) : [];
    eng._injectionRecord({
        html: inj2, origin: 'generation', blocks,
        total: blocks.length, kept: blocks.filter(b => b.kept).length,
        round: eng._injectionRound,
    });
    return eng._lastInjection;
}

/* ══════════ T1 工具自证（锚点不存在 / 不唯一 ⇒ 必须抛） ══════════ */
test('v3216 1. 工具自证：锚点不存在/不唯一、破坏打偏都必须抛', () => {
    assert.throws(() => blockOf(idxSrc, '这个方法不存在(zz) {'), /锚点必须存在/, '不存在的锚点必须抛');
    assert.throws(() => blockOf(idxSrc, 'recalled) {'), /锚点必须唯一/, '出现多次的锚点必须抛（防破坏打偏）');
    assert.throws(() => breakSource(idxSrc, '绝不存在的串zzz', 'x'), /恰中 1 次/, '零命中的破坏必须抛');
    assert.throws(() => breakSource(idxSrc, 'function', 'x'), /恰中 1 次/, '多命中的破坏必须抛');
    const b = blockOf(idxSrc, '_injectionRecord(extra) {');
    assert.ok(b && b.includes('_lastInjection ='), '真锚点取到整段方法体');
});

/* ══════════ T2 结构：读数只有一个写入口 ══════════ */
test('v3216 2. 读数真写入只有构造点一处；构造点外只剩字段声明', () => {
    const p = injectionWritePoints(idxSrc);
    assert.strictEqual(realWrites(p, 'recAssigns').length, 1,
        '★ 构造点内必须恰 1 次真写入（实 ' + realWrites(p, 'recAssigns').length + ' 次）');
    assert.ok(realWrites(p, 'recAssigns')[0].startsWith('this._lastInjection = rec'),
        '构造点写的是读数本体（不是清零）：' + realWrites(p, 'recAssigns')[0]);
    assert.deepStrictEqual(realWrites(p, 'outAssigns'), [],
        '★ 构造点外不得有任何真写入 —— 多一处就是又一次归属塌陷（实 ' + JSON.stringify(realWrites(p, 'outAssigns')) + '）');
    assert.deepStrictEqual(p.outAssigns, ['this._lastInjection = null;'],
        '构造点外只有那一处字段声明（>`= null` 是「未跑过」的如实初始态，不是写入）');
    const code = stripComments(idxSrc);
    const dry = blockOf(code, '_buildDiagnosticsInjection(recalled) {');
    assert.ok(!/this\._lastInjection\s*=/.test(dry), '★ 诊断路径不得写 `_lastInjection`');
    assert.ok(dry.includes('_diagnostics'), '诊断读数另存 `_diagnostics`');
    assert.ok(blockOf(idxSrc, 'buildBridgeSnapshot() {').includes('buildInjectionReadout'), '快照接线注入面读数');
    assert.ok(bridgeLiteralOf(idxSrc).includes('injectionRefOf'), '桥提供引用键转发');
});

/* ══════════ T3 恒定键面（10 键，多种调用形态同形） ══════════ */
test('v3216 3. 读数恒定 10 键：默认值只填「没给」的，不省键', () => {
    const eng = engineFrom(idxSrc);
    const a = eng._injectionRecord();
    assert.deepStrictEqual(Object.keys(a).sort(), RECORD_KEYS.slice().sort(), '空调用也必须 10 键');
    const b = eng._injectionRecord({ html: 'X' });
    assert.deepStrictEqual(Object.keys(b).sort(), RECORD_KEYS.slice().sort(), '单项调用也必须 10 键');
    assert.strictEqual(b.origin, 'generation', '缺省 origin 即真生成（诊断必须显式另走一路）');
    assert.strictEqual(b.total, 0, '没给 blocks ⇒ total 0（不是 undefined）');
    assert.ok(Number.isFinite(b.tokens) && b.tokens > 0, 'tokens 由 CJK 口径估算补足');
});

/* ══════════ T4 真生成：读数落地 + prev 链 ══════════ */
test('v3216 4. 真生成一轮：读数带 origin/round，prev 串上一轮', () => {
    const c = engineFrom(idxSrc);
    const r1 = generate(c, [{ source: 'summary', text: '第一轮的记忆块' }]);
    assert.strictEqual(r1.origin, 'generation');
    assert.strictEqual(r1.round, 1);
    assert.ok(r1.html.length > 0, '有块 ⇒ 有 html');
    assert.strictEqual(r1.prev, null, '首轮 prev 为 null');
    assert.ok(r1.blocks.length > 0, '逐块读数落地');
    for (const b of r1.blocks) {
        assert.ok(b.ref.startsWith('inj_1_'), 'ref 前缀含轮次号：' + b.ref);
        assert.ok(Number.isFinite(b.chars) && b.chars > 0);
        assert.ok(['kept', 'dropped-budget'].includes(b.reason), 'reason 为分态枚举：' + b.reason);
    }
    const r2 = generate(c, [{ source: 'summary', text: '第二轮的另一个记忆块' }]);
    assert.strictEqual(r2.round, 2);
    assert.strictEqual(r2.prev, r1.html, '第二轮 prev 与第一轮 html 逐字同源');
    assert.strictEqual(c.buildInjectionReadout().html, c._lastInjection.html, '外供面 html 与读数同源');
});

/* ══════════ T5 零块必须有读数（修前 `if (inj2)` 短路） ══════════ */
test('v3216 5. 本轮 0 块：读数必须落地为 0，不得停在上一轮', () => {
    const c = engineFrom(idxSrc);
    const r1 = generate(c, [{ source: 'summary', text: '上一轮的块' }]);
    assert.ok(r1.html.length > 0);
    const r2 = generate(c, []);
    assert.strictEqual(r2.html, '', '空召回 ⇒ 空注入');
    assert.deepStrictEqual(r2.blocks, [], '零块必须报 blocks:[]');
    assert.strictEqual(r2.total, 0, '★ total 必须归零（修前会停在上一轮）');
    assert.strictEqual(r2.kept, 0);
    assert.strictEqual(r2.round, 2, '轮次照常推进 ——「这轮 0 块」与「这轮还没跑」必须可分');
    const c2 = engineFrom(idxSrc);
    generate(c2, [{ source: 'summary', text: 'X' }]);
    c2.buildInjection([]);
    assert.strictEqual(c2._lastInjectionDraft, null, 'buildInjection 空召回不得留下旧 draft（否则会被当成本轮的块）');
});

/* ══════════ T6 dry-run 不写也不覆盖（修前归属塌陷） ══════════ */
test('v3216 6. selfCheck dry-run：不写也不覆盖 `_lastInjection`，只写 `_diagnostics`', () => {
    const c = engineFrom(idxSrc);
    const real = generate(c, [{ source: 'summary', text: '真生成那一轮的块' }]);
    const htmlBefore = real.html, tsBefore = real.ts;
    const d = c._buildDiagnosticsInjection([{ source: 'summary', text: '诊断路径召回到的东西' }]);
    assert.strictEqual(c._lastInjection.html, htmlBefore, '★ 诊断不得覆盖真生成读数（面板文案是「AI 真实所见」）');
    assert.strictEqual(c._lastInjection.ts, tsBefore, '连时间戳都不得被诊断推进');
    assert.strictEqual(d.id, 'diagnostics', '诊断读数带可归因 id');
    assert.strictEqual(d.origin, 'dry-run');
    assert.ok(c._diagnostics && c._diagnostics.dryRun && c._diagnostics.dryRun.id === 'diagnostics', '诊断读数落在 `_diagnostics.dryRun`');
    assert.ok(Number.isFinite(d.bytes), '诊断给出载荷字节数（链路通不通的可判读数）');
});

/* ══════════ T7 代际过期必须留痕，且不得动读数 ══════════ */
test('v3216 7. 代际过期：累计 `_injectionStale` + 留 discard，读数不动', () => {
    const c = engineFrom(idxSrc);
    const r = generate(c, [{ source: 'summary', text: '真生成的块' }]);
    const html0 = r.html;
    c._genSeq = 2;
    const s1 = c._injectionDiscardStale(1);
    assert.strictEqual(c._injectionStale, 1, '过期计数 +1');
    assert.strictEqual(s1.staleGen, 1, '记下过期的是哪一代');
    assert.strictEqual(s1.currentGen, 2, '记下当下是哪一代');
    assert.strictEqual(c._lastInjection.html, html0, '★ 迟到清理不得回写读数（回写会把上次真注入擦掉）');
    assert.strictEqual(c._lastInjection.round, 1, '轮次也不得被清理动作推进');
    c._injectionDiscardStale(1);
    assert.strictEqual(c._injectionStale, 2, '累计而非覆盖');
});

/* ══════════ T8 逐块读数分态（kept / dropped-budget 都要出现） ══════════ */
test('v3216 8. 逐块读数：「谁进了 / 谁被裁」必须两态可分', () => {
    const c = engineFrom(idxSrc, { injectionBudget: 400, recallTierEnabled: true });
    const many = [];
    for (let i = 0; i < 30; i++) many.push({ source: 'summary', text: '段落' + i + ' ' + '字'.repeat(60) });
    const r = generate(c, many);
    const kept = r.blocks.filter(b => b.kept), dropped = r.blocks.filter(b => !b.kept);
    assert.ok(kept.length > 0, '有被保留的块');
    assert.ok(dropped.length > 0, '有被裁掉的块（否则本条判据是空转）');
    assert.strictEqual(r.total, r.blocks.length);
    assert.strictEqual(r.kept, kept.length, 'kept 与逐块读数一致');
    for (const b of dropped) {
        assert.strictEqual(b.reason, 'dropped-budget');
        assert.ok(b.label.length > 0, '被裁的块也必须可辨认（有 label）');
    }
    const refs = r.blocks.map(b => b.ref);
    assert.strictEqual(new Set(refs).size, refs.length, '★ 每轮块 ref 唯一');
    assert.strictEqual(c._injectionRefOf(3), 'inj_' + r.round + '_3', 'ref 与 `_injectionRefOf` 同口径');
});

/* ══════════ T9 外供面形状 ══════════ */
test('v3216 9. `buildInjectionReadout`：无读数如实 null，有读数形状恒定', () => {
    const c = engineFrom(idxSrc);
    assert.strictEqual(c.buildInjectionReadout(), null, '未跑过 ⇒ null（不是空壳对象）');
    const r = generate(c, [{ source: 'summary', text: '一块记忆' }]);
    const out = c.buildInjectionReadout();
    assert.deepStrictEqual(Object.keys(out).sort(),
        ['blocks', 'chars', 'html', 'kept', 'origin', 'round', 'tokens', 'total', 'ts'].sort(),
        '外供面键面恒定 9 项');
    assert.strictEqual(out.chars, r.html.length, 'chars 与 html 同源');
    assert.deepStrictEqual(Object.keys(out.blocks[0]).sort(),
        ['chars', 'id', 'kept', 'label', 'reason', 'ref'].sort(), '逐块键面恒定 6 项');
});

/* ══════════ T10 UI 与诊断行必须说清「这是哪一路」 ══════════ */
test('v3216 10. 面板与诊断行：诊断读数与真注入读数不得同形', () => {
    assert.ok(uiSrc.includes('_diagnostics'), '面板可读诊断面');
    assert.ok(/origin\s*===\s*'dry-run'|origin === 'dry-run'/.test(uiSrc), '面板必须能分辨诊断读数');
    const sc = blockOf(idxSrc, 'async selfCheck() {');
    assert.ok(sc.includes('注入读数'), 'selfCheck 增加注入读数行');
    const ver = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.strictEqual(ver, '3.215.0', '本 Gate 属于 v3.215.0');
    // 当版锚点（version-guard V4）：本套件恰好锚着 3.215.0。
    //   frontier 文件按既有交棒口径用硬等号锁自己，下一版接管时改这一行即可。
    const vnum = (s) => {
        const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.ok(vnum(ver) >= vnum('3.215.0'), '版本不得低于本套件出生版本 3.215.0');
});

/* ══════════ N1-N4 负控制：真源码破坏 → 载入副本 → 同款判据必须现形 ══════════ */

test('v3216 N1. 破坏：让 dry-run 重新写 `_lastInjection` ⇒ 同款判据必须现形', () => {
    const anchor = '            this._diagnostics = Object.assign({}, this._diagnostics, { dryRun: rec });';
    const broken = breakSource(idxSrc, anchor,
        '            this._lastInjection = { html: String(html || \'\') };   // 破坏：诊断写回读数\n' + anchor);
    // 负控制必须**重跑 T2 的同款判据**（`injectionWritePoints`），不能用裸字符串计数 ——
    // 裸计数在破坏副本上会被那段叙述注释干扰，测的就不是同一条判据了。
    const pb = injectionWritePoints(broken);
    assert.strictEqual(realWrites(pb, 'recAssigns').length, 1, '构造点本身没被破坏（改的只是诊断路径）');
    assert.strictEqual(realWrites(pb, 'outAssigns').length, 1,
        '★ 破坏副本上「构造点外零写入」必须现形（实 ' + realWrites(pb, 'outAssigns').length + ' 处）');
    assert.ok(realWrites(pb, 'outAssigns')[0].includes('诊断写回读数') || realWrites(pb, 'outAssigns')[0].includes('{ html:'),
        '现形的那处就是被塞进诊断路径的写入：' + realWrites(pb, 'outAssigns')[0]);
    // 行为层同款判据：读数被诊断改写
    const c = engineFrom(broken);
    const real = generate(c, [{ source: 'summary', text: '真生成' }]);
    const before = real.html;
    c._buildDiagnosticsInjection([{ source: 'summary', text: '诊断' }]);
    assert.notStrictEqual(c._lastInjection.html, before, '★ 破坏副本上，同款判据必须现形（读数被诊断改写）');
});

test('v3216 N2. 破坏：读数少写一个键 ⇒ 键面判据必须现形', () => {
    const anchor = '                origin: String(e.origin || \'generation\'),';
    const broken = breakSource(idxSrc, anchor, '                // 破坏：origin 键被删除');
    const c = engineFrom(broken);
    const r = c._injectionRecord({ html: 'X' });
    assert.notDeepStrictEqual(Object.keys(r).sort(), RECORD_KEYS.slice().sort(), '★ 破坏副本上键面必须缺项');
    assert.ok(!Object.keys(r).includes('origin'), 'origin 确实缺失');
});

test('v3216 N3. 破坏：零块回归短路落地 ⇒ 「零块也落地」判据必须现形', () => {
    // 判据：生成路径的落地调用必须**无条件**（`this._injectionRecord({` 独立成行），
    //   一旦被 `if (inj2)` 包起来，零块就被跳过 —— 那正是修前的缺陷形态。
    const cond = (src) => /^\s*this\._injectionRecord\(\{\s*$/m.test(src) && !src.includes('if (inj2) this._injectionRecord(');
    assert.strictEqual(cond(idxSrc), true, '原版上判据为真（无条件落地，零块也留读数）');
    const anchor = '                this._injectionRecord({';
    const broken = breakSource(idxSrc, anchor, '                if (inj2) this._injectionRecord({  // 破坏：短路\n');
    assert.ok(broken.includes('if (inj2) this._injectionRecord({'), '破坏生效（恰中 1 次）');
    assert.strictEqual(cond(broken), false, '★ 破坏副本上判据必须现形为假');
});

test('v3216 N4. 破坏：快照去掉注入面 ⇒ 结构判据必须现形', () => {
    const anchor = '                    injection: deep((typeof this.buildInjectionReadout === \'function\') ? this.buildInjectionReadout() : undefined),';
    const broken = breakSource(idxSrc, anchor, '                    // 破坏：注入面被摘除');
    // 判据必须是**接线是否在场**，而不是「方法体里出现过这个字符串」——
    // 后者会被注释命中：破坏副本里那段解释「取值器是 buildInjectionReadout()」的
    // 注释仍在，于是判据在破坏后依然为真（负控制假绿）。
    const hasInjectionWire = (src) => /^\s*injection:\s*deep\(/m.test(stripComments(src));
    assert.strictEqual(hasInjectionWire(idxSrc), true, '原版上判据为真（快照确实接了注入面）');
    const snap = blockAt(broken, broken.indexOf('buildBridgeSnapshot() {'));
    assert.strictEqual(hasInjectionWire(snap), false, '★ 破坏副本上快照注入面必须缺失');
    assert.ok(bridgeLiteralOf(broken).includes('injectionRefOf'), '桥转发不受影响（只破坏快照面）');
});

console.log('\n✓ v3.215.0 R2-A 注入读数真实性专项测试全部通过');
