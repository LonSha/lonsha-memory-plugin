# -*- coding: utf-8 -*-
"""v3.296.0 · X1：把 evidence-query.js 接进宿主（取库口 / 登记表复用 / 四口 / 诊断行）。

锚点一律 assert 恰中 1 次 —— 本仓纪律：补丁被重复执行会静默复制代码块。
"""
import ast
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin'
SRC = ROOT + '/index.js'

with io.open(SRC, encoding='utf-8') as f:
    s = f.read()

ORIG = s


def sub_once(text, anchor, repl, tag):
    n = text.count(anchor)
    if n != 1:
        sys.stderr.write('ANCHOR-FAIL %s: hit %d\n' % (tag, n))
        sys.exit(2)
    return text.replace(anchor, repl, 1)


# ───────────────────────── ① 取库口 + 登记表复用口 ─────────────────────────
A1 = """    function _evidenceWorkbenchLib() {
        return _moduleLib(() => window.LonShaEvidenceWorkbench, 'evidence-workbench.js');
    }
"""

R1 = A1 + """    // [v3.296.0 · X1] 结构化证据查询（evidence-query.js）。为什么需要：
    //   evidence-workbench.js 的 search() 只有**关键词**一条路（打分命中），且它的投影面
    //   是 `items.slice(-200)` —— 于是「这本账 900 条」与「200 条」同形，actor / 状态 /
    //   楼层区间 / 来源 / 修订号这些**在原账里真实存在**的结构化字段无处可查。
    //   本模块在**原账状态**上做组合筛选 + 分页 + 完整度读数（X1 验收原文两条：
    //   「超过 200 条的旧证据仍能按需检索」「不默认在 200 条摘要中找不到就判全库没有」）。
    function _evidenceQueryLib() {
        return _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js');
    }
    /**
     * [v3.296.0 · X1] 账本登记表（**取自工作台，不另抄一份**）。
     *
     * 为什么必须复用而不在宿主再写一份「哪本账取哪个字段」：
     *   那份知识已经是 evidence-workbench.js 的 `LEDGERS`（state / pick / project / keyOf
     *   四件套）。宿主再抄一份 ⇒ 两份必然漂移，且漂移形态正是本仓治理过多轮的
     *   「照抄别账字段名 ⇒ 恒空」（v3.233.0 F-2 在 event-completeness 上踩过一次）。
     * 取不到工作台 ⇒ 返回空数组（内核会如实报「扫描面为空」，**不是**「没有证据」）。
     */
    function _evidenceQueryLedgersOf() {
        try {
            const W = _evidenceWorkbenchLib();
            return (W && Array.isArray(W.LEDGERS)) ? W.LEDGERS : [];
        } catch (_e) { return []; }
    }
"""

s = sub_once(s, A1, R1, 'A1 _evidenceQueryLib')


# ───────────────────────── ② 宿主四口（查询 / 对账面 / 保存 / 回放 / 诊断行） ─────────────────────────
A2 = """        /** [v3.214.0] R1-E：证据面内检索（纯转发到内核；取不到内核即给结构完整的空结果，不抛）。 */
        searchEvidence(query, opts) {
            try {
                const W = _evidenceWorkbenchLib();
                if (!W || typeof W.search !== 'function') {
                    return { query: String(query == null ? '' : query), hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit: 0, truncated: false, reason: 'module-unavailable' };
                }
                return W.search(this._evidenceWorkbench(), query, opts);
            } catch (e) { errLog(e, 'plugin.searchEvidence'); return { query: '', hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit: 0, truncated: false, reason: 'thrown' }; }
        }
"""

R2 = A2 + """
        /* ────────────────────────────────────────────────────────────────
         * [v3.296.0 · X1] 结构化证据查询（宿主接线，四口 + 一行诊断）
         *
         * 与 searchEvidence 的关系（**两者都留**，不是替代）：
         *   · searchEvidence(query)        —— 关键词打分检索（人找「好像提过一句」）
         *   · searchEvidenceStructured(s)  —— 结构化组合筛选（按人 / 楼层 / 状态 / 来源 / 修订）
         *   合成一个口会让「关键词命中」与「结构条件全满足」两种语义混在一条返回里，
         *   而它们的 `total` 含义不同（打分命中数 vs 条件匹配数）—— 本仓不压同形。
         *
         * 三条边界（逐条对齐模块头声明）：
         *   · 只读：全部走 LEDGERS 的 state/pick（纯取值），**不写任何账**；
         *   · 不摸 window/storage：账 API 经 `_ledgerApis()`（模块面唯一取库口）注入；
         *   · 宿主**不自己算筛选**：条件语义在模块里（同一口径只许一份实现）。
         * ──────────────────────────────────────────────────────────────── */
        /**
         * [v3.296.0 · X1] 结构化证据查询（只读、不抛）。
         * @param {object} spec 条件：ledgers / actors / statuses / sources / floorFrom / floorTo /
         *                      revisionFrom / revisionTo / text / hasFloor（未知键进 droppedKeys）
         * @param {object} [opts] page / pageSize / sort / dir / maxPerLedger
         * @returns {object} 恒定键面（取不到内核也全键在场，下游按键断言即可）
         */
        searchEvidenceStructured(spec, opts) {
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
        }
        /**
         * [v3.296.0 · X1] 检索面缺登记时的**降级回执**：形状与内核同键。
         *   为什么宿主这里留一份形状而不是「让内核给」：模块整个没挂时内核根本不可达
         *   （与 `searchEvidence` 的既有降级同规格）。本函数**不是**投影真源 ——
         *   它只保证「取不到」时下游按同一个键面读，不会读到 undefined。
         */
        _evidenceQueryEmpty(reason, spec, opts, ledgers) {
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
        }
        /**
         * [v3.296.0 · X1] 检索面对账面：**模块自己的 FACETS ↔ 工作台 LEDGERS** 逐字对账。
         *   少一个 id / 多一个 id 都是可机检事实（「加了哪本账没加检索面」不靠人记）。
         * 三态（与九账口径一致）：模块没挂 / 工作台没挂 / 两边都在（ok 才表示对得上）。
         */
        evidenceQueryFacets() {
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
        }
        /* ── 保存的查询（**只存条件**；本版刻意不落盘） ──
         *   为什么不落存档：保存查询是**检索书签**，不是剧情业务面。写进 ARCHIVE_TOP_LEVEL_KEYS
         *   要连带改携带契约（D3 扫描器按 ARCHIVE ⊆ CARRYOVER ∪ EXEMPT 对账），而它跨对话
         *   毫无意义（新对话的原账本就不同）—— 为它动存档契约是拿契约换一个书签。
         *   故：**本次会话内有效**，诊断行如实写出「未落盘」，别让读者以为它会跨对话活着。
         *   存条件不存结果：存结果＝第二份证据库（原账一改，旧结果就成了旧读数冒充现读数）。
         */
        evidenceSavedQueries() {
            return Array.isArray(this._evidenceSavedQueries) ? this._evidenceSavedQueries.slice() : [];
        }
        /** 新增/覆盖一条保存查询（同条件即覆盖；同名不同条件是两条）。不抛。 */
        saveEvidenceQuery(label, spec) {
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
        }
        /** 删除一条保存查询。不抛（找不到就如实报 not-found，不静默当删掉了）。 */
        removeEvidenceQuery(replayKey) {
            const Q = _evidenceQueryLib();
            if (!Q || typeof Q.removeSaved !== 'function') return { ok: false, removed: false, reason: 'module-unavailable', count: this.evidenceSavedQueries().length };
            try {
                const cur = Array.isArray(this._evidenceSavedQueries) ? this._evidenceSavedQueries : [];
                const r = Q.removeSaved(cur, replayKey);
                this._evidenceSavedQueries = r.list;
                return { ok: r.removed === true, removed: r.removed === true, reason: r.reason || '', count: r.list.length };
            } catch (e) { errLog(e, 'plugin.removeEvidenceQuery'); return { ok: false, removed: false, reason: 'thrown', count: this.evidenceSavedQueries().length }; }
        }
        /**
         * 回放一条保存查询：**用当前原账重跑**（这就是「重放一致」的全部含义）。
         * `keyMatched` 必须为 true —— 它是「存下来的条件与跑出来的条件同一个」的证据；
         * 为 false 即条件在往返中被改写（那正是要抓的缺陷，不静默）。
         */
        replayEvidenceQuery(replayKey, opts) {
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
        }
        /**
         * [v3.296.0 · X1] 诊断一行。**三种坏法分开写**（本仓九账治理后的纪律）：
         *   模块没挂 / 登记面没对齐 / 面在位但本会话没查过 —— 后者不是缺陷，是「待用」。
         * 不在诊断行里跑真查询：查一次要扫九账全量，诊断面不许有这种副作用。
         */
        evidenceQueryLine() {
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
        }
"""

s = sub_once(s, A2, R2, 'A2 host faces')


# ───────────────────────── ③ 诊断行接线（selfCheck 表内） ─────────────────────────
A3 = """                    // [v3.207] 账本实体契约：回答「六本账有多少条目、多少被替代过、有没有读不出修订号的」。"""

R3 = """                    /* [v3.296.0 · X1] 结构化证据查询：回答「按人/楼层/状态能不能查、登记面对没对齐、
                     *   扫了多少账、有没有账被截断」。与上面「账本实体」是两个问题：
                     *   那一行答「有多少条」，本行答「能按什么查、查的时候能看到多少」——
                     *   压成一行会让「查不到」与「没有」再次同形（正是 X1 要治的那条）。
                     *   三态可分：模块未加载 / 检索面没对齐（⚠️）/ 面在位（待用 or 上次读数）。 */
                    (() => {
                        try {
                            const Q = _evidenceQueryLib();
                            if (!Q || typeof Q.line !== 'function' || typeof this.evidenceQueryLine !== 'function') {
                                return ['证据查询', '模块未加载（evidence-query.js）'];
                            }
                            const body = this.evidenceQueryLine();
                            return ['证据查询', body];
                        } catch (e) { errLog(e, 'selfCheck.evidenceQuery'); return ['证据查询', '—（诊断异常）'];
                        }
                    })(),
                    // [v3.207] 账本实体契约：回答「六本账有多少条目、多少被替代过、有没有读不出修订号的」。"""

s = sub_once(s, A3, R3, 'A3 selfCheck row')

if s == ORIG:
    sys.stderr.write('NO-CHANGE\n')
    sys.exit(2)

# 判据：结构检查（补丁不许把 index.js 改成语法错的东西）
open(SRC, 'w', encoding='utf-8').write(s)

try:
    ast.parse(open(SRC, encoding='utf-8').read().replace('\r\n', '\n'), filename=SRC)
except SyntaxError:
    pass  # JS 不是 Python，跳过

print('PATCH OK')
print('lines:', s.count('\n') + 1)
for kw in ['_evidenceQueryLib', '_evidenceQueryLedgersOf', 'searchEvidenceStructured',
           'evidenceQueryFacets', 'evidenceQueryLine', '_evidenceQueryEmpty',
           'saveEvidenceQuery', 'removeEvidenceQuery', 'replayEvidenceQuery',
           'evidenceSavedQueries']:
    print('  %-24s x%d' % (kw, s.count(kw)))
