// Phase 9: 生产加固 - 统一错误处理、资源管理、性能监控
// production-hardening.js - 企业级容错与监控系统

// ========== 统一错误处理器 ==========
class ErrorHandler {
    constructor(config = {}) {
        this.config = {
            enableLogging: config.enableLogging !== false,
            enableReporting: config.enableReporting || false,
            maxErrorQueue: config.maxErrorQueue || 100,
            reportEndpoint: config.reportEndpoint || null,
            ...config
        };
        
        this.errorQueue = [];
        this.errorStats = {
            total: 0,
            byType: {},
            byModule: {},
            lastError: null
        };
        
        // 全局错误捕获
        if (typeof window !== 'undefined') {
            window.addEventListener('error', (e) => this.handleGlobalError(e));
            window.addEventListener('unhandledrejection', (e) => this.handleUnhandledRejection(e));
        }
    }
    
    // 包装异步函数（自动 try-catch）
    wrap(fn, context = 'unknown') {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                return this.handle(error, context, { args });
            }
        };
    }
    
    // 包装同步函数
    wrapSync(fn, context = 'unknown') {
        return (...args) => {
            try {
                return fn(...args);
            } catch (error) {
                return this.handle(error, context, { args });
            }
        };
    }
    
    // 统一错误处理
    handle(error, context = 'unknown', metadata = {}) {
        const errorRecord = {
            timestamp: Date.now(),
            context,
            message: error.message || String(error),
            stack: error.stack,
            type: error.name || 'Error',
            metadata,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
        };
        
        // 更新统计
        this.errorStats.total++;
        this.errorStats.byType[errorRecord.type] = (this.errorStats.byType[errorRecord.type] || 0) + 1;
        this.errorStats.byModule[context] = (this.errorStats.byModule[context] || 0) + 1;
        this.errorStats.lastError = errorRecord;
        
        // 入队
        this.errorQueue.push(errorRecord);
        if (this.errorQueue.length > this.config.maxErrorQueue) {
            this.errorQueue.shift();
        }
        
        // 日志
        if (this.config.enableLogging) {
            console.error(`[ErrorHandler:${context}]`, error.message, metadata);
        }
        
        // 上报（异步，不阻塞）
        if (this.config.enableReporting && this.config.reportEndpoint) {
            this._reportError(errorRecord).catch(() => {});
        }
        
        // 返回降级值（避免崩溃）
        return this._getFallbackValue(context);
    }
    
    // 全局错误捕获
    handleGlobalError(event) {
        this.handle(event.error || new Error(event.message), 'global', {
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
    }
    
    // Promise rejection 捕获
    handleUnhandledRejection(event) {
        this.handle(event.reason || new Error('Unhandled Promise Rejection'), 'promise', {
            promise: event.promise
        });
    }
    
    // 错误上报
    async _reportError(errorRecord) {
        try {
            await fetch(this.config.reportEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorRecord)
            });
        } catch (e) {
            // 上报失败不影响主流程
        }
    }
    
    // 降级值
    _getFallbackValue(context) {
        const fallbacks = {
            'gnn-recommend': { recommendations: [], confidence: 0, elapsed: 0 },
            'llm-extract': { entities: [], relationships: [], events: [], summary: {}, confidence: 0 },
            'summary': { brief: '', quality: 0 },
            'anomaly-detect': { anomalies: [], stats: {} }
        };
        
        return fallbacks[context] || null;
    }
    
    // 获取错误报告
    getReport() {
        return {
            stats: this.errorStats,
            recentErrors: this.errorQueue.slice(-10),
            timestamp: Date.now()
        };
    }
    
    // 清空错误队列
    clear() {
        this.errorQueue = [];
        this.errorStats = {
            total: 0,
            byType: {},
            byModule: {},
            lastError: null
        };
    }
}

// ========== 资源管理器（防止内存泄漏）==========
class ResourceManager {
    constructor() {
        this.resources = new Map();
        this.timers = new Set();
        this.listeners = new Map();
        this.intervals = new Set();
    }
    
    // 注册定时器
    setTimeout(callback, delay, id = null) {
        const timerId = setTimeout(() => {
            callback();
            this.timers.delete(timerId);
        }, delay);
        
        this.timers.add(timerId);
        if (id) this.resources.set(id, { type: 'timeout', id: timerId });
        
        return timerId;
    }
    
    // 注册循环定时器
    setInterval(callback, interval, id = null) {
        const intervalId = setInterval(callback, interval);
        this.intervals.add(intervalId);
        if (id) this.resources.set(id, { type: 'interval', id: intervalId });
        
        return intervalId;
    }
    
    // 注册事件监听器
    addEventListener(target, event, handler, options, id = null) {
        target.addEventListener(event, handler, options);
        
        const key = `${event}_${Date.now()}`;
        this.listeners.set(key, { target, event, handler, options });
        if (id) this.resources.set(id, { type: 'listener', key });
        
        return key;
    }
    
    // 清理单个资源
    release(id) {
        const resource = this.resources.get(id);
        if (!resource) return;
        
        switch (resource.type) {
            case 'timeout':
                clearTimeout(resource.id);
                this.timers.delete(resource.id);
                break;
            case 'interval':
                clearInterval(resource.id);
                this.intervals.delete(resource.id);
                break;
            case 'listener':
                const listener = this.listeners.get(resource.key);
                if (listener) {
                    listener.target.removeEventListener(listener.event, listener.handler, listener.options);
                    this.listeners.delete(resource.key);
                }
                break;
        }
        
        this.resources.delete(id);
    }
    
    // 清理所有资源
    releaseAll() {
        // 清理定时器
        for (const timerId of this.timers) {
            clearTimeout(timerId);
        }
        this.timers.clear();
        
        // 清理循环定时器
        for (const intervalId of this.intervals) {
            clearInterval(intervalId);
        }
        this.intervals.clear();
        
        // 清理监听器
        for (const [key, listener] of this.listeners) {
            listener.target.removeEventListener(listener.event, listener.handler, listener.options);
        }
        this.listeners.clear();
        
        this.resources.clear();
        console.log('[ResourceManager] 所有资源已释放');
    }
    
    // 获取资源统计
    getStats() {
        return {
            timers: this.timers.size,
            intervals: this.intervals.size,
            listeners: this.listeners.size,
            total: this.resources.size
        };
    }
}

// ========== 性能监控器 ==========
class PerformanceMonitor {
    constructor(config = {}) {
        this.config = {
            enableMemoryTracking: config.enableMemoryTracking !== false,
            memoryCheckInterval: config.memoryCheckInterval || 60000, // 60秒
            performanceThresholds: {
                gnnRecommend: 100,      // ms
                llmExtract: 2000,
                summary: 2000,
                anomalyDetect: 200,
                ...config.performanceThresholds
            },
            ...config
        };
        
        this.metrics = {
            operations: new Map(),
            memory: [],
            slowOperations: []
        };
        
        this.resourceManager = new ResourceManager();
        
        // 定期内存检查
        if (this.config.enableMemoryTracking && typeof performance !== 'undefined' && performance.memory) {
            this.resourceManager.setInterval(() => {
                this._trackMemory();
            }, this.config.memoryCheckInterval, 'memory-tracker');
        }
    }
    
    // 包装函数并计时
    measure(fn, operationName) {
        return async (...args) => {
            const startTime = performance.now();
            const startMemory = this._getMemoryUsage();
            
            try {
                const result = await fn(...args);
                const elapsed = performance.now() - startTime;
                const endMemory = this._getMemoryUsage();
                
                this._recordMetric(operationName, elapsed, endMemory - startMemory, true);
                
                return result;
            } catch (error) {
                const elapsed = performance.now() - startTime;
                this._recordMetric(operationName, elapsed, 0, false);
                throw error;
            }
        };
    }
    
    // 记录指标
    _recordMetric(operationName, elapsed, memoryDelta, success) {
        if (!this.metrics.operations.has(operationName)) {
            this.metrics.operations.set(operationName, {
                count: 0,
                totalTime: 0,
                avgTime: 0,
                minTime: Infinity,
                maxTime: 0,
                errors: 0,
                lastRun: 0
            });
        }
        
        const metric = this.metrics.operations.get(operationName);
        metric.count++;
        metric.totalTime += elapsed;
        metric.avgTime = metric.totalTime / metric.count;
        metric.minTime = Math.min(metric.minTime, elapsed);
        metric.maxTime = Math.max(metric.maxTime, elapsed);
        metric.lastRun = Date.now();
        
        if (!success) metric.errors++;
        
        // 检测慢操作
        const threshold = this.config.performanceThresholds[operationName] || 1000;
        if (elapsed > threshold) {
            this.metrics.slowOperations.push({
                operation: operationName,
                elapsed,
                threshold,
                timestamp: Date.now()
            });
            
            // 保留最近 50 条
            if (this.metrics.slowOperations.length > 50) {
                this.metrics.slowOperations.shift();
            }
            
            console.warn(`[PerformanceMonitor] 慢操作: ${operationName} 耗时 ${elapsed.toFixed(1)}ms (阈值 ${threshold}ms)`);
        }
    }
    
    // 追踪内存
    _trackMemory() {
        const memory = this._getMemoryUsage();
        this.metrics.memory.push({
            timestamp: Date.now(),
            usage: memory
        });
        
        // 保留最近 100 条
        if (this.metrics.memory.length > 100) {
            this.metrics.memory.shift();
        }
        
        // 内存泄漏预警（增长超过 50MB）
        if (this.metrics.memory.length > 10) {
            const recent = this.metrics.memory.slice(-10);
            const firstMemory = recent[0].usage;
            const lastMemory = recent[recent.length - 1].usage;
            const growth = lastMemory - firstMemory;
            
            if (growth > 50 * 1024 * 1024) { // 50MB
                console.warn(`[PerformanceMonitor] 内存泄漏预警: 10分钟内增长 ${(growth / 1024 / 1024).toFixed(1)}MB`);
            }
        }
    }
    
    // 获取内存使用
    _getMemoryUsage() {
        if (typeof performance !== 'undefined' && performance.memory) {
            return performance.memory.usedJSHeapSize;
        }
        return 0;
    }
    
    // 获取性能报告
    getReport() {
        const operations = {};
        for (const [name, metric] of this.metrics.operations) {
            operations[name] = {
                ...metric,
                successRate: metric.count > 0 ? ((metric.count - metric.errors) / metric.count * 100).toFixed(1) + '%' : 'N/A'
            };
        }
        
        return {
            operations,
            slowOperations: this.metrics.slowOperations.slice(-10),
            memory: {
                current: this._getMemoryUsage(),
                history: this.metrics.memory.slice(-10)
            },
            resources: this.resourceManager.getStats(),
            timestamp: Date.now()
        };
    }
    
    // 清理
    destroy() {
        this.resourceManager.releaseAll();
    }
}

// ========== 健康检查器 ==========
class HealthChecker {
    constructor(components = {}) {
        this.components = components;
        this.lastCheck = null;
    }
    
    // 执行健康检查
    async check() {
        const results = {};
        let allHealthy = true;
        
        for (const [name, component] of Object.entries(this.components)) {
            try {
                const startTime = Date.now();
                
                // 调用组件的 healthCheck 方法（如果存在）
                const healthy = component.healthCheck ? await component.healthCheck() : true;
                
                results[name] = {
                    status: healthy ? 'healthy' : 'unhealthy',
                    latency: Date.now() - startTime,
                    timestamp: Date.now()
                };
                
                if (!healthy) allHealthy = false;
                
            } catch (error) {
                results[name] = {
                    status: 'error',
                    error: error.message,
                    timestamp: Date.now()
                };
                allHealthy = false;
            }
        }
        
        this.lastCheck = {
            overall: allHealthy ? 'healthy' : 'degraded',
            components: results,
            timestamp: Date.now()
        };
        
        return this.lastCheck;
    }
    
    // 获取最近一次检查结果
    getStatus() {
        return this.lastCheck || { overall: 'unknown', components: {}, timestamp: 0 };
    }
}

// ========== 导出 ==========
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ErrorHandler,
        ResourceManager,
        PerformanceMonitor,
        HealthChecker
    };
} else {
    window.ErrorHandler = ErrorHandler;
    window.ResourceManager = ResourceManager;
    window.PerformanceMonitor = PerformanceMonitor;
    window.HealthChecker = HealthChecker;
}