// Phase 6: WASM 桥接层 - JavaScript 接口
// wasm-bridge.js - 封装 WASM 模块，提供友好的 JavaScript API

class WASMPageRank {
    constructor() {
        this.wasm = null;
        this.ready = false;
        this.loadPromise = null;
    }
    
    // 加载 WASM 模块
    async load(wasmPath = './pkg/lonsha_memory_wasm.js') {
        if (this.loadPromise) return this.loadPromise;
        
        this.loadPromise = (async () => {
            try {
                // 动态导入 WASM 模块
                const wasm = await import(wasmPath);
                await wasm.default(); // 初始化 WASM
                this.wasm = wasm;
                this.ready = true;
                console.log('[WASM] PageRank module loaded successfully');
                return true;
            } catch (error) {
                console.warn('[WASM] Failed to load, falling back to JS:', error);
                this.ready = false;
                return false;
            }
        })();
        
        return this.loadPromise;
    }
    
    // 检查 WASM 是否可用
    isReady() {
        return this.ready;
    }
    
    // PageRank 计算（WASM 加速）
    async calculate(nodes, edges, config = {}) {
        if (!this.ready) {
            throw new Error('WASM module not loaded. Call load() first.');
        }
        
        try {
            const nodesJson = JSON.stringify(nodes);
            const edgesJson = JSON.stringify(edges);
            const configJson = JSON.stringify({
                damping_factor: config.dampingFactor || 0.85,
                max_iterations: config.maxIterations || 30,
                tolerance: config.tolerance || 1e-6
            });
            
            const calculator = new this.wasm.PageRankCalculator(
                nodesJson,
                edgesJson,
                configJson
            );
            
            const resultJson = calculator.calculate();
            const ranks = JSON.parse(resultJson);
            
            // 转换为 Map 格式（兼容现有 API）
            return new Map(Object.entries(ranks));
        } catch (error) {
            console.error('[WASM] PageRank calculation failed:', error);
            throw error;
        }
    }
    
    // Top-K 查询
    async topK(ranks, k = 10) {
        if (!this.ready) {
            throw new Error('WASM module not loaded');
        }
        
        try {
            const ranksJson = JSON.stringify(Object.fromEntries(ranks));
            const calculator = new this.wasm.PageRankCalculator('[]', '[]', null);
            const resultJson = calculator.top_k(ranksJson, k);
            return JSON.parse(resultJson);
        } catch (error) {
            console.error('[WASM] Top-K query failed:', error);
            throw error;
        }
    }
    
    // 增量更新（WASM 加速）
    async incrementalUpdate(currentRanks, nodes, edges, newNodes, newEdges, config = {}) {
        if (!this.ready) {
            throw new Error('WASM module not loaded');
        }
        
        try {
            const currentRanksJson = JSON.stringify(Object.fromEntries(currentRanks));
            const nodesJson = JSON.stringify(nodes);
            const edgesJson = JSON.stringify(edges);
            const newNodesJson = JSON.stringify(newNodes);
            const newEdgesJson = JSON.stringify(newEdges);
            const configJson = JSON.stringify({
                damping_factor: config.dampingFactor || 0.85,
                max_iterations: config.maxIterations || 10,
                tolerance: config.tolerance || 1e-6
            });
            
            const resultJson = this.wasm.incremental_pagerank(
                currentRanksJson,
                nodesJson,
                edgesJson,
                newNodesJson,
                newEdgesJson,
                configJson
            );
            
            const ranks = JSON.parse(resultJson);
            return new Map(Object.entries(ranks));
        } catch (error) {
            console.error('[WASM] Incremental update failed:', error);
            throw error;
        }
    }
    
    // 批量计算
    async batchCalculate(nodes, edges, configs) {
        if (!this.ready) {
            throw new Error('WASM module not loaded');
        }
        
        try {
            const nodesJson = JSON.stringify(nodes);
            const edgesJson = JSON.stringify(edges);
            const configsJson = JSON.stringify(configs.map(c => ({
                damping_factor: c.dampingFactor || 0.85,
                max_iterations: c.maxIterations || 30,
                tolerance: c.tolerance || 1e-6
            })));
            
            const resultJson = this.wasm.batch_pagerank(
                nodesJson,
                edgesJson,
                configsJson
            );
            
            const results = JSON.parse(resultJson);
            return results.map(r => new Map(Object.entries(JSON.parse(r))));
        } catch (error) {
            console.error('[WASM] Batch calculation failed:', error);
            throw error;
        }
    }
}

// WASM 性能对比工具
class WASMBenchmark {
    constructor(wasmPageRank, jsPageRank) {
        this.wasm = wasmPageRank;
        this.js = jsPageRank;
    }
    
    // 对比 WASM vs JavaScript 性能
    async compare(nodes, edges, iterations = 5) {
        const results = {
            wasm: { times: [], avg: 0, min: 0, max: 0 },
            js: { times: [], avg: 0, min: 0, max: 0 },
            speedup: 0
        };
        
        console.log('[Benchmark] Starting WASM vs JS comparison...');
        
        // 预热
        if (this.wasm.isReady()) {
            await this.wasm.calculate(nodes, edges);
        }
        await this.js.pageRank({ nodes: new Map(nodes.map(n => [n.id, n])), edges: new Map() });
        
        // WASM 测试
        if (this.wasm.isReady()) {
            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                await this.wasm.calculate(nodes, edges);
                const elapsed = performance.now() - start;
                results.wasm.times.push(elapsed);
            }
            
            results.wasm.avg = results.wasm.times.reduce((a, b) => a + b, 0) / iterations;
            results.wasm.min = Math.min(...results.wasm.times);
            results.wasm.max = Math.max(...results.wasm.times);
        }
        
        // JavaScript 测试
        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            await this.js.pageRank({ 
                nodes: new Map(nodes.map(n => [n.id, n])), 
                edges: new Map(edges.map((e, i) => [i, e]))
            });
            const elapsed = performance.now() - start;
            results.js.times.push(elapsed);
        }
        
        results.js.avg = results.js.times.reduce((a, b) => a + b, 0) / iterations;
        results.js.min = Math.min(...results.js.times);
        results.js.max = Math.max(...results.js.times);
        
        // 计算加速比
        if (results.wasm.avg > 0) {
            results.speedup = results.js.avg / results.wasm.avg;
        }
        
        console.log('[Benchmark] Results:');
        console.log(`  WASM: ${results.wasm.avg.toFixed(2)}ms (min: ${results.wasm.min.toFixed(2)}ms, max: ${results.wasm.max.toFixed(2)}ms)`);
        console.log(`  JS:   ${results.js.avg.toFixed(2)}ms (min: ${results.js.min.toFixed(2)}ms, max: ${results.js.max.toFixed(2)}ms)`);
        console.log(`  Speedup: ${results.speedup.toFixed(2)}x`);
        
        return results;
    }
    
    // 生成性能报告
    generateReport(benchmarkResults) {
        const { wasm, js, speedup } = benchmarkResults;
        
        return {
            summary: `WASM is ${speedup.toFixed(2)}x faster than JavaScript`,
            wasm: {
                average: `${wasm.avg.toFixed(2)}ms`,
                min: `${wasm.min.toFixed(2)}ms`,
                max: `${wasm.max.toFixed(2)}ms`,
                variance: this.calculateVariance(wasm.times).toFixed(2)
            },
            js: {
                average: `${js.avg.toFixed(2)}ms`,
                min: `${js.min.toFixed(2)}ms`,
                max: `${js.max.toFixed(2)}ms`,
                variance: this.calculateVariance(js.times).toFixed(2)
            },
            speedup: `${speedup.toFixed(2)}x`,
            recommendation: speedup > 1.5 
                ? 'WASM provides significant performance improvement. Use WASM for production.'
                : speedup > 1.0
                ? 'WASM provides moderate improvement. Consider WASM for large graphs.'
                : 'JavaScript performance is comparable. WASM overhead may not be worth it.'
        };
    }
    
    calculateVariance(times) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const squaredDiffs = times.map(t => Math.pow(t - avg, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / times.length);
    }
}

// 自适应 PageRank（自动选择 WASM 或 JavaScript）
class AdaptivePageRank {
    constructor() {
        this.wasm = new WASMPageRank();
        this.jsPageRank = null; // 将由外部注入
        this.useWASM = false;
        this.threshold = 100; // 节点数阈值：超过100节点使用 WASM
    }
    
    async init(wasmPath, jsPageRankInstance) {
        this.jsPageRank = jsPageRankInstance;
        const loaded = await this.wasm.load(wasmPath);
        
        if (loaded) {
            this.useWASM = true;
            console.log('[Adaptive] WASM available, will use for large graphs');
        } else {
            console.log('[Adaptive] WASM not available, using JavaScript only');
        }
    }
    
    // 智能计算（自动选择最优方案）
    async calculate(nodes, edges, config = {}) {
        const nodeCount = nodes.length;
        
        // 决策：小图谱用 JS，大图谱用 WASM
        if (this.useWASM && nodeCount >= this.threshold) {
            console.log(`[Adaptive] Using WASM for ${nodeCount} nodes`);
            return await this.wasm.calculate(nodes, edges, config);
        } else {
            console.log(`[Adaptive] Using JavaScript for ${nodeCount} nodes`);
            // 转换为 JavaScript 格式
            const graph = {
                nodes: new Map(nodes.map(n => [n.id, n])),
                edges: new Map(edges.map((e, i) => [i, e]))
            };
            return await this.jsPageRank.pageRank(graph, config);
        }
    }
    
    // 增量更新（自动选择）
    async incrementalUpdate(currentRanks, nodes, edges, newNodes, newEdges, config = {}) {
        if (this.useWASM && nodes.length >= this.threshold) {
            return await this.wasm.incrementalUpdate(
                currentRanks, nodes, edges, newNodes, newEdges, config
            );
        } else {
            // 使用 JavaScript 增量更新
            return await this.jsPageRank.updateIncremental(newNodes, newEdges, config);
        }
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WASMPageRank, WASMBenchmark, AdaptivePageRank };
} else {
    window.WASMPageRank = WASMPageRank;
    window.WASMBenchmark = WASMBenchmark;
    window.AdaptivePageRank = AdaptivePageRank;
}