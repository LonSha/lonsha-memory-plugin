/* ============================================================
 * engine-injection-pipeline.js — 上下文构建与提示词注入管线集群
 *
 * 剥离自 index.js，管理：
 *   1. 世界书占用与投影策略预估 (_worldbookOccupancy, _projectionPrediction, _projectionStrategyCompare)
 *   2. 跨模块桥接快照构建与导出 (buildBridgeSnapshot, buildBridgeSnapshotJson, _summarizeRecallAudit)
 *   3. 提示词注入全生命周期核心装配 (buildInjection, _injectionRecord, _injectionBlocksOf,
 *      _injectionStage, _injectionCommit, _injectionClose, _injectionEnd, _injectionRefOf,
 *      _injectionDiscardStale, _buildDiagnosticsInjection, buildInjectionReadout)
 *
 * 挂载于 window.LonShaEngineInjectionPipeline，支持 bindDeps 依赖注入。
 * ============================================================ */
'use strict';

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineInjectionPipeline = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {

    const VERSION = '3.369.0';
    let PLUGIN_NAME = 'LonSha记忆引擎';
    let _moduleLib = function (getter, fallback) {
        try {
            const v = getter();
            return v !== undefined && v !== null ? v : null;
        } catch (_) {
            return null;
        }
    };
    let errLog = function (e, ctx) {
        try {
            console.error('[LonShaInjectionPipeline] ' + (ctx ? ctx + ' ' : '') + (e && e.stack ? e.stack : e));
        } catch (_) {}
    };

    let numOr = function (v, fallback) {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    };

    let estimateTextTokens = function (text) {
        const s = String(text || '');
        if (!s) return 0;
        let cjk = 0;
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf) ||
                (code >= 0x3000 && code <= 0x303f) || (code >= 0xff00 && code <= 0xffef)) {
                cjk++;
            }
        }
        return Math.ceil(cjk * 0.7 + (s.length - cjk) * 0.35);
    };

    let relativeTimeLabel = function (eventTime, nowTime) {
        return '';
    };

    let buildNpcTierInjection = function (npcs) {
        return [];
    };

    let classifyRelationshipType = function (relation) {
        return 'other';
    };

    let _costForecastLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCostForecast : null), 'cost-forecast.js');
    };
    let _costLedgerLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCostLedger : null), 'cost-ledger.js');
    };
    let _injectionReceiptLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaInjectionReceipt : null), 'injection-receipt.js');
    };
    let _projectionLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaProjectionPipeline : null), 'projection-pipeline.js');
    };
    let _privyFenceLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaPrivySecurityFence : null), 'privy-clearance-security-fence.js');
    };
    let _chronologyAxisLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaUnifiedChronologyAxis : null), 'unified-chronology-axis-engine.js');
    };
    let _conflictArbitrationLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaConflictArbitration : null), 'conflict-group-arbitration-workbench.js');
    };
    let _autobiographicalLensLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaAutobiographicalLens : null), 'autobiographical-lens-narrative.js');
    };
    let _microAtmosphereLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaMicroAtmosphere : null), 'micro-atmosphere-residual-tracker.js');
    };
    let _attentionPrimingLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaAttentionPriming : null), 'attention-priming-verification-anchor.js');
    };
    let _budgetReceiptLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaBudgetAllocationReceipt : null), 'transparent-budget-allocation-receipt.js');
    };
    let _cognitiveInertiaLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCognitiveInertia : null), 'cognitive-inertia-damping-dynamics.js');
    };
    let _retinalAttentionLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaRetinalAttention : null), 'retinal-attention-steering-arranger.js');
    };
    let _confrontationWorkbenchLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaConfrontationWorkbench : null), 'cross-examination-confrontation-workbench.js');
    };
    let _subconsciousEngineLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSubconsciousEngine : null), 'subconscious-undercurrent-engine.js');
    };
    let _espionageTheaterLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaEspionageTheater : null), 'double-identity-espionage-theater.js');
    };
    let _relationHistoryLib = function () {
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaRelationHistory : null), 'relation-history.js');
    };

    function bindDeps(deps) {
        if (!deps || typeof deps !== 'object') return;
        if (deps.VERSION) VERSION = deps.VERSION;
        if (deps.PLUGIN_NAME) PLUGIN_NAME = deps.PLUGIN_NAME;
        if (typeof deps._moduleLib === 'function') _moduleLib = deps._moduleLib;
        if (typeof deps.errLog === 'function') errLog = deps.errLog;
        if (typeof deps.numOr === 'function') numOr = deps.numOr;
        if (typeof deps.estimateTextTokens === 'function') estimateTextTokens = deps.estimateTextTokens;
        if (typeof deps.relativeTimeLabel === 'function') relativeTimeLabel = deps.relativeTimeLabel;
        if (typeof deps.buildNpcTierInjection === 'function') buildNpcTierInjection = deps.buildNpcTierInjection;
        if (typeof deps.classifyRelationshipType === 'function') classifyRelationshipType = deps.classifyRelationshipType;
        if (typeof deps._costForecastLib === 'function') _costForecastLib = deps._costForecastLib;
        if (typeof deps._costLedgerLib === 'function') _costLedgerLib = deps._costLedgerLib;
        if (typeof deps._injectionReceiptLib === 'function') _injectionReceiptLib = deps._injectionReceiptLib;
        if (typeof deps._projectionLib === 'function') _projectionLib = deps._projectionLib;
        if (typeof deps._relationHistoryLib === 'function') _relationHistoryLib = deps._relationHistoryLib;
    }

    class LonShaInjectionPipeline {
        /**
         * [v3.270.0 · B2/X1] 世界书占用读数（宿主侧取数，**只读**，不注入）。
         *
         * 取数通道（本轮实测）：SillyTavern.getContext().lore 是宿主给扩展的世界书条目数组
         *   （全库仅两处真入口，另一处是 extractRolesFromLore 的角色提取）。
         *
         * ★ 口径是本方法最要紧的部分（取错就会算出一个「看着正常、实际夸大」的占用）：
         *   · chars        —— 只算 **enabled && constant===true** 的条目。理由：这局部是
         *      **无需关键词命中、每轮必进提示词**的部分，也是真正吃预算的那一类
         *      （「一堆常驻世界书把记忆预算吃光」正是本轮要治的形态）。
         *   · upperChars   —— 全库启用条目之和（**上限**）。非 constant 条目要不要进，
         *      取决于激活引擎的关键词匹配，而那个引擎在宿主/世界书扩展里，**不在本插件可观测面内**
         *      （buildInjection 对宿主最终请求体的既有自述就是「不在可观测面内 ⇒ 不可测」）。
         *      故它只作上限，**不得拿去当实际占用算挤占**。
         *   · known:false  —— 取不到（无宿主上下文 / 无 lore 通道 / 取数抛错）⇒ 占用**未知**，
         *      三个量全 null 且**不写 0**。
         *      「读不到」与「零占用」同形，会让用户看到「世界书不占空间」这种假读数。
         *
         * @returns {object} { known, reason, source, count, enabledCount, constantCount, chars, upperChars }
         */
        _worldbookOccupancy() {
            const unk = (reason) => ({ known: false, reason: reason, source: null, count: null,
                enabledCount: null, constantCount: null, chars: null, upperChars: null });
            try {
                const ctx = (typeof window !== 'undefined' && window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
                    ? window.SillyTavern.getContext() : null;
                if (!ctx) return unk('no-host-context');
                const lore = ctx.lore;
                if (!Array.isArray(lore)) return unk('no-lore-channel');
                let chars = 0, upperChars = 0, enabledCount = 0, constantCount = 0;
                for (const e of lore) {
                    if (!e || e.enabled === false || e.disable === true) continue;
                    enabledCount++;
                    const c = String(e.content || '').length;
                    upperChars += c;
                    if (e.constant === true) { constantCount++; chars += c; }
                }
                return {
                    known: true, reason: 'ok', source: 'SillyTavern.getContext().lore',
                    count: lore.length, enabledCount: enabledCount, constantCount: constantCount,
                    chars: chars,           // ★ 确定进提示词的占用（enabled && constant）
                    upperChars: upperChars, // 全库启用上限（不得当实际占用）
                };
            } catch (e) { errLog(e, 'plugin._worldbookOccupancy'); return unk('threw:' + String((e && e.message) || e)); }
        }
        /**
         * [v3.270.0 · B2/X1] 投影出口的**注入容量预演**（只读，不注入、不改任何状态）。
         *
         * 记忆候选面从**真注入路径的读数**取（`_lastInjectionDraft` 的逐块字符数）：
         *   不另算一遍「候选块该有多大」—— 那会与真路径漂移，而本仓最忌「同一事实两个真源」。
         * 宿主还没跑过注入（草稿为空）⇒ items=null ⇒ memory.known=false，**不写 0**。
         * 不可测一律 null + reason：模块缺席 / 世界书读不到 / 未跑过注入 三种情形分别归因。
         * @returns {object|null} 预演读数；模块缺席时为 null（＝「没跑」，不是「占用为零」）
         */
        _projectionPrediction() {
            try {
                const P = _projectionLib();
                if (!P || typeof P.predictInjection !== 'function') return null;
                // 预算输入与 buildInjection 的取值点**同源**（同一批配置键、同一个推导模块）
                const _ir = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
                const cfg = (this.config && this.config.config) ? this.config.config : {};
                const chatLength = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
                const draft = Array.isArray(this._lastInjectionDraft) ? this._lastInjectionDraft : null;
                const items = draft ? draft.filter((b) => b && Number(b.chars) > 0).map((b) => ({
                    id: b.id, label: b.label, chars: Number(b.chars) || 0,
                    // 常驻口径与 buildInjection 同一真源（RESIDENT_MARKERS），不自立一套
                    resident: (typeof RESIDENT_MARKERS !== 'undefined')
                        ? RESIDENT_MARKERS.some((m) => String(b.label || '').startsWith(m)) : false,
                })) : null;
                return P.predictInjection({
                    items: items,
                    baseBudget: cfg.injectionBudget || 3000,
                    tokenBudget: Number(cfg.memoryTokenBudget) || 0,
                    reserve: numOr(cfg.keepRecentTokenReserve, 0),
                    chatLength: chatLength,
                    adaptive: cfg.adaptiveBudget,
                    decayFloors: cfg.adaptiveBudgetDecayFloors,
                    router: _ir,
                    worldbook: this._worldbookOccupancy(),
                    strategy: cfg.budgetStrategy || 'balanced',
                    now: Date.now(),
                });
            } catch (e) { errLog(e, 'plugin._projectionPrediction'); return null; }
        }
        /**
         * [v3.289.0 · X3] 投影出口的**注入策略对照**（只读，不注入、不改配置、不写账）。
         *
         * 【与 _projectionPrediction 的关系（重要 · 单一真源纪律）】
         *   本函数**不另取候选、不另算预算**：候选面与预算输入全部走 `_projectionPrediction()`
         *   同一批真读数口径（`_lastInjectionDraft` 逐块字符数 / 同一批配置键 / 同一个
         *   `injection-router`）。对照只是把**同一份输入**喂给多套 plan 再比读数 ——
         *   若这里自己再算一遍「候选该多大」，就成了同一事实两个真源（本仓最忌）。
         *
         * 【来源可信度自述（原文要求 exact / constant-only / unknown）】
         *   宿主是**唯一**知道「世界书占用是怎么来的」的地方：`_worldbookOccupancy()`
         *   返回的 `enabledCount/constantCount` 决定了候选里有没有真激活条目。
         *      · 只拿得到常驻（`constantCount > 0` 且 `enabledCount === constantCount`）
         *        ⇒ `constant-only`（触发项不可知，对照范围有限）；
         *      · 两者不等 ⇒ 有触发项但**未取到激活明细** ⇒ `unknown`（不冒充 exact）；
         *      · 全库为空（`count === 0`）⇒ `exact`（空库是**明确的**空，不是未知）。
         *   三档只影响读数与范围自述，**不影响预算复算**。
         *
         * @param {Array}  plans 方案数组（由设置面/诊断面传入；缺省给三套常用档）
         * @returns {object|null} 对照读数；模块缺席时为 null（＝「没跑」，不是「没差异」）
         */
        _projectionStrategyCompare(plans) {
            try {
                const P = _projectionLib();
                if (!P || typeof P.compareStrategies !== 'function') return null;
                const pred = this._projectionPrediction();
                /* 预演都不可测 ⇒ 对照无从谈起：如实返回 null（＝没跑），不伪造一份空对照。 */
                if (!pred || pred.measurable !== true) return null;
                const cfg = (this.config && this.config.config) ? this.config.config : {};
                const wb = this._worldbookOccupancy();
                const wbKnown = !!(wb && wb.known === true);
                const itemsSource = !wbKnown ? { kind: 'unknown', note: '世界书占用读不到（' + String((wb && wb.reason) || 'n/a') + '）' }
                    : (Number(wb.count) === 0 ? { kind: 'dryrun', note: '全库为空（明确的空，非未知）' }
                        : (Number(wb.enabledCount) > 0 && Number(wb.enabledCount) === Number(wb.constantCount)
                            ? { kind: 'constant', note: '仅取到常驻条目（enabled=' + wb.enabledCount + '，与 constant 相等）⇒ 触发项不可知' }
                            : { kind: 'unknown', note: '有触发项但未取到激活明细（enabled=' + wb.enabledCount + ' / constant=' + wb.constantCount + '）' }));
                /* 候选块与 _projectionPrediction 同源（同一批 draft 读数、同一条常驻口径）。 */
                const draft = Array.isArray(this._lastInjectionDraft) ? this._lastInjectionDraft : null;
                const items = draft ? draft.filter((b) => b && Number(b.chars) > 0).map((b) => ({
                    id: b.id, label: b.label, chars: Number(b.chars) || 0,
                    resident: (typeof RESIDENT_MARKERS !== 'undefined')
                        ? RESIDENT_MARKERS.some((m) => String(b.label || '').startsWith(m)) : false,
                })) : null;
                if (!items) return null;
                const _ir = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                    || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
                const chatLength = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
                const cur = Number(cfg.injectionBudget) || 3000;
                const planList = Array.isArray(plans) && plans.length ? plans : [
                    { id: 'cur', label: '当前配置', baseBudget: cur },
                    { id: 'tight', label: '收紧（-600）', baseBudget: Math.max(300, cur - 600) },
                    { id: 'loose', label: '放宽（+600）', baseBudget: cur + 600 },
                ];
                return P.compareStrategies({
                    items: items,
                    itemsSource: itemsSource,
                    plans: planList,
                    baseBudget: cur,
                    tokenBudget: Number(cfg.memoryTokenBudget) || 0,
                    reserve: numOr(cfg.keepRecentTokenReserve, 0),
                    chatLength: chatLength,
                    adaptive: cfg.adaptiveBudget,
                    decayFloors: cfg.adaptiveBudgetDecayFloors,
                    router: _ir,
                    worldbook: wb,
                    strategy: cfg.budgetStrategy || 'balanced',
                    now: Date.now(),
                });
            } catch (e) { errLog(e, 'plugin._projectionStrategyCompare'); return null; }
        }
        buildBridgeSnapshot() {
            try {
                // [v3.174 B] **undefined 必须被保住**，不得走 JSON 回退把它变成 null：
                //   `JSON.stringify(undefined) === undefined`，round-trip 后成 null，
                //   于是「源里没有这项」又被伪装成「有这项、值是空」——三态塌回两态，
                //   读者仍然无从归因（这正是 R2「null 三义同形」的根）。
                //   结构化克隆可用时原样保留；不可用时也如实回 undefined（字段缺席）。
                const deep = (v) => {
                    if (v === undefined) return undefined;
                    try { return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v)); }
                    catch (e) { try { return JSON.parse(JSON.stringify(v)); } catch (e2) { return null; } }
                };
                const floor = (window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1;
                // [v3.174] 桥的读者契约面 B：**字段类型三态**。此前 `deep()` 的 JSON 回退路径
                //   会把 undefined 变成 null（`JSON.stringify(undefined) === undefined`，
                //   round-trip 后成 null）。读者拿到的 null 于是有两个来源——源字段本来就是
                //   null，或源字段是 undefined/不可序列化被吞成 null——**两者同形，无从分辨**。
                //   现在每个顶层字段带 {present, kind} 进 snapshot.meta.fieldTypes：
                //     present=false ⇒ 源字段不存在/undefined（读者应视作「没有这项」）
                //     kind='null'   ⇒ 源字段显式是 null（读者应视作「有这项、值是空」）
                //   值本体照旧（渲染契约零破坏，读数只加字段）。
                const typeOf = (v) => {
                    if (v === undefined) return 'undefined';
                    if (v === null) return 'null';
                    if (Array.isArray(v)) return 'array';
                    return typeof v;
                };
                const fieldTypes = (obj) => {
                    const out = {};
                    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
                    for (const k of Object.keys(obj)) {
                        const t = typeOf(obj[k]);
                        out[k] = { present: t !== 'undefined', kind: t };
                    }
                    return out;
                };
                // [v3.174 B] **如实报在场**：旧写法每个字段都带 `|| {}` / `|| null` 兜底，
                //   于是「引擎压根没有这项」与「有这项、值是空」在快照里完全同形——
                //   fieldTypes.present 永远为 true，三态里两态是空的，这份「类型读数」就是摆设。
                //   现在先取**原样值**（宿主没这项即 undefined），deep 之后直接落进快照：
                //     present=false ⇒ 源里没有这项（读者应视作「没有」，而不是「空」）
                //     present=true  ⇒ 源里给了这项（kind='null' 才表示「给了，但是空」）
                //   容灾要求不变：字段缺失只让该字段缺席，不得连坐 floor / bridge / version 等自述字段。
                const rawProt = (this.status && typeof this.status.getProtagonist === 'function') ? this.status.getProtagonist() : undefined;
                const rawLife = (this.status && Array.isArray(this.status.lifeDetails)) ? this.status.lifeDetails.filter(d => d && d.tier !== 'archive') : undefined;
                const rawChars = (this.status && this.status.characters && typeof this.status.characters === 'object') ? this.status.characters : undefined;
                const rawMoney = (this.moneyLedger && typeof this.moneyLedger.export === 'function') ? this.moneyLedger.export() : undefined;
                const rawOutline = (this.outline && typeof this.outline.export === 'function') ? this.outline.export() : undefined;
                const rawWorld = (this.worldProg && typeof this.worldProg.export === 'function') ? this.worldProg.export() : undefined;
                const rawClock = (this.clock && typeof this.clock.export === 'function') ? this.clock.export() : undefined;
                // [v3.151] 召回自检摘要（外供手机端织光机「最常回望的时光」维度；只读、深拷贝）
                //   typeof 守卫：本方法被单测「提取执行」模式（v388 bridge 专项）复用时无 this 宿主，
                //   缺失该方法不得连坐整张快照（缺失即 present=false，其余字段照常外供）。
                const rawRecall = (typeof this._summarizeRecallAudit === 'function') ? this._summarizeRecallAudit() : undefined;
                // [v3.176] 世界账本对读读数（本插件**读到的推演侧世界**，含未外供缺口 + 人物位置对读结果）。
                //   外供出去的意义：手机端能读到「记忆插件眼里的世界长什么样」，形成三方对读闭环——
                //   而 defect 形态（缺口/位置冲突）不再只存在于记忆插件的诊断面里。
                const rawLedgerRead = (this.clock && this.clock._worldLedgerRead && typeof this.clock._worldLedgerRead === 'object')
                    ? this.clock._worldLedgerRead : undefined;
                // [v3.181] SG：场所图景对读读数（本插件**看到的场所世界**：当前位置链/在场名单/
                //   到访读数/覆盖度/不变量状态）。外供的意义与 worldLedgerRead 同构——手机端与
                //   推演侧能读到「记忆插件眼里的场所长什么样」，形成三方对读，而「树断了/谁在哪
                //   对不上」不再只存在于本插件的诊断面里。
                //   只读 + 有界：summary() 已是纯数据（Map 已转数组），deep() 只做克隆。
                const rawScene = (this.scene && typeof this.scene.summary === 'function')
                    ? this.scene.summary() : undefined;
                // [v3.213.0] R1-C：投影 envelope 的**导出期新鲜度守卫**（「归属」而不是「时刻」）。
                //   修前实测：`_lastProjectionEnvelope` 的归属（conversationId + revision）只在
                //   `readWorldLedger()` 写它的那一刻成立。切聊只换 chatId、回滚/恢复只递增
                //   `_mutationEpoch`，两条路径都**不清缓存** ⇒ 快照于是把**旧会话/旧代数**的投影
                //   当作当下的读数导出。下游拿到的是一份看起来正常、归属却错了的状态（本仓最贵
                //   的那类错读数：不报错、只错结果）。
                //   为什么不是「顺手更新一下时间戳」：`generatedAt` 记的是**封装生成时刻**，不携带
                //   归属。宿主没重跑管线时，旧缓存依然是「最新生成」的那一份 —— 改时间戳等于把陈旧
                //   内容**伪装**成新鲜（掩盖而非消除）；且时间戳与 `_mutationEpoch` 无耦合，识别不出
                //   回滚/切聊造成的状态跳变。只有比对「会话 + 代数」才能保证导出与当前状态同代。
                //   三态处置：同代 ⇒ 照常导出；不符 ⇒ 不导出（`projection` 缺席 ⇒ 自述 present=false），
                //   原因留在 `this._projectionDropped` 与 `snap.meta.projectionFreshness`（扔掉了要说出来，
                //   「扔掉了」与「本来就没这面」必须可分）；取不到 chatId（宿主无该方法 / 「提取执行」
                //   模式的独立实例）⇒ **放行**：拿不到判据不等于证伪，原契约（照常导出）不变。
                const freshProjectionFace = (() => {
                    const env = this._lastProjectionEnvelope;
                    if (!env) { this._projectionDropped = null; return undefined; }
                    let nowChatId;
                    try { nowChatId = (typeof this.getCurrentChatId === 'function') ? (this.getCurrentChatId() ?? undefined) : undefined; }
                    catch (_e3) { nowChatId = undefined; }
                    if (nowChatId === undefined) { this._projectionDropped = null; return env; }
                    const envChat = (env.conversationId === undefined || env.conversationId === null) ? '' : String(env.conversationId);
                    const envRev = Number(env.revision) || 0;
                    const nowRev = Number(this._mutationEpoch) || 0;
                    if (String(envChat || '') !== String(nowChatId || '')) {
                        this._projectionDropped = { reason: 'stale-conversation', from: envChat || null, to: String(nowChatId || ''), at: Date.now() };
                        return undefined;
                    }
                    if (envRev !== nowRev) {
                        this._projectionDropped = { reason: 'stale-revision', from: envRev, to: nowRev, at: Date.now() };
                        return undefined;
                    }
                    this._projectionDropped = null;
                    return env;
                })();
                const snap = {
                    version: 1,
                    bridge: 'lonsha_memory_bridge_v1',
                    pluginVersion: VERSION,
                    floor,
                    exportedAt: Date.now(),
                    protagonist: deep(rawProt),
                    lifeDetails: deep(rawLife),
                    characters: deep(rawChars),
                    moneyLedger: deep(rawMoney),
                    outline: deep(rawOutline),
                    worldProg: deep(rawWorld),
                    clock: deep(rawClock),
                    recallAudit: deep(rawRecall),
                    worldLedgerRead: deep(rawLedgerRead),
                    scene: deep(rawScene),
                    // [v3.212.0] L-F5：本插件侧账本的**对外投影**（stable projection API）。
                    //   为什么进快照：它与 worldLedgerRead / scene 同族——都是「本插件眼里的
                    //   某样东西」，下游要能读到；且进快照就自动获得 meta.fieldTypes 三态
                    //   （present=false ⇒ 本版没这面；present=true + kind='null' ⇒ 跑过但没装成），
                    //   不需要另开一套自述通道。
                    //   取值器：取本轮已由 readWorldLedger() 刷新的缓存；**不在这里现跑管线**
                    //   —— buildBridgeSnapshot 会被经 `.default` 取出的独立实例调用（无 this 账本），
                    //   现跑会静默拿到全空投影并把「没跑」伪装成「都是空」。
                    //   取不到即 undefined ⇒ present=false（如实报「本版没这面」）。
                    projection: deep(freshProjectionFace || undefined),
                    // [v3.214.0] R1-E：九账证据工作台读数（只读对账面）。
                    //   为什么进快照：它与 worldLedgerRead / scene / projection 同族——都是
                    //   「本插件眼里的某样东西」，下游要能读到；且进快照就自动获得
                    //   meta.fieldTypes 三态（present=false ⇒ 本版没这面）。
                    //   取值器：`_evidenceWorkbench()` 从**九账既有状态**现投影（纯读，不写账）。
                    //   typeof 守卫：本方法会被单测「提取执行」模式的独立实例复用，缺失即
                    //   present=false（如实报「没这面」），不得连坐 floor / bridge / version 等自述字段。
                    //   三态在内核里已分（ok / empty / absent + reason），快照只负责搬运。
                    // [v3.215.0] R2-A：**最终实际注入**读数（只读）。
                    //   为什么进快照：它是「AI 这一轮究竟看到了什么」的唯一对外答案。
                    //   修前：约定/伏笔/回扣/回声各有 render()，但快照字段里**注入面一个都没有**
                    //   —— 下游只能看到「账本里有什么」，看不到「这一轮真的送进去的是哪几块」，
                    //   也看不到「哪几块被预算裁掉了」。两者是相反的问题，压成一态就会
                    //   把「被裁了」误读成「本来就没有」。
                    //   取值器：buildInjectionReadout()（纯读，不写账）；typeof 守卫：本方法被
                    //   单测「提取执行」模式的独立实例复用时，缺失即 present=false（如实报「没这面」），
                    //   不连坐 floor / bridge / version 等自述字段。
                    injection: deep((typeof this.buildInjectionReadout === 'function') ? this.buildInjectionReadout() : undefined),
                    evidence: deep((typeof this._evidenceWorkbench === 'function') ? this._evidenceWorkbench() : undefined),
                    // [v3.233.0] F-2：事件**来源构成**（跨平台对照的**结构化**读数）。
                    //   为什么必须结构化、不能只给上面证据面里的那行 detail 文本：
                    //   让下游去解析显示字符串，就是「同一口径抄 N 份」的种子（本仓治理过多轮）；
                    //   下游要的是数字，不是一句人话。
                    //   三态（本仓纪律，缺一态就是错读数）：
                    //     meta.fieldTypes.eventPlatforms.present === false ⇒ 插件太旧（本版没这面）
                    //     present + reason='no-events'                     ⇒ 这版有面、但还没有事件线（真读数）
                    //     present + reason='ok'                            ⇒ 有构成可读
                    //   reason 另可出 'module-unavailable' / 'thrown'（都不是「空」）。
                    //   只给构成、不给判断：不含可信度 / 优先级 / 「哪个平台更重要」这类字段。
                    eventPlatforms: deep((typeof this._eventPlatformsFace === 'function') ? this._eventPlatformsFace() : undefined)
                };
                // [v3.174] 快照自述：宿主存盘前要能先判「这份快照多大、能不能直接序列化」。
                //   此前读者只能自己试着 stringify 一遍、再从失败里反推——而字符串化失败与
                //   「快照本来就是空对象」同形。故把两个判定前置成字段：
                //     selfBytes    —— **负载**字节数＝JSON.stringify(不含 meta 的快照).length
                //                    （刻意不含 meta 自身：自述里若含自己的字节数就会自指漂移——
                //                     填进去后长度又变，读者永远读到一个偏小的值。
                //                     0 表示负载根本无法序列化。）
                //     strictJsonOk —— 是否可被 JSON.stringify（false 时给出 strictJsonError）
                //     contract     —— 本快照由哪版契约产出（读者可据此判新旧）
                try {
                    const json = JSON.stringify(snap);
                    snap.meta = {
                        fieldTypes: fieldTypes(snap),
                        selfBytes: typeof json === 'string' ? json.length : 0,
                        strictJsonOk: typeof json === 'string',
                        contract: 'v3.174',
                        // [v3.213.0] R1-C：被新鲜度守卫扣下的投影必须**可归因**。
                        //   `projection` 缺席（present=false）有两种来源：本版没这面 / 有面但归属不同代。
                        //   两者处置相反（前者等上游升级，后者等宿主重跑），压成一态就是错读数。
                        projectionFreshness: (() => {
                            try {
                                const d = this._projectionDropped;
                                if (!d || typeof d !== 'object') return null;
                                return { dropped: true, reason: String(d.reason || 'unknown'), from: (d.from === undefined ? null : d.from), to: (d.to === undefined ? null : d.to) };
                            } catch (_e4) { return null; }
                        })()
                    };
                } catch (e2) {
                    snap.meta = { fieldTypes: {}, selfBytes: 0, strictJsonOk: false, strictJsonError: String((e2 && e2.message) || e2), contract: 'v3.174', projectionFreshness: null };
                }
                return snap;
            } catch (e) { errLog(e, 'buildBridgeSnapshot'); return null; }
        }
        /** [v3.174] 严格 JSON 出口：宿主把快照存盘/跨端传输时用。
         *  与 snapshot 本体分开——本体保持对象（渲染契约），出口给字符串（序列化契约）。
         *  契约：**要么给出可 JSON.parse 的字符串，要么给出 {ok:false, error}**，
         *  绝不返回空串（空串会让读者以为「存成功了，只是内容是空的」）。
         *  也不抛（入口契约与 snapshot 同规格）。 */
        buildBridgeSnapshotJson() {
            try {
                const snap = this.buildBridgeSnapshot();
                if (!snap) return { ok: false, error: 'no-snapshot', json: null, bytes: 0 };
                const json = JSON.stringify(snap);
                if (typeof json !== 'string' || !json) return { ok: false, error: 'serialize-empty', json: null, bytes: 0 };
                return { ok: true, error: null, json, bytes: json.length };
            } catch (e) {
                return { ok: false, error: String((e && e.message) || e), json: null, bytes: 0 };
            }
        }
        /* [v3.151] 召回自检摘要（v3.150 A 账本的对外只读投影）。
         * 把 _recallAudit 环形账本（每轮 查询/命中分布/空结果/楼层命中）压成
         * 轻量摘要：轮数 / 空结果轮数 / 平均命中 / 最常被回望的楼层 Top10 / 末轮查询。
         * 纯读，不改写账本；供 window.lonsha_memory_bridge_v1.snapshot.recallAudit 外供。 */
        _summarizeRecallAudit() {
            const EMPTY = { rounds: 0, emptyRounds: 0, avgHits: 0, hotFloors: [], lastQuery: '', lastTs: 0 };
            try {
                const ra = Array.isArray(this._recallAudit) ? this._recallAudit : [];
                const n = ra.length;
                if (!n) return EMPTY;
                let emptyRounds = 0, hits = 0;
                const hot = new Map();
                for (const r of ra) {
                    if (!r) continue;
                    if (r.empty) emptyRounds++;
                    hits += Number(r.totalHits) || 0;
                    const fh = r.floorHits || {};
                    for (const k of Object.keys(fh)) {
                        const f = Number(k);
                        if (!Number.isFinite(f) || f < 0) continue;
                        hot.set(f, (hot.get(f) || 0) + (Number(fh[k]) || 0));
                    }
                }
                const hotFloors = [...hot.entries()]
                    .map(([floor, count]) => ({ floor, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);
                const last = ra[n - 1] || {};
                return {
                    rounds: n,
                    emptyRounds,
                    avgHits: Number((hits / n).toFixed(2)),
                    hotFloors,
                    lastQuery: String(last.queryText || '').slice(0, 80),
                    lastTs: Number(last.ts) || 0
                };
            } catch (e) { errLog(e, 'summarizeRecallAudit'); return EMPTY; }
        }
        // [v1.5] 注入格式（抄 baibai 私密简报包裹 + HCDiary 分区结构）
        buildInjection(recalled) {
            // [v3.215.0] R2-A：本轮逐块读数草稿**无条件归零**（含空召回早返回路径）。
            //   修前：读数由调用方在 `if (inj2)` 里写，于是「本轮 0 块」与「本轮还没跑」
            //   在读数上同形（`total` 停在上一轮）。现在每次进入 buildInjection 先清空，
            //   出块时再填 —— 零块路径天然留下「空草稿」，而不是上一轮的残留。
            //   ★ 必须在早返回**之前**清：「本轮召回为空」正是 0 块的主要来源，
            //     若清空写在早返回后面，这条路径反而成了唯一漏网的那条。
            this._lastInjectionDraft = null;
            /* [v3.251.0] M-O3：本轮**构建过程回执草稿**（同生命期、同归零纪律）。
             *   为什么必须与 `_lastInjectionDraft` 一样在早返回**之前**归零：
             *   回执回答「本轮各阶段的计数与裁剪事实」，若残留上一轮的值，
             *   那么「本轮召回为空」就会带着上一轮的 kept/stages 一起被读出去 ——
             *   正是 R2-A 治过的「同形」在回执面的翻版。 */
            this._injectionTraceDraft = null;
            // [L10-O7] 私密知情权安全围栏硬过滤
            try {
                const Fence = _privyFenceLib();
                if (Fence && typeof Fence.filterMemoriesForSpeaker === 'function' && this._currentSpeaker) {
                    const userCircles = this._currentUserCircles || [];
                    recalled = Fence.filterMemoriesForSpeaker(recalled, this._currentSpeaker, userCircles);
                }
            } catch (e) { errLog(e, 'buildInjection.privyFence'); }
            if (!recalled?.length) return '';
            const NOTE = '〔记忆系统私密简报｜仅你可见〕以下内容帮助保持剧情连贯;严禁在回复正文中复述、罗列或提及本节内容。';
            const END = '〔私密简报结束〕请像一个已读过前情的叙述者那样自然续写,不要复述简报本身。';
            
            // 分区：剧情摘要 / 角色关系 / 角色日记 / 手机记忆（抄 HCDiary 的分类注入）
            // [v3.114] 路由决策移入可测纯函数 injection-router.partitionRecalled（模块缺失时回落本体内联 if-else）
            const summaries = [], relations = [], diaries = [], phoneMem = [], timelines = [], povs = [], volumes = [], bm25Hits = [], statuses = [], holidays = [], suspenses = [], itemRecs = [], itemStoredRecs = [], reflectRecs = [], neuralChains = [], worldProgs = [], dedupNotes = [], treeNotes = [];
            const _irPart = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
            if (_irPart) {
                const _bk = _irPart.partitionRecalled(recalled, { maxItems: this.config.config.vectorTopK * 2 });
                worldProgs.push(..._bk.worldProgs); neuralChains.push(..._bk.neuralChains);
                itemRecs.push(..._bk.itemRecs); itemStoredRecs.push(..._bk.itemStoredRecs);
                reflectRecs.push(..._bk.reflectRecs); statuses.push(..._bk.statuses);
                suspenses.push(..._bk.suspenses); holidays.push(..._bk.holidays);
                volumes.push(..._bk.volumes); bm25Hits.push(..._bk.bm25Hits);
                povs.push(..._bk.povs); timelines.push(..._bk.timelines);
                phoneMem.push(..._bk.phoneMem); diaries.push(..._bk.diaries);
                relations.push(..._bk.relations); treeNotes.push(..._bk.treeNotes);
                dedupNotes.push(..._bk.dedupNotes); summaries.push(..._bk.summaries);
            } else {
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'worldprogress') worldProgs.push(item);
                else if (item.source === 'neuralChain') neuralChains.push(item);
                else if (item.source === 'items') itemRecs.push(item);
                else if (item.source === 'items_stored' || item.source?.includes('items_stored')) itemStoredRecs.push(item);
                else if (item.source === 'reflection') reflectRecs.push(item);
                else if (item.source === 'status') statuses.push(item);
                else if (item.source === 'suspense') suspenses.push(item);
                else if (item.source?.includes('holiday')) holidays.push(item);
                else if (item.source?.includes('volume')) volumes.push(item);
                else if (item.source === 'bm25') bm25Hits.push(item);
                else if (item.source?.includes('pov')) povs.push(item);
                else if (item.source?.includes('timeline')) timelines.push(item);
                else if (item.source?.includes('rubyphone')) phoneMem.push(item);
                else if (item.source?.includes('diary')) diaries.push(item);
                else if (item.source?.includes('graph')) relations.push(item);
                else if (item.source === 'memoryTree') treeNotes.push(item);
                else if (item.source === 'dedup') dedupNotes.push(item);
                else summaries.push(item);
            }
            }   // [v3.114] 闭合 else 分支
            
            const blocks = [];
            /* [v3.251.0] M-O3：**拼装现场归因记账**（必须在回执草稿建立之前就开始记）。
             *   为什么不能等到裁剪后再记：块是**渲染后的文本**，「这块是哪来的」这个信息
             *   只在 push 的那一刻存在于局部变量里；等到裁剪回执那一层，源归属早已丢失
             *   （cost-ledger 只能靠「分节继承」猜节名，正是这个丢失的下游补偿）。
             *   这里只记**计数**（谁贡献了几块），不记内容、不参与任何决策：
             *     · 回执在裁剪前才建草稿（那时才有 budget / strategy），故本处先用两个局部
             *       容器收着，等草稿建立时并入 —— 不提前建草稿是为了不动既有回归基线。
             *     · 有开关的源**无论开关开合都落一个键**（闸门关 ⇒ 0），于是
             *       「某源被禁用 ⇒ 它贡献 0 块」是一条可在回执上直接断言的判据，
             *       而不是事后从块文本反推（M-O3 第 ⑦ 条）。 */
            const _srcBlocks = {};
            const _stageCnt = { relationGated: null, povOffstage: null, povScoped: false, relationScoped: false };
            const _countSource = (key, n) => {
                const _n = Number(n);
                _srcBlocks[key] = (_srcBlocks[key] || 0) + (Number.isFinite(_n) && _n > 0 ? Math.floor(_n) : 0);
            };
            /* [v3.251.0] M-O3 第 ⑦ 条的**单一真源**：召回侧开关表。
             *   修前这张表只在下方的 cost-ledger 调用处**就地写死一份**（10 键），
             *   若回执再抄一份，就是本仓点名的「同一事实两个真源」——
             *   两处迟早漂移，而漂移的表现恰好是「禁用项仍被报成有注入」。
             *   故提到拼装之前建一次：拼装侧按它开闸/计数，账本侧原样读同一对象。
             *   键面与语义**一字不改**（保持既有诊断行「禁用 N 源」的读数不变）。 */
            const _srcGate = {
                emotionOppositeRecall: this.config.config.emotionOppositeRecall === true,
                vector: this.config.config.vectorEnabled !== false,
                cse: this.config.config.cseEnabled !== false,
                scene: this.config.config.sceneEnabled !== false,
                suspense: this.config.config.suspenseEnabled !== false,
                worldProgress: this.config.config.worldProgressEnabled !== false,
                lockedFacts: this.config.config.lockedFactsEnabled !== false,
                timeTagAnchor: this.config.config.timeTagAnchorEnabled !== false,
                itemLedger: this.config.config.itemLedgerEnabled !== false,
                narrativePulse: this.config.config.narrativePulseEnabled !== false,
            };
            /* 有注入期**自有块**的源（构建期能真判「它贡献了几块」）与没有的，必须分开记：
             *   本插件的块是从**召回候选池**融合渲染出来的：`vector` / `suspense` / `worldProgress`
             *   这些源在**召回**侧生效，禁用它们的效果是「候选池里少几条」，而不是
             *   「渲染时少几个块」—— 在构建期把它们拆成「谁贡献了几块」是**做不到的**，
             *   硬拆只会得到一份看起来精确、实则编造的归属表。
             *   故：自有块的源逐一记数（禁用 ⇒ 恒 0，可断言）；融合源记在 `fused`
             *   并指向召回侧读数（`recallPerSource`），不假装构建期可分。 */
            const _OWNED_SOURCES = ['lockedFacts', 'cse', 'narrativePulse', 'scene', 'npcTier', 'typedFacts', 'protagonist', 'npcTies'];
            const _FUSED_SOURCES = ['vector', 'suspense', 'worldProgress', 'timeTagAnchor', 'itemLedger', 'emotionOppositeRecall'];
            // ===== A. 静态锚定前缀区 (Static Cache Anchor Zone - Prompt Cache Guard) =====
            // [v3.46] 宏观世界线·纪元史记 (Grand Chronicle)
            if (this.summary?.getGrandChroniclePrompt) {
                const grandText = this.summary.getGrandChroniclePrompt();
                if (grandText) blocks.push(grandText);
            }
            // [v3.62] 用户锁定事实（dsh lockedFacts）：逐字进静态锚定区，最高优先级事实保护
            if (this.config.config.lockedFactsEnabled !== false) {
                const lfText = this.summary?.lockedFactsForPrompt?.(this.config.config.lockedFactMaxChars);
                if (lfText) blocks.push('[用户锁定剧情事实]\n' + lfText);
                _countSource('lockedFacts', lfText ? 1 : 0);
            } else {
                // 闸门关也必须落键并记 0（M-O3 ⑦）：不落键的话，「这个源被禁用 ⇒ 它贡献 0 块」
                //   在回执上就查不到，只能落进账本的「未参与核对」——那是把可判的事实弄成不可判。
                _countSource('lockedFacts', 0);
            }
            // [v3.45] 吸收 baibai: 主角客观档案与生活习惯癖好追踪
            if (this.config.config.protagonistTracking !== false) {
                // [v3.148] 传入当前剧情日期（age 锚点推算用；时间跳跃自动长岁）
                const proPrompt = this.status?.getProtagonistPrompt?.(this.clock?.date || this.getLatestStoryDate?.() || '');
                const lifePrompt = this.status?.getLifeDetailsPrompt?.(5) || [];
                if (proPrompt || lifePrompt.length) {
                    blocks.push('[主角当前客观状态与生活习惯]');
                    if (proPrompt) blocks.push(`- ${proPrompt}`);
                    if (lifePrompt.length) blocks.push(...lifePrompt);
                    _countSource('protagonist', 1 + (proPrompt ? 1 : 0) + lifePrompt.length);
                }
            }
            // [v3.45] 吸收 baibai: 跨空间角色长期人伦社会羁绊网（稳定字典序排序）
            if (this.config.config.npcTiesInjection !== false) {
                const tiesText = this.getNpcTiesPrompt?.();
                if (tiesText) {
                    blocks.push(tiesText);
                }
                _countSource('npcTies', tiesText ? 1 : 0);
            }
            // [v3.94] CSE 级人物状态引擎注入（分层呈现+toward+可见性+待证标注）
            if (this.config.config.cseEnabled !== false) {
                try {
                    const cseText = this.cse?.toPrompt?.(null, { includePrivate: true, maxStates: 10 });
                    if (cseText) blocks.push(cseText);
                    _countSource('cse', cseText ? 1 : 0);
                } catch (e) { errLog(e, 'buildInjection.cse'); }
            } else { _countSource('cse', 0); }
            // [v3.95] 叙事心电图注入（原创：节奏自反提示，仅在连续高压/平淡时输出，避免每轮噪音）
            if (this.config.config.narrativePulseEnabled !== false) {
                try {
                    // [v3.156] 角色弧光接真源。此前恒传 []：toPrompt 的弧光板块要求
                    //   opts.characters 非空且该角色已积累 >=3 拍极性轨迹，空数组使
                    //   「[角色弧光·阶段参考]」永不产出——beat() 侧记录了轨迹却没人读。
                    //   真源与 beat() 同源：captureCast()（最近 8 楼窗口，上限 5 人）。
                    const _pulseCast = this.captureCast();
                    const pulseText = this.pulse?.toPrompt?.({ characters: _pulseCast });
                    if (pulseText) blocks.push(pulseText);
                    _countSource('narrativePulse', pulseText ? 1 : 0);
                } catch (e) { errLog(e, 'buildInjection.叙事心电图'); }
            } else { _countSource('narrativePulse', 0); }
            if (this.config.config.npcTierInjection !== false) {
                const npcTierLines = buildNpcTierInjection(this.buildNpcTierRecords());
                if (npcTierLines.length) {
                    blocks.push('[角色索引·分级注入]');
                    blocks.push(...npcTierLines);
                }
                _countSource('npcTier', npcTierLines.length ? 1 + npcTierLines.length : 0);
            } else { _countSource('npcTier', 0); }

            // ===== B. 动态易变尾部区 (Volatile Dynamic Zone) =====
            // [v3.211] 类型化事实入注入：消费 memory-type.js 的 routeForType / typedBuckets / policyOfType。
            //   修前实测：这三个出口在全仓**零调用点** —— 类型系统把事实分了九类、每类定了可见性与
            //   生命周期，但注入管线里一个类型化块都没有，于是「世界规则」「事件结果」「叙事线索」
            //   这些类型只活在 selfCheck 诊断行里，**从不进模型上下文**（功能级失效的典型）。
            //   稳定块（permanent/long）首行是 RESIDENT_MARKERS 的 `[类型化事实·长期]` ⇒ 落常驻分区、
            //   每轮必注；波动块（medium/short/dynamic）走触发分区、随预算裁剪。
            //   两块**分开 push**、不合并：合成一块后要么短生命周期的场景事实被当成常驻每轮灌进去，
            //   要么长期世界规则跟一次性的场景事实一起被裁掉（正是本仓三态纪律禁止的那种压缩）。
            try {
                const _tf = (typeof this.typedFactsBlocks === 'function') ? this.typedFactsBlocks() : null;
                if (_tf && _tf.stable) blocks.push(_tf.stable);
                if (_tf && _tf.volatile) blocks.push(_tf.volatile);
                _countSource('typedFacts', (_tf && _tf.stable ? 1 : 0) + (_tf && _tf.volatile ? 1 : 0));
            } catch (e) { errLog(e, 'buildInjection.typedFacts'); _countSource('typedFacts', 0); }
            // [v3.91] 审计修复：setGeoLocation 从 LLM geo_location 抽取并写入，getGeoLocation 被召回路径消费，
            //         但 getGeoPrompt 从未进入注入（数据空转）。位置会随剧情变化，故放动态区而非静态锚定。
            try {
                const geoPrompt = this.status?.getGeoPrompt?.();
                if (geoPrompt) blocks.push(geoPrompt);
            } catch (e) { errLog(e, 'buildInjection.geoPrompt'); }
            // [v3.46] 吸收 Bakemono: 当前剧情时钟与回忆隔离
            const clockPrompt = this.clock?.getContextPrompt?.();
            if (clockPrompt) {
                blocks.push(clockPrompt);
            }
            if (volumes.length) {
                blocks.push('[早前剧情概括·卷]');
                const seenV = new Set();
                volumes.forEach(i => {
                    const key = i.text || '';
                    if (seenV.has(key)) return;
                    seenV.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (summaries.length) {
                blocks.push('[前情摘要]');
                // [v3.201] D2: 摘要注入加相对时间前缀（与 timeline 注入同规格：宁可不标，绝不标错）
                const _relOn = this.config.config.relativeTime !== false;
                const _anchorDate = this.clock?.date || this.getLatestStoryDate?.() || '';
                summaries.forEach(i => {
                    const _rel = (_relOn && i.storyTime && _anchorDate)
                        ? relativeTimeLabel(i.storyTime, _anchorDate) : '';
                    blocks.push(`- ${i.text || i.summary || i.name || ''}${_rel ? '（' + _rel + '）' : ''}`);
                });
            }
            if (bm25Hits.length) {
                const seenB = new Set((summaries.length ? summaries : []).map(x => x.text));
                const fresh = bm25Hits.filter(b => !seenB.has(b.text));
                if (fresh.length) {
                    blocks.push('[相关片段·关键词命中]');
                    fresh.forEach(i => blocks.push(`- ${i.text || ''}`));
                }
            }
            if (statuses.length) {
                blocks.push('[角色状态]');
                statuses.forEach(s => {
                    const fieldText = (s.fields || []).map(([k, v]) => `${k}:${v}`).join(' | ');
                    const todoText = (s.todos || []).length ? `；待办: ${s.todos.map(t => (t.date ? `${t.date} ` : '') + t.text).join('、')}` : '';
                    // [v3.180] 年龄三态读数（与主角同规格）：算得出给数字/约数，算不出给「原文(锚点时)」，
                    //   而不是像修前那样只把它当普通状态字段原样透出（读者分不清「准」与「猜」）。
                    const ageText = s.age ? ` | 年龄:${s.age}` : '';
                    blocks.push(`- ${s.name}${fieldText ? ' — ' + fieldText : ''}${ageText}${todoText}`);
                });
            }
            if (relations.length) {
                // [v3.184] 关系披露收口（relation-disclosure.js，移植 nocturne_memory 的 edge disclosure）。
                //   修前：关系边一旦写入就**永久无条件**参与注入——不看当前剧情走到哪里。
                //   长线里的实测后果：每轮固定带上若干当期毫无用处的关系（某条「暗恋」在两条线
                //   各走各的二十楼里仍然每轮出现），挤占 token 且稀释真正相关的那几行。
                //   现在：带 disclosure 的边按当前情境判条件，未触发的本轮不进注入。
                //   **仍在图里、仍在召回池里**——情境对了下一轮照常出现（转瞬过滤，不是永久降级）。
                const _RD = _moduleLib(() => window.LonShaRelationDisclosure, 'relation-disclosure.js');
                let _relKept = relations, _rdRead = null;
                if (_RD && typeof _RD.partition === 'function') {
                    const _pt = _RD.partition(relations, this._lastCtxText || '', { enabled: this.config.config.relationDisclosureEnabled !== false });
                    _relKept = _pt.kept;
                    _rdRead = { enabled: _pt.enabled, counts: _pt.counts, ctxEmpty: _pt.ctxEmpty };
                    // 被跳过的那几条也要可查（有界 5 条）：否则「这条关系为什么没出现」无从回答。
                    this._relationGated = _pt.gated.slice(0, 5).map(g => `${g.from}→${g.to}(${g.label || '相关'})`);
                } else {
                    // 模块缺席：不静默化成「全部跳过」（那是数据损失），如实记为缺席并原样放行。
                    this._relationGated = [];
                    _rdRead = { moduleMissing: true };
                }
                this._relationDisclosureRead = _rdRead;
                if (_rdRead && _rdRead.counts && Number.isFinite(_rdRead.counts.gated)) {
                    _stageCnt.relationGated = _rdRead.counts.gated;   // 有效的「挡下几条」，可测
                } else {
                    // 模块缺席 / 读数缺失 ⇒ 如实 null（不写 0：0 是「测到了，一条都没挡」）
                    _stageCnt.relationGated = null;
                }
                _stageCnt.relationScoped = true;   // 关系面本轮参与过构建（判据据此知道这一格为何有值）
                /* [v3.219.0] R2-F：**双向关系对账**（relation-mutual.js）——单向主观边要能看出「对侧在不在」，
                 *   收两份输入（图里全量边 + 本轮真进注入的那批）；只读、不抛、不改边。 */
                let _mutualRead = null;
                try {
                    const _RM = _moduleLib(() => window.LonShaRelationMutual, 'relation-mutual.js');
                    if (_RM && typeof _RM.reconcile === 'function') {
                        const _allEdges = [...(this.graph?.edges?.values?.() || [])].slice(0, 200);
                        _mutualRead = _RM.reconcile(_allEdges, _relKept, { maxList: 5 });
                    } else {
                        // 模块缺席：如实记为缺席（不静默当成「都对上了」——那是假读数）。
                        _mutualRead = { moduleMissing: true };
                    }
                } catch (e) { errLog(e, 'buildInjection.双向对账'); _mutualRead = { degraded: true }; }
                this._relationMutualRead = _mutualRead;
                /* [v3.323.0 · M3-X2] **真调用点**：本轮边集算一次变化史（逐侧保留、不合成单一好感值）。
                 *   为什么放在这里而不是只等诊断面来问：M3-X2 的收益是「用户问『为何从信任变成怀疑』
                 *   答得出来」，而那一刻手边必须已有真读数 —— 诊断面按需算，会让用户问的时候
                 *   才知道算不算得动。只读、不抛；算不出来如实记，不影响本轮注入（关系块照旧注入）。 */
                try {
                const _RH = _relationHistoryLib();
                this._relationHistoryRead = (_RH && typeof _RH.build === 'function')
                ? Object.assign({}, _RH.build([...(this.graph?.edges?.values?.() || [])], {}), { ok: true })
                : { ok: false, reason: 'module-unavailable' };
                } catch (e) { errLog(e, 'buildInjection.关系变化史'); this._relationHistoryRead = { ok: false, reason: 'thrown' }; }
                if (_relKept.length) {
                blocks.push('[角色关系]');
                const CLS_CN = { family: '血缘', intimate: '亲密', hostile: '敌对', social: '社交', other: '其他' };
                const _RM2 = _moduleLib(() => window.LonShaRelationMutual, 'relation-mutual.js');
                _relKept.forEach(i => {
                    const att = i.data?.attitude === 'positive' ? '友好' : i.data?.attitude === 'negative' ? '排斥' : '中立';
                    const fromName = this.graph.nodes.get(i.from)?.name || i.from || i.name;
                    const toName = this.graph.nodes.get(i.to)?.name || i.to || '';
                    const histNote = (i.active === false && i.validTo != null) ? `（曾于第${i.validTo}楼前）` : '';
                    const cls = i.data?.relClass || classifyRelationshipType(i.label);
                    /* 只对「对侧压根不在图里」标注：被挡下/已失效两态标了反而误导
                     *   （前者是此刻不该给模型看，标注等于把它又说了出来）。 */
                    const _mu = (_RM2 && typeof _RM2.annotate === 'function') ? _RM2.annotate(i, _mutualRead) : '';
                    blocks.push(`- ${fromName} → ${toName}：${i.label || '相关'}[${att}·${CLS_CN[cls] || '其他'}]${histNote}${_mu}`);
                });
                }
            }
            // [v3.185] 条目关联的注入侧消费：本楼正文同时提到了某条已确认关系的两端 ⇒ 并列一行可提项。
            //   为什么不直接写边：见 _crosslinkConsumePair 的立论。这一行是**对关系块的再收窄**
            //   （关系块按披露条件过滤，这里再筛出「本轮正文真的用到了」的那一条）；
            //   没有可提项时整行不出现——不占 token、也不给模型任何暗示。
            if (this._crosslinkConsume) {
                const _xc = this._crosslinkConsume;
                blocks.push(`〔本轮可提关联｜本楼正文同时出现了「${_xc.from}」与「${_xc.to}」：若剧情确实推进了这层关系，可按（${_xc.label}）据实更新；不要凭空新增别的关系〕`);
            }
            // [v3.45] 吸收 baibai: 近期已了结/已作废事项防复读注入
            const recentDone = this.suspense?.getRecentlyResolvedPrompt?.(3) || [];
            if (recentDone.length) {
                blocks.push('[近期已了结事项·切勿重复执行或提及]');
                blocks.push(...recentDone);
            }
            // [v3.37] Prompt Cache 友好优化：活跃阶段周记随底层动态槽注入
            if (this.config.config.cacheFriendlyInjection !== false && this.summary.getActiveVolumes) {
                const activeVols = this.summary.getActiveVolumes().slice(-2);
                if (activeVols.length) {
                    blocks.push('[阶段进展·周记]');
                    activeVols.forEach(v => blocks.push(`- （第${v.floorStart}-${v.floorEnd}楼）${v.text}`));
                }
            }
            if (treeNotes.length) {
                // [v3.28] 记忆树路由召回（st-memory-wizzard）
                blocks.push('[记忆树·角色关联]');
                treeNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (diaries.length) {
                blocks.push('[角色日记·近期]（第一人称心声，仅作内心参考，不得在对话中直接引用原文）');
                diaries.forEach(i => blocks.push(`- ${i.name || i.character || ''}（${i.floor != null ? '第' + i.floor + '楼' : ''}${i.mood ? '·' + i.mood : ''}）：${i.text || i.entry || ''}${i.secret ? ' ｜未说出口: ' + i.secret : ''}${i.attitude ? ' ｜对用户态度: ' + i.attitude : ''}${Array.isArray(i.keyEvents) && i.keyEvents.length ? ' ｜亲历要事: ' + i.keyEvents.join('；') : ''}${Array.isArray(i.subjRelations) && i.subjRelations.length ? ' ｜主观关系印象: ' + i.subjRelations.join('；') : ''}`));
            }
            // [v3.47] 钱财账本 + 剧情卡牌注入（hcdiary 吸收）
            if (this.moneyLedger) {
                const moneyPrompt = this.moneyLedger.toPrompt();
                if (moneyPrompt) blocks.push(moneyPrompt);
            }
            if (this.cards) {
                const cardsPrompt = this.cards.toPrompt();
                if (cardsPrompt) blocks.push(cardsPrompt);
            }
            if (this.conflicts) {
                const conflictPrompt = this.conflicts.toPrompt();
                if (conflictPrompt) blocks.push(conflictPrompt);
            }
            // [v3.66] 正史增量注入（established/uncertain 分状态展示）
            if (this.deltaBook) {
                const deltaPrompt = this.deltaBook.toPrompt();
                if (deltaPrompt) blocks.push(deltaPrompt);
            }
            // [v3.48] P1: 大纲导演注入（导演视角：本轮目标+节奏）
            if (this.outline) {
                const outlinePrompt = this.outline.toPrompt();
                if (outlinePrompt) blocks.push(outlinePrompt);
            }
            // [v3.49] P5: 群像共同记忆注入（只注入在场角色相关的关系对）
            if (this.pairMem) {
                const pairPrompt = this.pairMem.toPrompt(extracted?.characters || this.captureCast());
                if (pairPrompt) blocks.push(pairPrompt);
            }
            if (timelines.length) {
                // [v3.32] chronicle timeline tiering (Visual-Memory highlightThreshold idea): key events >=7 top block, rest as list
                const tlKey = timelines.filter(i => (i.importance || 5) >= 7);
                const tlRest = timelines.filter(i => (i.importance || 5) < 7);
                if (tlKey.length) {
                    blocks.push("[关键事件·影响当前]");
                    const seenK = new Set();
                    tlKey.forEach(i => {
                        const key = i.text || "";
                        if (seenK.has(key)) return;
                        seenK.add(key);
                        // [v3.71] A2: 相对时间前缀（柏宝书 timeRel 理念：宁可不标，绝不标错）
                        const rel = i.storyTime ? relativeTimeLabel(i.storyTime, this.clock?.date || '') : '';
                        blocks.push(`- ${key}${rel ? '（' + rel + '）' : ''}`);
                    });
                }
                if (tlRest.length) {
                    blocks.push("[剧情时间线]");
                    const seen = new Set();
                    tlRest.forEach(i => {
                        const key = i.text || "";
                        if (seen.has(key)) return;
                        seen.add(key);
                        // [v3.71] A2: 相对时间前缀
                        const rel = i.storyTime ? relativeTimeLabel(i.storyTime, this.clock?.date || '') : '';
                        blocks.push(`- ${key}${rel ? '（' + rel + '）' : ''}`);
                    });
                }
            }
            if (dedupNotes.length) {
                // [v3.23] 跨调用去重提示（NE-Memory）: 标记上轮已覆盖项，防连续追问复读
                blocks.push('[已覆盖记忆·防复读]');
                dedupNotes.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (povs.length) {
                const present = this.captureCast();
                const presentSet = new Set(present.map(p => this.resolveCharacterName(p)));
                // [v3.46] 视界隔离与全知禁令：当前有在场角色时，滤除不在场角色的私密心声防隔空读心透视
                const validPovs = (present.length > 0)
                    ? povs.filter(p => !p.owner || presentSet.has(this.resolveCharacterName(p.owner)))
                    : povs;
                /* [v3.251.0] M-O3 第 ③ 条：有效性过滤的**第二支**（视界隔离挡下的心声条数）。
                 *   与关系披露同一形态：这是**构建期真发生的一次有效性过滤**，
                 *   修前它只在「块有没有出现」上留痕（整段消失），没有任何一格说「挡下了几条」。
                 *   仅在**真做了过滤**时给数（present.length > 0）；没有在场角色时不筛，
                 *   那一格记 null（不写 0 —— 0 是「筛了，一条都没挡」）。 */
                if (present.length > 0) _stageCnt.povOffstage = Math.max(0, povs.length - validPovs.length);
                _stageCnt.povScoped = true;
                if (validPovs.length) {
                    const who = present.length ? present.join('、') : '当前角色';
                    blocks.push(`〔全知禁令与私密视界｜仅${who}知晓，其他角色绝不知情，严禁未卜先知或在对话动作中直接戳破〕`);
                    validPovs.forEach(i => blocks.push(`- ${i.owner}：${i.text || ''}`));
                }
            }
            if (phoneMem.length) {
                blocks.push('[手机生活记忆]');
                phoneMem.forEach(i => blocks.push(`- ${i.text || i.content || ''}`));
            }
            const scenesList = [], presenceList = [];
            for (const item of recalled.slice(0, this.config.config.vectorTopK * 2)) {
                if (item.source === 'scene') scenesList.push(item);
                else if (item.source === 'presence') presenceList.push(item);
            }
            if (itemRecs.length) {
                blocks.push(itemStoredRecs.length ? '[物品台账·在场/随身]' : '[物品台账]');
                itemRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (itemStoredRecs.length) {
                blocks.push('[物品台账·他处寄存]（注意：以下物品存放于其他地点或未随身携带，角色当前不可随手隔空取出）');
                itemStoredRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (reflectRecs.length) {
                blocks.push('[高层洞察]（长线关系趋势/线索，供叙事参考不作事实）');
                reflectRecs.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (this.config.config.sceneEnabled) {
                try {
                    let _sceneN = 0;
                    const cur = this.scene.currentKey();
                    if (cur) {
                        const chain = this.scene.chainOf(cur);
                        if (chain.length) {
                            blocks.push('[当前场景]');
                            const line = chain.map(n => n.path[n.path.length - 1] + (n.desc ? `（${n.desc}）` : '')).join(' › ');
                            blocks.push(`- ${line}`);
                            _sceneN += 2;
                        }
                    }
                    // [v3.195] 场景头只读本楼。没有就不出行，不回退到别的楼。
                    const _hdrFloor = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
                    const _hdr = _hdrFloor > 0 && this.scene.headerLine ? this.scene.headerLine(_hdrFloor - 1) : '';
                    if (_hdr) { blocks.push(_hdr); _sceneN += 1; }
                    _countSource('scene', _sceneN);   // sceneEnabled 关 ⇒ 整块不进 ⇒ 恒 0
                } catch (e) { errLog(e, 'buildInjection.场景链'); _countSource('scene', 0); }
            } else { _countSource('scene', 0); }
            if (scenesList.length) {
                blocks.push('[相关地点]');
                scenesList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (neuralChains.length) {
                blocks.push('[关系记忆·神经链]（链1用户→角色 / 链2角色↔角色）');
                const seenN = new Set();
                neuralChains.forEach(i => { const key = i.text || ''; if (!seenN.has(key)) { seenN.add(key); blocks.push(`- ${key}`); } });
            }
            if (worldProgs.length) {
                blocks.push('〔场外角色动态｜他们已各自行动，可自然成为后续话题〕');
                const seenW = new Set();
                worldProgs.forEach(i => { const key = i.text || ''; if (!seenW.has(key)) { seenW.add(key); blocks.push(`- ${key}`); } });
            }
            if (presenceList.length) {
                blocks.push('〔不在场角色｜未经剧情发展不得让他们凭空出现或立即知晓场内发生的事〕');
                presenceList.forEach(i => blocks.push(`- ${i.text || ''}`));
            }
            if (suspenses.length) {
                blocks.push('[悬念簿]');
                const seenS = new Set();
                suspenses.forEach(i => {
                    const key = i.text || '';
                    if (seenS.has(key)) return;
                    seenS.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            if (holidays.length) {
                blocks.push(`〔剧情时间临近 ${holidays[0].holiday}｜氛围提示，可自然融入但不强求〕`);
                const seenH = new Set();
                holidays.forEach(i => {
                    const key = i.text || '';
                    if (seenH.has(key)) return;
                    seenH.add(key);
                    blocks.push(`- ${key}`);
                });
            }
            
            // [L10-O3 & L10-O2 & L10-X4 & L10-X1 & L10-X2 & L10-O5] 第十期认知增强块注入
            try {
                // 真实动态感知与供给当前发言者、时间与上下文（消除幽灵守卫）
                if (!this._currentSpeaker) {
                    const ctx = (typeof window !== "undefined" && window.SillyTavern?.getContext?.()) || {};
                    this._currentSpeaker = (recalled && recalled.characters && recalled.characters[0]) || ctx.name2 || '对方';
                }
                if (!this._currentStoryTime) {
                    this._currentStoryTime = (typeof this.getLatestStoryDate === 'function' && this.getLatestStoryDate()) || this.clock?.date || '当前时刻';
                }
                if (!this._currentAtmosphereResidual && recalled && recalled.length) {
                    // 从最新召回内容中动态感知微观氛围
                    const topText = recalled.slice(0, 3).map(r => r.text || '').join(' ');
                    this._currentAtmosphereResidual = {
                        tension: /紧张|危险|压抑|警惕|冷漠/.test(topText) ? 0.8 : 0.3,
                        tenderness: /温柔|关切|拥抱|微笑|爱/.test(topText) ? 0.8 : 0.2,
                        floor: (typeof this.getCurrentFloor === 'function' ? this.getCurrentFloor() : 1)
                    };
                }
                if (!this._primingFocusFacts && recalled && recalled.length) {
                    // 取排序前 2 的高置信度事实作为注意力预热锚点
                    this._primingFocusFacts = recalled.slice(0, 2).map(r => r.text || '').filter(Boolean);
                }

                // 1. O3 双时间时钟轴说明
                const Chrono = _chronologyAxisLib();
                if (Chrono && typeof Chrono.projectChronologySnapshot === 'function' && this._currentStoryTime) {
                    const snap = Chrono.projectChronologySnapshot(this._chronologyItems || [], this._currentStoryTime);
                    const cp = Chrono.formatChronologyPrompt(snap);
                    if (cp) blocks.push(cp);
                }
                // 2. O2 冲突裁决约束注入
                const Arb = _conflictArbitrationLib();
                if (Arb && typeof Arb.formatArbitrationPrompt === 'function' && this._activeArbitrationRecord) {
                    const ap = Arb.formatArbitrationPrompt(this._activeArbitrationRecord);
                    if (ap) blocks.push(ap);
                }
                // 3. X4 自传透镜主观重构
                const Lens = _autobiographicalLensLib();
                if (Lens && typeof Lens.reframeFactThroughLens === 'function') {
                    const activeLens = this._activeLens || 'DEFENSIVE_PRIDE';
                    const keyFacts = this._keyFactStatements || (recalled ? recalled.slice(0, 2).map(r => r.text || '') : []);
                    for (const kf of keyFacts) {
                        const ref = Lens.reframeFactThroughLens(kf, activeLens);
                        if (ref && ref.reframedNarrative) blocks.push('〔内心独白透镜〕' + ref.reframedNarrative);
                    }
                }
                // 4. X1 微观氛围残差
                const Atmo = _microAtmosphereLib();
                if (Atmo && typeof Atmo.attachAtmosphereToRecall === 'function' && this._currentAtmosphereResidual) {
                    const atmoBlock = Atmo.attachAtmosphereToRecall(this._currentAtmosphereResidual, this._currentSpeaker || '对方');
                    if (atmoBlock) blocks.push(atmoBlock);
                }
                // 5. X2 注意力预热锚点插桩
                const Prime = _attentionPrimingLib();
                if (Prime && typeof Prime.buildPrimingAnchors === 'function' && this._primingFocusFacts && this._primingFocusFacts.length) {
                    const pAnchors = Prime.buildPrimingAnchors(this._primingFocusFacts);
                    this._currentPrimingAnchors = pAnchors;
                    const pp = Prime.formatPrimingPrompt(pAnchors.anchors || pAnchors);
                    if (pp) blocks.unshift(pp); // 前置潜意识置顶
                }

                // [L11-O1] 心理阻尼与心理摩擦力 (真实动态感知好感与摩擦力)
                const Inertia = _cognitiveInertiaLib();
                if (Inertia && typeof Inertia.applyDampingStep === 'function') {
                    if (!this._currentAttitudeDynamics) {
                        this._currentAttitudeDynamics = {
                            currentIntimacy: 50,
                            frictionCoefficient: 0.75,
                            dampingFactor: 0.8
                        };
                    }
                    const userMsgText = (typeof this.getLastUserMessageText === 'function' ? this.getLastUserMessageText() : '') || '';
                    const isAffectionate = /(?:喜欢|爱|相信|抱|亲|乖|听话|陪我)/.test(userMsgText);
                    const stimulus = this._attitudeStimulus || {
                        valence: isAffectionate ? 0.85 : 0.5,
                        intensity: isAffectionate ? 0.7 : 0.3
                    };
                    const mass = Inertia.computePsychologicalMass(this._characterProfile || { pride: 0.8, traumaDepth: 0.6 }, this._traumaEvents || []);
                    const dRes = Inertia.applyDampingStep(this._currentAttitudeDynamics, stimulus, mass);
                    if (dRes && dRes.promptDirective) {
                        blocks.push(dRes.promptDirective);
                    }
                }
                // [L11-O7] 虚假指控与证据对质 (真实检测用户质疑与矛盾)
                const CrossExam = _confrontationWorkbenchLib();
                if (CrossExam && typeof CrossExam.buildConfrontationChain === 'function') {
                    const userMsgText = (typeof this.getLastUserMessageText === 'function' ? this.getLastUserMessageText() : '') || '';
                    if (!this._allegedClaim && /(?:不是|没有|根本没|分明|撒谎|骗人|明明)/.test(userMsgText)) {
                        this._allegedClaim = userMsgText.slice(0, 100);
                    }
                    if (this._allegedClaim) {
                        const cRes = CrossExam.buildConfrontationChain(this._allegedClaim, recalled || []);
                        if (cRes && cRes.hasContradiction && cRes.guidancePrompt) {
                            blocks.push(cRes.guidancePrompt);
                        }
                    }
                }
                // [L11-X1] 潜意识暗涌流 (真实推演内心动机与表层防御)
                const Subconscious = _subconsciousEngineLib();
                if (Subconscious && typeof Subconscious.deduceUndercurrent === 'function') {
                    if (!this._observedDialogue) {
                        const userMsgText = (typeof this.getLastUserMessageText === 'function' ? this.getLastUserMessageText() : '') || '';
                        this._observedDialogue = userMsgText || '彼此注视，未发言语';
                    }
                    const subRes = Subconscious.deduceUndercurrent(this._characterProfile || { coreDesire: '渴望被理解', defenseMechanism: '傲慢冷淡' }, this._observedDialogue);
                    if (subRes && subRes.undercurrentDirective) {
                        blocks.push(subRes.undercurrentDirective);
                    }
                }
                // [L11-X7] 双重伪装剧场 (真实感知涉密与公开身份守则)
                const Espionage = _espionageTheaterLib();
                if (Espionage && typeof Espionage.synthesizeEspionageDirective === 'function') {
                    if (!this._activeEspionageCharacter) {
                        this._activeEspionageCharacter = {
                            name: this._currentSpeaker || '角色',
                            publicPersona: '温顺得体的普通人',
                            covertIdentity: '潜伏特务/秘密守望者',
                            safeHouse: '旧书店地下室'
                        };
                    }
                    const espDirective = Espionage.synthesizeEspionageDirective(this._activeEspionageCharacter, { isPublic: true });
                    if (espDirective) {
                        blocks.push(espDirective);
                    }
                }
                // 闭环注入高阶前置计算结果（具身渗透/信物交互/创伤解离）
                if (this._lastSensoryOsmosis) {
                    blocks.push(typeof this._lastSensoryOsmosis === 'string' ? this._lastSensoryOsmosis : (this._lastSensoryOsmosis.guidancePrompt || ''));
                }
                if (this._lastTokenInteraction && this._lastTokenInteraction.promptDirective) {
                    blocks.push(this._lastTokenInteraction.promptDirective);
                }
                if (this._dissociationState && this._dissociationState.guidanceDirective) {
                    blocks.push(this._dissociationState.guidanceDirective);
                }

                // [L11-O2] 视网膜注意力引导 (在最终组装前重排)
                const Retinal = _retinalAttentionLib();
                if (Retinal && typeof Retinal.arrangeRetinalAttention === 'function' && blocks.length > 2) {
                    const retinalResult = Retinal.arrangeRetinalAttention(blocks.map((b, i) => ({ id: 'b-' + i, content: b })), 2000, {});
                    if (retinalResult && Array.isArray(retinalResult.arrangedBlocks)) {
                        blocks = retinalResult.arrangedBlocks.map(item => item.content);
                    }
                }
                // 6. O5 预算透明回执与分层裁切
                const Alloc = _budgetReceiptLib();
                if (Alloc && typeof Alloc.allocateBudgetWithReceipt === 'function') {
                    const materialItems = blocks.map((b, i) => ({ id: 'b-' + i, content: b, priority: 50 }));
                    this._lastBudgetAllocationReceipt = Alloc.allocateBudgetWithReceipt(materialItems, {
                        maxTotalTokens: Number(this.config?.config?.memoryTokenBudget || 2700)   // [v3.421.0] 回退值与 memory-config 声明默认对齐（v3.135 重校准后应为 2700，原 2048 是陈迹）
                    });
                }
            } catch (e) { errLog(e, 'buildInjection.L10CognitiveBlocks'); }
            if (!blocks.length) return '';
            let full = `\n\n${NOTE}\n${blocks.join('\n')}\n${END}\n`;
            // [v3.25] 召回类型分级 + token 预算双层（MemoryPilot + 记忆库v5）:
            // 常驻分区（role=constant，每轮必注）优先保留；触发分区按预算裁剪
            const RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]', '[角色关系]', '[关键事件·影响当前]', '[剧情时间线]', '[卷]', '[早前剧情概括]', '[角色长期关系网]', '[主角当前客观状态与生活习惯]', '[近期已了结事项', '[宏观世界线·纪元史记]', '[当前剧情时间]', '[类型化事实·长期]'];
            // [v3.91] 审计修复：config.recallTierEnabled 此前全项目零引用（分级恒开，开关形同虚设）。
            //         关闭时不做常驻/触发分区，全部块走统一预算裁剪。
            const _tierOn = this.config.config.recallTierEnabled !== false;
            const residentBlocks = _tierOn ? blocks.filter(b => RESIDENT_MARKERS.some(m => b.startsWith(m))) : [];
            const triggerBlocks = _tierOn ? blocks.filter(b => !RESIDENT_MARKERS.some(m => b.startsWith(m))) : blocks.slice();
            // [v2.1] P3: 注入预算裁剪（抄 stbme context-window：超预算优先保近期/相关）
            // [v3.114] 缝合：裁剪决策移入可测纯函数 injection-router（模块缺失时回落本体内联实现）
            let budget = this.config.config.injectionBudget || 3000;
            // [v3.25] token 预算双层：memoryTokenBudget（记忆注入 token 上限）扣减 keepRecentTokenReserve（最近正文预留）
            const reserve = numOr(this.config.config.keepRecentTokenReserve, 0);   // [v3.156] 语义等价，统一为 numOr 使「min=0 键无 || 回退」可被扫描断言
            const tokenBudget = Number(this.config.config.memoryTokenBudget) || 0;
            const _chatLen = (typeof window !== 'undefined' ? window.SillyTavern?.getContext?.()?.chat?.length : 0) || 0;
            const _ir = (typeof window !== 'undefined' ? window.LonShaInjectionRouter : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./injection-router.js'); } catch { return null; } })() : null);
            if (_ir) {
                budget = _ir.deriveBudget(budget, tokenBudget, reserve, _chatLen, {
                    adaptive: this.config.config.adaptiveBudget,
                    decayFloors: this.config.config.adaptiveBudgetDecayFloors,
                });
            } else {
                // [v3.208.0] 与 injection-router.deriveBudget **逐项对齐**（此前不等价，实测 1152 组里 58 组分歧）：
                //   · 缺 `Math.max(200, Math.floor(base))` ⇒ base<200 时内联不做 200 地板（100 vs 200）；
                //   · 缺 `Math.floor` ⇒ 非整数 base 内联不取整（3000.7 vs 3000）。
                //   同一事实两份真源，且**预测侧走的是模块**（cost-forecast 复用 deriveBudget）——
                //   不修就会导致「模块在时预测 200、模块不在时真跑 100」这类只在降级路径上出现的漂移。
                //   等价性由 tests/v3208 的 parity 用例枚举断言守住（漂移即红）。
                budget = Math.max(200, Math.floor(Number(budget) || 0));
                if (tokenBudget > 0) budget = Math.max(200, Math.min(budget, Math.floor(tokenBudget * 10 / 9)));  // [v3.133] CJK 口径（≈1.11 字符/token，与 estimateTextTokens 逆变换一致）
                if (reserve > 0) budget = Math.max(200, budget - Math.floor(reserve * 10 / 9));
                // [v3.50] 第三层：上下文感知自适应——聊天楼层少（上下文占用低）时自动扩容预算（早期多喂记忆加速建立世界感），
                // 楼层多时按基准收紧（保护最近正文空间）。扩张系数随楼层衰减，clamp 0.6x~1.8x 基准。
                if (this.config.config.adaptiveBudget !== false) {
                    try {
                        if (_chatLen > 0) {
                            const decayRef = Number(this.config.config.adaptiveBudgetDecayFloors) || 80;
                            const factor = Math.max(0.6, Math.min(1.8, 1.8 - (_chatLen / decayRef) * 1.2));
                            budget = Math.max(200, Math.floor(budget * factor));
                        }
                    } catch (e) { /* 上下文不可用时用基准预算 */ }
                }
            }
            const _preTrimLen = full.length;   // [v3.144] CP: 预算实测基线（裁剪前字符数）
            const keepCount = this.config.config.budgetStrategy || 'balanced';
            const _opt = {};   // [v3.251.0] M-O3：构建期外部输入口（本版**不扩签名**，见下）
            /* 为什么这里不写成 `opts` 形参：本方法的方法头字面量是**判据的一部分**
             *   （tests/v3216 的 HOST_METHODS 逐一按字面量抽方法体、v3211 的负控制
             *   按方法头定位真源码破坏点）。改签名会让那些
             *   判据定位失败 —— 判据失效比方法签名健壮性重要得多，故签名**一字不动**。
             *   本轮需要外部输入的只有「原始命中数」，而它在本仓有**更可靠的来源**：
             *   召回自检账本（`_recallAudit`）按楼层配对取，不依赖调用方传参。
             *   将来若真要从外部注入，走 `_opt` 的赋值口（属性挂载），不改方法头。 */
            if (this.__buildInjectionOpts && typeof this.__buildInjectionOpts === 'object') {
                Object.assign(_opt, this.__buildInjectionOpts);
            }
            /* [v3.251.0] M-O3 第 ⑤ 条：**真实 tokenizer 探测**（按能力探测，不按版本号硬判）。
             *   为什么必须在**每次构建时**探一次而不是启动时缓存一次：酒馆的 tokenizer
             *   随版本/加载顺序变化，缓存一份会在「本来是估算、后来宿主装上了」时继续报估算
             *   （正是本仓点名的「读数停在过去」形态）。探测本身是常量代价的几个 typeof。
             *   探测不到一律退回 `estimateTextTokens` 并**在回执上标明**是估算 ——
             *   绝不把估算值当精确值摆出去。 */
            const _tokSrc = (() => {
                try {
                    const _st = (typeof window !== 'undefined') ? window.SillyTavern : null;
                    const _c = (_st && typeof _st.getContext === 'function') ? _st.getContext() : null;
                    if (_c && typeof _c.getTokenCountAsync === 'function') return { mode: 'host-async', name: 'SillyTavern.getContext().getTokenCountAsync' };
                    if (_c && typeof _c.getTokenCount === 'function') return { mode: 'host', name: 'SillyTavern.getContext().getTokenCount' };
                    if (_st && typeof _st.getTokenCount === 'function') return { mode: 'host', name: 'SillyTavern.getTokenCount' };
                } catch (e) { /* 探测失败 ⇒ 估算 */ }
                return { mode: 'estimate', name: 'estimateTextTokens(CJK 口径)' };
            })();
            /* 本轮对应的**召回自检记录**：原始命中数（第 ① 阶段）与各源命中分布的唯一真源。
             *   配对纪律（本仓老账「别拿上一轮的读当本轮的」）：**只认楼层号相符的那一条**，
             *   不取「最后一条」。构建跑在召回之后、同一楼层，故楼层号可靠；
             *   楼层号缺失或对不上 ⇒ 不配对（宁可 null，也不给一条别的轮次的读数）。 */
            const _auditLastRec = (() => {
                try {
                    const _ra = this._recallAudit;
                    if (!Array.isArray(_ra) || !_ra.length) return null;
                    const _fl = Number(this._lastRecallFloor);
                    if (!Number.isFinite(_fl)) return null;
                    for (let i = _ra.length - 1; i >= 0; i--) {
                        if (Number(_ra[i] && _ra[i].floor) === _fl) return _ra[i];
                    }
                    return null;
                } catch (e) { return null; }
            })();
            /* [v3.251.0] M-O3：**回执草稿**（本次构建的事实，由构建过程自己派生）。
             *   与「事后反推」的分工（口径写死在这里，别处不得再解释一遍）：
             *     · 本对象里的一切（策略 / 是否裁剪 / 谁留下 / 切在哪 / 各阶段计数）都产生于
             *       **判定发生的地点**；
             *     · 下游的 `_injectionBlocksOf`、cost-ledger 与手机端 **读** 它，不再拿最终文本猜；
             *     · 它**不是第二份事实库**：只记本轮留下哪些块与各阶段计数，不复制块的内容语义，
             *       也不参与任何决策（决策全在 trimToBudget 内）。
             *   未超预算时 trimmed=false、keptAll=true，同样如实落下来。 */
            const _trace = this._injectionTraceDraft = {
                version: 1,
                strategy: keepCount,
                trimmed: false,
                hardTruncated: false,
                preTrimChars: _preTrimLen,
                budget: budget,
                tierOn: _tierOn,
                recallCount: Array.isArray(recalled) ? recalled.length : 0,
                /* [v3.251.0] M-O3 第 ③ 条：**五阶段计数**（原始命中 → 合并 → 有效性过滤 →
                 *   预算裁剪 → 最终保留）。每一格只写本仓**真能测**的量；测不出的写 null
                 *   并在 `stageNotes` 里写明为什么 —— 编一个 0 会让「没测到」与「真的是 0」同形。
                 *   口径（写死在这里，别处不得另解释一遍）：
                 *     · rawHits       各召回源返回条目总数（含重复），取自本仓召回自检账本
                 *                     最后一次记录；调用侧未带 / 楼层对不上 ⇒ null。
                 *     · merged        送入本函数的候选条数（已过合并去重与精选）。
                 *     · validityFiltered 构建期被**有效性规则**挡下的条数（分项见 byRule）。
                 *     · budgetTrimmed 预算裁剪丢掉的块数（裁剪回执给出；硬截断时不可测）。
                 *     · finalKept     最终进载荷的块数（裁剪回执给出）。 */
                stages: {
                    rawHits: (_auditLastRec && Number.isFinite(_auditLastRec.totalHits))
                        ? Number(_auditLastRec.totalHits)
                        : (Number.isFinite(_opt.rawHits) ? Number(_opt.rawHits) : null),
                    merged: Array.isArray(recalled) ? recalled.length : 0,
                    validityFiltered: null,
                    budgetTrimmed: null,
                    finalKept: null,
                    byRule: {
                        relationGated: _stageCnt.relationGated,
                        povOffstage: _stageCnt.povOffstage,
                        relationScoped: _stageCnt.relationScoped,
                        povScoped: _stageCnt.povScoped,
                    },
                },
                stageNotes: {
                    rawHits: ((_auditLastRec && Number.isFinite(_auditLastRec.totalHits)) || Number.isFinite(_opt.rawHits))
                        ? '' : '召回自检账本无**楼层相符**的记录（或本轮未跑召回）⇒ 原始命中数不可测',
                    validityFiltered: '',
                    budgetTrimmed: '',
                },
                /* [v3.251.0] M-O3 第 ⑤ 条：token 口径。**真实 tokenizer 可用就用真的**，
                 *   不可用只给字符数与**明确标记**的估算值。
                 *   修前全仓只有 `estimateTextTokens` 一个来源，而它在面板上被写成
                 *   「约 N token」—— 读的人分不清「酒馆真 tokenizer 算的」与「本插件估的」。
                 *   本仓是酒馆扩展，宿主若提供 tokenizer（SillyTavern 不同版本的挂载点不同，
                 *   故按能力探测而不是按版本号硬判）就用真的；探测不到如实退回估算并标注。 */
                tokenSource: _tokSrc.mode,
                tokenizer: _tokSrc.name,
                /* [v3.251.0] M-O3 第 ⑧ 条：**分层标识**。本仓只产出自己的注入块；
                 *   宿主最终请求体（世界书 / 角色卡 / 其它扩展塞进 prompt 的部分）
                 *   **不在本插件可观测面内** —— 如实标注不可测，不假装自己看得见。
                 *   故 `hostRequestBody` 的 `observed` 恒为 false：这一格存在的意义是
                 *   **说清边界**，而不是给出一个看起来很精确的宿主侧数字。 */
                layer: {
                    pluginBlocks: 'own',        // 本回执描述的就是本插件的注入块
                    hostRequestBody: 'unobserved',
                    hostNote: '宿主最终请求体（世界书/角色卡/其它扩展）不在本插件可观测面内 ⇒ 不可测',
                },
                /* [v3.251.0] M-O3 第 ⑦ 条：**禁用项注入量为零**的可判形式。
                 *   修前「某源被禁用 ⇒ 它没贡献任何块」这件事无处可查：块是渲染后的文本，
                 *   源归属在拼装时就丢了（cost-ledger 正是因此只能做「分节继承」的启发式）。
                 *   现在在**拼装现场**逐源记贡献块数（谁 push 的谁记账），于是
                 *   「禁用 ⇒ 该源块数为 0」是一条可在回执上直接断言的判据，而不是事后推断。 */
                sourceBlocks: _srcBlocks,
                /* 融合源（在召回侧生效、构建期不可分）单独一格：**不假装能拆**。
                 *   `recallPerSource` 是召回自检账本里各源命中数 —— 它是「召回给了几条」，
                 *   不是「注入里几条」；两件事分开摆，读的人自己不会混。 */
                fusedSourceBlocks: {
                    keys: _FUSED_SOURCES.slice(),
                    separable: false,
                    why: '这些源经召回候选池融合渲染，构建期无法把某个块归给某个源；禁用它们的效果是候选池少条目（见 recallPerSource）',
                    recallPerSource: (_auditLastRec && _auditLastRec.perSource) ? _auditLastRec.perSource : {},
                },
                disabledSources: Object.keys(_srcGate).filter((k) => _srcGate[k] === false),
            };
            // [v3.195] 召回只读边界。recalled 是已经发生过的记录，不是本轮指令。
            //   没有显式维护指令就不产生写回；与更新事实同键的旧记录只标 shadowed，不覆盖。
            //   这里只记账，不改 full 的正文——边界是「不得当成本轮动作」，不是再改一遍已拼好的块。
            try {
                if (_ir && typeof _ir.sealRecall === 'function') {
                    const _sealed = _ir.sealRecall(recalled, [], {});
                    this._lastRecallSeal = {
                        recalled: Array.isArray(recalled) ? recalled.length : 0,
                        shadowed: _sealed.shadowed || 0,
                        writable: Array.isArray(_sealed.writable) ? _sealed.writable.length : 0,
                        refusedWrite: _sealed.refusedWrite === true,
                        ts: Date.now()
                    };
                }
            } catch (e) { errLog(e, 'buildInjection.召回只读边界'); }
            /* [v3.274.0] O4：**是否真的走过裁剪路径**必须留一个本地事实。
             *   修前下游只看 `_trace.trimmed`（回执自己标的字段）就下结论，于是
             *   「模块在场但**没标** trimmed」被当成「没超预算 ⇒ 整批都在」——
             *   而那是**谎报全留**：载荷其实已经被裁过。
             *   两条真实可达的路径：模块版本错配（旧 router.js 不写回执）、
             *   模块调用抛错后回退内联（catch 分支）。两者都让 `trimmed` 停在 false。 */
            let _trimAttempted = false;
            if (full.length > budget) {
                _trimAttempted = true;
                // [v3.251.0] M-O3：把**重试参照**交给裁剪（模块在时用于重试判定，见下方 catch）
                if (_trace) _trace.preTrimFull = full;
                if (_ir) {
                    // [v3.114] 裁剪决策走可测纯函数（与内联实现等价；recallTierEnabled 关闭时 blocks 全为触发区）
                    full = _ir.trimToBudget(full, budget, _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks, keepCount, { trace: _trace });
                } else {
                const strategy = keepCount;
                if (strategy === 'relevance') {
                    // 常驻全保留 + 触发保留 RRF 前 60%（[v3.273.0] O3 同源等价：候选序仍是相关性序，装多少由容量定）
                    const prefer = Math.max(3, Math.floor(triggerBlocks.length * 0.6));
                    const ranked = triggerBlocks.slice(0, prefer);
                    const _resFrameLen = residentBlocks.length ? (`\n\n${NOTE}\n${residentBlocks.join('\n')}`).length : 0;
                    const _trigBudget = Math.max(0, budget - _resFrameLen - (`\n${END}\n`).length - (residentBlocks.length ? 1 : (`\n\n${NOTE}\n`).length));
                    const keptT = [];
                    let _acc = 0;
                    for (const t of ranked) {
                        const _sep = (residentBlocks.length + keptT.length) ? 1 : 0;
                        if (_acc + t.length + _sep > _trigBudget) break;
                        keptT.push(t); _acc += t.length + _sep;
                    }
                    const kept = [...residentBlocks, ...keptT];
                    full = `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n`;
                } else if (strategy === 'recency') {
                    // 保留常驻 + 近期分区（[v3.273.0] O3 同源等价：kept 同样按容量装，不再整批全塞）
                    const recencyTypes = ['[关键事件·影响当前]', '[剧情时间线]', '[角色状态]', 'POV', '[手机生活记忆]', '[前情摘要]', '[节日]'];
                    const _cands = triggerBlocks.filter(b => recencyTypes.some(k => b.startsWith(k) || b.includes(k)));
                    const _resFrameLen = residentBlocks.length ? (`\n\n${NOTE}\n${residentBlocks.join('\n')}`).length : 0;
                    const _trigBudget = Math.max(0, budget - _resFrameLen - (`\n${END}\n`).length - (residentBlocks.length ? 1 : (`\n\n${NOTE}\n`).length));
                    const keptT = [];
                    let _acc = 0;
                    for (const t of _cands) {
                        const _sep = (residentBlocks.length + keptT.length) ? 1 : 0;
                        if (_acc + t.length + _sep > _trigBudget) break;
                        keptT.push(t); _acc += t.length + _sep;
                    }
                    const kept = [...residentBlocks, ...keptT];
                    full = kept.length ? `\n\n${NOTE}\n${kept.join('\n')}\n${END}\n` : full.slice(0, budget);
                } else {
                    // balanced：常驻全保留 + 触发截断到剩余预算（[v3.273.0] O3 同源等价：TAIL 与连接符计入）
                    const residentFrame = `\n\n${NOTE}\n${residentBlocks.join('\n')}`;
                    const triggerBudget = Math.max(0, budget - residentFrame.length - (`\n${END}\n`).length);
                    const triggerKept = [];
                    let acc = 0;
                    for (const t of triggerBlocks) {
                        const sep = (residentBlocks.length + triggerKept.length) ? 1 : 0;
                        if (acc + t.length + sep > triggerBudget) break;
                        triggerKept.push(t); acc += t.length + sep;
                    }
                    // ★ 拼接必须与模块版**同构**（统一 join 常驻+触发），不能分开拼：
                    //   分开拼在**无常驻**时会多出一个连接符（实测 mod=152 / inl=153），
                    //   而 residentFrame 只用于算容量，不用于拼装。
                    full = `\n\n${NOTE}\n${[...residentBlocks, ...triggerKept].join('\n')}\n${END}\n`;
                }
                }   // [v3.114] 闭合 else 分支
                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 注入预算裁剪: ${budget} 字符 (常驻${residentBlocks.length}块保留)`);
            }
            if (_trace) {
                /* [v3.251.0] M-O3：未裁剪路径也要留下**同形**的载荷内块清单。
                 *   理由：「没超预算、全部留下」与「裁剪后恰好全留下」在 `trimmed` 上是两态，
                 *   但下游要判「谁留下」时不该为此分两条路读 —— 两条路就是同形隐患的温床。
                 *
                 *   ★★ 但必须再分一层：本函数里的 `trimmed=false` 有**两种**来源，处置相反：
                 *     · 真的没超预算（走模块或走内联都一样）⇒ 整批都在载荷里，回执可给全下标；
                 *     · **模块缺席时的内联回落**（`_ir` 为空，裁剪在下面的 else 分支里做）
                 *       ⇒ 裁剪确实发生了，而**留下哪些块这件事没有留下回执**
                 *         （内联分支只拼 `full`，不记 kept 清单）。
                 *   修前本处若一律按「整批都在」填满下标，就是**谎报**：把真实被裁掉的块
                 *   报成保留 —— 实测会直接打红 v3216 的「有被裁掉的块」判据（本轮真实发生）。
                 *   故内联回落**如实记不可测**（`keptIdxInAll=null` + `traceFrom:'inline'`），
                 *   由消费侧退回 `includes` 并在逐块 `via` 上现形 ——
                 *   与 cost-ledger「不可测就写不可测」同一纪律。
                 *   不给内联分支补一份 kept 清单的理由：那会让「谁留下」这个事实在同一文件里
                 *   有两份实现，而两者迟早漂移（v3.208 已在 deriveBudget 上吃过这个亏）。 */
                const _allT = _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks;
                _trace.blockCount = _allT.length;
                /* trimmed 的三态：false=真没超预算 / true=走模块裁过 / null=**裁了但不可测**
                 *   （模块缺席时的内联回落；判定见下方 `_ir` 分支）。
                 *   `keptAll` 必须与它同口径：`!null === true` 会把「不可测」静默读成
                 *   「全部留下」——正是本版要治的谎报形态，故此处显式按 `=== false` 算。 */
                _trace.keptAll = (_trace.trimmed === false);
                if (!_trace.trimmed) {
                    if (_ir && !_trimAttempted) {
                        _trace.traceFrom = 'router';
                        _trace.keptIdxInAll = _allT.map((_, i) => i);   // 整批都在载荷里
                        _trace.keptTexts = _allT.slice();
                        _trace.droppedTriggerIdx = [];
                    } else if (_ir && _trimAttempted) {
                        /* [v3.274.0] O4：走了裁剪路径、模块也在场，但回执**没标** `trimmed`
                         *   ⇒ 「留下哪些块」这件事没有留下可信回执。如实记不可测，
                         *   绝不按「整批都在」填满下标（那是把「测不了」写成「全部留下」）。
                         *   与内联回落同一处置，只是来源仍如实标 `router`（确实走了路由）。 */
                        _trace.traceFrom = 'router';
                        _trace.trimmed = null;
                        _trace.trimmedUnknown = true;
                        _trace.keptIdxInAll = null;
                        _trace.keptTexts = [];
                        _trace.droppedTriggerIdx = null;
                        _trace.contiguous = null;
                    } else {
                        /* 模块缺席时的内联回落：裁剪确实发生了（就在上面的 else 分支里），
                         *   但**留下哪些块这件事没有留下回执**（内联分支只拼 full，不记 kept 清单）。
                         *   这里若一律按「整批都在」填满下标，就是谎报 —— 实测会直接打红
                         *   v3216 的「有被裁掉的块」判据（本轮真实发生过一次，已修）。
                         *   故如实记**不可测**：`trimmed=null`（不是 false）+ `traceFrom='inline'`，
                         *   消费侧据此退回 `includes` 并让逐块 `via` 现形。
                         *   不给内联分支补一份 kept 清单的理由：那会让「谁留下」这个事实在同一
                         *   文件里出现两份实现，而两者迟早漂移（v3.208 已在 deriveBudget 上吃过）。 */
                        _trace.traceFrom = 'inline';
                        _trace.trimmed = null;
                        _trace.trimmedUnknown = true;
                        _trace.keptIdxInAll = null;
                        _trace.keptTexts = [];
                        _trace.droppedTriggerIdx = null;
                        _trace.contiguous = null;
                    }
                    if (_trace.trimmed === false) {
                        _trace.triggerTotal = (_tierOn ? triggerBlocks : blocks).length;
                        _trace.contiguous = true;
                        _trace.residentKept = _tierOn ? residentBlocks.length : 0;
                    }
                } else if (!_trace.traceFrom) {
                    // 模块在时由 trimToBudget 填 `traceFrom`；此处兜住「裁剪走了模块但没标来源」
                    _trace.traceFrom = _ir ? 'router' : 'inline';
                }
            }
            /* [v3.251.0] M-O3 第 ③ 条：**五阶段的最后两格收口**（预算裁剪 / 最终保留）。
             *   为什么拖到最后才填：这两格只有拿到**处置结果**才算得出 ——
             *   裁剪发生在上面，而「留下几块 / 丢掉几块」在裁剪回执里才有。
             *
             *   三态纪律（本仓老账，与 dedup.savedChars 同款）：
             *     · 有块级清单（未裁剪 / 模块裁过且给出了下标）⇒ 两个数都是**真读数**；
             *     · 硬截断 ⇒ 块级清单**不成立**（切口在块内部），两格记 null + 指明原因，
             *       绝不按 `blockCount - 明显估计` 编一个差数（那是把「测不了」写成数字）；
             *     · 内联回落 ⇒ 同上（裁剪真发生了，但没留清单）。
             *   `validityFiltered` 是各支**已测项之和**：只有测到的那几支才计入，
             *   一支都没测到记 null（不写 0 —— 0 是「测了，一条都没挡」）。 */
            if (_trace && _trace.stages) {
                const _st = _trace.stages;
                if (Array.isArray(_trace.keptIdxInAll) && Number.isFinite(_trace.blockCount)) {
                    _st.finalKept = _trace.keptIdxInAll.length;
                    _st.budgetTrimmed = Math.max(0, _trace.blockCount - _trace.keptIdxInAll.length);
                    _trace.stageNotes.budgetTrimmed = '';
                } else if (_trace.hardTruncated === true) {
                    _st.budgetTrimmed = null; _st.finalKept = null;
                    _trace.stageNotes.budgetTrimmed = '硬截断（切口落在块内部，块级保留清单不成立）⇒ 裁剪丢了几块 / 最终留了几块均不可测';
                } else if (_trace.trimmedUnknown === true || _trace.traceFrom === 'inline') {
                    _st.budgetTrimmed = null; _st.finalKept = null;
                    _trace.stageNotes.budgetTrimmed = '内联回落（注入裁剪模块缺席）：裁剪已发生但未留块级清单 ⇒ 不可测';
                } else {
                    // 未裁剪：整批都在载荷里，两格是真读数（不是 null）
                    _st.finalKept = Number.isFinite(_trace.blockCount) ? _trace.blockCount : null;
                    _st.budgetTrimmed = _st.finalKept === null ? null : 0;
                    _trace.stageNotes.budgetTrimmed = '';
                }
                const _ruleParts = [];
                if (Number.isFinite(_st.byRule.relationGated)) _ruleParts.push(_st.byRule.relationGated);
                if (Number.isFinite(_st.byRule.povOffstage)) _ruleParts.push(_st.byRule.povOffstage);
                if (_ruleParts.length) {
                    _st.validityFiltered = _ruleParts.reduce((a, b) => a + b, 0);
                    _trace.stageNotes.validityFiltered = '';
                } else {
                    _st.validityFiltered = null;
                    _trace.stageNotes.validityFiltered = '本轮没有可测的有效性过滤支（关系披露模块缺席 / 无在场角色时不筛 / 相关分区未参与构建）⇒ 不可测（不写 0）';
                }
            }
            // [v3.144] CP: 预算实测（丢弃可见性）——此前超预算时 trimToBudget 静默 break，
            // 丢了几块/丢多少字符/命中哪个策略全部无处可查，调预算只能靠猜。
            try {
                const _allB = _tierOn ? [...residentBlocks, ...triggerBlocks] : blocks;
                // [v3.215.0] R2-A：逐块读数草稿 —— 「谁进了 / 谁被裁」的**唯一来源**。
                //   放在这里的原因：`_allB` 正是本次裁剪的输入全集（常驻 + 触发），
                //   而 `full` 是裁剪后的最终载荷。两者的差集就是被裁掉的那些块。
                //   修前这两件事都无处可查：`_lastBudgetStats` 只报聚合数
                //   （丢了几块 / 多少字符），回答不了「丢的是哪一块」。
                //   非致命：失败时不写草稿（读数会如实报 0 块），不连坐注入本身。
                try { this._lastInjectionDraft = this._injectionBlocksOf(_allB, full); } catch (e) { errLog(e, 'buildInjection.逐块读数'); }
                /* [v3.274.0] O4：**块级聚合数改为从逐块读数导出**，不再拿最终文本 
                 *   `full.includes(块)` 反推。
                 *   为什么必须换（同一事实两个真源）：逐块读数自 v3.251.0 起按下标 / span 判定，
                 *   而这一格此前仍走文本反推 —— 于是**同一轮里**可以同时出现
                 *   「逐块读数：两条同文块裁掉了 1 条」与「预算实测：2 块全留」。
                 *   反推的两个已知盲区（同文重复 / 互为子串 / 半段截断）在那一格已被治理，
                 *   此处只做聚合，不另立一套判据。
                 *
                 *   三态（本仓老账，与 dedup.savedChars 同款）：
                 *     · `via` 全为精确判据（trace / trace-span）⇒ 聚合数是**真读数**；
                 *     · 硬截断但块 span 定位不到 ⇒ 整块与半段都不可判，如实记该态；
                 *     · 退回 `includes`（回执缺席 / 内联回落 / 规模不符）⇒ **未知，记 null**，
                 *       不倒推成一个数 —— 反推在那些场景恰好偏向「全部留下」（未裁剪时
                 *       每条块都能被载荷命中），那正是本版要断的谎报形态。
                 *   混合判据（一批里既有精确又有反推）整体不当精确读数：报一个总数会让读的人
                 *   以为整批都精确。 */
                const _draft = Array.isArray(this._lastInjectionDraft) ? this._lastInjectionDraft : [];
                const _vias = new Set(_draft.map(x => String((x && x.via) || '')));
                const _keptFrom = (!_draft.length) ? 'unknown'
                    : (_vias.size === 1 && _vias.has('trace')) ? 'trace'
                        : (_vias.size === 1 && _vias.has('trace-span')) ? 'trace-span'
                            : (_vias.size === 1 && _vias.has('trace-truncated-nospan')) ? 'trace-truncated-nospan'
                                : 'unknown';
                const _keptMeasurable = (_keptFrom === 'trace' || _keptFrom === 'trace-span');
                const _keptN = _keptMeasurable ? _draft.filter(x => x && x.kept).length : null;
                const _partialN = (_keptFrom === 'trace-span') ? _draft.filter(x => x && x.partial).length : null;
                /* [v3.274.0] O4：**三态三分**——整块保留 / 整块被丢 / 被切半，互斥且穷尽。
                 *   修前 `_droppedN = 总数 - 保留数` 把「被切半」也算进「被丢」：
                 *   半段其实进了载荷，读成「整块被丢」是另一种假读数（与把「测不了」写成 0 同族）。
                 *   故被丢一律排除 partial；被丢 + 被切半 + 保留 = 总数（可在回执上直接对账）。 */
                const _droppedN = _keptMeasurable ? _draft.filter(x => x && !x.kept && !x.partial).length : null;
                const _keptBlockChars = _keptMeasurable
                    ? _draft.reduce((a, x) => a + ((x && x.kept && Number.isFinite(x.chars)) ? x.chars : 0), 0) : null;
                const _droppedBlockChars = _keptMeasurable
                    ? _draft.reduce((a, x) => a + ((x && !x.kept && !x.partial && Number.isFinite(x.chars)) ? x.chars : 0), 0) : null;
                const _partialBlockChars = (_keptFrom === 'trace-span')
                    ? _draft.reduce((a, x) => a + ((x && x.partial && Number.isFinite(x.chars)) ? x.chars : 0), 0) : null;
                const _candChars = _allB.reduce((a, b) => a + String(b == null ? '' : b).length, 0);
                const _ro = (_trace && _trace.residentOverflow && typeof _trace.residentOverflow === 'object')
                    ? _trace.residentOverflow : null;
                const _roChars = (_ro && Number.isFinite(_ro.chars)) ? _ro.chars : null;
                const _roOver = (_ro && Number.isFinite(_ro.over)) ? _ro.over : null;
                const _droppedSamples = _draft.filter(x => x && !x.kept && !x.partial && x.label)
                    .slice(0, 3).map(x => String(x.label).slice(0, 36));
                const _keptWhy = _keptMeasurable ? '' : (_keptFrom === 'trace-truncated-nospan'
                    ? '硬截断但块 span 定位不到 ⇒ 整块 / 半段均不可判'
                    : (!_draft.length ? '逐块读数缺席（本轮无块或读数构造失败）⇒ 不可测'
                        : '留存判据退回文本反推（回执缺席 / 内联回落 / 规模不符）⇒ 已知盲区，不倒推成功'));
                this._lastBudgetStats = {
                    requested: budget, beforeChars: _preTrimLen, afterChars: full.length,
                    droppedChars: Math.max(0, _preTrimLen - full.length),
                    keptBlocks: _keptN, totalBlocks: _allB.length, droppedSamples: _droppedSamples,
                    /* [v3.274.0] O4：**参与三态判定的块数**（空块是候选里的占位，不占载荷字符，
                     *   逐块读数按 v3251 G3 的纪律把它排除在保留/丢弃之外）——
                     *   于是 `保留 + 被丢 + 被切半 = countedBlocks` 是一条可直接对账的等式，
                     *   而 `totalBlocks`（候选总数）保持原语义不动（旧字段兼容）。 */
                    countedBlocks: _draft.length,
                    droppedBlocks: _droppedN, partialBlocks: _partialN,
                    keptFrom: _keptFrom, keptWhy: _keptWhy,
                    candidateChars: _candChars, keptBlockChars: _keptBlockChars, droppedBlockChars: _droppedBlockChars,
                    partialBlockChars: _partialBlockChars,
                    overBudgetChars: Math.max(0, full.length - budget),
                    residentOverflowChars: _roChars, residentOverflowOver: _roOver,
                    strategy: keepCount, tokens: estimateTextTokens(full),
                    tokenBudget: tokenBudget || null, ts: Date.now(),
                };
                // [v3.193.0] 成本账本：把「总量丢弃」拆成「谁的丢弃」。
                //   常驻（每轮都在）与触发（命中才有）成本量级差十倍，混在一个数字里没法取舍；
                //   反向召回的真实代价也在此显形（它不新增块，只改排序 ⇒ 挤掉别人）。
                const _CL = _costLedgerLib();
                if (_CL && typeof _CL.buildCostLedger === 'function') {
                    this._lastCostLedger = _CL.buildCostLedger({
                        allBlocks: _allB,
                        injectedText: full,
                        preTrimChars: _preTrimLen,
                        budget: budget,
                        strategy: keepCount,
                        residentMarkers: RESIDENT_MARKERS,   // 常驻口径的单一真源在本文件，不另立一套
                        emotionOpposite: this._emoOppositeRead,
                        promoted: this._emoOppositeMatched,
                        promotedSnippets: this._emoOppositeSnippets || {},
                        recallSources: (this._recallAudit && this._recallAudit.length
                            ? (this._recallAudit[this._recallAudit.length - 1].perSource || {}) : {}),
                        /* [v3.251.0] M-O3 第 ⑦ 条：开关表提到拼装前建一次（`_srcGate`），
                         *   此处**原样引用同一对象**。修前这里是就地写死的一份表 ——
                         *   若回执再抄一份就是「同一事实两个真源」，而漂移的表现恰好是
                         *   「禁用项仍被报成有注入」。键面与语义一字未改。 */
                        enabledSources: _srcGate,
                        /* [v3.251.0] M-O3：**把裁剪回执交给账本**，让它不再靠 `includes` 反推
                         *   「谁被留下」。这是「禁用项不计入实际注入成本」可信的前提：
                         *   块级留存数从回执来，才有资格谈「某个被禁用的源贡献了多少成本」。 */
                        trace: _trace,
                        tokensOf: estimateTextTokens,
                        now: this._lastBudgetStats.ts,
                    });
                    this._lastBudgetStats.ledger = this._lastCostLedger;
                    this._lastBudgetStats.ledgerLine = (_CL.costLine ? _CL.costLine(this._lastCostLedger) : '');
                } else {
                    // 模块缺席不伪装成「成本为零」：留 null + 诊断面报「模块未加载」
                    this._lastCostLedger = null;
                    this._lastBudgetStats.ledger = null;
                }
                // [v3.208.0] 成本**预测** + 预测/实测对账。
                //   预测用的是与真路径**同一批纯函数**（injection-router 的 deriveBudget/trimToBudget），
                //   故「预测值」不是近似公式，而是「同样输入下真路径会算出什么」的复算——
                //   两者一旦漂移，说明真路径被改了而预测没跟上（或反之），对账会当场报 drift。
                try {
                    const _CF = _costForecastLib();
                    if (_CF && typeof _CF.forecast === 'function') {
                        this._lastForecast = _CF.forecast({
                            allBlocks: _allB,
                            residentMarkers: RESIDENT_MARKERS,
                            baseBudget: this.config.config.injectionBudget || 3000,
                            tokenBudget: tokenBudget,
                            reserve: reserve,
                            chatLength: _chatLen,
                            adaptive: this.config.config.adaptiveBudget,
                            decayFloors: this.config.config.adaptiveBudgetDecayFloors,
                            strategy: keepCount,
                            router: _ir,
                            promotedSnippets: this._emoOppositeSnippets || {},
                            tokensOf: estimateTextTokens,
                            now: this._lastBudgetStats.ts,
                        });
                        this._lastReconcile = (typeof _CF.reconcile === 'function')
                            ? _CF.reconcile(this._lastForecast, this._lastCostLedger)
                            : null;
                        this._lastBudgetStats.forecast = this._lastForecast;
                        this._lastBudgetStats.reconcile = this._lastReconcile;
                        this._lastBudgetStats.forecastLine = (_CF.forecastLine ? _CF.forecastLine(this._lastForecast) : '');
                    } else {
                        this._lastForecast = null; this._lastReconcile = null;
                        this._lastBudgetStats.forecast = null;
                        this._lastBudgetStats.reconcile = null;
                    }
                } catch (e) { errLog(e, 'buildInjection.成本预测'); }
                /* [v3.298.0 · M-O3] **预算/裁剪/注入回执的单一真源**（injection-receipt.js）。
                 *
                 * 为什么要有这一格（修前实测的三处缺口，不是推断）：
                 *   ① **同一事实三份实现**：候选字符量在本文件（`_allB.reduce`）、cost-ledger
                 *      （累 `tagged`）与 cost-forecast（累 resident+trigger）各算一遍；
                 *      「载荷字符」同理。任一处漏掉空块 / 封装口径就漂移，且没有任何判据看着。
                 *   ② **两类量被混着叫 `droppedChars`**：`_lastBudgetStats.droppedChars` 是
                 *      「裁剪前全文 − 载荷」（**含**首尾说明与块间分隔符），而 cost-ledger 的
                 *      `truncated.chars` 是「被丢块的字符之和」（**不含**封装）。实测
                 *      三触发块场景 124 vs 122 —— 差的两个字符正是块间分隔符。
                 *      把两者当同一个量对账，必然假 drift（cost-forecast 的注释里已记过这笔账）。
                 *   ③ **判据不可用时没有任何一格回答「多少字符不可归因」**：修前的做法是整组
                 *      退回 `includes` 反推，而反推在未裁剪场景恰好偏向「全部留下」——
                 *      正是 M-O3 要断的谎报形态。
                 *
                 * 本格的做法：把「六类量」拆开各自命名（候选 / 载荷 / 被丢块 / 裁剪减少 /
                 *   预算溢出 / **未知**），一律在同一条 trace 上派生；判据不可用时块级量记
                 *   null + 来源并**不倒推**，不可归因的字符量单列 `unknownChars`。
                 *   旧键（`droppedChars` / `candidateChars` / `overBudgetChars` …）**一字不动**：
                 *   下游（v3144 / v3274 / 面板）读的是它们，本格是**新增**的单一真源面。
                 *   非致命：失败时置 null（读数如实报「不可测」），不连坐注入本身。 */
                try {
                    const _RC2 = _injectionReceiptLib();
                    if (_RC2 && typeof _RC2.deriveReceipt === 'function') {
                        const _resIdx = [];
                        for (let _i2 = 0; _i2 < _allB.length; _i2++) {
                            if (RESIDENT_MARKERS.some((m) => String(_allB[_i2] == null ? '' : _allB[_i2]).startsWith(m))) _resIdx.push(_i2);
                        }
                        this._lastReceipt = _RC2.deriveReceipt({
                            trace: _trace,
                            blocks: _allB,
                            payloadText: full,
                            preTrimChars: _preTrimLen,
                            budget: budget,
                            tokenBudget: tokenBudget || null,
                            tokenSource: (_trace && _trace.tokenSource) ? _trace.tokenSource : null,
                            strategy: keepCount,
                            residentIdx: _resIdx,
                            frame: { headLen: NOTE.length + 3, tailLen: END.length + 2, separatorLen: 1 },
                            now: this._lastBudgetStats.ts,
                        });
                        this._lastBudgetStats.receipt = this._lastReceipt;
                        this._lastBudgetStats.receiptLine = (_RC2.receiptLine ? _RC2.receiptLine(this._lastReceipt) : '');
                    } else {
                        this._lastReceipt = null;
                        this._lastBudgetStats.receipt = null;
                    }
                } catch (e) { errLog(e, 'buildInjection.回执派生'); }
            } catch (e) { errLog(e, 'buildInjection.预算实测'); }
            return full;
        }
        
        /**
         * [v3.215.0] R2-A：注入读数的**唯一构造点**。
         *   修前实测（真源码两条写入点）：`_lastInjection` 同时被
         *     · `onBeforeGeneration`（真注入），
         *     · `selfCheck()` 的「召回管线 dry-run（**不注入**，只验证链路通）」
         *   写入，而面板文案写的是「最近一次实际注入 … 即 AI 真实所见」。
         *   于是「跑了一次诊断」与「跑了一次真生成」在下游**处置相反**，读数上却同形。
         *
         *   现在这里收口：真生成路径一律经本方法写；诊断另走 `_diagnostics.dryRun`，
         *   连键名都不共用（不叫 `_lastInjection`），从根上不可能再塌陷。
         *
         *   恒定 10 键，一个不少 —— 「少写一个键」就是失败分支与成功分支不同形，
         *   本仓在 `repairReceipt` 上刚治理过同一形态（下游按 shape 编程）。
         *   `origin` 缺省即 `'generation'`：**诊断必须显式另走一路**，不得靠「没传」蒙混。
         *
         *   `round` 是「第几轮」的单一真源（调用方不该自己数）：
         *     0 块的一轮也照常推进轮次 —— 这正是「这轮 0 块」与「这轮还没跑」的分界。
         *   `prev` 照旧串上一轮 html（面板 diff 高亮用），首轮为 null。
         */
        _injectionRecord(extra) {
            const e = extra || {};
            const html = String(e.html == null ? '' : e.html);
            const blocks = Array.isArray(e.blocks) ? e.blocks : [];
            const round = Number.isFinite(e.round) ? e.round : (Number(this._injectionRound) || 0);
            const rec = {
                html,
                tokens: Number.isFinite(e.tokens) ? e.tokens : estimateTextTokens(html),
                ts: Number.isFinite(e.ts) ? e.ts : Date.now(),
                prev: (this._lastInjection && this._lastInjection.html) || null,
                origin: String(e.origin || 'generation'),
                /* [v3.218.0] R2-E：这一轮的**结局**。修前中止与完成同形（都停在注入那一刻），
                 *   而两者处置相反 —— 前者该重发、后者该看回复。
                 *   缺省 'pending'（已注入、结局未完），由 `_injectionEnd` 从两个事件落定。 */
                outcome: String(e.outcome || 'pending'),
                round,
                blocks,
                total: Number.isFinite(e.total) ? e.total : blocks.length,
                kept: Number.isFinite(e.kept) ? e.kept : blocks.filter(b => b && b.kept).length,
                gen: Number.isFinite(e.gen) ? e.gen : (Number(this._genSeq) || 0),
            };
            this._lastInjection = rec;   // ← 全源码**唯一**赋值点（结构判据 v3216 T2 守着）
            return rec;
        }
        /**
         * [v3.215.0] R2-A：本轮逐块读数的**重算**（从块清单与最终载荷现算）。
         *   为什么重算而不是在拼装时一路收集：拼装函数有 20+ 个 `blocks.push`
         *   分散在静态区 / 动态区 / 预算裁剪三处，逐处收集等于把「谁进了」这个事实
         *   抄成二十份真源。这里只做一次判定：**块文本在最终载荷里出现过 ⇒ kept**。
         *
         *   [v3.251.0] M-O3 **改判据**：优先读构建过程派生的**回执**（`_injectionTraceDraft`
         *   的 `keptIdxInAll`），只在回执不可用/规模对不上时才退回文本 `includes`。
         *   为什么必须换：修前那条 `indexOf(块) >= 0` 有两个实测盲区（探针 `/tmp/mo3/probe1.mjs`
         *   A 例的实证）——
         *     · **同文重复**：候选含两条完全相同的触发块、预算只装得下一条时，
         *       留下的那条让**两条**的 `indexOf` 都 ≥ 0 ⇒ 把「裁了一份」读成「两份都留」；
         *     · **半段截断**：recency 硬截断切在块内部 ⇒ 半段块被读成「整块被丢」。
         *   回执按下标说话（`keptIdxInAll`），这两态在构造上不可能发生。
         *   `via` 字段如实登记本次用的是哪条判据 —— 「换了判据」这件事本身必须可见，
         *   否则下一次读这块读数的人会以为它一直是精确的。
         *
         *   逐块键面恒定 6 项：`ref / id / label / kept / chars / reason / at`。
         *   被裁的块也必须可辨认（`label` 取块首行，截断到 40 字），
         *   否则「丢了什么」在面板上仍然是一团空白。
         */
        _injectionBlocksOf(allBlocks, fullText) {
            const list = Array.isArray(allBlocks) ? allBlocks : [];
            const full = String(fullText == null ? '' : fullText);
            /* 回执可用性两问（缺一不可，且必须**分开**问）：
             *   ① 这批回执对的是不是本批块清单（`blockCount` 规模自证）——
             *      诊断 dry-run 路径也会调 buildInjection 并各自重建草稿，
             *      不核对就会按**别人那批**的下标判 kept（错读数且看不出来）；
             *   ② 回执是「块级清单」还是「硬截断」形态 —— 后者不成立块级清单，
             *      只能判「整块落在切点内 / 被切半」，不能假装能判整块。 */
            const tr = this._injectionTraceDraft;
            const traceUsable = !!(tr && tr.version && Number(tr.blockCount) === list.length);
            // 来源必须是**路由模块**：内联回落时 `keptIdxInAll` 为 null（不可测），
            //   这里再把 `traceFrom` 也纳入条件，防止将来有人给内联分支补一份清单后
            //   消费侧仍按旧口径读（那时「清单来自哪」必须重新过一遍这道门）。
            const idxOk = traceUsable && tr.traceFrom === 'router' && Array.isArray(tr.keptIdxInAll);
            // 第二态：硬截断（recency 无保留项时的 `slice(0, budget)`）。它与「块级清单」
            //   互斥（那时回执把 keptIdxInAll 显式置 null），故两态的先后不影响判定。
            const hardCut = traceUsable && tr.hardTruncated === true;
            const keptSet = idxOk ? new Set(tr.keptIdxInAll) : null;
            const sliceAt = hardCut ? Number(tr.sliceAt) : NaN;
            const out = [];
            for (let i = 0; i < list.length; i++) {
                const text = String(list[i] == null ? '' : list[i]);
                if (!text) continue;
                const at = full.indexOf(text);
                /* 三态判据，互斥且穷尽（每条都真的可达，不存在「声明了却不发生」的分支）：
                 *   idxOk   回执带块级下标清单 ⇒ 按下标判（精确，同文重复也分得开）
                 *   hardCut 回执是硬截断形态   ⇒ 整块落在切点内才算 kept，跨切点记 partial
                 *   否则     回执缺席/规模不符  ⇒ 退回文本反推（已知盲区如实标注） */
                let kept, via, partial = false;
                if (idxOk) { kept = keptSet.has(i); via = 'trace'; }
                else if (hardCut) {
                    /* 硬截断：块级清单不成立，改按**原始 full 的 span** 判三态。
                     *   为什么不能用截断后的 `full.indexOf(块)` 判：切半的块在截断文本里
                     *   根本找不到完整文本（indexOf = -1），于是「被切半」与「整块被丢」
                     *   会双双落进同一个 false —— 那正是修前那个盲区。
                     *   span 缺席（未定位到 / 无 span 表）⇒ 一律 kept=false 且 partial=false，
                     *   并在 `via` 上标明是降级判据，不假装精确。 */
                    const sp = (Array.isArray(tr.blockSpans) && Array.isArray(tr.blockSpans[i])) ? tr.blockSpans[i] : null;
                    if (sp) {
                        kept = sp[1] <= sliceAt;
                        partial = (sp[0] < sliceAt && sp[1] > sliceAt);
                        via = 'trace-span';
                    } else { kept = false; partial = false; via = 'trace-truncated-nospan'; }
                } else { kept = at >= 0; via = 'includes'; }
                const head = text.split('\n')[0].trim();
                out.push({
                    ref: this._injectionRefOf(i),
                    id: i,
                    label: head.length > 40 ? head.slice(0, 40) + '…' : head,
                    kept,
                    chars: text.length,
                    reason: partial ? 'truncated-partial' : (kept ? 'kept' : 'dropped-budget'),
                    at: (kept && at >= 0) ? at : null,
                    via: via,
                    // 半段：块的下标在切点之前、末尾在切点之后 —— 真实发生过的「裁剪半段」，
                    //   修前它与「整块被丢」同形（两者都只是 includes=false）。
                    partial: partial,
                });
            }
            return out;
        }
        /**
         * [v3.216.0] R2-B：本轮注入读数的**暂存口**（生成路径在 await 内部调）。
         *   只写 `_injectionPending`，**绝不动 `_lastInjection`** ——
         *   那是「AI 真实所见」的唯一读数，它只能由**代际确认过的提交**写。
         *   为什么不能在这里直接落地：本方法跑在 `await onBeforeGeneration()` 里，
         *   而代际守卫在 await **之后**才判定（快速连发时先发那一轮必定过期）。
         *   提前落地 = 把一次**从未生效**的注入写成「最近一次实际注入」。
         */
        _injectionStage(payload) {
            const p = payload || {};
            const blocks = Array.isArray(p.blocks) ? p.blocks : [];
            const rec = {
                html: String(p.html == null ? '' : p.html),
                blocks,
                total: Number.isFinite(p.total) ? p.total : blocks.length,
                kept: Number.isFinite(p.kept) ? p.kept : blocks.filter(b => b && b.kept).length,
                gen: Number.isFinite(p.gen) ? p.gen : (Number(this._genSeq) || 0),
                stagedAt: Date.now(),
            };
            this._injectionPending = rec;
            return rec;
        }
        /**
         * [v3.216.0] R2-B：读数的**唯一落地点**（代际确认之后调）。
         *
         *   ① 轮次号只在**这里**推进：被丢弃的那一代不占号，于是「第 N 轮」
         *     恒等于「真正生效过的第 N 次注入」。若轮次在暂存时就推进，读数上会多出一些
         *     从未生效的空号，而下游把 round 当作「有效注入次数」用。
         *   ② 内部再做一道代际核对：即便被误调（外层守卫被绕过 / 被当作工具单用），
         *     也**不会默默落一个别的代的载荷** —— 不符即返回 null，由留痕口处置。
         *   ③ 提交后清空暂存：不清则下一轮若没暂存，会被误认为「本轮的载荷」。
         */
        _injectionCommit(myGen) {
            const p = this._injectionPending;
            const gen = Number.isFinite(myGen) ? myGen : (Number(this._genSeq) || 0);
            if (!p) return null;
            if (gen !== (Number(this._genSeq) || 0)) return null;   // ② 代际不符：不落地、不消耗暂存（由留痕口处置）
            /* [v3.217.0] R2-D ②b **载荷自身代**核对：上面那一道只看「调用者传进来的代」，
             *   拦不住「载荷由 A 路径留下、被 B 路径提交」。R2-B 立下的「过期清暂存」只覆盖
             *   「过期分支跑了」那种情形；而**根本没人提交它**的载荷会一直悬在暂存里，
             *   被下一轮的提交当成自己的载荷落成读数（round 照常前进，gen 却停在旧代）。
             *   这正是 R2-B 注释点名过的「张冠李戴比不落地更坏」，只是来自另一侧。
             *   不符即**不落地**并按过期收尾：清暂存 + 留痕 —— 既不落成读数，也不静默消失。 */
            if (Number.isFinite(p.gen) && p.gen !== gen) {
                try { this._injectionDiscardStale(p.gen); } catch (e) { errLog(e, '注入提交.无主载荷收尾'); }
                return null;
            }
            this._injectionRound = (Number(this._injectionRound) || 0) + 1;
            const rec = this._injectionRecord({
                html: p.html, origin: 'generation', blocks: p.blocks,
                total: p.total, kept: p.kept,
                round: this._injectionRound, gen: p.gen,
            });
            this._injectionPending = null;   // ③
            return rec;
        }
        /**
         * [v3.217.0] R2-D：一条发布路径本次生成的**收尾唯一入口**。
         *
         *   为什么必须有：R2-B 之后，「读数落地」与「过期收尾」是两件事，由调用方按序拼；
         *   而本仓有**两条**发布路径（`GENERATION_STARTED` 事件 / `window.lonsha_memory_interceptor`
         *   兼容入口）。修前 interceptor 那条**根本不收尾** ⇒ 它的暂存永久悬空，
         *   成了「被别的代捡起」的现成供体。让每条路径各抄一遍「先提交、不成再丢弃」，
         *   就是本仓 v2.97 之前「同一口径被抄 7 份」的老形态 —— 收尾的正确性
         *   （不重复留痕、不留下无主暂存）属于**引擎不变量**，只能有一份。
         *
         *   语义（三条，互斥且穷尽）：
         *     · 暂存属于本次代 ⇒ 提交落地（轮次推进、读数更新）；
         *     · 暂存属于别的代 ⇒ `_injectionCommit` 内部已按过期收尾并返回 null ⇒ 这里**不再**留痕（防重复计数）；
         *     · 压根没有暂存（本轮什么都没留下）⇒ 返回 null 且**不**记过期（那不是「迟到」，是「无内容」）。
         *   `had` 必须在提交**之前**读：提交成功会把 `_injectionPending` 清空，
         *   事后读就分不清「本来就没有」与「刚刚提交掉了」—— 那正是本仓最忌的两义同形。
         */
        _injectionClose(myGen) {
            const had = !!this._injectionPending;
            const rec = this._injectionCommit(myGen);
            if (rec) return rec;
            // 提交不成且暂存仍在 ⇒ 按过期收尾；已被提交内部清掉的不重复留痕。
            if (had && this._injectionPending) {
                try { this._injectionDiscardStale(myGen); } catch (e) { errLog(e, '注入收尾.过期留痕'); }
            }
            return null;
        }
        /**
         * [v3.218.0] R2-E：给**当前读数**标注这一轮的结局（唯一标注入口）。
         *
         *   为什么必须有：修前 `GENERATION_ENDED`（用户 Esc 中止）只复位 `_generationActive`，
         *   于是读数上「被中止」与「正常完成」**同形** —— 两者处置相反（前者该重发、
         *   后者该看回复），压成一态就是本仓最贵的那类错读数。
         *
         *   三条语义（互斥且穷尽）：
         *     · `kind === 'received'`（MESSAGE_RECEIVED，本轮闭环）⇒ `'completed'`；
         *     · 其余（`GENERATION_ENDED`）⇒ `'aborted'`；
         *     · **只从 `'pending'` 迁出**：已判定的不重写。因为 ST 的正常次序是
         *       `MESSAGE_RECEIVED` **先于** `GENERATION_ENDED`，若无此门，一次正常完成
         *       会被随后的 ENDED 改写成「中止」——那正是「用一个看得见的错换一个看得见的错」。
         *   无读数时（本轮没跑过注入）计入 `noReadout`：**「没有可标注的注入」与
         *   「标注成功」是两件事**，不能都表现为「函数跑过了」。
         */
        _injectionEnd(kind) {
            try {
                const st = this._injectionEnded || (this._injectionEnded = { completed: 0, aborted: 0, noReadout: 0, afterReadout: 0 });
                const inj = this._lastInjection;
                if (!inj || typeof inj !== 'object') { st.noReadout += 1; return null; }
                if (inj.outcome !== 'pending') { st.afterReadout += 1; return inj.outcome; }   // 已判定：不重写（幂等）
                const next = (kind === 'received') ? 'completed' : 'aborted';
                inj.outcome = next;
                inj.outcomeAt = Date.now();
                st[next] += 1;
                return next;
            } catch (e) { errLog(e, '注入读数.结局标注'); return null; }
        }
        /** [v3.215.0] R2-A：块引用键。本轮内唯一（含轮次号），跨轮不混淆。 */
        _injectionRefOf(i) {
            const round = Number(this._injectionRound) || 0;
            return 'inj_' + round + '_' + (Number.isFinite(i) ? i : 0);
        }
        /**
         * [v3.215.0] R2-A：代际过期的**留痕口**（`GENERATION_STARTED` 的代际守卫调用）。
         *   修前：过期只打一行 console.log —— 读数上「过期被丢弃」与「从未跑过」同形。
         *   修后：累计计数 + 记下是哪一代过期、当下是哪一代。
         *
         *   ★ **刻意不碰 `_lastInjection`**：迟到清理若回写读数，就会把上一次真注入的
         *     读数擦掉 —— 那等于用一个看得见的错误换一个看不见的错误。
         *     本方法不抛：它被事件处理器调用，抛出会让守卫本身变成故障源。
         */
        _injectionDiscardStale(myGen) {
            const staleGen = Number.isFinite(myGen) ? myGen : -1;
            const currentGen = Number(this._genSeq) || 0;
            this._injectionStale = (Number(this._injectionStale) || 0) + 1;
            // [v3.216.0] R2-B：过期必须**清掉暂存**。
            //   不清则下一次新鲜提交会捡起这一轮的载荷落成读数 —— 比「不落地」更坏：
            //   那是一份**张冠李戴**的读数，而读数上看不出来。
            //   与此同时把被丢弃载荷的读数也记下（chars / blocks），于是
            //   「过期丢了多大一块」在诊断面上可读，而不是只有一个计数。
            const _pd = this._injectionPending;
            const _payloadChars = (_pd && typeof _pd.html === 'string') ? _pd.html.length : 0;
            const _payloadBlocks = (_pd && Array.isArray(_pd.blocks)) ? _pd.blocks.length : 0;
            const _hadPending = !!_pd;
            this._injectionPending = null;   // ★ 必须清：不清则下一次新鲜提交会捡起旧载荷
            const rec = {
                staleGen,
                currentGen,
                kind: 'generation-superseded',
                at: Date.now(),
                stale: this._injectionStale,
                pendingDiscarded: _hadPending,
                payloadChars: _payloadChars,
                payloadBlocks: _payloadBlocks,
            };
            this._lastInjectionDiscard = rec;
            return rec;
        }
        /**
         * [v3.215.0] R2-A：诊断路径（selfCheck 的召回 dry-run）的注入读数。
         *   **不写 `_lastInjection`** —— 它只回答「链路通不通、载荷多大」，
         *   不回答「AI 看到了什么」。两者混在一个字段里就是本版修掉的归属塌陷。
         *   落点 `_diagnostics.dryRun`，`id:'diagnostics'` 可归因。
         */
        _buildDiagnosticsInjection(recalled) {
            let html = '';
            try { html = String(this.buildInjection(recalled) || ''); } catch (e) { html = ''; }
            const rec = {
                id: 'diagnostics',
                origin: 'dry-run',
                chars: html.length,
                bytes: html.length,
                html,
                ts: Date.now(),
            };
            this._diagnostics = Object.assign({}, this._diagnostics, { dryRun: rec });
            return rec;
        }
        /**
         * [v3.215.0] R2-A：注入面的**对外读数**（`buildBridgeSnapshot().injection` 的唯一来源）。
         *   修前：约定 / 伏笔 / 回扣 / 回声各有 `render()`，但快照 15 字段里**注入面一个都没有**，
         *   下游拿不到「AI 这一轮实际看到的是哪几块」。
         *   本方法纯读：未跑过一律 `null`（**不是空壳对象** —— 空壳会与「跑过、真的 0 块」同形）。
         */
        buildInjectionReadout() {
            const inj = this._lastInjection;
            if (!inj || typeof inj !== 'object') return null;
            const blocks = Array.isArray(inj.blocks) ? inj.blocks : [];
            return {
                origin: String(inj.origin || 'generation'),
                // [v3.218.0] R2-E：结局外供（9 → 10 键）。下游据此把「被中止」与「正常完成」分开报 ——
                //   本仓把它加进出面时，下游 `config/injection-contract.js` 必须**同一轮**接上，
                //   否则又是一次「上游给了没人读」。
                outcome: String(inj.outcome || 'pending'),
                round: Number(inj.round) || 0,
                ts: Number(inj.ts) || 0,
                tokens: Number(inj.tokens) || 0,
                chars: String(inj.html || '').length,
                html: String(inj.html || ''),
                total: Number.isFinite(inj.total) ? inj.total : blocks.length,
                kept: Number.isFinite(inj.kept) ? inj.kept : blocks.filter(b => b && b.kept).length,
                blocks: blocks.map(b => ({
                    ref: String((b && b.ref) || ''),
                    id: Number.isFinite(b && b.id) ? b.id : 0,
                    label: String((b && b.label) || ''),
                    kept: !!(b && b.kept),
                    chars: Number.isFinite(b && b.chars) ? b.chars : 0,
                    reason: String((b && b.reason) || ''),
                })),
            };
        }


    }

    const _ops = new LonShaInjectionPipeline();

    function injectionPipelineDescribe() {
        return {
            name: 'engine-injection-pipeline.js',
            role: 'injection & context assembly pipeline',
            methodsCount: 17,
        };
    }

    const exportsObj = {
        bindDeps: bindDeps,
        LonShaInjectionPipeline: LonShaInjectionPipeline,
        _ops: _ops,
        injectionPipelineDescribe: injectionPipelineDescribe,
        _worldbookOccupancy: function (engine, ...args) {
            const target = engine || this;
            return _ops._worldbookOccupancy.apply(target, args);
        },
        _projectionPrediction: function (engine, ...args) {
            const target = engine || this;
            return _ops._projectionPrediction.apply(target, args);
        },
        _projectionStrategyCompare: function (engine, ...args) {
            const target = engine || this;
            return _ops._projectionStrategyCompare.apply(target, args);
        },
        buildBridgeSnapshot: function (engine, ...args) {
            const target = engine || this;
            return _ops.buildBridgeSnapshot.apply(target, args);
        },
        buildBridgeSnapshotJson: function (engine, ...args) {
            const target = engine || this;
            return _ops.buildBridgeSnapshotJson.apply(target, args);
        },
        _summarizeRecallAudit: function (engine, ...args) {
            const target = engine || this;
            return _ops._summarizeRecallAudit.apply(target, args);
        },
        buildInjection: function (engine, ...args) {
            const target = engine || this;
            return _ops.buildInjection.apply(target, args);
        },
        _injectionRecord: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionRecord.apply(target, args);
        },
        _injectionBlocksOf: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionBlocksOf.apply(target, args);
        },
        _injectionStage: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionStage.apply(target, args);
        },
        _injectionCommit: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionCommit.apply(target, args);
        },
        _injectionClose: function (engine, ...args) {
            const target = engine || this;
            return _ops['_injectionClose'].apply(target, args);
        },
        _injectionEnd: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionEnd.apply(target, args);
        },
        _injectionRefOf: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionRefOf.apply(target, args);
        },
        _injectionDiscardStale: function (engine, ...args) {
            const target = engine || this;
            return _ops._injectionDiscardStale.apply(target, args);
        },
        _buildDiagnosticsInjection: function (engine, ...args) {
            const target = engine || this;
            return _ops._buildDiagnosticsInjection.apply(target, args);
        },
        buildInjectionReadout: function (engine, ...args) {
            const target = engine || this;
            return _ops.buildInjectionReadout.apply(target, args);
        },
    };
    return exportsObj;
}));
