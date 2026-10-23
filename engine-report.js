// [v3.362.0] engine-report.js: 从 index.js 剥离的记忆全景报告生成模块
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineReport = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let _errLog = (e, ctx) => { try { console.error('[LonShaReport]', ctx, e); } catch (_) {} };

    function errLog(e, ctx) {
        if (typeof _errLog === 'function') _errLog(e, ctx);
    }

    function bindDeps(deps) {
        if (deps && typeof deps.errLog === 'function') _errLog = deps.errLog;
    }

    function opLogStatsCompat(engine) {
        const readable = !!engine?.opLog && typeof engine.opLog.stats === 'function';
        if (!readable) return { total: 0, byType: {}, absent: true };
        try {
            const st = engine.opLog.stats();
            if (!st || typeof st !== 'object') return { total: 0, byType: {}, absent: true };
            return st;
        } catch (e) { return { total: 0, byType: {}, error: String(e?.message || e) }; }
    }

    function exportMemoryReport(engine) {
            const L = [];
            const push = (s) => L.push(s);
            push('# LonSha 记忆库全景报告');
            push('');
            push('> 导出时间：' + new Date().toLocaleString('zh-CN'));
            push('');
            // 概览
            const opStats = engine.opLog?.stats?.() || { total: 0, byType: {} };
            push('## 📊 概览');
            push('');
            push(`-  剧情时钟：${engine.clock?.date || '未设定'}${engine.clock?.label ? ' · ' + engine.clock.label : ''}`);
            push(`- 活跃摘要：${(engine.summary?.getActiveSummaries?.() || []).length} 条`);
            push(`- 卷/史记：${(engine.summary?.volumes || []).length} / ${(engine.summary?.historical || []).length}`);
            push(`- 图谱：${engine.graph?.nodes?.size || 0} 节点 · ${engine.graph?.edges?.size || 0} 边`);
            push(`- 物品台账：${(engine.itemOps || []).length}`);
            push(`- 悬念簿：${(engine.suspense?.openItems?.() || []).length} 未结`);
            // [v3.169] 账本自述面：此处原为 `${opLogStatsCompat(this)} 条`，而该 helper 返回的
            //   是对象——概览行从 v3.61 起一直输出「[object Object] 条」，用户拿不到审计事件数。
            //   同文件的「审计统计」板块却正确解构了 byType，说明这纯粹是一处没人看过的显示路径。
            push(`- 审计事件：${opLogStatsCompat(this).total} 条（${engine.opLog?.auditSummary?.() || '无账本'}）`);
            push(`- 锁定事实：${(engine.summary?.getLockedFacts?.() || []).length} 条`);
            push('');
            /* [v3.248.0 计划 #21] 台账写入违规**结构化出口**的真实读侧。
             *   【为什么放在这里】`_ledgerViolationReport/Markdown` 上线时是**零引用**方法
             *   （被 scan_wiring 的 A7.1 当场抓到：方法 454 / 零引用 1）—— 本仓纪律：
             *   写完没人调 = 等于没写。故本版同时把它接进「记忆全景报告」这个真实读侧，
             *   而不是只留一个 API 等人来用。
             *   【为什么只在有内容时输出】违规段对绝大多数用户永远是空 —— 无条件输出一个
             *   空板块会让报告变长且把「没有违规」和「违规没被记录」混成同形（都是空白）。
             *   故空账**整段不出现**，由诊断面板那一行的 `0` 承担「明确没有」的表述。 */
            try {
                const _lvArr = Array.isArray(engine._ledgerViolations) ? engine._ledgerViolations : [];
                if (_lvArr.length) {
                    push('## ⚠️ 台账写入违规');
                    push('');
                    push(engine._ledgerViolationMarkdown({ top: 5 }));
                    push('');
                }
            } catch (e) { errLog(e, 'exportMemoryReport.ledgerViolation'); }
            // [v3.64] 锁定事实板块（用户主权的铁律档案）
            const lfList = engine.summary?.getLockedFacts?.() || [];
            if (lfList.length) {
                push('## 🔒 用户锁定事实');
                push('');
                push('> 以下事实由用户显式锁定，逐字进入每轮摘要与注入流，永不因压缩丢失。');
                push('');
                for (const f of lfList) push(`- ${f.text}（第${f.floor}楼锁定）`);
                push('');
            }
            // [v3.69] A1: 正史增量板块（established/uncertain 分状态）
            const dbList = engine.deltaBook?.deltas || [];
            if (dbList.length) {
                push('## 📒 正史增量');
                push('');
                const est = dbList.filter(d => d.status === 'established');
                const unc = dbList.filter(d => d.status === 'uncertain');
                if (est.length) {
                    push('**已确证：**');
                    push('');
                    for (const d of est.slice(-8)) push(`- ${d.summary}（第${d.evidenceFloor}楼佐证）`);
                    push('');
                }
                if (unc.length) {
                    push('**待定：**');
                    push('');
                    for (const d of unc.slice(-8)) push(`- ${d.summary}（第${d.evidenceFloor}楼，待佐证）`);
                    push('');
                }
            }
            // 主角
            const prot = engine.status?.protagonist;
            if (prot) {
                push('## 🧍 主角档案');
                push('');
                for (const k of ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition']) {
                    if (prot[k]) push(`- **${k}**：${prot[k]}`);
                }
                push('');
            }
            // [v3.83] C: 生活小档案板块（三投放层：置顶/常规/沉降）
            const ldList = engine.status?.lifeDetails || [];
            if (ldList.length) {
                push('## 🧬 生活小档案');
                push('');
                for (const d of ldList) {
                    const tag = d.tier === 'pinned' ? '📌 ' : d.tier === 'archive' ? '📦 ' : '';
                    push(`- ${tag}${d.text}${d.floor ? `（第${d.floor}楼）` : ''}`);
                }
                push('');
            }
            // NPC 羁绊
            const ties = engine.status?.getNpcTiesRecords?.() || [];
            if (ties.length) {
                push('## 🕸️ 角色羁绊网');
                push('');
                for (const t of ties) push(`- **${t.name}**：${(t.ties || []).join('；')}`);
                push('');
            }
            // 卷摘要 + 史记
            const vols = engine.summary?.volumes || [];
            if (vols.length) {
                push('## 📚 章节卷摘要');
                push('');
                for (const v of vols.slice(-5)) push(`- 【卷${v.floorStart}-${v.floorEnd}】${v.text}`);
                push('');
            }
            const hist = engine.summary?.historical || [];
            if (hist.length) {
                push('## 🏛️ 纪元史记');
                push('');
                for (const h of hist) push(`- ${h.text || h}`);
                push('');
            }
            // 群像
            const pairs = engine.pairMem?.pairs || [];
            if (pairs.length) {
                push('## 👥 群像共同记忆');
                push('');
                for (const p of pairs.slice(-8)) {
                    for (const e of (p.entries || []).slice(-2)) {
                        push(`- **${p.a} × ${p.b}**：${e.event}${e.actorDo ? `（${e.actorDo}）` : ''}${e.knownBy === 'one' ? ' ⚠️仅单方知晓' : ''}`);
                    }
                }
                push('');
            }
            // 悬念簿
            const open = engine.suspense?.openItems?.() || [];
            if (open.length) {
                push('## 🧩 未结悬念');
                push('');
                for (const x of open) push(`- [${x.kind || 'plan'}] ${x.content}`);
                push('');
            }
            // 群像日记
            const diaries = engine.diary?.diaries || {};
            if (Object.keys(diaries).length) {
                push('## 📔 角色日记');
                push('');
                for (const [name, arr] of Object.entries(diaries)) {
                    const last = (arr || []).slice(-1)[0];
                    if (last) push(`- **${name}**（第${last.floor ?? '?'}楼·${last.mood || '平静'}）：${String(last.text || '').slice(0, 80)}${last.secret ? ` ｜未说出口：${last.secret}` : ''}`);
                }
                push('');
            }
            /* [v3.307.0 · M-O8 第二刀] 秘密账的导出面（验收④「导出包按知识范围过滤」）。
             *   本刀先收**最高危的那一格**：正文**一律不出报告**。
             *   为什么是「一律」而不是「按名单筛」：报告是用户会贴出去、转发出去的东西
             *   （此前它的日记板块连「未说出口」都照抄），而报告这一侧**没有**任何
             *   「谁在看」的信息 —— 无从判定，就只能不输出正文。
             *   于是本段输出的是**存在性 + 知识范围读数**：读者知道有几条、边界可判几条、
             *   判不了几条，但拿不到任何一条的内容。
             *   ★ 与自检面的「秘密隔离」行分列：那一行报**注入侧**挡了多少，
             *     本段报**导出侧**有多少条存在 —— 两件事处置不同，不并一格。 */
            try {
                const _SL = _moduleLib(() => window.LonShaSecretLedger, 'secret-ledger.js');
                const _secState = (engine.worldProg && engine.worldProg.secretLedger) || null;
                const _open = (_SL && typeof _SL.list === 'function')
                    ? (_SL.list(_secState, { status: 'unrevealed' }) || [])
                    : ((_secState && Array.isArray(_secState.items)) ? _secState.items : []);
                if (_open.length) {
                    push('## 🤫 未揭露的秘密（正文按知识范围隔离，不随报告导出）');
                    push('');
                    push('> 本段只报**存在性**与**知识范围**：秘密正文只在注入路径按知情名单渲染，导出文件不携带正文。');
                    push('');
                    const _blind = (_SL && typeof _SL.filterForViewer === 'function')
                        ? (Number((_SL.filterForViewer(_open, '') || {}).undecided) || 0)
                        : _open.length;
                    push(`- 共 ${_open.length} 条 · 已给知情名单 ${_open.length - _blind} 条 · **未给名单（判不了）${_blind} 条**`);
                    for (const _it of _open.slice(0, 10)) {
                        const _k = (_SL && typeof _SL.knowledgeOf === 'function') ? _SL.knowledgeOf(_it, '') : 'unlisted';
                        const _who = (Array.isArray(_it.knowers) && _it.knowers.length) ? '（' + _it.knowers.join('、') + '）' : '';
                        push(`- \`${_it.id || '?'}\` · ${_k === 'unlisted' ? '**未给名单（判不了）**' : '已给知情名单' + _who} · 进度 ${_it.progress == null ? '?' : _it.progress}% · 第 ${_it.floor == null ? '?' : _it.floor} 楼`);
                    }
                    if (_open.length > 10) push(`- …另 ${_open.length - 10} 条（正文同样不外带）`);
                    push('');
                }
            } catch (e) { errLog(e, 'exportMemoryReport.secretScope'); }
            // 物品
            if ((engine.itemOps || []).length) {
                push('## 🎒 物品台账');
                push('');
                for (const o of (engine.itemOps || []).slice(-10)) {
                    if (o?.name) push(`- **${o.name}**（持有：${o.holder || '无主'} · 状态：${o.state || '完好'}）`);
                }
                push('');
            }
            // 大纲
            if (engine.outline?.stage) {
                push('## 🎬 当前大纲');
                push('');
                push(`**「${engine.outline.stage.title}」**：${engine.outline.stage.goal}（tempo: ${engine.outline.stage.tempo}）`);
                const cur = engine.outline.currentTurn;
                if (cur) push(`- 本轮（第${engine.outline._turnIndex + 1}/${engine.outline.flatTurns.length}轮）：${cur.goal} [${cur.pacing}]`);
                push('');
            }
            // 事件统计
            push('## 🔍 审计统计');
            push('');
            // [v3.169] 账本自述：byType 只统计「还在窗口里的」事件——已淘汰的事件连类型一起
            //   消失，读者会据此断定「那类变更从未发生」。窗口与累计必须并排写出。
            {
                const _ost = opLogStatsCompat(this);
                if (_ost.error || _ost.absent) {
                    push(`-   ⚠️ ${_ost.error ? '账本读取失败：' + _ost.error : '账本不存在'}——下列计数不可信（不是 0，是看不见）`);
                } else {
                    push(`-   窗口 ${_ost.total}/${_ost.cap || 500} 条 · 累计事件 ${engine.opLog?.observedTotal?.() ?? _ost.total} · ${engine.opLog?.auditSummary?.() || ''}`);
                    if (_ost.truncated) push(`-   ⚠️ 其中 ${_ost.truncated} 条事件已因环形上限淘汰，按类型统计已不完整`);
                }
            }
            for (const [k, v] of Object.entries(opLogStatsCompat(this).byType || {})) {
                push(`- ${k}：${v} 次`);
            }
            // [v3.76] B: 金字塔与重试队列状态
            const gt = engine.summary?.genericTiers || [];
            if (gt.length) {
                push('');
                push('**金字塔扩展层：**');
                for (const g of gt) push(`- ${g.name}（tier${g.tier}）：${(g.items || []).length} 条`);
            }
            const rq = engine.summary?.retryQueue || [];
            if (rq.length) {
                push('');
                push(`**重试队列：** ${rq.length} 个待重试任务`);
                for (const j of rq.slice(-3)) push(`- ${j.kind}/tier${j.tier}：已试 ${j.attempts} 次`);
            }
            // [v3.107] 任务收件箱状态（缝合 bionic memory-inbox）：卡在哪个阶段 / 最旧待办等了多久
            try {
                const inbox = engine.getTaskInboxReport?.();
                if (inbox && inbox.total) {
                    push('');
                    push(`**任务收件箱：** 共 ${inbox.total} 条（可执行 ${inbox.runnable}）`);
                    push(`- 待办 ${inbox.counts.pending || 0} / 已领取 ${inbox.counts.claimed || 0} / 已完成 ${inbox.counts.completed || 0} / 已推迟 ${inbox.counts.deferred || 0} / 已放弃 ${inbox.counts.cancelled || 0}`);
                    if (inbox.waitingMs > 0) push(`- 最旧待办等待：${Math.round(inbox.waitingMs / 60000)} 分钟`);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.任务收件箱'); }
            // [v3.109] 召回产物诊断（缝合 bionic turn-artifact）：命中率 / 平均注入长度
            try {
                const aa = (typeof window !== 'undefined' ? window.LonShaRecallArtifact : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./recall-artifact.js'); } catch { return null; } })() : null);
                if (aa && engine._recallArtifacts && engine._recallArtifacts.length) {
                    const s = aa.summarizeArtifacts(engine._recallArtifacts);
                    push('');
                    push(`**召回产物：** ${s.total} 条（复用 ${s.reuses} 次，命中率 ${(s.hitRate * 100).toFixed(1)}%）`);
                    push(`- 平均注入 ${s.avgInjectionChars} 字 / 空产物 ${s.empties} 条`);
                    /* [v3.275.0] O5：依据清单被截过的产物数必须出现在报告里。
                     *   截断时 isArtifactStale 的 missing/ratio 只覆盖清单内那部分（窄读数），
                     *   报告不写这一行，读的人会把「这 200 条里没丢」读成「依据完整」。 */
                    if (Number(s.selectedTruncatedCount) > 0) {
                        push(`- ⚠️ ${s.selectedTruncatedCount} 条产物的入选依据清单被截（每条至多保留 ${aa.MAX_SELECTED_IDS || 200} 条，`
                            + `合计依据 ${s.selectedIdsSum} 条下界）—— 其失效判定只覆盖清单内部分`);
                    }
                    // [v3.157] 术语词典可观测：上限是多少、当前多少条，一眼可查
                    try {
                        const _lx = engine.lexicon;
                        if (_lx && Array.isArray(_lx.items)) {
                            const _lxMax = Number.isFinite(Number(_lx.max)) ? Number(_lx.max) : 40;
                            push(`**术语词典：** ${_lx.items.length}/${_lxMax} 条${_lx.items.length >= _lxMax ? '（已达上限，新术语将按 count/lastFloor 淘汰旧条目）' : ''}`);
                        }
                    } catch (e) { errLog(e, 'exportMemoryReport.术语词典'); }
                    // [v3.156] 淘汰分账（老化 vs 超容量），解释「条数为何变少」
                    const _ev = engine._recallArtifactEvictions || {};
                    const _evAge = Number(_ev.byAge) || 0;
                    const _evCap = Number(_ev.byCap) || 0;
                    if (_evAge || _evCap) {
                        push(`- 本会话淘汰 ${_evAge + _evCap} 条（老化 ${_evAge} / 超容量 ${_evCap}）${Number.isFinite(Number(_ev.lastFloor)) ? `，最近一次在第 ${_ev.lastFloor} 楼淘汰 ${_ev.lastRemoved} 条` : ''}（会话内计数，换会话归零）`);
                    }
                }
            } catch (e) { errLog(e, 'exportMemoryReport.召回产物'); }
            // [v3.110] 事件性门控诊断（缝合 bionic smart-trigger）：省下的提取调用数 / 判定分布
            try {
                const st = (typeof window !== 'undefined' ? window.LonShaSmartTrigger : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./smart-trigger.js'); } catch { return null; } })() : null);
                if (st && Array.isArray(engine._triggerStats) && engine._triggerStats.length) {
                    const s = st.summarizeTriggers(engine._triggerStats);
                    push('');
                    push(`**事件性门控：** 评估 ${s.evaluated} 楼（触发 ${s.fired} / 跳过 ${s.skipped}，命中率 ${(s.fireRate * 100).toFixed(1)}%）`);
                    push(`- 估计省下 LLM 提取 ${s.savedCalls} 次 / 平均得分 ${s.avgScore}`);
                    if (s.topReasons.length) push(`- 高频理由：${s.topReasons.map(r => `${r.reason}×${r.count}`).join('、')}`);
                    // [v3.171] 读数面：读数缺口必须入面板，否则「判不了 / 没读到 / 被丢弃」
                    //   会与「真平淡」在面板上同形（I6）。
                    if (typeof st.normalizeTriggerReport === 'function') {
                        const panel = st.normalizeTriggerReport(engine._triggerStats, {
                            cap: 300,
                            dropped: Number(engine._triggerDropped) || 0,
                        });
                        if (panel.hasReadGap) {
                            const bits = [];
                            if (panel.empty) bits.push(`空读 ${panel.empty} 楼`);
                            if (panel.missing) bits.push(`缺失 ${panel.missing} 条`);
                            if (panel.dropped) bits.push(`环形淘汰 ${panel.dropped} 条`);
                            push(`- ⚠️ 读数缺口：${bits.join(' / ')}（正常读数 ${panel.plain} 楼）`);
                        }
                        const _invBad = engine._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.invalidPatterns) || 0), 0);
                        const _omitErr = engine._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.omitErrors) || 0), 0);
                        if (_invBad || _omitErr) {
                            // 用字符串拼接而非数组 .push（v3111 体检段窗口内只允许 push 文本行）
                            let _bad = '';
                            if (_invBad) _bad += `自定义规则无法编译 ${_invBad} 次`;
                            if (_omitErr) _bad += (_bad ? ' / ' : '') + `番外判定抛错 ${_omitErr} 次`;
                            push(`- ⚠️ 判定失败：${_bad}（已 fail-open，未影响提取）`);
                        }
                    }
                }
            } catch (e) { errLog(e, 'exportMemoryReport.事件性门控'); }
            // [v3.111] 召回体检（缝合 bionic recall-candidate-packet + task-graph-stats）：
            //   回答「为什么这条记忆没被想起来」——索引覆盖率 / 问题分布 / 掉队候选数。
            //   纯读诊断，不参与召回决策（无配置键、默认生效）。
            try {
                const ra = (typeof window !== 'undefined' ? window.LonShaRetrievalAudit : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./retrieval-audit.js'); } catch { return null; } })() : null);
                if (ra && engine.vector && Array.isArray(engine.vector.vectors) && engine.vector.vectors.length) {
                    const audit = ra.auditVectorStore(engine.vector.vectors, {
                        expectedDimension: Number(engine.vector.dimension) || 0,
                    });
                    const sum = ra.summarizeAudit(audit);
                    const tail = ra.planVectorTail(engine.vector.vectors, {
                        expectedDimension: Number(engine.vector.dimension) || 0,
                        limit: 5,
                    });
                    push('');
                    push(`**召回体检：** ${sum.total} 条（健康 ${sum.healthy}，覆盖率 ${(sum.coverage * 100).toFixed(1)}%）`);
                    if (sum.topIssues.length) push(`- 问题分布：${sum.topIssues.map(i => `${i.reason}×${i.count}`).join('、')}`);
                    if (sum.blockingRecall > 0) push(`- ️ ${sum.blockingRecall} 条因向量缺陷基本不可召回（可修复）`);
                    if (tail.flaggedTotal > 0) push(`- 掉队候选 ${tail.flaggedTotal} 条（含最近 ${tail.candidates.length} 条示例）`);
                    const nodes = engine.graph?.nodes ? Array.from(engine.graph.nodes.values()) : [];
                    if (nodes.length) {
                        const rows = ra.summarizeTypeCounts(nodes, null, {});
                        if (rows.length) push(`- 图谱节点：${rows.map(r => `${r.label}${r.count}`).join('、')}`);
                    }
                }
            } catch (e) { errLog(e, 'exportMemoryReport.召回体检'); }
            // [v3.172] 召回漏斗面板（缝合四模块的收缩阶段）：漏斗在哪一段变窄、窄了多少
            try {
                const _aiP = (typeof window !== 'undefined' ? window.LonShaAISelect : null);
                if (_aiP && typeof _aiP.normalizeRecallFunnel === 'function'
                    && Array.isArray(engine._recallFunnel) && engine._recallFunnel.length) {
                    const _fpR = _aiP.normalizeRecallFunnel(engine._recallFunnel, {
                        cap: 500, dropped: Number(engine._recallFunnelDropped) || 0,
                    });
                    push('');
                    push(`**召回漏斗：** 读数 ${_fpR.records} 轮（AI 空集 ${_fpR.empty}，正常读数 ${_fpR.recorded}）`);
                    if (_fpR.hasReadGap) push(`- 收缩读数：${_fpR.unreadable} 判不了 / ${_fpR.unmatched} 映射不上 / `
                        + `${_fpR.truncated} 粗召回截断 / ${_fpR.graphDropped} 图谱截断 / ${_fpR.hardCut} 硬切 / `
                        + `${_fpR.channelFallback} 副通道回落 / ${_fpR.dropped} 环形淘汰 / ${_fpR.missing} 缺失读数`);
                    else push(`- 本轮窗口内未观测到收缩（≠ 从未收缩：环形淘汰 ${_fpR.dropped} 条）`);
                    if (Number(engine._recallFunnelReadEmpty) > 0) push(`- 空读轮次 ${engine._recallFunnelReadEmpty}（一轮下来一条读数都没计到）`);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.召回漏斗'); }
            // [v3.173] 模块接线面板（v3.163 账本 7 个零消费模块的接线产出）
            try {
                const _ax = [];
                if (engine._entityRegistryRead) _ax.push(`实体登记 ${engine._entityRegistryRead.upserted} 条`
                    + (engine._entityRegistryRead.rejected ? ` / 被拒 ${engine._entityRegistryRead.rejected}` : '')
                    + (engine._entityRegistryRead.resolveMiss ? ` / 身份不唯一 ${engine._entityRegistryRead.resolveMiss}` : ''));
                if (engine._graphDedupCascade) _ax.push(`图谱 ${engine._graphDedupCascade.nodes} 节点 / ${engine._graphDedupCascade.edges} 边`
                    + ` / 幽灵边 ${engine._graphDedupCascade.ghostNodes} / 悬空依赖 ${engine._graphDedupCascade.danglingDeps}`);
                if (engine._cadenceTriage) _ax.push(`抽取节奏 seq=${engine._cadenceTriage.seq}`
                    + ` 本轮激活 ${(engine._cadenceTriage.active || []).length}/${engine._cadenceTriage.tuned}`
                    + (engine._cadenceTriage.normalizedFallback && engine._cadenceTriage.normalizedFallback.length
                        ? ` / 旋钮回落 ${engine._cadenceTriage.normalizedFallback.join(' ')}` : ''));
                if (engine._floorRangeLedger) _ax.push(`覆盖水位 ${engine._floorRangeLedger.coveredTo} 楼`
                    + ` / ${engine._floorRangeLedger.segments} 段 / 空洞 ${engine._floorRangeLedger.holes}`
                    + ` / 待处理 ${engine._floorRangeLedger.pending} 段`);
                if (engine._artifactTurnReconcile) _ax.push(`产物轮次对账 认领 ${engine._artifactTurnReconcile.claimed}`
                    + ` / 对不上 ${engine._artifactTurnReconcile.unmatched}（库内 ${engine._artifactTurnReconcile.existing}）`);
                if (engine._histFpRead) _ax.push(`历史指纹走${engine._histFpRead.via === 'canonical' ? '模块 FNV' : '本地回落'}`);
                if (engine._npcTiesRead) _ax.push(`关系网对账 模块 ${engine._npcTiesRead.moduleRows} 行 / 内联 ${engine._npcTiesRead.inlineRows} 行`
                    + `（${engine._npcTiesRead.rowsAgree ? '一致' : '格式已分歧'}）`);
                if (_ax.length) {
                    push('');
                    push('**模块接线：** v3.163 账本 7 个零消费模块的接线产出');
                    for (const _line of _ax) push('- ' + _line);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.模块接线'); }
            // [v3.112] 覆盖账本诊断（缝合 AnchorNote）：归档隐藏的推导结果 / 待恢复数 / 孤儿覆盖者
            try {
                const cs = engine._lastCoverageSummary;
                if (cs && cs.candidateFloors) {
                    push('');
                    push(`**覆盖账本：** 候选 ${cs.candidateFloors} 楼（被覆盖 ${cs.coveredFloors}，覆盖率 ${(cs.coverageRate * 100).toFixed(1)}%）`);
                    push(`- 当前归档隐藏 ${cs.hiddenFloors} 楼（上次重算：新增 ${cs.toHide} / 恢复 ${cs.toRestore} / 保持 ${cs.unchanged}）`);
                    if (cs.orphans.length) push(`- 孤儿覆盖者 ${cs.orphans.length} 个（覆盖区间内已无可归档楼层）`);
                }
            } catch (e) { errLog(e, 'exportMemoryReport.覆盖账本'); }
            return L.join('\n');
        }


    return {
        exportMemoryReport: exportMemoryReport,
        opLogStatsCompat: opLogStatsCompat,
        bindDeps: bindDeps
    };
}));
