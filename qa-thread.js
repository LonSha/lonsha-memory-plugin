/* ========================================================
 * qa-thread.js — [v3.340.0 · M4-X4] 带消歧与条件继承的多轮记忆问答
 *
 * 【为什么需要这一面（修前实测，不是「多存一个数组」）】
 *   `evidence-query.js::planQuestion` 是**单问句**规划:它只看这一句,
 *   不接前问语义状态。于是三类真实追问在被问到时会**退化**:
 *     ① 「她后来呢」—— 句子里没有人名(只有代词),`planQuestion` 如实报
 *        `gap.kind='actor'`「问句里没认出在场人名」⇒ 退成全文宽查,
 *        把上一轮**已经确认**的主体整个丢掉;
 *     ② 「跟上次比呢」—— 无比较轴,规划器只出一条按主题的宽查,
 *        答出来的东西与「上次」**没有任何可对照的结构**;
 *     ③ 「回到那时候呢」—— 相对时点被如实记成「未翻译」(纪律没错),
 *        但**没有任何人**把它接回上一轮已经定下的时点条件。
 *   合起来:能问一句、不能追问;能记「未翻译」、不能继承。
 *
 * 【本模块怎么补(四条,都不改既有面)】
 *   ① **对话状态只存约束**:`normalizeThread` / `openThread` / `advanceThread`
 *      维护的是一条 thread,里面只有**结构化查询约束** ——
 *      主体(已确认实体名)/ 时点下界 / 分支键 / scope(宇宙·变体)/ 比较轴 /
 *      尚未裁决的候选。**不存第二份答案事实**(存答案＝第二份证据库,本仓明令禁止);
 *   ② **消歧不静默**:代词(「她/他/那人」)在**单一已确认主体**下才继承;
 *      thread 里有**两个及以上**主体时,代词**不猜** ⇒ 状态转
 *      `awaiting-disambig` 并列出候选,由用户点选(`resolveAmbiguity`),
 *      未决前**不产确定结论**(宿主据 `awaiting` 提前收口);
 *   ③ **条件继承逐条可读**:`advanceThread` 每次返回 `inherit`(继承自上一轮)
 *      与 `condition`(本轮新设),两者**分列**—— 「沿用了什么」与
 *      「这一句新加了什么」混成一格,读者就分不出「她后来呢」到底按谁查;
 *   ④ **不跨会话暗中继承**:thread 带 `chatKey`,与宿主给的 `branchKey` 一并
 *      在 `advanceThread` 里对账,身份变了即**作废重建**并如实说
 *      `why:'thread-identity-changed'`(跨会话继承会让 A 聊天的问题答成 B 的)。
 *
 * 【单一真源:查询条件不在本模块再声明一遍】
 *   本模块**不查任何东西**,也不定义过滤键 —— 它产出的 `spec` 片段
 *   (`threadSpec`)只含 `actors` / `floorFrom` 两个**既有 FILTERS 键**,
 *   由宿主把它并进 `planQuestion` 已产出的 spec 再交给 `query`。
 *   多一个自造键就是第二份条件真源(本仓治理过多轮的形态)。
 *
 * 【本模块**不做**什么(边界)】
 *   · 不做无限上下文代理:thread 是有界结构,主体 ≤ 8、trace ≤ 16;
 *   · 不把上一轮**模型措辞**当证据:继承的只有约束,正文一律不回填;
 *   · 不做同义改写 / 指代消解模型:代词消解只走「唯一主体才继承」这一条结构判据;
 *   · 不摸 window / 不读 storage:thread 由宿主持有并随聊天持久化。
 * ================================================================ */
(function (root) {
    'use strict';
    const QT_VERSION = 1;
    /** 状态机四态。`awaiting-disambig` 与 `open` **不得**同形(前者不产确定结论)。 */
    const QT_STATES = Object.freeze(['idle', 'open', 'awaiting-disambig', 'closed']);
    /** 有界:thread 是窄面,不是无限上下文。 */
    const QT_MAX_SUBJECTS = 8;
    const QT_MAX_TRACE = 16;
    const QT_MAX_CANDIDATES = 8;
    /* ── 标记词表(纯字面形态,不抽语义) ───────────────────────────────
     *   为什么用字面表而不是模型:换人 / 切分支 / 回旧时点 这三种**动作**
     *   在中文里由少量固定词承担,认字面就够 —— 而一旦要「理解」就会引入
     *   版本化词典依赖(本仓对「重放一致」的纪律)。 */
    const QT_MARK_SWITCH = /换(个|一)?人|另(问|说|提)|说(说)?别人|再说说|至于|其他(人|角色)|别人的/;
    const QT_MARK_BRANCH = /另一个?(结局|分支|线)|如果(当时)?|假如|换条线|走另一条|要是/;
    const QT_MARK_AT = /那时候|那时呢|那会儿|回到(那|当)时|当年|当初|当时的/;
    const QT_MARK_CMP = /比(较)?(一下)?|相比|对比|跟.{0,6}比|和.{0,6}比/;
    /** 代词:只在唯一主体下继承,多主体转消歧。 */
    const QT_MARK_PRONOUN = /她|他|它|那人|那个人|对方|这些人|那些人|两人|双方/;
    /* ── 时点锚(「第 N 楼」这类**有数值**的写法才折算成楼层) ──────────
     *   为什么只认「第 N 楼」:其它相对时点(「那时候」)在问句里**没有锚点**,
     *   折算等于猜 —— 本模块对无锚点一律继承上一轮已定下的楼层,**不新猜**。 */
    const QT_AT_FLOOR = /第\s*([0-9０-９]{1,6})\s*楼/;
    const CN_DIGITS = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5', '６': '6', '７': '7', '８': '8', '９': '9' };
    function text(v, max) {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) : s) : s;
    }
    function strList(v, max, cap) {
        const out = [];
        if (!Array.isArray(v)) { const t = text(v, max); return t ? [t] : out; }
        for (const x of v) {
            const t = text(x, max);
            if (t && out.indexOf(t) < 0) out.push(t);
            if (out.length >= cap) break;
        }
        return out;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    /* ── 约束归一:thread 的**唯一**形状在这里声明一次 ─────────────────
     *   `drops` 如实记下被丢弃的键(空值 / 未知键),不静默。 */
    function normalizeThread(raw) {
        const src = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const drops = [];
        const subjects = strList(src.subjects, 40, QT_MAX_SUBJECTS);
        const candidates = strList(src.candidates, 40, QT_MAX_CANDIDATES);
        const state = (QT_STATES.indexOf(src.state) >= 0) ? src.state : (subjects.length ? 'open' : 'idle');
        const scopeRaw = (src.scope && typeof src.scope === 'object' && !Array.isArray(src.scope)) ? src.scope : {};
        const scope = {};
        for (const k of ['universe', 'variant', 'source']) {
            const t = text(scopeRaw[k], 60);
            if (t) scope[k] = t;
        }
        const atFloor = numOrNull(src.atFloor);
        const trace = [];
        if (Array.isArray(src.trace)) {
            for (const e of src.trace.slice(-QT_MAX_TRACE)) {
                if (!e || typeof e !== 'object') { drops.push('trace:malformed'); continue; }
                trace.push({ turn: numOrNull(e.turn) || 0, q: text(e.q, 80), subjects: strList(e.subjects, 40, QT_MAX_SUBJECTS), state: text(e.state, 24) });
            }
        }
        return {
            version: QT_VERSION,
            state: state,
            chatKey: text(src.chatKey, 80),
            branchKey: text(src.branchKey, 60),
            subjects: subjects,
            candidates: candidates,
            atFloor: atFloor,
            atHint: text(src.atHint, 40),
            compareAxis: text(src.compareAxis, 40),
            scope: scope,
            turn: Math.max(0, numOrNull(src.turn) || 0),
            trace: trace,
            drops: drops,
            writesNothing: true
        };
    }
    /** 读标记(纯函数)。返回命中的**动作名**数组,不含正文。 */
    function marksOf(question) {
        const q = text(question, 200);
        const out = [];
        if (QT_MARK_SWITCH.test(q)) out.push('switch');
        if (QT_MARK_BRANCH.test(q)) out.push('branch');
        if (QT_MARK_AT.test(q)) out.push('at');
        if (QT_MARK_CMP.test(q)) out.push('compare');
        if (QT_MARK_PRONOUN.test(q)) out.push('pronoun');
        return out;
    }
    /** 从问句取**有锚**的楼层(只认「第 N 楼」)。取不到 ⇒ null(不猜)。 */
    function atFloorOf(question) {
        const q = text(question, 200);
        const m = QT_AT_FLOOR.exec(q);
        if (!m) return null;
        const s = String(m[1]).replace(/[０-９]/g, (c) => CN_DIGITS[c] || c);
        const n = numOrNull(s);
        return (n === null || n <= 0) ? null : n;
    }
    /* ── 打开一条新 thread(首轮) ─────────────────────────────────────
     *   `plan` 是 `planQuestion` 的返回。本函数**只读**它,不改。
     *   首轮就问得模糊(代词且无主体)⇒ 直接进 awaiting(不产确定结论)。 */
    function openThread(question, plan, opts) {
        const o = opts || {};
        const q = text(question, 200);
        const p = (plan && typeof plan === 'object') ? plan : {};
        const gaps = [];
        const marks = marksOf(q);
        const actors = strList(p.actors, 40, QT_MAX_SUBJECTS);
        const hasPronoun = marks.indexOf('pronoun') >= 0;
        const atFloor = atFloorOf(q);
        const t = normalizeThread({
            state: actors.length ? 'open' : 'idle',
            chatKey: text(o.chatKey, 80),
            branchKey: text(o.branchKey, 60),
            subjects: actors.slice(),
            candidates: [],
            atFloor: atFloor,
            atHint: (marks.indexOf('at') >= 0) ? text(q, 40) : '',
            compareAxis: (marks.indexOf('compare') >= 0 && actors.length >= 2) ? 'compare' : '',
            scope: o.scope,
            turn: 1,
            trace: [{ turn: 1, q: q, subjects: actors.slice(), state: actors.length ? 'open' : 'idle' }]
        });
        t.marks = marks;
        if (!actors.length && hasPronoun) {
            gaps.push({ kind: 'pronoun-no-anchor', why: '问句用了代词但**本会话还没有已确认的主体** —— 不猜「她」是谁(猜一个不存在的指代与「这人没答应过」同形)' });
        }
        return {
            thread: t, marks: marks,
            inherit: [],
            condition: conditionOf(t, actors, atFloor, (marks.indexOf('compare') >= 0 && actors.length >= 2) ? 'compare' : ''),
            gaps: gaps, awaiting: false, why: 'opened'
        };
    }
    /** 本轮**新设**的条件(与继承分列)。 */
    function conditionOf(thread, actors, atFloor, compareAxis) {
        const c = [];
        if (actors.length) c.push({ axis: 'subject', value: actors.slice() });
        if (atFloor !== null) c.push({ axis: 'atFloor', value: atFloor });
        if (compareAxis) c.push({ axis: 'compare', value: compareAxis });
        if (Object.keys(thread.scope).length) c.push({ axis: 'scope', value: Object.assign({}, thread.scope) });
        if (thread.branchKey) c.push({ axis: 'branch', value: thread.branchKey });
        return c;
    }
    /** 本轮**继承**的条件(逐条可读到「沿用了哪个轴」)。 */
    function inheritOf(thread) {
        const c = [];
        if (thread.subjects.length) c.push({ axis: 'subject', value: thread.subjects.slice(), from: 'thread' });
        if (thread.atFloor !== null) c.push({ axis: 'atFloor', value: thread.atFloor, from: 'thread' });
        if (thread.compareAxis) c.push({ axis: 'compare', value: thread.compareAxis, from: 'thread' });
        if (thread.branchKey) c.push({ axis: 'branch', value: thread.branchKey, from: 'thread' });
        return c;
    }
    /**
     * 推进一轮(核心)。
     *
     * 顺序**不可换**(每一步都改变下一步的读数):
     *   ① 身份对账 —— chatKey / branchKey 变了即作废重建(不跨会话暗中继承);
     *   ② 读标记 —— 换人 / 切分支 / 回旧时点 / 比较 / 代词;
     *   ③ 定主体 —— 显式人名优先;代词只在**唯一**主体下继承;多主体转消歧;
     *   ④ 定条件 —— 时点(有锚新设 / 无锚继承)、比较轴、scope、branch;
     *   ⑤ 落 trace —— 有界,旧的挤出。
     *
     * @param {object|null} thread 上一条 thread(可为 null ⇒ 等价首轮)
     * @param {object} plan `planQuestion` 的返回
     * @param {object} [opts] { question, chatKey, branchKey, now, scope }
     * @returns {object} { thread, marks, inherit[], condition[], gaps[], awaiting, why }
     */
    function advanceThread(thread, plan, opts) {
        const o = opts || {};
        const prev = thread ? normalizeThread(thread) : null;
        const q = text(o.question, 200);
        const p = (plan && typeof plan === 'object') ? plan : {};
        const gaps = [];
        /* ① 身份对账:上下文身份不是「同一条 thread」时**作废重建**并具名。 */
        if (prev && prev.turn > 0) {
            const chatChanged = !!prev.chatKey && o.chatKey !== undefined && String(o.chatKey) !== prev.chatKey;
            const branchChanged = !!prev.branchKey && o.branchKey !== undefined && String(o.branchKey) !== prev.branchKey;
            if (chatChanged || branchChanged) {
                gaps.push({
                    kind: 'thread-identity-changed',
                    why: (chatChanged ? '会话已切换' : '分支已切换') + '（前:' + (chatChanged ? prev.chatKey : prev.branchKey)
                        + ' / 后:' + (chatChanged ? String(o.chatKey) : String(o.branchKey)) + '）—— 不跨' + (chatChanged ? '会话' : '分支') + '暗中继承追问条件'
                });
                const re = openThread(q, p, o);
                re.gaps = gaps.concat(re.gaps);
                re.why = 'thread-identity-changed';
                return re;
            }
        }
        if (!prev || prev.turn === 0) {
            const fresh = openThread(q, p, o);
            fresh.gaps = gaps.concat(fresh.gaps);
            return fresh;
        }
        /* ② 标记 */
        const marks = marksOf(q);
        const actors = strList(p.actors, 40, QT_MAX_SUBJECTS);
        const hasSwitch = marks.indexOf('switch') >= 0;
        const hasPronoun = marks.indexOf('pronoun') >= 0;
        const prevSubjects = prev.subjects.slice();
        /* ③ 定主体 */
        let subjects;
        let candidates = [];
        let awaiting = false;
        let subjectWhy = '';
        if (hasSwitch) {
            /* 换人:上一轮主体**全部清掉**,只认本轮显式人名。 */
            subjects = actors.slice();
            subjectWhy = subjects.length
                ? '换人:「' + subjects.join('/') + '」替换上一轮主体（上一轮主体已清，不残留）'
                : '换人:但本轮没认出新人名 ⇒ 主体置空（**不**回落到上一轮 —— 换人却按旧人查是错读数）';
            if (!subjects.length) {
                awaiting = true;
                gaps.push({ kind: 'switch-without-name', why: '说了要换人,但问句里没有认出任何人名 —— 不猜指谁(猜一个不存在的指代与「这人没事」同形)' });
            }
        } else if (actors.length) {
            subjects = actors.slice();
            subjectWhy = '显式人名:' + subjects.join('/');
        } else if (hasPronoun) {
            /* 代词:唯一已确认主体 ⇒ 继承;**≥2** ⇒ 消歧(不猜)。 */
            const pr = (QT_MARK_PRONOUN.exec(q) || ['她'])[0];
            if (prevSubjects.length === 1) {
                subjects = prevSubjects.slice();
                subjectWhy = '代词「' + pr + '」→ 唯一已确认主体「' + subjects[0] + '」(继承)';
            } else if (prevSubjects.length >= 2) {
                subjects = prevSubjects.slice();
                candidates = prevSubjects.slice();
                awaiting = true;
                gaps.push({
                    kind: 'ambiguous-subject', candidates: candidates.slice(),
                    why: '问句用代词,而本会话已有 **' + prevSubjects.length + ' 个**主体（' + prevSubjects.join(' / ') + '）—— 指代不定,**不产确定结论**,请点选一个或明说人名'
                });
                subjectWhy = '代词指代不定 ⇒ 候选 ' + candidates.join('/');
            } else {
                subjects = [];
                subjectWhy = '代词但无已确认主体可比对';
                gaps.push({ kind: 'pronoun-no-anchor', why: '问句用了代词,但本会话还没有已确认的主体 —— 不猜「她」是谁' });
            }
        } else {
            /* 无显式人名、无代词:沿用上一轮(连续追问默认继承)。 */
            subjects = prevSubjects.slice();
            subjectWhy = subjects.length
                ? '本句无新主体 ⇒ 沿用上一轮「' + subjects.join('/') + '」(连续追问默认继承)'
                : '本句无新主体,上一轮也无 —— 无人名可比对(入参事实,不是「没有这个人」)';
        }
        /* ④ 定条件 */
        const hasAt = marks.indexOf('at') >= 0;
        const anchor = atFloorOf(q);
        let atFloor = prev.atFloor;
        let atSet = false;
        if (anchor !== null) { atFloor = anchor; atSet = true; }
        else if (hasAt) {
            if (prev.atFloor === null) {
                gaps.push({ kind: 'at-hint-unresolved', why: '问句含回旧时点的说法「' + (QT_MARK_AT.exec(q) || ['那时候'])[0] + '」,而本会话尚未定下时点、句中也没有「第 N 楼」锚点 —— 不折算(折算等于猜),时点条件下界未施加' });
            }
            /* 有锚点已定下时点 ⇒ 沿用(继承),不新猜。 */
        }
        const compareNow = (marks.indexOf('compare') >= 0 && subjects.length >= 2);
        const compareAxis = compareNow ? 'compare' : (prev.compareAxis || '');
        /* 分支:切分支标记须带 `opts.branchKey`;没给 ⇒ 保留旧分支并具名。 */
        let branchKey = prev.branchKey;
        if (marks.indexOf('branch') >= 0) {
            if (o.branchKey !== undefined && o.branchKey !== null && String(o.branchKey) !== '') branchKey = String(o.branchKey);
            else gaps.push({ kind: 'branch-key-absent', why: '问句含切分支的说法,但调用方未给 branchKey —— 保留当前分支「' + (prev.branchKey || '(未设)') + '」,不擅自另立一条线' });
        }
        const scope = Object.assign({}, prev.scope);
        if (o.scope && typeof o.scope === 'object') for (const k of Object.keys(o.scope)) { const t = text(o.scope[k], 60); if (t) scope[k] = t; }
        const t = normalizeThread({
            state: awaiting ? 'awaiting-disambig' : (subjects.length ? 'open' : 'idle'),
            chatKey: (o.chatKey !== undefined ? String(o.chatKey) : prev.chatKey),
            branchKey: branchKey,
            subjects: subjects,
            candidates: candidates,
            atFloor: atFloor,
            atHint: atSet ? text(q, 40) : prev.atHint,
            compareAxis: compareAxis,
            scope: scope,
            turn: prev.turn + 1,
            trace: prev.trace.concat([{ turn: prev.turn + 1, q: q, subjects: subjects, state: awaiting ? 'awaiting-disambig' : 'open' }])
        });
        t.marks = marks;
        t.subjectWhy = subjectWhy;
        return {
            thread: t, marks: marks,
            inherit: inheritOf(prev).filter((x) => (x.axis === 'subject' ? (!actors.length && !hasSwitch) : true)),
            condition: conditionOf(t, (hasSwitch || actors.length) ? actors : [], atSet ? anchor : null, compareNow ? 'compare' : ''),
            gaps: gaps, awaiting: awaiting, why: 'advanced'
        };
    }
    /**
     * 消歧:把用户的点选接回 thread。`picks` = 用户选中的主体名数组。
     *   未选 ⇒ 保持 awaiting(**不产确定结论**),并如实说 unresolved。 */
    function resolveAmbiguity(thread, picks) {
        const t = normalizeThread(thread);
        const list = strList(picks, 40, QT_MAX_SUBJECTS);
        const cand = t.candidates.slice();
        const chosen = list.filter((x) => cand.indexOf(x) >= 0);
        const unknown = list.filter((x) => cand.indexOf(x) < 0);
        if (!chosen.length) {
            return {
                thread: t, resolved: false, chosen: [], unknown: unknown,
                why: '未选中任何候选(候选:' + cand.join('/') + ')—— 保持 awaiting-disambig,不产确定结论', writesNothing: true
            };
        }
        const nt = normalizeThread(Object.assign({}, t, {
            state: 'open', subjects: chosen, candidates: [],
            trace: t.trace.concat([{ turn: t.turn, q: '(消歧点选)', subjects: chosen, state: 'open' }])
        }));
        nt.chosenFrom = cand;
        return {
            thread: nt, resolved: true, chosen: chosen, unknown: unknown,
            why: '人工点选「' + chosen.join('/') + '」(候选来自上一轮 ' + cand.length + ' 个主体)',
            writesNothing: true
        };
    }
    /**
     * spec 注入片段:**只含既有 FILTERS 键**(actors / floorFrom)。
     *   宿主把它并进 planQuestion 已产出的 spec 再交给 query —— 本模块不查东西。
     */
    function threadSpec(thread) {
        const t = normalizeThread(thread);
        const spec = {};
        if (t.subjects.length) spec.actors = t.subjects.slice();
        if (t.atFloor !== null) spec.floorFrom = t.atFloor;
        return { spec: spec, from: Object.keys(spec), writesNothing: true };
    }
    /** 面自述。`drops` 如实报归一期的丢弃。 */
    function describe(raw) {
        const t = normalizeThread(raw);
        return {
            version: QT_VERSION, states: QT_STATES.slice(),
            maxSubjects: QT_MAX_SUBJECTS, maxTrace: QT_MAX_TRACE, maxCandidates: QT_MAX_CANDIDATES,
            state: t.state, subjects: t.subjects.length, candidates: t.candidates.length,
            atFloor: t.atFloor, branchKey: t.branchKey, turn: t.turn,
            drops: t.drops.slice(), writesNothing: true,
            reason: '对话状态只存结构化查询约束(主体 / 时点下界 / 分支 / scope),不存答案事实'
        };
    }
    /** 面自证(纯函数,不抛)。 */
    function selfCheck(raw) {
        const bad = [];
        const t = normalizeThread(raw);
        if (QT_STATES.indexOf(t.state) < 0) bad.push('state 不在四态内');
        if (t.subjects.length > QT_MAX_SUBJECTS) bad.push('subjects 越上界');
        if (t.trace.length > QT_MAX_TRACE) bad.push('trace 越上界');
        /* 不变式:awaiting-disambig 必须**有候选**(无候选的待决就是死状态)。 */
        if (t.state === 'awaiting-disambig' && t.candidates.length < 2) bad.push('awaiting-disambig 但候选不足两个(待决必须有可选项)');
        return { ok: bad.length === 0, bad: bad, distinct: QT_STATES.length === 4, writesNothing: true };
    }
    /** 诊断一行:把「沿用了什么 / 新设了什么 / 待决什么」写成三种可辨形态。 */
    function threadLine(arg) {
        try {
            const a = (arg && arg.thread) ? arg : { thread: arg };
            const t = normalizeThread(a.thread);
            if (!t.turn) return '追问 · 未开始';
            const parts = ['追问 第' + t.turn + '轮'];
            if (t.state === 'awaiting-disambig') parts.push('待消歧（候选 ' + t.candidates.join('/') + '）');
            else parts.push('主体 ' + (t.subjects.length ? t.subjects.join('/') : '(无)'));
            if (t.atFloor !== null) parts.push('时点 ≥' + t.atFloor + '楼');
            if (t.compareAxis) parts.push('轴 ' + t.compareAxis);
            if (Array.isArray(a.inherit) && a.inherit.length) parts.push('继承 ' + a.inherit.map((x) => x.axis).join('/'));
            if (Array.isArray(a.condition) && a.condition.length) parts.push('新设 ' + a.condition.map((x) => x.axis).join('/'));
            return parts.join(' · ');
        } catch (_e) { return '—（追问面异常）'; }
    }
    const api = Object.freeze({
        QT_VERSION, QT_STATES, QT_MAX_SUBJECTS, QT_MAX_TRACE, QT_MAX_CANDIDATES,
        normalizeThread, marksOf, atFloorOf,
        openThread, advanceThread, resolveAmbiguity, threadSpec,
        describe, selfCheck, threadLine
    });
    root.LonShaQaThread = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);