/* ============================================================
 * tests/v3311_repair_settle.test.mjs — [v3.311.0 · M-X2] 修复落定面成对套件（15 条）
 *
 * 【本套件要证明的七件事（不是「函数返回了对象」）】
 *   ① **「仅登记」不得读成「事实已纠正」**（M-X2 验收原文第一条）：
 *      `verdictOf` 必须四态互不同形，且**四条各自可达**——少一态就有一类处境无处安放。
 *      注册完一条（全 pending）⇒ `registered`；流程走完但没证明 ⇒ `settled`；
 *      有坏项/还有没动的 ⇒ `partial`；全程逐项 confirmed ⇒ `corrected`。
 *   ② **同代一致性三态可分**：`same` / `mixed`（**实证**：真的看到两个不同的代）/
 *      `unknown`（**判不了**：一个戳都没有，或有一项没盖戳）。★ 后者的要害是
 *      「**不得用缺席补上证据**」——「有一项没戳」若读成 `same`，那条判据就恒过了。
 *   ③ **所有派生面盖同一枚戳，但不许改掉别人已有的戳**（计划功能③：记录
 *      `sourceRefs / derivedFrom`）。`seal` 若一律写自己的 rev，`coherenceOf` 永远 same。
 *   ④ **预览凭据五种不同形**（验收③：切聊后旧预览被拒绝）：没票 / 切聊 / 换代 / 过期 / 有效，
 *      各自是一种理由 —— 压成一格布尔就等于把「没拿票」与「票作废」说成同一件事。
 *   ⑤ **失败项单独重试，不整批重放**（验收③）：只挑 failed / missing（`done` 的**显式**进
 *      `skipped`），幂等键逐项逐次，达上限 ⇒ `exhausted`（「还能试」与「试到底了」不同形）。
 *   ⑥ **召回缓存跟随同代变化**（验收⑤）：引用被撤 id 的产物被列出并真作废；
 *      三态 `has-hits` / `clean` / `no-artifacts` 互不同形；`dryRun` 只看不动。
 *   ⑦ **宿主接线逐符号在场**且**只重试该重试的那些项**（与整批落笔共用同一套 owner 通道）。
 *
 * 负控制一律：真源码破坏（锚点恰中 1 次）→ 在**破坏副本**上重跑**同款真判据** → 必须现形；
 *   并反向对照「原版同判据必须通过」。
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
const MOD = 'repair-settle.js';
const MOD_SRC = read(MOD);
const SELF = read(path.join('tests', 'v3311_repair_settle.test.mjs'));
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const RS = require_(path.join(R, MOD));
const RL = require_(path.join(R, 'repair-loop.js'));
const RA = require_(path.join(R, 'recall-artifact.js'));

/* ───────────────── 负控制锚点（**在判据层只声明一次**，见 L1） ─────────────────
 * ★ 全部不含引号外的转义与 HTML 实体：锚点是**磁盘现值**，工具层往返不得改写它。
 * ★ `breakOnce` 会在 0 命中或同值替换时当场拒绝（不靠肉眼对齐）。
 */
const ANCHORS = Object.freeze({
    /* ① 四态被压成三态：`settled` 那一支改报 `corrected` —— 「流程走完」被说成「被证明了」。 */
    settled: String.raw`        if (unproven) return { verdict: 'settled', reason: 'settled-unproven ' + unproven, counts: counts };`,
    settledBroken: String.raw`        if (unproven) return { verdict: 'corrected', reason: 'settled-unproven ' + unproven, counts: counts };`,
    /* ② 用缺席补证据：有一项没盖戳却报 `same`。 */
    partialStamps: String.raw`        if (unstamped > 0) return { state: 'unknown', reason: 'partial-stamps', rev: uniq[0], unstamped: unstamped, revs: uniq };`,
    partialStampsBroken: String.raw`        if (unstamped > 0) return { state: 'same', reason: 'partial-stamps', rev: uniq[0], unstamped: unstamped, revs: uniq };`,
    /* ③ `seal` 改掉别家已有的戳（coherence 于是恒 same —— 判据自己空转）。 */
    sealKeeps: String.raw`                rev: own !== null ? own : r,`,
    sealKeepsBroken: String.raw`                rev: r,`,
    /* ④ 切聊不作理由：与「没拿票」合成一态。 */
    chatChanged: String.raw`            return { ok: false, reason: 'chat-changed', from: text(tk.chatId, 120), to: nowChat };`,
    chatChangedBroken: String.raw`            return { ok: false, reason: 'no-ticket', from: text(tk.chatId, 120), to: nowChat };`,
    /* ⑤ 「不整批重放」不可读：跳过名单恒空。 */
    skipped: String.raw`            skipped: list.filter((it) => it.status === 'done').map((it) => text(it.key, 80))`,
    skippedBroken: String.raw`            skipped: []`,
    /* ⑥ 召回缓存作废：三态压成两态（没产物可扫与扫了干净同形）。 */
    cacheState: String.raw`            state: !list.length ? 'no-artifacts' : (hits.length ? 'has-hits' : 'clean')`,
    cacheStateBroken: String.raw`            state: hits.length ? 'has-hits' : 'clean'`
});

/* ───────────────── 判据本体（纯函数：负控制要在破坏副本上重跑它们） ───────────────── */
/** A1：登记面恰一次 + 末位（零兄弟依赖）+ 双导出 + 冻结。 */
function judgeA1(RSx, mf, src) {
    if (!RSx || typeof RSx !== 'object') return '模块须可加载（CJS 双导出）';
    const hits = (mf.extra_js || []).filter((f) => f === MOD);
    if (hits.length !== 1) return 'extra_js 里 ' + MOD + ' 必须恰出现 1 次，实 ' + hits.length;
    if (mf.extra_js[mf.extra_js.length - 1] !== MOD) {
        return '本模块不 require 任何兄弟模块（对加载顺序零要求）⇒ 追加末位，实末位=' + mf.extra_js[mf.extra_js.length - 1];
    }
    const code = stripComments(src);
    if (code.includes('require(')) return '模块**不得** require 兄弟模块（依赖经 deps 参数注入，缺席才可表达）';
    if (!code.includes('module.exports = api')) return '必须保留 CJS 导出';
    if (!/root\.LonSha[A-Za-z]* = api;/.test(code)) return '必须挂浏览器全局（宿主按全局名取件）';
    if (!/const api = Object\.freeze\(\{/.test(code)) return '导出面须冻结（防宿主侧被改写）';
    if (typeof globalThis.LonShaRepairSettle !== 'object') return 'root.LonShaRepairSettle 必须被挂上';
    if (Object.isFrozen(globalThis.LonShaRepairSettle) !== true) return '全局挂载须冻结（防宿主侧被改写）';
    return '';
}
/** A2：导出面逐字（含六张登记表）。 */
function judgeA2(RSx) {
    for (const k of ['verdictOf', 'coherenceOf', 'seal', 'ticket', 'checkTicket', 'retryOf', 'cacheOf', 'facesOf', 'describe', 'selfCheck', 'line']) {
        if (typeof RSx[k] !== 'function') return '导出面缺函数：' + k;
    }
    for (const k of ['VERDICTS', 'COHERENCE', 'RETRY_STATES', 'TICKET_REASONS', 'FACES', 'REQUIRED_DEPS']) {
        if (!Array.isArray(RSx[k])) return '导出面缺登记表数组：' + k;
    }
    if (RSx.RS_VERSION !== 1) return 'RS_VERSION 须为 1，实 ' + RSx.RS_VERSION;
    if (RSx.VERDICTS.length !== 4) return '落定词表须四态，实 ' + RSx.VERDICTS.length;
    if (RSx.TICKET_REASONS.length !== 5) return '票据理由须五种（不得压成一格布尔），实 ' + RSx.TICKET_REASONS.length;
    if (RSx.FACES.indexOf('recall') < 0) return '面清单须含 recall（召回缓存是本刀新增的那一格）';
    if (RSx.MAX_ATTEMPTS < 1) return '重试上限须 >= 1，实 ' + RSx.MAX_ATTEMPTS;
    return '';
}
/**
 * V：四态判定（**四条各自可达 + 互不同形**）。
 *   ★ 为什么同时断 `reason`：只看 verdict 会把「判不了」与「确实如此」看成同一档。
 */
function judgeVerdict(RSx) {
    const v = (a) => RSx.verdictOf({ affected: a });
    const r0 = v([{ status: 'pending' }, { status: 'pending' }]);            /* 仅登记 */
    const r1 = v([{ status: 'done', evidence: 'confirmed' }, { status: 'failed' }]); /* 部分成功 */
    const r2 = v([{ status: 'done', evidence: 'unconfirmed' }, { status: 'done', evidence: 'confirmed' }]); /* 流程走完、未全证 */
    const r3 = v([{ status: 'done', evidence: 'confirmed' }]);              /* 全程被证 */
    if (r0.verdict !== 'registered') return '全 pending 须落 registered（**这就是「仅登记」**），实 ' + r0.verdict;
    if (r1.verdict !== 'partial') return '有失败项须落 partial（部分成功不伪装全成功），实 ' + r1.verdict;
    if (r2.verdict !== 'settled') return '流程走完但未全证须落 settled，实 ' + r2.verdict;
    if (r3.verdict !== 'corrected') return '全部逐项 confirmed 才可落 corrected，实 ' + r3.verdict;
    const all = [r0, r1, r2, r3].map((x) => x.verdict);
    if (new Set(all).size !== all.length) return '四态必须互不同形，实 ' + JSON.stringify(all);
    /* ★ 反向自证：四态**恰好**等于词表（多一态 = 词表里有骗人的字；少一态 = 某类处境无处安放）。 */
    const want = RSx.VERDICTS.slice().sort();
    if (JSON.stringify(all.slice().sort()) !== JSON.stringify(want)) {
        return '四条探针产出的态集合须恰等于词表，实 ' + JSON.stringify(all.slice().sort()) + ' vs ' + JSON.stringify(want);
    }
    /* ★ 核心验收：**仅登记**绝不能被读成「事实已纠正」。 */
    if (r0.verdict === r3.verdict) return '「仅登记」与「事实已纠正」必须不同形（M-X2 第一条验收）';
    /* 没有项 ≠ 全 pending：两者都落 registered，但**理由是分开的**（可读归因）。 */
    if (v([]).reason !== 'no-items' || r0.reason !== 'nothing-settled') return '「没有项」与「一项都没落定」的理由须分开';
    return '';
}
/** C：同代一致性四形（same / mixed / unknown×2）。 */
function judgeCoherence(RSx) {
    const c = (a) => RSx.coherenceOf(a);
    const same = c([{ rev: 7 }, { rev: 7 }]);
    const mixed = c([{ rev: 7 }, { rev: 8 }]);
    const none = c([{}, {}]);
    const part = c([{ rev: 7 }, {}]);
    if (same.state !== 'same') return '全等且全部盖戳须落 same，实 ' + same.state;
    if (mixed.state !== 'mixed') return '两个不同代是**实证**的 mixed，实 ' + mixed.state;
    if (none.state !== 'unknown') return '一个戳都没有须落 unknown（判不了），实 ' + none.state;
    /* ★ 要害：有一项没戳时，「所有面同代」这句话**不成立** —— 不得用缺席补上证据。 */
    if (part.state !== 'unknown') return '有项没盖戳时「所有面同代」不成立 ⇒ 须落 unknown（**不得用缺席补证据**），实 ' + part.state;
    if (part.reason === none.reason) return '「一个戳都没有」与「有一项没戳」的理由须分开（可读归因）';
    const states = [same, mixed, none, part].map((x) => x.state);
    if (new Set(states).size !== 3) return '三态（same/mixed/unknown）必须都在，实 ' + JSON.stringify(states);
    /* ★ seal **不得**改掉别人已有的戳（否则 coherence 恒 same —— 判据自己空转）。 */
    const sealed = RSx.seal(9, [{ face: 'fact', key: 'f1', rev: 3 }, { face: 'summary', key: 's1', rev: 4 }]);
    if (sealed.coherence.state !== 'mixed') return 'seal 必须保留各面自有的 rev（一律改写会让本判据恒过），实 ' + sealed.coherence.state;
    const filled = RSx.seal(9, [{ face: 'fact', key: 'f1' }]);
    if (filled.faces[0].rev !== 9) return '没盖戳的面须被补上当版戳，实 ' + filled.faces[0].rev;
    return '';
}
/** T：票据五形（**不得压成一格布尔**）。 */
function judgeTicket(RSx) {
    const t0 = RSx.ticket({ chatId: 'A', epoch: 1, rev: 0, now: 1000 });
    const ok = RSx.checkTicket(t0, { chatId: 'A', epoch: 1, now: 1500 });
    const no = RSx.checkTicket(null, { chatId: 'A', epoch: 1, now: 1500 });
    const chat = RSx.checkTicket(t0, { chatId: 'B', epoch: 1, now: 1500 });
    const ep = RSx.checkTicket(t0, { chatId: 'A', epoch: 2, now: 1500 });
    const ex = RSx.checkTicket(t0, { chatId: 'A', epoch: 1, now: 1000 + RSx.TICKET_TTL_MS + 1 });
    if (ok.reason !== 'ok' || ok.ok !== true) return '未变且未过期须放行，实 ' + JSON.stringify(ok);
    if (no.reason !== 'no-ticket') return '没给票须落 no-ticket（**不是** expired），实 ' + no.reason;
    if (chat.reason !== 'chat-changed') return '换会话须落 chat-changed（**不是** no-ticket），实 ' + chat.reason;
    if (ep.reason !== 'epoch-changed') return '换代须落 epoch-changed（回档/恢复/导入），实 ' + ep.reason;
    if (ex.reason !== 'expired') return '超期须落 expired，实 ' + ex.reason;
    const reasons = [ok, no, chat, ep, ex].map((x) => x.reason);
    if (new Set(reasons).size !== reasons.length) return '五种理由必须互不同形，实 ' + JSON.stringify(reasons);
    if (JSON.stringify(reasons.slice().sort()) !== JSON.stringify(RSx.TICKET_REASONS.slice().sort())) {
        return '五种理由须恰等于词表，实 ' + JSON.stringify(reasons);
    }
    /* ★ 顺序判据：会话变了**且**已过期时，报的是更具体的那个（切聊）。 */
    const both = RSx.checkTicket(t0, { chatId: 'B', epoch: 1, now: 1000 + RSx.TICKET_TTL_MS + 1 });
    if (both.reason !== 'chat-changed') return '切聊与过期同时成立时报切聊（更具体的那一个），实 ' + both.reason;
    /* 产票**不写任何状态**：连调两次得到同一个键（纯函数）。 */
    return RSx.ticket({ chatId: 'A', epoch: 1, rev: 0, now: 1000 }).key === t0.key ? '' : '产票须为纯函数（同参同键）';
}
/** R：定向重试（**不整批重放**）。 */
function judgeRetry(RSx) {
    const rec = {
        id: 'rpr_9',
        affected: [
            { kind: 'fact', key: 'f1', status: 'failed' },
            { kind: 'fact', key: 'f2', status: 'missing' },
            { kind: 'summary', key: 's1', status: 'done', evidence: 'confirmed' },
            { kind: 'timeline', key: 'tl1', status: 'done', evidence: 'unconfirmed' }
        ]
    };
    const p = RSx.retryOf(rec, {});
    if (p.state !== 'ready') return '有 failed 项须落 ready，实 ' + p.state;
    if (p.candidate !== 2) return '只挑 failed / missing（`done` 不进），实 ' + p.candidate;
    /* ★ 「不整批重放」必须**可读**：跳过的项要明说，不能靠「回执里没出现」推断。 */
    if (!Array.isArray(p.skipped) || p.skipped.length !== 2) return '跳过的项必须明说（skipped），实 ' + JSON.stringify(p.skipped);
    if (p.skipped.indexOf('s1') < 0) return '已 confirmed 的项必须在 skipped 里点名';
    if (p.items.some((x) => x.status === 'done')) return '重试清单里不得出现已 done 的项';
    /* 幂等键逐项（含 key 与 kind）+ 逐次（含 attempt）。 */
    const keys = p.items.map((x) => x.retryKey);
    if (new Set(keys).size !== keys.length) return '每项的 retryKey 必须互不相同，实 ' + JSON.stringify(keys);
    if (keys[0].indexOf('rpr_9#fact#f1#1') < 0) return 'retryKey 须含记录 id + kind + key + 次数，实 ' + keys[0];
    const p2 = RSx.retryOf(rec, { attempt: 1 });
    if (p2.items[0].retryKey === p.items[0].retryKey) return '不同次重试须有不同的键（第二次不是重放第一次）';
    /* 达上限 ⇒ exhausted（「还能试」与「试到底了」不同形）；且**不给清单**。 */
    const ex = RSx.retryOf(rec, { attempt: RSx.MAX_ATTEMPTS });
    if (ex.state !== 'exhausted') return '达上限须落 exhausted，实 ' + ex.state;
    if (ex.items.length) return '达上限不得再给可执行清单（否则「该不该落笔」要靠调用方猜）';
    /* 无项可重试 ⇒ none；记录不存在 ⇒ missing（三个「没东西可做」的处境互不同形）。 */
    if (RSx.retryOf({ id: 'r', affected: [{ kind: 'fact', key: 'k', status: 'done', evidence: 'confirmed' }] }, {}).state !== 'none') {
        return '全都 done 须落 none，实 ' + RSx.retryOf({ id: 'r', affected: [{ kind: 'fact', key: 'k', status: 'done', evidence: 'confirmed' }] }, {}).state;
    }
    if (RSx.retryOf({ id: 'r', affected: [] }, {}).state !== 'missing') return '无项可判须落 missing';
    /* 默认**不含**未证实项（那些项宿主已动过手，重试会二次改数据）；要含须显式声明。 */
    if (p.items.some((x) => x.key === 'tl1')) return '未证实项默认不进重试（二次改数据是事故）';
    const inc = RSx.retryOf(rec, { includeUnproven: true });
    if (!inc.items.some((x) => x.key === 'tl1')) return '显式声明后未证实项须纳入';
    return '';
}
/** K：召回缓存跟随（三态 + 覆盖范围随读数）。 */
function judgeCache(RSx) {
    const arts = [
        { turnId: 't1', artifactId: 'a1', selectedMemoryIds: ['f1', 'x'] },
        { turnId: 't2', artifactId: 'a2', selectedMemoryIds: ['y'] }
    ];
    const hit = RSx.cacheOf(arts, ['f1']);
    if (hit.state !== 'has-hits' || hit.count !== 1) return '引用被撤 id 的产物须被列出，实 ' + JSON.stringify({ s: hit.state, c: hit.count });
    if (hit.invalidated[0].turnId !== 't1') return '须点名是哪一轮的产物，实 ' + hit.invalidated[0].turnId;
    if (hit.scanned !== 2) return '扫描面读数须在场（判「扫了没有」与「没产物可扫」要靠它），实 ' + hit.scanned;
    const clean = RSx.cacheOf(arts, ['zzz']);
    if (clean.state !== 'clean') return '扫过但没有须落 clean，实 ' + clean.state;
    const none = RSx.cacheOf([], ['f1']);
    if (none.state !== 'no-artifacts') return '没产物可扫须落 no-artifacts（**与 clean 不同形**），实 ' + none.state;
    if (none.state === clean.state) return '「扫了干净」与「没东西可扫」不得同形';
    /* 截断随读数透出（窄读数不得冒充全量）。 */
    const tr = RSx.cacheOf([{ turnId: 't3', selectedMemoryIds: ['f1'], selectedMemoryIdsTruncated: true }], ['f1']);
    if (tr.invalidated[0].truncated !== true) return '产物被截过必须随读数透出（窄读数不得冒充全量）';
    return '';
}
/** H：宿主接线逐符号在场（取库口 + 装配点 + 十出口 + 自述 + 诊断行）。 */
function judgeHost(src) {
    const once = ['_settleDeps(now) {', 'repairRecord(ref) {', 'repairSettleView(ref, opts) {',
        'repairPreviewTicket(input) {', 'repairPreviewCheck(t, ctx) {',
        'async retryRepairItems(ref, opts = {}) {', 'repairInvalidateRecallCache(revokedIds, opts = {}) {',
        'repairSettleDescribe() {', 'repairSettleLine() {',
        'function _repairSettleLib() {', 'function _recallArtifactLib() {'];
    for (const s of once) {
        const n = src.split(s).length - 1;
        if (n !== 1) return '宿主口须恰好在场一次：' + s + '（实 ' + n + '）';
    }
    if (!src.includes("_moduleLib(() => window.LonShaRepairSettle, 'repair-settle.js')")) return '取库口须真读全局名 + 文件名';
    if (!src.includes("_moduleLib(() => window.LonShaRecallArtifact, 'recall-artifact.js')")) return '召回产物取库口须真读全局名 + 文件名';
    if (!src.includes("['修复落定', this.repairSettleLine()]")) return '诊断行须接进 selfCheck 表';
    if (!src.includes('_lastRepairSettle')) return '宿主须留最近一次落定读数（诊断行据此说「最近那条落成什么」）';
    /* ★ 定向重试必须走**同一套** owner 通道（另写一套迟早分叉成两种语义）。 */
    const a = src.indexOf('async retryRepairItems(ref, opts = {}) {');
    const b = src.indexOf('repairInvalidateRecallCache(revokedIds, opts = {}) {');
    if (a < 0 || b <= a) return '宿主方法体切片失败（判据失效）';
    const seg = src.slice(a, b);
    if (seg.indexOf('this._repairOwners()') < 0) return '重试须走同一套 owner 落笔通道（_repairOwners）';
    if (seg.indexOf('this._verifyRepairItem(') < 0) return '重试须走同一套原数据核验（_verifyRepairItem）';
    /* ★ 不整批重放：落笔清单**只能**来自 `plan.items`（不得回落到整条记录）。 */
    if (seg.indexOf('for (const step of plan.items)') < 0) return '重试的落笔清单必须只来自 plan.items（否则就是整批重放）';
    if (/for \(const step of \(rec0\.affected/.test(seg)) return '不得回落到整条记录的 affected（那是整批重放）';
    /* 重试次数只有一处知道（调用方不该自带）。 */
    if (seg.indexOf('const attempt = Number(rec0.retryAttempt)') < 0) return '重试次数须从记录上读（只此一处知道）';
    /* 装配点三件键名须与内核 REQUIRED_DEPS 逐字一致，**判在装配点方法体切片里**。 */
    const da = src.indexOf('_settleDeps(now) {');
    const db = src.indexOf('repairRecord(ref) {');
    if (da < 0 || db <= da) return '装配点方法体切片失败（判据失效）';
    const depsSeg = src.slice(da, db);
    for (const need of RS.REQUIRED_DEPS) {
        if (depsSeg.indexOf(need.key + ':') < 0) return '装配点缺依赖键：' + need.key;
    }
    return '';
}
/** S：自述与自检（四态可达性可机械核对；依赖缺格如实报）。 */
function judgeSelf(RSx) {
    const ok = RSx.describe({ KINDS: RL.KINDS, EVIDENCE: RL.EVIDENCE, now: 1 });
    if (ok.verdictsExhaustive !== true) return '四态须各自可达（verdictsExhaustive）';
    if (ok.writesNothing !== true) return '本面须自报零写（它是纯函数面）';
    if (ok.reason) return '依赖齐备时不应有 reason，实 ' + ok.reason;
    const bad = RSx.describe({});
    if (!bad.missing.length || bad.missing.length !== RSx.REQUIRED_DEPS.length) return '依赖全缺时须逐条报出缺哪格';
    const sc = RSx.selfCheck({ KINDS: RL.KINDS, EVIDENCE: RL.EVIDENCE, now: 1 });
    if (sc.ok !== true || sc.depsComplete !== true || sc.verdictsExhaustive !== true) return '自检须为真：' + JSON.stringify(sc);
    if (sc.writesNothing !== true) return '自检须确认零写';
    const scBad = RSx.selfCheck({});
    if (scBad.ok !== false || scBad.depsComplete !== false) return '依赖缺格时自检须转假';
    /* 诊断行：无记录 = 「尚未落定过」，**不是**「一条都没成」。 */
    if (RSx.line(null) === RSx.line({ affected: [{ status: 'failed' }] })) return '「尚未落定过」与「有异常项」不得同形';
    if (RSx.line({ affected: [{ status: 'done', evidence: 'confirmed' }] }).indexOf('corrected') < 0) return '诊断行须报出落定态';
    return '';
}

/* ───────────────── 宿主夹具（真取库口 + 真模块，不走 mock） ───────────────── */
const HOST_METHODS = [
    '_settleDeps(now) {', 'repairRecord(ref) {', 'repairSettleView(ref, opts) {',
    'repairPreviewTicket(input) {', 'repairPreviewCheck(t, ctx) {',
    /* ★ `async` 必须原样带上：`retryRepairItems` 的方法体里有 `await this.storage.save(...)`，
     *   丢 `async` 后 `await` 被当标识符，紧接的 `this` 报 `Unexpected token 'this'`。 */
    'async retryRepairItems(ref, opts = {}) {', 'repairInvalidateRecallCache(revokedIds, opts = {}) {',
    'repairSettleDescribe() {', 'repairSettleLine() {',
    '_repairOwners() {', '_verifyRepairItem(kind, key, note) {',
    '_leaseValid(lease) {', '_leaseDrop(lease, task, floor) {', 'repairRevision() {'
];
/** 模块级取库口（**不是** class 方法：它们定义在 IIFE 顶层，不提取就是自由变量）。 */
const LIB_FNS = [
    'function _moduleLib(getGlobal, fileName) {', 'function _repairLoopLib() {',
    'function _repairSettleLib() {', 'function _recallArtifactLib() {',
    'function _eventCompletenessLib() {', 'function _factVersionLib() {'
];
function methodBody(src, header) {
    let at = src.indexOf(header);
    if (at < 0) return null;
    if (at >= 6 && src.slice(at - 6, at) === 'async ') at -= 6;
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
const EC = require_(path.join(R, 'event-completeness.js'));
const CL = require_(path.join(R, 'commitment-ledger.js'));
const FV = require_(path.join(R, 'fact-version.js'));
function libWindow() {
    return {
        LonShaRepairLoop: RL, LonShaRepairSettle: RS, LonShaRecallArtifact: RA,
        LonShaEventCompleteness: EC, LonShaFactVersion: FV, LonShaCommitmentLedger: CL
    };
}
function makeHost() {
    const h = {
        config: { config: { debugMode: false } },
        _repairState: null,
        _mutationEpoch: 0,
        _eventThreadState: { events: [{ id: 'ev1', title: '苏晴 搬家', segments: [], abandoned: false }] },
        graph: { edges: new Map(), rebuildNameIndex() {} },
        worldProg: { commitmentLedger: { items: [{ id: 'cm1', actor: '苏晴', content: '答应搬家', status: 'open', history: [] }] } },
        _factVersionState: { facts: [{ id: 'f1', subject: '苏晴', predicate: '住', value: '老城', history: [] }] },
        timeline: { entries: [{ id: 'tl1', text: '苏晴 搬走' }] },
        _recallArtifacts: [],
        _recallArtifactEvictions: { byAge: 0, byCap: 0, lastFloor: null, lastRemoved: 0, lastAt: 0 },
        getCurrentChatId() { return 'chat-A'; },
        collectExport() { return { version: PKG.version, repairLog: this._repairState }; },
        __saved: [],
        __disk: null,
        storage: {
            async save(chatId, payload) { h.__saved.push('s'); h.__disk = JSON.parse(JSON.stringify(payload || null)); return true; },
            async load() { return { repairLog: (h.__disk && h.__disk.repairLog) ? h.__disk.repairLog : null }; }
        },
        summary: {
            getActiveSummaries: () => [{ floor: 3, text: '苏晴 搬家' }],
            updateSummaryText(floor, t) {
                const s = this.getActiveSummaries().find((x) => Number(x.floor) === Number(floor));
                if (!s) return false;
                s.text = t; return true;
            }
        }
    };
    return h;
}
function engineFrom(src) {
    const body = HOST_METHODS.map((h) => {
        const s = methodBody(src, h);
        assert.ok(s, '宿主方法在位：' + h);
        return s;
    }).join(',\n');
    const libs = LIB_FNS.map((h) => {
        const s = methodBody(src, h);
        assert.ok(s, '模块级取库口在位：' + h);
        return s;
    }).join('\n');
    const eng = new Function('errLog', 'PLUGIN_NAME', 'window', `${libs}\nreturn ({ ${body} });`)(
        () => {}, 'v3311', libWindow());
    return Object.assign(eng, makeHost());
}
function loadBroken(tag, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3311-' + tag + '-'));
    const p = path.join(dir, MOD);
    const broken = breakOnce(MOD_SRC, anchor, repl, tag);
    fs.writeFileSync(p, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过（否则归因不成立）：' + String(chk.stderr).slice(-300));
    return require_(p);
}

/* ══════════════════ M 模块与导出面 ══════════════════ */
test('v3311 M1. ★★★★ 模块登记面：分发面恰一次 + 末位（零兄弟依赖）+ 双导出 + 冻结', () => {
    assert.ok(fs.existsSync(path.join(R, MOD)), MOD + ' 必须在场');
    assert.equal(judgeA1(RS, MF, MOD_SRC), '', '登记面判据');
    assert.equal(MF.extra_js.filter((x) => x === MOD).length, 1, MOD + ' 须恰登记一次');
});

test('v3311 M2. ★★★★ 导出面：十一个函数 + 六张登记表 + 自检四证', () => {
    assert.equal(judgeA2(RS), '', '导出面判据');
    assert.deepEqual(RS.VERDICTS.slice(), ['registered', 'partial', 'settled', 'corrected'], '落定词表逐字');
    assert.deepEqual(RS.COHERENCE.slice(), ['same', 'mixed', 'unknown'], '同代词表逐字');
    assert.equal(judgeSelf(RS), '', '自述与自检判据');
});

/* ══════════════════ V 四态判定 ══════════════════ */
test('v3311 V1. ★★★★★ 「仅登记」不得读成「事实已纠正」：四态各自可达且互不同形', () => {
    assert.equal(judgeVerdict(RS), '', '四态判定判据');
});

/* ══════════════════ C 同代一致性 ══════════════════ */
test('v3311 C1. ★★★★★ 同代一致性三态可分：mixed 是实证、unknown 是判不了（不得用缺席补证据）', () => {
    assert.equal(judgeCoherence(RS), '', '同代判据');
});

/* ══════════════════ T 票据 ══════════════════ */
test('v3311 T1. ★★★★★ 预览票据五形：没票 / 切聊 / 换代 / 过期 / 有效（不得压成一格布尔）', () => {
    assert.equal(judgeTicket(RS), '', '票据判据');
});

/* ══════════════════ R 定向重试 ══════════════════ */
test('v3311 R1. ★★★★★ 失败项单独重试（不整批重放）：只挑坏项 + 跳过名单可读 + 上限分档', () => {
    assert.equal(judgeRetry(RS), '', '重试判据');
});

/* ══════════════════ K 召回缓存 ══════════════════ */
test('v3311 K1. ★★★★ 召回缓存跟随同代：引用被撤 id 的产物被列出（三态互不同形）', () => {
    assert.equal(judgeCache(RS), '', '召回缓存判据');
});

/* ══════════════════ H 宿主接线 ══════════════════ */
test('v3311 H1. ★★★★★ 宿主接线逐符号在场（取库口 / 装配点 / 九出口 / 自述 / 诊断行 / 不整批重放）', () => {
    assert.equal(judgeHost(IDX), '', '宿主接线判据');
    /* 本面刻意不进快照：快照构造里不得出现 repairSettle*（每轮付一遍全量扫描的设计）。 */
    const at = IDX.indexOf('const snap = {');
    assert.ok(at > 0, '快照构造点必须在场（否则本判据扫描面失效，会恒真）');
    assert.equal(/repairSettle|_lastRepairSettle/.test(IDX.slice(at, at + 12000)), false, '落定面不得进快照（按需查询口 ≠ 每轮状态投影）');
});

/* ══════════════════ E 端到端 ══════════════════ */
test('v3311 E1. ★★★★★ 端到端：注册完一条 ⇒ registered（**不是** corrected）；定向重试后四态推进', async () => {
    const eng = engineFrom(IDX);
    /* 造一条登记：两个 fact 项，其中一项初始即 failed（模拟上次落笔失败）。 */
    eng._repairState = {
        version: 1, seq: 1, repairs: [{
            id: 'rpr_1', action: 'revoke', subject: '苏晴', target: '老城', retryAttempt: 0,
            affected: [
                { kind: 'fact', key: 'f1', basis: 'ref', status: 'failed', evidence: 'unconfirmed', why: 'by-ref' },
                { kind: 'timeline', key: 'tl1', basis: 'needle', status: 'pending', evidence: 'unconfirmed', why: 'mentions-needle' }
            ]
        }]
    };
    /* ① 先看落定态：**有 failed + pending ⇒ partial**（「部分成功不伪装全成功」）。 */
    const before = eng.repairSettleView({ id: 'rpr_1' });
    assert.equal(before.ok, true, '落定面须给出读数');
    assert.equal(before.verdict, 'partial', '有失败项须落 partial，实 ' + before.verdict);
    /* ★ 核心验收：这一态**不得**被读成「事实已纠正」。 */
    assert.notEqual(before.verdict, 'corrected', '仅登记/部分完成不得显示「事实已纠正」');
    /* ② 定向重试：只重试 failed 的那一项（timeline 是 needle 候选且 pending，不在 failed 集里）。 */
    const r = await eng.retryRepairItems({ id: 'rpr_1' });
    assert.ok(r, '重试须给回执（模块在场时）');
    assert.equal(r.applied, 1, '只应落那一项，实 ' + r.applied);
    assert.ok(r.skipped.indexOf('s1') < 0, 'skipped 只列 done 项');
    assert.equal(r.retry.state, 'ready');
    /* ③ 落了盘、回了读（两条证据都在）⇒ fact 项该是 confirmed。 */
    assert.equal(r.readback, true, '落盘回读须为真');
    const rec = eng._repairState.repairs.find((x) => x.id === 'rpr_1');
    const f1 = rec.affected.find((x) => x.key === 'f1');
    assert.equal(f1.status, 'done', 'fact 项须落 done');
    assert.equal(f1.evidence, 'confirmed', '原数据 + 回读两条都真 ⇒ confirmed');
    assert.equal(rec.retryAttempt, 1, '重试计数须 +1（且只此一处知道）');
    /* ④ 四态推进：pending 项还在 ⇒ 仍是 partial；全部落定后才可能 corrected。 */
    const after = eng.repairSettleView({ id: 'rpr_1' });
    assert.equal(after.verdict, 'partial', '还有 pending 项 ⇒ 仍须是 partial，实 ' + after.verdict);
    assert.notEqual(after.verdict, 'corrected', '尚有未落定项时不得报 corrected');
    /* ⑤ 同代：三个面（fact / timeline / recall）都由本面盖章 ⇒ 全部同戳。 */
    assert.equal(after.coherence.state, 'same', '全部补上当版戳后须落 same，实 ' + after.coherence.state);
    assert.equal(after.coherence.unstamped, 0, 'seal 须把没戳的面补上');
});

test('v3311 E2. ★★★★ 端到端：召回缓存跟随落定（引用被撤 id 的产物真作废，dryRun 只看不动）', () => {
    const eng = engineFrom(IDX);
    eng._recallArtifacts = [
        { turnId: 't1', artifactId: 'a1', selectedMemoryIds: ['f1', 'x'], artifactKind: 'recall' },
        { turnId: 't2', artifactId: 'a2', selectedMemoryIds: ['y'], artifactKind: 'recall' }
    ];
    /* dryRun：**只看不动**（产物数量不变，但读数如实）。 */
    const dry = eng.repairInvalidateRecallCache(['f1'], { dryRun: true });
    assert.equal(dry.ok, true, 'dryRun 须成功');
    assert.equal(dry.count, 1, '须指出 1 条该作废');
    assert.equal(dry.removed, 0, 'dryRun 不得真删');
    assert.equal(eng._recallArtifacts.length, 2, 'dryRun 后产物数量不得变');
    /* 真作废：走既有写面 invalidateTurn。 */
    const real = eng.repairInvalidateRecallCache(['f1']);
    assert.equal(real.removed, 1, '须真删掉那一条，实 ' + real.removed);
    assert.equal(eng._recallArtifacts.length, 1, '产物须剩 1 条');
    assert.equal(eng._recallArtifacts[0].turnId, 't2', '留下的是没引用被撤 id 的那条');
    /* 再扫一次 ⇒ clean（**与 no-artifacts 不同形**：这里扫了、干净了）。 */
    const again = eng.repairInvalidateRecallCache(['f1']);
    assert.equal(again.state, 'clean', '扫过且干净须落 clean，实 ' + again.state);
});

/* ══════════════════ J 加载面 ══════════════════ */
test('v3311 J1. 加载面：模块登记进 extra_js 且磁盘在场；上游两模块仍登记', () => {
    assert.ok(MF.extra_js.includes(MOD), MOD + ' 必须在 manifest.extra_js（不登记 = 浏览器不加载 = 面永远缺席）');
    assert.ok(fs.existsSync(path.join(R, MOD)), '磁盘必须在场');
    assert.ok(MF.extra_js.includes('repair-loop.js'), '修复闭环须仍登记（本模块复用它的登记表）');
    assert.ok(MF.extra_js.includes('recall-artifact.js'), '召回产物须仍登记（本模块复用它的写面）');
});

/* ══════════════════ N 负控制 ══════════════════ */
test('v3311 N1. ★★★★ 破坏工具两向自证：锚点不存在 / 不唯一 / 同值替换，都必须抛', () => {
    assert.throws(() => breakOnce(MOD_SRC, '__不存在__', 'x'), /恰中 1 次/);
    assert.throws(() => breakOnce(MOD_SRC, 'e', 'x'), /恰中 1 次/, '单字符锚点必不唯一');
    assert.throws(() => breakOnce(MOD_SRC, ANCHORS.settled, ANCHORS.settled), /同值替换/);
    assert.notEqual(breakOnce(MOD_SRC, ANCHORS.settled, ANCHORS.settledBroken), MOD_SRC, '真破坏必须可观测地改变源码');
});

test('v3311 N2. ★★★★★ 六条真源码破坏负控制（每条必须让对应判据转红）+ 正控制地基', () => {
    /* 地基：未破坏时全部判据必须为真（否则后面的「转红」可能是判据自己坏了）。 */
    assert.equal(judgeVerdict(RS), '', '原件上四态判据必须为真');
    assert.equal(judgeCoherence(RS), '', '原件上同代判据必须为真');
    assert.equal(judgeTicket(RS), '', '原件上票据判据必须为真');
    assert.equal(judgeRetry(RS), '', '原件上重试判据必须为真');
    assert.equal(judgeCache(RS), '', '原件上缓存判据必须为真');

    /* ① 四态压成三态：`settled` 那一支改报 corrected ⇒ 四态判据须点名。 */
    const b1 = loadBroken('settled', ANCHORS.settled, ANCHORS.settledBroken);
    assert.equal(b1.verdictOf({ affected: [{ status: 'done', evidence: 'unconfirmed' }] }).verdict, 'corrected', '破坏必须真的生效');
    assert.ok(judgeVerdict(b1).indexOf('settled') >= 0, '同款判据须点名 settled 被吞：' + judgeVerdict(b1));
    assert.equal(judgeVerdict(RS), '', '对照：原件上仍为零问题');

    /* ② 用缺席补证据：有一项没盖戳却报 same ⇒ 同代判据须点名。 */
    const b2 = loadBroken('partialstamps', ANCHORS.partialStamps, ANCHORS.partialStampsBroken);
    assert.equal(b2.coherenceOf([{ rev: 7 }, {}]).state, 'same', '破坏必须真的生效');
    assert.ok(judgeCoherence(b2).indexOf('缺席') >= 0, '同款判据须点名「用缺席补证据」：' + judgeCoherence(b2));

    /* ③ seal 改掉别家戳 ⇒ coherence 恒 same ⇒ 同代判据须点名。 */
    const b3 = loadBroken('sealkeeps', ANCHORS.sealKeeps, ANCHORS.sealKeepsBroken);
    assert.equal(b3.seal(9, [{ face: 'fact', key: 'f1', rev: 3 }, { face: 'summary', key: 's1', rev: 4 }]).coherence.state, 'same', '破坏必须真的生效');
    assert.ok(judgeCoherence(b3).indexOf('seal') >= 0, '同款判据须点名 seal 改戳：' + judgeCoherence(b3));

    /* ④ 切聊与没票同形 ⇒ 票据判据须点名。 */
    const b4 = loadBroken('chat', ANCHORS.chatChanged, ANCHORS.chatChangedBroken);
    const t4 = b4.ticket({ chatId: 'A', epoch: 1, rev: 0, now: 1000 });
    assert.equal(b4.checkTicket(t4, { chatId: 'B', epoch: 1, now: 1500 }).reason, 'no-ticket', '破坏必须真的生效');
    assert.ok(judgeTicket(b4).indexOf('chat-changed') >= 0, '同款判据须点名切聊：' + judgeTicket(b4));

    /* ⑤ 跳过名单恒空 ⇒ 「不整批重放」不可读 ⇒ 重试判据须点名。 */
    const b5 = loadBroken('skipped', ANCHORS.skipped, ANCHORS.skippedBroken);
    assert.equal(b5.retryOf({ id: 'r', affected: [{ kind: 'k', key: 'k', status: 'done', evidence: 'confirmed' }] }, {}).skipped.length, 0, '破坏必须真的生效');
    assert.ok(judgeRetry(b5).indexOf('skipped') >= 0, '同款判据须点名跳过名单：' + judgeRetry(b5));

    /* ⑥ 缓存三态压成两态 ⇒ 缓存判据须点名。 */
    const b6 = loadBroken('cache', ANCHORS.cacheState, ANCHORS.cacheStateBroken);
    assert.equal(b6.cacheOf([], ['f1']).state, 'clean', '破坏必须真的生效（没产物可扫被报成干净）');
    assert.ok(judgeCache(b6).indexOf('no-artifacts') >= 0, '同款判据须点名：' + judgeCache(b6));
});

/* ══════════════════ L 判据纯度 / 版本锚 ══════════════════ */
test('v3311 L1. ★★★ 判据纯度：每个锚点字面量在本档只声明一次', () => {
    for (const [k, v] of Object.entries(ANCHORS)) {
        assert.equal(SELF.split(v).length - 1, 1, '锚点 ' + k + ' 在本档里必须恰出现 1 次（纯度检查才有内容）');
    }
    /* fail-closed：模块缺失必须抛（不静默跳过）。 */
    assert.ok(fs.existsSync(path.join(R, MOD)), '模块必须真在场（缺 ⇒ 本档当场抛，不静默跳过）');
    assert.throws(() => fs.accessSync(path.join(R, 'no-such-file-' + MOD)), /ENOENT/);
});

/** 版本序数（本档自锚常量形，供版本守卫 V4 计数）。 */
const vnum = (s) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s).trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
/** 本档出生版本（V4 当版锚点：锚必须住在**当版档案**里，故写在这一档、不写进历史文件）。 */
const BORN = '3.311.0';

test('v3311 M3. ★★★ 版本锚：本档出生版本 + 六源同源（V4 当版锚点形态）', () => {
    assert.equal(vnum(BORN), 3311000, 'vnum 序数必须可数（当版锚点）');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量必须在场');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源（须是 let：bindDeps 可换，const 会 TypeError）');
    }
    assert.ok(SELF.includes("const BORN = '3.311.0'"), '当版锚点必须显式留在本档里');
    assert.equal(SELF.includes('vnum(BORN)'), true, '锚形须可被守卫计数');
});