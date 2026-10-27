// tests/v3315_knowledge_preview.test.mjs — v3.315.0 · M-X5 角色知识传播的可见范围预演
// 主题：**下笔之前先看一眼** —— 五条传播路径各自会把谁推到哪一格。
//
//   【与 v3291（X5 知识轨迹）的关系（两个方向）】
//     X5 答**过去**：这条知识在第几楼、从谁、经哪条原始证据取得的；
//     M-X5 答**事前**：若按这条路传播，谁的认知会从哪一格变到哪一格。本档判**后者**。
//
//   【承重面】
//     · 预演**零写**：不改传入的 payload / trace（对象一律 copy），不写账、不改角色知识
//     · 「判不了」（indeterminate）**单独一档**，不得并入「改不动」（no-change）—— 本仓最贵的老账
//     · 作者预览面与角色生成面**键集不相交**（生成面只拿 who / after），且禁止表是**独立真源**
//     · 同一条传播事件不生成多条重复证据（同证据键 + 同角色 + 同动作 ⇒ no-change）
//     · 边界判不了 ⇒ 泄漏面报判不了（不假装没边界，不假装已知）
//
//   【边界（诚实）】
//     ① 本档不替 X5 背书：状态判定由 knowledge-trace.js 负责（本档用其真模块），本档只判其上的映射与两面分离。
//     ② 不判「谁的认知判错了」（correct 的 affected 由调用方给定 —— 本模块不替它猜）。
//     ③ 全量未跑（用户纪律）：本档为定向复验。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const MOD = 'knowledge-preview.js';
const IDX = 'index.js';
const BORN = '3.315.0';
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);

import { createRequire } from 'node:module';
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
const require_ = createRequire(import.meta.url);

const MOD_SRC = read(MOD);
const SELF = read('tests/v3315_knowledge_preview.test.mjs');
const IDX_SRC = __hostSurface();
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

/** 真轨迹内核（本档不替它背书：只用它的真实现做被预演的「现状」）。 */
const KT = require_(path.join(ROOT, 'knowledge-trace.js'));
const KP = require_(path.join(ROOT, MOD));

/** 依赖装配（与宿主 `_knowledgePreviewDeps()` 同口径：轨迹必需、秘密账可选）。 */
const DEPS = Object.freeze({ KNOWLEDGE_TRACE: KT });
const F = '她欠了高利贷';

/** 最小同形轨迹桩（只用于**自检探针**，不替 X5 背书）。 */
const stubKT = Object.freeze({
    normalize: (raw) => ({ traces: (raw && raw.traces) || [] }),
    stateOf: (raw, who) => {
        const t = (raw && raw.traces) || [];
        const hit = t.filter((x) => x.character === who).slice(-1)[0];
        return { state: hit ? (hit.action === 'acquire' ? 'knows' : hit.action === 'misbelieve' ? 'misled' : 'notRecorded') : 'notRecorded' };
    }
});

/** 秘密账桩（三态：knower / listed / unlisted）—— 只用于验证边界判定接法。 */
const stubSL = (knowers) => Object.freeze({
    knowledgeOf: (item, who) => (knowers.indexOf(who) >= 0 ? 'knower' : 'listed'),
    filterForViewer: () => ({})
});

/* ── 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ── */
const A_BADPATH = "        if (PATHS.indexOf(path) < 0) {";
const A_ABSENT = "        const kt = _ktOf(d);";
const A_ROWIND = "            Object.assign(out, { verdict: 'indeterminate', reason: 'row-level-undecidable', decidable: false });";
const A_BOUNDARY = "            boundaryOk = !!(sl && typeof sl.knowledgeOf === 'function' && secretItem";
const A_CHARFACE = "        const rows = list.filter((r) => r.verdict === 'would-affect' && r.after === 'knows')";
const A_DUP = "                && _recordedEvidence(kt, t, who, plan.fact, plan.evidenceKey, plan.action)) {";
const A_DISJOINT = [
    "            facesDisjoint: CHARACTER_KEYS.every((k) => FORBIDDEN_IN_CHARACTER_FACE.indexOf(k) < 0)",
    "                && AUTHOR_KEYS.some((k) => CHARACTER_KEYS.indexOf(k) < 0)"
].join(String.fromCharCode(10));
const A_SELF_LEN = 'assert.ok(SELF.length > 4000';

/* ══════════════════ 判据本体（纯函数：负控制要在破坏副本上重跑它们） ══════════════════ */

/** M1：登记面恰一次（位置不作判据）+ 零兄弟依赖 + 双导出 + 冻结 + 离线。 */
function judgeMeta(P, mf, src) {
    if (!P || typeof P !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    if (mf.extra_js.indexOf('knowledge-trace.js') < 0) return '本模块与其追加时的邻居（knowledge-trace.js）须都在 extra_js（位置不作判据）';
    const code = stripComments(src);
    for (const w of ['require(', 'fetch(', 'XMLHttpRequest', 'localStorage', 'indexedDB', 'WebSocket']) {
        if (code.indexOf(w) >= 0) return '模块须零依赖零联网：不得出现 ' + w;
    }
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/global\.LonShaKnowledgePreview = api;|root\.LonShaKnowledgePreview = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaKnowledgePreview !== 'object') return 'globalThis.LonShaKnowledgePreview 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaKnowledgePreview) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}

/** M2：导出面逐字（五路径四表 / 五档 / 两面键集 / 禁止表 / 依赖声明面）。 */
function judgeExports(P) {
    for (const k of ['propagationPlan', 'previewPropagation', 'previewBatch', 'authorFace', 'characterFace',
        'describe', 'selfCheck', 'line', 'surfaceDigest']) {
        if (typeof P[k] !== 'function') return '导出面缺函数：' + k;
    }
    if (P.KP_VERSION !== 1 || P.KP_PREVIEW_VERSION !== 1) return '版本常量须为 1';
    if (P.KP_KIND !== 'knowledge_preview') return 'kind 须为 knowledge_preview';
    if (P.PATHS.join(',') !== 'public,relay,private,misbelieve,correct') return '五路径逐字：' + P.PATHS.join(',');
    if (P.PREVIEW_VERDICTS.join(',') !== 'would-affect,no-change,would-reveal-secret,would-break-boundary,indeterminate') {
        return '五档逐字：' + P.PREVIEW_VERDICTS.join(',');
    }
    if (P.PLAN_VERDICTS.indexOf('degraded') < 0) return '计划面须有 degraded 一档（输入畸形不与「无事实」同形）';
    if (P.CHARACTER_KEYS.join(',') !== 'who,after') return '角色面键集须只有 who / after，实 ' + P.CHARACTER_KEYS.join(',');
    if (!Array.isArray(P.FORBIDDEN_IN_CHARACTER_FACE) || P.FORBIDDEN_IN_CHARACTER_FACE.length < 8) {
        return '生成面禁止键表须是独立真源（不由作者面派生）';
    }
    /* ★ 五路径的四张表**逐条对齐**：少一条即有路径无处安放。 */
    for (const p of P.PATHS) {
        if (!P.DIRECTION[p] || !P.PATH_ACTION[p] || !P.PATH_REASONS[p] || !P.PATH_VIA[p]) return '路径表不齐：' + p;
    }
    /* ★ 方向表：收窄与扩散**不得同形**（把私聊当扩散会让「只告诉一个人」读成「全组皆知」）。 */
    if (P.DIRECTION.private !== 'narrow' || P.DIRECTION.public !== 'spread') return '私聊须 narrow、公开须 spread';
    /* ★ 理由码五条互不同形（压成一条作者不知道该改什么）。 */
    const rc = P.PATHS.map((p) => P.PATH_REASONS[p]);
    if (new Set(rc).size !== 5) return '五条路径的理由码须互不同形';
    /* 依赖声明面：必需件只有 KNOWLEDGE_TRACE，且逐条写明缺席后果。 */
    const reqKeys = (P.REQUIRED_DEPS || []).map((r) => r.key);
    if (reqKeys.join(',') !== 'KNOWLEDGE_TRACE') return '必需依赖须只有 KNOWLEDGE_TRACE，实 ' + reqKeys.join(',');
    for (const r of P.REQUIRED_DEPS) if (!r.why) return '必需依赖须逐条写明缺席后果：' + r.key;
    if ((P.OPTIONAL_DEPS || []).indexOf('SECRET_LEDGER') < 0) return '秘密账须列为可选（缺席只影响泄漏那一档）';
    return '';
}

/** P1：五条路径各自可达且**取法不同**（目标集按路径变），未知路径不落默认档。 */
function judgePaths(P) {
    const cases = [
        ['public', { participants: ['甲', '乙'], witnesses: ['丙'] }, ['甲', '乙', '丙'], 'spread'],
        ['relay', { listener: '丁' }, ['丁'], 'spread'],
        ['private', { listener: '戊' }, ['戊'], 'narrow'],
        ['misbelieve', { participants: ['己'] }, ['己'], 'spread'],
        ['correct', { affected: ['庚'] }, ['庚'], 'narrow']
    ];
    for (const c of cases) {
        const pl = P.propagationPlan(Object.assign({ fact: F, path: c[0] }, c[1]));
        if (pl.verdict !== 'ok') return '路径 ' + c[0] + ' 须可达（verdict=ok），实 ' + pl.verdict;
        if (pl.targets.join(',') !== c[2].join(',')) return '路径 ' + c[0] + ' 的目标集须为 ' + c[2].join(',') + '，实 ' + pl.targets.join(',');
        if (pl.direction !== c[3]) return '路径 ' + c[0] + ' 方向须 ' + c[3] + '，实 ' + pl.direction;
    }
    /* ★ 私聊**不得**带上在场者（收窄路径不扩散）—— 与 public 的唯一差别所在。 */
    const priv = P.propagationPlan({ fact: F, path: 'private', listener: '戊', participants: ['甲', '乙'], witnesses: ['丙'] });
    if (priv.targets.join(',') !== '戊') return '私聊不得带上在场者（收窄路径），实 ' + priv.targets.join(',');
    /* ★ 未知路径 ⇒ 拒且**点名**，不落默认档（默认成 public 就是一次静默扩面）。 */
    const bad = P.propagationPlan({ fact: F, path: 'shout', participants: ['甲'] });
    if (bad.verdict !== 'bad-path') return '未知路径须报 bad-path（不落默认档），实 ' + bad.verdict;
    if (bad.targets.length !== 0) return '未知路径不得产出目标集（否则已扩面）';
    if (bad.knownPath !== false) return '未知路径须自报 knownPath:false';
    /* 无主体 / 无事实 / 输入畸形各自点名，互不同形。 */
    if (P.propagationPlan({ fact: F, path: 'private' }).verdict !== 'no-subject') return '私聊缺 listener 须报 no-subject';
    if (P.propagationPlan({ path: 'public', participants: ['甲'] }).verdict !== 'no-fact') return '缺事实须报 no-fact';
    const dg = P.propagationPlan('不是对象');
    if (dg.verdict !== 'degraded') return '输入畸形须报 degraded（不压成「没有事实」），实 ' + dg.verdict;
    if (dg.decidable !== false) return '输入畸形须报判不了';
    /* 目标集去重 + 计数可见。 */
    const dup = P.propagationPlan({ fact: F, path: 'public', participants: ['甲', '甲'], witnesses: ['甲'] });
    if (dup.targets.join(',') !== '甲') return '同一人既在场又目击须只算一次，实 ' + dup.targets.join(',');
    if (dup.duplicates < 1) return '去重数须可见（不静默吞）';
    return '';
}

/** V1：五档互斥可达 + 「判不了」单独一档（不得并入「改不动」）。 */
function judgeVerdicts(P, deps) {
    const tr = { traces: [{ character: '甲', fact: F, action: 'acquire', floor: 3 }] };
    /* would-affect：有人认知真的变了。 */
    const aff = P.previewPropagation({ fact: F, path: 'public', participants: ['甲', '乙'] }, tr, deps);
    if (aff.verdict !== 'would-affect') return '有人首次得知须报 would-affect，实 ' + aff.verdict;
    if (aff.byVerdict['would-affect'] !== 1 || aff.byVerdict['no-change'] !== 1) return '逐人判定须分开（甲已在格/乙会变），实 ' + JSON.stringify(aff.byVerdict);
    /* no-change：都已经知道了。 */
    const nc = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'] }, tr, deps);
    if (nc.verdict !== 'no-change') return '都已知须报 no-change，实 ' + nc.verdict;
    /* would-reveal-secret：不在知情名单上的人会经此路径得知。 */
    const rv = P.previewPropagation({ fact: F, path: 'public', participants: ['甲', '乙'], secretId: 's1', secretItem: { id: 's1' } },
        tr, { KNOWLEDGE_TRACE: KT, SECRET_LEDGER: stubSL(['甲']) });
    if (rv.verdict !== 'would-reveal-secret') return '非知情者会得知须报 would-reveal-secret，实 ' + rv.verdict;
    if (rv.byVerdict['would-reveal-secret'] !== 1) return '泄漏须逐人计（甲是 knower 不报），实 ' + JSON.stringify(rv.byVerdict);
    /* would-break-boundary：身份未验 ⇒ 整面 fail-closed（不逐人猜）。 */
    const bb = P.previewPropagation({ fact: F, path: 'public', participants: ['甲', '乙'] }, tr, deps, { identityVerified: false });
    if (bb.verdict !== 'would-break-boundary') return '身份未验须报 would-break-boundary，实 ' + bb.verdict;
    if (bb.byVerdict['would-break-boundary'] !== 2) return '身份未验须整面报（不逐人猜），实 ' + JSON.stringify(bb.byVerdict);
    /* indeterminate：轨迹模块缺席 ⇒ **判不了**（不假装改不动）。 */
    const ind = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'] }, tr, {});
    if (ind.verdict !== 'indeterminate') return '轨迹模块缺席须报判不了，实 ' + ind.verdict;
    if (ind.decidable !== false) return '轨迹模块缺席须报 decidable:false';
    if (ind.reason !== 'trace-module-absent') return '缺席理由须 trace-module-absent，实 ' + ind.reason;
    if (ind.verdict === 'no-change') return '「判不了」与「改不动」同形（本仓最贵的老账）';
    /* ★ 五档互斥：同一批读数的 verdict 必须落在 PREVIEW_VERDICTS 内且各自可达。 */
    const seen = {};
    for (const r of [aff, nc, rv, bb, ind]) {
        if (P.PREVIEW_VERDICTS.indexOf(r.verdict) < 0) return '面级档越界：' + r.verdict;
        seen[r.verdict] = true;
    }
    for (const v of ['would-affect', 'no-change', 'would-reveal-secret', 'would-break-boundary', 'indeterminate']) {
        if (!seen[v]) return '档未各自可达：' + v;
    }
    /* ★ 逐人判不了 ⇒ **面级档须为判不了**（不得被改不动 / 会变的读数淹没）。 */
    const rowInd = P.previewPropagation({ fact: F, path: 'correct', affected: ['壬'] }, { traces: [] }, deps);
    if (rowInd.verdict !== 'indeterminate') return '逐人判不了须压过其余（面级认最坏），实 ' + rowInd.verdict;
    const rowInd2 = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'], secretId: 's1', secretItem: { id: 's1' } },
        { traces: [] }, deps);
    if (rowInd2.verdict !== 'indeterminate') return '边界无从判须压过其余（面级认最坏），实 ' + rowInd2.verdict;
    /* 面级档认**最坏一条**（判不了 > 泄露 > 会变 > 改不动）。 */
    const worst = P.previewPropagation({ fact: F, path: 'public', participants: ['甲', '乙'], secretId: 's1', secretItem: { id: 's1' } },
        tr, { KNOWLEDGE_TRACE: KT, SECRET_LEDGER: stubSL([]) });
    if (worst.verdict !== 'would-reveal-secret') return '泄露须压过会变（面级认最坏），实 ' + worst.verdict;
    return '';
}

/** C1：纠正缺前提 ⇒ 判不了（**不是** no-change）；误信落 misled（**不是** knows）。 */
function judgeCorrectness(P, deps) {
    const tr = { traces: [{ character: '辛', fact: F, action: 'misbelieve', floor: 3 }] };
    /* 纠正**有**前提（此前误信）⇒ 会变、终态 knows。 */
    const good = P.previewPropagation({ fact: F, path: 'correct', affected: ['辛'] }, tr, deps);
    if (good.rows[0].after !== 'knows') return '纠正终态须 knows，实 ' + good.rows[0].after;
    if (good.rows[0].verdict !== 'would-affect') return '纠正有效误信须报会变，实 ' + good.rows[0].verdict;
    /* 纠正**无**前提（没误信过）⇒ 判不了，不报改不动。 */
    const none = P.previewPropagation({ fact: F, path: 'correct', affected: ['壬'] }, { traces: [] }, deps);
    if (none.rows[0].verdict !== 'indeterminate') return '纠正缺前提须报判不了，实 ' + none.rows[0].verdict;
    if (none.rows[0].reason !== 'nothing-to-correct') return '理由须 nothing-to-correct，实 ' + none.rows[0].reason;
    if (none.verdict === 'no-change') return '纠正缺前提不得读成「改了没事」';
    /* 误信 ⇒ misled（**不是** knows —— 未经核实不得当已知用）。 */
    const mis = P.previewPropagation({ fact: F, path: 'misbelieve', participants: ['癸'] }, { traces: [] }, deps);
    if (mis.rows[0].after !== 'misled') return '误信终态须 misled，实 ' + mis.rows[0].after;
    if (mis.rows[0].after === 'knows') return '误信不得读成已知';
    return '';
}

/** D1：依赖缺席 ⇒ 判不了；边界判不了 ⇒ 泄漏面报判不了（不假装没边界）。 */
function judgeDeps(P) {
    /* ① 轨迹模块**整个缺席** ⇒ 判不了且理由点名（不得落成「逐人判不出来」）。 */
    const gone = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'] }, { traces: [] }, {});
    if (gone.verdict !== 'indeterminate') return '轨迹模块缺席须报判不了，实 ' + gone.verdict;
    if (gone.reason !== 'trace-module-absent') return '缺席理由须 trace-module-absent（不得落成逐人判不出来），实 ' + gone.reason;
    if (gone.decidable !== false) return '缺席须报 decidable:false';
    /* ①b 依赖空壳（不是真模块）⇒ 同样判不了（不得当作在场）。 */
    const shell = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'] }, { traces: [] }, { KNOWLEDGE_TRACE: {} });
    if (shell.decidable !== false) return '依赖空壳须同样判不了（不得当作在场）';
    /* ② 轨迹面抛错 ⇒ 逐人降级（不逃逸）。 */
    const boom = { normalize: () => ({ traces: [] }), stateOf: () => { throw new Error('boom'); } };
    let escaped = false, rr = null;
    try { rr = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'] }, { traces: [] }, { KNOWLEDGE_TRACE: boom }); }
    catch (e) { escaped = true; }
    if (escaped) return '轨迹面抛错须被包住降级（不得让异常逃逸）';
    if (rr.verdict !== 'indeterminate') return '轨迹面抛错须报判不了，实 ' + rr.verdict;
    if (rr.rows[0].reason !== 'state-thrown') return '抛错理由须 state-thrown，实 ' + rr.rows[0].reason;
    /* ③ ★ 碰秘密但**边界无从判**（给了 secretId 却没给账）⇒ 判不了，不假装没边界。 */
    const unb = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'], secretId: 's1', secretItem: { id: 's1' } },
        { traces: [] }, DEPS);
    if (unb.verdict !== 'indeterminate') return '边界无从判须报判不了（不假装没边界），实 ' + unb.verdict;
    if (unb.boundaryJudgeable !== false) return '须自报 boundaryJudgeable:false';
    if (unb.rows[0].reason !== 'boundary-unjudgeable') return '理由须 boundary-unjudgeable，实 ' + unb.rows[0].reason;
    /* 有账但条目被**剥空**（只剩正文）⇒ 同样判不了（不是「没人知道」）。 */
    const empty = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'], secretId: 's1', secretItem: { text: '私密正文' } },
        { traces: [] }, { KNOWLEDGE_TRACE: KT, SECRET_LEDGER: stubSL([]) });
    if (empty.verdict !== 'indeterminate') return '秘密条目剥空后须判不了，实 ' + empty.verdict;
    /* ④ describe：缺格只列必需件（可选件缺席不误报）。 */
    const d = P.describe({});
    if (d.missingDeps.join(',') !== 'KNOWLEDGE_TRACE') return '缺格须只列必需件，实 ' + d.missingDeps.join(',');
    if (P.describe(DEPS).missingDeps.length !== 0) return '依赖齐备时不得报缺格';
    if (P.describe({}).optionalMissing.join(',') !== 'SECRET_LEDGER') return '可选件缺席须另列（不与必需件混）';
    /* ⑤ selfCheck：真跑五条路径 + 判不了探针（不只对常量自己断言）。 */
    const sc = P.selfCheck({});
    if (sc.ok !== true) return '自检须通过：' + JSON.stringify(sc.problems);
    if (sc.probes.public < 1 || sc.probes.relay < 1 || sc.probes.private < 1) return '自检须真跑三条增知路径';
    if (sc.probes.misbelieve !== 'misled') return '自检误信探针须落 misled';
    if (sc.probes.correct !== 'knows') return '自检纠正探针须落 knows';
    if (sc.probes.degraded !== 'degraded') return '自检须含输入畸形探针';
    return '';
}

/** S1：两面严格分离 —— 角色面键集与禁止表不相交，且**派生式禁止表**（不由作者面派生）。 */
function judgeFaces(P, deps, src) {
    const prev = P.previewPropagation({ fact: F, path: 'public', participants: ['甲', '乙', '丙'] },
        { traces: [{ character: '甲', fact: F, action: 'acquire', floor: 3 }] }, deps);
    const af = P.authorFace(prev);
    const cf = P.characterFace(prev);
    /* 作者面：带理由 / 途径 / 动作 / 改法建议。 */
    for (const k of ['who', 'before', 'after', 'verdict', 'reason', 'via', 'action', 'reasonCode', 'advice']) {
        if (!(k in af.rows[0])) return '作者面缺键：' + k;
    }
    if (!af.rows[0].advice) return '作者面须给改法建议（他要据此改稿）';
    /* ★ 角色面：**只有** who / after（其余收敛为 withheld 计数）。 */
    for (const r of cf.rows) {
        const ks = Object.keys(r);
        if (ks.join(',') !== 'who,after') return '角色面行键集须恰为 who,after，实 ' + ks.join(',');
    }
    if (cf.rows.length !== 2) return '角色面须只带「会变且终态已知」者（甲已在格不带），实 ' + cf.rows.length;
    if (cf.withheld !== 1) return '未进生成面者须计入 withheld，实 ' + cf.withheld;
    /* ★ 逐键核对：角色面**不得**出现禁止表里的任何键（含改稿建议与证据键）。 */
    for (const r of cf.rows) {
        for (const k of Object.keys(r)) {
            if (P.FORBIDDEN_IN_CHARACTER_FACE.indexOf(k) >= 0) return '角色面混入禁止键：' + k;
        }
    }
    if (P.describe(deps).facesDisjoint !== true) return '面级自述须报两面分离成立';
    /* ★ 两面**确实不同宽**（否则「分离」是个空判据）。 */
    if (!P.AUTHOR_KEYS.some((k) => P.CHARACTER_KEYS.indexOf(k) < 0)) return '两面键集须确实不同宽（否则分离判据恒真）';
    /* ★ 禁止表是**独立真源**：不得写成由 AUTHOR_KEYS 派生（派生表会随作者面一起加宽而失效）。 */
    const code = stripComments(src);
    const fi = code.indexOf('FORBIDDEN_IN_CHARACTER_FACE = Object.freeze([');
    if (fi < 0) return '禁止表须是显式字面量表';
    const seg = code.slice(fi, code.indexOf(']', fi));
    if (seg.indexOf('AUTHOR_KEYS') >= 0) return '禁止表不得由作者面键集派生（那是拿自己当对照）';
    for (const k of ['reason', 'advice', 'evidenceKey', 'verdict', 'before']) {
        if (seg.indexOf("'" + k + "'") < 0) return '禁止表须逐字列出：' + k;
    }
    /* 预演**剥一切正文键**（防绕过外供路径）：作者面的行也不带正文。 */
    const leak = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'], secretId: 's1', secretItem: { id: 's1', text: '私密正文段' } },
        { traces: [] }, deps);
    const body = JSON.stringify(P.authorFace(leak));
    for (const w of ['私密正文段', 'secretItem', '"text"']) {
        if (body.indexOf(w) >= 0) return '作者面不得带正文键：' + w;
    }
    if (P.authorFace(leak).carriesBody !== false) return '作者面须自报 carriesBody:false';
    return '';
}

/** Z1：零写（不改入参 / 不写账）+ 批量与单条同函 + 同源不重复造证据 + 空批≠全判不了。 */
function judgeZeroWrite(P, deps, src) {
    /* ① 入参不被就地改（payload / trace / opts 三处快照）。 */
    const payload = { fact: F, path: 'public', participants: ['甲', '乙'], opts: { x: 1 } };
    const trace = { traces: [{ character: '甲', fact: F, action: 'acquire', floor: 3 }] };
    const opts = { identity: 'surface' };
    const s1 = JSON.stringify(payload), s2 = JSON.stringify(trace), s3 = JSON.stringify(opts);
    P.propagationPlan(payload, opts);
    P.previewPropagation(payload, trace, deps, opts);
    P.previewBatch([payload, payload], trace, deps, opts);
    P.authorFace(P.previewPropagation(payload, trace, deps, opts));
    if (JSON.stringify(payload) !== s1 || JSON.stringify(trace) !== s2 || JSON.stringify(opts) !== s3) {
        return '预演不得改写传入的 payload / trace / opts（本面零写）';
    }
    /* ② 源码零写口（本面是纯函数面 —— 写口归 owner）。 */
    const code = stripComments(src);
    for (const w of ['storage.save', 'localStorage.setItem', 'writeFile', 'collectExport(']) {
        if (code.indexOf(w) >= 0) return '预演面不得带写口：' + w;
    }
    /* ③ 批量与单条**同函**：批内每条与直接调单条逐字同形。 */
    const plans = [{ fact: F, path: 'public', participants: ['甲', '乙'] },
        { fact: F, path: 'private', listener: '丙' }];
    const b = P.previewBatch(plans, trace, deps);
    if (b.total !== 2) return '批量须逐条出读数，实 ' + b.total;
    for (let i = 0; i < plans.length; i++) {
        const one = P.previewPropagation(plans[i], trace, deps, { path: plans[i].path });
        if (JSON.stringify(b.rows[i].byVerdict) !== JSON.stringify(one.byVerdict)) {
            return '批量第 ' + i + ' 条须与单条同函（读数须逐字同形）';
        }
    }
    if (b.order.join(',') !== 'public,private') return '最危险排序须是读数（不改判定），实 ' + b.order.join(',');
    /* ④ ★ 同一条传播事件**不生成多条重复证据**（同证据键 + 同角色 + 同动作 ⇒ 改不动）。 */
    const dupTr = { traces: [{ character: '甲', fact: F, action: 'acquire', floor: 3, evidenceKey: 'EV-1' }] };
    const dup = P.previewPropagation({ fact: F, path: 'public', participants: ['甲'], evidenceKey: 'EV-1' }, dupTr, deps);
    if (dup.rows[0].reason !== 'evidence-already-recorded') return '同源重复须点名 evidence-already-recorded，实 ' + dup.rows[0].reason;
    if (dup.duplicateEvidence !== 1) return '同源重复须计数可见，实 ' + dup.duplicateEvidence;
    const dupB = P.previewBatch([{ fact: F, path: 'public', participants: ['甲'], evidenceKey: 'EV-1' }], dupTr, deps);
    if (dupB.duplicateEvidence !== 1) return '批量须同样计入同源重复，实 ' + dupB.duplicateEvidence;
    /* ⑤ ★ 空批与「有但全被判不了」**不同形**。 */
    const empty = P.previewBatch([], trace, deps);
    if (empty.total !== 0) return '空批 total 须 0，实 ' + empty.total;
    if (empty.measurable !== true) return '空批是可测的（真跑过、确实没有），实 ' + empty.measurable;
    if (empty.indeterminate !== 0) return '空批不得报判不了';
    const allInd = P.previewBatch([{ fact: F, path: 'public', participants: ['甲'] }], trace, {});
    if (allInd.total !== 1 || allInd.indeterminate !== 1) return '全判不了的批须与空批不同形，实 ' + allInd.total + '/' + allInd.indeterminate;
    const nonArr = P.previewBatch('不是数组', trace, deps);
    if (nonArr.measurable === true) return '非数组入参不得报可测';
    return '';
}

/** H1：宿主接线逐符号在场（取库口 / 装配点 / 八出口 / 降级 / 诊断行 / 不落笔）。 */
function judgeHost(src) {
    for (const s of [
        "_moduleLib(() => window.LonShaKnowledgePreview, 'knowledge-preview.js')",
        'function _knowledgePreviewLib() {', '_knowledgePreviewDeps() {', '_knowledgePreviewAbsent(reason) {',
        'knowledgePreviewPlan(payload, opts) {', 'knowledgePreviewRun(payload, trace, opts) {',
        'knowledgePreviewBatch(plans, trace, opts) {', 'knowledgePreviewAuthorFace(preview) {',
        'knowledgePreviewCharacterFace(preview) {', 'knowledgePreviewDescribe() {', 'knowledgePreviewLine() {'
    ]) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    for (const s of ["['知识预演',", '_lastPreview', 'this.knowledgePreviewLine()']) {
        const n = src.split(s).length - 1;
        if (n < 1) return '宿主口须在场：' + s + '（实 ' + n + '）';
    }
    /* ★ 与「知识轨迹」「知情网络」诊断行**分列**（三个问题，不得合成一行）。 */
    for (const s of ["['知识预演'", "['知识轨迹'", "['知情网络'"]) {
        if (src.indexOf(s) < 0) return '诊断行须自成一行且与姊妹面分列：' + s;
    }
    /* ★ 装配点键名须与内核 REQUIRED_DEPS 逐字一致（判在装配点方法体切片里）。 */
    const da = src.indexOf('_knowledgePreviewDeps() {');
    const db = src.indexOf('knowledgePreviewPlan(payload, opts) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of KP.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    for (const opt of KP.OPTIONAL_DEPS) {
        if (depsSeg.indexOf(opt + ':') < 0) return '装配点缺可选依赖键：' + opt;
    }
    if (depsSeg.indexOf('LonShaKnowledgeTrace') < 0) return '装配点必须取轨迹内核（唯一真源）';
    /* ★ 出口不得自己落笔（纯函数面：写口归 owner）。 */
    const pa = src.indexOf('knowledgePreviewPlan(payload, opts) {');
    const pb = src.indexOf('knowledgePreviewLine() {');
    if (pa < 0 || pb <= pa) return '出口方法体切片失败（判据失效）';
    const outSeg = src.slice(pa, pb);
    for (const w of ['storage.save', 'restoreFromPayload(', 'localStorage', 'collectExport(', 'writeFile']) {
        if (outSeg.indexOf(w) >= 0) return '本面是纯函数面，出口不得落笔：' + w;
    }
    if (outSeg.indexOf('KP.propagationPlan(') < 0) return '计划出口必须真调用内核 propagationPlan（不得自己重算一遍）';
    if (outSeg.indexOf('KP.previewPropagation(') < 0) return '单条出口必须真调用内核 previewPropagation';
    if (outSeg.indexOf('KP.previewBatch(') < 0) return '批量出口必须真调用内核 previewBatch';
    if (outSeg.indexOf('KP.authorFace(') < 0 || outSeg.indexOf('KP.characterFace(') < 0) return '两面出口必须真调用内核';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_knowledgePreviewDeps() {', '_knowledgePreviewAbsent(reason) {', 'knowledgePreviewPlan(payload, opts) {',
    'knowledgePreviewRun(payload, trace, opts) {', 'knowledgePreviewBatch(plans, trace, opts) {',
    'knowledgePreviewAuthorFace(preview) {', 'knowledgePreviewCharacterFace(preview) {',
    'knowledgePreviewDescribe() {', 'knowledgePreviewLine() {'
];
const LIB_FNS = ['function _moduleLib(getGlobal, fileName) {', 'function _knowledgePreviewLib() {'];
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
function engineFrom(src, win) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(src, h)).join(',' + J);
    if (!libs || HOST_METHODS.some((h) => methodBody(src, h) === null)) {
        throw new Error('宿主接线抽取失败（接线被摘或改名）：判据扫描面失效');
    }
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', 'ARCHIVE_TOP_LEVEL_KEYS',
        libs + J + 'return ({ ' + body + ' });')(() => {}, 'v3315', win || libWindow(), []);
    return Object.assign(eng, { config: { config: { debugMode: false } }, _lastPreview: null });
}
const libWindow = () => ({ LonShaKnowledgePreview: KP, LonShaKnowledgeTrace: KT });

/** 破坏副本（落盘 + 语法校验 + 真加载）。 */
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3315-' + tag + '-'));
    const fp = path.join(dir, MOD);
    const broken = breakSource(MOD_SRC, anchor, repl, tag);
    assertSingleHit(MOD_SRC, anchor, tag);
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(fp);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3315 M1. ★★★★ 模块登记面：分发面恰一次（零兄弟依赖 / 零联网）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(ROOT, MOD)), MOD + ' 必须在场');
    assert.equal(judgeMeta(KP, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
    ok('模块 ' + MOD + '：' + MOD_SRC.split('\n').length + ' 行 / ' + Object.keys(KP).length + ' 导出项');
});

test('v3315 M2. ★★★★ 导出面：九函数 + 五路径四表 + 五档 + 两面键集 + 独立禁止表', () => {
    assert.equal(judgeExports(KP), '', '导出面判据');
    assert.equal(KP.PREVIEW_VERDICTS.length, 5, '预演五档');
    ok('禁止表项：' + KP.FORBIDDEN_IN_CHARACTER_FACE.join('、'));
});

/* ══════════════════ P 五条传播路径 ══════════════════ */
test('v3315 P1. ★★★★★ 五条路径各自可达且取法不同（私聊不扩散）；未知路径不落默认档', () => {
    assert.equal(judgePaths(KP), '', '路径判据');
    ok('surfaceDigest：' + JSON.stringify(KP.surfaceDigest(KP)));
});

/* ══════════════════ V 预演五档 ══════════════════ */
test('v3315 V1. ★★★★★ 五档互斥可达；「判不了」单独一档（不得并入「改不动」）', () => {
    assert.equal(judgeVerdicts(KP, DEPS), '', '预演档判据');
});

/* ══════════════════ C 纠正 / 误信语义 ══════════════════ */
test('v3315 C1. ★★★★★ 纠正缺前提 ⇒ 判不了（不是改不动）；误信落 misled（不是 knows）', () => {
    assert.equal(judgeCorrectness(KP, DEPS), '', '纠正 / 误信判据');
});

/* ══════════════════ D 依赖与边界 fail-closed ══════════════════ */
test('v3315 D1. ★★★★★ 依赖缺席 ⇒ 判不了；边界无从判 ⇒ 报判不了（不假装没边界）', () => {
    assert.equal(judgeDeps(KP), '', '依赖与边界判据');
});

/* ══════════════════ S 两面严格分离 ══════════════════ */
test('v3315 S1. ★★★★★ 作者面 / 角色生成面严格分离：键集不相交 + 禁止表独立真源 + 剥正文', () => {
    assert.equal(judgeFaces(KP, DEPS, MOD_SRC), '', '两面分离判据');
});

/* ══════════════════ Z 零写与同源去重 ══════════════════ */
test('v3315 Z1. ★★★★★ 预演零写；批量与单条同函；同源不重复造证据；空批 ≠ 全判不了', () => {
    assert.equal(judgeZeroWrite(KP, DEPS, MOD_SRC), '', '零写与去重判据');
});

/* ══════════════════ H 宿主接线与端到端 ══════════════════ */
test('v3315 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 八出口 / 降级 / 诊断行 / 不落笔）', () => {
    assert.equal(judgeHost(IDX_SRC), '', '宿主接线判据');
});

test('v3315 H2. ★★★★★ 端到端：宿主真跑一次预演 ⇒ 五档 / 两面 / 诊断行各自成读数', () => {
    const eng = engineFrom(IDX_SRC);
    const F2 = '他杀过人';
    const plan = eng.knowledgePreviewPlan({ fact: F2, path: 'public', participants: ['甲', '乙'] });
    assert.equal(plan.verdict, 'ok', '真计划须可算，实 ' + plan.verdict);
    assert.equal(plan.targets.length, 2);
    const r = eng.knowledgePreviewRun({ fact: F2, path: 'public', participants: ['甲', '乙'] }, { traces: [] });
    assert.equal(r.verdict, 'would-affect', '真预演须报会变，实 ' + r.verdict);
    /* 作者面有理由 / 角色面只有 who,after；两面**不同形**。 */
    const af = eng.knowledgePreviewAuthorFace(r);
    const cf = eng.knowledgePreviewCharacterFace(r);
    assert.ok(af.rows[0].advice, '作者面须带改法建议');
    assert.deepEqual(Object.keys(cf.rows[0]), ['who', 'after'], '角色面行键集须恰为 who,after');
    /* 诊断行报出上次读数。 */
    const l = eng.knowledgePreviewLine();
    assert.ok(l.indexOf('上次') === 0, '诊断行须报出上次读数，实 ' + l);
    /* 批量态读数。 */
    const b = eng.knowledgePreviewBatch([{ fact: F2, path: 'public', participants: ['甲'] },
        { fact: F2, path: 'private', listener: '丙' }], { traces: [] });
    assert.equal(b.total, 2, '批内两条，实 ' + b.total);
    const lb = eng.knowledgePreviewLine();
    assert.ok(lb.indexOf('上次 batch') === 0, '批量后诊断行须报批量态，实 ' + lb);
    /* ★ 模块整个未挂 ⇒ 同键降级（不报「会变」也不报「改了没事」）。 */
    const engGone = engineFrom(IDX_SRC, { LonShaKnowledgeTrace: KT });
    const gone = engGone.knowledgePreviewRun({ fact: F2, path: 'public', participants: ['甲'] }, { traces: [] });
    assert.equal(gone.ok, false, '模块缺席须报 ok:false');
    assert.equal(gone.state, 'absent', '模块缺席须报 state:absent');
    assert.equal(engGone.knowledgePreviewLine(), '模块未加载（knowledge-preview.js）', '模块未挂的诊断行自成一体');
    /* 轨迹内核缺格（本面唯一必需件）⇒ 判不了，且诊断行点名缺的那一格。 */
    const engNoDep = engineFrom(IDX_SRC, { LonShaKnowledgePreview: KP });
    const noDep = engNoDep.knowledgePreviewRun({ fact: F2, path: 'public', participants: ['甲'] }, { traces: [] });
    assert.equal(noDep.decidable, false, '轨迹缺格须判不了');
    const dl = engNoDep.knowledgePreviewLine();
    assert.ok(dl.indexOf('依赖缺格') >= 0 && dl.indexOf('KNOWLEDGE_TRACE') >= 0, '诊断行须点名缺格，实 ' + dl);
});

/* ══════════════════ V 版本锚 ══════════════════ */
test('v3315 V2. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3315000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.315.0'"), '当版锚点必须显式留在本档里');
});

/* ══════════════════ X 真源码破坏 → 同一条真判据必须翻红 ══════════════════ */
test('v3315 X1. ★★★★★ 真源码破坏 -> 同一条真判据必须翻红（七条各自现形，且原版必须绿）', () => {
    /* L0 地基：同一批判据在**原版**上必须全部通过（否则「翻红」不归因于破坏）。 */
    assert.equal(judgePaths(KP), '', '地基 paths');
    assert.equal(judgeVerdicts(KP, DEPS), '', '地基 verdicts');
    assert.equal(judgeCorrectness(KP, DEPS), '', '地基 correctness');
    assert.equal(judgeDeps(KP), '', '地基 deps');
    assert.equal(judgeFaces(KP, DEPS, MOD_SRC), '', '地基 faces');
    assert.equal(judgeZeroWrite(KP, DEPS, MOD_SRC), '', '地基 zeroWrite');
    assert.equal(judgeExports(KP), '', '地基 exports');
    /* ★ 破副本**抛错**也算翻红：不能因为异常逃逸就让后续断言静默漏跑（本仓负向探针纪律）。 */
    const broke = (fn) => { try { return fn(); } catch (e) { return '破副本抛错（视作翻红）：' + String((e && e.message) || e); } };
    /* ① 未知路径落默认档（路径名写错 ⇒ 全部公开，一次静默扩面）。 */
    {
        const b = loadBroken('badpath', A_BADPATH, '        if (false) {');
        assert.notEqual(broke(() => judgePaths(b)), '', '破坏 badpath 后路径判据必须翻红');
    }
    /* ② 轨迹模块缺席不再报判不了（会被读成「改了没事」）。 */
    {
        const b = loadBroken('absent', A_ABSENT, '        const kt = _ktOf(d) || {};');
        assert.notEqual(broke(() => judgeDeps(b)), '', '破坏 absent 后判不了判据必须翻红');
    }
    /* ③ 面级档不再认最坏一条（判不了被改不动的读数淹没）。 */
    {
        const b = loadBroken('rowind', A_ROWIND, "            Object.assign(out, { verdict: 'no-change', reason: 'row-level-undecidable', decidable: false });");
        assert.notEqual(broke(() => judgeVerdicts(b, DEPS)), '', '破坏 rowind 后面级档判据必须翻红');
    }
    /* ④ 边界无从判被当成「有账」（泄漏面静默放宽 —— 正是 M-O8 治过的那条路）。 */
    {
        const b = loadBroken('boundary', A_BOUNDARY, "            boundaryOk = !!(true || secretItem");
        assert.notEqual(broke(() => judgeDeps(b)), '', '破坏 boundary 后边界判据必须翻红');
    }
    /* ⑤ 角色生成面不再收窄（把全部行都发给生成面）。 */
    {
        const b = loadBroken('charface', A_CHARFACE, '        const rows = list.map((r) => ({ who: r.who, after: r.after }))');
        assert.notEqual(broke(() => judgeFaces(b, DEPS, MOD_SRC)), '', '破坏 charface 后两面分离判据必须翻红');
    }
    /* ⑥ 同源重复不再判（同一传播事件造出第二条证据）。 */
    {
        const b = loadBroken('dup', A_DUP, '                && false) {');
        assert.notEqual(broke(() => judgeZeroWrite(b, DEPS, MOD_SRC)), '', '破坏 dup 后同源去重判据必须翻红');
    }
    /* ⑦ 分离自述恒真（拿自己当对照）。 */
    {
        const b = loadBroken('disjoint', A_DISJOINT, '            facesDisjoint: false');
        assert.notEqual(broke(() => judgeFaces(b, DEPS, MOD_SRC)), '', '破坏 disjoint 后分离自述判据必须翻红');
    }
    /* ⑧ 判据面自伤：本档自己的锚点纪律（锚只声明一次 / 自档保有足够判据体）。 */
    for (const nm of ['A_BADPATH', 'A_ABSENT', 'A_ROWIND', 'A_BOUNDARY', 'A_CHARFACE', 'A_DUP', 'A_DISJOINT', 'A_SELF_LEN']) {
        assert.equal(SELF.split('const ' + nm + ' = ').length - 1, 1, '锚点 ' + nm + ' 的**声明**须在本档只出现一次');
    }
    assert.ok(SELF.length > 4000, '本档须保有足够判据体（防被截断后仍报绿）');
    /* ⑨ 判据纯度：真源锚须恰 1 次（定点破坏的地基）。 */
    for (const a of [A_BADPATH, A_ABSENT, A_ROWIND, A_BOUNDARY, A_CHARFACE, A_DUP, A_DISJOINT]) {
        assert.equal(MOD_SRC.split(a).length - 1, 1, '真源锚须恰中 1 次（定点破坏的地基）：' + a.slice(0, 40));
    }
});
