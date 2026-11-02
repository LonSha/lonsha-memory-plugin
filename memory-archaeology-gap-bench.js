/* ============================================================
 * memory-archaeology-gap-bench.js — [L9-X3 · 第九期规划] → [L13-X4 · v3.441.0 接产品]
 * 记忆考古与证据缺口工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   从残缺线索、互相矛盾的记录与证据空缺出发，构建考古线索树：
 *     - 明确区分四种状态：KNOWN (已知事实), UNKNOWN (已知缺口/待探索),
 *       HYPOTHESIS (推测假设), FALSE_LEAD (已证伪线索)
 *     - "未找到" 绝不被系统自动断言为 "从未发生"
 *     - FALSE_LEAD 作为探索路径被保留回溯，但严格禁止作为有效事实注入正史
 *
 * 【v3.441.0 · L13-X4 补的是什么（修前实测）】
 *   本模块在 `manifest.extra_js` 第 176 项登记、真被加载、`tests/v3385` 单测绿，
 *   而 `module_consumption_ledger` 里 `prod_call_sites = 0` —— 产品端一次都没调用。
 *   且它的能力只到「手工造线索树 + 单条准入」：**没有任何一面回答「我这些结论里哪些证据薄」**。
 *   计划点名的三档成因（`no-source` / `source-lost` / `contradicted`）此前一处都没有，
 *   于是「这条事实可不可信」在面板上只剩「有值 / 没值」一种读数 —— 而「没值」是被当
 *   「没有这个事实」还是「没记过」读，谁也说不清。
 *
 * 【X4 的判定口径（三档 + 两布尔，绝不压成一档）】
 *   · `no-source`    从没证据：证据文本为空，且历史里也没有带来源的登记事件；
 *   · `source-lost`  证据被删/裁：账上**写着**证据引用，但它在当前正文里已经找不到；
 *   · `contradicted` 证据互相矛盾：同主语在未决矛盾账里存在多版本（ConflictBook）；
 *   · 「判不了」不是第四种成因，而是**两个布尔**：`sourceChecked` / `conflictChecked`。
 *     判据侧与面板都只准按这两个布尔说「查过没有」，不许把「没查」写成「没有」。
 *     （本仓反复治过这一类：把「我们没记过」读成「确实不存在」。）
 *
 * 【为什么 `causes` 是数组而 `cause` 只取一条】
 *   一条事实可以同时「从没证据」且「与别的版本矛盾」。把两者合成一个「缺证据」
 *   正是计划明令禁止的形态。故：`causes` 保留**全部命中**（去重、按严重度排序），
 *   `cause` 只取最严重的一条当**主因**用于排序与徽章；两者都进读数，谁也没被吞。
 *
 * 【本模块**不做**什么（边界）】
 *   · 不写任何账、不改 origin、不删条目：`auditGaps` 是纯读，`downgradePayload`
 *     只出**载荷**（`writesNothing: true`），真落笔仍走既有 owner
 *     （`fact-version.setOrigin` 与 `DeltaBook.add`）——在这里再开一个写入口就是第二套事实账；
 *   · 不猜证据：没有「一键补全」「自动补一条来源」。缺就是缺；
 *   · 不摸 window / storage：事实与矛盾都由调用方（宿主）传进来，便于单测与移植。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.MemoryArchaeologyGapBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** 内核结构版本。改判定口径即升，宿主诊断行会读它。 */
    const GAP_VERSION = 1;

    const CLUE_STATUS = Object.freeze({
        KNOWN: 'known',
        UNKNOWN_GAP: 'unknown_gap',
        HYPOTHESIS: 'hypothesis',
        FALSE_LEAD: 'false_lead'
    });

    /**
     * 三档缺口成因。**穷尽且互不同形** —— 面板逐档分列，读数逐档计数。
     * `undecided` 是**主因格里的兜底**（一条都没命中时用），不是第四种成因：
     * 它表示「该判而判不了」，靠 `sourceChecked` / `conflictChecked` 说清是哪一侧没查。
     */
    const GAP_CAUSES = Object.freeze({
        NO_SOURCE: 'no-source',
        SOURCE_LOST: 'source-lost',
        CONTRADICTED: 'contradicted',
        UNDECIDED: 'undecided'
    });

    /**
     * 严重度：数字只用于**排序**，不进任何对外读数（本仓纪律：不把可信度做成数值条）。
     * 矛盾 > 证据失效 > 从没证据 > 判不了 —— 理由：矛盾是「两条都自称真」，误导最重；
     * 「证据丢了」是曾经有过；「从没证据」是从来没记；「判不了」是我们没查。
     */
    const GAP_SEVERITY = Object.freeze({
        'contradicted': 3,
        'source-lost': 2,
        'no-source': 1,
        'undecided': 0
    });

    /** 默认「证据薄」阈值：证据计数 <= 该值即入盘。1 ⇒ 0 条与 1 条都算薄。 */
    const THIN_THRESHOLD_DEFAULT = 1;

    function str(v, cap) {
        const s = (v == null) ? '' : String(v);
        return cap ? s.slice(0, cap) : s;
    }
    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    /* ---------------- 既有三出口（v3385 判据按它们断言，一字不动） ---------------- */

    function createArchaeologyRoute(rootGoal, initialClues = []) {
        const clues = (Array.isArray(initialClues) ? initialClues : []).map(c => ({
            id: c.id || `clue_${Math.random().toString(36).slice(2, 7)}`,
            title: String(c.title || '').trim(),
            status: Object.values(CLUE_STATUS).includes(c.status) ? c.status : CLUE_STATUS.UNKNOWN_GAP,
            evidenceIds: Array.isArray(c.evidenceIds) ? c.evidenceIds : [],
            notes: c.notes || ''
        }));

        return {
            routeId: `arch_route_${Date.now()}`,
            rootGoal: String(rootGoal || '').trim(),
            clues,
            createdAt: Date.now()
        };
    }

    function verifyClueAdmission(clue) {
        if (!clue) return { allowed: false, reason: 'nil_clue' };
        if (clue.status === CLUE_STATUS.FALSE_LEAD) {
            return {
                allowed: false,
                reason: 'false_lead_strictly_forbidden_from_canon'
            };
        }
        if (clue.status === CLUE_STATUS.KNOWN && clue.evidenceIds.length > 0) {
            return {
                allowed: true,
                reason: 'verified_known_fact'
            };
        }
        return {
            allowed: false,
            reason: 'unverified_gap_or_hypothesis'
        };
    }

    /* ---------------- v3.441.0 · X4 新增：证据缺口盘点 ---------------- */

    /**
     * 一条事实的**证据计数**。
     *   为什么不是「有 evidence 字段就是 1 条」：本仓事实账里 `evidence` 常是正文片段
     *   （`extract` 落笔时写 storyTime），而**来源**在 history 的 assert 事件里。
     *   两处都算凭据，缺任一条就少一条 —— 单看一个字段会把「有来源无片段」误判成没证据。
     */
    function evidenceCountOf(fact) {
        let n = 0;
        if (str(fact && fact.evidence).trim()) n += 1;
        const hist = Array.isArray(fact && fact.history) ? fact.history : [];
        for (const e of hist) {
            if (e && str(e.action) === 'assert' && str(e.source).trim()) n += 1;
        }
        return n;
    }

    /** 同主语判等：大小写与空白归一（「张三 」「张三」是同一个人，不该各算一档）。 */
    function subjectKey(s) {
        return str(s).trim().replace(/\s+/g, ' ').toLowerCase();
    }

    /**
     * 证据缺口盘点（**纯读，不写任何账**）。
     *
     * input:
     *   facts              事实账的条目数组（fact-version 的 `facts`，逐条 copyFact 形态）
     *   conflicts          未决矛盾账的条目数组（ConflictBook 的 `conflicts`）
     *   conflictsAvailable 矛盾账**源在不在**。默认按「conflicts 是数组」推断；
     *                      显式传 false 表示「宿主根本没有这本账」—— 那时
     *                      `conflictChecked` 一律 false，绝不当「查过且没矛盾」。
     * opts:
     *   thinThreshold      证据数 <= 该值即入盘（默认 1）
     *   resolveSource      (evidenceRef) => true | false | null
     *                        true  = 这条引用现在还能在正文里找到；
     *                        false = 找不到（被删/被裁）⇒ source-lost；
     *                        null / 不传 = **判不了** ⇒ sourceChecked=false。
     *                      传 null（而不是让它默认 false）是本模块最要紧的一条：
     *                      默认 false 会把「没人核验过」写成「证据丢了」。
     *
     * 返回 { ok, version, thin, counts, hitCounts, threshold, checked, degraded, writesNothing, reason }
     *   counts    按**主因**计数（一条事实只进一格，故总和 = thin 条数）
     *   hitCounts 按**命中**计数（多因条目在多格都出现，故总和可 > thin 条数）
     *   两张表都出，是因为「分列」与「不重复计」是两件事：只看 counts 会漏掉「这条也矛盾」，
     *   只看 hitCounts 会以为总条数变多了。
     */
    function auditGaps(input, opts) {
        const i = (input && typeof input === 'object') ? input : {};
        const o = (opts && typeof opts === 'object') ? opts : {};
        const facts = Array.isArray(i.facts) ? i.facts : [];
        const conflicts = Array.isArray(i.conflicts) ? i.conflicts : [];
        const conflictsAvailable = (i.conflictsAvailable === true)
            || (i.conflictsAvailable !== false && Array.isArray(i.conflicts));
        const thinThreshold = Number.isFinite(Number(o.thinThreshold))
            ? Number(o.thinThreshold) : THIN_THRESHOLD_DEFAULT;
        const resolveSource = (typeof o.resolveSource === 'function') ? o.resolveSource : null;

        /* 矛盾主语集合。它只装**主语**，不装结论 —— 本面回答的是「这一格有没有对立版本」，
         *   不是「谁对谁错」（那是 fact-lifecycle / 裁决面的职责）。 */
        const conflictSubjects = new Set();
        for (const c of conflicts) {
            if (!c || typeof c !== 'object') continue;
            const k = subjectKey(c.subject);
            if (k) conflictSubjects.add(k);
        }

        const thin = [];
        const counts = {
            'no-source': 0, 'source-lost': 0, 'contradicted': 0, 'undecided': 0
        };
        const hitCounts = {
            'no-source': 0, 'source-lost': 0, 'contradicted': 0, 'undecided': 0
        };
        let scanned = 0, skippedRevoked = 0, skippedMalformed = 0, thick = 0;

        for (const f of facts) {
            if (!f || typeof f !== 'object') { skippedMalformed += 1; continue; }
            /* 已撤销的事实不进缺口盘：撤销本身就是一次处置，把它列成「证据薄」会催人做
             *   第二遍处置。但**计数单列**（skippedRevoked）—— 静默跳过等于把它们藏了。 */
            if (f.revoked === true) { skippedRevoked += 1; continue; }
            scanned += 1;
            const evCount = evidenceCountOf(f);
            if (evCount > thinThreshold) { thick += 1; continue; }

            const evRef = str(f.evidence).trim();
            const causes = [];
            let sourceChecked = false;
            let conflictChecked = false;

            /* ---- 侧①：证据引用在不在 ---- */
            if (!evRef) {
                /* 没有引用 ⇒ 从没证据。这一格**不需要** resolveSource 也判得了。 */
                causes.push(GAP_CAUSES.NO_SOURCE);
            } else if (resolveSource) {
                let r = null;
                try { r = resolveSource(evRef); } catch (_e) { r = null; }
                if (r === true) sourceChecked = true;       /* 找到了：不是缺口 */
                else if (r === false) { sourceChecked = true; causes.push(GAP_CAUSES.SOURCE_LOST); }
                /* r === null ⇒ 核验不了：sourceChecked 留 false，**不**凑一档 */
            }

            /* ---- 侧②：这一格有没有对立版本 ---- */
            const sk = subjectKey(f.subject);
            if (conflictsAvailable) {
                conflictChecked = true;
                if (sk && conflictSubjects.has(sk)) causes.push(GAP_CAUSES.CONTRADICTED);
            }

            /* 一条都没命中 ⇒ 主因格写 undecided，并用两个布尔说清是哪一侧没查。
             *   这里**不**把 undecided 藏起来，面板才能「有据地」显示「判不了」。 */
            let cause = '';
            if (causes.length) {
                let best = causes[0];
                for (const c of causes) {
                    if (GAP_SEVERITY[c] > GAP_SEVERITY[best]) best = c;
                }
                cause = best;
            } else {
                cause = GAP_CAUSES.UNDECIDED;
                causes.push(GAP_CAUSES.UNDECIDED);
            }
            /* 去重 + 按严重度降序（同严重度保持插入序，便于判据稳定比对） */
            const uniq = [];
            for (const c of causes) if (uniq.indexOf(c) < 0) uniq.push(c);
            uniq.sort((a, b) => GAP_SEVERITY[b] - GAP_SEVERITY[a]);

            counts[cause] += 1;
            for (const c of uniq) hitCounts[c] += 1;

            thin.push({
                factId: str(f.id, 48),
                subject: str(f.subject, 40),
                predicate: str(f.predicate, 40),
                value: str(f.value, 120),
                origin: str(f.origin, 20),
                floor: num(f.floor),
                evidenceCount: evCount,
                cause: cause,
                causes: uniq,
                severity: GAP_SEVERITY[cause],
                sourceChecked: sourceChecked,
                conflictChecked: conflictChecked,
                /* 为什么这一格被判成这样 —— 一句话，逐档不同形，面板直接显示。
                 *   ★ 不许写成三档共用同一句话：那正是「合成一个缺证据」的软形态。 */
                note: (function () {
                    if (cause === GAP_CAUSES.CONTRADICTED) return '同主语在未决矛盾账里有多版本（证据互相矛盾）';
                    if (cause === GAP_CAUSES.SOURCE_LOST) return '账上写着证据引用，但在当前正文里已找不到（被删或被裁）';
                    if (cause === GAP_CAUSES.NO_SOURCE) return '既没有证据引用，历史里也没有带来源的登记（从没证据）';
                    if (!sourceChecked && conflictChecked) return '来源侧无法核验（正文不可读）——判不了';
                    if (sourceChecked && !conflictChecked) return '矛盾账不在（这本账没装上）——判不了';
                    return '来源与矛盾两侧都判不了';
                })()
            });
        }

        /* 排序：严重度降序 → 楼层新的在前 → factId 升序（末键只为稳定，不含语义）。
         *   「新的在前」的理由：刚写进去就缺证的事实，比三卷前的更该先补。 */
        thin.sort((a, b) => {
            if (b.severity !== a.severity) return b.severity - a.severity;
            const fa = (a.floor == null) ? -1 : a.floor;
            const fb = (b.floor == null) ? -1 : b.floor;
            if (fb !== fa) return fb - fa;
            return a.factId < b.factId ? -1 : (a.factId > b.factId ? 1 : 0);
        });

        const degraded = skippedMalformed > 0;
        return {
            ok: true,
            version: GAP_VERSION,
            thin: thin,
            counts: counts,
            hitCounts: hitCounts,
            threshold: thinThreshold,
            checked: { source: !!resolveSource, conflict: conflictsAvailable },
            scanned: scanned,
            thick: thick,
            skippedRevoked: skippedRevoked,
            skippedMalformed: skippedMalformed,
            /* 只读自证：本函数不持有任何账，返回体里也没有可写回的东西。 */
            writesNothing: true,
            degraded: degraded,
            reason: thin.length ? (degraded ? 'degraded' : '') : 'empty'
        };
    }

    /**
     * 「降级为推测」的**载荷**（内核不落笔）。
     *   为什么内核只出载荷：真落笔要走既有两个 owner —— `fact-version.setOrigin`（改可信来源）
     *   与 `DeltaBook.add(..., 'uncertain', floor)`（人读侧留痕，deltas 视图看得到）。
     *   在这里直接改状态就等于第二套事实账，而这正是本仓治过多次的形态。
     *
     * 返回 { ok, writesNothing, factId, fromOrigin, toOrigin, deltaSummary, deltaStatus, reason }
     */
    function downgradePayload(fact, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const f = (fact && typeof fact === 'object') ? fact : null;
        if (!f) return { ok: false, writesNothing: true, reason: 'fact-required' };
        const id = str(f.id, 48);
        if (!id) return { ok: false, writesNothing: true, reason: 'fact-id-required' };
        const from = str(f.origin, 20) || 'stated';
        if (from === 'inferred') {
            return {
                ok: true, writesNothing: true, factId: id, fromOrigin: from, toOrigin: 'inferred',
                deltaSummary: '', deltaStatus: '', reason: 'already-inferred'
            };
        }
        /* 人读一句话：主语 + 谓词 + 值，再加「原判据降级」。
         *   长度按 DeltaBook 的 150 字上限截，**不**在这里再定一个上限（两处会漂）。 */
        const subj = str(f.subject, 40).trim() || '（未署名）';
        const pred = str(f.predicate, 40).trim() || '（无谓词）';
        const val = str(f.value, 120).trim();
        const why = str(o.reason, 40).trim() || '证据薄';
        const deltaSummary = ('（' + subj + ' · ' + pred + '）' + val + ' —— 由「事实」降级为推测：' + why).slice(0, 150);
        return {
            ok: true,
            writesNothing: true,
            factId: id,
            fromOrigin: from,
            toOrigin: 'inferred',
            /* 信任度由调用方从账侧取（`originTrustOf`），内核不抄一份门槛表。 */
            deltaSummary: deltaSummary,
            deltaStatus: 'uncertain',
            reason: ''
        };
    }

    /** 诊断一行（纯字符串，不抛）。三档分开念，判不了也念出来。 */
    function line(res) {
        try {
            if (!res || typeof res !== 'object') return '—（缺口面异常）';
            if (res.ok !== true) return '不可用 · ' + (res.reason || 'unknown');
            const c = res.counts || {};
            const parts = ['证据薄 ' + ((res.thin && res.thin.length) || 0) + ' 条'];
            parts.push('从没证据 ' + (c['no-source'] || 0));
            parts.push('证据失效 ' + (c['source-lost'] || 0));
            parts.push('证据矛盾 ' + (c['contradicted'] || 0));
            if (c['undecided']) parts.push('判不了 ' + c['undecided']);
            if (res.skippedRevoked) parts.push('已撤销未盘 ' + res.skippedRevoked);
            const chk = res.checked || {};
            if (!chk.source) parts.push('来源侧未核验');
            if (!chk.conflict) parts.push('矛盾账不在');
            return parts.join(' · ');
        } catch (_e) { return '—（缺口面异常）'; }
    }

    return {
        GAP_VERSION,
        CLUE_STATUS, GAP_CAUSES, GAP_SEVERITY, THIN_THRESHOLD_DEFAULT,
        createArchaeologyRoute,
        verifyClueAdmission,
        evidenceCountOf,
        auditGaps,
        downgradePayload,
        line
    };
}));