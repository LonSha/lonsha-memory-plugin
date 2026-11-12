/* ============================================================
 * sleep-consolidation-graph-pruner.js — [v3.460.0 · V21-L3]
 * 长期记忆深睡眠巩固与图谱拓扑压缩中枢 (Sleep Consolidation Graph Pruner)
 * ------------------------------------------------------------
 * 解决长局会话上千轮后上下文爆炸与记忆冗余退化问题：
 * 1. 慢波睡眠模拟记忆重放（Slow-Wave SMR Replay & Saliency Scoring）
 * 2. 枝节细碎事实图谱拓扑修剪（Topological Graph Folding）
 * 3. 长期核心心路历程长篇摘要提取（Longitudinal Episodic Distillation）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSleepConsolidation = factory();
        root.SleepConsolidationGraphPruner = root.LonShaSleepConsolidation;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createSleepConsolidationState() {
        return {
            version: VERSION,
            consolidationCycles: [],
            distilledSummaries: [],
            lastConsolidatedAt: null,
            updatedAt: Date.now()
        };
    }

    function runSleepConsolidation(state, memoryAtlas = {}, options = {}) {
        if (!memoryAtlas || typeof memoryAtlas !== "object") {
            return { ok: false, prunedNodes: 0, retainedNodes: 0, distilled: null };
        }
        const minSignificance = Number(options.minSignificance || 0.4);
        const nodes = Array.isArray(memoryAtlas.nodes) ? memoryAtlas.nodes : [];
        const pruned = [];
        const retained = [];

        for (const node of nodes) {
            const score = Number(node.significance ?? node.importance ?? 0.5);
            const isAnchored = node.pinned === true || node.locked === true;
            if (isAnchored || score >= minSignificance) {
                retained.push(node);
            } else {
                pruned.push({ id: node.id, label: node.label, score });
            }
        }

        const cycleId = `cycle_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const cycleRecord = {
            cycleId,
            timestamp: Date.now(),
            prunedCount: pruned.length,
            retainedCount: retained.length,
            ratio: retained.length / (nodes.length || 1)
        };

        if (state && state.consolidationCycles) {
            state.consolidationCycles.push(cycleRecord);
            state.lastConsolidatedAt = Date.now();
            state.updatedAt = Date.now();
        }

        return {
            ok: true,
            cycleId,
            prunedNodes: pruned.length,
            retainedNodes: retained.length,
            retainedList: retained,
            prunedList: pruned
        };
    }

    /* ============================================================
     * [v3.464.0 · L21-O4 水合面补齐] / [v3.465.1 L21-O4 复检：按本模块形状归一]
     * 为什么必须补：宿主 `engine-persistence-ops.js` 的水合表把本模块登记成
     *   `hydrateState`，而本文件此前根本没有这个函数 —— 恢复路径上
     *   `typeof mod['hydrateState'] === 'function'` 恒假，静默走 `: _ext[key]` 兜底，
     *   把**原始 payload**直接赋给宿主字段。表面上「恢复了」，实际装进去的是没经归一的数据。
     *
     * ★ [v3.465.1] 首版这里写的是「以默认形状为底逐键浅合并」的通用实现。复检判定它
     *   **本身就是它声称要修的那个病**：
     *     ① 19 个模块共用同一份通用体 => 逐字副本簇（`tests/v3281_o7_module_copy_ledger.test.mjs`
     *        的 B1 当场翻红，点名 hydrateState 一簇 11 成员）。本仓「两份实现即第二真源」。
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 consolidationCycles / distilledSummaries / lastConsolidatedAt 是
     *        两个数组 + 一个可空时间戳（`null` = 从没巩固过），而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
     *        浅合并会把普通对象原样写回字段，此后本模块每次 `.get` / `.has` / `.add`
     *        都是 TypeError。「登记成立」不等于「恢复正确」。
     *   故按本模块真实形状逐字段归一（与同族 37 个已有 hydrateState 的口径一致：
     *   只取认得的键、逐字段夹紧、构造正确的容器类型），并且**不再**与任何模块逐字相同。
     *
     * 口径（刻意**不抛错**，与同族 createState 的宽容度一致）：
     *   ① 非对象 / null / 数组 => 整体回落默认状态；
     *   ② 只读默认形状里已有的键（野键一律丢弃：野键进状态等于第二真源）；
     *   ③ 容器按形状重建（Map/Set 由 entries/数组重建，绝不留原值）；
     *   ④ 数值按字段值域夹紧，字符串按受控枚举回落；未知值回落默认值（不抛、不猜）。
     * ============================================================ */

    function hydrateState(saved) {
        const s = createSleepConsolidationState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        if (Array.isArray(saved.consolidationCycles)) {
            for (const c of saved.consolidationCycles) {
                if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
                s.consolidationCycles.push(c);
            }
        }
        if (Array.isArray(saved.distilledSummaries)) {
            for (const d of saved.distilledSummaries) {
                if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
                s.distilledSummaries.push(d);
            }
        }
        /* lastConsolidatedAt 的默认是 null，语义是「从没巩固过」。不得用 0 冒充一个时间点 ——
         * 本仓「undefined 与真的没有同形」那条纪律说的就是这里：null 是有意义的缺省，
         * 用 0 填进去会让读侧把「没巩固过」读成「1970 年巩固过」。*/
        s.lastConsolidatedAt = Number.isFinite(Number(saved.lastConsolidatedAt)) ? Number(saved.lastConsolidatedAt) : null;
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydratePrunerState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydratePrunerState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialPrunerState`，
     * 而本文件的默认状态构造叫 `createSleepConsolidationState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialPrunerState = createSleepConsolidationState;

    return {
        VERSION,
        createSleepConsolidationState,
        runSleepConsolidation,
        hydrateState,
        hydratePrunerState,
        createInitialPrunerState
    };
}));
