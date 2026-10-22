/**
 * tests/v3550_m6_o1_o5.test.mjs — v3.355.0 第六期批次 A（记忆仓侧）验收
 * M6-O1 连续经历重建（experience-rebuild.js）
 * M6-O5 双时间经历（dual-time.js）
 *
 * 验收下限（计划原文三条，逐条落地为 D 组）
 *   ① 60 楼三次同名活动正确重建，且逐段有出处
 *   ② 用户拆开误并经历后，问答与续写跟随（不再被自动引用缝回）
 *   ③ 删除结果来源后保留起因而不再断言已完成
 *   双时间侧：第 100 楼揭露第 10 楼以前的搬迁 ⇒ 当前问答可知、第 20 楼人物视角不可知
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const ER = require('../experience-rebuild.js');
const DT = require('../dual-time.js');
const VERSION_RE = /const\s+VERSION\s*=\s*'([^']+)'/;
const idxSrc = fs.readFileSync('./index.js', 'utf8');
const erSrc = fs.readFileSync('./experience-rebuild.js', 'utf8');
const dtSrc = fs.readFileSync('./dual-time.js', 'utf8');
const moSrc = fs.readFileSync('./memory-organs.js', 'utf8');
/* 【当版锚点】 */
const BORN_V = '3.355.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
const K = ER;
const D = DT;
const src = idxSrc;
/* 去注释后的真代码（R9 类判据必须只扫代码，否则档头教训示例会误伤） */
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ================================================================
 * A. 版本锚
 * ================================================================ */
describe('v3.355.0 版本锚', () => {
    test('VERSION 常量为 3.355.0', () => {
        const m = VERSION_RE.exec(idxSrc);
        assert.ok(m, 'VERSION 常量未找到');
        assert.equal(m[1], '3.355.0');
    });
    test('manifest.json 版本为 3.355.0 且登记两个新模块', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.equal(man.version, '3.355.0');
        assert.ok(man.extra_js.includes('experience-rebuild.js'), 'extra_js 应含 experience-rebuild.js');
        assert.ok(man.extra_js.includes('dual-time.js'), 'extra_js 应含 dual-time.js');
    });
    test('自锚常量 BORN_V 恰是当版', () => {
        assert.equal(vnum(BORN_V), vnum('3.355.0'));
    });
});

/* ================================================================
 * B. M6-O1 内核：身份保真 / 归一幂等 / 判定序
 * ================================================================ */
describe('M6-O1 内核（experience-rebuild.js）', () => {
    test('B1 读侧返回原数组元素（身份保真，不是归一副本）', () => {
        const raw = { id: 'e1', title: '搬家', refs: [] };
        const list = [raw];
        assert.equal(K.findExperience(list, 'e1'), raw, 'findExperience 必须返回真数组里的同一个对象');
        assert.equal(K.indexOfExperience(list, 'e1'), 0);
        const loc = K.locate(list, 'e1');
        assert.equal(loc.raw, raw);
        assert.equal(loc.idx, 0);
    });
    test('B2 归一幂等：二次归一不得把 readable:false 洗成 true', () => {
        const bad = K.normalizeExperience({ id: 'x', title: 't', refs: [{ source: 'nope', refId: 'a', phase: 'cause' }] });
        assert.equal(bad.readable, false, '首归应判不可读');
        const twice = K.normalizeExperience(bad);
        assert.equal(twice.readable, false, '二归必须仍不可读（不可读要粘住）');
    });
    test('B3 判定序：已拆开优先于重复源', () => {
        let list = K.openExperience([], '吵架', { participants: ['甲', '乙'] }, 1).list;
        const id = list[0].id;
        list = K.addRef(list, id, { source: 'summary', refId: 's1', phase: 'cause', floor: 10 }, 1).list;
        list = K.addRef(list, id, { source: 'summary', refId: 's2', phase: 'result', floor: 12 }, 1).list;
        const sp = K.splitExperience(list, id, ['s1'], 2);
        assert.equal(sp.ok, true);
        const half = sp.list.find(e => e.id === id);
        assert.equal(half.state, 'split');
        const r = K.addRef(sp.list, id, { source: 'summary', refId: 's1', phase: 'cause', floor: 10 }, 3);
        assert.equal(r.ok, false);
        assert.equal(r.why, 'already-split', '已拆开的单元不许被自动引用缝回（即使重复源也先报已拆开）');
    });
    test('B4 弱信号单独永不出合并候选', () => {
        const a = K.normalizeExperience({ id: 'a', title: 'A', refs: [{ source: 'summary', refId: 'x', phase: 'cause', floor: 10 }] });
        const b = K.normalizeExperience({ id: 'b', title: 'B', refs: [{ source: 'summary', refId: 'y', phase: 'cause', floor: 12 }] });
        assert.equal(K.mergeCandidates([a, b]).length, 0, '楼层接近只是弱信号，不许单独成候选');
    });
    test('B5 强信号出候选且带可解释 why', () => {
        const a = K.normalizeExperience({ id: 'a', title: '搬家', participants: ['甲'], refs: [{ source: 'summary', refId: 'x', phase: 'cause', floor: 10 }] });
        const b = K.normalizeExperience({ id: 'b', title: '搬家', participants: ['甲'], refs: [{ source: 'diary', refId: 'y', phase: 'result', floor: 40 }] });
        const c = K.mergeCandidates([a, b]);
        assert.equal(c.length, 1);
        assert.ok(c[0].strong.includes('same-title'));
        assert.ok(c[0].strong.includes('same-participants'));
        assert.ok(c[0].why.includes('共享'));
    });
});

/* ================================================================
 * C. M6-O5 内核：三轴分离 / 区间 / 获知来源
 * ================================================================ */
describe('M6-O5 内核（dual-time.js）', () => {
    test('C1 三轴各自独立：occurred 未知不得由 disclosed 推出', () => {
        const c = D.normalizeCoord({ subject: 's1', disclosed: 50 });
        assert.equal(c.occurred.state, 'unknown');
        assert.equal(c.disclosed.state, 'point');
        assert.equal(c.learned.state, 'unknown');
    });
    test('C2 区间端点颠倒判 inconsistent 且不静默交换', () => {
        const c = D.normalizeCoord({ subject: 's2', occurred: { lo: 90, hi: 30 } });
        assert.equal(c.occurred.state, 'inconsistent');
        assert.equal(c.occurred.lo, 90);
        assert.equal(c.occurred.hi, 30);
    });
    test('C3 learned 早于 disclosed 只标不一致不修正', () => {
        const c = D.normalizeCoord({ subject: 's3', actor: '甲', disclosed: 100, learned: 10 });
        assert.equal(c.consistency.ok, false);
        assert.equal(c.consistency.why, 'learned-before-disclosed');
        assert.equal(c.learned.lo, 10, '不一致时不许修正原值');
    });
    test('C4 未知是有名字的状态：null 不回落成现在', () => {
        const a = D.normalizeAxis(null);
        assert.equal(a.state, 'unknown');
        assert.equal(a.at, null);
        assert.equal(a.lo, null);
    });
    test('C5 只有一端如实记半开区间，不补另一端', () => {
        const a = D.normalizeAxis({ lo: 30 });
        assert.equal(a.state, 'range');
        assert.equal(a.lo, 30);
        assert.equal(a.hi, null);
    });
    test('C6 剧情钟日期压成数字键（不用 Date）', () => {
        const a = D.disclosedFromClock({ date: '2026年10月22日' });
        assert.equal(a.state, 'point');
        assert.equal(a.at, 20261022);
    });
    test('C7 顺序四答含不可比', () => {
        const a = D.normalizeCoord({ subject: 'a', occurred: 10 });
        const b = D.normalizeCoord({ subject: 'b', occurred: 20 });
        const u = D.normalizeCoord({ subject: 'u' });
        assert.equal(D.orderOf(a, b), 'before');
        assert.equal(D.orderOf(b, a), 'after');
        assert.equal(D.orderOf(a, u), 'incomparable', '任一轴未知时不许猜顺序');
    });
});

/* ================================================================
 * D. 计划验收下限（逐条对原文）
 * ================================================================ */
describe('M6-O1 验收下限', () => {
    test('D1 验收①：60 楼三次同名活动正确重建，且逐段有出处', () => {
        /* 三份不同来源各自描述同一次搬家：起因在摘要、行动在事实、结果在日记。 */
        let list = K.openExperience([], '搬家', { participants: ['甲', '乙'], place: '旧楼' }, 1).list;
        const id = list[0].id;
        list = K.addRef(list, id, { source: 'summary', refId: 'sum#12', phase: 'cause', floor: 12, quote: '房东通知月底腾房' }, 1).list;
        list = K.addRef(list, id, { source: 'fact', refId: 'fact#40', phase: 'action', floor: 40, quote: '两人抬箱子下楼' }, 1).list;
        list = K.addRef(list, id, { source: 'diary', refId: 'diary#60', phase: 'result', floor: 60, quote: '新居第一夜' }, 1).list;
        const r = K.rebuildOf(list, id);
        assert.equal(r.shape, 'complete', '三段齐备应判 complete');
        assert.equal(r.completed, true);
        assert.equal(r.gaps.length, 0);
        /* 逐段有出处：每个 present 段必须带 source + refId */
        for (const seg of r.phases) {
            if (seg.state !== 'present') continue;
            assert.ok(seg.refs.length > 0, seg.phase + ' 段必须有出处');
            for (const ref of seg.refs) {
                assert.ok(ref.source, '出处必须有 source');
                assert.ok(ref.refId, '出处必须有 refId');
            }
        }
    });
    test('D2 验收②：拆开误并经历后问答跟随新边界（不再被自动引用缝回）', () => {
        let list = K.openExperience([], '那次出门', { participants: ['甲'] }, 1).list;
        const id = list[0].id;
        list = K.addRef(list, id, { source: 'summary', refId: 's1', phase: 'cause', floor: 10 }, 1).list;
        list = K.addRef(list, id, { source: 'diary', refId: 'd9', phase: 'result', floor: 90 }, 1).list;
        /* 用户发现这是两件事，拆开：保留起因，结果另立 */
        const sp = K.splitExperience(list, id, ['s1'], 2);
        assert.equal(sp.ok, true);
        const after = sp.list;
        assert.equal(after.length, 2, '拆开后应有两个单元（不是删除）');
        const orig = after.find(e => e.id === id);
        const made = after.find(e => e.id !== id);
        assert.equal(orig.refs.filter(r => r.phase === 'cause').length, 1, '原单元只留起因');
        assert.equal(made.refs.some(r => r.phase === 'result'), true, '新单元拿到结果段');
        assert.ok(made.title.includes('（拆出）'));
        /* 续写跟随：后续自动引用不得回到已拆开的原单元 */
        const again = K.addRef(after, id, { source: 'event', refId: 'ev5', phase: 'turn', floor: 95 }, 3);
        assert.equal(again.ok, false);
        assert.equal(again.why, 'already-split');
    });
    test('D3 验收③：删掉结果来源后保留起因而不再断言已完成', () => {
        let list = K.openExperience([], '争执', {}, 1).list;
        const id = list[0].id;
        list = K.addRef(list, id, { source: 'summary', refId: 'c1', phase: 'cause', floor: 5 }, 1).list;
        list = K.addRef(list, id, { source: 'summary', refId: 'r1', phase: 'result', floor: 9 }, 1).list;
        assert.equal(K.rebuildOf(list, id).completed, true);
        const rt = K.retractRef(list, id, 'r1', 'summary');
        assert.equal(rt.ok, true);
        const r2 = K.rebuildOf(rt.list, id);
        assert.equal(r2.completed, false, '撤掉结果来源后不许仍判已完成');
        assert.equal(r2.shape, 'retracted');
        assert.equal(K.phaseState(rt.list[0], 'cause'), 'present', '起因必须保留（不是删源就连起因一起丢）');
    });
});
describe('M6-O5 验收下限', () => {
    test('D4 验收①：第 100 楼揭露第 10 楼前的搬迁 ⇒ 当前可知而第 20 楼人物视角不可知', () => {
        const c = D.normalizeCoord({
            subject: 'move-2019', actor: '甲',
            occurred: 10, disclosed: 100, learned: 100,
        });
        assert.equal(D.visibleAt(c, 20).known, 'no', '第 20 楼人物视角不得知道第 100 楼才披露的事');
        assert.equal(D.visibleAt(c, 120).known, 'yes', '第 120 楼应已知');
        /* 投影同一处：查询/年鉴/场景材料共用 projectAt */
        const p20 = D.projectAt([c], 20, { actor: '甲' });
        assert.equal(p20.visible.length, 0);
        assert.equal(p20.hidden.length, 1);
        const p120 = D.projectAt([c], 120, { actor: '甲' });
        assert.equal(p120.visible.length, 1);
    });
    test('D5 验收②：同一人物先后获知两个冲突版本，历史视角保留当时版本', () => {
        let list = D.upsertCoord([], { subject: 'move-2019', actor: '甲', occurred: 10, disclosed: 100, learned: 100, version: '搬到城东' }).list;
        const r = D.upsertCoord(list, { subject: 'move-2019', actor: '甲', occurred: 10, disclosed: 140, learned: 140, version: '其实搬到城西' });
        assert.equal(r.ok, true);
        assert.equal(r.why, 'conflict', '两个不同版本必须报冲突');
        const c = r.coord;
        assert.ok(c.versions.includes('搬到城东'), '旧版本必须保留');
        assert.ok(c.conflicts.includes('其实搬到城西'), '新版本进冲突格');
        /* 历史视角：第 110 楼时已知，且当时读到的是旧版本 */
        assert.equal(D.visibleAt(c, 110).known, 'yes', '第 100 楼已获知，第 110 楼当然已知');
        assert.equal(D.visibleAt(c, 110).learnedAt, 100, '首次获知点不能被后续 upsert 推后');
        assert.equal(D.visibleAt(c, 90).known, 'no', '第 90 楼尚未获知');
        /* ★ 新增 versionAt：历史视角取「当时那一个版本」（本版判据抓到的真缺陷） */
        assert.equal(D.versionAt(c, 110).version, '搬到城东', '第 110 楼当时读到的必须是旧版本');
        assert.equal(D.versionAt(c, 150).version, '其实搬到城西', '第 150 楼才读到新版本');
        assert.equal(D.versionAt(c, 90).version, 'not-yet', '尚未获知就是 not-yet，不与「不知道」混同');
    });
    test('D6 验收③：日期不全跨日闪回返回区间或未知，不用楼层顺序伪装剧情日期', () => {
        const half = D.normalizeCoord({ subject: 'flashback', occurred: { lo: 3 } });
        assert.equal(half.occurred.state, 'range');
        assert.equal(half.occurred.hi, null, '只有下端就如实缺上端，不补');
        const none = D.normalizeCoord({ subject: 'no-date', disclosed: 50 });
        assert.equal(none.occurred.state, 'unknown', '没有日期就是未知，不许拿楼层当日期');
    });
});

/* ================================================================
 * E. 宿主接线（取库口 / 出口 / 持久化 / 诊断行）
 * ================================================================ */
describe('宿主接线', () => {
    test('E1 两个取库口存在且走 _moduleLib', () => {
        assert.ok(src.includes('function _experienceRebuildLib()'), '缺取库口 _experienceRebuildLib');
        assert.ok(src.includes('function _dualTimeLib()'), '缺取库口 _dualTimeLib');
        assert.ok(src.includes("window.LonShaExperienceRebuild, 'experience-rebuild.js'"), '取库口必须指真实全局名与文件名');
        assert.ok(src.includes("window.LonShaDualTime, 'dual-time.js'"), '取库口必须指真实全局名与文件名');
    });
    test('E2 两个宿主出口存在', () => {
        assert.ok(src.includes('queryExperience(op, payload)'), '缺出口 queryExperience');
        assert.ok(src.includes('queryDualTime(op, payload)'), '缺出口 queryDualTime');
    });
    test('E3 出口覆盖计划要求的操作集', () => {
        for (const op of ['open', 'addRef', 'retract', 'confirm', 'mergeCandidates', 'applyMerge', 'split', 'rebuild', 'expand', 'locate']) {
            assert.ok(src.includes("op === '" + op + "'"), 'queryExperience 缺操作 ' + op);
        }
        for (const op of ['upsert', 'find', 'visibleAt', 'projectAt', 'orderOf', 'disclosedFromClock']) {
            assert.ok(src.includes("op === '" + op + "'"), 'queryDualTime 缺操作 ' + op);
        }
    });
    test('E4 写侧落盘：出口必须把 list 写回 worldProg', () => {
        assert.ok(src.includes('this.worldProg.experiences = res.list'), '经历单元写侧未落盘');
        assert.ok(src.includes('this.worldProg.timeCoords = res.list'), '时间坐标写侧未落盘');
    });
    test('E5 持久化面：export / import / 构造期初始化三处齐备', () => {
        assert.ok(moSrc.includes('experiences: this.experiences || []'), 'export 缺 experiences');
        assert.ok(moSrc.includes('timeCoords: this.timeCoords || []'), 'export 缺 timeCoords');
        assert.ok(moSrc.includes('this.experiences = Array.isArray(data.experiences)'), 'import 缺 experiences');
        assert.ok(moSrc.includes('this.timeCoords = Array.isArray(data.timeCoords)'), 'import 缺 timeCoords');
        assert.ok(moSrc.includes('this.experiences = [];'), '构造期缺初始化');
        assert.ok(moSrc.includes('this.timeCoords = [];'), '构造期缺初始化');
    });
    test('E6 诊断面板两行齐备（模块未加载也要有名字）', () => {
        assert.ok(src.includes("selfCheck.experienceRebuild"), '缺经历重建诊断行');
        assert.ok(src.includes("selfCheck.dualTime"), '缺双时间诊断行');
        assert.ok(src.includes("模块未加载(experience-rebuild.js)"), '诊断行必须点名文件名');
        assert.ok(src.includes("模块未加载(dual-time.js)"), '诊断行必须点名文件名');
    });
    test('E7 降级契约：取不到模块时同键回执而非 undefined', () => {
        assert.ok(src.includes("return { ok: false, reason: 'module-unavailable', degraded: true };"), '缺 module-unavailable 降级');
        assert.ok(src.includes("return { ok: false, reason: 'thrown', degraded: true };"), '缺 thrown 降级');
        assert.ok(src.includes("return { ok: false, reason: 'unknown-op', degraded: true };"), '缺 unknown-op 回执');
    });
});

/* ================================================================
 * F. 负控制（真源码破坏 → 重跑同款真判据）与判据纯度
 * ================================================================ */
const ORIG_ER = erSrc;
const ORIG_DT = dtSrc;
/** 真源码破坏：锚点必须恰中 1 次，破坏后加载副本重跑同款判据。 */
function breakAndReload(src, anchor, replacement, tag) {
    const hits = src.split(anchor).length - 1;
    assert.equal(hits, 1, '★ 「' + tag + '」的破坏锚点必须实测恰中 1 次，否则该向在空转（实测 ' + hits + ' 次）');
    const broken = src.replace(anchor, replacement);
    /* ★ 必须用绝对路径：ESM 里的 require 是 createRequire(import.meta.url)，
     *   相对路径按**测试文件所在目录**（tests/）解析，而 fs 写相对路径按 cwd（仓库根），
     *   两边不同基准 ⇒ 写在根、读在 tests/。首版就是这么空转的（当场被本组抓到）。 */
    const file = path.resolve(process.cwd(), '.tmp_break_' + tag + '.js');
    fs.writeFileSync(file, broken);
    let p;
    try { p = require(file); } finally { try { fs.unlinkSync(file); } catch (_e) { /* 清理失败不掩盖主因 */ } }
    return p;
}
describe('F 负控制与判据纯度', () => {
    test('F1 破坏「已完成」判据 ⇒ 撤源后仍报 completed（判据真在跑）', () => {
        const B = breakAndReload(ORIG_ER,
            'completed: shape === EXP_SHAPES.COMPLETE,',
            'completed: true,', 'er_completed');
        let list = B.openExperience([], 'x', {}, 1).list;
        const id = list[0].id;
        list = B.addRef(list, id, { source: 'summary', refId: 'c', phase: 'cause', floor: 1 }, 1).list;
        list = B.addRef(list, id, { source: 'summary', refId: 'r', phase: 'result', floor: 2 }, 1).list;
        const rt = B.retractRef(list, id, 'r', 'summary');
        assert.equal(B.rebuildOf(rt.list, id).completed, true, '破坏后必须观察到行为改变（否则负控制空转）');
        assert.equal(K.rebuildOf(K.retractRef(list, id, 'r', 'summary').list, id).completed, false, '原版上同款判据必须真');
    });
    test('F2 破坏「已拆开」判定 ⇒ 拆开后仍可被自动引用缝回', () => {
        const B = breakAndReload(ORIG_ER,
            'if (e.state === EXP_STATES.SPLIT) {',
            'if (false) {', 'er_split');
        let list = B.openExperience([], 'y', {}, 1).list;
        const id = list[0].id;
        list = B.addRef(list, id, { source: 'summary', refId: 's1', phase: 'cause', floor: 1 }, 1).list;
        list = B.addRef(list, id, { source: 'summary', refId: 's2', phase: 'result', floor: 2 }, 1).list;
        const sp = B.splitExperience(list, id, ['s1'], 2);
        const back = B.addRef(sp.list, id, { source: 'event', refId: 'ev', phase: 'turn', floor: 3 }, 3);
        assert.equal(back.ok, true, '破坏后拆开的单元必须能被重新缝回（证明该守卫是真守卫）');
    });
    test('F3 破坏「三轴独立」⇒ occurred 被 disclosed 顶替', () => {
        const B = breakAndReload(ORIG_DT,
            'occurred: normalizeAxis(o.occurred),',
            'occurred: normalizeAxis(o.occurred != null ? o.occurred : o.disclosed),', 'dt_axes');
        const c = B.normalizeCoord({ subject: 's', disclosed: 50 });
        assert.equal(c.occurred.state, 'point', '破坏后 occurred 被 disclosed 顶替（该判据真在跑）');
        assert.equal(D.normalizeCoord({ subject: 's', disclosed: 50 }).occurred.state, 'unknown', '原版上必须仍是 unknown');
    });
    test('F4 破坏「首次获知点」⇒ 历史视角被推后', () => {
        const B = breakAndReload(ORIG_DT,
            'if (firstLearned == null && lea.state !== AXIS_STATES.UNKNOWN && lea.lo != null) firstLearned = lea.lo;',
            'if (firstLearned != null && lea.lo != null) firstLearned = lea.lo;', 'dt_first');
        let l = B.upsertCoord([], { subject: 'm', actor: 'a', occurred: 1, disclosed: 100, learned: 100, version: 'v1' }).list;
        const r = B.upsertCoord(l, { subject: 'm', actor: 'a', occurred: 1, disclosed: 140, learned: 140, version: 'v2' });
        assert.equal(B.visibleAt(r.coord, 110).known, 'no', '破坏后第 110 楼被误判为未知（该判据真在跑）');
    });
    test('F5 判据纯度：本档不得靠放宽口径过（去注释后扫真代码）', () => {
        const code = codeOnly(idxSrc);
        assert.ok(!code.includes("if (e.state === EXP_STATES.SPLIT) { if (false)"), '宿主不得绕过内核重写判定');
        /* 本档自己的断言不得引用破坏锚点串，否则自我指涉 */
        const self = fs.readFileSync(new URL(import.meta.url), 'utf8');
        const pure = self.split('const ORIG_ER = erSrc;')[0];
        assert.ok(!pure.includes('completed: true,'), '判据主体不得含破坏替换串');
    });
    test('F6 两个内核 selfCheck 全绿', () => {
        assert.equal(ER.selfCheck().ok, true, 'experience-rebuild selfCheck 未过：' + JSON.stringify(ER.selfCheck()));
        assert.equal(DT.selfCheck().ok, true, 'dual-time selfCheck 未过：' + JSON.stringify(DT.selfCheck()));
    });
});
