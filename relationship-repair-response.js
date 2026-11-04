/* ============================================================
 * relationship-repair-response.js — [L14-X7] 关系修复的一次完整回应
 * ------------------------------------------------------------
 * 把「修复提议 → 回应 → 后续行为证据」连成一条可保存的链。
 *
 * 【为什么要在 relationship-repair-theater.js 之外另立一件】
 *   剧场（relationship-repair-theater.js）已经能做「选一条路径推演一次」，
 *   但它的产物是**一次推演**，不是**一份可保存的回应**：
 *     · 没有「部分接受」——只有四条整路径（解释求和 / 设界 / 拒绝 / 暂缓），
 *       而真实回应常常是「这件事我接受，那件我不接受」；
 *     · 没有回应记录：`executeRepairPath` 改的是内存里的 encounter，
 *       没有「谁在哪天回应了哪一条、当时怎么说的」这一层；
 *     · 没有「后续行为证据」：剧场判不了「道歉之后他是否真的做到了」，
 *       于是「说过了」与「做到了」同形 —— 这正是本项要治的那一格。
 *   本模块只做这条链，不重做剧场，也不改它的契约。
 *
 * 【四条硬约束（计划验收旅程逐条对应）】
 *   ① **拒绝仍是有效结局**：reject 落 `responded`，不是失败、不是待办，
 *      不催办、不算未完成。defer 同理（暂缓是决定，不是拖延）。
 *   ② **一次道歉不自动清除旧事**：`oldEventsCleared` 恒 false；
 *      旧事以 `unresolvedHistory` 原样保留，和解也不抹。
 *   ③ **后续履约能回链**：行为证据必须带 `askId`（回链到当时答应的是哪一条）
 *      与真实来源 `sourceRef`；无来源的证据一律拒收，不猜、不补。
 *   ④ **模拟草案与已发生行为严格分开**：`origin:'draft'` 的证据不进进展判定，
 *      只在 `draftEvidence` 里单列；只有 `origin:'occurred'` 才算数。
 *
 * 【数据 owner】
 *   读：调用方传入的提议与回应记录（本模块不读 engine 槽）。
 *   写：**无**。全部纯函数，返回新对象；持久化由宿主按自己的 owner 决定。
 *
 * 【零依赖、CJS/IIFE 双导出，挂 root.LonShaRelationshipRepairResponse】
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRelationshipRepairResponse = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var VERSION = '3.447.0';

    /* 四种回应。拒绝与延期是**有效结局**，不是「还没好」。 */
    var RESPONSE_KINDS = Object.freeze({
        ACCEPT: 'accept',
        REJECT: 'reject',
        DEFER: 'defer',
        PARTIAL: 'partial'
    });

    /* 回应的两种轴：还没回应 / 已回应（含拒绝与延期）。
     *   刻意不设 'failed'、'pending'：那会把「他明确拒绝了」读成「流程没走完」。 */
    var RESPONSE_STATES = Object.freeze(['awaiting-response', 'responded']);

    /* 行为证据三档。unknown 既不算做到也不算没做到 —— 判不了就说判不了。 */
    var BEHAVIOR_VERDICTS = Object.freeze(['kept', 'broken', 'unknown']);

    /* 证据来源两档：occurred 是真实发生过的行为；draft 是模拟/草案。
     *   ★ 两档**永不同形**：草案不进进展判定，也不进 kept/broken 计数。 */
    var EVIDENCE_ORIGINS = Object.freeze(['occurred', 'draft']);

    /* 进展四态。declared = 只有口头承诺；demonstrated = 有真实行为证据。 */
    var PROGRESS = Object.freeze(['no-response', 'declared', 'demonstrated', 'broken']);

    function safeStr(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }
    function isObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
    function copy(v) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k]; }); return o; }
    function nowIso() { return new Date().toISOString(); }

    /* ============================================================
     * createRepairResponseRecord — 建一份待回应记录（纯数据，不写）
     * @param {object} proposal {
     *   proposalId, fromActorId, toActorId, summary,
     *   asks: [{ askId, text, severity? }]
     * }
     * ============================================================ */
    function createRepairResponseRecord(proposal, opts) {
        var p = isObject(proposal) ? proposal : {};
        var o = isObject(opts) ? opts : {};
        var proposalId = safeStr(p.proposalId);
        if (!proposalId) return { ok: false, reason: 'proposal-required', writes: false };
        var rawAsks = safeArr(p.asks);
        if (rawAsks.length === 0) {
            /* 没有具体诉求的「道歉」无法逐条回应，也无法回链证据 —— 拒收，
             *   不替调用方编一条 ask 出来（那会让「什么都没答应」看起来像答应了一条）。 */
            return { ok: false, reason: 'asks-required', writes: false };
        }
        var seen = {};
        var asks = [];
        var skippedNoId = 0;
        for (var i = 0; i < rawAsks.length; i++) {
            var a = isObject(rawAsks[i]) ? rawAsks[i] : null;
            var askId = a ? safeStr(a.askId) : '';
            if (!askId) { skippedNoId += 1; continue; }
            if (seen[askId]) continue;
            seen[askId] = true;
            asks.push({
                askId: askId,
                text: safeStr(a.text),
                severity: safeStr(a.severity) || 'normal'
            });
        }
        if (asks.length === 0) {
            return { ok: false, reason: 'no-valid-asks', writes: false, skippedNoId: skippedNoId };
        }
        return {
            ok: true,
            writes: false,
            record: {
                version: VERSION,
                proposalId: proposalId,
                fromActorId: safeStr(p.fromActorId),
                toActorId: safeStr(p.toActorId),
                summary: safeStr(p.summary),
                asks: asks,
                state: 'awaiting-response',
                response: null,
                /* 旧事原样保留：和解不是失忆（约束②）。 */
                unresolvedHistory: safeArr(p.unresolvedHistory).map(safeStr).filter(Boolean),
                oldEventsCleared: false,
                behaviorEvidence: [],
                draftEvidence: [],
                createdAt: safeStr(o.at) || nowIso(),
                revision: 0
            },
            skippedNoId: skippedNoId
        };
    }

    /* ============================================================
     * recordResponse — 记录一次回应（拒绝/延期/接受/部分接受）
     * @param {object} record
     * @param {object} response {
     *   kind, acceptedAskIds?, rejectedAskIds?, deferredAskIds?, note?, at?
     * }
     * ============================================================ */
    function recordResponse(record, response) {
        if (!isObject(record) || !Array.isArray(record.asks)) {
            return { ok: false, reason: 'record-required', writes: false };
        }
        if (record.state === 'responded') {
            /* 二次回应不是覆盖：第一次说了什么必须留得住，要改请新建一份。 */
            return { ok: false, reason: 'already-responded', writes: false, previous: record.response };
        }
        var r = isObject(response) ? response : {};
        var kind = safeStr(r.kind);
        var valid = Object.keys(RESPONSE_KINDS).some(function (k) { return RESPONSE_KINDS[k] === kind; });
        if (!valid) return { ok: false, reason: 'unknown-response-kind', writes: false };

        var allIds = record.asks.map(function (a) { return a.askId; });
        function pick(list) {
            var out = [];
            safeArr(list).forEach(function (v) {
                var id = safeStr(v);
                /* 不认得的 askId 一律拒：静默丢弃会让「我答应了第 3 条」消失。 */
                if (allIds.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
            });
            return out;
        }
        var accepted = pick(r.acceptedAskIds);
        var rejected = pick(r.rejectedAskIds);
        var deferred = pick(r.deferredAskIds);

        var classified = accepted.concat(rejected).concat(deferred);
        var overlaps = [];
        var seenCount = {};
        classified.forEach(function (id) {
            seenCount[id] = (seenCount[id] || 0) + 1;
        });
        Object.keys(seenCount).forEach(function (id) {
            if (seenCount[id] > 1) overlaps.push(id);
        });
        if (overlaps.length > 0) {
            /* 同一条既接受又拒绝 —— 这是输入矛盾，不替用户裁决。 */
            return { ok: false, reason: 'conflicting-ask-classification', writes: false, overlaps: overlaps };
        }

        if (kind === RESPONSE_KINDS.ACCEPT) {
            /* 整条接受：未显式列出的诉求按「一并接受」处理，但**列出的必须自洽**。 */
            accepted = allIds.slice();
            rejected = [];
            deferred = [];
        } else if (kind === RESPONSE_KINDS.REJECT) {
            rejected = allIds.slice();
            accepted = [];
            deferred = [];
        } else if (kind === RESPONSE_KINDS.DEFER) {
            deferred = allIds.slice();
            accepted = [];
            rejected = [];
        } else {
            /* 部分接受：**每条都必须被显式归类**。
             *   留空的条目不是「默认接受」，是「还没说」—— 那就不是一次完整回应。 */
            var unclassified = allIds.filter(function (id) { return classified.indexOf(id) < 0; });
            if (unclassified.length > 0) {
                return {
                    ok: false,
                    reason: 'unclassified-asks',
                    writes: false,
                    unclassifiedAskIds: unclassified
                };
            }
            if (accepted.length === 0 && rejected.length === 0 && deferred.length === 0) {
                return { ok: false, reason: 'empty-partial', writes: false };
            }
        }

        var resp = {
            kind: kind,
            acceptedAskIds: accepted,
            rejectedAskIds: rejected,
            deferredAskIds: deferred,
            note: safeStr(r.note),
            at: safeStr(r.at) || nowIso()
        };
        var next = copy(record);
        next.state = 'responded';
        next.response = resp;
        next.revision = (typeof record.revision === 'number' ? record.revision : 0) + 1;
        /* 旧事仍不清除（约束②）—— 拒绝也好、接受也好，历史原样在。 */
        next.oldEventsCleared = false;
        return {
            ok: true,
            writes: false,
            record: next,
            /* 拒绝/延期是**有效结局**，显式回执，便于 UI 不把它们画成待办（约束①）。 */
            validOutcome: true,
            isRejection: kind === RESPONSE_KINDS.REJECT,
            isDeferral: kind === RESPONSE_KINDS.DEFER,
            asksCount: allIds.length
        };
    }

    /* ============================================================
     * recordBehaviorEvidence — 记一条后续行为证据（必须能回链 + 有真来源）
     * @param {object} record
     * @param {object} ev {
     *   evidenceId, askId, verdict:'kept'|'broken'|'unknown',
     *   origin:'occurred'|'draft', sourceRef, note?, at?
     * }
     * ============================================================ */
    function recordBehaviorEvidence(record, ev) {
        if (!isObject(record) || !Array.isArray(record.asks)) {
            return { ok: false, reason: 'record-required', writes: false };
        }
        var e = isObject(ev) ? ev : {};
        var evidenceId = safeStr(e.evidenceId);
        var askId = safeStr(e.askId);
        var verdict = safeStr(e.verdict);
        var origin = safeStr(e.origin) || 'occurred';
        var sourceRef = safeStr(e.sourceRef);
        if (!evidenceId) return { ok: false, reason: 'evidence-id-required', writes: false };
        if (!askId) {
            /* 不能回链的证据证明不了「他履约了没有」—— 拒收（约束③）。 */
            return { ok: false, reason: 'ask-link-required', writes: false };
        }
        var known = record.asks.some(function (a) { return a.askId === askId; });
        if (!known) return { ok: false, reason: 'unknown-ask', writes: false };
        if (BEHAVIOR_VERDICTS.indexOf(verdict) < 0) {
            return { ok: false, reason: 'unknown-verdict', writes: false };
        }
        if (EVIDENCE_ORIGINS.indexOf(origin) < 0) {
            return { ok: false, reason: 'unknown-origin', writes: false };
        }
        if (!sourceRef) {
            /* 没有来源的「他做到了」就是无凭据捏造 —— 一律拒收，不猜。 */
            return { ok: false, reason: 'source-required', writes: false };
        }
        var already = safeArr(record.behaviorEvidence).concat(safeArr(record.draftEvidence))
            .some(function (x) { return x.evidenceId === evidenceId; });
        if (already) return { ok: false, reason: 'duplicate-evidence', writes: false };

        var item = {
            evidenceId: evidenceId,
            askId: askId,
            verdict: verdict,
            origin: origin,
            sourceRef: sourceRef,
            note: safeStr(e.note),
            at: safeStr(e.at) || nowIso()
        };
        var next = copy(record);
        if (origin === 'draft') {
            /* 草案证据**单独一格**，绝不进进展判定（约束④）。 */
            next.draftEvidence = safeArr(record.draftEvidence).concat([item]);
        } else {
            next.behaviorEvidence = safeArr(record.behaviorEvidence).concat([item]);
        }
        next.revision = (typeof record.revision === 'number' ? record.revision : 0) + 1;
        next.oldEventsCleared = false;
        return {
            ok: true,
            writes: false,
            record: next,
            countedInProgress: origin === 'occurred',
            evidence: item
        };
    }

    /* ============================================================
     * computeProgress — 由**真实行为证据**判进展（口头承诺不算做到）
     * ============================================================ */
    function computeProgress(record) {
        if (!isObject(record) || !Array.isArray(record.asks)) {
            return { ok: false, reason: 'record-required', writesNothing: true };
        }
        var allIds = record.asks.map(function (a) { return a.askId; });
        var occurred = safeArr(record.behaviorEvidence);
        var drafts = safeArr(record.draftEvidence);

        var byAsk = {};
        allIds.forEach(function (id) {
            byAsk[id] = { askId: id, kept: 0, broken: 0, unknown: 0, verdict: 'no-evidence' };
        });
        occurred.forEach(function (e) {
            var b = byAsk[e.askId];
            if (!b) return;
            if (e.verdict === 'kept') b.kept += 1;
            else if (e.verdict === 'broken') b.broken += 1;
            else b.unknown += 1;
        });
        var keptAsks = 0, brokenAsks = 0, unprovenAsks = 0;
        allIds.forEach(function (id) {
            var b = byAsk[id];
            if (b.kept > 0 && b.broken === 0) { b.verdict = 'kept'; keptAsks += 1; }
            else if (b.broken > 0) { b.verdict = 'broken'; brokenAsks += 1; }
            else { b.verdict = b.unknown > 0 ? 'unknown' : 'no-evidence'; unprovenAsks += 1; }
        });

        var state = record.state === 'responded' ? 'responded' : 'awaiting-response';
        var progress;
        if (state !== 'responded') progress = 'no-response';
        else if (brokenAsks > 0) progress = 'broken';
        else if (keptAsks > 0) progress = 'demonstrated';
        else progress = 'declared';   /* 只有承诺、或证据判不了 —— 口头，不算做到 */

        var responseKind = record.response ? record.response.kind : null;
        return {
            ok: true,
            writesNothing: true,
            createsFact: false,
            proposalId: record.proposalId,
            state: state,
            responseKind: responseKind,
            /* 拒绝与延期是有效结局：这里显式告诉调用方「不必再催」。 */
            validOutcome: state === 'responded',
            isRejection: responseKind === RESPONSE_KINDS.REJECT,
            isDeferral: responseKind === RESPONSE_KINDS.DEFER,
            progress: progress,
            progressLabel: progress === 'no-response' ? '还没回应'
                : (progress === 'declared' ? '只有口头，未证实'
                    : (progress === 'demonstrated' ? '已有后续行为证实' : '后续行为与之相反')),
            asksTotal: allIds.length,
            asksKept: keptAsks,
            asksBroken: brokenAsks,
            asksUnproven: unprovenAsks,
            perAsk: allIds.map(function (id) { return byAsk[id]; }),
            /* 约束②：无论进展如何，旧事都不被清除。 */
            oldEventsCleared: false,
            unresolvedHistory: safeArr(record.unresolvedHistory).slice(),
            /* 约束④：草案证据单列且不计数，别把「我们演练过」读成「他做到了」。 */
            occurredEvidenceCount: occurred.length,
            draftEvidenceCount: drafts.length,
            draftEvidenceExcluded: true
        };
    }

    /* ============================================================
     * resolveAskKind — 单条诉求的处置（给 UI 逐行显示用）
     * ============================================================ */
    function resolveAskKind(record, askId) {
        if (!isObject(record) || !record.response) return { ok: false, reason: 'no-response' };
        var id = safeStr(askId);
        var r = record.response;
        if (safeArr(r.acceptedAskIds).indexOf(id) >= 0) return { ok: true, askId: id, kind: 'accepted' };
        if (safeArr(r.rejectedAskIds).indexOf(id) >= 0) return { ok: true, askId: id, kind: 'rejected' };
        if (safeArr(r.deferredAskIds).indexOf(id) >= 0) return { ok: true, askId: id, kind: 'deferred' };
        return { ok: false, reason: 'unclassified' };
    }

    function repairResponseSelfCheck() {
        var problems = [];
        if (Object.keys(RESPONSE_KINDS).length !== 4) problems.push('回应必须恰好 4 类');
        if (RESPONSE_STATES.indexOf('failed') >= 0) problems.push('拒绝/延期是有效结局，不得混进 failed');
        if (BEHAVIOR_VERDICTS.length !== 3) problems.push('行为证据必须恰好 3 档');
        if (EVIDENCE_ORIGINS.length !== 2) problems.push('证据来源必须恰好 2 档（occurred/draft）');
        if (PROGRESS.length !== 4) problems.push('进展必须恰好 4 态');
        var bad = createRepairResponseRecord({}, {});
        if (bad.ok !== false) problems.push('无 proposalId 必须拒收');
        var noAsks = createRepairResponseRecord({ proposalId: 'p1', asks: [] }, {});
        if (noAsks.ok !== false) problems.push('无诉求的道歉必须拒收（否则「什么都没答应」看起来像答应了）');
        return Object.freeze({ version: VERSION, problems: Object.freeze(problems) });
    }

    return Object.freeze({
        VERSION: VERSION,
        RESPONSE_KINDS: RESPONSE_KINDS,
        RESPONSE_STATES: RESPONSE_STATES,
        BEHAVIOR_VERDICTS: BEHAVIOR_VERDICTS,
        EVIDENCE_ORIGINS: EVIDENCE_ORIGINS,
        PROGRESS: PROGRESS,
        createRepairResponseRecord: createRepairResponseRecord,
        recordResponse: recordResponse,
        recordBehaviorEvidence: recordBehaviorEvidence,
        computeProgress: computeProgress,
        resolveAskKind: resolveAskKind,
        repairResponseSelfCheck: repairResponseSelfCheck
    });
}));