/* tools/v3326_probe.mjs — [v3.326.0 · A1 第九刀] 真跑读数探针(供 v3326 套件写期望值)。
 *   与判据同走法:隔离 vm 里加载 IIFE 模块(window 即全局、module 缺席)。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
function loadIIFE(src, globalName) {
    const ctx = { console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math, isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const GC = loadIIFE(read('memory-gc.js'), 'LonShaMemoryGc');
const out = {};

/* 1 结构面 */
out.exports = Object.keys(GC).sort();
out.frozen = Object.isFrozen(GC);
out.ledgerKeys = GC.LEDGER_KEYS.slice();
out.selfCheck = GC.selfCheck();
const src = read('memory-gc.js');
out.noRequire = !src.includes('require(');
out.noFetch = !src.includes('fetch(');
out.noStorage = !src.includes('localStorage') && !src.includes('indexedDB');

/* 2 综合用例:五路各命中 */
const mkVec = (text, ts, imp, acc) => ({ text, timestamp: ts, importance: imp, accessCount: acc });
const vectors = [
    mkVec('甲', 100, 9, 40), mkVec('甲', 200, 9, 40),
    mkVec('乙', 300, 1, 0), mkVec('丙', 400, 1, 0), mkVec('丁', 500, 1, 0), mkVec('戊', 600, 1, 0),
];
const summaries = [
    { floor: 1, folded: true, text: 's1' }, { floor: 2, folded: true, text: 's2' },
    { floor: 3, folded: true, text: 's3' }, { floor: 4, folded: false, text: 's4' },
];
const nodes = new Map([
    ['n1', { id: 'n1', type: 'character', name: '苏晴', timestamp: 10 }],
    ['n2', { id: 'n2', type: 'character', name: '苏晴', timestamp: 20 }],
    ['n3', { id: 'n3', type: 'place', name: '苏晴', timestamp: 5 }],
]);
const edges = new Map([
    ['n2-n1-x', { id: 'n2-n1-x', from: 'n2', to: 'n1', label: 'x' }],
    ['n3-n2-y', { id: 'n3-n2-y', from: 'n3', to: 'n2', label: 'y' }],
]);
const chat = [
    { is_user: false, mes: 'a', send_date: '2026-01-01', swipes: ['a', 'a2'] },
    { is_user: true, mes: 'b', send_date: '2026-01-02', swipes: ['b'] },
];
const hash32 = (s) => { let h = 0x811c9dc5; for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; };
const msgFpOf = (m) => 'fp:' + hash32(m.mes);
const realFp = msgFpOf(chat[0]);
const items2 = [
    { floor: 0, fp: 'nope' },
    { floor: 9, fp: 'nope' },
    { floor: 0, fp: 'x', carried: true },
    { floor: 0 },
    null,
    { floor: 0, fp: realFp },
];
const r = GC.runGc({
    vectors, summarySummaries: summaries, itemOps: items2,
    graphNodes: nodes, graphEdges: edges,
    vectorMaxCount: 4, summaryMaxCount: 3, nowMs: 1e12,
    chat, msgFpOf, hash32,
    normalizeName: (s) => String(s || '').trim(),
    dependencyClosure: { computeCascade: () => ({ keptIds: ['n1', 'n3'] }) },
});
out.ledger = r.ledger;
out.removed = r.removed;
out.vectorTexts = r.vectors.map((v) => v.text);
out.vectorLen = r.vectors.length;
out.sumFloors = r.summaries.map((s) => s.floor);
out.dupIds = r.dupIds;
out.nodeIds = [...r.nodes.keys()];
out.edgeIds = [...r.edges.keys()];
out.cascade = r.cascade;
out.zeroWrite = r.zeroWrite;
out.threw = { orphan: r.orphanThrew, graph: r.graphThrew, cascade: r.cascadeThrew };
out.inputUntouched = {
    vectorsLen: vectors.length, summariesLen: summaries.length, itemsLen: items2.length,
    nodesLen: nodes.size, edgesLen: edges.size, nodeKeys: [...nodes.keys()],
};
out.line = GC.line(out.ledger);

/* 3 零删除与「模块缺席」不同形 */
const empty = GC.runGc({ vectors: [], summarySummaries: [], itemOps: [], graphNodes: new Map(), graphEdges: new Map(), nowMs: 0 });
out.emptyLedger = empty.ledger;
out.emptyRemoved = empty.removed;
out.emptyCascade = empty.cascade;
out.emptyThrew = { orphan: empty.orphanThrew, graph: empty.graphThrew, cascade: empty.cascadeThrew };

/* 4 第 5 路抛:前三路+零写 */
class BadNodes extends Map { values() { throw new Error('graphboom'); } }
const badNodes = new BadNodes(nodes);
const r2 = GC.runGc({
    vectors, summarySummaries: summaries, itemOps: [], graphNodes: badNodes, graphEdges: edges,
    vectorMaxCount: 4, summaryMaxCount: 3, nowMs: 1e12,
});
out.graphThrewCase = { ledger: r2.ledger, graphThrew: r2.graphThrew, nodesSame: r2.nodes === badNodes, vectorLen: r2.vectors.length };

/* 5 第 4 路抛:前三路读数不丢 */
const r3 = GC.runGc({
    vectors, summarySummaries: summaries, itemOps: items2, graphNodes: nodes, graphEdges: edges,
    vectorMaxCount: 4, summaryMaxCount: 3, nowMs: 1e12, chat, msgFpOf: () => { throw new Error('fphoom'); }, hash32,
});
out.orphanThrewCase = { ledger: r3.ledger, orphanThrew: r3.orphanThrew, itemsLen: r3.items.length };

/* 6 闭包归因:dc 缺席 / dc 抛 */
out.cascadeAbsent = GC.cascadeReadout(null, new Map(), new Map(), 0);
class BadDC { computeCascade() { throw new Error('dcboom'); } }
const r4 = GC.runGc({ vectors: [], summarySummaries: [], itemOps: [], graphNodes: new Map(), graphEdges: new Map(), nowMs: 0, dependencyClosure: new BadDC() });
out.cascadeThrewCase = { cascade: r4.cascade, cascadeThrew: r4.cascadeThrew };

/* 7 第 1 路不额外兜底:畸形元素与修前同口径抛 */
let dedupeThrew = null;
try { GC.dedupeByText([{ text: 'a' }, null]); } catch (e) { dedupeThrew = e.constructor.name; }
out.dedupeThrewOnNull = dedupeThrew;

/* 8 capSummaries 只删 folded */
out.capSummariesNoFold = GC.capSummaries([{ floor: 1, text: 'x' }, { floor: 2, text: 'y' }], 1);

/* 9 orphanOps 读不到 chat ⇒ 不动 */
out.orphanNoChat = GC.orphanOpsOf([{ floor: 0, fp: 'z' }], null, msgFpOf, hash32);

/* 10 宿主侧特征 */
const IDX = read('index.js');
out.host = {
    hasLib: IDX.includes('function _memoryGcLib()'),
    libBody: (IDX.match(/function _memoryGcLib\(\) \{[^}]*\}/) || [''])[0],
    hasApply: IDX.includes('const GC = _memoryGcLib();'),
    absentPath: IDX.includes('this._lastGcLedger = null;'),
    noInline1: !IDX.includes('1 + Math.log10(1 + ageH)'),
    noInline2: !IDX.includes('const foldedOld = list.filter'),
    noInline3: !IDX.includes('byName.set(key, keep)'),
    keepLedger: IDX.includes('this._lastGcLedger = _gcLedger'),
    gcFull: IDX.includes("'vecDup=' + _gcLedger.vecDup"),
    gcCompact: IDX.includes("'vd=' + _gcLedger.vecDup"),
    lenGuard: IDX.includes('_gcFull.length <= 80'),
    oplog: /this\.opLog\?\.log\('gc', 'remove',/.test(IDX),
    removedGuard: /if \(_r\.removed\) \{/.test(IDX),
};
const MF = JSON.parse(read('manifest.json'));
out.manifest = { n: MF.extra_js.length, tail: MF.extra_js.slice(-3), fileCount: fs.readdirSync(R).filter((f) => f.endsWith('.js') && !f.endsWith('.bak')).length };

console.log(JSON.stringify(out, null, 1));