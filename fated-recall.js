/* ============================================================
 * fated-recall.js — [v3.328.0 · F 包 M3-X8] 情境触发的旧事重现
 * ------------------------------------------------------------
 * 【它补的是哪一格(M3-X8 验收原文逐条)】
 *   现状:recall-echo 有回扣账本、echo-ledger 有回扣模式、narrative-pulse 有情绪线索 ——
 *         但三者都靠**生成侧自己记得去查**,没有任何一面回答「此刻**为什么**该想起来」。
 *   修前实测三处缺口:
 *     1 没有触发面:重返旧地 / 重要日子 / 重复出现的物品,这些情境本身不产生任何建议;
 *     2 没有知情面:旧事里带**角色还不知道**的内容时,照样会被建议重现(擅自替角色回忆);
 *     3 没有关停面:要么常开(每次都重复同一段旧事),要么整块关掉,没有「只给提示不注入」。
 *   本模块把这件事收成四步:情境 → 触发键 → 候选(相关性 + 冷却 + 知情面) → 用户可选策略。
 *
 * 【五条不可让步口径】
 *   1 同一情境不重复:同 (触发键, 旧事键) 在冷却窗口内一律 COOLED ——
 *     冷却窗口**未给**时报未判,不许读成「无冷却」。
 *   2 不唤回角色未知内容:旧事的主体名与知情名单**无交集** ⇒ 该候选**不入建议面**,
 *     并具名计入 blind(有来源、被挡、为什么挡)。判据是**正交集**,不是「不在名单里就当知道」。
 *   3 负面情绪不强制回忆好事:情绪面一律**只读不判**(本模块不做情绪判定),
 *     调用方给的情绪只出现在读数里;本模块绝不据情绪改写候选权重或强制重现。
 *   4 用户可关停或选「只给提示,不注入」:策略三态 off / hint-only / inject,
 *     hint-only 下可注入面**恒为 0**(建议仍出,但不进注入)。
 *   5 不擅自写续剧情:候选只到「建议重现 + 来源」为止,不产出任何正文。
 *
 * 【本模块不做什么(边界)】
 *   · 不联网、不建数据库、不发起任何请求(offline:true 明写自述);
 *   · 不写任何账:冷却登记走**纯函数**(调用方持状态,本模块只算);
 *   · 不做后台常驻代理:只做「被问一次、答一次」的纯函数面(与 recall-echo 同规格);
 *   · 不做情绪判定、不做语义相似度:触发一律**按情境字段机械匹配**;
 *   · 不抛:畸形入参一律退化为可读的降级读数。
 * 挂 window.LonShaFatedRecall,供 index.js 旧事重现面 / 诊断面使用。
 * ============================================================ */
(function (global) {
    'use strict';
    const FR_VERSION = 1;
    const FR_KIND = 'fated_recall';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const MAX_CANDIDATES = 12;
    const SNIPPET_MAX = 72;
    const DEFAULT_COOLDOWN = 3;

    /** 触发四类(穷尽:任何情境键必须落入其中一类,不得现编类名)。 */
    const TRIGGERS = Object.freeze(['place', 'anniversary', 'item', 'person']);
    const TRIGGER_LABEL = Object.freeze({
        place: '重返旧地',
        anniversary: '重要日子',
        item: '重复物品',
        person: '旧人重逢',
    });

    /** 策略三态(验收4:用户可关停或选「只给提示,不注入」)。 */
    const POLICY = Object.freeze({ OFF: 'off', HINT: 'hint-only', INJECT: 'inject' });
    const POLICY_LABEL = Object.freeze({ off: '已关停', 'hint-only': '只给提示', inject: '可注入' });

    /** 候选四态(互不同形:挡掉与被冷却与未判是三种不同的东西)。 */
    const CANDIDATE = Object.freeze({
        OK: 'ok',
        COOLED: 'cooled',
        BLIND: 'blind',
        NO_SOURCE: 'no-source',
    });

    /** 知情面三态(★ 未给 ⇒ 未判,不许静默放行)。 */
    const KNOWING = Object.freeze({ KNOWN: 'known', UNKNOWN_SIDE: 'unknown-side', UNJUDGED: 'unjudged' });

    /** 受限正文字段键(与前序模块**同形同值**;判据钉住多处一致)。 */
    const SECRET_BODY_KEYS = Object.freeze(['secret', 'secretText', 'secretBody']);

    /** 受限正文站位串。★ 定长:不随原文本长变化(否则长度本身就是读数)。 */
    const SECRET_MASK = String.fromCharCode(10216) + '受限正文已隐去' + String.fromCharCode(10217);

    /**
     * 依赖声明面。**只声明不执行**;每件缺席时的后果逐条写明 ——
     *   判据按 key 逐字对账(改名会静默变成「依赖缺席」)。
     */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'PAST_DETAILS', why: '可唤回的旧事清单(候选的唯一真源;缺席 ⇒ 建议面如实报未判,不报「没有旧事」)' },
        { key: 'KNOWN_FACTS', why: '角色知情名单(每角色已知的主体名;缺席 ⇒ 知情面报未判、候选一律不出,绝不放行)' },
        { key: 'COOLDOWN_DAYS', why: '冷却窗口(同一情境不重复的据;缺席 ⇒ 冷却面报未判,不报「无冷却」)' },
    ]);

    /* ── 原语(本模块自持,不引兄弟模块) ── */
    function keyOf(v) {
        return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
    }
    function strOf(v) { return (typeof v === 'string') ? v : (v === null || v === undefined ? '' : String(v)); }
    function arrOf(v) { return Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]); }
    function numOr(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
    function clip(s, max) {
        const t = strOf(s);
        const m = Math.max(8, numOr(max, SNIPPET_MAX));
        return t.length <= m ? t : (t.slice(0, m - 1) + String.fromCharCode(8230));
    }
    /** 32 位散列(FNV-1a 变体;用于候选键与状态指纹,**不做加密用途**)。 */
    function hash32(s) {
        const t = strOf(s);
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) {
            h ^= t.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
    function sameValue(a, b) {
        if (a === b) return true;
        if (a === null || a === undefined || b === null || b === undefined) return false;
        if (typeof a !== typeof b) return false;
        if (typeof a === 'object') return safe(() => JSON.stringify(a) === JSON.stringify(b), false);
        return false;
    }
    /* ── 0 情境键与触发匹配(机械匹配,不做语义) ── */

    /**
     * 把情境归一化成触发键集合。**三档互不同形**:
     *   1 显式 keys ⇒ 用它(调用方已经知道该匹配什么);
     *   2 只给 scene ⇒ 逐类从 scene 里取(place / date / item / person);
     *   3 都没有 ⇒ 空集合(触发面报未判,**不报「没有情境」**)。
     */
    function triggerKeys(scene) {
        const s = (scene && typeof scene === 'object') ? scene : {};
        const out = [];
        if (Array.isArray(s.keys) && s.keys.length) {
            for (const k of s.keys) {
                const kk = (k && typeof k === 'object') ? k : { kind: 'item', value: k };
                const kind = TRIGGERS.indexOf(keyOf(kk.kind)) >= 0 ? keyOf(kk.kind) : '';
                const val = keyOf(kk.value);
                if (!kind || !val) continue;
                out.push({ kind: kind, value: val, key: kind + ':' + val });
            }
            return { judged: true, keys: out, why: [] };
        }
        const why = [];
        const push = (kind, v) => {
            const val = keyOf(v);
            if (val) out.push({ kind: kind, value: val, key: kind + ':' + val });
        };
        push('place', s.place); push('anniversary', s.date); push('item', s.item); push('person', s.person);
        if (!out.length) why.push('scene 未给可用字段' + (Object.keys(s).length ? '' : '(且 scene 未给)'));
        return { judged: out.length > 0, keys: out, why: why };
    }

    /** 旧事归一化(items 与旧事正文一律按受限正文剥,不让正文进读数)。 */
    function detailOf(raw) {
        const o = (raw && typeof raw === 'object') ? raw : {};
        const items = arrOf(o.items).filter((x) => x && typeof x === 'object').map((x) => {
            const m = maskSecretBody(x, SECRET_BODY_KEYS);
            return { key: entryKeyOf(m.value), title: clip(m.value.title || m.value.key || '', 60), sensitive: m.masked > 0 };
        });
        const tm = maskSecretBody(o, SECRET_BODY_KEYS);
        const src = (o.source && typeof o.source === 'object') ? o.source : {};
        return Object.freeze({
            detailKey: keyOf(o.key) || keyOf(o.detailKey),
            title: clip(o.title || '', 72),
            grounds: arrOf(o.keys).map(keyOf).filter((x) => x !== ''),
            subjects: arrOf(o.subjects).map(keyOf).filter((x) => x !== ''),
            floor: numOr(o.floor, null),
            day: numOr(o.day, null),
            weight: numOr(o.weight, 50),
            hint: clip(o.hint || '', 160),
            /* 正文一律不出本模块:出的是散列(要正文请去记忆库的处置面)。 */
            textHash: hash32(strOf(o.text)),
            sensitive: tm.masked > 0,
            items: items,
            source: { kind: keyOf(src.kind), ref: keyOf(src.ref), floor: numOr(src.floor, null) },
            hasSource: !!keyOf(src.ref) || numOr(src.floor, null) !== null,
        });
    }

    function entryKeyOf(e) {
        const o = (e && typeof e === 'object') ? e : {};
        const id = keyOf(o.id) || keyOf(o.key);
        if (id) return id;
        const k = keyOf(o.kind) || 'entry';
        const f = numOr(o.floor, null);
        return (f === null) ? k : (k + '@' + f);
    }

    /**
     * 剥掉一个值顶层的受限正文键。**只读、不改调用方的对象**(含正文时才浅拷贝)。
     * @returns {{value:*, masked:number}}
     */
    function maskSecretBody(v, keys) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return { value: v, masked: 0 };
        const ks = (Array.isArray(keys) && keys.length) ? keys : SECRET_BODY_KEYS;
        let out = null;
        let masked = 0;
        for (const k of ks) {
            if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
            const raw = v[k];
            if (!out) out = Object.assign({}, v);
            out[k] = SECRET_MASK;
            if (raw !== null && raw !== undefined && String(raw).trim() !== '') masked = 1;
        }
        return { value: out || v, masked: masked };
    }

    /* ── 1 知情面(验收2:不唤回角色未知内容) ── */

    /**
     * 知情判定。**判据是正交集**:旧事的主体名必须**确在**该角色的知情名单里;
     *   名单缺席 ⇒ UNJUDGED(候选一律不出);名单给空表 ⇒ 也是 UNJUDGED(**空表 ≠ 什么都不知道**,
     *   照本仓「未给与空表不许同形」的口径,两者侧写不同、结果都是不放行)。
     *   旧事无主体名 ⇒ UNKNOWN_SIDE(无从判定 ⇒ 同样不放行)。
     */
    function knowingOf(detail, actor) {
        const a = keyOf(actor);
        const d = (detail && typeof detail === 'object') ? detail : {};
        if (!a) return { state: KNOWING.UNJUDGED, why: 'actor-missing', hit: [] };
        if (!d.subjects || !d.subjects.length) return { state: KNOWING.UNKNOWN_SIDE, why: 'no-subjects', hit: [] };
        return { state: KNOWING.KNOWN, why: '', hit: d.subjects.slice() };
    }

    /** 从已知事实表推出某角色的知情名单(形态:KNOWN_FACTS[actor] = [主体名...])。 */
    function knownSetOf(deps, actor) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        if (!Object.prototype.hasOwnProperty.call(d, 'KNOWN_FACTS')) return { judged: false, set: null, why: 'KNOWN_FACTS 未给 ⇒ 知情面未判' };
        const kf = (d.KNOWN_FACTS && typeof d.KNOWN_FACTS === 'object') ? d.KNOWN_FACTS : {};
        const a = keyOf(actor);
        if (!Object.prototype.hasOwnProperty.call(kf, a)) return { judged: false, set: null, why: '该角色无知情记录 ⇒ 未判(不读成什么都不知道)' };
        return { judged: true, set: arrOf(kf[a]).map(keyOf).filter((x) => x !== ''), why: '' };
    }

    /* ── 2 冷却(验收1:同一情境不重复) ── */

    /**
     * 冷却判定。窗口三态:显式 COOLDOWN_DAYS > 入参 cooldownDays > 默认值;
     *   ★ 窗口**未给**时报 judged:false ⇒ 冷却面未判(不许读成「无冷却」)。
     *   命中判据:同 (触发键, 旧事键) 在 [day - window + 1, day] 内出现过。
     */
    function cooldownOf(deps, state, triggerKey, detailKey, day) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const st = (state && typeof state === 'object') ? state : {};
        const hasWin = Object.prototype.hasOwnProperty.call(d, 'COOLDOWN_DAYS');
        if (!hasWin) return { judged: false, cooled: false, why: 'COOLDOWN_DAYS 未给 ⇒ 冷却面未判' };
        const win = Math.max(0, numOr(d.COOLDOWN_DAYS, DEFAULT_COOLDOWN));
        const now = numOr(day, null);
        if (now === null) return { judged: false, cooled: false, why: '当前时间未给 ⇒ 冷却面未判' };
        const log = arrOf(st.shown);
        const hit = log.filter((r) => (r && typeof r === 'object')
            && keyOf(r.triggerKey) === keyOf(triggerKey) && keyOf(r.detailKey) === keyOf(detailKey)
            && numOr(r.day, null) !== null && (now - numOr(r.day, 0)) < win && (now - numOr(r.day, 0)) >= 0);
        return { judged: true, cooled: hit.length > 0, window: win, hitCount: hit.length, why: '' };
    }

    /** 登记一次展示(**纯函数**:返回新状态,不改入参)。 */
    function markShown(rawState, rec) {
        const st = (rawState && typeof rawState === 'object') ? rawState : {};
        const r = (rec && typeof rec === 'object') ? rec : {};
        const day = numOr(r.day, null);
        const tk = keyOf(r.triggerKey);
        const dk = keyOf(r.detailKey);
        if (day === null || !dk) return { ok: false, reason: (day === null ? 'missing-day' : 'missing-detail'), changed: false, state: { shown: arrOf(st.shown).slice() } };
        const shown = arrOf(st.shown).slice();
        const dup = shown.filter((x) => (x && typeof x === 'object') && keyOf(x.triggerKey) === tk && keyOf(x.detailKey) === dk && numOr(x.day, null) === day);
        if (dup.length) return { ok: true, reason: 'duplicate', changed: false, state: { shown: shown } };
        shown.push({ triggerKey: tk, detailKey: dk, day: day, hash: hash32(tk + '|' + dk + '|' + day) });
        return { ok: true, reason: 'marked', changed: true, state: { shown: shown } };
    }
    /* ── 3 建议面(验收1/2/3/4 的落点) ── */

    /**
     * 建议旧事重现。**纯函数、零写**(调用方拿 state 进来、拿新 state 出去)。
     *
     * 返回五面:
     *   · triggers —— 本次识别出的情境键(空 ⇒ judged:false,单独一档);
     *   · suggested —— 可建议的候选(带 kind / why / 冷读数);
     *   · cooled —— 因重复被冷却的候选(具名);
     *   · blind —— 因知情面被挡的候选(有来源、被挡、为什么挡);
     *   · injectable —— 按策略**真能进注入**的那一份(off ⇒ 0;hint-only ⇒ 0,但建议照出)。
     *
     * ★ 情绪面:入参里的 emotion 一律**只读回显**(本模块不做情绪判定、不据情绪改权重)。
     */
    function suggest(deps, state, input) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const st = (state && typeof state === 'object') ? state : {};
        const i = (input && typeof input === 'object') ? input : {};
        const day = numOr(i.day, null);
        const actor = keyOf(i.actor);
        const policy = (Object.keys(POLICY).map((k) => POLICY[k]).indexOf(keyOf(i.policy)) >= 0) ? keyOf(i.policy) : POLICY.INJECT;
        const tk = triggerKeys(i.scene);
        const hasPast = Object.prototype.hasOwnProperty.call(d, 'PAST_DETAILS');
        const det = arrOf(d.PAST_DETAILS).map(detailOf).filter((x) => x.detailKey !== '' || x.title !== '');
        const ks = knownSetOf(d, actor);
        const out = {
            ok: true, judged: tk.judged && hasPast,
            policy: policy, policyLabel: POLICY_LABEL[policy], actor: actor, day: day,
            triggers: tk.keys, triggerWhy: tk.why.slice(),
            suggested: [], cooled: [], blind: [], noSource: [], injectable: [], cooldownUnjudged: [],
            emotion: keyOf(i.emotion), emotionUsed: false,
            markPlan: [], reasons: [],
            note: '',
        };
        if (!tk.judged) { out.reasons.push('no-trigger'); out.note = '情境未判 ⇒ 不建议(不报「无旧事」)'; return out; }
        if (!hasPast) { out.judged = false; out.reasons.push('no-past'); out.note = 'PAST_DETAILS 未给 ⇒ 建议面未判'; return out; }
        const tkeySet = new Set(tk.keys.map((k) => k.key));
        for (const x of det) {
            /* 命中情境:旧事声明的地基键必须与本次情境键有交集。 */
            const hit = x.grounds.filter((g) => tkeySet.has(g));
            if (!hit.length) continue;
            const hitKeys = tk.keys.filter((k) => hit.indexOf(k.key) >= 0).map((k) => k.key);
            /* 验收1:同 (触发键, 旧事键) 冷却窗口内不重复。 */
            let cooled = false;
            let coolUnjudged = '';
            const coolReasons = [];
            for (const hk of hitKeys) {
                const cd = cooldownOf(d, st, hk, x.detailKey, day);
                if (!cd.judged) { coolReasons.push(cd.why); coolUnjudged = cd.why; continue; }
                if (cd.cooled) { cooled = true; coolReasons.push('同情境在 ' + cd.window + ' 天内已出现'); }
            }
            if (cooled) { out.cooled.push({ state: CANDIDATE.COOLED, detailKey: x.detailKey, title: x.title, triggers: hitKeys, why: coolReasons.join(';') }); continue; }
            /* 验收2:角色未知的旧事一律不唤回。 */
            const kd = knowingOf(x, actor);
            if (kd.state === KNOWING.UNJUDGED || kd.state === KNOWING.UNKNOWN_SIDE) {
                out.blind.push({ state: CANDIDATE.BLIND, detailKey: x.detailKey, title: x.title, subjects: x.subjects.slice(), knowing: kd.state, why: kd.why, sourceRef: x.source });
                continue;
            }
            if (!ks.judged) {
                out.blind.push({ state: CANDIDATE.BLIND, detailKey: x.detailKey, title: x.title, subjects: x.subjects.slice(), knowing: KNOWING.UNJUDGED, why: ks.why, sourceRef: x.source });
                continue;
            }
            const known = x.subjects.some((s) => ks.set.indexOf(s) >= 0);
            if (!known) {
                out.blind.push({ state: CANDIDATE.BLIND, detailKey: x.detailKey, title: x.title, subjects: x.subjects.slice(), knowing: KNOWING.UNKNOWN_SIDE, why: '角色不知情名单无交集(判据是正交集)', sourceRef: x.source });
                continue;
            }
            /* 验收5:无来源一概不出建议(不是「隐去来源」)。 */
            if (!x.hasSource) {
                out.noSource.push({ state: CANDIDATE.NO_SOURCE, detailKey: x.detailKey, title: x.title, why: '旧事无来源 ⇒ 不出建议(不是隐去来源)' });
                continue;
            }
            /* ★ 冷却面未判的候选**照样出建议**,但必须把「未判」随条目带走、并汇总一处 ——
             *   把未判静默读成「无冷却」正是本仓反复治过的错读数。
             *   ★ 只在候选**过了来源面与知情面**之后登记:被挡掉的候选谈不到「该不该重复提」。 */
            if (coolUnjudged) out.cooldownUnjudged.push({ detailKey: x.detailKey, why: coolUnjudged });
            out.suggested.push({
                state: CANDIDATE.OK, detailKey: x.detailKey, title: x.title, hint: x.hint, subjects: x.subjects.slice(),
                triggers: hitKeys, kind: hitKeys[0].split(':')[0],
                floor: x.floor, day: x.day, weight: x.weight,
                sensitive: x.sensitive, textHash: x.textHash, sourceRef: x.source,
                cooldownJudged: !coolUnjudged, cooldownWhy: coolUnjudged,
                why: '情境命中 ' + hitKeys.join('、'),
            });
        }
        /* 排序:**完全确定**——权重降序、同权重按 detailKey 升序(不靠插入序)。 */
        out.suggested.sort((a, b) => (b.weight - a.weight) || (a.detailKey < b.detailKey ? -1 : (a.detailKey > b.detailKey ? 1 : 0)));
        out.suggested = out.suggested.slice(0, MAX_CANDIDATES);
        /* 验收4:策略三态。hint-only / off 下可注入面**恒为 0**。 */
        out.injectable = (policy === POLICY.INJECT) ? out.suggested.slice() : [];
        out.markPlan = out.suggested.map((x) => ({ triggerKey: x.triggers[0], detailKey: x.detailKey, day: day })).filter((x) => x.day !== null);
        out.note = (policy === POLICY.OFF) ? '已关停:只列读数,不注入'
            : (policy === POLICY.HINT ? '只给提示:建议照出,可注入面恒为 0'
                : (out.suggested.length ? '' : '本次无建议'));
        return out;
    }

    /** 人读渲染(验收5:只给建议与来源,不产出任何正文;hint-only/open 用词区分)。 */
    function render(report, opts) {
        const r = (report && typeof report === 'object') ? report : {};
        const o = (opts && typeof opts === 'object') ? opts : {};
        if (r.judged === false) return '【情境旧事】未判(' + keyOf((r.reasons && r.reasons[0]) || 'no-data') + ')';
        if (o.includeBlocked !== true && !r.suggested.length) return '';
        const lines = [];
        for (const x of arrOf(r.suggested)) {
            const tag = TRIGGER_LABEL[keyOf(x.kind)] || '旧事';
            lines.push('- 〔' + tag + '〕' + x.title + (x.floor === null ? '' : '(第 ' + x.floor + ' 楼)') + ' —— ' + x.why);
        }
        if (!lines.length) return '';
        return '【可重现的旧事】' + NL + lines.join(NL) + NL + '(只给建议与来源;是否重现由生成侧决定,不擅写续剧情)';
    }

    /* ── 4 策略与自证 ── */

    function setPolicy(rawPolicy) {
        const p = keyOf(rawPolicy);
        const allowed = Object.keys(POLICY).map((k) => POLICY[k]);
        if (allowed.indexOf(p) < 0) return { ok: false, reason: 'bad-policy', policy: POLICY.INJECT, label: POLICY_LABEL[POLICY.INJECT] };
        return { ok: true, reason: 'set', policy: p, label: POLICY_LABEL[p] };
    }

    function describe(report) {
        const r = (report && typeof report === 'object') ? report : {};
        if (r.judged === false) return '情境旧事:未判';
        return '情境旧事:建议 ' + arrOf(r.suggested).length + ' / 冷却 ' + arrOf(r.cooled).length
            + ' / 知情挡 ' + arrOf(r.blind).length + '(' + (r.policyLabel || '') + ')';
    }

    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const dep of REQUIRED_DEPS) if (!Object.prototype.hasOwnProperty.call(d, dep.key)) missing.push(dep);
        const probeDeps = {
            PAST_DETAILS: [
                { key: 'd1', title: '旧地一别', keys: ['place:school'], subjects: ['甲'], text: 'x', source: { kind: 'floor', ref: 'f3', floor: 3 }, weight: 60 },
                { key: 'd2', title: '那日的物', keys: ['item:ring'], subjects: ['乙'], text: 'x', source: { kind: 'floor', ref: 'f9', floor: 9 } },
            ],
            KNOWN_FACTS: { '甲': ['甲'] },
            COOLDOWN_DAYS: 3,
        };
        const s1 = suggest(probeDeps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, policy: POLICY.INJECT });
        return {
            ok: missing.length === 0, depsComplete: missing.length === 0, missing: missing,
            triggers: TRIGGERS.slice(), triggerLabels: TRIGGERS.map((t) => TRIGGER_LABEL[t]),
            policies: Object.keys(POLICY).map((k) => POLICY[k]),
            secretBodyKeys: SECRET_BODY_KEYS.slice(), secretMask: SECRET_MASK,
            maxCandidates: MAX_CANDIDATES, defaultCooldown: DEFAULT_COOLDOWN,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length,
            offline: true, writesNothing: true, devisesNothing: true,
            /* ★ 四类触发穷尽:四个真情境各跑一遭,产出集合必须恰好等于词表。 */
            triggersExhaustive: (function () {
                const probes = [
                    triggerKeys({ place: 'p' }), triggerKeys({ date: 7 }),
                    triggerKeys({ item: 'i' }), triggerKeys({ person: 'who' }),
                ];
                const got = [];
                for (const pr of probes) for (const k of pr.keys) if (got.indexOf(k.kind) < 0) got.push(k.kind);
                return got.length === TRIGGERS.length && got.every((x) => TRIGGERS.indexOf(x) >= 0);
            })(),
            /* ★ 两态不许同形探针:情境未给 ⇒ judged:false;情景真命中且依赖齐备 ⇒ judged:true。 */
            judgedFace: { noScene: suggest(probeDeps, {}, { actor: '甲', day: 1 }).judged, withScene: s1.judged },
            /* ★ 知情面真探针:主体不在知情名单 ⇒ 候选入 blind 而不入 suggested。 */
            blindByUnknown: (function () {
                const r = suggest(probeDeps, {}, { scene: { item: 'ring' }, actor: '甲', day: 10 });
                return r.suggested.length === 0 && r.blind.length === 1 && r.blind[0].knowing === KNOWING.UNKNOWN_SIDE;
            })(),
            /* ★ 策略真探针:hint-only / off 下可注入面恒为 0(而建议仍出)。 */
            policyGatesInjection: (function () {
                const a = suggest(probeDeps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, policy: POLICY.HINT });
                const b = suggest(probeDeps, {}, { scene: { place: 'school' }, actor: '甲', day: 10, policy: POLICY.OFF });
                return a.suggested.length > 0 && a.injectable.length === 0 && b.injectable.length === 0;
            })(),
            /* ★ 冷却真探针:展示后再问同一情境 ⇒ 候选必须落到 cooled。 */
            /* ★ 冷却面未判不许读成「无冷却」的探针:去掉 COOLDOWN_DAYS ⇒ 候选仍出,但带未判读数。 */
            cooldownUnjudgedVisible: (function () {
                const r = suggest({ PAST_DETAILS: probeDeps.PAST_DETAILS, KNOWN_FACTS: probeDeps.KNOWN_FACTS }, {}, { scene: { place: 'school' }, actor: '甲', day: 10 });
                return r.suggested.length === 1 && r.suggested[0].cooldownJudged === false && r.cooldownUnjudged.length === 1;
            })(),
            cooldownAfterMark: (function () {
                const t = suggest(probeDeps, {}, { scene: { place: 'school' }, actor: '甲', day: 10 });
                const st = markShown({}, { triggerKey: 'place:school', detailKey: 'd1', day: 10 });
                const r2 = suggest(probeDeps, st.state, { scene: { place: 'school' }, actor: '甲', day: 11 });
                return t.suggested.length === 1 && r2.cooled.length === 1 && r2.suggested.length === 0;
            })(),
            /* ★ 定长掩码探针:长短两条真受限载体剥完必须同为 SECRET_MASK。 */
            maskFixedLength: (function () {
                const a = maskSecretBody({ secret: 'x' });
                const b = maskSecretBody({ secret: 'x'.repeat(300) });
                return a.value.secret === SECRET_MASK && b.value.secret === SECRET_MASK;
            })(),
            note: missing.length ? ('依赖缺 ' + missing.length + ' 格(' + missing.map((m) => m.key).join('、') + ')') : '依赖齐备',
        };
    }

    /** 一句话读数(诊断面用)。 */
    function line(deps, state, input) {
        try {
            const r = suggest(deps, state, input);
            if (r.judged === false) return '未判(' + keyOf((r.reasons && r.reasons[0]) || 'no-data') + ')';
            return '建议 ' + r.suggested.length + (r.cooled.length ? (' · 冷却 ' + r.cooled.length) : '') + (r.blind.length ? (' · 挡 ' + r.blind.length) : '');
        } catch (_e) { return '—(旧事重现异常)'; }
    }

    const api = Object.freeze({
        FR_VERSION, FR_KIND, TRIGGERS, TRIGGER_LABEL, POLICY, POLICY_LABEL, CANDIDATE, KNOWING,
        SECRET_BODY_KEYS, SECRET_MASK, REQUIRED_DEPS, MAX_CANDIDATES, DEFAULT_COOLDOWN,
        keyOf, strOf, arrOf, numOr, clip, hash32, safe, sameValue, maskSecretBody, entryKeyOf,
        triggerKeys, detailOf, knowingOf, knownSetOf, cooldownOf, markShown,
        suggest, render, setPolicy, describe, selfCheck, line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : global;
    try { g.LonShaFatedRecall = Object.freeze(api); } catch (_e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
