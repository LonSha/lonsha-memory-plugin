/* ============================================================
 * tests/v3455_m4x8_material_pack.test.mjs — v3.346.0 · M4-X8
 * 按下一幕任务生成精简记忆材料包(任务轴 + 面优先级 + 缺口 + 取代 + 预算)
 *
 * 【本档要证明的五件事(不是「函数返回了对象」)】
 *   a) **任务轴真的改变产物**:同一池,赴约 / 重逢 / 推进 / 收束四类任务的
 *      材料包**不同序**,且各自首位落在**自己的关键面**上 —— 差异**可解释**
 *      (修前缺口:各面合并后没有优先级,四种任务产物同形);
 *   b) **矛盾当前值不并列当真**:同 conflictGroup 出现多个当前值 ⇒ 只留
 *      **楼层最新**那条,其余具名 superseded(**不偷偷丢掉**,也不并列);
 *   c) **未发生 / 受限不进包**:future(未发生)与 restricted(受限)两条闸都闭,
 *      且**分别计数**(不同形)—— 计划不当成已发生,越界知情面不喂;
 *   d) **缺口具名**:任务优先级头部若干面零材料 ⇒ gapsCritical 带标签;
 *   e) **只挑材不裁 token**:本面给「有序材料 + 成本读数 + **越预算名单**」,
 *      真裁仍由注入预算 owner 负责 —— injectsNothing 恒 false(不得声称已注入)。
 *
 * 【三条「不做」也在判据里】
 *   1 不猜:缺 facet / kind 的材料**不硬塞**成 constraint / setting ⇒ unclassified;
 *   2 不产百分比 / 置信度:读数里出现 percent / confidence / score 一类键即不通过;
 *   3 不代写剧情:材料只有 title / snippet / 来源 / 楼层,没有生成正文的出口。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** →
 *   必须现形;并反向对照「原版同判据必须通过」。判据纯度(H5)单独一段。
 * 【当版锚点】本档自锚常量 BORN_V + vnum(锚必须住在当版档案里,供版本守卫 V4 计数)。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const MP_SRC = read('material-pack.js');
const SELF = read(path.join('tests', 'v3455_m4x8_material_pack.test.mjs'));
const BORN_V = '3.346.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
/** 在隔离 vm 里加载 IIFE 模块(与生产同形:window 即全局,module 缺席)。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const MP = loadIIFE(MP_SRC, 'LonShaMaterialPack');
/* ══════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════ */
const ANCHORS = Object.freeze({
    /* 内核·任务轴:置假 ⇒ 面优先级不再按任务走(实测红:B1 拿到四任务同序)。 */
    kRank: String.raw`function facetRankOf(facet, task) {`,
    /* 内核·矛盾取代:置假 ⇒ 同组两条当前值都留在包里(实测红:B2 拿到 packIds 2 条)。 */
    kSupersede: String.raw`m.usable = false;`,
    /* 内核·未发生闸:置假 ⇒ future 材料照进包(实测红:B3 拿到 future 计数 0 且包多一条)。 */
    kFuture: String.raw`const future = (futureRaw === true) || (keyOf(futureRaw) === 'true') || (keyOf(r.status) === 'future') || (keyOf(r.state) === 'planned');`,
    /* 内核·受限闸:置假 ⇒ restricted 材料照进包(实测红:B3 拿到 restricted 计数 0)。 */
    kRestricted: String.raw`const restricted = (restrictedRaw === true) || (keyOf(restrictedRaw) === 'true') || (keyOf(r.knowing) === 'restricted') || (keyOf(r.visibility) === 'restricted');`,
    /* 内核·未归面:置假 ⇒ 缺 facet 的材料被当成可用(实测红:B4 拿到 unclassified 0)。 */
    kUnclassified: String.raw`usable: (f.facet !== '') && !restricted && !future,`,
    /* 内核·缺口:置假 ⇒ 关键面零材料不再进 gaps(实测红:B5 拿到 gapsCritical 0)。 */
    kGap: String.raw`if (!n) { gaps.push({ facet: f, facetLabel: FACET_LABEL[f] || f, critical: critical }); }`,
    /* 宿主·装配点:置假 ⇒ 显式喂的材料被丢(实测红:宿主判据 C1 拿到空池)。
     *   ★ 锚点是**打过接线之后**的形态。 */
    hTake: String.raw`if (Array.isArray(o.materials)) for (const m of o.materials) inv.push(Object.assign({ source: 'caller' }, m));`,
    /* 宿主·任务转发:置假 ⇒ 宿主把任务写死成推进(实测红:宿主判据 C2 拿到 task 恒 advance)。 */
    hTask: String.raw`const out = MP.build(task, asm.inventory, { budget: o.budget });`,
});
/* ══════════════ A. 结构面 ══════════════ */
const HOST_METHODS = [
    'materialPack(task, opts) {',
    '_materialInventory(opts) {',
    '_materialPackLine() {',
];
function judgeStruct(idxSrc, mf) {
    const bad = [];
    for (const h of HOST_METHODS) {
        const n = idxSrc.split(h).length - 1;
        if (n !== 1) bad.push(h + ' 命中 ' + n + ' 次(应恰 1)');
    }
    if (idxSrc.indexOf('function _materialPackLib() {') < 0) bad.push('缺取库口 _materialPackLib');
    if (idxSrc.indexOf("'material-pack.js'") < 0) bad.push('缺模块文件名声明');
    if (idxSrc.indexOf("return ['材料包', '模块未加载(material-pack.js)'];") < 0) bad.push('缺自检行「材料包」');
    if (!Array.isArray(mf.extra_js) || mf.extra_js.indexOf('material-pack.js') < 0) bad.push('manifest.extra_js 缺 material-pack.js');
    /* ★ 本刀是**无状态只读面** —— 不新增任何持久化键(材料池与任务都是调用方给的)。 */
    if (idxSrc.indexOf('materialPack:') >= 0) bad.push('出现了顶层持久化契约键 materialPack:(本面无状态,不落盘)');
    const arch = (/const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    const carry = (/const CARRYOVER_EXEMPT_KEYS = Object\.freeze\(\[([^\]]*)\]/.exec(idxSrc) || [])[1] || '';
    if (/'materialPack'/.test(arch) || /'materialPack'/.test(carry)) bad.push('材料包混进了顶层归档/跨卷键(本面无状态)');
    return bad;
}
test('v3455 A1. **** 宿主三出口各恰一处 + 取库口 + 自检行 + extra_js 登记 + **零落盘面**', () => {
    assert.deepEqual(judgeStruct(IDX, MF), [], judgeStruct(IDX, MF).join(';'));
    assert.ok(MF.extra_js.length >= 111, 'extra_js 不得低于本档出生值 111(实 ' + MF.extra_js.length + ')');
    assert.ok(MF.extra_js.indexOf('material-pack.js') >= 0, 'extra_js 须登记本模块(身位由各当版档自持,后版追加会把它顶掉 —— 不是缺陷)');
    console.log('  ok 三出口各恰 1 次 / 取库口 / 自检行 / extra_js ≥ 111(实 ' + MF.extra_js.length + ') / 无落盘键');
});
function judgeKernel(mp) {
    const bad = [];
    if (mp.MP_VERSION !== 1) bad.push('MP_VERSION 应 1,实 ' + mp.MP_VERSION);
    if (mp.MP_KIND !== 'material_pack') bad.push('MP_KIND 不对:' + mp.MP_KIND);
    for (const t of ['meet', 'reunion', 'advance', 'resolve']) {
        if (mp.TASKS.indexOf(t) < 0) bad.push('TASKS 缺 ' + t);
    }
    if (mp.TASKS.length !== 4) bad.push('TASKS 应恰 4 类,实 ' + mp.TASKS.length);
    /* 四张优先级表都是**同一真源**(FACETS)的排法 —— 不另造词表。 */
    for (const t of mp.TASKS) {
        const p = mp.TASK_PRIORITY[t];
        if (!Array.isArray(p) || p.length !== mp.FACETS.length) { bad.push(t + ' 优先级表长度不符'); continue; }
        for (const f of mp.FACETS) if (p.indexOf(f) < 0) bad.push(t + ' 优先级表缺面 ' + f);
    }
    for (const f of ['build', 'rank', 'resolveConflicts', 'normalize', 'materialOf', 'facetFor', 'line', 'render', 'describe', 'hasPercentKey', 'selfCheck']) {
        if (typeof mp[f] !== 'function') bad.push('缺内核面 ' + f);
    }
    /* 自证十项:确定性 / 零写面 / 任务轴齐 / **任务轴真的改产物** / 矛盾不并列 /
     *   两闸都闭 / 缺口具名 / 畸形≠空 / 无百分比 / 可序列化。 */
    const sc = mp.selfCheck();
    if (sc.ok !== true) bad.push('selfCheck 对合法输入报红:' + JSON.stringify(sc));
    if (sc.writeFaces !== 0) bad.push('selfCheck 数出写面:' + sc.writeFaces);
    if (sc.tasksComplete !== true) bad.push('selfCheck 未守住「任务轴齐」');
    if (sc.taskAxisMoves !== true) bad.push('selfCheck 未守住「任务轴真的改变产物」');
    if (sc.conflictNoParl !== true) bad.push('selfCheck 未守住「矛盾不并列」');
    if (sc.gatesHold !== true) bad.push('selfCheck 未守住「未发生/受限两闸」');
    if (sc.gapsNamed !== true) bad.push('selfCheck 未守住「缺口具名」');
    if (sc.malformedDistinct !== true) bad.push('selfCheck 未守住「畸形≠空」');
    if (sc.percentFree !== true) bad.push('selfCheck 未守住「不产百分比」');
    if (sc.deterministic !== true || sc.serializable !== true) bad.push('selfCheck 确定性/可序列化未过');
    return bad;
}
test('v3455 A2. **** 内核面:版本 + 四任务 + 十面 + 四张优先级表同源 + 自证十项', () => {
    assert.deepEqual(judgeKernel(MP), [], judgeKernel(MP).join(';'));
    console.log('  ok MP_VERSION 1 / TASKS 4 / FACETS 10 / 四表同源 / 自证十项全过');
});
/* ══════════════ B. 真跑(内核,纯函数) ══════════════ */
/** 夹具:四条材料,面互不相同,**同楼层**(便于看纯面序)。 */
const T_MIX = [
    { id: 'a', facet: 'appointment', title: '周三的约', floor: 5, source: 'caller' },
    { id: 'b', facet: 'place', title: '老码头', floor: 5, source: 'scene-book' },
    { id: 'c', facet: 'relation', title: '和解了', floor: 5, source: 'relation' },
    { id: 'd', facet: 'sharedPast', title: '一起看的海', floor: 5, source: 'recall' },
];
/** 判据 a:**任务轴真的改变产物**(四类任务各自首位落在自己的关键面)。 */
function judgeTaskAxis(mp) {
    const meet = mp.build('meet', T_MIX, { budget: 4 });
    const reunion = mp.build('reunion', T_MIX, { budget: 4 });
    const advance = mp.build('advance', T_MIX, { budget: 4 });
    const resolve = mp.build('resolve', T_MIX, { budget: 4 });
    /* 赴约关键面是约定;重逢是关系;推进/收束是承诺(池里没承诺 ⇒ 它取到的首位应是池中该任务最靠前的面)。 */
    if (meet.pack[0].facet !== 'appointment') throw new Error('赴约场首位应是约定,实 ' + meet.pack[0].facet);
    if (reunion.pack[0].facet !== 'relation') throw new Error('重逢场首位应是关系变化,实 ' + reunion.pack[0].facet);
    if (advance.pack[0].facet !== 'relation') throw new Error('推进场(池无承诺)首位应是关系,实 ' + advance.pack[0].facet);
    if (resolve.pack[0].facet !== 'sharedPast') throw new Error('收束场(池无承诺)首位应是共同往事(表序 promise→sharedPast),实 ' + resolve.pack[0].facet);
    /* 四类任务的**完整序不同形**(至少两两互异)。 */
    const order = (r) => r.packIds.join(',');
    const shapes = new Set([order(meet), order(reunion), order(advance), order(resolve)]);
    if (shapes.size < 2) throw new Error('四类任务产物同形(任务轴是空话):' + [...shapes].join(' | '));
    /* 赴约与重逢**必须不同序**(这是本刀最直观的一对)。 */
    if (order(meet) === order(reunion)) throw new Error('★ 赴约与重逢产出了同一个包(任务轴没起作用)');
    /* 优先级读数带出去(可解释:为什么这个面靠前)。 */
    if (!Array.isArray(meet.priority) || meet.priority[0] !== 'appointment') throw new Error('赴约优先级表未带出/首位不对');
    if (!Array.isArray(reunion.priority) || reunion.priority[0] !== 'relation') throw new Error('重逢优先级表未带出/首位不对');
    /* 非法任务名 ⇒ 回落 advance 并**具名说明**(不编第五类)。 */
    const bad = mp.build('whatever', T_MIX, { budget: 4 });
    if (bad.task !== 'advance' || bad.taskKnown !== false) throw new Error('非法任务名未回落 advance:' + bad.task + '/' + bad.taskKnown);
    if (!bad.reasons.some((x) => /未识别/.test(x))) throw new Error('回落必须具名(不得静默换任务)');
    return meet;
}
test('v3455 B1. ★★★ 任务轴真的改变产物:赴约首位=约定 / 重逢首位=关系 / 四类不同序 / 非法任务名回落具名', () => {
    judgeTaskAxis(MP);
    console.log('  ok meet[0]=appointment · reunion[0]=relation · 四类序不同形 · whatever→advance 具名');
});
/** 判据 b:**矛盾当前值不并列** —— 只留楼层最新那条,其余具名 superseded。 */
function judgeConflict(mp) {
    const C = [
        { id: 'c1', facet: 'place', title: '在南城', floor: 3, conflictGroup: 'g1', source: 'recall' },
        { id: 'c2', facet: 'place', title: '在北城', floor: 7, conflictGroup: 'g1', source: 'recall' },
        { id: 'ok', facet: 'place', title: '无关地点', floor: 4, source: 'recall' },
    ];
    const r = mp.build('meet', C, { budget: 5 });
    const ids = r.packIds.slice().sort().join(',');
    if (ids !== 'c2,ok') throw new Error('★ 同组两条当前值必须只留新的那条(c2),实 ' + r.packIds.join(','));
    if (r.superseded.length !== 1) throw new Error('被取代者应恰 1 条,实 ' + r.superseded.length);
    const s = r.superseded[0];
    if (s.id !== 'c1' || s.supersededBy !== 'c2') throw new Error('被取代者未**具名**指向胜者:' + JSON.stringify(s));
    if (r.counts.superseded !== 1) throw new Error('取代计数未报出');
    if (!r.reasons.some((x) => /被更新的那条取代/.test(x))) throw new Error('取代必须写进 reasons(不得静默丢)');
    /* 组里只有一条 ⇒ **不触发**取代(单条不是矛盾)。 */
    const one = mp.build('meet', [{ id: 'x', facet: 'place', title: '唯一地点', floor: 1, conflictGroup: 'g9' }], { budget: 5 });
    if (one.superseded.length !== 0 || one.packIds.join(',') !== 'x') throw new Error('单条同组不得触发取代');
    /* 楼层缺失时**不编楼层**:两条都 null ⇒ 取原序最前(可复算,不按 0 楼乱比)。 */
    const noFloor = mp.build('meet', [
        { id: 'n1', facet: 'place', title: '甲', conflictGroup: 'g2' },
        { id: 'n2', facet: 'place', title: '乙', conflictGroup: 'g2' },
    ], { budget: 5 });
    if (noFloor.packIds.join(',') !== 'n1') throw new Error('楼层全缺时应取原序最前(不编 0 楼):' + noFloor.packIds.join(','));
    return r;
}
test('v3455 B2. ★★★ 矛盾当前值不并列:同组只留楼层最新一条 / 被取代者具名 / 单条不触发 / 楼层缺不编 0', () => {
    judgeConflict(MP);
    console.log('  ok c1 被 c2 取代(具名)/ pack 剩 c2,ok / 单条不触发 / 全缺楼层取原序');
});
/** 判据 c:**未发生 / 受限两条闸都闭**,且**分别计数**(不同形)。 */
function judgeGates(mp) {
    const G = [
        { id: 'g1', facet: 'place', title: '真到过的地方', floor: 5, source: 'recall' },
        { id: 'g2', facet: 'place', title: '打算去的地方', floor: 6, future: true, source: 'caller' },
        { id: 'g3', facet: 'place', title: '他不该知道的地方', floor: 6, restricted: true, source: 'scene-book' },
    ];
    const r = mp.build('meet', G, { budget: 5 });
    if (r.packIds.join(',') !== 'g1') throw new Error('★ 未发生 / 受限都不得进包,实 ' + r.packIds.join(','));
    if (r.counts.future !== 1) throw new Error('未发生计数应 1,实 ' + r.counts.future);
    if (r.counts.restricted !== 1) throw new Error('受限计数应 1,实 ' + r.counts.restricted);
    if (r.held.future.length !== 1 || r.held.future[0].id !== 'g2') throw new Error('未发生未具名在 held.future');
    if (r.held.restricted.length !== 1 || r.held.restricted[0].id !== 'g3') throw new Error('受限未具名在 held.restricted');
    /* 两类**不同形**(合并会让「没发生」与「越界」看起来是同一种东西)。 */
    if (JSON.stringify(r.held.future) === JSON.stringify(r.held.restricted)) throw new Error('未发生与受限读数同形');
    /* 两条闸各自认多种入参形态(status / state / knowing / visibility)。 */
    const alt = mp.build('meet', [
        { id: 'x', facet: 'place', status: 'future' },
        { id: 'y', facet: 'place', state: 'planned' },
        { id: 'z', facet: 'place', knowing: 'restricted' },
    ], { budget: 5 });
    if (alt.packIds.length !== 0) throw new Error('替代入参形态未挡住未发生/受限:' + alt.packIds.join(','));
    if (alt.counts.future !== 2 || alt.counts.restricted !== 1) throw new Error('替代形态计数不对:' + JSON.stringify(alt.counts));
    return r;
}
test('v3455 B3. ★★★ 未发生 / 受限两条闸:都不进包 / 分别计数且不同形 / 多种入参形态都认', () => {
    judgeGates(MP);
    console.log('  ok pack 仅 g1 / future 1 · restricted 1 不同形 / status·state·knowing 形态皆挡');
});
/** 判据 d:**缺口具名** —— 关键面零材料进 gapsCritical(带标签)。 */
function judgeGaps(mp) {
    const SPARSE = [{ id: 's1', facet: 'item', title: '旧钥匙', floor: 4, source: 'recall' }];
    const r = mp.build('meet', SPARSE, { budget: 5 });
    if (r.gapsCritical.length !== 3) throw new Error('赴约三个关键面全空 ⇒ gapsCritical 应 3,实 ' + r.gapsCritical.length);
    for (const g of r.gapsCritical) {
        if (g.critical !== true) throw new Error('缺口未标 critical');
        if (!g.facetLabel) throw new Error('缺口未带可读标签:' + JSON.stringify(g));
    }
    if (!r.reasons.some((x) => /关键面零材料/.test(x))) throw new Error('关键面缺口必须永远报出来');
    /* 逐面明细:每一面都有一格(带 count),不因缺席而不列。 */
    if (r.sheet.length !== MP.FACETS.length) throw new Error('逐面明细应覆盖全部面,实 ' + r.sheet.length);
    if (r.sheet.filter((s) => s.count === 0).length !== r.gaps.length) throw new Error('缺口数与零材料面数不符');
    /* 池里有材料的面**不进** gaps。 */
    if (r.gaps.some((g) => g.facet === 'item')) throw new Error('有材料的面不得进缺口');
    /* 关键面定义随任务变(重逢的关键面不是约定 —— 否则「按任务」是空话)。 */
    const meetCrit = MP.criticalFacetsOf('meet').join(',');
    const reunionCrit = MP.criticalFacetsOf('reunion').join(',');
    if (meetCrit === reunionCrit) throw new Error('不同任务的关键面相同(任务轴没落实到缺口面)');
    /* 不猜:缺 facet / kind 的材料**不硬塞**成某面 ⇒ unclassified 且不进包。 */
    const unk = mp.build('meet', [{ id: 'u1', title: '没说是哪一类' }, { id: 'u2', kind: 'whatever-kind' }], { budget: 5 });
    if (unk.counts.unclassified !== 2) throw new Error('未归面材料应 2 条,实 ' + unk.counts.unclassified);
    if (unk.packIds.length !== 0) throw new Error('★ 未归面的材料不得硬塞进包');
    if (unk.held.unclassified.length !== 2) throw new Error('未归面未具名在 held.unclassified');
    return r;
}
test('v3455 B4. ★★★ 缺口具名:关键面零材料进 gapsCritical(带标签)/ 逐面明细全覆盖 / 未归面不硬塞', () => {
    judgeGaps(MP);
    console.log('  ok gapsCritical 3(带标签)/ sheet 全覆盖 / 未归面 2 不进包 / 关键面随任务变');
});
/** 判据 e:**只挑材不裁 token** —— 有序材料 + 成本读数 + 越预算名单;injectsNothing 恒 false。 */
function judgeBudget(mp) {
    const many = new Array(12).fill(0).map((_, i) => ({ id: 'm' + i, facet: 'place', title: '地点' + i, floor: i, source: 'recall' }));
    const r = mp.build('meet', many, { budget: 5 });
    if (r.pack.length !== 5) throw new Error('给预算 5 ⇒ 包应 5 条,实 ' + r.pack.length);
    if (r.overBudget.length !== 7) throw new Error('越预算名单应 7 条,实 ' + r.overBudget.length);
    if (r.counts.truncated !== 7) throw new Error('越预算计数应 7,实 ' + r.counts.truncated);
    if (!r.reasons.some((x) => /越预算/.test(x) && /既有预算 owner/.test(x))) throw new Error('越预算必须说清「裁剪由既有 owner 负责」');
    /* **不得声称已注入**(本面只挑材;真裁与注入都是别人)。 */
    if (r.injectsNothing !== false) throw new Error('★ 本面不得声称已注入(injectsNothing 恒 false)');
    if (r.writesNothing !== true || r.devisesNothing !== true) throw new Error('本面必须声明不写库、不代写剧情');
    /* 成本读数可复算:estChars 是带上那几条的标题 + 摘要长度和。 */
    const manual = r.pack.reduce((s, m) => s + (m.title || '').length + (m.snippet || '').length, 0);
    if (r.cost.estChars !== manual) throw new Error('成本读数与材料不符:' + r.cost.estChars + ' vs ' + manual);
    if (r.cost.estCharsSkipped !== r.cost.estCharsAll - r.cost.estChars) throw new Error('越预算字数差算错');
    /* 没给预算 ⇒ 用缺省条数,且**这件事能被读出来**(不静默)。 */
    const dflt = mp.build('meet', many, {});
    if (dflt.budget.given !== false || dflt.budget.perItem !== MP.BUDGET_DEFAULT) throw new Error('缺省预算未回落且未声明:' + JSON.stringify(dflt.budget));
    if (!dflt.reasons.some((x) => /缺省条数/.test(x))) throw new Error('缺省预算必须写进 reasons');
    /* 非正预算 ⇒ 按缺省(不读成「一条都不带」)。 */
    const neg = mp.build('meet', many, { budget: 0 });
    if (neg.budget.given !== false || neg.pack.length !== MP.BUDGET_DEFAULT) throw new Error('非正预算未回落缺省:' + JSON.stringify(neg.budget));
    /* 硬顶:预算给得比 PACK_MAX 还大也不超硬顶。 */
    const huge = mp.build('meet', many, { budget: 999 });
    if (huge.pack.length > MP.PACK_MAX) throw new Error('包超过硬顶 PACK_MAX');
    /* 池上限有界且如实报截断(不静默丢)。 */
    const flood = new Array(70).fill(0).map((_, i) => ({ id: 'f' + i, facet: 'place', title: 't' + i }));
    const fr = mp.build('meet', flood, { budget: 5 });
    if (fr.counts.truncatedIn !== 70 - MP.INVENTORY_MAX) throw new Error('池截断数应 ' + (70 - MP.INVENTORY_MAX) + ',实 ' + fr.counts.truncatedIn);
    /* 不产百分比 / 置信度。 */
    if (mp.hasPercentKey(r) !== false) throw new Error('读数里出现了百分比/置信度键');
    if (mp.hasPercentKey({ a: { confidence: 3 } }) !== true) throw new Error('扫描器失效(合成置信度键没被照出)');
    return r;
}
test('v3455 B5. ★★★ 只挑材不裁 token:预算裁剪 + 越预算名单(有序候补)/ 成本可复算 / 硬顶 / 池截断 / 无百分比', () => {
    judgeBudget(MP);
    console.log('  ok 预算 5 ⇒ 包 5 越预算 7 / injectsNothing false / 缺省预算具名 / 池截断 10 / percentFree');
});
/** 判据 f:入参三态**不同形**(畸形 / 缺席 / 空数组)+ 归一丢弃如实计数。 */
function judgeInputShapes(mp) {
    const mal = mp.build('meet', 'not-array', {});
    if (mal.malformedInput !== true || mal.judged !== false) throw new Error('显式非数组应报畸形:' + JSON.stringify(mal.malformedInput));
    if (!mal.reasons.some((x) => /不是数组|畸形/.test(x))) throw new Error('畸形必须具名(不得读成「没有材料」)');
    const none = mp.build('meet', undefined, {});
    if (none.malformedInput) throw new Error('没给材料不应报畸形(合法的「这次没有材料」)');
    if (none.counts.inventory !== 0 || none.judged !== true) throw new Error('缺席应是合法的空面');
    const empty = mp.build('meet', [], {});
    if (empty.counts.inventory !== 0 || empty.degraded) throw new Error('空数组应是合法空面');
    const shape = (r) => JSON.stringify([!!r.malformedInput, !!r.degraded, r.judged, r.counts.inventory]);
    if (new Set([shape(mal), shape(none), shape(empty)]).size < 2) throw new Error('畸形与缺席同形(修前缺口:判不了被读成没有)');
    /* 归一:畸形条目丢弃并计数(不猜、不修);重复 id 只留首条。 */
    const nm = mp.normalize([null, 'x', 3, { id: 'k1', facet: 'place' }, { id: 'k1', facet: 'place' }]);
    if (nm.materials.length !== 1) throw new Error('重复 id 应只留首条,实 ' + nm.materials.length);
    if (nm.dropped !== 4) throw new Error('丢弃计数应 4(3 畸形 + 1 重复),实 ' + nm.dropped);
    /* 建面绝不外抛。 */
    if (typeof mp.build('meet', [{}], {}) !== 'object') throw new Error('build 应返回读数而非抛');
    return mal;
}
test('v3455 B6. ** 入参三态不同形:畸形 ≠ 缺席 ≠ 空数组 / 归一丢弃计数 / 建面绝不外抛', () => {
    judgeInputShapes(MP);
    console.log('  ok 畸形 malformed·judged:false / 缺席合法空面 / 丢弃计数 4 / 不外抛');
});
/* ══════════════ C. 宿主出口(真方法体 + 真内核 + 真 opts 源) ══════════════ */
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
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {',
    'function _materialPackLib() {',
];
const METH_FNS = [
    '_materialInventory(opts) {',
    'materialPack(task, opts) {',
    '_materialPackLine() {',
];
function mkHost(win, src) {
    const idx = src || IDX;
    const libs = LIB_FNS.map((h) => sliceMember(idx, h));
    const meths = METH_FNS.map((h) => sliceMember(idx, h));
    const miss = LIB_FNS.filter((h, i) => !libs[i]).concat(METH_FNS.filter((h, i) => !meths[i]));
    if (miss.length) throw new Error('切片缺失:' + miss.join(' / '));
    const code = libs.join('\n') + '\nreturn ({ ' + meths.join(',\n') + ' });';
    return new Function('errLog', 'window', code)(() => {}, win);
}
const MP_WIN = () => ({ LonShaMaterialPack: MP });
function mpSelf(win, src) {
    return Object.assign(mkHost(win, src), {
        fatedRecallSuggest: () => ({ ok: false, reason: 'absent' }),
        relationHistory: () => ({ ok: false, reason: 'absent' }),
        perspectiveCard: () => ({ ok: false, reason: 'absent' }),
    });
}
/** 判据:宿主装配点 —— 调用方直给的材料进池;**缺各 owner 时如实记 absent(不冒充空)**。 */
function judgeHostAssemble(src) {
    const self = mpSelf(MP_WIN(), src);
    const r = self.materialPack('meet', { materials: [
        { id: 'x1', facet: 'appointment', title: '约', floor: 3 },
        { id: 'x2', facet: 'place', title: '地点', floor: 4 },
    ], budget: 5 });
    if (r.ok !== true) throw new Error('宿主出口未成功(reason=' + r.reason + ')');
    if (r.counts.inventory !== 2) throw new Error('调用方直给的材料没进池(实 ' + r.counts.inventory + ')');
    if (r.callerGiven !== 2) throw new Error('未记调用方给了几条');
    if (r.packIds.join(',') !== 'x1,x2') throw new Error('任务序未生效:' + r.packIds.join(','));
    /* 三个既有 owner 在场但报 absent ⇒ **如实记 absent**,不得静默当「没有材料」。 */
    const states = r.sources.map((s) => s.source + ':' + s.state).join(' ');
    for (const t of ['fated-recall:absent', 'relation:absent', 'pov:absent']) {
        if (states.indexOf(t) < 0) throw new Error('缺 owner 未如实记名(' + t + '):' + states);
    }
    /* owner 抛异常 ⇒ 记 thrown(不吞)。 */
    const self2 = mpSelf(MP_WIN(), src);
    self2.fatedRecallSuggest = () => { throw new Error('boom'); };
    const r2 = self2.materialPack('meet', { materials: [{ id: 'y', facet: 'place' }], budget: 5 });
    if (!r2.sources.some((s) => s.source === 'fated-recall' && s.state === 'thrown')) throw new Error('owner 抛异常未记 thrown');
    if (r2.counts.inventory !== 1) throw new Error('一个 owner 抛不得影响其余材料进池');
    return r;
}
test('v3455 C1. *** 宿主装配池:调用方直给进池 / 缺 owner 如实 absent / owner 抛记 thrown(不冒充空)', () => {
    judgeHostAssemble(IDX);
    console.log('  ok inventory 2 / callerGiven 2 / 三 owner absent 具名 / thrown 具名且不影响其余');
});
/** 判据:宿主任务转发 —— 任务**原样**传给内核(不写死),且读数留痕。 */
function judgeHostTask(src) {
    const self = mpSelf(MP_WIN(), src);
    const meet = self.materialPack('meet', { materials: T_MIX, budget: 4 });
    const reunion = self.materialPack('reunion', { materials: T_MIX, budget: 4 });
    if (meet.task !== 'meet' || meet.taskLabel !== '赴约') throw new Error('宿主未把任务传下去(meet)');
    if (reunion.task !== 'reunion' || reunion.taskLabel !== '重逢') throw new Error('宿主未把任务传下去(reunion)');
    if (meet.packIds.join(',') === reunion.packIds.join(',')) throw new Error('★ 宿主把任务写死了(两任务同包)');
    if (self._materialPackRead !== reunion) throw new Error('宿主未把读数存进只读面 _materialPackRead');
    /* 诊断行(缺省任务)也必须能出。 */
    const line = self._materialPackLine();
    if (typeof line !== 'string' || !line.length) throw new Error('诊断行未产出');
    return reunion;
}
test('v3455 C2. ★★ 宿主转发:任务原样下传(meet/reunion 不同包)/ 读数留痕 / 诊断行可出', () => {
    judgeHostTask(IDX);
    console.log('  ok task meet·reunion 下传 / 两任务不同包 / _materialPackRead 留痕 / 诊断行在场');
});
/** 判据:宿主诊断行 —— 四方分开说(带上 / 关键面缺 / 受限 / 未发生 / 未归面)。 */
function judgeHostLine(src) {
    const self = mpSelf(MP_WIN(), src);
    const r = self.materialPack('meet', { materials: [
        { id: 'p1', facet: 'appointment', title: '约', floor: 3 },
        { id: 'p2', facet: 'place', title: '地点', floor: 4 },
        { id: 'p3', facet: 'relation', title: '关系', floor: 5 },
        { id: 'p4', facet: 'participants', title: '人', floor: 6 },
        { id: 'f1', facet: 'place', title: '打算去', future: true },
        { id: 'r1', facet: 'place', title: '不该知道', restricted: true },
        { id: 'u1', title: '没分类' },
    ], budget: 5 });
    const line = MP.line(r);
    for (const t of [/下一幕 赴约/, /材料 7/, /带上 4/, /受限 1/, /未发生 1/, /未归面 1/]) {
        if (!t.test(line)) throw new Error('诊断行漏说「' + t.source + '」:' + line);
    }
    /* 关键面缺:赴约三关键面(约定/地点/参与者)里池中有齐 ⇒ 不报缺;换成稀疏池必须报。 */
    const sp = self.materialPack('meet', { materials: [{ id: 's', facet: 'item', title: '钥匙' }], budget: 5 });
    const spLine = MP.line(sp);
    if (!/关键面缺 3/.test(spLine)) throw new Error('关键面缺口未报出来:' + spLine);
    /* 空盘:说「暂无材料」,不编。 */
    const empty = self.materialPack('meet', { materials: [], budget: 5 });
    if (!/暂无材料/.test(MP.line(empty))) throw new Error('空盘未说「暂无」');
    /* 畸形:具名说清判不了(不得与「暂无」同形)。 */
    const mal = MP.line({ malformedInput: true, task: 'meet', taskLabel: '赴约', counts: {} });
    if (!/输入畸形/.test(mal)) throw new Error('畸形行未具名:' + mal);
    if (mal === MP.line(empty)) throw new Error('★ 畸形与空盘同形');
    return line;
}
test('v3455 C3. ** 宿主诊断行:四方分开说 / 关键面缺永远报出来 / 空盘说暂无 / 畸形≠空盘', () => {
    judgeHostLine(IDX);
    console.log('  ok 材料7·带上4·受限1·未发生1·未归面1 / 关键面缺 3 / 空盘暂无 / 畸形≠空盘');
});
/** 判据:缺模块两态 —— 建面降级具名 + 诊断行点名文件。 */
function judgeAbsent(src, win) {
    const self = mpSelf(win, src);
    const b = self.materialPack('meet', { materials: T_MIX, budget: 4 });
    if (b.ok !== false || b.reason !== 'module-unavailable') throw new Error('缺模块时建面未降级(实 ' + b.reason + ')');
    if (b.writesNothing !== true || b.pack.length !== 0) throw new Error('降级信封形状不对');
    if (b.injectsNothing !== false) throw new Error('降级面也不得声称已注入');
    const line = self._materialPackLine();
    if (line !== '模块未加载(material-pack.js)') throw new Error('缺模块时诊断行未具名(实 ' + line + ')');
}
test('v3455 C4. ** 缺模块两态:建面降级具名 + 诊断行点名文件', () => {
    judgeAbsent(IDX, {});
    console.log('  ok module-unavailable(零写)/ 诊断行点名 material-pack.js');
});
/* ══════════════ D. 负控制(真源码破坏 → 副本重跑同款判据 → 必须现形) ══════════════ */
function expectRed(fn, label) {
    let threw = false, msg = '';
    try { fn(); } catch (e) { threw = true; msg = String(e && e.message || e); }
    if (!threw) throw new Error(label + ':破坏后判据未转红(负控制空转)');
    return msg;
}
test('v3455 D1. ★★ 破坏「任务轴」⇒ 任务改变产物判据 B1 必须转红', () => {
    const bad = loadIIFE(breakOnce(MP_SRC, ANCHORS.kRank, String.raw`function facetRankOf() { return 0; } function _unused_rank(facet, task) {`, 'kRank'), 'LonShaMaterialPack');
    expectRed(() => judgeTaskAxis(bad), 'kRank');
    judgeTaskAxis(MP);
    console.log('  ok 破坏任务轴 ⇒ 赴约与重逢同序被照出;原版阳性通过');
});
test('v3455 D2. ★★ 破坏「矛盾取代」⇒ 不并列判据 B2 必须转红', () => {
    const bad = loadIIFE(breakOnce(MP_SRC, ANCHORS.kSupersede, String.raw`m.usable = true;`, 'kSupersede'), 'LonShaMaterialPack');
    expectRed(() => judgeConflict(bad), 'kSupersede');
    judgeConflict(MP);
    console.log('  ok 破坏取代 ⇒ 同组两条当前值并列进包被照出;原版阳性通过');
});
test('v3455 D3. ★★ 破坏「未发生闸」⇒ 两闸判据 B3 必须转红', () => {
    const bad = loadIIFE(breakOnce(MP_SRC, ANCHORS.kFuture, String.raw`const future = false;`, 'kFuture'), 'LonShaMaterialPack');
    expectRed(() => judgeGates(bad), 'kFuture');
    judgeGates(MP);
    console.log('  ok 破坏未发生闸 ⇒ 计划当已发生照进包被照出;原版阳性通过');
});
test('v3455 D4. ★★ 破坏「受限闸」⇒ 两闸判据 B3 必须转红', () => {
    const bad = loadIIFE(breakOnce(MP_SRC, ANCHORS.kRestricted, String.raw`const restricted = false;`, 'kRestricted'), 'LonShaMaterialPack');
    expectRed(() => judgeGates(bad), 'kRestricted');
    judgeGates(MP);
    console.log('  ok 破坏受限闸 ⇒ 越界知情面照进包被照出;原版阳性通过');
});
test('v3455 D5. ★★ 破坏「未归面」⇒ 不硬塞判据 B4 必须转红', () => {
    const bad = loadIIFE(breakOnce(MP_SRC, ANCHORS.kUnclassified, String.raw`usable: !restricted && !future,`, 'kUnclassified'), 'LonShaMaterialPack');
    expectRed(() => judgeGaps(bad), 'kUnclassified');
    judgeGaps(MP);
    console.log('  ok 破坏未归面 ⇒ 没分类的材料硬塞进包被照出;原版阳性通过');
});
test('v3455 D6. ★★ 破坏「缺口」⇒ 缺口具名判据 B4 必须转红', () => {
    const bad = loadIIFE(breakOnce(MP_SRC, ANCHORS.kGap, String.raw`if (false) { gaps.push({ facet: f, facetLabel: FACET_LABEL[f] || f, critical: critical }); }`, 'kGap'), 'LonShaMaterialPack');
    expectRed(() => judgeGaps(bad), 'kGap');
    judgeGaps(MP);
    console.log('  ok 破坏缺口收集 ⇒ 关键面空着也不报被照出;原版阳性通过');
});
test('v3455 D7. ★★ 破坏宿主「装配点」⇒ 装配判据 C1 必须转红', () => {
    const badIdx = breakOnce(IDX, ANCHORS.hTake, String.raw`/* taken away */;`, 'hTake');
    expectRed(() => judgeHostAssemble(badIdx), 'hTake');
    judgeHostAssemble(IDX);
    console.log('  ok 破坏装配点 ⇒ 调用方直给的材料被丢被照出;原版阳性通过');
});
test('v3455 D8. ★★ 破坏宿主「任务转发」⇒ 转发判据 C2 必须转红', () => {
    const badIdx = breakOnce(IDX, ANCHORS.hTask, String.raw`const out = MP.build('advance', asm.inventory, { budget: o.budget });`, 'hTask');
    expectRed(() => judgeHostTask(badIdx), 'hTask');
    judgeHostTask(IDX);
    console.log('  ok 破坏任务转发 ⇒ 宿主把任务写死成推进被照出;原版阳性通过');
});
/* ══════════════ F. 锚点自证 + 版本锚 ══════════════ */
test('v3455 F1. ** H5 判据纯度:破坏锚点在**本档源码**里各恰中 1 次', () => {
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 在本档出现 ' + n + ' 次(应恰 1 —— 多处声明会让改一处漏一处时纯度检查恒过)');
    }
    for (const k of ['kRank', 'kSupersede', 'kFuture', 'kRestricted', 'kUnclassified', 'kGap']) {
        const n = MP_SRC.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '内核锚 ' + k + ' 在 material-pack.js 命中 ' + n + ' 次(应恰 1)');
    }
    for (const k of ['hTake', 'hTask']) {
        const n = IDX.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '宿主锚 ' + k + ' 在 index.js 命中 ' + n + ' 次(应恰 1)');
    }
    console.log('  ok 八个锚点在本档各 1 次、在真源各 1 次');
});
test('v3455 F2. ** H6 两向自证:锚点不存在 / 不唯一时 breakOnce 必须拒绝', () => {
    assert.throws(() => breakOnce('abc', 'zzz', 'x'), /锚点命中|拒绝破坏/);
    assert.throws(() => breakOnce('aaa', 'a', 'b'), /锚点命中|拒绝破坏/);
    console.log('  ok 0 次 / 多次 锚点均被 breakOnce 拒绝');
});
test('v3455 G1. ★★ 版本面:六源同源 + 本档出生锚 BORN_V(下界,不锁当版)', () => {
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), '宿主版本不得低于本档出生版本(实 ' + idxV + ')');
    assert.equal(MF.version, idxV, 'manifest.json 未与宿主同源');
    assert.equal(PKG.version, idxV, 'package.json 未与宿主同源');
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const s = read(rel);
        assert.match(s, new RegExp(String.raw`let VERSION = '${idxV}'`), rel + ' 未同源');
    }
    assert.ok(vnum(BORN_V) > vnum('3.345.0'), '版本序须前进');
});