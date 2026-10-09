/* ================================================================
 * tests/v3299_mo6_fact_state_single_source.test.mjs — v3.299.0 · M-O6
 * 事实版本、冲突与撤回的**状态统一**（五态 + 有效范围 + 准入单一口径）
 *
 * 【修前实测的真缺陷（本轮真跑取证，不是读源码推算）】
 *   `memory-type.js#typedBuckets` 的准入行是：
 *       if (!o.includeRevoked && f && f.revoked === true) continue;
 *   —— 它**只挡 revoked**，把 `to != null`（已被换代 / 已闭合）的旧事实照放。
 *   实测同一本账（A 所在 北京@1楼，A 所在 上海@5楼）：
 *     `typedBuckets(st)['typed:location-state'].length === 2`（旧值与新值并列在场）；
 *     宿主 `typedFactsBlocks()` 的载荷里同时出现「北京（第1楼起）」与「上海（第5楼起）」。
 *   后果正是 M-O6 原文点的那一条：**新事实已写入，旧投影仍在被使用**。
 *
 * 【本版补的三件事】
 *   ① `fact-state.js` 把「这条事实现在算不算数」收成**五态 + 理由码**的单一真源
 *      （active / superseded / revoked / disputed / unknown），并给出**有效范围** rangeOf；
 *   ② **纯读、幂等、不写回**：状态随时复算，账本字节一字不改。为什么不写回 ——
 *      `fact-version.js#copyFact` 是白名单逐字段重建，显式 `state` 字段活不过一次 normalize
 *      （实测 `normalize({...f, state:'x'}).facts[i].state === undefined`）；
 *      更要紧的是写回会造成「推导说 superseded、持久说 active」的**第二份真源**，
 *      恰好违反 M-O6 第 4 条「禁止只改展示层掩盖源数据未修复」。
 *   ③ `readState().leaked` 把「旧口径会放行、新口径必须挡」的条目**逐条点名**，
 *      于是「本版到底修了什么」是一个可断言、可复算的读数（不是一句自述）。
 *
 * 【覆盖】
 *   A  面结构（五态穷尽 / 函数齐备 / 导出面不含 migrate / 源码无写回语句）
 *   B  ★ 纯读幂等（连读两次逐字相同 + 账本字节未变；selfCheck 两半自证都在）
 *   C  五态判定与理由码（含显式字段冲突取保守序、拼错状态名不回落）
 *   D  有效范围 rangeOf 三态（含 `coversNow` 的**判不了留 null**、楼层 0 不冒充）
 *   E  ★★ 状态准入单一口径（真跑宿主方法体：修前旧值进载荷 / 本版旧值被挡）
 *   F  泄漏读数 leaked 与 memory-type 修前那一行**同源**（不另写一份旧口径）
 *   G  准入面 admitForLoad（五态分流；includeSuperseded 只放 superseded）
 *   H  诊断行与状态回读（line 点名 / transitionOf 带范围与悬空可读）
 *   I  负控制（四条**真源码破坏 + 同款真判据重跑**，原版作阳性对照）
 *   J  判据纯度 + 版本锚 + 登记面
 *
 * 【边界（诚实）】
 *   本套件证明的是「状态判定有唯一真源、准入按它执行、不可测不倒推」。
 *   它**不**证明 `fact-version.js` 的 from/to 语义本身正确（那是 v3.194 / v3.211 的地盘），
 *   也不证明 M-O6 第 3 条「传播到摘要 / 图谱 / 时间线 / 召回 / 缓存」已经全做完 ——
 *   本轮只统一了**事实注入面**这一处消费点，其余传播面另有其档。
 * ================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripComments } from './_audit_lib.mjs';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const req = createRequire(import.meta.url);
const FS = req(path.join(ROOT, 'fact-state.js'));
const FV = req(path.join(ROOT, 'fact-version.js'));
const MT = req(path.join(ROOT, 'memory-type.js'));
const IDX_SRC = read('index.js');
const FS_SRC = read('fact-state.js');
const MT_SRC = read('memory-type.js');
const MANIFEST = JSON.parse(read('manifest.json'));
/** 版本三段数值（vnum）：与 scan_version_guard / v3298 / v3297 同口径。 */
const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);
/** 本档出生版本（自锚常量形）。抬版时只改这一处，下面的数值锁随之平移。 */
const CUR = '3.299.0';

/* ══════════════════ 工具 ══════════════════ */

/** 括号配平切方法体（与 v3211 / v3298 同规格）。传 stripComments 后的源。 */
function blockAt(src, at) {
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
/**
 * 真宿主方法体真跑（`typedFactsBlocks`）。
 *   `src`      index.js 源码（负控制传**破坏副本**）
 *   `fsLib`    取库口给的 fact-state 模块（`null` ⇒ 模块缺席，走旧口径）
 * 为什么不整个 new 出引擎：本档只测**这一处消费点**的口径，
 *   把无关的十一条取值口一起 mock 进来会让「红了」无法归因到状态准入。
 */
function mke(src, fsLib) {
    const body = blockAt(stripComments(src), src ? stripComments(src).indexOf('typedFactsBlocks() {') : -1);
    assert.ok(body, 'typedFactsBlocks 方法体必须可提取（缺失即接线不全）');
    const inner = body.slice(body.indexOf('{') + 1, body.length - 1);
    const fn = new Function('_memoryTypeLib', '_factStateLib', 'errLog',
        'const m = function(){ ' + inner + ' }; return m;');
    return fn(() => MT, () => fsLib, () => {});
}
/** 真账：A 所在 北京@1 楼 → A 所在 上海@5 楼（location-state 是 auto 策略，两侧都有 from 即换代）。 */
function buildState() {
    let st = FV.normalize(null);
    let r = MT.assertTyped(FV, st, { subject: 'A', predicate: '所在', value: '北京', type: 'location-state', from: 1 });
    st = r.state;
    const oldId = r.fact.id;
    r = MT.assertTyped(FV, st, { subject: 'A', predicate: '所在', value: '上海', type: 'location-state', from: 5 });
    return { st: r.state, oldId: oldId, superseded: r.superseded };
}
const ST = buildState().st;
const OLD_ID = buildState().oldId;
const loadBroken = (name, src) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3299-'));
    const file = path.join(dir, name);
    fs.writeFileSync(file, src);
    for (const k of Object.keys(req.cache)) delete req.cache[k];
    return req(file);
};

/* ══════════════════ A. 面结构 ══════════════════ */
test('v3299 A. 面结构：五态穷尽 / 函数齐备 / 导出面不含 migrate / 源码无写回', () => {
    assert.deepStrictEqual([...FS.STATES], ['active', 'superseded', 'revoked', 'disputed', 'unknown'],
        '五态必须逐字对齐 M-O6 第 1 条的点名集合');
    for (const k of ['derive', 'stateOf', 'rangeOf', 'readState', 'countsOf', 'admitForLoad',
        'transitionOf', 'selfCheck', 'line', 'isState']) {
        assert.equal(typeof FS[k], 'function', '缺函数 ' + k);
    }
    /* `migrate` 不得在导出面上 —— 留个名字的坑位就是给「以后想写回」留后门。 */
    assert.equal(FS.migrate, undefined, '写回式迁移不得出现在导出面');
    assert.ok(!/^\s*migrate\s*[,:]/m.test(FS_SRC), '导出面不得登记 migrate');
    /* 只读面：不得出现对**被读对象**的字段写入。
       判据只看**非表达式上下文**的赋值（行首 / 分号后），否则会把注释里的举例与
       `===` 比较一起误判 —— 本档首跑就被自己的解释性注释咬过一次（锚点 9 处假阳性）。
       行内注释引用（如「`f.state = x` 不行」）属说明，不是行为，故先剥注释再判。 */
    const code = stripComments(FS_SRC);
    const writes = [...code.matchAll(/(?:^|[;{}]\s*)((?:\w+\.)+state|(?:\w+\.)+to|(?:\w+\.)+supersededBy|(?:\w+\.)+revoked)\s*=(?!=)/gm)]
        .map((m) => m[1]);
    assert.deepStrictEqual(writes, [], '只读模块不得写任何条目字段，实为 ' + JSON.stringify(writes));
    assert.strictEqual(FS.STATE_VERSION, 1, '状态口径版本（改判定规则须抬此号）');
    assert.ok(Object.isFrozen(FS.STATES) && Object.isFrozen(FS.REASONS), '口径常量须冻结');
});

/* ══════════════════ B. ★ 纯读幂等 ══════════════════ */
test('v3299 B. ★ 纯读幂等：连读两次逐字相同 + 账本字节未变', () => {
    const before = JSON.stringify(ST);
    const once = JSON.stringify(FS.readState(ST));
    const twice = JSON.stringify(FS.readState(ST));
    assert.strictEqual(once, twice, '★ 同一份账读两次必须逐字相同（读数不得含时间戳 / 趟次状态）');
    assert.strictEqual(JSON.stringify(ST), before, '★ 读侧不得改写账本（写回式迁移会在这里露馅）');
    /* 计数 / 诊断行 / 状态回读同样不得是写面。 */
    FS.countsOf(ST); FS.line(ST); FS.transitionOf(ST, OLD_ID); FS.selfCheck(ST); FS.admitForLoad(ST);
    assert.strictEqual(JSON.stringify(ST), before, '★ 全部读面跑过一遍后账本仍须逐字未变');
    const sc = FS.selfCheck(ST);
    assert.strictEqual(sc.idempotent, true, 'selfCheck 必须自证幂等（读两次相同）');
    assert.strictEqual(sc.noWriteBack, true, 'selfCheck 必须自证**没写回**（只测幂等会被「写回同样的值」骗过）');
    assert.strictEqual(sc.ok, true, '自证总判');
    /* 幂等键必须真的可判：换一份**不同**的账，读数必须变（否则「相同」是空对空）。 */
    const other = FV.normalize(null);
    assert.notStrictEqual(JSON.stringify(FS.readState(other)), once, '另一份账的读数必须不同（防「恒定返回同一串」的假幂等）');
});

/* ══════════════════ C. 五态判定 ══════════════════ */
test('v3299 C. 五态判定与理由码（含冲突取保守序、拼错状态名不回落）', () => {
    const ids = new Set(['x1', 'x2']);
    const caseOf = (f) => FS.derive(f, ids);
    /* ① revoked 标记最优先（撤回是绝对的）。 */
    let d = caseOf({ id: 'x1', revoked: true, to: 9, supersededBy: 'zz' });
    assert.equal(d.state, 'revoked', 'revoked 优先于闭合与悬空');
    assert.equal(d.reason, FS.REASONS.REVOKED, '理由码须可读');
    /* ② 区间已闭合。 */
    d = caseOf({ id: 'x1', to: 9 });
    assert.equal(d.state, 'superseded');
    assert.equal(d.reason, FS.REASONS.CLOSED);
    /* ③ supersededBy 悬空 ⇒ disputed（父 id 不在账上）。 */
    d = caseOf({ id: 'x1', supersededBy: 'zz' });
    assert.equal(d.state, 'disputed');
    assert.equal(d.reason, FS.REASONS.DANGLING, '悬空必须是**独立理由**，不得并进「冲突」');
    d = caseOf({ id: 'x1', supersededBy: 'x2' });
    assert.equal(d.state, 'active', '父 id 在场 ⇒ 不悬空，读数必须与「悬空」可分');
    /* ④ 无 id / 非对象 ⇒ unknown + unreadable（**不静默归 active**）。 */
    assert.equal(caseOf({ subject: 'A' }).state, 'unknown', '无 id 条目不得冒充可用事实');
    assert.equal(caseOf(null).state, 'unknown');
    assert.equal(caseOf({ subject: 'A' }).reason, FS.REASONS.UNREADABLE);
    /* ⑤ 显式字段：认则用之；与推导冲突取**保守序**并点名冲突。 */
    d = caseOf({ id: 'x1', state: 'active', revoked: true });
    assert.equal(d.state, 'revoked', '★ 显式 active 撞上 revoked 必须取严（放宽会让「已撤回」回到注入面）');
    assert.equal(d.reason, FS.REASONS.CONFLICT, '取值有分歧必须点名，不得静默');
    d = caseOf({ id: 'x1', state: 'revoked' });
    assert.equal(d.state, 'revoked', '显式 revoked 而推导是 active ⇒ 取值有分歧，理由码必须是 CONFLICT');
    assert.equal(d.reason, FS.REASONS.CONFLICT, '「显式与推导不一致」只按状态名相同与否 + 保守序取值');
    d = caseOf({ id: 'x1', to: 9, state: 'superseded' });
    assert.equal(d.state, 'superseded', '显式与推导一致 ⇒ 用推导理由，不算冲突');
    assert.equal(d.reason, FS.REASONS.CLOSED, '一致时理由码必须是推导理由（不是 CONFLICT）');
    /* ⑥ 拼错状态名 ⇒ unknown 且**不回落推导**（写错了与没写必须不同形）。 */
    d = caseOf({ id: 'x1', state: 'activ' });
    assert.equal(d.state, 'unknown', 'isState false ⇒ 不得回落推导');
    assert.equal(d.reason, FS.REASONS.UNKNOWN_LABEL);
    assert.equal(FS.isState('activ'), false);
    assert.equal(FS.isState('active'), true);
    assert.equal(FS.isState(null), false, '空值不是合法状态名');
});

/* ══════════════════ D. 有效范围 ══════════════════ */
test('v3299 D. 有效范围 rangeOf 三态（含「判不了」必须留 null）', () => {
    assert.deepStrictEqual(FS.rangeOf({ from: 1, to: 5 }), { from: 1, to: 5, closed: true, coversNow: false },
        '闭区间：两端读数 + closed + coversNow=false');
    assert.deepStrictEqual(FS.rangeOf({ from: 1 }), { from: 1, to: null, closed: false, coversNow: true },
        '开区间：to 读回 null（不是 0）');
    assert.deepStrictEqual(FS.rangeOf({}), { from: null, to: null, closed: false, coversNow: null },
        '★ 两端都缺 ⇒ coversNow 必须是 null（判不了），**不得塌成 false**');
    /* ★ 楼层 0 是合法楼层（开局前），不得被当成「没给」。 */
    assert.deepStrictEqual(FS.rangeOf({ from: 0 }), { from: 0, to: null, closed: false, coversNow: true },
        '★ from=0 是**合法楼层**，不得读回 null 或塌成「无区间」');
    assert.strictEqual(FS.rangeOf({ from: 0 }).from, 0, '★ 楼层 0 不得用 null 冒充');
    /* 非数字 / 空串 ⇒ 读回 null（不猜）。 */
    assert.equal(FS.rangeOf({ from: 'x', to: '' }).from, null, '非有限数 ⇒ 判不了，读回 null');
    assert.equal(FS.rangeOf({ to: '' }).closed, false, '空串 to 不算闭合');
    /* 范围随状态一并回读（stateOf / transitionOf 都要带）。 */
    const so = FS.stateOf({ id: 'x1', to: 7 }, ['x1']);
    assert.equal(so.range.to, 7, 'stateOf 必须带范围（只给状态等于把半句话留给调用点猜）');
    assert.equal(so.admissible, false);
    assert.equal(FS.transitionOf(ST, OLD_ID).range.to, 5, 'transitionOf 必须带范围');
});

/* ══════════════════ E. ★★ 状态准入（真跑宿主方法体） ══════════════════ */
test('v3299 E. ★★ 状态准入：旧值进载荷（旧口径）→ 被挡（本版）', () => {
    /* E1 缺陷在场自证：内存型原样放行两条（「新事实已写入，旧投影仍在被使用」）。 */
    const buckets = MT.typedBuckets(ST);
    assert.strictEqual(buckets['typed:location-state'].length, 2,
        '★ 修前实测的缺陷在场：typedBuckets 放行了 to != null 的旧事实（两条并列）');
    /* E2 模块缺席（旧口径）⇒ 旧值真的进了载荷。 */
    const legacy = mke(IDX_SRC, null).call({ _factVersionState: ST });
    const legacyText = String(legacy.stable || '') + String(legacy.volatile || '');
    assert.ok(legacyText.includes('北京'), '★ 模块缺席时走旧口径：被换代的旧值「北京」仍在载荷里（这就是要修的形态）');
    assert.ok(legacyText.includes('上海'), '现行值在场');
    /* E3 本版接线 ⇒ 旧值被挡、现行值保留。 */
    const now = mke(IDX_SRC, FS).call({ _factVersionState: ST });
    const nowText = String(now.stable || '') + String(now.volatile || '');
    assert.ok(!nowText.includes('北京'), '★ 本版：已被换代的旧值必须**不进**载荷（M-O6 真实需求那一条）');
    assert.ok(nowText.includes('上海'), '★ 现行有效值必须保留（挡旧不得连新一起挡）');
    /* E4 分桶口径没被替换：准入只是**过滤器**，分组仍由 typedBuckets 一份口径说了算。 */
    const mtSrc = stripComments(MT_SRC);
    assert.ok(!mtSrc.includes('includeSuperseded'),
        '准入策略不得下沉进 memory-type（那会造第二份口径）；分组与准入各自单源');
});

/* ══════════════════ F. 泄漏读数同源 ══════════════════ */
test('v3299 F. 泄漏读数 leaked 与 memory-type 修前那一行同源', () => {
    const rs = FS.readState(ST);
    /* 旧口径 =「非 revoked 即放行」（认不出 id 的条目照放）——与 typedBuckets 修前那一行同判据。 */
    const legacyPass = ST.facts.filter((f) => !(f && f.revoked === true));
    const leakedIds = ST.facts.filter((f) => !(f && f.revoked === true))
        .filter((f) => FS.derive(f, new Set(['fct_1', 'fct_2'])).state !== 'active')
        .map((f) => f.id);
    assert.strictEqual(rs.leaked.length, leakedIds.length,
        '★ 泄漏条目数必须与「旧口径放行 ∩ 新口径不是 active」逐条对得上');
    assert.deepStrictEqual(rs.leaked.map((x) => x.id).sort(), leakedIds.slice().sort(), '泄漏必须**点名到 id**');
    assert.ok(rs.leaked.some((x) => x.id === OLD_ID), '被换代的旧值必须在泄漏清单里');
    assert.strictEqual(legacyPass.length, 2, '旧口径放行条数（两条都在场，因为 typedBuckets 只挡 revoked）');
    /* 已撤回的条目**不算泄漏**：旧口径本来就挡了它 —— 这是「同源」的可判证据。 */
    let st2 = FV.normalize(null);
    let r = MT.assertTyped(FV, st2, { subject: 'B', predicate: '身份', value: '学生', type: 'character-state', from: 1 });
    st2 = r.state;
    const rid = r.fact.id;
    st2 = FV.revokeFact(st2, { id: rid, reason: '写错了' }).state;
    const rs2 = FS.readState(st2);
    assert.strictEqual(rs2.counts.revoked, 1, '撤回态计数');
    assert.deepStrictEqual(rs2.leaked, [], '★ 已撤回不计泄漏（旧口径本来就挡 revoked）——否则「同源」不成立');
    /* counts 是唯一真源：countsOf 与 readState 必须同结果。 */
    assert.deepStrictEqual(FS.countsOf(ST), rs.counts, 'countsOf 不得自成一套口径');
});

/* ══════════════════ G. 准入面 ══════════════════ */
test('v3299 G. admitForLoad：五态分流且 includeSuperseded 只放 superseded', () => {
    const a = FS.admitForLoad(ST);
    assert.deepStrictEqual(a.supported.map((f) => f.id), a.supported.map((f) => f.id));
    assert.ok(a.supported.every((f) => FS.stateOf(f, ST).state === 'active'), '默认只放 active');
    assert.strictEqual(a.withheld.length, 1, '被换代的那条必须被挡');
    assert.strictEqual(a.withheld[0].reason, 'superseded-by-newer', '拒绝必须归因');
    assert.strictEqual(a.excluded, a.withheld.length, 'excluded 与 withheld 不得各说各话');
    const b = FS.admitForLoad(ST, { includeSuperseded: true });
    assert.strictEqual(b.supported.length, 2, '★ 只有 superseded 可被 opts 放行（历史回放要用的正是旧版本）');
    /* ★ revoked / disputed / unknown **不受任何 opts 影响**。 */
    const five = FV.normalize(null);
    const mk = (id, extra) => Object.assign({ id: id, subject: 'S', predicate: 'p', value: 'v' }, extra);
    const st5 = { facts: [mk('a1'), mk('a2', { to: 3 }), mk('a3', { revoked: true }), mk('a4', { supersededBy: 'nope' }), { subject: 'no-id' }] };
    for (const opts of [undefined, { includeSuperseded: true }, { includeSuperseded: true, includeRevoked: true }]) {
        const out = FS.admitForLoad(st5, opts);
        const got = out.supported.map((f) => f.id).sort();
        const want = opts && opts.includeSuperseded ? ['a1', 'a2'] : ['a1'];
        assert.deepStrictEqual(got, want,
            '★ 撤回/争议/不可判**不得**被任何 opts 放行（撤回是绝对的）：opts=' + JSON.stringify(opts));
    }
    assert.deepStrictEqual(FS.admitForLoad(st5).reasonCounts, {
        'superseded-by-newer': 1, 'revoked-absolute': 1, 'disputed-uncertain': 1, 'unreadable-or-unknown-state': 1,
    }, '四类拒绝理由各自可数（压成一格会让四类问题同形）');
    const empty = FS.admitForLoad(null);
    assert.deepStrictEqual(empty.supported, [], '空账不抛');
    assert.strictEqual(empty.includeSuperseded, false, '三态可读：默认策略得能被读出来');
});

/* ══════════════════ H. 诊断行与状态回读 ══════════════════ */
test('v3299 H. line 点名 / transitionOf 带范围与悬空可读', () => {
    const l = FS.line(ST);
    assert.match(l, /有效 1/, '五态计数在场');
    assert.match(l, /已换代 1/, '被换代计数在场');
    assert.match(l, /旧口径会放行 1：fct_1/, '★ 泄漏必须**点名到 id**（只报数说明不了「本版多挡了哪条」）');
    assert.match(l, /共 2/, '总数在场');
    assert.strictEqual(FS.line(null), '暂无事实', '空账三态可读');
    assert.ok(!/undefined|NaN/.test(l), '诊断行不得出现 undefined / NaN');
    const t = FS.transitionOf(ST, OLD_ID);
    assert.strictEqual(t.ok, true);
    assert.strictEqual(t.state, 'superseded');
    assert.strictEqual(t.admissible, false, '状态回读必须带准入结论（否则每个调用点自己再判一遍）');
    assert.strictEqual(t.supersededByPresent, true, '父 id 在场必须可读');
    assert.strictEqual(t.closed, true);
    assert.strictEqual(FS.transitionOf(ST, 'no-such-id').ok, false, '查不到必须显式 not-found');
    assert.equal(FS.transitionOf(ST, 'no-such-id').reason, 'not-found');
    /* 悬空：父 id 不在账上 ⇒ present=false（「判不了」与「在场」必须可分）。 */
    const dangling = { facts: [{ id: 'd1', subject: 'S', predicate: 'p', value: 'v', supersededBy: 'ghost' }] };
    assert.strictEqual(FS.transitionOf(dangling, 'd1').supersededByPresent, false);
    assert.match(FS.line(dangling), /指涉悬空 1：d1/, '悬空必须点名（不是「有争议」的同义词重报）');
    /* 阈值：泄漏点名最多列 5 条 —— 一屏 200 个 id 会让真正的告警淹没。 */
    const many = { facts: Array.from({ length: 7 }, (_, i) => ({ id: 'x' + i, subject: 'S', predicate: 'p', value: 'v', to: 3 })) };
    assert.match(FS.line(many), /等 7 条/, '点名须有上限并报总数');
});

/* ══════════════════ I. 负控制（真源码破坏 + 同款真判据重跑） ══════════════════ */

/** 判据 1：状态准入门必须挡住被换代的旧值（同文重复判据，可指定源与取库口）。 */
function gateJudge(src, fsLib) {
    const out = mke(src, fsLib).call({ _factVersionState: ST });
    const text = String(out.stable || '') + String(out.volatile || '');
    if (text.includes('北京')) throw new Error('已被换代的旧值仍进了载荷（状态准入门失效）');
    if (!text.includes('上海')) throw new Error('现行有效值被误挡（准入过严）');
}
/** 判据 2：幂等自证必须能抓住写回（可指定 fact-state 模块）。 */
function idemJudge(fsMod) {
    const st = JSON.parse(JSON.stringify(ST));
    const sc = fsMod.selfCheck(st);
    if (sc.noWriteBack !== true) throw new Error('读侧写回了账本（noWriteBack=' + sc.noWriteBack + '）');
    if (sc.idempotent !== true) throw new Error('读数不幂等（idempotent=' + sc.idempotent + '）');
}
/** 判据 3：无区间必须读回「判不了」（null），不得塌成 false。 */
function rangeJudge(fsMod) {
    const r = fsMod.rangeOf({});
    if (r.coversNow !== null) throw new Error('无区间的 coversNow 塌成了 ' + JSON.stringify(r.coversNow) + '（判不了 ≠ 不在区间内）');
    const z = fsMod.rangeOf({ from: 0 });
    if (z.from !== 0) throw new Error('楼层 0 被读成了 ' + JSON.stringify(z.from) + '（0 是合法楼层，不得用 null 冒充）');
}

test('v3299 I0. 工具两向自证（锚点 0 次 / 不唯一 / 同值替换均抛；原版同判据必须真成立）', () => {
    assert.throws(() => breakSource(FS_SRC, 'const 不存在的锚点XYZ = 1;', 'x', 'I0'), /命中 0 次|恰中 1 次|拒绝破坏/);
    assert.throws(() => breakSource(FS_SRC, 'const ', 'x', 'I0'), /恰中 1 次|要求恰好 1 次|拒绝破坏/);
    const A = 'const STATE_VERSION = 1;';
    assert.throws(() => breakSource(FS_SRC, A, A, 'I0'), /必须真的改变源码|拒绝破坏/);
    /* 判据纯度：判据体内不得出现被破坏的锚点字面量（否则是自我指涉）。 */
    const judges = gateJudge.toString() + idemJudge.toString() + rangeJudge.toString();
    for (const bad of ['const gated = (f) => !allowIds', 'legacyOk = !(ok && f.revoked === true)',
        'coversNow: (from == null && to == null) ? null : !closed,', 'f.state = d.state;']) {
        assert.ok(!judges.includes(bad), '判据不得引用锚点字面量：' + bad);
    }
    /* 阳性对照：三条判据在原版上都必须真成立。 */
    gateJudge(IDX_SRC, FS); idemJudge(FS); rangeJudge(FS);
});

test('v3299 I1. ★ 破坏宿主准入门（gated 恒 true）⇒ gateJudge 必须转红', () => {
    const broken = breakSource(IDX_SRC,
        'const gated = (f) => !allowIds || allowIds.has(String(f && f.id != null ? f.id : \'\'));',
        'const gated = () => true;', 'I1 准入门恒真');
    let threw = false, msg = '';
    try { gateJudge(broken, FS); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 准入门恒真后，旧值必然回到载荷 ⇒ 同款判据必须转红（否则这条门是空转）');
    assert.match(msg, /已被换代的旧值仍进了载荷/);
});

test('v3299 I2. ★ 破坏状态模块（to 不再判 superseded）⇒ gateJudge 必须转红', () => {
    const broken = breakSource(FS_SRC,
        "else if (f.to != null && f.to !== '') { guState = 'superseded'; guReason = REASONS.CLOSED; }",
        "else if (false) { guState = 'superseded'; guReason = REASONS.CLOSED; }", 'I2 闭合不判换代');
    const FS2 = loadBroken('fact-state-broken.js', broken);
    assert.notStrictEqual(FS2, FS, '必须是破坏副本');
    let threw = false, msg = '';
    try { gateJudge(IDX_SRC, FS2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 闭合不再判 superseded ⇒ 旧值变 active ⇒ 同款判据必须转红');
    assert.match(msg, /已被换代的旧值仍进了载荷/);
    /* 正向对照：真模块上同款判据必须成立。 */
    gateJudge(IDX_SRC, FS);
});

test('v3299 I3. ★ 破坏只读面（把 state 写回条目）⇒ idemJudge 必须转红', () => {
    const broken = breakSource(FS_SRC, 'entries.push({',
        'if (_isObj(f)) f.state = d.state; entries.push({', 'I3 写回条目');
    const FS2 = loadBroken('fact-state-writeback.js', broken);
    let threw = false, msg = '';
    try { idemJudge(FS2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 读侧一旦写回账本，noWriteBack 自证必须转红（写回式迁移正是靠这条被当场抓住）');
    assert.match(msg, /写回了账本|不幂等/);
    /* 为什么这条门必须有：只测「读两次相同」会被「写回同样的值」骗过 —— 故 I3 拦的是写动作本身。 */
    idemJudge(FS);
});

test('v3299 I4. ★ 破坏范围口径（无区间塌成 false）⇒ rangeJudge 必须转红', () => {
    const broken = breakSource(FS_SRC,
        'coversNow: (from == null && to == null) ? null : !closed,',
        'coversNow: !closed,', 'I4 无区间塌成 false');
    const FS2 = loadBroken('fact-state-range.js', broken);
    let threw = false, msg = '';
    try { rangeJudge(FS2); } catch (e) { threw = true; msg = String((e && e.message) || e); }
    assert.ok(threw, '★ 把「判不了」塌成「不在区间内」是相反动作，同款判据必须转红');
    assert.match(msg, /塌成了/);
    rangeJudge(FS);
});

/* ══════════════════ J. 版本锚 + 登记面 ══════════════════ */
test('v3299 J. 版本锚（当版形，数值 vnum）+ 登记面 + 加载序', () => {
    const idxVer = (/const VERSION = '([0-9.]+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(idxVer, 'index.js 必须有 VERSION 常量');
    assert.strictEqual(JSON.parse(read('package.json')).version, idxVer, 'package.json 同源');
    assert.strictEqual(MANIFEST.version, idxVer, 'manifest.json 同源');
    for (const f of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const m = /let VERSION = '([0-9.]+)'/.exec(read(f));
        assert.ok(m, f + ' 应有 `let VERSION` 副本');
        assert.strictEqual(m[1], idxVer, f + ' 版本副本同源');
    }
    assert.strictEqual(vnum('3.299.0'), 3299000, '★ 当版锚：本档出生版本 vnum 须给出三段数值');
    /* 自锚常量形（V4 认的第二种锚形）：抬版时只改 `CUR` 一处，数值锁随之平移。 */
    assert.strictEqual(vnum(CUR), 3299000, '★ 自锚常量形：vnum(CUR) 须给出三段数值（V4 的计数口径看得见）');
    assert.ok(vnum(idxVer) >= vnum('3.299.0'), '运行版本不得低于本档出生版本，实 ' + idxVer);
    assert.ok(SELF.includes('v3.299.0'), '★ 本档必须锁自己的出生版本 v3.299.0（不随抬版上抬）');
    /* 登记面 */
    assert.strictEqual(MANIFEST.extra_js.filter((x) => x === 'fact-state.js').length, 1,
        '★ fact-state.js 须在 extra_js 恰好声明一次');
    assert.ok(MANIFEST.extra_js.indexOf('fact-state.js') > MANIFEST.extra_js.indexOf('fact-version.js'),
        '加载序：状态模块排在它所推导的 fact-version 之后');
    assert.ok(MANIFEST.extra_js.indexOf('fact-state.js') > MANIFEST.extra_js.indexOf('memory-type.js'),
        '加载序：状态模块排在 memory-type 之后');
    assert.ok(fs.existsSync(path.join(ROOT, 'fact-state.js')), '模块文件必须在磁盘上（声明了却缺席 = 静默失败）');
    assert.strictEqual(MANIFEST.extra_js.length, 87, 'extra_js 项数锁：本版新增 fact-state.js（86 → 87）');
    /* 消费点接线在场：取库口 + 方法体内真调用（结构化判据，不用文本包含当判据）。 */
    assert.ok(/function _factStateLib\(\)/.test(IDX_SRC), '宿主须有 fact-state 取库口');
    assert.ok(stripComments(IDX_SRC).includes('_factStateLib()'), '取库口必须被真调用（否则接线是死的）');
    assert.ok(FS.readState, '取库口拿到的模块必须有 readState');
});
