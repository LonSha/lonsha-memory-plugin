/* ========================================================
 * testimony-board.js — [v3.343.0 · M4-X5] 同一事件的多方证词与争议档案(纯函数,零依赖)
 *
 * 【为什么需要这一面 / 修前缺口(不是「再建一个证词库」)】
 *   M4-X5 点名的底座**早已在盘上**,而且各自都已交付:
 *     · knowledge-trace.js   —— 已区分亲历 / 听说 / 误信(五态 + via + evidenceKey);
 *       `propagationSet` 已经能算「同一条证据 + 同角色 + 同动作 ⇒ 转述不计独立」;
 *     · perspective-card.js  —— 已把轨迹按角色 × 时点读成四格短卡;
 *     · fact-version.js      —— 已有冲突状态(同 subject+predicate 多值共存与裁决);
 *     · relation-history.js  —— 已关注人物关系怎么走到今天。
 *   但它们合起来**答不了 M4-X5 点名的这一问**:
 *     **「甲和乙对同一事件分别怎么说、为何暂不能下结论」**。
 *   逐面看为什么答不了:
 *     1 knowledge-trace 是**单角色 × 单事实**的轨迹查询 —— 它给你「乙在第几楼
 *       从谁那里听说」,但没有任何一面把**若干角色对同一事件的说法**摆在一起对照;
 *     2 perspective-card 是**一个人一张卡**,`contrast(cardA, cardB)` 只能两两比,
 *       三人以上的多方说法要手工两两跑,而「谁跟谁同一来源」在比完之后又丢了;
 *     3 fact-version 的冲突状态按 **subject+predicate** 走,那是**事实层**的冲突,
 *       不是**证词层**的争议 —— 「丙的说法与甲相反,但丙没有证据」这件事
 *       在事实层是一条弱源事实,在证词层却是「一条待裁决的对立说法」,读数必须不同形;
 *     4 于是「未裁决的说法」无处安放:现状下它们要么被当成一条弱事实(与已确认
 *       事实同形),要么直接不进任何读数(等于凭空消失)。
 *
 * 【本模块怎么补(四条,都不改既有面,也不另存一份)】
 *   1 **只读聚合,零写**:本模块**不建平行证词数据库** —— 它的输入就是
 *     knowledge-trace 的轨迹数组(与 perspective-card 同规格),输出是**投影**;
 *     一切判定词表(五态 / via / identity)逐字取自 knowledge-trace 的同一份口径,
 *     本模块**不重算**、不另存、不落盘(宿主写库仍归 index.js 的 WorldProgress);
 *   2 **来源去重不静默**:`supportsOf` 按 `evidenceKey` 去重 —— 甲亲历与乙转述
 *     若共用同一份原始证据,只算 **一份独立支持**,并如实报出转述条数与「谁跟谁同源」。
 *     这正是 M4-X5 验收「前两条共用来源不得算两份独立支持」的落点;
 *   3 **未裁决说法全保留**:`disputesOf` 把对立说法**逐条列出**,并按
 *     `ambiguous` / `below-threshold` / `transmittal-only` **三档分列** ——
 *     三档混成一格,读者就再也看不出「为什么暂时不能下结论」;
 *   4 **撤回会更新争议状态**:`revokeEvidence` 吃「被撤证据键」,把对应说法标
 *     `revoked:true` 并把事件状态重算(退回 `undecided` / `withdrawn`),
 *     **不静默**地维持一个已经没人能举证的 `contested`。
 *
 * 【本模块**不做**什么(M4-X5「不做」五条,逐条对应)】
 *   · **不多数票裁真相**:读数里**没有** verdict / winner / truth 的字段;
 *     `supports` 只报「几条独立支持」,不按条数多寡定案(三条弱源不敌一条一手);
 *   · **不加虚构置信百分比**:强度一律走 **档位**(strong / medium / weak / none),
 *     由输入 origin 或 via 派生,**不外报任何百分比数字**;
 *   · **不把全知档案注入每个角色**:输出**按角色分面**(dossiers 每人一份,
 *     只含他自己那条轨迹),**不产**一份「全知统一陈述」;
 *   · 不做同义改写 / 指代消解(那是 knowledge-network 的近似判定,阈值不在此重立);
 *   · 不摸 window / 不读 storage:输入由宿主给,输出由宿主持有。
 *
 * 【三条纪律(与 knowledge-trace / perspective-card 同规格)】
 *   1 只读判定:不写库,只回答「对这次事件,各方怎么说、争在哪里」;
 *   2 不抛:输入畸形一律降级为读数(degraded / malformed),绝不外抛;
 *   3 不猜:判不开给 `undecided` 并带具名理由,不冒充结论;压缩必须可见(truncated)。
 *
 * 【可移植性说明】
 *   机制动机来自「多方说法无法只看事实层冲突就判开」这一通用失效形态;
 *   实现按本仓规范重写(零依赖、不抛、判据保守且可复算、读数齐备),未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    /** 本面结构版本(形状一变必须抬这个数,防「旧下游配新面」静默错读)。 */
    const TB_VERSION = 1;
    /** 读数 kind(消费方可据此判「这是不是本面产出的读数」)。 */
    const TB_KIND = 'testimony_board';
    /** 事件争议状态四态(**不得压格**:有据 / 对立未决 / 判不开 / 已撤回)。 */
    const TB_STATES = Object.freeze(['supported', 'contested', 'undecided', 'withdrawn']);
    /** 单条说法的取证状态(**与 knowledge-trace 的动作面同源**,不另立同义名)。 */
    const TB_CLAIM_STATES = Object.freeze(['witnessed', 'relayed', 'rebutted', 'undecided']);
    /** 未裁决三档(**必须分列**:混成一格就分不出「为什么暂不能下结论」)。 */
    const UNRESOLVED = Object.freeze(['ambiguous', 'below-threshold', 'transmittal-only']);
    /** 说法立场三态(**只认显式声明**,不抽语义)。 */
    const TB_SIDES = Object.freeze(['affirm', 'deny', 'neutral']);
    /** 证据强度**档位**(不是百分比 —— M4-X5「不加虚构置信百分比」)。 */
    const TB_STRENGTH = Object.freeze(['strong', 'medium', 'weak', 'none']);
    /** 一手取证 via(亲历那一档的判据来源)。 */
    const FIRSTHAND_VIA = Object.freeze(['witnessed', 'document']);
    /** 转述类 via(听说那一档)。 */
    const HEARD_VIA = Object.freeze(['told', 'rumor', 'report', 'overheard', 'letter', 'message']);
    /** 强度档切点(只用于**分档**,不向外报数)。 */
    const STRENGTH_CUT = Object.freeze({ strong: 0.8, medium: 0.5 });
    /** 读数里**不得出现**的键名(百分比 / 置信度一族,M4-X5「不做」第二条)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'percentage', 'confidence', 'score', 'probability']);
    /** 单事件最多带回几条说法(有界,防灌爆注入面);截断必须可见。 */
    const MAX_TESTIMONIES = 24;
    /** 单角色最多几条(有界)。 */
    const MAX_PER_SIDE = 12;
    /** 低于此档的说法不足以定案(**逐字同源于 fact-version 的 DEFAULT_MIN_TRUST**)。 */
    const TB_MIN_TRUST = 0.5;
    /** 值级强度表(与 fact-version 的 ORIGIN_TRUST 同形同值;此处只用于分档,不外报)。 */
    const ORIGIN_TRUST = Object.freeze({ confirmed: 1, stated: 0.8, reported: 0.5, inferred: 0.3, system: 0 });
    /** via 级强度表(origin 缺席时的回落)。 */
    const VIA_TRUST = Object.freeze({ witnessed: 1, document: 0.8, told: 0.5, rumor: 0.3, report: 0.5, inferred: 0.3, deduced: 0.3 });
    /** 单行化(换行折叠为空格)。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /** 有限非负整数,否则 null(**不写 0**:0 是「第 0 楼」)。 */
    function floorOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
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
