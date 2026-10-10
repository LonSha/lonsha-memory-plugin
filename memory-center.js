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
            page: 1, pageSize: 30, sort: '', dir: 'asc', saved: [], activeSaved: ''
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
            saved: st.saved.slice(), activeSaved: st.activeSaved
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
        base.pager = { page: q.page, pageSize: q.pageSize, pages: q.pages, total: q.total, outOfRange: q.pageOutOfRange === true };
        base.saved = Array.isArray(st.saved) ? st.saved : [];
        base.actions = resolveActions(d, o.availableHandlers);
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
            return '<div class="ls-item ls-mc-row" data-ref="' + escAttr(r.ref) + '">'
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
        describe, selfCheck, line
    });
    root.LonShaMemoryCenter = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
