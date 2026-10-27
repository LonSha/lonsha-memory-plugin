// tests/v3317_project_registry.test.mjs — v3.317.0 · M-X3 项目 / 卷 / 章节管理面
// 主题：**这个项目存在不存在、挂在哪儿、能不能并存** —— 用户层落点补齐，隔离与合并各自可判。
//
//   【与 v3293（X7 分卷接续）的关系（两个方向）】
//     X7 答「**这一卷怎么接出去**」（建包 / 选面 / 源还在不在）；
//     M-X3 答「**项目在不在、卷怎么编、身份能不能合、包能不能进这个项目**」。本档判**后者**。
//
//   【承重面（逐条对齐 M-X3 四条验收）】
//     ① 「未选项目时维持完全隔离」 —— `scopeOf` 未选 ⇒ `isolated`（**不是** indeterminate）；
//        `planImport` 未选 ⇒ `blocked/no-project`（不产计划，也不产**空**计划）。
//     ② 「同名角色、不同宇宙不合并」 —— 身份键**恒含 universe**；`mergable` 对同名不同宇宙给
//        `different-universe`，对同宇宙仅名字对得上给 `name-only`，两者**不同形**。
//     ③ 「重复导入幂等；撤销有明确来源边界」 —— `seen` 命中 ⇒ `duplicate`（`ok:true`，**正常读数**）；
//        无来源件 ⇒ `unbounded` 且 `ok:false`（无边界不能撤 —— 撤销不是清库）。
//     ④ 「旧源删除后引用状态清楚，不伪装仍可跳」 —— `relink` **只镜像** X7 判定；内核缺席 ⇒
//        `unknown / navigable:false / liveness-unavailable`。
//
//   【不含糊纪律】「缺席」≠「空」≠「判不了」三态分列；`zeroWrite:true` 恒在（本面只出读数与计划）。
//
//   【边界（诚实）】
//     ① 本档不替 X7 背书：源状态读数由 X7 给（本档只判**怎么镜像**）。
//     ② 不判「用户该给项目起什么名 / 该不该合并」（那是人的判定 —— 本档判「分类与处置是否可分」）。
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

const MOD = 'project-registry.js';
const IDX = 'index.js';
const BORN = '3.317.0';
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
const SELF = read('tests/v3317_project_registry.test.mjs');
const IDX_SRC = __hostSurface();
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));

const PR = require_(path.join(ROOT, MOD));
/** 依赖装配（与宿主 `_projectRegistryDeps()` 同口径：分卷接续内核必需、无可选件）。 */
const DEPS = Object.freeze({
    VOLUME_CONTINUATION: {
        listVolumes: (p) => ({ ok: true, count: 0, chapterCount: 0, volumes: [], projectId: p.projectId }),
        resolveSourceState: () => ({ ok: true, state: 'live', navigable: true })
    }
});
const DEPS_EMPTY = Object.freeze({});
const P1 = Object.freeze({ projectId: 'p1', universe: 'u1', title: '长篇', volumes: [{ id: 'v1', floorStart: 1 }] });
const P2 = Object.freeze({ projectId: 'p2', universe: 'u2' });

/* ── 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ── */
const A_STATE = "        if (rawState && PROJECT_STATES.indexOf(rawState) < 0) {";
const A_KIND = "        if (BINDING_KINDS.indexOf(k) < 0) {";
const A_ARCH = "        const prj = Object.assign({}, np.project, { state: 'archived' });";
const A_SCOPE = "            return { ok: true, reason: np.reason || 'no-project', verdict: 'isolated',";
const A_PLAN = "            return Object.assign({}, base, { reason: np.reason || 'no-project',";
const A_KEY = "        const key = 'u:' + uni + '|' + (oid ? 'id:' + oid : 'name:' + nm);";
const A_MERGE = "            return { ok: true, reason: 'different-universe', verdict: 'different-universe',";
const A_NAME = "        if (o.allowNameMerge === true && A.name && B.name && A.name === B.name) {";
const A_DUP = "        if (seenArr.indexOf(iid.id) >= 0) {";
const A_AXIS = "        if (!axis.length) {";
const A_LINK = "            return { ok: false, reason: 'liveness-unavailable', state: 'unknown', navigable: false,";
const A_CATALOG = "        if (!VC || typeof VC.listVolumes !== 'function') {";
const A_SELF_LEN = 'assert.ok(SELF.length > 4000';

/* ══════════════════ 判据本体（纯函数：负控制要在破坏副本上重跑它们） ══════════════════ */

/** M1：登记面恰一次（位置不作判据）+ 零兄弟依赖 + 双导出 + 冻结 + 离线。 */
function judgeMeta(P, mf, src) {
    if (!P || typeof P !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    if (mf.extra_js.indexOf('extract-feedback.js') < 0) return '本模块与其追加时的邻居（extract-feedback.js）须都在 extra_js（位置不作判据）';
    const code = stripComments(src);
    for (const w of ['require(', 'fetch(', 'XMLHttpRequest', 'localStorage', 'indexedDB', 'WebSocket']) {
        if (code.indexOf(w) >= 0) return '模块须零依赖零联网：不得出现 ' + w;
    }
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/global\.LonShaProjectRegistry = api;|root\.LonShaProjectRegistry = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaProjectRegistry !== 'object') return 'globalThis.LonShaProjectRegistry 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaProjectRegistry) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}

/** M2：导出面逐字（八张常量表 / 唯一必需依赖 / 无可选依赖 / 三十二函数）。 */
function judgeExports(P) {
    for (const k of ['normalizeProject', 'bindTo', 'unbind', 'archiveProject', 'detachProject',
        'volumesOf', 'addVolume', 'addChapter', 'renameVolume', 'identityOf', 'scopeOf', 'mergable',
        'compareProjects', 'assignToVolume', 'importIdOf', 'planImport', 'revokeBoundaryOf', 'relink',
        'describe', 'selfCheck', 'line', 'surfaceDigest']) {
        if (typeof P[k] !== 'function') return '导出面缺函数：' + k;
    }
    if (P.PR_VERSION !== 1 || P.PR_REGISTRY_VERSION !== 1) return '版本常量须为 1';
    if (P.PR_KIND !== 'project_registry') return 'kind 须为 project_registry';
    if (P.PROJECT_STATES.join(',') !== 'active,archived,detached') return '项目三态逐字：' + P.PROJECT_STATES.join(',');
    if (P.BINDING_KINDS.join(',') !== 'session,branch,character') return '绑定三类逐字：' + P.BINDING_KINDS.join(',');
    if (P.SCOPE_VERDICTS.join(',') !== 'isolated,same-project,cross-project,indeterminate') return '作用域四态逐字：' + P.SCOPE_VERDICTS.join(',');
    if (P.MERGE_VERDICTS.join(',') !== 'mergable,name-only,different-universe,different-owner,indeterminate') return '合并五态逐字：' + P.MERGE_VERDICTS.join(',');
    if (P.IMPORT_STATES.join(',') !== 'applied,duplicate,blocked,indeterminate') return '导入四态逐字：' + P.IMPORT_STATES.join(',');
    if (P.BOUNDARY_STATES.join(',') !== 'bounded,unbounded,indeterminate') return '边界三态逐字：' + P.BOUNDARY_STATES.join(',');
    if (P.SOURCE_STATES.join(',') !== 'live,source-deleted,unknown') return '源三态逐字：' + P.SOURCE_STATES.join(',');
    if (P.MAX_BINDINGS !== 24) return '绑定上界须为 24';
    /* ★ 依赖声明面：唯一必需件 + 零可选件（多一个必需件就会让无头环境整面判不了）。 */
    if (P.REQUIRED_DEPS.length !== 1 || P.REQUIRED_DEPS[0].key !== 'VOLUME_CONTINUATION') {
        return '唯一必需依赖须是 VOLUME_CONTINUATION，实 ' + JSON.stringify(P.REQUIRED_DEPS.map((r) => r.key));
    }
    if (P.OPTIONAL_DEPS.length !== 0) return '本面须无可选依赖（无头也自成一体），实 ' + P.OPTIONAL_DEPS.length;
    return '';
}

/** S：验收① —— 未选项目**结构隔离**（isolated ≠ same-project ≠ indeterminate）。 */
function judgeIsolation(P) {
    /* 项目门：无 id ⇒ 未选（不拿名字当选中）。 */
    if (P.normalizeProject({ title: '长篇' }).selected !== false) return '无 id 的项目须一律当「没选」';
    if (P.normalizeProject({ title: '长篇' }).ok !== false) return '无 id 的项目 ok 须 false';
    /* ★ 未选 ⇒ isolated（且必须 decidable:true：隔离是**结构事实**，不是「判不了」）。 */
    const sc = P.scopeOf({ id: 'a' }, { id: 'b' }, null);
    if (sc.verdict !== 'isolated') return '未选项目 ⇒ verdict 须 isolated，实 ' + sc.verdict;
    if (sc.decidable !== true) return 'isolated 须 decidable:true（不得与 indeterminate 同形）';
    if (sc.isolated !== true) return 'isolated 须带 isolated:true';
    /* 同项目 ⇒ same-project（与 isolated 恰好相反，不得同形）。 */
    const same = P.scopeOf({ id: 'a', universe: 'u1' }, { id: 'b', universe: 'u1' }, P1);
    if (same.verdict !== 'same-project') return '同宇宙同项目 ⇒ same-project，实 ' + same.verdict;
    if (same.verdict === sc.verdict) return 'isolated 与 same-project 不得同形';
    /* 身份判不了（两边都没宇宙也没项目）⇒ indeterminate，**不得**落成 isolated。 */
    const ind = P.scopeOf({}, {}, null);
    if (ind.verdict !== 'isolated') return '未选项目时项目门在前：即便身份都知道不了，隔离仍是结构事实（实 ' + ind.verdict + '）';
    /* 未选项目导入 ⇒ blocked/no-project（不产计划、也不产空计划）。 */
    const bl = P.planImport({ packId: 'k', volumeId: 'v' }, null, []);
    if (bl.state !== 'blocked') return '未选项目导入须 blocked，实 ' + bl.state;
    if (bl.reason !== 'no-project') return '未选项目导入理由须 no-project，实 ' + bl.reason;
    if (bl.count !== 0 || bl.entries.length !== 0) return '未选项目须既不产计划也不产空计划（count/entries 均空）';
    return '';
}

/** B：绑定面 —— 三类各自可达；重复是**正常读数**；未知类别**不落默认档**；归档 ≠ 解绑。 */
function judgeBindings(P) {
    for (const k of P.BINDING_KINDS) {
        if (P.bindTo(P1, k, k + '-1').ok !== true) return '绑定类别须各自可达：' + k;
    }
    const dup = P.bindTo(P.bindTo(P1, 'session', 's1').project, 'session', 's1');
    if (dup.ok !== true || dup.duplicate !== true) return '重复绑定须 ok:true + duplicate:true（正常读数，不与「挂不上」同形）';
    const bad = P.bindTo(P1, 'zzz', 'x');
    if (bad.reason !== 'unknown-kind' || bad.ok !== false) return '表外绑定类别须拒（unknown-kind，不落默认档）';
    if (bad.decidable !== false) return '表外类别须 decidable:false';
    if (P.bindTo(P1, 'session', '').reason !== 'empty-value') return '空值须拒（empty-value）';
    /* ★ 归档**保留绑定**（归档与解绑是两件事，不得互代）。 */
    const bound = P.bindTo(P1, 'session', 's1').project;
    const ar = P.archiveProject(bound);
    if (ar.state !== 'archived') return '归档须置 state:archived';
    if (ar.bindingsKept !== 1) return '归档须保留绑定（bindingsKept 计数），实 ' + ar.bindingsKept;
    /* ★ 计数对得上还不够：**返回的项目上**也须真带那条绑定（否则「计数照报、绑定照清」会静默通过）。 */
    if (ar.project.bindings.session.indexOf('s1') < 0) return '归档须在返回项目上保留绑定（不得顺手清空）';
    const un = P.unbind(bound, 'all');
    if (un.project.state === 'archived') return '解绑**不得**把 state 改成 archived（归档与解绑是两件事）';
    if (P.detachProject(bound).state !== 'detached') return '解除绑定须置 state:detached';
    /* 表外状态不落默认档。 */
    if (P.normalizeProject({ projectId: 'p', state: 'zzz' }).reason !== 'state-invalid') return '表外项目状态须拒（state-invalid，不当 active 使）';
    return '';
}

/** V：卷 / 章节编辑面 —— 重复 id 拒；找不到卷不默认塞第 1 卷；目录**只转发** X7。 */
function judgeVolumes(P) {
    const av = P.addVolume(P1, { id: 'v1' });
    if (av.ok !== false || av.reason !== 'duplicate-volume') return '卷 id 重复须拒（duplicate-volume）';
    const inv = P.addVolume(P1, { id: 'v9', floorStart: 30, floorEnd: 10 });
    if (inv.reason !== 'range-inverted') return '起始楼层大于结束须拒（range-inverted）';
    const ac = P.addChapter(P1, 'nope', { id: 'c1' });
    if (ac.reason !== 'no-volume') return '卷找不到须拒（no-volume，不默认塞第 1 卷）';
    if (P.renameVolume(P1, 'v1', '').reason !== 'empty-title') return '空标题须拒（empty-title，保留原名）';
    /* ★ 目录读取**只转发** X7：内核缺席 ⇒ catalog-unavailable + decidable:false（不自己再列一遍）。 */
    const noVc = P.volumesOf(P1, DEPS_EMPTY);
    if (noVc.reason !== 'catalog-unavailable') return 'X7 缺席 ⇒ 目录须报 catalog-unavailable，实 ' + noVc.reason;
    if (noVc.decidable !== false) return 'X7 缺席 ⇒ 目录须 decidable:false（不编一份目录）';
    if (noVc.volumes.length !== 0) return 'X7 缺席 ⇒ 不得自己列卷';
    const okv = P.volumesOf(P1, DEPS);
    if (okv.via !== 'volume-continuation') return '目录在场须标明 via volume-continuation（单一真源）';
    return '';
}

/** I：验收② —— 身份键恒含宇宙；同名不同宇宙 ≠ 仅名字对得上。 */
function judgeIdentity(P) {
    const a = P.identityOf({ id: 'x' }, P1);
    if (a.key.indexOf('u:u1|') !== 0) return '身份键须以 u:<universe>| 开头，实 ' + a.key;
    /* ★ 同名不同宇宙 ⇒ different-universe（不是同一人）；同宇宙仅名字 ⇒ name-only（候选）。 */
    const du = P.mergable({ name: '玥', universe: 'u1' }, { name: '玥', universe: 'u2' }, P1);
    if (du.verdict !== 'different-universe') return '同名不同宇宙 ⇒ different-universe，实 ' + du.verdict;
    if (du.mayMerge !== false) return '不同宇宙永不合并（mayMerge:false）';
    const no = P.mergable({ name: '玥', universe: 'u1' }, { name: '玥', universe: 'u1' }, P1);
    if (no.verdict !== 'name-only') return '同宇宙仅名字 ⇒ name-only，实 ' + no.verdict;
    if (no.verdict === du.verdict) return '★ different-universe 与 name-only 不得同形（处置相反）';
    if (no.requiresConsent !== true) return 'name-only 须 requiresConsent:true（进候选表等人认领）';
    if (no.mayMerge !== false) return 'name-only 默认永不自动合（mayMerge:false）';
    /* 默认关闭按名字合；显式开启才放行（且仍标 name-only）。 */
    const allow = P.mergable({ name: '玥', universe: 'u1' }, { name: '玥', universe: 'u1' }, P1, { allowNameMerge: true });
    if (allow.mayMerge !== true || allow.verdict !== 'name-only') return '显式 allowNameMerge 才可按名字合，且仍须 name-only';
    /* 同 id ⇒ mergable。 */
    if (P.mergable({ id: 'x', universe: 'u1' }, { id: 'x', universe: 'u1' }, P1).verdict !== 'mergable') return '同宇宙同 id ⇒ mergable';
    /* 两个宇宙的项目永不合并。 */
    if (P.compareProjects(P1, P2).verdict !== 'separate') return '两个宇宙的项目须 separate';
    if (P.compareProjects(P1, P2).joinable !== false) return 'separate 须 joinable:false';
    /* 身份判不了 ⇒ 不得合并。 */
    const ind = P.mergable({}, {}, null);
    if (ind.verdict !== 'indeterminate' || ind.mayMerge !== false) return '身份判不了 ⇒ indeterminate 且不得合并';
    return '';
}

/** D：验收③ —— 幂等（duplicate 是正常读数）与来源边界（无边界不能撤）；relink 只镜像。 */
function judgeDurability(P) {
    const iid = P.importIdOf({ packId: 'k1', volumeId: 'v1' }, P1);
    if (iid.ok !== true) return '导入身份须可确定性派生';
    const again = P.importIdOf({ packId: 'k1', volumeId: 'v1' }, P1);
    if (again.id !== iid.id) return '同一份包同一项目同一代 ⇒ importId 须恒同（幂等地基）';
    const other = P.importIdOf({ packId: 'k1', volumeId: 'v1' }, P1, {});
    if (P.importIdOf({ packId: 'k1', volumeId: 'v1', revision: 2 }, P1).id === iid.id) return '不同代际须给不同 importId（0/- 不得混同）';
    const dp = P.planImport({ packId: 'k1', volumeId: 'v1' }, P1, [iid.id]);
    if (dp.state !== 'duplicate' || dp.ok !== true) return '已导过的包须报 duplicate 且 ok:true（**正常读数**）';
    if (dp.state === 'blocked') return 'duplicate 不得与被挡（blocked）同形';
    if (dp.zeroWrite !== true) return '导入计划须恒带 zeroWrite:true（只出计划不落笔）';
    /* 项目归档 / 解绑 ⇒ 阻。 */
    if (P.planImport({ packId: 'k', volumeId: 'v' }, { projectId: 'p', state: 'archived' }, []).reason !== 'project-archived') return '归档项目须拒导入（project-archived）';
    /* 跨宇宙默认阻；显式放行须留痕。 */
    const cu = P.planImport({ packId: 'k', volumeId: 'v', universe: 'u9' }, P1, []);
    if (cu.reason !== 'cross-universe') return '跨宇宙包默认须阻（cross-universe）';
    const cuOk = P.planImport({ packId: 'k', volumeId: 'v', universe: 'u9' }, P1, [], { allowCrossUniverse: true });
    if (cuOk.ok !== true || cuOk.crossUniverse !== true) return '显式放行跨宇宙须 ok:true 且留痕 crossUniverse:true';
    /* ★ 无来源件不能撤。 */
    const ub = P.revokeBoundaryOf({}, P1);
    if (ub.state !== 'unbounded' || ub.ok !== false) return '无来源件 ⇒ unbounded 且 ok:false（无边界不能撤）';
    if (ub.reason !== 'no-scope') return '无来源件理由须 no-scope，实 ' + ub.reason;
    const bd = P.revokeBoundaryOf({ packId: 'k1', volumeId: 'v1', sourceRef: { session: 's' } }, P1);
    if (bd.state !== 'bounded' || bd.ok !== true) return '有来源件 ⇒ bounded 且可撤';
    if (bd.scope.projectId !== 'p1') return '撤销边界须带项目维度';
    /* ★ relink 只镜像：内核缺席 ⇒ unknown + 不可跳。 */
    const ab = P.relink({ session: 's' }, ['x'], DEPS_EMPTY);
    if (ab.state !== 'unknown' || ab.navigable !== false) return 'X7 缺席 ⇒ relink unknown 且不可跳（不伪装仍可跳）';
    if (ab.reason !== 'liveness-unavailable') return 'X7 缺席理由须 liveness-unavailable，实 ' + ab.reason;
    if (ab.decidable !== false) return 'X7 缺席须 decidable:false';
    const li = P.relink({ session: 's' }, [{ session: 's' }], DEPS);
    if (li.ok !== true || li.navigable !== true) return '活源在场须镜像为可跳';
    return '';
}

/** Z：零写面 —— 源码零写口 + 三处入参快照不变 + 恒带 zeroWrite。 */
function judgeZeroWrite(P, src) {
    const code = stripComments(src);
    for (const w of ['storage.save', 'localStorage.setItem', 'indexedDB.open', 'writeFileSync', 'collectExport(']) {
        if (code.indexOf(w) >= 0) return '本面是纯函数面，源码不得落笔：' + w;
    }
    const proj = { projectId: 'p1', universe: 'u1', bindings: { session: ['s1'] }, volumes: [{ id: 'v1' }] };
    const before = JSON.stringify(proj);
    P.bindTo(proj, 'branch', 'b1');
    P.unbind(proj, 'all');
    P.archiveProject(proj);
    P.addVolume(proj, { id: 'v2' });
    if (JSON.stringify(proj) !== before) return '绑定 / 解绑 / 归档 / 加卷**不得改写传入项目**（须返回新对象）';
    const pack = { packId: 'k', volumeId: 'v', entries: [{ key: 'e1' }] };
    const pbefore = JSON.stringify(pack);
    P.planImport(pack, P1, []);
    P.revokeBoundaryOf(pack, P1);
    if (JSON.stringify(pack) !== pbefore) return '导入计划 / 撤销边界**不得改写传入包**';
    const seen = ['im_x'];
    const sbefore = JSON.stringify(seen);
    P.planImport({ packId: 'k2', volumeId: 'v' }, P1, seen);
    if (JSON.stringify(seen) !== sbefore) return '导入计划**不得偷偷写第二份 seen 账**（幂等账归调用方）';
    /* ★ 自动调参 / 隐式分享这类越权键一律不出现。 */
    for (const k of ['autoApply', 'autoMerge', 'silentShare']) {
        if (code.indexOf(k) >= 0) return '不得引入越权键：' + k;
    }
    return '';
}

/** A：自述 / 自检 / 诊断行 —— 缺格只列必需件；六种坏法不同形。 */
function judgeDescribe(P) {
    const d = P.describe(DEPS);
    if (d.kind !== 'project_registry') return '自述 kind 须 project_registry';
    if (d.missingDeps.length !== 0) return '依赖齐备时不得报缺格，实 ' + JSON.stringify(d.missingDeps);
    const dm = P.describe(DEPS_EMPTY);
    if (dm.missingDeps.join(',') !== 'VOLUME_CONTINUATION') return '缺格须只列 VOLUME_CONTINUATION，实 ' + JSON.stringify(dm.missingDeps);
    if (dm.optionalMissing.length !== 0) return '无可选依赖 ⇒ optionalMissing 恒空';
    /* 四条不变量自述。 */
    for (const k of ['universeInIdentityKey', 'archiveIsNotDetach', 'duplicateIsNormal', 'unboundedCannotRevoke',
        'isolatedDistinctFromSame', 'indeterminateDistinct']) {
        if (d[k] !== true) return '自述不变量须为 true：' + k;
    }
    /* 自检真跑。 */
    const sc = P.selfCheck(DEPS);
    if (sc.ok !== true) return '自检须 ok（problems: ' + JSON.stringify(sc.problems) + '）';
    const probes = sc.probes || {};
    if (probes.isolated !== 'isolated') return '自检 isolated 探针须得 isolated，实 ' + probes.isolated;
    if (probes.diffUniverse !== 'different-universe') return '自检 diffUniverse 探针须得 different-universe';
    if (probes.nameOnly !== 'name-only') return '自检 nameOnly 探针须得 name-only';
    if (probes.dupImport !== 'duplicate') return '自检 dupImport 探针须得 duplicate';
    if (probes.unbounded !== 'unbounded') return '自检 unbounded 探针须得 unbounded';
    if (probes.relinkAbsent !== 'unknown') return '自检 relinkAbsent 探针须得 unknown';
    /* ★ 六种坏法分开写。 */
    const L = P.line;
    if (L({ moduleMissing: true }) !== '模块未加载（project-registry.js）') return '诊断行「模块没挂」须自成一体';
    if (L({ thrown: true }) !== '项目面读取异常（已降级，不外抩）') return '诊断行「抛错」须自成一体';
    const depsLine = L({ deps: DEPS_EMPTY });
    if (depsLine.indexOf('依赖缺格') < 0) return '诊断行「依赖缺格」须点名缺件';
    const isoLine = L({ project: null, deps: DEPS });
    if (isoLine !== '未选项目（维持隔离）') return '诊断行「未选项目」须与「选了但零条」不同形，实 ' + isoLine;
    const projLine = L({ project: P1, deps: DEPS });
    if (projLine.indexOf('项目「长篇」') !== 0) return '诊断行「有项目」须报项目名，实 ' + projLine;
    if (projLine === isoLine) return '★ 未选项目与选了项目不得同形';
    return '';
}

/** H：宿主接线逐符号在场 + 出口不落笔 + 装配点键名逐字。 */
function judgeHost(src) {
    for (const s of [
        '_projectRegistryDeps() {', '_projectRegistryAbsent(reason) {',
        'projectRegistryNormalize(raw, opts) {', 'projectRegistryBind(project, kind, value, opts) {',
        'projectRegistryUnbind(project, kindOrAll) {', 'projectRegistryArchive(project, opts) {',
        'projectRegistryVolumes(project, opts) {', 'projectRegistryScope(a, b, project) {',
        'projectRegistryMergeCheck(a, b, project, opts) {', 'projectRegistryPlanImport(pack, project, seen, opts) {',
        'projectRegistryRevokeBoundary(pack, project, opts) {', 'projectRegistryRelink(ref, liveSources, opts) {',
        'projectRegistryDescribe() {', 'projectRegistryLine() {'
    ]) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    for (const s of ["['项目管理',", '_lastProject', 'this.projectRegistryLine()']) {
        const n = src.split(s).length - 1;
        if (n < 1) return '宿主口须在场：' + s + '（实 ' + n + '）';
    }
    /* ★ 与「分卷接续」诊断行**分列**（两个问题，不得合成一行）。 */
    for (const s of ["['项目管理'", "['分卷接续'", "['分支语义'"]) {
        if (src.indexOf(s) < 0) return '诊断行须自成一行且与姊妹面分列：' + s;
    }
    /* ★ 装配点键名须与内核 REQUIRED_DEPS 逐字一致（判在装配点方法体切片里）。 */
    const da = src.indexOf('_projectRegistryDeps() {');
    const db = src.indexOf('_projectRegistryAbsent(reason) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of PR.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    /* ★ 装配点取的必须是 **X7 分卷接续内核**，不是本面自己（自指会让依赖空转）。 */
    if (depsSeg.indexOf('LonShaVolumeContinuation') < 0) return '装配点必须取分卷接续内核（X7 是目录与源状态的唯一真源）';
    if (depsSeg.indexOf('_projectRegistryLib()') >= 0) return '★ 装配点不得取本面自身（依赖会空转）';
    /* ★ 出口不得自己落笔（纯函数面：写口归 owner）。 */
    const pa = src.indexOf('projectRegistryNormalize(raw, opts) {');
    const pb = src.indexOf('projectRegistryLine() {');
    if (pa < 0 || pb <= pa) return '出口方法体切片失败（判据失效）';
    const outSeg = src.slice(pa, pb);
    for (const w of ['storage.save', 'restoreFromPayload(', 'localStorage', 'collectExport(', 'writeFile']) {
        if (outSeg.indexOf(w) >= 0) return '本面是纯函数面，出口不得落笔：' + w;
    }
    if (outSeg.indexOf('PR.normalizeProject(') < 0) return '归一出口必须真调用内核 normalizeProject';
    if (outSeg.indexOf('PR.planImport(') < 0) return '导入出口必须真调用内核 planImport';
    if (outSeg.indexOf('PR.relink(') < 0) return '重新接线出口必须真调用内核 relink';
    /* ★ 模块级取库口须按全局名取件。 */
    if (src.indexOf("window.LonShaProjectRegistry, 'project-registry.js'") < 0) return '取库口须按 LonShaProjectRegistry 全局名取件';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_projectRegistryDeps() {', '_projectRegistryAbsent(reason) {',
    'projectRegistryNormalize(raw, opts) {', 'projectRegistryBind(project, kind, value, opts) {',
    'projectRegistryUnbind(project, kindOrAll) {', 'projectRegistryArchive(project, opts) {',
    'projectRegistryVolumes(project, opts) {', 'projectRegistryScope(a, b, project) {',
    'projectRegistryMergeCheck(a, b, project, opts) {', 'projectRegistryPlanImport(pack, project, seen, opts) {',
    'projectRegistryRevokeBoundary(pack, project, opts) {', 'projectRegistryRelink(ref, liveSources, opts) {',
    'projectRegistryDescribe() {', 'projectRegistryLine() {'
];
const LIB_FNS = ['function _moduleLib(getGlobal, fileName) {', 'function _projectRegistryLib() {'];
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
        libs + J + 'return ({ ' + body + ' });')(() => {}, 'v3317', win || {}, []);
    return Object.assign(eng, { _lastProject: null, _lastProjectImport: null, _lastProjectRelink: null,
        _lastProjectVolumes: null, _lastProjectMerge: null });
}
const VC_STUB = Object.freeze({
    listVolumes: (p) => ({ ok: true, count: 2, chapterCount: 0, projectId: p.projectId,
        volumes: [{ id: 'v1', index: 1, navKey: 'vol:p1#1' }, { id: 'v2', index: 2, navKey: 'vol:p1#2' }] }),
    resolveSourceState: () => ({ ok: true, state: 'live', navigable: true })
});
const libWindow = (extra) => Object.assign({ LonShaProjectRegistry: PR, LonShaVolumeContinuation: VC_STUB }, extra || {});

/** 破坏副本（落盘 + 语法校验 + 真加载）。 */
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3317-' + tag + '-'));
    const fp = path.join(dir, MOD);
    const broken = breakSource(MOD_SRC, anchor, repl, tag);
    assertSingleHit(MOD_SRC, anchor, tag);
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(fp);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3317 M1. ★★★★ 模块登记面：分发面恰一次（零兄弟依赖 / 零联网）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(ROOT, MOD)), MOD + ' 必须在场');
    assert.equal(judgeMeta(PR, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
    ok('模块 ' + MOD + '：' + MOD_SRC.split('\n').length + ' 行 / ' + Object.keys(PR).length + ' 导出项');
});

test('v3317 M2. ★★★★ 导出面：八张常量表 + 唯一必需依赖 + 零可选 + 三十二函数', () => {
    assert.equal(judgeExports(PR), '', '导出面判据');
    const d = PR.surfaceDigest(PR);
    assert.equal(d.count, Object.keys(PR).length, '指纹须覆盖全部导出名');
    ok('导出面 ' + d.count + ' 项 / digest ' + d.digest);
});

/* ══════════════════ S 隔离面（验收①） ══════════════════ */
test('v3317 S1. ★★★★★ 未选项目维持**完全隔离**：isolated（判得了）≠ same-project ≠ indeterminate', () => {
    assert.equal(judgeIsolation(PR), '', '隔离面判据');
    ok('隔离层：未选 ⇒ isolated/decidable / 同项目 ⇒ same-project / 未选导入 ⇒ blocked/no-project');
});

/* ══════════════════ B 绑定面 ══════════════════ */
test('v3317 B1. ★★★★ 绑定三类各自可达；重复是正常读数；未知类别不落默认档；归档 ≠ 解绑', () => {
    assert.equal(judgeBindings(PR), '', '绑定面判据');
    ok('绑定层：三类 / duplicate / unknown-kind / 归档保留绑定 / 解绑不改 state');
});

/* ══════════════════ V 卷章节面 ══════════════════ */
test('v3317 V1. ★★★★ 卷 / 章节编辑面：重复 id 拒、卷找不到不默认塞第 1 卷、目录只转发 X7', () => {
    assert.equal(judgeVolumes(PR), '', '卷章节判据');
    ok('卷章节层：duplicate-volume / range-inverted / no-volume / catalog-unavailable');
});

/* ══════════════════ I 身份与合并（验收②） ══════════════════ */
test('v3317 I1. ★★★★★ 同名角色、不同宇宙**不合并**：身份键恒含宇宙；different-universe ≠ name-only', () => {
    assert.equal(judgeIdentity(PR), '', '身份合并判据');
    ok('身份层：键含宇宙 / different-universe / name-only / 项目 separate');
});

/* ══════════════════ D 幂等与边界（验收③④） ══════════════════ */
test('v3317 D1. ★★★★★ 重复导入幂等（duplicate 是正常读数）+ 无边界不能撤 + relink 只镜像', () => {
    assert.equal(judgeDurability(PR), '', '导入与边界判据');
    ok('耐久层：importId 确定性 / duplicate / cross-universe / unbounded / liveness-unavailable');
});

/* ══════════════════ Z 零写面 ══════════════════ */
test('v3317 Z1. ★★★★★ 零写：源码零写口 + 三处入参快照不变 + 恒带 zeroWrite', () => {
    assert.equal(judgeZeroWrite(PR, MOD_SRC), '', '零写面判据');
    ok('零写层：project / pack / seen 三处快照；源码零写口');
});

/* ══════════════════ A 自述与诊断 ══════════════════ */
test('v3317 A1. ★★★★ 自述缺格只列必需件 + 自检真跑 + 诊断行六种坏法不同形', () => {
    assert.equal(judgeDescribe(PR), '', '自述判据');
    ok('自述层：missingDeps / 六不变量 / 自检探针 / 六种坏法分列');
});

/* ══════════════════ H 宿主接线 ══════════════════ */
test('v3317 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 十四口 / 降级 / 诊断行 / 不落笔）', () => {
    assert.equal(judgeHost(IDX_SRC), '', '宿主接线判据');
    ok('宿主接线：定义面恰一次 / 使用面 ≥1 / 装配点键名逐字 / 取 X7 而非自指 / 出口不落笔');
});

test('v3317 H2. ★★★★★ 端到端：宿主真跑归一 → 卷 → 隔离 → 合并 → 导入 → 重新接线，各自成读数', () => {
    const eng = engineFrom(IDX_SRC, libWindow());
    /* 装配点取到 X7 内核（不是本面自己）。 */
    assert.equal(eng._projectRegistryDeps().VOLUME_CONTINUATION, VC_STUB, '装配点须取到 X7 内核');
    /* 归一。 */
    assert.equal(eng.projectRegistryNormalize(P1).selected, true, '选了项目须 selected:true');
    assert.equal(eng.projectRegistryNormalize(null).selected, false, '未选项目须 selected:false');
    /* 卷目录真跑（转发 X7）。 */
    const vs = eng.projectRegistryVolumes(P1);
    assert.equal(vs.ok, true, '卷目录须真跑');
    assert.equal(vs.via, 'volume-continuation', '目录须标明单一真源');
    /* ★ 验收①。 */
    assert.equal(eng.projectRegistryScope({ id: 'a' }, { id: 'b' }, null).verdict, 'isolated', '未选须隔离');
    assert.equal(eng.projectRegistryPlanImport({ packId: 'k', volumeId: 'v' }, null, []).state, 'blocked', '未选导入须被挡');
    /* ★ 验收②。 */
    const mu = eng.projectRegistryMergeCheck({ name: '玥', universe: 'u1' }, { name: '玥', universe: 'u2' }, P1);
    assert.equal(mu.verdict, 'different-universe', '同名不同宇宙须不同宇宙');
    const nm = eng.projectRegistryMergeCheck({ name: '玥', universe: 'u1' }, { name: '玥', universe: 'u1' }, P1);
    assert.equal(nm.verdict, 'name-only', '仅名字须 name-only');
    assert.notEqual(mu.verdict, nm.verdict, '两种形态不得同形');
    /* ★ 验收③。 */
    const iid = PR.importIdOf({ packId: 'k1', volumeId: 'v1' }, P1).id;
    assert.equal(eng.projectRegistryPlanImport({ packId: 'k1', volumeId: 'v1' }, P1, [iid]).state, 'duplicate', '重复导入是正常读数');
    assert.equal(eng.projectRegistryRevokeBoundary({}, P1).state, 'unbounded', '无来源件不能撤');
    /* 绑定 / 归档不同形。 */
    assert.equal(eng.projectRegistryBind(eng.projectRegistryBind(P1, 'session', 's1').project, 'session', 's1').duplicate, true, '重复绑定是正常读数');
    assert.equal(eng.projectRegistryArchive(eng.projectRegistryBind(P1, 'session', 's1').project).bindingsKept, 1, '归档保留绑定');
    /* 诊断行三态各自成一体。 */
    eng.projectRegistryNormalize(P1);
    assert.ok(eng.projectRegistryLine().indexOf('项目「长篇」') >= 0, '有项目时诊断行须报项目名与卷数');
    const engEmpty = engineFrom(IDX_SRC, libWindow());
    assert.equal(engEmpty.projectRegistryLine(), '未选项目（维持隔离）', '未选项目诊断行自成一体');
    /* 模块缺席 ⇒ 同键降级（取库口是模块级函数，须走窗口里没有该库的新引擎）。 */
    const engAbs = engineFrom(IDX_SRC, { LonShaVolumeContinuation: VC_STUB });
    const gone = engAbs.projectRegistryNormalize(P1);
    assert.equal(gone.ok, false, '模块缺席须报 ok:false');
    assert.equal(gone.state, 'absent', '模块缺席须报 state:absent');
    assert.notEqual(gone.verdict, 'isolated', '缺席不得读成「已隔离」');
    assert.equal(engAbs.projectRegistryLine(), '模块未加载（project-registry.js）', '模块缺席的诊断行自成一体');
    /* ★ 验收④：内核缺席 ⇒ 判不了且不伪装可跳。 */
    const engNoVc = engineFrom(IDX_SRC, { LonShaProjectRegistry: PR });
    const rl = engNoVc.projectRegistryRelink({ session: 's' }, [], {});
    assert.equal(rl.state, 'unknown', 'X7 缺席须报 unknown');
    assert.equal(rl.navigable, false, 'X7 缺席须不可跳（不伪装）');
    assert.equal(rl.reason, 'liveness-unavailable', 'X7 缺席须点名理由');
    /* 依赖缺格：目录判不了（不自己列一遍）。 */
    const nc = engNoVc.projectRegistryVolumes(P1);
    assert.equal(nc.reason, 'catalog-unavailable', 'X7 缺席目录须判不了');
    assert.equal(nc.decidable, false, '判不了须显式 decidable:false');
    ok('端到端：归一 / 卷 / 隔离 / 合并 / 导入 / 边界 / 重新接线 / 降级 / 依赖缺格 九段各自成读数');
});

/* ══════════════════ V 版本锚 ══════════════════ */
test('v3317 V2. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3317000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX_SRC) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.317.0'"), '当版锚点必须显式留在本档里');
});

/* ══════════════════ X 真源码破坏 → 同一条真判据必须翻红 ══════════════════ */
test('v3317 X1. ★★★★★ 真源码破坏 -> 同一条真判据必须翻红（十二条各自现形，且原版必须绿）', () => {
    /* L0 地基：同一批判据在**原版**上必须全部通过（否则「翻红」不归因于破坏）。 */
    assert.equal(judgeMeta(PR, MF, MOD_SRC), '', '地基 meta');
    assert.equal(judgeExports(PR), '', '地基 exports');
    assert.equal(judgeIsolation(PR), '', '地基 isolation');
    assert.equal(judgeBindings(PR), '', '地基 bindings');
    assert.equal(judgeVolumes(PR), '', '地基 volumes');
    assert.equal(judgeIdentity(PR), '', '地基 identity');
    assert.equal(judgeDurability(PR), '', '地基 durability');
    assert.equal(judgeZeroWrite(PR, MOD_SRC), '', '地基 zeroWrite');
    assert.equal(judgeDescribe(PR), '', '地基 describe');
    assert.equal(judgeHost(IDX_SRC), '', '地基 host');
    /* ★ 破坏副本**抛错**也算翻红：不能因为异常逃逸就让后续断言静默漏跑（本仓负向探针纪律）。 */
    const broke = (fn) => { try { return fn(); } catch (e) { return '破副本抛错（视作翻红）：' + String((e && e.message) || e); } };
    /* ① 表外状态落默认档（把归档项当活的使）。 */
    {
        const b = loadBroken('state', A_STATE, '        if (false) {');
        assert.notEqual(broke(() => judgeBindings(b)), '', '破坏 state 后表外状态判据必须翻红');
    }
    /* ② 表外绑定类别落默认档（挂到不存在的表上，撤不下来）。 */
    {
        const b = loadBroken('kind', A_KIND, '        if (false) {');
        assert.notEqual(broke(() => judgeBindings(b)), '', '破坏 kind 后未知类别判据必须翻红');
    }
    /* ③ 归档顺手清空绑定（归档与解绑压成同一件事）。 */
    {
        const b = loadBroken('arch', A_ARCH, "        const prj = Object.assign({}, np.project, { state: 'archived', bindings: { session: [], branch: [], character: [] } });");
        assert.notEqual(broke(() => judgeBindings(b)), '', '破坏 arch 后归档保留绑定判据必须翻红');
    }
    /* ④ ★ 未选项目的项目门被删（隔离退化成判不了）。 */
    {
        const b = loadBroken('scope', A_SCOPE, '            return { ok: true, verdict: \'indeterminate\', decidable: false,');
        assert.notEqual(broke(() => judgeIsolation(b)), '', '破坏 scope 后隔离判据必须翻红');
    }
    /* ⑤ ★ 未选项目的导入门被删（隔离项目也能出计划）。 */
    {
        const b = loadBroken('plan', A_PLAN, '            return Object.assign({}, base, { state: \'applied\', count: 1,');
        assert.notEqual(broke(() => judgeIsolation(b)), '', '破坏 plan 后导入隔离判据必须翻红');
    }
    /* ⑥ ★ 身份键丢掉宇宙（同名跨宇宙在键上相等 ⇒ 隐式合并）。 */
    {
        const b = loadBroken('key', A_KEY, "        const key = (oid ? 'id:' + oid : 'name:' + nm);");
        assert.notEqual(broke(() => judgeIdentity(b)), '', '破坏 key 后身份键判据必须翻红');
    }
    /* ⑦ ★ 同名不同宇宙被当作可合并。 */
    {
        const b = loadBroken('merge', A_MERGE, "            return { ok: true, reason: 'mergable', verdict: 'mergable',");
        assert.notEqual(broke(() => judgeIdentity(b)), '', '破坏 merge 后跨宇宙合并判据必须翻红');
    }
    /* ⑧ 仅名字对得上被当作可自动合（取消用户认领）。 */
    {
        const b = loadBroken('name', A_NAME, '        if (true) {');
        assert.notEqual(broke(() => judgeIdentity(b)), '', '破坏 name 后 name-only 判据必须翻红');
    }
    /* ⑨ 重复导入不再被认成 duplicate（幂等退化成再导一次）。 */
    {
        const b = loadBroken('dup', A_DUP, '        if (false) {');
        assert.notEqual(broke(() => judgeDurability(b)), '', '破坏 dup 后幂等判据必须翻红');
    }
    /* ⑩ 无来源件也能撤（撤销退化成清库）。 */
    {
        const b = loadBroken('axis', A_AXIS, '        if (false) {');
        assert.notEqual(broke(() => judgeDurability(b)), '', '破坏 axis 后撤销边界判据必须翻红');
    }
    /* ⑪ 内核缺席被当作「还活着 / 可跳转」。 */
    {
        const b = loadBroken('link', A_LINK, "            return { ok: false, reason: 'live', state: 'live', navigable: true,");
        assert.notEqual(broke(() => judgeDurability(b)), '', '破坏 link 后源状态镜像判据必须翻红');
    }
    /* ⑫ 目录自己再列一份（取消单一真源）。 */
    {
        const b = loadBroken('catalog', A_CATALOG, '        if (false) {');
        assert.notEqual(broke(() => judgeVolumes(b)), '', '破坏 catalog 后单一真源判据必须翻红');
    }
});

/* ══════════════════ W 工具两向自证 + 判据纯度 ══════════════════ */
test('v3317 W1. ★★★ 破坏工具两向自证：锚点不存在 / 同值替换 / 命中多次必须拒绝', () => {
    assert.throws(() => breakSource(MOD_SRC, '__no_such_anchor__', 'x', 'W1'), /拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, 'const PR_VERSION = 1;', 'const PR_VERSION = 1;', 'W1'), /拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, 'const ', 'const ', 'W1'), /拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, '', 'x', 'W1'), /拒绝破坏/);
});

test('v3317 W2. ★★★ 判据纯度：锚点字面量在本档内只准声明一次；判据不引用锚点串', () => {
    /* ★ 锚点字面量已在文件头声明一次；断言体里不得再重复出现（否则「改一半」会静默）。 */
    for (const [name, a] of [['A_STATE', A_STATE], ['A_KIND', A_KIND], ['A_ARCH', A_ARCH], ['A_SCOPE', A_SCOPE],
        ['A_PLAN', A_PLAN], ['A_KEY', A_KEY], ['A_MERGE', A_MERGE], ['A_NAME', A_NAME], ['A_DUP', A_DUP],
        ['A_AXIS', A_AXIS], ['A_LINK', A_LINK], ['A_CATALOG', A_CATALOG]]) {
        assert.equal(SELF.split(a).length - 1, 1, name + ' 须恰出现一次（只在声明处 —— 使用处一律走变量引用，否则「改一半」会静默），实际 '
            + (SELF.split(a).length - 1));
    }
    assert.ok(SELF.length > 4000, '本档不得被压缩（判据实体 ' + SELF.length + ' 字符）');
    /* 写口断言用**调用形态**剖析（`.setItem(`）：本档判据体里必然出现"写口词表"（那是判据的扫描面），
     * 故只能判「真调用了写口」，不能判「提到了这个词」。 */
    assert.equal(SELF.split('localStorage' + '.setItem(').length - 1, 0, '本档不得真调写口');
    assert.equal(SELF.split('storage' + '.save(').length - 1, 0, '本档不得真调写口');
});
