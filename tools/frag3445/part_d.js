/** 候选归一(只读:缺字段**如实留空**,不猜)。 */
    function candidateOf(raw, idx) {
        const r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const kind = keyOf(r.kind);
        return {
            index: idx,
            kind: (KINDS.indexOf(kind) >= 0) ? kind : '',
            kindRaw: kind,
            triggerKey: keyOf(r.triggerKey),
            detailKey: keyOf(r.detailKey),
            title: clip(r.title || r.snippet || r.detailKey || '', SNIPPET_MAX),
            source: clip(r.source || '', SNIPPET_MAX),
            knowing: keyOf(r.knowing),
            subjects: arrOf(r.subjects).map(keyOf).filter((x) => x !== ''),
        };
    }
    /** 归一策略档(**缺省即默认 hint-only** —— 「默认提示」是计划验收原文)。 */
    function policyOf(v) {
        const p = keyOf(v);
        if (p === POLICY.OFF || p === POLICY.HINT || p === POLICY.INJECT) return p;
        return POLICY.HINT;
    }
    /**
     * **本模块的立身之本**:把「建议」接到「真实生成通道」上。
     *   返回 { judged, policy, policyLabel, gates, open, held, blocked, injectable,
     *          counts, cooldownUnjudged, emotion, emotionUsed, prefsApplied, reasons }
     *
     *   闸序(**先政策、再偏好、再重复、最后开**;顺序即优先级):
     *     1 policy === off            ⇒ 全部 blocked('policy-off')
     *     2 该条 pref === never        ⇒ blocked('pref-never')   —— **不出建议面**
     *     3 同键在窗口内已 shown/used  ⇒ held('repeat-window')   —— **预览不算**
     *     4 该条 pref === less         ⇒ held('pref-less')       —— 押后,仍可见
     *     5 其余                       ⇒ open
     *   可注入面 **只**在 policy === inject **且** gate === open **且** 冷却已判时非空。
     */
    function gate(candidates, state, input) {
        const o = (input && typeof input === 'object') ? input : {};
        const list = Array.isArray(candidates) ? candidates : null;
        const policy = policyOf(o.policy);
        const now = floorOf(o.now);
        const win = numOr(o.window, REPEAT_WINDOW);
        const emotion = keyOf(o.emotion);
        const base = {
            judged: true, policy: policy, policyLabel: POLICY_LABEL[policy], now: now,
            gates: [], open: [], held: [], blocked: [], injectable: [],
            counts: { total: 0, open: 0, held: 0, blocked: 0, injectable: 0 },
            cooldownUnjudged: 0, emotion: emotion, emotionUsed: false,
            prefsApplied: { less: 0, never: 0 }, reasons: [], truncated: 0,
            writesNothing: true, devisesNothing: true,
        };
        if (list === null) {
            return Object.assign({}, base, { judged: false, malformedInput: true, reasons: ['candidates 不是数组 ⇒ 无从过闸(不读成「没有可提的旧事」)'] });
        }
        const out = [];
        let cdUnjudged = 0, lessN = 0, neverN = 0;
        for (let i = 0; i < list.length; i++) {
            if (out.length >= MAX_CANDIDATES) break;
            const c = candidateOf(list[i], i);
            const pf = preferenceOf(state, c.detailKey);
            let g = 'open', why = '';
            if (policy === POLICY.OFF) { g = 'blocked'; why = 'policy-off'; }
            else if (pf.known && pf.pref === PREFERENCE.NEVER) { g = 'blocked'; why = 'pref-never'; neverN++; }
            else {
                const cd = cooldownOf(state, c.triggerKey, c.detailKey, now, { window: win });
                if (!cd.judged) cdUnjudged++;
                if (cd.judged && cd.cooled) { g = 'held'; why = 'repeat-window'; }
                else if (pf.known && pf.pref === PREFERENCE.LESS) { g = 'held'; why = 'pref-less'; lessN++; }
            }
            out.push({
                triggerKey: c.triggerKey, detailKey: c.detailKey, kind: c.kind, kindRaw: c.kindRaw,
                title: c.title, source: c.source, knowing: c.knowing, subjects: c.subjects,
                gate: g, gateLabel: GATE_LABEL[g], reason: why, pref: pf.pref, prefKnown: pf.known,
            });
        }
        const truncated = list.length - out.length;
        const open = out.filter((x) => x.gate === 'open');
        const held = out.filter((x) => x.gate === 'held');
        const blocked = out.filter((x) => x.gate === 'blocked');
        const injectable = (policy === POLICY.INJECT && cdUnjudged === 0) ? open.slice() : [];
        const reasons = [];
        if (truncated > 0) reasons.push('超过上限 ' + MAX_CANDIDATES + ' ⇒ 截断 ' + truncated + ' 条');
        if (policy === POLICY.HINT) reasons.push('策略只给提示 ⇒ 可注入面恒为 0(建议仍出)');
        if (policy === POLICY.OFF) reasons.push('策略关停 ⇒ 不出建议也不注入');
        if (cdUnjudged > 0) reasons.push('冷却未判 ' + cdUnjudged + ' 条 ⇒ 即便策略允许也不进可注入面');
        return Object.assign({}, base, {
            gates: out, open: open, held: held, blocked: blocked, injectable: injectable,
            counts: { total: out.length, open: open.length, held: held.length, blocked: blocked.length, injectable: injectable.length },
            cooldownUnjudged: cdUnjudged, prefsApplied: { less: lessN, never: neverN },
            reasons: reasons, truncated: truncated,
        });
    }
    /**
     * 建面(统一入口)。**只读**:不写任何账、不产正文、不删历史事实。
     *   opts 可给:policy(缺省 hint-only)/ now(当前楼)/ window / emotion /
     *               candidates(缺省空数组 ⇒ 建议面为空,而不是「无冷却」)。
     */
    function build(candidates, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        /* 入参裁定(**三态不同形**):
         *   · 显式给了**非数组**(如字符串)⇒ malformed(不读成「没有可提的旧事」);
         *   · 根本没给 ⇒ 空数组(合法的「这一次没有候选」);
         *   · 数组 ⇒ 原样过闸。 */
        const given = (v) => v !== undefined && v !== null;
        let list;
        if (Array.isArray(candidates)) list = candidates;
        else if (given(candidates)) list = null;
        else if (Array.isArray(o.candidates)) list = o.candidates;
        else if (given(o.candidates)) list = null;
        else list = [];
        return safe(() => gate(list, o.state || {}, o), Object.assign({
            judged: false, policy: POLICY.HINT, policyLabel: POLICY_LABEL[POLICY.HINT], now: null,
            gates: [], open: [], held: [], blocked: [], injectable: [],
            counts: { total: 0, open: 0, held: 0, blocked: 0, injectable: 0 },
            cooldownUnjudged: 0, emotion: '', emotionUsed: false,
            prefsApplied: { less: 0, never: 0 }, reasons: ['建面异常(已降级,不外抛)'],
            truncated: 0, writesNothing: true, devisesNothing: true, degraded: true,
        }));
    }