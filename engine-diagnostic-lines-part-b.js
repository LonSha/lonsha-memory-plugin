/*
 * engine-diagnostic-lines-part-b.js - 诊断/委托方法分片 2/3
 *
 * ★ [v3.474.0 · L23-O5] 本片从 `engine-diagnostic-lines.js`（拆分前 5915 行）机械切出：
 *   **函数体逐字未改**（缩进都保留原样，便于逐字节对拍），只加了两样东西：
 *   ① 片头把装配面注入的桩/常量/跨片引用取成本地名字（每个名字在全仓仍只有一份实现，这里只是别名）；
 *   ② 片尾把本片函数登记到装配面的 api 上。
 *   为什么这样切：分片之间必然互相调用（本片跨片引用 4 处），
 *   若各片自带一份依赖桩，就是"同一事实两处实现"—— 本仓已为此栽过（见 `_moduleLib` 同名两份的旧账）。
 *   故依赖一律由装配面单点注入，跨片调用一律经 api 转发（调用发生在装载完成之后）。
 */
(function (global) {
    'use strict';

    /* 本片函数清单（51 个：公开 35 / 片内私有 16）
     * _promptFillLine, _changesetLine, institutionState, institutionAct, _institutionLine, relationDynamicsState, relationDynamicsAct, _relationDynamicsLine, agencyContractState, agencyContractAct, habitGrowthState, _habitGrowthLine, _agencyContractLine, symbolicEvolutionState, symbolicEvolutionAct, _symbolicEvolutionLine, eraInheritanceState, eraInheritanceAct, _eraInheritanceLine, _instRulesBag, institutionRuleState, institutionRuleAct, _institutionRuleLine, meaningViewState, meaningViewAct, _meaningViewLine, _prehistoryItems, worldlinePrehistory, _worldlinePrehistoryLine, evidenceImpactReplay, _evidenceImpactLine, _ledgerEntityLib, _evidenceSourceSpecs, _evidenceSourceApis, _evidenceSourceChat, _evidenceSourceKey, _evidenceSourceItem, _evidenceSourceRows, evidenceSourceBench, evidenceSourceRebind, _evidenceSourceLine, _gapBenchLib, _gapChatTexts, _gapSourceResolver, evidenceGapBench, evidenceGapDowngrade, _evidenceGapBenchLine, _normOutcome, actionReceiptState, actionReceiptAct, _actionReceiptLine
     */
    function install(api, S) {
        /* 装配面注入的桩与常量（别名，不是第二份实现） */
        var EVIDENCE_IMPACT_VERDICTS = S.EVIDENCE_IMPACT_VERDICTS;
        var RECEIPT_OUTCOMES = S.RECEIPT_OUTCOMES;
        var RULE_TIERS = S.RULE_TIERS;
        var _agencyContractLib = S._agencyContractLib;
        var _changeset = S._changeset;
        var _eraInheritanceLib = S._eraInheritanceLib;
        var _evidenceSourceLocatorLib = S._evidenceSourceLocatorLib;
        var _factCorrectionBenchLib = S._factCorrectionBenchLib;
        var _factVersionLib = S._factVersionLib;
        var _habitGrowthLib = S._habitGrowthLib;
        var _institutionLib = S._institutionLib;
        var _institutionalCollectiveLib = S._institutionalCollectiveLib;
        var _libs = S.libs;
        var _meaningMapLib = S._meaningMapLib;
        var _moduleLib = S._moduleLib;
        var _relationDynamicsLib = S._relationDynamicsLib;
        var _symbiosisBridgeLib = S._symbiosisBridgeLib;
        var _symbolicEvolutionLib = S._symbolicEvolutionLib;
        var _worldlineMemoryLib = S._worldlineMemoryLib;
        var errLog = S.errLog;
        /* 跨片引用：由另一片实现，调用时已装载完成 */
        var _worldlineRead = function () { return api._worldlineRead.apply(null, arguments); };
        var _worldlineState = function () { return api._worldlineState.apply(null, arguments); };
        var worldlineGate = function () { return api.worldlineGate.apply(null, arguments); };
        var worldlineJumpDraft = function () { return api.worldlineJumpDraft.apply(null, arguments); };

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
                /* [v3.440.0 · L13-X7] 每次练习**顺带留一条成长证据**。
                 *   为什么不是另开一个写入口：本体（habitRepos）与证迹（growthBundles）
                 *   必须由**同一次动作**产出 —— 分两个入口就会出现「本体记了、证迹漏了」，
                 *   而那正是 X7 要治的形态（面板说「他有这个习惯」，谁也说不清凭据是什么）。
                 *   证据 id 缺省取练习 id：练习本身就是凭据，且能回查到那一楼。
                 *   ★ 证据写入**失败不得回滚本体**，但必须在返回值里如实报出
                 *   （`evidence: 'skipped:<why>'`）—— 静默漏记比漏记更坏。
                 */
                let evidenceState = 'recorded';
                try {
                    const HG = _habitGrowthLib();
                    const prac = (out && out.practice) ? out.practice : null;
                    if (!HG || typeof HG.recordGrowthEvidence !== 'function') {
                        evidenceState = 'skipped:module-unavailable';
                    } else if (!prac) {
                        evidenceState = 'skipped:no-practice';
                    } else {
                        if (!Array.isArray(wp.growthBundles)) wp.growthBundles = [];
                        /* 寻址键 = context|approach（与 habitRepos 同一套二元组） */
                        const hkey = String(prac.context || '') + '|' + String(prac.approach || '');
                        const bi = wp.growthBundles.findIndex(x => x && typeof x === 'object'
                            && String(x.actorId || '') === ck && String(x.habitKey || '') === hkey);
                        const base = (bi >= 0) ? wp.growthBundles[bi]
                            : { actorId: ck, skillOrHabit: String(prac.approach || ''), habitKey: hkey, records: [], status: 'active' };
                        /* 阶段由**结果**定，不由调用方随口定：失败一律 failed_case；
                         *   成功默认 effective_condition；显式 stage 只在它是合法四阶段时胜出
                         *   （迁移到新场景这种只能由调用方声明）。 */
                        const legal = HG.STAGES && typeof HG.STAGES === 'object'
                            ? Object.keys(HG.STAGES).map((k) => HG.STAGES[k]) : [];
                        const outcome = String(prac.outcome || 'success');
                        let stage = HG.STAGES ? HG.STAGES.EFFECTIVE : 'effective_condition';
                        if (outcome === 'failure') stage = HG.STAGES ? HG.STAGES.FAILED : 'failed_case';
                        if (p.stage && legal.indexOf(String(p.stage)) >= 0) stage = String(p.stage);
                        const bun = HG.recordGrowthEvidence(base, {
                            stage,
                            evidenceId: String(p.evidenceId || prac.id || ''),
                            description: String(p.description || p.evidence || ('练习：' + String(prac.approach || '')).slice(0, 120)),
                            contextCondition: String(prac.context || 'general'),
                            actorId: ck,
                            skillOrHabit: String(prac.approach || ''),
                            habitKey: hkey
                        });
                        if (bi >= 0) wp.growthBundles[bi] = bun; else wp.growthBundles.push(bun);
                        engine._habitGrowthRead = null;
                    }
                } catch (e) { evidenceState = 'skipped:' + ((e && e.message) || 'thrown'); }
                engine._agencyContractRead = null;
                return { ok: true, reason: '', writes: true, evidence: evidenceState };
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


    /* ---- ③b 习惯与成长证据（character-habit-growth-evidence.js · L13-X7）------
     * 【两块账为什么必须分开】**习惯本体**在 `worldProg.habitRepos`（由
     *   `character-agency-contract.recordPractice` 按 context+approach 二元组数满 3 次 success 成形），
     *   **证据束**在 `worldProg.growthBundles`（四阶段轨迹 + 证据 id）。
     *   把它们并成一块，就会让「形成了习惯」冒充「有据可查」——
     *   而那正是 X7 要治的形态：面板说「他有这个习惯」，谁也说不清凭据是什么。
     *
     * 【只显示有证据的】证据列表里**只出现 records 非空的证据束**。
     *   成形但零证据的习惯不并进这个列表，而是在 `unproven` 里**如实单列条数**——
     *   「没留证据」与「没有这个习惯」是两件事，压在一起就变成撒谎（本仓三态纪律）。
     *
     * 【只读面】本面只有读与诊断行，**没有 act**：写入仍走既有 agencyContractAct('practice')。
     *   在这里再开一个写入口 = 第二套习惯账。
     */
    function habitGrowthState(engine, opts) {
        const absent = (why) => ({
            kind: 'habit_growth', version: 0, bundles: 0, habits: 0,
            items: [], groups: [], unproven: [], orphan: [],
            counts: { records: 0, active: 0, needsReverification: 0, actors: 0, unproven: 0, orphan: 0 },
            writesNothing: true, degraded: false, ok: false, reason: why
        });
        try {
            const HG = _habitGrowthLib();
            if (!HG || typeof HG.describeGrowth !== 'function') return absent('module-unavailable');
            const wp = engine && engine.worldProg;
            const bundles = (wp && Array.isArray(wp.growthBundles)) ? wp.growthBundles : [];
            const repos = (wp && Array.isArray(wp.habitRepos)) ? wp.habitRepos : [];
            const o = (opts && typeof opts === 'object') ? opts : {};
            const only = String(o.actor || '').trim();
            let degraded = false;
            /* 证据面：逐束走内核摘要（**面板不自己数阶段** —— 各数一遍就有各数一遍的口径） */
            const items = [];
            for (const b of bundles) {
                if (!b || typeof b !== 'object') { degraded = true; continue; }
                const d = HG.describeGrowth(b);
                if (d.degraded) degraded = true;
                if (!d.total) continue;
                const actorId = String(d.actorId || '');
                if (only && actorId !== only) continue;
                items.push({
                    actorId,
                    /* key = 习惯本体的寻址键（context|approach）；旧束无该字段时回落 skillOrHabit。
                     *   回落是**如实**的：那束证据本来就只记得住一个名字。 */
                    key: String(d.habitKey || d.skillOrHabit || ''),
                    keySource: d.habitKey ? 'habitKey' : 'skillOrHabit',
                    status: String(d.status || 'active'),
                    total: d.total,
                    counts: d.counts,
                    reachedStage: String(d.reachedStage || ''),
                    reachedLabel: String(d.reachedLabel || ''),
                    latest: d.latest,
                    evidenceIds: d.evidenceIds
                });
            }
            /* 按角色分组（面板按角色列，**不按习惯名聚合** —— 不同角色可能同名不同事） */
            const byActor = {};
            for (const it of items) {
                const k = it.actorId || '（未署名）';
                (byActor[k] = byActor[k] || []).push(it);
            }
            const groups = Object.keys(byActor).sort().map((a) => ({ actor: a, count: byActor[a].length, items: byActor[a] }));
            /* 对账一：成形但零证据（**不并进证据列表**，只报出来） */
            const provenKeys = new Set(items.map((x) => x.actorId + '|' + x.key));
            const unproven = [];
            let habits = 0;
            for (const repo of repos) {
                if (!repo || typeof repo !== 'object') { degraded = true; continue; }
                const actor = String(repo.actor || '');
                const hs = Array.isArray(repo.habits) ? repo.habits : [];
                for (const h of hs) {
                    if (!h || typeof h !== 'object') { degraded = true; continue; }
                    habits += 1;
                    const key = String(h.context || '') + '|' + String(h.approach || '');
                    if (only && actor !== only) continue;
                    if (provenKeys.has(actor + '|' + key)) continue;
                    unproven.push({
                        actorId: actor, key,
                        status: String(h.status || 'active'),
                        formedAtPractices: Number(h.formedAtPractices || 0),
                        exceptionCondition: String(h.exceptionCondition || '')
                    });
                }
            }
            /* 对账二：有证据束但找不到本体（**不猜对应**，如实报出来） */
            const knownKeys = new Set();
            for (const repo of repos) {
                if (!repo || typeof repo !== 'object') continue;
                const actor = String(repo.actor || '');
                for (const h of (Array.isArray(repo.habits) ? repo.habits : [])) {
                    if (h && typeof h === 'object') knownKeys.add(actor + '|' + String(h.context || '') + '|' + String(h.approach || ''));
                }
            }
            const orphan = items
                .filter((x) => !knownKeys.has(x.actorId + '|' + x.key))
                .map((x) => ({ actorId: x.actorId, key: x.key, total: x.total }));
            let records = 0, active = 0, needsRev = 0;
            for (const it of items) {
                records += it.total;
                if (it.status === 'needs_reverification') needsRev += 1; else active += 1;
            }
            const r = {
                kind: 'habit_growth',
                /* 内核 VERSION 不进读面（本模块没有 VERSION 常量）：版本由 manifest 与
                 *   判据侧统一过问，读面不自造一个数 —— 自造的数会被当成第二份真源。 */
                version: 0,
                bundles: items.length,
                habits,
                items, groups, unproven, orphan,
                counts: { records, active, needsReverification: needsRev, actors: groups.length, unproven: unproven.length, orphan: orphan.length },
                /* 阶段可读名以**内核**为准（面板不许自己写一份中文，两份会漂） */
                stageLabels: (HG.STAGE_LABELS && typeof HG.STAGE_LABELS === 'object') ? HG.STAGE_LABELS : {},
                writesNothing: true,
                degraded,
                ok: true,
                reason: items.length ? (degraded ? 'degraded' : '') : 'empty'
            };
            if (engine) engine._habitGrowthRead = r;
            return r;
        } catch (e) { errLog(e, 'engine.habitGrowthState'); return absent('thrown: ' + ((e && e.message) || e)); }
    }
    /* 诊断行：只一行、只报读数，不带正文（证据描述可能很长且会进注入）。 */
    function _habitGrowthLine(engine) {
        try {
            const HG = _habitGrowthLib();
            if (!HG || typeof HG.describeGrowth !== 'function') return '模块未加载（character-habit-growth-evidence.js）';
            const cached = engine && engine._habitGrowthRead;
            const r = (cached && cached.ok === true) ? cached : habitGrowthState(engine, {});
            if (!r || r.ok !== true) return '不可用 · ' + ((r && r.reason) || 'unknown');
            if (r.bundles === 0) return '尚无成长证据束' + (r.unproven ? '（成形待证 ' + r.unproven + ' 条）' : '');
            return '证据束 ' + r.bundles + ' 条 / ' + r.counts.records + ' 条证迹 · 待复验 ' + r.counts.needsReverification
                + ' · 成形待证 ' + r.counts.unproven + (r.counts.orphan ? ' · 无主束 ' + r.counts.orphan : '');
        } catch (e) { errLog(e, 'engine._habitGrowthLine'); return '—（诊断异常）'; }
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
    var RULE_TIERS = Object.freeze(['individual', 'institutional', 'public_rule', 'rumor']);  // [L23-O5] 常量表已上移到装配面
    var RULE_STATUSES = Object.freeze(['proposed', 'active', 'repealed']);  // [L23-O5] 常量表已上移到装配面

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
    var EVIDENCE_IMPACT_VERDICTS = Object.freeze(['adopt', 'parallel', 'pending', 'revoke']);  // [L23-O5] 常量表已上移到装配面

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

    /* ---- L14-O8 evidence source locator -----------------------------------
     * Read-only locator plus one-item confirmed rebind. The workbench ledger
     * registry remains the only source of ledger state and ref construction.
     */
    function _ledgerEntityLib() {
        if (_libs._ledgerEntityLib) return _libs._ledgerEntityLib.apply(null, arguments);
        return _moduleLib(function () { return (typeof window !== 'undefined' ? window.LonShaLedgerEntity : null); }, 'ledger-entity.js');
    }
    function _evidenceSourceSpecs() {
        try { return _libs._evidenceQueryLedgersOf ? _libs._evidenceQueryLedgersOf() : []; }
        catch (_e) { return []; }
    }
    function _evidenceSourceApis() {
        try { return _libs._ledgerApis ? _libs._ledgerApis() : {}; }
        catch (_e) { return {}; }
    }
    function _evidenceSourceChat(opts) {
        if (opts && Array.isArray(opts.chat)) return opts.chat;
        try {
            const c = (typeof window !== 'undefined' && window.SillyTavern
                && typeof window.SillyTavern.getContext === 'function')
                ? (window.SillyTavern.getContext() || {}) : null;
            return c && Array.isArray(c.chat) ? c.chat : null;
        } catch (_e) { return null; }
    }
    function _evidenceSourceKey(spec, item, index) {
        let p = {};
        try { p = spec.project ? (spec.project(item, null) || {}) : {}; } catch (_e) { p = {}; }
        let key = '';
        try { key = item && (item.id || item.key || (typeof spec.keyOf === 'function' ? spec.keyOf(item) : '') || p.title); }
        catch (_e) { key = ''; }
        return String(key || ('#' + index));
    }
    function _evidenceSourceItem(ref, engine) {
        const s = String(ref || '').trim();
        const at = s.indexOf(':');
        if (at <= 0) return { ok: false, reason: 'bad-ref', item: null, spec: null, ledger: '' };
        const id = s.slice(0, at);
        const key = s.slice(at + 1);
        const spec = _evidenceSourceSpecs().find((x) => x && x.id === id);
        if (!spec) return { ok: false, reason: 'unknown-ledger', item: null, spec: null, ledger: id };
        const apis = _evidenceSourceApis();
        let state;
        try { state = typeof spec.state === 'function' ? spec.state(engine) : undefined; } catch (_e) { state = undefined; }
        let items = [];
        try { items = spec.pick ? (spec.pick(apis[id] || null, state) || []) : []; } catch (_e) { items = []; }
        if (!Array.isArray(items)) items = [];
        for (let i = 0; i < items.length; i++) {
            if (_evidenceSourceKey(spec, items[i], i) === key) return { ok: true, reason: 'ok', item: items[i], spec, ledger: id, index: i, ref: s };
        }
        return { ok: false, reason: state == null ? 'ledger-absent' : 'not-found', item: null, spec, ledger: id, ref: s };
    }
    function _evidenceSourceRows(engine, opts) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const specs = _evidenceSourceSpecs();
        const apis = _evidenceSourceApis();
        const refs = Array.isArray(o.refs) ? o.refs.map(String) : (o.ref ? [String(o.ref)] : null);
        const rows = [];
        if (refs) {
            for (const ref of refs) {
                const hit = _evidenceSourceItem(ref, engine);
                rows.push(hit.ok ? hit : { ok: false, ref, reason: hit.reason, ledger: hit.ledger || '' });
            }
            return rows;
        }
        for (const spec of specs) {
            let state;
            try { state = spec.state ? spec.state(engine) : undefined; } catch (_e) { state = undefined; }
            let items = [];
            try { items = spec.pick ? (spec.pick(apis[spec.id] || null, state) || []) : []; } catch (_e) { items = []; }
            if (!Array.isArray(items)) continue;
            for (let i = 0; i < items.length; i++) rows.push({ ok: true, item: items[i], spec, ledger: spec.id, index: i, ref: spec.id + ':' + _evidenceSourceKey(spec, items[i], i) });
        }
        return rows;
    }
    function evidenceSourceBench(engine, opts) {
        const bad = (reason) => ({ kind: 'evidence_source', version: 1, ok: false, reason, writesNothing: true, scanned: 0, rows: [], counts: {} });
        try {
            const L = _evidenceSourceLocatorLib();
            if (!L || typeof L.locate !== 'function') return bad('module-unavailable');
            const chat = _evidenceSourceChat(opts);
            if (!Array.isArray(chat)) return bad('chat-unavailable');
            const rows = [];
            const counts = {};
            for (const entry of _evidenceSourceRows(engine, opts)) {
                if (!entry.ok) { rows.push({ ref: entry.ref || '', ledger: entry.ledger || '', ok: false, reason: entry.reason }); continue; }
                const result = L.locate(entry.item, chat, opts);
                const row = { ref: entry.ref, ledger: entry.ledger, ok: true, state: result.state, reason: result.reason, floor: result.floor, expectedFloor: result.expectedFloor, checked: result.checked, source: result.source, recovery: result.recovery };
                rows.push(row);
                counts[result.state] = (counts[result.state] || 0) + 1;
            }
            return { kind: 'evidence_source', version: 1, ok: true, reason: '', writesNothing: true, scanned: rows.length, rows, counts };
        } catch (e) { errLog(e, 'engine.evidenceSourceBench'); return bad('thrown: ' + ((e && e.message) || e)); }
    }
    function evidenceSourceRebind(engine, opts) {
        const bad = (reason, extra) => Object.assign({ kind: 'evidence_source_rebind', version: 1, ok: false, writes: false, reason, preview: null }, extra || {});
        try {
            const L = _evidenceSourceLocatorLib();
            if (!L || typeof L.findRecoverable !== 'function' || typeof L.previewRebind !== 'function') return bad('module-unavailable');
            const o = opts && typeof opts === 'object' ? opts : {};
            const hit = _evidenceSourceItem(o.ref, engine);
            if (!hit.ok) return bad(hit.reason, { ref: o.ref || '' });
            const chat = _evidenceSourceChat(o);
            if (!Array.isArray(chat)) return bad('chat-unavailable', { ref: hit.ref });
            let candidate = o.candidate || null;
            if (!candidate && o.candidateFloor !== undefined) {
                const floor = Number(o.candidateFloor);
                const message = Number.isInteger(floor) && floor >= 0 ? chat[floor] : null;
                candidate = message ? { floor, message, fp: L.msgFpOf(message) } : null;
            }
            if (!candidate) {
                const found = L.findRecoverable(hit.item, chat, o);
                if (found.state !== 'unique') return bad(found.state === 'ambiguous' ? 'ambiguous-candidate' : 'no-recoverable-candidate', { ref: hit.ref, candidates: found.candidates || [] });
                candidate = found.candidate;
            }
            const preview = L.previewRebind(hit.item, candidate, o);
            if (!preview.ok) return bad(preview.reason, { ref: hit.ref, preview });
            if (o.confirm !== true) return { kind: 'evidence_source_rebind', version: 1, ok: true, writes: false, confirmed: false, reason: 'confirm-required', ref: hit.ref, preview };
            const LE = _ledgerEntityLib();
            if (!LE || typeof LE.reanchor !== 'function') return bad('ledger-entity-unavailable', { ref: hit.ref, preview });
            const eventKey = String(o.eventKey || ('l14-o8:' + hit.ref + ':' + preview.newFloor + ':' + preview.newFp)).slice(0, 180);
            const changed = LE.reanchor(hit.item, {
                floor: preview.newFloor, eventKey, source: 'evidence-source-locator',
                note: String(o.note || 'L14-O8 source rebind').slice(0, 120),
                opts: { maxHistory: Number(o.maxHistory) > 0 ? Number(o.maxHistory) : 20, stampFloor: true }
            });
            if (!changed) return bad('ledger-reanchor-refused', { ref: hit.ref, preview, eventKey });
            if ('fp' in hit.item || preview.newFp) hit.item.fp = preview.newFp;
            if ('textHash' in hit.item || preview.newTextHash) hit.item.textHash = preview.newTextHash;
            return { kind: 'evidence_source_rebind', version: 1, ok: true, writes: true, confirmed: true, changed: true, reason: '', ref: hit.ref, eventKey, preview };
        } catch (e) { errLog(e, 'engine.evidenceSourceRebind'); return bad('thrown: ' + ((e && e.message) || e)); }
    }
    function _evidenceSourceLine(engine, opts) {
        try {
            const r = evidenceSourceBench(engine, opts || {});
            if (!r || r.ok !== true) return '证据回源不可用 · ' + ((r && r.reason) || 'unknown');
            const c = r.counts || {};
            return '证据回源 ' + (c.verified || 0) + ' verified · ' + (c.located || 0) + ' located · ' + (c.edited || 0) + ' edited · ' + (c.missing || 0) + ' missing · ' + (c['unknown-floor'] || 0) + ' unknown-floor';
        } catch (e) { errLog(e, 'engine._evidenceSourceLine'); return '证据回源诊断异常'; }
    }

    /* ---- L13-X4 证据缺口工作台（memory-archaeology-gap-bench.js）-------------
     * ⚠️ 不要与上面的 `evidenceImpactReplay` 混为一谈：那是 **L12-X4**（证据裁决影响回放），
     *   本段是 **L13-X4**（证据缺口工作台）。期号不同、内核不同、问题也不同：
     *     L12-X4 问「一次裁决之后哪些下游要重算」；
     *     L13-X4 问「我这些结论里，哪些的证据其实薄得撑不住」。
     *
     * 产品形态：`archive` 视图列出「有结论但证据薄」的事实，按缺口严重度排序，
     *   三档成因**分列**（no-source / source-lost / contradicted），动作只有两个：
     *   去补证（跳去证据面）与降级（把该条从事实降为推测，落进既有 deltas 视图）。
     *
     * 三条口径（缺一条就会退化成本仓治过的错读数）：
     *   ① **三档不许合成一个「缺证据」**。计划原文点名这是验收项，负控制就拆这一条；
     *   ② **「判不了」不是成因，是两个布尔**（sourceChecked / conflictChecked）。
     *      正文不可读 ⇒ 来源侧判不了 ⇒ 不许写 source-lost（那会把「没核验」栽赃成「证据丢了」）；
     *      矛盾账没装上 ⇒ 矛盾侧判不了 ⇒ 不许写「查过没矛盾」；
     *   ③ **只读面自证只读**：`evidenceGapBench` 前后既有槽位逐字不变（判据会双向核对）。
     *      降级是唯一写入动作，且**不自己改状态** —— 走 fact-version.setOrigin（改可信来源）
     *      与 DeltaBook.add（人读侧留痕）两个既有 owner，理由是：在这里直改 `_factVersionState`
     *      就是第二套事实账（本仓治过多次的形态）。
     */
    function _gapBenchLib() { return _libs._gapBenchLib ? _libs._gapBenchLib.apply(null, arguments) : null; }

    /* 正文可读性探针：返回 **楼层正文数组** 或 null。
     *   为什么返回 null 而不返回 []：空数组会被下游读成「查过、一楼都没有」（判成 source-lost），
     *   而真实情况是「这台宿主没有聊天可读」（判不了）。这两件事处置相反。 */
    function _gapChatTexts() {
        try {
            const c = (typeof window !== 'undefined' && window.SillyTavern
                && typeof window.SillyTavern.getContext === 'function')
                ? (window.SillyTavern.getContext() || {}) : null;
            const chat = (c && Array.isArray(c.chat)) ? c.chat : null;
            if (!chat) return null;
            const out = [];
            for (const m of chat) {
                if (!m || typeof m !== 'object') continue;
                const sw = Math.max(0, Math.round(Number(m.swipe_id) || 0));
                const t = (Array.isArray(m.swipes) && typeof m.swipes[sw] === 'string')
                    ? m.swipes[sw]
                    : String(m.mes || m.content || m.text || '');
                if (t) out.push(t);
            }
            return out;
        } catch (_e) { return null; }
    }

    /* 证据引用核验器工厂。语义严格三态：true 找到 / false 找不到 / **null 判不了**。
     *   ★ 为什么要「长度门槛」而不是一律判 false：事实账里 `evidence` 常是**正文片段**
     *   （extract 落笔写 storyTime），也常是极短的时间标签（「清晨」「第3天」）。后者在正文里
     *   逐字找不到是**常态**，把它判成 source-lost 会把几乎所有条目栽赃成「证据丢了」。
     *   故：短引用（< 6 字）只做「找得到 → true」，找不到一律 null（判不了）—— 不猜。
     *   这条规则是本面最容易写错、也最容易被后续改动悄悄放宽的一处，故写在这里，不散在调用点。 */
    function _gapSourceResolver(texts) {
        if (!texts || !texts.length) return null;
        const hay = texts.join('\n');
        return function (ref) {
            const s = String(ref || '').trim();
            if (!s) return null;
            if (hay.indexOf(s) >= 0) return true;
            if (s.length >= 6) return false;
            return null;
        };
    }

    function evidenceGapBench(engine, opts) {
        const absent = (why) => ({
            kind: 'evidence_gap', version: 0, thin: [], counts: {},
            hitCounts: {}, threshold: 0,
            checked: { source: false, conflict: false },
            scanned: 0, thick: 0, skippedRevoked: 0, skippedMalformed: 0,
            writesNothing: true, degraded: false, ok: false, reason: why,
        });
        try {
            const GB = _gapBenchLib();
            if (!GB || typeof GB.auditGaps !== 'function') return absent('module-unavailable');
            const wp = (engine && engine.worldProg) || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            /* 事实账：**只用** fact-version 那一份（`engine._factVersionState`）。
             *   为什么不另取 `worldProg.facts`：那是另一格（老版本留下的占位），两处并存时
             *   取哪一份都会被当成「我的事实都在这儿」。本面只认有时间轴的那一份。 */
            const facts = (engine && engine._factVersionState
                && Array.isArray(engine._factVersionState.facts)) ? engine._factVersionState.facts : [];
            /* 矛盾账：ConflictBook 在宿主上叫 `conflicts`（classes 里 `conflicts` 容器）。
             *   「这本账在不在」与「账是空的」必须分开 —— 见 conflictsAvailable。 */
            const cb = (engine && engine.conflicts) ? engine.conflicts : null;
            const conflicts = (cb && Array.isArray(cb.conflicts)) ? cb.conflicts : [];
            const conflictsAvailable = !!(cb && Array.isArray(cb.conflicts));

            const texts = _gapChatTexts();
            const resolveSource = (o.resolveSource === false) ? null : _gapSourceResolver(texts);
            const r = GB.auditGaps(
                { facts: facts, conflicts: conflicts, conflictsAvailable: conflictsAvailable },
                { thinThreshold: o.thinThreshold, resolveSource: resolveSource }
            );
            const out = Object.assign({}, r, { kind: 'evidence_gap' });
            /* ★ 只读自证的另一半：本面**不写** engine 上任何缓存（连 `_evidenceGapRead` 都不落）。
             *   理由：缓存本身也是一次写，判据的「前后逐字不变」会把缓存记成违规；
             *   而本面板重跑成本只是线性扫一遍事实账（上限 MAX_FACTS=400），不值得为它破口径。 */
            return out;
        } catch (e) { errLog(e, 'engine.evidenceGapBench'); return absent('thrown: ' + ((e && e.message) || e)); }
    }

    /* 降级：把一条「证据薄」的事实从「事实」降为「推测」。
     *   两个动作面里唯一的写入，且**逐条**：计划明令不做「一键补全」，也没有批量降级 ——
     *   批量会掩盖误操作（与本期主轴「可撤销、可审阅」相反）。
     *   落笔走既有两个 owner（顺序有意义）：
     *     ① `fact-version.setOrigin`：改可信来源，信任门槛从此挡住它进「现状查询」；
     *     ② `DeltaBook.add(..., 'uncertain', floor)`：在人读侧留一条，`deltas` 视图看得到
     *        （计划验收原文：降级后条目出现在 deltas 视图）。
     *   ②失败不回滚①，但必须如实报（`delta: 'skipped:<why>'`）—— 静默漏记比漏记更坏。
     */
    function evidenceGapDowngrade(engine, opts) {
        const bad = (why) => ({
            kind: 'evidence_gap_downgrade', ok: false, writes: false, factId: '',
            fromOrigin: '', toOrigin: '', delta: 'skipped:not-run', reason: why,
        });
        try {
            const GB = _gapBenchLib();
            if (!GB || typeof GB.downgradePayload !== 'function') return bad('module-unavailable');
            const FV = _factVersionLib();
            if (!FV || typeof FV.setOrigin !== 'function') return bad('fact-version-unavailable');
            if (!engine || !engine._factVersionState) return bad('fact-ledger-absent');
            const o = (opts && typeof opts === 'object') ? opts : {};
            const id = String(o.factId || o.id || '').trim();
            if (!id) return bad('fact-id-required');
            const facts = Array.isArray(engine._factVersionState.facts) ? engine._factVersionState.facts : [];
            const fact = facts.find((f) => f && String(f.id) === id);
            if (!fact) return bad('fact-not-found');

            const pay = GB.downgradePayload(fact, {
                reason: String(o.why || o.reason || '证据薄'),
            });
            if (!pay || pay.ok !== true) return bad((pay && pay.reason) || 'payload-refused');

            /* 已是推测 ⇒ 幂等返回，**不重复落一次 origin 事件**（每次重放都会留一条历史）。 */
            if (pay.reason === 'already-inferred') {
                return {
                    kind: 'evidence_gap_downgrade', ok: true, writes: false, factId: id,
                    fromOrigin: pay.fromOrigin, toOrigin: pay.toOrigin,
                    delta: 'skipped:already-inferred', reason: 'already-inferred',
                };
            }

            const floor = Number.isFinite(Number(o.floor)) ? Number(o.floor)
                : (Number.isFinite(Number(fact.floor)) ? Number(fact.floor) : null);
            let r = null;
            try {
                r = FV.setOrigin(engine._factVersionState, {
                    id: id, origin: pay.toOrigin,
                    reason: 'x4-gap:' + String(o.why || 'thin-evidence').slice(0, 40),
                    source: 'x4-gap-bench', floor: floor, at: Date.now(),
                });
            } catch (e) { return bad('thrown: ' + ((e && e.message) || e)); }
            if (!r || r.ok !== true) return bad('kernel-refused:' + ((r && r.reason) || 'unknown'));
            engine._factVersionState = r.state;

            /* 人读侧留痕。②失败**不回滚**① —— 事实来源已改是既成事实，
             *   回滚会让「改了但没留痕」变成「什么都没发生」，比漏记更难查。 */
            let delta = 'recorded';
            try {
                if (!engine.deltaBook || typeof engine.deltaBook.add !== 'function') {
                    delta = 'skipped:delta-book-absent';
                } else {
                    const added = engine.deltaBook.add(pay.deltaSummary, pay.deltaStatus, floor);
                    /* DeltaBook.add 返回布尔（幂等命中/太短 → false）。false **不等于**失败吗？
                     *   不等于 —— 它意味着「这条已经在账上了（或短于 4 字被拒）」。两种都如实报。 */
                    delta = added ? 'recorded' : 'skipped:duplicate-or-too-short';
                }
            } catch (e) { delta = 'skipped:' + ((e && e.message) || 'thrown'); }

            return {
                kind: 'evidence_gap_downgrade',
                ok: true,
                writes: r.changed === true,
                factId: id,
                fromOrigin: pay.fromOrigin,
                toOrigin: pay.toOrigin,
                /* 信任度**从账侧取**，不在本层抄一份门槛表（那是第二份真源）。 */
                trust: (typeof FV.originTrustOf === 'function') ? FV.originTrustOf(pay.toOrigin) : null,
                floor: floor,
                delta: delta,
                deltaSummary: pay.deltaSummary,
                reason: '',
            };
        } catch (e) { errLog(e, 'engine.evidenceGapDowngrade'); return bad('thrown: ' + ((e && e.message) || e)); }
    }

    /* 诊断行：三档分开念。判不了与「账不在」都要念出来 —— 一行里把「没查到」与
     *   「没查」写成一个读数，正是本面要治的形态。 */
    function _evidenceGapBenchLine(engine) {
        try {
            const GB = _gapBenchLib();
            if (!GB || typeof GB.line !== 'function') return '模块未加载（memory-archaeology-gap-bench.js）';
            const r = evidenceGapBench(engine, {});
            if (!r || r.ok !== true) return '不可用 · ' + ((r && r.reason) || 'unknown');
            return GB.line(r);
        } catch (e) { errLog(e, 'engine._evidenceGapBenchLine'); return '—（诊断异常）'; }
    }

    /* ---- X5 行动回执链（memory-symbiosis-bridge.js）-------------------------
     * 产品形态：每一笔「建议—行动—结果—下次偏好」记成可审阅的链。
     * 三条口径：
     *   · **保存的是链，不是结论**（四态各自入账，失败与未执行同样有意义）；
     *   · 下游缺席 ⇒ 如实报 `absent`，**不伪造回执**；
     *   · 用户可拒绝长期保存（`persist:false` ⇒ 只留本会话，不进 worldProg）。 */
    var RECEIPT_OUTCOMES = Object.freeze(['accepted', 'rejected', 'timed_out', 'partial', 'partially_completed']);  // [L23-O5] 常量表已上移到装配面
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
    var SILENCE_QUESTIONS = Object.freeze(['not-recalled', 'blocked', 'trimmed', 'muted']);  // [L23-O5] 常量表已上移到装配面


        /* 登记：公开名进 api，私有名进共享隐藏面（跨片仍然可达，但不扩大 api 面） */
        api._promptFillLine = _promptFillLine;
        api._changesetLine = _changesetLine;
        api.institutionState = institutionState;
        api.institutionAct = institutionAct;
        api._institutionLine = _institutionLine;
        api.relationDynamicsState = relationDynamicsState;
        api.relationDynamicsAct = relationDynamicsAct;
        api._relationDynamicsLine = _relationDynamicsLine;
        api.agencyContractState = agencyContractState;
        api.agencyContractAct = agencyContractAct;
        api.habitGrowthState = habitGrowthState;
        api._habitGrowthLine = _habitGrowthLine;
        api._agencyContractLine = _agencyContractLine;
        api.symbolicEvolutionState = symbolicEvolutionState;
        api.symbolicEvolutionAct = symbolicEvolutionAct;
        api._symbolicEvolutionLine = _symbolicEvolutionLine;
        api.eraInheritanceState = eraInheritanceState;
        api.eraInheritanceAct = eraInheritanceAct;
        api._eraInheritanceLine = _eraInheritanceLine;
        api.institutionRuleState = institutionRuleState;
        api.institutionRuleAct = institutionRuleAct;
        api._institutionRuleLine = _institutionRuleLine;
        api.meaningViewState = meaningViewState;
        api.meaningViewAct = meaningViewAct;
        api._meaningViewLine = _meaningViewLine;
        api.worldlinePrehistory = worldlinePrehistory;
        api._worldlinePrehistoryLine = _worldlinePrehistoryLine;
        api.evidenceImpactReplay = evidenceImpactReplay;
        api._evidenceImpactLine = _evidenceImpactLine;
        api.evidenceGapBench = evidenceGapBench;
        api.evidenceGapDowngrade = evidenceGapDowngrade;
        api._evidenceGapBenchLine = _evidenceGapBenchLine;
        api.actionReceiptState = actionReceiptState;
        api.actionReceiptAct = actionReceiptAct;
        api._actionReceiptLine = _actionReceiptLine;
        S.hidden._instRulesBag = _instRulesBag;
        S.hidden._prehistoryItems = _prehistoryItems;
        S.hidden._ledgerEntityLib = _ledgerEntityLib;
        S.hidden._evidenceSourceSpecs = _evidenceSourceSpecs;
        S.hidden._evidenceSourceApis = _evidenceSourceApis;
        S.hidden._evidenceSourceChat = _evidenceSourceChat;
        S.hidden._evidenceSourceKey = _evidenceSourceKey;
        S.hidden._evidenceSourceItem = _evidenceSourceItem;
        S.hidden._evidenceSourceRows = _evidenceSourceRows;
        S.hidden.evidenceSourceBench = evidenceSourceBench;
        S.hidden.evidenceSourceRebind = evidenceSourceRebind;
        S.hidden._evidenceSourceLine = _evidenceSourceLine;
        S.hidden._gapBenchLib = _gapBenchLib;
        S.hidden._gapChatTexts = _gapChatTexts;
        S.hidden._gapSourceResolver = _gapSourceResolver;
        S.hidden._normOutcome = _normOutcome;
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = install;
    var _reg = global.LonShaDiagParts = global.LonShaDiagParts || [];
    /* 登记：**总是**登记，不去重 —— 同进程里判据会先装破坏版、再装原版，
     *   去重会把「最后一次装载」挡在外面，装配面就一直用旧的。由装配面按 id 取最后一次。 */
    install.__partId = 'b';
    _reg.push(install);
})(typeof window !== 'undefined' ? window : globalThis);
