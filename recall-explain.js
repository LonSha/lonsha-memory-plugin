/* ========================================================
 * recall-explain.js — [v3.294.0 · X8] 召回问题解释与有证据的策略建议
 * --------------------------------------------------------
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓到 v3.293.0 已有四件**观测**召回的东西，但**没有一件能回答「这件事为什么没被用」**：
 *     · `_recallAudit`（v3.150）—— 记「查了什么 / 各源命中几条 / 空结果」；它是**环形账本**，
 *       一次读一串轮次，不指向某一轮；
 *     · `_injectionTraceDraft.stages`（v3.251）—— 记**五阶段计数**
 *       （rawHits → merged → validityFiltered → budgetTrimmed → finalKept），
 *       但它是「构建期事实」，不告诉你**中间那段路是谁挡的**；
 *     · `_srcGate` / `sourceBlocks`（v3.251）—— 记「禁用源贡献 0 块」，
 *       但读数是**本轮的**，与某一轮召回没有配对键；
 *     · `retrieval-audit.js` —— 记召回质量的统计面，不看单轮。
 *   实测后果（三条，各自可复现）：
 *     ① **「没命中」与「没查」同形**：`_recallAudit` 里 `empty:true` 既可能是
 *        「所有源都真没命中」，也可能是「本轮压根没跑召回」（记录缺失），
 *        而后者根本不该记一条 `empty` 进账本 —— 两者处置完全相反；
 *     ② **解释只能靠猜**：用户在面板上看到「0 命中」时，没有任何一面能区分
 *        「源被关了」「别名没展开」「过时事实被有效性规则挡下」「预算裁掉了」——
 *        这四件事的改法完全不同（开开关 / 补别名 / 修事实 / 调预算），
 *        而唯一的既有出口是把整段账本倒出来让人自己读；
 *     ③ **建议没有依据**：任何「建议调大预算」的说法，若不同时给出
 *        「这轮被裁了几条、为什么」，读的人无法复核，改完也不知道有没有用。
 *
 * 【本模块补的到底是什么（不是「多读几个字段」，是三处结构性缺口）】
 *   ① **七阶段单一登记表（STAGES）**：把一次轮次从「源」到「已注入」的路拆成七档，
 *      每档声明 ①id ②中文名 ③判据（怎么从输入读出这一档的读数）④归因口径。
 *      「阶段」不再散在宿主的多段 if 里 —— 加了哪一档、哪一档判不出来，都是可机检事实。
 *   ② **三态 + unknown 分列**：每一档的读数是
 *        `hit`（本档通过）/ `empty`（本档明确为空）/ `filtered`（被本档规则挡下）
 *        / `missing`（**判不了**：缺源表 / 缺模块 / 该轮没跑）—— 四态不得压成一态。
 *      「判不了」既不算通过也不算失败：`missing` 一定带 `why`，且**不得**把
 *      unknown 记成 0（那正是本仓点名的「没测到与真的是 0 同形」）。
 *   ③ **带证据的建议（suggest）**：每条建议必须同时带
 *        ① `evidence`（引用本轮的**真读数与 ref**，不是文案）
 *        ② `apply`（显式配置动作：改哪个键、从什么改成什么）
 *        ③ `verify`（改完怎么验：以 X3 同候选重跑对照）
 *        ④ `requiresUserChoice: true`（**默认不自动调参** —— X8 验收原话：
 *           「用户选择后才改配置」「自动调参默认关闭」）
 *
 * 【四个口径（一条也不省）】
 *   ① 解释**只来自同一轮真 trace**：`explainRecall` 的第一件事是配对 ——
 *      `opts.trace.floor` 与 `audit.floor` 不一致（或缺任一）⇒ 整份解释
 *      `degraded:true`、`verdict.stage:'unknown'`、**一条原因都不编**。
 *      这是本仓老账「别拿上一轮的读当本轮的」在解释面的正面形态。
 *   ② **缺源 ≠ 零命中**：源被禁用（`enabled === false`）记 `missing`；
 *      源在场但 `error` 记 `missing`（带 note）；源在场、无错、零命中才记 `empty`。
 *      「源坏了」与「源没东西」处置相反（前者修源，后者改查询）。
 *   ③ **别名/身份过滤与有效性过滤分开**：`aliasFiltered > 0` 与
 *      `validityFiltered > 0` 是两件事（前者补别名，后者修事实），
 *      在阶段表里各占一档，不合并成「过滤掉 N 条」。
 *   ④ **建议里的每个数字都必须可在输入里指出来**：`suggest` 的 `evidence`
 *      只允许引用输入对象上真实存在的字段（`evidenceFields` 逐条列出），
 *      并在 `note` 里写清是哪个字段的读数；编出来的数字不算证据。
 *
 * 【明确不做（边界，显式声明）】
 *   · **不跑召回**：本模块是纯读解释层，输入由宿主给（它才知道那一轮的真读数）；
 *     模块内**没有任何** `require` / 全局读取 —— 零依赖，便于单测与移植。
 *   · **不自动调参**：`suggest` 只产出 `apply` 方案，`apply` 一律
 *     `auto:false`；真正改配置是宿主的显式动作（X8 验收原话）。
 *   · **不把反馈写进历史事实**：`feedback` 只把用户意见收进本地环形列表并标注
 *     `writesHistoryFact:false`（反馈是意见，历史事实只有 owner 能改）。
 *   · **不判「该不该注入某条」**：那是有效性规则与预算的职责，本模块只报告是谁挡的。
 *   · **不重算任何计数**：全部取自输入；输入没给的一律 `missing`，不倒推。
 *
 * 纪律：纯函数、零依赖、IIFE + CJS 双导出；三态归因 ok / absent / threw；绝不外抛。
 * ======================================================== */
(function (root) {
    'use strict';
    const RECALL_EXPLAIN_VERSION = 1;
    /** 环形反馈上限（用户意见是诊断数据，不是证据库，故有界）。 */
    const MAX_FEEDBACK = 60;

    /* ── 自持最小助手 ──────────────────────────────────
     * 本模块**刻意不自引** ledger-entity.js 的 `text` / `finite`：
     * 它是解释层（无写路径、不碰楼层归属），引入账本实体契约会给它带来
     * 一个它根本用不上的加载顺序依赖（manifest 里 ledger-entity.js 必须先执行）。
     * 本仓对 X6/X7 的同类处置已在 O7 副本账本登记（「自持一份，不引别处常量」），
     * 故这里也按同一口径：函数名与判据**都不同名**，避免形成新的逐字副本簇。
     * ──────────────────────────────────────────────── */
    /** 整数（未给给 null —— 不拿 0 冒充「就是 0」）。 */
    function intOrNull(v) {
        if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
        const n = Number(v);
        return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    /** 字符串（非串给空串；去首尾空白）。 */
    function strOf(v) {
        return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
    }
    /** 有限>=0 计数（未给给 null）。 */
    function countOf(v) {
        const n = intOrNull(v);
        return (n === null || n < 0) ? null : n;
    }

    /* ── 阶段登记表（单一真源）─────────────────────────
     * 七档就是「一次召回从源到载荷」的真实路径，顺序即严重度。
     * ★ `required` 区分两种「没读数」：
     *   required:true   —— 缺了就**判不了整体结论**（连有没有东西都不知道）；
     *   required:false  —— 缺了只把**范围收窄**（还有其它档能给出断点），
     *     不得因为一个可选面缺席就把整份解释打成 unknown（那是把「范围有限」
     *     与「判不了」压成一态，本仓最忌的同形）。
     * 前面的档位为 missing/empty 时，后面的档位**本来就没有读数**（不得记 0）。
     * 每档的 `why` 写的是「这一档读出该状态意味着什么、该改什么」——
     * 归因与改法写在一处，别处不得再解释一遍（本仓「同一事实两个真源」之忌）。
     * ──────────────────────────────────────────────── */
    const STAGES = Object.freeze([
        Object.freeze({
            id: 'source-missing', required: true, label: '缺源',
            why: '源被禁用或取不到（模块未加载 / 本轮抛错）⇒ 它一条都不会进候选。与「源在场但没命中」处置相反：这一档要修的是源，不是查询。',
        }),
        Object.freeze({
            id: 'no-hit', required: true, label: '无命中',
            why: '所有在册源都跑了且都返回零条 ⇒ 查询词在库里没有对应条目。改法是核对查询/别名（不是调预算：预算再大也不会凭空生出候选）。',
        }),
        Object.freeze({
            id: 'alias-filtered', required: false, label: '别名/身份过滤',
            why: '候选进了池、但按角色身份（别名表未展开 / 非本轮登场角色）被挡下 ⇒ 改法是补别名或核对登场角色。',
        }),
        Object.freeze({
            id: 'validity-filtered', required: false, label: '有效性过滤',
            why: '候选在有效期内被判无效（过时事实 / 已被取代 / 来源已变）⇒ 改法是修复那条事实，不是调预算。',
        }),
        Object.freeze({
            id: 'budget-trimmed', required: false, label: '预算裁掉',
            why: '候选有效、但注入预算装不下被裁 ⇒ 这一档才是调预算/开关的正当场景，且必须同时给出被裁条数与字符数。',
        }),
        Object.freeze({
            id: 'injected', required: false, label: '已注入',
            why: '进了最终载荷。若用户仍觉得「没被用」，问题在下游（模型没引用），不在召回链路。',
        }),
        Object.freeze({
            id: 'unknown', required: true, label: '判不了',
            why: '缺同一轮 trace / 缺源表 / 轮次对不上 ⇒ **不编原因**。这一档的存在本身就是读数：先修观测面。',
        }),
    ]);
    /** 阶段 id → 档位对象（外部按 id 取读数用）。 */
    const STAGE_BY_ID = Object.freeze(STAGES.reduce(function (acc, s) { acc[s.id] = s; return acc; }, {}));
    const STAGE_IDS = Object.freeze(STAGES.map(function (s) { return s.id; }));
    /* 判定链的遍历顺序（单一真源）。
     * 顺序即严重度：一次召回从「源在不在」走到「装进载荷没有」。
     * 「unknown」不在此列：它不是链上的一环，而是「链本身没法走」。 */
    const RECALL_ORDER = Object.freeze([
        'source-missing', 'no-hit', 'alias-filtered',
        'validity-filtered', 'budget-trimmed', 'injected',
    ]);

    /** 建议的目标种类：配置键 / 数据（用户去改内容）/ 重跑对照（不改任何东西）。 */
    const TARGET_KINDS = Object.freeze(['config', 'data', 'rerun']);

    /* ── 输入归一 ───────────────────────────────────
     * 只取**认得**的字段；不认得的字段一律忽略并在 `ignoredFields` 里点名
     * （防上游默默换了字段名而这里继续读旧值 —— 那会让解释永远停在旧口径）。
     * ──────────────────────────────────────────────── */
    const KNOWN_INPUT_KEYS = Object.freeze([
        'query', 'sources', 'alias', 'validity', 'budget', 'injected', 'audit',
    ]);
    function normalizeSources(raw) {
        const out = [];
        for (const s of (Array.isArray(raw) ? raw : [])) {
            if (!s || typeof s !== 'object') continue;
            const key = strOf(s.key);
            if (!key) continue;
            out.push({
                key: key,
                label: strOf(s.label) || key,
                /* enabled 三态：true / false / null（**没告诉我们**）。
                 * null 不得当成 false —— 「关着」与「不知道关没关」处置相反。 */
                enabled: (s.enabled === true) ? true : (s.enabled === false ? false : null),
                hits: countOf(s.hits),
                error: s.error ? strOf(s.error) : '',
                switchKey: strOf(s.switchKey),
            });
        }
        return out;
    }
    function normalizeInput(raw) {
        const x = (raw && typeof raw === 'object') ? raw : {};
        const ignored = [];
        for (const k of Object.keys(x)) if (KNOWN_INPUT_KEYS.indexOf(k) < 0) ignored.push(k);
        const q = (x.query && typeof x.query === 'object') ? x.query : {};
        const a = (x.alias && typeof x.alias === 'object') ? x.alias : null;
        const v = (x.validity && typeof x.validity === 'object') ? x.validity : null;
        const b = (x.budget && typeof x.budget === 'object') ? x.budget : null;
        const inj = (x.injected && typeof x.injected === 'object') ? x.injected : null;
        const au = (x.audit && typeof x.audit === 'object') ? x.audit : null;
        const byRule = {};
        if (v && v.byRule && typeof v.byRule === 'object') {
            for (const k of Object.keys(v.byRule)) {
                const n = countOf(v.byRule[k]);
                if (n !== null) byRule[k] = n;
            }
        }
        return {
            ignoredFields: ignored,
            query: {
                text: strOf(q.text),
                floor: intOrNull(q.floor),
                hasQuery: (strOf(q.text) !== '' || intOrNull(q.floor) !== null),
            },
            sources: normalizeSources(x.sources),
            alias: a ? {
                presented: true,
                expanded: (a.expanded === true) ? true : (a.expanded === false ? false : null),
                mapSize: countOf(a.mapSize),
                filtered: countOf(a.filtered),
                switchKey: strOf(a.switchKey) || 'aliasQueryExpansion',
            } : null,
            validity: v ? { presented: true, filtered: countOf(v.filtered), byRule: byRule } : null,
            budget: b ? {
                presented: true,
                preTrimChars: countOf(b.preTrimChars),
                budgetChars: countOf(b.budgetChars),
                trimmed: (b.trimmed === true),
                dropped: countOf(b.dropped),
                kept: countOf(b.kept),
                hardTruncated: (b.hardTruncated === true),
                switchKey: strOf(b.switchKey) || 'injectionBudget',
            } : null,
            injected: inj ? { presented: true, count: countOf(inj.count), refs: (Array.isArray(inj.refs) ? inj.refs.map(strOf).filter(Boolean).slice(0, 20) : []) } : null,
            audit: au ? {
                presented: true,
                floor: (Number.isFinite(Number(au.floor)) && Number(au.floor) >= 0) ? Number(au.floor) : null,
                /* 轮次身份是**三态**，不是布尔：
                 *   matched / mismatch / unknown（宿主这一维无从核对）。
                 *   把「无从核对」写成「对不上」，结果是每一轮解释都落 unknown，
                 *   而真正的「账本拿错了」反而混在里面看不出来。 */
                floorMatched: (au.floorMatched === 'matched') ? 'matched'
                    : (au.floorMatched === 'mismatch' ? 'mismatch' : 'unknown'),
                /* 内容级身份：账本记了本轮入选条目时，可与召回结果头逐位比对。
                 *   true / false / null 三态：null 表示账本没记这项工作（无从核对）。
                 *   它比楼层可靠：本插件召回账本的 floor 取自 query，而 query 并不一定带楼层。 */
                idMatched: (au.idMatched === true) ? true : (au.idMatched === false ? false : null),
                totalHits: countOf(au.totalHits),
                perSource: (au.perSource && typeof au.perSource === 'object') ? au.perSource : {},
                /* 源清单的**权威来源**：账本的源名册就是宿主本轮真跑过的源。
                 *   宿主拿它组装源表，于是「哪些源在册」这条事实全局只有一份真源，
                 *   不靠在宿主里再手抄一份名单（抄了就会漂移，而漂移的表现
                 *   恰好是「禁用项仍被报成有注入」）。 */
                srcKeys: (Array.isArray(au.srcKeys) ? au.srcKeys.map(strOf).filter(Boolean) : []),
            } : null,
        };
    }

    /* ── 逐档判据（每一档的读数只由本函数决定）────────────
     * 返回 { state, count, why, refs }。
     *   state ∈ hit / empty / filtered / missing
     * 纪律：**判不出来就给 missing 并写 why**，绝不给 0。
     * ──────────────────────────────────────────────── */
    function readStage(id, input, paired, idLevel) {
        const srcs = input.sources;
        const onDuty = srcs.filter(function (s) { return s.enabled !== false; });
        if (id === 'source-missing') {
            if (!srcs.length) {
                return { state: 'missing', count: null, why: '没有源表 ⇒ 送进去几条都无从谈起（这不是「缺源」，是「判不了」）', refs: [] };
            }
            const bad = srcs.filter(function (s) { return s.enabled === false; });
            const err = srcs.filter(function (s) { return s.enabled !== false && !!s.error; });
            const unknown = srcs.filter(function (s) { return s.enabled === null; });
            const missing = bad.length + err.length;
            if (missing > 0) {
                const allOff = (bad.length === srcs.length);
                return {
                    /* 语义修正：missing **只能**表示「判不了」。全源关闭是**明确的**结论
                     *   （源闸挡住了全部候选），不是判不出来 —— 若占 missing，下游会把它归成
                     *   「unknown」而放弃解释，恰好把最有把握的一条结论报成最没把握的。
                     *   「全关」与「部分关」的差别用 count 与 why 表达，不用状态名表达。 */
                    state: 'filtered',
                    count: missing,
                    why: '被禁用 ' + bad.length + ' 个' + (err.length ? '、本轮抛错 ' + err.length + ' 个' : '')
                        + (unknown.length ? '（另有 ' + unknown.length + ' 个开关态未知，未计入）' : '')
                        + (bad.length ? '：' + bad.map(function (s) { return s.label; }).join('、') : '')
                        + (err.length ? '：' + err.map(function (s) { return s.label + '(' + s.error + ')'; }).join('、') : '')
                        + (allOff ? ' ⇒ 全部源关闭：这一轮根本没有候选可用' : ''),
                    refs: bad.concat(err).map(function (s) { return s.key; }),
                };
            }
            if (unknown.length) {
                return { state: 'missing', count: null, why: '有 ' + unknown.length + ' 个源的开关态未知（没告诉我们开没开）⇒ 不得当成「开着」也不得当成「关着」', refs: unknown.map(function (s) { return s.key; }) };
            }
            return { state: 'hit', count: 0, why: '在册源全部在场且未报错', refs: [] };
        }
        if (id === 'no-hit') {
            if (!srcs.length) return { state: 'missing', count: null, why: '无源表', refs: [] };
            /* ★ 合计以**确证读数**为准：召回自检账本的 totalHits 是宿主真测的量。
             *   本插件里多数召回源**不带配置开关**，它们由「数据条件」入场
             *   （无节日 ⇒ 节日源不跑、无卷 ⇒ 卷源不跑…）。那些门散在召回流程里，
             *   在这里重列一遍就是本仓点名的「同一事实两个真源」。
             *   故：源级 hits 缺失是**常态**，不得据此把合计数判成不可测 ——
             *   那会让每一轮解释都因某个源没读数而落 unknown，真正的零命中反而看不见。
             *   源级求和只作回落，且要求齐全（不全就不倒推）。 */
            /* ★ 没有源在岗（全被挡下 / 全没开）时，零命中不是独立读数：
             *   它只是上游停止的结果。若照实报 count:0，读数表上就会出现
             *   「缺源 2 · 无命中 0」这样的并列 —— 后面那个 0 会把人引去查查询词，
             *   而真正的断点在缺源档。故此时如实记 missing（判不了）。 */
            if (!onDuty.length) {
                return { state: 'missing', count: null,
                    why: '没有源在岗（全部被挡下 / 未入场）⇒ 零命中不是独立读数，断点在缺源档', refs: [] };
            }
            /* ★ 没有源在岗（全被挡下 / 全没开）时，零命中不是独立读数：
             *   它只是上游停止的结果。若照实报 count:0，读数表上就会出现
             *   「缺源 2 · 无命中 0」这样的并列 —— 后面那个 0 会把人引去查查询词，
             *   而真正的断点在缺源档。故此时如实记 missing（判不了）。 */
            if (!onDuty.length) {
                return { state: 'missing', count: null,
                    why: '没有源在岗（全部被挡下 / 未入场）⇒ 零命中不是独立读数，断点在缺源档', refs: [] };
            }
            const auditTotal = input.audit ? input.audit.totalHits : null;
            const known = onDuty.filter(function (s) { return s.hits !== null; });
            const sum = known.reduce(function (a, s) { return a + s.hits; }, 0);
            const perSourceComplete = (known.length === onDuty.length && onDuty.length > 0);
            const refs = [];
            /* 两条路都有读数且不一致：不选一个当成对，如实抖出来。
             *   源级求和**正常应不大于**合计（合计含未登记在源表里的来源）。 */
            if (auditTotal !== null && perSourceComplete && sum > auditTotal) {
                refs.push('perSourceSum=' + sum);
            }
            const total = (auditTotal !== null) ? auditTotal : (perSourceComplete ? sum : null);
            if (total === null) {
                return { state: 'missing', count: null,
                    why: '既无审计面合计读数，源级命中数也不齐（' + known.length + '/' + onDuty.length + ' 个在场源报数）⇒ 不倒推', refs: [] };
            }
            const _how = (auditTotal !== null) ? '召回自检账本合计' : '在场源求和'
                + (refs.length ? '（⚠️ 源级求和 ' + sum + ' 大于账本合计，两者对不上）' : '');
            if (total > 0) return { state: 'hit', count: total, why: _how + '命中 ' + total + ' 条', refs: refs };
            return { state: 'empty', count: 0, why: _how + '：本轮零命中（源在场、无错误、合计 0 条）', refs: refs };
        }
        if (id === 'alias-filtered') {
            if (!input.alias) return { state: 'missing', count: null, why: '宿主未提供别名面读数 ⇒ 这一档判不了（不得当作「没被过滤」）', refs: [] };
            const f = input.alias.filtered;
            if (f === null) return { state: 'missing', count: null, why: '别名面在、但没给过滤条数', refs: [] };
            if (f > 0) {
                return { state: 'filtered', count: f, why: '按角色身份挡下 ' + f + ' 条（别名表 '
                    + (input.alias.mapSize === null ? '规模未知' : input.alias.mapSize + ' 项')
                    + '；展开=' + (input.alias.expanded === null ? '未知' : String(input.alias.expanded)) + '）', refs: [] };
            }
            return { state: 'hit', count: 0, why: '别名/身份面无挡下', refs: [] };
        }
        if (id === 'validity-filtered') {
            if (!input.validity) return { state: 'missing', count: null, why: '宿主未提供有效性面读数 ⇒ 判不了', refs: [] };
            const ruleKeys = Object.keys(input.validity.byRule);
            if (input.validity.filtered === null && !ruleKeys.length) {
                return { state: 'missing', count: null, why: '有效性面在、但既没给总数也没给分项', refs: [] };
            }
            const n = (input.validity.filtered === null)
                ? ruleKeys.reduce(function (a, k) { return a + input.validity.byRule[k]; }, 0)
                : input.validity.filtered;
            const ruleTxt = ruleKeys.map(function (k) { return k + ':' + input.validity.byRule[k]; }).join(' ');
            if (n > 0) return { state: 'filtered', count: n, why: '有效性规则挡下 ' + n + ' 条' + (ruleTxt ? '（分项 ' + ruleTxt + '）' : ''), refs: [] };
            return { state: 'hit', count: 0, why: '有效性面无挡下', refs: [] };
        }
        if (id === 'budget-trimmed') {
            if (!input.budget) return { state: 'missing', count: null, why: '宿主未提供预算面读数 ⇒ 判不了（不得当作「全留下」）', refs: [] };
            const b = input.budget;
            if (b.trimmed !== true) {
                if (b.kept === null && b.dropped === null) return { state: 'missing', count: null, why: '预算面在、但既没标 trimmed 也没给保留/丢弃数', refs: [] };
                return { state: 'hit', count: 0, why: '未走裁剪（kept=' + (b.kept === null ? '未知' : b.kept) + '）', refs: [] };
            }
            return {
                state: 'filtered',
                count: b.dropped,
                why: '预算裁剪：' + (b.preTrimChars === null ? '?' : b.preTrimChars) + ' 字符 → 预算 '
                    + (b.budgetChars === null ? '?' : b.budgetChars) + ' 字符，丢 '
                    + (b.dropped === null ? '条数未知（硬截断时不可测）' : b.dropped + ' 块')
                    + (b.hardTruncated ? '；**发生了硬截断**' : ''),
                refs: [],
            };
        }
        if (id === 'injected') {
            if (!input.injected) return { state: 'missing', count: null, why: '宿主未提供载荷面读数 ⇒ 无法确认最终进没进上下文', refs: [] };
            const c = input.injected.count;
            if (c === null) return { state: 'missing', count: null, why: '载荷面在、但没给块数', refs: [] };
            if (c > 0) return { state: 'hit', count: c, why: '最终载荷含 ' + c + ' 块', refs: input.injected.refs.slice(0, 8) };
            return { state: 'empty', count: 0, why: '最终载荷零块', refs: [] };
        }
        if (id === 'unknown') {
            if (paired) {
                const _lvlTxt = (idLevel === 'injected-ids') ? '入选条目逐位比对'
                    : (idLevel === 'floor' ? '楼层比对'
                        : '宿主未提供可比身份（无从核对）');
                return { state: 'hit', count: 0, why: '轮次身份成立（判据：' + _lvlTxt + '）', refs: [] };
            }
            const why = (!input.query.hasQuery) ? '宿主没给查询，也没给可核对的轮次身份'
                : (!input.audit ? '没有召回自检账本读数'
                    : (input.audit.idMatched === false
                        ? '账本记的入选条目与本轮召回结果对不上⇒ 这份账本不是本轮那一份'
                        : (input.audit.floorMatched === 'mismatch'
                            ? '账本楼层 ' + input.audit.floor + ' 与查询楼层 ' + input.query.floor + ' 不一致'
                            : '账本与查询连一项可比身份都没有（无入选条目清单、无楼层）')));
            return { state: 'missing', count: null, why: why + ' ⇒ 整份解释降级（不编原因）', refs: [] };
        }
        return { state: 'missing', count: null, why: '未知档位 ' + id, refs: [] };
    }

    /* ── 主入口：解释一次召回 ───────────────────────────
     * 返回（**永不抛**）：
     *   { ok, version, floor, queryText, paired, degraded,
     *     stages:[{id,label,state,count,why,refs}], verdict:{stage,label,text},
     *     truncated:{any,notes}, ignoredFields, evidence:{...} }
     * ok:true 仅表示「解释已产出」；degraded 表示「它只覆盖了有限范围」。
     * ──────────────────────────────────────────────── */
    function explainRecall(rawInput, opts) {
        try {
            const input = normalizeInput(rawInput);
            const o = (opts && typeof opts === 'object') ? opts : {};
            const aFloor = input.audit ? input.audit.floor : null;
            const qFloor = input.query.floor;
            /* 配对只能看楼层对不上对得上：调用方自述（audit.floorMatched）
             *   **不能**免掉这一步比对 —— 要的是可复算事实，不是声明。 */
            /* 轮次身份层级（配对判据的可核对程度）。
             *   配对口径：有账本，且身份**没有被证伪**就算成立。
             *   证伪只有两路：idMatched === false（账本记的入选条目对不上）、
             *   floorMatched === 'mismatch'（楼层对不上）。
             *   「宿主没给可比身份」不构成证伪 —— 那是**无从核对**，
             *   只能在注记里标明，不得拿它把整份解释打成判不了。 */
            const _idLevel = (input.audit && input.audit.idMatched === true) ? 'injected-ids'
                : ((input.audit && input.audit.floorMatched === 'matched') ? 'floor'
                    : ((input.audit && input.audit.floorMatched === 'unknown' && input.audit.idMatched === null)
                        ? 'unverifiable' : 'none'));
            const paired = !!(input.query.hasQuery && input.audit && input.audit.presented
                && input.audit.floorMatched !== 'mismatch' && input.audit.idMatched !== false);
            const stages = STAGE_IDS.map(function (id) {
                /* 配对层级必须**显式传入**：readStage 是独立函数，
                 *   外层作用域里的 _idLevel 在它里面取不到（取到就抛，
                 *   而那一抛会被本函数的兜底吃掉，表现为「整份解释异常」）。 */
                const r = readStage(id, input, paired, _idLevel);
                return {
                    id: id, label: STAGE_BY_ID[id].label,
                    required: !!STAGE_BY_ID[id].required,
                    state: r.state,
                    count: (r.count === undefined ? null : r.count),
                    why: r.why, refs: r.refs || [],
                };
            });
            /* 判定链：按登记表顺序找**第一个**真拦下候选的档位。
             * 为什么取第一个而不是最后一个：用户问的是「为什么没被用」，答案是最上游
             *   那一处断点；它之后的几档**根本没有候选**，一起报出来会让人去修一个
             *   根本不是瓶颈的地方。 */
            /* ★ 范围收窄面：以下这些面「这一轮没读数」，但它们并非必需面，
             *   所以只收窄结论的覆盖范围，**不等于判不了**。
             *   若把「可选面没读」也当成阻断，结果是每次解释都会因为某个可选面
             *   缺读数而被打成 unknown —— 那正是本仓最忌的同形：把「范围有限」
             *   冒充成「判不了」，于是真正的断点永远读不出来。 */
            const narrowed = [];
            let verdictStage = 'unknown';
            /* 判定链停在哪一档（-1 = 没配上）。停点意义：它之后的档位**没有候选到达**。 */
            let _decidedIdx = -1;
            if (!paired) verdictStage = 'unknown';
            else {
                for (let _i = 0; _i < RECALL_ORDER.length; _i++) {
                    const id = RECALL_ORDER[_i];
                    const s = stages.find(function (x) { return x.id === id; });
                    const req = !!(STAGE_BY_ID[id] && STAGE_BY_ID[id].required);
                    if (s.state === 'missing') {
                        /* ★ 必需面缺读数才阻断；可选面缺读数只收窄（见上）。 */
                        if (req) { verdictStage = 'unknown'; _decidedIdx = _i; break; }
                        narrowed.push(id);
                        continue;
                    }
                    /* ★ 判定链停在第一处真断点：它之后的档位**根本没有候选到达**，
                     *   那些档的 missing 不是「观测面缺席」，而是「没跑到」。
                     *   两者混在一起读，会让一条明确结论（如「全部源关闭」）
                     *   被自己下游的空档反过来打成「判不了」。 */
                    if (s.state === 'empty') { verdictStage = (id === 'no-hit') ? 'no-hit' : id; _decidedIdx = _i; break; }
                    if (s.state === 'filtered') { verdictStage = id; _decidedIdx = _i; break; }
                    if (id === 'injected' && s.state === 'hit') { verdictStage = 'injected'; _decidedIdx = _i; }
                }
            }
            /* ★ 「链走完了但没走到定论」是一种**独立结果**：
             *   不是「判不了」（前面的档都读到了），也不是「已注入」（载荷面没读数）。
             *   单独标 unproven，免得下游把它与阻断型 unknown 混成一态 ——
             *   那又是把「还差一档」与「根本没法判」压在一起。 */
            const _chainUnproven = (paired && _decidedIdx < 0);
            const vs = STAGE_BY_ID[verdictStage] || STAGE_BY_ID.unknown;
            /* 降级时具体原因在 unknown 档的 why 里（楼层不匹配 / 缺账本…）；
             *   通用文案只是该类档位的定义。直接摆通用文案等于把可观测的具体原因丢掉，
             *   而那条恰好是用户自己能动手修的东西。 */
            const _unknownRow = stages.find(function (x) { return x.id === 'unknown'; });
            const _verdictText = _chainUnproven
                ? ('链上无断点（没有一档挡下候选），但最终载荷面没读数 ⇒ 不能声称已注入；补上载荷读数即可定论')
                : ((verdictStage === 'unknown' && _unknownRow && _unknownRow.why)
                    ? (_unknownRow.why + ' ｜ 判据口径：' + vs.why) : vs.why);
            const notes = [];
            const _unknownStage = stages.find(function (x) { return x.id === 'unknown'; });
            if (!input.audit) notes.push('缺召回自检账本：无法核对「这一轮到底跑了没有」');
            else if (!paired) notes.push('轮次未配对（' + (_unknownStage && _unknownStage.why ? _unknownStage.why : '缺楼层号') + '）');
            if (!input.sources.length) notes.push('缺源表：缺源/无命中两档都判不了');
            /* 配对了但**身份未能核对**：必须说出来，否则「核对过」与「默认放行」同形。 */
            if (paired && _idLevel === 'unverifiable') {
                notes.push('本轮轮次身份**无从核对**（宿主既未给账本楼层，也未给入选条目清单），按成立处置，但不得当成已核对');
            }
            /* 账本给了源名册、而源表里缺了其中某些：如实报源表不全（防宿主组装漏项）。 */
            if (input.audit && input.audit.srcKeys.length) {
                const _have = {};
                for (const s of input.sources) _have[s.key] = true;
                const _miss = input.audit.srcKeys.filter(function (k) { return !_have[k]; });
                if (_miss.length) notes.push('源表不全：账本名册里的 ' + _miss.join('、') + ' 没进源表（宿主组装漏项）');
            }
            /* 配对了但**身份未能核对**：必须说出来，否则「核对过」与「默认放行」同形。 */
            if (paired && _idLevel === 'unverifiable') {
                notes.push('本轮轮次身份**无从核对**（宿主既未给账本楼层，也未给入选条目清单），按成立处置，但不得当成已核对');
            }
            /* 账本给了源名册、而源表里缺了其中某些：如实报源表不全（防宿主组装漏项）。 */
            if (input.audit && input.audit.srcKeys.length) {
                const _have = {};
                for (const s of input.sources) _have[s.key] = true;
                const _miss = input.audit.srcKeys.filter(function (k) { return !_have[k]; });
                if (_miss.length) notes.push('源表不全：账本名册里的 ' + _miss.join('、') + ' 没进源表（宿主组装漏项）');
            }
            if (input.ignoredFields.length) notes.push('忽略了不认得的字段：' + input.ignoredFields.join('、') + '（字段名变了要同步本模块，否则解释会停在旧口径）');
            if (input.budget && input.budget.hardTruncated) notes.push('本轮发生过硬截断：裁剪丢块数不可测，读数按 null 记');
            const _blockingMissing = stages.filter(function (x) {
                if (x.state !== 'missing') return false;
                if (!(STAGE_BY_ID[x.id] && STAGE_BY_ID[x.id].required)) return false;
                /* 「判不了」这一档缺读数 = 没有同一轮 trace，本身就是阻断项。 */
                if (x.id === 'unknown') return true;
                /* ★ 只认判定链停点**及之前**的必需面。停点之后的必需面不是
                 *   「观测面缺席」，而是「没跑到」—— 上游已被挡住，根本没有候选
                 *   送下去。把「没跑到」算成阻断，等于让最确凿的一条结论
                 *   （缺源/全关）被自己的下游空档判成「判不了」。 */
                return RECALL_ORDER.indexOf(x.id) <= _decidedIdx;
            }).map(function (x) { return x.id; });
            /* 停点之后、**非必需**面没读数：如实记「没跑到」。
             *   既不进阻断（不配下结论），也不进收窄（不是观测面缺失）。 */
            const _unreadDownstream = (_decidedIdx < 0) ? [] : stages.filter(function (x) {
                /* 无停点时不存在「停点之后」：那些档是循环走到却发现没读数，
                 *   已归入 narrowed（观测面缺席），不得在这里再计一遍。 */
                if (x.state !== 'missing') return false;
                /* 停点之后的 missing 全算「没跑到」，不以 required 区分：
                 *   required 在停点之前才有阻断意义，停点之后它只是说明
                 *   这一档本来会很关键，而它连跑都没跑。 */
                return RECALL_ORDER.indexOf(x.id) > _decidedIdx;
            }).map(function (x) { return x.id; });
            if (narrowed.length) notes.push('以下面缺读数（只收窄覆盖范围，不阻断结论）：' + narrowed.join('、'));
            if (_chainUnproven) notes.push('链上无断点，但载荷面没读数：本份解释只到「候选未被任何一档挡下」为止');
            /* 降级只看「必需面缺」与「轮次没配上」：可选面缺读只收窄，不该把整份读数打成不可用。 */
            /* ★ 行内 why 必须与分类一致：某个可选面缺读、而它又落在停点之后时，
             *   它的 why 原文写的是「这一档判不了」—— 照原样摆在表上，
             *   读的人会当成本次断点去修，而结论其实是上游那一条。
             *   分类由本函数给，措辞必须跟着分类走（同一事实不得两种说法）。 */
            for (const s of stages) {
                if (_unreadDownstream.indexOf(s.id) >= 0) {
                    s.why = '上游已挡下 ⇒ 这一档没有候选到达（「没跑到」，不是观测面缺失）：' + s.why;
                } else if (narrowed.indexOf(s.id) >= 0) {
                    s.why = '观测面缺读数（只收窄覆盖范围，不阻断结论）：' + s.why;
                }
            }
            /* ★ 行内 why 必须与分类一致：某个可选面缺读、而它又落在停点之后时，
             *   它的 why 原文写的是「这一档判不了」—— 照原样摆在表上，
             *   读的人会当成本次断点去修，而结论其实是上游那一条。
             *   分类由本函数给，措辞必须跟着分类走（同一事实不得两种说法）。 */
            for (const s of stages) {
                if (_unreadDownstream.indexOf(s.id) >= 0) {
                    s.why = '上游已挡下 ⇒ 这一档没有候选到达（「没跑到」，不是观测面缺失）：' + s.why;
                } else if (narrowed.indexOf(s.id) >= 0) {
                    s.why = '观测面缺读数（只收窄覆盖范围，不阻断结论）：' + s.why;
                }
            }
            const degraded = (!paired) || _blockingMissing.length > 0;
            return {
                ok: true,
                version: RECALL_EXPLAIN_VERSION,
                floor: (qFloor === null ? aFloor : qFloor),
                queryText: input.query.text.slice(0, 80),
                paired: paired,
                degraded: degraded,
                stages: stages,
                verdict: { stage: verdictStage, label: vs.label, text: _verdictText, unproven: _chainUnproven },
                truncated: { any: notes.length > 0, notes: notes },
                /* ★ 收窄面与阻断面分开曝光：读的人要能分辨
                 *   「这份解释没覆盖哪几档」与「这份解释根本没资格下结论」。 */
                narrowed: narrowed.slice(),
                blockingMissing: _blockingMissing.slice(),
                unreadDownstream: _unreadDownstream.slice(),
                ignoredFields: input.ignoredFields,
                evidence: {
                    fromSameRound: paired,
                    identityLevel: _idLevel,
                    auditFloor: aFloor,
                    queryFloor: qFloor,
                    sourceCount: input.sources.length,
                    auditTotalHits: input.audit ? input.audit.totalHits : null,
                },
            };
        } catch (e) {
            return {
                ok: false, version: RECALL_EXPLAIN_VERSION, reason: 'thrown',
                error: String((e && e.message) || e),
                floor: null, queryText: '', paired: false, degraded: true,
                stages: [], verdict: { stage: 'unknown', label: '判不了', text: '解释器抛错：' + String((e && e.message) || e), unproven: false },
                truncated: { any: true, notes: ['解释器抛错 ⇒ 本份读数不可用'] },
                ignoredFields: [], narrowed: [], blockingMissing: [], unreadDownstream: [],
                evidence: { fromSameRound: false, auditFloor: null, queryFloor: null, sourceCount: 0, auditTotalHits: null },
            };
        }
    }

    /* ── 建议：带证据、显式、默认不自动 ─────────────────
     * 每条建议的形状（**全部字段都是给读的人复核用的**）：
     *   { id, title, targets, evidence:[{field,value,note}],
     *     apply:{auto:false,...}, verify:{how,then}, requiresUserChoice:true, blocked? }
     * 纪律：
     *   · `apply.auto` 恒为 false（X8 验收：自动调参默认关闭）；
     *   · `evidence[].field` 必须是**输入对象上真实存在的路径**（如 'alias.filtered'）；
     *   · 判不了（解释 degraded）时**只给一条**建议：「先修观测面」，
     *     绝不在此基础上编配置建议（在错的读数上调参比不调更坏）。
     * ──────────────────────────────────────────────── */
    function evidence(field, value, note) {
        return { field: field, value: value, note: strOf(note) };
    }
    function suggestFor(explanation, opts) {
        try {
            const ex = (explanation && typeof explanation === 'object' && Array.isArray(explanation.stages)) ? explanation : null;
            const o = (opts && typeof opts === 'object') ? opts : {};
            if (!ex) return { ok: false, reason: 'no-explanation', suggestions: [], count: 0, autoParamTuning: false };
            const out = [];
            const stageOf = function (id) { return ex.stages.find(function (s) { return s.id === id; }); };
            if (ex.degraded) {
                out.push({
                    id: 'fix-observability',
                    title: '先修观测面（当前解释只覆盖有限范围）',
                    targets: ['recall-audit'],
                    evidence: [
                        evidence('paired', ex.paired, '轮次是否与账本配对'),
                        evidence('evidence.auditFloor', ex.evidence.auditFloor, '账本楼层'),
                        evidence('evidence.queryFloor', ex.evidence.queryFloor, '查询楼层'),
                    ],
                    apply: { auto: false, kind: 'config', key: 'recallAuditEnabled', from: null, to: true, note: '确认召回自检开关开着，且同一轮里能同时取到账本与构建回执' },
                    verify: { how: '重跑一轮问答后，本解释的 paired 应为 true', then: '再看阶段表定位真正断点' },
                    requiresUserChoice: true,
                    blocked: '轮次未配对 / 缺源表 —— 此时的任何调参都可能在错的读数上进行',
                });
                return { ok: true, suggestions: out, count: out.length, autoParamTuning: false };
            }
            const sm = stageOf('source-missing');
            if (sm && (sm.state === 'filtered' || sm.state === 'missing')) {
                const bad = (Array.isArray(o.sources) ? o.sources : []).filter(function (s) { return s && (s.enabled === false || s.error); });
                for (const s of bad.slice(0, 6)) {
                    out.push({
                        id: 'source-off:' + s.key,
                        title: '来源「' + (s.label || s.key) + '」' + (s.error ? '本轮抛错' : '被关闭'),
                        targets: ['sources'],
                        evidence: [
                            evidence('sources[' + s.key + '].enabled', s.enabled === false ? false : (s.enabled === null ? null : true), '源开关态'),
                            evidence('sources[' + s.key + '].error', s.error || null, '本轮错误（空 = 未报错）'),
                        ],
                        apply: s.switchKey
                            ? { auto: false, kind: 'config', key: s.switchKey, from: s.enabled === false ? false : null, to: true, note: '若该源本就该开着，这是配置动作；若有意关闭则不需改' }
                            : { auto: false, kind: 'data', key: s.key, from: null, to: null, note: '该源没有对应配置键（模块未加载 / 名称不匹配）⇒ 先查装载面' },
                        verify: { how: '开启后重跑同一轮，source-missing 档应转 hit', then: '仍无命中则看 no-hit 档' },
                        requiresUserChoice: true,
                    });
                }
            }
            const nh = stageOf('no-hit');
            if (nh && nh.state === 'empty') {
                const alias = (o.alias && typeof o.alias === 'object') ? o.alias : null;
                if (alias && alias.expanded === false) {
                    out.push({
                        id: 'enable-alias-expansion',
                        title: '开启实体别名查询扩展',
                        targets: ['config'],
                        evidence: [
                            evidence('alias.expanded', false, '本轮别名未展开'),
                            evidence('alias.mapSize', (alias.mapSize === undefined ? null : alias.mapSize), '别名表规模'),
                        ],
                        apply: { auto: false, kind: 'config', key: strOf(alias.switchKey) || 'aliasQueryExpansion', from: false, to: true, note: '实体别名查询扩展（默认开）' },
                        verify: { how: '以 X3 同候选重跑比较：同一 query 下 no-hit 应转 hit', then: '仍空则说明库里确实没有该角色/事件' },
                        requiresUserChoice: true,
                    });
                } else if (alias && (alias.mapSize === 0 || alias.mapSize === null)) {
                    out.push({
                        id: 'check-character-aliases',
                        title: '核对角色别名表（本轮无可用别名）',
                        targets: ['data'],
                        evidence: [evidence('alias.mapSize', (alias.mapSize === undefined ? null : alias.mapSize), '别名表规模（0 或未知都说明没有可用的别名映射）')],
                        apply: { auto: false, kind: 'data', key: 'graph.character.aliases', from: null, to: null, note: '给角色节点补 aliases（图谱节点 data.aliases）' },
                        verify: { how: '补完后用同一 query 重跑，配合 X3 对照看 no-hit 是否转 hit', then: '' },
                        requiresUserChoice: true,
                    });
                }
            }
            const vf = stageOf('validity-filtered');
            if (vf && vf.state === 'filtered' && vf.count) {
                out.push({
                    id: 'repair-stale-sources',
                    title: '修复被有效性规则挡下的 ' + vf.count + ' 条',
                    targets: ['data'],
                    evidence: [
                        evidence('validity.filtered', vf.count, '本轮被有效性规则挡下的条数'),
                        evidence('validity.byRule', (o.validity && o.validity.byRule) ? o.validity.byRule : null, '分项归因'),
                    ],
                    apply: { auto: false, kind: 'data', key: 'repair-loop', from: null, to: null, note: '走修复闭环（previewRepair → requestRepair → 逐项 settle），不要在解释面直接改内容' },
                    verify: { how: '修复并落定后重跑同一轮，validity-filtered 档应转 hit', then: '仍被挡则规则本身需要复核' },
                    requiresUserChoice: true,
                });
            }
            const bt = stageOf('budget-trimmed');
            if (bt && bt.state === 'filtered') {
                out.push({
                    id: 'raise-injection-budget',
                    title: '注入预算装不下（被裁 ' + (bt.count === null ? '（条数不可测）' : bt.count + ' 块') + '）',
                    targets: ['config'],
                    evidence: [
                        evidence('budget.trimmed', true, '本轮走过裁剪路径'),
                        evidence('budget.preTrimChars', (o.budget && o.budget.preTrimChars !== undefined) ? o.budget.preTrimChars : null, '裁剪前字符数'),
                        evidence('budget.budgetChars', (o.budget && o.budget.budgetChars !== undefined) ? o.budget.budgetChars : null, '本次预算（字符）'),
                        evidence('budget.dropped', (o.budget && o.budget.dropped !== undefined) ? o.budget.dropped : null, '丢弃块数（硬截断时为 null）'),
                    ],
                    apply: { auto: false, kind: 'config', key: (o.budget && o.budget.switchKey) ? o.budget.switchKey : 'injectionBudget', from: (o.budget && o.budget.budgetChars !== undefined) ? o.budget.budgetChars : null, to: null, note: '上调预算属显式配置动作；常驻超量时先看常驻占用再决定' },
                    verify: { how: '以 X3 同候选重跑比较（compareStrategies）：同一候选下被裁条数应下降', then: '收益不可见则说明瓶颈不在这里' },
                    requiresUserChoice: true,
                });
            }
            const inj = stageOf('injected');
            if (inj && inj.state === 'hit' && inj.count) {
                out.push({
                    id: 'downstream-not-recall',
                    title: '链路已通：' + inj.count + ' 块进了载荷',
                    targets: ['rerun'],
                    evidence: [
                        evidence('injected.count', inj.count, '最终载荷块数'),
                        evidence('injected.refs', inj.refs.slice(0, 5), '样例行引用'),
                    ],
                    apply: { auto: false, kind: 'config', key: null, from: null, to: null, note: '无需改配置：问题若仍在，在于模型没有引用（下游），不在召回链路' },
                    verify: { how: '看生成正文是否引用这些 ref；反复不引用再考虑提示词/位置策略', then: '' },
                    requiresUserChoice: true,
                });
            }
            if (!out.length) {
                out.push({
                    id: 'no-suggestion',
                    title: '无建议（本轮的断点未落在可执行面上）',
                    targets: ['rerun'],
                    evidence: [evidence('verdict.stage', ex.verdict ? ex.verdict.stage : null, '本轮断点档位')],
                    apply: { auto: false, kind: 'config', key: null, from: null, to: null, note: '没有可执行项时不产出建议 —— 不为了「有建议」而编一条' },
                    verify: { how: '—', then: '' },
                    requiresUserChoice: true,
                });
            }
            return { ok: true, suggestions: out, count: out.length, autoParamTuning: false };
        } catch (e) {
            return { ok: false, reason: 'thrown', error: String((e && e.message) || e), suggestions: [], count: 0, autoParamTuning: false };
        }
    }

    /* ── 用户反馈：记录意见，不写历史事实 ───────────────
     * 有界环形（MAX_FEEDBACK）。返回新列表（纯函数，不改入参）。
     * 「反馈不能自动改成历史事实」是 X8 验收原话 —— 故返回值里显式带
     * `writesHistoryFact:false`，让下游无法把这条口径读漏。
     * ──────────────────────────────────────────────── */
    function feedback(list, item, opts) {
        try {
            const o = (opts && typeof opts === 'object') ? opts : {};
            const prev = Array.isArray(list) ? list.slice(0, MAX_FEEDBACK) : [];
            const it = (item && typeof item === 'object') ? item : {};
            const rec = {
                at: intOrNull(o.now),
                floor: intOrNull(it.floor),
                verdictStage: strOf(it.verdictStage) || 'unknown',
                suggestionId: strOf(it.suggestionId),
                agree: (it.agree === true) ? true : (it.agree === false ? false : null),
                note: strOf(it.note).slice(0, 200),
            };
            const next = [rec].concat(prev).slice(0, MAX_FEEDBACK);
            return { ok: true, list: next, count: next.length, writesHistoryFact: false };
        } catch (e) {
            return { ok: false, reason: 'thrown', error: String((e && e.message) || e), list: (Array.isArray(list) ? list : []), count: 0, writesHistoryFact: false };
        }
    }

    /** 一行诊断读数（面板用）。判不了时**不报 0**，如实报「判不了」。 */
    function line(explanation) {
        try {
            if (!explanation || explanation.ok !== true) return '—（召回解释不可用）';
            const v = explanation.verdict || {};
            const parts = [String(v.label || '判不了')];
            if (explanation.floor !== null && explanation.floor !== undefined) parts.push('第 ' + explanation.floor + ' 楼');
            if (v.unproven) parts.push('未定论');
            if (explanation.degraded) parts.push('范围有限');
            const flagged = (explanation.stages || []).filter(function (s) { return s.state === 'filtered' || s.state === 'empty'; });
            for (const s of flagged.slice(0, 3)) {
                if (s.count !== null && s.count !== undefined) parts.push(s.label + ' ' + s.count);
            }
            if (Array.isArray(explanation.narrowed) && explanation.narrowed.length) parts.push('收窄：' + explanation.narrowed.join('/'));
            if (explanation.truncated && explanation.truncated.any) parts.push('⚠️ ' + explanation.truncated.notes.length + ' 处待复核');
            return parts.join(' · ');
        } catch (e) { return '—（召回解释异常）'; }
    }

    const api = Object.freeze({
        RECALL_EXPLAIN_VERSION, MAX_FEEDBACK,
        STAGES, STAGE_IDS, STAGE_BY_ID, RECALL_ORDER, TARGET_KINDS,
        explainRecall, suggestFor, feedback, line,
        intOrNull, strOf, countOf,
    });
    root.LonShaRecallExplain = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
