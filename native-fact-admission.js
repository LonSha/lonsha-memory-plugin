/* ================================================================
 * native-fact-admission.js — [v3.290.0 · X4] 手机事实受控准入（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   X4 原文（.agents/notes/proposed/feature/2026-10-04-expansion-plan.md）：
 *     手机所有 App 事实并不是可靠引擎事实。usage-tracker 是玩家使用行为，
 *     不应默认转成角色剧情记忆；traveldesk 是分摊费用，不是旅行行程。
 *   而本仓现状：index.js 消费手机侧只有三条通路，三条都没有准入契约——
 *     · 回填（bridge.backfill(payload)）：整个 extracted 展平后直接交给下游，
 *       没有这条事实属于哪个会话 / 哪一代 / 什么状态 / 谁可见的任何一栏；
 *     · 召回（bridge.recall(query, n)）：拿到 {content, score, layer, floor}
 *       并直接拼成注入文本（index.js 6579 行 [手机记忆·…]），
 *       这条是不是预测 / 是不是报价 / 是不是另一个会话的无从判；
 *     · 楼层生命周期（onFloorCommitted / onFloorRollback）：只带一个楼层号。
 *   后果（三处结构性缺口，不是少读几个字段）：
 *     ① 状态塌成一态：明确发生的日历事件与模型顺手排的未来日程同形；
 *        用户确认入账的支出与模拟报价 / 建议转账同形 ⇒ 预测会变成已发生事实。
 *     ② 身份不带：跨会话、跨代事实混进当前注入，旧代在飞写入无门可拒。
 *     ③ 可见性不带：手机侧 App 事实没有 public/private/player-only 一栏，
 *        角色回复与玩家作者面吃的是同一堆东西。
 *
 * 【本模块补的三件事（纯函数，不写任何账）】
 *   ① 准入契约：admitNativeFact(fact, ctx) 按 chatId / branchId / eventId / revision /
 *      sourceFloor / storyTime / status / visibility 八栏判定，输出五档裁决：
 *      admitted（仅 confirmed）/ observed / draft / quoted / predicted / rejected。
 *   ② 五态来源 + 拒绝归因：拒绝了必须能归因到 session-mismatch（错会话）/
 *      stale-generation（旧代）/ duplicate-event（同事件重试）/
 *      unknown-source（查不出来 ≠ 按已发生处理）。
 *   ③ 同源去重（rootEventId）：跨平台转发保留 rootEventId，只进一次；
 *      编辑 / 撤回 / 删楼走同一门（retracted）。
 *
 * 【本模块不做（边界，逐条对齐原文）】
 *   · 不旁路写 graph 私有字段：准入结果以返回值交付，由调用方经既有 owner 落笔。
 *   · 不把 usage-tracker 的玩家使用行为当角色剧情记忆（判 player-only + 非剧情事实）。
 *   · 不把 traveldesk 的费用账当行程（判 predicted 结算建议，除非 userConfirmed）。
 *   · 不新增网络 / 不新增持久化：手机单装、插件单装、旧版缺能力都必须可工作并有原因。
 *
 * 挂 window.LonShaNativeFactAdmission，双导出（对齐 memory-books / pristine-fetch 约定）。
 */
(function (global) {
    'use strict';

    /** 契约版本（面本身的版本）。 */
    const CONTRACT_VERSION = 1;
    /** 准入裁决口径版本。改判定规则必须抬这个号（判据据此防静默改口径）。 */
    const ADMIT_VERSION = 1;

    /** 五态来源（原文点名：observed / confirmed / predicted / draft / quoted）。 */
    const FACT_STATES = ['observed', 'confirmed', 'predicted', 'draft', 'quoted'];

    /** 拒绝归因（原文点名：错会话 / 旧代 / 重复 / 未知来源）。 */
    const REJECT_REASONS = ['session-mismatch', 'stale-generation', 'duplicate-event', 'missing-status', 'unknown-source'];

    /** 三档可见性。player-only 是作者面，不得进角色可用的生成面。 */
    const VISIBILITIES = ['public', 'private', 'player-only'];

    /* ----------------------------------------------------------------
     * 来源台账：哪个 App 的事实按什么默认口径准入。
     *
     * 为什么是一张表而不是散在判定函数里的 if：
     *   本仓「清单式回收反复漏项」的形态已反复出现（CHANGELOG v3.173 / v3.209 留痕）。
     *   把「来源 ⇒ 默认状态 / 默认可见性」收成一行一处，加来源 = 加一行；
     *   「加没加」因此变成可机检事实（判据遍历本表断言每行都有确定裁决）。
     * ---------------------------------------------------------------- */
    const SOURCE_POLICY = {
        /* 明确完成的日历 / 约定事件 —— 已发生，但未经用户确认前只算 observed。 */
        'calendar': { state: 'observed', visibility: 'private', isFact: true },
        'calendar-event': { state: 'observed', visibility: 'private', isFact: true },
        'appointment': { state: 'observed', visibility: 'private', isFact: true },
        /* 用户确认入账的财务事件 —— 唯一默认可进 admitted 的来源。 */
        'finance-confirmed': { state: 'confirmed', visibility: 'private', isFact: true },
        /* traveldesk 是分摊费用，不是旅行行程：默认按结算建议（predicted）。 */
        'traveldesk': { state: 'predicted', visibility: 'private', isFact: false },
        'travel-desk': { state: 'predicted', visibility: 'private', isFact: false },
        /* 报价 / 建议转账 —— 永不进已发生事实。 */
        'quote': { state: 'predicted', visibility: 'private', isFact: false },
        'simulated-quote': { state: 'predicted', visibility: 'private', isFact: false },
        /* 未来预测 / 日程草案。 */
        'forecast': { state: 'predicted', visibility: 'private', isFact: false },
        /* usage-tracker 等玩家使用行为：不是角色剧情记忆。 */
        'usage': { state: 'draft', visibility: 'player-only', isFact: false },
        'app-usage': { state: 'draft', visibility: 'player-only', isFact: false },
        'usage-tracker': { state: 'draft', visibility: 'player-only', isFact: false },
        /* 转述 / 转发 —— 与源同根，不当独立证据。 */
        'forward': { state: 'quoted', visibility: 'public', isFact: false },
        'repost': { state: 'quoted', visibility: 'public', isFact: false },
        /* 健康状态（原文列为后续可选）—— 默认 draft：未确认不进账。 */
        'health': { state: 'draft', visibility: 'private', isFact: false },
    };

    /** 规范化来源名（大小写 / 空格 / 下划线容错，拼错不得静默落到默认档）。 */
    function normalizeSource(src) {
        return String(src == null ? '' : src).trim().toLowerCase().replace(/[\s_]+/g, '-');
    }

    /**
     * 取来源默认口径。
     * 未知来源不是「按已发生处理」，而是 unknown-source 拒收。
     * 本仓最忌讳的静默降级形态就是「查不出来 ⇒ 当通过」，这里必须反向。
     */
    function policyOf(src) {
        const key = normalizeSource(src);
        if (!key) return { known: false, key: '', reason: 'unknown-source' };
        const hit = SOURCE_POLICY[key];
        if (!hit) return { known: false, key, reason: 'unknown-source' };
        return { known: true, key, state: hit.state, visibility: hit.visibility, isFact: hit.isFact };
    }

    /** 判定某来源的建议可见性（供召回侧消费：player-only 不进角色面）。 */
    function visibilityOf(src) {
        const p = policyOf(src);
        return p.known ? p.visibility : 'player-only';
    }

    /**
     * 判定事实状态：调用方自述优先于来源默认，但不允许自述越权。
     *
     * 三条越权防线（否则「预测写成 confirmed」就能洗成已发生事实）：
     *   ① predicted 来源（报价 / 建议转账 / 分摊）自述 confirmed 不升档，
     *      除非带 userConfirmed:true（用户真点过确认）。
     *   ② 未知来源不因自述而变已知：仍走 unknown-source 拒收。
     *   ③ 自述不在 FACT_STATES 内（拼错如 confirm）⇒ 不识别，回落来源默认，
     *      并在 notes 里留痕（拼错不得静默变成「已确认」）。
     */
    function stateOf(fact, policy) {
        const notes = [];
        const raw = fact && fact.status != null ? String(fact.status).trim().toLowerCase() : '';
        if (!raw) return { state: policy.state, from: 'source-default', downgraded: false, notes };
        if (FACT_STATES.indexOf(raw) === -1) {
            notes.push('状态自述「' + raw + '」不在五态内 ⇒ 不识别，回落来源默认');
            return { state: policy.state, from: 'source-default(unrecognized)', downgraded: false, notes };
        }
        if (raw === 'confirmed' && policy.state === 'predicted') {
            const userOk = fact && fact.userConfirmed === true;
            if (!userOk) {
                notes.push('预测/报价来源自述 confirmed 但无 userConfirmed ⇒ 不升档（预测不得变成已发生）');
                return { state: 'predicted', from: 'user-confirm-required', downgraded: true, notes };
            }
        }
        return { state: raw, from: 'self-declared', downgraded: false, notes };
    }

    /**
     * 手机事实受控准入 —— 主函数（纯函数，无副作用）。
     *
     * @param {object} fact 手机侧事实。认得的栏：
     *        eventId, rootEventId, source, status, visibility, chatId, branchId, revision,
     *        sourceFloor, storyTime, kind, text, userConfirmed, editOf, retracted
     * @param {object} ctx  当前引擎身份：
     *        chatId, branchId, revision, seenEventIds, seenRootEventIds
     */
    function admitNativeFact(fact, ctx) {
        const c = ctx || {};
        const f = fact || {};
        const notes = [];
        const identity = {
            chatId: f.chatId != null ? String(f.chatId) : null,
            branchId: f.branchId != null ? String(f.branchId) : null,
            revision: Number.isFinite(Number(f.revision)) ? Number(f.revision) : null,
            sourceFloor: Number.isFinite(Number(f.sourceFloor)) ? Number(f.sourceFloor) : null,
            storyTime: f.storyTime != null && String(f.storyTime) ? String(f.storyTime) : null,
        };
        const eventId = f.eventId != null ? String(f.eventId) : '';
        const rootEventId = f.rootEventId != null && String(f.rootEventId) ? String(f.rootEventId) : eventId;
        const base = {
            decision: 'rejected', reason: '', state: '', visibility: 'player-only', isFact: false,
            eventId: eventId, rootEventId: rootEventId, dedupe: 'none', notes: notes,
            version: ADMIT_VERSION, identity: identity, measurable: true, replayOf: null
        };

        /* 缺口 0：没有 eventId 就没有身份，谈不上准入。不可测如实报，不拿 0 冒充。 */
        if (!eventId) {
            return Object.assign(base, {
                reason: 'missing-identity', measurable: false,
                notes: notes.concat(['无 eventId ⇒ 无法去重、无法撤换代；本函数不猜事实身份'])
            });
        }

        /* 撤回：编辑/撤回/删楼走同一门（owner 侧据此撤销/换代）。 */
        if (f.retracted === true) {
            return Object.assign(base, { decision: 'retracted', reason: 'owner-retracted', notes: notes });
        }

        /* 来源口径。未知来源拒收（不是按已发生处理）。 */
        const policy = policyOf(f.source);
        if (!policy.known) {
            return Object.assign(base, {
                reason: 'unknown-source',
                notes: notes.concat(['来源「' + String(f.source == null ? '(空)' : f.source)
                    + '」无准入口径 ⇒ 拒收（查不出来 ≠ 按已发生处理）'])
            });
        }
        const st = stateOf(f, policy);
        notes.push.apply(notes, st.notes);
        const state = st.state;
        const visRaw = String(f.visibility || '').toLowerCase();
        const visibility = VISIBILITIES.indexOf(visRaw) !== -1 ? visRaw : policy.visibility;
        if (visRaw && visRaw !== policy.visibility) {
            notes.push('可见性自述「' + visRaw + '」与来源默认「' + policy.visibility + '」不同 ⇒ 取自述（显式优先）');
        }
        const out = Object.assign(base, {
            state: state, visibility: visibility,
            isFact: policy.isFact && (state === 'observed' || state === 'confirmed')
        });

        /* ① 错会话拒绝（含分支不符：分支是会话身份的一部分）。 */
        const wantChat = c.chatId != null ? String(c.chatId) : '';
        if (wantChat && identity.chatId && identity.chatId !== wantChat) {
            return Object.assign(out, { reason: 'session-mismatch',
                notes: notes.concat(['事实属会话 ' + identity.chatId + '，当前 ' + wantChat]) });
        }
        if (!identity.chatId) {
            notes.push('事实未带 chatId ⇒ 无法判会话归属（按当前会话收下，但已留痕）');
        }
        const wantBranch = c.branchId != null ? String(c.branchId) : '';
        if (wantBranch && identity.branchId && identity.branchId !== wantBranch) {
            return Object.assign(out, { reason: 'session-mismatch',
                notes: notes.concat(['分支不符：' + identity.branchId + ' ≠ ' + wantBranch]) });
        }

        /* ② 旧代拒绝：事实修订号落后于当前 ⇒ 旧异步写入被拒（X4 验收点名）。 */
        const curRev = Number.isFinite(Number(c.revision)) ? Number(c.revision) : null;
        if (curRev !== null && identity.revision !== null && identity.revision < curRev) {
            return Object.assign(out, {
                reason: 'stale-generation',
                notes: notes.concat(['旧代：事实 rev ' + identity.revision + ' < 当前 ' + curRev
                    + ' ⇒ 拒绝（旧异步写入无门可进）'])
            });
        }
        if (curRev !== null && identity.revision === null) {
            notes.push('事实未带 revision ⇒ 无法判代际（已留痕，不当「同代」）');
        }

        /* ③ 同源去重：先按 eventId，再按 rootEventId（跨平台转发只进一次）。 */
        const seenIds = Array.isArray(c.seenEventIds) ? c.seenEventIds.map(String) : [];
        const seenRoots = Array.isArray(c.seenRootEventIds) ? c.seenRootEventIds.map(String) : [];
        if (seenIds.indexOf(eventId) !== -1) {
            return Object.assign(out, {
                reason: 'duplicate-event', dedupe: 'event-id',
                notes: notes.concat(['eventId 已入账 ⇒ 同事件重试不增条'])
            });
        }
        if (rootEventId && seenRoots.indexOf(rootEventId) !== -1) {
            return Object.assign(out, {
                reason: 'duplicate-event', dedupe: 'root-event-id', replayOf: rootEventId,
                notes: notes.concat(['同源已有记录（rootEventId ' + rootEventId + '）⇒ 转述/转发不增独立证据'])
            });
        }
        if (rootEventId && rootEventId !== eventId) out.dedupe = 'root-event-id';

        /* ④ 按状态出裁决。isFact 是「可当已发生事实用」的唯一开关。 */
        let decision;
        if (state === 'confirmed' && out.isFact) decision = 'admitted';
        else if (state === 'observed' && out.isFact) decision = 'observed';
        else if (state === 'predicted') decision = 'predicted';
        else if (state === 'quoted') decision = 'quoted';
        else decision = 'draft';
        out.decision = decision;
        out.reason = decision === 'admitted' ? '' : ('state-' + state);
        return out;
    }

    /** 批量准入 + 同源归并（单一真源：批内去重与单条判定用同一函数，不另写一份）。 */
    function admitBatch(facts, ctx) {
        const list = Array.isArray(facts) ? facts : [];
        const c = ctx || {};
        const seenEventIds = Array.isArray(c.seenEventIds) ? c.seenEventIds.map(String).slice() : [];
        const seenRootEventIds = Array.isArray(c.seenRootEventIds) ? c.seenRootEventIds.map(String).slice() : [];
        const rows = [];
        const byReason = {};
        const byDecision = {};
        let accepted = 0;
        let rejected = 0;
        let merged = 0;
        for (const f of list) {
            const r = admitNativeFact(f, Object.assign({}, c, { seenEventIds: seenEventIds, seenRootEventIds: seenRootEventIds }));
            rows.push(r);
            byDecision[r.decision] = (byDecision[r.decision] || 0) + 1;
            if (r.decision === 'rejected') {
                rejected++;
                byReason[r.reason] = (byReason[r.reason] || 0) + 1;
            } else {
                accepted++;
                /* 归并只登记一次：批内重复的来源不再作为独立证据。 */
                if (r.dedupe === 'root-event-id') merged++;
                if (r.eventId) seenEventIds.push(r.eventId);
                if (r.rootEventId) seenRootEventIds.push(r.rootEventId);
            }
        }
        return {
            rows: rows, accepted: accepted, rejected: rejected,
            byReason: byReason, byDecision: byDecision, merged: merged,
            measurable: list.every((r) => r && typeof r === 'object'),
            version: ADMIT_VERSION
        };
    }

    /**
     * 召回侧可见性过滤 —— 手机召回结果进注入块前的唯一门。
     *
     * 为什么必须有：index.js 6579 行把召回结果直接拼成 [手机记忆·…] 注入，
     * 而 usage-tracker（玩家使用行为）与角色剧情记忆在那里同形。
     * 本函数按来源建议可见性把 player-only 挡在角色面之外，并分列两栏计数——
     * 「挡掉几条」与「放行几条」都可见，不是静默丢弃。
     */
    function filterRecallForCharacter(hits) {
        const list = Array.isArray(hits) ? hits : [];
        const kept = [];
        const dropped = [];
        for (const h of list) {
            const src = h && (h.app || h.source || h.layer);
            const vis = visibilityOf(src);
            const row = { hit: h, source: normalizeSource(src), visibility: vis };
            if (vis === 'player-only') dropped.push(row); else kept.push(row);
        }
        return {
            kept: kept.map((r) => r.hit),
            dropped: dropped.map((r) => r.hit),
            keptCount: kept.length, droppedCount: dropped.length,
            /* 「一条都没有」与「有但全被挡掉」不同形（本仓反复踩过的塌态）。 */
            empty: list.length === 0, allBlocked: list.length > 0 && kept.length === 0,
            reason: list.length === 0 ? 'no-hits' : (kept.length === 0 ? 'all-player-only' : ''),
            measurable: true, version: ADMIT_VERSION
        };
    }

    /**
     * 对方能力探针（成对边界：手机单装 / 插件单装 / 旧版缺能力都要能工作且有原因）。
     *
     * 三态必须可分辨，不许都压成「不可用」：
     *   · absent  —— 桥对象根本没有（手机未装 / 未加载插件）
     *   · legacy  —— 桥在，但没有准入面（旧版手机）
     *   · capable —— 桥在且有准入面
     */
    function probeCounterpart(bridge) {
        if (!bridge || typeof bridge !== 'object') {
            return { state: 'absent', reason: 'bridge-absent', canAdmit: false,
                detail: '桥缺席 ⇒ 整条准入分支不进入（非「没事实」）' };
        }
        if (typeof bridge.admitFacts === 'function' || typeof bridge.getFactPolicy === 'function') {
            return { state: 'capable', reason: '', canAdmit: true, detail: '桥在且有准入面' };
        }
        return { state: 'legacy', reason: 'bridge-lacks-admission', canAdmit: false,
            detail: '桥在但缺准入面 ⇒ 按旧路径（无准入栏）收下并留痕' };
    }

    /** 诊断行：准入体检面（三态与本仓其余诊断行同规格）。 */
    function admissionLine(report) {
        const r = report || {};
        if (r.measurable !== true && r.measurable !== false) return '准入 —（未跑）';
        if (r.probe && r.probe.state === 'absent') return '准入 桥缺席（手机未装 / 未加载插件）';
        if (r.probe && r.probe.state === 'legacy') {
            return '准入 桥在但缺准入面（旧版手机）⇒ 无准入栏';
        }
        const b = r.byDecision || {};
        const parts = Object.keys(b).sort().map((k) => k + ':' + b[k]);
        const reasons = r.byReason && Object.keys(r.byReason).length
            ? ' · 拒绝 ' + Object.keys(r.byReason).sort().map((k) => k + ':' + r.byReason[k]).join(' ')
            : '';
        return '准入 ' + (parts.length ? parts.join(' ') : '无事实')
            + (r.merged ? (' · 同源归并 ' + r.merged) : '') + reasons;
    }

    const api = {
        CONTRACT_VERSION: CONTRACT_VERSION, ADMIT_VERSION: ADMIT_VERSION,
        FACT_STATES: FACT_STATES, REJECT_REASONS: REJECT_REASONS, VISIBILITIES: VISIBILITIES,
        SOURCE_POLICY: SOURCE_POLICY,
        normalizeSource: normalizeSource, policyOf: policyOf, visibilityOf: visibilityOf,
        stateOf: stateOf, admitNativeFact: admitNativeFact, admitBatch: admitBatch,
        filterRecallForCharacter: filterRecallForCharacter, probeCounterpart: probeCounterpart,
        admissionLine: admissionLine
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.LonShaNativeFactAdmission = api;
    /* ★ 本版自伤留痕：首版写 `global !== window` —— 在无 window 的环境（Node 无头套件）     下 `window` 未声明会抛 ReferenceError，加载即崩。改为先判声明存在再比较。 */
    if (global && (typeof window === 'undefined' || global !== window)) global.LonShaNativeFactAdmission = api;
})(typeof window !== 'undefined' ? window : this);
