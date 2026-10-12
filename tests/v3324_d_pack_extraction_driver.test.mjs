/* ============================================================
 * tests/v3324_d_pack_extraction_driver.test.mjs — [v3.324.0 · D 包 M3-O5/M3-O7/M3-X9]（30 条）
 *
 * 【本套件要证明的是「关键事件不被周期楼漏掉、纠错方案改哪补哪说清楚」，不是「函数返回了对象」】
 *   M3-O5 抽取节奏（extraction-driver.js + index.js 接线）：
 *      ① 五类结构性信号（身份/承诺/物品/关系/事件）**恒即时** —— 不看周期、**不看档位**；
 *         反向对照：三档同一输入下 due 逐字同形（档位只影响平淡楼，永远影响不到关键事件）；
 *      ② 连续寒暄**攒批**且**溢出不是丢**：溢出条全部出现在返回值里 + 逐条标 overflowToNextBatch
 *         + 带同一到期楼层 + `deferredBatchCalls` 如实计数（「排到下一批」与「丢掉了」必须不同形）；
 *      ③ 「错过的楼」逐楼带原楼号回来（neverDropped）；**楼号读不到的另立一格**（补不回来 ≠ 补得回来）；
 *      ④ 重生成**只补受影响段**：未圈范围 ⇒ `scoped:false` 且**不产全量计划**；
 *      ⑤ 空读与平淡**严格分形**（`unreadable` 与 `chitchat` 各有其格，「没读到」不得写成「没什么可抽」）；
 *      ⑥ 档位词表**可关**：注入空数组即该类信号彻底关闭（回落缺省会让「关掉一类」做不到）。
 *   M3-O7 + M3-X9 纠错方案（correction-plan.js + index.js 接线）：
 *      ① 配置面 / 数据面**各成一面**（合成一个「纠错」会让人以为改配置顺便重写了历史事实）；
 *      ② 与原文对照**四态各自可达**：新增 / 保留 / 替换 / 冲突（冲突不得被吞进「替换」）；
 *      ③ **未圈范围不产提案**、**确认前不写**（`writes` 恒 0）、**以事实键为轴幂等**（重试只出一项）；
 *      ④ 对照**三态互不同形**：absent（还没跑过）/ unmeasurable（跑了判不了）/ measurable；
 *      ⑤ 撤配置与撤事实**分成两个 token**（合成一个会让两件都被以为回退了）；
 *      ⑥ 归类未定不得静默：未知类别不落默认档，如实计数并上面板。
 *   宿主接线面：两个取库口 + 三出口的**恒定键面**（缺席与在场逐字同键）+ onMessageReceived 真每轮调用点
 *     + 两诊断行**真跑出口**（「导出了但没人调」= 本仓定性的功能级失效）+ 两体检面分列 + 配置旋钮两跳可达。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。
 * 【当版锚点】本档自锚常量 + vnum（锚必须住在当版档案里）。
 * 【判据事实来源】本档所有期望值都由 `tools/v3324_probe.mjs` 与 `tools/v3324_host_probe.mjs`
 *   产出的真跑读数写成（落盘于 tools/v3324_probe.readings.txt / tools/v3324_host_probe.readings.txt），
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
const ED_SRC = read('extraction-driver.js');
const CP_SRC = read('correction-plan.js');
const FB_SRC = read('extract-feedback.js');
const SELF = read(path.join('tests', 'v3324_d_pack_extraction_driver.test.mjs'));
const MODS = ['extraction-driver.js', 'correction-plan.js'];
/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    new vm.Script(src).runInContext(ctx);
    return ctx[globalName];
}
const ED = loadIIFE(ED_SRC, 'LonShaExtractionDriver');
const CP = loadIIFE(CP_SRC, 'LonShaCorrectionPlan');
const FB = loadIIFE(FB_SRC, 'LonShaExtractFeedback');

/* ══════════════ A. M3-O5 抽取节奏 ══════════════ */
/** 真跑夹具：同一批条目（关键事件 + 寒暄 + 空读楼 + 无楼号楼）。 */
const ED_INPUT = () => ({
    floor: 12,
    entries: [
        { floor: 7, text: '其实我是珞花。' },
        { floor: 8, text: '今天的天气不错。' },
        { floor: 9, text: '' },
        { floor: 10, text: '我把钥匙交给你了。' },
        { floor: 11, text: '嗯，就这样吧。' },
    ],
    cadenceActive: ['diary', 'reflect'],
    missedFloors: [3, 5, 'x'],
    regenFloors: [7],
});
/** 判据①：结构性恒即时，且**任何档位都动不了它**（反向对照：三档 due 逐字同形）。 */
function edJudgeImmediate(api) {
    const per = ['quality', 'balanced', 'low-cost'].map((p) => api.plan(Object.assign(ED_INPUT(), { profile: p }), {}));
    const shapes = per.map((r) => JSON.stringify(r.due.map((d) => [d.floor, d.signals, d.types])));
    if (new Set(shapes).size !== 1) throw new Error('档位改变后结构性信号被动了（关键事件不得被推到周期楼外）：' + shapes.join(' | '));
    const d = per[1].due;
    if (d.length !== 2) throw new Error('即时面应得 2 楼（身份 + 物品），实 ' + d.length);
    const floors = d.map((x) => x.floor).join(',');
    if (floors !== '7,10') throw new Error('即时楼号不对（应为 7,10，顺序须按条目序）：' + floors);
    for (const x of d) if (x.why !== 'structural-immediate') throw new Error('即时条必须自述由来，实 ' + x.why);
    if (!per[1].readings.structuralImmediate) throw new Error('读数面须自述「本轮有即时条」');
    return { due: d.length, floors: floors };
}
/** 判据②：攒批溢出**不是丢**（溢出条全在返回值里 + 逐条标记 + 带同一到期楼层 + 计推后调用数）。 */
function edJudgeOverflowKept(api) {
    const many = [];
    for (let i = 1; i <= 9; i++) many.push({ floor: i, text: '嗯，随便聊聊第 ' + i + ' 句。' });
    const r = api.plan({ floor: 9, profile: 'quality', entries: many }, {});
    if (r.batched.length !== 9) throw new Error('返回值必须含**全部**寒暄条（只交本批会让「排到下一批」与「丢掉」同形），实 ' + r.batched.length);
    if (r.batchThisRound.length !== 1) throw new Error('quality 档一次只吃 1 条，实 ' + r.batchThisRound.length);
    const ov = r.batched.filter((b) => b.overflowToNextBatch === true);
    if (ov.length !== 8) throw new Error('溢出 8 条须逐条标记，实 ' + ov.length);
    if (r.readings.batchOverflow !== 8) throw new Error('读数面须报溢出条数，实 ' + r.readings.batchOverflow);
    if (r.readings.deferredBatchCalls !== 8) throw new Error('溢出条的调用只是**推后**不是省掉，须如实计（实 ' + r.readings.deferredBatchCalls + '）');
    const dueSet = new Set(r.batched.map((b) => b.dueAtFloor));
    if (dueSet.size !== 1) throw new Error('同一批须带**同一**到期楼层，实 ' + JSON.stringify([...dueSet]));
    /* 反向对照：balanced 档 4 条吃 3 留 1（档位真的在动批处理，不是死配置）。 */
    const bal = api.plan({ floor: 5, profile: 'balanced', entries: many.slice(0, 4) }, {});
    if (bal.readings.batchKept !== 3 || bal.readings.batchOverflow !== 1) {
        throw new Error('balanced 档批处理不对：' + JSON.stringify([bal.readings.batchKept, bal.readings.batchOverflow]));
    }
    return { all: r.batched.length, thisRound: r.batchThisRound.length, overflow: ov.length, deferred: r.readings.deferredBatchCalls };
}
/** 判据③：错过的楼逐楼带楼号回来；楼号读不到的**另立一格**。 */
function edJudgeMissed(api) {
    const r = api.plan(ED_INPUT(), {});
    if (r.missed.floors.join(',') !== '3,5') throw new Error('错过的楼须逐楼带原楼号并排序，实 ' + r.missed.floors.join(','));
    if (r.missed.count !== 2) throw new Error('错过条数不对，实 ' + r.missed.count);
    if (r.missed.noFloor !== 1) throw new Error('楼号读不到的须**另立一格**（补不回来 ≠ 补得回来），实 ' + r.missed.noFloor);
    if (r.missed.neverDropped !== true) throw new Error('错过面须自述「绝不丢弃」');
    if (r.readings.missedRecovered !== 2) throw new Error('读数面补回数不对，实 ' + r.readings.missedRecovered);
    return { floors: r.missed.floors, noFloor: r.missed.noFloor };
}
/** 判据④：重生成只补受影响段；未圈范围 ⇒ scoped:false 且不产全量计划。 */
function edJudgeRegen(api) {
    const scoped = api.plan(ED_INPUT(), {}).regen;
    if (scoped.scoped !== true || scoped.floors.join(',') !== '7') throw new Error('圈了范围须只列该段：' + JSON.stringify(scoped));
    /* ★ 真读数（tools/v3324_probe.readings.txt = 5 条条目、圈定 7 楼）：未列出段 = 5 - 1 = **4** 条。
     *   「未列出」数的是**除圈定段外的条目**，不是条目总数 —— 拿总数当 untouched 会让
     *   「圈了一条」与「一条没圈」在读数上同形（两者都报 5），本判据正是拦这个。 */
    if (scoped.untouched !== 4) throw new Error('未列出段须计数（一条不动），实 ' + scoped.untouched);
    const none = api.plan({ floor: 4, entries: ED_INPUT().entries }, {}).regen;
    if (none.scoped !== false || none.floors.length !== 0) throw new Error('未圈范围不得产全量计划：' + JSON.stringify(none));
    /* 反向对照：未圈范围时**全部**条目都不动（5 条），与圈定后的 4 条不同形。 */
    if (none.untouched !== 5) throw new Error('未圈范围须报「全都不动」= 5，实 ' + none.untouched);
    return { scoped: scoped.floors, untouched: scoped.untouched, noRangeScoped: none.scoped, noRangeUntouched: none.untouched };
}
/** 判据⑤：空读与平淡严格分形；词表可关（空数组即最终值）。 */
function edJudgeUnreadableAndMarkers(api) {
    const r = api.plan(ED_INPUT(), {});
    if (r.unreadable.length !== 1 || r.unreadable[0].floor !== 9) throw new Error('空读楼须单列，实 ' + JSON.stringify(r.unreadable));
    if (r.readings.batched !== 2) throw new Error('平淡楼 2 条（8/11 楼），实 ' + r.readings.batched);
    const empty = api.markersOf({ markers: { identity: [] } });
    if (empty.identity.length !== 0) throw new Error('注入空数组必须是**最终值**（否则「关掉一类词表」做不到），实 ' + JSON.stringify(empty.identity));
    if (empty.commitment.length === 0) throw new Error('未注入的类别须回落缺省（逐类覆盖，不是整表替换）');
    const off = api.plan({ floor: 2, entries: [{ floor: 2, text: '其实我是谁。' }] }, { markers: { identity: [] } });
    if (off.due.length !== 0 || off.batched.length !== 1) throw new Error('关掉 identity 词表后该条应判平淡，实 ' + JSON.stringify([off.due.length, off.batched.length]));
    return { unreadable: r.unreadable.length, batched: r.readings.batched, markersOff: off.batched.length };
}
/** 判据⑥：只读零写 + 不抛（畸形入参降级为读数）+ 无读数与空安排不同形。 */
function edJudgeDiscipline(api) {
    const inp = ED_INPUT();
    const snap = JSON.stringify(inp);
    const r1 = api.plan(inp, {});
    const r2 = api.plan(inp, {});
    if (snap !== JSON.stringify(inp)) throw new Error('零写：入参不得被改');
    if (JSON.stringify(r1) !== JSON.stringify(r2)) throw new Error('同输入须逐字同形（可复算）');
    if (r1.zeroWrite !== true) throw new Error('须自述 zeroWrite');
    const nul = api.plan(null, {});
    if (nul.malformedInput !== true) throw new Error('null 算**畸形入参**（与「没传」不同形）');
    if (api.plan(undefined, {}).malformedInput !== false) throw new Error('undefined 才是「没传」');
    if (api.plan([], {}).malformedInput !== true) throw new Error('数组算畸形入参');
    const line = String(api.line({}));
    if (line.indexOf('未产出读数') < 0) throw new Error('无读数时**不得**替面板编结论（「即时 0 · 批处理 0」= 无据），实 ' + line);
    const sc = api.selfCheck();
    if (!sc.ok) throw new Error('模块自检必须全绿：' + JSON.stringify(sc));
    return { selfCheck: Object.keys(sc).length - 1, line: line };
}

/* ══════════════ B. M3-O7 + M3-X9 纠错方案 ══════════════ */
const CP_OLD = () => [{ key: 'f1', value: '北京', floor: 3 }, { key: 'f2', value: '同事', floor: 4 }];
const CP_NEW = () => [{ key: 'f1', value: '上海', floor: 3, stale: true }, { key: 'f2', value: '同事', floor: 4 },
    { key: 'f3', value: '新事', floor: 5 }, { key: 'f3', value: '新事', floor: 5 }];
/** 判据①：两面各自成面 + 未圈范围不产提案 + 恒定键面（早退面与正常路径逐字同键）。 */
function cpJudgeFaces(api) {
    const rx = api.planReextract({ range: { from: 3, to: 5 }, oldFacts: CP_OLD(), newFacts: CP_NEW() }, {});
    const cfg = api.planConfigFix([{ cls: 'missed' }], {}, {});
    if (rx.face !== 'data' || cfg.face !== 'config') throw new Error('两面须各自自述面名');
    if (rx.kind === cfg.kind) throw new Error('两面 kind 必须不同（合成一面 = 改配置顺便重写历史事实）');
    const none = api.planReextract({ oldFacts: CP_OLD(), newFacts: CP_NEW() }, {});
    if (none.scoped !== false || none.decidable !== false) throw new Error('未圈范围不得判为可决策：' + JSON.stringify([none.scoped, none.decidable]));
    if (none.items.length !== 0) throw new Error('未圈范围不得产提案（「没选范围」不等于「全选」），实 ' + none.items.length);
    if (none.writes !== 0) throw new Error('提案面恒零写，实 ' + none.writes);
    const kd = Object.keys(rx).join(','), kn = Object.keys(none).join(',');
    if (kd !== kn) throw new Error('早退面与正常路径键面不同形（下游按键断言会读到 undefined）：\n  正常 ' + kd + '\n  早退 ' + kn);
    return { faces: rx.face + '/' + cfg.face, noRangeItems: none.items.length };
}
/** 判据②：对照四态各自可达（冲突不得被吞进「替换」）。 */
function cpJudgeOutcomes(api) {
    const r = api.planReextract({ range: { from: 3, to: 5 }, oldFacts: CP_OLD(), newFacts: CP_NEW() }, {});
    const o = r.byOutcome;
    if (o.replaced !== 1 || o.kept !== 1 || o.added !== 1) throw new Error('新增/保留/替换三态不对：' + JSON.stringify(o));
    if (r.readings.considered !== 4) throw new Error('新事实 4 条都须进对照面（含重复那条），实 ' + r.readings.considered);
    if (r.readings.newNoKey !== 0) throw new Error('本夹具无无键事实，实 ' + r.readings.newNoKey);
    /* 冲突态：同键换值但**未标记换代** ⇒ 必须判 conflicted（「改了口径」与「同一时点两个值」处置相反）。 */
    const conflict = api.planReextract({
        range: { from: 3, to: 3 },
        oldFacts: [{ key: 'f9', value: '旧值', floor: 3 }],
        newFacts: [{ key: 'f9', value: '新值', floor: 3 }],
    }, {});
    if (conflict.byOutcome.conflicted !== 1) throw new Error('同一时点两个值须判冲突，实 ' + JSON.stringify(conflict.byOutcome));
    if (conflict.byOutcome.replaced !== 0) throw new Error('未标记换代不得算替换');
    /* 无键事实：如实计数，不静默吞掉。 */
    const noKey = api.planReextract({ range: { from: 1, to: 9 }, newFacts: [{ floor: 2, value: 'x' }], oldFacts: [] }, {});
    if (noKey.readings.newNoKey !== 1) throw new Error('无键事实须计数（它进不了以键为轴的对照），实 ' + noKey.readings.newNoKey);
    /* 范围外：计数并**不进提案**。 */
    if (r.readings.outOfScope !== 0) throw new Error('本夹具范围全覆盖，实 ' + r.readings.outOfScope);
    return { byOutcome: o, conflict: conflict.byOutcome.conflicted };
}
/** 判据③：确认前不写 + 以事实键为轴幂等 + 未圈范围三态（含端点读不到）。 */
function cpJudgeIdempotent(api) {
    const mk = () => ({ range: { from: 3, to: 5 }, oldFacts: CP_OLD(), newFacts: CP_NEW() });
    const a = api.planReextract(mk(), {});
    if (a.writes !== 0 || a.applied !== false) throw new Error('确认前一个字节都不落盘，实 ' + JSON.stringify([a.writes, a.applied]));
    if (a.staged.proposed !== a.items.length) throw new Error('全部提案须处于「待确认」态，实 ' + JSON.stringify(a.staged));
    if (a.retry.duplicatesPrevented !== 1) throw new Error('同键重试只出一项（幂等轴=事实键），实 ' + a.retry.duplicatesPrevented);
    if (a.items.filter((i) => i.key === 'f3').length !== 1) throw new Error('重复事实 f3 只能出一项');
    const b = api.planReextract(mk(), {});
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('同输入须可复算');
    const reasons = [
        [null, 'no-range'], [undefined, 'no-range'], [[], 'empty-range'],
        [{ from: 9, to: 3 }, 'reversed-range'], [{ from: null, to: 5 }, 'endpoint-unreadable'],
        [{}, 'endpoint-unreadable'], [{ from: 'x', to: 'y' }, 'endpoint-unreadable'],
    ];
    const got = reasons.map(([rg, want]) => {
        const out = api.planReextract({ range: rg, oldFacts: CP_OLD(), newFacts: CP_NEW() }, {});
        if (out.scope.reason !== want) throw new Error('范围形态 ' + JSON.stringify(rg) + ' 应判 ' + want + '，实 ' + out.scope.reason);
        if (out.items.length !== 0) throw new Error(want + ' 不得产提案');
        return want;
    });
    return { untouched: a.untouched, duplicates: a.retry.duplicatesPrevented, reasons: got };
}
/** 判据④：对照三态互不同形（缺席 / 不可测 / 可测）+ 背书只看真读数。 */
function cpJudgeCompareStates(api) {
    const absent = api.planConfigFix([{ cls: 'missed' }], {}, {});
    const unmeas = api.planConfigFix([{ cls: 'missed' }], { compare: { measurable: false } }, {});
    const ok = api.planConfigFix([{ cls: 'missed' }], { compare: { measurable: true }, holdout: { measured: true, improved: true } }, {});
    if (absent.compareState !== 'absent' || unmeas.compareState !== 'unmeasurable' || ok.compareState !== 'measurable') {
        throw new Error('对照三态须互不同形：' + JSON.stringify([absent.compareState, unmeas.compareState, ok.compareState]));
    }
    if (absent.proof !== 'unproven' || unmeas.proof !== 'unproven') throw new Error('未验一律 unproven（不可测 ≠ 通过）');
    if (ok.proof !== 'proven') throw new Error('对照可测 + 留出集改善才是 proven，实 ' + ok.proof);
    if (absent.candidates[0].proofWhy === unmeas.candidates[0].proofWhy) throw new Error('「还没跑过」与「跑了判不了」的理由必须不同（合成一档会让读者以为跑过了）');
    const overfit = api.planConfigFix([{ cls: 'missed' }], { compare: { measurable: true }, holdout: { measured: true, improved: false } }, {});
    if (overfit.proof !== 'overfit') throw new Error('留出集未改善须判 overfit（只优化了当前样本），实 ' + overfit.proof);
    if (overfit.candidates[0].needsMeasure !== false) throw new Error('可测时不得再要求测量');
    if (absent.candidates[0].needsMeasure !== true) throw new Error('判不了且该类可测时须标 needsMeasure');
    return { states: [absent.compareState, unmeas.compareState, ok.compareState], proof: ok.proof };
}
/** 判据⑤：撤配置与撤事实分开 + 不给值（不替用户调参）+ 归类未定不静默 + 无反馈面恒定键。 */
function cpJudgeConfigFace(api) {
    const r = api.planConfigFix([{ cls: 'missed' }, { cls: '看不懂的类' }], { compare: { measurable: true } }, {});
    if (r.count !== 1 || r.unknownClass !== 1) throw new Error('未知类别不落默认档且须如实计数：' + JSON.stringify([r.count, r.unknownClass]));
    if (r.candidates[0].substitute.key !== null) throw new Error('只给「面向」，**不给值**（给值就是替用户调参）');
    if (r.undo.separate !== true || r.undo.kinds.length !== 2) throw new Error('撤配置/撤事实须分成两个 token，实 ' + JSON.stringify(r.undo.kinds));
    if (r.undo.configUndo.touchesFacts !== false || r.undo.factUndo.touchesConfig !== false) throw new Error('两个撤销面不得互相触碰');
    if (r.applied !== false || r.defaultAuto !== false) throw new Error('提案面不得自动应用');
    const none = api.planConfigFix([], null, {});
    if (none.reason !== 'no-feedback' || none.count !== 0) throw new Error('无反馈须给具名 reason，实 ' + JSON.stringify([none.reason, none.count]));
    const keysNormal = Object.keys(r).join(',');
    const keysNone = Object.keys(none).join(',');
    if (keysNormal !== keysNone) throw new Error('「无反馈」早退面与正常路径键面不同形：\n  ' + keysNormal + '\n  ' + keysNone);
    if (none.undo.separate !== true) throw new Error('无反馈也得说清两个撤销面是分开的');
    return { unknown: r.unknownClass, undos: r.undo.kinds.length };
}
/** 判据⑥：键集与 extract-feedback 的 PROBLEM_CLASSES 逐字对齐 + 自检 + 无读数不同形。 */
function cpJudgeAlignAndDiscipline(api) {
    const mine = Object.keys(api.CLASS_CANDIDATES);
    const theirs = (FB && FB.PROBLEM_CLASSES) ? [].concat(FB.PROBLEM_CLASSES).map((x) => (typeof x === 'string' ? x : (x && (x.key || x.id || x.cls)))) : [];
    if (!theirs.length) throw new Error('extract-feedback 的类别真源读不到（本判据的前提不成立）');
    for (const k of theirs) if (mine.indexOf(k) < 0) throw new Error('类别 ' + k + ' 在纠错方案里没有对应面（对不齐 ⇒ 收得到反馈却归不出面）');
    /** 判据：畸形入参如实计（null 与「没传」不同形）。 */
    if (api.planReextract(null, {}).malformedInput !== true) throw new Error('null 算畸形入参');
    if (api.planReextract(undefined, {}).malformedInput !== false) throw new Error('undefined 才是「没传」');
    if (api.planConfigFix(null, null, {}).malformedInput !== false) throw new Error('无反馈 ≠ 畸形入参（两者不同形）');
    const line = String(api.line({}));
    if (line.indexOf('未产出读数') < 0) throw new Error('无读数时不得编结论，实 ' + line);
    const sc = api.selfCheck();
    if (!sc.ok) throw new Error('模块自检必须全绿：' + JSON.stringify(sc));
    const grid = [['planReextract'], ['planConfigFix']];
    for (const [fn] of grid) if (typeof api[fn] !== 'function') throw new Error('缺出口 ' + fn);
    return { classes: mine.length, aligned: theirs.length, selfCheck: Object.keys(sc).length - 1 };
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
const LIB_HEADS = ['function _moduleLib(getGlobal, fileName) {', 'function _extractionDriverLib() {',
    'function _correctionPlanLib() {'];
const METH_HEADS = ['_extractionWindowFloors(message) {', 'extractionPlan(opts) {', '_extractionDriverLine() {',
    'correctionPlanReextract(input, opts) {', 'correctionPlanConfig(feedback, trace, opts) {',
    '_correctionPlanLine() {'];
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
const WIN_FULL = () => ({ LonShaExtractionDriver: ED, LonShaCorrectionPlan: CP });
const HOST_CHAT = () => [
    { mes: '今天的天气不错。' }, { mes: '其实我是珞花。' }, { mes: '嗯，就这样吧。' },
    { mes: '我答应你，会把书还回去。' }, { mes: '钥匙我放在抽屉里了。' },
];
/** 在场宿主状态：**方法侧**挡位与图（窗口不在这一侧 —— 窗口住在 vm 的 `window` 里）。 */
function hostState() {
    return {
        config: { config: { extractionProfile: 'balanced' } },
        isOmittedFloor: () => false,
        graph: { edges: new Map() },
    };
}
/** ★ 真窗口装配位：`_extractionWindowFloors` 读的是 `new Function('errLog','window',...)` **闭包捕获的**
 *   `window`（即第一个参数传进去的那个对象），**不是**方法对象上的 `SillyTavern`。
 *   把 `SillyTavern` 挂到方法对象上，窗口取数会读到 0 条 —— 那是「测试装配错」，不是实现错。 */
function winWith(chat, withLibs) {
    const w = withLibs ? WIN_FULL() : {};
    w.SillyTavern = { getContext: () => ({ chat: chat || HOST_CHAT() }) };
    return w;
}
/** 装配「在场宿主」：真 window（含酒馆上下文）+ 方法侧状态。 */
function mkSelf(src, chat, withLibs) {
    return Object.assign(mkHost(winWith(chat, withLibs !== false), src), hostState());
}
/** 判据 C1：恒定键面（缺席与在场逐字同键）+ 缺席是真读数 + 不抛。 */
function hostJudgeFace(src) {
    const self = Object.assign(mkHost(WIN_FULL(), src), hostState());
    const eng = Object.assign(mkHost({}, src), hostState());
    const pairs = [
        [self.extractionPlan({ floor: 5, entries: [] }), eng.extractionPlan({ floor: 5, entries: [] }), 'extractionPlan'],
        [self.correctionPlanReextract({ range: { from: 1, to: 3 }, newFacts: [], oldFacts: [] }, {}),
            eng.correctionPlanReextract({ range: { from: 1, to: 3 }, newFacts: [], oldFacts: [] }, {}), 'correctionPlanReextract'],
        [self.correctionPlanConfig([{ cls: 'missed' }], {}, {}), eng.correctionPlanConfig([{ cls: 'missed' }], {}, {}), 'correctionPlanConfig'],
    ];
    for (const [here, absent, name] of pairs) {
        const k1 = Object.keys(here).join(','), k2 = Object.keys(absent).join(',');
        if (k1 !== k2) throw new Error(name + ' 缺席与在场键面不同（恒定键面是「下游按键断言不必猜」的前提）：\n  在场 ' + k1 + '\n  缺席 ' + k2);
        if (absent.ok !== false) throw new Error(name + ' 缺席面须报 ok:false');
        if (absent.degraded !== false) throw new Error(name + ' 缺席面不得报 degraded（那是「跑了但降级」）');
    }
    if (eng.extractionPlan({}).reason !== 'module-unavailable') throw new Error('抽取节奏缺席须给具名 reason');
    if (eng.correctionPlanReextract({}, {}).reason !== 'module-unavailable') throw new Error('数据面缺席须给具名 reason');
    if (eng.correctionPlanConfig([], null, {}).reason !== 'module-unavailable') throw new Error('配置面缺席须给具名 reason');
    const lineNo = String(eng._extractionDriverLine());
    if (lineNo.indexOf('模块未加载') < 0) throw new Error('抽取节奏诊断行缺席归因缺失：' + lineNo);
    const lineNo2 = String(eng._correctionPlanLine());
    if (lineNo2.indexOf('模块未加载') < 0) throw new Error('纠错方案诊断行缺席归因缺失：' + lineNo2);
    return { keys: Object.keys(pairs[0][0]).length };
}
/** 判据 C2/C4：真跑通（真窗口 → 真安排；真事实 → 真对照）+ 诊断行真带读数。 */
function hostJudgeRun(src) {
    const self = mkSelf(src);
    const w = self._extractionWindowFloors({ index: 4 });
    if (w.entries.length !== 5 || w.from !== 0 || w.to !== 4) throw new Error('真窗口取数不对：' + JSON.stringify([w.entries.length, w.from, w.to]));
    const ed = self.extractionPlan({ floor: 4, entries: w.entries });
    if (!ed.ok) throw new Error('抽取节奏没跑通：' + ed.reason);
    if (ed.readings.structuralDue !== 2 || ed.due.map((d) => d.floor).join(',') !== '1,3') {
        throw new Error('真窗口下的即时楼不对（应 1 楼身份 + 3 楼承诺）：' + JSON.stringify(ed.due.map((d) => d.floor)));
    }
    if (ed.readings.batched !== 3) throw new Error('真窗口下平淡楼 3 条，实 ' + ed.readings.batched);
    /* 档位真消费（换档必须真的改变安排 —— 否则配置是「死配置」的另一种形态）。 */
    const low = self.extractionPlan({ floor: 4, entries: w.entries, profile: 'low-cost' });
    if (low.nextBatchFloor === ed.nextBatchFloor) throw new Error('换档未改变到期楼层（档位没被真消费）');
    if (JSON.stringify(low.due.map((d) => d.floor)) !== JSON.stringify(ed.due.map((d) => d.floor))) {
        throw new Error('换档不得动即时楼（关键事件与档位无关）');
    }
    const lineEd = String(self._extractionDriverLine());
    /* ★ 诊断行必须是**真跑出口**的读数（不是缓存、也不是替面板编的结论）：
     *   逐字等于「同参数真跑一次出口」的结果 —— 出口一旦零调用点，这条判据立刻现形。 */
    const expectEd = String(ED.line(self.extractionPlan({})));
    if (lineEd !== expectEd) throw new Error('抽取节奏诊断行不是真跑出口的读数：' + lineEd + ' ≠ ' + expectEd);
    if (lineEd.indexOf('节奏') < 0) throw new Error('抽取节奏诊断行没带节奏读数：' + lineEd);
    /* 数据面真跑：真事实 → 四态对照。 */
    const oldFacts = [{ key: 'f1', value: '北京', floor: 3 }];
    const newFacts = [{ key: 'f1', value: '上海', floor: 3, stale: true }, { key: 'f2', value: '同事', floor: 4 }];
    const rx = self.correctionPlanReextract({ range: { from: 3, to: 4 }, oldFacts: oldFacts, newFacts: newFacts }, {});
    if (!rx.ok || rx.byOutcome.replaced !== 1 || rx.byOutcome.added !== 1) throw new Error('数据面对照没跑通：' + JSON.stringify(rx.byOutcome));
    if (rx.writes !== 0) throw new Error('提案面恒零写，实 ' + rx.writes);
    const noRange = self.correctionPlanReextract({ oldFacts: oldFacts, newFacts: newFacts }, {});
    if (Object.keys(noRange).join(',') !== Object.keys(rx).join(',')) throw new Error('未圈范围与圈了范围键面不同形');
    /* 配置面真跑：三态各自可达。 */
    const st = [
        self.correctionPlanConfig([{ cls: 'missed' }], {}, {}).compareState,
        self.correctionPlanConfig([{ cls: 'missed' }], { compare: { measurable: false } }, {}).compareState,
        self.correctionPlanConfig([{ cls: 'missed' }], { compare: { measurable: true }, holdout: { measured: true, improved: true } }, {}).compareState,
    ];
    if (st.join('/') !== 'absent/unmeasurable/measurable') throw new Error('配置面三态没跑通：' + st.join('/'));
    const lineCp = String(self._correctionPlanLine());
    if (lineCp.indexOf('尚无提取反馈') < 0) throw new Error('纠错方案诊断行没报配置面读数：' + lineCp);
    if (lineCp.indexOf('重提取范围未圈定') < 0) throw new Error('纠错方案诊断行没报数据面读数（两面都须上诊断台）：' + lineCp);
    return { window: w.entries.length, due: ed.due.length, outcomes: rx.byOutcome };
}
/** 判据 C3：真每轮调用点 —— 落在 onMessageReceived 内、在门控之后、且**不改**门控既有判定。 */
function hostJudgeCallSite(src) {
    const i = src.indexOf('async onMessageReceived(');
    if (i < 0) throw new Error('onMessageReceived 不在场（结构位移）');
    const j = src.indexOf('\n        }', i);
    const omr = src.slice(i, j < 0 ? i + 20000 : j);
    if (omr.indexOf('_extractionDriverLib()') < 0) throw new Error('真每轮调用点缺取库口');
    if (omr.indexOf('_ED.plan(') < 0) throw new Error('真每轮调用点没真算安排（导出即摆设的另一种形态）');
    if (omr.indexOf('this._extractionDriverRead =') < 0) throw new Error('真每轮调用点没落读数（诊断面将无从读起）');
    if (omr.indexOf('this.config.config.extractionProfile') < 0) throw new Error('档位没接到真每轮路径（配置将成死配置）');
    /* ★ 调用点必须**真取窗口**（不是空转）：把窗口取数摘掉即成「空跑一遍」，那是导出即摆设的变体。
     *   本判据同时也是 E11 的落点。 */
    if (!/_win\s*=\s*this\._extractionWindowFloors\(message\)/.test(omr)) {
        throw new Error('真每轮调用点没真取窗口（_win 未接 _extractionWindowFloors)');
    }
    if (omr.indexOf('entries: _win.entries') < 0) throw new Error('窗口取数没喂给安排面（取了不用 = 空转）');
    /* 门控既有判定一处不得改（本刀是**加法**，不是替换）。 */
    for (const keep of ['smartTriggerEnabled === true', '_triggerDecision.triggered === false', 'this.extractMemorySimple(message)', 'this._triggerStats.push(']) {
        if (omr.indexOf(keep) < 0) throw new Error('门控既有判定被本刀改动：' + keep);
    }
    if (omr.indexOf('onMessageReceived.事件性门控') > omr.indexOf('onMessageReceived.抽取节奏')) {
        throw new Error('抽取节奏须落在门控之后（门控定「这一楼值不值得抽」，节奏定「怎么排」）');
    }
    if (omr.indexOf('await this.extractMemoryWithLLM(message)') < 0) throw new Error('既有 LLM 提取路径不得被本刀短路');
    return { omrLen: omr.length };
}
/** 判据 C5：两诊断行**真跑出口**（出口必须有真实调用者 —— 本仓定性的功能级失效形态）。 */
function hostJudgeLinesCallExits(src) {
    for (const [header, called] of [['_extractionDriverLine() {', 'this.extractionPlan('],
        ['_correctionPlanLine() {', 'this.correctionPlanReextract(']]) {
        const body = sliceMember(src, header);
        if (!body) throw new Error('诊断行切片缺失：' + header);
        if (body.indexOf(called) < 0) throw new Error('诊断行未真跑出口 ' + called + '（导出即摆设 ⇒ 该面在真实运行中永不产出）');
    }
    const cpLine = sliceMember(src, '_correctionPlanLine() {');
    if (cpLine.indexOf('this.correctionPlanConfig(') < 0) throw new Error('纠错方案诊断行只报一面（另一面在诊断台上不存在）');
    return { ok: true };
}
/** 判据 C6：两体检面分列且各占一行、行名互不相同（既有面的早退三态本就多次出现，不算合并）。 */
function hostJudgeFaces(src) {
    const names = ['门控读数', '提取反馈', '抽取节奏', '纠错方案'];
    const idx = names.map((n) => src.indexOf("['" + n + "'"));
    if (idx.some((i) => i < 0)) throw new Error('体检面缺行：' + names.filter((n, i) => idx[i] < 0).join('/'));
    if (new Set(idx).size !== idx.length) throw new Error('体检面行名必须互不相同（共用提示位会把两类问题混成一个）');
    const merged = src.split('\n').filter((ln) => names.filter((n) => ln.indexOf("['" + n + "'") >= 0).length > 1);
    if (merged.length) throw new Error('体检面被合并到同一行：' + merged[0].trim().slice(0, 100));
    for (const a of names) for (const b of names) {
        if (a !== b && src.indexOf("['" + a + '/' + b) >= 0) throw new Error('两个面被拼成一个新面名：' + a + '/' + b);
    }
    if (src.indexOf("['抽取节奏', line + (bad ? ' ⚠️' : '')]") < 0) throw new Error('抽取节奏面缺报警形态');
    if (src.indexOf("['纠错方案', line + (bad ? ' ⚠️' : '')]") < 0) throw new Error('纠错方案面缺报警形态');
    return { faces: names };
}
/** 判据 C7：配置旋钮两跳可达（默认块声明 + UI 控件 + 真消费），口径与 scan_config_liveness 一致。 */
function hostJudgeConfigKnob(src) {
    const cfg = read('memory-config.js');
    const ui = read('settings-ui.js');
    if (!/extractionProfile:\s*'balanced'/.test(cfg)) throw new Error('默认块未声明 extractionProfile（子配置将是 undefined）');
    if (ui.indexOf('data-cfg-text="extractionProfile"') < 0) throw new Error('UI 无控件（用户改不到 ⇒ 档位不可配）');
    /* 两跳可达的第一跳：键在**方法体内**被提及（不是只在注释里）。 */
    const i = src.indexOf('async onMessageReceived(');
    const j = src.indexOf('\n        }', i);
    const omr = src.slice(i, j < 0 ? i + 20000 : j);
    if (omr.indexOf('this.config.config.extractionProfile') < 0) throw new Error('键不在真每轮方法体内被消费（第一跳缺失）');
    /* 第二跳：消费它的方法必须有调用者 —— onMessageReceived 是入口钩子，天然有调用者；
     *   出口 method 侧的消费点由 C2 真跑证明（真换档 → 真改变安排）。 */
    if (src.indexOf('this.config.config.extractionProfile') < 0) throw new Error('键在出口侧无消费路径');
    return { knob: 'extractionProfile' };
}

/* ══════════════ 破坏锚点（负控制用的**真源码**片段，逐字取自实现） ══════════════ */
const ANCHORS = {
    /* ED：把「结构性恒即时」改成「按周期攒批」—— 关键事件被推到周期楼外的原始形态。 */
    edImmediate: "                due.push({ floor: c.floor, signals: c.signals, hits: c.hits, types: c.types.slice(), why: 'structural-immediate' });",
    /* ED：溢出条不进返回值（只交本批 ⇒「排到下一批」与「丢掉」同形）。 */
    edBatchAll: "        const batchOverflowItems = batched.slice(rules.maxBatch);",
    /* ED：空数组回落缺省 ⇒「关掉一类词表」做不到。 */
    edMarkersEmpty: "            out[sig] = Array.isArray(raw)\n                ? raw.map(oneLine).filter(Boolean)\n                : DEFAULT_MARKERS[sig].map(oneLine).filter(Boolean);",
    /* ED：无读数时替面板编结论（返回「即时 0 · 批处理 0」）。 */
    edLineNoRead: "        if (r.kind !== ED_KIND) return '—（模块未产出读数）';",
    /* CP：冲突态被吞进「替换」（未标记换代也算替换）。 */
    cpConflict: "            else outcome = 'conflicted';",
    /* CP：未圈范围也产提案（「没选范围」等于「全选」）。 */
    cpScopedOnly: "        if (!sc.scoped || !sc.known) {",
    /* CP：无反馈早退面缺键（早退面与正常路径不同形）。 */
    cpNoFeedbackKeys: "                applied: false, defaultAuto: false, writes: 0, zeroWrite: true,\n                decidable: false, proof: 'unproven', compareState: 'absent',\n                reason: 'no-feedback', why: '无反馈 ⇒ 不产候选（不产空候选集，也不产「无事可做」的假结论）',\n                malformedInput: false, degraded: false\n            };",
    /* CP：对照缺席与不可测合成一档。 */
    cpCompareStates: "        const cmpState = !tr.compare ? 'absent'\n            : ((tr.compare.measurable === false || tr.compare.ok === false) ? 'unmeasurable' : 'measurable');",
    /* 宿主：缺席面少一格键（恒定键面被破）。 */
    idxAbsentKeys: "        const absent = (why) => ({ kind: 'extraction_driver', version: 0, floor: null, profile: '', profileKnown: false, rules: {}, due: [], batched: [], batchThisRound: [], deferredTypes: [], nextBatchFloor: null, unreadable: [], noFloor: [], missed: { floors: [], count: 0, noFloor: 0, neverDropped: true, why: '' }, regen: { scoped: false, floors: [], types: [], untouched: 0, why: '' }, readings: {}, zeroWrite: true, malformedInput: false, degraded: false, ok: false, reason: why });",
    /* 宿主：诊断行不真跑出口（只吃缓存 ⇒ 出口零调用点）。 */
    idxLineCallsExit: "        const got = this.extractionPlan({});\n        if (!got.ok) return '抽取节奏不可用（' + got.reason + '）';",
    /* 宿主：真每轮调用点整段消失（导出即摆设）。 */
    idxCallSite: "                        const _win = this._extractionWindowFloors(message);",
    /* 宿主：体检面被并成一行（两个面共用一个提示位）。 */
    idxFaceMerged: "                        return ['抽取节奏', line + (bad ? ' ⚠️' : '')];\n                        } catch (e) { errLog(e, 'selfCheck.extractionDriver'); return ['抽取节奏', '—（诊断异常）']; }",
};

/* ══════════════ C. 宿主接线（真装配） ══════════════ */
test('v3324 C1. ★★★ 宿主三出口的恒定键面：缺席与在场逐字同键，缺席给具名 reason', () => {
    const r = hostJudgeFace(IDX);
    console.log('  ✓ 三出口键面同形（' + r.keys + ' 键）；缺席 reason=module-unavailable，两诊断行如实归因');
});
test('v3324 C2. ★★★ 宿主真跑通：真窗口 → 真安排；真事实 → 真四态对照；档位真消费', () => {
    const r = hostJudgeRun(IDX);
    console.log('  ✓ 窗口 ' + r.window + ' 楼 / 即时 ' + r.due + ' 楼 / 对照 ' + JSON.stringify(r.outcomes));
});
test('v3324 C3. ★★★ 真每轮调用点：落在 onMessageReceived 内、门控之后、且不改门控既有判定', () => {
    const r = hostJudgeCallSite(IDX);
    console.log('  ✓ 调用点在门控段之后（omr ' + r.omrLen + ' 字符内），门控四处既有判定逐字未动');
});
test('v3324 C4. ★★ 两诊断行真跑出口（数据面出口不得零调用点）+ 两面都上诊断台', () => {
    const r = hostJudgeLinesCallExits(IDX);
    console.log('  ✓ 两诊断行各真跑其出口；纠错方案行两面都报 ' + JSON.stringify(r));
});
test('v3324 C5. ★★ 两体检面分列且各占一行（不合并、不拼名）', () => {
    const r = hostJudgeFaces(IDX);
    console.log('  ✓ ' + r.faces.join(' / ') + ' 四行互不相同，各占一行');
});
test('v3324 C6. ★★ 配置旋钮 extractionProfile 两跳可达（默认块 + UI + 真消费）', () => {
    const r = hostJudgeConfigKnob(IDX);
    console.log('  ✓ ' + r.knob + '：默认块声明 + UI 控件 + 真每轮消费（过 scan_config_liveness 口径）');
});
test('v3324 C7. ★★ 窗口取数：番外楼不进窗口但如实计数（「跳过番外」≠「窗口里本来没有」）', () => {
    const self = mkSelf();
    self.isOmittedFloor = (m) => String(m.mes || '').indexOf('番外') >= 0;
    const w = self._extractionWindowFloors({ index: 4 });
    if (w.omitted !== 0) throw new Error('本夹具无番外楼，实 ' + w.omitted);
    const chat = HOST_CHAT();
    chat[2] = { mes: '番外：作者的话' };
    const self2 = mkSelf(undefined, chat);
    self2.isOmittedFloor = (m) => String(m.mes || '').indexOf('番外') >= 0;
    const w2 = self2._extractionWindowFloors({ index: 4 });
    if (w2.omitted !== 1 || w2.entries.length !== 4) throw new Error('番外楼须不进窗口但计数：' + JSON.stringify([w2.omitted, w2.entries.length]));
    console.log('  ✓ 番外 1 楼：窗口 ' + w2.entries.length + ' 条 / 跳过计数 ' + w2.omitted);
});

/* ══════════════ A/B 正式判据 ══════════════ */
test('v3324 A1. ★★★ M3-O5 五类结构性信号恒即时，且三档都动不了它（反向对照）', () => {
    const r = edJudgeImmediate(ED);
    console.log('  ✓ 三档同一输入 due 逐字同形：' + r.floors + '（' + r.due + ' 楼）');
});
test('v3324 A2. ★★★ M3-O5 攒批溢出不是丢：全在返回值里 + 逐条标记 + 调用只是推后', () => {
    const r = edJudgeOverflowKept(ED);
    console.log('  ✓ 9 条寒暄：全在 batched(' + r.all + ') / 本轮 ' + r.thisRound + ' / 溢出 ' + r.overflow + ' / 推后调用 ' + r.deferred);
});
test('v3324 A3. ★★ M3-O5 错过的楼带原楼号回来，楼号读不到的另立一格', () => {
    const r = edJudgeMissed(ED);
    console.log('  ✓ 错过 ' + JSON.stringify(r.floors) + ' / 无楼号 ' + r.noFloor + '（补不回来 ≠ 补得回来）');
});
test('v3324 A4. ★★ M3-O5 重生成只补受影响段；未圈范围不产全量计划', () => {
    const r = edJudgeRegen(ED);
    console.log('  ✓ 圈定 ' + JSON.stringify(r.scoped) + ' 楼 / 未列出 ' + r.untouched + ' 条不动 / 未圈范围 scoped=' + r.noRangeScoped);
});
test('v3324 A5. ★★★ M3-O5 空读与平淡严格分形 + 词表可关（空数组即最终值）', () => {
    const r = edJudgeUnreadableAndMarkers(ED);
    console.log('  ✓ 未读到 ' + r.unreadable + ' / 平淡 ' + r.batched + ' / 关掉 identity 后该条判平淡 ' + r.markersOff);
});
test('v3324 A6. ★★ M3-O5 只读零写 + 可复算 + 畸形入参 + 无读数不编结论 + 自检', () => {
    const r = edJudgeDiscipline(ED);
    console.log('  ✓ 自检 ' + r.selfCheck + ' 条全绿；无读数形态：' + r.line);
});
test('v3324 B1. ★★★ M3-O7 两面各自成面 + 未圈范围不产提案 + 早退面恒定键面', () => {
    const r = cpJudgeFaces(CP);
    console.log('  ✓ 面 ' + r.faces + '；未圈范围 items=' + r.noRangeItems + ' 且键面与正常路径同形');
});
test('v3324 B2. ★★★ M3-X9 对照四态各自可达（冲突不得吞进「替换」）', () => {
    const r = cpJudgeOutcomes(CP);
    console.log('  ✓ ' + JSON.stringify(r.byOutcome) + '；同键未标记换代 ⇒ 冲突 ' + r.conflict);
});
test('v3324 B3. ★★ M3-X9 确认前不写 + 以事实键为轴幂等 + 六种范围形态各自不产提案', () => {
    const r = cpJudgeIdempotent(CP);
    console.log('  ✓ 范围外未动 ' + r.untouched + ' / 去重 ' + r.duplicates + ' / 范围形态 ' + r.reasons.join(','));
});
test('v3324 B4. ★★★ M3-O7 对照三态互不同形（缺席 / 不可测 / 可测）+ 背书只看真读数', () => {
    const r = cpJudgeCompareStates(CP);
    console.log('  ✓ ' + r.states.join('/') + '；可测+留出集改善 ⇒ ' + r.proof);
});
test('v3324 B5. ★★ M3-O7 撤配置与撤事实分成两个 token + 不给值 + 归类未定不静默', () => {
    const r = cpJudgeConfigFace(CP);
    console.log('  ✓ 归类未定 ' + r.unknown + ' / 撤销面 ' + r.undos + ' 种（互不触碰）');
});
test('v3324 B6. ★★ M3-X9 类别键集与 extract-feedback 逐字对齐 + 自检 + 无读数不同形', () => {
    const r = cpJudgeAlignAndDiscipline(CP);
    console.log('  ✓ 类别 ' + r.classes + ' 条与反馈面 ' + r.aligned + ' 条对齐；自检 ' + r.selfCheck + ' 条全绿');
});

/* ══════════════ E. 负控制（真源码破坏 → 同款真判据必须现形） ══════════════ */
test('v3324 E1. ★★★ 破坏「结构性恒即时」⇒ A1 判据必须转红', () => {
    const bad = breakOnce(ED_SRC, ANCHORS.edImmediate, "                batched.push({ floor: c.floor, signals: [], types: [], chars: c.chars, why: 'chitchat-batched' });", 'ed 即时性');
    let threw = false, msg = '';
    try { edJudgeImmediate(loadIIFE(bad, 'LonShaExtractionDriver')); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '关键事件被改成攒批后，A1 判据必须转红');
    assert.match(msg, /周期楼外|即时面应得/);
    edJudgeImmediate(ED);
});
test('v3324 E2. ★★★ 破坏「溢出条全在返回值里」⇒ A2 判据必须转红', () => {
    const bad = breakOnce(ED_SRC, ANCHORS.edBatchAll, "        const batchOverflowItems = [];", 'ed 溢出条');
    let threw = false;
    try { edJudgeOverflowKept(loadIIFE(bad, 'LonShaExtractionDriver')); } catch (e) { threw = true; }
    assert.ok(threw, '溢出条被丢掉后，A2 判据必须转红（「排到下一批」与「丢掉」必须不同形）');
    edJudgeOverflowKept(ED);
});
test('v3324 E3. ★★★ 破坏「空数组即最终值」⇒ A5 判据必须转红', () => {
    const bad = breakOnce(ED_SRC, ANCHORS.edMarkersEmpty,
        "            out[sig] = DEFAULT_MARKERS[sig].map(oneLine).filter(Boolean);", 'ed 词表可关');
    let threw = false;
    try { edJudgeUnreadableAndMarkers(loadIIFE(bad, 'LonShaExtractionDriver')); } catch (e) { threw = true; }
    assert.ok(threw, '空数组回落缺省后，A5 判据必须转红（「关掉一类词表」做不到）');
    edJudgeUnreadableAndMarkers(ED);
});
test('v3324 E4. ★★ 破坏「无读数不编结论」⇒ A6 判据必须转红', () => {
    const bad = breakOnce(ED_SRC, ANCHORS.edLineNoRead, "        if (r.kind !== ED_KIND) return '节奏 即时 0 · 批处理 0';", 'ed 无读数');
    let threw = false;
    try { edJudgeDiscipline(loadIIFE(bad, 'LonShaExtractionDriver')); } catch (e) { threw = true; }
    assert.ok(threw, '无读数时编出「即时 0 · 批处理 0」后，A6 判据必须转红');
    edJudgeDiscipline(ED);
});
test('v3324 E5. ★★★ 破坏「冲突与替换不同形」⇒ B2 判据必须转红', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.cpConflict, "            else outcome = 'replaced';", 'cp 冲突态');
    let threw = false;
    try { cpJudgeOutcomes(loadIIFE(bad, 'LonShaCorrectionPlan')); } catch (e) { threw = true; }
    assert.ok(threw, '冲突被吞进替换后，B2 判据必须转红（同一时点两个值 ≠ 改了口径）');
    cpJudgeOutcomes(CP);
});
test('v3324 E6. ★★★ 破坏「未圈范围不产提案」⇒ B1 判据必须转红', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.cpScopedOnly, "        if (false) {", 'cp 未圈范围');
    let threw = false;
    try { cpJudgeFaces(loadIIFE(bad, 'LonShaCorrectionPlan')); } catch (e) { threw = true; }
    assert.ok(threw, '未圈范围也产提案后，B1 判据必须转红（「没选范围」不等于「全选」）');
    cpJudgeFaces(CP);
});
test('v3324 E7. ★★ 破坏「无反馈早退面的恒定键面」⇒ B5 判据必须转红', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.cpNoFeedbackKeys,
        "                applied: false, defaultAuto: false, writes: 0, zeroWrite: true,\n                decidable: false, proof: 'unproven',\n                reason: 'no-feedback', why: '无反馈',\n                malformedInput: false, degraded: false\n            };", 'cp 无反馈键面');
    let threw = false;
    try { cpJudgeConfigFace(loadIIFE(bad, 'LonShaCorrectionPlan')); } catch (e) { threw = true; }
    assert.ok(threw, '早退面少一格键后，B5 判据必须转红（下游按键断言会读到 undefined）');
    cpJudgeConfigFace(CP);
});
test('v3324 E8. ★★★ 破坏「对照三态互不同形」⇒ B4 判据必须转红', () => {
    const bad = breakOnce(CP_SRC, ANCHORS.cpCompareStates, "        const cmpState = 'unmeasurable';", 'cp 对照三态');
    let threw = false;
    try { cpJudgeCompareStates(loadIIFE(bad, 'LonShaCorrectionPlan')); } catch (e) { threw = true; }
    assert.ok(threw, '对照缺席与不可测合成一档后，B4 判据必须转红');
    cpJudgeCompareStates(CP);
});
test('v3324 E9. ★★★ 破坏宿主缺席面的恒定键面 ⇒ C1 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.idxAbsentKeys,
        ANCHORS.idxAbsentKeys.replace('degraded: false, ok: false, reason: why }', 'reason: why }'), 'idx 缺席键面');
    let threw = false, msg = '';
    try { hostJudgeFace(bad); } catch (e) { threw = true; msg = String(e.message || e); }
    assert.ok(threw, '缺席面少一格键后，C1 判据必须转红（恒定键面是下游按键断言的前提）');
    assert.match(msg, /键面/);
    hostJudgeFace(IDX);
});
test('v3324 E10. ★★★ 破坏「诊断行真跑出口」⇒ C4 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.idxLineCallsExit,
        "        const got = this._extractionDriverRead || {};\n        if (!got.ok) return '抽取节奏不可用（缓存）';", 'idx 诊断行真跑');
    let threw = false;
    try { hostJudgeLinesCallExits(bad); } catch (e) { threw = true; }
    assert.ok(threw, '诊断行改吃缓存后，C4 判据必须转红（出口零调用点 = 导出即摆设）');
    hostJudgeLinesCallExits(IDX);
});
test('v3324 E11. ★★★ 破坏「真每轮调用点的窗口取数」⇒ C3 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.idxCallSite, "                        const _win = { entries: [], omitted: 0, noFloor: 0, from: 0, to: null };", 'idx 每轮调用点');
    let threw = false;
    try { hostJudgeCallSite(bad); } catch (e) { threw = true; }
    assert.ok(threw, '窗口取数被摘掉后，C3 判据必须转红（调用点必须真算，不是空转）');
    hostJudgeCallSite(IDX);
});
test('v3324 E12. ★★ 破坏「体检面分列」⇒ C5 判据必须转红', () => {
    const bad = breakOnce(IDX, ANCHORS.idxFaceMerged, "                        return ['门控读数/抽取节奏', line];", 'idx 体检面合并');
    let threw = false;
    try { hostJudgeFaces(bad); } catch (e) { threw = true; }
    assert.ok(threw, '两个面并进一行后，C5 判据必须转红（两类问题共用一个提示位）');
    hostJudgeFaces(IDX);
});
test('v3324 E13. ★★ 破坏宿主诊断行的数据面消费 ⇒ C4 判据必须转红（两面各须上诊断台）', () => {
    const cpLine = sliceMember(IDX, '_correctionPlanLine() {');
    assert.ok(cpLine.indexOf('this.correctionPlanReextract(') > 0, '前提：数据面消费点须在场');
    const bad = IDX.replace(cpLine, cpLine.replace('        const data = this.correctionPlanReextract({}, {});\n', '        const data = { ok: false, reason: "module-unavailable" };\n'));
    let threw = false;
    try { hostJudgeLinesCallExits(bad); } catch (e) { threw = true; }
    assert.ok(threw, '数据面消费被摘掉后，C4 判据必须转红');
    hostJudgeLinesCallExits(IDX);
});

/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3324 F1. ★★ H5 判据纯度：破坏锚点在**本档源码**里恰中 1 次', () => {
    /* 本档把锚点写成**转义形态**（含 `\n` 的长片段），所以纯度检查也要按转义形态比对，
     *   否则「文件里存的是 `\n` 两个字符、运行时的锚点是真换行」⇒ 恒 0 命中、纯度检查反向失效。 */
    const esc = (s) => JSON.stringify(s).slice(1, -1);
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(esc(ANCHORS[k])).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档里出现 ' + n + ' 次（判据纯度要求恰 1 次；两处各写一份会让纯度检查恒过）');
    }
});
test('v3324 F2. ★★ H6 工具两向自证：锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(ED_SRC, '这段源码根本不存在', 'x', '不存在锚点'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakOnce(ED_SRC, 'function ', 'x', '不唯一锚点'), /恰中 1 次|要求恰好 1 次/);
    assert.throws(() => breakOnce(ED_SRC, ANCHORS.edImmediate, ANCHORS.edImmediate, '同值替换'), /必须真的改变源码/);
    assert.throws(() => breakOnce(CP_SRC, 'const ', 'x', '锚点太多'), /恰中 1 次|要求恰好 1 次/);
});
test('v3324 F3. ★★★ 加载面：两个新模块各在 extra_js 恰一次，分发面 99 → 101', () => {
    for (const m of MODS) {
        assert.ok(fs.existsSync(path.join(R, m)), m + ' 磁盘必须在场');
        assert.equal(MF.extra_js.filter((x) => x === m).length, 1, m + ' 须在 extra_js 恰好声明一次（不登记 = 浏览器不加载 = 面永远缺席）');
    }
    assert.equal(MF.extra_js.length, 101, 'v3.324.0 D 包新增两模块：分发面 99 → 101，实 ' + MF.extra_js.length);
    assert.equal(new Set(MF.extra_js).size, MF.extra_js.length, 'extra_js 不得重复');
    assert.equal(MF.extra_js[0], 'ledger-entity.js', 'ledger-entity.js 仍须在 extra_js 首位（v3.207 不变量：六本账的真源先加载）');
    assert.equal(MF.extra_js.slice(-5).join(','), 'relation-history.js,causal-chain.js,perspective-card.js,extraction-driver.js,correction-plan.js',
        '当版末尾五模块（C 包三 + D 包两）须按加载序排列，实 ' + MF.extra_js.slice(-5).join(','));
});
test('v3324 F4. ★★ 两模块导出面指纹与只读纪律（不 require 兄弟模块 / 不联网 / 不落盘）', () => {
    const grid = [
        ['extraction-driver.js', ['ED_VERSION', 'ED_KIND', 'PROFILES', 'SIGNALS', 'SIGNAL_TYPES', 'CORE_TYPES',
            'PROFILE_RULES', 'DEFAULT_MARKERS', 'floorOrNull', 'normalizeProfile', 'markersOf', 'detect',
            'classify', 'plan', 'line', 'selfCheck']],
        ['correction-plan.js', ['CP_VERSION', 'CP_KIND', 'FACES', 'STAGES', 'OUTCOMES', 'KINDS',
            'CLASS_CANDIDATES', 'UNDO_KINDS', 'floorOrNull', 'floorRange', 'inScope', 'factKey', 'factValue',
            'planReextract', 'planConfigFix', 'line', 'selfCheck']],
    ];
    for (const [m, names] of grid) {
        const src = read(m);
        for (const n of names) assert.ok(src.indexOf(n + ':') > 0 || src.indexOf(n + ' =') > 0, m + ' 缺导出项 ' + n);
        for (const banned of ['require(', 'fetch(', 'localStorage', 'indexedDB']) {
            assert.equal(src.indexOf(banned), -1, m + ' 不得出现 ' + banned + '（零依赖 / 离线 / 不落盘）');
        }
    }
});
test('v3324 F5. ★★ 自检面必须真自证（不是恒 true）：两内核 selfCheck 每一格都是真判据', () => {
    const edSc = ED.selfCheck();
    assert.deepEqual(Object.keys(edSc).sort(), ['chitchatKept', 'deterministic', 'emptyDistinct', 'noWrite',
        'ok', 'overflowKept', 'profiles', 'serializable', 'structuralImmediate'].sort(), 'ED 自检面键集变了（须与本档判据同步）');
    /* 反向对照：破坏源码后同一族读数必须变（证明这些格子真的在量东西）。 */
    const bad = breakOnce(ED_SRC, ANCHORS.edBatchAll, "        const batchOverflowItems = [];", 'ed 自检自证');
    const badSc = loadIIFE(bad, 'LonShaExtractionDriver').selfCheck();
    assert.equal(badSc.overflowKept, false, '破坏溢出条后 overflowKept 必须转 false（否则该格是恒 true 的摆设）');
    assert.equal(badSc.ok, false, '破坏后 ok 必须转 false');
    ED.selfCheck();
    const cpSc = CP.selfCheck();
    const badCp = breakOnce(CP_SRC, ANCHORS.cpCompareStates, "        const cmpState = 'unmeasurable';", 'cp 自检自证');
    assert.equal(loadIIFE(badCp, 'LonShaCorrectionPlan').selfCheck().compareStates, false,
        '破坏对照三态后 compareStates 必须转 false');
    CP.selfCheck();
    console.log('  ✓ ED ' + (Object.keys(edSc).length - 1) + ' 格 / CP ' + (Object.keys(cpSc).length - 1) + ' 格；破坏后对应格真转 false');
});
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
const BORN = '3.324.0';
test('v3324 F6. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3324000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const v = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(v, codeVer, m + ' 与入口同源');
    }
});