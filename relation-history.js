/* ========================================================
 * relation-history.js — [M3-X2 · v3.323.0] 人物关系变化史与转折解释（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一个关系账」）】
 *   本仓的图谱关系边是**单向主观**的，且已被三面治理过一轮：
 *     · relation-disclosure.js —— 「这条已确认的关系此刻该不该给模型看」（注入筛选）；
 *     · relation-mutual.js     —— 「这条边的**对侧**在不在、不在是哪种不在」（对账）；
 *     · npc-ties.js            —— 「NPC 的长期关系网怎么渲染」（文本聚合）。
 *   三面合起来仍答不了 M3-X2 点名的这一问：**这对人的关系是怎么变成现在这样的**。
 *   修前实测的三处落点缺失：
 *     ① 图边带时态（`validFrom` / `validTo` / `active`，memory-core.js::addEdge 同维度冲突
 *        会把旧边闭环），但**没有一处把同一对人物的边按时间排成轨迹** —— `buildInjection`
 *        只列**当下生效**的那几条，于是「曾经信任 → 后来怀疑」这条变化在读数上**根本不存在**
 *        （读者只看到最后一条，读成「一直如此」）；
 *     ② 「A 看 B」与「B 看 A」被 relation-mutual 判过「对侧在不在」，但**没有一处把两侧
 *        并列起来看差**；把两者**平均成一个好感值**是本仓最忌的那类合成
 *        （M3-X2 验收原文：「不把两人的看法平均成一个值」）；
 *     ③ 图边闭环时**只留 validTo，不留原因**：一条「恋人」被标 active=false 之后，
 *        「为什么结束的」在图里没有任何落点，只能靠人去翻楼层。
 *   本模块把这三件事各给一条**可复算的轨迹**，并且**只加轨迹**：不改边、不删边、不写图，
 *   也不改变 relation-disclosure / relation-mutual 的任何判定结果（它读两者的产物）。
 *
 * 【与既有三面的分工（互不重叠，逐条可指认）】
 *   relation-disclosure.js  答「这条关系此刻该不该给模型看」——注入侧筛选
 *   relation-mutual.js      答「对侧在不在」——对账（三态）
 *   npc-ties.js             答「关系网怎么渲染」——文本聚合
 *   本模块                   答「这对人的关系**随时间**怎么变的、每次转折凭什么」——轨迹
 *   于是「为何从信任变成怀疑」有据可答：证据是同一对人物上两条边的 floor 先后 + 各自标签，
 *   而不是让模型从一条当下边凭空猜想。
 *
 * 【四条纪律（与 relation-mutual.js 同规格）】
 *   ① **只读**：不改边、不删边、不写图、不写账、不落盘；
 *   ② **不抛**：输入畸形一律降级为读数（malformed 计数）并标 `degraded`，绝不外抛
 *      —— 本模块可能跑在生成前的装配路径上，抛一次会连坐整轮；
 *   ③ **不猜**：floor 读不到即为 null，**不计入转折**（无出处的先后不是转折，是巧合）；
 *      态度读不到即为 null，**不写 neutral 冒充**（「中立」与「没登记过态度」处置相反）；
 *   ④ **不平均**：两侧看法逐侧保留（`sides`），**永不产出单一的合成好感值**。
 *      本模块也没有任何「好感度」出口 —— 那是另一类产品形态，不是本仓的（明确不做）。
 *
 * 【身份键的边界（如实声明，不假装解决）】
 *   本仓图里同名异人是**不同节点**（memory-core.js 的 nameIndex 按名聚 id），但边对象上
 *   只带 `from` / `to` 两个名字。故本模块：
 *     · 有 `fromId` / `toId` 时**优先用 id** 做身份键（同名异人不会混）；
 *     · 只有名字时退化为按名聚合，并在读数里**如实标 `byName:true`**
 *       —— 让调用方知道这一份轨迹在存在同名异人时会把两人合并（本仓已知存在此情形）。
 *   不静默假装名字键是稳定的。
 *
 * 【可移植性说明】
 *   机制动机来自「时态图边只留末态、变化过程不可见」这一通用失效形态；实现按本仓规范
 *   重写（零依赖、不抛、分态到处置可分、读数齐备），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    /** 本面结构版本（形状一变必须抬这个数，防「旧下游配新面」静默错读）。 */
    const RH_VERSION = 1;
    /** 读数 kind（消费方可据此判「这是不是本面产出的读数」）。 */
    const RH_KIND = 'relation_history';
    /** 单对人物的转折点上限（超出计入 truncated —— 截断必须可见）。 */
    const MAX_TURNS = 12;
    /** 参与轨迹的人物对上限（图大时按「转折最多」优先，超出如实计数）。 */
    const MAX_PAIRS = 40;
    /** 态度三值（**不含 null**：null 是「没登记过」，与「中立」不是同一件事）。 */
    const ATTITUDES = Object.freeze(['positive', 'negative', 'neutral']);
    /** 未解决项的三类来源（压成一类就等于把三种处置混为一谈）。 */
    const UNRESOLVED_KINDS = Object.freeze(['divergent-attitude', 'side-missing', 'closed-without-successor']);
    /** 单行化（换行折叠为空格）。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 有限非负整数，否则 null（不写 0：0 是「第 0 楼」，与「不知道第几楼」处置相反）。 */
    function floorOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    /** 边的身份键：优先 id，缺则名字（并置 byName 标记）。 */
    function idOf(e, side) {
        if (!e || typeof e !== 'object') return '';
        const v = (side === 'from') ? (e.fromId ?? e.sourceId) : (e.toId ?? e.targetId);
        const s = oneLine(v);
        if (s) return s;
        return oneLine(side === 'from' ? e.from : e.to);
    }
    /**
     * 人物对的无序键（**按字典序固化 a/b**，保证同一对人两次调用键稳定）。
     *   与 relation-mutual 的有序键刻意不同：那边判的是方向性，这边判的是「同一对人」。
     * @returns {{key:string, a:string, b:string, byName:boolean}|null}
     */
    function pairOf(e) {
        const fa = idOf(e, 'from'), fb = idOf(e, 'to');
        if (!fa || !fb) return null;
        const byName = !oneLine(e.fromId ?? e.sourceId) || !oneLine(e.toId ?? e.targetId);
        const a = fa <= fb ? fa : fb;
        const b = fa <= fb ? fb : fa;
        return { key: a + '\u0000' + b, a: a, b: b, byName: byName };
    }
    /** 有序侧键（from→to），与 pairOf 的无序键配合用：一对人最多两条侧链。 */
    function sideOf(e) {
        const from = idOf(e, 'from'), to = idOf(e, 'to');
        if (!from || !to) return null;
        return from + '\u0000' + to;
    }
    /** 边的可读标签（label 优先，退化到 relation / type）。 */
    function labelOf(e) {
        return oneLine(e && (e.label || e.relation || e.type)) || '相关';
    }
    /**
     * 边的态度（**读不到给 null，不给 neutral**）。
     *   本仓两条既有写法都要认：`e.data.attitude`（addEdge 的 data 袋）与 `e.attitude`。
     */
    function attitudeOf(e) {
        const raw = oneLine(e && e.data && e.data.attitude) || oneLine(e && e.attitude);
        if (!raw) return null;
        const low = raw.toLowerCase();
        return ATTITUDES.indexOf(low) >= 0 ? low : raw;
    }
    /** 边的起始楼层（validFrom 优先，退化到 floor）。 */
    function fromFloorOf(e) {
        return floorOrNull(e && (e.validFrom !== undefined && e.validFrom !== null ? e.validFrom : e.floor));
    }
    /** 边的结束楼层（闭环时才有；未闭环给 null）。 */
    function toFloorOf(e) {
        return floorOrNull(e && e.validTo);
    }
    /** 表述一条边的既有状态（active 缺省视为在场，与 memory-core.js::addEdge 同判据）。 */
    function isLive(e) {
        return !e || e.active !== false;
    }
    /** 单条边的轨迹点（**恒定键面**：消费方不必判 undefined）。 */
    function turnOf(e, side) {
        return {
            side: side,                                  // 'a-to-b' / 'b-to-a'
            label: labelOf(e),
            attitude: attitudeOf(e),                     // null = 没登记过态度（≠ 中立）
            floor: fromFloorOf(e),                       // null = 出处不明（不计入转折）
            closedFloor: toFloorOf(e),                   // null = 未闭环
            live: isLive(e),
            note: oneLine(e && e.data && e.data.note) || oneLine(e && e.note) || ''
        };
    }
    /** 按 floor 升序排（null 恒排末尾 —— 「不知道第几楼」不得混进时间序）。 */
    function byFloorAsc(x, y) {
        const a = x.floor, b = y.floor;
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return a - b;
    }
    /**
     * 人物关系变化史（纯函数、不抛）。
     *
     * @param {Array} edges 图里的关系边（每项至少含 from / to；label / data.attitude /
     *                      validFrom / validTo / active / floor 可选）
     * @param {object} [opts] { maxTurns?:number, maxPairs?:number, includeSelf?:boolean }
     * @returns {object} 结构恒定读数（消费方不必判 undefined）
     */
    function build(edges, opts) {
        const o = opts || {};
        const maxTurns = Number.isFinite(Number(o.maxTurns)) && Number(o.maxTurns) >= 1 ? Math.floor(Number(o.maxTurns)) : MAX_TURNS;
        const maxPairs = Number.isFinite(Number(o.maxPairs)) && Number(o.maxPairs) >= 1 ? Math.floor(Number(o.maxPairs)) : MAX_PAIRS;
        const out = {
            kind: RH_KIND,
            version: RH_VERSION,
            pairs: [],
            counts: {
                input: 0, used: 0, pairs: 0, mutual: 0, divergent: 0,
                turns: 0, unresolved: 0, noFloor: 0, self: 0, malformed: 0
            },
            truncated: 0,          // 被丢掉的人物对数（截断必须可见）
            turnsTruncated: 0,     // 单对里被丢掉的转折点数
            byName: false,         // 是否存在**只按名字**聚合的对（同名异人时会把两人合并）
            malformedInput: false, // edges 不是数组（**与「空图」分开报**）
            writesNothing: true,
            degraded: false
        };
        try {
            const list = Array.isArray(edges) ? edges : [];
            out.malformedInput = !Array.isArray(edges) && edges !== undefined && edges !== null;
            out.counts.input = list.length;
            /* ── 第一遍：按无序对分桶，桶内再按有序侧分链 ── */
            const byPair = new Map();
            for (const e of list) {
                if (!e || typeof e !== 'object') { out.counts.malformed++; continue; }
                const p = pairOf(e);
                if (!p) { out.counts.malformed++; continue; }
                /* 自指：from === to（本人对自己），既不是「一对人」也不是畸形 —— 单列。
                 *   混进 pairs 会让「自己对自己」显示成一条关系史（本仓在 relation-mutual
                 *   的 self 计数上已踩过一次同类形态）。 */
                if (p.a === p.b) {
                    if (!o.includeSelf) { out.counts.self++; continue; }
                }
                const sk = sideOf(e);
                if (!sk) { out.counts.malformed++; continue; }
                if (!byPair.has(p.key)) byPair.set(p.key, { pair: p, sides: new Map() });
                const bucket = byPair.get(p.key);
                if (!bucket.sides.has(sk)) bucket.sides.set(sk, []);
                bucket.sides.get(sk).push(e);
                out.counts.used++;
                if (p.byName) out.byName = true;
            }
            /* ── 第二遍：逐对成轨迹 ── */
            const built = [];
            for (const bucket of byPair.values()) {
                const p = bucket.pair;
                const sides = { 'a-to-b': null, 'b-to-a': null };
                const allTurns = [];
                let noFloor = 0;
                for (const [sk, group] of bucket.sides) {
                    /* 方向判定：sk 的 from 与 pair.a 相同 ⇒ 这一链是 a→b，否则 b→a。 */
                    const fromId = sk.split('\u0000')[0];
                    const sideName = (fromId === p.a) ? 'a-to-b' : 'b-to-a';
                    const turns = group.map((e) => turnOf(e, sideName)).sort(byFloorAsc);
                    for (const t of turns) if (t.floor === null) noFloor++;
                    const liveList = turns.filter((t) => t.live);
                    sides[sideName] = {
                        from: (sideName === 'a-to-b') ? p.a : p.b,
                        to: (sideName === 'a-to-b') ? p.b : p.a,
                        count: turns.length,
                        turns: turns.slice(0, maxTurns),
                        truncated: Math.max(0, turns.length - maxTurns),
                        latest: liveList.length ? liveList[liveList.length - 1] : (turns.length ? turns[turns.length - 1] : null),
                        /* 态度**逐侧保留**：本格在两侧都读不到时给 null，不合成、不平均。 */
                        attitude: (liveList.length ? liveList[liveList.length - 1].attitude
                            : (turns.length ? turns[turns.length - 1].attitude : null))
                    };
                    out.turnsTruncated += Math.max(0, turns.length - maxTurns);
                    allTurns.push(...turns.slice(0, maxTurns));
                }
                const both = !!(sides['a-to-b'] && sides['b-to-a']);
                /* 未解决项三类分开列（**压成一类就等于把三种处置混为一谈**）：
                 *   divergent-attitude       —— 两侧态度相反（都登记过、方向相反）；
                 *   side-missing             —— 只有一侧有登记（本仓 relation-mutual 已定性：
                 *                               这是「提取漏了一条」的那一态，不是「关系单向」）；
                 *   closed-without-successor —— 一条边被闭环了，同侧**没有后继边**
                 *                               （关系结束了且没人记为什么）。 */
                const unresolved = [];
                const attA = sides['a-to-b'] ? sides['a-to-b'].attitude : null;
                const attB = sides['b-to-a'] ? sides['b-to-a'].attitude : null;
                if (attA && attB && attA !== attB
                    && (attA === 'positive' || attA === 'negative') && (attB === 'positive' || attB === 'negative')) {
                    unresolved.push({
                        kind: 'divergent-attitude',
                        detail: p.a + '→' + p.b + '：' + attA + '；' + p.b + '→' + p.a + '：' + attB,
                        floor: null,
                        /* 本项**不报具体楼层**：两侧各自的 floor 在各自 turns 里，这里只报「差在哪」。 */
                        sides: { 'a-to-b': attA, 'b-to-a': attB }
                    });
                }
                if (!both) {
                    const only = sides['a-to-b'] ? 'a-to-b' : (sides['b-to-a'] ? 'b-to-a' : null);
                    if (only && sides[only].count) {
                        const t = sides[only].latest || sides[only].turns[0];
                        unresolved.push({
                            kind: 'side-missing',
                            detail: (sides[only].from + '→' + sides[only].to) + '（' + (t ? t.label : '相关') + '）无对侧登记',
                            floor: t ? t.floor : null,
                            sides: { 'a-to-b': attA, 'b-to-a': attB }
                        });
                    }
                }
                for (const sk of ['a-to-b', 'b-to-a']) {
                    const sd = sides[sk];
                    if (!sd) continue;
                    for (const t of sd.turns) {
                        if (t.closedFloor === null) continue;
                        const successor = sd.turns.some((x) => x.floor !== null && x.floor > t.closedFloor);
                        if (!successor) {
                            unresolved.push({
                                kind: 'closed-without-successor',
                                detail: sd.from + '→' + sd.to + '：' + t.label + ' 于第 ' + t.closedFloor + ' 楼前结束，同侧无后继',
                                floor: t.closedFloor,
                                sides: { 'a-to-b': attA, 'b-to-a': attB }
                            });
                        }
                    }
                }
                const turnsAll = allTurns.slice().sort(byFloorAsc);
                const rec = {
                    key: p.key,
                    a: p.a,
                    b: p.b,
                    byName: p.byName,
                    sides: sides,
                    mutual: both,
                    divergent: attA !== null && attB !== null && attA !== attB,
                    /* 合并时间轴：**只报「先后」，不报「因为所以」** ——
                     *   同侧两条边的 floor 先后是**事实**，因果由 M3-X3 走证据确认。 */
                    turns: turnsAll.slice(0, maxTurns),
                    turnsTruncated: Math.max(0, turnsAll.length - maxTurns),
                    unresolved: unresolved,
                    floorsKnown: turnsAll.filter((x) => x.floor !== null).length,
                    floorsUnknown: noFloor
                };
                built.push(rec);
                out.counts.turns += turnsAll.length;
                out.counts.unresolved += unresolved.length;
                out.counts.noFloor += noFloor;
                if (both) out.counts.mutual++;
                if (rec.divergent) out.counts.divergent++;
            }
            /* 排序：转折多的排前（信息量优先），同分按键稳定（可复算，不依赖插入序）。 */
            built.sort((x, y) => (y.turns.length - x.turns.length) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
            out.counts.pairs = built.length;
            out.pairs = built.slice(0, maxPairs);
            out.truncated = Math.max(0, built.length - out.pairs.length);
            return out;
        } catch (_e) {
            /* 不抛：降级读数**不伪装成「没有关系变化」**。
             *   pairs 归零会让「图里没边」与「算炸了」同形，故显式标 degraded。 */
            out.pairs = [];
            out.degraded = true;
            return out;
        }
    }
    /**
     * 指定时点的状态快照（M3-X2 验收「支持指定时点比较」）。
     *   **时点语义是「截至该楼层已经发生的」**：起始楼层 > 该楼层的边一律不计入
     *   ——「还没发生的事」不得出现在那个时点的快照里（那是本仓最忌的错读数之一）。
     * @param {Array} edges 同 build
     * @param {number} floor 指定时点楼层
     * @returns {object} { kind, version, floor, pairs:[{key,a,b,sides:{...},turnsAt}], counts, malformedInput }
     */
    function asOf(edges, floor) {
        const at = floorOrNull(floor);
        const full = build(edges, {});
        const out = {
            kind: RH_KIND + '@floor',
            version: RH_VERSION,
            floor: at,
            pairs: [],
            counts: { pairs: 0, at: 0 },
            /* 时点读不到 ⇒ 如实标 null 并给**空**（不猜一个楼号）：
             *   猜 0 会得到一个「都在第 0 楼之后」的假快照。 */
            floorKnown: at !== null,
            malformedInput: full.malformedInput,
            degraded: full.degraded,
            writesNothing: true
        };
        try {
            if (at === null) return out;
            for (const p of full.pairs) {
                const sides = { 'a-to-b': null, 'b-to-a': null };
                let turnsAt = 0;
                for (const sk of ['a-to-b', 'b-to-a']) {
                    const sd = p.sides[sk];
                    if (!sd) continue;
                    /* 起始楼层读不到的边（floor=null）**不计入任何时点**：
                     *   放进快照等于凭一个不知道楼号的边去替那一时刻作证。 */
                    const upto = sd.turns.filter((t) => t.floor !== null && t.floor <= at);
                    turnsAt += upto.length;
                    sides[sk] = upto.length ? {
                        from: sd.from, to: sd.to, count: upto.length,
                        turns: upto,
                        latest: upto[upto.length - 1],
                        attitude: upto[upto.length - 1].attitude
                    } : null;
                }
                if (!turnsAt) continue;
                out.pairs.push({ key: p.key, a: p.a, b: p.b, byName: p.byName, sides: sides, turnsAt: turnsAt });
            }
            out.counts.pairs = out.pairs.length;
            out.counts.at = at;
            return out;
        } catch (_e) {
            out.pairs = [];
            out.degraded = true;
            return out;
        }
    }
    /**
     * 轨迹读数一句话（供诊断 / 自检行）。
     * 三态**必须分开说**：把「两侧不一致」并进「对侧未登记」会让读者以为
     *   「该补记的有 N 条」，从而去补一条其实只是看法不同的关系（那比不标更糟）。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '关系轨迹异常（已降级，不外抛）';
        if (r.malformedInput) return '关系边输入畸形（不是数组）—— 无从成轨迹';
        if (!r.pairs || !r.pairs.length) return '暂无关系轨迹';
        const c = r.counts || {};
        const parts = ['人物对 ' + (c.pairs || 0), '双向 ' + (c.mutual || 0)];
        if (c.turns) parts.push('轨迹点 ' + c.turns);
        if (c.divergent) parts.push('两侧看法不同 ' + c.divergent);
        if (c.unresolved) parts.push('未解决 ' + c.unresolved);
        if (c.noFloor) parts.push('**出处不明 ' + c.noFloor + '**');
        if (r.byName) parts.push('含按名聚合 ⚠️');
        if (r.truncated) parts.push('人物对截断 ' + r.truncated);
        if (r.turnsTruncated) parts.push('轨迹点截断 ' + r.turnsTruncated);
        return parts.join(' · ');
    }
    /**
     * 自检：**幂等 + 只读面 + 三态齐 + 可序列化**，四条当场自证。
     *   四条的动机各是：同一入参两次结果必须逐字相同（无模块级可变状态）；
     *   导出名里不许出现 mutating 名；未解决项三类词表必须完整（少一类某处境无处安放）；
     *   读数必须是纯 JSON 面（无函数 / 无循环引用）。
     */
    function selfCheck(edges) {
        const a = build(edges, {});
        const b = build(edges, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((m) => n.toLowerCase().indexOf(m) === 0)).length;
        const kindsComplete = UNRESOLVED_KINDS.length === 3
            && ['divergent-attitude', 'side-missing', 'closed-without-successor'].every((k) => UNRESOLVED_KINDS.indexOf(k) >= 0);
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === RH_KIND; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && kindsComplete && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            kindsComplete: kindsComplete,
            serializable: serializable,
            pairs: (a.counts || {}).pairs || 0
        };
    }
    const api = {
        RH_VERSION: RH_VERSION,
        RH_KIND: RH_KIND,
        ATTITUDES: ATTITUDES,
        UNRESOLVED_KINDS: UNRESOLVED_KINDS,
        MAX_TURNS: MAX_TURNS,
        MAX_PAIRS: MAX_PAIRS,
        pairOf: pairOf,
        sideOf: sideOf,
        labelOf: labelOf,
        attitudeOf: attitudeOf,
        build: build,
        asOf: asOf,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaRelationHistory = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);