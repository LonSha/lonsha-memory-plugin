/* ========================================================
 * material-pack.js — [v3.346.0 · M4-X8] 按下一幕任务组织的精简记忆材料包
 * (纯函数,零依赖)
 *
 * 【为什么需要这一面 / 修前缺口(不是「再建一套召回」)】
 *   M4-X8 点名的底座**已在盘上**,而且已交付:
 *     · getContinuityPack 偏**分卷接续**(上一卷收尾 → 下一卷开头),
 *       答的是「接着往下写要记住什么」;
 *     · recall / scene-book / relation / promise / pov / fated-recall ——
 *       各自按**自己的面**给候选(召回按相关度、场景按地点、关系按边、
 *       承诺按未闭、视角按角色、旧事按触发键)。
 *   它们合起来**答不了 M4-X8 点名的这一问**:
 *     **「下一幕要做的是赴约 / 重逢 / 推进 / 收束 —— 这一幕该带哪几样材料?」**
 *   逐面看为什么答不了:
 *     1 **没有任务轴**。上面六面各自排序,合并后**没有优先级** —— 材料按
 *       各自分数混在一起。赴约场的「地点 + 约定 + 谁在场」与重逢场的
 *       「关系变化 + 共同往事」在读数上**完全同形**:都是「N 条材料」;
 *     2 **矛盾当前值会并列当真**。同一件事在两个账上留了两个当前值
 *       (旧值未清)时,现有各面会**两条都给** —— 读者于是看到「人在 A 又
 *       在 B」。这里缺一条**取代**判据(说清谁被谁取代,而不是并列);
 *     3 **未来 / 受限材料没有闸**。尚未发生的事实、以及当前视角不该知道的
 *       事情,会随候选一起进包 —— 前者是**没发生却当真**,后者是
 *       **越界知情**。M4-X8 验收明写「未来/受限事实不进入」;
 *     4 **缺口不报**。任务必须的某一面(如赴约的**约定**本身)一条也没取到
 *       时,读数是「材料 5 条」,与「材料齐备」同形 —— 下游无从知道少了什么。
 *
 * 【本模块只做一件事:给「下一幕任务」做一次**只读材料投影**】
 *   · 任务轴:meet(赴约)/ reunion(重逢)/ advance(推进)/ resolve(收束),
 *     每类有**自己的面优先级**(差异因此**可解释**,不是随机分差);
 *   · 材料面:归一后按任务优先级排序,同面内按楼层近远;
 *   · 矛盾当前值:同 conflictGroup 出现多个当前值 ⇒ 只留**楼层最新**一条,
 *     其余标 superseded 并**具名**(不并列当真,也不偷偷丢掉);
 *   · 闸:restricted(受限)/ future(未发生)默认**不进包**,如实计数;
 *   · 缺口:任务优先级里某一面零材料 ⇒ 进 gaps(具名,不静默);
 *   · 排序即准备:包是**有序**的,越靠前越该先带。
 *   本模块**不自己存储**(纯函数面,与 return-gate.js / narrative-layer.js 同规格);
 *   **不写任何账**、**不产任何正文**、**不代写未发生剧情**。
 *
 * 【预算口径(与计划原文一致:裁剪仍由既有 owner 负责)】
 *   本模块**不替既有预算 owner 裁剪**。它给的是:有序材料 + 成本读数 +
 *   **越预算名单**(哪些条超出调用方给的预算)。真正裁到 token 预算的是
 *   injection-router(既有 owner) —— 本模块不新造第二套预算系统,
 *   也不因为「自己算过一遍」就宣称已经裁好。
 *
 * 【三条纪律(与 narrative-layer.js / testimony-board.js / return-gate.js 同规格)】
 *   1 只读投影:不写库(写库仍由 index.js 的提取/事实账负责),只挑材料;
 *   2 不抛:输入畸形一律降级为读数(degraded / malformed 计数),绝不外抛;
 *   3 不猜:缺字段**如实留空**并进 gaps,不替调用方补一个像样的值;
 *     矛盾不并列为真,也不偷偷丢掉 —— 被取代的那条**具名**留在读数里。
 *
 * 【与 M4-X7(return-gate.js)的分工(两项**不重叠**)】
 *   那一面答「某条**旧事**此刻该不该进生成」(动作生命周期 + 控频闸);
 *   本面答「这一幕**该带哪几样材料**」(任务轴 + 面优先级 + 缺口 + 取代)。
 *   本面**可选消费** X7 的安全性结论(调用方把 X7 判为 held / blocked 的旧事
 *   标成 restricted 传进来即可),**不强依赖**:没有 X7 时按本模块自己的判据走。
 *
 * 【可移植性说明】
 *   机制动机来自「把『给下一场写作准备材料』做成产品输出时,缺一条任务轴
 *   会让不同任务的产物同形,且矛盾值 / 未来值会混进包」这一通用失效形态;
 *   实现按本仓规范重写(零依赖、不抛、判据保守且可复算、读数齐备),
 *   未复制任何外部代码。
 * ======================================================== */(function (root) {
    'use strict';
    const MP_VERSION = 2;
    const MP_KIND = 'material_pack';
    /** [v3.351.0 M5-O4] 事实五态（与 fact-state.js 的 FS_STATES 同词表）。
     *   材料包消费裁决而不是自造裁决：superseded/revoked 的材料不进包，
     *   disputed 保留争议（两条都进包但标 disputed），只有同为 active 才按楼层决胜。 */
    const FACT_STATES = Object.freeze(['active', 'superseded', 'revoked', 'disputed', 'unknown']);
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const SP = String.fromCharCode(32);
    /** 下一幕任务四类(**穷尽**:任何目标必须落入其中一格,不得现编态名)。 */
    const TASKS = Object.freeze(['meet', 'reunion', 'advance', 'resolve']);
    const TASK_LABEL = Object.freeze({ meet: '赴约', reunion: '重逢', advance: '推进', resolve: '收束' });
    /** 材料面(**穷尽**:每条材料必须归属一格;不归属 ⇒ 计入 unclassified,不硬塞)。 */
    const FACETS = Object.freeze(['appointment', 'place', 'participants', 'relation', 'sharedPast', 'promise', 'pov', 'item', 'constraint', 'setting']);
    const FACET_LABEL = Object.freeze({
        appointment: '约定', place: '地点', participants: '参与者',
        relation: '关系变化', sharedPast: '共同往事', promise: '未闭承诺',
        pov: '视角约束', item: '物品', constraint: '硬约束', setting: '资料设定',
    });
    /**
     * **本模块的立身之本**:任务 → 面优先级。
     *   为什么必须是四份**不同**的表:赴约场要「约定 + 地点 + 谁在场」,
     *   重逢场要「关系变化 + 共同往事」;同预算下若四类共用一张表,
     *   四种任务的产物会**同形**(M4-X8 验收要求「材料差异可解释」)。
     *   四份表是**同一真源**(FACETS)的四种排法,不另造词表。
     */
    const TASK_PRIORITY = Object.freeze({
        meet: Object.freeze(['appointment', 'place', 'participants', 'constraint', 'promise', 'relation', 'sharedPast', 'item', 'pov', 'setting']),
        reunion: Object.freeze(['relation', 'sharedPast', 'participants', 'promise', 'place', 'constraint', 'appointment', 'item', 'pov', 'setting']),
        advance: Object.freeze(['promise', 'constraint', 'relation', 'participants', 'place', 'appointment', 'item', 'sharedPast', 'pov', 'setting']),
        resolve: Object.freeze(['promise', 'sharedPast', 'relation', 'participants', 'constraint', 'place', 'appointment', 'item', 'pov', 'setting']),
    });
    /** 材料来源(**只说取自哪个 owner**:来源是**出处**,不是「已验真」的印章)。 */
    const SOURCES = Object.freeze(['continuity', 'recall', 'scene-book', 'relation', 'promise', 'pov', 'fated-recall', 'lore', 'note', 'caller', 'unknown']);
    /** 单次材料池上限(有界,防灌爆)。 */
    const INVENTORY_MAX = 60;
    /** 材料包硬顶(与预算无关的兜底上限,防调用方不设预算时无限带)。 */
    const PACK_MAX = 14;
    /** 缺省预算(条数):调用方给预算就用**给的**(本模块不替它改)。 */
    const BUDGET_DEFAULT = 9;
    /** 单条摘要最多几字。 */
    const SNIPPET_MAX = 80;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 / X6 / X7 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(**零正则、零反斜杠**:逐字符把 CR / LF / TAB 换成空格再收空白)。 */
    function oneLine(value) {
        const s = String(value == null ? '' : value);
        let buf = '';
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            buf += (c === 10 || c === 13 || c === 9) ? SP : s.charAt(i);
        }
        const parts = buf.split(SP);
        const keep = [];
        for (let i = 0; i < parts.length; i++) if (parts[i] !== '') keep.push(parts[i]);
        return keep.join(SP);
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
    /** FNV-1a 32 位(与 X5 / X6 / X7 同口径,供键指纹用)。 */
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
     * 材料归一(**只读:缺字段如实留空,不猜**)
     *
     *   面(facet)判定走**两步,且两步都可见**:
     *     1 显式 `facet` ∈ FACETS ⇒ 用它(调用方最清楚这条是什么);
     *     2 否则按 `kind` 查 KIND_TO_FACET(同一真源的另一张视图);
     *     3 两步都不中 ⇒ `facet: ''` ⇒ 计入 **unclassified**(**不硬塞**成
     *       setting / constraint)。为什么宁可不分类:硬塞会让「这条其实没
     *       归面」这件事消失,而它恰恰是调用方最该知道的一类输入错误。
     *
     *   闸(默认不进包的两类,如实计数):
     *     · `restricted`(受限:当前视角 / 知情面不该知道)⇒ 不进包;
     *     · `future`(未发生:计划 / 打算 / 尚未落实)⇒ 不进包。
     *     两者**不是**「错」,是「此刻不带」;读数里逐条具名。
     * --------------------------------------------------------------- */
    /** 类别 → 面(与 FACETS 同源的第二张视图;不中的一律返回 '')。 */
    const KIND_TO_FACET = Object.freeze({
        appointment: 'appointment', meeting: 'appointment', agreement: 'appointment', rendezvous: 'appointment',
        place: 'place', location: 'place', scene: 'place', geo: 'place',
        person: 'participants', character: 'participants', participant: 'participants', actor: 'participants', cast: 'participants',
        relation: 'relation', relationship: 'relation', 'relation-change': 'relation', edge: 'relation',
        past: 'sharedPast', history: 'sharedPast', shared: 'sharedPast', memory: 'sharedPast', 'shared-past': 'sharedPast',
        promise: 'promise', commitment: 'promise', oath: 'promise', vow: 'promise',
        pov: 'pov', perspective: 'pov', viewpoint: 'pov', viewpointOwner: 'pov',
        item: 'item', object: 'item', prop: 'item', token: 'item',
        constraint: 'constraint', hard: 'constraint', rule: 'constraint', limit: 'constraint',
        setting: 'setting', lore: 'setting', canon: 'setting', reference: 'setting',
    });
    /** 面判定(两步;都不中 ⇒ '')。 */
    function facetFor(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const explicit = keyOf(r.facet);
        if (FACETS.indexOf(explicit) >= 0) return { facet: explicit, facetRaw: explicit, via: 'explicit' };
        const kind = keyOf(r.kind);
        const hint = (kind && Object.prototype.hasOwnProperty.call(KIND_TO_FACET, kind)) ? KIND_TO_FACET[kind] : '';
        if (hint) return { facet: hint, facetRaw: kind, via: 'kind' };
        return { facet: '', facetRaw: kind, via: 'none' };
    }
    /**
     * 单条材料归一。`usable` 是**唯一**的进包前提(其余都是读数)。
     *   为什么不用「分数」:分数会让「这条为什么在包里」变成不可解释的数字
     *   (M4-X8 验收要的是**材料差异可解释**)。这里只用**面 + 楼层 + 任务优先级**
     *   三样可复算的东西说话。
     */
    function materialOf(raw, idx) {
        const r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const f = facetFor(r);
        const floor = floorOf(r.floor);
        const futureRaw = r.future;
        const future = (futureRaw === true) || (keyOf(futureRaw) === 'true') || (keyOf(r.status) === 'future') || (keyOf(r.state) === 'planned');
        const restrictedRaw = r.restricted;
        const restricted = (restrictedRaw === true) || (keyOf(restrictedRaw) === 'true') || (keyOf(r.knowing) === 'restricted') || (keyOf(r.visibility) === 'restricted');
        const id = keyOf(r.id) || ('m' + String(idx));
        const conflictGroup = keyOf(r.conflictGroup);
        return {
            index: idx,
            id: id,
            facet: f.facet,
            facetRaw: f.facetRaw,
            facetVia: f.via,
            title: clip(r.title || r.text || r.snippet || '', SNIPPET_MAX),
            snippet: clip(r.snippet || r.detail || '', SNIPPET_MAX),
            source: (SOURCES.indexOf(keyOf(r.source)) >= 0) ? keyOf(r.source) : (keyOf(r.source) || 'unknown'),
            sourceRaw: keyOf(r.source),
            floor: floor,
            subject: keyOf(r.subject) || keyOf(r.about),
            conflictGroup: conflictGroup,
            version: numOr(r.version, null),
            restricted: restricted,
            future: future,
            factState: keyOf(r.factState) || 'active',
            factId: keyOf(r.factId) || '',
            usable: (f.facet !== '') && !restricted && !future,
            why: restricted ? 'restricted' : (future ? 'future' : (f.facet === '' ? 'unclassified' : '')),
        };
    }
    /**
     * 池归一:**上限有界**,畸形条目**丢弃并计数**(不猜、不修)。
     *   超上限的**如实计入 truncatedIn**(不是静默丢弃)。
     */
    function normalize(list) {
        const src = Array.isArray(list) ? list : [];
        const materials = [];
        let dropped = 0;
        let truncatedIn = 0;
        const seenIds = {};
        for (let i = 0; i < src.length; i++) {
            const raw = src[i];
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
            if (materials.length >= INVENTORY_MAX) { truncatedIn++; continue; }
            const m = materialOf(raw, i);
            /* 键去重(**同 id 重复给 = 同一份材料的两次登记**,只留首条,如实计数):
             *   为什么不是「后覆盖前」:两条内容可能不同 —— 谁覆盖谁都是**猜**。 */
            if (Object.prototype.hasOwnProperty.call(seenIds, m.id)) { dropped++; continue; }
            seenIds[m.id] = true;
            materials.push(m);
        }
        return { materials: materials, dropped: dropped, truncatedIn: truncatedIn };
    }
    /** 面序(任务优先级里的位次;未列入 ⇒ 末尾)。 */
    function facetRankOf(facet, task) {
        const pr = TASK_PRIORITY[task] || TASK_PRIORITY.advance;
        const i = pr.indexOf(facet);
        return i < 0 ? pr.length : i;
    }
    /**
     * 排序(**任务轴真正起作用的地方**)。
     *   两级键,都可复算:
     *     1 面优先级(按 task 的 TASK_PRIORITY 位次);
     *     2 同面内**楼层近远**(楼层大者靠前;楼层未知者**排最后** —— 不编 0)。
     *   稳定键:原下标(同面同楼保持调用方给的相对次序,不因排序抖动)。
     */
    function rank(materials, task) {
        const t = (TASKS.indexOf(keyOf(task)) >= 0) ? keyOf(task) : 'advance';
        const out = arrOf(materials).slice();
        for (const m of out) m.facetRank = facetRankOf(m.facet, t);
        out.sort((a, b) => {
            if (a.facetRank !== b.facetRank) return a.facetRank - b.facetRank;
            const fa = (a.floor === null) ? -1 : a.floor;
            const fb = (b.floor === null) ? -1 : b.floor;
            if (fa !== fb) return fb - fa;
            return a.index - b.index;
        });
        for (let i = 0; i < out.length; i++) out[i].order = i + 1;
        return { task: t, materials: out };
    }
    /**
     * 矛盾当前值处置(**只留新的那一条,其余具名而非静默丢弃**)。
     *   · 分组键:同 `conflictGroup`(非空)且**都可用**;
     *   · 胜者:楼层最大的一条(楼层都是 null ⇒ 取原序最前 —— **不编楼层**);
     *   · 败者:state 'superseded',带 `supersededBy`(具名胜者 id),**不进包**;
     *   · 为什么不是「两条都给」:读者会看到「人在 A 又在 B」,把矛盾当成了
     *     同时为真;为什么不是「悄悄丢掉」:那样调用方查不出自己喂了两条当前值。
     */
    function resolveConflicts(materials) {
        const groups = {};
        const list = arrOf(materials);
        for (const m of list) {
            if (!m.usable || !m.conflictGroup) continue;
            const g = m.conflictGroup;
            if (!groups[g]) groups[g] = [];
            groups[g].push(m);
        }
        const winnerOf = {};
        const superseded = [];
        const disputed = [];
        for (const g of Object.keys(groups)) {
            const arr = groups[g];
            if (arr.length < 2) continue;
            /* [v3.351.0 M5-O4] 事实裁决优先于楼层决胜：
             *   superseded/revoked 的材料已被事实账裁定，不参与楼层决胜，
             *   直接标不可用并具名（reason = fact-superseded / fact-revoked，
             *   与楼层决胜的 superseded 不同形 —— 调用方可辨「事实账说换了」
             *   与「材料包按楼层选了一条」）。 */
            const active = arr.filter(function (m) { return m.factState === 'active' || m.factState === 'unknown' || m.factState === 'disputed'; });
            const inactive = arr.filter(function (m) { return m.factState === 'superseded' || m.factState === 'revoked'; });
            for (const m of inactive) {
                m.usable = false;
                m.state = m.factState;
                m.why = m.factState === 'superseded' ? 'fact-superseded' : 'fact-revoked';
                superseded.push({ id: m.id, conflictGroup: g, floor: m.floor, title: m.title, facet: m.facet, source: m.source, factState: m.factState, why: m.why });
            }
            if (active.length < 2) {
                if (active.length === 1) winnerOf[g] = active[0].id;
                continue;
            }
            /* disputed 保留争议：都进包但标 disputed（不按楼层淘汰） */
            const hasDispute = active.some(function (m) { return m.factState === 'disputed'; });
            if (hasDispute) {
                for (const m of active) {
                    m.state = 'disputed';
                    if (!m.why) m.why = 'disputed';
                }
                disputed.push({ conflictGroup: g, count: active.length, ids: active.map(function (m) { return m.id; }) });
                winnerOf[g] = active[0].id;
                continue;
            }
            /* 同为 active 且无争议 -> 楼层决胜（旧口径不变） */
            let win = active[0];
            for (const m of active) {
                const wf = (win.floor === null) ? -1 : win.floor;
                const mf = (m.floor === null) ? -1 : m.floor;
                if (mf > wf) win = m;
            }
            winnerOf[g] = win.id;
            for (const m of active) {
                if (m.id === win.id) continue;
                m.usable = false;
                m.state = 'superseded';
                m.supersededBy = win.id;
                m.why = 'superseded';
                superseded.push({ id: m.id, conflictGroup: g, supersededBy: win.id, floor: m.floor, title: m.title, facet: m.facet, source: m.source, factState: m.factState, why: m.why });
            }
        }
        return { materials: list, superseded: superseded, winnerOf: winnerOf, disputed: disputed };
    }
    /**
     * 预算(与既有 owner 的分工说清):本模块**不裁到 token**,只按**条数**
     *   给出「包里带头几条」与**越预算名单**(哪些可用材料超出了调用方给的条数)。
     *   · 为什么不是「本模块直接裁好」:真正裁到 token 的是 injection-router
     *     (既有预算 owner);本面再裁一遍等于**第二套预算系统**,两边口径必然漂移
     *     —— 漂移之后没人说得清「到底是哪一层把这条丢了」;
     *   · 为什么给 `budget.given`:调用方没设预算时,本模块用的是**缺省条数**,
     *     这件事必须能被读出来(否则「我明明没设预算,为什么只带了 9 条」无处可查)。
     */
    const BUDGET_DEFAULT_WHY = '调用方未给 budget ⇒ 用缺省条数';
    function budgetOf(v) {
        const n = numOr(v, null);
        if (n === null) return { given: false, perItem: BUDGET_DEFAULT, budgetRaw: null, why: BUDGET_DEFAULT_WHY };
        const k = Math.floor(n);
        if (k <= 0) return { given: false, perItem: BUDGET_DEFAULT, budgetRaw: n, why: 'budget 非正 ⇒ 按缺省条数(不读成「一条都不带」)' };
        return { given: true, perItem: k, budgetRaw: n, why: '' };
    }
    /** 任务归一(**缺省 advance**;给了但不认识 ⇒ 按 advance 并**说明**)。 */
    function taskOf(v) {
        const t = keyOf(v);
        if (TASKS.indexOf(t) >= 0) return { task: t, known: true, given: true, why: '' };
        const given = (v !== undefined && v !== null && keyOf(v) !== '');
        return { task: 'advance', known: false, given: given, why: given ? 'task 未识别 ⇒ 按推进(不编第五类任务)' : '' };
    }
    /** 每类任务的**关键面**(优先级表头部若干格):零材料 ⇒ 进 gapsCritical。 */
    const CRITICAL_COUNT = 3;
    function criticalFacetsOf(task) {
        const pr = TASK_PRIORITY[task] || TASK_PRIORITY.advance;
        return pr.slice(0, CRITICAL_COUNT);
    }
    /**
     * 建面(统一入口)。**只读**:不写任何账、不产正文、不代写未发生剧情。
     *   build(task, inventory, opts)
     *     task      —— meet / reunion / advance / resolve(缺省 advance)
     *     inventory —— 材料池(数组;调用方从各 owner 收来)
     *     opts      —— { budget(条数)/ now / restricted 名单等,当前只用 budget }
     *   返回读数(**四方分开说**):pack(带哪些)/ sheet(逐面明细 + 缺口)/
     *     superseded(被取代的当前值旧条)/ held(限制 / 未发生 / 未归面)。
     */
    function build(task, inventory, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const tv = taskOf(task);
        const t = tv.task;
        const bud = budgetOf(o.budget);
        const base = {
            kind: MP_KIND, version: MP_VERSION,
            task: t, taskLabel: TASK_LABEL[t], taskGiven: tv.given, taskKnown: tv.known,
            facets: FACETS.slice(), facetLabels: Object.assign({}, FACET_LABEL),
            priority: (TASK_PRIORITY[t] || TASK_PRIORITY.advance).slice(),
            criticalFacets: criticalFacetsOf(t),
            pack: [], packIds: [], sheet: [], superseded: [], gaps: [], gapsCritical: [],
            held: { restricted: [], future: [], superseded: [], unclassified: [], disputed: [] },
            budget: { given: bud.given, perItem: bud.perItem },
            overBudget: [], cost: { items: 0, estChars: 0, estCharsAll: 0 },
            counts: { inventory: 0, usable: 0, packed: 0, restricted: 0, future: 0, unclassified: 0, superseded: 0, disputed: 0, truncated: 0, dropped: 0, truncatedIn: 0 },
            reasons: [], truncated: 0, orderIsRank: true,
            writesNothing: true, devisesNothing: true, injectsNothing: false,
            note: '本面只挑材料;真正裁到 token 由既有预算 owner 负责',
        };
        /* 入参两态**不同形**:没给材料(undefined / null)= 合法的「这次没有材料」;
         *   给了但**不是数组**(字符串 / 数字 / 普通对象)= 畸形,无从选材。
         *   把两者压成同形会让「判不了」被读成「没有」—— 这正是 M4-X8 要防的。 */
        const absentArg = (inventory === undefined) || (inventory === null);
        if (!absentArg && !Array.isArray(inventory)) {
            return Object.assign({}, base, {
                judged: false, malformedInput: true,
                reasons: ['inventory 不是数组 ⇒ 无从选材(不读成「没有材料」)'],
            });
        }
        const list = Array.isArray(inventory) ? inventory : [];
        const nm = normalize(list);
        const rc = resolveConflicts(nm.materials);
        /* [v3.351.0 M5-O4] 没有 conflictGroup 的 superseded/revoked 材料也标不可用 */
        for (const m of rc.materials) {
            if (m.usable && (m.factState === 'superseded' || m.factState === 'revoked')) {
                m.usable = false;
                m.state = m.factState;
                m.why = m.factState === 'superseded' ? 'fact-superseded' : 'fact-revoked';
                if (!rc.superseded) rc.superseded = [];
                rc.superseded.push({ id: m.id, floor: m.floor, title: m.title, facet: m.facet, source: m.source, factState: m.factState, why: m.why });
            }
        }
        const usable = rc.materials.filter((m) => m.usable === true);
        const rk = rank(usable, t);
        const packed = rk.materials.slice(0, Math.min(bud.perItem, PACK_MAX));
        const overBudget = rk.materials.slice(Math.min(bud.perItem, PACK_MAX));
        const restricted = rc.materials.filter((m) => m.restricted === true);
        const future = rc.materials.filter((m) => m.future === true);
        const unclassified = rc.materials.filter((m) => m.why === 'unclassified');
        /* 逐面明细(**缺口就藏在这里**:某一面 0 条时会明白写出来)。 */
        const byFacet = {};
        for (const f of FACETS) byFacet[f] = [];
        for (const m of rk.materials) if (m.facet && byFacet[m.facet]) byFacet[m.facet].push(m);
        const sheet = [];
        const gaps = [];
        for (const f of (TASK_PRIORITY[t] || TASK_PRIORITY.advance)) {
            const n = byFacet[f] ? byFacet[f].length : 0;
            const critical = criticalFacetsOf(t).indexOf(f) >= 0;
            sheet.push({ facet: f, facetLabel: FACET_LABEL[f] || f, count: n, critical: critical, ids: (byFacet[f] || []).map((m) => m.id) });
            if (!n) { gaps.push({ facet: f, facetLabel: FACET_LABEL[f] || f, critical: critical }); }
        }
        const gapsCritical = gaps.filter((g) => g.critical === true);
        let estChars = 0;
        for (const m of packed) estChars += (m.title || '').length + (m.snippet || '').length;
        let estCharsAll = estChars;
        for (const m of overBudget) estCharsAll += (m.title || '').length + (m.snippet || '').length;
        const reasons = [];
        if (tv.why) reasons.push(tv.why);
        if (bud.why) reasons.push(bud.why);
        if (rc.superseded.length) reasons.push('同组当前值 ' + rc.superseded.length + ' 条被更新的那条取代(具名在 superseded,非静默丢弃)');
        if ((rc.disputed || []).length) reasons.push('争议组 ' + rc.disputed.length + ' 组保留双条(事实账判 disputed,不按楼层淘汰)');
        if (restricted.length) reasons.push('受限材料 ' + restricted.length + ' 条 ⇒ 不进包(越界知情面不喂)');
        if (future.length) reasons.push('未发生材料 ' + future.length + ' 条 ⇒ 不进包(计划不当成已发生)');
        if (unclassified.length) reasons.push('未归面材料 ' + unclassified.length + ' 条 ⇒ 不进包(不硬塞成约束或设定)');
        if (overBudget.length) reasons.push('越预算 ' + overBudget.length + ' 条 ⇒ 有序候补(裁剪由既有预算 owner 负责,本面不代裁)');
        if (gapsCritical.length) reasons.push('关键面零材料:' + gapsCritical.map((g) => g.facetLabel).join('、'));
        if (nm.truncatedIn > 0) reasons.push('池超上限 ' + INVENTORY_MAX + ' ⇒ 截断 ' + nm.truncatedIn + ' 条');
        return Object.assign({}, base, {
            judged: true,
            judgedTask: t,
            inventoryGiven: list.length,
            pack: packed.slice(),
            packIds: packed.map((m) => m.id),
            priority: (TASK_PRIORITY[t] || TASK_PRIORITY.advance).slice(),
            sheet: sheet, superseded: rc.superseded, gaps: gaps, gapsCritical: gapsCritical,
            held: {
                restricted: restricted.map((m) => ({ id: m.id, facet: m.facet, title: m.title, why: 'restricted' })),
                future: future.map((m) => ({ id: m.id, facet: m.facet, title: m.title, why: 'future' })),
                superseded: rc.superseded.slice(),
                disputed: (rc.disputed || []).slice(),
                unclassified: unclassified.map((m) => ({ id: m.id, facetRaw: m.facetRaw, title: m.title, why: 'unclassified' })),
            },
            budget: { given: bud.given, perItem: bud.perItem, budgetRaw: bud.budgetRaw },
            overBudget: overBudget.map((m) => ({ id: m.id, facet: m.facet, order: m.order, title: m.title })),
            cost: { items: packed.length, estChars: estChars, estCharsAll: estCharsAll, estCharsSkipped: estCharsAll - estChars },
            counts: {
                inventory: list.length, usable: rk.materials.length, packed: packed.length,
                restricted: restricted.length, future: future.length, unclassified: unclassified.length,
                superseded: rc.superseded.length, disputed: (rc.disputed || []).length, truncated: overBudget.length,
                dropped: nm.dropped, truncatedIn: nm.truncatedIn,
            },
            reasons: reasons, truncated: overBudget.length,
        });
    }/** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5 / X6 / X7 同口径)。 */
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
     * 自检:**确定性 + 只读面 + 任务轴真的改变产物 + 未发生/受限两条闸都闭 +
     *   缺口具名 + 被取代者具名 + 池空与入参畸形不同形 + 不产百分比**,
     *   九条当场自证。第 3 / 4 / 5 / 6 条是本模块的立身之本。
     */
    function selfCheck() {
        const PROBE = [
            { id: 'p1', kind: 'place', title: '旧教室', floor: 10, source: 'recall' },
            { id: 'p2', kind: 'promise', title: '答应过周三', floor: 8, source: 'promise' },
            { id: 'p3', kind: 'person', title: '阿岚', floor: 9, source: 'relation' },
        ];
        const MIX = [
            { id: 'a', facet: 'appointment', title: '周三的约', floor: 5, source: 'caller' },
            { id: 'b', facet: 'place', title: '老码头', floor: 5, source: 'scene-book' },
            { id: 'c', facet: 'relation', title: '和解了', floor: 5, source: 'relation' },
            { id: 'd', facet: 'sharedPast', title: '一起看的海', floor: 5, source: 'recall' },
        ];
        const a = build('meet', PROBE, { budget: 5 });
        const b = build('meet', PROBE, { budget: 5 });
        /* 1 确定性:同输入同产物。 */
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        /* 2 只读面:导出名里不得有写面前缀。 */
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store', 'drop', 'erase', 'inject', 'push'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        /* 3 任务轴四类齐,且优先级表都是 FACETS 的排法(**不另造词表**)。 */
        const prAll = TASKS.map((t) => TASK_PRIORITY[t]);
        const tasksComplete = TASKS.length === 4
            && prAll.every((p) => Array.isArray(p) && p.length === FACETS.length)
            && prAll.every((p) => FACETS.every((f) => p.indexOf(f) >= 0));
        /* 4 **任务轴真的改变产物**:同一池,赴约与重逢的包**不同序**,且各自首位落在自己的关键面。 */
        const meet = build('meet', MIX, { budget: 3 });
        const reunion = build('reunion', MIX, { budget: 3 });
        const taskAxisMoves = meet.pack[0] && meet.pack[0].facet === 'appointment'
            && reunion.pack[0] && reunion.pack[0].facet === 'relation'
            && meet.packIds.join(',') !== reunion.packIds.join(',');
        /* 5 **矛盾当前值不并列**:同组两条(3 楼 / 7 楼) ⇒ 只留 7 楼那条,另一条**具名**被取代。 */
        const CONFLICT = [
            { id: 'c1', facet: 'place', title: '在南城', floor: 3, conflictGroup: 'g1', source: 'recall' },
            { id: 'c2', facet: 'place', title: '在北城', floor: 7, conflictGroup: 'g1', source: 'recall' },
        ];
        const cc = build('meet', CONFLICT, { budget: 5 });
        const conflictNoParl = cc.packIds.length === 1 && cc.packIds[0] === 'c2'
            && cc.superseded.length === 1 && cc.superseded[0].id === 'c1' && cc.superseded[0].supersededBy === 'c2';
        /* 6 **未发生 / 受限都不进包**(两条闸都闭),且**分别计数**(不同形)。 */
        const GATED = [
            { id: 'g1', facet: 'place', title: '真到过的地方', floor: 5, source: 'recall' },
            { id: 'g2', facet: 'place', title: '打算去的地方', floor: 6, future: true, source: 'caller' },
            { id: 'g3', facet: 'place', title: '他不该知道的地方', floor: 6, restricted: true, source: 'scene-book' },
        ];
        const gg = build('meet', GATED, { budget: 5 });
        const gatesHold = gg.packIds.join(',') === 'g1'
            && gg.counts.future === 1 && gg.counts.restricted === 1
            && gg.held.future[0].id === 'g2' && gg.held.restricted[0].id === 'g3';
        /* 7 **缺口具名**:只有一条物品、赴约的三个关键面全空 ⇒ gapsCritical 命中三格且**带标签**。 */
        const SPARSE = [{ id: 's1', facet: 'item', title: '旧钥匙', floor: 4, source: 'recall' }];
        const sp = build('meet', SPARSE, { budget: 5 });
        const gapsNamed = sp.gapsCritical.length === 3
            && sp.gapsCritical.every((g) => g.critical === true && g.facetLabel !== '')
            && sp.reasons.some((r) => r.indexOf('关键面零材料') >= 0);
        /* 7b [M5-O4] 事实裁决优先于楼层决胜：superseded 的同组材料不进包（reason != 'superseded' 楼层淘汰）。 */
        const FACT = [
            { id: 'f1', facet: 'place', title: 'jiuquerenzaiA', floor: 10, conflictGroup: 'h1', factState: 'superseded', source: 'recall' },
            { id: 'f2', facet: 'place', title: 'xinchuanwenzaiB', floor: 7, conflictGroup: 'h1', factState: 'active', source: 'recall' },
        ];
        const fc = build('meet', FACT, { budget: 5 });
        const factStateFilters = fc.packIds.length === 1 && fc.packIds[0] === 'f2'
            && fc.superseded.length === 1 && fc.superseded[0].id === 'f1' && fc.superseded[0].why === 'fact-superseded';
        /* 8 **入参畸形与池空不同形**(前者无从选材,后者是合法的「这次没有材料」)。 */
        const bad = build('meet', 'not-an-array', {});
        const empty = build('meet', [], {});
        const malformedDistinct = bad.malformedInput === true && bad.judged === false
            && empty.malformedInput === undefined && empty.judged === true && empty.pack.length === 0;
        /* 9 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(a);
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).task === 'meet'; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && tasksComplete && taskAxisMoves && conflictNoParl
                && gatesHold && gapsNamed && malformedDistinct && pctFree && serializable && factStateFilters,
            deterministic: deterministic,
            writeFaces: writeFaces,
            tasksComplete: tasksComplete,
            taskAxisMoves: taskAxisMoves,
            conflictNoParl: conflictNoParl,
            gatesHold: gatesHold,
            gapsNamed: gapsNamed,
            malformedDistinct: malformedDistinct,
            percentFree: pctFree,
            serializable: serializable,
            factStateFilters: factStateFilters,
        };
    }
    /**
     * 一行读数(四方**分开说**:带上 / 越预算 / 关键面缺 / 被挡住的那几类)。
     *   合并任意两方都会让人误判「这一幕到底带齐了没有」—— 所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '材料包异常(已降级,不外抛)';
        if (r.malformedInput) return '材料包输入畸形(inventory 不是数组)—— 无从选材';
        const c = r.counts || {};
        if (!c.inventory) return '暂无材料(下一幕 ' + (r.taskLabel || r.task || '') + ')';
        const parts = ['下一幕 ' + (r.taskLabel || r.task), '材料 ' + c.inventory, '带上 ' + c.packed];
        if (c.truncated) parts.push('越预算 ' + c.truncated);
        if (r.gapsCritical && r.gapsCritical.length) parts.push('**关键面缺 ' + r.gapsCritical.length + '**');
        if (c.superseded) parts.push('被取代 ' + c.superseded);
        if (c.disputed) parts.push('争议保留 ' + c.disputed);
        if (c.restricted) parts.push('受限 ' + c.restricted);
        if (c.future) parts.push('未发生 ' + c.future);
        if (c.unclassified) parts.push('未归面 ' + c.unclassified);
        if (r.budget && r.budget.given === false) parts.push('(缺省预算 ' + r.budget.perItem + ' 条)');
        return parts.join(' · ');
    }
    /** 逐面清单(只说**带哪几样**与**哪几面空着**,不产出正文)。 */
    function render(read, opts) {
        try {
            const r = read || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const max = numOr(o.max, PACK_MAX);
            if (!r.judged) return r.malformedInput ? '材料包输入畸形,无从选材。' : '材料包未判。';
            const pack = arrOf(r.pack);
            const lines = [];
            const head = '下一幕:' + (r.taskLabel || r.task) + '(按任务优先级排序)';
            lines.push(head);
            if (!pack.length) lines.push('- 没有可用材料');
            for (let i = 0; i < pack.length; i++) {
                if (lines.length > max) break;
                const m = pack[i];
                const src = m.source ? ('(来源:' + m.source + ')') : '';
                const fl = (m.floor === null) ? '' : ('@' + m.floor);
                lines.push('- [' + (FACET_LABEL[m.facet] || m.facet || '未归面') + '] ' + (m.title || m.id) + fl + src);
            }
            const gaps = arrOf(r.gaps);
            if (gaps.length) lines.push('缺口:' + gaps.map((g) => (g.facetLabel || g.facet) + (g.critical ? '(关键)' : '')).join('、'));
            if (r.superseded && r.superseded.length) lines.push('被取代:' + r.superseded.map((s) => s.id + '→' + s.supersededBy).join('、'));
            return lines.join(NL);
        } catch (_e) { return ''; }
    }
    /** 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
    function describe(extra) {
        const sc = selfCheck();
        const o = (extra && typeof extra === 'object') ? extra : {};
        return Object.assign({
            kind: MP_KIND, version: MP_VERSION,
            tasks: TASKS.slice(), taskLabels: TASKS.map((t) => TASK_LABEL[t]),
            facets: FACETS.slice(), facetLabels: Object.assign({}, FACET_LABEL),
            priorityPerTask: TASKS.map((t) => ({ task: t, order: TASK_PRIORITY[t].slice() })),
            sources: SOURCES.slice(),
            inventoryMax: INVENTORY_MAX, packMax: PACK_MAX, budgetDefault: BUDGET_DEFAULT, snippetMax: SNIPPET_MAX,
            criticalCount: CRITICAL_COUNT,
            orderIsRank: true, cutsToToken: false, budgetOwner: 'injection-router',
            offline: true, writesNothing: true, devisesNothing: true, injectsNothing: false,
            selfCheck: sc,
        }, o);
    }
    const api = {
        MP_VERSION: MP_VERSION,
        MP_KIND: MP_KIND,
        FACT_STATES: FACT_STATES,
        TASKS: TASKS,
        TASK_LABEL: TASK_LABEL,
        FACETS: FACETS,
        FACET_LABEL: FACET_LABEL,
        TASK_PRIORITY: TASK_PRIORITY,
        SOURCES: SOURCES,
        INVENTORY_MAX: INVENTORY_MAX,
        PACK_MAX: PACK_MAX,
        BUDGET_DEFAULT: BUDGET_DEFAULT,
        SNIPPET_MAX: SNIPPET_MAX,
        CRITICAL_COUNT: CRITICAL_COUNT,
        KIND_TO_FACET: KIND_TO_FACET,
        keyOf: keyOf,
        strOf: strOf,
        arrOf: arrOf,
        numOr: numOr,
        floorOf: floorOf,
        clip: clip,
        hash32: hash32,
        safe: safe,
        sameValue: sameValue,
        facetFor: facetFor,
        materialOf: materialOf,
        normalize: normalize,
        facetRankOf: facetRankOf,
        rank: rank,
        resolveConflicts: resolveConflicts,
        budgetOf: budgetOf,
        taskOf: taskOf,
        criticalFacetsOf: criticalFacetsOf,
        build: build,
        render: render,
        describe: describe,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck,
        line: line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaMaterialPack = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }    return api;
})(typeof window !== 'undefined' ? window : globalThis);