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
    /* [v3.307.0 · M-O8 第二刀] 2：秘密面不再把正文放进检索面。
     *   修前实测：同一条秘密的正文会同时进 `row.title`（由工作台 LEDGERS 投影）
     *   与 `row.text`（本模块 textFields 拼）两个列 —— 只改一处，另一列照旧泄。
     *   故两列同时收口，并在行上透出 `scope` / `masked` 两个读数。 */
    const QUERY_VERSION = 3;
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

    /* [v3.321.0 · M3-O6] 大型库即时响应的三件读数（都不改任何既有判定口径）：
     *   · 账条件非空时**只扫这些账**（`coverage.ledgers[].state='skipped'`）——
     *     「分页 / 换筛选不反复物化全部」的落点；
     *   · `PROJECTION_CACHE_VERSION` 逐账投影缓存的格式号（换格式即作废旧缓存，
     *     免得旧格式的行被当新格式复用）；
     *   · `QUERY_ASYNC_SHARD` 协作式查询每片比对的**行数**（让出粒度）。
     *     为什么是行而不是账：账级让出在「一本账一万条」时仍是一次长阻塞，
     *     而行级让出把最长连续占用压到 shard 行。
     */
    const PROJECTION_CACHE_VERSION = 1;
    const QUERY_ASYNC_SHARD = 2000;
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
            /* [v3.307.0 · M-O8 第二刀] **正文不进检索面**（修前为 ['secret']）。
             *   为什么不是「保留但不展示」：`text` 列本身就在外供结构里
             *   （query 的 rows → 实体信封 → 手机端），保留就是泄。
             *   可见性改由 `row.scope` 承担；正文归注入面（renderForViewer）。 */
            textFields: [],
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
    /* ── [v3.321.0 · M3-X1] 带证据的自然语言问答：问题规划 + 证据合成 ──────
     * 【这一段的边界（与计划逐条对齐，写死在代码里）】
     *   · **不造查询 API**：条件一律产出 FILTERS 登记表里的键，判定一律走 matchRow；
     *   · **只基于许可结果**：合成只读 query 返回的 rows；被遮蔽的行只报存在性；
     *   · **每个关键句可回源**：每句带 ref（账本 + 引用键 + 楼层）；
     *   · **无答案给缺口而非编补**：查不到报 gaps（具名原因），不回落成编造句子。
     *
     * 【为什么先规划再合成，而不是一次大查询】
     *   用户问的是「谁答应了什么、后来怎样、为何改变」—— 这是一个**多条件问题**：
     *   前半句要按人筛约定，后半句要按同一本账的状态看它后来变成了什么。
     *   合成一条条件会把「按人筛」与「按状态筛」塌成一次筛选，答不出「后来怎样」。
     *   故这里产出**若干条受控查询**（每条都可在 UI 上单列、可单独重放）。
     */
    const QA_VERSION = 1;
    /** 问题意图登记表（**面向用户的问题型只有这些**；未知一律进 gaps，不猜）。 */
    const QA_INTENTS = Object.freeze([
        { id: 'promise', label: '谁答应了什么', hint: /答应|承诺|说好|约定|保证|发誓|欠/ },
        { id: 'later', label: '后来怎样', hint: /后来|结果|最终|最后|现在|怎么样了/ },
        { id: 'why', label: '为何改变', hint: /为什么|为何|怎么会|原因|转变|反悔|变卦/ },
        { id: 'where', label: '在哪一楼', hint: /哪一?楼|什么时候|何时|第几楼/ },
        { id: 'who', label: '涉及谁', hint: /谁|哪个角色|哪位/ }
    ]);
    /**
     * 从自然语言问题里取**受控查询条件**（纯函数，不摸 host、不查任何东西）。
     *
     * 三条纪律：
     *   ① **只产出登记表里的键**：返回的每个 spec 都经 normalizeSpec 走一遍，
     *      于是未知键进 dropped、空值不落进条件 —— 规划器不可能造出非法条件；
     *   ② **没识别出人名就说出来**：`who` 面为空时不编一个人名进去（那是编造），
     *      而是把「谁」留在 gaps 里，由合成阶段如实说「这条问句里没认出人名」。
     *   ③ **意图不明也要有产出**：至少一条按 text 的宽查，否则「问了个怪问题」
     *      会与「系统坏了」同形（都返回空）。
     *
     * @param {string} question 用户问句
     * @param {object} [opts] { knownActors?:string[], ledgers?:string[], now?:number }
     * @returns {object} { intents, plans[], gaps[], actor }
     */
    function planQuestion(question, opts) {
        const o = opts || {};
        const q = text(question, 200);
        const intents = [];
        const gaps = [];
        for (const it of QA_INTENTS) if (it.hint.test(q)) intents.push(it.id);
        if (!intents.length) gaps.push({ kind: 'intent', why: '问句里没认出任何受控问题型（答应/后来/为何/哪一楼/谁）—— 按正文宽查，不假装理解' });
        /* 人名识别：**只从宿主给的 knownActors 里认**（不猜别名、不做模糊匹配）。
         *   为什么不让规划器自己从问句里切词当人名：切出来的多半是动词短语，
         *   而「按一个不存在的人名筛」会返回空 —— 空与「这人确实没答应过」同形。 */
        const known = (Array.isArray(o.knownActors) ? o.knownActors : [])
            .map((x) => text(x, 40)).filter(Boolean);
        let actor = null;
        for (const k of known) if (q.indexOf(k) >= 0) { actor = k; break; }
        if (!actor) {
            gaps.push({
                kind: 'actor',
                why: known.length
                    ? '问句里没认出在场人名（只认 knownActors 里的原名，不猜别名）—— 不按人名筛，避免「筛一个不存在的人」与「这人确实没答应过」同形'
                    : '宿主未提供 knownActors：无人名可比对（这是入参事实，不是「没有这个人」）'
            });
        }
        const ledgersOf = (id) => {
            if (id === 'promise') return ['commitment'];
            if (id === 'later' || id === 'why') return ['commitment', 'seed', 'fact-version'];
            if (id === 'where') return null;
            return null;
        };
        const plans = [];
        const pushPlan = (id, spec, why) => {
            const n = normalizeSpec(spec);
            plans.push({ id: id, spec: n.spec, droppedKeys: n.dropped, why: why });
        };
        /* ① 「谁答应了什么」——按人 + 约定账。这是**受控**的一步：账名写死，不推导。 */
        if (intents.indexOf('promise') >= 0) {
            const spec = { ledgers: ledgersOf('promise'), text: '' };
            if (actor) spec.actors = [actor];
            pushPlan('promise', spec, actor
                ? '按「' + actor + '」筛约定账：答「谁答应了什么」'
                : '无人在场人名可比对：按约定账全量取（不按人名筛）');
        }
        /* ② 「后来怎样」——同一批账看**已结/未结**两态。
         *   这里刻意**不**用 statuses 过滤成 open：那样答不出「后来怎样」（已结的会被滤掉）。
         *   两态分列由合成阶段按行的 status 分档，而不是靠两条互斥查询 ——
         *   互斥查询会把「没查到」与「已被过滤」混成一件事。 */
        if (intents.indexOf('later') >= 0) {
            const spec = { ledgers: ledgersOf('later') };
            if (actor) spec.actors = [actor];
            pushPlan('later', spec, '按同一批账取全部状态：由合成阶段分「未结 / 已结」两档（不用两条互斥查询）');
        }
        /* ③ 「为何改变」——转折类线索走正文宽查（只做子串，不做同义改写）。 */
        if (intents.indexOf('why') >= 0) {
            const spec = { ledgers: ledgersOf('why'), text: actor ? actor : '' };
            pushPlan('why', spec, '按转折词/人名做正文子串查：本面只做子串命中，不解释因果（因果解释不是查询面的职责）');
        }
        /* ④ 意图不明（或只问「在哪一楼」）时兜底：至少给一条正文宽查。
         *   否则「问了个怪问题」与「系统坏了」都是空结果，两者同形。 */
        if (!plans.length) {
            const spec = { text: q.slice(0, 80) };
            if (actor) spec.actors = [actor];
            pushPlan('text', spec, '未命中受控问题型：按问句正文做子串宽查（如实说明这是宽查，不是理解）');
        }
        return { question: q, intents: intents, actor: actor, plans: plans, gaps: gaps };
    }
    /**
     * 证据合成：把**已经许可的结果行**装订成带出处的短答（纯函数，不查任何东西）。
     *
     * 四类句子，每类都可回源：
     *   · 存在句：查到 N 条（分账计）；
     *   · 未结句：status 属未结档的行（各账未结档在 QA_OPEN_STATES 里写死）；
     *   · 已结句：其余行（含 broken / cancelled —— **不合并成一档**）；
     *   · 遮蔽句：masked 行只报「存在 + 知识范围」，**正文一格不带**。
     *
     * 无答案时：`answer` 为空数组 + `gaps` 具名原因。**不产出任何无出处的句子。**
     *
     * @param {object} plan planQuestion 的返回
     * @param {Array} results [{ id, query }] —— query 是 query() 的返回（已许可）
     * @param {object} [opts] { maxSentences?:number }
     * @returns {object} { answer[], gaps[], refs[], masked, truncated }
     */
    function composeAnswer(plan, results, opts) {
        const o = opts || {};
        const maxSentences = Math.max(1, Number(o.maxSentences) || 8);
        const p = (plan && typeof plan === 'object') ? plan : { plans: [], gaps: [] };
        const gaps = (Array.isArray(p.gaps) ? p.gaps.slice() : []);
        const answer = [];
        const refs = [];
        let masked = 0;
        let truncated = false;
        const add = (s) => {
            if (answer.length >= maxSentences) { truncated = true; return false; }
            answer.push(s);
            return true;
        };
        const list = Array.isArray(results) ? results : [];
        let anyRows = false;
        for (const r of list) {
            const q = r && r.query;
            if (!q || typeof q !== 'object') {
                gaps.push({ kind: 'result-absent', planId: (r && r.id) || '', why: '该条计划没有查询结果（不是「没有命中」，是没跑）' });
                continue;
            }
            const rows = Array.isArray(q.rows) ? q.rows : [];
            if (q.state === 'empty' || q.state === 'inverted-range' || q.total === 0) {
                gaps.push({
                    kind: 'no-rows', planId: r.id,
                    why: (q.emptyReason || '该条件下没有命中') + '（扫了 ' + (q.scanned || 0) + ' 行）'
                });
                continue;
            }
            if (q.pageOutOfRange) {
                gaps.push({ kind: 'page-out-of-range', planId: r.id, why: '翻过头（共 ' + q.pages + ' 页）—— 这不是「没有」' });
                continue;
            }
            anyRows = true;
            /* 存在句：**带总数与账分布**（不是「找到几条」一句话）。 */
            const byLedger = q.hitsByLedger || {};
            const parts = Object.keys(byLedger).map((k) => k + ' ' + byLedger[k]);
            add({
                kind: 'exists', planId: r.id,
                text: '查到 ' + q.total + ' 条' + (parts.length ? '（' + parts.join('、') + '）' : ''),
                ref: null, floor: null
            });
            for (const row of rows) {
                if (row && row.masked === true) {
                    masked += 1;
                    add({
                        kind: 'masked', planId: r.id,
                        text: '（存在但不可展示：' + (row.ledgerLabel || row.ledger) + ' 知识范围 ' + (row.scope || '判不了') + '）',
                        ref: row.ref, floor: row.floor, ledger: row.ledger
                    });
                    if (row.ref) refs.push({ ref: row.ref, ledger: row.ledger, floor: row.floor });
                    continue;
                }
                const isOpen = (QA_OPEN_STATES[row.ledger] || []).indexOf(row.status) >= 0;
                add({
                    kind: isOpen ? 'open' : 'settled',
                    planId: r.id,
                    text: (row.title || '（无标题）')
                        + (row.status ? '［' + row.status + '］' : '')
                        + (row.detail ? ' — ' + row.detail : ''),
                    ref: row.ref, floor: row.floor, ledger: row.ledger, status: row.status
                });
                if (row.ref) refs.push({ ref: row.ref, ledger: row.ledger, floor: row.floor });
            }
        }
        if (!anyRows && !answer.length) {
            gaps.push({ kind: 'no-answer', why: '没有任何一条计划查到可展示的行 —— 这是「查不到」，不是「没有这件事」' });
        }
        return {
            version: QA_VERSION,
            question: p.question || '',
            intents: Array.isArray(p.intents) ? p.intents : [],
            answer: answer,
            gaps: gaps,
            refs: refs,
            masked: masked,
            truncated: truncated,
            /* 回源率是**读数**不是承诺：每条有 ref 的句子都在 refs 里。 */
            resourced: answer.filter((s) => !!s.ref).length,
            total: answer.length
        };
    }
    /** 各账的「未结」状态档（**写死，不推导** —— 各账状态词表本就不同）。
     *   fact-version 的 active / seed 的 advancing 都属「还没结」：如实分档，不合并。 */
    const QA_OPEN_STATES = Object.freeze({
        commitment: ['open'],
        seed: ['open', 'advancing'],
        secret: ['sealed'],
        parallel: ['open'],
        'fact-version': ['active'],
        repair: ['open'],
        'recall-echo': ['open'],
        echo: ['on'],
        'event-completeness': ['open']
    });
    /** 诊断一行（纯字符串，不抛）。**没查 / 查了没有 / 判不了**三者分开写。 */
    function qaLine(composed) {
        try {
            const c = composed;
            if (!c || typeof c !== 'object') return '—（问答面异常）';
            const parts = ['问答 ' + (c.total || 0) + ' 句'];
            if (c.resourced) parts.push('可回源 ' + c.resourced);
            if (c.masked) parts.push('遮蔽 ' + c.masked);
            if (c.intents && c.intents.length) parts.push('问题型 ' + c.intents.join('/'));
            if (c.gaps && c.gaps.length) parts.push('缺口 ' + c.gaps.length);
            if (c.truncated) parts.push('⚠ 句子数触顶');
            return parts.join(' · ');
        } catch (_e) { return '—（问答面异常）'; }
    }

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
        const counts = { ok: 0, empty: 0, absent: 0, skipped: 0 };
        let scanned = 0;
        /* [v3.321.0 · M3-O6] 账条件非空时只扫被点名的账（这是「不反复物化全部」的落点）。
         *   被跳过的账**必须可见**（state=skipped、reason=excluded-by-ledger-filter，
         *   且 total=null 表示「没扫 ⇒ 条数未知」）—— 否则「这本账被筛掉了」与
         *   「这本账不存在 / 是空的」在读数上同形，而三者处置相反。 */
        const onlyRaw = (o.onlyLedgers instanceof Set) ? o.onlyLedgers
            : (Array.isArray(o.onlyLedgers)
                ? new Set(o.onlyLedgers.map((x) => text(x, 40)))
                : null);
        /* [v3.321.0 · M3-O6 自伤修复 ①] 收窄面与**真实登记表**求交：交集为空 ⇒ 退回全扫。
         *   修前（本版首跑）：条件里全是登记表里没有的 id 时，九账会被全部跳过 ⇒
         *   `counts.ok=0 && total=0` ⇒ 上层把它读成「扫描面为空（九账全取不到）」，
         *   而用户其实只是**点错了一个账名** —— 两态处置相反（改条件 vs 查装载），
         *   压成一态即缺陷（v3310 C1/K2 实测翻红）。
         *   为什么退回全扫是对的：收窄的语义是「别扫用户没要的账」；
         *   当用户点的账一本都不存在时，「一本都不扫」不是他要的语义，
         *   而「点错了账名」自有既有判定（unknown-ledger）负责 —— 那需要扫描面在场。 */
        const _knownIds = new Set();
        for (const _sp of specs) _knownIds.add(text(_sp && _sp.id, 40));
        let _onlyHit = false;
        if (onlyRaw) for (const _id of onlyRaw) if (_knownIds.has(_id)) { _onlyHit = true; break; }
        const only = (onlyRaw && _onlyHit) ? onlyRaw : null;
        /* 逐账投影缓存：形状 {version, fp:{id:指纹}, rows:{id:[行]}}，由**宿主**持有。
         *   本模块不持久化、不自己 new 一份 —— 缓存归调用方（与「保存查询只存条件」同一纪律）。 */
        /* 缓存三态（**含义相反的态不得压成一个读数**）：
         *   · 未给          ⇒ cache=null / state=off
         *   · 给了、无 version 或 version 相同 ⇒ 当场可用（宿主刚 new 的空对象走这条）
         *   · 给了、version 存在且不同       ⇒ **作废**（旧格式缓存必须明说被丢，不能静默当没有）
         *   修前三条压成「enabled:false」一个读数：宿主首跑的空对象与旧格式同形，
         *   于是「还没建缓存」永远进不去缓存路径（M3-O6 的复用等于没接）。 */
        const _pcRaw = (o.projectionCache && typeof o.projectionCache === 'object') ? o.projectionCache : null;
        const _pcVer = _pcRaw ? Number(_pcRaw.version) : null;
        const _pcStale = !!_pcRaw && _pcVer !== null && Number.isFinite(_pcVer)
            && _pcVer !== PROJECTION_CACHE_VERSION;
        const cache = (_pcRaw && !_pcStale) ? _pcRaw : null;
        const skippedLedgers = [];
        let cacheHits = 0, cacheMisses = 0;
        for (const spec of specs) {
            const facet = FACETS.filter((f) => f.id === spec.id)[0] || null;
            const rec = { id: text(spec.id, 40), label: text(spec.label, 40), state: 'absent', reason: '', total: 0, kept: 0, truncated: false };
            /* 检索面缺登记 ⇒ 如实报出来（不是静默跳过）。判据 B1 钉住「两表 id 集合逐字相等」，
             *   这里留一条运行期兜底，免得「漏登记」变成「查不到还以为没有」。 */
            /* [v3.321.0 · M3-O6] 账条件点名了别的账 ⇒ 这一账**本次根本不扫**（不物化、不投影）。
             *   仍如实登记：state=skipped、total=null（没扫 ⇒ 条数未知，不是 0）。 */
            if (only && !only.has(rec.id)) {
                rec.state = 'skipped';
                rec.reason = 'excluded-by-ledger-filter';
                rec.total = null;
                rec.kept = 0;
                ledgers[rec.id] = rec;
                counts.skipped += 1;
                skippedLedgers.push(rec.id);
                continue;
            }
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
            /* [v3.321.0 · M3-O6] 逐账投影缓存命中：指纹一致 ⇒ 复用上次这一账的行。
             *   两处必须做对，否则缓存会**悄悄改结论**：
             *     ① **浅拷贝每一行**：下游 matchRow 会就地写 `row._score`，
             *        共享引用会让两次查询互相污染（本次的分数写进上次的行）；
             *     ② 拷贝时 `_score` 显式归零：提前 return 的路径（ledger/status 不匹配）
             *        **不会**重设 _score，脏分会被 sortRows 当相关度用。
             *   指纹是**启发式**（条数 + 末条身份 + 末条修订号），不是内容哈希：
             *   「改中间某条且条数与末条都不变」它看不见。故它只用于**复用投影**，
             *   绝不用于任何「账没变所以结果不用重算」的断言 —— 未命中即重扫，代价回到修前。 */
            const _fp = ledgerFingerprint(rec.id, items);
            if (cache && cache.fp && cache.fp[rec.id] === _fp && Array.isArray(cache.rows[rec.id])) {
                for (const _r of cache.rows[rec.id]) rows.push(Object.assign({}, _r, { _score: null }));
                rec.kept = cache.rows[rec.id].length;
                rec.cacheHit = true;
                scanned += rec.kept;
                cacheHits += 1;
                ledgers[rec.id] = rec;
                continue;
            }
            cacheMisses += 1;
            let kept = items;
            if (items.length > cap) { kept = items.slice(-cap); rec.truncated = true; }
            rec.kept = kept.length;
            scanned += kept.length;
            const _rowStart = rows.length;   /* [v3.321.0 · M3-O6] 本账投影起点（供缓存写回切片） */
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
                    /* [v3.307.0 · M-O8 第二刀] 两列恒定键：`scope` 三态（工作台单一真源
                     *   产出，本面只搬运，不另解一份）+ `masked`（本行正文是否被遮蔽）。
                     *   非秘密账为 null / false —— 与工作台行键同规格。 */
                    scope: (p.scope === undefined || p.scope === null) ? null : text(p.scope, 20),
                    masked: (p.masked === true),
                    _score: null
                });
            }
            /* [v3.321.0 · M3-O6] 写回本账投影（存**副本**：本次查询仍会就地写 _score，
             *   把同一批对象交给缓存等于把本次的分数留给下次）。 */
            if (cache) {
                if (!cache.fp || typeof cache.fp !== 'object') cache.fp = {};
                if (!cache.rows || typeof cache.rows !== 'object') cache.rows = {};
                cache.version = PROJECTION_CACHE_VERSION;
                cache.fp[rec.id] = _fp;
                cache.rows[rec.id] = rows.slice(_rowStart).map((r) => Object.assign({}, r, { _score: null }));
            }
            ledgers[rec.id] = rec;
        }
        return {
            rows: rows, ledgers: ledgers, counts: counts, scanned: scanned, specs: specs,
            /* [v3.321.0 · M3-O6] 扫描面读数：跳过的账 + 缓存命中/未命中（都是可归因事实）。 */
            skippedLedgers: skippedLedgers,
            cache: {
                version: PROJECTION_CACHE_VERSION, enabled: !!cache, hits: cacheHits, misses: cacheMisses,
                state: !_pcRaw ? 'off' : (_pcStale ? 'stale' : 'on'),
                stale: _pcStale
            }
        };
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
    /**
     * [v3.321.0 · M3-O6] 组装（**唯一真源**）：`query` 与 `queryAsync` 都经这里出结果。
     *   为什么必须抽出来：协作式查询若自己再写一遍分页 / 覆盖度 / 空集归因，
     *   两条路径就会各自漂移 —— 让出的是**执行时机**，不是口径。
     *   任何「哪一态算空、翻过头怎么报」的判定只许有一份。
     *
     * @param {object} uni universeOf 的返回
     * @param {object} s 规范化条件
     * @param {object} n normalizeSpec 的返回（要它的 dropped）
     * @param {Array} hits 已比对命中的行
     * @param {object} unmatched 具名不匹配计数
     * @param {Array} unknownFloor 无楼层被排除的行（可归因）
     * @param {object} o opts
     * @param {object} [extra] { inverted, canceled, processedRows }
     */
    function assemble(uni, s, n, hits, unmatched, unknownFloor, o, extra) {
        const ex = extra || {};
        const inverted = ex.inverted === true;
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
        const scanned = uni.rows.length;
        const capUsed = Number.isFinite(Number(o.maxPerLedger)) && Number(o.maxPerLedger) > 0
            ? Math.floor(Number(o.maxPerLedger)) : MAX_SCAN_PER_LEDGER;
        const truncatedList = Object.keys(uni.ledgers).filter((k) => uni.ledgers[k].truncated === true);
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
                requestedLedgers: (Array.isArray(o.ledgers) ? o.ledgers.length : 0),
                /** 本面直读原账**全量**、不经过工作台的 200 条摘要 —— 显式声明，防读者以为同源。 */
                summaryBypassed: true,
                /** 直读封顶（真触到时该账 truncated=true，两个读数都在 coverage.ledgers 里）。 */
                scanCap: capUsed,
                truncated: truncatedList,
                /* [v3.321.0 · M3-O6] 被账条件排除、**本次根本没扫**的账。
                 *   与 truncated 是两件事：truncated 是「扫了但没扫完」，skipped 是「按条件就没扫」。 */
                skippedByLedgerFilter: uni.skippedLedgers || [],
                /* [v3.321.0 · M3-O6] 逐账投影缓存读数：hits>0 即「这次没重算那些账」。 */
                projectionCache: uni.cache || { version: PROJECTION_CACHE_VERSION, enabled: false, hits: 0, misses: 0, state: 'off', stale: false }
            },
            /* [v3.321.0 · M3-O6] 范围上限的**可继续入口**：触顶才给，没触顶为 null。
             *   不造一个恒在场的假入口 —— 「有入口」本身会被读成「上次没查完」。 */
            continueWith: truncatedList.length ? {
                ledgers: truncatedList,
                maxPerLedger: Math.min(1000000, capUsed * 2),
                note: '这些账触到本次扫描上限：把 opts.maxPerLedger 提到 maxPerLedger 后**重跑同一条件**即可继续'
                    + '（不自动放宽 —— 放宽会让「这次扫了多少」与「这本账有多少」同形）'
            } : null,
            state: inverted ? 'inverted-range' : (total > 0 ? 'ok' : 'empty'),
            /* [v3.321.0 · M3-O6] 取消读数：恒在场（false 也是读数）。 */
            canceled: ex.canceled === true,
            partial: ex.canceled === true
        };
        if (inverted) out.emptyReason = '区间起止反转（' + s.inverted.join(' / ') + '）：按空集处理，**不自动交换** —— 交换会查出另一个区间而不报错';
        if (!inverted && total === 0 && objCount(unmatched) === 0) {
            /* 一条都没进过比对 ⇒ 扫描面本身是空的：这不是「查不到」，是「没东西可查」。 */
            out.emptyReason = (uni.counts.absent > 0 && uni.counts.ok === 0)
                ? '扫描面为空：九账全部取不到（见 coverage.ledgers 的 reason）'
                : '扫描面为空（无账本登记 / 未给 ledgers）';
        }
        if (ex.canceled === true) {
            /* 取消**不是失败**，也不是「没有」：如实报「查到哪儿了」。
             *   把取消报成 empty 是「用『没有』冒充『没查完』」——本仓治理过多轮的形态。 */
            out.state = 'canceled';
            out.emptyReason = '查询被取消：以下读数是**已处理部分**，不是全量结论';
            out.processed = { rows: Number(ex.processedRows) || 0, totalRows: uni.rows.length };
        }
        return out;
    }
    /**
     * 结构化查询（**纯函数 + 只读**）。
     *
     * @param {object} host 宿主实例
     * @param {object} spec 查询条件（见 FILTERS）
     * @param {object} [opts] { ledgers:[登记表]（必给，来自工作台 LEDGERS）, apis:{id:api},
     *                          page?:number, pageSize?:number, sort?:string, dir?:'asc'|'desc',
     *                          maxPerLedger?:number, projectionCache?:object }
     * @returns {object} 恒定键面（取不到也全键在场，下游按键断言即可，不必猜）
     */
    function query(host, spec, opts) {
        const o = opts || {};
        const n = normalizeSpec(spec);
        const s = n.spec;
        const specs = Array.isArray(o.ledgers) ? o.ledgers : [];
        /* [v3.321.0 · M3-O6] ① 账条件非空 ⇒ **只扫这些账**（其余账如实记 skipped）；
         *   ② 宿主给的投影缓存随扫描面一起传下去（逐账指纹命中即复用投影）。 */
        const uni = universeOf(host, {
            ledgers: specs, apis: o.apis, maxPerLedger: o.maxPerLedger,
            onlyLedgers: (s.ledgers && s.ledgers.length ? s.ledgers : null),
            projectionCache: (o.projectionCache && typeof o.projectionCache === 'object') ? o.projectionCache : null
        });
        /* 区间反转 ⇒ 空集（并如实说出为什么），不静默交换。 */
        const inverted = s.inverted.length > 0;
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
        return assemble(uni, s, n, hits, unmatched, unknownFloor, o, { inverted: inverted });
    }

    /** 分页辅助：按条件直接取第 N 页（等价于 query 的 page 参数；单列便于宿主转发）。 */
    /* ── [v3.321.0 · M3-O6] 三件新增面：缓存指纹 / 轻索引 / 协作式查询 ── */
    /**
     * 账指纹：**「这本账变没变」的可比较读数**。
     *   为什么不是内容哈希：逐条哈希一本万条账的代价就是「每次全量物化」本身，
     *   等于把要省的那件事又做了一遍。这里用「条数 + 末条身份 + 末条修订号」三个读数。
     *   它是**启发式**、不是证明：追加 / 替换末条 / 末条改修订号都能被它看见，
     *   而「改中间某条、且条数与末条都不变」看不见。故它只用于**缓存复用**，
     *   绝不用于任何「账没变所以结果不用重算」的断言 —— 未命中即重扫，代价回到修前。
     */
    function ledgerFingerprint(id, items) {
        const list = Array.isArray(items) ? items : [];
        const n = list.length;
        if (!n) return text(id, 40) + ':0';
        const last = list[n - 1] || {};
        const key = text(last.id != null ? last.id : last.key, 60);
        const rev = (last.revision === null || last.revision === undefined) ? '' : text(last.revision, 20);
        return text(id, 40) + ':' + n + '|' + key + '|' + rev;
    }
    /**
     * 轻索引：把一批行按「账本 / 角色 / 来源 / 楼层」建下标表。
     *   为什么是索引而不是「换一条更快的筛选」：筛选判定（matchRow）是**唯一真源**，
     *   任何「另一条更快的判定路径」都是第二份口径，且两条迟早漂移。
     *   本函数只回答「哪些行**可能**命中」，真正的取舍仍由 matchRow 做 ——
     *   于是索引只能**缩小**候选，不能改变结论。
     *
     *   ⚠ 候选集是**上界**（含「字段在场」的行），不是等价集：漏索引的行**不代表不命中**
     *     —— `hasFloor:false` 这类条件恰恰要收**没有**该字段的行。
     *     故本函数只作诊断与上层导航用，**不进 matchRow 的判定路径**
     *     （那正是「更快但可能少查」的形态）。
     * @returns {object} { byLedger, byActor, bySource, byFloor, size, indexed }
     */
    function buildIndex(rows) {
        const list = Array.isArray(rows) ? rows : [];
        const idx = { byLedger: {}, byActor: {}, bySource: {}, byFloor: {}, size: list.length, indexed: 0 };
        const push = (m, k, i) => {
            const key = text(k, 40);
            if (!key) return;
            if (!m[key]) m[key] = [];
            m[key].push(i);
        };
        for (let i = 0; i < list.length; i++) {
            const r = list[i];
            if (!r || typeof r !== 'object') continue;
            idx.indexed += 1;
            push(idx.byLedger, r.ledger, i);
            push(idx.bySource, r.source, i);
            if (r.floor !== null && r.floor !== undefined) push(idx.byFloor, String(r.floor), i);
            for (const a of (Array.isArray(r.actors) ? r.actors : [])) {
                push(idx.byActor, String((a && a.name) || '').toLowerCase(), i);
            }
        }
        return idx;
    }
    /**
     * 协作式查询：把「逐行比对」切成片，片间让出事件循环并在片间检查取消。
     *   **口径与 query 完全同一份**（同一个 universeOf、同一个 matchRow、同一个 assemble）
     *   —— 本函数不重写任何判定，只重排执行时机。
     *
     * 【为什么必须有它】万条库上 `query` 是一次同步长任务：它占着主线程，
     *   浏览器既不能重绘也不能响应取消。让出粒度是**行数**（`shardRows`，默认 2000）：
     *   账内逐行比对保持同步批量推进，因为逐行 await 会让一次翻页产生上万次微任务，比阻塞更慢。
     *
     * 【让出点在哪（如实说，不夸大）】让出与取消检查发生在**逐行比对**阶段；
     *   `universeOf`（读账 + 投影）仍是一次同步调用 —— 投影代价与**账规模**成正比，
     *   比对代价与**行数**成正比，万条场景里瓶颈是行数那一段。
     *
     * 【取消的语义】取消**不是失败**，也不是「没有」：`state='canceled'`、
     *   `rows` 只含已处理部分、并如实报 `processed.{rows,totalRows}`。
     *   把取消报成 empty 是「用『没有』冒充『没查完』」。
     *
     * @param {object} o 与 query 同键，另加 { shardRows?, yieldTo?(), shouldCancel?() }
     * @returns {Promise<object>} 与 query 同形状（另带 canceled / partial / processed）
     */
    async function queryAsync(host, spec, opts) {
        const o = opts || {};
        const shard = Math.max(1, Math.floor(Number(o.shardRows) || QUERY_ASYNC_SHARD));
        const yieldTo = (typeof o.yieldTo === 'function') ? o.yieldTo
            : ((typeof setTimeout === 'function') ? (() => new Promise((res) => setTimeout(res, 0))) : null);
        const shouldCancel = (typeof o.shouldCancel === 'function') ? o.shouldCancel : null;
        const n = normalizeSpec(spec);
        const s = n.spec;
        const specs = Array.isArray(o.ledgers) ? o.ledgers : [];
        const uni = universeOf(host, {
            ledgers: specs, apis: o.apis, maxPerLedger: o.maxPerLedger,
            onlyLedgers: (s.ledgers && s.ledgers.length ? s.ledgers : null),
            projectionCache: (o.projectionCache && typeof o.projectionCache === 'object') ? o.projectionCache : null
        });
        const inverted = s.inverted.length > 0;
        const hits = [];
        const unmatched = {};
        const unknownFloor = [];
        let processed = 0;
        let canceled = false;
        if (!inverted) {
            for (const r of uni.rows) {
                const v = matchRow(r, s);
                if (v === 'hit') hits.push(r);
                else {
                    unmatched[v] = (unmatched[v] || 0) + 1;
                    if (v === 'floor-unknown') unknownFloor.push({ ref: r.ref, why: 'no-floor-on-any-time-field' });
                }
                processed += 1;
                if (processed % shard === 0) {
                    if (shouldCancel && shouldCancel() === true) { canceled = true; break; }
                    if (yieldTo) await yieldTo();
                }
            }
        }
        /* 收尾再查一次取消：正好跑完最后一片时也必须给出一致的结论，
         *   否则同一时刻调两次会得到不同读数（确定性是可机检事实）。 */
        if (!canceled && shouldCancel && shouldCancel() === true) canceled = true;
        return assemble(uni, s, n, hits, unmatched, unknownFloor, o,
            { inverted: inverted, canceled: canceled, processedRows: processed });
    }
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
            /* [v3.307.0 · M-O8 第二刀] 本文命中里**被遮蔽**的有几条、其中几条判不了。
             *   与工作台行同口径（同一批行、同一批读数），不另算一份。 */
            const rows = Array.isArray(res.rows) ? res.rows : [];
            let masked = 0, undecided = 0;
            for (const r of rows) {
                if (r && r.masked === true) { masked += 1; if (r.scope === 'unlisted') undecided += 1; }
            }
            if (masked) parts.push('正文遮蔽 ' + masked + ' 条' + (undecided ? '（其中 **判不了 ' + undecided + '**）' : ''));
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
        universeOf, matchRow, query, queryAsync, assemble, pageOf,
        ledgerFingerprint, buildIndex,
        PROJECTION_CACHE_VERSION, QUERY_ASYNC_SHARD,
        normalizeSaved, upsertSaved, removeSaved, replaySaved, line,
        /* [v3.321.0 · M3-X1] 带证据的自然语言问答（规划 + 合成；不造查询 API） */
        QA_VERSION, QA_INTENTS, QA_OPEN_STATES, planQuestion, composeAnswer, qaLine
    });
    root.LonShaEvidenceQuery = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
