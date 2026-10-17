/* ========================================================
 * narrative-layer.js — [v3.344.0 · M4-X6] 梦境、假设、计划与现实的叙事层记忆
 * (纯函数,零依赖)
 *
 * 【为什么需要这一面 / 修前缺口(不是「再建一套时间线」)】
 *   M4-X6 点名的底座**大多已在盘上**,而且各自都已交付:
 *     · memory-type.js      —— 已有 9 类事实(人物/关系/地点/物品/事件结果/线索/
 *                              偏好/世界规则/场景)与 6 项策略属性;
 *                              事件结果「只并存不换代」;
 *     · knowledge-trace.js  —— 五态(得知/怀疑/误信/纠正/撤回)已能表达**误信**;
 *     · secret-ledger.js    —— 已能表达「谁还不知道」这个当下状态;
 *     · narrative-pulse.js  —— 已能剔除不可信情绪脉冲;
 *     · fact-version.js     —— 已有时态区间(from/to)与冲突换代。
 *   但它们合起来**答不了 M4-X6 点名的这一问**:
 *     **「这条记忆是在现实里发生的,还是梦里梦到的 / 假设里的 / 只是打算做的?」**
 *   逐面看为什么答不了:
 *     1 **「事实类型」与「叙事层」不是同一轴**。memory-type 的 9 类是「这是什么
 *       性质的事实」(人物状态 / 事件结果 ...);而「梦境 / 假设 / 计划 / 引述」
 *       问的是**这条事实处于哪一层叙事外壳里**。同一个 `event-outcome`
 *       「角色死亡」既可能是**现实**(真死了),也可能是**梦境**(梦到死了)——
 *       类型层完全相同、层不同。修前没有任何字段承载这一轴 ⇒ 二者**读数同形**;
 *     2 于是**现实问答与生成会吃到非现实结果**:梦到角色死亡之后,「谁已死亡」
 *       的现实读数把梦里的死当成现实真值;「如果搬走」的假设被读成已搬走;
 *     3 **「计划」没有落实闸**:一句「决定了」把 plan 层的事实直接读成已完成
 *       —— 没有任何一处把「计划落实」与「与哪条事件关联」绑起来;
 *     4 反方向也缺:**定向回看问不出来**。「梦里到底发生了什么」「当初计划是什么」
 *       这两个问题修前无处可问 —— 非现实层一旦并入现实面就再也分不出来。
 *
 * 【本模块只做一件事:给叙事**加一条与事实类型正交的层轴**,两种输出】
 *   · 层判定:一条条目属于 reality / dream / hypothesis / plan / quote 哪一层,
 *     外加 unspecified(未标注 —— **不猜**);带**原文框架引用**(frame);
 *   · 两个视图:realityView(只取现实 —— 现实问答与生成吃这一面)与
 *     projectOf(按层分面 —— 定向回看吃这一面)。
 *   本模块**不自己存储**:层标注落在既有条目上(modality 字段),复用既有
 *   事实准入与时态。**老数据不批量重标**:无标注一律 unspecified,绝不猜。
 *
 * 【五层(计划原文点名)+ 一格「未标注」(不得压成一格)】
 *   reality     现实   —— 正文已发生的事实(现实问答与生成的**唯一**合法输入)
 *   dream       梦境   —— 梦里发生;可含嵌套假设
 *   hypothesis  假设   —— 「如果 / 假如」的反事实推演
 *   plan        计划   —— **尚未执行**的打算;落实须有**事件关联**(不因一句
 *                        「决定了」自动完成)
 *   quote       引述   —— 转述他人之言(「他说......」),不是叙事者断言
 *   unspecified 未标注 —— **本模块不知道**这条属于哪一层(无标注、也推断不出);
 *                         与「已知它在现实里」**不同形**(不得当现实用)
 *
 * 【三条纪律(与 testimony-board.js / relation-mutual.js 同规格)】
 *   1 只读判定:不写库(写库仍由 index.js 的提取/事实账负责),只回答层问题;
 *   2 不抛:输入畸形一律降级为读数(degraded / malformed 计数),绝不外抛;
 *   3 不猜:无显式标注一律 unspecified;**关键词只作提示读数,不参与层判定**
 *      (M4-X6「不做」第一条:不以关键词「梦」一票判定)。
 *
 * 【可移植性说明】
 *   机制动机来自「事实性质与叙事外壳是两条独立的轴,只记前者会让非现实结果
 *   冒充实况」这一通用失效形态;实现按本仓规范重写(零依赖、不抛、判据保守且
 *   可复算、读数齐备),未复制任何外部代码。
 * ======================================================== */(function (root) {
    'use strict';
    const NL_VERSION = 1;
    const NL_KIND = 'narrative_layer';
    /** 五层(计划原文点名)+ 一格未标注。**判定只认显式标注**,见 modalityOf。 */
    const MODALITIES = Object.freeze(['reality', 'dream', 'hypothesis', 'plan', 'quote']);
    /** 未标注:与「已知属于某层」**不同形**(不得当现实用)。 */
    const UNSPECIFIED = 'unspecified';
    /** 现实层:现实问答与生成的**唯一**合法输入。 */
    const REALITY = 'reality';
    /** 计划落实态(须事件关联才成案,见 planStateOf)。 */
    const PLAN_STATES = Object.freeze(['planned', 'done', 'lapsed']);
    /** 关键词提示表 —— **只作提示读数,不参与层判定**(M4-X6「不做」第一条)。 */
    const HINTS = Object.freeze([
        [/(^|[^a-z])(dream|dreamt|dreamed)([^a-z]|$)|梦|夢|做梦|噩梦/i, 'dream'],
        [/如果|假如|要是|倘若|万一|假设|hypothetical/i, 'hypothesis'],
        [/打算|准备|计划|将要|想去|想搬|决定要|plan|intend/i, 'plan'],
        [/他说|她说|听说|据说|据传|引述|转述|quote|said/i, 'quote']
    ]);
    /** 单层最多带回几条(有界,防灌爆注入面)。 */
    const MAX_ITEMS = 240;
    /** 单层分面最多列几条(有界)。 */
    const MAX_PER_LAYER = 48;
    /** 嵌套框架最多几层(不无限细分 —— M4-X6「不做」第二条)。 */
    const MAX_FRAMES = 4;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(读数里不得混进换行)。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /** 楼层:只认 number 与非空整数串;其余如实 null(**不编 0**:0 是「第 0 楼」)。 */
    function floorOf(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }/* ---------------------------------------------------------------
     * 事实原文归一(与 knowledge-trace 的 normalizeFact **同形**)
     *   本模块要判「两条是不是同一句」时才有意义;此处只为**框架引用**
     *   与**去重**服务。口径照抄 knowledge-trace(逐字归一,不去停用词、
     *   不做近似),阈值不在此重立。调用方可经 `opts.normFact` 注入真源。
     * --------------------------------------------------------------- */
    function normFact(value) {
        let s = String(value == null ? '' : value);
        s = s.replace(/[\u3000\s]+/g, '');
        s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
        s = s.replace(/[\u3001\u3002\u300c\u300d\u300e\u300f\u2018\u2019\u201c\u201d\u2026\u2014\uff0c\uff1b\uff1a\uff1f\uff01]/g, '');
        s = s.replace(/[!-/:-@\[-`{-~]/g, '');
        return s.toLowerCase();
    }
    function normOf(value, inject) {
        try {
            if (typeof inject === 'function') {
                const r = inject(value);
                return (r === undefined || r === null) ? '' : String(r);
            }
        } catch (_e) { /* 注入实现抛错一律回落本地实现,不外抛 */ }
        return normFact(value);
    }
    /* ---------------------------------------------------------------
     * 层别名表(**判定只认显式标注,别名只做等价归一**)
     *   为什么要有别名:同一位标注在不同载体上写法不同(提取时可能写
     *   `layer:'dream'`、摘要里可能写 `modality:'梦境'`)。别名只把
     *   **同一个层**的几种常见写法收敛,绝不把「像梦」当成「是梦」。
     * --------------------------------------------------------------- */
    const ALIASES = Object.freeze({
        reality: ['reality', 'real', 'actual', 'fact', '现实', '真实', '实况', '实际'],
        dream: ['dream', 'dreamt', 'dreamed', 'nightmare', '梦境', '梦', '做梦', '噩梦', '梦里'],
        hypothesis: ['hypothesis', 'hypothetical', 'counterfactual', 'whatif', 'what-if', 'if',
            '假设', '假如', '如果', '反事实', '设想'],
        plan: ['plan', 'intent', 'intention', 'planned', 'proposal', '打算', '计划', '准备', '将要'],
        quote: ['quote', 'quotation', 'quoted', 'relayed', 'reported', 'hearsay', 'cited',
            '引述', '转述', '据说', '听说']
    });
    /** 反查:别名(已归一)→ 层名。构建一次,查询 O(1)。 */
    const ALIAS_TO_LAYER = (function () {
        const m = Object.create(null);
        for (const layer of MODALITIES) {
            for (const a of ALIASES[layer]) m[a] = layer;
        }
        return m;
    })();
    /**
     * 层判定(**只认显式标注**;不认关键词、不认语气)。
     *   判定序:① 显式字段 `modality` / `layer` / `narrativeLayer` / `mode`
     *           ② 显式字段 `frame.modality`(嵌套框架自带的层)
     *           ③ 都没有 ⇒ unspecified(**不猜**,并如实给出理由码)
     *   返回 { modality, stated, via, raw }:
     *     · stated=true  表示**载体明确标注了**这一层(现实问答可信);
     *     · stated=false 一律 unspecified(与「已知它在现实里」**不同形**)。
     */
    function modalityOf(raw) {
        if (!raw || typeof raw !== 'object') {
            return { modality: UNSPECIFIED, stated: false, via: 'none', raw: '' };
        }
        const keys = ['modality', 'layer', 'narrativeLayer', 'narrative_layer', 'mode', 'worldLayer'];
        for (const k of keys) {
            const v = raw[k];
            if (typeof v !== 'string') continue;
            const norm = normOf(v, null);
            if (!norm) continue;
            const hit = ALIAS_TO_LAYER[norm] || ALIAS_TO_LAYER[String(v).trim().toLowerCase()];
            if (hit) return { modality: hit, stated: true, via: 'explicit:' + k, raw: clip(v, 24) };
        }
        /* 有的载体会把层塞在 frame 对象里(`{ frame: { modality: 'dream' } }`) */
        const fr = raw.frame;
        if (fr && typeof fr === 'object' && typeof fr.modality === 'string') {
            const norm = normOf(fr.modality, null);
            const hit = ALIAS_TO_LAYER[norm];
            if (hit) return { modality: hit, stated: true, via: 'explicit:frame.modality', raw: clip(fr.modality, 24) };
        }
        /* 无显式标注 ⇒ **不猜**(关键词提示另走 hintOf,只作读数) */
        return { modality: UNSPECIFIED, stated: false, via: 'none', raw: '' };
    }
    /**
     * 原文框架引用(一层外壳的**原文**)。嵌套取**最内一层**并在读数里
     *   逐层列出(上限 MAX_FRAMES ⇒ 不无限细分)。取字段:
     *   `frame` / `frameRef` / `framing` / `within` / `inside`(字符串或对象均可)。
     */
    function frameOf(raw) {
        if (!raw || typeof raw !== 'object') return { text: '', depth: 0, chain: [] };
        const chain = [];
        let node = raw;
        let guard = 0;
        while (node && typeof node === 'object' && guard < MAX_FRAMES) {
            guard++;
            let text = '';
            for (const k of ['frame', 'frameRef', 'framing', 'within', 'inside', 'shell']) {
                const v = node[k];
                if (typeof v === 'string') { text = clip(v, 60); break; }
                if (v && typeof v === 'object' && typeof v.text === 'string') { text = clip(v.text, 60); break; }
            }
            if (!text) break;
            chain.push(text);
            /* 向里再钻一层(嵌套框架) */
            let inner = null;
            for (const k of ['frame', 'frameRef', 'framing', 'within', 'inside', 'shell']) {
                const v = node[k];
                if (v && typeof v === 'object') { inner = v; break; }
            }
            node = inner;
        }
        const innermost = chain.length ? chain[chain.length - 1] : '';
        return { text: innermost, depth: chain.length, chain: chain };
    }/**
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
    }/**
     * 建面:把一批条目收敛成**叙事层读数**(层分面 + 四方计数 + 有界)。
     *   立身之本:**一个字节都不落盘**(写库仍归宿主 index.js);层标注落在
     *   既有条目上(modality 字段),本模块只读判定。老数据无标注一律
     *   unspecified —— **不猜、不追溯重标**。
     */
    function build(items, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const inject = typeof o.normFact === 'function' ? o.normFact : null;
        const at = floorOf(o.at);
        const maxItems = (Number.isFinite(Number(o.maxItems)) && Number(o.maxItems) >= 1)
            ? Math.floor(Number(o.maxItems)) : MAX_ITEMS;
        const out = {
            kind: NL_KIND,
            version: NL_VERSION,
            at: at,
            atKnown: at !== null,
            items: [],
            byLayer: {},
            counts: {
                input: 0, used: 0, malformed: 0, noFloor: 0, offTime: 0,
                unspecified: 0, stated: 0, hinted: 0,
                reality: 0, dream: 0, hypothesis: 0, plan: 0, quote: 0,
                planPlanned: 0, planDone: 0, planLapsed: 0, planAwaitingEvent: 0
            },
            truncated: 0,
            malformedInput: false,
            /* ★ 立身之本:本模块**一个字节都不落盘**;写库仍归宿主。 */
            writesNothing: true,
            degraded: false
        };
        for (const m of MODALITIES) out.byLayer[m] = 0;
        out.byLayer[UNSPECIFIED] = 0;
        try {
            const list = Array.isArray(items) ? items : [];
            out.malformedInput = !Array.isArray(items) && items !== undefined && items !== null;
            out.counts.input = list.length;
            for (const raw of list) {
                if (out.counts.used >= maxItems) { out.truncated++; continue; }
                const it = itemOf(raw, inject, o);
                if (!it) { out.counts.malformed++; continue; }
                if (at !== null) {
                    if (it.floor === null) { out.counts.noFloor++; continue; }
                    if (it.floor > at) { out.counts.offTime++; continue; }
                }
                out.items.push(it);
                out.byLayer[it.modality] = (out.byLayer[it.modality] || 0) + 1;
                out.counts.used++;
                if (it.stated) out.counts.stated++; else out.counts.unspecified++;
                if (it.modality === 'reality') out.counts.reality++;
                else if (it.modality === 'dream') out.counts.dream++;
                else if (it.modality === 'hypothesis') out.counts.hypothesis++;
                else if (it.modality === 'quote') out.counts.quote++;
                else if (it.modality === 'plan') {
                    out.counts.plan++;
                    if (it.planState === 'done') out.counts.planDone++;
                    else if (it.planState === 'lapsed') out.counts.planLapsed++;
                    else out.counts.planPlanned++;
                    if (it.planReason === 'done-without-event-ref') out.counts.planAwaitingEvent++;
                }
                if (it.hint.length) out.counts.hinted++;
            }
        } catch (_e) {
            out.degraded = true;
        }
        return out;
    }
    /**
     * 现实视图(**现实问答与生成的唯一合法输入**)。
     *   只取 **stated 且 modality===reality** 的条目:梦里的死、假设里的搬走、
     *   一句「决定了」的计划、他人转述 —— 一律**不进**这一面。这正是修前
     *   缺口(现实问答吃到非现实结果)的正面修法。
     */
    function realityView(read) {
        const r = read || {};
        if (r.degraded) return { kind: NL_KIND, count: 0, items: [], realityOnly: true, excluded: 0, degraded: true };
        const items = Array.isArray(r.items) ? r.items : [];
        const keep = [];
        for (const it of items) {
            if (it && it.stated === true && it.modality === REALITY) keep.push(it);
        }
        return {
            kind: NL_KIND,
            at: r.at,
            atKnown: r.atKnown,
            count: keep.length,
            items: keep.slice(0, MAX_PER_LAYER),
            truncated: Math.max(0, keep.length - MAX_PER_LAYER),
            excluded: items.length - keep.length,
            realityOnly: true,
            writesNothing: true
        };
    }
    /**
     * 分层投影(**定向回看的唯一入口**)。
     *   按层分面列出 `projectOf(read, { layer })`;不指定 layer 时给全五层 +
     *   未标注。**非现实层不被并入现实面** —— 于是「梦里到底发生了什么」
     *   「当初计划是什么」这两个问题**修后问得出来**。计划层额外给
     *   planned / done / lapsed 三态分布与「待事件关联」计数。
     */
    function projectOf(read, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const r = read || {};
        if (r.degraded) {
            return { kind: NL_KIND, degraded: true, layers: [], layerCount: 0, writesNothing: true };
        }
        const only = clip(o.layer, 24).toLowerCase();
        const names = MODALITIES.concat([UNSPECIFIED]);
        const want = (only && names.indexOf(only) >= 0) ? [only] : names;
        const items = Array.isArray(r.items) ? r.items : [];
        const layers = [];
        for (const m of want) {
            const bucket = items.filter((it) => it && it.modality === m);
            const entry = {
                layer: m,
                count: bucket.length,
                items: bucket.slice(0, MAX_PER_LAYER),
                truncated: Math.max(0, bucket.length - MAX_PER_LAYER)
            };
            if (m === 'plan') {
                entry.plans = {
                    planned: bucket.filter((x) => x.planState === 'planned').length,
                    done: bucket.filter((x) => x.planState === 'done').length,
                    lapsed: bucket.filter((x) => x.planState === 'lapsed').length
                };
                entry.plansAwaitingEvent = bucket.filter((x) => x.planReason === 'done-without-event-ref').length;
                entry.frames = bucket.filter((x) => x.frameDepth > 0).length;
            }
            if (m === 'dream' || m === 'hypothesis') {
                entry.frames = bucket.filter((x) => x.frameDepth > 0).length;
                entry.nested = bucket.filter((x) => x.frameDepth > 1).length;
            }
            layers.push(entry);
        }
        return {
            kind: NL_KIND,
            at: r.at,
            atKnown: r.atKnown,
            layers: layers,
            layerCount: layers.length,
            total: items.length,
            writesNothing: true
        };
    }/**
     * 一行读数(四方**分开说**:现实 / 非现实 / 未标注 / 计划待关联)。
     *   合并任意两方都会让人误判「现在能不能拿它当真值」——所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '叙事层异常(已降级,不外抛)';
        if (r.malformedInput) return '叙事层输入畸形(不是数组)—— 无从分面';
        const items = Array.isArray(r.items) ? r.items : [];
        if (!items.length) return '暂无叙事层条目(无非现实外壳)';
        const c = r.counts || {};
        const parts = ['条目 ' + (c.used || 0)];
        if (c.reality) parts.push('现实 ' + c.reality);
        const nonReality = (c.dream || 0) + (c.hypothesis || 0) + (c.plan || 0) + (c.quote || 0);
        if (nonReality) parts.push('**非现实 ' + nonReality + '(已挡在现实面外)**');
        if (c.dream) parts.push('梦 ' + c.dream);
        if (c.hypothesis) parts.push('假设 ' + c.hypothesis);
        if (c.plan) parts.push('计划 ' + c.plan);
        if (c.quote) parts.push('引述 ' + c.quote);
        if (c.planDone) parts.push('已落实 ' + c.planDone);
        if (c.planAwaitingEvent) parts.push('**说了落实但无事件关联 ' + c.planAwaitingEvent + '(仍计 planned)**');
        if (c.unspecified) parts.push('未标注 ' + c.unspecified + '(不猜,不得当现实)');
        if (c.hinted) parts.push('含线索词但未标注 ' + c.hinted + '(仅提示)');
        if (c.noFloor) parts.push('**无楼层 ' + c.noFloor + '(未计入任何时点)**');
        if (c.offTime) parts.push('晚于时点 ' + c.offTime);
        if (!r.atKnown) parts.push('(未给时点:给的是全量)');
        if (r.truncated) parts.push('截断 ' + r.truncated);
        return parts.join(' · ');
    }
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5/M4-X6 同口径)。 */
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
     * 自检:**幂等 + 只读面 + 五层齐 + 现实面隔离 + 不产百分比 + 计划闸生效**,
     *   六条当场自证。第4/6条是本模块的立身之本:
     *     · 现实面隔离:喂梦里/假设里/计划里三条 ⇒ realityView **一条都不给**;
     *     · 计划闸生效:喂「说自己 done 但无事件关联」⇒ 仍读 planned。
     */
    function selfCheck(items) {
        const a = build(items, {});
        const b = build(items, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const layersComplete = MODALITIES.length === 5
            && ['reality', 'dream', 'hypothesis', 'plan', 'quote'].every((k) => MODALITIES.indexOf(k) >= 0)
            && UNSPECIFIED === 'unspecified' && REALITY === 'reality';
        /* 4 现实面隔离:非现实条目**一条都不进** realityView。 */
        const probe = build([
            { character: '甲', fact: 'probe-real', modality: 'reality', floor: 1 },
            { character: '甲', fact: 'probe-dream', modality: 'dream', floor: 2 },
            { character: '乙', fact: 'probe-if', modality: 'hypothesis', floor: 2 },
            { character: '乙', fact: 'probe-plan', modality: 'plan', floor: 2, status: 'planned' },
            { character: '丙', fact: 'probe-quote', modality: 'quote', floor: 3 }
        ], {});
        const rv = realityView(probe);
        const realityIsolated = rv.count === 1 && rv.items.length === 1
            && rv.items[0].fact === 'probe-real' && rv.excluded === 4;
        /* 5 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(a);
        /* 6 计划闸:说了 done 但无事件关联 ⇒ 仍 planned(不得自动完成)。 */
        const gate = build([
            { character: '丁', fact: 'probe-plan-done', modality: 'plan', status: 'done', floor: 4 },
            { character: '丁', fact: 'probe-plan-real', modality: 'plan', status: 'done', eventRef: 'E-9', floor: 4 }
        ], {});
        const planGate = gate.counts.planDone === 1 && gate.counts.planAwaitingEvent === 1
            && gate.items.filter((x) => x.planState === 'planned').length === 1;
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === NL_KIND; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && layersComplete && realityIsolated && pctFree && planGate && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            layersComplete: layersComplete,
            realityIsolated: realityIsolated,
            percentFree: pctFree,
            planGate: planGate,
            serializable: serializable
        };
    }
    const api = {
        NL_VERSION: NL_VERSION,
        NL_KIND: NL_KIND,
        MODALITIES: MODALITIES,
        UNSPECIFIED: UNSPECIFIED,
        REALITY: REALITY,
        PLAN_STATES: PLAN_STATES,
        HINTS: HINTS,
        MAX_ITEMS: MAX_ITEMS,
        MAX_PER_LAYER: MAX_PER_LAYER,
        MAX_FRAMES: MAX_FRAMES,
        normFact: normFact,
        modalityOf: modalityOf,
        frameOf: frameOf,
        hintOf: hintOf,
        planStateOf: planStateOf,
        itemOf: itemOf,
        build: build,
        realityView: realityView,
        projectOf: projectOf,
        line: line,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaNarrativeLayer = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);