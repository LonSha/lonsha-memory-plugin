/* ========================================================
 * return-gate.js — [v3.345.0 · M4-X7] 旧事重现的生成控频闸
 * (纯函数,零依赖)
 *
 * 【为什么需要这一面 / 修前缺口(不是「再建一套旧事匹配」)】
 *   M4-X7 点名的底座**已在盘上**,而且已交付:
 *     · fated-recall.js(v3.328.0 · F 包 M3-X8)—— 情境 → 触发键 → 候选
 *       (相关性 + 冷却 + 知情面)→ 策略三态,四步齐;并明写「候选只到
 *       **建议重现 + 来源**为止,不产出任何正文」;
 *     · recall-echo.js —— 前文回扣账本(待选 / 已回扣 / 已跳过);
 *     · injection-router.js —— 注入预算 owner(分区路由 + 裁剪);
 *     · smart-trigger.js / 设置存储 —— 既有控频开关载体。
 *   它们合起来**答不了 M4-X7 点名的这一问**:
 *     **「这条旧事此刻是**真的进了生成**,还是只给过提示 / 只被预览过?」**
 *   逐面看为什么答不了:
 *     1 **候选可注入 ≠ 生成管线真的用过**。fated-recall 的 `injectable`
 *       是一个**静态判断**(策略允许时给出的一组候选),不是「本轮实际
 *       进了允许的生成通道」的登记;读数上「给了 12 条可注入」与
 *       「真用了 1 条」**完全同形** —— 下游无从知道该不该再提;
 *     2 **没有动作生命周期**。fated-recall 的 `markShown` 只记「展示过」
 *       (纯冷却用);而**预览**(玩家看到提示后决定「这次不提」)与**使用**
 *       (真的把这条写进本轮生成)两种动作在账上**没有分列**。于是
 *       「预览了一下就取消」会**误消耗冷却**,下一轮想提也提不出来
 *       (M4-X7「不做」区明写「预览不消耗冷却」);
 *     3 **没有控频强度档**。fated-recall 的 POLICY 有 off / hint-only /
 *       inject 三态,但**默认**是什么、「重开/切回会不会重复轰炸」没有闸。
 *       M4-X7 验收明写:「默认提示,显式允许才自动注入」「重开/切回不
 *       重复轰炸」「可以『这次不提/少提这件事』」。
 *
 * 【本模块只做一件事:给「旧事重现」加一条**动作生命周期轴**,两个出口】
 *   · 生命周期三通道分列:preview(预览)/ shown(展示)/ used(真用)。
 *     **冷却只按 shown / used 落定,preview 一律不消耗**;
 *   · 控频强度档:默认 hint-only;**只有显式 inject 才产 injectable**;
 *   · 再问一遍的闸:同 (触发键, 旧事键) 在 REPEAT_WINDOW 楼内已 shown/used
 *     ⇒ 一律 held(reason `repeat-window`)。
 *   本模块**不自己存储**:状态由宿主持有(纯函数面,与 recall-echo 同规格);
 *   **不写任何账**、**不产任何正文**、**不删任何历史事实**。
 *
 * 【三条纪律(与 narrative-layer.js / testimony-board.js 同规格)】
 *   1 只读判定:不写库(写库仍由 index.js 的提取/事实账负责),只答闸问题;
 *   2 不抛:输入畸形一律降级为读数(degraded / malformed 计数),绝不外抛;
 *   3 不猜:反馈只是**呈现偏好**(less / never),不改动、不删除历史事实;
 *     情绪面**只读不判**(emotionUsed 恒 false),绝不据情绪改写候选或强制重现。
 *
 * 【可移植性说明】
 *   机制动机来自「把『建议』接到『真实生成』时,缺一条动作生命周期轴会让
 *   预览与使用同形、冷却被误消耗」这一通用失效形态;实现按本仓规范重写
 *   (零依赖、不抛、判据保守且可复算、读数齐备),未复制任何外部代码。
 * ======================================================== */(function (root) {
    'use strict';
    const RG_VERSION = 1;
    const RG_KIND = 'return_gate';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const TAB = String.fromCharCode(9);
    /** 动作生命周期三通道(**必须分列**:预览 / 展示 / 真用)。 */
    const CHANNELS = Object.freeze(['preview', 'shown', 'used']);
    const CHANNEL_LABEL = Object.freeze({
        preview: '预览',
        shown: '展示',
        used: '真用',
    });
    /** 只有**展示 / 真用**落冷却;**预览**一律不消耗(M4-X7 立身之本)。 */
    const COOLDOWN_CHANNELS = Object.freeze(['shown', 'used']);
    /** 控频强度档(**默认 hint-only**:显式 inject 才自动注入)。 */
    const POLICY = Object.freeze({ OFF: 'off', HINT: 'hint-only', INJECT: 'inject' });
    const POLICY_LABEL = Object.freeze({
        off: '关停',
        'hint-only': '只给提示',
        inject: '可自动注入',
    });
    /** 反馈 = **呈现偏好**(不改动、不删除历史事实;M4-X7 明写)。 */
    const PREFERENCE = Object.freeze({ NORMAL: 'normal', LESS: 'less', NEVER: 'never' });
    /** 候选闸态(**穷尽**:任何候选必须落入其中一格,不得现编态名)。 */
    const GATE = Object.freeze(['open', 'held', 'blocked']);
    const GATE_LABEL = Object.freeze({
        open: '可提',
        held: '本次押后',
        blocked: '不出',
    });
    /** 候选类别(**穷尽**,与 fated-recall 的触发四类同形但**不复用其常量**)。 */
    const KINDS = Object.freeze(['place', 'anniversary', 'item', 'person']);
    /** 单次最多带回几条(有界,防灌爆注入面)。 */
    const MAX_CANDIDATES = 12;
    /** 单条摘要最多几字。 */
    const SNIPPET_MAX = 72;
    /** 重复轰炸窗口(楼数):同 (触发键, 旧事键) 在窗口内已 shown/used ⇒ held。 */
    const REPEAT_WINDOW = 3;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 / M4-X6 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(读数里不得混进换行)。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /** 键归一(去首尾空白;非串给空串)。 */
    function keyOf(v) {
        return oneLine(v == null ? '' : v);
    }
    /** 文本化(缺省空串)。 */
    function strOf(v) {
        return v == null ? '' : String(v);
    }
    /** 数组归一(非数组 ⇒ 空数组;不丢原元素,只做浅拷贝)。 */
    function arrOf(v) {
        return Array.isArray(v) ? v.slice() : [];
    }
    /** 数值归一(没给 ⇒ null;布尔 / 对象 / 函数 ⇒ null,不拿 0 冒充「就是 0」)。 */
    function numOr(v, dflt) {
        if (v === null || v === undefined || v === '') return (dflt === undefined ? null : dflt);
        if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return (dflt === undefined ? null : dflt);
        const n = Number(v);
        return Number.isFinite(n) ? n : (dflt === undefined ? null : dflt);
    }
    /** 楼层:只认 number 与非空整数串;其余如实 null(**不编 0**:0 是「第 0 楼」)。 */
    function floorOf(v) {
        const n = numOr(v, null);
        if (n === null) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    /** FNV-1a 32 位(与 X6 / X5 同口径,供键指纹用)。 */
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    /** 试算(绝不外抛:坏实现一律回落 fallback)。 */
    function safe(fn, fallback) {
        try {
            const r = fn();
            return (r === undefined) ? fallback : r;
        } catch (_e) { return fallback; }
    }
    /** 同值判定(原始值直接比;对象按稳定序列化比)。 */
    function sameValue(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (_e) { return false; }
    }/* ---------------------------------------------------------------
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
    }/** 候选归一(只读:缺字段**如实留空**,不猜)。 */
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
    }/** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5 / M4-X6 同口径)。 */
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
    }/** 人读渲染(**只给建议与来源与闸态**,不产出正文)。 */
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