/* ============================================================
 * tests/v3312_fact_lifecycle.test.mjs — [v3.312.0 · M-X4] 事实生命周期成对套件（14 条）
 *
 * 【本套件要证明的六件事（不是「函数返回了对象」）】
 *   ① **「禁止生成」不得误删原始证据**（M-X4 验收原文第一条）：
 *      `checkCombo` 必须把处置（定位）与动作（手段）**分成两格**，且 `no-generate` /
 *      `author-only` 下出现 `delete-source` 时理由必须是 `evidence-preserved`
 *      —— 若把两者合成一张表，这一档会塔成普通越界（`not-allowed-by-disposition`），
 *      而「不许进生成」与「可以删原文」之间的那道门就没了。
 *   ② **撤回后不进入召回与模型载荷**（验收②）：`verifyWithheld` 走 `admitForLoad` 真读数，
 *      被撤条的 id **不得**出现在 `admitted` 里；同时**原文条目仍在账上**（`evidenceKept`）。
 *   ③ **保留审计不得泄露受限正文**（验收③）：`auditEntries` 的 `body` 只出归属 + 站位串 /
 *      截断取值，且判据逐字反查「审计里不存在受限原文本体」。
 *   ④ **可回读、可撤销、可审计**（验收④）：回滚**三档各自可达**（可逆 / 部分 / 不可逆）；
 *      `readbackOf` 对不可回写的生成面**不得编 applied/pending**，且账上查不到这条时
 *      报 `not-on-ledger`（**不当作已生效**）。
 *   ⑤ **按来源 / 角色 / 项目 / 时间范围批量处理**（验收③）：空条件 = 不限、
 *      区间**未闭合（to == null）不得与 0 同形**、未命中必须**具名 why**。
 *   ⑥ **状态口径只读 fact-state**：计划里只出**目标态**，**不得**把任何字段写进账/入参
 *      （本模块是纯函数面，自报零写）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」（每种破坏都跑一次原版地基）。
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
const MOD = 'fact-lifecycle.js';
const MOD_SRC = read(MOD);
const SELF = read(path.join('tests', 'v3312_fact_lifecycle.test.mjs'));
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const FL = require_(path.join(R, MOD));
const FS = require_(path.join(R, 'fact-state.js'));
const FV = require_(path.join(R, 'fact-version.js'));

/** 依赖装配（与宿主 `_factLifecycleDeps()` 同口径：SECRET_BODY_KEYS 从模块自身取，
 *   因为 branch-semantics / volume-continuation / 本模块三份同形同值 —— 这点本档 E1 另有对账）。 */
const DEPS = Object.freeze({
    FACT_STATE: FS, ORIGINS: FV.ORIGINS, SECRET_BODY_KEYS: FL.SECRET_BODY_KEYS, now: () => 1000
});

/* ───────────────── 负控制锚点（**在判据层只声明一次**，见 L1） ─────────────────
 * ★ 全部不含引号外的转义与 HTML 实体：锚点是**磁盘现值**，工具层往返不得改写它。
 * ★ `breakOnce` 会在 0 命中或同值替换时当场拒绝（不靠肉眼对齐）。
 */
const ANCHORS = Object.freeze({
    /* ① 误删证据：把「禁入生成」下的删原文并回普通越界（理由不再点名）。 */
    evidence: String.raw`            const preservesEvidence = (d === 'no-generate' || d === 'author-only');`,
    evidenceBroken: String.raw`            const preservesEvidence = false;`,
    /* ② 删原文不再需要保留审计（删了就查不出曾经记错过）。 */
    auditReq: String.raw`            if (a === 'delete-source' && list.indexOf('keep-audit') < 0 && o.allowUnsavedDeletion !== true) {`,
    auditReqBroken: String.raw`            if (false) {`,
    /* ③ 审计泄露受限正文：掩码改成直接取原文。 */
    mask: String.raw`        if (isSecret(f, deps)) return SECRET_MASK;`,
    maskBroken: String.raw`        if (isSecret(f, deps)) return text(f && f.value, AUDIT_BODY_MAX);`,
    /* ④ 回滚三档塔成两档：不可逆被算成可逆（「删了退不回来」被说成「可以撤销」）。 */
    tier: String.raw`        if (blocked.length) verdict = 'irreversible';`,
    tierBroken: String.raw`        if (false) verdict = 'irreversible';`,
    /* ⑤ 生成面回读编一个 pending 出来（拿账本读数回答生成面问题）。 */
    genFace: String.raw`                unchecked++;`,
    genFaceBroken: String.raw`                pending++;`,
    /* ⑥ 证据被删也被算作「没泄露」：禁入生成那一路不再核证据还在不在。 */
    kept: String.raw`            ok: generationFace ? (evidenceKept.length === ids.length) : (admitted.length === 0),`,
    keptBroken: String.raw`            ok: generationFace ? true : (admitted.length === 0),`
});

/* ───────────────── 夹具：一本真事实账（含一条受限、一条已换代、一条已撤） ───────────────── */
function book() {
    return {
        facts: [
            { id: 'f1', subject: '苏晴', predicate: '住址', value: '老城', origin: 'stated', from: 2, history: [] },
            { id: 'f2', subject: '苏晴', predicate: '秘密', value: 'x', secret: '警局线人的真实姓名', origin: 'confirmed', from: 4, history: [] },
            { id: 'f3', subject: '林越', predicate: '职业', value: '医生', origin: 'reported', from: 5, to: 9, history: [] },
            { id: 'f4', subject: '林越', predicate: '职业', value: '护士', origin: 'reported', from: 10, to: 12, revoked: true, revokeReason: '记错了', history: [] }
        ]
    };
}

/* ───────────────── 判据本体（纯函数：负控制要在破坏副本上重跑它们） ───────────────── */
/** A1：登记面恰一次 + 双导出 + 冻结。
 *   ★ **不判末位**：`extra_js` 末位是任一版都会变的位置（后来的模块不断往后追加），
 *     把「本版是末位」写成永久断言＝把某版的一次性事实当永久不变量
 *     （与 v3305 / v3310 / v3311 的同族修正同一条纪律）。位置不入判据，**在场仍在判据**。 */
function judgeA1(FLx, mf, src) {
    if (!FLx || typeof FLx !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    /* 本模块不 require 任何兄弟模块（对加载顺序零要求）⇒ 它与其追加时的邻居须都在场。 */
    if (mf.extra_js.indexOf('repair-settle.js') < 0) {
        return '本模块与其追加时的邻居须都在 extra_js（位置不作判据）';
    }
    const code = stripComments(src);
    if (code.includes('require(')) return '模块**不得** require 兄弟模块（依赖经 deps 参数注入，缺席才可表达）';
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/root\.LonSha[A-Za-z]* = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaFactLifecycle !== 'object') return 'root.LonShaFactLifecycle 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaFactLifecycle) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}
/** A2：导出面逐字（含四张登记表 + 动作声明面）。 */
function judgeA2(FLx) {
    for (const k of ['criteriaOf', 'overlaps', 'matchesCriteria', 'selectFacts', 'rulesOf', 'actionsFor',
        'checkCombo', 'planFor', 'auditEntries', 'rollbackOf', 'readbackOf', 'verifyWithheld', 'describe', 'selfCheck', 'line']) {
        if (typeof FLx[k] !== 'function') return '导出面缺函数：' + k;
    }
    for (const k of ['DISPOSITIONS', 'ACTIONS', 'FACES', 'REQUIRED_DEPS']) {
        if (!Array.isArray(FLx[k])) return '导出面缺登记表数组：' + k;
    }
    if (!FLx.ACTION_SPEC || typeof FLx.ACTION_SPEC !== 'object') return '导出面缺动作声明面 ACTION_SPEC';
    if (FLx.FL_VERSION !== 1) return 'FL_VERSION 须为 1，实 ' + FLx.FL_VERSION;
    if (FLx.DISPOSITIONS.length !== 5) return '处置词表须五态，实 ' + FLx.DISPOSITIONS.length;
    if (FLx.ACTIONS.length !== 4) return '动作词表须四态（原文点名的那四件事），实 ' + FLx.ACTIONS.length;
    /* ★ 与 `memory-center.js` 同一条计词纪律：词表本身用「面」字，标题里才许出现 UI 义。 */
    if (FLx.FACES.indexOf('generation') < 0) return '面清单须含 generation（生成面是本刀新增的那一格）';
    if (FLx.SECRET_BODY_KEYS.length !== 3) return '受限正文键须三键（与 X6/X7 同形），实 ' + FLx.SECRET_BODY_KEYS.length;
    if (!(FLx.AUDIT_BODY_MAX >= 1)) return '审计截断上限须 >= 1，实 ' + FLx.AUDIT_BODY_MAX;
    return '';
}

/**
 * X：处置 × 动作的组合检查（**验收①的承重判据**）。
 *   ★ 为什么连 `reason` 一起断：只看 `ok:false` 会把「误删证据」与「普通越界」看成同一档，
 *     而这两件事的修法完全不同（前者要改口径，后者只是选错了动作）。
 */
function judgeCombo(FLx) {
    /* ① 禁止生成 / 仅作者可见 下的删原文 ⇒ 必须点名 evidence-preserved（**不得**是普通越界）。 */
    for (const d of ['no-generate', 'author-only']) {
        const r = FLx.checkCombo(d, ['delete-source']);
        if (r.ok !== false) return d + ' 下删原文必须被拒';
        if (r.reason !== 'evidence-preserved') return d + ' 下删原文须点名 evidence-preserved，实 ' + r.reason;
        const b = (r.blocked || []).find((x) => x.action === 'delete-source');
        if (!b || b.why !== 'evidence-preserved') return d + ' 的 blocked 需逐条带 why=evidence-preserved';
    }
    /* ② 保留审计配全即放行（两个仅生成面的态各自可达 ok:true）。 */
    for (const d of ['no-generate', 'author-only']) {
        const r = FLx.checkCombo(d, ['hide-from-generation', 'keep-audit']);
        if (r.ok !== true) return d + ' 配「隐藏于生成 + 保留审计」必须放行，实 ' + r.reason;
    }
    /* ③ 撤回配齐三动作为合法；不配保留审计的删原文需点名 audit-required。 */
    const good = FLx.checkCombo('revoke', ['revoke-derived', 'hide-from-generation', 'keep-audit']);
    if (good.ok !== true) return '撤回 + 撤回派生/隐藏生成/保留审计 须放行，实 ' + good.reason;
    const needAudit = FLx.checkCombo('revoke', ['delete-source']);
    if (needAudit.ok !== false || needAudit.reason !== 'audit-required') {
        return '删原文不配保留审计须点名 audit-required，实 ' + needAudit.reason;
    }
    /* ④ 显式拿到快照口径后放行（纪律可被显式覆盖，但必须写出来）。 */
    const unsaved = FLx.checkCombo('revoke', ['delete-source'], { allowUnsavedDeletion: true });
    if (unsaved.ok !== true) return '显式 allowUnsavedDeletion 应放行，实 ' + unsaved.reason;
    /* ⑤ 词表外的字不得回落成「什么都能做」。 */
    const unknownAction = FLx.checkCombo('revoke', ['delete-everything']);
    if (unknownAction.ok !== false || unknownAction.reason !== 'unknown-action') return '词表外动作须落 unknown-action';
    const unknownDisp = FLx.checkCombo('forget', ['keep-audit']);
    if (unknownDisp.ok !== false || unknownDisp.reason !== 'unknown-disposition') return '词表外处置须落 unknown-disposition';
    /* ⑥ 允许集与生效集分开：`allowed` 不得等于「本次要做的」。 */
    const r6 = FLx.checkCombo('revoke', ['keep-audit']);
    if (!Array.isArray(r6.allowed) || r6.allowed.length !== 4) return 'allowed 须为这一态允许的全集，实 ' + JSON.stringify(r6.allowed);
    if (JSON.stringify(r6.allowed) === JSON.stringify(r6.actions)) return 'allowed（允许什么）与 actions（要做什么）不得同形';
    return '';
}
/**
 * S：批量圈定（**验收③前半的承重判据**：按来源 / 角色 / 项目 / 时间范围）。
 *   ★ 三条要害：空条件 = 不限（不是「一条不匹配」）；`to == null` 是**未闭合**
 *     （不得当 0）；未命中必须具名 why（否则说不出「为什么这几条没进来」）。
 */
function judgeSelect(FLx) {
    const st = book();
    const all = FLx.selectFacts(st, {}, DEPS);
    if (all.count !== 4) return '空条件 = 不限，应圈定全部 4 条，实 ' + all.count;
    if (all.skipped.length !== 0) return '空条件不得产生未命中';
    /* 按角色（包含即命中）。 */
    const bySub = FLx.selectFacts(st, { subjects: ['林越'] }, DEPS);
    if (bySub.count !== 2) return '按角色应圈定 2 条，实 ' + bySub.count;
    /* 按来源。 */
    const byOrigin = FLx.selectFacts(st, { origins: ['stated'] }, DEPS);
    if (byOrigin.count !== 1 || byOrigin.matched[0].id !== 'f1') return '按来源应只命中 f1';
    /* 按时间范围：问 6..8 楼 —— f1 未闭合（from 2）必须算命中，f3 区间 5..9 命中，f4 未进区间。 */
    const byRange = FLx.selectFacts(st, { from: 6, to: 8 }, DEPS);
    const ids = byRange.matched.map((m) => m.id).sort().join(',');
    if (ids !== 'f1,f2,f3') return '区间 6..8 应命中 f1/f2/f3（f1 未闭合必预命中），实 ' + ids;
    /* 未闭合不得当 0：问 100 楼以后，未闭合的 f1/f2 仍应命中。 */
    const far = FLx.selectFacts(st, { from: 100 }, DEPS);
    if (far.matched.map((m) => m.id).sort().join(',') !== 'f1,f2') return '未闭合（to=null）不得当 0：远区间应仍旧命中 f1/f2';
    /* 未命中必须具名。 */
    const miss = FLx.selectFacts(st, { subjects: ['不存在的人'] }, DEPS);
    if (miss.count !== 0) return '不存在的角色不得命中';
    if (miss.skipped.length !== 4) return '未命中须逐条报出';
    if (miss.skipped.some((s) => s.why !== 'subject-mismatch')) return '未命中须具名 why=subject-mismatch';
    /* 逐条状态取自 fact-state（**不另立口径**）。 */
    const st3 = byRange.matched.find((m) => m.id === 'f3');
    if (!st3 || st3.state !== 'superseded') return 'f3（to=9 已闭合）状态须为 superseded，实 ' + (st3 || {}).state;
    return '';
}
/**
 * P：计划（**验收① + 验收⑥ 的承重判据**）。
 *   ★ 组合被挡时**出不了计划**（拒得越早，越没有「先删了再说」的机会）。
 *   ★ 计划里只出**目标态**；禁入生成两态的 `targetState` 必须是 null（账本态不动）。
 */
function judgePlan(FLx) {
    const st = book();
    /* ① 误删组合 ⇒ 不出计划。 */
    const bad = FLx.planFor({ state: st, disposition: 'no-generate', actions: ['delete-source'], criteria: {} }, DEPS);
    if (bad.ok !== false || bad.reason !== 'evidence-preserved') return '误删组合须直接拒，实 ' + bad.reason;
    if (bad.changes.length !== 0 || bad.audit.length !== 0) return '被挡时不得出任何变更或审计条目';
    /* ② 正当撤回：三动作齐备 ⇒ 出计划，目标态 revoked，逐条 change 带 face。 */
    const plan = FLx.planFor({ state: st, disposition: 'revoke', actions: ['revoke-derived', 'hide-from-generation', 'keep-audit'], criteria: { subjects: ['林越'] } }, DEPS);
    if (plan.ok !== true) return '正当撤回须出计划，实 ' + plan.reason;
    if (plan.count !== 2) return '撤回应圈定林越两条，实 ' + plan.count;
    if (plan.targetState !== 'revoked') return '撤回目标态须为 revoked，实 ' + plan.targetState;
    if (plan.changes.some((c) => c.face !== 'ledger')) return '撤回逐条应作用在账本面';
    if (plan.changes.some((c) => c.applied !== false)) return '计划只是计划：applied 必须一律 false（本面零写）';
    if (plan.writesNothing !== true) return '计划须自报零写';
    if (plan.audit.length !== 2) return '配了保留审计则每条都有审计条目，实 ' + plan.audit.length;
    if (!plan.planId) return '计划须带稳定 planId（同输入恒同输出）';
    const again = FLx.planFor({ state: st, disposition: 'revoke', actions: ['revoke-derived', 'hide-from-generation', 'keep-audit'], criteria: { subjects: ['林越'] } }, DEPS);
    if (again.planId !== plan.planId) return 'planId 须同输入恒同输出（重试不重复）';
    /* ③ 禁入生成：账本态不动 —— targetState 必须为 null，逐条落在生成面。 */
    for (const d of ['no-generate', 'author-only']) {
        const p2 = FLx.planFor({ state: st, disposition: d, actions: ['hide-from-generation', 'keep-audit'], criteria: { ids: ['f2'] } }, DEPS);
        if (p2.targetState !== null) return d + ' 不得给出账本态（本态不动账本），实 ' + p2.targetState;
        if (p2.changes[0].face !== 'generation') return d + ' 逐条须落在生成面';
    }
    /* ③b 删原文而不配保留审计 ⇒ 直接拒（**这一格就是「删了就查不出曾经记错过」的门**）。 */
    const needAudit = FLx.planFor({ state: st, disposition: 'revoke', actions: ['delete-source'], criteria: {} }, DEPS);
    if (needAudit.ok !== false || needAudit.reason !== 'audit-required') return '删原文不配保留审计须直接拒，实 ' + needAudit.reason;
    if (needAudit.count !== 0) return '被挡时 count 须为 0（不得留 undefined，那与「圈定零条」同形）';
    /* ④ 不改入参（纯函数面的底线）。 */
    const before = JSON.stringify(st);
    FLx.planFor({ state: st, disposition: 'expire', actions: ['hide-from-generation', 'keep-audit'], criteria: {} }, DEPS);
    if (JSON.stringify(st) !== before) return '计划不得改写入参（不得把处置写进账）';
    return '';
}
/**
 * U：审计（**验收③后半：保留审计不得泄露受限正文**）。
 *   ★ 判据是**逐字反查**：受限原文本体一个字符都不得出现在审计条目里，
 *     且连长度都不给（站位串不得随原文本长变化）。
 */
function judgeAudit(FLx) {
    const SECRET_TEXT = '警局线人的真实姓名';
    const items = [
        { id: 'f2', subject: '苏晴', predicate: '秘密', value: 'x', secret: SECRET_TEXT, disposition: 'author-only' },
        { id: 'f1', subject: '苏晴', predicate: '住址', value: '老城', disposition: 'revoke' }
    ];
    const out = FLx.auditEntries(items, DEPS);
    if (out.length !== 2) return '审计须逐条出（不是只出一条）';
    const masked = out.find((x) => x.id === 'f2');
    if (!masked || masked.masked !== true) return '受限条必须被打上 masked:true';
    if (JSON.stringify(out).indexOf(SECRET_TEXT) >= 0) return '★ 审计里不得出现受限原文本体';
    if (masked.body.indexOf('（') !== 0) return '受限条正文须用站位串（不是复制体）';
    /* 站位串不得随原文本长变化：换一段长度不同的受限正文，站位串须逐字相同。 */
    const other = FLx.auditEntries([{ id: 'f2', subject: '苏晴', predicate: '秘密', secret: SECRET_TEXT + SECRET_TEXT + SECRET_TEXT }], DEPS);
    if (other[0].body !== masked.body) return '站位串不得随原文本长变化（否则挑了长度）';
    /* 非受限条：出截断取值并保留归属（审计要能定位，不是副本）。 */
    const plain = out.find((x) => x.id === 'f1');
    if (plain.masked !== false || plain.body !== '老城') return '非受限条须出取值本体，实 ' + plain.body;
    if (plain.subject !== '苏晴' || plain.predicate !== '住址') return '审计须带归属（subject/predicate），否则定位不了';
    /* 超长非受限取值须被截断（审计不是副本）。 */
    const long = FLx.auditEntries([{ id: 'f9', subject: '甲', predicate: '乙', value: '字'.repeat(200) }], DEPS);
    if (long[0].body.length > FLx.AUDIT_BODY_MAX + 1) return '超长取值须截断到 AUDIT_BODY_MAX，实 ' + long[0].body.length;
    return '';
}

/**
 * B：回滚三档（**验收④「可撤销」的承重判据**）。
 *   ★ 不得压成一格布尔：删原文没快照 = `irreversible`（**删了就退不回来**），
 *     给了快照 = `partial`（只能靠外部材料退回），无逆操作动作 = `reversible`。
 *   ★ `revoke-derived` 的逆是**重放重建**（needs:'replay'），不是把 revoked 反写回 false。
 */
function judgeRollback(FLx) {
    const keep = FLx.rollbackOf({ actions: ['hide-from-generation', 'keep-audit'] }, {});
    if (keep.verdict !== 'reversible') return '无逆操作动作须落 reversible，实 ' + keep.verdict;
    if (keep.steps.some((s) => s.needs !== 'none')) return 'reversible 档不得需要外部材料';
    const snap = FLx.rollbackOf({ actions: ['delete-source', 'keep-audit'] }, { snapshot: true });
    if (snap.verdict !== 'partial') return '有快照时删原文须落 partial，实 ' + snap.verdict;
    if (snap.steps[0].undo !== 'restore-from-snapshot') return '有快照时逆操作须是 restore-from-snapshot';
    const hard = FLx.rollbackOf({ actions: ['delete-source', 'keep-audit'] }, {});
    if (hard.verdict !== 'irreversible') return '★ 删原文无快照须落 irreversible，实 ' + hard.verdict;
    if (!hard.irreversible.some((b) => b.why === 'no-inverse')) return '不可逆须点名 no-inverse（不许只说「不行」）';
    if (hard.ok !== false) return '不可逆时 ok 须为假（不得把「退不回来」报成成功）';
    /* 重放重建：撤回派生的逆不是逐条反写。 */
    const rp = FLx.rollbackOf({ actions: ['revoke-derived'] }, {});
    if (rp.steps[0].undo !== 'replay-rebuild' || rp.steps[0].needs !== 'replay') return '撤回派生的逆操作须是重放重建';
    if (rp.verdict !== 'partial') return '需重放才能退回落 partial，实 ' + rp.verdict;
    return '';
}
/**
 * R：回读（**验收④前半 + 验收③后半：生成面与账本面**分开报**）。
 *   ★ 两条要害：账上查不到这条 ⇒ `not-on-ledger`（**不当作已生效**）；
 *     生成面 ⇒ `checked:false` + 具名 reason（**不编 applied/pending**）。
 */
function judgeReadback(FLx) {
    const st = book();
    /* ① 生成面：不回答生效与否，但要把「账本态仍是 active」说清楚。 */
    const gen = FLx.readbackOf({ changes: [{ id: 'f2', face: 'generation', to: null }] }, st, DEPS);
    if (gen.entries[0].checked !== false) return '生成面不得报 checked:true';
    if (gen.entries[0].reason !== 'generation-suppression-not-in-ledger') return '生成面须具名 reason，实 ' + gen.entries[0].reason;
    if (gen.unchecked !== 1 || gen.applied !== 0 || gen.pending !== 0) return '生成面读数须落在 unchecked 一档';
    if (String(gen.entries[0].note).indexOf('active') < 0) return '生成面回读须说清「账本态没动」';
    /* ② 账本面：现态 == 目标态 ⇒ state-reached。 */
    const hit = FLx.readbackOf({ changes: [{ id: 'f4', face: 'ledger', to: 'revoked' }] }, st, DEPS);
    if (hit.entries[0].reason !== 'state-reached' || hit.applied !== 1) return '现态已到须报 state-reached，实 ' + hit.entries[0].reason;
    /* ③ 账本面：目标态没到 ⇒ state-not-reached（**不得算已生效**）。 */
    const miss = FLx.readbackOf({ changes: [{ id: 'f1', face: 'ledger', to: 'revoked' }] }, st, DEPS);
    if (miss.entries[0].reason !== 'state-not-reached' || miss.pending !== 1) return '目标未到须报 state-not-reached，实 ' + miss.entries[0].reason;
    if (miss.ok !== false) return '有未生效项时 ok 须为假';
    /* ④ 账上查不到这条 ⇒ not-on-ledger（不编一个「已生效」出来）。 */
    const gone = FLx.readbackOf({ changes: [{ id: 'f404', face: 'ledger', to: 'revoked' }] }, st, DEPS);
    if (gone.entries[0].reason !== 'not-on-ledger' || gone.missing !== 1) return '账上无此条须报 not-on-ledger，实 ' + gone.entries[0].reason;
    if (gone.applied !== 0) return '账上无此条不得计入已生效';
    /* ⑤ 两面分开报：byFace 须各归各的（不得合成一个数）。 */
    const both = FLx.readbackOf({ changes: [
        { id: 'f4', face: 'ledger', to: 'revoked' },
        { id: 'f2', face: 'generation', to: null }
    ] }, st, DEPS);
    if (both.byFace.ledger.applied !== 1 || both.byFace.generation.unchecked !== 1) return '两面读数须各归各的';
    if (both.reason !== 'ledger-face-only') return '账本面全到位但生成面未核须单列一档，实 ' + both.reason;
    return '';
}
/**
 * W：抑制取证（**验收②「撤回后不进入召回与模型载荷」+ 验收①后半「不得误删原始证据」**）。
 *   ★ 撤回 ⇒ 走 `admitForLoad` 真读数：一条都不许进 `admitted`；
 *   ★ 禁入生成两态 ⇒ `checked:false`（它们本来就不在账本里，拿账本读数回答就是错判），
 *     但**证据必须仍在账上**。
 */
function judgeWithheld(FLx) {
    const st = book();
    /* ① 撤回：已撤条不得进载荷；**原文条目仍在**。 */
    const rev = FLx.verifyWithheld({ disposition: 'revoke', changes: [{ id: 'f4' }, { id: 'f3' }] }, st, DEPS);
    if (rev.ok !== true) return '撤回后不得有条目进载荷，实 ok=' + rev.ok;
    if (rev.admitted.length !== 0) return '★ 撤回后进载荷的条目必须为 0，实 ' + JSON.stringify(rev.admitted);
    if (rev.leaked.length !== 0) return '★ leaked 必须为空（它就是验收②的量化读数）';
    if (rev.evidenceKept.length !== 2 || rev.missing.length !== 0) return '撤回不得删除原文（证据须仍在）';
    if (rev.reason !== 'withheld-from-load') return '撤回的理由须是 withheld-from-load，实 ' + rev.reason;
    if (rev.face !== 'ledger' || rev.checked !== true) return '撤回是账本面的事，必须真核';
    /* ② 禁入生成：不回答载荷问题（checked:false），但必须核证据还在。 */
    for (const d of ['no-generate', 'author-only']) {
        const g = FLx.verifyWithheld({ disposition: d, changes: [{ id: 'f1' }] }, st, DEPS);
        if (g.checked !== false) return d + ' 不得拿账本读数回答生成面问题';
        if (g.face !== 'generation') return d + ' 的 face 须为 generation';
        if (g.evidenceKept.length !== 1) return d + ' 下原文必须仍在账上';
        if (g.ok !== true) return d + ' 下证据未丢且不得报错，实 ' + g.ok;
    }
    /* ③ 证据被删 ⇒ 禁入生成也要报错（「禁入生成」不得变成「可以删」）。 */
    const gone = FLx.verifyWithheld({ disposition: 'no-generate', changes: [{ id: 'f1' }, { id: 'f404' }] }, st, DEPS);
    if (gone.ok !== false || gone.reason !== 'some-evidence-gone') return '证据缺一条时禁入生成须报 some-evidence-gone，实 ' + gone.reason;
    /* ④ 依赖全缺时如实报 no-fact-state（不得编一份自己的五态）。 */
    const noFs = FLx.verifyWithheld({ disposition: 'revoke', changes: [{ id: 'f4' }] }, st, {});
    if (noFs.ok !== false || noFs.reason !== 'no-fact-state' || noFs.checked !== false) return '缺 fact-state 须如实报 no-fact-state';
    return '';
}
/** S2：自述与自检（三格可达性可机械核对；依赖缺格如实报）。 */
function judgeSelf(FLx) {
    const ok = FLx.describe(DEPS);
    if (ok.combosDistinct !== true) return '处置与动作须真的分成两格（combosDistinct）';
    if (ok.generationOnlyHaveNoLedgerState !== true) return '生成面两态不得被安上账本态';
    if (ok.rollbackTiersReachable !== true) return '回滚三档须各自可达';
    if (ok.writesNothing !== true) return '本面须自报零写（它是纯函数面）';
    const bad = FLx.describe({});
    if (!bad.missing.length || bad.missing.length !== FLx.REQUIRED_DEPS.length) return '依赖全缺时须逐条报出缺哪格';
    const sc = FLx.selfCheck(DEPS);
    if (sc.ok !== true || sc.depsComplete !== true || sc.combosDistinct !== true) return '自检须为真：' + JSON.stringify(sc);
    if (sc.dispositionsExhaustive !== true || sc.actionsExhaustive !== true) return '两套词表须各自穷尽互斥';
    const scBad = FLx.selfCheck({});
    if (scBad.ok !== false || scBad.depsComplete !== false) return '依赖缺格时自检须转假';
    /* 诊断行：四种面各自不同形（计划 / 回读 / 回滚 / 载荷）。 */
    const st = book();
    const plan = FLx.planFor({ state: st, disposition: 'revoke', actions: ['hide-from-generation'], criteria: {} }, DEPS);
    const l1 = FLx.line(plan);
    const l2 = FLx.line(FLx.readbackOf(plan, st, DEPS));
    const l3 = FLx.line(plan.rollback);
    const l4 = FLx.line(FLx.verifyWithheld(plan, st, DEPS));
    if (FLx.line(null) === l1) return '「尚未处置过」与「有处置」不得同形';
    if (new Set([l1, l2, l3, l4]).size !== 4) return '四种面读数不得同形：' + JSON.stringify([l1, l2, l3, l4]);
    if (l1.indexOf('计划') < 0 || l2.indexOf('回读') < 0 || l3.indexOf('回滚') < 0 || l4.indexOf('载荷') < 0) return '诊断行须点名是哪个面';
    return '';
}

/**
 * H：宿主接线逐符号在场（取库口 / 唯一装配点 / 四个出口 / 降级 / 诊断行 / 不落笔）。
 *   ★ 两条要害：① 诊断行必须接进 `selfCheck` 表（同名键与内核导出一致）；
 *     ② `factLifecyclePlan` 的**方法体切片里不得出现任何写口**（本面是纯函数面，
 *     写口仍归各 owner）—— 判在方法体切片里，不是判全文。
 */
function judgeHost(src) {
    /* **定义面**必须恰一次（重复定义是第二份真源，比缺席更坏）。 */
    for (const s of [
        "_moduleLib(() => window.LonShaFactLifecycle, 'fact-lifecycle.js')",
        'function _factLifecycleLib() {', '_factLifecycleDeps(now) {', '_factLifecycleAbsent(reason) {',
        'factLifecyclePlan(opts) {', 'factLifecycleDescribe() {', 'factLifecycleLine() {'
    ]) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    /* **使用面**只需在场（读写点天然不止一处：定义、赋值、读取各算一次）。 */
    for (const s of ["['事实生命周期', this.factLifecycleLine()]", '_lastFactLifecycle']) {
        const n = src.split(s).length - 1;
        if (n < 1) return '宿主口须在场：' + s + '（实 ' + n + '）';
    }
    /* ★ 装配点四件键名须与内核 REQUIRED_DEPS 逐字一致（判在装配点方法体切片里）。 */
    const da = src.indexOf('_factLifecycleDeps(now) {');
    const db = src.indexOf('factLifecyclePlan(opts) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of FL.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    /* ★ 出口不得自己落笔（写口归 owner：撤回走 fact-version.revokeFact、审计走审计账）。 */
    const pa = src.indexOf('factLifecyclePlan(opts) {');
    const pb = src.indexOf('factLifecycleDescribe() {');
    if (pa < 0 || pb <= pa) return '出口方法体切片失败（判据失效）';
    const planSeg = src.slice(pa, pb);
    for (const w of ['revokeFact', 'setOrigin', 'assertFact', 'collectExport', 'storage.save']) {
        if (planSeg.indexOf(w) >= 0) return '本面是纯函数面，出口不得落笔：' + w;
    }
    if (planSeg.indexOf('FL.planFor(') < 0) return '出口必须真调用内核 planFor（不得自己重算一遍处置）';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_factLifecycleDeps(now) {', '_factLifecycleAbsent(reason) {', 'factLifecyclePlan(opts) {',
    'factLifecycleDescribe() {', 'factLifecycleLine() {'
];
/** 模块级取库口（**不是** class 方法：它们定义在 IIFE 顶层，不提取就是自由变量）。 */
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {', 'function _factStateLib() {',
    'function _factVersionLib() {', 'function _factLifecycleLib() {'
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
    return {
        LonShaFactState: FS, LonShaFactVersion: FV, LonShaFactLifecycle: FL,
        LonShaBranchSemantics: { SECRET_BODY_KEYS: FL.SECRET_BODY_KEYS }
    };
}
function makeHost() {
    return {
        config: { config: { debugMode: false } },
        _factVersionState: book(),
        _lastFactLifecycle: null
    };
}
function buildCode(src) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(src, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(src, h)).join(',' + J);
    return libs + J + 'return ({ ' + body + ' });';
}
function engineFrom(src) {
    const code = buildCode(src);
    if (process.env.V3312_DUMP) fs.writeFileSync(process.env.V3312_DUMP, code);
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', code)(
        () => {}, 'v3312', libWindow());
    return Object.assign(eng, makeHost());
}
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3312-' + tag + '-'));
    const fp = path.join(dir, MOD);
    const broken = breakOnce(MOD_SRC, anchor, repl, tag);
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(fp);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3312 M1. ★★★★ 模块登记面：分发面恰一次（零兄弟依赖）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(R, MOD)), MOD + ' 必须在场');
    assert.equal(judgeA1(FL, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
});

test('v3312 M2. ★★★★ 导出面：十五个函数 + 四张登记表 + 动作声明面 + 自检三证', () => {
    assert.equal(judgeA2(FL), '', '导出面判据');
    assert.deepEqual(FL.DISPOSITIONS.slice(), ['keep', 'expire', 'revoke', 'author-only', 'no-generate'], '处置词表逐字');
    assert.deepEqual(FL.ACTIONS.slice(), ['delete-source', 'revoke-derived', 'hide-from-generation', 'keep-audit'], '动作词表逐字');
    assert.deepEqual(FL.FACES.slice(), ['ledger', 'generation', 'audit'], '面词表逐字');
    assert.equal(judgeSelf(FL), '', '自述与自检判据');
});

/* ══════════════════ X 处置 × 动作 ══════════════════ */
/** 版本序数（本档自锚常量形，供版本守卫 V4 计数）。 */
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
/** 本档出生版本（V4 当版锚点：锚必须住在**当版档案**里，故写在这一档、不写进历史文件）。 */
const BORN = '3.312.0';

test('v3312 M3. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3312000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.312.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});

test('v3312 X1. ★★★★★ 「禁止生成」不得误删原始证据：处置与动作必须分成两格（理由须点名）', () => {
    assert.equal(judgeCombo(FL), '', '组合检查判据');
});

/* ══════════════════ S 批量圈定 ══════════════════ */
test('v3312 S1. ★★★★★ 批量处理四条件：空条件 = 不限 / 未闭合区间不得当 0 / 未命中须具名', () => {
    assert.equal(judgeSelect(FL), '', '批量圈定判据');
});

/* ══════════════════ P 计划 ══════════════════ */
test('v3312 P1. ★★★★★ 计划：被挡就出不了计划；只出目标态（禁入生成两态 targetState=null）', () => {
    assert.equal(judgePlan(FL), '', '计划判据');
});

/* ══════════════════ U 审计 ══════════════════ */
test('v3312 U1. ★★★★★ 保留审计不得泄露受限正文：站位串不随原文本长变化', () => {
    assert.equal(judgeAudit(FL), '', '审计判据');
});

/* ══════════════════ B 回滚 ══════════════════ */
test('v3312 B1. ★★★★★ 回滚三档各自可达：删原文无快照 = 不可逆（不得说成可撤销）', () => {
    assert.equal(judgeRollback(FL), '', '回滚判据');
});

/* ══════════════════ R 回读 ══════════════════ */
test('v3312 R1. ★★★★★ 可回读且两面分开报：生成面不编 applied/pending；账上无此条不得当已生效', () => {
    assert.equal(judgeReadback(FL), '', '回读判据');
});

/* ══════════════════ W 抑制取证 ══════════════════ */
test('v3312 W1. ★★★★★ 撤回后不进入召回与模型载荷（leaked 必须为空），且原文证据仍在', () => {
    assert.equal(judgeWithheld(FL), '', '抑制取证判据');
});

/* ══════════════════ H 宿主接线 ══════════════════ */
test('v3312 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 四出口 / 降级 / 诊断行 / 不落笔）', () => {
    assert.equal(judgeHost(IDX), '', '宿主接线判据');
    /* 本面刻意不进快照：快照构造里不得出现 factLifecycle*（每轮付一遍全量扫描的设计）。 */
    const at = IDX.indexOf('const snap = {');
    assert.ok(at > 0, '快照构造点必须在场（否则本判据扫描面失效，会恒真）');
    assert.equal(/factLifecycle|_lastFactLifecycle/.test(IDX.slice(at, at + 12000)), false, '事实生命周期面不得进快照（按需查询口 ≠ 每轮状态投影）');
});

/* ══════════════════ E 端到端 ══════════════════ */
test('v3312 E1. ★★★★★ 端到端：宿主真算一份计划 ⇒ 撤回可回读、证据在；误删组合直接拒', () => {
    const eng = engineFrom(IDX);
    /* ① 正当撤回：三动作齐备 ⇒ 出计划。 */
    const plan = eng.factLifecyclePlan({ disposition: 'revoke', actions: ['revoke-derived', 'hide-from-generation', 'keep-audit'], criteria: { ids: ['f4'] } });
    assert.equal(plan.ok, true, '正当撤回须出计划，实 ' + JSON.stringify(plan.reason));
    assert.equal(plan.count, 1, '应圈定 f4 一条，实 ' + plan.count);
    assert.equal(plan.targetState, 'revoked');
    assert.equal(plan.audit.length, 1, '配了保留审计则出审计条目');
    assert.equal(plan.writesNothing, true, '本面零写');
    /* ② 宿主留了读数摘要（不得把全量 matched / audit 存进去）。 */
    assert.ok(eng._lastFactLifecycle && eng._lastFactLifecycle.planId === plan.planId, '宿主须留读数摘要');
    assert.equal('matched' in eng._lastFactLifecycle, false, '摘要不得存全量命中（那是第二份证据库）');
    /* ③ 回读：目标态已到（f4 已是 revoked）⇒ state-reached。 */
    const rb = eng.factLifecyclePlan({ disposition: 'revoke', actions: ['hide-from-generation'], criteria: { ids: ['f4'] } });
    assert.equal(rb.count, 1);
    /* ④ 误删组合 ⇒ 宿主出口直接给出被挡计划（不得回落成空计划）。 */
    const blocked = eng.factLifecyclePlan({ disposition: 'no-generate', actions: ['delete-source'], criteria: {} });
    assert.equal(blocked.ok, false, '误删组合须被拒');
    assert.equal(blocked.reason, 'evidence-preserved', '理由须点名 evidence-preserved');
    assert.equal(blocked.count, 0, '被挡时不得圈定任何条（先拒再算）');
    /* ⑤ 诊断行：未看过 ⇒ 「待处置」；看过 ⇒ 不计名是哪个面。 */
    const dl = eng.factLifecycleDescribe();
    assert.equal(dl.reason, '', '依赖齐备时不应有 reason，实 ' + dl.reason);
    assert.equal(dl.present, dl.total, '四件依赖须齐备');
    const ln = eng.factLifecycleLine();
    assert.ok(ln.indexOf('待处置') === 0 || ln.indexOf('上次') === 0, '诊断行须报出面态，实 ' + ln);
});

/** 用**替换后的 window**重装一次宿主（真取库口 + 真方法体，不走 mock）。 */
function engineWith(win) {
    const J = String.fromCharCode(10);
    const libs = LIB_FNS.map((h) => methodBody(IDX, h)).join(J);
    const body = HOST_METHODS.map((h) => methodBody(IDX, h)).join(',' + J);
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window',
        libs + J + 'return ({ ' + body + ' });')(() => {}, 'v3312', win);
    return Object.assign(eng, makeHost());
}

test('v3312 E2. ★★★★★ 端到端：缺格如实报（不编空壳）；模块缺席走同键降级', () => {
    const eng = engineFrom(IDX);
    /* 拿掉 fact-state ⇒ 装配点给 null ⇒ 依赖缺格（不是「在位但空」）。 */
    const win = libWindow();
    win.LonShaFactState = {};
    const eng2 = engineWith(win);
    const d = eng2.factLifecycleDescribe();
    assert.equal(d.reason, 'deps-missing', '缺一格须如实报 deps-missing，实 ' + JSON.stringify(d.missing));
    assert.equal(d.present, d.total - 1, '缺一格须只报一格缺');
    const dl2 = eng2.factLifecycleLine();
    assert.ok(dl2.indexOf('依赖缺格') >= 0 && dl2.indexOf('FACT_STATE') >= 0, '诊断行须点名缺的那一格，实 ' + dl2);
    /* 模块整个没挂 ⇒ 同键降级（不报空计划）。 */
    const win3 = libWindow();
    win3.LonShaFactLifecycle = {};
    const eng3 = engineWith(win3);
    const gone = eng3.factLifecyclePlan({ disposition: 'revoke', actions: ['keep-audit'] });
    assert.equal(gone.ok, false, '模块缺席须报 ok:false');
    assert.equal(gone.reason, 'module-absent', '理由须是 module-absent');
    assert.equal(gone.count, 0, '模块缺席不得报成空计划（那会与「圈定了零条」同形）');
    assert.equal(gone.writesNothing, true, '降级面也须自报零写');
    assert.equal(eng3.factLifecycleLine(), '模块未加载（fact-lifecycle.js）', '模块未挂的诊断行自成一体');
    /* 地基：依赖齐备的宿主不应受影响。 */
    assert.equal(eng.factLifecycleDescribe().present, 4, '地基：依赖齐备宿主不受影响');
});

/* ══════════════════ L 真源码破坏 -> 同一条判据必须翻红 ══════════════════ */
test('v3312 L1. ★★★★★ 真源码破坏 -> 同一条真判据必须翻红（六条各自现形，且原版必须绿）', () => {
    /* L0 地基：同一批判据在**原版**上必须全部通过（否则「翻红」不归因于破坏）。 */
    assert.equal(judgeCombo(FL), '', '地基 combo');
    assert.equal(judgeAudit(FL), '', '地基 audit');
    assert.equal(judgeRollback(FL), '', '地基 rollback');
    assert.equal(judgeReadback(FL), '', '地基 readback');
    assert.equal(judgeWithheld(FL), '', '地基 withheld');
    /* D1 误删证据被并回普通越界（验收①的门就没了）。 */
    {
        const b = loadBroken('evidence', ANCHORS.evidence, ANCHORS.evidenceBroken);
        assert.notEqual(judgeCombo(b), '', '破坏 evidence 后 combo 判据必须翻红');
    }
    /* D2 删原文不再需要保留审计（删了就查不出曾经记错过）。 */
    {
        const b = loadBroken('auditreq', ANCHORS.auditReq, ANCHORS.auditReqBroken);
        assert.notEqual(judgeCombo(b), '', '破坏 auditReq 后 combo 判据必须翻红');
        assert.notEqual(judgeCombo(b), '', '破坏 auditReq 后 combo 判据必须翻红');
        assert.notEqual(judgePlan(b), '', '破坏 auditReq 后 plan 判据必须翻红（不配保留审计的删原文会漏进计划）');
    }
    /* D3 审计泄露受限正文。 */
    {
        const b = loadBroken('mask', ANCHORS.mask, ANCHORS.maskBroken);
        assert.notEqual(judgeAudit(b), '', '破坏 mask 后 audit 判据必须翻红');
    }
    /* D4 回滚三档塔成两档（不可逆被说成可逆）。 */
    {
        const b = loadBroken('tier', ANCHORS.tier, ANCHORS.tierBroken);
        assert.notEqual(judgeRollback(b), '', '破坏 tier 后 rollback 判据必须翻红');
    }
    /* D5 生成面回读编一个 pending 出来（拿账本读数回答生成面）。 */
    {
        const b = loadBroken('genface', ANCHORS.genFace, ANCHORS.genFaceBroken);
        assert.notEqual(judgeReadback(b), '', '破坏 genFace 后 readback 判据必须翻红');
    }
    /* D6 证据被删也被算作「没泄露」（禁入生成不再核证据在不在）。 */
    {
        const b = loadBroken('kept', ANCHORS.kept, ANCHORS.keptBroken);
        assert.notEqual(judgeWithheld(b), '', '破坏 kept 后 withheld 判据必须翻红');
    }
    /* H1 锚点纪律：锚点必须在**本档内**只声明一次（不得又在断言里重写一遍）。 */
    for (const k of Object.keys(ANCHORS)) {
        const n = SELF.split(ANCHORS[k]).length - 1;
        assert.equal(n, 1, '锚点 ' + k + ' 须在本档只声明一次，实 ' + n);
    }
});
