/**
     * 关键词提示读数(**只读数,绝不参与层判定**)。
     *   M4-X6「不做」第一条:不以关键词「梦」一票判定 —— 所以这里返回的
     *   只是一串**「这条原文里出现了哪类线索词」**的提示,供诊断展示;
     *   modalityOf 一个字节都不看它。为什么还要留:审阅时「这条没标注但
     *   提到了梦」是**值得人工复核**的线索,直接丢掉会让老数据静默漂移。
     */
    function hintOf(text) {
        const s = String(text == null ? '' : text);
        if (!s) return [];
        const hits = [];
        for (const pair of HINTS) {
            try { if (pair[0].test(s)) hits.push(pair[1]); } catch (_e) { /* 正则异常忽略 */ }
        }
        return hits;
    }
    /**
     * 计划落实态(**落实须事件关联才成案** —— M4-X6 验收原文的后半)。
     *   「决定要搬」只是 plan 层事实,**不得**因为一句「决定了」就自动读成
     *   已完成。判定序:
     *     1 显式放弃/作废(cancelled/abandoned/lapsed)⇒ lapsed;
     *     2 显式 done/completed/**且带事件关联**(eventRef/eventId/doneAt/...)
     *       ⇒ done;
     *     3 显式 done 但**无事件关联** ⇒ 仍 planned(理由码如实写明);
     *     4 给了时点且计划期限已过 ⇒ lapsed;
     *     5 其余 ⇒ planned。
     *   返回 { state, stated, reason, eventRef }。
     */
    function planStateOf(raw, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const dec = modalityOf(raw);
        if (dec.modality !== 'plan') {
            return { state: null, stated: false, reason: 'not-plan', eventRef: '' };
        }
        if (!raw || typeof raw !== 'object') {
            return { state: null, stated: false, reason: 'malformed', eventRef: '' };
        }
        /* 1 显式放弃 / 作废 */
        if (raw.cancelled === true || raw.canceled === true || raw.abandoned === true
            || raw.lapsed === true || raw.status === 'cancelled' || raw.status === 'abandoned'
            || raw.status === 'lapsed') {
            return { state: 'lapsed', stated: true, reason: 'marked-lapsed', eventRef: '' };
        }
        /* 事件关联(落实的**唯一**凭据) */
        let eventRef = '';
        for (const k of ['eventRef', 'eventId', 'linkedEvent', 'doneAt', 'completedBy', 'realizedBy', 'realizedAt']) {
            const v = raw[k];
            if (typeof v === 'string' && clip(v, 80)) { eventRef = clip(v, 80); break; }
            if (typeof v === 'number' && Number.isFinite(v)) { eventRef = String(v); break; }
        }
        const saidDone = raw.status === 'done' || raw.done === true || raw.completed === true
            || raw.executed === true || raw.realized === true;
        /* 2 说已落实 **且** 有事件关联 ⇒ 成案 */
        if (saidDone && eventRef) {
            return { state: 'done', stated: true, reason: 'done-with-event-ref', eventRef: eventRef };
        }
        /* 3 说已落实 但**无事件关联** ⇒ 仍 planned(不因一句「决定了」自动完成) */
        if (saidDone && !eventRef) {
            return { state: 'planned', stated: true, reason: 'done-without-event-ref', eventRef: '' };
        }
        /* 4 期限已过(给了时点才判) */
        const at = floorOf(o.at);
        const exp = floorOf(raw.expiresAt !== undefined ? raw.expiresAt : raw.expireAt);
        if (at !== null && exp !== null && exp < at) {
            return { state: 'lapsed', stated: true, reason: 'expired-before-at', eventRef: '' };
        }
        return { state: 'planned', stated: true, reason: 'no-event-ref', eventRef: '' };
    }
    /**
     * 条目归一:把一条原始条目收敛成本模块的**读数条目**(带层、框架、
     *   楼层、提示读数)。畸形返回 null(**不抛**,由调用方计入 malformed)。
     *   注意:`stated === false` 的条目 modality 一律 unspecified —— 与
     *   「已知它在现实里」**不同形**,不得当现实用。
     */
    function itemOf(raw, inject, opts) {
        try {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
            const o = (opts && typeof opts === 'object') ? opts : {};
            const dec = modalityOf(raw);
            const fr = frameOf(raw);
            const fact = clip(raw.fact !== undefined ? raw.fact
                : (raw.text !== undefined ? raw.text
                    : (raw.content !== undefined ? raw.content : raw.summary)), 200);
            const floor = floorOf(raw.floor !== undefined ? raw.floor
                : (raw.at !== undefined ? raw.at : raw.turn));
            const ps = (dec.modality === 'plan') ? planStateOf(raw, o) : { state: null, stated: false, reason: 'not-plan', eventRef: '' };
            return {
                modality: dec.modality,
                stated: dec.stated === true,
                via: dec.via,
                fact: fact,
                floor: floor,
                frame: fr.text,
                frameDepth: fr.depth,
                frameChain: fr.chain,
                hint: hintOf(fact),
                planState: ps.state,
                planReason: ps.reason,
                eventRef: ps.eventRef
            };
        } catch (_e) {
            return null;
        }
    }