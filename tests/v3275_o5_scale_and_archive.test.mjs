// tests/v3275_o5_scale_and_archive.test.mjs — v3.275.0 O5：长对话规模、缓存与归档治理
//
//   [v3.275.0 O5] 计划原文三条验收：① 规模上升**不静默漏可用记忆**；② 归档或 tombstone
//   **不抹掉审计 provenance**；③ 同输入真命中缓存 / 改楼切聊真失效。前两条此前没有出口：
//     · 召回产物的「入选依据」清单在宿主侧被 `.slice(0, 200)` **静默截断**后落盘，
//       产物于是声称「本轮的依据就是这 200 条」；规模越大这条读数越窄，而**没有任何一面**说它被截过。
//       `isArtifactStale` 的 missing/ratio 也只在那 200 条上算 —— 窄读数被当成全量读数。
//     · 归档面（`_archivedFloorIds`）在删楼/回滚时按「失去依据」被剪枝，
//       但**剪掉了什么、为什么**没有留下可查的 provenance（只剩一个计数）。
//   本版把两处补成「可自述的读数」，并把量测台（cache-workload）真跑一遍作为规模证据。
//
// 覆盖：
//   A 依据清单截断自述（真总数 / 是否截 / 不可测记 null 不倒推 / 覆盖范围随 stale 一起给出）
//   B 规模面（量测台真跑：四条曲线 + 同输入命中 + 改楼失效；窄读数可见性）
//   C 归档 provenance（剪枝/位移**留痕**：剪了哪些、为什么；不抹掉出处）
//   D 负控制（真源码破坏 → 副本上重跑同款判据；工具两向自证；判据纯度）
//   E 版本锚（下限形 3.275.0）
//
// 边界（诚实）：量测台是**合成数据 + 真模块**，读数不代表实机性能；本套件证明的是
//   「窄读数与出处不会静默消失」，不证明任何性能目标。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { breakSource } from './_break_kit.mjs';
import { codeLines } from './_audit_lib.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const requireFromHere = createRequire(import.meta.url);
const RA = requireFromHere(path.join(ROOT, 'recall-artifact.js'));
const WL = requireFromHere(path.join(ROOT, 'cache-workload.js'));
const IDX_SRC = read('index.js');
const RA_SRC = read('recall-artifact.js');
const CL_SRC = read('cost-ledger.js');
const LR_SRC = read('ledger-replay.js');


const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v3275-'));
let tmpN = 0;

/* ══════════════ A. 依据清单：截断必须自述 ══════════════ */

test('v3275 A1. ★★ 依据清单真总数与截断自述：不传总数记 null，绝不拿保留数冒充', () => {
    const few = RA.createArtifact({ turnId: 't1', selectedMemoryIds: ['a', 'b', 'c'], selectedMemoryIdsTotal: 3 });
    assert.equal(few.selectedMemoryIds.length, 3);
    assert.equal(few.selectedMemoryIdsTotal, 3, '真总数在场');
    assert.equal(few.selectedMemoryIdsTruncated, false, '没超上界 ⇒ 没截');
    const unknown = RA.createArtifact({ turnId: 't2', selectedMemoryIds: ['a', 'b'] });
    assert.equal(unknown.selectedMemoryIdsTotal, null, '★ 不传总数 ⇒ null（不可测），不是 2');
    assert.equal(unknown.selectedMemoryIdsTruncated, null, '★ 同为 null（不可测与「没截」必须可分）');
    assert.notEqual(unknown.selectedMemoryIdsTruncated, false, '★ 不可测不得塌陷成「没截」');
});

test('v3275 A2. ★★ 超上界：保留上界条数 + 如实标截 + 总数是真总数', () => {
    const many = [];
    for (let i = 0; i < RA.MAX_SELECTED_IDS + 37; i++) many.push('mem_' + i);
    const art = RA.createArtifact({ turnId: 't3', selectedMemoryIds: many, selectedMemoryIdsTotal: many.length });
    assert.equal(art.selectedMemoryIds.length, RA.MAX_SELECTED_IDS, '保留恰为上界');
    assert.equal(art.selectedMemoryIdsTotal, many.length, '总数是真总数');
    assert.equal(art.selectedMemoryIdsTruncated, true, '★ 必须如实标「被截」');
    assert.notEqual(art.selectedMemoryIdsTotal, art.selectedMemoryIds.length, '总数 ≠ 保留数');
    const dup = RA.createArtifact({ turnId: 't4', selectedMemoryIds: ['x', 'x', 'y'], selectedMemoryIdsTotal: 3 });
    assert.equal(dup.selectedMemoryIds.length, 2, '去重后 2 条');
    /* 口径：调用方给的总数**按面值取**，只向上补到保留数（作下界）。
     *   不静默下调是刻意的：下调会把「被截」读成「没截」，那是本版要治的方向。
     *   （真实调用方传的就是已去重数组的 length，两者恒等。） */
    assert.equal(dup.selectedMemoryIdsTotal, 3, '★ 调用方的总数不被静默下调（下调=隐藏截断）');
});

test('v3275 A3. ★★ 失效判定的覆盖范围随读数一起给出（窄读数必须看得出来）', () => {
    const full = RA.createArtifact({ turnId: 't5', selectedMemoryIds: ['a', 'b', 'c'], selectedMemoryIdsTotal: 3 });
    const s1 = RA.isArtifactStale(full, new Set(['a']));
    assert.equal(s1.checked, 3);
    assert.equal(s1.selectedTotal, 3);
    assert.equal(s1.truncated, false, '没截 ⇒ 判据覆盖全量');
    assert.ok(Math.abs(s1.ratio - 2 / 3) < 1e-3, 'ratio 是真读数（toFixed(4) 精度内）');
    const many = [];
    for (let i = 0; i < RA.MAX_SELECTED_IDS + 10; i++) many.push('m' + i);
    const cut = RA.createArtifact({ turnId: 't6', selectedMemoryIds: many, selectedMemoryIdsTotal: many.length });
    const s2 = RA.isArtifactStale(cut, new Set(many));
    assert.equal(s2.checked, RA.MAX_SELECTED_IDS, '只查了清单内这些');
    assert.equal(s2.selectedTotal, many.length, '★ 覆盖范围的上界如实给出');
    assert.equal(s2.truncated, true, '★ 窄读数必须能被读出来');
    const empty = RA.isArtifactStale({ selectedMemoryIds: [] }, new Set());
    assert.equal(empty.checked, 0);
    /* 没给总数 ⇒ 同为不可测（null）。首稿写的是 false，是沿用修前口径的**错期望**：
     *   `Number(null) === 0` 会让「总数未知」退化成「没截」。 */
    assert.equal(empty.truncated, null);
    assert.notEqual(empty.truncated, false, '★ 不可测不得塌陷成「没截」');
});

test('v3275 A4. 命中率诊断：被截过的产物必须能数出来', () => {
    const many = [];
    for (let i = 0; i < RA.MAX_SELECTED_IDS + 5; i++) many.push('m' + i);
    const a = RA.createArtifact({ turnId: 'u1', selectedMemoryIds: many, selectedMemoryIdsTotal: many.length, injectionText: 'x' });
    const b = RA.createArtifact({ turnId: 'u2', selectedMemoryIds: ['p', 'q'], selectedMemoryIdsTotal: 2, injectionText: 'y' });
    const s = RA.summarizeArtifacts([a, b]);
    assert.equal(s.total, 2);
    assert.equal(s.selectedTruncatedCount, 1, '★ 恰一条被截过（修前这一格不存在）');
    assert.equal(s.selectedTotalKnown, 2, '两条都给了总数');
    assert.equal(s.selectedIdsSum, many.length + 2, '依据条目数合计（截断时是下界）');
});



/* ══════════════ B. 规模面：量测台真跑 ══════════════ */

test('v3275 B1. ★ 量测台四条曲线真跑（合成数据 + 真模块）', () => {
    const mk = (n) => { const arr = []; for (let i = 0; i < n; i++) arr.push({ id: 'i' + i, text: 'x'.repeat(40) }); return arr; };
    const probe = { build: (n) => mk(n), read: (data) => data.map((d) => d.text).join(''), count: (out) => out.length };
    const c = WL.curve('snapshot', probe, { sizes: [0, 200, 1000] });
    assert.equal(c.measured, true, '曲线可测');
    assert.equal(c.rows.length, 3);
    assert.ok(c.rows.every((r) => r.measured), '每档都可测');
    assert.ok(c.rows[2].bytes > c.rows[1].bytes, '字节随规模上升');
    assert.equal(c.synth, true, '合成标记必须在场（不得被读成实机性能）');
    const bad = WL.curve('snapshot', { read: () => { throw new Error('boom'); } }, { sizes: [0, 10] });
    assert.equal(bad.measured, false, '★ 读抛错 ⇒ measured:false，不得报「很便宜」');
    assert.match(String(bad.reason), /read-threw/);
    const clk = WL.curve('snapshot', probe, { sizes: [0, 10], clock: { now: () => NaN } });
    assert.equal(clk.measured, false, '★ 时钟坏 ⇒ measured:false（0ms 是「没花时间」这个真读数）');
    assert.equal(clk.reason, 'clock-nonfinite');
});

test('v3275 B2. ★ 同输入真命中 / 不同输入不命中（缓存正确性的最小面）', () => {
    const probe = { build: (n) => ({ v: n }), read: (d) => ({ same: d.v }) };
    const hit = WL.cacheHit(probe, { n: 100 });
    assert.equal(hit.measured, true);
    assert.equal(hit.hit, true, '同输入连读两次必须命中');
    assert.equal(hit.firstBytes, hit.secondBytes);
    const none = WL.cacheHit(null, { n: 10 });
    assert.equal(none.measured, false);
    assert.equal(none.hit, false);
    assert.equal(none.reason, 'no-probe');
    let k = 0;
    const vary = { build: () => ({}), read: () => ({ k: ++k }) };
    const miss = WL.cacheHit(vary, { n: 10 });
    assert.equal(miss.measured, true);
    assert.equal(miss.hit, false, '输出变化 ⇒ 未命中');
});

test('v3275 B3. ★ 形状分型不丢方向：亚线性不得被报成超线性热点', () => {
    const sub = WL.curve('settings', { build: (n) => n, read: (n) => 'x'.repeat(n > 200 ? 340 : n) }, { sizes: [0, 200, 1000, 5000] });
    assert.equal(sub.measured, true);
    assert.equal(sub.shape, 'sublinear', '边际递减 ⇒ sublinear（实测 ' + sub.shape + '）');
    assert.equal(sub.superlinear, false, '★ 亚线性不得被判超线性');
    assert.equal(sub.recommendation, 'not-done-until-evidence', '★ 无证据不得给「改产品」建议');
});

test('v3275 B4. 宿主真跑四条路径（量测台与真模块接线不空转）', () => {
    const P2 = path.join(ROOT, 'tests', 'audit', '_m_o4_probe.mjs');
    assert.ok(fs.existsSync(P2), '量测探针在场');
    const src = fs.readFileSync(P2, 'utf8');
    for (const name of ['buildBridgeSnapshot', 'buildBridgeSnapshotJson', '_summarizeRecallAudit']) {
        assert.ok(src.includes(name), '探针真调宿主方法：' + name);
    }
    assert.ok(src.includes('cacheHit'), '探针真调量测台的命中口');
    assert.ok(src.includes('graphToCandidates'), '探针真调候选化模块');
});


/* ══════════════ C. 归档 provenance：剪了哪些、为什么，必须留痕 ══════════════ */

const AS = requireFromHere(path.join(ROOT, 'archive-shift.js'));
const LR = requireFromHere(path.join(ROOT, 'ledger-replay.js'));
const AS_SRC = read('archive-shift.js');
/* 只看代码行：注释里提到某字面量不算「真源写了一次」。
 *   实现**不在此处**：走 v3.191 收敛后的唯一真源 `tests/_audit_lib.mjs`（剥注释口径）。
 *   本轮实测踩过：本档首稿自己写了一份「只剔除整行注释」的近似版，被
 *   `scan_audit_lib_consolidation.mjs` 判为本地重写（E1）——同一口径两份实现正是它守的东西。 */

function mkHost(ids) {
    const h = { _archivedFloorIds: new Set(ids) };
    h._archiveShiftLib = () => AS;
    return h;
}

test('v3275 C1. ★★ explain* 是归档处置的唯一真源，旧 API 只是它的薄投影', () => {
    const cases = [[[1, 3, 5], 3], [[1, 3, 5], 9], [[1, 3, 5], null], [[2, 2, 7], 2]];
    for (const c of cases) {
        assert.deepEqual([...AS.shiftArchivedIds(c[0], c[1])], [...AS.explainShift(c[0], c[1]).next],
            'shift 投影必须逐元素等于 explainShift().next（入参 ' + JSON.stringify(c[1]) + '）');
        assert.deepEqual([...AS.pruneArchivedIds(c[0], c[1])], [...AS.explainPrune(c[0], c[1]).next],
            'prune 投影必须逐元素等于 explainPrune().next（入参 ' + JSON.stringify(c[1]) + '）');
    }
    assert.equal(AS_SRC.split('return explainShift(ids, deleted).next;').length - 1, 1, '旧 API 只转发 explainShift');
    assert.equal(AS_SRC.split('return explainPrune(ids, floor).next;').length - 1, 1, '旧 API 只转发 explainPrune');
    const ac = codeLines(AS_SRC).join('\n');
    assert.equal(ac.split("'deleted-floor'").length - 1, 1, '★ 删除理由只在真源里写一次（不得别处另算一份）');
    assert.equal(ac.split("'rolled-back'").length - 1, 1, '★ 回滚理由只在真源里写一次');
});

test('v3275 C2. ★★ 非法入参是「未执行」，与「执行了但剔了 0 个」不同形', () => {
    const inv1 = AS.explainShift([1, 3, 5], null);
    const inv2 = AS.explainPrune([1, 3, 5], '');
    const noop = AS.explainPrune([1, 2], 5);
    assert.equal(inv1.why, 'invalid-deleted');
    assert.equal(inv2.why, 'invalid-floor');
    assert.equal(noop.why, 'ok');
    assert.equal(inv1.removed.length, 0);
    assert.equal(inv2.removed.length, 0);
    assert.equal(noop.removed.length, 0);
    assert.notEqual(inv1.why, noop.why, '★ 只看 removed 长度分不开，必须靠 why（「没执行」≠「执行了没剔掉」）');
    assert.deepEqual([...inv1.next].sort((a, b) => a - b), [1, 3, 5], '非法楼层不得搬动任何归档');
    assert.deepEqual([...inv2.next].sort((a, b) => a - b), [1, 3, 5], '非法楼层不得剔掉任何归档');
    const pr = AS.explainPrune([5, 6, 9], 9);
    assert.equal(pr.why, 'ok');
    assert.deepEqual(pr.removed, [{ from: 9, why: 'rolled-back' }], '被剔楼层与理由都要留');
    const sh = AS.explainShift([2, 7, 9], 7);
    assert.deepEqual(sh.removed, [{ from: 7, why: 'deleted-floor' }]);
    assert.deepEqual(sh.moved, [{ from: 9, to: 8 }], '位移也要留出处');
});

test('v3275 C3. ★★ 回放真跑：剪掉/搬走的归档必须留下「哪几楼、为什么」', () => {
    const h1 = mkHost([2, 7, 9]);
    const r1 = LR.replayDrop(h1, 7);
    assert.equal(r1.dropped, 2, '回滚剪枝：7 与 9 都失去依据');
    assert.equal(Array.isArray(h1._archiveShiftLog), true, '★ 处置发生地（回放）留下了日志');
    assert.equal(h1._archiveShiftLog.length, 1, '一次处置留一条');
    const rec = h1._archiveShiftLog[0];
    assert.equal(rec.side, 'drop');
    assert.equal(rec.floor, 7);
    assert.equal(rec.why, 'ok');
    assert.deepEqual(rec.removed, [{ from: 7, why: 'rolled-back' }, { from: 9, why: 'rolled-back' }],
        '★ 答得出「剪了第 7、9 楼，因为记忆被回滚撤销」');
    assert.equal(rec.removedCount, 2);
    assert.equal(rec.keptCount, 1);
    const h2 = mkHost([2, 9]);
    LR.replayShift(h2, 3);
    const rec2 = h2._archiveShiftLog[0];
    assert.equal(rec2.side, 'shift');
    assert.deepEqual(rec2.moved, [{ from: 9, to: 8 }], '★ 答得出「第 9 楼被搬到 8」');
    assert.equal(rec2.keptCount, 2);
});

test('v3275 C4. ★ 留痕有界（最近 20 条）、空处置不占位、留痕失败不连坐回放', () => {
    const h = mkHost([]);
    for (let i = 1; i <= 25; i++) {
        h._archivedFloorIds = new Set([i]);
        LR.replayDrop(h, i);
    }
    assert.equal(h._archiveShiftLog.length, 20, '★ 诊断证据有界，不得无界增长');
    assert.equal(h._archiveShiftLog[h._archiveShiftLog.length - 1].floor, 25, '保留的是最近那批');
    const h2 = mkHost([1, 2]);
    LR.replayDrop(h2, 5);
    assert.ok(!h2._archiveShiftLog || h2._archiveShiftLog.length === 0, '★ 没东西被处理掉就不留噪声行');
    const arr = [];
    arr.push = () => { throw new Error('prov-boom'); };
    const h3 = { _archivedFloorIds: new Set([3, 4]), _archiveShiftLib: () => AS };
    Object.defineProperty(h3, '_archiveShiftLog', { get: () => arr, set: () => {} });
    let boom = null;
    try { const r3 = LR.replayDrop(h3, 3); assert.equal(r3.dropped >= 1, true, '回放本身照常完成'); }
    catch (e) { boom = e; }
    assert.equal(boom, null, '★ 留痕失败不得连坐回放（诊断面不得把主流程搞死）');
});

test('v3275 C5. ★ 宿主接线：初始化、换会话归零、自检行三态都在场', () => {
    const code = codeLines(IDX_SRC).join('\n');
    assert.equal(code.split('this._archiveShiftLog = [];').length - 1, 1, '初始化恰一处');
    assert.equal(code.split('this.engine._archiveShiftLog = [];').length - 1, 1, '换会话归零恰一处');
    const resetLine = codeLines(IDX_SRC).find(l => l.includes('this.engine._archiveShiftLog = [];'));
    assert.ok(resetLine && resetLine.includes('_archivedFloorIds'), '★ 归零与归档集合同处清（防跨会话串用）');
    for (const s of ['—（本轮尚无归档面）', '暂无（本会话未剪/未移任何归档）', "'共 ' + log.length + ' 次 · 最近 '"]) {
        assert.ok(code.includes(s), '★ 自检三态落在代码行上：' + s);
    }
    assert.ok(code.includes('selfCheck.archiveShiftLog'), '诊断异常有出口');
});

/* ══════════════ D. 负控制：真源码破坏 → 副本上重跑同款判据 ══════════════ */

/* —— 同款判据本体（可注入被破坏的模块）—— */
/** A1 判据本体：不传总数就是**不可测**，不得拿保留数冒充。 */
function truncJudge(ra) {
    const a = ra.createArtifact({ turnId: 't1', selectedMemoryIds: ['a', 'b', 'c'] });
    if (a.selectedMemoryIdsTotal !== null) throw new Error('★ 没给总数却被写成 ' + a.selectedMemoryIdsTotal);
    if (a.selectedMemoryIdsTruncated !== null) throw new Error('截断态未知却被写成 ' + a.selectedMemoryIdsTruncated);
    const b = ra.createArtifact({ turnId: 't2', selectedMemoryIds: ['a', 'b'], selectedMemoryIdsTotal: 57 });
    if (b.selectedMemoryIdsTotal !== 57) throw new Error('真总数被改写：' + b.selectedMemoryIdsTotal);
    if (b.selectedMemoryIdsTruncated !== true) throw new Error('超上界必须如实标截');
    const c = ra.createArtifact({ turnId: 't3', selectedMemoryIds: ['a', 'b'] });
    if (ra.isArtifactStale(c, new Set(['a'])).truncated !== null) throw new Error('窄读数的截断态不得倒推');
}

/** C3 判据本体：剪了东西就必须答得出「哪几楼、为什么」（可注入被破坏的归档库）。 */
function provJudge(asLib) {
    const h = { _archivedFloorIds: new Set([2, 7, 9]), _archiveShiftLib: () => asLib };
    const r = LR.replayDrop(h, 7);
    if (r.dropped !== 2) throw new Error('回放读数变了：' + r.dropped);
    const log = h._archiveShiftLog;
    if (!Array.isArray(log) || !log.length) throw new Error('★ 剪了东西却没留下 provenance');
    const rec = log[0];
    if (!Array.isArray(rec.removed) || rec.removed.length !== 2) throw new Error('★ 处置记录里没有「哪几楼」：' + JSON.stringify(rec.removed));
    if (rec.removed[0].why !== 'rolled-back') throw new Error('处置记录里没有「为什么」');
}

/** C3 判据本体（回放侧）：留痕必须由回放写出（可注入被破坏的回放库）。 */
function provJudgeLR(lr) {
    const h = { _archivedFloorIds: new Set([2, 7, 9]), _archiveShiftLib: () => AS };
    const r = lr.replayDrop(h, 7);
    if (r.dropped !== 2) throw new Error('回放读数变了：' + r.dropped);
    const log = h._archiveShiftLog;
    if (!Array.isArray(log) || !log.length) throw new Error('★ 回放侧没留痕：事后答不出剪了哪几楼');
    if (log[0].removedCount !== 2) throw new Error('留痕计数不对：' + log[0].removedCount);
}

/* 锚点选择：**drop（剪枝）走的是 explainPrune**，不是 explainShift ——
 *   首稿打在 explainShift 的删除分支上，实测破坏副本里 explainPrune 仍完整，
 *   判据不转红（假绿）。负控制必须打在**真正服务该路径**的那一行上。 */
const A_AS = "else removed.push({ from: n, why: 'rolled-back' });";
const A_AS2 = "return (t === null) ? null : (t > (keptLen || 0));";
const A_LR = "_logArchiveShift(h, { side: 'drop', floor: f0, kept: [...out], removed: _prov ? _prov.removed : null, moved: [], removedCountHint: n, why: _prov ? _prov.why : 'fallback-no-explain' });";

/** 破坏 → 落盘副本 → 要求「是副本」→ 在副本上跑同款判据。 */
function runOnBroken(src, anchor, replacement, label, fn) {
    const broken = breakSource(src, anchor, replacement, label);
    const file = path.join(TMP, 'b' + (++tmpN) + '.js');
    fs.writeFileSync(file, broken);
    const mod = requireFromHere(file);
    assert.notStrictEqual(mod, null, '副本必须可加载');
    try { fn(mod); return { threw: false, message: '' }; }
    catch (e) { return { threw: true, message: String((e && e.message) || e) }; }
}

test('v3275 D1. 阳性对照：三套判据在**原版**上必须真成立（否则下面「破坏后转红」毫无意义）', () => {
    truncJudge(RA);
    provJudge(AS);
    provJudgeLR(LR);
});

test('v3275 D2. ★ 负控制·归档删除理由不再记录 ⇒ 「剪了哪几楼、为什么」必须转红', () => {
    const r = runOnBroken(AS_SRC, A_AS, 'else { /* 理由不再记录 */ }', 'D2 剪枝理由不记', provJudge);
    assert.ok(r.threw, '★ 处置理由不再记录后，provenance 判据必须转红（否则留痕是空转）');
    assert.match(r.message, /却没留下 provenance|没有「哪几楼」|没有「为什么」/);
});

test('v3275 D3. ★ 负控制·「没给总数」被写成保留数（假可测）⇒ 截断自述判据必须转红', () => {
    const r = runOnBroken(RA_SRC, A_AS2, 'return (t !== null) && (t > (keptLen || 0));', 'D3 假可测', truncJudge);
    assert.ok(r.threw, '★ 把「测不了」写成「就这么点」后，判据必须转红');
    assert.match(r.message, /没给总数却被写成|截断态未知却被写成/);
});

test('v3275 D4. ★ 负控制·回放侧不再留痕 ⇒ provenance 判据必须转红', () => {
    const r = runOnBroken(LR_SRC, A_LR, 'void 0;', 'D4 回放不留痕', provJudgeLR);
    assert.ok(r.threw, '★ 回放侧摘掉留痕后，判据必须转红');
    assert.match(r.message, /回放侧没留痕/);
});

test('v3275 D5. 工具两向自证：锚点 0 次 / 不唯一 / 同值替换均抛；判据不得引用锚点串', () => {
    assert.throws(() => breakSource(AS_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'D5'), /拒绝破坏|命中 0 次|恰中 1 次/);
    assert.throws(() => breakSource(AS_SRC, 'function', 'x', 'D5'), /拒绝破坏|恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakSource(AS_SRC, 'why: \'rolled-back\'', 'why: \'rolled-back\'', 'D5'), /必须真的改变源码|拒绝破坏/);
    /* H5 判据纯度：判据体内不得出现被破坏的锚点字面量（否则是自我指涉）；
     *   且锚点字面量在本档里**只准声明一次**（声明处即上面三个常量）。 */
    const judges = truncJudge.toString() + provJudge.toString() + provJudgeLR.toString();
    for (const a of [A_AS, A_AS2, A_LR]) {
        assert.ok(!judges.includes(a), '判据不得引用锚点字面量：' + a.slice(0, 40));
        assert.strictEqual(SELF.split(a).length - 1, 1, '锚点字面量只准声明一次（H5）');
    }
});

/* ══════════════ E. 版本锚 ══════════════ */

test('v3275 E1. 版本锚（下限形）：三源同源且不低于 3.275.0', () => {
    const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
    const pkg = JSON.parse(read('package.json')).version;
    const man = JSON.parse(read('manifest.json')).version;
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(pkg, idxVer, 'package.json 与 index.js 版本必须一致');
    assert.strictEqual(man, idxVer, 'manifest.json 与 index.js 版本必须一致');
    assert.ok(vnum(idxVer) >= vnum('3.275.0'), '本套件自 3.275.0 起成立；当前 ' + idxVer);
    assert.ok(SELF.includes('v3.275.0'), '★ 本档必须锁自己的出生版本 v3.275.0（不随抬版上抬）');
});
