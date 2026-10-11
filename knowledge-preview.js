/* ================================================================
 * knowledge-preview.js — [v3.315.0 · M-X5] 角色知识传播的可见范围预演
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一个账本」）】
 *   `knowledge-trace.js`（X5, v3.291.0）已经能答**过去**：「这条知识在第几楼、
 *   从谁、经哪条原始证据、以何种方式取得」—— 它是**事后轨迹**。
 *   它答不了 M-X5 点名的这一问：**在下笔之前**先看一眼「要是这么写，会影响到谁」。
 *   修前这件事在本仓没有落点，后果有三条（逐条可指认）：
 *     ① 「公开 / 转述 / 私聊 / 误信 / 纠正」五种传播方式**没有一处**说过各自会
 *        把谁推到哪一格 —— 作者只能凭记忆猜，猜错的那一格要等读者发现；
 *     ② 猜错的代价**不可回滚**：一旦写进正文，轨迹已经产生，「这个秘密本来不该
 *        让他知道」只能靠事后 reconcile 去猜同义措辞（X5 文件头实测过的那条路：
 *        3 条一条都清不掉）；
 *     ③ 预演这件事**天然会碰到受限正文**：一个「会影响谁」的读数如果顺手把秘密
 *        正文带出来，就等于用预演绕过了 M-O8 四刀刚收口的三条外供路径。
 *
 * 【与既有面的分工（互不重叠，逐条可指认）】
 *   knowledge-trace.js     事后轨迹：这条知识在第几楼、从谁、经哪条证据取得
 *   knowledge-network.js   同事实判定：两句话是不是同一件事
 *   secret-ledger.js       当下边界：谁还不知道（keeper）/ 谁已经知道（knowers）
 *   branch-semantics.js    跨支边界：这条内容属哪一支
 *   本模块                 事前预演：**若按这条路传播**，谁的认知会从哪一格变到哪一格
 *   于是「作者预览面与角色生成面严格分离」有了判据：本模块出**两张面** ——
 *   作者面带 reason / via / evidenceKey / advice（他需要据此改稿），
 *   角色面**只有 who / after 两个键**（生成面不该拿到轨迹 id、证据键、改稿建议，
 *   连 before / verdict 都不给）；两面**除 who / after 外零共享**，且这份禁止表
 *   是独立真源（不由作者面键集派生，否则判据会随作者面一起加宽而失效）。
 *
 * 【五条传播路径（**各自可达且方向不同形**）】
 *   public      公开   —— 在场者一起得知；面向「有人在场的场面」
 *   relay       转述   —— 经一人转达（via=told）；只到被转达者
 *   private     私聊   —— 一对一告知；**收窄**（不扩散），且不进入公开面
 *   misbelieve  误信   —— 角色**当真但未经核实** ⇒ 落 misled，**不是 knows**
 *   correct     纠正   —— 把此前的误信**改回**得知 ⇒ 只有这一条能升格
 *   ★ 方向表（DIRECTION）把 spread / narrow 与路径绑在一处：把「私聊」也当扩散
 *     会让「只告诉了他一个人」在读数上看起来像「全组都知道了」。
 *
 * 【preview 的五档（**不得压格**）】
 *   would-affect         会影响谁（有人的认知真的变了）
 *   no-change            改不动（都已经知道了 / 该路径对本角色无作用）
 *   would-reveal-secret  会泄露受限知识（该角色**不在**该秘密的知情名单上）
 *   would-break-boundary 会打穿边界（身份未验：同名异人未分格时预演不可信）
 *   indeterminate        **判不了**（轨迹模块缺席 / 输入畸形）—— 与上面四档不同形
 *   ★ 最后一档是本模块最容易被写错的一格：把「判不了」并进 no-change，
 *     会让「我们还没法判」被读成「改了也没事」—— 正是本仓最贵的那笔老账。
 *
 * 【三条纪律（与 knowledge-trace.js / memory-package.js 同规格）】
 *   ① **纯函数零写**：不写账、不改角色知识、不改传入的 fact / trace（对象一律 copy）；
 *   ② **不抛**：输入畸形一律降级为读数（degraded / malformed），绝不外抛；
 *   ③ **不猜**：判不开一律给 indeterminate（并带 decidable:false），不给冒充值。
 *
 * 【可移植性说明】
 *   机制动机来自「叙事里的知识传播必须在下笔前可预演」这一通用需求；
 *   实现按本仓规范重写（纯函数、零依赖、零写、零联网、读数齐备），未复制任何外部代码。
 * ================================================================ */
(function (root) {
    'use strict';
    const KP_VERSION = 1;
    const KP_PREVIEW_VERSION = 1;
    const KP_KIND = 'knowledge_preview';
    /** 五条传播路径（**顺序即判定序**；未知路径不得落默认档）。 */
    const PATHS = Object.freeze(['public', 'relay', 'private', 'misbelieve', 'correct']);
    /** 传播方向（与路径**绑在一处**）：把「收窄」当扩散会让私聊读数像全组皆知。 */
    const DIRECTION = Object.freeze({
        public: 'spread', relay: 'spread', private: 'narrow',
        misbelieve: 'spread', correct: 'narrow'
    });
    /** 每条路径对应到知识轨迹的动作（**单一真源**：本模块不另编一套动作词）。 */
    const PATH_ACTION = Object.freeze({
        public: 'acquire', relay: 'acquire', private: 'acquire',
        misbelieve: 'misbelieve', correct: 'correct'
    });
    /** 路径理由码（五条**逐条不同形**；压成一条会让作者不知道该怎么改稿）。 */
    const PATH_REASONS = Object.freeze({
        public: 'public-spread', relay: 'relay-forward', private: 'private-limited',
        misbelieve: 'misbelieve-unverified', correct: 'correction-restores'
    });
    /** 取证方式（与 knowledge-trace.js 的 VIA 同族：本模块只选，不新造）。 */
    const PATH_VIA = Object.freeze({
        public: 'witnessed', relay: 'told', private: 'told',
        misbelieve: 'rumor', correct: 'document'
    });
    /** 预演五档（**穷尽互斥**；indeterminate 是「判不了」，与其余四档不同形）。 */
    const PREVIEW_VERDICTS = Object.freeze([
        'would-affect', 'no-change', 'would-reveal-secret', 'would-break-boundary', 'indeterminate'
    ]);
    /** 计划面的处境（未知路径 / 无主体 / 无事实 / 判不了 / 可预演）。 */
    const PLAN_VERDICTS = Object.freeze(['ok', 'no-subject', 'no-fact', 'bad-path', 'degraded']);
    /** 身份口径（与 knowledge-trace.js 的 IDENTITY 同族）。 */
    const IDENTITY = Object.freeze(['surface', 'revealed', 'verified']);
    const MAX_ROWS = 60;
    const MAX_CHANGES = 240;
    /** 唯一必需依赖：轨迹状态判定由 knowledge-trace.js 给出 —— 本模块**不另解一遍**。 */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'KNOWLEDGE_TRACE', why: '轨迹状态判定（stateOf / normalize）由 knowledge-trace.js 给出；缺席 ⇒ 预演判不了（不假装改不动）' }
    ]);
    /** 可选依赖：知识边界（揭秘面）与同事实判定（疑似档）。缺席只影响那两档读数。 */
    /** 可选依赖：知识边界（秘密知情名单）。缺席只影响「会否泄露」这一档读数。 */
    const OPTIONAL_DEPS = Object.freeze(['SECRET_LEDGER']);

    function _t(value, max) {
        const s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }
    /** 取数：只认 number 与非空数字字符串；其余如实 null（**不编 0**）。 */
    function _floorOf(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
        if (typeof value === 'string' && value.trim() !== '' && /^-?\d+$/.test(value.trim())) return Math.trunc(Number(value.trim()));
        return null;
    }
    function _list(value, max) {
        const arr = Array.isArray(value) ? value : (value == null || value === '' ? [] : [value]);
        const out = [];
        const seen = new Set();
        let duplicates = 0;
        for (const raw of arr) {
            const s = _t(raw, 40);
            if (!s) { continue; }
            if (seen.has(s)) { duplicates++; continue; }
            seen.add(s);
            out.push(s);
            if (max && out.length >= max) break;
        }
        return { names: out, duplicates: duplicates };
    }
    /** 深拷贝（本面零写：任何进出对象都不许被就地改）。 */
    function _copy(value) {
        if (value == null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(_copy);
        const out = {};
        for (const k of Object.keys(value)) out[k] = _copy(value[k]);
        return out;
    }
    /** 剥正文键（作者面也不带秘密正文 —— 预演不是绕过外供路径的后门）。 */
    function _strip(value) {
        if (value == null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(_strip);
        const out = {};
        for (const k of Object.keys(value)) {
            if (['text', 'content', 'body', 'secret', 'raw', 'quote', 'evidenceText'].indexOf(k) >= 0) continue;
            out[k] = _strip(value[k]);
        }
        return out;
    }
    /** 轨迹模块是否可用（判「能判 / 判不了」的**唯一**依据，不看别的）。 */
    function _ktOf(deps) {
        const d = deps || {};
        const kt = d.KNOWLEDGE_TRACE;
        if (!kt || typeof kt !== 'object') return null;
        if (typeof kt.stateOf !== 'function' || typeof kt.normalize !== 'function') return null;
        return kt;
    }
    /** 轨迹入参归一：只认 {traces:[...]}（与 knowledge-trace.js 的 normalize 同口径）。 */
    function _traceOf(raw) {
        if (raw && typeof raw === 'object' && Array.isArray(raw.traces)) return { traces: raw.traces };
        return { traces: [] };
    }

    /* ══════════════════ ① 传播计划（谁被推到哪一格 —— 只算不写） ══════════════════ */

    /**
     * 由一次**假想的**传播得出计划（目标集 / 方向 / 动作 / 证据键 / 去重读数）。
     *
     * @param {object} payload { fact|content, path, participants, witnesses, listener,
     *                           affected, from, floor, identity, evidenceKey, secretId, known }
     * @param {object} opts    { path, floor, identity, known }
     * @returns {object} 计划（**no-subject / no-fact / bad-path** 三档各自点名，不落默认）
     *
     * ★ 未知路径**不得落默认档**：默认成 public 会把「路径名写错了」变成「全部公开」——
     *   一次静默的扩面，正是本仓最忌讳的静默降级。
     */
    function propagationPlan(payload, opts) {
        const p = (payload && typeof payload === 'object') ? payload : {};
        const o = (opts && typeof opts === 'object') ? opts : {};
        /* ★ 输入畸形**单独一档**（degraded）：把它读成「没有事实」（no-fact）会让
         *   「参数传错了」与「确实没内容」同形 —— 两者处置完全不同。 */
        const malformed = (payload != null && typeof payload !== 'object')
            || (opts != null && typeof opts !== 'object');
        const path = _t(o.path || p.path, 24).toLowerCase();
        const fact = _t(p.fact || p.content, 180);
        const floor = _floorOf(o.floor != null ? o.floor : p.floor);
        const idRaw = _t(o.identity || p.identity, 24).toLowerCase();
        const identity = IDENTITY.indexOf(idRaw) >= 0 ? idRaw : '';
        const out = {
            kind: KP_KIND, audience: 'author', version: KP_PREVIEW_VERSION,
            verdict: 'ok', path: path, knownPath: false, direction: '',
            action: '', via: '', reasonCode: '', fact: fact, floor: floor, identity: identity,
            evidenceKey: _t(p.evidenceKey, 120), secretId: _t(p.secretId, 60), from: _t(p.from, 40),
            targets: [], unchanged: [], duplicates: 0, newEvidence: 0, duplicateEvidence: 0,
            measurable: true, decidable: true, malformed: malformed ? 1 : 0,
            truncated: false, zeroWrite: true, note: ''
        };
        if (malformed) {
            return Object.assign(out, { verdict: 'degraded', measurable: false, decidable: false,
                note: '输入畸形（payload / opts 不是对象）⇒ 判不了（不假装无事实、不假装路径错）' });
        }
        if (!fact) {
            return Object.assign(out, { verdict: 'no-fact', measurable: false,
                note: '无事实内容 ⇒ 无法定位「谁的认知会变」（本函数不猜）' });
        }
        if (PATHS.indexOf(path) < 0) {
            return Object.assign(out, { verdict: 'bad-path', measurable: false,
                note: '路径「' + _t(p.path || o.path, 40) + '」不在五条传播路径内 ⇒ 拒（不落默认档：默认成 public 就是一次静默扩面）' });
        }
        out.knownPath = true;
        out.direction = DIRECTION[path];
        out.action = PATH_ACTION[path];
        out.via = PATH_VIA[path];
        out.reasonCode = PATH_REASONS[path];
        /* 目标集：按路径取「谁会被这条传播碰到」——**每种路径取法不同**（这是分级的实质）。 */
        const parts = _list(p.participants, MAX_ROWS);
        const wits = _list(p.witnesses, MAX_ROWS);
        const listener = _t(p.listener, 40);
        let picked = [];
        if (path === 'private' || path === 'relay') {
            picked = listener ? [listener] : [];
        } else if (path === 'correct') {
            /* 纠正只碰「此前当真过的人」——由调用方给出（本模块不替它猜谁的认知是错的）。 */
            picked = _list(p.affected, MAX_ROWS).names;
        } else {
            picked = parts.names.concat(wits.names);
        }
        /* 去重（同一个人既是在场者又是目击者，只算一条证据）+ 计数可见。 */
        const uniq = _list(picked, MAX_ROWS);
        out.duplicates = parts.duplicates + wits.duplicates + uniq.duplicates;
        out.targets = uniq.names;
        if (!out.targets.length) {
            return Object.assign(out, { verdict: 'no-subject', measurable: false,
                note: '该路径下没有受影响者（private / relay 须给 listener；correct 须给 affected）⇒ 不产空计划' });
        }
        out.unchanged = _list(o.known, MAX_ROWS).names.filter((n) => out.targets.indexOf(n) >= 0);
        out.newEvidence = out.targets.length - out.unchanged.length;
        out.duplicateEvidence = out.unchanged.length;
        out.note = '方向 ' + out.direction + ' · 动作 ' + out.action + ' · 目标 ' + out.targets.length
            + ' 人（同源已在册 ' + out.duplicateEvidence + '）';
        return out;
    }

    /* ══════════════════ ② 预演（谁的认知会从哪一格变到哪一格） ══════════════════ */

    /** 目标格：按路径算出「走完之后该角色**应当**处于哪一格」。 */
    function _targetStateOf(path) {
        if (path === 'misbelieve') return 'misled';
        if (path === 'correct') return 'knows';
        return 'knows';
    }
    /**
     * 认知预演 —— **纯读**：给「一次假想传播 + 现有轨迹」，返回逐人五档判定。
     *
     * ★ 五档互斥且**判不了单独一档**：
     *   · 轨迹模块缺席 ⇒ 所有人 indeterminate + decidable:false（**不假装改不动**）
     *   · 身份未验（identityVerified === false）⇒ 整面 would-break-boundary（fail-closed）
     *   · 碰秘密但边界无从判（给了 secretId 却没给 SECRET_LEDGER）⇒ indeterminate
     *     （**不假装没边界** —— 这正是 M-O8 四刀治过的那条路）
     *   · 该角色不在知情名单上 ⇒ would-reveal-secret
     *   · 认知格会变 ⇒ would-affect；已经在该格 ⇒ no-change
     */
    /** 本行的「写下去会不会只是一条重复证据」：与 knowledge-trace.js 的 evidenceKeyOf 同源。 */
    function _recordedEvidence(kt, t, who, fact, evidenceKey, action) {
        if (typeof kt.evidenceKeyOf !== 'function') return false;
        const want = _t(evidenceKey, 120) || _t(fact, 180);
        if (!want) return false;
        let key = '';
        try { key = _t(kt.evidenceKeyOf({ fact: fact, evidenceKey: evidenceKey }), 120); } catch (_e) { key = ''; }
        if (!key) return false;
        const list = (t && t.traces) || [];
        for (const tr of list) {
            if (!tr || typeof tr !== 'object') continue;
            if (tr.character !== who || tr.action !== action) continue;
            let k2 = '';
            try { k2 = _t(kt.evidenceKeyOf(tr), 120); } catch (_e) { k2 = ''; }
            if (k2 && k2 === key) return true;
        }
        return false;
    }
    function previewPropagation(payload, trace, deps, opts) {
        const d = deps || {};
        const o = (opts && typeof opts === 'object') ? opts : {};
        const plan = propagationPlan(payload, o);
        const out = {
            kind: KP_KIND, audience: 'author', version: KP_PREVIEW_VERSION,
            path: plan.path, direction: plan.direction, action: plan.action, via: plan.via,
            reasonCode: plan.reasonCode, verdict: 'indeterminate', reason: '', decidable: true,
            rows: [], byVerdict: {}, wouldAffect: 0, noChange: 0, revealSecret: 0,
            breakBoundary: 0, indeterminate: 0, total: 0,
            traceModulePresent: false, boundaryJudgeable: null, duplicateEvidence: 0,
            plan: plan, zeroWrite: true, note: ''
        };
        const count = (v) => { out.byVerdict[v] = (out.byVerdict[v] || 0) + 1; };
        /* 规划阶段就被拒：**没有可预演的对象**（不是「改了没事」）。 */
        if (plan.verdict !== 'ok') {
            /* decidable：bad-path / no-fact / no-subject 都是**判得出的结论**（路径错 / 没内容 / 没人）；
             *   只有 degraded（输入畸形）是真的判不了。 */
            return Object.assign(out, { verdict: 'indeterminate', reason: plan.verdict,
                decidable: plan.verdict !== 'degraded', note: plan.note });
        }
        out.total = plan.targets.length;
        /* 身份未验 ⇒ 整面 fail-closed（同名异人未分格时的预演不可信）。 */
        if (o.identityVerified === false || payload && payload.identityVerified === false) {
            out.rows = plan.targets.map((who) => ({ who: who, after: _targetStateOf(plan.path),
                before: '', verdict: 'would-break-boundary', reason: 'identity-unverified' }));
            for (const r of out.rows) count(r.verdict);
            out.breakBoundary = out.rows.length;
            return Object.assign(out, { verdict: 'would-break-boundary', reason: 'identity-unverified',
                note: '身份未验（同名异人未分格）⇒ 预演不可信，整面按打穿边界报（不逐人猜）' });
        }
        /* 轨迹模块缺席 ⇒ 判不了（**不假装改不动**）。 */
        const kt = _ktOf(d);
        out.traceModulePresent = !!kt;
        if (!kt) {
            out.rows = plan.targets.map((who) => ({ who: who, after: _targetStateOf(plan.path),
                before: '', verdict: 'indeterminate', reason: 'trace-module-absent' }));
            for (const r of out.rows) count(r.verdict);
            out.indeterminate = out.rows.length;
            return Object.assign(out, { verdict: 'indeterminate', reason: 'trace-module-absent',
                decidable: false, note: '轨迹模块缺席 ⇒ 判不了（不假装改不动、不假装已知道）' });
        }
        /* 秘密边界：给了 secretId 就必须能判；判不了 ⇒ 逐人 indeterminate（fail-closed）。 */
        const sl = d.SECRET_LEDGER;
        const secretItem = _strip(payload && payload.secretItem);
        const needBoundary = !!plan.secretId;
        let boundaryOk = true;
        if (needBoundary) {
            boundaryOk = !!(sl && typeof sl.knowledgeOf === 'function' && secretItem
                && typeof secretItem === 'object' && Object.keys(secretItem).length > 0);
        }
        out.boundaryJudgeable = needBoundary ? boundaryOk : null;
        const t = _traceOf(trace);
        for (const who of plan.targets) {
            const after = _targetStateOf(plan.path);
            let st = null;
            try {
                st = kt.stateOf(t, who, plan.fact, plan.identity ? { identity: plan.identity } : {});
            } catch (_e) { st = null; }
            if (!st || !st.state) {
                out.rows.push({ who: who, after: after, before: '', verdict: 'indeterminate', reason: 'state-thrown' });
                count('indeterminate');
                continue;
            }
            if (needBoundary && !boundaryOk) {
                out.rows.push({ who: who, after: after, before: st.state, verdict: 'indeterminate',
                    reason: 'boundary-unjudgeable' });
                count('indeterminate');
                continue;
            }
            if (needBoundary) {
                let scope = '';
                try { scope = sl.knowledgeOf(secretItem, who); } catch (_e) { scope = 'unlisted'; }
                if (scope !== 'knower') {
                    out.rows.push({ who: who, after: after, before: st.state,
                        verdict: 'would-reveal-secret', reason: scope === 'unlisted' ? 'no-knower-list' : 'not-a-knower' });
                    count('would-reveal-secret');
                    continue;
                }
            }
            /* ★ 同源重复：同一条证据 + 同角色 + 同动作已在册 ⇒ 写下去不会产生新证据（幂等读数，
             *   与「会变」不同 —— 它会白记一条）。这就是验收②「同一传播事件不生成多条重复证据」。 */
            if (out.duplicateEvidence === 0
                && _recordedEvidence(kt, t, who, plan.fact, plan.evidenceKey, plan.action)) {
                out.rows.push({ who: who, after: after, before: st.state, verdict: 'no-change',
                    reason: 'evidence-already-recorded' });
                count('no-change');
                out.duplicateEvidence++;
                continue;
            }
            if (st.state === after) {
                out.rows.push({ who: who, after: after, before: st.state, verdict: 'no-change', reason: 'already-in-state' });
                count('no-change');
                continue;
            }
            if (st.state === 'notRecorded' && plan.path === 'correct') {
                /* 「纠正」缺前提：此前没有一条 misbelieve ⇒ 纠正无处落，**不是** no-change。 */
                out.rows.push({ who: who, after: after, before: st.state, verdict: 'indeterminate',
                    reason: 'nothing-to-correct' });
                count('indeterminate');
                continue;
            }
            out.rows.push({ who: who, after: after, before: st.state, verdict: 'would-affect', reason: st.state + '→' + after });
            count('would-affect');
        }
        out.wouldAffect = out.byVerdict['would-affect'] || 0;
        out.noChange = out.byVerdict['no-change'] || 0;
        out.revealSecret = out.byVerdict['would-reveal-secret'] || 0;
        out.indeterminate = out.byVerdict['indeterminate'] || 0;
        out.truncated = out.rows.length > MAX_CHANGES;
        if (out.truncated) out.rows = out.rows.slice(0, MAX_CHANGES);
        /* 面级档：认最坏的那一条（判不了 > 泄露/边界 > 会变 > 改不动）。 */
        if (out.indeterminate > 0) {
            Object.assign(out, { verdict: 'indeterminate', reason: 'row-level-undecidable', decidable: false });
        } else if (out.revealSecret > 0) {
            Object.assign(out, { verdict: 'would-reveal-secret', reason: 'leaks-restricted' });
        } else if (out.wouldAffect > 0) {
            Object.assign(out, { verdict: 'would-affect', reason: 'cognition-changes' });
        } else {
            Object.assign(out, { verdict: 'no-change', reason: 'all-already-know' });
        }
        out.note = '路径 ' + plan.path + '（' + plan.direction + '）· 会变 ' + out.wouldAffect
            + ' · 改不动 ' + out.noChange + ' · 泄露 ' + out.revealSecret + ' · 判不了 ' + out.indeterminate;
        return out;
    }

    /* ══════════════════ ③ 两面分离（作者面 / 角色面） ══════════════════ */

    /** 作者面的键集（他与改稿有关：理由、途径、动作、证据键、楼层、改法建议）。 */
    const AUTHOR_KEYS = Object.freeze(['who', 'before', 'after', 'verdict', 'reason',
        'via', 'action', 'reasonCode', 'evidenceKey', 'floor', 'advice']);
    /** 角色面的键集（**只有名字与目标格** —— 生成面不该拿到轨迹 id / 证据键 / 改稿建议）。 */
    const CHARACTER_KEYS = Object.freeze(['who', 'after']);
    /** ★ 生成面**绝不允许**出现的键 —— 独立真源，**不由 AUTHOR_KEYS 派生**：
     *   从作者面派生出来的禁止表是「拿自己当对照」，某一日作者面被加宽，禁止表会跟着宽，
     *   判据就再也测不出「悄悄把 reason 带进生成面」这件事（本仓点名的假绿形态）。 */
    const FORBIDDEN_IN_CHARACTER_FACE = Object.freeze(['reason', 'advice', 'via', 'action',
        'reasonCode', 'evidenceKey', 'floor', 'before', 'verdict', 'plan', 'traceId', 'from',
        'secretItem', 'text', 'content', 'body', 'secret', 'quote', 'evidenceText', 'raw']);

    /**
     * 作者预演面（**不是**生成面）：逐人给出理由与改法建议，且**剥掉一切正文键**。
     * ★ 剥正文理由：预演若顺手把秘密正文带出来，就成了绕过 M-O8 外供路径的后门。
     */
    function authorFace(preview) {
        const p = (preview && typeof preview === 'object') ? preview : {};
        const rows = (Array.isArray(p.rows) ? p.rows : []).map((r) => {
            const advice = r.verdict === 'would-affect' ? '若不想让他知道，改走 private 或删去在场者'
                : r.verdict === 'would-reveal-secret' ? '该角色不在该秘密的知情名单上 ⇒ 不得让他经此路径得知'
                    : r.verdict === 'would-break-boundary' ? '先分格同名异人（身份未验时预演不可信）'
                        : r.verdict === 'no-change' ? '无需处理（已在该格）'
                            : '判不了 ⇒ 先补齐轨迹模块 / 知情名单再预演';
            const row = { who: r.who, before: r.before, after: r.after, verdict: r.verdict, reason: r.reason,
                via: p.via || '', action: p.action || '', reasonCode: p.reasonCode || '',
                evidenceKey: p.plan ? p.plan.evidenceKey : '', floor: p.plan ? p.plan.floor : null, advice: advice };
            return _strip(row);
        });
        return Object.freeze({ audience: 'author', version: KP_PREVIEW_VERSION, kind: KP_KIND,
            verdict: p.verdict || 'indeterminate', reason: p.reason || '', rows: rows,
            keys: AUTHOR_KEYS.slice(), carriesBody: false, zeroWrite: true });
    }
    /**
     * 角色生成面 —— **严格收窄**：只带「会变且最终为已知」的那些人的名字与目标格；
     * 其余（改不动 / 泄露 / 边界 / 判不了）一律不进生成面，收敛为计数。
     * ★ 与作者面**键集不相交**（除 who）：判据会逐键核对，防某一日悄悄把 reason 带进生成面。
     */
    function characterFace(preview) {
        const p = (preview && typeof preview === 'object') ? preview : {};
        const list = Array.isArray(p.rows) ? p.rows : [];
        const rows = list.filter((r) => r.verdict === 'would-affect' && r.after === 'knows')
            .map((r) => ({ who: r.who, after: r.after }));
        return Object.freeze({ audience: 'character', version: KP_PREVIEW_VERSION, kind: KP_KIND,
            rows: rows, keys: CHARACTER_KEYS.slice(), withheld: list.length - rows.length,
            zeroWrite: true });
    }

    /* ══════════════════ ④ 批量（单一真源：与单条同函） ══════════════════ */

    /**
     * 多路径批量预演 —— 与单条**同函**（不另写一份），并给出「哪条路最危险」的排序读数。
     * ★ 空批与「有但全被判不了」**不同形**：前者 total=0 且 measurable:true（真跑过、确实没有），
     *   后者 measurable:true 但 indeterminate>0（判不了）—— 压成一格就是本仓那笔老账。
     */
    function previewBatch(plans, trace, deps, opts) {
        const list = Array.isArray(plans) ? plans : [];
        const o = (opts && typeof opts === 'object') ? opts : {};
        const rows = [];
        const byVerdict = {};
        let wouldAffect = 0, revealSecret = 0, breakBoundary = 0, indeterminate = 0, noChange = 0, duplicateEvidence = 0;
        for (const p of list) {
            const r = previewPropagation(p, trace, deps, Object.assign({}, o, {
                path: (p && (p.path || o.path)) || o.path }));
            rows.push(r);
            byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;
            wouldAffect += r.wouldAffect;
            revealSecret += r.revealSecret;
            breakBoundary += r.breakBoundary;
            indeterminate += r.indeterminate;
            noChange += r.noChange;
            duplicateEvidence += r.duplicateEvidence || 0;
        }
        /* 最危险的路：先按面级档位序，再按会变/泄露人数（**排序是读数，不改判定**）。 */
        const rank = { 'would-break-boundary': 0, 'would-reveal-secret': 1, 'would-affect': 2,
            'no-change': 3, 'indeterminate': 4 };
        const sorted = rows.slice().sort((a, b) => (rank[a.verdict] - rank[b.verdict])
            || ((b.wouldAffect + b.revealSecret) - (a.wouldAffect + a.revealSecret)));
        return {
            kind: KP_KIND, audience: 'author', version: KP_PREVIEW_VERSION,
            rows: rows, total: rows.length, measurable: Array.isArray(plans),
            byVerdict: byVerdict, wouldAffect: wouldAffect, noChange: noChange,
            revealSecret: revealSecret, breakBoundary: breakBoundary, indeterminate: indeterminate,
            duplicateEvidence: duplicateEvidence,
            riskiest: sorted.length ? (sorted[0].path || '') : '', order: sorted.map((r) => r.path || ''),
            zeroWrite: true
        };
    }

    /* ══════════════════ ⑤ 自述 / 自检 / 诊断行 / 导出 ══════════════════ */

    /** 自述：面提供什么 / 依赖什么 / 缺席会怎样（**依赖缺格 ≠ 判不了**，两件事分开写）。 */
    function describe(deps) {
        const d = deps || {};
        const missing = REQUIRED_DEPS.filter((r) => d[r.key] == null).map((r) => r.key);
        const optionalMissing = OPTIONAL_DEPS.filter((k) => d[k] == null);
        return Object.freeze({
            name: 'knowledge-preview', version: KP_VERSION, previewVersion: KP_PREVIEW_VERSION,
            paths: PATHS.slice(), directions: PATHS.map((p) => DIRECTION[p]),
            pathActions: PATHS.map((p) => PATH_ACTION[p]),
            pathReasons: PATHS.map((p) => PATH_REASONS[p]), pathVias: PATHS.map((p) => PATH_VIA[p]),
            previewVerdicts: PREVIEW_VERDICTS.slice(), planVerdicts: PLAN_VERDICTS.slice(),
            identities: IDENTITY.slice(), authorKeys: AUTHOR_KEYS.slice(),
            characterKeys: CHARACTER_KEYS.slice(),
            /* 面级自述：五路径**各自可达且方向不重**（不是对常量自己断言 —— 那是对词表自己断言）。 */
            pathsDistinctDirections: new Set(PATHS.map((p) => DIRECTION[p])).size === 2,
            pathsExhaustive: PATHS.length === 5 && PATHS.every((p) => !!PATH_REASONS[p] && !!PATH_VIA[p]),
            /* ★ 判不了单独一档（本仓最贵的老账）。 */
            indeterminateDistinctFromNoChange: PREVIEW_VERDICTS.indexOf('indeterminate') !== -1
                && PREVIEW_VERDICTS.indexOf('no-change') !== -1,
            /* ★ 两面键集不相交（除 who）：作者面有 reason / evidenceKey，角色面没有。 */
            characterFaceForbidden: FORBIDDEN_IN_CHARACTER_FACE.slice(),
            facesDisjoint: CHARACTER_KEYS.every((k) => FORBIDDEN_IN_CHARACTER_FACE.indexOf(k) < 0)
                && AUTHOR_KEYS.some((k) => CHARACTER_KEYS.indexOf(k) < 0),
            requiredDeps: REQUIRED_DEPS.map((r) => ({ key: r.key, why: r.why })),
            optionalDeps: OPTIONAL_DEPS.slice(), missingDeps: missing, optionalMissing: optionalMissing,
            offline: true, zeroWrite: true, maxChanges: MAX_CHANGES,
            malformedBehavior: '输入畸形 ⇒ plan 报 degraded（判不了），不压成「没有事实」',
            depsAbsentBehavior: '轨迹模块缺席 ⇒ 逐人 indeterminate + decidable:false（不假装改不动、不假装已知道）'
        });
    }

    /**
     * 自检：用**真调用**把五条路径各自跑出来（不只对常量自己断言）。
     * 依赖：一个最小轨迹同形桩（可注入），使「路径 → 目标格」的映射真的被执行。
     */
    function selfCheck(deps) {
        const d = deps || {};
        const out = { ok: true, problems: [], probes: {}, version: KP_VERSION };
        const probe = (name, fn) => {
            try { out.probes[name] = fn(); } catch (e) { out.ok = false; out.problems.push(name + ': ' + e.message); }
        };
        /* ★ 明确的桩，不用真模块 —— 自检只证明本面映射自洽，不替 knowledge-trace 背书。 */
        const stub = {
            normalize: (raw) => ({ traces: (raw && raw.traces) || [] }),
            stateOf: (raw, who, fact) => {
                const t = (raw && raw.traces) || [];
                const hit = t.filter((x) => x.character === who).slice(-1)[0];
                return { state: hit ? (hit.action === 'acquire' ? 'knows' : hit.action === 'misbelieve' ? 'misled' : 'notRecorded') : 'notRecorded' };
            }
        };
        const sdeps = Object.assign({}, d, { KNOWLEDGE_TRACE: stub });
        const F = '她欠了高利贷';
        probe('public', () => previewPropagation({ fact: F, path: 'public', participants: ['张三', '李四'] }, { traces: [] }, sdeps).wouldAffect);
        probe('relay', () => previewPropagation({ fact: F, path: 'relay', listener: '王五' }, { traces: [] }, sdeps).wouldAffect);
        probe('private', () => previewPropagation({ fact: F, path: 'private', listener: '赵六' }, { traces: [] }, sdeps).wouldAffect);
        probe('misbelieve', () => previewPropagation({ fact: F, path: 'misbelieve', participants: ['钱七'] }, { traces: [] }, sdeps).rows[0].after);
        probe('correct', () => previewPropagation({ fact: F, path: 'correct', affected: ['孙八'] },
            { traces: [{ character: '孙八', fact: F, action: 'misbelieve', floor: 3 }] }, sdeps).rows[0].after);
        probe('noChange', () => previewPropagation({ fact: F, path: 'public', participants: ['张三'] },
            { traces: [{ character: '张三', fact: F, action: 'acquire', floor: 3 }] }, sdeps).noChange);
        probe('indeterminate', () => previewPropagation({ fact: F, path: 'public', participants: ['张三'] }, { traces: [] }, {}).decidable);
        /* 输入畸形 ⇒ degraded（不假装无事实）；同源重复 ⇒ 不再造第二条证据。 */
        probe('degraded', () => propagationPlan('not-an-object').verdict);
        probe('duplicateEvidence', () => previewPropagation(
            { fact: F, path: 'public', participants: ['张三'], evidenceKey: 'EV-1' },
            { traces: [{ character: '张三', fact: F, action: 'acquire', floor: 3, evidenceKey: 'EV-1' }] },
            sdeps).duplicateEvidence);
        /* ★ 路径表与方向表**逐条对齐**（少一条即有路径无处安放）。 */
        for (const p of PATHS) {
            if (!DIRECTION[p] || !PATH_ACTION[p] || !PATH_REASONS[p] || !PATH_VIA[p]) {
                out.ok = false;
                out.problems.push('路径表不齐：' + p);
            }
        }
        return out;
    }

    /** 诊断一行 —— **四种坏法分开写**：模块没挂 / 依赖缺格 / 口径不自洽 / 面在位。 */
    function line(read, deps) {
        const r = (read && typeof read === 'object') ? read : {};
        if (r.moduleMissing) return '模块未加载（knowledge-preview.js）';
        if (r.degraded) return '预演读取异常（已降级，不外抛）';
        const d = describe(deps || r.deps);
        if (d.missingDeps.length) return '⚠️ 依赖缺格：' + d.missingDeps.join('、') + '（轨迹判定缺席 ⇒ 预演判不了，不假装改不动）';
        if (d.pathsExhaustive === false) return '⚠️ 传播路径表不齐（有路径无处安放）';
        if (d.indeterminateDistinctFromNoChange === false) return '⚠️「判不了」与「改不动」同形（本仓最贵的老账）';
        if (d.facesDisjoint === false) return '⚠️ 作者面与角色面键集相交（生成面不该拿到改稿建议）';
        const last = r.last || null;
        if (!last) {
            return '待用（面在位 · ' + PATHS.length + ' 路径 · ' + PREVIEW_VERDICTS.length + ' 档 · 零写离线）';
        }
        const parts = ['上次 ' + (last.path || '—')];
        if (last.verdict) parts.push('档 ' + last.verdict);
        if (last.wouldAffect) parts.push('会变 ' + last.wouldAffect);
        if (last.revealSecret) parts.push('**泄露 ' + last.revealSecret + '**');
        if (last.indeterminate) parts.push('**判不了 ' + last.indeterminate + '**');
        if (last.order && last.order.length > 1) parts.push('最危险 ' + last.riskiest);
        return parts.join(' · ');
    }

    /* ══════════════════ ⑥ 导出自洽（本档自检读数的指纹） ══════════════════ */

    /**
     * 导出面指纹 —— 用来钉住「导出面某一日被悄悄加宽/减项」这件事。
     * ★ 只用**导出名 + 值级形态**算指纹；不含任何正文 / 角色数据。
     */
    function surfaceDigest(api) {
        const a = api || {};
        const names = Object.keys(a).sort();
        let h = 2166136261;
        const feed = (s) => {
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
        };
        for (const n of names) {
            const v = a[n];
            const kind = Array.isArray(v) ? 'array:' + v.length
                : (v === null ? 'null' : typeof v);
            feed(n + '=' + kind + ';');
        }
        return { names: names, count: names.length, digest: ('0000000' + (h >>> 0).toString(16)).slice(-8) };
    }

    const api = Object.freeze({
        KP_VERSION, KP_PREVIEW_VERSION, KP_KIND,
        PATHS, DIRECTION, PATH_ACTION, PATH_REASONS, PATH_VIA,
        PREVIEW_VERDICTS, PLAN_VERDICTS, IDENTITY,
        MAX_ROWS, MAX_CHANGES, AUTHOR_KEYS, CHARACTER_KEYS,
        REQUIRED_DEPS, OPTIONAL_DEPS,
        propagationPlan, previewPropagation, previewBatch,
        authorFace, characterFace,
        FORBIDDEN_IN_CHARACTER_FACE,
        describe, selfCheck, line, surfaceDigest
    });
    /* ★ 显式挂浏览器全局（**不要**写成 `? window : this` —— 在 Node 下模块顶层
     *   `this === module.exports`，全局会挂到 exports 上而不是 globalThis，
     *   宿主 `_moduleLib` 与无头套件两条取件路都读不到。这是 v3.314.0 实测到的自伤。 */
    if (root) {
        try { root.LonShaKnowledgePreview = api; } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
