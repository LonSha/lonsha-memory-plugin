/* ============================================================
 * engine-symphony-wave-scheduler.js — 交响总线波纹调度与微任务合并器
 * [v3.461.0 · 工业级心智编排与级联波纹流控引擎]
 * ============================================================ */

export class EngineSymphonyWaveScheduler {
    constructor(options = {}) {
        this.options = Object.assign({
            maxBatchTimeMs: 16,
            maxQueueDepth: 256,
            maxHistoryCount: 300,
            defaultTimeoutMs: 50,
            circuitBreakerThreshold: 3
        }, options);
        
        this.queue = [];
        this.history = [];
        this.consecutiveFailures = 0;
        this.isCircuitOpen = false;
        this.lastCircuitTripTime = 0;
    }

    /**
     * 登记交响调度任务并按权重与生命周期排序
     */
    enqueueTask(taskName, stage, priority = 5, payload = {}, timeoutMs = null) {
        if (!taskName || typeof taskName !== "string") {
            throw new Error("[EngineSymphonyWaveScheduler] taskName 必须为非空字符串");
        }
        if (this.queue.length >= this.options.maxQueueDepth) {
            // 队列溢出策略：淘汰最低优先级且最早的任务
            this.queue.sort((a, b) => a.priority - b.priority || a.timestamp - b.timestamp);
            this.queue.shift();
        }

        const item = {
            id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            taskName,
            stage: stage || "perception",
            priority: Math.max(1, Math.min(10, Number(priority) || 5)),
            payload: payload && typeof payload === "object" ? payload : {},
            timeoutMs: timeoutMs || this.options.defaultTimeoutMs,
            retryCount: 0,
            timestamp: Date.now()
        };

        this.queue.push(item);
        this.queue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
        return item.id;
    }

    /**
     * 批处理并执行波纹级联任务，遵守时间预算切片
     */
    async flushWaveSchedule(executorFn) {
        const start = Date.now();
        const executed = [];
        const failed = [];

        // 熔断保护冷却检查 (5秒自动试探半开)
        if (this.isCircuitOpen) {
            if (Date.now() - this.lastCircuitTripTime > 5000) {
                this.isCircuitOpen = false;
                this.consecutiveFailures = 0;
            } else {
                return {
                    executedCount: 0,
                    circuitTripped: true,
                    reason: "交响调度触发熔断保护中，跳过本轮执行",
                    remainingCount: this.queue.length,
                    executed: []
                };
            }
        }

        while (this.queue.length > 0) {
            const elapsed = Date.now() - start;
            if (elapsed >= this.options.maxBatchTimeMs && executed.length > 0) {
                break;
            }

            const item = this.queue.shift();
            let result = null;
            let error = null;

            try {
                if (typeof executorFn === "function") {
                    // 支持异步超时防护
                    const runPromise = executorFn(item);
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`Task ${item.taskName} timeout (${item.timeoutMs}ms)`)), item.timeoutMs)
                    );
                    result = await Promise.race([runPromise, timeoutPromise]);
                }
                this.consecutiveFailures = 0;
                executed.push({
                    id: item.id,
                    taskName: item.taskName,
                    stage: item.stage,
                    priority: item.priority,
                    result,
                    success: true,
                    elapsedMs: Date.now() - start
                });
            } catch (err) {
                error = err?.message || String(err);
                this.consecutiveFailures += 1;
                failed.push({ id: item.id, taskName: item.taskName, error });
                
                if (this.consecutiveFailures >= this.options.circuitBreakerThreshold) {
                    this.isCircuitOpen = true;
                    this.lastCircuitTripTime = Date.now();
                    break;
                }
            }
        }

        this.history.push(...executed);
        if (this.history.length > this.options.maxHistoryCount) {
            this.history = this.history.slice(-this.options.maxHistoryCount);
        }

        return {
            executedCount: executed.length,
            failedCount: failed.length,
            remainingCount: this.queue.length,
            totalElapsedMs: Date.now() - start,
            circuitTripped: this.isCircuitOpen,
            executed,
            failed
        };
    }

    getTelemetry() {
        return {
            queueDepth: this.queue.length,
            historyTotal: this.history.length,
            isCircuitOpen: this.isCircuitOpen,
            consecutiveFailures: this.consecutiveFailures,
            recentExecuted: this.history.slice(-10)
        };
    }

    exportState() {
        return {
            queue: this.queue,
            history: this.history,
            isCircuitOpen: this.isCircuitOpen,
            consecutiveFailures: this.consecutiveFailures
        };
    }

    hydrateState(state) {
        if (!state || typeof state !== "object") return;
        if (Array.isArray(state.queue)) this.queue = [...state.queue];
        if (Array.isArray(state.history)) this.history = [...state.history];
        if (typeof state.isCircuitOpen === "boolean") this.isCircuitOpen = state.isCircuitOpen;
        if (typeof state.consecutiveFailures === "number") this.consecutiveFailures = state.consecutiveFailures;
    }
}
if (typeof globalThis !== "undefined") { globalThis.EngineSymphonyWaveScheduler = EngineSymphonyWaveScheduler; }
if (typeof window !== "undefined") { window.EngineSymphonyWaveScheduler = EngineSymphonyWaveScheduler; }
if (typeof module !== "undefined" && module.exports) { module.exports = EngineSymphonyWaveScheduler; }
export default EngineSymphonyWaveScheduler;