/* ============================================================
 * tests/v3313_memory_package.test.mjs — [v3.313.0 · M-X8] 版本化记忆包成对套件（15 条）
 *
 * 【本套件要证明的六件事（不是「函数返回了对象」）】
 *   ① **旧版本包明确迁移或明确拒绝，不得静默丢字段**（M-X8 验收原文第一条）：
 *      `admitPackage` 三态 `current / migrate / reject` **各自可达**；包顶层出现不认识
 *      的键时**默认拒**（`unknown-keys` 且逐条列出），只有显式 `keepUnknown:true` 才放行；
 *      迁移模块缺席时降级为 `reject / migration-unavailable` —— **不假装已是当前代际**。
 *   ② **同一包重复导入幂等**（验收②）：`importId` 由包 id + 作用域 + revision 决定
 *      （确定性），把上次的 `seen` 回传 ⇒ `duplicate:true` 且 `applied` 为空。
 *   ③ **过期 sourceRef 显示悬空，不伪装可跳转**（验收③）：没给活源表 ⇒ `unknown`
 *      （判不了 ≠ 还在），给了空表 ⇒ `source-deleted`；版本漂移仍是 live 但
 *      `navigable:false`。
 *   ④ **秘密与受限知识不因导出而放宽权限**（验收④）：受限条目正文一律定长站位串，
 *      判据**逐字反查**原文本不在输出里；keeper 过滤照走，挡掉的条数必须可见。
 *   ⑤ **会话与分支边界不能被导入打穿**（验收⑤）：跨会话 / 跨分支的 `sourceRef`
 *      进了 `blocked`，`planImport` 一律不出计划。
 *   ⑥ **优先本地、不默认联网**（功能④）：模块源码零 `fetch` / `XMLHttpRequest` /
 *      `localStorage` / `indexedDB`，自述 `offline:true`。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」（每条破坏都跑一次原版地基）。
 * 【当版锚点】形态按本仓 V4 惯例：**本档自锚常量 + vnum**（锚必须住在当版档案里）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakOnce } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require_ = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const MOD = 'memory-package.js';
const MOD_SRC = read(MOD);
const SELF = read(path.join('tests', 'v3313_memory_package.test.mjs'));
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const MP = require_(path.join(R, MOD));
const SM = require_(path.join(R, 'schema-migration.js'));
const BS = require_(path.join(R, 'branch-semantics.js'));

/** 判据夹具专用：存档顶层键的一个**声明过的子集**（不抄全量，只证明键面判据真在跑）。 */
const ARCHIVE_KEYS_FIX = Object.freeze(['version', 'clock', 'graph', 'charMem']);

/** 依赖装配（与宿主 `_memoryPackageDeps()` 同口径：SECRET_BODY_KEYS 三处同形同值，
 *   这点由 X6/X7/X4 各自的套件与 `scan_ledger_contract` 那一族对账）。 */
const DEPS = Object.freeze({
    SCHEMA_MIGRATION: SM, ARCHIVE_KEYS: ARCHIVE_KEYS_FIX, SECRET_BODY_KEYS: MP.SECRET_BODY_KEYS
});

/* ───────────────── 负控制锚点（**在判据层只声明一次**，见 L1） ─────────────────
 * ★ 全部不含引号外的转义与 HTML 实体：锚点是**磁盘现值**，工具层往返不得改写它。
 * ★ `breakOnce` 会在 0 命中或同值替换时当场拒绝（不靠肉眼对齐）。
 */
const ANCHORS = Object.freeze({
    /* ① 受限正文掩码被换成原文（篇幅随原文本长变化 ⇒ 长度本身成了读数）。 */
    mask: String.raw`            out.value = SECRET_MASK;`,
    maskBroken: String.raw`            out.value = text(out.value, BODY_MAX);`,
    /* ② 未知顶层键不再默认拒（静默丢字段 —— 正是验收①点名要治的那件事）。 */
    unknown: String.raw`        if (unknownKeys.length && o.keepUnknown !== true) {`,
    unknownBroken: String.raw`        if (false) { /* unknown-keys probe */`,
    /* ③ 迁移模块缺席时不再降级为明确拒绝（会回落成「假装已是当前代际」）。 */
    migUn: String.raw`        if (!SM || typeof SM.plan !== 'function') {`,
    migUnBroken: String.raw`        if (false) { /* migration-unavailable probe */`,
    /* ④ 「没给活源表」不再判不了（unknown 被读成「还在」）。 */
    srcUnk: String.raw`        if (liveSources === null || liveSources === undefined || !Array.isArray(liveSources)) {`,
    srcUnkBroken: String.raw`        if (false) { /* unknown-liveness probe */`,
    /* ⑤ 幂等：命中已导名单也不拦（同包二次导入会再落一遍）。 */
    idem: String.raw`        if (seen.indexOf(importId) >= 0) {`,
    idemBroken: String.raw`        if (false) { /* idempotence probe */`,
    /* ⑥ 边界：跨会话 / 跨分支不再进 blocked（会话边界被打穿）。 */
    bound: String.raw`            if (!sameSession || !sameBranch) {`,
    boundBroken: String.raw`            if (false) { /* boundary probe */`
});

/* ───────────────── 夹具：一个真包（含一条受限、一条被 keeper 挡、一条悬空来源） ───────────────── */
function facesFixture() {
    return {
        factVersion: [
            { key: 'a', value: '旧城东街', entityId: 'e1', from: 1 },
            { key: 'b', value: 'top-secret', entityId: 'e2', secret: '警局线人的真实姓名' },
            { key: 'c', value: '被挡', entityId: 'e3', keeperIds: ['zz'] },
        ],
        money: [
            { key: 'cash', value: 120, entityId: 'e1', refId: 'r-gone' },
        ],
    };
}
function buildFixture(extra) {
    return MP.buildPackage(Object.assign({
        scope: { granularity: 'project', projectId: 'P1' },
        license: 'faces',
        sourceRefs: [{ session: 'S1', branch: 'main', version: '3' }],
        faces: facesFixture(),
        viewer: { id: 'e9' },
        revision: 4, schemaVersion: 1, producerVersion: '3.313.0'
    }, extra || {}), DEPS);
}

/* ───────────────── 判据本体（纯函数：负控制要在破坏副本上重跑它们） ───────────────── */
/** A1：登记面恰一次 + 双导出 + 冻结。
 *   ★ **不判末位**：`extra_js` 末位是任一版都会变的位置（后来的模块不断往后追加），
 *     把「本版是末位」写成永久断言＝把某版的一次性事实当永久不变量
 *     （与 v3305 / v3310 / v3311 / v3312 的同族修正同一条纪律）。位置不入判据，**在场仍在判据**。
 */
function judgeA1(MPx, mf, src) {
    if (!MPx || typeof MPx !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    /* 本模块不 require 任何兄弟模块（对加载顺序零要求）⇒ 它与其追加时的邻居须都在场。 */
    if (mf.extra_js.indexOf('fact-lifecycle.js') < 0) {
        return '本模块与其追加时的邻居须都在 extra_js（位置不作判据）';
    }
    const code = stripComments(src);
    if (code.includes('require(')) return '模块**不得** require 兄弟模块（依赖经 deps 参数注入，缺席才可表达）';
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/root\.LonSha[A-Za-z]* = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaMemoryPackage !== 'object') return 'root.LonShaMemoryPackage 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaMemoryPackage) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}
/** A2：导出面逐字（含四张登记表 + 依赖声明面）。 */
function judgeA2(MPx) {
    for (const k of ['normalizeScope', 'isSecret', 'maskEntry', 'filterByKeeper', 'sourceRefOf', 'schemaOf',
        'buildPackage', 'admitPackage', 'sourceStateOf', 'boundaryCheck', 'entryKeyOf',
        'previewImport', 'planImport', 'revokeImport', 'describe', 'selfCheck', 'line']) {
        if (typeof MPx[k] !== 'function') return '导出面缺函数：' + k;
    }
    for (const k of ['GRANULARITY', 'REJECT_REASONS', 'PACKAGE_KEYS', 'FACES', 'REQUIRED_DEPS']) {
        if (!Array.isArray(MPx[k])) return '导出面缺登记表数组：' + k;
    }
    if (!MPx.ADMIT || !MPx.PREVIEW || !MPx.SOURCE || !MPx.LICENSE) return '导出面缺状态词表';
    if (MPx.MP_VERSION !== 1) return 'MP_VERSION 须为 1，实 ' + MPx.MP_VERSION;
    if (MPx.GRANULARITY.length !== 3) return '粒度须三档（原文点名：项目级 / 角色级 / 会话级），实 ' + MPx.GRANULARITY.length;
    if (MPx.REJECT_REASONS.length < 8) return '拒绝理由词表须穷尽（>= 8 条），实 ' + MPx.REJECT_REASONS.length;
    if (new Set(MPx.REJECT_REASONS).size !== MPx.REJECT_REASONS.length) return '拒绝理由须互不重复';
    if (MPx.FACES.length !== 5) return '面清单须五面（与 X6/X7 同词表），实 ' + MPx.FACES.length;
    if (MPx.SECRET_BODY_KEYS.length !== 3) return '受限正文键须三键（与 X6/X7 同形），实 ' + MPx.SECRET_BODY_KEYS.length;
    if (MPx.SECRET_BODY_KEYS.join(',') !== BS.SECRET_BODY_KEYS.join(',')) return '受限正文键须与 X6 逐字同值';
    if (!(MPx.BODY_MAX >= 1)) return '正文截断上限须 >= 1，实 ' + MPx.BODY_MAX;
    return '';
}
/** A3：**离线**（验收·功能④：优先本地文件，不默认联网，不新增外部数据库 / 云同步）。 */
function judgeOffline(src) {
    const code = stripComments(src);
    for (const w of ['fetch(', 'XMLHttpRequest', 'localStorage', 'indexedDB', 'WebSocket', 'navigator.sendBeacon']) {
        if (code.indexOf(w) >= 0) return '本模块须离线：不得出现 ' + w;
    }
    return '';
}
/** O1：造包七件齐 + 完全隔离（没选作用域 ⇒ 不产包，而不是空包）。 */
function judgeBuild(MPx) {
    const none = MPx.buildPackage({ license: 'faces' }, DEPS);
    if (none.ok !== false) return '没选作用域时必须 ok:false';
    if (none.reason !== 'no-scope') return '没选作用域须点名 no-scope，实 ' + none.reason;
    if (none.package !== null) return '没选作用域时**不得产包**（空包会被读成「确实没有可带走的」）';
    const bp = buildFixture();
    if (bp.ok !== true) return '正当造包须成功，实 ' + bp.reason;
    const p = bp.package;
    for (const k of ['schemaVersion', 'sourceRefs', 'revision', 'license', 'knowledge', 'migrationNote', 'sensitiveCount']) {
        if (!(k in p)) return '包须带功能②点名的字段：' + k;
    }
    if (p.offline !== true) return '包须自报离线（offline:true）';
    if (p.granularity !== 'project') return '包须记住粒度';
    if (p.entries.length !== 3) return '应带 3 条（e1 / e2 与 money；e3 被 keeper 挡），实 ' + p.entries.length;
    if (bp.hidden !== 1) return '被 keeper 挡的条数必须计数可见（应 1），实 ' + bp.hidden;
    /* 三档粒度各自可达（实体 id 优先，名字不得充当 id）。 */
    for (const g of ['project', 'character', 'session']) {
        const sc = MPx.normalizeScope(g === 'project' ? { granularity: g, projectId: 'X' }
            : g === 'character' ? { granularity: g, characterId: 'X' } : { granularity: g, chatId: 'X' });
        if (!sc.ok) return g + ' 粒度须可达';
    }
    if (MPx.normalizeScope({ granularity: 'character', characterId: '' }).ok !== false) return '空 id 不得当作「选了作用域」';
    if (MPx.normalizeScope({ granularity: 'none', id: 'X' }).ok !== false) return '不在词表里的粒度须拒';
    return '';
}
/** D1：准入三态可达 + 未知键默认拒 + 迁移缺席不假装当前代际（**承重判据**）。 */
function judgeAdmit(MPx) {
    const bp = buildFixture();
    const cur = MPx.admitPackage(bp.package, {}, DEPS);
    if (cur.verdict !== 'current') return '当前代际包须判 current，实 ' + cur.verdict;
    if (cur.keysChecked !== true) return '给了 ARCHIVE_KEYS ⇒ 键面必须真判过（keysChecked:true）';
    /* ① 未知顶层键默认拒 + 逐条列出。 */
    const u = MPx.admitPackage(Object.assign({}, bp.package, { weirdKey: 1, another: 2 }), {}, DEPS);
    if (u.verdict !== 'reject') return '未知顶层键须默认拒，实 ' + u.verdict;
    if (u.reason !== 'unknown-keys') return '理由须点名 unknown-keys，实 ' + u.reason;
    if (u.unknownKeys.indexOf('weirdKey') < 0 || u.unknownKeys.indexOf('another') < 0) return '未知键须逐条列出';
    /* ② 显式 keepUnknown 才放行（与 M-X4「显式才放行」同纪律）。 */
    const keep = MPx.admitPackage(Object.assign({}, bp.package, { weirdKey: 1 }), { keepUnknown: true }, DEPS);
    if (keep.verdict !== 'current') return '显式 keepUnknown 须放行，实 ' + keep.verdict;
    if (keep.unknownKeys.indexOf('weirdKey') < 0) return '放行也须留痕（unknownKeys 仍要列出）';
    /* ③ 旧代际包 ⇒ migrate（不问本模块，问注册表）。 */
    const probeSM = Object.assign({}, SM, {
        plan: (p, t) => (t === 2 ? { verdict: 'plan', to: 2, from: 1, steps: [{ id: 'p1', from: 1, to: 2, why: 'x' }] } : SM.plan(p, t))
    });
    const mg = MPx.admitPackage({ schemaVersion: 1 }, { target: 2 }, Object.assign({}, DEPS, { SCHEMA_MIGRATION: probeSM }));
    if (mg.verdict !== 'migrate') return '旧代际包须判 migrate，实 ' + mg.verdict;
    if (mg.steps.length !== 1) return 'migrate 须带步骤读数';
    /* ④ 包比插件新 ⇒ 明确拒（不得假装可迁）。 */
    const tn = MPx.admitPackage({ schemaVersion: 99 }, {}, DEPS);
    if (tn.verdict !== 'reject' || tn.reason !== 'too-new') return '包比插件新须 reject/too-new，实 ' + tn.verdict + '/' + tn.reason;
    /* ⑤ 还没写代际 ⇒ 拒绝且点名（不得读成「已是最新」）。 */
    const ns = MPx.admitPackage({ a: 1 }, { keepUnknown: true }, DEPS);
    if (ns.verdict !== 'reject' || ns.reason !== 'no-schema') return '无代际须 reject/no-schema，实 ' + ns.verdict + '/' + ns.reason;
    /* ⑥ 迁移模块缺席 ⇒ **不假装已是当前代际**。 */
    const mu = MPx.admitPackage({ schemaVersion: 1 }, {}, { ARCHIVE_KEYS: ['version'] });
    if (mu.verdict !== 'reject') return '迁移模块缺席须拒，实 ' + mu.verdict;
    if (mu.reason !== 'migration-unavailable') return '理由须点名 migration-unavailable，实 ' + mu.reason;
    /* ⑦ ARCHIVE_KEYS 缺席 ⇒ 键面**未判**（不报「无未知键」）。 */
    const nk = MPx.admitPackage({ schemaVersion: 1 }, {}, { SCHEMA_MIGRATION: SM, SECRET_BODY_KEYS: MPx.SECRET_BODY_KEYS });
    if (nk.keysChecked !== false) return 'ARCHIVE_KEYS 缺席时键面必须如实报未判（keysChecked:false）';
    /* ⑧ 非对象包不得与「无代际」同形。 */
    if (MPx.admitPackage(null, {}, DEPS).reason !== 'no-package') return 'null 须点名 no-package';
    if (MPx.admitPackage([], {}, DEPS).reason !== 'not-object') return '数组须点名 not-object';
    /* ⑨ 每条 reject 的理由必须取自词表（不得现编字符串）。 */
    for (const r of [u.reason, tn.reason, ns.reason, mu.reason, MPx.admitPackage(null, {}, DEPS).reason]) {
        if (MPx.REJECT_REASONS.indexOf(r) < 0) return 'reject 理由必须取自词表，实 ' + r;
    }
    return '';
}
/** S1：来源悬空不伪装可跳转（验收③）。 */
function judgeSource(MPx) {
    const unknown = MPx.sourceStateOf({ session: 'S1' }, undefined);
    if (unknown.state !== 'unknown') return '没给活源表须判 unknown（判不了 ≠ 还在），实 ' + unknown.state;
    if (unknown.navigable !== false) return 'unknown 不得可跳转';
    const del = MPx.sourceStateOf({ session: 'S1' }, []);
    if (del.state !== 'source-deleted') return '给了空表须判 source-deleted（查了，没有），实 ' + del.state;
    const live = MPx.sourceStateOf({ session: 'S1', branch: 'main', version: '3' }, [{ session: 'S1', branch: 'main', version: '3' }]);
    if (live.state !== 'live' || live.navigable !== true) return '版本一致须 live 且可跳转';
    const shifted = MPx.sourceStateOf({ session: 'S1', branch: 'main', version: '2' }, [{ session: 'S1', branch: 'main', version: '3' }]);
    if (shifted.versionShifted !== true) return '版本漂移须报 versionShifted';
    if (shifted.navigable !== false) return '版本漂移时旧锚点**不可跳转**（仍是 live）';
    const gone = MPx.sourceStateOf({ session: 'S9' }, [{ session: 'S1' }]);
    if (gone.state !== 'source-deleted') return '查了没有须 source-deleted';
    /* 没给来源引用 ⇒ 与「查不到」不同形。 */
    if (MPx.sourceStateOf(null, []).reason !== 'no-source-ref') return '无来源引用须点名 no-source-ref';
    return '';
}
/** U1：受限正文不泄露 + 定长站位串 + 知识范围不放宽（验收④）。 */
function judgeSecret(MPx) {
    const bp = buildFixture();
    const box = bp.package.entries.find((e) => e.key === 'b');
    if (!box) return '受限条目必须仍在包里（边界与推进度随条目走）';
    if (box.sensitive !== true) return '受限条目须带 sensitive 标记';
    if (box.value !== MPx.SECRET_MASK) return '受限正文须换成站位串，实 ' + JSON.stringify(box.value);
    const raw = JSON.stringify(bp.package);
    if (raw.indexOf('警局线人的真实姓名') >= 0) return '受限原文本体**不得**出现在包里（逐字反查）';
    if (raw.indexOf('top-secret') >= 0) return '受限取值不得出现在包里';
    if (raw.indexOf('secret') >= 0) return '受限键名不得残留在条目里（整键清空）';
    /* ★ 站位串**不随原文本长变化**（否则长度本身就是读数）。 */
    const a = MPx.maskEntry({ key: 'k', secret: 'x' }, MPx.SECRET_BODY_KEYS).out.value;
    const b = MPx.maskEntry({ key: 'k', secret: 'x'.repeat(500) }, MPx.SECRET_BODY_KEYS).out.value;
    if (a !== b) return '站位串不得随原文本长度变化（长度就是读数）';
    if (a !== MPx.SECRET_MASK) return '掩码须恒为该站位串';
    /* 非受限条目的正文**不该**被掩码（否则「掩码」变成「全掩」）。 */
    const okv = MPx.maskEntry({ key: 'a', value: '旧城东街' }, MPx.SECRET_BODY_KEYS).out.value;
    if (okv !== '旧城东街') return '非受限正文不得被掩码，实 ' + JSON.stringify(okv);
    /* 知识范围不放宽：挡掉的条数可见，且被挡条**不在包里**。 */
    if (bp.hidden !== 1) return '被挡条数须可见';
    if (bp.package.entries.some((e) => e.key === 'c')) return '被 keeper 挡的条目不得进包';
    if (bp.package.knowledge.keeperScoped !== true) return '包须自报知识范围生效';
    return '';
}
/** P1：预览四类读数（冲突默认不替用户决定）+ 悬空来源可见。 */
function judgePreview(MPx) {
    const bp = buildFixture();
    const target = {
        sourceRef: { session: 'S1', branch: 'main' },
        faces: {
            factVersion: [
                { entityId: 'e1', key: 'a', value: '旧城东街' },   // 同值 ⇒ same
                { entityId: 'e2', key: 'b', value: '别的值' }        // 不同 ⇒ conflict（默认 skip）
            ],
            money: [
                { entityId: 'e1', key: 'cash', value: 120, refId: 'r-gone' }   // 同值 ⇒ same
            ]
        }
    };
    const pv = MPx.previewImport(bp.package, target, { targetRef: { session: 'S1', branch: 'main' } });
    if (pv.verdict === 'blocked') return '同会话同分支不得被边界挡';
    if (pv.same !== 2) return '同值须读作 same（幂等跳过，不当作冲突），实 ' + pv.same;
    if (pv.conflict !== 1) return '不同值须读作 conflict，实 ' + pv.conflict;
    if (pv.skipped !== 3) return 'same 与未决 conflict 都进 skipped（都不落笔），实 ' + pv.skipped;
    const c = pv.entries.find((e) => e.field === 'b');
    if (c.action !== 'skip' || c.why !== 'undecided') return '冲突默认**不替用户决定**（skip/undecided），实 ' + c.action + '/' + c.why;
    /* 显式 allowReplace 才出 replace 提案。 */
    const pv2 = MPx.previewImport(bp.package, target, { targetRef: { session: 'S1', branch: 'main' }, allowReplace: true });
    const c2 = pv2.entries.find((e) => e.field === 'b');
    if (c2.action !== 'replace') return '显式 allowReplace 须出 replace 提案，实 ' + c2.action;
    /* 悬空来源：给了已知 ref 表且条目自报的 ref 不在表里 ⇒ dangling，且**不伪装可跳转**。 */
    const pv3 = MPx.previewImport(bp.package, target, { targetRef: { session: 'S1', branch: 'main' }, knownRefs: ['r-alive'] });
    if (pv3.dangling !== 1) return '悬空来源须计数可见，实 ' + pv3.dangling;
    const dg = pv3.entries.find((e) => e.why === 'dangling-source');
    if (!dg) return '悬空条目须具名 why=dangling-source';
    /* 没给 knownRefs ⇒ **未判**（不报「无悬空」）。 */
    const pv4 = MPx.previewImport(bp.package, target, { targetRef: { session: 'S1', branch: 'main' } });
    if (pv4.dangling !== 0) return '未给已知来源表时不得报悬空（那是判不了，不是没有）';
    /* 目标面没说临时：条目身份靠 ownerKey 与目标实体字段对上（否则「同一条」会被读成 add）。 */
    if (pv.add !== 0) return 'ownerKey 必须能与目标面条目对上（否则冲突检测整格失效），实 add=' + pv.add;
    return '';
}
/** B1：幂等（验收②）+ 边界不得被打穿（验收⑤）。 */
function judgeIdemAndBoundary(MPx) {
    const bp = buildFixture();
    const target = { sourceRef: { session: 'S1', branch: 'main' }, faces: {} };
    const pv = MPx.previewImport(bp.package, target, { targetRef: { session: 'S1', branch: 'main' } });
    const pl = MPx.planImport(bp.package, pv, {});
    if (pl.ok !== true) return '正当导入须出计划，实 ' + pl.reason;
    if (!pl.importId) return '计划须带 importId（幂等的地基）';
    if (pl.count !== 3) return '应计划导入 3 条，实 ' + pl.count;
    /* ① 同包同目标 ⇒ importId 确定性（两次调用同值）。 */
    const pl1b = MPx.planImport(bp.package, pv, {});
    if (pl1b.importId !== pl.importId) return 'importId 必须确定性（同包同目标恒同值）';
    /* ② 回传 seen ⇒ duplicate 且 applied 为空。 */
    const dup = MPx.planImport(bp.package, pv, { seen: [pl.importId] });
    if (dup.duplicate !== true) return '回传 seen 须命中 duplicate';
    if (dup.count !== 0 || dup.applied.length !== 0) return '重复导入不得再落一遍（applied 必须为空）';
    if (dup.ok !== true) return '重复导入是**正常读数**，不得报 ok:false（那会与「被挡」同形）';
    /* ③ 另一目标（不同 revision）⇒ 另一个 id（不得误判为重复）。 */
    const bp2 = buildFixture({ revision: 5 });
    const alt = MPx.planImport(bp2.package, pv, { seen: [pl.importId] });
    if (alt.importId === pl.importId) return '不同包必须得到不同 importId';
    if (alt.duplicate === true) return '未导过的包不得误判为重复';
    /* ④ 跨会话 / 跨分支 ⇒ blocked，且**出不了计划**。 */
    const cross = MPx.boundaryCheck(bp.package, { session: 'S9', branch: 'other' }, {});
    if (cross.ok !== false) return '跨会话 / 跨分支必须被判越界';
    if (cross.blocked !== 1) return '越界条数须可见，实 ' + cross.blocked;
    const pvB = MPx.previewImport(bp.package, target, { targetRef: { session: 'S9', branch: 'other' } });
    if (pvB.verdict !== 'blocked') return '越界预览须报 blocked，实 ' + pvB.verdict;
    const plB = MPx.planImport(bp.package, pvB, {});
    if (plB.ok !== false) return '越界时**不得**出导入计划（边界不能被导入打穿）';
    if (plB.reason !== 'boundary-blocked') return '越界理由须点名 boundary-blocked，实 ' + plB.reason;
    /* ⑤ 显式 allowCrossBranch 才放行（并留痕）。 */
    const okCross = MPx.boundaryCheck(bp.package, { session: 'S9' }, { allowCrossBranch: true });
    if (okCross.ok !== true) return '显式 allowCrossBranch 须放行';
    if (okCross.crosses.length !== 1) return '放行也须留痕（crosses 仍要列出）';
    /* ⑥ 同一批次（sourceRef 与目标一致）不算越界。 */
    const same = MPx.boundaryCheck(bp.package, { session: 'S1', branch: 'main' }, {});
    if (same.ok !== true || same.crosses.length !== 0) return '同会话同分支不得算越界';
    return '';
}
/** R1：撤销有来源边界（不低于 X7 `revokeHandoff` 的口径）。 */
function judgeRevoke(MPx) {
    const bp = buildFixture();
    const target = { sourceRef: { session: 'S1', branch: 'main' }, faces: {} };
    const pv = MPx.previewImport(bp.package, target, { targetRef: { session: 'S1', branch: 'main' } });
    const pl = MPx.planImport(bp.package, pv, {});
    const rv = MPx.revokeImport({ applied: pl.applied, scope: { packageId: bp.package.packageId } });
    if (rv.ok !== true) return '带来源范围须可撤';
    if (rv.count !== 3) return '应撤 3 条，实 ' + rv.count;
    /* ① 没给范围 ⇒ 拒绝（撤销不是推倒重来）。 */
    const no = MPx.revokeImport({ applied: pl.applied });
    if (no.ok !== false) return '没给来源范围必须拒';
    if (no.reason !== 'no-scope') return '理由须点名 no-scope，实 ' + no.reason;
    if (no.count !== 0) return '被拒时不得撤任何条（不得与「撤了 0 条」同形）';
    /* ② 范围外的条**一条不动**。 */
    const mixed = pl.applied.map((e, i) => Object.assign({}, e, { scopeKey: i === 0 ? 'project:P1' : 'project:OTHER' }));
    const scoped = MPx.revokeImport({ applied: mixed, scope: { scopeKey: 'project:P1' } });
    if (scoped.count !== 1) return '只应撤范围内那一条，实 ' + scoped.count;
    if (scoped.untouched !== 2) return '范围外的条须计数为 untouched（一条不动），实 ' + scoped.untouched;
    /* ③ 已撤条重复调用不再计（幂等）。 */
    const again = MPx.revokeImport({ applied: pl.applied, scope: { packageId: bp.package.packageId }, alreadyRevoked: pl.applied.map((e) => e.key) });
    if (again.count !== 0) return '已撤条不得重复计，实 ' + again.count;
    if (again.already !== 3) return '重复条须计数为 already，实 ' + again.already;
    return '';
}
/** H1：宿主接线逐符号在场 + 不落笔。 */
function judgeHost(src) {
    /* **定义面**恰一次（多一处 = 两个装配点，静默分叉）。 */
    for (const s of [
        "_moduleLib(() => window.LonShaMemoryPackage, 'memory-package.js')",
        'function _memoryPackageLib() {', '_memoryPackageDeps() {', '_memoryPackageAbsent(reason) {',
        'memoryPackageAdmit(pkg, opts) {', 'memoryPackagePreview(pkg, target, opts) {',
        'memoryPackagePlan(pkg, preview, opts) {', 'memoryPackageDescribe() {', 'memoryPackageLine() {'
    ]) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    /* **使用面**只需在场（定义、赋值、读取各算一次）。
     *   [v3.370.0] 自检表与读数摘要均可外移到 engine-self-check.js / engine-evidence-center.js：合看三源。 */
    const usageSrc = src + String.fromCharCode(10) + read('engine-self-check.js') + String.fromCharCode(10) + read('engine-evidence-center.js');
    for (const s of ["['记忆包', this.memoryPackageLine()]", '_lastMemoryPackage']) {
        const n = usageSrc.split(s).length - 1;
        if (n < 1) return '宿主口须在场：' + s + '（实 ' + n + '）';
    }
    /* ★ 装配点三件键名须与内核 REQUIRED_DEPS 逐字一致（判在装配点方法体切片里）。 */
    /* [v3.370.0] 方法体本体已外移：切片从外移模块取。 */
    const bodySrc = read('engine-evidence-center.js') + String.fromCharCode(10) + src;
    const da = bodySrc.indexOf('_memoryPackageDeps(');
    const db = bodySrc.indexOf('memoryPackageAdmit(');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = bodySrc.slice(da, db);
    for (const need of MP.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    /* ★ 出口不得自己落笔（写口归 owner：导入落笔走 restoreFromPayload / 各账 record）。 */
    const pa = bodySrc.indexOf('memoryPackageAdmit(');
    const pb = bodySrc.indexOf('memoryPackageDescribe(');
    if (pa < 0 || pb <= pa) return '出口方法体切片失败（判据失效）';
    const outSeg = bodySrc.slice(pa, pb);
    for (const w of ['storage.save', 'restoreFromPayload(', 'collectExport(', 'localStorage', '_imp(']) {
        if (outSeg.indexOf(w) >= 0) return '本面是纯函数面，出口不得落笔：' + w;
    }
    if (outSeg.indexOf('MPk.admitPackage(') < 0) return '出口必须真调用内核 admitPackage（不得自己重算一遍准入）';
    if (outSeg.indexOf('MPk.previewImport(') < 0) return '预览出口必须真调用内核 previewImport';
    if (outSeg.indexOf('MPk.planImport(') < 0) return '计划出口必须真调用内核 planImport';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_memoryPackageDeps() {', '_memoryPackageAbsent(reason) {', 'memoryPackageAdmit(pkg, opts) {',
    'memoryPackagePreview(pkg, target, opts) {', 'memoryPackagePlan(pkg, preview, opts) {',
    'memoryPackageDescribe() {', 'memoryPackageLine() {', '_evidenceCenterAbsent(reason) {'
];
const EC = require_(path.join(R, 'engine-evidence-center.js'));
function rebindEC(win, keys) {
    if (!EC || typeof EC.bindDeps !== 'function') return;
    EC.bindDeps({
        /* [v3.370.0] 存档键契约与 index.js 的 EC.bindDeps 同口径注入：
         *   不注入 ⇒ 内核 _archiveKeys() 恒 null ⇒ 键面永远「未判」（E1/E2 红）。 */
        ARCHIVE_TOP_LEVEL_KEYS: keys === undefined ? ARCHIVE_KEYS_FIX : keys,
        _moduleLib: (getGlobal, fileName) => {
            if (fileName === 'memory-package.js') return win.LonShaMemoryPackage;
            if (fileName === 'schema-migration.js') return win.LonShaSchemaMigration;
            if (fileName === 'branch-semantics.js') return win.LonShaBranchSemantics;
            return null;
        },
        errLog: () => {},
        _ledgerApis: () => ({}),
        _evidenceQueryLedgersOf: () => [],
        _qaHelpDeps: () => ({})
    });
    EC.bindWindow(win);
}
/** 模块级取库口（**不是** class 方法：它们定义在 IIFE 顶层，不提取就是自由变量）。 */
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {', 'function _schemaMigrationLib() {',
    'function _memoryPackageLib() {'
];
function methodBody(src, header) {
    let at = src.indexOf(header);
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
    return { LonShaMemoryPackage: MP, LonShaSchemaMigration: SM, LonShaEngineEvidenceCenter: EC, LonShaBranchSemantics: { SECRET_BODY_KEYS: MP.SECRET_BODY_KEYS } };
}
function makeHost() {
    return { config: { config: { debugMode: false } }, _lastMemoryPackage: null };
}
function buildCode(src) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(src, h)).join(',' + J);
    return libs + J + 'return ({ ' + body + ' });';
}
function engineFrom(src) {
    rebindEC(libWindow(), ARCHIVE_KEYS_FIX);
    const code = buildCode(src);
    if (process.env.V3313_DUMP) fs.writeFileSync(process.env.V3313_DUMP, code);
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', 'ARCHIVE_TOP_LEVEL_KEYS', code)(
        () => {}, 'v3313', libWindow(), ARCHIVE_KEYS_FIX);
    return Object.assign(eng, makeHost());
}
function engineWith(win, keys) {
    rebindEC(win, keys === undefined ? ARCHIVE_KEYS_FIX : keys);
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(IDX, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(IDX, h)).join(',' + J);
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', 'ARCHIVE_TOP_LEVEL_KEYS',
        libs + J + 'return ({ ' + body + ' });')(() => {}, 'v3313', win, keys === undefined ? ARCHIVE_KEYS_FIX : keys);
    return Object.assign(eng, makeHost());
}
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3313-' + tag + '-'));
    const fp = path.join(dir, MOD);
    const broken = breakOnce(MOD_SRC, anchor, repl, tag);
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(fp);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3313 M1. ★★★★ 模块登记面：分发面恰一次（零兄弟依赖）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(R, MOD)), MOD + ' 必须在场');
    assert.equal(judgeA1(MP, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
});

test('v3313 M2. ★★★★ 导出面：十七个函数 + 五张登记表 + 四张状态词表 + 离线', () => {
    assert.equal(judgeA2(MP), '', '导出面判据');
    assert.equal(judgeOffline(MOD_SRC), '', '离线判据');
    assert.deepEqual(MP.GRANULARITY.slice(), ['project', 'character', 'session'], '粒度词表逐字');
    assert.deepEqual(MP.FACES.slice(), ['factVersion', 'characterState', 'unfinished', 'money', 'storyTime'], '面词表逐字');
    assert.equal(MP.schemaOf({ schemaVersion: 1 }).kind, 'ok');
    assert.equal(MP.schemaOf({}).kind, 'absent');
    assert.equal(MP.schemaOf({ schemaVersion: 'x' }).kind, 'unparsable');
    assert.equal(MP.schemaOf(null).kind, 'not-object');
});

/* ══════════════════ O 造包与隔离 ══════════════════ */
test('v3313 O1. ★★★★ 造包七件齐；未选作用域 ⇒ 完全隔离（不产包，而不是空包）', () => {
    assert.equal(judgeBuild(MP), '', '造包判据');
});

/* ══════════════════ D 准入（承重） ══════════════════ */
/** 版本序数（本档自锚常量形，供版本守卫 V4 计数）。 */
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
/** 本档出生版本（V4 当版锚点：锚必须住在**当版档案**里，故写在这一档、不写进历史文件）。 */
const BORN = '3.313.0';

test('v3313 D1. ★★★★★ 旧包明确迁 / 明确拒，不得静默丢字段；未知键默认拒；迁移缺席不假装当前代际', () => {
    assert.equal(judgeAdmit(MP), '', '准入判据');
});

test('v3313 D2. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3313000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.313.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});

/* ══════════════════ S 来源状态 ══════════════════ */
test('v3313 S1. ★★★★★ 过期来源显示悬空（unknown ≠ live；版本漂移不可跳转）', () => {
    assert.equal(judgeSource(MP), '', '来源状态判据');
});

/* ══════════════════ U 受限正文 ══════════════════ */
test('v3313 U1. ★★★★★ 秘密不因导出而放宽：定长站位串 + 逐字反查 + 知识范围不放宽', () => {
    assert.equal(judgeSecret(MP), '', '受限正文判据');
});

/* ══════════════════ P 预览 ══════════════════ */
test('v3313 P1. ★★★★★ 预览：同值幂等跳过、冲突默认不替用户决定、悬空来源可见', () => {
    assert.equal(judgePreview(MP), '', '预览判据');
});

/* ══════════════════ B 幂等与边界 ══════════════════ */
test('v3313 B1. ★★★★★ 重复导入幂等（seen 在调用方）+ 会话 / 分支边界不得被打穿', () => {
    assert.equal(judgeIdemAndBoundary(MP), '', '幂等与边界判据');
});

/* ══════════════════ R 撤销 ══════════════════ */
test('v3313 R1. ★★★★★ 撤销有来源边界：无范围即拒；范围外一条不动；重复条不再计', () => {
    assert.equal(judgeRevoke(MP), '', '撤销判据');
});

/* ══════════════════ H 宿主接线 ══════════════════ */
test('v3313 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 五出口 / 降级 / 诊断行 / 不落笔）', () => {
    assert.equal(judgeHost(IDX), '', '宿主接线判据');
    /* 本面刻意不进快照：快照构造里不得出现 memoryPackage*（导入是用户显式动作，不是每轮状态）。 */
    /* [v3.370.0] 快照构造点已随注入管线外移到 engine-injection-pipeline.js：合看该模块。 */
    const SNAP_SRC = read('engine-injection-pipeline.js') + String.fromCharCode(10) + IDX;
    const at = SNAP_SRC.indexOf('const snap = {');
    assert.ok(at > 0, '快照构造点必须在场（否则本判据扫描面失效，会恒真）');
    assert.equal(/memoryPackage|_lastMemoryPackage/.test(SNAP_SRC.slice(at, at + 12000)), false, '记忆包面不得进快照（用户显式导入 ≠ 每轮状态投影）');
});

/* ══════════════════ E 端到端 ══════════════════ */
test('v3313 E1. ★★★★★ 端到端：宿主真判一个外来包 ⇒ 准入 / 预览 / 计划 / 降级各自成读数', () => {
    const eng = engineFrom(IDX);
    const bp = buildFixture();
    /* ① 判包：当前代际 + 键面真判过。 */
    const adm = eng.memoryPackageAdmit(bp.package, {});
    assert.equal(adm.verdict, 'current', '当前代际包须判 current，实 ' + adm.verdict + '/' + adm.reason);
    assert.equal(adm.keysChecked, true, '宿主装配点须给 ARCHIVE_KEYS ⇒ 键面真判过');
    /* ② 宿主留了读数摘要（不得把整包存进去 —— 那是第二份证据库，且受限条目会随之外泄）。 */
    assert.ok(eng._lastMemoryPackage && eng._lastMemoryPackage.verdict === 'current', '宿主须留读数摘要');
    assert.equal('entries' in eng._lastMemoryPackage, false, '摘要不得存整包（受限正文会随之外泄）');
    assert.equal('package' in eng._lastMemoryPackage, false, '摘要不得存整包');
    /* ③ 预览 + 计划：真跑一遍。 */
    const target = { sourceRef: { session: 'S1', branch: 'main' }, faces: {} };
    const pv = eng.memoryPackagePreview(bp.package, target, { targetRef: { session: 'S1', branch: 'main' } });
    assert.equal(pv.verdict, 'ok', '同会话同分支预览须 ok，实 ' + pv.verdict);
    const pl = eng.memoryPackagePlan(bp.package, pv, {});
    assert.equal(pl.ok, true, '正当导入须出计划，实 ' + pl.reason);
    assert.equal(pl.count, 3, '应计划 3 条，实 ' + pl.count);
    assert.equal(pl.writesNothing, true, '本面零写');
    /* ④ 诊断行：未导入前「待导入」；导入后报到读数。 */
    const dl = eng.memoryPackageDescribe();
    assert.equal(dl.reason, '', '依赖齐备时不应有 reason，实 ' + dl.reason);
    assert.equal(dl.present, dl.total, '三件依赖须齐备');
    const ln = eng.memoryPackageLine();
    assert.ok(ln.indexOf('待导入') === 0 || ln.indexOf('上次') === 0, '诊断行须报出面态，实 ' + ln);
});

test('v3313 E2. ★★★★★ 端到端：缺格如实报（不编空壳）；模块缺席走同键降级；未选作用域不产包', () => {
    /* 拿掉 SCHEMA_MIGRATION ⇒ 装配点给 null ⇒ 依赖缺格（不是「在位但空」）。 */
    const win = libWindow();
    win.LonShaSchemaMigration = {};
    const eng = engineWith(win);
    const d = eng.memoryPackageDescribe();
    assert.equal(d.reason, 'deps-missing', '缺一格须如实报 deps-missing，实 ' + JSON.stringify(d.missing));
    assert.equal(d.present, d.total - 1, '缺一格须只报一格缺');
    const dl = eng.memoryPackageLine();
    assert.ok(dl.indexOf('依赖缺格') >= 0 && dl.indexOf('SCHEMA_MIGRATION') >= 0, '诊断行须点名缺的那一格，实 ' + dl);
    /* 缺格时判包 ⇒ 明确拒（**不假装已是当前代际**）。 */
    const bp = buildFixture();
    const adm = eng.memoryPackageAdmit(bp.package, {});
    assert.equal(adm.reason, 'migration-unavailable', '迁移面缺格须点名 migration-unavailable，实 ' + adm.reason);
    /* 模块整个没挂 ⇒ 同键降级（不报「可以导入」）。 */
    const win3 = libWindow();
    win3.LonShaMemoryPackage = {};
    const eng3 = engineWith(win3);
    const gone = eng3.memoryPackageAdmit(bp.package, {});
    assert.equal(gone.ok, false, '模块缺席须报 ok:false');
    assert.equal(gone.reason, 'module-absent', '理由须是 module-absent');
    assert.equal(gone.verdict, 'reject', '模块缺席不得报成「可导入」（那会与「判过了」同形）');
    assert.equal(eng3.memoryPackageLine(), '模块未加载（memory-package.js）', '模块未挂的诊断行自成一体');
    /* ARCHIVE_KEYS 缺席 ⇒ 宿主装配点给 null ⇒ 键面未判（**不报「无未知键」**）。 */
    const eng4 = engineWith(libWindow(), null);
    const adm4 = eng4.memoryPackageAdmit(bp.package, {});
    assert.equal(adm4.keysChecked, false, 'ARCHIVE_KEYS 缺席时键面必须如实报未判');
    assert.equal(adm4.verdict, 'current', '键面未判不影响代际判定（两件事分开）');
    /* 地基：依赖齐备的宿主不受影响。 */
    const base = engineFrom(IDX);
    assert.equal(base.memoryPackageDescribe().present, 3, '地基：依赖齐备宿主不受影响');
});

/* ══════════════════ L 真源码破坏 -> 同一条判据必须翻红 ══════════════════ */
test('v3313 L1. ★★★★★ 真源码破坏 -> 同一条真判据必须翻红（六条各自现形，且原版必须绿）', () => {
    /* L0 地基：同一批判据在**原版**上必须全部通过（否则「翻红」不归因于破坏）。 */
    assert.equal(judgeSecret(MP), '', '地基 secret');
    assert.equal(judgeAdmit(MP), '', '地基 admit');
    assert.equal(judgeSource(MP), '', '地基 source');
    assert.equal(judgeIdemAndBoundary(MP), '', '地基 idem/boundary');
    /* ★ 破副本**抛错**也算翻红：不能因为异常逃逸就让后续断言静默漏跑（本仓负向探针纪律）。 */
    const broke = (fn) => { try { return fn(); } catch (e) { return '破副本抛错（视作翻红）：' + String(e && e.message || e); } };
    /* D1 掩码被换成原文（受限正文泄露，且站位串变成长度可读）。 */
    {
        const b = loadBroken('mask', ANCHORS.mask, ANCHORS.maskBroken);
        assert.notEqual(broke(() => judgeSecret(b)), '', '破坏 mask 后 secret 判据必须翻红');
    }
    /* D2 未知顶层键不再默认拒（静默丢字段）。 */
    {
        const b = loadBroken('unknown', ANCHORS.unknown, ANCHORS.unknownBroken);
        assert.notEqual(broke(() => judgeAdmit(b)), '', '破坏 unknown 后 admit 判据必须翻红');
    }
    /* D3 迁移模块缺席不再降级为明确拒绝（假装已是当前代际）。 */
    {
        const b = loadBroken('migun', ANCHORS.migUn, ANCHORS.migUnBroken);
        assert.notEqual(broke(() => judgeAdmit(b)), '', '破坏 migUn 后 admit 判据必须翻红');
    }
    /* D4 「没给活源表」被读成「还在」。 */
    {
        const b = loadBroken('srcunk', ANCHORS.srcUnk, ANCHORS.srcUnkBroken);
        assert.notEqual(broke(() => judgeSource(b)), '', '破坏 srcUnk 后 source 判据必须翻红');
    }
    /* D5 幂等失效（同包二次导入会再落一遍）。 */
    {
        const b = loadBroken('idem', ANCHORS.idem, ANCHORS.idemBroken);
        assert.notEqual(broke(() => judgeIdemAndBoundary(b)), '', '破坏 idem 后幂等判据必须翻红');
    }
    /* D6 跨会话不再进 blocked（会话边界被打穿）。 */
    {
        const b = loadBroken('bound', ANCHORS.bound, ANCHORS.boundBroken);
        assert.notEqual(broke(() => judgeIdemAndBoundary(b)), '', '破坏 bound 后边界判据必须翻红');
    }
    /* H1 锚点纪律：锚点必须在**本档内**只声明一次（不得又在断言里重写一遍）。 */
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 须在本档只声明一次，实 ' + n);
    }
});
