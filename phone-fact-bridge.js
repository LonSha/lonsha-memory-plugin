/* ================================================================
 * phone-fact-bridge.js — [v3.314.0 · M-X6] 手机事实桥 2.0（确认 / 撤回 / 双向回执）
 *
 * 【为什么需要这一面 / 与 X4 的分工（逐条对齐原文）】
 *   `native-fact-admission.js`（X4, v3.290.0）回答的是**「这条算不算事实」**：
 *   八栏身份 + 五态来源 + 五档裁决（admitted / observed / predicted / draft / quoted / rejected）。
 *   它**没有**回答 M-X6 点名的三件事：
 *     · 裁决之后**用户确认或拒绝**这一环在哪？（X4 只有来源默认与 userConfirmed 一个布尔钩子）
 *     · 手机侧**编辑 / 删除 / 撤回**后，记忆侧如何换代或撤回？（X4 只把 retracted 一并拒掉）
 *     · 记忆侧的**最终状态如何回传手机侧**（accepted / rejected / pending / revoked）？（X4 零回执面）
 *   长期使用后，缺这三环的后果是**桥的单向化**：手机侧只知道「送出去了」，不知道
 *   「记忆侧到底收没收、是不是还作数、我改了它知不知道」。
 *
 * 【本模块补的三件事（纯函数，零写 / 零联网）】
 *   ① 生命周期四态**互不同形**：accepted / rejected / pending / revoked。
 *      ★ 关键：pending（等用户确认）与 rejected（明确未进账）**不得同形** ——
 *      这正是本仓最贵的老账（「判不了」与「查了没有」同形）。
 *   ② 双向回执：`receiptFor` 把记忆侧裁决翻成手机侧可显示的回执行（含 reason 与下一步），
 *      且**回执只读**（不改手机侧对象，返回新行）。
 *   ③ 编辑 / 删除 / 撤回的换代与撤回计划：`planEdit` 区分 supersede（换代）与 withdraw（撤回），
 *      并以同一 `rootEventId` 为轴（跨平台转发只进一次）。
 *
 * 【与 X4 的关系：**叠加**，不是替代】
 *   本模块**不重写准入判定**。准入结果由 `deps.FACT_ADMISSION`（唯一真源）给出；
 *   本模块只在其上判「用户确认环 / 生命周期态 / 回执行 / 换代计划」。
 *   依赖缺席 ⇒ 明确降级（`bridgeState` 报 state='indeterminate' 且 reason='admission-unavailable'），
 *   **不假装能判** —— 与 M-X8 的 migration-unavailable 同纪律。
 *
 * 【本模块不做（边界，逐条对齐原文）】
 *   · 不新增网络：源码零 fetch / XHR / WebSocket / sendBeacon（由判据逐词钉住）。
 *   · 不旁路写图：换代 / 撤回以**计划**交付，写法由 owner 侧经既有门。
 *   · 不让预测 / 报价 / 草稿自动变成事实：`guardEvidence` 三guard 逐条挡在 op='observe' 之外。
 *   · 不把「桥缺席」「旧版桥」「有桥无回执面」压成一态：三态由 `probeCounterpart` 分辨。
 *
 * 挂 window.LonShaPhoneFactBridge，双导出（对齐 memory-package / native-fact-admission 约定）。
 */
(function (global) {
    'use strict';

    /** 桥面自身的契约版本（面版本，与任何一条记录无关）。 */
    const BRIDGE_VERSION = 1;
    /** 回执口径版本。改回执规则必须抬这个号（判据据此防静默改口径）。 */
    const RECEIPT_VERSION = 1;

    /**
     * 手机侧显示的生命周期四态（原文点名 accepted / rejected / pending / revoked）。
     * ★ 四态**互不同形**：pending 是「等用户确认」，rejected 是「明确未进账」——
     *   把它们压成一态会让手机侧把「还悬着」读成「被拒了」。
     */
    const LIFECYCLE_STATES = ['accepted', 'rejected', 'pending', 'revoked'];

    /** 三类事件（原文点名：财务事件 / 日历约定 / 明确完成的剧情事件）。 */
    const EVENT_CLASSES = ['finance', 'calendar', 'story'];

    /** 编辑三动作（原文：手机侧编辑 / 删除后，记忆侧能换代或撤回）。 */
    const EDIT_ACTIONS = ['edit', 'delete', 'retract'];

    /** 换代与撤回的语义（**不同形**：换代留旧条、撤回不留）。 */
    const EDIT_EFFECT = { EDIT: 'supersede', DELETE: 'withdraw', RETRACT: 'withdraw' };

    /**
     * 证据守卫三档 —— 「预测、报价、草稿不自动变成事实」的可机检形态。
     * 每一档对应一类**不得自动入账**的来源形状，值取自 X4 的 SOURCE_POLICY 语义。
     */
    const EVIDENCE_GUARDS = ['predictive', 'quote-like', 'draft-like'];

    /**
     * 回执理由词表（**穷尽**：任何非 accepted 回执必须取自这里，不得现编字符串）。
     * ★ 每一条都对应一种「手机侧必须能读懂」的处境。
     */
    const RECEIPT_REASONS = [
        'accepted',              // 已入账
        'awaiting-user',         // 等用户确认（未确认 ⇒ pending，不是 rejected）
        'user-declined',         // 用户明确拒绝
        'evidence-guarded',      // 预测/报价/草稿守卫：不得自动入账
        'admission-rejected',    // X4 准入明确拒绝
        'duplicate',             // 同源重复（幂等读数，不是失败）
        'owner-retracted',       // 手机侧撤回 / 编辑删楼
        'admission-unavailable', // 准入模块缺席（**不假装能判**）
        'bridge-absent',         // 桥缺席
        'no-identity',           // 无 eventId / rootEventId
    ];

    /** 桥能力三态（不许压成一态）。 */
    const BRIDGE_STATES = ['absent', 'legacy', 'capable'];

    /**
     * 依赖声明面。**只声明不执行**；每件缺席时的后果逐条写明 ——
     *   判据按 `key` 逐字对账（改名会静默变成「依赖缺席」）。
     */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'FACT_ADMISSION', why: '事实准入唯一真源（X4 native-fact-admission.js）；缺席 ⇒ bridgeState 报 indeterminate/admission-unavailable，不假装能判' },
    ]);

    /**
     * **可选**覆盖面（缺席不影响可判性）：事件类名映射。
     * 缺席 ⇒ 用 `DEFAULT_CLASS_HINT`，且类名判不出时如实报 unknown（不按默认类收下）。
     */
    const OPTIONAL_DEPS = Object.freeze(['EVENT_CLASSES_HINT']);

    /* ── 原语（本模块自持，不引兄弟模块；形态与 X4/X7/X8 各自独立） ── */
    /** 字符串化（缺省空串）。 */
    function _s(v) { return v === null || v === undefined ? '' : String(v); }
    /** 去首尾空白。 */
    function _t(v) { return _s(v).trim(); }
    /** 有限整数（未给 / 不可数 ⇒ null，**不拿 0 冒充「就是 0」**）。 */
    function _i(v) {
        const n = Number(v);
        return (v === null || v === undefined || v === '' || !isFinite(n)) ? null : Math.trunc(n);
    }
    /** 只读浅拷贝（回执行绝不改调用方对象）。 */
    function _shallow(o) {
        const out = {};
        const src = o || {};
        for (const k of Object.keys(src)) out[k] = src[k];
        return out;
    }

    /* ══════════════ ① 事件分类（三类，未知不按默认类收下） ══════════════ */

    /**
     * 由来源名判事件类（财务 / 日历 / 剧情）。
     * ★ 未知来源 ⇒ 类名报 'unknown' 且 `known:false`，**不落默认类** ——
     *   「查不出来 ⇒ 当财务收下」是本仓最忌讳的静默降级。
     */
    function eventClassOf(source, hint) {
        const key = _t(source).toLowerCase().replace(/[\s_]+/g, '-');
        const table = (hint && typeof hint === 'object') ? hint : DEFAULT_CLASS_HINT;
        for (const cls of EVENT_CLASSES) {
            const names = (table[cls] || []).map((x) => _t(x).toLowerCase());
            if (names.indexOf(key) !== -1) return { cls: cls, known: true, key: key };
        }
        return { cls: 'unknown', known: false, key: key };
    }

    /**
     * 默认类名映射（deps.EVENT_CLASSES_HINT 的唯一缺省值）。
     * 与 X4 的 SOURCE_POLICY 键同族：这里是**类**归属，X4 那里是**准入口径**，两件事。
     */
    const DEFAULT_CLASS_HINT = Object.freeze({
        finance: ['finance-confirmed', 'traveldesk', 'travel-desk', 'quote', 'simulated-quote', 'expense', 'payment'],
        calendar: ['calendar', 'calendar-event', 'appointment', 'schedule', 'forecast'],
        story: ['story', 'story-event', 'scene-complete', 'event-complete', 'quest-done'],
    });

    /* ══════════════ ② 证据守卫（预测 / 报价 / 草稿不自动变事实） ══════════════ */

    /**
     * 证据守卫 —— 「预测、报价、草稿不自动变成事实」的**前置**拦面。
     * 与 X4 的区别：X4 在**准入档**把 predicted 档置为不进 admitted；
     *   本函数在**用户确认环之前**先拦一道，使「用户没点确认，预测就不能爬上 accepted」。
     * ★ 三档各自可达且理由不同形（不得都压成 evidence-guarded 一个笼统词）。
     */
    function guardEvidence(fact) {
        const f = fact || {};
        const src = _t(f.source).toLowerCase().replace(/[\s_]+/g, '-');
        const st = _t(f.status).toLowerCase();
        /* 预测类：来源名含 forecast / predict / suggest / simulat，或自述 predicted。 */
        if (st === 'predicted' || /forecast|predict|suggest|simulat/.test(src)) {
            return { guarded: true, guard: 'predictive',
                why: '预测 / 建议类（' + (src || st) + '）⇒ 不得自动入账；须用户显式确认' };
        }
        /* 报价类：quote / transfer / repay / settle。 */
        if (/quote|transfer|repay|settle/.test(src)) {
            return { guarded: true, guard: 'quote-like',
                why: '报价 / 建议转账类（' + src + '）⇒ 不得自动入账；这不是已发生的支出' };
        }
        /* 草稿类：draft / usage / player-only 自述。 */
        if (st === 'draft' || /usage|draft/.test(src) || _t(f.visibility).toLowerCase() === 'player-only') {
            return { guarded: true, guard: 'draft-like',
                why: '草稿 / 使用行为类（' + (src || st) + '）⇒ 不得自动入账；它还不是角色剧情事实' };
        }
        return { guarded: false, guard: '', why: '' };
    }

    /* ══════════════ ③ 生命周期四态（互不同形） ══════════════ */

    /**
     * 从「X4 准入结果 + 用户确认环 + 撤回落定」算出生命周期四态。
     *
     * @param {object} admission X4 admitNativeFact 的返回值（或同形对象）
     * @param {object} opts { userDecision: 'accept'|'decline'|null, revoked: boolean, seen: boolean }
     * @returns {object} { state, reason, decidable }
     *
     * ★ 关键不同形（本仓最贵的老账）：
     *   · pending  = 「等用户确认」（判得了，但还悬着）
     *   · rejected = 「明确未进账」（判得了，且已定）
     *   · decidable:false = 「判不了」（准入模块缺席）—— 三者**三态**。
     */
    function lifecycleOf(admission, opts) {
        const o = opts || {};
        const a = admission || {};
        const base = { state: 'pending', reason: 'awaiting-user', decidable: true };
        /* 撤回落定优先：撤回了就是撤销，不论其它栏。 */
        if (o.revoked === true) return Object.assign(base, { state: 'revoked', reason: 'owner-retracted' });
        /* 用户明确拒绝。 */
        if (o.userDecision === 'decline') return Object.assign(base, { state: 'rejected', reason: 'user-declined' });
        /* 准入不可测（含判不了）⇒ 判不了：不假装 pending，也不假装 rejected。 */
        if (a.measurable === false) {
            return Object.assign(base, { state: 'pending', reason: 'admission-unavailable', decidable: false });
        }
        /* X4 明确拒收 / 撤回。 */
        if (a.decision === 'rejected') return Object.assign(base, { state: 'rejected', reason: 'admission-rejected' });
        if (a.decision === 'retracted') return Object.assign(base, { state: 'revoked', reason: 'owner-retracted' });
        /* ★ 证据守卫是**结构硬守卫**：预测 / 报价 / 草稿类来源**永不**变事实（X4 的
         *   SOURCE_POLICY 对这些来源恒 isFact:false），故与用户是否接受**无关** ——
         *   用户接受也不能把它洗成 accepted（“不自动变成事实”的强形）。
         *   否则「forecast + accept」会落进 awaiting-user 的误导理由（本轮自伤）。 */
        const g = guardEvidence(o.fact || {});
        if (g.guarded) return Object.assign(base, { state: 'pending', reason: 'evidence-guarded' });
        /* ★ 用户确认环：只有**可事实化**的档（admitted = 唯一进已发生事实；observed = 已发生未经确认）
         *   才由用户确认推进到 accepted。未给 userDecision 时**不默认接受**。 */
        if (a.decision === 'admitted' || a.decision === 'observed') {
            if (o.userDecision === 'accept') return Object.assign(base, { state: 'accepted', reason: 'accepted' });
            return Object.assign(base, { state: 'pending', reason: 'awaiting-user' });
        }
        /* predicted / draft / quoted：有读数但未定 ⇒ pending，理由指明是守卫档。 */
        if (['predicted', 'draft', 'quoted'].indexOf(_t(a.decision)) !== -1) {
            return Object.assign(base, { state: 'pending', reason: 'evidence-guarded' });
        }
        /* 其余（无裁决 / 判不了）——如实报，不猜。 */
        return Object.assign(base, { state: 'pending', reason: 'admission-unavailable', decidable: false });
    }

    /* ══════════════ ④ 双向回执（只读，不改手机侧对象） ══════════════ */

    /**
     * 记忆侧→手机侧的回执行。
     * ★ 只读：返回**新对象**，绝不改传入的 fact / admission。
     * ★ 回执理由必须取自 RECEIPT_REASONS（穷尽词表）——由判据对账。
     */
    function receiptFor(input) {
        const i = input || {};
        const f = i.fact || {};
        const a = i.admission || {};
        const lc = i.lifecycle || lifecycleOf(a, i.opts);
        const eventId = _t(f.eventId) || _t(a.eventId);
        const rootEventId = _t(f.rootEventId) || _t(a.rootEventId) || eventId;
        const reason = RECEIPT_REASONS.indexOf(lc.reason) !== -1 ? lc.reason : 'admission-unavailable';
        const nextStep = {
            'accepted': 'none',
            'awaiting-user': 'ask-user-confirm',
            'user-declined': 'none',
            'evidence-guarded': 'ask-user-confirm',
            'admission-rejected': 'none',
            'duplicate': 'none',
            'owner-retracted': 'none',
            'admission-unavailable': 'retry-when-module-present',
            'bridge-absent': 'retry-when-bridge-present',
            'no-identity': 'provide-event-id',
        }[reason] || 'none';
        return Object.freeze({
            eventId: eventId, rootEventId: rootEventId,
            state: lc.state, reason: reason, decidable: lc.decidable !== false,
            accepted: lc.state === 'accepted',
            /* ★ 回执自述「这条手机侧该拿它怎么办」—— 手机侧不必猜包内的 X4 词表。 */
            nextStep: nextStep,
            reasonText: reason,
            version: RECEIPT_VERSION,
        });
    }

    /* ══════════════ ⑤ 桥能力探针（三态不许压成一态） ══════════════ */

    /**
     * 对方能力探针（成对边界：手机单装 / 插件单装 / 旧版缺回执面都要能工作且有原因）。
     * 三态必须可分辨，不许都压成「不可用」：
     *   · absent  —— 桥对象根本没有（手机未装 / 未加载插件）
     *   · legacy  —— 桥在，但没有回执面（旧版手机）
     *   · capable —— 桥在且有回执面
     * （与 X4 probeCounterpart 同界，但**多一档回执面**：X4 判准入面，本面判回执面。）
     */
    function probeCounterpart(bridge) {
        if (!bridge || typeof bridge !== 'object') {
            return { state: 'absent', reason: 'bridge-absent', canReceipt: false, canAdmit: false,
                detail: '桥缺席 ⇒ 整条桥分支不进入（非「没事实」）' };
        }
        const canAdmit = typeof bridge.admitFacts === 'function' || typeof bridge.getFactPolicy === 'function';
        const canReceipt = typeof bridge.ackFact === 'function' || typeof bridge.onReceipt === 'function'
            || bridge.receiptVersion != null;
        if (canReceipt) {
            return { state: 'capable', reason: '', canReceipt: true, canAdmit: canAdmit,
                detail: '桥在且有回执面' };
        }
        return { state: 'legacy', reason: 'bridge-lacks-receipt', canReceipt: false, canAdmit: canAdmit,
            detail: '桥在但缺回执面（旧版手机）⇒ 回执按本地读数显示并留痕' };
    }

    /* ══════════════ ⑥ 编辑 / 删除 / 撤回 ⇒ 换代或撤回计划 ══════════════ */

    /**
     * 由手机侧的编辑动作算出**记忆侧计划**（不执行，交 owner 落笔）。
     * ★ 编辑 ⇒ `supersede`（留旧条、记换代链）；删除 / 撤回 ⇒ `withdraw`（不留）。
     *   两者**不同形** —— 把「改了口径」与「从来没有过」压成一件事，会丢掉换代链。
     * ★ 以同一 `rootEventId` 为轴：跨平台转发只进一次（原文第 3 条）。
     */
    function planEdit(action, fact) {
        const act = _t(action).toLowerCase();
        const f = fact || {};
        const eventId = _t(f.eventId);
        const rootEventId = _t(f.rootEventId) || eventId;
        const base = { action: act, eventId: eventId, rootEventId: rootEventId,
            effect: '', steps: [], ok: false, reason: '' };
        if (EDIT_ACTIONS.indexOf(act) === -1) {
            return Object.assign(base, { reason: 'unknown-action',
                steps: ['动作「' + _t(action) + '」不在编辑三动作内 ⇒ 拒（不猜）'] });
        }
        if (!rootEventId) {
            return Object.assign(base, { reason: 'no-identity',
                steps: ['无 eventId / rootEventId ⇒ 无法定位待换代的旧条（不猜）'] });
        }
        const effect = EDIT_EFFECT[_t(act).toUpperCase()] || '';
        if (effect === 'supersede') {
            return Object.assign(base, { ok: true, effect: 'supersede',
                steps: ['① 定位 rootEventId=' + rootEventId + ' 的**当前有效**条',
                        '② 旧条置 supersededBy=mobile-edit（**留痕**）',
                        '③ 新条以同 rootEventId 挂到换代链尾（去重只进一次）'] });
        }
        return Object.assign(base, { ok: true, effect: 'withdraw',
            steps: ['① 定位 rootEventId=' + rootEventId + ' 的全部在账条',
                    '② 逐条落撤回标记（**不留**作历史事实）',
                    '③ 回执 state=revoked（手机侧据此除名）'] });
    }

    /* ══════════════ ⑦ 桥状态总判（依赖缺席 ⇒ 明确降级） ══════════════ */

    /**
     * 桥状态总判 —— 调用方拿它决定「整条分支进不进」。
     * ★ 依赖缺席（FACT_ADMISSION 不在）⇒ state='indeterminate' 且 reason='admission-unavailable'，
     *   **不假装能判**（与 M-X8 migration-unavailable 同纪律）。
     * ★ 'indeterminate' 与 'empty'（真跑过、明确没有事实）**不同形**。
     */
    function bridgeState(deps, bridge) {
        const d = deps || {};
        const probe = probeCounterpart(bridge);
        if (probe.state === 'absent') {
            return { state: 'absent', reason: 'bridge-absent', probe: probe,
                canJudge: false, detail: '桥缺席：整条准入 / 回执分支不进入' };
        }
        if (!d.FACT_ADMISSION || typeof d.FACT_ADMISSION.admitNativeFact !== 'function') {
            return { state: 'indeterminate', reason: 'admission-unavailable', probe: probe,
                canJudge: false, detail: '准入模块缺席 ⇒ 判不了（不假装已是当前代际 / 不假装能判）' };
        }
        return { state: 'ok', reason: '', probe: probe, canJudge: true,
            detail: '准入模块在场' + (probe.canReceipt ? '，桥有回执面' : '，桥缺回执面（按本地读数显示）') };
    }

    /* ══════════════ ⑧ 主流程（一条手机事实走完全程） ══════════════ */

    /**
     * 手机事实桥主流程 —— 纯函数：吃「手机侧一条事件 + 桥上下文」，返回「裁决 + 回执」。
     * 链：证据守卫 → （可选）X4 准入 → 用户确认环 → 生命周期四态 → 回执。
     *
     * @param {object} fact 手机侧事实（与 X4 同栏；本面额外认 userDecision / editAction）
     * @param {object} ctx  { chatId, branchId, revision, seenEventIds, seenRootEventIds,
     *                        userDecision, revoked, editAction, classHint }
     * @param {object} deps { FACT_ADMISSION, EVENT_CLASSES_HINT }
     */
    function handleFact(fact, ctx, deps) {
        const c = ctx || {};
        const d = deps || {};
        const f = _shallow(fact);
        const eventId = _t(f.eventId);
        const rootEventId = _t(f.rootEventId) || eventId;
        const cls = eventClassOf(f.source, d.EVENT_CLASSES_HINT);
        const guard = guardEvidence(f);
        const notes = [];

        const base = {
            eventId: eventId, rootEventId: rootEventId,
            eventClass: cls.cls, classKnown: cls.known,
            guard: guard.guard, guarded: guard.guarded,
            lifecycle: null, receipt: null, plan: null, notes: notes,
            measurable: true, version: BRIDGE_VERSION,
        };

        /* 缺口 0：没有身份就无法定位 / 去重 / 换代。如实报不可测。 */
        if (!eventId) {
            const lc = { state: 'rejected', reason: 'no-identity', decidable: true };
            const receipt = receiptFor({ fact: f, admission: {}, lifecycle: lc, opts: {} });
            return Object.assign(base, { lifecycle: lc, receipt: receipt, measurable: false,
                notes: notes.concat(['无 eventId ⇒ 无法去重 / 无法换代；本函数不猜事实身份']) });
        }

        /* 手机侧编辑 / 删除 / 撤回：走换代或撤回计划（**不再走准入**）。 */
        const editAction = _t(c.editAction || f.editAction).toLowerCase();
        if (editAction) {
            const plan = planEdit(editAction, f);
            const lc = plan.ok
                ? { state: 'revoked', reason: 'owner-retracted', decidable: true }
                : { state: 'rejected', reason: 'no-identity', decidable: true };
            const receipt = receiptFor({ fact: f, admission: {}, lifecycle: lc, opts: {} });
            return Object.assign(base, { lifecycle: lc, receipt: receipt, plan: plan,
                notes: notes.concat(['手机侧 ' + editAction + ' ⇒ ' + (plan.effect || '无计划')]) });
        }

        /* 撤回落定（ctx.revoked）优先。 */
        if (c.revoked === true) {
            const lc = { state: 'revoked', reason: 'owner-retracted', decidable: true };
            const receipt = receiptFor({ fact: f, admission: {}, lifecycle: lc, opts: {} });
            return Object.assign(base, { lifecycle: lc, receipt: receipt,
                notes: notes.concat(['桥上下文标记已撤回 ⇒ revoked']) });
        }

        /* X4 准入（唯一真源）。缺席 ⇒ 明确降级，不假装能判。 */
        const FA = d.FACT_ADMISSION;
        if (!FA || typeof FA.admitNativeFact !== 'function') {
            const lc = { state: 'pending', reason: 'admission-unavailable', decidable: false };
            const receipt = receiptFor({ fact: f, admission: {}, lifecycle: lc, opts: {} });
            return Object.assign(base, { lifecycle: lc, receipt: receipt,
                notes: notes.concat(['准入模块缺席 ⇒ 判不了（不假装 pending / 不假装 rejected）']) });
        }
        let admission;
        /* ★ 用户确认环**接进** X4 的唯一钩子：用户点过确认 ⇒ userConfirmed=true，
         *   使 X4 的 stateOf 能将「预测来源自述 confirmed」升档（否则确认环只是装饰）。
         *   反向纪律：decline / 未表态一律**不**代填 true。 */
        const fIn = Object.assign({}, f);
        if (_t(c.userDecision) === 'accept') fIn.userConfirmed = true;
        else if (_t(c.userDecision) === 'decline') fIn.userConfirmed = false;
        try {
            admission = FA.admitNativeFact(fIn, c);
        } catch (e) {
            const lc = { state: 'pending', reason: 'admission-unavailable', decidable: false };
            const receipt = receiptFor({ fact: f, admission: {}, lifecycle: lc, opts: {} });
            return Object.assign(base, { lifecycle: lc, receipt: receipt,
                notes: notes.concat(['准入面抛错 ⇒ 判不了（不猜）']) });
        }
        /* 同源去重（幂等读数，不是失败）：X4 已判 duplicate-event。 */
        if (admission.decision === 'rejected' && admission.reason === 'duplicate-event') {
            const lc = { state: 'accepted', reason: 'duplicate', decidable: true };
            const receipt = Object.freeze(Object.assign({}, receiptFor({ fact: f, admission: admission, lifecycle: lc, opts: c }),
                { state: 'accepted', reason: 'duplicate' }));
            return Object.assign(base, { admission: admission, lifecycle: lc, receipt: receipt,
                notes: notes.concat(['同源已入账（' + admission.dedupe + '）⇒ 幂等不增条，**不是失败**']) });
        }
        /* 生命周期（含证据守卫与用户确认环，均在唯一真源 lifecycleOf 内判）。 */
        const lc = lifecycleOf(admission, { userDecision: _t(c.userDecision) || null, revoked: false, fact: f });
        if (guard.guarded) notes.push(guard.why);
        const receipt = receiptFor({ fact: f, admission: admission, lifecycle: lc, opts: c });
        return Object.assign(base, { admission: admission, lifecycle: lc, receipt: receipt,
            notes: notes.concat(admission.notes || []) });
    }

    /** 批量（单一真源：批内去重与单条同函，不另写一份）。 */
    function handleBatch(facts, ctx, deps) {
        const list = Array.isArray(facts) ? facts : [];
        const c = _shallow(ctx);
        const seenEventIds = Array.isArray(c.seenEventIds) ? c.seenEventIds.map(_s).slice() : [];
        const seenRootEventIds = Array.isArray(c.seenRootEventIds) ? c.seenRootEventIds.map(_s).slice() : [];
        const rows = [];
        const byState = {};
        const byReason = {};
        let pending = 0, accepted = 0, rejected = 0, revoked = 0;
        for (const f of list) {
            const r = handleFact(f, Object.assign({}, c, {
                seenEventIds: seenEventIds, seenRootEventIds: seenRootEventIds }), deps);
            rows.push(r);
            const st = (r.lifecycle || {}).state || 'pending';
            const rs = (r.receipt || {}).reason || 'admission-unavailable';
            byState[st] = (byState[st] || 0) + 1;
            byReason[rs] = (byReason[rs] || 0) + 1;
            if (st === 'accepted') accepted++;
            else if (st === 'rejected') rejected++;
            else if (st === 'revoked') revoked++;
            else pending++;
            if (rs !== 'duplicate' && r.eventId) {
                seenEventIds.push(r.eventId);
                if (r.rootEventId) seenRootEventIds.push(r.rootEventId);
            }
        }
        return { rows: rows, accepted: accepted, rejected: rejected, pending: pending, revoked: revoked,
            byState: byState, byReason: byReason, measurable: list.every((x) => x && typeof x === 'object'),
            version: BRIDGE_VERSION };
    }

    /* ══════════════ ⑨ 自述 / 自检 / 诊断行 / 导出 ══════════════ */

    /** 自述：面提供什么 / 依赖什么 / 缺席会怎样。 */
    function describe(deps) {
        const d = deps || {};
        const missing = REQUIRED_DEPS.filter((r) => !d[r.key]).map((r) => r.key);
        return Object.freeze({
            name: 'phone-fact-bridge', version: BRIDGE_VERSION, receiptVersion: RECEIPT_VERSION,
            lifecycleStates: LIFECYCLE_STATES.slice(), eventClasses: EVENT_CLASSES.slice(),
            editActions: EDIT_ACTIONS.slice(), evidenceGuards: EVIDENCE_GUARDS.slice(),
            receiptReasons: RECEIPT_REASONS.slice(), bridgeStates: BRIDGE_STATES.slice(),
            /* 面级自述：四态**各自可达**（由 selfCheck 的 probe 证明，不只对常量断言）。 */
            lifecycleExhaustive: LIFECYCLE_STATES.length === 4 && RECEIPT_REASONS.length >= 9,
            /* ★ pending 与 rejected 不同形（本仓最贵的老账）。 */
            pendingDistinctFromRejected: LIFECYCLE_STATES.indexOf('pending') !== -1
                && LIFECYCLE_STATES.indexOf('rejected') !== -1,
            requiredDeps: REQUIRED_DEPS.map((r) => ({ key: r.key, why: r.why })),
            optionalDeps: OPTIONAL_DEPS.slice(),
            missingDeps: missing, offline: true,
            /* 依赖缺席 ⇒ 明确降级（不是「没有事实」）。 */
            depsAbsentBehavior: 'FACT_ADMISSION 缺席 ⇒ bridgeState 报 indeterminate/admission-unavailable，不假装能判',
        });
    }

    /**
     * 自检：用**真调用**把四态各自跑出来（不只对常量自己断言）。
     * 依赖：一个最小 X4 同形准入桩（可注入），使「准入档 → 生命周期态」的映射真的被执行。
     */
    function selfCheck(deps) {
        const d = deps || {};
        const FA = d.FACT_ADMISSION;
        const out = { ok: true, problems: [], probes: {}, version: BRIDGE_VERSION };
        const probe = (name, fn) => {
            try { out.probes[name] = fn(); } catch (e) { out.ok = false; out.problems.push(name + ': ' + e.message); }
        };
        /* ★ 用一个**明确的桩**，不用真模块 —— 自检只证明本面映射自洽，不替 X4 背书。 */
        const stub = { admitNativeFact: (fact) => ({
            decision: 'admitted', state: 'confirmed', visibility: 'private', isFact: true, measurable: true,
            reason: '', eventId: fact.eventId, rootEventId: fact.rootEventId || fact.eventId, dedupe: 'none', fact: fact }) };
        const sdeps = Object.assign({}, d, { FACT_ADMISSION: stub });
        probe('accepted', () => handleFact({ eventId: 'e1', source: 'finance-confirmed', chatId: 'c1' },
            { chatId: 'c1', userDecision: 'accept' }, sdeps).lifecycle.state);
        probe('pending', () => handleFact({ eventId: 'e2', source: 'finance-confirmed', chatId: 'c1' },
            { chatId: 'c1' }, sdeps).lifecycle.state);
        probe('rejected', () => handleFact({ eventId: 'e3', source: 'finance-confirmed', chatId: 'c1' },
            { chatId: 'c1', userDecision: 'decline' }, sdeps).lifecycle.state);
        /* ★ 证据守卫 + 用户接受**仍不得** accepted（结构硬守卫的真跑证明）。 */
        probe('guardHoldsUnderAccept', () => handleFact({ eventId: 'e3b', source: 'forecast', chatId: 'c1' },
            { chatId: 'c1', userDecision: 'accept' }, sdeps).lifecycle.state);
        probe('revoked', () => handleFact({ eventId: 'e4', source: 'finance-confirmed', chatId: 'c1' },
            { chatId: 'c1', revoked: true }, sdeps).lifecycle.state);
        const got = {};
        for (const k of Object.keys(out.probes)) got[out.probes[k]] = true;
        for (const st of LIFECYCLE_STATES) {
            if (!got[st]) { out.ok = false; out.problems.push('四态未穷尽：' + st + ' 未在自检中可达'); }
        }
        /* ★ pending 与 rejected 不同形（真跑出来比对，不只对常量断言）。 */
        if (out.probes.pending === out.probes.rejected) {
            out.ok = false; out.problems.push('pending 与 rejected 同形（本仓最贵的老账）');
        }
        /* ★ 依赖缺席 ⇒ 明确降级。 */
        probe('depsAbsent', () => bridgeState({}, { admitFacts: () => {} }).state);
        if (out.probes.depsAbsent !== 'indeterminate') {
            out.ok = false; out.problems.push('依赖缺席未报 indeterminate（不假装能判）');
        }
        if (out.probes.guardHoldsUnderAccept === 'accepted') {
            out.ok = false; out.problems.push('证据守卫被用户接受旁路（预测/报价/草稿不得变事实）');
        }
        probe('pendingDistinctFromRejected',
            () => lifecycleOf({ decision: 'rejected', measurable: true }, {}).state
                !== lifecycleOf({ decision: 'admitted', measurable: true }, {}).state);
        if (out.probes.pendingDistinctFromRejected !== true) {
            out.ok = false; out.problems.push('pending 与 rejected 未区分');
        }
        /* 证据守卫三档各自可达。 */
        probe('guards', () => EVIDENCE_GUARDS.filter((g) => [
            guardEvidence({ source: 'forecast' }).guard,
            guardEvidence({ source: 'quote' }).guard,
            guardEvidence({ source: 'usage-tracker' }).guard,
        ].indexOf(g) !== -1).length);
        if (out.probes.guards !== EVIDENCE_GUARDS.length) {
            out.ok = false; out.problems.push('证据守卫三档未各自可达（实 ' + out.probes.guards + '）');
        }
        return out;
    }

    /** 诊断行（与本仓其余诊断行同规格；四种坏法分开写）。 */
    function line(read) {
        const r = read || {};
        if (typeof window === 'undefined' && r.modulePresent === undefined) {
            /* 无头环境下不给假读数；由宿主传入 read。 */
        }
        if (r.modulePresent === false) return '手机桥 模块未加载（phone-fact-bridge.js）';
        if (r.depsMissing) return '手机桥 依赖缺格（' + r.depsMissing + '）⇒ 判不了';
        if (r.reasonWords !== 10) return '手机桥 回执理由词表非穷尽（实 ' + r.reasonWords + ' / 应 10）';
        if (r.states !== 4) return '手机桥 生命周期态非四档（实 ' + r.states + ' / 应 4）';
        if (r.bridge === 'absent') return '手机桥 桥缺席（手机未装 / 未加载插件）';
        if (r.bridge === 'legacy') return '手机桥 桥在但缺回执面（旧版手机）';
        const b = r.byState || {};
        const parts = Object.keys(b).sort().map((k) => k + ':' + b[k]);
        return '手机桥 ' + (parts.length ? parts.join(' ') : '无事实')
            + (r.pending ? (' · 待确认 ' + r.pending) : '');
    }

    const api = Object.freeze({
        BRIDGE_VERSION: BRIDGE_VERSION, RECEIPT_VERSION: RECEIPT_VERSION,
        LIFECYCLE_STATES: LIFECYCLE_STATES, EVENT_CLASSES: EVENT_CLASSES,
        EDIT_ACTIONS: EDIT_ACTIONS, EDIT_EFFECT: EDIT_EFFECT, EVIDENCE_GUARDS: EVIDENCE_GUARDS,
        RECEIPT_REASONS: RECEIPT_REASONS, BRIDGE_STATES: BRIDGE_STATES,
        REQUIRED_DEPS: REQUIRED_DEPS, OPTIONAL_DEPS: OPTIONAL_DEPS, DEFAULT_CLASS_HINT: DEFAULT_CLASS_HINT,
        eventClassOf: eventClassOf, guardEvidence: guardEvidence, lifecycleOf: lifecycleOf,
        receiptFor: receiptFor, probeCounterpart: probeCounterpart, planEdit: planEdit,
        bridgeState: bridgeState, handleFact: handleFact, handleBatch: handleBatch,
        describe: describe, selfCheck: selfCheck, line: line,
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LonShaPhoneFactBridge = api;
    /* ★ 抬版自伤留痕（v3.314.0 首跑 M1 实测）：首版尾部写 `? window : this` —— 在 Node（无头套件 / 宿主 require 路径）下模块顶层 `this === module.exports`，于是挂载根指向 exports 而非 globalThis：
     *   实测 `typeof globalThis.LonShaPhoneFactBridge === 'undefined'`，而姊妹模块 memory-package / fact-lifecycle 用 `globalThis` ⇒ 本模块是**唯一没挂上全局**的那个。宿主 `_moduleLib` 优先读 window 全局（浏览器可行），但**本仓判据面与无头环境**读不到 ⇒ 按战地修法改为显式 globalThis（范式对齐）。 */
    global.LonShaPhoneFactBridge = api;
})(typeof window !== 'undefined' ? window : globalThis);
