    /* ---------------------------------------------------------------
     * 撤回更新争议状态(M4-X5 验收 (d) 后半)
     *   输入:`dropped` = 被撤证据键清单(或 knowledge-trace `dropByFloor` 的 removed
     *   轨迹 id 清单 —— 两种都收,按 evidenceKey 或 traceId 匹配)。判定**不静默**:
     *     · 命中说法标 `revoked:true`,并**列进 revokedItems**(不删);
     *     · 重算状态:撤到无独立支持 ⇒ undecided / withdrawn(不退化成 contested);
     *     · 未命中的证据**一条不动**(撤一条不等于撤一批)。
     * --------------------------------------------------------------- */
    function revokeEvidence(read, dropped) {
        const r = (read && typeof read === 'object') ? read : {};
        const list = Array.isArray(dropped) ? dropped : [];
        const keys = new Set(list.map((x) => clip((x && typeof x === 'object') ? (x.evidenceKey || x.traceId || x.id) : x, 120)).filter(Boolean));
        const out = {
            kind: TB_KIND + '@withdrawal', version: TB_VERSION,
            droppedCount: keys.size, revokedItems: [], unchanged: 0,
            stateBefore: r.state || '', stateAfter: '', changed: false, degraded: false
        };
        try {
            const items = Array.isArray(r.testimonies) ? r.testimonies : null;
            if (!items) { out.degraded = true; return out; }
            const next = items.map((c) => {
                const hit = (c && c.evidenceKey && keys.has(c.evidenceKey)) || (c && c.traceId && keys.has(c.traceId));
                if (!hit) { out.unchanged++; return Object.assign({}, c); }
                out.revokedItems.push({ character: c.character, evidenceKey: c.evidenceKey, traceId: c.traceId, was: c.state });
                return Object.assign({}, c, { revoked: true });
            });
            const sup = supportsOf(next);
            const dis = disputesOf(sup);
            const st = stateOfOf({ testimonies: next, supports: sup, disputes: dis });
            out.stateAfter = st.state;
            out.changed = out.stateAfter !== out.stateBefore;
            out.read = { testimonies: next, supports: sup, disputes: dis, state: st.state, reason: st.reason };
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }
    /* ---------------------------------------------------------------
     * 主聚合(纯函数、不抛)
     *
     * @param {Array} traces knowledge-trace 的轨迹数组(或已算好的 state 行);
     *   每项可带本模块额外识别的 `eventId` / `side` / `statement`;
     * @param {object} opts { event?:string, at?:number, normFact?:function, maxItems?:number }
     *   · event —— 只看该事件(不给则对每个事件各出一块);
     *   · at    —— 时点楼层(给了就只收 floor ≤ at 的说法);
     * @returns {object} { kind, version, at, boards:[{...}], counts, writesNothing, degraded }
     * --------------------------------------------------------------- */
    function build(traces, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const inject = typeof o.normFact === 'function' ? o.normFact : null;
        const at = floorOrNull(o.at);
        const maxItems = (Number.isFinite(Number(o.maxItems)) && Number(o.maxItems) >= 1) ? Math.floor(Number(o.maxItems)) : MAX_TESTIMONIES;
        const out = {
            kind: TB_KIND,
            version: TB_VERSION,
            at: at,
            atKnown: at !== null,
            event: clip(o.event, 120),
            boards: [],
            counts: {
                input: 0, used: 0, events: 0, claims: 0,
                witnessed: 0, relayed: 0, rebutted: 0, undecided: 0,
                malformed: 0, offEvent: 0, offTime: 0, noFloor: 0, noEventKey: 0
            },
            truncated: 0,
            malformedInput: false,
            /* ★ 立身之本:本模块**一个字节都不落盘**;写库仍归宿主。 */
            writesNothing: true,
            degraded: false
        };
        try {
            const list = Array.isArray(traces) ? traces : [];
            out.malformedInput = !Array.isArray(traces) && traces !== undefined && traces !== null;
            out.counts.input = list.length;
            const only = out.event;
            const byEvent = new Map();
            for (const raw of list) {
                const c = claimOf(raw, inject);
                if (!c) { out.counts.malformed++; continue; }
                if (only && c.eventKey !== only) { out.counts.offEvent++; continue; }
                if (!c.eventKey) { out.counts.noEventKey++; continue; }
                if (at !== null) {
                    if (c.floor === null) { out.counts.noFloor++; continue; }
                    if (c.floor > at) { out.counts.offTime++; continue; }
                }
                if (!byEvent.has(c.eventKey)) byEvent.set(c.eventKey, []);
                byEvent.get(c.eventKey).push(c);
                out.counts.used++;
                if (c.state === 'witnessed') out.counts.witnessed++;
                else if (c.state === 'relayed') out.counts.relayed++;
                else if (c.state === 'rebutted') out.counts.rebutted++;
                else out.counts.undecided++;
            }
            const keys = [...byEvent.keys()].sort();
            for (const k of keys) {
                const claims = byEvent.get(k);
                const sup = supportsOf(claims);
                const dis = disputesOf(sup);
                const st = stateOfOf({ testimonies: claims, supports: sup, disputes: dis });
                /* 按角色分面(**不产全知统一陈述** —— M4-X5「不做」第三条)。 */
                const dossiers = [];
                const seenChar = new Set();
                for (const c of claims) {
                    if (seenChar.has(c.character)) continue;
                    seenChar.add(c.character);
                    const mine = claims.filter((x) => x.character === c.character);
                    dossiers.push({
                        character: c.character,
                        statements: mine.slice(0, MAX_PER_SIDE).map((x) => ({
                            statement: x.statement, side: x.side, state: x.state,
                            strength: x.strength, via: x.via, from: x.from,
                            evidenceKey: x.evidenceKey, floor: x.floor, revoked: x.revoked
                        })),
                        count: mine.length,
                        revoked: mine.every((x) => x.revoked)
                    });
                }
                const identities = identitiesOf(claims);
                out.boards.push({
                    eventKey: k,
                    state: st.state,
                    reason: st.reason,
                    testimonies: claims.slice(0, maxItems).map((x) => ({
                        character: x.character, statement: x.statement, side: x.side, state: x.state,
                        strength: x.strength, via: x.via, from: x.from, evidenceKey: x.evidenceKey,
                        floor: x.floor, identity: x.identity, traceId: x.traceId, revoked: x.revoked
                    })),
                    supports: sup,
                    disputes: dis,
                    dossiers: dossiers,
                    identities: identities,
                    counts: {
                        testimonies: claims.length,
                        independent: sup.independentCount,
                        transmittals: sup.transmittalCount,
                        firsthand: sup.firsthandCount,
                        unresolved: dis.items.length
                    },
                    truncated: claims.length > maxItems
                });
                if (claims.length > maxItems) out.truncated += claims.length - maxItems;
            }
            out.counts.events = out.boards.length;
            out.counts.claims = out.counts.used;
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }
