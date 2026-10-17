    /* ---------------------------------------------------------------
     * 来源去重(**M4-X5 验收 (b) 的落点**)
     *   判据(确定性、可复算):**同一条原始证据** ⇒ 只算**一份独立支持**;
     *   同证据的其他说法一律计入 `transmittals`(转述),并记下「与谁同源」。
     *   为什么键里**必须**有证据:这正是「三次转述不得算三份独立证明」——
     *   甲亲历、乙转述甲、丙再转述乙,三人的 `from` 各不相同、`floor` 各不相同,
     *   但 `evidenceKey` **是同一条** ⇒ 独立支持恒为 1。
     *   为什么**不**按 `from` 判:同一原文经甲传乙、乙传丙,from 每跳都变,
     *   拿 from 当判据会把一条链判成三份独立(正是要治的错读数)。
     * --------------------------------------------------------------- */
    function supportsOf(claims) {
        const seen = new Map();
        const transmittals = [];
        const list = Array.isArray(claims) ? claims : [];
        for (const c of list) {
            if (!c || c.revoked) continue;
            const key = c.evidenceKey;
            if (!key) continue;
            if (seen.has(key)) {
                /* 同证据:算转述,**不计入独立支持**,但必须可见(含同源对象)。 */
                transmittals.push({
                    traceId: c.traceId, character: c.character, side: c.side,
                    evidenceKey: key, distinctFrom: seen.get(key).traceId,
                    fromCharacter: seen.get(key).character
                });
                seen.get(key).count++;
                continue;
            }
            seen.set(key, {
                traceId: c.traceId, evidenceKey: key, character: c.character, side: c.side,
                statement: c.statement, statementKey: c.statementKey, state: c.state,
                strength: c.strength, via: c.via, floor: c.floor, count: 1
            });
        }
        const independent = [...seen.values()];
        return {
            independent: independent,
            independentCount: independent.length,
            transmittals: transmittals,
            transmittalCount: transmittals.length,
            /* 一手支持(亲历/书证)**单独报数**:它是「为什么这条更硬」的落点,
             *   但**不**用它去裁真相(那只报事实,不判对错)。 */
            firsthandCount: independent.filter((x) => x.state === 'witnessed').length
        };
    }
    /* ---------------------------------------------------------------
     * 未裁决说法(**M4-X5 验收 (c) 的落点:全保留,三档分列**)
     *   是否「对立」:立场相异(side 不只有一个),或说法文本归一后不相同。
     *   三档的判据(**顺序执行,先判到的档为准** —— 顺序本身就是「为什么」的优先级):
     *     transmittal-only —— 该说法**没有任何一手证据**(state 为 relayed):
     *         「三个人都说」但没人亲眼见过,不足以定案;
     *     below-threshold  —— 该说法最强的一条也只到 weak/none:证据太弱;
     *     ambiguous        —— 说法在门槛之上、却与其他说法对立:真正判不开的那一档。
     *   三条**都进 disputes**(不裁剪),各自带 `kind` 与理由 —— 「未裁决」不是
     *   一个布尔,而是三种处境,合成一格就再也说不出「为什么」。
     * --------------------------------------------------------------- */
    function disputesOf(supports) {
        const empty = { contested: false, items: [], kinds: { 'ambiguous': 0, 'below-threshold': 0, 'transmittal-only': 0 } };
        const ind = (supports && Array.isArray(supports.independent)) ? supports.independent : [];
        if (ind.length < 2) return empty;
        const sides = new Set(ind.map((x) => x.side));
        const texts = new Set(ind.map((x) => x.statementKey));
        const opposed = sides.size > 1 || texts.size > 1;
        if (!opposed) return empty;
        const items = [];
        const kinds = { 'ambiguous': 0, 'below-threshold': 0, 'transmittal-only': 0 };
        for (const x of ind) {
            let kind;
            if (x.state === 'relayed') kind = 'transmittal-only';
            else if (x.strength === 'weak' || x.strength === 'none') kind = 'below-threshold';
            else if (x.state === 'witnessed') kind = 'ambiguous';
            else kind = 'ambiguous';
            kinds[kind]++;
            items.push({
                character: x.character, statement: x.statement, side: x.side, kind: kind,
                state: x.state, strength: x.strength, evidenceKey: x.evidenceKey,
                floor: x.floor, traceId: x.traceId
            });
        }
        return { contested: true, items: items, kinds: kinds };
    }
    /* ---------------------------------------------------------------
     * 事件争议状态(`stateOfOf`:四态,不得压格)
     *   判定序(确定性):
     *     1 有说法且全已被撤回 ⇒ withdrawn(**不静默保留一个没人能举证的 contested**);
     *     2 有独立支持且存在对立未裁决说法 ⇒ contested;
     *     3 有独立支持、无对立 ⇒ supported;
     *     4 无独立支持(全转述 / 全低于门槛)⇒ undecided;
     *     5 无任何说法 ⇒ undecided(带 reason:'no-testimony')。
     * --------------------------------------------------------------- */
    function stateOfOf(read) {
        const r = read || {};
        const claims = Array.isArray(r.testimonies) ? r.testimonies : [];
        const alive = claims.filter((c) => !c.revoked);
        const allRevoked = claims.length > 0 && alive.length === 0;
        if (allRevoked) return { state: 'withdrawn', reason: 'all-revoked' };
        if (!claims.length) return { state: 'undecided', reason: 'no-testimony' };
        const sup = r.supports || supportsOf(alive);
        const dis = r.disputes || disputesOf(sup);
        if (dis.contested) return { state: 'contested', reason: 'unresolved-dispute' };
        if (sup.independentCount > 0) return { state: 'supported', reason: 'single-side-support' };
        return { state: 'undecided', reason: sup.transmittalCount ? 'transmittal-only' : 'below-threshold' };
    }
    /* ---------------------------------------------------------------
     * 揭密前后分面(M4-X5 验收 (d) 前半:揭密前后视角不同)
     *   identity 是 knowledge-trace 的既有口径(surface / revealed / homonym / unspecified)。
     *   本模块把身份面**分列**(不是合并):揭穿前的「明面身份」认知与揭穿后的
     *   真实身份认知混在一格,就查不出「他是什么时候改口的」——
     *   故输出 { surface:[], revealed:[], homonym:[], unspecified:[], split }。
     *   `split` = 两个身份面**各有说法** ⇒ 揭密前后确实各有一套视角。
     * --------------------------------------------------------------- */
    function identitiesOf(claims) {
        const buckets = { surface: [], revealed: [], homonym: [], unspecified: [] };
        for (const c of (Array.isArray(claims) ? claims : [])) {
            if (!c || typeof c !== 'object') continue;
            const id = clip(c.identity, 24);
            const b = Object.prototype.hasOwnProperty.call(buckets, id) ? id : 'unspecified';
            buckets[b].push({ character: c.character, statement: c.statement, side: c.side, floor: c.floor, evidenceKey: c.evidenceKey });
        }
        return {
            surface: buckets.surface.slice(0, MAX_PER_SIDE),
            revealed: buckets.revealed.slice(0, MAX_PER_SIDE),
            homonym: buckets.homonym.slice(0, MAX_PER_SIDE),
            unspecified: buckets.unspecified.slice(0, MAX_PER_SIDE),
            split: buckets.surface.length > 0 && buckets.revealed.length > 0
        };
    }
