// [v3.364.0] engine-qa-tools.js: 从 index.js 剥离的记忆问答与工具面查询出口集群
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineQaTools = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let _ml = null;
    let _errLog = (e, ctx) => { try { console.error('[LonShaQaTools]', ctx, e); } catch (_) {} };
    let _libs = {};

    function bindDeps(deps) {
        if (deps) {
            if (typeof deps.moduleLib === 'function') _ml = deps.moduleLib;
            if (typeof deps.errLog === 'function') _errLog = deps.errLog;
            if (deps.libs && typeof deps.libs === 'object') _libs = deps.libs;
        }
    }

    function _moduleLib(getGlobal, fileName) {
        if (typeof _ml === 'function') return _ml(getGlobal, fileName);
        try {
            if (typeof getGlobal === 'function') {
                const g = getGlobal();
                if (g) return g;
            }
            if (typeof require === 'function' && fileName) {
                return require('./' + fileName);
            }
        } catch (_) {}
        return null;
    }

    function errLog(e, ctx) {
        if (typeof _errLog === 'function') _errLog(e, ctx);
    }

    function _evidenceQueryLib() {
        if (_libs._evidenceQueryLib) return _libs._evidenceQueryLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaEvidenceQuery : null), 'evidence-query.js');
    }
    function _evidenceQueryLedgersOf(engine) {
        if (_libs._evidenceQueryLedgersOf) return _libs._evidenceQueryLedgersOf(engine);
        if (engine && typeof engine._evidenceQueryLedgersOf === 'function') return engine._evidenceQueryLedgersOf();
        return null;
    }
    function _qaHelpDeps(engine) {
        if (_libs._qaHelpDeps) return _libs._qaHelpDeps(engine);
        if (engine && typeof engine._qaHelpDeps === 'function') return engine._qaHelpDeps();
        return null;
    }
    function _ledgerApis() {
        if (_libs._ledgerApis) return _libs._ledgerApis();
        return null;
    }
    function _qaThreadLib() {
        if (_libs._qaThreadLib) return _libs._qaThreadLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaQaThread : null), 'qa-thread.js');
    }
    function _memoryToolsLib() {
        if (_libs._memoryToolsLib) return _libs._memoryToolsLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaMemoryTools : null), 'memory-tools-api.js');
    }
    function _experienceRebuildLib() {
        if (_libs._experienceRebuildLib) return _libs._experienceRebuildLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaExperienceRebuild : null), 'experience-rebuild.js');
    }
    function _dualTimeLib() {
        if (_libs._dualTimeLib) return _libs._dualTimeLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaDualTime : null), 'dual-time.js');
    }
    function _evidenceSolverLib() {
        if (_libs._evidenceSolverLib) return _libs._evidenceSolverLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaEvidenceSolver : null), 'evidence-solver.js');
    }
    function _resolutionLadderLib() {
        if (_libs._resolutionLadderLib) return _libs._resolutionLadderLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaResolutionLadder : null), 'resolution-ladder.js');
    }
    function _sceneOrchestratorLib() {
        if (_libs._sceneOrchestratorLib) return _libs._sceneOrchestratorLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSceneOrchestrator : null), 'scene-orchestrator.js');
    }
    function _impactPreviewLib() {
        if (_libs._impactPreviewLib) return _libs._impactPreviewLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaImpactPreview : null), 'impact-preview.js');
    }
    function _hypothesisWorkspaceLib() {
        if (_libs._hypothesisWorkspaceLib) return _libs._hypothesisWorkspaceLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaHypothesisWorkspace : null), 'hypothesis-workspace.js');
    }
    function _researchCollectionLib() {
        if (_libs._researchCollectionLib) return _libs._researchCollectionLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaResearchCollection : null), 'research-collection.js');
    }

    function _qaActorAliases(engine) {

            const out = {};
            let n = 0;
            const known = new Set(engine._qaKnownActors(0));
            const put = (alias, canon) => {
                const a = String(alias == null ? '' : alias).trim();
                const c = String(canon == null ? '' : canon).trim();
                if (!a || !c || a === c || n >= 200) return;
                if (!known.has(c)) return;
                if (Object.prototype.hasOwnProperty.call(out, a)) return;
                out[a] = c;
                n += 1;
            };
            try {
                const nodes = (engine.graph && engine.graph.nodes && typeof engine.graph.nodes.values === 'function')
                    ? engine.graph.nodes.values() : null;
                if (nodes) {
                    for (const nd of nodes) {
                        if (!nd || nd.type !== 'character') continue;
                        const canon = String(nd.name == null ? '' : nd.name).trim();
                        const al = (nd.data && Array.isArray(nd.data.aliases)) ? nd.data.aliases : [];
                        for (const a of al) put(a, canon);
                    }
                }
            } catch (_e) { /* 单来源失败不阻断:别名表是窄面,不是关键链路 */ }
            return out;
        
    }

    function _qaKnownActors(engine, limit) {

            const out = [];
            const cap = Math.max(1, Math.min(500, Number(limit) > 0 ? Math.floor(Number(limit)) : 200));
            const push = (n) => {
                const t = String(n == null ? '' : n).trim();
                if (t && out.indexOf(t) < 0 && out.length < cap) out.push(t);
            };
            try {
                if (engine._entityIdByName && typeof engine._entityIdByName.keys === 'function') {
                    for (const k of engine._entityIdByName.keys()) push(k);
                }
            } catch (_e) { /* 单来源失败不阻断另一来源 */ }
            try {
                const nodes = (engine.graph && engine.graph.nodes && typeof engine.graph.nodes.values === 'function')
                    ? engine.graph.nodes.values() : null;
                if (nodes) for (const n of nodes) { if (n && n.type === 'character') push(n.name); }
            } catch (_e) { /* 同上 */ }
            return out;
        
    }

    function askMemoryQuestion(engine, question, opts) {

            const o = opts || {};
            const qText = String(question == null ? '' : question);
            /* [v3.322.0] 恒定键面：`knownActors` 在**缺席路径上也须在场**。
             *   修前缺席回执缺这一格（15 键 → 14 键）⇒ 下游 `r.knownActors.length`
             *   当场 TypeError，而登记表逐字声明的是恒定键面。
             *   这里给的是**真读数**：人名装配点不依赖 `evidence-query.js`，
             *   故「模块未加载」不等于「一个已知人名都没有」（缺席不当 0 用）。
             *   整段就地 try：装配点万一抛错也不得把「模块没加载」改写成别的归因。 */
            const absent = (reason) => {
                let known = 0;
                try {
                    known = (Array.isArray(o.knownActors) ? o.knownActors : engine._qaKnownActors(o.maxActors)).length;
                } catch (_e) { known = 0; }
                return {
                    version: 0, question: qText, intents: [], actor: null,
                    actors: [], topics: [], timeHints: [], relation: null,
                    answer: [], gaps: [{ kind: 'module', why: reason }], refs: [], plans: [],
                    masked: 0, truncated: false, resourced: 0, total: 0,
                    /* [v3.331.0 - M4-O3] same keys as the present path, verbatim
                     * (constant key face is what lets downstream assert by key). */
                    readings: 0, covered: 0, dropped: 0, dedup: 0,
                    events: [], keyPoints: 0, explain: null,
                    knownActors: known, reason: reason, writesNothing: true
                };
            };
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function') {
                return absent('模块未加载（evidence-query.js）');
            }
            try {
                const known = Array.isArray(o.knownActors) ? o.knownActors : engine._qaKnownActors(o.maxActors);
                /* [v3.330.0 · M4-O2] 别名表由宿主装配(单一装配点),内核仍**不猜**:
                 *   宿主给不出的别名不参与识别 —— 给了就按别名认并记 via。 */
                const plan = Q.planQuestion(qText, { knownActors: known, actorAliases: engine._qaActorAliases() });
                const ledgers = _evidenceQueryLedgersOf();
                const payload = {
                    ledgers: ledgers,
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    pageSize: (Number(o.pageSize) > 0 ? Math.floor(Number(o.pageSize)) : 30)
                };
                if (o.maxPerLedger !== undefined) payload.maxPerLedger = o.maxPerLedger;
                /* 逐条计划跑**既有** query（同一份 matchRow / 同一份 assemble）——
                 *   不另写一条「问答专用查询」。计划条数由规划器定（未知意图兜底一条）。 */
                const results = [];
                const planReadings = [];
                for (const p of plan.plans) {
                    const r = Q.query(this, p.spec, payload);
                    results.push({ id: p.id, spec: p.spec, query: r });
                    /* 只留读数，不留 rows（见档头「不扩权」）。 */
                    planReadings.push({
                        id: p.id, why: p.why, spec: p.spec,
                        total: (r && typeof r.total === 'number') ? r.total : 0,
                        state: (r && r.state) || 'unknown',
                        scanned: (r && r.scanned) || 0,
                        replayKey: (r && r.replayKey) || ''
                    });
                }
                /* [v3.331.0 - M4-O3] confirmed edges + the bridge across the
                 * two key spaces. Without the bridge an edge could never land,
                 * and that silence must not be read as "no cause". */
                let causal = { edges: [], keyOf: null };
                try {
                    if (typeof engine._qaCausalEdges === 'function') causal = engine._qaCausalEdges();
                } catch (_e) { causal = { edges: [], keyOf: null }; }
                const composed = Q.composeAnswer(plan, results, {
                    maxSentences: o.maxSentences,
                    causalEdges: causal.edges,
                    causalKeyOf: causal.keyOf
                });
                 /* [v3.322.0] **读侧缺口**（本仓最贵的那一格：「跑了、扫了、没命中」与
                  *   「根本没读到东西」不得同形）。
                  *   修前 `no-rows` 的 why 是一句模板：「扫描面为空：九账全部取不到（扫了 0 行）」
                  *   —— 而当本问**只扫了一本账**时，这句话本身就是错的读数
                  *   （既不是「九账」、也不是「全部取不到」），下游据此会把「问答没答出」
                  *   误判成「记忆库不可用」。
                  *   修法：按**本问真实的扫描面**逐本具名 —— 未参与的账分成
                  *   「空账（读了、没有）」与「读不到（没读到）」两档，各自点数并点名。
                  *   ★ 不新造缺口种类：`no-rows` 的语义本就含「扫描面为空」这一格。 */
                 try {
                     const skippedIds = [];
                     for (const rr of results) {
                         const cov = (rr && rr.query) ? rr.query.coverage : null;
                         const ids = (cov && Array.isArray(cov.skippedByLedgerFilter)) ? cov.skippedByLedgerFilter : [];
                         for (const id of ids) if (skippedIds.indexOf(id) < 0) skippedIds.push(id);
                     }
                     if (skippedIds.length) {
                         const ledgersNow = _qaHelpDeps.call(this);
                         const emptyIds = [];
                         const absentIds = [];
                         for (const id of skippedIds) {
                             if (ledgersNow[id] === 'empty') emptyIds.push(id);
                             else absentIds.push(id);
                         }
                         const why = '本问只扫被点名的账，另有 ' + skippedIds.length + ' 本未参与'
                             + '（未参与不等于「没有」）：其中空账 ' + emptyIds.length + ' 本'
                             + (emptyIds.length ? '（' + emptyIds.join('、') + '）' : '')
                             + '、读不到 ' + absentIds.length + ' 本'
                             + (absentIds.length ? '（' + absentIds.join('、') + '）' : '');
                         let hit = null;
                         for (const g of composed.gaps) if (g && g.kind === 'no-rows') { hit = g; break; }
                         if (hit) hit.why = (hit.why || '') + '；' + why;
                         else composed.gaps.push({ kind: 'no-rows', why: why });
                     }
                 } catch (_e) { /* 缺口照会面不得因读数失败而整体翻红（缺口的缺口另行治理） */ }
                /* 最近一次读数：诊断行据此说「上次问了几句、几处缺口」。
                 *   只留读数（计划数 / 句数 / 缺口数），不留问句正文也不留答案 ——
                 *   诊断面是面自述，不是第二个答案库。 */
                engine._memoryQaLast = {
                    at: Date.now(),
                    intents: composed.intents, actor: plan.actor,
                    plans: planReadings.length,
                    total: composed.total, resourced: composed.resourced,
                    masked: composed.masked, gaps: composed.gaps.length,
                    /* [v3.330.0 · M4-O2] 关系读数进「上次」:诊断行据此说共现几条。 */
                    relation: (composed.relation && composed.relation.state) ? composed.relation.state : '',
                    relationCommon: (composed.relation && composed.relation.common) || 0,
                    /* [v3.331.0 - M4-O3] the causal verdict belongs to the last
                     * reading: "sequence" and "cause" must not look alike. */
                    causal: (composed.explain && composed.explain.causal) ? composed.explain.causal : '',
                    causalSource: (composed.explain && composed.explain.causalSource) ? composed.explain.causalSource : '',
                    readings: composed.readings || 0,
                    events: (composed.events || []).length
                };
                return {
                    version: Q.QA_VERSION || 0,
                    question: composed.question, intents: composed.intents, actor: plan.actor,
                    /* [v3.330.0 · M4-O2] 规划侧新读数逐格外送(**不是**在宿主里再算一份):
                     *   actors = 问句里认出的全部人名(多人物);topics = 保留下来的主题词;
                     *   timeHints = 问句里的相对时点(本面**不**折算成楼层)。 */
                    actors: Array.isArray(plan.actors) ? plan.actors : [],
                    topics: Array.isArray(plan.topics) ? plan.topics : [],
                    timeHints: Array.isArray(plan.timeHints) ? plan.timeHints : [],
                    relation: composed.relation || null,
                    answer: composed.answer, gaps: composed.gaps, refs: composed.refs,
                    plans: planReadings,
                    masked: composed.masked, truncated: composed.truncated,
                    resourced: composed.resourced, total: composed.total,
                    /* [v3.331.0 - M4-O3] explanation surface, forwarded as-is.
                     *   `readings`/`covered` keep coverage lines apart from the
                     *   sentence count; `explain.causal` keeps "sequence" from
                     *   ever reading as "cause". */
                    readings: composed.readings || 0,
                    covered: composed.covered || 0,
                    dropped: composed.dropped || 0,
                    dedup: composed.dedup || 0,
                    events: composed.events || [],
                    keyPoints: composed.keyPoints || 0,
                    /* [v3.332.0 · M4-O4] 同步版独有读数格(行文与异步出口区分,
                     *   同 topics 行:两个出口同键面即可,不必逐行复刻行文)。 */
                    explain: composed.explain || null,
                    knownActors: known.length,
                    reason: '', writesNothing: true
                };
            } catch (e) {
                errLog(e, 'plugin.askMemoryQuestion');
                return absent('thrown');
            }
        
    }

    async function askMemoryQuestionAsync(engine, question, opts) {

            const o = opts || {};
            const qText = String(question == null ? '' : question);
            const taskId = (o.taskId === undefined || o.taskId === null) ? '' : String(o.taskId);
            /* 与同步版同一份缺席回执口径(恒定键面 + async 面四键)。 */
            const absent = (reason) => {
                let known = 0;
                try {
                    known = (Array.isArray(o.knownActors) ? o.knownActors : engine._qaKnownActors(o.maxActors)).length;
                } catch (_e) { known = 0; }
                return {
                    version: 0, question: qText, intents: [], actor: null,
                    actors: [], topics: [], timeHints: [], relation: null,
                    answer: [], gaps: [{ kind: 'module', why: reason }], refs: [], plans: [],
                    masked: 0, truncated: false, resourced: 0, total: 0,
                    readings: 0, covered: 0, dropped: 0, dedup: 0,
                    events: [], keyPoints: 0, explain: null,
                    knownActors: known, reason: reason, writesNothing: true,
                    async: true, taskId: taskId, state: 'absent', processed: null
                };
            };
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function'
                || typeof Q.queryAsync !== 'function') {
                return absent('模块未加载（evidence-query.js 或 queryAsync 不在场）');
            }
            let canceled = false;
            const shouldCancel = (typeof o.shouldCancel === 'function')
                ? (() => { const v = o.shouldCancel(); if (v === true) canceled = true; return v; })
                : null;
            const onProgress = (typeof o.onProgress === 'function') ? o.onProgress : null;
            const emitProgress = (plan, plans, rows, totalRows) => {
                if (!onProgress) return;
                try { onProgress({ plan: plan, plans: plans, rows: rows, totalRows: totalRows }); }
                catch (_e) { /* 进度回调抛错不阻断查询(读数面,不是关键链路) */ }
            };
            try {
                const known = Array.isArray(o.knownActors) ? o.knownActors : engine._qaKnownActors(o.maxActors);
                const plan = Q.planQuestion(qText, { knownActors: known, actorAliases: engine._qaActorAliases() });
                const ledgers = _evidenceQueryLedgersOf();
                const payload = {
                    ledgers: ledgers,
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    pageSize: (Number(o.pageSize) > 0 ? Math.floor(Number(o.pageSize)) : 30)
                };
                if (o.maxPerLedger !== undefined) payload.maxPerLedger = o.maxPerLedger;
                if (Number(o.shardRows) > 0) payload.shardRows = Math.floor(Number(o.shardRows));
                /* 逐条计划走 queryAsync:同一份判定,片间让出 + 取消检查 + 进度上报。 */
                const results = [];
                const planReadings = [];
                const plansTotal = Array.isArray(plan.plans) ? plan.plans.length : 0;
                for (let pi = 0; pi < plansTotal; pi += 1) {
                    const p = plan.plans[pi];
                    const r = await Q.queryAsync(this, p.spec, Object.assign({}, payload, {
                        shouldCancel: shouldCancel,
                        onShard: (rows, totalRows) => emitProgress(pi, plansTotal, rows, totalRows)
                    }));
                    results.push({ id: p.id, spec: p.spec, query: r });
                    planReadings.push({
                        id: p.id, why: p.why, spec: p.spec,
                        total: (r && typeof r.total === 'number') ? r.total : 0,
                        state: (r && r.state) || 'unknown',
                        scanned: (r && r.scanned) || 0,
                        replayKey: (r && r.replayKey) || ''
                    });
                    if (canceled) break; /* 取消后不再起下一条计划(已跑的读数如实保留) */
                }
                let causal = { edges: [], keyOf: null };
                try {
                    /* [v3.332.0 · M4-O4] 行文与同步出口刻意不同形(括号分组):
                     *   同键面即可,锚点判据靠行文区分归属。 */
                    if (typeof (this && engine._qaCausalEdges) === 'function') causal = engine._qaCausalEdges();
                } catch (_e) { causal = { edges: [], keyOf: null }; }
                const composed = Q.composeAnswer(plan, results, {
                    maxSentences: o.maxSentences,
                    causalEdges: causal.edges,
                    causalKeyOf: causal.keyOf
                });
                /* 取消态:答案面是已处理部分。gap 里点名,不当「查完了没有」。 */
                if (canceled) {
                    composed.gaps.push({ kind: 'canceled', why: '查询被取消:以下读数是已处理部分,不是全量结论' });
                }
                engine._memoryQaLast = {
                    at: Date.now(),
                    intents: composed.intents, actor: plan.actor,
                    plans: planReadings.length,
                    total: composed.total, resourced: composed.resourced,
                    masked: composed.masked, gaps: composed.gaps.length,
                    relation: (composed.relation && composed.relation.state) ? composed.relation.state : '',
                    relationCommon: (composed.relation && composed.relation.common) || 0,
                    causal: (composed.explain && composed.explain.causal) ? composed.explain.causal : '',
                    causalSource: (composed.explain && composed.explain.causalSource) ? composed.explain.causalSource : '',
                    readings: composed.readings || 0,
                    events: (composed.events || []).length
                };
                return {
                    version: Q.QA_VERSION || 0,
                    question: composed.question, intents: composed.intents, actor: plan.actor,
                    actors: Array.isArray(plan.actors) ? plan.actors : [],
                    /* [v3.332.0 · M4-O4] 行文与同步出口刻意不同形(括号分组):
                     *   两个出口同键面即可,锚点判据靠行文区分归属。 */
                    topics: Array.isArray((plan && plan.topics)) ? plan.topics : [],
                    timeHints: Array.isArray((plan && plan.timeHints)) ? plan.timeHints : [],
                    relation: composed.relation || null,
                    answer: composed.answer, gaps: composed.gaps, refs: composed.refs,
                    plans: planReadings,
                    masked: composed.masked, truncated: composed.truncated,
                    resourced: composed.resourced, total: composed.total,
                    readings: composed.readings || 0,
                    covered: composed.covered || 0,
                    dropped: composed.dropped || 0,
                    dedup: composed.dedup || 0,
                    events: composed.events || [],
                    keyPoints: composed.keyPoints || 0,
                    /* [v3.332.0 · M4-O4] 行文与同步出口刻意不同形(括号分组):
                     *   同键面即可,锚点判据靠行文区分归属。 */
                    explain: (composed && composed.explain) || null,
                    knownActors: known.length,
                    reason: '', writesNothing: true,
                    async: true, taskId: taskId,
                    state: canceled ? 'canceled' : 'done',
                    processed: { plans: planReadings.length, plansTotal: plansTotal }
                };
            } catch (e) {
                errLog(e, 'plugin.askMemoryQuestionAsync');
                return absent('thrown');
            }
        
    }

    function memoryQaLine(engine) {

            try {
                const Q = _evidenceQueryLib();
                if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function') {
                    return '模块未加载（evidence-query.js）';
                }
                const names = engine._qaKnownActors(0);
                const last = engine._memoryQaLast || null;
                if (!last) return '待用（面在位 · 可认人名 ' + names.length + ' 个 · 未问过）';
                const bits = ['上次 ' + last.plans + ' 条计划 / ' + last.total + ' 句'];
                if (last.resourced) bits.push('可回源 ' + last.resourced);
                if (last.masked) bits.push('遮蔽 ' + last.masked);
                if (last.gaps) bits.push('缺口 ' + last.gaps);
                if (last.actor) bits.push('按人 ' + last.actor);
                else bits.push('未按人筛');
                /* [v3.330.0 · M4-O2] 关系读数单列:共现条数不是「查到几条」的一种说法。 */
                if (last.relation) bits.push('关系 ' + last.relation + ' 共现 ' + (last.relationCommon || 0));
                /* [v3.331.0 - M4-O3] coverage lines are not answers, and a
                 * "sequence" verdict is not a cause -- each gets its own slot. */
                if (last.readings) bits.push('覆盖面读数 ' + last.readings);
                if (last.events) bits.push('事件 ' + last.events);
                if (last.causal) bits.push('因果 ' + last.causal + (last.causalSource && last.causalSource !== 'no-source' ? '(' + last.causalSource + ')' : ''));
                return bits.join(' · ');
            } catch (e) { errLog(e, 'plugin.memoryQaLine'); return '—（诊断异常）'; }
        
    }

    function _qaThreadState(engine) {

            if (!engine._qaThread || typeof engine._qaThread !== 'object' || Array.isArray(engine._qaThread)) {
                engine._qaThread = {
                    version: 1, state: 'idle', chatKey: '', branchKey: '',
                    subjects: [], candidates: [], atFloor: null, atHint: '', timeOp: '',
                    compareAxis: '', scope: {}, turn: 0, trace: []
                };
            }
            return engine._qaThread;
        
    }

    function askMemoryQuestionFollowUp(engine, question, opts) {

            const o = opts || {};
            const qText = String(question == null ? '' : question);
            const QT = _qaThreadLib();
            const Q = _evidenceQueryLib();
            const blank = (reason) => ({
                version: 0, question: qText, intents: [], actor: null, actors: [], topics: [],
                timeHints: [], relation: null, answer: [], gaps: [{ kind: 'module', why: reason }],
                refs: [], plans: [], masked: 0, truncated: false, resourced: 0, total: 0,
                readings: 0, covered: 0, dropped: 0, dedup: 0, events: [], keyPoints: 0, explain: null,
                knownActors: 0, reason: reason, writesNothing: true,
                followUp: true, turn: 0, threadState: 'idle', inherit: [], condition: [],
                /* [v3.350.0 · R5-O9] 缺件降级时键面**必须与正常路径同形**：
                 *   少一个键会让调用方在降级时读到 undefined，而那与「清除没发生」
                 *   长得一样（本仓已登记的形态：缺件与空值不同形）。 */
                timeOp: '', timeOpLabel: '', cleared: [], clearAxes: (QT && QT.QT_CLEAR_AXES) ? QT.QT_CLEAR_AXES.slice() : [],
                awaiting: false, accepted: true, candidates: []
            });
            if (!Q || typeof Q.planQuestion !== 'function' || typeof Q.composeAnswer !== 'function') {
                return blank('模块未加载（evidence-query.js）');
            }
            if (!QT || typeof QT.advanceThread !== 'function') {
                return blank('模块未加载（qa-thread.js）');
            }
            try {
                const known = Array.isArray(o.knownActors) ? o.knownActors : engine._qaKnownActors(o.maxActors);
                const chatKey = (typeof engine.getCurrentChatId === 'function') ? String(engine.getCurrentChatId() || '') : '';
                const plan = Q.planQuestion(qText, { knownActors: known, actorAliases: engine._qaActorAliases() });
                const adv = QT.advanceThread(o.thread || engine._qaThreadState(), plan, {
                    question: qText, chatKey: chatKey,
                    branchKey: (o.branchKey === undefined || o.branchKey === null) ? '' : String(o.branchKey),
                    scope: o.scope,
                    /* [v3.350.0 · R5-O9] 条件清除下传（手机那一屏点名要撤掉哪一轴）。
                     *   原样透传数组，**不在宿主侧先过滤**：轴名合法性只有内核那张表说了算，
                     *   宿主再判一份就是第二个真源（判据实测抓过这类分叉）。 */
                    clear: Array.isArray(o.clear) ? o.clear.slice() : undefined
                });
                const thread = adv.thread;
                const base = {
                    followUp: true, turn: thread.turn, threadState: thread.state,
                    inherit: adv.inherit, condition: adv.condition,
                    /* [v3.350.0 · M5-O1] 时间操作随回执外送（方向与锚分列：同一个数字两种方向，
                     *   调用方据此可辨「截至当时」与「从此以后」）。 */
                    timeOp: thread.timeOp, timeOpLabel: (QT.QT_TIME_OP_LABEL || {})[thread.timeOp] || '',
                    /* [v3.350.0 · R5-O9] 清除读数随回执外送（做成了什么）+ 可清轴表
                     *   （手机侧照这张表给按钮，不另抄一份轴名清单）。 */
                    cleared: Array.isArray(adv.cleared) ? adv.cleared.slice() : [],
                    clearAxes: (QT.QT_CLEAR_AXES || []).slice(),
                    awaiting: adv.awaiting === true, accepted: adv.awaiting !== true,
                    candidates: Array.isArray(thread.candidates) ? thread.candidates.slice() : []
                };
                /* 消歧未决：**不跑查询**（跑了就是把「指代不定」伪装成「查过了」）。 */
                if (adv.awaiting === true) {
                    engine._qaThread = thread;
                    engine._memoryQaLast = {
                        at: Date.now(), intents: Array.isArray(plan.intents) ? plan.intents : [],
                        actor: null, plans: 0, total: 0, resourced: 0, masked: 0,
                        gaps: (adv.gaps || []).length, relation: '', relationCommon: 0,
                        causal: '', causalSource: '', readings: 0, events: 0,
                        threadState: thread.state, turn: thread.turn, awaiting: true,
                        threadInherit: adv.inherit, threadCondition: adv.condition
                    };
                    return Object.assign({
                        version: Q.QA_VERSION || 0, question: qText,
                        intents: Array.isArray(plan.intents) ? plan.intents : [], actor: null,
                        actors: Array.isArray(plan.actors) ? plan.actors.slice() : [],
                        topics: Array.isArray(plan.topics) ? plan.topics.slice() : [],
                        timeHints: Array.isArray(plan.timeHints) ? plan.timeHints : [], relation: null,
                        answer: [], gaps: (adv.gaps || []).slice(), refs: [], plans: [],
                        masked: 0, truncated: false, resourced: 0, total: 0,
                        readings: 0, covered: 0, dropped: 0, dedup: 0, events: [], keyPoints: 0, explain: null,
                        knownActors: known.length, reason: '', writesNothing: true
                    }, base);
                }
                /* 合并 spec：thread 的既有 FILTERS 键并进每条计划（不新增条件键）。
                 *   [v3.350.0 · M5-O1] 逐条把该子计划**已有**的 spec 交给内核 ⇒ 只填缺省：
                 *   多人比较时两条子计划各查一人，不再被线程主体一次盖成两人；
                 *   方向为 as-of（截至当时）时上界另走 `specEx.floorTo`（独立一格，不塞进本面键集合）。 */
                const ledgers = _evidenceQueryLedgersOf();
                const payload = {
                    ledgers: ledgers,
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    pageSize: (Number(o.pageSize) > 0 ? Math.floor(Number(o.pageSize)) : 30)
                };
                if (o.maxPerLedger !== undefined) payload.maxPerLedger = o.maxPerLedger;
                const results = [];
                const planReadings = [];
                for (const p of plan.plans) {
                    /* [v3.350.0 · M5-O1] 逐计划取片段：把该子计划**已有**的 spec 交给内核 ⇒ 只填缺省。
                     *   修前是「一次算好线程片段、盖在每条计划上」—— 多人比较时
                     *   「苏晴和林一怎么认识的」两条子计划各查一人，却被线程主体一次盖成两人，
                     *   于是「各查一人」退化成「两条查同一坨」(M5-O1 验收原文那一条)。 */
                    const ts = QT.threadSpec(thread, p.spec);
                    const spec = Object.assign({}, p.spec, ts.spec);
                    /* as-of（截至当时）的上界另走 `specEx.floorTo`：**独立一格**，
                     *   不往上面那行塞第二个键 —— 本面键集合仍是既有 FILTERS 键，口径一字不改。 */
                    if (ts.fromEx.length) Object.assign(spec, ts.specEx);
                    const r = Q.query(this, spec, payload);
                    results.push({ id: p.id, spec: spec, query: r });
                    planReadings.push({
                        id: p.id, why: p.why, spec: spec,
                        /* [v3.350.0 · M5-O1] 时间操作随每条计划回读（方向不落进 spec 键面，单独报）。 */
                        timeOp: ts.timeOp, timeOpLabel: ts.timeOpLabel,
                        specFrom: ts.from, specExFrom: ts.fromEx,
                        total: (r && typeof r.total === 'number') ? r.total : 0,
                        state: (r && r.state) || 'unknown',
                        scanned: (r && r.scanned) || 0,
                        replayKey: (r && r.replayKey) || ''
                    });
                }
                let causal = { edges: [], keyOf: null };
                try { if (typeof engine._qaCausalEdges === 'function') { causal = engine._qaCausalEdges(); } }
                catch (_e) { causal = { edges: [], keyOf: null }; }
                const composed = Q.composeAnswer(plan, results, {
                    maxSentences: o.maxSentences, causalEdges: causal.edges, causalKeyOf: causal.keyOf
                });
                /* 继承 / 新设 / 消歧缺口如实并进 gaps（不同形，不合成一格）。 */
                const gaps = (composed.gaps || []).concat(adv.gaps || []);
                engine._qaThread = thread;
                engine._memoryQaLast = {
                    at: Date.now(), intents: composed.intents, actor: plan.actor,
                    plans: planReadings.length, total: composed.total, resourced: composed.resourced,
                    masked: composed.masked, gaps: gaps.length,
                    relation: (composed.relation && composed.relation.state) ? composed.relation.state : '',
                    relationCommon: (composed.relation && composed.relation.common) || 0,
                    causal: (composed.explain && composed.explain.causal) ? composed.explain.causal : '',
                    causalSource: (composed.explain && composed.explain.causalSource) ? composed.explain.causalSource : '',
                    readings: composed.readings || 0, events: (composed.events || []).length,
                    threadState: thread.state, turn: thread.turn, awaiting: false,
                    threadInherit: adv.inherit, threadCondition: adv.condition
                };
                return Object.assign({
                    version: Q.QA_VERSION || 0, question: composed.question,
                    intents: composed.intents, actor: plan.actor,
                    actors: Array.isArray(plan.actors) ? plan.actors.slice() : [],
                    topics: Array.isArray(plan.topics) ? plan.topics.slice() : [],
                    timeHints: Array.isArray(plan.timeHints) ? plan.timeHints : [],
                    relation: composed.relation || null,
                    answer: composed.answer, gaps: gaps, refs: composed.refs,
                    plans: planReadings,
                    masked: composed.masked, truncated: composed.truncated,
                    resourced: composed.resourced, total: composed.total,
                    readings: composed.readings || 0, covered: composed.covered || 0,
                    dropped: composed.dropped || 0, dedup: composed.dedup || 0,
                    events: composed.events || [], keyPoints: composed.keyPoints || 0,
                    explain: (composed.explain || null),
                    knownActors: known.length, reason: '', writesNothing: true
                }, base);
            } catch (e) {
                errLog(e, 'plugin.askMemoryQuestionFollowUp');
                return blank('thrown');
            }
        
    }

    function qaThreadResolve(engine, picks, opts) {

            const o = opts || {};
            const QT = _qaThreadLib();
            if (!QT || typeof QT.resolveAmbiguity !== 'function') {
                return { ok: false, reason: 'module-unavailable', resolved: false, thread: null, chosen: [], unknown: [], writesNothing: true };
            }
            try {
                const res = QT.resolveAmbiguity(o.thread || engine._qaThreadState(), picks);
                if (res.resolved === true) engine._qaThread = res.thread;
                return Object.assign({ ok: res.resolved === true, reason: '' }, res);
            } catch (e) { errLog(e, 'plugin.qaThreadResolve'); return { ok: false, reason: 'thrown', resolved: false, thread: null, chosen: [], unknown: [], writesNothing: true }; }
        
    }

    function qaThread(engine) {

            try {
                const QT = _qaThreadLib();
                const raw = engine._qaThreadState();
                if (!QT || typeof QT.normalizeThread !== 'function') {
                    return { version: 0, state: 'idle', subjects: [], candidates: [], atFloor: null, atHint: '', compareAxis: '', branchKey: '', scope: {}, turn: 0, reason: 'module-unavailable', writesNothing: true };
                }
                const t = QT.normalizeThread(raw);
                return {
                    version: t.version, state: t.state, subjects: t.subjects.slice(),
                    candidates: t.candidates.slice(), atFloor: t.atFloor, atHint: t.atHint,
                    /* [v3.350.0 · M5-O1] 时间操作随读数外送（重开可查「这条追问按哪个方向查」）。 */
                    timeOp: t.timeOp, timeOpLabel: (QT.QT_TIME_OP_LABEL || {})[t.timeOp] || '',
                    /* [v3.350.0 · R5-O9] 清除读数与可清轴表也随 thread 读数外送（重开可查
                     *   「这一场清过哪些条件」；缺件降级路径同键）。 */
                    cleared: Array.isArray(t.cleared) ? t.cleared.slice() : [],
                    clearAxes: (QT && QT.QT_CLEAR_AXES) ? QT.QT_CLEAR_AXES.slice() : [],
                    compareAxis: t.compareAxis, branchKey: t.branchKey, scope: Object.assign({}, t.scope),
                    turn: t.turn, reason: '', writesNothing: true
                };
            } catch (e) { errLog(e, 'plugin.qaThread'); return { version: 0, state: 'idle', subjects: [], candidates: [], atFloor: null, atHint: '', timeOp: '', cleared: [], clearAxes: (QT && QT.QT_CLEAR_AXES) ? QT.QT_CLEAR_AXES.slice() : [], compareAxis: '', branchKey: '', scope: {}, turn: 0, reason: 'thrown', writesNothing: true }; }
        
    }

    function memoryToolsSources(engine) {

            return {
                queryEvidence: _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js'),
                /* [v3.332.0 · M4-O4] 第六能力与 queryEvidence 同模块同一份实例:
                 *   queryAsync 与 query 走同一份 universeOf/matchRow/assemble,
                 *   差别只在执行时机(片间让出 + 取消检查)。 */
                queryEvidenceAsync: _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js'),
                getContinuityPack: _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js'),
                previewFactAdmission: _moduleLib(() => window.LonShaNativeFactAdmission, 'native-fact-admission.js'),
                explainRecall: _moduleLib(() => window.LonShaRecallExplain, 'recall-explain.js'),
                getKnowledgeBoundary: _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js')
            };
        
    }

    function _memoryToolsAbsent(engine, api, reason) {

            const known = ['queryEvidence', 'queryEvidenceAsync', 'getContinuityPack', 'previewFactAdmission', 'explainRecall', 'getKnowledgeBoundary'];
            const name = (known.indexOf(api) >= 0) ? api : String(api == null ? '' : api);
            return {
                kind: 'memory-tools-envelope',
                api: name,
                apiVersion: 0,
                toolVersion: 0,
                state: 'unavailable',
                stateLabel: '能力缺席（模块或符号不在场）',
                reason: String(reason || 'module-unavailable'),
                source: { module: '', symbol: '', path: 'not-given' },
                revision: null,
                revisionSource: '',
                scope: {},
                data: null,
                notes: ['记忆工具面模块不可达（memory-tools-api.js 未加载）⇒ 报 unavailable，**不报空数据**'],
                writesNothing: true
            };
        
    }

    function memoryToolsDescribe(engine) {

            const T = _memoryToolsLib();
            if (!T || typeof T.describe !== 'function') {
                return {
                    kind: 'memory-tools-envelope-describe', apiVersion: 0, toolVersion: 0,
                    states: [], counts: { total: 0, present: 0, absent: 0 }, absentReasons: [],
                    complete: false, capabilities: [],
                    note: '记忆工具面模块未加载（memory-tools-api.js）',
                    reason: 'module-unavailable'
                };
            }
            try { return T.describe(engine.memoryToolsSources()); }
            catch (e) { errLog(e, 'plugin.memoryToolsDescribe'); return { kind: 'memory-tools-envelope-describe', apiVersion: 0, toolVersion: 0, states: [], counts: { total: 0, present: 0, absent: 0 }, absentReasons: [], complete: false, capabilities: [], note: '自述抛错', reason: 'thrown' }; }
        
    }

    function queryEvidence(engine, spec, opts) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.queryEvidence !== 'function') return engine._memoryToolsAbsent('queryEvidence', 'module-unavailable');
                return T.queryEvidence(engine.memoryToolsSources(), this, spec, opts);
            } catch (e) { errLog(e, 'plugin.queryEvidence'); return engine._memoryToolsAbsent('queryEvidence', 'thrown'); }
        
    }

    async function queryEvidenceAsync(engine, spec, opts) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.queryEvidenceAsync !== 'function') return engine._memoryToolsAbsent('queryEvidenceAsync', 'module-unavailable');
                return await T.queryEvidenceAsync(engine.memoryToolsSources(), this, spec, opts);
            } catch (e) {
                errLog(e, 'plugin.queryEvidenceAsync');
                return engine._memoryToolsAbsent('queryEvidenceAsync', 'thrown');
            }
        
    }

    function getContinuityPack(engine, args) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.getContinuityPack !== 'function') return engine._memoryToolsAbsent('getContinuityPack', 'module-unavailable');
                return T.getContinuityPack(engine.memoryToolsSources(), args);
            } catch (e) { errLog(e, 'plugin.getContinuityPack'); return engine._memoryToolsAbsent('getContinuityPack', 'thrown'); }
        
    }

    function previewFactAdmission(engine, fact, ctx) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.previewFactAdmission !== 'function') return engine._memoryToolsAbsent('previewFactAdmission', 'module-unavailable');
                return T.previewFactAdmission(engine.memoryToolsSources(), fact, ctx);
            } catch (e) { errLog(e, 'plugin.previewFactAdmission'); return engine._memoryToolsAbsent('previewFactAdmission', 'thrown'); }
        
    }

    function explainRecall(engine, input, opts) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.explainRecall !== 'function') return engine._memoryToolsAbsent('explainRecall', 'module-unavailable');
                return T.explainRecall(engine.memoryToolsSources(), input, opts);
            } catch (e) { errLog(e, 'plugin.explainRecall'); return engine._memoryToolsAbsent('explainRecall', 'thrown'); }
        
    }

    function getKnowledgeBoundary(engine, raw, character, fact, opts) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.getKnowledgeBoundary !== 'function') return engine._memoryToolsAbsent('getKnowledgeBoundary', 'module-unavailable');
                return T.getKnowledgeBoundary(engine.memoryToolsSources(), raw, character, fact, opts);
            } catch (e) { errLog(e, 'plugin.getKnowledgeBoundary'); return engine._memoryToolsAbsent('getKnowledgeBoundary', 'thrown'); }
        
    }

    function queryLendRelations(engine, filter) {

            try {
                const records = (engine.worldProg && engine.worldProg.items && Array.isArray(engine.worldProg.items.records))
                    ? engine.worldProg.items.records : [];
                const f = filter || {};
                const actor = String((f && f.actor) || '').toLowerCase();
                const result = records.filter((r) => {
                    if (actor) {
                        const a = String(r.actor || '').toLowerCase();
                        const lt = String(r.lendTo || '').toLowerCase();
                        const bf = String(r.borrowFrom || '').toLowerCase();
                        if (a !== actor && lt !== actor && bf !== actor) return false;
                    }
                    if (f.outstanding === true && !r.returnDue) return false;
                    return !!r.lendTo || !!r.borrowFrom;
                }).map((r) => ({
                    id: r.id, actor: r.actor, content: r.content,
                    lendTo: r.lendTo || '', borrowFrom: r.borrowFrom || '',
                    returnDue: r.returnDue || '', ownerRef: r.ownerRef || '',
                    status: r.status || ''
                }));
                return { ok: true, records: result, total: result.length };
            } catch (e) { errLog(e, 'plugin.queryLendRelations'); return { ok: false, records: [], total: 0, reason: 'thrown' }; }
        
    }

    function queryCorroboration(engine, fact, opts) {

            try {
                const KT = _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js');
                if (!KT || typeof KT.corroborationOf !== 'function') return { ok: false, rootCount: 0, roots: [], retractedRoots: [], circularHearsay: 0, transmittalChains: [], reason: 'module-unavailable', degraded: true };
                const traces = (engine.worldProg && engine.worldProg.knowledgeTraces) || { traces: [] };
                return KT.corroborationOf(traces, fact, opts);
            } catch (e) { errLog(e, 'plugin.queryCorroboration'); return { ok: false, rootCount: 0, roots: [], retractedRoots: [], circularHearsay: 0, transmittalChains: [], reason: 'thrown', degraded: true }; }
        
    }

    function querySharedKnowledge(engine, participants, atFloor, opts) {

            try {
                const KT = _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js');
                if (!KT || typeof KT.sharedKnowledgeOf !== 'function') return { ok: false, shared: [], partial: [], unknown: [], participants: [], reason: 'module-unavailable', degraded: true };
                const traces = (engine.worldProg && engine.worldProg.knowledgeTraces) || { traces: [] };
                return KT.sharedKnowledgeOf(traces, participants, atFloor, opts);
            } catch (e) { errLog(e, 'plugin.querySharedKnowledge'); return { ok: false, shared: [], partial: [], unknown: [], participants: [], reason: 'thrown', degraded: true }; }
        
    }

    function queryPeriodicCommitments(engine, ref, range) {

            try {
                const CL = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
                if (!CL || typeof CL.deriveInstances !== 'function') return { ok: false, instances: [], reason: 'module-unavailable', degraded: true };
                const ledger = (engine.worldProg && engine.worldProg.commitmentLedger) || { items: [] };
                return CL.deriveInstances(ledger, ref, range);
            } catch (e) { errLog(e, 'plugin.queryPeriodicCommitments'); return { ok: false, instances: [], reason: 'thrown', degraded: true }; }
        
    }

    function queryWhereabouts(engine, participants, fromFloor, toFloor) {

            try {
                if (!engine.scene || typeof engine.scene.whereaboutsOf !== 'function') {
                    return { ok: false, reason: 'module-unavailable', degraded: true, whereabouts: [], overlaps: [], gaps: [] };
                }
                return engine.scene.whereaboutsOf(participants, fromFloor, toFloor);
            } catch (e) { errLog(e, 'plugin.queryWhereabouts'); return { ok: false, reason: 'thrown', degraded: true, whereabouts: [], overlaps: [], gaps: [] }; }
        
    }

    function queryImpactPreview(engine, factId, opts) {

            try {
                const IP = _impactPreviewLib();
                if (!IP || typeof IP.previewImpact !== 'function') return { ok: false, reason: 'module-unavailable', degraded: true, directlyAffected: [], possiblyAffected: [], unaffected: [] };
                const ledgers = {
                    commitmentLedger: (engine.worldProg && engine.worldProg.commitmentLedger) || { items: [] },
                    itemLedger: (engine.worldProg && engine.worldProg.itemLedger) || { records: [] },
                    factVersion: (engine._factVersionState || {})
                };
                const factState = (typeof engine._factVersionState === 'object' && engine._factVersionState) ? engine._factVersionState : {};
                return IP.previewImpact(factState, factId, ledgers, opts);
            } catch (e) { errLog(e, 'plugin.queryImpactPreview'); return { ok: false, reason: 'thrown', degraded: true, directlyAffected: [], possiblyAffected: [], unaffected: [] }; }
        
    }

    function queryHypothesisWorkspace(engine, op, payload) {

            try {
                const HW = _hypothesisWorkspaceLib();
                if (!HW) return { ok: false, reason: 'module-unavailable', degraded: true };
                const rawState = (engine.worldProg && engine.worldProg.hypothesisWorkspaces) || { worksets: [] };
                if (op === 'create') return HW.createWorkspace(rawState, payload);
                if (op === 'discard') return HW.discardWorkspace(rawState, payload);
                if (op === 'complete') return HW.completeWorkspace(rawState, payload);
                if (op === 'list') return { ok: true, workspaces: HW.listWorkspaces(rawState), line: HW.line(rawState) };
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryHypothesisWorkspace'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function queryResearchCollection(engine, op, payload) {

            try {
                const RC = _researchCollectionLib();
                if (!RC) return { ok: false, reason: 'module-unavailable', degraded: true };
                const rawState = (engine.worldProg && engine.worldProg.researchCollections) || { collections: [] };
                if (op === 'create') return RC.createCollection(rawState, payload);
                if (op === 'addCitation') return RC.addCitation(rawState, payload);
                if (op === 'addConclusion') return RC.addConclusion(rawState, payload);
                if (op === 'markReview') return RC.markReviewNeeded(rawState, payload);
                if (op === 'close') return RC.closeCollection(rawState, payload);
                if (op === 'list') return { ok: true, collections: RC.normalize(rawState).collections, line: RC.line(rawState) };
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryResearchCollection'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function queryExperience(engine, op, payload) {

            try {
                const ER = _experienceRebuildLib();
                if (!ER) return { ok: false, reason: 'module-unavailable', degraded: true };
                const list = (engine.worldProg && Array.isArray(engine.worldProg.experiences)) ? engine.worldProg.experiences : [];
                const p = (payload && typeof payload === 'object') ? payload : {};
                const _commit = (res) => {
                    if (res && res.ok && Array.isArray(res.list)) {
                        if (!engine.worldProg) engine.worldProg = {};
                        engine.worldProg.experiences = res.list;
                    }
                    return res;
                };
                if (op === 'open') return _commit(ER.openExperience(list, p.title, p.seed || p, Date.now()));
                if (op === 'addRef') return _commit(ER.addRef(list, p.id || p.expId, p.ref || p, Date.now()));
                if (op === 'retract') return _commit(ER.retractRef(list, p.id || p.expId, p.refId, p.source));
                if (op === 'confirm') return _commit(ER.confirmExperience(list, p.id || p.expId, Date.now()));
                if (op === 'applyMerge') return _commit(ER.applyMerge(list, p.aId, p.bId));
                if (op === 'split') return _commit(ER.splitExperience(list, p.id || p.expId, p.keepRefIds, Date.now()));
                if (op === 'mergeCandidates') return { ok: true, candidates: ER.mergeCandidates(list) };
                if (op === 'rebuild') return ER.rebuildOf(list, p.id || p.expId);
                if (op === 'expand') return ER.expandExperience(list, p.id || p.expId);
                if (op === 'locate') return { ok: true, hits: ER.locateExperiences(list, p.query || p) };
                if (op === 'line') return { ok: true, line: ER.experienceLine(list) };
                if (op === 'list') return { ok: true, experiences: ER.normalizeExperiences(list), line: ER.experienceLine(list) };
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryExperience'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function queryDualTime(engine, op, payload) {

            try {
                const DT = _dualTimeLib();
                if (!DT) return { ok: false, reason: 'module-unavailable', degraded: true };
                const list = (engine.worldProg && Array.isArray(engine.worldProg.timeCoords)) ? engine.worldProg.timeCoords : [];
                const p = (payload && typeof payload === 'object') ? payload : {};
                const _commit = (res) => {
                    if (res && res.ok && Array.isArray(res.list)) {
                        if (!engine.worldProg) engine.worldProg = {};
                        engine.worldProg.timeCoords = res.list;
                    }
                    return res;
                };
                if (op === 'upsert') return _commit(DT.upsertCoord(list, p.coord || p));
                if (op === 'find') return { ok: true, coord: DT.findCoord(list, p.subject, p.actor) };
                if (op === 'visibleAt') {
                    const c = p.coord || DT.findCoord(list, p.subject, p.actor);
                    if (!c) return { ok: false, reason: 'not-found' };
                    return { ok: true, at: DT.visibleAt(c, p.floor) };
                }
                if (op === 'projectAt') return Object.assign({ ok: true }, DT.projectAt(list, p.floor, { actor: p.actor }));
                if (op === 'orderOf') {
                    const ca = p.a || DT.findCoord(list, p.subjectA, p.actorA);
                    const cb = p.b || DT.findCoord(list, p.subjectB, p.actorB);
                    return { ok: true, order: DT.orderOf(ca, cb) };
                }
                if (op === 'disclosedFromClock') return { ok: true, key: DT.disclosedFromClock(p.clock || p) };
                /* ★ 历史视角取「当时那一个版本」（本版判据抓到的真缺陷后补的出口）：
                 *   只存版本字符串时，「第 110 楼当时读到哪个版本」无法回答；
                 *   versionAt 三种回答分开：版本字符串 / not-yet（尚未获知）/ unknown（版本时间未知）。 */
                if (op === 'versionAt') {
                    const c = p.coord || DT.findCoord(list, p.subject, p.actor);
                    if (!c) return { ok: false, reason: 'not-found' };
                    return Object.assign({ ok: true }, DT.versionAt(c, p.floor));
                }
                if (op === 'line') return { ok: true, line: DT.line(list) };
                if (op === 'list') return { ok: true, coords: DT.normalizeCoords(list), line: DT.line(list) };
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryDualTime'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function queryEvidenceSolver(engine, op, payload) {

            try {
                const SV = _evidenceSolverLib();
                if (!SV) return { ok: false, reason: 'module-unavailable', degraded: true };
                const threads = (engine.worldProg && Array.isArray(engine.worldProg.solverThreads)) ? engine.worldProg.solverThreads : [];
                const p = (payload && typeof payload === 'object') ? payload : {};
                /* ★ 线程落盘形状：{ id, raw, opts, result }。
                 *   raw 是**求解输入**（claims/links/scope/question），
                 *   result 是**上一次结论**。两者都必须存：
                 *   只存结论 → revise 无原料（改目标变成清空）；
                 *   只存原料 → 读档后看不到上次答成什么样。 */
                const _commit = (res, thread) => {
                    if (res && res.ok && thread) {
                        if (!engine.worldProg) engine.worldProg = {};
                        const arr = Array.isArray(engine.worldProg.solverThreads) ? engine.worldProg.solverThreads.slice() : [];
                        const idx = arr.findIndex((t) => t && t.id === thread.id);
                        const rec = { id: thread.id, raw: thread.raw, opts: thread.opts || {}, result: res };
                        if (idx >= 0) arr[idx] = rec; else arr.push(rec);
                        engine.worldProg.solverThreads = arr;
                    }
                    return res;
                };
                if (op === 'solve') {
                    const raw = p.raw || p;
                    const opts = (p.opts && typeof p.opts === 'object') ? p.opts : {};
                    const res = SV.solve(raw, opts);
                    /* ★ withRaw：挂上原始输入，revise 才有原料。
                     *   不挂则 revise 返回 bad-shape —— 那正是「改目标变成清空」的形态。 */
                    SV.withRaw(res, raw, opts);
                    const id = String(p.id || (raw && raw.id) || ('sv_' + Date.now()));
                    return _commit(res, { id: id, raw: raw, opts: opts });
                }
                if (op === 'revise') {
                    const thread = threads.find((t) => t && t.id === p.id) || null;
                    if (!thread || !thread.raw) return { ok: false, reason: 'not-found', degraded: true };
                    /* ★ 用**存回来的 raw** 整份重求，而不是拿旧结论改写。 */
                    const base = SV.withRaw({ __raw: thread.raw, __opts: thread.opts || {} }, thread.raw, thread.opts || {});
                    const out = SV.revise(base, p.patch || {});
                    if (!out.ok) return { ok: false, reason: out.reason || 'bad-shape', degraded: true };
                    /* ★ 落盘**修订后的 raw**（out.result.__raw），而不是旧 thread.raw。
                     *   内核 revise 已把「应用 patch 后的新目标」写进 out.result.__raw；
                     *   若再拿旧 thread.raw 覆盖，改时点/改命题只活在当次返回值，
                     *   重开后线程会退回旧目标 —— 那正是「换时点后旧证据还在」的读档假象。 */
                    const newRaw = (out.result && out.result.__raw) ? out.result.__raw : thread.raw;
                    const newOpts = (out.result && out.result.__opts) ? out.result.__opts : (thread.opts || {});
                    return _commit(out.result, { id: p.id, raw: newRaw, opts: newOpts });
                }
                if (op === 'judge') {
                    const claim = SV.normalizeClaim(p.claim || p);
                    if (!claim) return { ok: false, reason: 'bad-shape', degraded: true };
                    const ctx = { claimById: {}, links: (p.links && typeof p.links === 'object') ? p.links : {}, minIndependent: SV.SOLVER_LIMITS.minIndependent };
                    const j = SV.judgeClaim(claim, ctx);
                    return { ok: true, state: j.state, strength: j.strength, independent: j.independent || 0, missing: j.missing, support: j.support, counter: j.counter };
                }
                if (op === 'line') {
                    const t = threads[threads.length - 1] || null;
                    return { ok: true, line: t && t.result ? SV.solverLine(t.result) : SV.solverLine({ ok: false, reason: 'no-thread' }), threads: threads.length };
                }
                if (op === 'list') {
                    return {
                        ok: true,
                        threads: threads.map((t) => ({
                            id: t && t.id,
                            question: (t && t.result && t.result.question) || '',
                            state: (t && t.result && t.result.conclusion && t.result.conclusion.state) || 'unknown',
                            independent: (t && t.result && t.result.independent) || 0,
                        })),
                    };
                }
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryEvidenceSolver'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function queryResolution(engine, op, payload) {

            try {
                const RL = _resolutionLadderLib();
                if (!RL) return { ok: false, reason: 'module-unavailable', degraded: true };
                const list = (engine.worldProg && Array.isArray(engine.worldProg.resolutionLadder)) ? engine.worldProg.resolutionLadder : [];
                const p = (payload && typeof payload === 'object') ? payload : {};
                const _commit = (res) => {
                    if (res && res.ok && Array.isArray(res.list)) {
                        if (!engine.worldProg) engine.worldProg = {};
                        engine.worldProg.resolutionLadder = res.list;
                    }
                    return res;
                };
                /* ★ 原话正文回源回调：source/refId → 正文。
                 *   契约（★ 固定下来，勿改）：**返回正文字符串**，取不到返回 null。
                 *   返回 true/false 会被当成正文写进 content —— 那是「把存在当内容」的形态。 */
                const _sourceBody = (v) => {
                    try {
                        const src = String(v && v.source || '');
                        const ref = String(v && v.refId || '');
                        if (!src || !ref) return null;
                        /* ① 楼层原话：floor:12 / f_12 / floor#12 */
                        const m = /^(?:floor|f|chat|floor#|f#)?#?(\d+)$/.exec(ref) || /^floor[#_]?(\d+)$/.exec(src + '_' + ref);
                        const floor = v.floor != null ? Number(v.floor) : (m ? Number(m[1]) : null);
                        if (Number.isFinite(floor) && engine._chatFloorText) {
                            const body = engine._chatFloorText(floor);
                            if (body) return body;
                        }
                        /* ② 摘要：sum_<floor> */
                        const sm = /^sum[_-]?(\d+)$/.exec(ref);
                        if (sm && engine.summary) {
                            const s = (engine.summary.summaries || []).find((x) => x && x.floor === Number(sm[1]));
                            if (s && s.text) return s.text;
                        }
                        /* ③ 角色日记：diary:<角色>:<floor> */
                        const dm = /^diary:(.+):(\d+)$/.exec(ref);
                        if (dm && engine.diary) {
                            const arr = (engine.diary.diaries || {})[dm[1]] || [];
                            const d = arr.find((x) => x && Number(x.floor) === Number(dm[2]));
                            if (d && d.text) return d.text;
                        }
                        return null;
                    } catch (e) { errLog(e, 'plugin.queryResolution.sourceBody'); return null; }
                };
                if (op === 'put') {
                    const entry = RL.normalizeEntry(p.entry || p);
                    if (!entry) return { ok: false, reason: 'bad-shape', degraded: true };
                    const arr = list.slice();
                    const idx = arr.findIndex((e) => e && e.id === entry.id);
                    if (idx >= 0) arr[idx] = p.entry || p; else arr.push(p.entry || p);
                    const res = { ok: true, reason: RL.RL_REASONS.OK, list: arr, entry: entry };
                    return _commit(res);
                }
                if (op === 'expand') {
                    const res = RL.expand(list, p.id, p.level || 'overview', { sourceExists: _sourceBody });
                    return { ok: res.ok, state: res.state, level: res.level, content: res.content, missing: res.missing, orphan: res.orphan || false, reason: res.reason };
                }
                if (op === 'expandability') {
                    const res = RL.expandability(list, p.id);
                    return { ok: res.ok, state: res.state, levels: res.levels, reason: res.reason };
                }
                if (op === 'select') {
                    const res = RL.selectByBudget(list, p.budget);
                    return { ok: res.ok, level: res.level, chosen: res.chosen, skipped: res.skipped, used: res.used || 0, reason: res.reason };
                }
                if (op === 'revise') return _commit(RL.reviseLevel(list, p.id, p.level, p.patch || {}));
                if (op === 'line') return { ok: true, line: RL.ladderLine(list) };
                if (op === 'list') return { ok: true, entries: RL.normalizeEntries(list), line: RL.ladderLine(list) };
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryResolution'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function queryScene(engine, op, payload) {

            try {
                const SO = _sceneOrchestratorLib();
                if (!SO) return { ok: false, reason: 'module-unavailable', degraded: true };
                const list = (engine.worldProg && Array.isArray(engine.worldProg.scenes)) ? engine.worldProg.scenes : [];
                const p = (payload && typeof payload === 'object') ? payload : {};
                const _commit = (res) => {
                    if (res && res.ok && Array.isArray(res.list)) {
                        if (!engine.worldProg) engine.worldProg = {};
                        engine.worldProg.scenes = res.list;
                    }
                    return res;
                };
                if (op === 'open') {
                    const scene = p.scene || p;
                    const id = String(scene.id || p.id || '');
                    if (!id) return { ok: false, reason: 'bad-shape', degraded: true };
                    if (list.some((s) => s && s.id === id)) return { ok: false, reason: 'duplicate', degraded: true };
                    const arr = list.concat([scene]);
                    const res = { ok: true, reason: SO.SO_REASONS.OK, list: arr, scene: SO.normalizeScene(scene) };
                    return _commit(res);
                }
                if (op === 'advance') return _commit(SO.advance(list, p.id, p.patch || {}));
                if (op === 'release') return _commit(SO.releaseConstraint(list, p.id, p.text));
                if (op === 'cancel') return _commit(SO.cancel(list, p.id));
                if (op === 'pack') {
                    const scene = SO.findScene(list, p.id);
                    if (!scene) return { ok: false, reason: 'not-found', degraded: true };
                    const res = SO.scenePack(scene, p.viewpoint || 'narrator', p.actor);
                    return { ok: res.ok, pack: res.pack, reason: res.reason };
                }
                if (op === 'line') return { ok: true, line: SO.sceneLine(list) };
                if (op === 'list') return { ok: true, scenes: SO.normalizeScenes(list), line: SO.sceneLine(list) };
                return { ok: false, reason: 'unknown-op', degraded: true };
            } catch (e) { errLog(e, 'plugin.queryScene'); return { ok: false, reason: 'thrown', degraded: true }; }
        
    }

    function memoryToolsLine(engine) {

            try {
                const T = _memoryToolsLib();
                if (!T || typeof T.line !== 'function') return '模块未加载（memory-tools-api.js）';
                const d = engine.memoryToolsDescribe();
                if (!d.complete) return '⚠️ ' + T.line(engine.memoryToolsSources());
                const sc = (typeof T.selfCheck === 'function') ? T.selfCheck(engine.memoryToolsSources()) : null;
                const bits = ['五能力齐备'];
                if (sc) bits.push(sc.ok === true ? '自检通过' : ('⚠️ 自检未过（' + JSON.stringify(sc) + '）'));
                return '记忆工具面 v' + (d.apiVersion || 0) + ' · ' + bits.join(' · ')
                    + ' · 五态齐备';
            } catch (e) { errLog(e, 'plugin.memoryToolsLine'); return '—（诊断异常）'; }
        
    }

    return {
        bindDeps: bindDeps,
        _qaActorAliases: _qaActorAliases,
        _qaKnownActors: _qaKnownActors,
        askMemoryQuestion: askMemoryQuestion,
        askMemoryQuestionAsync: askMemoryQuestionAsync,
        memoryQaLine: memoryQaLine,
        _qaThreadState: _qaThreadState,
        askMemoryQuestionFollowUp: askMemoryQuestionFollowUp,
        qaThreadResolve: qaThreadResolve,
        qaThread: qaThread,
        memoryToolsSources: memoryToolsSources,
        _memoryToolsAbsent: _memoryToolsAbsent,
        memoryToolsDescribe: memoryToolsDescribe,
        queryEvidence: queryEvidence,
        queryEvidenceAsync: queryEvidenceAsync,
        getContinuityPack: getContinuityPack,
        previewFactAdmission: previewFactAdmission,
        explainRecall: explainRecall,
        getKnowledgeBoundary: getKnowledgeBoundary,
        queryLendRelations: queryLendRelations,
        queryCorroboration: queryCorroboration,
        querySharedKnowledge: querySharedKnowledge,
        queryPeriodicCommitments: queryPeriodicCommitments,
        queryWhereabouts: queryWhereabouts,
        queryImpactPreview: queryImpactPreview,
        queryHypothesisWorkspace: queryHypothesisWorkspace,
        queryResearchCollection: queryResearchCollection,
        queryExperience: queryExperience,
        queryDualTime: queryDualTime,
        queryEvidenceSolver: queryEvidenceSolver,
        queryResolution: queryResolution,
        queryScene: queryScene,
        memoryToolsLine: memoryToolsLine
    };
}));
