/*
 * engine-diagnostic-lines-part-c.js - 诊断/委托方法分片 3/3
 *
 * ★ [v3.474.0 · L23-O5] 本片从 `engine-diagnostic-lines.js`（拆分前 5915 行）机械切出：
 *   **函数体逐字未改**（缩进都保留原样，便于逐字节对拍），只加了两样东西：
 *   ① 片头把装配面注入的桩/常量/跨片引用取成本地名字（每个名字在全仓仍只有一份实现，这里只是别名）；
 *   ② 片尾把本片函数登记到装配面的 api 上。
 *   为什么这样切：分片之间必然互相调用（本片跨片引用 0 处），
 *   若各片自带一份依赖桩，就是"同一事实两处实现"—— 本仓已为此栽过（见 `_moduleLib` 同名两份的旧账）。
 *   故依赖一律由装配面单点注入，跨片调用一律经 api 转发（调用发生在装载完成之后）。
 */
(function (global) {
    'use strict';

    /* 本片函数清单（61 个：公开 48 / 片内私有 13）
     * silenceExplainState, DeferredOrTrimmed, silenceExplainAct, _silenceExplainLine, silenceListState, silenceLift, roundSnapshotBefore, roundSnapshotAfter, roundUndoState, roundUndo, _roundUndoLine, _inheritanceSecretLookup, inheritanceRosterState, inheritanceDeclare, inheritanceRevokeDeclare, _inheritanceRosterLine, _seatingPartitionLib, seatingPartitionState, _seatingPartitionLine, _characterReinterpretationLib, characterReinterpretationState, _characterReinterpretationLine, _commitmentLifecycleLib, commitmentInstanceState, _commitmentInstanceLine, _loreConclusionReconcileLib, loreConclusionState, _loreConclusionLine, _repairResponseLib, repairResponseState, _repairResponseLine, _eraHandoffDraftLib, eraHandoffDraftState, _eraHandoffDraftLine, _revisitScheduleLib, revisitScheduleState, _revisitScheduleLine, _sceneTrackerLib, _presenceGuardLib, sceneStateTrackerState, _sceneStateTrackerLine, _knowledgeRelayLib, knowledgeRelayState, _knowledgeRelayLine, _narrationCompareLib, narrationCompareState, _narrationCompareLine, _silenceListLine, memoryLineageReplay, _memoryLineageLine, counterfactualWhatIf, _counterfactualLine, povProject, _povProjectionLine, _perspectiveDiscrepancyLine, _autobiographicalRestatementLine, _cognitiveHorizonLine, _resonanceConsolidationLine, _pyramidEvolutionLine, _memorySymphonyLine, _v21EpicDiagnosticsLine
     */
    function install(api, S) {
        /* 装配面注入的桩与常量（别名，不是第二份实现） */
        var SILENCE_LIFTABLE = S.SILENCE_LIFTABLE;
        var _counterfactualBenchLib = S._counterfactualBenchLib;
        var _eraContinuationTreeLib = S._eraContinuationTreeLib;
        var _libs = S.libs;
        var _memoryLineageLib = S._memoryLineageLib;
        var _memorySeasonLib = S._memorySeasonLib;
        var _moduleLib = S._moduleLib;
        var _povProjectionLib = S._povProjectionLib;
        var _recallEchoLib = S._recallEchoLib;
        var _roundSnapshotLib = S._roundSnapshotLib;
        var _seasonSilenceLib = S._seasonSilenceLib;
        var errLog = S.errLog;

    function silenceExplainState(engine, opts) {
        const absent = (why) => ({
            kind: 'silence_explain', version: 0, state: 'unavailable', questions: {}, counts: {}, topics: [],
            echo: null, writesNothing: true, ok: false, reason: why,
        });
        try {
            const SM = _seasonSilenceLib();
            const MS = _memorySeasonLib();
            const o = (opts && typeof opts === 'object') ? opts : {};
            const wp = (engine && engine.worldProg) || {};
            const seasonState = (wp && wp.seasonState && typeof wp.seasonState === 'object') ? wp.seasonState : null;
            /* ★ 装配上下文三级回落：opts.ctx > 上次判定留下的 engine._silenceExplainCtx > 默认。
             *   理由：静音/延后/当前地点/在场人只有调用方知道，而 `silenceExplainAct` 会清读缓存。
             *   若缓存清掉后行读数退回默认 ctx，同一条主题的归因会当场变样（实测：
             *   面板点一次「静音」，另一条**只在 ctx 里被静音**的主题就从「静音」跳成「未召回」）。
             *   留一份 ctx 不是缓存判定结果，是记住判定输入 —— 两者不是一回事。 */
            const ctxSaved = (engine && engine._silenceExplainCtx && typeof engine._silenceExplainCtx === 'object')
                ? engine._silenceExplainCtx : null;
            const ctx = Object.assign({
                currentLocation: '', activeActor: '', storyClock: 0,
                mutedTopicIds: [], isSecretAuthorized: false,
            }, ctxSaved || {}, (o.ctx && typeof o.ctx === 'object') ? o.ctx : {});
            /* 用户静音的真源是 seasonState.userActions（mute）与 ctx.mutedTopicIds 两处；
             *   前者是**持久**选择、后者是**本轮**上下文，两者都算「用户主动静音」。 */
            const mutedIds = new Set(Array.isArray(ctx.mutedTopicIds) ? ctx.mutedTopicIds.map(String) : []);
            const deferredIds = new Set();
            if (seasonState && seasonState.userActions && typeof seasonState.userActions === 'object') {
                for (const k of Object.keys(seasonState.userActions)) {
                    const a = String(seasonState.userActions[k] || '');
                    if (a === 'mute') mutedIds.add(String(k));
                    else if (a === 'defer') deferredIds.add(String(k));
                }
            }
            const topics = Array.isArray(o.topics) ? o.topics
                : (Array.isArray(wp.topicSeasons) ? wp.topicSeasons : []);
            const only = String(o.topicId || '').trim();

            const echo = (function () {
                const RE = _recallEchoLib();
                if (!RE || typeof RE.summarize !== 'function') return null;
                try { return RE.summarize(wp.recallEcho || {}); } catch (_e) { return null; }
            })();
            const gateBucket = (function () {
                const rf = (engine && engine._worldlineRecallFilter) || null;
                if (!rf) return null;
                return { blocked: Number(rf.blocked) || 0, held: Number(rf.held) || 0, undecidedPassed: Number(rf.undecidedPassed) || 0 };
            })();

            const items = [];
            const counts = { 'not-recalled': 0, blocked: 0, trimmed: 0, muted: 0, surfacing: 0, notFound: 0 };
            for (const t of topics) {
                if (!t || typeof t !== 'object') continue;
                const tid = String(t.id || '').trim();
                if (only && tid !== only) continue;
                if (!tid) continue;
                const ev = (SM && typeof SM.evaluateTopicSeason === 'function')
                    ? SM.evaluateTopicSeason({ id: tid, location: t.location, actors: t.actors, evidenceCount: t.evidenceCount, isSecret: t.isSecret, targetEpoch: t.targetEpoch },
                        { mutedTopicIds: Array.from(mutedIds), isSecretAuthorized: ctx.isSecretAuthorized === true, currentLocation: ctx.currentLocation, activeActor: ctx.activeActor, storyClock: ctx.storyClock })
                    : null;
                const phase = (MS && typeof MS.evaluateSeasonPhase === 'function')
                    ? MS.evaluateSeasonPhase({ id: tid, location: t.location, theme: t.theme }, { userActions: (seasonState && seasonState.userActions) || {}, currentLocation: ctx.currentLocation, currentTopic: ctx.currentTopic })
                    : null;
                const reasonCode = String((ev && ev.reason) || '');
                /* 四问装配：**一个主题只落一问**（否则「为什么没进来」会给出四个互相矛盾的答案）。
                 *   优先级：静音（用户显式意愿）> 权限（秘密）> 裁剪（预算）> 未召回。 */
                let q = '';
                if (mutedIds.has(tid) || reasonCode === 'user_muted') q = 'muted';
                else if (reasonCode === 'unauthorized') q = 'blocked';
                else if (reasonCode === 'insufficient_evidence') q = 'not-recalled';
                else if (ev && ev.status === 'surfacing') q = 'surfacing';
                else if (DeferredOrTrimmed(tid, deferredIds)) q = 'not-recalled';
                else q = 'not-recalled';
                /* 预算裁剪：只有在**确实被召回**的前提下才成立（gateBucket 给出被挡数，
                 *   裁剪数由 recall echo 的 pending 溢出体现）。两者都为 0 时**不假装裁剪**。 */
                if (q === 'not-recalled' && gateBucket && gateBucket.undecidedPassed > 0 && t.overBudget === true) q = 'trimmed';
                counts[q] = (counts[q] || 0) + 1;
                items.push({
                    topicId: tid,
                    question: q,
                    state: String((ev && ev.status) || 'unknown'),
                    reasonCode,
                    phase: String((phase && phase.phase) || ''),
                    phaseReason: String((phase && phase.reason) || ''),
                    canSurfacing: !!(ev && ev.canSurfacing),
                    matchedSignals: (ev && ev.matchedSignals) ? {
                        matchLocation: !!ev.matchedSignals.matchLocation,
                        matchActor: !!ev.matchedSignals.matchActor,
                        isAnniversary: !!ev.matchedSignals.isAnniversary,
                    } : null,
                    /* 静音是**可逆**的：这条字段是「能不能重开」的机器可读答案。 */
                    reversible: q === 'muted' || q === 'not-recalled',
                    deferred: deferredIds.has(tid),
                    /* ★ 秘密不因周年浮现：这里把「内核短路的根因」显式报出来，
                     *   否则面板上「周年都没让它浮现」会被读成 bug。 */
                    secretSuppressedByAnniversary: !!(t.isSecret && ctx.isSecretAuthorized !== true),
                });
            }
            /* ★ 指名一个主题却查不到 ⇒ 这是**问错了对象**，不是「它没进来」。
             *   ok 必须是 false：只置 state='not-found' 而 ok=true 时，按下游 ok 分支画的面板
             *   会把「该主题不存在」渲染成一张空的四问表 —— 与「查过、确实没进来」同形。 */
            /* ★ 三态必须**不同形**（本版实测抓到的 fail-open）：
             *   · failed  —— 内核缺席，一次判定都没做（state='unavailable'，ok=false）；
             *   · empty   —— 主题表根本没登记（state='not-found' + reason='no-topics'，ok=true）；
             *   · absent  —— 指名了一个主题却查不到（state='not-found' + reason='topic-not-found'，ok=false）。
             *   旧写法把它们压成同一个 ok=true + 'not-found'，面板只能三选一地去猜。 */
            const noKernel = !SM || typeof SM.evaluateTopicSeason !== 'function';
            const noneRegistered = !topics.length;
            const namedMissing = !!only && !items.length && topics.length > 0;
            const state = noKernel ? 'unavailable'
                : (noneRegistered || namedMissing) ? 'not-found' : 'ok';
            if (namedMissing) counts.notFound = 1;
            const r = {
                kind: 'silence_explain', version: (SM && SM.VERSION) || 0, state,
                questions: {
                    notRecalled: items.filter((x) => x.question === 'not-recalled'),
                    blocked: items.filter((x) => x.question === 'blocked'),
                    trimmed: items.filter((x) => x.question === 'trimmed'),
                    muted: items.filter((x) => x.question === 'muted'),
                },
                counts, topics: items, echo, gateBucket,
                writesNothing: true,
                /* ★ 内核缺席时**不许**给出归因：evaluateTopicSeason 缺席 ⇒ ev 恒 null ⇒
                 *   每条都落 q='not-recalled' ⇒ 面板会把「模块没装上」读成「这些主题都没被召回」。
                 *   这是 fail-open（缺席被算成一种结论），按三态纪律必须是 failed 面。 */
                ok: !noKernel && !namedMissing,
                reason: noKernel ? 'module-unavailable'
                    : namedMissing ? 'topic-not-found'
                    : noneRegistered ? 'no-topics' : '',
            };
            if (engine) {
                engine._silenceExplainRead = r;
                /* 只在这次真判过时记输入：没内核的那一跑没资格覆盖调用方的 ctx。 */
                if (!noKernel) engine._silenceExplainCtx = ctx;
            }
            return r;
        } catch (e) { errLog(e, 'engine.silenceExplainState'); return absent('thrown'); }
    }
    function DeferredOrTrimmed(id, deferredIds) { return !!(id && deferredIds && deferredIds.has(String(id))); }

    function silenceExplainAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const MS = _memorySeasonLib();
            if (!MS || typeof MS.applySeasonAction !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            const tid = String(p.topicId || '').trim();
            if (!tid) return bad('topic-id-required');
            /* 动作词映射到内核四项：embrace / defer / mute / probe。
             *   ★ `reopen` 不是第五种动作，它就是 `embrace`（内核语义：接纳唤醒）。
             *     在宿主层造一个内核没有的词，会让「面板能点的」与「内核认的」分家。 */
            const map = { embrace: 'embrace', defer: 'defer', mute: 'mute', probe: 'probe', reopen: 'embrace', inquire: 'probe' };
            const kernelAct = map[act];
            if (!kernelAct) return bad('unknown-action');
            const out = MS.applySeasonAction(wp.seasonState || null, tid, kernelAct);
            if (!out || out.success !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
            wp.seasonState = out.state;
            if (engine) engine._silenceExplainRead = null;
            return { ok: true, reason: '', writes: true, topicId: tid, action: kernelAct, reversible: true };
        } catch (e) { errLog(e, 'engine.silenceExplainAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _silenceExplainLine(engine) {
        try {
            /* ★ 同样是**读缓存**：ctx（当前地点/在场人/静音清单）只有调用方知道，
             *   状态行重跑 {} 会把这些输入全丢掉 ⇒ 归因退化成「未召回」。
             *   缓存没有时才退回一次默认装配（并如实标 not-found）。 */
            const cached = (engine && engine._silenceExplainRead && typeof engine._silenceExplainRead === 'object')
                ? engine._silenceExplainRead : null;
            const r = cached || silenceExplainState(engine, {});
            /* ★ 措辞判定必须排在 `!ok` 之前：`topic-not-found` 是 ok=false 的正常结论，
             *   不是「不可用」。排在后面会被统一渲染成「不可用 · topic-not-found」，
             *   把「问错了对象」和「模块坏了」讲成同一句话。 */
            if (r.reason === 'no-topics') return '沉默四问：尚无主题登记';
            if (r.reason === 'topic-not-found') return '沉默四问：该主题不存在（≠「没进来」）';
            if (!r.ok) return '不可用 · ' + r.reason;
            const c = r.counts;
            return `沉默：未召回 ${c['not-recalled'] || 0} · 被挡 ${c.blocked || 0} · 被裁 ${c.trimmed || 0} · 静音 ${c.muted || 0} · 浮现 ${c.surfacing || 0}`;
        } catch (e) { errLog(e, 'engine._silenceExplainLine'); return '—（诊断异常）'; }
    }
    /* ===============================================================
     * [v3.442.0 · L13-X6] 静音清单面：我现在把什么静音了
     * ---------------------------------------------------------------
     * 【真实现场（本版起点，读码可复算）】
     *   `silenceExplainState` 只在「问为什么召不回」时才用，**没有**一张常驻的静音清单；
     *   更关键的是 `seasonState` / `topicSeasons` 全仓**除诊断层外零写入点**，
     *   且不在 WorldProgress 构造 / 导出 / 导入三处枚举里 ⇒ 静音存盘即丢。
     *   所以本面不只是「再画一个视图」，它先把「静音有地方存」这条补上（见 memory-organs.js）。
     *
     * 【两条真源**分列**，永不合并】
     *   · ctx    —— 本轮上下文里的静音（`ctx.mutedTopicIds`）：只在这一次跑里有效，
     *              重开对话就没有。它是**调用方给的**，本面不许替它编 since。
     *   · season —— 持久静音（`seasonState.userActions[tid] === 'mute'`）：跨楼跨存档都在。
     *   把两源并成一列是本仓反复治过的那类错读数：用户会以为「我静音的还在」，
     *   而其实那只是本轮上下文顺手带上的。
     *
     * 【为什么没有「全部解除」】
     *   一键全解会掩盖误操作 —— 用户再也分不清「我原本就只静音了一条」还是
     *   「我刚刚把三条都解了」。所以动作面**只有逐条**，且 `silenceLift` 只认一个 topicId。
     *
     * 【since / until 的诚实口径】
     *   内核 `applySeasonAction` 只写动作词（`userActions[mid] = action`），**不记时间**。
     *   本面不伪造 since：能读到 `seasonState.updatedAt` 就报它（并明确标注这是「最近一次
     *   季候动作时间」而不是「这一条的静音起点」），读不到就报 `unknown`。
     *   同理 `until` 一律 `null` —— 本仓没有「静音到某时自动解除」的机制，
     *   写一个时间出去就是凭空的承诺。
     * =============================================================== */
    var SILENCE_SOURCES = Object.freeze(['ctx', 'season']);  // [L23-O5] 常量表已上移到装配面
    var SILENCE_LIFTABLE = Object.freeze({ ctx: false, season: true });  // [L23-O5] 常量表已上移到装配面
    function silenceListState(engine, opts) {
        const absent = (why) => ({
            kind: 'silence_list', version: 0, state: 'unavailable',
            sources: { ctx: [], season: [] }, counts: { ctx: 0, season: 0, total: 0 },
            items: [], listable: { ctx: false, season: false }, echo: null,
            writesNothing: true, ok: false, reason: why,
        });
        try {
            const SM = _seasonSilenceLib();
            const o = (opts && typeof opts === 'object') ? opts : {};
            const wp = (engine && engine.worldProg) || {};
            const seasonState = (wp && wp.seasonState && typeof wp.seasonState === 'object') ? wp.seasonState : null;
            /* ctx 与 silenceExplainState 同一条三级回落：opts.ctx > engine._silenceExplainCtx > 默认。
             *   理由一样 —— 调用方在别处判过一次的 ctx 是真输入，重跑 {} 会把它丢掉。 */
            const ctxSaved = (engine && engine._silenceExplainCtx && typeof engine._silenceExplainCtx === 'object')
                ? engine._silenceExplainCtx : null;
            const ctx = Object.assign({ mutedTopicIds: [] }, ctxSaved || {}, (o.ctx && typeof o.ctx === 'object') ? o.ctx : {});
            const ctxIds = Array.isArray(ctx.mutedTopicIds) ? ctx.mutedTopicIds.map(String).filter(Boolean) : [];
            const seasonActions = (seasonState && seasonState.userActions && typeof seasonState.userActions === 'object')
                ? seasonState.userActions : {};
            const seasonMuted = Object.keys(seasonActions).filter((k) => String(seasonActions[k] || '') === 'mute');
            /* 主题本体表：只是**加名字**用，不是真源的替代。
             *   ★ 读不到主题表时如实报 name=null（≠「名字就叫 id」）。 */
            const topicRows = Array.isArray(wp.topicSeasons) ? wp.topicSeasons : [];
            const titleOf = (tid) => {
                for (const t of topicRows) {
                    if (t && typeof t === 'object' && String(t.id || '').trim() === tid) {
                        const nm = String(t.title || t.name || t.theme || '').trim();
                        if (nm) return nm;
                        break;
                    }
                }
                return null;
            };
            /* 季候动作时间：只有一个全局时间戳。**不许**把它当逐条 since —— 见档头。 */
            const seasonAt = (seasonState && typeof seasonState.updatedAt === 'number') ? seasonState.updatedAt : null;
            const mk = (tid, source) => ({
                topicId: tid,
                title: titleOf(tid),
                source,
                /* since 语义逐源不同，机器可读地写清楚： */
                sinceKind: source === 'season' ? (seasonAt === null ? 'unknown' : 'last-season-action') : 'this-run',
                since: source === 'season' ? seasonAt : null,
                /* until 恒 null：本仓没有静音到期机制。写时间 = 凭空承诺。 */
                until: null,
                /* 能不能在这一源上解除：ctx 是调用方给的，本面改不动它。 */
                liftable: SILENCE_LIFTABLE[source] === true,
                why: source === 'season' ? '你在这份存档里把这条静音了' : '本轮上下文把这条静音了（重开对话即失效）',
            });
            const ctxItems = ctxIds.map((t) => mk(t, 'ctx'));
            const seasonItems = seasonMuted.map((t) => mk(t, 'season'));
            /* ★ 两源同 id 时**两列都保留**（不去重合并）：这是本面最容易被"优化"掉的一条。
             *   同 id 同时出现在两源，本身就是一条信息：「持久静音 + 本轮又静了一次」。 */
            const items = ctxItems.concat(seasonItems);
            const noKernel = !SM || typeof SM.evaluateTopicSeason !== 'function';
            const r = {
                kind: 'silence_list', version: (SM && SM.VERSION) || 1, state: noKernel ? 'unavailable' : 'ok',
                sources: { ctx: ctxItems, season: seasonItems },
                counts: { ctx: ctxItems.length, season: seasonItems.length, total: items.length },
                /* listable 说明「这一源现在能不能列」：ctx 恒可列（有就是有）；
                 *   season 只有在 seasonState 是对象时才可列 —— 否则是「没有这份账」，
                 *   与「这份账是空的」不同形。 */
                listable: { ctx: true, season: seasonState !== null },
                items,
                /* 挂上四问的静音读数，供面板显示「面板上的静音数」与「四问里的静音数」是否一致。
                 *   两处不一致本身是缺陷信号，必须可观测。 */
                echo: (function () {
                    try {
                        /* ★ echo 用 `Object.create(engine)` 的一次性代理跑四问，绝不回写真 engine。
                         *   silenceExplainState 末尾要写 `_silenceExplainCtx`（记住判定输入）
                         *   和 `_silenceExplainRead`；本面是只读面，借它算一次静音数
                         *   就把调用方的判定输入覆盖掉 => 状态行下一次归因按被覆盖的输入走。
                         *   代理走原型链：读得到 worldProg / _worldlineRecallFilter，写只落代理。 */
                        const probe = Object.create(engine || null);
                        const ex = silenceExplainState(probe, { ctx });
                        return (ex && ex.ok === true) ? { muted: (ex.counts && ex.counts.muted) || 0, scanned: (ex.counts && (ex.counts['not-recalled'] || 0) + (ex.counts.blocked || 0) + (ex.counts.trimmed || 0) + (ex.counts.muted || 0) + (ex.counts.surfacing || 0)) || 0 } : null;
                    } catch (_e) { return null; }
                })(),
                writesNothing: true,
                /* ★ 缺席不许装成「你什么都没静音」：内核缺席 ⇒ ok:false + module-unavailable。 */
                ok: !noKernel,
                reason: noKernel ? 'module-unavailable' : '',
            };
            if (engine) engine._silenceListRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.silenceListState'); return absent('thrown'); }
    }
    /* 逐条解除静音。**只认一个 topicId**，没有批量入口（见档头「为什么没有全部解除」）。 */
    function silenceLift(engine, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false, lifted: false });
        try {
            const MS = _memorySeasonLib();
            if (!MS || typeof MS.applySeasonAction !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            const p = (payload && typeof payload === 'object') ? payload : {};
            const tid = String(p.topicId || '').trim();
            if (!tid) return bad('topic-id-required');
            const st = (wp.seasonState && typeof wp.seasonState === 'object') ? wp.seasonState : null;
            const ua = (st && st.userActions && typeof st.userActions === 'object') ? st.userActions : {};
            const cur = String(ua[tid] || '');
            /* ★ 三态必须不同形：
             *   · not-muted       —— 这条本来就没静音（重放无意义，但不是失败）；
             *   · ctx-only-muted  —— 只在**本轮上下文**里静音；本面改不动调用方的 ctx，
             *                        如实报「要重开对话或让调用方撤掉」而不假装解除了；
             *   · module-unavailable —— 内核缺席。 */
            if (cur !== 'mute') {
                const ctxSaved = (engine && engine._silenceExplainCtx && typeof engine._silenceExplainCtx === 'object')
                    ? engine._silenceExplainCtx : null;
                const ids = (ctxSaved && Array.isArray(ctxSaved.mutedTopicIds)) ? ctxSaved.mutedTopicIds.map(String) : [];
                if (ids.indexOf(tid) >= 0) return bad('ctx-only-muted');
                return bad('not-muted');
            }
            /* 解除 = 把动作从 mute 改成 embrace（内核语义：接纳唤醒）。
             *   ★ 不 delete 键：删键会让「曾经因用户意愿静音过」这段历史消失，
             *     而 embrace 是内核本来就认的动作词，落在同一张动作表里可审计。 */
            const out = MS.applySeasonAction(st, tid, 'embrace');
            if (!out || out.success !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
            wp.seasonState = out.state;
            /* 读缓存必须清：不清的话行读数与面板会继续报旧静音数（这是本仓治过多次的形态）。 */
            if (engine) { engine._silenceExplainRead = null; engine._silenceListRead = null; }
            return { ok: true, reason: '', writes: true, lifted: true, topicId: tid, from: 'mute', to: 'embrace' };
        } catch (e) { errLog(e, 'engine.silenceLift'); return { ok: false, reason: 'thrown', writes: false, lifted: false }; }
    }
    /* ============================================================
     * [v3.443.0 · L13-X8] 本轮生成的可撤销快照
     * ------------------------------------------------------------
     * 【计划原文的真实现场（Problem 8）】
     *   `row.revoke` 撤的是**证据裁决**；`snapshot-checkpoint` 是**整份载荷**级检查点。
     *   中间那一层空着：**「这一轮生成到底新塞进了哪些条目」**。
     *   于是「这轮加错了」只能在各面对着手删，或者整份回滚 —— 后者会把同轮的
     *   正确写入也一起吞掉。两件事被压成同一种处置，正是本条要拆开的。
     *
     * 【四条硬纪律（每条都配判据）】
     *   (1) **不复制正文**：摘要只记 id + 指纹（长度 / 首尾 24 字 / 哈希）；
     *       复制正文等于绕开各账 owner 另建一份真源，之后两边不再同步。
     *   (2) **只回滚新增**：`added` 可撤，`modified` 只标 **待复核**，
     *       `removed` **不可撤**（正文没存，撤回来就是编造）。回退修改会吞掉别的动作。
     *   (3) **二次确认是硬门槛**：`confirm !== true` 一律拒绝（误点一次就抹掉整轮写入）。
     *   (4) **半对与全缺不同形**：只有 before 没有 after ⇒ `half-round`，
     *       一对都没有 ⇒ `no-round`。合成一个「没有可撤销的」会掩盖「采集断在半路」。
     *
     * 【账本清单由宿主给，内核不猜】
     *   `ledgers` 是 `[{key, label?, list}]`；哪个账该被纳入由宿主决定，
     *   本层只负责采集 / 对拍 / 撤销编排，**不自己删除任何账**（removers 也由宿主给）。
     * ============================================================ */

    /**
     * 记一次「本轮开始前」的条目集合摘要。
     * @param {object} engine
     * @param {{ledgers:Array, floor?:number, seq?:number}} payload
     */
    function roundSnapshotBefore(engine, payload) {
        var bad = function (why) { return { ok: false, reason: why, writes: false, seq: null, phase: 'before' }; };
        try {
            var RS = _roundSnapshotLib();
            if (!RS || typeof RS.collectSummary !== 'function' || typeof RS.recordSnapshot !== 'function') return bad('module-unavailable');
            var p = (payload && typeof payload === 'object') ? payload : {};
            var sum = RS.collectSummary(p.ledgers);
            if (!sum || sum.ok !== true) {
                /* ★ 采集不成 ⇒ **不记假快照**（记了就等于宣布「本轮新增 0 条」这个编出来的结论）。 */
                return { ok: false, reason: 'summary-unavailable:' + ((sum && sum.reason) || 'absent'), writes: false, seq: null, phase: 'before', counts: {}, skippedNoId: (sum && sum.skippedNoId) || 0 };
            }
            var r = RS.recordSnapshot(engine, { phase: 'before', floor: p.floor, seq: p.seq, summary: sum });
            if (!r || r.ok !== true) return bad((r && r.reason) || 'record-failed');
            return Object.assign({}, r, { counts: sum.counts, skippedNoId: sum.skippedNoId, ledgerCount: sum.ledgerCount });
        } catch (e) { errLog(e, 'engine.roundSnapshotBefore'); return bad('thrown'); }
    }

    /** 记一次「本轮结束后」的条目集合摘要（同形）。 */
    function roundSnapshotAfter(engine, payload) {
        var bad = function (why) { return { ok: false, reason: why, writes: false, seq: null, phase: 'after' }; };
        try {
            var RS = _roundSnapshotLib();
            if (!RS || typeof RS.collectSummary !== 'function' || typeof RS.recordSnapshot !== 'function') return bad('module-unavailable');
            var p = (payload && typeof payload === 'object') ? payload : {};
            var sum = RS.collectSummary(p.ledgers);
            if (!sum || sum.ok !== true) {
                return { ok: false, reason: 'summary-unavailable:' + ((sum && sum.reason) || 'absent'), writes: false, seq: null, phase: 'after', counts: {}, skippedNoId: (sum && sum.skippedNoId) || 0 };
            }
            var r = RS.recordSnapshot(engine, { phase: 'after', floor: p.floor, seq: p.seq, summary: sum });
            if (!r || r.ok !== true) return bad((r && r.reason) || 'record-failed');
            return Object.assign({}, r, { counts: sum.counts, skippedNoId: sum.skippedNoId, ledgerCount: sum.ledgerCount });
        } catch (e) { errLog(e, 'engine.roundSnapshotAfter'); return bad('thrown'); }
    }

    /**
     * 本轮可撤销清单（**只读**：`writesNothing:true`）。
     * 缺席面与在场面**逐字同键**（面板才能用同一套渲染而不猜）。
     */
    function roundUndoState(engine) {
        var absent = function (why) {
            return {
                kind: 'round_undo', version: 0, state: 'unavailable',
                seq: null, floor: null, counts: { added: 0, removed: 0, modified: 0 },
                added: [], modified: [], removed: [],
                writesNothing: true, ok: false, reason: why,
            };
        };
        try {
            var RS = _roundSnapshotLib();
            if (!RS || typeof RS.roundUndoState !== 'function') return absent('module-unavailable');
            var r = RS.roundUndoState(engine);
            if (!r || typeof r !== 'object') return absent('bad-shape');
            if (engine && typeof engine === 'object') engine._roundUndoRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.roundUndoState'); return absent('thrown'); }
    }

    /**
     * 撤销本轮**新增**条目（唯一写入口）。
     * @param {object} engine
     * @param {{removers:Object<string,(id:string)=>boolean>, confirm?:boolean}} payload
     * 失败原因码：`confirm-required` / `module-unavailable` / `removers-required` /
     *   `engine-absent` / `no-round:*` / `state-unavailable` / `partial` / `thrown`。
     */
    function roundUndo(engine, payload) {
        var bad = function (why) { return { ok: false, reason: why, writes: false, seq: null, removed: [], failed: [], skipped: [], counts: { removed: 0, failed: 0, skipped: 0 } }; };
        try {
            var RS = _roundSnapshotLib();
            if (!RS || typeof RS.undoRound !== 'function') return bad('module-unavailable');
            var p = (payload && typeof payload === 'object') ? payload : {};
            /* ★ 二次确认先判：连「要不要撤」都没确认时，不去读账（读也算一次动作）。 */
            if (p.confirm !== true) return bad('confirm-required');
            if (!p.removers || typeof p.removers !== 'object') return bad('removers-required');
            var r = RS.undoRound(engine, p);
            if (!r || typeof r !== 'object') return bad('bad-shape');
            /* 撤销后清读缓存：不清的话面板会继续报旧的可撤销清单（本仓治过多次的形态）。 */
            if (engine && typeof engine === 'object') engine._roundUndoRead = null;
            return r;
        } catch (e) { errLog(e, 'engine.roundUndo'); return bad('thrown'); }
    }

    /** 诊断行：三态措辞互不同形（模块缺席 / 还没有一轮 / 有可撤条目）。 */
    function _roundUndoLine(engine) {
        try {
            var r = (engine && engine._roundUndoRead && typeof engine._roundUndoRead === 'object')
                ? engine._roundUndoRead : roundUndoState(engine);
            if (!r.ok) return '本轮可撤销：不可用 · ' + r.reason;
            if (r.state === 'no-round') return '本轮可撤销：还没有一轮完整快照（生成本身没记过前后）';
            if (r.state === 'half-round') return '本轮可撤销：快照只有半对（缺 ' + (r.missing || []).join('+') + '，采集断在半路）';
            /* 第四态：撤过的那一轮要**说清是哪一轮、什么时候撤的** ——
             *   与「本轮没有新增」（ok + added 0）不同形，否则用户分不清「撤成功了」和「本来就没写」。 */
            if (r.state === 'undone') {
                var when = r.undoneAt ? new Date(r.undoneAt).toLocaleString() : '时间未知';
                return '本轮可撤销：第 ' + String(r.seq === null || r.seq === undefined ? '—' : r.seq) + ' 轮已于 ' + when + ' 撤销过（不重放）';
            }
            var c = r.counts || {};
            var tail = (c.modified || 0) > 0 ? ('，另有 ' + c.modified + ' 条本轮被改过（只标待复核，不回退）') : '';
            return '本轮可撤销：新增 ' + (c.added || 0) + ' 条可撤 · 删除 ' + (c.removed || 0) + ' 条不可撤（正文未留）' + tail;
        } catch (e) { errLog(e, 'engine._roundUndoLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.444.0 · L13-X9] 跨代传承面（把「传承物四态 + 秘密断代」接到产品）
     * ------------------------------------------------------------
     * 【计划原文的两条硬要求，逐条落在下面】
     *   ① 列出跨代物品/规矩及其四态，**`lost` 档必须与「还没传」区分**
     *      （前者是遗失，后者是未发生）；
     *   ② 秘密断代：新一代**绝不自动获知**前代未公开秘密，
     *      **沿用既有 scope 判定，不新写一套**。
     *
     * 【第②条怎么落的（本面的核心，不许偷懒）】
     *   本层**不实现任何「该不该给他看」的逻辑**，只把既有
     *   `secret-ledger.js` 的 `knowledgeOf(item, who)` 原函数注入内核
     *   （`opts.knowledgeOf`）。内核只做三件事：调它、读三态字符串、分四档。
     *   秘密账缺席 ⇒ 整面 ok:false（module-unavailable），**绝不**退化成
     *   「都判不了所以都不给看」—— 那是猜，且会把「面没装上」伪装成「判定结果」。
     *
     * 【为什么秘密边界是四档而不是一个布尔】
     *   `absent`（不是秘密 / 秘密账里没这条）与 `undecided`（判不了）处置相反：
     *   前者不用遮蔽，后者要人去看。压成一个 false 会让「秘密账漏记」永远看不见。
     *
     * 【写入面（四态声明）怎么撤】
     *   声明落在**既有槽** `eraTransitions[i].declarations[artifactId]`
     *   （不新开存储、不建第二套事实库 —— 它随 worldProg 一并存档）。
     *   两个硬门槛：
     *     · `confirm !== true` ⇒ 拒绝（连状态都不读）；
     *     · `inheritanceRevokeDeclare` 逐条撤销，撤完该条回到**推导值**
     *       （不是回到「pending」—— 那会把「本来就是 lost」改成「还没传」，
     *        正是本面第①条要防的形态）。
     * ============================================================ */

    /** 从既有秘密账里按 id / 正文找条目（找不到返回 null，**不新建**占位条目）。 */
    function _inheritanceSecretLookup(engine) {
        return function (artifactId, item) {
            try {
                const SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
                if (!SL || typeof SL.knowledgeOf !== 'function') return null;
                const wp = engine && engine.worldProg;
                const st = wp && wp.secretLedger;
                const rows = (st && Array.isArray(st.items)) ? st.items : [];
                if (!rows.length) return null;
                const id = String(artifactId || '');
                const byId = rows.find((r) => r && String(r.id || '') === id);
                if (byId) return byId;
                /* 按正文匹配：传承物的 label 与秘密条目的 secret 常常是同一句话
                 *   （「养女实为仇家之后」这类），故拿 label 精确比（小写、去首尾空白）。 */
                const keys = [];
                const push = (v) => { const s = String(v || '').trim().toLowerCase(); if (s) keys.push(s); };
                if (item && typeof item === 'object') { push(item.content); push(item.name); push(item.title); }
                if (!keys.length) return null;
                return rows.find((r) => r && keys.indexOf(String(r.secret || '').trim().toLowerCase()) >= 0) || null;
            } catch (_e) { return null; }
        };
    }

    /**
     * 传承清单（**只读**：`writesNothing:true`）。
     * 数据源就是 `worldProg.eraTransitions` 原样 —— 本面不新建任何账。
     */
    function inheritanceRosterState(engine, opts) {
        const absent = (why) => ({
            kind: 'inheritance_roster', version: 0, state: 'unavailable',
            items: [], counts: { accepted: 0, rejected: 0, reformed: 0, lost: 0, pending: 0, unknown: 0, total: 0 },
            boundary: { disclosed: 0, withheld: 0, undecided: 0, absent: 0 },
            undecided: [], successorActorId: '', writesNothing: true, ok: false, reason: why,
        });
        try {
            const EC = _eraContinuationTreeLib();
            if (!EC || typeof EC.buildInheritanceRoster !== 'function') return absent('module-unavailable');
            const SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
            if (!SL || typeof SL.knowledgeOf !== 'function') {
                /* ★ 秘密账缺席 ⇒ 整面不可用。不许「反正判不了就都不给看」地降级 ——
                 *   那会让用户以为「这一代什么都不知道」，而事实是**判定口没装上**。 */
                return absent('secret-ledger-unavailable');
            }
            const o = (opts && typeof opts === 'object') ? opts : {};
            const wp = engine && engine.worldProg;
            const transitions = (wp && Array.isArray(wp.eraTransitions)) ? wp.eraTransitions : null;
            /* successorActorId：opts 优先，回落 engine 的当前扮演者（与既有面同源）。 */
            let successor = String(o.successorActorId || '').trim();
            if (!successor) {
                try { successor = String((engine && engine._currentSpeakerName) || '').trim(); } catch (_e) { successor = ''; }
            }
            const r = EC.buildInheritanceRoster(transitions, {
                successorActorId: successor,
                knowledgeOf: SL.knowledgeOf,
                secretLookup: _inheritanceSecretLookup(engine),
            });
            const out = Object.assign({ kind: 'inheritance_roster', state: (r && r.ok === true) ? 'ok' : 'unavailable', successorActorId: successor }, r);
            if (engine) engine._inheritanceRosterRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.inheritanceRosterState'); return absent('thrown'); }
    }

    /** 声明某件传承物的四态（**唯一写入口**，落在既有 eraTransitions 槽）。 */
    function inheritanceDeclare(engine, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false, declared: false });
        try {
            const EC = _eraContinuationTreeLib();
            if (!EC || !EC.INHERITANCE_FATE) return bad('module-unavailable');
            const p = (payload && typeof payload === 'object') ? payload : {};
            /* ★ 二次确认先判：没确认时连状态都不读（读也算一次动作）。 */
            if (p.confirm !== true) return bad('confirm-required');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            const tid = String(p.transitionId || '').trim();
            const aid = String(p.artifactId || '').trim();
            if (!tid) return bad('transition-id-required');
            if (!aid) return bad('artifact-id-required');
            const fate = String(p.fate || '').trim();
            /* ★ 只认四态：`pending` **不可声明** —— 它是「还没发生」，
             *   人能声明的只有已经发生的结果。允许声明 pending 等于
             *   把「遗失」改写成「还没传」，正是本面第①条要防的形态。 */
            if (!Object.values(EC.INHERITANCE_FATE).includes(fate)) return bad('bad-fate:' + fate);
            const list = Array.isArray(wp.eraTransitions) ? wp.eraTransitions : null;
            if (!list) return bad('transitions-not-array');
            const tr = list.find((x) => x && String(x.transitionId || '') === tid);
            if (!tr) return bad('transition-not-found');
            const items = Array.isArray(tr.items) ? tr.items : [];
            if (!items.some((it) => it && String(it.id || '') === aid)) return bad('artifact-not-found');
            /* 写在既有槽里（不是新存储）：随 worldProg 一并存档。 */
            if (!tr.declarations || typeof tr.declarations !== 'object') tr.declarations = {};
            const before = tr.declarations[aid] || null;
            tr.declarations[aid] = { fate: fate, at: Date.now(), note: String(p.note || '').slice(0, 120) };
            if (engine) engine._inheritanceRosterRead = null;
            return {
                ok: true, reason: '', writes: true, declared: true,
                transitionId: tid, artifactId: aid, fate: fate,
                /* 覆盖了旧声明就如实报（不静默吞掉前一次）。 */
                replaced: before ? { fate: String(before.fate || '') } : null,
            };
        } catch (e) { errLog(e, 'engine.inheritanceDeclare'); return bad('thrown'); }
    }

    /** 撤销一次声明 —— 该条回到**推导值**（不是回到 pending）。 */
    function inheritanceRevokeDeclare(engine, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false, revoked: false });
        try {
            const p = (payload && typeof payload === 'object') ? payload : {};
            if (p.confirm !== true) return bad('confirm-required');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            const tid = String(p.transitionId || '').trim();
            const aid = String(p.artifactId || '').trim();
            if (!tid || !aid) return bad('keys-required');
            const list = Array.isArray(wp.eraTransitions) ? wp.eraTransitions : null;
            if (!list) return bad('transitions-not-array');
            const tr = list.find((x) => x && String(x.transitionId || '') === tid);
            if (!tr) return bad('transition-not-found');
            const d = (tr.declarations && typeof tr.declarations === 'object') ? tr.declarations : null;
            if (!d || !d[aid]) return bad('not-declared');
            const was = String((d[aid] && d[aid].fate) || '');
            delete d[aid];
            if (engine) engine._inheritanceRosterRead = null;
            return { ok: true, reason: '', writes: true, revoked: true, transitionId: tid, artifactId: aid, was: was };
        } catch (e) { errLog(e, 'engine.inheritanceRevokeDeclare'); return bad('thrown'); }
    }

    /** 诊断行：四态 + 还没传**分开报**（合成一个数就分不出「遗失了」和「还没走到」）。 */
    function _inheritanceRosterLine(engine) {
        try {
            const cached = (engine && engine._inheritanceRosterRead && typeof engine._inheritanceRosterRead === 'object')
                ? engine._inheritanceRosterRead : null;
            const r = cached || inheritanceRosterState(engine, {});
            if (!r || r.ok !== true) return '传承清单：不可用 · ' + ((r && r.reason) || 'module-unavailable');
            const c = r.counts || {};
            if (!c.total) return '传承清单：账在但一条跨代物件都没有（不是「面没装上」）';
            const b = r.boundary || {};
            const parts = [
                '接纳 ' + (c.accepted || 0), '拒绝 ' + (c.rejected || 0),
                '改造 ' + (c.reformed || 0), '**遗失 ' + (c.lost || 0) + '**',
                '还没传 ' + (c.pending || 0),
            ];
            if (c.unknown) parts.push('判不了 ' + c.unknown);
            const secretTail = (b.disclosed || b.withheld || b.undecided)
                ? (' · 秘密：这一代可知 ' + (b.disclosed || 0) + ' / 遮蔽 ' + (b.withheld || 0)
                    + (b.undecided ? (' / **判不了 ' + b.undecided + '**') : ''))
                : '';
            return '传承清单：' + parts.join(' · ') + secretTail;
        } catch (e) { errLog(e, 'engine._inheritanceRosterLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.449.0 · L14-X6] 场景分席面（把「下一幕谁能说什么」接到产品）
     * ------------------------------------------------------------
     * 【为什么这个面必须存在，而不是只留一个内核】
     *   `scene-character-seating-partition.js` 是纯函数：给它在场席位与材料，
     *   它把材料分成 shared（全员可知）/ partial（>=2 且 < 全员）/
     *   privatePockets（单人独享）/ embargoed（席内无人可知）四类。
     *   但在本仓的历史形态里，纯函数写完就「交付完成」了 —— 那正是
     *   `prod_call_sites=0` 的功能级失效。本段是它第一次有产品取数口。
     *
     * 【三条不可让步口径（逐条对应内核的边界）】
     *   ① **面板不重判**：四池一律取自内核 `partitionMaterialsForSeats`，
     *      本层只做「把 engine 里的东西喂给内核」和「把结果整理成可读行」，
     *      不自己再算一次「这条该归谁」（两处实现必漂移）。
     *   ② **公开块绝不泄漏私密**：`buildCharacterPerspectivePrompt` 的输出
     *      在这里被**逐条校验**（私有材料的 materialId 不得出现在他人的
     *      prompt 里）；一旦发现，整面报 `leak-detected` 而不是照常返回 ——
     *      泄漏比不可用更糟，不可用只是没功能，泄漏是泄密。
     *   ③ **席位为空的三种「空」必须不同形**：
     *      · 内核缺席 → `module-unavailable`（面没装上）；
     *      · 没有在场席位 → `no-seats`（有面，但这一幕还没排人）；
     *      · 有席位但一条材料也没有 → `ok:true + 四池全空`（真在跑，只是空）。
     *      合成一个「没有」会让「装没装上」永远看不见。
     *
     * 【数据 owner】
     *   读：`engine._seatingMaterials`（材料清单）+ `engine._activeSeats`（在场席位）。
     *   写：**无**。本面是只读面（`writesNothing:true`），
     *      排席与写材料仍走各自的既有 owner，这里一个字节都不落盘。
     * ============================================================ */
    function _seatingPartitionLib() {
        if (_libs._seatingPartitionLib) return _libs._seatingPartitionLib.apply(null, arguments);
        const mod = (typeof window !== 'undefined' ? window.LonShaSceneSeatingPartition : null);
        if (mod) return mod;
        if (typeof require !== 'undefined') {
            try { return require('./scene-character-seating-partition.js'); } catch (_) {}
        }
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSceneSeatingPartition : null), 'scene-character-seating-partition.js');
    }
    /**
     * 读一次分席读数（只读，不落盘；落 `_seatingPartitionRead` 供诊断行复用）。
     * @param {object} engine
     * @param {{seats?:string[], materials?:Array, perspectives?:boolean}} [opts]
     */
    function seatingPartitionState(engine, opts) {
        const absent = (why) => ({
            kind: 'seating_partition', version: 0, state: 'unavailable',
            sceneId: '', activeSeats: [], sharedPool: [], partialSubsets: [],
            privatePockets: {}, embargoedSecrets: [], counts: { shared: 0, partial: 0, private: 0, embargoed: 0 },
            perspectives: null, writesNothing: true, ok: false, reason: why,
        });
        try {
            const SP = _seatingPartitionLib();
            if (!SP || typeof SP.partitionMaterialsForSeats !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            /* 席位与材料一律由调用方给（本层不猜「这一场有谁」）。 */
            const seats = Array.isArray(o.seats) ? o.seats : (engine && Array.isArray(engine._activeSeats) ? engine._activeSeats : []);
            const materials = Array.isArray(o.materials) ? o.materials : (engine && Array.isArray(engine._seatingMaterials) ? engine._seatingMaterials : []);
            const sceneId = String(o.sceneId || (engine && engine._seatingSceneId) || '');
            const title = String(o.sceneTitle || (engine && engine._seatingSceneTitle) || '');
            const session = SP.createSeatingSession({ sceneId: sceneId, sceneTitle: title, activeSeats: seats });
            /* ★ 没有在场席位 ⇒ **不调内核**，直接报 no-seats。
             *   理由：内核在 seatCount===0 时返回「四池全空」，那与「有席位但没材料」同形；
             *   而「这一幕还没排人」与「排了人但确实没东西可说」是两件不同的事。 */
            if (!seats.length) {
                return {
                    kind: 'seating_partition', version: 1, state: 'no-seats',
                    sceneId: session.sceneId, sceneTitle: session.sceneTitle, activeSeats: [],
                    sharedPool: [], partialSubsets: [], privatePockets: {}, embargoedSecrets: [],
                    counts: { shared: 0, partial: 0, private: 0, embargoed: 0 },
                    perspectives: null, writesNothing: true, ok: false, reason: 'no-seats',
                };
            }
            const part = SP.partitionMaterialsForSeats(session, materials);
            /* 逐人构造视角 prompt（默认构造；`perspectives:false` 可跳过）。 */
            let perspectives = null;
            let leak = null;
            if (o.perspectives !== false && typeof SP.buildCharacterPerspectivePrompt === 'function') {
                perspectives = {};
                for (const who of seats) {
                    let txt = '';
                    try { txt = String(SP.buildCharacterPerspectivePrompt(part, who) || ''); } catch (e) { errLog(e, 'engine.seatingPartition.buildPrompt'); txt = ''; }
                    perspectives[who] = txt;
                }
                /* ★ 泄漏校验：任何**别人**的私有 materialId 出现在我的 prompt 里 ⇒ 立刻报。
                 *   只查 privatePockets（shared/partial 本来就该出现，查它等于把正常当异常）。 */
                for (const who of seats) {
                    const mine = perspectives[who] || '';
                    for (const other of seats) {
                        if (other === who) continue;
                        const pocket = (part.privatePockets && part.privatePockets[other]) || [];
                        for (const m of pocket) {
                            const mid = String((m && m.materialId) || '');
                            if (mid && mine.indexOf(mid) !== -1) { leak = { viewer: who, owner: other, materialId: mid }; break; }
                        }
                        if (leak) break;
                    }
                    if (leak) break;
                }
            }
            const privCount = Object.keys(part.privatePockets || {}).reduce((n, k) => n + ((part.privatePockets[k] || []).length), 0);
            const out = {
                kind: 'seating_partition', version: 1,
                state: leak ? 'leak-detected' : 'ok',
                sceneId: session.sceneId, sceneTitle: session.sceneTitle,
                activeSeats: seats.slice(),
                sharedPool: (part.sharedPool || []).slice(),
                partialSubsets: (part.partialSubsets || []).slice(),
                privatePockets: part.privatePockets || {},
                embargoedSecrets: (part.embargoedSecrets || []).slice(),
                counts: {
                    shared: (part.sharedPool || []).length,
                    partial: (part.partialSubsets || []).length,
                    private: privCount,
                    embargoed: (part.embargoedSecrets || []).length,
                },
                perspectives: perspectives,
                leak: leak,
                writesNothing: true,
                ok: !leak,
                reason: leak ? ('leak-detected:' + leak.owner + '→' + leak.viewer + '/' + leak.materialId) : '',
            };
            if (engine && typeof engine === 'object') engine._seatingPartitionRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.seatingPartitionState'); return absent('thrown'); }
    }
    /** 诊断行：四池分开报（合成一个总数看不出「谁独知」）。 */
    function _seatingPartitionLine(engine) {
        try {
            const cached = (engine && engine._seatingPartitionRead && typeof engine._seatingPartitionRead === 'object')
                ? engine._seatingPartitionRead : seatingPartitionState(engine, {});
            if (!cached || cached.ok !== true) {
                if (cached && cached.state === 'no-seats') return '场景分席：还没有在场席位（这一幕还没排人，不是「面没装上」）';
                return '场景分席：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            const c = cached.counts || {};
            const seats = (cached.activeSeats || []).join('、') || '—';
            const priv = Object.keys(cached.privatePockets || {})
                .map((k) => k + ' ' + ((cached.privatePockets[k] || []).length))
                .filter((s) => !/ 0$/.test(s))
                .join('、') || '无';
            return '场景分席：在场 ' + (cached.activeSeats || []).length + ' 人（' + seats + '）'
                + ' · 公共 ' + (c.shared || 0) + ' · 部分共知 ' + (c.partial || 0)
                + ' · 独知 ' + (c.private || 0) + '（' + priv + '）'
                + ' · 席内无人知晓 ' + (c.embargoed || 0);
        } catch (e) { errLog(e, 'engine._seatingPartitionLine'); return '—（诊断异常）'; }
    }
    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X3]
     * 认知改观与解释版本对照诊断面 (character-reinterpretation-versions.js)
     * ============================================================ */
    function _characterReinterpretationLib() {
        if (_libs._characterReinterpretationLib) return _libs._characterReinterpretationLib.apply(null, arguments);
        const mod = (typeof window !== 'undefined' ? window.LonShaCharacterReinterpretation : null);
        if (mod) return mod;
        if (typeof require !== 'undefined') {
            try { return require('./character-reinterpretation-versions.js'); } catch (_) {}
        }
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCharacterReinterpretation : null), 'character-reinterpretation-versions.js');
    }

    /**
     * 读取认知改观账本状态（只读，不写盘）
     */
    function characterReinterpretationState(engine, opts) {
        const absent = (why) => ({
            kind: 'character_reinterpretation', version: 0, state: 'unavailable',
            ledgers: [], counts: { totalLedgers: 0, totalVersions: 0, accepted: 0, draft: 0, superseded: 0, rejected: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const CR = _characterReinterpretationLib();
            if (!CR || typeof CR.createReinterpretationLedger !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawLedgers = [];
            if (Array.isArray(o.ledgers)) rawLedgers = o.ledgers;
            else if (o.ledger && typeof o.ledger === 'object') rawLedgers = [o.ledger];
            else if (engine && Array.isArray(engine._reinterpretationLedgers)) rawLedgers = engine._reinterpretationLedgers;
            else if (engine && engine._reinterpretationLedger && typeof engine._reinterpretationLedger === 'object') rawLedgers = [engine._reinterpretationLedger];

            if (!rawLedgers.length) {
                return {
                    kind: 'character_reinterpretation', version: 1, state: 'no-ledgers',
                    ledgers: [], counts: { totalLedgers: 0, totalVersions: 0, accepted: 0, draft: 0, superseded: 0, rejected: 0 },
                    writesNothing: true, ok: true, reason: 'no-ledgers'
                };
            }

            let totalVersions = 0;
            let accepted = 0;
            let draft = 0;
            let superseded = 0;
            let rejected = 0;
            const ledgerSummaries = rawLedgers.map(l => {
                const vers = Array.isArray(l.versions) ? l.versions : [];
                totalVersions += vers.length;
                vers.forEach(v => {
                    if (v.status === CR.INTERPRETATION_STATUS.ACCEPTED) accepted++;
                    else if (v.status === CR.INTERPRETATION_STATUS.DRAFT) draft++;
                    else if (v.status === CR.INTERPRETATION_STATUS.SUPERSEDED) superseded++;
                    else if (v.status === CR.INTERPRETATION_STATUS.REJECTED) rejected++;
                });
                const active = vers.find(v => v.versionId === l.activeVersionId) || null;
                const initial = vers.find(v => v.versionNumber === 1) || null;
                return {
                    characterId: l.characterId,
                    targetEntityId: l.targetEntityId,
                    factSummary: l.originalEventRef?.canonicalFactSummary || '',
                    activeVersionId: l.activeVersionId,
                    activeText: active?.interpretationText || '',
                    initialText: initial?.interpretationText || '',
                    versionCount: vers.length,
                    versions: vers
                };
            });

            const out = {
                kind: 'character_reinterpretation', version: 1,
                state: 'ok',
                ledgers: ledgerSummaries,
                counts: {
                    totalLedgers: ledgerSummaries.length,
                    totalVersions,
                    accepted,
                    draft,
                    superseded,
                    rejected
                },
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._characterReinterpretationRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.characterReinterpretationState'); return absent('thrown'); }
    }

    function _characterReinterpretationLine(engine) {
        try {
            const cached = (engine && engine._characterReinterpretationRead && typeof engine._characterReinterpretationRead === 'object')
                ? engine._characterReinterpretationRead : characterReinterpretationState(engine, {});
            if (!cached || cached.ok !== true) {
                return '认知改观版本：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-ledgers') return '认知改观版本：尚未登记改观账本（不是「面没装上」）';
            const c = cached.counts || {};
            return `认知改观版本：账本 ${c.totalLedgers || 0} 本 · 解释 ${c.totalVersions || 0} 版（采纳 ${c.accepted || 0} · 提议 ${c.draft || 0} · 归档 ${c.superseded || 0}）· 物理事实受保护`;
        } catch (e) { errLog(e, 'engine._characterReinterpretationLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X4]
     * 约定实例与生命周期诊断面 (commitment-instance-lifecycle.js)
     * ============================================================ */
    function _commitmentLifecycleLib() {
        if (_libs._commitmentLifecycleLib) return _libs._commitmentLifecycleLib.apply(null, arguments);
        const mod = (typeof window !== 'undefined' ? window.LonShaCommitmentInstanceLifecycle : null);
        if (mod) return mod;
        if (typeof require !== 'undefined') {
            try { return require('./commitment-instance-lifecycle.js'); } catch (_) {}
        }
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCommitmentInstanceLifecycle : null), 'commitment-instance-lifecycle.js');
    }

    /**
     * 读取约定实例生命周期状态（只读，不写盘）
     */
    function commitmentInstanceState(engine, opts) {
        const absent = (why) => ({
            kind: 'commitment_instance_lifecycle', version: 0, state: 'unavailable',
            instances: [], stigmas: [], counts: { total: 0, pending: 0, fulfilled: 0, partially_fulfilled: 0, waived: 0, postponed: 0, overdue: 0, ruptured: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const CL = _commitmentLifecycleLib();
            if (!CL || typeof CL.createCommitmentInstance !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawInstances = [];
            if (Array.isArray(o.instances)) rawInstances = o.instances;
            else if (o.instance && typeof o.instance === 'object') rawInstances = [o.instance];
            else if (engine && Array.isArray(engine._commitmentInstances)) rawInstances = engine._commitmentInstances;
            else if (engine && engine._commitmentInstance && typeof engine._commitmentInstance === 'object') rawInstances = [engine._commitmentInstance];

            let rawStigmas = [];
            if (Array.isArray(o.stigmas)) rawStigmas = o.stigmas;
            else if (engine && Array.isArray(engine._commitmentStigmas)) rawStigmas = engine._commitmentStigmas;

            if (!rawInstances.length && !rawStigmas.length) {
                return {
                    kind: 'commitment_instance_lifecycle', version: 1, state: 'no-instances',
                    instances: [], stigmas: [], counts: { total: 0, pending: 0, fulfilled: 0, partially_fulfilled: 0, waived: 0, postponed: 0, overdue: 0, ruptured: 0 },
                    writesNothing: true, ok: true, reason: 'no-instances'
                };
            }

            const counts = { total: rawInstances.length, pending: 0, fulfilled: 0, partially_fulfilled: 0, waived: 0, postponed: 0, overdue: 0, ruptured: 0 };
            const currentFloor = o.currentFloor != null ? o.currentFloor : (engine?.currentFloor || null);
            const currentTimestamp = o.currentTimestamp != null ? o.currentTimestamp : Date.now();

            const instanceRows = rawInstances.map(inst => {
                let effectiveStatus = inst.status;
                if (typeof CL.evaluateOverdue === 'function' && inst.status !== CL.INSTANCE_STATUS.RUPTURED) {
                    const evalRes = CL.evaluateOverdue(inst, currentFloor, currentTimestamp);
                    if (evalRes && evalRes.isOverdue) effectiveStatus = CL.INSTANCE_STATUS.OVERDUE;
                }
                if (counts[effectiveStatus] != null) counts[effectiveStatus]++;
                return {
                    instanceId: inst.instanceId,
                    commitmentId: inst.commitmentId,
                    actor: inst.actor,
                    counterpart: inst.counterpart,
                    content: inst.content,
                    sequence: inst.sequence,
                    dueFloor: inst.dueFloor,
                    dueTimestamp: inst.dueTimestamp,
                    status: effectiveStatus,
                    completionRatio: inst.completionRatio || 0,
                    ruptureReason: inst.ruptureReason || '',
                    receiptCount: Array.isArray(inst.receipts) ? inst.receipts.length : 0
                };
            });

            const out = {
                kind: 'commitment_instance_lifecycle', version: 1,
                state: 'ok',
                instances: instanceRows,
                counts: counts,
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._commitmentInstanceRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.commitmentInstanceState'); return absent('thrown'); }
    }

    function _commitmentInstanceLine(engine) {
        try {
            const cached = (engine && engine._commitmentInstanceRead && typeof engine._commitmentInstanceRead === 'object')
                ? engine._commitmentInstanceRead : commitmentInstanceState(engine, {});
            if (!cached || cached.ok !== true) {
                return '约定履约周期：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-instances') return '约定履约周期：尚未登记单次履约实例（不是「面没装上」）';
            const c = cached.counts || {};
            const rupTag = (c.ruptured && c.ruptured > 0) ? ` · 💔 决裂烙印 ${c.ruptured}` : '';
            return `约定履约周期：实例 ${c.total || 0} 项（待办 ${c.pending || 0} · 逾期 ${c.overdue || 0} · 部分 ${c.partially_fulfilled || 0} · 豁免 ${c.waived || 0} · 履约 ${c.fulfilled || 0}${rupTag}）`;
        } catch (e) { errLog(e, 'engine._commitmentInstanceLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X5]
     * 资料换版结论重构诊断面 (lore-version-conclusion-reconcile.js)
     * ============================================================ */
    function _loreConclusionReconcileLib() {
        if (_libs._loreConclusionReconcileLib) return _libs._loreConclusionReconcileLib.apply(null, arguments);
        const mod = (typeof window !== 'undefined' ? window.LonShaLoreVersionConclusionReconcile : null);
        if (mod) return mod;
        if (typeof require !== 'undefined') {
            try { return require('./lore-version-conclusion-reconcile.js'); } catch (_) {}
        }
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaLoreVersionConclusionReconcile : null), 'lore-version-conclusion-reconcile.js');
    }

    /**
     * 读取资料换版结论对照状态（只读，不写盘）
     */
    function loreConclusionState(engine, opts) {
        const absent = (why) => ({
            kind: 'lore_conclusion_reconcile', version: 0, state: 'unavailable',
            docId: '', olderVersion: '', newerVersion: '',
            diff: [], conclusions: [], counts: { total: 0, fresh: 0, stale: 0, accepted: 0, kept_original: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const LR = _loreConclusionReconcileLib();
            if (!LR || typeof LR.diffLoreSections !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            const oldSecs = Array.isArray(o.oldSections) ? o.oldSections : (engine && Array.isArray(engine._loreOldSections) ? engine._loreOldSections : []);
            const newSecs = Array.isArray(o.newSections) ? o.newSections : (engine && Array.isArray(engine._loreNewSections) ? engine._loreNewSections : []);
            const existingConcs = Array.isArray(o.conclusions) ? o.conclusions : (engine && Array.isArray(engine._loreConclusions) ? engine._loreConclusions : []);

            if (!oldSecs.length && !newSecs.length) {
                return {
                    kind: 'lore_conclusion_reconcile', version: 1, state: 'no-docs',
                    docId: String(o.docId || (engine && engine._loreDocId) || ''),
                    olderVersion: String(o.olderVersion || ''),
                    newerVersion: String(o.newerVersion || ''),
                    diff: [], conclusions: [], counts: { total: 0, fresh: 0, stale: 0, accepted: 0, kept_original: 0 },
                    writesNothing: true, ok: false, reason: 'no-docs'
                };
            }

            const diff = LR.diffLoreSections(oldSecs, newSecs);
            const reconciled = LR.reconcileConclusionsWithDiff(diff, existingConcs);

            const counts = {
                total: reconciled.length,
                fresh: reconciled.filter(c => c.status === LR.CONCLUSION_REVIEW_STATUS.FRESH).length,
                stale: reconciled.filter(c => c.status === LR.CONCLUSION_REVIEW_STATUS.STALE).length,
                accepted: reconciled.filter(c => c.status === LR.CONCLUSION_REVIEW_STATUS.ACCEPTED).length,
                kept_original: reconciled.filter(c => c.status === LR.CONCLUSION_REVIEW_STATUS.KEPT_ORIGINAL).length
            };

            const out = {
                kind: 'lore_conclusion_reconcile', version: 1,
                state: 'ok',
                docId: String(o.docId || (engine && engine._loreDocId) || 'lore_doc'),
                olderVersion: String(o.olderVersion || 'v1'),
                newerVersion: String(o.newerVersion || 'v2'),
                diff: diff,
                conclusions: reconciled,
                counts: counts,
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._loreConclusionRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.loreConclusionState'); return absent('thrown'); }
    }

    function _loreConclusionLine(engine) {
        try {
            const cached = (engine && engine._loreConclusionRead && typeof engine._loreConclusionRead === 'object')
                ? engine._loreConclusionRead : loreConclusionState(engine, {});
            if (!cached || cached.ok !== true) {
                if (cached && cached.state === 'no-docs') return '设定换版更新：尚未提供旧版/新版段落（不是「面没装上」）';
                return '设定换版更新：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            const c = cached.counts || {};
            return `设定换版更新：段落差异 ${cached.diff?.length || 0} 项 · 结论 ${c.total || 0} 条（有效 ${c.fresh || 0} · 待复核 ${c.stale || 0} · 采纳 ${c.accepted || 0} · 保留原版 ${c.kept_original || 0}）`;
        } catch (e) { errLog(e, 'engine._loreConclusionLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X7]
     * 关系修复回应诊断面 (relationship-repair-response.js)
     * ============================================================ */
    function _repairResponseLib() {
        if (_libs._repairResponseLib) return _libs._repairResponseLib.apply(null, arguments);
        if (typeof window !== 'undefined' && window.LonShaRelationshipRepairResponse) return window.LonShaRelationshipRepairResponse;
        if (typeof LonShaRelationshipRepairResponse !== 'undefined') return LonShaRelationshipRepairResponse;
        try { return require('./relationship-repair-response.js'); } catch (e) { return null; }
    }
    function repairResponseState(engine, opts) {
        const absent = (why) => ({
            kind: 'relationship_repair_response', version: 0, state: 'unavailable',
            records: [], counts: { totalRecords: 0, responded: 0, awaiting: 0, demonstrated: 0, broken: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const Resp = _repairResponseLib();
            if (!Resp || typeof Resp.createRepairResponseRecord !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawRecords = [];
            if (Array.isArray(o.records)) rawRecords = o.records;
            else if (o.record && typeof o.record === 'object') rawRecords = [o.record];
            else if (engine && Array.isArray(engine._repairRecords)) rawRecords = engine._repairRecords;
            else if (engine && engine._repairRecord && typeof engine._repairRecord === 'object') rawRecords = [engine._repairRecord];

            if (!rawRecords.length) {
                return {
                    kind: 'relationship_repair_response', version: 1, state: 'no-records',
                    records: [], counts: { totalRecords: 0, responded: 0, awaiting: 0, demonstrated: 0, broken: 0 },
                    writesNothing: true, ok: true, reason: 'no-records'
                };
            }

            let responded = 0;
            let awaiting = 0;
            let demonstrated = 0;
            let broken = 0;

            const recordSummaries = rawRecords.map(rec => {
                const prog = Resp.computeProgress(rec);
                if (rec.state === 'responded') responded++;
                else awaiting++;
                if (prog.progress === 'demonstrated') demonstrated++;
                else if (prog.progress === 'broken') broken++;
                return {
                    proposalId: rec.proposalId,
                    state: rec.state,
                    progress: prog.progress,
                    progressLabel: prog.progressLabel,
                    asksTotal: prog.asksTotal,
                    asksKept: prog.asksKept,
                    asksBroken: prog.asksBroken,
                    oldEventsCleared: prog.oldEventsCleared
                };
            });

            const out = {
                kind: 'relationship_repair_response', version: 1,
                state: 'ok',
                records: recordSummaries,
                counts: {
                    totalRecords: rawRecords.length,
                    responded,
                    awaiting,
                    demonstrated,
                    broken
                },
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._repairResponseRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.repairResponseState'); return absent('thrown'); }
    }
    function _repairResponseLine(engine) {
        try {
            const cached = (engine && engine._repairResponseRead && typeof engine._repairResponseRead === 'object')
                ? engine._repairResponseRead : repairResponseState(engine, {});
            if (!cached || cached.ok !== true) {
                return '修复回应：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-records') return '修复回应：尚未登记修复回应记录（不是「面没装上」）';
            const c = cached.counts || {};
            return `修复回应：提议 ${c.totalRecords || 0} 案（已回应 ${c.responded || 0} · 等待中 ${c.awaiting || 0}）· 履约证实 ${c.demonstrated || 0} · 违背 ${c.broken || 0} · 旧事不予抹除`;
        } catch (e) { errLog(e, 'engine._repairResponseLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X8]
     * 跨代交接草案诊断面 (era-handoff-draft.js)
     * ============================================================ */
    function _eraHandoffDraftLib() {
        if (_libs._eraHandoffDraftLib) return _libs._eraHandoffDraftLib.apply(null, arguments);
        if (typeof window !== 'undefined' && window.LonShaEraHandoffDraft) return window.LonShaEraHandoffDraft;
        if (typeof LonShaEraHandoffDraft !== 'undefined') return LonShaEraHandoffDraft;
        try { return require('./era-handoff-draft.js'); } catch (e) { return null; }
    }
    function eraHandoffDraftState(engine, opts) {
        const absent = (why) => ({
            kind: 'era_handoff_draft', version: 0, state: 'unavailable',
            drafts: [], counts: { totalDrafts: 0, itemsAssigned: 0, heirsCount: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const Handoff = _eraHandoffDraftLib();
            if (!Handoff || typeof Handoff.createHandoffDraft !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawDrafts = [];
            if (Array.isArray(o.drafts)) rawDrafts = o.drafts;
            else if (o.draft && typeof o.draft === 'object') rawDrafts = [o.draft];
            else if (engine && Array.isArray(engine._handoffDrafts)) rawDrafts = engine._handoffDrafts;
            else if (engine && engine._handoffDraft && typeof engine._handoffDraft === 'object') rawDrafts = [engine._handoffDraft];

            if (!rawDrafts.length) {
                return {
                    kind: 'era_handoff_draft', version: 1, state: 'no-drafts',
                    drafts: [], counts: { totalDrafts: 0, itemsAssigned: 0, heirsCount: 0 },
                    writesNothing: true, ok: true, reason: 'no-drafts'
                };
            }

            let itemsAssigned = 0;
            const heirSet = new Set();
            const draftSummaries = rawDrafts.map(d => {
                const assigned = d.assignedItems || {};
                const keys = Object.keys(assigned);
                itemsAssigned += keys.length;
                keys.forEach(k => {
                    const it = assigned[k];
                    if (it && it.heirId) heirSet.add(it.heirId);
                });
                return {
                    eraTransitionId: d.eraTransitionId,
                    assignedCount: keys.length,
                    heirs: Array.from(heirSet)
                };
            });

            const out = {
                kind: 'era_handoff_draft', version: 1,
                state: 'ok',
                drafts: draftSummaries,
                counts: {
                    totalDrafts: rawDrafts.length,
                    itemsAssigned,
                    heirsCount: heirSet.size
                },
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._eraHandoffDraftRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.eraHandoffDraftState'); return absent('thrown'); }
    }
    function _eraHandoffDraftLine(engine) {
        try {
            const cached = (engine && engine._eraHandoffDraftRead && typeof engine._eraHandoffDraftRead === 'object')
                ? engine._eraHandoffDraftRead : eraHandoffDraftState(engine, {});
            if (!cached || cached.ok !== true) {
                return '跨代交接：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-drafts') return '跨代交接：尚未登记跨代交接草案（不是「面没装上」）';
            const c = cached.counts || {};
            return `跨代交接：草案 ${c.totalDrafts || 0} 份 · 分配遗留 ${c.itemsAssigned || 0} 件 · 继承人 ${c.heirsCount || 0} 位 · 秘密边界与原正文隔离`;
        } catch (e) { errLog(e, 'engine._eraHandoffDraftLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X9]
     * 记忆回访日程诊断面 (memory-revisit-schedule.js)
     * ============================================================ */
    function _revisitScheduleLib() {
        if (_libs._revisitScheduleLib) return _libs._revisitScheduleLib.apply(null, arguments);
        if (typeof window !== 'undefined' && window.LonShaMemoryRevisitSchedule) return window.LonShaMemoryRevisitSchedule;
        if (typeof LonShaMemoryRevisitSchedule !== 'undefined') return LonShaMemoryRevisitSchedule;
        try { return require('./memory-revisit-schedule.js'); } catch (e) { return null; }
    }
    function revisitScheduleState(engine, opts) {
        const absent = (why) => ({
            kind: 'memory_revisit_schedule', version: 0, state: 'unavailable',
            sessions: [], counts: { totalSessions: 0, scheduledCards: 0, receipts: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const Revisit = _revisitScheduleLib();
            if (!Revisit || typeof Revisit.createRevisitSession !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawSessions = [];
            if (Array.isArray(o.sessions)) rawSessions = o.sessions;
            else if (o.session && typeof o.session === 'object') rawSessions = [o.session];
            else if (engine && Array.isArray(engine._revisitSessions)) rawSessions = engine._revisitSessions;
            else if (engine && engine._revisitSession && typeof engine._revisitSession === 'object') rawSessions = [engine._revisitSession];

            if (!rawSessions.length) {
                return {
                    kind: 'memory_revisit_schedule', version: 1, state: 'no-sessions',
                    sessions: [], counts: { totalSessions: 0, scheduledCards: 0, receipts: 0 },
                    writesNothing: true, ok: true, reason: 'no-sessions'
                };
            }

            let scheduledCards = 0;
            let receipts = 0;
            const sessionSummaries = rawSessions.map(s => {
                const seq = Array.isArray(s.sequence) ? s.sequence : [];
                const rec = Array.isArray(s.receipts) ? s.receipts : [];
                scheduledCards += seq.length;
                receipts += rec.length;
                return {
                    sessionId: s.sessionId || s.id || '',
                    sequenceCount: seq.length,
                    receiptCount: rec.length
                };
            });

            const out = {
                kind: 'memory_revisit_schedule', version: 1,
                state: 'ok',
                sessions: sessionSummaries,
                counts: {
                    totalSessions: rawSessions.length,
                    scheduledCards,
                    receipts
                },
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._revisitScheduleRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.revisitScheduleState'); return absent('thrown'); }
    }
    function _revisitScheduleLine(engine) {
        try {
            const cached = (engine && engine._revisitScheduleRead && typeof engine._revisitScheduleRead === 'object')
                ? engine._revisitScheduleRead : revisitScheduleState(engine, {});
            if (!cached || cached.ok !== true) {
                return '回访日程：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-sessions') return '回访日程：尚未登记回访日程会话（不是「面没装上」）';
            const c = cached.counts || {};
            return `回访日程：会话 ${c.totalSessions || 0} 场 · 待回访 ${c.scheduledCards || 0} 张 · 回执 ${c.receipts || 0} 笔 · 凭真证据不捏造事实`;
        } catch (e) { errLog(e, 'engine._revisitScheduleLine'); return '—（诊断异常）'; }
    }

    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X2]
     * 往事讲述比对与逐段对照诊断面 (past-event-narration-compare.js)
     * ============================================================ */
    /* ============================================================
     * [v3.446.0 · 具身现场快照与在场三态权限诊断面]
     * scene-state-tracker.js & presence-routing-guard.js
     * ============================================================ */
    function _sceneTrackerLib() {
        if (_libs._sceneTrackerLib) return _libs._sceneTrackerLib.apply(null, arguments);
        if (typeof window !== 'undefined' && window.LonShaSceneStateTracker) return window.LonShaSceneStateTracker;
        if (typeof LonShaSceneStateTracker !== 'undefined') return LonShaSceneStateTracker;
        try { return require('./scene-state-tracker.js'); } catch (e) { return null; }
    }
    function _presenceGuardLib() {
        if (_libs._presenceGuardLib) return _libs._presenceGuardLib.apply(null, arguments);
        if (typeof window !== 'undefined' && window.LonShaPresenceRoutingGuard) return window.LonShaPresenceRoutingGuard;
        if (typeof LonShaPresenceRoutingGuard !== 'undefined') return LonShaPresenceRoutingGuard;
        try { return require('./presence-routing-guard.js'); } catch (e) { return null; }
    }
    function sceneStateTrackerState(engine, opts) {
        const absent = (why) => ({
            kind: 'scene_state_tracker', version: 0, state: 'unavailable',
            scene: null, presence: null,
            writesNothing: true, ok: false, reason: why
        });
        try {
            const Tracker = _sceneTrackerLib();
            const Guard = _presenceGuardLib();
            if (!Tracker || !Guard) return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            const curScene = (o.scene && typeof o.scene === 'object')
                ? o.scene
                : ((engine && engine._sceneState && typeof engine._sceneState === 'object')
                    ? engine._sceneState
                    : ((engine && engine.scene && typeof engine.scene.getSnapshot === 'function' && engine.scene.getSnapshot())
                        ? engine.scene.getSnapshot()
                        : Tracker.createDefaultSceneState()));
            const inScene = curScene.inSceneCharacters;
            let presenceMode = 'unknown-tri-state';
            if (inScene === undefined) presenceMode = 'undefined-unrestricted';
            else if (Array.isArray(inScene) && inScene.length === 0) presenceMode = 'empty-deserted';
            else if (Array.isArray(inScene)) presenceMode = 'active-cast';
            return {
                kind: 'scene_state_tracker',
                version: 1,
                state: 'ok',
                scene: curScene,
                presenceMode,
                inSceneCharacters: inScene,
                location: curScene.location || '',
                action: curScene.action || '',
                tension: curScene.tension || '',
                persistedAt: curScene.persistedAt || 0,
                isPersisted: !!(curScene.persistedAt && curScene.persistedAt > 0),
                writesNothing: true,
                ok: true
            };
        } catch (e) {
            errLog(e, 'engine.sceneStateTrackerState');
            return absent('thrown');
        }
    }
    function _sceneStateTrackerLine(engine) {
        try {
            const cached = sceneStateTrackerState(engine, {});
            if (!cached || cached.ok !== true) {
                return '现场即时快照：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            const s = cached.scene || {};
            const chars = cached.inSceneCharacters === undefined
                ? '默认全开'
                : (cached.inSceneCharacters.length === 0 ? '全员离场无人' : cached.inSceneCharacters.join('、'));
            const loc = s.location || '未知地点';
            const act = s.action ? ` · 动作: ${s.action}` : '';
            const persistTag = cached.isPersisted ? ' · 已落盘' : ' · 待落盘';
            // [v3.449.0 · L15-O4 & L15-X6] 弹性预算与地点禁忌标记
            const tens = s.tension ? ` · 张力: ${s.tension}` : '';
            return `现场快照：${loc}（在场: ${chars}）${act}${tens}${persistTag} · 独立防穿透弹性硬预算保护`;
        } catch (e) {
            errLog(e, 'engine._sceneStateTrackerLine');
            return '—（诊断异常）';
        }
    }
    /* ============================================================
     * [v3.448.0 · 第十四期 L14-X1]
     * 消息转告链诊断面 (knowledge-relay-chain.js)
     * ============================================================ */
    function _knowledgeRelayLib() {
        if (_libs._knowledgeRelayLib) return _libs._knowledgeRelayLib.apply(null, arguments);
        if (typeof window !== 'undefined' && window.LonShaKnowledgeRelayChain) return window.LonShaKnowledgeRelayChain;
        if (typeof LonShaKnowledgeRelayChain !== 'undefined') return LonShaKnowledgeRelayChain;
        try { return require('./knowledge-relay-chain.js'); } catch (e) { return null; }
    }
    /**
     * 读取消息转告链状态（只读，不写盘）
     */
    function knowledgeRelayState(engine, opts) {
        const absent = (why) => ({
            kind: 'knowledge_relay_chain', version: 0, state: 'unavailable',
            chains: [], counts: { totalChains: 0, totalHops: 0, activeHops: 0, retractedHops: 0, distinctCharacters: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const Relay = _knowledgeRelayLib();
            if (!Relay || typeof Relay.createRelayChain !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawChains = [];
            if (Array.isArray(o.chains)) rawChains = o.chains;
            else if (o.chain && typeof o.chain === 'object') rawChains = [o.chain];
            else if (engine && Array.isArray(engine._relayChains)) rawChains = engine._relayChains;
            else if (engine && engine._relayChain && typeof engine._relayChain === 'object') rawChains = [engine._relayChain];

            if (!rawChains.length) {
                return {
                    kind: 'knowledge_relay_chain', version: 1, state: 'no-chains',
                    chains: [], counts: { totalChains: 0, totalHops: 0, activeHops: 0, retractedHops: 0, distinctCharacters: 0 },
                    writesNothing: true, ok: true, reason: 'no-chains'
                };
            }

            let totalHops = 0;
            let activeHops = 0;
            let retractedHops = 0;
            const characterSet = new Set();

            const chainSummaries = rawChains.map(ch => {
                const hops = Array.isArray(ch.hops) ? ch.hops : [];
                totalHops += hops.length;
                let cActive = 0;
                let cRetracted = 0;
                hops.forEach(h => {
                    if (h.to) characterSet.add(h.to);
                    if (h.from) characterSet.add(h.from);
                    if (h.status === 'retracted') {
                        retractedHops++;
                        cRetracted++;
                    } else {
                        activeHops++;
                        cActive++;
                    }
                });
                return {
                    factId: ch.factId || '',
                    originSpeaker: ch.originSpeaker || '',
                    rootFloor: ch.rootFloor || 0,
                    hopCount: hops.length,
                    activeHops: cActive,
                    retractedHops: cRetracted,
                    characters: Array.from(new Set(hops.map(h => h.to).filter(Boolean)))
                };
            });

            const out = {
                kind: 'knowledge_relay_chain', version: 1,
                state: 'ok',
                chains: chainSummaries,
                counts: {
                    totalChains: rawChains.length,
                    totalHops,
                    activeHops,
                    retractedHops,
                    distinctCharacters: characterSet.size
                },
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._relayChainRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.knowledgeRelayState'); return absent('thrown'); }
    }
    function _knowledgeRelayLine(engine) {
        try {
            const cached = (engine && engine._relayChainRead && typeof engine._relayChainRead === 'object')
                ? engine._relayChainRead : knowledgeRelayState(engine, {});
            if (!cached || cached.ok !== true) {
                return '消息转告链：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-chains') return '消息转告链：尚未登记消息转告链（不是「面没装上」）';
            const c = cached.counts || {};
            return `消息转告链：事实 ${c.totalChains || 0} 条 · 传导 ${c.totalHops || 0} 跃（生效 ${c.activeHops || 0} · 撤回 ${c.retractedHops || 0}）· 知情角色 ${c.distinctCharacters || 0} 位 · 严防时间穿越`;
        } catch (e) { errLog(e, 'engine._knowledgeRelayLine'); return '—（诊断异常）'; }
    }
    function _narrationCompareLib() {
        if (_libs._narrationCompareLib) return _libs._narrationCompareLib.apply(null, arguments);
        const mod = (typeof window !== 'undefined' ? window.LonShaPastEventNarrationCompare : null);
        if (mod) return mod;
        if (typeof require !== 'undefined') {
            try { return require('./past-event-narration-compare.js'); } catch (_) {}
        }
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaPastEventNarrationCompare : null), 'past-event-narration-compare.js');
    }

    /**
     * 读取往事讲述多方对照状态（只读，不写盘）
     */
    function narrationCompareState(engine, opts) {
        const absent = (why) => ({
            kind: 'past_event_narration_compare', version: 0, state: 'unavailable',
            sessions: [], counts: { totalSessions: 0, totalNarrations: 0, totalSegments: 0, concordant: 0, disputed: 0, evasive: 0, unsubstantiated: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const NC = _narrationCompareLib();
            if (!NC || typeof NC.createNarrationCompareSession !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            let rawSessions = [];
            if (Array.isArray(o.sessions)) rawSessions = o.sessions;
            else if (o.session && typeof o.session === 'object') rawSessions = [o.session];
            else if (engine && Array.isArray(engine._narrationSessions)) rawSessions = engine._narrationSessions;
            else if (engine && engine._narrationSession && typeof engine._narrationSession === 'object') rawSessions = [engine._narrationSession];

            if (!rawSessions.length) {
                return {
                    kind: 'past_event_narration_compare', version: 1, state: 'no-sessions',
                    sessions: [], counts: { totalSessions: 0, totalNarrations: 0, totalSegments: 0, concordant: 0, disputed: 0, evasive: 0, unsubstantiated: 0 },
                    writesNothing: true, ok: true, reason: 'no-sessions'
                };
            }

            let totalNarrations = 0;
            let totalSegments = 0;
            let concordant = 0;
            let disputed = 0;
            let evasive = 0;
            let unsubstantiated = 0;

            const sessionSummaries = rawSessions.map(sess => {
                const narrs = Array.isArray(sess.narrations) ? sess.narrations : [];
                totalNarrations += narrs.length;
                narrs.forEach(n => {
                    const segs = Array.isArray(n.segments) ? n.segments : [];
                    totalSegments += segs.length;
                    segs.forEach(s => {
                        if (s.status === NC.SEGMENT_STATUS.CONCORDANT) concordant++;
                        else if (s.status === NC.SEGMENT_STATUS.DISPUTED) disputed++;
                        else if (s.status === NC.SEGMENT_STATUS.EVASIVE) evasive++;
                        else if (s.status === NC.SEGMENT_STATUS.UNSUBSTANTIATED) unsubstantiated++;
                    });
                });
                return {
                    eventId: sess.eventId,
                    title: sess.title || '',
                    canonicalCount: Array.isArray(sess.canonicalEvidence) ? sess.canonicalEvidence.length : 0,
                    narrationCount: narrs.length,
                    speakers: narrs.map(n => n.speaker),
                    hasDispute: sess.segmentsDiff ? sess.segmentsDiff.some(d => d.hasDispute) : false
                };
            });

            const out = {
                kind: 'past_event_narration_compare', version: 1,
                state: 'ok',
                sessions: sessionSummaries,
                counts: {
                    totalSessions: rawSessions.length,
                    totalNarrations,
                    totalSegments,
                    concordant,
                    disputed,
                    evasive,
                    unsubstantiated
                },
                writesNothing: true,
                ok: true,
                reason: ''
            };
            if (engine && typeof engine === 'object') engine._narrationCompareRead = out;
            return out;
        } catch (e) { errLog(e, 'engine.narrationCompareState'); return absent('thrown'); }
    }

    function _narrationCompareLine(engine) {
        try {
            const cached = (engine && engine._narrationCompareRead && typeof engine._narrationCompareRead === 'object')
                ? engine._narrationCompareRead : narrationCompareState(engine, {});
            if (!cached || cached.ok !== true) {
                return '往事讲述对照：不可用 · ' + ((cached && cached.reason) || 'module-unavailable');
            }
            if (cached.state === 'no-sessions') return '往事讲述对照：尚未登记多方讲述对照会话（不是「面没装上」）';
            const c = cached.counts || {};
            return `往事讲述对照：会话 ${c.totalSessions || 0} 场 · 讲述 ${c.totalNarrations || 0} 篇 · 差异句 ${c.totalSegments || 0} 段（分歧 ${c.disputed || 0} · 回避 ${c.evasive || 0} · 臆测 ${c.unsubstantiated || 0}）· 物理正史受保护`;
        } catch (e) { errLog(e, 'engine._narrationCompareLine'); return '—（诊断异常）'; }
    }

    function _silenceListLine(engine) {
        try {
            const cached = (engine && engine._silenceListRead && typeof engine._silenceListRead === 'object')
                ? engine._silenceListRead : null;
            const r = cached || silenceListState(engine, {});
            if (!r || r.ok !== true) return '静音清单：不可用 · ' + ((r && r.reason) || 'module-unavailable');
            const c = r.counts || {};
            if (!c.total) return '静音清单：当前没有静音（本轮 0 / 持久 0）';
            return `静音清单：本轮 ${c.ctx || 0} · 持久 ${c.season || 0}（共 ${c.total || 0}）`;
        } catch (e) { errLog(e, 'engine._silenceListLine'); return '—（诊断异常）'; }
    }


    /* ===============================================================
     * [v3.432.0 · L13-X1] 记忆沿革回放：一条记忆是怎么变成现在这样的
     * =============================================================== */
    function memoryLineageReplay(engine, opts) {
        const absent = (why) => ({
            kind: 'memory_lineage', itemId: '', itemFound: false,
            lineage: [], currentState: null,
            summary: { totalSteps: 0, creates: 0, updates: 0, verdicts: 0, revokes: 0, unavailableCount: 0 },
            writesNothing: true, ok: false, reason: why
        });
        try {
            const MLR = _memoryLineageLib();
            if (!MLR || typeof MLR.buildMemoryLineage !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            const itemId = String(o.itemId || (typeof opts === 'string' ? opts : '')).trim();
            if (!itemId) return absent('item-id-required');
            const res = MLR.buildMemoryLineage(itemId, engine, o);
            if (engine) engine._memoryLineageLastRead = res;
            return res;
        } catch (e) {
            errLog(e, 'engine.memoryLineageReplay');
            return Object.assign(absent('thrown'), {});
        }
    }

    function _memoryLineageLine(engine) {
        try {
            const cached = engine && engine._memoryLineageLastRead;
            const r = cached || memoryLineageReplay(engine, {});
            if (!r || !r.ok) {
                const why = (r && r.reason) || 'no-item';
                return `【记忆沿革】暂无回放 (${why})`;
            }
            const s = r.summary || {};
            return `【记忆沿革】条目 ${r.itemId} · ${s.totalSteps || 0} 节 (建 ${s.creates || 0} / 改 ${s.updates || 0} / 裁 ${s.verdicts || 0} / 撤 ${s.revokes || 0})`
                + (s.unavailableCount ? ` · 缺失 ${s.unavailableCount} 节` : ' · 完整');
        } catch (e) {
            return '【记忆沿革】不可用 (thrown)';
        }
    }

    
/* ===============================================================
     * [v3.433.0 · L13-X2] 反事实推演面：如果它没发生，谁会被波及
     * =============================================================== */
    function counterfactualWhatIf(engine, opts) {
        const absent = (why) => ({
            kind: 'counterfactual_whatif', ok: false, reason: why,
            hypothetical: true, writesNothing: true,
            factId: '', matchedFact: null, terms: [], affected: [],
            poolsScanned: 0, scannedCount: 0,
            layers: { FACT_BOUND: 0, PLAUSIBLE_DEDUCTION: 0, FREE_PERFORMANCE: 0 }
        });
        try {
            const CB = _counterfactualBenchLib();
            if (!CB || typeof CB.counterfactualImpact !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            const res = CB.counterfactualImpact(o, { engine });
            if (engine) engine._counterfactualLastRead = res;
            return res;
        } catch (e) {
            errLog(e, 'engine.counterfactualWhatIf');
            return absent('thrown: ' + ((e && e.message) || e));
        }
    }

    function _counterfactualLine(engine) {
        try {
            const cached = engine && engine._counterfactualLastRead;
            const r = cached || counterfactualWhatIf(engine, {});
            if (!r || !r.ok) {
                return `【反事实推演】未选定推演锚点 (${(r && r.reason) || 'no-anchor'})`;
            }
            const L = r.layers || {};
            return `【反事实推演】锚点 ${r.factId || '(描述式)'} · 受影响 ${r.affected.length} 条`
                + ` (铁律 ${L.FACT_BOUND || 0} / 推演 ${L.PLAUSIBLE_DEDUCTION || 0})`
                + ' · 全部为 hypothetical，未写回任何槽位';
        } catch (e) {
            return '【反事实推演】不可用 (thrown)';
        }
    }

    /* ===============================================================
     * [v3.439.0 · L13-X3] 视角投影面：用这个角色的眼睛看这一轮
     * ---------------------------------------------------------------
     * 【宿主只做三件事，绞不自己算】
     *   ① **装配**：从既有三账原样取数（pov / secretLedger / knowledgeTraces），一个字段都不改；
     *   ② **转发**：把 opts 原样交给内核，**不改写返回值**；
     *   ③ **留痕**：只留读数摘要（存整份投影 = 第二份知识库）。
     *
     * 【为什么三账要在这里取、而不是让内核去 engine 上找】
     *   内核是零依赖纯函数（要能被单独 require、也要能在测试面与 CDN 加载面同形）；
     *   一旦它开始认 `engine.worldProg.secretLedger` 这种宿主路径，它就不再是纯函数了。
     *   故「取数」这一层必须留在宿主 —— 这也是全仓十来个投影面的同一条分工线。
     *
     * 【缺席面与在场面**逐字同键**】
     *   缺席时返回的形状与在场面逐字同键。同一份字面量在这里写两遍是有意的：
     *   它是**契约**，不是可以互相引用的实现 —— 判据 A3 会逐键比对两边。
     */
    function povProject(engine, opts) {
        const absent = (why) => ({
            kind: 'pov_projection', version: 0, viewer: '', viewerKnown: false,
            at: null, atKnown: false,
            tiers: { knows: [], suspects: [], believes: [], blind: [], undecided: [] },
            counts: { knows: 0, suspects: 0, believes: 0, blind: 0, undecided: 0, total: 0, viewers: 0, masked: 0, input: { povs: 0, secrets: 0, traces: 0 }, malformed: 0, offTime: 0, noFloor: 0, truncated: 0 },
            viewers: [], writesNothing: true, degraded: false, notes: [],
            ok: false, reason: why
        });
        try {
            const PP = _povProjectionLib();
            if (!PP || typeof PP.project !== 'function') return absent('module-unavailable');
            const o = (opts && typeof opts === 'object') ? opts : {};
            const wp = engine && engine.worldProg;
            const secretLedger = wp && wp.secretLedger ? wp.secretLedger : null;
            const knowledgeTraces = wp && wp.knowledgeTraces ? wp.knowledgeTraces : null;
            const povExport = (engine && engine.pov && typeof engine.pov.export === 'function') ? engine.pov.export() : null;
            const src = {
                povs: povExport || [],
                secrets: secretLedger || { items: [] },
                traces: knowledgeTraces || { traces: [] },
                /* 显式名单（可选）：面板可以把「当前登场角色」传进来，
                 *   这样即使三账里一条都没提他，他也会出现在可选视角里。 */
                characters: Array.isArray(o.characters) ? o.characters : []
            };
            const res = PP.project(src, o);
            const out = Object.assign({}, res, { ok: true, reason: res && res.degraded ? 'degraded' : '' });
            if (engine) engine._povProjectionLastRead = out;
            return out;
        } catch (e) {
            errLog(e, 'engine.povProject');
            return absent('thrown: ' + ((e && e.message) || e));
        }
    }
    /* 诊断行：**只一行、不给正文**（盲档的正文连诊断行都不许过 —— 诊断行会进注入与 oplog）。 */
    function _povProjectionLine(engine) {
        try {
            const PP = _povProjectionLib();
            if (!PP || typeof PP.line !== 'function') return '模块未加载（pov-projection.js）';
            const cached = engine && engine._povProjectionLastRead;
            const r = cached || povProject(engine, {});
            if (r && r.ok === false && r.reason === 'module-unavailable') return '模块未加载（pov-projection.js）';
            if (r && r.ok === false) return `【视角投影】不可用 (${r.reason || 'unknown'})`;
            return PP.line(r);
        } catch (e) { errLog(e, 'engine._povProjectionLine'); return '—（诊断异常）'; }
    }
    /* [v3.450.0 · L15-X3] 视角冲突记忆并列对照诊断行 */
    function _perspectiveDiscrepancyLine(engine) {
        try {
            const oral = engine?._activeOralDiscrepancy || engine?._oralConflict;
            if (!oral || !oral.hasConflict) return '【视角冲突并列】无活跃争议事件';
            return `【视角冲突并列】活跃争议《${oral.title || '焦点冲突'}》(${oral.perspectiveCount || 2}方陈述并列，禁止折中)`;
        } catch (e) {
            errLog(e, 'engine._perspectiveDiscrepancyLine');
            return '—（诊断异常）';
        }
    }
    /* [v3.451.0 · L15-X2] 自传第一人称心路重述诊断行 */
    function _autobiographicalRestatementLine(engine) {
        try {
            const restatements = engine?._activeRestatements;
            if (!restatements || !restatements.length) return '【自传心路重述】当前为客观事实视角';
            return `【自传心路重述】活跃重述 ${restatements.length} 条 (首述角色: ${restatements[0].narrator}, 滤镜: ${restatements[0].subjectiveBias})`;
        } catch (e) {
            errLog(e, 'engine._autobiographicalRestatementLine');
            return '—（自传重述诊断异常）';
        }
    }
    /* [v3.454.0 · L16-O1] 仿生认知边界四桶动态过滤与防全知封口诊断行 */
    function _cognitiveHorizonLine(engine) {
        try {
            const stats = engine?._lastCognitiveStats;
            if (!stats) return '【防全知视界】未激活过滤或空上下文';
            return `【防全知视界】共裁决${stats.total}条 (亲历:${stats.direct} | 共历:${stats.shared} | 传闻:${stats.rumor} | 禁区阻断:${stats.embargoed})`;
        } catch (e) {
            errLog(e, 'engine._cognitiveHorizonLine');
            return '—（防全知诊断异常）';
        }
    }

    /* [v3.455.0 · V17] 仿生记忆共振巩固与多跳推演诊断行（真实读数，非静态文案） */
    function _resonanceConsolidationLine(engine) {
        try {
            const r = engine?._lastResonanceStats;
            const f = engine?._lastResonanceReinforce;
            const st = engine?._resonanceState;
            if (!r && !f) return '【记忆共振巩固】未激活（本轮无召回/注入）';
            const a = r ? (r.active
                ? `激活${r.seedsFed || 0}种子·${r.edgesFed || 0}边 → 扩散命中${r.energyHits || 0}·提权${r.boostApplied || 0}条`
                : `召回侧未激活(${r.reason || '-'})`) : '召回侧未跑';
            const b = f ? (f.active
                ? `本轮真实强化${f.touched || 0}条` : `注入侧未激活(${f.reason || '-'})`) : '注入侧未跑';
            return `【记忆共振巩固】${a} · ${b} · 累计访问${st?.totalAccess || 0}次/${st?.rounds || 0}轮`;
        } catch (e) {
            errLog(e, 'engine._resonanceConsolidationLine');
            return '—（共振巩固诊断异常）';
        }
    }

    /* [v3.456.0 · V18] 分层折叠金字塔与整合去重演化诊断行（真实读数） */
    function _pyramidEvolutionLine(engine) {
        try {
            const st = engine?._pyramidEvolutionState;
            const sl = engine?._lastSleepStats;
            if (!st && !sl) return '【分层演化金字塔】未激活（本轮未触发折叠/睡眠）';
            const links = st?.evolutionLinksCount || 0;
            const archived = st?.archivedByEvolution || 0;
            const sleepArch = sl?.archived || 0;
            const sleepEvo = sl?.evolvedArchived || 0;
            return `【分层演化金字塔】演化关联边${links}条 · 演化加速休眠${archived}条 · 最近睡眠周期归档${sleepArch}条(演化加速${sleepEvo}条)`;
        } catch (e) {
            errLog(e, 'engine._pyramidEvolutionLine');
            return '—（分层演化诊断异常）';
        }
    }

    /* [v3.457.0 · V19 记忆专版 & v3.458.0 · V20 史诗级双计划] 全域记忆交响编排、防混淆、心理防御与自愈免疫诊断行（真实读数） */
    function _memorySymphonyLine(engine) {
        try {
            const tr = engine?._lastSymphonyTrace;
            const st = engine?._antiConfusionState;
            const psychSt = engine?._psychologicalDefenseState;
            const immSt = engine?._memoryHealingImmunityState;
            if (!tr && !st) return '【全域记忆交响】未激活（未执行全域编排）';
            if (tr?.active === false) return `【全域记忆交响】已跳过（原因：${tr.reason || '未启用'}）`;
            const disCount = st?.disambiguatedCount || tr?.disambiguatedCount || 0;
            const confCount = st?.conflictResolvedCount || tr?.resolvedConflicts || 0;
            const inCount = tr?.inputCount || 0;
            const outCount = tr?.outputCount || 0;
            const psychCount = psychSt?.totalDefensesTriggered || 0;
            const immCount = immSt?.totalInoculations || 0;
            const fwQuarantine = tr?.stages?.counterfactualFirewall?.quarantinedCount || 0;
            return `【全域记忆交响·V20】输入${inCount}条 → 经心理/因果/消歧编排输出${outCount}条 · 实体锚定${disCount} · 互斥仲裁${confCount} · 心理防御${psychCount} · 免疫接种${immCount} · 沙盒隔离${fwQuarantine}`;
        } catch (e) {
            errLog(e, 'engine._memorySymphonyLine');
            return '—（全域记忆交响诊断异常）';
        }
    }
    /* [v3.460.0 · V21 史诗级双计划] 深层心智与玩家体验全景诊断行（通俗直观，零生僻词） */
    function _v21EpicDiagnosticsLine(engine) {
        try {
            const waSt = engine?._worldaxisAssimilatorState;
            const dreamSt = engine?._ruminationDreamState;
            const riskSt = engine?._exposureRiskState;
            const burnSt = engine?._burnoutDecayState;
            const waShots = waSt?.ingestedSnapshots || (waSt?.snapshots ? waSt.snapshots.length : 0);
            const dreams = dreamSt?.totalDreamsWoven || (dreamSt?.history ? dreamSt.history.length : 0);
            const risks = riskSt ? (riskSt.covertIdentities ? (riskSt.covertIdentities instanceof Map ? riskSt.covertIdentities.size : Object.keys(riskSt.covertIdentities).length) : (riskSt.characterRisks ? Object.keys(riskSt.characterRisks).length : 0)) : 0;
            const burns = burnSt ? (burnSt.actorResilience ? (burnSt.actorResilience instanceof Map ? burnSt.actorResilience.size : Object.keys(burnSt.actorResilience).length) : (burnSt.burnoutProfiles ? Object.keys(burnSt.burnoutProfiles).length : 0)) : 0;
            return `【深层心智状态】外界感知${waShots}次 · 夜晚梦境${dreams}场 · 身份掩护${risks}人 · 心理状态${burns}人平稳`;
        } catch (e) {
            errLog(e, 'engine._v21EpicDiagnosticsLine');
            return '—（心智状态检测暂不可用）';
        }
    }

        /* 登记：公开名进 api，私有名进共享隐藏面（跨片仍然可达，但不扩大 api 面） */
        api.silenceExplainState = silenceExplainState;
        api.silenceExplainAct = silenceExplainAct;
        api._silenceExplainLine = _silenceExplainLine;
        api.silenceListState = silenceListState;
        api.silenceLift = silenceLift;
        api.roundSnapshotBefore = roundSnapshotBefore;
        api.roundSnapshotAfter = roundSnapshotAfter;
        api.roundUndoState = roundUndoState;
        api.roundUndo = roundUndo;
        api._roundUndoLine = _roundUndoLine;
        api.inheritanceRosterState = inheritanceRosterState;
        api.inheritanceDeclare = inheritanceDeclare;
        api.inheritanceRevokeDeclare = inheritanceRevokeDeclare;
        api._inheritanceRosterLine = _inheritanceRosterLine;
        api.seatingPartitionState = seatingPartitionState;
        api._seatingPartitionLine = _seatingPartitionLine;
        api.characterReinterpretationState = characterReinterpretationState;
        api._characterReinterpretationLine = _characterReinterpretationLine;
        api.commitmentInstanceState = commitmentInstanceState;
        api._commitmentInstanceLine = _commitmentInstanceLine;
        api.loreConclusionState = loreConclusionState;
        api._loreConclusionLine = _loreConclusionLine;
        api.repairResponseState = repairResponseState;
        api._repairResponseLine = _repairResponseLine;
        api.eraHandoffDraftState = eraHandoffDraftState;
        api._eraHandoffDraftLine = _eraHandoffDraftLine;
        api.revisitScheduleState = revisitScheduleState;
        api._revisitScheduleLine = _revisitScheduleLine;
        api.sceneStateTrackerState = sceneStateTrackerState;
        api._sceneStateTrackerLine = _sceneStateTrackerLine;
        api.knowledgeRelayState = knowledgeRelayState;
        api._knowledgeRelayLine = _knowledgeRelayLine;
        api.narrationCompareState = narrationCompareState;
        api._narrationCompareLine = _narrationCompareLine;
        api._silenceListLine = _silenceListLine;
        api.memoryLineageReplay = memoryLineageReplay;
        api._memoryLineageLine = _memoryLineageLine;
        api.counterfactualWhatIf = counterfactualWhatIf;
        api._counterfactualLine = _counterfactualLine;
        api.povProject = povProject;
        api._povProjectionLine = _povProjectionLine;
        api._perspectiveDiscrepancyLine = _perspectiveDiscrepancyLine;
        api._autobiographicalRestatementLine = _autobiographicalRestatementLine;
        api._cognitiveHorizonLine = _cognitiveHorizonLine;
        api._resonanceConsolidationLine = _resonanceConsolidationLine;
        api._pyramidEvolutionLine = _pyramidEvolutionLine;
        api._memorySymphonyLine = _memorySymphonyLine;
        api._v21EpicDiagnosticsLine = _v21EpicDiagnosticsLine;
        S.hidden.DeferredOrTrimmed = DeferredOrTrimmed;
        S.hidden._inheritanceSecretLookup = _inheritanceSecretLookup;
        S.hidden._seatingPartitionLib = _seatingPartitionLib;
        S.hidden._characterReinterpretationLib = _characterReinterpretationLib;
        S.hidden._commitmentLifecycleLib = _commitmentLifecycleLib;
        S.hidden._loreConclusionReconcileLib = _loreConclusionReconcileLib;
        S.hidden._repairResponseLib = _repairResponseLib;
        S.hidden._eraHandoffDraftLib = _eraHandoffDraftLib;
        S.hidden._revisitScheduleLib = _revisitScheduleLib;
        S.hidden._sceneTrackerLib = _sceneTrackerLib;
        S.hidden._presenceGuardLib = _presenceGuardLib;
        S.hidden._knowledgeRelayLib = _knowledgeRelayLib;
        S.hidden._narrationCompareLib = _narrationCompareLib;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = install;
    var _reg = global.LonShaDiagParts = global.LonShaDiagParts || [];
    /* 登记：**总是**登记，不去重 —— 同进程里判据会先装破坏版、再装原版，
     *   去重会把「最后一次装载」挡在外面，装配面就一直用旧的。由装配面按 id 取最后一次。 */
    install.__partId = 'c';
    _reg.push(install);
})(typeof window !== 'undefined' ? window : globalThis);
