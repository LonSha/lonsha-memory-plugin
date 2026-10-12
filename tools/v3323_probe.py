#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3323_probe.py —— 写探针脚本（不是最终判据）。

目的：在写 C 包成对套件**之前**，把三个内核的**真实行为**跑出来，
避免把「我以为的行为」写成判据（本仓最贵的一类自伤：判据期望≠实现事实）。
探针产物落在 /tmp/v3323_probe.mjs，由 node 跑完即弃。
"""
import io
import os

OUT = '/tmp/v3323_probe.mjs'
SRC = r'''
import fs from 'node:fs';
import vm from 'node:vm';
const R = '/home/user/lonsha-memory-plugin';
const read = (f) => fs.readFileSync(R + '/' + f, 'utf8');
function load(src, name) {
  const ctx = { console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math, isFinite, isNaN, Date, Boolean, Error, TypeError };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx); vm.runInContext(src, ctx);
  const api = ctx[name];
  if (!api) throw new Error('未挂 ' + name);
  return api;
}
const RH = load(read('relation-history.js'), 'LonShaRelationHistory');
const CC = load(read('causal-chain.js'), 'LonShaCausalChain');
const PC = load(read('perspective-card.js'), 'LonShaPerspectiveCard');
const J = (x) => JSON.stringify(x);

console.log('== RH 双侧 ================================================');
const rhEdges = [
  { from: 'a', to: 'b', label: '朋友', data: { attitude: 'positive' }, validFrom: 2 },
  { from: 'b', to: 'a', label: '朋友', data: { attitude: 'negative' }, validFrom: 5 },
];
const rh1 = RH.build(rhEdges, {});
console.log('counts', J(rh1.counts), 'byName', rh1.byName, 'truncated', rh1.truncated);
console.log('pairs[0].sides', J(rh1.pairs[0] && rh1.pairs[0].sides));
console.log('pairs[0].divergent', rh1.pairs[0] && rh1.pairs[0].divergent, 'mutual', rh1.pairs[0] && rh1.pairs[0].mutual);
console.log('unresolved', J(rh1.pairs[0] && rh1.pairs[0].unresolved));
console.log('turns', J(rh1.pairs[0] && rh1.pairs[0].turns));
console.log('line', RH.line(rh1));

console.log('== RH 三类未解决 ==========================================');
const rhDiv = RH.build([
  { from: 'a', to: 'b', data: { attitude: 'positive' }, validFrom: 1 },
  { from: 'b', to: 'a', data: { attitude: 'negative' }, validFrom: 2 },
], {});
console.log('divergent kinds', J((rhDiv.pairs[0].unresolved || []).map((u) => u.kind)));
const rhSide = RH.build([{ from: 'a', to: 'b', label: '同事', validFrom: 3 }], {});
console.log('side-missing kinds', J((rhSide.pairs[0].unresolved || []).map((u) => u.kind)));
const rhClosed = RH.build([{ from: 'a', to: 'b', label: '恋人', validFrom: 3, validTo: 9 }], {});
console.log('closed kinds', J((rhClosed.pairs[0].unresolved || []).map((u) => u.kind)));

console.log('== RH 自指 / 无楼层 / 按名 ================================');
const rhSelf = RH.build([{ from: 'a', to: 'a', validFrom: 1 }], {});
console.log('self', J(rhSelf.counts), 'pairs', rhSelf.pairs.length);
const rhNoFloor = RH.build([{ from: 'a', to: 'b', label: '朋友' }], {});
console.log('noFloor', J(rhNoFloor.counts), 'floorsUnknown', rhNoFloor.pairs[0].floorsUnknown, 'floorsKnown', rhNoFloor.pairs[0].floorsKnown);
const rhByName = RH.build([{ from: '甲', to: '乙', label: '朋友', floor: 1 }], {});
console.log('byName', rhByName.byName, 'counts.pairs', rhByName.counts.pairs);

console.log('== RH asOf ================================================');
const rhAs = RH.asOf(rhEdges, 3);
console.log('asOf 3 pairs', rhAs.pairs.length, 'turnsAt', rhAs.pairs[0] && rhAs.pairs[0].turnsAt, 'floorKnown', rhAs.floorKnown);
const rhAs2 = RH.asOf(rhEdges, 9);
console.log('asOf 9 turnsAt', rhAs2.pairs[0] && rhAs2.pairs[0].turnsAt);
const rhAs3 = RH.asOf(rhEdges, null);
console.log('asOf null floor', rhAs3.floor, 'floorKnown', rhAs3.floorKnown, 'pairs', rhAs3.pairs.length, 'kind', rhAs3.kind);
const rhAs4 = RH.asOf([{ from: 'a', to: 'b', label: '朋友' }], 9);
console.log('asOf 无楼层边 pairs', rhAs4.pairs.length);
console.log('malformedInput(非数组)', J(RH.build('x', {}).counts), RH.build('x', {}).malformedInput);
console.log('selfCheck', J(RH.selfCheck(rhEdges)));

console.log('== CC 四类节点 ============================================');
const ccSrc = {
  seeds: { items: [{ id: 's1', hook: '旧书铺的钥匙', status: 'open', floor: 5 }] },
  commitments: { items: [{ id: 'c1', actor: '林岚', content: '答应还书', status: 'open', floor: 3 }] },
  events: { events: [{ id: 'e1', title: '还书', state: 'complete', floor: 8 }] },
  notes: [{ id: 'n1', label: '备注', status: 'open', floor: 9 }],
};
const cc1 = CC.build(ccSrc, {});
console.log('counts', J(cc1.counts));
console.log('nodes', J(cc1.nodes.map((x) => x.id + ':' + x.kind + ':' + x.closure)));
console.log('toNodes counts', J(CC.toNodes(ccSrc).counts));

console.log('== CC 收口四分 ============================================');
const ccCl = CC.build({
  seeds: { items: [{ id: 's2', hook: '已回收', status: 'recovered', floor: 1 }] },
  commitments: { items: [{ id: 'c2', actor: '甲', content: '违约了', status: 'broken', floor: 2 }, { id: 'c3', actor: '乙', content: '作废', status: 'cancelled', floor: 3 }] },
}, {});
console.log('resolved', J(ccCl.resolved), 'broken', J(ccCl.broken), 'cancelled', J(ccCl.cancelled), 'unresolved', J(ccCl.unresolved));

console.log('== CC 边分离 ==============================================');
const ccE = CC.build(ccSrc, { edges: [{ from: 'cmt:c1', to: 'seed:s1', basis: 'speculative', floor: 3 }] });
console.log('edges', ccE.edges.length, 'speculative', ccE.speculative.length, 'counts', J(ccE.counts));
const ccE2 = CC.build(ccSrc, { edges: [{ from: 'cmt:c1', to: 'seed:s1', basis: 'evidence', floor: 3 }] });
console.log('evidence edges', ccE2.edges.length, 'spec', ccE2.speculative.length);
const ccE3 = CC.build(ccSrc, { proposals: [{ from: 'cmt:c1', to: 'seed:s1', floor: 3 }] });
console.log('proposal-only edges', ccE3.edges.length, 'spec', ccE3.speculative.length, 'basis', ccE3.speculative[0] && ccE3.speculative[0].basis);
const ccE4 = CC.build(ccSrc, { edges: [{ from: 'cmt:c1', to: 'ghost:z', basis: 'evidence' }, { from: 'cmt:c1', to: 'cmt:c1', basis: 'evidence' }, { from: '', to: 'seed:s1' }] });
console.log('bad edges counts', J(ccE4.counts), 'edges', ccE4.edges.length);

console.log('== CC traceBack ==========================================');
const ccT1 = CC.build(ccSrc, { edges: [{ from: 'cmt:c1', to: 'evt:e1', basis: 'evidence' }] });
console.log('confirmed trace', J(CC.traceBack(ccT1, 'evt:e1')));
const ccT2 = CC.build(ccSrc, { edges: [{ from: 'cmt:c1', to: 'evt:e1', basis: 'speculative' }] });
console.log('speculative-only trace', J(CC.traceBack(ccT2, 'evt:e1')));
const ccT3 = CC.build(ccSrc, { edges: [{ from: 'seed:s1', to: 'cmt:c1', basis: 'evidence' }, { from: 'cmt:c1', to: 'seed:s1', basis: 'evidence' }] });
console.log('cycle trace', J(CC.traceBack(ccT3, 'seed:s1')));
console.log('unknown id trace', J(CC.traceBack(ccT1, 'ghost:z')));
console.log('todos', J(CC.todos(cc1).map((x) => x.id)));

console.log('== CC 候选提议 ============================================');
const ccP = CC.proposeCandidates(ccSrc, {});
console.log('proposals', J(ccP));
const ccP2 = CC.proposeCandidates({
  commitments: { items: [{ id: 'p1', actor: '探针甲', content: '答应去旧书铺', status: 'open', floor: 2 }] },
  seeds: { items: [{ id: 'p2', hook: '探针甲把旧书铺的钥匙藏了起来', status: 'open', floor: 3 }] },
}, {});
console.log('selftest proposals', J(ccP2));
const ccP3 = CC.proposeCandidates({
  commitments: { items: [{ id: 'q1', actor: '甲', content: '答应', status: 'open', floor: 2 }] },
  seeds: { items: [{ id: 'q2', hook: '甲在此埋下伏笔', status: 'open', floor: 3 }] },
}, {});
console.log('单字主体提议数', ccP3.length);
const ccP4 = CC.proposeCandidates({
  commitments: { items: [{ id: 'r1', actor: '张三', content: '答应', status: 'open', floor: 2 }] },
  seeds: { items: [{ id: 'r2', hook: '无关联的埋点', status: 'open', floor: 3 }] },
}, {});
console.log('文本不含名提议数', ccP4.length);
const ccP5 = CC.proposeCandidates({
  commitments: { items: [{ id: 't1', actor: '张三', content: '答应', status: 'open', floor: 2 }] },
  seeds: { items: [{ id: 't2', hook: '张三的事', status: 'open', floor: 20 }] },
}, {});
console.log('超出 maxGap 提议数', ccP5.length);
console.log('selfCheck', J(CC.selfCheck(ccSrc)));

console.log('== PC 四格 ================================================');
const traces = [
  { character: '甲', fact: '亲眼所见', action: 'acquire', floor: 2 },
  { character: '甲', fact: '听人说的', action: 'acquire', via: 'told', floor: 3 },
  { character: '甲', fact: '误信的事', action: 'misbelieve', floor: 4 },
  { character: '甲', fact: '确实不知道', action: 'unaware', floor: 5 },
  { character: '甲', fact: '只是起疑', action: 'doubt', floor: 6 },
  { character: '甲', fact: '撤回过', action: 'retract', revoked: true, floor: 7 },
];
const pc1 = PC.build(traces, {});
console.log('counts', J(pc1.counts));
console.log('card0', J({ c: pc1.cards[0].character, counts: pc1.cards[0].counts, unrecorded: pc1.cards[0].unrecorded, viaUnknown: pc1.cards[0].viaUnknown }));
console.log('slots', J(PC.slotOf({ action: 'acquire', via: 'rumor' })), J(PC.slotOf({ action: 'acquire' })), J(PC.slotOf({ action: 'doubt' })));
console.log('line', PC.line(pc1));
const pcAt = PC.build(traces, { at: 3 });
console.log('at 3 counts', J(pcAt.counts));
const pcNoFloor = PC.build([{ character: '甲', fact: '没楼层', action: 'acquire' }], { at: 5 });
console.log('noFloor at5', J(pcNoFloor.counts), 'cards', pcNoFloor.cards.length);
const pcAtNull = PC.build(traces, { at: null });
console.log('at null atKnown', pcAtNull.atKnown, 'lived', pcAtNull.counts.lived);
const pcChar = PC.build(traces, { character: '乙' });
console.log('only 乙 cards', pcChar.cards.length);
const pcBad = PC.build([{ character: '', fact: '' }, null, 5], {});
console.log('malformed', J(pcBad.counts), 'malformedInput', pcBad.malformedInput);
console.log('selfCheck', J(PC.selfCheck(traces)));

console.log('== PC contrast ============================================');
const a = PC.build([{ character: '甲', fact: '共有事实', action: 'acquire', floor: 1 }, { character: '甲', fact: '只有左边', action: 'acquire', floor: 2 }, { character: '甲', fact: '左边误信', action: 'misbelieve', floor: 3 }], { character: '甲' });
const b = PC.build([{ character: '乙', fact: '共有事实', action: 'acquire', via: 'told', floor: 1 }, { character: '乙', fact: '只有右边', action: 'acquire', floor: 2 }], { character: '乙' });
const ct = PC.contrast(a.cards[0], b.cards[0]);
console.log('onlyLeft', J(ct.diff.onlyLeft.map((x) => x.fact)), 'onlyRight', J(ct.diff.onlyRight.map((x) => x.fact)), 'shared', J(ct.diff.shared.map((x) => x.fact)), 'misledSide', J(ct.diff.misledSide.map((x) => x.fact)));
console.log('known', ct.known, 'leftPresent', ct.leftPresent);
const ct2 = PC.contrast(a.cards[0], null);
console.log('缺右侧 known', ct2.known, 'rightPresent', ct2.rightPresent, 'onlyLeft', ct2.diff.onlyLeft.length);
'''
io.open(OUT, 'w', encoding='utf-8').write(SRC)
print('[probe] wrote', OUT, os.path.getsize(OUT), 'bytes')