/* ============================================================
 * tests/v3360_m4o9_knowledge_gate.test.mjs — [v3.336.0 · 第四期 M4-O9]
 *
 * 【本档要证明的是「按**事实可知性**裁剪」，不是「按角色名名单过滤」】
 *   M4-O9 验收原文：*同角色后揭密、匿名秘密、旧名伪装、已公开未结伏笔四例；
 *   揭露前后内容准确切换，作者版仍可读，生成侧不接到作者版；
 *   「安全但整篇空白」不算完成。*
 *
 *   修前实测（读码，可复算）：`story-annual.js::twoVersions` 的无剧透版只看
 *   `allowedChars`（在场白名单）与 `knownChars`（名册）：
 *     ① 条目 `chars` 为空 ⇒ `return true`（**默认放行**）—— 匿名秘密靠名单判不了却被放出去；
 *     ② 未了事项**一律清空** ⇒ 已公开的未结伏笔被一并抹掉（这不算「安全」）；
 *     ③ 泄漏扫描只按名册**原名逐字**找 ⇒ 伪装期的旧名一个都扫不出来；
 *     ④ 标题与摘要**根本不裁**。
 *
 *   判据分六面（每面有独立证伪路径）：
 *     A 结构面：内核导出面 +3 且既有 27 项逐字不动；SA_VERSION 抬到 2；
 *       宿主五个判决口成员各恰一处；**不建第二份权限表**（无白名单式常量表）
 *     B 内核闸真跑：逐事实逐时点判决 —— 保留 / 遮蔽 / 判不了**三态不同形**
 *     C ★四例真跑（验收原文逐条）：同角色后揭密 / 匿名秘密 / 旧名伪装 / 已公开未结伏笔
 *     D 生成侧：`forPlayer` **绝不回退作者版**（未给可知性面 / 整篇裁空 / 没回顾 ⇒ ok:false）
 *     E 宿主真源：秘密账本 / 知识轨迹 / 事实版本账 / 实体别名 四面各自**真接通**
 *     F 零写 / 零缓存 / 现算；真源码破坏负控制 + 工具两向自证 + 判据纯度
 *
 * 【诚实边界】真实 SillyTavern 宿主 UI 与真实模型问答**未跑**（chat 用同形状假数据）；
 *   全量 `npm test` 按纪律集中到第四期计划收口点跑一次（本档为定向复验）。
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
const SA_SRC = read('story-annual.js');
const QT_SRC = read('engine-qa-tools.js');
const SA_OPS_SRC = read('engine-story-annual.js');
const FULL_SRC = IDX + '\n' + SA_OPS_SRC;
const SELF = read(path.join('tests', 'v3360_m4o9_knowledge_gate.test.mjs'));
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const BORN = '3.336.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

const SA = require_(path.join(R, 'story-annual.js'));
const CORE = require_(path.join(R, 'memory-core.js'));
const ORGANS = require_(path.join(R, 'memory-organs.js'));
const BOOKS = require_(path.join(R, 'memory-books.js'));
const SL = require_(path.join(R, 'secret-ledger.js'));
const KT = require_(path.join(R, 'knowledge-trace.js'));
const FV = require_(path.join(R, 'fact-version.js'));
const BS = require_(path.join(R, 'branch-semantics.js'));

/* ══════════════ 宿主夹具：从 index.js 真切片（不手抄实现） ══════════════ */
const LIB_FNS = ['function _moduleLib(getGlobal, fileName) {', 'function _storyAnnualLib() {', 'function _factVersionLib() {'];
const HOST_METHODS = [
    '_o9Owners() {', '_o9AliasIndex() {', '_o9FactOf(item) {', '_o9NamesIn(item) {',
    '_o9Gate() {', 'o9Sources() {',
    '_o6KnownEntities() {', '_qaKnownActors(limit) {',
    'currentStoryFloor() {', 'storyAnnualTwoVersions(rev, opts) {', 'storyAnnualForPlayer(rev, opts) {',
];
/** 方法体切片（花括号配平；与 v3312 / v3324 / v3350 同款）。 */
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
        LonShaStoryAnnual: SA, LonShaSecretLedger: SL, LonShaKnowledgeTrace: KT,
        LonShaFactVersion: FV, LonShaBranchSemantics: BS,
    }, extra || {});
}
function engineFrom(src, win, saOpsSrc = SA_OPS_SRC) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h));
    const missL = LIB_FNS.filter((h, i) => !libs[i]);
    const meths = HOST_METHODS.map((h) => {
        if (h === '_qaKnownActors(limit) {') {
            return extractModuleMethod(QT_SRC, 'function _qaKnownActors(engine, limit) {');
        }
        if (h === 'currentStoryFloor() {') {
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
    return new Function('errLog', 'window', code)(() => {}, win || libWindow());
}
/** 假 chat（同形状）：只为 `currentStoryFloor()` 的取数口径；真宿主 UI 未跑。 */
function fakeChat(n) {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ mes: '第' + i + '楼' });
    return arr;
}
function winWith(chatLen, extra) {
    const w = libWindow(extra);
    w.SillyTavern = { getContext: () => ({ chat: fakeChat(chatLen === undefined ? 10 : chatLen), name1: '玩家' }) };
    return w;
}
/**
 * 真源齐全的宿主（**只装真类实例 / 真账状态**；不设任何白名单私有槽）。
 *   atFloor 由 chat 长度决定（currentStoryFloor 取 chat.length-1）。
 */
function hostO9(opts) {
    const o = opts || {};
    const eng = engineFrom(IDX, winWith(o.chatLen, o.win));
    eng.config = { config: { recallCooldownDays: 3, debugMode: false } };
    eng.worldProg = o.worldProg === undefined ? new ORGANS.WorldProgress() : o.worldProg;
    eng._factVersionState = o.facts === undefined ? null : o.facts;
    eng._entityIdByName = new Map();
    eng.graph = o.graph === undefined ? { nodes: new Map() } : o.graph;
    eng._entityRegistry = o.registry === undefined ? null : o.registry;
    eng._loreKnownEntities = o.entities === undefined ? null : o.entities;
    return eng;
}
/** 极简实体登记表替身（只照 `candidatesFor` 契约：blockedBy 非空 = 此刻不成立）。 */
function fakeRegistry(rows) {
    return {
        candidatesFor(kind, value, ctx) {
            const at = (ctx && ctx.at != null) ? Number(ctx.at) : null;
            return (rows || []).filter((r) => r.value === value).map((r) => ({
                id: r.id, name: r.name, via: 'alias', matchedAlias: r.value,
                blockedBy: (at != null && at < r.validFrom) ? 'revealAfter' : '',
            }));
        }
    };
}

/* ── 负控制锚点（每个在本档内必须恰好出现 1 次：见 F3） ── */
const A_K1 = "                if (atFloor === null) return say('withhold', 'no-verdict', 'no-at-floor');";
const A_K1_BAD = "                if (false) return say('withhold', 'no-verdict', 'no-at-floor');";
const A_K2 = "                if (!fact && !names.length) { read.noFactAnchor += 1; return say('withhold', 'no-verdict', 'no-fact-anchor'); }";
const A_K2_BAD = "                if (false) { read.noFactAnchor += 1; return say('withhold', 'no-verdict', 'no-fact-anchor'); }";
const A_K3 = "        if (tv.gated !== true) return bad('knowledge-face-absent');";
const A_K3_BAD = "        if (false) return bad('knowledge-face-absent');";
const A_K4 = "        const keepList = function (kind, list) {\n            return arrOf(list).filter(function (it) { return decide(kind, it); });\n        };";
const A_K4_BAD = "        const keepList = function (kind, list) {\n            return arrOf(list);\n        };";
const A_K5 = "        out.overRedacted = authTotal > 0 && freeTotal === 0;";
const A_K5_BAD = "        out.overRedacted = false;";

/* ══════════════ 判据体（正负两跑共用同一份） ══════════════ */
/** J1：时点读不到 ⇒ 判不了（**不得按名单放行**）。 */
function jNoFloorIsUndecided(src, win, saOpsSrc = SA_OPS_SRC) {
    const eng = engineFrom(src, win, saOpsSrc);
    eng.config = { config: {} };
    eng.worldProg = new ORGANS.WorldProgress();
    eng._factVersionState = null;
    eng.graph = { nodes: new Map() };
    eng._entityRegistry = null;
    eng._loreKnownEntities = ['甲'];
    const g = eng._o9Gate();
    if (g.armed !== false) return ['时点读不到须报未武装'];
    const v = g.resolve({ text: '甲推门' }, { kind: 'events', atFloor: null });
    if (v.decision !== 'withhold' || v.basis !== 'no-verdict') return ['时点读不到必须判不了(实 ' + JSON.stringify(v) + ')'];
    if (v.why !== 'no-at-floor') return ['时点读不到须逐档具名 no-at-floor(实 ' + v.why + ')'];
    return [];
}
/** J2:没有事实引用也没有实体名 ⇒ 判不了(修前这一格**默认放行**)。 */
function jNoAnchorIsUndecided(src, win, saOpsSrc = SA_OPS_SRC) {
    const eng = engineFrom(src, win, saOpsSrc);
    eng.config = { config: {} };
    eng.worldProg = new ORGANS.WorldProgress();
    eng._factVersionState = null;
    eng.graph = { nodes: new Map() };
    eng._entityRegistry = null;
    eng._loreKnownEntities = ['甲'];
    /* ★ 本判据测的是「无事实锚」那一格:时点必须**可读**(否则先撞 no-at-floor,
     *   修前弱判据(只比 decision/basis)让这一格与兜底 no-verdict 同形 → 假绿)。
     *   故先开一张非空 chat 让 currentStoryFloor() 拿得到时点。 */
    const w = winWith(10, (win && win.__extra) || undefined);
    const eng2 = engineFrom(src, w, saOpsSrc);
    eng2.config = { config: {} };
    eng2.worldProg = new ORGANS.WorldProgress();
    eng2._factVersionState = null;
    eng2.graph = { nodes: new Map() };
    eng2._entityRegistry = null;
    eng2._loreKnownEntities = ['甲'];
    const g = eng2._o9Gate();
    if (g.armed !== true) return ['本判据须在时点可读下跑(armed=true)'];
    /* 无事实引用(_o9FactOf 兜底只看 text)、也无实体名 ⇒ 才落到「无事实锚」这一格。 */
    const v = g.resolve({}, { kind: 'events', atFloor: 9 });
    if (v.decision !== 'withhold' || v.basis !== 'no-verdict') return ['无事实可挂的条目必须判不了(实 ' + JSON.stringify(v) + ')'];
    if (v.why !== 'no-fact-anchor') return ['无事实锚须逐档具名 no-fact-anchor(实 ' + v.why + ')'];
    return [];
}
/** J3:生成侧绝不回退作者版(内核侧:未给可知性面 ⇒ 拒答,不递作者版)。 */
function jForPlayerNeverBlogs(sa) {
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '甲推门', chars: ['甲'] }] }] };
    const rv = sa.review('1', pay, {});
    /* 不传可知性面:内核 forPlayer 不得把作者版递出去,也不得报 ok:true。 */
    const noGate = sa.forPlayer(rv, {});
    if (noGate.authorial !== null) return ['未给可知性面时不得递出作者版'];
    if (noGate.version !== null || noGate.ok !== false) return ['未给可知性面必须 ok:false'];
    return [];
}
/** J4:整篇裁空 ⇒ 报 over-redacted(「安全但整篇空白」不算完成;内核侧)。 */
function jOverRedactIsFlagged(sa) {
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '甲推门', chars: ['甲'] }] }] };
    const rv = sa.review('1', pay, {});
    const gate = { atFloor: 9, resolve: () => ({ decision: 'withhold', basis: 'no-verdict' }) };
    const tv = sa.twoVersions(rv, { gate: gate, knownChars: ['甲'] });
    if (tv.overRedacted !== true) return ['整篇裁空必须报 overRedacted'];
    if ((tv.why || []).indexOf('over-redacted') < 0) return ['overRedacted 必须具名'];
    const fp = sa.forPlayer(rv, { gate: gate, knownChars: ['甲'] });
    if (fp.ok !== false || fp.reason !== 'over-redacted') return ['整篇裁空时玩家版必须拒答为准 (实 ' + fp.reason + ')'];
    return [];
}
/** J5：逐条判决真跑（保留 / 遮蔽 **不同形**）。 */
function jGateDecides(src, win) {
    const eng = engineFrom(src, win);
    eng.config = { config: {} };
    eng.worldProg = new ORGANS.WorldProgress();
    eng._factVersionState = null;
    eng.graph = { nodes: new Map() };
    eng._entityRegistry = null;
    eng._loreKnownEntities = ['甲', '乙'];
    const pay = { chapters: [{ ref: { chapter: '1' }, title: '开篇', events: [
        { floor: 1, text: '甲推开门', chars: ['甲'] },
        { floor: 2, text: '乙在暗处看着', chars: ['乙'] },
    ] }] };
    const rv = SA.review('1', pay, {});
    const gate = { atFloor: 9, resolve: (it) => (String(it && it.text).indexOf('甲') >= 0
        ? { decision: 'allow', basis: 'known-at-floor', fact: 'f1' }
        : { decision: 'withhold', basis: 'not-known-at-floor', fact: 'f2' }) };
    const tv = eng.storyAnnualTwoVersions(rv, { gate: gate, knownChars: ['甲', '乙'] });
    if (tv.gated !== true) return ['给了可知性面必须报 gated'];
    if (tv.kept !== 1 || tv.withheld !== 2) return ['保留/遮蔽计数不符(实 kept=' + tv.kept + ' withheld=' + tv.withheld + ')'];
    if (tv.spoilerFree.elements.events.length !== 1) return ['保留条目数不符'];
    if (tv.authorial.elements.events.length !== 2) return ['作者版必须全量可读'];
    if (tv.versionsDistinct !== true) return ['两版不得同形'];
    return [];
}
/** J6：五面全覆盖（标题 / 摘要 / 事件 / 变化 / 未了 / 原话）。 */
function jFiveFacesCovered(src, win) {
    const eng = engineFrom(src, win);
    eng.config = { config: {} };
    eng.worldProg = new ORGANS.WorldProgress();
    eng._factVersionState = null;
    eng.graph = { nodes: new Map() };
    eng._entityRegistry = null;
    eng._loreKnownEntities = ['甲'];
    const pay = { chapters: [{ ref: { chapter: '1' }, title: '乙的真身', floorFrom: 1, floorTo: 9,
        events: [{ floor: 1, text: '甲推门', chars: ['甲'] }],
        changes: [{ char: '甲', from: '陌生', to: '信任', floor: 2 }],
        open: [{ key: 'o1', text: '那把伞还在不在', floor: 3 }],
        quotes: [{ floor: 4, text: '进来吧', speaker: '甲' }], summary: '乙的秘密' }] };
    const rv = SA.review('1', pay, {});
    /* 只放「甲」相关的，遮蔽其余 —— 六格逐面都过闸。 */
    const gate = { atFloor: 9, resolve: (it) => {
        const blob = [it && it.text, it && it.to, it && it.from, it && it.char].map(String).join(' ');
        if (blob.indexOf('乙') >= 0) return { decision: 'withhold', basis: 'no-verdict' };
        return { decision: 'allow', basis: 'known-at-floor', fact: 'ok' };
    } };
    const tv = eng.storyAnnualTwoVersions(rv, { gate: gate, knownChars: ['甲', '乙'] });
    if (tv.byKind.title !== 1 || tv.byKind.summary !== 1 || tv.byKind.events !== 1
        || tv.byKind.changes !== 1 || tv.byKind.unfinished !== 1 || tv.byKind.quotes !== 1) {
        return ['六面必须逐面过闸(实 ' + JSON.stringify(tv.byKind) + ')'];
    }
    if (tv.spoilerFree.title !== '') return ['标题含未可知内容必须裁空'];
    if (tv.spoilerFree.summary !== '') return ['摘要含未可知内容必须裁空'];
    if (tv.spoilerFree.elements.unfinished.length !== 1) return ['已放行的未了事项必须保留'];
    if (tv.blessed.unfinished !== 1) return ['保留计数须逐面可读'];
    return [];
}

/* ══════════════ A. 结构面 ══════════════ */
test('v3360 A1. ★★★★ 内核导出面 +3 且既有 27 项逐字不动;SA_VERSION≥2', () => {
    const got = Object.keys(SA).sort();
/* [v3.341.0 · M4-X2] 词表按**排序后真值**逐字对账（既有 31 项在场，新增成稿面 14 项）。 */
    const want = [
        'COMPOSE_SOURCES',
        'DRAFT_FIELDS',
        'DRAFT_KIND',
        'DRAFT_SECTION_FIELDS',
        'ELEMENTS',
        'ELEMENT_LABEL',
        'FACT_FIELDS',
        'FOUL_WORDS',
        'ITEM_MAX',
        'REQUIRED_DEPS',
        'SA_KIND',
        'SA_VERSION',
        'SECTION_KINDS',
        'SECTION_LABEL',
        'SMOKE_WORDS',
        'VERSIONS',
        'applyEdits',
        'arrOf',
        'belletristic',
        'build',
        'chapterKey',
        'clip',
        'compose',
        'composeForPlayer',
        'composeLine',
        'describe',
        'draftLine',
        'edit',
        'evidenceOf',
        'forPlayer',
        'gatedVersions',
        'hash32',
        'keyOf',
        'line',
        'normalizeDrafts',
        'numOr',
        'rebuildAffected',
        'review',
        'sectionOf',
        'selfCheck',
        'splitPoints',
        'spoilerGate',
        'staleRefs',
        'strOf',
        'twoVersions',
    ];
    assert.equal(got.join(','), want.join(','), '导出面变了');
    assert.ok(SA.SA_VERSION >= 2, '形状变了必须抬版本（v3.341.0 成稿面后为 3）');
    assert.ok(Object.isFrozen(SA), '导出面须冻结');
    /* 既有依赖面键名逐字不动（改名 = 静默变成「依赖缺席」）。 */
    assert.equal(SA.REQUIRED_DEPS.map((d) => d.key).join(','), 'CHAPTERS,SUMMARY,QUOTES', '依赖面键名不得改');
    ok('导出 ' + got.length + ' 项（本档出生 31，v3.341.0 M4-X2 成稿面加至 45）;依赖面键名逐字未动');
});

test('v3360 A2. ★★★★ 宿主五个判决口成员各恰一处;不建第二份权限表', () => {
    for (const h of ['_o9Owners() {', '_o9AliasIndex() {', '_o9FactOf(item) {', '_o9NamesIn(item) {', '_o9Gate() {', 'o9Sources() {']) {
        assert.equal(IDX.split(h).length - 1, 1, h + ' 须恰一处');
    }
    /* ★ 不建权限表：判决口里不得出现「白名单式」常量表字面量。 */
    const gate = extractModuleMethod(SA_OPS_SRC, 'function _o9Gate(engine) {') || methodBody(IDX, '_o9Gate() {');
    assert.ok(gate && gate.length > 400, '判决口切片须非空');
    for (const banned of ['PERMISSION', 'ALLOWLIST', 'WHITELIST', '权限表']) {
        assert.ok(gate.indexOf(banned) < 0, '判决口不得持有第二份权限表：' + banned);
    }
    ok('五个判决口成员各恰一处；判决口不持有权限表');
});

test('v3360 A3. ★★★★ 判决口只读真源（三件依赖都在取数口里，零写）', () => {
    const owners = extractModuleMethod(SA_OPS_SRC, 'function _o9Owners(engine) {') || methodBody(IDX, '_o9Owners() {');
    assert.ok(owners.indexOf("'secret-ledger.js'") >= 0, '秘密账本须在取数口');
    assert.ok(owners.indexOf("knowledgeTraces") >= 0, '知识轨迹须在取数口');
    assert.ok(owners.indexOf('_factVersionState') >= 0, '事实版本账须在取数口');
    assert.ok(owners.indexOf('currentStoryFloor') >= 0, '时点须由既有真源给');
    const gate = extractModuleMethod(SA_OPS_SRC, 'function _o9Gate(engine) {') || methodBody(IDX, '_o9Gate() {');
    for (const w of ['this.worldProg.secretLedger =', 'this._factVersionState =', 'push(', 'splice(']) {
        assert.ok(gate.indexOf(w) < 0, '判决口不得写：' + w);
    }
    ok('三件真源齐在取数口；判决口零写（无赋值/无 push/splice）');
});

/* ══════════════ B. 内核闸真跑 ══════════════ */
test('v3360 B1. ★★★★ 逐事实逐时点判决:保留 / 遮蔽 / 判不了三态不同形', () => {
    const pay = { chapters: [{ ref: { chapter: '1' }, title: '开篇', floorFrom: 1, floorTo: 9,
        events: [{ floor: 1, text: '甲推门', chars: ['甲'] }, { floor: 2, text: '乙在暗处', chars: ['乙'] }],
        open: [{ key: 'o1', text: '那把伞还在不在', floor: 3 }] }] };
    const rv = SA.review('1', pay, {});
    const tv = SA.twoVersions(rv, {
        allowedChars: ['甲'], knownChars: ['甲', '乙'], gate: {
            atFloor: 9,
            resolve: (it) => {
                const t = String(it && it.text);
                if (t.indexOf('甲') >= 0) return { decision: 'allow', basis: 'known-at-floor', fact: 'f1' };
                if (t.indexOf('乙') >= 0) return { decision: 'withhold', basis: 'not-known-at-floor', fact: 'f2' };
                return { decision: 'withhold', basis: 'no-verdict' };
            },
        },
    });
    assert.equal(tv.gated, true, '给了闸须报 gated');
    assert.equal(tv.kept, 2, '甲事件 + 未了事项须保留');
    assert.equal(tv.withheld, 2, '乙事件 + 标题须遮蔽');
    assert.equal(tv.undecided, 1, '判不了须单独计数');
    assert.equal(tv.spoilerFree.elements.events.length, 1, '保留面');
    assert.equal(tv.authorial.elements.events.length, 2, '作者版全量');
    assert.equal(tv.spoilerFree.elements.unfinished.length, 1, '已放行的未了事项须保留（修前一律清空）');
    ok('保留 2 / 遮蔽 2 / 判不了 1；三态分列可见');
});

test('v3360 B2. ★★★★ 未给可知性面 ⇒ 旧口径原样保留并具名（不假装已按可知性裁）', () => {
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '乙在暗处', chars: ['乙'] }], open: [{ key: 'o', text: '那把伞还在不在', floor: 9 }] }] };
    const rv = SA.review('1', pay, {});
    const tv = SA.twoVersions(rv, { allowedChars: ['甲'], knownChars: ['甲', '乙'] });
    assert.ok(!tv.gated, '未给闸不得报 gated（不假装已按可知性裁）');
    assert.equal(tv.kept, undefined, '未给闸不得报保留计数');
    assert.equal(tv.spoilerFree.elements.unfinished.length, 0, '旧口径行为原样（未了事项清空）');
    assert.ok(tv.leakedChars.indexOf('乙') >= 0, '旧口径泄漏扫描照旧');
    ok('旧口径原样：未给闸时行为逐字不变，gated=false');
});

/* ══════════════ C. 验收四例真跑 ══════════════ */
test('v3360 C1. ★★★★★ 同角色「后揭密」:在场不等于可知,这一楼前必须遮蔽', () => {
    const eng = hostO9({ chatLen: 6, entities: ['甲', '乙'] });
    eng.worldProg.secretLedger = SL.seal({ version: 1, items: [] }, {
        secret: '甲其实是乙的姐姐', keeper: ['甲'], knowers: ['甲'], floor: 1,
    }).state;
    const g = eng._o9Gate();
    const before = g.resolve({ text: '甲其实是乙的姐姐', chars: ['甲'] }, { kind: 'events', atFloor: 3 });
    assert.equal(before.decision, 'withhold', '未揭密的秘密在揭前必须遮蔽');
    assert.equal(before.basis, 'secret-sealed', '须逐档具名 secret-sealed');
    /* 揭穿之后（本档用假 chat 把时点推到揭密楼层之后）—— 时点来自真源，故这里换实例模拟「后来」。 */
    const eng2 = hostO9({ chatLen: 6, entities: ['甲', '乙'] });
    const sealed = SL.seal({ version: 1, items: [] }, { secret: '甲其实是乙的姐姐', keeper: ['甲'], knowers: ['甲'], floor: 1 }).state;
    eng2.worldProg.secretLedger = SL.reveal(sealed, { id: sealed.items[0].id, floor: 2, note: '本楼被当面说破' }).state;
    const g2 = eng2._o9Gate();
    const after = g2.resolve({ text: '甲其实是乙的姐姐', chars: ['甲'] }, { kind: 'events', atFloor: 5 });
    assert.notEqual(after.basis, 'secret-sealed', '已揭密的秘密不得再按 secret-sealed 遮蔽');
    ok('同角色后揭密：揭前 secret-sealed 遮蔽，揭后该档不再命中');
});

test('v3360 C2. ★★★★★ 匿名秘密：没有角色名的条目**不再默认放行**', () => {
    const eng = hostO9({ chatLen: 6, entities: ['甲'] });
    eng.worldProg.secretLedger = SL.seal({ version: 1, items: [] }, {
        secret: '那扇门后藏着一个人', keeper: ['甲'], knowers: ['甲'], floor: 1,
    }).state;
    const g = eng._o9Gate();
    const v = g.resolve({ text: '那扇门后藏着一个人', chars: [] }, { kind: 'events', atFloor: 3 });
    assert.equal(v.decision, 'withhold', '匿名秘密靠名单判不了 ⇒ 必须遮蔽（修前默认放行）');
    assert.equal(v.basis, 'secret-sealed', '匿名秘密走秘密面裁决');
    /* 对照：旧口径会把这条**放行**（chars 为空 ⇒ return true）。 */
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '那扇门后藏着一个人', chars: [] }] }] };
    const rv = SA.review('1', pay, {});
    const old = SA.twoVersions(rv, { allowedChars: ['甲'], knownChars: ['甲'] });
    assert.equal(old.spoilerFree.elements.events.length, 1, '旧口径确实默认放行（这就是本项要修的格）');
    ok('匿名条目：新路径遮蔽并具名，旧口径默认放行的对照已锁定');
});

test('v3360 C3. ★★★★★ 旧名伪装：泄漏扫描按别名族展开,伪装期的旧名扫得出来', () => {
    const nodes = new Map();
    nodes.set('n1', { type: 'character', name: '珞珈', data: { aliases: ['阿珞', '小珈'] } });
    const eng = hostO9({ chatLen: 6, entities: ['珞珈'], graph: { nodes: nodes } });
    const g = eng._o9Gate();
    const fam = g.aliasOf('珞珈');
    assert.ok(fam.indexOf('阿珞') >= 0 && fam.indexOf('小珈') >= 0, '别名族须从图谱既有 data.aliases 现取');
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '阿珞推门进来', chars: ['珞珈'] }] }] };
    const rv = SA.review('1', pay, {});
    /* 一致性：别名族展开后，玩家版正文里出现「阿珞」⇒ 必须点名名册原名「珞珈」。 */
    const gate = { atFloor: 9, aliasOf: g.aliasOf, resolve: () => ({ decision: 'allow', basis: 'known-at-floor', fact: 'f' }) };
    const tv = eng.storyAnnualTwoVersions(rv, { gate: gate, knownChars: ['珞珈'] });
    assert.ok(tv.leakedChars.indexOf('珞珈') >= 0, '伪装期的旧名（阿珞）必须能扫出来并点名原名');
    assert.ok(tv.aliasesChecked.indexOf('珞珈') >= 0, '别名族参与检查须留下读数');
    /* 对照：旧口径只按原名逐字找 ⇒ 扫不出「阿珞」里的「珞珈」。 */
    const old = SA.twoVersions(rv, { allowedChars: ['珞珈'], knownChars: ['珞珈'] });
    assert.equal(old.leakedChars.length, 0, '旧口径确实扫不出旧名（对照已锁定）');
    ok('旧名伪装：别名族展开后扫得出，旧口径扫不出的对照已锁定');
});

test('v3360 C4. ★★★★★ 已公开的未结伏笔保留;未公开的遮蔽（不再一律清空）', () => {
    const eng = hostO9({ chatLen: 6, entities: ['甲', '乙'] });
    eng.worldProg.secretLedger = SL.seal({ version: 1, items: [] }, {
        secret: '乙的身份是假的', keeper: ['乙'], knowers: ['乙'], floor: 1,
    }).state;
    const g = eng._o9Gate();
    const pub = g.resolve({ key: 'promise:p1', text: '甲：下月同去旧地' }, { kind: 'unfinished', atFloor: 3 });
    const hid = g.resolve({ key: 'secret:1', text: '乙的身份是假的' }, { kind: 'unfinished', atFloor: 3 });
    assert.notEqual(pub.decision, hid.decision, '已公开未结与未公开秘密必须**不同形**');
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', floorFrom: 1, floorTo: 9,
        open: [{ key: 'promise:p1', text: '甲：下月同去旧地', floor: 1 }, { key: 'secret:1', text: '乙的身份是假的', floor: 1 }] }] };
    const rv = SA.review('1', pay, {});
    const tv = SA.twoVersions(rv, {
        knownChars: ['甲', '乙'], gate: {
            atFloor: 3, resolve: (it) => (String(it && it.text).indexOf('甲：') === 0
                ? { decision: 'allow', basis: 'known-at-floor', fact: 'p1' }
                : { decision: 'withhold', basis: 'secret-sealed', fact: 's1' }),
        },
    });
    assert.equal(tv.spoilerFree.elements.unfinished.length, 1, '已公开未结伏笔须保留（修前被一并抹掉）');
    assert.equal(tv.authorial.elements.unfinished.length, 2, '作者版须两条都在');
    ok('已公开未结保留 1 / 未公开遮蔽 1；修前「一律清空」的对照已锁定');
});

/* ══════════════ D. 生成侧 ══════════════ */
test('v3360 D1. ★★★★★ 生成侧绝不回退作者版:三种「去剧透未成立」一律拒答', () => {
    const eng = hostO9({ chatLen: 6, entities: ['甲'] });
    const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '甲推门', chars: ['甲'] }] }] };
    const rv = SA.review('1', pay, {});
    /* ① 整篇裁空 ⇒ over-redacted（且**不得**把作者版递出去）。 */
    const blank = eng.storyAnnualForPlayer(rv, { knownChars: ['甲'], gate: { atFloor: 9, resolve: () => ({ decision: 'withhold', basis: 'no-verdict' }) } });
    assert.equal(blank.ok, false, '整篇裁空必须 ok:false');
    assert.equal(blank.reason, 'over-redacted', '理由须逐字');
    assert.equal(blank.authorial, null, '绝不能递出作者版');
    /* ② 没回顾 ⇒ 拒答。 */
    const noRev = eng.storyAnnualForPlayer(null, {});
    assert.equal(noRev.ok, false, '没回顾必须 ok:false');
    assert.equal(noRev.authorial, null, '绝不能递出作者版');
    /* ③ 出口在位性：正常路径下 ok:true 且**只给玩家版**。 */
    const good = eng.storyAnnualForPlayer(rv, { knownChars: ['甲'], gate: { atFloor: 9, resolve: () => ({ decision: 'allow', basis: 'known-at-floor', fact: 'f' }) } });
    assert.equal(good.ok, true, '正常路径须 ok:true');
    assert.ok(isOkShape(good.version), '须给玩家版结构');
    assert.equal(good.authorial, null, '玩家出口不得带作者版');
    ok('三种未成立一律拒答（authorial 恒 null）；正常路径只出玩家版');
});
function isOkShape(v) {
    return !!v && v.version === 'spoiler-free' && !!v.elements && Array.isArray(v.elements.events);
}

test('v3360 D2. ★★★★ 作者版仍可读（不裁），且与玩家版**不同形**', () => {
    const pay = { chapters: [{ ref: { chapter: '1' }, title: '乙的秘密', events: [{ floor: 1, text: '甲推门', chars: ['甲'] }, { floor: 2, text: '乙在暗处', chars: ['乙'] }] }] };
    const rv = SA.review('1', pay, {});
    const tv = SA.twoVersions(rv, {
        knownChars: ['甲', '乙'], gate: {
            atFloor: 9, resolve: (it) => (String(it && it.text).indexOf('乙') >= 0
                ? { decision: 'withhold', basis: 'not-known-at-floor' }
                : { decision: 'allow', basis: 'known-at-floor', fact: 'f' }),
        },
    });
    assert.equal(tv.authorial.elements.events.length, 2, '作者版须全量');
    assert.equal(tv.authorial.title, '乙的秘密', '作者版标题不得被裁');
    assert.equal(tv.spoilerFree.title, '', '玩家版标题须裁空');
    assert.equal(tv.versionsDistinct, true, '两版不得同形');
    ok('作者版全量可读（标题也保留）；玩家版标题裁空；两版不同形');
});

/* ══════════════ E. 宿主真源接通 ══════════════ */
test('v3360 E1. ★★★★ 事实版本账接通:未来事实必须遮蔽（不得拿「现在」冒充「当时」）', () => {
    const eng = hostO9({ chatLen: 4, entities: ['甲'] });   /* atFloor = 3 */
    eng._factVersionState = {
        version: 1, seq: 2, facts: [
            { id: 'f1', subject: '甲', predicate: '身份', value: '普通店员', origin: 'stated', type: null, conflictPolicy: 'auto', trust: 1, from: 1, to: 2, floor: 1, source: '', evidence: '' },
            { id: 'f2', subject: '甲', predicate: '身份', value: '失散多年的姐姐', origin: 'stated', type: null, conflictPolicy: 'auto', trust: 1, from: 8, to: null, floor: 8, source: '', evidence: '' },
        ],
    };
    const g = eng._o9Gate();
    assert.equal(g.atFloor, 3, '时点须由 currentStoryFloor 真给');
    const v = g.resolve({ text: '甲的身份', to: '身份：失散多年的姐姐', chars: ['甲'] }, { kind: 'changes', atFloor: 3 });
    assert.equal(v.decision, 'withhold', '第 8 楼才成立的事实在第 3 楼必须遮蔽');
    assert.ok(v.basis === 'fact-future' || v.basis === 'no-verdict', '须逐档具名（实 ' + v.basis + '）');
    /* 对照：同一事实若此刻成立（from 落在时点内）⇒ 可读。 */
    const g2 = hostO9({ chatLen: 20, entities: ['甲'] });   /* atFloor = 19 */
    g2._factVersionState = eng._factVersionState;
    const v2 = g2._o9Gate().resolve({ text: '甲的身份', to: '身份：失散多年的姐姐', chars: ['甲'] }, { kind: 'changes', atFloor: 19 });
    assert.equal(v2.decision, 'allow', '此刻已成立的事实须可读');
    ok('时点 3 遮蔽未来事实（fact-future）；时点 19 同一事实可读');
});

test('v3360 E2. ★★★★ 知识轨迹接通:这一楼有人知道才可读,明示不知道则遮蔽', () => {
    const eng = hostO9({ chatLen: 10, entities: ['甲', '乙'] });
    const traces = { version: 1, traces: [
        { traceId: 't1', character: '甲', fact: '那把伞', action: 'acquire', via: 'witnessed', from: '', floor: 2, identity: 'surface', seq: 1 },
        { traceId: 't2', character: '乙', fact: '那把伞', action: 'unaware', via: '', from: '', floor: 2, identity: 'surface', seq: 2 },
    ] };
    eng.worldProg.knowledgeTraces = traces;   /* fixture: mount traces onto the owner */
    const g = eng._o9Gate();
    const yes = g.resolve({ text: '那把伞', fact: '那把伞', chars: ['甲'] }, { kind: 'events', atFloor: 9 });
    assert.equal(yes.decision, 'allow', '有人在这一楼前已知 ⇒ 可读');
    assert.equal(yes.basis, 'known-at-floor', '须逐档具名');
    const no = g.resolve({ text: '那把伞', fact: '那把伞', chars: ['乙'] }, { kind: 'events', atFloor: 9 });
    assert.equal(no.decision, 'withhold', '轨迹明示「不知道」⇒ 必须遮蔽');
    ok('知识轨迹逐人裁决：甲 known-at-floor 放行 / 乙 not-known 遮蔽');
});

test('v3360 E3. ★★★★ 实体别名面接通:此刻未成立的称呼 ⇒ 遮蔽（alias-gated）', () => {
    const eng = hostO9({ chatLen: 6, entities: ['珞珈'], registry: fakeRegistry([{ id: 'n1', name: '珞珈', value: '阿珞', validFrom: 50 }]) });
    eng.graph = { nodes: (() => { const m = new Map(); m.set('n1', { type: 'character', name: '珞珈', data: { aliases: ['阿珞'] } }); return m; })() };
    const g = eng._o9Gate();
    const v = g.resolve({ text: '阿珞推门', chars: ['珞珈'] }, { kind: 'events', atFloor: 5 });
    assert.equal(v.decision, 'withhold', '第 50 楼才成立的旧名在第 5 楼必须遮蔽');
    assert.equal(v.basis, 'alias-gated', '须逐档具名 alias-gated');
    const late = hostO9({ chatLen: 60, entities: ['珞珈'], registry: fakeRegistry([{ id: 'n1', name: '珞珈', value: '阿珞', validFrom: 50 }]) });
    late.graph = eng.graph;
    const v2 = late._o9Gate().resolve({ text: '阿珞推门', chars: ['珞珈'] }, { kind: 'events', atFloor: 59 });
    assert.notEqual(v2.basis, 'alias-gated', '旧名成立后该档不得再命中');
    ok('揭穿前旧名 alias-gated 遮蔽；成立后该档不再命中');
});

test('v3360 E4. ★★★★ 真源缺席逐件具名;时点读不到一律判不了', () => {
    const eng = hostO9({ chatLen: 0, entities: null });
    eng.worldProg = null;
    const s = eng.o9Sources();
    assert.equal(s.armed, false, '时点读不到须报未武装');
    assert.ok(s.missing.length >= 1, '缺席须逐件具名（实 ' + JSON.stringify(s.missing) + '）');
    assert.equal(s.writesNothing, true, '须声明零写');
    const g = eng._o9Gate();
    assert.equal(g.resolve({ text: '甲推门' }, { kind: 'events' }).basis, 'no-verdict', '未武装 ⇒ 判不了');
    ok('缺席具名 ' + s.missing.join('、') + '；未武装时一律 no-verdict');
});

/* ══════════════ F. 零写 / 零缓存 / 现算 ══════════════ */
test('v3360 F1. ★★★★ 零写:owner 快照逐字节不变;判决不改入参', () => {
    const eng = hostO9({ chatLen: 6, entities: ['甲'] });
    eng.worldProg.secretLedger = SL.seal({ version: 1, items: [] }, { secret: '甲的秘密', keeper: ['甲'], knowers: ['甲'], floor: 1 }).state;
    eng._factVersionState = { version: 1, seq: 1, facts: [{ id: 'f1', subject: '甲', predicate: '身份', value: 'x', origin: 'stated', trust: 1, from: 1, to: null, floor: 1, conflictPolicy: 'auto', type: null, source: '', evidence: '' }] };
    const snapW = JSON.stringify(eng.worldProg);
    const snapF = JSON.stringify(eng._factVersionState);
    const item = { text: '甲推门', chars: ['甲'] };
    const snapI = JSON.stringify(item);
    const g = eng._o9Gate();
    g.resolve(item, { kind: 'events', atFloor: 3 });
    g.resolve({ text: '甲的秘密', chars: ['甲'] }, { kind: 'events', atFloor: 3 });
    assert.equal(JSON.stringify(eng.worldProg), snapW, 'worldProg 不得被写');
    assert.equal(JSON.stringify(eng._factVersionState), snapF, '事实账不得被写');
    assert.equal(JSON.stringify(item), snapI, '入参不得被改');
    ok('owner 快照与入参逐字节不变（判决口零写）');
});

test('v3360 F2. ★★★★ 零缓存:源变更后读数跟着变（现算）', () => {
    const eng = hostO9({ chatLen: 6, entities: ['甲'] });
    eng.worldProg.secretLedger = SL.seal({ version: 1, items: [] }, { secret: '甲的秘密', keeper: ['甲'], knowers: ['甲'], floor: 1 }).state;
    const g1 = eng._o9Gate();
    assert.equal(g1.resolve({ text: '甲的秘密', chars: ['甲'] }, { kind: 'events', atFloor: 3 }).basis, 'secret-sealed', '揭前遮蔽');
    const sealed = eng.worldProg.secretLedger;
    eng.worldProg.secretLedger = SL.reveal(sealed, { id: sealed.items[0].id, floor: 2, note: '本楼被当众说破' }).state;
    const g2 = eng._o9Gate();
    assert.notEqual(g2.resolve({ text: '甲的秘密', chars: ['甲'] }, { kind: 'events', atFloor: 3 }).basis, 'secret-sealed', '源变更后同实例必须跟着变（无缓存）');
    ok('同实例、同输入；源变更后判决跟着变（零缓存 / 现算）');
});

test('v3360 F3. ★★★★ 真源码破坏负控制四条(各带原版阳性对照)', () => {
    const W = libWindow();
    /* 内核模块独立装载:破坏副本另装一份,与原版对照。 */
    const loadKernel = (src) => {
        const ctx = { console, module: { exports: {} }, globalThis: null };
        ctx.window = ctx; ctx.globalThis = ctx;
        const fn = new Function('window', 'globalThis', 'module', src + '\n;return window.LonShaStoryAnnual;');
        return fn(ctx, ctx, ctx.module);
    };
    /* N1:拆宿主「时点读不到 ⇒ 判不了」⇒ 判据须序列化整条判决(否则兜底 no-verdict 与之同形)。 */
    const b1 = breakOnce(SA_OPS_SRC, A_K1, A_K1_BAD, 'N1');
    assert.notEqual(b1, SA_OPS_SRC, 'N1 破坏必须真改源码');
    assert.notDeepEqual(jNoFloorIsUndecided(IDX, W, b1), [], 'N1 破坏必须翻红');
    assert.deepEqual(jNoFloorIsUndecided(IDX, W), [], '原版上同判据必须真成立');
    /* N2:拆宿主「无事实锚 ⇒ 判不了」⇒ 匿名条目重新默认放行当场现形。 */
    const b2 = breakOnce(SA_OPS_SRC, A_K2, A_K2_BAD, 'N2');
    assert.notEqual(b2, SA_OPS_SRC, 'N2 破坏必须真改源码');
    assert.notDeepEqual(jNoAnchorIsUndecided(IDX, W, b2), [], 'N2 破坏必须翻红');
    assert.deepEqual(jNoAnchorIsUndecided(IDX, W), [], '原版上同判据必须真成立');
    /* N3:拆内核「not gated ⇒ 拒答」⇒ 生成侧把旧口径产物递出去当场现形。 */
    const b3 = breakOnce(SA_SRC, A_K3, A_K3_BAD, 'N3');
    assert.notEqual(b3, SA_SRC, 'N3 破坏必须真改源码');
    assert.notDeepEqual(jForPlayerNeverBlogs(loadKernel(b3)), [], 'N3 破坏必须翻红');
    assert.deepEqual(jForPlayerNeverBlogs(loadKernel(SA_SRC)), [], '原版上同判据必须真成立');
    /* N4:拆内核「整篇裁空须报」⇒ over-redacted 恒定 false 当场现形。 */
    const b4 = breakOnce(SA_SRC, A_K5, A_K5_BAD, 'N4');
    assert.notEqual(b4, SA_SRC, 'N4 破坏必须真改源码');
    assert.notDeepEqual(jOverRedactIsFlagged(loadKernel(b4)), [], 'N4 破坏必须翻红');
    assert.deepEqual(jOverRedactIsFlagged(loadKernel(SA_SRC)), [], '原版上同判据必须真成立');
    ok('四条真源码破坏(时点/无锚/生成侧/裁空)各自翻红;原版四条判据均真成立');
});

test('v3360 F4. ★★★★ 内核侧真源码破坏：逐条判决与未了事项保留', () => {
    /* 内核模块在独立 vm 里装载：破坏副本另装一份，与原版对照。 */
    const load = (src) => {
        const ctx = { console, module: { exports: {} }, globalThis: null };
        ctx.window = ctx; ctx.globalThis = ctx;
        const fn = new Function('window', 'globalThis', 'module', src + '\n;return window.LonShaStoryAnnual;');
        return fn(ctx, ctx, ctx.module);
    };
    const real = load(SA_SRC);
    const j = (sa) => {
        const pay = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '甲推门', chars: ['甲'] }, { floor: 2, text: '乙在暗处', chars: ['乙'] }] }] };
        const rv = sa.review('1', pay, {});
        const tv = sa.twoVersions(rv, { knownChars: ['甲', '乙'], gate: { atFloor: 9, resolve: (it) => (String(it && it.text).indexOf('乙') >= 0 ? { decision: 'withhold', basis: 'not-known-at-floor' } : { decision: 'allow', basis: 'known-at-floor', fact: 'f' }) } });
        const P = [];
        if (tv.spoilerFree.elements.events.length !== 1) P.push('逐条判决失效');
        if (tv.authorial.elements.events.length !== 2) P.push('作者版须全量');
        return P;
    };
    assert.deepEqual(j(real), [], '原版内核判据必须真成立');
    const broken = breakOnce(SA_SRC, A_K4, A_K4_BAD, 'N5');
    assert.notEqual(broken, SA_SRC, 'N5 破坏必须真改源码');
    assert.notDeepEqual(j(load(broken)), [], 'N5 破坏（逐条判决退化为全放行）必须翻红');
    ok('内核侧：逐条判决破坏即红，原版仍绿');
});

/* ══════════════ G. 工具两向自证 + 判据纯度 + 版本锚 ══════════════ */
test('v3360 G1. ★★★★ H6 工具两向自证：锚点 0 次 / 同值 / 不唯一均须抛', () => {
    const anchor = A_K1;
    assert.equal(SA_OPS_SRC.split(anchor).length - 1, 1, 'H5：破坏锚点在真源须恰出现一次');
    assert.throws(() => breakOnce(SA_OPS_SRC, 'no-such-anchor-xyz', 'x', 'T1'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakOnce(SA_OPS_SRC, anchor, anchor, 'T2'), /同值|相同|未改/, '同值替换必须抛');
    assert.throws(() => breakOnce(SA_OPS_SRC, '        ', 'x', 'T3'), /唯一|次数|命中/, '不唯一锚点必须抛');
    ok('工具两向自证：0 次 / 同值 / 不唯一三种用法均抛');
});

test('v3360 G2. ★★★★ H5 判据纯度：破坏锚点字面量只声明一次、判据不引用锚点串', () => {
    for (const a of [A_K1, A_K2, A_K3, A_K5]) {
        assert.equal(SELF.split(a).length - 1, 1, '锚点须在本档恰声明一次：' + a.slice(0, 40));
    }
    for (const jf of [jNoFloorIsUndecided, jNoAnchorIsUndecided, jForPlayerNeverBlogs, jOverRedactIsFlagged]) {
        const body = String(jf);
        for (const a of [A_K1, A_K2, A_K3, A_K5]) {
            assert.ok(body.indexOf(a) < 0, '判据不得引用锚点串：' + jf.name);
        }
    }
    ok('四个锚点各声明一次；四条判据体内不含锚点字面量');
});

test('v3360 G3. ★★★ 版本锚：六源不低于本档出生版', () => {
    assert.ok(vnum(MF.version) >= vnum(BORN), 'manifest 不得低于 ' + BORN + '（实 ' + MF.version + '）');
    assert.ok(vnum(PKG.version) >= vnum(BORN), 'package 不得低于 ' + BORN + '（实 ' + PKG.version + '）');
    ok('manifest / package 均不低于 ' + BORN);
});
