/* ========================================================
 * causal-chain.js — [M3-X3 · v3.323.0] 伏笔与因果链导航（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一本账」）】
 *   M3-X3 点名的三本账**早已在盘上**：
 *     · seed-ledger.js          伏笔状态机（open → advancing → recovered，另有 cancel）
 *     · commitment-ledger.js    约定账（open → fulfilled / broken / cancelled）
 *     · event-completeness.js   事件四段（cause → action → result → followup）
 *   缺的**不是账，是账与账之间的连线**。修前实测的三处后果：
 *     ① 三本账各自 list/summarize，**互相不知道对方存在**：一条「答应去还钱」的约定
 *        与一条「还钱那天出了事」的伏笔在读数上毫无关系，于是「从某结果追回原始铺垫」
 *        在界面上**没有任何路径可走**（只能靠人去翻九账）；
 *     ② 「未解问题」在三个账里有三种叫法（未回收伏笔 / 未完成约定 / 仅有起因的事件），
 *        没有任何一处把它们**并列成一张待办面** —— 用户看到的是三张互不相干的表；
 *     ③ 因果**必须能被伪造**：只要允许按关键词把两条账牵上线，就一定会有「看起来连上了、
 *        其实毫无关系」的读数（本仓最贵的那类错读数）。故本模块把「有据的边」与
 *        「只是候选的边」**结构上分开存**（`edges` / `speculative`），**永不同一个数组**。
 *
 * 【与既有三账的分工（互不重叠，逐条可指认）】
 *   seed-ledger / commitment-ledger / event-completeness
 *                           各自答「这本账里那条现在什么状态」——状态机与落笔
 *   本模块                  答「这些条目**之间**是什么关系、从结果能不能追回铺垫」
 *   本模块**不写任何账**、不推进任何状态机：它只读三账的现状，产出一张可导航的图。
 *
 * 【三条纪律（与 relation-mutual / relation-history 同规格）】
 *   ① **只读**：不 plant / recover / fulfill / cancel，不写图、不落盘；
 *   ② **不抛**：输入畸形一律降级为读数（malformed 计数）并标 `degraded`；
 *   ③ **不造因果**：任何一对条目的连线都必须带 `basis`（证据 / 用户确认 / 推测），
 *      且**推测边只出现在 `speculative` 数组里**。用户确认的边不在本模块内产生
 *      —— 它由调用方传入（`edges`），本模块只负责校验形状与归类。
 *
 * 【「取消不是回收」（验收原文）】
 *   三本账都有「取消」终态，而它与「完成」的处置**相反**：
 *   完成的事不再需要提醒，取消的事也不该被算成「还没做」。修前两者在「未解」读数上同形
 *   （都只是「不在这张表里」）。本模块把四类终态**分开列**：
 *     resolved（真完成：seed recovered / commitment fulfilled / event complete）
 *     cancelled（明确作废：seed cancel / commitment cancel）
 *     broken（约定违约：**不是完成，也不是取消** —— 它是一条需要被看见的既成事实）
 *     unresolved（仍未收口，进入待办面）
 *   压平任意两类都会造出「该提醒的不提醒」或「已作废的还在提醒」。
 *
 * 【可移植性说明】
 *   机制动机来自「多本独立账之间缺导航」这一通用失效形态；实现按本仓规范重写
 *   （零依赖、不抛、分态到处置可分、读数齐备），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    /** 本面结构版本（形状一变必须抬这个数，防「旧下游配新面」静默错读）。 */
    const CC_VERSION = 1;
    /** 读数 kind（消费方可据此判「这是不是本面产出的读数」）。 */
    const CC_KIND = 'causal_chain';
    /** 节点类型四态（**受控词表**：多一类就意味着某件事无处安放）。 */
    const NODE_KINDS = Object.freeze(['seed', 'commitment', 'event', 'note']);
    /** 边的依据三态（压成一态就等于把「有据」与「猜的」混为一谈）。 */
    const EDGE_BASIS = Object.freeze(['evidence', 'user-confirmed', 'speculative']);
    /** 收口四态（取消 ≠ 完成 ≠ 违约 ≠ 未收口；四者处置互不相同）。 */
    const CLOSURE = Object.freeze(['resolved', 'cancelled', 'broken', 'unresolved']);
    /** 单图节点/边上限（超出计入 truncated —— 截断必须可见）。 */
    const MAX_NODES = 400;
    const MAX_EDGES = 600;
    /** 追溯返回的路径上限。 */
    const MAX_PATH = 12;
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
    /** 截断到 n 字符。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n) : t;
    }
    /* ── 三账 → 节点的**唯一**映射表（不是三份 inline 代码：改名只改这一处） ──
     * ★ 首跑自伤留痕：首稿判「条目 id 是否为空」用的是**节点 id 与 kind 全名比长度**
     *   （`id.length <= spec.kind.length + 1`）。而三账的 id 前缀是**缩写**（`seed:` /
     *   `cmt:` / `evt:` / `note:`）—— `'cmt:c1'.length = 6` 恒小于 `'commitment'.length + 1 = 11`，
     *   于是**约定与事件两类节点整类被判成畸形丢掉**，读数只剩伏笔（面板却照样显示正常）。
     *   修法：判空只看**前缀之后还有没有内容**（`prefix` 显式登记，不再由 kind 名推导）。 */
    const SOURCES = Object.freeze([
        {
            kind: 'seed', prefix: 'seed:', pick: (s) => (s && Array.isArray(s.items) ? s.items : []),
            idOf: (it) => 'seed:' + clip(it && it.id, 80),
            labelOf: (it) => clip(it && it.hook, 160),
            statusOf: (it) => clip(it && it.status, 20),
            actorOf: () => '',
            floorOf: (it) => floorOrNull(it && it.floor),
            updatedOf: (it) => floorOrNull(it && (it.updatedFloor ?? it.recoveredFloor)),
            /* 终态映射：recovered 是真完成；cancelled 是明确作废（两者**不得合并**）。 */
            closureOf: (st) => (st === 'recovered' ? 'resolved' : st === 'cancelled' ? 'cancelled' : 'unresolved')
        },
        {
            kind: 'commitment', prefix: 'cmt:', pick: (s) => (s && Array.isArray(s.items) ? s.items : []),
            idOf: (it) => 'cmt:' + clip(it && it.id, 80),
            labelOf: (it) => clip(it && it.content, 160),
            statusOf: (it) => clip(it && it.status, 20),
            actorOf: (it) => clip(it && it.actor, 40),
            floorOf: (it) => floorOrNull(it && it.floor),
            updatedOf: (it) => floorOrNull(it && it.updatedFloor),
            /* broken（违约）**不是完成也不是取消**：它是一条既成事实，必须单独看得见。 */
            closureOf: (st) => (st === 'fulfilled' ? 'resolved' : st === 'cancelled' ? 'cancelled' : st === 'broken' ? 'broken' : 'unresolved')
        },
        {
            kind: 'event', prefix: 'evt:', pick: (s) => (s && Array.isArray(s.events) ? s.events : []),
            idOf: (it) => 'evt:' + clip(it && (it.id || it.eventId), 80),
            labelOf: (it) => clip(it && (it.title || it.summary || it.description), 160),
            /* 事件状态是**算出来的**（completeness(e).state）：三态 dangling/open/complete。
             *   这里读传入值（宿主已算好的那份），读不到即 ''（不猜）。 */
            statusOf: (it) => clip(it && it.state, 20),
            actorOf: () => '',
            floorOf: (it) => floorOrNull(it && it.floor),
            updatedOf: (it) => floorOrNull(it && (it.updatedFloor ?? it.lastFloor)),
            closureOf: (st) => (st === 'complete' ? 'resolved' : 'unresolved')
        },
        {
            kind: 'note', prefix: 'note:', pick: (s) => (Array.isArray(s) ? s : []),
            idOf: (it) => 'note:' + clip(it && it.id, 80),
            labelOf: (it) => clip(it && (it.label || it.text), 160),
            statusOf: (it) => clip(it && it.status, 20),
            actorOf: (it) => clip(it && it.actor, 40),
            floorOf: (it) => floorOrNull(it && it.floor),
            updatedOf: (it) => floorOrNull(it && it.updatedFloor),
            closureOf: (st) => (st === 'resolved' || st === 'closed' ? 'resolved' : st === 'cancelled' ? 'cancelled' : 'unresolved')
        }
    ]);
    /**
     * 三账 → 节点表（**恒定键面**：消费方不必判 undefined）。
     * @param {object} sources { seeds?, commitments?, events?, notes? }
     * @returns {{nodes:Array, counts:object, malformed:number}}
     */
    function toNodes(sources) {
        const s = (sources && typeof sources === 'object') ? sources : {};
        const nodes = [];
        const counts = { seed: 0, commitment: 0, event: 0, note: 0 };
        let malformed = 0;
        let dup = 0;
        const seen = new Set();
        for (const spec of SOURCES) {
            let list = [];
            try { list = spec.pick(s[spec.kind === 'commitment' ? 'commitments' : spec.kind === 'event' ? 'events' : spec.kind === 'note' ? 'notes' : 'seeds']); }
            catch (_e) { list = []; }
            for (const it of (Array.isArray(list) ? list : [])) {
                if (!it || typeof it !== 'object') { malformed++; continue; }
                const id = spec.idOf(it);
                /* id 空（账里条目缺 id）⇒ 畸形，**不生成一个假 id**：
                 *   假 id 会让两条不同条目在图上合流（本仓「同名不同物被合并」的同型形态）。 */
                if (!id || id.length <= spec.prefix.length) { malformed++; continue; }
                if (seen.has(id)) { dup++; continue; }
                seen.add(id);
                const status = spec.statusOf(it);
                const closure = spec.closureOf(status);
                nodes.push({
                    id: id,
                    kind: spec.kind,
                    label: spec.labelOf(it),
                    status: status,
                    closure: closure,
                    actor: spec.actorOf(it),
                    floor: spec.floorOf(it),
                    updatedFloor: spec.updatedOf(it),
                    revision: floorOrNull(it.revision),
                    source: clip(it && it.source, 40)
                });
                counts[spec.kind]++;
            }
        }
        return { nodes: nodes, counts: counts, malformed: malformed, duplicate: dup };
    }
    /** 校验一条传入的边（**形状不对就丢进 malformed，绝不猜**）。 */
    function normEdge(raw, ids) {
        if (!raw || typeof raw !== 'object') return { bad: 'malformed' };
        const from = clip(raw.from, 120), to = clip(raw.to, 120);
        if (!from || !to) return { bad: 'malformed' };
        if (from === to) return { bad: 'self' };
        if (!ids.has(from) || !ids.has(to)) return { bad: 'dangling' };
        let basis = clip(raw.basis, 20);
        if (EDGE_BASIS.indexOf(basis) < 0) basis = 'evidence';   // 缺依据 = 有据（调用方传进来的都是已确认的）；推测边走 propose
        return {
            edge: {
                from: from, to: to, basis: basis,
                evidenceKey: clip(raw.evidenceKey, 120),
                floor: floorOrNull(raw.floor),
                note: clip(raw.note, 120)
            }
        };
    }
    /**
     * 因果链图（纯函数、不抛）。
     *
     * @param {object} sources { seeds?, commitments?, events?, notes? }
     * @param {object} [opts] { edges?:Array, proposals?:Array, maxNodes?:number, maxEdges?:number }
     *   · edges     —— **已确认**的连线（证据 / 用户确认两类）
     *   · proposals —— 调用方提出的候选（仍会被归入 speculative，不混进 edges）
     * @returns {object} 结构恒定读数
     */
    function build(sources, opts) {
        const o = opts || {};
        const out = {
            kind: CC_KIND,
            version: CC_VERSION,
            nodes: [],
            edges: [],          // **只含 basis ∈ {evidence, user-confirmed}**
            speculative: [],    // **只含 basis === 'speculative'**（结构上与 edges 分开，不可混读）
            unresolved: [],
            resolved: [],
            cancelled: [],
            broken: [],
            counts: {
                nodes: 0, edges: 0, speculative: 0, malformedEdges: 0, danglingEdges: 0,
                selfEdges: 0, unresolved: 0, resolved: 0, cancelled: 0, broken: 0,
                orphans: 0, malformed: 0, duplicate: 0
            },
            truncated: 0,
            edgesTruncated: 0,
            malformedInput: false,
            writesNothing: true,
            degraded: false
        };
        try {
            out.malformedInput = !(sources && typeof sources === 'object');
            const n = toNodes(sources);
            out.counts.malformed = n.malformed;
            out.counts.duplicate = n.duplicate;
            const maxNodes = Number.isFinite(Number(o.maxNodes)) && Number(o.maxNodes) >= 1 ? Math.floor(Number(o.maxNodes)) : MAX_NODES;
            const maxEdges = Number.isFinite(Number(o.maxEdges)) && Number(o.maxEdges) >= 1 ? Math.floor(Number(o.maxEdges)) : MAX_EDGES;
            out.nodes = n.nodes.slice(0, maxNodes);
            out.truncated = Math.max(0, n.nodes.length - out.nodes.length);
            out.counts.nodes = n.nodes.length;
            /* 收口四分（**取消、违约、完成、未收口四者分开列**）。 */
            for (const node of n.nodes) {
                if (node.closure === 'resolved') out.resolved.push(node.id);
                else if (node.closure === 'cancelled') out.cancelled.push(node.id);
                else if (node.closure === 'broken') out.broken.push(node.id);
                else out.unresolved.push(node.id);
            }
            out.counts.resolved = out.resolved.length;
            out.counts.cancelled = out.cancelled.length;
            out.counts.broken = out.broken.length;
            out.counts.unresolved = out.unresolved.length;
            /* ── 边：已确认与推测**分两个数组** ── */
            const ids = new Set(n.nodes.map((x) => x.id));
            const confirmedIn = Array.isArray(o.edges) ? o.edges : [];
            const proposedIn = Array.isArray(o.proposals) ? o.proposals : [];
            for (const raw of confirmedIn) {
                const r = normEdge(raw, ids);
                if (!r.edge) {
                    if (r.bad === 'dangling') out.counts.danglingEdges++;
                    else if (r.bad === 'self') out.counts.selfEdges++;
                    else out.counts.malformedEdges++;
                    continue;
                }
                /* 传入 edges 里若**自称推测**，一样搬进 speculative —— 依据决定归处，
                 *   与「谁传进来的」无关（否则调用方一个笔误就能把猜测混进事实面）。 */
                if (r.edge.basis === 'speculative') out.speculative.push(r.edge);
                else out.edges.push(r.edge);
            }
            for (const raw of proposedIn) {
                const r = normEdge(raw, ids);
                if (!r.edge) {
                    if (r.bad === 'dangling') out.counts.danglingEdges++;
                    else if (r.bad === 'self') out.counts.selfEdges++;
                    else out.counts.malformedEdges++;
                    continue;
                }
                /* proposals 进来的边**一律记推测**：它的来源就是「没人确认过」。 */
                out.speculative.push(Object.assign({}, r.edge, { basis: 'speculative' }));
            }
            const edgesAll = out.edges.slice();
            out.edges = edgesAll.slice(0, maxEdges);
            out.speculative = out.speculative.slice(0, maxEdges);
            out.edgesTruncated = Math.max(0, edgesAll.length - out.edges.length);
            out.counts.edges = edgesAll.length;
            out.counts.speculative = out.speculative.length;
            /* 孤立节点：既不在任何已确认边里、也不在推测边里。
             *   单列出来 —— 「这条没人牵过」与「这条牵错了」处置不同。 */
            const touched = new Set();
            for (const e of out.edges.concat(out.speculative)) { touched.add(e.from); touched.add(e.to); }
            out.counts.orphans = n.nodes.filter((x) => !touched.has(x.id)).length;
            return out;
        } catch (_e) {
            out.nodes = [];
            out.edges = [];
            out.speculative = [];
            out.degraded = true;
            return out;
        }
    }
    /**
     * 候选边提议（**只提议、不确认**；产出物的 basis 恒为 'speculative'，reason 必填）。
     *
     * 【为什么本函数敢提议，却绝不敢把它当事实】
     *   三账之间唯一**可从数据本身读出**的弱关联是「同一主体 + 楼层相邻」：
     *   一个人在某一楼答应了一件事，而紧邻若干楼内埋了一条伏笔 —— 这两条**可能有关系**，
     *   但**数据里没有任何东西证明有关系**（证据要靠正文或用户确认）。
     *   故本函数产出的每一条都带 `reason`（为什么被提出来）与 `gap`（相隔几楼），
     *   并**只**进 `speculative`。调用方要把它变成事实，必须走用户确认或找到证据。
     *
     * @param {object} sources 同 build
     * @param {object} [opts] { maxGap?:number, maxProposals?:number }
     * @returns {Array} 候选边（可能为空数组；绝不抛）
     */
    function proposeCandidates(sources, opts) {
        const o = opts || {};
        const gap = Number.isFinite(Number(o.maxGap)) && Number(o.maxGap) >= 0 ? Math.floor(Number(o.maxGap)) : 3;
        const maxP = Number.isFinite(Number(o.maxProposals)) && Number(o.maxProposals) >= 1 ? Math.floor(Number(o.maxProposals)) : 20;
        try {
            const n = toNodes(sources);
            const withFloor = n.nodes.filter((x) => x.floor !== null);
            const out = [];
            for (const a of withFloor) {
                if (a.closure !== 'unresolved') continue;
                /* 只有**约定 → 伏笔**这一个方向被提议：约定是行动承诺，伏笔是埋下的因，
                 *   反方向提议会把「伏笔之后的约定」也说成因果（那是造剧情）。 */
                if (a.kind !== 'commitment') continue;
                /* ★ 实测修正（功能级失效）：首稿判的是两条节点的 `actor` **字段相等**，
                 *   而伏笔条目**没有这个字段**（`actorOf: () => ''`）—— 于是候选提议
                 *   **恒为空数组**：出口导出了、有判据、读数看起来正常，在真数据上一次都不触发。
                 *   主体只能从**约定节点**取（那条账里确有 actor），再到伏笔**文本**里找。
                 *   弱关联依旧只是候选（basis=speculative，与已确认边分数组，traceBack 不采信）。 */
                const subject = String(a.actor || '').trim();
                if (subject.length < 2) continue;   // 单字名不收：一个字会在任何正文里误命中
                for (const b of withFloor) {
                    if (b === a || b.closure !== 'unresolved') continue;
                    if (b.kind !== 'seed') continue;
                    const text = String(b.label || '');
                    if (!text || text.indexOf(subject) < 0) continue;
                    const d = b.floor - a.floor;
                    if (d <= 0 || d > gap) continue;
                    out.push({
                        from: a.id, to: b.id, basis: 'speculative',
                        reason: '同一主体「' + subject + '」在第 ' + a.floor + ' 楼立约、' + d + ' 楼内埋下提到该名字的伏笔（**弱关联·未确认**，须证据或用户确认才算因果）',
                        gap: d, evidenceKey: '', floor: a.floor, note: ''
                    });
                }
            }
            /* 稳定排序（可复算，不依赖 Map 迭代序）。 */
            out.sort((x, y) => (x.gap - y.gap) || (x.from < y.from ? -1 : x.from > y.from ? 1 : 0) || (x.to < y.to ? -1 : x.to > y.to ? 1 : 0));
            return out.slice(0, maxP);
        } catch (_e) { return []; }
    }
    /**
     * 从某节点向上游追溯（M3-X3 验收「从某结果可追到原始铺垫」）。
     *   **只走已确认边**（`basis !== 'speculative'`）——推测边能追出来的「链」不是链。
     *   回环（A→B→A）必须被截断并在读数里可见，否则会返回一条无限路径。
     * @param {object} graph build() 的产出（或 {edges:[...]}）
     * @param {string} id 起点（结果那一端）
     * @param {object} [opts] { maxPath?:number }
     * @returns {object} { id, path:[ids...], roots:[ids...], cycles, truncated, known }
     */
    function traceBack(graph, id, opts) {
        const o = opts || {};
        const maxPath = Number.isFinite(Number(o.maxPath)) && Number(o.maxPath) >= 1 ? Math.floor(Number(o.maxPath)) : MAX_PATH;
        const g = (graph && typeof graph === 'object') ? graph : {};
        const edges = Array.isArray(g.edges) ? g.edges : [];
        const start = clip(id, 120);
        const out = {
            kind: CC_KIND + '@trace', version: CC_VERSION, id: start,
            path: [], roots: [], cycles: 0, truncated: false, known: false,
            /* unknown 与「追到了头」**不同形**：前者是「这个 id 不在图里」，
             *   后者是「追到头了，它就是最上游」。 */
            reason: '', writesNothing: true
        };
        try {
            if (!start) { out.reason = 'empty-id'; return out; }
            const nodeIds = new Set((Array.isArray(g.nodes) ? g.nodes : []).map((x) => x && x.id));
            if (nodeIds.size && !nodeIds.has(start)) { out.reason = 'not-in-graph'; return out; }
            out.known = !nodeIds.size || nodeIds.has(start);
            const up = new Map();
            for (const e of edges) {
                if (!e || !e.from || !e.to) continue;
                if (!up.has(e.to)) up.set(e.to, []);
                up.get(e.to).push(e.from);
            }
            const seen = new Set([start]);
            let frontier = [start];
            out.path.push(start);
            while (frontier.length) {
                const next = [];
                for (const cur of frontier) {
                    const parents = up.get(cur) || [];
                    if (!parents.length) { if (out.roots.indexOf(cur) < 0) out.roots.push(cur); continue; }
                    for (const p of parents) {
                        if (seen.has(p)) { out.cycles++; continue; }
                        if (out.path.length >= maxPath) { out.truncated = true; continue; }
                        seen.add(p);
                        out.path.push(p);
                        next.push(p);
                    }
                }
                frontier = next;
                if (out.truncated && frontier.length && out.path.length >= maxPath) break;
            }
            return out;
        } catch (_e) { out.reason = 'degraded'; return out; }
    }
    /** 未解待办面（三账并列，**按楼层升序**；取消/违约/完成不在此列）。 */
    function todos(graph) {
        const g = (graph && typeof graph === 'object') ? graph : {};
        const nodes = Array.isArray(g.nodes) ? g.nodes : [];
        const open = new Set(Array.isArray(g.unresolved) ? g.unresolved : []);
        const list = nodes.filter((x) => open.has(x.id)).map((x) => ({
            id: x.id, kind: x.kind, label: x.label, status: x.status,
            actor: x.actor, floor: x.floor, updatedFloor: x.updatedFloor
        }));
        /* 楼层未知的排末尾（**不得混进时间序**：本仓禁止拿到达顺序充当时间顺序）。 */
        list.sort((a, b) => {
            const af = a.floor, bf = b.floor;
            if (af === null && bf === null) return (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
            if (af === null) return 1;
            if (bf === null) return -1;
            return af - bf;
        });
        return list;
    }
    /** 读数一句话（**四类收口分开说**：合并任意两类都会误导处置）。 */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '因果链异常（已降级，不外抛）';
        if (r.malformedInput) return '因果链输入畸形 —— 无从成图';
        const c = r.counts || {};
        if (!c.nodes) return '暂无因果链条目';
        const parts = ['节点 ' + c.nodes, '已确认边 ' + (c.edges || 0)];
        if (c.unresolved) parts.push('未收口 ' + c.unresolved);
        if (c.broken) parts.push('违约 ' + c.broken);
        if (c.cancelled) parts.push('已作废 ' + c.cancelled);
        if (c.resolved) parts.push('已完成 ' + c.resolved);
        if (c.speculative) parts.push('**推测边 ' + c.speculative + '（未确认，勿当因果）**');
        if (c.orphans) parts.push('孤立 ' + c.orphans);
        if (c.danglingEdges) parts.push('悬空边 ' + c.danglingEdges);
        if (c.malformedEdges) parts.push('畸形边 ' + c.malformedEdges);
        if (r.truncated) parts.push('节点截断 ' + r.truncated);
        if (r.edgesTruncated) parts.push('边截断 ' + r.edgesTruncated);
        return parts.join(' · ');
    }
    /**
     * 自检：**幂等 + 只读面 + 四态齐 + 依据不混**，四条当场自证。
     *   第④条是本模块存在的理由：推测边与已确认边**必须落在不同数组**里
     *   （同数组即等于把「猜的」当成「有据的」）。
     */
    function selfCheck(sources) {
        const a = build(sources, {});
        const b = build(sources, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'plant', 'recover', 'fulfill', 'cancel', 'amend', 'open'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const closureComplete = CLOSURE.length === 4
            && ['resolved', 'cancelled', 'broken', 'unresolved'].every((k) => CLOSURE.indexOf(k) >= 0);
        const basisSeparated = (a.edges || []).every((e) => e.basis !== 'speculative')
            && (a.speculative || []).every((e) => e.basis === 'speculative');
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === CC_KIND; } catch (_e) { serializable = false; }
        /* ⑤ 候选出口**可达**（本轮补）：喂一份「约定主体名出现在伏笔文本里」的最小真数据，
         *   提议必须非空且全部 basis=speculative。首稿该出口在真数据上恒空，
         *   而上面四条自证**全 true** —— 「导出了、有判据、永不触发」这类功能级失效，
         *   只有这条能抓住（本仓在别的模块上栽过同型：建好不消费）。 */
        let proposalsReachable = false;
        try {
            const probe = proposeCandidates({
                commitments: { items: [{ id: 'p1', actor: '探针甲', content: '答应去旧书铺', status: 'open', floor: 2 }] },
                seeds: { items: [{ id: 'p2', hook: '探针甲把旧书铺的钥匙藏了起来', status: 'open', floor: 3 }] }
            }, {});
            proposalsReachable = Array.isArray(probe) && probe.length > 0
                && probe.every((p) => p.basis === 'speculative');
        } catch (_e) { proposalsReachable = false; }
        return {
            ok: deterministic && writeFaces === 0 && closureComplete && basisSeparated && serializable && proposalsReachable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            closureComplete: closureComplete,
            basisSeparated: basisSeparated,
            serializable: serializable,
            proposalsReachable: proposalsReachable,
            nodes: (a.counts || {}).nodes || 0
        };
    }
    const api = {
        CC_VERSION: CC_VERSION,
        CC_KIND: CC_KIND,
        NODE_KINDS: NODE_KINDS,
        EDGE_BASIS: EDGE_BASIS,
        CLOSURE: CLOSURE,
        MAX_NODES: MAX_NODES,
        MAX_EDGES: MAX_EDGES,
        MAX_PATH: MAX_PATH,
        toNodes: toNodes,
        build: build,
        proposeCandidates: proposeCandidates,
        traceBack: traceBack,
        todos: todos,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaCausalChain = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);