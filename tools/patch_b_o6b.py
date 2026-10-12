#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o6.py — [v3.321.0 · B 包 M3-O6] 大型记忆库查询即时响应。

锚点纪律：先校验锚点命中次数（唯一），通过后统一写盘。
本版**不新增运行时模块**（改的是既有 evidence-query.js）。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin'
P = ROOT + '/evidence-query.js'
src = io.open(P, encoding='utf-8').read()
DRY = ('--dry' in sys.argv)


def check(s, cnt, tag):
    if src.count(s) != cnt:
        raise SystemExit('[o6] 锚点 %s 期望 %d 次，实测 %d：%r' % (tag, cnt, src.count(s), s[:80]))


# ══════════ 一、常量 ══════════
A_CONST = '    const MAX_SAVED_QUERIES = 50;'
check(A_CONST, 1, 'const-anchor')
C_CONST = A_CONST + r"""

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
    const QUERY_ASYNC_SHARD = 2000;"""

# ══════════ 二、查询版本 2 -> 3 ══════════
A_VER = '    const QUERY_VERSION = 2;'
check(A_VER, 1, 'version')
B_VER = '    const QUERY_VERSION = 3;'

# ══════════ 三、universeOf 扫描面记账 ══════════
A_COUNTS = ('        const counts = { ok: 0, empty: 0, absent: 0 };\n'
            '        let scanned = 0;')
check(A_COUNTS, 1, 'counts')
B_COUNTS = """        const counts = { ok: 0, empty: 0, absent: 0, skipped: 0 };
        let scanned = 0;
        /* [v3.321.0 · M3-O6] 账条件非空时只扫被点名的账（这是「不反复物化全部」的落点）。
         *   被跳过的账**必须可见**（state=skipped、reason=excluded-by-ledger-filter，
         *   且 total=null 表示「没扫 ⇒ 条数未知」）—— 否则「这本账被筛掉了」与
         *   「这本账不存在 / 是空的」在读数上同形，而三者处置相反。 */
        const only = (o.onlyLedgers instanceof Set) ? o.onlyLedgers
            : (Array.isArray(o.onlyLedgers)
                ? new Set(o.onlyLedgers.map((x) => text(x, 40)))
                : null);
        /* 逐账投影缓存：形状 {version, fp:{id:指纹}, rows:{id:[行]}}，由**宿主**持有。
         *   本模块不持久化、不自己 new 一份 —— 缓存归调用方（与「保存查询只存条件」同一纪律）。 */
        const cache = (o.projectionCache && typeof o.projectionCache === 'object'
            && Number(o.projectionCache.version) === PROJECTION_CACHE_VERSION) ? o.projectionCache : null;
        const skippedLedgers = [];
        let cacheHits = 0, cacheMisses = 0;"""

# ══════════ 四、账被条件排除：不扫，但可见 ══════════
A_FACET = "            if (!facet) { rec.reason = 'facet-missing'; ledgers[rec.id] = rec; counts.absent += 1; continue; }"
check(A_FACET, 1, 'facet-missing')
B_FACET = """            /* [v3.321.0 · M3-O6] 账条件点名了别的账 ⇒ 这一账**本次根本不扫**（不物化、不投影）。
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
""" + A_FACET

# ══════════ 五、逐账缓存命中 ══════════
A_KEPT = '            let kept = items;'
check(A_KEPT, 1, 'let-kept')
B_KEPT = """            /* [v3.321.0 · M3-O6] 逐账投影缓存命中：指纹一致 ⇒ 复用上次这一账的行。
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
""" + A_KEPT

# ══════════ 六、本账投影起点 ══════════
A_IDX = '            let idx = 0;'
check(A_IDX, 1, 'let-idx')
B_IDX = ('            const _rowStart = rows.length;   /* [v3.321.0 · M3-O6] 本账投影起点（供缓存写回切片） */\n'
         + A_IDX)

# ══════════ 七、缓存写回 + 返回扩展 ══════════
A_TAIL = ('            ledgers[rec.id] = rec;\n'
          '        }\n'
          '        return { rows: rows, ledgers: ledgers, counts: counts, scanned: scanned, specs: specs };')
check(A_TAIL, 1, 'uni-tail')
B_TAIL = """            /* [v3.321.0 · M3-O6] 写回本账投影（存**副本**：本次查询仍会就地写 _score，
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
            cache: { version: PROJECTION_CACHE_VERSION, enabled: !!cache, hits: cacheHits, misses: cacheMisses }
        };"""

# ══════════ 八、query 整段重写（抽出 assemble） ══════════
Q_HEAD = '    function query(host, spec, opts) {'
Q_TAIL = '        return out;\n    }\n'
i0 = src.index(Q_HEAD)
check(Q_HEAD, 1, 'query-head')
j0 = src.index(Q_TAIL, i0)
A_QUERY = src[i0:j0 + len(Q_TAIL)]
check(A_QUERY, 1, 'query-body')

B_QUERY = r"""    /**
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
                projectionCache: uni.cache || { version: PROJECTION_CACHE_VERSION, enabled: false, hits: 0, misses: 0 }
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
"""

# ══════════ 九、新增三件面 ══════════
A_PAGEOF = '    function pageOf(host, spec, page, pageSize, opts) {'
check(A_PAGEOF, 1, 'pageOf')
NEW_FNS = r"""    /* ── [v3.321.0 · M3-O6] 三件新增面：缓存指纹 / 轻索引 / 协作式查询 ── */
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
""" + A_PAGEOF

# ══════════ 十、导出 ══════════
A_EXP = '        universeOf, matchRow, query, pageOf,'
check(A_EXP, 1, 'export')
B_EXP = """        universeOf, matchRow, query, queryAsync, assemble, pageOf,
        ledgerFingerprint, buildIndex,
        PROJECTION_CACHE_VERSION, QUERY_ASYNC_SHARD,"""

PAIRS = [
    (A_CONST, C_CONST, 'const'),
    (A_VER, B_VER, 'version'),
    (A_COUNTS, B_COUNTS, 'counts'),
    (A_FACET, B_FACET, 'facet'),
    (A_KEPT, B_KEPT, 'kept'),
    (A_IDX, B_IDX, 'idx'),
    (A_TAIL, B_TAIL, 'tail'),
    (A_QUERY, B_QUERY, 'query'),
    (A_PAGEOF, NEW_FNS, 'pageOf'),
    (A_EXP, B_EXP, 'export'),
]
out = src
for a, b, tag in PAIRS:
    if out.count(a) != 1:
        raise SystemExit('[o6] 执行期锚点 %s 命中 %d 次（期望 1），未写盘' % (tag, out.count(a)))
    out = out.replace(a, b, 1)

if DRY:
    print('[o6] DRY：全部锚点唯一命中，未写盘')
    raise SystemExit(0)
io.open(P, 'w', encoding='utf-8', newline='\n').write(out)
print('[o6] wrote evidence-query.js')