/* ============================================================
 * era-continuation-inheritance-tree.js — [L9-X9 · 第九期规划 → v3.444.0 · L13-X9 补到可用]
 * 时代接续与可玩传承谱系树（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   叙事进入新时代或篇章跨越时的传承资产沉淀：
 *     - 四大传承物状态：
 *       'accepted' (后辈接纳), 'rejected' (拒绝继承),
 *       'reformed' (改造再造), 'lost' (遗失于历史)
 *     - 秘密与知情边界断代阻断：新一代绝不自动获知前代未公开的秘密
 *     - 断代缺口显式表达为缺失，绝不由模型无凭捏造补全
 *
 * 【v3.444.0 · L13-X9 补了什么（计划原文：四态已声明，需补「每态的可读成因 +
 *   与既有 eraTransitions 槽的对接」）】
 *   ① **每态可读成因** `FATE_CAUSES`：同是 'lost'，「被明确宣告丢失」与
 *      「传接跑完了它却没被处置」是两件不同的事，读数必须分得开；
 *   ② **与既有 `eraTransitions` 槽对接** `buildInheritanceRoster()`：
 *      输入就是 `worldProg.eraTransitions` 原样（**不新开存储、不建第二套事实库**），
 *      输出逐条传承物 + 四态 + 成因 + 秘密边界。本模块自己不读 engine、不写任何槽。
 *   ③ **第五档 `pending`（还没传）**：这是本面最容易做错的一格 ——
 *      `lost`（传接已完成，它没留下来）与 `pending`（传接**还没发生**）若同形，
 *      用户会看到「我家传玉佩遗失了」而事实只是「还没走到那一段」。
 *      ⇒ 四态是**结果**，`pending` 是**未到结果**，两轴分列，永不同形。
 *   ④ **秘密断代四档**：'withheld'（在册但没给这一代）/ 'disclosed'（这一代知道了）/
 *      'undecided'（判不了）/ 'absent'（秘密账里根本没有这条 —— 与「没给名单」不同形）。
 *      ★ 判定一律**调既有账自己的 `knowledgeOf`**（`opts.knowledgeOf` 注入），
 *        本模块**不自己写一套「该不该给他看」**（本仓在秘密上已有三刀历史，
 *        另写一套必然与真源漂移）。
 *
 * 【零依赖、CJS/IIFE 双导出，挂 root.EraContinuationInheritanceTree】
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.EraContinuationInheritanceTree = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var VERSION = '3.444.0';

    var INHERITANCE_FATE = Object.freeze({
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        REFORMED: 'reformed',
        LOST: 'lost'
    });

    /* 第五档：**还没传**（未到结果）。刻意不在 INHERITANCE_FATE 里 ——
     *   它是「结果轴之外」的一档，混进四态会让「四态穷尽」这条自证当场失效
     *   （四态穷尽指的是「已经发生过接续之后，每条都会落在某一态」）。 */
    var PENDING_FATE = 'pending';

    /* 每态的可读成因。同态不同因必须分得开：
     *   lost 有两种来路（明确宣告 / 传接跑完却没处置），读数分开报。 */
    var FATE_CAUSES = Object.freeze({
        'accepted:successor-took-up': '后辈按原样接纳了这件传承物',
        'rejected:successor-declined': '后辈明确拒绝继承（东西在，但这一代不要）',
        'reformed:successor-reshaped': '后辈改造再造后才接过来（形态变了，来源没断）',
        'reformed:reformed-declared': '后辈声明改造过，但没留下改造说明',
        'lost:declared-lost': '被明确宣告遗失（有人确认它断了）',
        'lost:dropped-in-transition': '传接跑完了，这件却没被处置 —— 它没留下来',
        'pending:transition-not-applied': '这次时代转场还没执行（尚未发生，不是遗失）',
        'pending:stale-applied-record': '转场还没跑完，但里面留着上一次应用过的处置记录（残留，已按「还没发生」处置）',
        'unknown:unknown-action': '传接记录里的处置动作不在本模块认得的集合内（判不了）'
    });

    /* 值一态 + 成因一码，缺任一半都读不成人话。 */
    function causeOf(fate, code) {
        var key = String(fate || '') + ':' + String(code || '');
        return (FATE_CAUSES[key] || '') ? key : 'unknown:unknown-action';
    }

    function labelOf(fate) {
        if (fate === INHERITANCE_FATE.ACCEPTED) return '后辈接纳';
        if (fate === INHERITANCE_FATE.REJECTED) return '拒绝继承';
        if (fate === INHERITANCE_FATE.REFORMED) return '改造再造';
        if (fate === INHERITANCE_FATE.LOST) return '遗失于历史';
        if (fate === PENDING_FATE) return '还没传';
        return '判不了';
    }

    /* ---- 单件传承物的判定（保留 v3.391 的既有契约，只追加字段）---- */
    function inheritEraArtifact(artifact, successorAction) {
        var art = (artifact && typeof artifact === 'object') ? artifact : {};
        if (!art.id) {
            return { success: false, reason: 'invalid_artifact' };
        }

        var act = (successorAction && typeof successorAction === 'object') ? successorAction : {};
        var fate = Object.values(INHERITANCE_FATE).includes(act.fate)
            ? act.fate
            : INHERITANCE_FATE.ACCEPTED;

        var isSecret = Boolean(art.isSecret);
        var successorKnowsSecret = isSecret && Boolean(act.revealedByWill);

        /* ★ 秘密边界四档（与 buildInheritanceRoster 同一口径）：
         *   disclosed —— 这一代知道了（唯一允许把正文给新一代的一档）；
         *   withheld  —— 秘密仍在，这一代不在知情名单里；
         *   undecided —— 判不了（没给判定口 / 判定抛异常）；
         *   absent    —— 不是秘密（**不是**「秘密丢了」）。
         * 修前只有 `secretRedacted` 一个布尔：把「不在册」与「判不了」压成同一值，
         *   而这两件事的处置完全相反（前者要遮蔽，后者要人去看）。 */
        var boundary = 'absent';
        if (isSecret) {
            if (successorKnowsSecret) boundary = 'disclosed';
            else if (typeof act.knowledgeOf === 'function') {
                /* 给了判定口就调它 —— 与宿主注入口径一致；抛异常落 undecided。 */
                try {
                    var sc = act.knowledgeOf(art, act.successorActorId || '');
                    boundary = (sc === 'knower') ? 'disclosed' : (sc === 'listed' ? 'withheld' : 'undecided');
                } catch (_e) { boundary = 'undecided'; }
            } else boundary = 'withheld';
        }
        var cause;
        if (fate === INHERITANCE_FATE.REFORMED) cause = String(act.reformedNotes || '').trim() ? 'reformed:successor-reshaped' : 'reformed:reformed-declared';
        else if (fate === INHERITANCE_FATE.ACCEPTED) cause = 'accepted:successor-took-up';
        else if (fate === INHERITANCE_FATE.REJECTED) cause = 'rejected:successor-declined';
        else cause = 'lost:declared-lost';

        return {
            success: true,
            artifactId: art.id,
            originEra: art.era || 'first_era',
            successorActorId: act.successorActorId || 'unknown_successor',
            fate: fate,
            fateLabel: labelOf(fate),
            fateCause: cause,
            fateCauseText: FATE_CAUSES[cause] || '',
            isSecret: isSecret,
            successorKnowsSecret: successorKnowsSecret,
            secretRedacted: isSecret && !successorKnowsSecret,
            secretBoundary: boundary,
            reformedNotes: fate === INHERITANCE_FATE.REFORMED ? String(act.reformedNotes || '').trim() : null,
            timestamp: Date.now()
        };
    }

    /* ---- 秘密边界：只调注入的 knowledgeOf，不自己写一套 ---- */
    function boundaryOf(isSecret, ref, successor, knowledgeOf) {
        if (!isSecret) return { boundary: 'absent', why: 'not-secret' };
        if (typeof knowledgeOf !== 'function') return { boundary: 'undecided', why: 'no-knowledge-kernel' };
        var scope;
        try {
            scope = knowledgeOf(ref, successor);
        } catch (_e) {
            return { boundary: 'undecided', why: 'knowledge-kernel-threw' };
        }
        if (scope === 'knower') return { boundary: 'disclosed', why: '' };
        if (scope === 'listed') return { boundary: 'withheld', why: '' };
        /* ★ 'unlisted' 与 'absent' **必须分开**：
         *   unlisted = 条目给了秘密身份但没给知情名单（判不了「谁知道」）；
         *   absent   = 秘密账里根本没有这一条（连条目都没有 —— 这是账与条目对不上）。
         * 合成一个「判不了」会让「秘密账漏记」这条真缺陷永远看不见。 */
        if (scope === 'absent') return { boundary: 'absent', why: 'not-in-secret-ledger' };
        return { boundary: 'undecided', why: 'no-knower-list' };
    }

    function text(v, max) {
        var s = (v === null || v === undefined) ? '' : String(v);
        return s.slice(0, max || 160);
    }

    /* ============================================================
     * buildInheritanceRoster — 与既有 `worldProg.eraTransitions` 槽对接
     * ------------------------------------------------------------
     * @param {Array} transitions  worldProg.eraTransitions **原样**
     * @param {object} opts
     *   opts.successorActorId  当前这一代是谁（判秘密边界用）
     *   opts.knowledgeOf       (secretRef, who) => 'knower'|'listed'|'unlisted'|'absent'
     *                          由调用方注入**既有账自己的** knowledgeOf
     *   opts.secretLookup      (artifactId, item) => secretRef|null
     *                          由调用方去 secretLedger 里按 id/名找条目
     * @returns 只读清单（writesNothing 恒 true，本函数不碰任何槽）
     * ============================================================ */
    function buildInheritanceRoster(transitions, opts) {
        var o = (opts && typeof opts === 'object') ? opts : {};
        var absentRet = function (why) {
            return {
                version: VERSION,
                items: [], counts: { accepted: 0, rejected: 0, reformed: 0, lost: 0, pending: 0, unknown: 0, total: 0 },
                boundary: { disclosed: 0, withheld: 0, undecided: 0, absent: 0 },
                undecided: [], writesNothing: true, ok: false, reason: why
            };
        };
        /* ★ 三态不同形：传进来的**不是账**（undefined / 非数组）⇒ ok:false；
         *   「账在但是空的」⇒ ok:true + counts 全 0。合成一个「没有传承物」
         *   会把「宿主没接这条槽」读成「这局还没传过东西」。 */
        if (!Array.isArray(transitions)) return absentRet('transitions-not-array');

        var successor = text(o.successorActorId, 40);
        var knowledgeOf = (typeof o.knowledgeOf === 'function') ? o.knowledgeOf : null;
        var secretLookup = (typeof o.secretLookup === 'function') ? o.secretLookup : null;

        var counts = { accepted: 0, rejected: 0, reformed: 0, lost: 0, pending: 0, unknown: 0, total: 0 };
        var boundary = { disclosed: 0, withheld: 0, undecided: 0, absent: 0 };
        var items = [];
        var undecided = [];

        for (var i = 0; i < transitions.length; i++) {
            var tr = (transitions[i] && typeof transitions[i] === 'object') ? transitions[i] : null;
            if (!tr) continue;
            var tid = text(tr.transitionId, 60) || ('transition#' + i);
            var applied = (String(tr.status || '') === 'applied') && tr.undone !== true;
            var chosenById = {};
            var appliedItems = Array.isArray(tr.appliedItems) ? tr.appliedItems : [];
            for (var k = 0; k < appliedItems.length; k++) {
                var ai = appliedItems[k];
                if (ai && ai.itemId && !chosenById[ai.itemId]) chosenById[String(ai.itemId)] = ai;
            }
            var declarations = (tr.declarations && typeof tr.declarations === 'object') ? tr.declarations : {};
            var srcItems = Array.isArray(tr.items) ? tr.items : [];
            for (var j = 0; j < srcItems.length; j++) {
                var it = (srcItems[j] && typeof srcItems[j] === 'object') ? srcItems[j] : null;
                if (!it || !it.id) continue;
                var id = String(it.id);
                var fate = PENDING_FATE;
                var cause = 'pending:transition-not-applied';
                var chosen = chosenById[id] || null;
                var decl = (declarations[id] && typeof declarations[id] === 'object') ? declarations[id] : null;

                if (decl && decl.fate) {
                    /* 人工声明优先：这是「作者/玩家说它就是断了或被接纳了」的唯一入口。
                     *   非法声明值一律落 unknown（不当成 pending 混过去）。 */
                    if (decl.fate === INHERITANCE_FATE.LOST) { fate = INHERITANCE_FATE.LOST; cause = 'lost:declared-lost'; }
                    else if (decl.fate === INHERITANCE_FATE.ACCEPTED) { fate = INHERITANCE_FATE.ACCEPTED; cause = 'accepted:successor-took-up'; }
                    else if (decl.fate === INHERITANCE_FATE.REJECTED) { fate = INHERITANCE_FATE.REJECTED; cause = 'rejected:successor-declined'; }
                    else if (decl.fate === INHERITANCE_FATE.REFORMED) { fate = INHERITANCE_FATE.REFORMED; cause = 'reformed:reformed-declared'; }
                    else { fate = 'unknown'; cause = 'unknown:unknown-action'; }
                } else if (chosen && applied) {
                    var act = String(chosen.action || '');
                    if (act === 'accept') { fate = INHERITANCE_FATE.ACCEPTED; cause = 'accepted:successor-took-up'; }
                    else if (act === 'reject') { fate = INHERITANCE_FATE.REJECTED; cause = 'rejected:successor-declined'; }
                    else if (act === 'modify') { fate = INHERITANCE_FATE.REFORMED; cause = 'reformed:successor-reshaped'; }
                    else { fate = 'unknown'; cause = 'unknown:unknown-action'; }
                } else if (chosen && !applied) {
                    /* ★ [v3.444.0 首跑自纠] `appliedItems` **不是「做过的选择」，是「应用过的选择」**。
                     *   修前这一格没 gate 在 `applied` 上 ⇒ 转场被撤销（`undoTransition` 已清空
                     *   appliedItems）或本来就是 pending 但带着残留时，残留条目会被读成
                     *   「后辈接纳了」—— 正是本面第①条的**镜像错**：把「还没发生」读成
                     *   「已经有结果」。真跑实测：`status='pending'` + 残留 appliedItems ⇒
                     *   四条应全落 pending，修前有 1 条被读成 accepted。
                     *   处理：转场没跑完 ⇒ 一律按「还没发生」，并显式记成因
                     *   `pending:stale-applied-record`（残留是缺陷信号，不能静默当没有）。 */
                    fate = PENDING_FATE;
                    cause = 'pending:stale-applied-record';
                } else if (applied) {
                    /* ★ 本面最关键的一格：传接**已跑完**，这一件却没进 appliedItems。
                     *   它就是「没留下来」—— 与「还没传」意义相反，必须落 lost。 */
                    fate = INHERITANCE_FATE.LOST;
                    cause = 'lost:dropped-in-transition';
                } else {
                    /* 转场还没执行：这一件**尚未发生**。不是遗失，也不是拒绝。 */
                    fate = PENDING_FATE;
                    cause = 'pending:transition-not-applied';
                }

                var isSecret = (it.isSecret === true) || (it.ownerPrivate === true);
                var secRef = null;
                if (isSecret && secretLookup) {
                    try { secRef = secretLookup(id, it); } catch (_e) { secRef = null; }
                }
                var bd;
                if (!isSecret) bd = { boundary: 'absent', why: 'not-secret' };
                else if (!secRef) bd = { boundary: 'undecided', why: 'secret-ref-missing' };
                else bd = boundaryOf(true, secRef, successor, knowledgeOf);

                if (counts[fate] === undefined) { counts.unknown += 1; } else { counts[fate] += 1; }
                counts.total += 1;
                if (bd.boundary === 'disclosed') boundary.disclosed += 1;
                else if (bd.boundary === 'withheld') boundary.withheld += 1;
                else if (bd.boundary === 'undecided') { boundary.undecided += 1; undecided.push({ artifactId: id, transitionId: tid, why: bd.why }); }
                else boundary.absent += 1;

                items.push({
                    artifactId: id,
                    label: text(it.content || it.name || it.title || id, 120),
                    itemType: text(it.type, 40),
                    transitionId: tid,
                    eraFrom: text(tr.eraFrom, 40),
                    eraTo: text(tr.eraTo, 40),
                    fate: fate,
                    fateLabel: labelOf(fate),
                    fateCause: causeOf(fate, String(cause).split(':').slice(1).join(':') || 'unknown-action'),
                    fateCauseText: FATE_CAUSES[cause] || '',
                    /* 秘密边界：机器读 boundary，人读成因。四档互不同形。 */
                    isSecret: isSecret,
                    secretBoundary: bd.boundary,
                    secretBoundaryWhy: bd.why || '',
                    /* ★ 「这一代能不能看到它」只有一个来源：boundary === 'disclosed'。
                     *   非秘密条目 boundary 是 'absent'，它本来就公开（visible:true）；
                     *   秘密条目只在 disclosed 时 visible。判不了 ⇒ visible:false（宁可不给）。 */
                    visibleToSuccessor: isSecret ? (bd.boundary === 'disclosed') : true,
                    declarationsOnly: Boolean(decl && decl.fate),
                });
            }
        }

        return {
            version: VERSION,
            items: items,
            counts: counts,
            boundary: boundary,
            undecided: undecided,
            writesNothing: true,
            ok: true,
            reason: items.length ? '' : 'no-artifacts',
        };
    }

    return {
        VERSION: VERSION,
        INHERITANCE_FATE: INHERITANCE_FATE,
        PENDING_FATE: PENDING_FATE,
        FATE_CAUSES: FATE_CAUSES,
        labelOf: labelOf,
        causeOf: causeOf,
        inheritEraArtifact: inheritEraArtifact,
        buildInheritanceRoster: buildInheritanceRoster,
    };
}));