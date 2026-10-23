// [v3.363.0] engine-recall.js: 从 index.js 剥离的记忆召回主管线模块
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineRecall = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const PLUGIN_NAME = 'LonShaMemoryPlugin';
    let _errLog = (e, ctx) => { try { console.error('[LonShaRecall]', ctx, e); } catch (_) {} };

    function errLog(e, ctx) {
        if (typeof _errLog === 'function') _errLog(e, ctx);
    }

    let _libs = {};
    function bindDeps(deps) {
        if (deps) {
            if (typeof deps.errLog === 'function') _errLog = deps.errLog;
            if (deps.libs) _libs = deps.libs;
        }
    }

    function _moduleLib(getGlobal, fileName) {
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

    function _emotionOppositeLib() {
        if (_libs._emotionOppositeLib) return _libs._emotionOppositeLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaNarrativePulse : null), 'narrative-pulse.js');
    }
    function _factAdmissionLib() {
        if (_libs._factAdmissionLib) return _libs._factAdmissionLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaNativeFactAdmission : null), 'native-fact-admission.js');
    }
    function _sleepAwakenLib() {
        if (_libs._sleepAwakenLib) return _libs._sleepAwakenLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSleepAwaken : null), 'sleep-awaken.js');
    }
    function _summaryProvenanceLib() {
        if (_libs._summaryProvenanceLib) return _libs._summaryProvenanceLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSummaryProvenance : null), 'summary-provenance.js');
    }

    function _newRelativeTimeHelper() {
        return {
            relativeTimePrefix(dateStr, nowStr) {
                try {
                    if (!dateStr || !nowStr) return '';
                    return '';
                } catch (_) { return ''; }
            }
        };
    }

    function numOr(v, fallback) {
        // [v3.224.0] O-2：`typeof v === 'object'` 一并回退。修前只挡布尔/空串/null/undefined，
        //   而 `Number([]) === 0`、`Number([5]) === 5` —— 宿主删楼事件把 `messageId` 传成数组时，
        //   本函数会把「没给」读成第 0 楼（而 0 是合法楼层，两者处置相反）。
        if (v === undefined || v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    function normalizeCharName(name) {
        try {
            return String(name || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
        } catch (e) { errLog(e, 'SF4.normalizeCharName'); return String(name || ''); }
    }

    function relativePrefix(dateStr, nowStr) {
        try {
            const p = _newRelativeTimeHelper().relativeTimePrefix(dateStr, nowStr);
            if (p) return p;
        } catch (e) { errLog(e, 'relativePrefix.legacy兜底'); }
        try {
            if (!dateStr || !nowStr) return '';
            const diff = storyDayDiff(nowStr, dateStr);
            if (diff === null || isNaN(diff)) return '';
            if (diff === 0) return '今天';
            if (diff === 1) return '昨天';
            if (diff === 2) return '前天';
            if (diff > 2 && diff < 7) return diff + '天前';
            if (diff >= 7 && diff < 30) return Math.floor(diff / 7) + '周前';
            if (diff >= 30 && diff < 365) return Math.floor(diff / 30) + '个月前';
            if (diff >= 365) return Math.floor(diff / 365) + '年前';
            if (diff === -1) return '明天';
            if (diff < -1 && diff > -7) return Math.abs(diff) + '天后';
            return '';   // 更远的未来不标（宁可不标绝不标错）
        } catch (e) { return ''; }
    }

    function filterTimelineByConstraint(entries, c) {
        if (!c || !Array.isArray(entries) || !entries.length) return entries;
        const normD = (d) => String(d || '').replace(/\s+/g, '').replace(/[年月日]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        return entries.filter(e => {
            const raw = String(e.date || '');
            const ek = normD(raw);
            const normAbs = ek;   // 归一化绝对日期：2026-05-12 → 2026-05；5月3日 → 5-3
            if (!ek) return false;
            // 剧情历（Day N）判定：raw 含 Day（不区分大小写）
            const isDay = /^day\s*\d+/i.test(raw) || /^day\s*\d+/i.test(raw.trim());
            if (c.type === 'narrative' || c.type === 'narrative_range') {
                if (!isDay) return false;   // 剧情历约束只匹配剧情历日期
                const dm = raw.match(/day\s*(\d+)/i);
                if (!dm) return false;
                const dayNum = parseInt(dm[1]);
                if (c.type === 'narrative') {
                    const targetDay = parseInt(String(c.period).replace(/[^0-9]/g, ''));
                    return dayNum === targetDay;
                }
                const fromD = parseInt(String(c.from).replace(/[^0-9]/g, ''));
                const toD = parseInt(String(c.to).replace(/[^0-9]/g, ''));
                return dayNum >= fromD && dayNum <= toD;
            }
            if (c.type === 'absolute') {
                if (isDay) return false;    // 绝对月约束不匹配剧情历
                const period = c.period.replace(/^0(?=(\d{2})$)/, '');   // 2026-05 → 2026-5 也接受
                // 兼容 YYYY-MM（ISO）与 YYYY-M（中文）
                const yearMonth = normAbs.match(/^(20\d{2})-(\d{1,2})/);
                const wantYear = String(c.year || '');
                const wantMonth = String(c.month || '');
                if (yearMonth && wantYear) {
                    return yearMonth[1] === wantYear && parseInt(yearMonth[2]) === parseInt(wantMonth);
                }
                // 中文月份（5月3日 → 5-3）：匹配月份段
                if (wantMonth) {
                    const cnMonth = normAbs.match(/^(\d{1,2})-/);
                    return !!cnMonth && parseInt(cnMonth[1]) === parseInt(wantMonth);
                }
                return normAbs.indexOf(period) !== -1 || normAbs.indexOf(period.replace(/-0(\d)$/, '-$1')) !== -1;
            }
            if (c.type === 'relative') {
                if (isDay) return false;
                return normAbs.indexOf(normD(c.period)) !== -1;
            }
            return true;
        });
    }

    function parseStoryTimeConstraint(query) {
        try {
            const q = String(query || '').trim();
            if (!q) return null;
            // 1. 剧情历 Day X - Day Y 范围（支持中文"到"）
            const dayRange = q.match(/Day\s*(\d+)\s*(?:[-–—]|to|到)\s*Day?\s*(\d+)/i);
            if (dayRange) return { type: 'narrative_range', from: 'Day ' + dayRange[1], to: 'Day ' + dayRange[2], period: 'Day ' + dayRange[1] + '-' + dayRange[2] };
            // 2. Day X
            const daySingle = q.match(/Day\s*(\d+)/i);
            if (daySingle) return { type: 'narrative', period: 'Day ' + daySingle[1] };
            // 3. ISO 日期 YYYY-MM / YYYY年M月
            const isoMatch = q.match(/\b(20\d{2})[-年](\d{1,2})\b/);
            if (isoMatch) return { type: 'absolute', period: isoMatch[1] + '-' + String(isoMatch[2]).padStart(2, '0'), month: parseInt(isoMatch[2]), year: parseInt(isoMatch[1]) };
            // 4. 中文相对时间
            if (/(昨天|前天)/.test(q)) return { type: 'relative', period: '昨天' };
            if (/今天|今天.+(？|\?)|今天.*(如何|怎样|怎样|发生了什么)/.test(q)) return { type: 'relative_today', period: '今天' };
            // 5. 中文月份
            const mMonth = q.match(/(上午|下午|晚上|早晨|凌晨)|(一月|二月|三月|四月|五月|六月|七月|八月|九月|十月|十一月|十二月)/);
            if (mMonth && mMonth[2]) {
                const cnMonths = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
                const mi = cnMonths.indexOf(mMonth[2]);
                // 归一为 absolute（月号约束），period 兼容中文月份过滤
                return { type: 'absolute', period: mMonth[2], month: mi + 1, year: null, cn: true };
            }
            return null;
        } catch (e) { return null; }
    }

    async function recallMemory(engine, query) {
            const results = {summary: [], graph: [], diary: [], vector: [], diffusion: [], pov: [], timeline: [], bm25: [], volume: [], status: [], holiday: [], suspense: [], presence: [], neuralChain: [], worldProg: []};
            // [v3.149] 卷摘要 intact 对账（柏宝书 #13 缝入）：折叠区下楼层被 swipe/编辑后卷摘要嵌失效叙事——召回前先校验并降级展开（零 LLM 调用纯机制自愈）
            try { if (engine.config.config.volumeIntegrityGuard !== false && engine.summary?.verifyVolumesIntact) engine.summary.verifyVolumesIntact(engine.config.config); } catch (e) { errLog(e, 'recallMemory.卷摘要对账'); }
            results.summary = engine.summary.search(query.text);
            // [v3.183] 分支感知召回过滤（Branch-aware recall filter，Liyuan onCurrentBranch 的 LonSha 映射）：
            //   LonSha 没有会话树，「废弃分支」在这里表现为**摘要的来源楼层显示页已被翻掉**——
            //   摘要仍在索引里（它是按文本进的库），于是旧分支叙事会和当前分支一起被注入。
            //   Liyuan 源码注释记载了这个代价：13 次重 roll 中第 5、10 拍入库，第 11 拍起开始写「承接上一拍」。
            //   **只剔除 source_changed**（来源楼还在、但显示页已非当初那一页），其余一律保留：
            //     · no_provenance / malformed —— 判不了（旧档、结构异常）→ 放行，宁可多注入也别丢记忆；
            //     · source_missing —— 删楼与楼层前移不可区分，前移时丢掉就是真丢；
            //     · text_drift     —— 正文被就地改过，那是有意为之。
            //   纪律：过滤漏一点，好过让用户的记忆整体消失（与 branch-guard「判不了就放行」同源）。
            try {
                if (engine.config.config.recallProvenanceFilter !== false) {
                    const PV = _summaryProvenanceLib();
                    if (PV && typeof PV.filterForRecall === 'function' && Array.isArray(results.summary) && results.summary.length) {
                        const _chat = (typeof window !== "undefined" && window.SillyTavern && window.SillyTavern.getContext && window.SillyTavern.getContext() || {}).chat || [];
                        // 判据本体在 summary-provenance.js（纯函数、可单测）；此处只负责取数与留痕。
                        const r = PV.filterForRecall(results.summary, _chat);
                        results.summary = r.kept;
                        const _st = engine._provRecallFilter = engine._provRecallFilter || {
                            rounds: 0, checked: 0, dropped: 0, keptLegacy: 0, keptMissing: 0, keptDrift: 0, moduleMissing: 0, lastDropped: [],
                        };
                        _st.rounds++;
                        _st.checked += Number(r.counts.checked) || 0;
                        _st.dropped += Number(r.counts.dropped) || 0;
                        _st.keptLegacy += Number(r.counts.keptLegacy) || 0;
                        _st.keptMissing += Number(r.counts.keptMissing) || 0;
                        _st.keptDrift += Number(r.counts.keptDrift) || 0;
                        _st.lastDropped = (r.dropped || []).slice(0, 20);
                        if (r.dropped && r.dropped.length && engine.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 来源过滤: ${r.dropped.length} 条旧分支摘要未注入（第${r.dropped.map(d => d.floor).join('、')}楼）`);
                        }
                    } else if (!PV) {
                        engine._provRecallFilter = engine._provRecallFilter || { rounds: 0, checked: 0, dropped: 0, keptLegacy: 0, keptMissing: 0, keptDrift: 0, moduleMissing: 0, lastDropped: [] };
                        engine._provRecallFilter.moduleMissing++;
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.来源过滤'); }

            
            // [v1.5] 登场角色捕获（抄 HCDiary）：从最近楼层窗口判断谁登场，只召回这些角色的记忆
            const castCaptured = (typeof engine.captureCast === 'function') ? engine.captureCast() : [];
            if (castCaptured.length > 0) query.characters = castCaptured;
            
            if (query.characters?.length > 0) {
                results.graph = engine.graph.findByNames(query.characters);
                results.diary = engine.diary.search(query.characters);

                // [v3.37/v3.38] 时态知识图谱（Temporal Graph, Zep 理念）：支持角色名与节点ID双向匹配
                try {
                    const isHistorical = /当年|曾经|以前|旧怨|旧事|过去|往事|回忆|最初/i.test(query.text || '');
                    const charMatchKeys = new Set();
                    (query.characters || []).forEach(c => {
                        charMatchKeys.add(c);
                        charMatchKeys.add(normalizeCharName(c));
                    });
                    (results.graph || []).forEach(n => {
                        if (n.id) charMatchKeys.add(n.id);
                        if (n.name) {
                            charMatchKeys.add(n.name);
                            charMatchKeys.add(normalizeCharName(n.name));
                        }
                    });
                    const relEdges = [];
                    // [v3.91] 审计修复：config.temporalGraphEnabled 此前全项目零引用（历史边追溯恒开）。
                    //         关闭时只召回 active 边，不回溯 validTo 已闭合的历史关系。
                    const _temporalOn = engine.config.config.temporalGraphEnabled !== false;
                    for (const edge of engine.graph.edges.values()) {
                        const hitFrom = charMatchKeys.has(edge.from) || charMatchKeys.has(normalizeCharName(edge.from));
                        const hitTo = charMatchKeys.has(edge.to) || charMatchKeys.has(normalizeCharName(edge.to));
                        if (hitFrom || hitTo) {
                            if (edge.active !== false) {
                                relEdges.push(edge);
                            } else if (_temporalOn && isHistorical && (edge.validTo != null || edge.active === false)) {
                                relEdges.push({ ...edge, historical: true });
                            }
                        }
                    }
                    if (relEdges.length) {
                        results.relations = relEdges.slice(0, 6);
                    }
                } catch (e) { errLog(e, 'recallMemory.时态关系'); }

                // [v3.28] 记忆树路由召回（st-memory-wizzard 本地轻量版，无需第二模型）
                try {
                    if (engine.config.config.memoryTreeEnabled && engine.graph?.nodes?.size) {
                        const treePaths = [];
                        for (const ch of query.characters.slice(0, 4)) {
                            const node = engine.graph.findCharacterByName(ch);
                            if (!node) continue;
                            const neighborNames = new Set();
                            for (const edge of engine.graph.edges.values()) {
                                if (edge.from === node.id) neighborNames.add(engine.graph.nodes.get(edge.to)?.name);
                                else if (edge.to === node.id) neighborNames.add(engine.graph.nodes.get(edge.from)?.name);
                            }
                            for (const nn of neighborNames) {
                                if (!nn || nn === ch) continue;
                                const nm = engine.graph.findCharacterByName(nn);
                                if (nm?.data?.description) {
                                    treePaths.push({ id: 'tree_' + node.id + '_' + nm.id, text: `${ch} → ${nn}：${String(nm.data.description).slice(0, 80)}`, source: 'memoryTree', character: ch });
                                }
                            }
                        }
                        if (treePaths.length) {
                            const exists = new Set((results.graph || []).map(g => g.id || g.name || g.node?.id));
                            results.graph = [...(results.graph || []), ...treePaths.filter(t => !exists.has(t.id))].slice(0, engine.config.config.vectorTopK * 2 + 4);
                        }
                    }
                } catch (e) { errLog(e, 'recallMemory.记忆树路由'); }

                // [v3.16] 神经链召回（抄 zhino）
                try {
                    if (engine.config.config.neuralChainEnabled && query.characters.length > 0) {
                        const userQuery = `${query.text || ''}`;
                        const chain1 = query.characters.slice(0, 3).map(c => {
                            const mems = (engine.charMem?.search ? engine.charMem.search(c, userQuery) : []);
                            return mems.map(m => ({ id: 'c1_' + c + '_' + m.id, text: `${c}：${m.text}`, source: 'neuralChain', chain: 1, character: c }));
                        }).flat().slice(0, 6);
                        const seenC1 = new Set(chain1.map(x => x.text));
                        const chain2 = [];
                        for (let i = 0; i < query.characters.length; i++) {
                            for (let j = i + 1; j < query.characters.length; j++) {
                                const a = query.characters[i], b = query.characters[j];
                                for (const mem of (engine.charMem?.search ? [...engine.charMem.search(a, b), ...engine.charMem.search(b, a)] : [])) {
                                    const text = `${a}↔${b}：${mem.text}`;
                                    if (!seenC1.has(text)) chain2.push({ id: 'c2_' + mem.id, text, source: 'neuralChain', chain: 2 });
                                }
                            }
                        }
                        results.neuralChain = [...chain1, ...chain2].slice(0, 8);
                    }
                } catch (e) { errLog(e, 'recallMemory.神经链'); }
            }

            // [v1.9] P1: BM25 稀疏检索召回（提前执行，为 HippoRAG 准备文本实体输入）
            // [v3.86] 吸收 MyriadKnots：有分支查询时走 searchBranches 多路归一化（主查询降权为 0.3 锚点），
            // 防长背景文本绝对分淹没最新用户输入；无分支时主查询 weight=1 行为等价旧版
            if (engine.config.config.bm25Enabled && engine.bm25.N && query.text) {
                try {
                    const bmTopK = Math.round((engine.config.config.bm25TopK || 5) * engine.computeRecallQuota());
                    const branchSet = [{ key: 'main', text: query.text, weight: 0.3 }];
                    if (Array.isArray(query.branches) && query.branches.length) {
                        for (const b of query.branches) branchSet.push({ key: b.key, text: b.text, weight: Number(b.weight) || 0 });
                    }
                    results.bm25 = engine.bm25.searchBranches(branchSet, bmTopK, {cliffCut: true, minResults: 2, aliasMap: query.aliases})
                        .map(d => ({id: d.id, text: d.text, floor: d.floor, score: d.score, branchScores: d.branchScores, source: 'bm25'}));
                    if (engine.config.config.heatOnRecallEnabled) {
                        for (const b of results.bm25) { try { engine.vector.heatByText(b.text); } catch (e) { errLog(e, 'nonfatal') } }
                    }
                    if (Array.isArray(query.queries) && query.queries.length) {
                        const seenB = new Set(results.bm25.map(x => x.id));
                        for (const q2 of query.queries) {
                            for (const d of engine.bm25.search(q2, 3)) {
                                if (!seenB.has(d.id)) { seenB.add(d.id); results.bm25.push({id: d.id, text: d.text, floor: d.floor, score: d.score, source: 'bm25'}); }
                            }
                        }
                    }
                } catch (e) { if (engine.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] BM25检索失败:`, e); }
            }

            // [v2.8] RT-C: 物品台账召回（提前执行，为 HippoRAG 提取道具实体输入）
            // [v3.44] 吸收 baibai: 物品物理可达性与随身/寄存解耦（Carried vs Location 互斥）
            if (engine.config.config.itemLedgerEnabled && engine.itemOps?.length) {
                const cast = engine.captureCast();
                const qText = query.text || '';
                let currentGeo = '';
                try {
                    const charState = typeof window !== "undefined" && window.LonShaMemory?.engine?.characterState;
                    if (charState?.getGeoLocation) {
                        const geo = charState.getGeoLocation();
                        currentGeo = `${geo.majorArea || ''} ${geo.minorArea || ''} ${geo.detailLocation || ''}`.trim().toLowerCase();
                    }
                } catch (e) { errLog(e, 'nonfatal') }

                const relevant = engine.items.records.filter(r => {
                    const isRemoved = r.state && (r.state === '丢失' || r.state === '损毁' || r.state === '已消耗' || r.state === '丢弃');
                    if (isRemoved) return qText && qText.includes(r.name);
                    return cast.some(c => (r.holder || '').includes(c)) || (qText && qText.includes(r.name));
                }).slice(-8);

                if (relevant.length) {
                    const accessible = [];
                    const stored = [];
                    for (const r of relevant) {
                        const isCarried = (r.carried === true || (!r.location && r.carried !== false));
                        if (isCarried) {
                            accessible.push({
                                name: r.name,
                                text: `${r.name}（随身·${r.holder || '无主'}持有，${r.state || '完好'}）${r.desc ? '：' + r.desc : ''}`,
                                source: 'items'
                            });
                        } else {
                            const loc = (r.location || '').trim();
                            const locLower = loc.toLowerCase();
                            const isNearby = locLower && currentGeo && (currentGeo.includes(locLower) || locLower.includes(currentGeo));
                            if (isNearby) {
                                accessible.push({
                                    name: r.name,
                                    text: `${r.name}（在场·存放于${loc}，${r.state || '完好'}）${r.desc ? '：' + r.desc : ''}`,
                                    source: 'items'
                                });
                            } else {
                                stored.push({
                                    name: r.name,
                                    text: `${r.name}（存放于${loc || '他处'}，${r.holder || '无主'}持有）`,
                                    source: 'items_stored'
                                });
                            }
                        }
                    }
                    results.items = accessible;
                    if (stored.length) results.itemsStored = stored;
                }
            }

            // Phase 3: 图扩散增强召回（HippoRAG 实体引燃在此顺利读取 BM25 与 items）
            if (engine.config.config.graphDiffusionEnabled && typeof window !== "undefined" && window.LonShaMemory?.diffusion) {
                try {
                    let seedNodes = [...(results.graph || [])];
                    if (engine.config.config.hippoDiffusionEnabled !== false) {
                        // [v3.37/v3.38] HippoRAG 双路引燃扩散：BM25 文本 + 活跃物品联合识别种子节点
                        const entityCandidates = new Set();
                        (results.bm25 || []).slice(0, 5).forEach(b => {
                            if (b.text) {
                                const matched = engine.graph.findNodesMentionedIn(b.text);
                                for (const node of matched) entityCandidates.add(node);
                            }
                        });
                        (results.items || []).slice(0, 3).forEach(it => {
                            const raw = it.name || it.text || '';
                            if (raw) {
                                const matched = engine.graph.findNodesMentionedIn(raw);
                                for (const node of matched) entityCandidates.add(node);
                            }
                        });
                        for (const cand of entityCandidates) {
                            if (!seedNodes.some(s => s.id === cand.id)) seedNodes.push(cand);
                        }
                    }
                    seedNodes = seedNodes.slice(0, 5);
                    if (seedNodes.length > 0) {
                        for (const [k, v] of engine._diffusionFatigue) {
                            if (v <= 1) engine._diffusionFatigue.delete(k);
                            else engine._diffusionFatigue.set(k, v - 1);
                        }
                        const diffusionResults = window.LonShaMemory.diffusion.personalizedPageRank(
                            seedNodes, 
                            3, 
                            engine.config.config.vectorTopK,
                            engine.config.config.pageRankDamping   // [v3.91] 审计修复：此前该配置全项目零引用，扩散阻尼恒为库内硬编码 0.85
                        );
                        const fatigue = engine._diffusionFatigue;
                        const suppressed = [];
                        for (const r of diffusionResults) {
                            const nid = engine._nodeIdentity(r);
                            if (nid && fatigue.has(nid)) {
                                suppressed.push({ ...r, score: (r.score || 0) * 0.15 });
                                fatigue.delete(nid);
                            } else {
                                suppressed.push(r);
                            }
                        }
                        const diverseResults = window.LonShaMemory.diffusion.diversitySampling(
                            suppressed,
                            Math.min(5, suppressed.length),
                            engine.config.config.dppLambda
                        );
                        results.diffusion = diverseResults.map(r => ({
                            ...r.node,
                            score: r.score,
                            source: 'diffusion'
                        }));
                        for (const r of results.diffusion.slice(0, engine._diffusionFatigueTopN)) {
                            const nid = engine._nodeIdentity({ node: r });
                            if (nid) engine._diffusionFatigue.set(nid, engine._diffusionFatigueTimeout);
                        }
                        if (engine.config.config.debugMode) {
                            console.log(`[${PLUGIN_NAME}] 图扩散召回: ${results.diffusion.length}条`);
                        }
                    }
                } catch (err) {
                    console.warn(`[${PLUGIN_NAME}] 图扩散失败:`, err);
                }
            }
            
            // [v2.4] RE: 多查询召回——主查询 + rewriteQuery 改写的查询分别检索
            if (engine.config.config.vectorEnabled && query.text) {
                const vectorResults = await engine.vector.search(query.text, Math.round(engine.config.config.vectorTopK * engine.computeRecallQuota()));
                results.vector = vectorResults.map(v => ({
                    text: v.text,
                    score: v.score,
                    metadata: v.metadata,
                    source: 'vector'
                }));
                if (Array.isArray(query.queries) && query.queries.length) {
                    for (const q2 of query.queries) {
                        try {
                            const more = await engine.vector.search(q2, 3);
                            for (const v of more) results.vector.push({text: v.text, score: v.score * 0.9, metadata: v.metadata, source: 'vector'});
                        } catch (e) { errLog(e, 'recallMemory.向量重试'); }
                    }
                }
            }

            // [v3.111] 掉队候选补召回（缝合 bionic collectVectorTailCandidates）：
            //   向量库里有相当一部分条目因「无向量 / 零向量 / 维度不符」永远进不了向量检索的候选池
            //   ——它们不是不重要，只是检索通道坏了。默认关；开启后把这些掉队条目以低分补进候选池，
            //   让 BM25/图谱与预算裁剪照常决定留不留，避免「记忆在库里却怎么都召不回」。
            if (engine.config.config.vectorTailRecoveryEnabled === true && engine.vector?.vectors?.length) {
                try {
                    const ra = (typeof window !== 'undefined' ? window.LonShaRetrievalAudit : null)
                        || (typeof require !== 'undefined' ? (() => { try { return require('./retrieval-audit.js'); } catch { return null; } })() : null);
                    if (ra && Array.isArray(results.vector)) {
                        const tail = ra.planVectorTail(engine.vector.vectors, {
                            expectedDimension: Number(engine.vector.dimension) || 0,
                            limit: numOr(engine.config.config.vectorTailRecoveryLimit, 8),   // [v3.156] 0=不补召回（planVectorTail 内部对 0 走 normInt 下限，语义为「不通知候选」）
                            includeReasons: ['missing-embedding', 'zero-vector', 'dimension-mismatch'],
                        });
                        let added = 0;
                        const existing = new Set(results.vector.map(v => String(v.text || '').trim()));
                        for (const cand of tail.candidates) {
                            const text = String(cand.text || '').trim();
                            if (!text || existing.has(text)) continue;
                            existing.add(text);
                            results.vector.push({ text, score: 0.3, source: 'vector:tail', metadata: { floor: cand.floor, reasons: cand.reasons } });
                            added++;
                        }
                        if (added && engine.config.config.debugMode) console.log(`[${PLUGIN_NAME}] [v3.111] 掉队候选补召回 ${added} 条（累计 ${tail.flaggedTotal} 条有问题）`);
                    }
                } catch (e) { errLog(e, 'recallMemory.掉队候选补召回'); }
            }
            // [v1.9] P1: 卷摘要召回（已折叠的高层概括）
            if (engine.config.config.summaryFoldEnabled && engine.summary.volumes.length) {
                results.volume = engine.summary.searchVolumes(2)
                    .map(v => ({id: v.id, text: `【卷${v.floorStart}-${v.floorEnd}】${v.text}`, floor: v.floorStart, source: 'volume'}));
            }
            
            // [v2.1] P3: 节日感知召回
            if (engine.config.config.holidayAware) {
                try {
                    const sd = engine.getLatestStoryDate();
                    const h = sd ? engine.holiday.current(sd) : null;
                    if (h) {
                        const kw = engine.holiday.keywords(h.name);
                        const kwHits = [];
                        if (kw.length) {
                            for (const s of engine.summary.getActiveSummaries()) {
                                if (kw.some(k => s.text.includes(k))) kwHits.push({id: 'hol_' + s.floor, text: s.text, floor: s.floor, holiday: h.name, source: 'holiday'});
                            }
                            results.holiday = kwHits.slice(0, 3);
                        }
                        if (engine.config.config.debugMode && h) console.log(`[${PLUGIN_NAME}] 🎉 节日感知: ${h.name} (偏移${h.offsetDays}天)`);
                    }
                } catch (e) { errLog(e, 'recallMemory.节日感知'); }
            }
            
            // [v2.0] P2: 角色状态召回
            if (engine.config.config.characterStateEnabled && Object.keys(engine.status.characters || {}).length) {
                const presentCast = engine.captureCast();
                const owners = presentCast.length ? presentCast : (typeof window !== "undefined" && window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    const _ageOpts = {
                        now: engine.clock?.date || engine.getLatestStoryDate?.() || '',
                        calcAge: (a, b) => engine.clock?.calcAge?.(a, b),
                        parseFn: (s) => engine.clock?.parseStoryDate?.(s)
                    };
                    results.status = engine.status.searchByNames(owners, 5).map(r => ({
                        name: r.name, fields: r.fields, todos: r.todos,
                        // [v3.180] 年龄随状态条目一起外供（三态读数）；未记年龄的角色为空串，不占位。
                        age: engine.status.ageReading(r.name, _ageOpts),
                        source: 'status'
                    }));
                }
            }
            
            // [v1.8] P0: 剧情时间线召回
            if (engine.config.config.plotTimeline && engine.timeline.entries.length) {
                const anchorDate = engine.getLatestStoryDate();
                const tcQuery = parseStoryTimeConstraint(query.text);
                let timelinePool = engine.timeline.entries;
                if (tcQuery) {
                    const filteredTl = filterTimelineByConstraint(engine.timeline.entries, tcQuery);
                    if (filteredTl.length > 0) timelinePool = filteredTl;
                }
                if ((tcQuery ? timelinePool.length > 0 : anchorDate)) {
                    const relOn = engine.config.config.relativeTime !== false;
                    const tlSource = tcQuery
                        ? [...timelinePool].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5)
                        : engine.timeline.searchNear(anchorDate, engine.config.config.timelineWindowDays, 5);
                    results.timeline = tlSource
                        .map(e => {
                            let rel = '';
                            if (relOn) {
                                try { rel = relativePrefix(e.date, anchorDate); } catch (err) { rel = ''; }
                            }
                            return {id: e.id, text: `[${rel ? rel + '·' : ''}${e.date}] ${e.text}`, date: e.date, floor: e.floor, source: 'timeline', importance: e.importance || 5};
                        });
                }
            }

            // [v2.8] RT-B: 反思召回（重要度 Top-2）
            if (engine.config.config.reflectionEnabled && engine.reflection?.items?.length) {
                results.reflections = engine.reflection.search(2).map(r => ({ text: `洞察：${r.insight}${r.suggestion ? '（提示：' + r.suggestion + '）' : ''}`, source: 'reflection' }));
            }

            // [v1.7] RubyPhone 联动②: 手机记忆库作为一路召回源
            // [v3.48] P0 桥修复: queryPhoneMemory 是 v1.7 时代写错的方法名（bridge 只有 recall），守卫开关 rubyPhoneSync 也不存在（配置叫 rubyPhoneRecall）——三处断线导致手机召回通道从未生效
            if (engine.config.config.rubyPhoneRecall && typeof window !== "undefined" && window.VirtualPhone?.lonshaBridge) {
                try {
                    const _phoneQuery = window.VirtualPhone.lonshaBridge.queryPhoneMemory || window.VirtualPhone.lonshaBridge.recall.bind(window.VirtualPhone.lonshaBridge);
                    const phoneHits = await _phoneQuery(query.text, numOr(engine.config.config.rubyPhoneRecallTopN, 3));   // [v3.156] 0=不向手机库取记忆
                    /* [v3.291.0 · X4] 召回侧准入：手机召回结果进注入块前的**唯一门**。
                     *   修前实测：本处直接 map 成 [手机记忆·…] 注入，而「玩家使用行为」
                     *   （usage-tracker）与角色剧情记忆在该文本里**同形**，角色回复因此可能
                     *   引用「玩家点开了什么 App」这类作者面事实。现按来源建议可见性过滤：
                     *   player-only 一律不进角色面，并**分列**放行/挡掉两栏（不是静默丢弃）。
                     *   ★ 面缺席（旧版 / 模块未加载）时如实留痕并按原路径放行 —— 不静默当「已核对」。 */
                    const _faLib = _factAdmissionLib();
                    let _phoneKept = phoneHits;
                    if (phoneHits?.length && _faLib && typeof _faLib.filterRecallForCharacter === 'function') {
                        try {
                            const _fr = _faLib.filterRecallForCharacter(phoneHits.map((h) => Object.assign({}, h, { app: h.app || h.source || h.layer })));
                            _phoneKept = _fr.kept;
                            engine._lastFactAdmissionRecall = _fr;
                        } catch (e) { errLog(e, 'recallMemory.手机记忆准入过滤'); }
                    }
                    if (_phoneKept?.length) {
                        results.rubyphone = _phoneKept.map((h, i) => ({
                            // [v3.48] P0 字段对齐: bridge.recall 返回 {content, score, layer, floor}，旧映射期望 h.id/h.type  恒 undefined
                            id: 'phone_' + (h.id ?? (h.floor ?? 'i') + '_' + i),
                            text: `[手机记忆·${h.layer || h.type || '生活'}] ${h.content}`,
                            source: 'rubyphone',
                            importance: h.importance || 5,
                            score: h.score || 0.5
                        }));
                    }
                } catch (e) { errLog(e, 'recallMemory.手机记忆召回'); }
            }
            
            // [v2.4] RE: 在场分档——不在场已登场角色给极简档
            // [v3.91] 审计修复：门控键原为 presenceTier（无默认值，恒 undefined 导致功能死锁关闭），
            //         与 config/UI 声明的 presenceInjection 键名断裂。统一到 presenceInjection。
            if (engine.config.config.presenceInjection !== false) {
                const present = new Set(engine.captureCast());
                const allKnown = engine.getKnownCharacters();
                const absent = allKnown.filter(c => !present.has(c));
                if (absent.length) {
                    // [v3.91] 该路此前因键名断裂从未生效；启用后加候选上限，防角色库膨胀时单路灌满 RRF 融合池
                    const cap = Math.max(1, Number(engine.config.config.presenceMaxCandidates) || 8);
                    results.presence = absent.slice(0, cap).map(a => ({
                        character: a, text: `${a}（当前不在场）`, source: 'presence'
                    }));
                }
            }
            
            // [v2.2] RC: 悬念簿召回
            if (engine.config.config.suspenseEnabled && engine.suspense.items.length) {
                const openList = engine.suspense.openItems().slice(-3)
                    .map(x => ({ id: 'sus_' + x.id, text: `【待解决·悬念】${x.content}${x.createdTime ? ' (' + x.createdTime + ')' : ''}`, source: 'suspense', status: 'open' }));
                const resolvedList = engine.suspense.recentlyResolved(2)
                    .map(x => ({ id: 'sus_res_' + x.id, text: `【近期了结】${x.content} → ${x.resolution || '已解决'}`, source: 'suspense', status: x.status }));
                results.suspense = openList.concat(resolvedList);
            }
            
            // [v1.8] P0: POV 私密记忆召回
            if (engine.config.config.povIsolation && engine.pov.povs.length) {
                const present = engine.captureCast();
                const owners = present.length ? present : (typeof window !== "undefined" && window.SillyTavern?.getContext?.()?.name2 ? [window.SillyTavern.getContext().name2] : []);
                if (owners.length) {
                    results.pov = engine.pov.search(owners, engine.config.config.povMaxPerTurn || 3)
                        .map(p => ({id: p.id, owner: p.owner, text: p.content, floor: p.floor, source: 'pov'}));
                }
            }
            
            // [v3.30] PV: superseded 摘要排除
            if (typeof window !== "undefined" && window.LonShaSupersede && engine.config.config.supersedeEnabled && results.summary?.length) {
                try {
                    results.summary = results.summary.filter(item => {
                        const key = item.id || (item.source === 'summary' ? 'sum_' + item.floor : null);
                        return !(key && engine.supersede.isSuperseded(key));
                    })
                    .filter(i => !(i?.source === 'summary' && i?.archivedForSleep));  // [v3.47] 睡眠归档：低价值记忆不进入召回（存档中可查）
                } catch (e) { errLog(e, 'recallMemory.supersede过滤'); }
            }

            // [v3.38] 语义级休眠伏笔唤醒检测（TriviumDB 双区记忆理念）
            try {
                if (engine.summary?.awakenByEntities) {
                    const presentEntities = [...(query.characters || []), ...((results.items || []).map(i => i.name || ''))].filter(Boolean);
                    const awakened = engine.summary.awakenByEntities(presentEntities);
                    if (awakened?.length) {
                        for (const aw of awakened) {
                            results.summary.push({ id: 'sum_' + aw.floor, text: `【久别重现】${aw.text}`, floor: aw.floor, source: 'summary', awakened: true });
                        }
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.休眠唤醒'); }
            // [v3.234.0] 语义唤醒（与上一段实体名唤醒分工：那条管 dormant 标记、按名字逐字命中；
            //   本段管 archivedForSleep、按语义——有向量走余弦，无向量退字面共现）。两者互不顶替。
            //   纪律：plan 只算不写、apply 才翻标记；不删不重排；每条带 reason 与 score；
            //   缺库/畸形容器一律降级放行（不阻断召回主链路）。
            try {
                if (engine.config.config.sleepAwakenEnabled === true) {
                    const SA = _sleepAwakenLib();
                    if (SA && typeof SA.plan === 'function' && typeof SA.apply === 'function') {
                        const _pool = (engine.summary && engine.summary.summaries) ? engine.summary.summaries : [];
                        const _q = String(query && query.text ? query.text : '').trim();
                        let _r = null;
                        if (_pool.length && _q) {
                            _r = SA.plan({ summaries: _pool, queryText: _q });
                            if (_r && _r.ok === true && Array.isArray(_r.awakened) && _r.awakened.length) {
                                const _ap = SA.apply(_r, _pool);
                                if (_ap && _ap.applied) {
                                    for (const _id of (_ap.ids || [])) {
                                        const _s = _pool.find((x) => (x && (x.id || ('sum_' + x.floor))) === _id);
                                        if (_s && !results.summary.some((y) => y && y.floor === _s.floor && y.source === 'summary')) {
                                            results.summary.push({ id: 'sum_' + _s.floor, text: '【情景重现】' + _s.text, floor: _s.floor, source: 'summary', awakened: true });
                                        }
                                    }
                                }
                            }
                        }
                        engine._sleepAwakenSt = { at: Date.now(), result: _r, described: (typeof SA.describe === 'function' ? SA.describe(_r) : '') };
                    } else {
                        engine._sleepAwakenSt = { at: Date.now(), result: null, described: '模块缺席（降级放行）' };
                    }
                }
            } catch (e) { errLog(e, 'recallMemory.语义唤醒'); }
            
            // [v3.185] 条目关联的召回侧消费：按 query.text 扫同一份关联词表，命中的引用（摘要图键）
            //   在本轮落实召回时提权；开关关时**连扫描都不做**（零开销、零行为变化）。
            //   这里给的是「分值加成」而不是「换掉条目」——池子仍是原来那些条，只是名次可能前移。
            let _crosslinkBoostKeys = null;
            if (engine.config.config.crosslinkRecallBoost === true && engine._crosslinkIndex) {
                try {
                    if (typeof engine._crosslinkIndex.refsFor === 'function' && query.text) {
                        const _refs = engine._crosslinkIndex.refsFor(query.text);
                        const _keys = [];
                        for (const _r of _refs) { const _k = String(_r || ''); if (/^sum_\d+$/.test(_k)) _keys.push(_k); }
                        if (_keys.length) {
                            _crosslinkBoostKeys = new Set(_keys);
                            engine._crosslinkRefRanked = Number(engine._crosslinkRefRanked || 0) + 1;
                        }
                    }
                } catch (e) { errLog(e, 'recallMemory.crosslink提权'); }
            }
            // [v2.3] RD: 两阶段精排
            const merged = engine.hybridMerge(results);
            // [v3.185] 提权落点：hybridMerge 是「分数 + 排序」的唯一收口，故在它之后、rerank 之前追加小分。
            //   0.006 是「只动名次边界」的量级：不足以把一条低相关的条目抬进前排，
            //   但足以在同分/相邻名次上做出稳定区分。命中不到任何关联键时逐字节等同旧行为。
            if (_crosslinkBoostKeys && _crosslinkBoostKeys.size) {
                try {
                    for (const _it of merged) {
                        if (!_it) continue;
                        // 摘要条目的图键可能是 id / key，也可能只有 floor（任一命中即算命中）。
                        const _k1 = String(_it.id || _it.key || '');
                        const _k2 = (_it.floor == null) ? '' : ('sum_' + _it.floor);
                        if (_crosslinkBoostKeys.has(_k1) || (_k2 && _crosslinkBoostKeys.has(_k2))) {
                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;
                        }
                    }
                    merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
                } catch (e) { errLog(e, 'recallMemory.crosslink提权落位'); }
            }
            // [v3.186] 情绪反向召回的**召回侧消费**（缝合 memory-palace EMOTION_OPPOSITES 的机制；
            //   只取机制、不取它的注入口径——该库走 CHAT_COMPLETION_PROMPT_READY 向 chat 直推
            //   system 消息，本仓沿用 setExtensionPrompt 路线，那条路线不引入）。
            //   做法与 crosslinkRecallBoost 同族：命中键加固定小分（0.006，只动名次边界），
            //   不换条目、不写图、不删边；开关关时连词表扫描都不做（零开销、零行为变化）。
            //   与 crosslink 的分工：crosslink 答「正文提到了哪个**名字**」（实体锚），
            //   本机制答「当下的情绪指向哪一段**经历**」（情绪锚）——两者互不覆盖。
            let _emoOppositeKeys = null;
            // 每轮重置：否则上一轮名单粘住，账本会把「本轮没提权」算成「提权了上轮那几条」
            engine._emoOppositeMatched = null;   // null=机制没跑｜{}=跑了零提权｜{key:[dim]}=真提权
            if (engine.config.config.emotionOppositeRecall === true) {
                try {
                    const EL = _emotionOppositeLib();
                    if (EL && typeof EL.recallByOppositeEmotion === 'function') {
                        const _emoDocs = (engine.summary && typeof engine.summary.getActiveSummaries === 'function'
                            ? engine.summary.getActiveSummaries() : [])
                            .map(_s => ({
                                key: String(_s.key || _s.id || ('sum_' + (_s.floor == null ? '' : _s.floor))),
                                text: String(_s.text || '')
                            }))
                            .filter(_d => _d.key && _d.text);
                        const _er = EL.recallByOppositeEmotion({ queryText: query.text, docs: _emoDocs });
                        // [v3.200.0] 成本账本要回答「提权的那条进没进注入」。
                        //   promoted 的 key 是图键（sum_<floor>），注入文本只渲染摘要正文，
                        //   图键永不出现。这里把每条被提权摘要的正文片段带给账本，按片段匹配。
                        const _emoSnippets = {};
                        for (const _d of _emoDocs) if (_er.matched && _er.matched[_d.key]) {
                            const _snip = String(_d.text || '').trim().slice(0, 24);
                            if (_snip.length >= 4) _emoSnippets[_d.key] = _snip;
                        }
                        engine._emoOppositeSnippets = _emoSnippets;
                        engine._emoOppositeRead = {
                            reason: _er.reason, dominant: _er.dominant,
                            hits: (_er.opposite || []).length, scanned: _er.scanned,
                            // [v3.193.0] 成本与预算读数：本轮真提出的线索条数（hits）只是结果，
                            //   还要能回答「本来能提多少、被预算挡下多少」——否则候选膨胀看不见。
                            expanded: _er.expanded || 0, merged: _er.merged || 0, dimHits: _er.dimHits || {},
                            credibleWords: _er.credibleWords || 0, scopes: _er.scopes || {},
                            // 命中维名单（key → [dim,...]）：回答「这条为什么被提」。
                            // 成本账本靠它区分「提权了」与「提权后真进了注入」，缺了它只能报总条数。
                            matched: _er.matched || {}
                        };
                        // 「生效轮数」只在真扫过（reason==='ok'）时累加：否则「没有情绪词」也会被算成一轮，
                        // 读出来的轮数就不是「机制跑了多少轮」而是「召回跑了多少轮」。
                        if (_er.reason === 'ok') engine._emoOppositeRounds = Number(engine._emoOppositeRounds || 0) + 1;
                        engine._emoOppositeMatched = _er.matched || {};
                        if (_er.opposite && _er.opposite.length) _emoOppositeKeys = new Set(_er.opposite);
                    } else {
                        engine._emoOppositeRead = null;   // 模块缺席：不伪装成「无线索」，诊断行会报「模块未加载」
                    }
                } catch (e) { errLog(e, 'recallMemory.emotionOpposite'); }
            }
            if (_emoOppositeKeys && _emoOppositeKeys.size) {
                try {
                    for (const _it of merged) {
                        if (!_it) continue;
                        const _ek1 = String(_it.id || _it.key || '');
                        const _ek2 = (_it.floor == null) ? '' : ('sum_' + _it.floor);
                        if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {
                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;
                            engine._emoOppositeBoosted = Number(engine._emoOppositeBoosted || 0) + 1;
                        }
                    }
                    merged.sort((a, b) => (b.rrfScore || 0) - (a.rrfScore || 0));
                } catch (e) { errLog(e, 'recallMemory.emotionOpposite落位'); }
            }
            // [v3.48] P3: 本地意图分流重排（零 API 中间层，历史/物品/关系三路意图统一收敛）
            // [v3.185] 修：`queryText` 在此**从未声明**（它是下面 intentRerank 自己的形参名，不在本作用域）——
            //   本行此前恒抛 `ReferenceError: queryText is not defined`，被 onBeforeGeneration 外层的
            //   `catch (err) { return ''; }`（静默、零日志、无归因）吞掉 ⇒ **整轮记忆注入为空**：
            //   召回算了、图与摘要也读了，最后一步抛掉，模型收到的是空注入，而诊断面只显示「没注入」。
            //   实测（本轮）：把 recallMemory 原样取出、只注入 errLog/numOr 等自由名后真跑一次，
            //   debugMode 下稳定抛该错；把 `queryText` 也作为外部名注入桩值则不再抛。
            //   意图重排的入参就是查询文本，与 buildQuery 的既有口径一致（query.text）。
            // [v3.249.0] M-O1：重排结果**就地**落在 `finalMerged`（不另建数组），
            //   于是「收尾顺序 = 上游最后一次重排的顺序」这条语义对四条路径是同一份。
            const finalMerged = engine.intentRerank(merged, query.text);
            /* [v3.321.0 · M3-O1] 融合优化（语义重复抑制 / 角色事件覆盖 / 未结保底）。
             *   位置：**intentRerank 之后、_finalize 之前** —— 上游三条提权（crosslink /
             *   情绪反向 / 意图分流）都已落位完毕，这里改的是「最终名次」；
             *   放在它们之前会改到不存在的名次（v3185/v3186 锁的正是这个次序纪律）。
             *   就地改序（splice）而不是另建数组：`_finalize` 与精排段引用的是同一个
             *   `finalMerged`，换引用会让它们读到旧数组。 */
            try {
                if (engine.unifiedRecall && typeof engine.unifiedRecall.fuseCandidates === 'function') {
                    engine._fusionCarry = {};
                    /* 刻意**不传 budget**：注入预算的 owner 是既有注入面（它有自己的截断与账），
                     *   召回侧再截一次就是第二个预算真源。本面只改名次、不改条目数。 */
                    const _fused = engine.unifiedRecall.fuseCandidates(finalMerged, {
                        queryText: query.text
                    }, engine._fusionCarry);
                    if (Array.isArray(_fused)) finalMerged.splice(0, finalMerged.length, ..._fused);
                } else {
                    engine._fusionCarry = null;   /* 模块缺席：不伪装成「融合了 0 条」，诊断行会说 */
                }
            } catch (e) { errLog(e, 'recall.fuseCandidates'); engine._fusionCarry = null; }
            // [v3.249.0] M-O1 唯一收尾出口：LLM 精排成功不再提前 return（原因见 CHANGELOG）
            const _finalize = () => {
                if (engine.config.config.recallAuditEnabled) {
                    try {
                        const rec = engine._auditRecall(query, results, finalMerged);
                        if (rec) {
                            // 坏归因时能分辨「顺序是本地重排给的」还是「LLM 精排给的」
                            rec.rerankPath = String(engine._rerankPath || 'local');
                            rec.injectedIds = finalMerged.slice(0, 8).map(x => String((x && (x.id ?? x.key)) ?? '')).filter(Boolean);
                        }
                        if (rec && rec.floorHits) engine._recordFloorRecall(rec.floorHits, rec.vecHeatCount ? (results.vector || []).map(v => v && v.id).filter(Boolean) : null);
                    } catch (e) { errLog(e, 'recall.auditWire'); }
                }
                return finalMerged;
            };
            // [v3.48] P3: 本地意图分流重排已在上方完成——本块只负责可选的 LLM 精排。
            // [v3.249.0] M-O1 缺口二：此前精排成功即 `return [...picked, ...restSet, ...rest]` 离场，
            //   于是本地意图重排、召回审计、楼层记账三件事在那条路径上一次都没跑
            //   （实测：精排关闭 audit=1 / record=1 / intent=1；精排成功 audit=0 / record=0 / intent=0）。
            //   现在四条路径（成功 / 关闭 / 失败 / 回空值）都经 `_finalize()` 收口：只观测与记账，
            //   不再用自己的排序覆盖精排结果（顺序由上游那一次重排定）。
            if (engine.config.config.rerankEnabled && merged.length > 3 && query.text) {
                try {
                    const candN = engine.config.config.rerankCandidates || 12;
                    // 精排吃掉的是**已排好序**的名单，故前 candN 名 = 本地重排后的头部（语义与修前一致，
                    //   只是顺序来源换了；修前那里吃的是未做本地重排的 hybridMerge 结果）。
                    const candidates = finalMerged.slice(0, candN);
                    const rest = finalMerged.slice(candN);
                    // [v3.148] INTENT 优先作 rerank query（baibai: 意图一句话比原始剧情文本更贴评分语义）
                    const _rq = (engine.llm.getLastIntent?.() || query.text);
                    const order = await engine.llm.rerank(_rq, candidates);
                    if (order && order.length) {
                        const _pickedRaw = order.map(i => candidates[i]).filter(Boolean);
                        // 去重：order 里出现重复下标时，同一个候选不得在名单里出现两次
                        //   （本版首跑实测：order=[9,1,1] 会把名单撑成 5 条且 b 重复、d 掉队）。
                        const _seen = new Set(); const picked = [];
                        for (const c of _pickedRaw) if (!_seen.has(c)) { _seen.add(c); picked.push(c); }
                        const restSet = candidates.filter((_, i) => !order.includes(i));
                        const head = picked.concat(restSet);
                        // 长度守恒：order 里若有越界/重复，缺失位按原序补齐 —— 精排只换次第、不丢条目。
                        if (head.length < candidates.length) {
                            const _in = new Set(head);
                            for (const c of candidates) if (!_in.has(c)) head.push(c);
                        }
                        finalMerged.splice(0, candidates.length, ...head);
                        void rest;   // 尾随段原地不动（不在 splice 范围内）
                        engine._rerankPath = 'llm';
                        return _finalize();
                    }
                } catch (e) { if (engine.config.config.debugMode) console.warn(`[${PLUGIN_NAME}] rerank失败(降级):`, e); }
            }
            engine._rerankPath = 'local';
            return _finalize();
        }


    return {
        recallMemory: recallMemory,
        bindDeps: bindDeps
    };
}));
