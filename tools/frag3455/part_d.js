/**
     * 预算(与既有 owner 的分工说清):本模块**不裁到 token**,只按**条数**
     *   给出「包里带头几条」与**越预算名单**(哪些可用材料超出了调用方给的条数)。
     *   · 为什么不是「本模块直接裁好」:真正裁到 token 的是 injection-router
     *     (既有预算 owner);本面再裁一遍等于**第二套预算系统**,两边口径必然漂移
     *     —— 漂移之后没人说得清「到底是哪一层把这条丢了」;
     *   · 为什么给 `budget.given`:调用方没设预算时,本模块用的是**缺省条数**,
     *     这件事必须能被读出来(否则「我明明没设预算,为什么只带了 9 条」无处可查)。
     */
    const BUDGET_DEFAULT_WHY = '调用方未给 budget ⇒ 用缺省条数';
    function budgetOf(v) {
        const n = numOr(v, null);
        if (n === null) return { given: false, perItem: BUDGET_DEFAULT, budgetRaw: null, why: BUDGET_DEFAULT_WHY };
        const k = Math.floor(n);
        if (k <= 0) return { given: false, perItem: BUDGET_DEFAULT, budgetRaw: n, why: 'budget 非正 ⇒ 按缺省条数(不读成「一条都不带」)' };
        return { given: true, perItem: k, budgetRaw: n, why: '' };
    }
    /** 任务归一(**缺省 advance**;给了但不认识 ⇒ 按 advance 并**说明**)。 */
    function taskOf(v) {
        const t = keyOf(v);
        if (TASKS.indexOf(t) >= 0) return { task: t, known: true, given: true, why: '' };
        const given = (v !== undefined && v !== null && keyOf(v) !== '');
        return { task: 'advance', known: false, given: given, why: given ? 'task 未识别 ⇒ 按推进(不编第五类任务)' : '' };
    }
    /** 每类任务的**关键面**(优先级表头部若干格):零材料 ⇒ 进 gapsCritical。 */
    const CRITICAL_COUNT = 3;
    function criticalFacetsOf(task) {
        const pr = TASK_PRIORITY[task] || TASK_PRIORITY.advance;
        return pr.slice(0, CRITICAL_COUNT);
    }
    /**
     * 建面(统一入口)。**只读**:不写任何账、不产正文、不代写未发生剧情。
     *   build(task, inventory, opts)
     *     task      —— meet / reunion / advance / resolve(缺省 advance)
     *     inventory —— 材料池(数组;调用方从各 owner 收来)
     *     opts      —— { budget(条数)/ now / restricted 名单等,当前只用 budget }
     *   返回读数(**四方分开说**):pack(带哪些)/ sheet(逐面明细 + 缺口)/
     *     superseded(被取代的当前值旧条)/ held(限制 / 未发生 / 未归面)。
     */
    function build(task, inventory, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const tv = taskOf(task);
        const t = tv.task;
        const bud = budgetOf(o.budget);
        const base = {
            kind: MP_KIND, version: MP_VERSION,
            task: t, taskLabel: TASK_LABEL[t], taskGiven: tv.given, taskKnown: tv.known,
            facets: FACETS.slice(), facetLabels: Object.assign({}, FACET_LABEL),
            priority: (TASK_PRIORITY[t] || TASK_PRIORITY.advance).slice(),
            criticalFacets: criticalFacetsOf(t),
            pack: [], packIds: [], sheet: [], superseded: [], gaps: [], gapsCritical: [],
            held: { restricted: [], future: [], superseded: [], unclassified: [] },
            budget: { given: bud.given, perItem: bud.perItem },
            overBudget: [], cost: { items: 0, estChars: 0, estCharsAll: 0 },
            counts: { inventory: 0, usable: 0, packed: 0, restricted: 0, future: 0, unclassified: 0, superseded: 0, truncated: 0, dropped: 0, truncatedIn: 0 },
            reasons: [], truncated: 0, orderIsRank: true,
            writesNothing: true, devisesNothing: true, injectsNothing: false,
            note: '本面只挑材料;真正裁到 token 由既有预算 owner 负责',
        };
        /* 入参两态**不同形**:没给材料(undefined / null)= 合法的「这次没有材料」;
         *   给了但**不是数组**(字符串 / 数字 / 普通对象)= 畸形,无从选材。
         *   把两者压成同形会让「判不了」被读成「没有」—— 这正是 M4-X8 要防的。 */
        const absentArg = (inventory === undefined) || (inventory === null);
        if (!absentArg && !Array.isArray(inventory)) {
            return Object.assign({}, base, {
                judged: false, malformedInput: true,
                reasons: ['inventory 不是数组 ⇒ 无从选材(不读成「没有材料」)'],
            });
        }
        const list = Array.isArray(inventory) ? inventory : [];
        const nm = normalize(list);
        const rc = resolveConflicts(nm.materials);
        const usable = rc.materials.filter((m) => m.usable === true);
        const rk = rank(usable, t);
        const packed = rk.materials.slice(0, Math.min(bud.perItem, PACK_MAX));
        const overBudget = rk.materials.slice(Math.min(bud.perItem, PACK_MAX));
        const restricted = rc.materials.filter((m) => m.restricted === true);
        const future = rc.materials.filter((m) => m.future === true);
        const unclassified = rc.materials.filter((m) => m.why === 'unclassified');
        /* 逐面明细(**缺口就藏在这里**:某一面 0 条时会明白写出来)。 */
        const byFacet = {};
        for (const f of FACETS) byFacet[f] = [];
        for (const m of rk.materials) if (m.facet && byFacet[m.facet]) byFacet[m.facet].push(m);
        const sheet = [];
        const gaps = [];
        for (const f of (TASK_PRIORITY[t] || TASK_PRIORITY.advance)) {
            const n = byFacet[f] ? byFacet[f].length : 0;
            const critical = criticalFacetsOf(t).indexOf(f) >= 0;
            sheet.push({ facet: f, facetLabel: FACET_LABEL[f] || f, count: n, critical: critical, ids: (byFacet[f] || []).map((m) => m.id) });
            if (!n) { gaps.push({ facet: f, facetLabel: FACET_LABEL[f] || f, critical: critical }); }
        }
        const gapsCritical = gaps.filter((g) => g.critical === true);
        let estChars = 0;
        for (const m of packed) estChars += (m.title || '').length + (m.snippet || '').length;
        let estCharsAll = estChars;
        for (const m of overBudget) estCharsAll += (m.title || '').length + (m.snippet || '').length;
        const reasons = [];
        if (tv.why) reasons.push(tv.why);
        if (bud.why) reasons.push(bud.why);
        if (rc.superseded.length) reasons.push('同组当前值 ' + rc.superseded.length + ' 条被更新的那条取代(具名在 superseded,非静默丢弃)');
        if (restricted.length) reasons.push('受限材料 ' + restricted.length + ' 条 ⇒ 不进包(越界知情面不喂)');
        if (future.length) reasons.push('未发生材料 ' + future.length + ' 条 ⇒ 不进包(计划不当成已发生)');
        if (unclassified.length) reasons.push('未归面材料 ' + unclassified.length + ' 条 ⇒ 不进包(不硬塞成约束或设定)');
        if (overBudget.length) reasons.push('越预算 ' + overBudget.length + ' 条 ⇒ 有序候补(裁剪由既有预算 owner 负责,本面不代裁)');
        if (gapsCritical.length) reasons.push('关键面零材料:' + gapsCritical.map((g) => g.facetLabel).join('、'));
        if (nm.truncatedIn > 0) reasons.push('池超上限 ' + INVENTORY_MAX + ' ⇒ 截断 ' + nm.truncatedIn + ' 条');
        return Object.assign({}, base, {
            judged: true,
            judgedTask: t,
            inventoryGiven: list.length,
            pack: packed.slice(),
            packIds: packed.map((m) => m.id),
            priority: (TASK_PRIORITY[t] || TASK_PRIORITY.advance).slice(),
            sheet: sheet, superseded: rc.superseded, gaps: gaps, gapsCritical: gapsCritical,
            held: {
                restricted: restricted.map((m) => ({ id: m.id, facet: m.facet, title: m.title, why: 'restricted' })),
                future: future.map((m) => ({ id: m.id, facet: m.facet, title: m.title, why: 'future' })),
                superseded: rc.superseded.slice(),
                unclassified: unclassified.map((m) => ({ id: m.id, facetRaw: m.facetRaw, title: m.title, why: 'unclassified' })),
            },
            budget: { given: bud.given, perItem: bud.perItem, budgetRaw: bud.budgetRaw },
            overBudget: overBudget.map((m) => ({ id: m.id, facet: m.facet, order: m.order, title: m.title })),
            cost: { items: packed.length, estChars: estChars, estCharsAll: estCharsAll, estCharsSkipped: estCharsAll - estChars },
            counts: {
                inventory: list.length, usable: rk.materials.length, packed: packed.length,
                restricted: restricted.length, future: future.length, unclassified: unclassified.length,
                superseded: rc.superseded.length, truncated: overBudget.length,
                dropped: nm.dropped, truncatedIn: nm.truncatedIn,
            },
            reasons: reasons, truncated: overBudget.length,
        });
    }