/* ---------------------------------------------------------------
     * 状态归一(**宿主状态是唯一真源**;本模块只读它、只在显式调用时返回新状态)
     *   形态:{ marks: [{ triggerKey, detailKey, channel, floor, at }], prefs: { [detailKey]: pref } }
     *   纪律:非对象 ⇒ 空态;畸形条目**丢弃并计数**(不猜、不修);
     *        marks 只保留**合法通道**的条目(不得现编通道名)。
     * --------------------------------------------------------------- */
    function normState(state) {
        const out = { marks: [], prefs: {} };
        let dropped = 0;
        const src = (state && typeof state === 'object' && !Array.isArray(state)) ? state : {};
        const marks = arrOf(src.marks);
        for (const m of marks) {
            if (!m || typeof m !== 'object' || Array.isArray(m)) { dropped++; continue; }
            const ch = keyOf(m.channel);
            if (CHANNELS.indexOf(ch) < 0) { dropped++; continue; }
            const tk = keyOf(m.triggerKey);
            const dk = keyOf(m.detailKey);
            if (!tk && !dk) { dropped++; continue; }
            out.marks.push({
                triggerKey: tk,
                detailKey: dk,
                channel: ch,
                floor: floorOf(m.floor),
                at: numOr(m.at, null),
            });
        }
        const prefs = (src.prefs && typeof src.prefs === 'object' && !Array.isArray(src.prefs)) ? src.prefs : {};
        for (const k of Object.keys(prefs)) {
            const p = keyOf(prefs[k]);
            if (Object.keys(PREFERENCE).every((x) => PREFERENCE[x] !== p)) { dropped++; continue; }
            out.prefs[keyOf(k)] = p;
        }
        return { state: out, dropped: dropped };
    }
    /** 一条标记的比对键(同键同通道同楼 ⇒ 重复登记不入库)。 */
    function markKeyOf(rec) {
        return [keyOf(rec && rec.triggerKey), keyOf(rec && rec.detailKey), keyOf(rec && rec.channel), String(floorOf(rec && rec.floor))].join('#');
    }
    /**
     * 登记一次动作(**三通道分列**)。返回 { ok, reason, changed, state }。
     *   · 通道非法 ⇒ ok:false / reason 'bad-channel'(不猜成某个通道);
     *   · 同键同通道同楼 ⇒ changed:false / reason 'duplicate'(幂等,不重复计);
     *   · **本函数不理解「冷却」**:冷却由 cooldownOf 读,**预览标记照记但不算冷却**。
     */
    function markChannel(state, rec) {
        const nm = normState(state);
        const r = (rec && typeof rec === 'object') ? rec : {};
        const ch = keyOf(r.channel);
        if (CHANNELS.indexOf(ch) < 0) {
            return { ok: false, reason: 'bad-channel', changed: false, state: nm.state, noticed: nm.dropped };
        }
        const tk = keyOf(r.triggerKey);
        const dk = keyOf(r.detailKey);
        if (!tk && !dk) {
            return { ok: false, reason: 'missing-key', changed: false, state: nm.state, noticed: nm.dropped };
        }
        const entry = { triggerKey: tk, detailKey: dk, channel: ch, floor: floorOf(r.floor), at: numOr(r.at, null) };
        const k = markKeyOf(entry);
        const seen = nm.state.marks.some((m) => markKeyOf(m) === k);
        if (seen) {
            return { ok: true, reason: 'duplicate', changed: false, state: nm.state, channel: ch, noticed: nm.dropped };
        }
        const next = { marks: nm.state.marks.concat([entry]), prefs: Object.assign({}, nm.state.prefs) };
        return { ok: true, reason: 'marked', changed: true, state: next, channel: ch, noticed: nm.dropped };
    }
    /** 呈现偏好(读)。未记录 ⇒ known:false(**与 normal 不同形**)。 */
    function preferenceOf(state, detailKey) {
        const nm = normState(state);
        const dk = keyOf(detailKey);
        if (!Object.prototype.hasOwnProperty.call(nm.state.prefs, dk)) {
            return { pref: PREFERENCE.NORMAL, known: false, why: 'no-pref-recorded(不读成默认 normal)' };
        }
        return { pref: nm.state.prefs[dk], known: true, why: '' };
    }
    /**
     * 设呈现偏好(**只记偏好,不动历史事实**)。
     *   非法偏好 ⇒ ok:false / reason 'bad-pref';normal ⇒ 删除记录(回默认)。
     */
    function withPreference(state, detailKey, pref) {
        const nm = normState(state);
        const p = keyOf(pref);
        if (Object.keys(PREFERENCE).every((x) => PREFERENCE[x] !== p)) {
            return { ok: false, reason: 'bad-pref', changed: false, state: nm.state };
        }
        const dk = keyOf(detailKey);
        if (!dk) return { ok: false, reason: 'missing-key', changed: false, state: nm.state };
        const prefs = Object.assign({}, nm.state.prefs);
        const had = Object.prototype.hasOwnProperty.call(prefs, dk);
        if (p === PREFERENCE.NORMAL) {
            if (!had) return { ok: true, reason: 'noop', changed: false, state: nm.state };
            delete prefs[dk];
            return { ok: true, reason: 'cleared', changed: true, state: { marks: nm.state.marks.concat([]), prefs: prefs } };
        }
        if (had && prefs[dk] === p) return { ok: true, reason: 'noop', changed: false, state: nm.state };
        prefs[dk] = p;
        return { ok: true, reason: 'set', changed: true, state: { marks: nm.state.marks.concat([]), prefs: prefs } };
    }
    /**
     * 冷却面(**只认 shown / used**;preview 一律不消耗)。
     *   返回 { judged, cooled, window, hitCount, why, hits }。
     *   · 窗口未给 / 当前时间未给 ⇒ **未判**(judged:false)—— 不读成「无冷却」;
     *   · 命中判据:同 (触发键, 旧事键)、通道 ∈ COOLDOWN_CHANNELS、floor 落在
     *     当前楼 ± 窗口内(floor === null 的标记**不参与**命中,如实计入 noFloor)。
     */
    function cooldownOf(state, triggerKey, detailKey, nowFloor, opts) {
        const nm = normState(state);
        const o = opts || {};
        const win = numOr(o.window, null);
        const now = floorOf(nowFloor);
        const base = { window: win, hitCount: 0, hits: [], noFloor: 0 };
        if (win === null) return Object.assign({ judged: false, cooled: false, why: 'window 未给 ⇒ 冷却面未判(不读成无冷却)' }, base);
        if (now === null) return Object.assign({ judged: false, cooled: false, why: '当前楼层未给 ⇒ 冷却面未判' }, base);
        const tk = keyOf(triggerKey);
        const dk = keyOf(detailKey);
        const hits = [];
        let noFloor = 0;
        for (const m of nm.state.marks) {
            if (COOLDOWN_CHANNELS.indexOf(m.channel) < 0) continue;   /* **预览不算** */
            if (m.triggerKey !== tk || m.detailKey !== dk) continue;
            if (m.floor === null) { noFloor++; continue; }
            if (m.floor <= now && m.floor >= now - win) hits.push(m);
        }
        return {
            judged: true,
            cooled: hits.length > 0,
            window: win,
            hitCount: hits.length,
            hits: hits,
            noFloor: noFloor,
            why: '',
        };
    }
    /** 冷却归因(把命中按通道拆开说,便于诊断面点名)。 */
    function cooldownByChannel(hits) {
        const out = { shown: 0, used: 0 };
        for (const m of arrOf(hits)) {
            if (m && m.channel === 'shown') out.shown++;
            else if (m && m.channel === 'used') out.used++;
        }
        return out;
    }