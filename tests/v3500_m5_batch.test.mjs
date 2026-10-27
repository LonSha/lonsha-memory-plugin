/* ============================================================
 * tests/v3500_m5_batch.test.mjs — v3.350.0 · 第五期第一批四项
 *   M5-O1 时点追问与多人比较真正按原问题查询
 *   M5-O2 梦境与假设标签贯穿保存、重开和生成
 *   M5-O3 资料查证不再把否定当吻合、没找到当未发生
 *   M5-O8 长期未履行约定不因容量上限消失
 * 外加手机 R5-O9 的委托口：条件**清除**（可清轴表 + 逐轴具名四形）。
 *
 * 【本档要证明的十二件事（不是「函数返回了对象」）】
 *   O1-a 时间**方向**与锚分列：同一个数字上「截至当时」与「从此以后」是两种相反的查法；
 *   O1-b 首轮按本句标记定方向；无锚 ⇒ 沿用上一轮；两者都无 ⇒ 空（**不猜方向**）；
 *   O1-c 多人比较**不被线程主体一次盖成两人**（逐子计划只填缺省）；
 *   O1-d `as-of` 的上界走独立一格 `specEx.floorTo`，**不往 spec 里塞第二个键**；
 *   O2  叙事层标注活过 `copyFact` 白名单重建（**落进账**而不是只在读侧分类），
 *       且进指纹（同一句话在两个层里是两件事），旧档缺该字段仍读回 null；
 *   O3-a 否定不当吻合（「尚未归还」对期望「归还」⇒ divergent，不是 matched）；
 *   O3-b 覆盖不足 / 命中全在时间范围外 ⇒ unchecked（**不说「未发生」**）；
 *   O3-c 不传 opts 时口径与修前**逐字相同**（既有调用点零改动）；
 *   O8-a 容量上限不再静默丢**未完成**约定（capItems 只算不写，逐类报丢弃数）；
 *   O8-b 已满且新登记会挤掉未完成项 ⇒ **显式拒绝**（reason 'capacity'）；
 *   R9-a 可清轴表自证（每个轴必须真可清；表外名必须清不掉且具名）；
 *   R9-b 本句新设**优先于**清除（用户明说的那一句比一个界面动作更具体）。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** →
 *   必须现形；并反向对照「原版同判据必须通过」。判据纯度（H5）单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const QT_SRC = read('qa-thread.js');
const FV_SRC = read('fact-version.js');
const CL_SRC = read('commitment-ledger.js');
const CX_SRC = read('lore-crosscheck.js');
const IDX = __hostSurface();
const MF = JSON.parse(read('manifest.json'));
const SELF = read(path.join('tests', 'v3500_m5_batch.test.mjs'));
const BORN_V = '3.350.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/** 在隔离 vm 里加载 IIFE 模块（与生产同形：window 即全局，module 缺席）。 */
function loadIIFE(src, globalName, extra) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    if (extra) for (const k of Object.keys(extra)) ctx[k] = extra[k];
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const mkOneLine = (s) => String(s).replace(/[ \t]+([{}();,])/g, '$1').replace(/\s+/g, ' ');
/** 判定：给定源码能否通过某个真判据（返回问题数组，空 = 绿）。 */
const expectRed = (fn, tag) => {
    let problems = null;
    try { problems = fn(); } catch (e) { problems = ['抛了:' + String((e && e.message) || e)]; }
    assert.ok(problems.length > 0, tag + '：破坏副本上同款判据必须转红（实测全绿 ⇒ 判据空转）');
    return problems;
};

const QT = loadIIFE(QT_SRC, 'LonShaQaThread');
const CX = loadIIFE(CX_SRC, 'LonShaLoreCrosscheck');
/* 六本账都在**构造期**取 `LonShaLedgerEntity`（`typeof window !== 'undefined' && window.X` 优先，
 *   故必须在同一个 vm 上下文里先挂好 —— 与生产 extra_js 的加载顺序同形）。
 *   ★ `module: undefined` 必须显式给：不给的话模块体走 `require('./ledger-entity.js')` 分支，
 *   vm 里没有 require ⇒ 当场抛「ledger-entity.js 未加载」（与 v3320 同规）。 */
const LE = loadIIFE(read('ledger-entity.js'), 'LonShaLedgerEntity');
const LEI = { LonShaLedgerEntity: LE, module: undefined };
const FV = loadIIFE(FV_SRC, 'LonShaFactVersion', LEI);
const CL = loadIIFE(CL_SRC, 'LonShaCommitmentLedger', LEI);

/* ══════════ 判据实现（在真源码 / 破坏源码上都能跑）══════════ */

/** O1-a/b：方向分列 + 不猜方向。 */
function judgeO1Direction(api) {
    const bad = [];
    const at = api.openThread('第20楼她做了什么', { actors: ['甲'] }, {});
    if (at.thread.timeOp !== 'at') bad.push('无方向标记 ⇒ at，实测 ' + at.thread.timeOp);
    const asOf = api.openThread('截至第20楼她住哪', { actors: ['甲'] }, {});
    if (asOf.thread.timeOp !== 'as-of') bad.push('「截至」⇒ as-of，实测 ' + asOf.thread.timeOp);
    const since = api.openThread('第20楼以后她做了什么', { actors: ['甲'] }, {});
    if (since.thread.timeOp !== 'since') bad.push('「以后」⇒ since，实测 ' + since.thread.timeOp);
    const none = api.openThread('她住哪', { actors: ['甲'] }, {});
    if (none.thread.timeOp !== '') bad.push('无锚 ⇒ 方向空（不猜），实测 ' + none.thread.timeOp);
    /* 不认识的方向必须归空（不猜方向）。 */
    const norm = api.normalizeThread({ atFloor: 9, timeOp: 'bogus' });
    if (norm.timeOp !== '') bad.push('不认识的方向必须归空，实测 ' + norm.timeOp);
    return bad;
}

/** O1-c/d：多人比较不被盖 / as-of 上界走独立格。 */
function judgeO1Spec(api) {
    const bad = [];
    const t = api.openThread('截至第20楼甲在哪', { actors: ['甲'] }, {}).thread;
    /* 子计划自带 actors ⇒ 只填缺省，不覆盖。 */
    const own = api.threadSpec(t, { actors: ['乙'] });
    if (own.spec.actors !== undefined) bad.push('子计划自带 actors 时不许覆盖（多人比较会退化成查同一坨）');
    if (own.skippedActors !== true) bad.push('必须如实报「跳过了主体」');
    if (own.spec.floorFrom !== 20) bad.push('时点仍要并进去');
    /* 子计划没有 actors ⇒ 才填。 */
    const fill = api.threadSpec(t, {});
    if (!Array.isArray(fill.spec.actors) || fill.spec.actors[0] !== '甲') bad.push('子计划缺主体时才填');
    /* as-of 上界走独立格，spec 键集合仍是既有两个键。 */
    if (fill.specEx.floorTo !== 20) bad.push('as-of 的上界必须走 specEx.floorTo，实测 ' + JSON.stringify(fill.specEx));
    if (fill.spec.floorTo !== undefined) bad.push('★ 不许往 spec 里塞第二个键（本面键集合不得扩）');
    /* since 不产上界。 */
    const t2 = api.openThread('第20楼以后甲在哪', { actors: ['甲'] }, {}).thread;
    const sp2 = api.threadSpec(t2, {});
    if (sp2.specEx.floorTo !== undefined) bad.push('since 不得产上界');
    if (sp2.spec.floorFrom !== 20) bad.push('since 仍是下界');
    return bad;
}

/** O2：层标注活过白名单重建 + 进指纹 + 旧档读回 null。 */
function judgeO2Modality(api) {
    const bad = [];
    const st = api.normalize({ facts: [], seq: 0 });
    const r = api.assertFact(st, { subject: '甲', predicate: '状态', value: '死了', modality: 'dream', origin: 'user' });
    if (!r.ok) { bad.push('落账失败：' + r.reason); return bad; }
    const st2 = api.normalize(r.state);
    const f = st2.facts[0];
    if (!f) { bad.push('条目没落进账'); return bad; }
    if (f.modality !== 'dream') bad.push('★ 层标注必须活过 normalize 的白名单重建（修前正是死在这里）');
    /* 进指纹：同值不同层是两件事。 */
    const a = api.factFp({ subject: '甲', predicate: '状态', value: '死了', modality: 'dream', origin: 'user' });
    const b = api.factFp({ subject: '甲', predicate: '状态', value: '死了', modality: 'reality', origin: 'user' });
    if (a === b) bad.push('★ 同值不同层必须指纹不同（否则后写的会被判成复述而丢掉层标注）');
    /* 旧档缺该字段 ⇒ 读回 null（不是空串、也不追认成现实）。 */
    const old = api.normalize({ facts: [{ id: 'f1', subject: '甲', predicate: '状态', value: '活着', origin: 'user' }], seq: 1 });
    if (old.facts[0].modality !== null) bad.push('旧档缺标注必须读回 null，实测 ' + JSON.stringify(old.facts[0].modality));
    /* 未标注面的指纹口径一字未变（向后兼容）。 */
    const c = api.factFp({ subject: '甲', predicate: '状态', value: '死了', origin: 'user' });
    const d = api.factFp({ subject: '甲', predicate: '状态', value: '死了', modality: '', origin: 'user' });
    if (c !== d) bad.push('未标注（缺 / 空串）必须同指纹（向后兼容）');
    return bad;
}

/** O3：否定不当吻合 + 覆盖不足不报「未发生」+ 不传 opts 逐字同修前。 */
function judgeO3Verdict(api) {
    const bad = [];
    const mk = (o) => Object.assign({ id: 'c1', title: 'x', text: '', status: '', floor: 5 }, o);
    const lore = (o) => Object.assign({ id: 'l1', title: '资料', subject: '甲', expect: '归还', settingAsHappened: true }, o);
    if (api.verdictOf(lore({}), [mk({ text: '他把书归还了' })]) !== 'matched') bad.push('肯定句必须 matched');
    if (api.verdictOf(lore({}), [mk({ text: '尚未归还，不能说已归还' })]) !== 'divergent') {
        bad.push('★ 否定不许当吻合（「尚未归还」对期望「归还」必须判反证）');
    }
    if (api.verdictOf(lore({}), []) !== 'unrealized') bad.push('空剧情 + 声称已发生 ⇒ unrealized');
    if (api.verdictOf(lore({}), [], { chatCoverage: 'partial' }) !== 'unchecked') {
        bad.push('★ 覆盖不完整 ⇒ unchecked（**不说「未发生」**）');
    }
    if (api.verdictOf(lore({}), [mk({ text: '归还了', floor: 99 })], { atFloor: 20 }) !== 'unchecked') {
        bad.push('★ 命中全在时间范围外 ⇒ unchecked（没看到 ≠ 没发生）');
    }
    /* 不传 opts 时与修前逐字相同：空剧情 + 未声称 ⇒ lore-only。 */
    if (api.verdictOf(lore({ settingAsHappened: false }), []) !== 'lore-only') bad.push('不传 opts 时旧口径必须一字未变');
    return bad;
}

/** O8：容量不静默丢未完成 + 满了显式拒绝。 */
function judgeO8Capacity(api) {
    const bad = [];
    const N = api.MAX_ITEMS;
    if (!Number.isFinite(N) || N <= 0) { bad.push('上限常量必须随账导出'); return bad; }
    const items = [];
    for (let i = 0; i < N + 5; i++) {
        items.push({ id: 'c' + i, actor: 'a', content: 'x' + i, status: i < 3 ? 'open' : 'fulfilled', seq: i });
    }
    const cap = api.capItems(items, N);
    const openKept = cap.kept.filter((x) => x.status === 'open').length;
    if (openKept !== 3) bad.push('★ 未完成约定必须优先保留（实测保留 ' + openKept + '/3）');
    if (cap.droppedOpen !== 0) bad.push('未完成项不该被裁，实测 droppedOpen ' + cap.droppedOpen);
    if (cap.dropped !== 5) bad.push('丢弃数必须如实，实测 ' + cap.dropped);
    if (cap.kept.length !== N) bad.push('保留集必须恰好到上限');
    /* 满了且新登记会挤掉未完成 ⇒ 显式拒绝。 */
    let st = api.normalize({ items: [], seq: 0 });
    const many = [];
    for (let i = 0; i < N; i++) {
        many.push({ id: 'o' + i, actor: 'a', content: 'y' + i, status: 'open', seq: i, revision: 1 });
    }
    st = api.normalize({ items: many, seq: N });
    const r = api.open(st, { actor: 'a', content: '新的一条', status: 'open' });
    if (r.ok !== false || r.reason !== 'capacity') {
        bad.push('★ 已满且会挤掉未完成项必须显式拒绝（实测 ok=' + r.ok + ' reason=' + r.reason + '）');
    }
    if (!r.note || r.note.indexOf('未完成') < 0) bad.push('拒绝必须说清原因（未完成项受保护）');
    return bad;
}

/** R9-a/b：可清轴表自证 + 本句新设优先。 */
function judgeR9Clear(api) {
    const bad = [];
    const sc = api.selfCheck({});
    if (!sc.ok) bad.push('内核自检必须零问题：' + JSON.stringify(sc.bad));
    const base = api.normalizeThread({
        state: 'open', turn: 3, subjects: ['甲'], atFloor: 20, timeOp: 'since',
        compareAxis: 'compare', branchKey: 'b1', scope: { universe: 'u1' }
    });
    for (const axis of api.QT_CLEAR_AXES) {
        const r = api.advanceThread(base, { actors: [] }, { question: '继续', clear: [axis] });
        if (!r.cleared.length) bad.push('可清轴「' + axis + '」清不掉（表与实现分叉）');
    }
    const bogus = api.advanceThread(base, { actors: [] }, { question: '继续', clear: ['nope'] });
    if (bogus.cleared.length) bad.push('表外轴名不得清掉任何轴');
    if (!bogus.gaps.some((g) => g.kind === 'clear-axis-unknown')) bad.push('表外轴名必须如实具名');
    /* 本句新设优先于清除。 */
    const ov = api.advanceThread(base, { actors: ['乙'] }, { question: '第30楼她呢', clear: ['time'] });
    if (ov.cleared.length) bad.push('★ 本句自己给了时点 ⇒ 清除不生效（不许把用户明说的那一句盖掉）');
    if (!ov.gaps.some((g) => g.kind === 'clear-overridden')) bad.push('被覆盖必须具名 clear-overridden');
    if (ov.thread.atFloor !== 30) bad.push('本句的新时点必须生效');
    /* 本来就没有那一轴 ⇒ 清不掉且具名（与「清掉了」不同形）。 */
    const fresh = api.normalizeThread({ state: 'open', turn: 2, subjects: ['甲'] });
    const nothing = api.advanceThread(fresh, { actors: [] }, { question: '继续', clear: ['atFloor'] });
    if (!nothing.gaps.some((g) => g.kind === 'clear-nothing')) bad.push('本来就没有这一轴必须具名 clear-nothing');
    return bad;
}

/** 宿主接线：clear 下传 + cleared/clearAxes 回送 + 缺件降级同键。 */
function judgeHostClear(src) {
    const bad = [];
    /* ★ 这几条判据**不走单行化**：`mkOneLine` 会把 `key: (` 折叠成 `key:(`
     *   （它按「空白 + 标点」折叠），于是带 `: (` 的字面量恒不命中 —— 判据会假红。
     *   本判据要的形态本来就写在**同一行**里，直接对原文判最准。 */
    if (!/clear:\s*Array\.isArray\(o\.clear\)/.test(src)) bad.push('宿主必须把 clear 下传（原样，不先过滤）');
    if (!src.includes('cleared: Array.isArray(adv.cleared) ? adv.cleared.slice() : []')) bad.push('回执必须回送 cleared');
    if (!src.includes('clearAxes: (QT.QT_CLEAR_AXES || []).slice()')) bad.push('回执必须回送可清轴表');
    /* 缺件降级路径必须同键（少一格与「清除没发生」同形）。
     *   ★ 起终点都要**从 i0 往后**找：`if (!Q || typeof Q.planQuestion` 在真源里
     *   更早的函数里也出现一次（askMemoryQuestion），从头 indexOf 会取到它 ——
     *   切片方向反了 ⇒ 判据报「找不到那一段」（本仓明记过：锚点要落在**这一处**真源上）。 */
    const i0 = src.indexOf('const blank = (reason)');
    const i1 = (i0 < 0) ? -1 : src.indexOf('if (!Q || typeof Q.planQuestion', i0);
    if (i0 < 0 || i1 < 0 || i1 <= i0) { bad.push('找不到「追问回执构造」那一段（判据锚点必须落在真源上）'); return bad; }
    const blank = src.slice(i0, i1);
    if (!blank.includes('cleared: []')) bad.push('★ 缺件降级路径必须同键（少一格 = 与「没清」同形）');
    if (!blank.includes('clearAxes:')) bad.push('缺件降级路径必须带 clearAxes');
    return bad;
}

/* ══════════ 负控制锚点（在判据层只声明一次 —— H5 判据纯度）══════════ */
const ANCHORS = Object.freeze({
    /* O1：无方向标记时按本句定 at（旧口径的下界）—— 改成 since ⇒ 无标记的句子按「从此以后」查。 */
    kDirAt: "(QT_MARK_AS_OF.test(q) ? 'as-of' : 'at')) : '',",
    /* O1：子计划自带 actors 时不覆盖 —— 置假 ⇒ 多人比较被盖成两人。 */
    kSkipOwn: "if (t.subjects.length && !hasOwnActors) spec.actors = t.subjects.slice();",
    /* O1：as-of 上界走独立格 —— 置假 ⇒ 上界消失（「截至当时」变成没有上界）。 */
    kSpecEx: "if (t.atFloor !== null && t.timeOp === 'as-of') specEx.floorTo = t.atFloor;",
    /* O2：层标注进白名单重建 —— 置假 ⇒ 标注活不过 normalize。 */
    kModality: "modality: (f.modality == null || f.modality === '') ? null : text(f.modality, 24),",
    /* O3：否定不当吻合 —— 置假 ⇒ 子串命中即 matched（修前那条）。 */
    kNeg: "const textNeg = negNear(hay, needle) || negOf(needle);",
    /* O3：覆盖不足判 unchecked —— 置假 ⇒ 没看到被读成「未发生」。 */
    kCov: "if (!rows.length && (outOfRange > 0 || coverage !== 'complete')) {",
    /* O8：未完成优先占预算 —— 置假 ⇒ 待办被完成史挤掉（修前那条）。 */
    kCap: "const keepOpen = openIdx.slice(Math.max(0, openIdx.length - limit));",
    /* O8：满了显式拒绝 —— 置假 ⇒ 静默丢一条待办。 */
    kAdmit: "if (probe.droppedOpen > 0) {",
    /* R9：清除只作用于继承（本句新设优先）—— 置假 ⇒ 用户明说的一句被界面动作盖掉。 */
    kClearOv: "if ((axis === 'atFloor' || axis === 'time') && atSet) {",
});

/* ══════════ A. 内核口径（真跑）══════════ */
test('v3500 A1. ★★★★★ O1 时间方向与锚分列：同一个数字两种相反的查法', () => {
    assert.deepEqual(judgeO1Direction(QT), []);
    console.log('  ok at / as-of / since 三态可辨，无锚不猜方向，不认识归空');
});
test('v3500 A2. ★★★★★ O1 多人比较各查一人 + as-of 上界走独立格', () => {
    assert.deepEqual(judgeO1Spec(QT), []);
    console.log('  ok 只填缺省不覆盖；specEx.floorTo 独立一格；本面键集合未扩');
});
test('v3500 A3. ★★★★ O2 叙事层标注活过白名单重建并进指纹', () => {
    assert.deepEqual(judgeO2Modality(FV), []);
    console.log('  ok dream 活过 normalize；同值不同层指纹不同；旧档读回 null');
});
test('v3500 A4. ★★★★★ O3 否定不当吻合、覆盖不足不说「未发生」', () => {
    assert.deepEqual(judgeO3Verdict(CX), []);
    console.log('  ok 反证优先；unchecked 与 unrealized 不同形；不传 opts 旧口径一字未变');
});
test('v3500 A5. ★★★★★ O8 未完成约定优先保留 + 满了显式拒绝', () => {
    assert.deepEqual(judgeO8Capacity(CL), []);
    console.log('  ok capItems 只算不写并逐类报丢弃；open 遇挤占显式拒绝 reason=capacity');
});
test('v3500 A6. ★★★★★ R5-O9 条件清除：可清轴表自证 + 本句新设优先', () => {
    assert.deepEqual(judgeR9Clear(QT), []);
    console.log('  ok 六轴全可清；表外名清不掉且具名；本句新设优先；本来就没有具名');
});

/* ══════════ B. 宿主接线面 ══════════ */
test('v3500 B1. ★★★★ 宿主把 clear 下传并把 cleared / clearAxes 回送（缺件同键）', () => {
    assert.deepEqual(judgeHostClear(IDX), []);
    console.log('  ok clear 原样下传；两格回送；缺件降级路径同键');
});

/* ══════════ D. 负控制（真源码定点破坏 ⇒ 同款判据必转红）══════════ */
test('v3500 D1. ★★★★ 破坏「无标记落 at」⇒ A1 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(QT_SRC, ANCHORS.kDirAt, "(QT_MARK_AS_OF.test(q) ? 'as-of' : 'since')) : '',", 'kDirAt');
    expectRed(() => judgeO1Direction(loadIIFE(bad, 'LonShaQaThread')), 'kDirAt');
    assert.deepEqual(judgeO1Direction(QT), [], '原版同判据必须过');
    console.log('  ok 无标记也落 since ⇒ 判据照出；原版阳性通过');
});
test('v3500 D2. ★★★★ 破坏「不覆盖子计划主体」⇒ A2 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(QT_SRC, ANCHORS.kSkipOwn, 'if (t.subjects.length) spec.actors = t.subjects.slice();', 'kSkipOwn');
    expectRed(() => judgeO1Spec(loadIIFE(bad, 'LonShaQaThread')), 'kSkipOwn');
    assert.deepEqual(judgeO1Spec(QT), [], '原版同判据必须过');
    console.log('  ok 多人比较被盖成两人 ⇒ 判据照出；原版阳性通过');
});
test('v3500 D3. ★★★ 破坏「as-of 上界独立格」⇒ A2 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(QT_SRC, ANCHORS.kSpecEx, 'if (false) specEx.floorTo = t.atFloor;', 'kSpecEx');
    expectRed(() => judgeO1Spec(loadIIFE(bad, 'LonShaQaThread')), 'kSpecEx');
    assert.deepEqual(judgeO1Spec(QT), [], '原版同判据必须过');
    console.log('  ok 上界消失 ⇒ 判据照出；原版阳性通过');
});
test('v3500 D4. ★★★★ 破坏「层标注进白名单」⇒ A3 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(FV_SRC, ANCHORS.kModality, 'modality: null,', 'kModality');
    expectRed(() => judgeO2Modality(loadIIFE(bad, 'LonShaFactVersion', LEI)), 'kModality');
    assert.deepEqual(judgeO2Modality(FV), [], '原版同判据必须过');
    console.log('  ok 标注活不过 normalize ⇒ 判据照出；原版阳性通过');
});
test('v3500 D5. ★★★★★ 破坏「否定不当吻合」⇒ A4 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kNeg, 'const textNeg = false;', 'kNeg');
    expectRed(() => judgeO3Verdict(loadIIFE(bad, 'LonShaLoreCrosscheck')), 'kNeg');
    assert.deepEqual(judgeO3Verdict(CX), [], '原版同判据必须过');
    console.log('  ok 「尚未归还」被读成吻合 ⇒ 判据照出；原版阳性通过');
});
test('v3500 D6. ★★★★ 破坏「覆盖不足判 unchecked」⇒ A4 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(CX_SRC, ANCHORS.kCov, 'if (false) {', 'kCov');
    expectRed(() => judgeO3Verdict(loadIIFE(bad, 'LonShaLoreCrosscheck')), 'kCov');
    assert.deepEqual(judgeO3Verdict(CX), [], '原版同判据必须过');
    console.log('  ok 没看到被读成「未发生」⇒ 判据照出；原版阳性通过');
});
test('v3500 D7. ★★★★★ 破坏「未完成优先占预算」⇒ A5 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(CL_SRC, ANCHORS.kCap, 'const keepOpen = [];', 'kCap');
    expectRed(() => judgeO8Capacity(loadIIFE(bad, 'LonShaCommitmentLedger')), 'kCap');
    assert.deepEqual(judgeO8Capacity(CL), [], '原版同判据必须过');
    console.log('  ok 待办被完成史挤掉 ⇒ 判据照出；原版阳性通过');
});
test('v3500 D8. ★★★★ 破坏「满了显式拒绝」⇒ A5 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(CL_SRC, ANCHORS.kAdmit, 'if (false) {', 'kAdmit');
    expectRed(() => judgeO8Capacity(loadIIFE(bad, 'LonShaCommitmentLedger')), 'kAdmit');
    assert.deepEqual(judgeO8Capacity(CL), [], '原版同判据必须过');
    console.log('  ok 静默丢一条待办 ⇒ 判据照出；原版阳性通过');
});
test('v3500 D9. ★★★★★ 破坏「清除只作用于继承」⇒ A6 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(QT_SRC, ANCHORS.kClearOv, 'if (false) {', 'kClearOv');
    expectRed(() => judgeR9Clear(loadIIFE(bad, 'LonShaQaThread')), 'kClearOv');
    assert.deepEqual(judgeR9Clear(QT), [], '原版同判据必须过');
    console.log('  ok 用户明说的一句被界面动作盖掉 ⇒ 判据照出；原版阳性通过');
});
test('v3500 D10. ★★★★ 破坏「宿主 clear 下传」⇒ B1 判据必须转红（原版必绿）', () => {
    const bad = breakOnce(IDX, 'clear: Array.isArray(o.clear) ? o.clear.slice() : undefined', 'clear: undefined', 'hClear');
    expectRed(() => judgeHostClear(bad), 'hClear');
    assert.deepEqual(judgeHostClear(IDX), [], '原版同判据必须过');
    console.log('  ok 清除没到上游 ⇒ 判据照出；原版阳性通过');
});

/* ══════════ F. 判据纯度（H5）+ 工具两向自证（H6）══════════ */
const CNT = (hay, needle) => String(hay).split(String(needle)).length - 1;
const SELF_ONE = mkOneLine(SELF);
test('v3500 F1. ★★★★★ 判据纯度（H5）：九锚点在**本档判据层**各恰 1 次', () => {
    const bad = [];
    for (const [k, v] of Object.entries(ANCHORS)) {
        const decl = CNT(SELF_ONE, mkOneLine('"' + v + '"'));
        if (decl !== 1) bad.push('锚点 ' + k + ' 在判据层必须恰声明 1 次，实测 ' + decl);
    }
    assert.deepEqual(bad, [], 'H5 判据纯度不合格：' + bad.join(' | '));
    console.log('  ok 九锚点各恰 1 次（破坏点的字面量只在本档 ANCHORS 里出现）');
});
test('v3500 F2. ★★★★ 工具两向自证（H6）：打偏必须拒绝破坏 / 破坏必须真改源码', () => {
    assert.throws(() => breakOnce(QT_SRC, '这个锚点在真源码里不存在()', 'x', 'probe-miss'), /拒绝破坏/);
    assert.throws(() => breakOnce(QT_SRC, 'return', 'return false;', 'probe-multi'), /恰中 1 次/);
    assert.throws(() => breakOnce(QT_SRC, ANCHORS.kSpecEx, ANCHORS.kSpecEx, 'probe-same'), /必须真的改变源码/);
    console.log('  ok 打偏 / 多处 / 同值三种坏法都被工具自己挡住');
});
test('v3500 G1. ★★ 版本锚：自锚常量 BORN_V 恰是当版（下界口径，不锁当版）', () => {
    assert.ok(vnum(BORN_V) <= vnum(MF.version), '自锚不得承诺未来版');
    assert.ok(vnum(BORN_V) >= vnum('3.350.0'), '自锚不得低于本档出生版本');
    console.log('  ok 锚 ' + BORN_V + ' · 当版 ' + MF.version);
});