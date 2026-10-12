/* ================================================================
 * memory-center.js — [v3.310.0 · M-X1] 用户侧记忆控制中心
 *
 * 【它补的是哪一格（修前实测，不是「加几个筛选框」）】
 *   第二期拓展计划 M-X1 原文：X1（v3.296.0）已交付**结构化查询能力**，但「仍主要是内核出口。
 *   用户需要一个能浏览、筛选、确认、处置记忆的统一界面」。
 *   修前实测：`evidence-query.js` 是**纯函数内核** —— `query(host, spec, opts)` 返回数据，
 *   全仓**没有任何一处**把它渲染成界面，也没有任何一处把「按角色 / 时间 / 楼层 / 来源 /
 *   状态 / 秘密级别组合筛选」的**条件**收成可保存、可回放、可再编辑的对象。
 *   （实测口径：`query(` 的调用点里，UI 侧命中 0 处；`settings-ui.js` 的浏览视图
 *   全部走 `s.graph` / `s.summary` 等**快照字段**，不是九账查询面。）
 *
 * 【本模块做什么（四件事，都不改既有面）】
 *   ① **界面模型（view model）**：`state → 查询条件 → 真查询 → 视图`。
 *      界面只渲染本模块产出的视图（`sheetHtml`），**不自行拼数据** ——
 *      这样「界面上显示的内容」与「内核真查到的内容」不可能各说一套。
 *   ② **视图状态四态分形**：`result`（有命中）/ `empty`（面可查、确实没有）/
 *      `unknown`（**判不了**：条件自相矛盾 / 翻过头 / 点了不存在的账）/
 *      `error`（**面不可用**：模块缺席 / 扫描面为空 / 被包装面抛错）。
 *      四态互不同形，且**各带具名 reason** —— 本仓最贵的老账就是把这四者压成一格。
 *   ③ **保存的是「条件」不是「结果」**：沿用 `evidence-query` 的
 *      `normalizeSpec` / `replayKeyOf` / `upsertSaved` / `removeSaved` / `replaySaved`
 *      （经 deps 注入，**本模块不另抄一份条件归一**）。存结果＝第二份证据库，本仓明令禁止。
 *   ④ **动作只「声明」，不执行**：每个动作带 `kind`（`read` / `preview` / `write`）+
 *      `handlerId` + `writes` / `undo` 三个读数，由**宿主**映射到真函数执行。
 *      内核不知道宿主有没有那支枪 —— 故 `markAvailability()` 把宿主没提供的 handler
 *      从 `write` 降级为 **`unavailable`**（不假装能用，不是静默去掉）。
 *
 * 【本模块**不做**什么（边界，必须与结论一起读）】
 *   · **零写**：不写账、不写盘、**不改入参**（`dispatch` / `buildSpec` / `sheetHtml` 全程只读）；
 *     持久化由宿主负责（本模块只产出**可序列化的条件对象** `saveState()`）。
 *   · **不做第二份条目口径**：账本结构仍归 `evidence-workbench.LEDGERS`、检索面仍归
 *     `evidence-query.FACETS`，二者经 `deps` 注入复用；本模块自己的 `UI_FIELDS` 只声明
 *     **界面字段 → 条件键**的映射，并以 `keysAligned(deps)` 与真源 `FILTERS` **逐字对账**。
 *   · **不切数据窗口**：「超过 200 条仍能分页检索」由消费面保证（`evidence-query` 直读原账
 *     全量、分页由**匹配总数**驱动）；本模块**不得**再切一次 —— 再切一次就把 X1 修掉的
 *     那条缺陷（「有 900 条」与「有 200 条」同形）原样装回来。
 *   · **不摸 window / 不读 storage**：宿主实例与账 API 全部经参数进来。
 *
 * 【三态纪律（本仓反复治理过的那一类，逐条落在这里）】
 *   · 「查不到」≠「没东西可查」≠「面坏了」≠「判不了」—— 四态各有具名 reason，不合并；
 *   · 未知键 / 未知动作名**不静默忽略**：未知动作名 ⇒ `kind:'unavailable'` 并点名；
 *   · 空字符串条件**不等于**「筛空集」：空条件即「不限」（`buildSpec` 里显式丢弃空值）。
 * ================================================================ */
(function (root) {
    'use strict';
    const CENTER_VERSION = 1;
    /** 视图状态词表（**穷尽互斥**：任何一次 dispatch 恰落一态；改此处即口径变化）。 */
    const VIEW_STATES = Object.freeze(['panel', 'result', 'empty', 'unknown', 'error']);
    /** 动作种类（`write` 与 `preview` 的区别是验收要的「预览不写」那一半的落点）。 */
    const ACTION_KINDS = Object.freeze(['read', 'preview', 'write', 'unavailable']);
    /** 宿主须提供的依赖面（缺哪个、缺了会怎样，由 `describe()` 逐条回答）。 */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'query', why: '内核结构化查询（evidence-query.query）；缺席 ⇒ 整面不可用（error/module-absent）' },
        { key: 'normalizeSpec', why: '条件归一（**单一真源**：不许本模块另写一份）' },
        { key: 'upsertSaved', why: '保存条件（纯函数：传入旧表、返回新表）' },
        { key: 'removeSaved', why: '删除保存的条件' },
        { key: 'replaySaved', why: '回放保存的条件（用当前原账重跑）' },
        { key: 'FILTERS', why: '条件键登记表（UI 字段映射的对账基准）' },
        { key: 'LEDGERS', why: '账本登记表（查询面必给的 ledgers）' }
    ]);
    /**
     * [v3.325.0 · M3-O8] **可选**依赖面：资料页的详情与批量预览要用到
     *   事实生命周期 / 五态读面 / 换代链。它们**不进** REQUIRED_DEPS 的两个理由：
     *   ① 缺了它们时，浏览与筛选**依然可用**（把落靠能力升为硬依赖 = 把整面弄瞎）；
     *   ② REQUIRED_DEPS 的长度是既有判据锁住的（七件），往里塞一格会静默改口径。
     *   缺席时逐一给具名 reason（lifecycle-absent / versionsOf-absent），不假装可预览。
     */
    const OPTIONAL_DEPS = Object.freeze([
        { key: 'FACT_LIFECYCLE', why: '批量影响面（RULES / ACTION_SPEC 单一真源）；缺席 ⇒ batchPreview 落 unavailable/' },
        { key: 'FACT_STATE', why: '五态读面（active/superseded/revoked/disputed/unknown）；缺席 ⇒ 链上 state 列留空，不编一个 active' },
        { key: 'versionsOf', why: '换代链（fact-version.versionsOf）；缺席 ⇒ 只报 counter 浅链，不拿它冒充 versioned' },
        { key: 'factState', why: '宿主事实账读口（换代链的数据面）；缺席 ⇒ 链报 factState-absent，**不报「没有版本」**' },
        { key: 'textSource', why: '本行**真原文**读口 ref → {ok,text,field}|{ok:false,reason}（「看原文」的落点）；缺席 ⇒ 正文退回投影面摘要并标 projection' }
    ]);
    /** 界面字段 → 条件键（**只声明映射，不另立口径**）。 */
    const UI_FIELDS = Object.freeze([
        { ui: 'ledgers', specKey: 'ledgers', label: '账本', multi: true },
        { ui: 'actor', specKey: 'actors', label: '角色 / 参与者', multi: false },
        { ui: 'status', specKey: 'statuses', label: '状态', multi: true },
        { ui: 'source', specKey: 'sources', label: '来源', multi: false },
        { ui: 'floorFrom', specKey: 'floorFrom', label: '楼层起', multi: false },
        { ui: 'floorTo', specKey: 'floorTo', label: '楼层止', multi: false },
        { ui: 'revisionFrom', specKey: 'revisionFrom', label: '修订起', multi: false },
        { ui: 'revisionTo', specKey: 'revisionTo', label: '修订止', multi: false },
        { ui: 'text', specKey: 'text', label: '正文', multi: false },
        { ui: 'hasFloor', specKey: 'hasFloor', label: '有无楼层', multi: false }
    ]);
    /** 处置动作登记表（**声明**，不执行）。`handlerId` 是宿主侧的契约键。 */
    const ACTIONS = Object.freeze([
        { id: 'row.detail', label: '证据原文与修订链', kind: 'read', writes: false, undo: false, scope: 'row' },
        { id: 'row.repair.preview', label: '修复预览', kind: 'preview', writes: false, undo: false, scope: 'row' },
        { id: 'row.revoke', label: '撤回', kind: 'write', writes: true, undo: true, scope: 'row' },
        { id: 'row.dispute', label: '标记争议', kind: 'write', writes: true, undo: true, scope: 'row' },
        { id: 'row.export', label: '导出本条', kind: 'read', writes: false, undo: false, scope: 'row' },
        { id: 'query.save', label: '保存查询条件', kind: 'write', writes: true, undo: false, scope: 'query' },
        { id: 'query.reset', label: '清空条件', kind: 'read', writes: false, undo: false, scope: 'query' },
        { id: 'saved.replay', label: '回放', kind: 'read', writes: false, undo: false, scope: 'saved' },
        { id: 'saved.remove', label: '删除该条件', kind: 'write', writes: true, undo: false, scope: 'saved' }
    ]);
    const MAX_TEXT = 160;

    /* ── 小工具（UI 侧归一；**不重演账本口径**） ── */
    function text(v, max) {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) + '…' : s) : s;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function escAttr(t) { return esc(t).replace(/"/g, '&quot;'); }
    /** 多值字段归一（逗号 / 顿号 / 空格分隔都收）；空 ⇒ 空数组（**不筛空集**）。 */
    function splitList(v) {
        if (Array.isArray(v)) return v.map((x) => text(x, 60)).filter(Boolean);
        const s = text(v, 200);
        if (!s) return [];
        return s.split(/[,，、\s]+/).map((x) => text(x, 60)).filter(Boolean);
    }
    function strList(v) { return Array.isArray(v) ? v.map((x) => text(x, 60)).filter(Boolean) : splitList(v); }

    /** UI 字段映射与真源 `FILTERS` 对账（**映射到一个不在册的条件键即报红**）。 */
    function keysAligned(deps) {
        const filters = deps && Array.isArray(deps.FILTERS) ? deps.FILTERS : null;
        if (!filters) return { ok: false, reason: 'filters-absent', missing: UI_FIELDS.map((f) => f.specKey), extra: [] };
        const have = filters.map((f) => text(f && f.key, 40));
        const want = UI_FIELDS.map((f) => f.specKey);
        const missing = want.filter((k) => have.indexOf(k) < 0);
        const extra = have.filter((k) => want.indexOf(k) < 0);
        return { ok: missing.length === 0 && extra.length === 0, missing: missing, extra: extra, count: have.length };
    }

    /* ── 界面状态（**可序列化**：全是条件，没有一笔结果） ── */
    function blankState() {
        return {
            ledgers: [], actor: '', status: '', source: '', floorFrom: '', floorTo: '',
            revisionFrom: '', revisionTo: '', text: '', hasFloor: null,
            page: 1, pageSize: 30, sort: '', dir: 'asc', saved: [], activeSaved: '',
            /* [v3.325.0 · M3-O8] 组织轴与详情位：两者**都不是查询条件**，
             *   故不采 UI_FIELDS —— 采了会让「界面字段 ↔ 条件键」对账多出两格伪条件（B1 会报红）。 */
            profile: '', detail: '',
            /* [v3.325.0 · M3-O8] 批量选区与档位：**住在状态里**（不是每次现传）——
             *   验收原文「批量操作失败保留未完成选择」的落点：预览报出的 skipped 条仍在选区里，
             *   待用户处置，不静默丢弃。 */
            selection: [], batchAction: ''
        };
    }
    /**
     * 状态归一：接受任意形态（含从宿主存档读回来的旧状态），产出**同形状**的状态。
     *   空值一律归零（`''` / `null`），因为「空条件 = 不限」而不是「筛空集」。
     */
    function loadState(raw) {
        const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const st = blankState();
        st.ledgers = strList(src.ledgers);
        st.actor = text(src.actor, 60);
        st.status = text(src.status, 60);
        st.source = text(src.source, 60);
        const ff = numOrNull(src.floorFrom), ft = numOrNull(src.floorTo);
        st.floorFrom = ff === null ? '' : String(ff);
        st.floorTo = ft === null ? '' : String(ft);
        const rf = numOrNull(src.revisionFrom), rt = numOrNull(src.revisionTo);
        st.revisionFrom = rf === null ? '' : String(rf);
        st.revisionTo = rt === null ? '' : String(rt);
        st.text = text(src.text, 80);
        st.hasFloor = (src.hasFloor === true || src.hasFloor === 'true') ? true
            : ((src.hasFloor === false || src.hasFloor === 'false') ? false : null);
        const pg = numOrNull(src.page);
        st.page = pg === null || pg < 1 ? 1 : Math.floor(pg);
        const ps = numOrNull(src.pageSize);
        st.pageSize = ps === null || ps < 1 ? 30 : Math.min(200, Math.floor(ps));
        st.sort = text(src.sort, 40);
        st.dir = (src.dir === 'desc') ? 'desc' : 'asc';
        st.saved = Array.isArray(src.saved) ? src.saved.slice(0, 50) : [];
        st.activeSaved = text(src.activeSaved, 200);
        st.profile = text(src.profile, 80);      /* [v3.325.0 · M3-O8] 组织轴（资料页 key） */
        st.detail = text(src.detail, 80);        /* 详情位（行 ref） */
        st.selection = Array.isArray(src.selection) ? src.selection.map((x) => text(x, 80)).filter(Boolean).slice(0, 200) : [];
        st.batchAction = text(src.batchAction, 40);
        return st;
    }
    /** 保存状态：只吐**条件**（本模块不写盘，宿主拿它去存）。 */
    function saveState(state) {
        const st = loadState(state);
        return {
            version: CENTER_VERSION,
            ledgers: st.ledgers.slice(), actor: st.actor, status: st.status, source: st.source,
            floorFrom: st.floorFrom, floorTo: st.floorTo,
            revisionFrom: st.revisionFrom, revisionTo: st.revisionTo,
            text: st.text, hasFloor: st.hasFloor,
            page: st.page, pageSize: st.pageSize, sort: st.sort, dir: st.dir,
            saved: st.saved.slice(), activeSaved: st.activeSaved,
            /* [v3.325.0 · M3-O8] 组织轴与详情位随状态一起存：重开后「刚才看到哪张资料页 / 哪条详情」还在。 */
            profile: st.profile, detail: st.detail,
            selection: st.selection.slice(), batchAction: st.batchAction
        };
    }

    /** 界面状态 → 查询条件（**空值丢弃**；多值字段拆列表）。 */
    function buildSpec(state) {
        const st = loadState(state);
        const spec = {};
        if (st.ledgers.length) spec.ledgers = st.ledgers.slice();
        const actors = splitList(st.actor); if (actors.length) spec.actors = actors;
        const statuses = splitList(st.status); if (statuses.length) spec.statuses = statuses;
        const sources = splitList(st.source); if (sources.length) spec.sources = sources;
        const ff = numOrNull(st.floorFrom); if (ff !== null) spec.floorFrom = ff;
        const ft = numOrNull(st.floorTo); if (ft !== null) spec.floorTo = ft;
        const rf = numOrNull(st.revisionFrom); if (rf !== null) spec.revisionFrom = rf;
        const rt = numOrNull(st.revisionTo); if (rt !== null) spec.revisionTo = rt;
        if (st.text) spec.text = st.text;
        if (st.hasFloor === true || st.hasFloor === false) spec.hasFloor = st.hasFloor;
        return spec;
    }

    /**
     * 视图状态判定（**四态 + 具名 reason**，纯函数）。
     *   优先级即处置次序：面不可用 > 判不了 > 有命中 > 确实没有。
     */
    function viewOfOf(q, st, deps) {
        if (!q || typeof q !== 'object') return { view: 'error', reason: 'no-result' };
        /* ① 面不可用：扫描面为空（九账全取不到）——这不是「查不到」，是「没东西可查」。 */
        const cov = q.coverage || {};
        const counts = cov.counts || {};
        if (q.total === 0 && (counts.ok || 0) === 0) return { view: 'error', reason: 'scan-surface-absent' };
        /* ② 判不了：条件自相矛盾（区间反转，内核按空集但不静默交换）。 */
        if (q.state === 'inverted-range') return { view: 'unknown', reason: 'inverted-range' };
        /* ③ 判不了：翻过头（内核不回落第一页）。 */
        if (q.pageOutOfRange) return { view: 'unknown', reason: 'page-out-of-range' };
        /* ④ 判不了：用户点了登记表里没有的账（条件里有一个不认识的账本 id）。 */
        const want = Array.isArray(q.spec && q.spec.ledgers) ? q.spec.ledgers : [];
        if (want.length) {
            const known = Array.isArray(deps && deps.LEDGERS) ? deps.LEDGERS.map((l) => text(l && l.id, 40)) : [];
            const bad = want.filter((id) => known.indexOf(id) < 0);
            if (bad.length) return { view: 'unknown', reason: 'unknown-ledger', detail: bad };
        }
        /* ⑤ 有命中。 */
        if (q.total > 0) return { view: 'result', reason: '' };
        /* ⑥ 面可查、确实没有 —— 这是**真读数**，不是错误。 */
        return { view: 'empty', reason: 'no-match' };
    }

    /**
     * 组装一次视图（**只读**：不动任何入参）。
     * @param {object} deps 依赖面（见 REQUIRED_DEPS；缺 `query` ⇒ 直接 error/module-absent）
     * @param {object} state 界面状态
     * @param {object} [opts] { host, apis, availableHandlers?:[], now?:number }
     */
    function dispatch(deps, state, opts) {
        const o = opts || {};
        const st = loadState(state);
        const d = (deps && typeof deps === 'object') ? deps : {};
        const base = {
            version: CENTER_VERSION, state: st, spec: buildSpec(st),
            rows: [], actions: [], saved: [], pager: { page: st.page, pageSize: st.pageSize, pages: 0, total: 0 },
            /* [v3.325.0 · M3-O8] 三格新增（**恒定键面**：缺席面与在场产出逐字同键） */
            profiles: null, detailFace: null, revisionChain: null, selection: [],
            notes: [], uiFields: UI_FIELDS.map((f) => ({ ui: f.ui, label: f.label, value: st[f.ui] }))
        };
        if (typeof d.query !== 'function') {
            base.view = 'error';
            base.reason = 'module-absent';
            base.notes.push('结构化查询内核不在场（evidence-query.query 未注入）⇒ 报 error/module-absent，**不报空数据**');
            return base;
        }
        let q;
        try {
            q = d.query(o.host, base.spec, {
                ledgers: Array.isArray(d.LEDGERS) ? d.LEDGERS : [],
                apis: o.apis,
                page: st.page, pageSize: st.pageSize,
                sort: st.sort || undefined, dir: st.dir
            });
        } catch (_e) {
            base.view = 'error';
            base.reason = 'thrown';
            base.notes.push('查询内核抛错 ⇒ 报 error/thrown（不把「抛了」读成「没有」）');
            return base;
        }
        const v = viewOfOf(q, st, d);
        base.view = v.view;
        base.reason = v.reason;
        if (v.detail) base.detail = v.detail;
        base.query = q;
        base.rows = Array.isArray(q.rows) ? q.rows : [];
        base.selection = st.selection.slice();
        base.pager = { page: q.page, pageSize: q.pageSize, pages: q.pages, total: q.total, outOfRange: q.pageOutOfRange === true };
        base.saved = Array.isArray(st.saved) ? st.saved : [];
        base.actions = resolveActions(d, o.availableHandlers);
        /* ── [v3.325.0 · M3-O8] 组织层：资料页 ──
         *   只在有命中时算（空结果白扫没有意义，且会把「无命中」写成「零张资料页」）。
         *   命中但归类为空（没参与者、没楼层、账也不在事件表）⇒ 仍产出读数，并如实说没有可归类项。 */
        base.profiles = (base.view === 'result')
            ? buildProfiles(base.rows, { kinds: o.profileKinds })
            : { kind: 'memory-center-profiles', total: 0, count: 0, kinds: PROFILE_KINDS.slice(),
                bucketSize: TIME_BUCKET, pages: [], personCount: 0, technicalCount: 0,
                note: '无命中 ⇒ 无资料页（不是「归不了类」）' };
        /* ── 详情与修订链：`state.detail` 指到**本页**才产出；指到别页 / 不存在的 ref ⇒ 具名说明，
         *   不得渲染一张空详情（那与「这条没有任何证据」同形）。 */
        if (st.detail) {
            const dhit = base.rows.filter((r) => text(r && r.ref, 80) === st.detail)[0] || null;
            if (dhit) {
                /* 「看原文」的取数：优先调用方显式给的 textSource，其次 deps 里那一个。
                 *   取不到 **不抛**，落成具名读数（sourceFailed / sourceReason），不让“取不到”看着像“没有”。 */
                const srcFn = (typeof o.textSource === 'function') ? o.textSource
                    : ((typeof d.textSource === 'function') ? d.textSource : null);
                let src = null;
                if (srcFn) { try { src = srcFn(dhit.ref, dhit); } catch (_e) { src = { ok: false, reason: 'source-thrown' }; } }
                base.detailFace = detailOf(dhit, { fullText: o.fullText, source: src });
                base.revisionChain = revisionChain(dhit.ref, d, { row: dhit, state: o.factState, subject: o.subject, predicate: o.predicate });
            } else {
                base.detailNote = '详情位指到「' + st.detail + '」，但该条**不在本页**（翻页 / 条件变过）⇒ 不渲染空详情（「不在本页」不等于「这条不存在」）';
            }
        }
        /* 批量预览：选区**默认取自状态**（故「失败后未完成选择还在」是可验的）；调用方显式传
         *   `o.batchSelection` 时以其为准（判据要对「拿哪份选区算」取证）。 */
        const bsel = o.batchSelection ? o.batchSelection : { action: st.batchAction, refs: st.selection };
        base.batch = (bsel && ((bsel.refs && bsel.refs.length) || bsel.action)) ? batchPreview(base, bsel, d) : null;
        base.notes.push('本面直读原账**全量**、分页由匹配总数驱动（' + (q.coverage && q.coverage.summaryBypassed ? 'summaryBypassed=true' : 'summaryBypassed=未知') + '）—— 超过 200 条的历史记录仍能翻到');
        if (Array.isArray(q.droppedKeys) && q.droppedKeys.length) base.notes.push('未登记的条件键被丢弃：' + q.droppedKeys.join('、'));
        return base;
    }

    /**
     * 动作可用性判定：宿主没提供的 handler ⇒ `kind:'unavailable'`（**不假装能用**）。
     *   `availableHandlers` 未给（undefined）⇒ 视为「宿主尚未声明」，全部按**声明的 kind** 原样给出
     *   并附 `declaredOnly:true` —— 因为「我没问」与「宿主说没有」是两件事（本仓老账）。
     */
    function resolveActions(deps, availableHandlers) {
        const declared = Array.isArray(availableHandlers) ? availableHandlers.map(String) : null;
        const out = [];
        for (const a of ACTIONS) {
            const row = {
                id: a.id, label: a.label, kind: a.kind, writes: a.writes, undo: a.undo, scope: a.scope,
                handlerId: a.id, declaredKind: a.kind, unavailable: false, note: ''
            };
            if (declared && declared.indexOf(a.id) < 0) {
                row.kind = 'unavailable';
                row.unavailable = true;
                row.note = '宿主未提供该 handler（' + a.id + '）⇒ 降级为 unavailable，不得当作可用';
            }
            out.push(row);
        }
        return out;
    }

    /** 条件摘要一行（保存列表用）。 */
    function specLine(spec) {
        const n = (spec && typeof spec === 'object') ? spec : {};
        const bits = [];
        const push = (k, v) => { if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) bits.push(k + '=' + (Array.isArray(v) ? v.join('/') : String(v))); };
        push('账本', n.ledgers); push('参与者', n.actors); push('状态', n.statuses); push('来源', n.sources);
        push('楼层', (n.floorFrom != null || n.floorTo != null) ? ((n.floorFrom == null ? '' : n.floorFrom) + '~' + (n.floorTo == null ? '' : n.floorTo)) : '');
        push('修订', (n.revisionFrom != null || n.revisionTo != null) ? ((n.revisionFrom == null ? '' : n.revisionFrom) + '~' + (n.revisionTo == null ? '' : n.revisionTo)) : '');
        push('正文', n.text);
        if (n.hasFloor === true) bits.push('有无楼层=有');
        if (n.hasFloor === false) bits.push('有无楼层=无');
        return bits.length ? bits.join(' · ') : '（全条件为空 = 全收）';
    }

    /* ── 界面渲染（**纯字符串**，零 DOM） ── *
     *   为什么渲染放在内核模块里：验收要求「UI 显示来自真实查询结果，不自行猜测」。
     *   把渲染与视图组装放在同一处，二者不可能各说一套（测同一份 face）。
     *   宿主只负责：把 `sheetHtml(face)` 塞进容器、把 `[data-action]` 的点击转给 handler。
     */
    /* ════════ [v3.325.0 · M3-O8] 资料页 / 详情与修订链 / 批量影响预览 ════════ */
    /** 资料页三轴（登记表：改这里即口径变化）。 */
    const PROFILE_KINDS = Object.freeze(['person', 'event', 'time']);
    /** 时间轴的桶宽（楼层为单位）。取整桶宽的理由：逐楼一层一张页＝等于没分类。 */
    const TIME_BUCKET = 20;
    /** 算「事件」页的账（其余账按人与时间归类；事件轴只对有事件语义的账成立）。 */
    const EVENT_LEDGERS = Object.freeze(['seed', 'event-completeness', 'repair']);
    /**
     * 批量动作登记表（三档：保留 / 隐藏于生成 / 撤回）。
     *   每档指向 `fact-lifecycle.DISPOSITIONS` 里的一个处置 —— **本模块不另抄一份处置语义**，
     *   影响面由 fact-lifecycle 的 RULES / ACTION_SPEC 现场真读（缺它 ⇒ unavailable，不编）。
     */
    const BATCH_ACTIONS = Object.freeze([
        { id: 'keep', label: '批量保留', disposition: 'keep' },
        { id: 'hide-generate', label: '批量隐藏于生成', disposition: 'author-only' },
        { id: 'revoke', label: '批量撤回', disposition: 'revoke' }
    ]);
    /** 时间桶（**判不了就是判不了**：没楼层 ⇒ kind:'unknown'，不归到第 0 桶）。 */
    function timeBucketOf(floor) {
        const n = numOrNull(floor);
        if (n === null) return { kind: 'unknown', from: null, to: null, label: '时间未知（未归到任何时段）' };
        const from = Math.floor(n / TIME_BUCKET) * TIME_BUCKET;
        const to = from + TIME_BUCKET - 1;
        return { kind: 'range', from: from, to: to, label: '第 ' + from + '-' + to + ' 楼' };
    }
    /**
     * 资料页组织（纯函数，只读 rows）。
     *   三条纪律（都对应已经踩过的老账）：
     *   ① **不合并成一张合著页**：一条行有几个参与者就进几张人物页；两位人同时在场不等于一张页。
     *   ② **技术账名不当主标签**：以技术 id 为标题的页会被标 technical=true（界面据此单列）。
     *   ③ **判不了与没有不同形**：没楼层 ⇒ 落「时间未知」一张页（它是真读数，不是缺项）。
     */
    function buildProfiles(rows, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const want = Array.isArray(o.kinds) && o.kinds.length ? o.kinds.slice() : PROFILE_KINDS.slice();
        const list = Array.isArray(rows) ? rows : [];
        const map = {};
        const order = [];
        const push = (kind, key, label, row) => {
            const k = kind + '|' + key;
            if (!map[k]) { map[k] = { kind: kind, key: k, label: label, refs: [], technical: false }; order.push(k); }
            if (map[k].refs.indexOf(row.ref) < 0) map[k].refs.push(row.ref);
        };
        for (const r of list) {
            const ref = text(r && r.ref, 80);
            if (!ref) continue;
            if (want.indexOf('person') >= 0) {
                const actors = Array.isArray(r.actors) ? r.actors : [];
                for (const a of actors) {
                    const nm = text(a && a.name, 40);
                    if (!nm) continue;
                    push('person', nm, nm, r);   /* 一条行只进这张人物页；两个人在场 = 两张页，**不合并成合著页** */
                }
            }
            if (want.indexOf('event') >= 0 && EVENT_LEDGERS.indexOf(text(r.ledger, 40)) >= 0) {
                const lid = text(r.ledger, 40);
                push('event', lid, text(r.ledgerLabel, 40) || lid, r);
            }
            if (want.indexOf('time') >= 0) {
                const b = timeBucketOf(r.floor);
                push('time', b.label, b.label, r);
            }
        }
        const pages = order.map((k) => {
            const p = map[k];
            /* 技术页：人轴上的名字本来就是账里的 id（无中文、含下划线 / 连字符），
             *   或事件轴落在一本**没有组词名**的账上。这类页不是「人物资料」，如实标出来。 */
            const looksTech = (p.kind === 'person'
                ? (p.label.indexOf('_') >= 0 || p.label.indexOf('-') >= 0 || !/[一-龥]/.test(p.label))
                : (p.kind === 'event' && p.label === p.key.split('|')[1] && p.label.indexOf('_') >= 0));
            return { kind: p.kind, key: p.key, label: p.label, refs: p.refs, count: p.refs.length, technical: !!looksTech };
        });
        const personCount = pages.filter((p) => p.kind === 'person' && !p.technical).length;
        const technicalCount = pages.filter((p) => p.technical).length;
        return {
            kind: 'memory-center-profiles', total: list.length, count: pages.length,
            kinds: want, bucketSize: TIME_BUCKET, pages: pages,
            personCount: personCount, technicalCount: technicalCount,
            note: pages.length
                ? '共 ' + pages.length + ' 张（判不了的一项单列，不与「没有」合并）'
                : '有命中但**无一可归类**（没参与者 / 没楼层 / 不属事件账）—— 这是真读数，不是「没结果」'
        };
    }
    /**
     * 详情面（证据原文 + 参与者 + 遮蔽三态）。
     *   正文口径：可见 ⇒ 若给了 `fullText`（宿主从**本行真账**现取，重读原账即「看原文」）
     *   就用全量，没给则退回行上的摘要并**显式标 textTruncated**（摘要不得冒充全文）。
     *   遮蔽 ⇒ **一个字符都不进返回值**（把受限正文拷进详情面就是泄）。
     */
    function detailOf(row, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const r = (row && typeof row === 'object') ? row : {};
        const masked = r.masked === true;
        const scope = (r.scope === undefined || r.scope === null) ? null : text(r.scope, 20);
        const bodyState = !masked ? 'visible' : (scope ? 'masked' : 'masked-unknown-scope');
        /* 正文三档（**三档必须可分**）：显式给了就用它；宿主原文读口成功就用真原文；
         *   两者都没有 ⇒ 退回**投影面摘要**并标 projection（投影不得冒充全文）。 */
        const sb = (o.source && typeof o.source === 'object') ? o.source : null;
        const srcOk = !!(sb && sb.ok === true && typeof sb.text === 'string');
        const explicit = (o.fullText === undefined || o.fullText === null) ? null : String(o.fullText);
        const full = explicit !== null ? explicit : (srcOk ? String(sb.text) : null);
        const shown = masked ? '' : (full === null ? text(r.text, MAX_TEXT) : text(full, 2000));
        const textChannel = masked ? 'masked'
            : (explicit !== null ? 'explicit-fulltext' : (srcOk ? 'ledger-source' : (sb ? 'source-failed' : 'projection')));
        return {
            kind: 'memory-center-detail', ref: text(r.ref, 80),
            ledger: text(r.ledger, 40), ledgerLabel: text(r.ledgerLabel, 40),
            title: text(r.title, MAX_TEXT), detail: text(r.detail, MAX_TEXT),
            status: text(r.status, 20), floor: numOrNull(r.floor), updatedFloor: numOrNull(r.updatedFloor),
            source: text(r.source, 60),
            actors: (Array.isArray(r.actors) ? r.actors : []).map((a) => ({ field: text(a && a.field, 40), name: text(a && a.name, 40) })).filter((a) => a.name),
            masked: masked, scope: scope, bodyState: bodyState,
            text: shown, textTruncated: !masked && full === null,
            fullTextProvided: full !== null,
            textChannel: textChannel,
            sourceField: srcOk ? text(sb.field, 40) : '',
            sourceReason: (sb && sb.ok !== true) ? text(sb.reason, 60) : '',
            writesNothing: true,
            note: masked ? '受限正文保持遮蔽（' + bodyState + '）'
                : (textChannel === 'ledger-source' ? '取的是本行**真原文**（字段 ' + text(sb.field, 40) + '）'
                    : (textChannel === 'explicit-fulltext' ? '调用方显式给的原文'
                        : (textChannel === 'source-failed' ? '原文读口**取不到**（' + text(sb.reason, 60) + '）⇒ 退回投影摘要'
                            : '未接原文读口 ⇒ 显示的是投影面摘要（**不是全文**）')))
        };
    }
    /**
     * 修订链。**两档数据分开说**（本仓纪律：浅链不得冒充换代信息）：
     *   · `counter`  浅链：任何一行都能读的修订号与最后更新楼层（含「该账无修订概念」三态）；
     *   · `versioned` 换代链：只有**事实账某条事实**才有——由调用方给出 subject/predicate
     *     或直接给 state；两者都没给 ⇒ `state:'unknown'` + reason（不是「没有链」）。
     *   与六账的**关联键**：约定 / 事实类的标题常写作「键=值」，此时按标题里的键去事实账配对
     *   （命中才给链；未命中就是判不了，不编）。
     */
    function revisionChain(ref, deps, opts) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const o = (opts && typeof opts === 'object') ? opts : {};
        const row = (o.row && typeof o.row === 'object') ? o.row : {};
        const counter = {
            revision: numOrNull(row.revision), revisionKnown: row.revisionKnown === true,
            updatedFloor: numOrNull(row.updatedFloor),
            times: (Array.isArray(row.times) ? row.times : []).map((t) => ({ label: text(t && t.label, 20), value: numOrNull(t && t.value) }))
        };
        /* 主体优先取调用方给的 `subject`，其次取**本行的参与者**（事实账的 subject 是人，
         *   约定账的标题写的却是「键=值」）—— 两处的词法不同，不能只看标题。 */
        let subject = text(o.subject, 40), predicate = text(o.predicate, 40);
        if (!subject) {
            const actors = Array.isArray(row.actors) ? row.actors : [];
            const nm = (actors.length && text(actors[0] && actors[0].name, 40)) || '';
            if (nm) subject = nm;
        }
        if (row.title) {
            const t = String(row.title);
            const at = (t.indexOf('=') >= 0) ? t.indexOf('=') : -1;
            if (at > 0 && at <= 40) {
                if (!predicate) predicate = text(t.slice(0, at), 40);
                if (!subject) subject = text(t.slice(0, at), 40);
            }
        }
        const base = { kind: 'memory-center-revision-chain', ref: text(ref, 80), counter: counter, chain: [], versioned: null, state: 'unknown', reason: '', writesNothing: true };
        if (typeof d.versionsOf !== 'function') {
            base.reason = 'versionsOf-absent（事实账的换代链读面未注入）';
            base.note = '只报浅链：不得拿它冒充换代信息';
            return base;
        }
        if (!subject) {
            base.reason = 'subject-unknown（未给主体，也未从标题里认出「键=值」）';
            base.note = '判不了与「没有链」不同形';
            return base;
        }
        /* 事实账从**宿主读口**现取（`deps.factState()`）；调用方显式给 `o.factState` 则以其为准
         *   （判据才能对「拿哪一本账算」取证）。取不到 ⇒ 判不了，**不得报「没有版本」**。 */
        let fstate = (o.factState !== undefined) ? o.factState : null;
        if (o.factState === undefined && typeof d.factState === 'function') {
            try { fstate = d.factState(); } catch (_e) { fstate = null; }
        }
        if (!fstate || typeof fstate !== 'object') {
            base.reason = 'factState-absent（宿主未给出事实账读口，链无从算）';
            base.note = '这**不是**「没有其他版本」：判不了与没有是两档';
            return base;
        }
        let all; 
        try { all = d.versionsOf(fstate, subject, predicate || undefined); } catch (_e) { all = null; }
        if (!Array.isArray(all)) { base.reason = 'versionsOf-thrown'; base.note = '读面抛错，如实报而不是报空链'; return base; }
        const stateOf = (id) => {
            const FS = d.FACT_STATE;
            if (!FS || typeof FS.readState !== 'function') return '';
            try {
                const rs = FS.readState(fstate);
                const hit = (rs && Array.isArray(rs.entries) ? rs.entries : []).filter((e) => text(e && e.id, 48) === id)[0];
                return hit ? text(hit.state, 24) : '';
            } catch (_e) { return ''; }
        };
        const chain = all.map((f) => ({
            id: text(f && f.id, 48), value: text(f && f.value, 80),
            from: numOrNull(f && f.from), to: numOrNull(f && f.to),
            origin: text(f && f.origin, 24), supersededBy: text(f && f.supersededBy, 48),
            state: stateOf(text(f && f.id, 48))
        }));
        base.chain = chain;
        base.versioned = { subject: subject, predicate: predicate, count: chain.length };
        base.factStateAvailable = true;
        base.state = chain.length ? 'versioned' : 'empty';
        base.reason = chain.length ? '' : 'no-versions';
        base.note = chain.length
            ? '同主谓下共 ' + chain.length + ' 版（按账里真读数列出，不做「哪个对」的裁决）'
            : '同主谓下**确实没有别的版本**（不是「链没读出来」）';
        return base;
    }
    /**
     * 批量影响预览（**只算不写**）。
     *   影响面**不在这里编**：从 `fact-lifecycle` 的 `RULES[disposition]` / `ACTION_SPEC[action]`
     *   真读 —— 否则本模块会长出第二份处置语义，而用户看到的「可逆 / 不可逆」会与真执行不一致。
     *   未完成选择（不在本页 / ref 对不上）**保留选区**并逐条具名 why（不得静默丢弃）。
     */
    function batchPreview(face, selection, deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const f = (face && typeof face === 'object') ? face : {};
        const sel = (selection && typeof selection === 'object') ? selection : {};
        const action = text(sel.action, 40);
        const rows = Array.isArray(f.rows) ? f.rows : [];
        const byRef = {};
        for (const r of rows) byRef[text(r && r.ref, 80)] = r;
        const pick = Array.isArray(sel.refs) ? sel.refs.map((x) => text(x, 80)).filter(Boolean) : [];
        const out = {
            kind: 'memory-center-batch-preview', action: action, state: 'ok', reason: '',
            selected: pick.length, affected: [], skipped: [], unaccounted: [],
            reversibleCount: 0, irreversibleCount: 0, writesNothing: true, note: ''
        };
        const spec = BATCH_ACTIONS.filter((x) => x.id === action)[0] || null;
        if (!spec) {
            out.state = 'unknown-action';
            out.reason = '未登记的动作名 `' + action + '`（既不当你可用，也不静默忽略）';
            out.note = '登记表里的动作：' + BATCH_ACTIONS.map((x) => x.id).join('、');
            return out;
        }
        if (!pick.length) { out.state = 'empty-selection'; out.reason = '未选任何条（不是「选了零条有效」）'; out.note = '请先勾选要处置的条目'; return out; }
        const FL = d.FACT_LIFECYCLE;
        if (!FL || !FL.RULES || !FL.ACTION_SPEC) {
            out.state = 'unavailable';
            out.reason = 'lifecycle-absent';
            out.note = '影响面登记表不在场 ⇒ 说「预览不可用」，**不编一个影响面**';
            return out;
        }
        const rule = FL.RULES[spec.disposition] || null;
        if (!rule) {
            out.state = 'unaccounted';
            out.reason = '未登记的处置 `' + spec.disposition + '`（fact-lifecycle 不认）';
            return out;
        }
        const faces = Array.isArray(rule.faces) ? rule.faces.slice() : [];
        const undo = (rule.allowed || []).map((a) => text((FL.ACTION_SPEC[a] || {}).undo, 24)).filter((u) => u && u !== 'none');
        /* 逐条可逆性 **不按行的正文是否遮蔽去猜** —— 它由本档动作集决定（`ACTION_SPEC.reversible`）。
         *   本档只要含一个不可逆动作（如 `delete-source`），**每条都上当**，用户必须在预览里看见。 */
        const reversibleAll = (rule.allowed || []).length
            ? (rule.allowed || []).every((a) => (FL.ACTION_SPEC[a] || {}).reversible === true) : false;
        const irreversibleActions = (rule.allowed || []).filter((a) => (FL.ACTION_SPEC[a] || {}).reversible !== true);
        for (const ref of pick) {
            const r = byRef[ref];
            if (!r) { out.skipped.push({ ref: ref, why: 'not-on-this-page（不在本页 / 条件变过）' }); continue; }
            out.affected.push({
                ref: ref, ledger: text(r.ledger, 40), ledgerLabel: text(r.ledgerLabel, 40),
                title: text(r.title, MAX_TEXT), ledgerState: rule.ledgerState === undefined ? null : rule.ledgerState,
                faces: faces, undo: undo, reversible: reversibleAll
            });
        }
        out.reversibleCount = out.affected.filter((a) => a.reversible).length;
        out.irreversibleCount = out.affected.length - out.reversibleCount;
        out.ledgerState = rule.ledgerState === undefined ? null : rule.ledgerState;
        out.faces = faces; out.undo = undo; out.reversibleAll = reversibleAll;
        out.irreversibleActions = irreversibleActions;
        out.note = reversibleAll
            ? '本档动作全部可逆（逆操作见 undo）；预览**一个字都没写**'
            : '本档含**不可逆**动作：用户必须在预览里看得见（不能等执行后才知道）';
        return out;
    }
    /**
     * 导航（进/出详情 · 切资料页）。**只改组织轴与详情位**，条件与页码原样保留 ——
     *   「进出详情保留筛选和页码」这一条验收的落点。同时**回报有没有回第一页**，
     *   因为「保留了页码」与「被静默重置」在看不见回报时同形。
     */
    function navigate(state, payload) {
        const st = loadState(state);
        const p = (payload && typeof payload === 'object') ? payload : {};
        const out = { state: st, handled: false, ignored: '', pageReset: false, kept: [], writesNothing: true };
        if (p.to === 'detail') {
            const ref = text(p.ref, 80);
            if (!ref) { out.ignored = 'detail-ref-missing'; return out; }
            st.detail = ref; out.handled = true; out.kept = ['page', '条件', 'profile'];
        } else if (p.to === 'list') {
            st.detail = ''; out.handled = true; out.kept = ['page', '条件', 'profile'];
        } else if (p.to === 'profile') {
            const key = text(p.profile, 80);
            if (!key) { out.ignored = 'profile-key-missing'; return out; }
            st.profile = (st.profile === key) ? '' : key;   /* 再点一次 = 退出该资料页 */
            st.detail = '';                                  /* 换页时旧详情已不在视野内 */
            out.handled = true; out.kept = ['page', '条件'];
        } else {
            out.ignored = text(p.to, 40) || 'unknown-to';
            return out;
        }
        out.state = st;
        return out;
    }
    function profileHtml(face) {
        const pf = face && face.profiles;
        if (!pf || !pf.pages || !pf.pages.length) return '';
        const cur = text((face.state || {}).profile, 80);
        const parts = ['<div class="ls-group ls-mc-profiles"><div class="ls-group-title">资料页（按人物 / 事件 / 时间组织）</div>'];
        parts.push('<div class="ls-hint">共 ' + esc(pf.count) + ' 张 · 条目 ' + esc(pf.total) + ' 条 · 一行可同时属于多张（**不合并成一张合著页**）</div>');
        for (const p of pf.pages) {
            const on = (p.key === cur);
            parts.push('<button class="ls-btn ls-mc-profile" data-mc="profile" data-profile="' + escAttr(p.key) + '" data-kind="' + escAttr(p.kind) + '"'
                + (on ? ' aria-pressed="true"' : '') + '>'
                + esc(p.label) + ' <span class="ls-mc-pcount">' + esc(p.count) + '</span>'
                + (p.technical ? ' <span class="ls-mc-tech">技术视图</span>' : '') + '</button>');
        }
        if (!cur) parts.push('<span class="ls-hint">（未选资料页 = 看全部）</span>');
        parts.push('</div>');
        return parts.join('');
    }
    function detailHtml(face) {
        const dt = face && face.detailFace;
        if (!dt) return (face && face.detailNote) ? '<div class="ls-hint ls-mc-detailnote">' + esc(face.detailNote) + '</div>' : '';
        const parts = ['<div class="ls-group ls-mc-detail" data-detail="' + escAttr(dt.ref) + '"><div class="ls-group-title">证据原文与修订链</div>'];
        parts.push('<div class="ls-item-meta">' + esc(dt.ledgerLabel || dt.ledger) + ' · ' + esc(dt.ref) + ' · 楼层 ' + esc(dt.floor === null ? '-' : dt.floor) + ' · 状态 ' + esc(dt.status || '-') + '</div>');
        parts.push('<div class="ls-item-text">' + esc(dt.title) + (dt.detail ? ' — ' + esc(dt.detail) : '') + '</div>');
        if (dt.actors.length) parts.push('<div class="ls-hint">参与者：' + dt.actors.map((a) => esc(a.name) + '（' + esc(a.field) + '）').join(' / ') + '</div>');
        if (dt.bodyState === 'visible') parts.push('<div class="ls-mc-body" data-text-channel="' + escAttr(dt.textChannel) + '">' + esc(dt.text) + (dt.textTruncated ? '…（摘要，非全文）' : '') + '</div>');
        else if (dt.bodyState === 'masked') parts.push('<div class="ls-mc-masked">受限正文保持遮蔽（知识范围 ' + esc(dt.scope) + '）—— 一格不带</div>');
        else parts.push('<div class="ls-mc-masked">受限正文保持遮蔽，且**知识范围判不了** —— 与「知道范围」不同形</div>');
        const ch = face.revisionChain;
        if (ch) {
            const c = ch.counter || {};
            parts.push('<div class="ls-hint">修订号：' + esc(c.revisionKnown ? (c.revision === null ? '无' : c.revision) : '该账无修订概念')
                + ' · 最后更新楼层 ' + esc(c.updatedFloor === null ? '-' : c.updatedFloor) + '</div>');
            if (ch.state === 'versioned') {
                parts.push('<div class="ls-hint">换代链（同 <b>' + esc(ch.versioned.subject) + (ch.versioned.predicate ? ' · ' + esc(ch.versioned.predicate) : '') + '</b>）：' + esc(ch.versioned.count) + ' 版</div>');
                parts.push('<div class="ls-mc-chain">' + ch.chain.map((v) => '<div class="ls-item ls-mc-chainrow" data-chain="' + escAttr(v.id) + '">'
                    + '<span class="ls-mc-chainval">' + esc(v.value) + '</span>'
                    + '<span class="ls-mc-chainmeta">' + esc(v.from === null ? '?' : v.from) + '~' + esc(v.to === null ? '至今' : v.to) + ' · ' + esc(v.origin || '-')
                    + (v.supersededBy ? ' · 已被换代' : '') + (v.state ? ' · ' + esc(v.state) : ' · 态未知') + '</span></div>').join('') + '</div>');
            } else if (ch.state === 'empty') {
                parts.push('<div class="ls-hint">换代链：同主谓下**没有其他版本**（不是「查不到链」）</div>');
            } else {
                parts.push('<div class="ls-hint">换代链**判不了**：' + esc(ch.reason) + '（不拿浅链冒充换代信息）</div>');
            }
        }
        parts.push('<button class="ls-btn" data-mc="detail-back">← 回到列表（保留筛选与页码）</button>');
        parts.push('</div>');
        return parts.join('');
    }
    function batchHtml(face) {
        const b = face && face.batch;
        if (!b) return '';
        const parts = ['<div class="ls-group ls-mc-batch" data-batch="' + escAttr(b.action) + '" data-batch-state="' + escAttr(b.state) + '"><div class="ls-group-title">批量操作影响预览（' + esc(b.action) + '）</div>'];
        if (b.state !== 'ok') {
            parts.push('<div class="ls-mc-warn">预览不可用：' + esc(b.reason) + (b.note ? ' —— ' + esc(b.note) : '') + '</div>');
        } else {
            parts.push('<div class="ls-hint">选中 ' + esc(b.selected) + ' 条 · 可逆 ' + esc(b.reversibleCount) + ' · 不可逆 ' + esc(b.irreversibleCount)
                + ' · 账本态 ' + esc(b.ledgerState === null ? '（本档不改账本态）' : b.ledgerState) + '</div>');
            parts.push('<div class="ls-hint">作用面：' + esc(b.faces.join('/') || '-') + ' · 逆操作：' + esc(b.undo.join('/') || '无') + '</div>');
            for (const a of b.affected) parts.push('<div class="ls-item ls-mc-batchrow" data-ref="' + escAttr(a.ref) + '"><div class="ls-item-meta">' + esc(a.ledgerLabel) + ' · ' + esc(a.ref) + (a.reversible ? ' · 可逆' : ' · **不可逆**') + '</div><div class="ls-item-text">' + esc(a.title) + '</div></div>');
            for (const s of b.skipped) parts.push('<div class="ls-mc-warn">未完成选择：' + esc(s.ref) + '（' + esc(s.why) + '）—— 保留在选区里，不静默丢弃</div>');
            parts.push('<div class="ls-hint">预览**不写**：执行落点在宿主（各 owner 的写口）</div>');
        }
        parts.push('</div>');
        return parts.join('');
    }
    function pagerHtml(p) {
        if (!p) return '';
        const parts = [];
        parts.push('<div class="ls-mc-pager">');
        parts.push('<span class="ls-mc-pageno">第 ' + esc(p.page) + ' / ' + esc(p.pages || 1) + ' 页</span>');
        parts.push('<span class="ls-mc-total">命中 ' + esc(p.total) + ' 条</span>');
        if (p.page > 1) parts.push('<button class="ls-btn" data-mc="page" data-page="' + escAttr(p.page - 1) + '">上一页</button>');
        if (p.pages && p.page < p.pages) parts.push('<button class="ls-btn" data-mc="page" data-page="' + escAttr(p.page + 1) + '">下一页</button>');
        if (p.outOfRange) parts.push('<span class="ls-mc-warn">⚠️ 翻过头（不回落第一页）</span>');
        parts.push('</div>');
        return parts.join('');
    }
    function actionButtons(actions, scope, ref) {
        const out = [];
        for (const a of actions) {
            if (a.scope !== scope) continue;
            const dis = a.unavailable ? ' disabled aria-disabled="true"' : '';
            out.push('<button class="ls-btn' + (a.kind === 'write' ? ' ls-btn-danger' : '') + '"'
                + dis + ' data-action="' + escAttr(a.handlerId) + '"'
                + (ref ? ' data-ref="' + escAttr(ref) + '"' : '')
                + ' title="' + escAttr(a.label + '（' + a.kind + (a.writes ? ' · 写入' : ' · 只读') + (a.undo ? ' · 可撤销' : '') + '）') + '">'
                + esc(a.label) + '</button>');
        }
        return out.join('');
    }
    function rowsHtml(face) {
        const rows = Array.isArray(face.rows) ? face.rows : [];
        if (!rows.length) return '<div class="ls-hint">本页无条目。</div>';
        return rows.map((r) => {
            const meta = [r.ledgerLabel || r.ledger, '楼层 ' + (r.floor == null ? '—' : r.floor), r.status || '']
                .filter(Boolean).join(' · ');
            const masked = r.masked === true ? '<span class="ls-mc-masked">🔒 正文已遮蔽（' + esc(r.scope || '判不了') + '）</span>' : '';
            const picked = face.selection && face.selection.indexOf(r.ref) >= 0;
            return '<div class="ls-item ls-mc-row' + (picked ? ' ls-mc-picked' : '') + '" data-ref="' + escAttr(r.ref) + '">'
                + '<label class="ls-mc-pickbox"><input type="checkbox" data-mc="select" data-ref="' + escAttr(r.ref) + '"'
                + (picked ? ' checked' : '') + '> 选中</label>'
                + '<div class="ls-item-meta">' + esc(meta) + ' · <span class="ls-mc-ref">' + esc(r.ref) + '</span></div>'
                + '<div class="ls-item-text">' + esc(r.title) + (r.detail ? ' — ' + esc(r.detail) : '') + '</div>'
                + masked
                + '<div class="ls-mc-actions">' + actionButtons(face.actions, 'row', r.ref) + '</div>'
                + '</div>';
        }).join('');
    }
    function savedHtml(face) {
        const saved = Array.isArray(face.saved) ? face.saved : [];
        if (!saved.length) return '<div class="ls-hint">尚无保存的查询条件（保存的是**条件**，不是结果）。</div>';
        return saved.map((s) => {
            const key = text(s && s.replayKey, 200);
            return '<div class="ls-item ls-mc-saved" data-saved="' + escAttr(key) + '">'
                + '<div class="ls-item-meta">' + esc(text(s && s.label, 40)) + '</div>'
                + '<div class="ls-item-text">' + esc(specLine(s && s.spec)) + '</div>'
                + '<div class="ls-mc-actions">' + actionButtons(face.actions, 'saved', key) + '</div>'
                + '</div>';
        }).join('');
    }
    function filterHtml(face) {
        const st = face.state || {};
        const parts = ['<div class="ls-mc-filter">'];
        parts.push('<input class="ls-input" data-mc="f" data-k="actor" placeholder="角色 / 参与者" value="' + escAttr(st.actor) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="status" placeholder="状态（多个用、分隔）" value="' + escAttr(st.status) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="source" placeholder="来源" value="' + escAttr(st.source) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="floorFrom" type="number" placeholder="楼层起" value="' + escAttr(st.floorFrom) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="floorTo" type="number" placeholder="楼层止" value="' + escAttr(st.floorTo) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="revisionFrom" type="number" placeholder="修订起（无修订号的账不参与）" value="' + escAttr(st.revisionFrom) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="revisionTo" type="number" placeholder="修订止" value="' + escAttr(st.revisionTo) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="text" placeholder="正文" value="' + escAttr(st.text) + '">');
        parts.push('<button class="ls-btn" data-mc="apply">筛选</button>');
        parts.push(actionButtons(face.actions, 'query', ''));
        /* [v3.325.0 · M3-O8] 批量三档 + 选区读数（「隐藏于生成」用的是 fact-lifecycle 的
         *   author-only —— **账本态不动、只作用在生成面**，与「撤回」不是一件事）。 */
        parts.push('<span class="ls-mc-selinfo">已选 ' + esc(face.selection ? face.selection.length : 0) + ' 条</span>');
        for (const b of BATCH_ACTIONS) {
            const on = (face.state && face.state.batchAction) === b.id;
            parts.push('<button class="ls-btn" data-mc="batch" data-batch-action="' + escAttr(b.id) + '"'
                + (on ? ' aria-pressed="true"' : '') + '>' + esc(b.label) + '</button>');
        }
        parts.push('<button class="ls-btn" data-mc="select-clear">清空选区</button>');
        parts.push('</div>');
        return parts.join('');
    }
    /**
     * 整页渲染（宿主只做两件事：把本串塞进容器、把 `[data-mc]` / `[data-action]` 的点击转给 handler）。
     *   `data-view` 属性携带视图状态 —— 界面能自证「现在处在四态中的哪一态」。
     */
    function sheetHtml(face) {
        const f = face || {};
        const st = f.state || {};
        const reasons = {
            'no-match': '面可查，但确实没有命中（**不是**「面坏了」）',
            'scan-surface-absent': '扫描面为空：九账全部取不到（见 coverage.ledgers 的 reason）',
            'inverted-range': '区间起止反转：按空集处理，**不自动交换**',
            'page-out-of-range': '翻过头了（不回落第一页）',
            'unknown-ledger': '条件里有登记表里没有的账本 id',
            'module-absent': '查询内核不在场',
            'thrown': '查询内核抛错',
            'no-result': '内核没有返回结果对象',
            '': ''
        };
        const head = '<div class="ls-mc-head"><b>记忆控制中心</b>'
            + '<span class="ls-mc-view" data-view="' + escAttr(f.view || 'panel') + '">' + esc(f.view || 'panel') + '</span>'
            + (f.reason ? '<span class="ls-mc-reason">' + esc(f.reason) + '：' + esc(reasons[f.reason] || f.reason) + '</span>' : '')
            + '</div>';
        const body = [
            filterHtml(f),
            profileHtml(f),
            detailHtml(f),
            batchHtml(f),
            pagerHtml(f.pager),
            '<div class="ls-mc-rows">' + rowsHtml(f) + '</div>',
            '<div class="ls-group"><div class="ls-group-title">保存的查询条件</div>' + savedHtml(f) + '</div>',
            (f.notes && f.notes.length) ? '<div class="ls-hint">' + f.notes.map(esc).join('<br>') + '</div>' : ''
        ];
        return '<div class="ls-mc" data-view="' + escAttr(f.view || 'panel') + '">' + head + body.join('') + '</div>';
    }

    /**
     * 动作 → 新状态（**纯函数**：本模块不执行任何处置，只算出「点了之后界面该变成什么样」）。
     *   执行的落点在宿主（它按 `handlerId` 调真函数）；本函数只处理**界面自身**的那几种动作
     *   （翻页 / 改条件 / 清空 / 载入保存的条件）。未知动作名 ⇒ 原状态返回 + `ignored` 点名。
     * @returns {{state, handled:boolean, ignored:string}}
     */
    function applyAction(state, action, payload, deps) {
        const st = loadState(state);
        const p = (payload && typeof payload === 'object') ? payload : {};
        const a = text(action, 60);
        const act = { state: st, handled: false, ignored: '' };
        if (a === 'page') {
            const n = numOrNull(p.page);
            st.page = (n === null || n < 1) ? 1 : Math.floor(n);
            act.handled = true;
        } else if (a === 'filter') {
            const k = text(p.key, 40);
            const known = UI_FIELDS.filter((f) => f.ui === k)[0];
            if (!known) { act.ignored = k; return act; }
            if (k === 'ledgers') st.ledgers = strList(p.value);
            else if (k === 'hasFloor') st.hasFloor = (p.value === true || p.value === 'true') ? true : ((p.value === false || p.value === 'false') ? false : null);
            else st[k] = text(p.value, 80);
            st.page = 1;      /* 改条件 ⇒ 回到第一页（否则「改了条件却停在旧页」会看着像查不到） */
            st.detail = '';   /* [v3.325.0 · M3-O8] 同时退出详情：旧详情指向的行可能已不在新结果里 */
            act.handled = true;
        } else if (a === 'reset') {
            const keep = { pageSize: st.pageSize, saved: st.saved };
            Object.assign(st, blankState(), keep);
            act.handled = true;
        } else if (a === 'load-saved') {
            const key = text(p.replayKey, 200);
            const hit = (st.saved || []).filter((s) => text(s && s.replayKey, 200) === key)[0];
            if (!hit) { act.ignored = key; return act; }
            const spec = (hit.spec && typeof hit.spec === 'object') ? hit.spec : {};
            const next = loadState({
                ledgers: spec.ledgers, actor: (spec.actors || []).join('、'), status: (spec.statuses || []).join('、'),
                source: (spec.sources || []).join('、'), floorFrom: spec.floorFrom, floorTo: spec.floorTo,
                text: spec.text, hasFloor: spec.hasFloor, pageSize: st.pageSize, saved: st.saved, activeSaved: key
            });
            act.state = next;
            act.handled = true;
        } else if (a === 'select' || a === 'batch') {
            /* [v3.325.0 · M3-O8] 选区与批量档位：**同样只动组织态**，不碰条件与页码。
             *   `mode` 逐档具名（toggle / add / remove / set / clear）；未知 mode ⇒ 点名不静默。 */
            if (a === 'batch') {
                const act0 = text(p.action, 40);
                const known0 = BATCH_ACTIONS.filter((x) => x.id === act0)[0] || null;
                if (act0 && !known0) { act.ignored = act0; return act; }
                st.batchAction = (st.batchAction === act0) ? '' : act0;   /* 再点一次 = 收起预览 */
                act.handled = true;
                return act;
            }
            const mode = text(p.mode, 20) || 'toggle';
            const ref = text(p.ref, 80);
            if (mode === 'clear') {
                st.selection = []; st.batchAction = ''; act.handled = true; return act;
            }
            if (mode === 'set') {
                st.selection = (Array.isArray(p.refs) ? p.refs : []).map((x) => text(x, 80)).filter(Boolean).slice(0, 200);
                act.handled = true; return act;
            }
            if (!ref) { act.ignored = 'select-ref-missing'; return act; }
            const has = st.selection.indexOf(ref) >= 0;
            if (mode === 'toggle') st.selection = has ? st.selection.filter((x) => x !== ref) : st.selection.concat([ref]);
            else if (mode === 'add') { if (!has) st.selection = st.selection.concat([ref]); }
            else if (mode === 'remove') st.selection = st.selection.filter((x) => x !== ref);
            else { act.ignored = mode; return act; }
            st.selection = st.selection.slice(0, 200);
            act.handled = true;
            return act;
        } else if (a === 'navigate' || a === 'profile' || a === 'detail') {
            /* [v3.325.0 · M3-O8] 导航（进/出详情、切资料页）：**只动组织轴与详情位**，
             *   一个查询条件字段都不碰 —— 「进出详情保留筛选和页码」的落点就在这里。 */
            const nav = navigate(st, (a === 'navigate') ? p : Object.assign({}, p, { to: (a === 'profile' ? 'profile' : p.to) }));
            act.state = nav.state;
            act.handled = nav.handled;
            act.ignored = nav.ignored;
            act.pageReset = nav.pageReset;
            act.kept = nav.kept;
        } else {
            /* 处置类（row.* / query.save / saved.remove / saved.replay）**不在本模块执行**：
             *   它们要真改账 / 真落盘，那是宿主的活。这里如实说「没处理」而不是假装成功。 */
            act.ignored = a;
            return act;
        }
        return act;
    }

    /** `dispatch` 的薄封装：先把动作算进状态，再组装视图（宿主事件循环用的一步）。 */
    function step(deps, state, action, payload, opts) {
        const r = applyAction(state, action, payload, deps);
        const face = dispatch(deps, r.state, opts);
        face.handled = r.handled;
        face.ignored = r.ignored;
        return face;
    }

    /** 自述：缺哪一格、缺了会怎样（只读、不抛）。 */
    function describe(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const need of REQUIRED_DEPS) if (d[need.key] === undefined || d[need.key] === null) missing.push({ key: need.key, why: need.why });
        const ka = keysAligned(d);
        return {
            kind: 'memory-center-describe', version: CENTER_VERSION,
            views: VIEW_STATES.slice(), actions: ACTIONS.length, uiFields: UI_FIELDS.length,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length,
            missing: missing, keysAligned: ka.ok, keysUnaligned: ka, complete: missing.length === 0 && ka.ok && UI_FIELDS.length > 0,
            writesNothing: true,
            note: missing.length ? '缺依赖 ⇒ 相应能力不可用（逐条见 missing）' : '依赖齐备'
        };
    }

    /** 自证：四态词表穷尽 + 动作声明零写口自洽 + 挂载面完整 + 幂等（同一入参两次同形）。 */
    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const ka = keysAligned(d);
        /* ① 动作声明自洽：`writes:true` 的必须是 write，`writes:false` 的不得是 write。 */
        let actionsCoherent = true;
        for (const a of ACTIONS) if ((a.kind === 'write') !== (a.writes === true)) actionsCoherent = false;
        /* ② 幂等：同一 state 两次 loadState / buildSpec / saveState 必须逐字相同（无模块级可变状态）。 */
        const probe = d.__probeState || blankState();
        let idempotent = false;
        try {
            const a = JSON.stringify(loadState(probe));
            const b = JSON.stringify(loadState(probe));
            const c = JSON.stringify(buildSpec(probe));
            const e = JSON.stringify(buildSpec(probe));
            idempotent = (a === b) && (c === e);
        } catch (_e) { idempotent = false; }
        return {
            viewsComplete: VIEW_STATES.length === 5,
            actionsCoherent: actionsCoherent,
            uiFieldsMapped: UI_FIELDS.every((f) => typeof f.specKey === 'string' && f.specKey.length > 0),
            keysAligned: ka.ok,
            idempotent: idempotent,
            writesNothing: true,
            ok: VIEW_STATES.length === 5 && actionsCoherent
                && UI_FIELDS.every((f) => typeof f.specKey === 'string' && f.specKey.length > 0)
                && ka.ok && idempotent
        };
    }

    /** 诊断一行（纯字符串，不抛）。**四态分开写**。 */
    function line(face) {
        try {
            const f = face || {};
            const parts = ['记忆控制中心 ' + (f.view || 'panel')];
            if (f.reason) parts.push('因 ' + f.reason);
            const p = f.pager || {};
            parts.push('命中 ' + (p.total || 0) + ' 条 · 第 ' + (p.page || 1) + '/' + (p.pages || 1) + ' 页');
            if (f.rows && f.rows.length) parts.push('本页 ' + f.rows.length + ' 条');
            const saved = Array.isArray(f.saved) ? f.saved.length : 0;
            if (saved) parts.push('保存条件 ' + saved + ' 条');
            const un = (f.actions || []).filter((a) => a.unavailable).length;
            if (un) parts.push('⚠️ 不可用动作 ' + un);
            return parts.join(' · ');
        } catch (_e) { return '—（控制中心异常）'; }
    }

    const api = Object.freeze({
        CENTER_VERSION, VIEW_STATES, ACTION_KINDS, REQUIRED_DEPS, UI_FIELDS, ACTIONS, MAX_TEXT,
        blankState, loadState, saveState, buildSpec, keysAligned, viewOfOf,
        dispatch, step, applyAction, resolveActions, specLine,
        sheetHtml, filterHtml, rowsHtml, pagerHtml, savedHtml,
        profileHtml, detailHtml, batchHtml,
        PROFILE_KINDS, TIME_BUCKET, EVENT_LEDGERS, BATCH_ACTIONS, OPTIONAL_DEPS,
        buildProfiles, timeBucketOf, detailOf, revisionChain, batchPreview, navigate,
        describe, selfCheck, line
    });
    root.LonShaMemoryCenter = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
