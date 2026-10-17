/**
     * 建面:把一批条目收敛成**叙事层读数**(层分面 + 四方计数 + 有界)。
     *   立身之本:**一个字节都不落盘**(写库仍归宿主 index.js);层标注落在
     *   既有条目上(modality 字段),本模块只读判定。老数据无标注一律
     *   unspecified —— **不猜、不追溯重标**。
     */
    function build(items, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const inject = typeof o.normFact === 'function' ? o.normFact : null;
        const at = floorOf(o.at);
        const maxItems = (Number.isFinite(Number(o.maxItems)) && Number(o.maxItems) >= 1)
            ? Math.floor(Number(o.maxItems)) : MAX_ITEMS;
        const out = {
            kind: NL_KIND,
            version: NL_VERSION,
            at: at,
            atKnown: at !== null,
            items: [],
            byLayer: {},
            counts: {
                input: 0, used: 0, malformed: 0, noFloor: 0, offTime: 0,
                unspecified: 0, stated: 0, hinted: 0,
                reality: 0, dream: 0, hypothesis: 0, plan: 0, quote: 0,
                planPlanned: 0, planDone: 0, planLapsed: 0, planAwaitingEvent: 0
            },
            truncated: 0,
            malformedInput: false,
            /* ★ 立身之本:本模块**一个字节都不落盘**;写库仍归宿主。 */
            writesNothing: true,
            degraded: false
        };
        for (const m of MODALITIES) out.byLayer[m] = 0;
        out.byLayer[UNSPECIFIED] = 0;
        try {
            const list = Array.isArray(items) ? items : [];
            out.malformedInput = !Array.isArray(items) && items !== undefined && items !== null;
            out.counts.input = list.length;
            for (const raw of list) {
                if (out.counts.used >= maxItems) { out.truncated++; continue; }
                const it = itemOf(raw, inject, o);
                if (!it) { out.counts.malformed++; continue; }
                if (at !== null) {
                    if (it.floor === null) { out.counts.noFloor++; continue; }
                    if (it.floor > at) { out.counts.offTime++; continue; }
                }
                out.items.push(it);
                out.byLayer[it.modality] = (out.byLayer[it.modality] || 0) + 1;
                out.counts.used++;
                if (it.stated) out.counts.stated++; else out.counts.unspecified++;
                if (it.modality === 'reality') out.counts.reality++;
                else if (it.modality === 'dream') out.counts.dream++;
                else if (it.modality === 'hypothesis') out.counts.hypothesis++;
                else if (it.modality === 'quote') out.counts.quote++;
                else if (it.modality === 'plan') {
                    out.counts.plan++;
                    if (it.planState === 'done') out.counts.planDone++;
                    else if (it.planState === 'lapsed') out.counts.planLapsed++;
                    else out.counts.planPlanned++;
                    if (it.planReason === 'done-without-event-ref') out.counts.planAwaitingEvent++;
                }
                if (it.hint.length) out.counts.hinted++;
            }
        } catch (_e) {
            out.degraded = true;
        }
        return out;
    }
    /**
     * 现实视图(**现实问答与生成的唯一合法输入**)。
     *   只取 **stated 且 modality===reality** 的条目:梦里的死、假设里的搬走、
     *   一句「决定了」的计划、他人转述 —— 一律**不进**这一面。这正是修前
     *   缺口(现实问答吃到非现实结果)的正面修法。
     */
    function realityView(read) {
        const r = read || {};
        if (r.degraded) return { kind: NL_KIND, count: 0, items: [], realityOnly: true, excluded: 0, degraded: true };
        const items = Array.isArray(r.items) ? r.items : [];
        const keep = [];
        for (const it of items) {
            if (it && it.stated === true && it.modality === REALITY) keep.push(it);
        }
        return {
            kind: NL_KIND,
            at: r.at,
            atKnown: r.atKnown,
            count: keep.length,
            items: keep.slice(0, MAX_PER_LAYER),
            truncated: Math.max(0, keep.length - MAX_PER_LAYER),
            excluded: items.length - keep.length,
            realityOnly: true,
            writesNothing: true
        };
    }
    /**
     * 分层投影(**定向回看的唯一入口**)。
     *   按层分面列出 `projectOf(read, { layer })`;不指定 layer 时给全五层 +
     *   未标注。**非现实层不被并入现实面** —— 于是「梦里到底发生了什么」
     *   「当初计划是什么」这两个问题**修后问得出来**。计划层额外给
     *   planned / done / lapsed 三态分布与「待事件关联」计数。
     */
    function projectOf(read, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const r = read || {};
        if (r.degraded) {
            return { kind: NL_KIND, degraded: true, layers: [], layerCount: 0, writesNothing: true };
        }
        const only = clip(o.layer, 24).toLowerCase();
        const names = MODALITIES.concat([UNSPECIFIED]);
        const want = (only && names.indexOf(only) >= 0) ? [only] : names;
        const items = Array.isArray(r.items) ? r.items : [];
        const layers = [];
        for (const m of want) {
            const bucket = items.filter((it) => it && it.modality === m);
            const entry = {
                layer: m,
                count: bucket.length,
                items: bucket.slice(0, MAX_PER_LAYER),
                truncated: Math.max(0, bucket.length - MAX_PER_LAYER)
            };
            if (m === 'plan') {
                entry.plans = {
                    planned: bucket.filter((x) => x.planState === 'planned').length,
                    done: bucket.filter((x) => x.planState === 'done').length,
                    lapsed: bucket.filter((x) => x.planState === 'lapsed').length
                };
                entry.plansAwaitingEvent = bucket.filter((x) => x.planReason === 'done-without-event-ref').length;
                entry.frames = bucket.filter((x) => x.frameDepth > 0).length;
            }
            if (m === 'dream' || m === 'hypothesis') {
                entry.frames = bucket.filter((x) => x.frameDepth > 0).length;
                entry.nested = bucket.filter((x) => x.frameDepth > 1).length;
            }
            layers.push(entry);
        }
        return {
            kind: NL_KIND,
            at: r.at,
            atKnown: r.atKnown,
            layers: layers,
            layerCount: layers.length,
            total: items.length,
            writesNothing: true
        };
    }