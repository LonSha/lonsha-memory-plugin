/**
 * resolution-ladder.js — [v3.356.0 · M6-O3] 可展开的多分辨率记忆：压缩不再只剩结论
 *   纯函数 IIFE，零依赖、零联网、零写回。
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓已有压缩面，但压缩之后**只剩结论**：
 *     · stm-ltm.js / node-rollup.js —— 把长内容压成摘要/节点；
 *     · unified-recall.js           —— 多源候选的融合排序；
 *     · material-pack.js             —— 按任务挑材料。
 *   它们共同缺的一件事：**压掉的东西还能不能回来**。
 *   用户看到「那次筹展最后没办成」这一句结论时，往往真正想要的是
 *   「他当时到底说了什么」—— 而既有面里，被压掉的中间层**没有回指**，
 *   于是只剩两种结局：要么永远给结论（用户读不到原话），
 *   要么把原文整段塞回去（注入长度炸掉，正是「永远增加注入长度」的病）。
 *   后果是**读数绿、体验空**：压缩率上去了，可核查性没了。
 *
 * 【本模块的职责（只做分辨率阶梯与可逆展开协议，不复制正文）】
 *   同一件事保留三个分辨率：
 *     · overview —— 概览（压缩结论，一句话级）
 *     · skeleton —— 转折骨架（事情怎么走的，哪几步）
 *     · verbatim —— 可定位原话（引用 + 定位信息，**正文不在这里**）
 *   三层用**引用**（不是重复正文）连接：
 *     · 派生层（overview / skeleton）**必须带** parentId + sourceRef（能回溯到原文）；
 *     · 展开时**按需**从原文取回，而不是把三层一起塞进注入面。
 *
 * 【四条硬纪律（每条都对应一次真会出事的假读数）】
 *   1. **缺源 ≠ 仅未展开**：
 *      「有原文但还没展开」是 `unexpanded`（可以展开），
 *      「原文已经没了」是 `no-source`（**不可展开**）——
 *      两者处置相反（前者该去取，后者在修数据），压平成一个「没有」就都丢了。
 *   2. **展开不改正文**：展开只产出**定位与原文**，绝不生成/改写/摘要化原话。
 *      一旦在展开时顺手「润色」，回读就与原文不一致，可核查性当场作废。
 *   3. **层级不互相覆盖**：改高层**不自动改**低层（派生层随来源修订由调用方显式触发）。
 *      自动级联改写会让「第 100 楼写下的原话」被后来的总结改写掉。
 *   4. **引用必须双键**：verbatim 层每条必须有 source+refId；
 *      单键引用回查不到任何东西，等于宣称「有原话」而无法核对。
 *
 * 【本模块不做什么（边界）】
 *   · 不存原文（原文永远在原 owner：摘要/事实/事件/楼层账里）。
 *   · 不提高任何注入长度上限（预算归注入路由，本模块只给「选哪层」）。
 *   · 不重做 stm-ltm / node-rollup 的压缩判定（那些模块照旧是压缩真源）。
 *   · 不读宿主 `this`、不碰 storage、不联网。
 *
 * 挂 window.LonShaResolutionLadder，供 index.js 召回组织 / 材料面 / 诊断面使用。
 */
(function (root) {
    'use strict';

    const RL_VERSION = 1;
    const RL_KIND = 'resolution_ladder';

    /** 三个分辨率（★ 顺序即粒度：由粗到细）。 */
    const LEVELS = Object.freeze(['overview', 'skeleton', 'verbatim']);
    /** 展开状态四态（★ unexpanded 与 no-source 刻意不压平）。 */
    const EXPAND_STATES = Object.freeze({
        /** 已展开（有原文可取）。 */
        READY: 'ready',
        /** 有源但**尚未展开**（可以去取）。 */
        UNEXPANDED: 'unexpanded',
        /** 源已不在（**不可展开**，要修数据）。 */
        NO_SOURCE: 'no-source',
        /** 层级本身不存在（没这一层）。 */
        ABSENT: 'absent',
    });
    /** 归因（每条可读，不许用 'error' 一锅装）。 */
    const RL_REASONS = Object.freeze({
        OK: 'ok',
        NOT_OBJECT: 'not-object',
        NO_ID: 'no-id',
        NOT_FOUND: 'not-found',
        BAD_SHAPE: 'bad-shape',
        NO_SOURCE: 'no-source',
        DUP_REF: 'dup-ref',
        OVER_LIMIT: 'over-limit',
        NO_RESOLUTION: 'no-resolution',
    });

    const LADDER_LIMITS = Object.freeze({
        /** 单个条目最多层数。 */
        levelsPerEntry: 3,
        /** 单层最多条目。 */
        itemsPerLevel: 20,
        /** 单条 verbatim 引用摘录长度。 */
        quote: 240,
        /** id 长度。 */
        id: 80,
    });

    /* ---------- 基础归一 ---------- */
    function str(v) { return String(v == null ? '' : v).trim(); }
    function capStr(v, n) {
        const s = str(v);
        return s.length > n ? s.slice(0, n) : s;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * 归一一条 verbatim 引用。
     * ★ 双键纪律：source + refId 齐备才算「可回查」；
     *   缺任一键 ⇒ readable:false（宣称「有原话」而回查不到，是最坏的一种错读）。
     * ★ 本层**不改正文**：只存定位信息与摘录，展开时由调用方回原 owner 取全文。
     */
    function normalizeVerbatim(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return { readable: false, source: '', refId: '', floor: null, quote: '', reason: RL_REASONS.NOT_OBJECT };
        const source = capStr(o.source, 60);
        const refId = capStr(o.refId, 80);
        const quote = capStr(o.quote, LADDER_LIMITS.quote);
        const readable = !!(source && refId);
        return {
            readable: readable,
            source: source,
            refId: refId,
            floor: numOrNull(o.floor),
            quote: quote,
            /** 定位标记：卷/章/段等（可空，空不等于不可定位）。 */
            locator: capStr(o.locator, 80),
            reason: readable ? RL_REASONS.OK : RL_REASONS.NO_SOURCE,
        };
    }

    /**
     * 归一一个阶梯条目（一个「事」的三层）。
     * ★ overview / skeleton 是**派生层**：必须带 parentId（指回原文 owner 的键）
     *   与 sourceRef（指回原文的引用）。没有这两样的派生层是**孤儿摘要** ——
     *   读起来像结论，但回查不到出处，等于凭空断言。
     */
    function normalizeEntry(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return null;
        const id = capStr(o.id, LADDER_LIMITS.id);
        if (!id) return null;
        /* ★ overview 有**两种合法形态**，两种都要认：
         *   ① 扁平形态 { overview:'文本', parentId, sourceRef }；
         *   ② 嵌套形态 { overview:{ text, parentId, sourceRef } }。
         *   首版只认扁平形态，于是嵌套形态的文本被当对象 stringify、
         *   双键被读成空 —— 派生层一律判成「孤儿」，明明有出处却读不出。
         *   两种形态都归一到同一形状；嵌套形态优先（字段更全）。 */
        const ovRaw = (o.overview && typeof o.overview === 'object' && !Array.isArray(o.overview)) ? o.overview : null;
        const overview = {
            text: capStr(ovRaw ? ovRaw.text : o.overview, LADDER_LIMITS.quote),
            parentId: capStr(ovRaw ? ovRaw.parentId : o.parentId, LADDER_LIMITS.id),
            sourceRef: capStr(ovRaw ? ovRaw.sourceRef : o.sourceRef, LADDER_LIMITS.id),
        };
        const skeletonIn = Array.isArray(o.skeleton) ? o.skeleton : [];
        const skeleton = [];
        for (const s of skeletonIn.slice(0, LADDER_LIMITS.itemsPerLevel)) {
            if (s && typeof s === 'object' && !Array.isArray(s)) {
                skeleton.push({
                    step: capStr(s.step, LADDER_LIMITS.quote),
                    floor: numOrNull(s.floor),
                    sourceRef: capStr(s.sourceRef, LADDER_LIMITS.id),
                });
            } else if (s != null) {
                skeleton.push({ step: capStr(s, LADDER_LIMITS.quote), floor: null, sourceRef: '' });
            }
        }
        const verbatimIn = Array.isArray(o.verbatim) ? o.verbatim : [];
        const verbatim = [];
        const seen = {};
        for (const v of verbatimIn.slice(0, LADDER_LIMITS.itemsPerLevel)) {
            const n = normalizeVerbatim(v);
            if (!n.readable) continue;
            const k = n.source + '\u0001' + n.refId;
            if (seen[k]) continue;   /* ★ 同源同 refId 只留一条：重复引用不是更多原话。 */
            seen[k] = 1;
            verbatim.push(n);
        }
        return {
            id: id,
            title: capStr(o.title, LADDER_LIMITS.quote),
            overview: overview,
            skeleton: skeleton,
            verbatim: verbatim,
            /** 该条目是否还持有任何可回查的源。 */
            hasSource: !!(verbatim.length || (overview.sourceRef && overview.parentId)),
        };
    }
    function normalizeEntries(raw) {
        const out = [];
        if (!Array.isArray(raw)) return out;
        for (const e of raw) {
            const n = normalizeEntry(e);
            if (n) out.push(n);
        }
        return out;
    }
    function findEntry(list, id) {
        const want = str(id);
        for (const e of normalizeEntries(list)) if (e.id === want) return e;
        return null;
    }

    /* ---------- 展开协议（★ 可逆，且缺源与未展开不压平） ---------- */
    /**
     * 展开一个条目到指定分辨率。
     *
     * @param {Array} rawList 条目列表
     * @param {string} id 条目 id
     * @param {string} level 目标分辨率（overview / skeleton / verbatim）
     * @param {object} [opts] { sourceExists?: (v)=>boolean } —— 供调用方判断原文是否还在
     * @returns {object} { ok, state, level, content, missing, reason }
     */
    function expand(rawList, id, level, opts) {
        const e = findEntry(rawList, id);
        if (!e) return { ok: false, state: EXPAND_STATES.ABSENT, level: str(level), content: null, missing: [], reason: RL_REASONS.NOT_FOUND };
        const lv = str(level);
        if (LEVELS.indexOf(lv) < 0) return { ok: false, state: EXPAND_STATES.ABSENT, level: lv, content: null, missing: [], reason: RL_REASONS.NO_RESOLUTION };

        if (lv === 'overview') {
            if (!e.overview.text) return { ok: false, state: EXPAND_STATES.ABSENT, level: lv, content: null, missing: ['overview'], reason: RL_REASONS.NO_RESOLUTION };
            /* ★ 孤儿概览：没有 parentId + sourceRef 就回查不到出处 —— 如实标出来，不当作正常。 */
            const orphan = !(e.overview.parentId && e.overview.sourceRef);
            return {
                ok: true, state: EXPAND_STATES.READY, level: lv, orphan: orphan,
                content: { text: e.overview.text, parentId: e.overview.parentId, sourceRef: e.overview.sourceRef },
                missing: orphan ? ['source'] : [], reason: RL_REASONS.OK,
            };
        }
        if (lv === 'skeleton') {
            if (!e.skeleton.length) return { ok: false, state: EXPAND_STATES.ABSENT, level: lv, content: null, missing: ['skeleton'], reason: RL_REASONS.NO_RESOLUTION };
            const orphanSteps = e.skeleton.filter(function (s) { return !s.sourceRef; }).length;
            return {
                ok: true, state: EXPAND_STATES.READY, level: lv, orphan: orphanSteps > 0,
                content: { steps: e.skeleton },
                missing: orphanSteps ? ['source'] : [], reason: RL_REASONS.OK,
            };
        }
        /* verbatim：★ 关键分支 —— 有引用但原文不在了 ⇒ no-source（不可展开）；
         *   有引用且原文在 ⇒ ready（本次真取回，不改写正文）。 */
        if (!e.verbatim.length) {
            return { ok: false, state: EXPAND_STATES.ABSENT, level: lv, content: null, missing: ['verbatim'], reason: RL_REASONS.NO_RESOLUTION };
        }
        const options = (opts && typeof opts === 'object') ? opts : {};
        const sourceExists = typeof options.sourceExists === 'function' ? options.sourceExists : null;
        const items = [];
        const missing = [];
        for (const v of e.verbatim) {
            let body = null;
            if (sourceExists) {
                try { body = sourceExists(v); } catch (_e) { body = null; }
            }
            if (body == null || body === '') {
                missing.push(v.source + ':' + v.refId);
                items.push({ source: v.source, refId: v.refId, floor: v.floor, locator: v.locator, quote: v.quote, body: null, present: false });
            } else {
                items.push({ source: v.source, refId: v.refId, floor: v.floor, locator: v.locator, quote: v.quote, body: body, present: true });
            }
        }
        if (missing.length && missing.length === e.verbatim.length) {
            /* ★ 全部源都不在 ⇒ no-source（不可展开）。这与「有源但没展开」不同。 */
            return {
                ok: false, state: EXPAND_STATES.NO_SOURCE, level: lv, content: null,
                missing: missing, reason: RL_REASONS.NO_SOURCE,
            };
        }
        return {
            ok: true, state: EXPAND_STATES.READY, level: lv, orphan: false,
            content: { items: items }, missing: missing, reason: RL_REASONS.OK,
        };
    }

    /**
     * 某个条目的**可展开性**读数（不真正展开）。
     * ★ 用于「按预算选层」：先问「能不能展开」，再问「展开要多少」。
     */
    function expandability(rawList, id) {
        const e = findEntry(rawList, id);
        if (!e) return { ok: false, state: EXPAND_STATES.ABSENT, levels: [], reason: RL_REASONS.NOT_FOUND };
        const levels = [];
        if (e.overview.text) levels.push('overview');
        if (e.skeleton.length) levels.push('skeleton');
        if (e.verbatim.length) levels.push('verbatim');
        let state = EXPAND_STATES.ABSENT;
        if (levels.length) state = e.hasSource ? EXPAND_STATES.UNEXPANDED : EXPAND_STATES.NO_SOURCE;
        return { ok: true, state: state, levels: levels, reason: RL_REASONS.OK };
    }

    /**
     * 按预算选层（★ 本模块与注入预算链的唯一接口）。
     *   给定预算（以「条目数」计），从粗到细选层，保证**同一层优先**——
     *   混层会让读者在同一页里看到概览与原话却不知哪个是哪个。
     *
     * @param {Array} rawList
     * @param {number} budget 最大条目数
     * @returns {object} { ok, level, chosen, skipped, reason }
     */
    function selectByBudget(rawList, budget) {
        const entries = normalizeEntries(rawList);
        const cap = Math.max(0, Math.floor(numOrNull(budget) || 0));
        if (!entries.length) return { ok: false, level: 'overview', chosen: [], skipped: [], reason: RL_REASONS.NOT_FOUND };
        for (const lv of LEVELS) {
            const chosen = [];
            let used = 0;
            for (const e of entries) {
                const n = countItems(e, lv);
                if (!n) continue;
                if (used + n > cap) continue;
                chosen.push({ id: e.id, level: lv, items: n });
                used += n;
            }
            if (chosen.length) {
                const chosenIds = chosen.map(function (x) { return x.id; });
                const skipped = entries.filter(function (e) { return chosenIds.indexOf(e.id) < 0; }).map(function (e) { return e.id; });
                return { ok: true, level: lv, chosen: chosen, skipped: skipped, used: used, reason: RL_REASONS.OK };
            }
        }
        return { ok: false, level: 'overview', chosen: [], skipped: entries.map(function (e) { return e.id; }), reason: RL_REASONS.NO_RESOLUTION };
    }
    function countItems(e, lv) {
        if (lv === 'overview') return e.overview.text ? 1 : 0;
        if (lv === 'skeleton') return e.skeleton.length;
        return e.verbatim.length;
    }

    /**
     * 修订派生层（★ 显式触发，绝不自动级联）。
     *   改 overview / skeleton 时必须给出新的 parentId + sourceRef ——
     *   否则新的派生层就是孤儿摘要。
     */
    function reviseLevel(rawList, id, level, patch) {
        const arr = Array.isArray(rawList) ? rawList.slice() : [];
        const idx = arr.findIndex(function (x) { return x && typeof x === 'object' && str(x.id) === str(id); });
        if (idx < 0) return { ok: false, reason: RL_REASONS.NOT_FOUND, list: arr };
        const p = (patch && typeof patch === 'object') ? patch : {};
        const lv = str(level);
        const cur = arr[idx];
        let next;
        if (lv === 'overview') {
            const parentId = capStr(p.parentId != null ? p.parentId : (cur.overview && cur.overview.parentId), LADDER_LIMITS.id);
            const sourceRef = capStr(p.sourceRef != null ? p.sourceRef : (cur.overview && cur.overview.sourceRef), LADDER_LIMITS.id);
            if (!parentId || !sourceRef) return { ok: false, reason: RL_REASONS.NO_SOURCE, list: arr };
            next = Object.assign({}, cur, {
                overview: { text: capStr(p.text != null ? p.text : (cur.overview && cur.overview.text), LADDER_LIMITS.quote), parentId: parentId, sourceRef: sourceRef },
            });
        } else if (lv === 'skeleton') {
            const steps = Array.isArray(p.steps) ? p.steps : (cur.skeleton || []);
            next = Object.assign({}, cur, { skeleton: steps.slice(0, LADDER_LIMITS.itemsPerLevel) });
        } else if (lv === 'verbatim') {
            const v = normalizeVerbatim(p);
            if (!v.readable) return { ok: false, reason: RL_REASONS.NO_SOURCE, list: arr };
            next = Object.assign({}, cur, { verbatim: (cur.verbatim || []).concat([v]).slice(0, LADDER_LIMITS.itemsPerLevel) });
        } else {
            return { ok: false, reason: RL_REASONS.NO_RESOLUTION, list: arr };
        }
        const list = arr.slice();
        list[idx] = next;
        return { ok: true, reason: RL_REASONS.OK, list: list, entry: normalizeEntry(next) };
    }

    /* ---------- 读数 ---------- */
    /** 一行读数（诊断面）。 */
    function ladderLine(rawList) {
        try {
            const entries = normalizeEntries(rawList);
            if (!entries.length) return '暂无阶梯条目';
            let overview = 0, skeleton = 0, verbatim = 0, orphan = 0, noSource = 0;
            for (const e of entries) {
                if (e.overview.text) overview += 1;
                if (e.skeleton.length) skeleton += 1;
                if (e.verbatim.length) verbatim += 1;
                if (!e.hasSource) orphan += 1;
                const ab = expandability(entries, e.id);
                if (ab.state === EXPAND_STATES.NO_SOURCE) noSource += 1;
            }
            const parts = ['条目 ' + entries.length, '概览 ' + overview, '骨架 ' + skeleton, '原话 ' + verbatim];
            if (orphan) parts.push('无源 ' + orphan);
            if (noSource) parts.push('不可展开 ' + noSource);
            return parts.join(' · ');
        } catch (e) { return '—（阶梯账异常）'; }
    }
    /** 自检（供宿主诊断面与判据调用；返回结构恒定）。 */
    function selfCheck() {
        const problems = [];
        const base = [{
            id: 'e1',
            title: '筹展',
            overview: { text: '最后没办成', parentId: 'sum_1', sourceRef: 'sum_1' },
            skeleton: [{ step: '答应', floor: 10, sourceRef: 'ev_1' }, { step: '退出', floor: 30, sourceRef: 'ev_2' }],
            verbatim: [{ source: 'floor', refId: 'f_12', floor: 12, quote: '我答应去' }],
        }];
        const e = normalizeEntries(base);
        if (e.length !== 1) problems.push('归一失败');
        if (findEntry(base, 'e1') === null) problems.push('按 id 找不到条目');
        /* 展开 overview */
        const ov = expand(base, 'e1', 'overview');
        if (!ov.ok || ov.state !== EXPAND_STATES.READY) problems.push('概览展开失败');
        if (ov.orphan) problems.push('有双键的概览不得判孤儿');
        /* 展开 verbatim：源在 ⇒ ready */
        const vb = expand(base, 'e1', 'verbatim', { sourceExists: function () { return '原话正文'; } });
        if (!vb.ok || vb.state !== EXPAND_STATES.READY) problems.push('源在时应判 ready');
        if (!vb.content.items[0].present) problems.push('源在时必须标 present');
        /* ★ 源不在 ⇒ no-source（不可展开），**不是** unexpanded */
        const gone = expand(base, 'e1', 'verbatim', { sourceExists: function () { return null; } });
        if (gone.state !== EXPAND_STATES.NO_SOURCE) problems.push('源不在时必须判 no-source');
        if (gone.ok) problems.push('no-source 不得判 ok');
        /* 缺源与仅未展开不压平 */
        const ab = expandability(base, 'e1');
        if (ab.state !== EXPAND_STATES.UNEXPANDED) problems.push('可展开性应判 unexpanded');
        /* 双键缺一不可读 */
        if (normalizeVerbatim({ source: 'floor' }).readable !== false) problems.push('缺 refId 的原话必须判不可读');
        /* 同源重复只留一条 */
        const dup = normalizeEntry({ id: 'x', verbatim: [{ source: 'floor', refId: 'f1' }, { source: 'floor', refId: 'f1' }] });
        if (dup.verbatim.length !== 1) problems.push('同源重复原话必须去重');
        /* 孤儿概览要如实标出 */
        const orphan = expand([{ id: 'y', overview: { text: '有个结论' } }], 'y', 'overview');
        if (!orphan.orphan) problems.push('无双键的概览必须标 orphan');
        /* 修订派生层必须给双键 */
        const bad = reviseLevel(base, 'e1', 'overview', { text: '新结论', parentId: '', sourceRef: '' });
        if (bad.ok) problems.push('修订概览缺双键时必须被拒');
        return { ok: problems.length === 0, version: RL_VERSION, problems: problems };
    }

    const api = Object.freeze({
        normalizeVerbatim, normalizeEntry, normalizeEntries, findEntry,
        expand, expandability, selectByBudget, reviseLevel,
        ladderLine, selfCheck,
        LEVELS, EXPAND_STATES, RL_REASONS, LADDER_LIMITS,
        RL_VERSION, RL_KIND,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaResolutionLadder = api; } catch (_e) { /* ignore */ }
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));