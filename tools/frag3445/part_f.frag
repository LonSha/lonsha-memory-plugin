/** 人读渲染(**只给建议与来源与闸态**,不产出正文)。 */
    function render(read, opts) {
        try {
            const r = read || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const max = numOr(o.max, MAX_CANDIDATES);
            const g = arrOf(r.gates);
            if (!g.length) return r.malformedInput ? '控频闸输入畸形,无从过闸。' : '这一次没有可提的旧事。';
            const lines = [];
            const tag = { open: '可提', held: '押后', blocked: '不出' };
            for (const x of g) {
                if (lines.length >= max) break;
                const t = clip(x.title || x.detailKey || '', SNIPPET_MAX);
                const w = x.gate === 'open' ? '' : '[' + (tag[x.gate] || x.gate) + (x.reason ? (':' + x.reason) : '') + '] ';
                const s = x.source ? ('(来源:' + clip(x.source, 40) + ')') : '';
                lines.push('- ' + w + t + s);
            }
            return lines.join(NL);
        } catch (_e) { return ''; }
    }
    /** 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
    function describe(extra) {
        const sc = selfCheck();
        const o = (extra && typeof extra === 'object') ? extra : {};
        return Object.assign({
            kind: RG_KIND, version: RG_VERSION,
            channels: CHANNELS.slice(), channelLabels: CHANNELS.map((c) => CHANNEL_LABEL[c]),
            cooldownChannels: COOLDOWN_CHANNELS.slice(),
            policies: [POLICY.OFF, POLICY.HINT, POLICY.INJECT],
            defaultPolicy: POLICY.HINT,
            preferences: [PREFERENCE.NORMAL, PREFERENCE.LESS, PREFERENCE.NEVER],
            gates: GATE.slice(), gateLabels: GATE.map((g) => GATE_LABEL[g]),
            kinds: KINDS.slice(), maxCandidates: MAX_CANDIDATES, repeatWindow: REPEAT_WINDOW,
            offline: true, writesNothing: true, devisesNothing: true, emotionUsed: false,
            selfCheck: sc,
        }, o);
    }
    const api = {
        RG_VERSION: RG_VERSION,
        RG_KIND: RG_KIND,
        CHANNELS: CHANNELS,
        CHANNEL_LABEL: CHANNEL_LABEL,
        COOLDOWN_CHANNELS: COOLDOWN_CHANNELS,
        POLICY: POLICY,
        POLICY_LABEL: POLICY_LABEL,
        PREFERENCE: PREFERENCE,
        GATE: GATE,
        GATE_LABEL: GATE_LABEL,
        KINDS: KINDS,
        MAX_CANDIDATES: MAX_CANDIDATES,
        SNIPPET_MAX: SNIPPET_MAX,
        REPEAT_WINDOW: REPEAT_WINDOW,
        keyOf: keyOf,
        strOf: strOf,
        arrOf: arrOf,
        numOr: numOr,
        floorOf: floorOf,
        clip: clip,
        hash32: hash32,
        safe: safe,
        sameValue: sameValue,
        normState: normState,
        markChannel: markChannel,
        preferenceOf: preferenceOf,
        withPreference: withPreference,
        cooldownOf: cooldownOf,
        cooldownByChannel: cooldownByChannel,
        candidateOf: candidateOf,
        policyOf: policyOf,
        gate: gate,
        build: build,
        render: render,
        describe: describe,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck,
        line: line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaReturnGate = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);