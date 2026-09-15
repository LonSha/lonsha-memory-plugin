/**
 * dependency-closure.js — [v3.103 缝合] 依赖闭包级联裁剪引擎
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）domain/memory-branch.js 的
 *         forkMemoryLedger 依赖收敛算法，按本插件工程规范重写为可测纯函数模块。
 *
 * 【机制】分叉/删除楼层时，不是所有派生条目都能原样搬过去：
 *   一条派生记忆（revision）可能引用「外部证据」（refs，如某楼层的 turn evidence）
 *   与「上游派生条目」（deps）。只要其中任一项保不住，这条记忆就是没有依据的
 *   悬挂条目 —— 必须连带失效，而不是留在库里当幽灵。
 *
 *   源码用「多轮扫描 + progressed 标记」做这个收敛（O(n²)，且环内条目会被
 *   静默丢弃）。本实现等价语义但改用「根因 + 反向依赖 BFS 传播」：
 *     1) 根因 = refs 中存在 allowedRefs 之外的引用（依据已不存在）
 *     2) 沿反向依赖边（dep → dependents）传播丢弃
 *     3) 显式检测依赖环：环内若无人持有外部根因，则整体保留（不再静默丢弃），
 *        并由 `cycles` 字段回报，交给调用方决策
 *   复杂度 O(V+E)，同时提供 kept 的拓扑序（上游先于下游）。
 *
 * 【与源码差异】
 *   - 纯函数、零依赖、IIFE 双导出
 *   - 增加 droppedBy 归因（每条被丢弃条目记录根因，便于诊断「为什么它没了」）
 *   - 增加 cycles 回报与 keepCycles 开关（源码对无根因环会静默吞掉）
 */

(function (global) {
    'use strict';

    /** 数组归一为去重字符串集合 */
    function toSet(values) {
        const out = new Set();
        for (const v of (Array.isArray(values) ? values : [])) {
            const s = String(v ?? '').trim();
            if (s) out.add(s);
        }
        return out;
    }

    /** 归一化条目：{ id, refs:[], deps:[] }，非法/缺 id 条目被剔除并回报 */
    function normalizeItems(items) {
        const list = [];
        const invalid = [];
        for (const raw of (Array.isArray(items) ? items : [])) {
            const id = String(raw && raw.id != null ? raw.id : '').trim();
            if (!id) { invalid.push(raw); continue; }
            list.push({
                id,
                refs: [...toSet(raw.refs)],
                deps: [...toSet(raw.deps)],
                raw,
            });
        }
        return { list, invalid };
    }

    /**
     * 依赖闭包级联裁剪。
     *
     * @param {object} input
     * @param {Array<{id:string, refs?:Array<string>, deps?:Array<string>}>} input.items
     *        候选条目；refs = 外部依赖（必须在 allowedRefs 内），deps = 条目间依赖
     * @param {Array<string>|Set<string>} [input.allowedRefs]
     *        允许引用的外部标识集合。不传 / 传 null 表示「不限制」，等价于全部依据可用
     * @param {boolean} [input.keepCycles=true]
     *        无外部根因的依赖环：true=整体保留（默认），false=整体丢弃（对齐源码行为）
     * @returns {{
     *   kept: Array<object>, dropped: Array<object>,
     *   keptIds: Array<string>, droppedIds: Array<string>,
     *   droppedBy: Object<string,string>, cycles: Array<Array<string>>,
     *   order: Array<string>, invalid: Array<*>, unrestricted: boolean
     * }}
     */
    function computeCascade(input) {
        const opts = input || {};
        const { list, invalid } = normalizeItems(opts.items);
        const unrestricted = opts.allowedRefs === undefined || opts.allowedRefs === null;
        const allowed = unrestricted ? null : (opts.allowedRefs instanceof Set ? opts.allowedRefs : toSet(opts.allowedRefs));
        const keepCycles = opts.keepCycles !== false;

        const byId = new Map();
        for (const item of list) byId.set(item.id, item);

        // 反向依赖索引：dep -> [依赖它的条目 id]
        const dependents = new Map();
        for (const item of list) {
            for (const dep of item.deps) {
                if (!dependents.has(dep)) dependents.set(dep, []);
                dependents.get(dep).push(item.id);
            }
        }

        const dropped = new Set();
        const droppedBy = {};

        // ---- 1) 根因：外部依据缺失 ----
        for (const item of list) {
            if (!unrestricted) {
                const missing = item.refs.find(r => !allowed.has(r));
                if (missing !== undefined) {
                    dropped.add(item.id);
                    droppedBy[item.id] = 'missing-ref:' + missing;
                }
            }
            // 依赖自身不存在（悬空 deps）同样是根因
            if (!dropped.has(item.id)) {
                const orphan = item.deps.find(d => !byId.has(d));
                if (orphan !== undefined) {
                    dropped.add(item.id);
                    droppedBy[item.id] = 'missing-dep:' + orphan;
                }
            }
        }

        // ---- 2) 沿反向依赖边 BFS 传播 ----
        const queue = [...dropped];
        while (queue.length) {
            const gone = queue.shift();
            for (const dependent of (dependents.get(gone) || [])) {
                if (dropped.has(dependent)) continue;
                dropped.add(dependent);
                droppedBy[dependent] = 'dep-dropped:' + gone;
                queue.push(dependent);
            }
        }

        // ---- 3) 环检测（仅在允许保留环时才有意义）----
        const alive = list.filter(i => !dropped.has(i.id));
        const cycles = findCycles(alive);
        if (cycles.length && !keepCycles) {
            for (const cyc of cycles) {
                for (const id of cyc) {
                    if (dropped.has(id)) continue;
                    dropped.add(id);
                    droppedBy[id] = 'cycle:' + cyc.join('>');
                }
            }
            // 环被丢弃后可能带出新的级联
            const q2 = cycles.flat().filter(id => dropped.has(id));
            while (q2.length) {
                const gone = q2.shift();
                for (const dependent of (dependents.get(gone) || [])) {
                    if (dropped.has(dependent)) continue;
                    dropped.add(dependent);
                    droppedBy[dependent] = 'dep-dropped:' + gone;
                    q2.push(dependent);
                }
            }
        }

        const kept = list.filter(i => !dropped.has(i.id));
        const droppedItems = list.filter(i => dropped.has(i.id));
        const order = topoSort(kept).map(i => i.id);

        return {
            kept,
            dropped: droppedItems,
            keptIds: kept.map(i => i.id),
            droppedIds: droppedItems.map(i => i.id),
            droppedBy,
            cycles,
            order,
            invalid,
            unrestricted,
        };
    }

    /** DFS 三色法找有向环（返回环成员数组，同环只报一次） */
    function findCycles(items) {
        const byId = new Map(items.map(i => [i.id, i]));
        const state = new Map(); // 0 未访问 / 1 在栈 / 2 完成
        const stack = [];
        const found = [];
        const seen = new Set();

        const visit = (id) => {
            const cur = state.get(id) || 0;
            if (cur === 2) return;
            if (cur === 1) {
                const at = stack.indexOf(id);
                const cyc = stack.slice(at >= 0 ? at : 0);
                const key = [...cyc].sort().join('|');
                if (!seen.has(key)) { seen.add(key); found.push(cyc); }
                return;
            }
            state.set(id, 1);
            stack.push(id);
            const node = byId.get(id);
            for (const dep of (node ? node.deps : [])) {
                if (byId.has(dep)) visit(dep);
            }
            stack.pop();
            state.set(id, 2);
        };

        for (const item of items) visit(item.id);
        return found;
    }

    /**
     * 拓扑排序：上游依赖先于下游输出。环内条目按原顺序兜底追加（已由 cycles 回报）。
     */
    function topoSort(items) {
        const byId = new Map(items.map(i => [i.id, i]));
        const visited = new Set();
        const inStack = new Set();
        const out = [];

        const visit = (item) => {
            if (!item || visited.has(item.id) || inStack.has(item.id)) return;
            inStack.add(item.id);
            for (const dep of item.deps) visit(byId.get(dep));
            inStack.delete(item.id);
            visited.add(item.id);
            out.push(item);
        };

        for (const item of items) visit(item);
        return out;
    }

    /**
     * 便捷封装：直接给出「可安全搬迁/保留的 id 列表」+ 丢弃归因摘要。
     * @returns {{ keep: Array<string>, drop: Array<string>, summary: string }}
     */
    function planCascade(items, allowedRefs, options) {
        const r = computeCascade(Object.assign({ items, allowedRefs }, options || {}));
        const reasons = Object.entries(r.droppedBy)
            .map(([id, why]) => `  - ${id}: ${why}`)
            .join('\n');
        return {
            keep: r.keptIds,
            drop: r.droppedIds,
            cycles: r.cycles,
            summary: `保留 ${r.keptIds.length} 条 / 丢弃 ${r.droppedIds.length} 条`
                + (r.droppedIds.length ? '\n丢弃归因:\n' + reasons : '')
                + (r.cycles.length ? `\n依赖环 ${r.cycles.length} 处` : ''),
            detail: r,
        };
    }

    const api = {
        computeCascade,
        planCascade,
        findCycles,
        topoSort,
        toSet,
        normalizeItems,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaDependencyClosure = api;
})(typeof window !== 'undefined' ? window : globalThis);