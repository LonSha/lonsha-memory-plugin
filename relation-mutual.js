/* ========================================================
 * relation-mutual.js — [v3.219.0] 双向关系对账（单向边的「对侧在不在」）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件的图谱关系边是**单向主观**的（`from` 看 `to`），提取提示词第 3 条明写
 *   「A看B 与 B看A 可能不同，分别各记一条」。而注入侧（buildInjection 的 [角色关系] 块）
 *   只把召回到的每条边原样列出来：
 *       - 甲 → 乙：挚友[友好·社交]
 *   修前**没有任何一格**说「对侧那条（乙 → 甲）到底在不在」。后果是：
 *     · 只登记了一侧时，模型读到「甲对乙是挚友」，**默认它是相互的** ——
 *       而乙对甲可能压根是另一回事，只是**没人记过**；
 *     · 「乙对甲是警惕」与「乙对甲从未登记」在注入面上**同形**（都只是没有那一行），
 *       而两者处置相反：前者照常扮演，后者是**提取漏了一条**，该补记。
 *   这正是本仓反复点名的塌陷形态：**「没给」与「给了别的」被读成同一件事**。
 *
 * 【三态不是二态：对侧「不在」有三种来源，处置方向互不相同】
 *   · mutual          对侧也在**本轮注入**里 —— 关系确实是双向的，照常扮演；
 *   · mutual-gated    对侧在图里，但**本轮被披露条件挡下**（relation-disclosure 的
 *                     disclosure 未触发）—— 不是漏记，是「此刻不该给模型看」，
 *                     等情境对了下一轮自己会出现，**不要补记**；
 *   · mutual-expired  对侧**曾经存在但已失效**（`active === false`，如「曾经的恋人」）
 *                     —— 关系确实结束了，该按历史边处理，**也不要补记**；
 *   · one-sided       对侧**压根不在图里** —— 这才是「提取漏了一条」，
 *                     是唯一需要 AI 补记的那一态。
 *   把后三态压成一态（「对侧不在」）就会把「该补记」与「不该补记」混为一谈，
 *   让模型去凭空补一条已经失效或当下不该披露的关系 —— 那比不标更糟。
 *
 * 【为什么对账需要「图里的全量边」而不只是本轮召回到的边】
 *   只看召回集合，「对侧在图里但被挡下」与「对侧从未登记」**必然同形**
 *   （两者的可见证据都是「召回集合里没有」）。故 reconcile 显式收两份输入：
 *   图里的全量关系边 + 本轮实际进入注入的那批。调用方（index.js）已有这两份。
 *
 * 【三条纪律（与 relation-disclosure.js / npc-ties.js 同规格）】
 *   ① 只读：不改边、不删边、不写图、不写账；
 *   ② 不抛：输入畸形一律降级为读数（malformed 计数），绝不外抛
 *      —— 本模块跑在注入路径上（生成前），抛一次会连坐整轮注入；
 *   ③ 不猜：判不开的一律不计入任何一态，只进 malformed；不给冒充值。
 *
 * 【与既有模块的分工（互不重叠）】
 *   relation-disclosure.js  答「这条**已确认过**的关系此刻该不该给模型看」——注入侧筛选
 *   npc-ties.js             答「NPC 的长期关系网怎么渲染」——文本聚合
 *   crosslink.js            答「两个条目共享哪个词」——条目间弱关系
 *   本模块                   答「这条边的**对侧**在不在、不在是哪种不在」——对账
 *   本模块只做**对账**：不改任何边，也不改变披露判定的结果（它读披露的产物）。
 *
 * 【可移植性说明】
 *   机制动机来自「单向边被读者默认成对称」这一通用失效形态；实现按本仓规范重写
 *   （零依赖、不抛、分态到处置可分、读数齐备），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    const MUTUAL_VERSION = 1;
    const MUTUAL_KIND = 'relation_mutual';

    /** 单行化（换行折叠为空格） */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }

    /**
     * 关系边的规范化键（**有序**：from→to）。
     *   刻意不做「无序去重」：本模块判的正是方向性 —— 把 A→B 与 B→A 归成同一个键，
     *   就等于在数据层先把「单向」抹平，那正是要治的那个错。
     */
    function edgeKey(from, to) {
        return oneLine(from) + '\u0000' + oneLine(to);
    }

    /** 取一条边的可读标签（label 优先，退化到 relation / type） */
    function labelOf(e) {
        return oneLine(e && (e.label || e.relation || e.type)) || '相关';
    }

    /**
     * 双向关系对账（纯函数、不抛）。
     *
     * @param {Array} edges  图里的**全量**关系边（每项至少含 from / to；label 可选）
     * @param {Array} kept   本轮**实际进入注入**的那批边（同上）
     * @param {object} [opts] { maxList?:number } 逐条清单上限（默认 5，截断计入 truncated）
     * @returns {object} 结构恒定读数（消费方不必判 undefined）
     */
    function reconcile(edges, kept, opts) {
        const o = opts || {};
        const maxList = Number.isFinite(Number(o.maxList)) && Number(o.maxList) >= 0 ? Math.floor(Number(o.maxList)) : 5;
        const out = {
            kind: MUTUAL_KIND,
            version: MUTUAL_VERSION,
            total: 0,                 // 参与对账的边数（已排除 malformed / self）
            mutual: 0,                // 对侧也在本轮注入
            mutualGated: 0,           // 对侧在图里、本轮被披露条件挡下
            mutualExpired: 0,         // 对侧曾存在但已失效
            oneSided: 0,              // 对侧压根不在图里（**唯一需要补记的一态**）
            self: 0,                  // from === to（自指，异常）
            malformed: 0,             // 缺 from / to（读不懂的输入）
            truncated: 0,             // 逐条清单被截断的条数（**截断必须可见**）
            oneSidedList: [],         // 需要补记的那批（有界）
            gatedList: [],            // 被挡下的那批（有界；与「漏记」分开列，免得混读）
            malformedInput: false     // edges 不是数组（**与「空图」分开报**）
        };
        try {
            const list = Array.isArray(edges) ? edges : [];
            out.malformedInput = !Array.isArray(edges) && edges !== undefined && edges !== null;
            /* 建两张索引：
             *   byDir  —— 有序键 → 边（判「对侧在不在」）
             *   keptSet—— 有序键集合（判「对侧在本轮注入里吗」）
             * 对侧判定必须按**方向反转**查（e.to → e.from），不能按无序键查。 */
            const byDir = new Map();
            for (const e of list) {
                if (!e || typeof e !== 'object') { out.malformed++; continue; }
                const from = oneLine(e.from), to = oneLine(e.to);
                if (!from || !to) { out.malformed++; continue; }
                if (from === to) { out.self++; continue; }
                const k = edgeKey(from, to);
                /* 同向多标签边（师徒 + 恋人）都要留：只保留一条会让对侧判定漏判。
                 *   故存数组，不存单条。 */
                if (!byDir.has(k)) byDir.set(k, []);
                byDir.get(k).push(e);
            }
            const keptSet = new Set();
            for (const e of (Array.isArray(kept) ? kept : [])) {
                if (!e || typeof e !== 'object') continue;
                const from = oneLine(e.from), to = oneLine(e.to);
                if (!from || !to || from === to) continue;
                keptSet.add(edgeKey(from, to));
            }
            const oneSidedRaw = [], gatedRaw = [];
            for (const e of list) {
                if (!e || typeof e !== 'object') continue;
                const from = oneLine(e.from), to = oneLine(e.to);
                if (!from || !to || from === to) continue;
                out.total++;
                const rev = byDir.get(edgeKey(to, from));
                const revLive = Array.isArray(rev) ? rev.filter(x => x && x.active !== false) : [];
                if (revLive.length) {
                    // 对侧存在且未失效：再看它本轮有没有进注入
                    if (keptSet.has(edgeKey(to, from))) out.mutual++;
                    else { out.mutualGated++; gatedRaw.push({ from, to, label: labelOf(e), reason: '对侧未进本轮注入' }); }
                } else if (Array.isArray(rev) && rev.length) {
                    // 对侧有记录但全部 active === false ⇒ 曾经存在、已失效
                    out.mutualExpired++;
                } else {
                    out.oneSided++;
                    oneSidedRaw.push({ from, to, label: labelOf(e) });
                }
            }
            out.oneSidedList = oneSidedRaw.slice(0, maxList);
            out.gatedList = gatedRaw.slice(0, maxList);
            /* 截断必须可见：清单被截掉多少条要报出来，否则「只列了 5 条」与
             *   「真的只有 5 条」同形（本仓一贯纪律）。 */
            out.truncated = Math.max(0, oneSidedRaw.length - out.oneSidedList.length)
                + Math.max(0, gatedRaw.length - out.gatedList.length);
            return out;
        } catch (_e) {
            /* 不抛：注入路径上抛一次会连坐整轮。降级读数**不伪装成「都对上了」**：
             *   total 归零会让「本轮没边」与「算炸了」同形，故显式标 degraded。 */
            return Object.assign({}, out, { degraded: true });
        }
    }

    /**
     * 对账读数的一句话（供诊断/自检行）。
     * 四态**必须分开说**：把 mutualGated / mutualExpired 并进 oneSided 会让读者
     *   以为「该补记的有 N 条」，从而去补一条被挡下或已失效的关系。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '对账异常（已降级，不外抛）';
        if (r.malformedInput) return '关系边输入畸形（不是数组）—— 无从对账';
        if (!r.total) return '本轮无关系边';
        const parts = ['对账 ' + r.total + ' 条', '双向 ' + (r.mutual || 0)];
        if (r.mutualGated) parts.push('对侧本轮被挡 ' + r.mutualGated);
        if (r.mutualExpired) parts.push('对侧已失效 ' + r.mutualExpired);
        if (r.oneSided) parts.push('**对侧未登记 ' + r.oneSided + '**');
        if (r.self) parts.push('自指 ' + r.self);
        if (r.malformed) parts.push('畸形 ' + r.malformed);
        if (r.truncated) parts.push('清单截断 ' + r.truncated);
        return parts.join(' · ');
    }

    /**
     * 单条边的对账标注（注入渲染用）。
     * 只对 **one-sided** 标注：另外两态（被挡 / 已失效）标了反而误导 ——
     *   前者是「此刻不该给模型看」（标注等于把它又说了出来），
     *   后者历史边自带「（曾于第 N 楼前）」的既有标注，无需重复。
     * @returns {string} 标注串（无需标注时返回 ''）
     */
    function annotate(e, read) {
        const r = read || {};
        if (!r.oneSided || !Array.isArray(r.oneSidedList)) return '';
        const from = oneLine(e && e.from), to = oneLine(e && e.to);
        if (!from || !to) return '';
        for (const x of r.oneSidedList) {
            if (x && x.from === from && x.to === to) return '〔对侧未登记·勿当对称〕';
        }
        return '';
    }

    const api = {
        MUTUAL_VERSION: MUTUAL_VERSION,
        MUTUAL_KIND: MUTUAL_KIND,
        edgeKey: edgeKey,
        reconcile: reconcile,
        line: line,
        annotate: annotate
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaRelationMutual = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
