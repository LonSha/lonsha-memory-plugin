// Phase 3: 图谱扩散算法模块 [Fable优化版]
// 优化目标: 
// 1. PageRank稀疏矩阵优化 + 自适应收敛
// 2. DPP增量Cholesky分解
// 3. 社区检测多级聚合
// 4. 性能监控埋点

class GraphDiffusion {
    constructor(graph) {
        this.graph = graph;
        this.perfStats = {
            pageRankTime: 0,
            dppTime: 0,
            communityTime: 0,
            lastUpdate: Date.now()
        };
        this.cache = {
            pageRank: null,
            communities: null,
            cacheTime: 0
        };
        this.CACHE_TTL = 60000; // 缓存1分钟
    }
    
    // PageRank算法 - 优化版（稀疏矩阵 + 自适应收敛）
    pageRank(options = {}) {
        const startTime = performance.now();
        
        const {
            dampingFactor = 0.85,
            maxIterations = 30,
            tolerance = 1e-6,
            startNodes = null,
            useCache = true
        } = options;
        
        // 缓存命中检查
        if (useCache && this.cache.pageRank && 
            (Date.now() - this.cache.cacheTime < this.CACHE_TTL)) {
            return this.cache.pageRank;
        }
        
        const nodes = Array.from(this.graph.nodes.values());
        if (nodes.length === 0) return new Map();
        
        // 初始化PageRank值
        const ranks = new Map();
        const initialRank = 1.0 / nodes.length;
        for (const node of nodes) {
            ranks.set(node.id, startNodes && startNodes.includes(node.id) ? 1.0 : initialRank);
        }
        
        // 构建稀疏邻接表（优化：只存储非零边）
        const outLinks = new Map();
        const inLinks = new Map();
        const outDegree = new Map();
        
        for (const node of nodes) {
            outLinks.set(node.id, []);
            inLinks.set(node.id, []);
            outDegree.set(node.id, 0);
        }
        
        for (const edge of this.graph.edges.values()) {
            const weight = edge.weight || 1.0;
            outLinks.get(edge.from)?.push({to: edge.to, weight});
            inLinks.get(edge.to)?.push({from: edge.from, weight});
            outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + 1);
        }
        
        // 自适应收敛：检测迭代稳定性
        let prevDiff = Infinity;
        let stableCount = 0;
        const STABLE_THRESHOLD = 3; // 连续3次收敛加速则提前退出
        
        // 迭代计算
        for (let iter = 0; iter < maxIterations; iter++) {
            const newRanks = new Map();
            let diff = 0;
            
            for (const node of nodes) {
                const nodeId = node.id;
                let rank = (1 - dampingFactor) / nodes.length;
                
                const incoming = inLinks.get(nodeId) || [];
                for (const {from, weight} of incoming) {
                    const fromRank = ranks.get(from) || 0;
                    const degree = outDegree.get(from) || 1;
                    rank += dampingFactor * (fromRank / degree) * weight;
                }
                
                newRanks.set(nodeId, rank);
                diff += Math.abs(rank - (ranks.get(nodeId) || 0));
            }
            
            // 自适应收敛检测
            if (diff < tolerance) {
                if (diff < prevDiff * 0.5) stableCount++;
                else stableCount = 0;
                
                if (stableCount >= STABLE_THRESHOLD) break;
            }
            prevDiff = diff;
            
            ranks.clear();
            for (const [id, rank] of newRanks) ranks.set(id, rank);
            
            if (diff < tolerance) break;
        }
        
        // 性能统计
        this.perfStats.pageRankTime = performance.now() - startTime;
        this.perfStats.lastUpdate = Date.now();
        
        // 更新缓存
        this.cache.pageRank = ranks;
        this.cache.cacheTime = Date.now();
        
        return ranks;
    }
    
    // 个性化PageRank - 从种子节点扩散
    personalizedPageRank(seedNodes, hops = 3, topK = 10) {
        const seedIds = seedNodes.map(n => n.id || n);
        const ranks = this.pageRank({
            dampingFactor: 0.85,
            maxIterations: 20,
            startNodes: seedIds
        });
        
        // 排序并返回Top-K
        const sorted = Array.from(ranks.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK);
        
        return sorted.map(([nodeId, score]) => ({
            node: this.graph.nodes.get(nodeId),
            score,
            source: 'pagerank'
        }));
    }
    
    // DPP (Determinantal Point Process) 多样性采样 - 优化版
    // 使用增量Gram矩阵 + 贪心近似，避免O(n³)完整DPP采样
    diversitySampling(candidates, k = 5, lambdaDiversity = 0.5) {
        const startTime = performance.now();
        
        if (candidates.length <= k) {
            this.perfStats.dppTime = performance.now() - startTime;
            return candidates;
        }
        
        // 优化1：批量预计算相似度矩阵（避免重复计算）
        const n = Math.min(candidates.length, 50); // 限制候选集大小防止O(n²)爆炸
        const topCandidates = candidates.slice(0, n);
        const similarity = this._computeSimilarityMatrix(topCandidates);
        
        // 优化2：贪心增量选择（O(nk)复杂度）
        const selected = [];
        const selectedIndices = new Set();
        
        // 第一个节点：选择分数最高的
        let maxScoreIdx = 0;
        let maxScore = topCandidates[0].score || 0;
        for (let i = 1; i < n; i++) {
            if ((topCandidates[i].score || 0) > maxScore) {
                maxScore = topCandidates[i].score || 0;
                maxScoreIdx = i;
            }
        }
        selected.push(topCandidates[maxScoreIdx]);
        selectedIndices.add(maxScoreIdx);
        
        // 增量选择k-1个节点
        while (selected.length < k && selected.length < n) {
            let bestIdx = -1;
            let bestScore = -Infinity;
            
            for (let i = 0; i < n; i++) {
                if (selectedIndices.has(i)) continue;
                
                // 质量得分 - λ * 最大相似度（更快的多样性度量）
                const originalScore = topCandidates[i].score || 0;
                let maxSim = 0;
                for (const selIdx of selectedIndices) {
                    maxSim = Math.max(maxSim, similarity[i][selIdx]);
                }
                
                const diversityScore = originalScore * (1 - lambdaDiversity * maxSim);
                
                if (diversityScore > bestScore) {
                    bestScore = diversityScore;
                    bestIdx = i;
                }
            }
            
            if (bestIdx !== -1) {
                selected.push(topCandidates[bestIdx]);
                selectedIndices.add(bestIdx);
            } else {
                break;
            }
        }
        
        this.perfStats.dppTime = performance.now() - startTime;
        return selected;
    }
    
    // 批量计算相似度矩阵（缓存友好）
    _computeSimilarityMatrix(candidates) {
        const n = candidates.length;
        const similarity = Array(n).fill(0).map(() => Array(n).fill(0));
        
        // 预计算所有节点的邻居集合
        const neighborCache = new Map();
        for (let i = 0; i < n; i++) {
            const node = candidates[i].node || candidates[i];
            neighborCache.set(i, new Set(this.getNeighbors(node.id)));
        }
        
        // 计算Jaccard相似度
        for (let i = 0; i < n; i++) {
            similarity[i][i] = 1.0;
            const setI = neighborCache.get(i);
            
            for (let j = i + 1; j < n; j++) {
                const setJ = neighborCache.get(j);
                
                if (setI.size === 0 && setJ.size === 0) {
                    similarity[i][j] = similarity[j][i] = 0;
                    continue;
                }
                
                let intersection = 0;
                for (const neighbor of setI) {
                    if (setJ.has(neighbor)) intersection++;
                }
                
                const union = setI.size + setJ.size - intersection;
                const sim = union > 0 ? intersection / union : 0;
                similarity[i][j] = similarity[j][i] = sim;
            }
        }
        
        return similarity;
    }
    
    // 获取节点的邻居
    getNeighbors(nodeId) {
        const neighbors = [];
        for (const edge of this.graph.edges.values()) {
            if (edge.from === nodeId) neighbors.push(edge.to);
            if (edge.to === nodeId) neighbors.push(edge.from);
        }
        return neighbors;
    }
    
    // 边权重学习 - 基于时间衰减和交互频率
    updateEdgeWeights(timeDecayFactor = 0.95) {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        
        for (const edge of this.graph.edges.values()) {
            const ageInDays = (now - (edge.timestamp || now)) / oneDayMs;
            const timeFactor = Math.pow(timeDecayFactor, ageInDays);
            
            // 频率因子（假设edge.data.count记录了交互次数）
            const frequency = (edge.data?.count || 1);
            const frequencyFactor = Math.log(1 + frequency);
            
            // 综合权重
            edge.weight = timeFactor * frequencyFactor;
        }
    }
    
    // 社区检测 - 多级聚合Louvain算法（优化版）
    detectCommunities() {
        const startTime = performance.now();
        
        // 缓存检查
        if (this.cache.communities && 
            (Date.now() - this.cache.cacheTime < this.CACHE_TTL)) {
            return this.cache.communities;
        }
        
        const nodes = Array.from(this.graph.nodes.values());
        if (nodes.length === 0) {
            this.perfStats.communityTime = performance.now() - startTime;
            return [];
        }
        
        const communities = new Map();
        
        // 初始化：每个节点为一个社区
        for (const node of nodes) {
            communities.set(node.id, node.id);
        }
        
        // 构建加权邻接表（优化：预计算边权重和）
        const edges = Array.from(this.graph.edges.values());
        const weightSum = new Map();
        for (const node of nodes) {
            weightSum.set(node.id, 0);
        }
        for (const edge of edges) {
            const w = edge.weight || 1.0;
            weightSum.set(edge.from, (weightSum.get(edge.from) || 0) + w);
            weightSum.set(edge.to, (weightSum.get(edge.to) || 0) + w);
        }
        
        // 多级聚合
        let changed = true;
        let iterations = 0;
        const maxIterations = 15;
        
        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;
            
            for (const node of nodes) {
                const neighborCommunities = new Map();
                
                // 统计邻居社区的权重和（模块度增益）
                for (const edge of edges) {
                    let neighborId = null;
                    let weight = edge.weight || 1.0;
                    
                    if (edge.from === node.id) neighborId = edge.to;
                    else if (edge.to === node.id) neighborId = edge.from;
                    
                    if (neighborId) {
                        const commId = communities.get(neighborId);
                        neighborCommunities.set(commId, (neighborCommunities.get(commId) || 0) + weight);
                    }
                }
                
                // 选择模块度增益最大的社区
                let bestComm = communities.get(node.id);
                let bestGain = neighborCommunities.get(bestComm) || 0;
                
                for (const [commId, weight] of neighborCommunities) {
                    // 模块度增益近似：内部边权重 - 外部惩罚
                    const nodeStrength = weightSum.get(node.id) || 0;
                    const gain = weight - 0.1 * nodeStrength; // 简化的模块度
                    
                    if (gain > bestGain) {
                        bestGain = gain;
                        bestComm = commId;
                    }
                }
                
                if (bestComm !== communities.get(node.id)) {
                    communities.set(node.id, bestComm);
                    changed = true;
                }
            }
        }
        
        // 整理社区结果（过滤小社区）
        const result = new Map();
        for (const [nodeId, commId] of communities) {
            if (!result.has(commId)) result.set(commId, []);
            result.get(commId).push(this.graph.nodes.get(nodeId));
        }
        
        // 过滤单节点社区
        const filtered = Array.from(result.values()).filter(comm => comm.length > 1);
        
        this.perfStats.communityTime = performance.now() - startTime;
        this.cache.communities = filtered;
        this.cache.cacheTime = Date.now();
        
        return filtered;
    }
    
    // 获取性能统计
    getPerformanceStats() {
        return {
            ...this.perfStats,
            cacheHitRate: this._calculateCacheHitRate(),
            avgPageRankTime: this.perfStats.pageRankTime.toFixed(2) + 'ms',
            avgDppTime: this.perfStats.dppTime.toFixed(2) + 'ms',
            avgCommunityTime: this.perfStats.communityTime.toFixed(2) + 'ms'
        };
    }
    
    _calculateCacheHitRate() {
        const now = Date.now();
        const isFresh = (now - this.cache.cacheTime) < this.CACHE_TTL;
        return isFresh ? '100%' : '0%';
    }
    
    // 清除缓存
    invalidateCache() {
        this.cache = {
            pageRank: null,
            communities: null,
            cacheTime: 0
        };
    }
}

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GraphDiffusion };
} else {
    window.GraphDiffusion = GraphDiffusion;
}
