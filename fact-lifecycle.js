/* ============================================================
 * fact-lifecycle.js — [v3.312.0 · M-X4] 事实生命周期与「遗忘 / 撤回 / 保留」控制
 * ------------------------------------------------------------
 * 【它补的是哪一格（第二期拓展计划 M-X4 验收原文逐条）】
 *   系统擅长保存与召回，但用户还需要明确控制**哪些内容继续存在、哪些应被撤回或降级**。
 *   修前实测：这条控制面上**一格都没有** ——
 *     · `fact-version.js` 有 `revokeFact`（撤回一条）与 `setOrigin`（改来源），但它们
 *       是**逐条、按 id、无批处理、无审计、无回滚**的写面；「把某个角色在某段时间里
 *       记错的事实一起处理掉」这件事只能靠调用方自己循环。
 *     · `fact-state.js` 能**读**出五态（active / superseded / revoked / disputed / unknown），
 *       但读出来的东西没人用：没有任何一处回答「这条事实以后怎么算」。
 *     · 「仅作者可见」「禁止角色使用」两种定位**根本没有对应词** ——
 *       它们既不等于撤回（原文还要留），也不等于删除（证据还要留）。
 *   本模块把上面三件事收成一处：**处置（这条以后怎么算）→ 动作（这次动手做什么）→
 *   计划（批量命中了哪些、会变成什么）→ 审计（留下什么）→ 回滚（能不能退）→ 回读
 *   （目标态到了没有）**。
 *
 * 【五条不可让步口径（每条都对应一条验收原文）】
 *   ① **处置与动作不是一件事**（验收①：选择「禁止生成」不得误删原始证据）。
 *      处置是**定位**（这条事实以后怎么算），动作是**手段**（这次动手做什么）。
 *      把两者合成一个词表，'no-generate' 就必然与 'delete-source' 同格 —— 而「不许进
 *      生成」这件事**一个字都没说可以删原文**。故 `checkCombo()` 是独立一格，
 *      且 `no-generate` / `author-only` 下出现 `delete-source` **一律拒**，
 *      点名理由 `evidence-preserved`（不是笼统的「不合法」）。
 *   ② **状态口径只读 `fact-state`，不另立持久字段**（验收②：撤回后不进入召回与模型载荷）。
 *      本模块**不写任何字段、不改入参**；它就是「读五态 → 出计划」。
 *      ★ 为什么不在这里加个 `disposition` 字段落到条目上：`fact-version.js#copyFact` 是
 *      白名单逐字段重建（`state` 都活不过一次 normalize，`disposition` 同理），写进去
 *      等于给读者一个**假的持久面**；更要紧的是会造出「推导说 revoked、持久说 keep」的
 *      双真源 —— 与 M-O6 否决写回式迁移是同一条教训。
 *      故：账本态永远由 `fact-state.stateOf()` 推导，本模块只把**目标态**写在计划里。
 *   ③ **生成面与账本面分别报**（验收②后半 / 验收③）。
 *      `author-only` / `no-generate` 只作用在**生成面**（不进角色上下文），账本态仍是 active
 *      —— 回读时若拿账本读数回答生成面问题，就是把「没写进账本」读成「没生效」。
 *      故 `readbackOf()` 对这两态**返回 `face:'generation'` + `checked:false`
 *      + 具名 reason**，而不是编一个 applied/pending 出来。
 *   ④ **审计只带归属与站位串**（验收③：保留审计时不得泄露受限正文）。
 *      `auditEntries()` 的每条只出 `subject` / `predicate`（归属，用于定位）+ `body`
 *      （非受限事实取值，截断 60 字；受限事实一律 `SECRET_MASK` 站位串）。判据可查
 *      「审计里不存在受限正文」。
 *   ⑤ **可回滚必须分档，不可逆的要点名**（验收④：操作可回读、可撤销、可审计）。
 *      `rollbackOf()` 三态 `reversible / partial / irreversible`：
 *      `delete-source` 默认**不可逆**（`no-inverse`：删了就查不出曾经记错过），
 *      只有当调用方提供了**快照**才变成 `restore-from-snapshot`；
 *      `revoke-derived` 的逆操作是**重放重建**（派生件由同代源重建，不是逐条反写）。
 *      把三态压成一格布尔，就会把「删了原文、退不回来」说成「可以撤销」。
 *
 * 【本模块不做什么（边界）】
 *   · 不写任何账：纯函数面。写口仍归各 owner —— 撤回走 `fact-version.revokeFact`、
 *     审计走审计账，本模块只产出**计划 / 审计条目 / 逆操作步骤 / 回读读数**。
 *   · 不重做五态判定：`derive` / `stateOf` / `admitForLoad` 全从 deps 注入（单一真源）。
 *   · 不重做来源词表：`ORIGINS` 从 deps 注入（不在本模块再抄一份）。
 *   · 不抛：畸形入参一律退化为可读的降级读数。
 * 挂 window.LonShaFactLifecycle，供 index.js 事实面 / 诊断面使用。
 * ============================================================ */
(function (root) {
    'use strict';
    const FL_VERSION = 1;

    /** 处置五态（**穷尽互斥**：任何一条事实在任何时刻恰有一种定位）。改此处即口径变化，须同步 CHANGELOG。 */
    const DISPOSITIONS = Object.freeze(['keep', 'expire', 'revoke', 'author-only', 'no-generate']);

    /**
     * 动作四态（计划原文点名的那四件事）。
     * ★ 与 `DISPOSITIONS` **不是一一对应**，也不得合并成一张表 —— 见文件头口径①。
     */
    const ACTIONS = Object.freeze(['delete-source', 'revoke-derived', 'hide-from-generation', 'keep-audit']);

    /**
     * 动作声明面（**只声明不执行**，与 `memory-center.js` 的 ACTIONS 同纪律）。
     *   `face`      —— 这个动作作用在哪一面（账本 / 生成 / 审计）
     *   `owner`     —— 真落笔归属（写口永远在 owner 手里）
     *   `writes`    —— 它声明要改的字段 / 容器（**声明面，不是执行面**）
     *   `reversible`—— 是否可逆；不可逆的必须让调用方看得见
     *   `undo`      —— 逆操作名（`none` = 没有逆操作，须另行提供快照）
     */
    const ACTION_SPEC = Object.freeze({
        'delete-source': Object.freeze({
            label: '删除原文', face: 'ledger', owner: 'owner-ledger',
            writes: ['sourceText', 'evidence'], reversible: false, undo: 'none',
            why: '删了就查不出「曾经记错过」—— 故必须与保留审计同批，且只有拿到快照才可回滚'
        }),
        'revoke-derived': Object.freeze({
            label: '撤回派生', face: 'ledger', owner: 'fact-version',
            writes: ['revoked', 'revokeReason'], reversible: true, undo: 'replay-rebuild',
            why: '派生件可由同代源重放重建 ⇒ 逆操作是重放，不是逐条反写'
        }),
        'hide-from-generation': Object.freeze({
            label: '隐藏于生成', face: 'generation', owner: 'fact-version',
            writes: ['suppressList'], reversible: true, undo: 'unhide',
            why: '只改生成面名单，原文与账本态**一字不动**'
        }),
        'keep-audit': Object.freeze({
            label: '保留审计记录', face: 'audit', owner: 'audit-ledger',
            writes: ['auditLog'], reversible: true, undo: 'drop-audit-entry',
            why: '审计条目可整条撤除；它只带归属与站位串，不副本正文本体'
        })
    });

    /** 面三态：账本 / 生成 / 审计（三处的读数**不得互相冒充**）。 */
    const FACES = Object.freeze(['ledger', 'generation', 'audit']);

    /**
     * 处置规则表（**唯一真源**：允许哪些动作、作用哪些面、期待的账本态）。
     *   `ledgerState: null` 明说「这一态**没有**账本态」—— 回读时据此分派到生成面，
     *   而不是编一个 applied/pending 出来（见文件头口径③）。
     */
    const RULES = Object.freeze({
        'keep': Object.freeze({
            label: '保留', faces: Object.freeze(['ledger', 'audit']),
            allowed: Object.freeze(['keep-audit']), ledgerState: 'active',
            note: '默认定位：不进任何抑制面，每轮照常注入'
        }),
        'expire': Object.freeze({
            label: '过期', faces: Object.freeze(['ledger', 'generation', 'audit']),
            allowed: Object.freeze(['hide-from-generation', 'keep-audit', 'delete-source']),
            ledgerState: 'superseded',
            note: '区间闭合 ⇒ 账本态 superseded；原文按动作决定留不留'
        }),
        'revoke': Object.freeze({
            label: '撤回', faces: Object.freeze(['ledger', 'generation', 'audit']),
            allowed: Object.freeze(['revoke-derived', 'hide-from-generation', 'keep-audit', 'delete-source']),
            ledgerState: 'revoked',
            note: '撤回是绝对的：`admitForLoad` 不受任何 opts 影响'
        }),
        'author-only': Object.freeze({
            label: '仅作者可见', faces: Object.freeze(['generation', 'audit']),
            allowed: Object.freeze(['hide-from-generation', 'keep-audit']), ledgerState: null,
            note: '账本态**不动**（仍是 active）：本态只作用在生成面，作者面照常可读'
        }),
        'no-generate': Object.freeze({
            label: '禁止角色使用', faces: Object.freeze(['generation', 'audit']),
            allowed: Object.freeze(['hide-from-generation', 'keep-audit']), ledgerState: null,
            note: '原文与账本态**都要留**：禁入生成 ≠ 可以删证据'
        })
    });

    /** 受限正文字段键（与 X6/X7 的 `SECRET_BODY_KEYS` **同形同口径**）。 */
    const SECRET_BODY_KEYS = Object.freeze(['secret', 'secretText', 'secretBody']);
    /** 审计里受限正文的**站位串**（不透露长度、不透露首尾，只说明「这里有一格不给」）。 */
    const SECRET_MASK = '（正文不对外提供：审计记录只报存在性与归属）';
    /** 审计里非受限取值的截断上限（审计要能定位，不是副本）。 */
    const AUDIT_BODY_MAX = 60;
    /** 依赖面（缺哪一格、缺了会怎样，由 `describe()` 逐条回答）。 */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'FACT_STATE', why: '事实五态单一真源（本模块**只读**它推导状态，绝不另立状态口径）' },
        { key: 'ORIGINS', why: '来源词表（「按来源批量处理」的唯一真源，取自 fact-version）' },
        { key: 'SECRET_BODY_KEYS', why: '受限正文字段键（审计掩码口径的唯一真源，与 X6/X7 同形）' },
        { key: 'now', why: '时钟（可注入，判据才能对「过期」取证）' }
    ]);

    const _str = (v) => String(v == null ? '' : v);
    function text(v, max) {
        const s = _str(v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) + '\u2026' : s) : s;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    /** 条件/实参归一：单值收成单元素数组，空/缺省收成空数组（**空条件 = 不限**）。 */
    function arr(v) {
        if (v === null || v === undefined || v === '') return [];
        const list = Array.isArray(v) ? v : [v];
        return list.map((x) => text(x, 48)).filter(Boolean);
    }
    function factsOf(state) {
        return (state && typeof state === 'object' && Array.isArray(state.facts)) ? state.facts : [];
    }
    function depsOf(deps) {
        return (deps && typeof deps === 'object') ? deps : {};
    }
    /** 稳定 id（FNV-1a）：同输入恒同输出 ⇒ 重试不重复、计划可复算。 */
    function stableId(s) {
        const str = _str(s);
        let h = 2166136261 >>> 0;
        for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h.toString(36);
    }
    function idSetOf(state) {
        const s = new Set();
        for (const f of factsOf(state)) { const id = text(f && f.id, 48); if (id) s.add(id); }
        return s;
    }
    /** 该条事实是否**受限**（带任一受限正文字段键且非空）。 */
    function isSecret(f, deps) {
        const keys = (deps && Array.isArray(deps.SECRET_BODY_KEYS) && deps.SECRET_BODY_KEYS.length)
            ? deps.SECRET_BODY_KEYS : SECRET_BODY_KEYS;
        for (const k of keys) {
            if (f && f[k] != null && _str(f[k]).trim()) return true;
        }
        return false;
    }
    /**
     * 审计用正文（验收③：**保留审计时不得泄露受限正文**）。
     *   受限 ⇒ 站位串（连长度都不给）；非受限 ⇒ 截断取值（审计要能定位，不是副本）。
     */
    function maskBody(f, deps) {
        if (isSecret(f, deps)) return SECRET_MASK;
        return text(f && f.value, AUDIT_BODY_MAX);
    }

    /** 某处置的规则（取不到给 null —— 调用方按「不认识」处置，不静默当 keep）。 */
    function rulesOf(disposition) {
        const d = text(disposition, 24);
        return RULES[d] ? RULES[d] : null;
    }
    /** 某处置允许的动作（**取不到给空数组**：不认识的处置不得回落成「什么都能做」）。 */
    function actionsFor(disposition) {
        const r = rulesOf(disposition);
        return r ? Array.prototype.slice.call(r.allowed) : [];
    }

    /**
     * 【验收①】处置 × 动作的**组合检查**（独立一格，不合并进任何一张表）。
     *
     *   为什么必须单独一格：处置回答「这条事实以后怎么算」，动作回答「这次动手做什么」。
     *   合成一格之后，'no-generate'（不许进生成）就必然与 'delete-source'（删原文）同格 ——
     *   而「不许进生成」**一个字都没说可以删原文**。这正是验收第一条要挡的误删。
     *
     * @returns {{ok:boolean, disposition:string, actions:string[], blocked:object[],
     *            missing:string[], reason:string}}
     *   `blocked[].why` 四档具名：
     *     · `not-allowed-by-disposition` —— 该处置的允许集里没有它（普通越界）
     *     · `evidence-preserved`        —— ★ 仅作者可见 / 禁止生成下出现删原文（**误删证据**）
     *     · `audit-required`            —— 删原文却没配保留审计（删了就查不出曾经记错过）
     *     · `unknown-action` / `unknown-disposition` —— 词表外的字
     */
    function checkCombo(disposition, actions, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const d = text(disposition, 24);
        const list = arr(actions);
        const rule = rulesOf(d);
        const blocked = [];
        if (!rule) {
            return {
                ok: false, disposition: d, actions: list,
                blocked: list.map((a) => ({ action: a, why: 'unknown-disposition' })),
                missing: [], reason: 'unknown-disposition'
            };
        }
        const allowed = rule.allowed;
        for (const a of list) {
            if (!ACTION_SPEC[a]) { blocked.push({ action: a, why: 'unknown-action' }); continue; }
            /* ★ 误删证据**先判**（比普通越界更具体）：这两态下出现在原文上的删除动作，
             *   动机上就是「不想让它进生成」——而原文与生成面是两件事。 */
            const preservesEvidence = (d === 'no-generate' || d === 'author-only');
            if (a === 'delete-source' && preservesEvidence) {
                blocked.push({ action: a, why: 'evidence-preserved' });
                continue;
            }
            if (allowed.indexOf(a) < 0) { blocked.push({ action: a, why: 'not-allowed-by-disposition' }); continue; }
            if (a === 'delete-source' && list.indexOf('keep-audit') < 0 && o.allowUnsavedDeletion !== true) {
                blocked.push({ action: a, why: 'audit-required' });
            }
        }
        const ok = blocked.length === 0;
        return {
            ok: ok, disposition: d, actions: list, blocked: blocked, missing: [],
            /* 允许集与生效集分开：`allowed` 是「这一态允许什么」，`actions` 是「这次要做什么」。 */
            allowed: allowed.slice(),
            reason: ok ? '' : blocked[0].why
        };
    }

    /* ================= 事实选择面（按来源 / 角色 / 项目 / 时间范围批量圈定） ================= */

    /**
     * 条件是归一形（**空数组 = 不限**，不是「一条都不匹配」）。
     *   · `ids`      显式点名（按 id 处理某几条）
     *   · `origins`  按来源（词表取自 `fact-version.ORIGINS`，本模块不再抄一份）
     *   · `subjects` 按角色（**包含即算命中**：「这个角色的全部事实」不必写全名）
     *   · `from` / `to`  按时间范围（**楼层语义**，缺省端 = 不限）
     */
    function criteriaOf(raw) {
        const c = (raw && typeof raw === 'object') ? raw : {};
        return {
            ids: arr(c.ids), origins: arr(c.origins), subjects: arr(c.subjects),
            from: numOrNull(c.from), to: numOrNull(c.to)
        };
    }

    /**
     * 区间交叠判定（`f.from` / `f.to` 是账本里的楼层语义）。
     *   ★ `f.to == null` 是**尚未闭合**（上不封顶），不是 0 —— 写成 0 会让所有活条
     *     都落在「很早以前」的区间外。判不了的那一端按**最宽**处理。
     */
    function overlaps(f, qFrom, qTo) {
        if (qFrom == null && qTo == null) return true;
        const lo = numOrNull(f && f.from);
        const hi = numOrNull(f && f.to);
        if (qTo != null && lo != null && lo > qTo) return false;
        if (qFrom != null && hi != null && hi < qFrom) return false;
        return true;
    }

    /** 单条是否命中条件；不命中时**具名 why**（否则说不出「为什么这几条没进来」）。 */
    function matchesCriteria(f, c) {
        const cc = c || criteriaOf(null);
        if (cc.ids.length && cc.ids.indexOf(text(f && f.id, 48)) < 0) return 'id-not-listed';
        if (cc.origins.length && cc.origins.indexOf(text(f && f.origin, 24)) < 0) return 'origin-mismatch';
        if (cc.subjects.length) {
            const sub = text(f && f.subject, 48);
            let hit = false;
            for (const want of cc.subjects) { if (sub === want || sub.indexOf(want) >= 0) { hit = true; break; } }
            if (!hit) return 'subject-mismatch';
        }
        if (!overlaps(f, cc.from, cc.to)) return 'range-outside';
        return '';
    }

    /**
     * 批量圈定（验收③「按来源、角色、项目、时间范围批量处理」的第一步）。
     *   返回**双向**读数：`matched`（命中）与 `skipped`（未命中 + 具名 why）。
     *   只报命中数，就说不出「为什么这几条没进来」—— 那正是批量处理最容易出事的格子。
     * @returns {{ok:boolean, matched:object[], skipped:object[], count:number,
     *            total:number, criteria:object, byState:object}}
     */
    function selectFacts(state, criteria, deps) {
        const d = depsOf(deps);
        const c = criteriaOf(criteria);
        const FS = d.FACT_STATE;
        const facts = factsOf(state);
        const rs = (FS && typeof FS.readState === 'function') ? FS.readState(state) : null;
        const stateById = {};
        if (rs && Array.isArray(rs.entries)) for (const e of rs.entries) stateById[e.id] = e.state;
        const matched = [], skipped = [];
        for (const f of facts) {
            const id = text(f && f.id, 48);
            const why = matchesCriteria(f, c);
            if (why) { skipped.push({ id: id, why: why }); continue; }
            matched.push({
                id: id,
                state: stateById[id] || 'unknown',
                origin: text(f && f.origin, 24),
                subject: text(f && f.subject, 48),
                secret: isSecret(f, d)
            });
        }
        const byState = {};
        for (const m of matched) byState[m.state] = (byState[m.state] || 0) + 1;
        return {
            ok: true, matched: matched, skipped: skipped, count: matched.length,
            total: facts.length, criteria: c, byState: byState
        };
    }

    /* ================= 审计面（只带归属与站位串） ================= */

    /**
     * 审计条目（验收③「保留审计时不得泄露受限正文」）。
     *   每条只出：归属（`subject` / `predicate`，用于**定位**）+ `body`
     *   （受限 ⇒ `SECRET_MASK` 站位串；非受限 ⇒ 截断 60 字）。
     *   ★ 这里**不带**任何一句受限原文本体，判据可以逐条断言「审计里不存在受限正文」。
     */
    function auditEntries(items, deps) {
        const d = depsOf(deps);
        const list = Array.isArray(items) ? items : [];
        const out = [];
        for (const it of list) {
            const f = (it && typeof it === 'object') ? it : {};
            out.push({
                id: text(f.id, 48),
                subject: text(f.subject, 48),
                predicate: text(f.predicate, 48),
                body: maskBody(f, d),
                masked: isSecret(f, d),
                disposition: text(f.disposition, 24)
            });
        }
        return out;
    }

    /* ================= 计划面（处置 + 动作 + 圈定 ⇒ 会变成什么） ================= */

    /**
     * 出计划（**纯函数**：不改入参、不写任何账、不调任何写口）。
     *   计划 = 「圈定了谁（`matched`）→ 每条的目标态与所在面（`changes`）→ 挡住了什么
     *          （`blocked`）→ 审计留什么（`audit`）→ 退不退得回来（`rollback`）」。
     *   ★ 目标态**只写在计划里，不落到条目上** —— 见文件头口径②（`copyFact` 白名单会把
     *     落上去的字段在一次 normalize 里抹掉，且会造出「推导说 revoked、持久说 keep」的双真源）。
     *   ★ 组合被挡时**出不了计划**（`ok:false` + 具名 reason）：拒得越早，越没有
     *     「先删了再说」的机会。
     * @param {{state:object, disposition:string, actions:string[], criteria:object,
     *          allowUnsavedDeletion?:boolean, snapshot?:boolean}} opts
     */
    function planFor(opts, deps) {
        const d = depsOf(deps);
        const o = (opts && typeof opts === 'object') ? opts : {};
        const disposition = text(o.disposition, 24);
        const combo = checkCombo(disposition, o.actions, o);
        const rule = rulesOf(disposition);
        if (!combo.ok) {
            return {
                ok: false, planId: '', disposition: disposition, actions: combo.actions,
                blocked: combo.blocked, reason: combo.reason, matched: [], skipped: [],
                /* 被挡时就已无可圈定项（**先拒再算**）：`count` / `total` 一并归零 ——
                 *   缺了 `count` 会让调用方看到 undefined，与「圈定了零条」同形无处可辨。 */
                count: 0, total: 0,
                changes: [], audit: [], rollback: null, targetState: null, face: null,
                writesNothing: true,
                note: '组合被挡（' + combo.reason + '）：一个字都没改，也没出计划'
            };
        }
        const sel = selectFacts(o.state, o.criteria, d);
        const facts = factsOf(o.state);
        const byId = {};
        for (const f of facts) { const id = text(f && f.id, 48); if (id) byId[id] = f; }
        const changes = [];
        for (const m of sel.matched) {
            changes.push({
                id: m.id, from: m.state, to: rule.ledgerState,
                face: rule.ledgerState ? 'ledger' : 'generation',
                applied: false
            });
        }
        const audit = (combo.actions.indexOf('keep-audit') >= 0)
            ? auditEntries(sel.matched.map((m) => Object.assign({}, byId[m.id] || { id: m.id }, { disposition: disposition })), d)
            : [];
        const plan = {
            ok: true,
            planId: stableId(disposition + '|' + combo.actions.join(',') + '|' + sel.matched.map((m) => m.id).join(',')),
            disposition: disposition, actions: combo.actions, blocked: [], reason: '',
            matched: sel.matched, skipped: sel.skipped, count: sel.count, total: sel.total,
            changes: changes, audit: audit,
            targetState: rule.ledgerState,
            face: rule.ledgerState ? 'ledger' : 'generation',
            writesNothing: true,
            note: sel.count
                ? ('圈定 ' + sel.count + ' 条 ⇒ ' + (rule.ledgerState ? ('目标账本态 ' + rule.ledgerState) : '只作用生成面（账本态不动）'))
                : '一条都没圈到（按 criteria 复核来源 / 角色 / 区间）'
        };
        plan.rollback = rollbackOf(plan, o);
        return plan;
    }

    /* ================= 回滚面（分档，不可逆的点名） ================= */

    /**
     * 逆操作读数（验收④「操作可回读、可撤销、可审计」里的**可撤销**）。
     *   三态具名，**不得压成一格布尔**：
     *     · `reversible`   —— 每个动作都有逆操作，且不需要外部材料；
     *     · `partial`      —— 有动作只能靠**快照 / 重放**退回（删原文给快照了就落这一档）；
     *     · `irreversible` —— 存在动作既没有逆操作、也没有快照（**删了就退不回来**）。
     *   ★ `revoke-derived` 的逆是**重放重建**（`needs:'replay'`）：派生件由同代源重放，
     *     不是把 `revoked` 逐条反写回 false —— 反写会留下「撤过又撤回来」的假历史。
     */
    function rollbackOf(plan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const list = Array.isArray(plan && plan.actions) ? plan.actions : [];
        const hasSnapshot = o.snapshot === true;
        const steps = [], blocked = [];
        for (const a of list) {
            const spec = ACTION_SPEC[a];
            if (!spec) { steps.push({ action: a, undo: 'unknown', needs: 'unknown' }); continue; }
            if (spec.reversible) {
                steps.push({ action: a, undo: spec.undo, needs: spec.undo === 'replay-rebuild' ? 'replay' : 'none' });
                continue;
            }
            if (hasSnapshot) { steps.push({ action: a, undo: 'restore-from-snapshot', needs: 'snapshot' }); continue; }
            steps.push({ action: a, undo: 'none', needs: 'none' });
            blocked.push({ action: a, why: 'no-inverse' });
        }
        let verdict = 'reversible';
        if (blocked.length) verdict = 'irreversible';
        else if (steps.some((s) => s.needs !== 'none')) verdict = 'partial';
        return {
            ok: verdict !== 'irreversible', verdict: verdict, steps: steps,
            irreversible: blocked, snapshot: hasSnapshot,
            reason: verdict === 'reversible' ? '每个动作都有逆操作'
                : (verdict === 'partial' ? '有动作只能靠快照 / 重放退回'
                    : ('有动作删了就退不回来（' + blocked.map((b) => b.action).join('、') + '）'))
        };
    }

    /* ================= 回读面（目标态到了没有 / 哪一面到了） ================= */

    /**
     * 回读（验收④前半「操作**可回读**」+ 验收③后半「生成面与账本面**分别报**」）。
     *   逐条按 `changes[].face` 分派：
     *     · 账本面 ⇒ 读 `FACT_STATE` 现态与目标态比 ⇒ `state-reached` / `state-not-reached`；
     *       账上查不到这条 ⇒ `not-on-ledger`（**不当作已生效**）；
     *     · 生成面 ⇒ **不回答 applied / pending**（文件头口径③）：返回 `checked:false` +
     *       具名 reason。`author-only` / `no-generate` 的抑制不在账本里，拿账本读数回答
     *       就是把「没写进账本」读成「没生效」。
     * @returns {{ok:boolean, applied:number, pending:number, unchecked:number, missing:number,
     *            entries:object[], byFace:object, reason:string}}
     */
    function readbackOf(plan, state, deps) {
        const d = depsOf(deps);
        const FS = d.FACT_STATE;
        const changes = Array.isArray(plan && plan.changes) ? plan.changes : [];
        const rs = (FS && typeof FS.readState === 'function') ? FS.readState(state) : null;
        const now = {};
        if (rs && Array.isArray(rs.entries)) for (const e of rs.entries) now[e.id] = e.state;
        const entries = [];
        let applied = 0, pending = 0, unchecked = 0, missing = 0;
        for (const ch of changes) {
            const id = text(ch && ch.id, 48);
            if (ch && ch.face === 'generation') {
                unchecked++;
                entries.push({
                    id: id, face: 'generation', checked: false, to: ch.to, current: null,
                    reason: 'generation-suppression-not-in-ledger',
                    note: '这一态只作用生成面：账本态仍是 ' + (now[id] || 'unknown') + '，回读须另走生成面名单'
                });
                continue;
            }
            if (!(id in now)) {
                missing++;
                entries.push({
                    id: id, face: 'ledger', checked: true, to: ch.to, current: null,
                    reason: 'not-on-ledger',
                    note: '账上查不到这条 ⇒ 目标态无从判定（不当作已生效）'
                });
                continue;
            }
            const hit = now[id] === ch.to;
            if (hit) applied++; else pending++;
            entries.push({
                id: id, face: 'ledger', checked: true, to: ch.to, current: now[id],
                reason: hit ? 'state-reached' : 'state-not-reached',
                note: hit ? '目标态已到' : ('现态仍是 ' + now[id] + '，目标 ' + ch.to + ' 未到')
            });
        }
        return {
            ok: changes.length > 0 && pending === 0 && missing === 0,
            applied: applied, pending: pending, unchecked: unchecked, missing: missing,
            entries: entries,
            byFace: {
                ledger: { applied: applied, pending: pending, missing: missing },
                generation: { unchecked: unchecked }
            },
            reason: !changes.length ? 'empty-plan'
                : (pending ? 'some-pending'
                    : (missing ? 'some-not-on-ledger'
                        : (unchecked ? 'ledger-face-only' : 'ok')))
        };
    }

    /* ================= 抑制取证（撤回后不进入召回与模型载荷） ================= */

    /**
     * 抑制取证（验收②「撤回后不进入召回与模型载荷」+ 验收①后半「禁止生成**不得误删原始证据**」）。
     *   · 处置 `revoke` ⇒ 走 `FACT_STATE.admitForLoad` 拿**载荷准入真读数**：点名的 id 里
     *     只要有一条进了 `supported`，就是 `leaked`（判据咬这里）；
     *   · 处置 `author-only` / `no-generate` ⇒ `checked:false` + 具名 reason：它们的抑制
     *     **不在账本里**，`admitForLoad` 照样会放行（账本态仍 active）。把「账本放行」读成
     *     「抑制没生效」是错判，把「账本没放行」读成「抑制生效」同样是错判。
     *   ★ 本函数是**写后核验面**（owner 落笔后来读），不改任何东西。
     *   ★ 同时报 `evidenceKept`：原文条目**仍在账上** —— 禁止生成 ≠ 删原文。
     */
    function verifyWithheld(plan, state, deps) {
        const d = depsOf(deps);
        const FS = d.FACT_STATE;
        const disposition = text(plan && plan.disposition, 24);
        const ids = (Array.isArray(plan && plan.changes) ? plan.changes : [])
            .map((c) => text(c && c.id, 48)).filter(Boolean);
        const present = idSetOf(state);
        const evidenceKept = ids.filter((id) => present.has(id));
        const missing = ids.filter((id) => !present.has(id));
        if (!FS || typeof FS.admitForLoad !== 'function') {
            return {
                ok: false, checked: false, face: null, admitted: [], withheld: [], leaked: [],
                missing: missing, evidenceKept: evidenceKept, reason: 'no-fact-state'
            };
        }
        const adm = FS.admitForLoad(state, {});
        const supported = (adm && Array.isArray(adm.supported)) ? adm.supported : [];
        const rows = supported.map((r) => text((r && r.id) !== undefined ? r.id : r, 48));
        const admitted = ids.filter((id) => rows.indexOf(id) >= 0);
        const withheld = ids.filter((id) => rows.indexOf(id) < 0);
        const generationFace = (disposition === 'author-only' || disposition === 'no-generate');
        return {
            ok: generationFace ? (evidenceKept.length === ids.length) : (admitted.length === 0),
            checked: !generationFace,
            face: generationFace ? 'generation' : 'ledger',
            admitted: admitted, withheld: withheld, leaked: admitted,
            missing: missing, evidenceKept: evidenceKept,
            reason: generationFace
                ? (evidenceKept.length === ids.length ? 'evidence-kept-untouched' : 'some-evidence-gone')
                : (admitted.length ? 'leaked-into-load' : 'withheld-from-load')
        };
    }

    /* ================= 自述 / 自证 / 诊断 ================= */

    /** 自述（缺哪一格、缺了会怎样；组合与回滚分档走**真探针**，不对常量自断言）。 */
    function describe(deps) {
        const d = depsOf(deps);
        const missing = [];
        for (const need of REQUIRED_DEPS) {
            if (d[need.key] === undefined || d[need.key] === null) missing.push({ key: need.key, why: need.why });
        }
        return {
            kind: 'fact-lifecycle-describe', version: FL_VERSION,
            dispositions: DISPOSITIONS.slice(), actions: ACTIONS.slice(), faces: FACES.slice(),
            secretBodyKeys: SECRET_BODY_KEYS.slice(), auditBodyMax: AUDIT_BODY_MAX,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length, missing: missing,
            /* 处置 × 动作的**真探针**（四条真调用 + 五处断言）：
             *   若把处置与动作合成一张表，前两条 `evidence-preserved` 必然塌成
             *   普通越界（`not-allowed-by-disposition`）—— 这一格就会假。 */
            combosDistinct: (function () {
                const a = checkCombo('no-generate', ['delete-source']);
                const b = checkCombo('author-only', ['delete-source', 'keep-audit']);
                const c = checkCombo('revoke', ['revoke-derived', 'keep-audit', 'hide-from-generation']);
                const e = checkCombo('revoke', ['delete-source']);
                const f = checkCombo('no-generate', ['keep-audit']);
                return a.ok === false && a.reason === 'evidence-preserved'
                    && b.ok === false && b.reason === 'evidence-preserved'
                    && c.ok === true
                    && e.ok === false && e.reason === 'audit-required'
                    && f.ok === true;
            })(),
            /* 处置 → 账本态：三态有态、两态**没有账本态**。这一格必须为真 ——
             *   否则回读会把「生成面问题」拿账本读数回答（文件头口径③）。 */
            generationOnlyHaveNoLedgerState: (function () {
                const ao = rulesOf('author-only'), ng = rulesOf('no-generate');
                return !!ao && !!ng && !ao.ledgerState && !ng.ledgerState
                    && rulesOf('revoke').ledgerState === 'revoked'
                    && rulesOf('expire').ledgerState === 'superseded';
            })(),
            /* 回滚**三态可达性**（三态各有真记录走到，不是词表里有三个字符串）。 */
            rollbackTiersReachable: (function () {
                const keep = rollbackOf({ actions: ['hide-from-generation', 'keep-audit'] }, {});
                const snap = rollbackOf({ actions: ['delete-source', 'keep-audit'] }, { snapshot: true });
                const hard = rollbackOf({ actions: ['delete-source', 'keep-audit'] }, {});
                return keep.verdict === 'reversible' && snap.verdict === 'partial'
                    && hard.verdict === 'irreversible';
            })(),
            writesNothing: true,
            note: missing.length
                ? ('依赖缺 ' + missing.length + ' 格（' + missing.map((m) => m.key).join('、') + '）')
                : '依赖齐备'
        };
    }

    /** 自检（判据套件咬这里；各项**独立**，不合成一个布尔）。 */
    function selfCheck(deps) {
        const d = depsOf(deps);
        const missing = REQUIRED_DEPS
            .filter((n) => d[n.key] === undefined || d[n.key] === null).map((n) => n.key);
        const dsc = describe(d);
        return {
            ok: missing.length === 0 && dsc.combosDistinct === true
                && dsc.generationOnlyHaveNoLedgerState === true && dsc.rollbackTiersReachable === true,
            version: FL_VERSION,
            depsComplete: missing.length === 0, missing: missing,
            combosDistinct: dsc.combosDistinct === true,
            generationOnlyHaveNoLedgerState: dsc.generationOnlyHaveNoLedgerState === true,
            rollbackTiersReachable: dsc.rollbackTiersReachable === true,
            dispositionsExhaustive: new Set(DISPOSITIONS).size === DISPOSITIONS.length,
            actionsExhaustive: new Set(ACTIONS).size === ACTIONS.length,
            writesNothing: true
        };
    }

    /**
     * 诊断一行（**四态分开写**：计划 / 回读 / 回滚 / 载荷准入，问的不是同一件事）。
     *   没有记录时「还没处置过」与「处置了但一条都没圈到」不同形。
     */
    function line(rec) {
        try {
            if (!rec || typeof rec !== 'object') return '尚未处置过（无记录）';
            if (Array.isArray(rec.entries) && typeof rec.applied === 'number') {
                const parts = ['处置回读 ' + (rec.reason || '—')];
                if (rec.applied) parts.push('已生效 ' + rec.applied);
                if (rec.pending) parts.push('未生效 ' + rec.pending);
                if (rec.missing) parts.push('账上无 ' + rec.missing);
                if (rec.unchecked) parts.push('生成面未核 ' + rec.unchecked);
                return parts.join(' · ');
            }
            if (rec.verdict && Array.isArray(rec.steps)) {
                return '回滚 ' + rec.verdict + '：' + rec.steps.map((s) => s.action + '→' + s.undo).join('、');
            }
            if (Array.isArray(rec.changes) && typeof rec.count === 'number') {
                const parts = ['计划 ' + (rec.disposition || '—') + ' 命中 ' + rec.count];
                parts.push(rec.targetState ? ('目标态 ' + rec.targetState) : '只作用生成面');
                if (rec.rollback && rec.rollback.verdict) parts.push('回滚 ' + rec.rollback.verdict);
                if (Array.isArray(rec.skipped) && rec.skipped.length) parts.push('未命中 ' + rec.skipped.length);
                return parts.join(' · ');
            }
            if (Array.isArray(rec.admitted)) {
                return '载荷准入 ' + (rec.reason || '—')
                    + (rec.checked ? '' : '（生成面不在账本里，未核）')
                    + ' · 证据仍在 ' + rec.evidenceKept.length;
            }
            return '——';
        } catch (_e) { return '—（事实生命周期面异常）'; }
    }

    const api = Object.freeze({
        FL_VERSION, DISPOSITIONS, ACTIONS, ACTION_SPEC, FACES, RULES,
        SECRET_BODY_KEYS, SECRET_MASK, AUDIT_BODY_MAX, REQUIRED_DEPS,
        criteriaOf, overlaps, matchesCriteria, selectFacts,
        rulesOf, actionsFor, checkCombo,
        planFor, auditEntries, rollbackOf, readbackOf, verifyWithheld,
        describe, selfCheck, line
    });
    root.LonShaFactLifecycle = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
