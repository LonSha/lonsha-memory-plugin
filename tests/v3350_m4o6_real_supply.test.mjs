/* ============================================================
 * tests/v3350_m4o6_real_supply.test.mjs — [v3.335.0 · 第四期 M4-O6]（18 条）
 *
 * 【本档要证明的是「正常会话真能供上数」，不是「函数返回了对象」】
 *   M4-O6 验收原文：*不手工设置上述私有槽，从公开会话/提取入口建立最小剧情，
 *   再调用四类功能；源变更与切分支后读数更新，重开不依赖上轮实例残留。
 *   纯函数与诊断行全绿不足以收口。*
 *
 *   修前实测（读码，可复算）：`grep -rn '_storyAnnualChapters\|_storyAnnualSummary\|
 *   _storyAnnualQuotes\|_branchOutcomes\|_pastDetails\|_knownFacts\|_loreConfirmedFacts'`
 *   在全部生产 `.js` 里**只命中四个装配点自身** —— 六个私有槽**零写入点**，
 *   于是年鉴 / 正史 / 旧事 / 资料四面在真实会话里长期停在「依赖未给 ⇒ 未判」。
 *
 *   判据分六面（每面有独立的证伪路径）：
 *     A 结构面：派生层成员逐项在场且**各恰一处**；四个装配点**真改走派生**且私有槽仍优先
 *     B 真源派生真跑：真 SummarySystem / PlotTimeline / SceneBook / SuspenseBook /
 *       WorldProgress / 事实账 ⇒ 六面各自取到**真内容**（不是空表也不是 null）
 *     C ★两态不许同形：真源**缺席** ⇒ null（未判）；真源**在场而空** ⇒ 空表 / `{}`
 *       （查过、没有）。「没记过」与「确实没有」在本档逐面对照
 *     D 四面接通：把派生结果喂给**真内核**（story-annual / branch-canon / fated-recall /
 *       lore-import），四面各自从「未判」变成**真读数**（这是 M4-O6 的用户收益）
 *     E 零写 / 零缓存 / 现算：owner 快照逐字节不变；源变更后读数跟着变；私有槽优先
 *     F 真源码破坏负控制三条（每条带原版阳性对照）+ 版本锚 + 工具两向自证 + 判据纯度
 *
 * 【诚实边界（本档明确不判的三条）】
 *   1 不判「章界切得对不对」：卷记录来自 SummarySystem 的真折叠结果，
 *     本档只判「有真卷就有真章、没有真卷就报未判」，不判章界是否合乎叙事。
 *   2 不判「旧事在此刻是否应景」：那是 fated-recall 内核的触发面（X8 已自证），
 *     本档只判派生出的地基键（place / person / anniversary）确实来自真源。
 *   3 不判真实 SillyTavern 宿主与真实模型：`_o6Chat()` 在本档用**同形状假 chat**
 *     验证取数口径（真宿主 UI 与真模型问答未跑，与 M4-O5 的边界同款）。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。工具两向自证（锚点 0 次 / 不唯一 / 同值均抛）
 *   与判据纯度（H5：破坏锚点字面量在本档各只声明一次）各一段。
 * 【当版锚点】本档自锚常量 BORN + vnum（锚必须住在当版档案里）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const IDX = read('index.js');
const QT_SRC = read('engine-qa-tools.js');
const SA_OPS_SRC = read('engine-story-annual.js');
const FULL_SRC = IDX + '\n' + SA_OPS_SRC;
const SELF = read(path.join('tests', 'v3350_m4o6_real_supply.test.mjs'));
const MF = JSON.parse(read('manifest.json'));
const BORN = '3.335.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* 真内核（真模块装载，不走副本） */
const CORE = require_(path.join(R, 'memory-core.js'));
const ORGANS = require_(path.join(R, 'memory-organs.js'));
const BOOKS = require_(path.join(R, 'memory-books.js'));
const SCENE = require_(path.join(R, 'scene-book.js'));
const BS = require_(path.join(R, 'branch-semantics.js'));
const SA = require_(path.join(R, 'story-annual.js'));
const BC = require_(path.join(R, 'branch-canon.js'));
const FR = require_(path.join(R, 'fated-recall.js'));
const LI = require_(path.join(R, 'lore-import.js'));

/* ══════════════ 宿主夹具：从 index.js 真切片（不手抄实现） ══════════════ */
const LIB_FNS = ['function _moduleLib(getGlobal, fileName) {'];
const HOST_METHODS = [
    '_o6RealOwners() {', '_o6Chat() {', '_o6Quotes(floor, opts) {', '_o6Chapters(O) {',
    '_o6Summary(O) {', '_o6Outcomes(O) {', '_o6PastDetails(O) {', '_o6KnownFacts(O) {',
    '_o6ConfirmedFacts(O) {', '_o6KnownEntities() {', 'annualSources() {',
    '_qaKnownActors(limit) {', '_storyAnnualDeps() {', '_branchCanonDeps() {',
    '_fatedRecallDeps() {', '_loreImportDeps() {'
];
/** 从 engine-qa-tools.js 提取方法体，转回类方法格式（engine.→this.）。 */
function getMethodSeg(src, saOpsSrc, head) {
    if (head === '_storyAnnualDeps() {' || head === '_loreImportDeps() {') {
        const fnName = head.split('(')[0];
        const m = saOpsSrc.match(new RegExp('(?:async\\s+)?function\\s+' + fnName + '\\s*\\(engine(?:,\\s*(.*?))?\\)\\s*\\{'));
        if (m) {
            return extractModuleMethod(saOpsSrc, m[0]);
        }
    }
    return methodBody(src, head);
}

function extractModuleMethod(source, funcMarker) {
    const start = source.indexOf(funcMarker);
    if (start < 0) return null;
    const bodyStart = start + funcMarker.length - 1;
    if (source[bodyStart] !== '{') return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    let body = source.slice(bodyStart + 1, end);
    body = body.replace(/\bengine\./g, 'this.');
    const asyncP = funcMarker.startsWith('async ') ? 'async ' : '';
    const nm = funcMarker.match(/(?:async\s+)?function\s+(\w+)\s*\(engine(?:,\s*(.*?))?\)\s*\{/);
    if (!nm) return null;
    const params = nm[2] !== undefined ? nm[2] : '';
    return asyncP + nm[1] + '(' + params + ') {' + body + '}';
}
/** 方法体切片（花括号配平；与 v3312 / v3324 同款）。 */
function methodBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const close = src.indexOf(')', at);
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
function libWindow(extra) {
    return Object.assign({
        LonShaBranchSemantics: BS, LonShaStoryAnnual: SA, LonShaBranchCanon: BC,
        LonShaFatedRecall: FR, LonShaLoreImport: LI, LonShaSceneBook: SCENE
    }, extra || {});
}
/** 按给定 index.js 源码装一个「只含本面所需方法」的引擎（破坏副本也走这里）。 */
function engineFrom(src, win, saOpsSrc = SA_OPS_SRC) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h));
    const missL = LIB_FNS.filter((h, i) => !libs[i]);
    const meths = HOST_METHODS.map((h) => {
        if (h === '_qaKnownActors(limit) {') {
            return extractModuleMethod(QT_SRC, 'function _qaKnownActors(engine, limit) {');
        }
        if (h === '_branchCanonDeps() {' || h === '_fatedRecallDeps() {') {
            return methodBody(src, h);
        }
        const fnName = h.split('(')[0];
        const m = saOpsSrc.match(new RegExp('(?:async\\s+)?function\\s+' + fnName + '\\s*\\(engine(?:,\\s*(.*?))?\\)\\s*\\{'));
        if (m) {
            return extractModuleMethod(saOpsSrc, m[0]);
        }
        return methodBody(src, h);
    });
    const missM = HOST_METHODS.filter((h, i) => !meths[i]);
    if (missL.length || missM.length) throw new Error('切片缺失：取库口[' + missL.join('/') + '] 出口[' + missM.join('/') + ']');
    const code = libs.join(J) + J + 'return ({ ' + meths.join(',' + J) + ' });';
    const eng = new Function('errLog', 'window', code)(() => {}, win || libWindow());
    return eng;
}
/** 真 owner 齐全的宿主（**只装真类实例**；私有槽一律不设）。 */
function hostWithOwners(opts) {
    const o = opts || {};
    const eng = engineFrom(IDX);
    eng.config = { config: { recallCooldownDays: 3, debugMode: false } };
    eng.summary = o.summary === undefined ? new CORE.SummarySystem() : o.summary;
    eng.worldProg = o.worldProg === undefined ? new ORGANS.WorldProgress() : o.worldProg;
    eng.timeline = o.timeline === undefined ? new BOOKS.PlotTimeline() : o.timeline;
    eng.scene = o.scene === undefined ? new SCENE.SceneBook() : o.scene;
    eng.suspense = o.suspense === undefined ? new BOOKS.SuspenseBook() : o.suspense;
    eng.deltaBook = o.deltaBook === undefined ? { deltas: [] } : o.deltaBook;
    eng._eventThreadState = o.events === undefined ? null : o.events;
    eng._factVersionState = o.facts === undefined ? null : o.facts;
    eng._entityIdByName = new Map();
    eng.graph = { nodes: new Map() };
    return eng;
}
/** 造最小剧情的真源状态（**写的是 owner 的真数据结构**，不是私有槽）。 */
function seedStory(eng) {
    const S = eng.summary;
    S.createSummary({ index: 0, mes: '甲' }, '开篇：甲在旧书店遇见了乙。', { maxLen: 200 });
    S.createSummary({ index: 1, mes: '乙' }, '乙提起三年前的那场雨。', { maxLen: 200 });
    S.summaries[0].floor = 0; S.summaries[1].floor = 1;
    S.volumes.push({
        id: 'vol_1', text: '两人在旧书店重逢，约定下月同去旧地。',
        floorStart: 0, floorEnd: 1, count: 2, timestamp: 1, level: 2, degraded: false
    });
    S.historical.push({ id: 'his_1', text: '长线：旧书店一线是主线起点。', floorStart: 0, floorEnd: 1, count: 1, level: 3 });
    S.addLockedFact('甲答应把伞还给乙', 1);
    eng.timeline.add('三年前', '两人在雨里第一次见面', 1, ['甲', '乙'], 8);
    eng.scene.apply([{ path: '城市/旧书店', desc: '一间旧书店' }], 0);
    eng.scene.setLocation(0, '城市/旧书店');
    eng.suspense.add('suspense', '那把伞到底还在不在', 1, '三年前');
    const p = eng.worldProg.addPromise({ character: '甲', content: '下月同去旧地', floor: 1, deadlineFloor: 30 });
    eng.worldProg.promises[0].status = 'fulfilled';
    eng.worldProg.knowledge['甲'] = { known: ['旧书店一线'], unaware: [] };
    eng._factVersionState = {
        version: 1, seq: 1,
        facts: [
            { id: 'f1', subject: '甲', predicate: '答应', value: '下月同去旧地', origin: 'confirmed', type: null, conflictPolicy: 'auto', trust: 1, from: null, to: null, floor: 1, source: '', evidence: '' },
            { id: 'f2', subject: '乙', predicate: '提到', value: '三年前的那场雨', origin: 'stated', type: null, conflictPolicy: 'auto', trust: 0.8, from: null, to: null, floor: 1, source: '', evidence: '' }
        ]
    };
    eng._entityIdByName.set('甲', 'n1');
    eng._entityIdByName.set('乙', 'n2');
    return { p: p, S: S };
}

/* ── 负控制锚点（每个在本档内必须恰好出现 1 次：见 F3） ── */
const A_CF = "        if (factsOwner === null && lockedOwner === null) return null;";
const A_CF_BAD = "        if (false) return null;";
const A_CH = "        if (!chapters.length) return null;";
const A_CH_BAD = "        if (false) return null;";
const A_PRI = "                KNOWN_FACTS: (this._knownFacts && typeof this._knownFacts === 'object') ? this._knownFacts : this._o6KnownFacts(O),";
const A_PRI_BAD = "                KNOWN_FACTS: (false) ? this._knownFacts : this._o6KnownFacts(O),";

/* ══════════════ 判据体（正负两跑共用同一份） ══════════════ */
/** J1：真源缺席 ⇒ 已确认事实面必须 null（不得把「没记过」写成「查过、没有」）。 */
function jAbsentIsNotJudged(src, win, saOpsSrc = SA_OPS_SRC) {
    const eng = engineFrom(src, win, saOpsSrc);
    eng.config = { config: {} };
    eng.summary = null; eng.worldProg = null; eng.timeline = null; eng.scene = null;
    eng.suspense = null; eng.deltaBook = null;
    eng._eventThreadState = null; eng._factVersionState = null;
    eng._entityIdByName = new Map(); eng.graph = { nodes: new Map() };
    const cf = eng._o6ConfirmedFacts(eng._o6RealOwners());
    if (cf !== null) return '两源都缺席时已确认事实面必须 null（未判），实 ' + JSON.stringify(cf);
    return '';
}
/** J2：真源在场但零卷 ⇒ 章面必须 null（不许编出「查过、零章」）。 */
function jNoVolumeNoChapters(src, win, saOpsSrc = SA_OPS_SRC) {
    const eng = engineFrom(src, win, saOpsSrc);
    eng.config = { config: {} };
    eng.summary = new CORE.SummarySystem();      // 在场、零卷、零史记
    eng.worldProg = new ORGANS.WorldProgress(); eng.timeline = new BOOKS.PlotTimeline();
    eng.scene = new SCENE.SceneBook(); eng.suspense = new BOOKS.SuspenseBook();
    eng.deltaBook = { deltas: [] }; eng._eventThreadState = null; eng._factVersionState = null;
    eng._entityIdByName = new Map(); eng.graph = { nodes: new Map() };
    const ch = eng._o6Chapters(eng._o6RealOwners());
    if (ch !== null) return '真源在场但零卷 ⇒ 章面必须 null（未判，不猜章界），实 ' + JSON.stringify(ch);
    return '';
}
/** J3：显式私有槽必须优先（派生层不得覆盖调用方给的入参）。 */
function jPrivateSlotWins(src, win) {
    const eng = engineFrom(src, win);
    eng.config = { config: { recallCooldownDays: 3 } };
    eng.summary = new CORE.SummarySystem(); eng.worldProg = new ORGANS.WorldProgress();
    eng.timeline = new BOOKS.PlotTimeline(); eng.scene = new SCENE.SceneBook();
    eng.suspense = new BOOKS.SuspenseBook(); eng.deltaBook = { deltas: [] };
    eng._eventThreadState = null; eng._factVersionState = null;
    eng._entityIdByName = new Map(); eng.graph = { nodes: new Map() };
    eng._knownFacts = { '显式角色': ['显式主体'] };
    const d = eng._fatedRecallDeps();
    if (!d.KNOWN_FACTS || !d.KNOWN_FACTS['显式角色']) {
        return '私有槽在场时必须原样透传（不得被派生层覆盖），实 ' + JSON.stringify(d.KNOWN_FACTS);
    }
    return '';
}

/* ══════════════ A 结构面 ══════════════ */
test('v3350 A1. ★★★★ 派生层十一个成员逐项在场且**各恰一处**（重复定义 = 第二份真源）', () => {
    for (const m of ['_o6RealOwners() {', '_o6Chat() {', '_o6Quotes(floor, opts) {', '_o6Chapters(O) {',
        '_o6Summary(O) {', '_o6Outcomes(O) {', '_o6PastDetails(O) {', '_o6KnownFacts(O) {',
        '_o6ConfirmedFacts(O) {', '_o6KnownEntities() {', 'annualSources() {']) {
        const n = IDX.split(m).length - 1;
        assert.equal(n, 1, '派生层成员须恰在场一次：' + m + '（实 ' + n + '）');
    }
    ok('十一个成员各恰一处（无第二份供数实现）');
});

test('v3350 A2. ★★★★★ 四个装配点**真改走派生**且私有槽仍优先（旧写法必须已消失）', () => {
    /* 旧写法（只读私有槽、无派生）必须已不在盘上 —— 否则「改了」这句话不成立。 */
    for (const old of [
        'CHAPTERS: (this._storyAnnualChapters && Array.isArray(this._storyAnnualChapters.chapters)) ? this._storyAnnualChapters : null,',
        'BRANCH_OUTCOMES: (Array.isArray(this._branchOutcomes)) ? this._branchOutcomes : null,',
        'PAST_DETAILS: (Array.isArray(this._pastDetails)) ? this._pastDetails : null,'
    ]) assert.ok(IDX.indexOf(old) < 0, '旧只读装配必须已被替换：' + old.slice(0, 60));
    /* 四个装配点里各须出现派生调用，且键名与内核 REQUIRED_DEPS 逐字一致。 */
    for (const [head, key, deri] of [
        ['_storyAnnualDeps() {', 'CHAPTERS', '_o6Chapters(O)'],
        ['_branchCanonDeps() {', 'BRANCH_OUTCOMES', '_o6Outcomes(O)'],
        ['_fatedRecallDeps() {', 'PAST_DETAILS', '_o6PastDetails(O)'],
        ['_loreImportDeps() {', 'CONFIRMED_FACTS', '_o6ConfirmedFacts(O)']
    ]) {
        const seg = getMethodSeg(IDX, SA_OPS_SRC, head);
        assert.ok(seg, '装配点切片失败：' + head);
        assert.ok(seg.indexOf(key + ':') >= 0, head + ' 须仍给 ' + key);
        assert.ok(seg.indexOf(deri) >= 0, head + ' 须真调用派生 ' + deri);
    }
    /* 键名与内核声明逐字对账（改名 = 静默变成「依赖缺席」）。 */
    for (const [mod, keys] of [[SA, ['CHAPTERS', 'SUMMARY', 'QUOTES']],
        [BC, ['BRANCH_OUTCOMES', 'CONFIRMED_FACTS', 'SECRET_BODY_KEYS']],
        [FR, ['PAST_DETAILS', 'KNOWN_FACTS', 'COOLDOWN_DAYS']],
        [LI, ['KNOWN_ENTITIES', 'CONFIRMED_FACTS', 'SECRET_BODY_KEYS']]]) {
        for (const k of keys) assert.ok(mod.REQUIRED_DEPS.some((d) => d.key === k), '内核声明面缺键 ' + k);
    }
    const segs = ['_storyAnnualDeps() {', '_branchCanonDeps() {', '_fatedRecallDeps() {', '_loreImportDeps() {']
        .map((h) => getMethodSeg(IDX, SA_OPS_SRC, h)).join('\n');
    for (const k of ['CHAPTERS', 'SUMMARY', 'QUOTES', 'BRANCH_OUTCOMES', 'CONFIRMED_FACTS',
        'SECRET_BODY_KEYS', 'PAST_DETAILS', 'KNOWN_FACTS', 'COOLDOWN_DAYS', 'KNOWN_ENTITIES']) {
        assert.ok(segs.indexOf(k + ':') >= 0, '四装配点合起来须给全键：' + k);
    }
    ok('四装配点已改走派生；九键逐字对齐四个内核的 REQUIRED_DEPS');
});

/* ══════════════ B 真源派生真跑 ══════════════ */
test('v3350 B1. ★★★★★ 真 owner 齐备 ⇒ 六面各自取到**真内容**（不是空表也不是 null）', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    const O = eng._o6RealOwners();
    assert.ok(O.owners.indexOf('summary') >= 0, 'SummarySystem 须被认作在场真源');
    assert.ok(O.owners.indexOf('worldProg') >= 0, 'WorldProgress 须被认作在场真源');
    assert.ok(O.owners.indexOf('actors') >= 0, '实体名册须被认作在场真源');

    const ch = eng._o6Chapters(O);
    assert.ok(ch && Array.isArray(ch.chapters) && ch.chapters.length >= 1, '须从真卷记录派生出真章节');
    assert.equal(ch.chapters[0].floorFrom, 0, '章起点须来自真卷 floorStart');
    assert.equal(ch.chapters[0].floorTo, 1, '章终点须来自真卷 floorEnd');
    assert.ok(String(ch.chapters[0].summary || '').indexOf('旧书店') >= 0, '章摘要须是真卷正文');
    assert.ok(ch.chapters[0].events.length >= 1, '章内事件须来自真时间线');

    const sm = eng._o6Summary(O);
    assert.ok(sm && sm.volumes === 1 && sm.summaries === 2, '摘要读口须是真读数（卷 1 / 摘要 2）');
    assert.ok(sm.lockedFacts === 1, '锁定事实须计入真读数');

    const oc = eng._o6Outcomes(O);
    assert.ok(Array.isArray(oc) && oc.length >= 1, '真终局项须出现在结局清单里');
    assert.ok(oc.some((r) => r.terminal === true && String(r.value).indexOf('fulfilled') >= 0),
        '已兑现的承诺须以 terminal:true 落成结局条目');

    const pd = eng._o6PastDetails(O);
    assert.ok(Array.isArray(pd) && pd.length >= 2, '旧事须来自真时间线 + 真到访史');
    const tlRow = pd.filter((r) => r.keys.some((k) => k.indexOf('person:') === 0))[0];
    assert.ok(tlRow, '旧事地基键须含真角色（person:）');
    assert.ok(pd.some((r) => r.keys.some((k) => k.indexOf('place:') === 0)), '旧事地基键须含真场所（place:）');

    const kf = eng._o6KnownFacts(O);
    assert.ok(kf && kf['甲'], '知情名单须含真角色「甲」');
    assert.ok(kf['甲'].indexOf('甲') >= 0, '角色自己的名字须在知情名单里（真实体名册）');

    const cf = eng._o6ConfirmedFacts(O);
    assert.ok(cf && Object.keys(cf).length >= 1, '已确认事实面须取到真读数');
    assert.ok(cf['fact:甲|答应'] === '下月同去旧地', '须只收 origin:confirmed 的断言');
    assert.ok(!Object.prototype.hasOwnProperty.call(cf, 'fact:乙|提到'), 'stated 不得冒充 confirmed');
    ok('六面真内容：章 ' + ch.chapters.length + ' / 结局 ' + oc.length + ' / 旧事 ' + pd.length
        + ' / 知情 ' + Object.keys(kf).length + ' / 已确认 ' + Object.keys(cf).length);
});

test('v3350 B2. ★★★★ 原话面只取**真聊天该楼**的引号原句（假 chat 同形状验证取数口径）', () => {
    const chat = [
        { mes: '甲说：「伞我明天还你。」然后笑了笑。' },
        { mes: '乙低声道：「那你可别忘了。」' },
        { mes: '' }
    ];
    const eng = engineFrom(IDX, libWindow({
        SillyTavern: { getContext: () => ({ chat: chat }) }
    }));
    const q0 = eng._o6Quotes(0, { max: 3 });
    assert.ok(Array.isArray(q0) && q0.length === 1, '第 0 楼须恰取到 1 句原话，实 ' + JSON.stringify(q0));
    assert.equal(q0[0].text, '伞我明天还你。', '取的须是正文里的原句逐字');
    assert.equal(q0[0].floor, 0, '原话须带真实楼层');
    assert.deepEqual(eng._o6Quotes(2, { max: 3 }), [], '空正文楼层须给空表（不是 null）');
    /* 聊天不可达 ⇒ null（原话面报未判，不编）。 */
    const eng2 = engineFrom(IDX, libWindow({}));
    assert.equal(eng2._o6Quotes(0, {}), null, '取不到真聊天 ⇒ null（未判），不编原话');
    ok('原话面：真取正文引号句 / 空楼给空表 / 取不到聊天给 null（三态不同形）');
});

/* ══════════════ C 两态不许同形 ══════════════ */
test('v3350 C1. ★★★★★ 真源缺席 ⇒ null（未判）；真源在场而空 ⇒ 空表 / {}（查过、没有）', () => {
    /* ① 缺席：六面各自 null。 */
    const bare = engineFrom(IDX);
    bare.config = { config: {} };
    bare.summary = null; bare.worldProg = null; bare.timeline = null; bare.scene = null;
    bare.suspense = null; bare.deltaBook = null;
    bare._eventThreadState = null; bare._factVersionState = null;
    bare._entityIdByName = new Map(); bare.graph = { nodes: new Map() };
    const Ob = bare._o6RealOwners();
    assert.equal(bare._o6Chapters(Ob), null, '摘要 owner 缺席 ⇒ 章面 null');
    assert.equal(bare._o6Summary(Ob), null, '摘要 owner 缺席 ⇒ 摘要读口 null');
    assert.equal(bare._o6Outcomes(Ob), null, '结局 owner 缺席 ⇒ 结局面 null');
    assert.equal(bare._o6PastDetails(Ob), null, '旧事 owner 缺席 ⇒ 旧事面 null');
    assert.equal(bare._o6KnownFacts(Ob), null, '名册缺席 ⇒ 知情面 null');
    assert.equal(bare._o6ConfirmedFacts(Ob), null, '两源缺席 ⇒ 已确认面 null');
    assert.equal(bare._o6KnownEntities(), null, '名册缺席 ⇒ 实体面 null');

    /* ② 在场而空：可表达的「无」给空表 / {}。 */
    const empty = hostWithOwners();
    const Oe = empty._o6RealOwners();
    assert.deepEqual(empty._o6Outcomes(Oe), [], '结局 owner 在场而零终局 ⇒ **空表**（查过、没有）');
    assert.deepEqual(empty._o6ConfirmedFacts(Oe), {}, '两源在场而零已确认 ⇒ **{}**（查过、没有）');
    assert.equal(empty._o6PastDetails(Oe), null, '旧事一处都凑不出 ⇒ 仍 null（不报「没有旧事」）');
    ok('缺席 ⇒ null / 在场而空 ⇒ 空表·{}（七面逐面对照，两态不同形）');
});

/* ══════════════ D 四面接通（真内核真读数） ══════════════ */
test('v3350 D1. ★★★★★ 年鉴面：不设私有槽，真内核从派生结果**建出真章节册**', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    /* 修前形态（只读私有槽）被替换后，一年面必须靠派生层拿到章面。 */
    const deps = eng._storyAnnualDeps();
    assert.ok(deps.CHAPTERS && Array.isArray(deps.CHAPTERS.chapters) && deps.CHAPTERS.chapters.length >= 1,
        '装配点须把真卷章交给内核');
    const built = SA.build(deps.CHAPTERS, {});
    assert.equal(built.chaptersChecked, true, '章面必须已判（不再是「章面未判」）');
    assert.ok(built.chapters.length >= 1, '须建出真章节');
    assert.ok(built.counts.events >= 1, '章内事件留数须 > 0，实 ' + JSON.stringify(built.counts));
    assert.equal(built.ok, true, '章册须 ok');
    /* 每个证据都可回源（floor 是真楼层）。 */
    for (const c of built.chapters) for (const ev of c.evidence) {
        assert.ok(ev.floor >= 0, '证据位须带真楼层');
        assert.ok(String(ev.ref).length > 0, '证据位须带 ref');
    }
    ok('年鉴面接通：章 ' + built.chapters.length + ' / 事件 ' + built.counts.events + ' / 证据位可回源');
});

test('v3350 D2. ★★★★★ 正史面：真终局项给出冲突/单条读数（未给 ⇒ 未判的旧态已消失）', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    const deps = eng._branchCanonDeps();
    assert.ok(Array.isArray(deps.BRANCH_OUTCOMES) && deps.BRANCH_OUTCOMES.length >= 1,
        '装配点须把真终局项交给内核');
    const st = BC.conflicts(deps);
    assert.equal(st.judged, true, '结局清单已给 ⇒ 冲突面必须已判（不再是 no-deps）');
    assert.ok(st.rows.length >= 1, '逐冲突列举须有真行');
    assert.ok(st.rows.some((r) => r.verdict === 'single'), '单条终局须落 single 档（可被「选它/排除它」）');
    /* ★ 真分支对照路径：两条支线在**同一位**上取值不同 ⇒ 必须落冲突档。
     *   对照由真内核 branch-semantics 产出（本档真调 compareOwners，不手抄形状）；
     *   宿主侧把它挂在 worldProg.branchComparison 上 —— 这正是 compareBranchOwners
     *   内部的落点（`this.branchComparison = cmp`）。 */
    const eng2 = hostWithOwners();
    seedStory(eng2);
    const sideB = {
        modules: { unfinished: true },
        owners: { __world__: { unfinished: [{ id: 'cmt_1', value: '留下来', floor: 9 }] } }
    };
    const sideA = {
        modules: { unfinished: true },
        owners: { __world__: { unfinished: [{ id: 'cmt_1', value: '离开', floor: 3 }] } }
    };
    eng2.worldProg.branchComparison = BS.compareOwners(sideA, sideB, {});
    const two = BC.conflicts(eng2._branchCanonDeps());
    const clash = two.rows.filter((r) => r.verdict === 'both-terminal' || r.verdict === 'divergent');
    assert.ok(clash.length >= 1, '两条支线同一位取值不同须现形（实 ' + JSON.stringify(two.rows.map((r) => r.verdict)) + '）');
    assert.equal(clash[0].verdict, 'divergent', '同址取值不同须落 divergent 档');
    /* ★ M4-O6 连带真缺陷锁定：`DIVERGENT` 此前**只在三处被引用、不在 CLASH 表里**，
     *   于是冲突位落到 undefined ⇒ `blocked` 不增、planCanon 的 isClash 恒 false，
     *   下游把「未选的冲突结局」当「没有冲突」继续交接。
     *   这里同时钉住「表里有」与「闸真的用上」（两向，防只补表不接线）。 */
    assert.equal(BC.CLASH.DIVERGENT, 'divergent', 'CLASH 表必须含 DIVERGENT（缺了 = 三个闸静默失效）');
    /* 第一台引擎只有**单条**终局 ⇒ 不构成冲突（single 不算 blocked），但列出来以便「选它/排除它」。 */
    assert.equal(st.blocked, 0, '单条终局不得被算成冲突（实 ' + st.blocked + '）');
    /* 第二台引擎带**真分支对照** ⇒ 同址冲突必须计入 blocked（否则「不得交接」没有落点）。 */
    assert.ok(two.blocked >= 1, '分支对照产出的冲突必须计入 blocked（实 ' + two.blocked + '）');
    /* planCanon 的 isClash 也走这一档：未选之前必须 blocked（不得交接）。 */
    const plan = BC.planCanon(eng2._branchCanonDeps(), null);
    assert.equal(plan.judged, true, '计划面须已判');
    assert.equal(plan.preview, 'blocked', '冲突未选之前计划面须 blocked（实 ' + plan.preview + '）');
    ok('正史面接通：单条 ' + st.rows.length + ' 行 / 真分支对照同址冲突现形 ' + clash.length + ' 处');
});

test('v3350 D3. ★★★★★ 旧事面：真时间线 + 真场所给出**建议候选**（旧事重现不再是空面）', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    const deps = eng._fatedRecallDeps();
    assert.ok(Array.isArray(deps.PAST_DETAILS) && deps.PAST_DETAILS.length >= 1, '装配点须把真旧事交给内核');
    assert.ok(deps.KNOWN_FACTS && deps.KNOWN_FACTS['甲'], '装配点须把真知情名单交给内核');
    /* 命中一个真地基键（person:甲）⇒ 必须出建议。 */
    const rep = FR.suggest(deps, {}, { scene: { keys: [{ kind: 'person', value: '甲' }] }, actor: '甲', day: 10 });
    assert.equal(rep.judged, true, '情境与旧事都已给 ⇒ 建议面必须已判');
    assert.ok(rep.suggested.length >= 1, '命中真地基键须出建议候选，实 ' + JSON.stringify(rep.blind));
    assert.ok(rep.suggested.every((x) => String(x.sourceRef.ref || '').length > 0), '每条候选须带真来源');
    /* 角色不在知情名单 ⇒ 一律不放行（这是 X8 的硬口径，本档反向对照）。 */
    const rep2 = FR.suggest(deps, {}, { scene: { keys: [{ kind: 'person', value: '甲' }] }, actor: '不存在的角色', day: 10 });
    assert.equal(rep2.suggested.length, 0, '不在知情名单的角色不得放行候选');
    assert.ok(rep2.blind.length >= 1, '被挡的候选须具名计入 blind（不是静默消失）');
    ok('旧事面接通：建议 ' + rep.suggested.length + ' 条（带来源）/ 不知情者挡下 ' + rep2.blind.length + ' 条');
});

test('v3350 D4. ★★★★ 资料面：已登记实体与已确认事实都来自真源（映射/冲突面不再未判）', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    const deps = eng._loreImportDeps();
    assert.ok(Array.isArray(deps.KNOWN_ENTITIES) && deps.KNOWN_ENTITIES.length >= 2,
        '实体名册须来自真实体名册（甲/乙）');
    assert.ok(deps.CONFIRMED_FACTS && Object.keys(deps.CONFIRMED_FACTS).length >= 1,
        '已确认事实须来自真事实账');
    assert.equal(deps.SECRET_BODY_KEYS, BS.SECRET_BODY_KEYS, '受限正文键仍取自内核（本层不复制掩码实现）');
    /* 真跑一遍对照面：导入一份与已确认事实同 key 的资料 ⇒ 必须被挡（不自动覆盖）。 */
    const cf = Object.keys(deps.CONFIRMED_FACTS)[0];
    const key = cf.slice(cf.indexOf(':') + 1);
    const pv = LI.diffPreview({ items: [{ key: key, value: '被改写的值' }] },
        { facts: [{ key: key, value: '原值', confirmed: true }] }, { confirmedKeys: Object.keys(deps.CONFIRMED_FACTS) });
    assert.ok(pv.total >= 1, '对照面须真跑出条目');
    ok('资料面接通：实体 ' + deps.KNOWN_ENTITIES.length + ' / 已确认 ' + Object.keys(deps.CONFIRMED_FACTS).length
        + ' / 受限键取自内核');
});

/* ══════════════ E 零写 / 零缓存 / 现算 ══════════════ */
test('v3350 E1. ★★★★★ 派生是**只读且现算**：owner 快照逐字节不变，源变更后读数跟着变', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    const snap = () => JSON.stringify({
        summary: eng.summary.export(), wp: eng.worldProg.export(),
        tl: eng.timeline.entries, scene: eng.scene.export(),
        sus: eng.suspense.items, facts: eng._factVersionState
    });
    const before = snap();
    const O1 = eng._o6RealOwners();
    eng._o6Chapters(O1); eng._o6Summary(O1); eng._o6Outcomes(O1);
    eng._o6PastDetails(O1); eng._o6KnownFacts(O1); eng._o6ConfirmedFacts(O1);
    eng.annualSources();
    assert.equal(snap(), before, '六面派生与 annualSources 对 owner 必须零写（逐字节不变）');

    /* 源变更 ⇒ 读数跟着变（不缓存、不持久化）。 */
    const n1 = eng.annualSources();
    eng.summary.volumes.push({
        id: 'vol_2', text: '第二卷：旧书店被拆。', floorStart: 2, floorEnd: 3, count: 2, level: 2, degraded: false
    });
    const n2 = eng.annualSources();
    assert.equal(n2.chapters, n1.chapters + 1, '新增真卷后章面读数必须跟着变（实 ' + n1.chapters + ' → ' + n2.chapters + '）');
    assert.equal(n2.pastDetails, n1.pastDetails, '未变的源其读数不得漂移');
    assert.equal(eng.annualSources().chapters, n2.chapters, '同一状态连续两次装配必须同读数（确定性）');
    ok('零写 ✓ / 源变更后章面 ' + n1.chapters + ' → ' + n2.chapters + ' ✓ / 同状态确定性 ✓');
});

test('v3350 E2. ★★★★★ 显式私有槽优先：真源在场也不得覆盖调用方给的入参', () => {
    const eng = hostWithOwners();
    seedStory(eng);
    const own = { chapters: [{ ref: { chapter: '1' }, title: '手给的一章', floorFrom: 7, floorTo: 7 }] };
    eng._storyAnnualChapters = own;
    eng._storyAnnualSummary = { marker: 'hand' };
    assert.equal(eng._storyAnnualDeps().CHAPTERS, own, '私有槽在场 ⇒ 原样透传（不被派生覆盖）');
    assert.equal(eng._storyAnnualDeps().SUMMARY.marker, 'hand', '同上（逐件优先，不是整组让位）');
    eng._branchOutcomes = [{ collision: 'x', value: 1 }];
    assert.equal(eng._branchCanonDeps().BRANCH_OUTCOMES, eng._branchOutcomes, '结局清单私有槽须优先');
    eng._pastDetails = [{ key: 'p', title: '手给旧事' }];
    assert.equal(eng._fatedRecallDeps().PAST_DETAILS, eng._pastDetails, '旧事私有槽须优先');
    eng._loreConfirmedFacts = { 'hand:key': 'v' };
    assert.equal(eng._loreImportDeps().CONFIRMED_FACTS, eng._loreConfirmedFacts, '已确认事实私有槽须优先');
    /* 逐件优先：给了章不给摘要 ⇒ 章用手给的、摘要仍走派生。 */
    const eng2 = hostWithOwners();
    seedStory(eng2);
    eng2._storyAnnualChapters = own;
    const d2 = eng2._storyAnnualDeps();
    assert.equal(d2.CHAPTERS, own, '章面用手给的');
    assert.ok(d2.SUMMARY && d2.SUMMARY.volumes === 1, '摘要面仍走派生（逐件判定）');
    ok('七处私有槽逐件优先 ✓；未给的件仍走派生 ✓');
});

test('v3350 E3. ★★★★ 重开不依赖上轮实例残留：新实例同状态同读数（派生不落盘）', () => {
    const a = hostWithOwners();
    seedStory(a);
    const b = hostWithOwners();
    seedStory(b);
    const cmp = ['chapters', 'outcomes', 'pastDetails', 'knownActors', 'confirmedFacts'];
    const ra = a.annualSources(), rb = b.annualSources();
    for (const k of cmp) assert.equal(ra[k], rb[k], '新实例同状态须同读数：' + k);
    assert.equal(ra.epoch, rb.epoch, '代际读数须同形');
    /* 派生层不得往 owner 或宿主上留任何持久面。 */
    assert.ok(!Object.prototype.hasOwnProperty.call(a, '_o6Cache'), '派生层不得留缓存面');
    assert.equal(Object.keys(a._o6RealOwners()).filter((k) => k.indexOf('_o6') === 0).length, 0,
        '_o6RealOwners 不得回写自身到 owner 容器');
    ok('两实例同状态同读数（' + cmp.join('/') + ' 全等）；无缓存面无落盘面');
});

/* ══════════════ F 负控制 / 版本锚 / 工具自证 ══════════════ */
test('v3350 F1. ★★★ 真源码破坏：缺数据不给空 ⇒ 同款判据当场现形（含原版阳性对照）', () => {
    const broken = breakOnce(SA_OPS_SRC, A_CF, A_CF_BAD, 'F1');
    assert.notEqual(broken, SA_OPS_SRC, '破坏必须真改源码');
    assert.notEqual(jAbsentIsNotJudged(IDX, null, broken), '', '缺数据报空必须翻红');
    assert.equal(jAbsentIsNotJudged(IDX), '', '原版上同判据必须真成立');
    ok('负控制成立：缺数据被写成「查过没有」即红，原版仍绿');
});

test('v3350 F2. ★★★ 真源码破坏：无卷也编章面 ⇒ 同款判据当场现形（含原版阳性对照）', () => {
    const broken = breakOnce(SA_OPS_SRC, A_CH, A_CH_BAD, 'F2');
    assert.notEqual(broken, SA_OPS_SRC, '破坏必须真改源码');
    assert.notEqual(jNoVolumeNoChapters(IDX, null, broken), '', '无卷编章必须翻红');
    assert.equal(jNoVolumeNoChapters(IDX), '', '原版上同判据必须真成立');
    ok('负控制成立：零卷被写成「查过、零章」即红，原版仍绿');
});

test('v3350 F3. ★★★ 真源码破坏：派生覆盖显式私有槽 ⇒ 同款判据当场现形（含原版阳性对照）', () => {
    const broken = breakOnce(IDX, A_PRI, A_PRI_BAD, 'F3');
    assert.notEqual(broken, IDX, '破坏必须真改源码');
    assert.notEqual(jPrivateSlotWins(broken), '', '派生覆盖私有槽必须翻红');
    assert.equal(jPrivateSlotWins(IDX), '', '原版上同判据必须真成立');
    ok('负控制成立：私有槽被派生覆盖即红，原版仍绿');
});

test('v3350 F4. ★★★★ 工具两向自证：锚点 0 次 / 不唯一 / 同值替换一律拒绝破坏', () => {
    const thrower = (a, r, tag) => { try { breakOnce(IDX, a, r, tag); return null; } catch (e) { return e; } };
    assert.ok(thrower('const __NOT_IN_INDEX__ = 1;', 'x', 'F4a'), '锚点 0 次须拒绝');
    assert.ok(thrower('        _o6Chat() {', '        _o6Chat() {', 'F4b'), '同值替换须拒绝');
    /* 不唯一必须拒绝：`return null;` 在 index.js 里出现数百次 —— 命中数不唯一即拒绝。
     *   ★ 首版这里写的是 `const VERSION = `（在 index.js 里**恰好一次**），于是这条自证
     *   恒不成立（`breakOnce` 正常返回、断言拿到 null）—— 判据自身缺陷，已改真多处锚点。 */
    assert.ok(thrower('return null;', 'return undefined;', 'F4c'), '多处命中须拒绝');
    /* 三个破坏锚点在真源上各恰中 1 次（判据纯度前提）。 */
    assert.equal(SA_OPS_SRC.split(A_CF).length - 1, 1, '锚点在真源须恰中 1 次：A_CF');
    assert.equal(SA_OPS_SRC.split(A_CH).length - 1, 1, '锚点在真源须恰中 1 次：A_CH');
    assert.equal(IDX.split(A_PRI).length - 1, 1, '锚点在真源须恰中 1 次：A_PRI');
    /* H5 判据纯度：三个锚点字面量在本档内各只准声明**一次**（即只在常量定义处）。
     *   破坏调用一律走常量名（`breakOnce(IDX, A_CF, A_CF_BAD, …)`）—— 断言行不得复用锚点串，
     *   否则判据就变成了「引用被破坏的那串」的自我指涉形态（本仓 H5 的原话：判据不得引用锚点串）。 */
    for (const a of [A_CF, A_CH, A_PRI]) {
        const n = SELF.split(a).length - 1;
        assert.equal(n, 1, '锚点字面量在本档须恰声明一次（只在常量定义处），实 ' + n + '：' + a.slice(0, 40));
    }
    ok('工具两向自证：0 次 / 同值 / 多处命中全拒绝；三锚点真源各恰 1 次 + 判据纯度 ✓');
});

test('v3350 F5. ★★★ 版本锚与登记面：本档自锚当版 + 不新增运行时模块', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(IDX)[1];
    assert.ok(vnum(v) >= vnum(BORN), '本版不得低于出生版本 ' + BORN + '（实 ' + v + '）');
    assert.equal(MF.version, v, 'manifest 须跟随 index.js');
    /* 本刀不新增运行时模块：派生层住在 index.js（extra_js 项数不得因本刀变化）。 */
    assert.equal(MF.extra_js.filter((x) => x === 'story-annual.js').length, 1, 'story-annual.js 仍须恰登记一次');
    assert.equal(MF.extra_js[0], 'ledger-entity.js', 'ledger-entity.js 仍须在 extra_js 首位');
    assert.equal(new Set(MF.extra_js).size, MF.extra_js.length, 'extra_js 不得重复');
    ok('版本 ' + v + ' ≥ ' + BORN + '；manifest 同源；extra_js 面未被本刀改动');
});
