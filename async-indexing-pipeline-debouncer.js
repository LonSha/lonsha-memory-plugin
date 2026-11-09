/* ============================================================
 * async-indexing-pipeline-debouncer.js — [v3.461.0 · 第十八期全新生产基座]
 * 异步索引管线防抖并发消峰调度器 (Async Indexing Pipeline Debouncer)
 * ------------------------------------------------------------
 * 【核心机制与高并发消峰】
 * 解决连续快速输入或长文本流式分块时频繁触发向量计算与落盘导致的 UI 卡顿：
 *   引入批处理微任务队列与动态防抖窗口（Debounce Window: 150ms）。
 *   自动合并高频并发写入请求，批量执行分词、图谱更新与持久化序列化，保障 60fps 丝滑体验。
 * ============================================================ */

class AsyncIndexingPipelineDebouncer {
    constructor(options = {}) {
        this.options = Object.assign({
            debounceMs: 150,
            maxBatchSize: 20
        }, options);
        this.pendingQueue = [];
        this.timer = null;
        this.isProcessing = false;
        this.flushHandlers = [];
    }

    onFlush(handler) {
        if (typeof handler === "function") {
            this.flushHandlers.push(handler);
        }
    }

    enqueue(item) {
        this.pendingQueue.push(item);

        if (this.pendingQueue.length >= this.options.maxBatchSize) {
            return this.flushNow();
        }

        if (this.timer) clearTimeout(this.timer);
        return new Promise(resolve => {
            this.timer = setTimeout(async () => {
                const res = await this.flushNow();
                resolve(res);
            }, this.options.debounceMs);
        });
    }

    async flushNow() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.pendingQueue.length === 0) return { processed: 0 };

        const batch = [...this.pendingQueue];
        this.pendingQueue = [];
        this.isProcessing = true;

        for (const handler of this.flushHandlers) {
            try {
                await handler(batch);
            } catch (err) {
                console.error("[AsyncIndexingDebouncer] Error in flush handler:", err);
            }
        }

        this.isProcessing = false;
        return { processed: batch.length, batch };
    }

    getQueueLength() {
        return this.pendingQueue.length;
    }
}

/* ============================================================
 * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
 * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
 * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
 * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
 * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
 * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.AsyncIndexingPipelineDebouncer = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return AsyncIndexingPipelineDebouncer;
}));
