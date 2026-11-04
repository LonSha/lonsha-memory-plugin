/* ============================================================
 * era-handoff-draft.js — [L14-X8] 跨代传承的交接编排
 * ------------------------------------------------------------
 * 由上一代的物件 / 故事 / 技艺**逐项指定继承者与取舍**，
 * 预览下一代的可用材料，并可撤回草案。
 *
 * 【本期为什么要有这一层（现有底座与真实缺口）】
 *   底座已有两件，但都不到「交接编排」：
 *     · era-inheritance.js         —— 有转场与四类提案，但**没有「逐项指定继承者」**
 *                                     （applyTransition 只认 action，不认人）；
 *     · era-continuation-inheritance-tree.js —— 有四态 + pending 分轴 + 秘密四档，
 *                                     但它是**只读推导**（输入 eraTransitions 原样），
 *                                     不产出「下一代能拿什么」。
 *   缺口正是这两件之间那一段：**草案（可改、可撤、未确认零写入）**。
 *
 * 【四条硬约束（计划验收旅程逐条对应，缺一条本项就不算完成）】
 *   ① accept/reject/reform/lost 是「结果轴」，pending 是「未到结果」，
 *      **两轴分列，永不同形**：同一件不可能既是 pending 又已 accepted；
 *      未处置的件在下一代材料里读作「还没传」，绝不读作「传丢/拒绝」。
 *   ② 一件传给甲，**不默认为全家共有**：默认独占；共有必须显式 `sharedWith`，
 *      未列名的另一位继承者在预览里拿不到这件（返回 'not-yours'）。
 *   ③ 秘密未授权**不进入下一代材料**：一律调宿主注入的 `knowledgeOf` 裁决，
 *      只有 disclosed 一档给正文；withheld / undecided / absent 只给遮蔽占位。
 *      本模块**不自己写一套「该不该给他看」**（真源在秘密账，另写必漂移）。
 *   ④ 草案**未确认零写入**：create / assign / preview / revoke 全部不碰任何槽；
 *      提交只产出 payload，交回 `eraTransitions` 的既有 owner。
 *
 * 【数据 owner】
 *   读：调用方传入的上一代传承物清单（本模块不读 engine 槽）。
 *   写：**无**。提交经 `buildCommitPayload()` 产 { owner:'eraTransitions', payload }。
 *
 * 【零依赖、CJS/IIFE 双导出，挂 root.LonShaEraHandoffDraft】
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEraHandoffDraft = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var VERSION = '3.446.0';

    /* 传承物三种：物件 / 故事 / 技艺（计划原文三样，别扩成四不像）。 */
    var HERITAGE_KINDS = Object.freeze({
        ARTIFACT: 'artifact',
        STORY: 'story',
        CRAFT: 'craft'
    });

    /* 结果轴：传接**已经发生过**之后，每一件都会落在其中一档。 */
    var RESULT_FATES = Object.freeze(['accepted', 'rejected', 'reformed', 'lost']);

    /* 未到结果：传接**还没发生**。刻意不在 RESULT_FATES 里 ——
     *   混进去「四态穷尽」这条自证当场失效（第十八次同型事故的修法）。 */
    var PENDING_FATE = 'pending';

    var AXIS = Object.freeze({ RESULT: 'result', PROGRESS: 'progress', UNKNOWN: 'unknown' });

    /* 秘密边界四档，与 era-continuation-inheritance-tree 同一口径：
     *   disclosed / withheld / undecided / absent（absent 用 why 区分
     *   「不是秘密」与「秘密账里没有这条」—— 这两件事处置相反）。 */
    var SECRET_BOUNDARIES = Object.freeze(['disclosed', 'withheld', 'undecided', 'absent']);

    var REDACTION = '［未授权：这一代不在知情名单］';

    function safeStr(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }
    function isObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
    function copy(v) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k]; }); return o; }

    function axisOf(fate) {
        var f = safeStr(fate);
        if (RESULT_FATES.indexOf(f) >= 0) return AXIS.RESULT;
        if (f === PENDING_FATE) return AXIS.PROGRESS;
        return AXIS.UNKNOWN;
    }
    function kindLabel(kind) {
        if (kind === HERITAGE_KINDS.ARTIFACT) return '物件';
        if (kind === HERITAGE_KINDS.STORY) return '故事';
        if (kind === HERITAGE_KINDS.CRAFT) return '技艺';
        return '判不了种类';
    }
    function fateLabel(fate) {
        if (fate === 'accepted') return '后辈接纳';
        if (fate === 'rejected') return '拒绝继承';
        if (fate === 'reformed') return '改造再造';
        if (fate === 'lost') return '遗失于历史';
        if (fate === PENDING_FATE) return '还没传';
        return '判不了';
    }
    function isKind(kind) {
        return kind === HERITAGE_KINDS.ARTIFACT || kind === HERITAGE_KINDS.STORY || kind === HERITAGE_KINDS.CRAFT;
    }

    /* ============================================================
     * createHandoffDraft — 建草案（只读，writesNothing 恒 true）
     * @param {Array} items [{ id, kind, title, content, fromEra?, isSecret?, secretRef? }]
     * @param {object} opts { draftId?, fromEra?, toEra? }
     * ============================================================ */
    function createHandoffDraft(items, opts) {
        var o = isObject(opts) ? opts : {};
        var src = safeArr(items);
        if (src.length === 0) {
            return { ok: false, reason: 'items-required', writesNothing: true, draft: null, writes: false };
        }
        var seen = {};
        var rows = [];
        var undecidedKind = [];
        var skippedNoId = 0;
        for (var i = 0; i < src.length; i++) {
            var it = isObject(src[i]) ? src[i] : null;
            var id = it ? safeStr(it.id) : '';
            if (!id) { skippedNoId += 1; continue; }
            /* 同一件重复进来只留首条：合并两条内容＝本模块替用户造事实。 */
            if (seen[id]) continue;
            seen[id] = true;
            var kind = safeStr(it.kind);
            var kindOk = isKind(kind);
            if (!kindOk) undecidedKind.push(id);
            rows.push({
                itemId: id,
                kind: kindOk ? kind : 'unknown',
                kindLabel: kindLabel(kindOk ? kind : 'unknown'),
                title: safeStr(it.title),
                content: safeStr(it.content),
                fromEra: safeStr(it.fromEra) || safeStr(o.fromEra) || 'first_era',
                isSecret: it.isSecret === true,
                secretRef: safeStr(it.secretRef) || null,
                assignment: null
            });
        }
        if (rows.length === 0) {
            return { ok: false, reason: 'no-valid-items', writesNothing: true, draft: null, writes: false, skippedNoId: skippedNoId };
        }
        var draft = {
            version: VERSION,
            draftId: safeStr(o.draftId) || ('handoff#' + rows.length),
            fromEra: safeStr(o.fromEra) || rows[0].fromEra,
            toEra: safeStr(o.toEra) || 'next_era',
            status: 'draft',
            revoked: false,
            items: rows,
            assignmentLog: [],
            revision: 0,
            undecidedKind: undecidedKind,
            writesNothing: true
        };
        return {
            ok: true,
            draft: draft,
            writesNothing: true,
            writes: false,
            itemCount: rows.length,
            undecidedKind: undecidedKind.slice(),
            skippedNoId: skippedNoId
        };
    }

    /* ============================================================
     * assignHandoffItem — 逐项指定继承者与取舍（改的是草案，不是事实）
     * @param {object} draft
     * @param {object} assignment { itemId, heirId, fate, reformedNotes?, sharedWith?, note? }
     * ============================================================ */
    function assignHandoffItem(draft, assignment) {
        if (!isObject(draft) || !Array.isArray(draft.items)) {
            return { ok: false, reason: 'draft-required', writes: false };
        }
        if (draft.revoked === true || draft.status === 'revoked') {
            return { ok: false, reason: 'draft-revoked', writes: false };
        }
        var a = isObject(assignment) ? assignment : {};
        var itemId = safeStr(a.itemId);
        var heirId = safeStr(a.heirId);
        var fate = safeStr(a.fate);
        if (!itemId) return { ok: false, reason: 'item-required', writes: false };
        if (!heirId) return { ok: false, reason: 'heir-required', writes: false };
        var idx = -1;
        for (var i = 0; i < draft.items.length; i++) {
            if (draft.items[i].itemId === itemId) idx = i;
        }
        if (idx < 0) return { ok: false, reason: 'unknown-item', writes: false };
        /* 不认得的处置一律拒绝：静默当 accepted 会把「写错字」读成「传下去了」。 */
        if (axisOf(fate) === AXIS.UNKNOWN) return { ok: false, reason: 'unknown-fate', writes: false };

        var shares = [];
        var sharesIgnored = false;
        var rawShares = safeArr(a.sharedWith);
        for (var j = 0; j < rawShares.length; j++) {
            var s = safeStr(rawShares[j]);
            if (s && s !== heirId && shares.indexOf(s) < 0) shares.push(s);
        }
        /* 拒绝/遗失没有「共有」这回事：显式丢掉并留痕，不静默保留。 */
        if (shares.length > 0 && (fate === 'rejected' || fate === 'lost')) {
            sharesIgnored = true;
            shares = [];
        }
        var rec = {
            itemId: itemId,
            heirId: heirId,
            fate: fate,
            axis: axisOf(fate),
            fateLabel: fateLabel(fate),
            reformedNotes: fate === 'reformed' ? safeStr(a.reformedNotes) : '',
            sharedWith: shares,
            note: safeStr(a.note),
            sharesIgnored: sharesIgnored,
            seq: (typeof draft.revision === 'number' ? draft.revision : 0) + 1
        };
        var items = draft.items.map(function (r) {
            if (r.itemId !== itemId) return r;
            var c = copy(r);
            c.assignment = rec;
            return c;
        });
        var next = copy(draft);
        next.items = items;
        next.assignmentLog = safeArr(draft.assignmentLog).concat([rec]);
        next.revision = rec.seq;
        return {
            ok: true,
            draft: next,
            assignment: rec,
            writes: false,
            sourceUntouched: true,
            sharesIgnored: sharesIgnored,
            fateAxis: rec.axis
        };
    }

    /* ============================================================
     * resolveSecret — 秘密边界：只调注入的 knowledgeOf，不自己写一套
     * ============================================================ */
    function resolveSecret(item, heirId, knowledgeOf) {
        if (!item || item.isSecret !== true) {
            return { boundary: 'absent', why: 'not-secret', exposed: true };
        }
        if (typeof knowledgeOf !== 'function') {
            return { boundary: 'undecided', why: 'no-knowledge-kernel', exposed: false };
        }
        var scope;
        try {
            scope = knowledgeOf(item.secretRef || item.itemId, heirId);
        } catch (_e) {
            return { boundary: 'undecided', why: 'knowledge-kernel-threw', exposed: false };
        }
        if (scope === 'knower') return { boundary: 'disclosed', why: '', exposed: true };
        if (scope === 'listed') return { boundary: 'withheld', why: 'not-in-knower-list', exposed: false };
        /* 账里没有这条 ≠ 没给名单：账漏记是要人去看的缺陷，但两档都不外泄。 */
        if (scope === 'absent') return { boundary: 'absent', why: 'not-in-secret-ledger', exposed: false };
        return { boundary: 'undecided', why: 'no-knower-list', exposed: false };
    }

    /* 单件对某位继承者的可见性（预览的材料单元） */
    function materialOf(item, heirId, knowledgeOf) {
        var a = item.assignment;
        var base = {
            itemId: item.itemId,
            kind: item.kind,
            kindLabel: item.kindLabel,
            title: item.title,
            axis: AXIS.PROGRESS,
            fate: PENDING_FATE,
            fateLabel: fateLabel(PENDING_FATE),
            heirId: heirId,
            assignedTo: a ? a.heirId : null,
            shared: false,
            visible: false,
            titleVisible: false,
            contentVisible: false,
            blockedBySecret: false,
            secretBoundary: null,
            promptText: '',
            reason: ''
        };
        /* ① 还没处置 ⇒ 未到结果轴（不是遗失、不是拒绝）。 */
        if (!a || axisOf(a.fate) !== AXIS.RESULT) {
            base.axis = AXIS.PROGRESS;
            base.fate = PENDING_FATE;
            base.fateLabel = fateLabel(PENDING_FATE);
            base.reason = 'transition-not-applied';
            return base;
        }
        base.axis = AXIS.RESULT;
        base.fate = a.fate;
        base.fateLabel = fateLabel(a.fate);
        /* ② 一件传给甲，不默认为全家共有。 */
        var shared = safeArr(a.sharedWith).indexOf(heirId) >= 0;
        var isOwner = a.heirId === heirId;
        /* ★ [首跑自纠] 修前写的是 `isOwner && shared` —— 两个条件互斥（自己不会把
         *   自己列进 sharedWith），于是**任何一件的 shared 恒为 false**：
         *   「甲把东西共有给乙」在乙的读数里读作「独占，不是共有」，而乙确实拿到了。
         *   正解：`shared` 表示「这一份是通过共有名单拿到的」，只有非本人的那一侧成立。 */
        base.shared = shared && !isOwner;
        if (!isOwner && !shared) {
            base.reason = 'assigned-to-other-heir';
            return base;
        }
        if (a.fate === 'rejected') { base.reason = 'successor-declined'; return base; }
        if (a.fate === 'lost') { base.reason = 'declared-lost'; return base; }
        /* ③ accepted / reformed：先过秘密边界，再过内容。 */
        var sec = resolveSecret(item, heirId, knowledgeOf);
        base.secretBoundary = sec.boundary;
        if (!sec.exposed) {
            base.blockedBySecret = true;
            base.reason = sec.why;
            base.promptText = '';
            return base;
        }
        base.visible = true;
        base.titleVisible = true;
        base.contentVisible = true;
        var body = item.content;
        if (a.fate === 'reformed') {
            body = a.reformedNotes ? (item.content + '｜改造：' + a.reformedNotes) : item.content;
        }
        base.promptText = (item.title ? item.title + '：' : '') + body;
        base.reason = a.fate === 'reformed' ? 'successor-reshaped' : 'successor-took-up';
        return base;
    }

    /* ============================================================
     * previewNextGeneration — 下一代可用材料预览（只读，不生成事实）
     * @param {object} draft
     * @param {object} opts { heirId?, generationId?, knowledgeOf? }
     *   不给 heirId ⇒ 逐继承者分组（用来证明「传给甲的不默认给乙」）
     * ============================================================ */
    function previewNextGeneration(draft, opts) {
        if (!isObject(draft) || !Array.isArray(draft.items)) {
            return { ok: false, reason: 'draft-required', writesNothing: true, writes: false };
        }
        if (draft.revoked === true || draft.status === 'revoked') {
            return { ok: false, reason: 'draft-revoked', writesNothing: true, writes: false };
        }
        var o = isObject(opts) ? opts : {};
        var knowledgeOf = (typeof o.knowledgeOf === 'function') ? o.knowledgeOf : null;
        var heirId = safeStr(o.heirId);
        var heirList = [];
        if (heirId) {
            heirList = [heirId];
        } else {
            draft.items.forEach(function (it) {
                var a = it.assignment;
                if (!a) return;
                if (a.heirId && heirList.indexOf(a.heirId) < 0) heirList.push(a.heirId);
                safeArr(a.sharedWith).forEach(function (s) {
                    if (s && heirList.indexOf(s) < 0) heirList.push(s);
                });
            });
        }
        var boundaryTotals = { disclosed: 0, withheld: 0, undecided: 0, absent: 0 };
        var groups = heirList.map(function (hid) {
            var counts = { available: 0, shared: 0, pending: 0, rejected: 0, lost: 0, notYours: 0, blockedBySecret: 0, total: 0 };
            var lines = [];
            var withheld = [];
            var materials = draft.items.map(function (it) {
                var m = materialOf(it, hid, knowledgeOf);
                counts.total += 1;
                if (m.blockedBySecret) {
                    counts.blockedBySecret += 1;
                    withheld.push({ itemId: m.itemId, titleVisible: false, boundary: m.secretBoundary, reason: m.reason });
                    if (Object.prototype.hasOwnProperty.call(boundaryTotals, m.secretBoundary)) boundaryTotals[m.secretBoundary] += 1;
                    return m;
                }
                if (m.visible) {
                    counts.available += 1;
                    if (m.shared) counts.shared += 1;
                    if (m.promptText) lines.push(m.promptText);
                } else if (m.axis === AXIS.PROGRESS) counts.pending += 1;
                else if (m.fate === 'rejected') counts.rejected += 1;
                else if (m.fate === 'lost') counts.lost += 1;
                else counts.notYours += 1;
                return m;
            });
            return {
                heirId: hid,
                materials: materials,
                withheldSecrets: withheld,
                counts: counts,
                /* 预览串只用于「看一眼」，带 isDraft 标记；绝不当作已发生事实。 */
                promptPreview: lines.join('\n'),
                promptPreviewIsDraft: true
            };
        });
        return {
            ok: true,
            writesNothing: true,
            writes: false,
            createsFact: false,
            draftId: draft.draftId,
            generationId: safeStr(o.generationId) || safeStr(draft.toEra) || 'next_era',
            heirCount: groups.length,
            heirs: groups,
            boundaryTotals: boundaryTotals,
            /* 给单继承人调用方的直读便利（多继承人时用 heirs）。 */
            materials: groups.length === 1 ? groups[0].materials : [],
            promptPreview: groups.length === 1 ? groups[0].promptPreview : '',
            promptPreviewIsDraft: true
        };
    }

    /* ============================================================
     * revokeHandoffDraft — 撤回草案：源不动、旧卷仍可读、草案归零
     * ============================================================ */
    function revokeHandoffDraft(draft) {
        if (!isObject(draft) || !Array.isArray(draft.items)) {
            return { ok: false, reason: 'draft-required', writes: false };
        }
        var next = copy(draft);
        next.status = 'revoked';
        next.revoked = true;
        next.items = draft.items.map(function (r) {
            var c = copy(r);
            c.assignment = null;
            return c;
        });
        /* 撤回不是删除审计：旧处置留在 revokedAssignments，但不参与任何读数。 */
        next.revokedAssignments = safeArr(draft.assignmentLog).slice();
        next.assignmentLog = [];
        next.revision = (typeof draft.revision === 'number' ? draft.revision : 0) + 1;
        return {
            ok: true,
            draft: next,
            revoked: true,
            writes: false,
            sourceUntouched: true,
            oldEraReadable: true
        };
    }

    /* ============================================================
     * buildCommitPayload — 提交口：本模块不写，产出 owner=eraTransitions 的载荷
     *   未确认（opts.confirm !== true）一律不产出载荷。
     * ============================================================ */
    function buildCommitPayload(draft, opts) {
        var o = isObject(opts) ? opts : {};
        if (!isObject(draft) || !Array.isArray(draft.items)) {
            return { ok: false, reason: 'draft-required', writes: false };
        }
        if (draft.revoked === true || draft.status === 'revoked') {
            return { ok: false, reason: 'draft-revoked', writes: false };
        }
        var decided = draft.items.filter(function (it) {
            return it.assignment && axisOf(it.assignment.fate) === AXIS.RESULT;
        });
        if (decided.length === 0) {
            return { ok: false, reason: 'no-decisions', writes: false, pendingCount: draft.items.length };
        }
        if (o.confirm !== true) {
            return { ok: false, reason: 'not-confirmed', writes: false, wouldWriteCount: decided.length };
        }
        var declarations = {};
        var appliedItems = [];
        decided.forEach(function (it) {
            var a = it.assignment;
            declarations[it.itemId] = {
                fate: a.fate,
                heirId: a.heirId,
                sharedWith: safeArr(a.sharedWith).slice(),
                source: 'handoff-draft'
            };
            /* appliedItems 只放 roster 认得的动作：accept/reject/modify。
             *   lost 没有对应动作，只走 declarations（roster 里声明优先）——
             *   硬塞个 'lose' 会被读成 unknown，把「明确宣告遗失」读成「判不了」。 */
            if (a.fate === 'accepted') appliedItems.push({ itemId: it.itemId, action: 'accept', heirId: a.heirId, sharedWith: safeArr(a.sharedWith).slice() });
            else if (a.fate === 'rejected') appliedItems.push({ itemId: it.itemId, action: 'reject', heirId: a.heirId, sharedWith: [] });
            else if (a.fate === 'reformed') appliedItems.push({ itemId: it.itemId, action: 'modify', heirId: a.heirId, sharedWith: safeArr(a.sharedWith).slice(), reformedNotes: a.reformedNotes });
        });
        /* ★ [首跑自纠] 载荷里的 `items` **只能放已处置的件**。
         *   真跑实测：把未处置件一并塞进一个 `status:'applied'` 的转场后，
         *   `buildInheritanceRoster` 的既有规则「转场跑完了它却没被处置」
         *   （`lost:dropped-in-transition`）会把玩家**留在 pending 的那件读成「遗失」**。
         *   这直接违反本项验收「accept/reject/reform/lost 与 pending 保持分轴」：
         *   玩家什么都没决定，下一代却被告知「你家传的东西丢了」。
         *   ⇒ 一次提交只声明**真的传下去**的那些；未处置件留在草案里等下一轮。
         *   宁可「这次没提它」，绝不「替它宣布遗失」。 */
        var committedItems = draft.items.filter(function (it) {
            return it.assignment && axisOf(it.assignment.fate) === AXIS.RESULT;
        });
        var carriedOver = draft.items.filter(function (it) {
            return !(it.assignment && axisOf(it.assignment.fate) === AXIS.RESULT);
        }).map(function (it) { return it.itemId; });
        return {
            ok: true,
            writes: false,                       /* 本模块不写任何槽 */
            owner: 'eraTransitions',
            confirmRequired: true,
            payload: {
                transitionId: draft.draftId,
                eraFrom: draft.fromEra,
                eraTo: draft.toEra,
                status: 'applied',
                undone: false,
                items: committedItems.map(function (it) {
                    /* ★ [首跑自纠] 本模块内部字段叫 `itemId`，而 `eraTransitions` 槽的
                     *   既有契约字段是 **`id`**（createEraTransition / roster 都读 `id`）。
                     *   修前直接 copy 过去 ⇒ roster 一条也读不到（items 空），
                     *   而提交口会报 ok:true —— 「写成功了但没人看得见」。
                     *   两个字段都给，id 为权威，itemId 保留以便回链草案。 */
                    var c = copy(it);
                    c.id = it.itemId;
                    return c;
                }),
                appliedItems: appliedItems,
                declarations: declarations,
                source: 'handoff-draft',
                revision: draft.revision
            },
            decidedCount: decided.length,
            pendingCount: draft.items.length - decided.length,
            /* 未提交、留在草案里继续等决定的件（不是遗失，下一轮还能处置）。 */
            carriedOverItemIds: carriedOver
        };
    }

    function handoffDraftSelfCheck() {
        var problems = [];
        if (RESULT_FATES.length !== 4) problems.push('结果轴必须恰好 4 档');
        if (RESULT_FATES.indexOf(PENDING_FATE) >= 0) problems.push('pending 不得混进结果轴');
        for (var i = 0; i < RESULT_FATES.length; i++) {
            if (axisOf(RESULT_FATES[i]) !== AXIS.RESULT) problems.push('结果轴自证失败：' + RESULT_FATES[i]);
        }
        if (axisOf(PENDING_FATE) !== AXIS.PROGRESS) problems.push('pending 必须落在未到结果轴');
        if (axisOf('bogus') !== AXIS.UNKNOWN) problems.push('未知处置必须落 unknown');
        if (SECRET_BOUNDARIES.length !== 4) problems.push('秘密边界必须恰好 4 档');
        var empty = createHandoffDraft([], {});
        if (empty.ok !== false) problems.push('空清单必须拒绝（否则「这局还没传过」会被读成草案）');
        var unconfirmed = buildCommitPayload({ items: [], assignmentLog: [], revision: 0 }, {});
        if (unconfirmed.ok !== false) problems.push('空草案不得产出提交载荷');
        return Object.freeze({ version: VERSION, problems: Object.freeze(problems) });
    }

    return Object.freeze({
        VERSION: VERSION,
        HERITAGE_KINDS: HERITAGE_KINDS,
        RESULT_FATES: RESULT_FATES,
        PENDING_FATE: PENDING_FATE,
        AXIS: AXIS,
        SECRET_BOUNDARIES: SECRET_BOUNDARIES,
        REDACTION: REDACTION,
        axisOf: axisOf,
        createHandoffDraft: createHandoffDraft,
        assignHandoffItem: assignHandoffItem,
        previewNextGeneration: previewNextGeneration,
        revokeHandoffDraft: revokeHandoffDraft,
        buildCommitPayload: buildCommitPayload,
        handoffDraftSelfCheck: handoffDraftSelfCheck
    });
}));
