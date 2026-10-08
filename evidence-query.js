/* ========================================================
 * evidence-query.js — [v3.296.0 · X1] 结构化证据查询与完整度
 *
 * 【为什么需要这一面（修前实测，不是「多几个筛选框」）】
 *   `evidence-workbench.js`（v3.214.0）把九账收成一张可查表，但它的读法有**两处结构性限制**，
 *   而这两处正好是 X1 原文点名的缺口：
 *     ① **只有关键词检索**：`search(face, query, opts)` 只收 `{ limit, ledgers }`，
 *        命中与否由 `scoreOf(title, detail, q)` 的关键子串打分决定。
 *        「按角色找」「按楼层区间找」「按状态找」「按来源找」「按修订号找」全**无处可查** ——
 *        actor / keeper / about / who / actors 这些**结构化参与者**在各账里都真实存在
 *        （见各账 `copyItem`），但从未被汇成可筛的字段，只能当 detail 文本拼进去靠眼睛认。
 *     ② **只看得到最后 200 条**：`readLedger` 是 `items.slice(-MAX_ITEMS_PER_LEDGER)`
 *        （`MAX_ITEMS_PER_LEDGER = 200`），**先切后投影**。于是「这本账有 900 条」与
 *        「这本账有 200 条」在面上**完全同形**，而 X1 验收原文写着
 *        「**超过 200 条的旧证据仍能按需检索**」「**不默认在 200 条摘要中找不到就判全库没有**」。
 *
 * 【本模块怎么补（三条，都不改既有面）】
 *   ① **结构化查询**：在**原账状态**上做组合筛选 —— 账本 / 参与者 / 楼层区间 / 状态 /
 *      来源身份 / 修订号区间 / 正文子串，逐条件**与**语义，条件全空即「全收」。
 *   ② **分页与排序**：`page` / `pageSize` 由**匹配总数**驱动（不是由摘要长度驱动），
 *      `sort` 走登记表；翻过头如实报 `pageOutOfRange`，**不回落第一页**
 *      （回落会让「翻过头了」与「就在第一页」同形）。
 *   ③ **完整度读数**：扫描范围逐账报出 `kept / total / truncated`，取不到的账单列
 *      `absent`（带 `module-unavailable` / `state-missing` 两因），空账单列 `empty`。
 *      另**显式**报出「本面绕过工作台 200 条摘要、直读原账全量」（`summaryBypassed`），
 *      并把直读触顶的账列进 `coverage.truncated` —— 那正是「找不到 ≠ 没有」的出处。
 *
 * 【单一真源：条目结构不在这里再声明一遍】
 *   账本登记表仍只有一份 —— `evidence-workbench.js` 的 `LEDGERS`。本模块经
 *   `universeOf(host, opts)` 的 `opts.ledgers` 复用它（state / pick / project / keyOf
 *   全部调用它的函数），**绝不另抄一份「哪本账取哪个字段」的取值代码**。
 *   本模块自己的 `FACETS` 表只声明**检索面**（哪几个字段算参与者 / 算时间 / 算来源），
 *   并以 `facetsAligned()` 与 `LEDGERS` 的 id 集合**逐字对账**（少一个 id 即报红，
 *   见判据 B1）—— 「加了哪本账没加检索面」是可机检事实，不靠人记。
 *
 * 【本模块**不做**什么（边界）】
 *   · 不写任何账：全部动作只调只读面（`list` 类）；保存查询存的是**条件**不是结果
 *     （存结果＝第二份证据库，那是本仓明令禁止的形态）；
 *   · 不摸 window / 不读 storage：账 API 由宿主经 `opts.apis` 注入，持久化由宿主负责；
 *   · 不拉长取数窗口：`MAX_SCAN_PER_LEDGER` 是**扫描上限**而不是「只要前 N 条」——
 *     真触到上限时如实记 `truncated`（宁可说「只扫了这么多」，不假装扫全了）；
 *   · 不做同义改写 / 分词扩展：检索词只做空白压缩与大小写归一。同义改写会让
 *     「重放一致」依赖词典版本 —— 保存下来的条件换个版本就查到别的东西。
 *
 * 【三态纪律（本仓反复治理过的那一类）】
 *   · 楼层 `null`（未给）**不得**被区间筛选当成 0 楼命中，也不得被当成「不满足区间」而静默丢
 *     —— 被排除的无楼层行单独计数（`unmatchedUnknownFloor`），读者自己决定要不要放宽；
 *   · 排序键取不到值的行**一律排最后**（不参与比较），不得当成 0 参与排序；
 *   · `total` 是**全量匹配数**，`rows` 是本页切片；两者混读即「分页当截断」。
 * ================================================================ */
(function (root) {
    'use strict';
    const QUERY_VERSION = 1;
    /** 单页默认条数 / 上限。分页由**匹配总数**驱动，故上限只防呆、不是数据天花板。 */
    const PAGE_SIZE_DEFAULT = 30;
    const PAGE_SIZE_MAX = 200;
    /**
     * 单账扫描上限（**不是取数窗口**）。
     *   为什么留着：一本账若被异常写进十万条，逐条投影会把诊断面拖死。
     *   为什么够大：本仓九账的现实量级是「几十到几百条」，20000 已是两个数量级的余量；
     *   一旦真触到，`coverage.ledgers[id].truncated` 会点名该账并给出「扫到 / 总数」两个读数。
     */
    const MAX_SCAN_PER_LEDGER = 20000;
    /** 保存查询的条数上限（有界环形，超限如实报 dropped）。 */
    const MAX_SAVED_QUERIES = 50;
    const MAX_TEXT = 160;
    const MAX_ACTORS = 8;
    const MAX_LIST_VALUE = 40;

    /* ── 取值归一（与 evidence-workbench 同规格：没给 ⇒ null，不写 0） ── */
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function text(v, max) {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) + '…' : s) : s;
    }
    function norm(s) { return text(s).toLowerCase(); }
    /** 名字列表归一（去空、去重、截断）。**去重必须逐字**：同名异人靠引用键分列，不靠名字。 */
    function nameList(v, max) {
        const out = [];
        const seen = new Set();
        const push = (x) => {
            const t = text(x, 60);
            if (!t) return;
            const k = t.toLowerCase();
            if (seen.has(k)) return;
            seen.add(k);
            if (out.length < max) out.push(t);
        };
        if (Array.isArray(v)) { for (const x of v) push(x); }
        else push(v);
        return out;
    }
    /** 字符串数组归一（筛选条件的字面量列表）。 */
    function strList(v, max) {
        const out = [];
        if (!Array.isArray(v)) return out;
        for (const x of v) { const t = text(x, MAX_LIST_VALUE); if (t && out.indexOf(t) < 0) out.push(t); if (out.length >= max) break; }
        return out;
    }

    /* ── 检索面登记表（**单一真源**：本模块只在检索意义上声明字段，条目结构仍归 LEDGERS） ──
     *   每项：
     *     id          账本 id（**必须**与 evidence-workbench 的 LEDGERS 逐字相等，见 facetsAligned）
     *     actors      参与者字段名（数组，逐字段取；取不到即空）
     *     timeFields  有效时间字段名（楼层类；区间筛选任一并集命中）
     *     statusField 状态字段名（名词性字段；`deriveStatus` 可覆盖派生口径）
     *     sourceField 来源身份字段名
     *     revision    该账是否真有修订号（false 即「本账无此概念」——**不是 0**）
     *     textFields  正文子串检索字段名
     *     why         为什么这本账要按参与者/时间/状态可查（缺席时也照实说出来）
     */
    const FACETS = Object.freeze([
        {
            id: 'seed', actors: [], timeFields: ['floor', 'updatedFloor'],
            statusField: 'status', sourceField: 'source', revision: true,
            textFields: ['hook', 'source'],
            why: '「这条伏笔是谁埋的」在本账里没有参与者字段（伏笔挂事件不挂人），故 actor 面为空是**事实**而不是漏接'
        },
        {
            id: 'commitment', actors: ['actor', 'counterpart'], timeFields: ['floor', 'updatedFloor'],
            statusField: 'status', sourceField: 'source', revision: true,
            textFields: ['content', 'due', 'actor', 'counterpart'],
            why: '「谁答应过谁」必须能按人查 —— 两方都是参与者（actor 与 counterpart 分列，不合并成一个字符串）'
        },
        {
            id: 'parallel', actors: ['who'], timeFields: ['floor', 'updatedFloor', 'settledFloor'],
            statusField: 'status', sourceField: 'source', revision: true,
            textFields: ['title', 'fact', 'place', 'when'],
            why: '「当时还有谁在场」靠 who 筛，「什么时候落定的」靠 settledFloor 筛'
        },
        {
            id: 'secret', actors: ['keeper', 'about'], timeFields: ['floor', 'updatedFloor', 'revealedFloor'],
            statusField: 'status', sourceField: 'source', revision: true,
            textFields: ['secret'],
            why: '「谁知道」与「关于谁」是**两件事**（keeper / about 分开），合并后答不出「谁还蒙在鼓里」'
        },
        {
            id: 'recall-echo', actors: [], timeFields: ['floor', 'echoFloor'],
            statusField: 'status', sourceField: 'source', revision: false,
            textFields: ['detail', 'kind', 'echoNote'],
            why: '本账无参与者字段、无修订号（`copyItem` 只给 id/detail/kind/weight/status/floor/echoFloor）——如实为空，不造字段'
        },
        {
            id: 'echo', actors: ['char'], timeFields: ['floor'],
            statusField: 'mode', sourceField: 'char', revision: false,
            textFields: ['os'],
            why: '回声的「状态」在本账里就是 mode（没有 status 字段），且无修订号、无 source —— 按真字段读'
        },
        {
            id: 'fact-version', actors: ['subject'], timeFields: ['floor', 'updatedFloor'],
            statusField: 'status', sourceField: 'origin', revision: true,
            textFields: ['subject', 'predicate', 'value'],
            why: '事实的「当时值」要按主语查，并按时效字段（floor / updatedFloor）看它从哪一楼起换了代'
        },
        {
            id: 'event-completeness', actors: ['actors'], timeFields: ['segments.floor'], statusField: 'abandoned',
            sourceField: 'segments.source', revision: true,
            textFields: ['title', 'abandonReason'],
            why: '事件账的楼层与来源**在段里**（条目顶层没有 floor / source，只有 segments）——按段真值取，不照抄别账字段名'
        },
        {
            id: 'repair', actors: ['subject', 'target'], timeFields: ['floor'],
            statusField: 'status', sourceField: 'target', revision: false,
            textFields: ['action', 'target', 'reason', 'note'],
            why: '修复记录要能按「改谁」查（subject / target），本账无修订号'
        }
    ]);

    /** 筛选条件登记表（**面向用户的条件名只有这些**；未知键一律进 dropped，不静默忽略）。 */
    const FILTERS = Object.freeze([
        { key: 'ledgers', kind: 'set', label: '账本', why: '只查这几本账（空 = 全查）' },
        { key: 'actors', kind: 'set', label: '参与者', why: '参与者字段命中任一即可（精确名，不猜别名）' },
        { key: 'statuses', kind: 'set', label: '状态', why: '按各账真字段的状态读数（不是正文里出现的词）' },
        { key: 'sources', kind: 'set', label: '来源身份', why: '各账自己的来源字段（fact-version 是 origin，echo 是 char）' },
        { key: 'floorFrom', kind: 'int', label: '楼层起', why: '有效楼层任一并集的下界（含）' },
        { key: 'floorTo', kind: 'int', label: '楼层止', why: '有效楼层任一并集的上界（含）' },
        { key: 'revisionFrom', kind: 'int', label: '修订起', why: '无修订号的账**不参与**该条件（不是「修订 0」）' },
        { key: 'revisionTo', kind: 'int', label: '修订止', why: '同上' },
        { key: 'text', kind: 'text', label: '正文', why: '正文子串命中（只做空白压缩与大小写归一，不做同义改写）' },
        { key: 'hasFloor', kind: 'bool3', label: '有无楼层', why: 'true 只收有楼层的 / false 只收没有的 / null 不限' }
    ]);

    /** 排序键登记表。取不到值的行**一律排最后**（不参与比较，不按 0 参与）。 */
    const SORTS = Object.freeze([
        { key: 'score', label: '相关度', why: '仅当给了 text 条件时有意义；没给时全为 null ⇒ 退化为稳定序（ref）' },
        { key: 'floor', label: '楼层', why: '条目自报的引入楼层（null 排最后）' },
        { key: 'updatedFloor', label: '最近改动楼层', why: '同上' },
        { key: 'revision', label: '修订号', why: '无修订号的账（recall-echo / echo / repair）恒 null ⇒ 排最后' },
        { key: 'ledger', label: '账本', why: '按账本 id 聚合看' },
        { key: 'title', label: '标题', why: '字典序' },
        { key: 'status', label: '状态', why: '字典序（各账状态词表不同，跨账比较无意义 —— 本表不承诺跨账语义可比）' }
    ]);
    const DIRECTIONS = Object.freeze(['asc', 'desc']);

    /** FACETS 与账本登记表对账（**少一个 id 即报红**）。 */
    function facetsAligned(ledgers) {
        const want = [];
        for (const spec of (Array.isArray(ledgers) ? ledgers : [])) want.push(text(spec && spec.id, 40));
        const have = [];
        for (const f of FACETS) have.push(f.id);
        const missing = want.filter((id) => id && have.indexOf(id) < 0);
        const extra = have.filter((id) => want.indexOf(id) < 0);
        return { ok: missing.length === 0 && extra.length === 0, missing, extra, count: have.length };
    }

    /* ── 条件规范化 ──
     *   规范化 = ① 只保留登记表里的键（未知键进 dropped）② 值归一（空列表 ⇒ 去掉该条件，
     *   而不是「匹配空集」）③ 键序固定。
     *   为什么必须规范化：`replayKeyOf` 是「同条件 ⇒ 同键」，而对象键序不稳、空值形态多样，
     *   不规范化就会出现「同一个条件两个键」⇒ 保存的查询重放不上（X1 验收：查询重放一致）。
     */
    function normalizeSpec(spec) {
        const src = (spec && typeof spec === 'object' && !Array.isArray(spec)) ? spec : {};
        const dropped = [];
        const out = { ledgers: null, actors: null, statuses: null, sources: null, floorFrom: null, floorTo: null, revisionFrom: null, revisionTo: null, text: '', hasFloor: null, inverted: [] };
        const known = new Set(FILTERS.map((f) => f.key));
        for (const k of Object.keys(src)) if (!known.has(k)) dropped.push(k);
        const setOf = (k) => { const v = strList(src[k], 20); return v.length ? v : null; };
        out.ledgers = setOf('ledgers');
        out.actors = setOf('actors');
        out.statuses = setOf('statuses');
        out.sources = setOf('sources');
        out.floorFrom = numOrNull(src.floorFrom);
        out.floorTo = numOrNull(src.floorTo);
        out.revisionFrom = numOrNull(src.revisionFrom);
        out.revisionTo = numOrNull(src.revisionTo);
        out.text = text(src.text, 80);
        out.hasFloor = (src.hasFloor === true || src.hasFloor === 'true') ? true
            : ((src.hasFloor === false || src.hasFloor === 'false') ? false : null);
        /* 区间反转（起 > 止）**不静默交换** —— 交换会让用户以为条件生效了，实际查的是别的区间。
         *   如实标出并把它当**空集**处理（判据钉住：理由必须说出来）。 */
        if (out.floorFrom !== null && out.floorTo !== null && out.floorFrom > out.floorTo) out.inverted.push('floor');
        if (out.revisionFrom !== null && out.revisionTo !== null && out.revisionFrom > out.revisionTo) out.inverted.push('revision');
        return { spec: out, dropped };
    }

    /** 条件的稳定键（同条件 ⇒ 同键；不同条件 ⇒ 不同键）。 */
    function replayKeyOf(spec) {
        const n = normalizeSpec(spec);
        const s = n.spec;
        const part = (v) => (v === null ? '' : (Array.isArray(v) ? v.join('\u0001') : String(v)));
        const fields = ['ledgers', 'actors', 'statuses', 'sources', 'floorFrom', 'floorTo', 'revisionFrom', 'revisionTo', 'text', 'hasFloor'];
        const bits = [];
        for (const k of fields) bits.push(k + '=' + part(s[k]));
        return bits.join('\u0000');
    }

    /* ── 从条目取结构化行（**按各账真字段**，不照抄别账字段名） ── *
     *   event-completeness 是本仓「照抄别账字段名 ⇒ 恒空」那一族的当事人
     *   （v3.233.0 F-2 修过一次）：它的条目顶层没有 floor / source，只有 segments。
     *   故本函数按 FACETS 声明的字段取值，并对段结构走专门的并集取法。
     */
    function timeFloorsOf(facet, item) {
        const out = [];
        if (facet.id === 'event-completeness') {
            const segs = Array.isArray(item && item.segments) ? item.segments : [];
            for (const s of segs) {
                const n = numOrNull(s && s.floor);
                if (n !== null) {
                    const t = numOrNull(s.at);
                    out.push({ label: 'segments.floor', value: n, at: t === null ? null : t });
                }
            }
            return out;
        }
        for (const f of facet.timeFields) {
            const n = numOrNull(item && item[f]);
            if (n !== null) out.push({ label: f, value: n, at: null });
        }
        return out;
    }
    function deriveStatus(facet, item) {
        if (facet.id === 'event-completeness') return item && item.abandoned === true ? 'abandoned' : 'open';
        if (facet.id === 'fact-version') return item && item.revoked === true ? 'revoked' : 'active';
        return text(item && item[facet.statusField], 30);
    }
    function sourceOf(facet, item) {
        if (facet.id === 'event-completeness') {
            const segs = Array.isArray(item && item.segments) ? item.segments : [];
            const srcs = [];
            for (const s of segs) { const t = text(s && s.source, 40); if (t && srcs.indexOf(t) < 0) srcs.push(t); }
            return srcs.join('/');
        }
        return text(item && item[facet.sourceField], 40);
    }
    function actorsOf(facet, item) {
        const out = [];
        for (const f of facet.actors) {
            for (const n of nameList(item && item[f], MAX_ACTORS)) out.push({ field: f, name: n });
        }
        return out;
    }
    function textOf(facet, item) {
        const bits = [];
        /* echo 的正文在 `fields` 里（自由结构），单独并进来 —— 否则「回声里说了什么」查不到。 */
        if (facet.id === 'echo' && item && item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields)) {
            for (const k of Object.keys(item.fields)) bits.push(text(item.fields[k], 200));
        }
        for (const f of facet.textFields) bits.push(text(item && item[f], 200));
        return bits.filter(Boolean).join(' · ');
    }

    /**
     * 取全量宇宙（**直读原账状态，不经过工作台的 200 条摘要**）。
     * @param {object} host 宿主实例（只读它的各账状态字段）
     * @param {object} opts { ledgers:[登记表], apis:{id:api}, maxPerLedger?:number }
     * @returns {{rows, ledgers, counts, scanned, specs}}
     */
    function universeOf(host, opts) {
        const o = opts || {};
        const specs = Array.isArray(o.ledgers) ? o.ledgers : [];
        const apis = (o.apis && typeof o.apis === 'object') ? o.apis : {};
        const cap = Number.isFinite(Number(o.maxPerLedger)) && Number(o.maxPerLedger) > 0
            ? Math.floor(Number(o.maxPerLedger)) : MAX_SCAN_PER_LEDGER;
        const rows = [];
        const ledgers = {};
        const counts = { ok: 0, empty: 0, absent: 0 };
        let scanned = 0;
        for (const spec of specs) {
            const facet = FACETS.filter((f) => f.id === spec.id)[0] || null;
            const rec = { id: text(spec.id, 40), label: text(spec.label, 40), state: 'absent', reason: '', total: 0, kept: 0, truncated: false };
            /* 检索面缺登记 ⇒ 如实报出来（不是静默跳过）。判据 B1 钉住「两表 id 集合逐字相等」，
             *   这里留一条运行期兜底，免得「漏登记」变成「查不到还以为没有」。 */
            if (!facet) { rec.reason = 'facet-missing'; ledgers[rec.id] = rec; counts.absent += 1; continue; }
            const api = apis[spec.id] || null;
            if (!api) { rec.reason = 'module-unavailable'; ledgers[rec.id] = rec; counts.absent += 1; continue; }
            let raw;
            try { raw = (typeof spec.state === 'function') ? spec.state(host) : undefined; } catch (_e) { raw = undefined; }
            if (raw === undefined || raw === null) { rec.reason = 'state-missing'; ledgers[rec.id] = rec; counts.absent += 1; continue; }
            let items = [];
            try { items = spec.pick ? (spec.pick(api, raw) || []) : []; } catch (_e) { items = []; }
            if (!Array.isArray(items)) items = [];
            rec.total = items.length;
            if (!items.length) { rec.state = 'empty'; rec.reason = 'no-items'; ledgers[rec.id] = rec; counts.empty += 1; continue; }
            rec.state = 'ok';
            counts.ok += 1;
            let kept = items;
            if (items.length > cap) { kept = items.slice(-cap); rec.truncated = true; }
            rec.kept = kept.length;
            scanned += kept.length;
            let idx = 0;
            for (const it of kept) {
                idx += 1;
                if (!it || typeof it !== 'object') continue;
                let p = {};
                try { p = spec.project ? (spec.project(it, api) || {}) : {}; } catch (_e) { p = {}; }
                let key = '';
                try {
                    key = text(it.id || it.key || (typeof spec.keyOf === 'function' ? spec.keyOf(it) : '') || p.title, 80);
                } catch (_e) { key = ''; }
                const times = timeFloorsOf(facet, it);
                rows.push({
                    ref: text(spec.id, 40) + ':' + (key || ('#' + idx)),
                    ledger: text(spec.id, 40), ledgerLabel: text(spec.label, 40),
                    title: text(p.title, MAX_TEXT), detail: text(p.detail, MAX_TEXT),
                    status: deriveStatus(facet, it),
                    floor: times.length ? times[0].value : null,
                    updatedFloor: numOrNull(p.updatedFloor),
                    times: times,
                    revision: facet.revision ? numOrNull(p.revision) : null,
                    revisionKnown: facet.revision === true,
                    source: sourceOf(facet, it),
                    actors: actorsOf(facet, it),
                    text: textOf(facet, it),
                    _score: null
                });
            }
            ledgers[rec.id] = rec;
        }
        return { rows: rows, ledgers: ledgers, counts: counts, scanned: scanned, specs: specs };
    }

    /** 区间命中：'hit' | 'miss' | 'no-floor'。**无楼层不是「不满足」**——原因必须可分。 */
    function rangeHit(times, from, to) {
        if (from === null && to === null) return null;
        if (!times.length) return 'no-floor';
        for (const t of times) {
            if (from !== null && t.value < from) continue;
            if (to !== null && t.value > to) continue;
            return 'hit';
        }
        return 'miss';
    }

    /**
     * 单行匹配（**纯函数**）。返回 'hit' 或**具名**不匹配原因。
     *   具名原因的意义：被**哪种**条件挡掉是可归因事实（「查不到」不该是一句话）。
     */
    function matchRow(row, s) {
        if (s.ledgers && s.ledgers.indexOf(row.ledger) < 0) return 'ledger';
        if (s.statuses && s.statuses.indexOf(row.status) < 0) return 'status';
        if (s.sources && s.sources.indexOf(row.source) < 0) return 'source';
        if (s.actors && s.actors.length) {
            const have = row.actors.map((a) => a.name.toLowerCase());
            let ok = false;
            for (const want of s.actors) if (have.indexOf(want.toLowerCase()) >= 0) { ok = true; break; }
            if (!ok) return 'actor';
        }
        if (s.hasFloor === true && !row.times.length) return 'has-floor';
        if (s.hasFloor === false && row.times.length) return 'has-floor';
        const rh = rangeHit(row.times, s.floorFrom, s.floorTo);
        if (rh === 'no-floor') return 'floor-unknown';
        if (rh === 'miss') return 'floor-range';
        if (s.revisionFrom !== null || s.revisionTo !== null) {
            /* 无修订概念的账**不参与**该条件（不是「修订 0 被区间滤掉」）——原因单列。 */
            if (!row.revisionKnown || row.revision === null) return 'revision-absent';
            if (s.revisionFrom !== null && row.revision < s.revisionFrom) return 'revision-range';
            if (s.revisionTo !== null && row.revision > s.revisionTo) return 'revision-range';
        }
        if (s.text) {
            const q = norm(s.text);
            const t = norm(row.title), d = norm(row.detail), x = norm(row.text);
            if (t === q) row._score = 120;
            else if (t.startsWith(q)) row._score = 100;
            else if (t.includes(q)) row._score = 80;
            else if (x.includes(q)) row._score = 50;
            else if (d.includes(q)) row._score = 30;
            else return 'text';
        } else row._score = null;
        return 'hit';
    }

    /* ── 排序（取不到值的行**排在最后**，不按 0 参与比较） ── */
    function sortRows(rows, sortKey, dir) {
        const key = SORTS.filter((s) => s.key === sortKey)[0] ? sortKey : null;
        const desc = dir === 'desc';
        const valOf = (r) => {
            if (!key) return null;
            if (key === 'score') return (r._score === null || r._score === undefined) ? null : r._score;
            return r[key];
        };
        const cmp = (a, b) => {
            const va = valOf(a), vb = valOf(b);
            const na = (va === null || va === undefined), nb = (vb === null || vb === undefined);
            /* 缺值恒后置：升序降序都一样 —— 否则「没给」在降序里会跑到最前面冒充最大值。 */
            if (na && nb) return String(a.ref).localeCompare(String(b.ref), 'en');
            if (na) return 1;
            if (nb) return -1;
            let c;
            if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
            else c = String(va).localeCompare(String(vb), 'en');
            if (c !== 0) return desc ? -c : c;
            return String(a.ref).localeCompare(String(b.ref), 'en');   // 稳定序：同键按 ref
        };
        return rows.slice().sort(cmp);
    }
    function objCount(o) { return o ? Object.keys(o).length : 0; }

    /**
     * 结构化查询（**纯函数 + 只读**）。
     *
     * @param {object} host 宿主实例
     * @param {object} spec 查询条件（见 FILTERS）
     * @param {object} [opts] { ledgers:[登记表]（必给，来自工作台 LEDGERS）, apis:{id:api},
     *                          page?:number, pageSize?:number, sort?:string, dir?:'asc'|'desc',
     *                          maxPerLedger?:number }
     * @returns {object} 恒定键面（取不到也全键在场，下游按键断言即可，不必猜）
     */
    function query(host, spec, opts) {
        const o = opts || {};
        const n = normalizeSpec(spec);
        const s = n.spec;
        const specs = Array.isArray(o.ledgers) ? o.ledgers : [];
        const uni = universeOf(host, { ledgers: specs, apis: o.apis, maxPerLedger: o.maxPerLedger });
        /* 区间反转 ⇒ 空集（并如实说出为什么），不静默交换。 */
        const inverted = s.inverted.length > 0;
        const scanned = uni.rows.length;
        const hits = [];
        const unmatched = {};
        const unknownFloor = [];
        if (!inverted) {
            for (const r of uni.rows) {
                const v = matchRow(r, s);
                if (v === 'hit') { hits.push(r); continue; }
                unmatched[v] = (unmatched[v] || 0) + 1;
                if (v === 'floor-unknown') unknownFloor.push({ ref: r.ref, why: 'no-floor-on-any-time-field' });
            }
        }
        const total = hits.length;
        const sorted = sortRows(hits, o.sort, o.dir);
        const pageSizeRaw = Number(o.pageSize);
        const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0
            ? Math.min(PAGE_SIZE_MAX, Math.floor(pageSizeRaw)) : PAGE_SIZE_DEFAULT;
        const pages = total === 0 ? 0 : Math.ceil(total / pageSize);
        const pageRaw = Number(o.page);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
        /* 翻过头**不回落第一页**：如实报 pageOutOfRange 且 rows 为空。
         *   回落会让「你翻过头了」与「这就是全部」同形 —— 而两者处置相反。 */
        const outOfRange = total > 0 && page > pages;
        const rows = outOfRange ? [] : sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
        const byLedger = {};
        for (const r of hits) byLedger[r.ledger] = (byLedger[r.ledger] || 0) + 1;
        const out = {
            version: QUERY_VERSION,
            replayKey: replayKeyOf(s),
            spec: {
                ledgers: s.ledgers, actors: s.actors, statuses: s.statuses, sources: s.sources,
                floorFrom: s.floorFrom, floorTo: s.floorTo,
                revisionFrom: s.revisionFrom, revisionTo: s.revisionTo,
                text: s.text, hasFloor: s.hasFloor
            },
            droppedKeys: n.dropped,
            emptyReason: '',
            total: total,
            page: page, pageSize: pageSize, pages: pages, pageOutOfRange: outOfRange,
            sort: (SORTS.filter((x) => x.key === o.sort)[0] ? o.sort : null),
            dir: (o.dir === 'desc' ? 'desc' : 'asc'),
            rows: rows,
            hitsByLedger: byLedger,
            scanned: scanned,
            unmatched: unmatched,
            unmatchedUnknownFloor: unknownFloor,
            /* 完整度：**扫描范围**逐账报出（这是「找不到 ≠ 没有」的落点）。 */
            coverage: {
                ledgers: uni.ledgers,
                counts: uni.counts,
                scanned: scanned,
                requestedLedgers: specs.length,
                /** 本面直读原账**全量**、不经过工作台的 200 条摘要 —— 显式声明，防读者以为同源。 */
                summaryBypassed: true,
                /** 直读封顶（真触到时该账 truncated=true，两个读数都在 coverage.ledgers 里）。 */
                scanCap: Number.isFinite(Number(o.maxPerLedger)) && Number(o.maxPerLedger) > 0
                    ? Math.floor(Number(o.maxPerLedger)) : MAX_SCAN_PER_LEDGER,
                truncated: Object.keys(uni.ledgers).filter((k) => uni.ledgers[k].truncated === true)
            },
            state: inverted ? 'inverted-range' : (total > 0 ? 'ok' : 'empty')
        };
        if (inverted) out.emptyReason = '区间起止反转（' + s.inverted.join(' / ') + '）：按空集处理，**不自动交换** —— 交换会查出另一个区间而不报错';
        if (!inverted && total === 0 && objCount(unmatched) === 0) {
            /* 一条都没进过比对 ⇒ 扫描面本身是空的：这不是「查不到」，是「没东西可查」。 */
            out.emptyReason = (uni.counts.absent > 0 && uni.counts.ok === 0)
                ? '扫描面为空：九账全部取不到（见 coverage.ledgers 的 reason）'
                : '扫描面为空（无账本登记 / 未给 ledgers）';
        }
        return out;
    }

    /** 分页辅助：按条件直接取第 N 页（等价于 query 的 page 参数；单列便于宿主转发）。 */
    function pageOf(host, spec, page, pageSize, opts) {
        return query(host, spec, Object.assign({}, opts || {}, { page: page, pageSize: pageSize }));
    }

    /* ── 保存的查询（**只保存条件，不保存结果**） ── *
     *   为什么必须只存条件：存结果＝第二份证据库（本仓明令禁止），而且原账一改，存下来的
     *   结果就成了**旧读数冒充现读数** —— 那是比「查不到」更坏的一类账。
     *   本模块**不做持久化**：`upsertSaved` / `removeSaved` 都是纯函数（传入旧表、返回新表），
     *   存哪儿由宿主决定（宿主侧走会话键 + storage，见 index.js 的接线）。
     */
    function normalizeSaved(list) {
        const out = [];
        const seen = new Set();
        for (const it of (Array.isArray(list) ? list : [])) {
            if (!it || typeof it !== 'object') continue;
            const label = text(it.label, 40);
            if (!label) continue;
            const key = text(it.replayKey, 200) || replayKeyOf(it.spec);
            if (seen.has(key)) continue;
            seen.add(key);
            const n = normalizeSpec(it.spec);
            out.push({ label: label, replayKey: key, spec: n.spec, droppedKeys: n.dropped, at: numOrNull(it.at) });
        }
        return out;
    }
    /**
     * 新增/覆盖一条保存查询（同 `replayKey` 即覆盖 —— **同名不同条件是两条**，按条件判重不按名判重）。
     * @returns {{list, saved:boolean, replaced:boolean, dropped:number, reason:string}}
     */
    function upsertSaved(list, entry, now) {
        const cur = normalizeSaved(list);
        const label = text(entry && entry.label, 40);
        if (!label) return { list: cur, saved: false, replaced: false, dropped: 0, reason: 'label-required' };
        const n = normalizeSpec(entry && entry.spec);
        const key = replayKeyOf(n.spec);
        const at = Number.isFinite(Number(now)) ? Math.floor(Number(now)) : null;
        const next = [];
        let replaced = false;
        for (const it of cur) {
            if (it.replayKey === key) { replaced = true; continue; }
            next.push(it);
        }
        next.push({ label: label, replayKey: key, spec: n.spec, droppedKeys: n.dropped, at: at });
        let dropped = 0;
        while (next.length > MAX_SAVED_QUERIES) { next.shift(); dropped += 1; }
        return { list: next, saved: true, replaced: replaced, dropped: dropped, reason: dropped ? 'capped' : '' };
    }
    function removeSaved(list, replayKey) {
        const cur = normalizeSaved(list);
        const k = text(replayKey, 200);
        const next = cur.filter((it) => it.replayKey !== k);
        return { list: next, removed: next.length !== cur.length, reason: next.length !== cur.length ? '' : 'not-found' };
    }
    /** 保存查询的回放：**用当前原账重跑**（这是「重放一致」的全部含义）。 */
    function replaySaved(host, entry, opts) {
        const cur = normalizeSaved([entry]);
        if (!cur.length || !cur[0].label) return { ok: false, reason: 'bad-entry', query: null, replayKey: '', keyMatched: false };
        const q = query(host, cur[0].spec, opts);
        return { ok: true, reason: '', query: q, replayKey: cur[0].replayKey, keyMatched: q.replayKey === cur[0].replayKey };
    }

    /** 诊断一行（纯字符串，不抛）。**空 / 查不到 / 没东西可查**三者分开写。 */
    function line(res) {
        try {
            if (!res || typeof res !== 'object') return '—（查询面异常）';
            const cov = res.coverage || {};
            const parts = ['证据查询 ' + (res.total || 0) + ' 条'];
            if (res.total) parts.push('第 ' + res.page + '/' + (res.pages || 1) + ' 页');
            if (res.pageOutOfRange) parts.push('翻过头（共 ' + res.pages + ' 页）');
            if (cov.counts) {
                const c = cov.counts;
                parts.push('扫 ' + (cov.scanned || 0) + ' / ' + (c.ok || 0) + ' 账');
                if (c.empty) parts.push('空账 ' + c.empty);
                if (c.absent) parts.push('缺席 ' + c.absent);
            }
            const tr = Array.isArray(cov.truncated) ? cov.truncated : [];
            if (tr.length) parts.push('截断 ' + tr.join('、'));
            if (res.state === 'inverted-range') parts.push('（区间反转，按空集）');
            else if (res.state === 'empty' && res.emptyReason) parts.push('（' + res.emptyReason + '）');
            return parts.join(' · ');
        } catch (_e) { return '—（查询面异常）'; }
    }

    const api = Object.freeze({
        QUERY_VERSION, FACETS, FILTERS, SORTS, DIRECTIONS,
        PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, MAX_SCAN_PER_LEDGER, MAX_SAVED_QUERIES,
        facetsAligned, normalizeSpec, replayKeyOf,
        universeOf, matchRow, query, pageOf,
        normalizeSaved, upsertSaved, removeSaved, replaySaved, line
    });
    root.LonShaEvidenceQuery = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
