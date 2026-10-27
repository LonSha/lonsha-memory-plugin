// tests/v3314_phone_fact_bridge.test.mjs — v3.314.0 · M-X6 手机事实桥 2.0
// 主题：**准入之上叠一层** —— 用户确认环 / 生命周期四态 / 双向回执 / 编辑换代撤回。
//
//   【与 v3313（X4 准入）的关系（两个问题）】
//     X4 答「这条算不算事实」（八栏身份 + 五态来源 + 五档裁决）；
//     M-X6 答「算完之后走到哪一步、记忆侧回过什么话」。本档判**后者**。
//
//   【承重面】
//     · 证据守卫：预测 / 报价 / 草稿**永不**变事实（用户接受也不行 —— 结构硬守卫）
//     · 四态互不同形：accepted / rejected / pending / revoked（pending ≠ rejected 是本仓最贵的老账）
//     · 依赖缺席 ⇒ 判不了（`decidable:false`），不假装 pending、不假装 rejected
//     · 回执只读 + 理由取自穷尽词表
//     · 编辑 ⇒ supersede（留旧条）/ 删除 / 撤回 ⇒ withdraw（不留）
//
//   【边界（诚实）】
//     ① 本档不替 X4 背书：准入判定由 native-fact-admission.js 负责，本档只判其上的映射。
//     ② 不判「应否合并等价元素」（guard/lifecycle 各自定义）；面只覆盖本模块的导出与真调用。
//     ③ 全量未跑（用户纪律）：本档为定向复验。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const MOD = path.join('phone-fact-bridge.js');
const IDX = path.join('index.js');
const MANIFEST = JSON.parse(read('manifest.json'));

/** ★ 当版版本锚（frontier 专用；不得写成变量再由别的档代入）。 */
const BORN = '3.314.0';
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);

/** 取内核库（ESM 下用 createRequire 加载 CJS 双导出）。 */
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
const fresh = () => {
    const p = path.join(ROOT, MOD);
    delete require_.cache[p];
    return require_(p);
};

/** 最小 X4 同形准入桩（只用于自检与映射验证，不替 X4 背书）。 */
const stubAdmission = (over) => Object.assign({
    decision: 'admitted', state: 'confirmed', visibility: 'private', isFact: true,
    measurable: true, reason: '', dedupe: 'none',
    admitNativeFact: (fact) => Object.assign({
        decision: 'admitted', state: 'confirmed', visibility: 'private', isFact: true,
        measurable: true, reason: '', eventId: fact.eventId,
        rootEventId: fact.rootEventId || fact.eventId, dedupe: 'none', notes: [] }, over),
}, {});

/* ── 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ── */
const A_GUARD = "        if (g.guarded) return Object.assign(base, { state: 'pending', reason: 'evidence-guarded' });";
const A_CONFIRM = "            if (o.userDecision === 'accept') return Object.assign(base, { state: 'accepted', reason: 'accepted' });";
const A_DEPS = "        if (!d.FACT_ADMISSION || typeof d.FACT_ADMISSION.admitNativeFact !== 'function') {";
const A_EDIT = "        const effect = EDIT_EFFECT[_t(act).toUpperCase()] || '';";
const A_SELF_LEN = 'assert.ok(self.length > 3000';

import { stripComments } from './_audit_lib.mjs';
import os from 'node:os';
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

/* ══════════════════ 素材与依赖装配 ══════════════════ */
const MOD_SRC = read(MOD);
const SELF = read(path.join('tests', 'v3314_phone_fact_bridge.test.mjs'));
const IDX_SRC = __hostSurface();
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const PFB = require_(path.join(ROOT, MOD));

/** 依赖装配（与宿主 `_phoneFactBridgeDeps()` 同口径：只给 FACT_ADMISSION）。 */
const DEPS = Object.freeze({ FACT_ADMISSION: stubAdmission() });

/** 同源去重桩：按 rootEventId 判重复（模拟 X4 的 duplicate-event 读数，不替 X4 背书）。 */
function dedupeStub() {
    return { admitNativeFact: (fact, ctx) => {
        const c = ctx || {};
        const roots = Array.isArray(c.seenRootEventIds) ? c.seenRootEventIds.map(String) : [];
        const root = String(fact.rootEventId || fact.eventId);
        const base = { measurable: true, eventId: fact.eventId, rootEventId: root, notes: [] };
        if (roots.indexOf(root) !== -1) {
            return Object.assign(base, { decision: 'rejected', reason: 'duplicate-event', dedupe: 'root-event-id' });
        }
        return Object.assign(base, { decision: 'admitted', state: 'confirmed', visibility: 'private',
            isFact: true, reason: '', dedupe: 'none' });
    } };
}

/* ══════════════════ 判据本体（纯函数：负控制要在破坏副本上重跑它们） ══════════════════ */
/** A1：登记面恰一次（位置不作判据）+ 零兄弟依赖 + 双导出 + 冻结。 */
function judgeA1(P, mf, src) {
    if (!P || typeof P !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    /* 位置不作判据（末位是任一版都会变的位置）；但追加时的邻居须在场，证明是**追加**而非顶替。 */
    if (mf.extra_js.indexOf('memory-package.js') < 0) return '本模块与其追加时的邻居须都在 extra_js（位置不作判据）';
    const code = stripComments(src);
    if (code.includes('require(')) return '模块**不得** require 兄弟模块（依赖经 deps 参数注入，缺席才可表达）';
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/global\.LonShaPhoneFactBridge = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaPhoneFactBridge !== 'object') return 'global.LonShaPhoneFactBridge 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaPhoneFactBridge) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}
/** A2：导出面逐字（四态 / 三类 / 三动作 / 三守卫 / 十条理由 + 依赖声明面）。 */
function judgeA2(P) {
    for (const k of ['eventClassOf', 'guardEvidence', 'lifecycleOf', 'receiptFor', 'probeCounterpart',
        'planEdit', 'bridgeState', 'handleFact', 'handleBatch', 'describe', 'selfCheck', 'line']) {
        if (typeof P[k] !== 'function') return '导出面缺函数：' + k;
    }
    for (const k of ['LIFECYCLE_STATES', 'EVENT_CLASSES', 'EDIT_ACTIONS', 'EVIDENCE_GUARDS', 'RECEIPT_REASONS', 'BRIDGE_STATES']) {
        if (!Array.isArray(P[k])) return '导出面缺登记表数组：' + k;
    }
    if (!P.EDIT_EFFECT || typeof P.EDIT_EFFECT !== 'object') return '导出面缺 EDIT_EFFECT 词表';
    if (P.EDIT_EFFECT.EDIT !== 'supersede') return '编辑须 supersede（留旧条）';
    if (P.EDIT_EFFECT.DELETE !== 'withdraw' || P.EDIT_EFFECT.RETRACT !== 'withdraw') return '删除 / 撤回须 withdraw（不留）';
    if (P.BRIDGE_VERSION !== 1) return 'BRIDGE_VERSION 须为 1，实 ' + P.BRIDGE_VERSION;
    if (P.RECEIPT_VERSION !== 1) return 'RECEIPT_VERSION 须为 1，实 ' + P.RECEIPT_VERSION;
    if (P.LIFECYCLE_STATES.join(',') !== 'accepted,rejected,pending,revoked') return '生命周期四态逐字：' + P.LIFECYCLE_STATES.join(',');
    if (P.EVENT_CLASSES.join(',') !== 'finance,calendar,story') return '事件三类逐字：' + P.EVENT_CLASSES.join(',');
    if (P.EDIT_ACTIONS.join(',') !== 'edit,delete,retract') return '编辑三动作逐字：' + P.EDIT_ACTIONS.join(',');
    if (P.EVIDENCE_GUARDS.join(',') !== 'predictive,quote-like,draft-like') return '证据守卫三档逐字：' + P.EVIDENCE_GUARDS.join(',');
    if (P.BRIDGE_STATES.join(',') !== 'absent,legacy,capable') return '桥能力三态逐字：' + P.BRIDGE_STATES.join(',');
    if (P.RECEIPT_REASONS.length !== 10) return '回执理由词表须十条且穷尽，实 ' + P.RECEIPT_REASONS.length;
    if (new Set(P.RECEIPT_REASONS).size !== P.RECEIPT_REASONS.length) return '回执理由须互不重复';
    for (const r of ['accepted', 'awaiting-user', 'user-declined', 'evidence-guarded', 'admission-rejected',
        'duplicate', 'owner-retracted', 'admission-unavailable', 'bridge-absent', 'no-identity']) {
        if (P.RECEIPT_REASONS.indexOf(r) < 0) return '回执词表缺处境：' + r;
    }
    /* 依赖声明面：必需件只有 FACT_ADMISSION（事件类名映射是**可选**，缺席不影响可判性）。 */
    const reqKeys = (P.REQUIRED_DEPS || []).map((r) => r.key);
    if (reqKeys.join(',') !== 'FACT_ADMISSION') return '必需依赖须只有 FACT_ADMISSION，实 ' + reqKeys.join(',');
    for (const r of P.REQUIRED_DEPS) if (!r.why) return '必需依赖须逐条写明缺席后果：' + r.key;
    if ((P.OPTIONAL_DEPS || []).indexOf('EVENT_CLASSES_HINT') < 0) return '事件类名映射须列为可选（缺席不影响可判性）';
    return '';
}
/** A3：**离线**（本面不新增网络；源码零网络词）。 */
function judgeOffline(src) {
    const code = stripComments(src);
    for (const w of ['fetch(', 'XMLHttpRequest', 'localStorage', 'indexedDB', 'WebSocket', 'navigator.sendBeacon']) {
        if (code.indexOf(w) >= 0) return '本面须离线：不得出现 ' + w;
    }
    return '';
}
/** C1：事件三类各自可达；未知来源报 unknown（不落默认类）。 */
function judgeClass(P) {
    const cases = [['finance-confirmed', 'finance'], ['traveldesk', 'finance'], ['calendar', 'calendar'],
        ['forecast', 'calendar'], ['scene-complete', 'story'], ['quest-done', 'story']];
    for (const pair of cases) {
        const r = P.eventClassOf(pair[0]);
        if (r.cls !== pair[1] || r.known !== true) return '来源 ' + pair[0] + ' 须判 ' + pair[1] + '，实 ' + r.cls + '/' + r.known;
    }
    const u = P.eventClassOf('mystery-app');
    if (u.known !== false) return '未知来源不得被读成已知类';
    if (u.cls !== 'unknown') return '未知来源须报 unknown（不落默认类），实 ' + u.cls;
    if (P.eventClassOf('').known !== false) return '空来源须报 unknown（不落默认类）';
    /* 三类各自可达（不靠默认）。 */
    const got = {};
    for (const s of ['finance-confirmed', 'calendar', 'story']) got[P.eventClassOf(s).cls] = true;
    for (const c of P.EVENT_CLASSES) if (!got[c]) return '事件类未各自可达：' + c;
    /* 显式类名提示表生效（可选依赖的出口）。 */
    if (P.eventClassOf('my-wallet', { finance: ['my-wallet'], calendar: [], story: [] }).cls !== 'finance') {
        return '显式类名提示表须生效';
    }
    return '';
}
/** G1：证据守卫三档各自可达、理由不同形，且**结构硬守卫**（用户接受也推不动）。 */
function judgeGuard(P) {
    const g1 = P.guardEvidence({ source: 'forecast' });
    const g2 = P.guardEvidence({ source: 'quote' });
    const g3 = P.guardEvidence({ source: 'usage-tracker' });
    const g0 = P.guardEvidence({ source: 'finance-confirmed' });
    if (!g1.guarded || g1.guard !== 'predictive') return '预测来源须 guard=predictive，实 ' + g1.guard;
    if (!g2.guarded || g2.guard !== 'quote-like') return '报价来源须 guard=quote-like，实 ' + g2.guard;
    if (!g3.guarded || g3.guard !== 'draft-like') return '草稿来源须 guard=draft-like，实 ' + g3.guard;
    if (g0.guarded !== false) return '已确认财务来源不得被守卫（否则整面都判不了）';
    /* ★ 三档理由**不同形**（不得都压成 evidence-guarded 一个笼统词）。 */
    const whys = [g1.why, g2.why, g3.why];
    if (new Set(whys).size !== 3) return '三档守卫的理由须互不同形';
    for (const w of whys) if (!w) return '守卫须写明为何不能入账';
    /* 自述 predicted / 草稿可见性也各成一档（不靠来源名一种形态）。 */
    if (P.guardEvidence({ source: 'x', status: 'predicted' }).guard !== 'predictive') return '自述 predicted 须进预测档';
    if (P.guardEvidence({ source: 'x', visibility: 'player-only' }).guard !== 'draft-like') return 'player-only 可见性须进草稿档';
    /* ★★ 结构硬守卫：用户接受也推不动（本档与 X4 的唯一差别所在）。 */
    const r = P.handleFact({ eventId: 'g1', source: 'forecast' }, { userDecision: 'accept' }, DEPS);
    if (r.lifecycle.state === 'accepted') return '预测 + 用户接受不得变成 accepted（结构硬守卫）';
    if (r.lifecycle.state !== 'pending') return '守卫档须落 pending，实 ' + r.lifecycle.state;
    if (r.receipt.reason !== 'evidence-guarded') return '守卫档理由须 evidence-guarded，实 ' + r.receipt.reason;
    if (r.guarded !== true || r.guard !== 'predictive') return '读数须带守卫归因';
    /* 直接判生命周期（不经 handleFact）也须守住 —— 守卫是**单一真源**里的判。 */
    const lc = P.lifecycleOf({ decision: 'admitted', measurable: true }, { userDecision: 'accept', fact: { source: 'quote' } });
    if (lc.state !== 'pending' || lc.reason !== 'evidence-guarded') return 'lifecycleOf 须独立守住守卫档，实 ' + lc.state + '/' + lc.reason;
    return '';
}
/** L1：四态互不同形（pending ≠ rejected ≠ 判不了）+ 撤回落定优先。 */
function judgeLifecycle(P) {
    const lcA = P.lifecycleOf({ decision: 'admitted', measurable: true }, { userDecision: 'accept' });
    if (lcA.state !== 'accepted') return '可事实化 + 用户确认须 accepted，实 ' + lcA.state;
    const lcP = P.lifecycleOf({ decision: 'admitted', measurable: true }, {});
    if (lcP.state !== 'pending') return '未表态须 pending（不得默认接受），实 ' + lcP.state;
    const lcO = P.lifecycleOf({ decision: 'observed', measurable: true }, {});
    if (lcO.state !== 'pending') return 'observed 未确认须 pending，实 ' + lcO.state;
    const lcOa = P.lifecycleOf({ decision: 'observed', measurable: true }, { userDecision: 'accept' });
    if (lcOa.state !== 'accepted') return 'observed + 确认须 accepted，实 ' + lcOa.state;
    const lcR = P.lifecycleOf({ decision: 'admitted', measurable: true }, { userDecision: 'decline' });
    if (lcR.state !== 'rejected' || lcR.reason !== 'user-declined') return '用户拒绝须 rejected/user-declined，实 ' + lcR.state + '/' + lcR.reason;
    const lcX = P.lifecycleOf({ decision: 'rejected', measurable: true, reason: 'unknown-source' }, {});
    if (lcX.state !== 'rejected' || lcX.reason !== 'admission-rejected') return 'X4 拒收须 rejected/admission-rejected，实 ' + lcX.state + '/' + lcX.reason;
    const lcV = P.lifecycleOf({ decision: 'admitted', measurable: true }, { revoked: true });
    if (lcV.state !== 'revoked' || lcV.reason !== 'owner-retracted') return '撤回落定须 revoked/owner-retracted，实 ' + lcV.state + '/' + lcV.reason;
    if (P.lifecycleOf({ decision: 'retracted', measurable: true }, {}).state !== 'revoked') return 'X4 撤回须落 revoked';
    /* ★ 四态互不同形。 */
    const states = [lcA.state, lcR.state, lcP.state, lcV.state];
    for (const s of P.LIFECYCLE_STATES) if (states.indexOf(s) < 0) return '四态未穷尽：' + s + ' 未可达';
    if (new Set(states).size !== 4) return '四态必须互不同形（折叠会让手机侧读错），实 ' + JSON.stringify(states);
    if (lcP.state === lcR.state) return 'pending 与 rejected 同形（本仓最贵的老账）';
    /* ★ 判不了与 pending 不同形（缺格是 decidable:false，不是「等确认」）。 */
    const lcU = P.lifecycleOf({ measurable: false }, {});
    if (lcU.decidable !== false) return '准入不可测须报 decidable:false（不假装能判 / 能等）';
    if (lcU.reason !== 'admission-unavailable') return '不可测理由须 admission-unavailable，实 ' + lcU.reason;
    /* ★ 撤回落定**优先于**用户拒绝与守卫（撤回就是撤销，不论其它栏）。 */
    const lcPri = P.lifecycleOf({ decision: 'admitted', measurable: true }, { userDecision: 'decline', revoked: true, fact: { source: 'forecast' } });
    if (lcPri.state !== 'revoked') return '撤回落定须优先于拒绝与守卫，实 ' + lcPri.state;
    /* 其余（无裁决 / 不认识）如实报判不了，不猜。 */
    const lcQ = P.lifecycleOf({}, {});
    if (lcQ.decidable !== false) return '既无裁决又不可测须如实报判不了';
    return '';
}

/** R1：回执只读 + 理由取自穷尽词表 + nextStep 逐条可达（手机侧不必猜包内词表）。 */
function judgeReceipt(P) {
    const fact = { eventId: 'e9', rootEventId: 'r9', source: 'finance-confirmed' };
    const adm = { decision: 'admitted', measurable: true, eventId: 'e9', rootEventId: 'r9' };
    const snapshot = JSON.stringify(fact) + JSON.stringify(adm);
    const r = P.receiptFor({ fact: fact, admission: adm, opts: { userDecision: 'accept' } });
    if (r.state !== 'accepted' || r.reason !== 'accepted') return '已确认须回执 accepted，实 ' + r.state + '/' + r.reason;
    if (r.accepted !== true) return 'accepted 回执须自报 accepted:true';
    if (r.eventId !== 'e9' || r.rootEventId !== 'r9') return '回执须带回身份（手机侧据此配对）';
    if (r.version !== P.RECEIPT_VERSION) return '回执须带口径版本（防静默改口径）';
    /* ★ 只读：不得改传入对象（回执是**出去的读数**，不是改写入口）。 */
    if (JSON.stringify(fact) + JSON.stringify(adm) !== snapshot) return '回执不得改写传入的 fact / admission';
    /* ★ 冻结：调用方拿回执去改动不得**静默**生效。 */
    let frozen = false;
    try { r.state = 'X'; frozen = (r.state === 'accepted'); } catch (e) { frozen = true; }
    if (!frozen) return '回执须冻结（防调用方改读数）';
    /* ★ 理由取自穷尽词表：多种处境跑一遍，理由必须在表内。 */
    const cases = [
        ['accepted', P.receiptFor({ fact: fact, lifecycle: P.lifecycleOf(adm, { userDecision: 'accept' }) })],
        ['awaiting-user', P.receiptFor({ fact: fact, lifecycle: P.lifecycleOf(adm, {}) })],
        ['user-declined', P.receiptFor({ fact: fact, lifecycle: P.lifecycleOf(adm, { userDecision: 'decline' }) })],
        ['owner-retracted', P.receiptFor({ fact: fact, lifecycle: P.lifecycleOf(adm, { revoked: true }) })],
        ['admission-unavailable', P.receiptFor({ fact: fact, lifecycle: P.lifecycleOf({ measurable: false }, {}) })],
    ];
    for (const pair of cases) {
        if (pair[1].reason !== pair[0]) return '理由须逐条对上：' + pair[0] + '，实 ' + pair[1].reason;
        if (P.RECEIPT_REASONS.indexOf(pair[1].reason) < 0) return '回执理由超出穷尽词表：' + pair[1].reason;
        if (!pair[1].nextStep) return '回执须给出 nextStep（手机侧不必猜包内词表）';
    }
    /* ★ 判不了的回执不得伪装成「等确认」，nextStep 也须指向真出路。 */
    const unr = P.receiptFor({ fact: fact, lifecycle: P.lifecycleOf({ measurable: false }, {}) });
    if (unr.decidable !== false) return '判不了的回执须报 decidable:false';
    if (unr.nextStep !== 'retry-when-module-present') return '准入缺席须给重试出路，实 ' + unr.nextStep;
    if (unr.state === 'rejected') return '判不了不得显示成 rejected';
    /* 无身份：单独的处境与出路（不猜事实身份）。 */
    const noId = P.handleFact({ source: 'finance-confirmed' }, {}, DEPS);
    if (noId.lifecycle.reason !== 'no-identity') return '无 eventId 须点名 no-identity';
    if (noId.receipt.nextStep !== 'provide-event-id') return '无身份须给「补 eventId」出路，实 ' + noId.receipt.nextStep;
    if (noId.measurable !== false) return '无身份须如实报不可测（不猜内容）';
    return '';
}
/** D1：依赖缺席 ⇒ decidable:false（不假装 pending / 不假装 rejected）；同键降级。 */
function judgeDeps(P) {
    const fact = { eventId: 'd1', source: 'finance-confirmed' };
    /* ① handleFact：无准入档。 */
    const r = P.handleFact(fact, {}, {});
    if (r.lifecycle.decidable !== false) return '准入缺席须报 decidable:false';
    if (r.lifecycle.reason !== 'admission-unavailable') return '缺席理由须 admission-unavailable，实 ' + r.lifecycle.reason;
    if (r.lifecycle.state === 'rejected') return '缺席不得假装 rejected（会被读成「明确未进账」）';
    if (r.receipt.nextStep !== 'retry-when-module-present') return '缺席须给重试出路';
    /* 依赖给了但不完整（不是 admitNativeFact 函数）⇒ 同样判不了，不得当作在场。 */
    const r2 = P.handleFact(fact, {}, { FACT_ADMISSION: {} });
    if (r2.lifecycle.decidable !== false) return '依赖空壳须同样判不了（不得当作在场）';
    /* ② bridgeState：依赖缺席 ⇒ indeterminate（与 empty 不同形）。 */
    const bs = P.bridgeState({}, { admitFacts: () => {} });
    if (bs.state !== 'indeterminate') return '依赖缺席须报 indeterminate，实 ' + bs.state;
    if (bs.reason !== 'admission-unavailable') return '缺席理由须 admission-unavailable，实 ' + bs.reason;
    if (bs.canJudge !== false) return '缺席时不得报能判';
    /* 依赖齐备 ⇒ ok 且能判（不得恒 indeterminate）。 */
    const bsOk = P.bridgeState(DEPS, { admitFacts: () => {} });
    if (bsOk.state !== 'ok' || bsOk.canJudge !== true) return '依赖齐备须报 ok/canJudge:true，实 ' + bsOk.state;
    /* ③ describe：缺格逐条列出（且**只列必需件**，可选件缺席不误报）。 */
    const d = P.describe({});
    if (d.missingDeps.join(',') !== 'FACT_ADMISSION') return '缺格须只列必需件，实 ' + d.missingDeps.join(',');
    if (P.describe(DEPS).missingDeps.length !== 0) return '依赖齐备时不得报缺格';
    /* ④ 答错也须降级（不抛：降级不得变成崩溃）。 */
    const boom = { admitNativeFact: () => { throw new Error('boom'); } };
    let escaped = false;
    let rr = null;
    try { rr = P.handleFact(fact, {}, { FACT_ADMISSION: boom }); } catch (e) { escaped = true; }
    if (escaped) return '准入面抛错须被包住降级（不得让异常逃逸）';
    if (rr.lifecycle.decidable !== false) return '准入抛错须报判不了，实 ' + rr.lifecycle.decidable;
    if (rr.lifecycle.state === 'rejected') return '准入抛错不得报 rejected（抛错 ≠ 明确未进账）';
    return '';
}
/** E1：编辑 ⇒ supersede（留旧条）/ 删除・撤回 ⇒ withdraw（不留）；两效不同形。 */
function judgeEdit(P) {
    const fact = { eventId: 'e1', rootEventId: 'R1' };
    const ed = P.planEdit('edit', fact);
    const del = P.planEdit('delete', fact);
    const re = P.planEdit('retract', fact);
    if (ed.ok !== true || ed.effect !== 'supersede') return '编辑须出 supersede 计划，实 ' + ed.effect + '/' + ed.reason;
    if (del.ok !== true || del.effect !== 'withdraw') return '删除须出 withdraw 计划，实 ' + del.effect + '/' + del.reason;
    if (re.ok !== true || re.effect !== 'withdraw') return '撤回须出 withdraw 计划，实 ' + re.effect + '/' + re.reason;
    if (ed.effect === del.effect) return '换代与撤回必须不同形（否则换代链会丢）';
    /* ★ 换代三步留痕 / 撤回三步不留；语义逐字不同。 */
    if (ed.steps.length !== 3 || del.steps.length !== 3) return '两种计划各三步';
    if (ed.steps.join('|') === del.steps.join('|')) return '两种计划的步骤不得同形';
    if (ed.steps.join(' ').indexOf('supersededBy') < 0) return '换代计划须写旧条留痕（supersededBy）';
    if (del.steps.join(' ').indexOf('revoked') < 0) return '撤回计划须写明回执 state=revoked';
    /* ★ 计划只算不写（本面零落笔）。 */
    if (planWrites(ed)) return '本面是计划面，不得带写口';
    /* 未知动作 ⇒ 拒（不猜）；无身份 ⇒ 拒（不猜）。 */
    const bad = P.planEdit('rename', fact);
    if (bad.ok !== false || bad.reason !== 'unknown-action') return '词表外动作须拒且点名 unknown-action，实 ' + bad.reason;
    const noId = P.planEdit('edit', { source: 'x' });
    if (noId.ok !== false || noId.reason !== 'no-identity') return '无身份须拒且点名 no-identity，实 ' + noId.reason;
    /* ★ 经主流程：编辑动作走计划路由（不再去跑准入），回执 state=revoked。 */
    const viaHandle = P.handleFact(fact, { editAction: 'edit' }, DEPS);
    if (!viaHandle.plan || viaHandle.plan.effect !== 'supersede') return '主流程须把编辑路由到计划面';
    if (viaHandle.lifecycle.state !== 'revoked') return '编辑落地后旧条须落 revoked，实 ' + viaHandle.lifecycle.state;
    return '';
}
/** 写口探测（计划面不得带任何落笔口 —— 与 X8 同纪律）。 */
function planWrites(plan) {
    const s = JSON.stringify(plan);
    for (const w of ['storage.save', 'restoreFromPayload', 'localStorage', 'writeFile', 'save(']) {
        if (s.indexOf(w) >= 0) return true;
    }
    return false;
}
/** H1：宿主接线逐符号在场（取库口 / 装配点 / 七出口 / 降级 / 诊断行 / 不落笔）。 */
function judgeHost(src) {
    /* **定义面**恰一次（多一处 = 两个装配点，静默分叉）。 */
    for (const s of [
        "_moduleLib(() => window.LonShaPhoneFactBridge, 'phone-fact-bridge.js')",
        'function _phoneFactBridgeLib() {', '_phoneFactBridgeDeps() {', '_phoneFactBridgeAbsent(reason) {',
        'phoneFactBridgeHandle(fact, ctx) {', 'phoneFactBridgeBatch(facts, ctx) {',
        'phoneFactBridgeReceipt(fact, ctx) {', 'phoneFactBridgePlanEdit(action, fact) {',
        'phoneFactBridgeState(bridge) {', 'phoneFactBridgeDescribe() {', 'phoneFactBridgeLine() {'
    ]) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    /* **使用面**只需在场。 */
    for (const s of ["['手机桥', this.phoneFactBridgeLine()]", '_lastPhoneBridge']) {
        const n = src.split(s).length - 1;
        if (n < 1) return '宿主口须在场：' + s + '（实 ' + n + '）';
    }
    /* ★ 与 X4「手机准入」诊断行**分列**（两种缺席归因不同，不得合成一行）。 */
    if (src.indexOf("['手机桥'") < 0) return '手机桥诊断行须自成一行';
    if (src.indexOf("['手机准入'") < 0) return 'X4 手机准入行须仍在场（两面是两件事，不得顶替）';
    if (src.indexOf("['手机桥', this.phoneFactBridgeLine()]") < 0) return '手机桥诊断行须接本面自己的口径';
    if (src.indexOf("['手机准入', FA.admissionLine") < 0) return '手机准入行须仍接 X4 口径（不得被本面覆写）';
    /* ★ 装配点键名须与内核 REQUIRED_DEPS 逐字一致（判在装配点方法体切片里）。 */
    const da = src.indexOf('_phoneFactBridgeDeps() {');
    const db = src.indexOf('phoneFactBridgeState(bridge) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of PFB.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    if (depsSeg.indexOf('_factAdmissionLib()') < 0) return '装配点必须取准入内核（唯一真源）';
    /* ★ 出口不得自己落笔（纯函数面：写口归 owner）。 */
    const pa = src.indexOf('phoneFactBridgeHandle(fact, ctx) {');
    const pb = src.indexOf('phoneFactBridgeLine() {');
    if (pa < 0 || pb <= pa) return '出口方法体切片失败（判据失效）';
    const outSeg = src.slice(pa, pb);
    for (const w of ['storage.save', 'restoreFromPayload(', 'localStorage', 'collectExport(', 'writeFile']) {
        if (outSeg.indexOf(w) >= 0) return '本面是纯函数面，出口不得落笔：' + w;
    }
    if (outSeg.indexOf('PFB.handleFact(') < 0) return '出口必须真调用内核 handleFact（不得自己重算一遍）';
    if (outSeg.indexOf('PFB.handleBatch(') < 0) return '批量出口必须真调用内核 handleBatch';
    if (outSeg.indexOf('PFB.planEdit(') < 0) return '编辑出口必须真调用内核 planEdit';
    /* ★ 本面刻意不进快照（是用户显式动作的读数，不是每轮状态投影）。 */
    const at = src.indexOf('const snap = {');
    if (at < 0) return '快照构造点必须在场（否则本判据扫描面失效，会恒真）';
    if (/phoneFactBridge|_lastPhoneBridge/.test(src.slice(at, at + 12000))) return '手机桥面不得进快照（用户显式动作 ≠ 每轮状态投影）';
    return '';
}

/** B1：批量与单条**同函**（不另写一份）；同源重复是幂等读数而非失败。 */
function judgeBatch(P) {
    const facts = [{ eventId: 'b1', source: 'finance-confirmed' },
        { eventId: 'b2', source: 'forecast' }, { eventId: 'b3', source: 'finance-confirmed' }];
    const snap = JSON.stringify(facts);
    const dep = { FACT_ADMISSION: dedupeStub() };
    const r = P.handleBatch(facts, { userDecision: 'accept' }, dep);
    if (r.rows.length !== 3) return '批量须逐条出读数，实 ' + r.rows.length;
    if (r.accepted !== 2) return '两条可事实化须 accepted，实 ' + r.accepted;
    if (r.pending !== 1) return '守卫档须 pending，实 ' + r.pending;
    if (r.byState.accepted !== 2 || r.byState.pending !== 1) return '按态计数须可见：' + JSON.stringify(r.byState);
    if (r.byReason['evidence-guarded'] !== 1) return '按理由计数须可见：' + JSON.stringify(r.byReason);
    /* 批量不得改写传入事实（只算不写）。 */
    if (JSON.stringify(facts) !== snap) return '批量不得改写传入的事实';
    /* ★ 同源重复（rootEventId 同）= 幂等读数，**不是失败**，也不增条。 */
    const dup = P.handleBatch([
        { eventId: 'r1', rootEventId: 'R', source: 'finance-confirmed' },
        { eventId: 'r2', rootEventId: 'R', source: 'finance-confirmed' }], { userDecision: 'accept' }, dep);
    if (dup.rows[1].receipt.reason !== 'duplicate') return '同源重复须点名 duplicate，实 ' + dup.rows[1].receipt.reason;
    if (dup.rows[1].lifecycle.state !== 'accepted') return '同源重复是幂等读数（不得显示成失败），实 ' + dup.rows[1].lifecycle.state;
    if (dup.rejected !== 0) return '同源重复不得计入 rejected，实 ' + dup.rejected;
    /* 「一条都没有」与「有但全被挡」不同形（空批不得报出事实类读数）。 */
    const empty = P.handleBatch([], {}, dep);
    if (empty.measurable === false) return '空批是可测的（没有事实），不得报不可测';
    if (empty.accepted + empty.pending + empty.rejected + empty.revoked !== 0) return '空批不得报出事实';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_phoneFactBridgeDeps() {', '_phoneFactBridgeAbsent(reason) {', 'phoneFactBridgeHandle(fact, ctx) {',
    'phoneFactBridgeBatch(facts, ctx) {', 'phoneFactBridgeReceipt(fact, ctx) {',
    'phoneFactBridgePlanEdit(action, fact) {', 'phoneFactBridgeState(bridge) {',
    'phoneFactBridgeDescribe() {', 'phoneFactBridgeLine() {'
];
/** 模块级取库口（**不是** class 方法：它们定义在 IIFE 顶层，不提取就是自由变量）。 */
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {', 'function _factAdmissionLib() {',
    'function _phoneFactBridgeLib() {'
];
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
function libWindow() {
    return { LonShaPhoneFactBridge: PFB, LonShaNativeFactAdmission: stubAdmission() };
}
function makeHost() {
    return { config: { config: { debugMode: false } }, _lastPhoneBridge: null };
}
/** 从入口抽出宿主接线（真源码驱动：接线被摘就会抽不到）。 */
function engineFrom(src, win) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(src, h)).join(',' + J);
    if (!libs || HOST_METHODS.some((h) => methodBody(src, h) === null)) {
        throw new Error('宿主接线抽取失败（接线被摘或改名）：判据扫描面失效');
    }
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', 'ARCHIVE_TOP_LEVEL_KEYS',
        libs + J + 'return ({ ' + body + ' });')(() => {}, 'v3314', win || libWindow(), []);
    return Object.assign(eng, makeHost());
}
/** 破坏副本（落盘 + 语法校验 + 真加载）。 */
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3314-' + tag + '-'));
    const fp = path.join(dir, MOD);
    const broken = breakSource(MOD_SRC, anchor, repl, tag);
    assertSingleHit(MOD_SRC, anchor, tag);
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(fp);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3314 M1. ★★★★ 模块登记面：分发面恰一次（零兄弟依赖）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(ROOT, MOD)), MOD + ' 必须在场');
    assert.equal(judgeA1(PFB, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
});

test('v3314 M2. ★★★★ 导出面：十二个函数 + 六张登记表 + 十条理由 + 依赖声明面 + 离线', () => {
    assert.equal(judgeA2(PFB), '', '导出面判据');
    assert.equal(judgeOffline(MOD_SRC), '', '离线判据');
    assert.deepEqual(PFB.LIFECYCLE_STATES.slice(), ['accepted', 'rejected', 'pending', 'revoked'], '四态逐字');
    assert.deepEqual(PFB.RECEIPT_REASONS.slice().length, 10, '回执理由十条');
});

/* ══════════════════ C 事件分类 ══════════════════ */
test('v3314 C1. ★★★★ 事件三类各自可达；未知来源报 unknown（不得落默认类）', () => {
    assert.equal(judgeClass(PFB), '', '事件分类判据');
});

/* ══════════════════ G 证据守卫（承重） ══════════════════ */
test('v3314 G1. ★★★★★ 预测 / 报价 / 草稿不自动变事实：三档可达、理由不同形、用户接受也推不动', () => {
    assert.equal(judgeGuard(PFB), '', '证据守卫判据');
});

/* ══════════════════ L 生命周期四态 ══════════════════ */
test('v3314 L1. ★★★★★ 四态互不同形（pending ≠ rejected ≠ 判不了）；撤回落定优先', () => {
    assert.equal(judgeLifecycle(PFB), '', '生命周期判据');
});

/* ══════════════════ R 双向回执 ══════════════════ */
test('v3314 R1. ★★★★★ 回执只读 + 冻结 + 理由取自穷尽词表 + nextStep 指向真出路', () => {
    assert.equal(judgeReceipt(PFB), '', '回执判据');
});

/* ══════════════════ D 依赖缺席 ══════════════════ */
test('v3314 D1. ★★★★★ 任一插件单装都有可解释降级：缺席 ⇒ decidable:false（不假装在等 / 不假装被拒）', () => {
    assert.equal(judgeDeps(PFB), '', '依赖缺席判据');
});

/* ══════════════════ E 编辑换代 / 撤回 ══════════════════ */
test('v3314 E1. ★★★★★ 编辑 ⇒ supersede（留旧条）/ 删除・撤回 ⇒ withdraw（不留），两效不同形', () => {
    assert.equal(judgeEdit(PFB), '', '编辑换代判据');
});

/* ══════════════════ B 批量与同源去重 ══════════════════ */
test('v3314 B1. ★★★★ 批量与单条同函；同 rootEventId 只进一次（幂等读数 ≠ 失败）', () => {
    assert.equal(judgeBatch(PFB), '', '批量判据');
});

/* ══════════════════ H 宿主接线与端到端 ══════════════════ */
test('v3314 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 七出口 / 降级 / 诊断行 / 不落笔）', () => {
    assert.equal(judgeHost(IDX_SRC), '', '宿主接线判据');
});

test('v3314 H2. ★★★★★ 端到端：宿主真判一条手机事实 ⇒ 准入 / 四态 / 回执各自成读数', () => {
    const eng = engineFrom(IDX_SRC);
    const ok1 = eng.phoneFactBridgeHandle({ eventId: 'e1', source: 'finance-confirmed' }, { userDecision: 'accept' });
    assert.equal(ok1.lifecycle.state, 'accepted', '真确认须落 accepted，实 ' + ok1.lifecycle.state);
    assert.equal(ok1.receipt.reason, 'accepted');
    const p1 = eng.phoneFactBridgeHandle({ eventId: 'e2', source: 'finance-confirmed' }, {});
    assert.equal(p1.lifecycle.state, 'pending', '未表态须 pending，实 ' + p1.lifecycle.state);
    const g1 = eng.phoneFactBridgeHandle({ eventId: 'e3', source: 'forecast' }, { userDecision: 'accept' });
    assert.equal(g1.lifecycle.state, 'pending', '守卫档不得变事实，实 ' + g1.lifecycle.state);
    assert.equal(g1.receipt.reason, 'evidence-guarded');
    const l = eng.phoneFactBridgeLine();
    assert.ok(l.indexOf('上次') === 0, '诊断行须报出上次读数，实 ' + l);
    /* 批量态读数。 */
    const b = eng.phoneFactBridgeBatch([{ eventId: 'x1', source: 'finance-confirmed' },
        { eventId: 'x2', source: 'forecast' }], { userDecision: 'accept' });
    assert.equal(b.accepted, 1, '批内一条 accepted，实 ' + b.accepted);
    const lb = eng.phoneFactBridgeLine();
    assert.ok(lb.indexOf('上次 批') === 0, '批量后诊断行须报批量态，实 ' + lb);
    /* ★ 模块整个未挂 ⇒ 同键降级（不报「已入账」也不报「被拒」）。 */
    const engGone = engineFrom(IDX_SRC, { LonShaNativeFactAdmission: stubAdmission() });
    const gone = engGone.phoneFactBridgeHandle({ eventId: 'z', source: 'finance-confirmed' }, {});
    assert.equal(gone.ok, false, '模块缺席须报 ok:false');
    assert.equal(gone.state, 'absent', '模块缺席须报 state:absent');
    assert.equal(engGone.phoneFactBridgeLine(), '模块未加载（phone-fact-bridge.js）', '模块未挂的诊断行自成一体');
    /* 准入内核缺格（本面唯一必需件）⇒ 判不了，且诊断行点名缺的那一格。 */
    const engNoDep = engineFrom(IDX_SRC, { LonShaPhoneFactBridge: PFB });
    const noDep = engNoDep.phoneFactBridgeHandle({ eventId: 'z2', source: 'finance-confirmed' }, {});
    assert.equal(noDep.lifecycle.decidable, false, '准入缺格须判不了');
    const dl = engNoDep.phoneFactBridgeLine();
    assert.ok(dl.indexOf('依赖缺格') >= 0 && dl.indexOf('FACT_ADMISSION') >= 0, '诊断行须点名缺格，实 ' + dl);
    /* 桥三态（缺席 / 旧版缺回执面 / 在位）不得压成一态。 */
    assert.equal(eng.phoneFactBridgeState(null).state, 'absent', 'null 桥须报 absent');
    const lg = eng.phoneFactBridgeState({ admitFacts: () => {} });
    assert.equal(lg.state, 'ok', '依赖齐备时总判须 ok（桥能力在 probe 里分档）');
    assert.equal(lg.probe.state, 'legacy', '有准入面无回执面须报 legacy');
    assert.equal(lg.probe.canReceipt, false, 'legacy 桥不得报有回执面');
    assert.equal(eng.phoneFactBridgeState({ admitFacts: () => {}, ackFact: () => {} }).probe.state, 'capable', '两面俱在须报 capable');
});

/* ══════════════════ V 版本锚 ══════════════════ */
test('v3314 V1. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3314000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer + '（抬版牵连面：六源须同步）');
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.314.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});

/* ══════════════════ L 真源码破坏 -> 同一条真判据必须翻红 ══════════════════ */
test('v3314 X1. ★★★★★ 真源码破坏 -> 同一条真判据必须翻红（六条各自现形，且原版必须绿）', () => {
    /* L0 地基：同一批判据在**原版**上必须全部通过（否则「翻红」不归因于破坏）。 */
    assert.equal(judgeGuard(PFB), '', '地基 guard');
    assert.equal(judgeLifecycle(PFB), '', '地基 lifecycle');
    assert.equal(judgeDeps(PFB), '', '地基 deps');
    assert.equal(judgeEdit(PFB), '', '地基 edit');
    assert.equal(judgeClass(PFB), '', '地基 class');
    assert.equal(judgeReceipt(PFB), '', '地基 receipt');
    /* ★ 破副本**抛错**也算翻红：不能因为异常逃逸就让后续断言静默漏跑（本仓负向探针纪律）。 */
    const broke = (fn) => { try { return fn(); } catch (e) { return '破副本抛错（视作翻红）：' + String((e && e.message) || e); } };
    /* ① 证据守卫被拿掉（预测 + 用户接受就变事实 —— 正是本版要治的静默升级）。 */
    {
        const b = loadBroken('guard', A_GUARD, "        if (false) return Object.assign(base, { state: 'pending', reason: 'evidence-guarded' });");
        assert.notEqual(broke(() => judgeGuard(b)), '', '破坏 guard 后守卫判据必须翻红');
    }
    /* ② 用户未表态也被当作接受（pending 与 accepted 不同形被打破）。 */
    {
        const b = loadBroken('confirm', A_CONFIRM, "            if (true) return Object.assign(base, { state: 'accepted', reason: 'accepted' });");
        assert.notEqual(broke(() => judgeLifecycle(b)), '', '破坏 confirm 后生命周期判据必须翻红');
    }
    /* ③ 依赖缺席不再报判不了（会被读成「在等确认」/「被拒」）。 */
    {
        const b = loadBroken('deps', A_DEPS, "        if (false) { /* 依赖门被摘：缺席也报能判 */");
        assert.notEqual(broke(() => judgeDeps(b)), '', '破坏 deps 后缺席判据必须翻红');
    }
    /* ④ 编辑动作不再走换代（效果塌成一态）。 */
    {
        const b = loadBroken('edit', A_EDIT, "        const effect = 'withdraw';", 'edit');
        assert.notEqual(broke(() => judgeEdit(b)), '', '破坏 edit 后换代判据必须翻红');
    }
    /* ⑤ 判据面自伤：本档自己的两条锚点纪律（锚只声明一次 / 自档自伤重放器）。 */
    for (const nm of ['A_GUARD', 'A_CONFIRM', 'A_DEPS', 'A_EDIT', 'A_SELF_LEN']) {
        assert.equal(SELF.split('const ' + nm + ' = ').length - 1, 1, '锚点 ' + nm + ' 的**声明**须在本档只出现一次');
    }
    assert.ok(SELF.length > 3000, '本档须保有足够判据体（防被截断后仍报绿）');
    /* ⑥ 判据自重：两个自伤锚以外的声明面至多出现一次（防锚随破坏副本一起复制）。 */
    for (const a of [A_GUARD, A_CONFIRM, A_DEPS, A_EDIT]) {
        assert.equal(MOD_SRC.split(a).length - 1, 1, '真源锚须恰中 1 次（定点破坏的地基）');
    }
});
