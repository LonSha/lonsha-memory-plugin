/* ============================================================
 * tests/v3235_rollback_preview.test.mjs — [v3.235.0] R4-A 回滚预览（dry-run）
 *
 * 版本锚点（v3.235.0）：本套件恰好锚着它自己的出生版本，供版本守卫 V4 取基准。
 *
 * 主题：**破坏之前先看得见**。到 v3.234.0 为止，`rollbackFloor` 有三个真宿主调用点
 *   （MESSAGE_EDITED / MESSAGE_SWIPED / 删楼），全部**先删后报**：`_lastReplayReport`
 *   只回答「刚才撤了多少」，用户在按下删除时无从预知。且 v3.9 废除级联销毁后，
 *   删楼是**两段式**（撤该楼 + 其后整体前移），这一半此前完全不可预知。
 *
 * 本版补的是一条**只读**路径：不调任何 owner.drop / owner.shift，只走
 *   owner.get + 形状扫描 + FLOOR_OWNERS 面清单。
 *
 * 本版**功能冒烟当场抓到并修掉的两处真缺陷**（都在首稿里，且都由本套件的判据形态钉住）：
 *   ① `previewLine` 只认「包装对象」，于是 `previewLine(previewDrop(h,7))` 这种把
 *      **单侧报告**直接递进来的自然写法被静默读成「—（无预览）」——两种形态在调用点
 *      都自然，读错其一就是本仓最忌讳的形态混淆。
 *   ② `scanShape` 首稿拿一份「容器名白名单」当门，于是 `diary.diaries`（两层结构）、
 *      `graph.edges`（Map）、`ledger.floors` 一律被判 unmeasurable —— 42 面里 5 面扫不出，
 *      其中 3 面是**漏项造成的假 unmeasurable**。「扫不出」与「没扫」必须不同形，
 *      这条对本面自身同样适用（诊断面自己撒谎，比不报更坏）。修为全值遍历后 5 → 1，
 *      剩下的 `stm-ltm` 是**真**扫不出（状态是 `_stmLtmState` 上的数组字段，形状不可知）。
 *
 * 结构：
 *   A 预览是纯读（逐字节快照比对：预览前后宿主一字未改）
 *   B 分态：「没给」与「给了第 0 楼」不同形（本仓老账）
 *   C DROP_NOTHING 具名身份（「不参与删」不得与「撤了 0 条」同形）
 *   D 形状扫描真实性（自纠回归：白名单当门不得复活）
 *   E previewLine 两形态 + 四态（自纠回归）
 *   F 宿主接线（配置键 / UI 控件 / 取库口 / 破坏前调用 / 初始化 / 诊断行）
 *   G 既有面不回退（登记表健康 / 回放仍工作 / 零抛出）
 *   H 版本锚
 *   N 负控制（真源码破坏 → 整仓镜像 → 同款真判据必须转红；另加锚点自证）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

const LR = 'ledger-replay.js';
const IDX = 'index.js';
const SU = 'settings-ui.js';

const LR_MOD = (await import(at(LR))).default;
const LR_SRC = read(LR);
const IDX_SRC = read(IDX);
const SU_SRC = read(SU);
const pkg = JSON.parse(read('package.json'));

const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
const CURRENT = '3.235.0';

/** 一个「多面都挂上、且第 7 楼真的持有记录」的宿主。 */
const mkHost = () => ({
    diary: { diaries: { A: [{ floor: 3, text: 'x' }, { floor: 7, text: 'y' }] } },
    summary: { summaries: [{ floor: 7, text: 's7' }, { floor: 8, text: 's8' }], volumes: [{ floorStart: 1, floorEnd: 9 }] },
    timeline: { entries: [{ floor: 7 }, { floor: 9 }] },
    pov: { povs: [{ floor: 7, id: 'p1' }] },
    reflection: { items: [{ floor: 7 }] },
    suspense: { items: [{ floor: 7 }, { resolvedFloor: 7 }] },
    status: {
        ops: [{ floor: 7 }], characters: {},
        removeByFloor: () => 0, removeLifeDetailByFloor: () => 0,
        removeProtagonistByFloor: () => 0, removeDriftByFloor: () => 0
    },
    opLog: { entries: [{ floor: 7 }] },
    graph: { edges: new Map([['a', { floor: 7 }]]) },
    ledger: { floors: { 7: { floor: 7 } }, remove: () => {} },
    _archivedFloorIds: new Set([0, 1, 2, 7]),
    _diaryInjectFloor: 9,
    _timelineInjectFloor: 9,
    stmLtm: { shiftFloorRefs: () => 0, removeByFloors: () => ({}) },
    _stmLtmState: {}
});

/** 宿主可读快照（预览必须让它逐字节不变）。 */
const snap = (h) => JSON.stringify({
    diary: h.diary, summary: h.summary, timeline: h.timeline, pov: h.pov,
    reflection: h.reflection, suspense: h.suspense, opLog: h.opLog,
    ledger: h.ledger, status: h.status,
    graph: { edges: Array.from((h.graph && h.graph.edges) || []) },
    archived: Array.from(h._archivedFloorIds || []),
    dInj: h._diaryInjectFloor, tInj: h._timelineInjectFloor
});

/* ── 判据（纯函数，正负两跑；负控制必须用**同款**判据）── */
/** J1 预览是纯读：drop 与 shift 两条预览跑完，宿主一字未改。 */
function readonlyJudge(mod) {
    const h = mkHost();
    const before = snap(h);
    mod.previewDrop(h, 7);
    if (snap(h) !== before) return false;
    mod.previewShift(h, 7);
    return snap(h) === before;
}
/** J2 分态：「没给」⇒ skipped + projected null；「给了第 0 楼」⇒ 正常预览（0 是真读数）。 */
function gateJudge(mod) {
    const h = mkHost();
    for (const v of [null, undefined, '', '  ', [], {}, true]) {
        const rep = mod.previewDrop(h, v);
        if (rep.skipped !== 'floor-not-given') return false;
        if (rep.projected !== null) return false;
        if (rep.floor !== null) return false;
    }
    const zero = mod.previewDrop(h, 0);
    if (zero.skipped !== null) return false;
    if (zero.floor !== 0) return false;
    const five = mod.previewDrop(h, 7);
    return five.skipped === null && five.floor === 7 && Array.isArray(five.holders);
}
/** J3 「这一面不参与删」必须有具名身份，且不得与「撤了 0 条」同形。 */
function identityJudge(mod) {
    if (typeof mod.DROP_NOTHING !== 'function') return false;
    if (mod.DROP_NOTHING() !== 0) return false;
    const owners = Array.isArray(mod.FLOOR_OWNERS) ? mod.FLOOR_OWNERS : [];
    const named = owners.filter((o) => o.drop === mod.DROP_NOTHING).map((o) => o.id).sort();
    if (named.join(',') !== 'baseline,geo,oplog,volumes') return false;
    // 反面：不得再有用字面量声明的占位 drop（它与真·0 条完全同形）
    for (const o of owners) {
        if (o.drop === mod.DROP_NOTHING) continue;
        const body = Function.prototype.toString.call(o.drop).replace(/\s+/g, '');
        if (body === '()=>0' || body === '()=>{return0;}') return false;
    }
    // 报告面必须把它们单列成一组，而不是混进「干净」
    const rep = mod.previewDrop(mkHost(), 7);
    return rep.notParticipating.includes('baseline') && rep.notParticipating.includes('volumes');
}
/** J4 形状扫描真实性：真持有该楼的面必须 measurable（假 unmeasurable = 本面自己撒谎）。 */
function scanJudge(mod) {
    const rep = mod.previewDrop(mkHost(), 7);
    for (const id of ['diary', 'summary', 'timeline', 'pov', 'graph', 'floor-ledger', 'archived']) {
        if (rep.unmeasurable.includes(id)) return false;
    }
    for (const id of ['diary', 'summary', 'timeline', 'pov', 'suspense', 'reflection']) {
        if (!rep.holders.includes(id)) return false;
    }
    return typeof rep.projected === 'number' && rep.projected > 0;
}
/** J5 previewLine：**两种形态都认**，且都出真实读数（不是「—（无预览）」）。 */
function lineJudge(mod) {
    const single = mod.previewLine(mod.previewDrop(mkHost(), 7));
    if (typeof single !== 'string' || !single.includes('面持有')) return false;
    const wrapped = mod.previewLine({ floor: 7, drop: mod.previewDrop(mkHost(), 7), shift: mod.previewShift(mkHost(), 7) }, null);
    if (!wrapped.includes('面持有')) return false;
    if (wrapped === '—（无预览）') return false;
    // 三态仍须不同形
    const none = mod.previewLine(mod.previewDrop(mkHost(), null));
    if (none !== '—（未给楼层）') return false;
    if (mod.previewLine(null) !== '—（无预览）') return false;
    if (mod.previewLine('x').includes('面持有')) return false;   // 形态不可识不得静默成读数
    return true;
}
/** J6 宿主接线（文本判据面，与 F 组同款）。 */
function hostJudge(idxSrc, suSrc) {
    return /rollbackPreviewEnabled:\s*true,/.test(idxSrc)
        && /previewFloorRollback\(floor\)\s*\{/.test(idxSrc)
        && /previewFloorRollback\(floor\)/.test(idxSrc)
        && /_lastRollbackPreview\s*=\s*null;/.test(idxSrc)
        && /\['回滚预览'/.test(idxSrc)
        && /previewLine\(pv\.drop,\s*pv\.shift\)/.test(idxSrc)
        && /ck\('rollbackPreviewEnabled'/.test(suSrc);
}

/* ══════════ A 预览是纯读 ══════════ */
test('【A1】★ 预览不写：drop 与 shift 两条预览跑完，宿主逐字节未变', () => {
    const h = mkHost();
    const before = snap(h);
    const d = LR_MOD.previewDrop(h, 7);
    assert.equal(snap(h), before, '★ previewDrop 改了宿主（预览变成了动作）');
    const s = LR_MOD.previewShift(h, 7);
    assert.equal(snap(h), before, '★ previewShift 改了宿主（预览变成了动作）');
    assert.equal(d.side, 'drop-preview');
    assert.equal(s.side, 'shift-preview');
    assert.equal(d.basis, 'shape-scan', '口径必须自报：本面是形状扫描，不是真回放');
});

test('【A2】★ 预览不借用写动作：owner.drop / owner.shift 一次都没被调用', () => {
    // 直接侦测：把面上四个真写动作换成计数桩，预览若调了它们就会被数到。
    const calls = [];
    const registry = [
        { id: 'probe-a', label: '探针A', holds: 'records', get: () => ({ items: [{ floor: 7 }] }), drop: () => { calls.push('drop'); return 1; }, shift: () => { calls.push('shift'); return 1; } },
        { id: 'probe-b', label: '探针B', holds: 'pointer', get: () => ({ floor: 7 }), drop: () => { calls.push('drop'); return 1; }, shift: () => { calls.push('shift'); return 1; } }
    ];
    const d = LR_MOD.previewDrop(mkHost(), 7, registry);
    const s = LR_MOD.previewShift(mkHost(), 7, registry);
    assert.deepEqual(calls, [], '★ 预览调用了写动作：' + JSON.stringify(calls));
    assert.equal(d.holders.length, 2, '只读形状扫描仍须认出持有者（两条探针各持第 7 楼）');
    assert.equal(s.items.filter((r) => r.state === 'declared').length, 2, '前移侧只声明「参与」');
    assert.equal(s.projected, null, '前移侧不报条数（报条数就必须真减，那是写动作）');
});

/* ══════════ B 分态：没给 vs 给了第 0 楼 ══════════ */
test('【B1】★ 分态：「没给」一律 skipped / projected null，且不动第 0 楼', () => {
    const h = mkHost();
    const before = snap(h);
    for (const v of [null, undefined, '', '  ', [], {}, true, NaN]) {
        const rep = LR_MOD.previewDrop(h, v);
        assert.equal(rep.skipped, 'floor-not-given', '入参 ' + JSON.stringify(v) + ' 应读成「没给」');
        assert.equal(rep.projected, null, '「没给」不得吐一个数字');
        assert.equal(rep.floor, null, '「没给」不得读成第 0 楼');
    }
    assert.equal(snap(h), before);
});

test('【B2】★★ 反坐实：真给 0 与真给 7 必须照常预览（门只管「没给」）', () => {
    const h = mkHost();
    const zero = LR_MOD.previewDrop(h, 0);
    assert.equal(zero.skipped, null, '★ 真给第 0 楼不得被门拦掉（0 是本仓合法楼层）');
    assert.equal(zero.floor, 0);
    const seven = LR_MOD.previewDrop(h, 7);
    assert.equal(seven.skipped, null);
    assert.ok(seven.holders.length > 0, '★ 第 7 楼真持有记录，预览必须看得见');
    assert.ok(seven.projected > 0, '★ 量级必须为正（不得用「空」冒充「有」）');
});

test('【B3】★ 「量级不可得」与「0 条」不同形', () => {
    const empty = LR_MOD.previewDrop({}, 7);
    assert.equal(empty.projected, null, '★ 一个面都量不出来 ⇒ null（「没给」），不得写 0');
    assert.equal(empty.absent.length, LR_MOD.FLOOR_OWNERS.length, '空宿主 ⇒ 每面缺席');
    const real = LR_MOD.previewDrop(mkHost(), 7);
    assert.notEqual(real.projected, null, '真宿主必须给出量级');
});

/* ══════════ C DROP_NOTHING 具名身份 ══════════ */
test('【C1】★★ 「这一面不参与删」有具名身份，且不再与「撤了 0 条」同形', () => {
    assert.equal(typeof LR_MOD.DROP_NOTHING, 'function', '★ 占位实现必须是导出面');
    const owners = LR_MOD.FLOOR_OWNERS;
    const named = owners.filter((o) => o.drop === LR_MOD.DROP_NOTHING).map((o) => o.id).sort();
    assert.deepEqual(named, ['baseline', 'geo', 'oplog', 'volumes'], '★ 参与与否必须可机检');
    for (const o of owners) {
        if (o.drop === LR_MOD.DROP_NOTHING) continue;
        const body = Function.prototype.toString.call(o.drop).replace(/\s+/g, '');
        assert.notEqual(body, '()=>0', '★ 面 ' + o.id + ' 又用字面量占位（与真·0 条同形）');
    }
});

test('【C2】★★ 预览把这两种读数分列（notParticipating vs holders 不相交）', () => {
    const rep = LR_MOD.previewDrop(mkHost(), 7);
    assert.ok(rep.notParticipating.includes('volumes'), '★ 卷范围从不参与删除 ⇒ 单列');
    assert.ok(rep.notParticipating.includes('oplog'), '★ 操作日志从不参与删除 ⇒ 单列');
    for (const id of rep.notParticipating) {
        assert.ok(!rep.holders.includes(id), '★ 「不参与删」不得同时被列为「持有该楼」：' + id);
    }
});

/* ══════════ D 形状扫描真实性（自纠回归）══════════ */
test('【D1】★★★ 自纠回归：白名单当门已删，diary/graph/floor-ledger 必须 measurable', () => {
    const rep = LR_MOD.previewDrop(mkHost(), 7);
    for (const id of ['diary', 'graph', 'floor-ledger']) {
        assert.ok(!rep.unmeasurable.includes(id), '★ ' + id + ' 真持有第 7 楼，却被判「扫不出」= 本面自己撒谎');
        assert.ok(rep.holders.includes(id), '★ ' + id + ' 必须在 holders 里');
    }
    assert.ok(rep.projected >= 6, '量级不得低估到失真，实得 ' + rep.projected);
    // 白名单不得复活（形态判据：值遍历数组若出现在 scanShape 里即回退）
    const body = /function scanShape\(v, floor, depth\)[\s\S]*?\n    \}/.exec(LR_SRC);
    assert.ok(body, 'scanShape 本体必须在场');
    assert.ok(!/SHAPE_CONTAINERS/.test(LR_SRC), '★ 已废弃的容器名白名单不得留在源里（读者会以为它还在管用）');
});

test('【D2】★ 残余 unmeasurable 必须是**真**扫不出的面，且如实点名', () => {
    const rep = LR_MOD.previewDrop(mkHost(), 7);
    assert.ok(rep.unmeasurable.length <= 2, '假 unmeasurable 不得回流，实得 ' + JSON.stringify(rep.unmeasurable));
    for (const id of rep.unmeasurable) {
        assert.ok(typeof id === 'string' && id.length > 0, '扫不出的面必须点名（不得静默）');
    }
});

test('【D3】★ 深度上限保证有界：自引用宿主不得栈溢出（零抛出是硬纪律）', () => {
    const cyc = { a: { floor: 7 } };
    cyc.self = cyc;
    let threw = null;
    const t0 = Date.now();
    try { LR_MOD.previewDrop(cyc, 7); } catch (e) { threw = e; }
    assert.equal(threw, null, '★ 自引用宿主抛出：' + (threw && threw.message));
    assert.ok(Date.now() - t0 < 2000, '★ 深度受限必须让它很快返回');
});

/* ══════════ E previewLine 两形态 + 四态 ══════════ */
test('【E1】★★★ 自纠回归：单侧报告与包装对象两种形态都必须出真实读数', () => {
    const single = LR_MOD.previewLine(LR_MOD.previewDrop(mkHost(), 7));
    assert.notEqual(single, '—（无预览）', '★ 单侧报告被读成「无预览」= 形态混淆（首稿缺陷）');
    assert.ok(single.includes('面持有'), '实得：' + single);
    const wrapped = LR_MOD.previewLine({ floor: 7, drop: LR_MOD.previewDrop(mkHost(), 7), shift: LR_MOD.previewShift(mkHost(), 7) }, null);
    assert.ok(wrapped.includes('面持有'), '实得：' + wrapped);
    assert.ok(wrapped.includes('重定位'), '包装形态必须把前移半边也念出来：' + wrapped);
    const twoArg = LR_MOD.previewLine(LR_MOD.previewDrop(mkHost(), 7), LR_MOD.previewShift(mkHost(), 7));
    assert.equal(twoArg, wrapped, '两形态读法必须同值（形态差异不得改变读数）');
});

test('【E2】★ 四态不同形，且形态不可识不静默', () => {
    const none = LR_MOD.previewLine(null);
    const notGiven = LR_MOD.previewLine(LR_MOD.previewDrop(mkHost(), null));
    const okLine = LR_MOD.previewLine(LR_MOD.previewDrop(mkHost(), 7));
    const empty = LR_MOD.previewLine(LR_MOD.previewDrop({}, 7));
    const junk = LR_MOD.previewLine('x');
    assert.equal(new Set([none, notGiven, okLine, empty, junk]).size, 5, '五态必须五形：' + JSON.stringify([none, notGiven, okLine, empty, junk]));
    assert.equal(none, '—（无预览）');
    assert.equal(notGiven, '—（未给楼层）');
    assert.ok(junk.includes('不可识'), '★ 认不出的形态必须带原因（不得静默成「无预览」）');
});

/* ══════════ F 宿主接线 ══════════ */
test('【F1】★★ 配置键 + UI 控件 + 取库口 + 破坏前调用 + 初始化 + 诊断行', () => {
    assert.match(IDX_SRC, /rollbackPreviewEnabled:\s*true,/, '配置键必须在场且默认开');
    assert.match(IDX_SRC, /previewFloorRollback\(floor\)\s*\{/, '宿主必须有预览方法');
    assert.match(IDX_SRC, /_ledgerReplayLib\(\)/, '必须经既有取库口取库（不得自己 require）');
    assert.match(IDX_SRC, /_lastRollbackPreview\s*=\s*null;/, '构造期必须初始化预告落点');
    assert.match(IDX_SRC, /\['回滚预览'/, '诊断面必须有人类可读的一行');
    assert.match(IDX_SRC, /previewLine\(pv\.drop,\s*pv\.shift\)/, '诊断行必须显式传两个单侧报告');
    assert.match(SU_SRC, /ck\('rollbackPreviewEnabled'/, '新配置键必须有 UI 控件（v3113 覆盖度）');
});

test('【F2】★★★ 删楼点必须**先预告后破坏**（顺序判据，不是存在性判据）', () => {
    const i = IDX_SRC.indexOf('MESSAGE_DELETED');
    const seg = IDX_SRC.slice(IDX_SRC.lastIndexOf('plugin.engine.rollbackFloor(floor);') - 900, IDX_SRC.lastIndexOf('plugin.engine.rollbackFloor(floor);') + 40);
    const pvAt = seg.indexOf('_lastRollbackPreview =');
    const rbAt = seg.indexOf('plugin.engine.rollbackFloor(floor);');
    assert.ok(pvAt >= 0, '删楼点必须在场预告赋值');
    assert.ok(rbAt > pvAt, '★ 预告必须在破坏**之前**（顺序反了就只是事后报告）');
    assert.match(seg, /rollbackPreviewEnabled\s*===\s*true/, '开关必须严格 === true（老账：不给就不同形）');
    assert.ok(i >= 0);
});

test('【F3】★★ 宿主预览的分态与模块侧同口径（缺席/没给/给 0 三形）', () => {
    assert.match(IDX_SRC, /module:\s*'absent'/, '模块缺席必须有具名分态');
    assert.match(IDX_SRC, /skipped:\s*'floor-not-given'/, '没给楼层必须与「第 0 楼」不同形');
    assert.match(IDX_SRC, /const f0 = numOr\(floor, null\);/, '宿主必须走既有 numOr 门（不得裸 Number）');
    assert.ok(!/previewFloorRollback\(floor\)\s*\{[\s\S]{0,400}?Number\(floor\)\s*\|\|\s*0/.test(IDX_SRC), '不得用 `Number(floor) || 0` 当门');
});

/* ══════════ G 既有面不回退 ══════════ */
test('【G1】★ 登记表健康 + 既有回放仍工作 + 版本自报', () => {
    assert.deepEqual(LR_MOD.checkRegistry(LR_MOD.FLOOR_OWNERS), [], '★ 登记表结构必须健康');
    assert.ok(LR_MOD.FLOOR_OWNERS.length >= 42, '登记表规模不得缩水，实得 ' + LR_MOD.FLOOR_OWNERS.length);
    const h = mkHost();
    const rep = LR_MOD.replayDrop(h, 7);
    assert.ok(rep.dropped > 0, '既有回放不得被本版改坏');
    const h2 = mkHost();
    const rep2 = LR_MOD.replayShift(h2, 7);
    assert.equal(rep2.skipped, null, '前移侧仍须照常工作');
    assert.equal(LR_MOD.LEDGER_REPLAY_VERSION, 1, '★ 报告只增不改：引擎版本保持 1（与 v3225 F3 同口径）');
});

test('【G2】★ 预览零抛出（怪楼层 × 怪宿主）', () => {
    let threw = 0;
    for (const v of [null, undefined, '', [], {}, true, 0, -1, NaN, Infinity, 1e9, '7', 7.5, ' 7 ']) {
        try { LR_MOD.previewDrop(mkHost(), v); } catch (e) { threw++; }
        try { LR_MOD.previewShift(mkHost(), v); } catch (e) { threw++; }
    }
    for (const bad of [null, undefined, 0, 'x', []]) {
        try { LR_MOD.previewDrop(bad, 7); } catch (e) { threw++; }
        try { LR_MOD.previewShift(bad, 7); } catch (e) { threw++; }
    }
    assert.equal(threw, 0, '★ 预览不得抛出（零抛出是硬纪律）');
});

test('【G3】★ 取数即抛的面如实报 threw，不冒成 absent / 0 条', () => {
    const registry = [{
        id: 'boom', label: '会抛的面', holds: 'records',
        get: () => { throw new Error('boom'); },
        drop: () => 1, shift: () => 1
    }];
    const rep = LR_MOD.previewDrop(mkHost(), 7, registry);
    assert.deepEqual(rep.threw, ['boom'], '★ 取数即抛必须单列，不得混进 absent');
    assert.deepEqual(rep.absent, [], '★ 「抛」与「缺席」不同形');
});

/* ══════════ H 版本锚 ══════════ */
test('【H1】★ 版本锚：本套件只在 3.235.0 及以后成立', () => {
    assert.ok(vnum(pkg.version) >= vnum('3.235.0'), '★ 当前版本 ' + pkg.version + '（本套件出生版本 3.235.0）');
    assert.equal(vnum(CURRENT), vnum('3.235.0'), '★ CURRENT 常量与锚定字面量必须同值');
    assert.equal(/const VERSION = '([0-9.]+)'/.exec(IDX_SRC)[1], pkg.version, 'index.js 与 package 同源');
});

/* ══════════ N 负控制（真源码破坏 → 整仓镜像 → 同款真判据转红）══════════ */
/* 【为什么必须整仓镜像】ledger-replay.js 顶部依赖同目录相对路径（archive-shift 等）；把破坏
 *   副本写进裸临时目录会解析成别的模块 ⇒ 跑出来的不是判据而是一次加载失败（假红）。
 *   本仓 v2.99.0 起统一为 cpSync 整仓镜像，且 `withMirror` 必须 `await`。 */
const ORIG = new Map();
for (const f of [LR, IDX, SU]) ORIG.set(f, read(f));

function mutateOnce(src, from, to) {
    const n = src.split(from).length - 1;
    assert.equal(n, 1, '锚点应恰好命中 1 次，实际 ' + n + '：' + String(from).slice(0, 80));
    return src.replace(from, to);
}
function mirror(mut) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3235-mir-'));
    fs.cpSync(ROOT, dir, { recursive: true, filter: (src) => !src.split(path.sep).includes('.git') });
    for (const [rel, fn] of Object.entries(mut)) {
        const body = fn(read(rel));
        assert.notEqual(body, read(rel), '破坏未发生（锚点没命中）：' + rel);
        fs.writeFileSync(path.join(dir, rel), body);
    }
    for (const [g, s] of ORIG) {
        if (Object.prototype.hasOwnProperty.call(mut, g)) continue;
        fs.writeFileSync(path.join(dir, g), s);
    }
    return dir;
}
async function withMirror(mut, fn) {
    const dir = mirror(mut);
    try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('【N0】镜像树自证 + 阳性对照：未破坏时五条判据全真（否则 N 组是假绿）', async () => {
    assert.equal(readonlyJudge(LR_MOD), true, 'J1 在原件上必须为真');
    assert.equal(gateJudge(LR_MOD), true, 'J2 在原件上必须为真');
    assert.equal(identityJudge(LR_MOD), true, 'J3 在原件上必须为真');
    assert.equal(scanJudge(LR_MOD), true, 'J4 在原件上必须为真');
    assert.equal(lineJudge(LR_MOD), true, 'J5 在原件上必须为真');
    assert.equal(hostJudge(IDX_SRC, SU_SRC), true, 'J6 在原件上必须为真');
    const dir = mirror({});
    try {
        assert.ok(fs.existsSync(path.join(dir, LR)), '镜像里必须带上模块本体');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('【N1】★★★ 负控制·纯读：预览里混进一次真动作 ⇒ J1 必须转红', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "        if (action === DROP_NOTHING) { out.state = 'no-op'; return out; }\n        try {\n            const r = scanShape(cur, floor, 0);",
            "        if (action === DROP_NOTHING) { out.state = 'no-op'; return out; }\n        try {\n            if (typeof action === 'function') action(host, floor);\n            const r = scanShape(cur, floor, 0);")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(readonlyJudge(broken), false, '★ 同款判据 J1 在副本上必须为 false');
        assert.equal(readonlyJudge(LR_MOD), true, '对照：原件上仍为真（差值来自破坏本身）');
    });
});

test('【N2】★★ 负控制·具名身份：一个面退回字面量占位 ⇒ J3 必须转红', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "            id: 'oplog', label: '操作日志', holds: 'records',\n            get: (h) => h.opLog || null,\n            drop: DROP_NOTHING,",
            "            id: 'oplog', label: '操作日志', holds: 'records',\n            get: (h) => h.opLog || null,\n            drop: () => 0,")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(identityJudge(broken), false, '★ J3 必须转红（「不参与删」与「撤了 0 条」又同形了）');
        assert.equal(identityJudge(LR_MOD), true, '对照：原件上仍为真');
    });
});

test('【N3】★★ 负控制·形状扫描：白名单当门复活 ⇒ J4 必须转红', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "        for (const k of Object.keys(v)) {\n            const child = v[k];",
            "        for (const k of ['items', 'facts', 'events', 'repairs']) {\n            const child = v[k];")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(scanJudge(broken), false, '★ J4 必须转红（diary/graph/floor-ledger 又成假 unmeasurable）');
        assert.equal(scanJudge(LR_MOD), true, '对照：原件上仍为真');
    });
});

test('【N4】★★ 负控制·形态归一化：previewLine 退回只认包装对象 ⇒ J5 必须转红', async () => {
    await withMirror({
        [LR]: (s) => mutateOnce(s,
            "            if (report.side === 'drop-preview') d = report;",
            "            if (false) d = report;")
    }, async (dir) => {
        const broken = (await import(pathToFileURL(path.join(dir, LR)).href + '?m=' + Date.now())).default;
        assert.equal(lineJudge(broken), false, '★ J5 必须转红（单侧报告又被读成「无预览」）');
        assert.equal(lineJudge(LR_MOD), true, '对照：原件上仍为真');
    });
});

test('【N5】★★ 负控制·键名：宿主开关名写错一个字 ⇒ J6 必须转红', async () => {
    await withMirror({
        [IDX]: (s) => mutateOnce(s,
            "rollbackPreviewEnabled: true,",
            "rollbackPreviewEnable: true,")
    }, async (dir) => {
        const brokenSrc = fs.readFileSync(path.join(dir, IDX), 'utf8');
        assert.equal(hostJudge(brokenSrc, SU_SRC), false, '★ J6 必须转红（配置键与 UI 控件对不上）');
        assert.equal(hostJudge(IDX_SRC, SU_SRC), true, '对照：原件上仍为 true');
    });
});

test('【N6】★★ 锚点自证：命中 0 次或 2 次以上时，破坏必须被拒绝', () => {
    assert.throws(() => mutateOnce(LR_SRC, 'this-string-does-not-exist-anywhere', 'x'), /锚点应恰好命中 1 次/);
    assert.throws(() => mutateOnce(LR_SRC, '        const target = floorOrNull(floor);', 'x'), /锚点应恰好命中 1 次/,
        '不唯一的锚点（previewSide 与 replaySide 各一处）必须被拒');
    assert.doesNotThrow(() => mutateOnce(LR_SRC, "        const head = { version: LEDGER_REPLAY_VERSION, side: side === 'drop' ? 'drop-preview' : 'shift-preview', floor: target };", 'x'),
        '唯一锚点必须被接受（否则上面的 throws 只是「什么都拒」）');
});