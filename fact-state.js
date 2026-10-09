/* ================================================================
 * fact-state.js — [v3.299.0 · M-O6] 事实状态的**单一真源**（五态 + 有效范围 + 不确定态可判）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   M-O6 的原文需求：「真实使用中最易出错的是『新事实已写入，旧投影 / 关系 / 召回仍在
 *   使用』」。实测本仓修前的三个缺口：
 *     · **状态是隐式派生的，且散在各处各推一遍**：事实的状态由三个字段拼出来 ——
 *       `revoked === true`（撤回）/ `to != null`（被换代闭合）/ 其余（有效）。
 *       `fact-version.js` 的 `lookup` 用 `!f.revoked && f.to == null` 判现状；
 *       `memory-type.js` 的 `typedBuckets` 只挡 `revoked`、**不挡 `to != null`** ⇒
 *       **被换代的旧事实照样进类型化注入面**（新事实已写入、旧投影仍在用 —— 正是本条要治的形态）；
 *     · **没有 `disputed`**：`supersededBy` 指向一条**账上不存在**的事实（删楼 / 导入残缺 /
 *       世代丢失）时，读侧会把它当「已换代」静默丢弃或当「有效」照常注入，两种都不对 ——
 *       那是「判不了」，必须与「已换代」和「有效」三者不同形；
 *     · **状态变化没有可回读的留痕**：撤回 / 换代是写动作，但没有任何出口回答
 *       「这条事实的状态是怎么变成现在这样的」（源数据变了、展示层看不出来）。
 *
 * 【本模块做什么（五态 + 三件事）】
 *   ① 五态单一真源：`active / superseded / revoked / disputed / unknown`
 *      —— 四态可推导（各自带 reason），`disputed` 由**指涉悬空**推导或由显式字段给出；
 *   ② `readState()`：把整本账读成逐条状态 + 计数 + **旧口径泄漏点名**（纯读、幂等、不写回）；
 *      配 `rangeOf()` 读「时间有效范围」（`from` / `to` / 是否闭合 / 现在是否仍在区间内）；
 *      冲突一律按**保守序**取值（revoked > superseded > active，宁可不注入也不冒险注入）并点名；
 *   ③ `admitForLoad()`：载荷准入 —— 只有 `active` 进模型上下文；`superseded` 可在
 *      「历史回放」场景按 opts 放行，**`revoked` 永不放行**（撤回是绝对的）。
 *
 * 【五态与理由码（写死在这里，别处不得再解释一遍）】
 *   active      —— 未撤回、区间未闭合（或显式 state:'active'）
 *   superseded  —— 区间已闭合 `to != null`（或显式 state:'superseded'）
 *   revoked     —— `revoked === true` / 显式 state:'revoked'（**绝对**，不收任何 opts）
 *   disputed    —— 指涉悬空：`supersededBy` 指向账上不存在的 id（显式 state:'disputed' 亦收）
 *   unknown     —— **不可判**：条目本身畸形（无 id）或显式标了本模块不认的状态名
 *
 *   ★ 纪律：`unknown` 不是 `active`，也不是 `superseded`。把「判不了」压进任何一态，
 *     要么让残缺条目偷偷进注入面，要么让它静默消失 —— 两者都是本仓治理过多轮的形态。
 *
 * 【本模块不做什么（边界）】
 *   · 不改 `fact-version.js` 的既有字段与读法（`revoked` / `to` / `supersededBy` 一字不动）——
 *     本模块是**新增**的显式状态面，旧账不带 `state` 字段时按同一套推导读；
 *   · 不做冲突裁决（那是 `lookup` / `CONFLICT_POLICIES` 的地盘）：`disputed` 只表示
 *     「这条事实的换代指涉断了」，不表示「两条事实谁对」；
 *   · 不写盘、不副作用：纯函数，任何畸形入参退化为可读的降级读数，不抛。
 *
 * 【★ 为什么没有「写回式迁移」（实测结论，勿回退）】
 *   首版设计过 `migrate()`：把推导出的状态**写进条目**当显式字段。实测两条都不成立 ——
 *     ① `fact-version.js#copyFact` 是**白名单**逐字段重建（`id/subject/predicate/value/type/`
 *        `conflictPolicy/origin/trust/from/to/floor/source/evidence/supersededBy/revoked/`
 *        `revokeReason/revision/history`），任何未列字段下次 `normalize` 就被剥掉：
 *        实测 `normalize(migrateWriteBack(st)).facts[i].state === undefined`。
 *        写进去的状态**活不过一次规范化**，等于给读者一个假的持久面；
 *     ② 更要紧的是它违反 M-O6 第 4 条「**禁止只改展示层**掩盖源数据未修复」：
 *        一旦有第二个状态字段，就会出现「推导说 superseded、持久说 active」的双真源，
 *        而真源（`revoked` / `to` / `supersededBy`）没修也可能被那个字段掩盖过去。
 *   故本模块的**权威口径永远是推导**（真源字段 → 五态），并把它落成「读」而不是「写」：
 *   `readState()` 随时复算、`transitionOf()` 随时回答单条怎么变的 ——
 *   状态**可回读**，但**不新增持久字段**；回读的是同一份真源，不是另抄一份。
 *   副产品是 `readState().leaked`：**旧口径会放行、新口径必须挡**的那些条目（逐条点名），
 *   也就是「本版修掉的那条真缺陷」的量化读数 —— 没有它，这个缺口只能靠人记得。
 * ================================================================ */
(function (global) {
    'use strict';
    const STATE_VERSION = 1;
    /** 五态：**穷尽互斥**（每条事实恰落一态，自带自证）。改此处即口径变化，须同步 CHANGELOG。 */
    const STATES = Object.freeze(['active', 'superseded', 'revoked', 'disputed', 'unknown']);
    /** 理由码：状态「是谁判的」必须可读（推导 / 显式 / 不可判），不得只给状态名。 */
    const REASONS = Object.freeze({
        OPEN: 'open-interval',
        CLOSED: 'closed-interval',
        REVOKED: 'revoked-flag',
        DANGLING: 'dangling-supersession',
        EXPLICIT: 'explicit-field',
        CONFLICT: 'explicit-conflicts-derived',
        UNREADABLE: 'unreadable-entry',
        UNKNOWN_LABEL: 'unknown-state-label',
    });
    /** 显式字段与推导结果冲突时的**保守序**：数字大者胜（宁可不注入，也不冒险注入）。 */
    const SEVERITY = Object.freeze({ active: 0, superseded: 1, disputed: 2, unknown: 3, revoked: 4 });
    /* 「载荷准入」的默认策略：只有 active 进模型上下文。
     *   superseded 收 `opts.includeSuperseded`（历史回放要用的正是旧版本）；
     *   revoked / disputed / unknown **不受任何 opts 影响** —— 撤回是绝对的，
     *   判不了与有争议的条目一律不许冒充「可用事实」进载荷。 */
    const WITHHOLD_REASON = Object.freeze({
        superseded: 'superseded-by-newer',
        revoked: 'revoked-absolute',
        disputed: 'disputed-uncertain',
        unknown: 'unreadable-or-unknown-state',
    });
    const _str = (v) => String(v == null ? '' : v);
    const _isObj = (v) => !!v && typeof v === 'object';
    const _isId = (v) => _str(v).length > 0;
    /* 楼层号读法：空 / null / undefined 一律读回 null（**不拿 0 冒充** ——
     *   0 是合法楼层（开局前），用 0 兜「没给」会把「无区间」读成「第 0 楼起」。 */
    const _num = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };
    /* id 点名摘要：最多列 5 条，余下只报条数。点名的目的是「可定位」，
     *   不是「把整本账铺在一行里」—— 一行塞 200 个 id 会让真正的告警淹没在噪声里。 */
    const _idsBrief = (ids) => {
        const list = (Array.isArray(ids) ? ids : []).map(_str).filter(Boolean);
        if (list.length <= 5) return list.join('、');
        return list.slice(0, 5).join('、') + ' 等 ' + list.length + ' 条';
    };

    /** 合法状态名（显式字段用）。给了不认的名字 ⇒ `unknown` + 理由 `unknown-state-label`（不静默归 active）。 */
    function isState(s) { return STATES.indexOf(_str(s)) >= 0; }

    /**
     * 时间有效范围（M-O6 第 2 条「明确时间有效范围」）。
     *   `from` / `to` 是**剧情楼层号**（可空 ⇒ 读回 null，**不拿 0 冒充**）。
     *   `coversNow` 三态：true（区间开着）/ false（已闭合）/ null（**判不了**：两端都缺）。
     *   为什么必须留 null：`fact-version.js#coversAt` 对「无区间」本就返回 null（判不了，不猜），
     *   这里若塌成 false，会把「没有区间信息」读成「不在区间内」—— 那是两个相反的动作。
     */
    function rangeOf(f) {
        const o = _isObj(f) ? f : {};
        const from = _num(o.from);
        const to = _num(o.to);
        const closed = (o.to != null && o.to !== '');
        return {
            from: from, to: to, closed: closed,
            coversNow: (from == null && to == null) ? null : !closed,
        };
    }

    /**
     * 推导状态：只看 `fact-version.js` 既有字段（`revoked` / `to` / `supersededBy`），
     * 外加一个「账上现存 id 集合」用于判**指涉是否悬空**。
     * @param {object} f      事实条目
     * @param {Set<string>} ids 账上现存事实 id（用于判 `supersededBy` 是否悬空）
     * @returns {{state:string, reason:string, carried:boolean}}
     *   carried=true 表示「该条目带了显式 state 字段」（迁移是否已做过，据此判幂等）
     */
    function derive(f, ids) {
        if (!_isObj(f) || !_isId(f.id)) {
            return { state: 'unknown', reason: REASONS.UNREADABLE, carried: _isObj(f) && f.state != null };
        }
        const carried = f.state != null;
        const explicit = carried ? _str(f.state) : '';
        const declared = isState(explicit) ? explicit : null;
        /* 推导序（与旧读侧口径逐条对齐，顺序即优先级）：
         *   ① revoked 标记；② 区间已闭合；③ `supersededBy` 悬空 ⇒ disputed；④ 其余 active。 */
        let guState, guReason;
        if (f.revoked === true) { guState = 'revoked'; guReason = REASONS.REVOKED; }
        else if (f.to != null && f.to !== '') { guState = 'superseded'; guReason = REASONS.CLOSED; }
        else if (_isId(f.supersededBy) && ids && !ids.has(_str(f.supersededBy))) {
            guState = 'disputed';
            guReason = REASONS.DANGLING;
        } else { guState = 'active'; guReason = REASONS.OPEN; }
        if (!carried) return { state: guState, reason: guReason, carried: false };
        /* 显式字段在场：认则用之；不认则 unknown（**不回落推导**——「写错了状态名」与
         *   「没写状态」必须不同形，回落会把拼错读成正常）。 */
        if (!declared) {
            return { state: 'unknown', reason: REASONS.UNKNOWN_LABEL, carried: true };
        }
        if (declared === guState) return { state: declared, reason: guReason, carried: true };
        /* 与推导冲突（例：state:'active' 但 revoked===true）⇒ 保守序取严者，并点名冲突。
         *   为什么取严：放宽会让「已撤回却标 active」的条目回到注入面；取严最坏只是少注一条。 */
        const pick = SEVERITY[declared] >= SEVERITY[guState] ? declared : guState;
        return { state: pick, reason: REASONS.CONFLICT, carried: true };
    }

    /** 单条状态（对外读法）。第二条参数可传 id 数组 / Set / 整本账。 */
    function stateOf(f, knownIds) {
        const ids = idSetOf(knownIds);
        const d = derive(f, ids);
        return {
            id: _isObj(f) ? _str(f.id) : '',
            state: d.state,
            reason: d.reason,
            carried: d.carried,
            admissible: d.state === 'active',
            range: rangeOf(f),
        };
    }

    /** 收 id 集合：接受 Set / 数组 / 账本对象（`{facts:[]}`）/ null。 */
    function idSetOf(src) {
        if (!src) return new Set();
        if (src instanceof Set) return src;
        if (_isObj(src) && Array.isArray(src.facts)) return factsIdSet(src);
        if (Array.isArray(src)) return new Set(src.map(_str).filter(Boolean));
        return new Set();
    }
    function factsIdSet(st) {
        const s = new Set();
        const list = _isObj(st) && Array.isArray(st.facts) ? st.facts : [];
        for (const f of list) if (_isObj(f) && _isId(f.id)) s.add(_str(f.id));
        return s;
    }

    /**
     * 读侧状态读数（**纯读、幂等、不写回** —— 为什么不写回见文件头「为什么没有写回式迁移」）。
     *   · `entries` 是逐条状态读数（id / state / reason / carried / 有效范围 / admissible）；
     *   · `leaked` 是**旧口径会放行、新口径必须挡**的条目 —— 即本版修掉的那条真缺陷的量化读数；
     *   · 幂等：同一份账读两次，两次结果逐字相同（`entries` / `leaked` / `counts` 都不含时间戳）。
     *   ⚠️ 本函数**不改入参**（不写 `state` 字段）—— 见文件头第 4 条纪律。
     * @returns {{ok:boolean, entries:object[], counts:object, leaked:object[],
     *            conflicts:number, unreadable:string[], total:number}}
     */
    function readState(rawState) {
        const src = _isObj(rawState) ? rawState : {};
        const facts = Array.isArray(src.facts) ? src.facts : [];
        const ids = factsIdSet(src);
        const entries = [], leaked = [], unreadable = [];
        let conflicts = 0;
        for (const f of facts) {
            const d = derive(f, ids);
            if (d.reason === REASONS.CONFLICT) conflicts++;
            const ok = _isObj(f);
            const id = ok ? _str(f.id) : '';
            if (!_isId(id)) {
                unreadable.push(ok ? (_str(f.subject) + _str(f.predicate) || '(无 id)') : '(非对象条目)');
            }
            entries.push({
                id: id, state: d.state, reason: d.reason, carried: d.carried,
                range: rangeOf(f), admissible: d.state === 'active',
            });
            /* 旧口径放行的判据与 `memory-type.js#typedBuckets` **修前那一行同源**（不另写一份口径）：
             *   它只挡 `revoked === true`，且**认不出 id 的条目照放**（那正是它放行残缺条目的那一半）。
             *   故这里「旧口径放行」= 非 revoked；其中状态不是 active 的，就是本版挡下来的泄漏。 */
            const legacyOk = !(ok && f.revoked === true);
            if (legacyOk && d.state !== 'active') {
                leaked.push({ id: id, state: d.state, reason: WITHHOLD_REASON[d.state] || 'unknown' });
            }
        }
        const counts = {};
        for (const s of STATES) counts[s] = 0;
        for (const r of entries) counts[r.state]++;
        return {
            ok: true, entries: entries, counts: counts, leaked: leaked,
            conflicts: conflicts, unreadable: unreadable, total: facts.length,
        };
    }

    /** 五态计数（穷尽：合计 == 条目数，供自证）。 */
    function countsOf(rawState) {
        return readState(rawState).counts;
    }

    /**
     * 载荷准入：把「哪条事实允许进模型上下文」收成一处判定。
     *   ★ 修前实测的缺陷正在这里：`memory-type.js#typedBuckets` 挡了 `revoked` 却放行了
     *     `to != null` 的旧事实 ⇒ 被换代的旧值仍进类型化注入面。
     * @param {object} rawState 账本
     * @param {object} opts `{ includeSuperseded?:boolean }` —— 只有 superseded 可被放行
     * @returns {{supported:object[], withheld:object[], counts:object, reasonCounts:object,
     *            excluded:number, includeSuperseded:boolean}}
     */
    function admitForLoad(rawState, opts) {
        const o = _isObj(opts) ? opts : {};
        const includeSuperseded = o.includeSuperseded === true;
        const facts = (_isObj(rawState) && Array.isArray(rawState.facts)) ? rawState.facts : [];
        const ids = factsIdSet(rawState);
        const supported = [], withheld = [];
        const reasonCounts = {};
        for (const f of facts) {
            const d = derive(f, ids);
            const allow = d.state === 'active' || (d.state === 'superseded' && includeSuperseded);
            if (allow) { supported.push(f); continue; }
            const why = WITHHOLD_REASON[d.state] || 'unknown';
            reasonCounts[why] = (reasonCounts[why] || 0) + 1;
            withheld.push({ id: _isObj(f) ? _str(f.id) : '', state: d.state, reason: why });
        }
        return {
            supported: supported, withheld: withheld, counts: countsOf(rawState),
            reasonCounts: reasonCounts, excluded: withheld.length, includeSuperseded: includeSuperseded,
        };
    }

    /**
     * 状态变化回读：回答「这条事实的状态是怎么来的」。
     *   与 `fact-version.js` 的 `history` 分工：那边记**写入事件**（谁在何时变了值），
     *   这边记**状态判定**（现态 + 依据）。两者都不口语化，判不了就报 null。
     */
    function transitionOf(rawState, id) {
        const facts = (_isObj(rawState) && Array.isArray(rawState.facts)) ? rawState.facts : [];
        const ids = factsIdSet(rawState);
        const hit = facts.find((f) => _isObj(f) && _str(f.id) === _str(id));
        if (!hit) return { ok: false, reason: 'not-found', id: _str(id) };
        const d = derive(hit, ids);
        return {
            ok: true, id: _str(id), state: d.state, reason: d.reason,
            admissible: d.state === 'active',
            /* 有效范围随状态一并回读（M-O6 第 2 条）：只给状态不给区间，
             *   等于把「为什么是 superseded」这半句留给调用点自己猜。 */
            range: rangeOf(hit),
            supersededBy: _str(hit.supersededBy) || null,
            /* 悬空指涉必须能被读出来（点名的父 id 在不在账上），否则「判不了」的根因不可见。 */
            supersededByPresent: _isId(hit.supersededBy) ? ids.has(_str(hit.supersededBy)) : null,
            closed: hit.to != null && hit.to !== '',
            revoked: hit.revoked === true,
        };
    }

    /** 保守序是否严格单调（数字可比且 active < superseded < revoked）。
     *   disputed / unknown 与 revoked 的关系不参与断言 —— 无实测行为支撑，不倒推。 */
    function _severityMonotone() {
        if (!STATES.every((s) => typeof SEVERITY[s] === 'number')) return false;
        return SEVERITY.active < SEVERITY.superseded && SEVERITY.superseded < SEVERITY.revoked;
    }

    /**
     * 自证：五态穷尽 + 保守序单调 + **纯读幂等**。
     *   幂等的自证分两半，缺一不可：
     *     ① 读两次逐字相同（`JSON.stringify` 全等）—— 证明读数不含时间戳/不含趟次状态；
     *     ② 账本字节未被改写 —— 证明本模块**真的没写回**（只测 ① 会被「写回但每趟写同样值」骗过）。
     */
    function selfCheck(rawState) {
        const facts = (_isObj(rawState) && Array.isArray(rawState.facts)) ? rawState.facts : [];
        /* ★ 账本指纹必须在**任何读取之前**取。
         *   修前实测的自伤：原版把 fingerprint 放在 `countsOf()` 之后取 —— 而 `countsOf` 自己就会
         *   跑一遍 `readState`。于是一个「读时写回」的坏版本已经把 `f.state` 写进去了，
         *   指纹却是写完才取的 ⇒ 前后相同 ⇒ `noWriteBack` **假通过**。
         *   （抓到它的正是本档 I3 的负控制：破坏副本写回条目，判据却仍报绿。）
         *   纪律：自证要能抓住写回，取样就必须早于第一次读。 */
        let fingerprint = null;
        try { fingerprint = JSON.stringify(rawState === undefined ? null : rawState); } catch (e) { fingerprint = null; }
        const c = countsOf(rawState);
        let sum = 0;
        for (const s of STATES) sum += c[s];
        const severityMonotone = _severityMonotone();
        /* 幂等 ①：连读两次必须逐字相同。 */
        let idempotent = false;
        let passed = false;
        try {
            const once = JSON.stringify(readState(rawState));
            const twice = JSON.stringify(readState(rawState));
            idempotent = once === twice;
            /* 幂等 ②：连读后账本必须**逐字未变**（写回式迁移会在这里露馅）。 */
            passed = idempotent && fingerprint !== null
                && JSON.stringify(rawState === undefined ? null : rawState) === fingerprint;
        } catch (e) {
            /* 循环引用等 ⇒ 判不了。不许把「抛了」读成「通过了」。 */
            idempotent = false;
            passed = false;
        }
        return {
            facts: facts.length, counts: c, sum: sum,
            exhaustive: sum === facts.length,
            severityMonotone: severityMonotone,
            idempotent: idempotent,
            noWriteBack: passed,
            ok: sum === facts.length && severityMonotone && passed,
        };
    }

    /** 诊断一行：五态计数 + 冲突/悬空/不可判三处点名（压成一格会让三类问题同形）。 */
    function line(rawState) {
        try {
            const facts = (_isObj(rawState) && Array.isArray(rawState.facts)) ? rawState.facts : [];
            if (!facts.length) return '暂无事实';
            const ids = factsIdSet(rawState);
            const rs = readState(rawState);
            const c = rs.counts;
            const conflicts = rs.conflicts, leaked = rs.leaked.length;
            /* 「指涉悬空」不是「有争议」的同义词重报：这里点名**因父 id 不在账上**而争议的那些 id。
             *   悬空 id 混在争议里只有一个计数时，修不了 —— 得知道是哪几条的父 id 丢了。 */
            const danglingIds = rs.entries.filter((e) => e.state === 'disputed' && _isId(e.id)).map((e) => e.id);
            const parts = ['有效 ' + c.active];
            if (c.superseded) parts.push('已换代 ' + c.superseded);
            if (c.revoked) parts.push('已撤回 ' + c.revoked);
            if (c.disputed) parts.push('有争议 ' + c.disputed + '（指涉悬空 ' + danglingIds.length
                + (danglingIds.length ? '：' + _idsBrief(danglingIds) : '') + '）⚠️');
            if (c.unknown) parts.push('不可判 ' + c.unknown + ' ⚠️');
            if (conflicts) parts.push('显式与推导冲突 ' + conflicts + '（按保守序取值）');
            /* 旧口径泄漏**点名**（不只报数）：报数只能说明「有洞」，
             *   点名才能回答「本版到底多挡了哪几条」。 */
            if (leaked) parts.push('旧口径会放行 ' + leaked + '：' + _idsBrief(rs.leaked.map((x) => x.id || '(无 id)')) + ' ⚠️');
            parts.push('共 ' + facts.length);
            return parts.join(' · ');
        } catch (e) { return '—（事实状态异常）'; }
    }

    const api = {
        STATE_VERSION,
        STATES,
        REASONS,
        SEVERITY,
        WITHHOLD_REASON,
        isState,
        /* `derive` 与 `stateOf` **都要导出**，且不是重复：
         *   derive  给「一条事实 + 账上 id 集合」⇒ {state, reason, carried}（判定本体，纯）；
         *   stateOf 给「一条事实 + 任意形态的已知 id（Set/数组/整本账/null）」⇒ 加 id/admissible 的读侧形。
         *   只导出后者会让判据与宿主都得自己再包一层 id 集合（第二份口径）；
         *   只导出前者会让每个调用点各写一遍 admissible 的判法。 */
        derive,
        stateOf,
        rangeOf,
        isState,
        readState,
        countsOf,
        admitForLoad,
        transitionOf,
        selfCheck,
        line,
    };
    /* `migrate` **不导出**（不是漏了）：写回式迁移已被设计否决 —— 见文件头「为什么没有写回式迁移」。
     *   在导出面上留一个名字的坑位，等于给「以后想写回」留后门，所以连名字都不留。 */
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaFactState = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
