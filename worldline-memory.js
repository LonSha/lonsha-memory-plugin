/* ============================================================
 * worldline-memory.js — [v3.424.0 · M7-X1] 世界线记忆与跨线污染闸
 * ------------------------------------------------------------
 * 【它补的是哪一格（修前实测，不是整洁性偏好）】
 *   本仓已有五件与「分支 / 认知」有关的东西，但**没有一件能回答世界线**：
 *     · branch-guard.js      —— 「这一楼这一代还算不算数」（生成期归因，三态队列）；
 *     · branch-semantics.js  —— 「两条分支哪些 owner / 面差在哪」（同会话内的楼层分歧）；
 *     · branch-canon.js      —— 「两条支线结局哪一条成为后续正史」；
 *     · knowledge-trace.js   —— 「谁在第几楼从谁那里知道」；
 *     · secret-ledger.js     —— 「谁此刻不该知道」。
 *   而《命运石之门》这一类的记忆难题不是「分支」——它是**世界线**：
 *     ① **归属**：同一角色在 α 线与 β 线是**两个人生**（真由理在 α 线死、在 β 线活）。
 *        分支面把两条都摆在同一次对照里就收工，而生成侧真正需要的是
 *        「这条记忆**属于哪条线**，进不进本轮注入」——分支面一句都不答。
 *     ② **保留者**：只有跨线保留者（Reading Steiner）记得别的线；其余角色
 *        只能记得**本线**。分支面无此概念，于是异线记忆会被一视同仁地注入给所有人，
 *        角色凭空知道「另一条世界里」的事 —— 那是本仓最贵的错误形态（角色未卜先知）。
 *     ③ **吸引域与收束**：变动率相近的线属同一 attractor field，**某些事件在任何线都发生**
 *        （收束）。收束事件可以当预感提，非收束事件不能 —— 而「没登记」与「不会发生」
 *        必须是两件事（本仓铁律：判不了 ≠ 否）。
 *     ④ **切换的后果**：换线之后哪些记忆带过去、哪些降为残影、哪些在原线成立在本线不成立，
 *        此前无一处产出可判的计划。
 *
 * 【四态穷尽互斥（一条也不省）】
 *   native   本线记忆 —— 可作事实进注入；
 *   adjacent 同吸引域邻近线 —— **只能作既视感 / 预感**，不得当事实；
 *   foreign  异吸引域 —— 默认不进注入（跨线保留者除外，且仍要标注）；
 *   unknown  条目没标线 / 线号判不了 —— **与 native 绝不同形**（本仓最贵的老账）。
 *   ★ 关键判据：同一 lineId 但变动率差值超容差 ⇒ **unknown**，不许猜成同线；
 *     任一侧线号非法 ⇒ unknown，不许塌成 foreign。
 *
 * 【明确不做（边界，显式声明）】
 *   · 不建第二套记忆库：条目清单由调用方给，本模块**只读不写、不改入参**；
 *   · 不落盘、不联网、不发起任何请求（全程纯函数）；
 *   · 不批量重标老数据：没标线的条目一律 unknown，由宿主决定怎么处置；
 *   · 不判「哪条线是真的」：那是人的决定（正史选择归 branch-canon）；
 *   · 不产正文、不产置信百分比：本模块只产出归属、分档与计数。
 *
 * 纪律：纯函数、零依赖、IIFE + CJS 双导出；绝不外抛（异常一律退化为可读降级读数）。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaWorldlineMemory = factory();
        root.WorldlineMemory = root.LonShaWorldlineMemory;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const WM_VERSION = 1;
    const WM_KIND = 'worldline_memory';

    /* 归属四态（互斥穷尽）。顺序即判据优先级，但**不靠顺序兜底**：每一态都有具名理由码。 */
    const LINE_STATE = Object.freeze({
        NATIVE: 'native', ADJACENT: 'adjacent', FOREIGN: 'foreign', UNKNOWN: 'unknown',
    });
    /* 两线关系四态。★ 刻意与 LINE_STATE 不同词：'same' 与 'native' 混用会让
     *   「两条线是不是同一条」和「这条记忆属于谁」在读数上同形。 */
    const RELATION = Object.freeze({
        SAME: 'same', NEAR: 'near', FAR: 'far', UNKNOWN: 'unknown',
    });
    /* 收束三态。★ 「没登记」与「不会发生」必须不同形（本仓铁律）。 */
    const CONVERGE = Object.freeze({
        YES: 'converged', NO: 'not-converged', UNREGISTERED: 'unregistered',
    });
    /* 污染闸四档。四档互不相等：kept（可进）/ held（押后，可作预感）/
     *   blocked（不进，越界）/ undecided（判不了，不猜）。 */
    const GATE = Object.freeze({
        KEPT: 'kept', HELD: 'held', BLOCKED: 'blocked', UNDECIDED: 'undecided',
    });
    /* 换线计划五桶。conflict 单列：目标线已有同键条目且值不同 —— 那是**冲突**，
     *   不是「带过去」也不是「作废」，压进任何一桶都是错读数。 */
    const PLAN = Object.freeze({
        CARRY: 'carry', SHADOW: 'shadow', INVALIDATE: 'invalidate', CONFLICT: 'conflict', UNDECIDED: 'undecided',
    });
    /* 吸引域默认分段（可被 opts.bands 覆盖）。hi 是**上界开区间**：
     *   d < hi 即落该域。最后一段吃掉剩余，故任意大的 d 也有归属。
     * ★ [v3.424.1 · 自纠] 原默认是三段 0.4/0.8/1.0001，等于把「变动率是 0~1 的比例」写死进默认值。
     *   《命运石之门》的变动率恰恰是 1.048596 / 1.130205 / 1.900000 这种**大于 1 的编号**：
     *   按旧默认，α 段被压成 0~0.4、β 段 0.4~0.8、而所有 1.x 线全落进最后的 gamma 兜底段，
     *   使用者不自定义 bands 就永远分不出 α/β。现按原作语义重排：低位段（α）0~1，高位段（β）1~MAX。
     *   注意 gamma 仍是**兜底命名**，不是「第三条线」——它只负责吃掉 2 以上的越界值。 */
    const DEFAULT_BANDS = Object.freeze([
        { name: 'alpha', hi: 1.0 },
        { name: 'beta', hi: 2.0 },
        { name: 'gamma', hi: 1e9 },
    ]);
    const DEFAULT_EPSILON = 0.02;          // 同线容差：同 lineId 且变动率差在容差内才算同线
    const DEFAULT_ADJACENT_EPSILON = 0.15; // 邻近容差：同吸引域内「够近」才算残影
    const ADJACENT_POLICIES = Object.freeze(['hold', 'allow', 'block']);
    const MAX_ENTRIES = 2000;              // 输入上限：超出即截断并**报出**截了多少（不静默）
    /* 条目上的线标字段名（按序取第一个非空）。★ 不认 `line`
     *   —— 那个字段名太通用，别的账本已经在用（行号 / 行内容），撞上就是错读数。 */
    const MARK_FIELDS = Object.freeze(['worldline', 'originLine', 'lineId']);

    /* ---------- 数值与文本原语（零正则、零反斜杠转义） ---------- */
    function numOr(v, fallback) {
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }
    function txt(v) {
        return (v === null || v === undefined) ? '' : String(v);
    }
    function clamp01(n) {
        if (!Number.isFinite(n)) return NaN;
        if (n < 0) return 0;
        if (n > 1) return 1;
        return n;
    }
    /** 名单归一：去首尾空白、折叠内部连续空格、小写。不删全角（那是名字的一部分）。 */
    function normName(v) {
        const s = txt(v).trim();
        if (!s) return '';
        const parts = s.split(' ');
        const keep = [];
        for (let i = 0; i < parts.length; i++) {
            if (parts[i]) keep.push(parts[i]);
        }
        return keep.join(' ').toLowerCase();
    }
    function round2(n) {
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    }
    function pct(d) {
        const n = numOr(d, NaN);
        if (!Number.isFinite(n)) return '—';
        return (Math.round(n * 10000) / 100) + '%';
    }
    /** 浅拷贝（只拷自有可枚举键）：stamp 用。 */
    function shallow(it) {
        const out = {};
        for (const k in it) {
            if (Object.prototype.hasOwnProperty.call(it, k)) out[k] = it[k];
        }
        return out;
    }

    /* ---------- 吸引域 ---------- */
    function bandsOf(opts) {
        const raw = (opts && Array.isArray(opts.bands) && opts.bands.length) ? opts.bands : DEFAULT_BANDS;
        const out = [];
        for (let i = 0; i < raw.length; i++) {
            const it = raw[i];
            if (!it || typeof it !== 'object') continue;
            const hi = numOr(it.hi, NaN);
            if (!Number.isFinite(hi)) continue;
            out.push({ name: txt(it.name).trim() || ('band' + i), hi: hi });
        }
        if (!out.length) return DEFAULT_BANDS;
        out.sort(function (a, b) { return a.hi - b.hi; });
        return out;
    }
    /**
     * 变动率合法化。**不做 0~1 截断**。
     * ★ [v3.424.1 · 自纠·本版最重要的一刀] 原实现对变动率调 clamp01 压进 [0,1]：
     *   《命运石之门》的 β 线是 1.130205 / 1.048596 / 1.900000 这种 >1 的编号，
     *   压平后 **1.130205 与 1.900000 都变成 1**，于是 relationOf 里
     *   distance 恒为 0 ⇒ `same-line-id-divergence-gap`（同号超差判不了）这条
     *   **本模块最核心的判据在 >1 段永不触发**：两条真实相距 0.77 的不同世界线
     *   被判成 same/native，普通角色会拿到异线记忆 —— 正是本版要防的那个错误。
     *   同一处压平还让读数面把「113.02%」显示成「100%」，使用者无从察觉。
     * 现规则：只用有限性把关，负值折 0（变动率没有负数语义），上不封顶。
     */
    function normDivergence(v) {
        const n = numOr(v, NaN);
        if (!Number.isFinite(n)) return NaN;
        return n < 0 ? 0 : n;
    }
    /** 变动率 → 吸引域名。非法变动率返回空串（**不猜成第一段**）。 */
    function attractorOf(divergence, opts) {
        let d = normDivergence(divergence);
        if (!Number.isFinite(d)) return '';
        const bands = bandsOf(opts);
        for (let i = 0; i < bands.length; i++) {
            if (d < bands[i].hi) return bands[i].name;
        }
        return bands[bands.length - 1].name;
    }

    /* ---------- 线号归一 ---------- */
    /**
     * 归一一条世界线。三态归因写成 ok / why：
     *   not-object / no-line-id / no-divergence / threw，各自具名。
     * ★ 缺 lineId 或缺变动率一律**不合法**（不是「默认 1.0」）：世界线的身份
     *   恰恰就是这两个数，缺一个就判不了，补一个默认值等于编一条线。
     */
    function normalizeLine(raw, opts) {
        const bad = function (why) {
            return { ok: false, why: why, lineId: '', divergence: null, attractor: '', label: '' };
        };
        try {
            if (!raw || typeof raw !== 'object') return bad('not-object');
            const id = txt(raw.lineId !== undefined ? raw.lineId : (raw.id !== undefined ? raw.id : '')).trim();
            if (!id) return bad('no-line-id');
            const dv = numOr(raw.divergence, NaN);
            if (!Number.isFinite(dv)) return bad('no-divergence');
            /* ★ [v3.424.1] 不再 clamp01 压平：>1 的变动率（命运石之门 β 线）必须原样保留，
             *   否则 distance 恒 0，「同号超差判不了」在 >1 段永不触发。 */
            const d = normDivergence(dv);
            const att = txt(raw.attractor).trim() || attractorOf(d, opts);
            return {
                ok: true, why: dv === d ? 'ok' : 'clamped',
                lineId: id, divergence: d, attractor: att, label: txt(raw.label).trim(),
            };
        } catch (e) {
            return bad('threw');
        }
    }

    /* ---------- 两线关系 ---------- */
    /**
     * 判两条线的关系。四态：
     *   same —— 同 lineId 且变动率差 <= epsilon；
     *   near —— 同吸引域且变动率差 <= adjacentEpsilon（残影可及的范围）；
     *   far  —— 其余已知情形（含同吸引域但太远 / 跨吸引域，why 分列）；
     *   unknown —— 任一侧线号不合法，或**同 lineId 但变动率差超容差**。
     * ★ 最后一档是最容易写错的一格：同 lineId 却差 0.3，那说明线号被复用或记录错乱，
     *   判成 same 会让两段不同经历互相冒充；判成 far 又会给它一个「已知的远」的身份。
     *   只有 unknown 是诚实的。
     */
    function relationOf(a, b, opts) {
        const A = normalizeLine(a, opts);
        const B = normalizeLine(b, opts);
        if (!A.ok || !B.ok) {
            return {
                relation: RELATION.UNKNOWN,
                why: (!A.ok ? ('a-' + A.why) : ('b-' + B.why)),
                distance: null,
            };
        }
        const eps = numOr((opts && opts.epsilon), DEFAULT_EPSILON);
        const epsNear = numOr((opts && opts.adjacentEpsilon), DEFAULT_ADJACENT_EPSILON);
        const dist = Math.abs(A.divergence - B.divergence);
        if (A.lineId === B.lineId) {
            if (dist <= eps) return { relation: RELATION.SAME, why: 'same-line-id', distance: round2(dist) };
            return { relation: RELATION.UNKNOWN, why: 'same-line-id-divergence-gap', distance: round2(dist) };
        }
        if (A.attractor === B.attractor && dist <= epsNear) {
            return { relation: RELATION.NEAR, why: 'same-attractor-near', distance: round2(dist) };
        }
        return {
            relation: RELATION.FAR,
            why: A.attractor === B.attractor ? 'same-attractor-far' : 'cross-attractor',
            distance: round2(dist),
        };
    }

    /* ---------- 条目归属 ---------- */
    /**
     * 判一条记忆属于哪条线。四态见 LINE_STATE。
     * ★ 没标线 ⇒ unknown（**不是** native）：老数据不批量重标，判不了就报判不了。
     */
    function tagOf(entry, current, opts) {
        try {
            if (!entry || typeof entry !== 'object') {
                return { state: LINE_STATE.UNKNOWN, why: 'no-entry', relation: '', distance: null };
            }
            let mark = null;
            for (let i = 0; i < MARK_FIELDS.length; i++) {
                const f = MARK_FIELDS[i];
                if (entry[f] !== undefined && entry[f] !== null && entry[f] !== '') { mark = entry[f]; break; }
            }
            if (mark === null) {
                return { state: LINE_STATE.UNKNOWN, why: 'no-line-mark', relation: '', distance: null };
            }
            const rel = relationOf(mark, current, opts);
            let st = LINE_STATE.UNKNOWN;
            if (rel.relation === RELATION.SAME) st = LINE_STATE.NATIVE;
            else if (rel.relation === RELATION.NEAR) st = LINE_STATE.ADJACENT;
            else if (rel.relation === RELATION.FAR) st = LINE_STATE.FOREIGN;
            return { state: st, why: rel.why, relation: rel.relation, distance: rel.distance };
        } catch (e) {
            return { state: LINE_STATE.UNKNOWN, why: 'threw', relation: '', distance: null };
        }
    }

    /* ---------- 跨线保留者名单 ---------- */
    /** 归一保留者名单（数组或对象键都收）。非法一律空名单，**不猜**。 */
    function readerSet(state) {
        const out = [];
        try {
            const raw = state && (state.readers !== undefined ? state.readers : state.reader);
            if (Array.isArray(raw)) {
                for (let i = 0; i < raw.length; i++) {
                    const n = normName(raw[i]);
                    if (n && out.indexOf(n) < 0) out.push(n);
                }
            } else if (raw && typeof raw === 'object') {
                const keys = Object.keys(raw);
                for (let i = 0; i < keys.length; i++) {
                    if (raw[keys[i]] === false) continue;
                    const n = normName(keys[i]);
                    if (n && out.indexOf(n) < 0) out.push(n);
                }
            } else if (typeof raw === 'string') {
                const n = normName(raw);
                if (n) out.push(n);
            }
        } catch (e) { /* 名单读不到按空名单处理：不给权限，不给假权限 */ }
        return out;
    }

    /** 单条分档（显式表，不用 if 链兜底：四态 × 保留者特征 × 三策略 = 可穷举）。 */
    function decideGate(state, isReader, policy) {
        if (state === LINE_STATE.NATIVE) return GATE.KEPT;
        if (state === LINE_STATE.UNKNOWN) return GATE.UNDECIDED;   // 保留者也不猜：判不了就是判不了
        if (isReader) return GATE.KEPT;                            // 跨线保留者记得别的线（但仍带 lineState 标注）
        if (state === LINE_STATE.FOREIGN) return GATE.BLOCKED;
        if (state === LINE_STATE.ADJACENT) {
            if (policy === 'allow') return GATE.KEPT;
            if (policy === 'block') return GATE.BLOCKED;
            return GATE.HELD;                                      // 默认 hold：可作预感，不得当事实
        }
        return GATE.UNDECIDED;                                     // 不可达，保底不猜
    }

    /**
     * 跨线污染闸：逐条判「这一条能不能进本轮注入」。
     * 返回 kept / held / blocked / undecided 四档 + **逐条理由码** + 计数。
     * ★ 四档一律逐条落在 items 上，不静默丢：被挡下的条目在 blocked 里仍可见（带 why）。
     */
    function guard(items, viewer, state, opts) {
        const out = {
            version: WM_VERSION, kind: WM_KIND,
            current: null, reader: false, readers: 0, policy: '',
            counts: { total: 0, kept: 0, held: 0, blocked: 0, undecided: 0, malformed: 0, truncated: 0 },
            byState: { native: 0, adjacent: 0, foreign: 0, unknown: 0 },
            kept: [], held: [], blocked: [], undecided: [],
            why: [],
        };
        try {
            const cur = normalizeLine(state && state.current ? state.current : state, opts);
            out.current = cur.ok
                ? { lineId: cur.lineId, divergence: cur.divergence, attractor: cur.attractor, label: cur.label }
                : null;
            if (!cur.ok) out.why.push('current-line-' + cur.why);
            const readers = readerSet(state);
            out.readers = readers.length;
            const who = normName(viewer);
            const isReader = !!(who && readers.indexOf(who) >= 0);
            out.reader = isReader;
            let policy = txt((opts && opts.adjacentPolicy) || (state && state.adjacentPolicy) || 'hold').trim();
            if (ADJACENT_POLICIES.indexOf(policy) < 0) {
                out.why.push('adjacent-policy-illegal-fallback-hold');
                policy = 'hold';
            }
            out.policy = policy;

            const list = Array.isArray(items) ? items : [];
            const cap = numOr((opts && opts.maxEntries), MAX_ENTRIES);
            const limit = Math.min(list.length, cap > 0 ? cap : MAX_ENTRIES);
            if (list.length > limit) out.counts.truncated = list.length - limit;

            for (let i = 0; i < limit; i++) {
                const it = list[i];
                out.counts.total++;
                if (!it || typeof it !== 'object') {
                    out.counts.malformed++;
                    out.undecided.push({ key: '', state: LINE_STATE.UNKNOWN, gate: GATE.UNDECIDED, why: 'malformed' });
                    continue;
                }
                const t = tagOf(it, cur.ok ? cur : null, opts);
                const g = decideGate(t.state, isReader, policy);
                out.byState[t.state] = (out.byState[t.state] || 0) + 1;
                const row = {
                    key: txt(it.id !== undefined ? it.id : (it.key !== undefined ? it.key : '')),
                    state: t.state, gate: g, why: t.why, distance: t.distance,
                };
                if (g === GATE.KEPT) { out.counts.kept++; out.kept.push({ ...row, item: it }); }
                else if (g === GATE.HELD) { out.counts.held++; out.held.push({ ...row, item: it }); }
                else if (g === GATE.BLOCKED) { out.counts.blocked++; out.blocked.push({ ...row, item: it }); }
                else { out.counts.undecided++; out.undecided.push({ ...row, item: it }); }
            }
        } catch (e) {
            out.why.push('threw');
        }
        return out;
    }

    /** 只取可进注入的条目本体（便利出口；调用方若要理由码请用 guard 的 kept）。 */
    function keptItems(gate) {
        try {
            const list = (gate && Array.isArray(gate.kept)) ? gate.kept : [];
            const out = [];
            for (let i = 0; i < list.length; i++) {
                if (list[i] && list[i].item) out.push(list[i].item);
            }
            return out;
        } catch (e) { return []; }
    }

    /* ---------- 收束事件 ---------- */
    /**
     * 查某个事件在本线是否会收束（必然发生）。
     * 三态：converged / not-converged / unregistered。
     * ★ 未登记 ≠ 不会发生：后者要求「登记过且本吸引域不在 scope 里」。
     *   scope 支持 'all' 或吸引域名数组。
     */
    function convergenceOf(key, state, opts) {
        const k = txt(key).trim();
        if (!k) return { state: CONVERGE.UNREGISTERED, why: 'no-key', scope: [] };
        const list = (state && Array.isArray(state.convergences)) ? state.convergences : [];
        const cur = normalizeLine(state && state.current ? state.current : state, opts);
        const att = cur.ok ? cur.attractor : '';
        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            if (!c || typeof c !== 'object') continue;
            if (txt(c.key).trim() !== k) continue;
            const rawScope = c.scope;
            if (rawScope === 'all' || txt(rawScope).trim() === 'all') {
                return { state: CONVERGE.YES, why: 'scope-all', scope: ['all'] };
            }
            const scope = Array.isArray(rawScope) ? rawScope.map(function (x) { return txt(x).trim(); }) : [];
            if (!att) return { state: CONVERGE.UNREGISTERED, why: 'no-current-attractor', scope: scope };
            if (scope.indexOf(att) >= 0) return { state: CONVERGE.YES, why: 'scope-match', scope: scope };
            return { state: CONVERGE.NO, why: 'scope-miss', scope: scope };
        }
        return { state: CONVERGE.UNREGISTERED, why: 'not-registered', scope: [] };
    }

    /* ---------- 换线计划 ---------- */
    /**
     * 从当前线切到目标线：逐条给出去向（不落笔、不改入参）。
     * 五桶：carry（带过去）/ shadow（降为残影）/ invalidate（本线不成立）/ conflict（目标线已有同键且值不同）/ undecided。
     * ★ conflict 必须单列：同键不同值既不能「带过去」（会覆盖目标线），
     *   也不能「作废」（目标线真的有一条），更不能静默取其一。
     * ★ targetEntries 是**目标线已有的条目**（由调用方给）。不给就报 `target-empty`，
     *   而不是假装目标线是空的（那会把全部冲突读成「可以带」）。
     */
    function switchPlan(target, state, opts) {
        const out = {
            version: WM_VERSION, kind: WM_KIND,
            from: null, to: null, sameLine: false, targetEmpty: true,
            buckets: { carry: [], shadow: [], invalidate: [], conflict: [], undecided: [] },
            counts: { total: 0, carry: 0, shadow: 0, invalidate: 0, conflict: 0, undecided: 0 },
            ok: false, why: [],
        };
        try {
            const from = normalizeLine(state && state.current, opts);
            const to = normalizeLine(target, opts);
            out.from = from.ok ? { lineId: from.lineId, divergence: from.divergence, attractor: from.attractor } : null;
            out.to = to.ok ? { lineId: to.lineId, divergence: to.divergence, attractor: to.attractor } : null;
            if (!from.ok) out.why.push('from-line-' + from.why);
            if (!to.ok) { out.why.push('to-line-' + to.why); return out; }
            const rel = relationOf(from.ok ? from : null, to, opts);
            out.sameLine = rel.relation === RELATION.SAME;
            const existing = Array.isArray(state && state.targetEntries) ? state.targetEntries : [];
            const byKey = new Map();
            for (let i = 0; i < existing.length; i++) {
                const e = existing[i];
                if (!e || typeof e !== 'object') continue;
                const k = txt(e.id !== undefined ? e.id : e.key).trim();
                if (k) byKey.set(k, e);
            }
            out.targetEmpty = byKey.size === 0;
            const items = Array.isArray(state && state.entries) ? state.entries : [];
            const cap = numOr((opts && opts.maxEntries), MAX_ENTRIES);
            const limit = Math.min(items.length, cap > 0 ? cap : MAX_ENTRIES);
            for (let i = 0; i < limit; i++) {
                const it = items[i];
                out.counts.total++;
                if (!it || typeof it !== 'object') {
                    out.counts.undecided++;
                    out.buckets.undecided.push({ key: '', why: 'malformed' });
                    continue;
                }
                const k = txt(it.id !== undefined ? it.id : it.key).trim();
                const t = tagOf(it, from.ok ? from : null, opts);
                if (t.state === LINE_STATE.NATIVE) {
                    const hit = k ? byKey.get(k) : null;
                    if (hit) {
                        const a = txt(it.text !== undefined ? it.text : it.value).trim();
                        const b = txt(hit.text !== undefined ? hit.text : hit.value).trim();
                        if (a && b && a !== b) {
                            out.counts.conflict++;
                            out.buckets.conflict.push({ key: k, why: 'same-key-diff-value', fromValue: a, toValue: b });
                        } else {
                            out.counts.carry++;
                            out.buckets.carry.push({ key: k, why: 'same-value' });
                        }
                    } else {
                        out.counts.carry++;
                        out.buckets.carry.push({ key: k, why: 'target-vacant' });
                    }
                } else if (t.state === LINE_STATE.ADJACENT) {
                    out.counts.shadow++; out.buckets.shadow.push({ key: k, why: t.why });
                } else if (t.state === LINE_STATE.FOREIGN) {
                    out.counts.invalidate++; out.buckets.invalidate.push({ key: k, why: t.why });
                } else {
                    out.counts.undecided++; out.buckets.undecided.push({ key: k, why: t.why });
                }
            }
            if (out.targetEmpty) out.why.push('target-empty');
            out.ok = !!(from.ok && to.ok);
        } catch (e) {
            out.why.push('threw');
        }
        return out;
    }

    /* ---------- 两线差异 ---------- */
    /**
     * 按 key 配对两组条目，出五态：same / diverged / only-a / only-b / uncompared。
     * ★ uncompared 单列：缺 key 的条目**判不了**，不许与 only-a/only-b 同形
     *   （「这条只在 A 有」是事实，「这条没 key 所以不知道」是另一件事）。
     */
    function diffEntries(itemsA, itemsB) {
        const out = {
            version: WM_VERSION, kind: WM_KIND,
            counts: { same: 0, diverged: 0, onlyA: 0, onlyB: 0, uncompared: 0 },
            rows: [], why: [],
        };
        try {
            const A = Array.isArray(itemsA) ? itemsA : [];
            const B = Array.isArray(itemsB) ? itemsB : [];
            const mapA = new Map(), mapB = new Map();
            const loose = [];
            const fill = function (arr, map) {
                for (let i = 0; i < arr.length; i++) {
                    const e = arr[i];
                    if (!e || typeof e !== 'object') { loose.push(e); continue; }
                    const k = txt(e.id !== undefined ? e.id : e.key).trim();
                    if (!k) { loose.push(e); continue; }
                    if (!map.has(k)) map.set(k, e);
                }
            };
            fill(A, mapA);
            fill(B, mapB);
            for (const k of mapA.keys()) {
                const a = mapA.get(k);
                if (!mapB.has(k)) {
                    out.counts.onlyA++;
                    out.rows.push({ key: k, state: 'only-a', aValue: txt(a.text !== undefined ? a.text : a.value), bValue: '' });
                    continue;
                }
                const b = mapB.get(k);
                const av = txt(a.text !== undefined ? a.text : a.value).trim();
                const bv = txt(b.text !== undefined ? b.text : b.value).trim();
                if (av && bv && av === bv) { out.counts.same++; out.rows.push({ key: k, state: 'same', aValue: av, bValue: bv }); }
                else { out.counts.diverged++; out.rows.push({ key: k, state: 'diverged', aValue: av, bValue: bv }); }
            }
            for (const k of mapB.keys()) {
                if (!mapA.has(k)) {
                    const b = mapB.get(k);
                    out.counts.onlyB++;
                    out.rows.push({ key: k, state: 'only-b', aValue: '', bValue: txt(b.text !== undefined ? b.text : b.value) });
                }
            }
            out.counts.uncompared = loose.length;
            if (loose.length) out.why.push('entries-without-key');
        } catch (e) {
            out.why.push('threw');
        }
        return out;
    }

    /* ---------- 打标（纯函数） ---------- */
    /**
     * 给条目清单打上「此条属于当前线」的标。返回**副本**，不改入参。
     * ★ 线号非法 ⇒ 一条都不打（返回 unstamped），不拿坏线号污染数据。
     */
    function stamp(items, lineRef, opts) {
        const L = normalizeLine(lineRef, opts);
        const list = Array.isArray(items) ? items : [];
        const out = [];
        if (!L.ok) {
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                if (!it || typeof it !== 'object') { out.push(it); continue; }
                const c = shallow(it);
                c.worldlineStamp = 'unstamped';
                out.push(c);
            }
            return { ok: false, why: L.why, items: out, stamped: 0, total: list.length };
        }
        for (let i = 0; i < list.length; i++) {
            const it = list[i];
            if (!it || typeof it !== 'object') { out.push(it); continue; }
            const c = shallow(it);
            c.worldline = { lineId: L.lineId, divergence: L.divergence, attractor: L.attractor };
            c.worldlineStamp = 'stamped';
            out.push(c);
        }
        return { ok: true, why: 'ok', items: out, stamped: list.length, total: list.length };
    }

    /* ---------- 读数串 ---------- */
    /**
     * 一行读数（诊断面用）。四态 / 缺席 / 未设定分列，不合并成一句话。
     * ★ [v3.424.1 · 自纠] 原签名只有 (state)，内部按 DEFAULT_BANDS 是否使用、
     *   以及调用方是否自定义 bands 完全不知情 —— 于是「判据用 alpha、读数显示 beta」
     *   两套口径并存，使用者按读数排查会得到反的结论。
     *   现补第二参数 opts：与 tagOf / relationOf / convergenceOf 吃同一份分段。
     *   不传时行为与旧版一致（用当前默认分段），故属**兼容式增强**而非破坏性改签。
     */
    function line(state, opts) {
        try {
            const cur = normalizeLine(state && state.current ? state.current : state, opts);
            if (!cur.ok) {
                if (!state || (!state.current && !state.lineId)) return '尚未设定世界线';
                return '线号非法（' + cur.why + '）';
            }
            const parts = ['线 ' + cur.lineId, '变动率 ' + pct(cur.divergence), '吸引域 ' + (cur.attractor || '—')];
            const rs = readerSet(state);
            parts.push('跨线保留者 ' + (rs.length ? (rs.length + ' 人') : '无'));
            const cs = (state && Array.isArray(state.convergences)) ? state.convergences.length : 0;
            parts.push('收束事件 ' + cs + ' 条');
            const rd = state && state.lastGateRead;
            if (rd && rd.counts && typeof rd.counts === 'object') {
                const c = rd.counts;
                parts.push('上轮 挡下 ' + (c.blocked || 0) + ' / 押后 ' + (c.held || 0) + ' / 判不了 ' + (c.undecided || 0));
            }
            return parts.join(' · ');
        } catch (e) {
            return '—（世界线读数异常）';
        }
    }

    /* ---------- 自证 ---------- */
    /**
     * 八项自证。每一项都对应一条**可当场证伪**的口径，不是「函数没抛」。
     * ★ 自证只读不写：跑完后把入参对象序列化回来比对，任何写回都会当场被抓。
     */
    function selfCheck() {
        const checks = [];
        const push = function (name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: txt(detail) }); };
        try {
            const L1 = { lineId: 'A', divergence: 0.2 };
            const L2 = { lineId: 'B', divergence: 0.25 };
            const L3 = { lineId: 'C', divergence: 0.9 };

            /* 1 四态穷尽互斥：三条样本各落一态 */
            const s1 = tagOf({ worldline: L1 }, L1).state;
            const s2 = tagOf({ worldline: L2 }, L1).state;
            const s3 = tagOf({ worldline: L3 }, L1).state;
            const s4 = tagOf({ text: 'no mark' }, L1).state;
            push('四态穷尽互斥',
                s1 === LINE_STATE.NATIVE && s2 === LINE_STATE.ADJACENT && s3 === LINE_STATE.FOREIGN && s4 === LINE_STATE.UNKNOWN,
                s1 + '/' + s2 + '/' + s3 + '/' + s4);

            /* 2 没标线绝不判成本线 */
            push('无标不等于本线', tagOf({ text: 'x' }, L1).state !== LINE_STATE.NATIVE,
                tagOf({ text: 'x' }, L1).why);

            /* 3 同 lineId 但变动率差超容差 ⇒ 判不了（不猜同线、也不给「已知的远」） */
            const gap = relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'A', divergence: 0.6 });
            push('同号超差判不了', gap.relation === RELATION.UNKNOWN, gap.why);

            /* 4 邻近只由「同吸引域 + 够近」产生 */
            const near = relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.95 });
            push('跨域不得算邻近', near.relation !== RELATION.NEAR, near.relation + '/' + near.why);

            /* 5 收束三态不同形 */
            const st = { current: L1, convergences: [{ key: 'k1', scope: 'all' }, { key: 'k2', scope: ['gamma'] }] };
            const c1 = convergenceOf('k1', st).state;
            const c2 = convergenceOf('k2', st).state;
            const c3 = convergenceOf('k3', st).state;
            push('收束三态不同形',
                c1 === CONVERGE.YES && c2 === CONVERGE.NO && c3 === CONVERGE.UNREGISTERED,
                c1 + '/' + c2 + '/' + c3);

            /* 6 名单外异线必挡、名单内仍带标注 */
            const g1 = guard([{ id: 'x', worldline: L3 }], '甲', { current: L1, readers: ['乙'] });
            const g2 = guard([{ id: 'x', worldline: L3 }], '乙', { current: L1, readers: ['乙'] });
            push('名单外必挡',
                g1.counts.blocked === 1 && g1.reader === false,
                JSON.stringify(g1.counts));
            push('名单内仍带标注',
                g2.counts.kept === 1 && g2.reader === true && g2.byState.foreign === 1,
                JSON.stringify(g2.counts));

            /* 7 换线计划：同键不同值单列冲突，不静默取其一 */
            const plan = switchPlan(L2, {
                current: L1,
                entries: [{ id: 'a', text: 'v1', worldline: L1 }],
                targetEntries: [{ id: 'a', text: 'v2' }],
            });
            push('换线冲突单列',
                plan.counts.conflict === 1 && plan.counts.carry === 0 && plan.buckets.conflict[0].why === 'same-key-diff-value',
                JSON.stringify(plan.counts));

            /* 8 纯只读：入参跑完逐字不变 */
            const frozen = { current: L1, readers: ['甲'], entries: [{ id: 'a', text: 'v1', worldline: L1 }] };
            const snap = JSON.stringify(frozen);
            guard(frozen.entries, '乙', frozen);
            switchPlan(L2, frozen);
            diffEntries(frozen.entries, []);
            push('纯只读不改入参', JSON.stringify(frozen) === snap, 'snapshot-stable');
            /* 9 ★ [v3.424.1] >1 段的变动率必须原样保留（命运石之门 β 线是 1.xxxxxx）。
             *   旧实现 clamp01 把 1.13 与 1.90 都压成 1 ⇒ distance 恒 0 ⇒
             *   本模块最核心的「同号超差判不了」在 >1 段永不触发。 */
            const hi1 = { lineId: 'B', divergence: 1.130205 };
            const hi2 = { lineId: 'B', divergence: 1.900000 };
            const hiRel = relationOf(hi1, hi2);
            const hiKept = normalizeLine(hi1).divergence;
            push('超一变动率不被压平',
                hiKept === 1.130205 && hiRel.distance === 0.77,
                'kept=' + hiKept + '/dist=' + hiRel.distance);
            push('超一段同号超差仍判不了',
                hiRel.relation === RELATION.UNKNOWN && hiRel.why === 'same-line-id-divergence-gap',
                hiRel.relation + '/' + hiRel.why);
            /* 10 ★ 超一段的读数面不得说谎：113.02% 不许显示成 100% */
            const hiLine = line({ current: hi1 });
            push('超一读数不冒充百分百', hiLine.indexOf('113.02%') >= 0 && hiLine.indexOf('100%') < 0, hiLine);
        } catch (e) {
            push('自证不抛', false, String((e && e.message) || e));
        }
        let bad = 0;
        for (let i = 0; i < checks.length; i++) { if (!checks[i].ok) bad++; }
        return { version: WM_VERSION, kind: WM_KIND, ok: bad === 0, failed: bad, checks: checks };
    }

    /* ---------- 导出面（冻结） ---------- */
    const api = Object.freeze({
        WM_VERSION, WM_KIND,
        LINE_STATE, RELATION, CONVERGE, GATE, PLAN,
        DEFAULT_BANDS, DEFAULT_EPSILON, DEFAULT_ADJACENT_EPSILON, ADJACENT_POLICIES, MARK_FIELDS, MAX_ENTRIES,
        numOr, normName, pct, clamp01, normDivergence,
        bandsOf, attractorOf, normalizeLine, relationOf, tagOf,
        readerSet, decideGate, guard, keptItems,
        convergenceOf, switchPlan, diffEntries, stamp, line, selfCheck,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof globalThis !== 'undefined' && globalThis) {
        try { globalThis.LonShaWorldlineMemory = api; } catch (_e) { /* ignore */ }
    }
    if (typeof window !== 'undefined') {
        try { window.LonShaWorldlineMemory = api; } catch (_e) { /* ignore */ }
    }
    return api;
}));
