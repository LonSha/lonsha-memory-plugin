/* ============================================================
 * memory-tools-api.js — [M-X9] 统一记忆工具 API 与手机可消费投影（面首见 v3.305.0）
 * ------------------------------------------------------------
 * 【为什么需要这一面（修前实测，不是推测）】
 *   拓展计划第二期 M-X9 点名五个 API：`queryEvidence` / `getContinuityPack` /
 *   `previewFactAdmission` / `explainRecall` / `getKnowledgeBoundary`。
 *   修前全仓实测（`grep -rn` 五名，排除 .git/node_modules）：
 *     · `explainRecall` 有实现（`recall-explain.js`，宿主调用点 `index.js:explainRecallHost`）；
 *     · 其余四个名**零命中** —— 它们各自的能力**早已在盘上**
 *       （`evidence-query.js::query`、`volume-continuation.js::buildContinuationPack`、
 *        `native-fact-admission.js::admitNativeFact`、`knowledge-trace.js::provenanceOf`），
 *       但没有任何一处把「一个下游可以按名调用的统一面」产出来。
 *   后果是下游 ruby-phone 只能**按模块名逐个结对**（`readLonshaEvidence` / `readProjection` …），
 *   每加一条上游能力，下游就要多一处「按名配对」的硬编码；而本仓最贵的老账
 *   （「同一件事存在两份口径」）在这种配对下必然复发：上游改名/拆档，下游静默失效。
 *
 * 【本模块补的到底是什么（一句话）】
 *   把五条既有能力**收进一个信封**：同名调用、同一套状态词、同一份来源/revision/范围读数。
 *   它**不实现任何业务**，只做三件事：① 按名找到能力（且**缺席必须可表达**）；
 *   ② 把该能力自己的读数**原样引用**进统一信封（不复制、不改写、不缓存）；
 *   ③ 把「缺席 / 空数据 / 判不了 / 范围收窄」压成**互不同形**的五态。
 *
 * 【四条口径（与 M-X9 验收逐条对齐）】
 *   ① **下游不依赖本仓内部文件路径**：信封只给 `source.module`（文件名）与 `source.symbol`，
 *      路径一格恒为字面量 `not-given` —— 机器可核，不靠人记得别写路径。
 *   ② **缺某一接口时能降级，不静默返回空数据**：能力不在场一律 `unavailable`
 *      且 `reason` 区分 `module-absent` / `symbol-absent`；`empty` 只留给
 *      「能力在场、真跑过、明确没有」。这两态**永不同形**。
 *   ③ **投影不复制第二份事实库**：`data` 是对被包装面返回值的**原样引用**
 *      （不深拷贝、不落盘、不进模块级变量）；本模块**没有**任何模块级可变状态。
 *   ④ **同一份输出可用于诊断、手机 UI 与测试夹具**：信封是纯 JSON 面
 *      （无函数、无循环引用、无不可序列化值），`selfCheck()` 里带往返自证。
 *
 * 【本模块**不做**什么（边界）】
 *   · 不 require 任何兄弟模块 —— 能力经 `sources` **参数注入**（见下）；
 *   · 不开写口：五个出口全为只读；写操作由本仓内部 owner 控制，
 *     故本模块的导出面里**一个 mutating 名都没有**（判据面另有真源码扫描）；
 *   · 不发明事实：读数形状**照抄**被包装面，本模块只做状态归类与装订；
 *   · 不缓存：同一入参两次调用产出**逐字相同**的信封（幂等由 selfCheck 自证）。
 *
 * 【为什么能力要参数注入，而不是 require】
 *   三个理由，缺一不可：
 *   ① **跨仓纪律**：本仓 `scan_cross_repo_binding.mjs` 的 P2 要求「在役测试面不得引用
 *      兄弟仓」；同理，外供面若硬 require 内部文件，装载顺序一变就整面失效 ——
 *      而「失效」与「本来就没数据」在 require 失败时**同形**（这是本仓最忌的形态）。
 *   ② **缺席必须是可表达的**：宿主（SillyTavern）里这五个模块的装载顺序由 manifest 决定，
 *      单独安装某一个的能力**必须能回答「我缺哪一格」**。参数注入让缺席成为一个**入参事实**，
 *      于是它能被如实报成 `unavailable`，而不是一个抛出的异常或一个空对象。
 *   ③ **一份装配点**：`sources` 的组装只有一处（宿主接线），下游与判据套件注入**同一形状**，
 *      不再各自 require 一遍（那就是第二份装配口径）。
 *
 * 【信封五态（词表是契约，不是装饰）】
 *   ok           有读数，且范围完整
 *   empty        能力在场、真跑过，而**明确没有**（空数据）
 *   unknown      **判不了**（缺可核对的身份 / 输入不足以判定）—— 不得当 empty 用
 *   unavailable  能力**缺席**（模块不在 / 符号不在 / 未知能力名）
 *   partial      有读数，但范围被收窄（截断 / 许可收窄 / 纠正链断裂 / 降级）
 * ============================================================ */
(function (root) {
    'use strict';

    /** 本面版本（信封结构版本；形状一变必须抬这个数，防「旧下游配新面」静默错读）。 */
    const TOOLS_VERSION = 1;
    /** 统一 API 版本（宿主/下游据此判「认不认得这套信封」）。 */
    const API_VERSION = 1;
    /** 信封 kind（下游可据此判「这是不是本项目产出的信封」）。 */
    const KIND = 'memory-tools-envelope';

    const STATES = Object.freeze(['ok', 'empty', 'unknown', 'unavailable', 'partial', 'canceled']);
    const STATE_LABEL = Object.freeze({
        ok: '有读数（范围完整）',
        empty: '能力在场且明确没有（空数据）',
        unknown: '判不了（不得当 empty 用）',
        unavailable: '能力缺席（模块或符号不在场）',
        partial: '有读数但范围被收窄（截断/收窄/断裂/降级）',
        /* [v3.332.0 · M4-O4] 取消不是失败也不是「没有」:被取消的查询有已处理部分的读数,
         *   与 empty(明确没有) / partial(触顶收窄) 都不同形。 */
        canceled: '查询被取消（读数是已处理部分，不是全量结论）'
    });
    /* [v3.332.0 · M4-O4] 词表与标签表的一致性锚：selfCheck 的「六态齐」以本键表为准
     *   （词表多一态没标签、或标签多一态没词条，都算不完整 —— 仍是 fail-closed）。 */
    const STATE_LABEL_KEYS = Object.freeze(Object.keys(STATE_LABEL));

    /* ── 五个能力登记表（**符号名与版本常量名一律写死，不许推导**） ──
     * ★ 留痕（本版首跑抓到的自伤）：首版按 `cap.name.toUpperCase() + '_VERSION'` 推导
     *   版本常量名，实测五个模块的真名是 `QUERY_VERSION` / `VOLUME_CONTINUATION_VERSION` /
     *   `ADMIT_VERSION` / `RECALL_EXPLAIN_VERSION` / `KT_VERSION` —— **无规律可循**
     *   （`KT_VERSION` 差得最远），推导出的 `QUERYEVIDENCE_VERSION` 全不存在 ⇒
     *   `describe()` 里五个 version 恒 null 而 state 仍 ok：**一个恒为空的读数
     *   混在健康读数里、看起来完全正常**。这正是本仓点名的「不许猜符号名」。
     *   故本表逐条写死真名（`ver` 字段），并留这条注释解释为何不能推导。 */
    const CAPABILITIES = Object.freeze([
        {
            name: 'queryEvidence', module: 'evidence-query.js', sym: 'query', ver: 'QUERY_VERSION',
            label: '结构化证据查询', arg: '(host, spec, opts)'
        },
        {
            name: 'getContinuityPack', module: 'volume-continuation.js', sym: 'buildContinuationPack',
            ver: 'VOLUME_CONTINUATION_VERSION', label: '续接包（卷/许可/面）', arg: '(args)'
        },
        {
            name: 'previewFactAdmission', module: 'native-fact-admission.js', sym: 'admitNativeFact',
            ver: 'ADMIT_VERSION', label: '事实准入预演（决策/可见性）', arg: '(fact, ctx)'
        },
        {
            name: 'explainRecall', module: 'recall-explain.js', sym: 'explainRecall',
            ver: 'RECALL_EXPLAIN_VERSION', label: '召回解释（哪一档挡下候选）', arg: '(rawInput, opts)'
        },
        {
            name: 'getKnowledgeBoundary', module: 'knowledge-trace.js', sym: 'provenanceOf',
            ver: 'KT_VERSION', label: '知识出处链（这条知识凭什么算数）', arg: '(raw, character, fact, opts)'
        },
        /* [v3.332.0 · M4-O4] 第六能力:异步结构化查询。同一模块、同一份判定
         *   (queryAsync 与 query 走同一个 universeOf/matchRow/assemble),
         *   只是执行时机不同 —— 片间让出事件循环、片间检查取消。
         *   版本常量同 QUERY_VERSION(同一模块的同一个版本锚,不另造)。 */
        {
            name: 'queryEvidenceAsync', module: 'evidence-query.js', sym: 'queryAsync',
            ver: 'QUERY_VERSION', label: '结构化证据查询（协作分片异步）',
            arg: '(host, spec, opts:{shardRows,yieldTo,shouldCancel})'
        }
    ]);

    /* ── 取值归一（与 evidence-workbench / evidence-query 同规格：没给 ⇒ null，不写 0） ── */
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function str(v, max) {
        const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }
    function intOrNull(v) {
        const n = numOrNull(v);
        return n === null ? null : Math.trunc(n);
    }
    function countOf(v) {
        const n = numOrNull(v);
        return n === null || n < 0 ? 0 : Math.trunc(n);
    }
    function objOrEmpty(v) {
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    }

    /** 按名取登记（未知能力名**必须**与「模块缺席」分列 —— 两者处置相反）。 */
    function capabilityOf(name) {
        const n = str(name, 40);
        for (const c of CAPABILITIES) if (c.name === n) return c;
        return null;
    }

    /* ---------------------------------------------------------------
     * 能力在场普查（**只探，不调**）
     *   三态分开：module-absent（没注入） / symbol-absent（注入了但缺该符号） /
     *   在场。第三态里版本常量**取不到就如实 null**，不编 0（本仓取数门口径）。
     * --------------------------------------------------------------- */
    function probeOne(sources, cap) {
        const src = objOrEmpty(sources);
        const mod = src[cap.name] || null;
        if (!mod || typeof mod !== 'object') {
            return { present: false, reason: 'module-absent', module: null, fn: null, version: null };
        }
        const version = numOrNull(mod[cap.ver]);
        const fn = mod[cap.sym];
        if (typeof fn !== 'function') {
            return { present: false, reason: 'symbol-absent', module: mod, fn: null, version: version };
        }
        return { present: true, reason: '', module: mod, fn: fn, version: version };
    }

    /** 全能力普查（供 describe / selfCheck 用）。 */
    function probeAll(sources) {
        const out = [];
        for (const cap of CAPABILITIES) {
            const p = probeOne(sources, cap);
            out.push({
                name: cap.name, label: cap.label, module: cap.module, symbol: cap.sym,
                versionConstant: cap.ver, version: p.version,
                present: p.present, reason: p.reason, arg: cap.arg
            });
        }
        return out;
    }

    /* ---------------------------------------------------------------
     * 统一信封
     *   `data` 是**原样引用**（口径③）：本函数不 copy、不 mutate、不缓存。
     *   `source.path` 恒为字面量 `not-given`（口径①）：下游拿不到本仓内部路径，
     *   即便将来有人手滑想在这里塞 `__dirname`，判据也会因为字面量比对而当场响。
     * --------------------------------------------------------------- */
    function envelope(apiName, state, o) {
        const cap = capabilityOf(apiName);
        const s = STATES.indexOf(state) >= 0 ? state : 'unknown';
        const opts = objOrEmpty(o);
        return {
            kind: KIND,
            api: cap ? cap.name : str(apiName, 40),
            apiVersion: API_VERSION,
            toolVersion: TOOLS_VERSION,
            state: s,
            stateLabel: STATE_LABEL[s],
            reason: str(opts.reason, 80),
            source: {
                module: cap ? cap.module : '',
                symbol: cap ? cap.sym : '',
                /* 下游不得依赖内部路径 ⇒ 这一格**刻意不给路径**，且恒为该字面量。 */
                path: 'not-given'
            },
            revision: (opts.revision === undefined || opts.revision === null) ? null : numOrNull(opts.revision),
            revisionSource: str(opts.revisionSource, 60) || (cap ? cap.ver : ''),
            scope: objOrEmpty(opts.scope),
            data: (opts.data === undefined ? null : opts.data),
            notes: Array.isArray(opts.notes) ? opts.notes.map((x) => str(x, 240)).filter(Boolean) : [],
            /* 只读面自述：本模块的五个出口**一个写口都没有**，此处为机器可核的声明。 */
            writesNothing: true
        };
    }

    /** 缺席信封（降级路径的唯一出口：**绝不**在这里返回空数据形状）。 */
    function unavailableFor(apiName, probe, scope, notes) {
        const cap = capabilityOf(apiName);
        const why = probe.reason === 'module-absent'
            ? '能力模块缺席（未注入 sources.' + apiName + '）⇒ 报 unavailable，**不报空数据**'
            : ('能力符号缺席（' + (cap ? cap.module : apiName) + ' 在场但缺 ' + (cap ? cap.sym : '') +
                '）⇒ 判为「本版本不产此面」，与「查了没有」不同形');
        return envelope(apiName, 'unavailable', {
            reason: probe.reason,
            revision: probe.version,
            revisionSource: cap ? cap.ver : '',
            scope: scope,
            data: null,
            notes: [why].concat(Array.isArray(notes) ? notes : [])
        });
    }

    /* ===============================================================
     * 出口 ①：queryEvidence —— 结构化证据查询
     *   包装 evidence-query.js::query(host, spec, opts)。
     *   状态映射（**逐条有据**，不靠感觉）：
     *     · 被包装面 `state === 'inverted-range'` ⇒ empty（区间反转按空集处理）+ reason 带出
     *     · `state === 'ok'` 且无触顶 ⇒ ok；有触顶（coverage.truncated 非空）⇒ partial
     *     · `state === 'empty'`：
     *         – 九账**全部取不到**（counts.absent>0 且 counts.ok===0）⇒ unavailable
     *           （这不是「查不到」，是「没东西可查」——上游原文如此，本面照此分态）
     *         – 其余 ⇒ empty
     * =============================================================== */
    function queryEvidence(sources, host, spec, opts) {
        const cap = CAPABILITIES[0];
        const p = probeOne(sources, cap);
        const o = objOrEmpty(opts);
        const scope = {
            ledgers: Array.isArray(o.ledgers) ? o.ledgers.length : null,
            page: intOrNull(o.page),
            pageSize: intOrNull(o.pageSize)
        };
        if (!p.present) return unavailableFor(cap.name, p, scope);
        let q = null;
        try { q = p.fn(host, spec, opts); } catch (_e) { q = null; }
        if (!q || typeof q !== 'object') {
            return envelope(cap.name, 'unknown', {
                reason: 'thrown', revision: p.version, scope: scope, data: null,
                notes: ['被包装面未返回可读对象（异常或非对象返回）⇒ 报 unknown，不报空数据']
            });
        }
        const cov = objOrEmpty(q.coverage);
        const counts = objOrEmpty(cov.counts);
        const truncated = Array.isArray(cov.truncated) ? cov.truncated : [];
        const full = {
            total: countOf(q.total), scanned: countOf(q.scanned),
            requestedLedgers: countOf(cov.requestedLedgers),
            counts: { ok: countOf(counts.ok), empty: countOf(counts.empty), absent: countOf(counts.absent) },
            truncatedLedgers: truncated.slice()
        };
        const shared = { revision: p.version, scope: Object.assign({}, scope, full), data: q };
        if (q.state === 'inverted-range') {
            return envelope(cap.name, 'empty', Object.assign({}, shared, {
                reason: 'inverted-range',
                notes: [str(q.emptyReason, 240) || '区间起止反转 ⇒ 按空集处理（不自动交换）']
            }));
        }
        if (q.state === 'empty') {
            const allAbsent = full.counts.absent > 0 && full.counts.ok === 0;
            return envelope(cap.name, allAbsent ? 'unavailable' : 'empty', Object.assign({}, shared, {
                reason: allAbsent ? 'scan-surface-absent' : 'no-match',
                notes: allAbsent
                    ? ['九账全部取不到（见 coverage.ledgers 的 reason）⇒ 报 unavailable：这是「没东西可查」，不是「查不到」']
                    : [str(q.emptyReason, 240) || '扫描面在场、逐条比对后无命中 ⇒ 明确没有']
            }));
        }
        if (truncated.length) {
            return envelope(cap.name, 'partial', Object.assign({}, shared, {
                reason: 'truncated',
                notes: ['有账触到扫描上限（' + truncated.join('、') + '）⇒ 读数可用但范围被收窄']
            }));
        }
        return envelope(cap.name, 'ok', shared);
    }

    /* ===============================================================
     * 出口 ⑥：queryEvidenceAsync —— 异步结构化证据查询 [v3.332.0 · M4-O4]
     *   包装 evidence-query.js::queryAsync(host, spec, opts)。
     *   状态映射与 queryEvidence 同源,另加 canceled:
     *     · q.state === 'canceled' ⇒ canceled(读数是已处理部分,绝不当 empty)
     *     · 其余态与 queryEvidence 逐条同款(同一份 assemble 产出的 state)
     *   异步语义:返回 Promise;opts 里 shardRows/yieldTo/shouldCancel 原样透传,
     *   本面不另设让出粒度(让出粒度是内核口径,包一层再写一份就是第二真源)。
     * =============================================================== */
    async function queryEvidenceAsync(sources, host, spec, opts) {
        const cap = CAPABILITIES[5];
        const p = probeOne(sources, cap);
        const o = objOrEmpty(opts);
        const scope = {
            ledgers: Array.isArray(o.ledgers) ? o.ledgers.length : null,
            page: intOrNull(o.page),
            pageSize: intOrNull(o.pageSize),
            shardRows: intOrNull(o.shardRows),
            cancellable: typeof o.shouldCancel === 'function'
        };
        if (!p.present) return unavailableFor(cap.name, p, scope);
        let q = null;
        try { q = await p.fn(host, spec, opts); } catch (_e) { q = null; }
        if (!q || typeof q !== 'object') {
            return envelope(cap.name, 'unknown', {
                reason: 'thrown', revision: p.version, scope: scope, data: null,
                notes: ['被包装面未返回可读对象（异常或非对象返回）⇒ 报 unknown，不报空数据']
            });
        }
        const cov = objOrEmpty(q.coverage);
        const counts = objOrEmpty(cov.counts);
        const truncated = Array.isArray(cov.truncated) ? cov.truncated : [];
        const full = {
            total: countOf(q.total), scanned: countOf(q.scanned),
            requestedLedgers: countOf(cov.requestedLedgers),
            counts: { ok: countOf(counts.ok), empty: countOf(counts.empty), absent: countOf(counts.absent) },
            truncatedLedgers: truncated.slice()
        };
        const shared = { revision: p.version, scope: Object.assign({}, scope, full), data: q };
        /* 取消先判:取消态下 total/hits 读数是「已处理部分」,不与触顶/空集混判。 */
        if (q.canceled === true || q.state === 'canceled') {
            const proc = objOrEmpty(q.processed);
            return envelope(cap.name, 'canceled', Object.assign({}, shared, {
                reason: 'canceled',
                notes: ['查询被取消：data 里的读数是**已处理部分**（processed.rows/'
                    + (numOrNull(proc.rows) === null ? 0 : proc.rows) + ' · totalRows/'
                    + (numOrNull(proc.totalRows) === null ? 0 : proc.totalRows)
                    + '），不是全量结论']
            }));
        }
        if (q.state === 'inverted-range') {
            return envelope(cap.name, 'empty', Object.assign({}, shared, {
                reason: 'inverted-range',
                notes: [str(q.emptyReason, 240) || '区间起止反转 ⇒ 按空集处理（不自动交换）']
            }));
        }
        if (q.state === 'empty') {
            const allAbsent = full.counts.absent > 0 && full.counts.ok === 0;
            return envelope(cap.name, allAbsent ? 'unavailable' : 'empty', Object.assign({}, shared, {
                reason: allAbsent ? 'scan-surface-absent' : 'no-match',
                notes: allAbsent
                    ? ['九账全部取不到（见 coverage.ledgers 的 reason）⇒ 报 unavailable：这是「没东西可查」，不是「查不到」']
                    : [str(q.emptyReason, 240) || '扫描面在场、逐条比对后无命中 ⇒ 明确没有']
            }));
        }
        if (truncated.length) {
            return envelope(cap.name, 'partial', Object.assign({}, shared, {
                reason: 'truncated',
                notes: ['有账触到扫描上限（' + truncated.join('、') + '）⇒ 读数可用但范围被收窄']
            }));
        }
        return envelope(cap.name, 'ok', shared);
    }

    /* ===============================================================
     * 出口 ②：getContinuityPack —— 续接包
     *   包装 volume-continuation.js::buildContinuationPack(args)。
     *   reason 是**上游自己的词表**（本面不改写，只归类）：
     *     license-summary-only ⇒ partial（许可收窄：每一面点名缺席）
     *     license-none         ⇒ unavailable（这一版不给这一面）
     *     no-volume            ⇒ empty（项目在、这一卷没有）
     *     no-project           ⇒ unknown（缺项目 ⇒ 不足以判定，不得当 empty）
     *     project-invalid      ⇒ unknown（项目形状不合法 ⇒ 判不了）
     *   ★ 成功路径的 reason **也照抄上游**（实测为字面量 `'ok'`）：不得在本面编一个
     *     `'faces-absent'` 塞进 reason 格 —— 那会让 `reason='ok'` 与 `state='partial'`
     *     同时出现（一处说「没问题」、一处说「收窄了」），读者无从判断该信哪一格。
     *     缺面的成因改放 scope（`absentBy`），reason 保持上游原值。
     *   ★ 许可收窄与普通缺面**同态同因分列**：`license-summary-only` 是「这一版按许可
     *     刻意不给」，不是「面没接上」；上游 absentFaces 每项自带 reason，本面据此分类。
     * --------------------------------------------------------------- */
    function getContinuityPack(sources, args) {
        const cap = CAPABILITIES[1];
        const p = probeOne(sources, cap);
        const a = objOrEmpty(args);
        const proj = objOrEmpty(a.project);
        const scope = {
            projectId: str(proj.projectId, 60),
            volumeRef: (a.volumeRef === undefined || a.volumeRef === null) ? 1 : a.volumeRef,
            viewer: str(objOrEmpty(a.viewer).name || objOrEmpty(a.viewer).id, 40)
        };
        if (!p.present) return unavailableFor(cap.name, p, scope);
        let r = null;
        try { r = p.fn(args); } catch (_e) { r = null; }
        if (!r || typeof r !== 'object') {
            return envelope(cap.name, 'unknown', {
                reason: 'thrown', revision: p.version, scope: scope, data: null,
                notes: ['被包装面未返回可读对象 ⇒ 报 unknown，不报空数据']
            });
        }
        const reason = str(r.reason, 40);
        const absentFaces = Array.isArray(r.absentFaces) ? r.absentFaces : [];
        /* 缺面成因按上游每项自带的 reason 分类（许可收窄 / 未接上 / 其余），本面不合并。 */
        const absentBy = {};
        for (const x of absentFaces) {
            const k = str(objOrEmpty(x).reason, 40) || 'unreported';
            absentBy[k] = (absentBy[k] || 0) + 1;
        }
        const shared = {
            revision: p.version, data: r,
            scope: Object.assign({}, scope, {
                absentFaces: absentFaces.length,
                absentBy: absentBy,
                hidden: countOf(r.hidden),
                hiddenBy: str(r.hiddenBy, 40) || null
            })
        };
        if (r.ok === true) {
            if (!absentFaces.length) return envelope(cap.name, 'ok', shared);
            const narrowed = (absentBy['license-summary-only'] || 0) > 0;
            return envelope(cap.name, 'partial', Object.assign({}, shared, {
                /* reason 保持**上游原值**（实测成功路径为 'ok'），成因在 absentBy 里。 */
                notes: [narrowed
                    ? '许可被收窄为摘要：' + absentFaces.length + ' 面点名缺席（不是「没有面」）'
                    : ('有续接包但 ' + absentFaces.length + ' 面缺席（逐面点名，不静默）')]
            }));
        }
        const map = {
            'license-summary-only': ['partial', '许可被收窄为摘要：每一面都点名缺席（不是「没有面」）'],
            'license-none': ['unavailable', '本版许可明确不含此面 ⇒ 与「查了没有」不同形'],
            'no-volume': ['empty', '项目在、该卷号没有 ⇒ 明确没有'],
            'no-project': ['unknown', '缺项目 ⇒ 不足以判定有无续接包（不得当 empty）'],
            'project-invalid': ['unknown', '项目形状不合法 ⇒ 判不了'],
            'face-absent': ['partial', '真源面缺席但其余读数可用 ⇒ 范围收窄']
        };
        const hit = map[reason] || ['unknown', '未登记 reason（' + (reason || '空') + '）⇒ 如实报 unknown 并由登记面补词'];
        return envelope(cap.name, hit[0], Object.assign({}, shared, {
            reason: reason || 'unreported', notes: [hit[1]]
        }));
    }

    /* ===============================================================
     * 出口 ③：previewFactAdmission —— 事实准入预演
     *   包装 native-fact-admission.js::admitNativeFact(fact, ctx)。
     *   三条映射纪律：
     *     · `measurable === false` ⇒ unknown（上游原文：不可测如实报，不拿 0 冒充）
     *     · decision 的**值域照抄上游 state 词表**，本面**不自建第二份值域**：
     *       ★ 留痕（本版第二跑抓到的自伤）：首版按「admitted / rejected / retracted / pending」
     *       四个名写死映射表，实测上游 `decision` 直接等于事实状态词，真值域是
     *       `admitted`（唯一确认入账）+ `observed` / `predicted` / `draft` / `quoted`（来源默认）
     *       + `rejected`。于是 observed / predicted / draft / quoted **全部落进兜底 unknown** ——
     *       四条真读数被静默读成「判不了」。这正是本仓点名的「同一件事两份口径」。
     *       现改为：**未知 decision 一律不猜**，如实报 unknown 并把原值带进 reason，
     *       由登记面（本文件 CATALOG/注释）补词；真值域见 native-fact-admission.js 的 SOURCE_POLICY。
     *     · `unknown-source` ⇒ unknown（来源不在策略表里 ⇒ 判不了，不是「拒绝」）
     *   本出口是**预演**（preview）：上游的写口由 owner 控制，本面**不开写口**。
     * =============================================================== */
    function previewFactAdmission(sources, fact, ctx) {
        const cap = CAPABILITIES[2];
        const p = probeOne(sources, cap);
        const f = objOrEmpty(fact);
        const scope = {
            eventId: str(f.eventId, 60),
            source: str(f.source, 40),
            sourceFloor: intOrNull(f.sourceFloor),
            chatId: str(f.chatId, 40)
        };
        if (!p.present) return unavailableFor(cap.name, p, scope);
        let r = null;
        try { r = p.fn(fact, ctx); } catch (_e) { r = null; }
        if (!r || typeof r !== 'object') {
            return envelope(cap.name, 'unknown', {
                reason: 'thrown', revision: p.version, scope: scope, data: null,
                notes: ['被包装面未返回可读对象 ⇒ 报 unknown，不报空数据']
            });
        }
        const shared = {
            revision: p.version, data: r,
            scope: Object.assign({}, scope, {
                decision: str(r.decision, 24), visibility: str(r.visibility, 24),
                isFact: r.isFact === true, measurable: r.measurable !== false
            })
        };
        if (r.measurable === false) {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: str(r.reason, 40) || 'unmeasurable',
                notes: ['上游自述不可测（measurable=false）⇒ 报 unknown：不拿 0 或 false 冒充判定结果']
            }));
        }
        const reason = str(r.reason, 40);
        if (reason === 'unknown-source') {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: 'unknown-source',
                notes: ['来源不在策略表 ⇒ 判不了（**不是**「被拒绝」）；上游策略表是唯一真源']
            }));
        }
        const map = {
            /* ★ 值域**照抄上游**（实测：decision 即事实状态词；admitted 时 state='confirmed'）。
             *   admitted 是**唯一**进已发生事实的档；其余四档都是「有读数但结论未定」——
             *   上游原文：observed「已发生但未经用户确认」、predicted「永不进已发生事实」、
             *   draft「未确认不进账」、quoted「与源同根，不当独立证据」。
             *   把四档压成 rejected 会丢掉「这条事实处于哪种未定状态」，压成 admitted 更坏。 */
            admitted: ['ok', '准入通过：按来源策略给出状态与可见性（唯一进已发生事实的档）'],
            observed: ['partial', '已发生但未经用户确认（observed）⇒ 读数可用，不得当已确认事实引用'],
            predicted: ['partial', '预测/建议（predicted）⇒ 读数可用，但不进已发生事实'],
            draft: ['partial', '草稿（draft）⇒ 未确认不进账，读数可用但结论未定'],
            quoted: ['partial', '转述/转发（quoted）⇒ 与源同根，不当独立证据'],
            rejected: ['empty', '明确未进账（拒绝）⇒ 这是「查了没有」，不是「判不了」'],
            retracted: ['empty', '该事件已被撤回 ⇒ 明确不在账上']
        };
        const hit = map[str(r.decision, 24)]
            || ['unknown', '未登记 decision（' + (str(r.decision, 24) || '空')
                + '）⇒ 如实报 unknown，**不猜**成拒绝或通过；词表真源在 native-fact-admission.js'];
        return envelope(cap.name, hit[0], Object.assign({}, shared, {
            reason: reason || str(r.decision, 24) || 'unreported', notes: [hit[1]]
        }));
    }

    /* ===============================================================
     * 出口 ④：explainRecall —— 召回解释
     *   包装 recall-explain.js::explainRecall(rawInput, opts)。
     *   配对判据**照抄上游**（不自建第二份口径）：
     *     paired = hasQuery && audit.presented && floorMatched !== 'mismatch' && idMatched !== false
     *   映射（**与上游的成因分界逐条对齐；判据全部取上游字段，本面不自建**）：
     *     paired=false            ⇒ unknown（判不了）
     *     blockingMissing 非空    ⇒ unknown（**必需面缺读数 ⇒ 判不了**）
     *     verdict.unproven=true   ⇒ partial（链走完、**没走到定论** ⇒ 有读数但落点未定）
     *     其余                    ⇒ ok（含「链停在某一档」的**明确结论**）
     *   ★ 留痕（本版第二跑抓到的第三处自伤）：首版把 blockingMissing 与 narrowed
     *   一并读成 partial/degraded —— 那会让「必需面缺读数（判不了）」与
     *   「可选面没读数（范围有限）」落到**同一个 state**，下游再也没法从 state 上
     *   区分「该先修观测面」还是「该放宽结论」。上游把两者分开曝光
     *   （verdict.stage / narrowed[] / blockingMissing[] 三个字段）正是为了防这个同形。
     *   ★ 判据修正（同版第三次跑）：**partial 的真判据是 `verdict.unproven`，不是 narrowed**——
     *   实测「全源关闭」这条**明确结论**例 narrowed 也为空、unproven=false；
     *   而「可选面未读数」例 unproven=true。拿 narrowed 当判据会漏掉前者、误判后者。
     *   ★ 上游 `degraded = (!paired) || blockingMissing>0` 把两种成因并进一个布尔，故本面
     *   **不直接拿 degraded 当结论**；degraded 只作**兜底**（上游若再引入别的成因，
     *   读数仍是 partial 而不是假装 ok）。
     *   ★ 本出口的 `empty` 在本版**不可达**（如实登记，不凑态）：上游给「零命中」的不是
     *   空数据，而是 `stage='no-hit'` 的**明确结论**（「源在场、无错误、合计 0 条」）——
     *   把它读成 empty 会丢掉「断点在哪一档」这个最有用的读数，故落 ok 并在
     *   `scope.verdictStage` 里带出档名。
     *   上游的 narrowed / blockingMissing / unreadDownstream 三面**原样带出**，
     *   本面不合并、不总结成一句话。
     * =============================================================== */
    function explainRecall(sources, input, opts) {
        const cap = CAPABILITIES[3];
        const p = probeOne(sources, cap);
        const x = objOrEmpty(input);
        const scope = {
            floor: intOrNull(objOrEmpty(x.query).floor),
            hasQuery: objOrEmpty(x.query).hasQuery === true,
            sources: Array.isArray(x.sources) ? x.sources.length : null,
            auditPresented: objOrEmpty(x.audit).presented === true
        };
        if (!p.present) return unavailableFor(cap.name, p, scope);
        let r = null;
        try { r = p.fn(input, opts); } catch (_e) { r = null; }
        if (!r || typeof r !== 'object') {
            return envelope(cap.name, 'unknown', {
                reason: 'thrown', revision: p.version, scope: scope, data: null,
                notes: ['被包装面未返回可读对象 ⇒ 报 unknown，不报空数据']
            });
        }
        const narrowed = Array.isArray(r.narrowed) ? r.narrowed : [];
        const blocking = Array.isArray(r.blockingMissing) ? r.blockingMissing : [];
        const unread = Array.isArray(r.unreadDownstream) ? r.unreadDownstream : [];
        const shared = {
            revision: p.version, data: r,
            scope: Object.assign({}, scope, {
                paired: r.paired === true, degraded: r.degraded === true,
                verdictStage: str(objOrEmpty(r.verdict).stage, 30) || null,
                verdictUnproven: objOrEmpty(r.verdict).unproven === true,
                stages: Array.isArray(r.stages) ? r.stages.length : null,
                narrowed: narrowed.slice(), blockingMissing: blocking.slice(), unreadDownstream: unread.slice()
            })
        };
        if (r.ok === false) {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: 'not-ok', notes: ['上游自述 ok=false ⇒ 这份解释未成型']
            }));
        }
        if (r.paired !== true) {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: 'unpaired',
                notes: ['轮次未配对（缺账本 / 楼层对不上 / 入选条目对不上）⇒ 报 unknown：'
                    + '这是「判不了」，不得读成「没有注入」']
            }));
        }
        /* ★ 阻断面缺席 ⇒ **判不了**（不是「范围收窄」）。
         *   上游把这两者分开曝光正是为了防同形：`degraded = (!paired) || blockingMissing > 0`
         *   把两种成因并进一个布尔，若本面一律读成 partial，就会出现
         *   「必需面没读数（判不了）」与「可选面没读数（范围有限）」**同一个 state** ——
         *   读者再也没法从 state 上区分该补观测面还是该放宽结论。
         *   留痕（本版第二跑抓到的自伤）：首版正是这么做的，4a 例实得 partial/degraded，
         *   而上游 verdict.stage 明写 'unknown'、blockingMissing=['source-missing']。 */
        if (blocking.length) {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: 'blocked',
                notes: ['必需观测面缺席（' + blocking.join('、') + '）⇒ 报 unknown：'
                    + '这一档的存在本身就是读数 —— 先修观测面，再谈「为什么没被用」']
            }));
        }
        if (objOrEmpty(r.verdict).unproven === true) {
            return envelope(cap.name, 'partial', Object.assign({}, shared, {
                reason: 'unproven',
                notes: ['链走完但**没走到定论**（上游 verdict.unproven）⇒ 有读数、落点未定：'
                    + '不是「判不了」（前面的档都读到了），也不是「已注入」（载荷面没读数）——'
                    + '上游原文专门为它留了独立结果，免得与阻断型 unknown 混成一态']
            }));
        }
        if (r.degraded === true) {
            /* 走到这里只剩两种成因：① 有读数但范围有限；② 上游将来新增的成因（本面不认识的）
             *   —— 一律按 partial 兜底，绝不在成因未知时假装 ok（且把成因原文带出去自查）。 */
            const why = narrowed.length
                ? ('有可选面未读数（收窄 ' + narrowed.length + ' 面：' + narrowed.join('、') + '）'
                    + '⇒ 结论范围被收窄，但**不等于**判不了 —— 上游原文：'
                    + '把范围有限冒充成判不了会让真断点永远读不出来')
                : ('上游报 degraded，但既无阻断面缺席、无 unproven、也无 narrowed 记录 ⇒ '
                    + '成因未被本面登记（读 scope/notes 与 data 自查），如实报 partial 而不假装 ok');
            return envelope(cap.name, 'partial', Object.assign({}, shared, { reason: 'degraded', notes: [why] }));
        }
        return envelope(cap.name, 'ok', shared);
    }

    /* ===============================================================
     * 出口 ⑤：getKnowledgeBoundary —— 知识出处链
     *   包装 knowledge-trace.js::provenanceOf(raw, character, fact, opts)。
     *   ★ 第一参是 **raw trace 账**（不是 fact）—— 实参顺序照抄上游签名。
     *     留痕（本版首跑抓到的自伤）：首版写成 `provenanceOf(fact, character, opts)`，
     *     缺了 raw、把 fact 错当 raw、opts 错当 fact，于是**永远返回 notRecorded**
     *     （一个恒定的、看起来完全正常的读数）。这类错不改形状、只错参数，
     *     只有真业务路径冒烟才抓得到 —— 故本面的实参顺序在此逐字写明。
     *   映射：链空（notRecorded）⇒ unknown + reason 'not-recorded'
     *     （**不得**读成「他不知道」：上游原文「我们没记过 ≠ 该角色确实不知道」）；
     *     brokenLink / cycle 非零 ⇒ partial（链可见但断裂/成环）；
     *     正常链 ⇒ ok。
     * =============================================================== */
    function getKnowledgeBoundary(sources, raw, character, fact, opts) {
        const cap = CAPABILITIES[4];
        const p = probeOne(sources, cap);
        const scope = {
            character: str(character, 40), fact: str(fact, 120),
            identity: str(objOrEmpty(opts).identity, 24) || null,
            suspect: str(objOrEmpty(opts).suspect, 40) || null
        };
        if (!p.present) return unavailableFor(cap.name, p, scope);
        let r = null;
        try { r = p.fn(raw, character, fact, opts); } catch (_e) { r = null; }
        if (!r || typeof r !== 'object') {
            return envelope(cap.name, 'unknown', {
                reason: 'thrown', revision: p.version, scope: scope, data: null,
                notes: ['被包装面未返回可读对象 ⇒ 报 unknown，不报空数据']
            });
        }
        const chain = Array.isArray(r.chain) ? r.chain : [];
        const broken = countOf(r.brokenLink);
        const cycle = countOf(r.cycle);
        const shared = {
            revision: p.version, data: r,
            scope: Object.assign({}, scope, {
                chain: chain.length, brokenLink: broken, cycle: cycle,
                state: str(r.state, 30) || null
            })
        };
        if (r.degraded === true) {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: 'degraded', notes: ['上游自述降级（reads 形状可读但判定面降级）⇒ 判不了']
            }));
        }
        if (r.state === 'notRecorded') {
            return envelope(cap.name, 'unknown', Object.assign({}, shared, {
                reason: 'not-recorded',
                notes: ['**未记录** ≠ 「他不知道」：上游原文把两者分列的理由正是'
                    + '「我们没记过 ⇒ 该角色确实不知道」是一句无据断言。'
                    + '本面照此报 unknown，不得被下游读成否证。']
            }));
        }
        if (broken > 0 || cycle > 0) {
            const parts = [];
            if (broken) parts.push('纠正链断裂 ' + broken);
            if (cycle) parts.push('成环 ' + cycle);
            return envelope(cap.name, 'partial', Object.assign({}, shared, {
                reason: cycle ? 'cycle' : 'broken-link',
                notes: ['链可见但有缺陷（' + parts.join('、') + '）⇒ 读数可用但范围被收窄']
            }));
        }
        return envelope(cap.name, 'ok', shared);
    }

    /* ===============================================================
     * 辅助出口：能力面自述 / 一行诊断 / 自检
     *   describe 是 M-X9 验收第 ② 条的**可机核落点**：
     *   「缺某一接口时能降级」——缺哪一格、为什么缺、缺了会怎样，全在这一份读数里。
     * =============================================================== */
    function describe(sources) {
        const caps = probeAll(sources);
        const absent = caps.filter((c) => !c.present);
        return {
            kind: KIND + '-describe',
            apiVersion: API_VERSION,
            toolVersion: TOOLS_VERSION,
            states: STATES.slice(),
            counts: {
                total: caps.length,
                present: caps.length - absent.length,
                absent: absent.length
            },
            absentReasons: absent.map((c) => ({ name: c.name, reason: c.reason, module: c.module })),
            complete: absent.length === 0,
            capabilities: caps,
            /* 自述的读法（防下游把「不完备」读成「坏了」）：
             *   缺能力 ⇒ 对应出口报 unavailable；**其余出口照常可用**（降级是逐出口的）。 */
            note: '缺能力只影响对应出口（该出口报 unavailable）；本面不因缺一格而整体失效'
        };
    }

    function line(sources) {
        const d = describe(sources);
        if (d.complete) return '记忆工具面 v' + API_VERSION + '：' + d.counts.total + ' 能力齐备';
        const miss = d.absentReasons.map((x) => x.name + '(' + x.reason + ')').join('、');
        return '记忆工具面 v' + API_VERSION + '：' + d.counts.present + '/' + d.counts.total
            + ' 在场；缺 ' + miss;
    }

    /** 自检：**幂等 + 只读面 + 六态齐 + 可序列化**，四条当场自证。 */
    function selfCheck(sources) {
        const d = describe(sources);
        /* ① 幂等：同一入参两次 describe 逐字相同（本模块无模块级可变状态）。 */
        const twice = JSON.stringify(d) === JSON.stringify(describe(sources));
        /* ② 只读面：导出名里**一个 mutating 名都没有**。 */
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply'];
        const names = Object.keys(api);
        const writeFaces = names.filter((n) => {
            const low = n.toLowerCase();
            return mutating.some((m) => low.indexOf(m) === 0);
        }).length;
        /* ③ 六态齐（词表必须完整 —— 少一态就意味着某类处境无处安放）。
         *   [v3.332.0 · M4-O4] 五态 → 六态：canceled 与 empty/partial 都不同形，
         *   长度判据从写死 5 改为对齐词表自身（拆掉一态仍会转 false，负控制不受影响）。 */
        const statesComplete = STATES.length === STATE_LABEL_KEYS.length
            && STATE_LABEL_KEYS.every((s) => STATES.indexOf(s) >= 0);
        /* ④ 可序列化：信封是纯 JSON 面（无函数 / 无循环引用）。 */
        let serializable = true;
        try {
            const probe = envelope('queryEvidence', 'unavailable', { reason: 'self-check' });
            serializable = JSON.parse(JSON.stringify(probe)).state === 'unavailable';
        } catch (_e) { serializable = false; }
        return {
            ok: twice && writeFaces === 0 && statesComplete && serializable,
            deterministic: twice,
            writeFaces: writeFaces,
            statesComplete: statesComplete,
            serializable: serializable,
            capabilities: d.counts
        };
    }

    const api = {
        TOOLS_VERSION: TOOLS_VERSION,
        API_VERSION: API_VERSION,
        KIND: KIND,
        STATES: STATES,
        STATE_LABEL: STATE_LABEL,
        CAPABILITIES: CAPABILITIES,
        describe: describe,
        line: line,
        selfCheck: selfCheck,
        queryEvidence: queryEvidence,
        queryEvidenceAsync: queryEvidenceAsync,
        getContinuityPack: getContinuityPack,
        previewFactAdmission: previewFactAdmission,
        explainRecall: explainRecall,
        getKnowledgeBoundary: getKnowledgeBoundary
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaMemoryTools = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
