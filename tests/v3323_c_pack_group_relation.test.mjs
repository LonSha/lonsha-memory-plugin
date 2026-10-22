/* ============================================================
 * tests/v3323_c_pack_group_relation.test.mjs — [v3.323.0 · C 包 M3-X2/X3/X4]（32 条）
 *
 * 【本套件要证明的是「群像各有立场、关系变化与伏笔可追踪」，不是「函数返回了对象」】
 *   M3-X2 人物关系变化史（relation-history.js + index.js 接线）：
 *      ① 两侧看法**逐侧保留**，永不合成一个好感值（本模块没有任何合成出口）；
 *      ② 三类未解决**各自可达**：两侧看法相反 / 对侧未登记 / 结束了且同侧无后继；
 *      ③ 出处不可考的边（floor 读不到）**恒排末尾**且单列计数 —— 「不知道第几楼」不得混进时间序；
 *      ④ 自指边单列，不混进「一对人」；只按名字聚合的对必须带 byName 标记（同名异人会被合并）；
 *      ⑤ `asOf(floor)` 语义是「截至该楼层**已经发生**的」：起始楼层 > floor 的一律不计入，
 *         楼层读不到的边**不进任何时点**；时点读不到 ⇒ floor=null + 空 + floorKnown=false（不猜 0 楼）；
 *      ⑥ 人物对截断必须可见（truncated > 0），不得静默丢。
 *   M3-X3 因果链导航（causal-chain.js + index.js 接线）：
 *      ① 四类来源各自成节点 —— 判空只看**前缀之后还有没有内容**（首跑自伤：用 kind 全名比长度
 *         会把约定与事件两类整类丢掉而面板照样正常）；
 *      ② 收口四分**互不同形**：完成 / 作废 / 违约 / 未收口；
 *      ③ 推测边与已确认边**结构上分两个数组**（同数组即等于把「猜的」当「有据的」）；
 *         `traceBack` 只走已确认边，回环被截断且计入 cycles；
 *      ④ 畸形边三态各自计数（self / dangling / malformed），绝不猜；
 *      ⑤ **候选出口可达**：真数据上必须真的提议得出来（首跑该出口恒空 —— 出口导出了、有判据、
 *         在真数据上一次都不触发的功能级失效），且弱关联恒为 speculative + 带 reason 与 gap；
 *         单字主体不收、文本不含名不收、超出 maxGap 不收。
 *   M3-X4 视角记忆卡（perspective-card.js + index.js 接线）：
 *      ① 四格判据：误信 → misled、确实不知道 → unknown、取得类按 via 分 亲历/听说；
 *      ② **判不开的动作不落任何一格**（起疑 / 撤回），落 `unrecorded` 且**处处可见** ——
 *         把「我们没记过」显示成「该角色确实不知道」是本仓最贵的无据断言；
 *      ③ via 空 ⇒ 仍算取得，但标 viaUnknown（**不得**因为「不知道从哪知道的」就写成「自己在场」）；
 *      ④ 时点：floor > at 计 offTime；楼层读不到的轨迹**不进任何时点**（计 noFloor）；
 *      ⑤ `contrast` 四类差异 + 误信侧单列；**缺一侧**与**空卡**不同形。
 *   宿主接线面：三个取库口 + 三组出口的**恒定键面**（缺席与在场逐字同键）+ buildInjection 真每轮调用点。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。
 * 【当版锚点】本档自锚常量 + vnum（锚必须住在当版档案里）。
 * 【判据事实来源】本档所有期望值都由 `tools/v3323_probe.py` 产出的真跑读数写成，
 *   不是从实现注释里抄的（本仓踩过「判据期望≠实现事实」的自伤）。
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
const RH_SRC = read('relation-history.js');
const CC_SRC = read('causal-chain.js');
const PC_SRC = read('perspective-card.js');
const SELF = read(path.join('tests', 'v3323_c_pack_group_relation.test.mjs'));
const MODS = ['relation-history.js', 'causal-chain.js', 'perspective-card.js'];
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const RH = loadIIFE(RH_SRC, 'LonShaRelationHistory');
const CC = loadIIFE(CC_SRC, 'LonShaCausalChain');
const PC = loadIIFE(PC_SRC, 'LonShaPerspectiveCard');
/* ══════════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度） ══════════════ */
const ANCHORS = Object.freeze({
    rhNullLast: String.raw`if (a === null) return 1;`,
    rhPairCap: String.raw`out.pairs = built.slice(0, maxPairs);`,
    ccPrefixEmpty: String.raw`if (!id || id.length <= spec.prefix.length) { malformed++; continue; }`,
    ccEdgePush: String.raw`else out.edges.push(r.edge);`,
    pcNoSlot: String.raw`if (!s) { unrecorded++; continue; }`,
    pcNoFloorSkip: String.raw`if (t.floor === null) { out.counts.noFloor++; continue; }`,
    idxAbsentKeys: String.raw`byName: false, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why }`,
});
/* ══════════════ M3-X2 判据 ══════════════ */
/** 判据①：两侧逐侧保留 + 无任何合成值出口。 */
function rhJudgeSides(api) {
    const r = api.build([
        { from: 'a', to: 'b', label: '朋友', data: { attitude: 'positive' }, validFrom: 2 },
        { from: 'b', to: 'a', label: '朋友', data: { attitude: 'negative' }, validFrom: 5 },
    ], {});
    const p = r.pairs[0];
    if (!p) throw new Error('两条对立看法必须成一对（不得各成一条）');
    if (!p.sides['a-to-b'] || !p.sides['b-to-a']) throw new Error('两侧必须逐侧保留');
    if (p.sides['a-to-b'].attitude !== 'positive' || p.sides['b-to-a'].attitude !== 'negative') {
        throw new Error('两侧态度被改动或合成：' + JSON.stringify([p.sides['a-to-b'].attitude, p.sides['b-to-a'].attitude]));
    }
    if ('attitude' in p) throw new Error('对级不得出现合成态度（M3-X2 验收原文：不把两人的看法平均成一个值）');
    if (p.turns.length !== 2) throw new Error('合并时间轴须含两个转折点，实 ' + p.turns.length);
    if (!p.mutual || !p.divergent) throw new Error('双向与「看法不同」两格须各自为真');
    return p;
}
/** 判据②：三类未解决各自可达且不同形。 */
function rhJudgeUnresolved(api) {
    const kindsOf = (edges) => (api.build(edges, {}).pairs[0].unresolved || []).map((u) => u.kind);
    const div = kindsOf([
        { from: 'a', to: 'b', data: { attitude: 'positive' }, validFrom: 1 },
        { from: 'b', to: 'a', data: { attitude: 'negative' }, validFrom: 2 },
    ]);
    if (div.indexOf('divergent-attitude') < 0) throw new Error('两侧看法相反须进 divergent-attitude，实 ' + JSON.stringify(div));
    const side = kindsOf([{ from: 'a', to: 'b', label: '同事', validFrom: 3 }]);
    if (side.indexOf('side-missing') < 0) throw new Error('对侧未登记须进 side-missing，实 ' + JSON.stringify(side));
    const closed = kindsOf([{ from: 'a', to: 'b', label: '恋人', validFrom: 3, validTo: 9 }]);
    if (closed.indexOf('closed-without-successor') < 0) {
        throw new Error('结束了且同侧无后继须进 closed-without-successor，实 ' + JSON.stringify(closed));
    }
    if (api.UNRESOLVED_KINDS.length !== 3) throw new Error('未解决项词表须三类齐（压成一类即三种处置混为一谈）');
    return { div, side, closed };
}
/** 判据③：floor 读不到的边恒排末尾 + 计数单列。 */
function rhJudgeFloorOrder(api) {
    const r = api.build([
        { from: 'a', to: 'b', label: '后来', validFrom: 5 },
        { from: 'a', to: 'b', label: '不知道第几楼' },
    ], {});
    const sd = r.pairs[0].sides['a-to-b'];
    if (!sd || sd.count !== 2) throw new Error('同侧两条须在同一侧链里，实 ' + JSON.stringify(sd && sd.count));
    if (sd.turns[0].floor !== 5) throw new Error('有楼号的转折必须排在「不知道第几楼」之前，实首项 ' + JSON.stringify(sd.turns[0].floor));
    if (sd.turns[1].floor !== null) throw new Error('无楼号的转折须排在末尾');
    if (r.counts.noFloor !== 1) throw new Error('出处不明必须单列计数，实 ' + r.counts.noFloor);
    const p = r.pairs[0];
    if (p.floorsKnown !== 1 || p.floorsUnknown !== 1) throw new Error('每对还须给「已知/未知」两个读数');
    if (String(api.line(r)).indexOf('出处不明') < 0) throw new Error('诊断行必须把「出处不明」写出来（不得静默）');
    return sd;
}
/** 判据④：自指单列 + 按名聚合标记 + 截断可见。 */
function rhJudgeHygiene(api) {
    const self = api.build([{ from: 'a', to: 'a', validFrom: 1 }], {});
    if (self.counts.self !== 1 || self.pairs.length !== 0) {
        throw new Error('自指边须单列计数且不得成「一对人」，实 ' + JSON.stringify(self.counts));
    }
    const byName = api.build([{ from: '甲', to: '乙', label: '朋友', floor: 1 }], {});
    if (byName.byName !== true) throw new Error('只按名字对上的对必须带 byName 标记（同名异人会被合并）');
    const three = [
        { from: 'a', to: 'b', label: '一', validFrom: 1 },
        { from: 'a', to: 'c', label: '二', validFrom: 2 },
        { from: 'a', to: 'd', label: '三', validFrom: 3 },
    ];
    const cut = api.build(three, { maxPairs: 2 });
    if (cut.pairs.length !== 2 || cut.truncated !== 1) {
        throw new Error('人物对截断必须可见（pairs=2 / truncated=1），实 ' + cut.pairs.length + ' / ' + cut.truncated);
    }
    return { self: self.counts.self, truncated: cut.truncated };
}
/** 判据⑤：asOf 是「截至该楼层已经发生」。 */
function rhJudgeAsOf(api) {
    const edges = [
        { from: 'a', to: 'b', label: '朋友', data: { attitude: 'positive' }, validFrom: 2 },
        { from: 'b', to: 'a', label: '朋友', data: { attitude: 'negative' }, validFrom: 5 },
    ];
    const early = api.asOf(edges, 3);
    if (early.pairs.length !== 1 || early.pairs[0].turnsAt !== 1) {
        throw new Error('第 3 楼只应看到第 2 楼那条（实 ' + early.pairs.length + ' / ' + (early.pairs[0] || {}).turnsAt + '）');
    }
    const late = api.asOf(edges, 9);
    if (late.pairs[0].turnsAt !== 2) throw new Error('第 9 楼应看到两条，实 ' + late.pairs[0].turnsAt);
    const none = api.asOf(edges, null);
    if (none.floor !== null || none.floorKnown !== false || none.pairs.length !== 0) {
        throw new Error('时点读不到 ⇒ floor=null + 空 + floorKnown=false（不得猜 0 楼）');
    }
    const noFloorEdge = api.asOf([{ from: 'a', to: 'b', label: '朋友' }], 9);
    if (noFloorEdge.pairs.length !== 0) throw new Error('楼层读不到的边不得进任何时点');
    return { early: early.pairs[0].turnsAt, late: late.pairs[0].turnsAt };
}
/* ══════════════ M3-X3 判据 ══════════════ */
const CC_SRC_FIX = () => ({
    seeds: { items: [{ id: 's1', hook: '旧书铺的钥匙', status: 'open', floor: 5 }] },
    commitments: { items: [{ id: 'c1', actor: '林岚', content: '答应还书', status: 'open', floor: 3 }] },
    events: { events: [{ id: 'e1', title: '还书', state: 'complete', floor: 8 }] },
    notes: [{ id: 'n1', label: '备注', status: 'open', floor: 9 }],
});
/** 判据①：四类来源各自成节点（前缀判空，不是按 kind 全名比长度）。 */
function ccJudgeNodes(api) {
    const n = api.toNodes(CC_SRC_FIX());
    const c = n.counts;
    if (c.seed !== 1 || c.commitment !== 1 || c.event !== 1 || c.note !== 1) {
        throw new Error('四类来源必须各自成节点（实 ' + JSON.stringify(c) + '）—— 用 kind 全名判空会整类丢掉');
    }
    const ids = n.nodes.map((x) => x.id).sort().join(',');
    if (ids !== 'cmt:c1,evt:e1,note:n1,seed:s1') throw new Error('节点 id 前缀不对：' + ids);
    const noId = api.toNodes({ seeds: { items: [{ hook: '没有 id' }] } });
    if (noId.malformed !== 1) throw new Error('缺 id 的条目须计畸形（不得生成假 id），实 ' + noId.malformed);
    return c;
}
/** 判据②：收口四分互不同形。 */
function ccJudgeClosure(api) {
    const r = api.build({
        seeds: { items: [{ id: 's2', hook: '已回收', status: 'recovered', floor: 1 }] },
        commitments: {
            items: [
                { id: 'c2', actor: '甲', content: '违约了', status: 'broken', floor: 2 },
                { id: 'c3', actor: '乙', content: '作废', status: 'cancelled', floor: 3 },
                { id: 'c4', actor: '丙', content: '还没做', status: 'open', floor: 4 },
            ]
        },
    }, {});
    const want = [
        ['resolved', ['seed:s2']], ['broken', ['cmt:c2']],
        ['cancelled', ['cmt:c3']], ['unresolved', ['cmt:c4']],
    ];
    for (const [k, v] of want) {
        if (JSON.stringify(r[k]) !== JSON.stringify(v)) {
            throw new Error('收口四分须互不同形：' + k + ' 实 ' + JSON.stringify(r[k]) + '，期望 ' + JSON.stringify(v));
        }
    }
    if (r.counts.broken !== 1 || r.counts.cancelled !== 1) throw new Error('违约与作废必须各自计数');
    const line = String(api.line(r));
    for (const w of ['违约', '已作废', '已完成']) {
        if (line.indexOf(w) < 0) throw new Error('诊断行须把「' + w + '」分开说：' + line);
    }
    return r.counts;
}
/** 判据③：推测边与已确认边结构分离 + traceBack 只走已确认边 + 回环可见。 */
function ccJudgeEdges(api) {
    const src = CC_SRC_FIX();
    const asSpec = api.build(src, { edges: [{ from: 'cmt:c1', to: 'seed:s1', basis: 'speculative', floor: 3 }] });
    if (asSpec.edges.length !== 0 || asSpec.speculative.length !== 1) {
        throw new Error('自称推测的边必须落 speculative（依据决定归处，与谁传进来无关）');
    }
    const asConf = api.build(src, { edges: [{ from: 'cmt:c1', to: 'seed:s1', basis: 'evidence', floor: 3 }] });
    if (asConf.edges.length !== 1 || asConf.speculative.length !== 0) throw new Error('已确认边必须落 edges');
    const byProposal = api.build(src, { proposals: [{ from: 'cmt:c1', to: 'seed:s1', floor: 3 }] });
    if (byProposal.edges.length !== 0 || byProposal.speculative[0].basis !== 'speculative') {
        throw new Error('proposals 进来的边一律记推测（它的来源就是没人确认过）');
    }
    const onlySpec = api.build(src, { edges: [{ from: 'cmt:c1', to: 'evt:e1', basis: 'speculative' }] });
    const t = api.traceBack(onlySpec, 'evt:e1');
    if (t.path.length !== 1) throw new Error('推测边追出来的「链」不是链：path 实 ' + JSON.stringify(t.path));
    const conf = api.build(src, { edges: [{ from: 'cmt:c1', to: 'evt:e1', basis: 'evidence' }] });
    const t2 = api.traceBack(conf, 'evt:e1');
    if (JSON.stringify(t2.path) !== JSON.stringify(['evt:e1', 'cmt:c1'])) throw new Error('已确认边必须追得动：' + JSON.stringify(t2.path));
    const cyc = api.build(src, {
        edges: [
            { from: 'seed:s1', to: 'cmt:c1', basis: 'evidence' },
            { from: 'cmt:c1', to: 'seed:s1', basis: 'evidence' },
        ]
    });
    const t3 = api.traceBack(cyc, 'seed:s1');
    if (t3.cycles !== 1) throw new Error('回环必须被截断并计入 cycles，实 ' + t3.cycles);
    const unknown = api.traceBack(conf, 'ghost:z');
    if (unknown.known !== false || unknown.reason !== 'not-in-graph') {
        throw new Error('图外 id 与「追到了头」必须不同形：' + JSON.stringify([unknown.known, unknown.reason]));
    }
    return { spec: onlySpec.speculative.length, cycles: t3.cycles };
}
/** 判据④：畸形边三态各自计数，绝不猜。 */
function ccJudgeMalformed(api) {
    const r = api.build(CC_SRC_FIX(), {
        edges: [
            { from: 'cmt:c1', to: 'ghost:z', basis: 'evidence' },
            { from: 'cmt:c1', to: 'cmt:c1', basis: 'evidence' },
            { from: '', to: 'seed:s1' },
        ]
    });
    const c = r.counts;
    if (c.danglingEdges !== 1 || c.selfEdges !== 1 || c.malformedEdges !== 1) {
        throw new Error('畸形边三态须各自计数（实 ' + JSON.stringify([c.danglingEdges, c.selfEdges, c.malformedEdges]) + '）');
    }
    if (r.edges.length !== 0) throw new Error('三态畸形边一条都不得进 edges');
    const line = String(api.line(r));
    if (line.indexOf('悬空边') < 0 || line.indexOf('畸形边') < 0) throw new Error('诊断行须把两类分开：' + line);
    return c;
}
/** 判据⑤：候选出口可达 + 三条负判据（单字 / 不含名 / 超 gap）。 */
function ccJudgeProposals(api) {
    const hit = api.proposeCandidates({
        commitments: { items: [{ id: 'p1', actor: '探针甲', content: '答应去旧书铺', status: 'open', floor: 2 }] },
        seeds: { items: [{ id: 'p2', hook: '探针甲把旧书铺的钥匙藏了起来', status: 'open', floor: 3 }] },
    }, {});
    if (!hit.length) {
        throw new Error('候选出口在真数据上必须提议得出来（首跑此处恒空：导出了、有判据、永不触发）');
    }
    for (const p of hit) {
        if (p.basis !== 'speculative') throw new Error('候选恒为推测（不得替用户确认因果）');
        if (!p.reason || !(p.gap > 0)) throw new Error('候选必须带 reason 与 gap：' + JSON.stringify(p));
    }
    const one = api.proposeCandidates({
        commitments: { items: [{ id: 'q1', actor: '甲', content: '答应', status: 'open', floor: 2 }] },
        seeds: { items: [{ id: 'q2', hook: '甲在此埋下伏笔', status: 'open', floor: 3 }] },
    }, {});
    if (one.length) throw new Error('单字主体不得收（一个字会在任何正文里误命中）');
    const miss = api.proposeCandidates({
        commitments: { items: [{ id: 'r1', actor: '张三', content: '答应', status: 'open', floor: 2 }] },
        seeds: { items: [{ id: 'r2', hook: '无关联的埋点', status: 'open', floor: 3 }] },
    }, {});
    if (miss.length) throw new Error('文本里没提到主体名不得提议');
    const far = api.proposeCandidates({
        commitments: { items: [{ id: 't1', actor: '张三', content: '答应', status: 'open', floor: 2 }] },
        seeds: { items: [{ id: 't2', hook: '张三的事', status: 'open', floor: 20 }] },
    }, {});
    if (far.length) throw new Error('超出 maxGap 不得提议');
    return hit;
}
/* ══════════════ M3-X4 判据 ══════════════ */
const PC_TRACES = () => ([
    { character: '甲', fact: '亲眼所见', action: 'acquire', floor: 2 },
    { character: '甲', fact: '听人说的', action: 'acquire', via: 'told', floor: 3 },
    { character: '甲', fact: '误信的事', action: 'misbelieve', floor: 4 },
    { character: '甲', fact: '确实不知道', action: 'unaware', floor: 5 },
    { character: '甲', fact: '只是起疑', action: 'doubt', floor: 6 },
    { character: '甲', fact: '撤回过', action: 'retract', revoked: true, floor: 7 },
]);
/** 判据①：四格判据 + 判不开不落格且 unrecorded 可见。 */
function pcJudgeSlots(api) {
    const r = api.build(PC_TRACES(), {});
    const c = r.counts;
    if (c.lived !== 1 || c.heard !== 1 || c.misled !== 1 || c.unknown !== 1) {
        throw new Error('四格各自归位（实 ' + JSON.stringify(c) + '）');
    }
    if (c.unrecorded !== 2) throw new Error('起疑与撤回不得落任何一格，须进 unrecorded（实 ' + c.unrecorded + '）');
    const card = r.cards[0];
    if (card.counts.lived + card.counts.heard + card.counts.misled + card.counts.unknown !== 4) {
        throw new Error('判不开的动作不得被塞进某一格');
    }
    if (api.slotOf({ action: 'doubt' }) !== null || api.slotOf({ action: 'retract' }) !== null) {
        throw new Error('判不开的动作 slotOf 必须返 null（不是 unknown）');
    }
    const line = String(api.line(r));
    if (line.indexOf('未记录 2') < 0) throw new Error('「未记录」必须永远报出来：' + line);
    if (line.indexOf('误信 1') < 0 || line.indexOf('勿当世界真相') < 0) throw new Error('误信必须单列且带告诫：' + line);
    return c;
}
/** 判据②：via 空 ⇒ 亲历但标 viaUnknown（不得写成「自己在场」）。 */
function pcJudgeVia(api) {
    if (api.slotOf({ action: 'acquire', via: 'rumor' }) !== 'heard') throw new Error('转述类 via 须归听说');
    if (api.slotOf({ action: 'acquire' }) !== 'lived') throw new Error('via 空仍算取得（亲历格）');
    const noVia = api.build([{ character: '甲', fact: '不知道从哪知道的', action: 'acquire', floor: 1 }], {});
    if (noVia.cards[0].viaUnknown !== 1) throw new Error('via 读不到必须标 viaUnknown（否则等于写成「自己在场」）');
    const heardVia = api.build([{ character: '甲', fact: '听说的', action: 'acquire', via: 'letter', floor: 1 }], {});
    if (heardVia.cards[0].viaUnknown !== 0) throw new Error('有转述来源时不得标 viaUnknown');
    return noVia.cards[0].viaUnknown;
}
/** 判据③：时点过滤 —— 晚于时点计 offTime、无楼层不进任何时点。 */
function pcJudgeAt(api) {
    const r = api.build(PC_TRACES(), { at: 3 });
    if (r.counts.used !== 2 || r.counts.offTime !== 4) {
        throw new Error('第 3 楼只应收两条、其余计 offTime（实 ' + r.counts.used + ' / ' + r.counts.offTime + '）');
    }
    const noFloor = api.build([{ character: '甲', fact: '没楼层', action: 'acquire' }], { at: 5 });
    if (noFloor.counts.noFloor !== 1 || noFloor.cards.length !== 0) {
        throw new Error('楼层读不到的轨迹不进任何时点（实 noFloor=' + noFloor.counts.noFloor + ' cards=' + noFloor.cards.length + '）');
    }
    const noAt = api.build(PC_TRACES(), { at: null });
    if (noAt.atKnown !== false || noAt.counts.lived !== 1) {
        throw new Error('未给时点须如实报 atKnown=false 并给全量（不得猜 0 楼）');
    }
    /* 「无楼层」是**给了时点才有**的读数（没给时点就没有「哪些没进时点」这回事）；
     *   「本模块不知道」那一格则**有就必报**（计数 > 0 时必须出现）。
     *   首版把两者写成同一条断言（且拿一条 unrecorded=0 的夹具去要「未记录」字样），
     *   是本档判据自己的错 —— 判据错与实现错必须分开记。 */
    const withAt = String(api.line(api.build([
        { character: '甲', fact: '亲历', action: 'acquire', floor: 2 },
        { character: '甲', fact: '没楼层', action: 'acquire' },
        { character: '甲', fact: '只是起疑', action: 'doubt', floor: 3 },
    ], { at: 9 })));
    if (withAt.indexOf('无楼层 1') < 0 || withAt.indexOf('未计入任何时点') < 0) {
        throw new Error('给了时点时，「无楼层」必须单列且写明未计入任何时点：' + withAt);
    }
    if (withAt.indexOf('未记录 1') < 0) {
        throw new Error('有判不开的动作时，「未记录」必须可见（不得静默）：' + withAt);
    }
    return r.counts;
}
/** 判据④：contrast 四类差异 + 缺一侧与空卡不同形。 */
function pcJudgeContrast(api) {
    const a = api.build([
        { character: '甲', fact: '共有事实', action: 'acquire', floor: 1 },
        { character: '甲', fact: '只有左边', action: 'acquire', floor: 2 },
        { character: '甲', fact: '左边误信', action: 'misbelieve', floor: 3 },
    ], { character: '甲' });
    const b = api.build([
        { character: '乙', fact: '共有事实', action: 'acquire', via: 'told', floor: 1 },
        { character: '乙', fact: '只有右边', action: 'acquire', floor: 2 },
    ], { character: '乙' });
    const ct = api.contrast(a.cards[0], b.cards[0]);
    const f = (x) => x.map((i) => i.fact).sort().join(',');
    if (f(ct.diff.onlyLeft) !== '只有左边,左边误信') throw new Error('onlyLeft 实 ' + f(ct.diff.onlyLeft));
    if (f(ct.diff.onlyRight) !== '只有右边') throw new Error('onlyRight 实 ' + f(ct.diff.onlyRight));
    if (f(ct.diff.shared) !== '共有事实') throw new Error('shared 实 ' + f(ct.diff.shared));
    if (f(ct.diff.misledSide) !== '左边误信') throw new Error('误信侧必须单列：' + f(ct.diff.misledSide));
    const missing = api.contrast(a.cards[0], null);
    if (missing.known !== false || missing.rightPresent !== false) throw new Error('缺一侧必须报 known=false + rightPresent=false');
    const empty = api.build([{ character: '乙', fact: '只有右边', action: 'acquire', floor: 2 }], { character: '乙' });
    const both = api.contrast(a.cards[0], empty.cards[0]);
    if (both.known !== true || both.rightPresent !== true) throw new Error('给出了卡（哪怕内容少）与「没给」必须不同形');
    return ct.diff;
}
/* ══════════════ 宿主接线面（取真方法体文本 + 真模块装配） ══════════════ */
/** 取成员体（模块级函数或类方法），配平跳过字符串与模板串。 */
function sliceMember(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const open = src.indexOf('{', at + header.length - 1);
    if (open < 0) return null;
    let d = 0;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (c === '"' || c === "'" || c === '`') {
            let k = i + 1;
            while (k < src.length) {
                if (src[k] === '\\') { k += 2; continue; }
                if (src[k] === c) { k++; break; }
                if (src[k] === '\n' && c !== '`') break;
                k++;
            }
            i = k - 1;
            continue;
        }
        if (c === '{') d++;
        else if (c === '}') { d--; if (d === 0) return src.slice(at, i + 1); }
    }
    return null;
}
const LIB_HEADS = ['function _moduleLib(getGlobal, fileName) {', 'function _relationHistoryLib() {',
    'function _causalChainLib() {', 'function _perspectiveCardLib() {'];
const METH_HEADS = ['relationHistory(...args) {', 'relationHistoryAt(...args) {', '_relationHistoryLine(...args) {',
    'causalChainGraph(...args) {', 'causalChainTodos(...args) {', 'causalChainTrace(...args) {',
    'causalChainProposals(...args) {', '_causalChainLine(...args) {', 'perspectiveCard(...args) {',
    'perspectiveContrast(...args) {', '_perspectiveCardLine(...args) {'];
/** 装配真宿主出口（缺一即抛，不静默降级成空壳）。 */
function mkHost(win, src) {
    const idx = src || IDX;
    const libs = LIB_HEADS.map((h) => sliceMember(idx, h));
    if (libs.some((x) => !x)) throw new Error('取库口切片缺失：' + LIB_HEADS.filter((h, i) => !libs[i]).join(' / '));
    const meths = METH_HEADS.map((h) => sliceMember(idx, h));
    if (meths.some((x) => !x)) throw new Error('宿主出口切片缺失：' + METH_HEADS.filter((h, i) => !meths[i]).join(' / '));
    return new Function('errLog', 'window',
        libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });')(() => {}, win);
}
const WIN_FULL = () => ({ LonShaRelationHistory: RH, LonShaCausalChain: CC, LonShaPerspectiveCard: PC });
/** 在场宿主状态：真图边 + 真三账 + 真轨迹。 */
function hostState() {
    return {
        graph: {
            edges: new Map([
                ['e1', { from: 'a', to: 'b', label: '朋友', data: { attitude: 'positive' }, validFrom: 2 }],
                ['e2', { from: 'b', to: 'a', label: '朋友', data: { attitude: 'negative' }, validFrom: 5 }],
            ])
        },
        worldProg: {
            seedLedger: { items: [{ id: 's1', hook: '旧书铺的钥匙', status: 'open', floor: 5 }] },
            commitmentLedger: { items: [{ id: 'c1', actor: '林岚', content: '答应还书', status: 'open', floor: 3 }] },
            knowledgeTraces: { traces: PC_TRACES() },
        },
        _eventThreadState: { events: [{ id: 'e1', title: '还书', state: 'complete', floor: 8 }] },
    };
}
/** 判据：恒定键面（缺席与在场逐字同键）+ 缺席是真读数 + 不抛。 */
function hostJudgeFace(src) {
    const self = Object.assign(mkHost(WIN_FULL(), src), hostState());
    const eng = mkHost({}, src);
    const noState = Object.assign(eng, hostState());
    const pairs = [
        [self.relationHistory({}), noState.relationHistory({}), 'relationHistory'],
        [self.causalChainGraph({}), noState.causalChainGraph({}), 'causalChainGraph'],
        [self.perspectiveCard({}), noState.perspectiveCard({}), 'perspectiveCard'],
    ];
    for (const [here, absent, name] of pairs) {
        const k1 = Object.keys(here).join(','), k2 = Object.keys(absent).join(',');
        if (k1 !== k2) throw new Error(name + ' 缺席与在场键面不同（恒定键面是「下游按键断言不必猜」的前提）：\n  在场 ' + k1 + '\n  缺席 ' + k2);
        if (absent.ok !== false || absent.reason !== 'module-unavailable') {
            throw new Error(name + ' 模块缺席必须给**具名** reason，实 ' + JSON.stringify([absent.ok, absent.reason]));
        }
        if (absent.writesNothing !== true) throw new Error(name + ' 缺席面必须自述零写');
    }
    const lineNo = String(eng._relationHistoryLine());
    if (lineNo.indexOf('模块未加载') < 0) throw new Error('模块缺席时诊断行未如实归因：' + lineNo);
    const lineNo2 = String(eng._causalChainLine());
    if (lineNo2.indexOf('模块未加载') < 0) throw new Error('因果链诊断行缺席归因缺失：' + lineNo2);
    const lineNo3 = String(eng._perspectiveCardLine());
    if (lineNo3.indexOf('模块未加载') < 0) throw new Error('视角卡诊断行缺席归因缺失：' + lineNo3);
    return { keys: Object.keys(pairs[0][0]).length };
}
/** 判据：真跑通（真边集 → 真轨迹 / 真三账 → 真图 / 真轨迹 → 真卡）。 */
function hostJudgeRun(src) {
    const self = Object.assign(mkHost(WIN_FULL(), src), hostState());
    const rh = self.relationHistory({});
    if (!rh.ok || rh.counts.pairs !== 1 || rh.counts.divergent !== 1) {
        throw new Error('关系变化史没跑通：' + JSON.stringify([rh.ok, rh.counts]));
    }
    const at = self.relationHistoryAt(3);
    if (!at.ok || at.pairs[0].turnsAt !== 1) throw new Error('指定时点快照没跑通：' + JSON.stringify(at.pairs));
    const cc = self.causalChainGraph({});
    if (!cc.ok || cc.counts.nodes !== 3) throw new Error('因果图没跑通（三账 → 三节点）：' + JSON.stringify(cc.counts));
    const todos = self.causalChainTodos();
    if (!Array.isArray(todos) || todos.length !== 2) throw new Error('未解待办面不对（两条未收口）：' + JSON.stringify(todos.map((t) => t.id)));
    const prop = self.causalChainProposals({});
    if (!Array.isArray(prop)) throw new Error('候选面必须恒返数组');
    const pcOut = self.perspectiveCard({});
    if (!pcOut.ok || pcOut.counts.unrecorded !== 2) throw new Error('视角卡没跑通：' + JSON.stringify(pcOut.counts));
    const ct = self.perspectiveContrast('甲', '甲', {});
    if (!ct.ok) throw new Error('对照面没跑通：' + JSON.stringify(ct.reason));
    const lineRh = String(self._relationHistoryLine());
    if (lineRh.indexOf('两侧看法不同 1') < 0) throw new Error('关系变化诊断行没带读数：' + lineRh);
    const lineCc = String(self._causalChainLine());
    if (lineCc.indexOf('节点 3') < 0) throw new Error('因果链诊断行没带读数：' + lineCc);
    const linePc = String(self._perspectiveCardLine());
    if (linePc.indexOf('未记录 2') < 0) throw new Error('视角卡诊断行没带读数：' + linePc);
    return { rh: rh.counts, cc: cc.counts };
}
/* ══════════════ A. M3-X2 ══════════════ */
test('v3323 A1. ★★★ M3-X2 关系变化史：两侧看法逐侧保留，永不合成一个好感值', () => {
    const p = rhJudgeSides(RH);
    console.log('  ✓ 两侧各自保留（' + p.sides['a-to-b'].attitude + ' / ' + p.sides['b-to-a'].attitude + '）；对级无合成态度');
});
test('v3323 A2. ★★ M3-X2 三类未解决各自可达（不同形）', () => {
    const k = rhJudgeUnresolved(RH);
    console.log('  ✓ ' + JSON.stringify(k));
});
test('v3323 A3. ★★ M3-X2 出处不明的边恒排末尾并单列计数', () => {
    rhJudgeFloorOrder(RH);
    console.log('  ✓ 有楼号在前、无楼号在末尾；noFloor 单列且诊断行点名');
});
test('v3323 A4. ★★ M3-X2 自指单列 + 按名聚合标记 + 截断可见', () => {
    const r = rhJudgeHygiene(RH);
    console.log('  ✓ self=' + r.self + ' / truncated=' + r.truncated);
});
test('v3323 A5. ★★★ M3-X2 asOf 是「截至该楼层已经发生」', () => {
    const r = rhJudgeAsOf(RH);
    console.log('  ✓ 第 3 楼 ' + r.early + ' 条 / 第 9 楼 ' + r.late + ' 条；时点读不到不猜 0 楼');
});
test('v3323 A6. ★★ M3-X2 模块自检四条当场自证', () => {
    const sc = RH.selfCheck(hostState().graph.edges.values().next().value ? [
        { from: 'a', to: 'b', label: '朋友', data: { attitude: 'positive' }, validFrom: 2 },
        { from: 'b', to: 'a', label: '朋友', data: { attitude: 'negative' }, validFrom: 5 },
    ] : []);
    assert.equal(sc.ok, true, '自检须全真：' + JSON.stringify(sc));
    assert.equal(sc.writeFaces, 0, '只读面：导出名里不得出现写动作');
    assert.equal(sc.kindsComplete, true, '未解决三类词表须齐');
});
/* ══════════════ B. M3-X3 ══════════════ */
test('v3323 B1. ★★★ M3-X3 四类来源各自成节点（前缀判空，不是按 kind 全名比长度）', () => {
    const c = ccJudgeNodes(CC);
    console.log('  ✓ ' + JSON.stringify(c) + '（含缺 id 计畸形）');
});
test('v3323 B2. ★★★ M3-X3 收口四分互不同形（完成 / 作废 / 违约 / 未收口）', () => {
    ccJudgeClosure(CC);
    console.log('  ✓ 四态各自成列且诊断行分开说');
});
test('v3323 B3. ★★★ M3-X3 推测边与已确认边结构分离 + traceBack 只走已确认边', () => {
    const r = ccJudgeEdges(CC);
    console.log('  ✓ 推测边单列 ' + r.spec + '；回环 cycles=' + r.cycles + '；图外 id 与追到头不同形');
});
test('v3323 B4. ★★ M3-X3 畸形边三态各自计数（self / dangling / malformed）', () => {
    ccJudgeMalformed(CC);
    console.log('  ✓ 三态各自计数且一条都不进 edges');
});
test('v3323 B5. ★★★ M3-X3 候选出口可达（首跑此处恒空）+ 三条负判据', () => {
    const hit = ccJudgeProposals(CC);
    console.log('  ✓ 提议 ' + hit.length + ' 条，全为 speculative（' + hit[0].reason.slice(0, 24) + '…）');
});
test('v3323 B6. ★★ M3-X3 模块自检五条当场自证（含候选可达）', () => {
    const sc = CC.selfCheck(CC_SRC_FIX());
    assert.equal(sc.ok, true, '自检须全真：' + JSON.stringify(sc));
    assert.equal(sc.basisSeparated, true, '推测边与已确认边必须落在不同数组');
    assert.equal(sc.proposalsReachable, true, '候选出口必须可达（恒空出口是功能级失效）');
    assert.equal(sc.writeFaces, 0, '只读面');
});
/* ══════════════ C. M3-X4 ══════════════ */
test('v3323 C1. ★★★ M3-X4 四格判据 + 判不开不落格且 unrecorded 处处可见', () => {
    pcJudgeSlots(PC);
    console.log('  ✓ 起疑/撤回进 unrecorded（2）；误信带「勿当世界真相」');
});
test('v3323 C2. ★★ M3-X4 via 空 ⇒ 亲历但标 viaUnknown（不得写成「自己在场」）', () => {
    pcJudgeVia(PC);
    console.log('  ✓ 转述类 via ⇒ 听说；via 空 ⇒ 亲历 + viaUnknown 标记');
});
test('v3323 C3. ★★ M3-X4 时点过滤：晚于时点计 offTime、无楼层不进任何时点', () => {
    pcJudgeAt(PC);
    console.log('  ✓ 第 3 楼收 2 条 / offTime 4；无楼层不计入任何时点');
});
test('v3323 C4. ★★ M3-X4 两人信息差对照：四类差异 + 误信侧单列 + 缺一侧与空卡不同形', () => {
    pcJudgeContrast(PC);
    console.log('  ✓ onlyLeft / onlyRight / shared / misledSide 四类分列');
});
test('v3323 C5. ★★ M3-X4 模块自检五条当场自证（含未记录可见）', () => {
    const sc = PC.selfCheck(PC_TRACES());
    assert.equal(sc.ok, true, '自检须全真：' + JSON.stringify(sc));
    assert.equal(sc.unrecordedVisible, true, '「未记录」必须可见（否则等于把没记过写成确实不知道）');
    assert.equal(sc.slotsComplete, true, '四格词表须齐');
    assert.equal(sc.writeFaces, 0, '只读面');
});
/* ══════════════ D. 宿主接线面 ══════════════ */
test('v3323 D1. ★★★ 宿主三组出口：恒定键面（缺席也是真读数）+ 具名缺席 + 不抛', () => {
    const r = hostJudgeFace(IDX);
    console.log('  ✓ 缺席与在场同键（' + r.keys + ' 键）；缺席 reason=module-unavailable；三行诊断行如实归因');
});
test('v3323 D2. ★★★ 宿主三组出口真跑通：真边集 / 真三账 / 真轨迹 → 真读数', () => {
    hostJudgeRun(IDX);
    console.log('  ✓ 关系轨迹 / 指定时点 / 因果图 / 待办 / 视角卡 / 对照六面真跑通');
});
test('v3323 D3. ★★ 宿主接线落在真每轮调用点（buildInjection 内，不是只等诊断面来问）', () => {
    const at = IDX.indexOf('this._relationHistoryRead = (_RH && typeof _RH.build === \'function\')');
    assert.ok(at > 0, '关系变化史的真调用点必须落盘');
    assert.ok(IDX.indexOf('this._relationMutualRead = _mutualRead;') < at, '它必须接在双向对账之后（同一轮边集顺手算一次）');
    const after = IDX.slice(at, at + 900);
    assert.ok(after.indexOf("blocks.push('[角色关系]')") > 0, '调用点必须真的在注入构造段内（后面紧跟着关系块的拼装）');
    assert.ok(IDX.includes("errLog(e, 'buildInjection.关系变化史')"), '算不出来必须如实记（不得静默吞）');
    for (const h of LIB_HEADS.concat(METH_HEADS)) {
        assert.ok(IDX.includes(h), '接线锚点必须在场：' + h);
    }
});
/* ══════════════ E. 真源码破坏负控制 ══════════════ */
test('v3323 E1. ★★★ 破坏「无楼号排末尾」⇒ A3 判据必须转红', () => {
    /* 破坏形态 = 让「不知道第几楼」**排到最前**（而不是恒排末尾）。
     *   首版写成 `return 0`（视为相等）—— 那是**假破坏**：稳定排序会把顺序原样保留，
     *   判据照样通过（本仓点名的「破坏看起来发生了、其实判据没被触及」）。 */
    const bad = breakOnce(RH_SRC, ANCHORS.rhNullLast, 'if (a === null) return -1;', 'rh 无楼号排序');
    let threw = false, msg = '';
    try { rhJudgeFloorOrder(loadIIFE(bad, 'LonShaRelationHistory')); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '无楼号的边排到最前后，判据必须转红');
    assert.match(msg, /之前|末尾/);
    rhJudgeFloorOrder(RH);   // 反向对照
});
test('v3323 E2. ★★★ 破坏「人物对截断可见」⇒ A4 判据必须转红', () => {
    const bad = breakOnce(RH_SRC, ANCHORS.rhPairCap, 'out.pairs = built.slice(0, 1);', 'rh 截断');
    let threw = false;
    try { rhJudgeHygiene(loadIIFE(bad, 'LonShaRelationHistory')); } catch (e) { threw = true; }
    assert.ok(threw, '截断被写死成 1 条后，判据必须转红（否则「截断可见」没有任何判决力）');
    rhJudgeHygiene(RH);
});
test('v3323 E3. ★★★ 破坏「节点 id 前缀判空」⇒ B1 判据必须转红', () => {
    const bad = breakOnce(CC_SRC, ANCHORS.ccPrefixEmpty, 'if (!id) { malformed++; continue; }', 'cc 前缀判空');
    let threw = false, msg = '';
    try { ccJudgeNodes(loadIIFE(bad, 'LonShaCausalChain')); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '缺 id 的条目不再计畸形后，判据必须转红');
    assert.match(msg, /畸形/);
    ccJudgeNodes(CC);
});
test('v3323 E4. ★★★ 破坏「推测边与已确认边分离」⇒ B3 判据必须转红', () => {
    const bad = breakOnce(CC_SRC, ANCHORS.ccEdgePush, 'else out.speculative.push(r.edge);', 'cc 边分离');
    let threw = false;
    try { ccJudgeEdges(loadIIFE(bad, 'LonShaCausalChain')); } catch (e) { threw = true; }
    assert.ok(threw, '已确认边被塞进推测数组后，判据必须转红（同数组即把「猜的」当「有据的」）');
    ccJudgeEdges(CC);
});
test('v3323 E5. ★★★ 破坏「判不开的动作不落格」⇒ C1 判据必须转红', () => {
    const bad = breakOnce(PC_SRC, ANCHORS.pcNoSlot, "if (!s) { slots.unknown.push({ fact: t.fact, floor: t.floor, via: t.via, from: t.from, evidenceKey: t.evidenceKey, traceId: t.traceId, revoked: t.revoked, correctedBy: t.correctedBy, note: '' }); continue; }", 'pc 判不开');
    let threw = false;
    try { pcJudgeSlots(loadIIFE(bad, 'LonShaPerspectiveCard')); } catch (e) { threw = true; }
    assert.ok(threw, '把「起疑」写进「确实不知道」格后，判据必须转红');
    pcJudgeSlots(PC);
});
test('v3323 E6. ★★★ 破坏「无楼层轨迹不进任何时点」⇒ C3 判据必须转红', () => {
    /* 破坏形态 = 让「无楼层」那条**落进下面的 push**（原判据是 continue 跳过）。
     *   ★ 两次失败的首版都记在这里（判据侧自伤，不是实现错）：
     *     ① 曾用「删掉锚点末尾一个字符」—— 把 if 块的花括号切断 ⇒ 加载期 SyntaxError
     *        （判据根本没跑到，测的是一个语法错）；
     *     ② 曾用 `replace('continue;','break;')` —— `break` 直接退出整个 for，
     *        对「只有这一条」的夹具而言效果**与正确行为相同** ⇒ 判据不转红（假绿第二形）。
     *   `replace(' continue;','')` 才是「掉进 push」的最小改动（语法与行为都验证过）。 */
    const bad = breakOnce(PC_SRC, ANCHORS.pcNoFloorSkip,
        ANCHORS.pcNoFloorSkip.replace(' continue;', ''), 'pc 无楼层时点');
    let threw = false, msg = '';
    try { pcJudgeAt(loadPC(bad)); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '无楼层轨迹被放进时点快照后，判据必须转红');
    assert.match(msg, /不进任何时点/);
    pcJudgeAt(PC);
});
/** E6 用：破坏副本的加载（与 loadIIFE 同一实现，单列只为可读性）。 */
function loadPC(src) { return loadIIFE(src, 'LonShaPerspectiveCard'); }
test('v3323 E7. ★★★ 破坏宿主缺席面的恒定键面 ⇒ D1 判据必须转红', () => {
    /* 破坏形态 = 删掉缺席面尾部那几格（派生态，不再抄一遍完整键面）。
     *   ★ 这一格的由来：C 包首跑时 D1 **真抓到一处实现缺陷** —— 三个出口的缺席面
     *     键面与在场路径不同（缺 version/degraded，多 ok/reason），
     *     而「模块没加载」与「一个都没有」处置相反 ⇒ 下游只能判 undefined。
     *     与 v3.322.0 的 memoryQaAnswer 缺 knownActors 同族，见 tools/patch_3323_face.py。 */
    const bad = breakOnce(IDX, ANCHORS.idxAbsentKeys,
        ANCHORS.idxAbsentKeys.replace('degraded: false, ok: false, reason: why }', 'degraded: false }'), 'idx 缺席键面');
    let threw = false, msg = '';
    try { hostJudgeFace(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '缺席面少一格键后，判据必须转红（恒定键面是下游按键断言的前提）');
    assert.match(msg, /键面/);
    hostJudgeFace(IDX);
});
/** E6 用：破坏后的 PC 源码加载（与 loadIIFE 同一实现，名字只为可读性）。 */
function loadIFFE_SAFE(src) { return loadIIFE(src, 'LonShaPerspectiveCard'); }
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3323 F1. ★★ H5 判据纯度：破坏锚点在**本档源码**里恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档里出现 ' + n + ' 次（判据纯度要求恰 1 次；两处各写一份会让纯度检查恒过）');
    }
});
test('v3323 F2. ★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(RH_SRC, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakOnce(RH_SRC, 'function ', 'x', '不唯一锚点'), /恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakOnce(RH_SRC, ANCHORS.rhNullLast, ANCHORS.rhNullLast, '同值替换'), /必须真的改变源码/);
    assert.throws(() => breakOnce(CC_SRC, 'const ', 'x', '锚点太多'), /恰中 1 次|要求恰好 1 次/);
});
test('v3323 F3. ★★★ 加载面：三个新模块各在 extra_js 恰一次，分发面 96 → 99', () => {
    for (const m of MODS) {
        assert.ok(fs.existsSync(path.join(R, m)), m + ' 磁盘必须在场');
        assert.equal(MF.extra_js.filter((x) => x === m).length, 1, m + ' 须在 extra_js 恰好声明一次（不登记 = 浏览器不加载 = 面永远缺席）');
    }
    /* [v3.324.0 交棒] 原文是 `assert.equal(MF.extra_js.length, 99, ...)` ——
     *   【硬锁出生版读数】：99 是 C 包那一刀的一次性事实，D 包新增两模块后
     *   （99 → 101）它会翻红，而翻红的信息量只剩「数字不对」。本仓同族坑已定性三轮
     *   （v3296 §8 总项数锁、v3321/v3322 交棒）。交棒**不弱化**：本档改守**下界**
     *   （不低于出生时的 99），当版项数锁由 tests/v3324_d_pack_extraction_driver.test.mjs 的 F3 接管。 */
    assert.ok(MF.extra_js.length >= 99,
        'extra_js 项数不得低于本档出生时的 99（当版项数锁已交棒 v3324 F3），实 ' + MF.extra_js.length);
    assert.equal(new Set(MF.extra_js).size, MF.extra_js.length, 'extra_js 不得重复');
    assert.equal(MF.extra_js[0], 'ledger-entity.js', 'ledger-entity.js 仍须在 extra_js 首位（v3.207 不变量：六本账的真源先加载）');
    /* [v3.324.0 交棒 → v3.326.0 再交棒] 原文是 `assert.equal(MF.extra_js.slice(-3).join(','), MODS.join(','), ...)` ——
     *   【把「在绝对末尾」当永久不变量】:每有新模块追加在末尾,该断言就翻红一次,
     *   而翻红的信息量只剩「位置不对」。本条要守的不变量是「**C 包三模块连续相邻**」
     *   —— 与它们在 extra_js 里的绝对下标无关(D 包两模块、A1 第九刀的 memory-gc.js
     *   都在它们之后追加过)。当版新模块自身是否恰一次、是否在末尾,由各自成对套件
     *   (tests/v3324_d_pack_extraction_driver.test.mjs F3 / tests/v3326_a1_memory_gc_split.test.mjs A3)接管。 */
    const _iRel = MF.extra_js.indexOf('relation-history.js');
    assert.ok(_iRel >= 0, 'C 包首模块 relation-history.js 须在 extra_js 内(否则本条失去锚)');
    assert.equal(MF.extra_js.slice(_iRel, _iRel + MODS.length).join(','), MODS.join(','),
        'C 包三模块须连续相邻(加载序上它们是一组消费方),实 ' + MF.extra_js.slice(_iRel, _iRel + MODS.length).join(','));

});
test('v3323 F4. ★★ 三模块导出面指纹与只读纪律（不 require 兄弟模块 / 不落盘）', () => {
    const grid = [
        ['relation-history.js', ['RH_VERSION', 'RH_KIND', 'ATTITUDES', 'UNRESOLVED_KINDS', 'pairOf', 'sideOf', 'build', 'asOf', 'line', 'selfCheck']],
        ['causal-chain.js', ['CC_VERSION', 'CC_KIND', 'NODE_KINDS', 'EDGE_BASIS', 'CLOSURE', 'toNodes', 'build', 'proposeCandidates', 'traceBack', 'todos', 'line', 'selfCheck']],
        ['perspective-card.js', ['PC_VERSION', 'PC_KIND', 'SLOTS', 'HEARD_VIA', 'slotOf', 'build', 'contrast', 'line', 'selfCheck']],
    ];
    for (const [m, names] of grid) {
        const src = read(m);
        for (const n of names) assert.ok(src.indexOf(n + ':') > 0 || src.indexOf(n + ' =') > 0, m + ' 缺导出项 ' + n);
        for (const banned of ['require(', 'fetch(', 'localStorage', 'indexedDB']) {
            assert.equal(src.indexOf(banned), -1, m + ' 不得出现 ' + banned + '（零依赖 / 离线 / 不落盘）');
        }
    }
});
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.323.0';
test('v3323 F5. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3323000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.323.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});
