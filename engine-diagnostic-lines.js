(function (global) {
    'use strict';
/*
 * engine-diagnostic-lines.js - MemoryEngine diagnostic + delegate methods
 * Extracted from index.js lines 2766-4262.
 * Methods receive engine (MemoryEngine instance) as first arg.
 * Deps injected via bindDeps: moduleLib, errLog, libs, _changeset.
 */

    var _ml = null;
    var _errLog = null;
    var _libs = {};
    var _cs = null;

    function bindDeps(d) {
        var n = 0;
        if (typeof d.moduleLib === 'function') { _ml = d.moduleLib; n++; }
        if (typeof d.errLog === 'function') { _errLog = d.errLog; n++; }
        if (d.libs && typeof d.libs === 'object') { _libs = d.libs; n++; }
        if (typeof d._changeset === 'function') { _cs = d._changeset; n++; }
        return n;
    }

    /* ★ [v3.430.0 本版自己抓到的缺陷] 本文件里曾**有两份** `function _moduleLib`：
     *   上面这份（走 bindDeps 注入的 `_ml`）与取库口区里另加的一份（走 `_libs._moduleLib`）。
     *   JS 的同名函数声明是**后者静默覆盖前者**，而 `index.js` 的 bindDeps 从来不注入
     *   `libs._moduleLib` ⇒ 生效的那份恒返回 null ⇒ 全文件 17 处 `_moduleLib(...)` 一句也没真取到
     *   模块（`_floorLedgerLine` 等一律报「模块未加载」）。判据全绿，因为没有人对「取到了」下断言。
     *   修法：**只留一份**，优先认 `_libs._moduleLib`（若有注入方按旧路径给），否则回到 bindDeps 的 `_ml`。
     *   这是「同一事实两处实现」的典型：两份都在，读谁都说得通，而实际生效的那份没人验。 */
    function _moduleLib() {
        if (_libs._moduleLib) return _libs._moduleLib.apply(null, arguments);
        return _ml ? _ml.apply(null, arguments) : null;
    }
    function errLog() { if (_errLog) return _errLog.apply(null, arguments); }
    function _changeset() { return _cs ? _cs.apply(null, arguments) : null; }

    function _causalChainLib() { return _libs._causalChainLib ? _libs._causalChainLib.apply(null, arguments) : null; }
    function _correctionPlanLib() { return _libs._correctionPlanLib ? _libs._correctionPlanLib.apply(null, arguments) : null; }
    function _emotionOppositeLib() { return _libs._emotionOppositeLib ? _libs._emotionOppositeLib.apply(null, arguments) : null; }
    function _extractionDriverLib() { return _libs._extractionDriverLib ? _libs._extractionDriverLib.apply(null, arguments) : null; }
    function _factStateLib() { return _libs._factStateLib ? _libs._factStateLib.apply(null, arguments) : null; }
    function _fatedRecallLib() { return _libs._fatedRecallLib ? _libs._fatedRecallLib.apply(null, arguments) : null; }
    function _loreCrosscheckLib() { return _libs._loreCrosscheckLib ? _libs._loreCrosscheckLib.apply(null, arguments) : null; }
    function _materialPackLib() { return _libs._materialPackLib ? _libs._materialPackLib.apply(null, arguments) : null; }
    function _narrativeLayerLib() { return _libs._narrativeLayerLib ? _libs._narrativeLayerLib.apply(null, arguments) : null; }
    function _perspectiveCardLib() { return _libs._perspectiveCardLib ? _libs._perspectiveCardLib.apply(null, arguments) : null; }
    function _recallExplainLib() { return _libs._recallExplainLib ? _libs._recallExplainLib.apply(null, arguments) : null; }
    function _relationHistoryLib() { return _libs._relationHistoryLib ? _libs._relationHistoryLib.apply(null, arguments) : null; }
    function _returnGateLib() { return _libs._returnGateLib ? _libs._returnGateLib.apply(null, arguments) : null; }
    function _summaryProvenanceLib() { return _libs._summaryProvenanceLib ? _libs._summaryProvenanceLib.apply(null, arguments) : null; }
    function _testimonyBoardLib() { return _libs._testimonyBoardLib ? _libs._testimonyBoardLib.apply(null, arguments) : null; }
    function _worldlineMemoryLib() { return _libs._worldlineMemoryLib ? _libs._worldlineMemoryLib.apply(null, arguments) : null; }
    /* [v3.428.0 · L12-O1] 七件零消费内核的取库口（宿主侧只留转发，业务不在 index.js 里拼）。
     *   为什么集中在这里而不是各自的文件：本仓纪律「新出口优先落在既有模块」——
     *   engine-diagnostic-lines.js 已是十二个诊断面的汇聚点，再加五件不引入新层。
     *   每件都由 bindDeps 的 libs 注入（与 _worldlineMemoryLib 同形），缺席即 null。 */
    function _institutionLib() { return _libs._institutionLib ? _libs._institutionLib.apply(null, arguments) : null; }
    function _relationDynamicsLib() { return _libs._relationDynamicsLib ? _libs._relationDynamicsLib.apply(null, arguments) : null; }
    function _agencyContractLib() { return _libs._agencyContractLib ? _libs._agencyContractLib.apply(null, arguments) : null; }
    function _symbolicEvolutionLib() { return _libs._symbolicEvolutionLib ? _libs._symbolicEvolutionLib.apply(null, arguments) : null; }
    function _eraInheritanceLib() { return _libs._eraInheritanceLib ? _libs._eraInheritanceLib.apply(null, arguments) : null; }
    /* [v3.430.0 · L12-X1~X9] 第十二期拓展侧四件内核的取库口。
     *   ⚠️ 四件的**挂载全局名各不相同**（实测，不是猜）：
     *     institutional-collective-memory.js → `InstitutionalCollectiveMemory`（无 LonSha 前缀）
     *     memory-season-silence-manager.js   → `MemorySeasonSilenceManager`（无 LonSha 前缀）
     *     recall-echo.js                     → `LonShaRecallEcho`
     *     fact-correction-bench.js           → `LonShaFactCorrectionBench`
     *   前缀不统一是既有事实，取库口迁就它，而不是给模块改名（改名会让既有卡与快照全断）。 */
    function _institutionalCollectiveLib() { return _libs._institutionalCollectiveLib ? _libs._institutionalCollectiveLib.apply(null, arguments) : null; }
    function _seasonSilenceLib() { return _libs._seasonSilenceLib ? _libs._seasonSilenceLib.apply(null, arguments) : null; }
    function _recallEchoLib() { return _libs._recallEchoLib ? _libs._recallEchoLib.apply(null, arguments) : null; }
    function _factCorrectionBenchLib() { return _libs._factCorrectionBenchLib ? _libs._factCorrectionBenchLib.apply(null, arguments) : null; }
    /* 这三件在 index.js 里**本来就有取库口**（_memorySeasonLib / _meaningMapLib / _symbiosisBridgeLib），
     *   只是从未注入进诊断层 ⇒ 本文件里一处也调不到。本处补的是**接收侧**的三个口，
     *   不是第二个取库实现（真源仍是 index.js 那三个函数，宿主侧注入过来）。 */
    function _memorySeasonLib() { return _libs._memorySeasonLib ? _libs._memorySeasonLib.apply(null, arguments) : null; }
    function _meaningMapLib() { return _libs._meaningMapLib ? _libs._meaningMapLib.apply(null, arguments) : null; }
    function _symbiosisBridgeLib() { return _libs._symbiosisBridgeLib ? _libs._symbiosisBridgeLib.apply(null, arguments) : null; }

    function _floorLedgerLine(engine) {

            try {
                const L = _moduleLib(() => window.LonShaFloorLedger, 'floor-ledger.js');
                if (!L) return '模块未加载（floor-ledger.js）';
                const c = engine._floorLedgerCoverage();
                if (!c || c.enabled !== true) return '不可用 · ' + String((c && c.reason) || 'unknown');
                const last = engine._floorLedgerStamp ? ` · 最近落笔 ${engine._floorLedgerStamp.status}${engine._floorLedgerStamp.reason ? '(' + engine._floorLedgerStamp.reason + ')' : ''}` : '';
                if (c.complete) return `${c.stamped}/${c.total} 楼已落笔（无缺口）` + last;
                const why = Object.keys(c.byWhy || {}).map(k => `${k}×${c.byWhy[k]}`).join(' ');
                const head = c.missing.slice(0, 6).join(',');
                return `${c.stamped}/${c.total} 楼已落笔 · 缺 ${c.missing.length}（第${head}${c.missing.length > 6 ? '…' : ''}楼）${why ? ' · ' + why : ''}` + last;
            } catch (e) { errLog(e, 'engine._floorLedgerLine'); return '—（诊断异常）'; }
        
    }

    function _summaryProvenanceLine(engine) {

            try {
                const PV = _summaryProvenanceLib();
                if (!PV || typeof PV.line !== 'function') return '模块未加载（summary-provenance.js）';
                const chat = (window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext() || {}).chat || [];
                const sums = (engine.summary && typeof engine.summary.getActiveSummaries === 'function')
                    ? engine.summary.getActiveSummaries() : [];
                const body = PV.line(sums, chat);
                const last = engine._summaryProvenanceStamp
                    ? ` · 最近留证 ${engine._summaryProvenanceStamp.status}${engine._summaryProvenanceStamp.reason ? '(' + engine._summaryProvenanceStamp.reason + ')' : ''}`
                    : '';
                // [v3.183] 召回侧过滤读数：判不了而放行的条数必须一并报出——
                // 否则「本轮过滤掉 N 条」与「本轮什么都没判」在读数上同形（I6）。
                const fl = engine._provRecallFilter;
                const filt = (fl && fl.rounds)
                    ? ` · 召回过滤 ${fl.dropped}/${fl.checked}（放行 判不了${fl.keptLegacy} 缺源${fl.keptMissing} 正文改${fl.keptDrift}${fl.moduleMissing ? ' · 模块缺席' + fl.moduleMissing : ''}）`
                    : '';
                return body + last + filt;
            } catch (e) { errLog(e, 'engine._summaryProvenanceLine'); return '—（诊断异常）'; }
        
    }

    function _branchGuardLine(engine) {

            try {
                if (!engine._branchGuard) return '分支守护未启用（尚无翻页/重生成）';
                const body = engine._branchGuard.line();
                const last = engine._branchGuardLast
                    ? ` · 最近拦截 ${engine._branchGuardLast.reason}（第${engine._branchGuardLast.floor}楼）`
                    : '';
                /* [v3.309.0 · M-O8 第四刀] 世界推进面的拦截面单列。
                 *   为什么必须单列而不是并进上面那句：两条闸拦的是**不同的写入**
                 *   （摘要落笔 / 世界推进账本），并成一句后「账本被拦」与「摘要被拦」
                 *   在后验时无法分辨 —— 而账本面才是不该越权的那一面（M-O8 验收②）。
                 *   三态不同形：拦下报理由与楼层；从未拦过**不报**（不是「放行」，
                 *   是这一轮根本没走到那里）—— 与 secret-ledger 的「判不了单独一档」同纪律。 */
                const wp = engine._wpBranchSkip && engine._wpBranchSkip.skipped
                    ? ` · 账本面拦截 ${engine._wpBranchSkip.reason}（第${engine._wpBranchSkip.floor}楼）`
                    : '';
                return body + last + wp;
            } catch (e) { errLog(e, 'engine._branchGuardLine'); return '—（诊断异常）'; }
        
    }

    function _crosslinkLine(engine) {

            try {
                if (!engine._crosslinkIndex || typeof engine._crosslinkIndex.line !== 'function') return '关联未启用（尚无摘要落笔）';
                const body = engine._crosslinkIndex.line();
                const last = engine._crosslinkLast
                    ? ` · 最近第${engine._crosslinkLast.floor}楼${engine._crosslinkLast.linked.length}条候选${engine._crosslinkLast.truncated ? '(已截断)' : ''}`
                    : '';
                return body + last;
            } catch (e) { errLog(e, 'engine._crosslinkLine'); return '—（诊断异常）'; }
        
    }

    function _crosslinkConsumePair(engine, text) {

            try {
                const g = engine.graph;
                const t = String(text || '');
                if (!g || !g.edges || !t) return null;
                for (const e of g.edges.values()) {
                    if (!e || e.active === false) continue;
                    if (!e.data || !e.data.disclosure) continue;          // 只提「确认过且写过触发条件」的关系
                    const fromName = String(g.nodes?.get?.(e.from)?.name || e.from || '');
                    const toName = String(g.nodes?.get?.(e.to)?.name || e.to || '');
                    if (fromName.length < 2 || toName.length < 2) continue;   // 单字名命中率无意义（与 crosslink 同一口径）
                    if (!t.includes(fromName) || !t.includes(toName)) continue;
                    return { from: fromName, to: toName, label: String(e.label || '相关'), alive: true };
                }
                return null;
            } catch (_e) { return null; }
        
    }

    function _crosslinkConsumeAlive(engine, item) {

            try {
                const g = engine.graph;
                if (!g || !g.edges || !item) return false;
                for (const e of g.edges.values()) {
                    if (!e) continue;
                    const fromName = String(g.nodes?.get?.(e.from)?.name || e.from || '');
                    const toName = String(g.nodes?.get?.(e.to)?.name || e.to || '');
                    if (fromName === item.from && toName === item.to) return e.active !== false;
                }
                return false;
            } catch (_e) { return false; }
        
    }

    function _crosslinkConsumeLine(engine) {

            try {
                if (engine._xrefIdx == null) return '关联未启用（尚无摘要落笔）';
                const it = engine._crosslinkConsume;
                const head = it ? `${it.from} → ${it.to}（${it.label}）可提` : '本轮无可提关联';
                return head + `｜累计提 ${engine._crosslinkConsumed || 0} 次 · 未命中 ${engine._crosslinkConsumeMissN || 0} 次`
                    + `｜摘要入表 ${engine._crosslinkXrefN == null ? '—' : engine._crosslinkXrefN} 条 · 召回提权 ${engine._crosslinkRefRanked || 0} 次`;
            } catch (e) { errLog(e, 'engine._crosslinkConsumeLine'); return '—（诊断异常）'; }
        
    }

    function _emotionOppositeLine(engine) {

            try {
                if (engine.config.config.emotionOppositeRecall !== true) return '未启用（默认关）';
                const EL = _emotionOppositeLib();
                if (!EL || typeof EL.recallByOppositeEmotion !== 'function') return '模块未加载（narrative-pulse.js）';
                const r = engine._emoOppositeRead;
                if (!r) return '待本轮（尚无召回）';
                const CN = { joy: '喜', warm: '暖', sad: '悲', fear: '惧', anger: '怒', tense: '悬' };
                const dim = r.dominant ? (CN[r.dominant] || r.dominant) : '—';
                // [v3.193.0] 「无线索」有四种完全不同的成因，糊成一个等于把这条判据做哑：
                //   没情绪词（词典没覆盖或正文确实平）／情绪词全在回忆·引用·否定·他述里（不可信）／
                //   主导维是氛围型（极性 0，挑不出方向）／该维压根没配反向词（配置缺失，不是世界没情绪）。
                const RSN = {
                    'empty': '无查询文本或无候选',
                    'no-emotion': '无情绪词',
                    'no-trusted': '情绪词不可信（回忆/引用/否定/他述）',
                    'no-polarity': '主导维无极性（氛围型）',
                    'no-opposites': '该维未配反向词（配置缺失）'
                };
                if (r.reason === 'ok') {
                    const _ex = r.expanded ? ` · 预算挡下 ${r.expanded} 条` : '';
                    const _cr = r.credibleWords ? ` · 可信词 ${r.credibleWords}` : '';
                    // [v3.201] D1: 「提权」与「真进注入」是两件事——提权只改排序、不增块，
                    //   被提的条目完全可能仍被预算挤掉。只报「提权 N 条」会把「提了但没进」
                    //   读成「机制起了作用」。账本（v3.200）已按摘要正文片段测出真读数，
                    //   本行必须消费它：待账本 / 不可测 / X/Y 条，三态不可糊成一态。
                    //   （账本缺席的归属不复述：模块是否加载由「注入成本」行另行报出。）
                    const _iop = (engine._lastCostLedger && engine._lastCostLedger.opposite) ? engine._lastCostLedger.opposite : null;
                    const _inj = _iop
                        ? (_iop.measurable === false ? '不可测' : `${Number(_iop.injectedEstimate) || 0}/${Number(_iop.promotedCount) || 0} 条`)
                        : '待账本';
                    return `${dim}主导 → 本轮提 ${r.hits} 条（生效 ${engine._emoOppositeRounds || 0} 轮 · 提权 ${engine._emoOppositeBoosted || 0} 条 · 真进注入 ${_inj} · 已扫 ${r.scanned} 条${_ex}${_cr}）`;
                }
                return `无反向线索（${RSN[r.reason] || r.reason}·${dim}）`;
            } catch (e) { errLog(e, 'engine._emotionOppositeLine'); return '—（诊断异常）'; }
        
    }

    function _graphRollupLine(engine) {

            try {
                const g = engine.graph;
                if (!g) return '图未启用';
                const RU = _moduleLib(() => window.LonShaNodeRollup, 'node-rollup.js');
                const body = (RU && typeof RU.line === 'function') ? RU.line(g.nodes) : '模块未加载（node-rollup.js）';
                const rr = g._rollupRead;
                const cum = rr
                    ? ` · 累计压成 ${rr.created} 层${rr.rejected ? ' / 拒 ' + rr.rejected : ''}`
                    : '';
                const last = rr && rr.lastReason && rr.lastReason !== 'ok' ? `（最近拒因 ${rr.lastReason}）` : '';
                const m = engine._graphRollupRead;
                const run = m
                    ? ` · 最近维护 第${m.at ? new Date(m.at).toTimeString().slice(0, 5) : '—'} 压成${m.created}层 跳${m.skipped} 回收${m.prunedNodes}点/${m.prunedEdges}边（图 ${m.nodes} 点）`
                    : ' · 维护管线未跑过';
                return body + cum + last + run;
            } catch (e) { errLog(e, 'engine._graphRollupLine'); return '—（诊断异常）'; }
        
    }

    function _relationDisclosureLine(engine) {

            try {
                const RD = _moduleLib(() => window.LonShaRelationDisclosure, 'relation-disclosure.js');
                const read = engine._relationDisclosureRead;
                if (!read) return '本轮未注入关系块';
                if (!RD || typeof RD.line !== 'function') return '模块未加载（relation-disclosure.js）';
                const gated = (engine._relationGated || []).length ? ` · 跳过：${engine._relationGated.join('，')}` : '';
                return RD.line(read) + gated;
            } catch (e) { errLog(e, 'engine._relationDisclosureLine'); return '—（诊断异常）'; }
        
    }

    function _relationMutualLine(engine) {

            try {
                const RM = _moduleLib(() => window.LonShaRelationMutual, 'relation-mutual.js');
                const read = engine._relationMutualRead;
                if (!read) return '本轮未对账';
                if (!RM || typeof RM.line !== 'function') return '模块未加载（relation-mutual.js）';
                return RM.line(read);
            } catch (e) { errLog(e, 'engine._relationMutualLine'); return '—（诊断异常）'; }
        
    }

    function _knowledgeNetworkLine(engine) {

            try {
                const KN = _moduleLib(() => window.LonShaKnowledgeNetwork, 'knowledge-network.js');
                const read = engine.worldProg && engine.worldProg._knowledgeRead;
                if (!read) return '尚无认知记录';
                if (!KN || typeof KN.line !== 'function') return '模块未加载（knowledge-network.js）';
                return KN.line(read);
            } catch (e) { errLog(e, 'engine._knowledgeNetworkLine'); return '—（诊断异常）'; }
        
    }

    function _knowledgeTraceLine(engine) {

            try {
                const KT = _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js');
                const read = engine.worldProg && engine.worldProg._knowledgeTraceRead;
                if (!read) return '尚无轨迹';
                if (!KT || typeof KT.line !== 'function') return '模块未加载（knowledge-trace.js）';
                return KT.line(read);
            } catch (e) { errLog(e, 'engine._knowledgeTraceLine'); return '—（诊断异常）'; }
        
    }

    function relationHistory(engine, opts) {

        /* [v3.323.0 · C 包] **恒定键面**（本补丁的由来）：缺席面必须与在场产出**逐字同键**，
         *   否则下游按键断言的前提被破（「模块没加载」会被读成「一个都没有」，两者处置相反）。
         *   键序按内核 `RH.build()` 的产出序排，尾部补 ok/reason；`version: 0` = 「这一面不在场」。 */
        const absent = (why) => ({ kind: 'relation_history', version: 0, pairs: [], counts: {}, truncated: 0, turnsTruncated: 0, byName: false, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });
        try {
        const RH = _relationHistoryLib();
        if (!RH || typeof RH.build !== 'function') return absent('module-unavailable');
        const edges = [...((engine.graph && engine.graph.edges && engine.graph.edges.values) ? engine.graph.edges.values() : [])];
        const out = RH.build(edges, opts || {});
        const o = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._relationHistoryRead = o;
        return o;
        } catch (e) { errLog(e, 'engine.relationHistory'); return absent('thrown'); }
        
    }

    function relationHistoryAt(engine, floor) {

        /* [v3.323.0 · C 包] 同上：键序按 `RH.asOf()` 的产出序。
         *   `floor: null` + `floorKnown: false` —— 缺席时**不猜楼号**（与在场的「时点读不到」同判据）。 */
        const absent = (why) => ({ kind: 'relation_history@floor', version: 0, floor: null, pairs: [], counts: { pairs: 0, at: 0 }, floorKnown: false, malformedInput: false, degraded: false, writesNothing: true, ok: false, reason: why });
        try {
        const RH = _relationHistoryLib();
        if (!RH || typeof RH.asOf !== 'function') return absent('module-unavailable');
        const edges = [...((engine.graph && engine.graph.edges && engine.graph.edges.values) ? engine.graph.edges.values() : [])];
        const out = RH.asOf(edges, floor);
        return Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        } catch (e) { errLog(e, 'engine.relationHistoryAt'); return absent('thrown'); }
        
    }

    function _relationHistoryLine(engine) {

        try {
        const RH = _relationHistoryLib();
        if (!RH || typeof RH.line !== 'function') return '模块未加载（relation-history.js）';
        const got = engine.relationHistory({});
        if (!got.ok) return '关系变化史不可用（' + got.reason + '）';
        return RH.line(got);
        } catch (e) { errLog(e, 'engine._relationHistoryLine'); return '—（诊断异常）'; }
        
    }

    function causalChainGraph(engine, opts) {

        /* [v3.323.0 · C 包] 同上：键序按 `CC.build()` 的产出序。
         *   ★ 推测边面在缺席时**照样是空数组而不是缺键** —— 「没有推测边」与「这一面不在场」
         *     是两个读数，消费方按同一个键就能分。 */
        const absent = (why) => ({ kind: 'causal_chain', version: 0, nodes: [], edges: [], speculative: [], unresolved: [], resolved: [], cancelled: [], broken: [], counts: {}, truncated: 0, edgesTruncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });
        try {
        const CC = _causalChainLib();
        if (!CC || typeof CC.build !== 'function') return absent('module-unavailable');
        const src = {
        seeds: (engine.worldProg && engine.worldProg.seedLedger) || null,
        commitments: (engine.worldProg && engine.worldProg.commitmentLedger) || null,
        events: engine._eventThreadState || null
        };
        const out = CC.build(src, opts || {});
        const o = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._causalChainRead = o;
        return o;
        } catch (e) { errLog(e, 'engine.causalChainGraph'); return absent('thrown'); }
        
    }

    function causalChainTodos(engine) {

        try {
        const CC = _causalChainLib();
        if (!CC || typeof CC.todos !== 'function') return [];
        const g = (engine._causalChainRead && engine._causalChainRead.ok) ? engine._causalChainRead : engine.causalChainGraph({});
        if (!g.ok) return [];
        return CC.todos(g);
        } catch (e) { errLog(e, 'engine.causalChainTodos'); return []; }
        
    }

    function causalChainTrace(engine, id) {

        try {
        const CC = _causalChainLib();
        if (!CC || typeof CC.traceBack !== 'function') return { ok: false, reason: 'module-unavailable', id: String(id == null ? '' : id), path: [], roots: [], known: false };
        const g = (engine._causalChainRead && engine._causalChainRead.ok) ? engine._causalChainRead : engine.causalChainGraph({});
        if (!g.ok) return { ok: false, reason: g.reason, id: String(id == null ? '' : id), path: [], roots: [], known: false };
        return Object.assign({}, CC.traceBack(g, id), { ok: true });
        } catch (e) { errLog(e, 'engine.causalChainTrace'); return { ok: false, reason: 'thrown', id: String(id == null ? '' : id), path: [], roots: [], known: false }; }
        
    }

    function causalChainProposals(engine, opts) {

        try {
        const CC = _causalChainLib();
        if (!CC || typeof CC.proposeCandidates !== 'function') return [];
        const src = {
        seeds: (engine.worldProg && engine.worldProg.seedLedger) || null,
        commitments: (engine.worldProg && engine.worldProg.commitmentLedger) || null,
        events: engine._eventThreadState || null
        };
        return CC.proposeCandidates(src, opts || {});
        } catch (e) { errLog(e, 'engine.causalChainProposals'); return []; }
        
    }

    function _causalChainLine(engine) {

        try {
        const CC = _causalChainLib();
        if (!CC || typeof CC.line !== 'function') return '模块未加载（causal-chain.js）';
        const g = engine.causalChainGraph({});
        if (!g.ok) return '因果链不可用（' + g.reason + '）';
        return CC.line(g);
        } catch (e) { errLog(e, 'engine._causalChainLine'); return '—（诊断异常）'; }
        
    }

    function perspectiveCard(engine, opts) {

        /* [v3.323.0 · C 包] 同上：键序按 `PC.build()` 的产出序。
         *   `at: null` + `atKnown: false` —— 缺席时不给「时点」，与在场的「未给时点」不同形。 */
        const absent = (why) => ({ kind: 'perspective_card', version: 0, at: null, atKnown: false, cards: [], counts: {}, truncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });
        try {
        const PC = _perspectiveCardLib();
        if (!PC || typeof PC.build !== 'function') return absent('module-unavailable');
        const traces = (engine.worldProg && engine.worldProg.knowledgeTraces && engine.worldProg.knowledgeTraces.traces) || [];
        const out = PC.build(traces, opts || {});
        const o = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._perspectiveCardRead = o;
        return o;
        } catch (e) { errLog(e, 'engine.perspectiveCard'); return absent('thrown'); }
        
    }

    function testimonyBoard(engine, opts) {

        const absent = (why) => ({ kind: 'testimony_board', version: 0, at: null, atKnown: false, event: '', boards: [], counts: {}, truncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });
        try {
        const TB = _testimonyBoardLib();
        if (!TB || typeof TB.build !== 'function') return absent('module-unavailable');
        const traces = (engine.worldProg && engine.worldProg.knowledgeTraces && engine.worldProg.knowledgeTraces.traces) || [];
        const out = TB.build(traces, opts || {});
        const o = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._testimonyBoardRead = o;
        return o;
        } catch (e) { errLog(e, 'engine.testimonyBoard'); return absent('thrown'); }
        
    }

    function testimonyRevoke(engine, dropped, opts) {

        const absent = (why) => ({ kind: 'testimony_board@withdrawal', version: 0, droppedCount: 0, revokedItems: [], unchanged: 0, stateBefore: '', stateAfter: '', changed: false, degraded: false, ok: false, reason: why, writesNothing: true });
        try {
        const TB = _testimonyBoardLib();
        if (!TB || typeof TB.revokeEvidence !== 'function') return absent('module-unavailable');
        const read = engine.testimonyBoard(opts || {});
        if (!read || read.ok !== true || !Array.isArray(read.boards)) return absent(read && read.reason ? read.reason : 'no-board');
        const ev = read.event;
        const board = read.boards.filter((b) => !ev || b.eventKey === ev)[0];
        if (!board) return absent('no-board');
        const res = TB.revokeEvidence({ testimonies: board.testimonies, state: board.state }, dropped);
        return Object.assign({}, res, { ok: true, reason: '', writesNothing: true });
        } catch (e) { errLog(e, 'engine.testimonyRevoke'); return absent('thrown'); }
        
    }

    function _testimonyBoardLine(engine) {

        try {
        const TB = _testimonyBoardLib();
        if (!TB || typeof TB.line !== 'function') return '模块未加载(testimony-board.js)';
        const got = engine.testimonyBoard({});
        if (!got.ok) return '证词面不可用(' + got.reason + ')';
        return TB.line(got);
        } catch (e) { errLog(e, 'engine._testimonyBoardLine'); return '—(诊断异常)'; }
        
    }

    function narrativeLayer(engine, opts) {

        const absent = (why) => ({ kind: 'narrative_layer', version: 0, at: null, atKnown: false, items: [], byLayer: {}, counts: {}, truncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });
        try {
        const NL = _narrativeLayerLib();
        if (!NL || typeof NL.build !== 'function') return absent('module-unavailable');
        const o = opts || {};
        const items = Array.isArray(o.items) ? o.items
            : ((engine._factVersionState && Array.isArray(engine._factVersionState.facts)) ? engine._factVersionState.facts : []);
        const out = NL.build(items, o);
        const r = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._narrativeLayerRead = r;
        return r;
        } catch (e) { errLog(e, 'engine.narrativeLayer'); return absent('thrown'); }
        
    }

    function narrativeReality(engine, opts) {

        try {
        const NL = _narrativeLayerLib();
        if (!NL || typeof NL.realityView !== 'function') return { kind: 'narrative_layer@reality', count: 0, items: [], realityOnly: true, excluded: 0, ok: false, reason: 'module-unavailable' };
        const read = engine.narrativeLayer(opts || {});
        if (!read || read.ok !== true) return Object.assign({ kind: 'narrative_layer@reality', count: 0, items: [], realityOnly: true, excluded: 0, ok: false }, { reason: (read && read.reason) || 'no-read' });
        const rv = NL.realityView(read);
        return Object.assign({}, rv, { ok: true, reason: '' });
        } catch (e) { errLog(e, 'engine.narrativeReality'); return { kind: 'narrative_layer@reality', count: 0, items: [], realityOnly: true, excluded: 0, ok: false, reason: 'thrown' }; }
        
    }

    function narrativeProject(engine, opts) {

        try {
        const NL = _narrativeLayerLib();
        if (!NL || typeof NL.projectOf !== 'function') return { kind: 'narrative_layer@project', layers: [], layerCount: 0, ok: false, reason: 'module-unavailable' };
        const read = engine.narrativeLayer(opts || {});
        if (!read || read.ok !== true) return { kind: 'narrative_layer@project', layers: [], layerCount: 0, ok: false, reason: (read && read.reason) || 'no-read' };
        const pj = NL.projectOf(read, opts || {});
        return Object.assign({}, pj, { ok: true, reason: '' });
        } catch (e) { errLog(e, 'engine.narrativeProject'); return { kind: 'narrative_layer@project', layers: [], layerCount: 0, ok: false, reason: 'thrown' }; }
        
    }

    function _narrativeLayerLine(engine) {

        try {
        const NL = _narrativeLayerLib();
        if (!NL || typeof NL.line !== 'function') return '模块未加载(narrative-layer.js)';
        const got = engine.narrativeLayer({});
        if (!got.ok) return '叙事层不可用(' + got.reason + ')';
        return NL.line(got);
        } catch (e) { errLog(e, 'engine._narrativeLayerLine'); return '—(诊断异常)'; }
        
    }

    function _returnGateCandidates(engine, opts) {

            const o = (opts && typeof opts === 'object') ? opts : {};
            /* ★ [v3.345.0 · M4-X7] 三态不可塌:显式给了(哪怕给错)⇒ **原样透传**给内核判畸形,
             *   绝不回落 fated-recall —— 否则「给了畸形候选」与「没给候选」在宿主这一层同形,
             *   下游一律读到「这一次没有候选」,查不出「调用方把候选喂错了」。
             *   内核已有 malformedInput / judged:false 两态判据,宿主不该替它裁定。 */
            if (o.candidates !== undefined && o.candidates !== null) return { candidates: o.candidates, source: 'given' };
            const FR = _fatedRecallLib();
            if (!FR || typeof FR.suggest !== 'function') return { candidates: [], source: 'no-fated' };
            try {
                const res = FR.suggest(engine._fatedRecallDeps(), engine._fatedRecallState || {}, o);
                const cands = (Array.isArray(res && res.suggested) ? res.suggested : []).map((c) => ({
                    kind: c.kind || '', triggerKey: c.triggerKey || '',
                    detailKey: c.detailKey || c.entryKey || '',
                    title: c.title || c.snippet || '', source: c.source || '',
                    knowing: c.knowing || '', subjects: c.subjects || []
                }));
                return { candidates: cands, source: 'fated-recall' };
            } catch (e) { errLog(e, 'engine._returnGateCandidates'); return { candidates: [], source: 'thrown' }; }
        
    }

    function returnGate(engine, opts) {

            const absent = (why) => ({ kind: 'return_gate', version: 0, judged: false, policy: 'hint-only', policyLabel: '只给提示', now: null, gates: [], open: [], held: [], blocked: [], injectable: [], counts: { total: 0, open: 0, held: 0, blocked: 0, injectable: 0 }, cooldownUnjudged: 0, emotion: '', emotionUsed: false, prefsApplied: { less: 0, never: 0 }, reasons: [why], truncated: 0, writesNothing: true, devisesNothing: true, ok: false, reason: why });
            try {
                const RG = _returnGateLib();
                if (!RG || typeof RG.build !== 'function') return absent('module-unavailable');
                const o = (opts && typeof opts === 'object') ? opts : {};
                const picked = engine._returnGateCandidates(o);
                const st = (engine.worldProg && engine.worldProg.returnGate && typeof engine.worldProg.returnGate === 'object') ? engine.worldProg.returnGate : {};
                const out = RG.build(picked.candidates, { state: st, policy: o.policy, now: o.now, window: o.window, emotion: o.emotion });
                const r = Object.assign({}, out, { ok: true, reason: out.malformedInput ? 'malformed' : (out.degraded ? 'degraded' : ''), candidateSource: picked.source });
                engine._returnGateRead = r;
                return r;
            } catch (e) { errLog(e, 'engine.returnGate'); return absent('thrown'); }
        
    }

    function returnGateAdmit(engine, opts) {

            try {
                const read = engine.returnGate(opts || {});
                if (!read || read.ok !== true) return { kind: 'return_gate@admit', admitted: [], count: 0, injectable: false, ok: false, reason: (read && read.reason) || 'no-read', writesNothing: true };
                const adm = Array.isArray(read.injectable) ? read.injectable : [];
                const out = { kind: 'return_gate@admit', admitted: adm, count: adm.length, injectable: read.policy === 'inject', policy: read.policy, policyLabel: read.policyLabel, cooldownUnjudged: read.cooldownUnjudged, ok: true, reason: adm.length ? '' : (read.policy === 'inject' ? 'nothing-open' : 'hint-only'), writesNothing: true, note: '移交不算已用:实际使用后须调 returnGateMark(used,...) 才落冷却' };
                engine._returnGateAdmit = out;
                return out;
            } catch (e) { errLog(e, 'engine.returnGateAdmit'); return { kind: 'return_gate@admit', admitted: [], count: 0, injectable: false, ok: false, reason: 'thrown', writesNothing: true }; }
        
    }

    function returnGateMark(engine, channel, rec) {

            const RG = _returnGateLib();
            if (!RG || typeof RG.markChannel !== 'function') return { ok: false, reason: 'module-absent', changed: false, state: (engine.worldProg && engine.worldProg.returnGate) || { marks: [], prefs: {} } };
            try {
                const cur = (engine.worldProg && engine.worldProg.returnGate) ? engine.worldProg.returnGate : {};
                const res = RG.markChannel(cur, Object.assign({}, rec || {}, { channel: channel }));
                if (res.ok && res.changed) {
                    if (!engine.worldProg) engine.worldProg = {};
                    engine.worldProg.returnGate = res.state;
                }
                return Object.assign({ kind: RG.RG_KIND + '_mark', version: RG.RG_VERSION }, res);
            } catch (e) { errLog(e, 'engine.returnGateMark'); return { ok: false, reason: 'thrown', changed: false, state: (engine.worldProg && engine.worldProg.returnGate) || { marks: [], prefs: {} } }; }
        
    }

    function returnGatePrefer(engine, detailKey, pref) {

            const RG = _returnGateLib();
            if (!RG || typeof RG.withPreference !== 'function') return { ok: false, reason: 'module-absent', changed: false, state: (engine.worldProg && engine.worldProg.returnGate) || { marks: [], prefs: {} } };
            try {
                const cur = (engine.worldProg && engine.worldProg.returnGate) ? engine.worldProg.returnGate : {};
                const res = RG.withPreference(cur, detailKey, pref);
                if (res.ok && res.changed) {
                    if (!engine.worldProg) engine.worldProg = {};
                    engine.worldProg.returnGate = res.state;
                }
                return Object.assign({ kind: RG.RG_KIND + '_prefer', version: RG.RG_VERSION }, res);
            } catch (e) { errLog(e, 'engine.returnGatePrefer'); return { ok: false, reason: 'thrown', changed: false, state: (engine.worldProg && engine.worldProg.returnGate) || { marks: [], prefs: {} } }; }
        
    }

    function _returnGateLine(engine) {

            try {
                const RG = _returnGateLib();
                if (!RG || typeof RG.line !== 'function') return '模块未加载(return-gate.js)';
                const got = engine.returnGate({});
                if (!got.ok) return '控频闸不可用(' + got.reason + ')';
                return RG.line(got);
            } catch (e) { errLog(e, 'engine._returnGateLine'); return '—(诊断异常)'; }
        
    }
    /* ---- 跳跃表文本解析（★ [v3.429.0 · L12-O8] 编辑器与闸门共用这**一段**解析）----
     * 为什么抽出来：面板要做「结构化编辑器 + 坏行当场标红」，就必须知道「这一行为什么会被闸
     *   丢掉」。若面板另写一份正则来判好/坏，两套口径一旦漂移（面板说没问题、闸却默默丢掉），
     *   卡作者会被面板误导着去排查别处 —— 那正是本仓治过的「两套真源」。故解析只此一处，
     *   `_worldlineState`（闸门）与 `worldlineJumpDraft`（面板）都调它。
     *
     * 返回四桶（坏行绝不静默）：
     *   rows    闸会消费的行（按书写顺序，**未排序** —— 排序是消费侧的事，编辑器要保持作者顺序）
     *   rejects 整行作废：带行号（1 基）+ 原文 + 可读成因（面板当场标红）
     *   warns   行能用但某一列被忽略（如变动率不是数字）—— 那一列不许静默消失
     *   entries 逐原文行的清单（含空行 / 注释行），供编辑器按原顺序渲染且**行号 1:1**
     * 空行与 `#` 注释行不是坏行（跳过、不报错、不算 reject）。
     */
    function parseJumpsText(raw) {
        const rows = [];
        const rejects = [];
        const warns = [];
        const entries = [];
        const text = String(raw === undefined || raw === null ? '' : raw);
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const s = lines[i].trim();
            const no = i + 1;
            if (!s) {
                entries.push({ line: no, kind: 'blank', text: '', floor: null, lineId: '', divergence: null, why: '' });
                continue;
            }
            if (s.charAt(0) === '#') {
                entries.push({ line: no, kind: 'comment', text: s, floor: null, lineId: '', divergence: null, why: '' });
                continue;
            }
            const at = s.indexOf(':') >= 0 ? s.indexOf(':') : s.indexOf('=');
            if (at <= 0) {
                rejects.push({ line: no, text: s, why: '缺分隔符（要写成 `楼层:层标记`，如 `40:梦境一层`）' });
                entries.push({ line: no, kind: 'bad', text: s, floor: null, lineId: '', divergence: null, why: '缺分隔符' });
                continue;
            }
            const f = Number(s.slice(0, at).trim());
            const rest = s.slice(at + 1).trim();
            if (!Number.isFinite(f) || f < 0) {
                rejects.push({ line: no, text: s, why: '楼层不是非负数字（左半边是**消息索引**，如 40）' });
                entries.push({ line: no, kind: 'bad', text: s, floor: null, lineId: '', divergence: null, why: '楼层不是非负数字' });
                continue;
            }
            if (!rest) {
                rejects.push({ line: no, text: s, why: '缺层标记（`楼层:` 后面必须写这一层的名字）' });
                entries.push({ line: no, kind: 'bad', text: s, floor: null, lineId: '', divergence: null, why: '缺层标记' });
                continue;
            }
            const parts = rest.split(/[:：=]/);
            const lid = String(parts[0] || '').trim();
            if (!lid) {
                rejects.push({ line: no, text: s, why: '层标记为空（分隔符后面先写名字）' });
                entries.push({ line: no, kind: 'bad', text: s, floor: null, lineId: '', divergence: null, why: '层标记为空' });
                continue;
            }
            let dv = null;
            if (parts.length > 1) {
                const n = Number(parts[1]);
                if (Number.isFinite(n)) dv = n;
                else warns.push({ line: no, text: s, why: '第三列（数字编号）不是数字，已忽略；该行仍按层标记生效' });
            }
            rows.push({ floor: Math.floor(f), lineId: lid, divergence: dv });
            entries.push({ line: no, kind: 'ok', text: s, floor: Math.floor(f), lineId: lid, divergence: dv, why: '' });
        }
        return { rows: rows, rejects: rejects, warns: warns, entries: entries };
    }

    function worldlineJumpDraft(engine, draft) {
        /* 面板「跳跃表」编辑器的**唯一取数口**：给一段草稿文本（不给就读配置），回它的解析
         *   结果 + 每行对应的纪元 + 前史缺口读数。
         *   ★ 刻意**不写任何配置**：在保存键被点下之前，闸门读到的仍是旧配置。
         *     「预览里看到的」与「已生效的」必须不同形，否则改坏一行会当场影响召回。 */
        const cfg = (engine && engine.config && engine.config.config) || {};
        const text = (draft === undefined || draft === null)
            ? String(cfg.worldlineJumps === undefined || cfg.worldlineJumps === null ? '' : cfg.worldlineJumps)
            : String(draft);
        try {
            const parsed = parseJumpsText(text);
            const rows = parsed.rows.slice().sort(function (a, b) { return a.floor - b.floor; });
            const WM = _worldlineMemoryLib();
            const epochs = [];
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                let ep = '';
                if (WM && typeof WM.epochOf === 'function') {
                    try { ep = WM.epochOf(r.lineId, r.floor); } catch (_e) { ep = ''; }
                }
                epochs.push({ floor: r.floor, lineId: r.lineId, epoch: ep });
            }
            const first = rows.length ? rows[0].floor : null;
            return {
                kind: 'worldline_jump_draft', ok: parsed.rejects.length === 0,
                text: text, rows: rows, rejects: parsed.rejects, warns: parsed.warns, entries: parsed.entries,
                epochs: epochs, firstFloor: first,
                /* 前史缺口：首跳在第 N 楼（N>1）时，第 1..N-1 楼的条目推不出纪元 ⇒ **判不了**。
                 *   ★ 这是信息缺失，不是「安全」：那批条目既不当事实，也不被挡。
                 *   面板必须把这两个读数做成不同形（有缺口 / 已覆盖 / 根本没登记）。 */
                prehistoryGap: (first !== null && first > 1) ? { from: 1, to: first - 1, count: first - 1 } : null,
                writesNothing: true,
            };
        } catch (e) {
            errLog(e, 'engine.worldlineJumpDraft');
            return {
                kind: 'worldline_jump_draft', ok: false, text: text, rows: [], rejects: [], warns: [], entries: [],
                epochs: [], firstFloor: null, prehistoryGap: null, why: 'thrown', writesNothing: true,
            };
        }
    }

    function _worldlineState(engine, opts) {
            /* ★ [v3.424.0 · M7-X1] 世界线状态的**唯一装配点**。
             *   配置三个键（worldlineId / worldlineDivergence / worldlineAdjacentPolicy）与名单/
             *   收束登记表在这里被归一成内核吃的 state 形状；别处一律不自己拼 state ——
             *   拼两处就会出现「诊断面读 A、闸门读 B」两套真源。 */
            const o = (opts && typeof opts === 'object') ? opts : {};
            const cfg = (engine && engine.config && engine.config.config) || {};
            const wp = (engine && engine.worldProg && typeof engine.worldProg === 'object') ? engine.worldProg : {};
            const saved = (wp.worldline && typeof wp.worldline === 'object') ? wp.worldline : {};
            /* ★ [v3.424.0 · M7-X1 自纠] 原版用 `pick('worldlineId', …)` 这种**字符串键**取配置，
             *   功能上没错，但 v3160 [1b]「声明了就得有人按成员读」是按 `.KEY` 成员读形态判的 ⇒
             *   五个键全被判成「declared but never consumed」。两条路：给判据开例外，或让宿主真的读成员。
             *   选后者 —— 例外会把「字符串键读取」变成永久的判据盲区，而这个盲区正是「配置声明了但没人用」
             *   最想抓的形态。三级取值语义一个字不改：opts > 已存档 worldProg.worldline > 配置 > 默认。 */
            const has = (obj, k) => !!obj && Object.prototype.hasOwnProperty.call(obj, k);
            const pick = (k, cfgVal, fb) => (has(o, k) ? o[k] : (saved[k] !== undefined ? saved[k] : (cfgVal !== undefined ? cfgVal : fb)));
            /* ★ [v3.426.0 · 仿真自纠] 原来是 const —— 下面「当前纪元自动推进」要在缺配时回填，
             *   故改 let。语义一个字不改：仍是 opts > 存档 > 配置 > ''。 */
            let lineId = String(pick('worldlineId', cfg.worldlineId, '') || '').trim();
            const divergence = pick('worldlineDivergence', cfg.worldlineDivergence, 1.048596);
            /* ★ [v3.424.1 · 自纠] 吸引域分段此前**没有任何配置入口**（全仓 grep 'bands' 除内核外 0 命中），
             *   宿主 current 只给 {lineId, divergence}，七个出口传的也是 {} ⇒ 必然吃内核 DEFAULT_BANDS。
             *   使用者想按原作 α/β 分域无从下手，且内核旧默认把 1.x 全塞进 gamma。
             *   现开一个文本键：每行 `域名<上界` 或 `域名=上界`；看不懂就退回默认（不猜、不静默成空分段）。 */
            const bands = (function () {
                const raw = pick('worldlineBands', cfg.worldlineBands, '');
                if (Array.isArray(raw)) {
                    const keep = [];
                    for (let i = 0; i < raw.length; i++) {
                        const it = raw[i];
                        if (!it || typeof it !== 'object') continue;
                        const name = String(it.name === undefined ? '' : it.name).trim();
                        const hi = Number(it.hi);
                        if (name && Number.isFinite(hi)) keep.push({ name: name, hi: hi });
                    }
                    return keep;
                }
                if (raw && typeof raw === 'object') {
                    const keys = Object.keys(raw);
                    const keep = [];
                    for (let i = 0; i < keys.length; i++) {
                        const hi = Number(raw[keys[i]]);
                        if (Number.isFinite(hi)) keep.push({ name: String(keys[i]).trim(), hi: hi });
                    }
                    return keep;
                }
                const rows = [];
                const lines = String(raw || '').split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                    const s = lines[i].trim();
                    if (!s || s.charAt(0) === '#') continue;
                    /* 两种写法都收：`alpha<1.0`（区间上界语义，最直观）与 `alpha=1.0`（与收束表同形） */
                    const at = s.indexOf('<') >= 0 ? s.indexOf('<') : s.indexOf('=');
                    if (at <= 0) continue;
                    const name = s.slice(0, at).trim();
                    const hi = Number(s.slice(at + 1).trim());
                    if (!name || !Number.isFinite(hi)) continue;
                    rows.push({ name: name, hi: hi });
                }
                return rows;
            })();
            const convergences = (function () {
                const raw = pick('worldlineConvergences', cfg.worldlineConvergences, '');
                if (Array.isArray(raw)) return raw;
                if (raw && typeof raw === 'object') {
                    return Object.keys(raw).map((k) => ({ key: k, scope: raw[k] }));
                }
                const rows = [];
                const text = String(raw || '');
                const lines = text.split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                    const s = lines[i].trim();
                    if (!s || s.charAt(0) === '#') continue;
                    const at = s.indexOf('=');
                    if (at <= 0) { rows.push({ key: s, scope: [] }); continue; }   // 只给 key ⇒ scope 为空（不收束，但登记过）
                    const key = s.slice(0, at).trim();
                    const rhs = s.slice(at + 1).trim();
                    if (!key) continue;
                    if (rhs === 'all') { rows.push({ key: key, scope: 'all' }); continue; }
                    rows.push({ key: key, scope: rhs.split(/[，,\s]+/).filter(Boolean) });
                }
                return rows;
            })();
            const readers = (function () {
                const raw = pick('worldlineReaders', cfg.worldlineReaders, '');
                if (Array.isArray(raw)) return raw;
                return String(raw || '').split(/[，,\n]+/).map((x) => x.trim()).filter(Boolean);
            })();
            /* ★ [v3.425.0 · 纪元主键] 内核把主键从「变动率」换成「层标记@切换楼层」，
             *   那两样输入必须在**这里**喂进去，否则判据再对运行时也拿不到输入。
             *   ---- 切换登记表（jumps）----
             *   每行 `楼层:层标记` 或 `楼层=层标记`（如 `40:梦境一层` / `80=现实`），
             *   也收 `楼层:层标记:变动率`（数字编号是可选的，给了才参与邻近细分）。
             *   楼层是**磁盘事实**（消息索引），层标记是模型会稳定复用的那串字。
             *   看不懂的行跳过并计数 —— 不静默吞掉（否则卡里写错一行，闸就少一个纪元）。 */
            const jumpsSrc = (function () {
                const raw = pick('worldlineJumps', cfg.worldlineJumps, '');
                if (Array.isArray(raw)) {
                    const keep = [];
                    for (let i = 0; i < raw.length; i++) {
                        const it = raw[i];
                        if (!it || typeof it !== 'object') continue;
                        const f = Number(it.floor);
                        const lid = String(it.lineId === undefined ? (it.layer === undefined ? '' : it.layer) : it.lineId).trim();
                        if (!Number.isFinite(f) || f < 0 || !lid) continue;
                        const dv = (it.divergence === undefined || it.divergence === null || it.divergence === '')
                            ? null : Number(it.divergence);
                        keep.push({ floor: Math.floor(f), lineId: lid, divergence: Number.isFinite(dv) ? dv : null });
                    }
                    return { rows: keep, rejects: [], warns: [], entries: [] };
                }
                if (raw && typeof raw === 'object') {
                    const keys = Object.keys(raw);
                    const keep = [];
                    for (let i = 0; i < keys.length; i++) {
                        const f = Number(keys[i]);
                        const lid = String(raw[keys[i]] === undefined ? '' : raw[keys[i]]).trim();
                        if (!Number.isFinite(f) || f < 0 || !lid) continue;
                        keep.push({ floor: Math.floor(f), lineId: lid, divergence: null });
                    }
                    keep.sort((a, b) => a.floor - b.floor);
                    return { rows: keep, rejects: [], warns: [], entries: [] };
                }
                /* ★ [v3.429.0 · L12-O8] 文本形态改走 parseJumpsText（**唯一真源**）：
                 *   闸门与面板编辑器吃同一段解析，面板才不会把「闸会丢掉的行」说成没问题。
                 *   闸门侧行为逐字不变：仍是「坏行跳过 + 按楼层升序」，只是坏行现在**有名字**了
                 *   （jumpsSrc.rejects），面板拿去当场标红，不再静默。 */
                const parsed = parseJumpsText(raw);
                parsed.rows.sort((a, b) => a.floor - b.floor);
                return parsed;
            })();
            const jumps = jumpsSrc.rows;
            /* ---- 层标记别名表（layerAlias）----
             *   `原写法=归一键` 每行一条。★ 这张表由**卡作者**给，内核零内置 ——
             *   内核不许认识任何具体世界观（否则每加一张卡就要改内核）。 */
            const layerAlias = (function () {
                const raw = pick('worldlineLayerAlias', cfg.worldlineLayerAlias, '');
                const out = {};
                if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
                    const keys = Object.keys(raw);
                    for (let i = 0; i < keys.length; i++) {
                        const k = String(keys[i]).trim();
                        const v = String(raw[keys[i]] === undefined ? '' : raw[keys[i]]).trim();
                        if (k && v) out[k] = v;
                    }
                    return out;
                }
                const lines3 = String(raw || '').split(/\r?\n/);
                for (let i = 0; i < lines3.length; i++) {
                    const s3 = lines3[i].trim();
                    if (!s3 || s3.charAt(0) === '#') continue;
                    const at = s3.indexOf('=');
                    if (at <= 0) continue;
                    const k = s3.slice(0, at).trim();
                    const v = s3.slice(at + 1).trim();
                    if (k && v) out[k] = v;
                }
                return out;
            })();
            /* ---- 当前纪元的起线楼层 ----
             *   优先用配置（卡作者知道这一纪元从哪楼起）；
             *   没配则**不猜数字**，改为从跳跃登记表反推 —— 见下面 epochAdvance。
             *   ★ 两条途径都失效（无配置 + 无跳跃表）时留 null，
             *     条目退化成「只知道层标记、不知道纪元」，同号跨纪元那一格会落 unknown
             *     而不是被误判成 same。 */
            let startFloor = (function () {
                const raw = pick('worldlineStartFloor', cfg.worldlineStartFloor, null);
                if (raw === null || raw === undefined || raw === '') return null;
                const n = Number(String(raw).trim());
                return (Number.isFinite(n) && n >= 0) ? Math.floor(n) : null;
            })();
            /* ══ 当前纪元自动推进（v3.426.0 · 仿真自纠）════
             * 【修前实测】卡作者按 v3.425.0 的文档**只**登记 jumps、不填 worldlineStartFloor
             *   （这是文档里推荐的口径：楼层反推优先，手工配置是可选兜底）。结果：
             *   `_worldlineState({}).current = { lineId:'', divergence:1.048596, startFloor:null }`
             *   ⇒ epoch 为空 ⇒ guard 的「同号跨纪元」判据在整场对话里**永不触发**
             *   ⇒ 第 60 楼（α线@47）会把第 5 楼（α线@3）的第一纪元记忆当成自己的经历放行。
             *   即：**正确登记了跳跃表的卡反而失效**，而「跨纪元不串」正是本格存在的理由。
             * 【为什么这是宿主该做的事】jumps 是磁盘事实（楼层），当前楼层也是磁盘事实
             *   （`_currentFloor` / `currentStoryFloor()` 都有真实赋值点）。两张磁盘事实一起
             *   能算出的东西，不该反过来要卡作者手抄一遍 —— 手抄值会随剧情推进过期。
             * 【纪律】只在「当前纪元完全没配」时生效：
             *   ① 作者显式配了 worldlineStartFloor ⇒ 一个字不动（尊重手工口径，可覆盖反推）；
             *   ② 反推不出（无跳跃表 / 楼层早于首次跳跃 / 拿不到当前楼层）⇒ 保持 null，不猜；
             *   ③ 反推出的层标记与配置的 lineId 冲突 ⇒ 记 conflict，**不覆盖**作者配置的层标记
             *      （层标记是作者的命名，比楼层更可能是有意为之；冲突本身要可查）。 */
            const epochAdvance = (function () {
                const out = { applied: false, floor: null, why: '', conflict: '' };
                try {
                    if (startFloor !== null) { out.why = 'configured'; return out; }
                    if (!Array.isArray(jumps) || !jumps.length) { out.why = 'no-jumps'; return out; }
                    /* 当前楼层：opts > 宿主真源。两个真源都读不到就**不猜**（返回 null）。 */
                    let cf = null;
                    if (o.floor !== undefined && o.floor !== null && o.floor !== '') {
                        const n = Number(String(o.floor).trim());
                        if (Number.isFinite(n) && n >= 0) cf = Math.floor(n);
                    }
                    if (cf === null && engine && Number.isFinite(Number(engine._currentFloor)) && Number(engine._currentFloor) >= 0) {
                        cf = Math.floor(Number(engine._currentFloor));
                    }
                    if (cf === null && engine && typeof engine.currentStoryFloor === 'function') {
                        try {
                            const n2 = Number(engine.currentStoryFloor());
                            if (Number.isFinite(n2) && n2 >= 0) cf = Math.floor(n2);
                        } catch (_e) { /* 宿主成员缺席不是错误：退回不猜 */ }
                    }
                    if (cf === null) { out.why = 'no-current-floor'; return out; }
                    out.floor = cf;
                    /* 复用内核的 epochAt（**唯一**允许按楼层推身份的地方），不在此另写一份。 */
                    const WM = _worldlineMemoryLib();
                    if (!WM || typeof WM.epochAt !== 'function') { out.why = 'module-unavailable'; return out; }
                    const at = WM.epochAt(cf, jumps, { layerAlias: layerAlias });
                    if (!at || !at.epoch) { out.why = (at && at.why) || 'no-epoch'; return out; }
                    if (lineId && at.lineId && lineId !== at.lineId) {
                        /* 作者配置的层标记与楼层反推不一致：记因，但**保留作者配置的层标记**。
                         * 说的是一件真事：要么 jumps 少登记了一次回跳，要么 worldlineId 该更新了。 */
                        out.conflict = 'current-line-id-vs-jump-conflict';
                        out.why = 'conflict';
                        startFloor = at.startFloor;
                        return out;
                    }
                    if (!lineId) lineId = at.lineId;
                    startFloor = at.startFloor;
                    out.applied = true;
                    out.why = at.why;
                    return out;
                } catch (_e) { out.why = 'threw'; return out; }
            })();
            /* ---- 保留者策略 ----
             *   默认 'none'：**谁都不许串**（含主角）。只有显式写 'allow' 才恢复旧行为。
             *   写错一个词折回 none，不许变成全放行。 */
            const readerPolicy = (function () {
                const raw = String(pick('worldlineReaderPolicy', cfg.worldlineReaderPolicy, 'none') || '').trim();
                return (raw === 'allow') ? 'allow' : 'none';
            })();
            return {
                /* ★ [v3.425.0] current 带 startFloor：没有它，内核只能拿「层标记」判身份，
                 *   而「同一层标记出现两次」是本版最关键的一格（同号跨纪元必须判 far）。
                 *   楼层是磁盘事实，模型改不动 —— 这正是它取代变动率当主键的理由。 */
                current: { lineId: lineId, divergence: divergence, startFloor: startFloor },
                readers: readers,
                convergences: convergences,
                /* ★ [v3.424.1] 分段随 state 一起下传：读它的人（guard / convergenceOf / switchPlan /
                 *   line）与判据侧吃同一份口径，不再出现「判据用自定义域、读数用默认域」。
                 *   ★ [v3.425.0] 但**默认是空**（内核不再预设任何世界观分段）：
                 *     不配 bands ⇒ 吸引域不存在 ⇒ 数字编号完全不参与判定。 */
                bands: bands,
                /* ★ [v3.425.0] 纪元输入的三个新面孔 */
                jumps: jumps,
                startFloor: startFloor,
                layerAlias: layerAlias,
                readerPolicy: readerPolicy,
                adjacentPolicy: pick('worldlineAdjacentPolicy', cfg.worldlineAdjacentPolicy, 'hold'),
                lastGateRead: saved.lastGateRead || null,
                /* ★ [v3.426.0] 当前纪元是「配置」还是「按楼层推出来的」必须可查：
                 *   两者得出同一个 epoch 时行为一致，但**可信度不同** ——
                 *   推出来的那一份依赖 jumps 登记得对，配的那一份依赖卡作者当时写对。
                 *   诊断面看到 applied:true 而读数仍落 unknown，就知道该去查 jumps 了。 */
                epochAdvance: epochAdvance,
            };
        
    }

    function _worldlineRead(engine, opts) {
            /* 只读归属判定：给了 items 就逐条判，没给就只报当前线读数。
             *   ★ 开关默认关 —— 关着的时候**不判也不猜**，如实报 disabled，
             *     绝不返回一个「全 kept」的假安全面（那是把「没开闸」读成「都放行」）。 */
            const cfg = (engine && engine.config && engine.config.config) || {};
            const W = _worldlineMemoryLib();
            const st = engine._worldlineState(opts);
            const absent = (why) => ({
                kind: 'worldline_memory', version: 0, judged: false, disabled: true,
                current: null, reader: false, policy: '', counts: { total: 0, kept: 0, held: 0, blocked: 0, undecided: 0, malformed: 0, truncated: 0 },
                byState: { native: 0, adjacent: 0, foreign: 0, unknown: 0 }, kept: [], held: [], blocked: [], undecided: [],
                why: [why], ok: false, reason: why, writesNothing: true,
            });
            if (cfg.worldlineMemoryEnabled !== true) return absent('disabled');
            if (!W || typeof W.guard !== 'function') return absent('module-unavailable');
            try {
                const o = (opts && typeof opts === 'object') ? opts : {};
                /* ★ 局部名刻意不叫 items（叫 rows）：同文件 narrativeLayer 已有一处按 o.items 取数组的
                 *   同形语句，v3440 的真源码破坏锚点逐字取的就是那句 ⇒ 撞名会把那条负控制的
                 *   「锚点恰中 1 次」判据打红（本版实测踩到）。判据没错，是新代码该避让。
                 *   ★ 另一条自纠：改名必须**改全**。首改只换了下标名，下面「写缓存」那句仍读旧名，
                 *   抛出的 ReferenceError 被本函数的 catch 吞成 `thrown` —— 读到的是「静默降级」，
                 *   不是崩溃。故此处一并核对：本函数体内除 o.items 外不再出现那个旧局部名。 */
                const rows = Array.isArray(o.items) ? o.items : [];
                /* ★ [v3.425.0 · 自纠] `_worldlineViewer` 在全仓**零赋值点** ⇒ viewer 恒 ''，
                 *   于是「这条记忆给谁看」永远是「没人」⇒ 保留者判定恒 false ⇒
                 *   名单配置写什么都无效（等于整格功能没接线）。
                 *   现改为三级回落：opts.viewer > engine._worldlineViewer > engine._currentSpeaker。
                 *   `_currentSpeaker` 在 engine-recall.js 与 engine-injection-pipeline.js 有真实赋值，
                 *   是本仓既有的「当前发言者」真源。 */
                const viewer = (o.viewer !== undefined && o.viewer !== null && o.viewer !== '')
                    ? o.viewer
                    : ((engine && engine._worldlineViewer)
                        || (engine && engine._currentSpeaker)
                        || '');
                /* ★ [v3.425.0] 纪元输入必须透传：band/jumps/layerAlias/readerPolicy 缺一样，
                 *   内核就退回「只知道层标记」的弱判据，同号跨纪元那一格会漏。
                 *   viewer 也从 live 来（见 worldlineGate 的 _worldlineViewer 接线）——
                 *   没有 viewer，保留者判定恒 false，等于读者身份永远不明。 */
                const read = W.guard(rows, viewer, st, {
                    bands: st.bands,
                    adjacentPolicy: st.adjacentPolicy,
                    maxEntries: o.maxEntries,
                    jumps: st.jumps,
                    startFloor: st.startFloor,
                    layerAlias: st.layerAlias,
                    readerPolicy: st.readerPolicy,
                });
                const out = Object.assign({}, read, { ok: true, reason: rows.length ? '' : 'no-items', disabled: false, writesNothing: true, viewer: String(viewer || '') });
                /* 上一轮闸况落进 worldProg.worldline 只作**读数缓存**（不是判据）：诊断行要能
                 *   回答「上一轮挡下了几条」。写它有边界：只在真判过（items 非空）时写。 */
                if (rows.length && engine.worldProg) {
                    if (!engine.worldProg.worldline || typeof engine.worldProg.worldline !== 'object') engine.worldProg.worldline = {};
                    engine.worldProg.worldline.lastGateRead = { ts: Date.now(), counts: out.counts, byState: out.byState, policy: out.policy };
                }
                /* ★ 写回的键**不得与方法同名**：类实例上的赋值会遮蔽原型方法，
                 *   写成 engine._worldlineRead 会让第二次调用变成「把对象当函数调」。参照 returnGate 写 _returnGateRead。 */
                engine._worldlineReadOut = out;
                return out;
            } catch (e) { errLog(e, 'engine._worldlineRead'); return absent('thrown'); }
        
    }

    function worldlineGate(engine, opts) {
            /* 召回/注入侧用的便利出口：只回四桶 + 读数，调用方按 kept 取条目。
             *   ★ held（邻近可由保留者当预感）与 blocked 分列 —— 合成一个「不可用」桶
             *     会把「有资格当预感」与「完全不许提」抹成同形。 */
            const read = engine._worldlineRead(opts || {});
            if (!read.ok) return { kind: 'worldline_gate', gates: [], kept: [], held: [], blocked: [], undecided: [], counts: read.counts, byState: read.byState, policy: read.policy, ok: false, reason: read.reason, disabled: !!read.disabled, writesNothing: true };
            return {
                kind: 'worldline_gate', gates: read.kept, kept: read.kept, held: read.held, blocked: read.blocked, undecided: read.undecided,
                counts: read.counts, byState: read.byState, policy: read.policy, reader: read.reader, current: read.current,
                ok: true, reason: read.reason, disabled: false, writesNothing: true,
            };
        
    }

    function worldlineConvergence(engine, key, opts) {
            /* 收束查询：三态（converged / not-converged / unregistered）。
             *   ★ 开关关着也照答 —— 收束是**设定问题**，与「要不要开闸」无关；
             *     但会如实标 gated:false，防调用方把「关着闸时问的」当成「闸开着时的结论」。 */
            const cfg = (engine && engine.config && engine.config.config) || {};
            const W = _worldlineMemoryLib();
            if (!W || typeof W.convergenceOf !== 'function') return { kind: 'worldline_convergence', state: 'unregistered', why: 'module-unavailable', scope: [], ok: false, gated: false };
            try {
                const st = engine._worldlineState(opts);
                const r = W.convergenceOf(key, st, { bands: st.bands });
                return Object.assign({ kind: 'worldline_convergence', ok: true, gated: cfg.worldlineMemoryEnabled === true, policy: st.adjacentPolicy }, r);
            } catch (e) { errLog(e, 'engine.worldlineConvergence'); return { kind: 'worldline_convergence', state: 'unregistered', why: 'thrown', scope: [], ok: false, gated: false }; }
        
    }

    function worldlineSwitchPlan(engine, target, opts) {
            /* 换线计划：五桶（carry / shadow / invalidate / conflict / undecided）。
             *   ★ 只出计划不落盘 —— 「打算换到哪条线」与「已经换了」必须不同形。 */
            const W = _worldlineMemoryLib();
            if (!W || typeof W.switchPlan !== 'function') return { kind: 'worldline_switch_plan', ok: false, reason: 'module-unavailable', counts: {}, buckets: {}, writesNothing: true };
            try {
                const o = (opts && typeof opts === 'object') ? opts : {};
                const st = engine._worldlineState(o);
                const entries = Array.isArray(o.entries) ? o.entries : ((engine._worldlineEntries && engine._worldlineEntries()) || []);
                const r = W.switchPlan(target, { current: st.current, entries: entries, targetEntries: o.targetEntries }, { bands: st.bands });
                return Object.assign({ kind: 'worldline_switch_plan', ok: true, writesNothing: true }, r);
            } catch (e) { errLog(e, 'engine.worldlineSwitchPlan'); return { kind: 'worldline_switch_plan', ok: false, reason: 'thrown', counts: {}, buckets: {}, writesNothing: true }; }
        
    }

    function worldlineDiff(engine, itemsA, itemsB) {
            /* 两线差异：五态（same / changed / only-a / only-b / uncompared）。 */
            const W = _worldlineMemoryLib();
            if (!W || typeof W.diffEntries !== 'function') return { kind: 'worldline_diff', ok: false, reason: 'module-unavailable', counts: {}, rows: [] };
            try { return Object.assign({ kind: 'worldline_diff', ok: true }, W.diffEntries(itemsA, itemsB)); }
            catch (e) { errLog(e, 'engine.worldlineDiff'); return { kind: 'worldline_diff', ok: false, reason: 'thrown', counts: {}, rows: [] }; }
        
    }

    function _worldlineLine(engine) {
            try {
                const cfg = (engine && engine.config && engine.config.config) || {};
                if (cfg.worldlineMemoryEnabled !== true) return '未启用（世界线记忆开关为关）';
                const W = _worldlineMemoryLib();
                if (!W || typeof W.line !== 'function') return '模块未加载(worldline-memory.js)';
                const st0 = engine._worldlineState({});
                /* [v3.424.1] 读数与判据同口径：把分段一并交给 line()，不传就退回默认。 */
                const base = W.line(st0, { bands: st0.bands });
                /* 召回侧的过滤读数（engine-recall 写入）：它回答「上一轮召回里真被挡下几条」。
                 *   没有这一行，「闸被真用过」与「闸从未生效」在诊断面上同形。 */
                const rf = engine._worldlineRecallFilter;
                if (!rf) return base + ' · 召回侧尚未过闸';
                return base + ' · 上轮召回 ' + rf.before + '→' + rf.after
                    + '（挡下 ' + rf.blocked + ' / 押后 ' + rf.held + ' / 判不了放行 ' + rf.undecidedPassed + '）';
            } catch (e) { errLog(e, 'engine._worldlineLine'); return '—(诊断异常)'; }
        
    }

    function _materialInventory(engine, opts) {


            const o = (opts && typeof opts === 'object') ? opts : {};
            const inv = [];
            const sources = [];
            /* 每个来源一律:try 里取 → 归一 → 进池;**取不到 / 抛**都如实记名,
             *   绝不静默化成「这次没有材料」(那是完全不同的两件事)。 */
            const take = (name, fn, map) => {
                try {
                    const got = fn();
                    if (!got || got.ok !== true) { sources.push({ source: name, state: 'absent', why: (got && got.reason) || 'no-read', added: 0 }); return; }
                    const rows = map(got) || [];
                    for (const r of rows) if (r && typeof r === 'object') inv.push(r);
                    sources.push({ source: name, state: 'ok', why: '', added: rows.length });
                } catch (e) { errLog(e, 'engine._materialInventory.' + name); sources.push({ source: name, state: 'thrown', why: 'thrown', added: 0 }); }
            };
            /* 1 旧事重现(M3-X8):它的候选**已经**带 kind / triggerKey / detailKey / 来源与知情面
             *   —— 直接映射成材料面,不重算相关度。 */
            take('fated-recall', () => engine.fatedRecallSuggest(o.fated || {}), (got) => (Array.isArray(got.suggested) ? got.suggested : []).map((c) => ({
                id: 'fated:' + String(c.detailKey || c.entryKey || '') ,
                kind: c.kind || '', title: c.title || c.snippet || '', source: 'fated-recall',
                floor: (c.floor === undefined ? null : c.floor), subject: '', conflictGroup: '',
                restricted: (c.knowing === 'restricted'), future: false,
            })));
            /* 2 关系变化史(M3-X2):只取**有变化**的边(没变化的边对下一幕不是新材料)。 */
            take('relation', () => engine.relationHistory(o.relation || {}), (got) => (Array.isArray(got.pairs) ? got.pairs : []).slice(0, 8).map((p, i) => ({
                id: 'rel:' + String((p && (p.key || p.pairKey)) || i),
                facet: 'relation', title: (p && (p.title || p.summary)) || '关系变化', source: 'relation',
                floor: (p && p.floor !== undefined ? p.floor : null), subject: (p && p.subject) || '',
                conflictGroup: (p && p.conflictGroup) || '', restricted: false, future: false,
            })));
            /* 3 视角卡(M3-X4):当前视角不该知道的事 ⇒ 标受限(**交给内核的闸**,不在这里丢)。 */
            take('pov', () => engine.perspectiveCard(o.pov || {}), (got) => (Array.isArray(got.cards) ? got.cards : []).slice(0, 4).map((c, i) => ({
                id: 'pov:' + String((c && c.character) || i),
                facet: 'pov', title: '视角:' + String((c && c.character) || '') , source: 'pov',
                floor: (c && c.floor !== undefined ? c.floor : null), subject: (c && c.character) || '',
                conflictGroup: '', restricted: false, future: false,
            })));
            /* [v3.351.0 · M5-O5] 4a 场所图景:从 scene-book 的 summary() 取当前场所链，
             *   映射成 place 面材料。模块缺席或无场所 ⇒ absent（不冒充空）。 */
            take('scene', () => {
                if (!engine.scene || typeof engine.scene.summary !== 'function') return { ok: false, reason: 'no-scene' };
                const s = engine.scene.summary();
                if (!s || (!s.current && !s.currentChain?.length)) return { ok: false, reason: 'empty' };
                return { ok: true, summary: s };
            }, (got) => {
                const s = got.summary;
                const chain = Array.isArray(s.currentChain) ? s.currentChain : [];
                return chain.slice(-3).map((n, i) => ({
                    id: 'scene:' + String(n.key || n.name || ('node' + i)),
                    facet: 'place', title: String(n.name || n.key || ''),
                    source: 'scene', floor: (n.floor != null ? n.floor : null),
                    subject: '', conflictGroup: '', restricted: false, future: false,
                }));
            });
            /* [v3.351.0 · M5-O5] 4b 未完成约定:从 commitment-ledger 的 list() 取 open 条目，
             *   映射成 promise 面材料。模块缺席或无约定 ⇒ absent。 */
            take('commitment', () => {
                const CL = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
                if (!CL || typeof CL.list !== 'function' || !engine.worldProg) return { ok: false, reason: 'no-ledger' };
                const items = CL.list(engine.worldProg.commitmentLedger, { status: 'open' }) || [];
                if (!items.length) return { ok: false, reason: 'empty' };
                return { ok: true, items: items };
            }, (got) => (Array.isArray(got.items) ? got.items : []).slice(0, 8).map((c) => ({
                id: 'commit:' + String(c.id || ''),
                facet: 'promise', title: String(c.content || c.actor || ''),
                source: 'commitment', floor: (c.floor != null ? c.floor : null),
                subject: String(c.actor || ''), conflictGroup: '', restricted: false, future: false,
            })));
            /* 5 调用方直给(可选):调用方最清楚这一场要带什么;放最后,顺序即优先级。 */
            if (Array.isArray(o.materials)) for (const m of o.materials) inv.push(Object.assign({ source: 'caller' }, m));
            /* [v3.351.0 · M5-O4] 给每条材料附上事实状态：从 fact-state 的 readState 建 id→state 映射。
             *   材料包不自造裁决，只消费 factState（superseded/revoked 不进包）。
             *   模块缺席或无事实账 ⇒ 全部默认 active（不静默按新口径，也不静默丢弃）。 */
            try {
                const FS = _factStateLib();
                if (FS && typeof FS.readState === 'function' && engine._factVersionState) {
                    const rs = FS.readState(engine._factVersionState);
                    if (rs && Array.isArray(rs.entries)) {
                        const stateMap = {};
                        for (const e of rs.entries) stateMap[e.id] = e.state;
                        for (const m of inv) {
                            if (m.factState === undefined) {
                                const fid = String(m.id || '');
                                m.factState = stateMap[fid] || 'active';
                            }
                        }
                    }
                }
            } catch (e) { errLog(e, 'engine._materialInventory.factState'); }
            return { inventory: inv, sources: sources, given: Array.isArray(o.materials) ? o.materials.length : 0 };
        
    }

    function materialPack(engine, task, opts) {

            const absent = (why) => ({ kind: 'material_pack', version: 0, judged: false, task: '', taskLabel: '', pack: [], packIds: [], sheet: [], superseded: [], gaps: [], gapsCritical: [], held: { restricted: [], future: [], superseded: [], disputed: [], unclassified: [] }, budget: { given: false, perItem: 0 }, overBudget: [], cost: { items: 0, estChars: 0, estCharsAll: 0 }, counts: { inventory: 0, usable: 0, packed: 0, restricted: 0, future: 0, unclassified: 0, superseded: 0, disputed: 0, truncated: 0, dropped: 0, truncatedIn: 0 }, sources: [], reasons: [why], truncated: 0, orderIsRank: true, writesNothing: true, devisesNothing: true, injectsNothing: false, ok: false, reason: why });
            try {
                const MP = _materialPackLib();
                if (!MP || typeof MP.build !== 'function') return absent('module-unavailable');
                const o = (opts && typeof opts === 'object') ? opts : {};
                const asm = engine._materialInventory(o);
                const out = MP.build(task, asm.inventory, { budget: o.budget });
                const r = Object.assign({}, out, { sources: asm.sources, callerGiven: asm.given, ok: true, reason: out.malformedInput ? 'malformed' : (out.degraded ? 'degraded' : '') });
                engine._materialPackRead = r;
                return r;
            } catch (e) { errLog(e, 'engine.materialPack'); return absent('thrown'); }
        
    }

    function _materialPackLine(engine) {

            try {
                const MP = _materialPackLib();
                if (!MP || typeof MP.line !== 'function') return '模块未加载(material-pack.js)';
                const got = engine.materialPack('advance', {});
                if (!got.ok) return '材料包不可用(' + got.reason + ')';
                return MP.line(got);
            } catch (e) { errLog(e, 'engine._materialPackLine'); return '—(诊断异常)'; }
        
    }

    function _crosscheckChatRows(engine, opts) {

            const o = (opts && typeof opts === 'object') ? opts : {};
            const out = [];
            const sources = [];
            /* `ok` 键面**逐源不同**:有的出口恒 `ok: true`,有的(结构化查询)是
             *   `state` 键面 —— 故取样判据由调用方给,不硬写一个。 */
            const take = (name, fn, map, isOk) => {
                try {
                    const got = fn();
                    const good = (typeof isOk === 'function') ? isOk(got) : (!!got && got.ok === true);
                    if (!good) { sources.push({ source: name, state: 'absent', why: (got && (got.reason || got.state)) || 'no-read', added: 0 }); return; }
                    const rows = map(got) || [];
                    for (const r of rows) if (r && typeof r === 'object') out.push(r);
                    sources.push({ source: name, state: 'ok', why: '', added: rows.length });
                } catch (e) { errLog(e, 'engine._crosscheckChatRows.' + name); sources.push({ source: name, state: 'thrown', why: 'thrown', added: 0 }); }
            };
            /* 1 结构化证据查询(既有 owner `searchEvidenceStructured`):按台账取行,
             *   转成分区条目(partition 'chat')。只搬 ref / ledger / floor / title,
             *   **不搬正文全文**(本面不缓存正文)。★ 这走的是**结构化组合筛选**那一口,
             *   不是关键词打分口 —— 两者 `total` 含义不同,不合成一个口。 */
            take('evidence-query', () => engine.searchEvidenceStructured(o.query || {}, o.queryOpts || {}), (got) => {
                const rows = Array.isArray(got.rows) ? got.rows : [];
                return rows.slice(0, 120).map((r, i) => ({
                    id: 'Q' + String(i) + ':' + String((r && (r.ref || r.key)) || ''),
                    partition: 'chat', subject: (r && (r.title || r.subject)) || '',
                    title: (r && (r.title || r.subject)) || '', detail: (r && (r.text || r.detail)) || '',
                    status: (r && r.status) || '', ledger: (r && r.ledger) || '',
                    floor: (r && r.floor !== undefined ? r.floor : null), ref: (r && (r.ref || r.key)) || '',
                }));
            }, (got) => !!got && Array.isArray(got.rows));
            return { chat: out, sources: sources };
        
    }

    function loreCrosscheck(engine, sourceMode, opts) {

            const absent = (why) => ({ kind: 'lore_crosscheck', version: 0, judged: false, mode: '', modeLabel: '', judgements: [], needsConfirm: [], revoked: [], staleRefs: [], gaps: [], reasons: [why], counts: { lore: 0, chat: 0, note: 0, unknown: 0, judged: 0, matched: 0, divergent: 0, unrealized: 0, loreOnly: 0, chatOnly: 0, unchecked: 0, revoked: 0, dropped: 0, truncatedIn: 0, kept: 0 }, loreInCanon: false, admitted: false, noteIsNotSource: true, readsFullText: false, copiesFullText: false, online: false, writesNothing: true, devisesNothing: true, injectsNothing: false, ok: false, reason: why, sources: [] });
            try {
                const CX = _loreCrosscheckLib();
                if (!CX || typeof CX.build !== 'function') return absent('module-unavailable');
                const o = (opts && typeof opts === 'object') ? opts : {};
                /* 资料侧:调用方直给(通常来自 lore-import 的解析读数)优先;
                 *   剧情侧:调用方直给优先,缺则由装配点从既有 owner 收。 */
                const loreItems = Array.isArray(o.lore) ? o.lore.slice() : [];
                const noteItems = Array.isArray(o.note) ? o.note.slice() : [];
                let chatItems = Array.isArray(o.chat) ? o.chat.slice() : null;
                let sources = [];
                if (chatItems === null) {
                    const asm = engine._crosscheckChatRows(o);
                    chatItems = asm.chat; sources = asm.sources;
                } else sources = [{ source: 'caller', state: 'ok', why: '', added: chatItems.length }];
                /* [v3.350.0 · M5-O3] **来源覆盖**下传：逐源任一不是 ok（缺源 / 读源失败）⇒
                 *   「本次没看全」—— 查证侧据此判 unchecked，而**不是**说「未发生」。
                 *   覆盖完备时该键是 undefined，查证侧读作 complete ⇒ 读数与修前**逐字同形**，
                 *   既有套件与旧调用点零改动（下面这行字面量是当版判据的锁定锚点，不得改写）。 */
                const covOpts = {};
                if (sources.some((s) => s.state !== 'ok')) covOpts.chatCoverage = 'partial';
                const input = { lore: loreItems, chat: chatItems, note: noteItems };
                const out = CX.build(sourceMode, input, {
                    revokedKeys: o.revokedKeys, historyRefs: o.historyRefs, admitLore: o.admitLore,
                    chatCoverage: covOpts.chatCoverage,
                });
                const r = Object.assign({}, out, { sources: sources, ok: true, reason: out.malformedInput ? 'malformed' : (out.degraded ? 'degraded' : '') });
                engine._loreCrosscheckRead = r;
                return r;
            } catch (e) { errLog(e, 'engine.loreCrosscheck'); return absent('thrown'); }
        
    }

    function _loreCrosscheckLine(engine) {

            try {
                const CX = _loreCrosscheckLib();
                if (!CX || typeof CX.line !== 'function') return '模块未加载(lore-crosscheck.js)';
                const got = engine.loreCrosscheck('compare', {});
                if (!got.ok) return '资料对照不可用(' + got.reason + ')';
                return CX.line(got);
            } catch (e) { errLog(e, 'engine._loreCrosscheckLine'); return '—(诊断异常)'; }
        
    }

    function perspectiveContrast(engine, characterA, characterB, opts) {

        try {
        const PC = _perspectiveCardLib();
        if (!PC || typeof PC.contrast !== 'function') return { ok: false, reason: 'module-unavailable', diff: { onlyLeft: [], onlyRight: [], shared: [], misledSide: [] } };
        const o = opts || {};
        const a = engine.perspectiveCard(Object.assign({}, o, { character: String(characterA || '') }));
        const b = engine.perspectiveCard(Object.assign({}, o, { character: String(characterB || '') }));
        if (!a.ok || !b.ok) return { ok: false, reason: a.ok ? b.reason : a.reason, diff: { onlyLeft: [], onlyRight: [], shared: [], misledSide: [] } };
        const out = PC.contrast(a.cards[0] || null, b.cards[0] || null);
        return Object.assign({}, out, { ok: true });
        } catch (e) { errLog(e, 'engine.perspectiveContrast'); return { ok: false, reason: 'thrown', diff: { onlyLeft: [], onlyRight: [], shared: [], misledSide: [] } }; }
        
    }

    function _perspectiveCardLine(engine) {

        try {
        const PC = _perspectiveCardLib();
        if (!PC || typeof PC.line !== 'function') return '模块未加载（perspective-card.js）';
        const got = engine.perspectiveCard({});
        if (!got.ok) return '视角卡不可用（' + got.reason + '）';
        return PC.line(got);
        } catch (e) { errLog(e, 'engine._perspectiveCardLine'); return '—（诊断异常）'; }
        
    }

    function _extractionWindowFloors(engine, message) {

        try {
        const chat = (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
        ? (((window.SillyTavern.getContext() || {}).chat) || []) : [];
        const end = Number(message && message.index);
        if (!Number.isFinite(end) || end < 0) return { entries: [], omitted: 0, noFloor: 0, from: 0, to: null };
        const from = Math.max(0, end - 4);
        const entries = [];
        let omitted = 0;
        let noFloor = 0;
        for (let i = from; i <= end; i++) {
        const m = chat[i];
        if (!m) { noFloor++; continue; }
        if (typeof engine.isOmittedFloor === 'function' && engine.isOmittedFloor(m)) { omitted++; continue; }
        entries.push({ floor: i, text: m.mes || m.content || '' });
        }
        return { entries: entries, omitted: omitted, noFloor: noFloor, from: from, to: end };
        } catch (e) { errLog(e, 'engine._extractionWindowFloors'); return { entries: [], omitted: 0, noFloor: 0, from: 0, to: null }; }
        
    }

    function extractionPlan(engine, opts) {

        /* [v3.324.0 · D 包] **恒定键面**：缺席面必须与在场产出**逐字同键**（C 包同款纪律），
         *   否则下游按 `readings.unreadable` 断言会在模块缺席时读到 undefined —— 那与 0 处置相反。
         *   键序按内核 `ED.plan()` 的产出序，尾部补 ok/reason。 */
        const absent = (why) => ({ kind: 'extraction_driver', version: 0, floor: null, profile: '', profileKnown: false, rules: {}, due: [], batched: [], batchThisRound: [], deferredTypes: [], nextBatchFloor: null, unreadable: [], noFloor: [], missed: { floors: [], count: 0, noFloor: 0, neverDropped: true, why: '' }, regen: { scoped: false, floors: [], types: [], untouched: 0, why: '' }, readings: {}, zeroWrite: true, malformedInput: false, degraded: false, ok: false, reason: why });
        try {
        const ED = _extractionDriverLib();
        if (!ED || typeof ED.plan !== 'function') return absent('module-unavailable');
        const o = opts || {};
        const out = ED.plan({
        floor: o.floor,
        profile: (o.profile !== undefined ? o.profile : engine.config.config.extractionProfile),
        entries: Array.isArray(o.entries) ? o.entries : [],
        cadenceActive: o.cadenceActive,
        missedFloors: Array.isArray(o.missedFloors) ? o.missedFloors : [],
        regenFloors: Array.isArray(o.regenFloors) ? o.regenFloors : []
        }, { markers: o.markers });
        const r = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._extractionDriverRead = r;
        return r;
        } catch (e) { errLog(e, 'engine.extractionPlan'); return absent('thrown'); }
        
    }

    function _extractionDriverLine(engine) {

        try {
        const ED = _extractionDriverLib();
        if (!ED || typeof ED.line !== 'function') return '模块未加载（extraction-driver.js）';
        const got = engine.extractionPlan({});
        if (!got.ok) return '抽取节奏不可用（' + got.reason + '）';
        return ED.line(got);
        } catch (e) { errLog(e, 'engine._extractionDriverLine'); return '—（诊断异常）'; }
        
    }

    function correctionPlanReextract(engine, input, opts) {

        /* [v3.324.0 · D 包] **恒定键面**：键序按内核 `CP.planReextract()` 的产出序，尾部补 ok/reason。 */
        const absent = (why) => ({ kind: 'correction_plan@reextract', version: 0, face: 'data', scope: {}, items: [], byOutcome: { added: 0, kept: 0, replaced: 0, conflicted: 0 }, staged: { proposed: 0, selected: 0, rejected: 0 }, untouched: 0, rewritten: { floors: [], noFloor: 0, declared: false, why: '' }, retry: { pending: 0, keys: [], idempotentByFactKey: true, duplicatesPrevented: 0, nothingLostOnFailure: true }, readings: {}, writes: 0, applied: false, zeroWrite: true, scoped: false, decidable: false, why: '', malformedInput: false, degraded: false, ok: false, reason: why });
        try {
        const CP = _correctionPlanLib();
        if (!CP || typeof CP.planReextract !== 'function') return absent('module-unavailable');
        const out = CP.planReextract(input, opts || {});
        const r = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        engine._correctionPlanRead = r;
        return r;
        } catch (e) { errLog(e, 'engine.correctionPlanReextract'); return absent('thrown'); }
        
    }

    function correctionPlanConfig(engine, feedback, trace, opts) {

        /* [v3.324.0 · D 包] **恒定键面**：键序按内核 `CP.planConfigFix()` 的产出序（含 reason/why 两格），
         *   尾部补 ok。缺席时 `reason` 承载缺席归因（在场时它承载内核自述，通常为空串）。 */
        const absent = (why) => ({ kind: 'correction_plan@config', version: 0, face: 'config', candidates: [], count: 0, unknownClass: 0, scope: null, undo: { kinds: [], separate: true, configUndo: {}, factUndo: {}, note: '' }, applied: false, defaultAuto: false, writes: 0, zeroWrite: true, decidable: false, proof: 'unproven', compareState: 'absent', reason: why, why: '', malformedInput: false, degraded: false, ok: false });
        try {
        const CP = _correctionPlanLib();
        if (!CP || typeof CP.planConfigFix !== 'function') return absent('module-unavailable');
        const out = CP.planConfigFix(Array.isArray(feedback) ? feedback : [], trace || null, opts || {});
        const r = Object.assign({}, out, { ok: true });
        engine._correctionPlanRead = r;
        return r;
        } catch (e) { errLog(e, 'engine.correctionPlanConfig'); return absent('thrown'); }
        
    }

    function _correctionPlanLine(engine) {

        try {
        const CP = _correctionPlanLib();
        if (!CP || typeof CP.line !== 'function') return '模块未加载（correction-plan.js）';
        const data = engine.correctionPlanReextract({}, {});
        const cfg = engine.correctionPlanConfig([], null, {});
        if (!data.ok && !cfg.ok) return '纠错方案不可用（' + data.reason + '）';
        return CP.line(data) + ' · ' + CP.line(cfg);
        } catch (e) { errLog(e, 'engine._correctionPlanLine'); return '—（诊断异常）'; }
        
    }

    function _secretIsolationLine(engine) {

            try {
                const SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
                const read = engine.worldProg && engine.worldProg._secretRead;
                if (!read) return '本轮未注入秘密面';
                if (read.malformed && !read.rendered && !read.withheld) {
                    return '模块未加载或版本错配（secret-ledger.js 无 renderForViewer）——已 **fail-closed**（宁可不注入）';
                }
                if (!SL || typeof SL.line !== 'function') return '模块未加载（secret-ledger.js）';
                return SL.line(read);
            } catch (e) { errLog(e, 'engine._secretIsolationLine'); return '—（诊断异常）'; }
        
    }

    function _branchSemanticsLine(engine) {

            try {
                const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
                const read = engine.worldProg && engine.worldProg._branchSemanticsRead;
                if (!read) return '尚未对照';
                if (!BS || typeof BS.line !== 'function') return '模块未加载（branch-semantics.js）';
                const cmp = engine.worldProg && engine.worldProg.branchComparison;
                return BS.line(cmp || read);
            } catch (e) { errLog(e, 'engine._branchSemanticsLine'); return '—（诊断异常）'; }
        
    }

    async function confirmBranchImport(engine, opts = {}) {

            try {
                const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
                if (!BS || typeof BS.confirmImport !== 'function') return null;
                const seen = engine._branchImportSeen || (engine._branchImportSeen = {});
                const lease = { chatId: engine.getCurrentChatId(), epoch: engine._mutationEpoch };
                const wp = engine.worldProg;
                let applied = 0;
                /* 落盘结果三态：null=没尝试（无 storage）/ true=已落地 / false=落地被拒。
                 *   为什么单独记：回读的 `unreadable` 只说明「核不了」，而「核不了」的**原因**
                 *   分两种 —— 落盘被拒（防护拒绝 / 无落盘目标）与根本没有回读口。把两者并成
                 *   一个读数，用户就分不清「存失败」与「没法核」。 */
                let persisted = null;
                const receipt = await BS.confirmImport({
                    proposals: opts.proposals,
                    precheck: opts.precheck,
                    proposalId: opts.proposalId,
                    sourceRef: opts.sourceRef,
                    targetRef: opts.targetRef,
                    seen,
                    /* ① 真落笔：逐条走本器官的 owner 面（未持有的面如实拒绝）。 */
                    applyFn: (p) => {
                        if (!wp || typeof wp.applyBranchImport !== 'function') return { ok: false, reason: 'no-organ' };
                        const r = wp.applyBranchImport(p);
                        if (r && r.ok === true) applied++;
                        return r;
                    },
                    /* ② 保存后回读：先真落盘（走既有 StorageManager.save），再按来源计数核对。 */
                    readback: async () => {
                        if (!wp || typeof wp.branchImportCount !== 'function') return undefined;
                        if (typeof engine.storage?.save !== 'function') return undefined;
                        /* [v3.293.0] 修前形态：`const okSave = await save(...)` 后判 `!== true`
                         *   即 throw。三处问题：① 落盘被拒（false）与落盘抛异常被并成同一个
                         *   `unreadable` 读数，而本方法注释承诺「落盘失败 ⇒ persisted:false」——
                         *   注释与实现相反（本仓点名过的「注释说谎」形态）；② 少了 save 缺席
                         *   时「没尝试落盘」与「落盘被拒」的不同形；③ 回读口径取了「落笔前后
                         *   的差」——但 `readback` 是在 applyFn **之后**被调用的，那时的
                         *   「落笔前计数」**已经含**本次新增，差值恒为 0 ⇒ 每次落笔都报
                         *   mismatch（一条**永不成立的判据**）。故回读只报当前来源总数，
                         *   由契约侧与 `applied` 比对。 */
                        let okSave = null;
                        try { okSave = await engine.storage.save(engine.getCurrentChatId(), engine.collectExport()); }
                        catch (e) { errLog(e, 'engine.confirmBranchImport.save'); okSave = false; }
                        persisted = (okSave === true);
                        /* 回读只报**来源计数**（source:'branch-import' 的条数），不报 promises 总数：
                         *   总数把「本来就在的」也算进来，于是「一条都没落」与「落了两条」在读数上同形。 */
                        return Number(wp.branchImportCount()) || 0;
                    },
                });
                /* ③ 代际栅栏复核：落笔期间发生过回档/恢复/切聊 ⇒ 整批标记作废。
                 *   为什么不回滚已落的那部分：回滚会二次改状态，而真相是「这批基于旧代」——
                 *   如实回报比默默抹掉更可查（抹掉后没人知道曾经落过）。 */
                if (receipt) receipt.persisted = persisted;
                if (receipt && persisted === false && receipt.ok === true) {
                    /* 落盘被拒：内存里确实落了 `applied` 条，但它们**没落地** ——
                     *   与「已落地」是两件事，不得同形（本方法注释④的承诺）。 */
                    receipt.ok = false;
                    receipt.reason = 'persist-failed';
                }
                const stale = !engine._leaseValid(lease);
                if (stale) {
                    if (receipt) {
                        receipt.ok = false;
                        receipt.reason = 'epoch-changed';
                        receipt.stale = true;
                        receipt.applied = applied;
                    }
                    engine._leaseDrop(lease, 'branchImport', -1);
                }
                if (receipt && receipt.ok === true && receipt.proposalId && !receipt.duplicate) {
                    seen[receipt.proposalId] = { applied: Number(receipt.applied) || 0, at: Date.now() };
                }
                return receipt;
            } catch (e) { errLog(e, 'engine.confirmBranchImport'); return null; }
        
    }

    function _volumeContinuationLine(engine) {

            try {
                const VC = _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js');
                const read = engine.worldProg && engine.worldProg._volumeContinuationRead;
                if (!read) return '未选项目（维持隔离）';
                if (!VC || typeof VC.line !== 'function') return '模块未加载（volume-continuation.js）';
                return VC.line(read);
            } catch (e) { errLog(e, 'engine._volumeContinuationLine'); return '—（诊断异常）'; }
        
    }

    function _recallExplainLib(engine) {

            return _moduleLib(() => window.LonShaRecallExplain, 'recall-explain.js');
        
    }

    function explainRecallHost(engine) {

            try {
                const X = engine._recallExplainLib();
                if (!X || typeof X.explainRecall !== 'function') return { ok: false, reason: 'module-unavailable' };
                const _ra = Array.isArray(engine._recallAudit) ? engine._recallAudit : [];
                if (!_ra.length) return { ok: false, reason: 'no-audit' };
                const _fl = Number(engine._lastRecallFloor);
                let _rec = null;
                if (Number.isFinite(_fl)) {
                    for (let i = _ra.length - 1; i >= 0; i--) {
                        if (Number(_ra[i] && _ra[i].floor) === _fl) { _rec = _ra[i]; break; }
                    }
                } else {
                    _rec = _ra[_ra.length - 1];
                }
                if (!_rec) return { ok: false, reason: 'no-audit-for-floor' };

                /* 源表：名册源自账本；开关态只认确有配置键的源。
                 *   键的**作者位**是 recallMemory 里的各道门，这里只是把它们读出来 ——
                 *   值与门同源（读同一个 config 字段），不另立一套开关语义。 */
                const _SRC_SWITCH = {
                    vector: 'vectorEnabled', bm25: 'bm25Enabled', suspense: 'suspenseEnabled',
                    worldProg: 'worldProgressEnabled', neuralChain: 'neuralChainEnabled',
                    volume: 'summaryFoldEnabled', holiday: 'holidayAware',
                    pov: 'povIsolation', presence: 'presenceInjection',
                };
                const _perSource = (_rec.perSource && typeof _rec.perSource === 'object') ? _rec.perSource : null;
                const _keys = Array.isArray(_rec.srcKeys) && _rec.srcKeys.length ? _rec.srcKeys : Object.keys(_SRC_SWITCH);
                const sources = _keys.map((k) => {
                    const sw = _SRC_SWITCH[k];
                    /* 三态：有键且显式设过 ⇒ true/false；没设过或没有键 ⇒ null（不知道）。
                     *   「关着」与「不知道关没关」处置相反，不得合成一态。 */
                    let enabled = null;
                    if (sw) {
                        const v = engine.config && engine.config.config ? engine.config.config[sw] : undefined;
                        if (v !== undefined) enabled = (v !== false);
                    }
                    /* ⚠️ 源级命中数只在 `perSource` 里**出现过的源**才有值：
                     *   `_auditRecall` 只对非零命中写键，所以「键不在」的含义是
                     *   「本轮这个源没给非零命中」，**不是**「没读数」。
                     *   但「它在册且无错」时，缺席 == 0 条 —— 这是可判定的一致读法；
                     *   源级读数**不完整时不得据此倒推合计**（无合计读数时解释面判不了）。 */
                    const hit = (_perSource && Object.prototype.hasOwnProperty.call(_perSource, k))
                        ? Number(_perSource[k]) : 0;
                    return { key: k, label: k, enabled: enabled, hits: hit, switchKey: sw || '' };
                });

                /* 载荷面：轮次身份**无从核对** —— `_lastInjection` 不带可与本轮召回配对的键。
                 *   这里如实标『unknown』交给解释面，不编一个「对上了」。 */
                const _ir = (typeof engine.buildInjectionReadout === 'function') ? engine.buildInjectionReadout() : null;
                const injected = _ir ? { count: _ir.kept, refs: (_ir.blocks || []).filter((b) => b && b.kept).map((b) => b.ref) } : null;

                /* ★ 身份核对（内容级）：账本记的「本轮入选条目」vs **实际进了载荷的块**。
                 *   这两者来自不同面（收尾结果 / 构建回执），比对才有意义；
                 *   两边任一缺读数 ⇒ null（无从核对），**不算核对过**。 */
                const _aIds = (Array.isArray(_rec.injectedIds) ? _rec.injectedIds : []).filter(Boolean);
                const _pRefs = injected ? (injected.refs || []).filter(Boolean) : [];
                let _idMatched = null;
                if (_aIds.length && _pRefs.length) {
                    const _set = {};
                    for (const r of _pRefs) _set[String(r)] = true;
                    _idMatched = _aIds.some((x) => _set[String(x)] === true);
                }

                const _trace = engine._injectionTraceDraft;
                const _st = (_trace && _trace.stages) ? _trace.stages : null;
                const explanation = X.explainRecall({
                    query: { text: String((_rec.queryText || '')) + String((engine._lastCtxText || '')), floor: Number.isFinite(_fl) ? _fl : null },
                    sources: sources,
                    /* 别名面：宿主**没有**按轮次记录「挡下几条」的读数 ⇒ 如实留空
                     *   （解释面会把它记成「观测面缺读数·只收窄」，不是「没被过滤」）。
                     *   开关态与别名表规模是真读数，给出来。 */
                    alias: (() => {
                        let mapSize = null;
                        try {
                            const am = (typeof engine.buildAliasMap === 'function') ? engine.buildAliasMap() : null;
                            mapSize = (am && typeof am.size === 'number') ? am.size : null;
                        } catch (e) { mapSize = null; }
                        const cfg = (engine.config && engine.config.config) ? engine.config.config : {};
                        return {
                            expanded: (cfg.aliasQueryExpansion === undefined) ? null : (cfg.aliasQueryExpansion !== false),
                            mapSize: mapSize, filtered: null, switchKey: 'aliasQueryExpansion',
                        };
                    })(),
                    /* 有效性面：分项来自构建回执的 byRule（关系门 / POV 越界）。
                     *   `relationGated` 可能是 null（模块缺席），那一位**不得记 0**。 */
                    validity: _st ? (() => {
                        const byRule = {};
                        const r = _st.byRule || {};
                        if (Number.isFinite(r.relationGated)) byRule.relationGated = r.relationGated;
                        if (Number.isFinite(r.povOffstage)) byRule.povOffstage = r.povOffstage;
                        return { filtered: Number.isFinite(_st.validityFiltered) ? _st.validityFiltered : null, byRule: byRule };
                    })() : null,
                    budget: _trace ? {
                        preTrimChars: Number.isFinite(_trace.preTrimChars) ? _trace.preTrimChars : null,
                        budgetChars: Number.isFinite(_trace.budget) ? _trace.budget : null,
                        trimmed: _trace.trimmed === true,
                        dropped: Number.isFinite(_st && _st.budgetTrimmed) ? _st.budgetTrimmed : null,
                        kept: Number.isFinite(_st && _st.finalKept) ? _st.finalKept : null,
                        hardTruncated: _trace.hardTruncated === true,
                        switchKey: 'injectionBudget',
                    } : null,
                    injected: injected,
                    audit: {
                        /* [v3.296.0 收口] 走真源口的「数或 null」：旧判据 `Number.isFinite(Number(x))`
                         *   会把 null / '' / [] 一律读成 **0**（`Number(null) === 0`），于是「楼层未记」
                         *   与「第 0 楼」塌成同形 —— 与本档 recall-explain.js 消费 audit.floor 的口径冲突。 */
                        floor: engine._numOrNull(_rec.floor),
                        /* 宿主这一维**不可比**（query 不带楼层号），如实 unknown；
                         *   真正的身份核对走 idMatched。 */
                        floorMatched: 'unknown',
                        idMatched: _idMatched,
                        totalHits: Number.isFinite(_rec.totalHits) ? _rec.totalHits : null,
                        perSource: _perSource || {},
                        srcKeys: Array.isArray(_rec.srcKeys) ? _rec.srcKeys.slice() : [],
                    },
                });
                return explanation;
            } catch (e) { errLog(e, 'engine.explainRecallHost'); return { ok: false, reason: 'thrown', error: String((e && e.message) || e) }; }
        
    }

    function _recallExplainLine(engine) {

            try {
                const X = engine._recallExplainLib();
                if (!X || typeof X.line !== 'function') return '模块未加载（recall-explain.js）';
                const ex = engine.explainRecallHost();
                if (!ex || ex.ok !== true) {
                    if (ex && ex.reason === 'no-audit') return '暂无数据（本轮未跑召回自检 / 自检开关关闭）';
                    if (ex && ex.reason === 'no-audit-for-floor') return '本轮账本楼层对不上（按「判不了」处置，不倒推）';
                    return '读不出（' + String((ex && ex.reason) || '未知') + '）';
                }
                return X.line(ex);
            } catch (e) { errLog(e, 'engine._recallExplainLine'); return '—（诊断异常）'; }
        
    }

    function suggestRecallFixes(engine, explanation, opts) {

            try {
                const X = engine._recallExplainLib();
                if (!X || typeof X.suggestFor !== 'function') return { ok: false, reason: 'module-unavailable', suggestions: [], count: 0, autoParamTuning: false };
                const ex = explanation || engine.explainRecallHost();
                if (!ex || ex.ok !== true) return { ok: false, reason: 'no-explanation', suggestions: [], count: 0, autoParamTuning: false };
                return X.suggestFor(ex, opts || {});
            } catch (e) { errLog(e, 'engine.suggestRecallFixes'); return { ok: false, reason: 'thrown', suggestions: [], count: 0, autoParamTuning: false }; }
        
    }

    function buildVolumePack(engine, opts = {}) {

            try {
                const VC = _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js');
                if (!VC || typeof VC.buildContinuationPack !== 'function') return null;
                const r = VC.buildContinuationPack(opts);
                /* 读数**成功失败都记**：`selected:false`（没选项目）本身就是产品状态
                 *   （默认隔离），不记会让诊断行分不清「没选」与「没数据」。 */
                if (engine.worldProg && typeof engine.worldProg.noteVolumeContinuation === 'function') {
                    if (r && r.ok && r.pack) {
                        engine.worldProg.noteVolumeContinuation({
                            selected: true,
                            projectId: r.pack.projectId,
                            volumeTitle: r.pack.volumeTitle,
                            volumeCount: (opts.project && Array.isArray(opts.project.volumes)) ? opts.project.volumes.length : 0,
                            chapterCount: 0,
                            entryCount: r.pack.entries.length,
                            absentFaceCount: r.absentFaces.length,
                            absentFaces: r.absentFaces,
                            nameOnlyCount: 0,
                            hidden: r.hidden,
                            sourceState: null,
                            navigable: false,
                        });
                    } else {
                        engine.worldProg.noteVolumeContinuation({ selected: false });
                    }
                }
                return (r && r.ok) ? r : null;
            } catch (e) { errLog(e, 'engine.buildVolumePack'); return null; }
        
    }

    async function handoffVolumeContinuation(engine, opts = {}) {

            /* ★ 这两个必须声明在 `try` **之外**：catch 分支要引用它们记录「落过几条」的
             *   作废读数。修前放在 try 内的 `let` 声明，catch 里引用会抛 ReferenceError
             *   （块级作用域），而那一抛又被留痕块自己的 try 吞掉 ⇒ 留痕**永不出现在场**
             *   （实测：G9 报 `_lastVolumeHandoff` 为 undefined，账本却真落了 1 条）。 */
            let applied = 0;
            let persisted = null;
            try {
                const VC = _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js');
                if (!VC || typeof VC.handoffContinuation !== 'function') return null;
                const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
                const seen = engine._volumeHandoffSeen || (engine._volumeHandoffSeen = {});
                const lease = { chatId: engine.getCurrentChatId(), epoch: engine._mutationEpoch };
                const wp = engine.worldProg;
                const res = await VC.handoffContinuation({
                    pack: opts.pack,
                    target: opts.target,
                    select: opts.select,
                    allowReplace: opts.allowReplace === true,
                    allowNameLink: opts.allowNameLink === true,
                    liveSources: opts.liveSources,
                    dependents: opts.dependents,
                    proposalId: opts.proposalId,
                    /* 借 X6 的受控交接（在场即借；缺席则走 VC 自持退路）。 */
                    bs: BS || null,
                    applyFn: (p) => {
                        if (!wp || typeof wp.applyVolumeContinuation !== 'function') return { ok: false, reason: 'no-organ' };
                        const r = wp.applyVolumeContinuation(p);
                        if (r && r.ok === true) applied++;
                        return r;
                    },
                    readback: async () => {
                        if (!wp || typeof wp.volumeContinuationCount !== 'function') return undefined;
                        if (typeof engine.storage?.save !== 'function') return undefined;
                        let okSave = null;
                        try { okSave = await engine.storage.save(engine.getCurrentChatId(), engine.collectExport()); }
                        catch (e) { errLog(e, 'engine.handoffVolumeContinuation.save'); okSave = false; }
                        persisted = (okSave === true);
                        /* 只报**来源计数**（source:'volume-continuation' 的条数）。报 promises 总数
                         *   会把「本来就在的」也算进来 ⇒「一条没落」与「落了两条」同形。 */
                        return Number(wp.volumeContinuationCount()) || 0;
                    },
                    seen,
                });
                if (!res) return null;
                const receipt = res.receipt || null;
                if (receipt) receipt.persisted = persisted;
                if (receipt && persisted === false && receipt.ok === true) {
                    receipt.ok = false;
                    receipt.reason = 'persist-failed';
                }
                /* 代际栅栏复核：落笔期间回档/切聊 ⇒ 整批标记作废，但 `applied` **如实计数**
                 *   （抹掉已落的那部分会二次改状态，且没人知道曾经落过）。 */
                const stale = !engine._leaseValid(lease);
                if (stale) {
                    if (receipt) {
                        receipt.ok = false; receipt.reason = 'epoch-changed';
                        receipt.stale = true; receipt.applied = applied;
                    }
                    engine._leaseDrop(lease, 'volumeContinuation', -1);
                }
                if (receipt && receipt.ok === true && receipt.proposalId && !receipt.duplicate) {
                    seen[receipt.proposalId] = { applied: Number(receipt.applied) || 0, at: Date.now() };
                }
                /* 交接后刷新诊断读数（包级 + 预览结论）。 */
                if (engine.worldProg && typeof engine.worldProg.noteVolumeContinuation === 'function' && res.preview) {
                    const pv = res.preview;
                    engine.worldProg.noteVolumeContinuation({
                        selected: true,
                        projectId: (opts.pack && opts.pack.projectId) || null,
                        volumeTitle: (opts.pack && opts.pack.volumeTitle) || null,
                        volumeCount: 0, chapterCount: 0,
                        entryCount: Number(pv.willAdd || 0) + Number(pv.willReplace || 0),
                        absentFaceCount: (pv.absentFaces || []).length,
                        /* 面名与计数一起传：只有计数时，告警条件依赖每个调用点都记得传这一格。 */
                        absentFaces: pv.absentFaces || [],
                        nameOnlyCount: (pv.nameOnly || []).length,
                        hidden: (opts.pack && Number(opts.pack.hidden)) || 0,
                        sourceState: (pv.sourceState && pv.sourceState.state) || null,
                        navigable: pv.navigable === true,
                    });
                }
                return res;
            } catch (e) {
                /* ★ 这里的「降级返回 null」有一个真隐患：`applyFn` 是**同步真写器官账本**，
                 *   于是异常可能发生在「已经落了 N 条」之后（实测：落笔成功、`promises` 已多
                 *   一条，随后读栅栏时抛错 ⇒ 对外 `null`）。上层把 `null` 读成「没成」并重试，
                 *   就会**重复落笔**——账本真增条而回执说没成，两处不同形。
                 *   修法按本仓既有纪律：降级照旧（不把降级改成崩溃），但**先留一条可查的作废
                 *   读数**（落了条数 / 落盘三态 / 当前来源计数），让「落过但没回执」可被追。
                 *   留痕自身必须自兜：登记的失败不得成为新的失败。 */
                try {
                    const cnt = (engine.worldProg && typeof engine.worldProg.volumeContinuationCount === 'function')
                        ? engine.worldProg.volumeContinuationCount() : null;
                    engine._lastVolumeHandoff = {
                        at: Date.now(), why: 'threw', applied: applied, persisted: persisted,
                        count: cnt, err: (e && e.message) || String(e),
                    };
                } catch (_e) { /* 留痕失败就作罢：出口契约仍是「失败返回 null」 */ }
                errLog(e, 'engine.handoffVolumeContinuation');
                return null;
            }
        
    }

    async function revokeVolumeHandoff(engine, opts = {}) {

            try {
                const wp = engine.worldProg;
                if (!wp || typeof wp.revokeVolumeContinuation !== 'function') return null;
                const scope = (opts.scope && typeof opts.scope === 'object') ? opts.scope
                    : (opts.receipt && opts.receipt.revokeScope) ? opts.receipt.revokeScope : null;
                const r = wp.revokeVolumeContinuation(scope);
                if (!r) return null;
                /* 撤销真落地：撤了不落盘 ⇒ 重启后条目又「活着」，撤销就成了假动作。 */
                if (r.ok === true && r.revokedCount > 0 && typeof engine.storage?.save === 'function') {
                    let okSave = null;
                    try { okSave = await engine.storage.save(engine.getCurrentChatId(), engine.collectExport()); }
                    catch (e) { errLog(e, 'engine.revokeVolumeHandoff.save'); okSave = false; }
                    r.persisted = (okSave === true);
                    if (r.persisted === false) { r.ok = false; r.reason = 'persist-failed'; }
                } else {
                    r.persisted = null;
                }
                return r;
            } catch (e) { errLog(e, 'engine.revokeVolumeHandoff'); return null; }
        
    }

    function _promptFillLine(engine) {

            try {
                const FP = _moduleLib(() => window.LonShaFuzzyPatch, 'fuzzy-patch.js');
                const a = engine._promptFillRead, b = engine._promptFillReadRoles;
                if (!a && !b) return '尚未跑过提取';
                if (!FP || typeof FP.line !== 'function') return '模块未加载（fuzzy-patch.js）';
                const parts = [];
                if (a) parts.push('提取[' + FP.line(a) + ']');
                if (b) parts.push('角色[' + FP.line(b) + ']');
                const cfg = engine.config?._fuzzyPatchRead;
                if (cfg) parts.push('迁移[' + cfg.mode + (cfg.applied ? '·已迁' : '·未命中') + ']');
                return parts.join(' · ');
            } catch (e) { errLog(e, 'engine._promptFillLine'); return '—（诊断异常）'; }
        
    }

    function _changesetLine(engine) {

            try {
                const cs = _changeset();
                if (!cs) return '模块未加载（changeset.js）';
                return cs.summarize(true);
            } catch (e) { errLog(e, 'engine._changesetLine'); return '—（诊断异常）'; }
        
    }

    /* =========================================================================
     * [v3.428.0 · L12-O1] 五件零消费内核的真实业务回路
     * -------------------------------------------------------------------------
     * 修前实测（可复算）：
     *   for m in institutional-memory relation-dynamics character-agency-contract \
     *            symbolic-evolution era-inheritance; do echo "$m=$(grep -c "$m" index.js)"; done
     *   ⇒ 全部为 0。它们在 manifest.extra_js 登记在册、真被加载、单测全绿、
     *      selfCheck 真跑，而**产品端一次都没调用**。
     *   更糟的一层：memory-organs.js 里有 createInstitution / createSymbolicEntity /
     *   createEraTransition 等封装方法，看上去像已接线 —— 实测调用点
     *   （`\.createInstitution\s*\(`）**只在定义处自身**，没有任何外部调用者。
     *   这就是 V12 计划 Problem 第 1 条说的「功能级失效」，也是第 3 条说的
     *   「名字级判定被同名定义骗过去」在本仓的落地形态。
     *
     * 本处的接线纪律（与 v3.344.0 narrative-layer 同范式）：
     *   ① 取库口只读、不猜：模块缺席 ⇒ 返回**恒键缺席形**（键面与在场逐字同键，
     *      靠 ok:false + reason 区分），绝不返回「空数组」让下游把「没装」读成「没有」；
     *   ② 每个面三件套：读（xxxState）、动作（xxxAct，**不写存盘由调用方决定**）、
     *      诊断行（_xxxLine，一句话，给体检面用）；
     *   ③ 动作面只做**纯内核调用 + 落状态**，业务判断全在内核 —— 宿主这层不重写规则，
     *      重写一次就会出现「面板说的」与「内核判的」各说一套；
     *   ④ 全部 try/catch，异常的形态是 `reason:'thrown'` 而**不是**静默空。
     * ========================================================================= */

    /* ---- ① 制度记忆（institutional-memory.js）-----------------------------
     * 产品形态：组织卡（章程 / 惯例 / 在册成员 / 决议）+ 换届交接。
     * 两条方向相反的口径必须同时成立才是「制度记忆」而非「群聊记录」：
     *   · 离开组织不自动遗忘（人记得待过的地方）；
     *   · 未公开记录不越权进入个人视角（privateDossiers 只在本人视角可见）。
     * 内核已把这两条做进 performLeaderHandover / exportPublicCharter，本层不重判。 */
    function institutionState(engine, opts) {
        const absent = (why) => ({ kind: 'institution_memory', version: 0, institutions: 0, activeResolutions: 0, handovers: 0, items: [], privateVisible: 0, writesNothing: true, ok: false, reason: why });
        try {
            const IM = _institutionLib();
            if (!IM || typeof IM.createInstitution !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const list = (wp && Array.isArray(wp.institutions)) ? wp.institutions : [];
            const o = (opts && typeof opts === 'object') ? opts : {};
            const now = Number.isFinite(Number(o.now)) ? Number(o.now) : Date.now();
            const viewer = String(o.viewer || '').trim();
            let activeRes = 0, handovers = 0, privateVisible = 0;
            const items = [];
            for (const inst of list) {
                const active = (typeof IM.getActiveResolutions === 'function') ? IM.getActiveResolutions(inst, now) : [];
                activeRes += active.length;
                handovers += Array.isArray(inst.handoverLogs) ? inst.handoverLogs.length : 0;
                /* 私人材料可见性：**只有 viewer 本人**那一格算可见。
                 *   没有 viewer（面板未指定视角）⇒ 一格都不可见，并如实计入 privateVisible=0，
                 *   不把「没指定视角」当成「全都能看」。 */
                const dossiers = (inst.privateDossiers && typeof inst.privateDossiers === 'object') ? inst.privateDossiers : {};
                if (viewer && Object.prototype.hasOwnProperty.call(dossiers, viewer)) privateVisible += 1;
                items.push({
                    institutionId: inst.institutionId,
                    name: inst.name,
                    branchId: inst.branchId,
                    currentLeader: inst.currentLeader || '',
                    roles: Array.isArray(inst.roles) ? inst.roles.length : 0,
                    activeResolutions: active.length,
                    // ★ 只报**条数**，不把私人秘密正文带出来（与 v3.307.0 秘密三面收口同纪律）
                    privateDossierKeys: Object.keys(dossiers).length,
                });
            }
            const r = { kind: 'institution_memory', version: (IM.VERSION || 0), institutions: list.length, activeResolutions: activeRes, handovers, items, privateVisible, writesNothing: true, ok: true, reason: list.length ? '' : 'empty' };
            if (engine) engine._institutionRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.institutionState'); return absent('thrown'); }
    }

    function institutionAct(engine, action, payload) {
        /* 动作面：create / resolve / handover / charter 四类。
         *   ★ 刻意**不落盘**：worldProg 的状态改动由宿主既有持久化管线带走，
         *     本层写 engine.worldProg.institutions 就是在走那条管线，不再另存一份。 */
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const IM = _institutionLib();
            if (!IM || typeof IM.createInstitution !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            if (!Array.isArray(wp.institutions)) wp.institutions = [];
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};

            if (act === 'create') {
                /* ★ [v3.428.0 自纠] 修前这里要求 `wp.createInstitution` 这个**宿主方法**存在，
                 *   否则报 host-create-missing —— 结果是：动作面在**任何**没有 memory-organs
                 *   包装方法的宿主里都跑不动（无头测试、精简快照、跨仓引用全废）。
                 *   这与本层自己声明的纪律「动作面只做**纯内核调用** + 落状态」直接矛盾：
                 *   包装方法只是世界推进对象的便捷壳，**不是**内核契约的一部分。
                 *   改为直调 IM.createInstitution 并落进 wp.institutions（与 resolve 同形）。 */
                const inst = IM.createInstitution(p);
                if (!inst) return bad('create-returned-null');
                wp.institutions.push(inst);
                engine._institutionRead = null;
                return { ok: true, reason: '', writes: true, institutionId: inst.institutionId };
            }
            if (act === 'handover') {
                const id = String(p.institutionId || '').trim();
                if (!id) return bad('institution-id-required');
                const idx = wp.institutions.findIndex(x => x && x.institutionId === id);
                if (idx === -1) return bad('institution-not-found');
                if (typeof IM.performLeaderHandover !== 'function') return bad('kernel-handover-missing');
                /* 内核要求 spec.incomingLeader（缺就 throw）。两种调用形态都收：
                 *   扁平 { incomingLeader } 与嵌套 { nextLeader, handoverSpec }。 */
                const spec = Object.assign({}, (p.handoverSpec && typeof p.handoverSpec === 'object') ? p.handoverSpec : p);
                if (!spec.incomingLeader && p.nextLeader) spec.incomingLeader = String(p.nextLeader).trim();
                if (!spec.incomingLeader) return bad('incoming-leader-required');
                const updated = IM.performLeaderHandover(wp.institutions[idx], spec);
                if (!updated) return bad('kernel-handover-refused');
                wp.institutions[idx] = updated;
                engine._institutionRead = null;
                return { ok: true, reason: '', writes: true, leader: updated.currentLeader || '' };
            }
            if (act === 'resolve') {
                const id = String(p.institutionId || '').trim();
                const idx = wp.institutions.findIndex(x => x && x.institutionId === id);
                if (idx === -1) return bad('institution-not-found');
                if (typeof IM.addResolution !== 'function') return bad('kernel-add-resolution-missing');
                const updated = IM.addResolution(wp.institutions[idx], p.resolution || p);
                wp.institutions[idx] = updated;
                engine._institutionRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'charter') {
                const id = String(p.institutionId || '').trim();
                const inst = wp.institutions.find(x => x && x.institutionId === id);
                if (!inst) return bad('institution-not-found');
                if (typeof IM.exportPublicCharter !== 'function') return bad('kernel-charter-missing');
                /* 只读导出：不改状态，writes:false 是**真的**没写 */
                return { ok: true, reason: '', writes: false, charter: IM.exportPublicCharter(inst) };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.institutionAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _institutionLine(engine) {
        try {
            /* 口径：**现算**（诊断行要报的是「此刻的账」，不是「上次谁读过」）。
             *   与 _floorLedgerLine / _knowledgeNetworkLine 同规格：各行自己取数，
             *   不依赖别的调用者先跑过一遍。 */
            const r = institutionState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.institutions === 0) return '尚无组织登记';
            const leaderTop = r.items.filter(x => x.currentLeader).length;
            return `${r.institutions} 个组织 · 有效决议 ${r.activeResolutions} · 有负责人 ${leaderTop} · 换届 ${r.handovers}`;
        } catch (e) { errLog(e, 'engine._institutionLine'); return '—（诊断异常）'; }
    }

    /* ---- ② 关系动力（relation-dynamics.js）---------------------------------
     * 产品形态：一对人的「期待 / 付出 / 修复 / 释然」多轨账 + 和解状态。
     * 核心口径（内核已实现，本层不重判）：**单侧修复不得判成已和解** ——
     *   A 道歉但 B 尚未得知 ⇒ unilateral_repair_in_transit，绝不 reconciled。 */
    function relationDynamicsState(engine, opts) {
        const absent = (why) => ({ kind: 'relation_dynamics', version: 0, pairs: 0, items: [], unilateral: 0, reconciled: 0, degraded: false, writesNothing: true, ok: false, reason: why });
        try {
            const RD = _relationDynamicsLib();
            if (!RD || typeof RD.createRelationDynamics !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const store = (wp && wp.relationDynamics && typeof wp.relationDynamics === 'object') ? wp.relationDynamics : {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.pairKey || '').trim();
            const items = [];
            let unilateral = 0, reconciled = 0, degraded = false;
            for (const key of Object.keys(store)) {
                if (only && key !== only) continue;
                const dyn = store[key];
                if (!dyn || typeof dyn !== 'object') { degraded = true; continue; }
                const d = (typeof RD.deriveRelationDynamics === 'function') ? RD.deriveRelationDynamics(dyn, o) : null;
                if (!d) { degraded = true; continue; }
                if (d.unilateralPending) unilateral += 1;
                if (d.isReconciled) reconciled += 1;
                items.push({
                    pairKey: key,
                    charA: dyn.charA || '', charB: dyn.charB || '',
                    reconciliationStatus: d.reconciliationStatus || 'none',
                    isReconciled: !!d.isReconciled,
                    unilateralPending: !!d.unilateralPending,
                    expectations: Array.isArray(dyn.expectations) ? dyn.expectations.length : 0,
                    contributions: Array.isArray(dyn.contributions) ? dyn.contributions.length : 0,
                    breaches: Array.isArray(dyn.breaches) ? dyn.breaches.filter(b => !b.isRelieved).length : 0,
                });
            }
            const r = { kind: 'relation_dynamics', version: (RD.VERSION || 0), pairs: items.length, items, unilateral, reconciled, degraded, writesNothing: true, ok: true, reason: items.length ? (degraded ? 'degraded' : '') : 'empty' };
            if (engine) engine._relationDynamicsRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.relationDynamicsState'); return absent('thrown'); }
    }

    function relationDynamicsAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const RD = _relationDynamicsLib();
            if (!RD || typeof RD.createRelationDynamics !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            if (!wp.relationDynamics || typeof wp.relationDynamics !== 'object') wp.relationDynamics = {};
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            const a = String(p.charA || '').trim();
            const b = String(p.charB || '').trim();
            /* 键设计：**双向归一键**（字典序拼接）——「甲对乙」与「乙对甲」是同一条关系，
             *   两个键会在往返中漂成两对，正是本仓点名的「按名聚合把同一对算成两对」形态。 */
            const pairKey = p.pairKey ? String(p.pairKey).trim() : ([a, b].filter(Boolean).sort().join('|'));
            if (!pairKey || pairKey === '|') return bad('pair-key-required');
            if (!wp.relationDynamics[pairKey]) {
                wp.relationDynamics[pairKey] = RD.createRelationDynamics({ charA: a || pairKey.split('|')[0], charB: b || pairKey.split('|')[1] });
            }
            const dyn = wp.relationDynamics[pairKey];
            if (act === 'expectation') {
                if (typeof RD.recordExpectation !== 'function') return bad('kernel-missing');
                const out = RD.recordExpectation(dyn, p);
                /* ★ [v3.428.0 自纠] 修前直接把 record* 的**返回值**写回存储 ——
                 *   而内核返回的是信封 `{ok, dynamics, expectation}`，账本本体在 `.dynamics`。
                 *   写信封的后果：第二次动作时 `dyn` 已是信封，`createRelationDynamics(信封)`
                 *   归一出一个空账 ⇒ 期待/付出/修复**全部丢失**，而每次调用都报 ok:true。
                 *   这正是「函数返回了对象」型假绿的典型：判据只看 ok，没看状态真的进去了。 */
                if (!out || out.ok !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                wp.relationDynamics[pairKey] = out.dynamics;
                engine._relationDynamicsRead = null;
                return { ok: true, reason: '', writes: true, pairKey };
            }
            if (act === 'contribution') {
                if (typeof RD.recordContribution !== 'function') return bad('kernel-missing');
                const out = RD.recordContribution(dyn, p);
                if (!out || out.ok !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                wp.relationDynamics[pairKey] = out.dynamics;
                engine._relationDynamicsRead = null;
                return { ok: true, reason: '', writes: true, pairKey };
            }
            if (act === 'repair') {
                if (typeof RD.recordRepairAttempt !== 'function') return bad('kernel-missing');
                const out = RD.recordRepairAttempt(dyn, p);
                if (!out || out.ok !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                wp.relationDynamics[pairKey] = out.dynamics;
                engine._relationDynamicsRead = null;
                return { ok: true, reason: '', writes: true, pairKey };
            }
            if (act === 'relief') {
                if (typeof RD.recordRelief !== 'function') return bad('kernel-missing');
                const out = RD.recordRelief(dyn, p.itemType, p.itemId, p.reason, p.floor);
                if (!out || out.ok !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                wp.relationDynamics[pairKey] = out.dynamics;
                engine._relationDynamicsRead = null;
                return { ok: true, reason: '', writes: true, pairKey };
            }
            /* 场景上下文（只读）：给注入面用，**不改状态** */
            if (act === 'context') {
                if (typeof RD.formatForSceneContext !== 'function') return bad('kernel-missing');
                return { ok: true, reason: '', writes: false, pairKey, context: RD.formatForSceneContext(dyn, String(p.viewpointChar || a)) };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.relationDynamicsAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _relationDynamicsLine(engine) {
        try {
            const read = relationDynamicsState(engine, {});
            if (!read.ok) return '不可用 · ' + read.reason;
            if (read.pairs === 0) return '尚无关系动力账';
            return `${read.pairs} 对 · 单侧修复待确认 ${read.unilateral} · 已和解 ${read.reconciled}` + (read.degraded ? ' · 含畸形账' : '');
        } catch (e) { errLog(e, 'engine._relationDynamicsLine'); return '—（诊断异常）'; }
    }

    /* ---- ③ 人物行动与心智契约（character-agency-contract.js）---------------
     * 三件事合一：信念演化（可以有理由地误解）/ 经验与习惯（怎么做、何时例外）/
     *             缺席与期待（该发生却没发生 ⇒ 区分「窗口未过」与「确认缺席」）。 */
    function agencyContractState(engine, opts) {
        const absent = (why) => ({ kind: 'agency_contract', version: 0, beliefs: 0, habits: 0, expectations: 0, pending: 0, delayed: 0, confirmedAbsent: 0, items: [], degraded: false, writesNothing: true, ok: false, reason: why });
        try {
            const AC = _agencyContractLib();
            if (!AC || typeof AC.createBelief !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const beliefs = (wp && Array.isArray(wp.beliefs)) ? wp.beliefs : [];
            const habits = (wp && Array.isArray(wp.habitRepos)) ? wp.habitRepos : [];
            const exps = (wp && Array.isArray(wp.absenceExpectations)) ? wp.absenceExpectations : [];
            let pending = 0, delayed = 0, confirmedAbsent = 0;
            for (const e of exps) {
                const st = String((e && e.status) || '');
                /* ★ [v3.428.0 自纠] 内核状态机用 **waiting**（见 createAbsenceExpectation 的
                 *   取值域），修前只认 `pending` ⇒ 「观察窗口未过」的那批既不计待确认、
                 *   也不计延迟/缺席，三态加起来对不上总数（面板会显示 0/0/0 而实际有账）。 */
                if (st === 'waiting' || st === 'pending' || st === 'unconfirmed_delay') pending += 1;
                if (st === 'delayed_received') delayed += 1;
                if (st === 'confirmed_absence') confirmedAbsent += 1;
            }
            const r = { kind: 'agency_contract', version: (AC.VERSION || 0), beliefs: beliefs.length, habits: habits.length, expectations: exps.length, pending, delayed, confirmedAbsent, items: [], degraded: false, writesNothing: true, ok: true, reason: (beliefs.length + habits.length + exps.length) ? '' : 'empty' };
            if (engine) engine._agencyContractRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.agencyContractState'); return absent('thrown'); }
    }

    function agencyContractAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const AC = _agencyContractLib();
            if (!AC || typeof AC.createBelief !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            if (act === 'belief-add') {
                if (typeof AC.createBelief !== 'function') return bad('kernel-missing');
                if (!Array.isArray(wp.beliefs)) wp.beliefs = [];
                /* 同一 actor+subject 已存在 ⇒ **演化**而不是新增（新增会让「误解→改观」被拆成两条无因果的记录） */
                const actor = String(p.actor || '').trim();
                const subject = String(p.subject || '').trim();
                const idx = wp.beliefs.findIndex(x => x && String(x.actor) === actor && String(x.subject) === subject);
                if (idx >= 0) {
                    if (typeof AC.evolveBelief !== 'function') return bad('kernel-missing');
                    /* ★ [v3.428.0 自纠] 两处错一起改：
                     *   ① 返回的是信封 `{ok, belief, changed, reason}`，本体在 `.belief`；
                     *   ② 内核在 `observerActor !== belief.actor` 时**拒绝演化**
                     *      （返回 ok:false / unchanged），修前一律报 evolved —— 于是
                     *      「别人视角想改他的信念」静默成功，状态其实没动。
                     *   不传 observerActor 时按「本人视角」处理（面板/LLM 的常见形态）。 */
                    const obs = (p.observerActor !== undefined && p.observerActor !== null)
                        ? String(p.observerActor) : String(wp.beliefs[idx].actor || '');
                    /* ★ 证据允许裸字符串：内核按 `evidence.content / grade / isCounterEvidence`
                     *   读，裸串会让 content 被洗成 ''（改观理由变空）。 */
                    const ev = (typeof p.evidence === 'string') ? { content: p.evidence }
                        : (p.evidence && typeof p.evidence === 'object') ? p.evidence : {};
                    const out = AC.evolveBelief(wp.beliefs[idx], ev, obs);
                    if (!out || out.ok !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                    wp.beliefs[idx] = out.belief;
                    engine._agencyContractRead = null;
                    return { ok: true, reason: (out.reason || ''), writes: true, mode: out.changed === true ? 'evolved' : 'unchanged' };
                }
                /* ★ [v3.428.0 自纠] 内核键是 interpretation（修前原样透传 p，写 `belief:`
                 *   会被 _str(undefined) 洗成 ''，于是信念只有主语没有内容）。 */
                const bspec = Object.assign({}, p, {
                    interpretation: (p.interpretation !== undefined) ? p.interpretation : p.belief,
                });
                wp.beliefs.push(AC.createBelief(bspec));
                engine._agencyContractRead = null;
                return { ok: true, reason: '', writes: true, mode: 'created' };
            }
            if (act === 'practice') {
                if (typeof AC.recordPractice !== 'function') return bad('kernel-missing');
                if (!Array.isArray(wp.habitRepos)) wp.habitRepos = [];
                /* ★ [v3.428.0 自纠] 内核 createHabitRepo 的键是 **actor**，修前写 charKey ——
                 *   createHabitRepo 只取它认识的键，`charKey` 被静默丢弃 ⇒ 习惯库永远
                 *   `actor:''`，按角色寻址一律落空（每条练习都新建一个空主的库）。
                 *   同时 recordPractice 的返回值是信封，本体在 `.repo`。 */
                const ck = String(p.charKey || p.actor || '').trim();
                if (!ck) return bad('char-key-required');
                let repo = wp.habitRepos.find(x => x && String(x.actor) === ck);
                if (!repo) {
                    if (typeof AC.createHabitRepo !== 'function') return bad('kernel-missing');
                    repo = AC.createHabitRepo({ actor: ck });
                    wp.habitRepos.push(repo);
                }
                const out = AC.recordPractice(repo, p);
                if (!out || out.ok !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                const ri = wp.habitRepos.findIndex(x => x && String(x.actor) === ck);
                if (ri >= 0) wp.habitRepos[ri] = out.repo;
                engine._agencyContractRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'expect') {
                if (typeof AC.createAbsenceExpectation !== 'function') return bad('kernel-missing');
                if (!Array.isArray(wp.absenceExpectations)) wp.absenceExpectations = [];
                /* ★ [v3.428.0 自纠] 内核字段名是 holder / targetActor / expectedAction /
                 *   deadlineStoryClock，修前把 payload 原样透传 ⇒ 四个字段被洗成 ''，
                 *   期待变成「无主无对象 deadline=0」的空壳，evaluate 时立刻越过观察窗口。
                 *   这里做一次显式映射（面板/LLM 用自然名，内核用契约名，两边都不改）。 */
                const expSpec = {
                    id: p.id || p.expectationId,
                    holder: p.holder !== undefined ? p.holder : p.expecter,
                    targetActor: p.targetActor !== undefined ? p.targetActor : p.target,
                    expectedAction: p.expectedAction !== undefined ? p.expectedAction : p.content,
                    deadlineStoryClock: p.deadlineStoryClock !== undefined ? p.deadlineStoryClock : p.dueClock,
                    status: p.status,
                };
                const expObj = AC.createAbsenceExpectation(expSpec);
                if (!expObj.holder) return bad('expecter-required');
                wp.absenceExpectations.push(expObj);
                engine._agencyContractRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'evaluate') {
                if (typeof AC.evaluateExpectation !== 'function') return bad('kernel-missing');
                const id = String(p.expectationId || '').trim();
                const idx = wp.absenceExpectations.findIndex(x => x && String(x.id || x.expectationId) === id);
                if (idx === -1) return bad('expectation-not-found');
                const out = AC.evaluateExpectation(wp.absenceExpectations[idx], p.clock, p.observerContext || {});
                if (out && out.expectation) wp.absenceExpectations[idx] = out.expectation;
                engine._agencyContractRead = null;
                /* ★ 三态如实透传：pending / unconfirmed_delay / confirmed_absence 是**三种不同的事实**，
                 *   「没等到」不等于「确认缺席」，本层不合并。 */
                return { ok: true, reason: '', writes: true, status: (out && out.status) || '', why: (out && out.reason) || '' };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.agencyContractAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _agencyContractLine(engine) {
        try {
            const r = agencyContractState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.beliefs === 0 && r.habits === 0 && r.expectations === 0) return '尚无心智扩展账';
            return `信念 ${r.beliefs} · 习惯库 ${r.habits} · 期待 ${r.expectations}（待确认 ${r.pending} / 确认缺席 ${r.confirmedAbsent}）`;
        } catch (e) { errLog(e, 'engine._agencyContractLine'); return '—（诊断异常）'; }
    }

    /* ---- ④ 意象与意义变迁（symbolic-evolution.js）-------------------------
     * 产品形态：任一物件/地点/话语的「意义」抽屉 —— 多义并列、逐条带来源、
     *   人物差异对比、**反例单列**（谁不这么看）。
     * 核心口径：意义是**视角**不是事实 ⇒ 永远不写回事实 owner。 */
    function symbolicEvolutionState(engine, opts) {
        const absent = (why) => ({ kind: 'symbolic_evolution', version: 0, entities: 0, items: [], multiMeaning: 0, withObjection: 0, degraded: false, writesNothing: true, ok: false, reason: why });
        try {
            const SE = _symbolicEvolutionLib();
            if (!SE || typeof SE.getActiveMeaning !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const list = (wp && Array.isArray(wp.symbolicEntities)) ? wp.symbolicEntities : [];
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.entityId || '').trim();
            let multiMeaning = 0, withObjection = 0, degraded = false;
            const items = [];
            for (const ent of list) {
                if (only && String(ent && ent.entityId) !== only) continue;
                const am = SE.getActiveMeaning(ent);
                if (!am) { degraded = true; continue; }
                /* ★ [v3.428.0 自纠] 内核 `getActiveMeaning` 返回的字段是 **perspectives**
                 *   （{actorId: [{meaning, appearanceIndex, at}]}），修前读 `.byActor` —
                 *   恒 undefined ⇒ byActor 恒空 ⇒ **多义永远计 0、视角持有者永远不显示**。
                 *   这是「读面按自己以为的字段名取数」，比不接线更坏：面板有数、数是零。 */
                const byActor = {};
                for (const k of Object.keys(am.perspectives || {})) {
                    const v = am.perspectives[k];
                    if (v && v.length) byActor[k] = v;
                }
                const actorCount = Object.keys(byActor).length;
                if (actorCount >= 2) multiMeaning += 1;
                /* 反例判定：**作者否定过的解释**才是反例（revoked 保留可查、不再注入）。
                 *   修前从 byActor（视角层）里找 `layer==='objection'` —— 视角层条目
                 *   结构是 {meaning, appearanceIndex, at}，**没有 layer 字段**，
                 *   于是反例永远计 0（面板上「含反例」恒不亮）。 */
                const objections = [];
                for (const layerName of ['confirmed', 'candidate']) {
                    const arr = Array.isArray(ent[layerName]) ? ent[layerName] : [];
                    for (const m of arr) {
                        if (m && m.revoked === true) objections.push({ actor: String(m.by || ''), meaning: m.meaning || '', layer: layerName });
                    }
                }
                if (objections.length) withObjection += 1;
                items.push({
                    entityId: ent.entityId,
                    name: ent.name || ent.label || ent.entityId,
                    appearances: Array.isArray(ent.appearances) ? ent.appearances.length : 0,
                    actorCount,
                    byActor,
                    objections,
                });
            }
            const r = { kind: 'symbolic_evolution', version: (SE.VERSION || 0), entities: items.length, items, multiMeaning, withObjection, degraded, writesNothing: true, ok: true, reason: items.length ? (degraded ? 'degraded' : '') : 'empty' };
            if (engine) engine._symbolicEvolutionRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.symbolicEvolutionState'); return absent('thrown'); }
    }

    function symbolicEvolutionAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const SE = _symbolicEvolutionLib();
            if (!SE || typeof SE.createSymbolicEntity !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            if (!Array.isArray(wp.symbolicEntities)) wp.symbolicEntities = [];
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            const eid = String(p.entityId || '').trim();
            const idx = wp.symbolicEntities.findIndex(x => x && String(x.entityId) === eid);
            if (act === 'create') {
                if (!eid) return bad('entity-id-required');
                if (idx >= 0) return bad('entity-exists');
                const ent = SE.createSymbolicEntity(p);
                if (!ent) return bad('kernel-returned-null');
                wp.symbolicEntities.push(ent);
                engine._symbolicEvolutionRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (idx === -1) return bad('entity-not-found');
            if (act === 'meaning') {
                if (typeof SE.addPerspectiveMeaning !== 'function') return bad('kernel-missing');
                /* ★ [v3.428.0 自纠] 这四个内核**原地修改**传入实体并返回信封 `{ok, reason}`。
                 *   修前把信封写回 `wp.symbolicEntities[idx]` ⇒ 实体整个被替换成
                 *   `{ok,reason,entry}`，第二次动作 findIndex 立刻 entity-not-found
                 *   （实测：同一意象只能写一条意义）。原地改的语义就够，槽位不动。 */
                const outM = SE.addPerspectiveMeaning(wp.symbolicEntities[idx], String(p.actorId || '').trim(), p.meaning, p.at);
                if (!outM || outM.ok !== true) return bad('kernel-refused:' + ((outM && outM.reason) || 'unknown'));
                engine._symbolicEvolutionRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'appearance') {
                if (typeof SE.logAppearance !== 'function') return bad('kernel-missing');
                const outA = SE.logAppearance(wp.symbolicEntities[idx], p);
                if (!outA || outA.ok !== true) return bad('kernel-refused:' + ((outA && outA.reason) || 'unknown'));
                engine._symbolicEvolutionRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'confirm') {
                if (typeof SE.confirmSymbol !== 'function') return bad('kernel-missing');
                const outC = SE.confirmSymbol(wp.symbolicEntities[idx], p.meaning, p.by, p.at);
                if (!outC || outC.ok !== true) return bad('kernel-refused:' + ((outC && outC.reason) || 'unknown'));
                engine._symbolicEvolutionRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'revoke') {
                if (typeof SE.revokeSymbolicClaim !== 'function') return bad('kernel-missing');
                const outR = SE.revokeSymbolicClaim(wp.symbolicEntities[idx], p.meaning, p.layer);
                if (!outR || outR.ok !== true) return bad('kernel-refused:' + ((outR && outR.reason) || 'unknown'));
                /* 找不到匹配项不是失败（可能已被否定过），但要如实报 0 条。 */
                if (outR.revoked === 0) return { ok: true, reason: 'no-match', writes: false, revoked: 0 };
                engine._symbolicEvolutionRead = null;
                return { ok: true, reason: '', writes: true };
            }
            if (act === 'trail') {
                if (typeof SE.getEvolutionTrail !== 'function') return bad('kernel-missing');
                return { ok: true, reason: '', writes: false, trail: SE.getEvolutionTrail(wp.symbolicEntities[idx]) };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.symbolicEvolutionAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _symbolicEvolutionLine(engine) {
        try {
            const r = symbolicEvolutionState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.entities === 0) return '尚无意象登记';
            return `${r.entities} 个意象 · 多视角 ${r.multiMeaning} · 含反例 ${r.withObjection}` + (r.degraded ? ' · 含畸形账' : '');
        } catch (e) { errLog(e, 'engine._symbolicEvolutionLine'); return '—（诊断异常）'; }
    }

    /* ---- ⑤ 跨时代传承（era-inheritance.js）---------------------------------
     * 产品形态：时代转场（作者指定跨度与变化规则）⇒ 逐项选择「继承 / 不继承」
     *   ⇒ 应用或**撤销**（旧卷保持可读）。
     * 核心口径：新负责人继承事业，但**不自动知道前任私人经历**（内核 applyTransition 已保证）。 */
    function eraInheritanceState(engine, opts) {
        const absent = (why) => ({ kind: 'era_inheritance', version: 0, transitions: 0, applied: 0, pending: 0, proposals: 0, items: [], writesNothing: true, ok: false, reason: why });
        try {
            const EI = _eraInheritanceLib();
            if (!EI || typeof EI.createEraTransition !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const list = (wp && Array.isArray(wp.eraTransitions)) ? wp.eraTransitions : [];
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.transitionId || '').trim();
            let applied = 0, pending = 0, proposals = 0;
            const items = [];
            for (const tr of list) {
                if (only && String(tr && tr.transitionId) !== only) continue;
                const st = String((tr && tr.status) || 'pending');
                if (st === 'applied') applied += 1; else pending += 1;
                const propN = Array.isArray(tr && tr.proposals) ? tr.proposals.length : 0;
                proposals += propN;
                items.push({
                    transitionId: tr.transitionId,
                    eraFrom: tr.eraFrom || '', eraTo: tr.eraTo || '',
                    status: st,
                    proposals: propN,
                    appliedItems: Array.isArray(tr.appliedItems) ? tr.appliedItems.length : 0,
                    undone: !!(tr && tr.undone),
                });
            }
            const r = { kind: 'era_inheritance', version: (EI.VERSION || 0), transitions: items.length, applied, pending, proposals, items, writesNothing: true, ok: true, reason: items.length ? '' : 'empty' };
            if (engine) engine._eraInheritanceRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.eraInheritanceState'); return absent('thrown'); }
    }

    function eraInheritanceAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const EI = _eraInheritanceLib();
            if (!EI || typeof EI.createEraTransition !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            if (!Array.isArray(wp.eraTransitions)) wp.eraTransitions = [];
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            const tid = String(p.transitionId || '').trim();
            const idx = wp.eraTransitions.findIndex(x => x && String(x.transitionId) === tid);
            if (act === 'create') {
                /* ★ [v3.428.0 自纠] 与制度记忆 create 同一处错：要求宿主有包装方法
                 *   `wp.createEraTransition` 才肯干，否则 host-create-missing。
                 *   改为直调内核 + 落状态（动作面只做纯内核调用，这是本层自己的纪律）。 */
                const tr = EI.createEraTransition(p);
                if (!tr) return bad('create-returned-null');
                wp.eraTransitions.push(tr);
                engine._eraInheritanceRead = null;
                return { ok: true, reason: '', writes: true, transitionId: tr.transitionId };
            }
            if (idx === -1) return bad('transition-not-found');
            if (act === 'propose') {
                if (typeof EI.generateInheritanceProposals !== 'function') return bad('kernel-missing');
                /* ★ [v3.428.0 自纠] 内核返回**提案数组**并原地写 transition.proposals，
                 *   修前当 {transition, proposals} 信封读 ⇒ 恒报「提案 0」。 */
                const out = EI.generateInheritanceProposals(wp.eraTransitions[idx]);
                const propN = Array.isArray(out) ? out.length
                    : (out && Array.isArray(out.proposals)) ? out.proposals.length : 0;
                engine._eraInheritanceRead = null;
                return { ok: true, reason: '', writes: true, proposals: propN };
            }
            if (act === 'apply') {
                if (typeof EI.applyTransition !== 'function') return bad('kernel-missing');
                /* ★ [v3.428.0 自纠] 内核 choice 键是 {itemId, action}，修前原样透传
                 *   {id, inherit} ⇒ find 全部落空、appliedCount 恒 0 却报 ok:true。 */
                const rawChoices = Array.isArray(p.choices) ? p.choices : [];
                const normChoices = rawChoices.map((c) => {
                    const cc = (c && typeof c === 'object') ? c : {};
                    const id = String(cc.itemId || cc.id || '').trim();
                    let act2 = String(cc.action || '').trim();
                    if (!act2) act2 = (cc.inherit === false) ? 'reject' : 'accept';
                    const one = { itemId: id, action: act2 };
                    if (act2 === 'modify' && cc.modifiedContent !== undefined) one.modifiedContent = cc.modifiedContent;
                    return one;
                }).filter((c) => c.itemId);
                const out = EI.applyTransition(wp.eraTransitions[idx], normChoices);
                engine._eraInheritanceRead = null;
                return { ok: true, reason: '', writes: true, appliedCount: (out && out.appliedCount) || 0, oldEraReadable: !!(out && out.oldEraReadable) };
            }
            if (act === 'undo') {
                if (typeof EI.undoTransition !== 'function') return bad('kernel-missing');
                const out = EI.undoTransition(wp.eraTransitions[idx]);
                engine._eraInheritanceRead = null;
                return { ok: true, reason: '', writes: true, undone: !!(out && out.undone), oldEraReadable: !!(out && out.oldEraReadable) };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.eraInheritanceAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _eraInheritanceLine(engine) {
        try {
            const r = eraInheritanceState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.transitions === 0) return '尚无时代转场';
            return `${r.transitions} 次转场 · 已应用 ${r.applied} · 待定 ${r.pending} · 提案 ${r.proposals}`;
        } catch (e) { errLog(e, 'engine._eraInheritanceLine'); return '—（诊断异常）'; }
    }

    /* =========================================================================
     * [v3.430.0 · L12-X1~X9] 第十二期拓展侧的六件产品面（X6/X7/X8 是工具与文档，不在本层）
     * -------------------------------------------------------------------------
     * 与 O1 同一纪律（见上一段的四条），这里只补三条本批特有的：
     *   ⑤ **双内核并存时不合并计数**：X1 制度记忆（组织实体/决议/换届/私人档案）与
     *      X1 规则谱系（提案→表决→生效→废止）是两个内核，一件管「组织」，一件管「规则」。
     *      把两边的条数相加会得到一个既不是「N 个组织」也不是「N 条规则」的数 ——
     *      本仓治过的「按名聚合」错读数正是这个形状。故两面并列、各自报数。
     *   ⑥ **一个事实只认一个内核**：X9 的「沉默原因码」真源是 `memory-season-silence-manager.js`
     *      的 `evaluateTopicSeason`（五态 reason）；「季候相位」真源是 `memory-season.js` 的
     *      `evaluateSeasonPhase`（四态 phase）。两者语义不重叠（一个答「为什么没进来」，
     *      一个答「此刻处于什么季候」），**不承认第三份**，也不在本层拼一个「综合原因」。
     *   ⑦ **判不了 ≠ 否**：X3 的前史条目落 `undecided` 是「信息缺失」，不是「安全」，
     *      故它必须带一条可执行的补救建议，而不是一句「判不了」就结束。
     * ========================================================================= */

    /* ---- X1 规则谱系（institutional-collective-memory.js）-------------------
     * 产品形态：组织规则走「提案 → 表决 → 生效 / 废止」，**旧版永不静默抹除**
     *   （内核把旧正文移进 previousVersionContent 并把 version 递增）。
     * 四类来源层级严格分离（individual / institutional / public_rule / rumor）——
     *   「谁都这么说」与「组织正式条文」是两件事，合并即失真。 */
    var RULE_TIERS = Object.freeze(['individual', 'institutional', 'public_rule', 'rumor']);
    var RULE_STATUSES = Object.freeze(['proposed', 'active', 'repealed']);

    function _instRulesBag(engine) {
        const wp = engine && engine.worldProg;
        if (!wp) return null;
        if (!Array.isArray(wp.institutionRules)) wp.institutionRules = [];
        return wp.institutionRules;
    }

    function institutionRuleState(engine, opts) {
        const absent = (why) => ({
            kind: 'institution_rules', version: 0, rules: 0, active: 0, proposed: 0, repealed: 0,
            byTier: { individual: 0, institutional: 0, public_rule: 0, rumor: 0 },
            items: [], lineage: [], writesNothing: true, ok: false, reason: why,
        });
        try {
            const ICM = _institutionalCollectiveLib();
            if (!ICM || typeof ICM.amendInstitutionalRule !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const list = (wp && Array.isArray(wp.institutionRules)) ? wp.institutionRules : [];
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.ruleId || '').trim();
            const byTier = { individual: 0, institutional: 0, public_rule: 0, rumor: 0 };
            let active = 0, proposed = 0, repealed = 0;
            const items = [];
            for (const r of list) {
                if (!r || typeof r !== 'object') continue;
                const rid = String(r.id || '').trim();
                if (only && rid !== only) continue;
                const st = String(r.status || 'active');
                const tier = RULE_TIERS.indexOf(r.sourceTier) >= 0 ? r.sourceTier : 'institutional';
                /* ★ 传闻**不进表决三态统计**（本版实测抓到的计数缺陷）：
                 *   旧写法把 rumor 的 status='active' 也算进 active，于是「规则 1 条」下面写着
                 *   「生效 1 · 传闻 1」—— 两个桶加起来比条数还多，读者会以为有两条。
                 *   传闻根本不进表决流程，它没有「生效」这回事：它有它自己的桶。 */
                if (tier === 'rumor') {
                    /* 传闻只按「还在不在」计，不计状态 */
                } else if (st === 'active') active += 1;
                else if (st === 'repealed') repealed += 1;
                else proposed += 1;
                byTier[tier] += 1;
                const ratified = Array.isArray(r.ratifiedBy) ? r.ratifiedBy.filter(Boolean) : [];
                items.push({
                    ruleId: rid,
                    title: String(r.title || ''),
                    status: st,
                    sourceTier: tier,
                    version: Number(r.version) || 1,
                    ratifiedBy: ratified.length,
                    hasPrevious: r.previousVersionContent !== undefined && r.previousVersionContent !== null && r.previousVersionContent !== '',
                    /* ★ 契约面：旧版正文**只在 hasPrevious 为真时**才允许取出，且必须显式请求。
                     *   默认只报「有旧版」不报正文 —— 与私人档案只报条数同纪律。 */
                    previousContent: (o.withHistory === true && r.previousVersionContent !== undefined && r.previousVersionContent !== null) ? String(r.previousVersionContent) : null,
                });
            }
            /* 谱系视图：同 id 的 version 序列（只报版本号与状态，不重复正文）。 */
            const lineage = items.filter((x) => x.ruleId).map((x) => ({ ruleId: x.ruleId, version: x.version, status: x.status }));
            const r2 = {
                kind: 'institution_rules', version: (ICM.VERSION || 0), rules: items.length,
                active, proposed, repealed, byTier, items, lineage,
                writesNothing: true, ok: true, reason: items.length ? '' : 'empty',
            };
            if (engine) engine._institutionRuleRead = r2;
            return r2;
        } catch (e) { errLog(e, 'engine.institutionRuleState'); return absent('thrown'); }
    }

    function institutionRuleAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const ICM = _institutionalCollectiveLib();
            if (!ICM || typeof ICM.amendInstitutionalRule !== 'function') return bad('module-unavailable');
            const bag = _instRulesBag(engine);
            if (!bag) return bad('no-world-progress');
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            const rid = String(p.ruleId || p.id || '').trim();
            const idx = rid ? bag.findIndex((x) => x && String(x.id) === rid) : -1;

            if (act === 'propose' || act === 'amend') {
                /* 内核产出**新版本**（id 相同则 version+1、旧正文进 previousVersionContent）。
                 *   ★ 状态机而不是文案：ratifiedBy 为空 ⇒ proposed；至少一票 ⇒ active。
                 *     这是 X1 验收「规则变更可追溯提案与表决」的落点，也是它不能靠
                 *     调用方自己传 status 的原因 —— 传文 status 就等于没有状态机。 */
                const ratified = Array.isArray(p.ratifiedBy) ? p.ratifiedBy.filter(Boolean).map(String) : [];
                const out = ICM.amendInstitutionalRule(bag.slice(), {
                    ruleId: rid || undefined,
                    title: p.title, content: p.content, ratifiedBy: ratified,
                });
                if (!out || !out.activeRule) return bad('kernel-refused');
                /* ★ 层级**不因改写而漂移**（本版实测抓到的真缺陷）：
                 *   旧写法把 sourceTier 一律落回 'institutional'，于是「改一句传闻」就把传闻
                 *   升成了正式规则 —— 而正式规则是**要表决**的。传闻一旦能被顺手改写升级，
                 *   「传闻永不参与表决」这条口径就只是文案，不是判据。
                 *   现规则：
                 *     ① 已有条目 ⇒ 沿用原层级（除非调用方显式给出合法层级）；
                 *     ② 传闻要转成正式层级，必须显式 `promote: true`（并要求有表决票），
                 *        否则保持传闻、并把 ratifiedBy 清空 —— 传闻没有票。 */
                const prevTier = (idx >= 0 && RULE_TIERS.indexOf(bag[idx].sourceTier) >= 0)
                    ? bag[idx].sourceTier : null;
                let tier = RULE_TIERS.indexOf(p.sourceTier) >= 0 ? p.sourceTier : (prevTier || 'institutional');
                let promoted = false;
                let ratifiedFinal = ratified;
                if (prevTier === 'rumor') {
                    if (tier !== 'rumor' && p.promote === true && ratified.length) {
                        promoted = true;
                    } else {
                        /* 留在传闻层：没有票，也不算「待表决」——它根本没进表决流程。 */
                        if (tier !== 'rumor') return bad('rumor-promote-requires-vote');
                        ratifiedFinal = [];
                    }
                }
                const rule = Object.assign({}, out.activeRule, {
                    status: (tier === 'rumor') ? 'active'
                        : (ratifiedFinal.length ? 'active' : 'proposed'),
                    sourceTier: tier,
                    ratifiedBy: ratifiedFinal,
                });
                /* 内核返回的是**新数组**（旧对象不动）⇒ 用返回值整体替换本层存储。 */
                bag.length = 0;
                for (const x of out.rules) bag.push(x);
                const at = bag.findIndex((x) => x && String(x.id) === String(rule.id));
                if (at >= 0) bag[at] = rule;
                if (engine) engine._institutionRuleRead = null;
                return {
                    ok: true, reason: '', writes: true, ruleId: String(rule.id),
                    version: rule.version, status: rule.status,
                    sourceTier: rule.sourceTier, promoted,
                };
            }
            if (act === 'rumor') {
                /* 传闻是**独立层级**、不是「低可信度的正式规则」：它进同一张表但 sourceTier=rumor，
                 *   且永不参与表决（没有 ratifiedBy）。这样「谁都这么说」能被查，却不会被当成条文。 */
                const text = String(p.content || '').trim();
                if (!text) return bad('content-required');
                const rid2 = rid || ('rule_rumor_' + Date.now());
                const at2 = bag.findIndex((x) => x && String(x.id) === rid2);
                const one = {
                    id: rid2, title: String(p.title || '传闻').trim(), content: text,
                    sourceTier: 'rumor', version: at2 >= 0 ? (Number(bag[at2].version) || 1) + 1 : 1,
                    previousVersionContent: at2 >= 0 ? String(bag[at2].content || '') : null,
                    ratifiedBy: [], status: 'active', updatedAt: Date.now(),
                };
                if (at2 >= 0) bag[at2] = one; else bag.push(one);
                if (engine) engine._institutionRuleRead = null;
                return { ok: true, reason: '', writes: true, ruleId: rid2, sourceTier: 'rumor', version: one.version };
            }

            if (idx === -1) return bad('rule-not-found');
            const cur = bag[idx];
            if (act === 'ratify') {
                const ratified = Array.isArray(p.ratifiedBy) ? p.ratifiedBy.filter(Boolean).map(String) : [];
                if (!ratified.length) return bad('ratified-by-required');
                const merged = Array.isArray(cur.ratifiedBy) ? cur.ratifiedBy.slice() : [];
                for (const who of ratified) if (merged.indexOf(who) < 0) merged.push(who);
                const next = Object.assign({}, cur, { ratifiedBy: merged, status: 'active', updatedAt: Date.now() });
                bag[idx] = next;
                if (engine) engine._institutionRuleRead = null;
                return { ok: true, reason: '', writes: true, ruleId: rid, status: 'active', ratifiedBy: merged.length };
            }
            if (act === 'repeal') {
                /* ★ 废止**不删正文**：正文挪进 previousVersionContent、version+1、状态 repealed。
                 *   删正文会让「这规矩以前怎么写的」永久丢失 —— 而制度记忆的价值一半在那儿。 */
                const next = Object.assign({}, cur, {
                    previousVersionContent: String(cur.content === undefined ? '' : cur.content),
                    previousStatus: String(cur.status || 'active'),
                    version: (Number(cur.version) || 1) + 1,
                    status: 'repealed',
                    repealedAt: Date.now(),
                    repealedBy: Array.isArray(p.repealedBy) ? p.repealedBy.filter(Boolean).map(String) : [],
                });
                bag[idx] = next;
                if (engine) engine._institutionRuleRead = null;
                return { ok: true, reason: '', writes: true, ruleId: rid, status: 'repealed', version: next.version, contentKept: true };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.institutionRuleAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _institutionRuleLine(engine) {
        try {
            const r = institutionRuleState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.rules === 0) return '尚无组织规则';
            /* 三态括号只讲**进表决的规则**；传闻单列在末尾，不与三态相加。 */
            const voted = r.active + r.proposed + r.repealed;
            return `规则 ${r.rules} 条（进表决 ${voted}：生效 ${r.active} / 待表决 ${r.proposed} / 已废止 ${r.repealed}）`
                + ` · 正式 ${r.byTier.institutional} · 公开 ${r.byTier.public_rule} · 传闻 ${r.byTier.rumor}（不入表决）`;
        } catch (e) { errLog(e, 'engine._institutionRuleLine'); return '—（诊断异常）'; }
    }

    /* ---- X2 意义演化可解释面（meaning-map.js + symbolic-evolution.js）--------
     * 产品形态：任一物件/地点的「意义」抽屉 —— 演化史、人物差异、**反例单列**。
     * 核心口径（两条方向相反，必须同时成立）：
     *   · 意义是**视角**不是事实 ⇒ 永不写回事实 owner（本层显式标 touchesFactOwner:false）；
     *   · 删一条解释**只影响那一格**，其他人的理解原样保留（drop 只删指定 actor）。 */
    function meaningViewState(engine, opts) {
        const absent = (why) => ({
            kind: 'meaning_view', version: 0, symbols: 0, history: 0, byActor: {}, objections: 0,
            objectionItems: [], entityItems: 0, items: [], degraded: false,
            writesNothing: true, touchesFactOwner: false, ok: false, reason: why,
        });
        try {
            const MM = _meaningMapLib();
            if (!MM || typeof MM.recordMeaningShift !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const store = (wp && wp.meaningMap && typeof wp.meaningMap === 'object') ? wp.meaningMap : null;
            const norm = MM.normalizeMeaningMapState(store || {});
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.symbolId || '').trim();
            const objections = (wp && Array.isArray(wp.meaningObjections)) ? wp.meaningObjections : [];
            const objItems = [];
            let history = 0;
            const byActor = {};
            const items = [];
            for (const sid of Object.keys(norm.symbols || {})) {
                if (only && sid !== only) continue;
                const sym = norm.symbols[sid];
                if (!sym || typeof sym !== 'object') continue;
                const hist = Array.isArray(sym.history) ? sym.history : [];
                history += hist.length;
                const persp = (sym.perspectives && typeof sym.perspectives === 'object') ? sym.perspectives : {};
                /* ★ 视角两面分开统计：byActor 只数「各自的理解」，反例单列 objectionActors。
                 *   反例答的是「谁不认同」，混进人数会让「分视角 N 人」里混着一位反对者。
                 *   兼容旧数据：没有 isObjection 标记但含义带「（不认同）」前缀的也按反例算
                 *   （旧 state 是在本版之前写下的，不重写它，但读数必须一致）。 */
                const isObjView = (v) => !!(v && (v.isObjection === true
                    || String(v.currentMeaning || '').indexOf('（不认同）') === 0));
                const actors = Object.keys(persp);
                const objectionActors = [];
                for (const a of actors) {
                    if (isObjView(persp[a])) { objectionActors.push(a); continue; }
                    if (!byActor[a]) byActor[a] = 0;
                    byActor[a] += 1;
                }
                const mine = objections.filter((x) => x && String(x.symbolId) === String(sid));
                for (const x of mine) objItems.push({ symbolId: String(sid), actor: String(x.actor || ''), meaning: String(x.meaning || ''), floor: Number.isFinite(Number(x.floor)) ? Number(x.floor) : null });
                items.push({
                    symbolId: sid,
                    name: String(sym.name || sid),
                    stages: hist.map((h) => String((h && h.stage) || '')),
                    historyCount: hist.length,
                    /* 逐条带来源（阶段 / 含义 / 楼层 / 触发事件）——「谁在什么时候改的」不能只给个总数。 */
                    history: hist.slice(-20).map((h) => ({
                        stage: String((h && h.stage) || ''),
                        meaning: String((h && h.meaningSummary) || ''),
                        floor: Number.isFinite(Number(h && h.floor)) ? Number(h.floor) : null,
                        trigger: String((h && h.triggerEvent) || ''),
                    })),
                    actors: actors.map((a) => ({
                        actor: a,
                        meaning: String((persp[a] && persp[a].currentMeaning) || ''),
                        stage: String((persp[a] && persp[a].stage) || ''),
                    })),
                    objections: mine.length,
                    objectionActors: objectionActors,
                });
            }
            /* 意象侧（symbolic-evolution）并列、**不合并计数**：一件管「文本意义跃迁史」，
             *   一件管「出场与确认的象征实体」。相加会得到一个两边都不是的数。 */
            let entityItems = 0;
            try {
                const sym = symbolicEvolutionState(engine, {});
                if (sym && sym.ok) entityItems = sym.entities;
            } catch (_e) { entityItems = 0; }
            const r = {
                kind: 'meaning_view', version: (MM.VERSION || 0),
                symbols: items.length, history, byActor, objections: objItems.length,
                objectionItems: objItems, entityItems, items,
                degraded: false, writesNothing: true, touchesFactOwner: false,
                ok: true, reason: items.length ? '' : 'empty',
            };
            if (engine) engine._meaningViewRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.meaningViewState'); return absent('thrown'); }
    }

    function meaningViewAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false, touchesFactOwner: false });
        try {
            const MM = _meaningMapLib();
            if (!MM || typeof MM.recordMeaningShift !== 'function') return bad('module-unavailable');
            const wp = engine && engine.worldProg;
            if (!wp) return bad('no-world-progress');
            if (!wp.meaningMap || typeof wp.meaningMap !== 'object') wp.meaningMap = { symbols: {}, updatedAt: Date.now() };
            if (!Array.isArray(wp.meaningObjections)) wp.meaningObjections = [];
            const act = String(action || '').trim();
            const p = (payload && typeof payload === 'object') ? payload : {};
            const sid = String(p.symbolId || '').trim();
            if (!sid) return bad('symbol-id-required');

            if (act === 'shift') {
                const obs = String(p.observer || '').trim();
                const out = MM.recordMeaningShift(wp.meaningMap, {
                    symbolId: sid, name: p.name, stage: p.stage,
                    meaningSummary: p.meaning || p.meaningSummary,
                    triggerEvent: p.trigger || p.triggerEvent,
                    floor: p.floor, observer: obs || undefined,
                });
                if (!out || out.success !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
                /* ★ 写回的是内核返回的**整份 state**（内核是纯函数，旧 state 不动）。 */
                wp.meaningMap = out.state;
                if (engine) engine._meaningViewRead = null;
                return { ok: true, reason: '', writes: true, symbolId: sid, observer: obs, touchesFactOwner: false };
            }
            if (act === 'object') {
                /* 反例：**不进 history**。进了 history 就会被下游读成「共识演化的又一步」，
                 *   而反例的语义正好相反：它是**不认同**。故单列在 wp.meaningObjections。 */
                const actor = String(p.actor || '').trim();
                const meaning = String(p.meaning || '').trim();
                if (!actor || !meaning) return bad('actor-and-meaning-required');
                wp.meaningObjections.push({
                    symbolId: sid, actor, meaning,
                    floor: Number.isFinite(Number(p.floor)) ? Number(p.floor) : null,
                    at: Date.now(),
                });
                /* 反例同时要能影响「谁的视角」——写一格 perspectives 但 stage 保持 contested，
                 *   与 shift 的语义区分开（shift 是「他这么看」，object 是「他不同意」）。 */
                const cur = wp.meaningMap.symbols[sid];
                if (cur) {
                    const persp = Object.assign({}, cur.perspectives || {});
                    /* ★ isObjection 标记：这一格是**反例**（不认同），不是「他的一种理解」。
                     *   没有这个标记，状态面只能靠「（不认同）」这个中文前缀去猜 —— 猜错一次
                     *   就把反对者算进「分视角人数」，那个数字既不是人数也不是共识度。 */
                    persp[actor] = { currentMeaning: '（不认同）' + meaning, stage: 'contested', isObjection: true, updatedAt: Date.now() };
                    wp.meaningMap.symbols[sid] = Object.assign({}, cur, { perspectives: persp });
                }
                if (engine) engine._meaningViewRead = null;
                return { ok: true, reason: '', writes: true, symbolId: sid, actor, touchesFactOwner: false };
            }
            if (act === 'drop') {
                /* ★ 删一条解释**只影响那一格**：指定 actor 时只删他的那格与他的反例，
                 *   其他视角与 history 原样保留；不指定 actor 才整条意象下线（且要显式
                 *   `whole: true`，避免误删）。被删的格记进 engine._meaningOrphaned（**只记不删引用**）。 */
                const actor = String(p.actor || '').trim();
                const whole = p.whole === true;
                const cur = wp.meaningMap.symbols[sid];
                if (!cur) return bad('symbol-not-found');
                if (!actor && !whole) return bad('actor-or-whole-required');
                const removed = [];
                if (whole) {
                    delete wp.meaningMap.symbols[sid];
                    const keep = [];
                    for (const x of wp.meaningObjections) {
                        if (x && String(x.symbolId) === sid) removed.push({ actor: String(x.actor || '') });
                        else keep.push(x);
                    }
                    wp.meaningObjections.length = 0;
                    for (const x of keep) wp.meaningObjections.push(x);
                } else {
                    const persp = Object.assign({}, cur.perspectives || {});
                    if (Object.prototype.hasOwnProperty.call(persp, actor)) { delete persp[actor]; removed.push({ actor }); }
                    wp.meaningMap.symbols[sid] = Object.assign({}, cur, { perspectives: persp });
                    const keep = [];
                    for (const x of wp.meaningObjections) {
                        if (x && String(x.symbolId) === sid && String(x.actor) === actor) removed.push({ actor });
                        else keep.push(x);
                    }
                    wp.meaningObjections.length = 0;
                    for (const x of keep) wp.meaningObjections.push(x);
                }
                if (!Array.isArray(engine._meaningOrphaned)) engine._meaningOrphaned = [];
                engine._meaningOrphaned.push({ symbolId: sid, at: Date.now(), removed: removed.length, whole });
                if (engine) engine._meaningViewRead = null;
                return { ok: true, reason: '', writes: true, symbolId: sid, removed: removed.length, whole, touchesFactOwner: false };
            }
            return bad('unknown-action');
        } catch (e) { errLog(e, 'engine.meaningViewAct'); return { ok: false, reason: 'thrown', writes: false, touchesFactOwner: false }; }
    }

    function _meaningViewLine(engine) {
        try {
            const r = meaningViewState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.symbols === 0) return '尚无意象意义';
            const actors = Object.keys(r.byActor || {});
            return `${r.symbols} 个意象 · 意义跃迁 ${r.history} 次 · 分视角 ${actors.length} 人 · 反例 ${r.objections}`;
        } catch (e) { errLog(e, 'engine._meaningViewLine'); return '—（诊断异常）'; }
    }

    /* ---- X3 世界线前史体检（把 O8 的读数变成可操作流程）---------------------
     * 问题现场：首跳登记在第 N 楼（N>1）时，第 1..N-1 楼的条目**推不出纪元** ⇒ 落
     *   `undecided`（判不了）。这不是「安全」，是**信息缺失**。O8 只把这条读数显示出来，
     *   卡作者没有工具去修。本面把「判不了」变成**可修的状态**：点名条目 + 两条可执行建议
     *   + 建议①的**真预览**（拿改后的配置跑同一段闸门代码）。
     * ★ 一个字节都不写配置：预览用临时 fake engine，真配置原样。 */
    function _prehistoryItems(engine, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        if (Array.isArray(o.items)) {
            return o.items.map((x, i) => ({
                key: String((x && (x.key || x.id)) || ('item_' + i)),
                floor: Number.isFinite(Number(x && x.floor)) ? Math.floor(Number(x.floor)) : null,
            })).filter((x) => x.floor !== null);
        }
        const wp = (engine && engine.worldProg) || {};
        const out = [];
        const sweep = (arr, keyName) => {
            if (!Array.isArray(arr)) return;
            for (const it of arr) {
                if (!it || typeof it !== 'object') continue;
                const f = Number(it.floor);
                if (!Number.isFinite(f)) continue;
                out.push({ key: String(it.key || it.id || it.name || it.detail || keyName), floor: Math.floor(f) });
            }
        };
        sweep(wp.recallEcho && wp.recallEcho.pending, 'recall-echo');
        sweep(wp.seedLedger, 'seed');
        sweep(wp.commitmentLedger, 'commitment');
        sweep(wp.knowledgeTraces && wp.knowledgeTraces.entries, 'knowledge');
        return out;
    }

    function worldlinePrehistory(engine, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const base = {
            kind: 'worldline_prehistory', state: 'unregistered', firstFloor: null,
            gapFrom: null, gapTo: null, entries: [], suggestions: [],
            before: { blocked: 0, undecided: 0, kept: 0 }, after: { blocked: 0, undecided: 0, kept: 0 },
            previewApplied: false, previewState: 'not-run', previewWhy: '',
            writesNothing: true, ok: true, reason: '',
        };
        try {
            const cfg = (engine && engine.config && engine.config.config) || {};
            const WM = _worldlineMemoryLib();
            const draft = worldlineJumpDraft(engine, o.jumps === undefined ? undefined : o.jumps);
            const first = draft && draft.firstFloor;
            base.firstFloor = (first === undefined) ? null : first;
            if (first === null || first === undefined) {
                /* 三态之一：**根本没登记跳跃表** —— 与「登记了但有缺口」不同形。 */
                return Object.assign(base, {
                    state: 'unregistered', reason: 'no-jumps',
                    suggestions: [{ id: 'register-first-jump', text: '先登记第一行 `1:当前层标记`（没有跳跃表就没有纪元，所有条目都判不了）', writes: false }],
                });
            }
            if (first <= 1) {
                /* 三态之二：已覆盖。**不报 gap**，也别报「安全」两个字 —— 只报事实。 */
                return Object.assign(base, { state: 'covered', reason: 'first-floor-is-1' });
            }
            const all = _prehistoryItems(engine, o);
            const inside = all.filter((x) => x.floor >= 1 && x.floor < first);
            base.gapFrom = 1;
            base.gapTo = first - 1;
            base.state = 'gap';
            base.entries = inside.map((x) => ({
                key: x.key, floor: x.floor,
                verdict: 'undecided', why: 'floor-before-first-jump',
            }));
            /* 建议 ①：把首跳移到第 1 楼 —— 带**真预览**：造一份临时配置副本，
             *   把新首跳拼进文本，跑同一个 worldlineGate 看同一批条目落到哪一桶。
             *   ★ 真配置一个字节都没改（fakeEngine 是自己造的，跑完即弃）。 */
            const fixedText = '1:' + String((draft.rows && draft.rows[0] && draft.rows[0].lineId) || 'start') + '\n'
                + String(o.jumps === undefined ? (cfg.worldlineJumps === undefined || cfg.worldlineJumps === null ? '' : cfg.worldlineJumps) : o.jumps);
            let after = { blocked: 0, undecided: 0, kept: 0 };
            let before = { blocked: 0, undecided: 0, kept: 0 };
            /* ★ 预览是**三态**不是布尔：跑成功 / 当前线判不了（跑也没意义） / 没条目。
             *   旧写法只用 previewApplied 一个布尔，于是「跑不出差异」与「差异为零」同形 ——
             *   面板会照着一条零差异的读数说「移到第 1 楼就好了」，而其实一次判据都没生效。 */
            if (!inside.length) { base.previewState = 'no-items'; base.previewWhy = 'no-entries-in-gap'; }
            try {
                if (WM && typeof WM.guard === 'function' && inside.length) {
                    const rows = inside.map((x) => ({ key: x.key, floor: x.floor, lineId: String((draft.rows && draft.rows[0] && draft.rows[0].lineId) || '') }));
                    const mkFake = (text) => {
                        const fake = {
                            config: { config: Object.assign({}, cfg, { worldlineJumps: text, worldlineMemoryEnabled: true }) },
                            worldProg: {},
                            _currentFloor: engine && engine._currentFloor,
                            _worldlineViewer: engine && engine._worldlineViewer,
                            _worldlineState: function (oo) { return _worldlineState(this, oo); },
                            _worldlineRead: function (oo) { return _worldlineRead(this, oo); },
                        };
                        return fake;
                    };
                    const origText = String(o.jumps === undefined ? (cfg.worldlineJumps === undefined || cfg.worldlineJumps === null ? '' : cfg.worldlineJumps) : o.jumps);
                    const gBefore = worldlineGate(mkFake(origText), { items: rows });
                    const gAfter = worldlineGate(mkFake(fixedText), { items: rows });
                    const pick = (g) => ({ blocked: (g.blocked || []).length, undecided: (g.undecided || []).length, kept: (g.kept || []).length });
                    before = pick(gBefore); after = pick(gAfter);
                    base.before = before; base.after = after;
                    /* 当前线判不出来时闸门对每条都给 undecided，此时 before/after 必然相同 ——
                     *   那是**判据没生效**，不是「改了没用」。两者必须不同形。 */
                    if (!gBefore || gBefore.ok !== true || !gBefore.current) {
                        base.previewState = 'no-current-line';
                        base.previewWhy = 'current-line-unresolvable';
                        base.previewApplied = false;
                    } else {
                        base.previewState = 'applied';
                        base.previewApplied = true;
                    }
                    /* 每条条目的「改后判定」逐条落 —— 只报总数会让「改哪一条有效」无从判断。 */
                    const afterState = {};
                    for (const b of (gAfter.blocked || [])) afterState[String(b.key)] = 'blocked';
                    for (const u of (gAfter.undecided || [])) afterState[String(u.key)] = 'undecided';
                    for (const k of (gAfter.kept || [])) afterState[String(k.key)] = 'kept';
                    base.entries = base.entries.map((x) => Object.assign({}, x, { afterMoveTo1: afterState[x.key] || 'unknown' }));
                }
            } catch (_e) { base.previewApplied = false; }
            base.suggestions = [
                {
                    id: 'move-first-jump-to-1',
                    text: '把首跳移到第 1 楼（在 `worldlineJumps` 第一行写 `1:当前层标记`）',
                    writes: false,
                    preview: { jumpsText: fixedText, before: before, after: after, state: base.previewState },
                    note: '预览用临时配置副本跑同一段闸门代码；真配置**一个字节都没改**，要生效需在编辑器里保存。',
                },
                {
                    id: 'fill-floor',
                    text: '给这些条目补 `floor`（没有楼层就推不出纪元，补上后按楼层判定）',
                    writes: false,
                    targets: base.entries.map((x) => x.key),
                },
            ];
            base.reason = inside.length ? '' : 'gap-without-entries';
            return base;
        } catch (e) { errLog(e, 'engine.worldlinePrehistory'); return Object.assign(base, { ok: false, reason: 'thrown', state: 'unregistered' }); }
    }

    function _worldlinePrehistoryLine(engine) {
        try {
            const r = worldlinePrehistory(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (r.state === 'unregistered') return '前史：未登记跳跃表（无纪元可判）';
            if (r.state === 'covered') return '前史：已覆盖（首跳在第 1 楼）';
            const e = r.entries.length;
            const mv = (r.previewState === 'applied')
                ? `（移到第 1 楼后 判不了 ${r.before.undecided}→${r.after.undecided} / 挡下 ${r.before.blocked}→${r.after.blocked}）`
                : (r.previewState === 'no-current-line' ? '（预览未生效：当前线判不了，闸门对每条都给「判不了」）'
                    : '（无缺口内条目可预览）');
            return `前史：缺口 第 ${r.gapFrom}..${r.gapTo} 楼 · ${e} 条判不了${mv}`;
        } catch (e) { errLog(e, 'engine._worldlinePrehistoryLine'); return '—（诊断异常）'; }
    }

    /* ---- X4 证据裁决影响回放（evidence-solver.js + fact-correction-bench.js）----
     * 产品形态：一次裁决（采用/并列/待确认/撤回）之后，出一张影响回放卡：
     *   受影响的摘要段落 / 召回路线 / 下一轮将注入的条目 —— **只给引用，不给正文**。
     * 核心口径：
     *   · 撤销裁决 ⇒ 下游回到 `pending`（不是「已修好」，也不是「没发生过」）；
     *   · **未受影响的实体不进 recomputed**：这是唯一能观测「有没有全量重算」的点；
     *   · 秘密依赖项一律排除并计数（沿用 v3.307.0 秘密三面收口）。 */
    var EVIDENCE_IMPACT_VERDICTS = Object.freeze(['adopt', 'parallel', 'pending', 'revoke']);

    function evidenceImpactReplay(engine, opts) {
        const absent = (why) => ({
            kind: 'evidence_impact', verdict: '', factKey: '', affected: [], unaffected: 0,
            recomputed: [], summaryRefs: [], recallRoutes: [], nextInjectRefs: [],
            tiers: { recomputable: 0, needs_confirm: 0, manual_only: 0 },
            secretsExcluded: 0, downstream: '', writesNothing: true, ok: false, reason: why,
        });
        try {
            const FCB = _factCorrectionBenchLib();
            if (!FCB || typeof FCB.traceImpactGraph !== 'function') return absent('module-unavailable');
            const wp = (engine && engine.worldProg) || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const verdict = EVIDENCE_IMPACT_VERDICTS.indexOf(String(o.verdict || '')) >= 0 ? String(o.verdict) : 'pending';
            const factKey = String(o.factKey || '').trim();
            if (!factKey) return Object.assign(absent('fact-key-required'), { verdict });
            const depsAll = Array.isArray(o.dependents) ? o.dependents
                : (Array.isArray(wp.factDependents) ? wp.factDependents : []);
            /* 秘密依赖项**排除并计数**：不计数就会把「因为有秘密所以没算」读成「没有影响」。 */
            const safeDeps = [];
            let secretsExcluded = 0;
            for (const d of depsAll) {
                if (!d || typeof d !== 'object') continue;
                if (d.secret === true || d.isSecret === true) { secretsExcluded += 1; continue; }
                safeDeps.push(d);
            }
            const graph = FCB.traceImpactGraph(factKey, safeDeps);
            const affected = (graph.affected || []).map((a) => ({
                id: String(a.id || ''), title: String(a.title || ''), category: String(a.category || ''),
                tier: String(a.tier || ''),
            }));
            const tiers = {
                recomputable: (graph.summary && graph.summary.recomputableCount) || 0,
                needs_confirm: (graph.summary && graph.summary.needsConfirmCount) || 0,
                manual_only: (graph.summary && graph.summary.manualOnlyCount) || 0,
            };
            /* ★ 撤回裁决 ⇒ 下游 `pending`；其余三态各自有自己的下游词，**不许统一成 ok**。 */
            const downstream = (verdict === 'revoke') ? 'pending'
                : (verdict === 'adopt') ? 'stale-recomputable'
                : (verdict === 'parallel') ? 'stale-needs-confirm'
                : 'stale-pending';
            /* recomputed 只收**受影响**的键：未受影响的进来就等于宣称「全量重算」。 */
            const recomputed = affected.filter((a) => a.tier === 'recomputable').map((a) => a.id);
            const summaryRefs = affected.filter((a) => a.category === 'summary').map((a) => ({ id: a.id, tier: a.tier }));
            const recallRoutes = affected.filter((a) => a.category === 'route' || a.category === 'recall').map((a) => ({ id: a.id, tier: a.tier }));
            const nextInjectRefs = affected.filter((a) => a.category === 'inject' || a.category === 'prompt').map((a) => ({ id: a.id, tier: a.tier }));
            const r = {
                kind: 'evidence_impact', verdict, factKey,
                affected, unaffected: (graph.unaffected || []).length,
                recomputed, summaryRefs, recallRoutes, nextInjectRefs, tiers,
                secretsExcluded, downstream, writesNothing: true,
                ok: true, reason: affected.length ? '' : 'empty',
            };
            if (engine) engine._evidenceImpactRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.evidenceImpactReplay'); return Object.assign(absent('thrown'), {}); }
    }

    function _evidenceImpactLine(engine) {
        try {
            /* ★ 状态行读**缓存**，不重新装配：上一次真裁决落在 engine._evidenceImpactRead 上。
             *   旧写法用 {} 重跑，等于每画一次面板就丢掉调用方给的事实键 ⇒ 恒报「未指定事实键」。
             *   状态行与执行面必须分开：执行面吃参数，状态行吃缓存（读不到就说读不到）。 */
            const cached = (engine && engine._evidenceImpactRead && typeof engine._evidenceImpactRead === 'object')
                ? engine._evidenceImpactRead : null;
            const r = cached || evidenceImpactReplay(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            if (!r.factKey) return '影响回放：尚未裁决（无事实键读入）';
            if (!r.affected.length) return `回放：${r.factKey} 无下游受影响（未受影响 ${r.unaffected} 项原样）`;
            return `回放：${r.verdict} · 受影响 ${r.affected.length}（可重算 ${r.tiers.recomputable} / 需确认 ${r.tiers.needs_confirm} / 手改 ${r.tiers.manual_only}）· 下游 ${r.downstream}` + (r.secretsExcluded ? ` · 秘密排除 ${r.secretsExcluded}` : '');
        } catch (e) { errLog(e, 'engine._evidenceImpactLine'); return '—（诊断异常）'; }
    }

    /* ---- X5 行动回执链（memory-symbiosis-bridge.js）-------------------------
     * 产品形态：每一笔「建议—行动—结果—下次偏好」记成可审阅的链。
     * 三条口径：
     *   · **保存的是链，不是结论**（四态各自入账，失败与未执行同样有意义）；
     *   · 下游缺席 ⇒ 如实报 `absent`，**不伪造回执**；
     *   · 用户可拒绝长期保存（`persist:false` ⇒ 只留本会话，不进 worldProg）。 */
    var RECEIPT_OUTCOMES = Object.freeze(['accepted', 'rejected', 'timed_out', 'partial', 'partially_completed']);
    /* 归一表：bridge 用 `partial`、circuit 用 `partially_completed`，宿主层必须归一，
     *   但**原始词保留在回执里**以便追溯（归一不是抹掉来源）。 */
    function _normOutcome(raw) {
        const s = String(raw || '').trim();
        if (s === 'partially_completed') return 'partial';
        return s;
    }

    function actionReceiptState(engine, opts) {
        const absent = (why) => ({
            kind: 'action_receipts', version: 0, available: false, receipts: 0, sessionOnly: 0,
            byOutcome: { accepted: 0, rejected: 0, timed_out: 0, partial: 0 },
            weights: {}, chain: [], downstream: 'absent', writesNothing: true, ok: false, reason: why,
        });
        try {
            const SB = _symbiosisBridgeLib();
            /* 下游三态：present / disabled / absent —— 三者必须不同形。
             *   ⚠️ 这里不是「模块没装上」，而是「模块装上了、桥关着」，那是另一件事。 */
            let downstream = 'present';
            try {
                const VP = (typeof window !== 'undefined' && window.VirtualPhone) || null;
                const br = VP && VP.lonshaBridge;
                if (!br) downstream = 'absent';
                else if (br.enabled === false) downstream = 'disabled';
            } catch (_e) { downstream = 'absent'; }
            if (!SB || typeof SB.ingestPhoneActionReceipt !== 'function') {
                /* 模块缺席时**不伪造会话链**：报 absent，链留空。 */
                return Object.assign(absent('module-unavailable'), { downstream: 'absent' });
            }
            const wp = engine && engine.worldProg;
            const store = (wp && wp.symbiosisState && typeof wp.symbiosisState === 'object') ? wp.symbiosisState : { actionReceipts: [], strategyWeights: {} };
            const norm = SB.normalizeSymbiosisState(store);
            const session = Array.isArray(engine && engine._sessionReceipts) ? engine._sessionReceipts : [];
            const byOutcome = { accepted: 0, rejected: 0, timed_out: 0, partial: 0 };
            const chain = [];
            for (const x of norm.actionReceipts) {
                const k = _normOutcome(x && x.outcome);
                if (Object.prototype.hasOwnProperty.call(byOutcome, k)) byOutcome[k] += 1;
                chain.push({
                    receiptId: String((x && x.receiptId) || ''),
                    proposalTag: String((x && x.proposalTag) || ''),
                    outcome: k,
                    rawOutcome: String((x && x.outcome) || ''),
                    at: Number((x && x.timestamp) || 0),
                });
            }
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.proposalTag || '').trim();
            const tail = chain.slice(-20).filter((x) => !only || x.proposalTag === only);
            const r = {
                kind: 'action_receipts', version: (SB.VERSION || 0), available: true,
                receipts: chain.length, sessionOnly: session.length, byOutcome,
                weights: Object.assign({}, norm.strategyWeights || {}),
                chain: tail, downstream, writesNothing: true,
                ok: true, reason: chain.length ? '' : 'empty',
            };
            if (engine) engine._actionReceiptRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.actionReceiptState'); return absent('thrown'); }
    }

    function actionReceiptAct(engine, action, payload) {
        const bad = (why) => ({ ok: false, reason: why, writes: false });
        try {
            const SB = _symbiosisBridgeLib();
            if (!SB || typeof SB.ingestPhoneActionReceipt !== 'function') return bad('module-unavailable');
            const act = String(action || '').trim();
            if (act !== 'ingest') return bad('unknown-action');
            const p = (payload && typeof payload === 'object') ? payload : {};
            const rawOutcome = String(p.outcome || '').trim();
            if (RECEIPT_OUTCOMES.indexOf(rawOutcome) < 0) return bad('invalid-outcome');
            const outcome = _normOutcome(rawOutcome);
            const tag = String(p.proposalTag || '').trim();
            if (!tag) return bad('proposal-tag-required');
            const persist = p.persist !== false;
            const receipt = {
                receiptId: String(p.receiptId || ''), proposalTag: tag,
                outcome: outcome, rawOutcome: rawOutcome,
            };
            const wp = engine && engine.worldProg;
            if (!persist) {
                /* ★ 拒绝长期保存：只 push 进本会话，不进 worldProg、不动权重 ——
                 *   下一轮材料里不会再出现该链（这是「可拒绝」的可观测形态）。 */
                if (!Array.isArray(engine._sessionReceipts)) engine._sessionReceipts = [];
                engine._sessionReceipts.push(Object.assign({}, receipt, { at: Date.now() }));
                return { ok: true, reason: '', writes: false, persist: false, outcome, proposalTag: tag, sessionOnly: engine._sessionReceipts.length };
            }
            if (!wp) return bad('no-world-progress');
            if (!wp.symbiosisState || typeof wp.symbiosisState !== 'object') wp.symbiosisState = { actionReceipts: [], strategyWeights: {} };
            const out = SB.ingestPhoneActionReceipt(wp.symbiosisState, {
                receiptId: receipt.receiptId, proposalTag: tag, outcome: outcome,
            });
            if (!out || out.success !== true) return bad('kernel-refused:' + ((out && out.reason) || 'unknown'));
            wp.symbiosisState = out.state;
            if (engine) engine._actionReceiptRead = null;
            return { ok: true, reason: '', writes: true, persist: true, outcome, rawOutcome, proposalTag: tag, adjustedWeight: out.adjustedWeight };
        } catch (e) { errLog(e, 'engine.actionReceiptAct'); return { ok: false, reason: 'thrown', writes: false }; }
    }

    function _actionReceiptLine(engine) {
        try {
            const r = actionReceiptState(engine, {});
            if (!r.ok) return '不可用 · ' + r.reason;
            const dn = r.downstream === 'present' ? '下游在线' : (r.downstream === 'disabled' ? '下游已关闭' : '下游缺席');
            if (r.receipts === 0) return `行动回执：尚无回执（${dn}）` + (r.sessionOnly ? ` · 本会话 ${r.sessionOnly} 笔未长期保存` : '');
            return `行动回执 ${r.receipts} 笔（采纳 ${r.byOutcome.accepted} / 拒绝 ${r.byOutcome.rejected} / 超时 ${r.byOutcome.timed_out} / 部分 ${r.byOutcome.partial}）· ${dn}`;
        } catch (e) { errLog(e, 'engine._actionReceiptLine'); return '—（诊断异常）'; }
    }

    /* ---- X9 沉默状态可解释（memory-season-silence-manager.js + memory-season.js）----
     * 产品形态：某条记忆「为什么这轮没进来」的四问可查：
     *   ① 没被召回（候选阶段就没进）② 召回了被挡（含原因码）③ 召回了被裁剪（预算不够）
     *   ④ 用户主动静音。
     * 三条口径：
     *   · **静音不删除**（随时可重开）；
     *   · **秘密不因周年浮现**（内核在 evaluateTopicSeason 最前面短路，本层不重判）；
     *   · 「**不存在**」与「没进来」必须不同形（`not-found` 是独立一态）。 */
    var SILENCE_QUESTIONS = Object.freeze(['not-recalled', 'blocked', 'trimmed', 'muted']);

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


    var api = Object.freeze({ bindDeps, _floorLedgerLine, institutionState, institutionAct, _institutionLine, relationDynamicsState, relationDynamicsAct, _relationDynamicsLine, agencyContractState, agencyContractAct, _agencyContractLine, symbolicEvolutionState, symbolicEvolutionAct, _symbolicEvolutionLine, eraInheritanceState, eraInheritanceAct, _eraInheritanceLine, institutionRuleState, institutionRuleAct, _institutionRuleLine, meaningViewState, meaningViewAct, _meaningViewLine, worldlinePrehistory, _worldlinePrehistoryLine, evidenceImpactReplay, _evidenceImpactLine, actionReceiptState, actionReceiptAct, _actionReceiptLine, silenceExplainState, silenceExplainAct, _silenceExplainLine, RULE_TIERS, RULE_STATUSES, RECEIPT_OUTCOMES, SILENCE_QUESTIONS, EVIDENCE_IMPACT_VERDICTS, _summaryProvenanceLine, _branchGuardLine, _crosslinkLine, _crosslinkConsumePair, _crosslinkConsumeAlive, _crosslinkConsumeLine, _emotionOppositeLine, _graphRollupLine, _relationDisclosureLine, _relationMutualLine, _knowledgeNetworkLine, _knowledgeTraceLine, relationHistory, relationHistoryAt, _relationHistoryLine, causalChainGraph, causalChainTodos, causalChainTrace, causalChainProposals, _causalChainLine, perspectiveCard, testimonyBoard, testimonyRevoke, _testimonyBoardLine, narrativeLayer, narrativeReality, narrativeProject, _narrativeLayerLine, _returnGateCandidates, returnGate, returnGateAdmit, returnGateMark, returnGatePrefer, _returnGateLine, _worldlineState, _worldlineRead, worldlineGate, worldlineConvergence, worldlineSwitchPlan, worldlineDiff, _worldlineLine, worldlineJumpDraft, _materialInventory, materialPack, _materialPackLine, _crosscheckChatRows, loreCrosscheck, _loreCrosscheckLine, perspectiveContrast, _perspectiveCardLine, _extractionWindowFloors, extractionPlan, _extractionDriverLine, correctionPlanReextract, correctionPlanConfig, _correctionPlanLine, _secretIsolationLine, _branchSemanticsLine, confirmBranchImport, _volumeContinuationLine, _recallExplainLib, explainRecallHost, _recallExplainLine, suggestRecallFixes, buildVolumePack, handoffVolumeContinuation, revokeVolumeHandoff, _promptFillLine, _changesetLine });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaDiagnosticLines = api;
})(typeof window !== 'undefined' ? window : globalThis);
