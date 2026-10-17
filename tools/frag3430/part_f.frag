    /* ---------------------------------------------------------------
     * 一行读数(四方**分开说**:合并任意两方都会让人误判「现在能不能下结论」)
     * --------------------------------------------------------------- */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '证词面异常(已降级,不外抛)';
        if (r.malformedInput) return '证词面输入畸形(不是数组)—— 无从聚合';
        const boards = Array.isArray(r.boards) ? r.boards : [];
        if (!boards.length) return '暂无证词(无同事件的多方说法)';
        const c = r.counts || {};
        const parts = ['事件 ' + (c.events || 0), '说法 ' + (c.claims || 0),
            '亲历 ' + (c.witnessed || 0), '转述 ' + (c.relayed || 0)];
        if (c.rebutted) parts.push('被驳 ' + c.rebutted);
        const contested = boards.filter((b) => b.state === 'contested').length;
        if (contested) parts.push('**争议未决 ' + contested + '(不下结论)**');
        const withdrawn = boards.filter((b) => b.state === 'withdrawn').length;
        if (withdrawn) parts.push('已撤回 ' + withdrawn);
        if (c.noEventKey) parts.push('无事件键 ' + c.noEventKey + '(未计入任何事件)');
        if (c.offEvent) parts.push('非本事件 ' + c.offEvent);
        if (c.offTime) parts.push('晚于时点 ' + c.offTime);
        if (c.noFloor) parts.push('**无楼层 ' + c.noFloor + '(未计入任何时点)**');
        if (!r.atKnown) parts.push('(未给时点:给的是全量)');
        if (r.truncated) parts.push('截断 ' + r.truncated);
        return parts.join(' · ');
    }
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5「不做」第二条)。 */
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
     * 自检:**幂等 + 只读面 + 三档齐 + 未裁决可见 + 不产百分比**,五条当场自证。
     *   第4/5条是本模块的立身之本:
     *     · 未裁决必须**逐档可见**(合并三档等于说不出「为什么」);
     *     · 读数里**不得出现**百分比 / 置信度字段(M4-X5「不做」第二条)。
     */
    function selfCheck(traces) {
        const a = build(traces, {});
        const b = build(traces, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const kindsComplete = UNRESOLVED.length === 3
            && UNRESOLVED.every((k) => ['ambiguous', 'below-threshold', 'transmittal-only'].indexOf(k) >= 0);
        /* 4 未裁决可见:喂两条一手对立说法 ⇒ 必进 contested 且 disputes 两条。 */
        const probe = build([
            { character: '甲', fact: 'probe', eventId: 'E', action: 'acquire', via: 'witnessed', side: 'affirm', floor: 1 },
            { character: '丙', fact: 'probe-x', eventId: 'E', action: 'acquire', via: 'witnessed', side: 'deny', floor: 2 }
        ], {});
        const unresolvedVisible = !!probe.boards.length && probe.boards[0].state === 'contested'
            && probe.boards[0].disputes.items.length >= 2;
        /* 5 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(a);
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === TB_KIND; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && kindsComplete && unresolvedVisible && pctFree && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            kindsComplete: kindsComplete,
            unresolvedVisible: unresolvedVisible,
            percentFree: pctFree,
            serializable: serializable
        };
    }
    const api = {
        TB_VERSION: TB_VERSION,
        TB_KIND: TB_KIND,
        TB_STATES: TB_STATES,
        TB_CLAIM_STATES: TB_CLAIM_STATES,
        UNRESOLVED: UNRESOLVED,
        TB_SIDES: TB_SIDES,
        TB_STRENGTH: TB_STRENGTH,
        FIRSTHAND_VIA: FIRSTHAND_VIA,
        HEARD_VIA: HEARD_VIA,
        TB_MIN_TRUST: TB_MIN_TRUST,
        MAX_TESTIMONIES: MAX_TESTIMONIES,
        MAX_PER_SIDE: MAX_PER_SIDE,
        normFact: normFact,
        evidenceKeyOf: evidenceKeyOf,
        boardKeyOf: boardKeyOf,
        sideOf: sideOf,
        claimStateOf: claimStateOf,
        strengthOf: strengthOf,
        claimOf: claimOf,
        supportsOf: supportsOf,
        disputesOf: disputesOf,
        stateOfOf: stateOfOf,
        identitiesOf: identitiesOf,
        build: build,
        revokeEvidence: revokeEvidence,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaTestimonyBoard = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
