/* ============================================================
 * engine-evidence-center.js — LonSha 证据工作台、结构化检索、记忆中心与生命周期集群
 *
 * [v3.370.0] 从 index.js 剥离的九账证据工作台与记忆控制中心集群：
 *   - 九账证据工作台读数与平台事件来源 (_evidenceWorkbench, _eventPlatformsFace)
 *   - 证据检索与结构化多维度查询 (searchEvidence, searchEvidenceStructured, _qaCausalEdges, _evidenceQueryEmpty, evidenceQueryFacets, evidenceSavedQueries, saveEvidenceQuery, removeEvidenceQuery, replayEvidenceQuery, evidenceQueryLine)
 *   - 记忆控制中心视图与交互 (memoryCenterDeps, _memoryCenterAbsent, memoryCenterView, memoryCenterSourceText, memoryCenterStep, memoryCenterLoad, memoryCenterFactState, memoryCenterBlankState, memoryCenterSave, memoryCenterSheet, memoryCenterDescribe, memoryCenterLine)
 *   - 事实生命周期管理 (_factLifecycleDeps, _factLifecycleAbsent, factLifecyclePlan, factLifecycleDescribe, factLifecycleLine)
 *   - 记忆包导入与准入规划 (_memoryPackageDeps, _memoryPackageAbsent, memoryPackageAdmit, memoryPackagePreview, memoryPackagePlan, memoryPackageDescribe, memoryPackageLine)
 * ============================================================ */

(function (global) {
    "use strict";

        let _injectedDeps = {};
    let _lastHost = null;
    let _currentWindow = null;

    function bindDeps(deps) {
        if (deps && typeof deps === "object") {
            _injectedDeps = Object.assign({}, _injectedDeps, deps);
        }
        return _injectedDeps;
    }

    function bindWindow(win) {
        if (win && typeof win === "object") {
            _currentWindow = win;
        }
        return _currentWindow;
    }

    function _getDep(name, fallback) {
        if (_injectedDeps && typeof _injectedDeps[name] !== "undefined") return _injectedDeps[name];
        if (_lastHost && typeof _lastHost[name] !== "undefined") return _lastHost[name];
        return fallback;
    }

    function _moduleLib(getGlobal, fileName) {
        const fn = _getDep("_moduleLib", null);
        if (typeof fn === "function") {
            try { return fn(getGlobal, fileName); } catch (_e) { return null; }
        }
        const win = (typeof window !== "undefined") ? window : (_currentWindow || (_lastHost && _lastHost.window ? _lastHost.window : null));
        try {
            if (typeof getGlobal === "function") {
                const g = getGlobal();
                if (g) return g;
            }
        } catch (_e) {}
        if (win) {
            if (fileName === "evidence-query.js" && win.LonShaEvidenceQuery) return win.LonShaEvidenceQuery;
            if (fileName === "evidence-workbench.js" && win.LonShaEvidenceWorkbench) return win.LonShaEvidenceWorkbench;
            if (fileName === "event-completeness.js" && win.LonShaEventCompleteness) return win.LonShaEventCompleteness;
            if (fileName === "memory-center.js" && win.LonShaMemoryCenter) return win.LonShaMemoryCenter;
            if (fileName === "fact-lifecycle.js" && win.LonShaFactLifecycle) return win.LonShaFactLifecycle;
            if (fileName === "memory-package.js" && win.LonShaMemoryPackage) return win.LonShaMemoryPackage;
            if (fileName === "fact-state.js" && win.LonShaFactState) return win.LonShaFactState;
            if (fileName === "fact-version.js" && win.LonShaFactVersion) return win.LonShaFactVersion;
            if (fileName === "schema-migration.js" && win.LonShaSchemaMigration) return win.LonShaSchemaMigration;
            return null;
        }
        try {
            if (typeof require === "function" && fileName) {
                return require("./" + fileName);
            }
        } catch (_e) {}
        return null;
    }

        function _evidenceWorkbenchLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaEvidenceWorkbench : (typeof window !== "undefined" ? window.LonShaEvidenceWorkbench : null)), "evidence-workbench.js"); }
    function _evidenceQueryLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaEvidenceQuery : (typeof window !== "undefined" ? window.LonShaEvidenceQuery : null)), "evidence-query.js"); }
    function _eventCompletenessLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaEventCompleteness : (typeof window !== "undefined" ? window.LonShaEventCompleteness : null)), "event-completeness.js"); }
    function _memoryCenterLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaMemoryCenter : (typeof window !== "undefined" ? window.LonShaMemoryCenter : null)), "memory-center.js"); }
    function _factLifecycleLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaFactLifecycle : (typeof window !== "undefined" ? window.LonShaFactLifecycle : null)), "fact-lifecycle.js"); }
    function _memoryPackageLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaMemoryPackage : (typeof window !== "undefined" ? window.LonShaMemoryPackage : null)), "memory-package.js"); }
    function _factStateLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaFactState : (typeof window !== "undefined" ? window.LonShaFactState : null)), "fact-state.js"); }
    function _factVersionLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaFactVersion : (typeof window !== "undefined" ? window.LonShaFactVersion : null)), "fact-version.js"); }
    function _schemaMigrationLib() { return _moduleLib(() => (_currentWindow ? _currentWindow.LonShaSchemaMigration : (typeof window !== "undefined" ? window.LonShaSchemaMigration : null)), "schema-migration.js"); }

function errLog(e, tag) {
        const fn = _getDep("errLog", null);
        if (typeof fn === "function") {
            try { fn(e, tag); return; } catch (_) {}
        }
        try { console.warn("[engine-evidence-center] " + tag + ":", e); } catch (_) {}
    }

    function _ledgerApis(host) {
        const target = host || _lastHost;
        const fn = _getDep("_ledgerApis", null);
        if (typeof fn === "function") {
            try { return fn.call(target); } catch (_e) {}
        }
        if (target && typeof target._ledgerApis === "function") {
            try { return target._ledgerApis(); } catch (_e) {}
        }
        if (typeof global._ledgerApis === "function") {
            try { return global._ledgerApis.call(target); } catch (_e) {}
        }
        return {};
    }

    function _evidenceQueryLedgersOf(host) {
        const target = host || _lastHost;
        const fn = _getDep("_evidenceQueryLedgersOf", null);
        if (typeof fn === "function") {
            try { return fn.call(target); } catch (_e) {}
        }
        if (target && typeof target._evidenceQueryLedgersOf === "function") {
            try { return target._evidenceQueryLedgersOf(); } catch (_e) {}
        }
        if (typeof global._evidenceQueryLedgersOf === "function") {
            try { return global._evidenceQueryLedgersOf.call(target); } catch (_e) {}
        }
        return [];
    }

    /* [v3.370.0] 存档顶层键契约：外移后不再是词法自由变量，按 注入 → 宿主 → 全局 三级解析。
     *   为什么不直接裸用：本模块被 require 时不存在该常量，裸用会 ReferenceError，
     *   而该错会被调用方的 try/catch 吞成 'thrown'（现象是「包被判 reject」，归因全错）。 */
    function _archiveKeys() {
        const inj = _getDep("ARCHIVE_TOP_LEVEL_KEYS", null);
        if (Array.isArray(inj)) return inj;
        const h = _lastHost;
        if (h && Array.isArray(h.ARCHIVE_TOP_LEVEL_KEYS)) return h.ARCHIVE_TOP_LEVEL_KEYS;
        try {
            if (typeof ARCHIVE_TOP_LEVEL_KEYS !== "undefined" && Array.isArray(ARCHIVE_TOP_LEVEL_KEYS)) return ARCHIVE_TOP_LEVEL_KEYS;
        } catch (_e) {}
        return null;
    }

    function _qaHelpDeps(host) {
        const target = host || _lastHost;
        const fn = _getDep("_qaHelpDeps", null);
        if (typeof fn === "function") {
            try { return fn.call(target); } catch (_e) {}
        }
        if (target && typeof target._qaHelpDeps === "function") {
            try { return target._qaHelpDeps(); } catch (_e) {}
        }
        if (typeof global._qaHelpDeps === "function") {
            try { return global._qaHelpDeps.call(target); } catch (_e) {}
        }
        return {};
    }

    /* [v3.370.0] 面自述：与其余 engine-*.js 同规格（名字 / 角色 / 方法数），
     * 供宿主装配期与诊断面核「模块真在场且版本对得上」，不参与任何读写。 */
    function evidenceCenterDescribe() {
        return {
            name: 'engine-evidence-center.js',
            role: 'evidence workbench, structured query, memory center & fact lifecycle',
            methodsCount: 36,
        };
    }
    const exportsObj = {
        evidenceCenterDescribe: evidenceCenterDescribe,
        bindDeps,
        bindWindow,

    /**
     * [v3.214.0] R1-E：九账证据工作台读数（只读，不写任何账）。
     *
     * 【为什么需要这一面 / 修前实测后果】
     *   本仓九本账（伏笔/约定/平行事实/秘密/前文回扣/回声/事实版本/事件完整性/修复闭环）
     *   各自有 list/summarize/render，但快照 `buildBridgeSnapshot()` **一本账都不带**
     *   （`worldProg` 只带四本账的原始状态，三面账连状态都没进）。下游于是答不出
     *   「这个承诺是哪一楼说的」——出处（floor + 来源账 + 引用键）从未被汇成同一张表。
     *
     * 【九账 API 的取法：与其余模块同规格的「全局优先 + require 回落」】
     *   本方法是宿主侧接线，**不把 window 访问放进纯函数内核**
     *   （evidence-workbench.js 只吃 `opts.apis`，便于单测与移植）。
     *   渠道取法与 ledger-replay 的 FLOOR_OWNERS 同源：账本 API 经 _moduleLib 取，
     *   取不到即缺席（`module-unavailable`），**不静默当作空账**。
     *
     * 【三态处置（本面的核心纪律）】
     *   · 模块没挂   ⇒ absent + reason='module-unavailable'（等上游/宿主，不是「没有」）
     *   · 宿主没这本账 ⇒ absent + reason='state-missing'（这本账从没写过）
     *   · 账在位且空 ⇒ empty（**真读数**，不是错误）
     *   三者处置相反，压成一态就是错读数。
     */
    _evidenceWorkbench(host, ...args) {
        _lastHost = host;
        return (function () {
            try {
                const W = _evidenceWorkbenchLib();
                if (!W || typeof W.buildWorkbench !== 'function') {
                    return {
                        version: 0, at: Date.now(), ledgers: {},
                        summary: { total: 0, counts: { ok: 0, empty: 0, absent: 0 }, items: 0 },
                        selfConsistent: false, reason: 'module-unavailable'
                    };
                }
                // apis 表：id → 账本模块（**取不到给 null 而不是省略键**：
                //   省略会让「模块没装」与「登记表写漏了」同形）。
                //   九键的取法收在 _ledgerApis()（单一真源，见该函数注释：内联版曾因
                //   六个不存在的 `_xxxLedgerLib()` 而永远抛错、被吞成 'thrown'）。
                const apis = _ledgerApis();
                return W.buildWorkbench(this, { apis: apis });
            } catch (e) {
                errLog(e, 'plugin._evidenceWorkbench');
                return {
                    version: 0, at: Date.now(), ledgers: {},
                    summary: { total: 0, counts: { ok: 0, empty: 0, absent: 0 }, items: 0 },
                    selfConsistent: false, reason: 'thrown'
                };
            }
        }).apply(host, args);
    },
    /**
     * [v3.233.0] F-2：事件来源构成的**外供面**（结构化，只读，不抛）。
     *
     * 与 `_evidenceWorkbench()` 的关系：证据面把九账收成一张可查表（「这个承诺是哪一楼说的」），
     * 本方法只答其中**一件**事：事件线里的段**从哪来**（插件提取 / 手机侧 / 其它 / 未标）。
     * 为什么单独外供：构成要的是数字，不该让下游去切显示字符串。
     *
     * 三种「没有」必须可分（**不得**用 undefined 一把盖掉）：
     *   · 模块没挂 ⇒ ok:false + reason='module-unavailable'（等环境修，不是「没有事件」）
     *   · 抛错     ⇒ ok:false + reason='thrown'
     *   · 还没线   ⇒ ok:true  + reason='no-events'（真读数：这版有面，只是还没发生）
     * 返回面恒定（内核对空账也给全键），故下游按键断言即可、不必猜。
     */
    _eventPlatformsFace(host, ...args) {
        _lastHost = host;
        return (function () {
            const empty = {
                ok: false, reason: 'module-unavailable', events: [], segments: 0,
                platforms: [], levels: { extract: 0, platform: 0, other: 0, none: 0 },
                unlabeled: 0, countedEvents: 0, truncated: false
            };
            try {
                const EC = _eventCompletenessLib();
                if (!EC || typeof EC.platformFace !== 'function') return empty;
                // 状态为 null（还没写过任何线）**也照样出面**：
                //   内核对空账返回 reason='no-events' —— 那是**真读数**，
                //   与「本版没这面」（字段 present=false）处置相反。
                return EC.platformFace(this._eventThreadState || null, {});
            } catch (e) {
                errLog(e, 'plugin._eventPlatformsFace');
                return Object.assign({}, empty, { reason: 'thrown' });
            }
        }).apply(host, args);
    },
    /** [v3.214.0] R1-E：证据面内检索（纯转发到内核；取不到内核即给结构完整的空结果，不抛）。 */
    searchEvidence(host, ...args) {
        _lastHost = host;
        return (function (query, opts) {
            try {
                const W = _evidenceWorkbenchLib();
                if (!W || typeof W.search !== 'function') {
                    return { query: String(query == null ? '' : query), hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit: 0, truncated: false, reason: 'module-unavailable' };
                }
                return W.search(this._evidenceWorkbench(), query, opts);
            } catch (e) { errLog(e, 'plugin.searchEvidence'); return { query: '', hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit: 0, truncated: false, reason: 'thrown' }; }
        }).apply(host, args);
    },
    /**
     * [v3.296.0 · X1] 结构化证据查询（只读、不抛）。
     * @param {object} spec 条件：ledgers / actors / statuses / sources / floorFrom / floorTo /
     *                      revisionFrom / revisionTo / text / hasFloor（未知键进 droppedKeys）
     * @param {object} [opts] page / pageSize / sort / dir / maxPerLedger
     * @returns {object} 恒定键面（取不到内核也全键在场，下游按键断言即可）
     */
    searchEvidenceStructured(host, ...args) {
        _lastHost = host;
        return (function (spec, opts) {
            const o = opts || {};
            const ledgers = _evidenceQueryLedgersOf();
            const payload = {
                ledgers: ledgers,
                apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {}
            };
            if (o.maxPerLedger !== undefined) payload.maxPerLedger = o.maxPerLedger;
            if (o.page !== undefined) payload.page = o.page;
            if (o.pageSize !== undefined) payload.pageSize = o.pageSize;
            if (o.sort !== undefined) payload.sort = o.sort;
            if (o.dir !== undefined) payload.dir = o.dir;
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.query !== 'function') {
                return this._evidenceQueryEmpty('module-unavailable', spec, o, ledgers);
            }
            try {
                const res = Q.query(this, spec, payload);
                /* 只留**读数摘要**，不留 rows —— 存 rows 就是第二份证据库（X1 明令禁止的形态）。 */
                this._evidenceQueryLast = {
                    at: Date.now(), total: res.total, state: res.state,
                    scanned: res.scanned, counts: (res.coverage || {}).counts || null,
                    truncated: (res.coverage || {}).truncated || []
                };
                return res;
            } catch (e) {
                errLog(e, 'plugin.searchEvidenceStructured');
                return this._evidenceQueryEmpty('thrown', spec, o, ledgers);
            }
        }).apply(host, args);
    },
    /** [v3.331.0 - M4-O3] Confirmed causal edges **plus** the key-space bridge.
     *
     *  Why a bridge is required (read off both real sources):
     *    rows carry `ref` = '<ledgerId>:<entryKey>'   ('commitment:c1')
     *    chain nodes carry '<abbr>:<id>'               ('cmt:c1')
     *  Same fact, two spellings -- matching them directly can never succeed.
     *  The abbr is therefore READ OFF the chain's own `node.kind`, not
     *  restated here: a second copy of that mapping would drift away from
     *  causal-chain.js without anyone noticing.
     *
     *  Speculative edges are dropped on purpose -- an unproven link never
     *  reaches the answer surface as a cause.
     *  @returns {{edges:Array<{from:string,to:string}>, keyOf:Function|null}} */
    _qaCausalEdges(host, ...args) {
        _lastHost = host;
        return (function () {
            const none = { edges: [], keyOf: null };
            try {
                if (typeof this.causalChainGraph !== 'function') return none;
                const g = this.causalChainGraph({});
                if (!g || !g.ok) return none;
                const nodes = Array.isArray(g.nodes) ? g.nodes : [];
                const confirmed = Array.isArray(g.edges) ? g.edges : [];
                /* abbr per ledger, taken from the chain's own kinds. */
                const abbrByKind = {};
                for (const nd of nodes) {
                    if (!nd || typeof nd !== 'object') continue;
                    const id = String(nd.id == null ? '' : nd.id);
                    const kind = String(nd.kind == null ? '' : nd.kind);
                    const cut = id.indexOf(':');
                    if (cut <= 0 || !kind) continue;
                    abbrByKind[kind] = id.slice(0, cut);
                }
                const edges = [];
                for (const e2 of confirmed) {
                    if (!e2 || typeof e2 !== 'object') continue;
                    const from = e2.from == null ? '' : String(e2.from);
                    const to = e2.to == null ? '' : String(e2.to);
                    if (from && to) edges.push({ from: from, to: to });
                }
                if (!edges.length) return none;
                const keyOf = (ref) => {
                    const s2 = String(ref == null ? '' : ref);
                    const cut = s2.indexOf(':');
                    if (cut <= 0) return '';
                    const abbr = abbrByKind[s2.slice(0, cut)];
                    if (!abbr) return '';
                    return abbr + ':' + s2.slice(cut + 1);
                };
                return { edges: edges, keyOf: keyOf };
            } catch (_e) { return none; }
        }).apply(host, args);
    },
    _evidenceQueryEmpty(host, ...args) {
        _lastHost = host;
        return (function (reason, spec, opts, ledgers) {
            const o = opts || {};
            const n = Math.max(1, Math.min(200, Number(o.pageSize) > 0 ? Math.floor(Number(o.pageSize)) : 30));
            return {
                version: 0, replayKey: '', spec: (spec && typeof spec === 'object') ? spec : {},
                droppedKeys: [], emptyReason: '查询内核不可达（evidence-query.js 未加载）',
                total: 0, page: 1, pageSize: n, pages: 0, pageOutOfRange: false,
                sort: null, dir: 'asc', rows: [], hitsByLedger: {},
                scanned: 0, unmatched: {}, unmatchedUnknownFloor: [],
                coverage: {
                    ledgers: {}, counts: { ok: 0, empty: 0, absent: 0 }, scanned: 0,
                    requestedLedgers: Array.isArray(ledgers) ? ledgers.length : 0,
                    summaryBypassed: true, scanCap: 0, truncated: []
                },
                state: 'absent', reason: reason || 'module-unavailable'
            };
        }).apply(host, args);
    },
    /**
     * [v3.296.0 · X1] 检索面对账面：**模块自己的 FACETS ↔ 工作台 LEDGERS** 逐字对账。
     *   少一个 id / 多一个 id 都是可机检事实（「加了哪本账没加检索面」不靠人记）。
     * 三态（与九账口径一致）：模块没挂 / 工作台没挂 / 两边都在（ok 才表示对得上）。
     */
    evidenceQueryFacets(host, ...args) {
        _lastHost = host;
        return (function () {
            const Q = _evidenceQueryLib();
            const ledgers = _evidenceQueryLedgersOf();
            if (!Q || typeof Q.facetsAligned !== 'function') {
                return { ok: false, reason: 'module-unavailable', missing: [], extra: [], facets: 0, ledgers: ledgers.length, filterKeys: [], sortKeys: [], scanCap: 0, savedQueries: 0 };
            }
            if (!ledgers.length) {
                return { ok: false, reason: 'workbench-unavailable', missing: [], extra: [], facets: 0, ledgers: 0, filterKeys: [], sortKeys: [], scanCap: 0, savedQueries: 0 };
            }
            try {
                const al = Q.facetsAligned(ledgers);
                return {
                    ok: al.ok === true,
                    reason: al.ok === true ? '' : 'facet-misaligned',
                    missing: al.missing || [], extra: al.extra || [],
                    facets: al.count || 0, ledgers: ledgers.length,
                    filterKeys: (Q.FILTERS || []).map((f) => f.key),
                    sortKeys: (Q.SORTS || []).map((f) => f.key),
                    scanCap: Q.MAX_SCAN_PER_LEDGER || 0,
                    savedQueries: this.evidenceSavedQueries().length
                };
            } catch (e) {
                errLog(e, 'plugin.evidenceQueryFacets');
                return { ok: false, reason: 'thrown', missing: [], extra: [], facets: 0, ledgers: ledgers.length, filterKeys: [], sortKeys: [], scanCap: 0, savedQueries: 0 };
            }
        }).apply(host, args);
    },
    /* ── 保存的查询（**只存条件**；本版刻意不落盘） ──
     *   为什么不落存档：保存查询是**检索书签**，不是剧情业务面。写进 ARCHIVE_TOP_LEVEL_KEYS
     *   要连带改携带契约（D3 扫描器按 ARCHIVE ⊆ CARRYOVER ∪ EXEMPT 对账），而它跨对话
     *   毫无意义（新对话的原账本就不同）—— 为它动存档契约是拿契约换一个书签。
     *   故：**本次会话内有效**，诊断行如实写出「未落盘」，别让读者以为它会跨对话活着。
     *   存条件不存结果：存结果＝第二份证据库（原账一改，旧结果就成了旧读数冒充现读数）。
     */
    evidenceSavedQueries(host, ...args) {
        _lastHost = host;
        return (function () {
            return Array.isArray(this._evidenceSavedQueries) ? this._evidenceSavedQueries.slice() : [];
        }).apply(host, args);
    },
    /** 新增/覆盖一条保存查询（同条件即覆盖；同名不同条件是两条）。不抛。 */
    saveEvidenceQuery(host, ...args) {
        _lastHost = host;
        return (function (label, spec) {
            const empty = { ok: false, saved: false, replaced: false, dropped: 0, reason: 'module-unavailable', label: '', replayKey: '', count: 0, persisted: false };
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.upsertSaved !== 'function') return empty;
            try {
                const cur = Array.isArray(this._evidenceSavedQueries) ? this._evidenceSavedQueries : [];
                const r = Q.upsertSaved(cur, { label: label, spec: spec }, Date.now());
                this._evidenceSavedQueries = r.list;
                return {
                    ok: r.saved === true, saved: r.saved === true, replaced: r.replaced === true,
                    dropped: r.dropped || 0, reason: r.reason || '',
                    label: String(label == null ? '' : label),
                    replayKey: (r.list.length && r.list[r.list.length - 1].replayKey) || '',
                    count: r.list.length, persisted: false
                };
            } catch (e) { errLog(e, 'plugin.saveEvidenceQuery'); return Object.assign({}, empty, { reason: 'thrown' }); }
        }).apply(host, args);
    },
    /** 删除一条保存查询。不抛（找不到就如实报 not-found，不静默当删掉了）。 */
    removeEvidenceQuery(host, ...args) {
        _lastHost = host;
        return (function (replayKey) {
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.removeSaved !== 'function') return { ok: false, removed: false, reason: 'module-unavailable', count: this.evidenceSavedQueries().length };
            try {
                const cur = Array.isArray(this._evidenceSavedQueries) ? this._evidenceSavedQueries : [];
                const r = Q.removeSaved(cur, replayKey);
                this._evidenceSavedQueries = r.list;
                return { ok: r.removed === true, removed: r.removed === true, reason: r.reason || '', count: r.list.length };
            } catch (e) { errLog(e, 'plugin.removeEvidenceQuery'); return { ok: false, removed: false, reason: 'thrown', count: this.evidenceSavedQueries().length }; }
        }).apply(host, args);
    },
    /**
     * 回放一条保存查询：**用当前原账重跑**（这就是「重放一致」的全部含义）。
     * `keyMatched` 必须为 true —— 它是「存下来的条件与跑出来的条件同一个」的证据；
     * 为 false 即条件在往返中被改写（那正是要抓的缺陷，不静默）。
     */
    replayEvidenceQuery(host, ...args) {
        _lastHost = host;
        return (function (replayKey, opts) {
            const key = String(replayKey == null ? '' : replayKey);
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.replaySaved !== 'function') return { ok: false, reason: 'module-unavailable', query: null, replayKey: key, keyMatched: false, persisted: false };
            const list = this.evidenceSavedQueries();
            const entry = list.filter((it) => it && it.replayKey === key)[0] || null;
            if (!entry) return { ok: false, reason: 'not-found', query: null, replayKey: key, keyMatched: false, persisted: false };
            try {
                const r = Q.replaySaved(this, entry, {
                    ledgers: _evidenceQueryLedgersOf(),
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    page: (opts || {}).page, pageSize: (opts || {}).pageSize,
                    sort: (opts || {}).sort, dir: (opts || {}).dir
                });
                return { ok: r.ok === true, reason: r.reason || '', query: r.query, replayKey: r.replayKey, keyMatched: r.keyMatched === true, persisted: false };
            } catch (e) { errLog(e, 'plugin.replayEvidenceQuery'); return { ok: false, reason: 'thrown', query: null, replayKey: key, keyMatched: false, persisted: false }; }
        }).apply(host, args);
    },
    /**
     * [v3.296.0 · X1] 诊断一行。**三种坏法分开写**（本仓九账治理后的纪律）：
     *   模块没挂 / 登记面没对齐 / 面在位但本会话没查过 —— 后者不是缺陷，是「待用」。
     * 不在诊断行里跑真查询：查一次要扫九账全量，诊断面不许有这种副作用。
     */
    evidenceQueryLine(host, ...args) {
        _lastHost = host;
        return (function () {
            try {
                const Q = _evidenceQueryLib();
                if (!Q || typeof Q.line !== 'function') return '模块未加载（evidence-query.js）';
                const ledgers = _evidenceQueryLedgersOf();
                const al = (typeof Q.facetsAligned === 'function') ? Q.facetsAligned(ledgers) : null;
                if (al && al.ok !== true) {
                    return '⚠️ 检索面与账本登记表不对齐：缺 ' + (al.missing.join('、') || '无')
                        + ' / 多 ' + (al.extra.join('、') || '无');
                }
                const saved = this.evidenceSavedQueries().length;
                const last = this._evidenceQueryLast || null;
                if (!last) return '待用（面在位 · ' + ledgers.length + ' 账 · 保存查询 ' + saved + ' 条未落盘）';
                const c = last.counts || {};
                const bits = ['上次 ' + last.total + ' 条', '扫 ' + (last.scanned || 0) + ' / ' + (c.ok || 0) + ' 账'];
                if (c.empty) bits.push('空账 ' + c.empty);
                if (c.absent) bits.push('缺席 ' + c.absent);
                if (Array.isArray(last.truncated) && last.truncated.length) bits.push('截断 ' + last.truncated.join('、'));
                if (last.state === 'inverted-range') bits.push('（区间反转按空集）');
                return bits.join(' · ') + ' · 保存查询 ' + saved + ' 条未落盘';
            } catch (e) { errLog(e, 'plugin.evidenceQueryLine'); return '—（诊断异常）'; }
        }).apply(host, args);
    },
    /**
     * [v3.310.0 · M-X1] 控制中心的**唯一装配点**。
     *   七件里有五件同出 `evidence-query.js`（内核的单一真源），**不另抄一份条件口径**；
     *   `LEDGERS` 复用工作台登记表（`_evidenceQueryLedgersOf`，见其注释）。
     *   取不到一律 null（不是 `{}`）：内核按「值为空即缺席」判 `module-absent`，
     *   而 `{}` 会装作「在位但空」——两者处置相反，不在这里编空壳。
     */
    memoryCenterDeps(host, ...args) {
        _lastHost = host;
        return (function () {
            const Q = _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js');
            const pick = (k) => ((Q && typeof Q[k] === 'function') ? Q[k] : null);
            const FV = (typeof _factVersionLib === 'function') ? _factVersionLib() : null;
            const FS = (typeof _factStateLib === 'function') ? _factStateLib() : null;
            const FL = (typeof _factLifecycleLib === 'function') ? _factLifecycleLib() : null;
            return {
                query: pick('query'),
                normalizeSpec: pick('normalizeSpec'),
                upsertSaved: pick('upsertSaved'),
                removeSaved: pick('removeSaved'),
                replaySaved: pick('replaySaved'),
                FILTERS: (Q && Array.isArray(Q.FILTERS)) ? Q.FILTERS : null,
                LEDGERS: _evidenceQueryLedgersOf(),
                /* [v3.325.0 · M3-O8] 可选四件（缺席即相应能力降级并具名，**不冒充可用**）：
                 *   ① 换代链读面 + ② 事实账读口 + ③ 五态读面 ⇒ 详情里的修订链；
                 *   ④ 事实生命周期登记表（RULES / ACTION_SPEC）⇒ 批量影响预览。
                 *   ★ 影响面**只搬登记表本身**，不在宿主侧另抄一份处置语义。 */
                versionsOf: (FV && typeof FV.versionsOf === 'function') ? FV.versionsOf : null,
                factState: (typeof this.memoryCenterFactState === 'function') ? (() => this.memoryCenterFactState()) : null,
                FACT_STATE: (FS && typeof FS.readState === 'function') ? FS : null,
                FACT_LIFECYCLE: (FL && FL.RULES && FL.ACTION_SPEC) ? { RULES: FL.RULES, ACTION_SPEC: FL.ACTION_SPEC, DISPOSITIONS: FL.DISPOSITIONS } : null
            };
        }).apply(host, args);
    },
    /**
     * [v3.310.0 · M-X1] 控制中心内核不可达时的**同键降级**（形状与 dispatch 的 base 同键）。
     *   为什么宿主留一份形状：模块整个没挂时内核根本不可达（与 `_evidenceQueryEmpty`
     *   同规格）。`view:'error'` / `reason` 分开写 —— 「面不可用」不等于「查不到」。
     */
    _memoryCenterAbsent(host, ...args) {
        _lastHost = host;
        return (function (state, reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                version: 0, state: state || {}, spec: {}, view: 'error', reason: r,
                rows: [], actions: [], saved: [],
                pager: { page: 1, pageSize: 30, pages: 0, total: 0, outOfRange: false },
                uiFields: [],
                notes: ['记忆控制中心模块不可达（memory-center.js 未加载）⇒ 报 error/' + r + '，**不报空数据**']
            };
        }).apply(host, args);
    },
    /**
     * [v3.310.0 · M-X1] 组装一次视图（**只读**、不抛）。
     *   `host` 实参传 `this`：内核的 LEDGERS 四件套要读宿主账本，传错对象会**恒空而不报错**。
     *   `availableHandlers` 未给（undefined）⇒ 宿主尚未声明，内核原样给出声明的 kind
     *   并附 `declaredOnly` 语义 —— 「我没问」与「宿主说没有」是两件事。
     */
    memoryCenterView(host, ...args) {
        _lastHost = host;
        return (function (state, opts) {
            const o = opts || {};
            const C = _memoryCenterLib();
            if (!C || typeof C.dispatch !== 'function') return this._memoryCenterAbsent(state);
            try {
                const face = C.dispatch(this.memoryCenterDeps(), this._memoryCenterStateWithSaved(state), {
                    host: this,
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    availableHandlers: o.availableHandlers,
                    now: o.now,
                    /* [v3.325.0 · M3-O8] 「看原文」的取数口**每次现取**（不缓存、不预取）：
                     *   缓存一份正文就是第二份证据库，原账一改它就成旧读数冒充现读数。 */
                    textSource: (o.textSource !== undefined) ? o.textSource : ((r) => this.memoryCenterSourceText(r)),
                    factState: (o.factState !== undefined) ? o.factState : this._factVersionState,
                    batchSelection: o.batchSelection,
                    profileKinds: o.profileKinds
                });
                /* 只留**读数摘要**，不留 rows —— 存 rows 就是第二份证据库。 */
                this._memoryCenterLast = {
                    at: Date.now(), view: face.view, reason: face.reason,
                    total: (face.pager || {}).total || 0, page: (face.pager || {}).page || 1,
                    pages: (face.pager || {}).pages || 0,
                    rows: (face.rows || []).length, saved: (face.saved || []).length,
                    unavailable: (face.actions || []).filter((a) => a.unavailable).length,
                    /* [v3.325.0 · M3-O8] 组织层读数（**只留数，不留页**：存 pages 全量又是第二份证据库） */
                    profiles: (face.profiles || {}).count || 0,
                    detail: face.detailFace ? face.detailFace.ref : '',
                    detailChannel: face.detailFace ? face.detailFace.textChannel : '',
                    batch: face.batch ? face.batch.state : ''
                };
                return face;
            } catch (e) { errLog(e, 'plugin.memoryCenterView'); return this._memoryCenterAbsent(state, 'thrown'); }
        }).apply(host, args);
    },
    /**
     * [v3.325.0 · M3-O8] 「看**原文**」的唯一取数口（宿主侧）。
     *   【为什么必须有它】控制中心的投影面（工作台 / 查询行）本身**只带摘要**：
     *     实测 workbench 行键里没有全文列，evidence-query 行的 text 也是
     *     textOf(facet,it) 拼出来的 160 字投影。没这个口子，详情里那句「看原文」
     *     就只能显示摘要 —— 而把摘要当原文，正是本仓反复治理的「两份口径」。
     *   【为什么它是**自包含**的】只走本文件已有的 _evidenceQueryLedgersOf()
     *     + _ledgerApis() + facet 的 textFields（后者是「哪些字段算正文」的单一真源）：
     *     · 不新造第二条账本字段口径；
     *     · 不再开一份对外契约面（open_face_registry.tsv 不动）。
     *   【逐态说话】ref 不合法 / 账不在场 / 条目不在 / 该账无正文列 / 都取到了 —— 逐条具名，
     *     **不抛**（详情渲染不许因一格坏掉而整面消失）。
     * @returns {{ok:boolean, reason:string, text:string, field:string, ledger:string, id:string}}
     */
    memoryCenterSourceText(host, ...args) {
        _lastHost = host;
        return (function (ref) {
            const out = { ok: false, reason: '', text: '', field: '', ledger: '', id: '' };
            try {
                const s = String(ref == null ? '' : ref);
                const at = s.indexOf(':');
                if (at <= 0) { out.reason = 'bad-ref'; return out; }
                const lid = s.slice(0, at), iid = s.slice(at + 1);
                out.ledger = lid; out.id = iid;
                const Q = _evidenceQueryLib();
                const ledgers = _evidenceQueryLedgersOf();
                if (!Q || !Array.isArray(Q.FACETS) || !Array.isArray(ledgers)) { out.reason = 'module-unavailable'; return out; }
                const spec = ledgers.filter((l) => l && l.id === lid)[0] || null;
                if (!spec) { out.reason = 'unknown-ledger'; return out; }
                const facet = Q.FACETS.filter((f) => f && f.id === lid)[0] || null;
                if (!facet) { out.reason = 'facet-absent'; return out; }
                const fields = Array.isArray(facet.textFields) ? facet.textFields : [];
                if (!fields.length) { out.reason = 'no-text-fields'; return out; }
                const apis = (typeof _ledgerApis === 'function') ? _ledgerApis() : {};
                if (!apis[lid]) { out.reason = 'api-absent'; return out; }
                let raw = null;
                try { raw = (typeof spec.state === 'function') ? spec.state(this) : undefined; } catch (_e) { raw = undefined; }
                if (raw === undefined || raw === null) { out.reason = 'state-missing'; return out; }
                let items = [];
                try { items = (typeof spec.pick === 'function') ? (spec.pick(apis[lid], raw) || []) : []; } catch (_e) { items = []; }
                if (!Array.isArray(items)) items = [];
                const hit = items.filter((it) => it && String(it.id === undefined ? it.key : it.id) === iid)[0] || null;
                if (!hit) { out.reason = 'not-found'; return out; }
                const parts = [];
                for (const f of fields) {
                    const v = hit[f];
                    if (v === undefined || v === null) continue;
                    if (typeof v === 'object') continue;
                    const t = String(v).trim();
                    if (t) parts.push(t);
                }
                if (!parts.length) { out.reason = 'empty-fields'; return out; }
                out.ok = true;
                out.text = parts.join(' · ');
                out.field = fields.join('/');
                return out;
            } catch (e) { errLog(e, 'plugin.memoryCenterSourceText'); out.ok = false; out.reason = 'thrown'; return out; }
        }).apply(host, args);
    },
    memoryCenterStep(host, ...args) {
        _lastHost = host;
        return (function (state, action, payload, opts) {
            const C = _memoryCenterLib();
            if (!C || typeof C.step !== 'function') {
                const f = this._memoryCenterAbsent(state);
                f.handled = false;
                f.ignored = String(action == null ? '' : action);
                return f;
            }
            try {
                const face = C.step(this.memoryCenterDeps(), this._memoryCenterStateWithSaved(state), action, payload, {
                    host: this,
                    apis: (typeof _ledgerApis === 'function') ? _ledgerApis() : {},
                    availableHandlers: (opts || {}).availableHandlers,
                    now: (opts || {}).now,
                    textSource: ((opts || {}).textSource !== undefined) ? opts.textSource : ((r) => this.memoryCenterSourceText(r)),
                    factState: ((opts || {}).factState !== undefined) ? opts.factState : this._factVersionState,
                    batchSelection: (opts || {}).batchSelection,
                    profileKinds: (opts || {}).profileKinds
                });
                this._memoryCenterLast = {
                    at: Date.now(), view: face.view, reason: face.reason,
                    total: (face.pager || {}).total || 0, page: (face.pager || {}).page || 1,
                    pages: (face.pager || {}).pages || 0,
                    rows: (face.rows || []).length, saved: (face.saved || []).length,
                    unavailable: (face.actions || []).filter((a) => a.unavailable).length,
                    profiles: (face.profiles || {}).count || 0,
                    detail: face.detailFace ? face.detailFace.ref : '',
                    detailChannel: face.detailFace ? face.detailFace.textChannel : '',
                    batch: face.batch ? face.batch.state : ''
                };
                return face;
            } catch (e) {
                errLog(e, 'plugin.memoryCenterStep');
                const f = this._memoryCenterAbsent(state, 'thrown');
                f.handled = false;
                f.ignored = String(action == null ? '' : action);
                return f;
            }
        }).apply(host, args);
    },
    /** [v3.310.0 · M-X1] 界面状态归一（从存档读回来的旧状态也接）。不抛。 */
    memoryCenterLoad(host, ...args) {
        _lastHost = host;
        return (function (raw) {
            const C = _memoryCenterLib();
            if (!C || typeof C.loadState !== 'function') return null;
            try { return C.loadState(raw); } catch (e) { errLog(e, 'plugin.memoryCenterLoad'); return null; }
        }).apply(host, args);
    },
    /** [v3.325.0 · M3-O8] 事实账读口：**引用**而非拷贝（拷一份 = 链算在快照上，原账改过就不算）。不抛。 */
    memoryCenterFactState(host, ...args) {
        _lastHost = host;
        return (function () {
            return (this._factVersionState && typeof this._factVersionState === 'object') ? this._factVersionState : null;
        }).apply(host, args);
    },
    memoryCenterBlankState(host, ...args) {
        _lastHost = host;
        return (function () {
            const C = _memoryCenterLib();
            if (!C || typeof C.blankState !== 'function') return null;
            try { return C.blankState(); } catch (e) { errLog(e, 'plugin.memoryCenterBlankState'); return null; }
        }).apply(host, args);
    },
    /** [v3.310.0 · M-X1] 界面状态 → 可存形态（**只吐条件，不吐结果**）。不抛。 */
    memoryCenterSave(host, ...args) {
        _lastHost = host;
        return (function (state) {
            const C = _memoryCenterLib();
            if (!C || typeof C.saveState !== 'function') return null;
            try { return C.saveState(state); } catch (e) { errLog(e, 'plugin.memoryCenterSave'); return null; }
        }).apply(host, args);
    },
    /** [v3.310.0 · M-X1] 整页渲染串（宿主只塞进容器 + 把 `[data-mc]`/`[data-action]` 转给 handler）。 */
    memoryCenterSheet(host, ...args) {
        _lastHost = host;
        return (function (face) {
            const C = _memoryCenterLib();
            if (!C || typeof C.sheetHtml !== 'function') return '';
            try { return C.sheetHtml(face); } catch (e) { errLog(e, 'plugin.memoryCenterSheet'); return ''; }
        }).apply(host, args);
    },
    /** [v3.310.0 · M-X1] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
    memoryCenterDescribe(host, ...args) {
        _lastHost = host;
        return (function () {
            const C = _memoryCenterLib();
            if (!C || typeof C.describe !== 'function') {
                return { kind: 'memory-center-describe', version: 0, views: [], actions: 0, uiFields: 0,
                    present: 0, total: 0, missing: [], keysAligned: false, complete: false,
                    writesNothing: true, note: '记忆控制中心模块未加载（memory-center.js）', reason: 'module-unavailable' };
            }
            try {
                const d = C.describe(this.memoryCenterDeps());
                d.reason = d.complete ? '' : (d.missing.length ? 'deps-missing' : 'keys-unaligned');
                return d;
            } catch (e) { errLog(e, 'plugin.memoryCenterDescribe'); return { kind: 'memory-center-describe', version: 0, views: [], actions: 0, uiFields: 0, present: 0, total: 0, missing: [], keysAligned: false, complete: false, writesNothing: true, note: '自述抛错', reason: 'thrown' }; }
        }).apply(host, args);
    },
    /**
     * [v3.310.0 · M-X1] 诊断一行。**四种坏法分开写**（本仓纪律）：
     *   模块没挂 / 依赖缺格 / 字段映射没对齐 / 面在位（未看过 ⇒ 「待看」，不是「没有」）。
     *   不在诊断行里跑真 dispatch：看一次要扫九账全量，诊断面不许有这种副作用。
     */
    memoryCenterLine(host, ...args) {
        _lastHost = host;
        return (function () {
            try {
                const C = _memoryCenterLib();
                if (!C || typeof C.line !== 'function') return '模块未加载（memory-center.js）';
                const d = this.memoryCenterDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（memory-center.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                if (String(d.reason || '').indexOf('deps-missing') === 0 || (d.missing && d.missing.length)) {
                    return '⚠️ 依赖缺格：' + (d.missing || []).map((m) => m.key).join('、') + '（' + d.present + '/' + d.total + '）';
                }
                if (d.keysAligned === false) return '⚠️ 界面字段与条件登记表不对齐（keysAligned=false）';
                const last = this._memoryCenterLast || null;
                if (!last) return '待看（面在位 · 五态 ' + (d.views || []).length + ' · 动作 ' + d.actions + ' 个 · 界面字段 ' + d.uiFields + ' 个）';
                /* 自己拼摘要而不转调内核行：内核行自带「记忆控制中心」前缀，转调会出现两遍名。 */
                const bits2 = ['上次 ' + last.view + (last.reason ? '(' + last.reason + ')' : ''), '命中 ' + last.total + ' 条', '第 ' + last.page + '/' + (last.pages || 1) + ' 页'];
                if (last.rows) bits2.push('本页 ' + last.rows + ' 条');
                if (last.saved) bits2.push('保存条件 ' + last.saved + ' 条');
                if (last.unavailable) bits2.push('⚠️ 不可用动作 ' + last.unavailable);
                /* [v3.325.0 · M3-O8] 组织层读数并进同一行。正文通道要**说出来**：
                 *   projection（投影摘要）与 ledger-source（真原文）是两件事，不许同形。 */
                if (last.profiles) bits2.push('资料页 ' + last.profiles);
                if (last.detail) bits2.push('详情 ' + last.detail + (last.detailChannel ? '（' + last.detailChannel + '）' : ''));
                if (last.batch) bits2.push('批量预览 ' + last.batch);
                return bits2.join(' · ');
            } catch (e) { errLog(e, 'plugin.memoryCenterLine'); return '—（诊断异常）'; }
        }).apply(host, args);
    },
    /**
     * [v3.312.0 · M-X4] 事实生命周期面的**唯一装配点**。四件里两件同出别处
     *   （`FACT_STATE` 是五态单一真源、`ORIGINS` 是来源词表单一真源），本面**不另抄一份**。
     *   `SECRET_BODY_KEYS` 走**同款取件纪律**（与 branch-semantics / volume-continuation 同口径）：
     *   硬取全局名会把「别的模块没挂」变成抛错，而依赖缺席是**可表达、要如实报**的一档。
     *   取不到一律 null（不是 `{}`）：内核按「值为空即缺席」判 deps-missing，
     *   而 `{}` 会装作「在位但空」——两者处置相反，不在这里编空壳。
     */
    _factLifecycleDeps(host, ...args) {
        _lastHost = host;
        return (function (now) {
            const FS = _factStateLib();
            const FV = _factVersionLib();
            const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
            return {
                FACT_STATE: (FS && typeof FS.readState === 'function' && typeof FS.admitForLoad === 'function') ? FS : null,
                ORIGINS: (FV && Array.isArray(FV.ORIGINS) && FV.ORIGINS.length) ? FV.ORIGINS : null,
                SECRET_BODY_KEYS: (BS && Array.isArray(BS.SECRET_BODY_KEYS) && BS.SECRET_BODY_KEYS.length) ? BS.SECRET_BODY_KEYS : null,
                now: Number.isFinite(Number(now)) ? Number(now) : Date.now()
                /* ★ 只给**该给的**四件：`REQUIRED_DEPS` 之外的键一律不塞。 */
            };
        }).apply(host, args);
    },
    /**
     * [v3.312.0 · M-X4] 内核不可达时的**同键降级**。
     *   `ok:false` + `reason` 分开写：「面不可用」不等于「圈定了零条」。
     * 这个形状存在的原因与 `_memoryCenterAbsent` 同：模块整个没挂时，内核根本不可达。
     */
    _factLifecycleAbsent(host, ...args) {
        _lastHost = host;
        return (function (reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                ok: false, planId: '', disposition: '', actions: [], blocked: [], reason: r,
                matched: [], skipped: [], count: 0, total: 0, changes: [], audit: [],
                rollback: null, targetState: null, face: null, writesNothing: true,
                notes: ['事实生命周期面不可达（fact-lifecycle.js 未加载）⇒ 报 ok:false/' + r + '，**不报空计划**']
            };
        }).apply(host, args);
    },
    /**
     * [v3.312.0 · M-X4] 出一份处置计划（**只算不写**、不抛）。
     *   `state` 缺省取宿主当前事实账（`_factVersionState`）——调用方显式传入则以其为准
     *   （判据才对「拿哪一本账算」取证）。
     *   返回面原样透传（**不改写返回值**），并把**读数摘要**留在 `_lastFactLifecycle`
     *   ——存 `matched` / `audit` 全量就是第二份证据库。
     */
    factLifecyclePlan(host, ...args) {
        _lastHost = host;
        return (function (opts) {
            const o = (opts && typeof opts === 'object') ? opts : {};
            const FL = _factLifecycleLib();
            if (!FL || typeof FL.planFor !== 'function') return this._factLifecycleAbsent();
            try {
                const state = (o.state !== undefined && o.state !== null) ? o.state : this._factVersionState;
                const deps = this._factLifecycleDeps(o.now);
                const plan = FL.planFor({
                    state: state, disposition: o.disposition, actions: o.actions, criteria: o.criteria,
                    allowUnsavedDeletion: o.allowUnsavedDeletion, snapshot: o.snapshot
                }, deps);
                this._lastFactLifecycle = {
                    at: Date.now(), planId: plan.planId, disposition: plan.disposition,
                    actionCount: (plan.actions || []).length, count: plan.count || 0,
                    verdict: (plan.rollback && plan.rollback.verdict) || '', reason: plan.reason || '',
                    blocked: (plan.blocked || []).length, depsMissing: (deps.FACT_STATE ? 0 : 1)
                };
                return plan;
            } catch (e) { errLog(e, 'plugin.factLifecyclePlan'); return this._factLifecycleAbsent('thrown'); }
        }).apply(host, args);
    },
    /** [v3.312.0 · M-X4] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
    factLifecycleDescribe(host, ...args) {
        _lastHost = host;
        return (function () {
            const FL = _factLifecycleLib();
            if (!FL || typeof FL.describe !== 'function') {
                return { kind: 'fact-lifecycle-describe', version: 0, dispositions: [], actions: [], faces: [],
                    secretBodyKeys: [], auditBodyMax: 0, present: 0, total: 0, missing: [],
                    combosDistinct: false, generationOnlyHaveNoLedgerState: false, rollbackTiersReachable: false,
                    writesNothing: true, note: '事实生命周期模块未加载（fact-lifecycle.js）', reason: 'module-unavailable' };
            }
            try {
                const d = FL.describe(this._factLifecycleDeps());
                d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'plugin.factLifecycleDescribe'); return { kind: 'fact-lifecycle-describe', version: 0, dispositions: [], actions: [], faces: [], secretBodyKeys: [], auditBodyMax: 0, present: 0, total: 0, missing: [], combosDistinct: false, generationOnlyHaveNoLedgerState: false, rollbackTiersReachable: false, writesNothing: true, note: '自述抛错', reason: 'thrown' }; }
        }).apply(host, args);
    },
    /**
     * [v3.312.0 · M-X4] 诊断一行。**四种坏法分开写**（本仓纪律）：
     *   模块没挂 / 依赖缺格 / 口径不自洽（组合塌成一张表）/ 面在位（未处置过 ⇒ 「待处置」）。
     *   不在诊断行里跑真计划：看一次要扫全量事实，诊断面不许有这种副作用。
     */
    factLifecycleLine(host, ...args) {
        _lastHost = host;
        return (function () {
            try {
                const FL = _factLifecycleLib();
                if (!FL || typeof FL.line !== 'function') return '模块未加载（fact-lifecycle.js）';
                const d = this.factLifecycleDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（fact-lifecycle.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                if (String(d.reason || '').indexOf('deps-missing') === 0 || (d.missing && d.missing.length)) {
                    return '⚠️ 依赖缺格：' + (d.missing || []).map((m) => m.key).join('、') + '（' + d.present + '/' + d.total + '）';
                }
                if (d.combosDistinct === false) return '⚠️ 处置与动作被合成一张表（「禁止生成」会连原文一起删）';
                if (d.generationOnlyHaveNoLedgerState === false) return '⚠️ 生成面两态被安上了账本态（回读会拿账本读数回答生成面）';
                if (d.rollbackTiersReachable === false) return '⚠️ 回滚三档不可达（不可逆的会被说成可撤销）';
                const last = this._lastFactLifecycle || null;
                if (!last) return '待处置（面在位 · 处置 ' + (d.dispositions || []).length + ' · 动作 ' + (d.actions || []).length + ' · 面 ' + (d.faces || []).length + '）';
                const bits = ['上次 ' + (last.disposition || '—') + ' 命中 ' + last.count];
                if (last.verdict) bits.push('回滚 ' + last.verdict);
                if (last.blocked) bits.push('⚠️ 被挡 ' + last.blocked);
                if (last.reason) bits.push('理由 ' + last.reason);
                return bits.join(' · ');
            } catch (e) { errLog(e, 'plugin.factLifecycleLine'); return '—（诊断异常）'; }
        }).apply(host, args);
    },
    /**
     * [v3.313.0 · M-X8] 记忆包面的**唯一装配点**。三件里两件同出别处
     *   （`SCHEMA_MIGRATION` 是结构代际单一真源、`ARCHIVE_KEYS` 是存档键契约单一真源），
     *   本面**不另抄一份**。`SECRET_BODY_KEYS` 走同款取件纪律（与 X6/X7/X4 同口径）：
     *   取不到一律 null（不是 `{}`）——内核按「值为空即缺席」判 deps-missing。
     * ★ `ARCHIVE_KEYS` 从 `ARCHIVE_TOP_LEVEL_KEYS` 取：它就是**包内待导入键是否被本仓
     *   认识**的判据源；这里不给它一个简化子集，宁可让它与存档契约逐字同源。
     */
    _memoryPackageDeps(host, ...args) {
        _lastHost = host;
        return (function () {
            const SM = _schemaMigrationLib();
            const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
            return {
                SCHEMA_MIGRATION: (SM && typeof SM.plan === 'function') ? SM : null,
                /* ★ [v3.370.0] 外移后 `ARCHIVE_TOP_LEVEL_KEYS` 不再是词法自由变量：
                 *   裸用会在本模块被 require 时抛 ReferenceError，而该错会被调用方的
                 *   try/catch 吞成 'thrown'（现象是「包被判 reject」，归因全错）。
                 *   一律经 `_archiveKeys()` 三级解析（注入 → 宿主 → 全局）。 */
                ARCHIVE_KEYS: (function () {
                    const K = _archiveKeys();
                    return (Array.isArray(K) && K.length) ? K : null;
                })(),
                SECRET_BODY_KEYS: (BS && Array.isArray(BS.SECRET_BODY_KEYS) && BS.SECRET_BODY_KEYS.length) ? BS.SECRET_BODY_KEYS : null
                /* ★ 只给**该给的**三件：`REQUIRED_DEPS` 之外的键一律不塞。 */
            };
        }).apply(host, args);
    },
    /**
     * [v3.313.0 · M-X8] 内核不可达时的**同键降级**。
     *   `ok:false` + `reason` 分开写：「面不可用」不等于「这个包没问题」。
     */
    _memoryPackageAbsent(host, ...args) {
        _lastHost = host;
        return (function (reason) {
            const r = (typeof reason === 'string' && reason) ? reason : 'module-absent';
            return {
                ok: false, verdict: 'reject', reason: r, from: null, to: null, steps: [], unknownKeys: [],
                keysChecked: false, migratable: false, why: '',
                notes: ['记忆包面不可达（memory-package.js 未加载）⇒ 报 ok:false/' + r + '，**不报「可以导入」**']
            };
        }).apply(host, args);
    },
    /**
     * [v3.313.0 · M-X8] 判包（**只判不写**、不抛）。
     *   返回面原样透传（**不改写返回值**），并把**读数摘要**留在 `_lastMemoryPackage`
     *   ——存整包就是第二份证据库，且受限条目会随之外泄。
     */
    memoryPackageAdmit(host, ...args) {
        _lastHost = host;
        return (function (pkg, opts) {
            const MPk = _memoryPackageLib();
            if (!MPk || typeof MPk.admitPackage !== 'function') return this._memoryPackageAbsent();
            try {
                const deps = this._memoryPackageDeps();
                const res = MPk.admitPackage(pkg, opts, deps);
                this._lastMemoryPackage = {
                    at: Date.now(), verdict: res.verdict, reason: res.reason, from: res.from, to: res.to,
                    steps: (res.steps || []).length, unknownKeys: (res.unknownKeys || []).length,
                    keysChecked: res.keysChecked === true, migratable: res.migratable === true,
                    depsMissing: (deps.SCHEMA_MIGRATION ? 0 : 1) + (deps.ARCHIVE_KEYS ? 0 : 1) + (deps.SECRET_BODY_KEYS ? 0 : 1)
                };
                return res;
            } catch (e) { errLog(e, 'plugin.memoryPackageAdmit'); return this._memoryPackageAbsent('thrown'); }
        }).apply(host, args);
    },
    /**
     * [v3.313.0 · M-X8] 导入预览（只读；冲突默认**不替用户决定**）。
     */
    memoryPackagePreview(host, ...args) {
        _lastHost = host;
        return (function (pkg, target, opts) {
            const MPk = _memoryPackageLib();
            if (!MPk || typeof MPk.previewImport !== 'function') {
                return { verdict: 'blocked', entries: [], add: 0, same: 0, conflict: 0, dangling: 0, blocked: ['module-absent'], skipped: 0, targetChecked: false, why: ['module-absent'] };
            }
            try { return MPk.previewImport(pkg, target, opts); }
            catch (e) { errLog(e, 'plugin.memoryPackagePreview'); return { verdict: 'blocked', entries: [], add: 0, same: 0, conflict: 0, dangling: 0, blocked: ['thrown'], skipped: 0, targetChecked: false, why: ['thrown'] }; }
        }).apply(host, args);
    },
    /**
     * [v3.313.0 · M-X8] 出导入计划（**只算不写**）。
     *   `seen` 由调用方持有并回传 —— 幂等表**不在本仓偷偷落一份**。
     */
    memoryPackagePlan(host, ...args) {
        _lastHost = host;
        return (function (pkg, preview, opts) {
            const MPk = _memoryPackageLib();
            if (!MPk || typeof MPk.planImport !== 'function') {
                return { ok: false, importId: '', duplicate: false, applied: [], count: 0, total: 0, skipped: [], blocked: [], writesNothing: true, reason: 'module-absent' };
            }
            try { return MPk.planImport(pkg, preview, opts); }
            catch (e) { errLog(e, 'plugin.memoryPackagePlan'); return { ok: false, importId: '', duplicate: false, applied: [], count: 0, total: 0, skipped: [], blocked: [], writesNothing: true, reason: 'thrown' }; }
        }).apply(host, args);
    },
    /** [v3.313.0 · M-X8] 面自述：依赖缺哪一格、缺了会怎样（只读、不抛）。 */
    memoryPackageDescribe(host, ...args) {
        _lastHost = host;
        return (function () {
            const MPk = _memoryPackageLib();
            if (!MPk || typeof MPk.describe !== 'function') {
                return { kind: 'memory-package-describe', version: 0, granularity: [], admit: [], preview: [], sources: [],
                    rejectReasons: [], faces: [], secretBodyKeys: [], bodyMax: 0, packageKeys: [],
                    present: 0, total: 0, missing: [], admitExhaustive: false, maskFixedLength: false,
                    offline: true, writesNothing: true, note: '记忆包模块未加载（memory-package.js）', reason: 'module-unavailable' };
            }
            try {
                const d = MPk.describe(this._memoryPackageDeps());
                d.reason = (d.missing && d.missing.length) ? 'deps-missing' : '';
                return d;
            } catch (e) { errLog(e, 'plugin.memoryPackageDescribe'); return { kind: 'memory-package-describe', version: 0, granularity: [], admit: [], preview: [], sources: [], rejectReasons: [], faces: [], secretBodyKeys: [], bodyMax: 0, packageKeys: [], present: 0, total: 0, missing: [], admitExhaustive: false, maskFixedLength: false, offline: true, writesNothing: true, note: '自述抛错', reason: 'thrown' }; }
        }).apply(host, args);
    },
    /**
     * [v3.313.0 · M-X8] 诊断一行。**四种坏法分开写**（本仓纪律）：
     *   模块没挂 / 依赖缺格 / 口径不自洽（掩码不定长 ⇒ 长度本身就是读数）/ 面在位。
     *   不在诊断行里跑真导入：看一次要读全目标面，诊断面不许有这种副作用。
     */
    memoryPackageLine(host, ...args) {
        _lastHost = host;
        return (function () {
            try {
                const MPk = _memoryPackageLib();
                if (!MPk || typeof MPk.line !== 'function') return '模块未加载（memory-package.js）';
                const d = this.memoryPackageDescribe();
                if (d.reason === 'module-unavailable') return '模块未加载（memory-package.js）';
                if (d.reason === 'thrown') return '—（诊断异常）';
                if (String(d.reason || '').indexOf('deps-missing') === 0 || (d.missing && d.missing.length)) {
                    return '⚠️ 依赖缺格：' + (d.missing || []).map((m) => m.key).join('、') + '（' + d.present + '/' + d.total + '）';
                }
                if (d.maskFixedLength === false) return '⚠️ 受限正文掩码不是定长（长度本身成了读数）';
                if (d.admitExhaustive === false) return '⚠️ 准入三态不可穷尽（拒绝会被读成「要迁移」）';
                const last = this._lastMemoryPackage || null;
                if (!last) return '待导入（面在位 · 粒度 ' + (d.granularity || []).length + ' 档 · 拒绝理由 ' + (d.rejectReasons || []).length + ' 条 · 离线）';
                const bits = ['上次 ' + (last.verdict || '—')];
                if (last.from !== null && last.from !== undefined) bits.push('v' + last.from + '→v' + last.to);
                if (last.steps) bits.push('需迁 ' + last.steps + ' 步');
                if (last.unknownKeys) bits.push('⚠️ 未知键 ' + last.unknownKeys);
                if (last.keysChecked === false) bits.push('键面未判');
                if (last.reason) bits.push('理由 ' + last.reason);
                return bits.join(' · ');
            } catch (e) { errLog(e, 'plugin.memoryPackageLine'); return '—（诊断异常）'; }
        }).apply(host, args);
    },
    };

    if (typeof window !== "undefined") {
        window.LonShaEngineEvidenceCenter = exportsObj;
    }
    if (typeof globalThis !== "undefined") {
        globalThis.LonShaEngineEvidenceCenter = exportsObj;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exportsObj;
    }
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
