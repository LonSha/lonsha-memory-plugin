/* ========================================================
 * node-rollup.js — 节点汇总（Node Rollup / 语义压缩父节点）
 *
 * 【来源】移植 Luker memory-graph 的 compactNodes + createRollupWithChildren
 *   （public/scripts/extensions/memory-graph/main.js:5287）。
 *   本模块只搬**纯判据**，不搬它的存储层与钩子装配。
 *
 * 【为什么需要】LonSha 的记忆图只增不减：`vacuum()` 只处理「时态历史边压缩」与
 *   「孤儿节点回收」两件事，节点数本身没有收敛通道。长线跑下来，
 *   同一批角色/事件会以几百个平铺节点存在，`findNodesMentionedIn` 的返回集
 *   越来越大、召回排序里互相挤占——这正是 Luker 那条「语义层级压缩」要解的问题。
 *
 * 【与 vacuum 的分工】**不重叠**：
 *   · vacuum   —— 删东西（历史边、孤儿节点），对象是「已经没用的」；
 *   · rollup   —— 加一层（父节点 + semantic_contains 边），对象是「还有用但太散的」。
 *   rollup 不删任何子节点，只给它们一个共同父级。
 *
 * 【纪律】判不了就不压：可压性由子节点自身字段（floor / seq）决定，
 *   字段缺失时**不让该节点参与**边界计算，而不是拿 0 充数——
 *   拿 0 充数会让 rolledFloorRange 变成 [0, N]，把「有一半节点没有楼层信息」
 *   伪装成「这批覆盖了从第 0 楼开始」。
 * ======================================================== */
'use strict';
(function (global) {
    const ROLLUP_VERSION = 1;

    /** 汇总节点类型标记（写进 node.data，供诊断面与下游识别）。 */
    const ROLLUP_KIND = 'semantic_rollup';

    /**
     * 计算一组子节点的汇总边界。
     *
     * 与 Luker 同款的三条口径：
     *  1. **部分覆盖** —— 有 floor 的子节点贡献边界，没有的**不否决**父节点边界，也不贡献；
     *  2. 严格 `typeof === 'number' && Number.isFinite` 守卫，拒绝字符串 '3' 与 NaN；
     *  3. 一个带边界信息的都没有 → 返回 null（**不返回 [0,0]**，那是在编造覆盖范围）。
     *
     * @param {Array<object>} children
     * @param {string} field 取值字段，默认 'floor'（LonSha 图上节点用 floor；也有节点用 seq）
     * @returns {{start:number,end:number,contributors:number,skipped:number}|null}
     */
    function rollupRange(children, field = 'floor') {
        const list = Array.isArray(children) ? children : [];
        const withRange = [];
        let skipped = 0;
        for (const c of list) {
            // 兼容两种形状：直接带字段，或放在 data 里（本仓 addNode 把来源信息塞进 data）
            const raw = (c && typeof c === 'object')
                ? (c[field] !== undefined ? c[field] : (c.data ? c.data[field] : undefined))
                : undefined;
            if (typeof raw === 'number' && Number.isFinite(raw)) withRange.push(raw);
            else skipped++;
        }
        if (!withRange.length) return null;
        return {
            start: Math.min.apply(null, withRange),
            end: Math.max.apply(null, withRange),
            contributors: withRange.length,
            skipped,
        };
    }

    /**
     * 判断一批节点是否「可压」。
     *
     * 拒绝条件（每条都对应一种真实误用）：
     *  · 空/非数组 childIds → 压出个空父节点，纯噪声；
     *  · summary 全空白    → 父节点没有内容，等于给图加噪声节点；
     *  · 任意子节点已被别的 rollup 认领（data.rollupParent）→ **一层只能有一个父**，
     *    重复认领会让 re-parent 互相覆盖，压完的图与压之前不一致；
     *  · 子节点数 < minChildren → 两三个节点压成一层得不偿失（默认 4）。
     *
     * @returns {{ok:boolean, reason:string, children:Array<object>}}
     */
    function canRollup(nodes, childIds, summary, opts = {}) {
        const minChildren = Math.max(2, Number(opts.minChildren) || 4);
        if (!Array.isArray(childIds) || childIds.length === 0) {
            return { ok: false, reason: 'no-children', children: [] };
        }
        const map = (nodes && typeof nodes.get === 'function') ? nodes : new Map(Object.entries(nodes || {}));
        const children = [];
        const missing = [];
        for (const id of childIds) {
            const n = map.get(String(id));
            if (n) children.push(n); else missing.push(String(id));
        }
        // 有 id 找不到节点：**整批评判失败**，不做「有多少压多少」——
        // 那会让父节点覆盖范围比调用方以为的小，而调用方无从知道。
        if (missing.length) return { ok: false, reason: 'child-not-found:' + missing.join(','), children };
        if (children.length < minChildren) {
            return { ok: false, reason: 'too-few-children(' + children.length + '<' + minChildren + ')', children };
        }
        if (!String(summary == null ? '' : summary).trim()) {
            return { ok: false, reason: 'empty-summary', children };
        }
        const claimed = children.filter(c => c && c.data && c.data.rollupParent);
        if (claimed.length) {
            return { ok: false, reason: 'already-claimed:' + claimed.map(c => c.id).join(','), children };
        }
        // 重复 id：同一子节点被列两次会生成两条 semantic_contains 边与重复的 rollupFrom 条目，
        // 父节点的「覆盖 N 节点」随之虚高——计数类判据必须先净化输入。
        const seen = new Set();
        const dup = [];
        for (const id of childIds.map(String)) {
            if (seen.has(id)) dup.push(id); else seen.add(id);
        }
        if (dup.length) return { ok: false, reason: 'duplicate-children:' + dup.join(','), children };
        return { ok: true, reason: 'ok', children };
    }

    /**
     * 生成父节点的构造参数（纯函数：不碰图，调用方自己去 addNode/addEdge）。
     *
     * 为什么不让本模块直接改图：图的写入路径在本仓有四条（提取/补提取/世界书导入/回滚重放），
     * 模块直接改图会绕过其中三条的记账（graphOps 事件溯源、nameIndex 重建、快照）。
     * 所以这里只产出「该建什么」，写入仍是宿主的职责。
     *
     * @returns {{ok:boolean, reason:string, parent:object|null, childIds:string[]}}
     */
    function planRollup(nodes, childIds, summary, opts = {}) {
        const verdict = canRollup(nodes, childIds, summary, opts);
        if (!verdict.ok) return { ok: false, reason: verdict.reason, parent: null, childIds: [] };
        const children = verdict.children;
        const range = rollupRange(children, opts.rangeField || 'floor');
        // 层级 = 最深子节点 + 1（Luker 同款）。缺失 depth 视为 0，故全部缺失时父层为 1。
        let maxDepth = 0;
        for (const c of children) {
            const d = Number(c && c.semanticDepth);
            if (Number.isFinite(d) && d > maxDepth) maxDepth = d;
        }
        const label = String(opts.label || opts.type || '汇总');
        const parent = {
            type: String(opts.type || 'rollup'),
            name: label + ' 汇总 L' + (maxDepth + 1) + '（' + children.length + '节）',
            data: {
                rollupKind: ROLLUP_KIND,
                rollupDepth: maxDepth + 1,
                rollupFrom: children.map(c => String(c.id)),
                rollupSummary: String(summary).trim(),
                // 楼层边界：**只在这批里真有楼层信息时才写**。
                // 一个都没有时整个字段不出现，而不是写个 null/0 让人以为算过。
                ...(range ? { rollupFloorStart: range.start, rollupFloorEnd: range.end } : {}),
                rollupContributors: range ? range.contributors : 0,
                rollupSkipped: range ? range.skipped : children.length,
                floor: range ? range.start : undefined,
            },
        };
        return { ok: true, reason: 'ok', parent, childIds: children.map(c => String(c.id)) };
    }

    /**
     * 一句话读数（诊断面用）。
     * 回答「图里现在有几个汇总节点、它们盖住了多少子节点」。
     * 无汇总节点时如实报 0，不装成「已压缩」。
     */
    function line(nodes) {
        try {
            const list = [];
            const map = (nodes && typeof nodes.get === 'function')
                ? Array.from(nodes.values())
                : Object.values(nodes || {});
            for (const n of map) {
                if (n && n.data && n.data.rollupKind === ROLLUP_KIND) list.push(n);
            }
            if (!list.length) return '汇总 0 层（图未压缩）';
            let covered = 0;
            let ranged = 0;
            for (const n of list) {
                covered += Array.isArray(n.data.rollupFrom) ? n.data.rollupFrom.length : 0;
                if (typeof n.data.rollupFloorStart === 'number') ranged++;
            }
            // 「有多少层算出了楼层边界」必须报：全是 undefined 与全都算出来，
            // 在只看层数时同形（本仓 I5/I6 同款口径）。
            return '汇总 ' + list.length + ' 层 · 覆盖 ' + covered + ' 节点 · 有边界 ' + ranged + '/' + list.length;
        } catch (_e) { return '—（诊断异常）'; }
    }

    const api = {
        ROLLUP_VERSION,
        ROLLUP_KIND,
        rollupRange,
        canRollup,
        planRollup,
        line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : global;
    try { g.LonShaNodeRollup = Object.freeze(api); } catch (e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
