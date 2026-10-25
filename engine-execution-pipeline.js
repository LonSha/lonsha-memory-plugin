// [v3.371.0] engine-execution-pipeline.js: 从 index.js 剥离的记忆提取后执行、图谱与各子系统状态写入管线
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineExecutionPipeline = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    let _deps = {};
    function bindDeps(deps) {
        if (deps && typeof deps === 'object') {
            _deps = Object.assign({}, _deps, deps);
        }
    }

    function _moduleLib(getGlobal, fileName) {
        if (typeof _deps.moduleLib === 'function') return _deps.moduleLib(getGlobal, fileName);
        if (typeof _deps._moduleLib === 'function') return _deps._moduleLib(getGlobal, fileName);
        try {
            const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null;
            if (viaGlobal) return viaGlobal;
        } catch (_) {}
        if (typeof require !== 'undefined') {
            try { return require('./' + fileName); } catch (_) {}
        }
        return null;
    }

    function _branchGuardLib() {
        if (typeof _deps._branchGuardLib === 'function') return _deps._branchGuardLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaBranchGuard : null), 'branch-guard.js');
    }

    function _summaryProvenanceLib() {
        if (typeof _deps._summaryProvenanceLib === 'function') return _deps._summaryProvenanceLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSummaryProvenance : null), 'summary-provenance.js');
    }

    function _ironyFilterLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaIronyImmuneFilter : null), 'irony-pretense-immune-filter.js');
    }
    function _factLifecycleLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaFactLifecycleMatrix : null), 'fact-unified-lifecycle-matrix.js');
    }
    function _intentCostLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaIntentCostTracker : null), 'postgen-intent-cost-tracker.js');
    }
    function _expectationAbsenceLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaExpectationAbsence : null), 'expectation-absence-tracker.js');
    }
    function _psychologicalBoundaryLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaPsychologicalBoundary : null), 'psychological-boundary-shift.js');
    }
    function _causalCircuitLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCausalCircuit : null), 'proactive-causal-verification-circuit.js');
    }
    function _channelOsmosisLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaChannelOsmosis : null), 'embodied-multi-channel-osmosis-hub.js');
    }
    function _personaSynthesizerLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaPersonaSynthesizer : null), 'dynamic-persona-crystallization-substrate.js');
    }
    function _rumorNetworkLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaRumorNetwork : null), 'social-rumor-drift-network.js');
    }
    function _tokenTrackerLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaTokenTracker : null), 'physical-token-spatial-trace-tracker.js');
    }
    function _dissociationSandboxLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaDissociationSandbox : null), 'traumatic-dissociation-dissonance-sandbox.js');
    }
    function _rubyPhoneBridgeLib() {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaRubyPhoneBridge : null), 'ruby-phone-bidirectional-bridge.js');
    }
    function _crosslinkLib() {
        if (typeof _deps._crosslinkLib === 'function') return _deps._crosslinkLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCrosslink : null), 'crosslink.js');
    }

    function errLog(err, tag) {
        if (typeof _deps.errLog === 'function') return _deps.errLog(err, tag);
        try { console.error('[LonShaExecutionPipeline]', tag, err); } catch (_) {}
    }

    function classifyRelationshipType(...args) {
        return typeof _deps.classifyRelationshipType === 'function' ? _deps.classifyRelationshipType(...args) : 'other';
    }

    function detectEthicsConflict(...args) {
        return typeof _deps.detectEthicsConflict === 'function' ? _deps.detectEthicsConflict(...args) : null;
    }

    function _newRelativeTimeHelper(...args) {
        return typeof _deps._newRelativeTimeHelper === 'function' ? _deps._newRelativeTimeHelper(...args) : { extractDualTimeTags: () => null };
    }

    function validateLedgerItemOps(...args) {
        return typeof _deps.validateLedgerItemOps === 'function' ? _deps.validateLedgerItemOps(...args) : { valid: [], dropped: [] };
    }

    function numOr(...args) {
        return typeof _deps.numOr === 'function' ? _deps.numOr(...args) : 0;
    }

    function hash32(...args) {
        return typeof _deps.hash32 === 'function' ? _deps.hash32(...args) : 0;
    }

    function cyclePositionFor(...args) {
        return typeof _deps.cyclePositionFor === 'function' ? _deps.cyclePositionFor(...args) : null;
    }

    const PLUGIN_NAME = 'LonShaMemoryPlugin';

    async function applyExtractedPayload(engine, extracted, message, options = {}) {
        const { rawForSynopsis: _rawForSynopsis, chatId } = options || {};
        return (async function() {
            let _savePersisted = false;
                const messageText = message.mes || '';
                
                if (extracted?.characters) {
                    // [v3.6] 图谱膨胀修复: 先查后建（原实现每楼新 id——同角色 N 楼 = N 个重复节点，长对话无限膨胀）
                    for (const char of extracted.characters) {
                        const canonical = this.resolveCharacterName(char);
                        this.graph.snapshotGraph(message.index);   // [v3.15] 图谱快照: 楼层起点
                        const existChar = this.graph.findCharacterByName(canonical);
                        if (existChar) {
                            // 已存在: 只补首次出现信息（不重复建；source 保留首次）
                            if (!existChar.data?.source && messageText) existChar.data = {...(existChar.data || {}), source: messageText};
                        } else {
                            this.graph.addNode({type: 'character', name: canonical, data: this._scopeData({source: messageText})});
                            this.opLog?.log('graph', 'add', canonical, message?.index || 0, 'character node');  // [v3.54] op-log
                        }
                    }
                }
                
                if (extracted?.events) {
                    for (const event of extracted.events) {
                        const nodeId = this.graph.addNode({type: 'event', name: event.type, data: event});
                        if (event.participants) {
                            for (const p of event.participants) {
                                this.graph.addEdge({from: p, to: nodeId, label: 'participated_in', floor: message.index || 0});
                            }
                        }
                    }
                }
                
                if (extracted?.relationships) {
                    for (const rel of extracted.relationships) {
                        const relFrom = this.resolveCharacterName(rel.from);
                        const relTo = this.resolveCharacterName(rel.to);
                        // [v1.5] 单向主观关系：主名归并 + attitude 三值入边数据
                        // [v3.37] 传入时态楼层 floor（时态图谱 Zep 理念）
                        // [v3.184] disclosure：关系的「何时该披露」条件（nocturne_memory 的 edge disclosure）。
                        //   只在作者真写了条件时才落库——无条件的关系不写这个字段，
                        //   否则每条边都带一个空串，存档体积白涨且「谁写了条件」不可辨（全是空）。
                        const _disc = String(rel.disclosure == null ? '' : rel.disclosure).trim();
                        this.graph.addEdge({
                            from: relFrom,
                            to: relTo,
                            label: rel.type, weight: 1.0,
                            floor: message.index || 0,
                            data: Object.assign(
                                {attitude: rel.attitude || 'neutral', note: rel.note || '', relClass: classifyRelationshipType(rel.type)},
                                _disc ? {disclosure: _disc} : null
                            )
                        });
                        // [v3.43] 图谱关系已由 addEdge 记录为楼层 delta，供 swipe/删楼重放
                        // [v3.48] P2: 伦理冲突检测（family × intimate 交叉即告警，配合 v3.45 羁绊网防乱伦）
                        // [v3.53] P14 静默缺口修复: extracted.ties_context 从未在提取 schema 中定义（v3.48 遗留），
                        // existingTies 永远 undefined → 检测从未工作。改用 engine 侧真实羁绊数据。
                        if (this.config.config.ethicsConflictEnabled !== false) {
                            const _tiesData = this.status?.getNpcTiesRecords?.() || [];
                            if (_tiesData.length) {
                                const _ethics = detectEthicsConflict(relFrom, relTo, rel.type, _tiesData);
                                if (_ethics && this.config.config.debugMode) {
                                    console.warn(`[${PLUGIN_NAME}] ⚠️ 伦理冲突: ${_ethics.from} × ${_ethics.to}（${_ethics.relation}）与既有血缘羁绊「${_ethics.tie}」交叉`);
                                }
                            }
                        }
                    }
                }
                
                // [v3.42/v3.43] 将提取出的结构化人格、地理与不在场认知写入对应真源
                try {
                    const storyFloor = message.index || 0;
                    for (const ch of (extracted?.characters || [])) {
                        const cn = this.resolveCharacterName(ch);
                        const node = this.graph.findCharacterByName(cn);
                        const fields = extracted?.character_states?.[ch] || extracted?.character_states?.[cn] || null;
                        if (fields?.baseline) this.status.setBaseline(cn, { ...fields.baseline, floor: storyFloor });
                        if (fields?.drift) this.status.recordDrift(cn, { ...fields.drift, floor: storyFloor });
                    }
                    const geo = extracted?.geo_location || extracted?.location_context;
                    if (geo && typeof geo === 'object') this.status.setGeoLocation({ ...geo, floor: storyFloor });
                } catch (e) { errLog(e, 'onMessageReceived.caikis状态增强'); }

                // [v1.8] P0: 写入角色私密记忆（POV 隔离）
                if (this.config.config.povIsolation && Array.isArray(extracted?.pov_memories)) {
                    let povCount = 0;
                    for (const p of extracted.pov_memories) {
                        if (p?.owner && p?.content) {
                            const owner = this.resolveCharacterName(p.owner);
                            this.pov.add(owner, String(p.content).trim(), message.index || 0);
                            this.opLog?.log('pov', 'add', owner, message.index || 0, String(p.content).slice(0, 40));  // [v3.58] P20
                            povCount++;
                        }
                    }
                    // 事件里标了 scope:pov 的也收进 POV 池
                    for (const ev of (extracted?.events || [])) {
                        if (ev?.scope === 'pov' && ev?.owner && ev?.description) {
                            this.pov.add(this.resolveCharacterName(ev.owner), String(ev.description).trim(), message.index || 0);
                            povCount++;
                        }
                    }
                    if (povCount && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] POV私密记忆 +${povCount}`);
                }
                // [v3.16] 角色记忆银行写入（收编 zhino 两层记忆）: 近期=每轮摘要; 核心=关系变化/约定/重大事件
                if (this.config.config.charMemEnabled && extracted) {
                    try {
                        const floor = message.index || 0;
                        // 近期记忆: 当前角色最近发生了什么
                        const chars = (extracted.characters || []).slice(0, 5);
                        if (chars.length && extracted.summary) {
                            for (const ch of chars) {
                                const cn = this.resolveCharacterName(ch);
                                this.charMem.addRecent(cn, extracted.summary.slice(0, 120), floor);
                            }
                        }
                        // 核心记忆: 关系变化（关系建立/恶化）、约定/目标新立
                        for (const rel of (extracted.relationships || [])) {
                            const att = rel?.attitude;
                            if (att === 'positive' || att === 'negative') {
                                const a = this.resolveCharacterName(rel.from), b = this.resolveCharacterName(rel.to);
                                const coreText = `${a}与${b}关系（${att === 'positive' ? '友好' : '对立'}）`;
                                this.charMem.addCore(a, coreText, floor);
                                this.charMem.addCore(b, coreText, floor);
                            }
                        }
                        for (const pl of (extracted.plans || [])) {
                            if (pl?.contentIsNew && pl.content) {
                                const owner = (pl.character && this.resolveCharacterName(pl.character)) || (chars[0] && this.resolveCharacterName(chars[0]));
                                if (owner) this.charMem.addCore(owner, `约定/目标: ${String(pl.content).slice(0, 100)}`, floor);
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.charMem写入'); }
                }

                // [v3.46] 吸收 Bakemono: 剧情时钟维护与回忆隔离
                try {
                    const curFloor = message.index || 0;
                    const clk = extracted?.story_clock;
                    if (clk && typeof clk === 'object') {
                        this.clock.setTime({
                            date: clk.date,
                            label: clk.label,
                            flashback: !!clk.is_flashback,
                            relativeDays: clk.relative_days,
                            floor: curFloor
                        });
                    } else if (extracted?.story_date) {
                        const isFlashback = /回忆|往事|当年|曾经|十年前|百年前/.test(message.mes || '');
                        this.clock.setTime({
                            date: extracted.story_date,
                            flashback: isFlashback,
                            floor: curFloor
                        });
                    }
                    // [v3.94] 缝入 MyriadKnots story-clock 解析：正文 HTML 注释时间戳回读校准。
                    // 正文为最高事实源——若 LLM 按 v3.72 在正文首尾写了结构化时间注释，
                    // 优先用正文实际时间校准（LLM 提取的 story_clock 仅为次优推断）。
                    // 须在 cleanMessageText 剥标签前的原文上解析。
                    try {
                        const rawMes = (typeof _rawForSynopsis !== 'undefined' && _rawForSynopsis) ? _rawForSynopsis : (message.mes || '');
                        if (rawMes) this.clock.syncFromNarrative(rawMes, { floor: curFloor });
                        // [v3.175] 世界钟对账（只读）：读 WorldAxis 世界桥，记下「另一个插件认为现在是几号」。
                        //   本插件此前对 WorldAxis **零消费**——两个钟各走各的，谁都不知道谁不一致。
                        //   此处只对账、不改时钟：正文仍是最高事实源（见 readWorldAxisClock 注释）。
                        try { this.clock.readWorldAxisClock(null, { reason: 'after-message' }); } catch (_e0) { errLog(_e0, 'nonfatal'); }
                        // [v3.176] 世界账本对读（只读）：不只读钟，把推演侧的全账本（暗流/事实/人物/舆情）
                        //   以及对本地账本的对读（人物位置、权威事实差集）一并取回。**含未外供缺口**——
                        //   修前本插件连「有多少东西没给我」都读不到。
                        //   宿主侧入口：本地投影由插件收集后传入（时钟上取不到 status/outline）。
                        try { this.readWorldLedger({ reason: 'after-message' }); } catch (_e0b) { errLog(_e0b, 'nonfatal'); }
                    } catch (e) { errLog(e, 'onMessageReceived.syncFromNarrative'); }
                    // [v3.130] baibai 正文时间标签协议闭环：bbs_start/bbs_end → GameClock 校准。
                    // 此前标签只喂时间线与向量元数据，时钟本体只被 LLM 推断的 story_clock 校准——
                    // 正文最高事实源反而不影响时钟。结束时间为本楼后的当前时钟；坏标签降级只统计不污染。
                    try {
                        const _tts = this.clock.timeTagStats || (this.clock.timeTagStats = { total: 0, paired: 0, unparseable: 0, calibrated: 0 });
                        _tts.total++;
                        const _dtt = _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis || message.mes || '');
                        if (_dtt?.parseError === 'half-pair') {
                            // 半对：另一侧缺失——记录但不校准
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间标签半对(缺${_dtt.start ? 'end' : 'start'})，跳过时钟校准 (楼层 ${curFloor})`);
                        } else if (_dtt?.hasDual) {
                            _tts.paired++;
                            if (_dtt.parseError) {
                                _tts.unparseable++;
                                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间标签无法解析(${_dtt.parseError})，跳过时钟校准 (楼层 ${curFloor})`);
                            } else {
                                const _endD = String(_dtt.end).split(/\s+/)[0];
                                if (_endD && /[\d年月/.]/.test(_endD)) {
                                    this.clock.setTime({ date: _endD, label: String(_dtt.end).split(/\s+/).slice(1).join(' '), floor: curFloor });
                                    _tts.calibrated++;
                                    // [v3.132] 标签驱动的时间跳变同样纳入倒跳检测（此前只有 LLM 提取的 story_date 走 checkTimeMonotonic）
                                    this.checkTimeMonotonic(_endD, curFloor);
                                    if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🕐 正文时间标签校准时钟: ${_endD} (楼层 ${curFloor})`);
                                }
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.timeTagClock'); }
                } catch (e) { errLog(e, 'onMessageReceived.GameClock'); }

                // [v1.8] P0: 写入剧情时间线
                if (this.config.config.plotTimeline && extracted?.summary) {
                    let sd = this.extractStoryDate(message.mes || '', extracted.story_date);
                    // [v3.72] B: 正文时间标签的 end 优先为剧情日期（正文事实优先于 LLM 猜测）
                    try {
                        const dta = _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis || message.mes || '');  // [v3.73] 清洗前原文（cleanMessageText 会剥 bbs 标签）
                        if (dta?.hasDual && dta.end) {
                            const endDate = String(dta.end).split(/\s+/)[0];  // 取日期部分（去时刻）
                            if (endDate && /[\d年月/.]/.test(endDate)) sd = endDate;
                        }
                    } catch (e) { /* 时间标签解析失败用原 story_date */ }
                    // [v3.32] event importance aggregation - Visual-Memory tiering
                    let tlImp = 5;
                    for (const ev of (extracted?.events || [])) {
                        const v = Number(ev?.importance);
                        if (v >= 1 && v <= 10 && v > tlImp) tlImp = v;
                    }
                    // [v3.18] 时间锚点一致性校验（检测倒跳）
                    if (sd) this.checkTimeMonotonic(sd, message.index || 0);
                    if (extracted?.time_anchor?.end) this.checkTimeMonotonic(extracted.time_anchor.end, message.index || 0);
                    if (sd) this.timeline.add(sd, extracted.summary, message.index || 0, extracted.characters || [], tlImp);
                    this.opLog?.log('timeline', 'add', `tl_${message.index || 0}`, message.index || 0, sd || '');  // [v3.58] P20
                    // [v2.9] RU-A: 主动时间推进——正文说"三天后/次日"但没写日期时，基于上一楼日期算术推进
                    const adv = Number(extracted.time_advance_days) || 0;
                    if (adv > 0) {
                        const base = sd || this._lastStoryDate;
                        const advanced = base ? this.advanceStoryDate(base, adv) : null;
                        if (advanced) {
                            this.timeline.add(advanced, extracted.summary, message.index || 0, extracted.characters || [], tlImp);
                            this._lastStoryDate = advanced;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 时间推进: ${base} +${adv}天 → ${advanced}`);
                        }
                    } else if (sd) {
                        this._lastStoryDate = sd;
                    }
                }

                // [v3.48] P1: 大纲轮次推进（每个 AI 楼层处理完 → 当前 turn 记入简史并推进指针）
                if (this.config.config.outlineDirectorEnabled !== false && this.outline?.stage && !message.is_user) {
                    try {
                        const _curBefore = this.outline._turnIndex;
                        this.outline.advanceTurn(message.index || 0);
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 大纲推进: 第${_curBefore + 1}轮完成 → 指针 ${this.outline._turnIndex}`);
                        // [v3.56] P18: 大纲耗尽时异步规划新阶段（不阻塞生成流）
                        if (this.config.config.outlineAutoPlan && this.outline.exhausted && !this.outline._planning) {
                            this.outline.planNext(this.config.config, this.llm, this, message.index || 0)
                                .then(st => { if (st && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🎬 新阶段已规划: ${st.title}（${st.nodes.length} 节点）`); })
                                .catch(() => {});
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.大纲推进'); }
                }
                // [v2.2] RC: 悬念簿（新悬项登记 + 了结核销 + 超限沉降）
                if (this.config.config.suspenseEnabled && extracted) {
                    try {
                        let susN = 0;
                        for (const pl of (extracted.plans || [])) {
                            if (pl && pl.contentIsNew !== false && pl.content) {
                                if (this.suspense.add(pl.kind, pl.content, message.index || 0, extracted.story_date || null)) susN++;
                            }
                        }
                        let resN = 0;
                        for (const pr of (extracted.plans_resolve || [])) {
                            if (pr && (pr.id || pr.content)) {
                                if (this.suspense.resolve(pr.id || pr.content, pr.outcome, pr.reason, message.index || 0)) resN++;
                            }
                        }
                        // [v3.54] op-log: 悬念簿变更事件
                        if (susN) this.opLog?.log('suspense', 'add', `${susN} items`, message?.index || 0, '');
                        const pruned = this.suspense.prune(this.config.config.suspenseMaxOpen || 20);
                        if ((susN || resN || pruned) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 悬念簿: +${susN} 新增, ${resN} 了结, ${pruned} 沉降`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 悬念簿处理失败:`, e); }
                }
                /* [v3.309.0 · M-O8 第四刀] 分支判定**前移**到世界推进之前。
                 *   【修前实测，探针 tests/audit/_mo8_branch_probe.mjs 可复现】
                 *     `guardApply` 原本只在摘要落笔处调用（本节下方 §2），而承诺 / 支线 /
                 *     认知 / 秘密的写入在**它之前 295~422 行**就已执行完；探针 R2 实测
                 *     `_branchOk` 的四个使用点里世界推进写入口被覆盖 **0/21**。
                 *     ⇒ 翻页 / 重生成之后，被放弃那一分支的账照旧入账，而账本是会话级、
                 *       无分支归属 —— 这正是 M-O8 验收②「A 分支秘密不出现在 B」的字面反例。
                 *   【为什么判定要前移而不是在下面再算一次】
                 *     两次判定各取一次 `getProcessedSignature`，中间若发生翻页，两处会得出
                 *     不同结论（摘要放行、账本拦下，或反过来）—— 那是「同一个问题两个答案」，
                 *     本仓治理过多轮。故**只算一次**，结果存 `this._branchVerdict`，下面 §2
                 *     改为读它；§2 原逻辑逐字保留（同一对象、同一字段）。
                 *   【为什么判不了就放行】
                 *     `judged === false`（首次提取 / 老对话 / 分支守护未装）**不是**「有问题」，
                 *     按 branch-guard 自己的纪律「隔离漏一点，好过让用户的记忆整体消失」放行；
                 *     一律拦等于把世界推进功能关掉。三态各自留痕，不压成一格。 */
                let _branchOk = true;
                this._branchVerdict = null;
                try {
                    const BG0 = _branchGuardLib();
                    if (BG0 && typeof BG0.createGuard === 'function') {
                        if (!this._branchGuard) this._branchGuard = BG0.createGuard();
                        const sess0 = this.getCurrentChatId ? this.getCurrentChatId() : '';
                        const f0 = Number(message && message.index);
                        const g0 = this._branchGuard.guardApply(message, this._branchGuard.getProcessedSignature(f0, sess0), sess0);
                        this._branchVerdict = { accept: !!g0.accept, judged: !!g0.judged, reason: String(g0.reason || ''), floor: f0 };
                        if (!g0.accept) _branchOk = false;
                    }
                } catch (e) { errLog(e, 'onMessageReceived.分支判定前移'); }
                /* 世界推进整块的分支闸：只在「判得出问题」时拦。
                 *   读数走 `_wpBranchSkip`（三态不同形：拦下 / 判不了放行 / 无守卫），
                 *   与 `_branchGuardLast`（摘要面）分开记 —— 两件事都拦了却只报一处，
                 *   会让「账本被拦」与「摘要被拦」在后验时无法分辨。
                 *   ★ 不另立 `_wpBranchGate` 布尔：本仓点名过「写完没人调 = 等于没写」，
                 *     而闸本身已经在 `if (... && _branchOk)` 的条件串里被消费 ——
                 *     再存一份布尔就是第二份真源，两处漂移时无人能判谁对。 */
                if (_branchOk === false) {
                    this._wpBranchSkip = {
                        skipped: true,
                        reason: (this._branchVerdict && this._branchVerdict.reason) || 'unknown',
                        floor: Number(message && message.index) || 0,
                        at: Date.now()
                    };
                    if (this.config.config.debugMode) console.log('[' + PLUGIN_NAME + '] ⛔ 分支守护拦截第' + this._wpBranchSkip.floor + '楼世界推进账本写入（' + this._wpBranchSkip.reason + '）');
                    try { this.opLog?.log?.('branch', 'wp-skip', String(this._wpBranchSkip.reason), this._wpBranchSkip.floor, ''); } catch (e) { errLog(e, 'onMessageReceived.分支账本审计'); }
                }
                // [v3.85] A/B/C: WorldProgress 数据源接线（承诺账本/剧情支线/认知隔离）
                if (this.config.config.worldProgressEnabled && extracted && _branchOk) {
                    try {
                        const wpFloor = Number(message.index) || 0;
                        let promiseCount = 0, arcCount = 0, knowledgeCount = 0, secretCount = 0;
                        const explicitPromises = Array.isArray(extracted.promises) ? extracted.promises : [];
                        for (const raw of explicitPromises.slice(0, 3)) {
                            const item = typeof raw === 'string' ? { content: raw } : (raw || {});
                            const content = String(item.content || item.text || '').trim();
                            if (!content) continue;
                            const character = String(item.character || item.owner || '通用').trim().slice(0, 40) || '通用';
                            const deadline = Number(item.deadlineFloor);
                            const p = this.worldProg.addPromise({
                                character,
                                content: content.slice(0, 180),
                                deadlineFloor: Number.isFinite(deadline) && deadline > 0 ? deadline : null,
                                floor: wpFloor
                            });
                            if (p) promiseCount++;
                            this.recordCommitmentFact({
                                actor: character,
                                content,
                                due: Number.isFinite(deadline) && deadline > 0 ? String(deadline) : null,
                                storyDate: extracted.story_date || null,
                                floor: wpFloor,
                                source: 'promises',
                                eventKey: 'open:' + character + ':' + content
                            });
                        }
                        const arcs = Array.isArray(extracted.plot_arcs) ? extracted.plot_arcs : [];
                        for (const raw of arcs.slice(0, 3)) {
                            if (!raw || typeof raw !== 'object') continue;
                            const action = String(raw.action || 'add').trim().toLowerCase();
                            const key = String(raw.id || raw.title || '').trim();
                            if (!key) continue;
                            if (action === 'touch') {
                                if (this.worldProg.touchArc(key, wpFloor)) arcCount++;
                            } else if (action === 'resolve') {
                                const arc = this.worldProg.plotArcs.find(a => a.id === raw.id || a.title === key);
                                if (arc) {
                                    arc.status = 'resolved';
                                    arc.resolutionFloor = wpFloor;
                                    arc.resolutionReason = String(raw.reason || '').slice(0, 120);
                                    arcCount++;
                                }
                            } else {
                                const arc = this.worldProg.addPlotArc({
                                    title: key.slice(0, 80),
                                    clue: String(raw.clue || raw.content || '').slice(0, 180),
                                    interestedBy: String(raw.interestedBy || raw.character || '').slice(0, 40),
                                    currentFloor: wpFloor,
                                    createdFloor: wpFloor
                                });
                                if (arc) arcCount++;
                            }
                        }
                        // [v3.178] promises_resolve 消费口（此前提取了但产品零消费 ⇒ 承诺永不了结）。
                        //   注入区已带 prom_id，AI 按 id 回引；id 缺失时按「未了结且内容唯一匹配」回退，
                        //   匹配到多条则不动（宁可不结，不可错结）。
                        let resolvedCount = 0;
                        const resolveReqs = Array.isArray(extracted.promises_resolve) ? extracted.promises_resolve : [];
                        for (const raw of resolveReqs.slice(0, 5)) {
                            if (!raw || typeof raw !== 'object') continue;
                            let target = null;
                            const rid = String(raw.id || '').trim();
                            if (rid) {
                                target = this.worldProg.promises.find(x => x.id === rid) || null;
                            } else {
                                const rc = String(raw.content || raw.text || '').trim();
                                if (rc) {
                                    const cands = this.worldProg.promises.filter(x =>
                                        (x.status === 'pending' || x.status === 'imminent' || x.status === 'overdue') &&
                                        (x.content === rc || x.content.includes(rc) || rc.includes(x.content)));
                                    if (cands.length === 1) target = cands[0];
                                }
                            }
                            if (target && this.worldProg.resolvePromise(target.id, raw.status, wpFloor)) {
                                resolvedCount++;
                                const broken = String(raw.status || '').toLowerCase() === 'broken';
                                this.recordCommitmentFact({
                                    actor: target.character,
                                    content: target.content,
                                    action: broken ? 'break' : 'fulfill',
                                    storyDate: extracted.story_date || null,
                                    floor: wpFloor,
                                    source: 'promises_resolve',
                                    eventKey: (broken ? 'break:' : 'fulfill:') + target.id + ':' + wpFloor
                                });
                            }
                        }
                        const changes = Array.isArray(extracted.knowledge_changes) ? extracted.knowledge_changes : [];
                        for (const raw of changes.slice(0, 8)) {
                            if (!raw || typeof raw !== 'object') continue;
                            const character = String(raw.character || raw.owner || '').trim().slice(0, 40);
                            const fact = String(raw.fact || raw.content || '').trim().slice(0, 180);
                            if (!character || !fact) continue;
                            const action = String(raw.action || 'unaware').toLowerCase();
                            if (action === 'reveal' || action === 'known') this.worldProg.revealKnowledge(character, fact, raw.source || '');
                            else this.worldProg.markUnaware(character, fact);
                            /* [v3.291.0 · X5] 同一次提取里**同时**记一条知识轨迹。
                             *   为什么必须并行记而不是从认知侧反推：
                             *     认知侧只有 {known, unaware} 两个字符串数组 ——
                             *     它答不出「第几楼」「从谁」「哪条证据」，更答不出 doubt /
                             *     misbelieve / retract 三种状态（那三种在认知侧无落点）。
                             *   轨迹失败**不得**连坐认知侧写入：cognitive 与 trace 是两条独立
                             *     处置（前者改状态、后者加轨迹），轨迹抛错必须被吞在本块内。 */
                            try {
                                if (this.worldProg && typeof this.worldProg.recordKnowledgeTrace === 'function') {
                                    this.worldProg.recordKnowledgeTrace({
                                        character,
                                        fact,
                                        action: (action === 'reveal' || action === 'known') ? 'correct' : (String(raw.action || '').toLowerCase() === 'doubt' ? 'doubt'
                                            : (String(raw.action || '').toLowerCase() === 'misbelieve' ? 'misbelieve'
                                                : (String(raw.action || '').toLowerCase() === 'retract' ? 'retract' : 'unaware'))),
                                        via: raw.via || raw.channel || '',
                                        from: raw.source || '',
                                        evidenceKey: raw.evidenceKey || raw.evidence || '',
                                        floor: wpFloor,
                                        identity: raw.identity || (raw.disguise ? 'surface' : 'unspecified'),
                                        corrects: raw.corrects || '',
                                        suspect: raw.suspect || '',
                                        note: raw.note || ''
                                    });
                                }
                            } catch (e) { errLog(e, 'onMessageReceived.知识轨迹'); }
                            knowledgeCount++;
                        }
                        /* [v3.306.0 · M-O8] 秘密账本提取通道消费口。
                         *   【修前实测：这条链路在提取层**根本没有生产口**】
                         *     secret-ledger.js 有 seal（keeper 必填、复封幂等、开数上限 MAX_OPEN=5），
                         *     宿主 index.js 有 recordSecretFact（八本账的同族写入入口），
                         *     但**全仓零调用点**（`grep -rn recordSecretFact` 只命中它自己的定义；
                         *     同代的 recordCommitmentFact 有 2 处、recordSeedFact 有 2 处、
                         *     recordEcho 有 1 处调用）⇒ 秘密账本在真实运行里**永远为空**。
                         *   本版把它接上：与 knowledge_changes 同一条提取通路（同一 LLM 轮次、
                         *     同一 wpFloor、同一 try/catch 归因），并逐条带 floor 与 eventKey
                         *     （eventKey 让复提取幂等：同轮重放不重复入账）。
                         *   【为什么放在 knowledge_changes 之后】secrets 与 knowledge 是同一件事的
                         *     两面（谁知道了 / 谁还不知道），相邻阅读才不会漏掉其中一面。 */
                        const secretReqs = Array.isArray(extracted.secrets) ? extracted.secrets : [];
                        for (const raw of secretReqs.slice(0, 5)) {
                            if (!raw || typeof raw !== 'object') continue;
                            const secretText = String(raw.secret || raw.content || '').trim();
                            if (!secretText) continue;
                            try {
                                const out = this.recordSecretFact({
                                    action: 'seal',
                                    secret: secretText.slice(0, 180),
                                    keeper: raw.keeper || raw.keepers || [],
                                    knowers: raw.knowers || [],
                                    about: raw.about || [],
                                    progress: raw.progress,
                                    floor: wpFloor,
                                    source: 'secrets',
                                    eventKey: 'seal:' + wpFloor + ':' + secretText.slice(0, 60)
                                });
                                /* 只有**真变了**才计数：复封幂等（changed=false）与
                                 *   keeper 缺失被拒（ok=false, reason=missing-keeper）都不得
                                 *   被计成「这一轮登记了一条秘密」——那是把拒绝读成成功。 */
                                if (out && out.ok && out.changed) secretCount++;
                            } catch (e) { errLog(e, 'onMessageReceived.秘密账本'); }
                        }
                        // 即时推进检查：不等到下一次生成才刷新 imminent/overdue 与支线沉降。
                        this.worldProg.checkPromises(wpFloor);
                        this.worldProg.decayArcs(wpFloor, 15);
                        // [v3.195] 已回收伏笔只留到下一回合。sweep 清 recoveredFloor < 本楼 的条。
                        //   本回合刚回收的留下；没有账本时 recordSeedFact 自己返回 null。
                        try { this.recordSeedFact({ action: 'sweep', floor: wpFloor }); }
                        catch (e) { errLog(e, 'onMessageReceived.伏笔清扫'); }
                        if (promiseCount || arcCount || knowledgeCount || secretCount || resolvedCount) {
                            this.opLog?.log('worldprogress', 'update', promiseCount + ' promises/' + arcCount + ' arcs/' + knowledgeCount + ' knowledge/' + secretCount + ' secrets/' + resolvedCount + ' resolved', wpFloor, '');
                            if (this.config.config.debugMode) console.log('[' + PLUGIN_NAME + '] 🌐 世界推进接线: 承诺' + promiseCount + '·支线' + arcCount + '·认知' + knowledgeCount + '·秘密' + secretCount + '·了结' + resolvedCount);
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.WorldProgress接线'); }
                }

                // [v2.4] RE: 场景树（新地点登记 + 位置追踪）
                if (this.config.config.sceneEnabled && extracted) {
                    try {
                        const scN = this.scene.apply(extracted.scenes, message.index || 0);
                        // [v3.195] 场景头只吃提取明确给出的日期 / 时段 / 天气。三者皆空 setHeader 自己拒绝。
                        //   不从正文推断，不回退到上一楼。story_date 是已有字段，不是新造的抽取口。
                        try {
                            const _hdr = {
                                date: extracted.story_date || extracted.scene_date || '',
                                period: extracted.period || extracted.time_of_day || '',
                                weather: extracted.weather || ''
                            };
                            if (this.scene.setHeader) this.scene.setHeader(message.index || 0, _hdr);
                        } catch (e) { errLog(e, 'onMessageReceived.场景头'); }
                        if (extracted.location) {
                            const _moved = this.scene.setLocation(message.index || 0, extracted.location);
                            // [v3.181] SG：位置一变，把**本轮在场角色**写进在场索引（谁在何处）。
                            //   来源是同一轮提取的 characters（本轮实际登场者），不额外猜。
                            //   这是「地点侧第一次能回答空间共处的谁」——此前角色在哪只以
                            //   status_changes 的 field:'位置'（末级名）散落在状态表里。
                            if (_moved && Array.isArray(extracted.characters)) {
                                for (const _nm of extracted.characters) {
                                    if (_nm && typeof _nm === 'string') this.scene.setPresence(_nm, extracted.location, message.index || 0);
                                }
                            }
                        }
                        // [v2.8] RT-C: 物品台账应用（ops 真源记录，回滚可重放）
                        // [v3.8] 修复 v3.3「先清」自相矛盾：改为「同状态(fp)清、多变体保留」——
                        //   同一文本状态重复提取时清旧防堆积；不同 swipe 变体（不同 fp）保留，
                        //   切回旧变体时由 rebuildItems 的 fp 匹配自动复活（不再依赖重提取重建）
                        if (this.config.config.itemLedgerEnabled && Array.isArray(extracted.items) && extracted.items.length) {
                            const fpNow = msgFpOf(message);
                            const floorNow = message.index || 0;
                            if (fpNow) this.itemOps = (this.itemOps || []).filter(o => !(o && o.floor === floorNow && o.fp === fpNow));
                            // [v3.154] 写入侧校验（anima #30）：真源 itemOps 要落盘/进携带包/被导出，
                            //   旧写法把 LLM 原始对象直接 push 进真源，字段无长度、无枚举、无类型约束。
                            //   改为入账前逐项宽容校验（能修就修，修不了才丢，不因一项脏丢整批）。
                            const _lv = (this.config.config.ledgerWriteValidationEnabled === false)
                                ? { items: extracted.items.filter(it => it && it.name), violations: [] }
                                : validateLedgerItemOps(extracted.items, { fallbackFloor: floorNow });
                            for (const it of _lv.items) {
                                this.itemOps.push({ floor: floorNow, fp: fpNow, ...it });
                            }
                            if (_lv.violations.length) this._recordLedgerViolations(_lv.violations, 'extract', floorNow);
                            this.rebuildItems();
                            // [v3.54] op-log: 物品台账变更事件
                            if (this.itemOps?.length) this.opLog?.log('item', 'update', `${this.itemOps.length} items`, floorNow, '');
                            // [v3.180] 真源下沉：同一次提取命中的物品**同时**写成该楼自己的附注。
                            //   汇总口（itemOps → rebuildItems → 预算/注入/携带）一字不动，
                            //   新增的是**归属性**：这一格账属于哪一楼哪一页，由楼层自己证明。
                            //   与摘要落笔共用合并语义（同页二次落笔互不覆盖），故谁先谁后都对。
                            this._stampFloorLedger(message, { floor: floorNow, items: _lv.items });
                        }
                        if ((scN || extracted.location) && this.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 场景树: +${scN} 地点, 位置=${SceneBook.keyOf(extracted.location) || '未变'}`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 场景树处理失败:`, e); }
                }

                // [v2.0] P2: 角色状态 + 待办 + 楼层账本
                const floor = message.index || 0;
                const nodesBefore = this.graph.nodes.size;
                if (this.config.config.characterStateEnabled && extracted?.status_changes) {
                    try {
                        const n = this.status.applyChanges(extracted.status_changes, floor, false, this.clock?.date || this.getLatestStoryDate?.() || '');
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 状态更新 ${n} 项`);
                        // [v3.54] op-log: 状态变更事件
                        if (n) this.opLog?.log('status', 'update', `${n} changes`, floor, (extracted.status_changes || []).map(c => c?.character + '.' + c?.field).join(',').slice(0, 60));
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 状态写入失败:`, e); }
                }
                // [v3.78] A: 主角客观档案 + 生活小档案写入（修复 v3.45 有壳无水源——提取管线从不产出这两字段）
                if (this.config.config.protagonistTracking !== false && extracted) {
                    try {
                        if (extracted.protagonist && typeof extracted.protagonist === 'object') {
                            const keys = ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition'];
                            const hasAny = keys.some(k => extracted.protagonist[k] !== undefined && extracted.protagonist[k] !== null && String(extracted.protagonist[k]).trim() !== '') || (extracted.protagonist.conditionPatch != null);
                            if (hasAny) {
                                this.status.setProtagonist(extracted.protagonist, floor, this.clock?.date || this.getLatestStoryDate?.() || '');
                                this.opLog?.log('status', 'update', 'protagonist', floor, keys.filter(k => extracted.protagonist[k] !== undefined).join(','));
                            }
                        }
                        if (Array.isArray(extracted.life_details) && extracted.life_details.length) {
                            let ln = 0;
                            for (const ld of extracted.life_details.slice(0, 5)) {
                                if (ld && (typeof ld === 'string' || ld.text)) { if (this.status.addLifeDetail(ld, floor)) ln++; }
                            }
                            if (ln && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧬 生活小档案 + ${ln} 条`);
                            if (ln) this.opLog?.log('status', 'add', `${ln} life details`, floor, '');
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.主角档案'); }
                }
                if (this.config.config.todoTrackingEnabled && extracted?.todos) {
                    try {
                        this.status.addTodos(extracted.todos, floor);
                    } catch (e) { errLog(e, 'onMessageReceived.文本清洗'); }
                }
                if (this.config.config.todoTrackingEnabled) {
                    try {
                        const sd = this.getLatestStoryDate();
                        if (sd) this.status.pruneTodos(sd, this.config.config.todoExpiryMinutes || 60);
                    } catch (e) { errLog(e, 'onMessageReceived.状态应用'); }
                }
                // [v3.49] P5: 群像共同记忆（关系对归因式切片）
                if (this.config.config.pairMemoryEnabled !== false && Array.isArray(extracted?.relationships)) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.pairMem.addFromExtracted(extracted.relationships, extracted.characters, floor, sd);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 👥 群像记忆更新 ${n} 条`);
                        // [v3.58] P20: op-log 群像埋点
                        if (n) this.opLog?.log('pair', 'add', `${n} pairs`, floor, '');
                    } catch (e) { errLog(e, 'onMessageReceived.群像记忆'); }
                }
                // [v3.47] 钱财账本 + 剧情卡牌（hcdiary 吸收）
                if (this.config.config.moneyLedgerEnabled !== false && Array.isArray(extracted?.money_changes) && extracted.money_changes.length) {
                    try {
                        const sd = this.getLatestStoryDate();
                        for (const mc of extracted.money_changes) {
                            const nm = String(mc?.character || '').trim();
                            if (!nm) continue;
                            if (mc.value !== null && mc.value !== undefined && mc.value !== '') {
                                // [v3.128] anima zod 式台账校验：覆盖式改值幅度超上限则 clamp 到 旧值±上限（防 LLM 幻觉一键暴富/清零家产）
                                let next = Number(mc.value) || 0;
                                const maxDelta = numOr(this.config.config.maxMoneyDelta, 0);   // [v3.156] 0=关闭校验，语义等价，统一形态
                                if (maxDelta > 0) {
                                    const prev = Number(this.moneyLedger.getMoney(nm)?.amount) || 0;
                                    if (Math.abs(next - prev) > maxDelta) {
                                        next = prev + Math.sign(next - prev) * maxDelta;
                                        errLog(new Error(`钱财覆盖式改值幅度超限，已 clamp: ${nm} ${prev}→${next}（申报 ${mc.value}）`), 'ledger.clamp');
                                    }
                                }
                                this.moneyLedger.setMoney(nm, next, mc.reason || '', floor, sd);
                            } else if (mc.delta) {
                                this.moneyLedger.addDelta(nm, Number(mc.delta) || 0, mc.reason || '', floor, sd);
                            }
                        }
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 钱财账本更新 ${extracted.money_changes.length} 项`);
                        // [v3.58] P20: op-log 钱财埋点
                        if (extracted.money_changes.length) this.opLog?.log('money', 'update', `${extracted.money_changes.length} changes`, floor, extracted.money_changes.map(mc => mc?.character).join(',').slice(0, 50));
                    } catch (e) { errLog(e, 'onMessageReceived.钱财账本'); }
                }
                // [v3.47] 矛盾账本（memorybooks 吸收：真矛盾显式标注并存）
                if (this.config.config.conflictBookEnabled !== false && Array.isArray(extracted?.conflicts) && extracted.conflicts.length) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.conflicts.addFromExtracted(extracted.conflicts, floor, sd);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⚔️ 登记真矛盾 ${n} 条`);
                        // [v3.58] P20: op-log 矛盾埋点
                        if (n) this.opLog?.log('conflict', 'add', `${n} conflicts`, floor, '');
                    } catch (e) { errLog(e, 'onMessageReceived.矛盾账本'); }
                }
                // [v3.194] 时间与事实版本 / 事件完整性落笔（**独立于矛盾账**）。
                //   为什么必须独立：挂在矛盾账条件里会让「本楼的事实与事件段是否入账」取决于
                //   「本楼恰好提取出了矛盾」——没有矛盾的楼层全部不入账且零报错，查询
                //   「现在去哪里找她」只命中恰好有矛盾的那几楼（静默丢账，读数上也看不出来）。
                //   两面各自独立 try：一面坏不连坐另一面。
                try {
                    const sd = this.getLatestStoryDate();
                    try {
                        const _fvn = this._absorbFactVersions(extracted, floor, sd);
                        if (_fvn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 📌 事实版本 +${_fvn}`);
                    } catch (e) { errLog(e, 'extraction.v3194.factVersions'); }
                    try {
                        const _ecn = this._absorbEventSegments(extracted, floor, sd);
                        if (_ecn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧵 事件段 +${_ecn}`);
                    } catch (e) { errLog(e, 'extraction.v3194.eventThreads'); }
                } catch (e) { errLog(e, 'extraction.v3194'); }
                // [v3.94] CSE 级人物状态引擎（自研融合增强：分层+toward+visibility+证据链+置信度）
                if (this.config.config.cseEnabled !== false && Array.isArray(extracted?.cse_states) && extracted.cse_states.length) {
                    try {
                        const n = this.cse.addFromExtracted(extracted.cse_states, floor);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧠 CSE 登记人物状态 ${n} 条`);
                        if (n) this.opLog?.log('cse', 'set', `${n} states`, floor, (extracted.cse_states || []).map(s => s?.character + '.' + s?.field).join(',').slice(0, 60));
                        // [v3.167] 容量账目必须与写入量并列可见。修前这一段的记账口径是
                        //   「addFromExtracted 返回了几个非 null」，而 CSE 是全插件唯一会
                        //   **主动丢弃已写入数据**的子系统（MAX_STATES_PER_CHAR 淘汰）
                        //   且此前还会把有向状态**静默降级**为无向（toward 上限）。
                        //   两种处置都不进任何日志：丢了多少、拒了多少，用户侧零线索。
                        const _cr = this.cse.lastExtractReport;
                        if (_cr && (_cr.evicted || _cr.rejected)) {
                            this.opLog?.log('cse', 'cap', `evict ${_cr.evicted}/${_cr.attempted} reject ${_cr.rejected}`, floor,
                                `上限淘汰 ${_cr.evicted} 条 · 身份约束拒绝 ${_cr.rejected} 条${_cr.rejectedSamples?.length ? '（如 ' + _cr.rejectedSamples.join(' / ') + '）' : ''}`);
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🧠 CSE 容量：淘汰 ${_cr.evicted} / 拒绝 ${_cr.rejected}（共尝试 ${_cr.attempted}）`);
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.cse'); }
                }
                // [v3.95] 叙事心电图（完全原创：情感极性+张力节奏+角色弧光+自反性节奏建议，零额外 API）
                if (this.config.config.narrativePulseEnabled !== false) {
                    try {
                        const _suspCnt = (this.suspense?.openItems?.() || []).length;
                        const _beat = this.pulse.beat(floor, {
                            mesText: _rawForSynopsis || message.mes || '',
                            events: extracted?.events || [],
                            suspenseCount: _suspCnt,
                            characters: extracted?.characters || []
                        });
                        if (_beat && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 💓 叙事心电图 floor=${floor} 张力=${Math.round(_beat.tension*100)}% 极性=${_beat.polarity.toFixed(2)}`);
                    } catch (e) { errLog(e, 'onMessageReceived.叙事心电图'); }
                }
                if (this.config.config.cardCollectionEnabled !== false && Array.isArray(extracted?.events)) {
                    try {
                        const sd = this.getLatestStoryDate();
                        const n = this.cards.forgeFromEvents(extracted.events, floor, sd, 8);
                        if (n && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🃏 铸造剧情卡牌 ${n} 张`);
                        // [v3.58] P20: op-log 卡牌埋点
                        if (n) this.opLog?.log('card', 'forge', `${n} cards`, floor, '');
                    } catch (e) { errLog(e, 'onMessageReceived.剧情卡牌'); }
                }
                if (this.config.config.floorLedgerEnabled) {
                    try {
                        const allIds = Array.from(this.graph.nodes.keys());
                        this.ledger.record(floor, {
                            nodeIds: allIds.slice(nodesBefore),
                            povIds: this.pov.povs.filter(p => p.floor === floor).map(p => p.id),
                            timelineIds: this.timeline.entries.filter(t => t.floor === floor).map(t => t.id),
                            timeAnchor: extracted?.time_anchor || null
                        });
                    } catch (e) { errLog(e, 'onMessageReceived.楼层账本'); }
                }

                // [v3.201] D2: 摘要 storyTime 独立提取（与时间线条目同口径：正文标签 end 优先），
                //   不依赖 plotTimeline 开关——相对时间前缀是摘要注入的显示属性。
                //   ⚠️ 不得引用 3074 行的 `sd`：它在 if 块内声明、块已闭合，跳块引用会抛
                //   ReferenceError 被外层静默吞掉（与 v3.185 queryText 同类坑，本次修正前实测一次）。
                let _summaryStoryTime = '';
                try {
                    _summaryStoryTime = String(this.extractStoryDate(message.mes || '', extracted?.story_date) || '').trim();
                    const _dta2 = _newRelativeTimeHelper().extractDualTimeTags(_rawForSynopsis || message.mes || '');
                    if (_dta2?.hasDual && _dta2.end) {
                        const _endDate2 = String(_dta2.end).split(/\s+/)[0];
                        if (_endDate2 && /[\d年月/.]/.test(_endDate2)) _summaryStoryTime = _endDate2;
                    }
                } catch (e) { errLog(e, 'createSummary.storyTime'); }
                const summary = await this.summary.createSummary(message, extracted?.summary, { maxLen: this.config.config.maxSummaryLength, storyTime: _summaryStoryTime });
                // [v3.180] 第二次落笔：同一楼先落物品、后落摘要，**共用合并语义**（floor-ledger.stamp 读
                //   现有附注判定「是否仍属本页」，属于则继承字段）。顺序不可交换的意义在于：后到的那次
                //   读到的是「本页已有物品账」，于是补上 summary 字段而不是整格换新；两次落笔谁先谁后都对，
                //   但**同一次提取内先物品后摘要**是唯一能把两边都写全的顺序。
                //   fresh 模式：指纹必须与落笔当时的楼一致——提取排队期间被翻页/编辑时，这格账属于旧页，
                //   宁可让覆盖度把它报成缺口（逐楼可见、可重提取补齐），也不把账记到新页上。
                if (summary) {
                    try {
                        this._stampFloorLedger(message, {
                            floor: floor || 0,
                            summary: { floor: floor || 0, text: summary.text }
                        }, { fresh: true });
                    } catch (e) { errLog(e, 'onMessageReceived.楼层落笔.摘要'); }
                    // [v3.183] 分支守护（事前拦）：这轮的摘要该不该写到这一楼。
                    //   翻页 / 重生成之后，本轮提取算的是**另一个分支**的账，落上去就是
                    //   「摘要里躺着上一个分支的事实」——用户翻回去才发现内容对不上。
                    //   判定用**签名**（角色+页码+正文hash+代次+时间戳），不用楼层号：
                    //   楼层号在翻页时不变化，签名才有辨别力。
                    /* [v3.309.0 · M-O8 第四刀] 本处**不再重算** —— 判定已前移到世界推进块
                     *   之前（见上方「分支判定前移」）。理由逐字记在那里：两次判定各取一次
                     *   `getProcessedSignature`，中间若发生翻页会得出两个不同答案。
                     *   `_branchOk` 仍在同一作用域（由前移那段用 `let` 声明），下游
                     *   `if (_branchOk) try { ...摘要留证... }` 与签名记录处的行为逐字不变；
                     *   变量名与配对判据一个字未动（v3.183 的逐字契约仍在）。
                     *   台账语义不变：摘要面仍记 `apply-skip` 这一条（账本面另有 `wp-skip`）。 */
                    if (!_branchOk) {
                        this._branchGuardLast = {
                            floor: (this._branchVerdict && this._branchVerdict.floor) || Number(message && message.index) || 0,
                            reason: (this._branchVerdict && this._branchVerdict.reason) || 'unknown',
                            at: Date.now()
                        };
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⛔ 分支守护拦截第${this._branchGuardLast.floor}楼摘要落笔（${this._branchGuardLast.reason}）`);
                        try { this.opLog?.log?.('branch', 'apply-skip', String(this._branchGuardLast.reason), this._branchGuardLast.floor, ''); } catch (e) { errLog(e, 'onMessageReceived.分支守卫审计'); }
                    }
                    // [v3.183] 来源留证：把「这条摘要来自哪一页」写进摘要自己（summary.prov）。
                    //   与 floor-ledger 分工：ledger 记的是**楼上有过什么**，这里记的是
                    //   **这条摘要的来源还对不对得上**。楼删了、翻页了、摘要被就地改了，
                    //   三件事都能在验真时分开归因（source_missing / source_changed / text_drift）。
                    //   留证失败不影响摘要本身：capture 契约是「要么写全，要么什么都不改」。
                    if (_branchOk) try {
                        const PV = _summaryProvenanceLib();
                        if (PV && typeof PV.capture === 'function') {
                            const prov = PV.capture(summary, message);
                            this._summaryProvenanceStamp = prov
                                ? { status: 'ok', floor: floor || 0, at: Date.now() }
                                : { status: 'rejected', reason: 'not-captured', floor: floor || 0, at: Date.now() };
                        } else {
                            this._summaryProvenanceStamp = { status: 'module-unavailable', floor: floor || 0, at: Date.now() };
                        }
                    } catch (e) {
                        this._summaryProvenanceStamp = { status: 'thrown', floor: floor || 0, reason: String((e && e.message) || e), at: Date.now() };
                        errLog(e, 'onMessageReceived.摘要留证');
                    }
                    // [v3.183] 落笔成功后记下**这一代的签名**——下次同楼再提取时才有比对基准，
                    //   否则守卫每次都判不了（no-signature），保护形同虚设。
                    //   记在留证成功之后：没留证的摘要本来就不受溯源保护。
                    if (_branchOk && this._summaryProvenanceStamp && this._summaryProvenanceStamp.status === 'ok') {
                        try {
                            const BG = _branchGuardLib();
                            if (BG && this._branchGuard && typeof BG.signatureOf === 'function') {
                                this._branchGuard.setProcessedSignature(
                                    Number(message && message.index),
                                    BG.signatureOf(message),
                                    this.getCurrentChatId ? this.getCurrentChatId() : ''
                                );
                            }
                        } catch (e) { errLog(e, 'onMessageReceived.分支签名记录'); }
                    }
                }
                        this.opLog?.log('summary', 'add', `sum_${message?.index || 0}`, message?.index || 0, (extracted?.summary || '').slice(0, 40));  // [v3.54] op-log
                
                // [v3.183] 条目关联（Crosslink）：给刚落的摘要扫一遍已有关联词表，记下它和哪些
                //   既有条目共享关键词。**只报告、不写图**——写图是提取管线的职责，这里给的是弱关系候选。
                //   为什么要这一步：召回纯按查询相关性取条目，A 条目正文提到 B 条目的人/地/事时系统完全不知道，
                //   同一概念散在不同楼的记忆永远连不起来（nocturne 的 Glossary 解决的正是这个）。
                try {
                    const XL = _crosslinkLib();
                    if (XL && typeof XL.createIndex === 'function') {
                        // 停用词配置是逗号分隔字符串（设置面板给的是 textarea），必须先 split 再传数组：
                        // crosslink 内部按 Array.from 取项，直接喂字符串会被拆成一个个**字符**，
                        // 于是「主角」这类词永远进不了停用表（静默失效，不报错）。
                        const _stopRaw = this.config.config.crosslinkStopwords;
                        const _stop = Array.isArray(_stopRaw)
                            ? _stopRaw
                            : String(_stopRaw || '').split(/[,，\n]/).map(s => s.trim()).filter(Boolean);
                        if (!this._crosslinkIndex) this._crosslinkIndex = XL.createIndex({ stopwords: _stop });
                        const idx = this._crosslinkIndex;
                        this._xrefIdx = idx;      // [v3.185] 供「条目复用」诊断行区分「模块缺席 / 尚未建索引 / 正常」
                        // [v3.185] 摘要键 → 它提到过的词（幂等登记用）。必须在此初始化：
                        //   若漏了它，下面「摘要入表」段每轮都会在 `.get` 上抛进 catch——
                        //   功能看着接上了、读数却恒空，正是本仓最忌的那种「坏了没人知道」。
                        if (!this._crosslinkXrefs) this._crosslinkXrefs = new Map();
                        // 词表来源：图谱节点名（人物/地点/事件）。节点是「可被指称的东西」，
                        // 摘要正文里提到的正是它们。
                        if (this._crosslinkLoadedFloor !== true) {
                            try {
                                const nodes = Array.from(this.graph?.nodes?.values?.() || []);
                                idx.loadFromNodes(nodes, (n) => n.id || n.name);
                                this._crosslinkLoadedFloor = true;
                            } catch (e) { errLog(e, 'onMessageReceived.crosslink载入'); }
                        }
                        if (summary && summary.text) {
                            const res = idx.scan(summary.text);
                            const selfRef = 'sum_' + (floor || 0);
                            const linked = [];
                            for (const h of res.hits) {
                                for (const ref of h.refs) {
                                    if (ref === selfRef) continue;
                                    if (!linked.some(l => l.ref === ref)) linked.push({ ref, keyword: h.keyword });
                                }
                            }
                            this._crosslinkLast = { floor: floor || 0, total: res.total, truncated: res.truncated, linked: linked.slice(0, 20) };
                            if (linked.length && this.config.config.debugMode) {
                                console.log(`[${PLUGIN_NAME}] 🔗 关联候选 ${linked.length} 条（第${floor}楼摘要）`);
                            }
                            // [v3.185] 摘要入表：给每条活跃摘要算出「它提到了哪些已知名」，并把这些名
                            //   以「摘要图键（sum_<floor>）」为引用登记进词表 —— 这样 recallMemory 按 query.text
                            //   扫同一份词表时，命中的 ref 就是**可回指到具体摘要**的键，才有了真正可消费的产出。
                            //   为什么直接扫摘要正文而不是走 loadFromNodes：图的 refOf 回落取的是
                            //   `node.id || node.name`，而这些名字登记进去的 ref 是**节点 id**，
                            //   落到 merged 条目上根本对不上（条目带的键是 sum_<floor>），
                            //   于是「命中算得出、却匹配不到任何条目」——看着接上了，实际仍然零影响。
                            try {
                                const _sums = (this.summary && typeof this.summary.getActiveSummaries === 'function')
                                    ? this.summary.getActiveSummaries() : [];
                                let _regN = 0;
                                for (const _s of _sums) {
                                    if (!_s) continue;
                                    const _sk = _s.key || _s.id || ('sum_' + (_s.floor == null ? '' : _s.floor));
                                    const _tx = String(_s.text || '');
                                    if (!_sk || !_tx) continue;
                                    const _hit = idx.scan(_tx);
                                    if (!_hit.hits.length) continue;
                                    const _set = new Set();
                                    for (const _h of _hit.hits) { const _w = String(_h.keyword || '').trim(); if (_w) _set.add(_w); }
                                    if (!_set.size) continue;
                                    const _prev = this._crosslinkXrefs.get(_sk);
                                    const _changed = !_prev || _prev.size !== _set.size;
                                    this._crosslinkXrefs.set(_sk, _set);
                                    if (_changed) { for (const _w of _set) idx.add(_w, _sk); }   // add 幂等：重复登记不改指纹
                                    _regN++;
                                }
                                this._crosslinkXrefN = _regN;      // 诊断行读：「摘要入表几条」（0 而摘要存在 ⇒ 对召回侧等于没接）
                            } catch (e) { errLog(e, 'onMessageReceived.crosslink摘要入表'); }
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.crosslink'); }
                // [v3.185] 条目关联的**消费点**：v3.184 之前这里只有生产、没有消费（产出进字段即终止）。
                //   本处按「本楼正文同时出现了某条已确认关系的两端名」收口出一条可提项，交给注入侧消费
                //   （见 buildInjection 的〔本轮可提关联…〕行）。不做自动写边：自动写边会在长线里累积幻觉边
                //   且不可逆（与 v3.183 的立论一致）；这里只**提条**，由图谱语义与模型自己决定是否据实落边。
                //   命中即交棒；未命中则让上一条提项退场（边已被回滚/失效时立刻退，防每轮带过期关系进注入）。
                try {
                    const _pair = (typeof this._crosslinkConsumePair === 'function')
                        ? this._crosslinkConsumePair(summary && summary.text) : null;
                    if (_pair) {
                        this._crosslinkConsume = _pair;
                        this._crosslinkConsumed = Number(this._crosslinkConsumed || 0) + 1;
                    } else {
                        const _held = this._crosslinkConsume;
                        if (_held && typeof this._crosslinkConsumeAlive === 'function'
                            && !this._crosslinkConsumeAlive(_held)) this._crosslinkConsume = null;
                        this._crosslinkConsumeMissN = Number(this._crosslinkConsumeMissN || 0) + 1;
                    }
                } catch (e) { errLog(e, 'onMessageReceived.crosslink消费'); }
                
                // [v3.30] PV: 记忆矛盾换代 —— 新摘要与既有活跃摘要做高置信冲突检测, 旧条 superseded 退出召回
                if (window.LonShaSupersede && this.config.config.supersedeEnabled) {
                    try {
                        const newKey = 'sum_' + (message.index || 0);
                        const activeSumsLc = this.summary.getActiveSummaries()
                            .map(s => ({ key: 'sum_' + s.floor, text: s.text, importance: s.importance || extracted?.importance || 5 }));
                        const newSumsLc = activeSumsLc.filter(s => s.key === newKey);
                        const oldSumsLc = activeSumsLc.filter(s => s.key !== newKey)
                            .slice(-(this.config.config.supersedeScanPool || 30));
                        const supersededLc = newSumsLc.length
                            ? this.supersede.scan(newSumsLc, oldSumsLc)
                            : [];
                        if (supersededLc.length) {
                            this.statsSuperseded = (this.statsSuperseded || 0) + supersededLc.length;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 🕊 矛盾换代: ${supersededLc.length} 条旧记忆被新事实压制`);
                        }
                        this.supersede.revive(activeSumsLc.map(s => s.key));
                    } catch (e) { errLog(e, 'onMessageReceived.supersede'); }
                }
                
                // [v2.5] RF: 活人感日记——每N楼一次批量生成登场角色第一人称日记
                if (this.config.config.livingDiary) {
                    try {
                        const dn = await this.diary.generateLiving(this.config.config, this.llm, extracted?.characters ? this.getKnownCharacters() : [], message.index || 0);
                        if (dn && this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 活人感日记 +${dn} 条`);
                        // [v3.58] P20: op-log 日记埋点
                        if (dn) this.opLog?.log('diary', 'add', `${dn} entries`, message.index || 0, '');
                    } catch (e) { errLog(e, 'onMessageReceived.POV状态回收'); }
                }

                // [v3.37] 叙事惊奇度/熵累加器（MemGPT 动态反思理念）
                let deltaEntropy = 0;
                let hasTurnaround = false;
                if (Array.isArray(extracted?.events)) {
                    for (const ev of extracted.events) {
                        const imp = Number(ev.importance) || 5;
                        if (imp >= 9) { deltaEntropy += 6; hasTurnaround = true; }
                        else if (imp >= 7) { deltaEntropy += 3; }
                        else if (imp >= 5) { deltaEntropy += 1; }
                    }
                }
                if (Array.isArray(extracted?.status_changes) && extracted.status_changes.length) {
                    deltaEntropy += Math.min(5, extracted.status_changes.length);
                }
                if (Array.isArray(extracted?.plans_resolve) && extracted.plans_resolve.length) {
                    deltaEntropy += extracted.plans_resolve.length * 4;
                }
                this._narrativeEntropy = (this._narrativeEntropy || 0) + deltaEntropy;
                const entropyThresh = Number(this.config.config.entropyThreshold || 15);
                const isEntropyTriggered = this.config.config.entropyReflectionEnabled !== false && (this._narrativeEntropy >= entropyThresh || hasTurnaround);

                // [v2.8] RT-B + [v3.37]: 反思生成（周期节流 OR 惊奇度冲顶自适应触发，与日记独立）
                try {
                    if (this.config.config.reflectionEnabled) {
                        const didReflect = await this.reflection.generate(this.config.config, this.llm, this, message.index || 0, isEntropyTriggered);
                        if (didReflect) {
                            this._narrativeEntropy = 0;
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 💡 触发反思提炼（${isEntropyTriggered ? '惊奇度自适应' : '周期节流'}）`);
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.反思生成'); }

                // [v2.9] RU-B: 定期记忆优化（每N楼防膨胀）
                try {
                    const oEvery = this.config.config.optimizeEveryFloors || 50;
                    if (!this._lastOptimizeFloor || (message.index || 0) - this._lastOptimizeFloor >= oEvery) {
                        this._lastOptimizeFloor = message.index || 0;
                        if (this.config.config.maintenancePipelineEnabled === true) {
                            // [v3.106] 维护流水线模式（engram 缝合）：归档+优化+分诊编排为单次可诊断流水线
                            this._lastOptimizeAt = Date.now();
                            try {
                                const led = await this._maintenancePipeline();
                                if (led && !led.ok && this.config.config.debugMode) {
                                    console.warn(`[${PLUGIN_NAME}] ⚠️ 维护流水线未完成:`, led.error?.message || '(未知)');
                                }
                            } catch (e) { errLog(e, 'onMessageReceived.维护流水线'); }
                        } else {
                            // 既有逐条维护路径（默认）——行为与 v3.106 之前完全一致
                            this.optimizeMemory();
                            this._lastOptimizeAt = Date.now();
                            // [v3.47] 睡眠周期：每 sleepEveryN 次提取触发一次归档遗忘
                            try {
                                this._sleepCount = (this._sleepCount || 0) + 1;
                                const sleepN = Number(this.config.config.sleepEveryN) || 10;
                                if (this._sleepCount % sleepN === 0) this.sleepCycle();
                            } catch (e) { errLog(e, 'sleepCycle.触发'); }
                        }
                    }
                } catch (e) { errLog(e, 'onMessageReceived.优化器'); }
                
                if (this.config.config.vectorEnabled) {
                    // [v3.13] 场外信号拼入向量素材（只影响检索，不进注入文本）
                const _sig = (this._thinkingSignals || []).filter(s => s.floor === message.index).map(s => (s.text.split('\n')[1] || '').slice(0, 120));
                const vectorText = `${extracted?.summary || this.summary.compressSummary(messageText, 160)}\n角色:${extracted?.characters?.join(',') || ''}${_sig.length ? '\n场外:' + _sig.join(' ') : ''}`;
                    await this.vector.addVectorAuto(vectorText, {
                        floor: message.index || 0,
                        characters: extracted?.characters || [],
                        events: extracted?.events || [],
                        summary: extracted?.summary || '',
timeAnchor: extracted?.time_anchor || null,
                        /* [v3.329.0 · M4-O1] 会话范围戳:回收面据此判「这一条属于哪个宇宙」。 */
                        scope: this._currentScopeStamp(message),
                    }, this.config.config);
                }
                
                // [v1.9] P1: BM25 索引重建 + 层级摘要折叠
                // [v3.148] 语料缓存（shujuku BM25-corpus-cache）：素材指纹一致时跳过重建（断崖截断/折叠后的高频重建全免）
                if (this.config.config.bm25Enabled) {
                    try {
                        const _docs = this.summary.getActiveSummaries().map(s => ({id: 'sum_' + s.floor, text: s.text, floor: s.floor, source: 'bm25'}));
                        const _fp = _docs.map(d => d.id + ':' + hash32(d.text)).join('|');
                        if (_fp !== this.bm25._corpusFp) {
                            this.bm25.rebuild(_docs);
                            this.bm25._corpusFp = _fp;
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25重建失败:`, e); }
                }
                if (this.config.config.summaryFoldEnabled) {
                    try { await this.summary.maybeFold(this.config.config, this.llm);
                            try { await this.summary.processRetryQueue?.(this.config.config, this.llm); } catch (e) { errLog(e, 'nonfatal') } } catch (e) { errLog(e, 'onMessageReceived.摘要折叠'); }
                }
                // [v3.38] 语义级休眠检测（TriviumDB 理念，防长篇跑团上下文与内存膨胀）
                try { if (this.summary?.markDormant) this.summary.markDormant(message.index || 0, 30); } catch (e) { errLog(e, 'nonfatal') }
                // [v3.25] 归档隐藏已覆盖楼层（Bakemono 共识，默认关）: 折叠成功后把 folded 旧楼设 is_hidden
                if (this.config.config.autoArchiveCovered) {
                    try { this.archiveCoveredFloors(); } catch (e) { errLog(e, 'onMessageReceived.归档隐藏'); }
                }
                // [v3.16] 世界推进触发: 每 EVERY_FLOORS 楼标记 pending，等下次生成前推演（独立于摘要折叠开关）
                try {
                    const wpEvery = Number(this.config.config.worldProgressEveryFloors || (this.worldProg?.EVERY_FLOORS || 2));
                    // [v3.19] 周期纯函数（ruby）: 位置取模替代固定锚点
                    if (this.config.config.worldProgressEnabled && wpEvery > 0 && cyclePositionFor(message.index || 0, wpEvery) === wpEvery) {
                        this.worldProg.markPending();
                    }
                } catch (e) { errLog(e, 'onMessageReceived.世界推进标记'); }

                // [v3.1] SF2: 更新聊天长度基线（供删除事件对比，防渲染切片误判）
                try { this._lastKnownChatLen = (window.SillyTavern?.getContext?.()?.chat?.length) || this._lastKnownChatLen; } catch (e) { errLog(e, 'SF2.基线更新'); }
                // [v2.2] RB: 楼层提交盖章 → 桥同步手机侧楼层状态 (幂等)
                try {
                    const rb = window.VirtualPhone?.lonshaBridge;
                    if (rb?.onFloorCommitted) rb.onFloorCommitted(message.index || 0);
                } catch (e) { errLog(e, 'onMessageReceived.RubyPhone桥'); }
                // [L10-X3 & L10-O1 & L10-O6 & L10-X5 & L10-X6 & L10-O9] 第十期执行后动态认知闭环
                try {
                    const curFloor = message.index || 0;
                    const text = message.mes || message.text || '';
                    
                    // 1. X3 反讽免疫检测
                    const Irony = _ironyFilterLib();
                    let ironyAssessment = null;
                    if (Irony && typeof Irony.evaluateFactCredibility === 'function') {
                        ironyAssessment = Irony.evaluateFactCredibility({ content: text, contextTone: 'casual', isDirectAction: false });
                    }

                    // 2. O1 事实流转接入 (若非纯反讽调侃)
                    const FactMat = _factLifecycleLib();
                    if (FactMat && typeof FactMat.admitNewFact === 'function' && (!ironyAssessment || ironyAssessment.credibility !== 'quarantined')) {
                        if (this._lastExtractedFacts && Array.isArray(this._lastExtractedFacts)) {
                            this._lastExtractedFacts.forEach(fact => {
                                FactMat.admitNewFact(fact, curFloor);
                            });
                        }
                    }

                    // 3. O6 意图代价追踪
                    const CostTracker = _intentCostLib();
                    if (CostTracker && typeof CostTracker.extractIntentProposals === 'function') {
                        const proposals = CostTracker.extractIntentProposals(text, { speaker: message.name, floor: curFloor });
                        this._lastIntentRoiReport = CostTracker.trackExtractionCost({
                            elapsedMs: 10,
                            tokensProcessed: 150,
                            proposalsCount: proposals.length
                        }, proposals);
                    }

                    // 4. X5 缺席期待追踪
                    const ExpTracker = _expectationAbsenceLib();
                    if (ExpTracker && typeof ExpTracker.createExpectation === 'function') {
                        if (this._newCommitments && Array.isArray(this._newCommitments)) {
                            this._activeExpectations = this._activeExpectations || [];
                            this._newCommitments.forEach(c => {
                                this._activeExpectations.push(ExpTracker.createExpectation(Object.assign({ registeredFloor: curFloor }, c)));
                            });
                        }
                        if (this._activeExpectations && typeof ExpTracker.evaluateExpectations === 'function') {
                            this._absenceReport = ExpTracker.evaluateExpectations(this._activeExpectations, curFloor, [
                                { actor: message.name, description: text }
                            ]);
                        }
                    }

                    // 5. X6 心理边界转移
                    const Boundary = _psychologicalBoundaryLib();
                    if (Boundary && typeof Boundary.evaluateInteractionImpact === 'function') {
                        const speaker = message.name || '对方';
                        this._currentBoundaryState = Boundary.evaluateInteractionImpact(this._currentBoundaryState || {}, {
                            speaker,
                            text,
                            intimacyDelta: 1
                        });
                    }


                    // [L11-O3] 因果熔断校验
                    const Causal = _causalCircuitLib();
                    if (Causal && typeof Causal.runCircuitBreakerPipeline === 'function') {
                        const verifiedFacts = Causal.runCircuitBreakerPipeline(this._pendingCausalFacts || [], []);
                        if (verifiedFacts && verifiedFacts.admittedFacts) {
                            this._lastVerifiedCausalFacts = verifiedFacts.admittedFacts;
                        }
                    }
                    // [L11-O6] 多通道具身生活渗透
                    const Osmosis = _channelOsmosisLib();
                    if (Osmosis && typeof Osmosis.synthesizeDigitalToRealityGuidance === 'function') {
                        const guidance = Osmosis.synthesizeDigitalToRealityGuidance([{ body: '未发出的心事：其实我一直很在乎' }], message.name || '');
                        if (guidance) this._lastSensoryOsmosis = guidance;
                    }
                    // [L11-O9] 动态人设结晶
                    const PersonaSub = _personaSynthesizerLib();
                    if (PersonaSub && typeof PersonaSub.crystallizePersonaDelta === 'function') {
                        this._crystallizedPersona = PersonaSub.crystallizePersonaDelta(
                            this._crystallizedPersona || {},
                            [{ speaker: message.name, text }]
                        );
                    }
                    // [L11-X2] 流言漂移网络
                    const RumorNet = _rumorNetworkLib();
                    if (RumorNet && typeof RumorNet.propagateRumorHop === 'function' && this._activeRumor) {
                        this._activeRumor = RumorNet.propagateRumorHop(this._activeRumor.id || 'rumor_1', this._activeRumor, 'whisper', 'hostile');
                    }
                    // [L11-X3] 实体信物追踪
                    const TokenTrack = _tokenTrackerLib();
                    if (TokenTrack && typeof TokenTrack.interactWithToken === 'function' && this._trackedToken) {
                        const tokenRes = TokenTrack.interactWithToken(this._trackedToken, 'touch');
                        if (tokenRes && tokenRes.promptDirective) this._lastTokenInteraction = tokenRes;
                    }
                    // [L11-X4] 创伤解离与认知失调
                    const Dissociation = _dissociationSandboxLib();
                    if (Dissociation && typeof Dissociation.triggerDissociationSandbox === 'function') {
                        this._dissociationState = Dissociation.triggerDissociationSandbox(
                            message.name || 'char',
                            'betrayal',
                            { text }
                        );
                    }
                    // 6. O9 虚拟手机双向真桥同步
                    const Bridge = _rubyPhoneBridgeLib();
                    if (Bridge && typeof Bridge.syncMemoryToPhone === 'function') {
                        const syncPayload = {
                            floor: curFloor,
                            speaker: message.name,
                            contactNote: this._lastContactUpdate,
                            todoItem: this._lastTodoItem
                        };
                        this._lastPhoneBridgeSync = Bridge.syncMemoryToPhone(syncPayload, window.VirtualPhone?.runtimeState);
                    }
                } catch (e) { errLog(e, 'onMessageReceived.L10CognitiveLoop'); }
                if (this.config.config.autoSave) {
                    // [v2.9] RU-C: 定期快照（每 snapshotEveryFloors 楼一份，IndexedDB 独立于 chatMetadata）
                    try {
                        const snapEvery = this.config.config.snapshotEveryFloors || 50;
                        const curFloor = message.index || 0;
                        // [v3.236.0] R4-B：闸门从「裸楼层数」改成「**按会话身份的锚点**」（缺口 2）。
                        //   修前在 B 会话里 curFloor(0) - A的锚点(400) = -400，判据不触发 ⇒
                        //   B 的快照一份都不落盘，且不报错（本仓最忌讳的静默降级形态）。
                        //   ★ 这里 **不再调 getCurrentChatId()**：外层 `const chatId = this.getCurrentChatId()`
                        //   的推导结果与它逐字相同，再取一次只会多出一个与 chatId 可能不一致的第二真源
                        //   （本仓的「同名不同源」正是要靠单一读数来避免的）。
                        const anchor = this._snapshotAnchorOf(chatId);
                        if (anchor.fresh || curFloor - anchor.floor >= snapEvery) {
                            const snapData = await this.collectExport();
                            const kept = await this.snapshots.save(chatId, curFloor, snapData);
                            if (kept) {
                                this._snapshotAnchorFloor = curFloor;
                                this._snapshotByChat.push({ at: Date.now(), chatId: chatId, floor: curFloor });
                                if (this._snapshotByChat.length > 20) this._snapshotByChat.shift();
                            }
                            if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 快照已保存 (floor ${curFloor})`);
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 快照失败:`, e); }
                    // [v3.23] 定期把记忆快照嵌入 chatMetadata 供跨设备迁移（NE auto-restore）——每 20 楼一次，避免频繁写大头元数据
                    try {
                        if (!this._embedCount) this._embedCount = 0;
                        this._embedCount++;
                        if (this._embedCount >= 20) {
                            this._embedCount = 0;
                            this.embedVaultToChatMeta?.();
                        }
                    } catch (e) { if (this.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] 嵌入元数据失败:`, e); }
                    // [v3.130] CP: 主保存路径统一走 collectExport() 单真源（stbme 控制平面分离第一层）。
                    // 此前此处是手写键清单，已与 collectExport 漂移：缺 clock（时钟每楼不落盘）、缺游标/STM/prequel/锁定事实；
                    // 且 load 又不恢复其中若干键。此后新键只在 collectExport 登记一处，全链路自动生效。
                    // 保存地面真源：最近一次保存的时间/楼层/来源计数（诊断面板展示，随存档持久化）。
                    // [v3.138] CP-L2 持久化确认状态机：本地内存状态有已确认存档（同一 chatId 的 _confirmed 存在
                    // 且 revision 未落后）才允许覆写。恢复管线正在半途导入时、或确认状态被并发破坏时拒绝覆盖，
                    // 防止半初始化的内存态把已落地的完整记忆洗掉（stbme: 让"pending 卡住写入"结构上不可能）。
                    const _omrPayload = await this.collectExport();
                    // [v3.140] CP 确认状态机（重写 v3.138 版）：v3.138 判据方向是错的——_confirmed 为 null
                    // （恰恰是最危险的未装载态）时反而放行，且 _revision 比较在写入合流下恒真会误拒正常保存。
                    // 新判据用可观测身份：磁盘存档属于当前聊天且内存确实装载过它才允许覆写；
                    // 连续拒绝超阈则降级放行（stbme：陈旧挂起必须自动解除，不许永久卡死写入）。
                    let _savePersisted = false;   // [v3.165] 成功声称的事实来源（见下方 if/else 之后）
                    const _disk = window.SillyTavern?.getContext?.()?.chatMetadata?.extensions?.[this.storage.STORAGE_KEY];
                    const _diskOk = !_disk?.data || _disk.chatId == null || String(_disk.chatId) === String(chatId);
                    const _loadedOk = this._loadedChatId === chatId || !_disk?.data;
                    if ((!_diskOk || !_loadedOk) && this._saveDeniedCount < 5) {
                        this._saveDeniedCount++;
                        console.warn(`[${PLUGIN_NAME}] OMR 保存被确认状态机拒绝（第${this._saveDeniedCount}次）：磁盘存档=${_disk?.chatId ?? '无'} / 内存装载=${this._loadedChatId ?? '未装载'}，身份不一致不得覆写`);
                    } else {
                        if (this._saveDeniedCount >= 5) console.warn(`[${PLUGIN_NAME}] 确认状态机降级放行（已连续拒绝 ${this._saveDeniedCount} 次，允许落盘避免记忆完全不保存）`);
                        this._saveDeniedCount = 0;
                        this.recordSaveSource('realtime', message.index || 0);
                        const _rtOk = await this.storage.save(chatId, _omrPayload);
                        // [v3.166] 按结果记账：这条路径原先登记与 save 相邻但返回值被忽略，
                        //   结果上仍是「意图」而非「事实」。
                        this.recordSaveFailed('realtime', _rtOk === true, this.storage?._lastWrite?.error || '未落盘');
                        // [v3.165] 保存是否真落地：下面的成功声明必须由这个事实驱动。
                        //   此前它落在 if/else 之外，连「被确认状态机拒绝、根本没写盘」也照样报「✓ 完成」。
                        _savePersisted = true;
                    }
                }
                
            return {
                saved: _savePersisted,
                characters: extracted?.characters?.length || 0,
                events: extracted?.events?.length || 0
            };
        }).call(engine);
    }

    return {
        bindDeps: bindDeps,
        applyExtractedPayload: applyExtractedPayload
    };
}));
