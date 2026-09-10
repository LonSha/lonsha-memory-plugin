// Phase 5: Worker 管理器 + 增量更新 + 索引优化
// worker-manager.js - 管理 WebWorker 线程池和增量算法

class WorkerManager {
    constructor(workerPath = 'graph-worker.js') {
        this.workerPath = workerPath;
        this.worker = null;
        this.ready = false;
        this.taskQueue = [];
        this.pendingTasks = new Map();
        this.taskId = 0;
        
        this.init();
    }
    
    // 初始化 Worker
    init() {
        try {
            this.worker = new Worker(this.workerPath);
            
            this.worker.onmessage = (e) => {
                const { type, success, result, error, elapsed } = e.data;
                
                if (type === 'ready') {
                    this.ready = true;
                    this.processQueue();
                    return;
                }
                
                // 处理任务响应
                const taskId = this.currentTaskId;
                const task = this.pendingTasks.get(taskId);
                
                if (task) {
                    if (success) {
                        task.resolve({ result, elapsed });
                    } else {
                        task.reject(new Error(error));
                    }
                    this.pendingTasks.delete(taskId);
                }
                
                // 处理下一个任务
                this.processQueue();
            };
            
            this.worker.onerror = (error) => {
                console.error('Worker error:', error);
                const task = this.pendingTasks.get(this.currentTaskId);
                if (task) {
                    task.reject(error);
                    this.pendingTasks.delete(this.currentTaskId);
                }
            };
        } catch (error) {
            console.warn('WebWorker not available, falling back to main thread');
            this.worker = null;
        }
    }
    
    // 处理任务队列
    processQueue() {
        if (this.taskQueue.length === 0 || !this.ready) return;
        
        const task = this.taskQueue.shift();
        this.currentTaskId = task.id;
        this.worker.postMessage(task.data);
    }
    
    // 执行任务
    execute(type, data, options = {}) {
        return new Promise((resolve, reject) => {
            const taskId = ++this.taskId;
            
            const task = {
                id: taskId,
                data: { type, data, options },
                resolve,
                reject
            };
            
            this.pendingTasks.set(taskId, task);
            this.taskQueue.push(task);
            
            if (this.ready) {
                this.processQueue();
            }
        });
    }
    
    // PageRank (多线程版本)
    async pageRank(nodes, edges, options = {}) {
        if (!this.worker) {
            // 降级到主线程
            const diffusion = new GraphDiffusion({ nodes: new Map(nodes.map(n => [n.id, n])), edges: new Map() });
            return diffusion.pageRank(options);
        }
        
        const { result, elapsed } = await this.execute('pagerank', { nodes, edges }, options);
        console.log(`[Worker] PageRank completed in ${elapsed.toFixed(2)}ms`);
        return result;
    }
    
    // DPP 采样 (多线程版本)
    async dpp(candidates, k = 5, lambdaDiversity = 0.5) {
        if (!this.worker) {
            const diffusion = new GraphDiffusion({ nodes: new Map(), edges: new Map() });
            return diffusion.diversitySampling(candidates, k, lambdaDiversity);
        }
        
        const { result, elapsed } = await this.execute('dpp', { candidates }, { k, lambdaDiversity });
        console.log(`[Worker] DPP completed in ${elapsed.toFixed(2)}ms`);
        return result;
    }
    
    // 社区检测 (多线程版本)
    async community(nodes, edges, options = {}) {
        if (!this.worker) {
            const diffusion = new GraphDiffusion({ nodes: new Map(nodes.map(n => [n.id, n])), edges: new Map() });
            return diffusion.detectCommunities();
        }
        
        const { result, elapsed } = await this.execute('community', { nodes, edges }, options);
        console.log(`[Worker] Community detection completed in ${elapsed.toFixed(2)}ms`);
        return result;
    }
    
    // 批量执行
    async batch(operations) {
        if (!this.worker) {
            throw new Error('Worker not available for batch operations');
        }
        
        const { result, elapsed } = await this.execute('batch', { operations });
        console.log(`[Worker] Batch completed in ${elapsed.toFixed(2)}ms`);
        return result;
    }
    
    // 销毁 Worker
    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}

// 增量 PageRank 更新器
class IncrementalPageRank {
    constructor(graph) {
        this.graph = graph;
        this.ranks = new Map();
        this.lastUpdate = 0;
    }
    
    // 初始化 PageRank
    async initialize(options = {}) {
        const nodes = Array.from(this.graph.nodes.values());
        const edges = Array.from(this.graph.edges.values());
        
        const diffusion = new GraphDiffusion(this.graph);
        this.ranks = diffusion.pageRank(options);
        this.lastUpdate = Date.now();
        
        return this.ranks;
    }
    
    // 增量更新（仅更新受影响的节点）
    updateIncremental(newNodes = [], newEdges = [], options = {}) {
        const {
            dampingFactor = 0.85,
            maxIterations = 10 // 增量更新迭代次数更少
        } = options;
        
        // 收集受影响的节点
        const affectedNodes = new Set();
        
        for (const node of newNodes) {
            affectedNodes.add(node.id);
        }
        
        for (const edge of newEdges) {
            affectedNodes.add(edge.from);
            affectedNodes.add(edge.to);
            
            // 添加邻居节点
            for (const e of this.graph.edges.values()) {
                if (e.from === edge.from || e.to === edge.from) {
                    affectedNodes.add(e.to);
                    affectedNodes.add(e.from);
                }
                if (e.from === edge.to || e.to === edge.to) {
                    affectedNodes.add(e.to);
                    affectedNodes.add(e.from);
                }
            }
        }
        
        // 只更新受影响节点的 Rank
        const allNodes = Array.from(this.graph.nodes.values());
        const totalNodes = allNodes.length;
        
        for (let iter = 0; iter < maxIterations; iter++) {
            const newRanks = new Map(this.ranks);
            
            for (const nodeId of affectedNodes) {
                const node = this.graph.nodes.get(nodeId);
                if (!node) continue;
                
                let rank = (1 - dampingFactor) / totalNodes;
                
                // 计算入链贡献
                for (const edge of this.graph.edges.values()) {
                    if (edge.to === nodeId) {
                        const fromRank = this.ranks.get(edge.from) || 0;
                        const outDegree = Array.from(this.graph.edges.values())
                            .filter(e => e.from === edge.from).length || 1;
                        rank += dampingFactor * (fromRank / outDegree) * (edge.weight || 1.0);
                    }
                }
                
                newRanks.set(nodeId, rank);
            }
            
            this.ranks = newRanks;
        }
        
        this.lastUpdate = Date.now();
        return this.ranks;
    }
    
    // 获取 Top-K 节点
    getTopK(k = 10) {
        return Array.from(this.ranks.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, k);
    }
}

// 图谱索引优化器
class GraphIndexer {
    constructor(graph) {
        this.graph = graph;
        this.indexes = {
            byType: new Map(),      // 类型索引
            byTime: [],             // 时间索引（排序数组）
            byCommunity: new Map(), // 社区索引
            byName: new Map()       // 名称索引
        };
        
        this.buildIndexes();
    }
    
    // 构建所有索引
    buildIndexes() {
        const startTime = performance.now();
        
        // 类型索引
        this.indexes.byType.clear();
        for (const [id, node] of this.graph.nodes) {
            const type = node.type || 'unknown';
            if (!this.indexes.byType.has(type)) {
                this.indexes.byType.set(type, new Set());
            }
            this.indexes.byType.get(type).add(id);
        }
        
        // 时间索引
        this.indexes.byTime = Array.from(this.graph.nodes.values())
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        // 名称索引（用于快速查找）
        this.indexes.byName.clear();
        for (const [id, node] of this.graph.nodes) {
            if (node.name) {
                const key = node.name.toLowerCase();
                if (!this.indexes.byName.has(key)) {
                    this.indexes.byName.set(key, []);
                }
                this.indexes.byName.get(key).push(id);
            }
        }
        
        const elapsed = performance.now() - startTime;
        console.log(`[Indexer] Indexes built in ${elapsed.toFixed(2)}ms`);
    }
    
    // 按类型查询（O(1)）
    queryByType(type) {
        const ids = this.indexes.byType.get(type);
        if (!ids) return [];
        return Array.from(ids).map(id => this.graph.nodes.get(id));
    }
    
    // 按时间范围查询（二分查找）
    queryByTimeRange(startTime, endTime) {
        const start = this.binarySearch(this.indexes.byTime, startTime, true);
        const end = this.binarySearch(this.indexes.byTime, endTime, false);
        
        return this.indexes.byTime.slice(start, end + 1);
    }
    
    // 按名称查询（O(1)）
    queryByName(name) {
        const key = name.toLowerCase();
        const ids = this.indexes.byName.get(key);
        if (!ids) return [];
        return ids.map(id => this.graph.nodes.get(id));
    }
    
    // 组合查询（类型 + 时间）
    queryByTypeAndTime(type, startTime, endTime) {
        const typeNodes = this.queryByType(type);
        return typeNodes.filter(node => {
            const t = node.timestamp || 0;
            return t >= startTime && t <= endTime;
        });
    }
    
    // 二分查找
    binarySearch(arr, target, findFirst) {
        let left = 0;
        let right = arr.length - 1;
        let result = findFirst ? arr.length : -1;
        
        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const value = arr[mid].timestamp || 0;
            
            if (value < target) {
                left = mid + 1;
            } else if (value > target) {
                right = mid - 1;
            } else {
                result = mid;
                if (findFirst) right = mid - 1;
                else left = mid + 1;
            }
        }
        
        return result;
    }
    
    // 增量更新索引
    updateIndex(node) {
        // 更新类型索引
        const type = node.type || 'unknown';
        if (!this.indexes.byType.has(type)) {
            this.indexes.byType.set(type, new Set());
        }
        this.indexes.byType.get(type).add(node.id);
        
        // 更新时间索引（插入排序）
        const insertIdx = this.indexes.byTime.findIndex(n => 
            (n.timestamp || 0) > (node.timestamp || 0)
        );
        if (insertIdx === -1) {
            this.indexes.byTime.push(node);
        } else {
            this.indexes.byTime.splice(insertIdx, 0, node);
        }
        
        // 更新名称索引
        if (node.name) {
            const key = node.name.toLowerCase();
            if (!this.indexes.byName.has(key)) {
                this.indexes.byName.set(key, []);
            }
            this.indexes.byName.get(key).push(node.id);
        }
    }
    
    // 获取索引统计
    getStats() {
        return {
            typeCount: this.indexes.byType.size,
            timeIndexSize: this.indexes.byTime.length,
            nameIndexSize: this.indexes.byName.size,
            types: Array.from(this.indexes.byType.keys())
        };
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WorkerManager, IncrementalPageRank, GraphIndexer };
} else {
    window.WorkerManager = WorkerManager;
    window.IncrementalPageRank = IncrementalPageRank;
    window.GraphIndexer = GraphIndexer;
}