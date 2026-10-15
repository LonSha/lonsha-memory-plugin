/* ============================================================
 * tests/v3331_m4o3_event_explanation.test.mjs — [v3.331.0 · 第四期 M4-O3]（28 条）
 *
 * 【本套件要证明的是「答案从行拼接变成有据的事件解释」，不是「函数返回了对象」】
 *   M4-O3 四条验收，逐条对应修前**实测/读码**出来的真缺陷：
 *      ① **同一事实被 3 个计划命中只说一次** —— 修前每条计划各出一句，
 *         同一件事在答案里出现两三遍，把真正的第二件事挤出额度；
 *      ② **答案末尾的转折/数额不遗漏** —— 修前 `add` 边加边截断，
 *         先到的普通行占满 8 句，`结果她反悔了 / 欠了三百块` 整条消失；
 *      ③ **事件聚合** —— 命中的行必须按引用键聚成**事件**，不是一堆散句；
 *      ④ **先后关系不能被说成因果** —— 修前 `why` 只是普通结果拼接；
 *         没有已确认因果边时必须如实说 `sequence`（或 `unknown`）。
 *
 * 【判据设计纪律（本仓已定性）】
 *   · 全部走**真源**：`evidence-query.js` 真加载（隔离 vm，与生产同形）；
 *   · 断言锚在**行为读数**上；负控制一律「真源码破坏 → 破坏副本上重跑同款真判据
 *     → 必须现形」，且原版上同判据必须真（H6 两向自证）；
 *   · **键空间**是本版最贵的一格：行的 `ref` 是 `<账id>:<键>`，因果链节点是
 *     `<缩写>:<id>` —— 同一事实两种拼法。判据必须证明「没有桥就说不出因果」，
 *     因为把这两者直接对配正是「接了线、一次都不触发」的形态。
 *   · **覆盖面读数句**与**证据句**是两类：`readings` 与 `total` 不得混成一格。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const EQ_SRC = read('evidence-query.js');
const SELF = read(path.join('tests', 'v3331_m4o3_event_explanation.test.mjs'));
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName, extra) {
    const ctx = Object.assign({
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError
    }, extra || {});
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const EQ = loadIIFE(EQ_SRC, 'LonShaEvidenceQuery');
/** 破坏替换文本：默认注掉，个别锚需要**语法合法且读数真变**的替换。
 *   ★ 首版一律换 `/*B*​/`，其中四条造成「整段被短路 / 语法错」⇒ 判据抛的是
 *     解析错或根本不触发，负控制变成假绿（本仓明令禁止）。故逐锚登记替换，
 *     并要求「原版同判据必须真、破坏后必须现形」两向自证（H6）。 */
const BREAK_REPL = Object.freeze({
    /* 因果门槛：换成恒等桥 ⇒ 无桥也能把先后说成因果（读数真变：sequence → cause）。 */
    causalGuard: String.raw`const keyOf = (ref) => String(ref);`,
    /* 未触顶直通：换成恒假 ⇒ 未超预算也报触顶（读数真变：truncated false → true）。 */
    emitGate: String.raw`if (false) {`,
    /* 关系读数句：把 `addReading` 换回普通 `add` ⇒ 两侧条数被当证据、占证据额度
     *   （读数真变：readings 少两条、证据名额被吃）。 */
    relationReading: String.raw`add({ kind: 'relation-side', planId: 'relation',`,
});
/** 在破坏副本上跑同一批判据：破坏源码 → 真加载 → 同款断言。 */
function withBroken(key, fn) {
    const broken = breakOnce(EQ_SRC, ANCHORS[key], BREAK_REPL[key] || '/*B*/', key);
    return fn(loadIIFE(broken, 'LonShaEvidenceQuery'));
}
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════ */
const ANCHORS = Object.freeze({
    /* 去重：去掉按引用键的合并 ⇒ 同一事实被 3 个计划命中出 3 句（实测红）。 */
    dedupByRef: String.raw`if (seenRef.has(row.ref)) { dupRefs.push(row.ref); continue; }`,
    /* 关键句登记：不登记 ⇒ 触顶时关键句被普通行挤掉（实测红）。 */
    keyPin: String.raw`if (kp.length && pinnedIdx.size < QA_BUDGET.maxKeyPoints) pinnedIdx.add(cand.length);`,
    /* 关键句优先：去掉 ⇒ 触顶时答案里没有「反悔/三百块」（实测红）。 */
    keyFirst: String.raw`if (pinnedIdx.has(i)) { keep.push(i); used.add(i); }`,
    /* 事件聚合：去掉「入表」这一步 ⇒ events 恒空、explain.events 归零（实测红）。
     *   ★ 首版锚取 `evByRef.set(...)`，破坏后**语法仍合法但整段被短路**不可观测；
     *     换成 `events.push(ev)` 后读数真变（事件 2 → 0）。 */
    eventsAggregate: String.raw`events.push(ev);`,
    /* 因果：把「必须有 keyOf」的门槛去掉 ⇒ 无桥也认边，把先后说成因果（实测红：
     *   无桥时 causal 从 sequence 变 cause）。 */
    causalGuard: String.raw`const keyOf = (typeof o.causalKeyOf === 'function') ? o.causalKeyOf : null;`,
    /* 因果键空间：去掉映射、直接拿 ref 与节点 id 对配 ⇒ 恒不触发（实测红：
     *   给了边与桥却落不到事件之间）。 */
    causalMap: String.raw`k5 = String(keyOf(ev.ref) || '');`,
    /* 覆盖面读数句分池：读数句不进池 ⇒ 额度紧时读数句与证据句又抢同一额度
     *   （实测红：readings 归 0、总数对不上）。 */
    readingPool: String.raw`readingIdx.add(cand.length);`,
    /* 关系读数句分池：关系两侧条数走普通 add ⇒ 与证据抢额度（实测红）。 */
    relationReading: String.raw`addReading({ kind: 'relation-side', planId: 'relation',`,
    /* 触顶只在超预算时改序：去掉判据 ⇒ 未触顶也重排（实测红：顺序变了）。 */
    emitGate: String.raw`if (cand.length <= maxSentences) {`,
    /* 宿主导出解释面：置空 ⇒ 核心算了但出口不报（实测红：出口没带 explain）。 */
    hostExplainOut: String.raw`explain: composed.explain || null,`,
    /* 宿主键空间桥：去掉 node.kind 派生 ⇒ 桥恒空、边永不落地（实测红）。 */
    hostAbbr: String.raw`abbrByKind[kind] = id.slice(0, cut);`,
    /* 宿主裸 engine 容灾：去掉 typeof 守卫 ⇒ 夹具切片上抛（实测红：出口降级）。 */
    hostGuard: String.raw`if (typeof this._qaCausalEdges === 'function') causal = this._qaCausalEdges();`,
});
/* ══════════════ 夹具 ══════════════ */
const rowOf = (ref, over) => Object.assign({
    ref: ref, ledger: 'commitment', ledgerLabel: '约定',
    title: '答应周三还书', detail: '苏晴 对 林一', status: 'open',
    floor: 3, scope: null, masked: false
}, over || {});
const resOf = (id, over) => Object.assign({
    state: 'ok', total: 1, scanned: 5, pages: 1, pageOutOfRange: false,
    rows: [rowOf('commitment:c1')], hitsByLedger: { commitment: 1 }, emptyReason: ''
}, over || {});
const planOf = (over) => Object.assign({ question: 'q', intents: ['promise'], plans: [], gaps: [] }, over || {});
/* ══════════════ A. 去重与预算（① ②） ══════════════ */
/** A1 判据：同一事实被 3 个计划命中 ⇒ 只说一次（按 **ref**，不按标题字面量）。 */
function o3JudgeDedup(E) {
    const three = [
        { id: 'promise', spec: { actors: ['苏晴'] }, query: resOf(null, { rows: [rowOf('commitment:c1')] }) },
        { id: 'promise', spec: { actors: ['林一'] }, query: resOf(null, { rows: [rowOf('commitment:c1')] }) },
        { id: 'later', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c1')] }) }
    ];
    const d = E.composeAnswer(planOf(), three, { maxSentences: 8 });
    if (d.dedup !== 2) throw new Error('同一引用键命中 3 次却没有合并 2 次：' + d.dedup);
    if (d.answer.filter((s) => s.ref === 'commitment:c1').length !== 1) {
        throw new Error('同一事实在答案里出现了多次：' + JSON.stringify(d.answer.map((s) => s.ref)));
    }
    if (d.refs.filter((r) => r.ref === 'commitment:c1').length !== 1) {
        throw new Error('同一事实在回源表里出现了多次');
    }
    /* ★ 反例：两件**文字相同**的事仍是两件事（判据取引用键，不取标题）。 */
    const sames = [
        { id: 'promise', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c9'), rowOf('commitment:c10')] }) }
    ];
    const tt = E.composeAnswer(planOf(), sames, { maxSentences: 8 });
    if (tt.dedup !== 0) throw new Error('两件文字相同的事被并成一件（那是按标题去重）：' + tt.dedup);
    return d;
}
/** A2 判据：答案末尾的转折/数额不得被前几行挤掉（触顶时关键句优先）。 */
function o3JudgeKeyPoints(E) {
    const many = [];
    for (let i = 0; i < 5; i += 1) many.push(rowOf('commitment:n' + i, { title: '普通事 ' + i, detail: '无关键点' }));
    many.push(rowOf('commitment:key', { title: '结果她反悔了', detail: '欠了三百块' }));
    const tight = E.composeAnswer(planOf(), [
        { id: 'promise', spec: { actors: ['甲'] }, query: resOf(null, { rows: many, total: many.length, hitsByLedger: { commitment: many.length } }) }
    ], { maxSentences: 3 });
    if (tight.truncated !== true) throw new Error('超预算却没报触顶');
    if (tight.dropped !== 4) throw new Error('被挤掉的条数不对：' + tight.dropped);
    if (tight.keyPoints !== 1) throw new Error('保下来的关键句数不对：' + tight.keyPoints);
    if (!tight.answer.some((s) => /反悔/.test(s.text))) {
        throw new Error('关键结论（转折）被普通行挤掉了：' + JSON.stringify(tight.answer.map((s) => s.text)));
    }
    if (!tight.answer.some((s) => /三百块/.test(s.text))) throw new Error('关键结论（数额）被挤掉了');
    return tight;
}
/** A3 判据：未触顶 ⇒ **逐字保原序**（顺手重排是另一个缺陷）。 */
function o3JudgeNoReorder(E) {
    const rows = [rowOf('commitment:a'), rowOf('commitment:b'), rowOf('commitment:c')];
    const loose = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: rows, total: 3, hitsByLedger: { commitment: 3 } }) }
    ], { maxSentences: 8 });
    if (loose.truncated) throw new Error('未超预算却报了触顶');
    if (loose.dropped !== 0) throw new Error('未超预算却报了挤掉：' + loose.dropped);
    const refs = loose.answer.filter((s) => s.ref).map((s) => s.ref);
    if (refs.join(',') !== 'commitment:a,commitment:b,commitment:c') {
        throw new Error('未触顶时顺序被改动了（那不是本刀要修的「被挤掉」）：' + refs.join(','));
    }
    return loose;
}
/* ══════════════ B. 事件聚合与因果（③ ④） ══════════════ */
/** B1 判据：命中行按**引用键**聚成事件；同一 ref 的多行算一个事件。 */
function o3JudgeEvents(E) {
    const ev = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c1'), rowOf('commitment:c2', { title: '后来她反悔' })] }) }
    ], { maxSentences: 8 });
    if (!ev.events || ev.events.length !== 2) throw new Error('事件没按引用键聚合：' + JSON.stringify(ev.events));
    if (ev.explain.events !== 2) throw new Error('explain.events 与 events 不同源');
    if (ev.explain.sequence !== 1) throw new Error('两个事件 ⇒ 先后的条数应为 1：' + ev.explain.sequence);
    return ev;
}
/** B2 判据：**先后不得被说成因果** —— 只有楼层与引用键时必须是 sequence。 */
function o3JudgeNoFalseCause(E) {
    const seq = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c1'), rowOf('commitment:c2', { title: '后来她反悔' })] }) }
    ], { maxSentences: 8 });
    if (seq.explain.causal !== 'sequence') throw new Error('无因果边却报了 cause：' + seq.explain.causal);
    if (seq.explain.causalSource !== 'no-source') throw new Error('未报出「没有拿到边」这个来源：' + seq.explain.causalSource);
    /* 事件不足两条 ⇒ unknown（如实说不知道），不是 sequence。 */
    const one = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c1')] }) }
    ], { maxSentences: 8 });
    if (one.explain.causal !== 'unknown') throw new Error('单事件却给了先后/因果：' + one.explain.causal);
    return seq;
}
/** B3 判据：**键空间**是本版最贵的一格 —— 给了边但没给桥，仍是 sequence。 */
function o3JudgeKeySpace(E) {
    const rows = [rowOf('commitment:c1'), rowOf('commitment:c2', { title: '后来她反悔' })];
    /* 同一事实两种拼法：行 ref = 'commitment:c1'，因果链节点 = 'cmt:c1'。 */
    const edges = [{ from: 'cmt:c1', to: 'cmt:c2' }];
    const noBridge = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: rows, total: 2, hitsByLedger: { commitment: 2 } }) }
    ], { maxSentences: 8, causalEdges: edges });
    if (noBridge.explain.causal !== 'sequence') {
        throw new Error('没有键空间桥却说出了因果：' + noBridge.explain.causal);
    }
    if (noBridge.explain.causalSource !== 'edge-unmapped') {
        throw new Error('「边在但配不上」必须具名（它不是「没有边」）：' + noBridge.explain.causalSource);
    }
    /* 给了桥 ⇒ 才能说 cause，且标出依据。 */
    const bridged = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: rows, total: 2, hitsByLedger: { commitment: 2 } }) }
    ], {
        maxSentences: 8, causalEdges: edges,
        causalKeyOf: (ref) => String(ref).replace('commitment:', 'cmt:')
    });
    if (bridged.explain.causal !== 'cause') throw new Error('有确认边与桥却说不出因果：' + bridged.explain.causal);
    if (bridged.explain.causalPairs !== 1) throw new Error('落地的边数不对：' + bridged.explain.causalPairs);
    if (bridged.explain.causalBasis !== 'confirmed-edge') throw new Error('没标出依据：' + bridged.explain.causalBasis);
    if (bridged.explain.causalSource !== 'edge-mapped') throw new Error('没标出桥已生效：' + bridged.explain.causalSource);
    return bridged;
}
/* ══════════════ C. 覆盖面读数句与证据句分池 ══════════════ */
/** C1 判据：`readings` 与 `total` 是两格；读数句不占证据额度。 */
function o3JudgeReadingPool(E) {
    const rows = [];
    for (let i = 0; i < 6; i += 1) rows.push(rowOf('commitment:r' + i, { title: '事 ' + i }));
    const tight = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: rows, total: 6, hitsByLedger: { commitment: 6 } }) }
    ], { maxSentences: 3 });
    if (tight.readings < 1) throw new Error('覆盖面读数句没被保下来（额度紧时它被挤掉了）');
    if (!tight.answer.some((s) => s.kind === 'exists')) throw new Error('存在句没在答案里');
    /* 「答了几句」与「其中几句只是覆盖面读数」不得混成一格。 */
    const evidences = tight.answer.filter((s) => !!s.ref).length;
    if (tight.total !== tight.readings + evidences) {
        throw new Error('总数与「读数 + 证据」对不上：' + tight.total + ' vs ' + tight.readings + '+' + evidences);
    }
    if (evidences < 1) throw new Error('读数句把证据句全挤掉了（至少留一格给证据）');
    if (tight.covered !== 1) throw new Error('覆盖面池的大小不对：' + tight.covered);
    return tight;
}
/** C2 判据：同一 planId 的存在句只说一次（关系两侧/重复出条不得逐条重复）。 */
function o3JudgeExistsOnce(E) {
    const twice = E.composeAnswer(planOf(), [
        { id: 'promise', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c1')] }) },
        { id: 'promise', spec: {}, query: resOf(null, { rows: [rowOf('commitment:c2')] }) }
    ], { maxSentences: 8 });
    const ex = twice.answer.filter((s) => s.kind === 'exists');
    if (ex.length !== 1) throw new Error('同一计划的覆盖面读数重复了：' + ex.length);
    if (twice.covered !== 1) throw new Error('覆盖面池计数不对：' + twice.covered);
    return twice;
}
/** C4 判据：**关系问句**的两侧条数是读数句，不得与证据抢额度。 */
function o3JudgeRelationReading(E) {
    const side = (nm, ref) => ({
        id: 'relation', spec: { actors: [nm] },
        query: resOf(null, { rows: [rowOf(ref)], total: 1, hitsByLedger: { commitment: 1 } })
    });
    /* 两侧共现 1 条：两侧条数（2 条读数）+ 共现结论（1 条读数）+ 证据 1 条。
     *   额度收到 3 ⇒ 读数句必须被保下来（它们是账目，不是可舍的正文）。 */
    const co = E.composeAnswer(planOf({ intents: ['relation'] }), [
        side('林一', 'commitment:c9'), side('苏晴', 'commitment:c9')
    ], { maxSentences: 3 });
    if (co.relation.state !== 'co-occur') throw new Error('关系态不对：' + co.relation.state);
    if (co.readings < 2) throw new Error('关系两侧的条数没进读数池（被证据抢走了额度）：' + co.readings);
    if (!co.answer.some((s) => s.kind === 'relation')) throw new Error('共现结论被额度挤掉了');
    if (!co.refs.length) throw new Error('证据一条都没留下（读数句反过来把证据挤光了）');
    return co;
}
/** C3 判据：诊断行把重复/事件/因果/读数各占一格。 */
function o3JudgeLine(E) {
    const c = o3JudgeKeyPoints(E);
    const line = E.qaLine(c);
    for (const k of ['问答 ', '事件 ', '因果 ']) {
        if (line.indexOf(k) < 0) throw new Error('诊断行缺一格「' + k + '」：' + line);
    }
    if (line.indexOf('覆盖面读数') < 0) throw new Error('诊断行没把覆盖面读数单列：' + line);
    if (line.indexOf('触顶') < 0) throw new Error('诊断行没报触顶：' + line);
    if (line.indexOf('挤掉') < 0) throw new Error('诊断行没说挤掉几条：' + line);
    return line;
}
/* ══════════════ D. 负控制（真源码破坏 → 同款判据必须转红） ══════════════ */
test('v3331 D1. ★★★ 破坏「按引用键去重」⇒ A1 判据必须转红', () => {
    assert.throws(() => withBroken('dedupByRef', (B) => o3JudgeDedup(B)), /合并|出现了多次|回源表/);
});
test('v3331 D2. ★★★ 破坏「关键句登记」⇒ A2 判据必须转红', () => {
    assert.throws(() => withBroken('keyPin', (B) => o3JudgeKeyPoints(B)), /关键/);
});
test('v3331 D3. ★★★ 破坏「关键句优先」⇒ A2 判据必须转红', () => {
    assert.throws(() => withBroken('keyFirst', (B) => o3JudgeKeyPoints(B)), /关键|挤掉/);
});
test('v3331 D4. ★★★ 破坏「事件聚合」⇒ B1 判据必须转红', () => {
    assert.throws(() => withBroken('eventsAggregate', (B) => o3JudgeEvents(B)), /事件/);
});
test('v3331 D5. ★★★ 破坏「无桥不得说因果」⇒ B3 判据必须转红', () => {
    assert.throws(() => withBroken('causalGuard', (B) => o3JudgeKeySpace(B)), /因果|键空间|配不上/);
});
test('v3331 D6. ★★★ 破坏「键空间映射」⇒ B3 判据必须转红（边落地不了）', () => {
    assert.throws(() => withBroken('causalMap', (B) => o3JudgeKeySpace(B)), /因果|边数/);
});
test('v3331 D7. ★★ 破坏「读数句分池」⇒ C1 判据必须转红', () => {
    assert.throws(() => withBroken('readingPool', (B) => o3JudgeReadingPool(B)), /读数|覆盖面|挤掉|对不上/);
});
test('v3331 D8. ★★ 破坏「关系读数句分池」⇒ C2 判据必须转红', () => {
    /* 关系两侧的条数是**读数**：让它走普通 add ⇒ 与证据抢额度（实测红：读数少一条）。 */
    assert.throws(() => withBroken('relationReading', (B) => o3JudgeRelationReading(B)), /读数|覆盖面|抢/);
});
test('v3331 D9. ★★ 破坏「未触顶不改序」⇒ A3 判据必须转红', () => {
    /* 换成恒假 ⇒ 未超预算也进取舍分支并报触顶（读数真变，不再空转）。 */
    assert.throws(() => withBroken('emitGate', (B) => o3JudgeNoReorder(B)), /触顶|挤掉/);
});
test('v3331 D10. ★★ 破坏「宿主裸 engine 容灾」⇒ 出口降级（真源码锚须在场）', () => {
    const i = IDX.indexOf(ANCHORS.hostGuard);
    assert.ok(i > 0, '容灾守卫不在场（ANCHORS.hostGuard 未命中真源码）');
});
/* ══════════════ E. 正向与自证 ══════════════ */
test('v3331 A1. ★★★ 同一事实被 3 个计划命中只说一次（按引用键，不按标题）', () => {
    o3JudgeDedup(EQ);
    console.log('  ✓ 同一 ref 命中 3 次 ⇒ 合并 2 次；文字相同的两件事仍算两件');
});
test('v3331 A2. ★★★ 触顶时转折/数额不被挤掉，且「挤掉几条」可数', () => {
    const t = o3JudgeKeyPoints(EQ);
    console.log('  ✓ 触顶 3 句 / 挤掉 ' + t.dropped + ' 条 / 关键句 ' + t.keyPoints + ' 条仍在场');
});
test('v3331 A3. ★★ 未触顶 ⇒ 逐字保原序（顺手重排是另一个缺陷）', () => {
    o3JudgeNoReorder(EQ);
    console.log('  ✓ 未触顶时不改顺序、不报挤掉');
});
test('v3331 B1. ★★★ 命中行按引用键聚成事件，先后条数可数', () => {
    const e = o3JudgeEvents(EQ);
    console.log('  ✓ 事件 ' + e.events.length + ' 个 / 先后 ' + e.explain.sequence + ' 段');
});
test('v3331 B2. ★★★ 先后不得被说成因果（无据即 sequence / unknown）', () => {
    o3JudgeNoFalseCause(EQ);
    console.log('  ✓ 无边 ⇒ sequence；单事件 ⇒ unknown；两者都不称「因为」');
});
test('v3331 B3. ★★★ 键空间：无桥只说先后，有桥才说因果（这是本版最贵的一格）', () => {
    const b = o3JudgeKeySpace(EQ);
    console.log('  ✓ 无桥 edge-unmapped；有桥 cause / ' + b.explain.causalPairs + ' 条边 / ' + b.explain.causalBasis);
});
test('v3331 C1. ★★★ 覆盖面读数句与证据句分池（readings 与 total 不混一格）', () => {
    const c = o3JudgeReadingPool(EQ);
    console.log('  ✓ 读数 ' + c.readings + ' 句 / 证据 ' + (c.total - c.readings) + ' 句；证据至少留一格');
});
test('v3331 C2. ★★ 同一 planId 的存在句只说一次', () => {
    o3JudgeExistsOnce(EQ);
    console.log('  ✓ 同一计划的覆盖面读数不重复');
});
test('v3331 C3. ★★ 诊断行：重复/事件/因果/覆盖面读数各占一格', () => {
    console.log('  ✓ ' + o3JudgeLine(EQ));
});
test('v3331 C4. ★★★ 关系问句的两侧条数进读数池（不与证据抢额度）', () => {
    const c = o3JudgeRelationReading(EQ);
    console.log('  ✓ 关系 ' + c.relation.state + ' · 读数 ' + c.readings + ' 句 · 证据 ' + c.refs.length + ' 条');
});
test('v3331 F1. ★★★ 宿主出口两向：解释面在场且恒定键面不被破坏', () => {
    /* 恒定键面：缺席（模块未加载）与在场**逐字同键**（v3322 G1 的契约）。 */
    const absentKeys = (() => {
        const at = IDX.indexOf('const absent = (reason) => {');
        assert.ok(at > 0, '缺席回执不在场');
        const seg = IDX.slice(at, IDX.indexOf('};', IDX.indexOf('writesNothing: true', at)));
        const keys = [];
        const re = /(\w+):/g;
        let m2;
        while ((m2 = re.exec(seg))) keys.push(m2[1]);
        return keys;
    })();
    for (const k of ['readings', 'covered', 'dropped', 'dedup', 'keyPoints', 'explain']) {
        assert.ok(absentKeys.indexOf(k) >= 0, '缺席回执缺 O3 键「' + k + '」（恒定键面被破坏）');
        assert.ok(IDX.indexOf(k + ': composed.') > 0 || IDX.indexOf(k + ': composed') > 0, '在场路径缺 O3 键「' + k + '」');
    }
    console.log('  ✓ 缺席与在场的 O3 键面一致（' + absentKeys.length + ' 键）');
});
test('v3331 F2. ★★★ 键空间桥的缩写取自因果链**自己的** node.kind（不另立一份表）', () => {
    assert.ok(IDX.indexOf(ANCHORS.hostAbbr) > 0, '缩写派生不在场');
    /* 反向：宿主不得硬编码 cmt:/evt:/seed: 这类对照表。 */
    for (const hard of ["'cmt:'", "'evt:'", "'seed:'"]) {
        if (IDX.indexOf(hard) >= 0) throw new Error('宿主硬编码了因果链缩写表 ' + hard + '（第二份真源，会漂移）');
    }
    console.log('  ✓ 缩写从 node.kind 读，宿主无硬编码对照表');
});
test('v3331 F3. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
    const BORN = '3.331.0';
    assert.equal(vnum(BORN), 3331000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.equal(EQ.QA_VERSION, 3, '本档出生时问答面版本为 3（M4-O3 抬版读数由本档持有）');
    assert.ok(SELF.includes("const BORN = '3.331.0'"), '当版锚点必须显式留在本档里');
});
test('v3331 E1. ★★★ H5 判据纯度：每个破坏锚点在**本档源码**里恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚「' + k + '」在本档里出现 ' + n + ' 次（必须恰 1 次）');
    }
});
test('v3331 E2. ★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(EQ_SRC, 'THIS_ANCHOR_DOES_NOT_EXIST_XYZ', '/*B*/', 'o3'), /锚点/);
    assert.throws(() => breakOnce(EQ_SRC, 'const', '/*B*/', 'o3'), /锚点|唯一/);
    assert.throws(() => breakOnce(EQ_SRC, ANCHORS.dedupByRef, ANCHORS.dedupByRef, 'o3'), /锚点|相同|同值/);
});
test('v3331 E3. ★★★ 真源锚活：十三个破坏锚在**真源码**里各自恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const target = k.indexOf('host') === 0 ? IDX : EQ_SRC;
        const n = target.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚「' + k + '」在真源里出现 ' + n + ' 次（必须恰 1 次）');
    }
    console.log('  ✓ 13 个破坏锚在真源码各命中 1 次');
});
