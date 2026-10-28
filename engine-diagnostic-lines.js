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

    function _moduleLib() { return _ml ? _ml.apply(null, arguments) : null; }
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
    function _moduleLib() { return _libs._moduleLib ? _libs._moduleLib.apply(null, arguments) : null; }
    function _narrativeLayerLib() { return _libs._narrativeLayerLib ? _libs._narrativeLayerLib.apply(null, arguments) : null; }
    function _perspectiveCardLib() { return _libs._perspectiveCardLib ? _libs._perspectiveCardLib.apply(null, arguments) : null; }
    function _recallExplainLib() { return _libs._recallExplainLib ? _libs._recallExplainLib.apply(null, arguments) : null; }
    function _relationHistoryLib() { return _libs._relationHistoryLib ? _libs._relationHistoryLib.apply(null, arguments) : null; }
    function _returnGateLib() { return _libs._returnGateLib ? _libs._returnGateLib.apply(null, arguments) : null; }
    function _summaryProvenanceLib() { return _libs._summaryProvenanceLib ? _libs._summaryProvenanceLib.apply(null, arguments) : null; }
    function _testimonyBoardLib() { return _libs._testimonyBoardLib ? _libs._testimonyBoardLib.apply(null, arguments) : null; }
    function _worldlineMemoryLib() { return _libs._worldlineMemoryLib ? _libs._worldlineMemoryLib.apply(null, arguments) : null; }

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
            const lineId = String(pick('worldlineId', cfg.worldlineId, '') || '').trim();
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
            const jumps = (function () {
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
                    return keep;
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
                    return keep;
                }
                const rows = [];
                const text = String(raw || '');
                const lines2 = text.split(/\r?\n/);
                for (let i = 0; i < lines2.length; i++) {
                    const s2 = lines2[i].trim();
                    if (!s2 || s2.charAt(0) === '#') continue;
                    const at = s2.indexOf(':') >= 0 ? s2.indexOf(':') : s2.indexOf('=');
                    if (at <= 0) continue;
                    const f = Number(s2.slice(0, at).trim());
                    const rest = s2.slice(at + 1).trim();
                    if (!Number.isFinite(f) || f < 0 || !rest) continue;
                    const parts = rest.split(/[:：=]/);
                    const lid = String(parts[0] || '').trim();
                    if (!lid) continue;
                    const dv = parts.length > 1 ? Number(parts[1]) : NaN;
                    rows.push({ floor: Math.floor(f), lineId: lid, divergence: Number.isFinite(dv) ? dv : null });
                }
                rows.sort((a, b) => a.floor - b.floor);
                return rows;
            })();
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
             *   配置给了就用配置（卡作者知道这一纪元从哪楼起）；
             *   没给则**不猜** —— 留 null，条目退化成「只知道层标记、不知道纪元」，
             *   同号跨纪元那一格会落 unknown 而不是被误判成 same。 */
            const startFloor = (function () {
                const raw = pick('worldlineStartFloor', cfg.worldlineStartFloor, null);
                if (raw === null || raw === undefined || raw === '') return null;
                const n = Number(String(raw).trim());
                return (Number.isFinite(n) && n >= 0) ? Math.floor(n) : null;
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

    var api = Object.freeze({ bindDeps, _floorLedgerLine, _summaryProvenanceLine, _branchGuardLine, _crosslinkLine, _crosslinkConsumePair, _crosslinkConsumeAlive, _crosslinkConsumeLine, _emotionOppositeLine, _graphRollupLine, _relationDisclosureLine, _relationMutualLine, _knowledgeNetworkLine, _knowledgeTraceLine, relationHistory, relationHistoryAt, _relationHistoryLine, causalChainGraph, causalChainTodos, causalChainTrace, causalChainProposals, _causalChainLine, perspectiveCard, testimonyBoard, testimonyRevoke, _testimonyBoardLine, narrativeLayer, narrativeReality, narrativeProject, _narrativeLayerLine, _returnGateCandidates, returnGate, returnGateAdmit, returnGateMark, returnGatePrefer, _returnGateLine, _worldlineState, _worldlineRead, worldlineGate, worldlineConvergence, worldlineSwitchPlan, worldlineDiff, _worldlineLine, _materialInventory, materialPack, _materialPackLine, _crosscheckChatRows, loreCrosscheck, _loreCrosscheckLine, perspectiveContrast, _perspectiveCardLine, _extractionWindowFloors, extractionPlan, _extractionDriverLine, correctionPlanReextract, correctionPlanConfig, _correctionPlanLine, _secretIsolationLine, _branchSemanticsLine, confirmBranchImport, _volumeContinuationLine, _recallExplainLib, explainRecallHost, _recallExplainLine, suggestRecallFixes, buildVolumePack, handoffVolumeContinuation, revokeVolumeHandoff, _promptFillLine, _changesetLine });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaDiagnosticLines = api;
})(typeof window !== 'undefined' ? window : globalThis);
