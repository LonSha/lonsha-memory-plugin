/**
     * 一行读数(四方**分开说**:现实 / 非现实 / 未标注 / 计划待关联)。
     *   合并任意两方都会让人误判「现在能不能拿它当真值」——所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '叙事层异常(已降级,不外抛)';
        if (r.malformedInput) return '叙事层输入畸形(不是数组)—— 无从分面';
        const items = Array.isArray(r.items) ? r.items : [];
        if (!items.length) return '暂无叙事层条目(无非现实外壳)';
        const c = r.counts || {};
        const parts = ['条目 ' + (c.used || 0)];
        if (c.reality) parts.push('现实 ' + c.reality);
        const nonReality = (c.dream || 0) + (c.hypothesis || 0) + (c.plan || 0) + (c.quote || 0);
        if (nonReality) parts.push('**非现实 ' + nonReality + '(已挡在现实面外)**');
        if (c.dream) parts.push('梦 ' + c.dream);
        if (c.hypothesis) parts.push('假设 ' + c.hypothesis);
        if (c.plan) parts.push('计划 ' + c.plan);
        if (c.quote) parts.push('引述 ' + c.quote);
        if (c.planDone) parts.push('已落实 ' + c.planDone);
        if (c.planAwaitingEvent) parts.push('**说了落实但无事件关联 ' + c.planAwaitingEvent + '(仍计 planned)**');
        if (c.unspecified) parts.push('未标注 ' + c.unspecified + '(不猜,不得当现实)');
        if (c.hinted) parts.push('含线索词但未标注 ' + c.hinted + '(仅提示)');
        if (c.noFloor) parts.push('**无楼层 ' + c.noFloor + '(未计入任何时点)**');
        if (c.offTime) parts.push('晚于时点 ' + c.offTime);
        if (!r.atKnown) parts.push('(未给时点:给的是全量)');
        if (r.truncated) parts.push('截断 ' + r.truncated);
        return parts.join(' · ');
    }
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5/M4-X6 同口径)。 */
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
     * 自检:**幂等 + 只读面 + 五层齐 + 现实面隔离 + 不产百分比 + 计划闸生效**,
     *   六条当场自证。第4/6条是本模块的立身之本:
     *     · 现实面隔离:喂梦里/假设里/计划里三条 ⇒ realityView **一条都不给**;
     *     · 计划闸生效:喂「说自己 done 但无事件关联」⇒ 仍读 planned。
     */
    function selfCheck(items) {
        const a = build(items, {});
        const b = build(items, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const layersComplete = MODALITIES.length === 5
            && ['reality', 'dream', 'hypothesis', 'plan', 'quote'].every((k) => MODALITIES.indexOf(k) >= 0)
            && UNSPECIFIED === 'unspecified' && REALITY === 'reality';
        /* 4 现实面隔离:非现实条目**一条都不进** realityView。 */
        const probe = build([
            { character: '甲', fact: 'probe-real', modality: 'reality', floor: 1 },
            { character: '甲', fact: 'probe-dream', modality: 'dream', floor: 2 },
            { character: '乙', fact: 'probe-if', modality: 'hypothesis', floor: 2 },
            { character: '乙', fact: 'probe-plan', modality: 'plan', floor: 2, status: 'planned' },
            { character: '丙', fact: 'probe-quote', modality: 'quote', floor: 3 }
        ], {});
        const rv = realityView(probe);
        const realityIsolated = rv.count === 1 && rv.items.length === 1
            && rv.items[0].fact === 'probe-real' && rv.excluded === 4;
        /* 5 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(a);
        /* 6 计划闸:说了 done 但无事件关联 ⇒ 仍 planned(不得自动完成)。 */
        const gate = build([
            { character: '丁', fact: 'probe-plan-done', modality: 'plan', status: 'done', floor: 4 },
            { character: '丁', fact: 'probe-plan-real', modality: 'plan', status: 'done', eventRef: 'E-9', floor: 4 }
        ], {});
        const planGate = gate.counts.planDone === 1 && gate.counts.planAwaitingEvent === 1
            && gate.items.filter((x) => x.planState === 'planned').length === 1;
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === NL_KIND; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && layersComplete && realityIsolated && pctFree && planGate && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            layersComplete: layersComplete,
            realityIsolated: realityIsolated,
            percentFree: pctFree,
            planGate: planGate,
            serializable: serializable
        };
    }
    const api = {
        NL_VERSION: NL_VERSION,
        NL_KIND: NL_KIND,
        MODALITIES: MODALITIES,
        UNSPECIFIED: UNSPECIFIED,
        REALITY: REALITY,
        PLAN_STATES: PLAN_STATES,
        HINTS: HINTS,
        MAX_ITEMS: MAX_ITEMS,
        MAX_PER_LAYER: MAX_PER_LAYER,
        MAX_FRAMES: MAX_FRAMES,
        normFact: normFact,
        modalityOf: modalityOf,
        frameOf: frameOf,
        hintOf: hintOf,
        planStateOf: planStateOf,
        itemOf: itemOf,
        build: build,
        realityView: realityView,
        projectOf: projectOf,
        line: line,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaNarrativeLayer = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);