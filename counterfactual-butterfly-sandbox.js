/* ============================================================
 * counterfactual-butterfly-sandbox.js — [v3.460.0 · V21-L7]
 * 反事实沙盒防火墙正史隔离与分支演化沙盘 (Counterfactual Butterfly Sandbox)
 * ------------------------------------------------------------
 * 1. 物理隔离推演分支（Forked In-Memory World Sandbox）
 * 2. 蝴蝶效应级联推演（Hypothetical Butterfly Ripple Engine）
 * 3. 一键安全试算与零正史污染回退（Safe Rollback Guarantee）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCounterfactualSandbox = factory();
        root.CounterfactualButterflySandbox = root.LonShaCounterfactualSandbox;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createSandboxState() {
        return {
            version: VERSION,
            activeSandboxes: new Map(), // sandboxId -> { baseSnapshot, mutations, divergentEffects }
            updatedAt: Date.now()
        };
    }

    function forkHypotheticalSandbox(state, baselineSnapshot = {}) {
        if (!state || !state.activeSandboxes) return null;
        const sandboxId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const sandbox = {
            sandboxId,
            baseSnapshot: JSON.parse(JSON.stringify(baselineSnapshot || {})),
            mutations: [],
            divergentEffects: [],
            createdAt: Date.now()
        };
        state.activeSandboxes.set(sandboxId, sandbox);
        state.updatedAt = Date.now();
        return sandbox;
    }

    function applyCounterfactualMutation(state, sandboxId, mutation = {}) {
        if (!state || !state.activeSandboxes) return false;
        const sb = state.activeSandboxes.get(sandboxId);
        if (!sb) return false;
        const entry = {
            id: `mut_${Date.now()}`,
            hypotheticalAction: String(mutation.action || ""),
            divergentOutcome: String(mutation.outcome || ""),
            rippleEffect: String(mutation.rippleEffect || ""),
            appliedAt: Date.now()
        };
        sb.mutations.push(entry);
        sb.divergentEffects.push(entry.divergentOutcome);
        state.updatedAt = Date.now();
        return true;
    }

    function discardSandbox(state, sandboxId) {
        if (!state || !state.activeSandboxes) return false;
        const res = state.activeSandboxes.delete(sandboxId);
        state.updatedAt = Date.now();
        return res;
    }

    /* ============================================================
     * [v3.464.0 · L21-O4 水合面补齐] / [v3.465.1 L21-O4 复检：按本模块形状归一]
     * 为什么必须补：宿主 `engine-persistence-ops.js` 的水合表把本模块登记成
     *   `hydrateSandboxState`，而本文件此前根本没有这个函数 —— 恢复路径上
     *   `typeof mod['hydrateSandboxState'] === 'function'` 恒假，静默走 `: _ext[key]` 兜底，
     *   把**原始 payload**直接赋给宿主字段。表面上「恢复了」，实际装进去的是没经归一的数据。
     *
     * ★ [v3.465.1] 首版这里写的是「以默认形状为底逐键浅合并」的通用实现。复检判定它
     *   **本身就是它声称要修的那个病**：
     *     ① 19 个模块共用同一份通用体 => 逐字副本簇（`tests/v3281_o7_module_copy_ledger.test.mjs`
     *        的 B1 当场翻红，点名 hydrateState 一簇 11 成员）。本仓「两份实现即第二真源」。
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 activeSandboxes 是
     *        `Map<sandboxId, {baseSnapshot, mutations, divergentEffects}>`，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createSandboxState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        /* activeSandboxes 的正体是 Map，落盘走 JSON 后只剩 entries —— **必须重建 Map**。
         * 把存档对象直接写回字段，此后每次 .get / .set 都是 TypeError（首版通用浅合并正是这么坏的）。*/
        let entries = [];
        if (saved.activeSandboxes instanceof Map) entries = Array.from(saved.activeSandboxes.entries());
        else if (Array.isArray(saved.activeSandboxes)) entries = saved.activeSandboxes;
        else if (saved.activeSandboxes && typeof saved.activeSandboxes === 'object') entries = Object.entries(saved.activeSandboxes);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            const v = pair[1];
            const box = (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
            s.activeSandboxes.set(String(pair[0]), {
                baseSnapshot: (box.baseSnapshot && typeof box.baseSnapshot === 'object' && !Array.isArray(box.baseSnapshot)) ? box.baseSnapshot : {},
                mutations: Array.isArray(box.mutations) ? box.mutations.slice() : [],
                divergentEffects: Array.isArray(box.divergentEffects) ? box.divergentEffects.slice() : []
            });
        }
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateSandboxState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateSandboxState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialSandboxState`，
     * 而本文件的默认状态构造叫 `createSandboxState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialSandboxState = createSandboxState;

    return {
        VERSION,
        createSandboxState,
        forkHypotheticalSandbox,
        applyCounterfactualMutation,
        discardSandbox,
        hydrateState,
        hydrateSandboxState,
        createInitialSandboxState
    };
}));
