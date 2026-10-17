    /* ---------------------------------------------------------------
     * 事实原文归一(与 knowledge-trace 的 normalizeFact **同形**)
     *   为什么在这里要有一份:本模块必须能判「两条说法是不是同一句」,
     *   这是**来源去重**与**事件聚合**的前置。口径照抄 knowledge-trace
     *   (逐字归一,不去停用词、不做近似),阈值不在此重立。
     *   为守「单一真源」,调用方可经 `opts.normFact` 注入 knowledge-trace 的
     *   同名函数(装配点的事);缺省时用本份**保守等价**实现,
     *   免得在 Node 单测里依赖兄弟模块。
     * --------------------------------------------------------------- */
    function normFact(value) {
        let s = String(value == null ? '' : value);
        s = s.replace(/[\u3000\s]+/g, '');
        s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
        s = s.replace(/[\u3001\u3002\u300c\u300d\u300e\u300f\u2018\u2019\u201c\u201d\u2026\u2014\uff0c\uff1b\uff1a\uff1f\uff01]/g, '');
        s = s.replace(/[!-/:-@\[-`{-~]/g, '');
        return s.toLowerCase();
    }
    /** 事实原文归一(优先用注入的真源)。 */
    function normOf(value, inject) {
        try {
            if (typeof inject === 'function') {
                const r = inject(value);
                return (r === undefined || r === null) ? '' : String(r);
            }
        } catch (_e) { /* 注入实现抛错一律回落本地实现,不外抛 */ }
        return normFact(value);
    }
    /** 证据键(与 knowledge-trace 的 evidenceKeyOf 同判据:evidenceKey 优先,缺省退回原文归一)。 */
    function evidenceKeyOf(t, inject) {
        if (!t || typeof t !== 'object') return '';
        const k = clip(t.evidenceKey || t.evidence, 120);
        if (k) return k;
        return normOf(t.fact, inject);
    }
    /* ---------------------------------------------------------------
     * 事件键(本模块的**聚合轴**)
     *   为什么**必须**留显式事件号口:`eventId` 是 M4-X5 明定的复用对象
     *   (验收原文「复用事件 ID」)—— 同一事件的不同说法,其 `fact` 原文
     *   本来就可能**不同**(甲说「他杀了人」、丙说「他没杀人」),若只按 fact 聚合,
     *   『同一事件的多方说法』会被拆成两个互不相干的事件,**验收 (a) 三条直接漏两条**。
     *   故判定序:显式 `eventId` / `eventKey` > 证据键 > 原文归一;
     *   三者皆空 ⇒ **空串**(该条不进任何事件,不是「属于某事件」)。
     * --------------------------------------------------------------- */
    function boardKeyOf(t, inject) {
        if (!t || typeof t !== 'object') return '';
        const ev = clip(t.eventId || t.eventKey || t.event, 120);
        if (ev) return ev;
        return evidenceKeyOf(t, inject);
    }
    /* ---------------------------------------------------------------
     * 说法立场(只认显式声明,**不抽语义**)
     *   「丙反证」这件事在文本层无法可靠判出(反语 / 转述 / 条件句),
     *   故本模块只认 `side` / `stand` / `stance` 的显式取值;判不出一律 `neutral`。
     *   显式取值里的同义写法在此收拢,**不猜新名单**。
     * --------------------------------------------------------------- */
    function sideOf(t) {
        if (!t || typeof t !== 'object') return 'neutral';
        const s = clip(t.side || t.stand || t.stance, 24).toLowerCase();
        if (!s) return 'neutral';
        if (TB_SIDES.indexOf(s) >= 0) return s;
        if (['pro', 'for', 'support', 'affirmative', 'yes'].indexOf(s) >= 0) return 'affirm';
        if (['against', 'oppose', 'opposed', 'rebut', 'rebuttal', 'deny', 'denial', 'no'].indexOf(s) >= 0) return 'deny';
        return 'neutral';
    }
    /* ---------------------------------------------------------------
     * 取证状态(单条说法落在哪一格)
     *   判定序(确定性):
     *     misbelieve(误信)⇒ rebutted —— **曾经当真、后来被纠正**的前态;
     *     acquire + 一手 via(witnessed/document)⇒ witnessed;
     *     acquire + 转述 via ⇒ relayed;
     *     acquire + via 读不到 ⇒ **relayed**(不定成亲历:把「不知道从哪知道的」
     *       写成「自己在场」正是 perspective-card 点名要治的错读);
     *     doubt / correct / retract ⇒ undecided(不得据此定案);
     *     其余(含 unaware)⇒ 空串(不进证词面 —— 「不知道这件事」不是一种说法)。
     * --------------------------------------------------------------- */
    function claimStateOf(t) {
        if (!t || typeof t !== 'object') return '';
        const act = clip(t.action, 24).toLowerCase();
        const via = clip(t.via, 24).toLowerCase();
        if (act === 'misbelieve' || act === 'misled') return 'rebutted';
        if (act === 'acquire' || act === 'known' || act === 'knows') {
            if (FIRSTHAND_VIA.indexOf(via) >= 0) return 'witnessed';
            return 'relayed';
        }
        if (act === 'doubt' || act === 'correct' || act === 'retract') return 'undecided';
        return '';
    }
    /* ---------------------------------------------------------------
     * 强度档(由 origin 或 via 派生,**只出档位、不出数值**)
     *   origin 在场则优先(它比 via 更直接地说明证据等级);否则按 via 的档位表。
     *   两处都读不到 ⇒ `none`(如实说「这条说法没有可判的强度」,
     *   而不是拿 0.5 这种居中值去冒充一个「中等」)。
     * --------------------------------------------------------------- */
    function strengthOf(t) {
        if (!t || typeof t !== 'object') return 'none';
        const o = clip(t.origin, 24).toLowerCase();
        let v = null;
        if (o && Object.prototype.hasOwnProperty.call(ORIGIN_TRUST, o)) v = ORIGIN_TRUST[o];
        if (v === null) {
            const via = clip(t.via, 24).toLowerCase();
            if (via && Object.prototype.hasOwnProperty.call(VIA_TRUST, via)) v = VIA_TRUST[via];
        }
        if (v === null) return 'none';
        if (v >= STRENGTH_CUT.strong) return 'strong';
        if (v >= STRENGTH_CUT.medium) return 'medium';
        if (v > 0) return 'weak';
        return 'none';
    }
    /* ---------------------------------------------------------------
     * 一条说法(证词)的归一
     *   逐条拷贝,**不做判定**(判定全在 supportsOf / disputesOf / stateOfOf)。
     * --------------------------------------------------------------- */
    function claimOf(raw, inject) {
        if (!raw || typeof raw !== 'object') return null;
        const character = clip(raw.character || raw.who || raw.owner, 40);
        const statement = clip(raw.statement || raw.claim || raw.fact, 180);
        if (!character || !statement) return null;
        return {
            character: character,
            statement: statement,
            statementKey: normOf(statement, inject),
            side: sideOf(raw),
            state: claimStateOf(raw),
            strength: strengthOf(raw),
            via: clip(raw.via || raw.channel, 24),
            from: clip(raw.from || raw.source, 40),
            evidenceKey: evidenceKeyOf(raw, inject),
            eventKey: boardKeyOf(raw, inject),
            floor: floorOrNull(raw.floor),
            identity: clip(raw.identity, 24) || 'unspecified',
            traceId: clip(raw.traceId || raw.id, 60),
            revoked: raw.revoked === true
        };
    }
