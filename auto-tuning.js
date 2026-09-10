// Phase 9: 自动调优与配置优化
// auto-tuning.js - 自适应参数调优系统

// ========== 自适应配置管理器 ==========
class AdaptiveConfigManager {
    constructor(initialConfig = {}) {
        this.config = {
            // GNN 推荐配置
            gnn: {
                embeddingDim: 128,
                learningRate: 0.01,
                batchSize: 32,
                ...initialConfig.gnn
            },
            // LLM 提取配置
            llm: {
                temperature: 0.3,
                maxTokens: 2000,
                maxRetries: 2,
                timeout: 30000,
                ...initialConfig.llm
            },
            // 向量检索配置
            vector: {
                hybridAlpha: 0.7,
                topK: 10,
                minSimilarity: 0.3,
                ...initialConfig.vector
            },
            // 性能配置
            performance: {
                cacheSize: 100,
                cacheTTL: 60000,
                workerPoolSize: 4,
                maxConcurrent: 10,
                ...initialConfig.performance
            },
            ...initialConfig
        };
        
        this.metrics = {
            recommendations: [],
            adjustments: []
        };
        
        // 自动调优规则
        this.tuningRules = [
            { name: 'gnn-accuracy-low', condition: (m) => m.gnnAccuracy < 0.80, action: this._tuneGNNForAccuracy.bind(this) },
            { name: 'gnn-slow', condition: (m) => m.gnnLatency > 150, action: this._tuneGNNForSpeed.bind(this) },
            { name: 'llm-timeout', condition: (m) => m.llmTimeoutRate > 0.1, action: this._tuneLLMTimeout.bind(this) },
            { name: 'llm-low-quality', condition: (m) => m.llmF1 < 0.88, action: this._tuneLLMQuality.bind(this) },
            { name: 'memory-high', condition: (m) => m.memoryUsage > 100 * 1024 * 1024, action: this._tuneMemory.bind(this) },
            { name: 'cache-miss-high', condition: (m) => m.cacheMissRate > 0.5, action: this._tuneCache.bind(this) }
        ];
    }
    
    // 收集性能指标
    collectMetrics(metrics) {
        this.metrics.recommendations.push({
            timestamp: Date.now(),
            ...metrics
        });
        
        // 保留最近 100 条
        if (this.metrics.recommendations.length > 100) {
            this.metrics.recommendations.shift();
        }
    }
    
    // 自动调优
    async autoTune() {
        const recentMetrics = this._aggregateMetrics();
        const adjustments = [];
        
        for (const rule of this.tuningRules) {
            if (rule.condition(recentMetrics)) {
                console.log(`[AutoTune] 触发规则: ${rule.name}`);
                const adjustment = await rule.action(recentMetrics);
                if (adjustment) {
                    adjustments.push({
                        rule: rule.name,
                        ...adjustment,
                        timestamp: Date.now()
                    });
                }
            }
        }
        
        if (adjustments.length > 0) {
            this.metrics.adjustments.push(...adjustments);
            console.log(`[AutoTune] 应用 ${adjustments.length} 项调整`);
        }
        
        return adjustments;
    }
    
    // 聚合最近指标
    _aggregateMetrics() {
        const recent = this.metrics.recommendations.slice(-20);
        if (recent.length === 0) {
            return {
                gnnAccuracy: 1.0,
                gnnLatency: 0,
                llmF1: 1.0,
                llmTimeoutRate: 0,
                memoryUsage: 0,
                cacheMissRate: 0
            };
        }
        
        return {
            gnnAccuracy: recent.reduce((sum, m) => sum + (m.gnnAccuracy || 1), 0) / recent.length,
            gnnLatency: recent.reduce((sum, m) => sum + (m.gnnLatency || 0), 0) / recent.length,
            llmF1: recent.reduce((sum, m) => sum + (m.llmF1 || 1), 0) / recent.length,
            llmTimeoutRate: recent.filter(m => m.llmTimeout).length / recent.length,
            memoryUsage: recent[recent.length - 1].memoryUsage || 0,
            cacheMissRate: recent.reduce((sum, m) => sum + (m.cacheMiss ? 1 : 0), 0) / recent.length
        };
    }
    
    // GNN 准确率优化
    _tuneGNNForAccuracy(metrics) {
        const oldLR = this.config.gnn.learningRate;
        const oldDim = this.config.gnn.embeddingDim;
        
        // 降低学习率，增加嵌入维度
        this.config.gnn.learningRate *= 0.8;
        this.config.gnn.embeddingDim = Math.min(oldDim + 16, 256);
        
        return {
            parameter: 'gnn',
            old: { learningRate: oldLR, embeddingDim: oldDim },
            new: { learningRate: this.config.gnn.learningRate, embeddingDim: this.config.gnn.embeddingDim },
            reason: `准确率 ${(metrics.gnnAccuracy * 100).toFixed(1)}% < 80%`
        };
    }
    
    // GNN 速度优化
    _tuneGNNForSpeed(metrics) {
        const oldDim = this.config.gnn.embeddingDim;
        const oldBatch = this.config.gnn.batchSize;
        
        // 减小嵌入维度，增大批次大小
        this.config.gnn.embeddingDim = Math.max(oldDim - 16, 64);
        this.config.gnn.batchSize = Math.min(oldBatch * 2, 128);
        
        return {
            parameter: 'gnn',
            old: { embeddingDim: oldDim, batchSize: oldBatch },
            new: { embeddingDim: this.config.gnn.embeddingDim, batchSize: this.config.gnn.batchSize },
            reason: `延迟 ${metrics.gnnLatency.toFixed(1)}ms > 150ms`
        };
    }
    
    // LLM 超时优化
    _tuneLLMTimeout(metrics) {
        const oldTimeout = this.config.llm.timeout;
        const oldRetries = this.config.llm.maxRetries;
        
        // 增加超时时间，减少重试次数
        this.config.llm.timeout = Math.min(oldTimeout * 1.5, 60000);
        this.config.llm.maxRetries = Math.max(oldRetries - 1, 1);
        
        return {
            parameter: 'llm',
            old: { timeout: oldTimeout, maxRetries: oldRetries },
            new: { timeout: this.config.llm.timeout, maxRetries: this.config.llm.maxRetries },
            reason: `超时率 ${(metrics.llmTimeoutRate * 100).toFixed(1)}% > 10%`
        };
    }
    
    // LLM 质量优化
    _tuneLLMQuality(metrics) {
        const oldTemp = this.config.llm.temperature;
        const oldTokens = this.config.llm.maxTokens;
        
        // 降低温度，增加 token 数
        this.config.llm.temperature = Math.max(oldTemp - 0.05, 0.1);
        this.config.llm.maxTokens = Math.min(oldTokens + 500, 4000);
        
        return {
            parameter: 'llm',
            old: { temperature: oldTemp, maxTokens: oldTokens },
            new: { temperature: this.config.llm.temperature, maxTokens: this.config.llm.maxTokens },
            reason: `F1 ${(metrics.llmF1 * 100).toFixed(1)}% < 88%`
        };
    }
    
    // 内存优化
    _tuneMemory(metrics) {
        const oldCache = this.config.performance.cacheSize;
        const oldTTL = this.config.performance.cacheTTL;
        
        // 减小缓存，缩短 TTL
        this.config.performance.cacheSize = Math.max(Math.floor(oldCache * 0.7), 20);
        this.config.performance.cacheTTL = Math.max(oldTTL * 0.8, 10000);
        
        return {
            parameter: 'performance',
            old: { cacheSize: oldCache, cacheTTL: oldTTL },
            new: { cacheSize: this.config.performance.cacheSize, cacheTTL: this.config.performance.cacheTTL },
            reason: `内存使用 ${(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB > 100MB`
        };
    }
    
    // 缓存优化
    _tuneCache(metrics) {
        const oldSize = this.config.performance.cacheSize;
        const oldTTL = this.config.performance.cacheTTL;
        
        // 增大缓存，延长 TTL
        this.config.performance.cacheSize = Math.min(oldSize + 50, 500);
        this.config.performance.cacheTTL = Math.min(oldTTL * 1.5, 300000);
        
        return {
            parameter: 'performance',
            old: { cacheSize: oldSize, cacheTTL: oldTTL },
            new: { cacheSize: this.config.performance.cacheSize, cacheTTL: this.config.performance.cacheTTL },
            reason: `缓存未命中率 ${(metrics.cacheMissRate * 100).toFixed(1)}% > 50%`
        };
    }
    
    // 获取当前配置
    getConfig() {
        return JSON.parse(JSON.stringify(this.config));
    }
    
    // 重置配置
    reset(initialConfig = {}) {
        this.config = {
            gnn: { embeddingDim: 128, learningRate: 0.01, batchSize: 32 },
            llm: { temperature: 0.3, maxTokens: 2000, maxRetries: 2, timeout: 30000 },
            vector: { hybridAlpha: 0.7, topK: 10, minSimilarity: 0.3 },
            performance: { cacheSize: 100, cacheTTL: 60000, workerPoolSize: 4, maxConcurrent: 10 },
            ...initialConfig
        };
        
        console.log('[AdaptiveConfigManager] 配置已重置');
    }
    
    // 获取调优历史
    getTuningHistory() {
        return {
            adjustments: this.metrics.adjustments,
            metricsCount: this.metrics.recommendations.length,
            timestamp: Date.now()
        };
    }
}

// ========== 智能降级管理器 ==========
class GracefulDegradation {
    constructor() {
        this.features = new Map();
        this.degradationLevels = {
            FULL: 0,           // 全功能
            REDUCED: 1,        // 降级模式
            MINIMAL: 2,        // 最小功能
            EMERGENCY: 3       // 紧急模式
        };
        
        this.currentLevel = this.degradationLevels.FULL;
        this.history = [];
    }
    
    // 注册功能
    registerFeature(name, config) {
        this.features.set(name, {
            enabled: true,
            priority: config.priority || 5, // 1-10，数字越小越重要
            fallback: config.fallback || null,
            healthCheck: config.healthCheck || (() => true),
            ...config
        });
    }
    
    // 检查是否需要降级
    async checkAndDegrade(metrics) {
        const { errorRate, latency, memoryUsage, cpuUsage } = metrics;
        
        let targetLevel = this.degradationLevels.FULL;
        
        // 降级判断逻辑
        if (errorRate > 0.3 || memoryUsage > 200 * 1024 * 1024 || cpuUsage > 0.9) {
            targetLevel = this.degradationLevels.EMERGENCY;
        } else if (errorRate > 0.15 || memoryUsage > 150 * 1024 * 1024 || cpuUsage > 0.75) {
            targetLevel = this.degradationLevels.MINIMAL;
        } else if (errorRate > 0.05 || latency > 500 || memoryUsage > 100 * 1024 * 1024) {
            targetLevel = this.degradationLevels.REDUCED;
        }
        
        if (targetLevel !== this.currentLevel) {
            await this.setLevel(targetLevel);
        }
        
        return this.currentLevel;
    }
    
    // 设置降级等级
    async setLevel(level) {
        const oldLevel = this.currentLevel;
        this.currentLevel = level;
        
        this.history.push({
            from: oldLevel,
            to: level,
            timestamp: Date.now()
        });
        
        // 根据等级禁用功能
        for (const [name, feature] of this.features) {
            const shouldEnable = feature.priority <= this._getPriorityThreshold(level);
            feature.enabled = shouldEnable;
            
            if (!shouldEnable && feature.fallback) {
                console.log(`[Degradation] 功能 ${name} 已降级，使用 fallback`);
            }
        }
        
        console.log(`[Degradation] 降级等级: ${this._getLevelName(oldLevel)} → ${this._getLevelName(level)}`);
    }
    
    // 获取优先级阈值
    _getPriorityThreshold(level) {
        switch (level) {
            case this.degradationLevels.FULL: return 10;
            case this.degradationLevels.REDUCED: return 7;
            case this.degradationLevels.MINIMAL: return 4;
            case this.degradationLevels.EMERGENCY: return 2;
            default: return 10;
        }
    }
    
    // 获取等级名称
    _getLevelName(level) {
        for (const [name, value] of Object.entries(this.degradationLevels)) {
            if (value === level) return name;
        }
        return 'UNKNOWN';
    }
    
    // 检查功能是否可用
    isFeatureEnabled(name) {
        const feature = this.features.get(name);
        return feature ? feature.enabled : false;
    }
    
    // 获取功能或降级版本
    getFeature(name, fallback = null) {
        const feature = this.features.get(name);
        if (!feature) return fallback;
        
        return feature.enabled ? feature : (feature.fallback || fallback);
    }
    
    // 获取状态
    getStatus() {
        const features = {};
        for (const [name, feature] of this.features) {
            features[name] = {
                enabled: feature.enabled,
                priority: feature.priority,
                hasFallback: !!feature.fallback
            };
        }
        
        return {
            currentLevel: this._getLevelName(this.currentLevel),
            features,
            history: this.history.slice(-10),
            timestamp: Date.now()
        };
    }
}

// ========== 导出 ==========
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AdaptiveConfigManager,
        GracefulDegradation
    };
} else {
    window.AdaptiveConfigManager = AdaptiveConfigManager;
    window.GracefulDegradation = GracefulDegradation;
}