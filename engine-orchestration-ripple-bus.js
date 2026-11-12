/* ============================================================
 * engine-orchestration-ripple-bus.js — [v3.460.0 · V21-L1]
 * 全引擎统一神经编排与级联波纹总线 (Engine Orchestration Ripple Bus)
 * ------------------------------------------------------------
 * 解决 20+ 可选引擎各自为战、假接线与孤立状态痛点：
 * 1. 单事件驱动拓扑链（Single-Event Driven Ripple Chain）
 * 2. 引擎执行优先级与拓扑排序（Topological Pipeline Dispatch）
 * 3. 级联反向阻断与污染拦截（Cascade Abort & Contamination Guard）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineOrchestration = factory();
        root.EngineOrchestrationRippleBus = root.LonShaEngineOrchestration;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    const PRIORITY_ORDER = Object.freeze({
        SANITY_CHECK: 10,
        CAUSAL_VALIDATION: 20,
        EMOTION_DEFENSE: 30,
        PARALLAX_SPLIT: 40,
        RECALL_DISAMBIGUATION: 50,
        PROMPT_INJECTION: 60,
        POST_SETTLE: 70
    });

    function createOrchestrationState() {
        return {
            version: VERSION,
            registeredEngines: new Map(),
            eventExecutionLog: [],
            activePipelining: false,
            updatedAt: Date.now()
        };
    }

    function registerEngine(state, engineId, descriptor = {}) {
        if (!state || !state.registeredEngines) return false;
        const id = String(engineId || "").trim();
        if (!id) return false;
        state.registeredEngines.set(id, {
            id,
            name: String(descriptor.name || id),
            priority: Number(descriptor.priority) || PRIORITY_ORDER.RECALL_DISAMBIGUATION,
            handler: typeof descriptor.handler === "function" ? descriptor.handler : null,
            enabled: descriptor.enabled !== false,
            registeredAt: Date.now()
        });
        state.updatedAt = Date.now();
        return true;
    }

    function dispatchRippleEvent(state, event = {}) {
        if (!state || !state.registeredEngines) return { ok: false, dispatched: 0, errors: [] };
        const eventType = String(event.type || "memory_update");
        const payload = event.payload || {};
        const results = [];
        const errors = [];

        const sortedEngines = Array.from(state.registeredEngines.values())
            .filter(e => e.enabled && typeof e.handler === "function")
            .sort((a, b) => a.priority - b.priority);

        let currentContext = { ...payload, __eventType: eventType, __propagatedAt: Date.now() };

        for (const engine of sortedEngines) {
            try {
                const stepResult = engine.handler(currentContext);
                if (stepResult && stepResult.abortCascade === true) {
                    results.push({ engineId: engine.id, status: "aborted", reason: stepResult.reason || "cascade_blocked" });
                    break;
                }
                if (stepResult && stepResult.mutatedContext) {
                    currentContext = { ...currentContext, ...stepResult.mutatedContext };
                }
                results.push({ engineId: engine.id, status: "ok", output: stepResult });
            } catch (err) {
                errors.push({ engineId: engine.id, error: String(err && err.message ? err.message : err) });
            }
        }

        const logEntry = {
            id: `ripple_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            eventType,
            executedCount: results.length,
            errorsCount: errors.length,
            timestamp: Date.now()
        };
        state.eventExecutionLog.push(logEntry);
        if (state.eventExecutionLog.length > 50) state.eventExecutionLog.shift();
        state.updatedAt = Date.now();

        return {
            ok: errors.length === 0,
            dispatched: results.length,
            finalContext: currentContext,
            trace: results,
            errors
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
     *     ② 更要命的是它在这些模块上**必然装脏**：本模块的 registeredEngines / eventExecutionLog 是
     *        `Map<engineId, engine>` + 数组，而落盘/读盘走 JSON —— 存档里它们是普通对象/数组，
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
        const s = createOrchestrationState();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return s;
        /* registeredEngines 的正体是 Map —— 由 entries/数组/普通对象重建。 */
        let entries = [];
        if (saved.registeredEngines instanceof Map) entries = Array.from(saved.registeredEngines.entries());
        else if (Array.isArray(saved.registeredEngines)) entries = saved.registeredEngines;
        else if (saved.registeredEngines && typeof saved.registeredEngines === 'object') entries = Object.entries(saved.registeredEngines);
        for (const pair of entries) {
            if (!Array.isArray(pair) || pair.length < 2) continue;
            s.registeredEngines.set(String(pair[0]), pair[1]);
        }
        if (Array.isArray(saved.eventExecutionLog)) {
            for (const e of saved.eventExecutionLog) {
                if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
                s.eventExecutionLog.push(e);
            }
        }
        s.activePipelining = saved.activePipelining === true;
        if (Number.isFinite(Number(saved.updatedAt))) s.updatedAt = Number(saved.updatedAt);
        return s;
    }

    /* [v3.464.0 · L21-O4] 按水合表的**登记名**导出别名。
     * 宿主 `engine-persistence-ops.js` 登记的是 `hydrateRippleState`（专用名），
     * 而本文件的水合实现收敛在 hydrateState 一处 —— 保留单一实现，只加导出别名，
     * 避免出现两份实现（两份即第二真源，本仓 v3.444.0 的「同名两份」教训）。 */
    const hydrateRippleState = hydrateState;

    /* [v3.464.0 · L21-O4] 宿主初始化登记名别名。
     * `index.js` 的 v21Initializers 表登记的是 `createInitialRippleState`，
     * 而本文件的默认状态构造叫 `createOrchestrationState` —— 现场实测（本版起点）：
     * 表里 18 项登记名**没有一个**在模块导出面上存在，于是
     * `typeof lib[initFn] === 'function'` 恒假，初始化整段静默跳过 ——
     * v3.460.0 声称的「18 项心智引擎初始状态与宿主生命周期融合挂载」实际从未发生。
     * 这里只加**别名**，不复制实现：两份实现即第二真源（v3.444.0 同名两份的教训）。 */
    const createInitialRippleState = createOrchestrationState;

    return {
        VERSION,
        PRIORITY_ORDER,
        createOrchestrationState,
        registerEngine,
        dispatchRippleEvent,
        hydrateState,
        hydrateRippleState,
        createInitialRippleState
    };
}));
