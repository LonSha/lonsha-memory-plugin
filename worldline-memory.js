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

    const WM_VERSION = 2;
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
    /* ★ [v3.425.0 · 去世界观化] 这里原本是 alpha(<1.0) / beta(<2.0) / gamma(兜底) 三段。
     *   那等于把《命运石之门》的分段写进了内核默认值 —— 而使用者要的是「机制都可能」：
     *   梦境层级、时间循环第 N 轮、平行宇宙 A/B/C、存档点、位面……没有哪一种长这样。
     *   故**默认零预设**：内核不认识任何数字分段。数字编号（变动率之类）是**可选**能力，
     *   只有调用方显式给 opts.bands 时才存在；不给就完全不参与判定。
     *   身份只由「层标记 + 切换楼层」两件抽象事实决定 —— 这两样任何世界观都成立。
     *   推论：没有 bands 时 attractorOf 返回空串，邻近/残影（adjacent）这一档自然全关，
     *   判定退化为 same / far / unknown 三态 —— 这是有意为之，不是功能缺失。 */
    const DEFAULT_BANDS = Object.freeze([]);
    const DEFAULT_EPSILON = 0.02;          // 同线容差：同 lineId 且变动率差在容差内才算同线
    const DEFAULT_ADJACENT_EPSILON = 0.15; // 邻近容差：同吸引域内「够近」才算残影
    const ADJACENT_POLICIES = Object.freeze(['hold', 'allow', 'block']);
    /* 跨线保留者策略。'none'（默认）= 谁都不许串；'allow' = 名单内可见异线。 */
    const READER_POLICIES = Object.freeze(['none', 'allow']);
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

    /* ---------- 纪元原语（v3.425.0） ----------
     * 【为什么要纪元，而不只用变动率】
     *   酒馆里的记忆是**自动批量生产**的：一轮对话新增几十条，没人会手工给每条标世界线。
     *   于是「变动率」这条主键在真实运行中根本没有输入 —— 我上一版实测过：
     *   真实条目一律无标 ⇒ unknown ⇒ 闸门 undecided ⇒ 召回侧一律放行 ⇒ 形同未设防。
     *   更根本的是，变动率是**模型即兴编的数字**：同一部原作里 0.571024 与 0.571025
     *   天壤之别，而模型可能这轮写 1.13、下轮写 1.9，都叫「β线」。拿它当主键，
     *   等于给一个随机数配精确判据。
     *   酒馆里真正**模型改不动**的是两件东西：
     *     ① 世界线跳跃发生了哪一楼（消息索引是磁盘事实）；
     *     ② 线代号那串字本身（模型会稳定复用「β线」「Steins;Gate 线」）。
     *   故 v3.425.0 把主键从「变动率」改为「**纪元**」：
     *     epoch = 线代号 + 起线楼层。变动率降级为**读数**（仍显示、仍参与邻近判定，
     *     但不再是身份）。同一「β线」内跨纪元 = 两条不同经历 —— 不再靠猜，
     *     而且不再是「判不了所以放行」。
     */

    /** 楼层合法化：非负整数才算楼层；null / 负数 / 非数一律返回 null（**不猜成 0**）。
     *  ★ 0 是合法楼层（第一楼），故不能用 `n || null`（那会把 0 吃掉）。 */
    function normFloor(v) {
        /* ★ [v3.425.0 · 自纠] 这里原本直接 numOr，而 Number(null) === 0、Number('') === 0，
         *   于是**所有没写楼层的条目都被算成 0 楼**。后果不是差一位，是身份判据整体失效：
         *   两条没楼层的不同线都成 `线号@0` ⇒ 纪元相等 ⇒ 判 same-epoch ⇒ 串线放行。
         *   故 null / '' / 布尔 一律判不了（返回 null），只有真数字才收。
         *   反向也要防：0 是**合法楼层**（第 0 楼存在），不能因为 0 falsy 就折成 null。 */
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean') return null;
        const n = (typeof v === 'number') ? v : Number(String(v).trim());
        if (!Number.isFinite(n)) return null;
        const i = Math.floor(n);
        if (i < 0) return null;
        return i;
    }

    /** 纪元键：`线代号@起线楼层`。缺楼层 ⇒ 返回空串（**判不了**，不编一个 0）。 */
    function epochOf(lineId, startFloor) {
        const id = txt(lineId).trim();
        if (!id) return '';
        const f = normFloor(startFloor);
        if (f === null) return '';
        return id + '@' + f;
    }

    /* 层标记归一（★ 去世界观化：不内置任何具体世界的别名）。
     * 只做三件**与世界观无关**的事：
     *   ① 去首尾空白；
     *   ② 剥掉尾部括注（模型爱写「β线（1.130205）」「第二轮（梦）」—— 括注是注解，不是身份）；
     *   ③ 使用者可自备别名表（opts.layerAlias）折叠自己的同义写法。
     * ★ 不再内置「α线 -> alpha」「steins;gate -> sg」这类表：那需要认识具体世界观。
     *   使用者口径「机制都有，都可能」⇒ 内核不许认识任何一个世界，
     *   否则每加一张卡就要改内核。别名一律由配置（opts.layerAlias）给。
     *   opts.layerAlias 形如 { 'α线': 'alpha', '梦一': 'dream1' }；
     *   键匹配时先精确、再忽略大小写；映射目标为空则保留原值（不做半折叠）。 */
    function normLineId(v, opts) {
        const raw = txt(v).trim();
        if (!raw) return '';
        const alias = (opts && opts.layerAlias && typeof opts.layerAlias === 'object') ? opts.layerAlias : null;
        if (alias) {
            if (Object.prototype.hasOwnProperty.call(alias, raw)) {
                const hit = txt(alias[raw]).trim();
                if (hit) return hit;
            }
            const lk = raw.toLowerCase();
            const keys = Object.keys(alias);
            for (let i = 0; i < keys.length; i++) {
                if (keys[i].toLowerCase() === lk) {
                    const to = txt(alias[keys[i]]).trim();
                    if (to) return to;
                }
            }
        }
        let key = raw;
        /* 剥尾部括注：括注是注解不是身份。只在括注不在开头时剥（「(存档)」这种整串括注保留）。 */
        const cut = key.search(/[（(]/);
        if (cut > 0) key = key.slice(0, cut).trim();
        return key || raw;
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
        out.sort(function (a, b) { return a.hi - b.hi; });
        return out;           /* 可能为空：空 = 没有数字分档，判定不依赖它 */
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
        const d = normDivergence(divergence);
        if (!Number.isFinite(d)) return '';
        const bands = bandsOf(opts);
        if (!bands.length) return '';      /* 没有分段就没有「域」这东西，不编一个 */
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
            return {
                ok: false, why: why, lineId: '', divergence: null, attractor: '', label: '',
                startFloor: null, epoch: '',
            };
        };
        try {
            /* ★ [v3.425.0] 字符串 / 数字线标必须能吃。
             *   实测（酒馆真实形态）：AI 写的是 `worldline:'β线'` / `lineId:'beta'`，
             *   旧实现一律 not-object ⇒ unknown ⇒ 闸门放行 —— 等于整道闸对真实数据失效。
             *   字符串线标**没有变动率**：那就不给它编一个默认值（编了就是造一条线），
             *   而是 `divergence = null` + `why = 'no-divergence'` 之外的**可判身份**：
             *   线代号本身足以判「同一条线还是不同线」，变动率只影响「邻近/远」的细分。
             *   故字符串形态 ok:true、divergence:null、attractor:''，relationOf 里按
             *   「同号即同线、不同号且无法测距 ⇒ far」处理（在 relationOf 那侧具名）。 */
            if (typeof raw === 'string' || typeof raw === 'number') {
                const sid = normLineId(raw, opts);
                if (!sid) return bad('no-line-id');
                return {
                    ok: true, why: 'bare-line-id',
                    lineId: sid, divergence: null, attractor: '', label: '',
                    /* 字符串线标不带楼层：epoch 由调用方另给 startFloor（宿主按当前纪元填） */
                    startFloor: normFloor(opts && opts.startFloor),
                    epoch: epochOf(sid, opts && opts.startFloor),
                };
            }
            if (!raw || typeof raw !== 'object') return bad('not-object');
            const rawId = raw.lineId !== undefined ? raw.lineId : (raw.id !== undefined ? raw.id : '');
            const id = normLineId(rawId, opts);
            if (!id) return bad('no-line-id');
            /* ★ 变动率**可以缺席**（字符串线标 / 只写线代号的世界观）。
             *   缺席不代表非法：身份由线代号+纪元定，变动率只用于邻近细分。
             *   保留 `hasDivergence` 让下游能区分「真是 0」与「没写」。 */
            const hasDivergence = (raw.divergence !== undefined && raw.divergence !== null && raw.divergence !== '');
            const dv = hasDivergence ? numOr(raw.divergence, NaN) : NaN;
            if (hasDivergence && !Number.isFinite(dv)) return bad('no-divergence');
            /* ★ [v3.424.1] 不再 clamp01 压平：>1 的变动率（命运石之门 β 线）必须原样保留，
             *   否则 distance 恒 0，「同号超差判不了」在 >1 段永不触发。 */
            const d = hasDivergence ? normDivergence(dv) : null;
            const att = txt(raw.attractor).trim()
                || (d === null ? '' : attractorOf(d, opts));
            /* 起线楼层：条目自带的 startFloor / epochFloor / sinceFloor 三形态都收；
             *   都没有则看 opts.startFloor（宿主按「当前纪元的起线楼」填）。
             *   ★ 楼层是**磁盘事实**，模型改不动 —— 这正是它比变动率可靠的原因。 */
            const sfRaw = (raw.startFloor !== undefined ? raw.startFloor
                : (raw.epochFloor !== undefined ? raw.epochFloor
                    : (raw.sinceFloor !== undefined ? raw.sinceFloor : (opts && opts.startFloor))));
            const sf = normFloor(sfRaw);
            const ep = txt(raw.epoch).trim() || epochOf(id, sf);
            return {
                ok: true, why: 'ok',
                lineId: id, divergence: d, attractor: att, label: txt(raw.label).trim(),
                startFloor: sf, epoch: ep, hasDivergence: hasDivergence,
            };
        } catch (e) {
            return bad('threw');
        }
    }

    /* ---------- 两线关系 ---------- */
    /**
     * 判两条线的关系。四态：same / near / far / unknown。
     * ★ [v3.425.0 · 主键换血] 判定**先看纪元**（线代号+起线楼层），变动率降级为读数。
     *   顺序：① 双 epoch 相等 ⇒ same；② 双 epoch 不等 ⇒ far（同号跨纪元具名
     *   `same-line-id-cross-epoch`，跨号 `cross-line-cross-epoch`）；
     *   ③ 缺 epoch 时线号相同 ⇒ 变动率细分（超容差仍判 unknown）；
     *   ④ 线号不同 ⇒ far（这一格不再用变动率判 NEAR —— 那是拿模型编的数字当证据）。
     * ★ 仍保留 unknown 一档且不可省：同 lineId 却差 0.3 且无楼层时，判 same 会让
     *   两段不同经历互相冒充，判 far 又给了它「已知的远」的假身份。只有 unknown 诚实。
     * ★ `basis` 字段如实标出这一判据靠什么下的（epoch / line-id / divergence），
     *   便于事后追账：靠 divergence 下的结论天然比靠 epoch 的弱。
     *   nea 一档保留：当调用方**显式**给 adjacentEpsilon 并确有变动率时，
     *   由 tagOf 的邻近细分使用（见 adjacentOf）。
     */
    function relationOf(a, b, opts) {
        const A = normalizeLine(a, opts);
        const B = normalizeLine(b, opts);
        if (!A.ok || !B.ok) {
            return {
                relation: RELATION.UNKNOWN,
                why: (!A.ok ? ('a-' + A.why) : ('b-' + B.why)),
                distance: null,
                basis: 'invalid',
            };
        }
        const eps = numOr((opts && opts.epsilon), DEFAULT_EPSILON);
        const epsNear = numOr((opts && opts.adjacentEpsilon), DEFAULT_ADJACENT_EPSILON);
        const bothDiv = Number.isFinite(A.divergence) && Number.isFinite(B.divergence);
        const dist = bothDiv ? Math.abs(A.divergence - B.divergence) : null;
        const distR = dist === null ? null : round2(dist);
        /* ══ 1) 纪元优先：带楼层的身份优先于任何数字 ══
         *   理由：变动率是模型即兴编的，楼层是磁盘事实。两者冲突时信楼层。 */
        if (A.epoch && B.epoch) {
            if (A.epoch === B.epoch) {
                return { relation: RELATION.SAME, why: 'same-epoch', distance: distR, basis: 'epoch' };
            }
            return {
                relation: RELATION.FAR,
                why: A.lineId === B.lineId ? 'same-line-id-cross-epoch' : 'cross-line-cross-epoch',
                distance: distR, basis: 'epoch', epochA: A.epoch, epochB: B.epoch,
            };
        }
        /* ══ 2) 线号相同、纪元不全：先看证据是否对称，再谈变动率 ══ */
        if (A.lineId === B.lineId) {
            /* ★ [v3.426.0 · 仿真自纠] 证据不对称 ⇒ 判不了（**不许判 same**）。
             * 【修前实测】当前 = α线@47（第三纪元），条目 = { worldline:'α线' }（无纪元，
             *   因为它所在楼层早于跳跃表首次登记）。改前走下面那支 `same-line-id-no-divergence`
             *   ⇒ SAME ⇒ native ⇒ 被当成「这一纪元的经历」注入。
             *   这不是「差不多就放行」，而是用条目那句粗线标去冒充一个更细的纪元——
             *   正是本格要防的猜法：**一侧说「α线」，另一侧说「α线@47的α线」，
             *   二者相等只是因为粗的那侧没说是哪一个 α线**。
             * 【为什么落 UNKNOWN 而不是 FAR】缺证据不等于相反证据。判 far 会给出
             *   「已知的远」这个假身份，还可能让保留者以为「记得但被挡了」。
             *   本仓铁律：判不了 ≠ 否。
             * 【代价与出路】这条改动会让「没楼层的旧条目 vs 有纪元的当前」从 native 降为
             *   undecided。recall 口径不变（undecided 仍放行、逐条留证），
             *   但注入侧不再把它当事实。要走严格判定，给条目补 floor，或把首跳登记在第 1 楼。 */
            if (!!A.epoch !== !!B.epoch) {
                return {
                    relation: RELATION.UNKNOWN,
                    why: 'epoch-asymmetry',
                    distance: distR,
                    basis: 'epoch',
                    epochA: A.epoch || '',
                    epochB: B.epoch || '',
                };
            }
            if (!bothDiv) {
                /* 同号但都没变动率：身份相同、距离无据 ⇒ 同线（same）。
                 * 这不是「猜」：线号相等就是同一条线；变动率只回答「这条线内多远」。 */
                return { relation: RELATION.SAME, why: 'same-line-id-no-divergence', distance: null, basis: 'line-id' };
            }
            if (dist <= eps) return { relation: RELATION.SAME, why: 'same-line-id', distance: distR, basis: 'divergence' };
            /* ★ 同号超差：**判不了**（不猜同线、也不给它「已知的远」的假身份）。
             *   但 v3.425.0 起这一格有救了：只要有楼层就能走上面 epoch 分支判 far。 */
            return { relation: RELATION.UNKNOWN, why: 'same-line-id-divergence-gap', distance: distR, basis: 'divergence' };
        }
        /* ══ 2.5) 残影/预感：**只有调用方显式配了数字分段**才谈得上「同域够近」。══
         *   ★ [v3.425.0 · 自纠] p3 那一版把这里写成「线号不同一律 far」，理由是
         *     「不能拿模型编的变动率当证据」—— 理由成立，但顺手把残影档整个删了：
         *     实测 tagOf 永远回不到 ADJACENT，四态里有一态是**死态**。
         *   现在改成有条件成立：两线都有 attractor（即调用方给了 opts.bands）、
         *     同域、确有变动率、距离在 adjacentEpsilon 内 ⇒ NEAR。
         *   没有 bands ⇒ attractor 皆空 ⇒ 这一档自动关闭。
         *   这样数字编号仍是**可选**能力，而残影功能本身还在。 */
        if (A.attractor && B.attractor && A.attractor === B.attractor && bothDiv && dist <= epsNear) {
            return { relation: RELATION.NEAR, why: 'same-attractor-near', distance: distR, basis: 'divergence' };
        }
        /* ══ 3) 线号不同 ⇒ 不同线（不依赖数字，这个判断是硬的）══
         *   ★ 与旧版的实质差别：旧版在这里会因「同吸引域且够近」判 NEAR（残影/预感），
         *     而「够近」用的是模型编的变动率。v3.425.0 不再拿它当证据：
         *     不同线号就是不同线 ⇒ far。变动率只决定「远到什么程度」的读数。 */
        return {
            relation: RELATION.FAR,
            why: 'cross-line',
            distance: distR, basis: 'line-id',
        };
    }

    /* ---------- 纪元推断（v3.425.0） ---------- */
    /**
     * 从「世界线跳跃登记表」反推某一楼属于哪个纪元。
     *   jumps: [{ floor, lineId, divergence }] —— 每次跳跃发生在其后第一条消息的楼层。
     *   ★ 这是本模块唯一允许「按楼层推身份」的地方，且**只用于本来就无标的条目**
     *     （条目自带 epoch 时以条目为准，不从楼层推）。
     * 返回 { epoch, lineId, divergence, startFloor, why }：
     *   why = 'own-jump'（该楼就是某次跳跃的起线楼）/ 'carried'（从上次跳跃沿用）
     *        / 'no-jump-before'（此楼之前无跳跃登记）/ 'bad-floor'。
     * ★ 无跳跃登记时**不猜**：返回 why='no-jump-before'、epoch 为空 ⇒ 上层落 unknown。
     */
    function epochAt(floor, jumps, opts) {
        const f = normFloor(floor);
        if (f === null) return { epoch: '', lineId: '', divergence: null, startFloor: null, why: 'bad-floor' };
        const list = Array.isArray(jumps) ? jumps : [];
        let best = null;
        for (let i = 0; i < list.length; i++) {
            const j = list[i];
            if (!j || typeof j !== 'object') continue;
            const jf = normFloor(j.floor);
            if (jf === null) continue;
            if (jf > f) continue;                       /* 未来的跳跃不属于这一楼 */
            if (!best || jf > best.floor) best = { floor: jf, rec: j };
        }
        if (!best) return { epoch: '', lineId: '', divergence: null, startFloor: null, why: 'no-jump-before' };
        const id = normLineId(best.rec.lineId !== undefined ? best.rec.lineId : best.rec.id, opts);
        if (!id) return { epoch: '', lineId: '', divergence: null, startFloor: null, why: 'jump-without-line-id' };
        const dv = (best.rec.divergence === undefined || best.rec.divergence === null)
            ? null : normDivergence(best.rec.divergence);
        return {
            epoch: epochOf(id, best.floor), lineId: id,
            divergence: (dv !== null && Number.isFinite(dv)) ? dv : null,
            startFloor: best.floor,
            why: best.floor === f ? 'own-jump' : 'carried',
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
                return { state: LINE_STATE.UNKNOWN, why: 'no-entry', relation: '', distance: null, basis: 'invalid' };
            }
            /* ★ [v3.425.0] 判定身份的两条路，**先看纪元再看线标**：
             *   ① 条目自带 epoch（stamp 过的 / 抽取时写入的）→ 直接用；
             *   ② 条目只有 floor（真实记忆条目普遍如此）→ 从跳跃登记表反推纪元；
             *   ③ 条目有 worldline/originLine/lineId 线标 → 走线标（可能是字符串形态）；
             *   ④ 都没有 → unknown（这一档现在才是真的「判不了」）。 */
            let mark = null;
            let ownEpoch = txt(entry.epoch).trim();
            let startFloor = (entry.startFloor !== undefined ? normFloor(entry.startFloor)
                : (entry.epochFloor !== undefined ? normFloor(entry.epochFloor)
                    : (entry.sinceFloor !== undefined ? normFloor(entry.sinceFloor) : null)));
            for (let i = 0; i < MARK_FIELDS.length; i++) {
                const f = MARK_FIELDS[i];
                if (entry[f] !== undefined && entry[f] !== null && entry[f] !== '') { mark = entry[f]; break; }
            }
            /* ② 只要条目带楼层，就用楼层反推纪元（**无论它有没有线标**）。
             *   ★ [v3.425.0 · 自纠 第四处] 原条件是 `mark === null` 才反推，而酒馆真实条目
             *   恰恰是 { worldline:'梦境二层', floor:70 } —— 有标也有楼层。于是反推永不发生，
             *   纪元只能由 relationOf 从 opts.startFloor 兜底补；而那个值是 **当前**纪元的
             *   起线楼（guard 按 curOpts 注入）⇒ 每一条都变成当前纪元 ⇒ 纪元恒相等 ⇒
             *   「同号跨纪元不串」在真实数据上**永不触发**。
             *   实测（探针）：当前 现实@45，第 1 楼标「现实」的旧纪元记忆被判 same-epoch 放行。
             *   楼层是磁盘事实：有楼层就必须用它把纪元钉准。 */
            const expFloor = (entry.floor !== undefined ? entry.floor
                : (entry.msgIndex !== undefined ? entry.msgIndex : entry.index));
            let floorConflict = '';
            if (!ownEpoch && startFloor === null
                && expFloor !== undefined && expFloor !== null) {
                const jumps = (opts && Array.isArray(opts.jumps)) ? opts.jumps
                    : ((current && Array.isArray(current.jumps)) ? current.jumps : []);
                if (jumps.length) {
                    const at = epochAt(expFloor, jumps, opts);
                    if (at.epoch) {
                        ownEpoch = at.epoch;
                        startFloor = at.startFloor;
                        /* 自带线标与楼层反推不一致 ⇒ 记矛盾（楼层优先，但不静默） */
                        if (mark !== null && typeof mark !== 'object'
                            && normLineId(mark, opts) !== at.lineId) {
                            floorConflict = 'epoch-floor-conflict';
                        }
                        mark = {
                            lineId: at.lineId,
                            divergence: (mark && typeof mark === 'object'
                                ? mark.divergence : entry.divergence),
                            startFloor: at.startFloor,
                        };
                    }
                }
            }
            if (mark === null && !ownEpoch) {
                return { state: LINE_STATE.UNKNOWN, why: 'no-line-mark', relation: '', distance: null, basis: 'none' };
            }
            /* ③ 有纪元但线标不成形（无标 / 只有一个名字）：把纪元拆回 {lineId, startFloor}
             *   ★ 原来只接 `mark === null`，于是 entry.epoch 与 entry.worldline 同时存在时，
             *     线标串带不了楼层 ⇒ A.epoch 为空 ⇒ relationOf 走不到 epoch 分支。 */
            if (ownEpoch && (mark === null || typeof mark !== 'object')) {
                const at = ownEpoch.lastIndexOf('@');
                mark = {
                    lineId: at > 0 ? ownEpoch.slice(0, at) : ownEpoch,
                    startFloor: at > 0 ? normFloor(ownEpoch.slice(at + 1)) : startFloor,
                    divergence: (entry.divergence === undefined ? null : entry.divergence),
                };
            } else if (mark && typeof mark === 'object' && startFloor !== null && mark.startFloor === undefined) {
                /* 线标是对象但没有楼层：补上条目自己的楼层，让纪元能成立 */
                mark = Object.assign({}, mark, { startFloor: startFloor });
            } else if (typeof mark === 'string' || typeof mark === 'number') {
                /* 字符串线标 + 条目带楼层：纪元可成立（这是酒馆里最常见的组合） */
                if (startFloor !== null) mark = { lineId: mark, startFloor: startFloor, divergence: entry.divergence };
            }
            /* ★ [v3.425.0 · 自纠] 条目侧判定**不能吃** opts.startFloor：
             *   那个值是 guard 注入的「当前纪元起线楼」，专给当前线的字符串形态兜底用。
             *   若一并传给条目，normalizeLine 会把它当「条目自带起线楼」，
             *   于是每条都变成当前纪元。当前线不受影响：
             *   current 自带 startFloor 字段（非 undefined 就不走 fallback）。 */
            const itemOpts = Object.assign({}, opts);
            delete itemOpts.startFloor;
            const rel = relationOf(mark, current, itemOpts);
            let st = LINE_STATE.UNKNOWN;
            if (rel.relation === RELATION.SAME) st = LINE_STATE.NATIVE;
            else if (rel.relation === RELATION.NEAR) st = LINE_STATE.ADJACENT;
            else if (rel.relation === RELATION.FAR) st = LINE_STATE.FOREIGN;
            /* ★ [v3.425.0 · 自纠] 条目所在纪元必须**自己算**，不能向 relationOf 借：
             *   ① relationOf(mark, current) 里 epochA 才是条目、epochB 是当前，取 epochB 是反的；
             *   ② 且 relationOf 只在「双纪元不等」那支才回填纪元字段，same-epoch 分支返回空 ⇒
             *      futureEpochOf 恒 false ⇒ 防全知闸失效（实测：保留者拿到了未来纪元记忆）。
             *   这里独立算：条目纪元 = epochOf(线代号归一, 起线楼层)。
             *   算不出（缺楼层或缺线号）就留空 ⇒ futureEpochOf 返回 false（无证据不阻断），
             *   但那种条目本来就会落 unknown，不会冒充 native。 */
            let ownEp = ownEpoch;
            if (!ownEp && mark && typeof mark === 'object') {
                const mid = normLineId(mark.lineId !== undefined ? mark.lineId : mark.id, opts);
                const msf = normFloor(mark.startFloor);
                if (mid && msf !== null) ownEp = epochOf(mid, msf);
            }
            return {
                state: st, why: rel.why, relation: rel.relation, distance: rel.distance,
                basis: rel.basis || '', epoch: ownEp,
                /* 线标与楼层反推矛盾时另存原因（why 只能报一个，但此事要可查） */
                floorConflict: floorConflict,
            };
        } catch (e) {
            return { state: LINE_STATE.UNKNOWN, why: 'threw', relation: '', distance: null, basis: 'threw' };
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

    /**
     * 判一条记忆是否属于**未来纪元**（起线楼层晚于当前纪元起线楼）。
     * ★ 这是「防全知」的第二道闸：跨线保留者(Reading Steiner)记得的是**已经历过**的
     *   别的世界线，不是「还没发生的世界线」。若不做这一格，把任意角色设成保留者
     *   就等于给他剧透权限 —— 那比「串线」更破坏体验。
     * ★ 判不了（任一侧无楼层）时返回 false：不因缺证据就阻断，
     *   但也不假装已知 —— 缺楼层的情形会落 unknown/undecided，由策略决定。
     */
    function futureEpochOf(tag, cur) {
        try {
            if (!tag || !cur || !cur.ok) return false;
            const curFloor = normFloor(cur.startFloor);
            if (curFloor === null) return false;
            const ep = txt(tag.epoch).trim();
            if (!ep) return false;
            const at = ep.lastIndexOf('@');
            if (at <= 0) return false;
            const f = normFloor(ep.slice(at + 1));
            if (f === null) return false;
            return f > curFloor;
        } catch (e) { return false; }
    }

    /** 单条分档（显式表，不用 if 链兜底：四态 × 保留者特征 × 三策略 = 可穷举）。 */
    function decideGate(state, isReader, policy, readerPolicy) {
        if (state === LINE_STATE.NATIVE) return GATE.KEPT;
        if (state === LINE_STATE.UNKNOWN) return GATE.UNDECIDED;   // 谁都不猜：判不了就是判不了
        /* ★ [v3.425.0] 跨线保留者特权**默认关闭**。
         *   用户口径：「他们不应该知道自己在其他世界线经历的」—— 那把异线记忆放给
         *   「保留者」，串的角色只是从配角换成了主角，问题没解决只是换了人。
         *   故默认 readerPolicy='none'：**任何人**的异纪元记忆一律 blocked。
         *   只有显式配 'allow' 时才恢复旧行为（给确实要写保留者题材的卡留个开关，
         *   但默认不生效，且有判据钉住默认值）。 */
        const rp = txt(readerPolicy).trim() || 'none';
        if (isReader && rp === 'allow') return GATE.KEPT;          // 显式开启才放行（并带 lineState 标注）
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
            /* ★ [v3.425.0] future 得声明：它不进 total 口径（不是桶），但
             *   「被未来纪元挡下几条」是诊断面要回答的事。不声明就是
             *   undefined，读数面把它当「没这回事」—— 与「确实没挡」同形。 */
            counts: { total: 0, kept: 0, held: 0, blocked: 0, undecided: 0, malformed: 0, truncated: 0, future: 0 },
            byState: { native: 0, adjacent: 0, foreign: 0, unknown: 0 },
            kept: [], held: [], blocked: [], undecided: [],
            why: [],
        };
        try {
            /* ★ [v3.425.0] 当前线的 epoch 是判定的另一半：没有它，
             *   「同号跨纪元」这一格就退化成「判不了」。故这里显式把 startFloor 拿全。 */
            const stateObj = (state && typeof state === 'object') ? state : {};
            const curOpts = Object.assign({}, opts);
            if (curOpts.startFloor === undefined) {
                const sfTry = (stateObj.current && typeof stateObj.current === 'object' && stateObj.current.startFloor !== undefined)
                    ? stateObj.current.startFloor : stateObj.startFloor;
                if (sfTry !== undefined) curOpts.startFloor = sfTry;
            }
            if (!curOpts.jumps && Array.isArray(stateObj.jumps)) curOpts.jumps = stateObj.jumps;
            const cur = normalizeLine(state && state.current ? state.current : state, curOpts);
            out.current = cur.ok
                ? {
                    lineId: cur.lineId, divergence: cur.divergence, attractor: cur.attractor,
                    label: cur.label, startFloor: cur.startFloor, epoch: cur.epoch,
                }
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
            /* ★ [v3.425.0] 保留者特权开关（默认 none）。非法值一律折回 none ——
             *   这一格的默认方向必须是「不许串」，写错一个词不能变成「全放行」。 */
            let readerPolicy = txt((opts && opts.readerPolicy) || (state && state.readerPolicy) || 'none').trim();
            if (READER_POLICIES.indexOf(readerPolicy) < 0) {
                out.why.push('reader-policy-illegal-fallback-none');
                readerPolicy = 'none';
            }
            out.readerPolicy = readerPolicy;

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
                const t = tagOf(it, cur.ok ? cur : null, curOpts);
                /* ★ [v3.425.0 · 防全知] 未来纪元不得当事实 —— 对**任何角色**都不行，
                 *   包括跨线保留者。保留者记得的是「已经历过的别的线」，不是「还没到的线」。
                 *   这一格实质是剧透闸：epoch 的起线楼层晚于当前起线楼 ⇒ 那是未来的记忆。 */
                const fut = futureEpochOf(t, cur);
                const effState = fut ? LINE_STATE.FOREIGN : t.state;
                const g = decideGate(effState, isReader && !fut, policy, readerPolicy);
                out.byState[effState] = (out.byState[effState] || 0) + 1;
                if (fut) out.counts.future = (out.counts.future || 0) + 1;
                const row = {
                    key: txt(it.id !== undefined ? it.id : (it.key !== undefined ? it.key : '')),
                    state: effState, gate: g, why: fut ? 'future-epoch' : t.why,
                    distance: t.distance, basis: t.basis || '', epoch: t.epoch || '',
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
            /* ★ [v3.425.0 · 去世界观化基线] 内核不许认识任何具体世界。 */
            push('内核零世界观预设',
                DEFAULT_BANDS.length === 0 && READER_POLICIES.indexOf('none') >= 0 && READER_POLICIES.length === 2,
                'bands=' + DEFAULT_BANDS.length + '/readerPolicies=' + READER_POLICIES.join(','));
            /* ★ 楼层原语：0 是合法楼层，null/''/布尔 判不了（不许吃成 0）。 */
            push('楼层合法化不吞 null',
                normFloor(0) === 0 && normFloor(null) === null && normFloor('') === null
                && normFloor(undefined) === null && normFloor(true) === null && normFloor('12') === 12,
                [normFloor(0), normFloor(null), normFloor(''), normFloor(true), normFloor('12')].join('/'));

            const L1 = { lineId: 'A', divergence: 0.2 };
            const L2 = { lineId: 'B', divergence: 0.25 };
            const L3 = { lineId: 'C', divergence: 0.9 };
            /* 显式分段（「数字编号是可选能力」的取证样本：给了 bands 才谈得上吸引域） */
            const bandsOpt = { bands: [{ name: 'lo', hi: 0.5 }, { name: 'hi', hi: 1e9 }] };

            /* 1 四态穷尽互斥：四条样本各落一态。
             *   adjacent 现在**必须**显式给 bands 才可达（同域 + 够近），
             *   没有 bands 时它与 foreign 同形 —— 这是有意为之，不是死态。 */
            const s1 = tagOf({ worldline: L1 }, L1).state;
            const s2 = tagOf({ worldline: { lineId: 'B', divergence: 0.21 } }, L1, bandsOpt).state;
            const s3 = tagOf({ worldline: L3 }, L1).state;
            const s4 = tagOf({ text: 'no mark' }, L1).state;
            push('四态穷尽互斥',
                s1 === LINE_STATE.NATIVE && s2 === LINE_STATE.ADJACENT
                && s3 === LINE_STATE.FOREIGN && s4 === LINE_STATE.UNKNOWN,
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
            /* ★ 分段显式给：本版无预设，不给 bands 时 attractor 为空
             *   ⇒ 「没有当前域」与「域不匹配」会同形，三态验不出来。 */
            const st = {
                current: L1,
                convergences: [{ key: 'k1', scope: 'all' }, { key: 'k2', scope: ['hi'] }],
            };
            const c1 = convergenceOf('k1', st, bandsOpt).state;
            const c2 = convergenceOf('k2', st, bandsOpt).state;
            const c3 = convergenceOf('k3', st, bandsOpt).state;
            push('收束三态不同形',
                c1 === CONVERGE.YES && c2 === CONVERGE.NO && c3 === CONVERGE.UNREGISTERED,
                c1 + '/' + c2 + '/' + c3);

            /* 6 ★ [v3.425.0] 跨线保留者特权**默认关闭**：
             *   既然「谁都不该知道自己别条线的经历」，那给名单内放行本身就是串。
             *   名单内默认也必须挡；只有显式 readerPolicy='allow' 才放行（且带标注）。
             *   非法值一律折回 none —— 写错一个词不能变成全放行。 */
            const g1 = guard([{ id: 'x', worldline: L3 }], '甲', { current: L1, readers: ['乙'] });
            const g2 = guard([{ id: 'x', worldline: L3 }], '乙', { current: L1, readers: ['乙'] });
            const g3 = guard([{ id: 'x', worldline: L3 }], '乙',
                { current: L1, readers: ['乙'], readerPolicy: 'allowll' });
            push('名单外必挡',
                g1.counts.blocked === 1 && g1.reader === false,
                JSON.stringify(g1.counts));
            push('名单内默认也挡',
                g2.counts.blocked === 1 && g2.reader === true && g2.readerPolicy === 'none',
                JSON.stringify(g2.counts) + '/rp=' + g2.readerPolicy);
            push('保留者策略非法值折回 none',
                g3.counts.blocked === 1 && g3.readerPolicy === 'none'
                && g3.why.indexOf('reader-policy-illegal-fallback-none') >= 0,
                JSON.stringify(g3.counts) + '/why=' + g3.why.join(','));
            const g4 = guard([{ id: 'x', worldline: L3 }], '乙',
                { current: L1, readers: ['乙'], readerPolicy: 'allow' });
            push('显式 allow 才放行并带标注',
                g4.counts.kept === 1 && g4.reader === true && g4.byState.foreign === 1,
                JSON.stringify(g4.counts));

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

            /* ══ 纪元判据（v3.425.0 主键换血）══
             * 11 纪元优先于变动率：同线号、变动率相同、起线楼层不同 ⇒ far 不是 same。 */
            const epA = { lineId: 'A', divergence: 0.2, startFloor: 10 };
            const epB = { lineId: 'A', divergence: 0.2, startFloor: 60 };
            const epRel = relationOf(epA, epB);
            push('纪元优先于变动率',
                epRel.relation === RELATION.FAR && epRel.why === 'same-line-id-cross-epoch' && epRel.basis === 'epoch',
                epRel.relation + '/' + epRel.why + '/' + epRel.basis);

            /* 12 同号跨纪元真跑闸门：当前在 A@60，A@10 的同号旧记忆必须被挡。 */
            const epGate = guard([{ id: 'old', text: 'v', worldline: 'A', startFloor: 10 }], '',
                { current: { lineId: 'A', startFloor: 60 } });
            push('同号跨纪元不串',
                epGate.counts.blocked === 1 && epGate.blocked[0].why === 'same-line-id-cross-epoch',
                JSON.stringify(epGate.counts) + '/why=' + (epGate.blocked[0] || {}).why);

            /* 13 未来纪元：起线楼层更晚的记忆对**任何角色**都不可见（含保留者 + allow）。 */
            const futItem = [{ id: 'fut', text: 'v', worldline: 'A', startFloor: 90 }];
            const futState = { current: { lineId: 'A', startFloor: 60 }, readers: ['乙'], readerPolicy: 'allow' };
            const futGate = guard(futItem, '乙', futState);
            push('未来纪元对保留者也挡',
                futGate.counts.blocked === 1 && futGate.blocked[0].why === 'future-epoch'
                && futGate.counts.future === 1,
                JSON.stringify(futGate.counts) + '/why=' + (futGate.blocked[0] || {}).why);

            /* 14 epochAt：从跳跃表反推，且**无跳跃不猜**。 */
            const jp = [{ floor: 1, lineId: 'A' }, { floor: 40, lineId: 'B' }, { floor: 80, lineId: 'A' }];
            const at30 = epochAt(30, jp);
            const at80 = epochAt(80, jp);
            const at0 = epochAt(0, jp);
            push('epochAt 反推纪元',
                at30.epoch === 'A@1' && at30.why === 'carried' && at80.epoch === 'A@80' && at80.why === 'own-jump',
                at30.epoch + '/' + at30.why + '|' + at80.epoch + '/' + at80.why);
            push('epochAt 无跳跃不猜',
                at0.epoch === '' && at0.why === 'no-jump-before',
                at0.epoch + '/' + at0.why);

            /* 15 只有楼层、没有线标的条目：可从跳跃表反推身份（酒馆真实形态）。 */
            const flTag = tagOf({ id: 'x', floor: 50 }, normalizeLine({ lineId: 'B', startFloor: 40 }), { jumps: jp });
            push('无标条目按楼层反推',
                flTag.state === LINE_STATE.NATIVE && flTag.epoch === 'B@40',
                flTag.state + '/' + flTag.why + '/epoch=' + flTag.epoch);

            /* 16 别名表完全由配置给（内核零内置）。 */
            const aliased = normalizeLine({ lineId: '\uff21\u7ebf', startFloor: 5 }, { layerAlias: { '\uff21\u7ebf': 'layerA' } });
            const noAlias = normalizeLine({ lineId: '\uff21\u7ebf', startFloor: 5 });
            push('别名由配置提供',
                aliased.lineId === 'layerA' && aliased.epoch === 'layerA@5' && noAlias.lineId !== 'layerA',
                aliased.lineId + '/' + aliased.epoch + '|raw=' + noAlias.lineId);

            /* 17 没有 bands 时数字编号完全不参与：attractor 空，残影档关闭。 */
            push('无分段则数字不参与',
                attractorOf(0.2) === '' && bandsOf({}).length === 0
                && relationOf({ lineId: 'A', divergence: 0.2 }, { lineId: 'B', divergence: 0.21 }).relation === RELATION.FAR,
                'attractor=' + JSON.stringify(attractorOf(0.2)));
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
        DEFAULT_BANDS, DEFAULT_EPSILON, DEFAULT_ADJACENT_EPSILON, ADJACENT_POLICIES,
        READER_POLICIES, MARK_FIELDS, MAX_ENTRIES,
        numOr, normName, pct, clamp01, normDivergence,
        /* ★ [v3.425.0] 纪元原语必须导出：宿主侧要自己算「当前在哪个纪元」
         *   以及「这一条属于哪个纪元」，否则内核判得再对，运行时拿不到输入。
         *   上一版实测 `W.epochAt is not a function` 就是这个洞：函数存在、
         *   判据也过，但不在冻结对象里 —— 外部一律调不到。 */
        normFloor, epochOf, epochAt, futureEpochOf, normLineId,
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
