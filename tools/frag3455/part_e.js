/** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5 / X6 / X7 同口径)。 */
    function hasPercentKey(obj, depth) {
        const d = depth || 0;
        if (d > 6 || !obj || typeof obj !== 'object') return false;
        if (Array.isArray(obj)) {
            for (const it of obj) if (hasPercentKey(it, d + 1)) return true;
            return false;
        }
        for (const k of Object.keys(obj)) {
            const low = String(k).toLowerCase();
            for (const bad of PERCENT_KEYS) if (low.indexOf(bad) >= 0) return true;
            if (hasPercentKey(obj[k], d + 1)) return true;
        }
        return false;
    }
    /**
     * 自检:**确定性 + 只读面 + 任务轴真的改变产物 + 未发生/受限两条闸都闭 +
     *   缺口具名 + 被取代者具名 + 池空与入参畸形不同形 + 不产百分比**,
     *   九条当场自证。第 3 / 4 / 5 / 6 条是本模块的立身之本。
     */
    function selfCheck() {
        const PROBE = [
            { id: 'p1', kind: 'place', title: '旧教室', floor: 10, source: 'recall' },
            { id: 'p2', kind: 'promise', title: '答应过周三', floor: 8, source: 'promise' },
            { id: 'p3', kind: 'person', title: '阿岚', floor: 9, source: 'relation' },
        ];
        const MIX = [
            { id: 'a', facet: 'appointment', title: '周三的约', floor: 5, source: 'caller' },
            { id: 'b', facet: 'place', title: '老码头', floor: 5, source: 'scene-book' },
            { id: 'c', facet: 'relation', title: '和解了', floor: 5, source: 'relation' },
            { id: 'd', facet: 'sharedPast', title: '一起看的海', floor: 5, source: 'recall' },
        ];
        const a = build('meet', PROBE, { budget: 5 });
        const b = build('meet', PROBE, { budget: 5 });
        /* 1 确定性:同输入同产物。 */
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        /* 2 只读面:导出名里不得有写面前缀。 */
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store', 'drop', 'erase', 'inject', 'push'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        /* 3 任务轴四类齐,且优先级表都是 FACETS 的排法(**不另造词表**)。 */
        const prAll = TASKS.map((t) => TASK_PRIORITY[t]);
        const tasksComplete = TASKS.length === 4
            && prAll.every((p) => Array.isArray(p) && p.length === FACETS.length)
            && prAll.every((p) => FACETS.every((f) => p.indexOf(f) >= 0));
        /* 4 **任务轴真的改变产物**:同一池,赴约与重逢的包**不同序**,且各自首位落在自己的关键面。 */
        const meet = build('meet', MIX, { budget: 3 });
        const reunion = build('reunion', MIX, { budget: 3 });
        const taskAxisMoves = meet.pack[0] && meet.pack[0].facet === 'appointment'
            && reunion.pack[0] && reunion.pack[0].facet === 'relation'
            && meet.packIds.join(',') !== reunion.packIds.join(',');
        /* 5 **矛盾当前值不并列**:同组两条(3 楼 / 7 楼) ⇒ 只留 7 楼那条,另一条**具名**被取代。 */
        const CONFLICT = [
            { id: 'c1', facet: 'place', title: '在南城', floor: 3, conflictGroup: 'g1', source: 'recall' },
            { id: 'c2', facet: 'place', title: '在北城', floor: 7, conflictGroup: 'g1', source: 'recall' },
        ];
        const cc = build('meet', CONFLICT, { budget: 5 });
        const conflictNoParl = cc.packIds.length === 1 && cc.packIds[0] === 'c2'
            && cc.superseded.length === 1 && cc.superseded[0].id === 'c1' && cc.superseded[0].supersededBy === 'c2';
        /* 6 **未发生 / 受限都不进包**(两条闸都闭),且**分别计数**(不同形)。 */
        const GATED = [
            { id: 'g1', facet: 'place', title: '真到过的地方', floor: 5, source: 'recall' },
            { id: 'g2', facet: 'place', title: '打算去的地方', floor: 6, future: true, source: 'caller' },
            { id: 'g3', facet: 'place', title: '他不该知道的地方', floor: 6, restricted: true, source: 'scene-book' },
        ];
        const gg = build('meet', GATED, { budget: 5 });
        const gatesHold = gg.packIds.join(',') === 'g1'
            && gg.counts.future === 1 && gg.counts.restricted === 1
            && gg.held.future[0].id === 'g2' && gg.held.restricted[0].id === 'g3';
        /* 7 **缺口具名**:只有一条物品、赴约的三个关键面全空 ⇒ gapsCritical 命中三格且**带标签**。 */
        const SPARSE = [{ id: 's1', facet: 'item', title: '旧钥匙', floor: 4, source: 'recall' }];
        const sp = build('meet', SPARSE, { budget: 5 });
        const gapsNamed = sp.gapsCritical.length === 3
            && sp.gapsCritical.every((g) => g.critical === true && g.facetLabel !== '')
            && sp.reasons.some((r) => r.indexOf('关键面零材料') >= 0);
        /* 8 **入参畸形与池空不同形**(前者无从选材,后者是合法的「这次没有材料」)。 */
        const bad = build('meet', 'not-an-array', {});
        const empty = build('meet', [], {});
        const malformedDistinct = bad.malformedInput === true && bad.judged === false
            && empty.malformedInput === undefined && empty.judged === true && empty.pack.length === 0;
        /* 9 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(a);
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).task === 'meet'; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && tasksComplete && taskAxisMoves && conflictNoParl
                && gatesHold && gapsNamed && malformedDistinct && pctFree && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            tasksComplete: tasksComplete,
            taskAxisMoves: taskAxisMoves,
            conflictNoParl: conflictNoParl,
            gatesHold: gatesHold,
            gapsNamed: gapsNamed,
            malformedDistinct: malformedDistinct,
            percentFree: pctFree,
            serializable: serializable,
        };
    }
    /**
     * 一行读数(四方**分开说**:带上 / 越预算 / 关键面缺 / 被挡住的那几类)。
     *   合并任意两方都会让人误判「这一幕到底带齐了没有」—— 所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '材料包异常(已降级,不外抛)';
        if (r.malformedInput) return '材料包输入畸形(inventory 不是数组)—— 无从选材';
        const c = r.counts || {};
        if (!c.inventory) return '暂无材料(下一幕 ' + (r.taskLabel || r.task || '') + ')';
        const parts = ['下一幕 ' + (r.taskLabel || r.task), '材料 ' + c.inventory, '带上 ' + c.packed];
        if (c.truncated) parts.push('越预算 ' + c.truncated);
        if (r.gapsCritical && r.gapsCritical.length) parts.push('**关键面缺 ' + r.gapsCritical.length + '**');
        if (c.superseded) parts.push('被取代 ' + c.superseded);
        if (c.restricted) parts.push('受限 ' + c.restricted);
        if (c.future) parts.push('未发生 ' + c.future);
        if (c.unclassified) parts.push('未归面 ' + c.unclassified);
        if (r.budget && r.budget.given === false) parts.push('(缺省预算 ' + r.budget.perItem + ' 条)');
        return parts.join(' · ');
    }
    /** 逐面清单(只说**带哪几样**与**哪几面空着**,不产出正文)。 */
    function render(read, opts) {
        try {
            const r = read || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const max = numOr(o.max, PACK_MAX);
            if (!r.judged) return r.malformedInput ? '材料包输入畸形,无从选材。' : '材料包未判。';
            const pack = arrOf(r.pack);
            const lines = [];
            const head = '下一幕:' + (r.taskLabel || r.task) + '(按任务优先级排序)';
            lines.push(head);
            if (!pack.length) lines.push('- 没有可用材料');
            for (let i = 0; i < pack.length; i++) {
                if (lines.length > max) break;
                const m = pack[i];
                const src = m.source ? ('(来源:' + m.source + ')') : '';
                const fl = (m.floor === null) ? '' : ('@' + m.floor);
                lines.push('- [' + (FACET_LABEL[m.facet] || m.facet || '未归面') + '] ' + (m.title || m.id) + fl + src);
            }
            const gaps = arrOf(r.gaps);
            if (gaps.length) lines.push('缺口:' + gaps.map((g) => (g.facetLabel || g.facet) + (g.critical ? '(关键)' : '')).join('、'));
            if (r.superseded && r.superseded.length) lines.push('被取代:' + r.superseded.map((s) => s.id + '→' + s.supersededBy).join('、'));
            return lines.join(NL);
        } catch (_e) { return ''; }
    }
    /** 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
    function describe(extra) {
        const sc = selfCheck();
        const o = (extra && typeof extra === 'object') ? extra : {};
        return Object.assign({
            kind: MP_KIND, version: MP_VERSION,
            tasks: TASKS.slice(), taskLabels: TASKS.map((t) => TASK_LABEL[t]),
            facets: FACETS.slice(), facetLabels: Object.assign({}, FACET_LABEL),
            priorityPerTask: TASKS.map((t) => ({ task: t, order: TASK_PRIORITY[t].slice() })),
            sources: SOURCES.slice(),
            inventoryMax: INVENTORY_MAX, packMax: PACK_MAX, budgetDefault: BUDGET_DEFAULT, snippetMax: SNIPPET_MAX,
            criticalCount: CRITICAL_COUNT,
            orderIsRank: true, cutsToToken: false, budgetOwner: 'injection-router',
            offline: true, writesNothing: true, devisesNothing: true, injectsNothing: false,
            selfCheck: sc,
        }, o);
    }
    const api = {
        MP_VERSION: MP_VERSION,
        MP_KIND: MP_KIND,
        TASKS: TASKS,
        TASK_LABEL: TASK_LABEL,
        FACETS: FACETS,
        FACET_LABEL: FACET_LABEL,
        TASK_PRIORITY: TASK_PRIORITY,
        SOURCES: SOURCES,
        INVENTORY_MAX: INVENTORY_MAX,
        PACK_MAX: PACK_MAX,
        BUDGET_DEFAULT: BUDGET_DEFAULT,
        SNIPPET_MAX: SNIPPET_MAX,
        CRITICAL_COUNT: CRITICAL_COUNT,
        KIND_TO_FACET: KIND_TO_FACET,
        keyOf: keyOf,
        strOf: strOf,
        arrOf: arrOf,
        numOr: numOr,
        floorOf: floorOf,
        clip: clip,
        hash32: hash32,
        safe: safe,
        sameValue: sameValue,
        facetFor: facetFor,
        materialOf: materialOf,
        normalize: normalize,
        facetRankOf: facetRankOf,
        rank: rank,
        resolveConflicts: resolveConflicts,
        budgetOf: budgetOf,
        taskOf: taskOf,
        criticalFacetsOf: criticalFacetsOf,
        build: build,
        render: render,
        describe: describe,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck,
        line: line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaMaterialPack = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }