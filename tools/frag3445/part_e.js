/** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5 / M4-X6 同口径)。 */
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
     * 自检:**幂等 + 只读面 + 三通道齐 + **预览不消耗冷却** + 默认提示 + 不产百分比 +
     *   反馈不改历史**,七条当场自证。第 4/5 条是本模块的立身之本:
     *     · 预览不消耗:只登记 preview ⇒ 冷却面必须**未命中**(cooled:false);
     *     · 默认提示:不给策略 ⇒ policy 必须落到 hint-only,可注入面恒 0。
     */
    function selfCheck() {
        const probe = [
            { kind: 'place', triggerKey: 'place:school', detailKey: 'd1', title: '旧教室' },
            { kind: 'item', triggerKey: 'item:ring', detailKey: 'd2', title: '旧戒指' },
        ];
        const a = build(probe, { now: 10 });
        const b = build(probe, { now: 10 });
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const channelsComplete = CHANNELS.length === 3
            && ['preview', 'shown', 'used'].every((k) => CHANNELS.indexOf(k) >= 0)
            && COOLDOWN_CHANNELS.length === 2 && COOLDOWN_CHANNELS.indexOf('preview') < 0;
        /* 4 **预览不消耗冷却**:只登记 preview ⇒ 冷却面必须未命中。 */
        const pv = markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'preview', floor: 10 });
        const cdAfterPreview = cooldownOf(pv.state, 'place:school', 'd1', 11, { window: 3 });
        const previewFree = pv.ok && pv.changed && cdAfterPreview.judged && cdAfterPreview.cooled === false;
        /* 4b **展示落冷却 / 真用落冷却**(与 4 成对:同键、通道不同,结果必须**不同**)。 */
        const sw = markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'shown', floor: 10 });
        const cdAfterShown = cooldownOf(sw.state, 'place:school', 'd1', 11, { window: 3 });
        const us = markChannel({}, { triggerKey: 'place:school', detailKey: 'd1', channel: 'used', floor: 10 });
        const cdAfterUsed = cooldownOf(us.state, 'place:school', 'd1', 11, { window: 3 });
        const shownUsedCool = cdAfterShown.judged && cdAfterShown.cooled === true && cdAfterUsed.judged && cdAfterUsed.cooled === true;
        /* 5 **默认提示**:不给策略 ⇒ hint-only,且可注入面恒 0(建议仍出)。 */
        const dflt = build(probe, { now: 10 });
        const defaultHint = dflt.policy === POLICY.HINT && dflt.open.length === 2 && dflt.injectable.length === 0;
        /* 6 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(a);
        /* 7 反馈不改历史:设 less/never 后,**候选条数不变、marks 不被删**。 */
        const withPref = withPreference({ marks: [{ triggerKey: 't', detailKey: 'd2', channel: 'preview', floor: 1 }] }, 'd2', 'never');
        const gated = build(probe, { now: 10, state: withPref.state });
        const feedbackKeepsHistory = withPref.ok && withPref.changed
            && gated.counts.total === 2 && gated.blocked.length === 1
            && gated.blocked[0].reason === 'pref-never'
            && normState(withPref.state).state.marks.length === 1;
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).policy === POLICY.HINT; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && channelsComplete && previewFree && shownUsedCool
                && defaultHint && pctFree && feedbackKeepsHistory && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            channelsComplete: channelsComplete,
            previewFree: previewFree,
            shownUsedCool: shownUsedCool,
            defaultHint: defaultHint,
            percentFree: pctFree,
            feedbackKeepsHistory: feedbackKeepsHistory,
            serializable: serializable,
        };
    }
    /**
     * 一行读数(四方**分开说**:可提 / 押后 / 不出 / 可注入)。
     *   合并任意两方都会让人误判「这条到底会不会进生成」——所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '控频闸异常(已降级,不外抛)';
        if (r.malformedInput) return '控频闸输入畸形(candidates 不是数组)—— 无从过闸';
        const c = r.counts || {};
        if (!c.total) {
            const hint = (r.policy === POLICY.INJECT) ? '' : '(策略' + (r.policyLabel || '') + ')';
            return '暂无旧事候选' + hint;
        }
        const parts = ['候选 ' + c.total, '策略 ' + (r.policyLabel || r.policy)];
        if (c.open) parts.push('可提 ' + c.open);
        if (c.held) parts.push('押后 ' + c.held);
        if (c.blocked) parts.push('不出 ' + c.blocked);
        parts.push('**可注入 ' + c.injectable + '**');
        if (r.policy === POLICY.HINT) parts.push('(只给提示,不自动注入)');
        if (r.policy === POLICY.OFF) parts.push('(已关停)');
        if (r.cooldownUnjudged) parts.push('**冷却未判 ' + r.cooldownUnjudged + ' 条(不进可注入面)**');
        const pa = r.prefsApplied || {};
        if (pa.less) parts.push('偏好少提 ' + pa.less);
        if (pa.never) parts.push('偏好不提 ' + pa.never);
        if (r.emotion) parts.push('情绪(只读)' + r.emotion);
        if (r.truncated) parts.push('截断 ' + r.truncated);
        return parts.join(' · ');
    }