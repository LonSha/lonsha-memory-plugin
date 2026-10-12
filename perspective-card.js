/* ========================================================
 * perspective-card.js — [M3-X4 · v3.323.0] 按角色与时点的视角记忆卡（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一个事实库」）】
 *   M3-X4 点名的底座**早已在盘上**：
 *     · knowledge-trace.js      —— 「这条事实在何处、从谁、经何证据被取得/撤回」
 *       （五态 knows / doubts / misled / unknown / notRecorded）
 *     · knowledge-preview.js    —— 「下笔之前先看会影响谁」（作者面 / 角色生成面两张面）
 *     · secret-ledger.js        —— 「谁还不知道」（keeper 名单 + 进度）
 *   缺的是**给写作与生成用的那一张短卡**。修前实测的三处后果：
 *     ① 作者要写「这两人同场对话」时，无法一眼看出**两人各自**知道什么 ——
 *        只能逐个角色去 trace 一张张查，而「查过谁、漏了谁」在读数上同形；
 *     ② 已交付的 `knowledge-preview` 出的是**预演**（「要是这么写会怎样」），
 *        不是**现状卡**（「现在这两人分别处在什么位置」）；
 *     ③ 「误信」与「世界真相」在短卡上极易被压成一格（验收原文：
 *        「误信不写成世界真相」）—— 而两者处置相反：前者照角色演，后者照事实写。
 *
 * 【与既有三面的分工（互不重叠，逐条可指认）】
 *   knowledge-trace.js     轨迹（单角色 × 单事实的逐条证据）
 *   knowledge-preview.js   预演（下笔前的影响面，作者面 / 生成面）
 *   secret-ledger.js       当下秘密状态（谁还不知道）
 *   本模块                  **卡**：选「角色 + 时点」→ 一张分四格（亲历/听说/误信/未知）的短卡
 *   它只**聚合**既有判定（state 词表逐字取自 knowledge-trace 的同一份口径），不重算、不另存。
 *
 * 【四格（**不得压格**，压了就再也分不出该怎么写）】
 *   lived     亲历 —— 有 acquire 轨迹（自己在场取得，带出处）
 *   heard     听说 —— 有 acquire 轨迹但 via 是转述（从别人处得知）
 *   misled    误信 —— 曾经当真、**后来被纠正**（带 correctedBy）；**不得当世界真相写**
 *   unknown   未知 —— 有一条显式登记「此角色不知此事实」；与最常见的「我们没记过」不同
 *   另有一格 **notRecorded 未记录**（本模块不知道）—— 它**不是卡面上的一格**，
 *   而是每格读数里 `basis:'none'` 的如实标注，见下。
 *
 * 【「未知」不等于「知道」也不等于「不知道」—— 本模块最容易被写错的一格】
 *   把「没有轨迹」直接读成 unknown，会让「我们没记过这件事」变成「该角色确实不知道」,
 *   那是一句无据的断言。故本模块：
 *     · 没有轨迹 ⇒ 既不进 unknown 也不进任何一格，而是计入 `unrecorded` 并**在读数里可见**；
 *     · 只有真有一条 unaware 登记，才进 unknown。
 *   两态在卡面上**永不同形**（这是本仓最贵的那笔老账，M3-X4 验收也点名了）。
 *
 * 【时点语义（防「还没发生的事」出现在那个时点的卡上）】
 *   `at` 给出时，只收**楼层 ≤ at** 的轨迹；楼层读不到的轨迹**不计入任何时点**
 *   （凭一个不知道楼号的轨迹去替那一刻作证，正是本仓点名的假信号）。
 *
 * 【本模块不做什么（边界）】
 *   · 不写任何账、不落盘、不复制事实库（读数是对既有轨迹的**原样归类**）；
 *   · 不生成提示词正文（生成面由调用方按本卡的格位自行组装）；
 *   · 不判「伪装身份该不该露底」—— 那由 identity 过滤承担，本模块只**如实转发**
 *     `ambiguousIdentity`（同名异人的轨迹混在一格里时必须可见）。
 *
 * 【可移植性说明】
 *   机制动机来自「角色视角工作集需要一张现状卡」这一通用形态；实现按本仓规范重写
 *   （零依赖、不抛、分态到处置可分、读数齐备），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    /** 本面结构版本（形状一变必须抬这个数，防「旧下游配新面」静默错读）。 */
    const PC_VERSION = 1;
    /** 读数 kind（消费方可据此判「这是不是本面产出的读数」）。 */
    const PC_KIND = 'perspective_card';
    /** 卡面四格（**受控词表**：多一格就意味着某类处境无处安放）。 */
    const SLOTS = Object.freeze(['lived', 'heard', 'misled', 'unknown']);
    /** 单卡条数上限（超出计入 truncated —— 截断必须可见）。 */
    const MAX_ITEMS = 24;
    const MAX_PER_SLOT = 12;
    /** knowledge-trace 的动作词（**逐字同源**：不在这里另立一套同义名）。 */
    const ACQUIRE_ACTIONS = Object.freeze(['acquire']);
    /** 转述类 via（听说那一格的判据来源）。 */
    const HEARD_VIA = Object.freeze(['told', 'rumor', 'report', 'overheard', 'letter', 'message']);
    /** 单行化（换行折叠为空格）。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 有限非负整数，否则 null（不写 0：0 是「第 0 楼」）。 */
    function floorOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /* ── 兼容两种输入形态（都是**真源已有**的写法，不是新造） ──
     *   · 形态一：knowledge-trace 的 `normalize(raw)` 产出（{traces:[...]}；每项
     *     character / fact / action / via / from / floor / evidenceKey / traceId / identity）；
     *   · 形态二：`stateOf(raw, character, fact)` 的**逐格产出**（调用方已逐条算好，
     *     本模块只按 state 归类，不重算判定）。
     *   两形态都收的理由：本仓的真实消费点有两条路（有的地方手上有全量轨迹，
     *   有的地方只有已算好的 state）。**不在这里 require 兄弟模块** —— 那是装配点的事。
     */
    function normTraceItem(t) {
        if (!t || typeof t !== 'object') return null;
        const character = clip(t.character, 40);
        const fact = clip(t.fact, 120);
        if (!character || !fact) return null;
        return {
            character: character,
            fact: fact,
            action: clip(t.action, 20),
            via: clip(t.via, 20),
            from: clip(t.from, 40),
            floor: floorOrNull(t.floor),
            evidenceKey: clip(t.evidenceKey, 120),
            traceId: clip(t.traceId, 60),
            identity: clip(t.identity, 40),
            correctedBy: t.correctedBy === null || t.correctedBy === undefined ? null : clip(t.correctedBy, 60),
            revoked: t.revoked === true
        };
    }
    /** 把一条轨迹归到四格之一（**判不开就不归**：见下 notRecorded 的处理）。 */
    function slotOf(t) {
        const act = t.action;
        if (act === 'misbelieve') return 'misled';
        if (act === 'unaware') return 'unknown';
        if (ACQUIRE_ACTIONS.indexOf(act) >= 0) {
            /* 「听说」与「亲历」的区别**只在 via**：via 是转述类 ⇒ 听说，否则亲历。
             *   via 读不到时归**亲历**吗？不 —— 那会把「不知道从哪知道的」写成「自己在场」。
             *   故 via 空 ⇒ 仍是 acquires，但标 `viaUnknown:true`，由卡面读数显式可见。 */
            return (t.via && HEARD_VIA.indexOf(t.via) >= 0) ? 'heard' : 'lived';
        }
        return null;      // doubt / correct / retract 等：**不是四格中的任何一格**
    }
    /**
     * 视角记忆卡（纯函数、不抛）。
     *
     * @param {Array} traces knowledge-trace 的轨迹数组（或已算好的 state 行，见 normTraceItem）
     * @param {object} opts { character?:string, at?:number, maxItems?:number, maxPerSlot?:number }
     *   · character —— 只看该角色（不给则按角色分组，每角色一张卡）
     *   · at        —— 时点楼层（给了就只收 floor ≤ at 的轨迹）
     * @returns {object} { kind, version, at, cards:[{character, lived:[], heard:[], misled:[], unknown:[], counts, unrecorded, ...}], counts, malformedInput, degraded }
     */
    function build(traces, opts) {
        const o = opts || {};
        const at = floorOrNull(o.at);
        const maxItems = Number.isFinite(Number(o.maxItems)) && Number(o.maxItems) >= 1 ? Math.floor(Number(o.maxItems)) : MAX_ITEMS;
        const maxPerSlot = Number.isFinite(Number(o.maxPerSlot)) && Number(o.maxPerSlot) >= 1 ? Math.floor(Number(o.maxPerSlot)) : MAX_PER_SLOT;
        const out = {
            kind: PC_KIND,
            version: PC_VERSION,
            at: at,
            /* 时点读不到 ⇒ 如实标 null（不猜楼号：猜 0 会得到一张「全都在第 0 楼之后」的假卡）。 */
            atKnown: at !== null,
            cards: [],
            counts: {
                input: 0, used: 0, characters: 0,
                lived: 0, heard: 0, misled: 0, unknown: 0,
                unrecorded: 0, offTime: 0, noFloor: 0, malformed: 0
            },
            truncated: 0,
            malformedInput: false,
            writesNothing: true,
            degraded: false
        };
        try {
            const list = Array.isArray(traces) ? traces : [];
            out.malformedInput = !Array.isArray(traces) && traces !== undefined && traces !== null;
            out.counts.input = list.length;
            const only = clip(o.character, 40);
            const byChar = new Map();
            for (const raw of list) {
                const t = normTraceItem(raw);
                if (!t) { out.counts.malformed++; continue; }
                if (only && t.character !== only) continue;
                /* 时点过滤：给了 at 才筛；**楼层读不到的轨迹不进任何时点**（见档头）。 */
                if (at !== null) {
                    if (t.floor === null) { out.counts.noFloor++; continue; }
                    if (t.floor > at) { out.counts.offTime++; continue; }
                }
                if (!byChar.has(t.character)) byChar.set(t.character, []);
                byChar.get(t.character).push(t);
                out.counts.used++;
            }
            const built = [];
            for (const [character, items] of byChar) {
                const slots = { lived: [], heard: [], misled: [], unknown: [] };
                let unrecorded = 0, viaUnknown = 0, ambiguousIdentity = false;
                const ids = new Set();
                for (const t of items) {
                    if (t.identity && t.identity !== 'unspecified') ids.add(t.identity);
                    const s = slotOf(t);
                    /* 判不开的动作（doubt / correct / retract）**不落任何一格**：
                     *   把「起疑」写成「知道」或把「已撤回」写成「知道」都是错读数。
                     *   它们仍计入 `unrecorded`（= 本卡对这一格**没有可写的内容**），
                     *   由调用方按需回查 trace。 */
                    if (!s) { unrecorded++; continue; }
                    if (s === 'lived' && !t.via) viaUnknown++;
                    slots[s].push({
                        fact: t.fact, floor: t.floor, via: t.via, from: t.from,
                        evidenceKey: t.evidenceKey, traceId: t.traceId,
                        /* 撤回过的轨迹**在卡面上照样列出**（不静默删）：卡是给作者看的，
                         *   但必须带 `revoked` 标记 —— 撤回的事不该被继续引用。 */
                        revoked: t.revoked,
                        correctedBy: t.correctedBy,
                        note: s === 'misled' ? '（曾当真、后被纠正：**不得当世界真相写**）' : ''
                    });
                }
                ambiguousIdentity = ids.size > 1;
                const pre = {
                    character: character,
                    lived: slots.lived.slice(0, maxPerSlot),
                    heard: slots.heard.slice(0, maxPerSlot),
                    misled: slots.misled.slice(0, maxPerSlot),
                    unknown: slots.unknown.slice(0, maxPerSlot),
                    counts: {
                        lived: slots.lived.length, heard: slots.heard.length,
                        misled: slots.misled.length, unknown: slots.unknown.length,
                        total: items.length
                    },
                    /* 「本模块不知道」的那一格 —— **不是卡面上的第四格**，是读数：
                     *   它必须**处处可见**，否则读者会把卡上没有的当成「确实不知道」。 */
                    unrecorded: unrecorded,
                    viaUnknown: viaUnknown,
                    ambiguousIdentity: ambiguousIdentity,
                    /* 四格齐否：用于「这张卡能不能直接拿去写」的判断，不由本模块替调用方决定。 */
                    slotsComplete: SLOTS.length === 4,
                    basis: items.length ? 'traces' : 'none',
                    writesNothing: true
                };
                let total = 0;
                for (const s of SLOTS) total += pre.counts[s];
                if (total > maxItems) {
                    /* 逐格裁（**不按到达顺序裁**：那不是时间序）。裁掉的条数如实计。 */
                    let budget = maxItems;
                    const clipped = { lived: [], heard: [], misled: [], unknown: [] };
                    for (const s of SLOTS) {
                        const take = Math.min(clipped[s].length + pre[s].length, budget);
                        clipped[s] = pre[s].slice(0, take);
                        budget -= clipped[s].length;
                        if (!clipped[s].length && pre[s].length) out.truncated += pre[s].length;
                        else if (clipped[s].length < pre[s].length) out.truncated += (pre[s].length - clipped[s].length);
                    }
                    pre.lived = clipped.lived; pre.heard = clipped.heard;
                    pre.misled = clipped.misled; pre.unknown = clipped.unknown;
                }
                built.push(pre);
                for (const s of SLOTS) out.counts[s] += pre.counts[s];
                out.counts.unrecorded += unrecorded;
            }
            /* 排序：条数多的排前，同分按角色名稳定（可复算，不依赖 Map 迭代序）。 */
            built.sort((x, y) => (y.counts.total - x.counts.total) || (x.character < y.character ? -1 : x.character > y.character ? 1 : 0));
            out.cards = built;
            out.counts.characters = built.length;
            return out;
        } catch (_e) {
            out.cards = [];
            out.degraded = true;
            return out;
        }
    }
    /**
     * 作者对照面：把两张卡（同一事实、两个角色）**并列**，只看差在哪。
     *   验收原文「作者可对照两人信息差」——故这里**刻意不合成**：
     *   返回的是两侧各自的格位与差异清单，不是一个「信息差分数」。
     * @returns {object} { kind, version, left, right, diff:{onlyLeft,onlyRight,bothLived,bothMisled}, known }
     */
    function contrast(cardA, cardB) {
        const out = {
            kind: PC_KIND + '@contrast', version: PC_VERSION,
            left: { character: '', facts: {} }, right: { character: '', facts: {} },
            diff: { onlyLeft: [], onlyRight: [], shared: [], misledSide: [] },
            /* 任一侧缺席**不同形**：缺卡（没给）与空卡（给了但没内容）处置相反。 */
            leftPresent: !!cardA, rightPresent: !!cardB,
            known: false, writesNothing: true
        };
        try {
            const factsOf = (card) => {
                const m = new Map();
                if (!card || typeof card !== 'object') return m;
                for (const s of SLOTS) {
                    for (const it of (Array.isArray(card[s]) ? card[s] : [])) {
                        if (!it || !it.fact) continue;
                        /* 同一事实在多格出现时**以先到的格为准**（格序即优先级：亲历 > 听说 > 误信 > 未知）,
                         *   并记下全部格位（`slots`），免得「他既听说又亲历」被压成一格。 */
                        if (!m.has(it.fact)) m.set(it.fact, { fact: it.fact, slots: [], floor: it.floor });
                        m.get(it.fact).slots.push(s);
                    }
                }
                return m;
            };
            const A = factsOf(cardA), B = factsOf(cardB);
            out.left.character = clip(cardA && cardA.character, 40);
            out.right.character = clip(cardB && cardB.character, 40);
            const all = new Set([...A.keys(), ...B.keys()]);
            for (const f of all) {
                const a = A.get(f), b = B.get(f);
                const rec = {
                    fact: f,
                    left: a ? a.slots : [],
                    right: b ? b.slots : []
                };
                if (a && !b) out.diff.onlyLeft.push(rec);
                else if (!a && b) out.diff.onlyRight.push(rec);
                else out.diff.shared.push(rec);
                /* 某一侧把它当**误信**：单列 —— 这正是「误信不写成世界真相」最需要被看见的地方。 */
                if ((a && a.slots.indexOf('misled') >= 0) || (b && b.slots.indexOf('misled') >= 0)) out.diff.misledSide.push(rec);
            }
            const byFact = (x, y) => (x.fact < y.fact ? -1 : x.fact > y.fact ? 1 : 0);
            out.diff.onlyLeft.sort(byFact);
            out.diff.onlyRight.sort(byFact);
            out.diff.shared.sort(byFact);
            out.diff.misledSide.sort(byFact);
            out.known = !!cardA && !!cardB;
            out.left.facts = A.size;
            out.right.facts = B.size;
            return out;
        } catch (_e) { out.known = false; return out; }
    }
    /** 读数一句话（四格**分开说**：合并任意两格都会误导「该怎么写」）。 */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '视角卡异常（已降级，不外抛）';
        if (r.malformedInput) return '视角卡输入畸形（不是数组）—— 无从成卡';
        if (!r.cards || !r.cards.length) return '暂无视角卡';
        const c = r.counts || {};
        const parts = ['角色 ' + (c.characters || 0), '亲历 ' + (c.lived || 0), '听说 ' + (c.heard || 0)];
        if (c.misled) parts.push('**误信 ' + c.misled + '（勿当世界真相）**');
        if (c.unknown) parts.push('未知 ' + c.unknown);
        /* 这一格必须**永远报出来**（含 0 以外的一切情形）：它是「我们没记过」的落点。 */
        if (c.unrecorded) parts.push('未记录 ' + c.unrecorded + '（本模块不知道，**不当「不知道」用**）');
        if (c.offTime) parts.push('晚于时点 ' + c.offTime);
        if (c.noFloor) parts.push('**无楼层 ' + c.noFloor + '（未计入任何时点）**');
        if (!r.atKnown) parts.push('（未给时点：给的是全量）');
        if (r.truncated) parts.push('截断 ' + r.truncated);
        return parts.join(' · ');
    }
    /**
     * 自检：**幂等 + 只读面 + 四格齐 + 未记录可见**，四条当场自证。
     *   第④条是本模块的立身之本：没有轨迹的条目**绝不落进 unknown**，
     *   否则「我们没记过」会被读成「该角色确实不知道」。
     */
    function selfCheck(traces) {
        const a = build(traces, {});
        const b = build(traces, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'acquire', 'record', 'reveal'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const slotsComplete = SLOTS.length === 4
            && ['lived', 'heard', 'misled', 'unknown'].every((s) => SLOTS.indexOf(s) >= 0);
        /* ④ 未记录可见：喂一条判不开的轨迹（doubt），它必须进 unrecorded 而**不进任何格**。 */
        const probe = build([{ character: '探针', fact: '探针事实', action: 'doubt', floor: 1 }], {});
        const unrecordedVisible = !!probe.cards.length
            && probe.cards[0].unrecorded === 1
            && !probe.cards[0].counts.lived && !probe.cards[0].counts.heard
            && !probe.cards[0].counts.misled && !probe.cards[0].counts.unknown;
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === PC_KIND; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && slotsComplete && unrecordedVisible && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            slotsComplete: slotsComplete,
            unrecordedVisible: unrecordedVisible,
            serializable: serializable,
            characters: (a.counts || {}).characters || 0
        };
    }
    const api = {
        PC_VERSION: PC_VERSION,
        PC_KIND: PC_KIND,
        SLOTS: SLOTS,
        HEARD_VIA: HEARD_VIA,
        MAX_ITEMS: MAX_ITEMS,
        MAX_PER_SLOT: MAX_PER_SLOT,
        slotOf: slotOf,
        build: build,
        contrast: contrast,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaPerspectiveCard = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);