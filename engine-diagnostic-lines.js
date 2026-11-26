(function (global) {
    'use strict';
/*
 * engine-diagnostic-lines.js - MemoryEngine diagnostic + delegate methods
 * Extracted from index.js lines 2766-4262.
 * Methods receive engine (MemoryEngine instance) as first arg.
 * Deps injected via bindDeps: moduleLib, errLog, libs, _changeset.
 *
 * ★ [v3.474.0 · L23-O5] 拆分（5915 行 → 装配面 + 三片），本文件只留三件事：
 *   ① 依赖注入面（bindDeps 与取库口）；② 顶层常量表；③ 分片装载与 api 组装。
 *   函数体一个字节都没改，只是搬到了 `engine-diagnostic-lines-part-a/b/c.js`。
 *   装载顺序：浏览器由 `manifest.extra_js` 保证三片在本文件之前（缺片时本文件回落 require），
 *   分片把 install 登记进 `global.LonShaDiagParts`，本文件统一用**同一份依赖桩**装进同一个 api；
 *   跨片调用经 api 转发，不在各片里各留一份桩（"同一事实两处实现"是本仓栽过的坑）。
 *   行数上界由 `tests/l23_o5_diag_split.test.mjs` 钉住：装配面 ≤ 400 行、每片 ≤ 2100 行，涨了判红。
 *
 * ★ 拆片时确认的一处旧账（本该单独记账，这里如实写下）：`_recallExplainLib` 在本文件里曾有**两份**
 *   —— 第 55 行的取库口访问器与第 1763 行的 engine 版同处一个作用域，后者静默覆盖前者，前者是死代码
 *   且没人验。拆片顺带把它删了（生效版本原样留在 part-a），判据把"全仓只剩一份、且是 engine 版"钉住。
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
    /* [v3.441.0 · L13-X4] 事实版本账的取库口（注入优先，缺席回落 _moduleLib 直取）。
     *   为什么 X4 要它：降级的落笔必须走 `fact-version.setOrigin`（既有 owner），
     *   而本文件此前只注入过 `_factStateLib`（准入面），没有版本账本身。 */
    function _factVersionLib() {
        if (_libs._factVersionLib) return _libs._factVersionLib.apply(null, arguments);
        return _moduleLib(function () { return (typeof window !== 'undefined' ? window.LonShaFactVersion : null); }, 'fact-version.js');
    }
    function _fatedRecallLib() { return _libs._fatedRecallLib ? _libs._fatedRecallLib.apply(null, arguments) : null; }
    function _loreCrosscheckLib() { return _libs._loreCrosscheckLib ? _libs._loreCrosscheckLib.apply(null, arguments) : null; }
    function _materialPackLib() { return _libs._materialPackLib ? _libs._materialPackLib.apply(null, arguments) : null; }
    function _narrativeLayerLib() { return _libs._narrativeLayerLib ? _libs._narrativeLayerLib.apply(null, arguments) : null; }
    function _perspectiveCardLib() { return _libs._perspectiveCardLib ? _libs._perspectiveCardLib.apply(null, arguments) : null; }
    function _relationHistoryLib() { return _libs._relationHistoryLib ? _libs._relationHistoryLib.apply(null, arguments) : null; }
    function _returnGateLib() { return _libs._returnGateLib ? _libs._returnGateLib.apply(null, arguments) : null; }
    function _summaryProvenanceLib() { return _libs._summaryProvenanceLib ? _libs._summaryProvenanceLib.apply(null, arguments) : null; }
    function _evidenceSourceLocatorLib() {
        if (_libs._evidenceSourceLocatorLib) return _libs._evidenceSourceLocatorLib.apply(null, arguments);
        return _moduleLib(function () { return (typeof window !== 'undefined' ? window.LonShaEvidenceSourceLocator : null); }, 'evidence-source-locator.js');
    }

    function _testimonyBoardLib() { return _libs._testimonyBoardLib ? _libs._testimonyBoardLib.apply(null, arguments) : null; }
    function _worldlineMemoryLib() { return _libs._worldlineMemoryLib ? _libs._worldlineMemoryLib.apply(null, arguments) : null; }
    /* [v3.428.0 · L12-O1] 七件零消费内核的取库口（宿主侧只留转发，业务不在 index.js 里拼）。
     *   为什么集中在这里而不是各自的文件：本仓纪律「新出口优先落在既有模块」——
     *   engine-diagnostic-lines.js 已是十二个诊断面的汇聚点，再加五件不引入新层。
     *   每件都由 bindDeps 的 libs 注入（与 _worldlineMemoryLib 同形），缺席即 null。 */
    function _institutionLib() { return _libs._institutionLib ? _libs._institutionLib.apply(null, arguments) : null; }
    function _relationDynamicsLib() { return _libs._relationDynamicsLib ? _libs._relationDynamicsLib.apply(null, arguments) : null; }
    function _agencyContractLib() { return _libs._agencyContractLib ? _libs._agencyContractLib.apply(null, arguments) : null; }
    /* [v3.440.0 · L13-X7] 习惯与成长证据面（只读）。取库口在 index.js（宿主侧），此处只做接收。
     *   与 _agencyContractLib 同形：缺席即 null，读面据此落 absent 而不是「0 条」。
     */
    function _habitGrowthLib() { return _libs._habitGrowthLib ? _libs._habitGrowthLib.apply(null, arguments) : null; }
    function _symbolicEvolutionLib() { return _libs._symbolicEvolutionLib ? _libs._symbolicEvolutionLib.apply(null, arguments) : null; }
    function _eraInheritanceLib() { return _libs._eraInheritanceLib ? _libs._eraInheritanceLib.apply(null, arguments) : null; }
    /* [v3.444.0 · L13-X9] 跨代传承谱系树取库口（era-continuation-inheritance-tree.js）。
     *   ★ 与 `_eraInheritanceLib`（era-inheritance.js）**不是同一件**：那是「时代转场 +
     *     逐项继承 + 撤销转场」（L12-O1 已接管）；本件是「传承物四态 + 秘密断代」（L13-X9）。
     *     两件名字像、用途不同，别合并 —— 合并会把「转场跑没跑」与「东西留下来没有」压成一层。
     *   与全文件 `_xxxLib()` 同形：走 _libs 注入（不在构造期缓存 —— extra_js 后加载），
     *   缺席即 null，调用方据此落 absent 而不是「0 条」。 */
    function _eraContinuationTreeLib() { return _libs._eraContinuationTreeLib ? _libs._eraContinuationTreeLib.apply(null, arguments) : null; }
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
    /* [v3.443.0 · L13-X8] 本轮条目集合摘要内核（round-entry-snapshot.js）取库口。
     *   与 _memorySeasonLib 同形：走 _libs 注入（不在构造期缓存 —— extra_js 后加载）。 */
    function _roundSnapshotLib() { return _libs._roundSnapshotLib ? _libs._roundSnapshotLib.apply(null, arguments) : null; }
    function _meaningMapLib() { return _libs._meaningMapLib ? _libs._meaningMapLib.apply(null, arguments) : null; }
    function _symbiosisBridgeLib() { return _libs._symbiosisBridgeLib ? _libs._symbiosisBridgeLib.apply(null, arguments) : null; }
    function _memoryLineageLib() { return _libs._memoryLineageLib ? _libs._memoryLineageLib.apply(null, arguments) : _moduleLib(() => window.LonShaMemoryLineageReplay, 'memory-lineage-replay.js'); }
    /* [v3.433.0 · L13-X2] 反事实推演面取库口：bench 模块是 UMD，挂 globalThis.CounterfactualExperimentBench
     *   （不是 LonSha 前缀独占名，_moduleLib 的「路径字面量/_moduleLib 调用」两类命中都能登记）。
     *   _libs 注入优先、globalThis 回落，与 _memoryLineageLib 同形。 */
    function _counterfactualBenchLib() { return _libs._counterfactualBenchLib ? _libs._counterfactualBenchLib.apply(null, arguments) : _moduleLib(() => (typeof window !== 'undefined' ? window.CounterfactualExperimentBench : null), 'counterfactual-experiment-bench.js'); }
    /* [v3.439.0 · L13-X3] 视角投影内核取库口（pov-projection.js）。
     *   与全文件的 `_xxxLib()` 同形：**就地取库**（不在加载期缓存 —— extra_js 是后加载的），
     *   缺席一律 null（调用方按「面不可用」上报，绝不回落成一个空投影 —— 那会被读成「他什么都不知道」）。 */
    function _povProjectionLib() { return _libs._povProjectionLib ? _libs._povProjectionLib.apply(null, arguments) : _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaPovProjection : null), 'pov-projection.js'); }


    /* [L23-O5] 分片要读 `_libs`，而 `_libs` 会被 bindDeps 整个替换 ⇒ 给一个实时视图（Proxy）；
     *   无 Proxy 的老宿主回落为装载时的快照（与拆片前的可见性一致：那时各函数本就读当前 `_libs`，
     *   差别只在“装载后重绑”，老宿主上退化为不跟进 —— 已在判据里单列这条边界，不假装等价）。 */
    var _libsView = (typeof Proxy === 'function') ? new Proxy({}, {
        get: function (t, k) { return _libs ? _libs[k] : undefined; },
        set: function (t, k, v) { if (_libs) { _libs[k] = v; } return true; },
        has: function (t, k) { return !!(_libs && k in _libs); },
        ownKeys: function () { return _libs ? Object.keys(_libs) : []; },
        getOwnPropertyDescriptor: function (t, k) { return (_libs && k in _libs) ? { value: _libs[k], configurable: true, enumerable: true, writable: true } : undefined; },
    }) : _libs;

    /* [L23-O5] 顶层常量表：原先夹在各函数块之间，拆片后统一收到装配面，由 S 注入各片 */
    var RULE_TIERS = Object.freeze(['individual', 'institutional', 'public_rule', 'rumor']);
    var RULE_STATUSES = Object.freeze(['proposed', 'active', 'repealed']);
    var EVIDENCE_IMPACT_VERDICTS = Object.freeze(['adopt', 'parallel', 'pending', 'revoke']);
    var RECEIPT_OUTCOMES = Object.freeze(['accepted', 'rejected', 'timed_out', 'partial', 'partially_completed']);
    var SILENCE_QUESTIONS = Object.freeze(['not-recalled', 'blocked', 'trimmed', 'muted']);
    var SILENCE_SOURCES = Object.freeze(['ctx', 'season']);
    var SILENCE_LIFTABLE = Object.freeze({ ctx: false, season: true });

    /* ---------------- 分片装载 ---------------- */
    var _PART_FILES = ['engine-diagnostic-lines-part-a.js', 'engine-diagnostic-lines-part-b.js', 'engine-diagnostic-lines-part-c.js'];
    var _partApi = {};          /* 分片共享的 api 面（装配完成才冻结） */
    var _hidden = {};           /* 私有名共享面：跨片可达，但不扩大公开 api */
    var _installed = [];        /* 已生效分片 id（读数，供自检与判据读） */

    /* 取分片：浏览器侧由 manifest 先装载（自登记进 global.LonShaDiagParts）；
     * CJS/VM 侧没有装载顺序保证，登记表为空时自己 require 一遍。 */
    function _rawParts() {
        try { return (global && Array.isArray(global.LonShaDiagParts)) ? global.LonShaDiagParts.slice() : []; }
        catch (e) { return []; }
    }
    function _collectParts() {
        var arr = _rawParts();
        if (arr.length === 0 && typeof require !== 'undefined') {
            for (var i = 0; i < _PART_FILES.length; i++) {
                try { require('./' + _PART_FILES[i]); } catch (e) { errLog(e, 'diagnostic.parts.require'); }
            }
            arr = _rawParts();
        }
        /* 同一 id 多次登记 ⇒ 取**最后一次**：同进程里判据会先装破坏版、再装原版，
         * 若取第一次，原版就永远装不上（旧写法按 id 跳过登记，正是这个形态）。 */
        var byId = {};
        for (var k = 0; k < arr.length; k++) { var id = arr[k] && arr[k].__partId; if (id) byId[id] = arr[k]; }
        /* 装载顺序跟 _PART_FILES 的声明走，不跟登记顺序走（登记顺序取决于谁先 require） */
        var out = [];
        for (var m = 0; m < _PART_FILES.length; m++) { var tag = _PART_FILES[m].slice(-4, -3); if (byId[tag]) out.push(byId[tag]); }
        return out;
    }

    /* 依赖桩：每个名字只有一份实现（本文件），分片拿到的都是别名 */
    function _support() {
        return {
            hidden: _hidden,
            /* `_libs` 的**实时视图**：bindDeps 会整个替换 `_libs`，分片又直接读 `_libs.xxx`（30 处），
             *   拷值会让分片永远看旧对象，故给一个读写都穿透到当前 `_libs` 的视图。 */
            libs: _libsView,
            EVIDENCE_IMPACT_VERDICTS: EVIDENCE_IMPACT_VERDICTS,
            RECEIPT_OUTCOMES: RECEIPT_OUTCOMES,
            RULE_TIERS: RULE_TIERS,
            SILENCE_LIFTABLE: SILENCE_LIFTABLE,
            _agencyContractLib: _agencyContractLib,
            _causalChainLib: _causalChainLib,
            _changeset: _changeset,
            _correctionPlanLib: _correctionPlanLib,
            _counterfactualBenchLib: _counterfactualBenchLib,
            _emotionOppositeLib: _emotionOppositeLib,
            _eraContinuationTreeLib: _eraContinuationTreeLib,
            _eraInheritanceLib: _eraInheritanceLib,
            _evidenceSourceLocatorLib: _evidenceSourceLocatorLib,
            _extractionDriverLib: _extractionDriverLib,
            _factCorrectionBenchLib: _factCorrectionBenchLib,
            _factStateLib: _factStateLib,
            _factVersionLib: _factVersionLib,
            _fatedRecallLib: _fatedRecallLib,
            _habitGrowthLib: _habitGrowthLib,
            _institutionLib: _institutionLib,
            _institutionalCollectiveLib: _institutionalCollectiveLib,
            _loreCrosscheckLib: _loreCrosscheckLib,
            _materialPackLib: _materialPackLib,
            _meaningMapLib: _meaningMapLib,
            _memoryLineageLib: _memoryLineageLib,
            _memorySeasonLib: _memorySeasonLib,
            _moduleLib: _moduleLib,
            _narrativeLayerLib: _narrativeLayerLib,
            _perspectiveCardLib: _perspectiveCardLib,
            _povProjectionLib: _povProjectionLib,
            _recallEchoLib: _recallEchoLib,
            _relationDynamicsLib: _relationDynamicsLib,
            _relationHistoryLib: _relationHistoryLib,
            _returnGateLib: _returnGateLib,
            _roundSnapshotLib: _roundSnapshotLib,
            _seasonSilenceLib: _seasonSilenceLib,
            _summaryProvenanceLib: _summaryProvenanceLib,
            _symbiosisBridgeLib: _symbiosisBridgeLib,
            _symbolicEvolutionLib: _symbolicEvolutionLib,
            _testimonyBoardLib: _testimonyBoardLib,
            _worldlineMemoryLib: _worldlineMemoryLib,
            /* [v3.483.0] 两条新诊断行（装配面自有，不在分片里；台账 core_functions 已登记）。 */
            /* [v3.484.0] 四条新诊断行（装配面自有，不在分片里；台账 core_functions 已登记）。 */
            _cacheSafeSegmentsLine: _cacheSafeSegmentsLine,
            _recallGrainMergeLine: _recallGrainMergeLine,
            _recallDryRunLine: _recallDryRunLine,
            _memoryMirrorLine: _memoryMirrorLine,
            _recallProgressGateLine: _recallProgressGateLine,
            _recallProvenanceLedgerLine: _recallProvenanceLedgerLine,
            errLog: errLog
        };
    }
    /* [v3.483.0 · 缝合 lorecodex] 两条新诊断行住在装配面，不放分片。
     *   为什么：分片受 `tests/audit/diag_split_verbatim.json` 的**逐字节 sha256**约束
     *   （那张表记的是「拆前 5915 行里每个函数体」的原样，用来证明拆分只搬家不改写）。
     *   把 v3.483.0 新写的函数塞进分片，就等于让它出现在「拆前就有」的名录里 ——
     *   台账从「拆前证据」变成「随便什么都能往里塞」，那张表就不再证明任何事了。
     *   故它们落在装配面，并在同一张台账的 core_functions（**装配面函数名录**）里
     *   如实登记：判据按「聚合面函数名 − 拆前搬运 = 装配面函数名」做封闭集检查，
     *   登记了才算数，未登记就往分片里塞会被 C1/C2 当场点名。
     *
     *   口径：「未跑」「跑了但一条没拦」「拦了 N 条」三态不同形 —— 前两者读数都是 0，
     *   混同就分不清「机制没接上」与「这轮本来就没有超前条目」（本仓 R2-A 治的同族）。 */
    function _recallProgressGateLine(engine) {
        try {
            var st = engine ? engine._lastRecallProgressGate : null;
            if (!st) return '【召回进度门】未激活（本轮无召回）';
            if (st.active === false) return '【召回进度门】已跳过（原因：' + (st.reason || '未启用') + '）';
            var p = (st.progress === null || st.progress === undefined) ? '判不了' : ('第' + st.progress + '楼');
            var base = '【召回进度门】进度' + p + ' · 检查' + (st.checked || 0) + '条';
            if (!st.dropped) return base + ' · 无超前条目（本轮未拦）';
            var floors = (st.droppedItems || []).map(function (d) { return d.floor; })
                .filter(function (f) { return f !== null && f !== undefined; });
            return base + ' · **拦下超前' + st.dropped + '条**（' + floors.slice(0, 6).join('、') + '楼）· 通用设定放行'
                + (st.notSeated || 0) + '条';
        } catch (e) {
            errLog(e, 'engine._recallProgressGateLine');
            return '—（召回进度门诊断异常）';
        }
    }
    /* 措辞纪律：只说「指不出来源」，**不判真伪** —— 本仓的召回是纯本地算分，
     *   没有「读取原文」这个动作可作凭证（那是 lorecodex 有的东西，本仓没有）。
     *   说人家「编造」是超出证据的指控，故措辞只到「指不出来源」为止。 */
    function _recallProvenanceLedgerLine(engine) {
        try {
            var st = engine ? engine._lastRecallProvenanceLedger : null;
            if (!st) return '【召回来源台账】未激活（本轮无召回）';
            if (st.active === false) return '【召回来源台账】已跳过（原因：' + (st.reason || '未启用') + '）';
            var c = st.counts || {};
            var parts = ['【召回来源台账】注入' + (c.checked || 0) + '条 · 可追' + (c.traceable || 0) + '条'];
            var bad = (c.untraceable || 0);
            var empty = (c.empty || 0);
            if (bad) parts.push('**指不出来源' + bad + '条**');
            if (empty) parts.push('空条目' + empty + '条');
            if (st.strictDropped) parts.push('严格模式拦下' + st.strictDropped + '条');
            if (!bad && !empty) parts.push('全部可追');
            return parts.join(' · ');
        } catch (e) {
            errLog(e, 'engine._recallProvenanceLedgerLine');
            return '—（召回来源台账诊断异常）';
        }
    }
        /* [v3.484.0 · 缝合两份外部脚本] 四条新诊断行住在装配面，理由同 v3.483.0：
     *   分片受 `tests/audit/diag_split_verbatim.json` 逐字节 sha256 约束，新写函数
     *   塞进分片等于谎称「拆前就有」。故它们在此，并在台账 core_functions 登记。
     *
     *   措辞纪律：三态必须能分辨 —— 「没激活」「激活了但 0 条」「拦/省了多少」
     *   三种读数的数字都是 0，混同就分不清「机制没接上」与「这轮本来没事发生」。 */
    function _cacheSafeSegmentsLine(engine) {
        try {
            var st = engine ? engine._lastCacheSafeSegments : null;
            if (!st) return '【注入分段】未激活（本轮未规划注入段）';
            if (st.active === false) return '【注入分段】已跳过（原因：' + (st.reason || 'unknown') + '）';
            var r = st.readings || {};
            if (st.state === 'no_stable') return '【注入分段】无稳定段（本轮全是新内容）· 变动 ' + (r.volatileChars || 0) + ' 字';
            if (st.state === 'malformed') return '【注入分段】入参不合法';
            var pct = Math.round((r.stableRatio || 0) * 100);
            var s = '【注入分段】稳定 ' + (r.stableChars || 0) + ' 字 / 变动 ' + (r.volatileChars || 0) + ' 字 · 稳定占比 ' + pct + '%';
            s += r.cacheSafe ? '（可缓存前缀）' : '（不足 ' + Math.round((r.minRatio || 0.8) * 100) + '%，不指望命中）';
            if (st.sameAsPrev === true) s += ' · 顺序与上轮一致';
            else if (st.sameReason === 'changed') s += ' · **顺序变了（上一轮的前缀缓存作废）**';
            return s;
        } catch (e) {
            errLog(e, 'engine._cacheSafeSegmentsLine');
            return '—（注入分段诊断异常）';
        }
    }
    function _recallGrainMergeLine(engine) {
        try {
            var st = engine ? engine._lastRecallGrainMerge : null;
            if (!st) return '【双粒度择优】未激活（本轮无召回）';
            if (st.active === false) return '【双粒度择优】已跳过（原因：' + (st.reason || 'unknown') + '）';
            var c = st.counts || {};
            if (!c.both) return '【双粒度择优】同源 ' + (c.input || 0) + ' 条 → ' + (c.merged || 0) + ' 条 · 无同源对（未合并）';
            var s = '【双粒度择优】同源 ' + (c.input || 0) + ' 条 → ' + (c.merged || 0) + ' 条 · **合并 ' + c.both + ' 组**（落选 ' + (c.dropped || 0) + ' 条）';
            if (c.ties) s += ' · 同分 ' + c.ties + ' 组按摘要取边（原话仍随行）';
            return s;
        } catch (e) {
            errLog(e, 'engine._recallGrainMergeLine');
            return '—（双粒度择优诊断异常）';
        }
    }
    function _recallDryRunLine(engine) {
        try {
            var st = engine ? engine._lastRecallDryRun : null;
            if (!st) return '【召回干跑】未激活（本轮无召回）';
            if (st.active === false) return '【召回干跑】已跳过（原因：' + (st.reason || 'unknown') + '）';
            var r = st.readings || {};
            if (st.state === 'empty') return '【召回干跑】本轮候选 0 条';
            var s = '【召回干跑】候选 ' + (r.candidateCount || 0) + ' 条 · 进预算 ' + (r.admitted || 0) + ' 条';
            if (r.cut) s += ' · **被预算挡下 ' + r.cut + ' 条**';
            if (r.budgetTokens !== null && r.budgetTokens !== undefined) s += ' · ' + (r.tokensUsed || 0) + '/' + r.budgetTokens + ' token';
            var reds = (st.redLines || []).filter(function (x) { return x.state === 'red'; });
            if (reds.length) s += ' · **红线 ' + reds.length + ' 条**（' + reds.map(function (x) { return x.key; }).join('、') + '）';
            return s;
        } catch (e) {
            errLog(e, 'engine._recallDryRunLine');
            return '—（召回干跑诊断异常）';
        }
    }
    function _memoryMirrorLine(engine) {
        try {
            var st = engine ? engine._lastMemoryMirror : null;
            if (!st) return '【记忆文本镜像】未渲染（尚无导出动作）';
            if (st.active === false) return '【记忆文本镜像】已跳过（原因：' + (st.reason || 'unknown') + '）';
            return '【记忆文本镜像】' + (st.lines || 0) + ' 行 / ' + (st.chars || 0) + ' 字（可回读）';
        } catch (e) {
            errLog(e, 'engine._memoryMirrorLine');
            return '—（记忆文本镜像诊断异常）';
        }
    }
function _installParts() {
        var parts = _collectParts();
        var S = _support();
        for (var i = 0; i < parts.length; i++) {
            try {
                parts[i](_partApi, S);
                if (parts[i].__partId && _installed.indexOf(parts[i].__partId) < 0) _installed.push(parts[i].__partId);
            } catch (e) { errLog(e, "diagnostic.parts.install"); }
        }
        return _installed.slice();
    }

    var _coreApi = { bindDeps: bindDeps };
    /* [v3.483.0] 两条新诊断行挂在 `_coreApi`（装配面自有实现）：index.js 的诊断行委托桩
     *   走 `M._recallProgressGateLine(this, ...)`，所以它们必须出现在冻结后的 api 上。
     *   放进 `_coreApi` 而不是 `_partApi`，是因为它们不属于任何分片（见上方长注释）。 */
    _coreApi._recallProgressGateLine = _recallProgressGateLine;
    _coreApi._recallProvenanceLedgerLine = _recallProvenanceLedgerLine;
    _coreApi.RULE_TIERS = RULE_TIERS;
    _coreApi.RULE_STATUSES = RULE_STATUSES;
    _coreApi.EVIDENCE_IMPACT_VERDICTS = EVIDENCE_IMPACT_VERDICTS;
    _coreApi.RECEIPT_OUTCOMES = RECEIPT_OUTCOMES;
    _coreApi.SILENCE_QUESTIONS = SILENCE_QUESTIONS;
    _coreApi.SILENCE_SOURCES = SILENCE_SOURCES;
    _coreApi.SILENCE_LIFTABLE = SILENCE_LIFTABLE;
    _installParts();
    var api = Object.freeze(Object.assign({}, _partApi, _coreApi));
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    /* L14-O8 那三个出口**不在** api 冻结表里，原来靠装配面作用域取到（这正是“api 面不完整但导出可见”的旧形态）；
     * 拆片后它们落在分片私有面，故这里从 api 或 hidden 取 —— 两路都取不到时为 undefined，不假装有。 */
    function _pick(name) { return (typeof api[name] === 'function') ? api[name] : _hidden[name]; }
    var _l14o8Api = Object.assign({}, api, { evidenceSourceBench: _pick('evidenceSourceBench'), evidenceSourceRebind: _pick('evidenceSourceRebind'), _evidenceSourceLine: _pick('_evidenceSourceLine') });
    global.LonShaDiagnosticLines = _l14o8Api;
    /* 自报读数：分片清单与缺片（缺片时 api 会少键，判据靠'名单覆盖率'翻红，不靠这行） */
    global.LonShaDiagnosticLinesParts = Object.freeze(_installed.slice());
    if (typeof module !== 'undefined' && module.exports) module.exports = _l14o8Api;
})(typeof window !== 'undefined' ? window : globalThis);
