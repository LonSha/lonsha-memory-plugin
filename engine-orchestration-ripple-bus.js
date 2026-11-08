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

    return {
        VERSION,
        PRIORITY_ORDER,
        createOrchestrationState,
        registerEngine,
        dispatchRippleEvent
    };
}));
