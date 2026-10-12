/* v3.324.0 探针：D 包记忆侧第一刀（M3-O5 / M3-O7 / M3-X9）真跑读数。
 * 目的：把两个内核的**真实行为**跑成数，判据的期望值据此写，不从实现注释里抄。
 * 用法：node tools/v3324_probe.mjs > /tmp/v3324_probe.out 2>&1
 */
import { createRequire } from 'module';
const require = createRequire('/home/user/lonsha-memory-plugin/');
const ED = require('/home/user/lonsha-memory-plugin/extraction-driver.js');
const CP = require('/home/user/lonsha-memory-plugin/correction-plan.js');
const FB = require('/home/user/lonsha-memory-plugin/extract-feedback.js');

const out = [];
const P = (...a) => out.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));

P('===== A. extraction-driver 常量 =====');
P('ED_VERSION', ED.ED_VERSION, 'ED_KIND', ED.ED_KIND);
P('PROFILES', ED.PROFILES.join(','));
P('SIGNALS', ED.SIGNALS.join(','));
P('SIGNAL_TYPES.identity', ED.SIGNAL_TYPES.identity.join('+'));
P('CORE_TYPES', ED.CORE_TYPES.join(','));
P('PROFILE_RULES', JSON.stringify(ED.PROFILE_RULES));
P('DEFAULT_MARKERS.identity', ED.DEFAULT_MARKERS.identity.join('|'));

P('===== B. floorOrNull 形态 =====');
for (const v of [0, 3, '4', -1, 1.9, '', null, undefined, true, {}, [], NaN, 'x']) {
  P('floorOrNull', JSON.stringify(v), '=>', JSON.stringify(ED.floorOrNull(v)));
}

P('===== C. detect / classify =====');
const d1 = ED.detect('她低下头：其实我是珞花。', 7);
P('detect.structural', JSON.stringify({ floor: d1.floor, signals: d1.signals, chars: d1.chars, empty: d1.empty }));
const d2 = ED.detect('', 9);
P('detect.empty', JSON.stringify({ floor: d2.floor, signals: d2.signals, chars: d2.chars, empty: d2.empty }));
const d3 = ED.detect('我答应你，一定会等你回来。', 12);
P('detect.commitment', JSON.stringify({ signals: d3.signals, hits: d3.hits }));
const c1 = ED.classify({ floor: 7, text: '其实我是珞花，这是我本来的名字' }, {});
P('classify.identity', JSON.stringify({ kind: c1.kind, signals: c1.signals, types: c1.types }));
const c2 = ED.classify({ floor: 8, text: '今天的天气不错。' }, {});
P('classify.chitchat', JSON.stringify({ kind: c2.kind, signals: c2.signals, types: c2.types }));
const c3 = ED.classify({ floor: 9, text: '   ' }, {});
P('classify.unreadable', JSON.stringify({ kind: c3.kind, chars: c3.chars }));
const c4 = ED.classify({ text: '其实我是谁' }, {});
P('classify.noFloor', JSON.stringify({ floor: c4.floor, kind: c4.kind }));

P('===== D. plan 三档（同一输入） =====');
const mkEntries = () => ([
  { floor: 7, text: '她小声说：其实我是珞花。' },
  { floor: 8, text: '嗯，今天天气不错。' },
  { floor: 9, text: '' },
  { floor: 10, text: '我把钥匙交给你了。' },
  { floor: 11, text: '哈哈，是吗。' },
]);
for (const p of ED.PROFILES) {
  const r = ED.plan({ floor: 11, entries: mkEntries(), profile: p, cadenceActive: ['character', 'relation', 'diary', 'reflect'], missedFloors: [3, 5, null], regenFloors: [7] }, {});
  P('--- profile', p);
  P('  due', JSON.stringify(r.due.map((d) => ({ f: d.floor, s: d.signals, t: d.types, w: d.why }))));
  P('  batched(all)', JSON.stringify(r.batched.map((b) => ({ f: b.floor, due: b.dueAtFloor, ov: !!b.overflowToNextBatch, w: b.why }))));
  P('  batchThisRound', r.batchThisRound.length, 'overflowCount', r.readings.batchOverflow, 'batchThisRoundCount', r.readings.batchKept, 'deferredBatchCalls', r.readings.deferredBatchCalls);
  P('  overflowReason', r.batchThisRound.map((b) => b.floor), '|', r.batched.filter((b) => b.overflowToNextBatch).map((b) => b.floor));
  P('  deferredTypes', JSON.stringify(r.deferredTypes));
  P('  periodicTypes', r.readings.periodicTypes, 'nextBatchFloor', r.nextBatchFloor);
  P('  unreadable', JSON.stringify(r.unreadable), 'noFloor', JSON.stringify(r.noFloor));
  P('  missed', JSON.stringify(r.missed));
  P('  regen', JSON.stringify(r.regen));
  P('  readings', JSON.stringify(r.readings));
  P('  flags', JSON.stringify({ zeroWrite: r.zeroWrite, malformedInput: r.malformedInput, degraded: r.degraded, profileKnown: r.profileKnown, kind: r.kind, version: r.version }));
  P('  line', ED.line(r));
}

P('===== E. 批处理溢出与不丢 =====');
const many = [];
for (let i = 1; i <= 9; i++) many.push({ floor: i, text: '嗯嗯。' });
const rOver = ED.plan({ floor: 9, entries: many, profile: 'low-cost' }, {});
P('manyChitchat considered', rOver.readings.considered, 'batched(all)', rOver.batched.length,
  'thisRound', rOver.batchThisRound.length, 'overflow', rOver.readings.batchOverflow,
  'overflowMarked', rOver.batched.filter((b) => b.overflowToNextBatch).length,
  'deferredCalls', rOver.readings.deferredBatchCalls);
const rQ = ED.plan({ floor: 9, entries: many, profile: 'quality' }, {});
P('quality maxBatch1 kept', rQ.batchThisRound.length, 'batchedAll', rQ.batched.length, 'overflow', rQ.readings.batchOverflow, 'nextBatchFloor', rQ.nextBatchFloor);

P('===== F. 档位未知 / 畸形入参 =====');
const rU = ED.plan({ floor: 11, entries: mkEntries(), profile: 'turbo' }, {});
P('unknownProfile ->', rU.profile, 'profileKnown', rU.profileKnown, 'rules', JSON.stringify(rU.rules));
P('undefinedProfile ->', ED.plan({ floor: 11, entries: mkEntries() }, {}).profileKnown);
const rArr = ED.plan([{ floor: 1, text: 'x' }], {});
P('arrayInput', JSON.stringify({ malformedInput: rArr.malformedInput, considered: rArr.readings.considered, due: rArr.due.length, zeroWrite: rArr.zeroWrite }));
const rBadEntries = ED.plan({ floor: 11, entries: 'nope' }, {});
P('entriesNonArray', JSON.stringify({ malformedInput: rBadEntries.malformedInput, considered: rBadEntries.readings.considered }));
const rNoFloor = ED.plan({ entries: mkEntries() }, {});
P('noFloorInput nextBatchFloor', rNoFloor.nextBatchFloor, 'dueFloors', JSON.stringify(rNoFloor.due.map((x) => x.floor)));
const rNull = ED.plan(null, {});
P('nullInput', JSON.stringify({ considered: rNull.readings.considered, malformedInput: rNull.malformedInput, degraded: rNull.degraded }));
const rRegenNone = ED.plan({ floor: 11, entries: mkEntries(), profile: 'balanced' }, {});
P('regenNone', JSON.stringify({ scoped: rRegenNone.regen.scoped, floors: rRegenNone.regen.floors, untouched: rRegenNone.regen.untouched, why: rRegenNone.regen.why }));

P('===== G. markers 注入（逐类覆盖） =====');
const rM = ED.plan({ floor: 3, entries: [{ floor: 3, text: '「圣光在上」他低语。' }], profile: 'balanced' },
  { markers: { identity: ['圣光在上'] } });
P('injectedIdentity', JSON.stringify(rM.due.map((x) => ({ f: x.floor, s: x.signals }))));
const rM2 = ED.plan({ floor: 3, entries: [{ floor: 3, text: '我答应你。' }], profile: 'balanced' },
  { markers: { identity: ['圣光在上'] } });
P('overrideKeepsOthers', JSON.stringify(rM2.due.map((x) => ({ f: x.floor, s: x.signals }))));
P('markersOf keys', ED.markersOf({}).identity.length, ED.markersOf({ markers: { identity: [] } }).identity.length);
const rM3 = ED.plan({ floor: 3, entries: [{ floor: 3, text: '其实我是谁' }], profile: 'balanced' },
  { markers: { identity: [] } });
P('emptyMarkersDisables', JSON.stringify({ due: rM3.due.length, batched: rM3.batched.length, kind: rM3.batched[0] && rM3.batched[0].why }));

P('===== H. 即时性不可被档位降掉（反向对照） =====');
const rImm = {};
for (const p of ED.PROFILES) {
  const rr = ED.plan({ floor: 4, entries: [{ floor: 4, text: '我答应你，这件事我绝不反悔。' }], profile: p }, {});
  rImm[p] = { due: rr.due.length, batched: rr.batched.length, readings: rr.readings.structuralImmediate };
}
P('immediateByProfile', JSON.stringify(rImm));

P('===== I. ED selfCheck / 幂等 =====');
P('selfCheck', JSON.stringify(ED.selfCheck()));
const ra = ED.plan({ floor: 11, entries: mkEntries(), profile: 'balanced', missedFloors: [3] }, {});
const rb = ED.plan({ floor: 11, entries: mkEntries(), profile: 'balanced', missedFloors: [3] }, {});
P('deterministic', JSON.stringify(ra) === JSON.stringify(rb));
P('serializable', JSON.parse(JSON.stringify(ra)).kind);
P('line.empty', ED.line(null), '|', ED.line({ degraded: true }), '|', ED.line({ reason: 'module-unavailable' }));

P('');
P('===== J. correction-plan 常量 =====');
P('CP_VERSION', CP.CP_VERSION, 'CP_KIND', CP.CP_KIND);
P('FACES', CP.FACES.join(','), 'STAGES', CP.STAGES.join(','), 'OUTCOMES', CP.OUTCOMES.join(','), 'KINDS', CP.KINDS.join(','));
P('UNDO_KINDS', CP.UNDO_KINDS.join(','));
P('CLASS_CANDIDATES keys', Object.keys(CP.CLASS_CANDIDATES).join(','));
P('CLASS_CANDIDATES spec', JSON.stringify(CP.CLASS_CANDIDATES));
const fbClasses = FB.PROBLEM_CLASSES;
const fbKeys = Array.isArray(fbClasses) ? fbClasses.map((x) => (typeof x === 'string' ? x : x.key || x.cls || x.id))
  : Object.keys(fbClasses || {});
P('extract-feedback PROBLEM_CLASSES 形态', Array.isArray(fbClasses) ? 'array' : typeof fbClasses, 'keys', fbKeys.join(','));
P('keySetAligned', JSON.stringify(fbKeys.slice().sort()) === JSON.stringify(Object.keys(CP.CLASS_CANDIDATES).slice().sort()));

P('===== K. floorRange 六态 =====');
const FR = [
  ['no-range', undefined], ['empty-range', []], ['single', 5], ['single-str', '7'],
  ['pair-array', [3, 9]], ['pair-obj', { from: 3, to: 9 }], ['reversed', { from: 9, to: 3 }],
  ['endpoint-unreadable', { from: 3, to: null }], ['no-usable-floor', ['a', 'b']],
  ['dropped-unreadable', [3, 'x', 9]], ['unreadable-floor', 'zzz'], ['unsorted-array', [9, 3, 5]],
];
for (const [name, v] of FR) P('floorRange', name, '=>', JSON.stringify(CP.floorRange(v)));

P('===== L. planReextract 全读数 =====');
const oldFacts = [
  { key: 'f1', value: '女主在北京', floor: 3, sourceRef: 'floor:3' },
  { key: 'f2', value: '同事关系', floor: 4, sourceRef: 'floor:4' },
  { key: 'f7', value: '范围外旧值', floor: 12, sourceRef: 'floor:12' },
];
const newFacts = [
  { key: 'f1', value: '女主在上海', floor: 3, sourceRef: 'floor:3', stale: true },
  { key: 'f2', value: '同事关系', floor: 4, sourceRef: 'floor:4' },
  { key: 'f3', value: '新事实', floor: 5, sourceRef: 'floor:5' },
  { key: 'f3', value: '新事实重复', floor: 5, sourceRef: 'floor:5' },
  { key: 'f4', value: '同键未标换代', floor: 4 },
  { key: 'f8', value: '范围外新值', floor: 20, sourceRef: 'floor:20' },
  { value: '无键事实', floor: 4, sourceRef: 'floor:4' },
  { sourceRef: 'x' },
];
const rX9 = CP.planReextract({
  range: { from: 3, to: 5 }, oldFacts, newFacts,
  selections: [{ key: 'f2', decision: 'selected' }, { key: 'f3', decision: 'rejected' }],
  failed: [{ key: 'f9', value: 'x' }, { key: 'f9', value: 'y' }],
  rewritten: [3, 4, null],
}, {});
P('scope', JSON.stringify(rX9.scope));
P('items', JSON.stringify(rX9.items.map((i) => ({ k: i.key, f: i.floor, o: i.outcome, d: i.decision, ev: i.evidenceComplete, req: i.requiresUserChoice }))));
P('byOutcome', JSON.stringify(rX9.byOutcome));
P('staged', JSON.stringify(rX9.staged));
P('untouched', rX9.untouched);
P('rewritten', JSON.stringify(rX9.rewritten));
P('retry', JSON.stringify(rX9.retry));
P('readings', JSON.stringify(rX9.readings));
P('flags', JSON.stringify({ writes: rX9.writes, applied: rX9.applied, zeroWrite: rX9.zeroWrite, scoped: rX9.scoped, decidable: rX9.decidable, malformedInput: rX9.malformedInput, degraded: rX9.degraded, kind: rX9.kind }));
P('line', CP.line(rX9));

P('===== M. 未圈范围 / 颠倒范围 / 端点读不到（三个「不产提案」） =====');
for (const [name, rng] of [['null', null], ['undefined', undefined], ['empty', []], ['reversed', { from: 9, to: 3 }], ['endpoint-null', { from: 3, to: null }], ['junk', ['x']]]) {
  const rr = CP.planReextract({ range: rng, oldFacts, newFacts }, {});
  P('  noProposal', name, JSON.stringify({ scoped: rr.scoped, decidable: rr.decidable, items: rr.items.length, writes: rr.writes, untouched: rr.untouched, why: rr.why, scopeReason: rr.scope.reason }));
}
P('inScope on unknown', CP.inScope(CP.floorRange(null), 3), CP.inScope(CP.floorRange({ from: 9, to: 3 }), 3));
P('inScope explicit', CP.inScope(CP.floorRange([3, 5, 9]), 5), CP.inScope(CP.floorRange([3, 5, 9]), 4));

P('===== N. 幂等 / 只读（真跑对照） =====');
const snapN = JSON.stringify(newFacts);
const idem = [];
for (let i = 0; i < 3; i++) idem.push(CP.planReextract({ range: { from: 3, to: 5 }, oldFacts, newFacts }, {}).items.filter((x) => x.key === 'f3').length);
P('f3 items per run', JSON.stringify(idem), 'duplicatesPrevented', CP.planReextract({ range: { from: 3, to: 5 }, oldFacts, newFacts }, {}).retry.duplicatesPrevented);
P('inputUnchanged', snapN === JSON.stringify(newFacts));
const rOne = CP.planReextract({ range: 4, oldFacts, newFacts }, {});
P('singleFloorScope', JSON.stringify({ scope: rOne.scope, keys: rOne.items.map((i) => i.key), untouched: rOne.untouched }));

P('===== O. planConfigFix =====');
const mkFb = (cls) => ({ cls });
for (const [name, trace] of [
  ['absent', {}],
  ['unmeasurable', { compare: { measurable: false, reason: 'no-baseline' } }],
  ['compareNotOk', { compare: { measurable: true, ok: false } }],
  ['measured+holdoutImproved', { compare: { measurable: true }, holdout: { measured: true, improved: true }, before: { facts: 10, budget: 5 }, after: { facts: 7, budget: 3 } }],
  ['measured+holdoutNotImproved', { compare: { measurable: true }, holdout: { measured: true, improved: false }, before: { facts: 10, budget: 5 }, after: { facts: 10, budget: 5 } }],
  ['measured+holdoutRegressed', { compare: { measurable: true }, holdout: { measured: true, improved: false, regressed: true }, before: { facts: 10, budget: 5 }, after: { facts: 12, budget: 6 } }],
  ['measured+noHoldout', { compare: { measurable: true }, before: { facts: 10 }, after: { facts: 9 } }],
  ['measuredButNoNumbers', { compare: { measurable: true }, holdout: { measured: true, improved: true } }],
]) {
  const r = CP.planConfigFix(mkFb('missed'), trace, { range: { from: 3, to: 5 } });
  P('  trace', name, '=> state', r.compareState, 'proof', r.proof, 'decidable', r.decidable, 'count', r.count,
    'needsMeasure', r.candidates[0].needsMeasure, 'countsMeasured', r.candidates[0].compare.countsMeasured,
    'delta', JSON.stringify(r.candidates[0].compare.delta));
  P('     why:', r.candidates[0].proofWhy);
}
const rCfg = CP.planConfigFix([mkFb('missed'), mkFb('wrong-role'), mkFb('unknown-thing')], { compare: { measurable: true }, holdout: { measured: true, improved: true }, before: { facts: 10, budget: 5 }, after: { facts: 7, budget: 3 } }, { range: 3, now: 42 });
P('multiCandidate', JSON.stringify({ count: rCfg.count, unknownClass: rCfg.unknownClass, ids: rCfg.candidates.map((c) => c.id), kinds: rCfg.candidates.map((c) => c.kind), targets: rCfg.candidates.map((c) => c.target), subs: rCfg.candidates.map((c) => c.substitute.key) }));
P('undo', JSON.stringify(rCfg.undo));
P('flags', JSON.stringify({ applied: rCfg.applied, defaultAuto: rCfg.defaultAuto, writes: rCfg.writes, zeroWrite: rCfg.zeroWrite, proof: rCfg.proof, decidable: rCfg.decidable }));
P('compareDetail', JSON.stringify(rCfg.candidates[0].compare), 'proofWhy', rCfg.candidates[0].proofWhy);
P('line', CP.line(rCfg));
const rNoFb = CP.planConfigFix(null, null, {});
P('noFeedback', JSON.stringify({ count: rNoFb.count, reason: rNoFb.reason, decidable: rNoFb.decidable, writes: rNoFb.writes, candidates: rNoFb.candidates.length, undoSeparate: rNoFb.undo.separate, kind: rNoFb.kind }));
P('line.noFeedback', CP.line(rNoFb));
P('line.noRead', CP.line(null), '|', CP.line('x'), '|', CP.line({}));

P('===== P. CP selfCheck / 幂等 / 序列化 =====');
P('selfCheck', JSON.stringify(CP.selfCheck()));
const pc1 = CP.planReextract({ range: { from: 3, to: 5 }, oldFacts, newFacts }, {});
const pc2 = CP.planReextract({ range: { from: 3, to: 5 }, oldFacts, newFacts }, {});
P('deterministic', JSON.stringify(pc1) === JSON.stringify(pc2));
P('serializable', JSON.parse(JSON.stringify(pc1)).kind);
P('line.empty', CP.line(null), '|', CP.line({ degraded: true }), '|', CP.line({ reason: 'module-unavailable' }));

P('');
P('===== Q. factKey / factValue 退化路径 =====');
for (const f of [
  { key: 'K1' }, { factId: 'K2' }, { id: 'K3' }, { predicate: '住在', subject: '珞花', floor: 3 },
  { pred: '住', who: 'A', floor: null }, { kind: 'event', actor: 'B' }, {}, null, 'str',
]) P('factKey', JSON.stringify(f), '=>', JSON.stringify(CP.factKey(f)), 'value', JSON.stringify(CP.factValue(f)));

P('===== R. 恒定键面（早退面 vs 正常路径逐字同键） =====');
const normalX9 = CP.planReextract({ range: { from: 3, to: 5 }, oldFacts, newFacts }, {});
const earlyX9 = CP.planReextract({ range: null, oldFacts, newFacts }, {});
const kNormal = Object.keys(normalX9).join(',');
const kEarly = Object.keys(earlyX9).join(',');
P('X9 键面同形', kNormal === kEarly, '缺', Object.keys(normalX9).filter((k) => !(k in earlyX9)).join('|') || '—');
P('X9 normalKeys', kNormal);
const normalCfg = CP.planConfigFix({ cls: 'missed' }, { compare: { measurable: true } }, {});
const earlyCfg = CP.planConfigFix(null, null, {});
const kc1 = Object.keys(normalCfg).join(','), kc2 = Object.keys(earlyCfg).join(',');
P('CFG 键面同形', kc1 === kc2, '缺', Object.keys(normalCfg).filter((k) => !(k in earlyCfg)).join('|') || '—');
P('CFG normalKeys', kc1);
P('ED null vs undefined malformedInput', ED.plan(null, {}).malformedInput, ED.plan(undefined, {}).malformedInput, ED.plan({}, {}).malformedInput);
P('CP null vs undefined malformedInput', CP.planReextract(null, {}).malformedInput, CP.planReextract(undefined, {}).malformedInput);

process.stdout.write(out.join('\n') + '\n');
